// Daily and Mystery runs rest on the Bridge's signed tokens (4.1.16, ADR 0019, D26): a Daily run carries the day's
// token, a Mystery run the commitment signed before its start and the reveal signed after (signed since 4.1.16, so
// the time of the reveal is the Bridge's word). The verifier checks them with the key the game's manifest names; a
// Daily run is ranked under its day, a Mystery run without a server witness verifies but is not ranked.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dailyRoutes } from '../bridge/src/daily';
import { fingerprintGame } from '@engine/core/fingerprint';
import { MemoryChunkStore } from '@engine/core/journal-chunks';
import { applyVariant, compileGameManifest } from '@engine/core/remix/apply';
import { compileVariant, type WorldVariant } from '@engine/core/remix/compile';
import { encodeSeedCode } from '@engine/core/remix/seed-code';
import type { GameDef, Layout, SpeedrunCategory } from '@engine/core/types';
import { replay } from '@engine/tools/replay';
import { solve } from '@engine/tools/solve';
import type { SpeedrunWorldEvidence } from '@engine/tools/speedrun/envelope';
import { RunStartRefused, SpeedrunRecorder } from '@engine/tools/speedrun/recorder';
import { verifyRun } from '@engine/tools/speedrun/verify';
import { game as reference } from '../games/reference/game';

const layouts: Record<string, Layout> = Object.fromEntries(
  readdirSync('games/reference/layout')
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(`games/reference/layout/${f}`, 'utf8'))]),
);
const fixture = JSON.parse(readFileSync('tests/fixtures/reference-daily-key.json', 'utf8'));
const T = Date.parse('2026-10-07T09:30:00Z');
const ENGINE = 'test-engine';
const any = reference.speedrun!.categories.find((c) => c.id === 'any%')!;
const cat = (id: string, world: SpeedrunCategory['world']): SpeedrunCategory => ({ ...any, id, world });
const approved: GameDef = {
  ...reference,
  speedrun: {
    ...reference.speedrun!,
    categories: [
      ...reference.speedrun!.categories,
      cat('daily', { policy: 'daily', mode: 'daily' }),
      cat('mystery', { policy: 'mystery', mode: 'mystery' }),
    ],
  },
};
const fingerprint = await fingerprintGame(approved, { extensions: { trusted: 't' }, engine: ENGINE });
const ctx = () => ({ game: approved, layouts, fingerprint, engineVersion: ENGINE });
const c = compileGameManifest(approved);
const bridge = async (now = T) =>
  dailyRoutes({
    games: { reference: { daily: 'daily', mystery: 'mystery' } },
    key: await crypto.subtle.importKey('jwk', fixture.jwk, { name: 'Ed25519' }, false, ['sign']),
    kid: fixture.kid,
    secret: 'test-secret',
    now: () => now,
  });
const body = <T>(r: { body: unknown } | null) => r!.body as T;

