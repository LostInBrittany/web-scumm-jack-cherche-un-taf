// `npm run wiki -- check`, the work level (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.1 "States and check levels"):
// the consistency of what exists, on every pull request. The manifest is valid; a `planned` page has no file and a
// `draft` or `ready` page has both; a generated page never has one; every file under `wiki/en/` and `wiki/fr/` is a
// manifest page; a written page says which versions it applies to and which files it rests on, and each source glob
// matches a tracked file; a how-to or a troubleshooting page carries a question per language; links reach known
// pages, existing sections, tracked files and the wiki's images; two `ready` twins keep the same section ids, link
// destinations and structured blocks. A link to a `planned` page is allowed and listed: writing proceeds page by page.
// Only errors fail the command; warnings and gaps (planned pages, missing questions, identifiers no page claims yet)
// are printed. The publication level (`check --publish`) comes in A5 and is stricter.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { globToRegExp } from '../ci-plan';
import { ROOT } from '../game';
import { type ClaimState, claimStates, claimsOf, readReviews, readTestReport, type TestReport } from './claims';
import { CONTRACTS_FILE, checkContracts, readContracts, type SurfaceStatus, surfaceStatuses } from './contracts';
import { dirtySources } from './bundle';
import { compareVersions } from './docs';
import { ENV_PAGE, envPageProblems, envProblems, readEnvRegister, scanEnv } from './env';
import { generatedProblems } from './generators';
import { exampleProblems } from './examples';
import { readGlossary } from './glossary';
import { generatedIdentifiers, type Identifier } from './identifiers';
import {
  DOMAIN_IDS,
  GENERATED_INDEXES,
  LANGS,
  type Lang,
  type Manifest,
  PAGE_TYPES,
  type Page,
  readManifest,
  STATES,
  typesOf,
} from './manifest';
import { type Block, linkDestinations, type ParsedPage, parsePage, SEMVER } from './page';
import { commitOf, previewProblem, sourceSetProblems, versionAt } from './publish';
import { humanReviewed, reviewWords } from './reviewer';
import { type PairState, readTranslations, translationStates } from './translations';

/** A glob past this many files, or a file feeding more pages than this, makes an ordinary change ask too much (§9). */
const GLOB_WARN_FILES = 25;
const FILE_WARN_PAGES = 10;

/** The files git tracks in the repository, the universe a source glob is matched against. */
export function trackedFiles(root = ROOT): string[] {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean);
}

interface PlannedLink {
  from: string;
  lang: Lang;
  to: string;
  anchor?: string;
  line: number;
}
export interface CheckReport {
  errors: string[];
  warnings: string[];
  /** What is still to write, said so a person can pick it up: never a failure at this level. */
  gaps: string[];
  /** Links from a written page to a page still `planned`: allowed, and listed. */
  plannedLinks: PlannedLink[];
  manifest?: Manifest;
  /** Each claim's three states (§4.4.3), as far as this check could establish them. */
  claims: ClaimState[];
  /** The ready pages' translation pairs (§4.7.1). */
  pairs: PairState[];
  /** The five statuses of every surface of the registry, for the product version checked (§4.4.2). */
  statuses: Map<string, SurfaceStatus>;
  /** The written pages, parsed, by `<lang>/<id>`. */
  parsed: Map<string, ParsedPage>;
}

/** The publication level's inputs (§4.1.4, §4.5.2, §4.5.3). */
export interface PublishOptions {
  /** The released product: a tag or a SHA. */
  productRef: string;
  /** The documentation's revision; HEAD when absent. */
  docRef?: string;
  /** Refuse a page or a section whose `appliesFrom` is after the product's version (implied by `published`). */
  released: boolean;
  /** What the publication will be shown as (§4.5.1); `preview` is the bootstrap's exception. */
  state: 'preview' | 'candidate' | 'published';
}

export interface CheckOptions {
  /** The wiki's source folder (`wiki/` of the repository, or a test fixture). */
  wikiDir: string;
  /** The repository's tracked files, relative to its root. */
  tracked: readonly string[];
  /** The identifiers a page should claim (npm scripts, MCP tools); read from the repository when absent. */
  identifiers?: readonly Identifier[];
  /** The repository: its git, its registry (docs/dev/contracts.json), its test files. ROOT when absent. */
  root?: string;
  /** Vitest JSON reports, each with its `commit.json` beside it: what makes a claim "executed". */
  testReports?: readonly string[];
  /** The documented product commit, a claim is executed on; the product ref's at --publish, HEAD otherwise. */
  productCommit?: string;
  /**
   * The candidate run the reports must come from (`commit.json`'s `run`); required to publish a candidate or a
   * release. The local file proves nothing about who made it: A5b's workflow downloads `candidate-test-report` from
   * that attested candidate run itself.
   */
  candidate?: string;
  /** The publication level, stricter; the work level when absent. */
  publish?: PublishOptions;
}

