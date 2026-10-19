// Identities, members, invitations, sessions and the audit log of one Studio instance (4.2.1, plan §3.1–§3.7). The
// database never holds a usable secret: a session id and an invitation token are kept by their sha256, a refresh
// token encrypted with AES-256-GCM under the server's session key (a secret; several keys allow a rotation).
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, randomUUID } from 'node:crypto';
import type { SqlDb } from '../../../../bridge/src/store-sql';

export type Role = 'owner' | 'dev' | 'reviewer';
export const ROLES: readonly Role[] = ['owner', 'dev', 'reviewer'];
const RANK: Record<Role, number> = { reviewer: 1, dev: 2, owner: 3 };
/** Whether `role` is at least `need`. */
export const atLeast = (role: Role | undefined, need: Role) => !!role && RANK[role] >= RANK[need];

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
/** A random secret for a cookie or a link: 256 bits, URL-safe. */
const newToken = () => randomBytes(32).toString('base64url');

export interface User {
  id: string;
  iss: string;
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  revokedBefore: number;
}
export interface Session {
  idHash: string;
  user: User;
  role: Role | undefined;
  sid: string | null;
  createdAt: number;
  lastSeen: number;
  expiresAt: number;
  refreshEnc: string | null;
  idTokenEnc: string | null;
  checkedAt: number;
  suspended: boolean;
}

const derive = (secret: string, info: string, n: number) =>
  Buffer.from(hkdfSync('sha256', secret, 'web-scumm-studio', info, n));

/**
 * AES-256-GCM with a key ring: `keys[0]` encrypts, every key may decrypt (`<kid>.<iv>.<tag>.<data>`, base64url).
 * The key and its id are derived apart (HKDF), so a sealed value says nothing of the key; a secret is 32 characters
 * or more.
 */
export class Sealer {
  private keys: { kid: string; key: Buffer }[];
  constructor(secrets: string[]) {
    if (!secrets.length) throw new Error('a session key is required (STUDIO_SESSION_KEY)');
    if (secrets.some((s) => s.length < 32)) throw new Error('a session key is 32 characters or more');
    this.keys = secrets.map((s) => ({
      kid: derive(s, 'kid', 6).toString('base64url'),
      key: derive(s, 'aes-256-gcm', 32),
    }));
  }
  seal(text: string): string {
    const { kid, key } = this.keys[0]!;
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
    return [kid, iv, c.getAuthTag(), data].map((x) => (typeof x === 'string' ? x : x.toString('base64url'))).join('.');
  }
  open(sealed: string): string | undefined {
    const [kid, iv, tag, data] = sealed.split('.');
    const k = this.keys.find((x) => x.kid === kid);
    if (!k || !iv || !tag || data === undefined) return undefined;
    try {
      const d = createDecipheriv('aes-256-gcm', k.key, Buffer.from(iv, 'base64url'));
      d.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
    } catch {
      return undefined;
    }
  }
}

const toUser = (r: Record<string, unknown>): User => ({
  id: String(r.id),
  iss: String(r.iss),
  sub: String(r.sub),
  email: r.email === null || r.email === undefined ? null : String(r.email),
  emailVerified: Number(r.email_verified) === 1,
  name: r.name === null || r.name === undefined ? null : String(r.name),
  revokedBefore: Number(r.revoked_before),
});

export class AuthStore {
  /**
   * `now` is the Studio's clock (sessions, invitations, logins in progress). `revoked_before` keeps the wall clock:
   * it is compared with the `iat` of tokens the provider signs.
   */
  constructor(
    private db: SqlDb,
    private now: () => number = Date.now,
  ) {}

  // ---------------------------------------------------------------- users and members

  /** The user of an identity, created at first sight; its email and name follow the provider. */
  async userFor(o: {
    iss: string;
    sub: string;
    email?: string;
    emailVerified?: boolean;
    name?: string;
  }): Promise<User> {
    return this.db.tx('studio-auth', async (q) => {
      const [r] = await q.all('SELECT * FROM studio_users WHERE iss = $1 AND sub = $2', [o.iss, o.sub]);
      if (r) {
        await q.run('UPDATE studio_users SET email = $1, email_verified = $2, name = $3 WHERE id = $4', [
          o.email ?? null,
          o.emailVerified ? 1 : 0,
          o.name ?? null,
          r.id,
        ]);
        return toUser({ ...r, email: o.email ?? null, email_verified: o.emailVerified ? 1 : 0, name: o.name ?? null });
      }
      const id = randomUUID();
      await q.run(
        'INSERT INTO studio_users (id, iss, sub, email, email_verified, name, created_at, revoked_before) VALUES ($1, $2, $3, $4, $5, $6, $7, 0)',
        [id, o.iss, o.sub, o.email ?? null, o.emailVerified ? 1 : 0, o.name ?? null, this.now()],
      );
      return {
        id,
        iss: o.iss,
        sub: o.sub,
        email: o.email ?? null,
        emailVerified: !!o.emailVerified,
        name: o.name ?? null,
        revokedBefore: 0,
      };
    });
  }

