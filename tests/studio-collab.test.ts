// A shared Studio (4.2.1 PR 6, plan P2, P7, §5): every file has one span; a write claims the spans it touches, all or
// none, without waiting; a span another member holds is a 423 naming them; leases run out, are renewed by the
// heartbeat, taken over by an owner (fenced, audited) and made exclusive; the live stream tells every revision, lease
// and presence, and closes when its user is revoked or its token ends. Three members and a reviewer, one provider.
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import type { SqlDb } from '../bridge/src/store-sql';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { createStudio, importInChild, operationContext } from '../studio-server/src/ops/core';
import { Journal } from '../studio-server/src/ops/journal';
import { spanOf, spansOf } from '../studio-server/src/ops/spans';
import { Gate } from '../studio-server/src/server/auth/gate';
import { Oidc } from '../studio-server/src/server/auth/oidc';
import { authRoutes } from '../studio-server/src/server/auth/routes';
import { AuthStore, Sealer } from '../studio-server/src/server/auth/store';
import { Comments } from '../studio-server/src/server/comments';
import { readJson, send, studioServer } from '../studio-server/src/server/http';
import { Leases, SpanLocked } from '../studio-server/src/server/leases';
import { Presence } from '../studio-server/src/server/live';
import { ServiceLease } from '../studio-server/src/server/service-lease';
import { TestOp, type TestUser } from './fixtures/oidc-op';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, base: string, op: TestOp, store: AuthStore, stop: () => Promise<void>, db: SqlDb, leases: Leases;
const people: Record<string, { cookie: string; id: string }> = {};
const USERS: Record<string, TestUser> = {
  lea: { sub: 'u-lea', email: 'lea@example.org', emailVerified: true, name: 'Léa' },
  tom: { sub: 'u-tom', email: 'tom@example.org', emailVerified: true, name: 'Tom' },
  sam: { sub: 'u-sam', email: 'sam@example.org', emailVerified: true, name: 'Sam' },
  ana: { sub: 'u-ana', email: 'ana@example.org', emailVerified: true, name: 'Ana' },
};

const freePort = () =>
  new Promise<number>((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
  });
