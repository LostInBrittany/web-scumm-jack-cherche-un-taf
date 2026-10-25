// npx tsx tools/dsl-doc.ts [--check] (4.1.12): the DSL's reference, generated from its schemas and their sentences, as
// the generated part of the wiki's `create.dsl` (wiki/en/create.dsl.md and wiki/fr/create.dsl.md, each in its language,
// and that page's identifiers in wiki/manifest.json; 4.5.0, docs/en|fr/DSL.md being transition pages): every condition (core/ir-schema.ts, tools/dsl-meta.ts), every
// command with its shape (src/studio/schema.ts `CMD_SPECS`, the Studio's forms) and its sentence, the objectives'
// fields (`objectiveSchema` and its metadata), and how each field of the game and of a room counts for the IR and the
// fingerprint (core/ir-fields.ts), and the placeholders a text may hold (4.3.0: text switches, core/text-switch.ts).
// `--check` exits 1 when the page is behind; tests/dsl-doc.test.ts and `npm run wiki -- check` say the same, and
// `npm run wiki -- generate create.dsl` writes the same.
import { resolve } from 'node:path';
import type * as z from 'zod';
import { CMD_KEYS } from '../src/engine/core/cmds';
import { FIELD_CLASSES, type FieldClass } from '../src/engine/core/ir-fields';
import { type FieldMeta, objectiveSchema } from '../src/engine/core/ir-schema';
import { CMD_SPECS, COND_KINDS, type Field } from '../src/studio/schema';
import { CMD_DOCS, COND_DOCS } from './dsl-meta';
import { sortedUnique, updateGeneratedPage } from './wiki/generated';

const ROOT = resolve(import.meta.dirname, '..');
type Lang = 'en' | 'fr';

/** A field of the Studio's schema, as it is written. */
export function shapeOf(f: Field): string {
  switch (f.k) {
    case 'text':
      return 'text';
    case 'id':
      return f.ref ? `${f.ref}` : 'id';
    case 'number':
      return 'number';
    case 'bool':
      return 'true';
    case 'enum':
      return f.values.map((v) => `'${v}'`).join(' \\| ');
    case 'point':
      return '[x, y]';
    case 'idOrPoint':
      return `${f.ref ?? 'id'} \\| [x, y]`;
    case 'cond':
      return 'cond';
    case 'cmds':
      return '[cmd, …]';
    case 'tuple':
      return `[${f.items.map((it, i) => f.labels?.[i] ?? shapeOf(it)).join(', ')}]`;
    case 'list':
      return `[${shapeOf(f.of)}, …]`;
    case 'object':
      return `{ ${Object.entries(f.fields)
        .map(([k, x]) => `${k}${x.optional ? '?' : ''}: ${shapeOf(x)}`)
        .join(', ')} }`;
    case 'json':
      return '…';
  }
}

