// The previews and the published builds as the game's origin serves them (4.2.2, studio-server/src/server/{previews,
// builds}.ts), pinned for the mutation set `studio-workshop` (4.2.3 PR 10): the folders a prepared asset is looked for
// in, a folder that is no asset, each kind of byte range and an empty file, a HEAD that sends no body, a path outside
// the prepared assets refused, the paths never served; a run asked for as the last one ends, a failure kept while the
// worker is away, a restart's ready and failed revisions, a build's time, a manifest read once and none before the
// first look; a build's verdict (unknown, failed, ok) and a build served after a restart, read once.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../bridge/src/migrations';
import type { SqlDb } from '../bridge/src/store-sql';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { type BlobStore, fsBlobStore } from '../studio-server/src/ops/blobs';
import { type BuildManifest, Builds, canonicalManifest } from '../studio-server/src/server/builds';
import {
  assetDirs,
  findAsset,
  Previews,
  STORE_PARALLEL,
  serveBuilt,
  servedPath,
  storeFiles,
} from '../studio-server/src/server/previews';
import { PreviewBuildFailed } from '../studio-server/src/worker/preview-build';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, db: SqlDb, blobs: BlobStore, pub: string;

beforeEach(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-workshop-previews-'));
  db = await openSqliteDb(join(tmp, 'j.sqlite'));
  await migrate(db, { dir: new URL('../studio-server/migrations/', import.meta.url) });
  blobs = fsBlobStore(join(tmp, 'blobs'));
  pub = join(tmp, 'public');
  mkdirSync(join(pub, 'assets', 'img'), { recursive: true });
  writeFileSync(join(pub, 'assets', 'img', 'ten.bin'), '0123456789');
  writeFileSync(join(pub, 'assets', 'img', 'empty.bin'), '');
  writeFileSync(join(pub, 'notes.txt'), 'not an asset');
});
afterEach(async () => {
  await db.close();
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * A loopback server answering with `handle`; a handler that throws ends the response with `threw` and is kept in
 * `errors` (its headers may be sent already: a response can look whole and still have failed).
 */
async function served(handle: (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void>) {
  const errors: string[] = [];
  const server = createServer((req, res) => {
    handle(req, res, new URL(req.url ?? '/', 'http://game.local')).catch((e) => {
      errors.push(`${req.url}: ${(e as Error).message}`);
      if (!res.headersSent) res.writeHead(500);
      res.end('threw');
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const get = async (path: string, headers: Record<string, string> = {}) => {
    const r = await fetch(base + path, { headers });
    return {
      status: r.status,
      range: r.headers.get('content-range'),
      length: r.headers.get('content-length'),
      body: await r.text(),
    };
  };
  return { get, errors, close: () => new Promise<void>((ok) => server.close(() => ok())) };
}

describe('the prepared assets served', () => {
  it("are looked for in the Studio's prepared set first, when there is one", () => {
    expect(assetDirs({ publicDir: 'pub' })).toEqual(['pub']);
    expect(assetDirs({ publicDir: 'pub', prepared: () => null })).toEqual(['pub']);
    expect(assetDirs({ publicDir: 'pub', prepared: () => 'set' })).toEqual(['set', 'pub']);
  });

  it('are files: a folder of that name is passed over for the next folder', () => {
    const first = join(tmp, 'first');
    mkdirSync(join(first, 'assets', 'img', 'ten.bin'), { recursive: true });
    expect(findAsset([first, pub], 'assets/img/ten.bin')).toMatchObject({ size: 10 });
    expect(findAsset([first], 'assets/img/ten.bin')).toBeUndefined();
  });

  it('answer each kind of byte range, and an empty file', async () => {
    const s = await served((req, res) =>
      serveBuilt(req, res, { blobs, publicDir: pub }, {}, new URL(req.url!, 'http://x').pathname.slice(1)),
    );
    try {
      const at = (range: string) => s.get('/assets/img/ten.bin', { range });
      expect(await at('bytes=2-')).toEqual({ status: 206, range: 'bytes 2-9/10', length: '8', body: '23456789' });
      expect(await at('bytes=-3')).toEqual({ status: 206, range: 'bytes 7-9/10', length: '3', body: '789' });
      expect(await at('bytes=2-100')).toEqual({ status: 206, range: 'bytes 2-9/10', length: '8', body: '23456789' });
      expect(await at('bytes=3-3')).toEqual({ status: 206, range: 'bytes 3-3/10', length: '1', body: '3' });
      expect(await at('bytes=5-2')).toMatchObject({ status: 416, range: 'bytes */10' });
      expect(await s.get('/assets/img/empty.bin')).toEqual({ status: 200, range: null, length: '0', body: '' });
      // A file of the folder that is no prepared asset is never served.
      expect(await s.get('/notes.txt')).toMatchObject({ status: 404, body: 'not found' });
      expect(s.errors).toEqual([]);
    } finally {
      await s.close();
    }
  });

  it("sends a built file's headers and no body to a HEAD", async () => {
    const hash = await blobs.put(Buffer.from('<p>hi</p>'));
    let sent: unknown = 'nothing';
    const res = { writeHead: () => res, end: (b?: unknown) => void (sent = b) } as unknown as ServerResponse;
    await serveBuilt(
      { method: 'HEAD', headers: {} } as IncomingMessage,
      res,
      { blobs, publicDir: pub },
      { 'index.html': hash },
      'index.html',
    );
    expect(sent).toBeUndefined();
  });
});

describe("the game origin's paths", () => {
  it('refuse a NUL, a backslash, a hidden file or a dot folder, alone', () => {
    const at = (p: string) => servedPath(new URL(`http://game.local${p}`));
    expect(at('/play/1/index.html')).toBe('/play/1/index.html');
    for (const p of ['/a%00b', '/a%5Cb', '/.env', '/assets/.git/config']) expect(at(p), p).toBeNull();
  });
});

/** Previews whose builds fail as `fail` says (`game`: the game's own failure; `down`: the worker away). */
function previews(
  head: { epoch: string; rev: number },
  o: {
    fail?: (rev: number) => 'game' | 'down' | undefined;
    log?: (l: Record<string, unknown>) => void;
    now?: () => number;
    db?: SqlDb;
  } = {},
) {
  const built: number[] = [];
  const p = new Previews({
    db: o.db ?? db,
    blobs,
    publicDir: pub,
    game: 'demo',
    studioOrigin: 'https://studio.example',
    snapshot: async () => ({ ...head, bytes: Buffer.from('snap') }),
    build: async (_bytes, params) => {
      const why = o.fail?.(params.rev);
      if (why === 'game') throw new PreviewBuildFailed(`rev ${params.rev} does not build`);
      if (why === 'down') throw new Error('the processing worker refused the job (503)');
      built.push(params.rev);
      return new Map([['index.html', Buffer.from(`<p>rev ${params.rev}</p>`)]]);
    },
    assetsVersion: () => 'v1',
    log: o.log,
    now: o.now,
  });
  return { p, built };
}
const keep = async (epoch: string, rev: number, body: string | null) =>
  db.run('INSERT INTO studio_previews (epoch, rev, manifest, failed, ms, made_at) VALUES ($1, $2, $3, $4, 1, 1)', [
    epoch,
    rev,
    body === null ? null : JSON.stringify({ 'index.html': await blobs.put(Buffer.from(body)) }),
    body === null ? 'it does not build' : null,
  ]);

describe('the previews', () => {
  it('build again at once when asked as the last run ends', async () => {
    let down = true;
    const head = { epoch: 'e1', rev: 1 };
    let asked = false;
    const { p } = previews(head, {
      fail: () => (down ? 'down' : undefined),
      // The run's last word after a failure: the loop looks no more, an ask made right after must not be lost.
      log: (l) => {
        if (l.event === 'preview-failed' && !asked) {
          asked = true;
          down = false;
          queueMicrotask(() => void p.schedule());
        }
      },
    });
    await p.schedule();
    await expect.poll(() => p.state().ready, { timeout: 1_000 }).toBe(1);
    p.close();
  });

  it("keep a revision's failure while the next cannot be built", async () => {
    const head = { epoch: 'e1', rev: 3 };
    const { p } = previews(head, { fail: (rev) => (rev === 3 ? 'game' : 'down') });
    await p.schedule();
    head.rev = 4;
    await p.schedule();
    expect(p.state()).toEqual({
      epoch: 'e1',
      head: 4,
      ready: null,
      building: null,
      failed: { rev: 3, reason: 'rev 3 does not build' },
    });
    p.close();
  });

  it('read back at a restart the last ready revision, and a head already built or failed', async () => {
    await keep('e1', 2, '<p>two</p>');
    await keep('e1', 3, null);
    const failed = previews({ epoch: 'e1', rev: 3 });
    await failed.p.schedule();
    expect(failed.p.state()).toMatchObject({ ready: 2, failed: { rev: 3, reason: 'it does not build' } });
    const ready = previews({ epoch: 'e1', rev: 2 });
    await ready.p.schedule();
    expect(ready.p.state()).toMatchObject({ ready: 2, failed: null });
    expect([...failed.built, ...ready.built]).toEqual([]);
  });

  it('keep how long a build took, by their clock, and log its phases (4.4.0)', async () => {
    // Each look at the clock is 250 ms later: asked, snapshot started, build started, build ended, stored.
    let t = 1_000;
    const log: Record<string, unknown>[] = [];
    const { p } = previews({ epoch: 'e1', rev: 1 }, { now: () => (t += 250), log: (l) => log.push(l) });
    await p.schedule();
    const [row] = await db.all('SELECT ms FROM studio_previews');
    // The build and the files stored, after the snapshot.
    expect(Number(row!.ms)).toBe(500);
    expect(log.at(-1)).toEqual({
      event: 'preview',
      rev: 1,
      ms: 500,
      failed: false,
      queuedMs: 250,
      snapMs: 250,
      jobMs: 250,
      storeMs: 250,
      sinceWriteMs: 1_000,
    });
  });

  it('time a failed build as its job, nothing stored (4.4.0)', async () => {
    let t = 0;
    const log: Record<string, unknown>[] = [];
    const { p } = previews(
      { epoch: 'e1', rev: 1 },
      { now: () => (t += 100), log: (l) => log.push(l), fail: () => 'game' },
    );
    await p.schedule();
    expect(log.at(-1)).toMatchObject({ failed: true, ms: 100, jobMs: 100, storeMs: 0, sinceWriteMs: 300 });
  });

  it('count the wait of a write from its first ask: the coalescing and the retries are part of it (4.4.0)', async () => {
    let t = 0;
    const clock = () => t;
    const log: Record<string, unknown>[] = [];
    let down = true;
    const head = { epoch: 'e1', rev: 1 };
    const { p } = previews(head, { now: clock, log: (l) => log.push(l), fail: () => (down ? 'down' : undefined) });
    // Asked at 0; the worker is away: the ask is kept for the retry, never replaced by a later one.
    await p.schedule();
    expect(log.at(-1)).toMatchObject({ event: 'preview-failed' });
    t = 1_000;
    down = false;
    head.rev = 2;
    await p.schedule();
    p.close();
    expect(log.at(-1)).toMatchObject({ event: 'preview', rev: 2, queuedMs: 1_000, sinceWriteMs: 1_000 });
    // Done: the next ask starts its own wait.
    t = 5_000;
    head.rev = 3;
    await p.schedule();
    expect(log.at(-1)).toMatchObject({ event: 'preview', rev: 3, queuedMs: 0, sinceWriteMs: 0 });
  });

  it('count a run asked while one runs from that ask, not from the first (4.4.0)', async () => {
    let t = 0;
    const log: Record<string, unknown>[] = [];
    const head = { epoch: 'e1', rev: 1 };
    let open!: () => void;
    const gate = new Promise<void>((ok) => (open = ok));
    const p = new Previews({
      db,
      blobs,
      publicDir: pub,
      game: 'demo',
      studioOrigin: 'https://studio.example',
      snapshot: async () => ({ ...head, bytes: Buffer.from('snap') }),
      build: async (_b, params) => {
        if (params.rev === 1) await gate;
        return new Map([['index.html', Buffer.from(`<p>${params.rev}</p>`)]]);
      },
      assetsVersion: () => 'v1',
      log: (l) => log.push(l),
      now: () => t,
    });
    const running = p.schedule();
    await new Promise((ok) => setTimeout(ok, 10));
    t = 300;
    head.rev = 2;
    void p.schedule();
    t = 700;
    void p.schedule();
    t = 1_000;
    open();
    await running;
    const lines = log.filter((l) => l.event === 'preview');
    expect(lines.map((l) => [l.rev, l.queuedMs, l.sinceWriteMs])).toEqual([
      [1, 0, 1_000],
      [2, 700, 700],
    ]);
  });

  it('serve a revision kept before a restart, its manifest read once', async () => {
    await keep('e1', 2, '<p>two</p>');
    let reads = 0;
    const counted = new Proxy(db, {
      get(target, k) {
        const v = Reflect.get(target, k);
        if (k !== 'all') return typeof v === 'function' ? v.bind(target) : v;
        return (sql: string, params?: unknown[]) => {
          if (/SELECT manifest FROM studio_previews/.test(sql)) reads++;
          return target.all(sql, params);
        };
      },
    });
    const { p } = previews({ epoch: 'e1', rev: 2 }, { db: counted });
    await p.schedule();
    const s = await served((req, res, url) => p.handle(req, res, url));
    try {
      expect(await s.get('/preview/2/index.html')).toMatchObject({ status: 200, body: '<p>two</p>' });
      expect(await s.get('/preview/2/')).toMatchObject({ status: 200, body: '<p>two</p>' });
      expect(reads).toBe(1);
    } finally {
      await s.close();
    }
  });

  it('serve nothing before their first look at the head', async () => {
    await keep('', 1, '<p>nobody</p>');
    const { p } = previews({ epoch: 'e1', rev: 1 });
    const s = await served((req, res, url) => p.handle(req, res, url));
    try {
      expect(await s.get('/preview/1/index.html')).toMatchObject({ status: 404, body: 'no such preview' });
    } finally {
      await s.close();
    }
  });
});

describe('the published builds', () => {
  const builds = (o: { db?: SqlDb } = {}) =>
    new Builds({
      db: o.db ?? db,
      blobs,
      publicDir: pub,
      game: 'demo',
      studioOrigin: 'https://studio.example',
      assetsVersion: () => 'v1',
      snapshot: async () => ({ epoch: 'e1', rev: 4, bytes: Buffer.from('snap') }),
      snapshotAt: async () => Buffer.from('snap'),
      epoch: async () => 'e1',
      build: async () => new Map([['index.html', Buffer.from('<p>build</p>')]]),
      sign: () => 'signature',
      keyId: '0'.repeat(16),
    });

  it("say a revision's verdict: unknown when none is kept, else failed or ok", async () => {
    const b = builds();
    expect(await b.publish('lea')).toMatchObject({ n: 1, health: 'unknown' });
    expect((await b.list())[0]).toMatchObject({ n: 1, health: 'unknown', rebuilt: null });
    await db.run(
      "INSERT INTO studio_health (epoch, rev, ok, errors, warnings, culprit, ms, made_at) VALUES ('e1', 4, 0, '[]', 0, NULL, 1, 1)",
    );
    expect((await b.list())[0]!.health).toBe('failed');
    await db.run('UPDATE studio_health SET ok = 1');
    expect((await b.list())[0]!.health).toBe('ok');
  });

  it('serve a build published before a restart, its manifest read once', async () => {
    const m: BuildManifest = {
      v: 1,
      n: 1,
      epoch: 'e1',
      rev: 4,
      snapshot: 's'.repeat(64),
      engine: '4.2.2',
      commit: 'c',
      lockfile: 'l',
      assets: 'v1',
      health: 'ok',
      files: { 'index.html': await blobs.put(Buffer.from('<p>kept</p>')) },
      key: '0'.repeat(16),
    };
    await db.run(
      "INSERT INTO studio_builds (n, epoch, rev, manifest, signature, made_by, made_at) VALUES (1, 'e1', 4, $1, 'sig', 'lea', 1)",
      [canonicalManifest(m)],
    );
    let reads = 0;
    const counted = new Proxy(db, {
      get(target, k) {
        const v = Reflect.get(target, k);
        if (k !== 'all') return typeof v === 'function' ? v.bind(target) : v;
        return (sql: string, params?: unknown[]) => {
          if (/SELECT manifest, signature FROM studio_builds/.test(sql)) reads++;
          return target.all(sql, params);
        };
      },
    });
    const b = builds({ db: counted });
    const s = await served((req, res, url) => b.handle(req, res, url));
    try {
      expect(await s.get('/play/1/index.html')).toMatchObject({ status: 200, body: '<p>kept</p>' });
      expect(await s.get('/play/1/')).toMatchObject({ status: 200, body: '<p>kept</p>' });
      expect(await s.get('/play/2/')).toMatchObject({ status: 404, body: 'no such build' });
      expect(reads).toBe(2);
    } finally {
      await s.close();
    }
  });
});

describe("a build's files stored (4.4.0)", () => {
  /** A store whose puts end when `release` is called, counting those under way. */
  function slowStore(failOn?: string) {
    let now = 0;
    let most = 0;
    const order: string[] = [];
    const waiting: (() => void)[] = [];
    const store = {
      put: async (b: Buffer) => {
        now++;
        most = Math.max(most, now);
        order.push(b.toString());
        await new Promise<void>((ok) => waiting.push(ok));
        now--;
        if (b.toString() === failOn) throw new Error(`cannot store ${failOn}`);
        return `h:${b.toString()}`;
      },
    };
    const release = async () => {
      while (waiting.length) {
        for (const w of waiting.splice(0)) w();
        await new Promise((ok) => setTimeout(ok, 0));
      }
    };
    return { store, release, most: () => most, under: () => now, started: () => order };
  }
  const files = (n: number) => new Map(Array.from({ length: n }, (_, i) => [`f${i}.js`, Buffer.from(`f${i}`)]));

  it(`stores ${STORE_PARALLEL} at a time at most, and that many when there are more`, async () => {
    expect(STORE_PARALLEL).toBe(8);
    const s = slowStore();
    const p = storeFiles(s.store, files(19));
    await new Promise((ok) => setTimeout(ok, 0));
    expect(s.under()).toBe(STORE_PARALLEL);
    await s.release();
    const m = await p;
    expect(s.most()).toBe(STORE_PARALLEL);
    // Every file, by its path, in the build's order.
    expect(Object.keys(m)).toEqual([...files(19).keys()]);
    expect(m['f18.js']).toBe('h:f18');
    expect(m['f0.js']).toBe('h:f0');
  });

  it('stores fewer at once when there are fewer, or when asked; none when there is none', async () => {
    const s = slowStore();
    const p = storeFiles(s.store, files(3));
    await new Promise((ok) => setTimeout(ok, 0));
    expect(s.under()).toBe(3);
    await s.release();
    expect(Object.keys(await p)).toHaveLength(3);
    const two = slowStore();
    const q = storeFiles(two.store, files(5), 2);
    await two.release();
    await q;
    expect(two.most()).toBe(2);
    const one = slowStore();
    const r = storeFiles(one.store, files(5), 0);
    await one.release();
    expect(Object.keys(await r)).toHaveLength(5);
    expect(one.most()).toBe(1);
    expect(await storeFiles(slowStore().store, new Map())).toEqual({});
  });

  it('fails when a put fails, starting no other, once those under way have ended', async () => {
    const s = slowStore('f1');
    const p = storeFiles(s.store, files(6), 2);
    let settled = false;
    p.catch(() => {}).finally(() => (settled = true));
    await new Promise((ok) => setTimeout(ok, 0));
    // f0 and f1 under way end together: f0's lane takes f2 first, then f1 fails, and nothing after f2 starts.
    expect(settled).toBe(false);
    await s.release();
    await expect(p).rejects.toThrow('cannot store f1');
    expect(settled).toBe(true);
    expect(s.started()).toEqual(['f0', 'f1', 'f2']);
    expect(s.under()).toBe(0);
  });

  it('are stored by a preview through the blob store, by content', async () => {
    const puts: string[] = [];
    const counting: BlobStore = { ...blobs, put: (b) => (puts.push(b.toString()), blobs.put(b)) };
    const p = new Previews({
      db,
      blobs: counting,
      publicDir: pub,
      game: 'demo',
      studioOrigin: 'https://studio.example',
      snapshot: async () => ({ epoch: 'e1', rev: 1, bytes: Buffer.from('snap') }),
      build: async () => files(10),
      assetsVersion: () => 'v1',
    });
    await p.schedule();
    expect(puts.sort()).toEqual([...files(10).values()].map(String).sort());
    const [row] = await db.all('SELECT manifest FROM studio_previews');
    const m = JSON.parse(String(row!.manifest)) as Record<string, string>;
    expect((await blobs.get(m['f9.js']!)).toString()).toBe('f9');
  });
});
