// The transition pages (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.5.4 and §4.5.7, phase A5b; written by C2), on the
// coverage fixture (tests/fixtures/wiki/coverage: a guide with a repeated heading, an explicit anchor, a heading full
// of punctuation and an emoji): every old anchor of the L2 inventory is still an anchor of the page GitHub renders
// (the inventory read again from the generated page), each section links to the permalinks of its version's own
// documentation and to the complete 4.4.0 page, a dropped section says why. Once written (C2), the matrix is final:
// `wiki -- check` requires each old page to be the transition page the matrix makes, with every old anchor, and
// `coverage` no longer merges. In the repository: every old page of docs/en|fr is a transition page, at package.json's
// version, holding every anchor of the L2 inventory (§4.5.7, step 4).
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { main } from '../tools/wiki';
import {
  checkCoverage,
  initCoverage,
  inventory,
  inventoryOf,
  readCoverage,
  switchedOver,
  transitionProblems,
  writeCoverage,
} from '../tools/wiki/coverage';
import { readManifest } from '../tools/wiki/manifest';
import { TRANSITION_LINE, transitionPages } from '../tools/wiki/transition';
import { formatJson } from '../tools/wiki/json';

const FIXTURE = resolve('tests/fixtures/wiki/coverage');
const BASE_WIKI = resolve('tests/fixtures/wiki/base');
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});
const tmp = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};

/** The fixture's matrix, every section planned to a page of the base wiki; the Limits section dropped. */
function matrix() {
  const coverage = initCoverage(inventory(FIXTURE));
  for (const r of coverage.rows) {
    r.destinations = r.heading === 'Limits' ? [] : ['create.rooms#walkable-zones', 'create.exits'];
    r.decision = r.heading === 'Limits' ? 'drop' : 'keep';
    r.reason = r.heading === 'Limits' ? 'said again in each page’s [!LIMIT] blocks' : null;
    r.planned = true;
  }
  return coverage;
}
const manifest = readManifest(BASE_WIKI).manifest!;

describe('a transition page', () => {
  const pages = transitionPages(matrix(), manifest, '4.5.0');

  it('is written for each old page of docs/en and docs/fr, never for the root files', () => {
    expect([...pages.keys()]).toEqual(['docs/en/GUIDE.md', 'docs/fr/GUIDE.md']);
  });

  it('keeps every anchor of the inventory: headings (repeated ones too) and explicit anchors', () => {
    for (const old of inventory(FIXTURE).filter((f) => f.file.startsWith('docs/'))) {
      const now = inventoryOf(old.file, pages.get(old.file)!);
      expect(old.anchors.length).toBeGreaterThan(2);
      for (const a of old.anchors) expect(now.anchors, `${old.file}#${a}`).toContain(a);
      // The same headings, in the same order, at the same levels.
      expect(now.sections.filter((s) => s.level).map((s) => [s.level, s.anchor])).toEqual(
        old.sections.filter((s) => s.level).map((s) => [s.level, s.anchor]),
      );
    }
    const en = pages.get('docs/en/GUIDE.md')!;
    expect(en).toContain('## Setup\n');
    expect(en).toContain('<a id="custom-anchor"></a>');
    expect(en).toContain('## Sam \\& Max — use it \\(tested\\) 🚀');
  });

  it("links each section to its version's permalinks and to the complete 4.4.0 page", () => {
    const en = pages.get('docs/en/GUIDE.md')!;
    expect(en.split('\n')[0]).toMatch(TRANSITION_LINE);
    expect(en).toContain(
      '[Rooms › walkable-zones](https://quest-n-click.cleverapps.io/docs/create.rooms#walkable-zones)',
    );
    expect(en).toContain('[Exits](https://quest-n-click.cleverapps.io/docs/create.exits)');
    expect(en).toContain(
      '[The 4.4.0 text](https://github.com/Quest-n-Click/quest-n-click/blob/v4.4.0/docs/en/GUIDE.md#setup-1)',
    );
    expect(en).toContain('Removed: said again in each page’s [!LIMIT] blocks');
    const fr = pages.get('docs/fr/GUIDE.md')!;
    expect(fr).toContain('https://quest-n-click.cleverapps.io/fr/docs/create.rooms#walkable-zones');
    expect(fr).toContain(
      '[Le texte de la 4.4.0](https://github.com/Quest-n-Click/quest-n-click/blob/v4.4.0/docs/fr/GUIDE.md',
    );
    // The website's latest documentation (D52): never a versioned page, never the wiki.
    expect(`${en}${fr}`).not.toMatch(/\/docs\/\d|\/wiki\//);
  });

  it('`wiki -- transition` writes them for package.json’s version', () => {
    const root = tmp('transition-root-');
    const wikiDir = tmp('transition-wiki-');
    cpSync(FIXTURE, root, { recursive: true });
    cpSync(BASE_WIKI, wikiDir, { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '4.7.1' }));
    writeFileSync(join(wikiDir, 'coverage.json'), formatJson(matrix()));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(main(['transition', `--wiki=${wikiDir}`, '--root', root])).toBe(0);
    } finally {
      log.mockRestore();
    }
    const page = readFileSync(join(root, 'docs', 'en', 'GUIDE.md'), 'utf8');
    expect(TRANSITION_LINE.exec(page)?.[1]).toBe('4.7.1');
    expect(page).toContain('(written for version 4.7.1)');
    expect(page).toContain('https://quest-n-click.cleverapps.io/docs/');
  });

  it('keeps a heading that ended on an HTML tag with its trailing `-`', () => {
    const coverage = initCoverage([inventoryOf('docs/en/T.md', '# T\n\n## 3. State on <date>\n\nText.\n')]);
    for (const r of coverage.rows)
      Object.assign(r, { destinations: ['create.exits'], decision: 'keep', planned: true });
    const page = transitionPages(coverage, manifest, '4.5.0').get('docs/en/T.md')!;
    expect(inventoryOf('docs/en/T.md', page).anchors).toContain('3-state-on-');
  });
});

