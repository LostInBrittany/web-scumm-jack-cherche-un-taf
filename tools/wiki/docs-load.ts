// Where the documentation the tools read comes from (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.3.4, "Resolution at
// run time"; ADR 0030). An installed package carries a bundle, `<package>/docs-bundle/` (written by `wiki -- bundle`
// when scripts/pack.mjs packs the engine): the `ready` pages, the index, and `legacy/<NAME>.md`, the eight historical
// pages `read_doc {name}` serves. The engine's repository has no bundle: the same loader reads `wiki/` directly, the
// `draft` and `ready` pages, and says it is a repository preview. Since the switch-over (C2), `read_doc {name}` serves
// the concatenation `wiki/legacy.json` orders (`legacyConcatenation`, tools/wiki/docs.ts) in both: built from `wiki/`
// in the repository, written into the bundle as `legacy/<NAME>.md` by `wiki -- bundle`. Nothing reads `docs/en` any more.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  BUNDLE_FORMAT,
  type DocsIndex,
  type DocsLang,
  type DocsSet,
  formatProblem,
  INDEX_FORMAT,
  type IndexPage,
  legacyBudget,
  legacyConcatenation,
  type Provenance,
  splitSections,
} from './docs';
import { readGlossary } from './glossary';
import { LANGS, type Page, readManifest } from './manifest';

/** The bundle's folder in an installed package, beside its package.json. */
export const BUNDLE_DIR = 'docs-bundle';

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/** What `bundle-manifest.json` holds (format v1): the bundle's identity and the hash of each of its files. */
export interface BundleManifest {
  format: typeof BUNDLE_FORMAT;
  version: 1;
  productVersion: string;
  productCommit: string;
  docRevision: string;
  buildId?: string;
  /**
   * The doc revision's number of a release archive (`r1` for the release's own, `r2`… for a fix published as
   * `docs-v<v>-r<n>`, §4.5.4); the package's bundle has none.
   */
  docRevisionNumber?: string;
  /** A preview archive (§4.5.3): its HTML and wiki hold the draft pages too, under a banner. */
  preview?: true;
  /** The git tree of `wiki/` at the doc revision, when git knows it. */
  wikiTree: string | null;
  files: { path: string; sha256: string; bytes: number }[];
}

/**
 * The index of a wiki folder's written pages in the given states (a page `planned` or `generated` has no text and
 * is never in it) and their Markdown by `<lang>/<id>`. `transform` rewrites a page's text first (the bundle's links);
 * the index's hashes are those of the text it returns. Throws with the manifest's problems when it is not valid.
 */
export function indexWiki(
  wikiDir: string,
  states: readonly ('draft' | 'ready')[],
  transform: (markdown: string, lang: DocsLang, page: Page) => string = (m) => m,
): { index: DocsIndex; pages: Record<string, string> } {
  const { manifest, errors } = readManifest(wikiDir);
  if (!manifest) throw new Error(`the wiki's manifest is not valid: ${errors.join('; ')}`);
  const { glossary } = readGlossary(wikiDir);
  const legacyFile = resolve(wikiDir, 'legacy.json');
  const legacy = existsSync(legacyFile)
    ? ((JSON.parse(readFileSync(legacyFile, 'utf8')) as { pages?: Record<string, string[]> }).pages ?? {})
    : {};
  const pages: Record<string, string> = {};
  const entries: IndexPage[] = [];
  for (const p of manifest.pages) {
    if (p.generated || p.state === 'planned' || !states.includes(p.state)) continue;
    const langs: IndexPage['langs'] = {};
    for (const lang of LANGS) {
      const file = resolve(wikiDir, lang, `${p.id}.md`);
      if (!existsSync(file)) continue;
      const text = transform(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), lang, p);
      pages[`${lang}/${p.id}`] = text;
      langs[lang] = {
        file: `md/${lang}/${p.id}.md`,
        sha256: sha256(text),
        sections: splitSections(text).map((s) => ({
          id: s.id,
          title: s.title,
          sha256: sha256(s.text),
          ...(s.versions ? { versions: s.versions } : {}),
        })),
      };
    }
    entries.push({
      id: p.id,
      domain: p.domain,
      type: p.type,
      ...(p.alsoTypes ? { alsoTypes: p.alsoTypes } : {}),
      audience: p.audience,
      context: p.context,
      ...(p.versions ? { versions: p.versions } : {}),
      state: p.state,
      ...(p.lifecycle ? { lifecycle: p.lifecycle } : {}),
      title: p.title,
      url: p.url,
      questions: p.questions,
      aliases: p.aliases,
      keywords: p.keywords ?? { en: [], fr: [] },
      identifiers: p.identifiers,
      langs,
    });
  }
  return {
    index: {
      format: INDEX_FORMAT,
      version: 1,
      pages: entries,
      glossary: glossary.terms.map((t) => ({
        id: t.id,
        en: { term: t.en.term, synonyms: t.en.synonyms },
        fr: { term: t.fr.term, synonyms: t.fr.synonyms },
        pages: t.pages,
      })),
      legacy,
    },
    pages,
  };
}

