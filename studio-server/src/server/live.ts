// What a shared Studio sees live (4.2.1, plan §5, P7): who is here, and an SSE stream of what changes.
//   - Presence: kept in memory, renewed by the HTTP heartbeat (`POST /api/presence`, every 30 s), gone after 60 s.
//   - `GET /api/events`: a `hello` with the epoch, the revision, the leases and who is here; then `revision` after each
//     committed operation (id, revision, author, files, spans), `leases` and `presence` when they change, `job` at each
//     state of a prepare or a cut (4.2.3: `queued`, `running` with its steps, `done`, `failed`, `cancelled`), and a ping
//     every 15 s. Events are sent at least once, after the commit; a client that missed some reads `GET /api/ops`.
//   - A stream closes (plan §3.6) on a revocation of its user or the end of its session, within 5 s: at once on the
//     revocation bus, at the end of its Bearer token, and by a check of its credential every 30 s, which also catches
//     a demotion below reviewer. The client reconnects with a fresh credential.
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Confirmed, Journal } from '../ops/journal';
import { spansOf } from '../ops/spans';
import type { Gate, Principal } from './auth/gate';
import type { Leases } from './leases';
import type { Health, HealthState } from './health';
import type { PreviewState, Previews } from './previews';
import type { JobInfo, Jobs } from './jobs';

export interface Here {
  userId: string;
  name: string;
  /** What they look at (a room, a span), as the client says. */
  where?: string;
  at: number;
}

export class Presence {
  /** `changed` (): someone came, moved or left. */
  readonly events = new EventEmitter();
  private here = new Map<string, Here>();
  private timer: NodeJS.Timeout;

  constructor(
    private ttlMs = 60_000,
    private now: () => number = Date.now,
  ) {
    this.events.setMaxListeners(0);
    this.timer = setInterval(() => this.sweep(), 15_000);
    this.timer.unref();
  }

  beat(userId: string, name: string, where?: string): void {
    const prev = this.here.get(userId);
    this.here.set(userId, { userId, name, where, at: this.now() });
    if (!prev || prev.where !== where) this.events.emit('changed');
  }

  leave(userId: string): void {
    if (this.here.delete(userId)) this.events.emit('changed');
  }

