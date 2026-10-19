// The CI plan (4.1.9, lot 0, tools/ci-plan.ts): which heavier jobs a change needs. A table of changes and the plan they
// must give; the rules that keep the plan from sparing itself; every tracked file known to a rule; and ci.yml wired to
// it: every gate read, every job the ruleset requires still there under its name, and a job the plan spares that still
// runs and succeeds (a skipped job does not satisfy a required check).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type CiPlan, classify, explain, fullPlan, GATES, type Gate, planFor } from '../tools/ci-plan';

/** The gates a plan opens, sorted, `all` first when set. */
const on = (p: CiPlan) => [...(p.all ? ['all'] : []), ...GATES.filter((g) => p[g])].sort();
const gates = (...g: (Gate | 'all')[]) => [...g].sort();
/** What one file of the core opens: every job, the dependency audit aside (the lockfile's own question). */
const EVERYTHING = gates('all', ...GATES.filter((g) => g !== 'auditDeps'));

describe('the plan of a change', () => {
  const table: [string, string[], string[]][] = [
    ['docs only', ['docs/en/TOOLS.md', 'docs/fr/TOOLS.md', 'README.md', 'changes/x.md'], []],
    ['a root markdown file', ['CHANGELOG.md', 'CONTRIBUTING.md'], []],
    ['another workflow', ['.github/workflows/nightly.yml'], []],
    ['the Bridge', ['bridge/src/store.ts'], gates('reality', 'freshInstall', 'node24', 'windows')],
    ['the signals game', ['games/signals/index.ts'], gates('reality', 'node24', 'windows')],
    ['the engine core', ['src/engine/core/engine.ts'], EVERYTHING],
    ['a save module', ['src/engine/core/save.ts'], EVERYTHING],
    ['a painter', ['src/engine/dom/render-canvas.ts'], gates('e2e', 'reference', 'node24', 'windows')],
    ['the music', ['src/engine/dom/director.ts'], gates('e2e', 'reference', 'node24', 'windows')],
    ['the worker update', ['src/engine/dom/update.ts'], gates('e2e', 'pwaFirefox', 'upgrade', 'node24', 'windows')],
    ['the Studio', ['src/studio/main.ts'], gates('e2e', 'node24', 'studioHosted', 'windows')],
    ['the hosted Studio in a browser', ['scripts/e2e-studio-hosted.ts'], gates('studioHosted')],
    [
      'the Studio Server',
      ['studio-server/migrations/0005.up.sql'],
      gates('secondGame', 'freshInstall', 'upgrade', 'reference', 'node24', 'windows', 'studioHosted'),
    ],
    ['its hosted tests', ['tests/studio-server.test.ts'], gates('node24', 'windows', 'studioHosted')],
    ['its CI S3 identity', ['ops/studio/ci/seaweedfs-s3.json'], gates('node24', 'windows', 'studioHosted')],
    ['its Keycloak realm', ['ops/studio/keycloak/realm.json'], gates('node24', 'windows', 'studioHosted')],
    [
      "the journal's SQL layer",
      ['bridge/src/migrations.ts'],
      gates('reality', 'freshInstall', 'node24', 'windows', 'studioHosted'),
    ],
    ['the sample game', ['games/demo/rooms/x.ts'], gates('e2e', 'node24', 'windows')],
    ['the reference chapter', ['games/reference/index.ts'], gates('reference', 'node24')],
    ['the template', ['games/_template/index.ts'], gates('secondGame', 'freshInstall', 'upgrade', 'node24', 'windows')],
    ['a golden save', ['tests/fixtures/saves/4.1.8.json'], gates('upgrade', 'node24', 'windows')],
    ['the PWA e2e', ['scripts/e2e-pwa.mjs'], gates('e2e', 'pwaFirefox')],
    ['the e2e driver', ['scripts/e2e.mjs'], gates('e2e', 'reference', 'secondGame')],
    ['a visual reference', ['tests/visual/demo/hall.png'], gates('e2e', 'reference')],
    ['a unit test', ['tests/core.test.ts'], gates('node24', 'windows')],
    ['the Windows launcher', ['scripts/start.mjs'], gates('node24', 'windows')],
    ['a release tool', ['tools/release/ship.mjs', 'tools/mutate.ts'], gates('node24', 'windows')],
    [
      'an authoring tool',
      ['tools/validate.ts'],
      gates('node24', 'windows', 'secondGame', 'freshInstall', 'upgrade', 'reference'),
    ],
    ['the audio pipeline', ['tools/audio/compose.py'], gates('e2e', 'reference', 'node24')],
    [
      'two parts at once: the union',
      ['bridge/src/store.ts', 'tests/visual/demo/hall.png'],
      gates('reality', 'freshInstall', 'node24', 'windows', 'e2e', 'reference'),
    ],
  ];
  for (const [name, files, want] of table)
    it(name, () => {
      expect(on(planFor(files))).toEqual(want);
    });

  it('runs everything for the lockfile, and audits the dependencies only then', () => {
    const lock = planFor(['package-lock.json']);
    expect(lock.all).toBe(true);
    expect(lock.auditDeps).toBe(true);
    const engine = planFor(['src/engine/core/engine.ts']);
    expect(engine.all).toBe(true);
    expect(engine.auditDeps).toBe(false);
    expect(planFor(['docs/en/TOOLS.md']).auditDeps).toBe(false);
  });

  it('never spares itself: the workflow, the plan and the shared configuration run everything', () => {
    for (const f of [
      '.github/workflows/ci.yml',
      'tools/ci-plan.ts',
      'package.json',
      'tsconfig.json',
      'vite.config.ts',
      'vitest.mutation.config.ts',
      'biome.json',
      'tools/vite/plugin.ts',
      'index.html',
      'public/icons/icon-192.png',
    ])
      expect(planFor([f]).all, f).toBe(true);
  });

  it('runs everything for a path no rule knows, and says why', () => {
    expect(planFor(['somewhere/new.ts']).all).toBe(true);
    expect(classify('somewhere/new.ts').why).toBe('a path the plan does not know');
    expect(explain(['somewhere/new.ts', 'docs/x.md'])).toEqual([
      'somewhere/new.ts: a path the plan does not know → everything',
      'docs/x.md: documentation → fast tier only',
    ]);
  });

  it('an empty change runs the fast tier only; the full plan opens every gate', () => {
    expect(on(planFor([]))).toEqual([]);
    expect(on(fullPlan())).toEqual(gates('all', ...GATES));
  });

  it('knows every tracked file (a new folder gets its rule before it gets the full CI by accident)', () => {
    const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
    expect(files.length).toBeGreaterThan(100);
    expect(files.filter((f) => classify(f).why === 'a path the plan does not know')).toEqual([]);
  });
});

