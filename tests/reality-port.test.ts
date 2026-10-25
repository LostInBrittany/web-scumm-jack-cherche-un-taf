// The transport's edges (4.1.8): what `tests/reality-cursor.test.ts` leaves open in `http-port.ts`, found by the reality
// mutation set. The parser's limits exactly at the limit, a `data:` with no space, an event without `id`, a multi-byte
// character split across two chunks; the loop's refusals (a 500 whose body looks like signals), a Bridge without
// `sequences` or `id`, the backoff that only grows while something handed over stays unsettled, the stream the port
// ends itself (reconnected at once, never aborted after the Bridge ended it), and the acknowledgement's cursor. Each
// test names the mutant it kills.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpPort, type PortCursors, sseEvents } from '@engine/reality/http-port';

interface FakeOptions {
  /** The stream stays open until the reader aborts it (as the real Bridge does), instead of ending after its signals. */
  streamStaysOpen?: boolean;
  /** A 4.1.1 Bridge: the poll's answer has no `sequences`. */
  withoutSequences?: boolean;
  /** The stream's events carry no `id:`. */
  withoutIds?: boolean;
  /** The first signal's sequence (default 1). */
  from?: number;
  /** Answers the n-th read request (1-based) in the Bridge's place: a refusal, a stream of nonsense. */
  answer?: (n: number) => Response | undefined;
  /** The acknowledgement's status (default 204). */
  ackStatus?: number;
}

/** A Bridge of `n` signals, `s<sequence>`, with every request's `after`, every URL, and the requests whose signal aborted. */
function fakeBridge(n: number, o: FakeOptions = {}) {
  const asked: { route: string; after: number }[] = [];
  const urls: string[] = [];
  const acked: number[] = [];
  /** The read requests (1-based) whose `signal` was aborted. */
  const aborted: number[] = [];
  const from = o.from ?? 1;
  const all = Array.from({ length: n }, (_, i) => ({ sequence: from + i, jws: `s${from + i}` }));
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    urls.push(String(input));
    const url = new URL(String(input));
    if (url.pathname.endsWith('/v1/ack')) {
      acked.push((JSON.parse(String(init?.body)) as { through: number }).through);
      return new Response(null, { status: o.ackStatus ?? 204 });
    }
    const after = Number(url.searchParams.get('after') ?? 0);
    const pending = all.filter((s) => s.sequence > after);
    const route = url.pathname.endsWith('/v1/signals')
      ? 'signals'
      : url.pathname.endsWith('/v1/events')
        ? 'events'
        : '';
    if (!route) return new Response('not found', { status: 404 });
    asked.push({ route, after });
    const request = asked.length;
    init?.signal?.addEventListener('abort', () => aborted.push(request), { once: true });
    const forced = o.answer?.(request);
    if (forced) return forced;
    if (route === 'signals') {
      const signals = pending.map((s) => s.jws);
      return Response.json(o.withoutSequences ? { signals } : { signals, sequences: pending.map((s) => s.sequence) });
    }
    const frames = pending.map((s) => `${o.withoutIds ? '' : `id: ${s.sequence}\n`}event: signal\ndata: ${s.jws}\n\n`);
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const x of frames) c.enqueue(new TextEncoder().encode(x));
        if (!o.streamStaysOpen) c.close();
        else
          init?.signal?.addEventListener(
            'abort',
            () => {
              try {
                c.close();
              } catch {
                // Already closed.
              }
            },
            { once: true },
          );
      },
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }) as typeof globalThis.fetch;
  return { asked, urls, acked, aborted, fetch };
}

type Status = 'connecting' | 'open' | 'retrying' | 'closed';

