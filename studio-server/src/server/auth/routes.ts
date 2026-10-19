// The routes of authentication and membership (4.2.1, plan §3.1, §3.3, §3.4 policies C, D, E; §3.7).
//   GET  /auth/login?returnTo=&invite=   E: starts a login (a pre-authentication, used once, 10 min)
//   GET  /auth/callback                  C: the provider's answer; the session cookie is set
//   POST /auth/logout                    E: policy A; the session ends; the provider's logout URL is returned
//   POST /auth/backchannel               D: the provider ends sessions (form-urlencoded `logout_token`)
//   GET  /auth/me                        who the session is
//   GET  /auth/cli                       public: what the CLI needs for the device flow
//   /api/members…, /api/invitations, /api/audit: the owner's (policy A or B, role owner)
import type { IncomingMessage, ServerResponse } from 'node:http';
import { StudioError } from '../../ops/errors';
import { type Gate, PREAUTH_COOKIE, type Principal, SESSION_COOKIE, cookies } from './gate';
import type { Oidc } from './oidc';
import { type AuthStore, ROLES, type Role, type Sealer } from './store';

type Send = (res: ServerResponse, status: number, data: unknown, headers?: Record<string, string>) => void;

export interface AuthRoutesOptions {
  gate: Gate;
  store: AuthStore;
  oidc: Oidc;
  sealer: Sealer;
  publicUrl: string;
  cliClientId?: string;
  send: Send;
  readJson: (req: IncomingMessage) => Promise<unknown>;
}

const cookie = (name: string, value: string, maxAgeS: number) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeS}`;
const clear = (name: string) => `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/**
 * A path to come back to after a login: relative only, never another site (an open redirect). Only the characters of
 * a plain path and query pass: a tab or a backslash, which browsers drop or turn into `/`, never does.
 */
