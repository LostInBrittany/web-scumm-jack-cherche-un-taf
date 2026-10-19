// The solver's partial-order reduction: the same answers as the plain search, fewer engine runs where actions commute.
import { describe, expect, it } from 'vitest';
import type { GameDef, Layout } from '@engine/core/types';
import { solve, type SolveOptions, type SolveResult } from '@engine/tools/solve';
import { makeStressGame } from '@engine/tools/stress';
import { game as demo } from '../games/demo/game';
import { commands } from '../games/demo/index';
import house from '../games/demo/layout/house.json';
import garden from '../games/demo/layout/garden.json';
import market from '../games/demo/layout/market.json';
import {
  dott,
  dottLayouts,
  grog,
  grogLayouts,
  insults,
  insultsLayouts,
  mansion,
  mansionLayouts,
  stan,
  stanLayouts,
} from './fixtures/classics';
import { pickups, pickupsLayouts, trials, trialsLayouts, trap } from './fixtures/por';
import { world, worldLayouts } from './fixtures/world';
import { cast, castLayouts } from './fixtures/cast';

const demoLayouts: Record<string, Layout> = {
  house: house as unknown as Layout,
  garden: garden as unknown as Layout,
  market: market as unknown as Layout,
};
const same = (a: SolveResult, b: SolveResult) => {
  expect(b.finished).toBe(a.finished);
  expect(b.flagsReached).toEqual(a.flagsReached);
  expect(b.roomsReached).toEqual(a.roomsReached);
  expect(b.unlockedReached).toEqual(a.unlockedReached);
  expect(b.unusedItems).toEqual(a.unusedItems);
  expect(b.broken).toEqual(a.broken);
  expect(b.states).toBe(a.states);
};

describe('sleep sets give the same answers', () => {
  const stress = makeStressGame({ rooms: 10, players: 2, items: 12, flags: 30, npcs: 2, scripts: 4, topics: 6 });
  const games: [string, GameDef, Record<string, Layout>, Partial<SolveOptions>][] = [
    ['insults', insults(), insultsLayouts, {}],
    ['grog', grog(), grogLayouts, {}],
    ['dott', dott(), dottLayouts, {}],
    ['mansion', mansion(), mansionLayouts, {}],
    ['stan', stan(), stanLayouts, {}],
    ['world', world(), worldLayouts, {}],
    ['cast', cast(), castLayouts, {}],
    ['trials', trials(), trialsLayouts, {}],
    ['pickups 4 (dead end)', pickups(4, false), pickupsLayouts, {}],
    ['stress 10 rooms', stress.game, stress.layouts, { maxStates: 5000 }],
    ['demo', structuredClone(demo), demoLayouts, { commands }],
  ];
  for (const [name, game, layouts, o] of games)
    it(name, async () => {
      const plain = await solve(structuredClone(game), layouts, { ...o, por: false, memo: false });
      const sleep = await solve(structuredClone(game), layouts, { ...o, por: 'sleep' });
      same(plain, sleep);
      expect(sleep.profile.tries).toBeLessThanOrEqual(plain.profile.tries);
      // Stubborn sets explore fewer states: the proof is the same, the counts are not.
      const stubborn = await solve(structuredClone(game), layouts, { ...o, por: 'stubborn' });
      expect(stubborn.finished).toBe(plain.finished);
      expect(stubborn.broken).toEqual(plain.broken);
      expect(stubborn.states).toBeLessThanOrEqual(plain.states);
      expect(stubborn.profile.tries).toBeLessThanOrEqual(plain.profile.tries);
    });
});

describe('what the reduction saves', () => {
  it('k independent pickups before a door that can never open: every subset is a state, but far fewer runs', async () => {
    const k = 6;
    const plain = await solve(pickups(k, false), pickupsLayouts, { por: false, memo: false });
    const sleep = await solve(pickups(k, false), pickupsLayouts, { por: 'sleep' });
    expect(plain.finished).toBe(false);
    expect(plain.states).toBe(2 ** k);
    expect(sleep.states).toBe(2 ** k);
    expect(plain.profile.tries).toBeGreaterThan(k * 2 ** (k - 1));
    expect(sleep.profile.slept).toBeGreaterThan(0);
    expect(sleep.profile.tries).toBeLessThan(plain.profile.tries);
    // one pickup at a time: k + 1 states, k·(k+1)/2 + k + 1 runs, instead of 2^k states
    const stubborn = await solve(pickups(k, false), pickupsLayouts, { por: 'stubborn' });
    expect(stubborn.finished).toBe(false);
    expect(stubborn.states).toBe(k + 1);
    expect(stubborn.profile.postponed).toBeGreaterThan(0);
    expect(stubborn.profile.tries).toBeLessThan(plain.profile.tries / 4);
  });
  it('the three trials: one order instead of six', async () => {
    const plain = await solve(trials(), trialsLayouts, { por: false, memo: false });
    const stubborn = await solve(trials(), trialsLayouts, { por: 'stubborn' });
    expect(stubborn.finished).toBe(true);
    expect(stubborn.states).toBeLessThan(plain.states);
    expect(stubborn.path).toHaveLength(4);
  });
  it('the finishable variant ends in k + 1 steps either way', async () => {
    const r = await solve(pickups(5), pickupsLayouts, { por: 'sleep' });
    expect(r.finished).toBe(true);
    expect(r.path.length).toBe(6);
  });
});

