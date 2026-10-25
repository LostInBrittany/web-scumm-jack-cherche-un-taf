// `npm run wiki -- build --target wiki` (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.1 "Generated from the manifest",
// §4.5.6 links by output, §4.5.7 read-only wording): the folder a publication pushes to the GitHub wiki. Generated
// whole from `wiki/`, never edited there: `Home.md` (both languages side by side), a sidebar per language grouped by
// domain, a footer that says the page is generated and how to change it, one file per published page under its public
// URL with a header (the twin's URL, type, audience, context, versions), and the four indexes (by task, by symptom,
// by identifier, by vocabulary). Published means `ready`; `--preview` adds the `draft` pages under a banner. A link to
// another page's source becomes its public URL in the same language; a link to a page not published keeps its text
// and says it is coming; a link to a repository file points at `blob/<productCommit>/` so it shows the code of the
// product the page describes, not today's `main` (an image, at `raw.githubusercontent.com`); an image of `wiki/images/`
// is copied into the output and linked from the wiki's root (a wiki resolves a page's links from its root, whatever
// the page's folder: the A1 spike's question). The four indexes are generated pages: built with the first published
// page, listing published pages only.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { type ClaimState } from './claims';
import type { SurfaceStatus } from './contracts';
import { type Glossary, readGlossary } from './glossary';
import { humanReviewed, type Reviewer, reviewWords } from './reviewer';
import { readTranslations } from './translations';
import { generatedIdentifiers, type Identifier } from './identifiers';
import { siteDocs } from './site';
import {
  type Audience,
  type Context,
  DOMAIN_IDS,
  GENERATED_INDEXES,
  type Domain,
  type Lang,
  LANGS,
  type Manifest,
  type Page,
  type PageType,
  typesOf,
} from './manifest';
import {
  ANCHOR_LINE,
  appliesMarker,
  classifyTarget,
  type Link,
  mapLines,
  mapPage,
  parsePage,
  renderLink,
  type SectionVersions,
} from './page';

const REPO_URL = 'https://github.com/Quest-n-Click/quest-n-click';
const RAW_URL = 'https://raw.githubusercontent.com/Quest-n-Click/quest-n-click';
/** Written into every output folder: a folder without it is not a build, and is never emptied. */
const BUILD_MARKER = '.quest-n-click-wiki-build';

export interface BuildOptions {
  wikiDir: string;
  outDir: string;
  manifest: Manifest;
  /** Include the `draft` pages, each under a banner (a preview artifact, never the public wiki). */
  preview: boolean;
  productVersion: string;
  /** The commit of the `wiki/` sources built. */
  docRevision: string;
  /** The commit of the product the pages describe: links to the code point there. */
  productCommit: string;
  /** The generated identifiers (npm scripts, MCP tools); read from the repository when absent. */
  identifiers?: readonly Identifier[];
  /** The five statuses of each surface (§4.4.2), for the pages that name surfaces; from `wiki -- check`. */
  statuses?: ReadonlyMap<string, SurfaceStatus>;
  /** Each claim's states (§4.4.3), shown on its `[!GUARANTEE]` block; from `wiki -- check`. */
  claims?: readonly ClaimState[];
  /** The doc revision's number (`r1`, `r2`…, §4.5.4), said in the footer; `r1` when absent. */
  docRevisionNumber?: string;
}

/**
 * How an output links (§4.5.6): a page in a language (from a page of `from`), an image of `wiki/images/`, the home
 * page. The wiki links a page by its public URL, resolved by the wiki from its root; the HTML of an archive by a
 * relative path from `html/<lang>/`, so the same files work under `/docs/<v>/r<n>/` and from a disk.
 */
export interface LinkStyle {
  page(p: Pick<Page, 'id' | 'url'>, lang: Lang): string;
  image(path: string): string;
  home: string;
}
const WIKI_STYLE: LinkStyle = { page: (p, lang) => p.url[lang], image: (path) => `images/${path}`, home: 'Home' };
/** The links of an HTML page under `html/<from>/`. */
export const htmlStyle = (from: Lang): LinkStyle => ({
  page: (p, lang) => (lang === from ? `${p.id}.html` : `../${lang}/${p.id}.html`),
  image: (path) => `../assets/${path}`,
  home: '../index.html',
});
/** The release whose documentation a preview points to: the bootstrap happens once, before 4.5.0 (§4.5.3). */
export const BOOTSTRAP_LATEST = '4.4.0';

