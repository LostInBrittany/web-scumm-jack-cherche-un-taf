// A page's guarantees and their three states (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.4.3, phase A5). A
// `> [!GUARANTEE id=…]` block names a claim of the manifest, `{id, test: "file › name"}`; the claim is shown as what
// is known of it, never more:
//   1. referenced: the test file is tracked and holds a test of that exact name (its `describe` titles and its own,
//      joined with ` › `, read from the source by a scanner of `describe(`, `it(` and `test(` calls);
//   2. executed on <sha>: a Vitest JSON report (`--reporter=json`) says that test `passed` (never `skipped`, `todo`
//      or `pending`), and the report's sidecar `commit.json`, written beside it by the candidate, names the documented
//      product commit, the checkout's root (so a report's file is matched by its exact repository path) and the run.
//      The local file alone proves nothing about who made it: `--candidate <run>` requires the run, and A5b's
//      publication workflow downloads `candidate-test-report` from that attested candidate run itself;
//   3. scope reviewed: `wiki/reviews.json` holds a record that the test covers the claim, with the hash of the
//      claim's text (the test's name and the block in both languages) and of the test file: any change to either
//      resets it, and `npm run wiki -- review-claim <id> --by <name> --kind human|ai --relation author|independent`
//      records it again. Its reviewers say who read it (reviewer.ts): only a person's review makes it "scope
//      reviewed"; an AI's own check of what it wrote is said as such, and `check --publish` wants a person's.
// A claim naming a test written `.skip`, `.todo`, `.only`, `.fails` (or `.skipIf`, `.runIf`, on it or a describe
// around it) is refused at the first state: such a test does not run as it reads, or proves the opposite.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { globToRegExp } from '../ci-plan';
import { z } from 'zod';
import { formatJson } from './json';
import { issuesOf, type Manifest, type Page } from './manifest';
import type { Block } from './page';
import { type Reviewer, ReviewerSchema, reviewWords, withReviewer } from './reviewer';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
/** A text file's hash, its line ends made LF first, so a Windows checkout hashes as a Linux one. */
const textHash = (s: string) => sha256(s.replace(/\r\n/g, '\n'));
const posix = (p: string) => p.replace(/\\/g, '/');

// ------------------------------------------------------------------------------------------------- test names

const TEST_FUNCS = new Set(['describe', 'it', 'test', 'suite']);
const MODIFIERS = new Set([
  'skip',
  'only',
  'concurrent',
  'sequential',
  'todo',
  'fails',
  'skipIf',
  'runIf',
  'each',
  'for',
]);

export interface TestName {
  /** `describe › describe › test`. */
  name: string;
  /** The modifiers on the test and its describes (`skip`, `only`, `todo`, `fails`, `skipIf`…), once each. */
  modifiers: string[];
}
/**
 * Every test's full name in a test file, `describe › describe › test`, read from the source: the calls `describe(`,
 * `suite(`, `it(` and `test(` (with `.skip`, `.only`…) whose first argument is a string or a template without
 * substitution, nested by the parentheses they open. Comments, strings, templates and regular expressions are
 * skipped, so a title quoted in a string is not read as a test. A title built at run time (a variable, `.each`'s `%s`)
 * is read as written.
 */
