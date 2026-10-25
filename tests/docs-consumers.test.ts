// The readers of the documentation (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.3.1 and §4.5.7): every program and
// test of the repository that reads the user documentation's files, `docs/en`, `docs/fr`, `docs/img` or `wiki/`, is
// declared here with what it reads. Since the switch-over (C2) the readers read the wiki (or the bundle, or run its
// tools), `wiki`; a few still read `docs/en|fr` because those are the transition pages or the frozen inventory they
// came from, `transition`. A new reader, or one that stopped reading, fails this test until it is declared or removed.
// The patterns find a path written in code beside a file read (comments and imports aside), literal or built from a
// template (`docs/${lang}/…`, `join('docs', lang, …)`): a reader that builds its path some other way is caught by
// review. `docs/dev` stays where it is (D50): its readers are not listed. Two more guarantees of C2: no program's
// message and no data file names a page of docs/en|fr|img any more (they name the wiki), and no ACTIVE file of the
// repository cites `docs/en/…` or `docs/fr/…`: the historical records keep the paths they were written with (their
// links land on the transition pages), and the exceptions below are versioned, each with its reason. MCP's tools reach
// the documentation through tools/wiki/docs-load.ts only; the remote MCP and the Studio's pages read no file (the
// Assistant's demo reads the snapshot).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Reads = 'wiki' | 'transition';
const CONSUMERS: Record<string, { phase: Reads; reads: string }> = {
  // The access contract: MCP's read_doc, search_docs and list_docs, the demo snapshot, the package.
  'tools/wiki/docs-load.ts': {
    phase: 'wiki',
    reads: "wiki/ in the repository and a package's docs-bundle/; read_doc {name}'s eight pages rebuilt from them",
  },
  'tools/studio/snapshot.ts': { phase: 'wiki', reads: "wiki/'s manifest, to embed the ready pages" },
  'scripts/pack.mjs': { phase: 'wiki', reads: 'runs `wiki -- bundle` into the prepared package' },
  // The wiki's own tools.
  'tools/wiki.ts': { phase: 'wiki', reads: 'wiki/, the source of every output' },
  'tools/wiki/coverage.ts': {
    phase: 'transition',
    reads: 'docs/en and docs/fr: the inventory frozen by L2, then the transition pages it checks',
  },
  'tools/ci-plan.ts': { phase: 'wiki', reads: "wiki/manifest.json, the docs family's pages" },
  // The generators and checks of the documentation.
  'tools/api-doc.ts': { phase: 'wiki', reads: 'the generated part of wiki/en|fr/engine.api.md' },
  'tools/docs-truth.ts': { phase: 'wiki', reads: 'every page of wiki/en and wiki/fr' },
  'tools/audit-assets.ts': { phase: 'wiki', reads: "docs/ and wiki/'s text, for the private origin's words" },
  'scripts/check-links.mjs': { phase: 'wiki', reads: 'the external links of wiki/en, wiki/fr and docs/' },
  'scripts/docs-screenshots.mjs': { phase: 'wiki', reads: "writes docs/img/readme, the READMEs' captures" },
  'tools/rename-org.mjs': {
    phase: 'wiki',
    reads: 'every tracked file, wiki/ included, for the addresses before the transfer',
  },
  // The tests.
  'tests/api-doc.test.ts': { phase: 'wiki', reads: 'wiki/en|fr/engine.api.md and its identifiers' },
  'tests/api-surface.test.ts': { phase: 'wiki', reads: 'wiki/en|fr/engine.api.md' },
  'tests/ci-plan.test.ts': { phase: 'wiki', reads: 'paths only, for the plan' },
  'tests/dsl-doc.test.ts': { phase: 'wiki', reads: 'wiki/en|fr/create.dsl.md and its identifiers' },
  'tests/docs-links.test.ts': { phase: 'wiki', reads: 'every page of wiki/en|fr, and the transition pages' },
  'tests/docs-truth.test.ts': {
    phase: 'wiki',
    reads: 'contribute.architecture, contribute.code-tour, the EN/FR pairs',
  },
  'tests/propagation.test.ts': { phase: 'wiki', reads: 'wiki/en|fr/create.dsl.md' },
  'tests/scripts-documented.test.ts': { phase: 'wiki', reads: 'wiki/en|fr/reference.npm-scripts.md' },
  'tests/support-truth.test.ts': { phase: 'wiki', reads: 'wiki/en|fr/reference.support-matrix.md' },
  'tests/wiki-check.test.ts': { phase: 'wiki', reads: 'the wiki fixtures and the build' },
  'tests/field-carry.test.ts': {
    phase: 'wiki',
    reads:
      "the docs-beginner-reader pass's binding (wiki/en/** …), digested over a temporary copy, never the wiki itself",
  },
  'tests/wiki-acceptance.test.ts': {
    phase: 'wiki',
    reads: "wiki/acceptance/questions.json and wiki/'s pages through the loader, and the acceptance fixture",
  },
  'tests/wiki-archive.test.ts': {
    phase: 'wiki',
    reads: "the wiki fixture's archive in memory, and the repository wiki's archive built with a test report (A7)",
  },
  'tests/wiki-env.test.ts': {
    phase: 'wiki',
    reads:
      "wiki/data/env.json, the reference page it generates and the manifest's identifiers; a temporary copy of wiki/",
  },
  'tests/wiki-generated.test.ts': {
    phase: 'wiki',
    reads:
      "the generated reference pages, wiki/data/'s registers and the manifest's identifiers; a temporary copy of wiki/data",
  },
  'tests/wiki-publish.test.ts': { phase: 'wiki', reads: "a copy of the wiki fixture under a test repository's wiki/" },
  'tests/contracts.test.ts': {
    phase: 'wiki',
    reads: "wiki/en|fr/start.stability.md and reference.support-matrix.md, which the registry's quotes agree with",
  },
  'tests/wiki-coverage.test.ts': { phase: 'transition', reads: 'docs/en|fr: the inventory, now the transition pages' },
  'tests/wiki-access.test.ts': { phase: 'wiki', reads: "the bundle's legacy pages and the repository's wiki/" },
  'tests/wiki-output-links.test.ts': {
    phase: 'wiki',
    reads: "the repository's wiki/, built into an archive whose every output's links are read back",
  },
  'tests/mcp-docs.test.ts': { phase: 'wiki', reads: "wiki/'s matrix, against read_doc {name}'s concatenation" },
  'tests/wiki-publication.test.ts': {
    phase: 'wiki',
    reads: 'the wiki fixture, built into archives whose wiki is pushed to throwaway repositories',
  },
  'tests/wiki-transition.test.ts': {
    phase: 'transition',
    reads: "docs/en|fr: each transition page's anchors, and its version against package.json's",
  },
};

