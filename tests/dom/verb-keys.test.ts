// @vitest-environment happy-dom
// The verbs' keyboard shortcuts (#203): a verb's `key` picks it as a tap would, in any case, and only when the verb bar
// is what the player plays with; the button underlines the letter and says it to a screen reader; the validator
// refuses a key that is not one character, Space and a shared key, in the game and in each translation; the key is
// translated like the label; a game without keys keeps its fingerprint.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@engine/dom/app';
import { verbLabelHtml } from '@engine/dom/app-shared';
import type { GameDef } from '@engine/core/types';
import { presentationOf } from '@engine/core/fingerprint';
import { canonicalJson } from '@engine/core/canonical';
import { applyLocale, localeStatus, textPaths } from '@engine/tools/i18n';
import { validate } from '@engine/tools/validate';
import { localeVerbKeyChecks } from '@engine/tools/validate/player';
import { game as demo } from '../../games/demo/game';
import { mini, miniLayouts } from '../fixtures/mini';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function settle(app: App) {
  for (let i = 0; i < 600; i++) {
    await sleep(5);
    if (app.speechEl) app.endSpeech();
    else if (!app.engine.busy) {
      await sleep(5);
      if (!app.engine.busy && !app.speechEl) return;
    }
  }
  throw new Error('the player never settled');
}

const KEYS: Record<string, string> = { look: 'l', use: 'u', give: 'G' };

async function start(o: { keys?: boolean } = {}) {
  document.body.innerHTML = '';
  vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({ width: 844, height: 390 } as DOMRect);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 404 }));
  const base = mini();
  const game: GameDef = {
    ...base,
    ui: demo.ui,
    skin: demo.skin,
    verbs: base.verbs.map((v) => (o.keys ? { ...v, key: KEYS[v.id] } : v)),
  };
  const app = new App({ root: document.body, game, layouts: miniLayouts, manifest: { images: {} } });
  await app.engine.newGame();
  await settle(app);
  return app;
}

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};
const button = (app: App, id: string) => app.verbsEl.querySelector<HTMLElement>(`[data-verb="${id}"]`)!;

describe("the verbs' keys in the player (#203)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('without keys, a letter picks nothing and the buttons are as before', async () => {
    const app = await start();
    press('l');
    expect(app.verb).toBeNull();
    expect(button(app, 'look').innerHTML).toBe('Look');
    expect(button(app, 'look').hasAttribute('aria-keyshortcuts')).toBe(false);
    app.destroy();
  });

  it('a key picks its verb in any case, and picks it off again, as a tap does', async () => {
    const app = await start({ keys: true });
    const e = press('L');
    expect(e.defaultPrevented).toBe(true);
    expect(app.verb).toBe('look');
    expect(button(app, 'look').getAttribute('aria-pressed')).toBe('true');
    press('g');
    expect(app.verb).toBe('give');
    press('g');
    expect(app.verb).toBeNull();
    const other = press('x');
    expect(other.defaultPrevented).toBe(false);
    expect(app.verb).toBeNull();
    app.destroy();
  });

  it('underlines the letter in the label and says it to a screen reader', async () => {
    const app = await start({ keys: true });
    expect(button(app, 'look').innerHTML).toBe('<u>L</u>ook');
    expect(button(app, 'give').innerHTML).toBe('<u>G</u>ive');
    expect(button(app, 'look').getAttribute('aria-keyshortcuts')).toBe('L');
    app.destroy();
  });

  it('does nothing with Ctrl, Alt or Meta, a held key, or while the player types', async () => {
    const app = await start({ keys: true });
    for (const mod of ['ctrlKey', 'altKey', 'metaKey', 'repeat'] as const) press('l', { [mod]: true });
    expect(app.verb).toBeNull();
    const input = document.createElement('input');
    document.body.append(input);
    press('l', {}, input);
    expect(app.verb).toBeNull();
    app.destroy();
  });

  it('does nothing while something covers the scene, a line is up, a choice is asked or the engine is busy', async () => {
    const app = await start({ keys: true });
    app.pauseMenu();
    press('l');
    expect(app.verb).toBeNull();
    press('Escape');
    expect(app.scene.querySelector('.dim')).toBeNull();
    app.choosing = true;
    press('l');
    expect(app.verb).toBeNull();
    app.choosing = false;
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const field = document.createElement('button');
    dialog.append(field);
    document.body.append(dialog);
    press('l', {}, field);
    expect(app.verb).toBeNull();
    dialog.remove();
    vi.spyOn(app.engine, 'busy', 'get').mockReturnValue(true);
    press('l');
    expect(app.verb).toBeNull();
    app.destroy();
  });

  it('does nothing while the credits roll over the scene (4.3.0)', async () => {
    const app = await start({ keys: true });
    app.credits();
    press('l');
    expect(app.verb).toBeNull();
    app.scene.querySelector('.credits')!.remove();
    press('l');
    expect(app.verb).toBe('look');
    app.destroy();
  });

  it('does nothing once the player turned the keys off, offered in the settings only with keys (4.3.0)', async () => {
    const app = await start({ keys: true });
    const rows = (a: App) => {
      const d = document.createElement('div');
      const m = document.createElement('div');
      a.settingsMenu(d, m);
      return [...m.querySelectorAll('button')];
    };
    const row = rows(app).find((b) => b.textContent!.startsWith('Verb keys'))!;
    expect(row.textContent).toBe(`Verb keys${demo.ui.on}`);
    row.click();
    expect(app.settings.verbKeys).toBe(false);
    expect(row.textContent).toBe(`Verb keys${demo.ui.off}`);
    const e = press('l');
    expect(app.verb).toBeNull();
    expect(e.defaultPrevented).toBe(false);
    app.destroy();
    const plain = await start();
    expect(rows(plain).some((b) => b.textContent!.startsWith('Verb keys'))).toBe(false);
    plain.destroy();
  });
});

