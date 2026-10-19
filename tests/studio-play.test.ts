// The game's origin (4.2.1, plan §6.1, policy F): a ticket issued to a member's browser session, used once within
// 60 s on the other origin, becomes a game session (a partitioned cookie) tied to that Studio session; every request
// of the game's origin checks both, and the membership, again; the game's origin serves no Studio API.
// Two origins on one server: the Studio at 127.0.0.1, the game at localhost (routing by Host).
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
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
import { readJson, send, studioServer } from '../studio-server/src/server/http';
import { Play, PLAY_COOKIE } from '../studio-server/src/server/play';
import { ServiceLease } from '../studio-server/src/server/service-lease';
import { TestOp, type TestUser } from './fixtures/oidc-op';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, studioUrl: string, playUrl: string, op: TestOp, store: AuthStore, stop: () => Promise<void>;
let clock = Date.now();
const people: Record<string, { cookie: string; id: string }> = {};
const USERS: Record<string, TestUser> = {
  lea: { sub: 'u-lea', email: 'lea@example.org', emailVerified: true, name: 'Léa' },
  ana: { sub: 'u-ana', email: 'ana@example.org', emailVerified: true, name: 'Ana' },
};

const freePort = () =>
  new Promise<number>((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
  });
const setCookie = (r: Response, name: string) => r.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
const cookieValue = (c: string | undefined, name: string) => c?.split(';')[0]!.slice(name.length + 1);

