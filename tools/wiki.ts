// npm run wiki -- check | stats [--json] | coverage [--init [--force] | --ack <key>] | build --target wiki --out <dir> [--preview]
// [--product-version <v>] [--doc-revision <sha>] [--product-commit <sha>] | bundle --out <dir> [--build-id <id>] [--allow-dirty]
// [the same three] | check --publish --product-ref <tag|sha> [--doc-ref <sha>] [--released] [--state preview|candidate|published]
// [--test-report <vitest.json>]… [--candidate <run id>] | review-claim <id> --by <name> --kind human|ai --relation author|independent | translations --ack <id#section> --by <name> --kind human|ai --relation author|independent
// | archive --out <file.tar.gz> [--revision r<n>] [--preview] [--build-id <id>] [--test-report <f>… --candidate <run>]
// [--allow-dirty] [the same three]
// | publish --target wiki --mode release|revision|rollback|promote|preview --ref <ref> --version <v> --revision r<n>
// --tag <tag> --repo <owner/name> --archive <file> [--sha256 <hex>] [--rollback-to <v>[-r<n>]] [--dry-run] [--remote <url>]
// | pages --out <dir> (--repo <owner/name> [--cache <dir>] | --releases <dir> (--repo <r> | --skip-attestations))
// [--publication <file>] | next-revision --version <v> --repo <owner/name> | attest --repo <r> --tag <tag> --file <f>
// | transition [--root <dir>] [--version <v>]
// | env | generate [<page>…] [--no-manifest] | acceptance [--lang en|fr] [--json] [--strict] [--export-prompts <dir> [--channel mcp|web] [--url <url>]]
// (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §5, phases A2 to A5; ADR 0030).
// The documentation's source is `wiki/` (a manifest, then `wiki/<lang>/<id>.md`); every output is generated from it.
// `check` is the work level of every pull request: it fails on errors only, and prints the warnings and what is still
// to write. `stats` counts the pages by state, domain, type and language: the workload estimate. `build --target
// wiki` writes the folder a publication pushes to the GitHub wiki; it publishes the `ready` pages, and the `draft`
// ones too with `--preview`. `coverage --init` takes the anchor inventory of the old documentation into
// `wiki/coverage.json`; `coverage` merges a new inventory into it, keeping what a person wrote, and regenerates
// `wiki/legacy.json` and the manifest's `replaces` (§4.2); since the switch-over (C2) the matrix is final and
// `coverage` refuses to merge. `bundle` writes the documentation an installed engine
// carries (tools/wiki/bundle.ts, §4.3.4), into the package scripts/pack.mjs prepares: never under a folder the
// repository tracks. `check --publish` is the publication level (§4.1.4): the published pages reach ready pages only,
// no translation is to review, every claim was executed on the product (`--test-report`, a Vitest JSON report with
// the `commit.json` the candidate writes beside it; `--candidate <run>` names the run they must come from, required for
// `--state candidate|published`), and the source set is the product's plus documentation only
// (§4.5.2). `review-claim` records that a person checked a claim's test covers it (`wiki/reviews.json`);
// `translations --ack` that a section's two languages were read against each other (`wiki/translations.json`).
// The publication (A5b, §4.5): `archive` writes the self-contained release archive (tools/wiki/archive.ts); `publish
// --target wiki` pushes an archive's wiki to the GitHub wiki and records it in `publication.json`
// (tools/wiki/publication.ts), by `GITHUB_TOKEN` or the deploy key `WIKI_DEPLOY_KEY`; `pages` assembles Pages' `/docs/`
// from the released archives only (tools/wiki/pages.ts); `transition` writes the transition pages of `docs/en|fr`
// (tools/wiki/transition.ts; written at C2, again by each release pull request). `--wiki=<dir>` reads another source folder (the tests' fixtures). The output
// folder is outside the working tree (or under `.cache/`), so a build never lands among the sources, and only a previous
// build is emptied.
// `env` (A7, §4.7.4) regenerates the environment variable reference from `wiki/data/env.json` and the code
// (tools/wiki/env.ts): its sections in both languages and its manifest identifiers; `check` fails when they drift.
// `generate` (B11) regenerates the reference pages that come from the code (tools/wiki/generators.ts: the npm scripts,
// the CLIs, the error register, the support matrix, the DSL, the public API, the Studio API, the MCP tools), each from
// the code and its data file of `wiki/data/`: the region between `<!-- generated:begin -->` and `<!-- generated:end -->`
// of both language files, and the page's manifest identifiers (`--no-manifest`: the pages only); `check` fails when
// they drift.
// `acceptance` runs the real questions of `wiki/acceptance/questions.json` through search_docs (§4.6, L6 level 1,
// tools/wiki/acceptance.ts): reported, exit 0, unless `--strict` (C1), which fails on a miss, a failed
// counter-example or a pending question; `--export-prompts` writes level 2's prompts instead.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ROOT } from './game';
import { archiveName, buildArchive, readArchive, REVISION } from './wiki/archive';
import {
  acceptanceLines,
  checkQuestions,
  exportPrompts,
  questionsPath,
  readQuestions,
  runAcceptance,
} from './wiki/acceptance';
import { buildWiki } from './wiki/build';
import { dirtySources, writeBundle } from './wiki/bundle';
import { checkWiki, trackedFiles, wikiStats } from './wiki/check';
import { claimLabel, reviewClaim } from './wiki/claims';
import {
  ackRow,
  checkCoverage,
  counterLines,
  coverageCounters,
  coveragePath,
  switchedOver,
  incomingLinks,
  initCoverage,
  inventory,
  mergeCoverage,
  readCoverage,
  unresolvedLinks,
  writeCoverage,
} from './wiki/coverage';
import { repositoryDocs } from './wiki/docs-load';
import { readManifest } from './wiki/manifest';
import {
  ENV_PAGE,
  envIdentifiers,
  envProblems,
  envSections,
  readEnvRegister,
  scanEnv,
  withEnvIdentifiers,
  withEnvSections,
} from './wiki/env';
import { writeGenerated } from './wiki/generators';
import { assemblePages, downloadReleases, ghAttestation, ghRetry, writePages } from './wiki/pages';
import {
  gitEnv,
  keyAuth,
  MODES,
  type Mode,
  nextRevision,
  parsePublication,
  pushWiki,
  refProblem,
  type WikiAuth,
  wikiRemote,
} from './wiki/publication';
import { transitionPages, writeTransitionPages } from './wiki/transition';
import { reviewerOf } from './wiki/reviewer';
import { ackTranslation } from './wiki/translations';