describe('verbLabelHtml (#203)', () => {
  it('underlines the first occurrence, any case, and escapes the label', () => {
    expect(verbLabelHtml({ label: 'Pick up', key: 'u' })).toBe('Pick <u>u</u>p');
    expect(verbLabelHtml({ label: 'Push', key: 'S' })).toBe('Pu<u>s</u>h');
    expect(verbLabelHtml({ label: 'Look <at>', key: 'a' })).toBe('Look &lt;<u>a</u>t&gt;');
    expect(verbLabelHtml({ label: 'Pull', key: 'y' })).toBe('Pull');
    expect(verbLabelHtml({ label: 'Pull' })).toBe('Pull');
  });
});

describe("the validator on the verbs' keys (validate/player.ts, #203)", () => {
  const withKeys = (keys: Record<string, unknown>) => {
    const g = structuredClone(demo) as GameDef;
    for (const v of g.verbs) if (v.id in keys) v.key = keys[v.id] as string;
    return g;
  };
  const keyErrs = (g: GameDef) => validate(g, {}).errors.filter((e) => e.startsWith('verbs.'));
  const keyWarns = (g: GameDef) => validate(g, {}).warnings.filter((e) => e.startsWith('verbs.'));

  it('accepts the demo, which sets none, and distinct letters of the labels', () => {
    expect(keyErrs(structuredClone(demo) as GameDef)).toEqual([]);
    const g = withKeys({ open: 'o', close: 'c', look: 'L', push: 's' });
    expect(keyErrs(g)).toEqual([]);
    expect(keyWarns(g)).toEqual([]);
  });

  it('refuses a key that is not one character, Space, and a key two verbs share in any case', () => {
    expect(keyErrs(withKeys({ open: 'op' }))).toEqual(['verbs.open.key › a verb\'s key is one character, not "op"']);
    expect(keyErrs(withKeys({ open: 1 }))).toEqual(["verbs.open.key › a verb's key is one character, not 1"]);
    expect(keyErrs(withKeys({ open: ' ' }))).toEqual([
      "verbs.open.key › a verb's key cannot be a space: Space advances a line of dialogue",
    ]);
    expect(keyErrs(withKeys({ push: 'p', pull: 'P' }))).toEqual(['verbs.pull.key › "P" is already the key of "push"']);
  });

  it('warns when the player could not turn the keys off: no settings menu, or its row untitled (4.3.0)', () => {
    const g = withKeys({ open: 'o' });
    expect(keyWarns(g)).toEqual([]);
    const settingsWarns = (x: GameDef) =>
      validate(x, {}).warnings.filter((w) => w.startsWith('settings ›') || w.startsWith('ui.verbKeys'));
    expect(settingsWarns(g)).toEqual([]);
    expect(settingsWarns({ ...g, settings: false })).toEqual([
      'settings › the verbs have keys but no settings menu: a player cannot turn them off (settings: true)',
    ]);
    const { verbKeys: _, ...ui } = g.ui;
    expect(settingsWarns({ ...g, ui })).toEqual([
      'ui.verbKeys › missing text for the settings menu (English default used)',
    ]);
    expect(settingsWarns({ ...structuredClone(demo), settings: false } as GameDef)).toEqual([]);
  });

  it('warns about a key the label does not contain (it works, but shows nowhere)', () => {
    expect(keyWarns(withKeys({ pull: 'y' }))).toEqual([
      'verbs.pull.key › "y" is not in the label "Pull": the button cannot underline it',
    ]);
  });

  it("checks each translation's keys, since the letters follow the words", () => {
    const g = withKeys({ close: 'c', take: 'p' });
    const errs: string[] = [];
    const o = { err: (w: string, m: string) => errs.push(`${w} › ${m}`), warn: () => {} };
    localeVerbKeyChecks(g, { fr: { 'verb:close/key': 'f', 'verb:take/key': 'F' } }, o);
    expect(errs).toEqual(['fr: verbs.take.key › "F" is already the key of "close"']);
    errs.length = 0;
    localeVerbKeyChecks(g, { en: { 'verb:take/key': 'c' }, fr: { 'verb:close/key': 'f' } }, o);
    expect(errs).toEqual([]);
  });
  it('validate checks them when given the translations, so the Studio says what the command line says (4.4.0)', () => {
    const g = withKeys({ close: 'c', take: 'p' });
    const clash = { fr: { 'verb:close/key': 'f', 'verb:take/key': 'F' } };
    expect(validate(g, miniLayouts, { locales: clash }).errors).toContain(
      'fr: verbs.take.key › "F" is already the key of "close"',
    );
    expect(validate(g, miniLayouts).errors.filter((e) => e.startsWith('fr:'))).toEqual([]);
  });
});