const L = {
  en: {
    domains: {
      index: 'Index',
      start: 'Start',
      play: 'Play',
      install: 'Install',
      create: 'Create a game',
      engine: 'Engine',
      studio: 'Local Studio',
      team: 'Team Studio',
      clever: 'Clever Cloud',
      bridge: 'Reality Bridge and connectors',
      contribute: 'Contribute',
      reference: 'Reference',
      help: 'Help',
    } satisfies Record<Domain, string>,
    types: {
      tutorial: 'tutorial',
      howto: 'how-to',
      reference: 'reference',
      explanation: 'explanation',
      troubleshooting: 'troubleshooting',
      index: 'index',
    } satisfies Record<PageType, string>,
    audiences: { player: 'player', author: 'author', admin: 'admin', contributor: 'contributor' } satisfies Record<
      Audience,
      string
    >,
    contexts: {
      'engine-repo': 'engine repository',
      'created-project': 'created project',
      'studio-local': 'local Studio',
      'studio-demo': 'demo Studio',
      'studio-hosted': 'hosted Studio',
      bridge: 'Reality Bridge',
      player: "player's browser",
    } satisfies Record<Context, string>,
    colon: ':',
    status: 'Status',
    states: { planned: 'planned', draft: 'draft', ready: 'ready', generated: 'generated' },
    // What a published page's one-line header says of it (the 4.5.1 audit, F18): published, and who read it.
    published: {
      person: 'Published, reviewed by a person',
      partly: 'Published, partly reviewed by a person',
      independent: 'Published, checked by an independent AI, not reviewed by a person',
      author: 'Published, written and self-checked by an AI, not reviewed by a person',
      none: 'Published, no review recorded',
      generated: 'Generated from the published pages',
    } satisfies Record<PageReview | 'generated', string>,
    qualification: 'Audience, context, and the statuses of what this page rests on',
    synonyms: 'also',
    twinLanguage: 'French',
    type: 'Type',
    audience: 'Audience',
    context: 'Context',
    appliesFrom: 'Applies from',
    other: 'Français',
    home: 'Home',
    draft: '**Draft**: this page is not reviewed yet. It is shown in a preview only, never in the published wiki.',
    preview: (v: string) =>
      `**Preview of the ${v} documentation**: latest published release ${BOOTSTRAP_LATEST}, its documentation is at [blob/v${BOOTSTRAP_LATEST}/docs/](${REPO_URL}/blob/v${BOOTSTRAP_LATEST}/docs/).`,
    coming: 'coming',
    edit: 'Edit the source of this page',
    report: 'Report an error',
    noPage: 'No published page yet.',
    byTask: 'I want to…',
    bySymptom: 'I see…',
    otherNames: 'Other names',
    contract: 'contract',
    contracts: { experimental: 'experimental', stable: 'stable', deprecated: 'deprecated' },
    verified: (v: string, d: string) => `verified by CI (support matrix of ${v}, ${d})`,
    checks: 'automated checks',
    jobs: 'jobs',
    gates: 'CI plan',
    tests: (n: number) => `${n} test file${n === 1 ? '' : 's'}`,
    passes: "people's passes",
    passStates: {
      passed: 'passed',
      failed: 'failed',
      blocked: 'blocked',
      'not-run': 'not run',
      'not-asked': 'not asked yet',
    },
    none: 'none',
    limits: 'known limits',
    noLimit: 'none listed on this page',
    claim: {
      referenced: 'referenced',
      unreferenced: 'not referenced',
      executed: 'executed on',
      reviewed: 'scope',
    },
    applies: (v: SectionVersions) =>
      [
        v.appliesFrom && v.appliesUntil
          ? `Applies from ${v.appliesFrom} to ${v.appliesUntil}`
          : v.appliesFrom
            ? `Applies from ${v.appliesFrom}`
            : v.appliesUntil
              ? `Applies until ${v.appliesUntil}`
              : '',
        v.featureSince ? `feature since ${v.featureSince}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
  },
  fr: {
    domains: {
      index: 'Index',
      start: 'Démarrer',
      play: 'Jouer',
      install: 'Installer',
      create: 'Créer un jeu',
      engine: 'Moteur',
      studio: 'Studio local',
      team: "Studio d'équipe",
      clever: 'Clever Cloud',
      bridge: 'Reality Bridge et connecteurs',
      contribute: 'Contribuer',
      reference: 'Référence',
      help: 'Aide',
    } satisfies Record<Domain, string>,
    types: {
      tutorial: 'tutoriel',
      howto: 'procédure',
      reference: 'référence',
      explanation: 'explication',
      troubleshooting: 'dépannage',
      index: 'index',
    } satisfies Record<PageType, string>,
    audiences: {
      player: 'joueur',
      author: 'auteur',
      admin: 'administrateur',
      contributor: 'contributeur',
    } satisfies Record<Audience, string>,
    contexts: {
      'engine-repo': 'dépôt du moteur',
      'created-project': 'projet créé',
      'studio-local': 'Studio local',
      'studio-demo': 'Studio de démo',
      'studio-hosted': 'Studio hébergé',
      bridge: 'Reality Bridge',
      player: 'navigateur du joueur',
    } satisfies Record<Context, string>,
    colon: ' :',
    status: 'Statut',
    states: { planned: 'prévue', draft: 'brouillon', ready: 'prête', generated: 'générée' },
    published: {
      person: 'Publiée, relue par une personne',
      partly: 'Publiée, relue en partie par une personne',
      independent: 'Publiée, vérifiée par une IA indépendante, pas relue par une personne',
      author: 'Publiée, écrite et vérifiée par une IA, pas relue par une personne',
      none: 'Publiée, aucune relecture enregistrée',
      generated: 'Générée depuis les pages publiées',
    } satisfies Record<PageReview | 'generated', string>,
    qualification: 'Public, contexte, et statuts de ce sur quoi repose la page',
    synonyms: 'aussi',
    twinLanguage: 'anglais',
    type: 'Type',
    audience: 'Public',
    context: 'Contexte',
    appliesFrom: "S'applique depuis",
    other: 'English',
    home: 'Accueil',
    draft:
      "**Brouillon** : cette page n'est pas encore relue. Elle n'apparaît que dans un aperçu, jamais dans le wiki publié.",
    preview: (v: string) =>
      `**Aperçu de la documentation de la ${v}** : dernière version publiée ${BOOTSTRAP_LATEST}, sa documentation est sur [blob/v${BOOTSTRAP_LATEST}/docs/](${REPO_URL}/blob/v${BOOTSTRAP_LATEST}/docs/).`,
    coming: 'à venir',
    edit: 'Modifier la source de cette page',
    report: 'Signaler une erreur',
    noPage: "Aucune page publiée pour l'instant.",
    byTask: 'Je veux…',
    bySymptom: 'Je vois…',
    otherNames: 'Autres noms',
    contract: 'contrat',
    contracts: { experimental: 'expérimental', stable: 'stable', deprecated: 'déprécié' },
    verified: (v: string, d: string) => `vérifié par la CI (matrice de support de la ${v}, ${d})`,
    checks: 'vérifications automatiques',
    jobs: 'jobs',
    gates: 'plan de CI',
    tests: (n: number) => `${n} fichier${n === 1 ? '' : 's'} de tests`,
    passes: 'passes humaines',
    passStates: {
      passed: 'passée',
      failed: 'échouée',
      blocked: 'bloquée',
      'not-run': 'pas faite',
      'not-asked': 'pas encore demandée',
    },
    none: 'aucune',
    limits: 'limites connues',
    noLimit: 'aucune listée sur cette page',
    claim: {
      referenced: 'référencée',
      unreferenced: 'non référencée',
      executed: 'exécutée sur',
      reviewed: 'portée',
    },
    applies: (v: SectionVersions) =>
      [
        v.appliesFrom && v.appliesUntil
          ? `S'applique de la ${v.appliesFrom} à la ${v.appliesUntil}`
          : v.appliesFrom
            ? `S'applique depuis la ${v.appliesFrom}`
            : v.appliesUntil
              ? `S'applique jusqu'à la ${v.appliesUntil}`
              : '',
        v.featureSince ? `fonction apparue en ${v.featureSince}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
  },
} as const;

const BLOCK_NAMES = {
  en: { LIMIT: 'Limit', GUARANTEE: 'Guarantee', MEASURE: 'Measure' },
  fr: { LIMIT: 'Limite', GUARANTEE: 'Garantie', MEASURE: 'Mesure' },
} as const;

/**
 * The footer of every page: what the publication is (the wiki shows the current version only, §4.5.4: a preview says
 * it is one), where the earlier versions are, and that an edit made in the wiki does not last.
 */
const footer = (productVersion: string, docRevision: string, revision: string, preview: boolean) =>
  `Generated publication · publication générée — ${preview ? `preview of the ${productVersion} documentation · aperçu de la documentation de la ${productVersion}` : `current documentation · documentation courante: quest'n'click ${productVersion} ${revision}`}, documentation revision · révision de la documentation \`${docRevision}\`.
Latest documentation · dernière documentation: ${siteDocs('en')} · ${siteDocs('fr')}; earlier versions · versions précédentes: each release's \`quest-n-click-docs-<version>.tar.gz\` · l'archive \`quest-n-click-docs-<version>.tar.gz\` de chaque release, ${REPO_URL}/releases
An edit made in this wiki is overwritten at the next publication · une modification faite dans ce wiki est écrasée à la publication suivante.
[Edit the source · Modifier la source](${REPO_URL}/tree/main/wiki) · [Report an error · Signaler une erreur](${REPO_URL}/issues/new?title=${encodeURIComponent('[bug] docs: ')})
`;

/** The pages this build publishes: `ready`, and `draft` too in a preview. */
const publishedPages = (manifest: Manifest, preview: boolean): Page[] =>
  manifest.pages.filter((p) => p.state === 'ready' || (preview && p.state === 'draft'));

/**
 * The page's body for one language, its links rewritten for the wiki (§4.5.6) and its blocks named; the images of
 * `wiki/images/` it shows are added to `images`, to be copied.
 */
function rewritePage(
  markdown: string,
  lang: Lang,
  urls: ReadonlyMap<string, string>,
  productCommit: string,
  images: Set<string>,
  claims: ReadonlyMap<string, ClaimState> = new Map(),
  style: LinkStyle = WIKI_STYLE,
): string {
  const rewrite = (l: Link): string | undefined => {
    const t = classifyTarget(l.target, lang);
    const to = (target: string) => renderLink({ ...l, target });
    if (t.kind === 'page') {
      const url = urls.get(t.id);
      return url ? to(`${url}${t.anchor ? `#${t.anchor}` : ''}`) : `${l.label} (${L[lang].coming})`;
    }
    if (t.kind === 'repo')
      return l.image
        ? to(`${RAW_URL}/${productCommit}/${t.path}`)
        : to(`${REPO_URL}/blob/${productCommit}/${t.path}${t.anchor ? `#${t.anchor}` : ''}`);
    if (t.kind === 'wiki-image') {
      images.add(t.path);
      return to(style.image(t.path));
    }
    return undefined;
  };
  const t = L[lang];
  const claimWords = (c: ClaimState | undefined) =>
    !c
      ? ''
      : ` · ${[
          c.unreferenced ? t.claim.unreferenced : t.claim.referenced,
          ...(c.executedOn ? [`${t.claim.executed} \`${c.executedOn.slice(0, 12)}\``] : []),
          ...(reviewWords(c.reviewed, lang) ? [`${t.claim.reviewed} ${reviewWords(c.reviewed, lang)}`] : []),
        ].join(' · ')}`;
  return mapPage(
    showVersions(markdown, lang),
    rewrite,
    (kind, id) =>
      `> **${BLOCK_NAMES[lang][kind]}** · \`${id}\`${kind === 'GUARANTEE' ? claimWords(claims.get(id)) : ''}`,
  );
}