const fileOf = (wikiDir: string, lang: Lang, id: string) => resolve(wikiDir, lang, `${id}.md`);
const isWritten = (p: Page) => !p.generated && p.state !== 'planned';
const needsQuestions = (p: Page) => typesOf(p).some((t) => t === 'howto' || t === 'troubleshooting');
const sameSet = (a: readonly string[], b: readonly string[]) => {
  const [x, y] = [[...new Set(a)].sort(), [...new Set(b)].sort()];
  return x.length === y.length && x.every((v, i) => v === y[i]);
};
const diff = (a: readonly string[], b: readonly string[]) => [...new Set(a.filter((v) => !b.includes(v)))];

/** The files under a folder, as paths relative to it. */
function walk(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, `${prefix}${name}/`));
    else out.push(`${prefix}${name}`);
  }
  return out;
}

export function checkWiki({
  wikiDir,
  tracked,
  identifiers,
  root = ROOT,
  testReports = [],
  productCommit,
  candidate,
  publish,
}: CheckOptions): CheckReport {
  const report: CheckReport = {
    errors: [],
    warnings: [],
    gaps: [],
    plannedLinks: [],
    claims: [],
    pairs: [],
    statuses: new Map(),
    parsed: new Map(),
  };
  const { manifest, errors } = readManifest(wikiDir);
  report.errors.push(...errors);
  const glossary = readGlossary(wikiDir);
  report.errors.push(...glossary.errors);
  checkTemplates(wikiDir, report);
  if (!manifest) return report;
  report.manifest = manifest;
  const byId = new Map(manifest.pages.map((p) => [p.id, p]));
  for (const term of glossary.glossary.terms)
    for (const id of term.pages)
      if (!byId.has(id)) report.errors.push(`data/glossary.json: the term ${term.id} names ${id}, not a manifest page`);

  // Files and the manifest, both ways.
  for (const lang of LANGS)
    for (const rel of walk(resolve(wikiDir, lang))) {
      const id = rel.endsWith('.md') && !rel.includes('/') ? rel.slice(0, -3) : undefined;
      if (!id || !byId.has(id))
        report.errors.push(`${lang}/${rel}: not a page of the manifest (a page is ${lang}/<id>.md, its id listed)`);
    }

  const pagesPerFile = new Map<string, string[]>();
  const missingQuestions: string[] = [];
  for (const p of manifest.pages) {
    const where = `${p.id} (${p.generated ? 'generated' : p.state})`;
    if (p.generated && !(GENERATED_INDEXES as readonly string[]).includes(p.id))
      report.errors.push(`${where}: no generator builds it (${GENERATED_INDEXES.join(', ')})`);
    for (const lang of LANGS) {
      const exists = existsSync(fileOf(wikiDir, lang, p.id));
      if (p.generated) {
        if (exists) report.errors.push(`${where}: generated, yet ${lang}/${p.id}.md exists (its source is the data)`);
      } else if (!isWritten(p) && exists) report.errors.push(`${where}: planned, yet ${lang}/${p.id}.md exists`);
      else if (isWritten(p) && !exists) report.errors.push(`${where}: ${lang}/${p.id}.md is missing (both languages)`);
    }
    // The sources resolve whatever the state: a glob that matches nothing is a typo now, not at writing time.
    const fed = new Set<string>();
    for (const glob of p.sources) {
      const re = globToRegExp(glob);
      const hits = tracked.filter((f) => re.test(f));
      if (!hits.length) report.errors.push(`${p.id}: the source "${glob}" matches no tracked file`);
      else if (hits.length > GLOB_WARN_FILES)
        report.warnings.push(`${p.id}: the source "${glob}" covers ${hits.length} files (> ${GLOB_WARN_FILES})`);
      for (const f of hits) fed.add(f);
    }
    for (const f of fed) pagesPerFile.set(f, [...(pagesPerFile.get(f) ?? []), p.id]);
    const noQuestion = LANGS.filter((l) => !p.questions[l].length);
    if (needsQuestions(p) && noQuestion.length) {
      if (isWritten(p))
        report.errors.push(
          `${where}: a ${typesOf(p).join('/')} page asks at least one question in ${noQuestion.join(' and ')}`,
        );
      else missingQuestions.push(p.id);
    }
    // Versions and sources are required from `draft` on: a planned page may not know them yet (§4.1).
    if (isWritten(p)) {
      if (!p.versions?.appliesFrom) report.errors.push(`${where}: versions.appliesFrom is required once a file exists`);
      if (!p.sources.length) report.errors.push(`${where}: sources is required once a file exists`);
    }
  }
  for (const [file, ids] of pagesPerFile)
    if (ids.length > FILE_WARN_PAGES)
      report.warnings.push(`${file} feeds ${ids.length} pages (> ${FILE_WARN_PAGES}): ${ids.join(', ')}`);

  // The written pages, read once.
  const parsed = new Map<string, ParsedPage>();
  for (const p of manifest.pages.filter(isWritten))
    for (const lang of LANGS) {
      const file = fileOf(wikiDir, lang, p.id);
      if (existsSync(file)) parsed.set(`${lang}/${p.id}`, parsePage(readFileSync(file, 'utf8'), lang));
    }
  report.parsed = parsed;
  const trackedSet = new Set(tracked);
  for (const [key, page] of parsed) {
    const [lang, id] = key.split('/') as [Lang, string];
    const from = byId.get(id)!;
    for (const problem of page.problems) report.errors.push(`${key}.md ${problem}`);
    for (const own of page.ownAnchors)
      if (!page.sections.includes(own.anchor))
        report.errors.push(`${key}.md line ${own.line}: #${own.anchor} is not a section of this page`);
    for (const link of page.links) {
      const target = byId.get(link.id);
      const at = `${key}.md line ${link.line}`;
      if (!target) {
        report.errors.push(`${at}: links to ${link.id}, which the manifest does not hold`);
        continue;
      }
      if (target.generated) {
        if (link.anchor) report.errors.push(`${at}: ${link.id} is generated and has no section ids`);
        continue;
      }
      // At publication, a published page reaches published pages only (§4.1.4).
      if (publish && from.state === 'ready' && target.state !== 'ready')
        report.errors.push(`${at}: links to ${link.id}, ${target.state}: a published page links to ready pages only`);
      if (target.state === 'planned') {
        report.plannedLinks.push({ from: id, lang, to: link.id, anchor: link.anchor, line: link.line });
        continue;
      }
      const targetPage = parsed.get(`${lang}/${link.id}`);
      if (link.anchor && targetPage && !targetPage.sections.includes(link.anchor))
        report.errors.push(`${at}: ${link.id}.md#${link.anchor} is not a section of ${lang}/${link.id}.md`);
    }
    for (const link of page.repoLinks)
      if (!trackedSet.has(link.path) && !tracked.some((f) => f.startsWith(`${link.path}/`)))
        report.errors.push(`${key}.md line ${link.line}: links to ${link.path}, which git does not track`);
    for (const image of page.images)
      if (!existsSync(resolve(wikiDir, 'images', image.path)))
        report.errors.push(`${key}.md line ${image.line}: the image images/${image.path} does not exist`);
  }

  // Ready twins say the same thing (§4.7.1, the parts a machine can compare now; examples and steps come later).
  for (const p of manifest.pages.filter((x) => x.state === 'ready' && !x.generated)) {
    const [en, fr] = [parsed.get(`en/${p.id}`), parsed.get(`fr/${p.id}`)];
    if (!en || !fr) continue;
    const compare = (what: string, a: string[], b: string[]) => {
      if (!sameSet(a, b))
        report.errors.push(
          `${p.id}: the ${what} differ between en and fr (only in en: ${diff(a, b).join(', ') || '-'}; only in fr: ${diff(b, a).join(', ') || '-'})`,
        );
    };
    compare('section ids', en.sections, fr.sections);
    compare('link destinations', linkDestinations(en), linkDestinations(fr));
    compare(
      'structured blocks',
      en.blocks.map((b) => `${b.kind}:${b.id}`),
      fr.blocks.map((b) => `${b.kind}:${b.id}`),
    );
    compare('step ids', en.steps, fr.steps);
    const marks = (x: ParsedPage) =>
      Object.entries(x.sectionVersions).map(
        ([sid, v]) =>
          `${sid}:${v.appliesFrom ?? ''}..${v.appliesUntil ?? ''}/${v.featureSince ?? ''}${v.lifecycle ? `/${v.lifecycle}` : ''}`,
      );
    compare('section versions', marks(en), marks(fr));
    // A measure's figures are the same in both languages: its date, version and source (§4.7.1).
    const figures = (x: ParsedPage) =>
      x.blocks
        .filter((b) => b.kind === 'MEASURE')
        .flatMap((b) => ['date', 'version', 'source'].map((k) => `${b.id}.${k}=${sourceUrl(b.fields[k] ?? '')}`));
    compare('measure figures', figures(en), figures(fr));
  }

  checkVersions(manifest, parsed, report);
  checkBlocks(manifest, parsed, report);
  checkEnv(root, tracked, wikiDir, manifest, report);
  report.errors.push(...generatedProblems({ root, wikiDir, tracked }, manifest));
  for (const [key, page] of parsed) report.errors.push(...exampleProblems(`${key}.md`, page.fences));
  // The product documented: the publication's product ref, otherwise the checkout (and the commit given, if any).
  const product = publish ? publishedProduct(root, candidate, wikiDir, manifest, publish, report) : undefined;
  const version = product?.version ?? checkoutVersion(root);
  checkSurfaces(root, tracked, manifest, report, version);
  checkClaims({
    root,
    wikiDir,
    trackedSet,
    manifest,
    parsed,
    report,
    testReports,
    candidate,
    commit: product?.commit ?? productCommit ?? commitOf(root, 'HEAD'),
    publish: !!publish,
  });
  checkTranslations(wikiDir, manifest, report, !!publish);
  if (publish && product) checkReleased(manifest, parsed, publish, product.version, report);

  const planned = manifest.pages.filter((p) => p.state === 'planned' && !p.generated).length;
  if (planned) report.gaps.push(`${planned} of ${manifest.pages.length} pages are planned (no file yet)`);
  for (const l of report.plannedLinks)
    report.gaps.push(
      `${l.lang}/${l.from}.md line ${l.line} links to ${l.to}${l.anchor ? `#${l.anchor}` : ''}, planned`,
    );
  if (missingQuestions.length)
    report.gaps.push(
      `${missingQuestions.length} planned how-to or troubleshooting pages have no question in both languages yet: ${missingQuestions.join(', ')}`,
    );
  const claimed = new Set(manifest.pages.flatMap((p) => p.identifiers));
  const unclaimed = (identifiers ?? generatedIdentifiers()).filter((i) => !claimed.has(i.id));
  for (const source of ['npm-script', 'mcp-tool'] as const) {
    const ids = unclaimed.filter((i) => i.source === source).map((i) => i.id);
    if (ids.length)
      report.gaps.push(
        `${ids.length} ${source === 'npm-script' ? 'npm scripts' : 'MCP tools'} no page claims in its identifiers yet: ${ids.join(', ')}`,
      );
  }
  return report;
}