  async userByIdentity(iss: string, sub: string): Promise<User | undefined> {
    const [r] = await this.db.all('SELECT * FROM studio_users WHERE iss = $1 AND sub = $2', [iss, sub]);
    return r ? toUser(r) : undefined;
  }

  async role(userId: string): Promise<Role | undefined> {
    const [r] = await this.db.all('SELECT role FROM studio_members WHERE user_id = $1', [userId]);
    return r ? (String(r.role) as Role) : undefined;
  }

  async members(): Promise<{ id: string; email: string | null; name: string | null; role: Role; sessions: number }[]> {
    const rows = await this.db.all(
      'SELECT u.id, u.email, u.name, m.role, (SELECT COUNT(*) FROM studio_sessions s WHERE s.user_id = u.id AND s.expires_at > $1) AS sessions FROM studio_members m JOIN studio_users u ON u.id = m.user_id ORDER BY u.email',
      [this.now()],
    );
    return rows.map((r) => ({
      id: String(r.id),
      email: r.email === null ? null : String(r.email),
      name: r.name === null ? null : String(r.name),
      role: String(r.role) as Role,
      sessions: Number(r.sessions),
    }));
  }

  /** Sets a member's role, or removes the member (`null`); the last owner can be neither demoted nor removed. */
  async setRole(userId: string, role: Role | null, actor: string): Promise<void> {
    await this.db.tx('studio-auth', async (q) => {
      const [cur] = await q.all('SELECT role FROM studio_members WHERE user_id = $1', [userId]);
      if (!cur) throw Object.assign(new Error('no such member'), { status: 404 });
      if (String(cur.role) === 'owner' && role !== 'owner') {
        const [n] = await q.all("SELECT COUNT(*) AS n FROM studio_members WHERE role = 'owner'");
        if (Number(n?.n) <= 1) throw Object.assign(new Error('the last owner stays an owner'), { status: 409 });
      }
      if (role === null) {
        await q.run('DELETE FROM studio_members WHERE user_id = $1', [userId]);
        // Removed: every session ends, every token issued before now is refused.
        await q.run('DELETE FROM studio_sessions WHERE user_id = $1', [userId]);
        await q.run('UPDATE studio_users SET revoked_before = $1 WHERE id = $2', [Date.now(), userId]);
      } else await q.run('UPDATE studio_members SET role = $1 WHERE user_id = $2', [role, userId]);
      await this.auditIn(q, actor, role === null ? 'member-removed' : 'member-role', { userId, role });
    });
  }

  // ---------------------------------------------------------------- invitations

  /** A one-time invitation for `email` as `role`, valid 7 days; returns the token (shown once, stored hashed). */
  async invite(email: string, role: Role, actor: string, days = 7): Promise<string> {
    const token = newToken();
    await this.db.tx('studio-auth', async (q) => {
      await q.run(
        'INSERT INTO studio_invitations (token_hash, email, role, created_by, expires_at, used_by) VALUES ($1, $2, $3, $4, $5, NULL)',
        [hashToken(token), email.toLowerCase(), role, actor, this.now() + days * 86_400_000],
      );
      await this.auditIn(q, actor, 'invited', { email: email.toLowerCase(), role });
    });
    return token;
  }

  /**
   * Consumes an invitation for `user`: only once, before it expires, and only when the user's email is verified by
   * the provider and is the one invited. Returns the role given, or a reason.
   */
  async accept(tokenHash: string, user: User): Promise<{ role: Role } | { refused: string }> {
    return this.db.tx('studio-auth', async (q) => {
      const [r] = await q.all('SELECT * FROM studio_invitations WHERE token_hash = $1', [tokenHash]);
      if (!r || r.used_by !== null || Number(r.expires_at) < this.now())
        return { refused: 'the invitation is not valid' };
      if (!user.emailVerified || (user.email ?? '').toLowerCase() !== String(r.email))
        return { refused: 'the invitation is for another verified email' };
      const role = String(r.role) as Role;
      const [cur] = await q.all('SELECT role FROM studio_members WHERE user_id = $1', [user.id]);
      if (cur && String(cur.role) === 'owner' && role !== 'owner') {
        const [n] = await q.all("SELECT COUNT(*) AS n FROM studio_members WHERE role = 'owner'");
        if (Number(n?.n) <= 1) return { refused: 'the last owner stays an owner' };
      }
      await q.run('UPDATE studio_invitations SET used_by = $1 WHERE token_hash = $2', [user.id, tokenHash]);
      await q.run('DELETE FROM studio_members WHERE user_id = $1', [user.id]);
      await q.run('INSERT INTO studio_members (user_id, role, added_at) VALUES ($1, $2, $3)', [
        user.id,
        role,
        this.now(),
      ]);
      await this.auditIn(q, user.id, 'invitation-accepted', { role });
      return { role };
    });
  }

