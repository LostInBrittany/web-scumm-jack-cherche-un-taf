// Micro-games for the solver's partial-order reduction (wiki/en/contribute.benchmarks.md): independent actions whose orders multiply
// the states. tests/por.test.ts checks that the reduction finds the same answers with fewer engine runs.
import type { GameDef, Layout } from '@engine/core/types';

const verbs: GameDef['verbs'] = [
  { id: 'look', label: 'Look', color: '#fff' },
  { id: 'take', label: 'Take', color: '#fff' },
  { id: 'use', label: 'Use', color: '#fff', join: 'with' },
];
const fallbacks = { look: ['Nothing.'], take: ['No.'], use: ['No.'], use2: ['No.'] };
const skin: GameDef['skin'] = { icons: { map: 'ui/map', pause: 'ui/pause', music: 'ui/music' } };
const ui = {} as GameDef['ui'];
const hero = { name: 'Hero', color: '#fff', sprites: { idle: ['h/1'] } };

/**
 * `k` things to pick up in any order, then a door that needs them all. `finishable: false` makes the door also need a
 * thing nobody can get: the search must then visit every subset of the pickups (2^k states) to prove the dead end.
 */
export function pickups(k: number, finishable = true): GameDef {
  const ids = Array.from({ length: k }, (_, i) => `thing_${i + 1}`);
  return {
    id: 'pickups',
    title: 'Pickups',
    saveVersion: 1,
    hero: 'hero',
    verbs,
    skin,
    ui,
    characters: { hero },
    items: Object.fromEntries([...ids, 'ghost'].map((id) => [id, { name: id, icon: `i/${id}`, look: `A ${id}.` }])),
    rooms: [
      {
        id: 'yard',
        name: 'Yard',
        decor: 'd/yard',
        hotspots: {
          ...Object.fromEntries(ids.map((id) => [id, { name: `spot of ${id}`, visible: { not: { has: id } } }])),
          door: { name: 'door' },
        },
        look: { door: 'A heavy door.' },
        on: [
          ...ids.map((id) => ({ verb: 'take', a: id, do: [{ gain: id }] })),
          {
            verb: 'use',
            a: 'door',
            if: { all: [...ids.map((id) => ({ has: id })), ...(finishable ? [] : [{ has: 'ghost' }])] },
            do: [{ end: true as const }],
          },
        ],
      },
    ],
    rules: { fallbacks },
    start: { room: 'yard' },
  };
}
export const pickupsLayouts: Record<string, Layout> = { yard: { entries: { default: [320, 360] } } };

/** The three trials in any order (Monkey Island): three flags from three rules, the end needs all three. */
export function trials(): GameDef {
  const names = ['sword', 'thief', 'treasure'];
  return {
    id: 'trials',
    title: 'Three trials',
    saveVersion: 1,
    hero: 'hero',
    verbs,
    skin,
    ui,
    characters: { hero },
    items: {},
    rooms: [
      {
        id: 'island',
        name: 'Island',
        decor: 'd/island',
        hotspots: {
          ...Object.fromEntries(names.map((n) => [n, { name: `the ${n} trial`, visible: `!${n}_done` }])),
          captain: { name: 'the captain' },
        },
        look: { captain: 'A pirate captain.' },
        on: [
          ...names.map((n) => ({ verb: 'use', a: n, do: [{ set: `${n}_done` }] })),
          {
            verb: 'use',
            a: 'captain',
            if: { all: names.map((n) => `${n}_done`) },
            do: [{ set: 'pirate' }, { end: true as const }],
          },
        ],
      },
    ],
    rules: { fallbacks },
    start: { room: 'island' },
  };
}
export const trialsLayouts: Record<string, Layout> = { island: { entries: { default: [320, 360] } } };

/**
 * A hidden softlock that commutes with everything else: `k` independent pickups, and a hammer that breaks the
 * only exit for good. Every order of the pickups is equivalent; the one losing step must survive any reduction.
 */
export function trap(k: number): GameDef {
  const g = pickups(k, true);
  const room = g.rooms[0];
  room.hotspots = { ...(room.hotspots ?? {}), hammer: { name: 'hammer' } };
  room.look = { ...(room.look ?? {}), hammer: 'A hammer.' };
  room.on = [
    ...(room.on ?? []).map((r) =>
      r.a === 'door' && !r.b ? { ...r, if: r.if ? { all: [r.if as never, '!broken'] } : '!broken' } : r,
    ),
    { verb: 'use', a: 'hammer', if: '!broken', do: [{ set: 'broken' }, 'Oops.'] },
  ];
  return g;
}