const PATH =
  /['"`](?:\.\.?\/)*(?:docs\/(?:en|fr|img|\$\{)|docs['"`](?!\s*,\s*['"`]dev['"`])|wiki\/(?:en|fr|manifest|legacy|coverage|data|images)\b|wiki['"`])/;

/**
 * The files whose job is the old paths, allowed to cite `docs/en/…` or `docs/fr/…`, each with its reason (C2: every
 * other ACTIVE file names the wiki). The transition pages themselves are excepted by their folder.
 */
const MECHANISM: Record<string, string> = {
  'tests/docs-consumers.test.ts': 'this test, which names the old paths it looks for',
  'tools/wiki/coverage.ts': 'the L2 inventory of the old pages and the check of their transition pages',
  'tools/wiki/transition.ts': 'writes the transition pages',
  'tools/wiki/docs.ts': 'names the 4.4.0 pages whose size bounds read_doc {name}',
  'tools/wiki/manifest.ts': "a page's `replaces`: the old sections it takes over",
  'wiki/coverage.json': 'the L2 matrix, one row per old section',
  'wiki/manifest.json': "each page's `replaces`, from the matrix",
  'wiki/acceptance/questions.json': 'the questions a reader with an old link asks',
  'tests/wiki-coverage.test.ts': 'the matrix and its inventory',
  'tests/wiki-transition.test.ts': 'the transition pages',
  'tests/mcp-docs.test.ts': "read_doc {name}'s old headings, rows of the matrix",
  'tests/changes.test.ts': 'a docs-only change needs no fragment (a path as data)',
  'tests/ci-plan.test.ts': 'the docs family on a transition page (a path as data)',
  'tests/fixtures/mcp/read_doc-4.4.0.json': "the 4.4.0 pages' sizes, recorded",
  'tests/fixtures/wiki/coverage/README.md': 'the coverage fixture links to its own old pages',
  'tests/fixtures/wiki/coverage/notes.yml': 'the coverage fixture names its own old pages',
  'tests/fixtures/game-4.1/cast.ts': 'a 4.1 game as it was written, for the migration tests',
  'tests/fixtures/game-4.1/game.ts': 'a 4.1 game as it was written, for the migration tests',
  'tests/fixtures/game-4.1/index.ts': 'a 4.1 game as it was written, for the migration tests',
};
/** Wiki pages that name an old page as history (the old page, its section numbers, the 4.4.0 template). */
const HISTORY_PAGES = [
  'contribute.welcome',
  'create.clever-static',
  'create.principles',
  'create.production-template',
  'index.faq',
  'install.upgrade-notes-4-1',
  'install.upgrade-notes-4-2',
  'install.upgrade-notes-4-3',
  'install.upgrade-notes-4-4',
  'install.upgrade-notes-v3',
].flatMap((id) => [`wiki/en/${id}.md`, `wiki/fr/${id}.md`]);
/**
 * The historical records, preserved as written (§4.5.7): their links land on the transition pages. A pass sheet's
 * template is active, the sheets are not.
 */
const HISTORICAL = [
  /^CHANGELOG\.md$/,
  /^docs\/dev\/(LOG|DECISIONS|PROGRAM-4\.1)\.md$/,
  /^docs\/dev\/(adr|plans|threat-models|baselines)\//,
  /^docs\/dev\/passes\/(?!TEMPLATE\.md$)/,
  /^docs\/dev\/(PLAN|QUALIF|SPIKE|GO-NO-GO)-/,
  /^docs\/dev\/acceptance\/A7-DEMONSTRATORS\.md$/,
  // The 4.5.0 fragments, folded into the CHANGELOG and the LOG at the release: records of what each step did.
  /^changes\/450-[a-z0-9-]+(\.log)?\.md$/,
];
const CITE = /docs\/(?:en|fr)\/[A-Za-z_.-]+\.md/;
const COMMENT = /^\s*(\/\/|\*|\/\*|#)/;

const listed = (args: string[]) =>
  execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...args], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
const textOf = (f: string) => {
  try {
    return readFileSync(f, 'utf8');
  } catch {
    return undefined; // deleted in the working tree
  }
};
const READ = /\b(readFileSync|readFile|readdirSync|existsSync|createReadStream|statSync|ls-files)\b/;
const SELF = 'tests/docs-consumers.test.ts';

/** The tracked (and new, not ignored) code files that read a documentation path. */
function readers(): Map<string, string[]> {
  const files = listed(['src', 'tools', 'scripts', 'cli', 'studio-server', 'bridge', 'connectors', 'tests']).filter(
    (f) => /\.(ts|mjs|js|cjs|py)$/.test(f) && !f.startsWith('tests/fixtures/') && f !== SELF,
  );
  const out = new Map<string, string[]>();
  for (const f of [...new Set(files)]) {
    const text = textOf(f);
    if (text === undefined || !READ.test(text)) continue;
    const hits = text
      .split('\n')
      .map((l, i) => ({ l, n: i + 1 }))
      .filter(
        ({ l }) => !COMMENT.test(l) && !/^\s*(import\b|\} from )/.test(l) && PATH.test(l.replace(/\s\/\/ .*$/, '')),
      )
      .map(({ l, n }) => `${n}: ${l.trim().slice(0, 80)}`);
    if (hits.length) out.set(f, hits);
  }
  return out;
}

