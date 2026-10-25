// npm run bench [-- --rooms=40 --players=3 --items=30 --flags=100 --npcs=5 --scripts=10 --topics=40 --max=200000 --prove --v3]
// --prove adds the exhaustive proof of the whole game (slow on a big one: the reduction is off in proof mode);
// --v3 generates the game with stable ids (schemaVersion 3), as a real v3 game.
// --workers-table [--rooms --players --max --eras]: the proof workers' table (3.5, BENCH.md): the time with 0, 1, 2, 4
//   and 8 workers, and whether each result is the same as with one.
// --matrix [--eras]: the 3.3 "Scale" reference table instead: the exhaustive proof on 20 and 40 rooms × 1, 2 and 3 playable
//   characters (12 items, 30 flags, 1 walker, 2 scripts, 8 topics; --max states each), with where the time goes and
//   how many distinct character positions the states hold. Markdown on stdout (wiki/en/contribute.benchmarks.md#history).
// Generates a game of that size (src/engine/tools/stress.ts) and times every tool on it: validate, solve (global and
// per chapter, plain and with the partial-order reduction), the content report, the world and puzzle graphs, text
// extraction and translation, a save migration.
import { validate } from '../src/engine/tools/validate';
import '../src/engine/tools/solve-pool';
import { solve } from '../src/engine/tools/solve';
import { proveChapters } from '../src/engine/tools/chapters';
import { report, reportMarkdown } from '../src/engine/tools/report';
import { worldGraph, toSvg } from '../src/engine/tools/graph';
import { puzzleGraph, toPuzzleSvg } from '../src/engine/tools/puzzle';
import { applyLocale, textPaths } from '../src/engine/tools/i18n';
import { migrate } from '../src/engine/core/migrate';
import { makeStressGame } from '../src/engine/tools/stress';
import { Engine } from '../src/engine/core/engine';
import { FakePresenter, MemoryStore } from '../src/engine/core/ports';

