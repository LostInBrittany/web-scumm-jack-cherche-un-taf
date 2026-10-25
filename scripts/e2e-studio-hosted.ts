// The hosted Studio in a browser (4.2.1 PR 7, plan §6.1 and §11): a Studio Server with a test OpenID provider, the
// built Studio's page (`npm run studio-client` first) on one origin and the game's previews on another (two names
// of the loopback: 127.0.0.1 and localhost, two sites). A member logs in through the provider and the Studio loads;
// the Rooms tab shows the room's editor from the game's origin; "Save layout" asks the editor for its layout and the
// Studio writes it (a new revision); a layout the editor sends unasked is ignored; the game's page cannot read the
// Studio's page nor call its API with the member's session; the Play tab runs the game there; after the logout the
// game's origin refuses the next request. Firefox and WebKit run over https, with a certificate made for the run
// (openssl) the browser is told to accept: WebKit keeps no `Secure` cookie over http, even on the loopback.
// WebKit on Linux (WebKitGTK, Playwright's on CI) stores no cookie a frame of another host sets, even one site: it
// cannot play the game's frames, nor stand for Safari, whose WebKit keeps the partitioned cookie (macOS: run here).
// Usage: tsx scripts/e2e-studio-hosted.ts [--browser=chromium|firefox|webkit] [--https]. Exit 0 / 1.
import { execFileSync } from 'node:child_process';
import { sign, verify } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer as createHttpsServer } from 'node:https';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { chromium, type Frame, firefox, type Page, webkit } from 'playwright';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { createStudio, importInChild, operationContext } from '../studio-server/src/ops/core';
import { StudioError } from '../studio-server/src/ops/errors';
import { Journal } from '../studio-server/src/ops/journal';
import { PersonalUndo } from '../studio-server/src/ops/undo';
import { spansOf } from '../studio-server/src/ops/spans';
import { Gate } from '../studio-server/src/server/auth/gate';
import { Oidc } from '../studio-server/src/server/auth/oidc';
import { authRoutes } from '../studio-server/src/server/auth/routes';
import { AuthStore, Sealer } from '../studio-server/src/server/auth/store';
import { StudioClient } from '../studio-server/src/server/client';
import { readJson, send, studioServer } from '../studio-server/src/server/http';
import { Leases } from '../studio-server/src/server/leases';
import { Presence } from '../studio-server/src/server/live';
import { Play } from '../studio-server/src/server/play';
import { HOSTED_SOLVE_MS } from '../studio-server/src/ops/diagnose';
import { Builds, signedBytes } from '../studio-server/src/server/builds';
import { PreparedAssets, prepareOn } from '../studio-server/src/server/prepared';
import { Health, judgeBy } from '../studio-server/src/server/health';
import { Previews } from '../studio-server/src/server/previews';
import { ServiceLease } from '../studio-server/src/server/service-lease';
import { localCut, localDiagnose, localPrepare, localPreview, localValidate } from '../studio-server/src/worker/local';
import { HostedAssets } from '../studio-server/src/server/hosted-assets';
import { createAssets } from '../tools/studio/assets';
import type { SolveData } from '../tools/studio/types';
import { newJobKeys, privateKeyOf, publicKeyOf } from '../studio-server/src/worker/job';
import { filesOf, packable, packAssets, packCut, packFiles, packSnapshot } from '../studio-server/src/worker/snapshot';
import { TestOp } from '../tests/fixtures/oidc-op';

const ROOT = join(import.meta.dirname, '..');
const CLIENT = join(ROOT, '.cache', 'studio-client');
const browserName = process.argv.find((a) => a.startsWith('--browser='))?.slice(10) ?? 'chromium';
const engine = { chromium, firefox, webkit }[browserName] ?? chromium;
const tls = engine !== chromium || process.argv.includes('--https');
if (!existsSync(join(CLIENT, 'studio.html'))) {
  console.error('✖ no built Studio: run `npm run studio-client` first');
  process.exit(1);
}

const freePort = () =>
  new Promise<number>((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
  });

