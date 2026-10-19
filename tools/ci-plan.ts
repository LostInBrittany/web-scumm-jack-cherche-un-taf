// node --experimental-strip-types tools/ci-plan.ts [--base=<ref>] [--all] [--files=a,b,…] (4.1.9, lot 0 "CI in three
// tiers"; `npx tsx tools/ci-plan.ts` works the same): which of CI's heavier jobs a change needs. It reads the files the
// branch changes (`git diff --name-only <base>...HEAD`), classifies each by the first rule of RULES that matches, and
// prints one line of JSON: a boolean per gate, the union of what every file asks. The `plan` job of ci.yml writes it to
// its output; each job reads its gate and runs its real work, or one step that says "not needed by the plan" and
// succeeds (the ruleset requires the jobs by name, and a skipped job is not a success). On `main`, on a tag and on a
// pull request labelled `full-ci`, the workflow passes `--all`. A path no rule knows, a shared configuration, the
// engine's core, this file and the workflow itself run everything: the plan never decides that it does not need to be
// checked. A git error runs everything too. Self-contained (no import but Node's): the `plan` job runs it without
// `npm ci`.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

/** The jobs the plan can spare, by their key in the JSON (ci.yml reads `fromJSON(needs.plan.outputs.plan).<key>`). */
export const GATES = [
  'auditDeps',
  'node24',
  'e2e',
  'reference',
  'reality',
  'pwaFirefox',
  'windows',
  'secondGame',
  'freshInstall',
  'upgrade',
  'studioHosted',
] as const;
export type Gate = (typeof GATES)[number];
/** Every gate, plus `all` when one file (or `--all`) asked for everything. */
export type CiPlan = Record<Gate, boolean> & { all: boolean };

/** The job (or matrix) each gate opens, as ci.yml names it. */
export const JOB_OF: Record<Gate, string> = {
  auditDeps: 'check (the `audit:deps` step)',
  node24: 'node-24',
  e2e: 'e2e (the six rows)',
  reference: 'reference (chromium, webkit)',
  reality: 'reality-xcheck, connectors, reality (chromium, webkit)',
  pwaFirefox: 'pwa-firefox',
  windows: 'windows',
  secondGame: 'second-game',
  freshInstall: 'fresh-install',
  upgrade: 'upgrade',
  studioHosted: 'studio-hosted',
};

interface Rule {
  re: RegExp;
  /** The gates this path opens; `all` runs everything; `[]` is the fast tier alone (check, coverage). */
  gates: readonly Gate[] | 'all';
  why: string;
}

// What a unit test or a build of the sample game cannot see: Node 24, Windows. Every code path asks for both.
const UNIT = ['node24', 'windows'] as const;
// The authoring pipeline (validate, solve, lint, build:game, pack, the template): every game's build goes through it.
const AUTHORING = [...UNIT, 'secondGame', 'freshInstall', 'upgrade', 'reference'] as const;

