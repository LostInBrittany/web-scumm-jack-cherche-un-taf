// The hosted Studio's page and the game's previews (4.2.1 PR 7, plan §3.4, §6.1; 4.2.2 PR 2, plan §2.2): on the
// Studio's origin, the built page (with the meta tag that says where its API and the game are, and a
// Content-Security-Policy that frames the game's origin only), its files, and the game's images for members only; on
// the game's origin, the revision's built preview (a real build of the template game, in a child, as the worker makes
// it) and the prepared assets, behind a game session, and nothing else: no engine source, no private note, no Studio
// API. Two origins on one server: the Studio at 127.0.0.1, the game at localhost.
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { createStudio, importInChild } from '../studio-server/src/ops/core';
import { Journal } from '../studio-server/src/ops/journal';
import { Gate } from '../studio-server/src/server/auth/gate';
import { Oidc } from '../studio-server/src/server/auth/oidc';
import { authRoutes } from '../studio-server/src/server/auth/routes';
import { AuthStore, Sealer } from '../studio-server/src/server/auth/store';
import { StudioClient } from '../studio-server/src/server/client';
import { readJson, send, studioServer } from '../studio-server/src/server/http';
import { Play, PLAY_COOKIE } from '../studio-server/src/server/play';
import { Previews } from '../studio-server/src/server/previews';
import { ServiceLease } from '../studio-server/src/server/service-lease';
import { localPreview } from '../studio-server/src/worker/local';
import { packSnapshot } from '../studio-server/src/worker/snapshot';
import { TestOp } from './fixtures/oidc-op';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, studioUrl: string, playUrl: string, op: TestOp, stop: () => Promise<void>, gameDir: string;
let lea = '';
let previews: Previews;
let sam = '';

const freePort = () =>
  new Promise<number>((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
  });
const setCookie = (r: Response, name: string) => r.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
const cookieValue = (c: string | undefined, name: string) => c?.split(';')[0]!.slice(name.length + 1);

async function login(sub: string, email: string, invite?: string): Promise<string> {
  op.user = { sub, email, emailVerified: true, name: sub };
  const r1 = await fetch(`${studioUrl}/auth/login?${new URLSearchParams(invite ? { invite } : {})}`, {
    redirect: 'manual',
  });
  const pre = cookieValue(setCookie(r1, '__Host-ws_pre'), '__Host-ws_pre')!;
  const r2 = await fetch(r1.headers.get('location')!, { redirect: 'manual' });
  const r3 = await fetch(r2.headers.get('location')!, {
    redirect: 'manual',
    headers: { cookie: `__Host-ws_pre=${pre}` },
  });
  return cookieValue(setCookie(r3, '__Host-ws_session'), '__Host-ws_session')!;
}
const asStudio = (cookie: string | undefined, path: string) =>
  fetch(`${studioUrl}${path}`, { headers: cookie ? { cookie: `__Host-ws_session=${cookie}` } : {} });
/** A game session on the game's origin, opened with a ticket of `cookie`'s Studio session. */
async function gameSession(cookie: string, path = '/') {
  const t = await fetch(`${studioUrl}/api/play-ticket`, {
    method: 'POST',
    headers: {
      cookie: `__Host-ws_session=${cookie}`,
      origin: studioUrl,
      'x-studio-request': '1',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ path }),
  });
  const r = await fetch(((await t.json()) as { url: string }).url, { redirect: 'manual' });
  return cookieValue(setCookie(r, PLAY_COOKIE), PLAY_COOKIE)!;
}
const asGame = (session: string | undefined, path: string, method = 'GET') =>
  fetch(`${playUrl}${path}`, { method, headers: session ? { cookie: `${PLAY_COOKIE}=${session}` } : {} });
/** A request whose path is sent as written (`fetch` resolves `..` and `%2e%2e` before sending). */
const raw = (url: string, path: string, headers: Record<string, string> = {}) =>
  new Promise<number>((ok, fail) => {
    const u = new URL(url);
    const r = request({ host: u.hostname, port: u.port, path, headers: { host: u.host, ...headers } }, (res) => {
      res.resume();
      ok(res.statusCode ?? 0);
    });
    r.on('error', fail);
    r.end();
  });

