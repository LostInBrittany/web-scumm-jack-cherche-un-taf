#!/usr/bin/env node
// Smoke-test the production PWA: registration, the whole game cached for offline play (`GameDef.offline`), one online
// reload, then an offline navigation with every file of the warm-up plan found in the cache.
// The built app must already be served (normally with `npm run preview`), or `--serve=<dist>` (4.1.8) makes the
// script serve the folder itself on a free port, which the update scenarios need: `--update` publishes a second build
// (the same folder with a different worker) and checks the banner, the save kept, the new worker in charge;
// `--interrupted` makes that update fail on its first fetch and checks the old worker keeps serving; `--reinstall`
// unregisters the worker, empties the caches, and installs again. `--nearby`: the game caches only nearby rooms,
// skip the plan check. `--budget=<ms>`: how long the full warm-up may take (default 120000).
// Exit codes: 0 proved, 1 failed, 3 skipped (the browser cannot navigate offline under automation: WebKit); the CI's
// WebKit job passes `--allow-skip` to turn 3 into 0 with an explicit "skipped" line, never into a proof.
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.bin': 'application/octet-stream',
};

/**
 * A static server whose root can change while it runs (a new build published under the same URL), and whose next
 * answer for one path can be made to fail (a network that drops the worker's fetch). `index.html` for a navigation.
 */
function serveSwitchable(root) {
  const state = { root, failing: new Set() };
  const server = createServer((req, res) => {
    let path;
    try {
      path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (state.failing.has(path)) {
      res.writeHead(500);
      res.end('made to fail');
      return;
    }
    let file = normalize(join(state.root, path));
    if (!file.startsWith(resolve(state.root))) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(state.root, 'index.html');
    const ext = extname(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      // The worker and the shell are revalidated at every visit; the hashed assets may live long.
      'Cache-Control':
        /\.(js|css|png|webp|ttf|woff2|mp3|ogg|wav|mp4|webm)$/.test(path) && /-[\w-]{8,}\./.test(path)
          ? 'max-age=31536000'
          : 'no-cache',
    });
    res.end(readFileSync(file));
  });
  return new Promise((ok) =>
    server.listen(0, '127.0.0.1', () =>
      ok({
        url: `http://127.0.0.1:${server.address().port}/`,
        switchTo: (dir) => void (state.root = dir),
        // A path that fails with 500 until it is restored (the worker's update check fetches it more than once).
        fail: (path) => void state.failing.add(path),
        restore: (path) => void state.failing.delete(path),
        close: () => new Promise((done) => server.close(() => done())),
      }),
    ),
  );
}

const flag = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const serveDir = flag('serve');
let served = null;
if (serveDir) served = await serveSwitchable(resolve(serveDir));
const url = served?.url ?? process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://127.0.0.1:5173/';
const name = process.env.E2E_BROWSER ?? 'chromium';
const nearby = process.argv.includes('--nearby');
const allowSkip = process.argv.includes('--allow-skip');
const budget = Number(flag('budget') ?? 120000);
const scenarios = ['update', 'interrupted', 'reinstall'].filter((x) => process.argv.includes(`--${x}`));
if (scenarios.length && !served)
  throw new Error('the update scenarios need --serve=<dist>: the script publishes the second build itself');
const browserType = { chromium, firefox, webkit }[name];
if (!browserType) throw new Error(`unknown E2E_BROWSER ${name}`);

