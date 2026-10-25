// The npm scripts reference (`reference.npm-scripts`, lot B11): every script of the engine repository's package.json
// and every script `quest-n-click create` writes into a new project's package.json (cli/create.mjs), each described in
// English and in French in `wiki/data/npm-scripts.json`, with the command it runs read from the code. A script with no
// description, or a description whose script is gone, is a problem of `wiki -- check`.
import { z } from 'zod';
import {
  bilingual,
  code,
  colon,
  prose,
  duplicateAnchors,
  type GenContext,
  type GenResult,
  type Generator,
  type Lang,
  readData,
  sectionId,
  source,
  sortedUnique,
} from './generated';

const FILE = 'data/npm-scripts.json';
const SCRIPTS_PAGE = 'reference.npm-scripts';

const entry = z
  .object({
    name: z.string().min(1),
    /** Its group (repository scripts only). */
    group: z.string().optional(),
    /** How it is called when it takes arguments: `npm run remix -- --seed <code>`. */
    usage: z.string().min(1).optional(),
    description: bilingual(2400),
  })
  .strict();
const Schema = z
  .object({
    format: z.literal('quest-n-click-docs-npm-scripts'),
    version: z.literal(1),
    groups: z.array(
      z
        .object({ id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), title: bilingual(120), intro: bilingual(800) })
        .strict(),
    ),
    repository: z.array(entry),
    project: z.array(entry),
  })
  .strict();
type Scripts = z.infer<typeof Schema>;
type Entry = Scripts['repository'][number];

/** The engine repository's scripts, name → command. */
export function repositoryScripts(root: string): Record<string, string> {
  return (JSON.parse(source(root, 'package.json') || '{}') as { scripts?: Record<string, string> }).scripts ?? {};
}

/**
 * The scripts `quest-n-click create` writes, name → command, read from cli/create.mjs's `scripts: { … }` block: a
 * `key: \`${NAME} cmd\`` entry, and `[NAME]: NAME` (the engine's own command, under its own name).
 */
export function projectScripts(root: string): Record<string, string> {
  const text = source(root, 'cli/create.mjs');
  // The engine's command (cli/create.mjs `NAME`), not its package's name (`@quest-n-click/engine` since 4.5.2, D53).
  const name = /\nconst NAME = '([^']+)';/.exec(text)?.[1] ?? 'quest-n-click';
  const block = /\n(\s*)scripts: \{\n([\s\S]*?)\n\1\},/.exec(text)?.[2] ?? '';
  const out: Record<string, string> = {};
  for (const l of block.split('\n')) {
    const m = /^\s*([A-Za-z][\w:-]*|\[NAME\]): (`\$\{NAME\}([^`]*)`|NAME),?$/.exec(l);
    if (!m) continue;
    out[m[1] === '[NAME]' ? name : m[1]!] = m[2] === 'NAME' ? name : `${name}${m[3]}`;
  }
  return out;
}

const W = {
  en: {
    repository: 'Scripts of the engine repository',
    repositoryIntro:
      'Run in a clone of the engine repository, from its root folder (the one that holds `package.json`), after `npm ci`.',
    project: 'Scripts of a created project',
    projectIntro:
      "Written by `quest-n-click create` (or `npm init @quest-n-click`) into the new project's `package.json`. Run them from the project's folder, after `npm install`: each calls the `quest-n-click` command of the installed engine.",
    runs: 'Runs',
    usage: 'Usage',
  },
  fr: {
    repository: 'Scripts du dépôt du moteur',
    repositoryIntro:
      'À lancer dans un clone du dépôt du moteur, depuis son dossier racine (celui qui contient `package.json`), après `npm ci`.',
    project: 'Scripts d’un projet créé',
    projectIntro:
      'Écrits par `quest-n-click create` (ou `npm init @quest-n-click`) dans le `package.json` du nouveau projet. À lancer depuis le dossier du projet, après `npm install` : chacun appelle la commande `quest-n-click` du moteur installé.',
    runs: 'Lance',
    usage: 'Utilisation',
  },
} as const;

const anchorOf = (e: Entry, project: boolean) => (project ? `project-${sectionId(e.name)}` : sectionId(e.name));

function problems(d: Scripts, repo: Record<string, string>, project: Record<string, string>): string[] {
  const out: string[] = [];
  const groups = new Set(d.groups.map((g) => g.id));
  for (const [list, actual, where] of [
    [d.repository, repo, 'package.json'],
    [d.project, project, 'cli/create.mjs'],
  ] as const) {
    const seen = new Set<string>();
    for (const e of list) {
      if (seen.has(e.name)) out.push(`${FILE}: the script ${e.name} is described twice`);
      seen.add(e.name);
      if (!(e.name in actual))
        out.push(`${FILE}: the script ${e.name} is described, and ${where} has no such script any more: remove it`);
      if (list === d.repository && (!e.group || !groups.has(e.group)))
        out.push(`${FILE}: the script ${e.name} names no group of "groups" (${e.group ?? 'none'})`);
    }
    for (const name of Object.keys(actual))
      if (!seen.has(name))
        out.push(
          `${FILE}: the script ${name} of ${where} has no description: add it in English and in French (npm run wiki -- generate ${SCRIPTS_PAGE})`,
        );
  }
  for (const g of d.groups)
    if (!d.repository.some((e) => e.group === g.id)) out.push(`${FILE}: the group ${g.id} holds no script`);
  return out;
}

function scriptSection(e: Entry, command: string | undefined, lang: Lang, project: boolean): string[] {
  const w = W[lang];
  const out = [
    `<a name="${anchorOf(e, project)}"></a>`,
    '',
    `#### ${code(`npm run ${e.name}`)}`,
    '',
    prose(e.description[lang]),
    '',
  ];
  if (command !== undefined) out.push(`- ${w.runs}${colon(lang)}${code(command)}`);
  if (e.usage) out.push(`- ${w.usage}${colon(lang)}${code(e.usage)}`);
  out.push('');
  return out;
}

function sections(d: Scripts, repo: Record<string, string>, project: Record<string, string>, lang: Lang): string {
  const w = W[lang];
  const out: string[] = ['<a name="repository"></a>', '', `## ${w.repository}`, '', w.repositoryIntro, ''];
  for (const g of d.groups) {
    out.push(`<a name="${g.id}"></a>`, '', `### ${prose(g.title[lang])}`, '', prose(g.intro[lang]), '');
    for (const e of d.repository.filter((x) => x.group === g.id).sort((a, b) => (a.name < b.name ? -1 : 1)))
      out.push(...scriptSection(e, repo[e.name], lang, false));
  }
  out.push('<a name="project"></a>', '', `## ${w.project}`, '', w.projectIntro, '');
  const order = Object.keys(project);
  for (const e of [...d.project].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name)))
    out.push(...scriptSection(e, project[e.name], lang, true));
  return out.join('\n');
}

export const scriptsGenerator: Generator = {
  page: SCRIPTS_PAGE,
  data: FILE,
  build({ root, wikiDir }: GenContext): GenResult {
    const r = readData(wikiDir, FILE, Schema);
    if (!r.data) return { problems: r.errors };
    const repo = repositoryScripts(root);
    const project = projectScripts(root);
    const en = sections(r.data, repo, project, 'en');
    return {
      sections: { en, fr: sections(r.data, repo, project, 'fr') },
      problems: [...problems(r.data, repo, project), ...duplicateAnchors(SCRIPTS_PAGE, en)],
      identifiers: sortedUnique([...Object.keys(repo), ...Object.keys(project)].map((s) => `npm run ${s}`)),
    };
  },
};
