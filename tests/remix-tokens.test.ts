// The Bridge's tokens as a player and a verifier check them (4.1.16, the remix mutation set): a day token, a Mystery
// commitment and its signed reveal are refused for each thing that can be wrong with them, one at a time, with real
// Ed25519 signatures: a token that is not a compact JWS, an unreadable header, another algorithm or key, a forged
// signature, a payload of another shape, the edges of the day's window, a malformed seed, another game, a reveal of
// another commitment (each field) or of another seed.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { b64url, importBridgeKey } from '@engine/reality/protocol';
import {
  type CommitToken,
  seedCommitment,
  verifyCommitment,
  verifyDayToken,
  verifyReveal,
} from '@engine/reality/daily';

const fixture = JSON.parse(readFileSync('tests/fixtures/reference-daily-key.json', 'utf8'));
const priv = () => crypto.subtle.importKey('jwk', fixture.jwk, { name: 'Ed25519' }, false, ['sign']);
const pub = () => importBridgeKey(fixture.kid, fixture.jwk.x);
const enc = (o: unknown) => b64url.encode(new TextEncoder().encode(typeof o === 'string' ? o : JSON.stringify(o)));
async function sign(payload: unknown, header: unknown = { alg: 'EdDSA', kid: fixture.kid }): Promise<string> {
  const h = enc(header);
  const p = enc(payload);
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'Ed25519' }, await priv(), new TextEncoder().encode(`${h}.${p}`)),
  );
  return `${h}.${p}.${b64url.encode(sig)}`;
}
const T = Date.parse('2026-10-08T00:00:00Z');
const DAY = {
  format: 'web-scumm-daily',
  v: 1,
  gameId: 'reference',
  date: '2026-10-08',
  seed: 'WS-0000-02DZ',
  mode: 'daily',
  rules: { category: 'daily', algorithmVersion: 1 },
  notBefore: T,
  notAfter: T + 86_400_000,
};
const refused = async (p: Promise<{ ok: boolean; reason?: string }>, reason: RegExp) => {
  const r = await p;
  expect(r.ok).toBe(false);
  expect((r as { reason: string }).reason).toMatch(reason);
};

describe('a day token', () => {
  it('verifies inside its window, its edges included, and offline without one (null)', async () => {
    const t = await sign(DAY);
    for (const now of [T, T + 86_400_000, null])
      expect((await verifyDayToken(t, await pub(), 'reference', now)).ok).toBe(true);
    await refused(verifyDayToken(t, await pub(), 'reference', T - 1), /not open now/);
    await refused(verifyDayToken(t, await pub(), 'reference', T + 86_400_001), /not open now/);
  });
  it('is refused when it is not a compact JWS, unreadable, of another algorithm or key, or forged', async () => {
    const k = await pub();
    const good = await sign(DAY);
    for (const bad of ['a.b', `${good}.x`, 'a.b!.c', 42 as unknown as string])
      await refused(verifyDayToken(bad, k, 'reference', T), /not a compact JWS/);
    await refused(verifyDayToken(`${enc('{')}.${enc(DAY)}.AA`, k, 'reference', T), /unreadable/);
    await refused(
      verifyDayToken(await sign(DAY, { alg: 'HS256', kid: fixture.kid }), k, 'reference', T),
      /algorithm or key/,
    );
    await refused(
      verifyDayToken(await sign(DAY, { alg: 'EdDSA', kid: 'other' }), k, 'reference', T),
      /algorithm or key/,
    );
    const [h] = good.split('.');
    const forged = `${h}.${enc({ ...DAY, seed: 'WS-0000-0000' })}.${good.split('.')[2]}`;
    await refused(verifyDayToken(forged, k, 'reference', T), /bad signature/);
  });
  it('is refused for another shape, another game, a malformed seed', async () => {
    const k = await pub();
    await refused(verifyDayToken(await sign({ ...DAY, v: 2 }), k, 'reference', T), /not a day token/);
    await refused(verifyDayToken(await sign(DAY), k, 'demo', T), /a day token of "reference"/);
    await refused(verifyDayToken(await sign({ ...DAY, seed: 'WS-0000-0008' }), k, 'reference', T), /check symbol/);
  });
});

describe('a Mystery commitment and its reveal', () => {
  const commitment = seedCommitment('WS-0000-02DZ', 'n0nce');
  const COMMIT = {
    format: 'web-scumm-commit',
    v: 1,
    id: 'c1',
    gameId: 'reference',
    mode: 'mystery',
    commitment,
    issuedAt: T,
  };
  const REVEAL = {
    format: 'web-scumm-reveal',
    v: 1,
    id: 'c1',
    gameId: 'reference',
    mode: 'mystery',
    commitment,
    seed: 'WS-0000-02DZ',
    nonce: 'n0nce',
    revealedAt: T + 1000,
  };
  it('a commitment is refused when forged, of another shape or another game', async () => {
    const k = await pub();
    expect((await verifyCommitment(await sign(COMMIT), k, 'reference')).ok).toBe(true);
    await refused(verifyCommitment('x.y', k, 'reference'), /compact JWS/);
    await refused(
      verifyCommitment(await sign({ ...COMMIT, commitment: 'nothex' }), k, 'reference'),
      /not a commitment/,
    );
    await refused(verifyCommitment(await sign(COMMIT), k, 'demo'), /a commitment of "reference"/);
  });
  it('a reveal verifies for its own commitment only, field by field, and for the seed it hid', async () => {
    const k = await pub();
    const c = (await verifyCommitment(await sign(COMMIT), k, 'reference')) as { ok: true; token: CommitToken };
    expect((await verifyReveal(await sign(REVEAL), k, c.token)).ok).toBe(true);
    await refused(verifyReveal('x.y', k, c.token), /compact JWS/);
    await refused(verifyReveal(await sign({ ...REVEAL, v: 9 }), k, c.token), /not a reveal/);
    for (const [field, value] of [
      ['gameId', 'demo'],
      ['id', 'c2'],
      ['commitment', 'f'.repeat(64)],
      ['mode', 'remix'],
    ] as const)
      await refused(verifyReveal(await sign({ ...REVEAL, [field]: value }), k, c.token), /another commitment/);
    await refused(verifyReveal(await sign({ ...REVEAL, nonce: 'other' }), k, c.token), /does not match the commitment/);
    // A seed that is not a seed hides nothing: refused, never taken for a match.
    await refused(
      verifyReveal(await sign({ ...REVEAL, seed: 'not a seed' }), k, c.token),
      /does not match the commitment/,
    );
  });
});

// Killed mutant (4.3.0 reread of the exemptions): a token whose header is not UTF-8 is unreadable. A byte that is not
// UTF-8 inside a JSON string would otherwise decode to U+FFFD, which JSON.parse takes: the refusal would name the key.
describe('a token that is not UTF-8', () => {
  it('is unreadable, not a token of another key', async () => {
    const h = Buffer.from([...new TextEncoder().encode(`{"alg":"EdDSA","kid":"${fixture.kid}`), 0xff, 0x22, 0x7d]);
    const r = await verifyDayToken(`${h.toString('base64url')}.e30.AAAA`, await pub(), 'reference', null);
    expect(r).toEqual({ ok: false, reason: 'unreadable token' });
  });
});