const cell = (s: string) => s.replace(/\n/g, ' ');
const T = {
  en: {
    conditions: 'Conditions',
    condIntro: 'A condition is data: a string for a flag, an object for the rest, nested with `not`, `all`, `any`.',
    written: 'Written',
    means: 'Means',
    commands: 'Commands',
    cmdIntro:
      'A command is one key of `CMD_KEYS`; its fields are the Studio form’s. A plain string is the hero’s line.',
    command: 'Command',
    shape: 'Shape',
    does: 'Does',
    objectives: 'Objectives (`GameDef.objectives[id]`)',
    field: 'Field',
    type: 'Type',
    classes: 'How each field counts (IR and fingerprint)',
    classIntro:
      'From `core/ir-fields.ts`: `logic` is in the IR and the fingerprint’s `logic`; `presentation` in its `presentation`; `both` splits; `meta` is for the tools only.',
    game: 'The game (`GameDef`)',
    room: 'A room (`RoomDef`)',
    counts: { logic: 'logic', presentation: 'presentation', both: 'both', meta: 'meta' } as Record<FieldClass, string>,
    placeholders: 'Placeholders in texts',
    placeholderIntro:
      'Written inside any text; anything else between braces stays as written. A switch compares `String(value)` of the flag exactly; no value matching (or the flag unset) takes `*=`, else the first text. No nesting, no escaping: an alternative holds no `{`, `}` or `|`. The validator reports a malformed switch, a flag no command sets, a value listed that no `set` writes, and a value written that the switch neither lists nor covers with `*=`.',
    placeholder: 'Placeholder',
    filled: 'Filled',
    placeholderRows: [
      [
        '{hero}',
        'when shown: the active hero’s name (its variant’s); lines, choices, looks, hints, toasts, captions, item and object names, objective titles',
      ],
      [
        '{<flag>?<value>=<text>|…|*=<text>}',
        'when shown, after the translation: the text listed for the flag’s current value (`{form?m=him|f=her}`, `content{form?f=e|*=}`)',
      ],
      [
        '{item} {target} {name}',
        'in a fallback, kind or give line: the thing acted on, what it is used on, the target',
      ],
      ['{code:<id>} {hint:<id>}', 'at boot, by Remix: a coupled dimension’s code and its clue'],
    ] as [string, string][],
  },
  fr: {
    conditions: 'Conditions',
    condIntro:
      'Une condition est une donnée : une chaîne pour un drapeau, un objet pour le reste, imbriqués avec `not`, `all`, `any`.',
    written: 'Écrit',
    means: 'Signifie',
    commands: 'Commandes',
    cmdIntro:
      'Une commande est une clé de `CMD_KEYS` ; ses champs sont ceux du formulaire du Studio. Une chaîne seule est une réplique du héros.',
    command: 'Commande',
    shape: 'Forme',
    does: 'Fait',
    objectives: 'Objectifs (`GameDef.objectives[id]`)',
    field: 'Champ',
    type: 'Type',
    classes: 'Ce que compte chaque champ (IR et empreinte)',
    classIntro:
      'Selon `core/ir-fields.ts` : `logic` est dans l’IR et dans le `logic` de l’empreinte ; `presentation` dans son `presentation` ; `both` se partage ; `meta` ne sert qu’aux outils.',
    game: 'Le jeu (`GameDef`)',
    room: 'Une salle (`RoomDef`)',
    counts: { logic: 'logic', presentation: 'presentation', both: 'both', meta: 'meta' } as Record<FieldClass, string>,
    placeholders: 'Marqueurs dans les textes',
    placeholderIntro:
      'Écrits dans n’importe quel texte ; le reste entre accolades reste tel quel. Un aiguillage compare exactement `String(valeur)` du drapeau ; sans valeur qui corresponde (ou drapeau absent), il prend `*=`, sinon le premier texte. Pas d’imbrication, pas d’échappement : une alternative ne contient ni `{`, ni `}`, ni `|`. Le validateur signale un aiguillage mal formé, un drapeau qu’aucune commande ne pose, une valeur listée qu’aucun `set` n’écrit, et une valeur écrite que l’aiguillage ne liste pas sans `*=`.',
    placeholder: 'Marqueur',
    filled: 'Rempli',
    placeholderRows: [
      [
        '{hero}',
        'à l’affichage : le nom du héros actif (celui de sa variante) ; répliques, choix, regards, indices, toasts, sous-titres, noms d’objets, titres d’objectifs',
      ],
      [
        '{<flag>?<value>=<text>|…|*=<text>}',
        'à l’affichage, après la traduction : le texte listé pour la valeur courante du drapeau (`{form?m=him|f=her}`, `content{form?f=e|*=}`)',
      ],
      [
        '{item} {target} {name}',
        'dans une réplique par défaut, de genre ou de don : la chose visée, ce sur quoi on l’utilise, la cible',
      ],
      ['{code:<id>} {hint:<id>}', 'au démarrage, par Remix : le code d’une dimension couplée et son indice'],
    ] as [string, string][],
  },
};

type Def = { type: string; innerType?: z.ZodType };
const defOf = (s: z.ZodType) => (s as unknown as { def: Def }).def;
const metaOf = (s: z.ZodType): FieldMeta | undefined =>
  (s as unknown as { meta(): FieldMeta | undefined }).meta() ??
  (defOf(s).type === 'optional' ? metaOf(defOf(s).innerType!) : undefined);
const typeOf = (s: z.ZodType, lang: Lang): string => {
  const d = defOf(s);
  if (d.type === 'optional') return `${typeOf(d.innerType!, lang)} (${lang === 'en' ? 'optional' : 'facultatif'})`;
  if (d.type === 'lazy' || d.type === 'union') return 'cond';
  return d.type === 'boolean' ? 'boolean' : d.type;
};

