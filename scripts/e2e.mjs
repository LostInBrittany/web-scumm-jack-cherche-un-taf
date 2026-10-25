#!/usr/bin/env node
// npm run e2e [url] [--game demo] [--at=<checkpoint>] [--prod] [--generic] [--keyboard]
// Plays a quest'n'click game by touch in a phone-sized browser (E2E_BROWSER=chromium|webkit|firefox).
//   - If games/<GAME>/e2e.mjs exists, it is loaded and must export `run(harness)`: a game-specific walkthrough,
//     free to call the generic harness and to play its own minigames for real instead of skipping them.
//   - Otherwise, this script asks `npm run solve -- --json` for an action path and replays it with
//     harness.walkthrough(steps).
// Screenshots land in E2E_OUT (default /tmp/e2e). The server (dev or deployed) must already answer at <url>.
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { launch } from './e2e/lib.mjs';
import { solverResultOk } from './e2e/util.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5173/';
// Flags accept both "--name value" and "--name=value".
const flag = (name) => {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
};
const at = flag('at');
const prod = args.includes('--prod');
const generic = args.includes('--generic');
const keyboard = args.includes('--keyboard');
// --lang <xx>: play in that language and fail on any visible English default of the engine (`harness.leaks()`).
const lang = flag('lang');
// --renderer canvas|dom: every room drawn by that painter (D10: the canvas painter must play the same game).
const renderer = flag('renderer');
// --save: after the walkthrough, a manual save must survive a reload; --no-indexeddb: with the browser offering no
// IndexedDB, so the localStorage fallback is exercised.
const saveCheck = args.includes('--save');
// --axe: axe-core on the title, a room, the pause menu and the ending; a serious or critical violation fails the run.
const axeCheck = args.includes('--axe');
const noIndexedDb = args.includes('--no-indexeddb');
// Same game resolution as tools/game.ts (env GAME, else package.json config.game, else "demo"); --game overrides both.
const GAME = flag('game') ?? process.env.GAME ?? 'demo';

