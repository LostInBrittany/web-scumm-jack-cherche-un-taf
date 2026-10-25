// The edges of badge verification and of the badge form (connectors/src/badges/verify.ts, connector.ts), each test
// written for a mutant of `connectors-edge` the other badge tests let live (4.1.20 PR 2b, plan §7.1; tools/mutate.ts,
// docs/dev/MUTANTS.md): the exact reason of every refusal, the exact bounds of every date, count and index, each
// shape a document may take (wrapped or not, an array or one, a key in three forms), the cache's bounds, and what
// the form answers and rejects. Documents come from a map (no network); the one fetch test uses a local server.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject, sign } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { type AddressInfo, connect } from 'node:net';
import { gzipSync } from 'node:zlib';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { OpenBadgeConnector } from '../connectors/src/badges/connector';
import { base58Encode } from '../connectors/src/badges/crypto';
import { type Fetched, jsonDepth } from '../connectors/src/badges/fetch';
import { BadgeVerifier, type Submission, type Verdict, type VerifierOptions } from '../connectors/src/badges/verify';
import { type ConnectorContext, canonicalJson, type ProposedSignal, type ProposeResult } from '../connectors/src/sdk';

type Obj = Record<string, unknown>;
const NOW = Date.parse('2026-10-07T12:00:00Z');
const SKEW = 5 * 60_000;
const iso = (t: number) => new Date(t).toISOString();
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const b64u = (x: unknown) => Buffer.from(JSON.stringify(x)).toString('base64url');

/** An Ed25519 key from a fixed TEST seed, as a PEM, a JWK, a multikey and a did:key. */
const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');
const keyOf = (seed: number) => {
  const priv = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519, Buffer.alloc(32, seed)]),
    format: 'der',
    type: 'pkcs8',
  });
  const pub = createPublicKey(priv);
  const raw = pub.export({ format: 'der', type: 'spki' }).subarray(12);
  const mb = `z${base58Encode(new Uint8Array([0xed, 0x01, ...raw]))}`;
  const did = `did:key:${mb}`;
  return {
    priv,
    pem: pub.export({ format: 'pem', type: 'spki' }).toString(),
    jwk: pub.export({ format: 'jwk' }),
    mb,
    did,
    vm: `${did}#${mb}`,
  };
};
const K = keyOf(21);
const K2 = keyOf(22);
const jwsOf = (header: Obj, payload: unknown, priv: KeyObject = K.priv) => {
  const input = `${b64u(header)}.${b64u(payload)}`;
  return `${input}.${sign(null, Buffer.from(input), priv).toString('base64url')}`;
};
/** The same JWS with a signature over something else. */
const tampered = (jws: string) =>
  `${jws.split('.').slice(0, 2).join('.')}.${sign(null, Buffer.from('else'), K.priv).toString('base64url')}`;

