// Versions and proofs at the work level (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.4, phase A5), on the fixture
// wiki (tests/fixtures/wiki/base) with one more ready page written by each case: a restore procedure with a step, a
// guarantee tied to a real test of this repository, a measure, a limit, a section narrowed by an applies marker, and
// the `studio-server` surface. Covered: the applies marker (its syntax, its place, its range inside the page's, the
// same in both languages, and search_docs leaving out a section for a version it does not apply to); the manifest's
// versions as SemVer and in order; the blocks (a measure's five fields, its date, its pinned source and its figures in
// both languages; a guarantee and its manifest claim, both ways, unique across pages; step ids paired); the claims'
// three states, each shown as it is: referenced (the test file holds that exact name, read by the scanner), executed
// (a Vitest JSON report whose commit.json names the documented commit says passed), scope reviewed (a record of the
// claim's and the test file's hashes, reset by a change to either); `review-claim`; the build's header with the five
// statuses of the page's surface and the claim's words; an unknown surface refused.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { ROOT } from '../tools/game';
import { main } from '../tools/wiki';
import { buildWiki } from '../tools/wiki/build';
import { checkWiki, trackedFiles } from '../tools/wiki/check';
import { claimLabel, claimStates, readReviews, sameTest, testNames } from '../tools/wiki/claims';
import { reviewWords } from '../tools/wiki/reviewer';
import { searchDocs } from '../tools/wiki/docs';
import { repositoryDocs } from '../tools/wiki/docs-load';
import type { Identifier } from '../tools/wiki/identifiers';
import { type Manifest, ManifestSchema } from '../tools/wiki/manifest';
import { appliesMarker, parsePage } from '../tools/wiki/page';

const BASE = resolve('tests/fixtures/wiki/base');
const TRACKED = trackedFiles();
const IDENTIFIERS: Identifier[] = [];
const HEAD = '1'.repeat(40);
const OTHER = '2'.repeat(40);
const SHA = 'c00b44fcffe56ffa99f9d2228297414ebe3145ac';
const TEST_FILE = 'tests/studio-backup.test.ts';
const TEST_NAME =
  "the Studio Server's backup › refuses a backup altered, a project not empty, a blob missing, another schema";
const CLAIM = { id: 'restore-empty-db-only', test: `${TEST_FILE} › ${TEST_NAME}` };
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});
const tmp = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};

const measure = (lang: 'en' | 'fr', o: { source?: string; date?: string; drop?: string } = {}) =>
  [
    '> [!MEASURE id=restore-time]',
    lang === 'en' ? '> 30 to 60 s, a restore with its replay.' : '> 30 à 60 s, une restauration et son rejeu.',
    `> - date: ${o.date ?? '2026-10-19'}`,
    '> - version: 4.2.3',
    lang === 'en' ? '> - volume: 508 journal lines' : '> - volume: 508 lignes de journal',
    lang === 'en' ? '> - conditions: the smallest plans' : '> - conditions: les plus petits plans',
    `> - source: [QUALIF-4.2.3 §4](${o.source ?? `https://github.com/Quest-n-Click/quest-n-click/blob/${SHA}/docs/dev/QUALIF-4.2.3-REFERENCE.md`})`,
  ]
    .filter((l) => !o.drop || !l.startsWith(`> - ${o.drop}:`))
    .join('\n');

/** The restore procedure, in one language; `marker` is the recovery section's applies marker. */
function drill(lang: 'en' | 'fr', o: { marker?: string; measure?: string; guarantee?: boolean; step?: string } = {}) {
  const en = lang === 'en';
  return `# ${en ? 'Restore the Studio' : 'Restaurer le Studio'}

<a name="steps"></a>

## ${en ? 'Steps' : 'Étapes'}

<!-- step: ${o.step ?? 'restore'} -->
1. ${en ? 'Restore the backup.' : 'Restaurez la sauvegarde.'}
${
  o.guarantee === false
    ? ''
    : `
> [!GUARANTEE id=restore-empty-db-only]
> ${en ? 'A restore goes into an empty database only.' : 'Une restauration ne va que dans une base vide.'}
`
}
${o.measure ?? measure(lang)}

> [!LIMIT id=no-way-back]
> ${en ? 'No going back after the migrations.' : 'Pas de retour après les migrations.'}

<a name="recovery"></a>
${o.marker ?? '<!-- applies: 4.5.1.. since 4.2.0 -->'}

## ${en ? 'Recovery' : 'Reprise'}

${en ? 'Replay the journal shipped since the backup.' : 'Rejouez le journal expédié depuis la sauvegarde.'}
`;
}

