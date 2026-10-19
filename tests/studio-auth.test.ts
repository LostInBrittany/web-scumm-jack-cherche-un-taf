// Authentication and rights of the Studio Server (4.2.1, plan §3, ADR 0027), against a test OpenID provider: the
// login (code + PKCE + state + nonce), the four HTTP policies and their exceptions, invitations, the roles over every
// route, the owner's routes, the back-channel logout, and the revocation bounds (R = 15 min) on a simulated clock.
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { createStudio, importInChild } from '../studio-server/src/ops/core';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { Journal } from '../studio-server/src/ops/journal';
import { routes } from '../studio-server/src/ops/routes';
import { accessToken, deviceLogin } from '../studio-server/src/server/auth/device';
import { Gate } from '../studio-server/src/server/auth/gate';
import { Oidc } from '../studio-server/src/server/auth/oidc';
import { authRoutes, safeReturn } from '../studio-server/src/server/auth/routes';
import { AuthStore, Sealer } from '../studio-server/src/server/auth/store';
import type { SqlDb } from '../bridge/src/store-sql';
import { readJson, roleFor, send, studioServer } from '../studio-server/src/server/http';
import { ServiceLease } from '../studio-server/src/server/service-lease';
import { TestOp } from './fixtures/oidc-op';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, base: string, op: TestOp, store: AuthStore, gate: Gate, stop: () => Promise<void>, sql: SqlDb;
let clock = Date.now();

const freePort = () =>
  new Promise<number>((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
  });

/** The value of a Set-Cookie for `name`. */
const cookieOf = (r: Response, name: string) =>
  r.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${name}=`))
    ?.split(';')[0]!
    .slice(name.length + 1);

/** A full login as the provider's current user, carrying `invite`; returns the session cookie. */
async function login(o: { invite?: string; returnTo?: string } = {}): Promise<{ session?: string; location: string }> {
  const q = new URLSearchParams({
    ...(o.returnTo ? { returnTo: o.returnTo } : {}),
    ...(o.invite ? { invite: o.invite } : {}),
  });
  const r1 = await fetch(`${base}/auth/login?${q}`, { redirect: 'manual' });
  expect(r1.status).toBe(302);
  const pre = cookieOf(r1, '__Host-ws_pre')!;
  const r2 = await fetch(r1.headers.get('location')!, { redirect: 'manual' });
  const r3 = await fetch(r2.headers.get('location')!, {
    redirect: 'manual',
    headers: { cookie: `__Host-ws_pre=${pre}` },
  });
  return { session: cookieOf(r3, '__Host-ws_session'), location: r3.headers.get('location') ?? '' };
}

const withCookie = (s: string, init: RequestInit = {}) => ({
  ...init,
  headers: { ...(init.headers as Record<string, string>), cookie: `__Host-ws_session=${s}` },
});
const write = (s: string, body: unknown, extra: Record<string, string> = {}) =>
  withCookie(s, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin: base, 'x-studio-request': '1', ...extra },
  });

beforeAll(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-auth-'));
  op = await new TestOp().start();
  const game = join(tmp, 'game');
  cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
  const db = await openSqliteDb(join(tmp, 'j.sqlite'));
  sql = db;
  const journal = await Journal.open({ db, blobs: fsBlobStore(join(tmp, 'blobs')), gameDir: game });
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
  store = new AuthStore(db, () => clock);
  gate = new Gate({ store, oidc, sealer, publicUrl: base, now: () => clock });
  const handle = authRoutes({
    gate,
    store,
    oidc,
    sealer,
    publicUrl: base,
    cliClientId: 'web-scumm-cli',
    send,
    readJson,
  });
  const server = studioServer({ studio, journal, db, lease, log: () => {}, perMinute: 10_000, auth: { gate, handle } });
  await new Promise<void>((ok) => server.listen(port, '127.0.0.1', ok));
  // Everything opened is closed before the folder goes: Windows deletes no open file.
  stop = async () => {
    server.close();
    op.stop();
    await journal.close();
    await db.close();
  };
}, 60_000);
afterAll(async () => {
  await stop();
  rmSync(tmp, { recursive: true, force: true });
});

let owner = '',
  dev = '',
  reviewer = '';

describe('login and invitations', () => {
  it('nobody gets in without a session', async () => {
    const r = await fetch(`${base}/api/game`);
    expect(r.status).toBe(401);
  });

  it('an invitation makes the first owner; the session cookie is set at the callback', async () => {
    const token = await store.invite('lea@example.org', 'owner', 'test');
    const l = await login({ invite: token, returnTo: '/rooms' });
    expect(l.location).toBe('/rooms');
    owner = l.session!;
    expect((await fetch(`${base}/api/game`, withCookie(owner))).status).toBe(200);
    const me = (await (await fetch(`${base}/auth/me`, withCookie(owner))).json()) as { role: string };
    expect(me.role).toBe('owner');
  });

  it('an invitation is used once, and only by the verified email it names', async () => {
    const token = await store.invite('tom@example.org', 'dev', 'test');
    op.user = { sub: 'u-eve', email: 'eve@example.org', emailVerified: true };
    const eve = await login({ invite: token });
    expect((await fetch(`${base}/api/game`, withCookie(eve.session!))).status).toBe(403);
    op.user = { sub: 'u-tom', email: 'tom@example.org', emailVerified: false };
    const unverified = await login({ invite: token });
    expect((await fetch(`${base}/api/game`, withCookie(unverified.session!))).status).toBe(403);
    op.user = { sub: 'u-tom', email: 'tom@example.org', emailVerified: true };
    dev = (await login({ invite: token })).session!;
    expect((await fetch(`${base}/api/game`, withCookie(dev))).status).toBe(200);
    op.user = { sub: 'u-max', email: 'max@example.org', emailVerified: true };
    const reused = await login({ invite: token });
    expect((await fetch(`${base}/api/game`, withCookie(reused.session!))).status).toBe(403);
  });

  it('a login page used twice is refused, and the return path is never another site', async () => {
    const r1 = await fetch(`${base}/auth/login`, { redirect: 'manual' });
    const pre = cookieOf(r1, '__Host-ws_pre')!;
    const r2 = await fetch(r1.headers.get('location')!, { redirect: 'manual' });
    const cb = r2.headers.get('location')!;
    expect((await fetch(cb, { redirect: 'manual', headers: { cookie: `__Host-ws_pre=${pre}` } })).status).toBe(302);
    expect((await fetch(cb, { redirect: 'manual', headers: { cookie: `__Host-ws_pre=${pre}` } })).status).toBe(400);
    expect(safeReturn('//evil.example/x')).toBe('/');
    expect(safeReturn('https://evil.example')).toBe('/');
    expect(safeReturn('/\\evil')).toBe('/');
    // A tab is dropped by browsers: `/\t/evil.example` would become `//evil.example`.
    expect(safeReturn('/\t/evil.example')).toBe('/');
    expect(safeReturn('/%09/evil.example')).toBe('/%09/evil.example');
    expect(safeReturn('/rooms?x=1')).toBe('/rooms?x=1');
  });
});