mkdirSync(join(ROOT, '.cache'), { recursive: true });
const tmp = mkdtempSync(join(ROOT, '.cache', 'e2e-studio-hosted-'));
const gameDir = join(tmp, 'game');
cpSync(join(ROOT, 'games', 'demo'), gameDir, { recursive: true });
const op = await new TestOp().start();
const port = await freePort();
const scheme = tls ? 'https' : 'http';
const studioUrl = `${scheme}://127.0.0.1:${port}`;
const playUrl = `${scheme}://localhost:${port}`;
const db = await openSqliteDb(join(tmp, 'j.sqlite'));
const leases = new Leases(db);
const journal = await Journal.open({
  db,
  blobs: fsBlobStore(join(tmp, 'blobs')),
  gameDir,
  claim: async (q, paths) => {
    const who = operationContext.getStore()?.claimant;
    if (!who) throw new StudioError('a write on a shared Studio says who writes', 500);
    await leases.claimPaths(q, who, paths);
  },
  precheck: async (paths) => {
    const who = operationContext.getStore()?.claimant;
    if (who) await leases.check(who, spansOf(paths));
  },
});
const lease = new ServiceLease(db);
await lease.tick();
// Renewed as the server renews it (main.ts): its TTL is 30 s, and a run takes longer.
lease.start();
const oidc = await Oidc.discover({
  issuer: op.issuer,
  clientId: op.clientId,
  clientSecret: op.clientSecret,
  audience: op.audience,
  allowInsecure: true,
});
const sealer = new Sealer(['a-session-key-of-at-least-32-characters']);
const store = new AuthStore(db);
const gate = new Gate({ store, oidc, sealer, publicUrl: studioUrl });
// As the server does (main.ts), with the worker's child on this machine: the head's preview after each revision.
const previews = new Previews({
  db,
  blobs: fsBlobStore(join(tmp, 'blobs')),
  publicDir: join(ROOT, 'public'),
  game: 'demo',
  studioOrigin: studioUrl,
  snapshot: () =>
    server.exclusive(async () => ({
      epoch: await journal.epoch(),
      rev: await journal.revision(),
      bytes: packSnapshot(gameDir),
    })),
  build: (bytes, params) => localPreview(bytes, params),
  assetsVersion: () => 'e2e',
});
journal.events.on('confirmed', () => void previews.schedule());
// And its health, judged as the server judges it (main.ts), the verdict made in the worker's child here.
const health = new Health({
  db,
  journal,
  snapshot: () =>
    server.exclusive(async () => ({
      epoch: await journal.epoch(),
      rev: await journal.revision(),
      bytes: packSnapshot(gameDir),
    })),
  judge: judgeBy({
    validate: (bytes) => localValidate(bytes),
    solve: (bytes) =>
      localDiagnose('solve', bytes, {
        from: null,
        maxStates: 20_000,
        mode: 'witness',
        timeLimitMs: HOSTED_SOLVE_MS,
      }) as Promise<SolveData>,
  }),
});
journal.events.on('confirmed', () => void health.schedule());
// The member's exclusive lease for a prepare or a cut (main.ts): given back only if this run took it.
async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const who = operationContext.getStore()?.claimant;
  if (!who) return fn();
  const had = (await leases.list()).some((l) => l.span === '*' && l.holder === who.userId);
  if (!had) await leases.take(who, ['*']);
  try {
    return await fn();
  } finally {
    if (!had) await leases.release(who.userId, ['*']);
  }
}
// The prepared assets (main.ts), prepared in the worker's child here, under the member's exclusive lease.
const preparedAssets = new PreparedAssets({
  db,
  blobs: fsBlobStore(join(tmp, 'blobs')),
  dir: join(tmp, 'prepared'),
  snapshot: () =>
    server.exclusive(async () => ({
      epoch: await journal.epoch(),
      rev: await journal.revision(),
      bytes: packAssets(filesOf(gameDir)),
    })),
  prepare: prepareOn((bytes, _at, game, signal) => localPrepare(bytes, game, 120_000, signal), 'demo'),
  currentManifest: () =>
    existsSync(join(gameDir, 'assets.gen.json')) ? readFileSync(join(gameDir, 'assets.gen.json'), 'utf8') : null,
  writeManifest: async (manifest) => {
    await studio.writeFiles('prepare assets', [{ path: 'assets.gen.json', after: manifest }], { undo: false });
  },
  exclusive,
});
// The published builds (main.ts), built in the worker's child here and signed with a key made for the run.
const buildKeys = newJobKeys();
const builds = new Builds({
  db,
  blobs: fsBlobStore(join(tmp, 'blobs')),
  publicDir: join(ROOT, 'public'),
  game: 'demo',
  studioOrigin: studioUrl,
  assetsVersion: () => 'e2e',
  snapshot: () =>
    server.exclusive(async () => ({
      epoch: await journal.epoch(),
      rev: await journal.revision(),
      bytes: packSnapshot(gameDir),
    })),
  snapshotAt: async (rev) => packFiles(await journal.filesAt(rev, (p) => packable(p))),
  epoch: () => journal.epoch(),
  build: (bytes, params) => localPreview(bytes, params),
  judge: (epoch, rev, bytes) => health.judgeSnapshot(epoch, rev, bytes),
  keyId: 'e2e',
  sign: (bytes) => sign(null, bytes, privateKeyOf(buildKeys.privatePem)).toString('base64url'),
});
const studio = createStudio({
  gameDir,
  root: tmp,
  journal,
  importFresh: importInChild,
  personalUndo: new PersonalUndo(db, () => journal.epoch()),
});
// The Assets tab (main.ts, 4.2.3): its uploads here, its cutting in the worker's child, under the exclusive lease.
const hostedAssets = new HostedAssets({
  studio,
  assets: createAssets(studio, {
    publicAssets: () => join(preparedAssets.folder() ?? join(ROOT, 'public'), 'assets'),
    confine: true,
  }),
  locked: (fn) => server.exclusive(async () => fn()),
  exclusive,
  cut: (req, source, ext, signal) => localCut(packCut(gameDir, req.sheetId, source, ext), 'demo', req, signal),
});
const server = studioServer({
  studio,
  personalUndo: true,
  prepared: preparedAssets,
  assets: hostedAssets,
  journal,
  db,
  lease,
  log: () => {},
  perMinute: 10_000,
  auth: { gate, handle: authRoutes({ gate, store, oidc, sealer, publicUrl: studioUrl, send, readJson }) },
  leases,
  presence: new Presence(),
  previews,
  health,
  builds,
  play: {
    playUrl,
    handler: new Play({
      db,
      store,
      publicUrl: studioUrl,
      playUrl,
      idleMs: gate.idleMs,
      content: (req, res, url) =>
        /^\/play(\/|$)/.test(url.pathname) ? builds.handle(req, res, url) : previews.handle(req, res, url),
    }),
  },
  client: new StudioClient({ clientDir: CLIENT, publicDir: join(ROOT, 'public'), publicUrl: studioUrl, playUrl }),
});
let front: { close(): void } = server;
if (tls) {
  execFileSync(
    'openssl',
    ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost']
      .concat(['-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'])
      .concat(['-keyout', join(tmp, 'key.pem'), '-out', join(tmp, 'cert.pem')]),
    { stdio: 'ignore' },
  );
  const https = createHttpsServer(
    { key: readFileSync(join(tmp, 'key.pem')), cert: readFileSync(join(tmp, 'cert.pem')) },
    (req, res) => server.emit('request', req, res),
  );
  await new Promise<void>((ok) => https.listen(port, '127.0.0.1', ok));
  front = https;
} else await new Promise<void>((ok) => server.listen(port, '127.0.0.1', ok));
// The first preview, before any browser asks for the game.
await previews.schedule();
await health.schedule();