/** The templates of `wiki/_templates/` are not pages, but a pair keeps the same section ids and blocks. */
function checkTemplates(wikiDir: string, report: CheckReport): void {
  const dir = resolve(wikiDir, '_templates');
  const names = walk(dir);
  for (const name of names.filter((f) => f.endsWith('.fr.md')))
    if (!names.includes(name.replace(/\.fr\.md$/, '.en.md')))
      report.errors.push(`_templates/${name}: its English twin is missing`);
  for (const en of names.filter((f) => f.endsWith('.en.md'))) {
    const fr = en.replace(/\.en\.md$/, '.fr.md');
    if (!names.includes(fr)) {
      report.errors.push(`_templates/${en}: its French twin ${fr} is missing`);
      continue;
    }
    const a = parsePage(readFileSync(join(dir, en), 'utf8'), 'en');
    const b = parsePage(readFileSync(join(dir, fr), 'utf8'), 'fr');
    for (const [name, t] of [
      [en, a],
      [fr, b],
    ] as const) {
      for (const problem of t.problems) report.errors.push(`_templates/${name} ${problem}`);
      // A template shows a measure as a page must write it.
      for (const m of t.blocks.filter((x) => x.kind === 'MEASURE'))
        for (const problem of measureProblems(m))
          report.errors.push(`_templates/${name} line ${m.line}: [!MEASURE id=${m.id}] ${problem}`);
    }
    if (!sameSet(a.steps, b.steps)) report.errors.push(`_templates/${en} and ${fr}: the step ids differ`);
    if (!sameSet(Object.keys(a.sectionVersions), Object.keys(b.sectionVersions)))
      report.errors.push(`_templates/${en} and ${fr}: the sections with an applies marker differ`);
    if (!sameSet(a.sections, b.sections)) report.errors.push(`_templates/${en} and ${fr}: the section ids differ`);
    if (
      !sameSet(
        a.blocks.map((x) => `${x.kind}:${x.id}`),
        b.blocks.map((x) => `${x.kind}:${x.id}`),
      )
    )
      report.errors.push(`_templates/${en} and ${fr}: the structured blocks differ`);
  }
}

