// npm run quality:baseline [-- --check] [--dist=dist]: what the engine does, frozen before a refactoring (4.1.0
// "Clarity", docs/dev/PLAN-4.1.1-CLARITY.md lot A). For the demo, the reference game and the solver's fixture games:
// the witness (status, length, the digest after every input), the proof (status, states, softlocks); every golden
// save, loaded and played to its end (the last digest); the public API and MCP surface (its hash); the test
// declarations. Written to tests/quality-baseline.json; --check compares and names each difference, so a change meant
// to keep behaviour that moves a digest, a verdict or a name fails with what moved. --dist adds the first visit's
// JavaScript (verify:dist), held to "no bigger": a refactoring may shrink it, never grow it.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GameDef, Layout, SessionEntry } from '../src/engine/core/types';
import type { CustomCommands } from '../src/engine/core/custom';
import { parseSave } from '../src/engine/core/save';
import { solve } from '../src/engine/tools/solve';
import { replay } from '../src/engine/tools/replay';
import { ROOT } from './game';
import { flushExit } from './flush';

const OUT = resolve(ROOT, 'tests/quality-baseline.json');
const args = process.argv.slice(2);
const check = args.includes('--check');
const distArg =
  args.find((a) => a.startsWith('--dist'))?.split('=')[1] ?? (args.includes('--dist') ? 'dist' : undefined);
const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

interface GameCase {
  id: string;
  load: () => Promise<{ game: GameDef; layouts: Record<string, Layout>; commands?: CustomCommands }>;
}
const fx = (id: string, file: string, make: string, lay: string, ...a: unknown[]): GameCase => ({
  id,
  load: async () => {
    const m = await import(`../tests/fixtures/${file}.ts`);
    return { game: m[make](...a), layouts: m[lay] };
  },
});
const GAMES: GameCase[] = [
  // @ts-expect-error: the sample games were removed from this fork (tests/removed-in-fork.json)
  { id: 'demo', load: async () => import('../games/demo') },
  // @ts-expect-error: the sample games were removed from this fork (tests/removed-in-fork.json)
  { id: 'reference', load: async () => import('../games/reference') },
  fx('classics.insults', 'classics', 'insults', 'insultsLayouts'),
  fx('classics.grog', 'classics', 'grog', 'grogLayouts'),
  fx('classics.dott', 'classics', 'dott', 'dottLayouts'),
  fx('classics.mansion', 'classics', 'mansion', 'mansionLayouts'),
  fx('classics.stan', 'classics', 'stan', 'stanLayouts'),
  fx('por.pickups-4', 'por', 'pickups', 'pickupsLayouts', 4),
  fx('por.trap-3', 'por', 'trap', 'pickupsLayouts', 3),
  fx('por.trials', 'por', 'trials', 'trialsLayouts'),
  fx('world', 'world', 'world', 'worldLayouts'),
  fx('cast', 'cast', 'cast', 'castLayouts'),
  fx('scale', 'scale', 'scale', 'scaleLayouts'),
  fx('picture', 'picture', 'picture', 'pictureLayouts'),
  fx('mini', 'mini', 'mini', 'miniLayouts'),
];

interface Baseline {
  games: Record<
    string,
    {
      witness: { status: string; finished: boolean; inputs: number; digests: string };
      proof: { status: string; states: number; softlocks: number };
    }
  >;
  saves: Record<string, { ended: boolean; inputs: number; last: string }>;
  surface: { api: string };
  tests: { files: number; declarations: number };
  bundle?: { initialJsKB: number };
}

