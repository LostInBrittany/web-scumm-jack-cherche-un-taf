// The spans' leases (4.2.1, plan P2, §5): who may write which part of the game, on the database's clock.
//   - A write claims every span it touches, all or none, without waiting, in a fixed order, inside the transaction
//     that logs its intent: a span another member holds refuses it (423, naming the holder). A free span, or one
//     whose lease ran out, becomes the writer's, with a greater fence.
//   - A member may also take spans ahead (to reserve a room), renew them by the presence heartbeat (TTL 120 s), and
//     release them. An owner may take a span over: logged in the audit, naming the previous holder.
//   - The exclusive lease `*` is granted only when no other member holds a span, and blocks every other claim while it
//     lasts. In 4.2.1 an owner takes it by hand for a whole-game change; the operations that will require it (ids,
//     migrations, preparing assets on a hosted Studio) come with them (4.2.2, 4.2.3).
//   - A claim is made in the intent's transaction: an operation that fails after it keeps its leases until their TTL.
//     A request made of several operations claims for each in turn, so an earlier one may commit before a later one
//     is refused.
//   - A client may send the fences it got (`x-studio-fences`): a write then refuses if its lease was taken over or
//     ran out and was taken again since, even by the same member in another tab.
// Each change is emitted (`changed`) after its commit, for the live events.
import { EventEmitter } from 'node:events';
import type { SqlDb, SqlQuery } from '../../../bridge/src/store-sql';
import { StudioError } from '../ops/errors';
import { EXCLUSIVE, spansOf } from '../ops/spans';

export interface Claimant {
  userId: string;
  name: string;
  /** The fences the client holds, by span: a lease taken again since is refused. */
  fences?: Record<string, number>;
}

export interface Lease {
  span: string;
  holder: string;
  holderName: string;
  fence: number;
  until: number;
}

/** A span another member holds: 423, with who holds it, so the client keeps its draft and says why. */
export class SpanLocked extends StudioError {
  readonly body: { span: string; holder: string; holderName: string; until: number };
  constructor(l: Lease, message?: string) {
    super(message ?? `${l.span} is being edited by ${l.holderName}`, 423);
    this.body = { span: l.span, holder: l.holder, holderName: l.holderName, until: l.until };
  }
}

const toLease = (r: Record<string, unknown>): Lease => ({
  span: String(r.span),
  holder: String(r.holder),
  holderName: String(r.holder_name),
  fence: Number(r.fence),
  until: Number(r.until_ms),
});

export class Leases {
  /** `changed` (): after a commit that took, renewed, released or took over a lease. */
  readonly events = new EventEmitter();
  readonly ttlMs: number;

  constructor(
    private db: SqlDb,
    o: { ttlMs?: number } = {},
  ) {
    this.ttlMs = o.ttlMs ?? 120_000;
    this.events.setMaxListeners(0);
  }

  private get clock(): string {
    return this.db.dialect === 'postgres'
      ? '(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT'
      : "CAST(unixepoch('subsec') * 1000 AS INTEGER)";
  }

  private async now(q: SqlQuery): Promise<number> {
    const [r] = await q.all(`SELECT ${this.clock} AS now`);
    return Number(r!.now);
  }

  /**
   * Claims `spans` for `who` inside `q`'s transaction: all or none, never waiting. Returns the fences held after it.
   * The journal calls it with the spans of an operation's files (`claimPaths`).
   */
  async claim(q: SqlQuery, who: Claimant, spans: string[]): Promise<Record<string, number>> {
    const { now, rows, want, live } = await this.refuseIfHeld(q, who, spans);
    const fences: Record<string, number> = {};
    for (const span of want) {
      const l = rows.get(span);
      const keep = live(l) && l!.holder === who.userId;
      const fence = keep ? l!.fence : (l?.fence ?? 0) + 1;
      fences[span] = fence;
      await q.run('DELETE FROM studio_spans WHERE span = $1', [span]);
      await q.run('INSERT INTO studio_spans (span, holder, holder_name, fence, until_ms) VALUES ($1, $2, $3, $4, $5)', [
        span,
        who.userId,
        who.name,
        fence,
        now + this.ttlMs,
      ]);
    }
    return fences;
  }

  /**
   * Whether `who` could claim `spans` now, without claiming them: the check before the guard, so that a member who
   * will be refused is told at once, not after the game was validated. The claim itself decides.
   */
  async check(who: Claimant, spans: string[]): Promise<void> {
    await this.db.tx('studio', (q) => this.refuseIfHeld(q, who, spans), { readOnly: true });
  }

