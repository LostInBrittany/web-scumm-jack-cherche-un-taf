// The stage's geometry, checked (4.1.11, src/engine/tools/validate-stage.ts): a mask polygon must close a surface
// (three distinct points, an area, no edge crossing another), and in a room of several walk zones every zone has a
// link (a portal) to another. The validator refuses both; the Studio's stage editor says the same before it saves.
import { describe, expect, it } from 'vitest';
import type { Layout, Point } from '@engine/core/types';
import { closesSurface, zonesWithoutPortal } from '@engine/tools/validate-stage';
import { validate } from '@engine/tools/validate';
import { game as demo } from '../games/demo/game';
import house from '../games/demo/layout/house.json';
import garden from '../games/demo/layout/garden.json';
import market from '../games/demo/layout/market.json';

const square: Point[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

describe('closesSurface', () => {
  it('a triangle or a square closes; a line, two points, a repeated point or a bow tie does not', () => {
    expect(closesSurface(square)).toBe(true);
    expect(
      closesSurface([
        [0, 0],
        [10, 0],
        [5, 8],
      ]),
    ).toBe(true);
    expect(
      closesSurface([
        [0, 0],
        [10, 0],
      ]),
    ).toBe(false);
    expect(
      closesSurface([
        [0, 0],
        [5, 5],
        [10, 10],
      ]),
    ).toBe(false); // no area
    expect(
      closesSurface([
        [0, 0],
        [10, 0],
        [10, 0],
        [10, 0],
      ]),
    ).toBe(false); // two distinct points
    expect(
      closesSurface([
        [0, 0],
        [10, 10],
        [10, 0],
        [0, 10],
      ]),
    ).toBe(false); // edges cross
  });
});

describe('zonesWithoutPortal', () => {
  it('in a room of several zones, the zones no link touches; one zone needs none', () => {
    const L: Layout = {
      walkZones: { floor: { area: square }, attic: { area: square }, cellar: { area: square } },
      walkLinks: { ladder: { from: { zone: 'floor', at: [1, 1] }, to: { zone: 'attic', at: [2, 2] }, mode: 'ladder' } },
    };
    expect(zonesWithoutPortal(L)).toEqual(['cellar']);
    expect(zonesWithoutPortal({ walkZones: { floor: { area: square } } })).toEqual([]);
    expect(zonesWithoutPortal({})).toEqual([]);
  });
});

describe('the validator refuses them', () => {
  const layouts = { house, garden, market } as unknown as Record<string, Layout>;
  const run = (L: Layout) => validate(demo, { ...layouts, house: { ...layouts.house, ...L } }).errors.join('\n');

  it('an unclosed mask polygon is an error', () => {
    const msg = run({
      occluders: {
        pillar: {
          z: 300,
          polygon: [
            [0, 0],
            [5, 5],
            [10, 10],
          ],
        },
      },
    });
    expect(msg).toContain('layout house.occluders.pillar');
    expect(msg).toContain('the polygon does not close a surface');
    expect(run({ occluders: { pillar: { z: 300, polygon: square } } })).not.toContain('does not close');
  });

  it('a zone without a portal is an error', () => {
    const msg = run({
      walkZones: {
        floor: {
          area: [
            [0, 300],
            [640, 300],
            [640, 400],
            [0, 400],
          ],
        },
        attic: { area: square },
      },
    });
    expect(msg).toContain('layout house.walkZones.attic');
    expect(msg).toContain('no walk link (portal) joins walk zone "attic" to another');
  });
});
