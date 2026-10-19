// The Assets tab on a hosted Studio (4.2.3 PR 7, H8): an upload is bounded in size (413) and type (415, by its magic
// number and its extension), and one in bounds is one revision; a sheet's cutting and Prepare are jobs, their states
// on the live stream in order, cancelled with no operation and the exclusive lease given back; a cut done is one
// revision with its cells. Underneath: the worker kills a child its Studio gave up on, a cut's answer is bounded to
// the sheet asked, and a real cut runs in the worker's child where Python has Pillow and numpy.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import type { SqlDb } from '../bridge/src/store-sql';
import { createAssets } from '../tools/studio/assets';
import { createStudio, importInChild, operationContext } from '../studio-server/src/ops/core';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { Journal } from '../studio-server/src/ops/journal';
import { HostedAssets, MAX_UPLOAD } from '../studio-server/src/server/hosted-assets';
import { serveFile, studioServer } from '../studio-server/src/server/http';
import { createServer } from 'node:http';
import { type JobInfo, Jobs } from '../studio-server/src/server/jobs';
import { Leases } from '../studio-server/src/server/leases';
import { PreparedAssets, prepareOn } from '../studio-server/src/server/prepared';
import { ServiceLease } from '../studio-server/src/server/service-lease';
import { cutRequest, cutShape, type Cut } from '../studio-server/src/worker/cut';
import { localCut } from '../studio-server/src/worker/local';
import { JOBS, runChild } from '../studio-server/src/worker/main';
import { packCut, unpackSnapshot } from '../studio-server/src/worker/snapshot';
import type { CutRequest } from '../tools/studio/cut';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, game: string, db: SqlDb, journal: Journal, lease: ServiceLease, leases: Leases;
let api: string, close: () => Promise<void>, jobs: Jobs;
const who = { userId: 'u-lea', name: 'Léa' };

/** What the fake worker does with the next cut: answer, or wait for the cancel. */
let worker: (req: CutRequest, signal: AbortSignal) => Promise<Cut>;
let prepareWorker: (signal?: AbortSignal) => Promise<{ files: Record<string, string>; manifest: string; log: string }>;

const png = (n = 64) => {
  const b = Buffer.alloc(n);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(0x0d0a1a0a, 4);
  return b;
};
const ogg = (n = 64) => Buffer.concat([Buffer.from('OggS'), Buffer.alloc(n - 4)]);
const b64 = (b: Buffer) => b.toString('base64');
/** Waits for the abort, then fails as a cancelled fetch does. */
const untilCancelled = (signal?: AbortSignal) =>
  new Promise<never>((_, fail) => signal?.addEventListener('abort', () => fail(signal.reason), { once: true }));

beforeAll(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-assets-hosted-'));
  game = join(tmp, 'game');
  cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
  db = await openSqliteDb(join(tmp, 'j.sqlite'));
  journal = await Journal.open({ db, blobs: fsBlobStore(join(tmp, 'blobs')), gameDir: game });
  lease = new ServiceLease(db, 30_000, 10_000);
  await lease.tick();
  leases = new Leases(db);
  const studio = createStudio({ gameDir: game, root: tmp, journal, importFresh: importInChild, author: 'test' });
  // The member's exclusive lease, as main.ts takes it (a claimant named here: this server has no logins).
  const exclusive = async <T>(fn: () => Promise<T>) => {
    await leases.take(who, ['*']);
    try {
      return await fn();
    } finally {
      await leases.release(who.userId, ['*']);
    }
  };
  const assets = new HostedAssets({
    studio,
    assets: createAssets(studio),
    locked: async (fn) => fn(),
    exclusive,
    cut: (req, source, ext, signal) => {
      // The snapshot the worker would get: the image, the sheet's cells, site.json.
      const dir = mkdtempSync(join(tmp, 'snap-'));
      unpackSnapshot(packCut(game, req.sheetId, source, ext), dir);
      expect(existsSync(join(dir, `upload/source${ext}`))).toBe(true);
      return worker(req, signal);
    },
  });
  const prepared = new PreparedAssets({
    db,
    blobs: fsBlobStore(join(tmp, 'blobs')),
    dir: join(tmp, 'prepared'),
    snapshot: async () => ({ epoch: 'e', rev: await journal.revision(), bytes: Buffer.from('{}') }),
    prepare: prepareOn((_bytes, _at, _game, signal) => prepareWorker(signal), 'template'),
    currentManifest: () => null,
    writeManifest: async (m) => {
      await studio.writeFiles('prepare assets', [{ path: 'assets.gen.json', after: m }], { undo: false });
    },
    exclusive,
  });
  jobs = new Jobs();
  const server = studioServer({ studio, journal, db, lease, log: () => {}, assets, prepared, jobs, leases });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  api = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  close = async () => {
    server.closeAllConnections();
    server.close();
    await lease.release();
    await journal.close();
    await db.close();
  };
}, 60_000);
afterAll(async () => {
  await close();
  rmSync(tmp, { recursive: true, force: true });
});

