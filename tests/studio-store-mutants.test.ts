// The auth store of the Studio Server (4.2.1, studio-server/src/server/auth/store.ts), pinned for the mutation set
// `studio-auth`: the session key's rules, sealed values that do not open, users and their verified email, members and
// the last owner, invitations to the millisecond, sessions as read back (no role, no sid, no tokens), what `touch`
// writes, the back-channel logout by sid or by sub, logins in progress, and the audit. On a migrated SQLite database.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../bridge/src/migrations';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import type { SqlDb } from '../bridge/src/store-sql';
import { AuthStore, Sealer } from '../studio-server/src/server/auth/store';

let root: string, db: SqlDb, store: AuthStore, now: number;
const KEY = 'a-session-key-of-at-least-32-characters';
beforeEach(async () => {
  mkdirSync(join(process.cwd(), '.cache'), { recursive: true });
  root = mkdtempSync(join(process.cwd(), '.cache', 'store-mut-'));
  db = await openSqliteDb(join(root, 'j.sqlite'));
  await migrate(db, { dir: new URL('../studio-server/migrations/', import.meta.url) });
  now = 1_000_000;
  store = new AuthStore(db, () => now);
});
afterEach(async () => {
  await db.close();
  rmSync(root, { recursive: true, force: true });
});

describe('the session key', () => {
  it('is required, and 32 characters is enough', () => {
    expect(() => new Sealer([])).toThrow(/a session key is required/);
    expect(() => new Sealer(['x'.repeat(31)])).toThrow(/32 characters/);
    expect(() => new Sealer(['x'.repeat(32)])).not.toThrow();
  });

  it('a sealed value missing a part, or sealed by a key no longer in the ring, does not open', () => {
    const s = new Sealer([KEY]);
    const sealed = s.seal('secret');
    const [kid, iv, tag] = sealed.split('.');
    expect(s.open(sealed)).toBe('secret');
    expect(s.open(`${kid}.${iv}.${tag}`)).toBeUndefined();
    expect(s.open(`${kid}.${iv}`)).toBeUndefined();
    expect(s.open(`${kid}`)).toBeUndefined();
    expect(s.open(`other.${iv}.${tag}.x`)).toBeUndefined();
    expect(new Sealer(['another-key-of-at-least-32-characters']).open(sealed)).toBeUndefined();
  });
});

describe('users and members', () => {
  it('records whether the email is verified, keeps no email or name it was not given, and follows the provider', async () => {
    const a = await store.userFor({ iss: 'i', sub: 'a', email: 'a@x.org', emailVerified: true, name: 'A' });
    expect(a).toMatchObject({ emailVerified: true, email: 'a@x.org', name: 'A' });
    expect(await store.userByIdentity('i', 'a')).toMatchObject({ emailVerified: true });
    const b = await store.userFor({ iss: 'i', sub: 'b' });
    expect(b).toMatchObject({ emailVerified: false, email: null, name: null });
    expect(await store.userByIdentity('i', 'b')).toMatchObject({ emailVerified: false, email: null, name: null });
    // Seen again: what the provider says now.
    expect(await store.userFor({ iss: 'i', sub: 'a', emailVerified: false })).toMatchObject({
      id: a.id,
      emailVerified: false,
      email: null,
      name: null,
    });
    expect(await store.userByIdentity('i', 'a')).toMatchObject({ emailVerified: false, email: null, name: null });
    expect(await store.userFor({ iss: 'i', sub: 'b', email: 'b@x.org', emailVerified: true })).toMatchObject({
      emailVerified: true,
    });
    expect(await store.userByIdentity('i', 'b')).toMatchObject({ emailVerified: true, email: 'b@x.org' });
    expect(await store.userByIdentity('i', 'nobody')).toBeUndefined();
  });

  it('the last owner stays one; with two, one may step down; a role change is no removal', async () => {
    const a = await store.userFor({ iss: 'i', sub: 'a', email: 'a@x.org', emailVerified: true });
    const b = await store.userFor({ iss: 'i', sub: 'b' });
    const c = await store.userFor({ iss: 'i', sub: 'c', name: 'Cé' });
    await db.run("INSERT INTO studio_members (user_id, role, added_at) VALUES ($1, 'reviewer', 0)", [c.id]);
    expect(await store.accept(await hashOf(await store.invite('a@x.org', 'owner', 'test')), a)).toEqual({
      role: 'owner',
    });
    await expect(store.setRole('nobody', 'dev', 'a')).rejects.toMatchObject({ status: 404 });
    await expect(store.setRole(a.id, 'dev', 'a')).rejects.toMatchObject({ status: 409 });
    await db.run("INSERT INTO studio_members (user_id, role, added_at) VALUES ($1, 'owner', 0)", [b.id]);
    await store.setRole(a.id, 'dev', 'b');
    expect(await store.role(a.id)).toBe('dev');
    const members = await store.members();
    expect(members.find((m) => m.id === b.id)).toMatchObject({ email: null, name: null, role: 'owner' });
    expect(members.find((m) => m.id === c.id)).toMatchObject({ name: 'Cé', role: 'reviewer' });
    await store.setRole(a.id, null, 'b');
    expect(await store.role(a.id)).toBeUndefined();
    const events = (await store.auditLog()).map((e) => e.event);
    expect(events).toContain('member-role');
    expect(events).toContain('member-removed');
  });
});

/** The hash the store keeps of an invitation token (what a login in progress carries). */
async function hashOf(token: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(token).digest('hex');
}

