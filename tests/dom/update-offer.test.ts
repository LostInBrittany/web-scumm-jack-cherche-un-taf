// @vitest-environment happy-dom
// The update banner (4.1.8, programme §4.5): a new service worker is never activated before the game in progress is
// saved and the save is durable; a save that fails keeps the old version running and says so; the title screen
// without progress activates at once; one banner, however many times the worker says "update".
import { afterEach, describe, expect, it, vi } from 'vitest';
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

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('the update banner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    localStorage.clear(); // the fallback store of happy-dom: a save of one test is not the next one's progress
  });

  it('saves, waits for the save to be durable, then activates; never the other way round', async () => {
    const app = build();
    await app.engine.newGame();
    const order: string[] = [];
    let durable!: () => void;
    const idle = new Promise<void>((ok) => {
      durable = ok;
    });
    vi.spyOn(app.engine, 'save').mockImplementation(() => void order.push('save'));
    app.engine.store.whenIdle = () => (order.push('whenIdle'), idle);
    const activate = vi.fn(async () => void order.push('activate'));
    app.offerUpdate(activate);
    const banner = document.querySelector('.update-banner');
    expect(banner).not.toBeNull();
    const button = banner!.querySelector('button') as HTMLButtonElement;
    button.click();
    await flush();
    expect(order).toEqual(['save', 'whenIdle']);
    expect(activate).not.toHaveBeenCalled();
    expect(button.disabled).toBe(true);
    durable();
    await flush();
    await flush();
    expect(order).toEqual(['save', 'whenIdle', 'activate']);
    expect(activate).toHaveBeenCalledTimes(1);
    app.destroy();
  });

  it('a save that fails keeps the old version: nothing activated, the button offered again, the failure reported', async () => {
    const app = build();
    await app.engine.newGame();
    app.engine.store.whenIdle = () => Promise.reject(new Error('quota'));
    const reported = vi.spyOn(app, 'reportStorageError');
    const activate = vi.fn(async () => {});
    app.offerUpdate(activate);
    const button = document.querySelector('.update-banner button') as HTMLButtonElement;
    button.click();
    await flush();
    await flush();
    expect(activate).not.toHaveBeenCalled();
    expect(button.disabled).toBe(false);
    expect(reported).toHaveBeenCalledTimes(1);
    expect(String(reported.mock.calls[0]![0])).toMatch(/quota/);
    app.destroy();
  });

  it('on the title screen with nothing to keep, activates without writing a save; one banner only', async () => {
    const app = build();
    const save = vi.spyOn(app.engine, 'save');
    const activate = vi.fn(async () => {});
    app.offerUpdate(activate);
    app.offerUpdate(activate);
    expect(document.querySelectorAll('.update-banner')).toHaveLength(1);
    (document.querySelector('.update-banner button') as HTMLButtonElement).click();
    await flush();
    await flush();
    expect(save).not.toHaveBeenCalled();
    expect(activate).toHaveBeenCalledTimes(1);
    app.destroy();
  });

  it('on the title screen with a save on disk but no game running, activates without writing (the save is the progress)', async () => {
    // What the Chromium scenario of scripts/e2e-pwa.mjs found: Continue offered, no live state, and `save()` on nothing
    // threw in `beforeSave`, so the update was reported as a storage failure and never activated.
    const first = build();
    await first.engine.newGame();
    first.engine.save();
    await first.engine.store.whenIdle?.();
    first.destroy();
    document.body.innerHTML = '';
    const app = build();
    expect(app.engine.hasSave()).toBe(true);
    expect(app.engine.state).toBeUndefined();
    const save = vi.spyOn(app.engine, 'save');
    const activate = vi.fn(async () => {});
    app.offerUpdate(activate);
    (document.querySelector('.update-banner button') as HTMLButtonElement).click();
    await flush();
    await flush();
    expect(save).not.toHaveBeenCalled();
    expect(app.saveError).toBeNull();
    expect(activate).toHaveBeenCalledTimes(1);
    app.destroy();
  });
});
