// Acceptance by real questions (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.6, L6, phase A6; ADR 0030). The
// questions a player, an author, an admin or a contributor really asks, in French and in English, are in
// `wiki/acceptance/questions.json`, each with the destinations (`id#section`) a right answer lands on and the facts it
// must hold; beside them, the counter-examples of §4.6's table, each with the exact behaviour required (an absent
// feature: the "not supported" page or an explicit empty result, never a neighbour first; similar commands and shared
// error codes: the context filter separates them, and without it both appear, each naming its service; an old-version
// procedure: never `current` for the version asked).
//
// Level 1, here, is deterministic: every question goes through `search_docs` (tools/wiki/docs.ts) over the documentation
// the loader resolves (the repository's `wiki/`, its draft and ready pages). Three measures: the expected page in the
// top 3; no inapplicable answer in first position for a counter-example; the share of empty results that were
// justified. A destination `id#section` is found at that section only; a bare page id at any of its sections. A
// question none of whose destinations is written yet in that language is **pending**, counted apart from a miss (one
// written destination, even a secondary one, makes it judged): while phase B writes the pages, most are pending, and
// that is said rather than counted as a failure. Levels 2
// (a fresh AI sub-agent with only the docs tools) and 3 (a beginner reader, the `docs-beginner-reader` pass) are
// protocols, docs/dev/acceptance/; `exportPrompts` writes the prompts of level 2, the question only, never its answer.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { readCoverage } from './coverage';
import { type DocsLang, type DocsSet, searchDocs, splitSections } from './docs';
import { AUDIENCES, CONTEXTS, issuesOf, LANGS, type Manifest } from './manifest';
import { SEMVER } from './page';

const QUESTIONS_FORMAT = 'quest-n-click-docs-acceptance';
/** Where a wiki folder keeps its questions. */
export const questionsPath = (wikiDir: string) => resolve(wikiDir, 'acceptance', 'questions.json');

