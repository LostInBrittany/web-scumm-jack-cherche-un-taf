// What a verifier refuses of a run's world, one alteration at a time (4.1.16, ADR 0019, the speedrun mutation set):
// a Daily and a Mystery run of the reference recorded once, then each changed in one place and verified again. The
// evidence's shape, its tokens (another mode, another algorithm version, a forged commitment), a Bridge token on a run
// that takes none, a world of another version of the game, a seed that makes no world, a run of another game, a field
// the envelope does not have. Each refusal names its code; nothing here is replayed twice.
import { readdirSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { dailyRoutes } from '../bridge/src/daily';
import { fingerprintGame } from '@engine/core/fingerprint';
import { MemoryChunkStore } from '@engine/core/journal-chunks';
import { applyVariant, compileGameManifest } from '@engine/core/remix/apply';
import { compileVariant, type WorldVariant } from '@engine/core/remix/compile';
import { variantHash } from '@engine/core/remix/story';
import type { GameDef, Layout } from '@engine/core/types';
import { b64url } from '@engine/reality/protocol';
import { replay } from '@engine/tools/replay';
import { solve } from '@engine/tools/solve';
import { exportEnvelope, type SpeedrunEnvelopeV2, type SpeedrunWorldEvidence } from '@engine/tools/speedrun/envelope';
import { SpeedrunRecorder } from '@engine/tools/speedrun/recorder';
import { verifyRun } from '@engine/tools/speedrun/verify';
import { game as reference } from '../games/reference/game';

const layouts: Record<string, Layout> = Object.fromEntries(
  readdirSync('games/reference/layout')
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(`games/reference/layout/${f}`, 'utf8'))]),
);
const fixture = JSON.parse(readFileSync('tests/fixtures/reference-daily-key.json', 'utf8'));
const ENGINE = 'test-engine';
const T = Date.parse('2026-10-08T09:00:00Z');
const c = compileGameManifest(reference);
let fingerprint: Awaited<ReturnType<typeof fingerprintGame>>;
const ctx = (game: GameDef = reference) => ({ game, layouts, fingerprint, engineVersion: ENGINE });
const priv = () => crypto.subtle.importKey('jwk', fixture.jwk, { name: 'Ed25519' }, false, ['sign']);
async function sign(payload: unknown): Promise<string> {
  const enc = (o: unknown) => b64url.encode(new TextEncoder().encode(JSON.stringify(o)));
  const h = enc({ alg: 'EdDSA', kid: fixture.kid });
  const p = enc(payload);
  const s = new Uint8Array(
    await crypto.subtle.sign({ name: 'Ed25519' }, await priv(), new TextEncoder().encode(`${h}.${p}`)),
  );
  return `${h}.${p}.${b64url.encode(s)}`;
}
const payloadOf = (jws: string) => JSON.parse(new TextDecoder().decode(b64url.decode(jws.split('.')[1]!)));

async function record(categoryId: string, world: WorldVariant, evidence?: SpeedrunWorldEvidence) {
  const played = applyVariant(reference, world);
  const route = await solve(structuredClone(played), layouts, { maxStates: 200000 });
  const rec = new SpeedrunRecorder({
    engine: null as never,
    gameId: reference.id,
    manifest: reference.speedrun!,
    category: reference.speedrun!.categories.find((x) => x.id === categoryId)!,
    variant: world,
    ...(evidence ? { worldEvidence: evidence } : {}),
    store: new MemoryChunkStore(),
    fingerprint,
    engineVersion: ENGINE,
    now: () => 0,
  });
  await rec.prepare();
  await replay(
    played,
    layouts,
    { start: { kind: 'new' }, log: route.steps.map(({ rnd: _, ...s }) => s) },
    {
      seed: rec.seed,
      attach: (e) => rec.bind(e),
    },
  );
  return JSON.parse(exportEnvelope(await rec.seal())) as SpeedrunEnvelopeV2 & Record<string, unknown>;
}

let daily: SpeedrunEnvelopeV2 & Record<string, unknown>;
let mystery: SpeedrunEnvelopeV2 & Record<string, unknown>;
let fixed: SpeedrunEnvelopeV2 & Record<string, unknown>;
beforeAll(async () => {
  fingerprint = await fingerprintGame(reference, { extensions: { trusted: 't' }, engine: ENGINE });
  const b = dailyRoutes({
    games: { reference: { daily: 'daily', mystery: 'mystery' } },
    key: await priv(),
    kid: fixture.kid,
    secret: 's',
    now: () => T,
  });
  const token = ((await b.handle({ method: 'GET', url: '/v1/daily?game=reference' }))!.body as { token: string }).token;
  daily = await record('daily', compileVariant(c, reference.remix!, payloadOf(token).seed, 1, 'daily'), {
    kind: 'daily',
    token,
  });
  const commit = (await b.handle({ method: 'POST', url: '/v1/commit', body: { game: 'reference' }, client: 'x' }))!
    .body as { id: string; token: string };
  const rev = (await b.handle({ method: 'GET', url: `/v1/reveal/${commit.id}` }))!.body as {
    seed: string;
    revealedAt: number;
    token: string;
  };
  mystery = await record('mystery', compileVariant(c, reference.remix!, rev.seed, 1, 'mystery'), {
    kind: 'mystery',
    commitmentToken: commit.token,
    revealToken: rev.token,
    startedAt: rev.revealedAt + 1000,
  });
  const fixedSeed = reference.speedrun!.categories.find((x) => x.id === 'remix-fixed')!.world!.fixedSeed!;
  fixed = await record('remix-fixed', compileVariant(c, reference.remix!, fixedSeed, 1, 'remix'));
}, 180_000);

