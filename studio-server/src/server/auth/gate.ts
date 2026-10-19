// Who a request is, and whether it may (4.2.1, plan §3.2–§3.6). On an API route the policy is chosen by the request
// alone: an `Authorization` header is policy B (a Bearer access token; cookies ignored, so no CSRF), none is policy A
// (the session cookie; a mutation needs `Origin` = the public URL, JSON, and `X-Studio-Request: 1`). Never two
// identities on one request. The callback (C), the back-channel logout (D), the login and the logout (E) have their
// own routes and rules in http.ts.
//
// Revocation, with R = 15 min (plan §3.6):
//   - a member removed or revoked in the Studio: refused at the next request (sessions deleted, `revoked_before`);
//   - a back-channel logout: the sessions it names are deleted at once;
//   - the provider no longer knowing the user: the session is checked every 5 min by its refresh token; a definitive
//     refusal ends it, a provider unreachable for longer than R suspends it (fail closed) until a check succeeds.
// The long connections (SSE, MCP streams) listen to `revocations` and close within 5 s.
import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { StudioError } from '../../ops/errors';
import { DefinitiveRefusal, type Oidc } from './oidc';
import { type AuthStore, atLeast, type Role, type Sealer, type Session, type User } from './store';

export const SESSION_COOKIE = '__Host-ws_session';
export const PREAUTH_COOKIE = '__Host-ws_pre';

export interface Principal {
  user: User;
  role: Role | undefined;
  via: 'cookie' | 'bearer';
  session?: Session;
  /** When the credential ends (a Bearer's `exp`): a long connection closes then, and reopens with a fresh one. */
  expiresAt?: number;
}

export interface GateOptions {
  store: AuthStore;
  oidc: Oidc;
  sealer: Sealer;
  /** The Studio's public origin: the only `Origin` a cookie mutation may carry. */
  publicUrl: string;
  idleMs?: number;
  absoluteMs?: number;
  checkEveryMs?: number;
  /** R: how long a session lives on without the provider confirming it (plan §3.6). */
  graceMs?: number;
  now?: () => number;
}

/** The cookies of a request, by name (a malformed `%` never throws). */
export function cookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

const MUTATION = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const TOUCH_EVERY_MS = 60_000;

export class Gate {
  /**
   * `revoked` (userIds: string[]): every long connection of those users closes; `session-ended` (idHashes: string[]):
   * the long connections of those sessions close.
   */
  readonly revocations = new EventEmitter();
  /** One refresh per session at a time: a provider that rotates refresh tokens must never see one used twice. */
  private refreshing = new Map<string, Promise<void>>();
  readonly idleMs: number;
  readonly absoluteMs: number;
  private checkEveryMs: number;
  private graceMs: number;
  private now: () => number;

  constructor(private o: GateOptions) {
    this.idleMs = o.idleMs ?? 8 * 3_600_000;
    this.absoluteMs = o.absoluteMs ?? 24 * 3_600_000;
    this.checkEveryMs = o.checkEveryMs ?? 5 * 60_000;
    this.graceMs = o.graceMs ?? 15 * 60_000;
    this.now = o.now ?? Date.now;
    this.revocations.setMaxListeners(0);
  }

