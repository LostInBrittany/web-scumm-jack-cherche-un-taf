#!/usr/bin/env node
// The weight budget against the bytes a browser really transfers (wiki/en/create.checking.md#commands, `npm run weight`). A first visit to the
// production build in Chromium, the background warm-ups off (Save-Data), from the title through New Game until the
// first room is playable and the service worker has installed: every request is matched to an asset key, and
//   - a request outside the predicted initial scope (`npm run weight -- --json`: the app shell, the title, the first
//     room) fails: the asset graph missed a file;
//   - the bytes transferred must be within --tolerance (default 10%) of the prediction, or below it: the graph
//     over-approximates on purpose (every variant, every character who could be there), never the other way.
// The built app must already be served (`npm run preview`) and built from the same tree (`DIST_DIR`, default dist).
// Exit codes: 0 within the prediction, 1 not.
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';

const url = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://127.0.0.1:5173/';
const tolerance = Number(process.argv.find((a) => a.startsWith('--tolerance='))?.split('=')[1] ?? 0.1);
// Save-Data below: the music director steps aside, the single mixes play: the prediction's default.
const w = spawnSync('npx', ['tsx', 'tools/weight.ts', '--json'], { encoding: 'utf8', env: process.env });
const pred = JSON.parse(w.stdout.trim().split('\n').pop());
const predicted = new Set(pred.initialKeys);
/** `shell:index.html#again`: the second download of a file the page and the service worker both fetch. */
const file = (k) => k.replace(/#again$/, '');
if (![...predicted].some((k) => k.startsWith('shell:'))) {
  console.error('✖  no app shell in the prediction: build first (npm run build:web), or set DIST_DIR');
  process.exit(1);
}

/** The asset key of a URL the game requested. */
const base = new URL(url);
function keyOf(u) {
  const p = decodeURIComponent(new URL(u).pathname).replace(base.pathname, '');
  let m;
  if ((m = p.match(/^assets\/img\/(.+)\.webp$/))) return `img:${m[1]}`;
  if ((m = p.match(/^assets\/audio\/(sfx|music|voices)\/(.+)$/)))
    return `${m[1] === 'voices' ? 'voice' : m[1]}:${m[2]}`;
  if ((m = p.match(/^assets\/video\/(.+)$/))) return `video:${m[1]}`;
  return `shell:${p === '' ? 'index.html' : p}`;
}

const browser = await chromium.launch();
const context = await browser.newContext({
  serviceWorkers: 'allow',
  viewport: { width: 932, height: 430 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
});
// Save-Data: the warm-ups of nearby rooms and of the whole game stay off, so what is measured is what play needs.
await context.addInitScript(() =>
  Object.defineProperty(navigator, 'connection', {
    value: { saveData: true, effectiveType: '4g', addEventListener() {} },
    configurable: true,
  }),
);
const got = new Map();
context.on('requestfinished', async (req) => {
  if (!req.url().startsWith(base.origin)) return;
  try {
    const s = await req.sizes();
    const res = await req.response();
    const k = keyOf(req.url());
    const prev = got.get(k) ?? { bytes: 0, encoded: false, n: 0 };
    got.set(k, {
      bytes: prev.bytes + s.responseBodySize,
      encoded: prev.encoded || !!(await res?.headerValue('content-encoding')),
      n: prev.n + 1,
    });
  } catch {
    /* a request the page abandoned */
  }
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let failed = false;
try {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
  const newGame = page.locator('.overlay .bigbtn').first();
  await newGame.waitFor({ timeout: 20000 });
  await newGame.tap();
  // The first room drawn: its backdrop image (DOM painter) or its canvas (Canvas painter, which loads it as a bitmap;
  // the network going idle below covers that load).
  await page.waitForFunction(
    () => {
      const g = window.__game;
      return (
        g?.engine?.state &&
        !document.querySelector('.overlay') &&
        (document.querySelector('.scene img.bg')?.complete || !!document.querySelector('.scene canvas'))
      );
    },
    null,
    { timeout: 30000 },
  );
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return !!r.active;
  });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
} catch (e) {
  console.error(`✖  ${e.message}`);
  failed = true;
}
await browser.close();

const outside = [...got.keys()].filter((k) => !predicted.has(k));
const predictedFiles = new Set([...predicted].map(file));
const actual = [...got.values()].reduce((n, v) => n + v.bytes, 0);
// The prediction in the same encoding as what was sent: a compressed response is compared with the compressed size.
const expected = [...predicted].reduce(
  (n, k) => n + ((got.get(file(k))?.encoded ? pred.gzip[k] : undefined) ?? pred.sizes[k] ?? 0),
  0,
);
const kb = (b) => `${Math.round(b / 1024)} KB`;
console.log(
  `first visit: ${kb(actual)} transferred in ${[...got.values()].reduce((n, v) => n + v.n, 0)} requests (${got.size} files); predicted ${kb(expected)} for ${predictedFiles.size} files`,
);
const notLoaded = [...predictedFiles].filter((k) => !got.has(k));
if (notLoaded.length)
  console.log(
    `  predicted, not requested this visit (${notLoaded.length}): ${notLoaded.slice(0, 8).join(', ')}${notLoaded.length > 8 ? '…' : ''}`,
  );
if (process.env.E2E_WEIGHT_DEBUG)
  for (const [k, v] of [...got].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 25))
    console.log(`   ${k} ${kb(v.bytes)} ×${v.n}${v.encoded ? ' (encoded)' : ''} predicted ${kb(pred.sizes[k] ?? 0)}`);
for (const k of outside) console.log(`  ✖ requested, not predicted: ${k} (${kb(got.get(k).bytes)})`);
const over = actual > expected * (1 + tolerance);
const gap = expected ? (actual - expected) / expected : 0;
if (over) console.log(`  ✖ ${Math.round(gap * 100)}% over the prediction (tolerance ${Math.round(tolerance * 100)}%)`);
for (const e of errors) console.log(`  ✖ page error: ${e}`);
const ok = !failed && !outside.length && !over && !errors.length;
console.log(
  `${ok ? '✔' : '✖'}  weight prediction ${ok ? `holds: ${Math.round(-gap * 100)}% under it, nothing outside it` : 'broken'}`,
);
process.exit(ok ? 0 : 1);
