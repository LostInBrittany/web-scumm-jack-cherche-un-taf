// The environment variable register (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.7.4, demonstrator D2 of §13):
// `wiki/data/env.json` describes, in English and in French, every variable the product's code reads, and the ones a
// platform or an add-on injects; the reference page `reference.environment-variables` is generated from it and from
// the code, so a variable added to the code without a description, or a described one the code no longer reads, fails
// `npm run wiki -- check` rather than drifting.
//
// What the scan reads, in the files git tracks (tests/ and vendored code left out):
//   - code (`.ts`, `.tsx`, `.mts`, `.js`, `.mjs`, `.cjs`): `process.env.X`, `process.env['X']`, `import.meta.env.X`
//     (Vite, read at build time), and `env.X` / `env['X']` on an object named `env` (the functions that take
//     `env = process.env`), a name starting with a capital there. An assignment (`env.X = …`) sets a child's
//     variable: it is not a read. A read whose name is computed (`process.env[name]`, `env[\`${n}_FILE\`]`) is a
//     dynamic read: the register lists each one with the names it reads, resolved by a person, and the check fails
//     on one it does not list;
//   - Python (`os.environ.get('X')`, `os.environ['X']`, `os.getenv('X')`): the asset tools;
//   - shell and deployment files (`*.sh`, `ops/**/*.yml`, `clevercloud/**`): `$X` and `${X…}` in capitals, minus the
//     names the script assigns itself.
// An entry whose origin is `platform` or `add-on` may be read nowhere in the code (Clever Cloud reads `CC_RUN_COMMAND`
// itself): it says who sets it. An entry `code` or `build` the scan no longer finds is an error: the code moved on.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { globToRegExp } from '../ci-plan';
import { issuesOf } from './manifest';

const ENV_FORMAT = 'quest-n-click-docs-env';
const ENV_FILE = 'data/env.json';
/** The page the register generates. */
export const ENV_PAGE = 'reference.environment-variables';
const BEGIN = '<!-- env:begin -->';
const END = '<!-- env:end -->';
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const bilingual = z
  .object({
    en: z.string().trim().min(1).max(600),
    fr: z.string().trim().min(1).max(600),
  })
  .strict();

const EnvSchema = z
  .object({
    format: z.literal(ENV_FORMAT),
    version: z.literal(1),
    groups: z.array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
          title: bilingual,
          intro: bilingual,
        })
        .strict(),
    ),
    variables: z.array(
      z
        .object({
          name: z.string().regex(NAME),
          group: z.string(),
          /**
           * Where its value comes from: `code`, you set it and the code reads it at run time; `build`, read when the
           * page or package is built (Vite); `platform`, set by the platform the program runs on (Clever Cloud, GitHub
           * Actions, npm, the system); `add-on`, injected by a Clever Cloud add-on linked to the app; `ci`, set and read
           * by the workflows of `.github/workflows/` (their `env:` blocks, `${{ env.X }}`, their shell).
           */
          origin: z.enum(['code', 'build', 'platform', 'add-on', 'ci']),
          /**
           * Who sets it: required for `platform` and `add-on` (Clever Cloud, the PostgreSQL add-on, GitHub Actions…);
           * for `code` or `build`, a script or a command of the product that sets it, so a reader knows not to.
           */
          setBy: z
            .object({
              en: z.string().trim().min(1).max(80),
              fr: z.string().trim().min(1).max(80),
            })
            .strict()
            .optional(),
          /** A secret: read once, removed from the environment; never logged. */
          secret: z.literal(true).optional(),
          /** Also read from the file `<name>_FILE` names (mode 0600). */
          fileVariant: z.literal(true).optional(),
          /** Read in place of another variable when that one is absent (an add-on's own name). */
          aliasOf: z.string().regex(NAME).optional(),
          description: bilingual,
        })
        .strict(),
    ),
    /** The reads whose name is computed, each resolved by a person: the file, the expression, the names it reads. */
    dynamic: z.array(
      z
        .object({
          file: z.string(),
          expression: z.string(),
          reads: z.array(z.string().regex(NAME)).min(1),
          note: z.string().trim().min(1),
        })
        .strict(),
    ),
  })
  .strict();
