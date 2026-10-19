// The operation journal, pinned for the mutation set `studio-ops` (4.2.1): hosted mode on SQLite (the folder follows
// the head, adopted contents go to the blobs, repair counts what it rewrote), deletions, a retry of an aborted id, an
// unchanged base, an interrupted operation whose revision does not follow the head, the files the journal follows
// (no dot-files, no folders, a game folder that does not exist yet), paths outside the game, and the lease: expired,
// fenced, waited for then taken, a fence that only grows.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { ABSENT, sha256 } from '../studio-server/src/ops/durable';
import { Journal, LeaseLostError, MaintenanceError } from '../studio-server/src/ops/journal';

let root: string, game: string;
let dbs: { close(): Promise<void> }[] = [];
const openDb = async () => {
  const db = await openSqliteDb(join(root, 'journal.sqlite'));
  dbs.push(db);
  return db;
};
const open = async (o: { holder?: string; leaseWaitMs?: number; leaseMs?: number; hosted?: boolean } = {}) =>
  Journal.open({ db: await openDb(), blobs: fsBlobStore(join(root, 'blobs')), gameDir: game, ...o });
const read = (p: string) => readFileSync(join(game, p), 'utf8');
const blobCount = () =>
  existsSync(join(root, 'blobs')) ? readdirSync(join(root, 'blobs'), { recursive: true }).length : 0;
const write = (j: Journal, path: string, after: string | null, extra: Record<string, unknown> = {}) =>
  j.apply({ author: 'lea', what: 'w', effects: [{ path, after }], respond: (rev) => rev, ...extra });

beforeEach(() => {
  mkdirSync(join(process.cwd(), '.cache'), { recursive: true });
  root = mkdtempSync(join(process.cwd(), '.cache', 'journal-mut-'));
  game = join(root, 'game');
  mkdirSync(join(game, 'rooms'), { recursive: true });
  writeFileSync(join(game, 'rooms', 'a.ts'), 'a0');
  writeFileSync(join(game, 'notes.json'), '{}');
});
afterEach(async () => {
  for (const db of dbs) await db.close();
  dbs = [];
  rmSync(root, { recursive: true, force: true });
});

describe('hosted mode (on SQLite)', () => {
  it('is off by default: a file removed outside is adopted as removed, never brought back', async () => {
    const j = await open();
    await j.close();
    rmSync(join(game, 'notes.json'));
    // Local mode keeps no copy of what it adopts: the folder is the author's.
    expect(blobCount()).toBe(0);
    const k = await open();
    await write(k, 'rooms/a.ts', 'a1');
    expect(existsSync(join(game, 'notes.json'))).toBe(false);
    expect((await k.file('notes.json')).blob).toBe(ABSENT);
    await k.close();
  });

  it('adopts a first import with every content in the blobs, then follows the head, not the folder', async () => {
    const j = await open({ hosted: true });
    for (const c of ['a0', '{}']) expect((await fsBlobStore(join(root, 'blobs')).get(sha256(c))).toString()).toBe(c);
    await write(j, 'rooms/b.ts', 'b1');
    await j.close();
    // The instance's folder is lost and dirtied: reopening rebuilds it from the head.
    rmSync(join(game, 'rooms', 'b.ts'));
    writeFileSync(join(game, 'rooms', 'a.ts'), 'tampered');
    writeFileSync(join(game, 'stray.txt'), 'stray');
    const k = await open({ hosted: true });
    expect(read('rooms/b.ts')).toBe('b1');
    expect(read('rooms/a.ts')).toBe('a0');
    expect(existsSync(join(game, 'stray.txt'))).toBe(false);
    await k.close();
  });

  it('repairs the folder and counts what it rewrote; a deleted file stays deleted; local mode repairs nothing', async () => {
    const j = await open({ hosted: true });
    await write(j, 'notes.json', null);
    writeFileSync(join(game, 'rooms', 'a.ts'), 'tampered');
    writeFileSync(join(game, 'stray.txt'), 'stray');
    expect(await j.reconcile()).toEqual({ written: 1, removed: 1 });
    expect(read('rooms/a.ts')).toBe('a0');
    expect(existsSync(join(game, 'notes.json'))).toBe(false);
    expect(await j.reconcile()).toEqual({ written: 0, removed: 0 });
    await j.close();
    const local = await open();
    writeFileSync(join(game, 'rooms', 'a.ts'), 'mine');
    expect(await local.reconcile()).toEqual({ written: 0, removed: 0 });
    expect(read('rooms/a.ts')).toBe('mine');
    await local.close();
  });

  it('never empties a folder whose project has no head yet', async () => {
    const j = await open({ hosted: true });
    const db = await openDb();
    await db.run('DELETE FROM studio_files');
    expect(await j.materialize()).toEqual({ written: 0, removed: 0 });
    expect(read('rooms/a.ts')).toBe('a0');
    expect(read('notes.json')).toBe('{}');
    await j.close();
  });
});

