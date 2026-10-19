// The Studio Server's backup, restore, journal shipping and collection (4.2.2 PR 7, plan §2.7, G7): every table of
// the migrations is kept or skipped, said; a backup restored into an empty project gives the same head, then the
// journal shipped since brings it to the last operation shipped; a backup altered, a project not empty, a blob
// missing, another schema are refused; the RPO is the age of what is not shipped yet; the collection keeps what a row
// names and what is young, and deletes only when asked.
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../bridge/src/migrations';
import type { SqlDb } from '../bridge/src/store-sql';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { backupOf, checkBackup, restoreInto, TABLES } from '../studio-server/src/ops/backup';
import { type BlobStore, fsBlobStore } from '../studio-server/src/ops/blobs';
import { collect } from '../studio-server/src/ops/gc';
import { Journal } from '../studio-server/src/ops/journal';
import { finishRestore, replaySegments, type Segments, Shipper } from '../studio-server/src/ops/ship';

const ROOT = join(import.meta.dirname, '..');
const MIGRATIONS = new URL('../studio-server/migrations/', import.meta.url);
let tmp: string, blobs: BlobStore, dbs: SqlDb[];

beforeEach(() => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-backup-'));
  blobs = fsBlobStore(join(tmp, 'blobs'));
  dbs = [];
});
afterEach(async () => {
  for (const d of dbs) await d.close().catch(() => undefined);
  rmSync(tmp, { recursive: true, force: true });
});

const openDb = async (name: string) => {
  const d = await openSqliteDb(join(tmp, `${name}.sqlite`));
  dbs.push(d);
  return d;
};
/** A hosted project with a few operations. */
async function project(name = 'a') {
  const db = await openDb(name);
  const game = join(tmp, `game-${name}`);
  cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
  const j = await Journal.open({ db, blobs, gameDir: game, hosted: true });
  const write = (path: string, after: string | null) =>
    j.apply({ author: 'lea', what: `w ${path}`, effects: [{ path, after }], respond: (rev) => rev });
  return { db, j, game, write };
}
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
const head = async (db: SqlDb) =>
  (await db.all('SELECT path, blob FROM studio_files ORDER BY path')).map((r) => `${r.path}=${r.blob}`);

