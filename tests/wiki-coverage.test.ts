// The coverage matrix (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.2, phase A3). On a fixture repository
// (tests/fixtures/wiki/coverage: an English and a French page, a README, a YAML file naming anchors) and the fixture
// wiki of A2: GitHub's anchors (lowercase, punctuation, accents, emoji and backticks, repeated headings `-1`, `-2`), the
// explicit `<a id>` and `<a name>` anchors, no heading read inside a fence, code blocks hashed with their language and
// line, the limit candidates (a review aid), the incoming anchored links that resolve to nothing listed; `--init`
// refusing to replace a matrix; a merge keeping what a person wrote and flagging what changed or left; the matrix out
// of step, a drop without a reason, an unknown destination or a code block in no row refused by the check; the legacy
// order (the old sections' order, each destination once); the two counters. On the repository itself: the matrix is
// final since the switch-over (C2; the freeze of `docs/en|fr` it replaced is tested on the fixture, and the transition
// pages by tests/wiki-transition.test.ts), every old `##` of the eight `read_doc` pages covered by `wiki/legacy.json`,
// every section planned, and every anchored link the repository gives into the old pages still resolving.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { ROOT } from '../tools/game';
import { DOCS } from '../tools/studio/tools';
import { main } from '../tools/wiki';
import { trackedFiles } from '../tools/wiki/check';
import {
  ackRow,
  type Coverage,
  type CoverageRow,
  checkCoverage,
  counterLines,
  coverageCounters,
  githubSlug,
  headingText,
  incomingLinks,
  initCoverage,
  inventory,
  inventoryOf,
  type Legacy,
  legacyOf,
  legacyOrder,
  limitCandidates,
  mergeCoverage,
  readCoverage,
  slugger,
  staleRows,
  switchedOver,
  unresolvedLinks,
  withReplaces,
  writeCoverage,
} from '../tools/wiki/coverage';
import { formatJson } from '../tools/wiki/json';
import { type Manifest, readManifest } from '../tools/wiki/manifest';

const FIXTURE = resolve('tests/fixtures/wiki/coverage');
const BASE_WIKI = resolve('tests/fixtures/wiki/base');
const FIXTURE_TRACKED = ['README.md', 'notes.yml', 'docs/en/GUIDE.md', 'docs/fr/GUIDE.md'];
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});
const tmp = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};

/** A copy of the fixture repository and of the fixture wiki, the matrix made and every row planned to `create.exits`. */
function setup(plan: (row: CoverageRow) => void = () => {}) {
  const root = tmp('coverage-root-');
  const wikiDir = tmp('coverage-wiki-');
  cpSync(FIXTURE, root, { recursive: true });
  cpSync(BASE_WIKI, wikiDir, { recursive: true });
  const coverage = initCoverage(inventory(root));
  for (const r of coverage.rows) {
    r.destinations = ['create.exits'];
    r.decision = 'keep';
    r.planned = true;
    plan(r);
  }
  const manifest = () => readManifest(wikiDir).manifest!;
  writeCoverage(wikiDir, coverage, manifest());
  const check = () => checkCoverage({ wikiDir, root, manifest: manifest(), tracked: FIXTURE_TRACKED });
  return { root, wikiDir, coverage, manifest, check };
}
const edit = (file: string, from: string, to: string) =>
  writeFileSync(file, readFileSync(file, 'utf8').replace(from, to));