export type EnvRegister = z.infer<typeof EnvSchema>;
type Variable = EnvRegister['variables'][number];

/** `<wiki>/data/env.json`, or undefined when the folder has none (a test's fixture), or what is wrong with it. */
export function readEnvRegister(wikiDir: string): {
  register?: EnvRegister;
  errors: string[];
} {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resolve(wikiDir, ENV_FILE), 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { errors: [] };
    return { errors: [`${ENV_FILE}: ${(e as Error).message}`] };
  }
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) return { errors: issuesOf(parsed.error).map((l) => `${ENV_FILE} ${l}`) };
  return { register: parsed.data, errors: [] };
}

// ------------------------------------------------------------------------------------------------- the scan

export interface EnvUse {
  name: string;
  file: string;
  line: number;
}
export interface DynamicUse {
  file: string;
  line: number;
  expression: string;
}

const CODE = /\.(ts|tsx|mts|js|mjs|cjs)$/;
const PYTHON = /\.py$/;
const SHELL = [/\.sh$/, globToRegExp('ops/**/*.yml'), globToRegExp('clevercloud/**')];
const WORKFLOW = globToRegExp('.github/workflows/*.yml');
const LEFT_OUT = [globToRegExp('tests/**'), globToRegExp('**/vendor/**')];

