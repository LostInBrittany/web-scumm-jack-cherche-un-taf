// The status registry (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.4.2, phase A5): for each product surface, five
// statuses kept apart, never merged into one "experimental" banner. The contract status (experimental, stable,
// deprecated) and the environments the support matrix says CI verifies come from docs/dev/contracts.json, whose quotes
// of the wiki's `start.stability` and `reference.support-matrix` (docs/en|fr/SUPPORT.md until 4.5.0)
// tests/contracts.test.ts checks; the automated checks are ci:plan's gates, CI and candidate
// jobs and test files, each checked to exist; the people's passes are read from the pass sheet of the version
// (docs/dev/passes/<v>.md, the table `npm run field:report` writes), with the issue that tracks each; the known limits
// are the page's own `[!LIMIT]` blocks. A wiki page names its surfaces in the manifest (`surfaces`), and the build's
// header shows the five for each.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { GATES, globToRegExp } from '../ci-plan';
import { PASS_IDS, passesFor } from '../field/schema';
import { compareVersions } from './docs';
import { issuesOf } from './manifest';
import { SEMVER } from './page';

export const CONTRACTS_FILE = 'docs/dev/contracts.json';
const SURFACES_FILE = 'docs/dev/surfaces.json';
const PASSES_DIR = 'docs/dev/passes';
/** The workflows whose jobs a contract may name as its automated checks. */
const WORKFLOWS = ['.github/workflows/ci.yml', '.github/workflows/candidate.yml'];

const CONTRACT_STATUSES = ['experimental', 'stable', 'deprecated'] as const;
const bilingual = z.object({ en: z.string().trim().min(1).max(300), fr: z.string().trim().min(1).max(300) }).strict();
const passId = z.enum(PASS_IDS);

const ContractsSchema = z
  .object({
    format: z.literal('quest-n-click-contracts'),
    version: z.literal(1),
    note: z.string(),
    /** The support matrix's revision the environments are read from: a version and its date. */
    asOf: z.object({ version: z.string().regex(SEMVER), date: z.iso.date() }).strict(),
    /** The issue that tracks each pass, by the version of the sheet that asks it. */
    passIssues: z.partialRecord(passId, z.record(z.string().regex(SEMVER), z.number().int().positive())),
    contracts: z.record(
      z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      z
        .object({
          title: bilingual,
          status: z.enum(CONTRACT_STATUSES),
          /**
           * The row of `start.stability`'s surface table (wiki/en|fr/start.stability.md) that states the status, its
           * first three cells quoted (spaces aside); null, with `reason`, for a surface the pages do not name yet.
           */
          support: z
            .object({ en: z.string().min(1), fr: z.string().min(1) })
            .strict()
            .nullable(),
          /** The rows of the support matrix (`reference.support-matrix#matrix`) that speak for it, by their first cell; null, with `reason`. */
          matrixRows: z
            .object({ en: z.array(z.string().min(1)), fr: z.array(z.string().min(1)) })
            .strict()
            .nullable(),
          /** Why `support` or `matrixRows` is null (none since C2, when the documentation's surface gained its rows). */
          reason: z.string().trim().min(20).optional(),
          environments: z.array(bilingual),
          checks: z
            .object({
              gates: z.array(z.enum(GATES)),
              jobs: z.array(z.string().regex(/^[a-z0-9-]+$/)),
              tests: z.array(z.string().min(1)),
            })
            .strict(),
          passes: z.array(passId),
        })
        .strict()
        .refine((k) => (k.support !== null && k.matrixRows !== null) || !!k.reason, {
          message: 'support or matrixRows is null without a reason',
        })
        .refine((k) => !k.reason || k.support === null || k.matrixRows === null, {
          message: 'a reason explains a null support or matrixRows; this surface has both',
        }),
    ),
  })
  .strict();
type Contracts = z.infer<typeof ContractsSchema>;
type Contract = Contracts['contracts'][string];

/** The registry of a repository, or what is wrong with it. */
export function readContracts(root: string): { contracts?: Contracts; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(root, CONTRACTS_FILE), 'utf8'));
  } catch (e) {
    return { errors: [`${CONTRACTS_FILE}: ${(e as Error).message}`] };
  }
  const parsed = ContractsSchema.safeParse(raw);
  if (!parsed.success) return { errors: issuesOf(parsed.error).map((l) => `${CONTRACTS_FILE} ${l}`) };
  return { contracts: parsed.data, errors: [] };
}

/** The jobs a workflow defines (`  <name>:` under `jobs:`). */
function workflowJobs(root: string): Set<string> {
  const jobs = new Set<string>();
  for (const wf of WORKFLOWS) {
    const file = join(root, wf);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const body = text.slice(text.indexOf('\njobs:\n'));
    for (const m of body.matchAll(/^ {2}([a-z0-9-]+):\s*$/gm)) jobs.add(m[1]!);
  }
  return jobs;
}

/**
 * What the registry names that does not exist: a CI job no workflow defines, a test glob no tracked file matches, a
 * pass docs/dev/surfaces.json does not bind; and a pass no contract waits for, or without its issue.
 */
