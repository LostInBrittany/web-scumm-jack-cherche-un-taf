// npm run e2e:remix-speedrun [-- --browsers=chromium,webkit,firefox] [--allow-skip] (4.1.16 "Convergence", plan §10):
// Remix and Time Attack together, end to end, for each world policy of the reference chapter (Story, Remix Fixed,
// Remix Random, Daily, Mystery):
// 1. the world, as the player's functions make it (`compileVariant`, `applyVariant`; the Daily token and the Mystery
//    commitment and signed reveal from the Bridge's own module with the published test key);
// 2. the solver's route recorded by the real recorder in that world, in Node, Chromium, WebKit and Firefox: the four
//    `.wsrun` texts must be the same, byte for byte;
// 3. that file verified in a new process (`npm run speedrun:verify -- --json`);
// 4. submitted to a Bridge queue whose isolated worker is the real one (`tools/speedrun/worker.ts`): its verdict, its
//    leaderboard key and its trust are the category's;
// 5. (4.1.17) interrupted after a stored chunk and resumed on a fresh engine, in each world: the same head, world and
//    proof, the same verdict and board; another world or another proof refused at the resume.
// `--out=<dir>` (4.1.17, the release's runs): the five files, 4.1.15's schema 1 run and `wsrun-manifest.json` (each
// file's schema, world policy, rules version, test key, commit and the verdict this engine gives it) are written there;
// candidate.yml keeps them and the release publishes those very files.
// Exit codes: 0 every check holds, 1 one does not, 3 a browser Playwright cannot launch (`--allow-skip`: 0, said).
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

process.env.GAME = 'reference';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const names = (args.find((a) => a.startsWith('--browsers='))?.slice(11) ?? 'chromium,webkit,firefox').split(',');
const allowSkip = args.includes('--allow-skip');
const outDir = args.find((a) => a.startsWith('--out='))?.slice(6);

const { game } = await import('../games/reference/game');
const { applyVariant, compileGameManifest, remixWorld } = await import('../src/engine/core/remix/apply');
const { compileVariant, storyVariant } = await import('../src/engine/core/remix/compile');
const { encodeSeedCode } = await import('../src/engine/core/remix/seed-code');
const { solve } = await import('../src/engine/tools/solve');
const { dailyRoutes } = await import('../bridge/src/daily');
const { MemoryRunStore, RunQueue } = await import('../bridge/src/runs');
const { approvedContext } = await import('../tools/speedrun/package');

const LAYOUT_DIR = resolve(ROOT, 'games/reference/layout');
const layouts = Object.fromEntries(
  readdirSync(LAYOUT_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(resolve(LAYOUT_DIR, f), 'utf8'))]),
);
const ctx = await approvedContext(resolve(ROOT, 'games/reference'));

// ---------------------------------------------------------------- 1. the worlds and their evidence
const fixture = JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/reference-daily-key.json'), 'utf8'));
const now = Date.now();
const bridge = dailyRoutes({
  games: { reference: { daily: 'daily', mystery: 'mystery' } },
  key: await crypto.subtle.importKey('jwk', fixture.jwk, { name: 'Ed25519' }, false, ['sign']),
  kid: fixture.kid,
  secret: 'e2e-remix-speedrun',
  now: () => now,
});
const body = <T>(r: { body: unknown } | null) => r!.body as T;
const day = body<{ token: string }>(await bridge.handle({ method: 'GET', url: '/v1/daily?game=reference' })).token;
const daySeed = JSON.parse(Buffer.from(day.split('.')[1]!, 'base64url').toString('utf8')).seed as string;
const commit = body<{ id: string; token: string }>(
  await bridge.handle({ method: 'POST', url: '/v1/commit', body: { game: 'reference' }, client: 'e2e' }),
);
const reveal = body<{ seed: string; revealedAt: number; token: string }>(
  await bridge.handle({ method: 'GET', url: `/v1/reveal/${commit.id}` }),
);
const c = compileGameManifest(game);
const fixedSeed = game.speedrun!.categories.find((x) => x.id === 'remix-fixed')!.world!.fixedSeed!;
const CASES = [
  { category: 'any%', world: storyVariant(game.remix, remixWorld(game)), want: { verdict: 'valid', key: 'any%' } },
  {
    category: 'remix-fixed',
    world: compileVariant(c, game.remix!, fixedSeed, 1, 'remix'),
    want: { verdict: 'valid', key: `remix-fixed:${fixedSeed}` },
  },
  {
    category: 'remix-random',
    world: compileVariant(c, game.remix!, encodeSeedCode(4116), 1, 'remix'),
    want: { verdict: 'valid', key: 'remix-random' },
  },
  {
    category: 'daily',
    world: compileVariant(c, game.remix!, daySeed, 1, 'daily'),
    evidence: { kind: 'daily', token: day },
    want: { verdict: 'valid', key: `daily:${daySeed}` },
  },
  {
    category: 'mystery',
    world: compileVariant(c, game.remix!, reveal.seed, 1, 'mystery'),
    evidence: {
      kind: 'mystery',
      commitmentToken: commit.token,
      revealToken: reveal.token,
      startedAt: reveal.revealedAt + 1000,
    },
    want: { verdict: 'valid-unranked', key: 'mystery' },
  },
].map((k) => {
  const played = applyVariant(game, k.world);
  return { ...k, played };
});
for (const k of CASES) {
  const r = await solve(structuredClone(k.played), layouts, { maxStates: 200000 });
  if (!r.finished) throw new Error(`${k.category}: the solver found no route in world ${k.world.seed}`);
  (k as typeof k & { route: unknown[] }).route = r.steps.map(({ rnd: _, ...s }) => s);
}

