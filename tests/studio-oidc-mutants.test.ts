// The Studio Server as an OpenID Relying Party (4.2.1, studio-server/src/server/auth/oidc.ts), pinned for the
// mutation set `studio-auth`: the token lifetime's bounds, http refused unless allowed, a provider without JWKS or an
// end-session endpoint, a callback without an id_token, claims that are not strings, which refusals of a refresh are
// definitive, what an access token may not be, and every rule of a logout token. Against the test provider.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DefinitiveRefusal, Oidc } from '../studio-server/src/server/auth/oidc';
import { TestOp } from './fixtures/oidc-op';

let op: TestOp;
beforeAll(async () => {
  op = await new TestOp().start();
});
afterAll(() => op.stop());

const settings = (extra: Record<string, unknown> = {}) => ({
  issuer: op.issuer,
  clientId: op.clientId,
  clientSecret: op.clientSecret,
  audience: op.audience,
  allowInsecure: true,
  ...extra,
});
const REDIRECT = 'https://studio.example.fr/auth/callback';

/** A full authorization through the test provider: what the callback receives. */
async function callback(oidc: Oidc) {
  const b = await oidc.begin(REDIRECT);
  const r = await fetch(b.url, { redirect: 'manual' });
  return { url: new URL(r.headers.get('location')!), checks: b };
}

describe('discovery', () => {
  it('takes a token lifetime from 30 s to 900 s, none at all too', async () => {
    for (const bad of [29, 901])
      await expect(Oidc.discover(settings({ maxTokenSeconds: bad }))).rejects.toThrow(/between 30 and 900/);
    for (const ok of [30, 900, undefined])
      await expect(Oidc.discover(settings({ maxTokenSeconds: ok }))).resolves.toBeInstanceOf(Oidc);
  });

  it('refuses a provider over http unless told, and one that publishes no keys', async () => {
    await expect(Oidc.discover(settings({ allowInsecure: false }))).rejects.toThrow();
    op.noJwks = true;
    try {
      await expect(Oidc.discover(settings())).rejects.toThrow('the provider publishes no jwks_uri');
    } finally {
      op.noJwks = false;
    }
  });
});

describe('the callback', () => {
  it('requires an id_token, and keeps only string claims', async () => {
    const oidc = await Oidc.discover(settings());
    op.omitIdToken = true;
    try {
      const c = await callback(oidc);
      const e = await oidc.finish(c.url, c.checks).catch((x: Error) => x);
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).not.toBe('no id_token');
    } finally {
      op.omitIdToken = false;
    }
    const saved = { ...op.user };
    const sid = op.sid;
    Object.assign(op.user, { email: 42, name: 42 });
    op.sid = 7 as unknown as string;
    try {
      const c = await callback(oidc);
      const done = await oidc.finish(c.url, c.checks);
      expect(done.identity).toMatchObject({ email: undefined, name: undefined, sid: undefined, sub: saved.sub });
    } finally {
      op.user = saved;
      op.sid = sid;
    }
  });
});

describe('refresh', () => {
  it('a refusal of the grant (invalid_grant, 400, 401) is definitive; invalid_client and a 500 are not', async () => {
    const oidc = await Oidc.discover(settings());
    const cases: [number, Record<string, unknown>, boolean][] = [
      [400, { error: 'invalid_grant' }, true],
      [400, { error: 'invalid_request' }, true],
      [401, { error: 'unauthorized_client' }, true],
      [401, { error: 'invalid_client' }, false],
      [500, { error: 'server_error' }, false],
    ];
    try {
      for (const [status, body, definitive] of cases) {
        op.refreshAnswer = { status, body };
        const e = await oidc.refresh('rt').catch((x) => x);
        expect(e instanceof DefinitiveRefusal, `${status} ${JSON.stringify(body)}`).toBe(definitive);
      }
    } finally {
      op.refreshAnswer = undefined;
    }
  });
});