export function testNames(source: string): TestName[] {
  const s = source;
  const names: TestName[] = [];
  const stack: { title: string; depth: number; mods: string[] }[] = [];
  let depth = 0;
  let i = 0;
  /** The last significant character before `i`, to tell a regular expression from a division. */
  let prev = '';
  const readString = (q: string): { value: string; plain: boolean } => {
    let value = '';
    let plain = true;
    i++;
    while (i < s.length && s[i] !== q) {
      if (s[i] === '\\') {
        const c = s[i + 1] ?? '';
        value += c === 'n' ? '\n' : c === 't' ? '\t' : c;
        i += 2;
        continue;
      }
      if (q === '`' && s[i] === '$' && s[i + 1] === '{') {
        plain = false;
        let braces = 0;
        for (; i < s.length; i++) {
          if (s[i] === '{') braces++;
          else if (s[i] === '}' && --braces === 0) break;
        }
        i++;
        continue;
      }
      value += s[i];
      i++;
    }
    i++;
    return { value, plain };
  };
  const skipSpace = () => {
    for (;;) {
      while (i < s.length && /\s/.test(s[i]!)) i++;
      if (s.startsWith('//', i)) i = s.indexOf('\n', i) < 0 ? s.length : s.indexOf('\n', i);
      else if (s.startsWith('/*', i)) i = s.indexOf('*/', i) < 0 ? s.length : s.indexOf('*/', i) + 2;
      else return;
    }
  };
  while (i < s.length) {
    skipSpace();
    if (i >= s.length) break;
    const c = s[i]!;
    if (c === "'" || c === '"' || c === '`') {
      readString(c);
      prev = 'x';
      continue;
    }
    if (c === '/' && (prev === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev))) {
      // A regular expression: up to its closing slash, outside a character class.
      let inClass = false;
      i++;
      while (i < s.length && s[i] !== '\n') {
        if (s[i] === '\\') i++;
        else if (s[i] === '[') inClass = true;
        else if (s[i] === ']') inClass = false;
        else if (s[i] === '/' && !inClass) break;
        i++;
      }
      i++;
      prev = 'x';
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const start = i;
      while (i < s.length && /[\w$]/.test(s[i]!)) i++;
      const word = s.slice(start, i);
      const before = s.slice(0, start).trimEnd().at(-1);
      if (TEST_FUNCS.has(word) && before !== '.') {
        // Its modifiers, `.skip`, `.only`, `.each(…)`: read past them to the call's parenthesis.
        let j = i;
        let call = -1;
        const mods: string[] = [];
        for (;;) {
          while (/\s/.test(s[j] ?? '')) j++;
          if (s[j] === '.') {
            j++;
            while (/\s/.test(s[j] ?? '')) j++;
            const m = /^[A-Za-z]+/.exec(s.slice(j));
            if (!m || !MODIFIERS.has(m[0])) break;
            mods.push(m[0]);
            j += m[0].length;
            // `.each([…])(title, …)`, `.skipIf(cond)(title, …)`: the modifier's own arguments come first.
            while (/\s/.test(s[j] ?? '')) j++;
            if (['each', 'for', 'skipIf', 'runIf'].includes(m[0]) && s[j] === '(') {
              let n = 0;
              for (; j < s.length; j++) {
                if (s[j] === '(') n++;
                else if (s[j] === ')' && --n === 0) break;
              }
              j++;
            }
            continue;
          }
          if (s[j] === '(') call = j;
          break;
        }
        if (call >= 0) {
          i = call + 1;
          depth++;
          skipSpace();
          const q = s[i];
          if (q === "'" || q === '"' || q === '`') {
            const { value } = readString(q);
            if (word === 'describe' || word === 'suite') stack.push({ title: value, depth, mods });
            else
              names.push({
                name: [...stack.map((d) => d.title), value].join(' › '),
                modifiers: [...new Set([...stack.flatMap((d) => d.mods), ...mods])],
              });
          }
          prev = '(';
          continue;
        }
      }
      prev = 'x';
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      while (stack.length && stack.at(-1)!.depth > depth) stack.pop();
    }
    prev = c;
    i++;
  }
  return names;
}

/** A claim's test, `file › name`, split at its first ` › `. */
function splitTest(test: string): { file: string; name: string } {
  const at = test.indexOf(' › ');
  return { file: test.slice(0, at), name: test.slice(at + 3) };
}

/** The modifiers that make a test not back a claim: not run, run alone, conditionally run, or expected to fail. */
const NOT_PLAIN = new Set(['skip', 'todo', 'only', 'fails', 'skipIf', 'runIf']);

// ------------------------------------------------------------------------------------------------- reports

/** The script whose run makes the candidate's report (package.json's `release-check:ci` runs it). */
const REPORT_SCRIPT = 'test:coverage';

/**
 * Why the run that writes the candidate's report never runs a test file, or undefined: an `--exclude` of
 * `npm run test:coverage` in package.json, or no glob of vite.config.ts's `test.include` matching it.
 */