class UsageError extends Error {}

/** `--name value` or `--name=value`; a value missing, empty or starting with `--` is a usage error. */
function option(args: readonly string[], name: string): string | undefined {
  const i = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  const a = args[i]!;
  const value = a.includes('=') ? a.slice(a.indexOf('=') + 1) : args[i + 1];
  if (!value || value.startsWith('--')) throw new UsageError(`--${name} needs a value`);
  return value;
}

/** Every value of a repeatable option (`--test-report a.json --test-report b.json`). */
function options(args: readonly string[], name: string): string[] {
  const out: string[] = [];
  args.forEach((a, i) => {
    if (a === `--${name}` || a.startsWith(`--${name}=`)) out.push(option(args.slice(i), name)!);
  });
  return out;
}

/** Why an output folder is refused: inside the working tree, except under `.cache/`. */
export function outProblem(out: string, root = ROOT): string | undefined {
  // Forward slashes on every system: Windows' relative() answers `.cache\wiki`.
  const rel = relative(root, resolve(out)).split(sep).join('/');
  const inside = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  if (inside && rel !== '.cache' && !rel.startsWith('.cache/'))
    return `${out} is inside the repository's working tree: build outside it, or under .cache/`;
  return undefined;
}

/**
 * Why a bundle's folder is refused: the working tree itself, or a folder in it that holds tracked files (a shipped
 * root, `wiki/`…). A folder git does not track (`.cache/`, the candidate's `pack/`) or one outside the tree is fine.
 */
export function bundleOutProblem(out: string, tracked: readonly string[], root = ROOT): string | undefined {
  const rel = relative(root, resolve(out)).split(sep).join('/');
  if (rel.startsWith('..') || isAbsolute(rel)) return undefined;
  if (rel === '') return `${out} is the repository itself: write the bundle into a package folder`;
  const parts = rel.split('/');
  const under = parts.map((_, i) => `${parts.slice(0, i + 1).join('/')}/`);
  if (tracked.some((f) => under.some((u) => f.startsWith(u))))
    return `${out} is inside a folder the repository tracks: write the bundle into a package folder (.cache/, or outside the tree)`;
  return undefined;
}

const USAGE =
  'usage: npm run wiki -- check [--test-report <file>]… | check --publish --product-ref <tag|sha> [--doc-ref <sha>] [--released] [--state preview|candidate|published] [--test-report <file>]… [--candidate <run id>] | review-claim <id> --by <name> --kind human|ai --relation author|independent | translations --ack <id#section> --by <name> --kind human|ai --relation author|independent | stats [--json] | coverage [--init [--force] | --ack <key>] | build --target wiki --out <dir> [--preview] [--product-version <v>] [--doc-revision <sha>] [--product-commit <sha>] | bundle --out <dir> [--build-id <id>] [--allow-dirty] [--product-version <v>] [--doc-revision <sha>] [--product-commit <sha>] | archive --out <quest-n-click-docs-<v>[-r<n>].tar.gz> [--revision r<n>] [--preview] [--build-id <id>] [--test-report <file>… --candidate <run id>] [--allow-dirty] [--product-version <v>] [--doc-revision <sha>] [--product-commit <sha>] | publish --target wiki --mode release|revision|rollback|promote|preview --ref <ref> --version <v> --revision r<n> --tag <tag> --archive <file> (--repo <owner/name> | --remote <url>) [--sha256 <hex>] [--rollback-to <v>[-r<n>]] [--dry-run] | pages --out <dir> (--repo <owner/name> [--cache <dir>] | --releases <dir> (--repo <owner/name> | --skip-attestations)) [--publication <file>] | next-revision --version <v> --repo <owner/name> | attest --repo <owner/name> --tag <tag> --file <archive> | transition [--root <dir>] [--version <v>] | env | generate [<page>…] [--no-manifest] | acceptance [--lang en|fr] [--json] [--strict] [--export-prompts <dir> [--channel mcp|web] [--url <url>]]';

/** Today, as a day (the date a review or an ack records). */
const today = () => new Date().toISOString().slice(0, 10);

const head = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

export function main(args: readonly string[]): number {
  try {
    return run(args);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`✖  ${e.message}\n${USAGE}`);
    return 2;
  }
}