  list(): Here[] {
    this.sweep();
    return [...this.here.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private sweep(): void {
    const now = this.now();
    let gone = false;
    for (const [k, h] of this.here) if (now - h.at > this.ttlMs) gone = this.here.delete(k) || gone;
    if (gone) this.events.emit('changed');
  }

  stop(): void {
    clearInterval(this.timer);
  }
}

const spansOrNone = (paths: string[]) => {
  try {
    return spansOf(paths);
  } catch {
    return [];
  }
};

export interface LiveEvent {
  name: 'revision' | 'leases' | 'presence' | 'preview' | 'health' | 'job';
  data: unknown;
}

/**
 * What every stream is told, computed once for all of them: a revision as it commits; the leases after a lease
 * changed or a write claimed some (one read at a time, coalesced, in order, numbered by `seq`); who is here. A
 * failed read of the leases is logged and tried again at the next change, never thrown.
 */
export class LiveHub {
  /** `event` (LiveEvent). */
  readonly events = new EventEmitter();
  private seq = 0;
  private reading = false;
  private again = false;

  constructor(
    private o: {
      journal: Journal;
      leases?: Leases;
      presence?: Presence;
      /** The revisions' previews (4.2.2): where the game's frames are, and whether a newer one is coming. */
      previews?: Previews;
      /** The game's health by revision (4.2.2): the last verdict, the revision that broke it, a run going on. */
      health?: Health;
      /** The long jobs (4.2.3, H8): each state and step of a prepare or a cut, in order. */
      jobs?: Jobs;
      log?: (line: Record<string, unknown>) => void;
    },
  ) {
    this.events.setMaxListeners(0);
    o.journal.events.on('confirmed', (c: Confirmed) => {
      this.emit({ name: 'revision', data: { ...c, spans: spansOrNone(c.paths) } });
      // A write claims spans in its own transaction: the leases are read again after each revision.
      this.refreshLeases();
    });
    o.leases?.events.on('changed', () => this.refreshLeases());
    o.presence?.events.on('changed', () => this.emit({ name: 'presence', data: { here: o.presence!.list() } }));
    o.previews?.events.on('changed', (s: PreviewState) => this.emit({ name: 'preview', data: s }));
    o.health?.events.on('changed', (s: HealthState) => this.emit({ name: 'health', data: s }));
    o.jobs?.events.on('changed', (j: JobInfo) => this.emit({ name: 'job', data: j }));
  }

  private emit(e: LiveEvent) {
    this.events.emit('event', e);
  }

  private refreshLeases() {
    if (!this.o.leases) return;
    if (this.reading) {
      this.again = true;
      return;
    }
    this.reading = true;
    this.o.leases
      .list()
      .then(
        (leases) => this.emit({ name: 'leases', data: { seq: ++this.seq, leases } }),
        (e) => this.o.log?.({ event: 'leases-read-failed', message: String((e as Error).message).slice(0, 200) }),
      )
      .finally(() => {
        this.reading = false;
        if (this.again) {
          this.again = false;
          this.refreshLeases();
        }
      });
  }

  /** What a new stream starts from. */
  async hello() {
    // The sequence number before the read: a refresh that ends meanwhile comes after, with a greater number, and is
    // kept by the client; read after, it would be the same number as a newer list and dropped.
    const seq = this.seq;
    return {
      epoch: await this.o.journal.epoch(),
      revision: await this.o.journal.revision(),
      leases: this.o.leases ? await this.o.leases.list() : [],
      seq,
      here: this.o.presence ? this.o.presence.list() : [],
      preview: this.o.previews ? this.o.previews.state() : null,
      health: this.o.health ? this.o.health.state() : null,
      jobs: this.o.jobs ? this.o.jobs.active() : [],
    };
  }
}

/** A stream that cannot keep up (1 MiB waiting) is closed: its client reconnects and reads what it missed. */
const MAX_PENDING = 1024 * 1024;

/** Serves one SSE stream until its client leaves or its credential ends. */
export async function serveEvents(
  req: IncomingMessage,
  res: ServerResponse,
  o: { principal?: Principal; gate?: Gate; hub: LiveHub; recheckMs?: number },
): Promise<void> {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    'x-accel-buffering': 'no',
    'x-content-type-options': 'nosniff',
  });
  const p = o.principal;
  const cleanups: (() => void)[] = [];
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    for (const c of cleanups) c();
    res.end();
  };
  const write = (chunk: string) => {
    if (closed || res.writableEnded) return;
    if (res.writableLength > MAX_PENDING) return close();
    res.write(chunk);
  };
  const event = (name: string, data: unknown) => write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  req.on('close', close);

  // `hello` goes first: what happens meanwhile waits behind it, in order.
  let started = false;
  const waiting: LiveEvent[] = [];
  const onEvent = (e: LiveEvent) => (started ? event(e.name, e.data) : waiting.push(e));
  o.hub.events.on('event', onEvent);
  cleanups.push(() => o.hub.events.off('event', onEvent));

  if (p && o.gate) {
    const gate = o.gate;
    const onRevoked = (ids: string[]) => ids.includes(p.user.id) && close();
    const onEnded = (ids: string[]) => !!p.session && ids.includes(p.session.idHash) && close();
    gate.revocations.on('revoked', onRevoked);
    gate.revocations.on('session-ended', onEnded);
    cleanups.push(() => gate.revocations.off('revoked', onRevoked));
    cleanups.push(() => gate.revocations.off('session-ended', onEnded));
    // The credential's end: a Bearer's `exp`, a session's absolute expiry.
    if (p.expiresAt) {
      const t = setTimeout(close, Math.max(0, p.expiresAt - Date.now()));
      cleanups.push(() => clearTimeout(t));
    }
    // A check of the credential, which never moves the session's idle clock.
    const recheck = setInterval(() => {
      gate
        .authenticate(req, { checkOnly: true })
        .then((q) => {
          if (q.user.id !== p.user.id) close();
          else gate.require(q, 'reviewer');
        })
        .catch(() => close());
    }, o.recheckMs ?? 30_000);
    cleanups.push(() => clearInterval(recheck));
  }
  const ping = setInterval(() => write(': ping\n\n'), 15_000);
  cleanups.push(() => clearInterval(ping));

  try {
    event('hello', await o.hub.hello());
  } catch {
    return close();
  }
  started = true;
  for (const e of waiting.splice(0)) event(e.name, e.data);
}