export interface WikiStats {
  total: number;
  byState: Record<string, number>;
  byDomain: Record<string, number>;
  byType: Record<string, number>;
  /** Pages with a file in each language (the planned and generated ones have none). */
  byLanguage: Record<Lang, number>;
}

/** The counts by state, domain, primary type and language: the workload estimate (§4.1, Annex A). */
export function wikiStats(manifest: Manifest, wikiDir: string): WikiStats {
  const count = <K extends string>(keys: readonly K[], of: (p: Page) => K) => {
    const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
    for (const p of manifest.pages) out[of(p)]++;
    return out;
  };
  return {
    total: manifest.pages.length,
    byState: count([...STATES, 'generated'] as const, (p) => (p.generated ? 'generated' : p.state)),
    byDomain: count(DOMAIN_IDS, (p) => p.domain),
    byType: count(PAGE_TYPES, (p) => p.type),
    byLanguage: {
      en: manifest.pages.filter((p) => existsSync(fileOf(wikiDir, 'en', p.id))).length,
      fr: manifest.pages.filter((p) => existsSync(fileOf(wikiDir, 'fr', p.id))).length,
    },
  };
}

// ------------------------------------------------------------------------------------------------- A5: versions

/** The checkout's product version, from its package.json; '0.0.0' when it has none (a fixture). */
function checkoutVersion(root: string): string {
  try {
    const v = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: unknown }).version;
    return typeof v === 'string' && SEMVER.test(v) ? v : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * A section's versions stay inside its page's (§4.4.1): a section may narrow `appliesFrom`..`appliesUntil`, never
 * widen it; its own bounds are in order, and `featureSince` is not after `appliesUntil`.
 */
