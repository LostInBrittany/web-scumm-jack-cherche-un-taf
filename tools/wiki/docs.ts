// The documentation as the tools read it (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.3, L3; ADR 0030): one in-memory
// set, whatever it was loaded from, and the three readings MCP and the Studio's Assistant make of it: `search_docs`,
// `list_docs` and `read_doc` by id. A set is an index (the format `quest-n-click-docs-index` v1 a bundle carries as
// `index.json`), the pages' Markdown by `<lang>/<id>`, and its provenance: what it was built from (product version and
// commit, doc revision, build), never whether it was published, which is recorded outside it (§4.5.1). It is loaded by
// tools/wiki/docs-load.ts from a package's `docs-bundle/` or from the repository's `wiki/` (a preview), and embedded
// as is in the demo Studio's snapshot. No node import here: the Studio page bundles it with tools/studio/tools.ts.
//
// The search is deterministic: the same set and the same request give the same results, in the same order, with the
// same scores. A word matches when it is the same once accents, case and a plural `s` are set aside; the glossary's
// French and English words and synonyms widen a query (« verrou » also looks for "lease"). Weights: a page's title or
// one of its questions, then its aliases, keywords and identifiers, then a section's heading, then a section's body.
// Under a confidence threshold the answer is an explicit empty result, never weak results dressed as relevant.
// With a `context` filter, a section headed by that context's name answers for a page that spans several, and a status
// code typed is a symptom of that context's service: a reference register ranks below its troubleshooting pages.
import { appliesMarker, mapLines, type SectionVersions } from './page';
import { siteDocs } from './site';

export const INDEX_FORMAT = 'quest-n-click-docs-index';
export const BUNDLE_FORMAT = 'quest-n-click-docs-bundle';
export type DocsLang = 'en' | 'fr';
const LANGS: readonly DocsLang[] = ['en', 'fr'];
type Bilingual<T> = Record<DocsLang, T>;

interface IndexSection {
  /** The section's `<a name>` id; '' for what comes before the first one (the page's title and its lead). */
  id: string;
  title: string;
  sha256: string;
  /** The section's own versions, from its applies marker (§4.4.1); absent when it follows its page's. */
  versions?: SectionVersions;
}
export interface IndexPage {
  id: string;
  domain: string;
  type: string;
  alsoTypes?: string[];
  audience: string[];
  context: string[];
  versions?: { appliesFrom: string; appliesUntil?: string; featureSince?: string };
  /** Never `planned`: a page without a file is not in an index. A bundle holds `ready` pages only. */
  state: 'draft' | 'ready';
  /** A page kept for older versions: never `current` in a search (§9). */
  lifecycle?: 'deprecated' | 'archived';
  title: Bilingual<string>;
  url: Bilingual<string>;
  questions: Bilingual<string[]>;
  aliases: Bilingual<string[]>;
  keywords: Bilingual<string[]>;
  identifiers: string[];
  /** Each written language: its file in the set, the file's hash, its sections. */
  langs: Partial<Record<DocsLang, { file: string; sha256: string; sections: IndexSection[] }>>;
}
interface GlossarySide {
  term: string;
  synonyms: string[];
}
export interface DocsIndex {
  format: typeof INDEX_FORMAT;
  version: 1;
  pages: IndexPage[];
  /** The bilingual glossary's words (wiki/data/glossary.json), which widen a search. */
  glossary: { id: string; en: GlossarySide; fr: GlossarySide; pages: string[] }[];
  /** wiki/legacy.json: for each of the eight `read_doc` names, the ordered `id#section` that rebuild it (§4.2). */
  legacy: Record<string, string[]>;
}

/** What a set of pages is: its identity only (§4.5.1). Whether it was promoted to a release is not in it. */
export interface Provenance {
  source: 'bundle' | 'repository';
  productVersion: string;
  productCommit: string;
  docRevision: string;
  buildId?: string;
  /** A release archive's doc revision (`r2`…); a package's bundle is its release's own documentation, r1. */
  docRevisionNumber?: string;
  /** The same in words, for a reader: "repository preview", or the bundle's build and where promotion is recorded. */
  label: string;
}

/** Where a version's documentation is kept (D52): its release's archive, `quest-n-click-docs-<v>.tar.gz`. */
const RELEASES_URL = 'https://github.com/Quest-n-Click/quest-n-click/releases';

/**
 * Where a page read from a bundle lives online (§4.5.4, D52). There is no versioned page online any more: `versioned`
 * is always null, and `versionedNote` says where this version's documentation is (its release's archive). `current` is
 * the page on the project's website, labelled as the latest documentation, not necessarily this version's. A
 * repository preview has neither.
 */
function onlineUrls(
  p: Provenance,
  page: { id: string; url: Bilingual<string> },
  lang: DocsLang,
  section?: string,
): { versioned: string | null; versionedNote: string; current: string; currentLabel: string } | undefined {
  if (p.source !== 'bundle') return undefined;
  return {
    versioned: null,
    versionedNote: `no versioned page online: the documentation of ${p.productVersion} is its release's archive, quest-n-click-docs-${p.productVersion}.tar.gz (${RELEASES_URL}/tag/v${p.productVersion})`,
    current: siteDocs(lang, page.id, section),
    currentLabel: 'latest documentation on the project website, not necessarily this version',
  };
}

export interface DocsSet {
  provenance: Provenance;
  index: DocsIndex;
  /** Each page's Markdown, by `<lang>/<id>`. */
  pages: Record<string, string>;
}

