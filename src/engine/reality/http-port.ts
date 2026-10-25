// The player's transport to a Reality Bridge (4.1.1, D17): Server-Sent Events read with fetch (so the capability
// travels in an Authorization header, never in a URL), and the same signals by a plain fetch by cursor when a stream
// is not possible. Acknowledgements are POSTs. A `WorldSignalPort`: the engine never sees the network.
//
// Three cursors (4.1.8, the P0 of the plan): `received` is the last sequence the Bridge sent, `delivered` the last one
// handed to the reader, `durable` the last one the reader acknowledged (applied and saved). Every request to the
// Bridge, a poll or a reconnection, asks from `durable`: a signal handed over and not acknowledged (a transient
// refusal, a save that failed, a crash before the ack) is delivered again, never skipped. 4.1.7 asked from the
// delivered cursor, so after signal 1 was handed over the connection asked `after=1` whether or not it was applied.
// In SSE mode the Bridge keeps the stream open: a signal not settled when the next one is read makes the port end the
// stream itself after a wait (doubling up to a minute) and reconnect from `durable`, which asks for it again.
import type { WorldSignalPort } from '../core/ports';

/**
 * How `httpPort` reaches a Bridge: its URL, the pairing's capability, the fetch to use, the retry delay and the mode.
 * @public
 */
export interface HttpPortOptions {
  /** The Bridge's base URL (`https://bridge.example/`). */
  url: string;
  /** The capability the pairing gave (read and acknowledge only). */
  capability: string;
  fetch?: typeof fetch;
  /** Milliseconds before reconnecting after the stream ends or fails (doubled up to a minute). */
  retryMs?: number;
  /** `poll`: a fetch by cursor every `retryMs` instead of a stream (tests, a proxy that buffers streams). */
  mode?: 'sse' | 'poll';
  onStatus?: (s: 'connecting' | 'open' | 'retrying' | 'closed') => void;
  /** The three cursors after each change (diagnostics, tests). */
  onCursors?: (c: PortCursors) => void;
  /** The largest SSE event accepted (bytes of text); beyond, the stream is dropped and reopened. Default 64 KiB. */
  maxFrameBytes?: number;
  /** The most text the SSE parser holds while waiting for an event's end. Default 1 MiB. */
  maxBufferBytes?: number;
}

export interface PortCursors {
  received: number;
  delivered: number;
  durable: number;
}

const MAX_WAIT_MS = 60_000;
const DEFAULT_FRAME_BYTES = 64 * 1024;
const DEFAULT_BUFFER_BYTES = 1024 * 1024;

// The listener goes when the wait ends either way (4.4.0): `once` removes it only after an abort, and the port's
// signal lives as long as the port, so each wait that ended on time left one more behind.
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((ok) => {
    const end = () => {
      clearTimeout(t);
      signal?.removeEventListener('abort', end);
      ok();
    };
    const t = setTimeout(end, ms);
    signal?.addEventListener('abort', end, { once: true });
  });

/**
 * Parses an SSE stream into events with their `id` and `data`. Lines end with LF, CRLF or CR (the specification's
 * three); one space after `data:` is removed, as it says, no more. An event over `maxFrameBytes`, or a wait over
 * `maxBufferBytes` without an event's end, ends the parse with an error: the port reopens the stream from `durable`.
 */