/** The generated block of one language. */
export function dslBlock(lang: Lang): string {
  const t = T[lang];
  const i = lang === 'en' ? 0 : 1;
  const out: string[] = [];
  out.push(`### ${t.conditions}`, '', t.condIntro, '', `| ${t.written} | ${t.means} |`, '|---|---|');
  for (const k of COND_KINDS) out.push(`| \`${COND_DOCS[k].shape}\` | ${cell(COND_DOCS[k].said[i])} |`);
  out.push('', `### ${t.commands}`, '', t.cmdIntro, '', `| ${t.command} | ${t.shape} | ${t.does} |`, '|---|---|---|');
  for (const k of CMD_KEYS) {
    const spec = CMD_SPECS[k];
    const extra = Object.entries(spec.extra ?? {})
      .map(([x, f]) => `, ${x}${f.optional ? '?' : ''}: ${shapeOf(f)}`)
      .join('');
    out.push(`| \`${k}\` | \`{ ${k}: ${shapeOf(spec.value)}${extra} }\` | ${cell(CMD_DOCS[k][i])} |`);
  }
  out.push('', `### ${t.objectives}`, '', `| ${t.field} | ${t.type} | ${t.means} |`, '|---|---|---|');
  for (const [k, s] of Object.entries(objectiveSchema.shape as Record<string, z.ZodType>)) {
    const m = metaOf(s);
    out.push(`| \`${k}\` | ${typeOf(s, lang)} | ${cell(m ? (lang === 'en' ? m.description : m.fr) : '')} |`);
  }
  out.push('', `### ${t.placeholders}`, '', t.placeholderIntro, '', `| ${t.placeholder} | ${t.filled} |`, '|---|---|');
  for (const [k, v] of t.placeholderRows)
    out.push(`| \`${k.replace(/\|/g, '\\|')}\` | ${cell(v.replace(/\|/g, '\\|'))} |`);
  out.push('', `### ${t.classes}`, '', t.classIntro, '');
  for (const [title, table] of [
    [t.game, FIELD_CLASSES.game],
    [t.room, FIELD_CLASSES.room],
  ] as const) {
    const by = new Map<FieldClass, string[]>();
    for (const [k, c] of Object.entries(table)) by.set(c, [...(by.get(c) ?? []), `\`${k}\``]);
    const colon = lang === 'en' ? ':' : ' :';
    out.push(`${title}${colon}`, '');
    for (const c of ['logic', 'both', 'presentation', 'meta'] as const)
      if (by.get(c)?.length) out.push(`- **${t.counts[c]}**${colon} ${by.get(c)!.join(', ')}`);
    out.push('');
  }
  return out.join('\n').trimEnd();
}

/** The section ids of the wiki's `create.dsl`, one per `###` heading of the block, in its order (4.5.0, lot B11). */
const WIKI_SECTIONS = ['conditions', 'commands', 'objectives', 'placeholders', 'field-counts'] as const;

/**
 * The block as the wiki's `create.dsl` holds it (`npm run wiki -- generate create.dsl`, tools/wiki/generators.ts):
 * the same text, each `###` heading after its `<a name>` section id, the same in both languages.
 */
export function dslWikiBlock(lang: Lang): string {
  let i = 0;
  const out = dslBlock(lang)
    .split('\n')
    .flatMap((l) => (l.startsWith('### ') ? [`<a name="${WIKI_SECTIONS[i++] ?? 'unknown'}"></a>`, '', l] : [l]));
  if (i !== WIKI_SECTIONS.length) throw new Error(`dsl-doc: ${i} sections, the wiki names ${WIKI_SECTIONS.length}`);
  return out.join('\n');
}

/** The identifiers the wiki's `create.dsl` names: every command key and condition kind. */
export const dslIdentifiers = (): string[] => sortedUnique([...CMD_KEYS, ...COND_KINDS]);

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const check = process.argv.includes('--check');
  const problems = updateGeneratedPage(
    resolve(ROOT, 'wiki'),
    'create.dsl',
    { en: dslWikiBlock('en'), fr: dslWikiBlock('fr') },
    dslIdentifiers(),
    check,
  );
  for (const p of problems) console.error(`✖  ${p}: npx tsx tools/dsl-doc.ts`);
  if (!problems.length)
    console.log(`✔  wiki/en|fr/create.dsl.md: the reference ${check ? 'is up to date' : 'written'}`);
  process.exit(problems.length ? 1 : 0);
}
