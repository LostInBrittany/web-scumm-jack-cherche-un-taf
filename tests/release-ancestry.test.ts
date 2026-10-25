// The release line (4.1.16, docs/dev/PLAN-4.1.16-CONVERGENCE.md §11.1): the stable tag below a new tag must be its ancestor. v4.1.14 was tagged on a
// side branch main never merged; this rebuilds that shape in a scratch repository and checks both refusals, then that
// Pages waits for the terminal gate.
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error: a plain .mjs tool without declarations
import { checkAncestry, previousStable } from '../tools/release/ancestry.mjs';

const dir = mkdtempSync(join(tmpdir(), 'ws-ancestry-'));
const git = (...args: string[]) =>
  execFileSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
    },
  }).trim();
let n = 0;
const commit = (msg: string) => {
  const f = `f${n++}`; // one file per commit: the merge below never conflicts
  writeFileSync(join(dir, f), msg);
  git('add', f);
  git('commit', '-q', '-m', msg);
  return git('rev-parse', 'HEAD');
};
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('the previous stable tag', () => {
  it('is the highest stable tag strictly below, pre-releases and other refs ignored', () => {
    const tags = [
      'v4.1.13',
      'v4.1.14',
      'v4.1.14-rc.1',
      'v4.1.15-rc.1',
      'v4.1.15',
      'v4.1.9',
      'not-a-tag',
      'v4.1.16-rc.1',
    ];
    expect(previousStable('4.1.16', tags)).toBe('v4.1.15');
    expect(previousStable('v4.1.16-rc.1', tags)).toBe('v4.1.15');
    expect(previousStable('4.1.15-rc.1', tags)).toBe('v4.1.14');
    expect(previousStable('4.1.10', tags)).toBe('v4.1.9');
    expect(previousStable('4.2.0', tags)).toBe('v4.1.15');
    expect(previousStable('1.0.0', tags)).toBeNull();
    expect(() => previousStable('latest', tags)).toThrow(/SemVer/);
  });

  it('refuses a tag whose previous stable tag sits on a side branch, accepts it once merged', () => {
    git('init', '-q', '-b', 'main');
    const base = commit('4.1.13');
    git('tag', 'v4.1.13');
    git('checkout', '-q', '-b', 'side');
    commit('floors for the 4.1.14 tag');
    git('tag', '-a', 'v4.1.14', '-m', '4.1.14');
    git('checkout', '-q', 'main');
    const main15 = commit('4.1.15');
    expect(git('merge-base', 'HEAD', 'v4.1.14')).toBe(base);

    const refused = checkAncestry('4.1.15', main15, { cwd: dir });
    expect(refused).toMatchObject({ ok: false, previous: 'v4.1.14' });
    expect(refused.reason).toContain('not an ancestor');
    expect(checkAncestry('4.1.15-rc.1', main15, { cwd: dir }).ok).toBe(false);

    git('merge', '-q', '--no-ff', '-m', 'merge v4.1.14', 'v4.1.14');
    const merged = git('rev-parse', 'HEAD');
    expect(checkAncestry('4.1.15', merged, { cwd: dir })).toMatchObject({ ok: true, previous: 'v4.1.14' });
    expect(checkAncestry('4.1.13', merged, { cwd: dir })).toMatchObject({ ok: true, previous: null });
    // A commit git does not know is a refusal, never a pass (fail closed).
    const unknown = checkAncestry('4.1.15', 'deadbeef'.repeat(5), { cwd: dir });
    expect(unknown).toMatchObject({ ok: false, previous: 'v4.1.14' });
    expect(unknown.reason).toMatch(/merge-base failed/);
  });

  it('is checked by ship tag and by release.yml before publishing', () => {
    expect(readFileSync('tools/release/ship.mjs', 'utf8')).toMatch(/checkAncestry\(version, full\)/);
    const release = readFileSync('.github/workflows/release.yml', 'utf8');
    expect(release).toContain('node tools/release/ancestry.mjs "$TAG" "$SHA"');
    expect(release.indexOf('The previous stable tag is an ancestor')).toBeLessThan(
      release.indexOf('Not published yet'),
    );
  });
});