/** First match wins: the specific paths before the folders that hold them. */
export const RULES: readonly Rule[] = [
  // The plan never vouches for itself, nor for what every job shares.
  { re: /^\.github\/workflows\/ci\.yml$/, gates: 'all', why: 'the workflow itself' },
  { re: /^tools\/ci-plan\.ts$/, gates: 'all', why: 'the plan itself' },
  { re: /^package(-lock)?\.json$/, gates: 'all', why: 'dependencies or scripts' },
  {
    re: /^(tsconfig[^/]*\.json|vite\.config\.ts|vitest[^/]*\.ts|biome\.json|knip\.json|requirements\.txt|\.nvmrc|\.gitattributes)$/,
    gates: 'all',
    why: 'a shared configuration',
  },
  { re: /^(index|studio)\.html$|^public\/|^src\/(main\.ts|env\.d\.ts)$/, gates: 'all', why: 'the app shell' },
  { re: /^tools\/vite\//, gates: 'all', why: 'the build plugins' },

  // Prose and agent configuration: the fast tier (its unit tests read the docs: links, parity, figures).
  { re: /^(docs|changes)\//, gates: [], why: 'documentation' },
  { re: /\.md$/, gates: [], why: 'documentation' },
  { re: /^(LICENSE[^/]*|\.gitignore|\.git-blame-ignore-revs|\.mcp\.json)$/, gates: [], why: 'repository metadata' },
  { re: /^\.(claude|cursor)\//, gates: [], why: 'agent configuration' },
  {
    re: /^clevercloud\//,
    gates: [],
    why: "Clever Cloud's own files (the daily backup's cron, 4.2.3): read when deployed",
  },
  { re: /^\.github\//, gates: [], why: 'another workflow or a template (not run by ci)' },

  // The engine, by the part a change can break; the rest of src/engine is the core: everything.
  {
    re: /^src\/engine\/(reality\/|core\/reality-runtime\.ts$|dom\/reality-ui\.ts$)/,
    gates: ['reality', 'e2e', ...UNIT],
    why: 'the Reality runtime',
  },
  {
    re: /^src\/engine\/dom\/(render-[^/]+|renderer|room|scene-entity|camera|palette)\.ts$|^src\/engine\/dom\/style\.css$/,
    gates: ['e2e', 'reference', ...UNIT],
    why: 'the painters',
  },
  { re: /^src\/engine\/dom\/(audio|director)\.ts$/, gates: ['e2e', 'reference', ...UNIT], why: 'the music director' },
  {
    re: /^src\/engine\/(boot\.ts|dom\/(update|offline|save-store|storage)\.ts)$/,
    gates: ['e2e', 'pwaFirefox', 'upgrade', ...UNIT],
    why: 'the PWA and the storage',
  },
  { re: /^src\/engine\//, gates: 'all', why: 'the engine core' },
  {
    re: /^src\/studio\//,
    gates: ['e2e', 'studioHosted', ...UNIT],
    why: 'the Studio (the canvas row edits a stage; studio-hosted runs it on the Studio Server)',
  },

  // The Reality Bridge and its sample game.
  // The Studio Server's journal runs on these (4.2.1): its SQL store and its migrations runner.
  {
    re: /^bridge\/src\/(store-sql|store-sqlite|migrations)\.ts$/,
    gates: ['reality', 'freshInstall', ...UNIT, 'studioHosted'],
    why: "the Bridge's SQL layer, also the Studio Server journal's",
  },
  { re: /^bridge\//, gates: ['reality', 'freshInstall', ...UNIT], why: 'the Reality Bridge (also a package)' },
  {
    re: /^(connectors\/|games\/signals\/|scripts\/(e2e-reality|reality-spike)\.mjs$|tools\/(reality-xcheck|solve-reality|reality-fixtures)\.ts$)/,
    gates: ['reality', ...UNIT],
    why: 'Reality',
  },

  // The games.
  { re: /^games\/demo\//, gates: ['e2e', ...UNIT], why: 'the sample game' },
  { re: /^games\/reference\//, gates: ['reference', 'node24'], why: 'the reference chapter' },
  // This fork's game (Jack cherche un taf): its own tests and the unit suite.
  { re: /^games\/jack\//, gates: [...UNIT], why: "the fork's game" },
  // The Bridge's qualification profile (4.1.18): brought up by its own workflow (qualify.yml) and the candidate's
  // `deployment-smoke`; here its static test only.
  {
    re: /^(ops\/(?!studio\/(ci|keycloak)\/)|scripts\/ops-qualify\.mjs$|scripts\/ops-qualify\/)/,
    gates: [...UNIT],
    why: 'the qualification profile',
  },
  {
    re: /^(games\/_template\/|cli\/|scripts\/(pack|fresh-install|external-consumer|new-game)\.mjs$)/,
    gates: ['secondGame', 'freshInstall', 'upgrade', ...UNIT],
    why: 'the packages and the template',
  },

  // The saves a release must keep reading.
  {
    re: /^(tests\/fixtures\/saves\/|tools\/golden-save\.ts$|scripts\/upgrade-check\.mjs$)/,
    gates: ['upgrade', ...UNIT],
    why: 'the golden saves and the upgrade',
  },

  // The browser scripts.
  { re: /^scripts\/e2e-pwa\.mjs$/, gates: ['e2e', 'pwaFirefox'], why: 'the PWA e2e' },
  {
    re: /^scripts\/(e2e-studio-(hosted|collab)\.ts|lib\/studio-stack\.ts)$/,
    gates: ['studioHosted'],
    why: 'the hosted Studio in a browser',
  },
  { re: /^scripts\/e2e(\/|[^/]*\.mjs$)/, gates: ['e2e', 'reference', 'secondGame'], why: 'the browser e2e' },
  { re: /^tests\/visual\//, gates: ['e2e', 'reference'], why: 'the visual references' },
  { re: /^(scripts\/start\.mjs|tests\/run-tool\.ts)$/, gates: [...UNIT], why: 'what Windows runs differently' },

  // Tools that ship nothing and build nothing: the unit tier.
  {
    re: /^(tools\/(mutate|mutation-sets|coverage-ratchet|quality-baseline|api-doc|audit-corpus|bench|changes)\.ts$|tools\/release\/|scripts\/(release-notes\.(mjs|d\.mts)|check-links\.mjs|docs-screenshots\.mjs)$)/,
    gates: [...UNIT],
    why: 'a repository tool',
  },
  { re: /^tools\/audio(\/|\.py$)/, gates: ['e2e', 'reference', 'node24'], why: 'the audio pipeline' },
  {
    re: /^studio-server\//,
    gates: [...AUTHORING, 'studioHosted'],
    why: 'the Studio Server and its operation core (4.2.1)',
  },
  { re: /^(tools|scripts)\//, gates: [...AUTHORING], why: 'the authoring pipeline' },
  {
    re: /^(tests\/studio-(server|worker|collab|keycloak|client)\.test\.ts|ops\/studio\/(ci|keycloak)\/)/,
    gates: [...UNIT, 'studioHosted'],
    why: 'the hosted Studio against Postgres and S3 (4.2.1)',
  },
  { re: /^tests\//, gates: [...UNIT], why: 'the unit tests' },
];

/** The first rule a path matches, or everything for a path no rule knows. */
export function classify(path: string): { gates: readonly Gate[] | 'all'; why: string } {
  const rule = RULES.find((r) => r.re.test(path));
  return rule ?? { gates: 'all', why: 'a path the plan does not know' };
}

const none = (): CiPlan => ({
  all: false,
  ...(Object.fromEntries(GATES.map((g) => [g, false])) as Record<Gate, boolean>),
});

/** Everything: `main`, a tag, a `full-ci` pull request, a git error. */
export const fullPlan = (): CiPlan => ({
  all: true,
  ...(Object.fromEntries(GATES.map((g) => [g, true])) as Record<Gate, boolean>),
});

/** The union of what each changed file asks. `audit:deps` follows the lockfile (and package.json) only. */
export function planFor(changed: readonly string[]): CiPlan {
  const plan = none();
  for (const path of changed) {
    const { gates } = classify(path);
    if (gates === 'all') return { ...fullPlan(), auditDeps: changed.some((p) => /^package(-lock)?\.json$/.test(p)) };
    for (const g of gates) plan[g] = true;
  }
  return plan;
}

/** One line per file and the gates it opened, for the job's log and summary. */
export function explain(changed: readonly string[]): string[] {
  return changed.map((p) => {
    const { gates, why } = classify(p);
    return `${p}: ${why} → ${gates === 'all' ? 'everything' : gates.length ? gates.join(', ') : 'fast tier only'}`;
  });
}

if (process.argv[1]?.endsWith('ci-plan.ts')) {
  const args = process.argv.slice(2);
  const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  let plan: CiPlan;
  let lines: string[];
  if (args.includes('--all')) {
    plan = fullPlan();
    lines = ['--all: main, a tag or a pull request labelled full-ci'];
  } else {
    let changed: string[] | undefined = opt('files')?.split(',').filter(Boolean);
    if (!changed) {
      const base = opt('base') ?? 'origin/main';
      try {
        changed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' })
          .split('\n')
          .filter(Boolean);
      } catch (e) {
        console.error(`⚠  git diff against ${base} failed (${(e as Error).message.split('\n')[0]}): everything runs`);
      }
    }
    plan = changed ? planFor(changed) : fullPlan();
    lines = changed ? explain(changed) : ['git diff failed: everything'];
    // `all` from a file keeps `auditDeps` honest (the lockfile's own question); a git error audits too.
    if (!changed) plan.auditDeps = true;
  }
  const on = GATES.filter((g) => plan[g]);
  for (const l of lines) console.error(`  ${l}`);
  console.error(
    `✔  plan: ${plan.all ? 'everything' : on.length ? on.map((g) => JOB_OF[g]).join('; ') : 'the fast tier only (check, coverage)'}`,
  );
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary)
    appendFileSync(
      summary,
      `### CI plan\n\n| Gate | Job | Runs |\n|---|---|---|\n${GATES.map((g) => `| \`${g}\` | ${JOB_OF[g]} | ${plan[g] ? 'yes' : 'not needed'} |`).join('\n')}\n\n<details><summary>${lines.length} line(s)</summary>\n\n${lines.map((l) => `- ${l}`).join('\n')}\n\n</details>\n`,
    );
  console.log(JSON.stringify(plan));
}