async function measure(): Promise<Baseline> {
  const b: Baseline = { games: {}, saves: {}, surface: { api: '' }, tests: { files: 0, declarations: 0 } };
  for (const c of GAMES) {
    const { game, layouts, commands } = await c.load();
    const w = await solve(game, layouts, { mode: 'witness', ...(commands ? { commands } : {}) });
    const r = await replay(game, layouts, { start: { kind: 'new' }, log: w.steps }, commands ? { commands } : {});
    const digests = r.session.log.map((e: SessionEntry) => e.digest ?? '').join(',');
    const p = await solve(game, layouts, { mode: 'prove', ...(commands ? { commands } : {}) });
    b.games[c.id] = {
      witness: { status: w.status, finished: w.finished, inputs: w.steps.length, digests: hash(digests) },
      proof: { status: p.status, states: p.states, softlocks: p.softlockCount },
    };
    console.error(
      `  ${c.id}: witness ${w.status} (${w.steps.length}), proof ${p.status} (${p.states} states, ${p.softlockCount} softlocks)`,
    );
  }
  // @ts-expect-error: the sample games were removed from this fork (tests/removed-in-fork.json)
  const { game: demo, layouts: demoLayouts, commands } = await import('../games/demo');
  for (const f of readdirSync(resolve(ROOT, 'tests/fixtures/saves'))
    .filter((n) => n.startsWith('demo-') && n.endsWith('.json'))
    .sort()) {
    const golden = JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/saves', f), 'utf8'));
    const state = parseSave(demo, golden.envelope);
    const r = await replay(
      demo,
      demoLayouts,
      { start: { kind: 'load' }, base: state, log: golden.remaining },
      { commands },
    );
    b.saves[f] = { ended: r.ended, inputs: golden.remaining.length, last: r.session.log.at(-1)?.digest ?? '' };
  }
  b.surface.api = hash(readFileSync(resolve(ROOT, 'tests/api-surface.json'), 'utf8'));
  const testFiles: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = resolve(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.test.ts')) testFiles.push(p);
    }
  };
  walk(resolve(ROOT, 'tests'));
  b.tests = {
    files: testFiles.length,
    declarations: testFiles.reduce(
      // A test skipped or run on a condition (`it.skipIf(…)(`, `it.runIf(…)(`, 4.1.18) is a declaration too.
      (n, f) =>
        n + (readFileSync(f, 'utf8').match(/^\s*(it|test)(\.each\([^)]*\)|\.(skipIf|runIf)\(.*\))?\(/gm)?.length ?? 0),
      0,
    ),
  };
  if (distArg) {
    const out = execFileSync('npx', ['tsx', 'tools/dist.ts', `--dir=${distArg}`, '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    b.bundle = { initialJsKB: JSON.parse(out).initialJsKB };
  }
  return b;
}

/**
 * The READMEs' figures (`<!-- metric:tests -->…<!-- /metric -->`, `metric:initialJsKB`, `metric:referenceStates`),
 * written by the baseline with the JSON (4.1.8): they move with the code, and `--check` fails when they lag.
 */
const READMES = ['README.md', 'README.fr.md'];
const METRIC = /(<!-- metric:(\w+) -->)([^<]*)(<!-- \/metric -->)/g;
export function metricsOf(b: Baseline): Record<string, string> {
  const reference = b.games.reference?.proof.states;
  return {
    tests: String(b.tests.declarations),
    ...(b.bundle ? { initialJsKB: String(b.bundle.initialJsKB) } : {}),
    ...(reference !== undefined ? { referenceStates: String(reference) } : {}),
  };
}
export function withMetrics(page: string, m: Record<string, string>): string {
  return page.replace(METRIC, (all, open: string, name: string, _v: string, close: string) =>
    name in m ? `${open}${m[name]}${close}` : all,
  );
}

/**
 * The README's install section (4.1.20 PR 4, plan §9.2): between `<!-- install:begin -->` and `<!-- install:end -->`,
 * in both languages, the archive URL of this version, written here with the figures. Its text is the
 * `archive-human-install` pass's surface (`readme:install`, docs/dev/surfaces.json): only a release changes it.
 */
const INSTALL = /(<!-- install:begin -->)([\s\S]*?)(<!-- install:end -->)/;
export function withInstall(page: string, version: string): string {
  return page.replace(
    INSTALL,
    (_all, open: string, body: string, close: string) =>
      `${open}${body.replace(
        /https:\/\/github\.com\/wanoo\/web-scumm\/releases\/download\/(v[^/\s]+)\/web-scumm-[^\s/]+?\.tgz/g,
        // A release candidate of this version keeps its tag (4.2.0-rc, the passes' campaign): the archive is the
        // version's, published under the rc's release until the stable one exists. Any other tag becomes this version's.
        (_url, tag: string) =>
          `https://github.com/wanoo/web-scumm/releases/download/${tag.startsWith(`v${version}-rc.`) && /^v[\d.]+-rc\.[1-9]\d*$/.test(tag) ? tag : `v${version}`}/web-scumm-${version}.tgz`,
      )}${close}`,
  );
}
const VERSION = (JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { version: string }).version;

/** The policy parts that got better than the baseline (4.1.3): said, so the baseline is ratcheted on purpose. */
export function improvements(want: Baseline, got: Baseline): string[] {
  const out: string[] = [];
  if (got.tests.declarations > want.tests.declarations)
    out.push(`tests: ${want.tests.declarations} → ${got.tests.declarations} declarations`);
  if (want.bundle && got.bundle && got.bundle.initialJsKB < want.bundle.initialJsKB)
    out.push(`first visit's JavaScript: ${want.bundle.initialJsKB} → ${got.bundle.initialJsKB} KB gzipped`);
  return out;
}