/** A frame being replaced may never answer an evaluation (Firefox): bounded, then retried by the caller's loop. */
const within = <T>(p: Promise<T> | undefined, ms: number): Promise<T | undefined> =>
  p
    ? Promise.race([p, new Promise<undefined>((ok) => setTimeout(() => ok(undefined), ms))])
    : Promise.resolve(undefined);
// The whole run: a step that hangs fails the run with what was seen, rather than the CI job's own deadline.
setTimeout(() => {
  console.log('✖ the run did not end within 8 min');
  console.log(trace.slice(-80).join('\n'));
  process.exit(1);
}, 8 * 60_000).unref();

const steps: [string, boolean, string?][] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  steps.push([name, ok, detail]);
  console.log(`${ok ? '✓' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const browser = await engine.launch();
const trace: string[] = [];
let failed = false;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: tls });
  // What happened, kept and printed if a step fails: the console of every frame (with the errors a frame throws),
  // the answers of 400 and more, the requests that failed.
  await context.addInitScript(() => {
    addEventListener('error', (e) => console.log('frame-error', location.host, e.message));
    addEventListener('unhandledrejection', (e) =>
      console.log('frame-rejection', location.host, String(e.reason?.stack ?? e.reason)),
    );
  });
  const page: Page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => trace.push(`console ${m.type()} ${m.text().slice(0, 300)}`));
  page.on('response', (r) => r.status() >= 400 && trace.push(`http ${r.status()} ${r.url().slice(0, 160)}`));
  page.on('requestfailed', (r) => trace.push(`failed ${r.url().slice(0, 160)} ${r.failure()?.errorText}`));

  // 1. The login: the invitation, the provider, back to the Studio.
  const invite = await store.invite(op.user.email, 'owner', 'e2e');
  await page.goto(`${studioUrl}/auth/login?invite=${invite}&returnTo=${encodeURIComponent('/#rooms/garden')}`);
  await page.locator('header.top .game').waitFor({ timeout: 30_000 });
  check('the member logs in and the Studio loads', (await page.locator('header.top .game').innerText()).length > 0);
  check(
    'the header offers the member their own undo',
    (await page.getByRole('button', { name: /Undo/ }).count()) === 1,
  );

  // 1b. The header says the game's health at a revision (G3): the validator and the solver, judged in the worker's child.
  await page.waitForFunction(
    () => document.querySelector('.hosted-bar .health')?.getAttribute('data-state') === 'ok',
    null,
    {
      timeout: 120_000,
    },
  );
  const chipText = await page.locator('.hosted-bar .health').innerText();
  check("the header says the game's health at a revision", /^✔ valid at revision \d+/.test(chipText), chipText);

  // 2. Rooms: the editor comes from the game's origin.
  const editor = page.frameLocator('iframe.engine');
  await editor.locator('svg').first().waitFor({ timeout: 60_000 });
  const frame = page.frames().find((f) => f.url().startsWith(playUrl)) as Frame | undefined;
  check(
    "the room editor is a revision's preview on the game origin",
    !!frame && /^\/preview\/\d+\/$/.test(new URL(frame.url()).pathname),
    frame?.url().split('?')[0],
  );
  if (!frame) throw new Error('no editor frame');

  // 3. A save asked by the Studio is written by the Studio, through its API, as the member.
  const puts: number[] = [];
  page.on('response', (r) => {
    if (r.request().method() === 'PUT' && r.url() === `${studioUrl}/api/room/garden/layout`) puts.push(r.status());
  });
  await page.getByRole('button', { name: 'Save layout' }).click();
  for (let i = 0; i < 40 && !puts.length; i++) await page.waitForTimeout(250);
  check('"Save layout" has the Studio write the editor\'s layout', puts[0] === 200, `PUT ${puts.join(', ')}`);

  // 4. A layout sent unasked is ignored: without a nonce, with a stale one, for another room.
  const n = puts.length;
  // (No function declared inside: tsx would name it with a helper the page does not have.)
  await frame.evaluate((studio) => {
    for (const extra of [{}, { nonce: 'a-nonce-the-studio-never-sent' }, { room: 'house', nonce: 'x' }])
      window.parent.postMessage(
        {
          source: 'web-scumm-editor',
          type: 'saved',
          room: 'garden',
          ok: true,
          layout: { entries: { default: [1, 1] } },
          ...extra,
        },
        studio,
      );
  }, studioUrl);
  await page.waitForTimeout(1500);
  check('a layout the editor sends unasked is ignored (no nonce, a stale one, another room)', puts.length === n);

  // 4b. A layout written meanwhile is what the view shows once its revision's preview is built (the view reloads by
  // itself then; "Reload view" before that shows the last ready one).
  const moved = await page.evaluate(async () => {
    const r = await fetch('/api/room/garden', { headers: { 'x-studio-request': '1' } });
    const layout = ((await r.json()) as { layout: { entries?: Record<string, number[]> } }).layout;
    layout.entries = { ...layout.entries, default: [123, 321] };
    const w = await fetch('/api/room/garden/layout', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-studio-request': '1' },
      body: JSON.stringify(layout),
      signal: AbortSignal.timeout(60_000),
    });
    return w.status;
  });
  await page.getByRole('button', { name: 'Reload view' }).click({ timeout: 30_000 });
  let shown: unknown;
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(250);
    const f = page.frames().find((x) => x.url().startsWith(playUrl) && x.url().includes('edit='));
    shown = await within(
      f?.evaluate(
        () =>
          (
            window as unknown as {
              __game?: { engine: { layouts: Record<string, { entries?: Record<string, number[]> }> } };
            }
          ).__game?.engine.layouts.garden?.entries?.default,
      ),
      2_000,
    ).catch(() => undefined);
    if (JSON.stringify(shown) === '[123,321]') break;
  }
  check(
    "a layout written meanwhile is what the view shows once its revision's preview is ready",
    moved === 200 && JSON.stringify(shown) === '[123,321]',
    `PUT ${moved}, shown ${JSON.stringify(shown)}`,
  );
  // 4c. The member's own undo (G5): their last write (the layout just written) is undone by a new revision.
  const before = await page.evaluate(async () => (await (await fetch('/api/revision')).json()) as { revision: number });
  await page.getByRole('button', { name: /Undo/ }).click();
  let undone: unknown = [123, 321];
  for (let i = 0; i < 40 && JSON.stringify(undone) === '[123,321]'; i++) {
    await page.waitForTimeout(250);
    undone = await page.evaluate(async () => {
      const r = await fetch('/api/room/garden', { headers: { 'x-studio-request': '1' } });
      return ((await r.json()) as { layout: { entries?: Record<string, number[]> } }).layout.entries?.default;
    });
  }
  const after = await page.evaluate(async () => (await (await fetch('/api/revision')).json()) as { revision: number });
  check(
    "Undo puts the member's last write back, as a new revision",
    JSON.stringify(undone) !== '[123,321]' && after.revision === before.revision + 1,
    `${JSON.stringify(undone)}, revision ${before.revision} → ${after.revision}`,
  );

  // 5. The game's page cannot reach the Studio.
  await page.evaluate(() => localStorage.setItem('e2e.studio-secret', 'the Studio keeps this'));
  const reach = await frame.evaluate(async (studio) => {
    let parent = 'readable';
    try {
      void window.parent.document.title;
    } catch {
      parent = 'blocked';
    }
    let api = 'answered';
    try {
      const r = await fetch(`${studio}/api/game`, { credentials: 'include' });
      api = `status ${r.status}`;
    } catch {
      api = 'blocked';
    }
    let write = 'answered';
    try {
      const r = await fetch(`${studio}/api/room/garden/layout`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-studio-request': '1' },
        body: '{}',
      });
      write = `status ${r.status}`;
    } catch {
      write = 'blocked';
    }
    let storage = 'unread';
    try {
      storage = localStorage.getItem('e2e.studio-secret') ?? 'absent';
    } catch {
      storage = 'blocked';
    }
    return { parent, api, write, storage };
  }, studioUrl);
  check("the game's page cannot read the Studio's page", reach.parent === 'blocked');
  check(
    "the game's page cannot read the Studio's API",
    reach.api === 'blocked' || reach.api === 'status 401',
    reach.api,
  );
  check("the game's page cannot write through the Studio's API", reach.write === 'blocked', reach.write);
  check("the game's page cannot read the Studio's storage", reach.storage !== 'the Studio keeps this', reach.storage);

  // 5b. Check: the diagnostics say the revision they were made at (G3).
  await page.getByRole('tab', { name: 'Check' }).click();
  const stamp = page.locator('span.muted.small', { hasText: 'checked at' });
  await stamp.first().waitFor({ timeout: 120_000 });
  const stampText = (await stamp.first().innerText()).trim();
  check('the Check tab says the revision its results were made at', /revision \d+/.test(stampText), stampText);

  // 6. Play: the game runs on its origin.
  await page.getByRole('tab', { name: 'Play' }).click();
  const play = page.frameLocator('iframe.playframe');
  await play.locator('#app *').first().waitFor({ timeout: 60_000 });
  const playFrame = page.frames().find((f) => f.url().startsWith(playUrl) && f !== frame);
  check('the Play tab runs the game on its origin', !!playFrame);

  // 6b. Saves across revisions (ADR 0026, G2). The Play tab keeps the preview it loaded (revision 1, when the Studio
  // opened) until asked for the latest. There, a slot saved in other content (another fingerprint, revision 1) asks
  // before it is loaded, and each answer is followed: Resume loads it, Restart (confirmed) starts a new game, Stay opens
  // revision 1's preview.
  type G = {
    t(k: string): string;
    pauseMenu(): void;
    engine: { state: { room: string; v: number; counters: Record<string, number> } };
    slots: { putSlot(n: number, s: unknown, m: unknown): Promise<boolean> };
    revision?: { here(): { rev: number } };
  };
  const playEl = page.locator('iframe.playframe');
  const playNow = async () => (await within(playEl.elementHandle(), 2_000))?.contentFrame() ?? null;
  // "Load the latest preview", then the Play frame once its game runs that revision. The writes above (the layout,
  // Undo) build their previews in the background: wait for the head's, or one finishing between this read and the click
  // makes the button rightly load a revision the step did not expect (#255). Read again at each click: never a revision
  // an earlier click expected. Then, as in 4b, the frame is looked up again at each try and each evaluation bounded:
  // in Firefox, the frame caught as its navigation commits may never answer one (#264), and the old page, marked
  // first, is never taken for the new one.
  const loadLatest = async (): Promise<{ inPlay: Frame; ready: number | null }> => {
    await previews.schedule();
    const ready = previews.state().ready;
    const head = await journal.revision();
    check(
      'the head revision has its preview before asking for the latest',
      ready === head,
      `ready ${ready}, head ${head}`,
    );
    await within(
      (await playNow())
        ?.evaluate(() => {
          (window as unknown as { __e2eOld?: boolean }).__e2eOld = true;
        })
        .catch(() => undefined),
      2_000,
    );
    const latestButton = page.getByRole('button', { name: 'Load the latest preview' });
    await latestButton.click();
    let at = '';
    let silentSince = 0;
    let again = false;
    for (const end = Date.now() + 45_000; Date.now() < end; ) {
      const f = await playNow();
      at = f?.url() ?? '';
      // There, still silent after 15 s: once, a new load of the page (a new document, which answers), said in the log.
      if (!at.includes(`/preview/${ready}/`)) silentSince = 0;
      else if (!silentSince) silentSince = Date.now();
      else if (!again && Date.now() - silentSince > 15_000) {
        again = true;
        silentSince = 0;
        console.log(`  note: the Play frame at ${at} did not answer for 15 s, "Load the latest preview" clicked again`);
        await latestButton.click();
      }
      const runs =
        !!f &&
        at.includes(`/preview/${ready}/`) &&
        (await within(
          f
            .evaluate(() => {
              const w = window as unknown as { __game?: G; __e2eOld?: boolean };
              return !w.__e2eOld && !!w.__game?.revision && !!w.__game.engine?.state;
            })
            .catch(() => false),
          2_000,
        ));
      if (runs) return { inPlay: f, ready };
      await page.waitForTimeout(250);
    }
    throw new Error(
      `"Load the latest preview": no game running revision ${ready} in the Play frame, at ${at || 'none'}`,
    );
  };
  const latest = await loadLatest();
  let inPlay = latest.inPlay;
  const ready = latest.ready;
  const shownRev = Number(/\/preview\/(\d+)\//.exec(inPlay.url())?.[1]);
  check('"Load the latest preview" loads the last ready revision', shownRev === ready, inPlay.url());
  const here = await inPlay.evaluate(() => (window as unknown as { __game: G }).__game.revision?.here().rev ?? null);
  check("a preview's saves record its revision", here === shownRev, `here ${here}, frame ${shownRev}`);
  // A slot made in other content: the current state, marked, said to come from revision 1 under another fingerprint.
  await inPlay.evaluate(async () => {
    const g = (window as unknown as { __game: G }).__game;
    const state = structuredClone(g.engine.state);
    state.counters['e2e.saved'] = 1;
    await g.slots.putSlot(1, state, {
      at: Date.now(),
      room: state.room,
      roomName: 'e2e',
      v: state.v,
      revision: { rev: 1, fingerprint: 'other-content' },
    });
  });
  const askFromSlot = async (f: Frame) => {
    const labels = await f.evaluate(() => {
      const g = (window as unknown as { __game: G }).__game;
      g.pauseMenu();
      return { load: g.t('load'), slot: g.t('slot').replace('{n}', '1') };
    });
    await f.locator('.dim .menu button', { hasText: labels.load }).first().click();
    await f.locator('.dim .menu button:not([disabled])', { hasText: labels.slot }).first().click();
    const buttons = f.locator('[data-revision-prompt] button');
    await buttons.first().waitFor({ timeout: 10_000 });
    return buttons.evaluateAll((bs) => bs.map((b) => (b as HTMLElement).dataset.choice));
  };
  const marked = (f: Frame) =>
    f.evaluate(() => (window as unknown as { __game: G }).__game.engine.state.counters['e2e.saved'] ?? 0);
  const asked = await askFromSlot(inPlay);
  check(
    'a slot made in other content asks: resume, restart, stay',
    shownRev !== 1 && JSON.stringify(asked) === JSON.stringify(['resume', 'restart', 'stay']),
    `${JSON.stringify(asked)} in revision ${shownRev}`,
  );
  await inPlay.locator('[data-revision-prompt] button[data-choice="resume"]').click();
  let loaded = 0;
  for (let i = 0; i < 20 && loaded !== 1; i++) {
    await page.waitForTimeout(250);
    loaded = await marked(inPlay);
  }
  check('Resume loads the slot here', loaded === 1);
  await askFromSlot(inPlay);
  await inPlay.locator('[data-revision-prompt] button[data-choice="stay"]').click();
  let at = '';
  for (let i = 0; i < 40 && !at.includes('/preview/1/'); i++) {
    await page.waitForTimeout(250);
    at = (await (await playEl.elementHandle())?.contentFrame())?.url() ?? '';
  }
  check(
    "Stay opens the save's own revision, on its title screen",
    at !== '' && new URL(at).pathname === '/preview/1/' && !new URL(at).searchParams.has('dev'),
    at,
  );

  // There, on revision 1's title screen, Continue asks above the title when the autosave was made in other content (its
  // record set here: revisions 1 and 2 differ by a layout, which the fingerprint does not cover), and Escape cancels.
  const title = (await (await playEl.elementHandle())?.contentFrame())!;
  await title.waitForFunction(() => !!document.querySelector('button.bigbtn'), null, { timeout: 30_000 });
  const cont = await title.evaluate(() => {
    const g = (window as unknown as { __game: { game: { id: string; ui: { continue: string } } } }).__game.game;
    localStorage.setItem(`${g.id}.save-revision`, JSON.stringify({ rev: 2, fingerprint: 'other-content' }));
    return g.ui.continue;
  });
  await title.locator('button.bigbtn', { hasText: cont.toUpperCase() }).click();
  const top = title.locator('[data-revision-prompt] button[data-choice="resume"]');
  await top.waitFor({ timeout: 10_000 });
  const onTop = await top.evaluate((b) => {
    const r = b.getBoundingClientRect();
    return b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  });
  check('on the title screen, the question is shown above the title', onTop);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(
    'Escape cancels the question, the title stays',
    (await title.locator('[data-revision-prompt]').count()) === 0 &&
      (await title.locator('button.bigbtn', { hasText: cont.toUpperCase() }).count()) === 1,
  );

  // Back to the latest preview, the slot still there: Restart last (the new game's opening holds the menus).
  ({ inPlay } = await loadLatest());
  await askFromSlot(inPlay);
  await inPlay.locator('[data-revision-prompt] button[data-choice="restart"]').click();
  await inPlay.locator('.dim .menu button.warn').click();
  let fresh = 1;
  for (let i = 0; i < 20 && fresh !== 0; i++) {
    await page.waitForTimeout(250);
    fresh = await marked(inPlay);
  }
  check('Restart, confirmed, starts a new game', fresh === 0);
  // 6c. A published build (G6): from the Play tab, numbered, its manifest signed; served at /play/<n>/.
  await page.getByRole('tab', { name: 'Play' }).click();
  await page.getByRole('button', { name: 'Publish this revision' }).click();
  await page.locator('.builds li[data-build="1"]').waitFor({ timeout: 120_000 });
  const listed = await page.locator('.builds li[data-build="1"]').innerText();
  const got = (await page.evaluate(async () => (await (await fetch('/api/builds/1')).json()) as unknown)) as {
    signed: string;
    signature: string;
  };
  check(
    'a build is published from the Play tab, its manifest signed by the Studio',
    /#1 · revision \d+/.test(listed) &&
      verify(null, signedBytes(got.signed), publicKeyOf(buildKeys.publicPem), Buffer.from(got.signature, 'base64url')),
    listed.replace(/\s+/g, ' '),
  );
  const builtPage = await (await page.locator('iframe.playframe').elementHandle())
    ?.contentFrame()
    .then((f) => f?.evaluate(async () => (await fetch('/play/1/')).status));
  check('the game origin serves the build at /play/1/ to a game session', builtPage === 200, `status ${builtPage}`);

  // 6d. Prepare assets (D43): on the worker's child here, under the member's exclusive lease; the game's manifest is a
  // new revision.
  const revBefore = await journal.revision();
  await page.getByRole('button', { name: 'Prepare assets', exact: true }).click();
  const prepStatus = page.locator('.assets-panel .muted.small', { hasText: 'prepared from revision' });
  await prepStatus.waitFor({ timeout: 180_000 });
  check(
    "a dev prepares the game's assets on the server, under the exclusive lease",
    (await preparedAssets.list()).length === 1 && (await leases.list()).every((l) => l.span !== '*'),
    `${(await prepStatus.innerText()).trim()}, revision ${revBefore} → ${await journal.revision()}`,
  );

  // 7. The logout ends the game's session too.
  await page.evaluate(async () => {
    await fetch('/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-studio-request': '1' },
      body: '{}',
    });
  });
  const last = (await (await playEl.elementHandle())?.contentFrame()) ?? playFrame!;
  const afterLogout = await last.evaluate(async () => (await fetch(location.href)).status);
  check(
    "after the logout, the game's origin refuses the next request",
    afterLogout === 403 || afterLogout === 401,
    `status ${afterLogout}`,
  );
  // WebKit reports the probe's refused fetches of step 5 as page errors: those, and only those, are expected.
  const unexpected = errors.filter((e) => !/\/api\/(game|room\/garden\/layout) due to access control checks/.test(e));
  check('no page error in the Studio', unexpected.length === 0, unexpected.join(' | '));
} catch (e) {
  check('the run', false, (e as Error).message.split('\n')[0]);
  console.log(trace.slice(-80).join('\n'));
  for (const p of browser.contexts().flatMap((c) => c.pages()))
    for (const f of p.frames())
      console.log(
        'frame',
        f.url().slice(0, 120),
        // Bounded: a frame that never answers (#264) would hold the rest of the dump until the run's deadline.
        (await within(
          f.evaluate(() => document.body?.innerHTML.slice(0, 600)).catch((e) => String(e)),
          5_000,
        )) ?? '(no answer within 5 s)',
      );
  if (process.env.E2E_DEBUG)
    for (const p of browser.contexts().flatMap((c) => c.pages()))
      await p.screenshot({ path: join(ROOT, '.cache', 'e2e-studio-hosted.png') });
} finally {
  failed = steps.some(([, ok]) => !ok);
  await browser.close();
  front.close();
  op.stop();
  await lease.release();
  await journal.close();
  rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? '✖ e2e:studio-hosted failed' : '✓ e2e:studio-hosted');
process.exit(failed ? 1 : 0);