// ---------------------------------------------------------------- 2. the recorder, one bundle for every runtime
const entry = `
import { MemoryChunkStore } from './src/engine/core/journal-chunks.ts';
import { replay } from './src/engine/tools/replay.ts';
import { exportEnvelope } from './src/engine/tools/speedrun/envelope.ts';
import { SpeedrunRecorder } from './src/engine/tools/speedrun/recorder.ts';
globalThis.__record = async (o) => {
  const rec = new SpeedrunRecorder({
    engine: null, gameId: o.played.id, manifest: o.played.speedrun,
    category: o.played.speedrun.categories.find((x) => x.id === o.category),
    variant: o.world, ...(o.evidence ? { worldEvidence: o.evidence } : {}),
    store: new MemoryChunkStore(), fingerprint: o.fingerprint, engineVersion: o.engineVersion,
    runId: 'e2e-' + o.category, now: () => 0,
  });
  rec.seed = 'e2e-run-seed'; // the same generator seed everywhere: the four texts can be compared
  await rec.prepare();
  const r = await replay(o.played, o.layouts, { start: { kind: 'new' }, log: o.route },
    { seed: rec.seed, attach: (e) => rec.bind(e) });
  if (!r.ended) throw new Error(o.category + ': the route did not reach the ending');
  return exportEnvelope(await rec.seal());
};`;
const bundle = await build({
  stdin: { contents: entry, resolveDir: ROOT, loader: 'ts', sourcefile: 'e2e-remix-speedrun-entry.ts' },
  bundle: true,
  format: 'iife',
  target: 'es2022',
  write: false,
  charset: 'utf8',
  define: { 'import.meta.env': 'undefined' },
  loader: { '.json': 'json' },
});
const code = bundle.outputFiles[0]!.text;
const inputs = CASES.map((k) => ({
  category: k.category,
  world: k.world,
  evidence: k.evidence,
  played: k.played,
  route: (k as typeof k & { route: unknown[] }).route,
  layouts,
  fingerprint: ctx.fingerprint,
  engineVersion: ctx.engineVersion,
}));
const runIn = new Function(`${code}; return globalThis.__record;`)() as (o: unknown) => Promise<string>;
const texts: Record<string, string[]> = { node: [] };
for (const o of inputs) texts.node!.push(await runIn(o));