/** The reads of one code file: named ones, and computed ones. */
export function scanCode(file: string, text: string): { uses: EnvUse[]; dynamic: DynamicUse[] } {
  const uses: EnvUse[] = [];
  const dynamic: DynamicUse[] = [];
  const lines = text.split('\n');
  lines.forEach((l, i) => {
    const line = i + 1;
    // A comment line names variables without reading them (this file's own comments do).
    if (/^\s*(\/\/|\/?\*)/.test(l)) return;
    const add = (name: string, index: number, length: number) => {
      // `env.X = …` sets a child's variable and `delete env.X` clears it; `==`, `??=` and `||=` read it.
      if (/^\s*=(?!=)/.test(l.slice(index + length))) return;
      if (/\bdelete\s+$/.test(l.slice(0, index))) return;
      uses.push({ name, file, line });
    };
    for (const m of l.matchAll(/\bprocess\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) add(m[1]!, m.index, m[0].length);
    for (const m of l.matchAll(/\bimport\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) add(m[1]!, m.index, m[0].length);
    // An object named `env` (the functions that take `env = process.env`): a name starting with a capital.
    for (const m of l.matchAll(/(?<![.\w])env\.([A-Z][A-Za-z0-9_]*)/g)) add(m[1]!, m.index, m[0].length);
    for (const m of l.matchAll(/(?<![\w])(?:process\.env|env)\[\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1\s*\]/g))
      add(m[2]!, m.index, m[0].length);
    for (const m of l.matchAll(/(?<![\w])(?:process\.env|env)\[\s*([^\]'"\s][^\]]*)\]/g))
      dynamic.push({ file, line, expression: m[0] });
  });
  // Destructuring: `const { A, B: b, C = 'x', ...rest } = process.env` reads A, B and C (a rest is a dynamic read).
  const code = lines.map((l) => (/^\s*(\/\/|\/?\*)/.test(l) ? '' : l)).join('\n');
  for (const m of code.matchAll(/\{([^{}]*)\}\s*=\s*process\.env\b/g)) {
    const line = code.slice(0, m.index).split('\n').length;
    for (const part of m[1]!.split(',')) {
      const t = part.trim();
      if (!t) continue;
      if (t.startsWith('...')) dynamic.push({ file, line, expression: `{ ${t} } = process.env` });
      else {
        const name = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(t)?.[1];
        if (name) uses.push({ name, file, line });
      }
    }
  }
  return { uses, dynamic };
}

/** The reads of one Python file. */
export function scanPython(file: string, text: string): EnvUse[] {
  const uses: EnvUse[] = [];
  text.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/\bos\.(?:environ\.get|getenv)\(\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1/g))
      uses.push({ name: m[2]!, file, line: i + 1 });
    for (const m of l.matchAll(/\bos\.environ\[\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1\s*\]/g))
      uses.push({ name: m[2]!, file, line: i + 1 });
  });
  return uses;
}

/** The variables a shell script or a deployment file reads: `$X`, `${X…}` in capitals, minus those it assigns. */
export function scanShell(file: string, text: string): EnvUse[] {
  const own = new Set(
    [...text.matchAll(/^\s*(?:export\s+|local\s+|readonly\s+)?([A-Z_][A-Z0-9_]*)=/gm)].map((m) => m[1]!),
  );
  const uses: EnvUse[] = [];
  text.split('\n').forEach((l, i) => {
    if (/^\s*#/.test(l)) return;
    for (const m of l.matchAll(/\$\{?([A-Z_][A-Z0-9_]*)/g))
      if (!own.has(m[1]!) && !(l[m.index - 1] === '$')) uses.push({ name: m[1]!, file, line: i + 1 });
  });
  return uses;
}

/**
 * The variables a GitHub workflow names: the keys of its `env:` blocks, `${{ env.X }}`, the `X=…` it appends to
 * `$GITHUB_ENV`, and what its shell reads (`$X`, `${X}` in capitals, minus what it assigns). All are the CI's.
 */
export function scanWorkflow(file: string, text: string): EnvUse[] {
  const uses: EnvUse[] = [];
  const lines = text.split('\n');
  lines.forEach((l, i) => {
    const block = /^(\s*)env:\s*$/.exec(l);
    if (!block) return;
    const indent = block[1]!.length;
    for (let j = i + 1; j < lines.length; j++) {
      const k = lines[j]!;
      if (!k.trim() || /^\s*#/.test(k)) continue;
      const at = k.length - k.trimStart().length;
      if (at <= indent) break;
      const key = /^\s*([A-Za-z_][A-Za-z0-9_]*):\s*\S/.exec(k);
      if (key && at === indent + 2) uses.push({ name: key[1]!, file, line: j + 1 });
    }
  });
  lines.forEach((l, i) => {
    for (const m of l.matchAll(/\$\{\{\s*env\.([A-Za-z_][A-Za-z0-9_]*)/g))
      uses.push({ name: m[1]!, file, line: i + 1 });
    for (const m of l.matchAll(/\b([A-Z_][A-Z0-9_]*)=[^\n]*>>\s*"?\$GITHUB_ENV/g))
      uses.push({ name: m[1]!, file, line: i + 1 });
  });
  // `${{ … }}` is the workflow's own expression language, not the shell's: left out before the shell is read.
  return [...uses, ...scanShell(file, text.replace(/\$\{\{[^}]*\}\}/g, ''))];
}

/** Every read of the tracked files under `root`. */
export function scanEnv(root: string, tracked: readonly string[]): { uses: EnvUse[]; dynamic: DynamicUse[] } {
  const uses: EnvUse[] = [];
  const dynamic: DynamicUse[] = [];
  for (const file of tracked) {
    if (LEFT_OUT.some((re) => re.test(file))) continue;
    const kind = CODE.test(file)
      ? 'code'
      : PYTHON.test(file)
        ? 'python'
        : WORKFLOW.test(file)
          ? 'workflow'
          : SHELL.some((re) => re.test(file))
            ? 'shell'
            : '';
    if (!kind) continue;
    let text: string;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue;
    }
    if (kind === 'code') {
      const r = scanCode(file, text);
      uses.push(...r.uses);
      dynamic.push(...r.dynamic);
    } else if (kind === 'python') uses.push(...scanPython(file, text));
    else if (kind === 'workflow') uses.push(...scanWorkflow(file, text));
    else uses.push(...scanShell(file, text));
  }
  return { uses, dynamic };
}

// ------------------------------------------------------------------------------------------------- the check

/**
 * What the register and the code disagree on: a variable read and not described, a `code`/`build` entry read nowhere,
 * a dynamic read not listed or listed and gone, a platform or add-on entry that does not say who sets it, a file
 * variant no dynamic read resolves to, an alias of an unknown variable, a group unknown or empty.
 */
export function envProblems(register: EnvRegister, scan: ReturnType<typeof scanEnv>): string[] {
  const out: string[] = [];
  const byName = new Map<string, Variable>();
  for (const v of register.variables) {
    if (byName.has(v.name)) out.push(`${ENV_FILE}: ${v.name} is described twice`);
    byName.set(v.name, v);
  }
  const groups = new Set(register.groups.map((g) => g.id));
  for (const v of register.variables) {
    if (!groups.has(v.group)) out.push(`${ENV_FILE}: ${v.name}'s group "${v.group}" is not among the groups`);
    if ((v.origin === 'platform' || v.origin === 'add-on') && !v.setBy)
      out.push(`${ENV_FILE}: ${v.name} comes from the ${v.origin}: say who sets it (setBy)`);
    if (v.aliasOf && !byName.has(v.aliasOf))
      out.push(`${ENV_FILE}: ${v.name} is an alias of ${v.aliasOf}, not described`);
  }
  for (const g of register.groups)
    if (!register.variables.some((v) => v.group === g.id)) out.push(`${ENV_FILE}: the group ${g.id} holds no variable`);
  const resolved = new Set(register.dynamic.flatMap((d) => d.reads));
  const read = new Map<string, EnvUse[]>();
  for (const u of scan.uses) read.set(u.name, [...(read.get(u.name) ?? []), u]);
  for (const [name, at] of read)
    if (!byName.has(name))
      out.push(
        `${ENV_FILE}: ${name} is read by ${at[0]!.file}:${at[0]!.line} and has no description: add it to the register (npm run wiki -- env)`,
      );
  for (const v of register.variables)
    if (
      (v.origin === 'code' || v.origin === 'build' || v.origin === 'ci') &&
      !read.has(v.name) &&
      !resolved.has(v.name)
    )
      out.push(
        `${ENV_FILE}: ${v.name} (${v.origin}) is read nowhere in the code any more: remove it, or say who sets it (platform, add-on)`,
      );
  // A secret's file variant is described with the secret (`fileVariant`), not apart.
  for (const name of resolved)
    if (!byName.has(name) && !(name.endsWith('_FILE') && byName.get(name.slice(0, -5))?.fileVariant))
      out.push(`${ENV_FILE}: ${name}, read by a dynamic read, has no description`);
  for (const v of register.variables.filter((x) => x.fileVariant))
    if (!resolved.has(`${v.name}_FILE`) && !read.has(`${v.name}_FILE`))
      out.push(`${ENV_FILE}: ${v.name} says it has a file variant, and nothing reads ${v.name}_FILE`);
  const key = (d: { file: string; expression: string }) => `${d.file} ${d.expression}`;
  const listed = new Set(register.dynamic.map(key));
  for (const d of scan.dynamic)
    if (!listed.has(key(d)))
      out.push(
        `${ENV_FILE}: ${d.file}:${d.line} reads a computed name (${d.expression}): list it in "dynamic" with the names it reads`,
      );
  const found = new Set(scan.dynamic.map(key));
  for (const d of register.dynamic)
    if (!found.has(key(d))) out.push(`${ENV_FILE}: the dynamic read ${d.expression} of ${d.file} is gone: remove it`);
  return out;
}

// ------------------------------------------------------------------------------------------------- the page

/** A variable's section id: its name in lowercase kebab case (`STUDIO_SESSION_KEY` → `studio-session-key`). */
export const envAnchor = (name: string) =>
  name
    .toLowerCase()
    .replace(/_+/g, '-')
    .replace(/^-+|-+$/g, '');

const ORIGIN = {
  en: {
    code: 'you set it; the code reads it',
    build: 'read when the page or the package is built',
    platform: (by: string) => `set by ${by}`,
    'add-on': (by: string) => `injected by ${by}`,
    ci: 'set by a workflow of `.github/workflows/` (CI and releases)',
  },
  fr: {
    code: 'vous la posez ; le code la lit',
    build: 'lue à la construction de la page ou du paquet',
    platform: (by: string) => `posée par ${by}`,
    'add-on': (by: string) => `injectée par ${by}`,
    ci: 'posée par un workflow de `.github/workflows/` (CI et publications)',
  },
} as const;
const WORDS = {
  en: {
    colon: ': ',
    origin: 'Origin',
    secret: 'Secret',
    secretText: 'yes: read once at start, then removed from the environment; never logged',
    fileLabel: 'From a file',
    file: (n: string) => `\`${n}_FILE\` names a file to read it from instead (mode 0600 on Linux and macOS)`,
    alias: (n: string) => `Read in place of \`${n}\` when \`${n}\` is not set`,
    read: 'Read by',
    readNowhere: 'no file of the code; the platform reads it',
    more: (n: number) => `and ${n} more`,
  },
  fr: {
    colon: ' : ',
    origin: 'Origine',
    secret: 'Secret',
    secretText: 'oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée',
    fileLabel: 'Depuis un fichier',
    file: (n: string) => `\`${n}_FILE\` nomme un fichier où la lire à la place (mode 0600 sous Linux et macOS)`,
    alias: (n: string) => `Lue à la place de \`${n}\` quand \`${n}\` n’est pas posée`,
    read: 'Lue par',
    readNowhere: 'aucun fichier du code ; la plateforme la lit',
    more: (n: number) => `et ${n} de plus`,
  },
} as const;

/** The generated part of the page in one language: a section per group, a section per variable. */
export function envSections(register: EnvRegister, scan: ReturnType<typeof scanEnv>, lang: 'en' | 'fr'): string {
  const w = WORDS[lang];
  const files = new Map<string, string[]>();
  for (const u of scan.uses) {
    const list = files.get(u.name) ?? [];
    if (!list.includes(u.file)) list.push(u.file);
    files.set(u.name, list);
  }
  for (const d of register.dynamic)
    for (const n of d.reads) {
      const list = files.get(n) ?? [];
      if (!list.includes(d.file)) list.push(d.file);
      files.set(n, list);
    }
  const out: string[] = [BEGIN, ''];
  for (const g of register.groups) {
    out.push(`<a name="${g.id}"></a>`, '', `## ${g.title[lang]}`, '', g.intro[lang], '');
    const vars = register.variables.filter((v) => v.group === g.id).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const v of vars) {
      const origin =
        v.origin === 'ci'
          ? ORIGIN[lang].ci
          : v.origin === 'code' || v.origin === 'build'
            ? v.setBy
              ? `${ORIGIN[lang].platform(v.setBy[lang])}${v.origin === 'build' ? ` (${ORIGIN[lang].build})` : ''}`
              : ORIGIN[lang][v.origin]
            : ORIGIN[lang][v.origin](v.setBy?.[lang] ?? '?');
      const where = (files.get(v.name) ?? []).sort();
      const shown = where
        .slice(0, 3)
        .map((f) => `[\`${f}\`](../../${f})`)
        .join(', ');
      out.push(`<a name="${envAnchor(v.name)}"></a>`, '', `### \`${v.name}\``, '', v.description[lang], '');
      out.push(`- ${w.origin}${w.colon}${origin}.`);
      if (v.secret) out.push(`- ${w.secret}${w.colon}${w.secretText}.`);
      if (v.fileVariant) out.push(`- ${w.fileLabel}${w.colon}${w.file(v.name)}.`);
      if (v.aliasOf) out.push(`- ${w.alias(v.aliasOf)}.`);
      out.push(
        `- ${w.read}${w.colon}${where.length ? shown + (where.length > 3 ? `, ${w.more(where.length - 3)}` : '') : w.readNowhere}.`,
      );
      out.push('');
    }
  }
  out.push(END);
  return out.join('\n');
}

/** The page with its generated part replaced, or a problem when its markers are not there once each. */
export function withEnvSections(page: string, generated: string): { text?: string; problem?: string } {
  const a = page.indexOf(BEGIN);
  const b = page.indexOf(END);
  if (a < 0 || b < a || page.indexOf(BEGIN, a + 1) >= 0 || page.indexOf(END, b + 1) >= 0)
    return {
      problem: `the page holds ${BEGIN} … ${END} once, around its generated part`,
    };
  return { text: page.slice(0, a) + generated + page.slice(b + END.length) };
}

/** The variable names, sorted: the page's manifest `identifiers`. */
export const envIdentifiers = (register: EnvRegister) => register.variables.map((v) => v.name).sort();

/**
 * The manifest's text with the reference page's `identifiers` set to the register's names, every other byte kept
 * (the manifest is written by hand). Parsed back and compared, so a layout it does not expect fails loudly.
 */
export function withEnvIdentifiers(manifestText: string, names: readonly string[]): string {
  const lines = manifestText.split('\n');
  const out: string[] = [];
  let id: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const idLine = /^ {6}"id": "([^"]+)",$/.exec(l);
    if (idLine) id = idLine[1];
    const m = /^( {6})"identifiers": (.*)$/.exec(l);
    if (!m || id !== ENV_PAGE) {
      out.push(l);
      continue;
    }
    let end = i;
    if (!/^\[.*\],?$/.test(m[2]!)) while (end < lines.length && !/^ {6}\],?$/.test(lines[end]!)) end++;
    const comma = lines[end]!.endsWith(',') ? ',' : '';
    out.push(
      `${m[1]}"identifiers": [`,
      ...names.map((x, k) => `${m[1]}  ${JSON.stringify(x)}${k < names.length - 1 ? ',' : ''}`),
      `${m[1]}]${comma}`,
    );
    i = end;
  }
  const text = out.join('\n');
  const expected = JSON.parse(manifestText) as { pages: { id: string; identifiers: string[] }[] };
  for (const p of expected.pages) if (p.id === ENV_PAGE) p.identifiers = [...names];
  if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(expected))
    throw new Error(`manifest.json: its layout is not the one expected, ${ENV_PAGE}'s identifiers could not be set`);
  return text;
}

/** The page's generated part is the one the register and the code give, in each language written. */
export function envPageProblems(
  register: EnvRegister,
  scan: ReturnType<typeof scanEnv>,
  pages: Partial<Record<'en' | 'fr', string>>,
  identifiers: readonly string[] | undefined,
): string[] {
  const out: string[] = [];
  for (const lang of ['en', 'fr'] as const) {
    const page = pages[lang];
    if (page === undefined) continue;
    const r = withEnvSections(page, envSections(register, scan, lang));
    if (r.problem) out.push(`${lang}/${ENV_PAGE}.md: ${r.problem}`);
    else if (r.text !== page)
      out.push(`${lang}/${ENV_PAGE}.md: its generated part is not the register's: run \`npm run wiki -- env\``);
  }
  const names = envIdentifiers(register);
  if (identifiers && JSON.stringify([...identifiers].sort()) !== JSON.stringify(names))
    out.push(`manifest.json: ${ENV_PAGE}'s identifiers are not the register's names: run \`npm run wiki -- env\``);
  const anchors = new Map<string, string>();
  for (const id of [...register.groups.map((g) => g.id), ...register.variables.map((v) => envAnchor(v.name))]) {
    if (anchors.has(id)) out.push(`${ENV_FILE}: the section id ${id} is given twice (a group and a variable?)`);
    anchors.set(id, id);
  }
  return out;
}
