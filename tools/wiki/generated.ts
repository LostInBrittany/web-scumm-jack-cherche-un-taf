// The generated reference pages (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md Annex A "(gen.)", lot B11): a page whose
// facts live in the code is written from the code, plus a data file of `wiki/data/` where a person adds what the code
// cannot say (a description in English and in French). Each generator gives the page's generated part in both
// languages, the problems where the data and the code disagree (a script with no description, a described route the
// code no longer serves…), and, for some, the page's manifest `identifiers`. The page keeps its hand-written text
// around one region, `<!-- generated:begin -->` … `<!-- generated:end -->`; `npm run wiki -- generate [<page>…]`
// rewrites the region (and the identifiers), and `check` fails when a written page's region, or its identifiers, are
// not what the generator gives. The same shape as the environment variable register (tools/wiki/env.ts), which keeps
// its own markers. This module holds what every generator shares; tools/wiki/generators.ts lists them.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { issuesOf } from './manifest';

export type Lang = 'en' | 'fr';
export const LANGS: readonly Lang[] = ['en', 'fr'];
const BEGIN = '<!-- generated:begin -->';
const END = '<!-- generated:end -->';

/** What a generator reads: the repository (the code), the wiki folder (its data), the files git tracks. */
export interface GenContext {
  root: string;
  wikiDir: string;
  tracked: readonly string[];
}

export interface GenResult {
  /** The region in each language, or undefined when the data could not be read (the problems say why). */
  sections?: Record<Lang, string>;
  /** Where the data and the code disagree: each is an error of `check`. */
  problems: string[];
  /** The page's manifest identifiers, when the generator owns them (compared sorted). */
  identifiers?: string[];
}

export interface Generator {
  page: string;
  /** Its data file under `wiki/`, when it has one (`data/npm-scripts.json`): absent from a fixture wiki, it is skipped. */
  data?: string;
  build(ctx: GenContext): GenResult;
}

export const bilingual = (max = 2000) =>
  z.object({ en: z.string().trim().min(1).max(max), fr: z.string().trim().min(1).max(max) }).strict();

/** A data file of `<wiki>/`, parsed: absent (a fixture), or what is wrong with it. */
export function readData<T>(
  wikiDir: string,
  file: string,
  schema: z.ZodType<T>,
): { data?: T; absent?: true; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resolve(wikiDir, file), 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { absent: true, errors: [] };
    return { errors: [`${file}: ${(e as Error).message}`] };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { errors: issuesOf(parsed.error).map((l) => `${file} ${l}`) };
  return { data: parsed.data, errors: [] };
}

/** A repository file's text with `\n` line ends (a Windows checkout may hold `\r\n`), '' when it is missing. */
export function source(root: string, file: string): string {
  try {
    return readFileSync(resolve(root, file), 'utf8').replace(/\r\n/g, '\n');
  } catch {
    return '';
  }
}

