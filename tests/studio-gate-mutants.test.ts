// The gate of the Studio Server (4.2.1, studio-server/src/server/auth/gate.ts), pinned for the mutation set
// `studio-auth`: each refusal and its status, the boundaries of a session's life (absolute, idle, the 5-min check,
// R), what is written back (the idle clock once a minute and never for a stream's check, a rotated refresh token
// only when there is one, a suspension), and the role's refusal. Driven directly, with a fake store and provider.
import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { cookies, Gate, SESSION_COOKIE } from '../studio-server/src/server/auth/gate';
import { DefinitiveRefusal } from '../studio-server/src/server/auth/oidc';
import { Sealer, type Session, type User } from '../studio-server/src/server/auth/store';

const PUBLIC = 'https://studio.example.fr';
const MIN = 60_000;
const sealer = new Sealer(['a-session-key-of-at-least-32-characters']);
const user: User = {
  id: 'u1',
  iss: 'iss',
  sub: 'sub',
  email: 'lea@example.org',
  emailVerified: true,
  name: 'Léa',
  revokedBefore: 0,
};

function setup(
  o: {
    session?: Partial<Session>;
    refresh?: () => Promise<{ refreshToken?: string }>;
    role?: 'owner' | 'dev' | 'reviewer' | undefined;
    token?: { iat: number; exp: number };
    byIdentity?: User | undefined;
  } = {},
) {
  let now = 10_000_000;
  const calls: { touch: Record<string, unknown>[]; ended: string[]; refreshed: number } = {
    touch: [],
    ended: [],
    refreshed: 0,
  };
  const session: Session = {
    idHash: 'h1',
    user,
    role: 'dev',
    sid: null,
    createdAt: now - 10 * MIN,
    lastSeen: now - 30_000,
    expiresAt: now + 60 * MIN,
    refreshEnc: sealer.seal('rt-1'),
    idTokenEnc: null,
    checkedAt: now - MIN,
    suspended: false,
    ...o.session,
  };
  const store = {
    session: async (t: string) => (t === 'tok' ? { ...session } : undefined),
    endSession: async (h: string) => void calls.ended.push(h),
    touch: async (_h: string, f: Record<string, unknown>) => void calls.touch.push(f),
    userByIdentity: async () => ('byIdentity' in o ? o.byIdentity : user),
    role: async () => ('role' in o ? o.role : 'dev'),
  };
  const oidc = {
    verifyAccessToken: async (t: string) => {
      if (t !== 'a.b.c') throw new Error('bad');
      return { iss: 'iss', sub: 'sub', iat: o.token?.iat ?? 1_000, exp: o.token?.exp ?? 2_000 };
    },
    refresh: async () => {
      calls.refreshed++;
      return o.refresh ? o.refresh() : { refreshToken: 'rt-2' };
    },
  };
  const gate = new Gate({ store: store as never, oidc: oidc as never, sealer, publicUrl: PUBLIC, now: () => now });
  return { gate, calls, session, setNow: (t: number) => (now = t), now: () => now };
}

const req = (h: Record<string, string>, method = 'GET') => ({ method, headers: h }) as unknown as IncomingMessage;
const cookie = (extra: Record<string, string> = {}, method = 'GET') =>
  req({ cookie: `${SESSION_COOKIE}=tok`, ...extra }, method);
const status = (p: Promise<unknown>) =>
  p.then(
    () => 200,
    (e: { status?: number }) => e.status,
  );

describe('cookies', () => {
  it('skips a part without a value', () => {
    expect(cookies(req({ cookie: 'a=1; junk; b=x%20y' }))).toEqual({ a: '1', b: 'x y' });
  });
});

describe('policy B (Bearer)', () => {
  const bearer = (extra: Record<string, string> = {}, method = 'GET') =>
    req({ authorization: 'Bearer a.b.c', ...extra }, method);

  it('refuses a header that is no Bearer token, with its challenge', async () => {
    const { gate } = setup();
    const e = await gate.authenticate(req({ authorization: 'Basic abc' })).catch((x) => x);
    expect(e.status).toBe(401);
    expect(e.headers).toEqual({ 'www-authenticate': 'Bearer error="invalid_request"' });
  });

  it('takes a write as JSON, or as multipart only where uploads are allowed', async () => {
    const { gate } = setup();
    expect(await status(gate.authenticate(bearer({ 'content-type': 'application/json' }, 'POST')))).toBe(200);
    expect(await status(gate.authenticate(bearer({ 'content-type': 'text/plain' }, 'POST')))).toBe(415);
    expect(await status(gate.authenticate(bearer({ 'content-type': 'multipart/form-data; boundary=x' }, 'POST')))).toBe(
      415,
    );
    expect(
      await status(
        gate.authenticate(bearer({ 'content-type': 'multipart/form-data; boundary=x' }, 'POST'), { multipart: true }),
      ),
    ).toBe(200);
    expect(await status(gate.authenticate(bearer({ 'content-type': 'text/plain' }, 'POST'), { multipart: true }))).toBe(
      415,
    );
    expect(await status(gate.authenticate(bearer({}, 'GET')))).toBe(200);
  });

  it('refuses a stranger, a token issued before the revocation, a user with no role; one issued at it passes', async () => {
    expect(await status(setup({ byIdentity: undefined }).gate.authenticate(bearer()))).toBe(403);
    expect(await status(setup({ role: undefined }).gate.authenticate(bearer()))).toBe(403);
    const revoked = { ...user, revokedBefore: 1_000 };
    expect(
      await status(setup({ byIdentity: revoked, token: { iat: 999, exp: 2_000 } }).gate.authenticate(bearer())),
    ).toBe(401);
    const p = await setup({ byIdentity: revoked, token: { iat: 1_000, exp: 2_000 } }).gate.authenticate(bearer());
    expect(p).toMatchObject({ via: 'bearer', role: 'dev', expiresAt: 2_000 });
  });
});

