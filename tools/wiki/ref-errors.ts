// The error register (`reference.error-codes`, lot B11): the codes and messages the product answers with, extracted
// where the code gives them a structure, each code described in English and in French in `wiki/data/errors.json`:
//   - the Studio's API (the dev server, the Studio Server): every `new StudioError(<message>, <status>)` of
//     studio-server/src and tools/studio, by HTTP status, its literal messages listed (a computed one is counted);
//   - the Reality Bridge: every `new BridgeError(<status>, '<code>', <message>)` of bridge/src, by status and code;
//   - the solver's statuses (src/engine/tools/status.ts: `SolveStatus`, `ProofStatus`), with the exit code `exitOf` gives;
//   - the exit codes of the commands that check a game (validate, solve, doctor…), each named in the data with its
//     file, which must hold it.
// A status, a code or a solver status the code has and the data does not describe, or one described the code no longer
// has, is a problem. The messages are the code's, in English: an API answers in English whatever the page's language.
import { z } from 'zod';
import { exitOf, type ProofStatus } from '../../src/engine/tools/status';
import {
  bilingual,
  cell,
  code,
  colon,
  prose,
  duplicateAnchors,
  type GenContext,
  type GenResult,
  type Generator,
  type Lang,
  readData,
  repoLink,
  source,
} from './generated';

const FILE = 'data/errors.json';
const ERRORS_PAGE = 'reference.error-codes';
const STATUS_FILE = 'src/engine/tools/status.ts';

const Schema = z
  .object({
    format: z.literal('quest-n-click-docs-errors'),
    version: z.literal(1),
    studio: z.array(z.object({ status: z.number().int().min(400).max(599), description: bilingual(1600) }).strict()),
    bridge: z.array(
      z
        .object({
          status: z.number().int().min(400).max(599),
          code: z.string().regex(/^[a-z_-]+$/),
          description: bilingual(1600),
        })
        .strict(),
    ),
    solver: z.array(z.object({ status: z.string().regex(/^[a-z_]+$/), description: bilingual(1200) }).strict()),
    exits: z.array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
          command: z.string().min(1),
          file: z.string().min(1),
          codes: z.array(z.object({ code: z.number().int().min(0).max(255), description: bilingual(1200) }).strict()),
        })
        .strict(),
    ),
  })
  .strict();
type Data = z.infer<typeof Schema>;

export interface Raised {
  status: number;
  /** The Bridge's code; '' for the Studio. */
  code: string;
  /** The literal message, a template's `${…}` written `…`; undefined when computed. */
  message?: string;
  file: string;
}

/** The end of a string literal opened at `i` (its quote), template substitutions skipped; -1 if unclosed. */
function literalEnd(s: string, i: number): number {
  const q = s[i]!;
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j]!;
    if (c === '\\') j++;
    else if (c === q) return j;
    else if (q === '`' && c === '$' && s[j + 1] === '{') {
      let depth = 0;
      for (j++; j < s.length; j++) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}' && --depth === 0) break;
      }
    }
  }
  return -1;
}

/** A literal's text: quotes off, escapes read, a substitution written `…`. */
const literalText = (lit: string) =>
  lit
    .slice(1, -1)
    .replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, '…')
    .replace(/\\(.)/g, '$1')
    .replace(/\s+/g, ' ');