describe('invitations', () => {
  it('valid up to the millisecond it expires, once, for its verified email; never demoting the last owner', async () => {
    const lea = await store.userFor({ iss: 'i', sub: 'l', email: 'lea@x.org', emailVerified: true });
    const t = await store.invite('lea@x.org', 'dev', 'test', 1);
    now += 86_400_000;
    expect(await store.accept(await hashOf(t), lea)).toEqual({ role: 'dev' });
    expect(await store.accept(await hashOf(t), lea)).toEqual({ refused: 'the invitation is not valid' });
    expect(await store.accept('0'.repeat(64), lea)).toEqual({ refused: 'the invitation is not valid' });
    const late = await store.invite('lea@x.org', 'reviewer', 'test', 1);
    now += 86_400_001;
    expect(await store.accept(await hashOf(late), lea)).toEqual({ refused: 'the invitation is not valid' });
    // An owner among two may accept a lower role.
    const sam = await store.userFor({ iss: 'i', sub: 's', email: 'sam@x.org', emailVerified: true });
    await db.run("INSERT INTO studio_members (user_id, role, added_at) VALUES ($1, 'owner', 0)", [sam.id]);
    await db.run("UPDATE studio_members SET role = 'owner' WHERE user_id = $1", [lea.id]);
    expect(await store.accept(await hashOf(await store.invite('sam@x.org', 'reviewer', 'test')), sam)).toEqual({
      role: 'reviewer',
    });
  });
});

describe('sessions', () => {
  it('reads back no role for a non-member, its sid or none, its tokens or none', async () => {
    const u = await store.userFor({ iss: 'i', sub: 'a' });
    const bare = await store.sessionByHash(
      await hashOf(
        await store.createSession({ user: u, sid: null, refreshEnc: null, idTokenEnc: null, absoluteMs: 1_000 }),
      ),
    );
    expect(bare).toMatchObject({ role: undefined, sid: null, refreshEnc: null, idTokenEnc: null, suspended: false });
    const full = await store.session(
      await store.createSession({ user: u, sid: 'sid-1', refreshEnc: 'r', idTokenEnc: 't', absoluteMs: 1_000 }),
    );
    expect(full).toMatchObject({
      sid: 'sid-1',
      refreshEnc: 'r',
      idTokenEnc: 't',
      createdAt: now,
      lastSeen: now,
      expiresAt: now + 1_000,
    });
  });

  it('touch writes each field it is given and only those; given none, nothing', async () => {
    const u = await store.userFor({ iss: 'i', sub: 'a' });
    const h = await hashOf(
      await store.createSession({ user: u, sid: null, refreshEnc: 'r0', idTokenEnc: null, absoluteMs: 1_000 }),
    );
    await store.touch(h, {});
    await store.touch(h, { lastSeen: 5 });
    expect(await store.sessionByHash(h)).toMatchObject({
      lastSeen: 5,
      checkedAt: now,
      suspended: false,
      refreshEnc: 'r0',
    });
    await store.touch(h, { suspended: true });
    expect(await store.sessionByHash(h)).toMatchObject({ lastSeen: 5, suspended: true });
    // A touch that says nothing of the suspension leaves it.
    await store.touch(h, { lastSeen: 6 });
    expect(await store.sessionByHash(h)).toMatchObject({ lastSeen: 6, suspended: true });
    await store.touch(h, { suspended: false, checkedAt: 7, refreshEnc: 'r1' });
    expect(await store.sessionByHash(h)).toMatchObject({
      lastSeen: 6,
      suspended: false,
      checkedAt: 7,
      refreshEnc: 'r1',
    });
  });

  it('a back-channel logout by sid ends that session only; by sub alone, all of them and the tokens before now', async () => {
    const u = await store.userFor({ iss: 'i', sub: 'a' });
    const a = await store.createSession({
      user: u,
      sid: 'sid-a',
      refreshEnc: null,
      idTokenEnc: null,
      absoluteMs: 1_000,
    });
    const b = await store.createSession({
      user: u,
      sid: 'sid-b',
      refreshEnc: null,
      idTokenEnc: null,
      absoluteMs: 1_000,
    });
    expect(await store.endProviderSessions({ iss: 'i', sid: 'sid-a', sub: 'a' })).toEqual([u.id]);
    expect(await store.session(a)).toBeUndefined();
    expect(await store.session(b)).toBeDefined();
    expect((await store.userByIdentity('i', 'a'))!.revokedBefore).toBe(0);
    expect(await store.endProviderSessions({ iss: 'i', sub: 'a' })).toEqual([u.id]);
    expect(await store.session(b)).toBeUndefined();
    expect((await store.userByIdentity('i', 'a'))!.revokedBefore).toBeGreaterThan(0);
  });
});

describe('logins in progress and the audit', () => {
  it('a login in progress lives up to the millisecond, carries an invitation only when it had one', async () => {
    const t = await store.savePreauth({ state: 's', nonce: 'n', verifier: 'v', returnTo: '/' });
    now += 10 * 60_000;
    const p = await store.takePreauth(t);
    expect(p).toEqual({ state: 's', nonce: 'n', verifier: 'v', returnTo: '/' });
    const late = await store.savePreauth({ state: 's', nonce: 'n', verifier: 'v', returnTo: '/', invite: 'inv' });
    now += 10 * 60_000 + 1;
    expect(await store.takePreauth(late)).toBeUndefined();
  });

  it('the audit says who acted, or nobody', async () => {
    await store.audit(null, 'system', {});
    await store.audit('u1', 'someone', { x: 1 });
    const log = await store.auditLog();
    expect(log.find((e) => e.event === 'system')!.actor).toBeNull();
    expect(log.find((e) => e.event === 'someone')).toMatchObject({ actor: 'u1', detail: { x: 1 } });
  });
});