/**
 * `git rev-parse HEAD` of a checkout, read again at each load (a few milliseconds), so a server that runs for days never
 * names a commit the checkout has left; 'unknown' outside git.
 */
function gitHead(root: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

const productVersion = (root: string) =>
  String((JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: unknown }).version);

/**
 * The repository's documentation, read from `wiki/` as it is in the checkout: the `draft` and `ready` pages (`states`
 * narrows it: the demo snapshot embeds the `ready` ones only). A preview, never a publication.
 */
export function repositoryDocs(
  root: string,
  o: { wikiDir?: string; states?: readonly ('draft' | 'ready')[]; label?: string } = {},
): DocsSet {
  const head = gitHead(root);
  const { index, pages } = indexWiki(o.wikiDir ?? join(root, 'wiki'), o.states ?? ['draft', 'ready']);
  return {
    provenance: {
      source: 'repository',
      productVersion: productVersion(root),
      productCommit: head,
      docRevision: head,
      label:
        o.label ??
        'repository preview: the draft and ready pages of wiki/ in this checkout, not a published documentation',
    },
    index,
    pages,
  };
}

/**
 * Where a reader checks whether a bundle's build was promoted to a release (§4.5.1): never inside the bundle. The
 * record lives in the wiki's repository (docs-publish writes it there); GitHub Pages, which copied it to
 * `/docs/publication.json`, is abandoned (D52).
 */
export const PUBLICATION_URL = 'https://raw.githubusercontent.com/wiki/Quest-n-Click/quest-n-click/publication.json';

/** A JSON text of the bundle, its format and version checked: an unknown major version is refused, plainly. */
function parseVersioned<T>(text: string, format: string, label: string): T {
  const raw = JSON.parse(text) as unknown;
  const problem = formatProblem(raw, format, label);
  if (problem) throw new Error(problem);
  return raw as T;
}

/**
 * The only paths a bundle holds: its index, a page, a legacy page, an image (no `..`, no absolute path); a release
 * archive also holds its rendered site and its wiki (`html/`, `wiki/`, §4.5.4), which the tools never read.
 */
const BUNDLE_PATH =
  /^(index\.json|md\/(en|fr)\/[a-z]+\.[a-z0-9]+(-[a-z0-9]+)*\.md|legacy\/[A-Z_]+\.md|(assets|html|wiki)\/(?!.*(^|\/)\.\.?(\/|$))[A-Za-z0-9_./-]+)$/;
/** The files of a bundle the tools do not read as text: images, and an archive's site and wiki. */
const NOT_TEXT = /^(assets|html|wiki)\//;

interface Bundle {
  set: DocsSet;
  /** Every text file of the bundle, by its path, as checked against its sha256. */
  texts: Map<string, string>;
}
const bundles = new Map<string, Bundle>();

/**
 * A bundle folder, read once per process (a bundle never changes) and checked first: its manifest's format, each file
 * it lists at an allowed path and matching its sha256, the index's page files exactly `md/<lang>/<id>.md` and listed.
 * Any mismatch is an error that names the file: a bundle that does not match its manifest is never half read.
 */