describe("the verbs' keys in translations and in the fingerprint (#203)", () => {
  it('is a text to translate, applied like the label, and an unchanged key is not "untranslated"', () => {
    const g = structuredClone(demo) as GameDef;
    g.verbs.find((v) => v.id === 'close')!.key = 'c';
    g.verbs.find((v) => v.id === 'open')!.key = 'o';
    expect(textPaths(g).filter((p) => p.path.endsWith('/key'))).toEqual([
      { path: 'verb:open/key', text: 'o' },
      { path: 'verb:close/key', text: 'c' },
    ]);
    const fr = applyLocale(g, { 'verb:close/label': 'Fermer', 'verb:close/key': 'f' });
    expect(fr.verbs.find((v) => v.id === 'close')).toMatchObject({ label: 'Fermer', key: 'f' });
    const s = localeStatus(g, { 'verb:open/key': 'o', 'verb:close/key': 'f' });
    expect(s.untranslated.filter((p) => p.endsWith('/key'))).toEqual([]);
  });

  it('leaves the presentation of a game without keys as it was, and moves it when a key is set', () => {
    const g = structuredClone(demo) as GameDef;
    const verbsOf = (x: GameDef) => (presentationOf(x) as { game: { verbs: object[] } }).game.verbs;
    const before = canonicalJson(presentationOf(g));
    expect(verbsOf(g)[0]).toEqual({ id: 'give', color: '#ff8fa3' });
    g.verbs[0]!.key = 'g';
    expect(verbsOf(g)[0]).toEqual({ id: 'give', color: '#ff8fa3', key: 'g' });
    expect(canonicalJson(presentationOf(g))).not.toBe(before);
  });
});