/**
 * A section's applies marker is a comment, unseen once rendered: it is moved under the section's heading as a line a
 * reader sees ("Applies from 4.2.2 to 4.4.0").
 */
function showVersions(markdown: string, lang: Lang): string {
  let pending: SectionVersions | undefined;
  let afterAnchor = false;
  return mapLines(markdown, (line) => {
    const t = line.trim();
    if (ANCHOR_LINE.test(t)) {
      afterAnchor = true;
      return line;
    }
    const marker = afterAnchor ? appliesMarker(t) : undefined;
    if (t) afterAnchor = false;
    if (marker) {
      pending = marker;
      return '';
    }
    if (pending && /^#{1,6}\s/.test(t)) {
      const note = L[lang].applies(pending);
      pending = undefined;
      return note ? `${line}\n\n> *${note}*` : line;
    }
    return line;
  }).text;
}

/**
 * The page's surfaces, each with its five statuses kept apart (§4.4.2): the contract, the environments CI verifies,
 * the automated checks, the people's passes with their issues, and the page's known limits.
 */
function statusBlock(p: Page, lang: Lang, statuses: ReadonlyMap<string, SurfaceStatus>, limits: string[]): string[] {
  const t = L[lang];
  const issue = (n: number) => `[#${n}](${REPO_URL}/issues/${n})`;
  return (p.surfaces ?? []).flatMap((id) => {
    const s = statuses.get(id);
    if (!s) return [];
    const checks = [
      ...(s.checks.jobs.length ? [`${t.jobs} ${s.checks.jobs.map((j) => `\`${j}\``).join(', ')}`] : []),
      ...(s.checks.gates.length ? [`${t.gates} ${s.checks.gates.map((g) => `\`${g}\``).join(', ')}`] : []),
      ...(s.checks.tests.length ? [t.tests(s.checks.tests.length)] : []),
    ];
    const parts = [
      `${t.contract}${t.colon} ${t.contracts[s.contract]}`,
      `${t.verified(s.asOf.version, s.asOf.date)}${t.colon} ${s.environments.map((e) => e[lang]).join(lang === 'fr' ? ' ; ' : '; ') || t.none}`,
      `${t.checks}${t.colon} ${checks.join(lang === 'fr' ? ' ; ' : '; ') || t.none}`,
      `${t.passes}${t.colon} ${
        s.passes
          .map((x) => `\`${x.id}\` ${t.passStates[x.state]}${x.issue ? ` (${issue(x.issue)})` : ''}`)
          .join(', ') || t.none
      }`,
      `${t.limits}${t.colon} ${limits.length ? limits.map((l) => `\`${l}\``).join(', ') : t.noLimit}`,
    ];
    return [`> **${s.title[lang]}** · ${parts.join(' · ')}`];
  });
}

/** Who read a published page, from its translation pairs' reviewers (reviewer.ts): a person, an AI, or nobody yet. */
export type PageReview = 'person' | 'partly' | 'independent' | 'author' | 'none';
export function pageReview(
  id: string,
  pairs: Readonly<Record<string, { reviewers: readonly Reviewer[] }>>,
): PageReview {
  const mine = Object.entries(pairs)
    .filter(([key]) => key.startsWith(`${id}#`))
    .map(([, v]) => v.reviewers);
  if (!mine.length) return 'none';
  const human = mine.filter((r) => humanReviewed(r)).length;
  if (human === mine.length) return 'person';
  if (human) return 'partly';
  return mine.every((r) => r.some((x) => x.relation === 'independent')) ? 'independent' : 'author';
}

/**
 * The page's one-line header, under its title (the 4.5.1 audit, F17 and F18): the twin, the type, what the page is
 * (published, and who read it: a person or an AI, never just "ready"), the versions. Short, so the page's first answer
 * stays on the first screen; the audience, the context and the surfaces' statuses follow its lead, folded
 * (`qualification`).
 */
function header(p: Page, lang: Lang, style: LinkStyle, review: PageReview): string {
  const t = L[lang];
  const twin = lang === 'en' ? 'fr' : 'en';
  const type = typesOf(p)
    .map((x) => t.types[x])
    .join(' + ');
  const parts = [
    `[${t.other}](${style.page(p, twin)})`,
    `${type[0]!.toUpperCase()}${type.slice(1)}`,
    p.generated
      ? t.published.generated
      : p.state === 'ready'
        ? t.published[review]
        : `${t.status}: ${t.states[p.state]}`,
  ];
  if (p.versions?.appliesFrom) parts.push(`${t.appliesFrom}: ${p.versions.appliesFrom}`);
  // The labels hold no colon of their own: French puts a space before each one.
  return `> ${parts.join(' · ').replace(/: /g, `${t.colon} `)}`;
}

/** The page's qualification, folded: its audience and context, then each surface's five statuses (`statusBlock`). */
function qualification(p: Page, lang: Lang, status: readonly string[]): string {
  const t = L[lang];
  const who = `> ${[
    `${t.audience}: ${p.audience.map((a) => t.audiences[a]).join(', ')}`,
    `${t.context}: ${p.context.map((c) => t.contexts[c]).join(', ')}`,
  ]
    .join(' · ')
    .replace(/: /g, `${t.colon} `)}`;
  return `<details><summary>${t.qualification}</summary>\n\n${[who, ...status].join('\n>\n')}\n\n</details>`;
}

const pageFooter = (p: Page, lang: Lang, productVersion: string) =>
  `[${L[lang].edit}](${REPO_URL}/edit/main/wiki/${lang}/${p.id}.md) · [${L[lang].report}](${REPO_URL}/issues/new?title=${encodeURIComponent(`[bug] docs: ${p.id} (${lang}, ${productVersion})`)})`;

const link = (p: Page, lang: Lang, style: LinkStyle) => `[${p.title[lang]}](${style.page(p, lang)})`;
const byText = (lang: Lang) => (a: { text: string }, b: { text: string }) => a.text.localeCompare(b.text, lang);

/** The four generated indexes of one language (§4.1), over the published pages only. */
function indexPages(
  manifest: Manifest,
  published: readonly Page[],
  glossary: Glossary,
  generated: readonly Identifier[],
  lang: Lang,
  style: LinkStyle,
): { id: string; body: string }[] {
  const t = L[lang];
  const link = (p: Page, l: Lang) => `[${p.title[l]}](${style.page(p, l)})`;
  const urls = new Set(published.map((p) => p.id));
  const list = (rows: { text: string; to: Page }[]) =>
    rows.length ? rows.sort(byText(lang)).map((r) => `- ${r.text} → ${link(r.to, lang)}`) : [t.noPage];
  const of = (types: PageType[], withTitle: boolean) =>
    published
      .filter((p) => typesOf(p).some((x) => types.includes(x)))
      .flatMap((p) => [
        ...(withTitle ? [{ text: p.title[lang], to: p }, ...p.aliases[lang].map((a) => ({ text: a, to: p }))] : []),
        ...p.questions[lang].map((q) => ({ text: q, to: p })),
      ]);
  // Every identifier a published page claims, the generated ones (npm scripts, MCP tools) among them; one claimed by
  // no published page is not listed: the index points at pages only.
  const known = new Set([...generated.map((i) => i.id), ...published.flatMap((p) => p.identifiers)]);
  const identifiers = [...known].flatMap((i) =>
    published.filter((p) => p.identifiers.includes(i)).map((p) => ({ text: `\`${i}\``, to: p })),
  );
  const vocabulary: string[] = glossary.terms
    .map((term) => ({ term, text: term[lang].term }))
    .sort(byText(lang))
    .map(({ term }) => {
      const side = term[lang];
      const pages = term.pages
        .filter((id) => urls.has(id))
        .map((id) => link(manifest.pages.find((p) => p.id === id)!, lang));
      const other = term[lang === 'en' ? 'fr' : 'en'].term;
      const names = [
        ...(side.synonyms.length ? [`${t.synonyms}${t.colon} ${side.synonyms.join(', ')}`] : []),
        `${t.twinLanguage}${t.colon} ${other}`,
      ];
      return `- **${side.term}** (${names.join(lang === 'fr' ? ' ; ' : '; ')}). ${side.definition}${pages.length ? ` → ${pages.join(', ')}` : ''}`;
    });
  const aliases = published.flatMap((p) => p.aliases[lang].map((a) => ({ text: a, to: p })));
  const bodies: Record<(typeof GENERATED_INDEXES)[number], string[]> = {
    'index.by-task': [`## ${t.byTask}`, '', ...list(of(['tutorial', 'howto'], true))],
    'index.by-symptom': [`## ${t.bySymptom}`, '', ...list(of(['troubleshooting'], false))],
    'index.identifiers': list(identifiers),
    'index.glossary': [
      ...(vocabulary.length ? vocabulary : [t.noPage]),
      ...(aliases.length ? ['', `## ${t.otherNames}`, '', ...list(aliases)] : []),
    ],
  };
  return GENERATED_INDEXES.flatMap((id) => {
    const page = generatedPages(manifest, published).find((p) => p.id === id);
    if (!page) return [];
    return [
      { id, body: `# ${page.title[lang]}\n\n${header(page, lang, style, 'none')}\n\n${bodies[id].join('\n')}\n` },
    ];
  });
}

/** The generated pages this build makes: none until a page is published, then those of the manifest. */
const generatedPages = (manifest: Manifest, published: readonly Page[]) =>
  published.length ? manifest.pages.filter((p) => p.generated) : [];

/** The pages a sidebar or Home lists: the published ones and the generated indexes, in the manifest's order. */
const listed = (manifest: Manifest, published: readonly Page[]) => {
  const ids = new Set([...published, ...generatedPages(manifest, published)].map((p) => p.id));
  return manifest.pages.filter((p) => ids.has(p.id));
};

// A sidebar of a hundred links reads like a wall: each domain folds (`<details>`), its name and page count showing.
function sidebar(manifest: Manifest, published: readonly Page[], lang: Lang, style: LinkStyle): string {
  const pages = listed(manifest, published);
  const out = [`**[${L[lang].home}](${style.home})**`, ''];
  for (const d of DOMAIN_IDS) {
    const inDomain = pages.filter((p) => p.domain === d);
    if (!inDomain.length) continue;
    out.push(
      `<details><summary>${L[lang].domains[d]} (${inDomain.length})</summary>`,
      '',
      ...inDomain.map((p) => `- ${link(p, lang, style)}`),
      '',
      '</details>',
      '',
    );
  }
  return `${out.join('\n').trimEnd()}\n`;
}

/**
 * The sidebar of Home and of any page outside the language folders (the 4.5.1 audit, F23): GitHub gives Home none of
 * its own, so without it Home shows only GitHub's own list of every page, its English slugs first. Short and
 * bilingual: the doors and the indexes, French then English, each language's full sidebar one click away.
 */
function homeSidebar(manifest: Manifest, published: readonly Page[]): string {
  const shown = new Map(listed(manifest, published).map((p) => [p.id, p]));
  const block = (lang: Lang) => {
    const doors = DOORS.filter((d) => shown.has(d.id)).map(
      (d) => `- [${d.label[lang]}](${shown.get(d.id)!.url[lang]})`,
    );
    const help = HELP.filter((id) => shown.has(id)).map((id) => `- ${link(shown.get(id)!, lang, WIKI_STYLE)}`);
    return [`**${lang === 'fr' ? 'Français' : 'English'}**`, '', ...doors, ...help, ''];
  };
  return `${[`**[${L.fr.home} · ${L.en.home}](Home)**`, '', ...block('fr'), ...block('en')].join('\n').trimEnd()}\n`;
}

/** Home's few doors, in a reader's order: what to do first, one page each, said in a short line. */
const DOORS: readonly { id: string; label: Record<Lang, string>; line: Record<Lang, string> }[] = [
  {
    id: 'start.play-online',
    label: { en: 'Play', fr: 'Jouer' },
    line: {
      en: 'try the demo game in your browser, nothing to install',
      fr: 'essayer le jeu de démo dans le navigateur, sans rien installer',
    },
  },
  {
    id: 'create.first-game',
    label: { en: 'Make a game', fr: 'Créer un jeu' },
    line: { en: 'a first room in fifteen minutes', fr: 'une première salle en quinze minutes' },
  },
  {
    id: 'install.from-archive',
    label: { en: 'Install', fr: 'Installer' },
    line: {
      en: 'the engine on your machine, and a new project',
      fr: 'le moteur sur votre machine, et un nouveau projet',
    },
  },
  {
    id: 'studio.overview',
    label: { en: 'The Studio', fr: 'Le Studio' },
    line: {
      en: 'edit your game with the mouse, with or without an AI',
      fr: 'éditer votre jeu à la souris, avec ou sans IA',
    },
  },
  {
    id: 'team.what-runs-where',
    label: { en: 'Work as a team', fr: 'Travailler à plusieurs' },
    line: { en: 'one game, several people, online', fr: 'un seul jeu, plusieurs personnes, en ligne' },
  },
  {
    id: 'clever.overview',
    label: { en: 'Host it on Clever Cloud', fr: "L'héberger chez Clever Cloud" },
    line: { en: 'the team Studio, step by step', fr: "le Studio d'équipe, pas à pas" },
  },
  {
    id: 'contribute.welcome',
    label: { en: 'Contribute', fr: 'Contribuer' },
    line: { en: 'to the engine itself', fr: 'au moteur lui-même' },
  },
];

/** The ways to look something up, under the doors. */
const HELP: readonly string[] = [
  'index.faq',
  'index.by-task',
  'index.by-symptom',
  'index.identifiers',
  'index.glossary',
];

/** GitHub's code search over one language's page sources: a search of the pages' text, which the wiki's box is not. */
const textSearch = (lang: Lang) =>
  `https://github.com/search?q=${encodeURIComponent(`repo:Quest-n-Click/quest-n-click path:wiki/${lang}/`)}&type=code`;

/**
 * What Home says about searching (the 4.5.1 audit, F09): the box at the top right of a GitHub wiki, "Find a page or
 * section", filters page titles and headings only, never the text; an error message or a variable is found through
 * the indexes, and the text itself through GitHub's code search over the page sources.
 */
function searchNote(lang: Lang, shown: ReadonlyMap<string, Page>): string {
  const to = (id: string, label: Record<Lang, string>) => {
    const p = shown.get(id);
    return p ? `[${label[lang]}](${p.url[lang]})` : undefined;
  };
  const indexes = [
    to('index.by-symptom', { en: 'index by symptom or error', fr: 'index par symptôme ou erreur' }),
    to('index.identifiers', { en: 'identifiers index', fr: 'index des identifiants' }),
  ].filter(Boolean);
  const where = indexes.length ? indexes.join(lang === 'fr' ? ' ou l’' : ' or the ') : undefined;
  return lang === 'fr'
    ? `Le champ en haut à droite (« Find a page or section ») ne filtre que les titres des pages et des sections, pas leur texte${where ? ` : un message d'erreur ou une variable se trouve dans l’${where}` : ''}. Pour chercher dans le texte des pages, utilisez la [recherche de code de GitHub](${textSearch('fr')}) (connecté), en ajoutant vos mots.`
    : `The box at the top right ("Find a page or section") filters page and section titles only, not their text${where ? `: an error message or a variable is in the ${where}` : ''}. To search the pages' text, use [GitHub's code search](${textSearch('en')}) (signed in), adding your words.`;
}

function home(manifest: Manifest, published: readonly Page[]): string {
  const shown = new Map(listed(manifest, published).map((p) => [p.id, p]));
  const section = (lang: Lang) => {
    const fr = lang === 'fr';
    const doors = DOORS.filter((d) => shown.has(d.id)).map(
      (d) => `- **[${d.label[lang]}](${shown.get(d.id)!.url[lang]})** — ${d.line[lang]}`,
    );
    const help = HELP.filter((id) => shown.has(id)).map((id) => link(shown.get(id)!, lang, WIKI_STYLE));
    const out = [`## ${fr ? 'Français' : 'English'}`, ''];
    if (!doors.length && !help.length) return [...out, L[lang].noPage, ''];
    if (doors.length)
      out.push(`### ${fr ? 'Par où commencer ?' : 'Where to start'}`, '', ...doors.flatMap((l) => [l, '']));
    if (help.length)
      out.push(
        `### ${fr ? 'Vous cherchez quelque chose de précis ?' : 'Looking for something specific?'}`,
        '',
        help.join(' · '),
        '',
        searchNote(lang, shown),
        '',
      );
    return out;
  };
  return `# quest'n'click

**Des jeux d'aventure point-and-click qui tournent dans le navigateur, sur téléphone comme sur ordinateur.**<br>
*Point-and-click adventure games that run in the browser, on phones and desktops alike.*

[Français](#français) · [English](#english)

---

${section('fr').join('\n')}
---

${section('en').join('\n')}`;
}

/**
 * Empties the output folder before a build, so a page withdrawn from the manifest leaves no file behind. Only a folder
 * a build wrote (it holds BUILD_MARKER) is emptied; any other non-empty folder is refused. A `.git` folder (a clone of
 * the wiki's repository) is kept.
 */
function clearOutput(outDir: string): void {
  if (!existsSync(outDir)) return;
  const entries = readdirSync(outDir);
  if (entries.length && !entries.includes(BUILD_MARKER))
    throw new Error(`${outDir} is not empty and holds no previous build (no ${BUILD_MARKER}): choose an empty folder`);
  for (const name of entries) if (name !== '.git') rmSync(resolve(outDir, name), { recursive: true, force: true });
}

/** One page of an output, composed in Markdown: its header, statuses, body and footer, its links in the output's style. */
interface ComposedPage {
  lang: Lang;
  page: Page;
  markdown: string;
}
export interface Composed {
  pages: ComposedPage[];
  sidebars: Record<Lang, string>;
  /** The images of `wiki/images/` the pages show, by their path in that folder. */
  images: Set<string>;
}

/**
 * The published pages (and the generated indexes) of both languages in Markdown, links in the output's style
 * (`styleFor(lang)` for the pages of one language), with their sidebars: what the wiki writes as files, and what the
 * archive's HTML renders (§4.5.6, one resolver).
 */
export function composePages(o: Omit<BuildOptions, 'outDir'>, styleFor: (lang: Lang) => LinkStyle): Composed {
  const published = publishedPages(o.manifest, o.preview);
  const generated = generatedPages(o.manifest, published);
  const { glossary } = readGlossary(o.wikiDir);
  const identifiers = o.identifiers ?? generatedIdentifiers();
  const images = new Set<string>();
  const claims = new Map((o.claims ?? []).map((c) => [c.id, c]));
  const pairs = readTranslations(o.wikiDir).translations.pairs;
  const pages: ComposedPage[] = [];
  const sidebars = {} as Record<Lang, string>;
  for (const lang of LANGS) {
    const style = styleFor(lang);
    const urls = new Map([...published, ...generated].map((p) => [p.id, style.page(p, lang)]));
    for (const p of published) {
      const source = readFileSync(resolve(o.wikiDir, lang, `${p.id}.md`), 'utf8');
      const body = rewritePage(source, lang, urls, o.productCommit, images, claims, style).trim();
      const limits = parsePage(source, lang)
        .blocks.filter((b) => b.kind === 'LIMIT')
        .map((b) => b.id);
      const status = statusBlock(p, lang, o.statuses ?? new Map(), limits);
      // The header goes under the page's title when it opens with one, the banners above the header.
      const banners = [
        ...(o.preview ? [`> ${L[lang].preview(o.productVersion)}`] : []),
        ...(p.state === 'draft' ? [`> ${L[lang].draft}`] : []),
      ];
      const top = `${banners.map((b) => `${b}\n\n`).join('')}${header(p, lang, style, pageReview(p.id, pairs))}`;
      const [first = '', ...rest] = body.split('\n');
      const title = first.startsWith('# ') ? first : undefined;
      const lines = title ? rest : body.split('\n');
      // The qualification goes after the lead, the page's first answer, right before its first section.
      const cut = lines.findIndex((l) => ANCHOR_LINE.test(l.trim()));
      const lead = (cut < 0 ? lines : lines.slice(0, cut)).join('\n').trim();
      const after = cut < 0 ? '' : lines.slice(cut).join('\n');
      const page = [title, top, lead, qualification(p, lang, status), after]
        .filter((x) => x !== undefined && x !== '')
        .join('\n\n');
      pages.push({ lang, page: p, markdown: `${page}\n\n---\n\n${pageFooter(p, lang, o.productVersion)}\n` });
    }
    for (const index of indexPages(o.manifest, published, glossary, identifiers, lang, style)) {
      const p = o.manifest.pages.find((x) => x.id === index.id)!;
      pages.push({ lang, page: p, markdown: index.body });
    }
    sidebars[lang] = sidebar(o.manifest, published, lang, style);
  }
  return { pages, sidebars, images };
}

/** The wiki folder's files, by path, in memory: what `buildWiki` writes and what the archive carries under `wiki/`. */
export function wikiFiles(o: Omit<BuildOptions, 'outDir'>): Map<string, Buffer> {
  const { pages, sidebars, images } = composePages(o, () => WIKI_STYLE);
  const files = new Map<string, Buffer>();
  for (const c of pages) files.set(`${c.lang}/${c.page.url[c.lang]}.md`, Buffer.from(c.markdown));
  for (const lang of LANGS) files.set(`${lang}/_Sidebar.md`, Buffer.from(sidebars[lang]));
  files.set('Home.md', Buffer.from(home(o.manifest, publishedPages(o.manifest, o.preview))));
  files.set('_Sidebar.md', Buffer.from(homeSidebar(o.manifest, publishedPages(o.manifest, o.preview))));
  files.set('_Footer.md', Buffer.from(footer(o.productVersion, o.docRevision, o.docRevisionNumber ?? 'r1', o.preview)));
  for (const image of images) files.set(`images/${image}`, readFileSync(resolve(o.wikiDir, 'images', image)));
  return files;
}

/** Writes the wiki folder; returns the files written, relative to `outDir`, sorted. */
export function buildWiki(o: BuildOptions): string[] {
  const files = wikiFiles(o);
  files.set(BUILD_MARKER, Buffer.from(`quest'n'click wiki build ${o.productVersion} ${o.docRevision}\n`));
  clearOutput(o.outDir);
  for (const [rel, content] of files) {
    const file = resolve(o.outDir, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return [...files.keys()].sort();
}