const post = (path: string, body: unknown) =>
  fetch(`${api}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** The job's states as the live stream says them, until it ends. */
function streamed(id: () => string | undefined): { states: string[]; ended: Promise<JobInfo> } {
  const states: string[] = [];
  const ac = new AbortController();
  const ended = (async () => {
    const r = await fetch(`${api}/events`, { signal: ac.signal });
    const reader = r.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error('the stream ended first');
      buf += dec.decode(value, { stream: true });
      for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (!block.startsWith('event: job\n')) continue;
        const j = JSON.parse(block.slice(block.indexOf('data: ') + 6)) as JobInfo;
        if (j.id !== id()) continue;
        states.push(j.step ? `${j.state}: ${j.step}` : j.state);
        if (j.ended) {
          ac.abort();
          return j;
        }
      }
    }
  })();
  return { states, ended };
}

/** Opens the stream, then waits until it says hello: the job's first event is not missed. */
async function watch() {
  let id: string | undefined;
  const s = streamed(() => id);
  await new Promise((ok) => setTimeout(ok, 150));
  return { ...s, set: (v: string) => void (id = v) };
}

const waitFor = async (pred: () => boolean, ms = 5_000) => {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((ok) => setTimeout(ok, 10));
  }
};

describe('an upload on a hosted Studio', () => {
  it('out of bounds: 413 past 10 MiB, 415 for a type it is not; nothing written', async () => {
    const rev = await journal.revision();
    const big = await post('assets/sound', { kind: 'sfx', file: 'big.ogg', data: b64(ogg(MAX_UPLOAD + 1)) });
    expect(big.status).toBe(413);
    // A body past the bound is refused by its length, before it is read.
    const huge = await fetch(`${api}/assets/decor`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x', data: 'A'.repeat(15 * 1024 * 1024) }),
    });
    expect(huge.status).toBe(413);
    for (const [path, body] of [
      ['assets/sound', { kind: 'sfx', file: 'fake.ogg', data: b64(Buffer.from('ID3 not an ogg')) }],
      ['assets/sound', { kind: 'music', file: 'tune.flac', data: b64(Buffer.from('fLaC0000')) }],
      ['assets/sound', { kind: 'sfx', file: 'page.ogg', data: b64(Buffer.from('<html><script>1</script>')) }],
      ['assets/decor', { name: 'night', data: b64(Buffer.from('<svg onload=alert(1)>')) }],
      ['assets/decor', { name: 'night', data: b64(Buffer.concat([Buffer.from('RIFF0000WEBP'), Buffer.alloc(9)])) }],
      ['assets/sheet', { sheetId: 'hero', grid: '2x1', data: b64(Buffer.from('GIF89a......')) }],
      ['assets/cell', { sheetId: 'hero', cell: 'r1c1', data: b64(Buffer.from('not an image')) }],
    ] as const) {
      const r = await post(path, body);
      expect(r.status, `${path} ${JSON.stringify(body).slice(0, 80)}`).toBe(415);
    }
    expect(await journal.revision()).toBe(rev);
    expect(existsSync(join(game, 'audio', 'sfx', 'big.ogg'))).toBe(false);
    expect(existsSync(join(game, 'art', 'decor'))).toBe(false);
  });

  it('in bounds: one revision, served back with its type and never run', async () => {
    const rev = await journal.revision();
    const r = await post('assets/sound', { kind: 'sfx', file: 'door.ogg', data: b64(ogg()) });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, file: 'audio/sfx/door.ogg' });
    expect(await journal.revision()).toBe(rev + 1);
    expect((await journal.opsAfter(rev)).map((o) => o.paths)).toEqual([['audio/sfx/door.ogg']]);
    const f = await fetch(`${api}/assets/file/audio/sfx/door.ogg`);
    expect(f.headers.get('content-type')).toBe('audio/ogg');
    expect(f.headers.get('content-security-policy')).toMatch(/sandbox/);
    expect(Buffer.from(await f.arrayBuffer()).equals(ogg())).toBe(true);
    expect((await fetch(`${api}/assets/file/..%2Fgame.ts`)).status).toBe(404);
    // The listing a reviewer reads: the sound there, by the same code as the dev server's.
    const l = (await (await fetch(`${api}/assets`)).json()) as { sounds: { sfx: { id: string }[] } };
    expect(l.sounds.sfx.map((s) => s.id)).toContain('door.ogg');
  }, 60_000);
});

describe("a sheet's cutting on a hosted Studio", () => {
  it('done: one revision with the cells, its states on the live stream in order, the lease given back', async () => {
    const rev = await journal.revision();
    worker = async (req) => ({
      files: { [`art/${req.sheetId}/r1c1.png`]: b64(png(70)), [`art/${req.sheetId}/r1c2.png`]: b64(png(71)) },
      output: 'cut 2 cells',
    });
    const w = await watch();
    const r = await post('assets/sheet', { sheetId: 'hero', grid: '2x1', data: b64(png()) });
    expect(r.status).toBe(202);
    const j = (await r.json()) as JobInfo;
    w.set(j.id);
    expect(j).toMatchObject({ kind: 'cut', state: 'queued' });
    const end = await w.ended;
    expect(end).toMatchObject({ state: 'done', result: { written: ['r1c1', 'r1c2'], output: 'cut 2 cells' } });
    expect(w.states).toEqual([
      'queued',
      'running',
      'running: packing',
      'running: on the worker',
      'running: writing',
      'done',
    ]);
    expect(await journal.revision()).toBe(rev + 1);
    expect((await journal.opsAfter(rev)).map((o) => o.paths.sort())).toEqual([
      ['art/hero/r1c1.png', 'art/hero/r1c2.png'],
    ]);
    expect(readFileSync(join(game, 'art', 'hero', 'r1c1.png')).equals(png(70))).toBe(true);
    expect(await leases.list()).toEqual([]);
    // The cells exist now: recutting them without naming them is refused before any job.
    const again = await post('assets/sheet', { sheetId: 'hero', grid: '2x1', data: b64(png()) });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ conflicts: ['r1c1', 'r1c2'] });
  });

  it('cancelled while the worker cuts: no revision, nothing written, the lease given back', async () => {
    const rev = await journal.revision();
    let onWorker = false;
    worker = (_req, signal) => {
      onWorker = true;
      return untilCancelled(signal);
    };
    const w = await watch();
    const r = await post('assets/sheet', { sheetId: 'villain', grid: '2x1', data: b64(png()) });
    const j = (await r.json()) as JobInfo;
    w.set(j.id);
    await waitFor(() => onWorker);
    expect((await leases.list()).map((l) => l.span)).toEqual(['*']);
    const c = await post(`jobs/${j.id}/cancel`, {});
    expect(c.status).toBe(200);
    const end = await w.ended;
    expect(end.state).toBe('cancelled');
    expect(w.states.at(-1)).toBe('cancelled');
    expect(await journal.revision()).toBe(rev);
    expect(existsSync(join(game, 'art', 'villain'))).toBe(false);
    expect(await leases.list()).toEqual([]);
    // Ended: past cancelling.
    expect((await post(`jobs/${j.id}/cancel`, {})).status).toBe(409);
    expect(await (await fetch(`${api}/jobs/${j.id}`)).json()).toMatchObject({ state: 'cancelled' });
  });

  it('a recut keeps the old cells as backups, in the same operation', async () => {
    const rev = await journal.revision();
    worker = async (req) => ({ files: { [`art/${req.sheetId}/r1c1.png`]: b64(png(80)) }, output: '' });
    const r = await post('assets/sheet', { sheetId: 'hero', grid: '2x1', cells: 'r1c1', data: b64(png()) });
    const j = (await r.json()) as JobInfo;
    await waitFor(() => !!jobs.get(j.id)?.ended);
    expect(jobs.get(j.id)).toMatchObject({ state: 'done', result: { backups: ['art/hero/r1c1_v1.png'] } });
    expect((await journal.opsAfter(rev)).map((o) => o.paths.sort())).toEqual([
      ['art/hero/r1c1.png', 'art/hero/r1c1_v1.png'],
    ]);
    expect(readFileSync(join(game, 'art', 'hero', 'r1c1_v1.png')).equals(png(70))).toBe(true);
  });

  it('a waiting job never runs once cancelled; a failed one says why, with no revision', async () => {
    const rev = await journal.revision();
    let release!: () => void;
    worker = (req) =>
      new Promise((ok) => {
        release = () => ok({ files: { [`art/${req.sheetId}/r1c1.png`]: b64(png(90)) }, output: '' });
      });
    const first = (await (
      await post('assets/sheet', { sheetId: 'a1', grid: '1x1', data: b64(png()) })
    ).json()) as JobInfo;
    const second = (await (
      await post('assets/sheet', { sheetId: 'a2', grid: '1x1', data: b64(png()) })
    ).json()) as JobInfo;
    expect(jobs.get(second.id)?.state).toBe('queued');
    expect((await post(`jobs/${second.id}/cancel`, {})).status).toBe(200);
    expect(jobs.get(second.id)?.state).toBe('cancelled');
    await waitFor(() => !!release);
    release();
    await waitFor(() => !!jobs.get(first.id)?.ended);
    expect(jobs.get(first.id)?.state).toBe('done');
    expect(existsSync(join(game, 'art', 'a2'))).toBe(false);
    expect(await journal.revision()).toBe(rev + 1);
    // A worker that answers a file the cut was not asked for: refused, nothing written.
    worker = async () => {
      const c = cutShape(
        { files: { 'art/a3/../../game.ts': 'QQ==' }, output: '' },
        cutRequest({ mode: 'sheet', sheetId: 'a3', cols: 1, rows: 1 })!,
      );
      throw new Error('refused' in c ? c.refused : 'accepted');
    };
    const bad = (await (
      await post('assets/sheet', { sheetId: 'a3', grid: '1x1', data: b64(png()) })
    ).json()) as JobInfo;
    await waitFor(() => !!jobs.get(bad.id)?.ended);
    expect(jobs.get(bad.id)).toMatchObject({ state: 'failed', error: expect.stringMatching(/not asked for/) });
    expect(await journal.revision()).toBe(rev + 1);
    expect(await leases.list()).toEqual([]);
  });
});

describe('Prepare as a job', () => {
  it('cancelled on the worker: no set kept, no revision, the lease given back', async () => {
    const rev = await journal.revision();
    let onWorker = false;
    prepareWorker = (signal) => {
      onWorker = true;
      return untilCancelled(signal);
    };
    const j = (await (await post('assets/prepare', {})).json()) as JobInfo;
    await waitFor(() => onWorker);
    expect((await post(`jobs/${j.id}/cancel`, {})).status).toBe(200);
    await waitFor(() => !!jobs.get(j.id)?.ended);
    expect(jobs.get(j.id)?.state).toBe('cancelled');
    expect(await journal.revision()).toBe(rev);
    expect(await db.all('SELECT id FROM studio_prepared')).toEqual([]);
    expect(await leases.list()).toEqual([]);
  });

  it('done: its manifest one revision', async () => {
    const rev = await journal.revision();
    prepareWorker = async () => ({
      files: { 'assets/img/a.webp': b64(Buffer.from('A')) },
      manifest: '{"images":{}}',
      log: 'ok',
    });
    const j = (await (await post('assets/prepare', {})).json()) as JobInfo;
    await waitFor(() => !!jobs.get(j.id)?.ended);
    expect(jobs.get(j.id)).toMatchObject({ state: 'done', result: { files: 1 } });
    expect((await journal.opsAfter(rev)).map((o) => o.paths)).toEqual([['assets.gen.json']]);
  });
});

describe('the jobs', () => {
  it('cannot be cancelled once writing, nor by another member', async () => {
    const j = new Jobs();
    let go!: () => void;
    const started = j.start('cut', who, async (c) => {
      c.commit();
      await new Promise<void>((ok) => (go = ok));
      return 'written';
    });
    await waitFor(() => !!go);
    expect(() => j.cancel(started.id, { userId: 'u-tom', owner: false })).toThrow(/only who started/);
    expect(() => j.cancel(started.id, { userId: who.userId, owner: false })).toThrow(/too late/);
    go();
    await waitFor(() => !!j.get(started.id)?.ended);
    expect(j.get(started.id)).toMatchObject({ state: 'done', result: 'written' });
    // The request's context (who writes) is the job's too.
    const seen: unknown[] = [];
    const k = j.start(
      'prepare',
      who,
      async () => void seen.push(operationContext.getStore()?.author),
      (fn) => operationContext.run({ author: 'lea@example.org' }, fn),
    );
    await waitFor(() => !!j.get(k.id)?.ended);
    expect(seen).toEqual(['lea@example.org']);
  });

  it("a cut's request and answer are checked: the sheet asked, plain cell names", () => {
    expect(cutRequest({ mode: 'sheet', sheetId: 'hero', cols: 6, rows: 4 })).toMatchObject({ cols: 6 });
    expect(cutRequest({ mode: 'sheet', sheetId: 'decor', cols: 6, rows: 4 })).toBeNull();
    expect(cutRequest({ mode: 'sheet', sheetId: '../x', cols: 6, rows: 4 })).toBeNull();
    expect(cutRequest({ mode: 'sheet', sheetId: 'hero', cols: 100, rows: 4 })).toBeNull();
    expect(cutRequest({ mode: 'cell', sheetId: 'hero', cell: 'pose/t1', key: 'auto' })).toMatchObject({
      cell: 'pose/t1',
    });
    expect(cutRequest({ mode: 'cell', sheetId: 'hero', cell: '../r1c1', key: 'auto' })).toBeNull();
    const sheet = cutRequest({ mode: 'sheet', sheetId: 'hero', cols: 2, rows: 1 })!;
    const P = b64(png());
    expect(cutShape({ files: { 'art/hero/r1c2.png': P }, output: 'x' }, sheet)).toMatchObject({ output: 'x' });
    for (const bad of [
      { files: { 'art/villain/r1c1.png': P } },
      { files: { 'art/hero/index.json': P } },
      { files: { 'game.ts': P } },
      // A cell outside the grid asked (2 × 1), and one not a PNG once decoded.
      { files: { 'art/hero/r2c1.png': P } },
      { files: { 'art/hero/r1c1.png': b64(Buffer.from('<svg onload=alert(1)>')) } },
      { files: [] },
      null,
    ])
      expect(cutShape(bad, sheet), JSON.stringify(bad).slice(0, 80)).toHaveProperty('refused');
    // Only the cells named, when some are.
    const some = cutRequest({ mode: 'sheet', sheetId: 'hero', cols: 2, rows: 1, only: ['r1c2'] })!;
    expect(cutShape({ files: { 'art/hero/r1c2.png': P } }, some)).not.toHaveProperty('refused');
    expect(cutShape({ files: { 'art/hero/r1c1.png': P } }, some)).toMatchObject({ refused: /not asked for/ });
    const cell = cutRequest({ mode: 'cell', sheetId: 'hero', cell: 'r1c1', key: 'auto' })!;
    expect(cutShape({ files: { 'art/hero/r1c1.png': P }, keyed: 'keyed' }, cell)).toMatchObject({
      keyed: 'keyed',
    });
    expect(cutShape({ files: { 'art/hero/r1c1.png': P } }, cell)).toHaveProperty('refused');
    expect(cutShape({ files: { 'art/hero/r1c2.png': P }, keyed: 'keyed' }, cell)).toHaveProperty('refused');
  });
});

describe("a member's file served back", () => {
  it('refuses a link out of art/ or audio/, and a file gone meanwhile is a 404, never a crash', async () => {
    writeFileSync(join(tmp, 'secret.ogg'), ogg());
    mkdirSync(join(game, 'audio', 'sfx'), { recursive: true });
    symlinkSync(join(tmp, 'secret.ogg'), join(game, 'audio', 'sfx', 'link.ogg'));
    expect((await fetch(`${api}/assets/file/audio/sfx/link.ogg`)).status).toBe(404);
    // A file the listing named, removed before it is read.
    const s = createServer((_req, res) => void serveFile(res, join(tmp, 'gone.ogg')));
    await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok));
    try {
      const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}/`;
      expect((await fetch(url)).status).toBe(404);
      expect((await fetch(url)).status).toBe(404);
    } finally {
      s.close();
    }
  });
});

