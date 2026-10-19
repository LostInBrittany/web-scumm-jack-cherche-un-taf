// @vitest-environment happy-dom
// The offline warm-up and the service worker's control (4.1.8, programme §4.5): its fetches are cached by the worker
// only once it controls the page, so when boot registered one the warm-up waits for that control, and without it in
// time says `skipped` with the reason `worker` instead of a `complete` that cached nothing (what Firefox did).
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '@engine/dom/app';
import { game as demo } from '../../games/demo/game';
import { mini, miniLayouts } from '../fixtures/mini';

const build = () =>
  new App({
    root: document.body,
    game: { ...mini(), ui: demo.ui, skin: demo.skin },
    layouts: miniLayouts,
    manifest: { images: {} },
  });

type FakeWorker = {
  controller: object | null;
  ready: Promise<void>;
  listeners: Set<() => void>;
  addEventListener(type: string, f: () => void): void;
  removeEventListener(type: string, f: () => void): void;
};
const fakeWorker = (controller: object | null): FakeWorker => {
  const listeners = new Set<() => void>();
  return {
    controller,
    ready: Promise.resolve(),
    listeners,
    addEventListener: (_t, f) => void listeners.add(f),
    removeEventListener: (_t, f) => void listeners.delete(f),
  };
};
const install = (w: FakeWorker) => Object.defineProperty(navigator, 'serviceWorker', { value: w, configurable: true });

describe('the warm-up and the worker in control', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
    document.body.innerHTML = '';
  });

  it('without a worker expected (dev, a test), warms at once', async () => {
    const app = build();
    await app.warmAll();
    expect(app.offlineStatus.state).toBe('complete');
    app.destroy();
  });

  it('with a worker expected and in control, warms', async () => {
    install(fakeWorker({}));
    const app = build();
    app.swExpected = true;
    await app.warmAll();
    expect(app.offlineStatus.state).toBe('complete');
    app.destroy();
  });

  it('with a worker expected that takes control later, waits for it, then warms', async () => {
    const w = fakeWorker(null);
    install(w);
    const app = build();
    app.swExpected = true;
    const done = app.warmAll();
    await new Promise((r) => setTimeout(r, 20));
    expect(app.offlineStatus.state).toBe('running');
    w.controller = {};
    for (const f of w.listeners) f();
    await done;
    expect(app.offlineStatus.state).toBe('complete');
    expect(w.listeners.size).toBe(0); // the listener is removed once control is there
    app.destroy();
  });

  it('with a worker expected that never takes control, says skipped with the reason worker, and offlineReady resolves', async () => {
    install(fakeWorker(null));
    const app = build();
    app.swExpected = true;
    app.swControlMs = 30;
    await app.warmAll();
    expect(app.offlineStatus).toMatchObject({ state: 'skipped', reason: 'worker' });
    await expect(app.offlineReady).resolves.toMatchObject({ state: 'skipped', reason: 'worker' });
    app.destroy();
  });
});
