// @vitest-environment happy-dom
// Several places on one pin of the map (4.4.0): a city with several rooms to travel to (the reception, an office
// upstairs) is one pin, and each face on it is a way in. A place says which pin it joins, `joins: 'town'`: its face sits
// on that pin once it is unlocked, a tap on the face travels to its own room, and from its room the city's pin is "here".
// Moving between two places of the same pin does not draw a journey.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@engine/dom/app';
import { openMap } from '@engine/dom/map-view';
import type { GameDef, MapDef } from '@engine/core/types';
import { game as demo } from '../../games/demo/game';
import { validate } from '@engine/tools/validate';
import { mini, miniLayouts } from '../fixtures/mini';

const MAP: MapDef = {
  start: 'land',
  regions: { land: { name: 'Land', image: 'map/land' } },
  places: {
    town: { name: 'Town', room: 'a', region: 'land', pos: [30, 40], portrait: 'ann/face' },
    office: { name: 'Town: the office', room: 'b', region: 'land', pos: [30, 40], portrait: 'bea/face', joins: 'town' },
  },
};

async function start(unlocked: string[], room = 'a') {
  document.body.innerHTML = '';
  vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({ width: 844, height: 390 } as DOMRect);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 404 }));
  const base = mini();
  const game: GameDef = {
    ...base,
    ui: demo.ui,
    skin: { ...demo.skin, icons: { ...demo.skin.icons, pin: 'ui/pin' } },
    map: MAP,
    start: { ...base.start, room, unlocked },
  };
  const app = new App({ root: document.body, game, layouts: miniLayouts, manifest: { images: {} } });
  await app.engine.newGame();
  return app;
}

const pins = () => [...document.querySelectorAll('.mapview .pin')];
const faceSrcs = (pin: Element) =>
  [...pin.querySelectorAll<HTMLImageElement>('img.face')].map((i) => i.getAttribute('src'));
const close = () => (document.querySelector('.choice.gl') as HTMLElement).click();

describe('several places on one pin (4.4.0)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('draws one pin with both faces once the joining place is unlocked, each face a way to its own place', async () => {
    const app = await start(['town', 'office']);
    const open = openMap(app, app.engine.state);
    expect(pins()).toHaveLength(1);
    expect(faceSrcs(pins()[0]!)).toEqual([app.bank.img('ann/face'), app.bank.img('bea/face')]);
    const office = pins()[0]!.querySelector<HTMLElement>('[aria-label="Town: the office"]')!;
    office.click();
    expect(await open).toBe('office');
    expect(document.querySelector('.mapview path')).toBeNull(); // same pin: no journey drawn
    app.destroy();
  });

  it("shows only the pin's own face while the joining place is locked", async () => {
    const app = await start(['town']);
    const open = openMap(app, app.engine.state);
    expect(pins()).toHaveLength(1);
    expect(faceSrcs(pins()[0]!)).toEqual([app.bank.img('ann/face')]);
    close();
    await open;
    app.destroy();
  });

  it("from the joining place's room, the pin is here and the list names both places", async () => {
    const app = await start(['town', 'office'], 'b');
    const open = openMap(app, app.engine.state);
    expect(pins()[0]!.classList.contains('here')).toBe(true);
    const names = [...document.querySelectorAll('.choices .choice')].map((c) => c.textContent);
    expect(names).toEqual(['• Town', '• Town: the office', expect.stringContaining('•')]);
    pins()[0]!.querySelector<HTMLElement>('[aria-label="Town"]')!.click();
    expect(await open).toBe('town');
    app.destroy();
  });

  it('the validator wants an existing place in the same region, that joins nobody itself', () => {
    const g = structuredClone(demo) as GameDef;
    if (!g.map) throw new Error('the demo has a map');
    const [host, other] = Object.keys(g.map.places);
    const errs = () => validate(g, {}).errors.filter((e) => /joins/.test(e));
    expect(errs()).toEqual([]);
    g.map.places.extra = { ...g.map.places[host!]!, joins: 'nowhere' };
    expect(errs()).toEqual(['map.extra › joins an unknown place: "nowhere"']);
    g.map.places.extra.joins = 'extra';
    expect(errs()).toEqual(['map.extra › joins itself']);
    if (other) {
      g.map.places[other]!.joins = host;
      g.map.places.extra.joins = other;
      expect(errs()).toContain(`map.extra › joins "${other}", which joins another pin itself`);
    }
  });
});