export async function* sseEvents(
  body: ReadableStream<Uint8Array>,
  o: { maxFrameBytes?: number; maxBufferBytes?: number } = {},
): AsyncGenerator<{ id?: string; data: string }> {
  const maxFrame = o.maxFrameBytes ?? DEFAULT_FRAME_BYTES;
  const maxBuffer = o.maxBufferBytes ?? DEFAULT_BUFFER_BYTES;
  const reader = body.getReader();
  const text = new TextDecoder();
  let buf = '';
  /** The complete events in `buf`, each ended by a blank line. */
  function* events(): Generator<{ id?: string; data: string }> {
    let cut: number;
    while ((cut = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      if (block.length > maxFrame) throw new Error(`Bridge: an event of ${block.length} bytes is over the limit`);
      let id: string | undefined;
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('id:')) id = line.slice(3).trim();
        else if (line.startsWith('data:')) data.push(line.startsWith('data: ') ? line.slice(6) : line.slice(5));
      }
      if (data.length) yield { ...(id !== undefined ? { id } : {}), data: data.join('\n') };
    }
  }
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        // The stream's end: a CR held back is a line end after all, and what it closes is delivered.
        buf = buf.replace(/\r/g, '\n');
        yield* events();
        return;
      }
      // CRLF and CR become LF; a CR that ends the chunk waits for the next one (it may be the first half of a CRLF).
      let t = (buf + text.decode(value, { stream: true })).replace(/\r\n/g, '\n');
      const carry = t.endsWith('\r') ? '\r' : '';
      t = (carry ? t.slice(0, -1) : t).replace(/\r/g, '\n');
      buf = t + carry;
      yield* events();
      if (buf.length > maxBuffer)
        throw new Error(`Bridge: event stream held ${buf.length} bytes without an event's end`);
    }
  } finally {
    // The stream is ended on our side too (a parser error, a reader that stopped): a dropped stream must not stay
    // open on the Bridge, where it counts towards `streamsPerPlayer`. A no-op when the stream is already done.
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/**
 * The transport to a Bridge, as a WorldSignalPort: Server-Sent Events read with fetch, or a fetch by cursor.
 * @public
 */
export function httpPort(o: HttpPortOptions): WorldSignalPort {
  const f = o.fetch ?? fetch;
  const base = o.url.endsWith('/') ? o.url : `${o.url}/`;
  const auth = { Authorization: `Bearer ${o.capability}` };
  let closed = false;
  const cursors: PortCursors = { received: 0, delivered: 0, durable: 0 };
  const moved = () => o.onCursors?.({ ...cursors });
  const handed = (sequence: number) => {
    cursors.received = Math.max(cursors.received, sequence);
    cursors.delivered = Math.max(cursors.delivered, sequence);
    moved();
  };
  /** `close()` aborts it: the sleep, a poll in flight and the stream all listen to it, with the reader's own signal. */
  const own = new AbortController();
  /** The stream being read (SSE), ended by the port itself when a signal it handed over is not settled in time. */
  let stream: AbortController | undefined;
  /** The timer that ends the stream while something handed over is not yet acknowledged. */
  let unsettled: ReturnType<typeof setTimeout> | undefined;
  /** Whether the port ended the stream itself (then it reconnects at once: the Bridge is fine, a signal is stuck). */
  let endedByPort = false;
  const settle = () => {
    if (unsettled && cursors.durable >= cursors.delivered) {
      clearTimeout(unsettled);
      unsettled = undefined;
    }
  };
  return {
    async *connect({ after, signal: readerSignal }) {
      const signal = readerSignal ? AbortSignal.any([readerSignal, own.signal]) : own.signal;
      cursors.durable = Math.max(cursors.durable, after);
      cursors.received = Math.max(cursors.received, after);
      cursors.delivered = Math.max(cursors.delivered, after);
      moved();
      let wait = o.retryMs ?? 1000;
      while (!closed && !signal.aborted) {
        o.onStatus?.('connecting');
        // What the reader settled before this request: a request that hands signals over and settles none backs off.
        const settledBefore = cursors.durable;
        let handedOver = 0;
        endedByPort = false;
        try {
          if (o.mode === 'poll') {
            const r = await f(`${base}v1/signals?after=${cursors.durable}`, { headers: auth, signal });
            if (!r.ok) throw new Error(`Bridge: ${r.status}`);
            // `sequences` (a 4.1.2 Bridge) says where each signal stands; a 4.1.1 Bridge sends them contiguous from
            // the cursor this request asked from.
            const { signals, sequences } = (await r.json()) as { signals: string[]; sequences?: number[] };
            o.onStatus?.('open');
            for (let i = 0; i < signals.length; i++) {
              handed(sequences?.[i] ?? settledBefore + i + 1);
              handedOver++;
              yield signals[i]!;
            }
          } else {
            stream = new AbortController();
            const onAbort = () => stream?.abort();
            signal.addEventListener('abort', onAbort, { once: true });
            try {
              // No `Last-Event-ID` header: a header beyond the simple ones makes the browser preflight the
              // cross-origin request, which a Bridge allowing `Authorization` and `Content-Type` refuses; `after`
              // in the query carries the durable cursor, which is what the Bridge reads.
              const r = await f(`${base}v1/events?after=${cursors.durable}`, {
                headers: { ...auth, Accept: 'text/event-stream' },
                signal: stream.signal,
              });
              if (!r.ok || !r.body) throw new Error(`Bridge: ${r.status}`);
              o.onStatus?.('open');
              let i = 0;
              for await (const e of sseEvents(r.body, o)) {
                const sequence = Number(e.id) || settledBefore + i + 1;
                i++;
                handed(sequence);
                handedOver++;
                yield e.data;
                // Something handed over and not settled when the reader comes back for the next one: a stream the
                // Bridge keeps open would never deliver it again. The port ends the stream itself after `wait`
                // (doubling while nothing settles) and reconnects from the durable cursor, which asks for it again.
                if (cursors.durable < cursors.delivered && !unsettled) {
                  const ended = stream;
                  unsettled = setTimeout(() => {
                    endedByPort = true;
                    ended?.abort();
                  }, wait);
                }
              }
            } finally {
              signal.removeEventListener('abort', onAbort);
              if (unsettled) clearTimeout(unsettled);
              unsettled = undefined;
              stream = undefined;
            }
          }
        } catch (e) {
          if (signal.aborted || closed) break;
          void e;
        }
        if (closed || signal.aborted) break;
        // Nothing settled out of what was handed over: the same signals come back; wait longer each time, up to a minute.
        const stuck = handedOver > 0 && cursors.durable === settledBefore;
        wait = stuck ? Math.min(wait * 2, MAX_WAIT_MS) : (o.retryMs ?? 1000);
        o.onStatus?.('retrying');
        // A stream the port ended itself already waited `wait` before ending it: the Bridge is fine, reconnect now.
        if (!endedByPort) await sleep(wait, signal);
      }
      o.onStatus?.('closed');
    },
    async acknowledge({ through }) {
      const r = await f(`${base}v1/ack`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ through }),
      });
      if (!r.ok) throw new Error(`Bridge: acknowledgement refused (${r.status})`);
      if (through > cursors.durable) {
        cursors.durable = through;
        moved();
        settle();
      }
    },
    async close() {
      closed = true;
      own.abort();
      stream?.abort();
    },
  };
}