/** Reads `<literal>` at `i` (after spaces): its text and end, or undefined. */
function literalAt(s: string, i: number): { text: string; end: number } | undefined {
  while (/\s/.test(s[i] ?? '')) i++;
  if (!/['"`]/.test(s[i] ?? '')) return undefined;
  const end = literalEnd(s, i);
  return end < 0 ? undefined : { text: literalText(s.slice(i, end + 1)), end: end + 1 };
}

/** The Studio's errors of one file: `new StudioError(message[, status])`, 400 when no status is given. */
export function studioErrors(file: string, text: string): Raised[] {
  const out: Raised[] = [];
  for (const m of text.matchAll(/new StudioError\(/g)) {
    const at = m.index + m[0].length;
    const lit = literalAt(text, at);
    const rest = text.slice(lit ? lit.end : at);
    const status = lit
      ? /^\s*(?:,\s*(\d{3})\s*,?\s*)?\)/.exec(rest)
      : /^[^;]*?,\s*(\d{3})\s*\)/.exec(rest.split('\n').slice(0, 3).join('\n'));
    if (lit && !status) continue; // a message built with `+`: counted below as computed
    out.push({ status: Number(status?.[1] ?? 400), code: '', message: lit?.text, file });
  }
  return out;
}

/** The Bridge's errors of one file: `new BridgeError(<status>, '<code>', <message>)`. */
export function bridgeErrors(file: string, text: string): Raised[] {
  const out: Raised[] = [];
  for (const m of text.matchAll(/new BridgeError\(\s*(\d{3}),\s*'([a-z_-]+)',/g)) {
    const lit = literalAt(text, m.index + m[0].length);
    out.push({ status: Number(m[1]), code: m[2]!, message: lit?.text, file });
  }
  return out;
}

const TS = /\.ts$/;
const NOT_TEST = (f: string) => !/\.test\.ts$/.test(f) && !f.includes('/test/');

/** Every error the code raises with a structure, from the tracked files. */
function raisedErrors(root: string, tracked: readonly string[]): { studio: Raised[]; bridge: Raised[] } {
  const studio: Raised[] = [];
  const bridge: Raised[] = [];
  for (const f of tracked.filter((x) => TS.test(x) && NOT_TEST(x))) {
    if (f.startsWith('studio-server/src/') || f.startsWith('tools/studio/'))
      studio.push(...studioErrors(f, source(root, f)));
    if (f.startsWith('bridge/src/')) bridge.push(...bridgeErrors(f, source(root, f)));
  }
  return { studio, bridge };
}

/** The solver's statuses as status.ts declares them (`SolveStatus` and `ProofStatus`'s own). */
export function solverStatuses(root: string): string[] {
  const text = source(root, STATUS_FILE);
  const of = (name: string) =>
    [...(new RegExp(`export type ${name} = ([^;]+);`).exec(text)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map(
      (m) => m[1]!,
    );
  return [...of('SolveStatus'), ...of('ProofStatus')];
}

function problems(root: string, d: Data, raised: ReturnType<typeof raisedErrors>): string[] {
  const out: string[] = [];
  const studio = new Set(raised.studio.map((r) => r.status));
  const described = new Set(d.studio.map((s) => s.status));
  for (const s of studio)
    if (!described.has(s))
      out.push(`${FILE}: the Studio answers ${s} (StudioError) and the register does not describe it`);
  for (const s of described)
    if (!studio.has(s)) out.push(`${FILE}: the Studio no longer raises a StudioError with ${s}: remove it`);
  const key = (r: { status: number; code: string }) => `${r.status} ${r.code}`;
  const bridge = new Set(raised.bridge.map(key));
  const bridgeDescribed = new Set(d.bridge.map(key));
  for (const k of bridge)
    if (!bridgeDescribed.has(k))
      out.push(`${FILE}: the Bridge answers ${k} (BridgeError) and the register does not describe it`);
  for (const k of bridgeDescribed) if (!bridge.has(k)) out.push(`${FILE}: the Bridge no longer raises ${k}: remove it`);
  const statuses = solverStatuses(root);
  for (const s of statuses)
    if (!d.solver.some((x) => x.status === s)) out.push(`${FILE}: the solver status ${s} is not described`);
  for (const s of d.solver)
    if (!statuses.includes(s.status)) out.push(`${FILE}: ${STATUS_FILE} has no status ${s.status} any more`);
  for (const e of d.exits) {
    const text = source(root, e.file);
    if (!text) out.push(`${FILE}: ${e.id} names ${e.file}, which is not there`);
    for (const c of e.codes)
      if (c.code > 1 && !new RegExp(`(exit\\(|exitCode = |return |: |\\? )${c.code}\\b`).test(text))
        out.push(`${FILE}: ${e.id}: the exit code ${c.code} appears nowhere in ${e.file}`);
  }
  return out;
}

const W = {
  en: {
    studio: 'Studio API (dev server and Studio Server)',
    studioIntro:
      'Every refusal the Studio raises as a `StudioError`, by HTTP status. The answer is JSON, `{ "error": "<message>" }` (sometimes with more fields); the messages below are the code\'s, in English. `…` stands for a part filled at run time.',
    bridge: 'Reality Bridge',
    bridgeIntro:
      'Every refusal the Bridge raises as a `BridgeError`, by HTTP status and code. The answer is JSON, `{ "error": "<code>", "message": "<message>" }`.',
    solver: 'Solver statuses',
    solverIntro: `The one status of a solver run or of a proof by chapters (${repoLink(STATUS_FILE)}): the command line, its \`--json\`, the Studio's Check tab and the MCP \`solve\` tool all read it.`,
    exits: 'Exit codes of the checking commands',
    exitsIntro: 'What a script or a CI job reads after the command.',
    messages: 'Messages',
    computed: (n: number) => `and ${n} message(s) built at run time`,
    status: 'Status',
    exit: 'Exit code',
    command: 'Command',
    code: 'Code',
    means: 'Means',
  },
  fr: {
    studio: 'API du Studio (serveur de dev et Studio Server)',
    studioIntro:
      'Chaque refus que le Studio lève en `StudioError`, par statut HTTP. La réponse est du JSON, `{ "error": "<message>" }` (parfois avec d’autres champs) ; les messages ci-dessous sont ceux du code, en anglais. `…` tient la place d’une partie remplie à l’exécution.',
    bridge: 'Reality Bridge',
    bridgeIntro:
      'Chaque refus que le Bridge lève en `BridgeError`, par statut HTTP et code. La réponse est du JSON, `{ "error": "<code>", "message": "<message>" }`.',
    solver: 'Statuts du solveur',
    solverIntro: `Le statut unique d’une recherche du solveur ou d’une preuve par chapitres (${repoLink(STATUS_FILE)}) : la ligne de commande, son \`--json\`, l’onglet Vérifier du Studio et l’outil MCP \`solve\` le lisent tous.`,
    exits: 'Codes de sortie des commandes de vérification',
    exitsIntro: 'Ce qu’un script ou un job de CI lit après la commande.',
    messages: 'Messages',
    computed: (n: number) => `et ${n} message(s) construit(s) à l’exécution`,
    status: 'Statut',
    exit: 'Code de sortie',
    command: 'Commande',
    code: 'Code',
    means: 'Signifie',
  },
} as const;

/** The messages of some raised errors: each literal once, with the files that raise it, sorted. */
function messageLines(rs: Raised[], lang: Lang): string[] {
  const w = W[lang];
  const by = new Map<string, Set<string>>();
  let computed = 0;
  for (const r of rs) {
    if (r.message === undefined) {
      computed++;
      continue;
    }
    by.set(r.message, (by.get(r.message) ?? new Set()).add(r.file));
  }
  const out = [...by.keys()].sort().map((m) => `- ${code(m)} (${[...by.get(m)!].sort().map(repoLink).join(', ')})`);
  if (computed) out.push(`- ${w.computed(computed)}.`);
  return out.length ? [`${w.messages}${colon(lang).trimEnd()}`, '', ...out, ''] : [];
}

function sections(d: Data, raised: ReturnType<typeof raisedErrors>, lang: Lang): string {
  const w = W[lang];
  const out: string[] = ['<a name="studio"></a>', '', `## ${w.studio}`, '', w.studioIntro, ''];
  for (const s of [...d.studio].sort((a, b) => a.status - b.status)) {
    out.push(`<a name="studio-${s.status}"></a>`, '', `### ${s.status}`, '', prose(s.description[lang]), '');
    out.push(
      ...messageLines(
        raised.studio.filter((r) => r.status === s.status),
        lang,
      ),
    );
  }
  out.push('<a name="bridge"></a>', '', `## ${w.bridge}`, '', w.bridgeIntro, '');
  const bridge = [...d.bridge].sort((a, b) => a.status - b.status || (a.code < b.code ? -1 : 1));
  for (const b of bridge) {
    out.push(
      `<a name="bridge-${b.status}-${b.code}"></a>`,
      '',
      `### ${b.status} ${code(b.code)}`,
      '',
      prose(b.description[lang]),
      '',
    );
    out.push(
      ...messageLines(
        raised.bridge.filter((r) => r.status === b.status && r.code === b.code),
        lang,
      ),
    );
  }
  out.push('<a name="solver"></a>', '', `## ${w.solver}`, '', w.solverIntro, '');
  out.push(`| ${w.status} | ${w.exit} | ${w.means} |`, '|---|---|---|');
  for (const s of d.solver)
    out.push(`| ${code(s.status)} | ${exitOf(s.status as ProofStatus)} | ${cell(prose(s.description[lang]))} |`);
  out.push('', '<a name="exits"></a>', '', `## ${w.exits}`, '', w.exitsIntro, '');
  for (const e of d.exits) {
    out.push(`<a name="exit-${e.id}"></a>`, '', `### ${code(e.command)}`, '', `${repoLink(e.file)}.`, '');
    out.push(`| ${w.code} | ${w.means} |`, '|---|---|');
    for (const c of e.codes) out.push(`| ${c.code} | ${cell(prose(c.description[lang]))} |`);
    out.push('');
  }
  return out.join('\n');
}

export const errorsGenerator: Generator = {
  page: ERRORS_PAGE,
  data: FILE,
  build({ root, wikiDir, tracked }: GenContext): GenResult {
    const r = readData(wikiDir, FILE, Schema);
    if (!r.data) return { problems: r.errors };
    const raised = raisedErrors(root, tracked);
    const en = sections(r.data, raised, 'en');
    return {
      sections: { en, fr: sections(r.data, raised, 'fr') },
      problems: [...problems(root, r.data, raised), ...duplicateAnchors(ERRORS_PAGE, en)],
    };
  },
};