function checkVersions(manifest: Manifest, parsed: ReadonlyMap<string, ParsedPage>, report: CheckReport): void {
  for (const [key, page] of parsed) {
    const p = manifest.pages.find((x) => x.id === key.split('/')[1])!;
    const pv = p.versions;
    for (const [sid, v] of Object.entries(page.sectionVersions)) {
      const at = `${key}.md line ${v.line} (#${sid})`;
      const from = v.appliesFrom ?? pv?.appliesFrom;
      const until = v.appliesUntil ?? pv?.appliesUntil;
      if (v.appliesFrom && pv?.appliesFrom && compareVersions(v.appliesFrom, pv.appliesFrom) < 0)
        report.errors.push(`${at}: applies from ${v.appliesFrom}, before its page (${pv.appliesFrom})`);
      if (v.appliesUntil && pv?.appliesUntil && compareVersions(v.appliesUntil, pv.appliesUntil) > 0)
        report.errors.push(`${at}: applies until ${v.appliesUntil}, after its page (${pv.appliesUntil})`);
      if (from && until && compareVersions(from, until) > 0)
        report.errors.push(`${at}: applies from ${from} until ${until}, an empty range`);
      if (v.featureSince && until && compareVersions(v.featureSince, until) > 0)
        report.errors.push(`${at}: featureSince ${v.featureSince} is after appliesUntil ${until}`);
    }
  }
}

// ------------------------------------------------------------------------------------------------- A5: blocks

/** A measure's source: the URL of a Markdown link `[label](url)`, or the value as written. */
const sourceUrl = (value: string) => /\]\((\S+?)\)/.exec(value)?.[1] ?? value.trim();
/** A proof's link is pinned: a GitHub file at a full commit (§4.4.3, §4.5.6), never a branch. */
const PINNED = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/blob\/[0-9a-f]{40}\/\S+$/;
const MEASURE_FIELDS = ['date', 'version', 'volume', 'conditions', 'source'] as const;