describe("the Studio Server's backup", () => {
  it('knows every table of the migrations: kept, or skipped with why', () => {
    const made = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.up.sql'))
      .flatMap((f) =>
        [...readFileSync(new URL(f, MIGRATIONS), 'utf8').matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1]!),
      );
    expect([...new Set(made)].sort()).toEqual(Object.keys(TABLES).sort());
  });

  it('restores into an empty project the same head, then replays the journal shipped since', async () => {
    const a = await project('a');
    await a.write('notes.md', 'one');
    const segments = memorySegments();
    const ship = new Shipper({ db: a.db, segments });
    await ship.ship();
    const b = await backupOf(a.db);
    expect(b.blobs.length).toBeGreaterThan(0);
    // After the backup: two operations, shipped.
    await a.write('notes.md', 'two');
    await a.write('extra.md', 'three');
    await ship.ship();
    expect([...segments.m.keys()].length).toBe(await a.j.revision());
    expect(await ship.rpoMs()).toBe(0);
    const backup = checkBackup(JSON.parse(JSON.stringify(b)));
    const fresh = await openDb('restored');
    await migrate(fresh, { dir: MIGRATIONS });
    await restoreInto(fresh, blobs, backup);
    const [rev] = await fresh.all("SELECT value FROM studio_meta WHERE key = 'revision'");
    expect(Number(rev!.value)).toBe(b.revision);
    expect(await replaySegments(fresh, segments, blobs)).toEqual({
      revision: await a.j.revision(),
      stopped: undefined,
    });
    expect(await head(fresh)).toEqual(await head(a.db));
    // The restore ended: the instance ships on a new line, never over the segments of the one it left.
    const before = new Map(segments.m);
    await finishRestore(fresh);
    // The restored project opens: its folder made from the head.
    const game = join(tmp, 'game-restored');
    mkdirSync(game);
    const j = await Journal.open({ db: fresh, blobs, gameDir: game, hosted: true });
    expect(await j.revision()).toBe(await a.j.revision());
    expect(readFileSync(join(game, 'extra.md'), 'utf8')).toBe('three');
    await j.apply({ author: 'lea', what: 'w', effects: [{ path: 'notes.md', after: 'four' }], respond: () => 0 });
    await new Shipper({ db: fresh, segments }).ship();
    expect(segments.m.size).toBe(before.size + 1);
    for (const [k, v] of before) expect(segments.m.get(k)).toEqual(v);
    await j.close();
    await a.j.close();
  });

  it('refuses a backup altered, a project not empty, a blob missing, another schema', async () => {
    const a = await project('a');
    await a.write('notes.md', 'one');
    const b = await backupOf(a.db);
    expect(() => checkBackup({ ...b, revision: 99, tables: { ...b.tables, studio_meta: [] } })).toThrow(/digest/);
    expect(() => checkBackup({ ...b, format: 'x' })).toThrow(/not a Studio Server backup/);
    await expect(restoreInto(a.db, blobs, b)).rejects.toThrow(/not empty/);
    const fresh = await openDb('fresh');
    await migrate(fresh, { dir: MIGRATIONS });
    await expect(restoreInto(fresh, fsBlobStore(join(tmp, 'no-blobs')), b)).rejects.toThrow(/missing/);
    await expect(restoreInto(fresh, blobs, { ...b, schema: b.schema + 1 })).rejects.toThrow(/schema/);
    await a.j.close();
  });

  it('says the RPO: the age of the oldest operation not shipped yet', async () => {
    const a = await project('a');
    await a.write('notes.md', 'one');
    let now = Date.now() + 5_000;
    const down = { ...memorySegments(), put: async () => Promise.reject(new Error('the bucket is away')) };
    const log: Record<string, unknown>[] = [];
    const ship = new Shipper({ db: a.db, segments: down, now: () => now, log: (l) => void log.push(l) });
    await ship.ship();
    expect(log.at(-1)).toMatchObject({ event: 'ship-failed' });
    expect(await ship.rpoMs()).toBeGreaterThanOrEqual(5_000);
    now += 1_000;
    expect(await ship.rpoMs()).toBeGreaterThanOrEqual(6_000);
    await a.j.close();
  });

  it('ships what another process confirmed, without an event here (4.2.3, the CLI import)', async () => {
    const a = await project('a');
    const segments = memorySegments();
    const ship = new Shipper({ db: a.db, segments });
    // Written through the journal but never announced to this shipper: as a CLI against the same database.
    await a.write('notes.md', 'one');
    await ship.ship();
    const before = segments.m.size;
    await a.write('notes.md', 'two');
    expect(segments.m.size).toBe(before);
    ship.watch(20);
    await expect.poll(() => segments.m.size, { timeout: 2_000 }).toBe(await a.j.revision());
    expect(await ship.rpoMs()).toBe(0);
    ship.close();
    await a.j.close();
  });

  it('stops a replay at a gap: nothing applied out of order', async () => {
    const a = await project('a');
    await a.write('notes.md', 'one');
    const b = await backupOf(a.db);
    await a.write('notes.md', 'two');
    await a.write('notes.md', 'three');
    const segments = memorySegments();
    await new Shipper({ db: a.db, segments }).ship();
    const missing = [...segments.m.keys()].sort()[b.revision]!; // the one right after the backup
    segments.m.delete(missing);
    const fresh = await openDb('fresh');
    await migrate(fresh, { dir: MIGRATIONS });
    await restoreInto(fresh, blobs, b);
    expect(await replaySegments(fresh, segments, blobs)).toEqual({ revision: b.revision, stopped: 'gap' });
    await a.j.close();
  });

  it('stops a replay that does not continue the head, or whose blob is missing', async () => {
    const a = await project('a');
    await a.write('notes.md', 'one');
    const b = await backupOf(a.db);
    await a.write('notes.md', 'two');
    const segments = memorySegments();
    await new Shipper({ db: a.db, segments }).ship();
    const fresh = await openDb('fresh');
    await migrate(fresh, { dir: MIGRATIONS });
    await restoreInto(fresh, blobs, b);
    expect(await replaySegments(fresh, segments, fsBlobStore(join(tmp, 'no-blobs')))).toEqual({
      revision: b.revision,
      stopped: 'blob-missing',
    });
    // Another timeline's segment at the next revision: its `before` is not the head's.
    const key = [...segments.m.keys()].sort().at(-1)!;
    const s = JSON.parse(segments.m.get(key)!.toString());
    s.op.effects = JSON.stringify(
      (JSON.parse(s.op.effects) as { before: string }[]).map((e) => ({ ...e, before: 'f'.repeat(64) })),
    );
    segments.m.set(key, Buffer.from(JSON.stringify(s)));
    expect(await replaySegments(fresh, segments, blobs)).toEqual({ revision: b.revision, stopped: 'not-the-head' });
    expect(await head(fresh)).toEqual(b.tables.studio_files!.map((r) => `${r.path}=${r.blob}`).sort());
    await a.j.close();
  });

  it('keeps only confirmed operations, refuses a column the schema has not, leaves out what was collected', async () => {
    const a = await project('a');
    await a.write('notes.md', 'one');
    const rev = await a.j.revision();
    await a.db.run(
      "INSERT INTO studio_ops (op_id, rev, author, what, state, effects, response, at) VALUES ('stuck', $1, 'lea', 'w', 'intent', '[]', NULL, 0)",
      [rev + 1],
    );
    const gone = 'e'.repeat(64);
    await a.db.run(
      'INSERT INTO studio_previews (epoch, rev, manifest, failed, ms, made_at) VALUES ($1, $2, $3, NULL, 1, 1)',
      [await a.j.epoch(), rev, JSON.stringify({ 'index.html': gone })],
    );
    const b = await backupOf(a.db);
    expect(b.tables.studio_ops!.every((r) => r.state === 'confirmed')).toBe(true);
    const fresh = await openDb('fresh');
    await migrate(fresh, { dir: MIGRATIONS });
    const odd = { ...b, tables: { ...b.tables, studio_audit: [{ 'at) VALUES (1); DROP TABLE studio_files; --': 1 }] } };
    await expect(restoreInto(fresh, blobs, odd)).rejects.toThrow(/has no column/);
    expect(await restoreInto(fresh, blobs, b)).toMatchObject({ dropped: 1 });
    expect(await fresh.all('SELECT rev FROM studio_previews')).toEqual([]);
    await a.db.run("DELETE FROM studio_ops WHERE op_id = 'stuck'");
    await a.j.close();
  });

  it('ships again after a failure, without waiting for the next operation', async () => {
    const a = await project('a');
    await a.write('notes.md', 'one');
    const segments = memorySegments();
    let fail = true;
    const flaky = {
      ...segments,
      put: (k: string, v: Buffer) => (fail ? Promise.reject(new Error('away')) : segments.put(k, v)),
    };
    const ship = new Shipper({ db: a.db, segments: flaky, retryMs: 20 });
    await ship.ship();
    expect(segments.m.size).toBe(0);
    fail = false;
    await expect.poll(() => segments.m.size, { timeout: 2_000 }).toBe(await a.j.revision());
    ship.close();
    await a.j.close();
  });
});