export function checkContracts(root: string, tracked: readonly string[], c: Contracts): string[] {
  const errors: string[] = [];
  const jobs = workflowJobs(root);
  let surfaces: Record<string, unknown> = {};
  try {
    surfaces =
      (JSON.parse(readFileSync(join(root, SURFACES_FILE), 'utf8')) as { surfaces?: Record<string, unknown> })
        .surfaces ?? {};
  } catch (e) {
    errors.push(`${SURFACES_FILE}: ${(e as Error).message}`);
  }
  for (const [id, k] of Object.entries(c.contracts)) {
    for (const job of k.checks.jobs)
      if (!jobs.has(job)) errors.push(`${CONTRACTS_FILE}: ${id} names the job ${job}, which no workflow defines`);
    for (const glob of k.checks.tests)
      if (!tracked.some((f) => globToRegExp(glob).test(f)))
        errors.push(`${CONTRACTS_FILE}: ${id} names the tests "${glob}", which match no tracked file`);
    for (const pass of k.passes)
      if (!(pass in surfaces))
        errors.push(`${CONTRACTS_FILE}: ${id} waits for ${pass}, a pass ${SURFACES_FILE} does not bind`);
  }
  const waited = new Set(Object.values(c.contracts).flatMap((k) => k.passes));
  for (const pass of PASS_IDS)
    if (!waited.has(pass)) errors.push(`${CONTRACTS_FILE}: no contract waits for the pass ${pass}`);
  // Every pass the newest sheet asks has its issue for that version.
  const newest = passSheet(root, '999.0.0');
  if (newest)
    for (const pass of passesFor(newest))
      if (!c.passIssues[pass]?.[newest])
        errors.push(
          `${CONTRACTS_FILE}: the pass ${pass} has no issue for ${newest} in passIssues (docs/dev/passes/${newest}.md asks it)`,
        );
  return errors;
}

export type PassState = 'passed' | 'failed' | 'blocked' | 'not-run';
/** A pass sheet's table, `| <label> (`<id>`) | <status> | …`, as `npm run field:report` writes it. */
const PASS_ROW = /^\|[^|]*\(`([a-z0-9-]+)`\)\s*\|\s*(passed|failed|blocked|not-run)\s*\|/;

/**
 * The pass sheet that speaks for `version`: the newest `docs/dev/passes/<v>.md` not after it (a pre-release reads its
 * release's sheet when there is one), or undefined.
 */
export function passSheet(root: string, version: string): string | undefined {
  const dir = join(root, PASSES_DIR);
  if (!existsSync(dir)) return undefined;
  const release = version.replace(/-.*$/, '');
  return readdirSync(dir)
    .map((f) => /^(\d+\.\d+\.\d+)\.md$/.exec(f)?.[1])
    .filter((v): v is string => !!v && compareVersions(v, release) <= 0)
    .sort(compareVersions)
    .at(-1);
}

/** Each pass's state in a sheet's table; a pass the table does not list is `not-run`. */
export function passStates(root: string, sheet: string | undefined): Map<string, PassState> {
  const out = new Map<string, PassState>();
  if (!sheet) return out;
  for (const line of readFileSync(join(root, PASSES_DIR, `${sheet}.md`), 'utf8').split(/\r?\n/)) {
    const m = PASS_ROW.exec(line);
    if (m) out.set(m[1]!, m[2] as PassState);
  }
  return out;
}

export interface SurfaceStatus {
  id: string;
  title: { en: string; fr: string };
  /** 1. The contract: experimental, stable or deprecated. */
  contract: Contract['status'];
  /** 2. The environments CI verifies, as of the support matrix of `asOf`. */
  environments: { en: string; fr: string }[];
  asOf: { version: string; date: string };
  /** 3. The automated checks: ci:plan's gates, the jobs, the test files. */
  checks: Contract['checks'];
  /** 4. The people's passes it waits for: their state in the sheet, the issue that tracks each. */
  passes: { id: string; state: PassState | 'not-asked'; issue?: number; sheet?: string }[];
  /** 5. The known limits: the page's `[!LIMIT]` ids (filled by the caller, which reads the page). */
  limits: string[];
}

/**
 * The five statuses of each surface, for the product version documented. A pass not asked of that version yet
 * (`PASS_SINCE`) is `not-asked`; one asked and absent from the sheet is `not-run`.
 */
export function surfaceStatuses(root: string, c: Contracts, productVersion: string): Map<string, SurfaceStatus> {
  const sheet = passSheet(root, productVersion);
  const states = passStates(root, sheet);
  const asked = new Set<string>(passesFor(productVersion));
  const out = new Map<string, SurfaceStatus>();
  for (const [id, k] of Object.entries(c.contracts))
    out.set(id, {
      id,
      title: k.title,
      contract: k.status,
      environments: k.environments,
      asOf: c.asOf,
      checks: k.checks,
      passes: k.passes.map((p) => ({
        id: p,
        state: asked.has(p) ? (states.get(p) ?? 'not-run') : 'not-asked',
        ...(sheet && c.passIssues[p]?.[sheet] ? { issue: c.passIssues[p][sheet] } : {}),
        ...(sheet ? { sheet: `${PASSES_DIR}/${sheet}.md` } : {}),
      })),
      limits: [],
    });
  return out;
}