  /** The principal of an API request, or a refusal (401, 403, 503 when the provider has been unreachable past R). */
  async authenticate(req: IncomingMessage, o: { multipart?: boolean; checkOnly?: boolean } = {}): Promise<Principal> {
    const auth = req.headers.authorization;
    const origin = req.headers.origin;
    const mutation = MUTATION.has(req.method ?? 'GET');
    const type = String(req.headers['content-type'] ?? '')
      .split(';')[0]!
      .trim()
      .toLowerCase();
    const typeOk = type === 'application/json' || (o.multipart === true && type === 'multipart/form-data');
    if (auth !== undefined) {
      // Policy B: the token is the identity; a cookie on the same request has no effect.
      const m = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/.exec(auth);
      if (!m) throw this.bearerRefused('invalid_request', 'a Bearer access token is expected');
      if (origin !== undefined && origin !== this.o.publicUrl) throw new StudioError('origin refused', 403);
      if (mutation && !typeOk) throw new StudioError('a write is sent as JSON', 415);
      let t: { iss: string; sub: string; iat: number; exp: number };
      try {
        t = await this.o.oidc.verifyAccessToken(m[1]!);
      } catch {
        throw this.bearerRefused('invalid_token', 'the access token is not valid');
      }
      const user = await this.o.store.userByIdentity(t.iss, t.sub);
      if (!user) throw new StudioError('not a member of this project', 403);
      if (t.iat < user.revokedBefore) throw this.bearerRefused('invalid_token', 'the access token was revoked');
      const role = await this.o.store.role(user.id);
      if (!role) throw new StudioError('not a member of this project', 403);
      return { user, role, via: 'bearer', expiresAt: t.exp };
    }
    // Policy A: the session cookie. A refused request is told nothing of which check failed (plan §3.4).
    if (mutation && (origin !== this.o.publicUrl || req.headers['x-studio-request'] !== '1' || !typeOk))
      throw new StudioError('forbidden', 403);
    const token = cookies(req)[SESSION_COOKIE];
    if (!token) throw this.unauthorized('no session');
    const s = await this.o.store.session(token);
    if (!s) throw this.unauthorized('no session');
    const now = this.now();
    if (s.expiresAt <= now || s.lastSeen + this.idleMs <= now) {
      await this.o.store.endSession(s.idHash);
      throw this.unauthorized('the session ended');
    }
    await this.check(s, now);
    // The idle clock moves once a minute, not one database write per request; never for a check of an open stream
    // (`checkOnly`), or an unattended tab would keep its session alive forever.
    if (!o.checkOnly && now - s.lastSeen >= TOUCH_EVERY_MS) await this.o.store.touch(s.idHash, { lastSeen: now });
    return { user: s.user, role: s.role, via: 'cookie', session: s, expiresAt: s.expiresAt };
  }

  /** The provider's confirmation of a session, every `checkEveryMs` (plan §3.6). */
  private async check(s: Session, now: number): Promise<void> {
    if (now - s.checkedAt < this.checkEveryMs && !s.suspended) return;
    // No refresh token (a provider that gives none): the session was created for R at most, its only bound.
    if (!s.refreshEnc) return;
    const refresh = this.o.sealer.open(s.refreshEnc);
    if (!refresh) {
      // Sealed but unreadable (its key left the ring, or the row is damaged): it can never be checked again, so it
      // ends now rather than living unchecked to its absolute lifetime (fail closed).
      await this.o.store.endSession(s.idHash);
      throw this.unauthorized('the session can no longer be checked: log in again');
    }
    // A refresh already in flight for this session is joined, never doubled; one that outlives the 5 s wait goes on
    // and stores the rotated token when it ends, so a slow provider never strands the new token.
    let flight = this.refreshing.get(s.idHash);
    if (!flight) {
      flight = (async () => {
        const r = await this.o.oidc.refresh(refresh);
        const at = this.now();
        await this.o.store.touch(s.idHash, {
          checkedAt: at,
          suspended: false,
          ...(r.refreshToken ? { refreshEnc: this.o.sealer.seal(r.refreshToken) } : {}),
        });
      })().finally(() => this.refreshing.delete(s.idHash));
      this.refreshing.set(s.idHash, flight);
      flight.catch(() => {});
    }
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        flight,
        new Promise<never>((_, fail) => {
          timer = setTimeout(() => fail(new Error('timeout')), 5_000);
        }),
      ]);
      s.checkedAt = now;
      s.suspended = false;
    } catch (e) {
      if (e instanceof DefinitiveRefusal) {
        await this.o.store.endSession(s.idHash);
        this.revocations.emit('session-ended', [s.idHash]);
        throw this.unauthorized('the identity provider ended the session');
      }
      // Unreachable: the session lives on until R since the last confirmation, then is suspended (fail closed).
      if (now - s.checkedAt > this.graceMs) {
        await this.o.store.touch(s.idHash, { suspended: true });
        throw Object.assign(new StudioError('the identity provider cannot be reached: the session is suspended', 503), {
          body: { suspended: true },
        });
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /** The role a principal needs: refused (403) below it. */
  require(p: Principal, need: Role): void {
    if (!atLeast(p.role, need))
      throw new StudioError(p.role ? `this needs the role ${need}` : 'not a member of this project', 403);
  }

  /** Policy B's refusal, with its RFC 6750 challenge. */
  private bearerRefused(error: 'invalid_request' | 'invalid_token', message: string): StudioError {
    return Object.assign(new StudioError(message, 401), {
      headers: { 'www-authenticate': `Bearer error="${error}"` },
    });
  }

  private unauthorized(message: string): StudioError {
    return Object.assign(new StudioError(message, 401), { body: { login: '/auth/login' } });
  }
}
