// The run stores' own contract, case by case (4.1.17, the `runs` mutation set): the memory store and SQLite agree on
// what `list` filters, which run `claimNext` takes (a tenant's, the oldest, a lease expired strictly before now),
// what `complete` refuses, what a summary and a claimed run read back, how old a run `purge` deletes; and the quota's
// arithmetic: when to come back, which idle buckets go, how many stay past the cap.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { MemoryLimiter, SqlLimiter } from '../bridge/src/runs-limiter';
import { MemoryRunStore, type RunRecord, type RunStore, SqlRunStore } from '../bridge/src/runs-store';
import type { SqlDb, SqlQuery } from '../bridge/src/store-sql';
import { SqliteRealityStore } from '../bridge/src/store-sqlite';

const dir = mkdtempSync(join(tmpdir(), 'runs-store-'));
const closers: (() => Promise<unknown>)[] = [];
afterAll(async () => {
  for (const c of closers) await c().catch(() => {});
  rmSync(dir, { recursive: true, force: true });
});
const sqlite = async () => {
  const s = await SqliteRealityStore.open(join(dir, `${randomBytes(4).toString('hex')}.sqlite`), { pollMs: 0 });
  closers.push(() => s.close());
  return s.db;
};
const run = (o: Partial<RunRecord> & { id: string }): RunRecord => ({
  tenantId: 't',
  gameId: 'g',
  categoryId: 'c',
  player: 'P',
  submittedAt: 10,
  status: 'queued',
  trust: 'local',
  runKey: `k-${o.id}`,
  deleteTokenHash: '0',
  envelope: '{}',
  ...o,
});