describe('logout URL', () => {
  it('carries the id_token hint only when there is one; none without an end-session endpoint', async () => {
    const oidc = await Oidc.discover(settings());
    const withHint = new URL(oidc.endSessionUrl({ idTokenHint: 'idt', postLogoutRedirectUri: 'https://s' })!);
    expect(withHint.searchParams.get('id_token_hint')).toBe('idt');
    const without = new URL(oidc.endSessionUrl({ postLogoutRedirectUri: 'https://s' })!);
    expect(without.searchParams.has('id_token_hint')).toBe(false);
    op.noEndSession = true;
    try {
      const bare = await Oidc.discover(settings());
      expect(bare.endSessionUrl({ postLogoutRedirectUri: 'https://s' })).toBeUndefined();
    } finally {
      op.noEndSession = false;
    }
  });
});

describe('access tokens', () => {
  it('refuses a nonce, or a typ of ID, each alone; takes a lifetime of exactly the maximum', async () => {
    const oidc = await Oidc.discover(settings());
    await expect(oidc.verifyAccessToken(await op.accessToken({ extra: { nonce: 'n' } }))).rejects.toThrow(
      /not an access token/,
    );
    await expect(oidc.verifyAccessToken(await op.accessToken({ extra: { typ: 'ID' } }))).rejects.toThrow(
      /not an access token/,
    );
    await expect(oidc.verifyAccessToken(await op.accessToken({ life: 300 }))).resolves.toMatchObject({
      sub: op.user.sub,
    });
    await expect(oidc.verifyAccessToken(await op.accessToken({ life: 301 }))).rejects.toThrow(/longer than allowed/);
    // jose checks exp against now, and iat only when asked: a token living 0 s from a future iat is ours to refuse.
    const later = Math.floor(Date.now() / 1000) + 60;
    const zero = await op.signRaw({ aud: op.audience, sub: op.user.sub, iat: later, exp: later });
    await expect(oidc.verifyAccessToken(zero)).rejects.toThrow(/lives 0 s/);
  });
});

describe('logout tokens', () => {
  const now = () => Math.floor(Date.now() / 1000);
  const event = { 'http://schemas.openid.net/event/backchannel-logout': {} };
  const token = (claims: Record<string, unknown>, typ?: string) =>
    op.signRaw({ aud: op.clientId, iat: now(), jti: `j-${Math.random()}`, events: event, ...claims }, typ);

  it('takes no typ, JWT or logout+jwt, and no other', async () => {
    const oidc = await Oidc.discover(settings());
    for (const typ of [undefined, 'JWT', 'logout+jwt'])
      await expect(oidc.verifyLogoutToken(await token({ sid: 's' }, typ)), String(typ)).resolves.toMatchObject({
        sid: 's',
      });
    await expect(oidc.verifyLogoutToken(await token({ sid: 's' }, 'at+jwt'))).rejects.toThrow('not a logout token');
  });

  it('needs the back-channel event, as an object', async () => {
    const oidc = await Oidc.discover(settings());
    for (const events of [
      undefined,
      // null is an object to `typeof`: indexed, it would throw a TypeError, not the refusal (4.4.0).
      null,
      'logout',
      {},
      { 'http://schemas.openid.net/event/backchannel-logout': [] },
      { 'http://schemas.openid.net/event/backchannel-logout': 'x' },
    ])
      await expect(oidc.verifyLogoutToken(await token({ sid: 's', events })), JSON.stringify(events)).rejects.toThrow(
        'not a back-channel logout token',
      );
  });

  it('names a sid or a sub as strings; without exp, it is good for 5 min from iat', async () => {
    const oidc = await Oidc.discover(settings());
    await expect(oidc.verifyLogoutToken(await token({ sub: 'u' }))).resolves.toMatchObject({
      sub: 'u',
      sid: undefined,
    });
    await expect(oidc.verifyLogoutToken(await token({ sid: 7, sub: 'u' }))).resolves.toMatchObject({
      sid: undefined,
      sub: 'u',
    });
    await expect(oidc.verifyLogoutToken(await token({ sid: 's', sub: 9 }))).resolves.toMatchObject({
      sid: 's',
      sub: undefined,
    });
    await expect(oidc.verifyLogoutToken(await token({ sub: 9 }))).rejects.toThrow(
      'a logout token names a sid or a sub',
    );
    await expect(oidc.verifyLogoutToken(await token({}))).rejects.toThrow('a logout token names a sid or a sub');
    const iat = now();
    const t = await oidc.verifyLogoutToken(await token({ sid: 's', iat }));
    expect(t.exp).toBe((iat + 300) * 1000);
  });
});
