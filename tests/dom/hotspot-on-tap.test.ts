// @vitest-environment happy-dom
// A single tap on a hotspot that says `onTap: 'go'` (4.4.0): the hero walks to it and acts on arrival with the double
// tap's verb (its `defaultVerb`), as an exit does with `input.exitOnTap` (#188). Without it a tap on a hotspot only
// walks there, whatever the game's `exitOnTap`: that setting is about exits. E.g. an endless aisle: walking to it
// says why one does not walk down it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@engine/dom/app';
import type { GameDef, HotspotDef, SessionEntry } from '@engine/core/types';
import { game as demo } from '../../games/demo/game';
import { validate } from '@engine/tools/validate';
import { mini, miniLayouts } from '../fixtures/mini';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function settle(app: App) {
  for (let i = 0; i < 600; i++) {
    await sleep(5);
    if (app.speechEl) app.endSpeech();
    else if (!app.engine.busy) {
      await sleep(5);
      if (!app.engine.busy && !app.speechEl) return;
    }
  }
  throw new Error('the player never settled');
}

async function start(o: { exitOnTap?: boolean; onTap?: HotspotDef['onTap'] } = {}) {
  document.body.innerHTML = '';
  vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({ width: 844, height: 390 } as DOMRect);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 404 }));
  const base = mini();
  const game: GameDef = {
    ...base,
    ui: demo.ui,
    skin: demo.skin,
    ...(o.exitOnTap ? { input: { exitOnTap: true } } : {}),
    rooms: base.rooms.map((r) =>
      r.id === 'a'
        ? {
            ...r,
            hotspots: {
              ...r.hotspots,
              aisle: { name: 'aisle', defaultVerb: 'use', ...(o.onTap ? { onTap: o.onTap } : {}) },
            },
            look: { ...r.look, aisle: 'An endless aisle.' },
            on: [...(r.on ?? []), { verb: 'use', a: 'aisle', do: [{ say: ['hero', 'Half a day on foot.'] }] }],
          }
        : r,
    ),
  };
  const layouts = {
    ...miniLayouts,
    a: {
      ...miniLayouts.a!,
      hotspots: {
        ...miniLayouts.a!.hotspots,
        aisle: { rect: [300, 150, 60, 150] as [number, number, number, number] },
      },
    },
  };
  const app = new App({ root: document.body, game, layouts, manifest: { images: {} } });
  await app.engine.newGame();
  await settle(app);
  return app;
}

const acts = (app: App) =>
  app.engine.session!.log.flatMap((e) => ('act' in (e as SessionEntry) ? [(e as { act: unknown }).act] : []));

describe("a single tap on a hotspot with onTap: 'go' (4.4.0)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it("walks there and acts on arrival with the double tap's verb", async () => {
    const app = await start({ onTap: 'go' });
    await app.actOnTarget('aisle');
    await settle(app);
    expect(acts(app)).toEqual([{ verb: 'use', a: 'aisle' }]);
    expect(app.engine.state.hero.a).toEqual(app.engine.approach('aisle'));
    app.destroy();
  });

  it('without onTap, only walks there, even when the game sets exitOnTap (it is about exits)', async () => {
    const app = await start({ exitOnTap: true });
    await app.actOnTarget('aisle');
    await settle(app);
    expect(acts(app)).toEqual([]);
    expect(app.engine.state.hero.a).toEqual(app.engine.approach('aisle'));
    app.destroy();
  });

  it("onTap: 'walk' only walks", async () => {
    const app = await start({ onTap: 'walk' });
    await app.actOnTarget('aisle');
    await settle(app);
    expect(acts(app)).toEqual([]);
    app.destroy();
  });

  it('a picked verb still wins: Look at the aisle looks', async () => {
    const app = await start({ onTap: 'go' });
    document.querySelector<HTMLElement>('[data-verb="look"]')!.click();
    await app.actOnTarget('aisle');
    await settle(app);
    expect(acts(app)).toEqual([{ verb: 'look', a: 'aisle' }]);
    app.destroy();
  });

  it('the validator accepts go and walk on a hotspot, and refuses anything else', () => {
    const g = structuredClone(demo) as GameDef;
    const room = g.rooms.find((r) => Object.keys(r.hotspots ?? {}).length)!;
    const [hid] = Object.keys(room.hotspots!);
    const errs = () => validate(g, {}).errors.filter((e) => /onTap/.test(e));
    room.hotspots![hid!]!.onTap = 'go';
    expect(errs()).toEqual([]);
    room.hotspots![hid!]!.onTap = 'look' as never;
    expect(errs()).toEqual([`${room.id}.hotspots.${hid} › onTap is "go" or "walk", not "look"`]);
  });
});