/** A copy of the fixture with the drill written (ready), changed by `edit`, and its check report. */
function wiki(
  edit?: (dir: string, m: Manifest) => void,
  extra: Partial<Parameters<typeof checkWiki>[0]> = {},
): { dir: string; report: ReturnType<typeof checkWiki> } {
  const dir = tmp('wiki-proofs-');
  cpSync(BASE, dir, { recursive: true });
  const file = join(dir, 'manifest.json');
  const m = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
  m.pages.push({
    ...structuredClone(m.pages.find((p) => p.id === 'create.rooms')!),
    id: 'clever.restore-drill',
    domain: 'clever',
    title: { en: 'Restore the Studio', fr: 'Restaurer le Studio' },
    url: { en: 'EN-Clever-Restore-Drill', fr: 'FR-Clever-Exercice-De-Restauration' },
    questions: { en: ['How do I restore the Studio?'], fr: ['Comment restaurer le Studio ?'] },
    aliases: { en: [], fr: [] },
    identifiers: [],
    versions: { appliesFrom: '4.2.2' },
    claims: [{ ...CLAIM }],
    surfaces: ['studio-server'],
  });
  writeFileSync(join(dir, 'en', 'clever.restore-drill.md'), drill('en'));
  writeFileSync(join(dir, 'fr', 'clever.restore-drill.md'), drill('fr'));
  edit?.(dir, m);
  writeFileSync(file, JSON.stringify(m, null, 2));
  return { dir, report: checkWiki({ wikiDir: dir, tracked: TRACKED, identifiers: IDENTIFIERS, ...extra }) };
}
const drillOf = (m: Manifest) => m.pages.find((p) => p.id === 'clever.restore-drill')!;
const write = (dir: string, lang: 'en' | 'fr', text: string) =>
  writeFileSync(join(dir, lang, 'clever.restore-drill.md'), text);

/** A Vitest JSON report of the claim's test, with its commit.json unless `commit` is null. */
const RUNNER = '/home/runner/work/quest-n-click/quest-n-click';
function report(
  o: { commit?: string | null; status?: string; name?: string; file?: string; run?: string } = {},
): string {
  const dir = tmp('wiki-report-');
  writeFileSync(
    join(dir, 'vitest.json'),
    JSON.stringify({
      success: true,
      testResults: [
        {
          name: `${RUNNER}/${o.file ?? TEST_FILE}`,
          assertionResults: [
            {
              ancestorTitles: ["the Studio Server's backup"],
              title: o.name ?? TEST_NAME.split(' › ')[1],
              status: o.status ?? 'passed',
            },
          ],
        },
      ],
    }),
  );
  if (o.commit !== null)
    writeFileSync(
      join(dir, 'commit.json'),
      JSON.stringify({
        format: 'quest-n-click-test-report',
        version: 1,
        commit: o.commit ?? HEAD,
        root: RUNNER,
        run: o.run ?? '42',
      }),
    );
  return join(dir, 'vitest.json');
}

