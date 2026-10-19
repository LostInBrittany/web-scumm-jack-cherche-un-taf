// @vitest-environment happy-dom
// The presenter split (4.1.11, ADR 0011): App composes the engine, a Presenter (dom/presenter.ts) and the room view's
// renderer (dom/frame-renderer.ts). The engine talks to the presenter, never to App; the player's input reaches the
// engine as intentions only; the renderer skips an unchanged frame, paints a new room whole and a changed frame by
// its differences.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@engine/dom/app';
import { PainterRenderer } from '@engine/dom/frame-renderer';
import type { SceneRenderer, SpriteSpec, StageSpec } from '@engine/dom/renderer';
import type { SceneFrame } from '@engine/scene/frame';
import { game as demo } from '../../games/demo/game';
import { mini, miniLayouts } from '../fixtures/mini';

const build = () =>
  new App({
    root: document.body,
    game: { ...mini(), ui: demo.ui, skin: demo.skin },
    layouts: miniLayouts,
    manifest: { images: {} },
  });

describe('App composes a presenter and a renderer', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('the engine talks to the presenter, and the renderer is the room view’s', async () => {
    const app = build();
    expect(app.engine.ui).toBe(app.presenter);
    expect(app.renderer).toBe(app.view.out);
    app.destroy();
  });

  it('an act intention is an action of the session; a walk one moves the hero', async () => {
    // The walk lasts long enough for the idle warm-up to fetch: no server here, so nothing is (a 404 at once).
    const src = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 404 }));
    const app = build();
    await app.engine.newGame();
    await app.presenter.intent({ kind: 'act', verb: 'use', target: 'valise', item: 'cle' });
    expect(app.engine.session?.log.at(-1)).toMatchObject({ act: { verb: 'use', a: 'cle', b: 'valise' } });
    expect(app.engine.state.used).toContain('cle');
    await app.presenter.intent({ kind: 'walk', to: [330, 362] });
    expect(app.engine.state.hero.a).toEqual([330, 362]);
    app.destroy();
    src.mockRestore();
  }, 20000);

  it('a pick answers the choice on screen, by intention or by a tap on its row', async () => {
    const app = build();
    await app.engine.newGame();
    const one = app.presenter.choose([{ text: 'Yes' }, { text: 'No' }]);
    await app.presenter.intent({ kind: 'pick', choice: 1 });
    await expect(one).resolves.toBe(1);
    expect(document.querySelector('.choices')).toBeNull();
    const two = app.presenter.choose([{ text: 'Left' }, { text: 'Right' }]);
    (document.querySelectorAll('.choice')[0] as HTMLButtonElement).click();
    await expect(two).resolves.toBe(0);
    expect(app.presenter.picking).toBeNull();
    app.destroy();
  });

  it('open: the menu opens the pause menu; a skip ends the line and skips the cutscene', async () => {
    const app = build();
    await app.engine.newGame();
    await app.presenter.intent({ kind: 'open', what: 'menu' });
    expect(document.querySelector('.dim')).not.toBeNull();
    let ended = false;
    void app.presenter.say(app.engine.heroId(), 'A long line to skip.', {}).then(() => {
      ended = true;
    });
    await app.presenter.intent({ kind: 'skip' });
    await Promise.resolve();
    expect(ended).toBe(true);
    expect(app.engine.busyState.skipping).toBe(true);
    app.destroy();
  });

  it('a renderer’s own intentions go to the presenter (the DOM and Canvas painters have none of their own)', async () => {
    const app = build();
    await app.engine.newGame();
    const seen: string[] = [];
    app.renderer.onIntent((i) => seen.push(i.kind));
    expect(seen).toEqual([]);
    app.destroy();
  });
});

class Recorder implements SceneRenderer {
  el = document.createElement('div');
  calls: string[] = [];
  reset() {
    this.calls.push('reset');
  }
  sprite(s: SpriteSpec) {
    this.calls.push(`sprite ${s.id}`);
  }
  camera(x: number) {
    this.calls.push(`camera ${x}`);
  }
  resize() {}
  stage(_s: StageSpec) {
    this.calls.push('stage');
  }
  dispose() {
    this.calls.push('dispose');
  }
}
const sprite = (id: string, fx = 100): SpriteSpec => ({
  id,
  url: `img/${id}`,
  fx,
  fy: 300,
  w: 40,
  h: 80,
  bob: 0,
  z: 300,
  flip: false,
  flipV: false,
  rot: 0,
  visible: true,
  opacity: 1,
});
const frame = (room: string, hash: string, sprites: SpriteSpec[], x = 0): SceneFrame => ({
  hash,
  room,
  camera: { x, y: 0, zoom: 1, width: 640 },
  layers: [{ kind: 'backdrop', id: 'backdrop', z: -1e9, url: `img/${room}`, x: 0, y: 0, w: 640, h: 400 }],
  actors: sprites.map((s, order) => ({
    id: s.id,
    at: [s.fx, s.fy],
    facing: 'right',
    speaking: false,
    moving: false,
    order,
    sprite: s,
  })),
  hotspots: [],
  effects: [],
  reduceMotion: false,
});

describe('PainterRenderer', () => {
  it('a new room whole, the same frame skipped, a changed one by its differences, a swap whole again', () => {
    const p = new Recorder();
    const r = new PainterRenderer(p);
    r.render(frame('a', '1', [sprite('ann'), sprite('bob')]));
    expect(p.calls).toEqual(['reset', 'stage', 'sprite ann', 'sprite bob', 'camera 0']);
    p.calls = [];
    r.render(frame('a', '1', [sprite('ann'), sprite('bob')]));
    expect(p.calls).toEqual([]);
    r.render(frame('a', '2', [sprite('ann'), sprite('bob', 140)], 10));
    expect(p.calls).toEqual(['sprite bob', 'camera 10']);
    p.calls = [];
    r.render(frame('b', '3', [sprite('ann')]));
    expect(p.calls[0]).toBe('reset');
    const q = new Recorder();
    r.swap(q);
    expect(p.calls.at(-1)).toBe('dispose');
    r.render(frame('b', '3', [sprite('ann')]));
    expect(q.calls).toEqual(['reset', 'stage', 'sprite ann', 'camera 0']);
  });

  it('mounts the painter’s surface in its root; unmount disposes it', () => {
    const p = new Recorder();
    const r = new PainterRenderer(p);
    const root = document.createElement('div');
    r.mount(root);
    expect(p.el.parentElement).toBe(root);
    r.unmount();
    expect(p.calls).toEqual(['dispose']);
  });
});
