// The demo extended for Remix's property tests (4.1.15): thirteen anchors over its three rooms, three items placed
// among them (exclusive, capacity 1), a coupled code of four pairs, an order of five puzzle groups with one edge, a
// `requires` between two placements, two presentation dimensions. The product of the logical domains is far beyond a
// catalogue (13·13·13·4·60 = 527 280): the `remix` mode is a generator; `too-big` declares the same as a catalogue,
// which `verify:variants` and `catalogue()` must refuse.
import type { GameDef } from '@engine/core/types';
import type { VariationManifest } from '@engine/core/remix/manifest';
import { game as demo } from '../../games/demo/game';

const SPOTS: Record<string, string[]> = {
  house: ['clock', 'table', 'chair', 'teacup', 'bookshelf', 'lamp'],
  garden: ['bench', 'gnome', 'tree', 'can'],
  market: ['stall_left', 'stall_mid', 'far_stalls'],
};
const anchors = Object.entries(SPOTS).flatMap(([room, ids]) => ids.map((anchor) => ({ room, anchor })));

export const extensionManifest: VariationManifest = {
  schema: 1,
  algorithm: 'web-scumm-remix-1',
  modes: [
    { id: 'story', strategy: 'catalogue', dimensions: [] },
    {
      id: 'remix',
      strategy: 'generator',
      dimensions: ['token-spot', 'pipe-spot', 'phone-spot', 'code', 'order', 'tea', 'grandma-palette'],
    },
    { id: 'too-big', strategy: 'catalogue', dimensions: ['token-spot', 'pipe-spot', 'phone-spot', 'code', 'order'] },
    { id: 'small', strategy: 'catalogue', dimensions: ['code', 'order'] },
  ],
  dimensions: [
    {
      id: 'token-spot',
      kind: 'item-placement',
      item: 'token',
      anchors,
      story: { room: 'house', anchor: 'chair' },
      logical: true,
    },
    {
      id: 'pipe-spot',
      kind: 'item-placement',
      item: 'pipe',
      anchors,
      story: { room: 'garden', anchor: 'bench' },
      logical: true,
    },
    {
      id: 'phone-spot',
      kind: 'item-placement',
      item: 'shell_phone',
      anchors,
      story: { room: 'house', anchor: 'table' },
      logical: true,
    },
    {
      id: 'code',
      kind: 'coupled',
      story: 0,
      logical: true,
      pairs: [
        { hint: { en: 'one sun, two moons', fr: 'un soleil, deux lunes' }, answer: '12' },
        { hint: { en: 'three cats, four mice', fr: 'trois chats, quatre souris' }, answer: '34' },
        { hint: { en: 'five pears, six plums', fr: 'cinq poires, six prunes' }, answer: '56' },
        { hint: { en: 'seven seas, eight winds', fr: 'sept mers, huit vents' }, answer: '78' },
      ],
    },
    {
      id: 'order',
      kind: 'puzzle-order',
      groups: ['a', 'b', 'c', 'd', 'e'],
      graph: [['a', 'b']],
      story: ['a', 'b', 'c', 'd', 'e'],
      logical: true,
    },
    {
      id: 'tea',
      kind: 'presentation',
      target: 'prop-img:house.teacup',
      values: ['home2/r2c3', 'home2/r2c4', 'home2/r2c5'],
      story: 0,
      logical: false,
    },
    {
      id: 'grandma-palette',
      kind: 'presentation',
      target: 'palette:grandma',
      values: [{}, { '#ff9ec4': '#9ec4ff' }],
      story: 0,
      logical: false,
    },
  ],
  constraints: [
    { kind: 'exclusive', dimensions: ['token-spot', 'pipe-spot', 'phone-spot'] },
    { kind: 'requires', a: 'token-spot=house.clock', b: 'pipe-spot=garden.bench' },
  ],
};

/** The demo with the extension's anchors and manifest (a copy: the demo is untouched). */
export function extendedDemo(manifest: VariationManifest = extensionManifest): GameDef {
  const g = structuredClone(demo);
  for (const r of g.rooms)
    for (const at of SPOTS[r.id] ?? []) r.anchors = { ...(r.anchors ?? {}), [at]: { at, phase: 'any' } };
  g.remix = manifest;
  return g;
}