// Each case builds and checks a whole fixture wiki: slow under coverage's instrumentation.
describe('versions (§4.4.1)', { timeout: 30_000 }, () => {
  it('reads an applies marker: from, until, both, since; a malformed one is null', () => {
    expect(appliesMarker('<!-- applies: 4.2.2.. -->')).toEqual({ appliesFrom: '4.2.2' });
    expect(appliesMarker('<!-- applies: 4.2.2..4.4.0 since 4.2.0 -->')).toEqual({
      appliesFrom: '4.2.2',
      appliesUntil: '4.4.0',
      featureSince: '4.2.0',
    });
    expect(appliesMarker('<!--applies: ..4.5.0-rc.1-->')).toEqual({ appliesUntil: '4.5.0-rc.1' });
    expect(appliesMarker('<!-- applies: .. since 4.5.0 -->')).toEqual({ featureSince: '4.5.0' });
    for (const bad of [
      '<!-- applies: 4.2 -->',
      '<!-- applies: .. -->',
      '<!-- applies: 04.2.2.. -->',
      '<!-- applies: 4.2.2 -->',
    ])
      expect(appliesMarker(bad), bad).toBeNull();
    expect(appliesMarker('<!-- step: x -->')).toBeUndefined();
    expect(appliesMarker('<!-- applies: ..4.4.0 archived -->')).toEqual({
      appliesUntil: '4.4.0',
      lifecycle: 'archived',
    });
  });

  it('passes the drill: a section narrowed inside its page, the same in both languages', () => {
    const { report } = wiki();
    expect(report.errors).toEqual([]);
    expect(report.parsed.get('en/clever.restore-drill')!.sectionVersions).toEqual({
      recovery: { appliesFrom: '4.5.1', featureSince: '4.2.0', line: 25 },
    });
  });

  it('refuses a marker away from an anchor, a malformed one, and an anchor whose marker is not followed by a heading', () => {
    const p = parsePage(
      '<a name="a"></a>\n<!-- applies: 4.2 -->\n\n## A\n\ntext\n<!-- applies: 4.2.2.. -->\n\n<a name="b"></a>\n<!-- applies: 4.2.2.. -->\ntext\n',
      'en',
    );
    expect(p.problems).toEqual([
      'line 2: the applies marker is malformed (<!-- applies: 4.2.2.. -->, <!-- applies: 4.2.2..4.4.0 since 4.2.0 -->)',
      "line 7: an applies marker stands on the line right after a section's <a name> anchor",
      'line 9: the anchor "b" is not followed by a heading',
    ]);
  });

  it("refuses a section wider than its page, an empty range, a feature after its range, and twins' markers that differ", () => {
    const errors = (marker: string, frMarker = marker) =>
      wiki((dir, m) => {
        drillOf(m).versions = { appliesFrom: '4.2.2', appliesUntil: '4.6.0' };
        write(dir, 'en', drill('en', { marker }));
        write(dir, 'fr', drill('fr', { marker: frMarker }));
      }).report.errors;
    expect(errors('<!-- applies: 4.2.0.. -->')).toContain(
      'en/clever.restore-drill.md line 25 (#recovery): applies from 4.2.0, before its page (4.2.2)',
    );
    expect(errors('<!-- applies: ..4.7.0 -->')).toContain(
      'fr/clever.restore-drill.md line 25 (#recovery): applies until 4.7.0, after its page (4.6.0)',
    );
    expect(errors('<!-- applies: 4.5.0..4.4.0 -->')).toContain(
      'en/clever.restore-drill.md line 25 (#recovery): applies from 4.5.0 until 4.4.0, an empty range',
    );
    expect(errors('<!-- applies: ..4.4.0 since 4.5.0 -->')).toContain(
      'en/clever.restore-drill.md line 25 (#recovery): featureSince 4.5.0 is after appliesUntil 4.4.0',
    );
    expect(errors('<!-- applies: 4.5.1.. -->', '<!-- applies: 4.5.0.. -->')).toContain(
      'clever.restore-drill: the section versions differ between en and fr (only in en: recovery:4.5.1../; only in fr: recovery:4.5.0../)',
    );
  });

  it('validates the manifest versions as SemVer, in order', () => {
    const m = JSON.parse(readFileSync(join(BASE, 'manifest.json'), 'utf8')) as Manifest;
    const issues = (versions: unknown) => {
      const copy = structuredClone(m);
      (copy.pages.find((p) => p.id === 'create.rooms') as { versions: unknown }).versions = versions;
      const r = ManifestSchema.safeParse(copy);
      return r.success ? [] : r.error.issues.map((i) => i.message);
    };
    expect(issues({ appliesFrom: '4.5.0', appliesUntil: '4.6.0', featureSince: '4.2.0' })).toEqual([]);
    expect(issues({ appliesFrom: '04.5.0' })[0]).toMatch(/a product version, as SemVer writes it/);
    expect(issues({ appliesFrom: '4.5.0-' })[0]).toMatch(/SemVer/);
    expect(issues({ appliesFrom: '4.5.0', appliesUntil: '4.4.9' })).toEqual(['appliesUntil is not before appliesFrom']);
    expect(issues({ appliesFrom: '4.5.0', appliesUntil: '4.6.0', featureSince: '4.7.0' })).toEqual([
      'featureSince is not after appliesUntil',
    ]);
  });

  it('keeps a deprecated or archived page or section out of search_docs unless includeArchived, and says its status', () => {
    const { dir } = wiki((d, m) => {
      drillOf(m).lifecycle = 'deprecated';
      for (const lang of ['en', 'fr'] as const)
        write(d, lang, drill(lang, { marker: '<!-- applies: 4.2.2.. archived -->' }));
    });
    const set = repositoryDocs(ROOT, { wikiDir: dir });
    const q = { query: 'replay the journal shipped', lang: 'en' as const };
    expect(searchDocs(set, q).results.map((r) => r.id)).not.toContain('clever.restore-drill');
    expect(searchDocs(set, { ...q, includeArchived: true }).results[0]).toMatchObject({
      ref: 'clever.restore-drill#recovery',
      status: 'deprecated',
    });
  });

  it('leaves out of search_docs a section that does not apply to the version asked, or marks it with includeArchived', () => {
    const { dir } = wiki();
    const set = repositoryDocs(ROOT, { wikiDir: dir });
    const recovery = set.index.pages.find((p) => p.id === 'clever.restore-drill')!.langs.en!.sections[2]!;
    expect(recovery).toMatchObject({ id: 'recovery', title: 'Recovery', versions: { appliesFrom: '4.5.1' } });
    const query = { query: 'replay the journal shipped', lang: 'en' as const };
    const at = (version?: string, includeArchived?: boolean) =>
      searchDocs(set, { ...query, ...(version ? { version } : {}), ...(includeArchived ? { includeArchived } : {}) });
    expect(at('4.5.1').results[0]).toMatchObject({ ref: 'clever.restore-drill#recovery' });
    expect(at('4.5.1').results[0]).not.toHaveProperty('notApplicable');
    expect(at('4.5.0').results.map((r) => r.ref)).not.toContain('clever.restore-drill#recovery');
    expect(at('4.5.0', true).results[0]).toMatchObject({ ref: 'clever.restore-drill#recovery', notApplicable: true });
  });
});