/** What a `[!MEASURE]` block lacks: each field present, the date a day, the version SemVer, the source pinned. */
function measureProblems(b: Block): string[] {
  const out: string[] = [];
  for (const k of MEASURE_FIELDS) if (!b.fields[k]) out.push(`has no "- ${k}: …" line`);
  const { date, version, source } = b.fields;
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))))
    out.push(`its date "${date}" is not a day (2026-10-19)`);
  if (version && !SEMVER.test(version.replace(/^v/, ''))) out.push(`its version "${version}" is not a product version`);
  if (source && !PINNED.test(sourceUrl(source)))
    out.push(
      `its source "${sourceUrl(source)}" is not pinned: https://github.com/<owner>/<repo>/blob/<40-hex commit>/<path>`,
    );
  return out;
}

/**
 * The structured blocks: a measure carries its five fields; a guarantee is a claim of its page's manifest entry, and a
 * written page's claim has its block in each language; claim ids are unique across the manifest.
 */
function checkBlocks(manifest: Manifest, parsed: ReadonlyMap<string, ParsedPage>, report: CheckReport): void {
  for (const [key, page] of parsed) {
    const p = manifest.pages.find((x) => x.id === key.split('/')[1])!;
    const seen = new Set<string>();
    for (const b of page.blocks) {
      const at = `${key}.md line ${b.line}`;
      if (seen.has(`${b.kind}:${b.id}`)) report.errors.push(`${at}: the ${b.kind} id "${b.id}" is given twice`);
      seen.add(`${b.kind}:${b.id}`);
      if (b.kind === 'MEASURE')
        for (const m of measureProblems(b)) report.errors.push(`${at}: [!MEASURE id=${b.id}] ${m}`);
      if (b.kind === 'GUARANTEE' && !p.claims?.some((c) => c.id === b.id))
        report.errors.push(
          `${at}: [!GUARANTEE id=${b.id}] has no claim in the manifest (${p.id}.claims: {"id": "${b.id}", "test": "file.test.ts › its name"})`,
        );
    }
    for (const c of p.claims ?? [])
      if (!page.blocks.some((b) => b.kind === 'GUARANTEE' && b.id === c.id))
        report.errors.push(`${key}.md: the claim ${c.id} of the manifest has no [!GUARANTEE id=${c.id}] block`);
  }
  const owners = new Map<string, string>();
  for (const p of manifest.pages)
    for (const c of p.claims ?? []) {
      const owner = owners.get(c.id);
      if (owner && owner !== p.id) report.errors.push(`${p.id}: the claim id ${c.id} is already ${owner}'s`);
      owners.set(c.id, p.id);
    }
}

// ------------------------------------------------------------------------------------------------- A7: variables

/**
 * The environment variable register (§4.7.4), when the wiki has one: every variable the code reads is described, every
 * described `code` one is still read, and the reference page's generated part and identifiers are the register's.
 */
function checkEnv(root: string, tracked: readonly string[], wikiDir: string, manifest: Manifest, report: CheckReport) {
  const { register, errors } = readEnvRegister(wikiDir);
  report.errors.push(...errors);
  if (!register) return;
  const scan = scanEnv(root, tracked);
  report.errors.push(...envProblems(register, scan));
  const page = manifest.pages.find((p) => p.id === ENV_PAGE);
  const text = (lang: Lang) => {
    const f = fileOf(wikiDir, lang, ENV_PAGE);
    return page && isWritten(page) && existsSync(f) ? readFileSync(f, 'utf8') : undefined;
  };
  const pages = { en: text('en'), fr: text('fr') };
  report.errors.push(...envPageProblems(register, scan, pages, page && isWritten(page) ? page.identifiers : undefined));
}

// ------------------------------------------------------------------------------------------------- A5: statuses

/** The surfaces a page names exist in the registry, the registry is sound, and each surface's statuses are known. */
function checkSurfaces(
  root: string,
  tracked: readonly string[],
  manifest: Manifest,
  report: CheckReport,
  version: string,
): void {
  // A repository without a registry (a test's) is checked only when one of its pages names a surface.
  if (!existsSync(join(root, CONTRACTS_FILE)) && !manifest.pages.some((p) => p.surfaces?.length)) return;
  const { contracts, errors } = readContracts(root);
  report.errors.push(...errors);
  if (!contracts) return;
  report.errors.push(...checkContracts(root, tracked, contracts));
  report.statuses = surfaceStatuses(root, contracts, version);
  for (const p of manifest.pages)
    for (const s of p.surfaces ?? [])
      if (!(s in contracts.contracts))
        report.errors.push(
          `${p.id}: the surface "${s}" is not in docs/dev/contracts.json (${Object.keys(contracts.contracts).join(', ')})`,
        );
}

// ------------------------------------------------------------------------------------------------- A5: claims