  private async refuseIfHeld(q: SqlQuery, who: Claimant, spans: string[]) {
    const now = await this.now(q);
    const want = [...new Set(spans)].sort();
    const rows = new Map<string, Lease>();
    for (const r of await q.all('SELECT * FROM studio_spans')) rows.set(String(r.span), toLease(r));
    const live = (l: Lease | undefined) => !!l && l.until > now;
    const excl = rows.get(EXCLUSIVE);
    if (live(excl) && excl!.holder !== who.userId)
      throw new SpanLocked(excl!, `${excl!.holderName} has the whole game for now`);
    if (want.includes(EXCLUSIVE))
      for (const l of rows.values())
        if (l.span !== EXCLUSIVE && live(l) && l.holder !== who.userId) throw new SpanLocked(l);
    for (const span of want) {
      const l = rows.get(span);
      if (live(l) && l!.holder !== who.userId) throw new SpanLocked(l!);
      const known = who.fences?.[span];
      if (known !== undefined && (!l || l.fence !== known || !live(l)))
        throw new StudioError(`your lease on ${span} ended or was taken again: take it again`, 423);
    }
    return { now, rows, want, live };
  }

  /** The claim of an operation on these game files (the journal's hook). */
  claimPaths(q: SqlQuery, who: Claimant, paths: string[]): Promise<Record<string, number>> {
    return this.claim(q, who, spansOf(paths));
  }

  /** Takes spans ahead, as a write would. */
  async take(who: Claimant, spans: string[]): Promise<Record<string, number>> {
    const fences = await this.db.tx('studio', (q) => this.claim(q, who, spans));
    this.events.emit('changed');
    return fences;
  }

  /** The heartbeat: every live lease of `who` lasts another TTL. */
  async renew(userId: string): Promise<number> {
    const n = await this.db.tx('studio', async (q) => {
      const now = await this.now(q);
      return q.run('UPDATE studio_spans SET until_ms = $1 WHERE holder = $2 AND until_ms > $3', [
        now + this.ttlMs,
        userId,
        now,
      ]);
    });
    return n;
  }

  /** Releases spans of `who` (all of them without a list). */
  async release(userId: string, spans?: string[]): Promise<void> {
    await this.db.tx('studio', async (q) => {
      if (!spans) await q.run('UPDATE studio_spans SET until_ms = 0 WHERE holder = $1', [userId]);
      else
        for (const s of spans)
          await q.run('UPDATE studio_spans SET until_ms = 0 WHERE holder = $1 AND span = $2', [userId, s]);
    });
    this.events.emit('changed');
  }

  /** An owner takes `span` over, whoever holds it; returns the previous holder (for the audit). */
  async takeover(owner: Claimant, span: string): Promise<{ previous?: Lease; fence: number }> {
    const r = await this.db.tx('studio', async (q) => {
      const now = await this.now(q);
      const [row] = await q.all('SELECT * FROM studio_spans WHERE span = $1', [span]);
      const previous = row ? toLease(row) : undefined;
      const fence = (previous?.fence ?? 0) + 1;
      await q.run('DELETE FROM studio_spans WHERE span = $1', [span]);
      await q.run('INSERT INTO studio_spans (span, holder, holder_name, fence, until_ms) VALUES ($1, $2, $3, $4, $5)', [
        span,
        owner.userId,
        owner.name,
        fence,
        now + this.ttlMs,
      ]);
      return { previous: previous && previous.until > now ? previous : undefined, fence };
    });
    this.events.emit('changed');
    return r;
  }

  /** The live leases. */
  async list(): Promise<Lease[]> {
    return this.db.tx(
      'studio',
      async (q) => {
        const now = await this.now(q);
        return (await q.all('SELECT * FROM studio_spans WHERE until_ms > $1 ORDER BY span', [now])).map(toLease);
      },
      { readOnly: true },
    );
  }
}

/**
 * The project's exclusive lease (`*`) around a long operation of the member who asks (4.2.2 prepare, 4.2.3 the engine's
 * upgrade; without a claimant, `fn` alone): renewed every `everyMs` while it runs (the lease's TTL is 120 s), given back
 * by the last of the member's operations that took it (two of theirs at once never release each other's), and never
 * when the member held it before the first began.
 */
export function exclusiveRunner(
  leases: Pick<Leases, 'list' | 'take' | 'renew' | 'release'>,
  /** Who asks (the request's claimant), or undefined. */
  claimant: () => Claimant | undefined,
  o: { everyMs?: number; log?: (line: Record<string, unknown>) => void } = {},
) {
  const runs = new Map<string, { n: number; took: boolean }>();
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    const who = claimant();
    if (!who) return fn();
    let run = runs.get(who.userId);
    if (!run) {
      const had = (await leases.list()).some((l) => l.span === EXCLUSIVE && l.holder === who.userId);
      run = runs.get(who.userId) ?? { n: 0, took: !had };
      runs.set(who.userId, run);
    }
    run.n++;
    const renew = setInterval(() => {
      leases
        .renew(who.userId)
        .catch((e) => o.log?.({ event: 'lease-renew-failed', message: e instanceof Error ? e.message : String(e) }));
    }, o.everyMs ?? 30_000);
    renew.unref();
    try {
      if (run.took) await leases.take(who, [EXCLUSIVE]);
      return await fn();
    } finally {
      clearInterval(renew);
      if (--run.n === 0) {
        runs.delete(who.userId);
        if (run.took) await leases.release(who.userId, [EXCLUSIVE]);
      }
    }
  };
}
