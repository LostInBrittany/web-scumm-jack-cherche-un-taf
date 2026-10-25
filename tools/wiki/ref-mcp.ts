// The MCP tools reference (`studio.mcp-tools`, lot B11): every tool of the Studio's registry (tools/studio/tools.ts,
// read through its export: the MCP server, the remote MCP and the Assistant serve the same list), with its name, its
// title, whether it writes, the backend ability it needs, and its input fields as JSON Schema gives them. The English
// text is the code's own (the description an AI client receives); the French one is kept in `wiki/data/mcp-tools.json`.
// A tool or a field with no French text, or French text for a tool or a field the registry no longer has, is a problem.
import { z } from 'zod';
import { jsonSchema, TOOLS, type ToolDef } from '../studio/tools';
import {
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
  sectionId,
} from './generated';

const FILE = 'data/mcp-tools.json';
const MCP_PAGE = 'studio.mcp-tools';

const fr = z.string().trim().min(1).max(2400);
const Schema = z
  .object({
    format: z.literal('quest-n-click-docs-mcp-tools'),
    version: z.literal(1),
    /** By tool name: its title, its description and each described field, in French. */
    tools: z.record(z.string(), z.object({ title: fr, description: fr, fields: z.record(z.string(), fr) }).strict()),
  })
  .strict();
type Data = z.infer<typeof Schema>;

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  anyOf?: JsonSchema[];
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
};

/** A field's type, short: `string`, `'a' \| 'b'`, `[number, number]`, `string \| null`, `object`. */
function typeText(s: JsonSchema): string {
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (s.anyOf) return s.anyOf.map((x) => (Object.keys(x).length ? typeText(x) : 'any JSON')).join(' | ');
  const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
  const one = (t: string) => {
    if (t === 'array') {
      const item = s.items && Object.keys(s.items).length ? typeText(s.items) : 'any';
      return s.minItems !== undefined && s.minItems === s.maxItems
        ? `[${Array.from({ length: s.minItems }, () => item).join(', ')}]`
        : `${item}[]`;
    }
    if (t === 'object' && s.properties)
      return `{ ${Object.keys(s.properties)
        .map((k) => `${k}${s.required?.includes(k) ? '' : '?'}`)
        .join(', ')} }`;
    if (t === 'integer' && (s.minimum !== undefined || s.maximum !== undefined))
      return `integer ${s.minimum ?? ''}..${s.maximum ?? ''}`;
    return t;
  };
  return types.length ? types.map(one).join(' | ') : 'any JSON';
}

const W = {
  en: {
    writes: 'Writes',
    yes: 'yes, it changes a file of the game (the Studio refreshes after it)',
    no: 'no (read-only)',
    needs: 'Needs',
    needsText: (n: string) =>
      `the backend ability ${code(n)}: a backend without it (the demo, a hosted Studio without that route) leaves the tool out`,
    hints: 'MCP hints',
    input: 'Input',
    none: 'No argument.',
    field: 'Field',
    type: 'Type',
    required: 'Required',
    means: 'Means',
    yesShort: 'yes',
    noShort: 'no',
  },
  fr: {
    writes: 'Écrit',
    yes: 'oui, il modifie un fichier du jeu (le Studio se rafraîchit ensuite)',
    no: 'non (lecture seule)',
    needs: 'Requiert',
    needsText: (n: string) =>
      `la capacité ${code(n)} du backend : un backend qui ne l’a pas (la démo, un Studio hébergé sans cette route) ne propose pas l’outil`,
    hints: 'Indications MCP',
    input: 'Entrée',
    none: 'Aucun argument.',
    field: 'Champ',
    type: 'Type',
    required: 'Requis',
    means: 'Signifie',
    yesShort: 'oui',
    noShort: 'non',
  },
} as const;

const hintsOf = (t: ToolDef) =>
  Object.entries(t.annotations ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

function toolSection(t: ToolDef, d: Data, lang: Lang): string[] {
  const w = W[lang];
  const f = d.tools[t.name];
  const schema = jsonSchema(t) as JsonSchema;
  const title = lang === 'en' ? t.title : (f?.title ?? t.title);
  const out = [
    `<a name="${sectionId(t.name)}"></a>`,
    '',
    `### ${code(t.name)}`,
    '',
    `**${prose(title)}.** ${prose(lang === 'en' ? t.description : (f?.description ?? t.description))}`,
    '',
    `- ${w.writes}${colon(lang)}${t.writes ? w.yes : w.no}.`,
  ];
  if (t.needs) out.push(`- ${w.needs}${colon(lang)}${w.needsText(t.needs)}.`);
  if (t.annotations) out.push(`- ${w.hints}${colon(lang)}${code(hintsOf(t))}.`);
  out.push('', `${w.input}${colon(lang).trimEnd()}`, '');
  const props = Object.entries(schema.properties ?? {});
  if (!props.length) out.push(w.none, '');
  else {
    out.push(`| ${w.field} | ${w.type} | ${w.required} | ${w.means} |`, '|---|---|---|---|');
    for (const [k, s] of props) {
      const means = lang === 'en' ? (s.description ?? '') : (f?.fields[k] ?? s.description ?? '');
      out.push(
        `| ${code(k)} | ${code(cell(typeText(s)))} | ${schema.required?.includes(k) ? w.yesShort : w.noShort} | ${cell(prose(means))} |`,
      );
    }
    out.push('');
  }
  return out;
}

function problems(d: Data): string[] {
  const out: string[] = [];
  const names = new Set(TOOLS.map((t) => t.name));
  for (const t of TOOLS) {
    const f = d.tools[t.name];
    if (!f) {
      out.push(`${FILE}: the tool ${t.name} has no French title and description`);
      continue;
    }
    const props = (jsonSchema(t) as JsonSchema).properties ?? {};
    for (const [k, s] of Object.entries(props))
      if (s.description && !f.fields[k]) out.push(`${FILE}: the field ${k} of ${t.name} has no French description`);
    for (const k of Object.keys(f.fields))
      if (!(k in props)) out.push(`${FILE}: ${t.name} has no field ${k} any more: remove its French description`);
  }
  for (const name of Object.keys(d.tools))
    if (!names.has(name)) out.push(`${FILE}: the registry has no tool ${name} any more: remove it`);
  return out;
}

export const mcpGenerator: Generator = {
  page: MCP_PAGE,
  data: FILE,
  build({ wikiDir }: GenContext): GenResult {
    const r = readData(wikiDir, FILE, Schema);
    if (!r.data) return { problems: r.errors };
    const d = r.data;
    const text = (lang: Lang) => TOOLS.flatMap((t) => toolSection(t, d, lang)).join('\n');
    const en = text('en');
    return {
      sections: { en, fr: text('fr') },
      problems: [...problems(d), ...duplicateAnchors(MCP_PAGE, en)],
      identifiers: TOOLS.map((t) => t.name).sort(),
    };
  },
};