  async pendingInvitations(): Promise<{ email: string; role: Role; expiresAt: number }[]> {
    return (
      await this.db.all(
        'SELECT email, role, expires_at FROM studio_invitations WHERE used_by IS NULL AND expires_at > $1',
        [this.now()],
      )
    ).map((r) => ({ email: String(r.email), role: String(r.role) as Role, expiresAt: Number(r.expires_at) }));
  }

  // ---------------------------------------------------------------- sessions

  async createSession(o: {
    user: User;
    sid: string | null;
    refreshEnc: string | null;
    idTokenEnc: string | null;
    absoluteMs: number;
  }): Promise<string> {
    const token = newToken();
    const now = this.now();
    await this.db.run(
      'INSERT INTO studio_sessions (id_hash, user_id, sid, created_at, last_seen, expires_at, refresh_enc, id_token_enc, checked_at, suspended) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $4, 0)',
      [hashToken(token), o.user.id, o.sid, now, now + o.absoluteMs, o.refreshEnc, o.idTokenEnc],
    );
    return token;
  }

  async session(token: string): Promise<Session | undefined> {
    return this.sessionByHash(hashToken(token));
  }

  /** A session by the hash of its id (what a game session keeps of the Studio session it depends on). */
  async sessionByHash(idHash: string): Promise<Session | undefined> {
    const [r] = await this.db.all(
      'SELECT s.*, u.id AS uid, u.iss, u.sub, u.email, u.email_verified, u.name, u.revoked_before, m.role FROM studio_sessions s JOIN studio_users u ON u.id = s.user_id LEFT JOIN studio_members m ON m.user_id = u.id WHERE s.id_hash = $1',
      [idHash],
    );
    if (!r) return undefined;
    return {
      idHash: String(r.id_hash),
      user: toUser({ ...r, id: r.uid }),
      role: r.role === null || r.role === undefined ? undefined : (String(r.role) as Role),
      sid: r.sid === null ? null : String(r.sid),
      createdAt: Number(r.created_at),
      lastSeen: Number(r.last_seen),
      expiresAt: Number(r.expires_at),
      refreshEnc: r.refresh_enc === null ? null : String(r.refresh_enc),
      idTokenEnc: r.id_token_enc === null || r.id_token_enc === undefined ? null : String(r.id_token_enc),
      checkedAt: Number(r.checked_at),
      suspended: Number(r.suspended) === 1,
    };
  }

  async touch(idHash: string, o: { lastSeen?: number; checkedAt?: number; suspended?: boolean; refreshEnc?: string }) {
    const sets: string[] = [];
    const args: unknown[] = [];
    const add = (col: string, v: unknown) => {
      args.push(v);
      sets.push(`${col} = $${args.length}`);
    };
    if (o.lastSeen !== undefined) add('last_seen', o.lastSeen);
    if (o.checkedAt !== undefined) add('checked_at', o.checkedAt);
    if (o.suspended !== undefined) add('suspended', o.suspended ? 1 : 0);
    if (o.refreshEnc !== undefined) add('refresh_enc', o.refreshEnc);
    if (!sets.length) return;
    args.push(idHash);
    await this.db.run(`UPDATE studio_sessions SET ${sets.join(', ')} WHERE id_hash = $${args.length}`, args);
  }

  async endSession(idHash: string): Promise<void> {
    await this.db.run('DELETE FROM studio_sessions WHERE id_hash = $1', [idHash]);
  }

