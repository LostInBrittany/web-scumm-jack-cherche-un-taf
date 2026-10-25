// @vitest-environment happy-dom
// A single tap on an exit (#188): with the game's `input.exitOnTap`, or the exit's `onTap: 'go'`, the hero walks to it
// and goes through on arrival, with the double tap's verb; otherwise the tap only walks there, as before. A verb
// picked still wins, a tap elsewhere during the walk redirects the hero and nothing goes through, so do a room change
// and a save loaded during it, and a double tap acts once.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@engine/dom/app';
import type { ExitDef, GameDef, SessionEntry } from '@engine/core/types';
import { game as demo } from '../../games/demo/game';
import { validate } from '@engine/tools/validate';
import { mini, miniLayouts } from '../fixtures/mini';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits until the engine is idle and no line is on screen (a line is dismissed, as a tap would). */
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

async function start(o: { exitOnTap?: boolean; onTap?: ExitDef['onTap'] } = {}) {
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
      r.id === 'a' ? { ...r, exits: { door: { name: 'door', to: 'b', ...(o.onTap ? { onTap: o.onTap } : {}) } } } : r,
    ),
  };
  const layouts = {
    ...miniLayouts,
    a: { ...miniLayouts.a!, hotspots: { door: { rect: [560, 200, 60, 150] as [number, number, number, number] } } },
  };
  const app = new App({ root: document.body, game, layouts, manifest: { images: {} } });
  await app.engine.newGame();
  await settle(app);
  return app;
}

const acts = (app: App) =>
  app.engine.session!.log.flatMap((e) => ('act' in (e as SessionEntry) ? [(e as { act: unknown }).act] : []));

describe('a single tap on an exit (#188)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('without the setting, only walks there, as before', async () => {
    const app = await start();
    await app.actOnTarget('door');
    await settle(app);
    expect(app.engine.state.room).toBe('a');
    expect(acts(app)).toEqual([]);
    expect(app.engine.state.hero.a).toEqual(app.engine.approach('door'));
    app.destroy();
  });

  it("with input.exitOnTap, goes through on arrival with the double tap's verb", async () => {
    const app = await start({ exitOnTap: true });
    await app.actOnTarget('door');
    await settle(app);
    expect(acts(app)).toEqual([{ verb: 'use', a: 'door' }]);
    expect(app.engine.state.room).toBe('b');
    app.destroy();
  });

  it("an exit's onTap overrides the game: walk keeps it walk-only, go works without the setting", async () => {
    const walk = await start({ exitOnTap: true, onTap: 'walk' });
    await walk.actOnTarget('door');
    await settle(walk);
    expect(walk.engine.state.room).toBe('a');
    expect(acts(walk)).toEqual([]);
    walk.destroy();
    const go = await start({ onTap: 'go' });
    await go.actOnTarget('door');
    await settle(go);
    expect(go.engine.state.room).toBe('b');
    go.destroy();
  });

  it('a picked verb still wins: Look at the door looks', async () => {
    const app = await start({ exitOnTap: true });
    document.querySelector<HTMLElement>('[data-verb="look"]')!.click();
    await app.actOnTarget('door');
    await settle(app);
    expect(acts(app)).toEqual([{ verb: 'look', a: 'door' }]);
    expect(app.engine.state.room).toBe('a');
    app.destroy();
  });

  it('a tap elsewhere during the walk redirects the hero, and nothing goes through', async () => {
    const app = await start({ exitOnTap: true });
    vi.spyOn(app.scene, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 640,
      height: 400,
    } as DOMRect);
    const going = app.actOnTarget('door');
    await sleep(20);
    expect(app.engine.busy).toBe(false); // a walk, not yet an action: the scene still takes taps
    await app.onScenePointer({ target: app.scene, clientX: 100, clientY: 370, pointerType: 'touch' } as never);
    await going;
    await settle(app);
    expect(app.engine.state.room).toBe('a');
    expect(acts(app)).toEqual([]);
    app.destroy();
  });

  it('a room change during the walk cancels it: nothing goes through in the new room', async () => {
    const app = await start({ exitOnTap: true });
    const going = app.actOnTarget('door');
    await sleep(20);
    expect(app.engine.busy).toBe(false);
    await app.engine.teleport('b');
    await going;
    await settle(app);
    expect(app.engine.state.room).toBe('b');
    expect(acts(app)).toEqual([]);
    app.destroy();
  });

  it('a save loaded during the walk cancels it, in the same room too', async () => {
    const app = await start({ exitOnTap: true });
    const saved = structuredClone(app.engine.state);
    const going = app.actOnTarget('door');
    await sleep(20);
    expect(app.engine.busy).toBe(false);
    await app.engine.load(saved);
    await going;
    await settle(app);
    expect(app.engine.state.room).toBe('a');
    expect(acts(app)).toEqual([]);
    app.destroy();
  });

  it('a double tap still acts once', async () => {
    const app = await start({ exitOnTap: true });
    const first = app.actOnTarget('door');
    await app.actOnTarget('door');
    await first;
    await settle(app);
    expect(acts(app)).toEqual([{ verb: 'use', a: 'door' }]);
    expect(app.engine.state.room).toBe('b');
    app.destroy();
  });
});

describe("the validator on the player's side (validate/player.ts): the two fields (#188) and the menus", () => {
  const errs = (g: GameDef) => validate(g, {}).errors.filter((e) => /onTap|input/.test(e));

  it('accepts the demo, a boolean exitOnTap and an onTap of go or walk', () => {
    const g = structuredClone(demo) as GameDef;
    expect(errs(g)).toEqual([]);
    const room = g.rooms.find((r) => Object.keys(r.exits ?? {}).length)!;
    const [xid] = Object.keys(room.exits!);
    g.input = { exitOnTap: false };
    room.exits![xid!]!.onTap = 'walk';
    expect(errs(g)).toEqual([]);
  });

  it('refuses another onTap, a non-boolean exitOnTap and an input that is not an object', () => {
    const g = structuredClone(demo) as GameDef;
    const room = g.rooms.find((r) => Object.keys(r.exits ?? {}).length)!;
    const [xid] = Object.keys(room.exits!);
    room.exits![xid!]!.onTap = 'look' as never;
    g.input = { exitOnTap: 'yes' as never };
    expect(errs(g)).toEqual([
      'input.exitOnTap › exitOnTap is true or false',
      `${room.id}.exits.${xid} › onTap is "go" or "walk", not "look"`,
    ]);
    g.input = true as never;
    expect(errs(g)).toContain('input › input is an object: { exitOnTap?: boolean }');
  });

  it('refuses an actorGap that is not a positive number (#198)', () => {
    const g = structuredClone(demo) as GameDef;
    const gaps = () => validate(g, {}).errors.filter((e) => e.startsWith('actorGap'));
    g.actorGap = 60;
    expect(gaps()).toEqual([]);
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, '60']) {
      g.actorGap = bad as never;
      expect(gaps()).toEqual(['actorGap › actorGap is a positive number of pixels (44 is used instead)']);
    }
  });

  it("still checks the save slots and the menus' texts", () => {
    const g = structuredClone(demo) as GameDef;
    g.saves = { slots: -1 };
    expect(validate(g, {}).errors).toContain('saves › slots must be a whole number');
    g.saves = { slots: 3 };
    g.settings = true;
    g.ui = { ...g.ui, exportSave: undefined, textSize: undefined } as never;
    const w = validate(g, {}).warnings;
    expect(w).toContain('ui.exportSave › missing text for the save menu (English default used)');
    expect(w).toContain('ui.textSize › missing text for the settings menu (English default used)');
  });
});