describe("GitHub's anchors", () => {
  it('lowercases, strips punctuation and emoji, keeps accents, digits, `_` and `-`, turns each space into `-`', () => {
    const slug = (h: string) => githubSlug(headingText(h));
    expect(slug('Insult sword fighting — native (tested)')).toBe('insult-sword-fighting--native-tested');
    expect(slug('39. De la 4.2.5 à la 4.3.0 « Hero Choice »')).toBe('39-de-la-425-à-la-430--hero-choice-');
    expect(slug('Sam & Max — `use` it (tested) 🚀')).toBe('sam--max--use-it-tested-');
    expect(slug('The API (`/__studio/api/*`, JSON, dev server only)')).toBe('the-api-__studioapi-json-dev-server-only');
    expect(slug('`quest-n-click/content`: writing a game')).toBe('quest-n-clickcontent-writing-a-game');
    expect(slug("C'est **gras** et _penché_")).toBe('cest-gras-et-penché');
    expect(slug('[A link](x.md) and ![an image](y.png) &amp; an <em>tag</em>')).toBe('a-link-and-an-image--an-tag');
    expect(slug('Escaped \\* star')).toBe('escaped--star');
  });

  it('gives a repeated heading -1, -2… in document order, never reusing a slug already given', () => {
    const slug = slugger();
    expect(['Setup', 'Setup', 'Setup 1', 'Setup'].map(slug)).toEqual(['setup', 'setup-1', 'setup-1-1', 'setup-2']);
  });

  it('reads the rendered text as github-slugger does: HTML gone but its spaces kept, autolinks, entities, `_`', () => {
    const slug = (h: string) => githubSlug(headingText(h));
    // A heading ending in HTML keeps the space before the tag.
    expect(slug('3. State of the project on <date>')).toBe('3-state-of-the-project-on-');
    expect(slug('Ends in a tag <br>')).toBe('ends-in-a-tag-');
    expect(slug('A <!-- note --> comment')).toBe('a--comment');
    // An autolink keeps its text (then the slug drops its punctuation).
    expect(slug('See <https://example.com/a_b>')).toBe('see-httpsexamplecoma_b');
    expect(slug('Write to <team@example.com>')).toBe('write-to-teamexamplecom');
    // Entities are read, then follow the rules: a no-break space is not a space.
    expect(slug('A&nbsp;B &amp; C &#45; D &#x41;')).toBe('ab--c---d-a');
    // A `_` that opens or closes nothing stays; emphasis goes.
    expect(slug('snake_case_ and _emph_ and __strong__')).toBe('snake_case_-and-emph-and-strong');
    expect(slug('trailing_')).toBe('trailing_');
    // A code span loses one space on each side, as CommonMark trims it.
    expect(slug('`` `tick` ``')).toBe('tick');
  });

  it('reads setext headings, never a thematic break after a blank line or a list item', () => {
    const md = 'Intro\n\nTitle\n=====\n\nText\n\n---\n\nTwo lines\nof title\n---\n\n- item\n---\n';
    const { sections } = inventoryOf('x.md', md);
    expect(sections.map((s) => [s.level, s.heading, s.anchor, s.lines[0]])).toEqual([
      [0, '', '', 1],
      [1, 'Title', 'title', 3],
      [2, 'Two lines of title', 'two-lines-of-title', 10],
    ]);
  });

  it('gives an empty heading the empty slug, keyed apart from the preamble', () => {
    const { sections, anchors } = inventoryOf('x.md', 'Before.\n\n#\n\nA.\n\n## \n\nB.\n\n## Named\n');
    expect(sections.map((s) => s.key)).toEqual(['x.md', 'x.md#', 'x.md#-1', 'x.md#named']);
    expect(anchors).toEqual(['', '-1', 'named']);
  });

  it('hashes the body as written: a hard break is a change, a CRLF is not', () => {
    const hash = (md: string) => inventoryOf('x.md', md).sections[0]!.hash;
    expect(hash('## A\n\nline one  \nline two\n')).not.toBe(hash('## A\n\nline one\nline two\n'));
    expect(hash('## A\r\n\r\nline one\r\n')).toBe(hash('## A\n\nline one\n'));
  });

  it('masks the generated blocks of DSL.md and API.md, keeping their headings', () => {
    const page = (row: string) =>
      `## Reference\n\nWritten.\n\n<!-- dsl-doc:begin -->\n### Commands\n\n| a | ${row} |\n<!-- dsl-doc:end -->\n`;
    const [a, b] = [inventoryOf('docs/en/DSL.md', page('x')), inventoryOf('docs/en/DSL.md', page('y, never'))];
    expect(a.sections.map((s) => s.anchor)).toEqual(['reference', 'commands']);
    expect(a.sections.map((s) => s.hash)).toEqual(b.sections.map((s) => s.hash));
    expect(b.sections[1]!.limits).toEqual([]);
    expect(inventoryOf('docs/en/DSL.md', page('x').replace('Written.', 'Rewritten.')).sections[0]!.hash).not.toBe(
      a.sections[0]!.hash,
    );
  });

  it('inventories every level, the explicit anchors, and nothing inside a fence', () => {
    const [en, fr] = inventory(FIXTURE);
    expect(en!.file).toBe('docs/en/GUIDE.md');
    expect(en!.sections.map((s) => [s.level, s.anchor])).toEqual([
      [1, 'the-guide'],
      [2, 'setup'],
      [2, 'setup-1'],
      [2, 'sam--max--use-it-tested-'],
      [2, 'limits'],
    ]);
    expect(en!.anchors).toContain('custom-anchor');
    expect(fr!.anchors).toContain('ancre-perso');
    expect(en!.sections[2]!.anchors).toEqual(['custom-anchor']);
    const levels = inventoryOf(
      'x.md',
      '#### Four\n\n```\n# no\n```\n\n````md\n```\n## still no\n```\n````\n###### Six\n',
    ).sections;
    expect(levels.map((s) => [s.level, s.anchor])).toEqual([
      [4, 'four'],
      [6, 'six'],
    ]);
  });

  it('hashes each code block with its language and line, and keeps a preamble before the first heading', () => {
    const files = inventory(FIXTURE);
    const sam = files[0]!.sections[3]!;
    expect(sam.codeBlocks.map((b) => [b.lang, b.line])).toEqual([
      ['sh', 17],
      ['markdown', 24],
    ]);
    expect(sam.codeBlocks[0]!.hash).toMatch(/^[0-9a-f]{64}$/);
    // A different content, a different hash.
    expect(files[1]!.sections[3]!.codeBlocks[1]!.hash).not.toBe(sam.codeBlocks[1]!.hash);
    const readme = files.find((f) => f.file === 'README.md')!;
    expect(readme.sections[0]).toMatchObject({ key: 'README.md', level: 0, anchor: '', lines: [1, 1] });
  });

  it('masks the figures quality:baseline writes, so adding a test moves no frozen section', () => {
    const page = (n: number) => `## In numbers\n\n<!-- metric:tests -->${n}<!-- /metric --> tests, not more.\n`;
    const [a, b] = [inventoryOf('README.md', page(2994)), inventoryOf('README.md', page(3018))];
    expect(a.sections[0]!.hash).toBe(b.sections[0]!.hash);
    expect(a.sections[0]!.limits).toEqual(b.sections[0]!.limits);
  });

  it('proposes the sentences that look like a limit, outside inline code, in both languages', () => {
    expect(limitCandidates('Run the tool. It only works on the local Studio.')).toEqual([
      'It only works on the local Studio.',
    ]);
    expect(limitCandidates('The `not` inside code is no marker. This sentence is plain.')).toEqual([]);
    expect(limitCandidates("Ce n'est pas encore fini. Il ne marche que sur le Studio local. Voilà.")).toEqual([
      "Ce n'est pas encore fini.",
      'Il ne marche que sur le Studio local.',
    ]);
    expect(limitCandidates("It doesn't work offline. Attention : jamais en production.")).toHaveLength(2);
    const [en] = inventory(FIXTURE);
    expect(en!.sections[4]!.limits).toEqual(['You cannot undo a deploy.']);
  });
});

