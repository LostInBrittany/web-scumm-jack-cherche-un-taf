// The journal shipped (4.2.2 PR 7, plan §2.7, G7): each confirmed operation is copied, asynchronously, to an immutable
// segment of the bucket (`journal/<epoch>/<line>/<rev>.json`: the operation's row, its effects' hashes; the contents
// are blobs already), in order, a watermark kept in `studio_meta` (`shipped`). The line is the instance's history since
// its last restore: a restored instance ships on a new line, so the revisions it writes again never overwrite the
// segments of the timeline it left. The RPO is the age of the oldest confirmed operation not shipped yet (0 when
// none): measured, given by `/readyz`, never claimed to be nil. A restore replays the segments of its backup's line
// past its revision: the operations, and the head they made, each checked against the head it continues.
import { randomUUID } from 'node:crypto';
import type { SqlDb, SqlQuery } from '../../../bridge/src/store-sql';
import type { BlobStore } from './blobs';
import { ABSENT } from './durable';

export interface Segments {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | undefined>;
  list(prefix: string): AsyncIterable<{ key: string }>;
}

const prefixOf = (epoch: string, line: string) => `journal/${epoch}/${line}/`;
const keyOf = (epoch: string, line: string, rev: number) =>
  `${prefixOf(epoch, line)}${String(rev).padStart(12, '0')}.json`;

interface Shipped {
  op_id: string;
  rev: number;
  author: string;
  what: string;
  effects: string;
  at: number;
}

const metaOf = async (q: SqlQuery, key: string): Promise<string | undefined> => {
  const [r] = await q.all('SELECT value FROM studio_meta WHERE key = $1', [key]);
  return r ? String(r.value) : undefined;
};

/** The instance's shipping line: `0` from its creation, made anew by each restore. */
const lineOf = async (q: SqlQuery) => (await metaOf(q, 'line')) ?? '0';

/** Retried this long after a failure while something is left to ship (D42: an RPO of a minute). */
const RETRY_MS = 30_000;

export class Shipper {
  private running: Promise<void> | null = null;
  private wanted = false;
  private retry: NodeJS.Timeout | null = null;
  private now: () => number;

  constructor(
    private o: {
      db: SqlDb;
      segments: Segments;
      log?: (line: Record<string, unknown>) => void;
      now?: () => number;
      retryMs?: number;
    },
  ) {
    this.now = o.now ?? Date.now;
  }

