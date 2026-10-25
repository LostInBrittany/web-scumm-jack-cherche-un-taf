// The wiki's manifest (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.1, L1; ADR 0030): the map of the documentation.
// One entry per page, whether it is written yet or not: its stable id, what it is for (type), who it is for (audience),
// where its commands run (context), its two titles and its two public URLs, its state, the code it rests on (sources),
// the old pages it replaces, and the words a reader would search with (questions, aliases, identifiers). The schema is
// strict: a field it does not name is refused, so a misspelt key is an error and not a silently ignored one. The URLs
// are mechanical (`EN-<Domain>-<Topic>`, `FR-<Domaine>-<Sujet>`, a fixed word per domain), so the check can tell a
// wrong one from a right one without a table of exceptions.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { compareVersions } from './docs';
import { SEMVER } from './page';

/** The thirteen domains (§4.1), each with its fixed word in an English and in a French URL. The order is the sidebars'. */
const DOMAINS = {
  index: { en: 'Index', fr: 'Index' },
  start: { en: 'Start', fr: 'Demarrer' },
  play: { en: 'Play', fr: 'Jouer' },
  install: { en: 'Install', fr: 'Installer' },
  create: { en: 'Create', fr: 'Creer' },
  engine: { en: 'Engine', fr: 'Moteur' },
  studio: { en: 'Studio', fr: 'Studio' },
  team: { en: 'Team', fr: 'Equipe' },
  clever: { en: 'Clever', fr: 'Clever' },
  bridge: { en: 'Bridge', fr: 'Bridge' },
  contribute: { en: 'Contribute', fr: 'Contribuer' },
  reference: { en: 'Reference', fr: 'Reference' },
  help: { en: 'Help', fr: 'Aide' },
} as const;
export type Domain = keyof typeof DOMAINS;
export const DOMAIN_IDS = Object.keys(DOMAINS) as Domain[];

export const PAGE_TYPES = ['tutorial', 'howto', 'reference', 'explanation', 'troubleshooting', 'index'] as const;
export type PageType = (typeof PAGE_TYPES)[number];
export const AUDIENCES = ['player', 'author', 'admin', 'contributor'] as const;
export type Audience = (typeof AUDIENCES)[number];
export const CONTEXTS = [
  'engine-repo',
  'created-project',
  'studio-local',
  'studio-demo',
  'studio-hosted',
  'bridge',
  'player',
] as const;
export type Context = (typeof CONTEXTS)[number];
/** `planned`: decided, no file. `draft`: a file, checks incomplete, previews only. `ready`: reviewed, published. */
export const STATES = ['planned', 'draft', 'ready'] as const;
export const LANGS = ['en', 'fr'] as const;
export type Lang = (typeof LANGS)[number];

const MANIFEST_FORMAT = 'quest-n-click-docs-manifest';
/** The pages `wiki -- build` makes from data (§4.1, the four indexes): marked `generated: true`, with no source file. */
export const GENERATED_INDEXES = ['index.by-task', 'index.by-symptom', 'index.identifiers', 'index.glossary'] as const;

/** A page id: `<domain>.<slug>`, the slug in lowercase kebab case. It names the source file and never moves. */
export const PAGE_ID = /^([a-z]+)\.([a-z0-9]+(?:-[a-z0-9]+)*)$/;
/** The words of a URL after its domain: ASCII, each starting with a capital or a digit, joined by hyphens. */
const URL_WORDS = /^[A-Z0-9][A-Za-z0-9]*(?:-[A-Z0-9][A-Za-z0-9]*)*$/;
/** Acronyms are written in capitals in a URL, always the same way (`EN-Reference-NPM-Scripts`, never `Npm`). */
export const URL_ACRONYMS = [
  'DSL',
  'FAQ',
  'NPM',
  'API',
  'MCP',
  'CLI',
  'TLS',
  'RPO',
  'RTO',
  'OIDC',
  'SDK',
  'SSH',
  'URL',
  'CI',
  'AI',
  'IA',
];