describe('the incoming anchored links (the cross-check)', () => {
  it('reads Markdown links relative to their file, paths in other files from the root, and lists the broken ones', () => {
    const files = inventory(FIXTURE);
    const links = incomingLinks(FIXTURE, FIXTURE_TRACKED, new Set(files.map((f) => f.file)));
    expect(links.map((l) => `${l.from}:${l.line} ${l.target}#${l.anchor}`)).toEqual([
      'README.md:5 docs/en/GUIDE.md#setup-1',
      'README.md:5 docs/en/GUIDE.md#limits',
      'README.md:6 docs/en/GUIDE.md#gone-section',
      'README.md:6 docs/fr/GUIDE.md#installation-1',
      'notes.yml:1 docs/en/GUIDE.md#custom-anchor',
      'notes.yml:1 docs/en/GUIDE.md#nowhere',
      'notes.yml:2 docs/fr/GUIDE.md#sam--max--use-testé-',
      'docs/en/GUIDE.md:31 docs/en/GUIDE.md#setup',
      'docs/en/GUIDE.md:31 docs/en/GUIDE.md#setup-1',
    ]);
    expect(unresolvedLinks(files, links).map((l) => l.anchor)).toEqual(['gone-section', 'nowhere']);
  });

  it('takes a template for no link', () => {
    const root = tmp('coverage-template-');
    cpSync(FIXTURE, root, { recursive: true });
    writeFileSync(join(root, 'notes.yml'), 'a: `docs/en/GUIDE.md#${anchor}`\nb: docs/en/GUIDE.md#{x}\n');
    const files = inventory(root);
    expect(incomingLinks(root, ['notes.yml'], new Set(files.map((f) => f.file)))).toEqual([]);
  });

  it('lists them as warnings of the check, never as errors', () => {
    const { check } = setup();
    const report = check();
    expect(report.errors).toEqual([]);
    expect(report.unresolved.map((l) => l.anchor)).toEqual(['gone-section', 'nowhere']);
    expect(report.warnings.join('\n')).toContain('README.md line 6: links to docs/en/GUIDE.md#gone-section');
  });
});