describe('policy A: the session cookie', () => {
  it('a stored answer goes back to its own author only', async () => {
    const op1 = 'op-shared-id-1';
    const a = await fetch(`${base}/api/notes`, write(dev, { text: 'mine' }, { 'x-studio-op': op1 }));
    expect(a.status).toBe(200);
    const again = await fetch(`${base}/api/notes`, write(dev, { text: 'mine' }, { 'x-studio-op': op1 }));
    expect(again.headers.get('x-studio-replayed')).toBe('1');
    const other = await fetch(`${base}/api/notes`, write(owner, { text: 'theirs' }, { 'x-studio-op': op1 }));
    expect(other.status).toBe(200);
    expect(other.headers.get('x-studio-replayed')).toBeNull();
  });

  it('ten tries of one write at once: applied once, one answer for all', async () => {
    const op = 'op-concurrent-1';
    // A regression check: on SQLite (a synchronous driver) the interleaving where a retry looks for its answer
    // before the first try stored it is not forced here; the server holds it by looking again under the write lock.
    const tries = await Promise.all(
      Array.from({ length: 10 }, () =>
        fetch(`${base}/api/notes`, write(dev, { text: 'only once' }, { 'x-studio-op': op })),
      ),
    );
    expect(tries.map((r) => r.status)).toEqual(Array(10).fill(200));
    const ids = new Set(((await Promise.all(tries.map((r) => r.json()))) as { id: string }[]).map((n) => n.id));
    expect(ids.size).toBe(1);
    expect(tries.filter((r) => r.headers.get('x-studio-replayed') === '1')).toHaveLength(9);
    const notes = (await (await fetch(`${base}/api/notes`, withCookie(dev))).json()) as { entries: { text: string }[] };
    expect(notes.entries.filter((n) => n.text === 'only once')).toHaveLength(1);
  });

  it('a mutation needs the exact Origin, the Studio header and JSON', async () => {
    const ok = await fetch(`${base}/api/notes`, write(dev, { text: 'from a dev' }));
    expect(ok.status).toBe(200);
    expect(
      (await fetch(`${base}/api/notes`, write(dev, { text: 'x' }, { origin: 'https://evil.example' }))).status,
    ).toBe(403);
    const noOrigin = write(dev, { text: 'x' });
    delete (noOrigin.headers as Record<string, string>).origin;
    expect((await fetch(`${base}/api/notes`, noOrigin)).status).toBe(403);
    expect((await fetch(`${base}/api/notes`, write(dev, { text: 'x' }, { 'x-studio-request': '0' }))).status).toBe(403);
    expect((await fetch(`${base}/api/notes`, write(dev, { text: 'x' }, { 'content-type': 'text/plain' }))).status).toBe(
      403,
    );
  });

  it('a reviewer reads and never writes; a dev never reaches the owner routes', async () => {
    const token = await store.invite('ana@example.org', 'reviewer', 'test');
    op.user = { sub: 'u-ana', email: 'ana@example.org', emailVerified: true };
    reviewer = (await login({ invite: token })).session!;
    expect((await fetch(`${base}/api/notes`, withCookie(reviewer))).status).toBe(200);
    expect((await fetch(`${base}/api/notes`, write(reviewer, { text: 'no' }))).status).toBe(403);
    expect((await fetch(`${base}/api/validate`, write(reviewer, {}))).status).toBe(200);
    expect((await fetch(`${base}/api/members`, withCookie(dev))).status).toBe(403);
  });
});

