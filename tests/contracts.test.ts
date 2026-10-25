// The status registry (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.4.2, phase A5): docs/dev/contracts.json says, per
// surface, its contract status, the environments CI verifies, its automated checks and the people's passes it waits
// for. Here: the registry is sound against the repository (each job defined, each test file tracked, each pass bound by
// docs/dev/surfaces.json and tracked by an issue for the newest sheet's version, every pass waited for); it agrees
// with the wiki's pages that replaced docs/en|fr/SUPPORT.md at 4.5.0 (each quote is a row of `start.stability`'s
// surface table, and says the status: an experimental surface's quote says experimental, a stable one's never does;
// every row of `reference.support-matrix`'s matrix is named by a surface and every row a surface names is in the matrix;
// a row the matrix calls experimental only speaks for experimental surfaces; every surface has both since C2);
// the passes' states are read from the version's sheet, never typed; and the five statuses stay apart.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PASS_IDS, passesFor } from '../tools/field/schema';
import { ROOT } from '../tools/game';
import { trackedFiles } from '../tools/wiki/check';
import { checkContracts, passSheet, passStates, readContracts, surfaceStatuses } from '../tools/wiki/contracts';

const TRACKED = trackedFiles();
const { contracts, errors } = readContracts(ROOT);
const flat = (s: string) => s.replace(/\s+/g, ' ');
/** The stability page (the status quotes) and the support matrix (its rows), in both languages. */
const page = (id: string) => ({
  en: readFileSync(`wiki/en/${id}.md`, 'utf8'),
  fr: readFileSync(`wiki/fr/${id}.md`, 'utf8'),
});
const RAW = page('reference.support-matrix');
const STABILITY = page('start.stability');
const SUPPORT = { en: flat(STABILITY.en), fr: flat(STABILITY.fr) };
const WORD = {
  en: { experimental: /experimental/i, deprecated: /deprecated/i },
  fr: { experimental: /exp[ée]rimental/i, deprecated: /d[ée]pr[ée]ci[ée]|obsol[eè]te/i },
} as const;
/** The first cell of each row of the support matrix's table (the section `## The matrix` / `## La matrice`). */
function matrixRows(markdown: string): string[] {
  const at = markdown.search(/^## (The matrix|La matrice)\s*$/m);
  expect(at).toBeGreaterThan(0);
  const lines = markdown.slice(at).split('\n').slice(1);
  const end = lines.findIndex((l) => l.startsWith('## '));
  return lines
    .slice(0, end < 0 ? undefined : end)
    .filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l) && !/^\|\s*\|/.test(l))
    .map((l) => l.split('|')[1]!.trim());
}
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

describe('the status registry, docs/dev/contracts.json', () => {
  it('reads, and names only jobs, tests and passes that exist', () => {
    expect(errors).toEqual([]);
    expect(checkContracts(ROOT, TRACKED, contracts!)).toEqual([]);
  });

  it("waits for every pass of the Field Kit somewhere, and tracks each by its issue for the newest sheet's version", () => {
    const waited = new Set(Object.values(contracts!.contracts).flatMap((c) => c.passes));
    expect(PASS_IDS.filter((p) => !waited.has(p))).toEqual([]);
    const newest = passSheet(ROOT, '999.0.0')!;
    expect(passesFor(newest).filter((p) => !contracts!.passIssues[p]?.[newest])).toEqual([]);
  });

  it('maps every row of the support matrix to a surface, and back, in both languages', () => {
    for (const lang of ['en', 'fr'] as const) {
      const rows = matrixRows(RAW[lang]);
      expect(rows.length, lang).toBeGreaterThan(8);
      const named = new Set(Object.values(contracts!.contracts).flatMap((c) => c.matrixRows?.[lang] ?? []));
      expect(
        rows.filter((r) => !named.has(r)),
        `${lang}: rows no surface names`,
      ).toEqual([]);
      expect(
        [...named].filter((r) => !rows.includes(r)),
        `${lang}: rows not in the matrix`,
      ).toEqual([]);
    }
  });

  it('agrees with start.stability in both languages: each quote is there and says the status', () => {
    for (const [id, c] of Object.entries(contracts!.contracts))
      for (const lang of ['en', 'fr'] as const) {
        if (c.support === null) continue;
        const quote = flat(c.support[lang]);
        expect(SUPPORT[lang].includes(quote), `${id} (${lang}): "${quote}" is not in start.stability`).toBe(true);
        if (c.status === 'experimental') expect(quote, `${id} (${lang})`).toMatch(WORD[lang].experimental);
        else expect(quote, `${id} (${lang})`).not.toMatch(WORD[lang].experimental);
        if (c.status === 'deprecated') expect(quote, `${id} (${lang})`).toMatch(WORD[lang].deprecated);
      }
  });

  it('keeps experimental every surface a row the matrix calls experimental speaks for', () => {
    // Derived from the support matrix, which tests/support-truth.test.ts keeps experimental until the passes.
    for (const lang of ['en', 'fr'] as const) {
      const experimental = matrixRows(RAW[lang]).filter((r) => WORD[lang].experimental.test(r));
      expect(experimental.length, lang).toBeGreaterThan(0);
      for (const [id, c] of Object.entries(contracts!.contracts))
        if (c.matrixRows?.[lang].some((r) => experimental.includes(r)))
          expect(c.status, `${id} (${lang})`).toBe('experimental');
    }
  });

  it('names every surface in the pages since C2, the documentation too; a surface not named needs its reason', () => {
    const unnamed = Object.entries(contracts!.contracts).filter(([, c]) => c.support === null || c.matrixRows === null);
    expect(unnamed.map(([id]) => id)).toEqual([]);
    expect(contracts!.contracts.documentation).toMatchObject({
      status: 'experimental',
      matrixRows: { en: ['Documentation (4.5.0), **experimental**'], fr: ['Documentation (4.5.0), **expérimental**'] },
      passes: ['docs-beginner-reader'],
    });
    const root = mkdtempSync(join(tmpdir(), 'contracts-'));
    temps.push(root);
    mkdirSync(join(root, 'docs/dev'), { recursive: true });
    const write = (edit: (k: Record<string, unknown>) => void) => {
      const raw = JSON.parse(readFileSync(join(ROOT, 'docs/dev/contracts.json'), 'utf8'));
      edit(raw.contracts.documentation);
      writeFileSync(join(root, 'docs/dev/contracts.json'), JSON.stringify(raw));
      return readContracts(root).errors;
    };
    expect(write(() => {})).toEqual([]);
    const reason = 'the pages do not name it yet, for a reason';
    expect(
      write((k) => {
        k.matrixRows = null;
      }),
    ).toEqual(['docs/dev/contracts.json contracts.documentation: support or matrixRows is null without a reason']);
    expect(
      write((k) => {
        k.matrixRows = null;
        k.reason = reason;
      }),
    ).toEqual([]);
    expect(
      write((k) => {
        k.reason = reason;
      }),
    ).toEqual([
      'docs/dev/contracts.json contracts.documentation: a reason explains a null support or matrixRows; this surface has both',
    ]);
  });

  it('refuses a job no workflow defines, a test glob that matches nothing, a pass surfaces.json does not bind', () => {
    const broken = structuredClone(contracts!);
    broken.contracts.connectors!.checks.jobs.push('no-such-job');
    broken.contracts.connectors!.checks.tests.push('tests/no-such.test.ts');
    expect(checkContracts(ROOT, TRACKED, broken)).toEqual([
      'docs/dev/contracts.json: connectors names the job no-such-job, which no workflow defines',
      'docs/dev/contracts.json: connectors names the tests "tests/no-such.test.ts", which match no tracked file',
    ]);
    const unwaited = structuredClone(contracts!);
    unwaited.contracts.connectors!.passes = [];
    expect(checkContracts(ROOT, TRACKED, unwaited)).toEqual([
      'docs/dev/contracts.json: no contract waits for the pass connectors-real-security',
    ]);
  });
});