describe('operations', () => {
  it('a deletion removes the file, stores no blob, and the head says absent', async () => {
    const j = await open();
    const before = blobCount();
    await write(j, 'notes.json', null);
    expect(existsSync(join(game, 'notes.json'))).toBe(false);
    expect((await j.file('notes.json')).blob).toBe(ABSENT);
    expect(blobCount()).toBe(before);
    await write(j, 'rooms/a.ts', 'a-new');
    expect((await fsBlobStore(join(root, 'blobs')).get(sha256('a-new'))).toString()).toBe('a-new');
    await j.close();
  });

  it('an id whose earlier try was aborted is applied again, once', async () => {
    const j = await open();
    const db = await openDb();
    await db.run(
      "INSERT INTO studio_ops (op_id, rev, author, what, state, effects, at) VALUES ('try-1', 50, 'lea', 'w', 'aborted', '[]', 0)",
    );
    const r = await write(j, 'rooms/a.ts', 'a1', { id: 'try-1' });
    expect(r.replayed).toBeUndefined();
    expect(read('rooms/a.ts')).toBe('a1');
    expect((await write(j, 'rooms/a.ts', 'a1', { id: 'try-1' })).replayed).toBe(true);
    await j.close();
  });

  it('a base that is still the head is no conflict', async () => {
    const j = await open();
    const head = (await j.file('rooms/a.ts')).rev;
    await write(j, 'rooms/a.ts', 'a1', { base: { 'rooms/a.ts': head } });
    expect(read('rooms/a.ts')).toBe('a1');
    await j.close();
  });

  it('an interrupted operation whose revision does not follow the head puts the project in maintenance', async () => {
    const j = await open();
    await j.close();
    const db = await openDb();
    // Its file already holds the "after": recovery only has to confirm it, and revision 99 does not follow the head.
    writeFileSync(join(game, 'rooms', 'a.ts'), 'a9');
    await db.run(
      "INSERT INTO studio_ops (op_id, rev, author, what, state, effects, at) VALUES ('gap', 99, 'lea', 'w', 'intent', $1, 0)",
      [JSON.stringify([{ path: 'rooms/a.ts', before: sha256('a0'), after: sha256('a9') }])],
    );
    await expect(open()).rejects.toBeInstanceOf(MaintenanceError);
  });
});

describe('recovery', () => {
  it('rolls an interrupted deletion forward', async () => {
    const j = await open();
    await j.close();
    const db = await openDb();
    const [m] = await db.all("SELECT value FROM studio_meta WHERE key = 'revision'");
    await db.run(
      "INSERT INTO studio_ops (op_id, rev, author, what, state, effects, at) VALUES ('del', $1, 'lea', 'w', 'intent', $2, 0)",
      [Number(m!.value) + 1, JSON.stringify([{ path: 'notes.json', before: sha256('{}'), after: ABSENT }])],
    );
    const k = await open();
    expect(existsSync(join(game, 'notes.json'))).toBe(false);
    expect((await k.file('notes.json')).blob).toBe(ABSENT);
    await k.close();
  });
});

