// @vitest-environment happy-dom
// Several faces on one place of the map (4.4.0): a city where several characters live shows them all on its pin, side
// by side, `portrait: ['ann/face', 'bea/face']`. One portrait (a string) draws as before; no portrait, the pin.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@engine/dom/app';
import { openMap } from '@engine/dom/map-view';
import type { GameDef } from '@engine/core/types';
import { game as demo } from '../../games/demo/game';
import { validate } from '@engine/tools/validate';
import { assetGraph } from '@engine/core/asset-graph';
import { mini, miniLayouts } from '../fixtures/mini';

async function start() {
  document.body.innerHTML = '';
  vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({ width: 844, height: 390 } as DOMRect);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 404 }));
  const base = mini();
  const game: GameDef = {
    ...base,
    ui: demo.ui,
    skin: { ...demo.skin, icons: { ...demo.skin.icons, pin: 'ui/pin' } },
    map: {
      start: 'land',
      regions: { land: { name: 'Land', image: 'map/land' } },
      places: {
        a: { name: 'Town', room: 'a', region: 'land', pos: [30, 40], portrait: ['ann/face', 'bea/face'] },
        b: { name: 'Village', room: 'b', region: 'land', pos: [60, 40], portrait: 'uncle/face' },
      },
    },
    start: { ...base.start, unlocked: ['a', 'b'] },
  };
  const app = new App({ root: document.body, game, layouts: miniLayouts, manifest: { images: {} } });
  await app.engine.newGame();
  return app;
}

const faces = (pin: Element) =>
  [...pin.querySelectorAll<HTMLImageElement>('img.face')].map((i) => i.getAttribute('src'));

describe('several portraits on one place of the map (4.4.0)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('draws every face of a place, in order, and one face for a single portrait', async () => {
    const app = await start();
    const open = openMap(app, app.engine.state);
    const [town, village] = [...document.querySelectorAll('.mapview .pin')];
    expect(faces(town!)).toEqual([app.bank.img('ann/face'), app.bank.img('bea/face')]);
    expect(faces(village!)).toEqual([app.bank.img('uncle/face')]);
    expect(town!.querySelectorAll('img.needle')).toHaveLength(1);
    (document.querySelector('.choice.gl') as HTMLElement).click();
    await open;
    app.destroy();
  });

  it('the validator checks every face, and the asset graph lists every one', () => {
    const g = structuredClone(demo) as GameDef;
    if (!g.map) throw new Error('the demo has a map');
    const [pid] = Object.keys(g.map.places);
    const one = g.map.places[pid!]!.portrait;
    g.map.places[pid!]!.portrait = ([] as string[]).concat(one ?? [], 'nobody/face');
    const images = Object.fromEntries(([] as string[]).concat(one ?? []).map((i) => [i, [1, 1] as [number, number]]));
    const errors = validate(g, {}, { assets: { images } } as never).errors.filter((e) => e.startsWith(`map.${pid}`));
    expect(errors).toEqual([`map.${pid} › image not found: "nobody/face"`]);
    expect(assetGraph(g).map).toContain('img:nobody/face');
  });
});