export function safeReturn(v: string | null): string {
  if (!v || !/^\/(?!\/)[A-Za-z0-9/._~%?&=#+,:@-]*$/.test(v)) return '/';
  return v;
}

function readForm(req: IncomingMessage, limit = 16_384): Promise<URLSearchParams> {
  return new Promise((ok, fail) => {
    let s = '';
    req.on('data', (c: Buffer) => {
      s += c.toString('utf8');
      if (s.length > limit) fail(new StudioError('body too large', 413));
    });
    req.on('end', () => ok(new URLSearchParams(s)));
    req.on('error', fail);
  });
}

export function authRoutes(o: AuthRoutesOptions) {
  const redirectUri = `${o.publicUrl}/auth/callback`;

  async function owner(req: IncomingMessage): Promise<Principal> {
    const p = await o.gate.authenticate(req);
    o.gate.require(p, 'owner');
    return p;
  }

  /** Handles `path` when it is one of these routes; false otherwise. */
  return async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const path = url.pathname;
    const m = req.method;

    if (m === 'GET' && path === '/auth/login') {
      const b = await o.oidc.begin(redirectUri);
      const invite = url.searchParams.get('invite') ?? undefined;
      const pre = await o.store.savePreauth({
        state: b.state,
        nonce: b.nonce,
        verifier: b.verifier,
        returnTo: safeReturn(url.searchParams.get('returnTo')),
        ...(invite && /^[\w-]{20,100}$/.test(invite) ? { invite } : {}),
      });
      res.writeHead(302, {
        location: b.url,
        'set-cookie': cookie(PREAUTH_COOKIE, pre, 600),
        'cache-control': 'no-store',
      });
      res.end();
      return true;
    }

    if (m === 'GET' && path === '/auth/callback') {
      const preToken = cookies(req)[PREAUTH_COOKIE];
      const pre = preToken ? await o.store.takePreauth(preToken) : undefined;
      if (!pre) {
        o.send(
          res,
          400,
          { error: 'this login has expired or was already used: start again' },
          { 'set-cookie': clear(PREAUTH_COOKIE) },
        );
        return true;
      }
      let done: Awaited<ReturnType<Oidc['finish']>>;
      try {
        done = await o.oidc.finish(new URL(`${redirectUri}${url.search}`), pre);
      } catch {
        await o.store.audit(null, 'login-failed', { reason: 'callback refused' });
        o.send(
          res,
          400,
          { error: 'the identity provider answer was refused' },
          { 'set-cookie': clear(PREAUTH_COOKIE) },
        );
        return true;
      }
      const user = await o.store.userFor(done.identity);
      if (pre.inviteHash) {
        const r = await o.store.accept(pre.inviteHash, user);
        if ('refused' in r) await o.store.audit(user.id, 'invitation-refused', { reason: r.refused });
      }
      // Without a refresh token the provider cannot be asked again: the session then lives R at most (plan §3.6).
      const absoluteMs = done.refreshToken ? o.gate.absoluteMs : Math.min(o.gate.absoluteMs, 15 * 60_000);
      const token = await o.store.createSession({
        user,
        sid: done.identity.sid ?? null,
        refreshEnc: done.refreshToken ? o.sealer.seal(done.refreshToken) : null,
        idTokenEnc: done.idToken ? o.sealer.seal(done.idToken) : null,
        absoluteMs,
      });
      await o.store.audit(user.id, 'login', {});
      res.writeHead(302, {
        location: pre.returnTo,
        'set-cookie': [cookie(SESSION_COOKIE, token, Math.floor(absoluteMs / 1000)), clear(PREAUTH_COOKIE)],
        'cache-control': 'no-store',
      });
      res.end();
      return true;
    }

    if (m === 'POST' && path === '/auth/logout') {
      const p = await o.gate.authenticate(req);
      const idToken = p.session?.idTokenEnc ? o.sealer.open(p.session.idTokenEnc) : undefined;
      if (p.session) {
        await o.store.endSession(p.session.idHash);
        // This session's long connections only: the user's other devices stay logged in.
        o.gate.revocations.emit('session-ended', [p.session.idHash]);
      }
      await o.store.audit(p.user.id, 'logout', {});
      o.send(
        res,
        200,
        {
          ok: true,
          redirect: o.oidc.endSessionUrl({ idTokenHint: idToken, postLogoutRedirectUri: o.publicUrl }) ?? '/',
        },
        { 'set-cookie': clear(SESSION_COOKIE) },
      );
      return true;
    }

    if (m === 'POST' && path === '/auth/backchannel') {
      const type = String(req.headers['content-type'] ?? '')
        .split(';')[0]!
        .trim();
      if (type !== 'application/x-www-form-urlencoded') throw new StudioError('a logout token is form-encoded', 400);
      const token = (await readForm(req)).get('logout_token');
      if (!token) throw new StudioError('logout_token is required', 400);
      let t: Awaited<ReturnType<Oidc['verifyLogoutToken']>>;
      try {
        t = await o.oidc.verifyLogoutToken(token);
      } catch {
        throw new StudioError('the logout token is not valid', 400);
      }
      if (!(await o.store.firstSeen(t.jti, t.exp))) throw new StudioError('the logout token was already used', 400);
      const users = await o.store.endProviderSessions({ iss: o.oidc.issuer, sid: t.sid, sub: t.sub });
      o.gate.revocations.emit('revoked', users);
      res.writeHead(200, { 'cache-control': 'no-store' });
      res.end();
      return true;
    }

    if (m === 'GET' && path === '/auth/me') {
      const p = await o.gate.authenticate(req);
      o.send(res, 200, { user: { id: p.user.id, email: p.user.email, name: p.user.name }, role: p.role ?? null });
      return true;
    }

    if (m === 'GET' && path === '/auth/cli') {
      o.send(res, 200, { issuer: o.oidc.issuer, client_id: o.cliClientId ?? null, audience: o.oidc.settings.audience });
      return true;
    }

    // ---------------------------------------------------------------- the owner's routes
    if (m === 'GET' && path === '/api/members') {
      await owner(req);
      o.send(res, 200, { members: await o.store.members(), invitations: await o.store.pendingInvitations() });
      return true;
    }
    if (m === 'POST' && path === '/api/invitations') {
      const p = await owner(req);
      const b = (await o.readJson(req)) as { email?: unknown; role?: unknown };
      if (typeof b.email !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(b.email))
        throw new StudioError('`email` is required');
      if (!ROLES.includes(b.role as Role)) throw new StudioError('`role` is owner, dev or reviewer');
      const token = await o.store.invite(b.email, b.role as Role, p.user.id);
      o.send(res, 200, { link: `${o.publicUrl}/auth/login?invite=${token}`, expiresInDays: 7 });
      return true;
    }
    const member = /^\/api\/members\/([\w-]{1,64})(\/sessions)?$/.exec(path);
    if (member) {
      const p = await owner(req);
      const id = member[1]!;
      try {
        if (m === 'PUT' && !member[2]) {
          const b = (await o.readJson(req)) as { role?: unknown };
          if (!ROLES.includes(b.role as Role)) throw new StudioError('`role` is owner, dev or reviewer');
          await o.store.setRole(id, b.role as Role, p.user.id);
          // A demotion is a revocation too (plan §3.6): long connections reopen with the new role.
          o.gate.revocations.emit('revoked', [id]);
        } else if (m === 'DELETE' && !member[2]) {
          await o.store.setRole(id, null, p.user.id);
          o.gate.revocations.emit('revoked', [id]);
        } else if (m === 'DELETE' && member[2]) {
          await o.store.endUserSessions(id, p.user.id);
          o.gate.revocations.emit('revoked', [id]);
        } else return false;
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status) throw new StudioError((e as Error).message, status);
        throw e;
      }
      o.send(res, 200, { ok: true });
      return true;
    }
    if (m === 'GET' && path === '/api/audit') {
      await owner(req);
      o.send(res, 200, { entries: await o.store.auditLog() });
      return true;
    }
    return false;
  };
}
