// The npm packages staged for an owner's approval (4.5.2, #283, D34): tools/release/npm-stage.mjs against a fake npm.
// It stages each archive the release carries by OIDC, engine first, `latest` for a stable tag; skips a version already
// published or staged, so a re-run is safe; stops on a missing trusted publisher with the command that adds it;
// rehearses a pre-release tag, whose archives carry the stable version, without sending anything; and writes what an
// owner runs. Nothing here reaches the registry.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs module without declarations
import { PACKAGES } from '../tools/release/artifacts.mjs';
import {
  distTagFor,
  plan,
  stageAll,
  stageArgs,
  summary,
  tokenProblems,
  trustHint,
  // @ts-expect-error: a plain .mjs module without declarations
} from '../tools/release/npm-stage.mjs';

type R = { status?: number; stdout?: string; stderr?: string };
type Item = { name: string; version: string; file: string; distTag: string; archive: string };
type Result = Item & { state: string; id?: string | null; why?: string };

const REPO = 'Quest-n-Click/quest-n-click';
const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

/** A release folder holding the five archives of a version; `read` answers each one's package.json. */
function folder(version: string, over: Record<string, Record<string, unknown>> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'npm-stage-'));
  temps.push(dir);
  mkdirSync(dir, { recursive: true });
  const manifests = new Map<string, Record<string, unknown>>();
  for (const p of PACKAGES as { name: string; npm: string }[]) {
    const file = join(dir, `${p.name}-${version}.tgz`);
    writeFileSync(file, 'x');
    manifests.set(file, {
      name: p.npm,
      version,
      repository: { type: 'git', url: `git+https://github.com/${REPO}.git` },
      ...(p.npm === '@quest-n-click/create' ? { dependencies: { '@quest-n-click/engine': version } } : {}),
      ...over[p.npm],
    });
  }
  return { dir, read: (f: string) => manifests.get(f) };
}

/** A fake npm: each call recorded; `answers` by the call's start, else a 404 for a view and a staged id for a stage. */
function fakeNpm(answers: Record<string, R> = {}) {
  const calls: string[] = [];
  const exec = (cmd: string, args: string[]) => {
    const k = `${cmd} ${args.join(' ')}`;
    calls.push(k);
    for (const [p, r] of Object.entries(answers))
      if (k.startsWith(p)) return { status: 0, stdout: '', stderr: '', ...r };
    if (k.startsWith('npm view'))
      return { status: 1, stdout: '', stderr: 'npm error code E404\nnpm error 404 Not Found' };
    if (k.startsWith('npm stage publish')) {
      return { status: 0, stdout: `+ pkg (staged with id st-${calls.length})\n`, stderr: 'npm verb oidc ok' };
    }
    return { status: 1, stdout: '', stderr: 'unexpected' };
  };
  return { exec, calls };
}

describe('the dist-tag', () => {
  it('latest for a stable tag, next for a pre-release version, nothing for a stable version of a pre-release tag', () => {
    expect(distTagFor('4.5.2', '4.5.2')).toBe('latest');
    expect(distTagFor('4.5.3-next.7', '4.5.3-next.7')).toBe('next');
    expect(distTagFor('4.5.2-rc.1', '4.5.2-rc.1')).toBe('next');
    // An rc's archives carry the stable version (`{pkg}`): staging it would take the stable tag's number.
    expect(distTagFor('4.5.2-rc.1', '4.5.2')).toBeNull();
  });

  it('always stages with provenance, public, and an explicit tag; a rehearsal is a dry run', () => {
    expect(stageArgs('/r/a.tgz', 'latest')).toEqual([
      'stage',
      'publish',
      '/r/a.tgz',
      '--provenance',
      '--access',
      'public',
      '--tag',
      'latest',
      '--loglevel',
      'verbose',
    ]);
    expect(stageArgs('/r/a.tgz', 'next', { dryRun: true }).at(-1)).toBe('--dry-run');
  });
});

