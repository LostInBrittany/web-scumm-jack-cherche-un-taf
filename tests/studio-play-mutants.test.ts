// The game's origin (4.2.1, studio-server/src/server/play.ts), pinned for the mutation set `studio-auth`, on a
// clock the test moves: a ticket is GET only and good to its very last millisecond; a ticket whose Studio session
// ended is refused; the cookie's lifetime; a game session's absolute and idle ends, each alone and to the
// millisecond; its sliding (not within the minute, from just past it); each reason a Studio session no longer
// carries a game; the ticket request's body. Driven directly, with a fake store.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../bridge/src/migrations';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import type { SqlDb } from '../bridge/src/store-sql';
import type { Session } from '../studio-server/src/server/auth/store';
import { Play, PLAY_COOKIE, playTicketBody } from '../studio-server/src/server/play';

const PLAY = 'https://play.example.fr';
const MIN = 60_000;
let root: string, db: SqlDb, now: number, studio: Partial<Session> | undefined;

beforeEach(async () => {
  mkdirSync(join(process.cwd(), '.cache'), { recursive: true });
  root = mkdtempSync(join(process.cwd(), '.cache', 'play-mut-'));
  db = await openSqliteDb(join(root, 'j.sqlite'));
  await migrate(db, { dir: new URL('../studio-server/migrations/', import.meta.url) });
  now = 100_000_000;
  studio = {
    idHash: 'h1',
    user: { id: 'u1' } as never,
    role: 'dev',
    expiresAt: now + 24 * 60 * MIN,
    lastSeen: now,
    suspended: false,
    checkedAt: now,
  };
});
afterEach(async () => {
  await db.close();
  rmSync(root, { recursive: true, force: true });
});

const play = () =>
  new Play({
    db,
    store: { sessionByHash: async () => (studio ? { ...studio } : undefined) } as never,
    publicUrl: 'https://studio.example.fr',
    playUrl: PLAY,
    idleMs: 8 * 60 * MIN,
    now: () => now,
    content: (_req, res) => {
      res.writeHead(200);
      res.end('game');
    },
  });

/** One request to the game's origin: its status, its Set-Cookie. */
async function hit(p: Play, path: string, o: { method?: string; cookie?: string } = {}) {
  const out: { status?: number; cookie?: string } = {};
  const headers: Record<string, string | string[]> = {};
  const res = {
    setHeader: (k: string, v: string) => void (headers[k.toLowerCase()] = v),
    writeHead: (s: number, h: Record<string, string> = {}) => {
      out.status = s;
      for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = v;
    },
    end: () => {},
  } as unknown as ServerResponse;
  const req = {
    method: o.method ?? 'GET',
    headers: o.cookie ? { cookie: `${PLAY_COOKIE}=${o.cookie}` } : {},
  } as unknown as IncomingMessage;
  await p.handle(req, res, new URL(path, PLAY));
  out.cookie = headers['set-cookie'] as string | undefined;
  return out;
}
const cookieValue = (c?: string) => c?.split(';')[0]!.split('=')[1];
const maxAge = (c?: string) => Number(/Max-Age=(\d+)/.exec(c ?? '')?.[1]);
async function session(p: Play) {
  const t = new URL(await p.ticket('u1', 'h1', '/'));
  const r = await hit(p, `${t.pathname}${t.search}`);
  return cookieValue(r.cookie)!;
}

describe('tickets', () => {
  it('are GET only, and good to their very last millisecond', async () => {
    const p = play();
    const t = new URL(await p.ticket('u1', 'h1', '/'));
    expect((await hit(p, `${t.pathname}${t.search}`, { method: 'POST' })).status).toBe(405);
    const u = new URL(await p.ticket('u1', 'h1', '/'));
    now += MIN;
    const r = await hit(p, `${u.pathname}${u.search}`);
    expect(r.status).toBe(302);
    expect(maxAge(r.cookie)).toBe(15 * 60);
  });

  it('is refused when its Studio session has ended', async () => {
    const p = play();
    const t = new URL(await p.ticket('u1', 'h1', '/'));
    studio = undefined;
    expect((await hit(p, `${t.pathname}${t.search}`)).status).toBe(403);
  });
});

describe('a game session', () => {
  it('ends at its absolute end or after 15 min unused, to the millisecond', async () => {
    const p = play();
    const c = await session(p);
    now += 15 * MIN - 1;
    // Unused all that time: still good one millisecond before its end.
    expect((await hit(p, '/x', { cookie: c })).status).toBe(200);
    const q = play();
    const d = await session(q);
    now += 15 * MIN;
    expect((await hit(q, '/x', { cookie: d })).status).toBe(401);
  });

  it('never outlives its Studio session (absolute expiry reached first)', async () => {
    studio!.expiresAt = now + 5 * MIN;
    const p = play();
    const c = await session(p);
    now += 5 * MIN;
    expect((await hit(p, '/x', { cookie: c })).status).toBe(401);
  });

  it('slides from just past a minute of use, not before; its cookie then lasts 15 min again', async () => {
    const p = play();
    const c = await session(p);
    now += 30_000;
    expect((await hit(p, '/x', { cookie: c })).cookie).toBeUndefined();
    now += 30_000;
    expect((await hit(p, '/x', { cookie: c })).cookie).toBeUndefined();
    now += 1;
    const r = await hit(p, '/x', { cookie: c });
    expect(maxAge(r.cookie)).toBe(15 * 60);
    // The slide moved its end: 15 min after this use, not after the first.
    now += 15 * MIN - 1;
    studio!.checkedAt = now;
    studio!.lastSeen = now;
    expect((await hit(p, '/x', { cookie: c })).status).toBe(200);
  });

  it('is refused when its Studio session expired, went idle, is suspended, or its user is no member, each alone', async () => {
    for (const [what, change] of [
      ['expired', () => (studio!.expiresAt = now)],
      ['idle', () => (studio!.lastSeen = now - 8 * 60 * MIN)],
      ['suspended', () => (studio!.suspended = true)],
      ['no member', () => (studio!.role = undefined)],
    ] as const) {
      studio = {
        idHash: 'h1',
        user: { id: 'u1' } as never,
        role: 'dev',
        expiresAt: now + 24 * 60 * MIN,
        lastSeen: now,
        suspended: false,
        checkedAt: now,
      };
      const p = play();
      const c = await session(p);
      change();
      expect((await hit(p, '/x', { cookie: c })).status, what).toBe(403);
    }
  });
});

describe('the ticket request', () => {
  it('is a JSON object whose path, when given, is a string', () => {
    expect(() => playTicketBody(null)).toThrow('the body is a JSON object');
    expect(() => playTicketBody('x')).toThrow('the body is a JSON object');
    expect(() => playTicketBody({ path: 3 })).toThrow('`path` is a relative path of the game');
    expect(playTicketBody({})).toBe('/');
    expect(playTicketBody({ path: '/rooms' })).toBe('/rooms');
  });
});