const clone = <T>(x: T): T & Record<string, unknown> => JSON.parse(JSON.stringify(x));
const codeOf = async (env: unknown, game?: GameDef) => (await verifyRun(env, ctx(game))).code;
const rehash = (v: WorldVariant, o: Partial<WorldVariant>): WorldVariant => {
  const { hash: _, ...body } = { ...v, ...o };
  return { ...body, hash: variantHash(body) };
};

describe('the envelope and its evidence', () => {
  it('the three recorded runs verify', async () => {
    expect((await verifyRun(daily, ctx())).verdict).toBe('valid');
    expect((await verifyRun(mystery, ctx())).verdict).toBe('valid-unranked');
    expect((await verifyRun(fixed, ctx())).verdict).toBe('valid');
  });
  it('refuses a field the envelope does not have, a run seed of another type, a run of another game', async () => {
    const extra = clone(daily);
    extra.comment = 'hello';
    expect(await codeOf(extra)).toBe('envelope-shape');
    const seed = clone(daily);
    (seed as Record<string, unknown>).runSeed = 7;
    expect(await codeOf(seed)).toBe('envelope-shape');
    const v1seed = clone(daily);
    (v1seed as Record<string, unknown>).seed = 'x';
    expect(await codeOf(v1seed)).toBe('envelope-shape');
    const other = clone(daily);
    other.gameId = 'demo';
    expect(await codeOf(other)).toBe('fingerprint');
  });
  it('refuses evidence of the wrong shape, whatever is wrong with it', async () => {
    const shapes: unknown[] = [
      null,
      'token',
      { kind: 'weekly', token: 'x' },
      { kind: 'daily' },
      { kind: 'daily', token: 'x', extra: 1 },
      { kind: 'daily', token: 'x'.repeat(4097) },
      { kind: 'mystery', commitmentToken: 'a', revealToken: 'b' },
      { kind: 'mystery', commitmentToken: 'a', revealToken: 'b', startedAt: 1.5 },
      { kind: 'mystery', commitmentToken: 'a'.repeat(4097), revealToken: 'b', startedAt: 1 },
      { kind: 'mystery', commitmentToken: 'a', revealToken: 7, startedAt: 1 },
    ];
    for (const e of shapes) {
      const env = clone(daily);
      env.worldEvidence = e as never;
      expect(await codeOf(env), JSON.stringify(e)?.slice(0, 60)).toBe('world-shape');
    }
  });
  it('refuses a Bridge token on a run that takes none, and a Daily or Mystery run without its tokens', async () => {
    const env = clone(fixed);
    env.worldEvidence = daily.worldEvidence;
    expect(await codeOf(env)).toBe('world-shape');
    const bare = clone(mystery);
    delete bare.worldEvidence;
    expect(await codeOf(bare)).toBe('mystery-commitment');
    const crossed = clone(mystery);
    crossed.worldEvidence = daily.worldEvidence;
    expect(await codeOf(crossed)).toBe('mystery-commitment');
  });
});

describe("the tokens' content", () => {
  it('refuses a day token for another mode or another algorithm version, signed all the same', async () => {
    const p = payloadOf((daily.worldEvidence as { token: string }).token);
    for (const [change, code] of [
      [{ mode: 'remix' }, 'world-policy'],
      [{ rules: { category: 'daily', algorithmVersion: 2 } }, 'daily-proof-invalid'],
    ] as const) {
      const env = clone(daily);
      env.worldEvidence = { kind: 'daily', token: await sign({ ...p, ...change }) };
      expect(await codeOf(env), JSON.stringify(change)).toBe(code);
    }
  });
  it('refuses a forged commitment and a commitment for another mode', async () => {
    const e = mystery.worldEvidence as Extract<SpeedrunWorldEvidence, { kind: 'mystery' }>;
    const forged = clone(mystery);
    forged.worldEvidence = { ...e, commitmentToken: `${e.commitmentToken.slice(0, -4)}AAAA` };
    expect(await codeOf(forged)).toBe('mystery-commitment');
    const p = payloadOf(e.commitmentToken);
    const otherMode = clone(mystery);
    otherMode.worldEvidence = { ...e, commitmentToken: await sign({ ...p, mode: 'remix' }) };
    expect(await codeOf(otherMode)).toBe('mystery-commitment');
  });
});

describe('the world', () => {
  it('refuses a world of another version of the game, and a seed that makes no world', async () => {
    const stale = clone(fixed);
    stale.variant = rehash(fixed.variant, { manifestHash: 'f'.repeat(64) });
    expect(await codeOf(stale)).toBe('world-stale');
    const badSeed = clone(fixed);
    badSeed.variant = rehash(fixed.variant, { seed: 'WS-0000-0008' });
    expect(await codeOf(badSeed)).toBe('world-forged');
    const unknown = clone(fixed);
    unknown.variant = rehash(fixed.variant, { algorithm: 'other-1' });
    expect(await codeOf(unknown)).toBe('world-shape');
  });
  it('a Fixed category draws its run from its own seed: another run seed is refused', async () => {
    const env = clone(fixed);
    env.runSeed = 'fixed:remix-fixed';
    // remix-fixed's run seed is random (its `seed` field is absent): a fixed one is a run that names its seed, and the
    // chain then fails on the head.
    expect(await codeOf(env)).toBe('chain');
  });
});
