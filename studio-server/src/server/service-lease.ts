// The service lease (4.2.1, plan §4 and P8): one instance of the Studio Server serves a project's writes. A new
// instance (a Clever Cloud redeploy starts it while the old one still serves) waits for the lease; the old one gives
// it back on SIGTERM, or it expires (TTL 30 s, renewed every 10 s on the database's clock). An instance that cannot
// renew stops accepting writes by its own clock before the TTL can pass. The journal's per-operation lease, fenced,
// still guarantees that two instances never log an operation each over the same head.
//
// The handoff (4.2.3, the reference deployment): Clever Cloud keeps the old instance alive, renewing, for minutes after
// the new one is up, and it was never seen to get SIGTERM, so writes were refused for about 2.5 min at each deploy. A
// waiting instance now asks for the lease (row 2: who asks, when it first saw the database's clock, until when); the
// holder gives it back at its next renewal when the one asking started after it and asked within 5 s, and does not
// take it again first. An older instance never takes the lease from a newer one: two instances left side by side do not
// pass it back and forth. An asker that dies keeps the holder giving it back for 5 s at most.
import { randomUUID } from 'node:crypto';
import type { SqlDb } from '../../../bridge/src/store-sql';

/** An ask rewritten within this long is a live instance's. */
const ASK_FRESH_MS = 5_000;

export class ServiceLease {
  readonly instance = randomUUID();
  private fence = 0;
  /** Local deadline (monotonic): beyond it this instance writes nothing, whatever the database says. */
  private writableUntil = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  /** When this instance first read the database's clock: a newer instance asking for the lease is given it. */
  private born = 0;
  /** This try gives the lease back: if its answer is lost, the instance stops writing all the same. */
  private yielding = false;

  constructor(
    private db: SqlDb,
    private ttlMs = 30_000,
    private everyMs = 10_000,
  ) {}

  private get clock(): string {
    return this.db.dialect === 'postgres'
      ? '(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT'
      : "CAST(unixepoch('subsec') * 1000 AS INTEGER)";
  }

  /** Whether this instance may serve writes now. */
  get held(): boolean {
    return this.fence > 0 && performance.now() < this.writableUntil;
  }

  /** One try: takes the lease if it is free or expired, renews it if it is ours. */
  async tick(): Promise<boolean> {
    if (this.stopped) return false;
    const started = performance.now();
    try {
      const fence = await this.db.tx('studio-service', async (q) => {
        const [now] = await q.all(`SELECT ${this.clock} AS now`);
        const t = Number(now?.now);
        this.born ||= t;
        const [cur] = await q.all('SELECT instance, fence, until_ms FROM studio_service WHERE id = 1');
        // Row 2: an instance asking for the lease, `fence` holding when it started.
        const [ask] = await q.all('SELECT instance, fence, until_ms FROM studio_service WHERE id = 2');
        const asking = ask && String(ask.instance) !== this.instance && Number(ask.until_ms) > t ? ask : undefined;
        // A newer instance asking, and alive: it rewrites its ask at each try (every 2 s), so one older than 5 s is a
        // gone instance's, not heeded.
        const newer =
          asking && Number(asking.fence) > this.born && Number(asking.until_ms) - this.ttlMs > t - ASK_FRESH_MS;
        if (cur && String(cur.instance) === this.instance && Number(cur.fence) === this.fence) {
          // Given back now (expired, not deleted: its fence keeps growing), this instance's writes stopped.
          if (newer) {
            this.yielding = true;
            await q.run('UPDATE studio_service SET until_ms = 0 WHERE id = 1 AND instance = $1', [this.instance]);
            return 0;
          }
          await q.run('UPDATE studio_service SET until_ms = $1 WHERE id = 1', [t + this.ttlMs]);
          return this.fence;
        }
        if (cur && Number(cur.until_ms) > t) {
          // Held by another: asked for, unless a newer instance already asks.
          if (!asking || Number(asking.fence) < this.born) {
            await q.run('DELETE FROM studio_service WHERE id = 2');
            await q.run('INSERT INTO studio_service (id, instance, fence, until_ms) VALUES (2, $1, $2, $3)', [
              this.instance,
              this.born,
              t + this.ttlMs,
            ]);
          }
          return 0;
        }
        // Free, but a newer instance asks: left to it (the one that just gave it back never takes it again first).
        if (newer) return 0;
        const next = Number(cur?.fence ?? 0) + 1;
        await q.run('DELETE FROM studio_service WHERE id = 1');
        await q.run('DELETE FROM studio_service WHERE id = 2 AND instance = $1', [this.instance]);
        await q.run('INSERT INTO studio_service (id, instance, fence, until_ms) VALUES (1, $1, $2, $3)', [
          this.instance,
          next,
          t + this.ttlMs,
        ]);
        return next;
      });
      if (this.stopped) {
        // Released while this try was on its way: what it took is given back at once.
        if (fence)
          await this.db.run('DELETE FROM studio_service WHERE id = 1 AND instance = $1 AND fence = $2', [
            this.instance,
            fence,
          ]);
        return false;
      }
      this.fence = fence;
      // Counted from before the request: a slow answer shortens the window, never lengthens it.
      this.writableUntil = fence ? started + this.ttlMs - this.everyMs : 0;
      return fence > 0;
    } catch {
      // A give-back whose answer was lost may have happened: this instance writes nothing more until it knows.
      if (this.yielding) {
        this.fence = 0;
        this.writableUntil = 0;
      }
      return this.held;
    } finally {
      this.yielding = false;
    }
  }

  /** Tries now, then again after each try (never two at once): every `everyMs` while held, five times as often while not. */
  start(onChange?: (held: boolean) => void): void {
    let was = false;
    const loop = async () => {
      const now = await this.tick();
      if (this.stopped) return;
      if (now !== was) onChange?.(now);
      was = now;
      this.timer = setTimeout(() => void loop(), Math.max(200, Math.floor(this.everyMs / (now ? 1 : 5))));
      this.timer.unref?.();
    };
    void loop();
  }

  /** Gives the lease back (SIGTERM's shortcut: the next instance takes it at once instead of at its expiry). */
  async release(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.fence)
      await this.db
        .run('DELETE FROM studio_service WHERE id = 1 AND instance = $1 AND fence = $2', [this.instance, this.fence])
        .catch(() => undefined);
    // Its ask too (a deploy cancelled while it waited): the holder is not made to give the lease back for nothing.
    await this.db
      .run('DELETE FROM studio_service WHERE id = 2 AND instance = $1', [this.instance])
      .catch(() => undefined);
    this.fence = 0;
  }
}