describe('the plan', () => {
  it('the five archives, engine first and create second, under their scoped names', () => {
    const { dir, read } = folder('4.5.2');
    const p = plan({ tag: 'v4.5.2', dir, repo: REPO, read });
    expect(p.mode).toBe('stage');
    expect(p.problems).toEqual([]);
    expect(p.items.map((i: Item) => i.name)).toEqual([
      '@quest-n-click/engine',
      '@quest-n-click/create',
      '@quest-n-click/bridge',
      '@quest-n-click/connectors',
      '@quest-n-click/studio-server',
    ]);
    expect(p.items.map((i: Item) => i.archive)[0]).toBe('quest-n-click-4.5.2.tgz');
    expect(new Set(p.items.map((i: Item) => i.distTag))).toEqual(new Set(['latest']));
  });

  it('rehearses a pre-release tag, skips a tag before the scoped names', () => {
    const { dir, read } = folder('4.5.2');
    expect(plan({ tag: 'v4.5.2-rc.1', dir, repo: REPO, read }).mode).toBe('rehearse');
    const old = plan({ tag: 'v4.5.1', dir, repo: REPO, read });
    expect(old.mode).toBe('skip');
    expect(old.why).toMatch(/predates the scoped names/);
  });

  it('refuses an archive missing, misnamed, of another version, of another repository, or create on another engine', () => {
    const { dir, read } = folder('4.5.2', {
      '@quest-n-click/bridge': { name: 'quest-n-click-bridge' },
      '@quest-n-click/connectors': { repository: { url: 'git+https://github.com/someone/fork.git' } },
      '@quest-n-click/create': { dependencies: { '@quest-n-click/engine': '^4.5.2' } },
      '@quest-n-click/studio-server': { version: '4.5.1' },
    });
    rmSync(join(dir, 'quest-n-click-4.5.2.tgz'));
    const { problems } = plan({ tag: 'v4.5.2', dir, repo: REPO, read });
    expect(problems.join('\n')).toMatch(/quest-n-click-4\.5\.2\.tgz: not among the release's files/);
    expect(problems.join('\n')).toMatch(/names quest-n-click-bridge, not @quest-n-click\/bridge/);
    expect(problems.join('\n')).toMatch(/repository git\+https:\/\/github\.com\/someone\/fork\.git, not/);
    expect(problems.join('\n')).toMatch(/depends on @quest-n-click\/engine \^4\.5\.2, not exactly 4\.5\.2/);
    expect(problems.join('\n')).toMatch(/version 4\.5\.1, not 4\.5\.2/);
  });
});

describe('staging', () => {
  const stable = () => {
    const { dir, read } = folder('4.5.2');
    return plan({ tag: 'v4.5.2', dir, repo: REPO, read });
  };

  it('stages each package in order by `npm stage publish` only, and keeps each id', () => {
    const p = stable();
    const { exec, calls } = fakeNpm();
    const results = stageAll({ exec, plan: p, repo: REPO });
    expect(results.map((r: Result) => r.state)).toEqual(Array(5).fill('staged'));
    expect(results.every((r: Result) => /^st-\d+$/.test(String(r.id)))).toBe(true);
    const stages = calls.filter((c) => c.startsWith('npm stage publish'));
    expect(stages).toHaveLength(5);
    expect(stages[0]).toContain('quest-n-click-4.5.2.tgz --provenance --access public --tag latest');
    expect(stages[1]).toContain('create-quest-n-click-4.5.2.tgz');
    for (const c of calls) expect(c).toMatch(/^npm (view @quest-n-click\/[a-z-]+@4\.5\.2 version|stage publish )/);
  });

  it('skips a version already published or already staged, so a re-run is safe', () => {
    const p = stable();
    const { exec, calls } = fakeNpm({
      'npm view @quest-n-click/engine@4.5.2': { stdout: '4.5.2\n' },
      ['npm stage publish ' + p.items[1].file]: {
        status: 1,
        stderr:
          'npm verb stage\nnpm error code E409\nnpm error 409 Conflict - POST https://registry.npmjs.org/-/stage/package/@quest-n-click%2fcreate',
      },
    });
    const results = stageAll({ exec, plan: p, repo: REPO });
    expect(results.map((r: Result) => r.state)).toEqual(['published', 'already-staged', 'staged', 'staged', 'staged']);
    // The published one is never sent again.
    expect(calls.some((c) => c.startsWith(`npm stage publish ${p.items[0].file}`))).toBe(false);
  });

  it('reads a refusal to publish over a version as published', () => {
    const p = stable();
    const { exec } = fakeNpm({
      ['npm stage publish ' + p.items[0].file]: {
        status: 1,
        stderr: 'npm error You cannot publish over the previously published versions: 4.5.2.',
      },
    });
    expect(stageAll({ exec, plan: p, repo: REPO })[0].state).toBe('published');
  });

  it('stops at the first failure, a missing trusted publisher named with the command that adds it', () => {
    const p = stable();
    const { exec, calls } = fakeNpm({
      ['npm stage publish ' + p.items[0].file]: {
        status: 1,
        stderr:
          'npm error code ENEEDAUTH\nnpm error This command requires you to be logged in to https://registry.npmjs.org/',
      },
    });
    const results = stageAll({ exec, plan: p, repo: REPO });
    expect(results).toHaveLength(1);
    expect(results[0].state).toBe('failed');
    expect(results[0].why).toContain(trustHint('@quest-n-click/engine', REPO));
    expect(results[0].why).toContain(
      'npm trust github @quest-n-click/engine --repo Quest-n-Click/quest-n-click --file release.yml --allow-stage-publish',
    );
    expect(results[0].why).toMatch(/two days/);
    // create is never staged without the engine it depends on.
    expect(calls.filter((c) => c.startsWith('npm stage publish'))).toHaveLength(1);
  });

  it('never judges a version on a registry that did not answer', () => {
    const p = stable();
    const { exec, calls } = fakeNpm({ 'npm view': { status: 1, stderr: 'npm error code ECONNRESET' } });
    const results = stageAll({ exec, plan: p, repo: REPO });
    expect(results).toHaveLength(1);
    expect(results[0].why).toMatch(/ECONNRESET/);
    expect(calls.some((c) => c.startsWith('npm stage'))).toBe(false);
  });

  it('rehearses a pre-release tag by a dry run through OIDC, and fails when OIDC gave no credential', () => {
    const { dir, read } = folder('4.5.2');
    const p = plan({ tag: 'v4.5.2-rc.1', dir, repo: REPO, read });
    const ok = fakeNpm();
    expect(stageAll({ exec: ok.exec, plan: p, repo: REPO }).map((r: Result) => r.state)).toEqual(
      Array(5).fill('rehearsed'),
    );
    for (const c of ok.calls.filter((x) => x.startsWith('npm stage')))
      expect(c).toMatch(/--tag next --loglevel verbose --dry-run$/);
    // npm's dry run only warns without a credential.
    const none = fakeNpm({
      'npm stage publish': {
        status: 0,
        stderr: 'npm warn stage This command requires you to be logged in to https://registry.npmjs.org/ (dry-run)',
      },
    });
    const results = stageAll({ exec: none.exec, plan: p, repo: REPO });
    expect(results).toHaveLength(1);
    expect(results[0].state).toBe('failed');
    expect(results[0].why).toContain('--allow-stage-publish');
  });
});

describe('the summary', () => {
  it('lists each package and the approvals an owner runs, engine first', () => {
    const { dir, read } = folder('4.5.2');
    const p = plan({ tag: 'v4.5.2', dir, repo: REPO, read });
    const { exec } = fakeNpm({
      ['npm stage publish ' + p.items[2].file]: { status: 1, stderr: 'npm error code E409\nnpm error 409 Conflict' },
    });
    const results = stageAll({ exec, plan: p, repo: REPO });
    const md: string = summary({ tag: 'v4.5.2', plan: p, results, runSha: 'a'.repeat(40), tagSha: 'b'.repeat(40) });
    expect(md).toContain('## npm: v4.5.2');
    expect(md).toContain('| `@quest-n-click/engine` | 4.5.2 | latest | staged, id `');
    const approvals = md.split('\n').filter((l) => /^npm stage (approve|list) /.test(l));
    expect(approvals).toHaveLength(5);
    expect(approvals[0]).toMatch(/^npm stage approve st-\d+ {3}# @quest-n-click\/engine@4\.5\.2$/);
    expect(approvals[1]).toMatch(/# @quest-n-click\/create@4\.5\.2$/);
    expect(approvals[2]).toBe('npm stage list @quest-n-click/bridge   # then: npm stage approve <the id of 4.5.2>');
    expect(md).toMatch(/in this order/);
    expect(md).toContain('`aaaaaaaaaaaa`');
    expect(md).toContain('`bbbbbbbbbbbb`');
    // Since 4.5.3 (#291) release.yml runs on the tag's push: the provenance names the tag and its commit, and a run
    // whose commit is not the tag's is said, never approved.
    expect(md).toContain('Provenance names `release.yml` at `refs/tags/v4.5.2`');
    expect(md).toMatch(/not the tag's `bbbbbbbbbbbb`\*\*: do not approve/);
    expect(md).not.toMatch(/workflow_run|from main/);
    const same: string = summary({ tag: 'v4.5.2', plan: p, results, runSha: 'a'.repeat(40), tagSha: 'a'.repeat(40) });
    expect(same).toContain("at `refs/tags/v4.5.2`, commit `aaaaaaaaaaaa`: release.yml runs on the tag's push.");
    expect(same).not.toMatch(/do not approve/);
  });

  it('asks nothing of an owner after a rehearsal or a skip', () => {
    const { dir, read } = folder('4.5.2');
    const p = plan({ tag: 'v4.5.2-rc.1', dir, repo: REPO, read });
    const results = stageAll({ exec: fakeNpm().exec, plan: p, repo: REPO });
    const md: string = summary({ tag: 'v4.5.2-rc.1', plan: p, results });
    expect(md).toMatch(/rehearsed: OIDC accepted, nothing sent/);
    expect(md).not.toMatch(/npm stage approve/);
    const old = plan({ tag: 'v4.5.1', dir, repo: REPO, read });
    expect(summary({ tag: 'v4.5.1', plan: old, results: [] })).toMatch(/predates the scoped names/);
  });
});

describe('no token', () => {
  it('refuses a token in the environment or in an .npmrc', () => {
    expect(tokenProblems({ PATH: '/bin', NODE_AUTH_TOKEN: '' }, {})).toEqual([]);
    expect(tokenProblems({ NODE_AUTH_TOKEN: 'x' }, {})).toHaveLength(1);
    expect(tokenProblems({ NPM_TOKEN: 'x', npm_config__authToken: 'y' }, {})).toHaveLength(2);
    expect(tokenProblems({ 'npm_config_//registry.npmjs.org/:_authToken': 'z' }, {})).toHaveLength(1);
    expect(tokenProblems({}, { '/h/.npmrc': '//registry.npmjs.org/:_authToken=abc\n' })).toHaveLength(1);
    expect(tokenProblems({}, { '/h/.npmrc': 'fund=false\n# _authToken=old\n' })).toEqual([]);
  });
});