describe('the matrix', () => {
  it('passes the check once every row is planned, and fills the manifest replaces and legacy.json from it', () => {
    const { check, manifest, wikiDir } = setup();
    expect(check().errors).toEqual([]);
    expect(manifest().pages.find((p) => p.id === 'create.exits')!.replaces).toContain(
      'docs/fr/GUIDE.md#installation-1',
    );
    expect(readFileSync(join(wikiDir, 'legacy.json'), 'utf8')).toContain('"format": "quest-n-click-docs-legacy"');
  });

  it('lists a row without a decision as a gap, and refuses a drop without a reason', () => {
    const { check, wikiDir } = setup((r) => {
      if (r.anchor === 'limits') Object.assign(r, { decision: null, planned: false, destinations: [] });
      if (r.anchor === 'setup') Object.assign(r, { decision: 'drop', destinations: [] });
    });
    const report = check();
    expect(report.gaps.join('\n')).toMatch(/section\(s\) of the old documentation have no decision yet: .*#limits/);
    expect(report.errors).toContain('coverage.json docs/en/GUIDE.md#setup: a drop says why (reason)');
    const matrix = readCoverage(wikiDir).coverage!;
    expect(legacyOf(matrix).pages.TOOLS).toEqual([]);
  });

  it('refuses an unknown destination, a missing section of a written page, and a planned row going nowhere', () => {
    const { check } = setup((r) => {
      if (r.anchor === 'setup') r.destinations = ['create.nowhere'];
      if (r.anchor === 'setup-1') r.destinations = ['create.rooms#no-such-section'];
      if (r.anchor === 'limits') r.destinations = [];
    });
    const errors = check().errors;
    expect(errors).toContain(
      'coverage.json docs/en/GUIDE.md#setup: the destination create.nowhere is not a manifest page',
    );
    expect(errors).toContain(
      'coverage.json docs/en/GUIDE.md#setup-1: create.rooms#no-such-section is not a section of create.rooms',
    );
    expect(errors).toContain('coverage.json docs/en/GUIDE.md#limits: planned to keep, yet no destination');
  });

  it('refuses a key or a path written with a backslash', () => {
    const { check, wikiDir } = setup();
    const file = join(wikiDir, 'coverage.json');
    const c = JSON.parse(readFileSync(file, 'utf8')) as Coverage;
    c.rows[0]!.key = 'docs\\en\\GUIDE.md#the-guide';
    writeFileSync(file, formatJson(c));
    expect(check().errors).toContain('coverage.json rows.0.key: a key in forward slashes, never a backslash');
  });

  it('refuses a code block that no row holds', () => {
    const { check, wikiDir } = setup();
    const file = join(wikiDir, 'coverage.json');
    const c = JSON.parse(readFileSync(file, 'utf8')) as Coverage;
    c.rows.find((r) => r.codeBlocks.length)!.codeBlocks = [];
    writeFileSync(file, formatJson(c));
    expect(check().errors).toContain('coverage.json: the code block of docs/en/GUIDE.md line 17 is in no row');
  });

  it('is the freeze: a page changed behind the matrix makes the check fail, naming the command', () => {
    const { check, root } = setup();
    edit(join(root, 'docs/fr/GUIDE.md'), 'Ce n', 'Ce texte n');
    const errors = check().errors;
    expect(errors).toContain(
      'coverage.json is out of step with the pages: docs/fr/GUIDE.md#sam--max--use-testé-: its text changed',
    );
    expect(errors.at(-1)).toMatch(/run `npm run wiki -- coverage`/);
  });

  it('refuses a legacy.json or manifest replaces the matrix does not make', () => {
    const { check, wikiDir } = setup();
    writeFileSync(join(wikiDir, 'legacy.json'), '{}\n');
    const file = join(wikiDir, 'manifest.json');
    const m = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
    m.pages.find((p) => p.id === 'create.rooms')!.replaces = ['docs/en/GUIDE.md#setup'];
    writeFileSync(file, JSON.stringify(m, null, 2));
    const errors = check().errors;
    expect(errors).toContain('legacy.json is not the one the matrix makes: run `npm run wiki -- coverage`');
    expect(errors.some((e) => e.startsWith('manifest.json: the replaces of create.rooms are not'))).toBe(true);
  });
});

describe('a merge (`wiki -- coverage`)', () => {
  it('keeps what a person wrote, adds a new section, flags a changed one and keeps a vanished one, flagged', () => {
    const { root, coverage } = setup((r) => {
      if (r.anchor === 'limits') {
        r.reason = 'a person wrote this';
        r.migrated = true;
        r.limits[0]!.status = 'reported';
      }
    });
    edit(
      join(root, 'docs/en/GUIDE.md'),
      '- You cannot undo a deploy.',
      '- You cannot undo a deploy.\n- Never twice.\n\n## A new section\n\nText.\n',
    );
    edit(join(root, 'docs/fr/GUIDE.md'), "## Limites\n\n- Un déploiement ne s'annule jamais.\n", '');
    const files = inventory(root);
    expect(staleRows(coverage, files).length).toBeGreaterThan(0);
    const merged = mergeCoverage(coverage, files);
    expect(merged.added).toEqual(['docs/en/GUIDE.md#a-new-section']);
    expect(merged.changed).toEqual(['docs/en/GUIDE.md#limits']);
    expect(merged.removed).toEqual(['docs/fr/GUIDE.md#limites']);
    const row = (key: string) => merged.coverage.rows.find((r) => r.key === key)!;
    expect(row('docs/en/GUIDE.md#limits')).toMatchObject({
      reason: 'a person wrote this',
      migrated: false,
      flag: 'changed',
      limits: [
        { text: 'You cannot undo a deploy.', status: 'reported' },
        { text: 'Never twice.', status: 'pending' },
      ],
    });
    expect(row('docs/en/GUIDE.md#a-new-section')).toMatchObject({ flag: 'added', decision: null, planned: false });
    expect(merged.coverage.rows.at(-1)).toMatchObject({ key: 'docs/fr/GUIDE.md#limites', flag: 'removed' });
    expect(staleRows(merged.coverage, files)).toEqual([]);
  });

  it('carries a renamed heading by its body, flagged changed; the check refuses it planned until acknowledged', () => {
    const { root, wikiDir, check, manifest } = setup((r) => {
      if (r.key === 'docs/en/GUIDE.md#setup') r.verification = 'a person wrote this';
    });
    edit(join(root, 'docs/en/GUIDE.md'), '## Setup\n\nRun', '## Install\n\nRun');
    const merged = mergeCoverage(readCoverage(wikiDir).coverage!, inventory(root));
    // `Install` takes the first `Setup`'s row; the second `Setup` is now `setup`, and takes its own row back.
    expect(merged.carried).toEqual([
      { from: 'docs/en/GUIDE.md#setup', to: 'docs/en/GUIDE.md#install' },
      { from: 'docs/en/GUIDE.md#setup-1', to: 'docs/en/GUIDE.md#setup' },
    ]);
    expect(merged.changed).toEqual(['docs/en/GUIDE.md#install']);
    expect(merged.added).toEqual([]);
    expect(merged.removed).toEqual([]);
    const install = merged.coverage.rows.find((r) => r.key === 'docs/en/GUIDE.md#install')!;
    expect(install).toMatchObject({ verification: 'a person wrote this', flag: 'changed', anchor: 'install' });
    writeCoverage(wikiDir, merged.coverage, manifest());
    expect(check().errors).toContain(
      'coverage.json docs/en/GUIDE.md#install: its section changed while its destinations were planned; recheck them, then `npm run wiki -- coverage --ack docs/en/GUIDE.md#install`',
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(main(['coverage', '--ack', 'docs/en/GUIDE.md#install', `--wiki=${wikiDir}`, `--root=${root}`])).toBe(0);
      expect(main(['coverage', '--ack', 'docs/en/GUIDE.md#install', `--wiki=${wikiDir}`, `--root=${root}`])).toBe(1);
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }
    expect(check().errors).toEqual([]);
  });

  it('carries reordered twins by their bodies, with no flag', () => {
    const page = (a: string, b: string) => [inventoryOf('docs/en/G.md', `## Setup\n\n${a}\n\n## Setup\n\n${b}\n`)];
    const coverage = initCoverage(page('First.', 'Second.'));
    coverage.rows[0]!.reason = 'first';
    coverage.rows[1]!.reason = 'second';
    const merged = mergeCoverage(coverage, page('Second.', 'First.'));
    expect(merged.changed).toEqual([]);
    expect(merged.carried).toEqual([
      { from: 'docs/en/G.md#setup-1', to: 'docs/en/G.md#setup' },
      { from: 'docs/en/G.md#setup', to: 'docs/en/G.md#setup-1' },
    ]);
    expect(merged.coverage.rows.map((r) => [r.key, r.reason, r.flag])).toEqual([
      ['docs/en/G.md#setup', 'second', undefined],
      ['docs/en/G.md#setup-1', 'first', undefined],
    ]);
  });

  it('refuses a vanished row that still holds a decision, until it is deleted', () => {
    const { root, wikiDir, check, manifest } = setup();
    edit(join(root, 'docs/fr/GUIDE.md'), "## Limites\n\n- Un déploiement ne s'annule jamais.\n", '');
    writeCoverage(wikiDir, mergeCoverage(readCoverage(wikiDir).coverage!, inventory(root)).coverage, manifest());
    expect(check().errors.join('\n')).toContain(
      'coverage.json docs/fr/GUIDE.md#limites: left its page with a decision',
    );
    const c = readCoverage(wikiDir).coverage!;
    expect(ackRow(c, 'docs/fr/GUIDE.md#limites')).toBeUndefined();
    expect(c.rows.some((r) => r.key === 'docs/fr/GUIDE.md#limites')).toBe(false);
    writeCoverage(wikiDir, c, manifest());
    expect(check().errors).toEqual([]);
  });

  it('`--init` refuses to replace a matrix without --force; `coverage` merges and is stable when run twice', () => {
    const { root, wikiDir } = setup();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(main(['coverage', '--init', `--wiki=${wikiDir}`, `--root=${root}`])).toBe(1);
      expect(err.mock.calls.flat().join('\n')).toContain('--init --force replaces it');
      const before = readFileSync(join(wikiDir, 'coverage.json'), 'utf8');
      expect(main(['coverage', `--wiki=${wikiDir}`, `--root=${root}`])).toBe(0);
      expect(readFileSync(join(wikiDir, 'coverage.json'), 'utf8')).toBe(before);
      expect(log.mock.calls.flat().join('\n')).toContain('destinations planned: sections 100% (12/12)');
      expect(main(['coverage', '--init', '--force', `--wiki=${wikiDir}`, `--root=${root}`])).toBe(0);
      expect(readCoverage(wikiDir).coverage!.rows.every((r) => !r.planned)).toBe(true);
    } finally {
      log.mockRestore();
      err.mockRestore();
      warn.mockRestore();
    }
  });
});