const h = (v: unknown) => createHash('sha256').update(canonicalJson(v)).digest();
function signDi(doc: Obj, extra: Obj = {}, k = K): Obj {
  const proof = {
    type: 'DataIntegrityProof',
    cryptosuite: 'eddsa-jcs-2022',
    created: '2026-10-01T00:00:00Z',
    verificationMethod: k.vm,
    proofPurpose: 'assertionMethod',
    ...extra,
  };
  const config = doc['@context'] === undefined ? proof : { ...proof, '@context': doc['@context'] };
  const sig = sign(null, Buffer.concat([h(config), h(doc)]), k.priv);
  return { ...doc, proof: { ...proof, proofValue: `z${base58Encode(new Uint8Array(sig))}` } };
}
const without = (o: Obj, ...keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

const ISSUER = 'https://issuer.test/profile';
const ISSUER_B = 'https://issuer.test/profile-b';
const A = 'https://issuer.test/a';
const CLASS = 'https://issuer.test/badges/b';
const CLASS_B = 'https://issuer.test/badges/b2';
const KEY = 'https://issuer.test/keys/pem';
const REVOCATIONS = 'https://issuer.test/revocations';
const LIST = 'https://issuer.test/status/1';
const RL = 'https://issuer.test/rl';
const EMAIL = 'robin@player.example';
const SALT = 'pepper';
const RECIPIENT = { type: 'email', hashed: true, salt: SALT, identity: `sha256$${sha(EMAIL + SALT)}` };
const PLAYER = 'did:example:player';

/** A bitstring of 128 entries, gzipped as `encodedList` says, with these indexes set. */
const bitsWith = (...set: number[]) => {
  const b = Buffer.alloc(16);
  for (const i of set) b[i >> 3]! |= 1 << (7 - (i & 7));
  return `u${gzipSync(b).toString('base64url')}`;
};
const listCred = (o: Obj = {}): Obj => ({
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  id: LIST,
  type: ['VerifiableCredential', 'BitstringStatusListCredential'],
  issuer: K.did,
  credentialSubject: { type: 'BitstringStatusList', statusPurpose: 'revocation', encodedList: bitsWith(5) },
  ...o,
});
const entry = (i: number | string, url = LIST) => ({
  type: 'BitstringStatusListEntry',
  statusPurpose: 'revocation',
  statusListIndex: String(i),
  statusListCredential: url,
});

const DOCS: Obj = {
  [CLASS]: { id: CLASS, type: 'BadgeClass', issuer: ISSUER },
  [CLASS_B]: { id: CLASS_B, type: 'BadgeClass', issuer: ISSUER_B },
  [ISSUER]: { id: ISSUER, type: 'Issuer', revocationList: REVOCATIONS },
  [ISSUER_B]: { id: ISSUER_B, type: 'Issuer', verification: { allowedOrigins: ['other.test'] } },
  [REVOCATIONS]: { revokedAssertions: [`${A}/revoked`] },
  [KEY]: { owner: ISSUER, publicKeyPem: K.pem },
  'https://issuer.test/keys/jwk': K.jwk,
  'https://issuer.test/keys/wrapped': { publicKeyJwk: K.jwk },
  'https://issuer.test/keys/multi': { publicKeyMultibase: K.mb },
  'https://issuer.test/keys/empty': {},
  'https://evil.test/keys/jwk': K.jwk,
  'http://issuer.test/keys/jwk': K.jwk,
  [LIST]: signDi(listCred()),
  [RL]: { revokedCredentials: ['urn:uuid:other'] },
};
const okDoc = (url: string, json: unknown, text = JSON.stringify(json)): Fetched => ({
  ok: true,
  status: 200,
  url,
  text,
  json,
});
const notFound: Fetched = { ok: false, status: 404, reason: 'status 404' };

interface World {
  docs?: Obj;
  raw?: Record<string, Fetched>;
  opts?: Partial<VerifierOptions>;
}
/** A verifier over DOCS (and the world's own), recording every URL it asks for. */
function make(w: World = {}) {
  const docs = { ...DOCS, ...w.docs };
  const seen: unknown[] = [];
  const v = new BadgeVerifier({
    issuers: [ISSUER, ISSUER_B, K.did],
    now: () => NOW,
    fetch: async (u) => {
      seen.push(u);
      const r = w.raw?.[u];
      if (r) return r;
      return Object.hasOwn(docs, u) ? okDoc(u, docs[u]) : notFound;
    },
    ...w.opts,
  });
  return { v, seen };
}
const run = (s: Submission, w?: World) => make(w).v.verify(s);
const is = (v: Verdict, status: Verdict['status'], reason?: string) =>
  expect(reason === undefined ? { status: v.status } : { status: v.status, reason: v.reason }).toEqual(
    reason === undefined ? { status } : { status, reason },
  );

/** An OB2 hosted assertion at `${A}/x`, submitted by its URL. */
const assertion = (extra: Obj = {}, id = `${A}/x`): Obj => ({
  id,
  type: 'Assertion',
  recipient: RECIPIENT,
  badge: CLASS,
  verification: { type: 'hosted' },
  ...extra,
});
const hosted = (extra: Obj = {}, s: Partial<Submission> = { email: EMAIL }, w: World = {}) =>
  run({ badge: `${A}/x`, ...s }, { ...w, docs: { [`${A}/x`]: assertion(extra), ...w.docs } });
/** An OB2 signed assertion, a compact JWS. */
const signedPayload = (extra: Obj = {}): Obj => ({
  id: 'urn:uuid:s1',
  recipient: RECIPIENT,
  badge: CLASS,
  verification: { type: 'signed', creator: KEY },
  ...extra,
});
const signed = (extra: Obj = {}) => jwsOf({ alg: 'EdDSA' }, signedPayload(extra));
/** An OB3 credential, issued by K's did:key, its subject the hashed email. */
const cred = (extra: Obj = {}): Obj => ({
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  id: 'urn:uuid:c1',
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  issuer: K.did,
  validFrom: '2026-01-01T00:00:00Z',
  credentialSubject: {
    identifier: [
      { identityType: 'emailAddress', hashed: true, salt: SALT, identityHash: `sha256$${sha(EMAIL + SALT)}` },
    ],
  },
  ...extra,
});
const di = (extra: Obj = {}, proof: Obj = {}, k = K) => signDi(cred(extra), proof, k);
const jwt = (payload: Obj, header: Obj = { alg: 'EdDSA', kid: K.vm }) => jwsOf(header, payload);

describe('the verdict, whatever goes wrong', () => {
  it('a thing that is not an object is not a badge, with that reason (null, an array, a number)', async () => {
    for (const badge of [null, [], [1], 42]) is(await run({ badge }), 'invalid', 'not a badge');
  });

  it('an id that is not a string is no id: the verdict keeps an empty one', async () => {
    const v = await run({ badge: { id: 42 } });
    expect(v).toMatchObject({ status: 'invalid', reason: 'not a hosted assertion', badgeId: '' });
  });

  it('a fetch that throws is indeterminate, "verification failed", never its own message or status', async () => {
    const v = await run(
      { badge: `${A}/x` },
      {
        opts: {
          fetch: async () => {
            throw new Error('boom');
          },
        },
      },
    );
    is(v, 'indeterminate', 'verification failed');
  });

  it('counts the documents of one verification: exactly maxFetches pass, one more is refused', async () => {
    // A hosted badge by its URL: the URL, the assertion again, the class, the issuer, its revocation list.
    is(await hosted({}, { email: EMAIL }, { opts: { maxFetches: 5 } }), 'valid');
    is(await hosted({}, { email: EMAIL }, { opts: { maxFetches: 4 } }), 'indeterminate', 'revocation list not fetched');
    is(
      await hosted({}, { email: EMAIL }, { opts: { maxFetches: 0 } }),
      'indeterminate',
      'badge not fetched (too many documents)',
    );
  });
});

describe('a badge given as a string', () => {
  it('a URL answered 410 is revoked', async () => {
    is(
      await hosted({}, { email: EMAIL }, { raw: { [`${A}/x`]: { ok: false, status: 410, reason: 'status 410' } } }),
      'revoked',
    );
  });

  it('a string starting with { is read as JSON, or refused as not JSON', async () => {
    is(await run({ badge: '{nope' }), 'invalid', 'not JSON');
    is(await run({ badge: JSON.stringify(di()), email: EMAIL }), 'valid');
  });

  it('a JWS whose payload is not an object is not a badge', async () => {
    is(await run({ badge: jwsOf({ alg: 'EdDSA' }, null) }), 'invalid', 'not a badge');
  });
});

describe('OB3 as a VC-JWT', () => {
  const wrapped = { iss: K.did, jti: 'urn:jti:1', vc: without(cred(), 'id', 'issuer') };

  it('reads a credential wrapped in `vc`, its issuer from `iss`, its id from `jti`', async () => {
    const v = await run({ badge: jwt(wrapped), email: EMAIL });
    expect(v).toMatchObject({ status: 'valid', issuer: K.did, badgeId: 'urn:jti:1' });
  });

  it('an unwrapped credential keeps its own id', async () => {
    const v = await run({ badge: jwt(cred()), email: EMAIL });
    expect(v).toMatchObject({ status: 'valid', issuer: K.did, badgeId: 'urn:uuid:c1' });
  });

  it('an `iss` other than the issuer is refused; an `iss` that is not a string is no issuer', async () => {
    is(
      await run({ badge: jwt({ ...cred(), iss: 'did:example:other' }), email: EMAIL }),
      'invalid',
      'iss is not the issuer',
    );
    const v = await run({ badge: jwt({ ...without(cred(), 'issuer'), iss: 42 }), email: EMAIL });
    expect(v).toMatchObject({ status: 'invalid', reason: 'the key is not the issuer’s', issuer: '' });
  });

  it('a signature over something else is refused', async () => {
    is(await run({ badge: tampered(jwt(cred())), email: EMAIL }), 'invalid', 'signature');
  });

  it('a `kid` that is not a string names no key', async () => {
    is(
      await run({ badge: jwt(cred(), { alg: 'EdDSA', kid: 42 }), email: EMAIL }),
      'indeterminate',
      'key not resolvable',
    );
  });

  it('`exp` in seconds: past is expired, now and later are not; a string `exp` is not read', async () => {
    const at = (exp: unknown) => run({ badge: jwt({ ...cred(), exp }), email: EMAIL });
    is(await at(NOW / 1000 - 1), 'expired', 'expired');
    is(await at(NOW / 1000), 'valid');
    is(await at(NOW / 1000 + 86_400), 'valid');
    is(await at('1'), 'valid');
  });
});

describe('OB2 signed', () => {
  it('needs a signed verification: none, or a hosted one, is refused', async () => {
    is(
      await run({ badge: jwsOf({ alg: 'EdDSA' }, without(signedPayload(), 'verification')), email: EMAIL }),
      'invalid',
      'not a signed assertion',
    );
    is(
      await run({ badge: signed({ verification: { type: 'hosted', creator: KEY } }), email: EMAIL }),
      'invalid',
      'not a signed assertion',
    );
    is(await run({ badge: signed({ verification: { type: 'SignedBadge', creator: KEY } }), email: EMAIL }), 'valid');
  });

  it('an RS256 key of fewer than 2048 bits, or an ES256 key off P-256, signs no valid badge (4.3.0)', async () => {
    // The key is the issuer's publicKeyPem: a 512-bit RSA modulus can be factored, so a badge it signs can be forged,
    // and ES256 names P-256. Each badge below is signed correctly with its own key; only the key's strength differs.
    const badgeWith = (alg: 'RS256' | 'ES256', priv: KeyObject) => {
      const input = `${b64u({ alg })}.${b64u(signedPayload())}`;
      const sig = sign('sha256', Buffer.from(input), alg === 'ES256' ? { key: priv, dsaEncoding: 'ieee-p1363' } : priv);
      return `${input}.${sig.toString('base64url')}`;
    };
    const verdict = (alg: 'RS256' | 'ES256', pair: { publicKey: KeyObject; privateKey: KeyObject }) =>
      run(
        { badge: badgeWith(alg, pair.privateKey), email: EMAIL },
        { docs: { [KEY]: { owner: ISSUER, publicKeyPem: pair.publicKey.export({ format: 'pem', type: 'spki' }) } } },
      );
    for (const bits of [512, 1024])
      is(await verdict('RS256', generateKeyPairSync('rsa', { modulusLength: bits })), 'invalid', 'signature');
    is(await verdict('RS256', generateKeyPairSync('rsa', { modulusLength: 2048 })), 'valid');
    is(await verdict('ES256', generateKeyPairSync('ec', { namedCurve: 'P-384' })), 'invalid', 'signature');
    is(await verdict('ES256', generateKeyPairSync('ec', { namedCurve: 'P-256' })), 'valid');
  });

  it('a creator that is not a string is asked as the empty URL', async () => {
    const { v, seen } = make();
    is(
      await v.verify({ badge: signed({ verification: { type: 'signed', creator: 42 } }), email: EMAIL }),
      'indeterminate',
      'key not fetched',
    );
    expect(seen).toEqual(['']);
  });

  it('the key: not fetched, not an object, not readable, not the issuer’s, or not the signer', async () => {
    const key = (doc: Fetched) => run({ badge: signed(), email: EMAIL }, { raw: { [KEY]: doc } });
    is(await key(notFound), 'indeterminate', 'key not fetched');
    is(await key(okDoc(KEY, [])), 'indeterminate', 'key not fetched');
    is(await key(okDoc(KEY, { owner: ISSUER, publicKeyPem: 'nope' })), 'indeterminate', 'key unreadable');
    is(await key(okDoc(KEY, { owner: ISSUER_B, publicKeyPem: K.pem })), 'invalid', 'the key is not the issuer’s');
    is(await run({ badge: tampered(signed()), email: EMAIL }), 'invalid', 'signature');
  });
});

describe('OB2 hosted', () => {
  const pasted = (o: Obj) => run({ badge: o, email: EMAIL }, { docs: { [`${A}/x`]: assertion() } });

  it('reads `verify` as well as `verification`, `HostedBadge` as well as `hosted`', async () => {
    is(await pasted({ id: `${A}/x`, verify: { type: 'hosted' } }), 'valid');
    is(await pasted({ id: `${A}/x`, verification: { type: 'HostedBadge' } }), 'valid');
    is(await pasted({ id: `${A}/x` }), 'invalid', 'not a hosted assertion');
  });

  it('the assertion fetched again: missing is indeterminate, gone is revoked, another is invalid', async () => {
    const at = (w: World) => run({ badge: { id: `${A}/x`, verification: { type: 'hosted' } }, email: EMAIL }, w);
    is(await at({}), 'indeterminate', 'assertion not fetched (status 404)');
    is(await at({ raw: { [`${A}/x`]: { ok: false, status: 410, reason: 'status 410' } } }), 'revoked');
    is(
      await at({ docs: { [`${A}/x`]: assertion({}, `${A}/y`) } }),
      'invalid',
      'the hosted assertion is another document',
    );
  });

  it('a pasted assertion 8 deep is read, 9 deep is not', async () => {
    let nest: unknown = 1;
    for (let i = 0; i < 7; i++) nest = { n: nest };
    const badge = { id: `${A}/x`, verification: { type: 'hosted' }, nest };
    expect(jsonDepth(badge, 8)).toBe(8);
    is(await pasted(badge), 'valid');
    is(await pasted({ ...badge, nest: { n: nest } }), 'invalid', 'nested too deep');
  });

  it('the badge class: embedded, missing, not fetched, not an object', async () => {
    is(await hosted({ badge: DOCS[CLASS] }), 'valid');
    is(await hosted({ badge: undefined }), 'invalid', 'no badge class');
    is(await hosted({}, { email: EMAIL }, { raw: { [CLASS]: notFound } }), 'indeterminate', 'badge class not fetched');
    is(
      await hosted({}, { email: EMAIL }, { raw: { [CLASS]: okDoc(CLASS, []) } }),
      'indeterminate',
      'badge class not fetched',
    );
  });

  it('the issuer’s profile: another id, or null, is not the issuer', async () => {
    is(
      await hosted({}, { email: EMAIL }, { docs: { [ISSUER]: { id: ISSUER_B } } }),
      'indeterminate',
      'issuer not fetched',
    );
    is(
      await hosted({}, { email: EMAIL }, { raw: { [ISSUER]: okDoc(ISSUER, null) } }),
      'indeterminate',
      'issuer not fetched',
    );
  });

  it('hosted on another origin: refused unless the profile allows that origin', async () => {
    const elsewhere = (badge: string) =>
      run(
        { badge: 'https://other.test/a/x', email: EMAIL },
        { docs: { 'https://other.test/a/x': assertion({ badge }, 'https://other.test/a/x') } },
      );
    is(await elsewhere(CLASS), 'invalid', 'assertion hosted outside the issuer');
    is(await elsewhere(CLASS_B), 'valid'); // ISSUER_B allows other.test, and has no revocation list
  });

  it('revoked: true is revoked, false is not', async () => {
    is(await hosted({ revoked: true }), 'revoked', 'revoked');
    is(await hosted({ revoked: false }), 'valid');
  });

  it('`expires`: a date at this very instant still counts; a number is not read', async () => {
    is(await hosted({ expires: iso(NOW) }), 'valid');
    is(await hosted({ expires: iso(NOW - 1) }), 'expired', 'expired');
    is(await hosted({ expires: 0 }), 'valid');
  });

  it('the revocation list: not fetched, not an object, without revocations, or naming the assertion', async () => {
    const list = (doc: Fetched) => hosted({}, { email: EMAIL }, { raw: { [REVOCATIONS]: doc } });
    is(await list(notFound), 'indeterminate', 'revocation list not fetched');
    is(await list(okDoc(REVOCATIONS, [])), 'indeterminate', 'revocation list not fetched');
    is(await list(okDoc(REVOCATIONS, {})), 'valid');
    is(await list(okDoc(REVOCATIONS, { revokedAssertions: [`${A}/x`] })), 'revoked', 'in the revocation list');
  });
});

describe('OB2 recipients', () => {
  it('none is invalid; an email one needs the email; plain or hashed, any case', async () => {
    is(await hosted({ recipient: undefined }), 'invalid', 'no recipient');
    is(await hosted({}, {}), 'indeterminate', 'no email to match the recipient');
    is(
      await hosted(
        { recipient: { type: 'email', identity: 'Robin@Player.Example' } },
        { email: ' ROBIN@player.example ' },
      ),
      'valid',
    );
    is(await hosted({}, { email: 'someone@else.example' }), 'invalid', 'another recipient');
  });

  it('another type is matched as is against the recipient given', async () => {
    const r = { recipient: { type: 'url', identity: PLAYER } };
    is(await hosted(r, { recipient: PLAYER }), 'valid');
    is(await hosted(r, { recipient: 'did:example:else' }), 'invalid', 'another recipient');
    is(await hosted(r, {}), 'invalid', 'another recipient');
  });
});

describe('OB3 recipients and dates', () => {
  const as = (extra: Obj, s: Partial<Submission> = { email: EMAIL }) => run({ badge: di(extra), ...s });

  it('no subject, or a subject id, matched against the recipient given', async () => {
    is(await run({ badge: signDi(without(cred(), 'credentialSubject')) }), 'invalid', 'another recipient');
    const byId = { credentialSubject: { id: PLAYER } };
    is(await as(byId, { recipient: PLAYER }), 'valid');
    is(await as(byId, { recipient: 'did:example:else' }), 'invalid', 'another recipient');
    is(await as(byId, {}), 'invalid', 'another recipient');
  });

  it('an email identifier needs the email; plain or hashed', async () => {
    is(await as({}, {}), 'indeterminate', 'no email to match the recipient');
    const plain = { credentialSubject: { identifier: [{ identityType: 'emailAddress', identityHash: EMAIL }] } };
    is(await as(plain), 'valid');
  });

  it('validFrom: up to the clock tolerance ahead is valid, one millisecond more is not', async () => {
    is(await as({ validFrom: iso(NOW + SKEW) }), 'valid');
    is(await as({ validFrom: iso(NOW + SKEW + 1) }), 'invalid', 'not valid yet');
  });

  it('validUntil: now still counts, before now is expired, later is valid', async () => {
    is(await as({ validUntil: iso(NOW) }), 'valid');
    is(await as({ validUntil: iso(NOW - 1) }), 'expired', 'expired');
    is(await as({ validUntil: iso(NOW + 86_400_000) }), 'valid');
  });
});

describe('OB3 statuses', () => {
  const st = (credentialStatus: unknown, w?: World) => run({ badge: di({ credentialStatus }), email: EMAIL }, w);
  const rl = { id: RL, type: '1EdTechRevocationList' };

  it('a list of statuses, or one; something that is not an object is unreadable; an unknown type is not judged', async () => {
    is(await st([rl]), 'valid');
    is(await st('x'), 'indeterminate', 'unreadable status');
    is(await st({ type: 'Foo' }), 'indeterminate', 'status type not supported');
  });

  it('1EdTech revocation list: either array, not fetched, not an object', async () => {
    is(await st(rl), 'valid');
    is(
      await st(rl, { raw: { [RL]: okDoc(RL, { revokedAssertions: ['urn:uuid:c1'] }) } }),
      'revoked',
      'in the revocation list',
    );
    is(await st(rl, { raw: { [RL]: notFound } }), 'indeterminate', 'revocation list not fetched');
    is(await st(rl, { raw: { [RL]: okDoc(RL, []) } }), 'indeterminate', 'revocation list not fetched');
  });

  it('bitstring: index 0 is read, -1 is not, 128 is out of a 128-entry list, 5 is revoked', async () => {
    is(await st(entry(0)), 'valid');
    is(await st(entry(5)), 'revoked', 'revoked in the status list');
    is(await st(entry(-1)), 'indeterminate', 'bad status index');
    is(await st(entry(128)), 'indeterminate', 'status index out of the list');
  });

  it('bitstring: the list not fetched, from another issuer, without a subject', async () => {
    is(await st(entry(0), { raw: { [LIST]: notFound } }), 'indeterminate', 'status list not fetched');
    is(
      await st(entry(0), { docs: { [LIST]: signDi(listCred({ issuer: 'did:example:other' })) } }),
      'indeterminate',
      'status list from another issuer',
    );
    is(
      await st(entry(0), { docs: { [LIST]: signDi(without(listCred(), 'credentialSubject')) } }),
      'indeterminate',
      'status list unreadable',
    );
  });

  it('a status list as a VC-JWT, wrapped in `vc` or not; unreadable, another issuer, no kid, a bad signature', async () => {
    const asJwt = (text: string) => st(entry(0), { raw: { [LIST]: okDoc(LIST, undefined, text) } });
    is(await asJwt(jwt(listCred())), 'valid');
    is(await asJwt(jwt({ vc: without(listCred(), 'issuer'), iss: K.did })), 'indeterminate', 'status list unreadable'); // vc has no issuer
    is(await asJwt(jwt({ vc: listCred() })), 'valid');
    is(await asJwt('garbage'), 'indeterminate', 'status list unreadable');
    is(await asJwt(jwsOf({ alg: 'EdDSA', kid: K.vm }, null)), 'indeterminate', 'status list unreadable');
    is(await asJwt(jwt(listCred({ issuer: 'did:example:other' }))), 'indeterminate', 'status list unreadable');
    is(await asJwt(jwt(listCred(), { alg: 'EdDSA' })), 'indeterminate', 'key not resolvable');
    is(await asJwt(tampered(jwt(listCred()))), 'indeterminate', 'status list signature');
  });
});

describe('OB3 Data Integrity proofs and keys', () => {
  const as = (badge: Obj) => run({ badge, email: EMAIL });

  it('a proof among several; none of the suite is not supported, with that reason', async () => {
    const d = di();
    is(await as({ ...d, proof: [{ type: 'Ed25519Signature2020' }, d.proof] }), 'valid');
    is(
      await as(di({}, { cryptosuite: 'eddsa-rdfc-2022' })),
      'indeterminate',
      'proof suite not supported (eddsa-rdfc-2022)',
    );
  });

  it('the purpose must be assertionMethod; created up to the tolerance ahead; expires at this instant still counts', async () => {
    is(await as(di({}, { proofPurpose: 'authentication' })), 'invalid', 'proof purpose');
    is(await as(di({}, { created: iso(NOW + SKEW) })), 'valid');
    is(await as(di({}, { created: iso(NOW) })), 'valid');
    is(await as(di({}, { expires: iso(NOW) })), 'valid');
    is(await as(di({}, { expires: iso(NOW + 86_400_000) })), 'valid');
  });

  it('did:key: another key than the issuer’s is refused; one it cannot read is not supported', async () => {
    is(await as(di({}, { verificationMethod: K2.vm }, K2)), 'invalid', 'the key is not the issuer’s');
    const bad = `did:key:z${'1'.repeat(45)}`;
    is(await as(di({ issuer: bad }, { verificationMethod: `${bad}#x` })), 'indeterminate', 'did:key not supported');
  });

  it('a key at a URL of the issuer’s own https origin: a JWK, a wrapped JWK, a multikey', async () => {
    for (const k of ['jwk', 'wrapped', 'multi'])
      is(await as(di({ issuer: ISSUER }, { verificationMethod: `https://issuer.test/keys/${k}#k` })), 'valid');
  });

  it('a key elsewhere, over http, missing, not an object or empty is not the issuer’s', async () => {
    const vm = (verificationMethod: string, w?: World) =>
      run({ badge: di({ issuer: ISSUER }, { verificationMethod }), email: EMAIL }, w);
    is(await vm('https://evil.test/keys/jwk'), 'indeterminate', 'key not resolvable');
    is(await vm('http://issuer.test/keys/jwk'), 'indeterminate', 'key not resolvable');
    is(await vm('https://issuer.test/keys/missing'), 'indeterminate', 'key not fetched');
    is(
      await vm('https://issuer.test/keys/array', { raw: { 'https://issuer.test/keys/array': okDoc('', []) } }),
      'indeterminate',
      'key not fetched',
    );
    is(await vm('https://issuer.test/keys/empty'), 'indeterminate', 'key unreadable');
  });
});

describe('the list cache', () => {
  type Cached = { cached(u: string, get: (u: string) => Promise<Fetched>): Promise<Fetched> };
  it('reuses a list strictly less than cacheMs, never a failed fetch, and keeps the 256 newest', async () => {
    let now = NOW;
    const v = make({ opts: { now: () => now, cacheMs: 1000 } }).v as unknown as Cached;
    const got: string[] = [];
    let fail = true;
    const get = async (u: string): Promise<Fetched> => {
      got.push(u);
      return u === 'flaky' && fail ? notFound : okDoc(u, {});
    };
    await v.cached('a', get);
    now += 999;
    await v.cached('a', get);
    expect(got).toEqual(['a']);
    now += 1;
    await v.cached('a', get);
    expect(got).toEqual(['a', 'a']);
    await v.cached('flaky', get);
    fail = false;
    expect((await v.cached('flaky', get)).ok).toBe(true);
    expect(got).toEqual(['a', 'a', 'flaky', 'flaky']);

    const many = make().v as unknown as Cached;
    got.length = 0;
    for (let i = 0; i <= 256; i++) await many.cached(`u${i}`, get);
    expect(got).toHaveLength(257);
    await many.cached('u1', get); // still there
    expect(got).toHaveLength(257);
    await many.cached('u0', get); // the oldest went when the 257th came
    expect(got).toHaveLength(258);
  });
});

describe('the badge form', () => {
  const servers: Server[] = [];
  const connectors: OpenBadgeConnector[] = [];
  afterAll(async () => {
    for (const c of connectors) await c.stop();
    for (const s of servers) await new Promise<void>((ok) => s.close(() => ok()));
  });
  const DECL = { issuers: [ISSUER], valid: 'badge.valid', revoked: 'badge.revoked', indeterminate: 'badge.unknown' };

  /** A connector on a context of its own: pairing GOOD links p1, the proposals and rejections are kept. */
  async function form(
    o: { decl?: Obj | null; pair?: ConnectorContext['pair']; result?: ProposeResult; config?: Obj } = {},
  ) {
    const rejects: unknown[] = [];
    const proposed: ProposedSignal[] = [];
    const ctx = {
      manifest: { connectors: o.decl === null ? {} : { 'open-badge': o.decl ?? DECL } },
      log: () => {},
      reject: (r: string) => rejects.push(r),
      pair:
        o.pair ??
        (async (code: string) => (code === 'GOOD' ? { ok: true, playerId: 'p1' } : { ok: false, refusal: 'pairing' })),
      propose: async (s: ProposedSignal) => {
        proposed.push(s);
        return o.result ?? { ok: true, sequence: 1, duplicate: false };
      },
    } as unknown as ConnectorContext;
    const c = new OpenBadgeConnector({ port: 0, ...o.config });
    await c.start(ctx);
    connectors.push(c);
    const seen: Submission[] = [];
    let answer: Partial<Verdict> = { status: 'valid', badgeId: 'urn:x', issuer: ISSUER };
    const stub = {
      verify: async (s: Submission) => (
        seen.push(s), { format: 'unknown', reason: '', badgeId: '', issuer: '', ...answer }
      ),
    };
    const swap = () => {
      (c as unknown as { verifier: unknown }).verifier = stub;
    };
    const send = (body: string, init: RequestInit = { method: 'POST' }, path = '/v1/badges') =>
      fetch(`http://127.0.0.1:${c.port}${path}`, {
        ...init,
        ...(init.method === 'GET' ? {} : { body }),
        signal: AbortSignal.timeout(5000),
      });
    const post = async (body: unknown) => {
      const r = await send(JSON.stringify(body));
      return { status: r.status, body: await r.json() };
    };
    return { c, rejects, proposed, seen, swap, send, post, answer: (a: Partial<Verdict>) => void (answer = a) };
  }

  it('refuses to start without its declaration, with that message', async () => {
    await expect(form({ decl: null })).rejects.toThrow(/declares no/);
  });

  it('answers 404 elsewhere without counting it; 400 for a body that is not an object with a code', async () => {
    const f = await form();
    expect((await f.send('', { method: 'GET' })).status).toBe(404);
    expect((await f.send('{}', { method: 'POST' }, '/v1/other')).status).toBe(404);
    expect(f.rejects).toEqual([]);
    expect((await f.send('null')).status).toBe(400);
    expect((await f.send('{}')).status).toBe(400);
    expect(f.rejects).toEqual(['shape', 'shape']);
  });

  it('limits each address per minute', async () => {
    const f = await form({ config: { perMinutePerIp: 1 } });
    expect((await f.send('{}')).status).toBe(400);
    expect((await f.send('{}')).status).toBe(429);
  });

  it('a pairing refused is 422 with its code, the badge never verified', async () => {
    const f = await form();
    f.swap();
    expect(await f.post({ code: 'nope', badge: 'x' })).toEqual({ status: 422, body: { error: 'pairing-pairing' } });
    expect(f.seen).toEqual([]);
  });

  it('a body cut by the client is an internal error, counted as `internal`', async () => {
    const f = await form();
    const server = (f.c as unknown as { server: Server }).server;
    const reached = new Promise((ok) => server.once('request', ok));
    const s = connect(f.c.port, '127.0.0.1');
    s.write('POST /v1/badges HTTP/1.1\r\nHost: x\r\nContent-Length: 100\r\n\r\n{"code":');
    await reached;
    s.destroy();
    await vi.waitFor(() => expect(f.rejects).toEqual(['internal']));
  });

  it('passes the email up to 320 characters and the recipient up to 512, nothing longer, nothing else', async () => {
    const f = await form();
    f.swap();
    const e320 = `${'e'.repeat(310)}@ex.ample`.padEnd(320, 'x');
    const r512 = 'r'.repeat(512);
    await f.post({ code: 'GOOD', badge: 'b', email: e320, recipient: r512 });
    await f.post({ code: 'GOOD', badge: 'b', email: `${e320}x`, recipient: `${r512}x` });
    await f.post({ code: 'GOOD', badge: 'b', email: 42, recipient: 42 });
    expect(f.seen).toEqual([{ badge: 'b', email: e320, recipient: r512 }, { badge: 'b' }, { badge: 'b' }]);
    expect(f.seen.map((s) => Object.keys(s))).toEqual([['badge', 'email', 'recipient'], ['badge'], ['badge']]);
  });

  it('a verdict without a signal proposes nothing; the badge id names the proposal; refusals and duplicates said', async () => {
    const f = await form();
    f.swap();
    f.answer({ status: 'invalid' });
    expect(await f.post({ code: 'GOOD', badge: 'b' })).toEqual({
      status: 200,
      body: { status: 'invalid', signal: 'none' },
    });
    expect(f.proposed).toEqual([]);
    f.answer({ status: 'valid', badgeId: 'urn:x', issuer: ISSUER });
    expect(await f.post({ code: 'GOOD', badge: 'b' })).toEqual({
      status: 202,
      body: { status: 'valid', signal: 'accepted' },
    });
    expect(f.proposed[0]).toMatchObject({ kind: 'badge.valid', payload: { badgeId: sha('urn:x').slice(0, 32) } });
    const refused = await form({ result: { ok: false, refusal: 'quota' } });
    refused.swap();
    expect(await refused.post({ code: 'GOOD', badge: 'b' })).toEqual({
      status: 422,
      body: { status: 'valid', signal: 'quota' },
    });
    const twice = await form({ result: { ok: true, sequence: 1, duplicate: true } });
    twice.swap();
    expect(await twice.post({ code: 'GOOD', badge: 'b' })).toEqual({
      status: 202,
      body: { status: 'valid', signal: 'duplicate' },
    });
  });

  it('without its context it answers 503 and says it is not healthy, though still listening', async () => {
    const f = await form();
    expect((await f.c.health()).ok).toBe(true);
    (f.c as unknown as { ctx: unknown }).ctx = null;
    expect((await f.c.health()).ok).toBe(false);
    expect(await f.post({ code: 'GOOD', badge: 'b' })).toEqual({ status: 503, body: { error: 'stopping' } });
  });

  it('hands its testing policy and resolver to the fetcher: a local http badge answered 410 is revoked', async () => {
    const server = createServer((_req, res) => res.writeHead(410).end());
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const f = await form({
      config: {
        hosts: ['local.test'],
        testing: { allowHttp: true, allowAddresses: ['127.0.0.1'] },
        resolve: async () => ['127.0.0.1'],
      },
    });
    expect(await f.post({ code: 'GOOD', badge: `http://local.test:${port}/a/gone` })).toEqual({
      status: 202,
      body: { status: 'revoked', signal: 'accepted' },
    });
  });
});