for (const [name, make] of [
  ['memory', async () => new MemoryRunStore()],
  ['sqlite', async () => new SqlRunStore(await sqlite())],
] as [string, () => Promise<RunStore>][])
  describe(`the ${name} run store`, () => {
    it('creates a run once per tenant and key; lists by game, category and board', async () => {
      const s = await make();
      expect(await s.create(run({ id: 'a', leaderboardKey: 'k1' }))).toBe(true);
      expect(await s.create(run({ id: 'a2', runKey: 'k-a' }))).toBe(false);
      expect(await s.create(run({ id: 'a3', runKey: 'k-a', tenantId: 'u' }))).toBe(true);
      await s.create(run({ id: 'b', gameId: 'h' }));
      await s.create(run({ id: 'c', categoryId: 'd' }));
      await s.create(run({ id: 'd', leaderboardKey: 'k2' }));
      const ids = async (f: Parameters<RunStore['list']>[1]) => (await s.list('t', f)).map((r) => r.id).sort();
      expect(await ids({})).toEqual(['a', 'b', 'c', 'd']);
      expect(await ids({ gameId: 'g' })).toEqual(['a', 'c', 'd']);
      expect(await ids({ categoryId: 'c' })).toEqual(['a', 'b', 'd']);
      expect(await ids({ leaderboardKey: 'k1' })).toEqual(['a']);
      expect((await s.list('u')).map((r) => r.id)).toEqual(['a3']);
      expect(await s.queued()).toBe(5);
      expect(await s.queued('t')).toBe(4);
      expect(await s.queued('nobody')).toBe(0);
    });

    it("claims a tenant's oldest run, by id at the same instant, and a lease expired strictly before now", async () => {
      const s = await make();
      await s.create(run({ id: 'run_b', submittedAt: 5 }));
      await s.create(run({ id: 'run_a', submittedAt: 5 }));
      await s.create(run({ id: 'run_0', submittedAt: 9 }));
      await s.create(run({ id: 'run_u', submittedAt: 1, tenantId: 'u' }));
      expect((await s.claimNext('w1', 100, 1000, 't'))!.id).toBe('run_a');
      expect((await s.claimNext('w1', 100, 1000, 't'))!.id).toBe('run_b');
      expect((await s.claimNext('w1', 100, 1000, 't'))!.id).toBe('run_0');
      expect(await s.claimNext('w1', 100, 1000, 't')).toBeUndefined();
      // run_a's lease runs to 1100: at 1100 it is still held, at 1101 it is taken over.
      expect(await s.claimNext('w2', 100, 1100, 't')).toBeUndefined();
      expect((await s.claimNext('w2', 100, 1101, 't'))!.id).toBe('run_a');
      expect((await s.claimNext('w3', 100, 1000))!.id).toBe('run_u');
    });

    it("stores a verdict for the lease's holder only; reads it back with its time; a trust on no run is nothing", async () => {
      const s = await make();
      await s.create(run({ id: 'r1' }));
      expect(await s.complete('t', 'r1', 'w', { verdict: 'valid', trust: 'replay-valid', ranked: '5' })).toBe(false);
      const claimed = (await s.claimNext('w', 100, 1000, 't'))!;
      expect(claimed).toMatchObject({ status: 'verifying', leaseOwner: 'w', leaseUntil: 1100 });
      expect((await s.get('t', 'r1'))!.leaseUntil).toBe(1100);
      expect(await s.complete('t', 'r1', 'other', { verdict: 'valid', trust: 'replay-valid', ranked: '5' })).toBe(
        false,
      );
      expect(await s.complete('t', 'nope', 'w', { verdict: 'valid', trust: 'replay-valid', ranked: '5' })).toBe(false);
      expect(await s.complete('t', 'r1', 'w', { verdict: 'valid', trust: 'replay-valid', ranked: '5' })).toBe(true);
      expect(await s.complete('t', 'r1', 'w', { verdict: 'valid', trust: 'replay-valid', ranked: '5' })).toBe(false);
      expect(await s.summary('t', 'r1')).toMatchObject({ status: 'done', ranked: '5', envelope: '' });
      expect(await s.summary('t', 'nope')).toBeUndefined();
      await s.create(run({ id: 'r2' }));
      expect((await s.get('t', 'r2'))!.ranked).toBeUndefined(); // not verified: no time yet
      await s.setTrust('t', 'nope', 'moderator-verified');
      await s.setTrust('t', 'r1', 'moderator-verified');
      expect((await s.get('t', 'r1'))!.trust).toBe('moderator-verified');
    });

    it('claims five runs of one instant in the order of their ids, and ranks five equal times the same way', async () => {
      const s = await make();
      for (const id of ['run_d', 'run_b', 'run_e', 'run_a', 'run_c']) await s.create(run({ id, submittedAt: 7 }));
      const order: string[] = [];
      for (let i = 0; i < 5; i++) order.push((await s.claimNext('w', 100, 1000, 't'))!.id);
      expect(order).toEqual(['run_a', 'run_b', 'run_c', 'run_d', 'run_e']);
      const b = await make();
      for (const id of ['run_d', 'run_b', 'run_e', 'run_a', 'run_c'])
        await b.create(
          run({ id, player: id, submittedAt: 7, status: 'done', verdict: 'valid', ranked: '50', leaderboardKey: 'c' }),
        );
      const board = await b.board({ tenantId: 't', gameId: 'g', categoryId: 'c', leaderboardKey: 'c', limit: 10 });
      expect(board.map((r) => [r.rank, r.run.id])).toEqual([
        [1, 'run_a'],
        [1, 'run_b'],
        [1, 'run_c'],
        [1, 'run_d'],
        [1, 'run_e'],
      ]);
    });

    it('admits into the room left by waiting and verifying runs, finished ones taking none', async () => {
      const s = await make();
      await s.create(run({ id: 'done', status: 'done', verdict: 'valid' }));
      expect(await s.admit(run({ id: 'r1' }), 1)).toBe('created');
      expect(await s.admit(run({ id: 'r2' }), 1)).toBe('full');
    });

    it('reads no run for an id it does not hold, whole or summed up (4.3.0)', async () => {
      // Kills runs-store.ts `return r ? toRun(r) : undefined;` → true in get and summary: no row is no run, never a
      // TypeError of reading a row that is not there.
      const s = await make();
      await s.create(run({ id: 'a' }));
      expect(await s.get('t', 'nope')).toBeUndefined();
      expect(await s.get('u', 'a')).toBeUndefined();
      expect(await s.summary('t', 'nope')).toBeUndefined();
      expect(await s.summary('t', 'a')).toMatchObject({ id: 'a' });
    });

    it('purges the runs submitted strictly before the date, and says how many', async () => {
      const s = await make();
      await s.create(run({ id: 'old', submittedAt: 99 }));
      await s.create(run({ id: 'edge', submittedAt: 100 }));
      expect(await s.purge(100)).toBe(1);
      expect((await s.list('t')).map((r) => r.id)).toEqual(['edge']);
    });
  });

