// Game-specific Playwright playthrough of "The Pantry Key" (see scripts/e2e.mjs, scripts/e2e/lib.mjs, docs/en/TOOLS.md).
// Unlike a generic `harness.walkthrough(solverPath)` replay, this script:
//   - starts from the real title screen (New game button), not a `?dev&at=` checkpoint, and answers the opening
//     "guess" choice itself (not part of the solver's action path, see games/demo/game.ts start.intro);
//   - plays both minigames for real by tapping/dragging the actual widgets, instead of using `.mg-skip`:
//     pipes (rotate tiles until the water reaches the mushrooms) and pick (tap the right flower each round);
//   - plays the sealed ending's scratch ticket for real too (it has no skip button): drags strokes across its
//     canvas until the hidden text is revealed;
//   - reaches the final card and checks it shows a verdict on the player's guess and the ending's headline.
// `scripts/e2e.mjs` always launches its harness with `?dev` (so a plain `harness.walkthrough()` run skips the
// title screen on a checkpoint); this script instead re-navigates the same page to the bare URL first.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { solverResultOk } from '../../scripts/e2e/util.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

// --------------------------------------------------------------------------------- the solver's action path

/** `npx tsx tools/solve.ts --json` for GAME=demo: the session entries `scripts/e2e.mjs` would replay verbatim. We
 * reuse most of them (via harness.walkthrough on the parts that don't touch a minigame), and drive the three
 * minigame-triggering steps (pipes, pick, the sealed ending's scratch ticket) ourselves. */
function solveSteps() {
  const r = spawnSync('npx', ['tsx', 'tools/solve.ts', '--json'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GAME: 'demo' } });
  const out = (r.stdout ?? '').trim();
  if (!out) throw new Error(`games/demo/e2e.mjs: tools/solve.ts --json produced no output${r.stderr ? `: ${r.stderr}` : ''}`);
  const solved = JSON.parse(out.split('\n').pop());
  const verdict = solverResultOk(solved, r.status);
  if (!verdict.ok) throw new Error(`games/demo/e2e.mjs: ${verdict.reason}`);
  return solved.steps;
}

const isAct = (en, verb, a, b) => 'act' in en && en.act.verb === verb && en.act.a === a && en.act.b === b;

// --------------------------------------------------------------------------------- small helpers local to this game

/** Drives one of the tutorial's three guided steps (game.ts start.intro, `{ guide: { verb, target, say } }`):
 * while a guide is pending, the engine keeps `busy` false even mid-walk or mid-resolve (so the tutorial's own
 * reminder line can interrupt a wrong action), which races `harness.waitIdle`'s busy/speech/choices heuristic —
 * it can see "idle" before the guided action has actually finished and the guide cleared. Poll the engine's own
 * `guiding` field instead (authoritative), advancing speech and, for the "talk to grandma" step, closing the
 * topic list (tapping the last choice, "Bye!") until it does. */
async function doGuidedStep(h, verb, target, { max = 15000, interval = 100 } = {}) {
  await h.verbById(verb);
  await h.target(target);
  for (let waited = 0; waited < max; waited += interval) {
    const g = await h.page.evaluate(() => window.__game.engine.guiding);
    if (!g || g.verb !== verb || g.target !== target) break;
    const s = await h.state();
    if (s.speech) await h.tapScene(320, 10).catch(() => {});
    else if (s.choices) await h.page.locator('.side .choices .choice').last().tap();
    await h.page.waitForTimeout(interval);
  }
  await h.waitIdle();
}

/** Taps "Yes" on the title screen's "erase the saved game?" confirmation if it appears (it only does when a
 * save still exists despite the earlier `localStorage.clear()` — e.g. the dev checkpoint's own autosave write
 * racing that clear). Returns whether it had to. */
async function dismissEraseDialogIfAny(h, { max = 1500, interval = 100 } = {}) {
  for (let waited = 0; waited < max; waited += interval) {
    const yes = h.page.locator('.dim .warn');
    if (await yes.count()) { await yes.first().tap(); return true; }
    await h.page.waitForTimeout(interval);
  }
  return false;
}

/** Like `harness.waitIdle`, but never taps a minigame's `.mg-skip`: it stops as soon as `stopSelector` matches
 * (a minigame's own widgets have just appeared), advancing any speech bubble in the way first. Used right after
 * triggering one of the three steps that open a minigame, so the generic `waitIdle` never gets a chance to skip it. */