function run(args: readonly string[]): number {
  const [command] = args;
  const wikiDir = resolve(option(args, 'wiki') ?? resolve(ROOT, 'wiki'));
  if (command === 'check') {
    const tracked = trackedFiles();
    const publish = args.includes('--publish');
    const productRef = option(args, 'product-ref');
    if (publish && !productRef)
      throw new UsageError('check --publish needs --product-ref <tag|sha>, the product documented');
    const state = option(args, 'state') ?? 'published';
    if (!['preview', 'candidate', 'published'].includes(state))
      throw new UsageError('--state is preview, candidate or published');
    const docRef = option(args, 'doc-ref');
    const r = checkWiki({
      wikiDir,
      tracked,
      testReports: options(args, 'test-report').map((f) => resolve(f)),
      ...(option(args, 'candidate') ? { candidate: option(args, 'candidate') } : {}),
      ...(publish
        ? {
            publish: {
              productRef: productRef!,
              ...(docRef ? { docRef } : {}),
              released: args.includes('--released'),
              state: state as 'preview' | 'candidate' | 'published',
            },
          }
        : {}),
    });
    // The coverage matrix is checked against the repository's own `docs/`, for the repository's wiki (or any wiki
    // folder that carries a matrix).
    const counters: string[] = [];
    if (r.manifest && (wikiDir === resolve(ROOT, 'wiki') || existsSync(coveragePath(wikiDir)))) {
      const c = checkCoverage({ wikiDir, root: ROOT, manifest: r.manifest, tracked });
      r.errors.push(...c.errors);
      r.warnings.push(...c.warnings);
      r.gaps.push(...c.gaps);
      if (c.counters) counters.push(...counterLines(c.counters));
    }
    // The real questions (§4.6), when the folder has them: valid, and naming pages and sections that exist.
    if (r.manifest && existsSync(questionsPath(wikiDir))) {
      const q = readQuestions(wikiDir);
      r.errors.push(...q.errors, ...(q.questions ? checkQuestions(wikiDir, r.manifest, q.questions) : []));
    }
    for (const e of r.errors) console.error(`✖  ${e}`);
    for (const w of r.warnings) console.warn(`⚠  ${w}`);
    for (const g of r.gaps) console.log(`·  ${g}`);
    for (const l of counters) console.log(`·  ${l}`);
    for (const c of r.claims) console.log(`·  claim ${c.id} (${c.page}): ${claimLabel(c)}`);
    const n = r.manifest?.pages.length ?? 0;
    const level = publish ? 'publication level' : 'work level';
    if (r.errors.length) {
      console.error(`✖  wiki (${level}): ${r.errors.length} error(s), ${r.warnings.length} warning(s) over ${n} pages`);
      return 1;
    }
    console.log(
      `✔  wiki (${level}): ${n} pages consistent, ${r.warnings.length} warning(s), ${r.plannedLinks.length} link(s) to planned pages`,
    );
    return 0;
  }
  if (command === 'review-claim') {
    const id = args[1];
    const { reviewer, problem: who } = reviewerOf(
      { by: option(args, 'by'), kind: option(args, 'kind'), relation: option(args, 'relation') },
      today(),
    );
    if (!id || id.startsWith('--') || !reviewer)
      throw new UsageError(
        `review-claim needs <id>, --by <name>, --kind human|ai and --relation author|independent${who ? ` (${who})` : ''}`,
      );
    const r = checkWiki({ wikiDir, tracked: trackedFiles() });
    const state = r.claims.find((c) => c.id === id);
    if (!state) {
      console.error(`✖  ${id} is no claim of the manifest (${r.claims.map((c) => c.id).join(', ') || 'none'})`);
      return 1;
    }
    const problem = reviewClaim({ wikiDir, state, reviewer });
    if (problem) {
      console.error(`✖  ${problem}`);
      return 1;
    }
    console.log(
      `✔  ${id}: scope read by ${reviewer.name} (${reviewer.kind}, ${reviewer.relation}; ${state.test}); a change to the claim or its test file resets it`,
    );
    return 0;
  }
  if (command === 'translations') {
    const key = option(args, 'ack');
    const { reviewer, problem: who } = reviewerOf(
      { by: option(args, 'by'), kind: option(args, 'kind'), relation: option(args, 'relation') },
      today(),
    );
    if (!key || !reviewer)
      throw new UsageError(
        `translations needs --ack <id#section>, --by <name>, --kind human|ai and --relation author|independent${who ? ` (${who})` : ''}`,
      );
    const { manifest, errors } = readManifest(wikiDir);
    if (!manifest) {
      for (const e of errors) console.error(`✖  ${e}`);
      return 1;
    }
    const problem = ackTranslation({ wikiDir, manifest, key, reviewer });
    if (problem) {
      console.error(`✖  ${problem}`);
      return 1;
    }
    console.log(
      `✔  ${key}: the two languages recorded as read against each other by ${reviewer.name} (${reviewer.kind}, ${reviewer.relation})`,
    );
    return 0;
  }
  if (command === 'stats') {
    const { manifest, errors } = readManifest(wikiDir);
    if (!manifest) {
      for (const e of errors) console.error(`✖  ${e}`);
      return 1;
    }
    const s = wikiStats(manifest, wikiDir);
    if (args.includes('--json')) {
      const { coverage } = readCoverage(wikiDir);
      console.log(JSON.stringify(coverage ? { ...s, coverage: coverageCounters(coverage) } : s));
    } else {
      const line = (name: string, counts: Record<string, number>) =>
        console.log(
          `${name.padEnd(10)} ${Object.entries(counts)
            .map(([k, v]) => `${k} ${v}`)
            .join(' · ')}`,
        );
      console.log(`pages      ${s.total}`);
      line('state', s.byState);
      line('domain', s.byDomain);
      line('type', s.byType);
      line('files', s.byLanguage);
      const { coverage } = readCoverage(wikiDir);
      if (coverage) for (const l of counterLines(coverageCounters(coverage))) console.log(l);
    }
    return 0;
  }
  if (command === 'coverage') return coverage(args, wikiDir);
  if (command === 'acceptance') return acceptance(args, wikiDir);
  if (command === 'env') return env(wikiDir);
  if (command === 'generate') return generate(args, wikiDir);
  if (command === 'build') {
    const target = option(args, 'target') ?? 'wiki';
    const out = option(args, 'out');
    if (target !== 'wiki' || !out)
      throw new UsageError('build needs --target wiki and --out <dir> (html and bundle come in A4–A5)');
    const refused = outProblem(out);
    if (refused) {
      console.error(`✖  ${refused}`);
      return 1;
    }
    const r = checkWiki({ wikiDir, tracked: trackedFiles() });
    if (!r.manifest || r.errors.length) {
      for (const e of r.errors) console.error(`✖  ${e}`);
      console.error('✖  the sources do not pass `npm run wiki -- check`: nothing built');
      return 1;
    }
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { version: string };
    const docRevision = option(args, 'doc-revision') ?? head();
    let files: string[];
    try {
      files = buildWiki({
        wikiDir,
        outDir: resolve(out),
        manifest: r.manifest,
        preview: args.includes('--preview'),
        productVersion: option(args, 'product-version') ?? pkg.version,
        docRevision,
        productCommit: option(args, 'product-commit') ?? docRevision,
        statuses: r.statuses,
        claims: r.claims,
      });
    } catch (e) {
      console.error(`✖  ${(e as Error).message}`);
      return 1;
    }
    console.log(
      `✔  ${files.length} file(s) written to ${resolve(out)}${args.includes('--preview') ? ' (preview: drafts included)' : ''}`,
    );
    return 0;
  }
  if (command === 'bundle') {
    const out = option(args, 'out');
    if (!out) throw new UsageError('bundle needs --out <dir>');
    const tracked = trackedFiles();
    const refused = bundleOutProblem(out, tracked);
    if (refused) {
      console.error(`✖  ${refused}`);
      return 1;
    }
    const r = checkWiki({ wikiDir, tracked });
    if (!r.manifest || r.errors.length) {
      for (const e of r.errors) console.error(`✖  ${e}`);
      console.error('✖  the sources do not pass `npm run wiki -- check`: no bundle');
      return 1;
    }
    // The bundle names the commit it was built from: sources changed since then are refused, or said (`-dirty`).
    const dirty = dirtySources(ROOT, wikiDir);
    if (dirty.length && !args.includes('--allow-dirty')) {
      console.error(
        `✖  the bundle's sources differ from HEAD (${dirty.slice(0, 5).join('; ')}${dirty.length > 5 ? '…' : ''}): commit them, or pass --allow-dirty for a bundle marked "-dirty"`,
      );
      return 1;
    }
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { version: string };
    const docRevision = option(args, 'doc-revision') ?? head();
    const buildId = option(args, 'build-id');
    let bundle: ReturnType<typeof writeBundle>;
    try {
      bundle = writeBundle({
        root: ROOT,
        wikiDir,
        outDir: resolve(out),
        productVersion: option(args, 'product-version') ?? pkg.version,
        productCommit: option(args, 'product-commit') ?? docRevision,
        docRevision,
        ...(buildId ? { buildId } : {}),
        dirty: dirty.length > 0,
      });
    } catch (e) {
      console.error(`✖  ${(e as Error).message}`);
      return 1;
    }
    const pages = bundle.files.filter((f) => f.path.startsWith('md/')).length;
    const bytes = bundle.files.reduce((n, f) => n + f.bytes, 0);
    console.log(
      `✔  documentation bundle of ${bundle.productVersion} (doc revision ${bundle.docRevision.slice(0, 12)}): ${bundle.files.length} file(s), ${pages} page file(s), ${bytes} bytes → ${resolve(out)}`,
    );
    return 0;
  }
  if (command === 'archive') return archive(args, wikiDir);
  if (command === 'publish') return publish(args);
  if (command === 'pages') return pages(args);
  if (command === 'transition') return transition(args, wikiDir);
  if (command === 'next-revision') return nextRevisionCommand(args);
  if (command === 'attest') {
    // `attest --repo <r> --tag <tag> --file <archive>`: the archive's attestation, by the workflow and ref that must
    // have signed it for that tag (tools/wiki/pages.ts attestationArgs): what Pages checks, docs-publish checks too.
    const repo = option(args, 'repo');
    const tag = option(args, 'tag');
    const file = option(args, 'file');
    if (!repo || !tag || !file) throw new UsageError('attest needs --repo, --tag and --file');
    try {
      ghAttestation(repo)(resolve(file), tag);
    } catch (e) {
      console.error(`✖  ${(e as Error).message}`);
      return 1;
    }
    console.log(`✔  ${tag}: ${basename(file)} is attested by the workflow that must have made it`);
    return 0;
  }
  throw new UsageError(command ? `unknown command "${command}"` : 'a command is needed');
}

