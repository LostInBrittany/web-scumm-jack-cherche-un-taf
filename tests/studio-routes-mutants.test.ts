// The routes of authentication and membership (4.2.1, studio-server/src/server/auth/routes.ts), pinned for the
// mutation set `studio-auth`: which requests each route takes (and leaves to others), the form's size limit, the
// invitation a login carries or not, what a callback stores (a session of R without a refresh token, the tokens it
// got and none it did not), logout with or without a session, the owner's routes' checks and dispatch, and errors.
// Driven directly, with fakes for the gate, the store and the provider.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { StudioError } from '../studio-server/src/ops/errors';
import { PREAUTH_COOKIE } from '../studio-server/src/server/auth/gate';
import { authRoutes } from '../studio-server/src/server/auth/routes';
import { Sealer } from '../studio-server/src/server/auth/store';

const PUBLIC = 'https://studio.example.fr';
const sealer = new Sealer(['a-session-key-of-at-least-32-characters']);
const user = {
  id: 'u1',
  iss: 'iss',
  sub: 'sub',
  email: 'lea@x.org',
  emailVerified: true,
  name: 'Léa',
  revokedBefore: 0,
};

function setup(
  o: {
    pre?: Record<string, unknown> | undefined;
    finish?: Record<string, unknown>;
    principal?: Record<string, unknown>;
    accept?: Record<string, unknown>;
    setRoleError?: Error;
    finishError?: Error;
  } = {},
) {
  const calls: Record<string, unknown[][]> = {};
  const rec =
    (k: string) =>
    (...a: unknown[]) => {
      (calls[k] ??= []).push(a);
    };
  const store = {
    savePreauth: async (...a: unknown[]) => (rec('savePreauth')(...a), 'pre-token'),
    takePreauth: async (...a: unknown[]) => (
      rec('takePreauth')(...a), 'pre' in o ? o.pre : { state: 's', nonce: 'n', verifier: 'v', returnTo: '/rooms' }
    ),
    userFor: async () => user,
    accept: async (...a: unknown[]) => (rec('accept')(...a), o.accept ?? { role: 'dev' }),
    audit: async (...a: unknown[]) => rec('audit')(...a),
    createSession: async (...a: unknown[]) => (rec('createSession')(...a), 'session-token'),
    endSession: async (...a: unknown[]) => rec('endSession')(...a),
    firstSeen: async () => true,
    endProviderSessions: async () => [],
    members: async () => [],
    pendingInvitations: async () => [],
    invite: async (...a: unknown[]) => (rec('invite')(...a), 'inv-token'),
    setRole: async (...a: unknown[]) => {
      rec('setRole')(...a);
      if (o.setRoleError) throw o.setRoleError;
    },
    endUserSessions: async (...a: unknown[]) => rec('endUserSessions')(...a),
    auditLog: async () => [],
  };
  const gate = {
    absoluteMs: 24 * 3_600_000,
    revocations: { emit: rec('emit') },
    authenticate: async () =>
      o.principal ?? { user, role: 'owner', via: 'cookie', session: { idHash: 'h1', idTokenEnc: null } },
    require: () => {},
  };
  const oidc = {
    begin: async () => ({ url: 'https://id.example/authorize', state: 's', nonce: 'n', verifier: 'v' }),
    finish: async () => {
      if (o.finishError) throw o.finishError;
      return o.finish ?? { identity: { iss: 'iss', sub: 'sub', sid: 'sid-1' }, refreshToken: 'rt', idToken: 'idt' };
    },
    issuer: 'https://id.example',
    settings: { audience: 'studio-api' },
    verifyLogoutToken: async () => {
      throw new Error('not valid');
    },
    endSessionUrl: (x: { idTokenHint?: string }) => (rec('endSessionUrl')(x), 'https://id.example/logout'),
  };
  const sent: { status: number; body: unknown; headers?: Record<string, unknown> }[] = [];
  const handle = authRoutes({
    gate: gate as never,
    store: store as never,
    oidc: oidc as never,
    sealer,
    publicUrl: PUBLIC,
    send: (_res, status, body, headers) => void sent.push({ status, body, headers }),
    readJson: async (req) => JSON.parse(((req as unknown as { body?: string }).body ?? '{}') || '{}'),
  });
  return { handle, calls, sent };
}