describe('the files it follows', () => {
  it.skipIf(process.platform === 'win32')('never a symbolic link', async () => {
    symlinkSync(join(game, 'notes.json'), join(game, 'link.json'));
    const j = await open();
    expect((await j.file('link.json')).blob).toBe(ABSENT);
    await j.close();
  });

  it('trusts its cache for a file whose size and time did not move (its stated limit: a rewrite of the same size within the same time is not seen)', async () => {
    const f = join(game, 'rooms', 'a.ts');
    const t = new Date(Math.floor(Date.now() / 1000) * 1000 - 60_000);
    utimesSync(f, t, t);
    const j = await open();
    expect((await j.file('rooms/a.ts')).blob).toBe(sha256('a0'));
    writeFileSync(f, 'b0');
    utimesSync(f, t, t);
    await write(j, 'notes.json', '{"n":1}');
    expect((await j.file('rooms/a.ts')).blob).toBe(sha256('a0'));
    await j.close();
  });

  it('sees a file rewritten with another size even when its time did not move, and one whose time moved', async () => {
    const f = join(game, 'rooms', 'a.ts');
    // Whole seconds: a time set twice is then exactly the same (a sub-millisecond time would not survive utimes).
    const t = new Date(Math.floor(Date.now() / 1000) * 1000 - 60_000);
    utimesSync(f, t, t);
    const j = await open();
    expect((await j.file('rooms/a.ts')).blob).toBe(sha256('a0'));
    writeFileSync(f, 'a-longer-content');
    utimesSync(f, t, t);
    await write(j, 'notes.json', '{"n":1}');
    expect((await j.file('rooms/a.ts')).blob).toBe(sha256('a-longer-content'));
    // The same size, another time: read again too.
    writeFileSync(f, 'b-longer-content');
    utimesSync(f, t, new Date(t.getTime() + 5_000));
    await write(j, 'notes.json', '{"n":2}');
    expect((await j.file('rooms/a.ts')).blob).toBe(sha256('b-longer-content'));
    await j.close();
  });

  it('neither dot-files nor folders; a game folder that does not exist yet is an empty game', async () => {
    writeFileSync(join(game, '.secret'), 'x');
    mkdirSync(join(game, 'empty-dir'));
    const j = await open();
    expect((await j.file('.secret')).blob).toBe(ABSENT);
    expect((await j.file('empty-dir')).blob).toBe(ABSENT);
    expect((await j.file('rooms/a.ts')).blob).toBe(sha256('a0'));
    await j.close();
    rmSync(game, { recursive: true });
    const k = await open();
    expect(await k.revision()).toBeGreaterThan(0);
    await k.close();
  });

  it('refuses a folder as a file, and a path outside the game', async () => {
    const j = await open();
    await expect(write(j, 'rooms', 'x')).rejects.toMatchObject({ status: 409 });
    await expect(write(j, '../escape.ts', 'x')).rejects.toThrow(/not a path in the game/);
    await expect(write(j, '/etc/x', 'x')).rejects.toThrow(/not a path in the game/);
    await j.close();
  });
});