const arg = (k: string, d: number) => {
  const m = process.argv.find((a) => a.startsWith(`--${k}=`));
  return m ? Number(m.slice(k.length + 3)) : d;
};
const opts = {
  rooms: arg('rooms', 40),
  players: arg('players', 3),
  items: arg('items', 30),
  flags: arg('flags', 100),
  npcs: arg('npcs', 5),
  scripts: arg('scripts', 10),
  topics: arg('topics', 40),
};
const max = arg('max', 200000);
if (process.argv.includes('--workers-table')) {
  // --workers-table (3.5): one proof with no workers, then with 1, 2, 4 and 8 (batches of 64): the time of each, and
  // whether the result is the same as with one worker (it must be). The game: --rooms, --players, --max, --eras.
  const { createHash } = await import('node:crypto');
  const g = makeStressGame({
    rooms: arg('rooms', 20),
    players: arg('players', 2),
    items: 12,
    flags: 30,
    npcs: 1,
    scripts: 2,
    topics: 8,
    schemaVersion: 3,
    eras: process.argv.includes('--eras'),
  });
  const cap = arg('max', 40000);
  const sig = (r: Awaited<ReturnType<typeof solve>>) =>
    createHash('sha1')
      .update(
        JSON.stringify([
          r.status,
          r.states,
          r.finished,
          r.path,
          r.softlockCount,
          r.softlockCauses,
          r.softlocks,
          r.flagsReached,
          r.roomsReached,
          r.broken,
          r.deadEnds,
          r.errors,
        ]),
      )
      .digest('hex')
      .slice(0, 10);
  // Peak memory of the process (its worker threads included: they share it), sampled every 20 ms during each run.
  console.log(`| Workers | Proof | States | Time | Speed-up | Peak RSS | Result |`);
  console.log('|---|---|---|---|---|---|---|');
  let base = 0,
    one = '';
  for (const workers of [undefined, 1, 2, 4, 8]) {
    (globalThis as { gc?: () => void }).gc?.();
    let peak = process.memoryUsage().rss;
    const sample = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().rss);
    }, 20);
    const t = performance.now();
    const r = await solve(structuredClone(g.game), g.layouts, {
      mode: 'prove',
      maxStates: cap,
      ...(workers ? { workers } : {}),
    });
    const s = (performance.now() - t) / 1000;
    clearInterval(sample);
    peak = Math.max(peak, process.memoryUsage().rss);
    if (!workers) base = s;
    if (workers === 1) one = sig(r);
    console.log(
      `| ${workers ?? 'none (one node at a time)'} | ${r.status} | ${r.states} | ${s.toFixed(1)} s | ×${(base / s).toFixed(2)} | ${Math.round(peak / 1048576)} MB | ${!workers ? `\`${sig(r)}\`` : sig(r) === one ? `\`${sig(r)}\`, the same as 1` : `\`${sig(r)}\`, DIFFERENT`}${r.profile.workers?.reason ? ` (${r.profile.workers.reason})` : ''} |`,
    );
  }
  process.exit(0);
}
if (process.argv.includes('--matrix')) {
  const cap = arg('max', 20000);
  // --eras: the 3.3 reference (each character confined to its era, items crossing through time chutes); without it,
  // the open chain where every character can pick up anyone's items (the worst case).
  const erasRef = process.argv.includes('--eras');
  console.log(
    `| Game | Proof | States | Engine runs | Time | Positions | Time split (run / clone / hash / queue / tries / other) |`,
  );
  console.log('|---|---|---|---|---|---|---|');
  for (const rooms of [20, 40])
    for (const players of [1, 2, 3]) {
      const g = makeStressGame({
        rooms,
        players,
        items: 12,
        flags: 30,
        npcs: 1,
        scripts: 2,
        topics: 8,
        schemaVersion: 3,
        eras: erasRef,
      });
      const r = await solve(g.game, g.layouts, { mode: 'prove', maxStates: cap });
      const t = r.profile.timing;
      const tot = Object.values(t).reduce((a, b) => a + b, 0) || 1;
      const pc = (k: keyof typeof t) => `${Math.round((100 * t[k]) / tot)}%`;
      console.log(
        `| ${rooms} rooms, ${players} character${players > 1 ? 's' : ''} | ${r.status} | ${r.states} | ${r.profile.tries} | ${(r.profile.ms / 1000).toFixed(1)} s | ${r.profile.positions} | ${pc('run')} / ${pc('clone')} / ${pc('hash')} / ${pc('queue')} / ${pc('tries')} / ${pc('other')} |`,
      );
    }
  process.exit(0);
}
const prove = process.argv.includes('--prove');
const v3 = process.argv.includes('--v3');
const { game, layouts } = makeStressGame({ ...opts, ...(v3 ? { schemaVersion: 3 as const } : {}) });
const rows: [string, string][] = [];
const time = async <T>(label: string, fn: () => T | Promise<T>, note: (r: T) => string = () => '') => {
  const t0 = performance.now();
  const r = await fn();
  rows.push([label, `${(performance.now() - t0).toFixed(0)} ms ${note(r)}`.trim()]);
  return r;
};

console.log(
  `stress game: ${game.rooms.length} rooms, ${Object.keys(game.items).length} items, ${game.players?.ids.length ?? 1} players, ${Object.keys(game.characters).length} characters, ` +
    `${game.rooms.reduce((n, r) => n + (r.on?.length ?? 0), 0)} rules, ${game.rooms.reduce((n, r) => n + Object.values(r.talk ?? {}).flat().length, 0)} topics, ` +
    `${(game.scripts?.length ?? 0) + game.rooms.reduce((n, r) => n + (r.scripts?.length ?? 0), 0)} scripts, ${Object.keys(game.checkpoints ?? {}).length} chapters, ${game.migrations?.length ?? 0} migrations`,
);
const v = await time(
  'validate',
  () => validate(game, layouts),
  (r) => `${r.errors.length} errors, ${r.warnings.length} warnings`,
);
if (v.errors.length) console.log(v.errors.slice(0, 5).join('\n'));
await time(
  'report',
  () => reportMarkdown(report(game, layouts)),
  (r) => `${r.length} chars`,
);
await time(
  'world graph + svg',
  () => toSvg(worldGraph(game)),
  (r) => `${r.length} chars`,
);
await time(
  'puzzle graph + svg',
  () => {
    const g = puzzleGraph(game);
    return { g, svg: toPuzzleSvg(g) };
  },
  (r) => `${r.g.nodes.length} nodes, ${r.g.edges.length} edges`,
);
await time(
  'texts: extract + apply',
  () => {
    const p = textPaths(game);
    return applyLocale(game, Object.fromEntries(p.map((x) => [x.path, x.text.toUpperCase()])));
  },
  (r) => `${textPaths(r).length} texts`,
);
await time(
  'migrate a v1 save',
  () => {
    const e = new Engine(structuredClone(game), layouts, new FakePresenter(), new MemoryStore());
    return e
      .newGame()
      .then(() => migrate(game, { ...structuredClone(e.state), v: 1, flags: { old_1: true, tmp_1: true } }));
  },
  (r) => `v${r?.v}`,
);
const cps = Object.keys(game.checkpoints ?? {});
let prev: string | undefined;
for (const cp of cps) {
  const goal = game.checkpoints![cp].goals;
  await time(
    `solve chapter ${cp}`,
    () => solve(game, layouts, { maxStates: max, start: prev ? { checkpoint: prev } : 'new', goal }),
    (r) =>
      `${r.finished ? 'finished' : 'NOT finished'}, ${r.states} states, ${r.path.length} actions, ${r.profile.tries} runs${r.truncated ? ' (limit)' : ''}`,
  );
  prev = cp;
}
await time(
  `solve from ${prev} to the end`,
  () => solve(game, layouts, { maxStates: max, start: { checkpoint: prev! } }),
  (r) =>
    `${r.finished ? 'finished' : 'NOT finished'}, ${r.states} states, ${r.path.length} actions, ${r.profile.tries} runs${r.truncated ? ' (limit)' : ''}`,
);
await time(
  'solve global',
  () => solve(game, layouts, { maxStates: max }),
  (r) =>
    `${r.finished ? 'finished' : 'NOT finished'}, ${r.states} states, ${r.path.length} actions, ${r.profile.tries} runs${r.truncated ? ' (limit)' : ''}${r.broken.length ? `, ${r.broken.length} invariant(s) broken` : ''}`,
);
if (prove)
  await time(
    'solve global, --prove',
    () => solve(game, layouts, { maxStates: max, mode: 'prove' }),
    (r) =>
      `${r.status}, ${r.states} states, ${r.profile.tries} runs, ${r.softlockCount} softlock state(s)${r.truncated ? ' (limit)' : ''}`,
  );
if (prove)
  await time(
    'prove by chapters (compositional)',
    () => proveChapters(game, layouts, { maxStates: max, mode: 'prove' }),
    (r) =>
      `${r.status}, ${r.chapters.length} chapters, ${r.chapters.reduce((n, c) => n + c.states, 0)} states, from ${r.chapters.map((c) => c.distinct).join('/')} boundary state(s), ${r.chapters.reduce((n, c) => n + c.softlockCount, 0)} softlock state(s)${r.chapters.some((c) => c.checkpointUnreachable) ? ', a checkpoint unreachable' : ''}`,
  );
await time(
  'solve global, --por=stubborn',
  () => solve(game, layouts, { maxStates: max, por: 'stubborn' }),
  (r) =>
    `${r.finished ? 'finished' : 'NOT finished'}, ${r.states} states, ${r.path.length} actions, ${r.profile.tries} runs, ${r.profile.postponed} postponed${r.truncated ? ' (limit)' : ''}`,
);
console.log('');
console.log('| Step | Result |', '\n|---|---|');
for (const [a, b] of rows) console.log(`| ${a} | ${b} |`);