function checkClaims(o: {
  root: string;
  wikiDir: string;
  trackedSet: ReadonlySet<string>;
  manifest: Manifest;
  parsed: ReadonlyMap<string, ParsedPage>;
  report: CheckReport;
  testReports: readonly string[];
  candidate?: string;
  commit?: string;
  publish: boolean;
}): void {
  const reports: TestReport[] = [];
  for (const f of o.testReports) {
    const r = readTestReport(f);
    if (r.error) o.report.errors.push(`--test-report ${r.error}`);
    else if (o.candidate && r.report!.run !== o.candidate)
      o.report.errors.push(
        `--test-report ${f}: its commit.json names the run ${r.report!.run ?? '(none)'}, not the candidate ${o.candidate}`,
      );
    else reports.push(r.report!);
  }
  const { reviews, errors } = readReviews(o.wikiDir);
  o.report.errors.push(...errors);
  const inputs = claimsOf(o.manifest, (p, l) => o.parsed.get(`${l}/${p.id}`)?.blocks);
  o.report.claims = claimStates({
    root: o.root,
    tracked: o.trackedSet,
    claims: inputs,
    reports,
    reviews,
    commit: o.commit,
  });
  const known = new Set(inputs.map((c) => c.claim.id));
  for (const id of Object.keys(reviews.claims))
    if (!known.has(id)) o.report.warnings.push(`reviews.json: ${id} is no claim of the manifest (remove the record)`);
  for (const s of o.report.claims) {
    const page = o.manifest.pages.find((p) => p.id === s.page)!;
    if (s.unreferenced) o.report.errors.push(`${s.page}: the claim ${s.id} is not referenced: ${s.unreferenced}`);
    if (s.excluded) o.report.warnings.push(`${s.page}: the claim ${s.id} cannot be executed: ${s.excluded}`);
    if (s.reviewStale)
      o.report.warnings.push(`${s.page}: the claim ${s.id}'s review no longer holds: ${s.reviewStale}`);
    // A published claim's scope was reviewed by a person (amendment A7, kept by D56): an AI's own check is said, never enough.
    if (!s.unreferenced && page.state === 'ready' && !humanReviewed(s.reviewed))
      (o.publish ? o.report.errors : o.report.gaps).push(
        `${s.page}: the claim ${s.id}'s scope is ${reviewWords(s.reviewed) ?? 'not reviewed'}: a person reads it, then npm run wiki -- review-claim ${s.id} --by <name> --kind human --relation independent`,
      );
    // A published claim was executed on the documented product (§4.1.4); before that, its state is said.
    if (o.publish && page.state === 'ready' && !s.executedOn)
      o.report.errors.push(`${s.page}: the claim ${s.id} is not executed: ${s.notExecuted}`);
    else if (!s.executedOn && page.state !== 'planned')
      o.report.gaps.push(`${s.page}: the claim ${s.id} is referenced, not executed (${s.notExecuted})`);
  }
}

// ------------------------------------------------------------------------------------------------- A5: translations

function checkTranslations(wikiDir: string, manifest: Manifest, report: CheckReport, publish: boolean): void {
  const { translations, errors } = readTranslations(wikiDir);
  report.errors.push(...errors);
  const { pairs, stale } = translationStates(wikiDir, manifest, translations);
  report.pairs = pairs;
  for (const p of pairs.filter((x) => x.state === 'to review'))
    (publish ? report.errors : report.warnings).push(
      `translations: ${p.key} is to review (${p.why}): read both sides, then npm run wiki -- translations --ack ${p.key} --by <name> --kind human|ai --relation author|independent`,
    );
  for (const k of stale) report.warnings.push(`translations.json: ${k} names no section of a written page (remove it)`);
  // A pair recorded by an AI only is said at both levels as what it is, never as a person's reading, and no longer
  // fails a publication: D56 amends A7, whose per-pair reading by a person was the bootstrap's and does not scale. A
  // pair to review still fails one (above); a published claim still needs a person's review (checkClaims).
  const unread = pairs.filter((p) => p.state === 'paired' && !p.human);
  if (unread.length) {
    const independent = unread.filter((p) => p.reviewers?.some((r) => r.relation === 'independent')).length;
    const by =
      independent === unread.length
        ? 'by an independent AI only'
        : independent
          ? `by an AI only (${unread.length - independent} by their author, ${independent} by an independent AI)`
          : 'by their AI author only';
    report.gaps.push(
      `translations: ${unread.length} pair(s) of ready pages ${unread.length === 1 ? 'is' : 'are'} checked ${by}, not read by a person (${unread
        .slice(0, 5)
        .map((p) => p.key)
        .join(
          ', ',
        )}${unread.length > 5 ? '…' : ''}); their pages' headers say so. A person who reads one: npm run wiki -- translations --ack <key> --by <name> --kind human --relation independent`,
    );
  }
}