/** A port on the fake with the two diagnostic callbacks recorded. */
function portOn(bridge: ReturnType<typeof fakeBridge>, o: { mode?: 'poll' | 'sse'; retryMs?: number; url?: string }) {
  const statuses: Status[] = [];
  const cursors: PortCursors[] = [];
  const port = httpPort({
    url: o.url ?? 'http://bridge.test/',
    capability: 'cap',
    fetch: bridge.fetch,
    mode: o.mode,
    retryMs: o.retryMs ?? 5,
    onStatus: (s) => statuses.push(s),
    onCursors: (c) => cursors.push(c),
  });
  return { port, statuses, cursors };
}

/** Reads the port in the background; `onSignal` may acknowledge or abort. Never breaks out of the loop. */
function read(
  port: ReturnType<typeof httpPort>,
  ctrl: AbortController,
  after: number,
  onSignal?: (got: string[]) => Promise<void> | void,
) {
  const got: string[] = [];
  const done = (async () => {
    for await (const jws of port.connect({ gameId: 'signals', playerId: 'p', after, signal: ctrl.signal })) {
      got.push(jws);
      await onSignal?.(got);
    }
  })();
  return { got, done };
}

/** Waits (at most 800 × 5 ms, real timers: four seconds, for a loaded runner) until `until()` holds. */
async function until(cond: () => boolean) {
  for (let i = 0; i < 800 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
}

/** With fake timers: lets the promise chains settle (the fake's fetch, the stream's reads), by real macrotasks. */
async function flush() {
  for (let i = 0; i < 10; i++) await new Promise<void>((r) => setImmediate(r));
}

const chunked = (chunks: (string | Uint8Array)[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const x of chunks) c.enqueue(typeof x === 'string' ? new TextEncoder().encode(x) : x);
      c.close();
    },
  });

async function parsed(chunks: (string | Uint8Array)[], o?: { maxFrameBytes?: number; maxBufferBytes?: number }) {
  const out: { id?: string; data: string }[] = [];
  for await (const e of sseEvents(chunked(chunks), o)) out.push(e);
  return out;
}