/** Why a public URL breaks the convention for this domain and language, or undefined when it follows it. */
export function urlProblem(lang: Lang, domain: Domain, url: string): string | undefined {
  const prefix = `${lang.toUpperCase()}-${DOMAINS[domain][lang]}-`;
  if (!url.startsWith(prefix)) return `starts with "${prefix}" (domain ${domain}, ${lang})`;
  if (!URL_WORDS.test(url.slice(prefix.length)))
    return 'continues with ASCII words, each capitalised, joined by hyphens (EN-Studio-Conflicts)';
  const acronyms = url
    .slice(prefix.length)
    .split('-')
    .filter((w) => URL_ACRONYMS.includes(w.toUpperCase()) && w !== w.toUpperCase());
  if (acronyms.length) return `writes its acronyms in capitals (${acronyms.map((w) => w.toUpperCase()).join(', ')})`;
  return undefined;
}

const text = (max: number) => z.string().trim().min(1).max(max);
const version = z.string().regex(SEMVER, 'a product version, as SemVer writes it (4.5.0, 4.5.0-rc.1)');
const bilingual = <T extends z.ZodType>(item: T) => z.object({ en: item, fr: item }).strict();
const unique = <T extends z.ZodType>(item: T) =>
  z.array(item).refine((a) => new Set(a).size === a.length, { message: 'no item twice' });

const PageSchema = z
  .object({
    id: z.string().regex(PAGE_ID, 'an id <domain>.<slug> in lowercase kebab case (create.rooms)'),
    domain: z.enum(DOMAIN_IDS as [Domain, ...Domain[]]),
    /** What the page is for, first; a page that also does a second job says it in `alsoTypes`. */
    type: z.enum(PAGE_TYPES),
    alsoTypes: unique(z.enum(PAGE_TYPES)).optional(),
    audience: unique(z.enum(AUDIENCES)).min(1),
    context: unique(z.enum(CONTEXTS)).min(1),
    title: bilingual(text(140)),
    url: bilingual(text(100)),
    state: z.enum(STATES),
    /**
     * Built from data by `wiki -- build` (the four indexes): no source file, never one; published with the first
     * published page.
     */
    generated: z.literal(true).optional(),
    /** The product versions for which what the page describes is true (§4.4.1); required from `draft` on. */
    versions: z
      .object({ appliesFrom: version, appliesUntil: version.optional(), featureSince: version.optional() })
      .strict()
      .refine((v) => !v.appliesUntil || compareVersions(v.appliesFrom, v.appliesUntil) <= 0, {
        message: 'appliesUntil is not before appliesFrom',
      })
      .refine((v) => !v.featureSince || !v.appliesUntil || compareVersions(v.featureSince, v.appliesUntil) <= 0, {
        message: 'featureSince is not after appliesUntil',
      })
      .optional(),
    /**
     * A page kept for older versions (§9, "Obsolete pages"): `deprecated`, then `archived`. It is no longer current:
     * search_docs shows it only with includeArchived, and a publication accepts its `appliesUntil` before the product.
     */
    lifecycle: z.enum(['deprecated', 'archived']).optional(),
    /**
     * The surfaces the page documents, ids of docs/dev/contracts.json (§4.4.2): the header shows each one's five
     * statuses, generated from the registry, never typed.
     */
    surfaces: unique(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).optional(),
    /**
     * Globs of the tracked files the page rests on (code, schemas, tests, qualifications): its drift sources (§9).
     * Required non-empty from `draft` on; a glob given earlier must already match.
     */
    sources: unique(text(200)),
    /**
     * The old sections this page takes over, `docs/en/X.md#anchor` or a root page's (`CONTRIBUTING.md#what-ci-runs`),
     * the anchor as GitHub computes it. Generated from the coverage matrix by `wiki -- coverage`, never typed.
     */
    replaces: unique(z.string().regex(/^(docs\/(en|fr)\/[A-Za-z0-9_.-]+|[A-Z_]+(\.fr)?)\.md(#[^\s#]*)?$/)),
    /** Natural-language questions a reader asks; at least one per language for a how-to or a troubleshooting page. */
    questions: bilingual(unique(text(200))),
    /** Other names a reader may use: an old name, a common word, a synonym. */
    aliases: bilingual(unique(text(80))),
    /** Search words that are neither a name of the page nor a question (A4's search indexes them). */
    keywords: bilingual(unique(text(80))).optional(),
    /** Exact identifiers the page documents: a DSL command, an npm script, a variable, a route, a code. */
    identifiers: unique(text(120)),
    related: unique(z.string().regex(PAGE_ID)),
    prerequisites: unique(z.string().regex(PAGE_ID)),
    /** The page's guarantees tied to a named test (§4.4.3), `file › name`; A5 adds their states. */
    claims: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
            test: z.string().regex(/^\S+\.test\.ts › .+$/, 'a test as "file.test.ts › its name"'),
          })
          .strict(),
      )
      .refine((a) => new Set(a.map((c) => c.id)).size === a.length, { message: 'no claim id twice' })
      .optional(),
    /** Who answers for the page; @wanoo when absent (§9). */
    owner: z
      .string()
      .regex(/^@[A-Za-z0-9-]+$/, 'a GitHub handle, @wanoo')
      .optional(),
    /** The day the page was last reviewed against its sources; absent or null when it never was. */
    reviewed: z.iso.date().nullable().optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const say = (message: string, path: (string | number)[]) => ctx.addIssue({ code: 'custom', message, path });
    if (PAGE_ID.exec(p.id)?.[1] !== p.domain) say(`the id starts with its domain ("${p.domain}.")`, ['id']);
    for (const lang of LANGS) {
      const problem = urlProblem(lang, p.domain, p.url[lang]);
      if (problem) say(`the ${lang} URL "${p.url[lang]}" ${problem}`, ['url', lang]);
    }
    if (p.alsoTypes?.includes(p.type)) say('alsoTypes does not repeat the primary type', ['alsoTypes']);
    if (p.related.includes(p.id) || p.prerequisites.includes(p.id)) say('a page does not point at itself', ['related']);
  });
