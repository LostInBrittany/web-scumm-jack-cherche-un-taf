// A Remix world travels with what is played in it (4.1.15, ADR 0018): the save envelope v4 carries the WorldVariant
// (a v3 save receives the story world), a load into another world is refused with that world to rebuild, the session
// records it and a replay rebuilds it from the stored assignment, as a speedrun package does; the speedrun categories
// keep their leaderboards apart and check the world against what the Bridge published.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Layout } from '@engine/core/types';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import {
  parseSave,
  SaveEnvelopeV4Schema,
  SaveWorldMismatch,
  saveEnvelope,
  savedWorld,
  upgradeEnvelope,
} from '@engine/core/save';
import { applyVariant, compileGameManifest } from '@engine/core/remix/apply';
import { compileVariant, storyVariant } from '@engine/core/remix/compile';
import {
  leaderboardKey,
  MYSTERY_START_WINDOW_MS,
  REMIX_CATEGORIES,
  seedCommitment,
  worldVerdict,
} from '@engine/core/remix/categories';
import { encodeSeedCode } from '@engine/core/remix/seed-code';
import { remixWorld } from '@engine/core/remix/apply';
import { solve } from '@engine/tools/solve';
import { replay } from '@engine/tools/replay';
import { variantOf } from '@engine/tools/remix';
import { game as demo } from '../games/demo/game';
import { commands } from '../games/demo/index';

const layouts: Record<string, Layout> = Object.fromEntries(
  readdirSync('games/demo/layout')
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(`games/demo/layout/${f}`, 'utf8'))]),
);
const c = compileGameManifest(demo);
const oranges = variantOf(c, 'remix', 1, { 'key-spot': 'market.oranges', 'oranges-line': 1 });
const world = applyVariant(demo, oranges);

describe('the save envelope v4', () => {
  it('a save of a Remix world carries it; loading it into another world names the world to rebuild', async () => {
    const e = new Engine(structuredClone(world), layouts, new FakePresenter(), new MemoryStore(), { commands });
    await e.checkpoint('market');
    const env = JSON.parse(JSON.stringify(saveEnvelope(world, e.state)));
    expect(SaveEnvelopeV4Schema.parse(env).variant.hash).toBe(oranges.hash);
    expect(savedWorld(env)).toEqual(oranges);
    expect(savedWorld({ meta: {}, envelope: env })).toEqual(oranges);
    let err: unknown;
    try {
      parseSave(demo, env);
    } catch (x) {
      err = x;
    }
    expect(err).toBeInstanceOf(SaveWorldMismatch);
    const rebuilt = applyVariant(demo, (err as SaveWorldMismatch).variant);
    expect(parseSave(rebuilt, env)).toEqual(e.state);
    expect(rebuilt.start.flags?.['remix.key-spot']).toBe('market.oranges');
  });
  it('the v3 → v4 migration gives a save made before Remix the story world', () => {
    const golden = JSON.parse(readFileSync('tests/fixtures/saves/demo-4.1.9.json', 'utf8'));
    const v4 = upgradeEnvelope(demo, golden.envelope);
    expect(v4.schema).toBe(4);
    expect(v4.variant).toEqual(storyVariant(demo.remix, remixWorld(demo)));
    expect(parseSave(demo, v4).room).toBe(golden.envelope.state.room);
    // …and a v3 save never loads silently into a Remix world.
    expect(() => parseSave(world, golden.envelope)).toThrow(SaveWorldMismatch);
  });
  it('a story save loads into the story world even after the manifest moved', async () => {
    const e = new Engine(structuredClone(demo), layouts, new FakePresenter(), new MemoryStore(), { commands });
    await e.checkpoint('market');
    const env = saveEnvelope(demo, e.state);
    const moved = structuredClone(demo);
    moved.remix = {
      ...moved.remix!,
      modes: [...moved.remix!.modes, { id: 'extra', strategy: 'catalogue', dimensions: [] }],
    };
    expect(env.variant.manifestHash).not.toBe(compileGameManifest(moved).hash);
    expect(parseSave(moved, env)).toEqual(e.state);
  });
  it('an old save reloads its exact assignment after a fictitious algorithmVersion 2', async () => {
    const e = new Engine(structuredClone(world), layouts, new FakePresenter(), new MemoryStore(), { commands });
    await e.checkpoint('market');
    const env = JSON.parse(JSON.stringify(saveEnvelope(world, e.state)));
    // The engine moved to a generator 2 (it would draw another world for the same seed): the save keeps its own.
    expect(() => compileVariant(c, demo.remix!, encodeSeedCode(1), 2)).toThrow(/unknown Remix algorithm version 2/);
    const back = applyVariant(demo, savedWorld(env)!);
    expect(back.variant!.assignments).toEqual(oranges.assignments);
    expect(back.variant!.algorithmVersion).toBe(1);
    expect(parseSave(back, env).flags).toEqual(e.state.flags);
  });
});