describe('the quota', () => {
  it('says when to come back from a fractional bucket', async () => {
    const l = new MemoryLimiter({ perMinute: 2, secret: 's' });
    await l.take('t', 'c', 0);
    await l.take('t', 'c', 0);
    // 15 s later half a token is back: one is 15 s away.
    expect(await l.take('t', 'c', 15_000)).toEqual({ ok: false, retryAfterS: 15 });
  });

  it('purges the buckets idle strictly before the date', async () => {
    const l = new MemoryLimiter({ perMinute: 2, secret: 's' });
    await l.take('t', 'a', 100);
    await l.take('t', 'b', 99);
    expect(await l.purge(100)).toBe(1);
    expect(l.size).toBe(1);
  });

  it('keeps at most maxBuckets of a tenant in SQL, the least recently used going', async () => {
    const db = await sqlite();
    const l = new SqlLimiter(db, { perMinute: 2, secret: 's', keyVersion: 'k', maxBuckets: 2 });
    for (const [c, at] of [
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ] as const)
      await l.take('t', c, at);
    await new SqlLimiter(db, { perMinute: 2, secret: 's', keyVersion: 'k' }).take('u', 'x', 1);
    expect(await l.purge(0, 't')).toBe(2);
    expect(
      (await db.all('SELECT at FROM run_quota WHERE tenant_id = $1 ORDER BY at', ['t'])).map((r) => Number(r.at)),
    ).toEqual([3, 4]);
    expect(await db.all('SELECT at FROM run_quota WHERE tenant_id = $1', ['u'])).toHaveLength(1);
    expect(await l.purge(0, 't')).toBe(0); // under the cap: nothing more
  });
});

describe('the board statement', () => {
  it('compares bytes on Postgres (COLLATE "C") and binds a seed kind only when there is one', () => {
    const pg = new SqlRunStore({ dialect: 'postgres' } as never);
    const lite = new SqlRunStore({ dialect: 'sqlite' } as never);
    const q = { tenantId: 't', gameId: 'g', categoryId: 'c', leaderboardKey: 'c', limit: 10 };
    expect(pg.boardSql(q).sql).toContain('ranked COLLATE "C"');
    expect(pg.boardSql(q).sql).toContain('id COLLATE "C"');
    expect(lite.boardSql(q).sql).not.toContain('COLLATE');
    expect(pg.boardSql(q).params).toEqual(['t', 'g', 'c', 'c']);
    expect(pg.boardSql({ ...q, seedKind: 'fixed' }).params).toEqual(['t', 'g', 'c', 'c', 'fixed']);
    expect(pg.boardSql({ ...q, seedKind: 'fixed' }).sql).toContain('seed_kind = $5');
    expect(pg.boardSql(q).sql).not.toContain('$5');
  });
});

// Killed mutants (4.3.0 reread of the exemptions): two windows another process can open on a shared SQL database.
// Each is staged over the SQLite store by a wrapper of its SqlDb that does, at the right statement, what the other
// process would have done in between.
describe('the SQL run store and quota, when another process acts between two statements', () => {
  const wrap = (db: SqlDb, o: { run?: SqlQuery['run']; all?: SqlQuery['all']; q?: (q: SqlQuery) => SqlQuery }) =>
    ({
      dialect: db.dialect,
      all: o.all ?? ((s, p) => db.all(s, p)),
      run: o.run ?? ((s, p) => db.run(s, p)),
      exec: (s) => db.exec(s),
      tx: (k, fn, x) => db.tx(k, (q) => fn(o.q ? o.q(q) : q), x),
      close: () => db.close(),
    }) satisfies SqlDb;

  it('a claim whose UPDATE changes no row (the run completed meanwhile by its old lease holder) claims nothing', async () => {
    // Kills runs-store.ts `n !== 1` → false: `complete` is not under the claim's lock, so on Postgres it can commit
    // between the claim's SELECT and its UPDATE; the run must not be handed to a second worker.
    const db = await sqlite();
    const s = new SqlRunStore(
      wrap(db, {
        q: (q) => ({
          ...q,
          all: (sql, p) => q.all(sql, p),
          exec: (sql) => q.exec(sql),
          run: async (sql, p) => {
            if (/^UPDATE runs SET status = 'verifying'/.test(sql.trim()))
              await q.run(`UPDATE runs SET status = 'done' WHERE tenant_id = $1 AND id = $2`, [p![0], p![1]]);
            return q.run(sql, p);
          },
        }),
      }),
    );
    await s.create(run({ id: 'a' }));
    expect(await s.claimNext('w', 1000, 100)).toBeUndefined();
  });

  it("a purge whose edge row is gone (another instance's purge took it) deletes no more and says so", async () => {
    // Kills runs-limiter.ts `if (edge)` → true: the COUNT and the edge's SELECT are two statements, not a transaction.
    const db = await sqlite();
    const l = new SqlLimiter(
      wrap(db, { all: (sql, p) => (/LIMIT 1 OFFSET/.test(sql) ? Promise.resolve([]) : db.all(sql, p)) }),
      { perMinute: 2, secret: 's', keyVersion: 'k', maxBuckets: 1 },
    );
    for (const [c, at] of [
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ] as const)
      await l.take('t', c, at);
    expect(await l.purge(0, 't')).toBe(0);
  });
});