/** The program files (not tests) with a line outside comments that cites a docs/en|fr page. */
function messages(): string[] {
  return [
    ...new Set(
      listed(['src', 'tools', 'scripts', 'cli', 'studio-server', 'bridge', 'connectors', 'games']).filter(
        (f) =>
          /\.(ts|mjs|js|cjs|py|html)$/.test(f) &&
          textOf(f)
            ?.split('\n')
            .some((l) => !COMMENT.test(l) && CITE.test(l)),
      ),
    ),
  ].sort();
}

/** The tracked data files (JSON, YAML) that name a page of docs/en|fr|img, the wiki and the fixtures aside. */
const dataFiles = () =>
  [
    ...new Set(
      listed(['.']).filter(
        (f) =>
          /\.(json|ya?ml)$/.test(f) &&
          !/^(wiki|tests\/fixtures)\//.test(f) &&
          /docs\/(?:en|fr|img)\//.test(textOf(f) ?? ''),
      ),
    ),
  ].sort();

describe('the readers of the documentation (§4.3.1)', () => {
  const found = readers();

  it('declares every reader with its migration phase', () => {
    const undeclared = [...found].filter(([f]) => !CONSUMERS[f]).map(([f, hits]) => `${f} (${hits[0]})`);
    expect(undeclared, 'declare it in CONSUMERS with its phase').toEqual([]);
  });

  it('lists no reader that stopped reading', () => {
    expect(Object.keys(CONSUMERS).filter((f) => !found.has(f))).toEqual([]);
  });

  it('finds no program message that cites a docs/en|fr page: they name the wiki since C2', () => {
    expect(messages()).toEqual([]);
  });

  it('finds no data file that names a docs/en|fr|img page (surfaces.json binds the wiki pages since C2)', () => {
    expect(dataFiles()).toEqual([]);
  });

  it('reaches the documentation through the loader only, among the MCP and Studio code', () => {
    for (const f of found.keys())
      if (/^(tools\/studio|tools\/mcp|src\/studio|studio-server)\//.test(f))
        expect(CONSUMERS[f]?.phase, f).toBe('wiki');
  });
});

describe('the active references (§4.5.7, C2)', () => {
  /**
   * A line holding a permalink at a commit or a tag (`blob/<ref>/docs/en/…`): a proof's source or the 4.4.0 fallback,
   * never repointed, its label naming that file too.
   */
  const PERMALINK = /^.*blob\/[0-9a-zv.]+\/docs\/(en|fr)\/.*$/gm;
  const citing = () =>
    listed(['.'])
      .filter((f) => !/^docs\/(en|fr)\//.test(f) && !/\.(png|webp|jpe?g|gif|mp3|ogg|wav|ttf|woff2?)$/.test(f))
      .filter((f) => /docs\/(en|fr)\//.test((textOf(f) ?? '').replace(PERMALINK, '')));

  it('cites no docs/en|fr page from an active file: the historical records and the versioned exceptions aside', () => {
    const active = citing().filter(
      (f) => !HISTORICAL.some((re) => re.test(f)) && !(f in MECHANISM) && !HISTORY_PAGES.includes(f),
    );
    expect(active, 'repoint it to wiki/<lang>/<id>.md (code) or its wiki URL (a message)').toEqual([]);
  });

  it('keeps no stale exception: each one still cites an old page', () => {
    const found = new Set(citing());
    expect([...Object.keys(MECHANISM), ...HISTORY_PAGES].filter((f) => !found.has(f))).toEqual([]);
  });
});