/**
 * Why a file of the given format cannot be read, or undefined: an unknown format, or a version this engine does not
 * know (a newer major), refused with a plain message rather than half read.
 */
export function formatProblem(raw: unknown, format: string, label: string): string | undefined {
  const o = raw as { format?: unknown; version?: unknown } | null;
  if (!o || typeof o !== 'object' || o.format !== format) return `${label} is not a ${format} file`;
  if (typeof o.version !== 'number' || !Number.isInteger(o.version) || o.version < 1)
    return `${label} has no format version`;
  if (o.version !== 1)
    return `${label} is format version ${o.version}; this engine reads version 1 only: install a newer quest-n-click to read it`;
  return undefined;
}

// ------------------------------------------------------------------------------------------------- sections

export interface Section {
  id: string;
  title: string;
  /** The section's Markdown as written, its anchor line and heading included. */
  text: string;
  /** Its applies marker's versions, when it has a well-formed one (§4.4.1). */
  versions?: SectionVersions;
}

const ANCHOR = /^<a (?:name|id)="([a-z0-9]+(?:-[a-z0-9]+)*)"><\/a>\s*$/;
const headingOf = (line: string | undefined) => (line ?? '').replace(/^#{1,6}\s+/, '').trim();

/**
 * A page cut at its `<a name>` anchors (outside fenced code): the lead before the first anchor (id '', kept when it
 * holds more than blank lines), then one section per anchor, up to the next.
 */
export function splitSections(markdown: string): Section[] {
  const lines = markdown.split('\n');
  const anchors: { id: string; line: number }[] = [];
  mapLines(markdown, (raw, n) => {
    const id = ANCHOR.exec(raw.trim())?.[1];
    if (id) anchors.push({ id, line: n - 1 });
    return raw;
  });
  const out: Section[] = [];
  const lead = lines.slice(0, anchors[0]?.line ?? lines.length);
  if (lead.some((l) => l.trim()))
    out.push({ id: '', title: headingOf(lead.find((l) => /^#\s/.test(l))), text: lead.join('\n').trim() });
  anchors.forEach((a, i) => {
    const body = lines.slice(a.line, anchors[i + 1]?.line ?? lines.length);
    const rest = body.slice(1).filter((l) => l.trim());
    const versions = rest[0] === undefined ? undefined : appliesMarker(rest[0]);
    out.push({
      id: a.id,
      title: headingOf(versions === undefined ? rest[0] : rest[1]),
      text: body.join('\n').trim(),
      ...(versions ? { versions } : {}),
    });
  });
  return out;
}

/**
 * The size in bytes of each of the eight historical pages at 4.4.0 (docs/en/<NAME>.md at c00b44fc, as
 * tests/fixtures/mcp/read_doc-4.4.0.json records it). `read_doc {name}` stays within 1.5 times it (§4.3.2).
 */
export const LEGACY_BYTES_4_4_0: Readonly<Record<string, number>> = {
  CONTENT_GUIDE: 68195,
  ENGINE: 31143,
  TOOLS: 59054,
  STUDIO: 42276,
  WORKFLOW: 4395,
  AUDIO: 14345,
  UPGRADING: 62223,
  CLASSICS: 10850,
};
/** The bound of a legacy page: 1.5 times its 4.4.0 size (§4.3.2, to catch a bloat). */
export const legacyBudget = (name: string): number | undefined =>
  LEGACY_BYTES_4_4_0[name] === undefined ? undefined : Math.floor(1.5 * LEGACY_BYTES_4_4_0[name]);

/** A section's anchor line, which only a page's own reader needs. */
const ANCHOR_LINE = /^<a name="[^"]*"><\/a>\n+/gm;

/**
 * One of the eight historical pages `read_doc {name}` serves since the switch-over (C2, §4.3.2): the English wiki
 * pages' sections in the legacy order of `wiki/legacy.json` (the order of the old page's sections), joined, their
 * `<a name>` lines left out. An `id#section` gives that section; a bare `id` gives its whole page, lead included, but
 * only the parts not given yet (dedup `page-covers-sections`); nothing is given twice. A page the set does not hold (a
 * draft, in a package) is named as coming, never silently left out. `pageOf` is the English Markdown of a page, or
 * undefined.
 *
 * Within `budget` bytes (1.5 times the 4.4.0 page, `legacyBudget`): the wiki's sections say more than the old pages
 * did, so when the whole text is longer, the longest sections are given by their heading and first paragraph and the
 * section read that gives the rest (`read_doc {"id": …, "section": …}`), one at a time from the longest, until the page
 * fits; if that is not enough, the longest by their heading and that read alone. Every section's heading stays; no
 * text is cut in the middle, and nothing is left without the read that gives it.
 */
export function legacyConcatenation(
  order: readonly string[],
  pageOf: (id: string) => string | undefined,
  budget?: number,
): string {
  const parts: { text: string; shorter: string[] }[] = [];
  const given = new Set<string>();
  const sectionsOf = new Map<string, Section[] | undefined>();
  const sections = (id: string) => {
    if (!sectionsOf.has(id)) {
      const text = pageOf(id);
      sectionsOf.set(id, text === undefined ? undefined : splitSections(text.replace(/\r\n/g, '\n')));
    }
    return sectionsOf.get(id);
  };
  for (const d of order) {
    const [id, section] = d.split('#') as [string, string | undefined];
    const all = sections(id);
    if (!all) {
      if (!given.has(id)) parts.push({ text: `(${id}: coming in a later documentation)`, shorter: [] });
      given.add(id);
      continue;
    }
    for (const s of all) {
      const key = `${id}#${s.id}`;
      if ((section !== undefined && s.id !== section) || given.has(key)) continue;
      given.add(key);
      const text = s.text.replace(ANCHOR_LINE, '').trim();
      parts.push({ text, shorter: shortSections(text, id, s.id) });
    }
  }
  const size = () => Buffer.byteLength(parts.map((p) => p.text).join('\n\n')) + 1;
  // Two rounds, each from the longest section: its heading and first paragraph, then its heading alone.
  for (let round = 0; round < 2 && budget !== undefined && size() > budget; round++) {
    const longest = parts
      .map((p, i) => ({ i, bytes: Buffer.byteLength(p.text) }))
      .filter(({ i }) => parts[i]!.shorter[round] !== undefined)
      .sort((a, b) => b.bytes - a.bytes || a.i - b.i);
    for (const { i } of longest) {
      if (size() <= budget) break;
      const p = parts[i]!;
      const next = p.shorter[round]!;
      if (Buffer.byteLength(next) < Buffer.byteLength(p.text)) p.text = next;
    }
  }
  return `${parts.map((p) => p.text).join('\n\n')}\n`;
}

/**
 * A section given shorter, with the read that gives the rest: by its heading and first paragraph, then by its heading
 * alone.
 */
function shortSections(text: string, id: string, section: string): string[] {
  const lines = text.split('\n');
  const head: string[] = [];
  let k = 0;
  // The heading (and a versions comment), then the first paragraph or block, up to a blank line.
  while (k < lines.length && (/^#{1,6}\s/.test(lines[k]!) || /^<!-- applies:/.test(lines[k]!) || !lines[k]!.trim()))
    head.push(lines[k++]!);
  const heading = head.join('\n').trim();
  while (k < lines.length && lines[k]!.trim()) head.push(lines[k++]!);
  const read = `\`read_doc ${JSON.stringify(section ? { id, section } : { id })}\``;
  return [
    `${head.join('\n').trim()}\n\n(The rest of this section: ${read}.)`,
    `${heading}\n\n(This section: ${read}.)`,
  ];
}

// ------------------------------------------------------------------------------------------------- words

const STOP = new Set(
  (
    'a an the of to in on at by for from and or is are be do does did how i my me we you your it its this that these ' +
    'what why where when which who with can could should would not no if as into get use using want ' +
    'their they them our his her any some don doesn didn isn aren wasn won ' +
    'le la les l un une des de du d et ou est sont etre pour dans sur en au aux ce cet cette ces que qui quoi quel ' +
    'quelle comment pourquoi je j mon ma mes il elle on ne n se s sa ses par avec plus y a veux faire ' +
    'notre nos votre vos leur leurs'
  ).split(' '),
);
/** Lowercase, accents removed, anything but letters and digits a space. */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
/**
 * A plural set aside, so "zones" meets "zone" (French and English alike) and « jeux », « niveaux » meet « jeu »,
 * « niveau »: a final `s` (not `ss`) on a word of four letters or more, a final `x` after `eu` or `au`.
 */
const stem = (w: string) =>
  w.length > 3 && w.endsWith('s') && !w.endsWith('ss')
    ? w.slice(0, -1)
    : w.length > 3 && /(eu|au)x$/.test(w)
      ? w.slice(0, -1)
      : w;
/** The words of a text as compared: folded, stemmed; with `all`, the stop words kept (a phrase is compared whole). */
const words = (s: string, all = false): string[] =>
  fold(s)
    .split(' ')
    .filter((w) => w && (all || (!STOP.has(w) && (w.length > 1 || /\d/.test(w)))))
    .map(stem);
const phrase = (s: string) => ` ${words(s, true).join(' ')} `;

/**
 * French « son » is both a possessive (« vérifier son jeu ») and a noun of this documentation (« pas de son », the
 * sound): kept out of the stop words since 4.5.1 (the wiki audit, F10), it is a word of the query only where a
 * determiner or « pas de » makes it the noun (« le son », « du son », « aucun son », « pas de son »), else it is the
 * possessive and ignored as the stop words are.
 */
const NOUN_BEFORE: Record<string, ReadonlySet<string>> = {
  son: new Set(['le', 'de', 'du', 'un', 'aucun', 'les', 'ce', 'des', 'au', 'sans', 'd', 'l', 'mon', 'ton', 'quel']),
};
/** The words of a query as searched: `words`, an ambiguous word kept only where it is the noun (`NOUN_BEFORE`). */
const queryWords = (query: string): string[] => {
  const all = words(query, true);
  const kept = new Set(
    all.filter((w, i) => {
      const before = NOUN_BEFORE[w];
      return !before || before.has(all[i - 1] ?? '');
    }),
  );
  return words(query).filter((w) => !NOUN_BEFORE[w] || kept.has(w));
};

// ------------------------------------------------------------------------------------------------- versions

const semver = (v: string) => {
  const plain = v.split('+')[0]!;
  const dash = plain.indexOf('-');
  const core = dash < 0 ? plain : plain.slice(0, dash);
  const n = core.split('.').map((x) => Number(x) || 0);
  return { n: [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0], pre: dash < 0 ? undefined : plain.slice(dash + 1).split('.') };
};
/**
 * -1, 0 or 1, SemVer's order (§11): a pre-release before its release; its identifiers compared one by one, numbers
 * numerically (rc.2 < rc.10) and before words, a shorter list first when all else is equal.
 */
export function compareVersions(a: string, b: string): number {
  const x = semver(a);
  const y = semver(b);
  for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i]! < y.n[i]! ? -1 : 1;
  if (!x.pre || !y.pre) return x.pre === y.pre ? 0 : x.pre ? -1 : 1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) return Number(p) < Number(q) ? -1 : 1;
    if (pn !== qn) return pn ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}
/** Whether what a page describes is true for `version` (§4.4.1: `appliesFrom`, and `appliesUntil` inclusive). */
const applies = (p: IndexPage, version: string) =>
  !p.versions ||
  (compareVersions(version, p.versions.appliesFrom) >= 0 &&
    (!p.versions.appliesUntil || compareVersions(version, p.versions.appliesUntil) <= 0));
/**
 * Whether a section is true for `version`: its own marker's bounds where it gives them, its page's otherwise (§4.4.1;
 * `wiki -- check` keeps a section's range inside its page's).
 */
function sectionApplies(
  p: { versions?: IndexPage['versions'] },
  s: { versions?: SectionVersions },
  version: string,
): boolean {
  const from = s.versions?.appliesFrom ?? p.versions?.appliesFrom;
  const until = s.versions?.appliesUntil ?? p.versions?.appliesUntil;
  return (!from || compareVersions(version, from) >= 0) && (!until || compareVersions(version, until) <= 0);
}

// ------------------------------------------------------------------------------------------------- cursors

/** A short, stable hash (FNV-1a, 32 bits, hex): a request's fingerprint, not a security measure. */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
/** The set's revision as a cursor holds it: the doc revision and the hash of every file it holds. */
const revisionOf = (set: DocsSet) =>
  `${set.provenance.docRevision}:${fnv(
    set.index.pages.flatMap((p) => LANGS.map((l) => `${p.id}/${l}/${p.langs[l]?.sha256 ?? ''}`)).join('|'),
  )}`;
/** The request a cursor continues, without its cursor, its keys in a fixed order. */
const requestHash = (r: Record<string, unknown>) =>
  fnv(
    JSON.stringify(
      Object.keys(r)
        .filter((k) => k !== 'cursor' && r[k] !== undefined)
        .sort()
        .map((k) => [k, r[k]]),
    ),
  );

interface CursorData {
  r: string;
  l: string;
  q: string;
  o: number;
}
const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));
const encodeCursor = (c: CursorData) => `c1.${b64url(JSON.stringify(c))}`;

/** Thrown for a cursor that does not continue this request on this documentation. */
export class StaleCursor extends Error {
  readonly code = 'stale_cursor';
  constructor(why: string) {
    super(`stale_cursor: ${why}; run the request again without its cursor`);
  }
}
/** The offset a cursor holds, once checked against the set's revision, the language and the request. */
function cursorOffset(cursor: string, set: DocsSet, lang: string, request: Record<string, unknown>): number {
  let c: CursorData;
  try {
    if (!cursor.startsWith('c1.')) throw new Error();
    c = JSON.parse(unb64url(cursor.slice(3))) as CursorData;
    if (typeof c.o !== 'number' || !Number.isInteger(c.o) || c.o < 0) throw new Error();
  } catch {
    throw new StaleCursor('this is not a cursor this tool gave');
  }
  if (c.r !== revisionOf(set)) throw new StaleCursor('the documentation changed since this cursor was given');
  if (c.l !== lang || c.q !== requestHash(request))
    throw new StaleCursor('this cursor was given for another request (id, section, language, query or filters)');
  return c.o;
}

// ------------------------------------------------------------------------------------------------- search

type MatchReason = 'title' | 'question' | 'alias' | 'identifier' | 'section' | 'body';
const WEIGHT: Record<MatchReason, number> = { title: 10, question: 10, alias: 6, identifier: 6, section: 4, body: 2 };
/** A glossary word found in the query widens it; each word it adds weighs this much of a word typed. */
const EXPANSION = 0.6;
/** Under this score, or with fewer than half the words typed found, a result is not confident. */
const THRESHOLD = 3;
const MIN_COVERAGE = 0.5;

export interface SearchInput {
  query: string;
  lang?: DocsLang;
  audience?: string;
  context?: string;
  version?: string;
  type?: string;
  includeArchived?: boolean;
  limit?: number;
  cursor?: string;
}
interface SearchResult {
  /** `id#section`, or `id` for a page's lead. */
  ref: string;
  id: string;
  section: string;
  lang: DocsLang;
  title: string;
  sectionTitle: string;
  type: string;
  context: string[];
  versions?: IndexPage['versions'];
  state: IndexPage['state'];
  /** The page's or the section's lifecycle; `deprecated` and `archived` are shown only with `includeArchived`. */
  status: 'current' | 'deprecated' | 'archived';
  /** With `includeArchived` and `version`: the page does not apply to that version. */
  notApplicable?: true;
  score: number;
  reason: MatchReason;
  /** The text around the words found, each marked **like this**. */
  snippet: string;
}
export type SearchOutput =
  | { query: string; results: SearchResult[]; total: number; cursor?: string; provenance: Provenance }
  | { query: string; results: []; note: 'no confident match'; suggestions: string[]; provenance: Provenance };

const typesOf = (p: IndexPage) => [p.type, ...(p.alsoTypes ?? [])];
/** The pages a request's filters keep (the version filter is applied by the caller: it may mark rather than drop). */
const filtered = (set: DocsSet, f: { audience?: string; context?: string; type?: string; state?: string }) =>
  set.index.pages.filter(
    (p) =>
      (!f.audience || p.audience.includes(f.audience)) &&
      (!f.context || p.context.includes(f.context)) &&
      (!f.type || typesOf(p).includes(f.type)) &&
      (!f.state || p.state === f.state),
  );

interface Term {
  word: string;
  weight: number;
  /** The words typed this one stands for (a glossary word stands for the words that found it). */
  covers: string[];
}

/**
 * The query's words, then the glossary's words its phrases name, in both languages; and, for each page a named term
 * points at, the term's words as more aliases of that page.
 */
function termsOf(query: string, set: DocsSet): { terms: Term[]; aliases: Map<string, Bilingual<string[]>> } {
  const typed = [...new Set(queryWords(query))];
  const terms: Term[] = typed.map((w) => ({ word: w, weight: 1, covers: [w] }));
  const aliases = new Map<string, Bilingual<string[]>>();
  const q = phrase(query);
  for (const g of set.index.glossary) {
    const names = LANGS.flatMap((l) => [g[l].term, ...g[l].synonyms]);
    const hit = names.find((n) => words(n, true).length && q.includes(phrase(n)));
    if (!hit) continue;
    const covers = words(hit).filter((w) => typed.includes(w));
    for (const w of new Set(names.flatMap((n) => words(n))))
      if (!terms.some((t) => t.word === w)) terms.push({ word: w, weight: EXPANSION, covers });
    for (const id of g.pages) {
      const a = aliases.get(id) ?? { en: [], fr: [] };
      for (const l of LANGS) a[l].push(g[l].term, ...g[l].synonyms);
      aliases.set(id, a);
    }
  }
  return { terms, aliases };
}

/** Marks the words of `text` that are among `found`, around the first one, in at most about 160 characters. */
function snippetOf(text: string, found: ReadonlySet<string>): string {
  // Read as text: no anchor, no heading marks, a link or an image as its label.
  const flat = text
    .replace(/<a (?:name|id)="[^"]*"><\/a>/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    // The page's own emphasis around words (the excerpt marks the words found, and a bold inside a bold would read
    // `****x**`); never inside inline code, nor a `**` that is not emphasis (`ops/**/*.yml`).
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/\*\*(?=[^\s*])([^*]*?[^\s*])\*\*/g, '$1')))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  // Inline code is shown as written: no word inside it is marked.
  const code = [...flat.matchAll(/`[^`]*`/g)].map((m) => [m.index, m.index + m[0].length] as const);
  const spans = [...flat.matchAll(/[\p{L}\p{N}]+/gu)].filter((m) => {
    if (code.some(([a, b]) => m.index >= a && m.index < b)) return false;
    const w = words(m[0], true)[0];
    return w !== undefined && found.has(w);
  });
  const first = spans[0]?.index ?? 0;
  let start = Math.max(0, first - 60);
  if (start > 0) start = flat.lastIndexOf(' ', start) + 1;
  let end = Math.min(flat.length, start + 160);
  if (end < flat.length) {
    const space = flat.indexOf(' ', end);
    end = space < 0 ? flat.length : space;
  }
  let out = '';
  let at = start;
  for (const m of spans) {
    const i = m.index!;
    if (i < start || i + m[0].length > end) continue;
    out += `${flat.slice(at, i)}**${m[0]}**`;
    at = i + m[0].length;
  }
  out += flat.slice(at, end);
  return `${start > 0 ? '… ' : ''}${out}${end < flat.length ? ' …' : ''}`;
}

interface Scored extends SearchResult {
  order: number;
}

/** An identifier written in capitals, as environment variables are: `STUDIO_SESSION_KEY`, `PATH`. */
const SCREAMING = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
/** Whether the query holds `id` exactly, between characters that cannot continue an identifier. */
const typedExactly = (query: string, id: string) => {
  let at = query.indexOf(id);
  while (at >= 0) {
    const before = query[at - 1] ?? ' ';
    const after = query[at + id.length] ?? ' ';
    if (!/[\w-]/.test(before) && !/[\w-]/.test(after)) return true;
    at = query.indexOf(id, at + 1);
  }
  return false;
};
/**
 * Whether the query names `id`: typed exactly as a token, or, for a query of one token shaped like an identifier (with
 * an underscore), typed in another case (`studio_session_key` names `STUDIO_SESSION_KEY`; the word `studio` alone does
 * not name `STUDIO`).
 */
const typedIdentifier = (query: string, id: string) => {
  if (typedExactly(query, id)) return true;
  const q = query.trim();
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(q) && q.includes('_') && q.toUpperCase() === id.toUpperCase();
};

interface Analysed {
  section: Section;
  /** The words of its heading. */
  title: Set<string>;
  /** The words of its body (its lines but its anchor and its heading), each with its count. */
  counts: Map<string, number>;
}
/** A page's sections and their words, by the page's text: a page is cut and read once, not once per search. */
const ANALYSED = new Map<string, Analysed[]>();
function analysed(markdown: string): Analysed[] {
  let out = ANALYSED.get(markdown);
  if (out) return out;
  out = splitSections(markdown).map((section) => {
    const lines = section.text.split('\n').filter((l) => !ANCHOR.test(l.trim()));
    const heading = lines.findIndex((l) => /^#{1,6}\s/.test(l));
    const counts = new Map<string, number>();
    for (const w of words(lines.filter((_, i) => i !== heading).join('\n'))) counts.set(w, (counts.get(w) ?? 0) + 1);
    return { section, title: new Set(words(section.title)), counts };
  });
  // Bounded: a long-running server reading new revisions does not keep every old text.
  if (ANALYSED.size >= 4096) ANALYSED.clear();
  ANALYSED.set(markdown, out);
  return out;
}

/**
 * Each context's name as the pages write it in their headings ("The engine repository", « Un projet créé »). With a
 * `context` filter, a section headed by that context's name is the one a page that spans several contexts answers
 * with: the name counts as a word of the query found in the heading.
 */
const CONTEXT_NAMES: Record<string, Bilingual<string[]>> = {
  'engine-repo': { en: ['engine repository'], fr: ['dépôt du moteur'] },
  'created-project': { en: ['created project'], fr: ['projet créé'] },
  'studio-local': { en: ['local Studio'], fr: ['Studio local'] },
  'studio-demo': { en: ['demo Studio'], fr: ['Studio de démo'] },
  'studio-hosted': { en: ['hosted Studio'], fr: ['Studio hébergé'] },
  bridge: { en: ['Bridge'], fr: ['Bridge'] },
  player: { en: ['player'], fr: ['joueur'] },
};
const headedByContext = (title: string, context: string | undefined, lang: DocsLang) =>
  !!context && (CONTEXT_NAMES[context]?.[lang] ?? []).some((n) => phrase(title).includes(phrase(n)));

/** The best section of one page in one language, and its score; undefined when nothing of the query is in it. */
function scorePage(
  p: IndexPage,
  lang: DocsLang,
  markdown: string,
  terms: readonly Term[],
  query: string,
  glossary: readonly string[],
  skip: (s: Section) => boolean = () => false,
  context?: string,
) {
  const typed = new Set(terms.filter((t) => t.weight === 1).map((t) => t.word));
  const q = phrase(query);
  const symptoms = typesOf(p).includes('troubleshooting');
  // Page-level fields: the best one each word is found in. An identifier in capitals (an environment variable,
  // `STUDIO`, `PATH`) counts only when the query holds it exactly, as a token: otherwise every query with the word
  // "studio" would be read as naming the variable `STUDIO` (A7, D2).
  const identifiers = p.identifiers.filter((id) => !SCREAMING.test(id) || typedIdentifier(query, id));
  // The identifiers the query names whole: a section headed by one of them is that identifier's own section.
  const named = new Set(identifiers.filter((id) => typedIdentifier(query, id)).map((id) => id.toLowerCase()));
  const fields: { reason: MatchReason; texts: string[] }[] = [
    { reason: 'title', texts: [p.title[lang]] },
    { reason: 'question', texts: p.questions[lang] },
    { reason: 'alias', texts: [...p.aliases[lang], ...p.keywords[lang], ...glossary] },
    // The longest first, so a whole identifier typed is the one an excerpt shows (`STUDIO_SESSION_KEY`, not `STUDIO`).
    { reason: 'identifier', texts: [...identifiers].sort((a, b) => b.length - a.length) },
  ];
  const fieldWords = fields.map((f) => f.texts.map((t) => new Set(words(t))));
  const pageHits = terms.map((t) => {
    for (const [i, f] of fields.entries()) {
      const j = fieldWords[i]!.findIndex((s) => s.has(t.word));
      if (j >= 0) return { reason: f.reason, text: f.texts[j]!, score: WEIGHT[f.reason] * t.weight };
    }
    return undefined;
  });
  // A whole question, title or identifier typed: a strong sign, counted once more.
  let bonus = 0;
  let bonusHit: { reason: MatchReason; text: string } | undefined;
  for (const f of fields)
    for (const t of f.texts) {
      const ph = phrase(t);
      const whole =
        f.reason === 'identifier'
          ? (ph.trim() !== '' && q.includes(ph)) || named.has(t.toLowerCase())
          : words(query).length > 1 && ph.includes(phrase(query));
      if (whole && WEIGHT[f.reason] > bonus) {
        bonus = WEIGHT[f.reason];
        bonusHit = { reason: f.reason, text: t };
      }
    }
  let best: { section: Section; score: number; reason: MatchReason; text: string; found: Set<string> } | undefined;
  for (const { section: s, title, counts } of analysed(markdown)) {
    if (skip(s)) continue;
    // The section headed by the identifier typed, exactly (`PATH`, not `WORKER_PYTHON_PATH`), ranks first.
    let score = bonus + (named.has(s.title.replace(/`/g, '').trim().toLowerCase()) ? WEIGHT.identifier : 0);
    const found = new Set<string>();
    const covered = new Set<string>();
    let top: { reason: MatchReason; score: number; text: string } | undefined = bonusHit
      ? { ...bonusHit, score: bonus }
      : undefined;
    for (const [i, t] of terms.entries()) {
      const page = pageHits[i];
      const n = counts.get(t.word) ?? 0;
      const reason: MatchReason | undefined = title.has(t.word) ? 'section' : n ? 'body' : undefined;
      if (!page && !reason) continue;
      const sec =
        reason === 'section' ? WEIGHT.section * t.weight : n ? (WEIGHT.body + Math.min(n - 1, 2) * 0.5) * t.weight : 0;
      found.add(t.word);
      for (const c of t.covers) covered.add(c);
      score += (page?.score ?? 0) + sec;
      if (page && (!top || page.score > top.score)) top = { reason: page.reason, score: page.score, text: page.text };
      if (reason && (!top || sec > top.score)) top = { reason, score: sec, text: s.text };
    }
    if (!top) continue;
    // The page's lead is headed by the page's title, not by a context: only a section earns the context's bonus.
    // The page's lead is headed by the page's title, not by a context: only a section earns the context's bonus.
    if (s.id && headedByContext(s.title, context, lang)) score += WEIGHT.section;
    // A symptom typed as the section names it (« pas de son », "no sound", "the game has no sound"): the section's
    // heading, two words or more, one of them not a stop word, is in the query word for word (the 4.5.1 audit, F10).
    // Troubleshooting pages only: a reference's heading (`npm run studio`) is a name, not a symptom.
    const heading = phrase(s.title);
    if (symptoms && heading.trim().split(' ').length > 1 && words(s.title).length && q.includes(heading))
      score += 2 * WEIGHT.section;
    // The excerpt of a page-level match is the field that holds the most words found, the heaviest on a tie: an alias
    // "Studio backup" says more than the title "Backups" alone, and names its context.
    if (top.reason !== 'section' && top.reason !== 'body') {
      const holds = (ws: ReadonlySet<string>) => [...found].filter((w) => ws.has(w)).length;
      let most = holds(new Set(words(top.text)));
      for (const [i, f] of fields.entries())
        for (const [j, t] of f.texts.entries()) {
          const n = holds(fieldWords[i]![j]!);
          if (n > most) {
            most = n;
            top = { reason: f.reason, score: WEIGHT[f.reason], text: t };
          }
        }
    }
    const coverage = typed.size ? [...typed].filter((w) => covered.has(w)).length / typed.size : 0;
    const final = Math.round(score * (0.4 + 0.6 * coverage) * 100) / 100;
    if (final < THRESHOLD || coverage < MIN_COVERAGE) continue;
    // An identifier's excerpt is its section, the description after the name, not the name alone.
    const text = top.reason === 'identifier' ? s.text : top.text;
    if (!best || final > best.score) best = { section: s, score: final, reason: top.reason, text, found };
  }
  return best;
}