async function advanceUntil(h, stopSelector, { max = 20000, interval = 80 } = {}) {
  for (let waited = 0; waited < max; waited += interval) {
    if (await h.page.locator(stopSelector).count()) return;
    const s = await h.state();
    if (s.speech) { await h.tapScene(320, 10).catch(() => {}); await h.page.waitForTimeout(interval); continue; }
    await h.page.waitForTimeout(interval);
  }
  throw new Error(`games/demo/e2e.mjs: timed out waiting for ${stopSelector}`);
}

/** The ending card (showCard in src/engine/ending/card.ts) keeps the engine "busy" the whole time it is shown
 * (its promise only resolves on Replay), so the generic `waitIdle` would time out waiting for an idle state that
 * never comes. Advance the after-dialogue speech lines ourselves and stop once the two-button card is up. */
async function waitForCard(h, { max = 20000, interval = 100 } = {}) {
  for (let waited = 0; waited < max; waited += interval) {
    const s = await h.state();
    if (s.speech) { await h.tapScene(320, 10).catch(() => {}); await h.page.waitForTimeout(interval); continue; }
    if ((await h.page.locator('.overlay:not(.mapview) .bigbtn').count()) >= 2) return;
    await h.page.waitForTimeout(interval);
  }
  throw new Error('games/demo/e2e.mjs: the final card did not appear in time');
}

/** Plays the pipes minigame (src/engine/minigames/pipes.ts) for real: taps a tile enough times to pass its own
 * `helpAfter` hint threshold (15 taps by default), then repeatedly taps whichever tile the engine itself
 * highlights (`.mg-hl`, the first mis-rotated tile) until the grid fits and the minigame finishes on its own. */
async function playPipes(h) {
  const tileSel = '.overlay .mg-tile';
  if (!(await h.page.locator(tileSel).count())) throw new Error('games/demo/e2e.mjs: pipes minigame has no tiles');
  // The box fades in and redraws its tiles after every tap: let it settle, and tap where the tile is even if a
  // transition still covers it (a slow CI runner otherwise retries until the tile is replaced).
  await h.page.waitForTimeout(400);
  // The box removes itself once solved, sometimes while a tap waits for its tile: the tap gives up, and the count
  // check at the top of the next turn is what says "solved" (a CI runner hit that race once in 4.1.6).
  const tapTile = (loc) => loc.tap({ force: true, timeout: 5000 }).catch(() => {});
  for (let i = 0; i < 16; i++) {
    if (!(await h.page.locator(tileSel).count())) return; // solved already, by chance
    await tapTile(h.page.locator(tileSel).first());
    await h.page.waitForTimeout(60);
  }
  for (let guard = 0; guard < 200; guard++) {
    if (!(await h.page.locator(tileSel).count())) return; // the minigame box removed itself: solved
    const hinted = h.page.locator(`${tileSel}.mg-hl`);
    await tapTile(await hinted.count() ? hinted.first() : h.page.locator(tileSel).first());
    await h.page.waitForTimeout(80);
  }
  throw new Error('games/demo/e2e.mjs: could not solve the pipes minigame within the tap budget');
}

/** Plays the pick minigame (src/engine/minigames/pick.ts) for real: reads the room's own `rounds` parameters
 * (market.ts, the "Give token to seller" rule) straight from the loaded game, then for each round matches the
 * correct option's image id to the `<img src>` the engine actually rendered (order is shuffled per round) and
 * taps that button. */
async function playPick(h) {
  const rounds = await h.page.evaluate(() => {
    const market = window.__game.game.rooms.find((r) => r.id === 'market');
    const rule = market.on.find((r) => r.verb === 'give' && r.a === 'token' && r.b === 'seller');
    const mg = rule.do.find((d) => d && typeof d === 'object' && d.minigame === 'pick');
    return mg.params.rounds;
  });
  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];
    const wantId = round.options[round.answer];
    const wantSrc = await h.page.evaluate((id) => window.__game.bank.img(id), wantId);
    let idx = -1;
    for (let waited = 0; waited < 8000 && idx === -1; waited += 150) {
      const srcs = await h.page.$$eval('.overlay .mg-opt img', (imgs) => imgs.map((im) => im.getAttribute('src')));
      idx = srcs.indexOf(wantSrc);
      if (idx === -1) await h.page.waitForTimeout(150);
    }
    if (idx === -1) throw new Error(`games/demo/e2e.mjs: pick minigame round ${i + 1}: could not find the right flower`);
    await h.page.locator('.overlay .mg-opt').nth(idx).tap();
    await h.screenshot(`pick-round-${i + 1}`);
    await h.page.waitForTimeout(700);
  }
}

