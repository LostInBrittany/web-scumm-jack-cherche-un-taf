// @vitest-environment happy-dom
// Portraits in a choice (4.3.0, PLAN-4.3-HERO-CHOICE §3.3): options with `img` are cards (the image, the option's text
// as the label and the button's name), in a grid before the text lines; the index answered is the option's own; the
// keyboard walks the cards then the lines; a choice without any img renders exactly as before.
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
const key = (k: string) =>
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('choice cards (Choice.img)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('cards first in their grid, labelled by their text; the pick is the option’s index', async () => {
    const app = build();
    await app.engine.newGame();
    const pick = app.presenter.choose([
      { text: 'Nobody' },
      { text: 'Sam', img: 'sam/portrait' },
      { text: 'Samia & co', img: 'sam_f/portrait' },
    ]);
    const box = document.querySelector('.choices')!;
    const cards = [...box.querySelectorAll<HTMLButtonElement>('.cards > .choice.card')];
    expect(cards.map((b) => b.textContent)).toEqual(['Sam', 'Samia & co']);
    expect(cards[0]!.querySelector('img')!.getAttribute('alt')).toBe('');
    expect(cards[0]!.querySelector('img')!.getAttribute('src')).toBe(app.bank.img('sam/portrait'));
    // DOM order (the keyboard's and the screen reader's): the cards, then the text line.
    expect([...box.querySelectorAll('.choice')].map((b) => b.textContent)).toEqual(['Sam', 'Samia & co', '• Nobody']);
    expect(box.querySelector('.cards')!.nextElementSibling!.textContent).toBe('• Nobody');
    await Promise.resolve();
    expect(document.activeElement).toBe(cards[0]);
    key('ArrowRight');
    expect(document.activeElement).toBe(cards[1]);
    key('ArrowDown');
    expect(document.activeElement!.textContent).toBe('• Nobody');
    key('Home');
    cards[1]!.click();
    await expect(pick).resolves.toBe(2);
    expect(document.querySelector('.choices')).toBeNull();
    app.destroy();
  });

  it('without any img, the panel is the text list it always was', async () => {
    const app = build();
    await app.engine.newGame();
    const pick = app.presenter.choose([{ text: 'Yes' }, { text: 'No', seen: true }]);
    const box = document.querySelector('.choices')!;
    expect(box.querySelector('.cards')).toBeNull();
    expect(box.innerHTML).toBe('<button class="choice">• Yes</button><button class="choice read">• No</button>');
    await app.presenter.intent({ kind: 'pick', choice: 0 });
    await expect(pick).resolves.toBe(0);
    app.destroy();
  });
});
