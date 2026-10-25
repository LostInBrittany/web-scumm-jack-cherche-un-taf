// The translation state (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.7.1, phase A5): no language is the source. For
// each section of a `ready` page, `wiki/translations.json` records which revision of each language someone (a person
// or an AI) read against the other, `{enHash, frHash, reviewers}` under `<id>#<section>` (`<id>#_lead` for the text before the first
// section), each reviewer `{name, kind: human|ai, relation: author|independent, date}` (reviewer.ts). When either
// side's text, or an image a section shows, changes, the pair is "to review": a warning at the work level, an error for
// `check --publish`. A pair read by an AI only is said as such at both levels, never as a review, and no longer fails
// a publication (D56 amends A7, which wanted a person on every pair). `npm run wiki -- translations --ack <id#section> --by <name>
// --kind human|ai --relation author|independent` records the pair, once both sides were read.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { splitSections } from './docs';
import { formatJson } from './json';
import { issuesOf, type Manifest } from './manifest';
import { classifyTarget, mapLine, mapLines } from './page';
import { humanReviewed, type Reviewer, ReviewerSchema, withReviewer } from './reviewer';

const TRANSLATIONS_FILE = 'translations.json';
/** The key of the text before a page's first section: `_` is never in a section id. */
const LEAD = '_lead';

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const TranslationsSchema = z
  .object({
    format: z.literal('quest-n-click-docs-translations'),
    version: z.literal(1),
    pairs: z.record(
      z.string().regex(/^[a-z]+\.[a-z0-9]+(?:-[a-z0-9]+)*#(?:_lead|[a-z0-9]+(?:-[a-z0-9]+)*)$/, 'a key <id>#<section>'),
      z.object({ enHash: hash, frHash: hash, reviewers: z.array(ReviewerSchema).min(1) }).strict(),
    ),
  })
  .strict();
type Translations = z.infer<typeof TranslationsSchema>;

export function readTranslations(wikiDir: string): { translations: Translations; errors: string[] } {
  const empty: Translations = { format: 'quest-n-click-docs-translations', version: 1, pairs: {} };
  const file = resolve(wikiDir, TRANSLATIONS_FILE);
  if (!existsSync(file)) return { translations: empty, errors: [] };
  try {
    const parsed = TranslationsSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (!parsed.success)
      return { translations: empty, errors: issuesOf(parsed.error).map((l) => `${TRANSLATIONS_FILE} ${l}`) };
    return { translations: parsed.data, errors: [] };
  } catch (e) {
    return { translations: empty, errors: [`${TRANSLATIONS_FILE}: ${(e as Error).message}`] };
  }
}

/** A section's text as a pair compares it: line ends made LF, outer blank lines dropped. */
/**
 * A section's hash: its text (line ends made LF, outer blank lines dropped) and the bytes of each image of `wiki/images/`
 * it shows, so a replaced screenshot makes the pair to review like a changed sentence.
 */
function sectionHash(text: string, wikiDir: string, lang: string): string {
  const h = createHash('sha256').update(text.replace(/\r\n/g, '\n').trim());
  const images: string[] = [];
  mapLines(
    text,
    (line, n) =>
      mapLine(line, n, (l) => {
        const t = classifyTarget(l.target, lang);
        if (t.kind === 'wiki-image') images.push(t.path);
        return undefined;
      }),
    undefined,
    { joinLinks: true },
  );
  for (const image of images) {
    const file = resolve(wikiDir, 'images', image);
    h.update(`\0${image}\0`);
    if (existsSync(file)) h.update(readFileSync(file));
  }
  return h.digest('hex');
}

/** Each section of a page in one language, by its key's section part (`_lead` for the lead), with its hash. */
function sectionHashes(markdown: string, wikiDir: string, lang: string): Map<string, string> {
  return new Map(
    splitSections(markdown.replace(/\r\n/g, '\n')).map((s) => [s.id || LEAD, sectionHash(s.text, wikiDir, lang)]),
  );
}

export interface PairState {
  key: string;
  /** `paired`: both hashes as recorded; `to review`: no record, or a side changed since. */
  state: 'paired' | 'to review';
  why?: string;
  /** A paired pair's reviewers, and whether a person is among them (a publication needs one). */
  reviewers?: Reviewer[];
  human?: boolean;
}

/**
 * The pairs of every `ready` page: one per section present in both languages (a section in one language only is the
 * parity check's error, not a pair). Also the records that name no section of a written page (`stale`), to remove.
 */
export function translationStates(
  wikiDir: string,
  manifest: Manifest,
  translations: Translations,
): { pairs: PairState[]; stale: string[] } {
  const pairs: PairState[] = [];
  const keys = new Set<string>();
  // A draft's records are kept (a pair may be read before the page is ready); only a ready page's pairs are judged.
  for (const p of manifest.pages.filter((x) => x.state !== 'planned' && !x.generated)) {
    const files = { en: resolve(wikiDir, 'en', `${p.id}.md`), fr: resolve(wikiDir, 'fr', `${p.id}.md`) };
    if (!existsSync(files.en) || !existsSync(files.fr)) continue;
    const en = sectionHashes(readFileSync(files.en, 'utf8'), wikiDir, 'en');
    const fr = sectionHashes(readFileSync(files.fr, 'utf8'), wikiDir, 'fr');
    for (const [section, enHash] of en) {
      const frHash = fr.get(section);
      if (frHash === undefined) continue;
      const key = `${p.id}#${section}`;
      keys.add(key);
      if (p.state !== 'ready') continue;
      const r = translations.pairs[key];
      const since = r?.reviewers.at(-1)?.date;
      if (!r) pairs.push({ key, state: 'to review', why: 'never reviewed as a pair' });
      else if (r.enHash !== enHash && r.frHash !== frHash)
        pairs.push({ key, state: 'to review', why: `both sides changed since ${since}` });
      else if (r.enHash !== enHash) pairs.push({ key, state: 'to review', why: `the English changed since ${since}` });
      else if (r.frHash !== frHash) pairs.push({ key, state: 'to review', why: `the French changed since ${since}` });
      else pairs.push({ key, state: 'paired', reviewers: r.reviewers, human: humanReviewed(r.reviewers) });
    }
  }
  return { pairs, stale: Object.keys(translations.pairs).filter((k) => !keys.has(k)) };
}

/**
 * `translations --ack <id#section> --by <name>`: records the pair as it is now. The page must be written in both
 * languages and hold that section in both; a record no current pair names is dropped at the same time. Returns the
 * problem, or undefined.
 */
export function ackTranslation(o: {
  wikiDir: string;
  manifest: Manifest;
  key: string;
  reviewer: Reviewer;
}): string | undefined {
  const at = o.key.indexOf('#');
  if (at < 0) return `"${o.key}" is not <id>#<section> (${LEAD} for the text before the first section)`;
  const [id, section] = [o.key.slice(0, at), o.key.slice(at + 1)];
  const page = o.manifest.pages.find((p) => p.id === id);
  if (!page || page.generated || page.state === 'planned') return `${id} is not a written page of the manifest`;
  const sides: Record<'en' | 'fr', string | undefined> = { en: undefined, fr: undefined };
  for (const lang of ['en', 'fr'] as const) {
    const file = resolve(o.wikiDir, lang, `${id}.md`);
    if (!existsSync(file)) return `${lang}/${id}.md does not exist`;
    sides[lang] = sectionHashes(readFileSync(file, 'utf8'), o.wikiDir, lang).get(section);
    if (!sides[lang]) return `${lang}/${id}.md has no section "${section}"`;
  }
  const { translations, errors } = readTranslations(o.wikiDir);
  if (errors.length) return errors.join('; ');
  // The same texts read again add a reviewer (a person after the AI that wrote them); changed texts start over.
  const old = translations.pairs[o.key];
  const same = old && old.enHash === sides.en && old.frHash === sides.fr;
  translations.pairs[o.key] = {
    enHash: sides.en!,
    frHash: sides.fr!,
    reviewers: same ? withReviewer(old.reviewers, o.reviewer) : [o.reviewer],
  };
  const { stale } = translationStates(o.wikiDir, o.manifest, translations);
  for (const k of stale) if (k !== o.key) delete translations.pairs[k];
  translations.pairs = Object.fromEntries(Object.entries(translations.pairs).sort(([a], [b]) => (a < b ? -1 : 1)));
  writeFileSync(resolve(o.wikiDir, TRANSLATIONS_FILE), formatJson(translations));
  return undefined;
}
