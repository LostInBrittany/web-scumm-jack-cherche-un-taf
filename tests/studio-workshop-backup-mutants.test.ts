// The Studio Server's backup, its shipped journal and its collection (4.2.2, studio-server/src/ops/{backup,ship,gc}.ts),
// pinned for the mutation set `studio-workshop` (4.2.3 PR 10): the digest's canonical form, the blobs each table's rows
// name, the checks a backup read back must pass, the Postgres queries (on a fake that answers only them), the replay's
// stops, the shipping past one batch and its RPO to the millisecond, and the collection's boundaries. What no test can
// tell apart is named in docs/dev/mutants.json.
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from '../bridge/src/migrations';
import type { SqlDb, SqlQuery } from '../bridge/src/store-sql';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import {
  BACKUP_FORMAT,
  backupOf,
  checkBackup,
  referencedBlobs,
  restoreInto,
  type StudioBackup,
  TABLES,
} from '../studio-server/src/ops/backup';
import type { BlobStore } from '../studio-server/src/ops/blobs';
import { ABSENT } from '../studio-server/src/ops/durable';
import { collect } from '../studio-server/src/ops/gc';
import { replaySegments, type Segments, Shipper } from '../studio-server/src/ops/ship';

const ROOT = join(import.meta.dirname, '..');
const MIGRATIONS = new URL('../studio-server/migrations/', import.meta.url);
let tmp: string, db: SqlDb;

beforeEach(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-workshop-backup-'));
  db = await openSqliteDb(join(tmp, 'j.sqlite'));
  await migrate(db, { dir: MIGRATIONS });
});
afterEach(async () => {
  await db.close();
  rmSync(tmp, { recursive: true, force: true });
});

const h = (c: string) => c.repeat(64);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
/** A backup whose digest is the one given (the canonical JSON written by hand), else well formed. */
const backup = (tables: unknown, canonical: string): StudioBackup =>
  ({
    format: BACKUP_FORMAT,
    v: 1,
    at: 0,
    epoch: 'e',
    revision: 0,
    schema: 0,
    tables,
    blobs: [],
    digest: sha(canonical),
  }) as StudioBackup;

describe("a backup's digest", () => {
  it('is the sha256 of the tables as JSON, keys sorted at every level, arrays kept in order', () => {
    // Keys written out of order; the canonical form sorts them, the rows stay where they are.
    const tables = {
      studio_meta: [
        { value: 'e', key: 'epoch' },
        { value: '3', key: 'revision' },
      ],
    };
    const canonical = '{"studio_meta":[{"key":"epoch","value":"e"},{"key":"revision","value":"3"}]}';
    expect(checkBackup(backup(tables, canonical)).tables).toBe(tables);
    // An array read as an object (its indexes as keys), or keys left in their order, is another digest.
    expect(() => checkBackup(backup(tables, '{"studio_meta":{"0":{"key":"epoch","value":"e"}}}'))).toThrow(/digest/);
  });

  it('refuses what is not a backup: none, another version, no tables, tables that are not an object', () => {
    const good = backup({}, '{}');
    expect(checkBackup(good).v).toBe(1);
    for (const bad of [null, undefined, { ...good, v: 2 }, { ...good, tables: undefined }])
      expect(() => checkBackup(bad), JSON.stringify(bad)).toThrow(/not a Studio Server backup/);
    // A string's digest can be made right: it is still refused for what it is, not for its digest.
    expect(() => checkBackup(backup('abc', '"abc"'))).toThrow(/not a Studio Server backup/);
  });

  it('refuses a table that is not kept, even with its digest right', () => {
    expect(TABLES.studio_sessions).not.toBe('kept');
    expect(() => checkBackup(backup({ studio_sessions: [] }, '{"studio_sessions":[]}'))).toThrow(
      /not kept: studio_sessions/,
    );
  });
});

describe('the blobs the rows name', () => {
  it("are the head's, every operation's before and after, the previews', the prepared sets', the builds' files", () => {
    const effects = JSON.stringify([{ path: 'a.ts', before: h('1'), after: h('2') }]);
    expect([...referencedBlobs({ studio_files: [{ path: 'a.ts', blob: h('3') }] })]).toEqual([h('3')]);
    expect([...referencedBlobs({ studio_ops: [{ effects }] })]).toEqual([h('1'), h('2')]);
    expect([...referencedBlobs({ studio_previews: [{ manifest: JSON.stringify({ 'index.html': h('4') }) }] })]).toEqual(
      [h('4')],
    );
    expect([...referencedBlobs({ studio_prepared: [{ manifest: JSON.stringify({ 'a.webp': h('5') }) }] })]).toEqual([
      h('5'),
    ]);
    // A build's manifest: its files' hashes, never its snapshot's (a hash too, but of no blob).
    const build = JSON.stringify({ epoch: 'e', files: [['index.html', h('6')]], snapshot: h('7') });
    expect([...referencedBlobs({ studio_builds: [{ manifest: build }] })]).toEqual([h('6')]);
  });

  it('are none for a build being made, a failed preview, another table, an absent file or what is no hash', () => {
    expect(
      referencedBlobs({
        studio_builds: [{ manifest: '' }],
        studio_previews: [{ manifest: null, failed: 'no' }],
        studio_users: [{ id: h('8'), manifest: h('9') }],
        studio_files: [
          { path: 'gone.ts', blob: ABSENT },
          { path: 'odd.ts', blob: 'not-a-hash' },
        ],
      }).size,
    ).toBe(0);
  });
});