beforeAll(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-client-'));
  op = await new TestOp().start();
  gameDir = join(tmp, 'game');
  cpSync(join(ROOT, 'games', '_template'), gameDir, { recursive: true });
  mkdirSync(join(gameDir, 'private'), { recursive: true });
  writeFileSync(join(gameDir, 'private', 'secret.ts'), 'export const s = "private";\n');
  // A built Studio and a public folder of the test's own.
  const clientDir = join(tmp, 'client');
  mkdirSync(join(clientDir, 'assets', 'tools'), { recursive: true });
  writeFileSync(
    join(clientDir, 'studio.html'),
    '<!doctype html><html><head><title>Studio</title></head><body></body></html>',
  );
  writeFileSync(join(clientDir, 'assets', 'tools', 'studio-abc.js'), 'export {};\n');
  writeFileSync(join(clientDir, 'assets', 'notes.txt'), 'not a Studio file\n');
  const publicDir = join(tmp, 'public');
  mkdirSync(join(publicDir, 'assets', 'img', 'decor'), { recursive: true });
  mkdirSync(join(publicDir, 'icons'), { recursive: true });
  writeFileSync(join(publicDir, 'assets', 'img', 'decor', 'hall.webp'), 'RIFF....WEBP');
  writeFileSync(join(publicDir, 'icons', 'icon-192.png'), 'png');
  const db = await openSqliteDb(join(tmp, 'j.sqlite'));
  const journal = await Journal.open({ db, blobs: fsBlobStore(join(tmp, 'blobs')), gameDir });
  const lease = new ServiceLease(db);
  await lease.tick();
  const port = await freePort();
  studioUrl = `http://127.0.0.1:${port}`;
  playUrl = `http://localhost:${port}`;
  const oidc = await Oidc.discover({
    issuer: op.issuer,
    clientId: op.clientId,
    clientSecret: op.clientSecret,
    audience: op.audience,
    allowInsecure: true,
  });
  const sealer = new Sealer(['a-session-key-of-at-least-32-characters']);
  const store = new AuthStore(db);
  const gate = new Gate({ store, oidc, sealer, publicUrl: studioUrl });
  previews = new Previews({
    db,
    blobs: fsBlobStore(join(tmp, 'blobs')),
    publicDir,
    game: 'template',
    studioOrigin: studioUrl,
    snapshot: async () => ({
      epoch: await journal.epoch(),
      rev: await journal.revision(),
      bytes: packSnapshot(gameDir),
    }),
    build: (bytes, params) => localPreview(bytes, params),
    assetsVersion: () => 'abc123',
  });
  const server = studioServer({
    studio: createStudio({ gameDir, root: tmp, journal, importFresh: importInChild }),
    journal,
    db,
    lease,
    log: () => {},
    perMinute: 10_000,
    auth: { gate, handle: authRoutes({ gate, store, oidc, sealer, publicUrl: studioUrl, send, readJson }) },
    play: {
      playUrl,
      handler: new Play({
        db,
        store,
        publicUrl: studioUrl,
        playUrl,
        idleMs: gate.idleMs,
        content: (req, res, url) => previews.handle(req, res, url),
      }),
    },
    client: new StudioClient({ clientDir, publicDir, publicUrl: studioUrl, playUrl }),
  });
  await new Promise<void>((ok) => server.listen(port, '127.0.0.1', ok));
  lea = await login('u-lea', 'lea@example.org', await store.invite('lea@example.org', 'reviewer', 'test'));
  sam = await login('u-sam', 'sam@example.org');
  stop = async () => {
    server.close();
    op.stop();
    await journal.close();
    await db.close();
  };
}, 120_000);
afterAll(async () => {
  await stop();
  rmSync(tmp, { recursive: true, force: true });
});

describe("the Studio's page", () => {
  it('is served to anyone, says where its API and the game are, and frames the game only', async () => {
    const r = await asStudio(undefined, '/');
    expect(r.status).toBe(200);
    const html = await r.text();
    const meta = /<meta name="web-scumm-studio" content="([^"]*)">/.exec(html)?.[1];
    expect(JSON.parse(meta!.replace(/&quot;/g, '"').replace(/&amp;/g, '&'))).toEqual({
      hosted: true,
      api: '/api',
      play: playUrl,
    });
    const csp = r.headers.get('content-security-policy')!;
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain(`frame-src ${playUrl}`);
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('serves its built scripts for good, its icon, and nothing else of the folders', async () => {
    const js = await asStudio(undefined, '/assets/tools/studio-abc.js');
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toMatch(/^text\/javascript/);
    expect(js.headers.get('cache-control')).toContain('immutable');
    expect(js.headers.get('cache-control')).toContain('immutable');
    expect((await asStudio(undefined, '/icons/icon-192.png')).status).toBe(200);
    for (const p of ['/assets/notes.txt', '/studio.html', '/index.html', '/src/main.ts'])
      expect((await asStudio(undefined, p)).status, p).toBe(404);
    for (const p of ['/assets/tools/../../j.sqlite', '/assets/%2e%2e/%2e%2e/j.sqlite', '/icons/..%2f..%2fj.sqlite'])
      expect(await raw(studioUrl, p), p).toBe(404);
  });

  it('says the revision each read was made at', async () => {
    const r = await asStudio(lea, '/api/game');
    expect(r.status).toBe(200);
    expect(r.headers.get('x-studio-revision')).toMatch(/^\d+$/);
  });

  it("serves the game's images to members only", async () => {
    expect((await asStudio(undefined, '/assets/img/decor/hall.webp')).status).toBe(401);
    // Logged in, but not a member: nothing.
    expect((await asStudio(sam, '/assets/img/decor/hall.webp')).status).toBe(403);
    const r = await asStudio(lea, '/assets/img/decor/hall.webp');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/webp');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await asStudio(lea, '/assets/img/decor/none.webp')).status).toBe(404);
  });
});

