// The edges of the Open Badges connector's cryptography and network policy (connectors/src/badges/crypto.ts, fetch.ts),
// each test written for a mutant of the connectors set the other badge tests let live (tools/mutate.ts;
// docs/dev/MUTANTS.md): a signature read with the wrong algorithm or key type, a private key taken for a public one,
// a multikey of another codec, the exact bounds of size, depth and status, a redirect, SNI. Local servers, ports 0.
import { createHash, generateKeyPairSync, type KeyObject, sign } from 'node:crypto';
import { createServer as createHttpServer, type RequestListener } from 'node:http';
import {
  type AddressInfo,
  createServer as createTcpServer,
  getDefaultAutoSelectFamily,
  type Server,
  setDefaultAutoSelectFamily,
} from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import {
  base58Decode,
  base58Encode,
  jwkKey,
  multikey,
  parseJws,
  pemKey,
  verifyEddsaJcs,
  verifyJws,
} from '../connectors/src/badges/crypto';
import { isPublicAddress, jsonDepth, SafeFetcher } from '../connectors/src/badges/fetch';
import { canonicalJson } from '../connectors/src/sdk';

const servers: Server[] = [];
afterAll(async () => {
  for (const s of servers) await new Promise<void>((ok) => s.close(() => ok()));
});
async function listen(s: Server): Promise<number> {
  await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok));
  servers.push(s);
  return (s.address() as AddressInfo).port;
}
const serve = (h: RequestListener) => listen(createHttpServer(h) as unknown as Server);

const b64u = (x: unknown) => Buffer.from(JSON.stringify(x)).toString('base64url');
const ed = generateKeyPairSync('ed25519');
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
/** Each key type signs the way its own algorithm does; the header may claim another. */
const NATIVE = [
  ['EdDSA', ed, (d: Buffer) => sign(null, d, ed.privateKey)],
  ['ES256', ec, (d: Buffer) => sign('sha256', d, { key: ec.privateKey, dsaEncoding: 'ieee-p1363' })],
  ['RS256', rsa, (d: Buffer) => sign('sha256', d, rsa.privateKey)],
] as const;
const jwsWith = (alg: string, signer: (d: Buffer) => Buffer) => {
  const input = `${b64u({ alg })}.${b64u({ sub: 'robin' })}`;
  return `${input}.${signer(Buffer.from(input)).toString('base64url')}`;
};
const rawEd = (k: KeyObject) => k.export({ format: 'der', type: 'spki' }).subarray(12);

