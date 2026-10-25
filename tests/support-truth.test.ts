// No surface promoted without its people's pass (4.1.18, plan §14.3 and §18.10): the support matrix (the wiki's
// `reference.support-matrix` in both languages since 4.5.0; docs/en|fr/SUPPORT.md before) keeps the `distributed`
// profile and the connectors experimental, and the GO / NO-GO keeps them NO-GO for
// "stable", unless the release's committed Field Kit reports (`docs/dev/field/<version>/`) hold that pass `passed`.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkDir } from '../tools/field/field';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
const dir = `docs/dev/field/${version}`;
// A pass counts only from a folder that checks (its candidate, its evidence, no leak): a stray `passed` does not.
const reports = existsSync(dir) ? checkDir(dir) : { problems: ['none'], reports: [] };
const passed = (id: string) =>
  reports.problems.length === 0 && reports.reports.some((r) => r.passId === id && r.status === 'passed');
const go = readFileSync('docs/dev/GO-NO-GO-4.2.md', 'utf8');
const verdict = (surface: string) =>
  go
    .split('\n')
    .find((l) => l.startsWith(`| ${surface} |`))
    ?.split('|')
    .at(-2) ?? '';

describe('the support matrix promotes nothing a person has not passed', () => {
  it('keeps the distributed Bridge experimental without `bridge-postgres-https`', () => {
    if (passed('bridge-postgres-https')) return;
    expect(readFileSync('wiki/en/reference.support-matrix.md', 'utf8')).toMatch(
      /Bridge, `distributed` profile[^|]*`experimental`/,
    );
    expect(readFileSync('wiki/fr/reference.support-matrix.md', 'utf8')).toMatch(
      /Bridge, profil `distributed`[^|]*`experimental`/,
    );
    expect(verdict('Bridge, Postgres (`distributed`)')).not.toContain('**stable**');
    expect(readFileSync('docs/dev/GO-NO-GO-4.2.md', 'utf8')).toMatch(/Bridge, Postgres[^\n]*\*\*experimental\*\*/);
  });

  it('keeps the connectors experimental without `connectors-real-security`', () => {
    if (passed('connectors-real-security')) return;
    expect(readFileSync('wiki/en/reference.support-matrix.md', 'utf8')).toMatch(
      /Connectors \(4\.1\.9\), \*\*experimental\*\*/,
    );
    expect(readFileSync('wiki/fr/reference.support-matrix.md', 'utf8')).toMatch(
      /Connecteurs \(4\.1\.9\), \*\*expérimental\*\*/,
    );
    const go = readFileSync('docs/dev/GO-NO-GO-4.2.md', 'utf8');
    for (const c of ['Email', 'SSH', 'Telnet', 'Open Badge'])
      expect(go).toMatch(new RegExp(`\\| ${c} connector \\|[^\\n]*\\*\\*experimental\\*\\*`));
  });

  it('calls no surface stable in the GO / NO-GO whose named pass is not passed', () => {
    for (const [surface, pass] of [
      ['Player, DOM', 'phone-both-renderers'],
      ['Player, Canvas', 'phone-both-renderers'],
      ['Voices and music', 'voices-listening'],
      ['Speedrun and Remix', 'livesplit-obs'],
      ['PWA, Safari', 'safari-ios-offline-update'],
      ['Firefox', 'firefox-real-offline'],
      ['Speedrun and Remix', 'runs-real-players'],
      ['Archives and install', 'archive-human-install'],
      ['Email connector', 'connectors-real-security'],
    ] as const) {
      expect(verdict(surface), surface).not.toBe('');
      if (!passed(pass)) expect(verdict(surface), surface).not.toMatch(/^\s*\*\*stable\*\*/);
    }
  });

  it('says NO-GO for 4.2, or GO on a reduced scope (D38), while any of the thirteen passes is not made', () => {
    const ids = [
      'bridge-postgres-https',
      'runs-real-players',
      'run-resume-power-cycle',
      'code-wheel-human',
      'mystery-deployed',
      'safari-ios-offline-update',
      'firefox-real-offline',
      'phone-both-renderers',
      'livesplit-obs',
      'connectors-real-security',
      'blind-playtesters',
      'voices-listening',
      'archive-human-install',
    ];
    if (ids.every(passed)) return;
    // Or, D38, the maintainer's decision to ship before them on a reduced scope: never a plain GO, and only with the
    // decision written down.
    const verdicts = [...go.matchAll(/\*\*(NO-GO|GO) for 4\.2( on a reduced scope)?/g)];
    const last = verdicts.at(-1);
    expect(last?.[1] === 'NO-GO' || last?.[2] === ' on a reduced scope', last?.[0]).toBe(true);
    if (last?.[1] === 'GO') expect(readFileSync('docs/dev/DECISIONS.md', 'utf8')).toMatch(/\*\*D38 · /);
  });
});