function excludedFiles(root: string): (file: string) => string | undefined {
  let script = '';
  let include: string[] = [];
  try {
    script =
      (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }).scripts?.[
        REPORT_SCRIPT
      ] ?? '';
  } catch {}
  try {
    const config = readFileSync(join(root, 'vite.config.ts'), 'utf8');
    const test = config.slice(config.search(/\btest:\s*\{/));
    const list = /\binclude:\s*\[([^\]]*)\]/.exec(test)?.[1] ?? '';
    // A template's `${…}` (the game chosen) matches any folder.
    include = [...list.matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1]!.replace(/\$\{[^}]*\}/g, '*'));
  } catch {}
  const excludes = [...script.matchAll(/--exclude[= ](\S+)/g)].map((m) => m[1]!.replace(/^['"]|['"]$/g, ''));
  return (file) => {
    if (!script) return undefined;
    const ex = excludes.find((g) => globToRegExp(g).test(file));
    if (ex) return `\`npm run ${REPORT_SCRIPT}\` (--exclude ${ex}, package.json)`;
    if (include.length && !include.some((g) => globToRegExp(g).test(file)))
      return `vite.config.ts's test.include (${include.join(', ')}), which does not match it`;
    return undefined;
  };
}

const REPORT_COMMIT_FILE = 'commit.json';
const ReportCommitSchema = z
  .object({
    format: z.literal('quest-n-click-test-report'),
    version: z.literal(1),
    commit: z.string().regex(/^[0-9a-f]{40}$/, 'the full SHA the suite ran on'),
    /** The checkout's absolute path the suite ran in: a report's files are made relative to it. */
    root: z.string().min(1),
    run: z.string().regex(/^\d+$/).optional(),
  })
  .strict();

/** One Vitest JSON report: the commit it ran on (its sidecar) and each test's state by file and full name. */
export interface TestReport {
  file: string;
  commit: string;
  run?: string;
  /** Each test, its file relative to the checkout's root (forward slashes). */
  tests: { file: string; name: string; status: string }[];
}

/**
 * A Vitest JSON report (`vitest run --reporter=json --outputFile.json=<file>`) and the `commit.json` beside it,
 * `{format: "quest-n-click-test-report", version: 1, commit, root, run?}`, which the candidate writes from the checkout
 * it tested. A report without its sidecar names no commit, and proves nothing about one: it is refused.
 */
export function readTestReport(file: string): { report?: TestReport; error?: string } {
  const sidecar = join(dirname(file), REPORT_COMMIT_FILE);
  let raw: {
    testResults?: {
      name?: string;
      assertionResults?: { ancestorTitles?: string[]; title?: string; status?: string }[];
    }[];
  };
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { error: `${file}: ${(e as Error).message}` };
  }
  if (!Array.isArray(raw.testResults)) return { error: `${file}: not a Vitest JSON report (no testResults)` };
  if (!existsSync(sidecar))
    return { error: `${file}: no ${REPORT_COMMIT_FILE} beside it, so the report names no commit` };
  let commit: z.infer<typeof ReportCommitSchema>;
  try {
    const parsed = ReportCommitSchema.safeParse(JSON.parse(readFileSync(sidecar, 'utf8')));
    if (!parsed.success) return { error: `${sidecar}: ${issuesOf(parsed.error).join('; ')}` };
    commit = parsed.data;
  } catch (e) {
    return { error: `${sidecar}: ${(e as Error).message}` };
  }
  const tests = raw.testResults.flatMap((r) =>
    (r.assertionResults ?? []).map((a) => ({
      file: posix(relative(commit.root, r.name ?? '')),
      name: [...(a.ancestorTitles ?? []), a.title ?? ''].join(' › '),
      status: a.status ?? 'unknown',
    })),
  );
  return { report: { file, commit: commit.commit, ...(commit.run ? { run: commit.run } : {}), tests } };
}

// ------------------------------------------------------------------------------------------------- reviews

const REVIEWS_FILE = 'reviews.json';
const ReviewsSchema = z
  .object({
    format: z.literal('quest-n-click-docs-reviews'),
    version: z.literal(1),
    claims: z.record(
      z.string(),
      z
        .object({
          claimTextHash: z.string().regex(/^[0-9a-f]{64}$/),
          testFileHash: z.string().regex(/^[0-9a-f]{64}$/),
          reviewers: z.array(ReviewerSchema).min(1),
        })
        .strict(),
    ),
  })
  .strict();
type Reviews = z.infer<typeof ReviewsSchema>;

/** `wiki/reviews.json`, or an empty record when there is none yet. */
export function readReviews(wikiDir: string): { reviews: Reviews; errors: string[] } {
  const empty: Reviews = { format: 'quest-n-click-docs-reviews', version: 1, claims: {} };
  const file = resolve(wikiDir, REVIEWS_FILE);
  if (!existsSync(file)) return { reviews: empty, errors: [] };
  try {
    const parsed = ReviewsSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (!parsed.success) return { reviews: empty, errors: issuesOf(parsed.error).map((l) => `${REVIEWS_FILE} ${l}`) };
    return { reviews: parsed.data, errors: [] };
  } catch (e) {
    return { reviews: empty, errors: [`${REVIEWS_FILE}: ${(e as Error).message}`] };
  }
}

// ------------------------------------------------------------------------------------------------- states

export interface ClaimInput {
  page: Page;
  claim: { id: string; test: string };
  /** The claim's `[!GUARANTEE]` block in each language, when the page is written. */
  blocks: Partial<Record<'en' | 'fr', Block>>;
}

/** The hash a review records of the claim: its test's name and its block's text in both languages. */
const claimTextHash = (c: ClaimInput): string =>
  sha256(
    JSON.stringify({
      test: c.claim.test,
      en: (c.blocks.en?.body ?? []).join('\n').trim(),
      fr: (c.blocks.fr?.body ?? []).join('\n').trim(),
    }),
  );

export interface ClaimState {
  id: string;
  page: string;
  test: string;
  /** Why the claim is not referenced, or undefined when its test exists with that exact name. */
  unreferenced?: string;
  /** The commit a report saw the test pass on, when it is the documented one. */
  executedOn?: string;
  /** Why it is not executed (no report, not found, not passed, another commit). */
  notExecuted?: string;
  /** Why the run that makes the candidate's report never runs its file, when it does not. */
  excluded?: string;
  /** The reviewers of a record that still holds; "scope reviewed" only when a person is among them. */
  reviewed?: Reviewer[];
  /** Why a recorded review no longer holds (the claim's text or the test file changed). */
  reviewStale?: string;
  testFileHash?: string;
  claimTextHash: string;
}

/** The words a page header and the build show: what is known, literally. */
export function claimLabel(s: ClaimState): string {
  const parts = [s.unreferenced ? 'not referenced' : 'referenced'];
  if (s.executedOn) parts.push(`executed on ${s.executedOn.slice(0, 12)}`);
  const words = reviewWords(s.reviewed);
  if (words) parts.push(`scope ${words}`);
  return parts.join(' · ');
}

/**
 * Whether a report's test name is the source's `name`. A title of `.each` or `.for` is written with placeholders
 * (`$name`, `$a.b`, `%s`, `%d`, `%i`, `%f`, `%j`, `%o`, `%#`) that the run fills in: there each placeholder matches any
 * text, so `leases on $name › restore` is run as `leases on sqlite › restore` and `leases on postgres › restore`, and
 * every such variant of the report counts. A name without a placeholder matches only itself.
 */
export function sameTest(name: string): (ran: string) => boolean {
  const placeholder = /\$[A-Za-z_][\w.]*|%[sdifjo#]/g;
  if (!placeholder.test(name)) return (ran) => ran === name;
  const parts = name.split(placeholder).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`^${parts.join('.+?')}$`);
  return (ran) => re.test(ran);
}

/**
 * Each claim's state: referenced when its test file is tracked and names the test; executed when a report of the
 * documented commit says it passed; scope reviewed when a record holds the current hashes of its text and test file.
 */
export function claimStates(o: {
  root: string;
  tracked: ReadonlySet<string>;
  claims: readonly ClaimInput[];
  reports: readonly TestReport[];
  reviews: Reviews;
  /** The documented product commit, a full SHA; a report of another commit executes nothing. */
  commit?: string;
}): ClaimState[] {
  const excluded = excludedFiles(o.root);
  const sources = new Map<string, string | undefined>();
  return o.claims.map((c) => {
    const { file, name } = splitTest(c.claim.test);
    const state: ClaimState = { id: c.claim.id, page: c.page.id, test: c.claim.test, claimTextHash: claimTextHash(c) };
    if (!o.tracked.has(file)) state.unreferenced = `the test file ${file} is not tracked`;
    else {
      if (!sources.has(file)) sources.set(file, readFileSync(join(o.root, file), 'utf8'));
      const text = sources.get(file)!;
      state.testFileHash = textHash(text);
      const found = testNames(text).find((t) => t.name === name);
      const odd = found?.modifiers.filter((m) => NOT_PLAIN.has(m));
      if (!found) state.unreferenced = `${file} holds no test named "${name}"`;
      else if (odd?.length)
        state.unreferenced = `"${name}" is written .${odd.join(', .')}: it does not run as it reads, so it backs no claim`;
    }
    const own = o.reports.filter((r) => r.commit === o.commit);
    const ran = sameTest(name);
    const hits = own.flatMap((r) => r.tests.filter((t) => t.file === file && ran(t.name)));
    const out = excluded(file);
    if (out) state.excluded = `${file} is not in the candidate's report: excluded by ${out}`;
    if (!o.reports.length) state.notExecuted = 'no test report given (--test-report)';
    else if (!o.commit) state.notExecuted = 'no documented commit to compare the reports with';
    else if (!own.length)
      state.notExecuted = `the reports name ${[...new Set(o.reports.map((r) => r.commit.slice(0, 12)))].join(', ')}, not the documented commit ${o.commit.slice(0, 12)}`;
    else if (!hits.length)
      state.notExecuted = state.excluded ?? `no report of ${o.commit.slice(0, 12)} ran "${c.claim.test}"`;
    // Only `passed` counts: `skipped`, `todo` and `pending` ran nothing.
    else if (!hits.every((h) => h.status === 'passed'))
      state.notExecuted = `"${c.claim.test}" did not pass on ${o.commit.slice(0, 12)} (${hits.map((h) => h.status).join(', ')})`;
    else state.executedOn = o.commit;
    const review = o.reviews.claims[c.claim.id];
    if (review) {
      if (review.claimTextHash !== state.claimTextHash) state.reviewStale = "the claim's text changed since its review";
      else if (review.testFileHash !== state.testFileHash) state.reviewStale = 'the test file changed since its review';
      else state.reviewed = review.reviewers;
    }
    return state;
  });
}

/**
 * `wiki -- review-claim <id> --by <name>`: records that a person read the claim and its test, and found the test
 * covers it. Refused for a claim that is not referenced (no test to review). Returns the problem, or undefined.
 */
export function reviewClaim(o: { wikiDir: string; state: ClaimState; reviewer: Reviewer }): string | undefined {
  if (o.state.unreferenced) return `${o.state.id} is not referenced (${o.state.unreferenced}): nothing to review`;
  const { reviews, errors } = readReviews(o.wikiDir);
  if (errors.length) return errors.join('; ');
  // The same claim and test file read again add a reviewer (a person after the AI that wrote it); a change starts over.
  const old = reviews.claims[o.state.id];
  const same = old && old.claimTextHash === o.state.claimTextHash && old.testFileHash === o.state.testFileHash;
  reviews.claims[o.state.id] = {
    claimTextHash: o.state.claimTextHash,
    testFileHash: o.state.testFileHash!,
    reviewers: same ? withReviewer(old.reviewers, o.reviewer) : [o.reviewer],
  };
  reviews.claims = Object.fromEntries(Object.entries(reviews.claims).sort(([a], [b]) => (a < b ? -1 : 1)));
  writeFileSync(resolve(o.wikiDir, REVIEWS_FILE), formatJson(reviews));
  return undefined;
}

/** The claims of the manifest's written pages, each with its blocks; claim ids are unique across the manifest. */
export function claimsOf(
  manifest: Manifest,
  blocksOf: (page: Page, lang: 'en' | 'fr') => readonly Block[] | undefined,
): ClaimInput[] {
  return manifest.pages.flatMap((page) =>
    (page.claims ?? []).map((claim) => ({
      page,
      claim,
      blocks: Object.fromEntries(
        (['en', 'fr'] as const).flatMap((l) => {
          const b = blocksOf(page, l)?.find((x) => x.kind === 'GUARANTEE' && x.id === claim.id);
          return b ? [[l, b]] : [];
        }),
      ),
    })),
  );
}