describe('policy B: Bearer access tokens', () => {
  const bearer = (t: string, init: RequestInit = {}) => ({
    ...init,
    headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${t}` },
  });

  it('a member with a valid token reads and writes, with no Origin', async () => {
    const t = await op.accessToken({ sub: 'u-tom' });
    expect((await fetch(`${base}/api/game`, bearer(t))).status).toBe(200);
    const w = await fetch(
      `${base}/api/notes`,
      bearer(t, { method: 'POST', body: '{"text":"cli"}', headers: { 'content-type': 'application/json' } }),
    );
    expect(w.status).toBe(200);
  });

  it('a Bearer request ignores the cookie: a bad token is refused even with a good session', async () => {
    const r = await fetch(`${base}/api/game`, bearer('a.b.c', { headers: { cookie: `__Host-ws_session=${owner}` } }));
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toBe('Bearer error="invalid_token"');
  });

  it('refuses an id_token, another audience, a token living too long, a non-member, a foreign origin', async () => {
    const idt = await op.idToken('u-tom', 'n');
    expect((await fetch(`${base}/api/game`, bearer(idt))).status).toBe(401);
    expect((await fetch(`${base}/api/game`, bearer(await op.accessToken({ sub: 'u-tom', aud: 'other' })))).status).toBe(
      401,
    );
    expect((await fetch(`${base}/api/game`, bearer(await op.accessToken({ sub: 'u-tom', life: 3600 })))).status).toBe(
      401,
    );
    expect((await fetch(`${base}/api/game`, bearer(await op.accessToken({ sub: 'u-eve' })))).status).toBe(403);
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'u-tom', aud: op.audience, iss: op.issuer })).toString('base64url')}.x`;
    expect((await fetch(`${base}/api/game`, bearer(unsigned))).status).toBe(401);
    const t = await op.accessToken({ sub: 'u-tom' });
    expect((await fetch(`${base}/api/game`, bearer(t, { headers: { origin: 'https://evil.example' } }))).status).toBe(
      403,
    );
  });
});

describe('the owner', () => {
  it('lists members, invites, cannot demote the last owner, and a removal ends access at once', async () => {
    const list = (await (await fetch(`${base}/api/members`, withCookie(owner))).json()) as {
      members: { id: string; email: string; role: string }[];
    };
    const lea = list.members.find((m) => m.email === 'lea@example.org')!;
    const r = await fetch(`${base}/api/members/${lea.id}`, { ...write(owner, { role: 'dev' }), method: 'PUT' });
    expect(r.status).toBe(409);
    // Nor by accepting an invitation of a lower role for one's own email.
    op.user = { sub: 'u-lea', email: 'lea@example.org', emailVerified: true };
    const self = await store.invite('lea@example.org', 'reviewer', 'test');
    const again = (await login({ invite: self })).session!;
    expect((await (await fetch(`${base}/auth/me`, withCookie(again))).json()) as { role: string }).toMatchObject({
      role: 'owner',
    });
    const inv = (await (
      await fetch(`${base}/api/invitations`, write(owner, { email: 'sam@example.org', role: 'dev' }))
    ).json()) as {
      link: string;
    };
    expect(inv.link).toMatch(/\/auth\/login\?invite=[\w-]{40,}$/);
    // Tom removed: his session and his tokens stop at the next request.
    const tom = list.members.find((m) => m.email === 'tom@example.org')!;
    const t = await op.accessToken({ sub: 'u-tom' });
    clock += 1;
    expect((await fetch(`${base}/api/members/${tom.id}`, { ...write(owner, {}), method: 'DELETE' })).status).toBe(200);
    expect((await fetch(`${base}/api/game`, withCookie(dev))).status).toBe(401);
    // A token issued before the removal is revoked (401), whatever its expiry.
    expect((await fetch(`${base}/api/game`, { headers: { authorization: `Bearer ${t}` } })).status).toBe(401);
    const audit = (await (await fetch(`${base}/api/audit`, withCookie(owner))).json()) as {
      entries: { event: string }[];
    };
    expect(audit.entries.map((e) => e.event)).toContain('member-removed');
  });
});