async function record(categoryId: string, world: WorldVariant, evidence?: SpeedrunWorldEvidence) {
  const played = applyVariant(approved, world);
  const route = await solve(structuredClone(played), layouts, { maxStates: 200000 });
  expect(route.finished).toBe(true);
  const rec = new SpeedrunRecorder({
    engine: null as never,
    gameId: approved.id,
    manifest: approved.speedrun!,
    category: approved.speedrun!.categories.find((x) => x.id === categoryId)!,
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
    { seed: rec.seed, attach: (e) => rec.bind(e) },
  );
  return rec.seal();
}

describe('a Daily run', () => {
  it("carries the day's token, verifies offline and is ranked under its day", async () => {
    const b = await bridge();
    const token = body<{ token: string }>(await b.handle({ method: 'GET', url: '/v1/daily?game=reference' })).token;
    const seed = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))).seed as string;
    const world = compileVariant(c, approved.remix!, seed, 1, 'daily');
    const env = await record('daily', world, { kind: 'daily', token });
    const r = await verifyRun(env, ctx());
    expect(r).toMatchObject({ verdict: 'valid', world: { mode: 'daily', leaderboardKey: `daily:${world.seed}` } });
    // The day's seed in another mode under this day's token, a forged token, no token: refused.
    const other = compileVariant(c, approved.remix!, world.seed, 1, 'remix');
    const swapped = JSON.parse(JSON.stringify(env));
    swapped.variant = other;
    expect((await verifyRun(swapped, ctx())).code).toBe('world-policy');
    const forged = JSON.parse(JSON.stringify(env));
    forged.worldEvidence.token = `${token.slice(0, -4)}AAAA`;
    expect((await verifyRun(forged, ctx())).code).toBe('daily-proof-invalid');
    const bare = JSON.parse(JSON.stringify(env));
    delete bare.worldEvidence;
    expect((await verifyRun(bare, ctx())).code).toBe('daily-proof-missing');
    // Another day's token (another seed) with this day's world, a token of another game: refused.
    const yesterday = body<{ token: string }>(
      await (await bridge(T - 86_400_000)).handle({ method: 'GET', url: '/v1/daily?game=reference' }),
    ).token;
    const crossed = JSON.parse(JSON.stringify(env));
    crossed.worldEvidence.token = yesterday;
    expect((await verifyRun(crossed, ctx())).code).toBe('world-policy');
    // The day's end travels with the verdict: the Bridge ranks a run submitted after it as practice.
    expect(r.world?.validUntil).toBe(Date.parse('2026-10-08T00:00:00Z'));
  }, 120_000);

  it('a recorder refuses to start a Daily run without its token', async () => {
    const world = compileVariant(c, approved.remix!, encodeSeedCode(8), 1, 'daily');
    const rec = new SpeedrunRecorder({
      engine: null as never,
      gameId: approved.id,
      manifest: approved.speedrun!,
      category: approved.speedrun!.categories.find((x) => x.id === 'daily')!,
      variant: world,
      store: new MemoryChunkStore(),
      fingerprint,
      engineVersion: ENGINE,
    });
    await expect(rec.prepare()).rejects.toBeInstanceOf(RunStartRefused);
  });
});

describe('a Mystery run', () => {
  async function mystery(startedAfterMs: number) {
    const b = await bridge();
    const commit = body<{ id: string; token: string }>(
      await b.handle({ method: 'POST', url: '/v1/commit', body: { game: 'reference' }, client: 'c1' }),
    );
    const rev = body<{ seed: string; revealedAt: number; token: string }>(
      await b.handle({ method: 'GET', url: `/v1/reveal/${commit.id}` }),
    );
    const world = compileVariant(c, approved.remix!, rev.seed, 1, 'mystery');
    const evidence = {
      kind: 'mystery' as const,
      commitmentToken: commit.token,
      revealToken: rev.token,
      startedAt: rev.revealedAt + startedAfterMs,
    };
    return { env: await record('mystery', world, evidence), commit, rev };
  }

  it('verifies on the revealed seed, and is not ranked without a server witness', async () => {
    const { env } = await mystery(5_000);
    const r = await verifyRun(env, ctx());
    expect(r).toMatchObject({ verdict: 'valid-unranked', code: 'mystery-unwitnessed', trust: 'replay-valid' });
    expect(r.world?.leaderboardKey).toBe('mystery');
  }, 120_000);

  it('refuses a reveal of another commitment and a start long after the reveal', async () => {
    const { env } = await mystery(5_000);
    const other = await mystery(5_000);
    const crossed = JSON.parse(JSON.stringify(env));
    crossed.worldEvidence.revealToken = other.rev.token;
    expect((await verifyRun(crossed, ctx())).code).toBe('mystery-reveal');
    const late = await mystery(61_000);
    // A commitment for another mode cannot back a world of this one.
    const otherMode = JSON.parse(JSON.stringify(env));
    const b = await dailyRoutes({
      games: { reference: { daily: 'daily', mystery: 'remix' } },
      key: await crypto.subtle.importKey('jwk', fixture.jwk, { name: 'Ed25519' }, false, ['sign']),
      kid: fixture.kid,
      secret: 'test-secret',
      now: () => T,
    });
    const c2 = body<{ id: string; token: string }>(
      await b.handle({ method: 'POST', url: '/v1/commit', body: { game: 'reference' }, client: 'c2' }),
    );
    otherMode.worldEvidence.commitmentToken = c2.token;
    expect((await verifyRun(otherMode, ctx())).code).toBe('mystery-commitment');
    expect((await verifyRun(late.env, ctx())).code).toBe('mystery-start-window');
  }, 240_000);
});
