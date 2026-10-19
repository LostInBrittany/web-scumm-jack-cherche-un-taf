// npm run remix -- --seed <code> [--mode=remix|daily|…] [--json]: the world a seed makes for the current game (4.1.15,
// ADR 0018), its assignments and its hash; the same seed gives the same hash on every machine and browser.
// npm run remix -- --preview <code>: the same world, read: each dimension's value, then `validate` and a solver witness
// on that instance (`--max=<states>`, default 20000). `--seed story` is the author's world.
// npm run remix -- --record=20: the playtest seeds (4.1.15): the first N seeds of the published sample, each world
// solved and its witness replayed into a session that carries the world; written to games/<id>/playtests/
// remix-<seed>.session.json, where `npm run playtests` replays them (each in its own world).
import { join, resolve } from 'node:path';
import { flushExit } from './flush';
import { cachedSolve } from './proof-cache';
import { GAME, GAME_DIR, loadGameModule } from './game';
import { compileVariant } from '../src/engine/core/remix/compile';
import { applyVariant, compileGameManifest } from '../src/engine/core/remix/apply';
import { REMIX_ALGORITHM_VERSION } from '../src/engine/core/remix/manifest';
import { describeVariant, sampleSeed } from '../src/engine/tools/remix';
import { replay } from '../src/engine/tools/replay';
import { validate } from '../src/engine/tools/validate';
import { loadLayouts } from '../src/engine/tools/load';
import { writeGame } from './game-write';

const argv = process.argv.slice(2);
const after = (k: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
};
const preview = after('preview');
const record = after('record');
const seed = preview ?? after('seed');
if (record) await recordPlaytests(Number(record));
if (!seed) {
  console.error('usage: npm run remix -- --seed <WS-XXXX-XXXX|story> [--mode=remix] [--json] | --preview <seed>');
  await flushExit(2);
}
const { game, commands } = await loadGameModule();
if (!game.remix) {
  console.error(`✗  [${GAME}] declares no \`remix\` manifest: one world, the story`);
  await flushExit(1);
}
const c = compileGameManifest(game);
const mode = after('mode') ?? 'remix';
let variant: ReturnType<typeof compileVariant>;
try {
  variant = compileVariant(c, game.remix!, seed!, Number(after('version') ?? REMIX_ALGORITHM_VERSION), mode);
} catch (e) {
  console.error(`✗  ${(e as Error).message}`);
  await flushExit(1);
}
if (argv.includes('--json') && !preview) {
  console.log(JSON.stringify(variant!, null, 1));
  await flushExit(0);
}
for (const l of describeVariant(game, variant!)) console.log(l);
if (!preview) await flushExit(0);

const world = applyVariant(game, variant!);
const layouts = loadLayouts(resolve(GAME_DIR, 'layout'));
const r = validate(world, layouts, { commands });
console.log(`validate: ${r.errors.length} error(s), ${r.warnings.length} warning(s)`);
for (const e of r.errors) console.log(`  ✗ ${e}`);
const s = await cachedSolve(world, layouts, { commands, maxStates: Number(after('max') ?? 20000) });
console.log(`solve: ${s.headline}${s.cached ? ` (cached ${s.cached})` : ''}`);
await flushExit(r.errors.length || s.status !== 'solved' ? 1 : 0);

/** Records the playtest seeds: a session per seed, replayable in its world. */
async function recordPlaytests(n: number): Promise<never> {
  const { game: g, commands: cmds } = await loadGameModule();
  if (!g.remix) {
    console.error(`✗  [${GAME}] declares no \`remix\` manifest`);
    return flushExit(1);
  }
  const layouts = loadLayouts(resolve(GAME_DIR, 'layout'));
  const c = compileGameManifest(g);
  const dir = resolve(GAME_DIR, 'playtests');
  let failed = 0;
  // Every session recorded, then written as one operation of the game's journal (tools/game-write.ts).
  const sessions: { file: string; text: string }[] = [];
  for (let i = 0; i < n; i++) {
    const v = compileVariant(c, g.remix, sampleSeed(i), REMIX_ALGORITHM_VERSION, 'remix');
    const world = applyVariant(g, v);
    const s = await cachedSolve(world, layouts, { commands: cmds, maxStates: 60000 });
    if (s.status !== 'solved') {
      console.log(`✗  ${v.seed}: ${s.headline}`);
      failed++;
      continue;
    }
    const r = await replay(world, layouts, { start: { kind: 'new' }, log: s.steps }, { commands: cmds });
    const file = join(dir, `remix-${v.seed}.session.json`);
    const out = { kind: 'web-scumm-session', game: g.id, v: g.saveVersion, at: 0, session: r.session, trace: [] };
    sessions.push({ file, text: `${JSON.stringify(out)}\n` });
    console.log(
      `${r.ended && r.divergedAt === undefined ? '✔' : '✗'}  ${v.seed} (world ${v.hash.slice(0, 12)}): ${s.path.length} steps → ${file}`,
    );
    if (!r.ended || r.divergedAt !== undefined) failed++;
  }
  await writeGame(`remix: ${sessions.length} playtest session(s)`, sessions, { guard: false });
  return flushExit(failed ? 1 : 0);
}
