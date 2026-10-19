// @vitest-environment happy-dom
// The player's lifecycle (4.1.4): an App built and destroyed leaves no listener on the window or the document, no
// frame loop, no blob URL, and an engine that runs no script; a host that makes players (the Studio's preview, a
// test) can do it twenty times.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@engine/dom/app';
import { PaletteCache } from '@engine/dom/palette';
import { fpsMeter } from '@engine/dom/app-shared';
import { game as demo } from '../../games/demo/game';
import { mini, miniLayouts } from '../fixtures/mini';

const listeners = () => {
  const added = new Map<EventTarget, Map<string, number>>();
  const count = (t: EventTarget) => added.get(t) ?? added.set(t, new Map()).get(t)!;
  for (const target of [window, document]) {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    vi.spyOn(target, 'addEventListener').mockImplementation((type, fn, opts) => {
      count(target).set(type, (count(target).get(type) ?? 0) + 1);
      const signal = typeof opts === 'object' ? opts?.signal : undefined;
      signal?.addEventListener('abort', () => count(target).set(type, (count(target).get(type) ?? 0) - 1));
      return add(type, fn, opts);
    });
    vi.spyOn(target, 'removeEventListener').mockImplementation((type, fn, opts) => {
      count(target).set(type, (count(target).get(type) ?? 0) - 1);
      return remove(type, fn, opts);
    });
  }
  return () => [...added].flatMap(([, m]) => [...m].filter(([, n]) => n > 0).map(([type, n]) => `${type}×${n}`));
};

const build = () =>
  new App({
    root: document.body,
    // The mini fixture's rooms with the sample game's texts and skin: a player needs both.
    game: { ...mini(), ui: demo.ui, skin: demo.skin },
    layouts: miniLayouts,
    manifest: { images: {} },
  });

describe('the pause menu', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('opens, and its resume row closes it, gives the focus back, and undoes what it set up (4.1.4)', async () => {
    const app = build();
    await app.engine.newGame();
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    app.pauseMenu();
    const dim = document.querySelector('.dim');
    expect(dim).not.toBeNull();
    const resume = dim!.querySelector('button') as HTMLButtonElement;
    resume.click();
    expect(document.querySelector('.dim')).toBeNull();
    expect(document.activeElement).toBe(before);
    app.destroy();
  });
});

describe('App.destroy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('removes every listener it put on the window and the document, stops the frames, ends the engine', () => {
    const left = listeners();
    const raf = vi.spyOn(window, 'cancelAnimationFrame');
    const app = build();
    expect(left().length).toBeGreaterThan(0); // resize, keydown, the audio's unlock
    const engine = app.engine;
    app.destroy();
    expect(left()).toEqual([]);
    expect(raf).toHaveBeenCalled();
    expect(engine.destroyed).toBe(true);
    expect(app.aborter.signal.aborted).toBe(true);
  });

  it('ends a warm-up in progress: nothing is fetched after destroy, and no error escapes (4.1.7)', async () => {
    let fetched = 0;
    vi.stubGlobal('fetch', async () => {
      fetched++;
      return new Response(new ArrayBuffer(1));
    });
    const app = build();
    const warm = app.bank.warm(['/assets/a.webp', '/assets/b.webp', '/assets/c.webp'], 1);
    app.destroy();
    await expect(warm).resolves.toMatchObject({ failed: [] });
    expect(fetched).toBe(0);
    vi.unstubAllGlobals();
  });

  it('can be built and destroyed twenty times without a listener left behind', () => {
    const left = listeners();
    for (let i = 0; i < 20; i++) build().destroy();
    expect(left()).toEqual([]);
  });

  it('revokes the blob URLs a palette cache made, and the fps meter stops its frames and leaves no box', () => {
    const revoked: string[] = [];
    vi.stubGlobal('URL', { ...URL, revokeObjectURL: (u: string) => revoked.push(u), createObjectURL: () => 'blob:x' });
    const cache = new PaletteCache() as unknown as { done: Map<string, string>; dispose(): void };
    cache.done.set('k', 'blob:one');
    cache.done.set('j', '/plain.png');
    cache.dispose();
    expect(revoked).toEqual(['blob:one']);
    expect(cache.done.size).toBe(0);
    const raf = vi.spyOn(window, 'cancelAnimationFrame');
    const stop = fpsMeter();
    expect(document.querySelector('.fps-meter')).not.toBeNull();
    stop();
    expect(raf).toHaveBeenCalled();
    expect(document.querySelector('.fps-meter')).toBeNull();
    vi.unstubAllGlobals();
  });
});
