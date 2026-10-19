// @vitest-environment happy-dom
// The player's speedrun mode (4.1.14 "Time Attack"): a game with `speedrun` offers it in the pause menu; a category
// starts an attempt (a new game with its seed, a timer in the scene), the pause menu's opening is recorded as a pause,
// the finish seals the run, "Export run" hands the .wsrun out, and the local records count the attempt. The ghost is off
// the first time a category is played.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '@engine/dom/app';
import { game as demo } from '../../games/demo/game';
import { ROUTE, speedrunGame, speedrunLayouts } from '../fixtures/speedrun-game';

const until = async (f: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!f()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};
const rows = () => [...document.querySelectorAll('.dim .menu button')].map((b) => b.textContent ?? '');
const click = (text: string) =>
  (
    [...document.querySelectorAll('.dim .menu button')].find((b) => b.textContent?.includes(text)) as HTMLElement
  ).click();

beforeEach(() => {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('the speedrun mode in the player', () => {
  it('starts a category from the pause menu, times it, records a pause, seals the run, exports it', async () => {
    const game = { ...speedrunGame(), ui: demo.ui, skin: demo.skin };
    const app = new App({
      root: document.body,
      game,
      layouts: speedrunLayouts,
      manifest: { images: {} },
      build: { trustedExtensions: 'ab'.repeat(32), engine: 'test' },
    });
    await app.engine.newGame();
    app.pauseMenu();
    expect(rows().some((r) => r.includes('Speedrun'))).toBe(true);
    click('Speedrun');
    expect(rows().some((r) => r.includes('Any%'))).toBe(true);
    click('Any%');
    await until(() => !!app.speedrun);
    const run = app.speedrun!;
    expect(run.ghostOn).toBe(false);
    expect(document.querySelector('.speedrun-hud')?.textContent).toMatch(/^Any% \d+:\d/);
    expect(app.engine.session?.seed).toBe(run.recorder.seed);
    app.pauseMenu();
    expect(rows().some((r) => r.includes('Abandon run'))).toBe(true);
    (document.querySelector('.dim') as HTMLElement).remove();
    for (const a of ROUTE) await app.engine.act({ ...a });
    await until(() => !!run.envelope);
    expect(run.envelope!.categoryId).toBe('any%');
    expect(run.envelope!.engineVersion).toBe('test');
    await until(() => run.records?.attempts === 1);
    expect(run.records!.pb).not.toBeNull();
    app.pauseMenu();
    expect(rows().some((r) => r.includes('Export run'))).toBe(true);
    expect(await run.exportRun()).toBe(true);
    app.destroy();
  }, 20000);
});
