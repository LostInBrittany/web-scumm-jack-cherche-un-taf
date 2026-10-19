// The no-op memo (solve's `memo`): a try that wrote nothing the solver hashes is not run again on the same read values.
// It must change nothing but the engine runs: the same verdicts, states, softlocks, witnesses and reachability counts
// as the plain search, on every fixture, with every skipped try run anyway and compared (`memoVerify: 1`).
import { describe, expect, it } from 'vitest';
import type { GameDef, Layout } from '@engine/core/types';
import { atomValue, solve, type SolveOptions, type SolveResult } from '@engine/tools/solve';
import { makeStressGame } from '@engine/tools/stress';
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
import { pickups, pickupsLayouts, trials, trialsLayouts } from './fixtures/por';
import { world, worldLayouts } from './fixtures/world';
import { cast, castLayouts } from './fixtures/cast';

const same = (a: SolveResult, b: SolveResult) => {
  for (const k of [
    'status',
    'finished',
    'states',
    'truncated',
    'softlockCount',
    'softlockCauses',
    'broken',
    'path',
    'flagsReached',
    'roomsReached',
    'unlockedReached',
    'unusedItems',
    'itemsNeverUsed',
    'deadEnds',
  ] as const)
    expect(b[k], k).toEqual(a[k]);
  expect(b.boundaries.length).toBe(a.boundaries.length);
  for (const k of ['noops', 'hashHits', 'attempted', 'perAction', 'fallbackByRoom', 'perRoom'] as const)
    expect(b.profile[k], k).toEqual(a.profile[k]);
};

describe('the no-op memo changes nothing but the engine runs', () => {
  const eras = (players: number, softlock: boolean) =>
    makeStressGame({
      rooms: 12,
      players,
      items: 12,
      flags: 10,
      npcs: 1,
      scripts: 2,
      topics: 4,
      schemaVersion: 3,
      eras: true,
      softlock,
    });
  const open = makeStressGame({ rooms: 10, players: 2, items: 12, flags: 30, npcs: 2, scripts: 4, topics: 6 });
  const games: [string, () => GameDef, Record<string, Layout>, Partial<SolveOptions>][] = [
    ['insults', insults, insultsLayouts, {}],
    ['grog', grog, grogLayouts, {}],
    ['dott', dott, dottLayouts, {}],
    ['mansion', mansion, mansionLayouts, {}],
    ['stan', stan, stanLayouts, {}],
    ['world', world, worldLayouts, {}],
    ['cast', cast, castLayouts, {}],
    ['trials', trials, trialsLayouts, {}],
    ['pickups 4 (dead end)', () => pickups(4, false), pickupsLayouts, {}],
    ['eras, 2 characters', () => eras(2, false).game, eras(2, false).layouts, {}],
    ['eras, 3 characters, softlock', () => eras(3, true).game, eras(3, true).layouts, {}],
    ['open stress, truncated', () => open.game, open.layouts, { maxStates: 3000 }],
  ];
  for (const [name, make, layouts, o] of games)
    for (const mode of ['witness', 'prove'] as const)
      it(`${name} (${mode})`, async () => {
        const plain = await solve(make(), layouts, { ...o, mode, memo: false });
        const memo = await solve(make(), layouts, { ...o, mode, memoVerify: 1 });
        expect(memo.errors).toEqual(plain.errors);
        same(plain, memo);
        expect(memo.profile.memo.verified).toBe(memo.profile.memo.hits);
        expect(plain.profile.memo).toMatchObject({ applied: false, reason: 'turned off' });
      }, 300_000);

  it('the demo: same proof, a third of the engine runs, every skip checked', async () => {
    const { game, layouts, commands } = await import('../games/demo');
    const plain = await solve(structuredClone(game), layouts, { mode: 'prove', commands, memo: false });
    const memo = await solve(structuredClone(game), layouts, { mode: 'prove', commands, memoVerify: 1 });
    expect(memo.errors).toEqual([]);
    same(plain, memo);
    const fast = await solve(structuredClone(game), layouts, { mode: 'prove', commands });
    same(plain, fast);
    expect(fast.profile.tries * 2).toBeLessThan(plain.profile.tries);
    expect(fast.profile.memo.hits).toBeGreaterThan(fast.profile.memo.stored);
  }, 300_000);

  it('values what a run read in the raw state, and refuses what it cannot value', () => {
    const s = {
      room: 'hall',
      active: 'ann',
      inventory: ['key'],
      used: ['key'],
      flags: { lit: 2 },
      props: { 'hall.door': 'open' },
      unlocked: [],
      seen: { 'topic.x': 1 },
      visited: { hall: 3 },
      counters: { 'n.k': 4 },
      actors: { 'hall.cat': { visible: false } },
      where: { bob: 'hall' },
      scripts: { tick: { pc: 1 } },
      hero: {},
      camera: { x: 0, follow: true },
    } as never;
    expect(
      [
        'has:key',
        'item:key',
        'flag:lit',
        'flag:none',
        'prop:hall.door',
        'visited:hall',
        'seen:topic.x',
        'nth:n.k',
        'visible:hall.cat',
        'actorIn:bob@hall',
        'script:tick',
        '@:room',
        '@:active',
      ].map((k) => atomValue(s, k)),
    ).toEqual(['1', '11', '2', 'null', 'open', '1', '1', '4', '0', 'hall', '{"pc":1}', 'hall', 'ann']);
    expect(atomValue(s, 'mystery:x')).toBeNull();
    // A parked character is valued by its room, bag and used items, never by where it stands (4.1.17).
    const parked = (at: [number, number]) =>
      ({ players: { bob: { room: 'hall', inventory: ['key'], hero: { hall: at } } } }) as never;
    expect(atomValue(parked([320, 360]), 'players:bob')).toBe(atomValue(parked([130, 350]), 'players:bob'));
    expect(atomValue(parked([320, 360]), 'players:bob')).toBe('["hall",["key"],null]');
    expect(atomValue(s, 'players:bob')).toBe('null');
  });
});