/** An HTTP status typed as a symptom: `409`, `Error 503`, « erreur 423 ». */
const STATUS_CODE = /(?<![\w.-])[45]\d\d(?![\w.-])/;
/**
 * A reference register's weight for a symptom asked within a context. A status code typed with a `context` filter is
 * a symptom of that context's service: its troubleshooting or how-to page answers it (cause, diagnosis, recovery), and
 * a reference page that lists the code for every service ranks below them. Without a context the register keeps its
 * score: it is the one page that names every service the code belongs to.
 */
const REFERENCE_FOR_SYMPTOM = 0.5;

/** `search_docs`: one result per page, its best section, by score then id. */
export function searchDocs(set: DocsSet, input: SearchInput): SearchOutput {
  const limit = Math.min(Math.max(1, input.limit ?? 5), 20);
  const lang = input.lang;
  const request = { ...input, limit, includeArchived: !!input.includeArchived };
  const offset = input.cursor ? cursorOffset(input.cursor, set, lang ?? '*', request) : 0;
  const { terms, aliases } = termsOf(input.query, set);
  const symptom = input.context !== undefined && STATUS_CODE.test(input.query);
  const scored: Scored[] = [];
  filtered(set, input).forEach((p, order) => {
    const notApplicable = input.version !== undefined && !applies(p, input.version);
    if ((notApplicable || p.lifecycle) && !input.includeArchived) return;
    let pick: Scored | undefined;
    for (const l of lang ? [lang] : LANGS) {
      const md = p.langs[l] ? set.pages[`${l}/${p.id}`] : undefined;
      if (md === undefined) continue;
      // A section that does not apply to the version asked is left out, or kept and marked with includeArchived.
      const off = (s: Section) => input.version !== undefined && !sectionApplies(p, s, input.version);
      const b = scorePage(
        p,
        l,
        md,
        terms,
        input.query,
        aliases.get(p.id)?.[l] ?? [],
        (s) => (input.includeArchived ? false : off(s) || !!s.versions?.lifecycle),
        input.context,
      );
      if (!b) continue;
      const score =
        symptom && typesOf(p).includes('reference') ? Math.round(b.score * REFERENCE_FOR_SYMPTOM * 100) / 100 : b.score;
      if (pick && pick.score >= score) continue;
      const na = notApplicable || off(b.section);
      pick = {
        ref: b.section.id ? `${p.id}#${b.section.id}` : p.id,
        id: p.id,
        section: b.section.id,
        lang: l,
        title: p.title[l],
        sectionTitle: b.section.title,
        type: p.type,
        context: p.context,
        ...(p.versions ? { versions: p.versions } : {}),
        state: p.state,
        status: p.lifecycle ?? b.section.versions?.lifecycle ?? 'current',
        ...(na ? { notApplicable: true as const } : {}),
        score,
        reason: b.reason,
        snippet: snippetOf(b.text, b.found),
        order,
      };
    }
    if (pick) scored.push(pick);
  });
  scored.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!scored.length)
    return {
      query: input.query,
      results: [],
      note: 'no confident match',
      suggestions: set.index.pages.filter((p) => p.type === 'index').map((p) => p.id),
      provenance: set.provenance,
    };
  const page = scored.slice(offset, offset + limit).map(({ order: _o, ...r }) => r);
  const next = offset + limit;
  return {
    query: input.query,
    results: page,
    total: scored.length,
    ...(next < scored.length
      ? { cursor: encodeCursor({ r: revisionOf(set), l: lang ?? '*', q: requestHash(request), o: next }) }
      : {}),
    provenance: set.provenance,
  };
}

