// @vitest-environment happy-dom
// The pause menu's fingerprint row (4.1.12, ADR 0013): the four short hashes of the build a player runs, computed on
// the game as written (not the translated one), with the trusted extensions' hash the build gave.
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '@engine/dom/app';
import { fingerprintGame, shortFingerprint } from '@engine/core/fingerprint';
import { game as demo } from '../../games/demo/game';
import { mini, miniLayouts } from '../fixtures/mini';

const written = () => ({ ...mini(), ui: demo.ui, skin: demo.skin });

describe('the pause menu shows the fingerprint', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('a row with the short fingerprint of the game as written, the build parts included', async () => {
    const source = written();
    // What the player shows: a translated copy; the fingerprint is the written game's.
    const translated = { ...source, ui: { ...source.ui, resume: 'Reprendre' } };
    const build = { trustedExtensions: 'ab'.repeat(32), engine: '4.1.12' };
    const app = new App({
      root: document.body,
      game: translated,
      source,
      layouts: miniLayouts,
      manifest: { images: {} },
      build,
    });
    await app.engine.newGame();
    app.pauseMenu();
    const row = document.querySelector('.dim button.fingerprint') as HTMLButtonElement;
    expect(row.textContent).toContain('Build');
    const f = await app.fingerprint();
    await new Promise((r) => setTimeout(r, 0));
    const want = await fingerprintGame(source, {
      manifest: { images: {} },
      extensions: { trusted: build.trustedExtensions, commands: undefined, minigames: [] },
      engine: '4.1.12',
    });
    expect(f).toEqual(want);
    expect(row.lastElementChild!.textContent).toBe(shortFingerprint(want));
    expect(row.lastElementChild!.textContent).toMatch(/^[0-9a-f]{8}-abababab-[0-9a-f]{8}-[0-9a-f]{8}$/);
    // Computed once: the same promise on the next opening.
    expect(app.fingerprint()).toBe(app.fingerprint());
    app.destroy();
  });

  it('says an unknown extensions part as such when the build gave none', async () => {
    const app = new App({ root: document.body, game: written(), layouts: miniLayouts, manifest: { images: {} } });
    expect(shortFingerprint(await app.fingerprint())).toMatch(/^[0-9a-f]{8}-\?{8}-[0-9a-f]{8}-[0-9a-f]{8}$/);
    app.destroy();
  });
});
