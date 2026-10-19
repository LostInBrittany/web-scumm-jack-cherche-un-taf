// The prepared assets' folders (4.2.2, studio-server/src/server/prepared.ts), pinned for the mutation set
// `studio-workshop` (4.2.3 PR 10): a start with no set logs nothing; a set written again over its own folder leaves
// nothing stale; a start that finds a newer set serves it and drops the old folder (gone already or not); a refused
// manifest takes its folder away with it; a second run drops the first one's folder (gone already or not); a slow
// start never brings an older set back over one a Prepare served meanwhile (4.2.3).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../bridge/src/migrations';
import type { SqlDb } from '../bridge/src/store-sql';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { type BlobStore, fsBlobStore } from '../studio-server/src/ops/blobs';
import { PreparedAssets } from '../studio-server/src/server/prepared';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, db: SqlDb, blobs: BlobStore, dir: string;

beforeEach(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-workshop-prepared-'));
  db = await openSqliteDb(join(tmp, 'j.sqlite'));
  await migrate(db, { dir: new URL('../studio-server/migrations/', import.meta.url) });
  blobs = fsBlobStore(join(tmp, 'blobs'));
  dir = join(tmp, 'prepared');
});
afterEach(async () => {
  await db.close();
  rmSync(tmp, { recursive: true, force: true });
});

function assets(o: { refuse?: boolean; none?: boolean } = {}) {
  const log: Record<string, unknown>[] = [];
  const p = new PreparedAssets({
    db,
    blobs,
    dir,
    snapshot: async () => ({ epoch: 'e1', rev: 7, bytes: Buffer.from('snap') }),
    prepare: async () => ({
      files: (o.none ? {} : { 'assets/img/a.webp': Buffer.from('A').toString('base64') }) as Record<string, string>,
      manifest: '{"images":{}}',
      log: 'images: 1 ready',
    }),
    currentManifest: () => null,
    writeManifest: async () => {
      if (o.refuse) throw new Error('refused by the guard');
    },
    log: (l) => void log.push(l),
    exclusive: (fn) => fn(),
  });
  return { p, log };
}
const folders = () => (existsSync(dir) ? readdirSync(dir).sort() : []);

describe('the prepared sets at start', () => {
  it('never serve the older set a slow start ends with, after a Prepare ended meanwhile (4.2.3)', async () => {
    const { p, log } = assets();
    // Set 1, of two files, prepared by an earlier instance.
    const one = {
      'assets/img/x.webp': await blobs.put(Buffer.from('X')),
      'assets/img/y.webp': await blobs.put(Buffer.from('Y')),
    };
    await db.run(
      "INSERT INTO studio_prepared (id, epoch, rev, manifest, made_by, made_at) VALUES (1, 'e1', 6, $1, 'lea', 1)",
      [JSON.stringify(one)],
    );
    // The start reads set 1's second blob slowly; a Prepare (set 2) ends in the meantime.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let reading!: () => void;
    const read = new Promise<void>((r) => (reading = r));
    const get = blobs.get.bind(blobs);
    let calls = 0;
    blobs.get = async (h) => {
      if (++calls === 2) {
        blobs.get = get;
        reading();
        await held;
      }
      return get(h);
    };
    const starting = p.start();
    await read;
    await p.prepare('max');
    expect(p.folder()).toBe(join(dir, '2'));
    release();
    await starting;
    expect(log).toEqual([]);
    expect(p.folder()).toBe(join(dir, '2'));
    expect(folders()).toEqual(['2']);
  });

  it('log nothing when no set was ever prepared', async () => {
    const { p, log } = assets();
    await p.start();
    expect(log).toEqual([]);
    expect(p.folder()).toBeNull();
  });

  it('write a set again over its own folder, nothing stale left', async () => {
    const { p, log } = assets();
    await p.prepare('lea');
    writeFileSync(join(dir, '1', 'stale.png'), 'old');
    await p.start();
    expect(log).toEqual([]);
    expect(readdirSync(join(dir, '1'))).toEqual(['assets']);
  });

  for (const gone of [false, true])
    it(`serve a newer set found at start and drop the old folder${gone ? ', gone already' : ''}`, async () => {
      const { p, log } = assets();
      await p.prepare('lea');
      const hash = await blobs.put(Buffer.from('B'));
      await db.run(
        "INSERT INTO studio_prepared (id, epoch, rev, manifest, made_by, made_at) VALUES (2, 'e1', 8, $1, 'max', 1)",
        [JSON.stringify({ 'assets/img/b.webp': hash })],
      );
      if (gone) rmSync(join(dir, '1'), { recursive: true });
      await p.start();
      expect(log).toEqual([]);
      expect(p.folder()).toBe(join(dir, '2'));
      expect(folders()).toEqual(['2']);
    });
});

describe('a run of "Prepare assets"', () => {
  it('takes its folder away when its manifest is refused', async () => {
    const { p } = assets({ refuse: true });
    await expect(p.prepare('lea')).rejects.toThrow('refused by the guard');
    expect(folders()).toEqual([]);
    expect(await db.all('SELECT id FROM studio_prepared')).toEqual([]);
    expect(p.folder()).toBeNull();
    // A set of no file has no folder to take away: the refusal is still the one said.
    await expect(assets({ refuse: true, none: true }).p.prepare('lea')).rejects.toThrow('refused by the guard');
  });

  for (const gone of [false, true])
    it(`drops the previous run's folder${gone ? ', gone already' : ''}`, async () => {
      const { p } = assets();
      await p.prepare('lea');
      if (gone) rmSync(join(dir, '1'), { recursive: true });
      expect(await p.prepare('lea')).toMatchObject({ id: 2 });
      expect(folders()).toEqual(['2']);
    });
});