/** Plays the sealed ending's scratch ticket (src/engine/minigames/scratch.ts) for real, with real pointer drags
 * (the canvas only listens for pointer events, which this also fires for a mouse — there is no skip button here
 * on purpose): sweeps rows of the canvas until enough of it is cleared to reveal the hidden text, then waits for
 * the minigame to close itself (it holds the reveal on screen for a few seconds first). */
async function playScratchTicket(h) {
  const canvasSel = '.overlay canvas';
  await h.page.waitForSelector(canvasSel, { timeout: 10000 });
  const box = await h.page.locator(canvasSel).boundingBox();
  if (!box) throw new Error('games/demo/e2e.mjs: scratch ticket canvas has no bounding box');
  const cols = Math.max(8, Math.round(box.width / 30));
  const rows = 9;
  sweep: for (let pass = 0; pass < 2; pass++) {
    for (let r = 0; r < rows; r++) {
      const y = box.y + ((r + 0.5) / rows) * box.height;
      await h.page.mouse.move(box.x + 2, y);
      await h.page.mouse.down();
      for (let c = 0; c <= cols; c++) {
        const x = box.x + (c / cols) * box.width;
        await h.page.mouse.move(x, y, { steps: 3 });
        if (!(await h.page.locator(canvasSel).count())) break sweep; // already revealed and gone
      }
      await h.page.mouse.up();
      const opacity = await h.page.locator(canvasSel).evaluate((el) => el.style.opacity).catch(() => '1');
      if (opacity === '0') break sweep; // revealed: stop scratching, just wait for the hold-time close below
    }
  }
  for (let waited = 0; waited < 10000; waited += 200) {
    if (!(await h.page.locator(canvasSel).count())) return;
    await h.page.waitForTimeout(200);
  }
  throw new Error('games/demo/e2e.mjs: the scratch ticket never revealed within the scrub budget');
}

// --------------------------------------------------------------------------------- the playthrough