describe('the lease', () => {
  it('an expired lease, another fence, or no lease at all cannot log an operation', async () => {
    for (const forge of [
      'UPDATE studio_lease SET until_ms = 0 WHERE id = 1',
      'UPDATE studio_lease SET fence = fence + 1 WHERE id = 1',
      'DELETE FROM studio_lease',
    ]) {
      const j = await open({ leaseMs: 60_000 });
      const db = await openDb();
      const e = await j
        .apply({
          author: 'lea',
          what: 'w',
          effects: [{ path: 'rooms/a.ts', after: `a-${forge.length}` }],
          guard: async () => {
            await db.run(forge);
          },
          respond: () => 0,
        })
        .catch((x: unknown) => x);
      expect(e, forge).toBeInstanceOf(LeaseLostError);
      expect(read('rooms/a.ts')).toBe('a0');
      await db.run('DELETE FROM studio_lease');
      await j.close();
    }
  });

  it('reads the time on the database: Postgres has its own expression', async () => {
    // A SQLite database that says it is Postgres: the journal must ask for clock_timestamp(), answered here by SQLite.
    const real = await openDb();
    let asked = 0;
    const toSqlite = (sql: string) => {
      if (!sql.includes('clock_timestamp()')) return sql;
      asked++;
      return sql.replaceAll(
        '(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT',
        "CAST(unixepoch('subsec') * 1000 AS INTEGER)",
      );
    };
    type Q = {
      all(s: string, p?: unknown[]): Promise<unknown>;
      run(s: string, p?: unknown[]): Promise<unknown>;
      exec(s: string): Promise<void>;
    };
    const wrap = (q: Q) => ({
      all: (sql: string, p?: unknown[]) => q.all(toSqlite(sql), p),
      run: (sql: string, p?: unknown[]) => q.run(toSqlite(sql), p),
      exec: (sql: string) => q.exec(toSqlite(sql)),
    });
    const pg = {
      ...wrap(real),
      dialect: 'postgres' as const,
      tx: (k: string | undefined, fn: (q: unknown) => Promise<unknown>, o?: unknown) =>
        real.tx(k, (q) => fn(wrap(q)), o as never),
      close: () => real.close(),
    };
    const j = await Journal.open({ db: pg as never, blobs: fsBlobStore(join(root, 'blobs')), gameDir: game });
    await write(j, 'rooms/a.ts', 'a1');
    expect(asked).toBeGreaterThan(0);
    await j.close();
  });

  it('a lease that ends in the very millisecond of the check is over (the database clock pinned)', async () => {
    // The database's clock answered by the test: the lease is taken at 1 000, lasts 60 s; the check reads its end.
    const real = await openDb();
    let now = 1_000;
    const CLOCK = "CAST(unixepoch('subsec') * 1000 AS INTEGER)";
    const pin = (sql: string) => sql.replaceAll(CLOCK, () => String(now));
    type Q = {
      all(s: string, p?: unknown[]): Promise<unknown>;
      run(s: string, p?: unknown[]): Promise<unknown>;
      exec(s: string): Promise<void>;
    };
    const wrap = (q: Q) => ({
      all: (sql: string, p?: unknown[]) => q.all(pin(sql), p),
      run: (sql: string, p?: unknown[]) => q.run(pin(sql), p),
      exec: (sql: string) => q.exec(pin(sql)),
    });
    const db = {
      ...wrap(real),
      dialect: 'sqlite' as const,
      tx: (k: string | undefined, fn: (q: unknown) => Promise<unknown>, o?: unknown) =>
        real.tx(k, (q) => fn(wrap(q)), o as never),
      close: () => real.close(),
    };
    const j = await Journal.open({
      db: db as never,
      blobs: fsBlobStore(join(root, 'blobs')),
      gameDir: game,
      leaseMs: 60_000,
    });
    const e = await j
      .apply({
        author: 'lea',
        what: 'w',
        effects: [{ path: 'rooms/a.ts', after: 'a1' }],
        guard: async () => {
          const [l] = (await real.all('SELECT until_ms FROM studio_lease WHERE id = 1')) as { until_ms: number }[];
          now = Number(l!.until_ms);
        },
        respond: () => 0,
      })
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(LeaseLostError);
    expect(read('rooms/a.ts')).toBe('a0');
    await j.close();
  });

  it('waits for another writer, takes the lease once it is free, and its fence only grows', async () => {
    const j = await open({ leaseWaitMs: 3_000 });
    const db = await openDb();
    // Another process holds the lease (fence 5) for a minute, then lets it go after 400 ms.
    await db.run('DELETE FROM studio_lease');
    await db.run("INSERT INTO studio_lease (id, holder, fence, until_ms) VALUES (1, 'other', 5, $1)", [
      Date.now() + 60_000,
    ]);
    setTimeout(() => void db.run("UPDATE studio_lease SET until_ms = 0 WHERE holder = 'other'"), 400);
    let fence = 0;
    const t0 = Date.now();
    await j.apply({
      author: 'lea',
      what: 'w',
      effects: [{ path: 'rooms/a.ts', after: 'a1' }],
      guard: async () => {
        fence = Number((await db.all('SELECT fence FROM studio_lease WHERE id = 1'))[0]?.fence);
      },
      respond: () => 0,
    });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(300);
    expect(read('rooms/a.ts')).toBe('a1');
    expect(fence).toBe(6);
    await j.close();
  });

  it('gives up waiting as a 503 to retry, never a conflict (4.2.3: an instance starting beside it)', async () => {
    const j = await open({ leaseWaitMs: 200 });
    const db = await openDb();
    await db.run('DELETE FROM studio_lease');
    await db.run("INSERT INTO studio_lease (id, holder, fence, until_ms) VALUES (1, 'other', 5, $1)", [
      Date.now() + 60_000,
    ]);
    await expect(write(j, 'rooms/a.ts', 'a1')).rejects.toMatchObject({ status: 503 });
    expect(read('rooms/a.ts')).toBe('a0');
    await db.run('DELETE FROM studio_lease');
    await j.close();
  });
});

