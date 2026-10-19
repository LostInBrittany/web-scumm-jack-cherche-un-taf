// @vitest-environment happy-dom
// The pause menu's quest journal (4.1.12, ADR 0014): a row when the game declares objectives, none otherwise; the
// list shows every objective once, each step under its parent, done ✓ or open ○, the side ones marked.
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '@engine/dom/app';
import { game as demo } from '../../games/demo/game';
import { quest, questLayouts } from '../fixtures/objectives';

const build = (objectives = true) => {
  const g = { ...quest(), ui: demo.ui, skin: demo.skin };
  if (!objectives) delete g.objectives;
  return new App({ root: document.body, game: g, layouts: questLayouts, manifest: { images: {} } });
};
const rows = () => [...document.querySelectorAll('.dim .menu > button')].map((b) => b.textContent ?? '');

describe('the quest journal', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens from the pause menu and lists the objectives, steps under their parents, done or open', async () => {
    const app = build();
    await app.engine.newGame();
    await app.engine.act({ verb: 'take', a: 'rug' });
    app.pauseMenu();
    const row = [...document.querySelectorAll<HTMLButtonElement>('.dim .menu > button')].find((b) =>
      b.textContent?.includes('Objectives'),
    );
    expect(row).toBeDefined();
    row!.click();
    const items = [...document.querySelectorAll<HTMLLIElement>('.menu li.objective')];
    expect(items.map((li) => li.dataset.objective)).toEqual(['escape', 'chest', 'key', 'bell']);
    expect(items.map((li) => li.style.paddingLeft)).toEqual(['0em', '1.2em', '2.4em', '0em']);
    const key = items.find((li) => li.dataset.objective === 'key')!;
    expect(key.classList.contains('done')).toBe(true);
    expect(key.textContent).toBe('✓ Find the key');
    expect(items.find((li) => li.dataset.objective === 'escape')!.textContent).toBe('○ Get out of the hall');
    expect(items.find((li) => li.dataset.objective === 'bell')!.classList.contains('optional')).toBe(true);
    expect(document.querySelector('.menu h3')?.textContent).toBe('OBJECTIVES');
    app.destroy();
  });

  it('has no row in a game without objectives', async () => {
    const app = build(false);
    await app.engine.newGame();
    app.pauseMenu();
    expect(rows().some((t) => t.includes('Objectives'))).toBe(false);
    app.destroy();
  });
});
