// The wiki's manifest (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.1, phase A2): the real `wiki/manifest.json` passes
// `wiki -- check` with no error; its ids and URLs are unique (URLs without case, as a wiki compares page names); every
// URL follows `EN-<Domain>-<Topic>` / `FR-<Domaine>-<Sujet>` with its domain's fixed word; both languages are there;
// the generated indexes, the counter-example page and the three demonstrators' pages are in it. The counts by state,
// domain, type and language are printed: they are the workload estimate the plan asks for.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkWiki, trackedFiles, wikiStats } from '../tools/wiki/check';
import { readGlossary } from '../tools/wiki/glossary';
import {
  DOMAIN_IDS,
  GENERATED_INDEXES,
  LANGS,
  ManifestSchema,
  readManifest,
  URL_ACRONYMS,
  urlProblem,
} from '../tools/wiki/manifest';

const WIKI = resolve('wiki');
const { manifest, errors } = readManifest(WIKI);

describe('the wiki manifest', { timeout: 300_000 }, () => {
  it('is valid', () => {
    expect(errors).toEqual([]);
    expect(manifest).toBeDefined();
  });

  it('passes `wiki -- check` with no error, every source glob matching a tracked file', () => {
    const report = checkWiki({ wikiDir: WIKI, tracked: trackedFiles() });
    expect(report.errors).toEqual([]);
  });

  it('gives each page a unique id and two unique URLs, compared without case', () => {
    const ids = manifest!.pages.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const urls = manifest!.pages.flatMap((p) => LANGS.map((l) => p.url[l].toLowerCase()));
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('follows the URL convention in both languages, with a title in each', () => {
    for (const p of manifest!.pages)
      for (const lang of LANGS) {
        expect(urlProblem(lang, p.domain, p.url[lang]), `${p.id} ${lang}`).toBeUndefined();
        expect(p.title[lang].trim(), `${p.id} ${lang}`).not.toBe('');
      }
  });

  it('holds the generated indexes, the counter-example page and the demonstrators of §13', () => {
    const byId = new Map(manifest!.pages.map((p) => [p.id, p]));
    for (const id of GENERATED_INDEXES) expect(byId.get(id), id).toMatchObject({ type: 'index', generated: true });
    expect(manifest!.pages.filter((p) => p.generated).map((p) => p.id)).toEqual([...GENERATED_INDEXES]);
    expect(byId.get('index.not-supported')?.type).toBe('explanation');
    expect(byId.get('clever.restore-drill')).toMatchObject({
      type: 'howto',
      versions: { appliesFrom: '4.2.2' },
      url: { en: 'EN-Clever-Restore-Drill', fr: 'FR-Clever-Exercice-De-Restauration' },
    });
    expect(byId.get('reference.environment-variables')?.type).toBe('reference');
    for (const id of ['team.write-refused-423', 'team.write-refused-409'])
      expect(byId.get(id)?.questions.fr.length, id).toBeGreaterThan(0);
  });

  it('seeds the bilingual glossary with the project words and their synonyms', () => {
    const { glossary, errors: glossaryErrors } = readGlossary(WIKI);
    expect(glossaryErrors).toEqual([]);
    expect(glossary.terms.length).toBeGreaterThanOrEqual(15);
    const lease = glossary.terms.find((t) => t.id === 'lease');
    expect([lease?.fr.term, ...(lease?.fr.synonyms ?? [])]).toEqual(expect.arrayContaining(['bail', 'verrou']));
  });

  it('counts the pages by state, domain, type and language (the workload estimate)', () => {
    const stats = wikiStats(manifest!, WIKI);
    console.log(`wiki: ${JSON.stringify(stats)}`);
    expect(stats.total).toBe(manifest!.pages.length);
    expect(Object.values(stats.byState).reduce((a, b) => a + b, 0)).toBe(stats.total);
    // Every domain of Annex A has its pages; Help has none in the catalogue (its troubleshooting lives by domain).
    for (const d of DOMAIN_IDS.filter((x) => x !== 'help')) expect(stats.byDomain[d], d).toBeGreaterThan(0);
  });
});

describe('the URL convention', () => {
  it('takes the fixed word of the domain in the page language, then capitalised ASCII words', () => {
    expect(urlProblem('en', 'studio', 'EN-Studio-Conflicts')).toBeUndefined();
    expect(urlProblem('fr', 'create', 'FR-Creer-Commandes-Du-Jeu')).toBeUndefined();
    expect(urlProblem('fr', 'team', 'FR-Equipe-Ecriture-Refusee-423')).toBeUndefined();
    expect(urlProblem('fr', 'create', 'FR-Create-Salles')).toMatch(/starts with "FR-Creer-"/);
    expect(urlProblem('en', 'create', 'FR-Creer-Salles')).toMatch(/starts with "EN-Create-"/);
    expect(urlProblem('fr', 'team', 'FR-Equipe-Écriture')).toMatch(/ASCII words/);
    expect(urlProblem('en', 'create', 'EN-Create-game-commands')).toMatch(/capitalised/);
    expect(urlProblem('en', 'create', 'EN-Create-')).toMatch(/ASCII words/);
    expect(urlProblem('en', 'reference', 'EN-Reference-Npm-Scripts')).toMatch(/acronyms in capitals \(NPM\)/);
    expect(urlProblem('en', 'reference', 'EN-Reference-NPM-Scripts')).toBeUndefined();
  });

  it('writes every acronym of the manifest in capitals', () => {
    for (const p of manifest!.pages)
      for (const lang of LANGS)
        for (const word of p.url[lang].split('-'))
          if (URL_ACRONYMS.includes(word.toUpperCase())) expect(word, `${p.id} ${lang}`).toBe(word.toUpperCase());
    expect(manifest!.pages.find((p) => p.id === 'create.dsl')?.url).toEqual({
      en: 'EN-Create-DSL-Reference',
      fr: 'FR-Creer-Reference-DSL',
    });
  });

  it('refuses a manifest with a duplicate id or a duplicate URL', () => {
    const page = manifest!.pages.find((p) => p.id === 'create.rooms')!;
    const twice = { format: manifest!.format, version: 1, pages: [page, page] };
    const issues = ManifestSchema.safeParse(twice).error?.issues.map((i) => i.message) ?? [];
    expect(issues.some((m) => m.includes('used twice'))).toBe(true);
    const sameUrl = { ...twice, pages: [page, { ...page, id: 'create.rooms-again' }] };
    const urlIssues = ManifestSchema.safeParse(sameUrl).error?.issues.map((i) => i.message) ?? [];
    expect(urlIssues.some((m) => m.includes('is already create.rooms'))).toBe(true);
  });

  it('refuses a field the schema does not name, and an id outside its domain; takes keywords and claims', () => {
    const page = manifest!.pages.find((p) => p.id === 'create.rooms')!;
    // One page alone: the pages it points at (related, prerequisites) are not in this manifest.
    const one = (p: object) => ({
      format: manifest!.format,
      version: 1,
      pages: [{ ...p, related: [], prerequisites: [] }],
    });
    expect(ManifestSchema.safeParse(one({ ...page, tags: [] })).success).toBe(false);
    expect(ManifestSchema.safeParse(one({ ...page, keywords: { en: ['a'], fr: ['b'] } })).success).toBe(true);
    expect(ManifestSchema.safeParse(one({ ...page, claims: [{ id: 'c', test: 'tests/x.test.ts › y' }] })).success).toBe(
      true,
    );
    const wrong = ManifestSchema.safeParse(one({ ...page, id: 'studio.rooms' }));
    expect(wrong.error?.issues.map((i) => i.message)).toContain('the id starts with its domain ("create.")');
  });
});