describe('a past revision read back (4.2.2: the bisection, the undo)', () => {
  it('rebuilds the files at a revision, sorted by path, every file unless told, a file made later absent', async () => {
    const j = await open({ hosted: true });
    const base = await j.revision();
    await write(j, 'zeta.md', 'z1');
    await write(j, 'rooms/a.ts', 'a1');
    const mid = await j.revision();
    await write(j, 'alpha.md', 'later');
    await write(j, 'rooms/a.ts', 'a2');
    const at = await j.filesAt(mid);
    // Sorted by path, whatever the order the head's rows come in; alpha.md did not exist yet.
    expect(at.map((f) => f.path)).toEqual(['notes.json', 'rooms/a.ts', 'zeta.md']);
    expect(at.map((f) => f.bytes.toString())).toEqual(['{}', 'a1', 'z1']);
    expect((await j.filesAt(base)).map((f) => f.path)).toEqual(['notes.json', 'rooms/a.ts']);
    expect((await j.filesAt(mid, (p) => p !== 'zeta.md')).map((f) => f.path)).toEqual(['notes.json', 'rooms/a.ts']);
    await j.close();
  });

  it('reads a blob through the cache when it is there, and fills it when it is not', async () => {
    const j = await open({ hosted: true });
    await write(j, 'rooms/a.ts', 'a1');
    const rev = await j.revision();
    const cache = new Map<string, Buffer>([[sha256(Buffer.from('a1')), Buffer.from('from the cache')]]);
    const at = await j.filesAt(rev, () => true, cache);
    expect(at.find((f) => f.path === 'rooms/a.ts')!.bytes.toString()).toBe('from the cache');
    expect(cache.get(sha256(Buffer.from('{}')))?.toString()).toBe('{}');
    await j.close();
  });

  it("says an operation's effects and what it was, and nothing for a revision no operation made", async () => {
    const j = await open({ hosted: true });
    await write(j, 'rooms/a.ts', 'a1');
    const rev = await j.revision();
    expect(await j.effectsAt(rev)).toEqual([
      { path: 'rooms/a.ts', before: sha256(Buffer.from('a0')), after: sha256(Buffer.from('a1')) },
    ]);
    expect(await j.effectsAt(rev + 5)).toEqual([]);
    expect(await j.opAt(rev)).toMatchObject({ rev, what: 'w', paths: ['rooms/a.ts'] });
    expect(await j.opAt(rev + 5)).toBeUndefined();
    await j.close();
  });
});

