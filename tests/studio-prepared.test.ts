// The prepared assets (4.2.2 PR 6b, D43): a "Prepare assets" runs under the member's exclusive lease, keeps its files
// by content, writes the game's manifest as one operation, and serves the latest set before `publicDir`, written again
// to the instance's folder at start; one at a time; a failure keeps nothing. Underneath: a version 2 snapshot carries
// the art and sounds, and a real `prepare` runs in the worker's child where Python has the asset tools' packages.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../bridge/src/migrations';
import type { SqlDb } from '../bridge/src/store-sql';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { PreparedAssets } from '../studio-server/src/server/prepared';
import { assetDirs, findAsset } from '../studio-server/src/server/previews';
import { localPrepare } from '../studio-server/src/worker/local';
import { preparedShape, pythonPathOf } from '../studio-server/src/worker/prepare';
import { filesOf, packAssets, packSnapshot, unpackSnapshot } from '../studio-server/src/worker/snapshot';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, db: SqlDb;
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

beforeEach(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-prepared-'));
  db = await openSqliteDb(join(tmp, 'j.sqlite'));
  await migrate(db, { dir: new URL('../studio-server/migrations/', import.meta.url) });
});
afterEach(async () => {
  await db.close();
  rmSync(tmp, { recursive: true, force: true });
});

const store = (o: {
  fail?: boolean;
  log: string[];
  current?: string | null;
  manifest?: string;
  refuseManifest?: boolean;
  seen?: Record<string, unknown>[];
}) =>
  new PreparedAssets({
    db,
    blobs: fsBlobStore(join(tmp, 'blobs')),
    dir: join(tmp, 'prepared'),
    snapshot: async () => ({ epoch: 'e1', rev: 7, bytes: Buffer.from('snap') }),
    prepare: async (bytes, at) => {
      o.log.push(`prepare ${bytes.toString()} ${at.rev}`);
      if (o.fail) throw new Error('python3 failed');
      return {
        files: { 'assets/img/a.webp': Buffer.from('A').toString('base64') },
        manifest: o.manifest ?? '{"images":{}}',
        log: 'images: 1 ready',
      };
    },
    currentManifest: () => o.current ?? null,
    writeManifest: async (m) => {
      if (o.refuseManifest) throw new Error('refused by the guard');
      o.log.push(`manifest ${m}`);
    },
    log: (l) => void o.seen?.push(l),
    exclusive: async (fn) => {
      o.log.push('take *');
      try {
        return await fn();
      } finally {
        o.log.push('release *');
      }
    },
  });

describe('the prepared assets', () => {
  it('prepares under the exclusive lease, keeps the set, serves it first, and writes it again at start', async () => {
    const log: string[] = [];
    const p = store({ log });
    expect(p.folder()).toBeNull();
    expect(await p.prepare('Léa')).toEqual({ id: 1, rev: 7, files: 1, log: 'images: 1 ready' });
    expect(log).toEqual(['take *', 'prepare snap 7', 'manifest {"images":{}}', 'release *']);
    expect(readFileSync(join(p.folder()!, 'assets', 'img', 'a.webp'), 'utf8')).toBe('A');
    expect(p.version()).toMatch(/^[0-9a-f]{10}$/);
    expect(await p.list()).toMatchObject([{ id: 1, rev: 7, by: 'Léa', files: 1 }]);
    // A restart (the disk lost): the latest set written again.
    rmSync(join(tmp, 'prepared'), { recursive: true, force: true });
    const again = store({ log: [] });
    await again.start();
    expect(readFileSync(join(again.folder()!, 'assets', 'img', 'a.webp'), 'utf8')).toBe('A');
    expect(again.version()).toBe(p.version());
    // Served before publicDir; anything else from publicDir.
    mkdirSync(join(tmp, 'public', 'assets', 'img'), { recursive: true });
    writeFileSync(join(tmp, 'public', 'assets', 'img', 'a.webp'), 'old');
    writeFileSync(join(tmp, 'public', 'assets', 'img', 'b.webp'), 'B');
    const dirs = assetDirs({ publicDir: join(tmp, 'public'), prepared: () => again.folder() });
    expect(readFileSync(findAsset(dirs, 'assets/img/a.webp')!.file, 'utf8')).toBe('A');
    expect(readFileSync(findAsset(dirs, 'assets/img/b.webp')!.file, 'utf8')).toBe('B');
    expect(findAsset(dirs, '../j.sqlite')).toBeUndefined();
  });

  it('refuses a manifest that loses what the game had, and sets the previous set back when the write is refused', async () => {
    const was = JSON.stringify({ images: { 'cat/r1c1': [1, 1] }, audio: { music: { theme: 'music/theme.mp3' } } });
    const lose = store({ log: [], current: was, manifest: '{"images":{"cat/r1c1":[1,1]},"audio":{"music":{}}}' });
    await expect(lose.prepare('Léa')).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/lose 1 image\(s\) or sound\(s\) .*music theme/),
    });
    expect(await lose.list()).toEqual([]);
    const ok = store({ log: [] });
    await ok.prepare('Léa');
    const first = ok.folder();
    // The manifest's write refused (the guard, a lease): the previous set is served again, the new one forgotten.
    (ok as unknown as { o: { writeManifest: () => Promise<void> } }).o.writeManifest = async () => {
      throw new Error('refused by the guard');
    };
    await expect(ok.prepare('Léa')).rejects.toThrow(/refused by the guard/);
    expect(ok.folder()).toBe(first);
    expect(existsSync(first!)).toBe(true);
    expect((await ok.list()).map((r) => r.id)).toEqual([1]);
  });

  it('logs a set it cannot write again at start, and serves publicDir meanwhile', async () => {
    await store({ log: [] }).prepare('Léa');
    rmSync(join(tmp, 'blobs'), { recursive: true, force: true });
    const seen: Record<string, unknown>[] = [];
    const again = store({ log: [], seen });
    await again.start();
    expect(again.folder()).toBeNull();
    expect(seen[0]).toMatchObject({ event: 'prepared-start-failed' });
  });

  it('keeps nothing when it fails, and prepares one at a time', async () => {
    const p = store({ fail: true, log: [] });
    await expect(p.prepare('Léa')).rejects.toThrow(/python3 failed/);
    expect(await p.list()).toEqual([]);
    const q = store({ log: [] });
    const first = q.prepare('Léa');
    await expect(q.prepare('Tom')).rejects.toMatchObject({ status: 429 });
    await first;
  });
});