describe('the SSE parser at its edges', () => {
  // kills http-port.ts:66 >= → >
  it('an empty event at the very start of the buffer is consumed, not left in front of everything after it', async () => {
    expect(await parsed(['\n\ndata: a\n\n'])).toEqual([{ data: 'a' }]);
  });

  // kills http-port.ts:69 > → >=
  it('an event of exactly maxFrameBytes passes; one more byte is over the limit', async () => {
    const atLimit = `data: ${'x'.repeat(44)}`;
    expect(atLimit.length).toBe(50);
    expect(await parsed([`${atLimit}\n\n`], { maxFrameBytes: 50 })).toEqual([{ data: 'x'.repeat(44) }]);
    await expect(parsed([`${atLimit}x\n\n`], { maxFrameBytes: 50 })).rejects.toThrow(/over the limit/);
  });

  // kills http-port.ts:94 > → >=
  it('exactly maxBufferBytes held without an event end is fine; one more byte is too much', async () => {
    expect(await parsed(['x'.repeat(50)], { maxBufferBytes: 50 })).toEqual([]);
    await expect(parsed(['x'.repeat(51)], { maxBufferBytes: 50 })).rejects.toThrow(/without an event's end/);
  });

  // kills http-port.ts:74 condition true: line.startsWith('data: ') → true
  it('`data:` with no space keeps the whole text (only one leading space is removed)', async () => {
    expect(await parsed(['data:xy\n\n'])).toEqual([{ data: 'xy' }]);
    expect(await parsed(['data: xy\n\n'])).toEqual([{ data: 'xy' }]);
  });

  // kills http-port.ts:76 condition true: data.length → true
  it('an event with an id and no data line yields nothing', async () => {
    expect(await parsed(['id: 5\n\nid: 6\ndata: a\n\n'])).toEqual([{ id: '6', data: 'a' }]);
  });

  // kills http-port.ts:76 condition true: id !== undefined → true
  it('an event without id has no `id` key at all', async () => {
    const out = await parsed(['data: a\n\n']);
    expect(out).toHaveLength(1);
    expect(Object.hasOwn(out[0]!, 'id')).toBe(false);
    expect(Object.keys(out[0]!)).toEqual(['data']);
  });

  // kills http-port.ts:89 boolean: { stream: true } → { stream: false }
  it('a multi-byte character split across two chunks is decoded whole', async () => {
    // 'é' is C3 A9: the first byte ends chunk 1, the second starts chunk 2.
    const first = new Uint8Array([...new TextEncoder().encode('data: '), 0xc3]);
    const second = new Uint8Array([0xa9, ...new TextEncoder().encode('\n\n')]);
    expect(await parsed([first, second])).toEqual([{ data: 'é' }]);
  });
});

describe('the port options', () => {
  // kills http-port.ts:107 condition true: o.url.endsWith('/') → true
  it('a base URL without a trailing slash gets one before the route', async () => {
    const b = fakeBridge(0);
    const { port } = portOn(b, { mode: 'poll', url: 'http://bridge.test' });
    const ctrl = new AbortController();
    const { done } = read(port, ctrl, 0);
    await until(() => b.urls.length >= 1);
    ctrl.abort();
    await port.close();
    await done;
    expect(b.urls[0]).toBe('http://bridge.test/v1/signals?after=0');
    expect(b.asked[0]).toEqual({ route: 'signals', after: 0 });
  });

  it('the default mode is the stream', async () => {
    const b = fakeBridge(0, { streamStaysOpen: true });
    const { port } = portOn(b, {});
    const ctrl = new AbortController();
    const { done } = read(port, ctrl, 0);
    await until(() => b.asked.length >= 1);
    ctrl.abort();
    await port.close();
    await done;
    expect(b.asked[0]).toEqual({ route: 'events', after: 0 });
  });
});

describe('the connection loop', () => {
  // kills http-port.ts:139 && → ||
  it('a reader signal already aborted makes no request at all', async () => {
    const b = fakeBridge(1);
    const { port, statuses } = portOn(b, { mode: 'poll' });
    const ctrl = new AbortController();
    ctrl.abort();
    const { got, done } = read(port, ctrl, 0);
    await done;
    expect(got).toEqual([]);
    expect(b.asked).toEqual([]);
    expect(statuses).toEqual(['closed']);
    await port.close();
  });

  // kills http-port.ts:148 condition false: !r.ok → false; http-port.ts:198 condition true: → true
  it('polling: a refusal whose body looks like signals is retried, its body is never handed over', async () => {
    const b = fakeBridge(1, {
      answer: (n) => (n === 1 ? Response.json({ signals: ['bogus'], sequences: [1] }, { status: 500 }) : undefined),
    });
    const { port, statuses } = portOn(b, { mode: 'poll' });
    const ctrl = new AbortController();
    const { got, done } = read(port, ctrl, 0);
    await until(() => b.asked.length >= 2 && got.length >= 1);
    ctrl.abort();
    await port.close();
    await done;
    // The harness: the second request did arrive (a loop that gives up on the first error never makes it).
    expect(b.asked.length).toBeGreaterThanOrEqual(2);
    expect(got[0]).toBe('s1');
    expect(got).not.toContain('bogus');
    expect(statuses.slice(0, 3)).toEqual(['connecting', 'retrying', 'connecting']);
  });

  // kills http-port.ts:170 condition false: !r.ok || !r.body → false; http-port.ts:170 || → &&
  it('SSE: a refusal that carries a body is not read as a stream', async () => {
    const b = fakeBridge(1, {
      answer: (n) =>
        n === 1
          ? new Response('data: bogus\n\n', { status: 500, headers: { 'Content-Type': 'text/event-stream' } })
          : undefined,
    });
    const { port } = portOn(b, { mode: 'sse' });
    const ctrl = new AbortController();
    const { got, done } = read(port, ctrl, 0);
    await until(() => b.asked.length >= 2 && got.length >= 1);
    ctrl.abort();
    await port.close();
    await done;
    expect(b.asked.length).toBeGreaterThanOrEqual(2);
    expect(got[0]).toBe('s1');
    expect(got).not.toContain('bogus');
  });

  // kills http-port.ts:154 + → - (both)
  it('polling a Bridge without `sequences`: the cursors count from the request `after`, and do not drift on re-delivery', async () => {
    const b = fakeBridge(2, { withoutSequences: true });
    const { port, cursors } = portOn(b, { mode: 'poll' });
    const ctrl = new AbortController();
    // Nothing acknowledged: the second poll asks from 0 again and hands s1, s2 over again.
    const { got, done } = read(port, ctrl, 0, (got) => {
      if (got.length === 4) ctrl.abort();
    });
    await until(() => got.length >= 4);
    await port.close();
    await done;
    expect(got.slice(0, 4)).toEqual(['s1', 's2', 's1', 's2']);
    expect(cursors).toContainEqual({ received: 1, delivered: 1, durable: 0 });
    expect(cursors).toContainEqual({ received: 2, delivered: 2, durable: 0 });
    // The second delivery counts from the durable cursor 0 again: 1 and 2, not 3 and 4.
    expect(cursors.every((c) => c.received <= 2 && c.delivered <= 2)).toBe(true);
  });

  // kills http-port.ts:174 || → &&
  it('SSE: the event id is the sequence, whatever its rank in the stream', async () => {
    const b = fakeBridge(1, { from: 7 });
    const { port, cursors } = portOn(b, { mode: 'sse' });
    const ctrl = new AbortController();
    const { got, done } = read(port, ctrl, 0, () => ctrl.abort());
    await until(() => got.length >= 1);
    await port.close();
    await done;
    expect(got[0]).toBe('s7');
    expect(cursors).toContainEqual({ received: 7, delivered: 7, durable: 0 });
  });

  // kills http-port.ts:174 + → - (both)
  it('SSE events without id count from the request `after`', async () => {
    const b = fakeBridge(2, { withoutIds: true });
    const { port, cursors } = portOn(b, { mode: 'sse' });
    const ctrl = new AbortController();
    const { got, done } = read(port, ctrl, 0, (got) => {
      if (got.length === 2) ctrl.abort();
    });
    await until(() => got.length >= 2);
    await port.close();
    await done;
    expect(got.slice(0, 2)).toEqual(['s1', 's2']);
    expect(cursors).toContainEqual({ received: 1, delivered: 1, durable: 0 });
    expect(cursors).toContainEqual({ received: 2, delivered: 2, durable: 0 });
    expect(cursors.every((c) => c.received >= 0)).toBe(true);
  });

  // kills http-port.ts:201 || → &&
  it('the reader aborting between two signals ends the connection without a retry', async () => {
    const b = fakeBridge(1);
    const { port, statuses } = portOn(b, { mode: 'poll' });
    const ctrl = new AbortController();
    // Aborted while the generator is suspended at its yield: it resumes, finds the signal aborted, and stops.
    const { got, done } = read(port, ctrl, 0, () => ctrl.abort());
    await done;
    await port.close();
    expect(got).toEqual(['s1']);
    expect(b.asked).toHaveLength(1);
    expect(statuses).toEqual(['connecting', 'open', 'closed']);
  });
});

describe('the backoff and the stream the port ends (fake timers)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // kills http-port.ts:185 boolean: endedByPort = true → false; http-port.ts:207 condition true: !endedByPort → true
  it('SSE: a stream the port ended itself is reopened at once, without the sleep', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const b = fakeBridge(1, { streamStaysOpen: true });
    const { port } = portOn(b, { mode: 'sse', retryMs: 10 });
    const ctrl = new AbortController();
    const { got, done } = read(port, ctrl, 0);
    await flush();
    expect(got).toEqual(['s1']);
    expect(b.asked).toHaveLength(1);
    // s1 handed over and not settled when the reader came back: the port ends the stream after `wait` (10 ms)…
    await vi.advanceTimersByTimeAsync(10);
    await flush();
    expect(b.aborted).toEqual([1]);
    // …and reconnects right away: the wait doubled to 20 ms, but it was already spent before ending the stream.
    expect(b.asked).toHaveLength(2);
    expect(b.asked[1]).toEqual({ route: 'events', after: 0 });
    expect(got).toEqual(['s1', 's1']);
    // The second stream is ended after 20 ms and the third opens at once as well.
    await vi.advanceTimersByTimeAsync(20);
    await flush();
    expect(b.asked).toHaveLength(3);
    ctrl.abort();
    await port.close();
    await done;
  });

  // kills http-port.ts:203 && → ||; http-port.ts:203 > → >=; http-port.ts:204 condition true: stuck → true
  it('polling: a poll that hands nothing over does not back off', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const b = fakeBridge(0);
    const { port } = portOn(b, { mode: 'poll', retryMs: 10 });
    const ctrl = new AbortController();
    const { done } = read(port, ctrl, 0);
    await flush();
    expect(b.asked).toHaveLength(1);
    for (let k = 2; k <= 5; k++) {
      await vi.advanceTimersByTimeAsync(10);
      await flush();
      expect(b.asked).toHaveLength(k);
    }
    ctrl.abort();
    await port.close();
    await done;
  });

  // 4.4.0: each wait added an `abort` listener to the port's signal and never removed it when the wait ended on time:
  // a page polling once a second held some 86 000 more closures a day.
  it('polling: a wait that ends on time leaves no listener on the signal behind it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let net = 0;
    const add = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const remove = vi.spyOn(EventTarget.prototype, 'removeEventListener');
    const count = () => {
      net =
        add.mock.calls.filter(([t]) => t === 'abort').length - remove.mock.calls.filter(([t]) => t === 'abort').length;
      return net;
    };
    try {
      const b = fakeBridge(0);
      const { port } = portOn(b, { mode: 'poll', retryMs: 10 });
      const ctrl = new AbortController();
      const { done } = read(port, ctrl, 0);
      await flush();
      await vi.advanceTimersByTimeAsync(10);
      await flush();
      const early = count();
      const askedEarly = b.asked.length;
      for (let k = 0; k < 20; k++) {
        await vi.advanceTimersByTimeAsync(10);
        await flush();
      }
      expect(b.asked.length).toBeGreaterThan(20);
      // The fake Bridge leaves one listener per request on the request's own signal; the port's waits leave none.
      expect(count() - early).toBe(b.asked.length - askedEarly);
      ctrl.abort();
      await port.close();
      await done;
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  // kills http-port.ts:203 === → !==; http-port.ts:204 condition false: stuck → false; http-port.ts:204 condition true
  it('polling: a signal handed over and not settled doubles the wait; a poll that settles one resets it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const b = fakeBridge(1);
    const { port } = portOn(b, { mode: 'poll', retryMs: 10 });
    const ctrl = new AbortController();
    const { got, done } = read(port, ctrl, 0, async (got) => {
      // The third time s1 comes, the reader applies and acknowledges it.
      if (got.length === 3) await port.acknowledge({ playerId: 'p', through: 1 });
    });
    await flush();
    expect(got).toEqual(['s1']);
    expect(b.asked).toHaveLength(1);
    // Stuck: the wait is 20 ms, not 10.
    await vi.advanceTimersByTimeAsync(10);
    await flush();
    expect(b.asked).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10);
    await flush();
    expect(b.asked).toHaveLength(2);
    expect(got).toEqual(['s1', 's1']);
    // Still stuck: 40 ms.
    await vi.advanceTimersByTimeAsync(20);
    await flush();
    expect(b.asked).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(20);
    await flush();
    expect(b.asked).toHaveLength(3);
    expect(b.acked).toEqual([1]);
    // Settled during the third poll: back to 10 ms, and the next poll asks from 1.
    await vi.advanceTimersByTimeAsync(10);
    await flush();
    expect(b.asked).toHaveLength(4);
    expect(b.asked[3]).toEqual({ route: 'signals', after: 1 });
    ctrl.abort();
    await port.close();
    await done;
  });

  // kills http-port.ts:126 condition false: → false; http-port.ts:126 >= → >
  it('SSE: an acknowledgement from outside the loop settles the signal; the open stream is kept', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const b = fakeBridge(1, { streamStaysOpen: true });
    const { port, cursors } = portOn(b, { mode: 'sse', retryMs: 10 });
    const ctrl = new AbortController();
    const { got, done } = read(port, ctrl, 0);
    await flush();
    expect(got).toEqual(['s1']);
    // The reader came back for the next signal with s1 unsettled: the timer that ends the stream is armed (10 ms).
    // The game saves and acknowledges before it fires.
    await port.acknowledge({ playerId: 'p', through: 1 });
    expect(cursors.at(-1)).toEqual({ received: 1, delivered: 1, durable: 1 });
    await vi.advanceTimersByTimeAsync(10);
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    // Nothing ended the stream: one request, no abort, s1 once.
    expect(b.asked).toHaveLength(1);
    expect(b.aborted).toEqual([]);
    expect(got).toEqual(['s1']);
    ctrl.abort();
    await port.close();
    await done;
  });

  // kills http-port.ts:192 condition false: unsettled → false
  it('SSE: the timer is disarmed when the Bridge ends the stream first; it never aborts that stream later', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const b = fakeBridge(1);
    const { port } = portOn(b, { mode: 'sse', retryMs: 10 });
    const ctrl = new AbortController();
    const { got, done } = read(port, ctrl, 0);
    await flush();
    // s1 handed over, the timer armed when the reader came back, then the stream ended on the Bridge's side: the
    // port is now sleeping 20 ms (stuck). The timer, had it stayed armed, would fire at 10 ms on the ended stream.
    expect(got).toEqual(['s1']);
    expect(b.asked).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10);
    await flush();
    expect(b.aborted).toEqual([]);
    expect(b.asked).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10);
    await flush();
    expect(b.asked).toHaveLength(2);
    expect(b.aborted).toEqual([]);
    ctrl.abort();
    await port.close();
    await done;
  });
});