console.log(
  `e2e: ${url} (game: ${GAME}, browser: ${process.env.E2E_BROWSER ?? 'chromium'}, ${prod ? 'production' : 'development'}${keyboard ? ', keyboard' : ''}${lang ? `, lang ${lang}` : ''}${renderer ? `, ${renderer} painter` : ''}${saveCheck ? ', save round trip' : ''}${noIndexedDb ? ', no IndexedDB' : ''}${axeCheck ? ', axe' : ''})`,
);
const harness = await launch(url, {
  at,
  dev: !prod,
  input: keyboard ? 'keyboard' : undefined,
  lang,
  noIndexedDb,
  renderer,
});
let ok = true;
let passed = false;
// The stretches of `harness.errors` (from, to) in which WebKit may stop a Cache API call: the save round trip's reload
// and the teardown. See `contextStopped` below.
const stopWindows = [];
const stopWindow = async (run) => {
  const from = harness.errors.length;
  try {
    return await run();
  } finally {
    stopWindows.push([from, harness.errors.length]);
  }
};
const axeFound = [];
try {
  if (axeCheck) axeFound.push(...(await harness.axe('title')));
  const gameScript = resolve(ROOT, 'games', GAME, 'e2e.mjs');
  if (!generic && existsSync(gameScript)) {
    console.log(`e2e: playing games/${GAME}/e2e.mjs`);
    const { run } = await import(pathToFileURL(gameScript).href);
    await run(harness);
  } else {
    console.log('e2e: no games/<id>/e2e.mjs — replaying `npm run solve -- --json`');
    const r = spawnSync('npx', ['tsx', 'tools/solve.ts', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, GAME },
    });
    const stdout = (r.stdout ?? '').trim();
    if (!stdout) throw new Error(`npm run solve -- --json produced no output${r.stderr ? `: ${r.stderr}` : ''}`);
    const solved = JSON.parse(stdout.split('\n').pop());
    const verdict = solverResultOk(solved, r.status);
    if (!verdict.ok) throw new Error(`the solver's path cannot prove the game: ${verdict.reason}`);
    console.log(`e2e: replaying ${solved.steps.length} step(s) from the solver`);
    await harness.walkthrough(solved.steps);
    if (!(await harness.ended()))
      throw new Error(
        "the solver's path was replayed but the game did not reach its ending (engine.state.done is false)",
      );
    console.log('e2e: the ending was reached');
  }
  if (lang) {
    // The release-language check: nothing visible may be an English default of the engine, on the screen as it is
    // after the walkthrough and in the pause menu (where most of the engine's own texts live).
    const found = new Set(await harness.leaks());
    await harness.page.evaluate(() => window.__game.pauseMenu());
    for (const t of await harness.leaks()) found.add(t);
    await harness.page.keyboard.press('Escape').catch(() => {});
    if (found.size)
      throw new Error(
        `language "${lang}": ${found.size} visible text(s) are the engine's English defaults: ${[...found].join(' | ')} (add the keys to the game's ui / locales)`,
      );
    console.log(`e2e: no English default visible in "${lang}"`);
  }
  if (axeCheck) {
    axeFound.push(...(await harness.axe('ending')));
    // A room and its pause menu: back to the first checkpoint (or the start room), then the menu.
    await harness.page.evaluate(async () => {
      const g = window.__game;
      const cp = Object.keys(g.game.checkpoints ?? {})[0];
      if (cp) await g.engine.checkpoint(cp);
      else await g.engine.teleport(g.game.start.room);
    });
    await harness.page.waitForTimeout(800);
    axeFound.push(...(await harness.axe('room')));
    await harness.page.evaluate(() => window.__game.pauseMenu());
    axeFound.push(...(await harness.axe('pause menu')));
    await harness.page.keyboard.press('Escape').catch(() => {});
    if (axeFound.length)
      throw new Error(`axe: ${axeFound.length} serious or critical violation(s):\n  ${axeFound.join('\n  ')}`);
    console.log('e2e: axe found no serious or critical violation (title, room, pause menu, ending)');
  }
  if (saveCheck) {
    const r = await stopWindow(() => harness.saveRoundTrip());
    if (!r.same) throw new Error(`a manual save did not come back identical after a reload (store ${r.store})`);
    if (noIndexedDb && r.store !== 'localStorage')
      throw new Error(`without IndexedDB the game should use its localStorage store, it used ${r.store}`);
    if (!noIndexedDb && r.store !== 'IndexedDB')
      throw new Error(`the game should use its IndexedDB store, it used ${r.store}`);
    console.log(`e2e: a manual save survived a reload (${r.store})`);
  }
  console.log('e2e: done');
  passed = true;
} catch (e) {
  ok = false;
  console.error('e2e: FAILED —', e.message);
  try {
    console.error('e2e: engine at failure:', JSON.stringify(await harness.diagnose()));
  } catch {
    /* page gone */
  }
} finally {
  if (passed) await stopWindow(() => harness.close());
  else await harness.close();
}
// WebKit's "Context is stopped" (as in scripts/e2e-pwa.mjs since 4.1.20; here first on #139, 18 Oct 2026; in the
// save round trip's reload on #263): a document going away (a reload, the browser closing) with a Cache API call of
// the offline warm-up in flight. WebKit logs it itself, as a console error of source JS ("Cache API operation failed:
// <reason>"), even when the page catches the promise, and Playwright's WebKit reports that as a `pageerror`: the page
// cannot silence it. Reported, not counted, only when it came during the reload or the teardown of a run whose every
// check passed, and only in its seen form on WebKit; anything else is a failure.
const contextStopped = (e, i) =>
  passed &&
  stopWindows.some(([from, to]) => i >= from && i < to) &&
  (process.env.E2E_BROWSER ?? 'chromium') === 'webkit' &&
  /^pageerror (\w+: )?Cache API operation failed: Context is stopped on /.test(String(e));
const stopped = harness.errors.filter(contextStopped);
if (stopped.length) {
  console.log(`e2e: webkit: "Context is stopped" during a reload or the teardown (reported, not counted)`);
  if (process.env.GITHUB_ACTIONS)
    console.log('::warning::e2e webkit: "Context is stopped" during a reload or the teardown');
}
const browserErrors = harness.errors.filter((e, i) => !contextStopped(e, i));
if (browserErrors.length) {
  console.error(`e2e: ${browserErrors.length} browser error(s):`);
  browserErrors.forEach((e) => console.error('  ' + e));
  ok = false;
}
process.exit(ok ? 0 : 1);
