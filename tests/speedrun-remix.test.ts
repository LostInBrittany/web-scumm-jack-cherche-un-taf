// A run is bound to the world it was played in (4.1.16 "Convergence", ADR 0019, D29): a speedrun recorded in a Remix
// world carries that exact world in its `.wsrun` (schema 2), sealed into `h0`; the verifier rebuilds it on the
// approved game before the replay and ranks the run under the world's leaderboard key. 4.1.15 replayed the base game:
// a run in the oranges world (the key under the oranges) could not verify there. Schema 1 stays readable as Story.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fingerprintGame } from '@engine/core/fingerprint';
import { MemoryChunkStore } from '@engine/core/journal-chunks';
import { applyVariant, compileGameManifest, remixWorld } from '@engine/core/remix/apply';
import { compileVariant, storyVariant, type WorldVariant } from '@engine/core/remix/compile';
import { variantHash } from '@engine/core/remix/story';
import { encodeSeedCode } from '@engine/core/remix/seed-code';
import type { GameDef, Layout, SpeedrunCategory } from '@engine/core/types';
import { replay } from '@engine/tools/replay';
import { solve } from '@engine/tools/solve';
import { exportEnvelope, type SpeedrunEnvelopeV2 } from '@engine/tools/speedrun/envelope';
import { SpeedrunRecorder } from '@engine/tools/speedrun/recorder';
import { verifyRun, type VerifyContext } from '@engine/tools/speedrun/verify';
import { validate } from '@engine/tools/validate';
import { game as demo } from '../games/demo/game';
import { commands } from '../games/demo/index';

const layouts: Record<string, Layout> = Object.fromEntries(
  readdirSync('games/demo/layout')
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(`games/demo/layout/${f}`, 'utf8'))]),
);
const ENGINE = 'test-engine';
const base = (o: Partial<SpeedrunCategory>): SpeedrunCategory => ({
  id: 'any%',
  name: 'Any%',
  timing: 'igt',
  start: { event: 'sessionStarted', session: 'new' },
  finish: { event: 'endingReached' },
  allowSaves: true,
  allowPauses: true,
  allowHints: true,
  reload: 'invalidates',
  realityPolicy: 'forbidden',
  fingerprint: ['logic', 'trustedExtensions'],
  inputs: { mouse: true, touch: true, keyboard: true, gamepad: true, macros: 'forbidden' },
  ...o,
});
const c = compileGameManifest(demo);
/** The first seed whose world puts the key under the oranges (the demo's `remix` mode is a catalogue of three). */
const seedOf = (spot: string) => {
  for (let i = 1; i < 500; i++) {
    const v = compileVariant(c, demo.remix!, encodeSeedCode(i), 1, 'remix');
    if (v.assignments['key-spot'] === spot) return v;
  }
  throw new Error(`no seed puts the key at ${spot}`);
};
const oranges = seedOf('market.oranges');
const lantern = seedOf('market.lantern');
const story = storyVariant(demo.remix, remixWorld(demo));
/** The approved game: the demo with a speedrun manifest (Story, Fixed on the oranges world, Random). */
const approved: GameDef = {
  ...demo,
  speedrun: {
    rulesVersion: 1,
    splits: [],
    categories: [
      base({ id: 'story' }),
      base({ id: 'fixed-oranges', world: { policy: 'fixed', mode: 'remix', fixedSeed: oranges.seed } }),
      base({ id: 'random', world: { policy: 'random', mode: 'remix' } }),
    ],
  },
};
const fingerprint = await fingerprintGame(approved, { extensions: { trusted: 'trusted' }, engine: ENGINE });
const ctx = (): VerifyContext => ({ game: approved, layouts, commands, fingerprint, engineVersion: ENGINE });

/** Records the solver's route of `world` as a run of `categoryId`, played on the game that world makes. */
async function record(categoryId: string, world: WorldVariant): Promise<SpeedrunEnvelopeV2> {
  const played = applyVariant(approved, world);
  const route = await solve(structuredClone(played), layouts, { commands, maxStates: 20000 });
  expect(route.status).toBe('solved');
  const rec = new SpeedrunRecorder({
    engine: null as never,
    gameId: approved.id,
    manifest: approved.speedrun!,
    category: approved.speedrun!.categories.find((x) => x.id === categoryId)!,
    variant: world,
    store: new MemoryChunkStore(),
    fingerprint,
    engineVersion: ENGINE,
    now: () => 0,
  });
  await rec.prepare();
  const r = await replay(
    played,
    layouts,
    { start: { kind: 'new' }, log: route.steps.map(({ rnd: _, ...s }) => s) },
    { commands, seed: rec.seed, attach: (e) => rec.bind(e) },
  );
  expect(r.ended).toBe(true);
  return (await rec.seal()) as SpeedrunEnvelopeV2;
}
const clone = <T>(e: T) => JSON.parse(exportEnvelope(e as never)) as T & Record<string, unknown>;

