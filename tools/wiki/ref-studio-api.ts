// The Studio API reference (`studio.api`, lot B11): every route of `/__studio/api/*`. The JSON routes come from the one
// table the dev server and the Studio Server share (studio-server/src/ops/routes.ts, read through `routes()`); the dev
// server's own routes (the change feed, the screenshots, the Assets tab, the Assistant) are named in their files
// (tools/studio/plugin.ts, assets.ts, assistant.ts), the Assets tab's from its own route list. `wiki/data/studio-api.json`
// describes each route in English and in French: what it takes, what it answers. A table route nobody describes, an
// Assets route nobody describes, or a described route the code no longer serves, is a problem.
import { z } from 'zod';
import type { Studio } from '../../studio-server/src/ops/core';
import { routes } from '../../studio-server/src/ops/routes';
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
  repoLink,
  sectionId,
  source,
} from './generated';

const FILE = 'data/studio-api.json';
const STUDIO_API_PAGE = 'studio.api';
const PREFIX = '/__studio/api';
const ASSETS_FILE = 'tools/studio/assets.ts';
const TABLE_FILE = 'studio-server/src/ops/routes.ts';

const Schema = z
  .object({
    format: z.literal('quest-n-click-docs-studio-api'),
    version: z.literal(1),
    groups: z.array(
      z
        .object({ id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), title: bilingual(120), intro: bilingual(800) })
        .strict(),
    ),
    routes: z.array(
      z
        .object({
          method: z.enum(['GET', 'PUT', 'POST', 'DELETE']),
          /** Under `/__studio/api`, a parameter written `:name`, an optional part in brackets: `/voices[/:lang]`. */
          path: z.string().regex(/^\/[\w@:./[\]~-]*$/),
          group: z.string(),
          /** `table`: the shared table (both servers). `dev-server`: the dev server only, served by `file`. */
          server: z.enum(['table', 'dev-server']),
          file: z.string().optional(),
          /** For a dev-server route: a text of `file` that serves it (the check finds it there). */
          match: z.string().min(1).optional(),
          since: z.string().optional(),
          body: bilingual(1200).optional(),
          result: bilingual(2400),
        })
        .strict(),
    ),
  })
  .strict();
type Data = z.infer<typeof Schema>;
type Route = Data['routes'][number];

/** The shared table's routes: method and pattern (the handlers are never called). */
export function tableRoutes(): { method: string; re: RegExp }[] {
  return routes({} as Studio).map(([method, re]) => ({ method, re }));
}

/** The Assets tab's routes in tools/studio/assets.ts: `['GET', '/prompts', …]`, as `/assets/prompts`. */
function assetsRoutes(root: string): { method: string; path: string }[] {
  return [...source(root, ASSETS_FILE).matchAll(/\[\s*'(GET|PUT|POST|DELETE)',\s*'(\/[^']*)',/g)].map((m) => ({
    method: m[1]!,
    path: `/assets${m[2] === '/' ? '' : m[2]}`,
  }));
}

/** A concrete path for a described one: brackets dropped, each parameter `1` (`/diff/:from..:to` → `/diff/1..1`). */
const sample = (path: string) => path.replace(/[[\]]/g, '').replace(/:\w+/g, '1');
const anchorOf = (r: Route) => sectionId(`${r.method} ${r.path}`);

function problems(root: string, d: Data): string[] {
  const out: string[] = [];
  const groups = new Set(d.groups.map((g) => g.id));
  const table = tableRoutes();
  const covered = new Set<number>();
  const seen = new Set<string>();
  for (const r of d.routes) {
    const key = `${r.method} ${r.path}`;
    if (seen.has(key)) out.push(`${FILE}: ${key} is described twice`);
    seen.add(key);
    if (!groups.has(r.group)) out.push(`${FILE}: ${key} names no group of "groups" (${r.group})`);
    if (r.server === 'table') {
      // The server takes the first route whose pattern matches the path and whose method is the request's.
      const at = table.findIndex((t) => t.method === r.method && t.re.test(sample(r.path)));
      if (at < 0) out.push(`${FILE}: ${key} is not a route of ${TABLE_FILE} any more: remove it, or fix its path`);
      else covered.add(at);
    } else if (!r.file || !r.match) out.push(`${FILE}: ${key} is a dev-server route: name its file and match`);
    else if (!source(root, r.file).includes(r.match))
      out.push(`${FILE}: ${key}: ${r.file} no longer holds "${r.match}": the route moved or is gone`);
  }
  table.forEach((t, i) => {
    if (!covered.has(i)) out.push(`${FILE}: the route ${t.method} ${t.re.source} of ${TABLE_FILE} has no description`);
  });
  for (const a of assetsRoutes(root))
    if (!d.routes.some((r) => r.method === a.method && r.path === a.path))
      out.push(`${FILE}: the Assets route ${a.method} ${a.path} of ${ASSETS_FILE} has no description`);
  for (const g of d.groups)
    if (!d.routes.some((r) => r.group === g.id)) out.push(`${FILE}: the group ${g.id} holds no route`);
  return out;
}

const W = {
  en: {
    served: 'Served by',
    both: `both the dev server and the Studio Server (the shared table, ${repoLink(TABLE_FILE)})`,
    dev: (f: string) => `the dev server only (${repoLink(f)})`,
    since: 'Since',
    body: 'Body',
    result: 'Answer',
  },
  fr: {
    served: 'Servie par',
    both: `le serveur de dev et le Studio Server (la table commune, ${repoLink(TABLE_FILE)})`,
    dev: (f: string) => `le serveur de dev seulement (${repoLink(f)})`,
    since: 'Depuis',
    body: 'Corps',
    result: 'Réponse',
  },
} as const;

function sections(d: Data, lang: Lang): string {
  const w = W[lang];
  const out: string[] = [];
  for (const g of d.groups) {
    out.push(`<a name="${g.id}"></a>`, '', `## ${prose(g.title[lang])}`, '', prose(g.intro[lang]), '');
    for (const r of d.routes.filter((x) => x.group === g.id)) {
      out.push(`<a name="${anchorOf(r)}"></a>`, '', `### ${code(`${r.method} ${r.path}`)}`, '');
      if (r.body) out.push(`- ${w.body}${colon(lang)}${prose(r.body[lang])}`);
      out.push(`- ${w.result}${colon(lang)}${prose(r.result[lang])}`);
      out.push(`- ${w.served}${colon(lang)}${r.server === 'table' ? w.both : w.dev(r.file!)}.`);
      if (r.since) out.push(`- ${w.since}${colon(lang)}${r.since}.`);
      out.push('');
    }
  }
  return out.join('\n');
}

export const studioApiGenerator: Generator = {
  page: STUDIO_API_PAGE,
  data: FILE,
  build({ root, wikiDir }: GenContext): GenResult {
    const r = readData(wikiDir, FILE, Schema);
    if (!r.data) return { problems: r.errors };
    const en = sections(r.data, 'en');
    return {
      sections: { en, fr: sections(r.data, 'fr') },
      problems: [...problems(root, r.data), ...duplicateAnchors(STUDIO_API_PAGE, en)],
      identifiers: [...new Set(r.data.routes.map((x) => `${x.method} ${PREFIX}${x.path}`))].sort(),
    };
  },
};
