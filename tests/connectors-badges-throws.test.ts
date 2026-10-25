// When node:crypto's `verify` throws, a badge's signature is refused (4.1.18, second reading of PR 2): the catch in
// verifyJws and verifyEddsaJcs answers `false`. No key tried makes OpenSSL throw today (tiny RSA moduli, other curves,
// odd lengths all return false), so this was named an equivalent; it is a test instead, since it is what stands
// between a crafted key and an accepted signature should a future OpenSSL throw.
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ n: 0 }));
vi.mock('node:crypto', async (original) => ({
  ...(await original<typeof import('node:crypto')>()),
  verify: () => {
    calls.n++;
    throw new Error('OpenSSL refused the key');
  },
}));
const { base58Encode: base58, verifyEddsaJcs, verifyJws } = await import('../connectors/src/badges/crypto');

describe('a signature whose verification throws', () => {
  it('is refused by verifyJws, whatever the algorithm', () => {
    const ed = generateKeyPairSync('ed25519').publicKey;
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey;
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey;
    const jws = (alg: string) => ({ header: { alg }, payload: {}, signingInput: 'a.b', signature: Buffer.alloc(64) });
    expect(verifyJws(jws('EdDSA'), ed)).toBe(false);
    expect(verifyJws(jws('ES256'), ec)).toBe(false);
    expect(verifyJws(jws('RS256'), rsa)).toBe(false);
    expect(calls.n).toBe(3);
  });

  it('is refused by verifyEddsaJcs', () => {
    const ed = generateKeyPairSync('ed25519').publicKey;
    const before = calls.n;
    // 64 bytes in base58btc: the length check passes, the verification is reached and throws.
    const proofValue = `z${base58(Buffer.alloc(64, 7))}`;
    expect(verifyEddsaJcs({ a: 1 }, { type: 'DataIntegrityProof', proofValue }, ed)).toBe(false);
    expect(calls.n).toBe(before + 1);
  });
});