describe('a run in a Remix world', () => {
  it('carries its world (schema 2) and verifies on the approved game, ranked under that world', async () => {
    const env = await record('fixed-oranges', oranges);
    expect(env.schema).toBe(2);
    expect(env.variant.hash).toBe(oranges.hash);
    expect(env.runSeed).toMatch(/^[0-9a-f]{32,}$/); // the run's generator: a fresh seed (the category's `seed` is random)
    const r = await verifyRun(exportEnvelope(env), ctx());
    expect(r).toMatchObject({ verdict: 'valid', code: 'ok', trust: 'replay-valid' });
    expect(r.world).toEqual({
      hash: oranges.hash,
      mode: 'remix',
      seed: oranges.seed,
      leaderboardKey: `fixed-oranges:${oranges.seed}`,
    });
  }, 60_000);

  it('the same inputs in another world are another run: another h0, refused before the replay', async () => {
    const a = await record('random', oranges);
    const b = await record('random', lantern);
    expect(a.h0).not.toBe(b.h0);
    const swapped = clone(a);
    swapped.variant = lantern;
    expect(await verifyRun(swapped, ctx())).toMatchObject({ verdict: 'invalid-replay', code: 'chain' });
    const forged = clone(a);
    forged.variant = { ...oranges, assignments: { ...oranges.assignments, 'key-spot': 'market.lantern' } };
    expect(await verifyRun(forged, ctx())).toMatchObject({ verdict: 'invalid-replay', code: 'world-hash' });
    const shapeless = clone(a);
    delete (shapeless as Record<string, unknown>).variant;
    expect(await verifyRun(shapeless, ctx())).toMatchObject({ code: 'world-missing' });
    // Random ranks every world of its mode together.
    const r = await verifyRun(a, ctx());
    expect(r.world?.leaderboardKey).toBe('random');
  }, 120_000);

  it('a world the category does not allow is refused (a Fixed run on another seed, a Story run in Remix)', async () => {
    const env = await record('fixed-oranges', oranges);
    const other = await record('random', lantern);
    const moved = clone(other);
    moved.categoryId = 'fixed-oranges';
    expect(await verifyRun(moved, ctx())).toMatchObject({ verdict: 'invalid-category-rule', code: 'world-policy' });
    const inStory = clone(env);
    inStory.categoryId = 'story';
    expect(await verifyRun(inStory, ctx())).toMatchObject({ verdict: 'invalid-category-rule', code: 'world-policy' });
  }, 120_000);

  it('a Story run is schema 2 too, in the story world, ranked under its category', async () => {
    const env = await record('story', story);
    expect(env.variant.mode).toBe('story');
    const r = await verifyRun(env, ctx());
    expect(r).toMatchObject({ verdict: 'valid', world: { mode: 'story', seed: 'story', leaderboardKey: 'story' } });
  }, 60_000);

  it('the recorder refuses to start a run the category cannot rank (no ranked run found invalid at the finish)', async () => {
    const rec = new SpeedrunRecorder({
      engine: null as never,
      gameId: approved.id,
      manifest: approved.speedrun!,
      category: approved.speedrun!.categories.find((x) => x.id === 'fixed-oranges')!,
      variant: lantern,
      store: new MemoryChunkStore(),
      fingerprint,
      engineVersion: ENGINE,
    });
    await expect(rec.prepare()).rejects.toThrow(/Fixed run is played on/);
  });
});

describe('a world is authenticated, not only checked for integrity (second reading of PR #60)', () => {
  // The attacker the hash does not stop: one who rehashes a world and reseals the whole run with the public tools.
  const rehash = (v: WorldVariant, o: Partial<WorldVariant>): WorldVariant => {
    const { hash: _, ...body } = { ...v, ...o };
    return { ...body, hash: variantHash(body) };
  };
  it('the lantern world relabelled with the oranges seed, rehashed and resealed, is refused: the seed does not make it', async () => {
    const forged = rehash(lantern, { seed: oranges.seed });
    const env = await record('fixed-oranges', forged);
    expect(await verifyRun(env, ctx())).toMatchObject({ verdict: 'invalid-replay', code: 'world-forged' });
  }, 60_000);
  it('a Remix world labelled as the story world, and a world of an unknown algorithm version, are refused', async () => {
    const fakeStory = rehash(oranges, { seed: 'story', mode: 'story' });
    expect(await verifyRun(await record('story', fakeStory), ctx())).toMatchObject({ code: 'world-forged' });
    const future = rehash(oranges, { algorithmVersion: 99 });
    expect(await verifyRun(await record('random', future), ctx())).toMatchObject({ code: 'world-algorithm' });
  }, 120_000);
});

describe("the validator reads a category's world", () => {
  const withCats = (...categories: SpeedrunCategory[]): GameDef => ({
    ...demo,
    speedrun: { rulesVersion: 1, splits: [], categories },
  });
  const said = (g: GameDef) => {
    const r = validate(g, layouts);
    return {
      errors: r.errors.filter((e) => e.includes('speedrun')),
      warnings: r.warnings.filter((e) => e.includes('speedrun')),
    };
  };
  it('accepts the approved categories', () => {
    expect(said(approved).errors).toEqual([]);
  });
  it('refuses a world it cannot give a meaning to', () => {
    const { errors } = said(
      withCats(
        base({ id: 'a', world: { policy: 'fixed', mode: 'remix' } }),
        base({ id: 'b', world: { policy: 'fixed', mode: 'remix', fixedSeed: 'WS-0000-0008' } }),
        base({ id: 'c', world: { policy: 'random', mode: 'nowhere' } }),
        base({ id: 'd', world: { policy: 'story', mode: 'remix' } }),
        base({ id: 'e', world: { policy: 'daily', mode: 'remix' } }),
        base({ id: 'f', seed: 'daily', world: { policy: 'random', mode: 'remix' } }),
      ),
    );
    for (const m of [
      'publishes its seed',
      'fixedSeed: the check symbol',
      'unknown Remix mode: "nowhere"',
      'a Story category plays the story world',
      'needs `remix.daily`',
      "`seed` is the run's generator",
    ])
      expect(
        errors.some((x) => x.includes(m)),
        m,
      ).toBe(true);
  });
  it("warns that 4.1.15's seed: 'mystery' is read as a world", () => {
    const g = withCats(base({ id: 'm', seed: 'mystery' }));
    expect(said(g).warnings.some((w) => w.includes("4.1.15's form"))).toBe(true);
  });
});