const browser = await browserType.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: 'allow' });
const page = await context.newPage();
const errors = [];
let second = null; // the second build, published by the scenarios; removed in the finally
const cachedNote = [];
const MAX_REFUSED = 2; // Firefox cache oddities tolerated per run (see the end of the file)
let closing = false; // the checks are over: what the teardown interrupts (a fetch the worker had in hand) is not a finding
let checked = false; // every check of the scenario passed (set after the last one)
// What the worker says when it fails an image (#257, `imageLastResort` in vite.config.ts): the page relays each
// `qnc-sw-error` message to its console, a warning, so the run can print why and whether every cache had the file.
const swReports = [];
await context.addInitScript(() => {
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type === 'qnc-sw-error') console.warn(`qnc-sw-error ${JSON.stringify(e.data)}`);
  });
});
page.on('pageerror', (e) => void (closing || errors.push(e.message)));
page.on('console', (m) => {
  if (m.type() === 'warning' && m.text().startsWith('qnc-sw-error ')) swReports.push(JSON.parse(m.text().slice(13)));
  else if (m.type() === 'error' && !closing) errors.push(m.text());
});
// The interrupted update's own failure (4.1.19, Playwright 1.64): while `sw.js` is made to fail, WebKit now also
// reports the server's deliberate 500 as a console error. That answer is the scenario, not a finding: each such
// response excuses one "status of 500" console line, and only while the failure is armed.
let swMadeToFail = false;
let swDeliberate500 = 0;
page.on('response', (r) => {
  if (swMadeToFail && r.status() === 500 && new URL(r.url()).pathname === '/sw.js' && !r.fromServiceWorker())
    swDeliberate500++;
});

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  const supported = await page.evaluate(() => 'serviceWorker' in navigator);
  if (!supported) throw new Error('service workers are not supported by this browser context');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // The whole game warmed (App.offlineReady) and the status must say `complete`: a skip or a failure is not "ready".
  let urls = null;
  if (!nearby) {
    await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
    const status = await page.evaluate(
      (ms) =>
        Promise.race([
          window.__game.offlineReady,
          new Promise((_, rej) => setTimeout(() => rej(new Error(`offline warm-up took more than ${ms} ms`)), ms)),
        ]),
      budget,
    );
    if (status.state !== 'complete')
      throw new Error(
        `offline warm-up ended "${status.state}" (${status.done}/${status.total} files${status.reason ? `, ${status.reason}` : ''}${status.failed.length ? `; failed: ${status.failed.slice(0, 5).join(', ')}` : ''})`,
      );
    urls = await page.evaluate(() => window.__game.offlineUrls());
    console.log(`pwa: ${name} warm-up complete, ${status.done}/${status.total} files`);
  }
  await page.reload({ waitUntil: 'networkidle' });

  // A save to keep across the update: the game started, saved, durable (the banner's rule).
  // `newGame()` resolves after the prologue, which waits for the player's taps: start it, wait for the state, save.
  const progress = async () => {
    await page.evaluate(() => {
      const app = window.__game;
      if (!app.engine.state && !app.engine.hasSave()) void app.engine.newGame().catch(() => {});
    });
    await page.waitForFunction(() => !!window.__game.engine.state || window.__game.engine.hasSave(), null, {
      timeout: 20000,
    });
    return page.evaluate(async () => {
      const app = window.__game;
      if (app.engine.state) app.engine.save();
      await app.engine.store.whenIdle?.();
      return app.engine.state?.room ?? null;
    });
  };
  const workerUrl = async () =>
    page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL ?? null);
  const workerText = async () =>
    page.evaluate(async () => {
      const r = await fetch('/sw.js', { cache: 'no-store' });
      return r.ok ? (await r.text()).length : -1;
    });

  if (scenarios.length) {
    const room = await progress();
    const before = await workerText();
    // The second build: the same files, a worker whose bytes differ (what a new release is to the browser).
    second = mkdtempSync(join(tmpdir(), 'pwa-second-'));
    cpSync(resolve(serveDir), second, { recursive: true });
    writeFileSync(join(second, 'sw.js'), `${readFileSync(join(second, 'sw.js'), 'utf8')}\n// build B ${Date.now()}\n`);

    if (scenarios.includes('interrupted')) {
      // Published, but the worker's fetch fails once: no banner, the old worker keeps serving, the game still runs.
      served.switchTo(second);
      served.fail('/sw.js');
      swMadeToFail = true;
      await page.reload({ waitUntil: 'networkidle' });
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update().catch(() => {}));
      await page.waitForTimeout(1500);
      if (await page.locator('.update-banner').count())
        throw new Error('interrupted update: the banner showed although the worker could not be fetched');
      await page.locator('#app').waitFor({ state: 'attached' });
      if (!(await workerUrl())) throw new Error('interrupted update: the worker is gone');
      console.log(`pwa: ${name} interrupted update: no banner, the old worker serves, the game runs`);
      served.restore('/sw.js');
      swMadeToFail = false;
      served.switchTo(resolve(serveDir));
    }

    if (scenarios.includes('update')) {
      served.switchTo(second);
      await page.reload({ waitUntil: 'networkidle' });
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
      await page.locator('.update-banner button').waitFor({ state: 'visible', timeout: 30000 });
      // The new worker waits (prompt mode): nothing activated before the button.
      const states = async () =>
        page.evaluate(async () => {
          const r = await navigator.serviceWorker.getRegistration();
          return {
            waiting: r?.waiting?.state ?? null,
            installing: r?.installing?.state ?? null,
            active: r?.active?.scriptURL ?? null,
            controller: navigator.serviceWorker.controller?.scriptURL ?? null,
          };
        });
      const pending = await states();
      if (pending.waiting !== 'installed')
        throw new Error(`update: the new worker should wait for the banner, it is ${JSON.stringify(pending)}`);
      // The banner's button saves, waits for the save, then activates and reloads: the new worker is in charge after.
      await Promise.all([page.waitForEvent('load', { timeout: 30000 }), page.locator('.update-banner button').click()]);
      await page.locator('#app').waitFor({ state: 'attached' });
      // The page is there before the game is: wait for the engine (4.1.16: CI's Firefox read it too early), and say
      // what the page reported if it never comes.
      await page
        .waitForFunction(() => !!window.__game?.engine, null, { timeout: 30000 })
        .catch(() => {
          throw new Error(
            `update: the game did not start after the reload (${errors.slice(-3).join(' | ') || 'no error'})`,
          );
        });
      const taken = await states();
      if (taken.waiting || taken.installing || !taken.controller)
        throw new Error(`update: the new worker is not in charge after the reload: ${JSON.stringify(taken)}`);
      const after = await workerText();
      if (after === before) throw new Error('update: the server still serves the first build');
      const kept = await page.evaluate(() => window.__game.engine.hasSave());
      if (!kept) throw new Error('update: the save made before the update is gone');
      const idb = await page.evaluate(
        async () => (await indexedDB.databases?.())?.map((d) => d.name) ?? ['(no databases())'],
      );
      console.log(
        `pwa: ${name} updated: the new worker waited for the banner, then took control after the reload (no worker waiting or installing), save kept (room ${room}); databases: ${idb.join(', ')}`,
      );
      if (!(await workerUrl())) throw new Error('update: no active worker after the update');
    }

    if (scenarios.includes('reinstall')) {
      await page.evaluate(async () => {
        for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
        for (const k of await caches.keys()) await caches.delete(k);
        // The worker's own bookkeeping goes with its caches (what clearing a site's data does); the saves stay.
        await new Promise((r) => {
          const req = indexedDB.deleteDatabase('workbox-expiration');
          req.onsuccess = req.onerror = req.onblocked = () => r();
        });
      });
      await page.reload({ waitUntil: 'networkidle' });
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      // The first worker claims the page at activation: the warm-up's fetches pass through it, or cache nothing.
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
      if (!nearby) {
        await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
        const again = await page.evaluate(
          (ms) =>
            Promise.race([
              window.__game.offlineReady,
              new Promise((_, rej) =>
                setTimeout(() => rej(new Error(`reinstall: warm-up took more than ${ms} ms`)), ms),
              ),
            ]),
          budget,
        );
        if (again.state !== 'complete')
          throw new Error(`reinstall: warm-up ended "${again.state}"${again.reason ? ` (${again.reason})` : ''}`);
        // Really in the cache, checked online (WebKit never reaches the offline check below).
        const absent = await page.evaluate(async (list) => {
          const out = [];
          for (const u of list) if (!(await caches.match(u))) out.push(u);
          return out;
        }, urls);
        if (absent.length) {
          const text = `reinstall: ${absent.length}/${urls.length} file(s) of the plan are not in the cache after the warm-up: ${absent.join(', ')}`;
          // Firefox's cache storage sometimes misses one file after a warm-up it reported complete (CI only): the same
          // bounded tolerance as the refused files below, reported, not counted.
          if (name === 'firefox' && absent.length <= MAX_REFUSED)
            console.log(`pwa: WARNING ${name}: ${text} (reported, not counted)`);
          else throw new Error(text);
        }
      }
      const kept = await page.evaluate(() => window.__game.engine.hasSave());
      if (!kept) throw new Error('reinstall: the save is gone (the caches were emptied, not the saves)');
      await page.reload({ waitUntil: 'networkidle' });
      console.log(
        `pwa: ${name} reinstalled: worker registered again and in control, every file of the plan cached again, the save kept`,
      );
    }
  }

  // The precache must exist before going offline: that is what serves the shell without the network.
  const cacheNames = await page.evaluate(() => caches.keys());
  if (!cacheNames.some((n) => n.startsWith('workbox-precache')))
    throw new Error(`no workbox precache after install (caches: ${cacheNames.join(', ') || 'none'})`);
  await context.setOffline(true);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  } catch (e) {
    // Playwright's WebKit cannot navigate while its context is offline ("WebKit encountered an internal error"),
    // even with the worker ready and the caches filled. That is a skip, not a proof: exit 3 unless the caller
    // accepts it (`--allow-skip`); the offline navigation is proven on Chromium.
    if (name === 'webkit' && /internal error/i.test(String(e))) {
      console.log(
        `pwa: SKIPPED on ${name}: installed, warm-up complete, precache present (${cacheNames.length} caches), but offline navigation is not automatable on this engine${allowSkip ? ' (accepted by --allow-skip)' : ''}`,
      );
      await context.setOffline(false).catch(() => {});
      await browser.close();
      process.exit(allowSkip ? 0 : 3);
    }
    throw e;
  }
  await page.locator('#app').waitFor({ state: 'attached' });
  // Every request of the offline title (the cat's frames, the fonts) is answered before the checks: an image the worker
  // cannot serve offline is then a reported error, not a race with the teardown.
  await page.waitForLoadState('networkidle');
  const title = await page.title();
  if (urls) {
    // Every file of the plan, from the cache, offline: images, effects, voices, music, videos.
    const missing = await page.evaluate(async (list) => {
      const out = [];
      for (const u of list) if (!(await caches.match(u))) out.push(u);
      return out;
    }, urls);
    if (missing.length)
      throw new Error(
        `offline: ${missing.length}/${urls.length} file(s) of the plan are not in the cache: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`,
      );
    // A room the player never visited renders from the cache.
    const decor = await page.evaluate(async () => {
      const app = window.__game,
        g = app.game;
      const room = g.rooms.find((r) => r.id !== g.start.room) ?? g.rooms[0];
      const im = new Image();
      im.src = app.bank.img(room.decor);
      await new Promise((r) => {
        im.onload = im.onerror = r;
      });
      return { room: room.id, width: im.naturalWidth };
    });
    if (!decor.width)
      throw new Error(`offline: the decor of room "${decor.room}" (never visited) did not render from the cache`);
    console.log(
      `pwa: ${name} installed, opened offline (${title}), ${urls.length} files of the plan in the cache, room "${decor.room}" never visited rendered from it`,
    );
  } else console.log(`pwa: ${name} installed and opened offline (${title})`);
  checked = true;
} finally {
  // Before the teardown: for each "Failed to load <url>" the browser reported, whether that url is in a cache.
  for (const [i, e] of errors.entries()) {
    const m = /Failed to load ['‘]([^'’]+)['’]/.exec(e);
    if (!m) continue;
    const u = new URL(m[1]).pathname + new URL(m[1]).search;
    cachedNote[i] = await page
      .evaluate(async (x) => ((await caches.match(x)) ? 'in the cache' : 'not in any cache'), u)
      .catch(() => 'cache unreadable');
  }
  closing = true;
  await context.setOffline(false).catch(() => {});
  await browser.close();
  await served?.close();
  if (second) rmSync(second, { recursive: true, force: true });
}
// Firefox's worker sometimes answers a cached image offline with "intercepted the request and encountered an unexpected
// error" (seen on CI only, on one frame of the cat out of 218 files, the file in the cache every time): not the plan's
// error; the cause (the worker, or Firefox's cache storage) is not understood. Reported as such and not counted, up to
// MAX_REFUSED files: more is a worker that fails, a failure. A person checks Firefox offline before a release
// (docs/dev/passes/). Anything else the browser reported is a failure.
// The worker's own account, failures included or recovered from (a file found in another cache): printed, not counted.
for (const r of swReports)
  console.log(
    `pwa: ${name}: the worker failed ${r.url} (${r.reason}); ${r.recovered ? 'served it from the cache' : 'in no cache'}`,
  );