describe('the cryptographic pieces, at their edges', () => {
  it('base58: 512 characters decode, 513 do not', () => {
    expect(base58Decode('1'.repeat(512))).toEqual(new Uint8Array(512));
    expect(base58Decode('1'.repeat(513))).toBeNull();
  });

  it('a multikey is z + base58btc of 0xed 0x01 + 32 bytes, nothing else', () => {
    const raw = rawEd(ed.publicKey);
    const mb = (prefix: number[]) => `z${base58Encode(new Uint8Array([...prefix, ...raw]))}`;
    expect(multikey(mb([0xed, 0x01]))?.asymmetricKeyType).toBe('ed25519');
    expect(multikey(`u${mb([0xed, 0x01]).slice(1)}`)).toBeNull();
    expect(multikey(mb([0xe7, 0x01]))).toBeNull();
    expect(multikey(mb([0xed, 0x02]))).toBeNull();
    expect(multikey('z0OIl')).toBeNull();
  });

  it('a JWK or a PEM is a public key, never a private one, and nothing else', () => {
    expect(jwkKey(ec.publicKey.export({ format: 'jwk' }))?.type).toBe('public');
    expect(jwkKey(ec.privateKey.export({ format: 'jwk' }))).toBeNull();
    expect(jwkKey(null)).toBeNull();
    const pem = ec.publicKey.export({ format: 'pem', type: 'spki' }).toString();
    expect(pemKey(pem.padEnd(8192, ' '))?.type).toBe('public');
    expect(pemKey(pem.padEnd(8193, ' '))).toBeNull();
    expect(pemKey(ec.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString())).toBeNull();
    expect(pemKey(42)).toBeNull();
  });

  it('a JWS whose header is not an object is no JWS', () => {
    expect(parseJws(`${b64u(42)}.${b64u({})}.AA`)).toBeNull();
    expect(parseJws(`${b64u({ alg: 'EdDSA' })}.${b64u({})}.AA`)).not.toBeNull();
  });

  it('a JWS verifies only when its header names the algorithm of the key that signed it', () => {
    for (const [native, pair, signer] of NATIVE)
      for (const alg of ['EdDSA', 'ES256', 'RS256', 'none', 'HS256'])
        expect(verifyJws(parseJws(jwsWith(alg, signer))!, pair.publicKey), `${native} key, ${alg}`).toBe(
          alg === native,
        );
  });

  /** A document signed as `eddsa-jcs-2022` says (the proof's configuration with the document's `@context`). */
  const signDi = (doc: Record<string, unknown>, proof: Record<string, unknown>, key: KeyObject = ed.privateKey) => {
    const config = doc['@context'] === undefined ? proof : { ...proof, '@context': doc['@context'] };
    const h = (v: unknown) => createHash('sha256').update(canonicalJson(v)).digest();
    return `z${base58Encode(sign(null, Buffer.concat([h(config), h(doc)]), key))}`;
  };
  const PROOF = { type: 'DataIntegrityProof', cryptosuite: 'eddsa-jcs-2022', proofPurpose: 'assertionMethod' };

  it('eddsa-jcs-2022: a z-prefixed 64-byte signature, an Ed25519 key, the proof’s own @context kept', () => {
    const doc = { '@context': ['https://www.w3.org/ns/credentials/v2'], name: 'Badge' };
    const proofValue = signDi(doc, PROOF);
    expect(verifyEddsaJcs(doc, { ...PROOF, proofValue }, ed.publicKey)).toBe(true);
    expect(verifyEddsaJcs(doc, { ...PROOF, proofValue: `u${proofValue.slice(1)}` }, ed.publicKey)).toBe(false);
    expect(verifyEddsaJcs(doc, { ...PROOF, proofValue: 42 }, ed.publicKey)).toBe(false);
    expect(verifyEddsaJcs(doc, { ...PROOF, proofValue: 'z0' }, ed.publicKey)).toBe(false);
    const x25519 = generateKeyPairSync('x25519').publicKey;
    expect(verifyEddsaJcs(doc, { ...PROOF, proofValue }, x25519)).toBe(false);
    // No @context on the document: the proof's own stays in its configuration.
    const bare = { name: 'Badge' };
    const withContext = { ...PROOF, '@context': ['https://www.w3.org/ns/credentials/v2'] };
    expect(verifyEddsaJcs(bare, { ...withContext, proofValue: signDi(bare, withContext) }, ed.publicKey)).toBe(true);
  });

  it('eddsa-jcs-2022 takes an Ed25519 key only: an RSA proof is refused, a 64-byte one of RSA-512 included (4.3.0)', () => {
    // The key comes from the issuer's document (a JWK may be RSA or EC), and `verify(null, …)` with an RSA key checks
    // an RSA-SHA256 signature: before 4.3.0 an RSA-512 key, whose signature is exactly 64 bytes, made a valid proof.
    const doc = { '@context': ['https://www.w3.org/ns/credentials/v2'], name: 'Badge' };
    for (const bits of [2048, 512]) {
      const rsa = generateKeyPairSync('rsa', { modulusLength: bits });
      const proofValue = signDi(doc, PROOF, rsa.privateKey);
      expect(base58Decode(proofValue.slice(1))).toHaveLength(bits / 8);
      expect(verifyEddsaJcs(doc, { ...PROOF, proofValue }, rsa.publicKey), `RSA-${bits}`).toBe(false);
    }
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    expect(verifyEddsaJcs(doc, { ...PROOF, proofValue: signDi(doc, PROOF, ec.privateKey) }, ec.publicKey)).toBe(false);
  });
});