/** The four rows of §4.6's counter-example table. */
export const ROWS = ['absent-feature', 'similar-commands', 'old-version', 'shared-code'] as const;
type Row = (typeof ROWS)[number];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** A destination: a page id, or a page id and one of its section ids. */
const REF = /^[a-z]+\.[a-z0-9]+(?:-[a-z0-9]+)*(?:#[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
const ref = z.string().regex(REF, 'a destination, <page id> or <page id>#<section id>');
const refs = z.array(ref).refine((a) => new Set(a).size === a.length, {
  message: 'no destination twice',
});
const context = z.enum(CONTEXTS);
const text = (max: number) => z.string().trim().min(1).max(max);

const ContextCase = z
  .object({
    context,
    /** What must come first with this context. */
    expect: refs.min(1),
    /** What must not come first with this context (the neighbour of the other context). */
    expectNotFirst: refs.optional(),
  })
  .strict();

const QuestionSchema = z
  .object({
    id: z.string().regex(SLUG),
    kind: z.enum(['question', 'counter-example']),
    /** A counter-example's row of §4.6's table. */
    row: z.enum(ROWS).optional(),
    audience: z.enum(AUDIENCES),
    /** One of the maintainer's eight (§4.6). */
    maintainer: z.literal(true).optional(),
    /** How a real reader would type it, in each language: not a page title. */
    text: z.object({ en: text(240), fr: text(240) }).strict(),
    /** The filters passed to search_docs with the question: the reader's situation. */
    context: context.optional(),
    version: z.string().regex(SEMVER).optional(),
    /** The acceptable destinations: one of them in the top 3 is a hit. */
    expect: refs,
    /**
     * A clear symptom or a name typed whole (« pas de son », `Studio token required`): one of the destinations must
     * come first, the top 3 is not enough (the 4.5.1 audit, F11).
     */
    top1: z.literal(true).optional(),
    /**
     * The facts a correct answer holds, in English (level 2 grades by them): what the product does, never what the
     * documentation lacks.
     */
    facts: z
      .array(
        text(240).refine((f) => !/not documented|pas document/i.test(f), {
          message: 'a fact says what is true; a documentation gap goes in gaps',
        }),
      )
      .min(1),
    /** What the documentation does not say yet about the question (not graded: the writers' to-do). */
    gaps: z.array(text(240)).min(1).optional(),
    /** An explicit empty result is a correct answer (an absent feature). */
    expectEmpty: z.literal(true).optional(),
    /** Destinations that must never come first (a plausible neighbour). */
    expectNotFirst: refs.optional(),
    /**
     * An old-version procedure: with `version` and includeArchived, the expected page is in the top 3 and marked with
     * one of these; without includeArchived, it never shows as current.
     */
    expectStatus: z
      .array(z.enum(['notApplicable', 'archived']))
      .min(1)
      .optional(),
    /** Similar commands, shared codes: with each context, the right page first. */
    withContext: z.array(ContextCase).min(2).optional(),
    /**
     * Without a context, every one of these in the results (top 5); `names`: for a page, the words one of which its
     * excerpt holds (the service it is about).
     */
    withoutContext: z
      .object({
        expectAll: refs.min(2),
        names: z.record(z.string(), z.array(text(40)).min(1)).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    const say = (message: string, path: string) => ctx.addIssue({ code: 'custom', message, path: [path] });
    const ce = q.kind === 'counter-example';
    if (ce && !q.row) say('a counter-example names its row of the table (§4.6)', 'row');
    if (!ce)
      for (const k of [
        'row',
        'expectEmpty',
        'expectNotFirst',
        'expectStatus',
        'withContext',
        'withoutContext',
      ] as const)
        if (q[k] !== undefined) say(`${k} is a counter-example's`, k);
    if (!ce && !q.expect.length) say('a question expects at least one destination', 'expect');
    if (q.row === 'absent-feature' && !q.expectEmpty)
      say('an absent feature accepts the explicit empty result (expectEmpty)', 'expectEmpty');
    if (q.row === 'old-version' && (!q.version || !q.expectStatus || !q.expect.length))
      say('an old-version procedure gives the version asked, expect and expectStatus', 'expectStatus');
    if ((q.row === 'similar-commands' || q.row === 'shared-code') && (!q.withContext || !q.withoutContext))
      say(`a ${q.row} counter-example gives withContext and withoutContext`, 'withContext');
    // A destination is one context's answer: listed under two contexts, the context would not tell them apart.
    const seen = new Map<string, string>();
    for (const c of q.withContext ?? [])
      for (const d of c.expect) {
        const other = seen.get(d);
        if (other && other !== c.context)
          say(
            `${d} is expected with the contexts ${other} and ${c.context}: one destination per context`,
            'withContext',
          );
        seen.set(d, c.context);
      }
    for (const name of Object.keys(q.withoutContext?.names ?? {}))
      if (!q.withoutContext!.expectAll.some((r) => pageOf(r) === name))
        say(`withoutContext.names names ${name}, not one of expectAll's pages`, 'withoutContext');
  });
type Question = z.infer<typeof QuestionSchema>;

const QuestionsSchema = z
  .object({
    format: z.literal(QUESTIONS_FORMAT),
    version: z.literal(1),
    note: z.string().optional(),
    /** The questions a beginner reader is given in the `docs-beginner-reader` pass (level 3). */
    beginner: z.array(z.string().regex(SLUG)).min(1).max(10),
    questions: z.array(QuestionSchema).min(1),
  })
  .strict();
export type Questions = z.infer<typeof QuestionsSchema>;

const pageOf = (r: string) => r.split('#')[0]!;
const sectionOf = (r: string) => r.split('#')[1];

/** The questions file of a wiki folder, or what is wrong with it. */
export function readQuestions(wikiDir: string): {
  questions?: Questions;
  errors: string[];
} {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(questionsPath(wikiDir), 'utf8'));
  } catch (e) {
    return { errors: [`acceptance/questions.json: ${(e as Error).message}`] };
  }
  const parsed = QuestionsSchema.safeParse(raw);
  if (!parsed.success)
    return {
      errors: issuesOf(parsed.error).map((l) => `acceptance/questions.json ${l}`),
    };
  return { questions: parsed.data, errors: [] };
}

/**
 * What the questions name that does not exist: a page the manifest does not hold, a section neither the written page
 * nor the coverage matrix's proposed destinations know; a row of the table with no counter-example; a beginner
 * question that is not a question.
 */
export function checkQuestions(wikiDir: string, manifest: Manifest, q: Questions): string[] {
  const errors: string[] = [];
  const pages = new Map(manifest.pages.map((p) => [p.id, p]));
  // The sections a destination may name: those the coverage matrix proposes, and those a written page has.
  const known = new Set<string>();
  const { coverage } = readCoverage(wikiDir);
  for (const row of coverage?.rows ?? []) for (const d of row.destinations) known.add(d);
  for (const p of manifest.pages)
    for (const lang of LANGS) {
      const file = resolve(wikiDir, lang, `${p.id}.md`);
      if (existsSync(file))
        for (const s of splitSections(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')))
          if (s.id) known.add(`${p.id}#${s.id}`);
    }
  const ids = new Set<string>();
  for (const x of q.questions) {
    if (ids.has(x.id)) errors.push(`acceptance/questions.json: the question ${x.id} is given twice`);
    ids.add(x.id);
    const all = [
      ...x.expect,
      ...(x.expectNotFirst ?? []),
      ...(x.withContext ?? []).flatMap((c) => [...c.expect, ...(c.expectNotFirst ?? [])]),
      ...(x.withoutContext?.expectAll ?? []),
    ];
    for (const r of new Set(all)) {
      const page = pages.get(pageOf(r));
      if (!page) errors.push(`acceptance/questions.json: ${x.id} expects ${r}, a page the manifest does not hold`);
      else if (page.generated)
        errors.push(
          `acceptance/questions.json: ${x.id} expects ${r}, a generated index (search_docs never returns it)`,
        );
      else if (sectionOf(r) && !known.has(r))
        errors.push(
          `acceptance/questions.json: ${x.id} expects ${r}, a section neither the page nor the coverage matrix has`,
        );
    }
  }
  for (const row of ROWS)
    if (!q.questions.some((x) => x.row === row))
      errors.push(`acceptance/questions.json: no counter-example for the row ${row} of §4.6's table`);
  for (const id of q.beginner) {
    const x = q.questions.find((y) => y.id === id);
    if (!x) errors.push(`acceptance/questions.json: the beginner set names ${id}, no question of the file`);
    else if (x.kind !== 'question')
      errors.push(`acceptance/questions.json: the beginner set names ${id}, a counter-example`);
  }
  if (new Set(q.beginner).size !== q.beginner.length)
    errors.push('acceptance/questions.json: the beginner set names a question twice');
  return errors;
}

// ------------------------------------------------------------------------------------------------- level 1

type Status = 'hit' | 'miss' | 'pass' | 'fail' | 'pending';
interface Outcome {
  id: string;
  lang: DocsLang;
  kind: Question['kind'];
  row?: Row;
  audience: string;
  status: Status;
  /** The first result of the main search (`id#section`), or undefined when it was empty. */
  first?: string;
  /** The main search returned the explicit empty result. */
  empty: boolean;
  /** Why it is a miss, a failure or pending. */
  why: string[];
  /** A question: whether its first result is one of its destinations (the top 1, measured for every question). */
  top1?: boolean;
  /** A question that must come first (`top1` in questions.json). */
  top1Required?: true;
}

export interface AcceptanceReport {
  outcomes: Outcome[];
  questions: {
    runs: number;
    pending: number;
    evaluated: number;
    hits: number;
    top3: number | null;
    /** Among the questions evaluated, those whose first result is a destination: measured apart from the top 3. */
    firstHits: number;
    top1: number | null;
    /** The questions that must come first (`top1`), evaluated, and those that do. */
    top1Required: { evaluated: number; hits: number };
  };
  counterExamples: { runs: number; pending: number; evaluated: number; passes: number; rate: number | null };
  empties: { evaluated: number; justified: number; rate: number | null };
}

/**
 * When a run is pending rather than judged, said in the report's legend and in docs/dev/acceptance/AI-PROTOCOL.md.
 */
export const PENDING_RULE =
  'pending: a question none of whose destinations is written in that language yet, or a counter-example one of whose pages is not; once one destination is written, even a secondary one, a run that does not find what it expects is a miss';

const ratio = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 1000 : null);
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Whether a result (`ref`, `id`) lands on a destination: exactly its section when the destination names one (another
 * section of the same page is not it), any section of the page when the destination is a bare page id.
 */
const lands = (r: { ref: string; id: string }, dest: string) => (sectionOf(dest) ? r.ref === dest : r.id === dest);
/** The right page, another section: said in a miss, never counted as a hit. */
const nearly = (r: { ref: string; id: string }, dest: string) => !!sectionOf(dest) && r.id === pageOf(dest);

/** Runs every question, in each language asked, through search_docs over `set`. */
export function runAcceptance(set: DocsSet, q: Questions, langs: readonly DocsLang[] = LANGS): AcceptanceReport {
  const written = (lang: DocsLang, r: string) =>
    set.index.pages.some((p) => p.id === pageOf(r) && p.langs[lang] !== undefined);
  const search = (
    query: string,
    lang: DocsLang,
    f: { context?: string; version?: string; includeArchived?: boolean },
  ) => {
    const out = searchDocs(set, { query, lang, limit: 5, ...f });
    return 'note' in out ? [] : out.results;
  };
  /** What came instead of `dests`, with the right page at another section named. */
  const instead = (r: { ref: string; id: string }, dests: readonly string[]) =>
    dests.some((d) => nearly(r, d)) ? `${r.ref} (the right page, another section)` : r.ref;
  const outcomes: Outcome[] = [];
  for (const x of q.questions)
    for (const lang of langs) {
      const query = x.text[lang];
      const base = { id: x.id, lang, kind: x.kind, ...(x.row ? { row: x.row } : {}), audience: x.audience };
      const needed = [
        ...x.expect,
        ...(x.withContext ?? []).flatMap((c) => c.expect),
        ...(x.withoutContext?.expectAll ?? []),
      ];
      const missing = [...new Set(needed.map(pageOf))].filter((p) => !written(lang, p));
      const pending = x.kind === 'question' ? !x.expect.some((r) => written(lang, r)) : missing.length > 0;
      const filters = { ...(x.context ? { context: x.context } : {}), ...(x.version ? { version: x.version } : {}) };
      const results = search(query, lang, filters);
      const first = results[0];
      const common = { ...base, ...(first ? { first: first.ref } : {}), empty: results.length === 0 };
      if (pending) {
        outcomes.push({ ...common, status: 'pending', why: [`not written in ${lang} yet: ${missing.join(', ')}`] });
        continue;
      }
      if (x.kind === 'question') {
        const top = results.slice(0, 3);
        const inTop3 = top.some((r) => x.expect.some((d) => lands(r, d)));
        const firstHit = !!first && x.expect.some((d) => lands(first, d));
        const hit = x.top1 ? firstHit : inTop3;
        outcomes.push({
          ...common,
          status: hit ? 'hit' : 'miss',
          top1: firstHit,
          ...(x.top1 ? { top1Required: true } : {}),
          why: hit
            ? []
            : [
                !results.length
                  ? 'the explicit empty result'
                  : x.top1 && inTop3
                    ? `first: ${instead(first!, x.expect)} (this one must come first)`
                    : `top 3: ${top.map((r) => instead(r, x.expect)).join(', ')}`,
              ],
        });
        continue;
      }
      const why: string[] = [];
      if (first && x.expectNotFirst?.some((d) => lands(first, d))) why.push(`${first.ref} comes first`);
      if (x.row === 'absent-feature' && first && !x.expect.some((d) => lands(first, d)))
        why.push(
          `a neighbour comes first (${instead(first, x.expect)}), neither ${x.expect.join(', ')} nor the empty result`,
        );
      if (x.row === 'old-version') {
        const current = results.filter((r) => x.expect.some((d) => lands(r, d) || nearly(r, d)));
        if (current.length) why.push(`${current[0]!.ref} shows as current for ${x.version}`);
        const all = search(query, lang, { ...filters, includeArchived: true }).slice(0, 3);
        const found = all.find((r) => x.expect.some((d) => lands(r, d)));
        if (!found) why.push(`with includeArchived, ${x.expect.join(', ')} is not in the top 3`);
        else {
          const marks = [
            ...(found.notApplicable ? ['notApplicable'] : []),
            ...(found.status === 'archived' ? ['archived'] : []),
          ];
          if (!x.expectStatus!.some((s) => marks.includes(s)))
            why.push(`with includeArchived, ${found.ref} is not marked ${x.expectStatus!.join(' or ')}`);
        }
      }
      for (const c of x.withContext ?? []) {
        const top = search(query, lang, { ...(x.version ? { version: x.version } : {}), context: c.context })[0];
        if (!top) why.push(`with context ${c.context}: the empty result`);
        else if (!c.expect.some((d) => lands(top, d)))
          why.push(`with context ${c.context}: ${instead(top, c.expect)} comes first, not ${c.expect.join(', ')}`);
        else if (c.expectNotFirst?.some((d) => lands(top, d)))
          why.push(`with context ${c.context}: ${top.ref} comes first`);
      }
      if (x.withoutContext) {
        const plain = search(query, lang, x.version ? { version: x.version } : {});
        for (const d of x.withoutContext.expectAll) {
          const r = plain.find((y) => lands(y, d));
          if (!r) {
            why.push(`without context: ${d} is not in the results`);
            continue;
          }
          const names = x.withoutContext.names?.[pageOf(d)];
          if (names && !names.some((n) => fold(r.snippet).includes(fold(n))))
            why.push(`without context: the excerpt of ${r.ref} names none of ${names.join(', ')}`);
        }
      }
      outcomes.push({ ...common, status: why.length ? 'fail' : 'pass', why });
    }
  const qs = outcomes.filter((o) => o.kind === 'question');
  const ces = outcomes.filter((o) => o.kind === 'counter-example');
  const empties = outcomes.filter((o) => o.status !== 'pending' && o.empty);
  // Justified: an absent feature's empty answer, or an old procedure the version filter rightly left out.
  const justified = empties.filter(
    (o) => o.status === 'pass' && (o.row === 'old-version' || q.questions.find((x) => x.id === o.id)?.expectEmpty),
  );
  const hits = qs.filter((o) => o.status === 'hit').length;
  const qEval = qs.filter((o) => o.status !== 'pending').length;
  const firstHits = qs.filter((o) => o.status !== 'pending' && o.top1).length;
  const required = qs.filter((o) => o.status !== 'pending' && o.top1Required);
  const passes = ces.filter((o) => o.status === 'pass').length;
  const cEval = ces.filter((o) => o.status !== 'pending').length;
  return {
    outcomes,
    questions: {
      runs: qs.length,
      pending: qs.length - qEval,
      evaluated: qEval,
      hits,
      top3: ratio(hits, qEval),
      firstHits,
      top1: ratio(firstHits, qEval),
      top1Required: { evaluated: required.length, hits: required.filter((o) => o.status === 'hit').length },
    },
    counterExamples: {
      runs: ces.length,
      pending: ces.length - cEval,
      evaluated: cEval,
      passes,
      rate: ratio(passes, cEval),
    },
    empties: { evaluated: empties.length, justified: justified.length, rate: ratio(justified.length, empties.length) },
  };
}

const pct = (r: number | null) => (r === null ? 'n/a' : `${Math.round(r * 1000) / 10} %`);

/** The report as a person reads it: one line per run, the three measures, then how to read them. */
export function acceptanceLines(r: AcceptanceReport): string[] {
  const rows = r.outcomes.map((o) => [
    o.id,
    o.lang,
    o.kind === 'question' ? o.audience : `${o.audience}, ${o.row}`,
    o.status,
    o.first ?? (o.empty ? '(empty)' : ''),
    o.why.join('; '),
  ]);
  const head = ['question', 'lang', 'audience', 'status', 'first result', 'why'];
  const width = head.map((h, i) => Math.min(48, Math.max(h.length, ...rows.map((x) => x[i]!.length))));
  const line = (cells: string[]) =>
    cells
      .map((c, i) => (i === cells.length - 1 ? c : c.padEnd(width[i]!)))
      .join('  ')
      .trimEnd();
  return [
    line(head),
    line(width.map((w) => '-'.repeat(w))),
    ...rows.map(line),
    '',
    `questions        ${r.questions.runs} runs: ${r.questions.hits} hits, ${r.questions.evaluated - r.questions.hits} missed, ${r.questions.pending} pending · top 3: ${pct(r.questions.top3)} of those evaluated`,
    `first result     ${r.questions.firstHits} of ${r.questions.evaluated} evaluated put a destination first · top 1: ${pct(r.questions.top1)}; of the ${r.questions.top1Required.evaluated} that must come first, ${r.questions.top1Required.hits} do`,
    `counter-examples ${r.counterExamples.runs} runs: ${r.counterExamples.passes} with no inapplicable answer first, ${r.counterExamples.evaluated - r.counterExamples.passes} failed, ${r.counterExamples.pending} pending · ${pct(r.counterExamples.rate)}`,
    `empty results    ${r.empties.evaluated} among the runs evaluated, ${r.empties.justified} justified · ${pct(r.empties.rate)}`,
    '',
    'legend: a destination id#section is found only at that section, a bare page id at any of its sections;',
    'a hit is a destination in the top 3, or first for a question marked top1 (a clear symptom, a name typed whole);',
    "neither measure says the answer is understood or can be followed: that is level 2 and the people's passes;",
    `${PENDING_RULE}.`,
  ];
}

// ------------------------------------------------------------------------------------------------- level 2

const CONTEXT_WORDS: Record<string, string> = {
  'engine-repo': 'a clone of the engine repository (quest-n-click itself)',
  'created-project': 'a game project made with create-quest-n-click',
  'studio-local': 'the local Studio, on their own machine',
  'studio-demo': 'the demo Studio, in a browser',
  'studio-hosted': "a team's hosted Studio (the Studio Server)",
  bridge: 'the Reality Bridge or one of its connectors',
  player: 'playing a published game',
};

/** The two folders of an export: what the answering agent gets, and what only the grader reads. */
const PROMPTS_DIR = 'prompts';
const GRADING_DIR = 'grading';

/**
 * Level 2's prompts (docs/dev/acceptance/AI-PROTOCOL.md). The questions are numbered `q01`, `q02`… in the order of
 * their ids, so a number is stable while the set is and says nothing of the answer. `<dir>/prompts/` is all the
 * answering agent gets: one Markdown file per number and language (the question, the reader's situation, the rules of
 * the run) and `prompts.json`, the list by number. `<dir>/grading/key.json`, which the grader reads and the agent never
 * gets, maps each number back to its question id. A folder that holds anything but a previous export is refused.
 */
export function exportPrompts(
  q: Questions,
  dir: string,
  o: { langs?: readonly DocsLang[]; channel?: 'mcp' | 'web'; url?: string } = {},
): string[] {
  const langs = o.langs ?? LANGS;
  const channel = o.channel ?? 'mcp';
  if (existsSync(dir)) {
    const names = readdirSync(dir);
    if (names.some((n) => n !== PROMPTS_DIR && n !== GRADING_DIR))
      throw new Error(
        `${dir} is not empty and holds more than a previous export (${PROMPTS_DIR}/, ${GRADING_DIR}/): choose an empty folder`,
      );
    for (const n of names) rmSync(join(dir, n), { recursive: true, force: true });
  }
  mkdirSync(join(dir, PROMPTS_DIR), { recursive: true });
  mkdirSync(join(dir, GRADING_DIR), { recursive: true });
  const tools =
    channel === 'mcp'
      ? 'ONLY the documentation tools of the quest-n-click MCP server: `search_docs`, `list_docs` and `read_doc` (read by `id` and `section`). No other tool: no file reading, no shell, no web search.'
      : `ONLY the public documentation at ${o.url ?? '<the public URL of the documentation>'} and the pages it links to. No other site, no search engine, no repository checkout.`;
  const sorted = [...q.questions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const width = Math.max(2, String(sorted.length).length);
  const files: string[] = [];
  const list: { n: string; lang: DocsLang; file: string }[] = [];
  const key: { n: string; id: string }[] = [];
  sorted.forEach((x, i) => {
    const n = `q${String(i + 1).padStart(width, '0')}`;
    key.push({ n, id: x.id });
    for (const lang of langs) {
      const situation = [
        ...(x.context ? [`- They work in ${CONTEXT_WORDS[x.context]}.`] : []),
        ...(x.version ? [`- Their quest'n'click version is ${x.version}.`] : []),
      ];
      const body = [
        `# Documentation question ${n} (${lang})`,
        '',
        `You are a fresh assistant. A quest'n'click user (${x.audience}) asks you the question below. Answer it using ${tools}`,
        '',
        '## The question',
        '',
        `> ${x.text[lang]}`,
        '',
        ...(situation.length ? ['## What you know of their situation', '', ...situation, ''] : []),
        '## How to answer',
        '',
        `- Answer in ${lang === 'fr' ? 'French' : 'English'}, as you would to that user: short, exact, the commands with the folder they run in.`,
        '- Say for which versions and in which context (engine repository, created project, local or hosted Studio, Bridge) your answer holds.',
        '- If the documentation does not answer, or the thing asked does not exist, say so plainly: do not guess, and do not answer a neighbouring question instead.',
        '- End with a list `Sources:` of every page and section you relied on, as `id#section` (or the URL with its anchor).',
        '',
      ].join('\n');
      const file = `${n}.${lang}.md`;
      writeFileSync(join(dir, PROMPTS_DIR, file), body);
      files.push(`${PROMPTS_DIR}/${file}`);
      list.push({ n, lang, file });
    }
  });
  writeFileSync(
    join(dir, PROMPTS_DIR, 'prompts.json'),
    `${JSON.stringify({ format: 'quest-n-click-docs-acceptance-prompts', version: 1, channel, prompts: list }, null, 2)}\n`,
  );
  writeFileSync(
    join(dir, GRADING_DIR, 'key.json'),
    `${JSON.stringify({ format: 'quest-n-click-docs-acceptance-key', version: 1, questions: key }, null, 2)}\n`,
  );
  return [...files, `${PROMPTS_DIR}/prompts.json`, `${GRADING_DIR}/key.json`];
}
