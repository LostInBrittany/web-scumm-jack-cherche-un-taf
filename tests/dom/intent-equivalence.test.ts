// @vitest-environment happy-dom
// "Intentions DOM = intentions Canvas" (4.1.11, programme §7.5, D21): the same scripted input (verbs, the bag, the
// accessible targets, a choice, the keyboard's Escape) played on the player painted by the DOM and by the Canvas
// painter records the same session and the same semantic journal, at device pixel ratios 1, 2 and 3, on a phone and
// on a desktop screen, with and without reduced motion. The painter draws; it decides nothing. (The real-browser
// version, taps on pixels, is the e2e's: `npm run e2e:visual -- --renderer=canvas` and the a11y e2e on both painters.)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@engine/dom/app';
import { journalDiff, type SemanticEvent } from '@engine/core/journal';
import type { SessionEntry } from '@engine/core/types';
import { game as demo } from '../../games/demo/game';
import { mini, miniLayouts } from '../fixtures/mini';

interface Screen {
  dpr: 1 | 2 | 3;
  size: 'phone' | 'desktop';
  reduceMotion: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits until the engine is idle and no line is on screen (a line is dismissed, as a tap would). */
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

const click = (sel: string) => {
  const b = document.querySelector<HTMLElement>(sel);
  if (!b) throw new Error(`nothing to click: ${sel}`);
  b.click();
};

async function play(painter: 'dom' | 'canvas', screen: Screen) {
  document.body.innerHTML = '';
  Object.defineProperty(window, 'devicePixelRatio', { value: screen.dpr, configurable: true });
  const [w, h] = screen.size === 'phone' ? [844, 390] : [1280, 800];
  vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({ width: w, height: h } as DOMRect);
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q: string) =>
      ({
        matches: screen.size === 'desktop' && q.includes('fine'),
        addEventListener() {},
        removeEventListener() {},
      }) as never,
  );
  const app = new App({
    root: document.body,
    game: {
      ...mini(),
      ui: demo.ui,
      skin: demo.skin,
      // A conversation, so that a choice is part of the script.
      rooms: mini().rooms.map((r) =>
        r.id === 'a'
          ? {
              ...r,
              on: [
                ...(r.on ?? []),
                {
                  verb: 'look',
                  a: 'uncle',
                  do: [
                    {
                      choice: [
                        { text: 'Hi', do: [{ set: 'hi' }] },
                        { text: 'Bye', do: [{ lose: 'badge' }, { set: 'bye' }] },
                      ],
                    },
                  ],
                },
              ],
            }
          : r,
      ),
    },
    layouts: miniLayouts,
    manifest: { images: {} },
  });
  app.view.forced = painter;
  // The fallback lines draw at random: the same draws for every run (the dice are the engine's, not the painter's).
  let k = 0;
  app.engine.random = () => [0.2, 0.7, 0.4][k++ % 3]!;
  app.settings.reduceMotion = screen.reduceMotion;
  app.applySettings();
  await app.engine.newGame();
  await settle(app);
  expect(app.view.painter).toBe(painter);
  // Look at the suitcase: the verb, then its accessible target.
  click('[data-verb="look"]');
  click('.a11y-target[data-target="valise"]');
  await settle(app);
  // Use the key on the suitcase: the verb, the key in the bag, the target.
  click('[data-verb="use"]');
  click('.slot[data-id="cle"]');
  click('.a11y-target[data-target="valise"]');
  await settle(app);
  // Give the badge to the uncle (an item picked without a verb: the target decides).
  click('.slot[data-id="badge"]');
  click('.a11y-target[data-target="uncle"]');
  await settle(app);
  // Look at the uncle: a choice, its second row.
  click('[data-verb="look"]');
  click('.a11y-target[data-target="uncle"]');
  for (let i = 0; i < 200 && !document.querySelector('.choice'); i++) await sleep(5);
  (document.querySelectorAll<HTMLElement>('.choice')[1] as HTMLElement).click();
  await settle(app);
  // Escape opens the pause menu (the presenter's), and closes it: nothing for the engine.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const log = app.engine.session!.log.map(({ t: _, ...e }) => e as SessionEntry);
  const journal: SemanticEvent[] = app.engine.journal.since(app.engine.sessionSeq);
  app.destroy();
  return { log, journal };
}

describe('the same input, painted by the DOM or by the Canvas painter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  const screens: Screen[] = [
    { dpr: 1, size: 'phone', reduceMotion: false },
    { dpr: 2, size: 'desktop', reduceMotion: true },
    { dpr: 3, size: 'phone', reduceMotion: true },
  ];

  it('records the same session and the same semantic journal, on every screen', async () => {
    // happy-dom has no canvas, and no server for the warm-up: a recording context, a 404 at once.
    const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    const runs: { name: string; log: SessionEntry[]; journal: SemanticEvent[] }[] = [];
    for (const s of screens)
      for (const painter of ['dom', 'canvas'] as const) {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 404 }));
        runs.push({
          name: `${painter} dpr${s.dpr} ${s.size}${s.reduceMotion ? ' reduced' : ''}`,
          ...(await play(painter, s)),
        });
      }
    const [first] = runs;
    expect(first!.log.filter((e) => 'act' in e).map((e) => ('act' in e ? e.act : null))).toEqual([
      { verb: 'look', a: 'valise' },
      { verb: 'use', a: 'cle', b: 'valise' },
      { verb: 'give', a: 'badge', b: 'uncle' },
      { verb: 'look', a: 'uncle' },
    ]);
    expect(first!.journal.map((e) => e.kind)).toEqual(expect.arrayContaining(['itemLost', 'flagChanged', 'saveMade']));
    for (const r of runs) {
      expect(r.log, r.name).toEqual(first!.log);
      expect(journalDiff(r.journal, first!.journal), r.name).toBe(-1);
    }
  }, 60000);
});
