// @vitest-environment happy-dom
// The player's Remix (4.1.15): "Which world?" offers the story, a new world, a typed seed (an explicit error for a typo)
// and the daily challenge (verified offline with the manifest's key; disabled without a Bridge); the world is kept in
// the browser and a new game begins in it after the page starts again; a link names a world; the pause menu shows the
// code, or "hidden until the end" in a masked mode; the accessibility settings never touch the world.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  chooseWorld,
  frozenParam,
  keepWorld,
  storedWorld,
  takePendingStart,
  worldFromQuery,
  worldOf,
  worldRowText,
  type RemixHost,
} from '@engine/dom/remix-menu';
import { uiText, type UiKey } from '@engine/dom/ui-defaults';
import { applySettings, DEFAULT_SETTINGS } from '@engine/dom/settings';
import { applyVariant } from '@engine/core/remix/apply';
import { encodeSeedCode, isSeed } from '@engine/core/remix/seed-code';
import { sha256HexSync } from '@engine/core/remix/sha256';
import { canonicalJson } from '@engine/core/canonical';
import { dailyRoutes } from '../../bridge/src/daily';
import { game as reference } from '../../games/reference/game';

const host = (game = reference): RemixHost & { toasts: string[] } => {
  const toasts: string[] = [];
  return { game, t: (k: UiKey) => uiText(game.ui, k), presenter: { toast: (t) => toasts.push(t) }, toasts };
};
const click = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(label))!.click();

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('Which world?', () => {
  it('the story, a new world, or a typed seed (a typo is said, never another world)', async () => {
    const h = host();
    let p = chooseWorld(h, document.body);
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Which world?');
    click(document.body, 'Story');
    expect((await p)!.mode).toBe('story');

    p = chooseWorld(h, document.body);
    click(document.body, 'A new world');
    const random = (await p)!;
    expect(random.mode).toBe('remix');
    expect(isSeed(random.seed)).toBe(true);

    p = chooseWorld(h, document.body);
    const input = document.querySelector<HTMLInputElement>('input[name="seed"]')!;
    expect(document.querySelector(`label[for="${input.id}"]`)?.textContent).toBe('Type a seed');
    input.value = 'WS-0000-0001';
    input.form!.requestSubmit();
    expect(document.querySelector('.remix-error')!.textContent).toMatch(/Not a seed code/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    input.value = 'ws 0000 0000';
    input.form!.requestSubmit();
    const typed = (await p)!;
    expect(typed.seed).toBe('WS-0000-0000');
    expect(typed.hash).toBe(worldOf(reference, 'WS-0000-0000').hash);
  });
  it('Escape closes without a world; the daily entry needs the Bridge', async () => {
    const p = chooseWorld(host(), document.body);
    const daily = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes('Daily'),
    )!;
    expect(daily.disabled).toBe(true);
    expect(daily.textContent).toContain('needs the Bridge');
    document
      .querySelector('[role="dialog"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await p).toBeNull();
  });
  it('the daily challenge, verified offline with the key of the manifest', async () => {
    const fixture = JSON.parse(readFileSync('tests/fixtures/reference-daily-key.json', 'utf8'));
    const key = await crypto.subtle.importKey('jwk', fixture.jwk, { name: 'Ed25519' }, false, ['sign']);
    const b = dailyRoutes({ games: { reference: { daily: 'daily' } }, key, kid: fixture.kid, secret: 's' });
    const token = ((await b.handle({ method: 'GET', url: '/v1/daily?game=reference' }))!.body as { token: string })
      .token;
    const v = (await worldFromQuery(reference, new URLSearchParams({ daily: token })))!;
    expect(v.mode).toBe('daily');
    const p = chooseWorld(host(), document.body, async () => v);
    click(document.body, 'Daily challenge');
    expect((await p)!.hash).toBe(v.hash);
    await expect(worldFromQuery(reference, new URLSearchParams({ daily: `${token}x` }))).rejects.toThrow();
    expect((await worldFromQuery(reference, new URLSearchParams({ seed: encodeSeedCode(9) })))!.seed).toBe(
      encodeSeedCode(9),
    );
    // A frozen world: its own, kept; a forged one (out of domain, self-hashed) refused.
    const w = worldOf(reference, encodeSeedCode(4));
    expect((await worldFromQuery(reference, new URLSearchParams({ world: frozenParam(w) })))!.hash).toBe(w.hash);
    const { hash: _h, ...body } = { ...w, assignments: { ...w.assignments, 'seller-start': 'cellar' } };
    const forged = { ...body, hash: sha256HexSync(canonicalJson(body)) };
    await expect(worldFromQuery(reference, new URLSearchParams({ world: frozenParam(forged) }))).rejects.toThrow(
      /does not exist/,
    );
  });
});

describe('the world kept in the browser', () => {
  it('kept, read back, and a new game asked once', () => {
    const v = worldOf(reference, encodeSeedCode(3));
    keepWorld('reference', v, true);
    expect(storedWorld('reference')).toEqual(v);
    expect(takePendingStart('reference')).toBe(true);
    expect(takePendingStart('reference')).toBe(false);
  });
  it('the pause menu: the code, the story, or hidden until the end in a masked mode', () => {
    const remix = applyVariant(reference, worldOf(reference, encodeSeedCode(3)));
    expect(worldRowText(host(remix), false)).toBe(encodeSeedCode(3));
    expect(worldRowText(host(applyVariant(reference, worldOf(reference, 'story'))), false)).toBe('Story');
    const mystery = applyVariant(reference, worldOf(reference, encodeSeedCode(3), 'mystery'));
    expect(worldRowText(host(mystery), false)).toBe('hidden until the end');
    expect(worldRowText(host(mystery), true)).toBe(encodeSeedCode(3));
  });
  it('the accessibility settings never touch the world nor the seed', () => {
    const v = worldOf(reference, encodeSeedCode(11));
    keepWorld('reference', v);
    const game = applyVariant(reference, v);
    const app = {
      game,
      settings: { ...DEFAULT_SETTINGS, reduceMotion: true, textSize: 1.4, readableFont: true, captions: false },
      scene: document.createElement('div'),
      audio: { setVolumes: () => {} },
      view: { reduceMotion: false, room: null, refreshVisibility: () => {} },
      engine: { state: null },
    };
    applySettings(app as never);
    expect(storedWorld('reference')).toEqual(v);
    expect(game.variant).toEqual(v);
    expect(localStorage.getItem('reference.settings')).toContain('"reduceMotion":true');
    expect(localStorage.getItem('reference.settings')).not.toContain(v.seed);
  });
});