/** What moved between two baselines, one line each. Tests may only grow; the first visit may only shrink. */
export function differences(want: Baseline, got: Baseline): string[] {
  const out: string[] = [];
  for (const [id, g] of Object.entries(want.games)) {
    const h = got.games[id];
    if (!h) {
      out.push(`${id}: no longer measured`);
      continue;
    }
    for (const part of ['witness', 'proof'] as const)
      for (const [k, v] of Object.entries(g[part])) {
        const now = (h[part] as Record<string, unknown>)[k];
        if (now !== v)
          out.push(
            `${id} ${part}.${k}: ${v} → ${now}${k === 'digests' ? ' (a state after some input differs: npm run replay on the witness names the entry)' : ''}`,
          );
      }
  }
  for (const id of Object.keys(got.games))
    if (!want.games[id]) out.push(`${id}: new game, not in the baseline (npm run quality:baseline)`);
  for (const [f, s] of Object.entries(want.saves)) {
    const h = got.saves[f];
    if (!h) out.push(`golden save ${f}: missing`);
    else
      for (const [k, v] of Object.entries(s))
        if ((h as Record<string, unknown>)[k] !== v)
          out.push(`golden save ${f} ${k}: ${v} → ${(h as Record<string, unknown>)[k]}`);
  }
  if (want.surface.api !== got.surface.api) out.push('tests/api-surface.json: the public API or the MCP tools changed');
  if (got.tests.declarations < want.tests.declarations)
    out.push(`tests: ${want.tests.declarations} declarations → ${got.tests.declarations} (a test was removed)`);
  if (want.bundle && got.bundle && got.bundle.initialJsKB > want.bundle.initialJsKB)
    out.push(`first visit's JavaScript: ${want.bundle.initialJsKB} KB → ${got.bundle.initialJsKB} KB gzipped`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('quality-baseline.ts')) {
  console.error('quality baseline: solving and replaying…');
  const got = await measure();
  if (!check) {
    const prev = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as Baseline) : undefined;
    if (!got.bundle && prev?.bundle) got.bundle = prev.bundle;
    // A rewrite says what it moves (4.1.3): a digest or a verdict that changes here is a behaviour change to own in
    // the CHANGELOG, never a side effect of "refreshing the baseline".
    if (prev) {
      const moved = differences(prev, got).filter((d) => !d.startsWith('tests:'));
      for (const d of moved) console.log('  ⚠ behaviour moved: ' + d);
      for (const d of improvements(prev, got)) console.log('  ✔ ratcheted: ' + d);
    }
    writeFileSync(OUT, JSON.stringify(got, null, 1) + '\n');
    // The READMEs say the same two figures (4.1.8, docs/418-truth): they moved with the code, not with a release.
    for (const r of READMES) {
      const file = resolve(ROOT, r);
      const page = readFileSync(file, 'utf8');
      const next = withInstall(withMetrics(page, metricsOf(got)), VERSION);
      if (next !== page) {
        writeFileSync(file, next);
        console.log(`  ✔ ${r}: the figures written`);
      }
    }
    console.log(
      `✔  tests/quality-baseline.json written: ${Object.keys(got.games).length} games, ${Object.keys(got.saves).length} golden saves, ${got.tests.declarations} test declarations`,
    );
    await flushExit(0);
  } else {
    const want = JSON.parse(readFileSync(OUT, 'utf8')) as Baseline;
    const diff = differences(want, got);
    for (const r of READMES) {
      const page = readFileSync(resolve(ROOT, r), 'utf8');
      if (withMetrics(page, metricsOf({ ...got, bundle: got.bundle ?? want.bundle })) !== page)
        diff.push(`${r}: a figure is behind the baseline (npm run quality:baseline writes it)`);
      if (withInstall(page, VERSION) !== page)
        diff.push(`${r}: the install section names another version (npm run quality:baseline writes it)`);
    }
    for (const d of diff) console.log('  ✖ ' + d);
    for (const d of improvements(want, got))
      console.log(`  ⚠ better than the baseline, ratchet it (npm run quality:baseline): ${d}`);
    console.log(
      diff.length
        ? `✖  behaviour moved from tests/quality-baseline.json (${diff.length})`
        : `✔  same behaviour as tests/quality-baseline.json: ${Object.keys(got.games).length} games, ${Object.keys(got.saves).length} golden saves, ${got.tests.declarations} test declarations${got.bundle ? `, first visit ${got.bundle.initialJsKB} KB` : ''}`,
    );
    await flushExit(diff.length ? 1 : 0);
  }
}