describe('policy A (the session cookie)', () => {
  it('ends a session at its absolute end or its idle end, to the millisecond, each alone', async () => {
    for (const s of [{ expiresAt: 10_000_000 }, { lastSeen: 10_000_000 - 8 * 60 * MIN }]) {
      const { gate, calls } = setup({ session: s });
      expect(await status(gate.authenticate(cookie()))).toBe(401);
      expect(calls.ended).toEqual(['h1']);
    }
    const alive = setup({ session: { expiresAt: 10_000_001, lastSeen: 10_000_000 - 8 * 60 * MIN + 1 } });
    expect(await status(alive.gate.authenticate(cookie()))).toBe(200);
    expect(alive.calls.ended).toEqual([]);
  });

  it('moves the idle clock once a minute, from a minute on, never for a check of an open stream', async () => {
    const recent = setup({ session: { lastSeen: 10_000_000 - 30_000 } });
    await recent.gate.authenticate(cookie());
    expect(recent.calls.touch).toEqual([]);
    const minute = setup({ session: { lastSeen: 10_000_000 - MIN } });
    await minute.gate.authenticate(cookie());
    expect(minute.calls.touch).toEqual([{ lastSeen: 10_000_000 }]);
    const stream = setup({ session: { lastSeen: 10_000_000 - 5 * MIN } });
    await stream.gate.authenticate(cookie(), { checkOnly: true });
    expect(stream.calls.touch).toEqual([]);
  });

  it('asks the provider again from the fifth minute on, and only then', async () => {
    const early = setup({ session: { checkedAt: 10_000_000 - 5 * MIN + 1 } });
    await early.gate.authenticate(cookie());
    expect(early.calls.refreshed).toBe(0);
    const due = setup({ session: { checkedAt: 10_000_000 - 5 * MIN } });
    await due.gate.authenticate(cookie());
    expect(due.calls.refreshed).toBe(1);
    expect(due.calls.touch[0]).toMatchObject({ checkedAt: 10_000_000, suspended: false });
    expect(typeof due.calls.touch[0]!.refreshEnc).toBe('string');
  });

  it('keeps a session without a refresh token unchecked (it lives R at most), and stores no new token when none comes back', async () => {
    const none = setup({ session: { refreshEnc: null, checkedAt: 0 } });
    expect(await status(none.gate.authenticate(cookie()))).toBe(200);
    expect(none.calls.refreshed).toBe(0);
    expect(none.calls.ended).toEqual([]);
    const same = setup({ session: { checkedAt: 0 }, refresh: async () => ({}) });
    await same.gate.authenticate(cookie());
    expect(same.calls.touch[0]).toEqual({ checkedAt: 10_000_000, suspended: false });
  });

  it('a confirmed check lifts a suspension; a refusal ends the session', async () => {
    const s = setup({ session: { suspended: true, checkedAt: 10_000_000 - 20 * MIN } });
    const p = await s.gate.authenticate(cookie());
    expect(p.session!.suspended).toBe(false);
    const refused = setup({
      session: { checkedAt: 0 },
      refresh: async () => Promise.reject(new DefinitiveRefusal('invalid_grant')),
    });
    expect(await status(refused.gate.authenticate(cookie()))).toBe(401);
    expect(refused.calls.ended).toEqual(['h1']);
  });

  it('an unreachable provider: the session lives up to R exactly, then is suspended (503)', async () => {
    const down = () => Promise.reject(new Error('ECONNREFUSED'));
    const atR = setup({ session: { checkedAt: 10_000_000 - 15 * MIN }, refresh: down });
    expect(await status(atR.gate.authenticate(cookie()))).toBe(200);
    expect(atR.calls.touch.filter((t) => 'suspended' in t)).toEqual([]);
    const past = setup({ session: { checkedAt: 10_000_000 - 15 * MIN - 1 }, refresh: down });
    const e = await past.gate.authenticate(cookie()).catch((x) => x);
    expect(e.status).toBe(503);
    expect(e.body).toEqual({ suspended: true });
    expect(past.calls.touch).toContainEqual({ suspended: true });
  });
});

describe('roles', () => {
  it('says which role is missing, or that the user is no member', () => {
    const { gate } = setup();
    const p = { user, via: 'cookie' as const };
    expect(() => gate.require({ ...p, role: 'reviewer' }, 'dev')).toThrow('this needs the role dev');
    expect(() => gate.require({ ...p, role: undefined }, 'reviewer')).toThrow('not a member of this project');
    expect(() => gate.require({ ...p, role: 'owner' }, 'dev')).not.toThrow();
  });
});