let failed = 0;
let skipped = 0;
const fail = (who: string, m: string) => {
  console.error(`✖  ${who}: ${m}`);
  failed++;
};
const { chromium, firefox, webkit } = await import('playwright');
const server = createServer((req, res) => {
  if (req.url === '/bundle.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(code);
  res
    .writeHead(200, { 'content-type': 'text/html' })
    .end('<!doctype html><meta charset="utf-8"><script src="/bundle.js"></script>');
});
await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
const types = { chromium, webkit, firefox } as const;
for (const name of names) {
  const type = types[name as keyof typeof types];
  if (!type) {
    fail(name, 'unknown browser (chromium, webkit or firefox)');
    continue;
  }
  let browser;
  try {
    browser = await type.launch();
  } catch (e) {
    console.error(`⚠  ${name}: cannot launch (${(e as Error).message.split('\n')[0]})`);
    skipped++;
    continue;
  }
  try {
    const page = await browser.newPage();
    await page.goto(origin);
    texts[name] = [];
    for (const o of inputs)
      texts[name]!.push(
        await page.evaluate(
          (x) => (globalThis as never as { __record: (o: unknown) => Promise<string> }).__record(x),
          o,
        ),
      );
  } catch (e) {
    fail(name, (e as Error).message.split('\n')[0]!);
  } finally {
    await browser.close();
  }
}
server.close();
for (const [who, list] of Object.entries(texts))
  if (who !== 'node')
    list.forEach((t, i) => {
      if (t !== texts.node![i]) fail(who, `${CASES[i]!.category}: its .wsrun differs from Node's`);
    });
if (!failed && Object.keys(texts).length > 1)
  console.log(`✔  ${Object.keys(texts).join(', ')}: the same ${CASES.length} .wsrun files, byte for byte`);

// ---------------------------------------------------------------- 3. a new process; 4. the Bridge's isolated worker
const dir = mkdtempSync(join(tmpdir(), 'remix-speedrun-'));
const verifyFile = (file: string) => {
  const cli = spawnSync(process.execPath, [tsx(), resolve(ROOT, 'tools/speedrun/verify.ts'), file, '--json'], {
    encoding: 'utf8',
    env: { ...process.env, GAME: 'reference' },
  });
  return JSON.parse(cli.stdout.trim().split('\n').at(-1) ?? '{}');
};
const released: Record<string, unknown>[] = [];
const tsx = () => createRequire(import.meta.url).resolve('tsx/cli');
const queue = new RunQueue({
  store: new MemoryRunStore(),
  approved: { reference: { dir: resolve(ROOT, 'games/reference'), fingerprint: ctx.fingerprint } },
  worker: [process.execPath, tsx(), resolve(ROOT, 'tools/speedrun/worker.ts')],
  timeoutMs: 60_000,
  perMinute: 100,
  purgeEveryMs: 0,
  pollMs: 0,
  log: () => {},
  audit: () => {},
});
try {
  for (const [i, k] of CASES.entries()) {
    const file = join(dir, `${k.category.replace(/%/g, '')}.wsrun`);
    writeFileSync(file, texts.node![i]!);
    const out = verifyFile(file);
    const env = JSON.parse(texts.node![i]!) as { schema: number; rulesVersion: number };
    released.push({
      file: `run-${k.world.mode === 'story' ? 'story' : k.category}.wsrun`,
      source: file,
      schema: env.schema,
      world: k.world.mode === 'story' ? 'story' : k.category.replace(/^remix-/, ''),
      seed: k.world.seed,
      rulesVersion: env.rulesVersion,
      verdict: out.verdict,
      leaderboardKey: out.world?.leaderboardKey ?? null,
      ...(k.evidence
        ? {
            testKey: fixture.kid,
            evidence: 'demonstration fixture signed with the published test key, not an attestation',
          }
        : {}),
    });
    if (out.verdict !== k.want.verdict || out.world?.leaderboardKey !== k.want.key)
      fail(
        'verify',
        `${k.category}: ${out.verdict} (${out.code}) on ${out.world?.leaderboardKey}, not ${k.want.verdict} on ${k.want.key}`,
      );
    const { id } = await queue.submit('e2e', { player: 'E2E', envelope: texts.node![i]! });
    await queue.idle();
    const r = (await queue.o.store.get('e2e', id))!;
    // A Daily run sent after its UTC day is practice, valid and not ranked (SPEEDRUN): the day this e2e signed may end
    // while it runs (candidate 37998053206 crossed midnight), and then that rule is what is checked.
    const dayOver =
      k.category === 'daily' && new Date().toISOString().slice(0, 10) !== new Date(now).toISOString().slice(0, 10);
    // Crossed between the signature and now, either answer is the rule's (verified before or after midnight).
    const ranked = k.want.verdict === 'valid' && !dayOver;
    if (
      r.verdict !== k.want.verdict ||
      r.leaderboardKey !== k.want.key ||
      r.trust !== 'replay-valid' ||
      (!dayOver && !!r.ranked !== ranked)
    )
      fail('bridge', `${k.category}: ${r.verdict} on ${r.leaderboardKey}, trust ${r.trust}, ranked ${r.ranked}`);
    else
      console.log(
        `✔  ${k.category}: world ${k.world.mode} ${k.world.seed}; verified in a new process and by the Bridge's worker: ${r.verdict} on "${r.leaderboardKey}", ${r.trust}${ranked ? `, ranked ${r.ranked} µt` : ', not ranked'}`,
      );
  }
  // 4.1.15's schema 1 run: kept as it was, said for what it is — this engine sends it to that version's archive.
  const v1 = resolve(ROOT, 'tests/fixtures/speedrun/reference-any.v1.wsrun');
  const old = verifyFile(v1);
  if (old.verdict !== 'unsupported-version') fail('verify', `the 4.1.15 run: ${old.verdict}, not unsupported-version`);
  const oldEnv = JSON.parse(readFileSync(v1, 'utf8')) as {
    schema?: number;
    rulesVersion: number;
    engineVersion?: string;
  };
  released.push({
    file: 'run-story-v1.wsrun',
    source: v1,
    schema: oldEnv.schema ?? 1,
    world: 'story',
    rulesVersion: oldEnv.rulesVersion,
    verdict: old.verdict,
    note: 'recorded on 4.1.15: verified as Story by the 4.1.15 archive; this engine refuses to judge it',
  });
  if (outDir && !failed) {
    mkdirSync(outDir, { recursive: true });
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    for (const r of released) copyFileSync(r.source as string, join(outDir, r.file as string));
    const files = released.map(({ source: _, ...r }) => ({ ...r, commit }));
    writeFileSync(
      join(outDir, 'wsrun-manifest.json'),
      `${JSON.stringify({ engine: ctx.engineVersion, commit, files }, null, 1)}\n`,
    );
    console.log(`✔  ${files.length} .wsrun files and their manifest written to ${outDir}`);
  }
} finally {
  queue.close();
  rmSync(dir, { recursive: true, force: true });
}
// ---------------------------------------------------------------- 5. interrupted, then resumed (4.1.17, plan §10.1)
// In each world: a first chunk stored (499 looks after the start), ten steps of the route lost with the page, the run
// resumed on a fresh engine from its stored chunk, the route played again, the run sealed and verified in a new
// process. Its head (h0), world and proof are the ones it started with; resuming in another world, or with another
// proof than the one sealed, is refused before any input.
{
  const { Engine } = await import('../src/engine/core/engine');
  const { FakePresenter, MemoryStore } = await import('../src/engine/core/ports');
  const { CHUNK_SIZE, MemoryChunkStore, readRun } = await import('../src/engine/core/journal-chunks');
  const { RunStartRefused, SpeedrunRecorder } = await import('../src/engine/tools/speedrun/recorder');
  const { exportEnvelope } = await import('../src/engine/tools/speedrun/envelope');
  const { replay } = await import('../src/engine/tools/replay');
  type Entry = Record<string, unknown> & { picks?: number[] };
  const tick = () => new Promise<void>((ok) => setTimeout(ok, 0));
  /** One recorded entry played on a live engine, its choices given as the recording gave them. */
  const drive = async (e: InstanceType<typeof Engine>, ui: InstanceType<typeof FakePresenter>, en: Entry) => {
    ui.picks = [...(en.picks ?? [])];
    const run =
      'act' in en
        ? e.act(en.act as never)
        : 'travel' in en
          ? e.travel(en.travel as string)
          : 'switch' in en
            ? e.switchTo(en.switch as string)
            : 'map' in en
              ? e.openMap()
              : 'step' in en
                ? e.advance(en.step as string)
                : 'script' in en
                  ? e.script(en.script as never)
                  : 'enter' in en
                    ? e.teleport(en.enter as string)
                    : Promise.resolve();
    await run;
    for (let g = 0; g < 100 && e.busy; g++) await tick();
  };
  const dir2 = mkdtempSync(join(tmpdir(), 'remix-resume-'));
  try {
    for (const [i, k] of CASES.entries()) {
      // The route without its new game: the replay starts one, the looks come first.
      const route = (k as typeof k & { route: Entry[] }).route.filter((en) => !('start' in en));
      const category = k.played.speedrun!.categories.find((c) => c.id === k.category)!;
      const store = new MemoryChunkStore();
      const runId = `resume-${i}`;
      const opts = (engine: unknown, o: { variant?: unknown; worldEvidence?: unknown } = {}) =>
        ({
          engine,
          gameId: k.played.id,
          manifest: k.played.speedrun!,
          category,
          variant: o.variant ?? k.world,
          ...((o.worldEvidence ?? k.evidence) ? { worldEvidence: o.worldEvidence ?? k.evidence } : {}),
          store,
          fingerprint: ctx.fingerprint,
          engineVersion: ctx.engineVersion,
          runId,
          now: () => 0,
        }) as never;
      const rec = new SpeedrunRecorder(opts(null));
      rec.seed = 'e2e-resume-seed';
      await rec.prepare();
      const target = (route.find((en) => 'act' in en)!.act as { a: string }).a;
      const pad = Array.from({ length: CHUNK_SIZE - 1 }, () => ({ act: { verb: 'look', a: target } }));
      const played1 = await replay(
        k.played,
        layouts,
        // The route's state digests are the solver's, from a game without the looks: not compared here.
        { start: { kind: 'new' }, log: [...pad, ...route.slice(0, 10).map(({ digest: _, ...en }) => en)] as never },
        { seed: rec.seed, attach: (e) => rec.bind(e) },
      );
      await rec.flushed();
      if (played1.divergedAt !== undefined || played1.errors.length)
        fail(
          'resume',
          `${k.category}: the first part diverged at ${played1.divergedAt}: ${played1.divergence ?? played1.errors[0]}`,
        );
      const stored = (await readRun(store, runId))!;
      if (stored.chunks.length !== 1 || stored.head.sealed)
        fail('resume', `${k.category}: one unsealed chunk, not ${stored.chunks.length}`);
      // Another world, another proof: refused before any input.
      const other = CASES[(i + 1) % CASES.length]!;
      for (const [what, o] of [
        ['another world', { variant: other.world }],
        ['another proof', { worldEvidence: { kind: 'daily', token: 'x.y.z' } }],
      ] as const) {
        const e = new Engine(structuredClone(k.played), layouts, new FakePresenter(), new MemoryStore());
        const refused = await SpeedrunRecorder.resume(opts(e, o)).then(
          () => false,
          (x: unknown) => x instanceof RunStartRefused,
        );
        if (!refused) fail('resume', `${k.category}: resumed with ${what}`);
      }
      const ui = new FakePresenter();
      const e2 = new Engine(structuredClone(k.played), layouts, ui, new MemoryStore());
      // A Mystery resumed later is dated anew by the page (`storedEvidence`): its proof is the same, the sealed one stays.
      const later =
        k.evidence?.kind === 'mystery'
          ? { worldEvidence: { ...k.evidence, startedAt: (k.evidence.startedAt ?? 0) + 5000 } }
          : {};
      const again = await SpeedrunRecorder.resume(opts(e2, later));
      if (!again) {
        fail('resume', `${k.category}: nothing to resume`);
        continue;
      }
      for (const en of route) await drive(e2, ui, en);
      const sealed = await again.seal();
      const env = sealed as unknown as { h0: string; variant?: { hash: string }; worldEvidence?: unknown };
      if (env.h0 !== stored.head.h0) fail('resume', `${k.category}: the head changed on resume`);
      if (env.variant?.hash !== k.world.hash) fail('resume', `${k.category}: the world changed on resume`);
      if (JSON.stringify(env.worldEvidence ?? null) !== JSON.stringify(k.evidence ?? null))
        fail('resume', `${k.category}: the proof changed on resume`);
      const file = join(dir2, `${runId}.wsrun`);
      writeFileSync(file, exportEnvelope(sealed));
      const out = verifyFile(file);
      if (out.verdict !== k.want.verdict || out.world?.leaderboardKey !== k.want.key)
        fail('resume', `${k.category}: ${out.verdict} (${out.code}: ${out.reason}) on ${out.world?.leaderboardKey}`);
      else
        console.log(
          `✔  ${k.category}: interrupted, resumed in its world with its proof, ${out.verdict} on "${out.world?.leaderboardKey}"`,
        );
    }
  } finally {
    rmSync(dir2, { recursive: true, force: true });
  }
}
if (skipped && !allowSkip) process.exit(3);
if (skipped) console.log(`⚠  ${skipped} browser(s) skipped (--allow-skip)`);
process.exit(failed ? 1 : 0);
