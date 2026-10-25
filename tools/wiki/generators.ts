// The generators of the reference pages (4.5.0 "Wiki", lot B11; tools/wiki/generated.ts says how a page is generated):
// one per page, run by `npm run wiki -- generate [<page>…]` (which writes the region and the identifiers) and by
// `wiki -- check` (which fails when a written page differs from what its generator gives, or when the data and the
// code disagree). The DSL and the API come from tools/dsl-doc.ts and tools/api-doc.ts (whose own commands write these
// two pages too); the others from tools/wiki/ref-*.ts.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { apiIdentifiers, apiRows, rowProblems, signaturesWiki } from '../api-doc';
import { dslIdentifiers, dslWikiBlock } from '../dsl-doc';
import {
  type GenContext,
  type GenResult,
  type Generator,
  LANGS,
  sortedUnique,
  withGenerated,
  withPageIdentifiers,
} from './generated';
import type { Manifest } from './manifest';
import { cliGenerator } from './ref-cli';
import { errorsGenerator } from './ref-errors';
import { mcpGenerator } from './ref-mcp';
import { scriptsGenerator } from './ref-scripts';
import { studioApiGenerator } from './ref-studio-api';
import { supportGenerator } from './ref-support';

const dslGenerator: Generator = {
  page: 'create.dsl',
  build: (): GenResult => ({
    sections: { en: dslWikiBlock('en'), fr: dslWikiBlock('fr') },
    problems: [],
    identifiers: dslIdentifiers(),
  }),
};

const apiGenerator: Generator = {
  page: 'engine.api',
  build: (): GenResult => {
    const rows = apiRows();
    return {
      sections: { en: signaturesWiki(rows, 'en'), fr: signaturesWiki(rows, 'fr') },
      problems: rowProblems(rows).map((p) => `engine.api: ${p} (tools/api-doc.ts)`),
      identifiers: apiIdentifiers(rows),
    };
  },
};

export const GENERATORS: readonly Generator[] = [
  scriptsGenerator,
  cliGenerator,
  errorsGenerator,
  supportGenerator,
  dslGenerator,
  apiGenerator,
  studioApiGenerator,
  mcpGenerator,
];
const GENERATED_PAGES = GENERATORS.map((g) => g.page);

const fileOf = (wikiDir: string, lang: string, page: string) => resolve(wikiDir, lang, `${page}.md`);
const isWritten = (manifest: Manifest, page: string) => {
  const p = manifest.pages.find((x) => x.id === page);
  return !!p && !p.generated && p.state !== 'planned';
};

/** Whether a generator applies to this wiki: its data file is there (a fixture has none), or its page is written. */
const applies = (g: Generator, ctx: GenContext, manifest: Manifest) =>
  g.data ? existsSync(resolve(ctx.wikiDir, g.data)) : isWritten(manifest, g.page);

/**
 * What `check` reports: each generator's problems (its data against the code), and for a written page, a region or
 * identifiers that are not what the generator gives.
 */
export function generatedProblems(ctx: GenContext, manifest: Manifest): string[] {
  const out: string[] = [];
  for (const g of GENERATORS) {
    if (!applies(g, ctx, manifest)) continue;
    let r: GenResult;
    try {
      r = g.build(ctx);
    } catch (e) {
      out.push(`${g.page}: its generator failed: ${(e as Error).message}`);
      continue;
    }
    out.push(...r.problems);
    if (!isWritten(manifest, g.page) || !r.sections) continue;
    for (const lang of LANGS) {
      const file = fileOf(ctx.wikiDir, lang, g.page);
      if (!existsSync(file)) continue;
      const text = readFileSync(file, 'utf8');
      const w = withGenerated(text, r.sections[lang]);
      if (w.problem) out.push(`${lang}/${g.page}.md: ${w.problem}`);
      else if (w.text !== text)
        out.push(
          `${lang}/${g.page}.md: its generated part is not the code's: run \`npm run wiki -- generate ${g.page}\``,
        );
    }
    const page = manifest.pages.find((p) => p.id === g.page)!;
    if (r.identifiers && JSON.stringify(sortedUnique(page.identifiers)) !== JSON.stringify(sortedUnique(r.identifiers)))
      out.push(
        `manifest.json: ${g.page}'s identifiers are not its generator's: run \`npm run wiki -- generate ${g.page}\``,
      );
  }
  return out;
}

/**
 * `wiki -- generate`: the region of each page file present, in both languages, and (unless `manifest` is false) the
 * page's identifiers in the manifest. Nothing is written for a generator with problems: they are returned.
 */
export function writeGenerated(
  ctx: GenContext,
  only: readonly string[],
  o: { manifest: boolean } = { manifest: true },
): { written: string[]; problems: string[] } {
  const written: string[] = [];
  const problems: string[] = [];
  const unknown = only.filter((p) => !GENERATED_PAGES.includes(p));
  if (unknown.length)
    return { written, problems: [`no generator for ${unknown.join(', ')} (${GENERATED_PAGES.join(', ')})`] };
  for (const g of GENERATORS) {
    if (only.length && !only.includes(g.page)) continue;
    const r = g.build(ctx);
    if (r.problems.length || !r.sections) {
      problems.push(...r.problems);
      continue;
    }
    for (const lang of LANGS) {
      const file = fileOf(ctx.wikiDir, lang, g.page);
      if (!existsSync(file)) continue;
      const text = readFileSync(file, 'utf8');
      const w = withGenerated(text, r.sections[lang]);
      if (w.problem) {
        problems.push(`${lang}/${g.page}.md: ${w.problem}`);
        continue;
      }
      if (w.text !== text) writeFileSync(file, w.text!);
      written.push(`${lang}/${g.page}.md`);
    }
    if (o.manifest && r.identifiers) {
      const mf = resolve(ctx.wikiDir, 'manifest.json');
      const before = readFileSync(mf, 'utf8');
      const after = withPageIdentifiers(before, g.page, sortedUnique(r.identifiers));
      if (after !== before) writeFileSync(mf, after);
    }
  }
  return { written, problems };
}