describe('after the switch-over, the matrix is final', () => {
  /** A copy of the fixture whose old pages were replaced by their transition pages, and its wiki. */
  function switched() {
    const root = tmp('switched-root-');
    const wikiDir = tmp('switched-wiki-');
    cpSync(FIXTURE, root, { recursive: true });
    cpSync(BASE_WIKI, wikiDir, { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '4.5.0' }));
    const m = readManifest(wikiDir).manifest!;
    writeCoverage(wikiDir, matrix(), m);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(main(['transition', `--wiki=${wikiDir}`, '--root', root])).toBe(0);
    } finally {
      log.mockRestore();
    }
    const check = () => checkCoverage({ wikiDir, root, manifest: readManifest(wikiDir).manifest!, tracked: [] }).errors;
    return { root, wikiDir, check };
  }

  it('passes with the transition pages, with no freeze on their text', () => {
    const { root, check } = switched();
    expect(switchedOver(root)).toBe(true);
    expect(switchedOver(FIXTURE)).toBe(false);
    expect(check()).toEqual([]);
  });

  it('refuses a transition page edited by hand, or one that lost an old anchor', () => {
    const { root, check } = switched();
    const file = join(root, 'docs/en/GUIDE.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace('<a id="custom-anchor"></a>', ''));
    expect(check()).toEqual([
      'docs/en/GUIDE.md: not the transition page the matrix makes: run `npm run wiki -- transition`',
      'docs/en/GUIDE.md: the old anchor #custom-anchor is gone (docs/en/GUIDE.md#setup-1)',
    ]);
  });

  it('refuses an old page that is no longer a transition page', () => {
    const { root, check } = switched();
    cpSync(join(FIXTURE, 'docs/fr/GUIDE.md'), join(root, 'docs/fr/GUIDE.md'));
    expect(check()).toContain(
      'docs/fr/GUIDE.md: not a transition page (docs/ moved to wiki/ at 4.5.0): run `npm run wiki -- transition`',
    );
  });

  it('no longer merges an inventory (`wiki -- coverage`)', () => {
    const { root, wikiDir } = switched();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(main(['coverage', `--wiki=${wikiDir}`, `--root=${root}`])).toBe(1);
      expect(err.mock.calls.flat().join('\n')).toContain('the matrix is final since the switch-over');
    } finally {
      err.mockRestore();
    }
  });
});

describe("the repository's transition pages", () => {
  it('replace every old page of docs/en and docs/fr, each keeping every old anchor of the L2 inventory', () => {
    const coverage = readCoverage(resolve('wiki')).coverage!;
    const files = new Set(coverage.rows.filter((r) => /^docs\/(en|fr)\//.test(r.file)).map((r) => r.file));
    expect(files.size).toBe(64);
    for (const f of files) expect(readFileSync(f, 'utf8'), f).toMatch(TRANSITION_LINE);
    expect(transitionProblems(coverage, readManifest(resolve('wiki')).manifest!)).toEqual([]);
  });

  it("name package.json's version (the release pull request regenerates them)", () => {
    const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
    const transition = ['en', 'fr'].flatMap((lang) =>
      readdirSync(join('docs', lang))
        .filter((f) => f.endsWith('.md'))
        .map((f) => ({
          file: `docs/${lang}/${f}`,
          line: TRANSITION_LINE.exec(readFileSync(join('docs', lang, f), 'utf8')),
        }))
        .filter((x) => x.line),
    );
    // Each one since C2, at the version being released.
    expect(transition.length).toBe(64);
    for (const t of transition) expect(t.line![1], t.file).toBe(version);
  });
});