/** A request: a readable body (for the form), its method, headers and a JSON body for readJson. */
function request(method: string, headers: Record<string, string> = {}, body = '') {
  const r = Readable.from(body ? [Buffer.from(body)] : []) as unknown as IncomingMessage & { body: string };
  Object.assign(r, { method, headers, body });
  return r;
}
function response() {
  const out: { status?: number; headers?: Record<string, unknown>; ended: boolean } = { ended: false };
  const res = {
    writeHead: (s: number, h: Record<string, unknown>) => ((out.status = s), (out.headers = h)),
    end: () => void (out.ended = true),
  } as unknown as ServerResponse;
  return { res, out };
}
const call = async (
  s: ReturnType<typeof setup>,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body = '',
) => {
  const { res, out } = response();
  const handled = await s.handle(request(method, headers, body), res, new URL(path, PUBLIC));
  return { handled, out };
};

describe('which requests are these routes', () => {
  it('leaves other methods and other paths to the API', async () => {
    const s = setup();
    for (const [m, p] of [
      ['GET', '/api/invitations'],
      ['POST', '/api/audit'],
      ['PUT', '/api/members/u2/sessions'],
      ['GET', '/api/elsewhere'],
    ])
      expect((await call(s, m!, p!)).handled, `${m} ${p}`).toBe(false);
  });
});

describe('login and callback', () => {
  it('keeps an invitation that looks like one, and nothing else', async () => {
    const s = setup();
    await call(s, 'GET', `/auth/login?invite=${'a'.repeat(20)}`);
    await call(s, 'GET', '/auth/login?invite=short');
    await call(s, 'GET', '/auth/login');
    const saved = (s.calls.savePreauth ?? []).map((a) => (a[0] as { invite?: string }).invite);
    expect(saved).toEqual(['a'.repeat(20), undefined, undefined]);
  });

  it('without its pre-authentication cookie, refuses at once and asks the store nothing', async () => {
    const s = setup();
    const r = await call(s, 'GET', '/auth/callback?code=x&state=s');
    expect(r.handled).toBe(true);
    expect(s.sent[0]).toMatchObject({ status: 400 });
    expect(s.calls.takePreauth).toBeUndefined();
    const gone = setup({ pre: undefined });
    expect((await call(gone, 'GET', '/auth/callback?code=x', { cookie: `${PREAUTH_COOKIE}=p` })).handled).toBe(true);
    expect(gone.sent[0]).toMatchObject({ status: 400 });
  });

  it('accepts an invitation only when the login carried one, and audits a refusal only', async () => {
    const plain = setup();
    await call(plain, 'GET', '/auth/callback?code=x', { cookie: `${PREAUTH_COOKIE}=p` });
    expect(plain.calls.accept).toBeUndefined();
    const refused = setup({
      pre: { state: 's', nonce: 'n', verifier: 'v', returnTo: '/', inviteHash: 'h' },
      accept: { refused: 'no' },
    });
    await call(refused, 'GET', '/auth/callback?code=x', { cookie: `${PREAUTH_COOKIE}=p` });
    expect((refused.calls.audit ?? []).map((a) => a[1])).toContain('invitation-refused');
    const ok = setup({ pre: { state: 's', nonce: 'n', verifier: 'v', returnTo: '/', inviteHash: 'h' } });
    await call(ok, 'GET', '/auth/callback?code=x', { cookie: `${PREAUTH_COOKIE}=p` });
    expect(ok.calls.accept?.[0]?.[0]).toBe('h');
    expect((ok.calls.audit ?? []).map((a) => a[1])).not.toContain('invitation-refused');
  });

  it('stores the tokens it got and none it did not; without a refresh token the session lives R at most', async () => {
    const full = setup();
    await call(full, 'GET', '/auth/callback?code=x', { cookie: `${PREAUTH_COOKIE}=p` });
    const a = full.calls.createSession![0]![0] as {
      refreshEnc: string | null;
      idTokenEnc: string | null;
      absoluteMs: number;
      sid: string;
    };
    expect(sealer.open(a.refreshEnc!)).toBe('rt');
    expect(sealer.open(a.idTokenEnc!)).toBe('idt');
    expect(a).toMatchObject({ absoluteMs: 24 * 3_600_000, sid: 'sid-1' });
    const bare = setup({ finish: { identity: { iss: 'iss', sub: 'sub' } } });
    await call(bare, 'GET', '/auth/callback?code=x', { cookie: `${PREAUTH_COOKIE}=p` });
    expect(bare.calls.createSession![0]![0]).toMatchObject({
      refreshEnc: null,
      idTokenEnc: null,
      absoluteMs: 15 * 60_000,
      sid: null,
    });
  });
});

describe('a refused answer of the provider', () => {
  it('is answered (400) and audited, and the route says it handled it', async () => {
    const s = setup({ finishError: new Error('state mismatch') });
    const r = await call(s, 'GET', '/auth/callback?code=x', { cookie: `${PREAUTH_COOKIE}=p` });
    expect(r.handled).toBe(true);
    expect(s.sent[0]).toMatchObject({ status: 400 });
    expect((s.calls.audit ?? []).map((a) => a[1])).toContain('login-failed');
  });
});

