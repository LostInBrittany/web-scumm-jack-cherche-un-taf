// The bilingual glossary (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.1 "By vocabulary" and §4.7.1): the project's
// words in English and in French, with the synonyms a reader may type instead (lease, bail, verrou). The vocabulary
// index is generated from it, and A4's search follows its synonyms, so "conflit de verrou" finds the page about a 423.
// A term names the pages that explain it by id; the wiki only links the ones that are published.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { issuesOf, PAGE_ID } from './manifest';

const side = z
  .object({
    term: z.string().trim().min(1).max(60),
    synonyms: z.array(z.string().trim().min(1).max(60)),
    definition: z.string().trim().min(1).max(400),
  })
  .strict();

const GlossarySchema = z
  .object({
    format: z.literal('quest-n-click-docs-glossary'),
    version: z.literal(1),
    terms: z.array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
          en: side,
          fr: side,
          pages: z.array(z.string().regex(PAGE_ID)),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((g, ctx) => {
    const seen = new Set<string>();
    g.terms.forEach((t, i) => {
      if (seen.has(t.id))
        ctx.addIssue({ code: 'custom', message: `the term ${t.id} is given twice`, path: ['terms', i] });
      seen.add(t.id);
    });
  });
export type Glossary = z.infer<typeof GlossarySchema>;

/** `<wiki>/data/glossary.json`, an empty glossary when there is none, or what is wrong with it. */
export function readGlossary(wikiDir: string): { glossary: Glossary; errors: string[] } {
  const empty: Glossary = { format: 'quest-n-click-docs-glossary', version: 1, terms: [] };
  const file = resolve(wikiDir, 'data', 'glossary.json');
  if (!existsSync(file)) return { glossary: empty, errors: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { glossary: empty, errors: [`data/glossary.json: ${(e as Error).message}`] };
  }
  const parsed = GlossarySchema.safeParse(raw);
  if (!parsed.success) return { glossary: empty, errors: issuesOf(parsed.error).map((l) => `data/glossary.json ${l}`) };
  return { glossary: parsed.data, errors: [] };
}
