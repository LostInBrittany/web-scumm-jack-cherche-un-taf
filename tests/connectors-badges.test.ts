// The Open Badges connector (4.1.9, docs/dev/threat-models/open-badge.md): twelve fixtures through the verifier (two
// valid per format, expired, revoked, unknown issuer, broken signature, recursive JSON-LD, redirect to 127.0.0.1,
// someone else's badge), the SSRF-safe fetcher against a local server (redirects, private addresses, rebinding, size,
// depth, time), the cryptography's pieces, and the form end to end with a real Bridge. Ports 0, closed after.
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { hostsOf, OpenBadgeConnector } from '../connectors/src/badges/connector';
import { base58Decode, base58Encode, didKey, parseJws } from '../connectors/src/badges/crypto';
import { type Fetched, isPublicAddress, jsonDepth, SafeFetcher } from '../connectors/src/badges/fetch';
import { BadgeVerifier } from '../connectors/src/badges/verify';
import { type BadgeCase, badgeFixtures, DID, EMAIL, ISSUER } from './fixtures/connectors/badges';
import { contextFor, startBridge } from './fixtures/connectors/harness';

const FILE = 'connectors/test-vectors/open-badge/fixtures.json';
const fixtures = JSON.parse(readFileSync(FILE, 'utf8')) as ReturnType<typeof badgeFixtures>;
const NOW = Date.parse('2026-10-07T12:00:00Z');
const cleanup: (() => Promise<unknown> | void)[] = [];
afterAll(async () => {
  for (const f of cleanup.reverse()) await f();
});

/** The fixtures' documents, served as the SSRF-safe fetcher would return them. */
const fromDocuments =
  (docs: Record<string, unknown>) =>
  async (url: string): Promise<Fetched> => {
    const d = docs[url];
    if (d === undefined) return { ok: false, status: 404, reason: 'status 404' };
    return { ok: true, status: 200, url, text: JSON.stringify(d), json: d };
  };

async function serve(handler: Parameters<typeof createServer>[1]): Promise<{ server: Server; port: number }> {
  const server = createServer(handler);
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  cleanup.push(() => new Promise<void>((ok) => server.close(() => ok())));
  return { server, port: (server.address() as AddressInfo).port };
}

describe('the twelve badge fixtures', () => {
  it('are the ones the generator writes (twelve, two valid per format, and three since the second reading)', () => {
    const strip = (x: unknown) =>
      JSON.parse(
        JSON.stringify(x)
          .replace(/"encodedList":"[^"]*"/g, '"encodedList":""')
          .replace(/"proofValue":"[^"]*"/g, '"proofValue":""'),
      );
    expect(strip(fixtures)).toEqual(strip(badgeFixtures()));
    expect(Object.keys(fixtures.cases)).toHaveLength(15);
    const valid = Object.keys(fixtures.cases).filter((k) => fixtures.cases[k]!.expect === 'valid');
    expect(valid.sort()).toEqual(['ob2-hosted-valid', 'ob2-signed-valid', 'ob3-di-valid', 'ob3-jwt-valid']);
  });

  const verifier = () =>
    new BadgeVerifier({ issuers: [ISSUER, DID], fetch: fromDocuments(fixtures.documents), now: () => NOW });
  it.each(Object.entries(fixtures.cases).filter(([, c]) => !c.network))('%s', async (_name, c: BadgeCase) => {
    const v = await verifier().verify(c.submission);
    expect(v.status, v.reason).toBe(c.expect);
  });

  it('ob2-redirect-loopback: the assertion URL redirects to 127.0.0.1, refused by the network policy', async () => {
    const { port } = await serve((_req, res) => {
      res.writeHead(302, { Location: `http://127.0.0.1:${port}/inside` });
      res.end();
    });
    const fetcher = new SafeFetcher({
      hosts: ['badges.example.org'],
      resolve: async () => ['127.0.0.1'],
      testing: { allowHttp: true, allowAddresses: ['127.0.0.1'] },
    });
    const c = fixtures.cases['ob2-redirect-loopback']!;
    const url = (c.submission.badge as string).replace(
      'https://badges.example.org',
      `http://badges.example.org:${port}`,
    );
    const v = await new BadgeVerifier({ issuers: [ISSUER], fetch: (u) => fetcher.get(u), now: () => NOW }).verify({
      ...c.submission,
      badge: url,
    });
    expect(v.status).toBe(c.expect);
    expect(v.reason).toMatch(/host not allowed/);
  });

  it('a proof suite it cannot check is indeterminate, never valid; an unreadable thing is invalid', async () => {
    const di = JSON.parse(JSON.stringify(fixtures.cases['ob3-di-valid']!.submission.badge));
    di.proof.cryptosuite = 'eddsa-rdfc-2022';
    expect((await verifier().verify({ badge: di, email: EMAIL })).status).toBe('indeterminate');
    expect((await verifier().verify({ badge: 'not a badge' })).status).toBe('invalid');
    expect((await verifier().verify({ badge: 42 })).status).toBe('invalid');
    expect((await verifier().verify({ badge: fixtures.cases['ob2-hosted-valid']!.submission.badge })).status).toBe(
      'indeterminate',
    );
    const none = parseJws(fixtures.cases['ob3-jwt-valid']!.submission.badge as string)!;
    const unsigned = `${Buffer.from(JSON.stringify({ ...none.header, alg: 'none' })).toString('base64url')}.${none.signingInput.split('.')[1]}.AA`;
    expect((await verifier().verify({ badge: unsigned, email: EMAIL })).status).toBe('invalid');
  });

  it('reuses a revocation list at most a day', async () => {
    let fetched = 0;
    let now = NOW;
    const docs = fromDocuments(fixtures.documents);
    const v = new BadgeVerifier({
      issuers: [ISSUER],
      fetch: (u) => {
        if (u.endsWith('/revocations')) fetched++;
        return docs(u);
      },
      now: () => now,
      cacheMs: 7 * 86_400_000,
    });
    const s = fixtures.cases['ob2-signed-valid']!.submission;
    await v.verify(s);
    await v.verify(s);
    expect(fetched).toBe(1);
    now += 86_400_001;
    await v.verify(s);
    expect(fetched).toBe(2);
  });
});