describe('ci.yml and the plan', () => {
  const yml = readFileSync('.github/workflows/ci.yml', 'utf8').split('\njobs:\n')[1]!;
  /** The block of one job: from `  <id>:` to the next job. */
  const job = (id: string) => {
    const start = yml.search(new RegExp(`^  ${id}:\\n`, 'm'));
    expect(start, id).toBeGreaterThan(-1);
    const rest = yml.slice(start + id.length + 4);
    const end = rest.search(/^ {2}[\w-]+:\n/m);
    return end < 0 ? rest : rest.slice(0, end);
  };

  it('reads every gate, and no gate the plan does not give', () => {
    const read = new Set([...yml.matchAll(/fromJSON\(needs\.plan\.outputs\.plan\)\.(\w+)/g)].map((m) => m[1]));
    expect([...read].sort()).toEqual([...GATES].sort());
  });

  it('keeps every check the ruleset of main requires, under its name', () => {
    for (const id of [
      'check',
      'coverage',
      'node-24',
      'reality-xcheck',
      'fresh-install',
      'upgrade',
      'second-game',
      'e2e',
      'reference',
      'reality',
    ])
      job(id);
    const e2e = job('e2e');
    for (const [browser, mode] of [
      ['chromium', 'full'],
      ['webkit', 'generic'],
      ['chromium', 'keyboard'],
      ['webkit', 'keyboard'],
      ['chromium', 'fr'],
      ['chromium', 'canvas'],
    ])
      expect(e2e).toMatch(new RegExp(`- browser: ${browser}\\n\\s+mode: ${mode}\\n\\s+experimental: false`));
    expect(job('reference')).toContain('browser: [chromium, webkit]');
    expect(job('reality')).toContain('browser: [chromium, webkit]');
  });

  it('gates the work of a spared job inside it: no job-level `if` on a gated job, a step that succeeds instead', () => {
    for (const id of [
      'node-24',
      'reality-xcheck',
      'bridge-postgres',
      'connectors',
      'reality',
      'e2e',
      'reference',
      'pwa-firefox',
      'windows',
    ].concat(['second-game', 'fresh-install', 'upgrade'])) {
      const body = job(id);
      expect(body, id).not.toMatch(/^ {4}if:/m);
      expect(body, id).toMatch(/RUN: \$\{\{ fromJSON\(needs\.plan\.outputs\.plan\)\.\w+ \}\}/);
      expect(body, id).toContain('not needed by the plan');
      // Every step but the notice runs only when the plan asks.
      const steps = body.split(/\n {6}- /).slice(1);
      for (const s of steps)
        expect(s.includes("env.RUN == 'true'") || s.includes("env.RUN != 'true'"), `${id}: ${s.slice(0, 80)}`).toBe(
          true,
        );
    }
  });

  it('the gate job needs every other job and asks each for success', () => {
    const gate = job('pr-gate');
    expect(gate).toMatch(/^ {4}if: always\(\)/m);
    const ids = [...yml.matchAll(/^ {2}([\w-]+):\n/gm)]
      .map((m) => m[1]!)
      .filter((id) => !['pr-gate', 'pages'].includes(id));
    const needs = gate
      .match(/needs: \[([^\]]+)\]/)?.[1]
      ?.split(',')
      .map((s) => s.trim());
    expect(needs?.sort()).toEqual(ids.sort());
  });
});

describe('the workflow, lot 0 details', () => {
  const yml = readFileSync('.github/workflows/ci.yml', 'utf8');
  it("pr-gate tolerates a skipped mutation exactly when the mutation job's own `if` is false", () => {
    const cond = "github.event_name == 'pull_request' && contains(github.event.pull_request.labels.*.name, 'full-ci')";
    expect(yml).toContain(`    if: ${cond}`);
    expect(yml).toContain(`MUTATION: \${{ ${cond} }}`);
  });
  it('the plan job reads two commits and diffs against HEAD^1, everything on main, a tag or a full-ci label', () => {
    expect(yml).toMatch(/fetch-depth: 2/);
    expect(yml).toContain('--base=HEAD^1');
    expect(yml).toMatch(/--all/);
  });
});