/**
 * `archive --out <file>`: the release's documentation archive (§4.5.4), checked at the work level first and built
 * from a clean checkout (or marked `-dirty`). Its name must be the one its identity gives
 * (`quest-n-click-docs-<v>[-r<n>].tar.gz`), so a file never claims another version or revision.
 */
function archive(args: readonly string[], wikiDir: string): number {
  const out = option(args, 'out');
  if (!out) throw new UsageError('archive needs --out <quest-n-click-docs-<v>[-r<n>].tar.gz>');
  const revision = option(args, 'revision') ?? 'r1';
  if (!REVISION.test(revision)) throw new UsageError('--revision is r1, r2…');
  const preview = args.includes('--preview');
  const tracked = trackedFiles();
  // The candidate's test report (§4.4.3), read under the rules of `check --publish`: its commit.json names the product
  // commit and the candidate run, and only then is a guarantee rendered "executed on <sha>". An input, not a clock.
  const testReports = options(args, 'test-report');
  const candidate = option(args, 'candidate');
  if (testReports.length && !candidate)
    throw new UsageError('archive --test-report needs --candidate <run id>, the run the report must come from');
  const docRevisionEarly = option(args, 'doc-revision') ?? head();
  const r = checkWiki({
    wikiDir,
    tracked,
    testReports,
    ...(candidate ? { candidate } : {}),
    productCommit: option(args, 'product-commit') ?? docRevisionEarly,
  });
  if (!r.manifest || r.errors.length) {
    for (const e of r.errors) console.error(`✖  ${e}`);
    console.error('✖  the sources do not pass `npm run wiki -- check`: no archive');
    return 1;
  }
  const dirty = dirtySources(ROOT, wikiDir);
  if (dirty.length && !args.includes('--allow-dirty')) {
    console.error(
      `✖  the archive's sources differ from HEAD (${dirty.slice(0, 5).join('; ')}${dirty.length > 5 ? '…' : ''}): commit them, or pass --allow-dirty for an archive marked "-dirty"`,
    );
    return 1;
  }
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { version: string };
  const productVersion = option(args, 'product-version') ?? pkg.version;
  const want = archiveName(productVersion, revision, preview);
  if (basename(out) !== want) {
    console.error(
      `✖  ${basename(out)}: the archive of ${productVersion} ${preview ? 'preview' : revision} is named ${want}`,
    );
    return 1;
  }
  const docRevision = docRevisionEarly;
  const buildId = option(args, 'build-id');
  let built: ReturnType<typeof buildArchive>;
  try {
    built = buildArchive({
      root: ROOT,
      wikiDir,
      manifest: r.manifest,
      productVersion,
      productCommit: option(args, 'product-commit') ?? docRevision,
      docRevision,
      revision,
      preview,
      dirty: dirty.length > 0,
      ...(buildId ? { buildId } : {}),
      statuses: r.statuses,
      claims: r.claims,
    });
  } catch (e) {
    console.error(`✖  ${(e as Error).message}`);
    return 1;
  }
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), built.bytes);
  const sum = createHash('sha256').update(built.bytes).digest('hex');
  console.log(
    `✔  ${built.name}: ${built.manifest.files.length} files, ${built.bytes.length} bytes, sha256 ${sum} (${productVersion} ${preview ? 'preview' : revision}, doc revision ${built.manifest.docRevision.slice(0, 12)})`,
  );
  return 0;
}