describe("the game's previews", () => {
  let rev = 0;
  it('says the preview is being prepared until the first is built', async () => {
    const s = await gameSession(lea);
    const r = await asGame(s, '/?edit=hall');
    expect(r.status).toBe(503);
    expect(r.headers.get('refresh')).toBe('2');
    expect(await r.text()).toContain('being prepared');
    await previews.schedule();
    const st = previews.state();
    expect(st.failed).toBeNull();
    expect(st.building).toBeNull();
    expect(st.ready).toBe(st.head);
    rev = st.ready!;
  }, 120_000);

  it("sends a game session to the last ready revision, whose page names the Studio's origin", async () => {
    const s = await gameSession(lea, '/?edit=hall');
    expect((await asGame(undefined, '/')).status).toBe(401);
    const go = await fetch(`${playUrl}/?edit=hall`, { redirect: 'manual', headers: { cookie: `${PLAY_COOKIE}=${s}` } });
    expect(go.status).toBe(302);
    expect(go.headers.get('location')).toBe(`/preview/${rev}/?edit=hall`);
    const page = await asGame(s, `/preview/${rev}/?edit=hall`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-security-policy')).toBe(`frame-ancestors ${studioUrl}`);
    // The page is asked again at each load (an ended session is refused then); its code, named by hash, is kept.
    expect(page.headers.get('cache-control')).toBe('private, no-cache');
    const html = await page.text();
    expect(html).toContain(`<meta name="web-scumm-studio-origin" content="${studioUrl}"`);
    const script = /<script type="module" crossorigin src="([^"]+)"/.exec(html)?.[1];
    expect(script).toMatch(new RegExp(`^/preview/${rev}/assets/index-[\\w-]+\\.js$`));
    const js = await asGame(s, script!);
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toMatch(/^text\/javascript/);
    // The build's fingerprint parts (ADR 0013), as a sealed build has them.
    const site = (await (await asGame(s, `/preview/${rev}/site.json`)).json()) as { engine?: string };
    expect(site.engine).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('serves the prepared assets beside every revision, a byte range when asked', async () => {
    const s = await gameSession(lea);
    const img = await asGame(s, `/preview/${rev}/assets/img/decor/hall.webp`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/webp');
    expect(img.headers.get('cache-control')).toBe('private, no-cache');
    const part = await fetch(`${playUrl}/preview/${rev}/assets/img/decor/hall.webp`, {
      headers: { cookie: `${PLAY_COOKIE}=${s}`, range: 'bytes=0-3' },
    });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 0-3/12');
    expect(await part.text()).toBe('RIFF');
    const after = await fetch(`${playUrl}/icons/icon-192.png`, {
      headers: { cookie: `${PLAY_COOKIE}=${s}`, range: 'bytes=50-' },
    });
    expect(after.status).toBe(416);
    expect((await asGame(s, '/icons/icon-192.png')).status).toBe(200);
  });

  it('serves nothing else: no Studio API, no engine source, no private note, no unknown revision, no write', async () => {
    const s = await gameSession(lea);
    for (const p of [
      '/api/game',
      '/__studio/api/game',
      '/auth/me',
      `/preview/${rev}/package.json`,
      `/preview/${rev}/src/main.ts`,
      `/preview/${rev}/constructor`,
      `/preview/${rev}/assets/img/decor/none.webp`,
      `/preview/${rev + 1000}/`,
      '/preview/x/',
      '/@fs/etc/passwd',
      '/icons/.hidden',
      `/preview/${rev}/assets/img/.DS_Store`,
      `/preview/${rev}/private/secret.ts`,
    ])
      expect((await asGame(s, p)).status, p).toBe(404);
    for (const p of [
      `/preview/${rev}/../package.json`,
      `/preview/${rev}/%2e%2e/%2e%2e/j.sqlite`,
      '/icons/..%2f..%2fj.sqlite',
    ])
      expect(await raw(playUrl, p, { cookie: `${PLAY_COOKIE}=${s}` }), p).toBe(404);
    expect((await asGame(s, '/', 'POST')).status).toBe(405);
  });
});