describe('the legacy order and the counters', () => {
  const row = (anchor: string, destinations: string[], extra: Partial<CoverageRow> = {}): CoverageRow => ({
    key: `docs/en/TOOLS.md#${anchor}`,
    file: 'docs/en/TOOLS.md',
    heading: anchor,
    level: 2,
    anchor,
    lines: [1, 1],
    hash: '0'.repeat(64),
    codeBlocks: [],
    anchors: [],
    destinations,
    decision: 'keep',
    reason: null,
    examples: [],
    verification: null,
    planned: true,
    migrated: false,
    limits: [],
    ...extra,
  });

  it("follows the old page's sections, each destination once at its first place, drops and vanished rows left out", () => {
    const coverage: Coverage = {
      format: 'quest-n-click-docs-coverage',
      version: 1,
      rows: [
        row('a', ['reference.npm-scripts#overview', 'create.checking']),
        row('b', ['create.working-loop#playing', 'reference.npm-scripts#overview']),
        row('c', [], { decision: 'drop', reason: 'history' }),
        row('d', ['create.checking', 'create.images']),
        row('e', ['studio.map'], { flag: 'removed' }),
      ],
    };
    expect(legacyOf(coverage)).toMatchObject({ dedup: 'page-covers-sections' });
    expect(legacyOf(coverage).pages.TOOLS).toEqual([
      'reference.npm-scripts#overview',
      'create.checking',
      'create.working-loop#playing',
      'create.images',
    ]);
    expect(Object.keys(legacyOf(coverage).pages)).toEqual([...DOCS]);
  });

  it('lets a bare page cover its later sections, and keeps sections that come before it', () => {
    // A bare id first: the page covers every section of it, so a later `id#x` is gone.
    expect(legacyOrder(['create.music', 'create.voices#a', 'create.music#stems', 'create.music'])).toEqual([
      'create.music',
      'create.voices#a',
    ]);
    // Sections first: they keep their place, and the bare id stays (C2 emits only the sections not emitted yet).
    expect(legacyOrder(['create.music#stems', 'create.voices#a', 'create.music', 'create.music#rules'])).toEqual([
      'create.music#stems',
      'create.voices#a',
      'create.music',
    ]);
  });

  it('holds the real STUDIO, AUDIO and UPGRADING cases', () => {
    const { pages } = JSON.parse(readFileSync(resolve('wiki/legacy.json'), 'utf8')) as Legacy;
    // STUDIO: the Layout section names the whole studio.edit-room; Structured editing's #structured-editing is in it.
    expect(pages.STUDIO).toContain('studio.edit-room');
    expect(pages.STUDIO).not.toContain('studio.edit-room#structured-editing');
    // AUDIO: the title names the whole install.audio-toolchain, which covers its later #furnace.
    expect(pages.AUDIO).toContain('install.audio-toolchain');
    expect(pages.AUDIO).not.toContain('install.audio-toolchain#furnace');
    // UPGRADING: the title names the whole v2-to-v3 page, so its seven steps are not listed again.
    expect(pages.UPGRADING).toContain('install.upgrade-notes-v2-to-v3');
    expect(pages.UPGRADING.filter((d) => d.startsWith('install.upgrade-notes-v2-to-v3#'))).toEqual([]);
    for (const list of Object.values(pages)) expect(legacyOrder(list)).toEqual(list);
  });

  it('counts sections, code blocks and limit candidates, planned and migrated, a limit only once ticked', () => {
    const block = { hash: '1'.repeat(64), lang: 'sh', line: 1 };
    const ticked = { text: 'Only here.', status: 'reported' as const };
    const pending = { text: 'Not there.', status: 'pending' as const };
    const coverage: Coverage = {
      format: 'quest-n-click-docs-coverage',
      version: 1,
      rows: [
        row('a', ['create.checking'], { migrated: true, codeBlocks: [block], limits: [ticked, pending] }),
        row('b', ['create.checking'], { codeBlocks: [block, block] }),
        row('c', [], { planned: false, decision: null, limits: [{ text: 'Never.', status: 'pending' }] }),
        row('d', ['create.checking'], { flag: 'removed' }),
        // Drops: confirmed with every limit ticked (counts); confirmed with one pending (does not); not confirmed.
        row('e', [], { decision: 'drop', reason: 'history', migrated: true, limits: [ticked] }),
        row('f', [], { decision: 'drop', reason: 'history', migrated: true, codeBlocks: [block], limits: [pending] }),
        row('g', [], { decision: 'drop', reason: 'history' }),
      ],
    };
    expect(coverageCounters(coverage)).toEqual({
      sections: { total: 6, planned: 5, migrated: 2 },
      codeBlocks: { total: 4, planned: 4, migrated: 1 },
      limits: { total: 5, planned: 4, migrated: 2 },
      drops: { total: 3, reviewed: 2 },
    });
    expect(counterLines(coverageCounters(coverage))).toEqual([
      'destinations planned: sections 83.3% (5/6) · code blocks 100% (4/4) · limit candidates 80% (4/5)',
      'migrated and reviewed: sections 33.3% (2/6) · code blocks 25% (1/4) · limit candidates 40% (2/5)',
      'dropped, limits reviewed: 2/3',
    ]);
  });

  it('lists a drop whose limit candidates nobody ticked as a gap', () => {
    const { check } = setup((r) => {
      if (r.anchor === 'limits') Object.assign(r, { decision: 'drop', reason: 'history', destinations: [] });
    });
    expect(check().gaps.join('\n')).toContain(
      '1 dropped section(s) still hold limit candidates nobody ticked (a drop is reviewed once each is reported or not-a-limit): docs/en/GUIDE.md#limits (1)',
    );
  });
});