const cookieOf = (r: Response, name: string) =>
  r.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${name}=`))
    ?.split(';')[0]!
    .slice(name.length + 1);

async function login(who: string, invite?: string): Promise<string> {
  op.user = USERS[who]!;
  op.sid = `sid-${who}-${Math.random()}`;
  const r1 = await fetch(`${base}/auth/login?${new URLSearchParams(invite ? { invite } : {})}`, { redirect: 'manual' });
  const pre = cookieOf(r1, '__Host-ws_pre')!;
  const r2 = await fetch(r1.headers.get('location')!, { redirect: 'manual' });
  const r3 = await fetch(r2.headers.get('location')!, {
    redirect: 'manual',
    headers: { cookie: `__Host-ws_pre=${pre}` },
  });
  return cookieOf(r3, '__Host-ws_session')!;
}

/** A request as `who` (policy A: the Studio's headers on a mutation). */
const as = (who: string, method: string, path: string, body?: unknown, extra: Record<string, string> = {}) =>
  fetch(`${base}/api${path}`, {
    method,
    headers: {
      cookie: `__Host-ws_session=${people[who]!.cookie}`,
      ...(method === 'GET' ? {} : { origin: base, 'x-studio-request': '1', 'content-type': 'application/json' }),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const layout = () => JSON.parse(readFileSync(join(ROOT, 'games', '_template', 'layout', 'start.json'), 'utf8'));
const moveLayout = (who: string, n: number, extra: Record<string, string> = {}) => {
  const l = layout();
  l.__test = n;
  return as(who, 'PUT', '/room/start/layout', l, extra);
};

beforeAll(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-collab-'));
  op = await new TestOp().start();
  const game = join(tmp, 'game');
  cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
  db = await openSqliteDb(join(tmp, 'j.sqlite'));
  leases = new Leases(db, { ttlMs: 2_000 });
  const journal = await Journal.open({
    db,
    blobs: fsBlobStore(join(tmp, 'blobs')),
    gameDir: game,
    claim: async (q, paths) => {
      const who = operationContext.getStore()?.claimant;
      if (!who) throw new Error('a write on a shared Studio says who writes');
      await leases.claimPaths(q, who, paths);
    },
    precheck: async (paths) => {
      const who = operationContext.getStore()?.claimant;
      if (who) await leases.check(who, spansOf(paths));
    },
  });
  const lease = new ServiceLease(db);
  await lease.tick();
  const studio = createStudio({ gameDir: game, root: tmp, journal, importFresh: importInChild });
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  const oidc = await Oidc.discover({
    issuer: op.issuer,
    clientId: op.clientId,
    clientSecret: op.clientSecret,
    audience: op.audience,
    allowInsecure: true,
  });
  const sealer = new Sealer(['a-session-key-of-at-least-32-characters']);
  store = new AuthStore(db);
  const gate = new Gate({ store, oidc, sealer, publicUrl: base });
  const handle = authRoutes({ gate, store, oidc, sealer, publicUrl: base, send, readJson });
  const presence = new Presence();
  const server = studioServer({
    studio,
    journal,
    db,
    lease,
    log: () => {},
    perMinute: 10_000,
    auth: { gate, handle, audit: (a, e, d) => store.audit(a, e, d) },
    leases,
    presence,
    comments: new Comments({ db, known: async () => new Set(['start']), revision: () => journal.revision() }),
  });
  await new Promise<void>((ok) => server.listen(port, '127.0.0.1', ok));
  for (const [who, role] of [
    ['lea', 'owner'],
    ['tom', 'dev'],
    ['sam', 'dev'],
    ['ana', 'reviewer'],
  ] as const) {
    const cookie = await login(who, await store.invite(USERS[who]!.email, role, 'test'));
    const me = (await (
      await fetch(`${base}/auth/me`, { headers: { cookie: `__Host-ws_session=${cookie}` } })
    ).json()) as {
      user: { id: string };
    };
    people[who] = { cookie, id: me.user.id };
  }
  // Everything opened is closed before the folder goes: Windows deletes no open file.
  stop = async () => {
    presence.stop();
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

describe('the spans', () => {
  it('every file of every game in this repository has exactly one span', () => {
    for (const g of readdirSync(join(ROOT, 'games'))) {
      const root = join(ROOT, 'games', g);
      const walk = (d: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          if (e.name.startsWith('.')) continue;
          const p = join(d, e.name);
          if (e.isDirectory()) walk(p);
          else expect(() => spanOf(relative(root, p).split('\\').join('/')), p).not.toThrow();
        }
      };
      walk(root);
    }
    expect(spansOf(['layout/garden.json', 'rooms/garden.ts', 'locales/fr.json', 'game.ts'])).toEqual([
      'game',
      'lang:fr',
      'room:garden',
    ]);
    expect(() => spanOf('mystery.bin')).toThrow(/no span/);
  });
});

describe('leases, one database', () => {
  const who = (userId: string) => ({ userId, name: userId });

  it('a claim takes all its spans or none, and never waits', async () => {
    await leases.take(who('x'), ['room:b']);
    await expect(db.tx('studio', (q) => leases.claim(q, who('y'), ['room:a', 'room:b']))).rejects.toBeInstanceOf(
      SpanLocked,
    );
    expect((await leases.list()).map((l) => l.span)).toEqual(['room:b']);
    await leases.release('x');
  });

  it('ten members claiming one span at once: exactly one gets it', async () => {
    const r = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => leases.take(who(`m${i}`), ['room:race'])));
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const holder = (await leases.list()).find((l) => l.span === 'room:race')!.holder;
    await leases.release(holder);
  });
});

describe('a shared Studio', () => {
  it('a member writing a room holds it: another gets a 423 naming them, and writes elsewhere', async () => {
    expect((await moveLayout('tom', 1)).status).toBe(200);
    const r = await moveLayout('sam', 2);
    expect(r.status).toBe(423);
    expect((await r.json()) as { holderName: string; span: string }).toMatchObject({
      span: 'room:start',
      holderName: 'Tom',
    });
    expect((await as('sam', 'POST', '/notes', { text: 'from Sam' })).status).toBe(200);
    // The lease runs out (TTL 2 s here) without a heartbeat: Sam may write the room now.
    await new Promise((ok) => setTimeout(ok, 2_200));
    expect((await moveLayout('sam', 3)).status).toBe(200);
  }, 60_000);

  it('the heartbeat renews the leases, and says who is here; a reviewer is here but holds nothing', async () => {
    expect((await moveLayout('sam', 4)).status).toBe(200);
    for (let i = 0; i < 3; i++) {
      await new Promise((ok) => setTimeout(ok, 900));
      expect((await as('sam', 'POST', '/presence', { where: 'room:start' })).status).toBe(200);
    }
    expect((await moveLayout('tom', 5)).status).toBe(423);
    const r = (await (await as('ana', 'POST', '/presence', { where: 'map' })).json()) as { here: { name: string }[] };
    expect(r.here.map((h) => h.name)).toEqual(['Ana', 'Sam']);
    expect((await as('ana', 'POST', '/leases', { spans: ['notes'] })).status).toBe(403);
    await as('sam', 'POST', '/leases/release', {});
  }, 60_000);

  it('an owner takes a span over: the old holder’s fenced write is refused, and the audit names them', async () => {
    const t = (await (await as('tom', 'POST', '/leases', { spans: ['room:start'] })).json()) as {
      fences: Record<string, number>;
    };
    const fence = t.fences['room:start']!;
    const over = (await (await as('lea', 'POST', '/leases/takeover', { span: 'room:start' })).json()) as {
      previous: { holder: string };
    };
    expect(over.previous.holder).toBe(people.tom!.id);
    const late = await moveLayout('tom', 6, { 'x-studio-fences': JSON.stringify({ 'room:start': fence }) });
    expect(late.status).toBe(423);
    const audit = (await (await as('lea', 'GET', '/audit')).json()) as { entries: { event: string }[] };
    expect(audit.entries.map((e) => e.event)).toContain('lease-takeover');
    await as('lea', 'POST', '/leases/release', {});
  }, 60_000);

  it('the exclusive lease waits for no one and blocks everyone', async () => {
    await as('tom', 'POST', '/leases', { spans: ['notes'] });
    expect((await as('lea', 'POST', '/exclusive', {})).status).toBe(423);
    await as('tom', 'POST', '/leases/release', {});
    expect((await as('lea', 'POST', '/exclusive', {})).status).toBe(200);
    const r = await as('sam', 'POST', '/notes', { text: 'blocked' });
    expect(r.status).toBe(423);
    expect(((await r.json()) as { error: string }).error).toMatch(/whole game/);
    expect((await as('tom', 'POST', '/exclusive', {})).status).toBe(403);
    await as('lea', 'POST', '/exclusive/release', {});
  }, 60_000);

  it('lets a reviewer comment, never write the game; the notes come in by an owner (H2)', async () => {
    const r = await as('ana', 'POST', '/comments', { anchor: 'start', text: 'The light is lovely' });
    expect(r.status).toBe(201);
    const c = (await r.json()) as { id: string; author: string; orphan: boolean };
    expect(c).toMatchObject({ author: 'Ana', orphan: false });
    expect((await as('ana', 'PUT', `/comments/${c.id}`, { text: 'The light is lovely here' })).status).toBe(200);
    expect((await as('ana', 'POST', '/notes', { text: 'a note' })).status).toBe(403);
    const list = (await (await as('ana', 'GET', '/comments?anchor=start')).json()) as { comments: { id: string }[] };
    expect(list.comments.map((x) => x.id)).toContain(c.id);
    expect((await as('tom', 'POST', '/comments/import-notes', {})).status).toBe(403);
    expect((await as('lea', 'POST', '/comments/import-notes', {})).status).toBe(200);
  });

  it('undo waits for 4.2.2 on a shared Studio', async () => {
    expect((await as('tom', 'POST', '/undo', {})).status).toBe(409);
  });

  it('a write behind the revision it read is a 409 with what changed, then applied on the head on request (H10)', async () => {
    await as('lea', 'POST', '/leases/release', {});
    await as('tom', 'POST', '/leases/release', {});
    // Tom reads the room; Léa moves it meanwhile.
    const read = await as('tom', 'GET', '/room/start');
    const readAt = Number(read.headers.get('x-studio-revision'));
    expect(Number.isSafeInteger(readAt)).toBe(true);
    expect((await moveLayout('lea', 101)).status).toBe(200);
    await as('lea', 'POST', '/leases/release', {});
    // Tom's write, from what he read: refused, with the file at his revision and now.
    const r = await moveLayout('tom', 102, { 'x-studio-base': String(readAt) });
    expect(r.status).toBe(409);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ path: 'layout/start.json', readAt });
    expect(Number(body.head)).toBeGreaterThan(readAt);
    expect(String(body.before)).not.toContain('"__test": 101');
    expect(JSON.parse(String(body.now)).__test).toBe(101);
    // A base that is not a revision is refused as such.
    expect((await moveLayout('tom', 102, { 'x-studio-base': 'soon' })).status).toBe(400);
    expect(
      (await moveLayout('tom', 102, { 'x-studio-base': String(body.head), 'x-studio-client': 'short' })).status,
    ).toBe(400);
    // Applied on the head when Tom asks: from the revision Léa's change made, it is his edit on hers.
    const ok = await moveLayout('tom', 102, { 'x-studio-base': String(body.head) });
    expect(ok.status).toBe(200);
    // A write says the revision after it: Tom's next write from there is no conflict with his own.
    const after = Number(ok.headers.get('x-studio-revision'));
    expect(after).toBeGreaterThan(Number(body.head));
    expect((await moveLayout('tom', 103, { 'x-studio-base': String(after) })).status).toBe(200);
    await as('tom', 'POST', '/leases/release', {});
  });
});

/** Reads an SSE stream into `events` until it ends; `ended` resolves then. */
function stream(res: Response) {
  const events: { name: string; data: unknown }[] = [];
  const ended = (async () => {
    const reader = res.body!.getReader();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buf += new TextDecoder().decode(value);
      let i: number;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const name = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];
        if (name && data) events.push({ name, data: JSON.parse(data) });
      }
    }
  })();
  return { events, ended };
}
const until = async (f: () => boolean, ms = 5_000) => {
  const t0 = Date.now();
  while (!f()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((ok) => setTimeout(ok, 50));
  }
};

describe('the live stream', () => {
  it('tells every revision with its spans, and who is here', async () => {
    const s = stream(await as('ana', 'GET', '/events'));
    await until(() => s.events.some((e) => e.name === 'hello'));
    expect(s.events[0]!.name).toBe('hello');
    expect((await as('tom', 'POST', '/notes', { text: 'live' })).status).toBe(200);
    await until(() => s.events.some((e) => e.name === 'revision'));
    expect(s.events.find((e) => e.name === 'revision')!.data).toMatchObject({
      spans: ['notes'],
      paths: ['notes.json'],
    });
    await until(() => s.events.some((e) => e.name === 'leases'));
    expect((s.events.find((e) => e.name === 'leases')!.data as { seq: number }).seq).toBeGreaterThan(0);
    // Someone moving is news; the same place again is not.
    await as('sam', 'POST', '/presence', { where: 'storyboard' });
    await until(() => s.events.some((e) => e.name === 'presence'));
    await as('tom', 'POST', '/leases/release', {});
  }, 30_000);

  it('closes within 5 s when its member is removed, and their leases go at once', async () => {
    expect((await as('sam', 'POST', '/leases', { spans: ['story'] })).status).toBe(200);
    const s = stream(await as('sam', 'GET', '/events'));
    await until(() => s.events.some((e) => e.name === 'hello'));
    const t0 = Date.now();
    expect((await as('lea', 'DELETE', `/members/${people.sam!.id}`)).status).toBe(200);
    await s.ended;
    expect(Date.now() - t0).toBeLessThan(5_000);
    let released = false;
    for (let i = 0; i < 50 && !released; i++) {
      const left = (await (await as('lea', 'GET', '/leases')).json()) as { leases: { holder: string }[] };
      released = !left.leases.some((l) => l.holder === people.sam!.id);
      if (!released) await new Promise((ok) => setTimeout(ok, 50));
    }
    expect(released).toBe(true);
  }, 30_000);

  it('closes when the Bearer token that opened it ends', async () => {
    const token = await op.accessToken({ sub: 'u-tom', life: 2 });
    const res = await fetch(`${base}/api/events`, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const s = stream(res);
    const t0 = Date.now();
    await s.ended;
    expect(Date.now() - t0).toBeLessThan(4_000);
  }, 30_000);
});

const PG = process.env.STUDIO_TEST_PG_URL;
describe.runIf(PG)('leases on Postgres', () => {
  it('ten members claiming one span at once: exactly one gets it; the fence grows with each new holder', async () => {
    const { openPostgresDb } = await import('../studio-server/src/server/postgres');
    const pg = await openPostgresDb(PG!);
    try {
      await pg.exec('DROP TABLE IF EXISTS studio_spans');
      await pg.exec(
        'CREATE TABLE studio_spans (span TEXT PRIMARY KEY, holder TEXT NOT NULL, holder_name TEXT NOT NULL, fence BIGINT NOT NULL, until_ms BIGINT NOT NULL)',
      );
      const l = new Leases(pg, { ttlMs: 60_000 });
      const r = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) => l.take({ userId: `m${i}`, name: `m${i}` }, ['room:race'])),
      );
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      const first = (await l.list())[0]!;
      await l.release(first.holder);
      const again = await l.take({ userId: 'other', name: 'other' }, ['room:race']);
      expect(again['room:race']).toBe(first.fence + 1);
    } finally {
      await pg.exec('DROP TABLE IF EXISTS studio_spans');
      await pg.close();
    }
  }, 60_000);
});