  /**
   * Back-channel logout (OpenID Connect Back-Channel Logout 1.0, §2.4): with a `sid`, that provider session's
   * sessions only; with a `sub` alone, every session of the user, and every token issued before now refused.
   */
  async endProviderSessions(o: { iss: string; sid?: string; sub?: string }): Promise<string[]> {
    return this.db.tx('studio-auth', async (q) => {
      const users =
        o.sub && !o.sid
          ? (await q.all('SELECT id FROM studio_users WHERE iss = $1 AND sub = $2', [o.iss, o.sub])).map((r) =>
              String(r.id),
            )
          : [];
      const ended: string[] = [];
      if (o.sid) {
        for (const r of await q.all('SELECT id_hash, user_id FROM studio_sessions WHERE sid = $1', [o.sid]))
          ended.push(String(r.user_id));
        await q.run('DELETE FROM studio_sessions WHERE sid = $1', [o.sid]);
      }
      for (const u of users) {
        await q.run('DELETE FROM studio_sessions WHERE user_id = $1', [u]);
        await q.run('UPDATE studio_users SET revoked_before = $1 WHERE id = $2', [Date.now(), u]);
        ended.push(u);
      }
      await this.auditIn(q, null, 'backchannel-logout', {
        sid: o.sid ?? null,
        sub: o.sub ?? null,
        users: ended.length,
      });
      return ended;
    });
  }

  /** Every session of a user ends (an owner's revocation, a removal). */
  async endUserSessions(userId: string, actor: string): Promise<void> {
    await this.db.tx('studio-auth', async (q) => {
      await q.run('DELETE FROM studio_sessions WHERE user_id = $1', [userId]);
      await q.run('UPDATE studio_users SET revoked_before = $1 WHERE id = $2', [Date.now(), userId]);
      await this.auditIn(q, actor, 'sessions-revoked', { userId });
    });
  }

  // ---------------------------------------------------------------- logins in progress, replays

  async savePreauth(o: {
    state: string;
    nonce: string;
    verifier: string;
    returnTo: string;
    /** The invitation's token: only its hash is kept. */
    invite?: string;
  }): Promise<string> {
    const token = newToken();
    await this.db.run(
      'INSERT INTO studio_preauth (id_hash, state, nonce, verifier, return_to, invite, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [
        hashToken(token),
        o.state,
        o.nonce,
        o.verifier,
        o.returnTo,
        o.invite ? hashToken(o.invite) : null,
        this.now() + 10 * 60_000,
      ],
    );
    await this.db.run('DELETE FROM studio_preauth WHERE expires_at < $1', [this.now()]);
    return token;
  }

  /** Takes (and deletes) a login in progress: used once. */
  async takePreauth(
    token: string,
  ): Promise<{ state: string; nonce: string; verifier: string; returnTo: string; inviteHash?: string } | undefined> {
    return this.db.tx('studio-auth', async (q) => {
      const [r] = await q.all('SELECT * FROM studio_preauth WHERE id_hash = $1', [hashToken(token)]);
      await q.run('DELETE FROM studio_preauth WHERE id_hash = $1', [hashToken(token)]);
      if (!r || Number(r.expires_at) < this.now()) return undefined;
      return {
        state: String(r.state),
        nonce: String(r.nonce),
        verifier: String(r.verifier),
        returnTo: String(r.return_to),
        ...(r.invite ? { inviteHash: String(r.invite) } : {}),
      };
    });
  }

  /** Records a logout token's `jti`; false when it was already seen (a replay). */
  async firstSeen(jti: string, expiresAt: number): Promise<boolean> {
    return this.db.tx('studio-auth', async (q) => {
      await q.run('DELETE FROM studio_seen_jti WHERE expires_at < $1', [this.now()]);
      const [r] = await q.all('SELECT jti FROM studio_seen_jti WHERE jti = $1', [jti]);
      if (r) return false;
      await q.run('INSERT INTO studio_seen_jti (jti, expires_at) VALUES ($1, $2)', [jti, expiresAt]);
      return true;
    });
  }

  // ---------------------------------------------------------------- audit

  private async auditIn(
    q: { run(sql: string, p?: unknown[]): Promise<number> },
    actor: string | null,
    event: string,
    detail: unknown,
  ) {
    await q.run('INSERT INTO studio_audit (id, at, actor, event, detail) VALUES ($1, $2, $3, $4, $5)', [
      randomUUID(),
      this.now(),
      actor,
      event,
      JSON.stringify(detail),
    ]);
  }
  audit(actor: string | null, event: string, detail: unknown): Promise<void> {
    return this.auditIn(this.db, actor, event, detail);
  }
  async auditLog(limit = 200): Promise<{ at: number; actor: string | null; event: string; detail: unknown }[]> {
    return (
      await this.db.all('SELECT at, actor, event, detail FROM studio_audit ORDER BY at DESC LIMIT $1', [limit])
    ).map((r) => ({
      at: Number(r.at),
      actor: r.actor === null ? null : String(r.actor),
      event: String(r.event),
      detail: JSON.parse(String(r.detail)),
    }));
  }
}