describe('the network policy, at its edges', () => {
  it('refuses IPv4-mapped IPv6 in hex form, public or not; bounds depth at the limit plus one', () => {
    expect(isPublicAddress('::ffff:7f00:1')).toBe(false);
    expect(isPublicAddress('::ffff:5db8:d822')).toBe(false);
    const nest = (n: number): unknown => (n ? [nest(n - 1)] : 0);
    expect(jsonDepth(nest(20), 8)).toBe(9);
  });

  it('refuses a non-URL, a user or a password alone, an unresolved name', async () => {
    const f = new SafeFetcher({ hosts: ['local.test'], resolve: async () => ['93.184.216.34'], timeoutMs: 300 });
    expect(await f.get('not a url')).toMatchObject({ ok: false, reason: 'not a URL' });
    expect(await f.get('https://u@local.test/x')).toMatchObject({ ok: false, reason: 'credentials in a URL' });
    expect(await f.get('https://:p@local.test/x')).toMatchObject({ ok: false, reason: 'credentials in a URL' });
    const lost = new SafeFetcher({
      hosts: ['local.test'],
      resolve: async () => {
        throw new Error('NXDOMAIN');
      },
    });
    expect(await lost.get('https://local.test/x')).toMatchObject({ ok: false, reason: 'unresolved host' });
  });

  it('follows 300 to 399 with a Location only; refuses other statuses, a bad Location, a closed port, a cut body', async () => {
    const port = await serve((req, res) => {
      const u = req.url ?? '';
      if (u === '/ok') return res.writeHead(200).end('{"ok":1}');
      if (u === '/300') return res.writeHead(300, { Location: '/ok' }).end();
      if (u === '/300-bare') return res.writeHead(300).end('{}');
      if (u === '/400') return res.writeHead(400, { Location: '/ok' }).end('{}');
      if (u === '/404') return res.writeHead(404, { Location: '/ok' }).end('{}');
      if (u === '/bad') return res.writeHead(302, { Location: 'https://[::1' }).end();
      if (u === '/ten') return res.writeHead(200).end('0123456789');
      if (u === '/depth8') return res.writeHead(200).end('[[[[[[[[]]]]]]]]');
      if (u === '/cut') {
        res.writeHead(200, { 'Content-Length': '100' });
        res.write('{');
        return void setTimeout(() => res.socket?.destroy(), 20);
      }
    });
    const local = { allowHttp: true, allowAddresses: ['127.0.0.1'] };
    const f = new SafeFetcher({
      hosts: ['local.test'],
      resolve: async () => ['127.0.0.1'],
      testing: local,
      maxBytes: 10,
      timeoutMs: 2000,
    });
    const at = (p: string) => f.get(`http://local.test:${port}${p}`);
    expect(await at('/300')).toMatchObject({ ok: true, json: { ok: 1 } });
    expect(await at('/300-bare')).toMatchObject({ ok: false, status: 300, reason: 'status 300' });
    expect(await at('/400')).toMatchObject({ ok: false, status: 400, reason: 'status 400' });
    expect(await at('/404')).toMatchObject({ ok: false, status: 404, reason: 'status 404' });
    expect(await at('/bad')).toMatchObject({ ok: false, reason: 'bad redirect' });
    expect(await at('/ten')).toMatchObject({ ok: true, text: '0123456789' });
    const roomy = new SafeFetcher({ hosts: ['local.test'], resolve: async () => ['127.0.0.1'], testing: local });
    expect(await roomy.get(`http://local.test:${port}/depth8`)).toMatchObject({ ok: true }); // 8 deep: the limit
    expect(await at('/cut')).toMatchObject({ ok: false, reason: 'read failed' });
    const closed = createTcpServer();
    const gone = await new Promise<number>((ok) =>
      closed.listen(0, '127.0.0.1', () => {
        const p = (closed.address() as AddressInfo).port;
        closed.close(() => ok(p));
      }),
    );
    expect(await f.get(`http://local.test:${gone}/ok`)).toMatchObject({ ok: false, reason: 'connection failed' });
  });

  it('an IP literal is not resolved; a name goes through the system resolver; one-address lookups work', async () => {
    const port = await serve((_req, res) => res.writeHead(200).end('{"ok":true}'));
    const literal = new SafeFetcher({
      hosts: ['127.0.0.1'],
      resolve: async () => {
        throw new Error('an IP literal is not resolved');
      },
      testing: { allowHttp: true, allowAddresses: ['127.0.0.1'] },
    });
    expect(await literal.get(`http://127.0.0.1:${port}/`)).toMatchObject({ ok: true });
    const system = new SafeFetcher({
      hosts: ['localhost'],
      testing: { allowHttp: true, allowAddresses: ['127.0.0.1', '::1'] },
    });
    const r = await system.get(`http://localhost:${port}/`);
    if (!r.ok) expect(r.reason).toBe('connection failed'); // localhost answered ::1 first, where nothing listens
    const was = getDefaultAutoSelectFamily();
    setDefaultAutoSelectFamily(false); // the socket then asks the lookup for one address, not all
    try {
      const named = new SafeFetcher({
        hosts: ['local.test'],
        resolve: async () => ['127.0.0.1'],
        testing: { allowHttp: true, allowAddresses: ['127.0.0.1'] },
      });
      expect(await named.get(`http://local.test:${port}/`)).toMatchObject({ ok: true });
    } finally {
      setDefaultAutoSelectFamily(was);
    }
  });

  it('sends no SNI for an IP literal (RFC 6066), the name for a name', async () => {
    let hello: Buffer = Buffer.alloc(0);
    const port = await listen(
      createTcpServer((s) =>
        s.once('data', (d: Buffer) => {
          hello = d;
          s.destroy();
        }),
      ),
    );
    const f = new SafeFetcher({ hosts: ['127.0.0.1'], testing: { allowAddresses: ['127.0.0.1'] } });
    expect(await f.get(`https://127.0.0.1:${port}/`)).toMatchObject({ ok: false });
    expect(hello.length).toBeGreaterThan(0);
    expect(hello.includes('127.0.0.1')).toBe(false);
    // A name is sent (Node would also derive it from the host by itself: docs/dev/mutants.json).
    const named = new SafeFetcher({
      hosts: ['local.test'],
      resolve: async () => ['127.0.0.1'],
      testing: { allowAddresses: ['127.0.0.1'] },
    });
    expect(await named.get(`https://local.test:${port}/`)).toMatchObject({ ok: false });
    expect(hello.includes('local.test')).toBe(true);
  });
});
