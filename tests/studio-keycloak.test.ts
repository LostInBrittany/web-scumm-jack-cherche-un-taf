// The Studio Server against a real Keycloak (4.2.1, plan §11), with the test realm of ops/studio/keycloak/: a login
// through Keycloak's own form, the identity it gives, an id_token refused as an access token, a refresh, a
// back-channel logout Keycloak sends and the server verifies, and a user disabled by an admin whose next refresh is
// refused for good. Runs when STUDIO_TEST_KEYCLOAK is set (Keycloak's base URL), as in CI (job studio-hosted);
// STUDIO_TEST_KEYCLOAK_ADMIN is `user:password` of its admin, STUDIO_TEST_KEYCLOAK_CALLBACK_HOST the name under which
// Keycloak reaches this machine (default host.docker.internal).
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DefinitiveRefusal, Oidc } from '../studio-server/src/server/auth/oidc';

const BASE = process.env.STUDIO_TEST_KEYCLOAK;
const [ADMIN, ADMIN_PASSWORD] = (process.env.STUDIO_TEST_KEYCLOAK_ADMIN ?? 'admin:admin-local-only').split(':');
const CALLBACK_HOST = process.env.STUDIO_TEST_KEYCLOAK_CALLBACK_HOST ?? 'host.docker.internal';
const realm = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'ops', 'studio', 'keycloak', 'realm.json'), 'utf8'),
);
const studio = realm.clients.find((c: { clientId: string }) => c.clientId === 'studio');
const REDIRECT = studio.redirectUris[0] as string;

/** Cookies kept between the requests of one browser. */
class Jar {
  private c = new Map<string, string>();
  take(r: Response) {
    for (const s of r.headers.getSetCookie()) {
      const [kv] = s.split(';');
      const i = kv!.indexOf('=');
      this.c.set(kv!.slice(0, i), kv!.slice(i + 1));
    }
  }
  get header() {
    return [...this.c].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

/** A login through Keycloak's own form: the URL it sends the browser back to. */
async function login(oidc: Oidc, user: string, password: string) {
  const b = await oidc.begin(REDIRECT);
  const jar = new Jar();
  const page = await fetch(b.url, { redirect: 'manual' });
  jar.take(page);
  const html = await page.text();
  const action = /<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/.exec(html)?.[1]?.replaceAll('&amp;', '&');
  if (!action) throw new Error('no login form');
  const r = await fetch(action, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: jar.header },
    body: new URLSearchParams({ username: user, password, credentialId: '' }),
  });
  const location = r.headers.get('location');
  if (r.status !== 302 || !location?.startsWith(REDIRECT)) throw new Error(`login refused (${r.status})`);
  return { url: new URL(location), checks: b };
}

async function admin(path: string, init: RequestInit = {}) {
  const t = await fetch(`${BASE}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: ADMIN!,
      password: ADMIN_PASSWORD!,
    }),
  });
  const { access_token } = (await t.json()) as { access_token: string };
  const r = await fetch(`${BASE}/admin/realms/web-scumm${path}`, {
    ...init,
    headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`admin ${path}: ${r.status}`);
  return r.status === 204 ? undefined : r.json();
}

describe.runIf(BASE)('against a real Keycloak', () => {
  let oidc: Oidc;
  let server: Server;
  const received: string[] = [];
  let restore: (() => Promise<unknown>) | undefined;
  beforeAll(async () => {
    oidc = await Oidc.discover({
      issuer: `${BASE}/realms/web-scumm`,
      clientId: 'studio',
      clientSecret: studio.secret,
      audience: 'studio-api',
      allowInsecure: true,
    });
    // Where Keycloak sends its back-channel logout: this test, listening for it.
    server = createServer(async (req, res) => {
      let body = '';
      for await (const c of req) body += c;
      const t = new URLSearchParams(body).get('logout_token');
      if (t) received.push(t);
      res.writeHead(200);
      res.end();
    });
    await new Promise<void>((ok) => server.listen(0, '0.0.0.0', ok));
    const port = (server.address() as AddressInfo).port;
    const [client] = (await admin('/clients?clientId=studio')) as { id: string; attributes: Record<string, string> }[];
    // Put back as it was afterwards: a long-lived Keycloak keeps no dead back-channel URL.
    restore = () => admin(`/clients/${client!.id}`, { method: 'PUT', body: JSON.stringify(client) });
    await admin(`/clients/${client!.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...client,
        attributes: {
          ...client!.attributes,
          'backchannel.logout.url': `http://${CALLBACK_HOST}:${port}/auth/backchannel`,
        },
      }),
    });
  }, 60_000);
  afterAll(async () => {
    server?.close();
    await restore?.();
  });

  it('logs in through its form; the identity is the verified user, with a sid, a refresh token and an id_token', async () => {
    const c = await login(oidc, 'lea', 'lea-local-only');
    const done = await oidc.finish(c.url, c.checks);
    expect(done.identity).toMatchObject({ email: 'lea@example.org', emailVerified: true, name: 'Léa Test' });
    expect(done.identity.sub).toMatch(/^[\w-]+$/);
    expect(done.identity.sid).toBeTruthy();
    expect(done.refreshToken).toBeTruthy();
    expect(done.idToken).toBeTruthy();
    // An id_token is no access token for the Studio: its audience is the client, not the Studio's API.
    await expect(oidc.verifyAccessToken(done.idToken!)).rejects.toThrow(/aud/);
    // The provider still knows the session: a refresh succeeds.
    await expect(oidc.refresh(done.refreshToken!)).resolves.toBeDefined();
  }, 60_000);

  it('sends a back-channel logout the server verifies: the session it names', async () => {
    const c = await login(oidc, 'lea', 'lea-local-only');
    const done = await oidc.finish(c.url, c.checks);
    received.length = 0;
    // This session only, ended by an admin: Keycloak tells the client of exactly this one.
    await admin(`/sessions/${done.identity.sid}`, { method: 'DELETE' });
    for (let i = 0; i < 100 && !received.length; i++) await new Promise((ok) => setTimeout(ok, 100));
    await new Promise((ok) => setTimeout(ok, 500));
    expect(received.length).toBeGreaterThan(0);
    // Every token verifies; one names this very session (the realm requires the sid) and its user.
    const tokens = await Promise.all(received.map((x) => oidc.verifyLogoutToken(x)));
    const mine = tokens.filter((t) => t.sid === done.identity.sid);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.sub).toBe(done.identity.sub);
  }, 60_000);

  it('a user disabled by an admin: the next refresh is refused for good', async () => {
    const c = await login(oidc, 'lea', 'lea-local-only');
    const done = await oidc.finish(c.url, c.checks);
    const [user] = (await admin('/users?username=lea')) as { id: string; enabled: boolean }[];
    await admin(`/users/${user!.id}`, { method: 'PUT', body: JSON.stringify({ ...user, enabled: false }) });
    try {
      const e = await oidc.refresh(done.refreshToken!).catch((x) => x);
      expect(e).toBeInstanceOf(DefinitiveRefusal);
    } finally {
      await admin(`/users/${user!.id}`, { method: 'PUT', body: JSON.stringify({ ...user, enabled: true }) });
    }
  }, 60_000);
});