// ------------------------------------------------------------------------------------------------- A5: publication

/**
 * The product a publication documents, from `--product-ref`, and the source-set rule against `--doc-ref` (§4.5.2);
 * the bootstrap's preview refused after 4.5.0 (§4.5.3); the drafts left out, said.
 */
function publishedProduct(
  root: string,
  candidate: string | undefined,
  wikiDir: string,
  manifest: Manifest,
  o: PublishOptions,
  report: CheckReport,
): { commit: string; version: string } | undefined {
  for (const p of manifest.pages.filter((x) => x.state === 'draft' && !x.generated))
    report.warnings.push(`${p.id} (draft): not published; a ready page may not link to it`);
  if (o.state === 'preview') {
    const refused = previewProblem(root);
    if (refused) report.errors.push(refused);
  } else if (!candidate)
    report.errors.push(
      `--state ${o.state} needs --candidate <run id>: the test reports must come from that candidate run (A5b's workflow downloads its candidate-test-report)`,
    );
  const product = commitOf(root, o.productRef);
  const doc = commitOf(root, o.docRef ?? 'HEAD');
  if (!product) report.errors.push(`--product-ref ${o.productRef}: not a commit of this repository`);
  if (!doc) report.errors.push(`--doc-ref ${o.docRef ?? 'HEAD'}: not a commit of this repository`);
  if (!product || !doc) return undefined;
  // The check reads the checkout: the revision it names is the one checked out, with nothing changed under the wiki.
  const head = commitOf(root, 'HEAD');
  if (doc !== head)
    report.errors.push(
      `--doc-ref ${o.docRef}: ${doc.slice(0, 12)} is not the checkout's HEAD (${head?.slice(0, 12)}): check it out first`,
    );
  const dirty = dirtySources(root, wikiDir);
  if (dirty.length)
    report.errors.push(
      `the checkout's documentation differs from ${doc.slice(0, 12)}: ${dirty.slice(0, 5).join('; ')}`,
    );
  report.errors.push(...sourceSetProblems(root, product, doc));
  const version = versionAt(root, product);
  if (!version || !SEMVER.test(version)) {
    report.errors.push(`--product-ref ${o.productRef}: its package.json gives no product version`);
    return undefined;
  }
  return { commit: product, version };
}

/**
 * `--released` (implied by `--state published`): no published page or section applies only from a version after the
 * product's (§4.5.2). And at any publication, none stopped applying before it (`appliesUntil` below the product's
 * version) unless it is marked deprecated or archived: what is published as current is true for the product.
 */
function checkReleased(
  manifest: Manifest,
  parsed: ReadonlyMap<string, ParsedPage>,
  o: PublishOptions,
  version: string,
  report: CheckReport,
): void {
  const released = o.released || o.state === 'published';
  const old = (until: string | undefined) => !!until && compareVersions(until, version) < 0;
  for (const p of manifest.pages.filter((x) => x.state === 'ready' && !x.generated)) {
    const from = p.versions?.appliesFrom;
    if (released && from && compareVersions(from, version) > 0)
      report.errors.push(`${p.id}: applies from ${from}, after the released product ${version}`);
    if (old(p.versions?.appliesUntil) && !p.lifecycle)
      report.errors.push(
        `${p.id}: applies until ${p.versions!.appliesUntil}, before the product ${version}, and is not marked deprecated or archived (lifecycle)`,
      );
    for (const lang of LANGS)
      for (const [sid, v] of Object.entries(parsed.get(`${lang}/${p.id}`)?.sectionVersions ?? {})) {
        if (released && v.appliesFrom && compareVersions(v.appliesFrom, version) > 0)
          report.errors.push(
            `${lang}/${p.id}.md#${sid}: applies from ${v.appliesFrom}, after the released product ${version}`,
          );
        if (old(v.appliesUntil) && !v.lifecycle && !p.lifecycle)
          report.errors.push(
            `${lang}/${p.id}.md#${sid}: applies until ${v.appliesUntil}, before the product ${version}, and is not marked deprecated or archived`,
          );
      }
  }
}