describe('structured blocks (§4.4.3)', { timeout: 30_000 }, () => {
  it('requires the five fields of a measure, a day for its date and a source pinned to a full commit', () => {
    const errors = (lang: 'en' | 'fr', m: string) =>
      wiki((dir) => {
        write(dir, lang, drill(lang, { measure: m }));
      }).report.errors.filter((e) => e.includes('[!MEASURE'));
    expect(errors('en', measure('en', { drop: 'volume' }))).toEqual([
      'en/clever.restore-drill.md line 13: [!MEASURE id=restore-time] has no "- volume: …" line',
    ]);
    expect(errors('fr', measure('fr', { date: '19 octobre 2026' }))).toEqual([
      'fr/clever.restore-drill.md line 13: [!MEASURE id=restore-time] its date "19 octobre 2026" is not a day (2026-10-19)',
    ]);
    expect(
      errors(
        'en',
        measure('en', {
          source: 'https://github.com/Quest-n-Click/quest-n-click/blob/main/docs/dev/QUALIF-4.2.3-REFERENCE.md',
        }),
      ),
    ).toEqual([
      'en/clever.restore-drill.md line 13: [!MEASURE id=restore-time] its source "https://github.com/Quest-n-Click/quest-n-click/blob/main/docs/dev/QUALIF-4.2.3-REFERENCE.md" is not pinned: https://github.com/<owner>/<repo>/blob/<40-hex commit>/<path>',
    ]);
    expect(
      errors(
        'en',
        measure('en', { source: `https://github.com/Quest-n-Click/quest-n-click/blob/${SHA.slice(0, 12)}/x.md` }),
      ),
    ).toHaveLength(1);
  });

  it("keeps a measure's figures the same in both languages", () => {
    const { report } = wiki((dir) => write(dir, 'fr', drill('fr', { measure: measure('fr', { date: '2026-10-20' }) })));
    expect(report.errors).toContain(
      'clever.restore-drill: the measure figures differ between en and fr (only in en: restore-time.date=2026-10-19; only in fr: restore-time.date=2026-10-20)',
    );
  });

  it('ties a guarantee to a claim of its page, both ways, and a claim id to one page', () => {
    const noClaim = wiki((_, m) => {
      drillOf(m).claims = [];
    }).report.errors;
    expect(noClaim).toContain(
      'en/clever.restore-drill.md line 10: [!GUARANTEE id=restore-empty-db-only] has no claim in the manifest (clever.restore-drill.claims: {"id": "restore-empty-db-only", "test": "file.test.ts › its name"})',
    );
    const noBlock = wiki((dir) => write(dir, 'fr', drill('fr', { guarantee: false }))).report.errors;
    expect(noBlock).toContain(
      'fr/clever.restore-drill.md: the claim restore-empty-db-only of the manifest has no [!GUARANTEE id=restore-empty-db-only] block',
    );
    const twice = wiki((_, m) => {
      m.pages.find((p) => p.id === 'create.dsl')!.claims = [{ ...CLAIM }];
    }).report.errors;
    expect(twice).toContain("clever.restore-drill: the claim id restore-empty-db-only is already create.dsl's");
  });

  it('pairs the step ids between the languages', () => {
    const { report } = wiki((dir) => write(dir, 'fr', drill('fr', { step: 'restaurer' })));
    expect(report.errors).toContain(
      'clever.restore-drill: the step ids differ between en and fr (only in en: restore; only in fr: restaurer)',
    );
  });
});