describe('proof mode', () => {
  it('reaches the same verdict as the plain search, with the reduction off', async () => {
    const { pickups, pickupsLayouts } = await import('./fixtures/por');
    const g = pickups(4, true);
    const plain = await solve(g, pickupsLayouts, {});
    const proof = await solve(g, pickupsLayouts, { mode: 'prove', por: 'stubborn' });
    expect(proof.mode).toBe('prove');
    expect(proof.finished).toBe(plain.finished);
    expect(proof.broken).toEqual(plain.broken);
    expect(proof.profile.postponed).toBe(0);
    expect(proof.profile.slept).toBe(0);
    expect(proof.states).toBeGreaterThanOrEqual(plain.states);
  });
});

describe('proof mode: the differential suite', () => {
  // The reductions have no proof of equivalence for softlock detection; this is the evidence, fixture by fixture.
  // The verdicts must agree with the plain exhaustive search; the state counts may not (stubborn sets visit fewer).
  const stress = makeStressGame({ rooms: 8, players: 2, items: 10, flags: 20, npcs: 1, scripts: 2, topics: 4 });
  const games: [string, GameDef, Record<string, Layout>, Partial<SolveOptions>][] = [
    ['grog', grog(), grogLayouts, {}],
    ['stan', stan(), stanLayouts, {}],
    ['trials', trials(), trialsLayouts, {}],
    ['pickups 4', pickups(4, true), pickupsLayouts, {}],
    ['pickups 4 (dead end)', pickups(4, false), pickupsLayouts, {}],
    ['trap 3 (a commuting softlock)', trap(3), pickupsLayouts, {}],
    ['stress 8 rooms', stress.game, stress.layouts, { maxStates: 20000 }],
    ['demo', structuredClone(demo), demoLayouts, { commands }],
  ];
  // Sleep sets drop edges, and the reverse reachability that classifies softlocks reads the edges: on three of the
  // eight fixtures they invent softlocks. Recorded here as the evidence that keeps them out of proof mode.
  const SLEEP_AGREES: Record<string, boolean> = {
    grog: true,
    stan: true,
    trials: false,
    'pickups 4': false,
    'pickups 4 (dead end)': true,
    'trap 3 (a commuting softlock)': false,
    'stress 8 rooms': true,
    demo: true,
  };
  const agree = (a: Awaited<ReturnType<typeof solve>>, b: Awaited<ReturnType<typeof solve>>) =>
    a.status === b.status &&
    a.finished === b.finished &&
    JSON.stringify(a.broken) === JSON.stringify(b.broken) &&
    JSON.stringify(a.softlockCauses.map((c) => `${c.room}: ${c.action}`).sort()) ===
      JSON.stringify(b.softlockCauses.map((c) => `${c.room}: ${c.action}`).sort());
  // Two full proofs of the demo per test: 11 s on a laptop, 55 to 62 s on a shared CI runner (4.1.0): three minutes.
  const DIFFERENTIAL_MS = 180_000;
  for (const [name, game, layouts, o] of games) {
    it(
      `${name}: stubborn sets reach the plain verdict`,
      async () => {
        const plain = await solve(structuredClone(game), layouts, { ...o, mode: 'prove', por: false, memo: false });
        const reduced = await solve(structuredClone(game), layouts, {
          ...o,
          mode: 'prove',
          por: 'stubborn',
          unsafeReduction: true,
        });
        expect(plain.truncated).toBe(false);
        expect(agree(plain, reduced)).toBe(true);
      },
      DIFFERENTIAL_MS,
    );
    it(
      `${name}: sleep sets ${SLEEP_AGREES[name] ? 'agree' : 'invent softlocks'}`,
      async () => {
        const plain = await solve(structuredClone(game), layouts, { ...o, mode: 'prove', por: false, memo: false });
        const reduced = await solve(structuredClone(game), layouts, {
          ...o,
          mode: 'prove',
          por: 'sleep',
          unsafeReduction: true,
        });
        expect(agree(plain, reduced)).toBe(SLEEP_AGREES[name]);
      },
      DIFFERENTIAL_MS,
    );
  }

  it('the trap: one cause, every losing state counted', async () => {
    const r = await solve(trap(3), pickupsLayouts, { mode: 'prove' });
    expect(r.status).toBe('softlocks');
    expect(r.softlockCauses.map((c) => c.action)).toEqual(['Use hammer']);
    expect(r.softlockCount).toBe(r.softlockCauses[0].count);
    expect(r.softlockCount).toBe(8); // 2^3 pickup subsets, each with the exit broken
  });
});

describe('why proof mode keeps the reductions off (BENCH.md "v3.3")', () => {
  it('sleep sets drop edges the reverse reachability needs: a softlock the plain proof does not have', async () => {
    const g = makeStressGame({
      rooms: 20,
      players: 3,
      items: 12,
      flags: 30,
      npcs: 1,
      scripts: 2,
      topics: 8,
      schemaVersion: 3,
      eras: true,
    });
    const plain = await solve(structuredClone(g.game), g.layouts, { mode: 'prove', memo: false });
    const sleep = await solve(structuredClone(g.game), g.layouts, {
      mode: 'prove',
      por: 'sleep',
      unsafeReduction: true,
    });
    expect(plain.status).toBe('solved');
    expect(sleep.states).toBe(plain.states);
    expect(sleep.status).toBe('softlocks');
    // And it saves almost nothing: under 2% of the engine runs.
    expect(sleep.profile.slept * 50).toBeLessThan(plain.profile.tries);
  }, 120000);
});