describe("the repository's matrix", () => {
  const read = readCoverage(resolve('wiki'));
  const coverage = read.coverage!;
  const files = inventory(ROOT);

  it('is valid', () => {
    expect(read.errors).toEqual([]);
  });

  it('is final: docs/en and docs/fr are the transition pages (C2), no longer frozen by the matrix', () => {
    expect(switchedOver(ROOT)).toBe(true);
  });

  it('inventories the 32 pages of each language, the root pages, and passes its check', () => {
    expect(files.filter((f) => f.file.startsWith('docs/en/'))).toHaveLength(32);
    expect(files.filter((f) => f.file.startsWith('docs/fr/'))).toHaveLength(32);
    expect(files.map((f) => f.file)).toContain('docs/fr/PRODUCTION.template.md');
    const report = checkCoverage({
      wikiDir: resolve('wiki'),
      root: ROOT,
      manifest: readManifest(resolve('wiki')).manifest!,
      tracked: trackedFiles(),
    });
    expect(report.errors).toEqual([]);
  });

  it('plans a destination or a written drop for every section, and flags none', () => {
    expect(coverage.rows.filter((r) => !r.planned || !r.decision).map((r) => r.key)).toEqual([]);
    expect(coverage.rows.filter((r) => r.decision === 'drop' && !r.reason).map((r) => r.key)).toEqual([]);
    expect(coverage.rows.filter((r) => r.flag).map((r) => r.key)).toEqual([]);
    // Only shipped roadmap milestones are dropped; one that still lists open items is a rewrite to start.roadmap.
    for (const r of coverage.rows.filter((x) => x.decision === 'drop')) {
      expect(r.file, r.key).toMatch(/^docs\/(en|fr)\/ROADMAP\.md$/);
      expect(r.reason, r.key).toMatch(/CHANGELOG\.md|git tag/);
    }
  });

  it('covers every old `##` of the eight read_doc pages in wiki/legacy.json', () => {
    const legacy = JSON.parse(readFileSync(resolve('wiki/legacy.json'), 'utf8')) as { pages: Record<string, string[]> };
    expect(legacy).toEqual(legacyOf(coverage));
    for (const name of DOCS) {
      const rows = coverage.rows.filter((r) => r.file === `docs/en/${name}.md` && r.level === 2);
      expect(rows.length, name).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.destinations.length, r.key).toBeGreaterThan(0);
        // Each destination is listed, or its whole page is (a bare id covers its sections).
        for (const d of r.destinations)
          expect(
            legacy.pages[name]!.includes(d) || legacy.pages[name]!.includes(d.split('#')[0]!),
            `${r.key} → ${d}`,
          ).toBe(true);
      }
    }
  });

  it('resolves every anchored link the repository gives into the old pages, now their transition pages', () => {
    const links = incomingLinks(ROOT, trackedFiles(), new Set(files.map((f) => f.file)));
    expect(unresolvedLinks(files, links).map((l) => `${l.from}:${l.line} ${l.target}#${l.anchor}`)).toEqual([]);
  });

  it('sets a long replaces list on several lines, and back to an empty one', () => {
    const text = readFileSync(resolve('wiki/manifest.json'), 'utf8');
    const manifest = JSON.parse(text) as Manifest;
    const id = manifest.pages.find((p) => p.replaces.length > 4)!.id;
    const empty = withReplaces(text, new Map([[id, []]]));
    expect((JSON.parse(empty) as Manifest).pages.find((p) => p.id === id)!.replaces).toEqual([]);
    expect(empty).toContain('"replaces": [],');
    expect(withReplaces(empty, new Map(manifest.pages.map((p) => [p.id, p.replaces])))).toBe(text);
  });

  it('sets the manifest replaces in place, byte for byte, when nothing changed', () => {
    const text = readFileSync(resolve('wiki/manifest.json'), 'utf8');
    const manifest = JSON.parse(text) as Manifest;
    expect(withReplaces(text, new Map(manifest.pages.map((p) => [p.id, p.replaces])))).toBe(text);
    expect(readFileSync(resolve('wiki/coverage.json'), 'utf8')).toBe(formatJson(coverage));
  });
});