describe('the five statuses, derived', () => {
  it("reads the passes' states from the version's sheet, with their issues; a pass not asked yet says so", () => {
    expect(passSheet(ROOT, '4.4.0')).toBe('4.4.0');
    expect(passSheet(ROOT, '4.5.0-rc.1')).toBe('4.5.0');
    expect(passSheet(ROOT, '4.5.1-rc.1')).toBe('4.5.1');
    expect(passSheet(ROOT, '4.5.2-rc.1')).toBe('4.5.2');
    expect(passSheet(ROOT, '4.5.3-rc.1')).toBe('4.5.3');
    expect(passSheet(ROOT, '4.4.1')).toBe('4.4.0');
    expect(passSheet(ROOT, '4.2.4')).toBe('4.2.4');
    const s = surfaceStatuses(ROOT, contracts!, '4.4.0').get('studio-server')!;
    expect(s.contract).toBe('experimental');
    expect(s.passes.find((p) => p.id === 'studio-hosted')).toEqual({
      id: 'studio-hosted',
      state: 'not-run',
      issue: 149,
      sheet: 'docs/dev/passes/4.4.0.md',
    });
    expect(s.checks.jobs).toContain('studio-hosted');
    expect(s.environments.length).toBeGreaterThan(0);
    // 4.2.0 asked none of the Studio Server's passes yet (PASS_SINCE).
    const old = surfaceStatuses(ROOT, contracts!, '4.2.0').get('studio-server')!;
    expect(old.passes.every((p) => p.state === 'not-asked')).toBe(true);
  });

  it('takes a passed pass from the sheet, never from the registry', () => {
    const root = mkdtempSync(join(tmpdir(), 'contracts-'));
    temps.push(root);
    mkdirSync(join(root, 'docs/dev/passes'), { recursive: true });
    writeFileSync(
      join(root, 'docs/dev/passes/4.4.0.md'),
      [
        '| Pass | Status | Who, when | Device | What failed |',
        '|---|---|---|---|---|',
        '| Real connectors (`connectors-real-security`) | passed | a tester, 2026-10-24 | | |',
        '| The voices listened to (`voices-listening`) | failed | | | the French clip |',
      ].join('\n'),
    );
    expect([...passStates(root, '4.4.0')]).toEqual([
      ['connectors-real-security', 'passed'],
      ['voices-listening', 'failed'],
    ]);
    const s = surfaceStatuses(root, contracts!, '4.4.0');
    expect(s.get('connectors')!.passes[0]).toMatchObject({
      id: 'connectors-real-security',
      state: 'passed',
      issue: 79,
    });
    // The contract stays what the registry says: a passed pass does not promote a surface by itself (D18).
    expect(s.get('connectors')!.contract).toBe('experimental');
    expect(s.get('voices-music')!.passes[0]!.state).toBe('failed');
    expect(s.get('pwa')!.passes.map((p) => p.state)).toEqual(['not-run', 'not-run']);
  });
});
