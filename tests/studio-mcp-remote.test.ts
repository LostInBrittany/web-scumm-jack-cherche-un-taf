// The remote MCP (4.2.3 PR 5, plan H4, ADR 0029): a Studio Server's `/mcp`, behind the same checks as its API. It says
// where its authorization is (RFC 9728); it takes an access token for this Studio's audience, never the session cookie;
// a member removed is refused at the next request; a tool that writes goes through the guard, the spans and the
// journal (a reviewer's write refused, another member's span a 423); a client of the MCP SDK uses it as any server.
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SqlDb } from '../bridge/src/store-sql';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { createStudio, importInChild, operationContext } from '../studio-server/src/ops/core';
import { Journal } from '../studio-server/src/ops/journal';
import { spansOf } from '../studio-server/src/ops/spans';
import { Gate } from '../studio-server/src/server/auth/gate';
import { Oidc } from '../studio-server/src/server/auth/oidc';
import { authRoutes } from '../studio-server/src/server/auth/routes';
import { AuthStore, Sealer } from '../studio-server/src/server/auth/store';
import { readJson, send, studioServer } from '../studio-server/src/server/http';
import { Leases } from '../studio-server/src/server/leases';
import { hostOf, mcpEndpoint } from '../studio-server/src/server/mcp';
import { ServiceLease } from '../studio-server/src/server/service-lease';
import { TestOp, type TestUser } from './fixtures/oidc-op';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, base: string, op: TestOp, store: AuthStore, stop: () => Promise<void>, db: SqlDb, leases: Leases;
let journal: Journal;
const ids: Record<string, string> = {};
const cookies: Record<string, string> = {};
const USERS: Record<string, TestUser> = {
  lea: { sub: 'u-lea', email: 'lea@example.org', emailVerified: true, name: 'Léa' },
  tom: { sub: 'u-tom', email: 'tom@example.org', emailVerified: true, name: 'Tom' },
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
async function login(who: string, invite: string): Promise<string> {
  op.user = USERS[who]!;
  op.sid = `sid-${who}-${Math.random()}`;
  const r1 = await fetch(`${base}/auth/login?${new URLSearchParams({ invite })}`, { redirect: 'manual' });
  const pre = cookieOf(r1, '__Host-ws_pre')!;
  const r2 = await fetch(r1.headers.get('location')!, { redirect: 'manual' });
  const r3 = await fetch(r2.headers.get('location')!, {
    redirect: 'manual',
    headers: { cookie: `__Host-ws_pre=${pre}` },
  });
  return cookieOf(r3, '__Host-ws_session')!;
}

/** An MCP client of this Studio, as `sub` (an access token minted by the test provider). */
async function client(sub: string, o: { aud?: string } = {}) {
  const token = await op.accessToken({ sub, life: 120, ...(o.aud ? { aud: o.aud } : {}) });
  const c = new Client({ name: 'test-agent', version: '1.0.0' });
  await c.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );
  return c;
}
const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0]?.text ?? '') as string;

