// @vitest-environment happy-dom
// Diffed rendering (4.1.5): the keyboard targets and the inventory slots are patched on a state change, never
// thrown away and made again, so a focused target keeps its focus and a slot keeps its element across a gain.
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

describe('the keyboard targets', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keep their buttons across a state change, and lose only the target that left', async () => {
    const app = build();
    await app.engine.newGame();
    app.renderA11yTargets();
    const before = new Map(app.a11yButtons);
    expect(before.size).toBeGreaterThan(0);
    const focused = [...before.values()][0]!;
    focused.focus();
    app.renderA11yTargets();
    for (const [id, b] of before) expect(app.a11yButtons.get(id)).toBe(b);
    expect(document.activeElement).toBe(focused);
    // A target hidden by the state: its button goes, the others stay the same elements.
    const gone = [...before.keys()][0]!;
    await app.engine.run(async () => {
      app.engine.state.actors[`${app.engine.state.room}.${gone}`] = { visible: false };
    });
    app.renderA11yTargets();
    expect(app.a11yButtons.has(gone)).toBe(false);
    for (const [id, b] of before) if (id !== gone) expect(app.a11yButtons.get(id)).toBe(b);
    app.destroy();
  });

  it('advance the line a focused target caused: Space lands on the button, not on the document', async () => {
    const app = build();
    await app.engine.newGame();
    app.renderA11yTargets();
    const [id, b] = [...app.a11yButtons][0]!;
    b.focus();
    let ended = false;
    const line = app.presenter.say(app.engine.heroId(), 'A line long enough to wait for a key.', {}).then(() => {
      ended = true;
    });
    expect(app.speechEl).not.toBeNull();
    b.click(); // what a Space or an Enter on a focused button is
    await line;
    expect(ended).toBe(true);
    expect(app.speechEl).toBeNull();
    expect(app.a11yButtons.get(id)).toBe(b); // the line changed nothing of the targets
    app.destroy();
  });
});

describe('the inventory slots', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('are the same elements before and after a gain; the gained item shows in its slot', async () => {
    const app = build();
    await app.engine.newGame();
    const item = Object.keys(app.game.items)[0];
    if (!item) return; // the fixture has no item: nothing to gain
    app.renderInv();
    const slots = [...app.invEl.children];
    expect(slots.length).toBeGreaterThan(0);
    await app.engine.run(async () => {
      app.engine.state.inventory.push(item);
    });
    app.presenter.inventory(app.engine.state.inventory, app.engine.state.used);
    expect([...app.invEl.children]).toEqual(slots);
    expect((app.invEl.children[0] as HTMLElement).dataset.id).toBe(item);
    app.destroy();
  });
});