  /** Ships what is confirmed and not shipped yet, in order (after each confirmed operation, at start). */
  ship(): Promise<void> {
    this.wanted = true;
    this.running ??= (async () => {
      while (this.wanted) {
        this.wanted = false;
        try {
          await this.once();
        } catch (e) {
          // Tried again soon, even if no operation comes: the RPO says how far behind it is meanwhile.
          this.o.log?.({ event: 'ship-failed', message: String((e as Error).message).slice(0, 300) });
          this.retry ??= setTimeout(() => {
            this.retry = null;
            void this.ship();
          }, this.o.retryMs ?? RETRY_MS);
          this.retry.unref?.();
        }
      }
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private every: NodeJS.Timeout | null = null;

  /**
   * Ships every `ms` too, whatever confirmed it: an operation another process wrote (the CLI's import, against the same
   * database) emits no event in this one, and would otherwise wait for the next write here or a restart (4.2.3, found
   * by the reference deployment). A pass with nothing to ship is three small reads.
   */
  watch(ms = RETRY_MS) {
    this.every ??= setInterval(() => void this.ship(), ms);
    this.every.unref?.();
  }

  /** Stops the timers (the server closing). */
  close() {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    if (this.every) clearInterval(this.every);
    this.every = null;
  }

  private async once() {
    const epoch = (await metaOf(this.o.db, 'epoch')) ?? '';
    const line = await lineOf(this.o.db);
    const shipped = Number((await metaOf(this.o.db, 'shipped')) ?? 0);
    const ops = await this.o.db.all(
      "SELECT op_id, rev, author, what, effects, at FROM studio_ops WHERE state = 'confirmed' AND rev > $1 ORDER BY rev LIMIT 500",
      [shipped],
    );
    for (const r of ops) {
      const op: Shipped = {
        op_id: String(r.op_id),
        rev: Number(r.rev),
        author: String(r.author),
        what: String(r.what),
        effects: String(r.effects),
        at: Number(r.at),
      };
      await this.o.segments.put(keyOf(epoch, line, op.rev), Buffer.from(JSON.stringify({ v: 1, epoch, line, op })));
      await this.o.db.run(
        "INSERT INTO studio_meta (key, value) VALUES ('shipped', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        [String(op.rev)],
      );
    }
    if (ops.length === 500) this.wanted = true;
  }

  /** The age of the oldest confirmed operation not shipped yet, in ms (0: everything is shipped). */
  async rpoMs(): Promise<number> {
    const shipped = Number((await metaOf(this.o.db, 'shipped')) ?? 0);
    const [r] = await this.o.db.all("SELECT MIN(at) AS at FROM studio_ops WHERE state = 'confirmed' AND rev > $1", [
      shipped,
    ]);
    return r?.at === null || r?.at === undefined ? 0 : Math.max(0, this.now() - Number(r.at));
  }
}

/** Why a replay stopped before the end of its line (undefined: it reached it). */
type ReplayStop = 'gap' | 'unreadable' | 'another-line' | 'not-the-head' | 'blob-missing' | undefined;

/**
 * After a restore: the segments of the restored line past the project's revision, applied in order (each operation's
 * row, its effects on the head, the revision). Each one must continue the head: the revision right after it, every
 * effect's `before` the head's blob, every `after` in the blobs; else the replay stops there, nothing applied out of
 * order or over another timeline. Resumable: it starts from what the project holds now.
 */
export async function replaySegments(
  db: SqlDb,
  segments: Segments,
  blobs: BlobStore,
): Promise<{ revision: number; stopped: ReplayStop }> {
  const epoch = (await metaOf(db, 'epoch')) ?? '';
  const line = await lineOf(db);
  let rev = Number((await metaOf(db, 'revision')) ?? 0);
  const keys: string[] = [];
  for await (const s of segments.list(prefixOf(epoch, line))) keys.push(s.key);
  keys.sort();
  for (const key of keys) {
    const at = Number(/(\d+)\.json$/.exec(key)?.[1] ?? Number.NaN);
    if (!(at > rev)) continue;
    if (at !== rev + 1) return { revision: rev, stopped: 'gap' };
    const body = await segments.get(key);
    if (!body) return { revision: rev, stopped: 'unreadable' };
    const s = JSON.parse(body.toString('utf8')) as { epoch: string; line: string; op: Shipped };
    if (s.epoch !== epoch || s.line !== line || s.op.rev !== at) return { revision: rev, stopped: 'another-line' };
    const effects = JSON.parse(s.op.effects) as { path: string; before: string; after: string }[];
    for (const e of effects)
      if (e.after !== ABSENT && !(await blobs.has(e.after))) return { revision: rev, stopped: 'blob-missing' };
    const applied = await db.tx('studio', async (q) => {
      if (Number((await metaOf(q, 'revision')) ?? 0) !== at - 1) return false;
      for (const e of effects) {
        const [f] = await q.all('SELECT blob FROM studio_files WHERE path = $1', [e.path]);
        if ((f ? String(f.blob) : ABSENT) !== e.before) return false;
      }
      // An operation aborted before the backup, retried since under its id: its confirmed row replaces it.
      await q.run("DELETE FROM studio_ops WHERE op_id = $1 AND state <> 'confirmed'", [s.op.op_id]);
      await q.run(
        "INSERT INTO studio_ops (op_id, rev, author, what, state, effects, response, at) VALUES ($1, $2, $3, $4, 'confirmed', $5, NULL, $6)",
        [s.op.op_id, s.op.rev, s.op.author, s.op.what, s.op.effects, s.op.at],
      );
      for (const e of effects)
        await q.run(
          'INSERT INTO studio_files (path, blob, rev) VALUES ($1, $2, $3) ON CONFLICT (path) DO UPDATE SET blob = excluded.blob, rev = excluded.rev',
          [e.path, e.after, s.op.rev],
        );
      await q.run("UPDATE studio_meta SET value = $1 WHERE key = 'revision'", [String(s.op.rev)]);
      return true;
    });
    if (!applied) return { revision: rev, stopped: 'not-the-head' };
    rev = at;
  }
  return { revision: rev, stopped: undefined };
}

/**
 * Ends a restore: the instance ships on a new line from its revision on (what it writes again never overwrites the
 * timeline it left), and may serve again.
 */
export async function finishRestore(db: SqlDb): Promise<void> {
  await db.tx('studio', async (q) => {
    const rev = (await metaOf(q, 'revision')) ?? '0';
    for (const [key, value] of [
      ['line', randomUUID()],
      ['shipped', rev],
    ] as const)
      await q.run(
        'INSERT INTO studio_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        [key, value],
      );
    await q.run("DELETE FROM studio_meta WHERE key = 'restoring'");
  });
}