describe('the collection of the blobs', () => {
  it('keeps what a row names and what is young; deletes the rest only when asked', async () => {
    const a = await project('a');
    await a.write('notes.md', 'one');
    const orphan = await blobs.put(Buffer.from('nobody names me'));
    const young = await blobs.put(Buffer.from('written a moment ago'));
    const now = Date.now() + 2 * 86_400_000;
    // Stored again: its date is now, the grace period covers it (a write naming an old blob again).
    const file = join(tmp, 'blobs', orphan.slice(0, 2), orphan.slice(2));
    utimesSync(file, 0, 0);
    await blobs.put(Buffer.from('nobody names me'));
    expect(statSync(file).mtimeMs).toBeGreaterThan(0);
    // The young one: written "now" as far as the collection is concerned.
    const listed = blobs.list!.bind(blobs);
    const store: BlobStore = {
      ...blobs,
      list: async function* () {
        for await (const b of listed()) yield b.hash === young ? { ...b, at: now } : b;
      },
    };
    const staged: string[] = [];
    const staging = {
      list: async function* () {
        yield { key: 'staging/j1/snapshot.json', at: now - 2 * 3_600_000 };
        yield { key: 'staging/j2/snapshot.json', at: now - 60_000 };
      },
      delete: async (k: string) => void staged.push(k),
    };
    const dry = await collect(a.db, store, { delete: false, now, staging });
    expect(dry.unreferenced).toEqual([orphan]);
    expect(dry).toMatchObject({ removed: 0, staging: 1 });
    expect(await blobs.has(orphan)).toBe(true);
    const done = await collect(a.db, store, { delete: true, now, staging });
    expect(done.removed).toBe(1);
    expect(await blobs.has(orphan)).toBe(false);
    expect(await blobs.has(young)).toBe(true);
    expect(staged).toEqual(['staging/j1/snapshot.json']);
    // What the head names stays.
    for (const r of await a.db.all("SELECT blob FROM studio_files WHERE blob <> 'absent'"))
      expect(await blobs.has(String(r.blob))).toBe(true);
    writeFileSync(join(tmp, 'x'), '');
    await a.j.close();
  });
});
