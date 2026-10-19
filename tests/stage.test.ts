// The stage schema (3.4): layers, occluders, lights, particles, walk zones and links, as data. The content says what
// and when, the layout says where; old rooms are a stage of one backdrop and one zone; nothing here is game state.
import { describe, expect, it } from 'vitest';
import type { GameDef, Layout, RoomDef } from '@engine/core/types';
import { rendererOf, stageImages, stageOf, Z_BACKDROP, Z_FOREGROUND } from '@engine/core/stage';
import { assetGraph } from '@engine/core/asset-graph';
import { validate } from '@engine/tools/validate';
import { solve } from '@engine/tools/solve';
import { textPaths } from '@engine/tools/i18n';
import { game as demo, layouts as demoLayouts } from '../games/demo';

const room = (extra: Partial<RoomDef> = {}): RoomDef =>
  ({ id: 'hall', name: 'Hall', decor: 'decor/hall', ...extra }) as RoomDef;

describe('a room as a stage', () => {
  it('an old room: its decor is the backdrop, its walk polygon the zone "main", nothing only a canvas draws', () => {
    const s = stageOf(room(), {
      walk: {
        area: [
          [0, 300],
          [640, 300],
          [640, 400],
          [0, 400],
        ],
        holes: [
          [
            [10, 310],
            [20, 310],
            [20, 320],
          ],
        ],
      },
      scale: [
        [300, 0.8],
        [400, 1],
      ],
    });
    expect(s.layers).toEqual([
      expect.objectContaining({
        id: 'decor',
        image: 'decor/hall',
        role: 'backdrop',
        z: Z_BACKDROP,
        parallax: [1, 1],
        blend: 'normal',
        opacity: 1,
      }),
    ]);
    expect(s.zones).toEqual([
      expect.objectContaining({
        id: 'main',
        holes: [
          [
            [10, 310],
            [20, 310],
            [20, 320],
          ],
        ],
        scale: [
          [300, 0.8],
          [400, 1],
        ],
        zoom: 1,
      }),
    ]);
    expect(s.canvasOnly).toEqual([]);
    expect(s.transition).toEqual({ kind: 'cut', ms: 0 });
  });

  it('layers in their depth bands, geometry from the layout, links with their logic from the content', () => {
    const r = room({
      stage: {
        layers: [
          { id: 'sky', image: 'l/sky', role: 'backdrop' },
          { id: 'counter', image: 'l/counter', role: 'scenery' },
          { id: 'plant', image: 'l/plant', role: 'foreground' },
        ],
        transition: 'fade',
        links: { stairs: { if: 'lights_on', locked: 'Too dark.' } },
      },
    });
    const L: Layout = {
      layers: { counter: { x: 100, y: 200, z: 330 }, plant: { parallax: [1.3, 1] } },
      walkZones: {
        floor: {
          area: [
            [0, 300],
            [640, 300],
            [640, 400],
            [0, 400],
          ],
        },
        balcony: {
          area: [
            [0, 100],
            [200, 100],
            [200, 150],
            [0, 150],
          ],
          zoom: 1.2,
        },
      },
      walkLinks: {
        stairs: { from: { zone: 'floor', at: [180, 310] }, to: { zone: 'balcony', at: [180, 140] }, mode: 'stairs' },
      },
    };
    const s = stageOf(r, L);
    expect(s.layers.map((l) => l.id)).toEqual(['sky', 'counter', 'plant']);
    expect(s.layers.find((l) => l.id === 'counter')).toMatchObject({ x: 100, y: 200, z: 330 });
    expect(s.layers.find((l) => l.id === 'plant')!.z).toBeGreaterThanOrEqual(Z_FOREGROUND);
    expect(s.layers.find((l) => l.id === 'plant')!.parallax).toEqual([1.3, 1]);
    expect(s.links).toEqual([
      expect.objectContaining({ id: 'stairs', mode: 'stairs', ms: 900, if: 'lights_on', locked: 'Too dark.' }),
    ]);
    expect(s.transition).toEqual({ kind: 'fade', ms: 400 });
    expect(stageImages(r, L).sort()).toEqual(['l/counter', 'l/plant', 'l/sky']);
    expect(rendererOf(r, {})).toBe('dom');
    expect(rendererOf({ ...r, renderer: 'canvas' }, { renderer: 'dom' })).toBe('canvas');
    expect(rendererOf(r, { renderer: 'canvas' })).toBe('canvas');
  });
});