export type Page = z.infer<typeof PageSchema>;

export const ManifestSchema = z
  .object({
    format: z.literal(MANIFEST_FORMAT),
    version: z.literal(1),
    pages: z.array(PageSchema),
  })
  .strict()
  .superRefine((m, ctx) => {
    const say = (message: string, i: number) => ctx.addIssue({ code: 'custom', message, path: ['pages', i] });
    const ids = new Set<string>();
    const urls = new Map<string, string>();
    m.pages.forEach((p, i) => {
      if (ids.has(p.id)) say(`the id ${p.id} is used twice`, i);
      ids.add(p.id);
      for (const lang of LANGS) {
        // URLs are compared without case: a wiki's page names are not case-sensitive.
        const key = p.url[lang].toLowerCase();
        const owner = urls.get(key);
        if (owner) say(`the URL ${p.url[lang]} of ${p.id} is already ${owner}'s`, i);
        urls.set(key, p.id);
      }
    });
    m.pages.forEach((p, i) => {
      for (const ref of [...p.related, ...p.prerequisites])
        if (!ids.has(ref)) say(`${p.id} points at ${ref}, which the manifest does not hold`, i);
    });
  });
export type Manifest = z.infer<typeof ManifestSchema>;

/** Plain lines for a person, one per problem, with where it is (`pages.12.url.fr: …`). */
export function issuesOf(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
}

/** The manifest of a wiki folder (`<dir>/manifest.json`), or the list of what is wrong with it. */
export function readManifest(
  wikiDir: string,
): { manifest: Manifest; errors: [] } | { manifest?: never; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resolve(wikiDir, 'manifest.json'), 'utf8'));
  } catch (e) {
    return { errors: [`manifest.json: ${(e as Error).message}`] };
  }
  const parsed = ManifestSchema.safeParse(raw);
  if (!parsed.success) return { errors: issuesOf(parsed.error).map((l) => `manifest.json ${l}`) };
  return { manifest: parsed.data, errors: [] };
}

/** Every type a page plays: its primary one, then the others. */
export const typesOf = (p: Page): PageType[] => [p.type, ...(p.alsoTypes ?? [])];