export async function run(h) {
  // scripts/e2e.mjs always launches with `?dev` (no `at`): that lands on the first checkpoint, not the title
  // screen, and leaves a save behind. Clear it and re-navigate the same page to the bare URL, so New Game is a
  // real tap straight into a fresh game (dismissEraseDialogIfAny below is a safety net in case the dev
  // checkpoint's own autosave write races this clear and a save slips through anyway).
  await h.page.evaluate(async () => {
    try { localStorage.clear(); } catch { /* ignore */ }
    // The v3 autosave and slots live in IndexedDB.
    await new Promise((r) => { const q = indexedDB.deleteDatabase('web-scumm-saves'); q.onsuccess = q.onerror = q.onblocked = () => r(undefined); });
  });
  const bare = new URL(h.page.url());
  bare.search = '';
  await h.page.goto(bare.toString());
  await h.page.waitForFunction(() => !!window.__game, null, { timeout: 15000 });

  const steps = solveSteps();
  const iPipes = steps.findIndex((en) => isAct(en, 'use', 'pipe', 'tank'));
  const iPick = steps.findIndex((en) => isAct(en, 'give', 'token', 'seller'));
  const iFinale = steps.findIndex((en) => isAct(en, 'use', 'key', 'pantry'));
  // steps[0] is the new game itself (the opening guess), steps[1..3] the three tutorial actions played below by hand
  const iFirst = 4;
  if (iPipes === -1 || iPick === -1 || iFinale === -1 || iFinale !== steps.length - 1 || !isAct(steps[1], 'look', 'pantry') || !isAct(steps[3], 'take', 'shell')) {
    throw new Error(`games/demo/e2e.mjs: unexpected solver steps, cannot locate the tutorial and the three minigame steps: ${JSON.stringify(steps.map((en) => 'act' in en ? en.act : en))}`);
  }

  // ---- title screen -> New game
  await h.page.waitForSelector('.overlay .bigbtn', { timeout: 15000 });
  await h.screenshot('title');
  await h.page.locator('.overlay .bigbtn').first().tap(); // "New game" is always the first button (src/engine/dom/app.ts showTitle)
  await dismissEraseDialogIfAny(h);

  // ---- the opening guess, then the guided tutorial: look at the pantry, talk to grandma, pick up the shell phone
  await h.waitIdle();
  await h.say('Sardines. Obviously.');
  await h.screenshot('house-entrance');
  await doGuidedStep(h, 'look', 'pantry');
  await h.screenshot('walk-tutorial-001');
  await doGuidedStep(h, 'talk', 'grandma');
  await h.screenshot('walk-tutorial-002');
  await doGuidedStep(h, 'take', 'shell');
  await h.screenshot('walk-tutorial-003');
  // the rest of the pre-pipes path: open the armchair, open the window into the garden, take the pipe
  await h.walkthrough(steps.slice(iFirst, iPipes));
  await h.screenshot('garden-entrance');

  // ---- the pipes minigame, played for real
  await h.verbById('use'); await h.target('pipe'); await h.target('tank');
  await advanceUntil(h, '.overlay .mg-tile');
  await h.screenshot('pipes-minigame-start');
  await playPipes(h);
  await h.screenshot('pipes-minigame-solved');
  await h.waitIdle(); // Grandpa's reaction to the sock

  // ---- read the sock, call Lou, travel to the market (steps iPipes+1 .. iPick-1)
  await h.walkthrough(steps.slice(iPipes + 1, iPick));
  await h.screenshot('market-entrance');

  // ---- the pick minigame, played for real
  await h.verbById('give'); await h.target('token'); await h.target('seller');
  await advanceUntil(h, '.overlay .mg-opt');
  await h.screenshot('pick-minigame-start');
  await playPick(h);
  await h.waitIdle(); // "Beautiful! I put it on the stall for you."

  // ---- take the bouquet, pay the seller, travel home (steps iPick+1 .. iFinale-1): includes the map travel
  for (const en of steps.slice(iPick + 1, iFinale)) {
    if ('travel' in en) {
      await h.openMap();
      await h.screenshot('map');
      await h.say(await h.page.evaluate((p) => window.__game.game.map.places[p].name, en.travel));
      // the map's own travel animation (the car/plane flying across) is cosmetic and outlives the engine's
      // "busy" state, so `say`'s waitIdle can return before the map overlay actually closes: wait for that too,
      // so the next screenshot shows the room itself, not the map mid-travel.
      for (let waited = 0; waited < 5000 && (await h.state()).map; waited += 100) await h.page.waitForTimeout(100);
    } else {
      await h.walkthrough([en]);
    }
  }
  await h.screenshot('house-entrance-2');

  // ---- open the pantry: the sardines cutscene, then the sealed ending's scratch ticket, played for real
  await h.verbById('use'); await h.target('key'); await h.target('pantry');
  await advanceUntil(h, '.overlay canvas');
  await h.screenshot('ending-scratch-ticket');
  await playScratchTicket(h);
  await h.screenshot('ending-scratch-revealed');

  // ---- the final card
  await waitForCard(h);
  await h.screenshot('ending-card');
  const card = await h.page.evaluate(() => {
    const overlays = [...document.querySelectorAll('.overlay:not(.mapview)')];
    for (const ov of overlays) {
      const box = [...ov.children].find((c) => c.querySelector && c.querySelector('.bigbtn'));
      if (!box) continue;
      const headline = box.children[0]?.textContent?.trim() ?? '';
      const verdictEl = [...box.children].find((c) => (c.getAttribute('style') || '').includes('border-radius:6px'));
      return { headline, verdict: verdictEl ? verdictEl.textContent.trim() : '' };
    }
    return null;
  });
  if (!card) throw new Error('games/demo/e2e.mjs: the final card never appeared');
  if (!card.verdict) throw new Error(`games/demo/e2e.mjs: the final card has no verdict text (headline: "${card.headline}")`);
  if (!card.headline) throw new Error('games/demo/e2e.mjs: the final card has no headline (the ending\'s title)');
  console.log(`games/demo/e2e.mjs: final card verdict = "${card.verdict}"`);
  console.log(`games/demo/e2e.mjs: final card headline = "${card.headline}"`);
  if (!(await h.ended())) throw new Error('games/demo/e2e.mjs: the final card is shown but engine.state.done is false');
  console.log('games/demo/e2e.mjs: the engine confirms the ending (state.done)');
}