describe("prepare's job signal", () => {
  it('reaches the worker whatever wraps it (prepareOn, used by main.ts and the e2e stack)', async () => {
    const got: unknown[] = [];
    const ac = new AbortController();
    const run = prepareOn(async (_s, at, game, signal) => {
      got.push(at.rev, game, signal);
      return { files: {}, manifest: '{}', log: '' };
    }, 'demo');
    await run(Buffer.from(''), { epoch: 'e', rev: 4 }, ac.signal);
    expect(got).toEqual([4, 'demo', ac.signal]);
  });
});

describe("the worker's child, cancelled", () => {
  // Process groups and their signals are POSIX: a Windows worker is not a supported host for them.
  it.skipIf(process.platform === 'win32')(
    'is killed with its group when the Studio gives up on it',
    async () => {
      mkdirSync(JOBS, { recursive: true });
      const dir = mkdtempSync(join(JOBS, 'cancel-'));
      try {
        writeFileSync(join(dir, 'index.ts'), 'while (true) {}\nexport {};\n');
        const ac = new AbortController();
        const t0 = Date.now();
        setTimeout(() => ac.abort(), 1_000);
        const r = await runChild(dir, 60_000, 'validate', undefined, {}, ac.signal);
        expect(r).toMatchObject({ cancelled: true, timedOut: false, out: '' });
        expect(Date.now() - t0).toBeLessThan(15_000);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    30_000,
  );
});

const hasTools = (() => {
  try {
    execFileSync('python3', ['-c', 'import PIL, numpy'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasTools)('a real cut, in the worker child', () => {
  it('cuts a 2 × 1 sheet on a flat background into its two cells', async () => {
    const sheet = join(tmp, 'sheet.png');
    // Two figures on a flat green, 512 × 256: the cutter keys the green out.
    execFileSync('python3', [
      '-c',
      [
        'import sys',
        'from PIL import Image, ImageDraw',
        "im = Image.new('RGB', (512, 256), (0, 200, 0))",
        'd = ImageDraw.Draw(im)',
        'd.rectangle((60, 60, 190, 200), fill=(200, 30, 30))',
        'd.ellipse((320, 50, 450, 210), fill=(30, 30, 200))',
        'im.save(sys.argv[1])',
      ].join('\n'),
      sheet,
    ]);
    const req = cutRequest({ mode: 'sheet', sheetId: 'real', cols: 2, rows: 1 })!;
    const out = await localCut(packCut(game, 'real', readFileSync(sheet), '.png'), 'template', req);
    expect(Object.keys(out.files).sort()).toEqual(['art/real/r1c1.png', 'art/real/r1c2.png']);
    expect(Buffer.from(out.files['art/real/r1c1.png']!, 'base64').readUInt32BE(0)).toBe(0x89504e47);
  }, 120_000);
});