describe('the network policy', () => {
  it('knows the private, loopback and special ranges, v4 and v6', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      '::',
      'fe80::1',
      'fd00::1',
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
      '::7f00:1',
      '2001:0:4136:e378:8000:63bf:3fff:fdd2',
      '224.0.0.1',
      'not-an-ip',
    ])
      expect(isPublicAddress(ip), ip).toBe(false);
    for (const ip of ['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111', '::ffff:93.184.216.34'])
      expect(isPublicAddress(ip), ip).toBe(true);
  });

  it('refuses https-less, unlisted hosts, credentials, private answers; resolves once (no rebinding)', async () => {
    let asked = 0;
    const answers = [['93.184.216.34'], ['127.0.0.1']];
    const f = new SafeFetcher({
      hosts: ['badges.example.org', 'evil.example'],
      resolve: async () => answers[asked++]!,
      timeoutMs: 500,
    });
    expect(await f.get('http://badges.example.org/x')).toMatchObject({ ok: false, reason: 'https only' });
    expect(await f.get('https://other.example/x')).toMatchObject({ ok: false, reason: 'host not allowed' });
    expect(await f.get('https://u:p@badges.example.org/x')).toMatchObject({
      ok: false,
      reason: 'credentials in a URL',
    });
    expect(await f.get('https://127.0.0.1/x')).toMatchObject({ ok: false, reason: 'host not allowed' });
    const mixed = new SafeFetcher({ hosts: ['evil.example'], resolve: async () => ['93.184.216.34', '10.0.0.1'] });
    expect(await mixed.get('https://evil.example/x')).toMatchObject({ ok: false, reason: 'address not public' });
    const priv = new SafeFetcher({ hosts: ['evil.example'], resolve: async () => ['10.0.0.1'] });
    expect(await priv.get('https://evil.example/x')).toMatchObject({ ok: false, reason: 'address not public' });
    // The first answer is public: the connection goes there (and fails, offline), the second answer is never asked.
    await f.get('https://badges.example.org/x');
    expect(asked).toBe(1);
  });

  it('bounds redirects, size, depth and time', async () => {
    const { port } = await serve((req, res) => {
      if (req.url === '/r0') return res.writeHead(302, { Location: '/r1' }).end();
      if (req.url === '/r1') return res.writeHead(302, { Location: '/r2' }).end();
      if (req.url === '/r2') return res.writeHead(302, { Location: '/ok' }).end();
      if (req.url === '/ok') return res.writeHead(200).end('{"ok":true}');
      if (req.url === '/big') return res.writeHead(200).end(`"${'x'.repeat(70_000)}"`);
      if (req.url === '/deep') return res.writeHead(200).end(`${'['.repeat(9)}${']'.repeat(9)}`);
      if (req.url === '/slow') return void res.writeHead(200).write('{');
      res.writeHead(404).end();
    });
    const f = new SafeFetcher({
      hosts: ['local.test'],
      resolve: async () => ['127.0.0.1'],
      testing: { allowHttp: true, allowAddresses: ['127.0.0.1'] },
      timeoutMs: 300,
    });
    const at = (p: string) => `http://local.test:${port}${p}`;
    expect(await f.get(at('/r1'))).toMatchObject({ ok: true, json: { ok: true } });
    expect(await f.get(at('/r0'))).toMatchObject({ ok: false, reason: 'too many redirects' });
    expect(await f.get(at('/big'))).toMatchObject({ ok: false, reason: 'document over 64 KB' });
    expect(await f.get(at('/deep'))).toMatchObject({ ok: false, reason: 'JSON nested too deep' });
    expect(await f.get(at('/slow'))).toMatchObject({ ok: false, reason: 'timed out' });
    expect(jsonDepth({ a: [{ b: 1 }] }, 8)).toBe(3);
  });
});