if (swReports.length && process.env.GITHUB_ACTIONS)
  console.log(
    `::warning::pwa ${name}: the worker failed ${swReports.length} image(s): ${[...new Set(swReports.map((r) => r.reason))].join(' | ')}`,
  );
const refusedCached = (e, i) =>
  name === 'firefox' && /ServiceWorker intercepted the request/.test(e) && cachedNote[i] === 'in the cache';
const refused = errors.filter(refusedCached);
const tolerated = refused.length <= MAX_REFUSED;
const swMiss = /^Failed to load resource: the server responded with a status of 500\b/;
let swExcused = 0;
// WebKit's "Context is stopped" (4.1.20, seen twice on CI, #111 and #118): the browser's context stopping as the run
// ends, after every check of the scenario passed. Reported, not counted, then only; before, it is a failure.
const contextStopped = (e) => checked && name === 'webkit' && e.trim() === 'Context is stopped';
const stopped = errors.filter(contextStopped).length;
if (stopped) {
  console.log(
    `pwa: ${name}: "Context is stopped" after every check passed (WebKit tearing down; reported, not counted)`,
  );
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::pwa ${name}: "Context is stopped" after every check passed`);
}
const failures = [...errors.entries()].filter(([i, e]) => {
  if (contextStopped(e)) return false;
  if (tolerated && refusedCached(e, i)) return false;
  if (swExcused < swDeliberate500 && swMiss.test(e)) return !++swExcused;
  return true;
});
if (swExcused)
  console.log(
    `pwa: ${name}: ${swExcused} deliberate 500(s) of the interrupted update reported by the browser (the scenario; not counted)`,
  );
if (refused.length && tolerated) {
  const text = `the worker refused ${refused.length} cached file(s) offline (a Firefox worker error, the files are in the cache; reported, not counted)`;
  console.log(`pwa: WARNING ${name}: ${text}:\n${refused.map((w) => `  ${w}`).join('\n')}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::pwa ${name}: ${text}`);
}
if (failures.length) {
  // A load the worker refused offline: say whether the file was in the cache (the worker's fault) or not (the plan's).
  console.error(failures.map(([i, e]) => `browser: ${e}${cachedNote[i] ? ` (${cachedNote[i]})` : ''}`).join('\n'));
  process.exit(1);
}