describe('policy D: back-channel logout', () => {
  const post = (body: string, type = 'application/x-www-form-urlencoded') =>
    fetch(`${base}/auth/backchannel`, { method: 'POST', body, headers: { 'content-type': type } });

  it('ends the sessions of a provider session, with no Origin; a replay, a nonce, no event or JSON are refused', async () => {
    op.user = { sub: 'u-ana', email: 'ana@example.org', emailVerified: true };
    op.sid = 'sid-ana';
    const s = (await login()).session!;
    expect((await fetch(`${base}/api/game`, withCookie(s))).status).toBe(200);
    const token = await op.logoutToken({ sid: 'sid-ana', jti: 'j-1' });
    expect((await post(`logout_token=${token}`)).status).toBe(200);
    expect((await fetch(`${base}/api/game`, withCookie(s))).status).toBe(401);
    expect((await post(`logout_token=${token}`)).status).toBe(400);
    expect((await post(`logout_token=${await op.logoutToken({ sid: 'x', nonce: 'n' })}`)).status).toBe(400);
    expect((await post(`logout_token=${await op.logoutToken({ sid: 'x', events: false })}`)).status).toBe(400);
    expect((await post(JSON.stringify({ logout_token: token }), 'application/json')).status).toBe(400);
  });

  it('a token naming a sid ends that provider session only, even with a sub: other devices and tokens stay', async () => {
    op.user = { sub: 'u-ana', email: 'ana@example.org', emailVerified: true };
    op.sid = 'sid-laptop';
    const laptop = (await login()).session!;
    op.sid = 'sid-phone';
    const phone = (await login()).session!;
    const cli = await op.accessToken({ sub: 'u-ana' });
    expect((await post(`logout_token=${await op.logoutToken({ sid: 'sid-laptop', sub: 'u-ana' })}`)).status).toBe(200);
    expect((await fetch(`${base}/api/game`, withCookie(laptop))).status).toBe(401);
    expect((await fetch(`${base}/api/game`, withCookie(phone))).status).toBe(200);
    expect((await fetch(`${base}/api/game`, { headers: { authorization: `Bearer ${cli}` } })).status).toBe(200);
  });
});