/** A section id from a name: lowercase kebab case (`test:mutation:core` → `test-mutation-core`). */
export const sectionId = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** An inline code span that holds any text (a backtick inside takes a longer fence). */
export const code = (s: string) => {
  const run = Math.max(0, ...[...s.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(run + 1);
  return run ? `${fence} ${s} ${fence}` : `${fence}${s}${fence}`;
};

/**
 * Prose from a data file, safe in Markdown: outside its code spans, `<` is written `&lt;`, so a placeholder such as
 * `layout/<id>.json` written bare is shown, never taken for an HTML tag.
 */
export const prose = (s: string) =>
  s
    .split(/(`+[^`]*`+)/)
    .map((part, i) => (i % 2 ? part : part.replace(/</g, '&lt;')))
    .join('');

/** A cell of a Markdown table: no line break, `|` escaped. */
export const cell = (s: string) => s.replace(/\n/g, ' ').replace(/\|/g, '\\|');

/** A link to a repository file from a page of `wiki/<lang>/`. */
export const repoLink = (file: string) => `[${code(file)}](../../${file})`;

/** `: ` in English, ` : ` in French. */
export const colon = (lang: Lang) => (lang === 'en' ? ': ' : ' : ');

/** The section ids a region gives twice (the anchors it writes), as problems. */
export function duplicateAnchors(page: string, text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(/^<a name="([^"]+)"><\/a>$/gm)) {
    if (seen.has(m[1]!)) out.push(`${page}: the generated section id "${m[1]}" is given twice`);
    seen.add(m[1]!);
  }
  return out;
}

/** The page with its region replaced, or a problem when its markers are not there once each. */
export function withGenerated(page: string, generated: string): { text?: string; problem?: string } {
  const a = page.indexOf(BEGIN);
  const b = page.indexOf(END);
  if (a < 0 || b < a || page.indexOf(BEGIN, a + 1) >= 0 || page.indexOf(END, b + 1) >= 0)
    return { problem: `the page holds ${BEGIN} … ${END} once, around its generated part` };
  return { text: `${page.slice(0, a)}${BEGIN}\n\n${generated.trim()}\n\n${END}${page.slice(b + END.length)}` };
}

/**
 * The manifest's text with one page's `identifiers` set to `names`, every other byte kept (the manifest is written by
 * hand). Parsed back and compared, so a layout it does not expect fails loudly.
 */
export function withPageIdentifiers(manifestText: string, pageId: string, names: readonly string[]): string {
  const lines = manifestText.split('\n');
  const out: string[] = [];
  let id: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const idLine = /^ {6}"id": "([^"]+)",$/.exec(l);
    if (idLine) id = idLine[1];
    const m = /^( {6})"identifiers": (.*)$/.exec(l);
    if (!m || id !== pageId) {
      out.push(l);
      continue;
    }
    let end = i;
    if (!/^\[.*\],?$/.test(m[2]!)) while (end < lines.length && !/^ {6}\],?$/.test(lines[end]!)) end++;
    const comma = lines[end]!.endsWith(',') ? ',' : '';
    if (!names.length) out.push(`${m[1]}"identifiers": []${comma}`);
    else
      out.push(
        `${m[1]}"identifiers": [`,
        ...names.map((x, k) => `${m[1]}  ${JSON.stringify(x)}${k < names.length - 1 ? ',' : ''}`),
        `${m[1]}]${comma}`,
      );
    i = end;
  }
  const text = out.join('\n');
  const expected = JSON.parse(manifestText) as { pages: { id: string; identifiers: string[] }[] };
  for (const p of expected.pages) if (p.id === pageId) p.identifiers = [...names];
  if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(expected))
    throw new Error(`manifest.json: its layout is not the one expected, ${pageId}'s identifiers could not be set`);
  return text;
}

export const sortedUnique = (xs: readonly string[]) => [...new Set(xs)].sort();

/**
 * One generated page of a wiki brought up to date from its region in each language and its identifiers, or only
 * checked with `check`: what is behind, or what stopped the writing (a page's markers). The commands of
 * tools/dsl-doc.ts and tools/api-doc.ts (`create.dsl`, `engine.api`), whose generators `wiki -- generate` runs too.
 */
export function updateGeneratedPage(
  wikiDir: string,
  page: string,
  sections: Record<Lang, string>,
  identifiers: readonly string[],
  check: boolean,
): string[] {
  const out: string[] = [];
  for (const lang of LANGS) {
    const file = resolve(wikiDir, lang, `${page}.md`);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const w = withGenerated(text, sections[lang]);
    if (w.problem) out.push(`${lang}/${page}.md: ${w.problem}`);
    else if (w.text === text) continue;
    else if (check) out.push(`${lang}/${page}.md: its generated part is not the code's`);
    else writeFileSync(file, w.text!);
  }
  const mf = resolve(wikiDir, 'manifest.json');
  const before = readFileSync(mf, 'utf8');
  const after = withPageIdentifiers(before, page, sortedUnique(identifiers));
  if (after !== before) {
    if (check) out.push(`manifest.json: ${page}'s identifiers are not its generator's`);
    else writeFileSync(mf, after);
  }
  return out;
}