describe('replay and the speedrun package rebuild the same world', () => {
  it('the session records the world; a replay of it on the plain game rebuilds it and reaches the ending', async () => {
    const r = await solve(world, layouts, { commands, maxStates: 20000 });
    expect(r.status).toBe('solved');
    const e = new Engine(structuredClone(world), layouts, new FakePresenter(), new MemoryStore(), { commands });
    await e.checkpoint('market');
    expect(e.session?.variant).toEqual(oranges);
    // A speedrun package (4.1.14's envelope) holds the session's entries and the world; the verifier replays them.
    const pkg = JSON.parse(JSON.stringify({ format: 'web-scumm-speedrun', variant: oranges, entries: r.steps }));
    const p = await replay(
      demo,
      layouts,
      { start: { kind: 'new' }, log: pkg.entries, variant: pkg.variant },
      { commands },
    );
    expect(p.divergedAt).toBeUndefined();
    expect(p.ended).toBe(true);
    expect(p.state.flags['remix.key-spot']).toBe('market.oranges');
    expect(p.session.variant?.hash).toBe(oranges.hash);
    expect(p.state.flags.hidden_key_found).toBe(true);
    // Without its world the same inputs play another game (the seller hands the key over): the world is part of the run.
    const lost = await replay(demo, layouts, { start: { kind: 'new' }, log: pkg.entries }, { commands });
    expect(lost.state.flags.hidden_key_found).toBeUndefined();
    expect(lost.session.variant).toBeUndefined();
  }, 60_000);
});

describe('speedrun categories', () => {
  const story = storyVariant(demo.remix, remixWorld(demo));
  const v = compileVariant(c, demo.remix!, encodeSeedCode(77));
  it('Story, Fixed, Random, Mystery and Daily keep their leaderboards apart', () => {
    expect(worldVerdict(REMIX_CATEGORIES.story!, story)).toEqual([]);
    expect(worldVerdict(REMIX_CATEGORIES.story!, v)).not.toEqual([]);
    const fixed = { ...REMIX_CATEGORIES.fixed!, fixedSeed: v.seed };
    expect(worldVerdict(fixed, v)).toEqual([]);
    expect(worldVerdict({ ...fixed, fixedSeed: encodeSeedCode(78) }, v)).not.toEqual([]);
    expect(leaderboardKey('fixed', fixed, v)).toBe(`fixed:${v.seed}`);
    expect(leaderboardKey('random', REMIX_CATEGORIES.random!, v)).toBe('random');
    expect(worldVerdict(REMIX_CATEGORIES.daily!, { ...v, mode: 'daily' }, { dailySeed: v.seed })).toEqual([]);
    expect(
      worldVerdict(REMIX_CATEGORIES.daily!, { ...v, mode: 'daily' }, { dailySeed: encodeSeedCode(1) }),
    ).not.toEqual([]);
  });
  it('a Mystery run is valid only on the seed its commitment hid', () => {
    const m = { ...v, mode: 'mystery' };
    const commitment = seedCommitment(v.seed, 'n0nce');
    const times = { revealedAt: 1_000_000, runStartedAt: 1_010_000 };
    expect(
      worldVerdict(REMIX_CATEGORIES.mystery!, m, { commitment, reveal: { seed: v.seed, nonce: 'n0nce' }, ...times }),
    ).toEqual([]);
    expect(
      worldVerdict(REMIX_CATEGORIES.mystery!, m, { commitment, reveal: { seed: v.seed, nonce: 'other' }, ...times }),
    ).toEqual(['the revealed seed does not match the commitment']);
    // A run that starts long after its reveal had time to look at the world (and shop for another): refused.
    const late = { revealedAt: 1_000_000, runStartedAt: 1_000_000 + MYSTERY_START_WINDOW_MS + 1 };
    expect(
      worldVerdict(REMIX_CATEGORIES.mystery!, m, { commitment, reveal: { seed: v.seed, nonce: 'n0nce' }, ...late }),
    ).toEqual([expect.stringMatching(/starts within 60 s of its reveal/)]);
    expect(
      worldVerdict(REMIX_CATEGORIES.mystery!, m, { commitment, reveal: { seed: v.seed, nonce: 'n0nce' } }),
    ).toEqual(['a Mystery run needs the time of the reveal and of its start']);
  });
});
