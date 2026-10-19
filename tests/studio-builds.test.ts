// Published builds (4.2.2 PR 5, plan §2.5, G6): a publication is built from the revision's snapshot, numbered, its
// files kept by content, its manifest signed by the Studio (the worker's public key checks it, and a file changed in
// the manifest fails the check); `/play/` sends to the last green build (its revision judged valid, as judged now);
// `/play/<n>/` serves it, the page asked again at each load, its code kept for good; a fresh rebuild compares, byte
// for byte, and a snapshot the journal does not give back the same is refused.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../bridge/src/migrations';
import type { SqlDb } from '../bridge/src/store-sql';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import {
  type BuildManifest,
  Builds,
  canonicalManifest,
  PUBLIC_BUILD_PATH,
  signedBytes,
} from '../studio-server/src/server/builds';
import { newJobKeys, privateKeyOf, publicKeyOf } from '../studio-server/src/worker/job';
import { sign, verify } from 'node:crypto';

const ROOT = join(import.meta.dirname, '..');
const keys = newJobKeys();
let tmp: string, db: SqlDb, server: Server, base: string;
let head: { epoch: string; rev: number };
let output: (n: number) => string;
let builds: Builds;
let assets: string, builtWith: string[], judged: number[], verdicts: Map<number, boolean>, failNext: boolean;

beforeEach(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-builds-'));
  db = await openSqliteDb(join(tmp, 'j.sqlite'));
  await migrate(db, { dir: new URL('../studio-server/migrations/', import.meta.url) });
  mkdirSync(join(tmp, 'public', 'icons'), { recursive: true });
  writeFileSync(join(tmp, 'public', 'icons', 'icon-192.png'), 'png');
  head = { epoch: 'e1', rev: 3 };
  assets = 'ab12';
  builtWith = [];
  judged = [];
  verdicts = new Map();
  failNext = false;
  output = (n) => `<p>build ${n}</p>`;
  const snap = (rev: number) => Buffer.from(`snapshot of ${rev}`);
  builds = new Builds({
    db,
    blobs: fsBlobStore(join(tmp, 'blobs')),
    publicDir: join(tmp, 'public'),
    game: 'demo',
    studioOrigin: 'https://studio.example',
    assetsVersion: () => assets,
    snapshot: async () => ({ ...head, bytes: snap(head.rev) }),
    snapshotAt: async (rev) => snap(rev),
    epoch: async () => head.epoch,
    build: async (bytes, p) => {
      expect(p).toMatchObject({ play: expect.any(Number), game: 'demo' });
      builtWith.push(p.assetsVersion);
      if (failNext) {
        failNext = false;
        throw new Error('the worker is away');
      }
      return new Map([
        ['index.html', Buffer.from(output(p.play!))],
        ['assets/index-1.js', Buffer.from(`code of ${bytes.toString()}`)],
        [
          'build.json',
          Buffer.from(JSON.stringify({ engine: '4.2.2', commit: 'c'.repeat(40), lockfile: 'l'.repeat(64) })),
        ],
      ]);
    },
    judge: async (_epoch, rev) => {
      judged.push(rev);
      if (verdicts.has(rev)) await judge(rev, verdicts.get(rev)!);
    },
    sign: (bytes) => sign(null, bytes, privateKeyOf(keys.privatePem)).toString('base64url'),
    keyId: 'k1',
  });
  server = createServer((req, res) => void builds.handle(req, res, new URL(req.url ?? '/', 'http://play')));
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  server.close();
  await db.close();
  rmSync(tmp, { recursive: true, force: true });
});

const judge = (rev: number, ok: boolean) =>
  db.run(
    "INSERT INTO studio_health (epoch, rev, ok, errors, warnings, culprit, ms, made_at) VALUES ('e1', $1, $2, '[]', 0, NULL, 1, 1)",
    [rev, ok ? 1 : 0],
  );
const checks = (m: BuildManifest, signature: string) =>
  verify(null, signedBytes(canonicalManifest(m)), publicKeyOf(keys.publicPem), Buffer.from(signature, 'base64url'));