beforeAll(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-mcp-'));
  op = await new TestOp().start();
  const game = join(tmp, 'game');
  cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
  db = await openSqliteDb(join(tmp, 'j.sqlite'));
  leases = new Leases(db, { ttlMs: 60_000 });
  journal = await Journal.open({
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
  const server = studioServer({
    studio,
    journal,
    db,
    lease,
    log: () => {},
    perMinute: 10_000,
    auth: { gate, handle },
    leases,
    mcp: mcpEndpoint({ gate, publicUrl: base, issuer: oidc.issuer, game: 'tpl', version: '0.0.0-test' }),
  });
  await new Promise<void>((ok) => server.listen(port, '127.0.0.1', ok));
  for (const [who, role] of [
    ['lea', 'owner'],
    ['tom', 'dev'],
    ['ana', 'reviewer'],
  ] as const) {
    cookies[who] = await login(who, await store.invite(USERS[who]!.email, role, 'test'));
    const me = (await (
      await fetch(`${base}/auth/me`, { headers: { cookie: `__Host-ws_session=${cookies[who]}` } })
    ).json()) as {
      user: { id: string };
    };
    ids[who] = me.user.id;
  }
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

describe("the remote MCP's loopback", () => {
  it('calls the server on the address its request came in on', () => {
    expect(hostOf('127.0.0.1')).toBe('127.0.0.1');
    expect(hostOf('::ffff:10.0.0.7')).toBe('10.0.0.7');
    expect(hostOf('::1')).toBe('[::1]');
    expect(hostOf('fe80::1')).toBe('[fe80::1]');
    expect(hostOf('0.0.0.0')).toBe('127.0.0.1');
    expect(hostOf('::')).toBe('[::1]');
    expect(hostOf(undefined)).toBe('127.0.0.1');
  });
});

describe('the remote MCP', () => {
  it('says where its authorization is (RFC 9728)', async () => {
    for (const p of ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource']) {
      const r = await fetch(`${base}${p}`);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({
        resource: `${base}/mcp`,
        authorization_servers: [op.issuer],
        bearer_methods_supported: ['header'],
        resource_name: 'web-scumm Studio (tpl)',
      });
    }
  });

  it('asks for a token, refuses one of another audience, the session cookie, a non-member, and a GET', async () => {
    const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };
    const post = (headers: Record<string, string>) =>
      fetch(`${base}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
        body: JSON.stringify(init),
      });
    const none = await post({});
    expect(none.status).toBe(401);
    expect(none.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`,
    );
    const other = await post({ authorization: `Bearer ${await op.accessToken({ sub: 'u-tom', aud: 'another-app' })}` });
    expect(other.status).toBe(401);
    expect(other.headers.get('www-authenticate')).toContain('error="invalid_token"');
    expect(other.headers.get('www-authenticate')).toContain('resource_metadata=');
    // The session cookie never opens the MCP: no page can ride it.
    expect((await post({ cookie: `__Host-ws_session=${cookies.tom}` })).status).toBe(401);
    const stranger = await post({ authorization: `Bearer ${await op.accessToken({ sub: 'u-nobody' })}` });
    expect(stranger.status).toBe(403);
    // A page of another site (DNS rebinding) is refused by its Origin; a header that is no token, a bad request.
    const tom = await op.accessToken({ sub: 'u-tom' });
    expect((await post({ authorization: `Bearer ${tom}`, origin: 'https://evil.example' })).status).toBe(403);
    const bad = await post({ authorization: 'Bearer not-a-token' });
    expect(bad.status).toBe(401);
    expect(bad.headers.get('www-authenticate')).toContain('error="invalid_request"');
    // One message per POST: a batch is refused before any tool runs.
    const batch = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tom}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify([init, init]),
    });
    expect(batch.status).toBe(400);
    const get = await fetch(`${base}/mcp`, {
      headers: { authorization: `Bearer ${await op.accessToken({ sub: 'u-tom' })}` },
    });
    expect(get.status).toBe(405);
  });

  it("runs the game's tools for a member: reads, and a write that goes through the journal as theirs", async () => {
    const c = await client('u-tom');
    const tools = (await c.listTools()).tools.map((t) => t.name);
    expect(tools).toEqual(expect.arrayContaining(['list_rooms', 'get_room', 'set_text', 'validate']));
    // What only a local Studio can do is not offered here.
    expect(tools).not.toContain('screenshot');
    expect(tools).not.toContain('run_tests');
    const rooms = JSON.parse(text(await c.callTool({ name: 'list_rooms', arguments: {} }))) as {
      rooms: { id: string }[];
    };
    const room = rooms.rooms[0]!.id;
    const before = await journal.revision();
    const r = await c.callTool({ name: 'add_note', arguments: { text: 'from an agent' } });
    expect(r.isError).toBeFalsy();
    expect(await journal.revision()).toBe(before + 1);
    const [o] = await db.all('SELECT author FROM studio_ops WHERE rev = $1', [before + 1]);
    expect(o!.author).toBe('tom@example.org');
    expect(text(await c.callTool({ name: 'get_room', arguments: { id: room } }))).toContain(room);
    await c.close();
    await fetch(`${base}/api/leases/release`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await op.accessToken({ sub: 'u-tom' })}`,
        'content-type': 'application/json',
      },
      body: '{}',
    });
  });

  it("refuses a reviewer's write, another member's span, and a member removed since", async () => {
    const ana = await client('u-ana');
    const w = await ana.callTool({ name: 'add_note', arguments: { text: 'a reviewer writes' } });
    expect(w.isError).toBe(true);
    expect(text(w)).toMatch(/403: this needs the role dev/);
    await ana.close();
    // Léa holds the notes; Tom's agent is refused, the span named.
    const lea = await client('u-lea');
    expect((await lea.callTool({ name: 'add_note', arguments: { text: 'mine' } })).isError).toBeFalsy();
    const tom = await client('u-tom');
    const held = await tom.callTool({ name: 'add_note', arguments: { text: 'over hers' } });
    expect(held.isError).toBe(true);
    expect(text(held)).toMatch(/423/);
    await lea.close();
    // Tom removed: his next request is refused (his tokens revoked with him), whatever the token still says.
    await store.setRole(ids.tom!, null, ids.lea!);
    await expect(tom.callTool({ name: 'list_rooms', arguments: {} })).rejects.toThrow(/revoked/);
    await tom.close().catch(() => undefined);
  });
});