describe('logout', () => {
  it('gives the provider the id_token it holds, or none; a Bearer has no session to end', async () => {
    const withToken = setup({
      principal: { user, role: 'dev', via: 'cookie', session: { idHash: 'h1', idTokenEnc: sealer.seal('idt') } },
    });
    await call(withToken, 'POST', '/auth/logout');
    expect(withToken.calls.endSessionUrl![0]![0]).toMatchObject({ idTokenHint: 'idt' });
    expect(withToken.calls.endSession![0]).toEqual(['h1']);
    expect(withToken.sent[0]!.body).toMatchObject({ ok: true });
    const noToken = setup();
    await call(noToken, 'POST', '/auth/logout');
    expect((noToken.calls.endSessionUrl![0]![0] as { idTokenHint?: string }).idTokenHint).toBeUndefined();
    const bearer = setup({ principal: { user, role: 'dev', via: 'bearer' } });
    await call(bearer, 'POST', '/auth/logout');
    expect(bearer.calls.endSession).toBeUndefined();
  });
});

describe('back-channel logout', () => {
  it('takes a form, of 16 KiB at most, with a logout_token', async () => {
    const s = setup();
    await expect(call(s, 'POST', '/auth/backchannel', { 'content-type': 'application/json' }, '{}')).rejects.toThrow(
      'a logout token is form-encoded',
    );
    await expect(
      call(s, 'POST', '/auth/backchannel', { 'content-type': 'application/x-www-form-urlencoded' }, 'other=1'),
    ).rejects.toThrow('logout_token is required');
    const atLimit = `logout_token=${'x'.repeat(16_384 - 'logout_token='.length)}`;
    await expect(
      call(s, 'POST', '/auth/backchannel', { 'content-type': 'application/x-www-form-urlencoded' }, atLimit),
    ).rejects.toThrow('the logout token is not valid');
    await expect(
      call(s, 'POST', '/auth/backchannel', { 'content-type': 'application/x-www-form-urlencoded' }, `${atLimit}x`),
    ).rejects.toMatchObject({ status: 413 });
  });
});

describe("the owner's routes", () => {
  it('an invitation needs a well-formed email and a known role', async () => {
    const s = setup();
    await expect(call(s, 'POST', '/api/invitations', {}, JSON.stringify({ email: 42, role: 'dev' }))).rejects.toThrow(
      '`email` is required',
    );
    await expect(
      call(s, 'POST', '/api/invitations', {}, JSON.stringify({ email: 'nope', role: 'dev' })),
    ).rejects.toThrow('`email` is required');
    await expect(
      call(s, 'POST', '/api/invitations', {}, JSON.stringify({ email: 'a@x.org', role: 'king' })),
    ).rejects.toThrow('`role` is');
    expect(
      (await call(s, 'POST', '/api/invitations', {}, JSON.stringify({ email: 'a@x.org', role: 'dev' }))).handled,
    ).toBe(true);
    expect(s.sent.at(-1)!.body).toMatchObject({ link: `${PUBLIC}/auth/login?invite=inv-token` });
  });

  it('dispatches a role change, a removal and a revocation of sessions, each to its own call', async () => {
    const s = setup();
    await expect(call(s, 'PUT', '/api/members/u2', {}, JSON.stringify({ role: 'king' }))).rejects.toThrow('`role` is');
    await call(s, 'PUT', '/api/members/u2', {}, JSON.stringify({ role: 'reviewer' }));
    await call(s, 'DELETE', '/api/members/u2');
    await call(s, 'DELETE', '/api/members/u2/sessions');
    expect(s.calls.setRole).toEqual([
      ['u2', 'reviewer', 'u1'],
      ['u2', null, 'u1'],
    ]);
    expect(s.calls.endUserSessions).toEqual([['u2', 'u1']]);
    expect(s.sent.at(-1)!.body).toEqual({ ok: true });
  });

  it("turns a store's refusal into its status, and lets any other error through as it is", async () => {
    const refused = setup({ setRoleError: Object.assign(new Error('the last owner stays an owner'), { status: 409 }) });
    await expect(call(refused, 'DELETE', '/api/members/u2')).rejects.toMatchObject({ status: 409 });
    const broken = setup({ setRoleError: new Error('disk on fire') });
    const e = await call(broken, 'DELETE', '/api/members/u2').catch((x) => x);
    expect(e).not.toBeInstanceOf(StudioError);
    expect(e.message).toBe('disk on fire');
  });

  it('reads the audit with GET', async () => {
    const s = setup();
    expect((await call(s, 'GET', '/api/audit')).handled).toBe(true);
    expect(s.sent.at(-1)!.body).toEqual({ entries: [] });
  });
});