describe('revocation within R (simulated clock)', () => {
  it('a provider unreachable past R suspends the session (503), which comes back once it answers', async () => {
    op.user = { sub: 'u-ana', email: 'ana@example.org', emailVerified: true };
    op.sid = 'sid-2';
    const s = (await login()).session!;
    op.down = true;
    clock += 6 * 60_000;
    expect((await fetch(`${base}/api/game`, withCookie(s))).status).toBe(200);
    clock += 10 * 60_000;
    const r = await fetch(`${base}/api/game`, withCookie(s));
    expect(r.status).toBe(503);
    expect(((await r.json()) as { suspended?: boolean }).suspended).toBe(true);
    op.down = false;
    expect((await fetch(`${base}/api/game`, withCookie(s))).status).toBe(200);
  });

  it('a provider that rotates refresh tokens sees one refresh per session, concurrent requests included', async () => {
    op.user = { sub: 'u-ana', email: 'ana@example.org', emailVerified: true };
    op.strictRotation = true;
    try {
      const s = (await login()).session!;
      op.refreshCalls = 0;
      clock += 6 * 60_000;
      const all = await Promise.all(Array.from({ length: 5 }, () => fetch(`${base}/api/game`, withCookie(s))));
      expect(all.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      expect(op.refreshCalls).toBe(1);
      // The rotated token was kept: the next check uses it and succeeds.
      clock += 6 * 60_000;
      expect((await fetch(`${base}/api/game`, withCookie(s))).status).toBe(200);
      expect(op.refreshCalls).toBe(2);
    } finally {
      op.strictRotation = false;
    }
  });

  it('a refresh slower than the wait goes on and stores the rotated token', async () => {
    op.user = { sub: 'u-ana', email: 'ana@example.org', emailVerified: true };
    op.strictRotation = true;
    try {
      const s = (await login()).session!;
      op.refreshDelayMs = 6_000;
      clock += 6 * 60_000;
      expect((await fetch(`${base}/api/game`, withCookie(s))).status).toBe(200);
      op.refreshDelayMs = 0;
      await new Promise((ok) => setTimeout(ok, 1_500));
      clock += 6 * 60_000;
      expect((await fetch(`${base}/api/game`, withCookie(s))).status).toBe(200);
    } finally {
      op.strictRotation = false;
      op.refreshDelayMs = 0;
    }
  }, 20_000);

  it('a refresh token that no longer opens ends the session (fail closed)', async () => {
    op.user = { sub: 'u-ana', email: 'ana@example.org', emailVerified: true };
    const s = (await login()).session!;
    await sql.run("UPDATE studio_sessions SET refresh_enc = 'gone.AAAA.AAAA.AAAA' WHERE refresh_enc IS NOT NULL");
    clock += 6 * 60_000;
    expect((await fetch(`${base}/api/game`, withCookie(s))).status).toBe(401);
  });

  it('a user disabled at the provider loses the session at the next check', async () => {
    op.user = { sub: 'u-ana', email: 'ana@example.org', emailVerified: true };
    const s = (await login()).session!;
    op.disabled.add('u-ana');
    clock += 6 * 60_000;
    expect((await fetch(`${base}/api/game`, withCookie(s))).status).toBe(401);
    op.disabled.delete('u-ana');
  });
});

describe('logout and the CLI', () => {
  it('logout ends the session and gives the provider logout URL', async () => {
    op.user = { sub: 'u-lea', email: 'lea@example.org', emailVerified: true };
    const s = (await login()).session!;
    const r = await fetch(`${base}/auth/logout`, write(s, {}));
    const b = (await r.json()) as { redirect: string };
    expect(b.redirect.startsWith(`${op.issuer}/logout`)).toBe(true);
    expect((await fetch(`${base}/api/game`, withCookie(s))).status).toBe(401);
  });

  it('the CLI logs in with the device flow, keeps its tokens 0600, and its token opens the API', async () => {
    op.user = { sub: 'u-lea', email: 'lea@example.org', emailVerified: true };
    const file = join(tmp, 'tokens.json');
    let told = '';
    await deviceLogin(base, { file, allowInsecure: true, tell: (url, code) => (told = `${url} ${code}`) });
    expect(told).toContain('WXYZ-1234');
    const { statSync } = await import('node:fs');
    // POSIX only: Windows has no mode bits.
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o077).toBe(0);
    const t = await accessToken(base, { file, allowInsecure: true });
    expect((await fetch(`${base}/api/game`, { headers: { authorization: `Bearer ${t}` } })).status).toBe(200);
  }, 30_000);

  it('the CLI refuses to send its tokens to a server over plain http', async () => {
    await expect(accessToken('http://studio.example', { file: join(tmp, 'none.json') })).rejects.toThrow(/https/);
  });

  it('tells the CLI the issuer, its client and the audience', async () => {
    expect(await (await fetch(`${base}/auth/cli`)).json()).toEqual({
      issuer: op.issuer,
      client_id: 'web-scumm-cli',
      audience: op.audience,
    });
  });
});

describe('the session key', () => {
  it('is 32 characters or more, and a sealed value names its key without revealing it', () => {
    expect(() => new Sealer(['short'])).toThrow(/32 characters/);
    const k = 'a-session-key-of-at-least-32-characters';
    const sealed = new Sealer([k]).seal('refresh');
    expect(sealed.split('.')[0]).not.toBe(createHash('sha256').update(k).digest('hex').slice(0, 8));
    expect(new Sealer(['another-key-of-at-least-32-characters!', k]).open(sealed)).toBe('refresh');
  });
});

describe('the roles over every route', () => {
  it('reading needs a reviewer, writing a dev; the read-only POSTs are reads', () => {
    const studio = { gameDir: '' } as never;
    for (const [method, re] of routes(studio)) {
      const sub = re.source
        .replace(/^\^\\/, '/')
        .replace(/\\\//g, '/')
        .replace(/\(.*?\)/g, 'x')
        .replace(/\$$/, '');
      const role = roleFor(method, sub);
      const reads =
        method === 'GET' || /^\/(validate|report|puzzle|coverage|playtests|lint|solve|screenshot)$/.test(sub);
      expect([method, sub, role]).toEqual([method, sub, reads ? 'reviewer' : 'dev']);
    }
  });
});