describe('backupOf', () => {
  it('refuses a table the registry does not know', async () => {
    await db.exec('CREATE TABLE studio_new (id TEXT)');
    await expect(backupOf(db)).rejects.toThrow(/studio_new are neither kept nor skipped/);
  });

  it("sorts each table's rows by their canonical JSON, whatever order the database gives them in", async () => {
    for (const k of ['c', 'a', 'd', 'b'])
      await db.run('INSERT INTO studio_audit (id, at, actor, event, detail) VALUES ($1, 1, NULL, $2, $3)', [
        k,
        'x',
        '{}',
      ]);
    expect((await db.all('SELECT * FROM studio_audit')).map((r) => r.id)).toEqual(['c', 'a', 'd', 'b']);
    expect((await backupOf(db)).tables.studio_audit!.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

/** A Postgres database as the backup sees it: the catalogue's queries answered, any SQLite query refused. */
function fakePostgres(rows: Record<string, Record<string, unknown>[]>, columns: Record<string, string[]>) {
  const txs: { lock: string | undefined; o: unknown }[] = [];
  const inserted: string[] = [];
  const q: SqlQuery = {
    all: async (sql, params = []) => {
      if (/sqlite_master|pragma_table_info/.test(sql)) throw new Error(`a SQLite query on Postgres: ${sql}`);
      if (/FROM pg_tables/.test(sql)) return Object.keys(TABLES).map((name) => ({ name }));
      if (/information_schema\.columns/.test(sql)) return (columns[String(params[0])] ?? []).map((name) => ({ name }));
      if (/schema_migrations/.test(sql)) return [{ v: 7 }];
      if (/COUNT\(\*\)/.test(sql)) return [{ n: 0 }];
      const t = /^SELECT \* FROM (\w+)/.exec(sql)?.[1];
      if (t) return rows[t] ?? [];
      throw new Error(`unexpected: ${sql}`);
    },
    run: async (sql) => {
      inserted.push(sql);
      return 1;
    },
    exec: async () => undefined,
  };
  const pg = {
    dialect: 'postgres' as const,
    ...q,
    tx: async <T>(lock: string | undefined, fn: (q: SqlQuery) => Promise<T>, o?: unknown) => {
      txs.push({ lock, o });
      return fn(q);
    },
    close: async () => undefined,
  };
  return { pg: pg as SqlDb, txs, inserted };
}

describe('on Postgres', () => {
  it("lists the tables from pg_tables, in one read-only transaction, and restores by the schema's columns", async () => {
    const { pg, txs, inserted } = fakePostgres(
      { studio_meta: [{ key: 'epoch', value: 'e9' }] },
      { studio_meta: ['key', 'value'] },
    );
    const b = await backupOf(pg, 5);
    expect(b).toMatchObject({ epoch: 'e9', schema: 7, tables: { studio_meta: [{ key: 'epoch', value: 'e9' }] } });
    expect(txs).toEqual([{ lock: undefined, o: { readOnly: true } }]);
    const none: BlobStore = { has: async () => true } as unknown as BlobStore;
    expect(await restoreInto(pg, none, checkBackup(JSON.parse(JSON.stringify(b))))).toEqual({ rows: 1, dropped: 0 });
    expect(inserted[0]).toBe('INSERT INTO studio_meta (key, value) VALUES ($1, $2)');
  });
});

describe('restoreInto', () => {
  it('asks the store once for a blob several rows name', async () => {
    const asked: string[] = [];
    const store = {
      has: async (x: string) => {
        asked.push(x);
        return true;
      },
    } as unknown as BlobStore;
    const files = [
      { path: 'a.ts', blob: h('a'), rev: 1 },
      { path: 'b.ts', blob: h('a'), rev: 1 },
    ];
    const b = backup({ studio_files: files }, JSON.stringify({ studio_files: files }));
    await restoreInto(db, store, {
      ...b,
      schema: Number((await db.all('SELECT MAX(version) AS v FROM schema_migrations'))[0]!.v),
    });
    expect(asked).toEqual([h('a')]);
  });
});

const op = (rev: number, at = 1_000) =>
  db.run(
    "INSERT INTO studio_ops (op_id, rev, author, what, state, effects, response, at) VALUES ($1, $2, 'lea', 'w', 'confirmed', '[]', NULL, $3)",
    [`op${rev}`, rev, at],
  );
const memorySegments = (): Segments & { m: Map<string, Buffer> } => {
  const m = new Map<string, Buffer>();
  return {
    m,
    put: async (k, b) => void m.set(k, b),
    get: async (k) => m.get(k),
    list: async function* (p) {
      for (const k of [...m.keys()].filter((k) => k.startsWith(p))) yield { key: k };
    },
  };
};

describe('the journal shipped', () => {
  it('ships past one batch of 500 in one call', async () => {
    await db.run(
      "WITH RECURSIVE n(r) AS (SELECT 1 UNION ALL SELECT r + 1 FROM n WHERE r < 501) INSERT INTO studio_ops (op_id, rev, author, what, state, effects, response, at) SELECT 'op' || r, r, 'lea', 'w', 'confirmed', '[]', NULL, 1 FROM n",
    );
    const segments = memorySegments();
    await new Shipper({ db, segments }).ship();
    expect(segments.m.size).toBe(501);
  });

  it('says the RPO to the millisecond: now less the oldest operation not shipped', async () => {
    await op(1, 1_000);
    expect(await new Shipper({ db, segments: memorySegments(), now: () => 6_000 }).rpoMs()).toBe(5_000);
  });

  it('stops retrying once closed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await op(1);
      let tries = 0;
      const down = {
        ...memorySegments(),
        put: async () => {
          tries++;
          throw new Error('the bucket is away');
        },
      };
      const ship = new Shipper({ db, segments: down, retryMs: 1_000 });
      await ship.ship();
      expect(tries).toBe(1);
      ship.close();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(tries).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a replay', () => {
  const segment = (s: { epoch?: string; line?: string; rev?: number }) =>
    Buffer.from(
      JSON.stringify({
        v: 1,
        epoch: s.epoch ?? 'e1',
        line: s.line ?? '0',
        op: {
          op_id: 'x',
          rev: s.rev ?? 1,
          author: 'lea',
          what: 'w',
          effects: JSON.stringify([{ path: 'a.ts', before: ABSENT, after: ABSENT }]),
          at: 1,
        },
      }),
    );
  const KEY = 'journal/e1/0/000000000001.json';
  const blobs = { has: async () => true } as unknown as BlobStore;
  beforeEach(async () => {
    await db.run("INSERT INTO studio_meta (key, value) VALUES ('epoch', 'e1'), ('revision', '0')");
  });

  it('stops at a segment it cannot read', async () => {
    const segments = { ...memorySegments(), get: async () => undefined };
    segments.m.set(KEY, Buffer.from(''));
    expect(await replaySegments(db, segments, blobs)).toEqual({ revision: 0, stopped: 'unreadable' });
  });

  it("stops at a segment of another epoch, another line or another revision than its key's", async () => {
    for (const s of [{ epoch: 'e2' }, { line: 'l2' }, { rev: 2 }]) {
      const segments = memorySegments();
      segments.m.set(KEY, segment(s));
      expect(await replaySegments(db, segments, blobs), JSON.stringify(s)).toEqual({
        revision: 0,
        stopped: 'another-line',
      });
    }
    expect(await db.all('SELECT * FROM studio_ops')).toEqual([]);
  });

  it('applies nothing when the revision moved since it looked (a write in between)', async () => {
    const segments = memorySegments();
    segments.m.set(KEY, segment({}));
    const racing = {
      ...segments,
      get: async (k: string) => {
        await db.run("UPDATE studio_meta SET value = '1' WHERE key = 'revision'");
        return segments.get(k);
      },
    };
    expect(await replaySegments(db, racing, blobs)).toEqual({ revision: 0, stopped: 'not-the-head' });
    expect(await db.all('SELECT * FROM studio_ops')).toEqual([]);
  });
});

describe('the collection', () => {
  const store = (list: { hash: string; at: number }[], o: { remove?: boolean } = {}) =>
    ({
      has: async () => true,
      list: async function* () {
        yield* list;
      },
      ...(o.remove === false ? {} : { remove: async () => undefined }),
    }) as unknown as BlobStore;

  it('refuses a store that cannot list, or cannot remove', async () => {
    await expect(collect(db, { has: async () => true } as unknown as BlobStore, { delete: false })).rejects.toThrow(
      /cannot be listed/,
    );
    await expect(collect(db, store([], { remove: false }), { delete: false })).rejects.toThrow(/cannot be listed/);
  });

  it('keeps a blob exactly as old as the grace period, and a staged object exactly an hour old', async () => {
    const now = 100 * 3_600_000;
    const got = await collect(db, store([{ hash: h('a'), at: now - 1_000 }]), {
      delete: false,
      now,
      graceMs: 1_000,
      staging: {
        list: async function* () {
          yield { key: 'staging/j/x', at: now - 3_600_000 };
        },
        delete: async () => undefined,
      },
    });
    expect(got).toMatchObject({ unreferenced: [], staging: 0 });
  });

  it('sweeps no staging when it is given none', async () => {
    expect(await collect(db, store([]), { delete: true })).toEqual({
      referenced: 0,
      unreferenced: [],
      removed: 0,
      staging: 0,
    });
  });
});