describe('claims, three states (§4.4.3)', { timeout: 30_000 }, () => {
  it('reads test names as Vitest joins them: nested describes, modifiers; never inside a string, a comment or a regex', () => {
    const source = `
import { describe, it, test } from 'vitest';
// it('a comment', () => {});
const re = /it\\('not a test'\\)/;
describe('outer', () => {
  it('first', () => { expect("it('in a string')").toBe(x); });
  describe.skip("inner", () => {
    test.each([1])(\`each %s\`, () => {});
    it.only('second', async () => { await f((a) => (a)); });
  });
  it(\`third\`, () => {});
});
it('top', () => {});
`;
    expect(testNames(source)).toEqual([
      { name: 'outer › first', modifiers: [] },
      { name: 'outer › inner › each %s', modifiers: ['skip', 'each'] },
      { name: 'outer › inner › second', modifiers: ['skip', 'only'] },
      { name: 'outer › third', modifiers: [] },
      { name: 'top', modifiers: [] },
    ]);
    expect(testNames(readFileSync(TEST_FILE, 'utf8'))).toContainEqual({ name: TEST_NAME, modifiers: [] });
  });

  it('is referenced when the tracked test file holds that exact name, and refused otherwise', () => {
    const ok = wiki();
    expect(ok.report.claims).toMatchObject([{ id: CLAIM.id, page: 'clever.restore-drill' }]);
    expect(ok.report.claims[0]!.unreferenced).toBeUndefined();
    const wrong = wiki((_, m) => {
      drillOf(m).claims = [{ id: CLAIM.id, test: `${TEST_FILE} › the Studio Server's backup › refuses a backup` }];
    }).report.errors;
    expect(wrong).toContain(
      `clever.restore-drill: the claim ${CLAIM.id} is not referenced: ${TEST_FILE} holds no test named "the Studio Server's backup › refuses a backup"`,
    );
    const untracked = wiki((_, m) => {
      drillOf(m).claims = [{ id: CLAIM.id, test: 'tests/no-such.test.ts › x' }];
    }).report.errors;
    expect(untracked).toContain(
      `clever.restore-drill: the claim ${CLAIM.id} is not referenced: the test file tests/no-such.test.ts is not tracked`,
    );
  });

  it('refuses, at the first state, a test written .skip, .todo, .only or .fails (or under such a describe)', () => {
    const root = tmp('wiki-claim-mods-');
    mkdirSync(join(root, 'tests'));
    writeFileSync(
      join(root, 'tests/mods.test.ts'),
      "describe('d', () => {\n  it.skip('a', () => {});\n  it.todo('b');\n  it.only('c', () => {});\n  it.fails('e', () => {});\n  it('plain', () => {});\n});\ndescribe.skip('s', () => { it('under', () => {}); });\n",
    );
    const { manifest } = wiki().report;
    const page = manifest!.pages.find((p) => p.id === 'clever.restore-drill')!;
    const states = claimStates({
      root,
      tracked: new Set(['tests/mods.test.ts']),
      claims: ['d › a', 'd › b', 'd › c', 'd › e', 'd › plain', 's › under'].map((n, i) => ({
        page,
        claim: { id: `c${i}`, test: `tests/mods.test.ts › ${n}` },
        blocks: {},
      })),
      reports: [],
      reviews: { format: 'quest-n-click-docs-reviews', version: 1, claims: {} },
    });
    expect(states.map((x) => x.unreferenced)).toEqual([
      '"d › a" is written .skip: it does not run as it reads, so it backs no claim',
      '"d › b" is written .todo: it does not run as it reads, so it backs no claim',
      '"d › c" is written .only: it does not run as it reads, so it backs no claim',
      '"d › e" is written .fails: it does not run as it reads, so it backs no claim',
      undefined,
      '"s › under" is written .skip: it does not run as it reads, so it backs no claim',
    ]);
  });

  it('executes a claim on a .each test from the names the run filled in, every variant counted', () => {
    const root = tmp('wiki-claim-each-');
    mkdirSync(join(root, 'tests'));
    writeFileSync(
      join(root, 'tests/each.test.ts'),
      "describe.each(KINDS)('leases on $name', (kind) => {\n  it('restore refuses', () => {});\n});\n",
    );
    const { manifest } = wiki().report;
    const page = manifest!.pages.find((p) => p.id === 'clever.restore-drill')!;
    const states = (tests: { name: string; status: string }[]) =>
      claimStates({
        root,
        tracked: new Set(['tests/each.test.ts']),
        claims: [
          { page, claim: { id: 'c', test: 'tests/each.test.ts › leases on $name › restore refuses' }, blocks: {} },
        ],
        reports: [{ file: 'r.json', commit: HEAD, tests: tests.map((x) => ({ file: 'tests/each.test.ts', ...x })) }],
        reviews: { format: 'quest-n-click-docs-reviews', version: 1, claims: {} },
        commit: HEAD,
      })[0]!;
    const both = states([
      { name: 'leases on sqlite › restore refuses', status: 'passed' },
      { name: 'leases on postgres › restore refuses', status: 'passed' },
    ]);
    expect(both.unreferenced).toBeUndefined();
    expect(both.executedOn).toBe(HEAD);
    expect(
      states([
        { name: 'leases on sqlite › restore refuses', status: 'passed' },
        { name: 'leases on postgres › restore refuses', status: 'skipped' },
      ]).notExecuted,
    ).toBe(
      `"tests/each.test.ts › leases on $name › restore refuses" did not pass on ${HEAD.slice(0, 12)} (passed, skipped)`,
    );
    expect(states([{ name: 'leases on sqlite › another', status: 'passed' }]).executedOn).toBeUndefined();
    expect(sameTest('a › b')('a › b')).toBe(true);
    expect(sameTest('a.b › c')('aXb › c')).toBe(false);
    expect(sameTest('row %s, %d')('row x, 3')).toBe(true);
    expect(sameTest('on $name')('on ')).toBe(false);
  });

  it('counts only a passed test as executed: skipped, todo and pending ran nothing', () => {
    for (const status of ['skipped', 'todo', 'pending'])
      expect(
        wiki(undefined, { testReports: [report({ status })], productCommit: HEAD }).report.claims[0]!.notExecuted,
      ).toBe(`"${CLAIM.test}" did not pass on ${HEAD.slice(0, 12)} (${status})`);
  });

  it("matches a report's file by its exact repository path, and names the run a report must come from", () => {
    // A file elsewhere whose path merely ends the same is not the claim's.
    const elsewhere = wiki(undefined, { testReports: [report({ file: `vendor/${TEST_FILE}` })], productCommit: HEAD });
    expect(elsewhere.report.claims[0]!.notExecuted).toBe(`no report of ${HEAD.slice(0, 12)} ran "${CLAIM.test}"`);
    const other = report({ run: '7' });
    const wrongRun = wiki(undefined, { testReports: [other], productCommit: HEAD, candidate: '42' });
    expect(wrongRun.report.errors).toEqual([
      `--test-report ${other}: its commit.json names the run 7, not the candidate 42`,
    ]);
    expect(
      wiki(undefined, { testReports: [report()], productCommit: HEAD, candidate: '42' }).report.claims[0]!.executedOn,
    ).toBe(HEAD);
  });

  it("says plainly when a claim's test file is excluded from the run that makes the candidate's report", () => {
    const file = 'tests/audit.test.ts';
    const name = testNames(readFileSync(file, 'utf8')).find((t) => !t.modifiers.length)!.name;
    const r = wiki(
      (_, m) => {
        drillOf(m).claims = [{ id: CLAIM.id, test: `${file} › ${name}` }];
      },
      { testReports: [report()], productCommit: HEAD },
    ).report;
    const why = `${file} is not in the candidate's report: excluded by \`npm run test:coverage\` (--exclude ${file}, package.json)`;
    expect(r.warnings).toContain(`clever.restore-drill: the claim ${CLAIM.id} cannot be executed: ${why}`);
    expect(r.claims[0]!.notExecuted).toBe(why);
  });

  it('is executed on a commit only when a report with its commit.json names that commit and the test passed', () => {
    const state = (reports: string[], productCommit = HEAD) =>
      wiki(undefined, { testReports: reports, productCommit }).report;
    const passed = state([report()]);
    expect(passed.errors).toEqual([]);
    expect(passed.claims[0]!.executedOn).toBe(HEAD);
    expect(state([report({ commit: OTHER })]).claims[0]!.notExecuted).toBe(
      `the reports name ${OTHER.slice(0, 12)}, not the documented commit ${HEAD.slice(0, 12)}`,
    );
    expect(state([report({ status: 'failed' })]).claims[0]!.notExecuted).toBe(
      `"${CLAIM.test}" did not pass on ${HEAD.slice(0, 12)} (failed)`,
    );
    expect(state([report({ name: 'another test' })]).claims[0]!.notExecuted).toBe(
      `no report of ${HEAD.slice(0, 12)} ran "${CLAIM.test}"`,
    );
    expect(state([]).claims[0]!.notExecuted).toBe('no test report given (--test-report)');
    // A report without its commit.json names no commit: refused, not trusted.
    const bare = report({ commit: null });
    expect(state([bare]).errors).toEqual([
      `--test-report ${bare}: no commit.json beside it, so the report names no commit`,
    ]);
  });

  it('is scope reviewed once recorded, and the record resets when the claim or the test file changes', () => {
    const { dir, report: before } = wiki();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(
      main([
        'review-claim',
        CLAIM.id,
        '--by',
        'a reviewer',
        '--kind',
        'human',
        '--relation',
        'independent',
        `--wiki=${dir}`,
      ]),
    ).toBe(0);
    vi.restoreAllMocks();
    const record = readReviews(dir).reviews.claims[CLAIM.id]!;
    expect(record).toMatchObject({ claimTextHash: before.claims[0]!.claimTextHash });
    expect(record.reviewers).toEqual([
      {
        name: 'a reviewer',
        kind: 'human',
        relation: 'independent',
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      },
    ]);
    const after = checkWiki({ wikiDir: dir, tracked: TRACKED, identifiers: IDENTIFIERS });
    expect(after.claims[0]!.reviewed).toEqual(record.reviewers);
    // The guarantee's French text changes: the review no longer holds.
    write(dir, 'fr', drill('fr').replace('que dans une base vide', 'que dans une base neuve'));
    const changed = checkWiki({ wikiDir: dir, tracked: TRACKED, identifiers: IDENTIFIERS });
    expect(changed.claims[0]!.reviewed).toBeUndefined();
    expect(changed.warnings).toContain(
      `clever.restore-drill: the claim ${CLAIM.id}'s review no longer holds: the claim's text changed since its review`,
    );
    // The test file changes (another root holding a copy): the review no longer holds either.
    const root = tmp('wiki-claim-root-');
    mkdirSync(join(root, 'tests'));
    writeFileSync(join(root, TEST_FILE), `${readFileSync(TEST_FILE, 'utf8')}\n// changed\n`);
    const [moved] = claimStates({
      root,
      tracked: new Set([TEST_FILE]),
      claims: [
        {
          page: after.manifest!.pages.find((p) => p.id === 'clever.restore-drill')!,
          claim: CLAIM,
          blocks: {
            en: after.parsed.get('en/clever.restore-drill')!.blocks[0]!,
            fr: after.parsed.get('fr/clever.restore-drill')!.blocks[0]!,
          },
        },
      ],
      reports: [],
      reviews: readReviews(dir).reviews,
    });
    expect(moved!.reviewStale).toBe('the test file changed since its review');
  });

  it("words a review by who made it: a person's is a review, an AI's own check is not (amendment A7)", () => {
    const base = { id: 'x', page: 'p', test: 't', claimTextHash: 'h' };
    const r = (kind: 'human' | 'ai', relation: 'author' | 'independent') => ({
      name: 'n',
      kind,
      relation,
      date: '2026-10-23',
    });
    expect(claimLabel({ ...base, reviewed: [r('ai', 'author')] })).toBe(
      'referenced · scope self-checked by the author (AI), not reviewed',
    );
    expect(claimLabel({ ...base, reviewed: [r('ai', 'independent')] })).toBe(
      'referenced · scope checked by an independent AI, not reviewed by a person',
    );
    expect(claimLabel({ ...base, reviewed: [r('ai', 'author'), r('human', 'independent')] })).toBe(
      'referenced · scope reviewed',
    );
    expect(reviewWords([r('ai', 'author')], 'fr')).toBe('vérifiée par son auteur (IA), pas relue');
  });

  it('refuses to review a claim that is not referenced', () => {
    const { dir } = wiki((_, m) => {
      drillOf(m).claims = [{ id: CLAIM.id, test: `${TEST_FILE} › nothing` }];
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      main(['review-claim', CLAIM.id, '--by', 'x', '--kind', 'human', '--relation', 'independent', `--wiki=${dir}`]),
    ).toBe(1);
    expect(err.mock.calls.flat().join('\n')).toMatch(/is not referenced .*: nothing to review/);
    vi.restoreAllMocks();
  });
});

describe('statuses in the header, and the claim on its block (§4.4.2, §4.4.3)', { timeout: 30_000 }, () => {
  it('shows the five statuses of the surface apart, and the claim states literally', () => {
    const { dir, report: r } = wiki(undefined, { testReports: [report()], productCommit: HEAD });
    const out = tmp('wiki-proofs-out-');
    buildWiki({
      wikiDir: dir,
      outDir: out,
      manifest: r.manifest!,
      preview: false,
      productVersion: '4.4.0',
      docRevision: HEAD,
      productCommit: HEAD,
      identifiers: IDENTIFIERS,
      statuses: r.statuses,
      claims: r.claims,
    });
    const en = readFileSync(join(out, 'en', 'EN-Clever-Restore-Drill.md'), 'utf8');
    expect(en).toContain(
      '> **The Studio Server (hosted team Studio)** · contract: experimental · verified by CI (support matrix of 4.4.0, 2026-10-23): ',
    );
    expect(en).toContain(
      '· automated checks: jobs `studio-hosted`, `studio-install-smoke`; CI plan `studioHosted`; 3 test files ·',
    );
    expect(en).toContain(
      "people's passes: `studio-hosted` not run ([#149](https://github.com/Quest-n-Click/quest-n-click/issues/149))",
    );
    expect(en).toContain('· known limits: `no-way-back`');
    expect(en).toContain(
      `> **Guarantee** · \`restore-empty-db-only\` · referenced · executed on \`${HEAD.slice(0, 12)}\``,
    );
    expect(en).toContain('## Recovery\n\n> *Applies from 4.5.1 · feature since 4.2.0*');
    expect(en).not.toContain('<!-- applies');
    const fr = readFileSync(join(out, 'fr', 'FR-Clever-Exercice-De-Restauration.md'), 'utf8');
    expect(fr).toContain('contrat : expérimental');
    expect(fr).toContain('passes humaines : `studio-hosted` pas faite');
    expect(fr).toContain(
      `> **Garantie** · \`restore-empty-db-only\` · référencée · exécutée sur \`${HEAD.slice(0, 12)}\``,
    );
    expect(fr).toContain("## Reprise\n\n> *S'applique depuis la 4.5.1 · fonction apparue en 4.2.0*");
  });

  it('refuses a surface the registry does not hold', () => {
    const errors = wiki((_, m) => {
      drillOf(m).surfaces = ['studio-server', 'teleporter'];
    }).report.errors;
    expect(
      errors.some((e) =>
        e.startsWith('clever.restore-drill: the surface "teleporter" is not in docs/dev/contracts.json'),
      ),
    ).toBe(true);
  });
});