describe('the cryptographic pieces', () => {
  it('round-trips base58 with leading zeros, reads did:key Ed25519 only', () => {
    const b = new Uint8Array([0, 0, 1, 2, 255]);
    expect(base58Decode(base58Encode(b))).toEqual(b);
    expect(base58Decode('0OIl')).toBeNull();
    expect(didKey(DID)?.asymmetricKeyType).toBe('ed25519');
    expect(didKey('did:web:example.org')).toBeNull();
    expect(hostsOf([ISSUER, DID, 'http://plain.example/x'])).toEqual(['badges.example.org']);
  });
});

describe('the badge form, end to end', () => {
  it('pairs, verifies, proposes the signal of the verdict once; the document never reaches the Bridge', async () => {
    const t = await startBridge();
    cleanup.push(() => t.close());
    const lines: string[] = [];
    const { ctx } = await contextFor(t, 'open-badge', { lines });
    const docs = fromDocuments(fixtures.documents);
    const c = new OpenBadgeConnector({ port: 0 });
    await c.start(ctx);
    cleanup.push(() => c.stop());
    // The connector's verifier fetches through its own SafeFetcher: swap its documents in for the test.
    (c as unknown as { verifier: BadgeVerifier }).verifier = new BadgeVerifier({ issuers: [ISSUER], fetch: docs });
    const post = (body: unknown) =>
      fetch(`http://127.0.0.1:${c.port}/v1/badges`, { method: 'POST', body: JSON.stringify(body) });
    const code = await t.code();
    const r = await post({ code, badge: fixtures.cases['ob2-hosted-valid']!.submission.badge, email: EMAIL });
    expect(await r.json()).toEqual({ status: 'valid', signal: 'accepted' });
    const { playerId } = (await (await fetch(new URL(`v1/pairings/${code}`, t.url))).json()) as { playerId: string };
    expect(t.count(playerId)).toBe(1);
    const entry = t.store.signals(playerId, 0)[0]!;
    expect(entry.payload?.signal).toBe('badge.valid');
    expect(JSON.stringify(entry)).not.toMatch(/badges\.example\.org|robin|sha256\$/);
    const expired = await post({
      code: await t.code(),
      badge: fixtures.cases['ob2-expired']!.submission.badge,
      email: EMAIL,
    });
    expect(await expired.json()).toEqual({ status: 'expired', signal: 'accepted' });
    expect((await post({ code: 'NOPE', badge: 'x' })).status).toBe(422);
    expect(
      (await fetch(`http://127.0.0.1:${c.port}/v1/badges`, { method: 'POST', body: 'x'.repeat(70_000) })).status,
    ).toBe(413);
    expect((await fetch(`http://127.0.0.1:${c.port}/v1/badges`, { method: 'POST', body: '{nope' })).status).toBe(400);
    expect(lines.join('\n')).not.toMatch(/robin|badges\.example\.org|assertions/);
  }, 30_000);
});
