// The command-line tools reference (`reference.cli`, lot B11): the six commands quest-n-click installs
// (`quest-n-click`, `create-quest-n-click`, `quest-n-click-bridge`, `quest-n-click-connector`,
// `quest-n-click-studio-server`, `quest-n-click-studio-worker`), their subcommands, options and exit codes, described in
// English and in French in `wiki/data/cli.json`. Where the code lists the subcommands in one place (the `COMMANDS` table
// of cli/quest-n-click.mjs, the Bridge's usage line, the connector ids, the Studio Server's `cmd === '…'` branches),
// a subcommand the code has and the data lacks is a problem; and every subcommand, option and exit code the data names
// must appear in the CLI's source files, so a renamed option is caught.
import { z } from 'zod';
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
  sectionId,
  source,
} from './generated';

const FILE = 'data/cli.json';
const CLI_PAGE = 'reference.cli';

const Schema = z
  .object({
    format: z.literal('quest-n-click-docs-cli'),
    version: z.literal(1),
    clis: z.array(
      z
        .object({
          /** The installed command (`quest-n-click-bridge`). */
          id: z.string().regex(/^[a-z][a-z0-9-]*$/),
          /** Its section id, short (`bridge`); a subcommand's is `<anchor>-<name>` (`bridge-serve`). */
          anchor: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
          /** The npm package that installs it. */
          package: z.string().min(1),
          /** The source files that read its arguments (the check looks for each name there). */
          files: z.array(z.string().min(1)).min(1),
          /** Where it runs: the folder, the machine. */
          where: bilingual(600),
          intro: bilingual(1200),
          /** Options and exit codes every subcommand shares (a connector's `--config`), shown once. */
          options: z.array(z.object({ flag: z.string().min(1), description: bilingual(1200) }).strict()).optional(),
          exits: z
            .array(z.object({ code: z.number().int().min(0).max(255), description: bilingual(600) }).strict())
            .optional(),
          commands: z.array(
            z
              .object({
                /** The subcommand, '' for a command that has none. */
                name: z.string().regex(/^([a-z][a-z0-9-]*)?$/),
                usage: z.string().min(1),
                description: bilingual(2400),
                options: z
                  .array(z.object({ flag: z.string().min(1), description: bilingual(1200) }).strict())
                  .optional(),
                exits: z
                  .array(z.object({ code: z.number().int().min(0).max(255), description: bilingual(600) }).strict())
                  .optional(),
                since: z.string().optional(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();
type Data = z.infer<typeof Schema>;
type Cli = Data['clis'][number];
type Command = Cli['commands'][number];
type Options = Command['options'];
type Exits = Command['exits'];

/** The subcommands a CLI's code lists in one place, or undefined when it has no such list. */
export function listedSubcommands(root: string, id: string): string[] | undefined {
  if (id === 'quest-n-click') {
    const text = source(root, 'cli/quest-n-click.mjs');
    const table = /\nconst COMMANDS = \{\n([\s\S]*?)\n\};/.exec(text)?.[1] ?? '';
    return [...table.matchAll(/^ {2}(?:'([a-z][\w-]*)'|([a-z]\w*)): \[/gm).map((m) => m[1] ?? m[2]!), 'help'];
  }
  if (id === 'quest-n-click-bridge') {
    const m = /usage: quest-n-click-bridge <([a-z|-]+)>/.exec(source(root, 'bridge/src/cli.ts'));
    return m?.[1]!.split('|');
  }
  if (id === 'quest-n-click-connector') {
    const m = /export const CONNECTOR_IDS = \[([^\]]*)\]/.exec(source(root, 'connectors/src/registry.ts'));
    return m ? [...m[1]!.matchAll(/'([a-z-]+)'/g)].map((x) => x[1]!) : undefined;
  }
  if (id === 'quest-n-click-studio-server') {
    const text = source(root, 'studio-server/src/server/main.ts');
    return [...new Set([...text.matchAll(/\bcmd [!=]== '([a-z][\w-]*)'/g)].map((m) => m[1]!))];
  }
  return undefined;
}

/** The option names a flag text holds: `--keep-days=30` → `keep-days`, `-h` → `h`. */
const optionNames = (flag: string) => [...flag.matchAll(/(?<![\w-])--?([a-z][\w-]*)/g)].map((m) => m[1]!);

function problems(root: string, d: Data): string[] {
  const out: string[] = [];
  const seenCli = new Set<string>();
  for (const c of d.clis) {
    if (seenCli.has(c.id)) out.push(`${FILE}: the command ${c.id} is described twice`);
    seenCli.add(c.id);
    const text = c.files.map((f) => source(root, f)).join('\n');
    for (const f of c.files) if (!source(root, f)) out.push(`${FILE}: ${c.id} names ${f}, which is not there`);
    const read = (where: string, options: Options, exits: Exits) => {
      for (const o of options ?? [])
        for (const n of optionNames(o.flag))
          if (!text.includes(`--${n}`) && !text.includes(`'${n}'`) && !text.includes(`-${n}'`))
            out.push(`${FILE}: ${where}: the option ${o.flag} is not read by ${c.files.join(', ')}`);
      for (const e of exits ?? [])
        if (e.code > 1 && !new RegExp(`(exit\\(|exitCode = |return |\\? )${e.code}\\b`).test(text))
          out.push(`${FILE}: ${where}: the exit code ${e.code} appears nowhere in ${c.files.join(', ')}`);
    };
    read(c.id, c.options, c.exits);
    const seen = new Set<string>();
    for (const k of c.commands) {
      const where = `${c.id}${k.name ? ` ${k.name}` : ''}`;
      if (seen.has(k.name)) out.push(`${FILE}: ${where} is described twice`);
      seen.add(k.name);
      if (k.name && !new RegExp(`['"\`|<\\s]${k.name}['"\`|>:\\s]`).test(text))
        out.push(`${FILE}: ${where}: no file of ${c.id} names the subcommand "${k.name}" any more`);
      read(where, k.options, k.exits);
    }
    const listed = listedSubcommands(root, c.id);
    for (const name of listed ?? [])
      if (!seen.has(name)) out.push(`${FILE}: ${c.id} ${name} is in the code and has no description`);
  }
  return out;
}

const W = {
  en: {
    pkg: 'Package',
    where: 'Where',
    sources: 'Source',
    usage: 'Usage',
    since: 'Since',
    options: 'Options',
    option: 'Option',
    means: 'Means',
    exits: 'Exit codes',
    exit: 'Code',
  },
  fr: {
    pkg: 'Paquet',
    where: 'Où',
    sources: 'Source',
    usage: 'Utilisation',
    since: 'Depuis',
    options: 'Options',
    option: 'Option',
    means: 'Signifie',
    exits: 'Codes de sortie',
    exit: 'Code',
  },
} as const;

const commandAnchor = (c: Cli, k: Command) => sectionId(`${c.anchor}-${k.name || 'usage'}`);

function commandSection(c: Cli, k: Command, lang: Lang): string[] {
  const w = W[lang];
  const out = [
    `<a name="${commandAnchor(c, k)}"></a>`,
    '',
    `### ${code(k.name ? `${c.id} ${k.name}` : c.id)}`,
    '',
    prose(k.description[lang]),
    '',
    `${w.usage}${colon(lang)}${code(k.usage)}`,
    '',
  ];
  if (k.since) out.push(`${w.since}${colon(lang)}${k.since}.`, '');
  return [...out, ...tables(k.options, k.exits, lang)];
}

/** The options' table and the exit codes' table, each when there is something to show. */
function tables(options: Options, exits: Exits, lang: Lang): string[] {
  const w = W[lang];
  const out: string[] = [];
  if (options?.length) {
    out.push(`| ${w.option} | ${w.means} |`, '|---|---|');
    for (const o of options) out.push(`| ${code(cell(o.flag))} | ${cell(prose(o.description[lang]))} |`);
    out.push('');
  }
  if (exits?.length) {
    out.push(`| ${w.exit} | ${w.means} |`, '|---|---|');
    for (const e of exits) out.push(`| ${e.code} | ${cell(prose(e.description[lang]))} |`);
    out.push('');
  }
  return out;
}

function sections(d: Data, lang: Lang): string {
  const w = W[lang];
  const out: string[] = [];
  for (const c of d.clis) {
    out.push(`<a name="${c.anchor}"></a>`, '', `## ${code(c.id)}`, '', prose(c.intro[lang]), '');
    out.push(`- ${w.pkg}${colon(lang)}${code(c.package)}.`);
    out.push(`- ${w.where}${colon(lang)}${prose(c.where[lang])}`);
    out.push(`- ${w.sources}${colon(lang)}${c.files.map(repoLink).join(', ')}.`, '');
    out.push(...tables(c.options, c.exits, lang));
    for (const k of c.commands) out.push(...commandSection(c, k, lang));
  }
  return out.join('\n');
}

export const cliGenerator: Generator = {
  page: CLI_PAGE,
  data: FILE,
  build({ root, wikiDir }: GenContext): GenResult {
    const r = readData(wikiDir, FILE, Schema);
    if (!r.data) return { problems: r.errors };
    const en = sections(r.data, 'en');
    return {
      sections: { en, fr: sections(r.data, 'fr') },
      problems: [...problems(root, r.data), ...duplicateAnchors(CLI_PAGE, en)],
      identifiers: [
        ...new Set(
          r.data.clis.flatMap((c) => [c.id, ...c.commands.filter((k) => k.name).map((k) => `${c.id} ${k.name}`)]),
        ),
      ].sort(),
    };
  },
};