// ------------------------------------------------------------------------------------------------- list

export interface ListInput {
  audience?: string;
  context?: string;
  type?: string;
  lang?: DocsLang;
  state?: 'draft' | 'ready';
}
/** `list_docs`: the pages the set holds, in the manifest's order, with their sections. */
export function listDocs(set: DocsSet, input: ListInput) {
  const pages = filtered(set, input)
    .filter((p) => !input.lang || p.langs[input.lang])
    .map((p) => {
      const langs = LANGS.filter((l) => p.langs[l]);
      const l = input.lang ?? langs[0] ?? 'en';
      return {
        id: p.id,
        title: input.lang ? p.title[input.lang] : p.title,
        type: p.type,
        audience: p.audience,
        context: p.context,
        ...(p.versions ? { versions: p.versions } : {}),
        state: p.state,
        langs,
        sections: (p.langs[l]?.sections ?? []).map((s) => ({
          id: s.id,
          title: s.title,
          ...(s.versions ? { versions: s.versions } : {}),
        })),
      };
    });
  return { pages, total: pages.length, provenance: set.provenance };
}

// ------------------------------------------------------------------------------------------------- read

const READ_DEFAULT_CHARS = 20_000;
export const READ_MAX_CHARS = 100_000;

export interface ReadInput {
  id: string;
  section?: string;
  lang?: DocsLang;
  cursor?: string;
  maxChars?: number;
}