describe('validating a stage', () => {
  const base = structuredClone(demo);
  const lay = structuredClone(demoLayouts);
  const house = base.rooms.find((r) => r.id === 'house')!;
  house.stage = {
    layers: [
      { id: 'window', image: 'decor/house', role: 'scenery', visible: 'night' },
      { id: 'window', image: 'nope/missing', role: 'foreground' },
    ],
    lights: [{ id: 'lamp', kind: 'radial', color: '#ffd' }],
    emitters: [{ id: 'dust', kind: 'dust' }],
    links: { ghost: { if: 'night', locked: 'No.' } },
  };
  lay.house = {
    ...lay.house,
    layers: { window: { z: 300 }, unknown: { z: 1 } },
    occluders: { pillar: { z: 340 }, frame: { layer: 'nolayer', z: 1 } },
    walkZones: {
      floor: {
        area: [
          [0, 300],
          [640, 300],
          [640, 400],
          [0, 400],
        ],
      },
      attic: {
        area: [
          [0, 0],
          [100, 0],
          [100, 50],
          [0, 50],
        ],
      },
    },
    walkLinks: {
      ladder: { from: { zone: 'floor', at: [10, 310] }, to: { zone: 'roof', at: [10, 10] }, mode: 'ladder' },
    },
  };
  const { errors, warnings } = validate(base, lay, { assets: { images: { 'decor/house': [1, 1] } as never } });
  const all = [...errors, ...warnings].join('\n');
  it('reports ids used twice, missing images, geometry for nothing, shapeless occluders, unknown zones and layers', () => {
    for (const x of [
      'stage id "window" is used twice',
      'nope/missing',
      'no stage layer "unknown"',
      'an occluder needs a polygon, a mask image or a layer',
      'no stage layer "nolayer"',
      'unknown walk zone "roof"',
      'radial light "lamp" has no place',
      'emitter "dust" has no area',
      'no walk link "ghost" in the layout',
    ])
      expect(all).toContain(x);
  });
  it('a zone nothing leads to is an error; what only a canvas draws is said on a room the DOM paints', () => {
    expect(errors.join('\n')).toContain('walk zone "attic" cannot be reached');
    expect(warnings.join('\n')).toContain('only the canvas painter draws');
  });
  it("a flag a layer shows is read, and a link's refusal is a translatable text", () => {
    expect(all).not.toContain('flag "night" is set but never read');
    expect(textPaths(base).some((p) => p.path.endsWith('stage.links.ghost.locked'))).toBe(true);
  });
});

describe('a stage is never game state', () => {
  it('the sample game with layers, lights and links on every room: the same proof, state for state', async () => {
    const plain = await solve(structuredClone(demo), demoLayouts, { mode: 'prove' });
    const staged = structuredClone(demo) as GameDef;
    for (const r of staged.rooms)
      r.stage = {
        layers: [{ id: 'fg', image: r.decor, role: 'foreground', visible: 'pantry_open' }],
        lights: [{ id: 'sun', kind: 'ambient', color: '#fff', visible: { has: 'key' } }],
        transition: 'fade',
      };
    const s = await solve(staged, demoLayouts, { mode: 'prove' });
    expect([s.status, s.states, s.softlockCount]).toEqual([plain.status, plain.states, plain.softlockCount]);
  }, 120000);
  it('the asset graph counts the stage images', () => {
    const g = structuredClone(demo) as GameDef;
    g.rooms[0].stage = { layers: [{ id: 'fg', image: 'extra/fg', role: 'foreground' }] };
    expect(assetGraph(g).rooms[g.rooms[0].id]).toContain('img:extra/fg');
  });
});