/** The credentials of the wiki's push: the deploy key `WIKI_DEPLOY_KEY` when set, otherwise `GITHUB_TOKEN`. */
function wikiAuth(scratch: string): WikiAuth {
  const key = process.env.WIKI_DEPLOY_KEY;
  if (key?.trim()) return keyAuth(join(scratch, 'ssh'), key);
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) return { kind: 'token', token };
  return { kind: 'none' };
}

/**
 * `publish --target wiki`: an archive's wiki pushed to the GitHub wiki, after the ordering rule of `publication.json`
 * (tools/wiki/publication.ts). The archive is checked first: its sha256 when `--sha256` is given, every file against
 * its manifest, its identity against `--version` and `--revision`.
 */
function publish(args: readonly string[]): number {
  if (option(args, 'target') !== 'wiki')
    throw new UsageError('publish needs --target wiki (Pages is assembled by `pages`)');
  const version = option(args, 'version');
  const revision = option(args, 'revision') ?? 'r1';
  const tag = option(args, 'tag');
  const repo = option(args, 'repo');
  const file = option(args, 'archive');
  if (!version || !tag || !file || (!repo && !option(args, 'remote')))
    throw new UsageError('publish needs --version, --revision, --tag, --archive and --repo <owner/name>');
  const mode = option(args, 'mode') as Mode | undefined;
  const ref = option(args, 'ref');
  if (!mode || !MODES.includes(mode) || !ref)
    throw new UsageError(`publish needs --mode (${MODES.join(', ')}) and --ref, the ref the run stands on`);
  const rollbackTo = option(args, 'rollback-to');
  const preview = mode === 'preview';
  const modeProblem =
    refProblem(mode, ref, version) ??
    (mode === 'rollback' && !rollbackTo
      ? 'a rollback needs --rollback-to <v>[-r<n>]'
      : mode !== 'rollback' && rollbackTo
        ? '--rollback-to is the rollback mode only'
        : mode === 'release' && revision !== 'r1'
          ? 'a release publishes its own revision, r1'
          : mode === 'revision' && revision === 'r1'
            ? 'a doc revision is r2 or later'
            : undefined);
  if (modeProblem) {
    console.error(`✖  ${modeProblem}`);
    return 1;
  }
  const bytes = readFileSync(resolve(file));
  const sum = createHash('sha256').update(bytes).digest('hex');
  const expected = option(args, 'sha256');
  if (expected && expected !== sum) {
    console.error(`✖  ${file}: sha256 ${sum}, not the verified ${expected}`);
    return 1;
  }
  let read: ReturnType<typeof readArchive>;
  try {
    read = readArchive(bytes);
  } catch (e) {
    console.error(`✖  ${file}: ${(e as Error).message}`);
    return 1;
  }
  const m = read.manifest;
  if (
    m.productVersion !== version ||
    (!preview && m.docRevisionNumber !== revision) ||
    Boolean(m.preview) !== preview
  ) {
    console.error(
      `✖  ${file} is ${m.productVersion} ${m.preview ? 'preview' : m.docRevisionNumber}, not ${version} ${preview ? 'preview' : revision}`,
    );
    return 1;
  }
  const wiki = new Map(
    [...read.files].filter(([k]) => k.startsWith('wiki/')).map(([k, v]) => [k.slice('wiki/'.length), v]),
  );
  const scratch = mkdtempSync(join(tmpdir(), 'wiki-publish-'));
  try {
    const auth = wikiAuth(scratch);
    const r = pushWiki({
      remote: option(args, 'remote') ?? wikiRemote(repo!, auth),
      auth,
      workDir: join(scratch, 'wiki'),
      promotion: {
        version,
        revision,
        sha256: sum,
        tag,
        date: new Date().toISOString().slice(0, 10),
        docRevision: m.docRevision,
        ...(m.buildId ? { buildId: m.buildId } : {}),
        ...(preview ? { preview: true } : {}),
      },
      wiki,
      ...(rollbackTo ? { rollbackTo } : {}),
      push: !args.includes('--dry-run'),
    });
    if (!r.ok) {
      console.error(`✖  ${r.problem}`);
      return 1;
    }
    console.log(
      `✔  ${r.note}${r.committed ? (r.pushed ? ': pushed' : ': committed, not pushed (--dry-run)') : ''}${r.wiki ? '' : ' (the wiki pages are unchanged)'}`,
    );
    return 0;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * `pages --out <dir>`: Pages' `/docs/`, from the released archives only (tools/wiki/pages.ts). `--repo` downloads
 * them with `gh` (into `--cache <dir>` when given, which CI restores by the release list), verifies each archive's
 * attestation and reads the record from the wiki's repository. `--releases <dir>` and `--publication <file>` read
 * folders already there; the attestations are then verified against `--repo`, or skipped with
 * `--skip-attestations`, for a look on a disk only (never a deployment: ci.yml always passes `--repo`).
 */
function pages(args: readonly string[]): number {
  const out = option(args, 'out');
  if (!out) throw new UsageError('pages needs --out <dir> and --repo <owner/name> or --releases <dir>');
  const repo = option(args, 'repo');
  const given = option(args, 'releases');
  if (!repo && !given) throw new UsageError('pages needs --repo <owner/name> or --releases <dir>');
  const skip = args.includes('--skip-attestations');
  if (!repo && !skip)
    throw new UsageError(
      'pages verifies each archive against --repo <owner/name> (or --skip-attestations, never to deploy)',
    );
  const scratch = mkdtempSync(join(tmpdir(), 'wiki-pages-'));
  try {
    let publicationText: string | undefined;
    const record = option(args, 'publication');
    if (record) publicationText = readFileSync(resolve(record), 'utf8');
    let releasesDir = given ? resolve(given) : undefined;
    let tags: string[] | undefined;
    if (repo && !releasesDir) {
      releasesDir = resolve(option(args, 'cache') ?? join(scratch, 'releases'));
      tags = downloadReleases(repo, releasesDir);
      console.log(`·  ${tags.length} release(s) with documentation: ${tags.join(', ') || 'none'}`);
      if (!record) {
        // The record lives in the wiki's repository; a wiki not created yet has none (the bootstrap).
        try {
          publicationText = recordOf(repo, scratch);
        } catch (e) {
          // No record can be read: fine while only pre-releases exist; refused otherwise (an alias would lie).
          if (tags.some((t) => !/^v[^-]+-/.test(t))) {
            console.error(
              `✖  the wiki's repository did not answer (${(e as Error).message.split('\n')[0]}): its publication.json is needed`,
            );
            return 1;
          }
        }
      }
    }
    if (skip) console.warn('⚠  --skip-attestations: the archives are not authenticated; never deploy this folder');
    const files = assemblePages({
      releasesDir: releasesDir!,
      ...(tags ? { tags } : {}),
      publication: publicationText ? parsePublication(publicationText) : null,
      verify: skip ? () => {} : ghAttestation(repo!),
    });
    const written = writePages(resolve(out), files);
    console.log(`✔  /docs/: ${written.length} files → ${resolve(out)}`);
    return 0;
  } catch (e) {
    console.error(`✖  ${(e as Error).message}`);
    return 1;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** The wiki repository's `publication.json`, or undefined when it has none; throws when the wiki cannot be read. */
function recordOf(repo: string, scratch: string): string | undefined {
  const clone = join(scratch, 'wiki-record');
  const auth = wikiAuth(scratch);
  execFileSync('git', ['clone', '--depth', '1', '--no-tags', wikiRemote(repo, auth), clone], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
    env: gitEnv(auth),
  });
  const file = join(clone, 'publication.json');
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

/**
 * `next-revision --version <v> --repo <r>`: the doc revision docs-publish publishes from `docs/<v>`, and whether its
 * release already exists unrecorded (a run to complete), as `r<n> new` or `r<n> existing`.
 */
function nextRevisionCommand(args: readonly string[]): number {
  const version = option(args, 'version');
  const repo = option(args, 'repo');
  if (!version || !repo) throw new UsageError('next-revision needs --version <v> and --repo <owner/name>');
  const scratch = mkdtempSync(join(tmpdir(), 'wiki-next-'));
  try {
    const tags = (
      JSON.parse(ghRetry(['release', 'list', '--repo', repo, '--limit', '1000', '--json', 'tagName'])) as {
        tagName: string;
      }[]
    ).map((r) => r.tagName);
    const text = recordOf(repo, scratch);
    const r = nextRevision(version, tags, text ? parsePublication(text) : null);
    console.log(`${r.revision} ${r.existing ? 'existing' : 'new'}`);
    return 0;
  } catch (e) {
    console.error(`✖  ${(e as Error).message}`);
    return 1;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** `transition`: the transition pages of `docs/en|fr` (§4.5.7), for package.json's version unless `--version` says. */
function transition(args: readonly string[], wikiDir: string): number {
  const root = resolve(option(args, 'root') ?? ROOT);
  const { manifest, errors } = readManifest(wikiDir);
  const read = readCoverage(wikiDir);
  if (!manifest || !read.coverage) {
    for (const e of [...errors, ...read.errors]) console.error(`✖  ${e}`);
    return 1;
  }
  const version =
    option(args, 'version') ??
    (JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }).version;
  const written = writeTransitionPages(root, transitionPages(read.coverage, manifest, version));
  console.log(`✔  ${written.length} transition page(s) for ${version}: ${written.join(', ')}`);
  return 0;
}

/**
 * `env`: the environment variable reference regenerated (§4.7.4): the generated part of both language files of
 * `reference.environment-variables`, and its manifest identifiers. Refused while the register and the code disagree.
 */
function env(wikiDir: string): number {
  const { register, errors } = readEnvRegister(wikiDir);
  if (!register) {
    for (const e of errors.length ? errors : ['data/env.json: no register in this wiki']) console.error(`✖  ${e}`);
    return 1;
  }
  const scan = scanEnv(ROOT, trackedFiles());
  const problems = envProblems(register, scan);
  if (problems.length) {
    for (const p of problems) console.error(`✖  ${p}`);
    return 1;
  }
  const written: string[] = [];
  for (const lang of ['en', 'fr'] as const) {
    const file = resolve(wikiDir, lang, `${ENV_PAGE}.md`);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const r = withEnvSections(text, envSections(register, scan, lang));
    if (r.problem) {
      console.error(`✖  ${lang}/${ENV_PAGE}.md: ${r.problem}`);
      return 1;
    }
    if (r.text !== text) writeFileSync(file, r.text!);
    written.push(`${lang}/${ENV_PAGE}.md`);
  }
  const manifestFile = resolve(wikiDir, 'manifest.json');
  const before = readFileSync(manifestFile, 'utf8');
  const after = withEnvIdentifiers(before, envIdentifiers(register));
  if (after !== before) writeFileSync(manifestFile, after);
  console.log(
    `✔  ${register.variables.length} variable(s), ${register.dynamic.length} dynamic read(s) resolved: ${written.join(', ') || 'no page file yet'}; manifest identifiers ${after === before ? 'unchanged' : 'set'}`,
  );
  return 0;
}

/**
 * `generate [<page>…]`: the generated reference pages (B11) written again from the code and their data, every one or
 * those named. Refused for a page whose data and code disagree: the problems are printed, that page is left as it is.
 */
function generate(args: readonly string[], wikiDir: string): number {
  const only = args.slice(1).filter((a, i, xs) => !a.startsWith('--') && xs[i - 1] !== '--wiki');
  const { written, problems } = writeGenerated({ root: ROOT, wikiDir, tracked: trackedFiles() }, only, {
    manifest: !args.includes('--no-manifest'),
  });
  for (const p of problems) console.error(`✖  ${p}`);
  console.log(
    `${problems.length ? '✖' : '✔'}  ${written.length} page file(s) generated: ${written.join(', ') || 'none'}`,
  );
  return problems.length ? 1 : 0;
}

/**
 * `acceptance`: level 1 of §4.6 over the documentation the loader reads in the repository (`wiki/`, draft and ready
 * pages), reported and exit 0; `--strict` exits 1 on a miss, a failed counter-example or a pending question (C1:
 * every page is written by then). `--export-prompts <dir>` writes level 2's prompts (outside the working tree, or
 * under .cache/) and runs nothing.
 */
function acceptance(args: readonly string[], wikiDir: string): number {
  const lang = option(args, 'lang');
  if (lang !== undefined && lang !== 'en' && lang !== 'fr') throw new UsageError('--lang is en or fr');
  const langs: readonly ('en' | 'fr')[] = lang === 'en' || lang === 'fr' ? [lang] : ['en', 'fr'];
  const { manifest, errors } = readManifest(wikiDir);
  const q = readQuestions(wikiDir);
  const problems = [
    ...errors,
    ...q.errors,
    ...(manifest && q.questions ? checkQuestions(wikiDir, manifest, q.questions) : []),
  ];
  if (problems.length || !q.questions) {
    for (const e of problems) console.error(`✖  ${e}`);
    return 1;
  }
  const out = option(args, 'export-prompts');
  if (out && args.includes('--strict'))
    throw new UsageError('--export-prompts writes prompts and runs nothing: --strict does not go with it');
  if (out) {
    const refused = outProblem(out);
    if (refused) {
      console.error(`✖  ${refused}`);
      return 1;
    }
    const channel = option(args, 'channel') ?? 'mcp';
    if (channel !== 'mcp' && channel !== 'web') throw new UsageError('--channel is mcp or web');
    const url = option(args, 'url');
    const files = exportPrompts(q.questions, resolve(out), { langs, channel, ...(url ? { url } : {}) });
    console.log(
      `✔  ${files.length - 2} prompt(s) and prompts.json written to ${resolve(out, 'prompts')} (the answering agent's only input, no answer inside); the numbers' key to ${resolve(out, 'grading', 'key.json')} (the grader's only)`,
    );
    return 0;
  }
  const report = runAcceptance(repositoryDocs(ROOT, { wikiDir }), q.questions, langs);
  if (args.includes('--json')) console.log(JSON.stringify(report));
  else for (const l of acceptanceLines(report)) console.log(l);
  const bad = report.outcomes.filter((o) => o.status !== 'hit' && o.status !== 'pass');
  if (args.includes('--strict') && bad.length) {
    console.error(`✖  acceptance (strict): ${bad.length} run(s) missed, failed or pending`);
    return 1;
  }
  return 0;
}

/**
 * `coverage --init` makes the matrix from the inventory (refusing to replace one without `--force`); `coverage` merges
 * a new inventory into it, and `--ack <key>` then clears that row's flag once a person rechecked it (a removed row is
 * deleted). Both write `legacy.json` and the manifest's `replaces`, then print the inventory's counts,
 * the incoming anchored links that resolve to nothing, and the two counters. `--root=<dir>` inventories another
 * repository (the tests' fixtures).
 */
function coverage(args: readonly string[], wikiDir: string): number {
  const root = resolve(option(args, 'root') ?? ROOT);
  const { manifest, errors } = readManifest(wikiDir);
  if (!manifest) {
    for (const e of errors) console.error(`✖  ${e}`);
    return 1;
  }
  if (switchedOver(root)) {
    console.error(
      '✖  the matrix is final since the switch-over (4.5.0, C2): docs/en and docs/fr are transition pages, written by `npm run wiki -- transition`',
    );
    return 1;
  }
  const files = inventory(root);
  const init = args.includes('--init');
  let matrix: ReturnType<typeof initCoverage>;
  if (init) {
    if (existsSync(coveragePath(wikiDir)) && !args.includes('--force')) {
      console.error(
        `✖  ${coveragePath(wikiDir)} exists: \`coverage\` merges into it; --init --force replaces it, losing every decision`,
      );
      return 1;
    }
    matrix = initCoverage(files);
  } else {
    const read = readCoverage(wikiDir);
    if (!read.coverage) {
      for (const e of read.errors) console.error(`✖  ${e}`);
      return 1;
    }
    const merged = mergeCoverage(read.coverage, files);
    matrix = merged.coverage;
    for (const c of merged.carried) console.log(`·  carried: ${c.from} → ${c.to} (same body)`);
    for (const [what, keys] of [
      ['new', merged.added],
      ['changed', merged.changed],
      ['gone', merged.removed],
    ] as const)
      for (const k of keys) console.log(`·  ${what}: ${k} (flagged: recheck it, then --ack it)`);
    const ack = option(args, 'ack');
    if (ack) {
      const problem = ackRow(matrix, ack);
      if (problem) {
        console.error(`✖  --ack: ${problem}`);
        return 1;
      }
      console.log(`·  acknowledged: ${ack}`);
    }
  }
  try {
    writeCoverage(wikiDir, matrix, manifest);
  } catch (e) {
    console.error(`✖  ${(e as Error).message}`);
    return 1;
  }
  const sections = files.flatMap((f) => f.sections);
  const links = incomingLinks(root, root === ROOT ? trackedFiles() : [], new Set(files.map((f) => f.file)));
  const unresolved = unresolvedLinks(files, links);
  for (const l of unresolved)
    console.warn(`⚠  ${l.from} line ${l.line}: links to ${l.target}#${l.anchor}, an anchor the page does not have`);
  console.log(
    `✔  ${files.length} pages: ${sections.length} sections, ${files.reduce((n, f) => n + f.anchors.length, 0)} anchors, ${sections.reduce((n, s) => n + s.codeBlocks.length, 0)} code blocks, ${sections.reduce((n, s) => n + s.limits.length, 0)} limit candidates; ${links.length} incoming anchored links, ${unresolved.length} unresolved`,
  );
  for (const l of counterLines(coverageCounters(matrix))) console.log(l);
  return 0;
}

if (process.argv[1]?.endsWith('wiki.ts')) process.exit(main(process.argv.slice(2)));