/** The header `read_doc` by id puts above the text: where it comes from, in one line. */
export function provenanceLine(p: Provenance, page?: { ref: string; lang: string; state: string }): string {
  const what = page
    ? `${page.ref} (${page.lang}, ${page.state === 'draft' ? 'draft: not reviewed yet' : 'ready'}) · `
    : '';
  const ids = [
    `commit ${p.productCommit.slice(0, 12)}`,
    `doc revision ${p.docRevision.slice(0, 12)}`,
    ...(p.buildId ? [`build ${p.buildId}`] : []),
  ];
  return `> quest'n'click documentation · ${what}quest'n'click ${p.productVersion} (${ids.join(', ')}) · ${p.label}`;
}

/** `read_doc {id, section?, lang?}`: the page or one section, `maxChars` at a time, a cursor for the rest. */
export function readDocById(set: DocsSet, input: ReadInput) {
  const lang = input.lang ?? 'en';
  const p = set.index.pages.find((x) => x.id === input.id);
  if (!p)
    throw new Error(
      `no page "${input.id}" in this documentation (${set.provenance.label}): search_docs or list_docs give the ids there are; a planned page has no text yet`,
    );
  const md = p.langs[lang] ? set.pages[`${lang}/${p.id}`] : undefined;
  if (md === undefined)
    throw new Error(`${p.id} is not written in ${lang}: it is in ${LANGS.filter((l) => p.langs[l]).join(', ')}`);
  const sections = splitSections(md);
  let text = md;
  if (input.section !== undefined) {
    const s = sections.find((x) => x.id === input.section);
    if (!s)
      throw new Error(
        `${p.id} has no section "${input.section}": its sections are ${sections.map((x) => x.id || '(lead, id "")').join(', ')}`,
      );
    text = s.text;
  }
  const max = Math.min(Math.max(1, input.maxChars ?? READ_DEFAULT_CHARS), READ_MAX_CHARS);
  const request = { id: input.id, section: input.section, maxChars: max };
  const from = input.cursor ? cursorOffset(input.cursor, set, lang, request) : 0;
  if (from > text.length) throw new StaleCursor('this cursor points past the end of the text');
  let to = Math.min(text.length, from + max);
  // Cut at a line's end when one is in the last half of the window: a reader gets whole lines.
  if (to < text.length) {
    const nl = text.lastIndexOf('\n', to);
    if (nl > from + max / 2) to = nl + 1;
  }
  const ref = input.section ? `${p.id}#${input.section}` : p.id;
  const cursor =
    to < text.length ? encodeCursor({ r: revisionOf(set), l: lang, q: requestHash(request), o: to }) : undefined;
  const header = provenanceLine(set.provenance, { ref, lang, state: p.state });
  const more = cursor
    ? `\n\n> characters ${from}–${to} of ${text.length}: read_doc again with the same id, section and lang and cursor "${cursor}" for the rest`
    : '';
  return {
    text: `${header}\n\n${text.slice(from, to)}${more}`,
    structured: {
      ref,
      id: p.id,
      section: input.section ?? null,
      lang,
      state: p.state,
      range: { from, to, total: text.length },
      ...(cursor ? { cursor } : {}),
      sections: sections.map((s) => ({ id: s.id, title: s.title })),
      provenance: set.provenance,
      ...(() => {
        const url = onlineUrls(set.provenance, p, lang, input.section);
        return url ? { url } : {};
      })(),
    },
  };
}