async function login(who: string, invite?: string): Promise<string> {
  op.user = USERS[who]!;
  op.sid = `sid-${who}-${Math.random()}`;
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

const studio = (who: string, method: string, path: string, body?: unknown) =>
  fetch(`${studioUrl}${path}`, {
    method,
    headers: {
      cookie: `__Host-ws_session=${people[who]!.cookie}`,
      ...(method === 'GET' ? {} : { origin: studioUrl, 'x-studio-request': '1', 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ticket = async (who: string, path = '/') =>
  ((await (await studio(who, 'POST', '/api/play-ticket', { path })).json()) as { url: string }).url;
/** Opens the game with a ticket: the game session's cookie, and where it sends the browser. */
async function open(url: string) {
  const r = await fetch(url, { redirect: 'manual' });
  return { status: r.status, cookie: setCookie(r, PLAY_COOKIE), location: r.headers.get('location') };
}
const game = (cookie: string | undefined, path = '/') =>
  fetch(`${playUrl}${path}`, {
    headers: cookie ? { cookie: `${PLAY_COOKIE}=${cookieValue(cookie, PLAY_COOKIE)}` } : {},
  });

beforeAll(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-play-'));
  op = await new TestOp().start();
  const gameDir = join(tmp, 'game');
  cpSync(join(ROOT, 'games', '_template'), gameDir, { recursive: true });
  const db = await openSqliteDb(join(tmp, 'j.sqlite'));
  const journal = await Journal.open({ db, blobs: fsBlobStore(join(tmp, 'blobs')), gameDir });
  const lease = new ServiceLease(db);
  await lease.tick();
  const s = createStudio({ gameDir, root: tmp, journal, importFresh: importInChild });
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
  store = new AuthStore(db, () => clock);
  const gate = new Gate({ store, oidc, sealer, publicUrl: studioUrl, now: () => clock });
  const handle = authRoutes({ gate, store, oidc, sealer, publicUrl: studioUrl, send, readJson });
  const handler = new Play({
    db,
    store,
    publicUrl: studioUrl,
    playUrl,
    idleMs: gate.idleMs,
    now: () => clock,
    // The owner chose public builds (4.2.2, D42): those paths only are served without a session.
    open: (path) => path.startsWith('/play/'),
    content: (req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(`game ${req.url}`);
    },
  });
  const server = studioServer({
    studio: s,
    journal,
    db,
    lease,
    log: () => {},
    perMinute: 10_000,
    auth: { gate, handle },
    play: { handler, playUrl },
  });
  await new Promise<void>((ok) => server.listen(port, '127.0.0.1', ok));
  for (const [who, role] of [
    ['lea', 'owner'],
    ['ana', 'reviewer'],
  ] as const) {
    const cookie = await login(who, await store.invite(USERS[who]!.email, role, 'test'));
    people[who] = { cookie, id: '' };
    const r = (await (
      await fetch(`${studioUrl}/auth/me`, { headers: { cookie: `__Host-ws_session=${cookie}` } })
    ).json()) as {
      user: { id: string };
    };
    people[who]!.id = r.user.id;
  }
  // Everything opened is closed before the folder goes: Windows deletes no open file.
  stop = async () => {
    server.close();
    op.stop();
    await journal.close();
    await db.close();
  };
}, 90_000);
afterAll(async () => {
  await stop();
  rmSync(tmp, { recursive: true, force: true });
});

describe('the game origin', () => {
  it('answers nobody without a game session, and serves no Studio API, ever', async () => {
    expect((await game(undefined)).status).toBe(401);
    // The Studio's cookie means nothing there.
    const r = await fetch(`${playUrl}/api/game`, { headers: { cookie: `__Host-ws_session=${people.lea!.cookie}` } });
    expect(r.status).toBe(401);
    const g = await open(await ticket('lea'));
    const api = await game(g.cookie, '/api/game');
    expect(await api.text()).toBe('game /api/game');
  });

  it('serves a public build to anyone, framed by the Studio only, and nothing else of the origin', async () => {
    const r = await game(undefined, '/play/1/');
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('game /play/1/');
    expect(r.headers.get('content-security-policy')).toBe(`frame-ancestors ${studioUrl}`);
    expect(r.headers.get('set-cookie')).toBeNull();
    for (const p of ['/preview/1/', '/', '/plays/1/']) expect((await game(undefined, p)).status, p).toBe(401);
  });

  it('a ticket becomes a partitioned game session, framed by the Studio only; used twice it is gone', async () => {
    const url = await ticket('ana', '/rooms?x=1');
    expect(url.startsWith(`${playUrl}/_ticket?t=`)).toBe(true);
    const g = await open(url);
    expect(g.status).toBe(302);
    expect(g.location).toBe('/rooms?x=1');
    expect(g.cookie).toMatch(/; Secure; HttpOnly; SameSite=None; Partitioned;/);
    const r = await game(g.cookie, '/rooms');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-security-policy')).toBe(`frame-ancestors ${studioUrl}`);
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    expect((await open(url)).status).toBe(410);
  });

  it('a ticket lives 60 s, goes only to a relative path, and only to a browser session', async () => {
    const url = await ticket('ana');
    clock += 61_000;
    expect((await open(url)).status).toBe(410);
    expect((await open(await ticket('ana', 'https://evil.example/x'))).location).toBe('/');
    const bearer = await op.accessToken({ sub: 'u-ana' });
    const r = await fetch(`${studioUrl}/api/play-ticket`, {
      method: 'POST',
      headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(r.status).toBe(403);
    // The Studio's origin does not take a game cookie as a session.
    const g = await open(await ticket('ana'));
    const api = await fetch(`${studioUrl}/api/game`, {
      headers: { cookie: `${PLAY_COOKIE}=${cookieValue(g.cookie, PLAY_COOKIE)}` },
    });
    expect(api.status).toBe(401);
  });

  it('a game session ends at the next request when its Studio session ends or its member is removed', async () => {
    const g = await open(await ticket('ana'));
    expect((await game(g.cookie)).status).toBe(200);
    expect((await studio('lea', 'DELETE', `/api/members/${people.ana!.id}`)).status).toBe(200);
    expect((await game(g.cookie)).status).toBe(403);
    const l = await open(await ticket('lea'));
    expect((await game(l.cookie)).status).toBe(200);
    expect((await studio('lea', 'POST', '/auth/logout', {})).status).toBe(200);
    expect((await game(l.cookie)).status).toBe(403);
  });

  it('slides while it is used with the Studio open, and stops within R once the Studio is closed', async () => {
    people.lea!.cookie = await login('lea');
    let cookie = (await open(await ticket('lea'))).cookie;
    // 20 min of play, the Studio open beside it (its requests have the provider confirm the session every 5 min).
    for (let i = 0; i < 4; i++) {
      clock += 5 * 60_000;
      expect((await studio('lea', 'GET', '/api/revision')).status).toBe(200);
      const r = await game(cookie);
      expect(r.status).toBe(200);
      const again = setCookie(r, PLAY_COOKIE);
      expect(again).toMatch(/Max-Age=\d+/);
      cookie = again ?? cookie;
    }
    // The Studio closed: nobody asks the provider any more, and the game stops within R (15 min).
    let stopped = 0;
    for (let i = 1; i <= 4 && !stopped; i++) {
      clock += 5 * 60_000;
      const r = await game(cookie);
      if (r.status !== 200) stopped = i * 5;
      else cookie = setCookie(r, PLAY_COOKIE) ?? cookie;
    }
    expect(stopped).toBeGreaterThan(0);
    expect(stopped).toBeLessThanOrEqual(15);
  });

  it('a game session lasts 15 min without use', async () => {
    people.lea!.cookie = await login('lea');
    const g = await open(await ticket('lea'));
    clock += 16 * 60_000;
    // The Studio session is still live (its idle limit is 8 h), the game session is not.
    expect((await game(g.cookie)).status).toBe(401);
  });
});