function readBundle(dir: string): Bundle {
  const cached = bundles.get(dir);
  if (cached) return cached;
  const label = (path: string) => `${BUNDLE_DIR}/${path}`;
  const m = parseVersioned<BundleManifest>(
    readFileSync(join(dir, 'bundle-manifest.json'), 'utf8'),
    BUNDLE_FORMAT,
    label('bundle-manifest.json'),
  );
  const texts = new Map<string, string>();
  for (const f of m.files) {
    if (!BUNDLE_PATH.test(f.path)) throw new Error(`${label(f.path)}: not a path a documentation bundle holds`);
    const bytes = readFileSync(join(dir, f.path));
    if (sha256(bytes) !== f.sha256)
      throw new Error(`${label(f.path)} does not match its sha256 in bundle-manifest.json: the bundle was changed`);
    if (!NOT_TEXT.test(f.path)) texts.set(f.path, bytes.toString('utf8'));
  }
  const indexText = texts.get('index.json');
  if (indexText === undefined) throw new Error(`${label('index.json')} is not in bundle-manifest.json`);
  const index = parseVersioned<DocsIndex>(indexText, INDEX_FORMAT, label('index.json'));
  const pages: Record<string, string> = {};
  for (const p of index.pages)
    for (const lang of LANGS) {
      const f = p.langs[lang]?.file;
      if (f === undefined) continue;
      if (f !== `md/${lang}/${p.id}.md`)
        throw new Error(`${label('index.json')}: ${p.id} (${lang}) names the file "${f}"`);
      const text = texts.get(f);
      if (text === undefined) throw new Error(`${label(f)} is not in bundle-manifest.json`);
      pages[`${lang}/${p.id}`] = text;
    }
  const provenance: Provenance = {
    source: 'bundle',
    productVersion: m.productVersion,
    productCommit: m.productCommit,
    docRevision: m.docRevision,
    ...(m.buildId ? { buildId: m.buildId } : {}),
    ...(m.docRevisionNumber ? { docRevisionNumber: m.docRevisionNumber } : {}),
    label: `bundle built for quest'n'click ${m.productVersion}${m.buildId ? `, build ${m.buildId}` : ''}; whether it was promoted to a release is checked at ${PUBLICATION_URL}, never in the bundle`,
  };
  const bundle = { set: { provenance, index, pages }, texts };
  bundles.set(dir, bundle);
  return bundle;
}

/** A bundle folder's documentation: its identity from `bundle-manifest.json`, its index and its pages, checked. */
export const bundleDocs = (dir: string): DocsSet => readBundle(dir).set;

/** The bundle of an installed engine, or undefined in the repository (no `docs-bundle/` beside package.json). */
const bundleOf = (root: string): string | undefined => {
  const dir = join(root, BUNDLE_DIR);
  return existsSync(join(dir, 'bundle-manifest.json')) ? dir : undefined;
};

/** The documentation the new tools read: the package's bundle when there is one, otherwise the repository's `wiki/`. */
export function resolveDocs(root: string): DocsSet {
  const bundle = bundleOf(root);
  return bundle ? bundleDocs(bundle) : repositoryDocs(root);
}

/**
 * One of the eight historical pages of a set (§4.3.2): the concatenation of its English pages in `wiki/legacy.json`'s
 * order, within its bound. The repository's `read_doc {name}`, and the demo snapshot's content guide.
 */
export const legacyOfSet = (set: DocsSet, name: string): string =>
  legacyConcatenation(set.index.legacy[name] ?? [], (id) => set.pages[`en/${id}`], legacyBudget(name));

/**
 * One of the eight historical pages, `read_doc {name}`: the bundle's `legacy/<NAME>.md` in a package, the
 * concatenation built from `wiki/` in the repository (its `draft` and `ready` pages, like the other tools there).
 */
export function legacyDoc(root: string, name: string): string {
  const bundle = bundleOf(root);
  if (!bundle) return legacyOfSet(repositoryDocs(root), name);
  const text = readBundle(bundle).texts.get(`legacy/${name}.md`);
  if (text === undefined) throw new Error(`${BUNDLE_DIR}/legacy/${name}.md is not in bundle-manifest.json`);
  return text;
}
