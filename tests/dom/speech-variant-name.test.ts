// @vitest-environment happy-dom
// The speaker's name on screen follows the character's variant (4.3.0 "Hero Choice", plan §3.1): the speech label, the
// live region, the transcript and the talk header read it through the engine's `character()`.
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '@engine/dom/app';
import { game as demo } from '../../games/demo/game';
import { mini, miniLayouts } from '../fixtures/mini';

function build() {
  const g = { ...mini(), ui: demo.ui, skin: demo.skin };
  g.characters.voice!.variants = [{ if: { flag: 'form', eq: 'f' }, name: 'Lady Voice' }];
  return new App({ root: document.body, game: g, layouts: miniLayouts, manifest: { images: {} } });
}

describe('the speaker label follows a variant’s name', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('written name with no variant, the variant’s once it applies', async () => {
    const app = build();
    await app.engine.newGame();
    void app.presenter.say('voice', 'Hello.', {});
    expect(document.querySelector('.narr .who')?.textContent).toBe('VOICE');
    expect(app.live.textContent).toBe('Voice: Hello.');
    app.endSpeech();
    app.engine.state.flags.form = 'f';
    void app.presenter.say('voice', 'Hello again.', {});
    expect(document.querySelector('.narr .who')?.textContent).toBe('LADY VOICE');
    expect(app.live.textContent).toBe('Lady Voice: Hello again.');
    app.endSpeech();
    const picked = app.presenter.choose([{ text: 'Hi' }], 'voice');
    expect(document.querySelector('.choices .who')?.textContent).toBe('Lady Voice');
    expect(document.querySelector('.choices')?.getAttribute('aria-label')).toBe('Lady Voice');
    await app.presenter.intent({ kind: 'pick', choice: 0 });
    await picked;
    expect(document.querySelector('.transcript .who')?.textContent).toBe('Lady Voice');
    app.destroy();
  });
});