describe('the acknowledgement', () => {
  // kills http-port.ts:217 condition false: !r.ok → false
  it('a refused acknowledgement throws and moves no cursor', async () => {
    const b = fakeBridge(0, { ackStatus: 500 });
    const { port, cursors } = portOn(b, { mode: 'poll' });
    await expect(port.acknowledge({ playerId: 'p', through: 1 })).rejects.toThrow(/acknowledgement refused \(500\)/);
    expect(b.acked).toEqual([1]);
    expect(cursors).toEqual([]);
    await port.close();
  });

  // kills http-port.ts:218 condition true: through > cursors.durable → true; http-port.ts:218 > → >=
  it('an acknowledgement through a cursor not above durable changes nothing and reports nothing', async () => {
    const b = fakeBridge(0);
    const { port, cursors } = portOn(b, { mode: 'poll' });
    // Equal (a fresh port is at 0): nothing.
    await port.acknowledge({ playerId: 'p', through: 0 });
    expect(cursors).toEqual([]);
    await port.acknowledge({ playerId: 'p', through: 2 });
    expect(cursors).toEqual([{ received: 0, delivered: 0, durable: 2 }]);
    // Lower, then equal again: nothing.
    await port.acknowledge({ playerId: 'p', through: 1 });
    await port.acknowledge({ playerId: 'p', through: 2 });
    expect(cursors).toEqual([{ received: 0, delivered: 0, durable: 2 }]);
    // The Bridge was told each time all the same (it is the Bridge's cursor too).
    expect(b.acked).toEqual([0, 2, 1, 2]);
    await port.close();
  });
});
