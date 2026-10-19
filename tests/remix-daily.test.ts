// The daily challenge and the Mystery seed (4.1.15, D26): the Bridge's new module signs a day's seed and rules (24 h)
// and commits to a Mystery seed before revealing it; a player verifies both offline with the key the game's manifest
// names. The Bridge never chooses a seed after seeing actions: the day's seed depends on the day alone, a Mystery
// seed is fixed when its commitment is signed, and nothing a player sends afterwards moves either.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dailyRoutes, daySeed } from '../bridge/src/daily';
import { importBridgeKey } from '@engine/reality/protocol';
import { revealMatches, verifyCommitment, verifyDayToken } from '@engine/reality/daily';
import { compileVariant } from '@engine/core/remix/compile';
import { compileGameManifest } from '@engine/core/remix/apply';
import { game as reference } from '../games/reference/game';

const fixture = JSON.parse(readFileSync('tests/fixtures/reference-daily-key.json', 'utf8'));
const privateKey = () => crypto.subtle.importKey('jwk', fixture.jwk, { name: 'Ed25519' }, false, ['sign']);
const publicKey = () => importBridgeKey(reference.remix!.daily!.kid, reference.remix!.daily!.publicKey);
const T = Date.parse('2026-10-07T09:30:00Z');

async function bridge(now = T) {
  return dailyRoutes({
    games: { reference: { daily: 'daily', mystery: 'mystery' } },
    key: await privateKey(),
    kid: fixture.kid,
    secret: 'test-secret',
    now: () => now,
  });
}

describe('the daily challenge', () => {
  it("the reference's manifest names the published test key", () => {
    expect(reference.remix!.daily).toEqual({ kid: fixture.kid, publicKey: fixture.jwk.x, mode: 'daily' });
  });
  it('a signed day token, verified offline, gives everyone the same world', async () => {
    const b = await bridge();
    const r = (await b.handle({ method: 'GET', url: '/v1/daily?game=reference' }))!;
    expect(r.status).toBe(200);
    const token = (r.body as { token: string }).token;
    const v = await verifyDayToken(token, await publicKey(), 'reference', T);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.token).toMatchObject({
      date: '2026-10-07',
      mode: 'daily',
      seed: daySeed('test-secret', 'reference', '2026-10-07'),
    });
    const c = compileGameManifest(reference);
    const a = compileVariant(c, reference.remix!, v.token.seed, 1, 'daily');
    const again = compileVariant(c, reference.remix!, v.token.seed, 1, 'daily');
    expect(a.hash).toBe(again.hash);
    // The same token on every request of the day.
    expect(
      ((await b.handle({ method: 'GET', url: '/v1/daily?game=reference' }))!.body as { token: string }).token,
    ).toBe(token);
  });
  it('refuses a day not yet open, a token out of its window, another game, a forged token', async () => {
    const b = await bridge();
    expect((await b.handle({ method: 'GET', url: '/v1/daily?game=reference&date=2026-10-08' }))!.status).toBe(403);
    expect((await b.handle({ method: 'GET', url: '/v1/daily?game=nope' }))!.status).toBe(404);
    const token = ((await b.handle({ method: 'GET', url: '/v1/daily?game=reference' }))!.body as { token: string })
      .token;
    expect((await verifyDayToken(token, await publicKey(), 'reference', T + 2 * 86_400_000)).ok).toBe(false);
    expect((await verifyDayToken(token, await publicKey(), 'demo', T)).ok).toBe(false);
    const [h, p, s] = token.split('.');
    const payload = JSON.parse(Buffer.from(p!, 'base64url').toString());
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...payload, seed: 'WS-0000-0000' })).toString('base64url')}.${s}`;
    expect(await verifyDayToken(forged, await publicKey(), 'reference', T)).toEqual({
      ok: false,
      reason: 'bad signature',
    });
  });
});

describe('Mystery: commit, then reveal', () => {
  it('the reveal matches the signed commitment, the same every time', async () => {
    const b = await bridge();
    const r = (await b.handle({ method: 'POST', url: '/v1/commit', body: { game: 'reference' } }))!;
    expect(r.status).toBe(201);
    const { id, token } = r.body as { id: string; token: string };
    const c = await verifyCommitment(token, await publicKey(), 'reference');
    expect(c.ok).toBe(true);
    const reveal = (await b.handle({ method: 'GET', url: `/v1/reveal/${id}` }))!.body as {
      seed: string;
      nonce: string;
    };
    if (c.ok) expect(revealMatches(c.token, reveal)).toBe(true);
    expect((await b.handle({ method: 'GET', url: `/v1/reveal/${id}` }))!.body).toEqual({ id, ...reveal });
    expect((reveal as unknown as { revealedAt: number }).revealedAt).toBe(T);
    if (c.ok) expect(revealMatches(c.token, { ...reveal, nonce: 'x' })).toBe(false);
  });
  it('shopping for a Mystery seed is bounded: three commits per client, game and hour', async () => {
    const b = await bridge();
    const ask = (client: string) =>
      b.handle({ method: 'POST', url: '/v1/commit', body: { game: 'reference' }, client });
    for (let i = 0; i < 3; i++) expect((await ask('1.2.3.4'))!.status).toBe(201);
    expect((await ask('1.2.3.4'))!.status).toBe(429);
    expect((await ask('5.6.7.8'))!.status).toBe(201);
  });
  it('never chooses a seed after seeing actions: what a player sends later moves neither seed', async () => {
    const b = await bridge();
    const day0 = ((await b.handle({ method: 'GET', url: '/v1/daily?game=reference' }))!.body as { token: string })
      .token;
    const r = (await b.handle({ method: 'POST', url: '/v1/commit', body: { game: 'reference' } }))!;
    const { id } = r.body as { id: string };
    const before = (await b.handle({ method: 'GET', url: `/v1/reveal/${id}` }))!.body;
    // A run's actions, sent every way a client could: the module reads none of them.
    const actions = [{ act: { verb: 'take', a: 'token' } }, { travel: 'market' }];
    expect(await b.handle({ method: 'POST', url: '/v1/actions', body: { id, actions } })).toBeNull();
    await b.handle({
      method: 'POST',
      url: '/v1/commit',
      body: { game: 'reference', id, actions, seed: 'WS-0000-0000' },
    });
    await b.handle({
      method: 'GET',
      url: `/v1/daily?game=reference&seed=WS-0000-0000&actions=${encodeURIComponent(JSON.stringify(actions))}`,
    });
    expect((await b.handle({ method: 'GET', url: `/v1/reveal/${id}` }))!.body).toEqual(before);
    expect(
      ((await b.handle({ method: 'GET', url: '/v1/daily?game=reference' }))!.body as { token: string }).token,
    ).toBe(day0);
    // A second Bridge with the same secret signs the same day's seed: it is the day's, not the requests'.
    const other = await bridge(T + 3_600_000);
    const t2 = ((await other.handle({ method: 'GET', url: '/v1/daily?game=reference' }))!.body as { token: string })
      .token;
    const seedOf = (t: string) => JSON.parse(Buffer.from(t.split('.')[1]!, 'base64url').toString()).seed;
    expect(seedOf(t2)).toBe(seedOf(day0));
  });
});