describe('the revision read (4.2.3, H10)', () => {
  // Tom's tab writes from what it read; Léa (`write`, no client) wrote meanwhile.
  const at = (j: Journal, path: string, after: string | Buffer | null, readAt: number, client = 'tab-tom-1') =>
    j.apply({
      author: client.split('-')[1]!,
      client,
      what: 'w',
      effects: [{ path, after }],
      readAt,
      respond: (rev) => rev,
    });
  const refusal = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      return { status: (e as { status: number }).status, body: (e as { body: Record<string, unknown> }).body };
    }
    throw new Error('not refused');
  };

  it('takes a write read at the head or after the file was last written, refuses one read before, saying both texts', async () => {
    const j = await open({ hosted: true });
    const r0 = await j.revision();
    await write(j, 'rooms/a.ts', 'a1');
    const r1 = await j.revision();
    await write(j, 'notes.json', '{"n":1}');
    // Read at r1: rooms/a.ts was last written at r1, so a write from there is no conflict (Léa's, here).
    expect(await at(j, 'rooms/a.ts', 'a2', r1, 'tab-lea-1')).toMatchObject({ rev: r1 + 2 });
    // Read at r0, before a1 and a2: refused, with the file at r0 and now.
    const r = await refusal(at(j, 'rooms/a.ts', 'mine', r0));
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ path: 'rooms/a.ts', readAt: r0, head: r1 + 2, before: 'a0', now: 'a2' });
    expect(read('rooms/a.ts')).toBe('a2');
    await j.close();
  });

  it("never counts a client's own writes since its read; another client's are counted, the same member's too", async () => {
    const j = await open({ hosted: true });
    const r0 = await j.revision();
    expect(await at(j, 'rooms/a.ts', 'a1', r0, 'tab-lea-1')).toMatchObject({ rev: r0 + 1 });
    // The same tab, still from r0: its own write since is no conflict.
    expect(await at(j, 'rooms/a.ts', 'a2', r0, 'tab-lea-1')).toMatchObject({ rev: r0 + 2 });
    // Léa's other tab (or an agent of hers through the MCP), from r0: refused, it never saw a1 and a2.
    expect((await refusal(at(j, 'rooms/a.ts', 'a3', r0, 'tab-lea-2'))).status).toBe(409);
    // Another client's write of another file refuses nothing.
    const r2 = await j.revision();
    await at(j, 'notes.json', '{"n":2}', r2, 'tab-tom-1');
    expect(await at(j, 'rooms/a.ts', 'a4', r2, 'tab-lea-1')).toMatchObject({ rev: r2 + 2 });
    // A write that names no client has no own writes: every write since counts.
    const r4 = await j.revision();
    await at(j, 'rooms/a.ts', 'a5', r4, 'tab-lea-1');
    await expect(
      j.apply({
        author: 'lea',
        what: 'w',
        effects: [{ path: 'rooms/a.ts', after: 'x' }],
        readAt: r4,
        respond: (v) => v,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await j.close();
  });

  it('finds the writes of a path whose name LIKE would read as a pattern, and of one JSON escapes', async () => {
    const j = await open({ hosted: true });
    const r0 = await j.revision();
    await write(j, 'a_b%.md', 'x');
    await write(j, 'axb.md', 'y');
    // `_`, `%` and the escape `!` are taken as they are: axb.md's write is not a_b%.md's.
    expect((await refusal(at(j, 'a_b%.md', 'z', r0))).body).toMatchObject({ before: null, now: 'x' });
    const r1 = await j.revision();
    await write(j, 'axb.md', 'y2');
    expect((await at(j, 'a_b%.md', 'z', r1)).rev).toBeGreaterThan(r1);
    await write(j, 'b!x.md', 'b');
    expect((await refusal(at(j, 'b!x.md', 'z', r0))).body).toMatchObject({ before: null, now: 'b' });
    // A name JSON escapes (a quote): not a file name Windows takes.
    if (process.platform !== 'win32') {
      await write(j, 'q"uote.md', 'q');
      expect((await refusal(at(j, 'q"uote.md', 'z', r0))).body).toMatchObject({ before: null, now: 'q' });
    }
    await j.close();
  });

  it('says a new file, a removed one, a binary one, a long one and a non-UTF-8 one without their text', async () => {
    const j = await open({ hosted: true });
    const r0 = await j.revision();
    await write(j, 'new.md', 'n');
    expect((await refusal(at(j, 'new.md', 'x', r0))).body).toMatchObject({ before: null, now: 'n' });
    const r1 = await j.revision();
    await write(j, 'new.md', null);
    expect((await refusal(at(j, 'new.md', 'x', r1))).body).toMatchObject({ before: 'n', now: null });
    for (const bytes of [Buffer.from([0x61, 0, 0x62]), Buffer.alloc(256 * 1024 + 1, 0x61), Buffer.from([0xff, 0xfe])]) {
      const r = await j.revision();
      await j.apply({ author: 'lea', what: 'w', effects: [{ path: 'b.bin', after: bytes }], respond: (v) => v });
      expect((await refusal(at(j, 'b.bin', 'x', r))).body.now).toBeNull();
    }
    // Exactly 256 KiB of text is still said.
    const r = await j.revision();
    await write(j, 'big.md', 'a'.repeat(256 * 1024));
    expect(String((await refusal(at(j, 'big.md', 'x', r))).body.now).length).toBe(256 * 1024);
    await j.close();
  });

  it("finds a file's content at a revision: the first later operation's before, else the head", async () => {
    const j = await open({ hosted: true });
    const r0 = await j.revision();
    await write(j, 'rooms/a.ts', 'a1');
    const r1 = await j.revision();
    await write(j, 'notes.json', '{"n":1}');
    await write(j, 'rooms/a.ts', 'a2');
    expect(await j.blobAt('rooms/a.ts', r0)).toBe(sha256(Buffer.from('a0')));
    expect(await j.blobAt('rooms/a.ts', r1)).toBe(sha256(Buffer.from('a1')));
    expect(await j.blobAt('rooms/a.ts', await j.revision())).toBe(sha256(Buffer.from('a2')));
    expect(await j.blobAt('never.md', r0)).toBe(ABSENT);
    // An operation that wrote two files: the "before" of the one asked.
    const r3 = await j.revision();
    await j.apply({
      author: 'lea',
      what: 'two',
      effects: [
        { path: 'notes.json', after: '{"n":2}' },
        { path: 'rooms/a.ts', after: 'a3' },
      ],
      respond: (v) => v,
    });
    expect(await j.blobAt('rooms/a.ts', r3)).toBe(sha256(Buffer.from('a2')));
    await j.close();
  });
});