describe('published builds', () => {
  it('builds the head, numbers it, and signs a manifest the worker key checks', async () => {
    verdicts.set(3, true);
    const b1 = await builds.publish('Léa');
    // The revision is judged at publication: the build is green at once.
    expect(b1).toMatchObject({ n: 1, rev: 3, by: 'Léa', health: 'ok', rebuilt: null });
    expect(judged).toEqual([3]);
    head.rev = 5;
    expect((await builds.publish('Tom')).n).toBe(2);
    const { manifest, signed, signature } = (await builds.get(1))!;
    expect(manifest).toMatchObject({
      v: 1,
      n: 1,
      epoch: 'e1',
      rev: 3,
      engine: '4.2.2',
      commit: 'c'.repeat(40),
      lockfile: 'l'.repeat(64),
      assets: 'ab12',
      health: 'ok',
      key: 'k1',
    });
    expect(Object.keys(manifest.files).sort()).toEqual(['assets/index-1.js', 'build.json', 'index.html']);
    // The bytes signed are given back as they were, and are the canonical form: the prefix keeps them for this use.
    expect(signed).toBe(canonicalManifest(manifest));
    expect(signedBytes(signed).toString().startsWith('web-scumm build manifest v1\n{')).toBe(true);
    expect(checks(manifest, signature)).toBe(true);
    expect(verify(null, Buffer.from(signed), publicKeyOf(keys.publicPem), Buffer.from(signature, 'base64url'))).toBe(
      false,
    );
    // A file changed in the manifest, or another revision: the signature no longer holds.
    expect(checks({ ...manifest, files: { ...manifest.files, 'index.html': '0'.repeat(64) } }, signature)).toBe(false);
    expect(checks({ ...manifest, rev: 4 }, signature)).toBe(false);
    expect((await builds.list()).map((b) => b.n)).toEqual([2, 1]);
  });

  it('changes its manifest when one file of the snapshot changes', async () => {
    await builds.publish('Léa');
    const a = (await builds.get(1))!.manifest;
    head.rev = 4; // another snapshot: another file
    await builds.publish('Léa');
    const b = (await builds.get(2))!.manifest;
    expect(b.snapshot).not.toBe(a.snapshot);
    expect(b.files['assets/index-1.js']).not.toBe(a.files['assets/index-1.js']);
  });

  it("says 'unknown' for what built it when the worker did not say", async () => {
    const o = (builds as unknown as { o: { build: (...a: unknown[]) => Promise<Map<string, Buffer>> } }).o;
    const build = o.build;
    o.build = async (...a: unknown[]) => {
      const m = await build(...a);
      m.delete('build.json');
      return m;
    };
    await builds.publish('Léa');
    expect((await builds.get(1))!.manifest).toMatchObject({
      engine: 'unknown',
      commit: 'unknown',
      lockfile: 'unknown',
    });
    expect(await builds.rebuild(1)).toMatchObject({ same: true });
    expect((await builds.list())[0]!.rebuilt).toMatchObject({ engine: 'unknown', commit: 'unknown' });
  });

  it('reserves its number first, leaves nothing when the build fails, and makes one build at a time', async () => {
    failNext = true;
    await expect(builds.publish('Léa')).rejects.toThrow(/away/);
    expect(await db.all('SELECT n FROM studio_builds')).toEqual([]);
    const first = builds.publish('Léa');
    await expect(builds.publish('Tom')).rejects.toMatchObject({ status: 429 });
    expect((await first).n).toBe(1);
  });

  it('sends /play/ to the last green build, as judged now, and serves a build by its number', async () => {
    expect((await fetch(`${base}/play/`, { redirect: 'manual' })).status).toBe(404);
    await builds.publish('Léa'); // 1 at revision 3
    head.rev = 5;
    await builds.publish('Léa'); // 2 at revision 5
    await judge(3, true);
    await judge(5, false);
    let go = await fetch(`${base}/play/?lang=fr`, { redirect: 'manual' });
    expect(go.headers.get('location')).toBe('/play/1/?lang=fr');
    await db.run('UPDATE studio_health SET ok = 1 WHERE rev = 5');
    go = await fetch(`${base}/play`, { redirect: 'manual' });
    expect(go.headers.get('location')).toBe('/play/2/');
    const page = await fetch(`${base}/play/2/`);
    expect(await page.text()).toBe('<p>build 2</p>');
    expect(page.headers.get('cache-control')).toBe('private, no-cache');
    const code = await fetch(`${base}/play/2/assets/index-1.js`);
    expect(await code.text()).toBe('code of snapshot of 5');
    expect(code.headers.get('cache-control')).toContain('immutable');
    expect((await fetch(`${base}/play/2/icons/icon-192.png`)).status).toBe(200);
    for (const p of ['/play/9/', '/play/x/', '/play/2/.env', '/elsewhere'])
      expect((await fetch(`${base}${p}`, { redirect: 'manual' })).status, p).toBe(404);
    expect((await fetch(`${base}/play/2/`, { method: 'POST' })).status).toBe(405);
  });

  it('rebuilds fresh and compares, byte for byte; the published build never changes', async () => {
    await builds.publish('Léa');
    // Rebuilt against the assets' version it was published with, whatever the instance's is now.
    assets = 'cd34';
    expect(await builds.rebuild(1)).toEqual({ n: 1, same: true, differ: [] });
    expect(builtWith).toEqual(['ab12', 'ab12']);
    expect((await builds.list())[0]!.rebuilt).toMatchObject({ same: true, engine: '4.2.2', commit: 'c'.repeat(40) });
    output = (n) => `<p>build ${n}, another time</p>`;
    expect(await builds.rebuild(1)).toEqual({ n: 1, same: false, differ: ['index.html'] });
    expect((await builds.list())[0]!.rebuilt).toMatchObject({ same: false, differ: ['index.html'] });
    expect(await (await fetch(`${base}/play/1/`)).text()).toBe('<p>build 1</p>');
    await expect(builds.rebuild(7)).rejects.toMatchObject({ status: 404 });
  });

  it('refuses a rebuild in another history of the game', async () => {
    await builds.publish('Léa');
    head.epoch = 'e2';
    await expect(builds.rebuild(1)).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/another history/),
    });
  });

  it('opens without a session the published builds and the icons only, when the owner chose so', () => {
    for (const p of ['/play', '/play/', '/play/1/', '/play/1/assets/a.js', '/icons/icon-192.png'])
      expect(PUBLIC_BUILD_PATH.test(p), p).toBe(true);
    for (const p of ['/playx', '/plays/1/', '/play-ticket', '/preview/1/', '/', '/api/game', '/icons'])
      expect(PUBLIC_BUILD_PATH.test(p), p).toBe(false);
  });

  it('refuses a rebuild whose snapshot the journal does not give back the same', async () => {
    await builds.publish('Léa');
    (builds as unknown as { o: { snapshotAt: (rev: number) => Promise<Buffer> } }).o.snapshotAt = async () =>
      Buffer.from('another snapshot');
    await expect(builds.rebuild(1)).rejects.toMatchObject({ status: 409 });
  });
});