describe("the asset tools' Python packages (4.2.3 PR 0, H7)", () => {
  it("are looked for in the worker's own folder, or where WORKER_PYTHON_PATH says", () => {
    // resolve: an absolute path of this platform (a drive letter on Windows).
    const app = resolve('/srv/app');
    expect(pythonPathOf({}, app)).toBe(join(app, '.python'));
    expect(pythonPathOf({ WORKER_PYTHON_PATH: '' }, app)).toBe(join(app, '.python'));
    expect(pythonPathOf({ WORKER_PYTHON_PATH: 'py' }, app)).toBe(join(app, 'py'));
    expect(pythonPathOf({ WORKER_PYTHON_PATH: resolve('/opt/py') }, app)).toBe(resolve('/opt/py'));
  });
});

describe('a snapshot for prepare', () => {
  it('carries the art and sounds (version 2), and a version 1 refuses them', () => {
    const files = [
      { path: 'index.ts', bytes: Buffer.from('export {};') },
      { path: 'art/cat/r1c1.png', bytes: png },
      { path: 'audio/music/theme.mp3', bytes: Buffer.from('ID3') },
      { path: 'art/notes.txt', bytes: Buffer.from('not media') },
      { path: '.env', bytes: Buffer.from('SECRET=1') },
    ];
    const dir = join(tmp, 'unpacked');
    expect(unpackSnapshot(packAssets(files), dir)).toBe(3);
    expect(readFileSync(join(dir, 'art', 'cat', 'r1c1.png')).equals(png)).toBe(true);
    expect(existsSync(join(dir, '.env'))).toBe(false);
    const v1 = Buffer.from(JSON.stringify({ v: 1, files: [{ path: 'art/x.png', b64: png.toString('base64') }] }));
    expect(() => unpackSnapshot(v1, join(tmp, 'v1'))).toThrow(/not a snapshot/);
    const big = [{ path: 'art/huge.png', bytes: Buffer.alloc(32 * 1024 * 1024) }];
    expect(() => packAssets(big)).toThrow(/prepare them on a local Studio/);
  });

  it("checks a prepare's answer: plain paths under assets/, a manifest", () => {
    expect(preparedShape({ files: { 'assets/img/a.webp': 'QQ==' }, manifest: '{}' })).toMatchObject({ log: '' });
    expect(preparedShape({ files: { 'assets/img/chat été.webp': 'QQ==' }, manifest: '{}' })).toEqual({
      refused: expect.stringMatching(/chat été/),
    });
    for (const bad of [
      null,
      { files: {}, manifest: 3 },
      { files: { '../x': 'QQ==' }, manifest: '{}' },
      { files: { 'assets/../x.webp': 'QQ==' }, manifest: '{}' },
      { files: { 'public/x.webp': 'QQ==' }, manifest: '{}' },
      { files: [], manifest: '{}' },
    ])
      expect(preparedShape(bad), JSON.stringify(bad)).toHaveProperty('refused');
  });
});

const hasTools = (() => {
  try {
    execFileSync('python3', ['-c', 'import PIL, numpy'], { stdio: 'ignore' });
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasTools)('a real prepare, in the worker child', () => {
  it('refuses a game that names its sources elsewhere (sources.json)', async () => {
    const files = [...filesOf(join(ROOT, 'games', 'demo')), { path: 'sources.json', bytes: Buffer.from('{}') }];
    await expect(localPrepare(packAssets(files), 'demo')).rejects.toThrow(
      /sources.json: prepare its assets on a local Studio/,
    );
  }, 120_000);

  it("prepares the sample game's images and sounds, and its manifest", async () => {
    const game = join(ROOT, 'games', 'demo');
    const files = filesOf(game);
    const out = await localPrepare(packAssets(files), 'demo');
    const paths = Object.keys(out.files);
    expect(paths.filter((p) => p.startsWith('assets/img/')).length).toBeGreaterThan(100);
    expect(paths.some((p) => p.startsWith('assets/audio/'))).toBe(true);
    expect(JSON.parse(out.manifest)).toHaveProperty('images');
    // The snapshot of the sources alone is untouched by the media around it.
    expect(packSnapshot(game).length).toBeLessThan(packAssets(files).length);
  }, 180_000);
});
