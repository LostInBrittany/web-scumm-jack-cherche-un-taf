// The rehearsal of 4.2's operations (4.1.20 PR 3b, plan §11.1–11.2): a release made a draft, filled, published, then
// read back; a tag signed with an SSH key (`ship tag --sign`, inactive for 4.1.x), rehearsed by the candidate with an
// ephemeral key; and `ship preflight-stable`, which says what 4.2 still needs without changing anything.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  guardsTags,
  jsonObjects,
  MINIMUM,
  PACKAGES,
  packagesFor,
  passesAsked,
  pinProblems,
  pinsOf,
  preflight,
  // @ts-expect-error: a plain .mjs module without declarations
} from '../tools/release/preflight.mjs';
// @ts-expect-error: a plain .mjs module without declarations
import { isSignedTag, rehearse, tagArgs } from '../tools/release/signing.mjs';

const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'release-stable-'));
  temps.push(d);
  return d;
};
const release = readFileSync('.github/workflows/release.yml', 'utf8');

describe('release.yml', () => {
  it('makes a draft, uploads every file, publishes it, then reads it back', () => {
    const create = release.indexOf('gh release create "$TAG" --draft --verify-tag');
    const upload = release.indexOf('gh release upload "$TAG"');
    const publish = release.indexOf('gh release edit "$TAG" --draft=false');
    const verify = release.indexOf('node tools/release/ship.mjs verify "$TAG"');
    expect(create).toBeGreaterThan(0);
    expect(create < upload && upload < publish && publish < verify).toBe(true);
    // Never "create unless it exists": a published release is never touched again.
    expect(release).not.toMatch(/gh release view "\$TAG" >\/dev\/null 2>&1 \|\| gh release create/);
  });

  it('stops on a published release without changing it, and makes again a draft an earlier run left', () => {
    const step = release.slice(
      release.indexOf('- name: Not published yet'),
      release.indexOf('- uses: actions/setup-node', release.indexOf('- name: Not published yet')),
    );
    expect(step).toMatch(/published\) echo "::error::.*exit 1 ;;/);
    expect(step).toMatch(/gh release delete "\$TAG" --yes/);
    expect(step).not.toMatch(/--cleanup-tag/);
  });

  // The step itself, run by bash against a fake gh (second reading of #122): `drafts` drafts, then `after`.
  function notPublishedYet(answers: {
    drafts?: number;
    after: 'none' | 'published' | 'weird' | 'auth';
    warn?: boolean;
  }) {
    const start = release.indexOf('- name: Not published yet');
    const body = release.slice(
      release.indexOf('run: |', start) + 'run: |'.length,
      release.indexOf('\n        env:', start),
    );
    const script = body
      .split('\n')
      .map((l) => l.replace(/^ {10}/, ''))
      .join('\n');
    const dir = tmp();
    writeFileSync(join(dir, 'drafts'), String(answers.drafts ?? 0));
    writeFileSync(
      join(dir, 'gh'),
      `#!/bin/bash
echo "$*" >> "${dir}/calls"
n=$(cat "${dir}/drafts")
if [ "$1 $2" = "release delete" ]; then echo $((n - 1)) > "${dir}/drafts"; exit 0; fi
${answers.warn ? 'echo "A new release of gh is available" >&2' : ''}
if [ "$n" -gt 0 ]; then case "$*" in *"isDraft --jq .isDraft"*) echo true ;; *) echo draft ;; esac; exit 0; fi
case "${answers.after}" in
  none) echo "release not found" >&2; exit 1 ;;
  published) case "$*" in *"isDraft --jq .isDraft"*) echo false ;; *) echo published ;; esac ;;
  weird) echo "maybe" ;;
  auth) echo "HTTP 401: Bad credentials" >&2; exit 1 ;;
esac
`,
      { mode: 0o755 },
    );
    const r = spawnSync('bash', ['-e', '-c', script], {
      encoding: 'utf8',
      env: { PATH: `${dir}:${process.env.PATH}`, TAG: 'v9.9.9' },
    });
    const calls = (() => {
      try {
        return readFileSync(join(dir, 'calls'), 'utf8').trim().split('\n');
      } catch {
        return [];
      }
    })();
    return {
      status: r.status,
      out: `${r.stdout}${r.stderr}`,
      deletes: calls.filter((c) => c.startsWith('release delete')).length,
    };
  }

  it('goes on when there is no release, deletes every draft (two runs may each leave one), never the tag', () => {
    expect(notPublishedYet({ after: 'none' })).toMatchObject({ status: 0, deletes: 0 });
    expect(notPublishedYet({ drafts: 1, after: 'none' })).toMatchObject({ status: 0, deletes: 1 });
    expect(notPublishedYet({ drafts: 2, after: 'none' })).toMatchObject({ status: 0, deletes: 2 });
    expect(notPublishedYet({ drafts: 9, after: 'none' }).status).not.toBe(0);
  });

  it('stops on a published release, an answer it does not know, an error of gh, and a warning does not change that', () => {
    expect(notPublishedYet({ after: 'published' })).toMatchObject({ status: 1, deletes: 0 });
    expect(notPublishedYet({ after: 'published', warn: true })).toMatchObject({ status: 1, deletes: 0 });
    expect(notPublishedYet({ after: 'weird' }).out).toMatch(/unexpected answer 'maybe'/);
    expect(notPublishedYet({ after: 'weird' }).status).toBe(1);
    expect(notPublishedYet({ after: 'auth' })).toMatchObject({ status: 1, deletes: 0 });
    expect(notPublishedYet({ drafts: 1, after: 'published' })).toMatchObject({ status: 1, deletes: 1 });
  });

  it('runs one release per tag at a time, never cancelling the first', () => {
    expect(release).toMatch(
      /concurrency:\n {2}group: release-\$\{\{ github\.event\.workflow_run\.head_branch \}\}\n {2}cancel-in-progress: false/,
    );
  });

  it('pins the future publishing step to exact versions, never a range', () => {
    const pins = pinsOf(release);
    expect(pinProblems(pins)).toEqual([]);
    expect(pins.npm.split('.').map(Number)[1]).toBeGreaterThanOrEqual(15);
    expect(pinProblems({ node: '>=22.14.0', npm: '11.21.0' })).toEqual(['node: >=22.14.0 is not an exact version']);
    expect(pinProblems({ node: '22.12.0', npm: '^11.15.0' })).toEqual([
      'node: 22.12.0, below 22.14.0',
      'npm: ^11.15.0 is not an exact version',
    ]);
    expect(pinProblems({ npm: '11.14.9' })).toEqual(['node: not pinned', 'npm: 11.14.9, below 11.15.0']);
    expect(MINIMUM.npm).toBe('11.15.0');
  });
});

describe('a tag signed with an SSH key', () => {
  it('is annotated by default, signed with --sign', () => {
    expect(tagArgs({ name: 'v4.2.0', sha: 'abc', message: 'm' })).toEqual(['tag', '-a', 'v4.2.0', 'abc', '-m', 'm']);
    expect(tagArgs({ name: 'v4.2.0', sha: 'abc', message: 'm', sign: true, key: '/k' })).toEqual([
      '-c',
      'gpg.format=ssh',
      '-c',
      'user.signingkey=/k',
      'tag',
      '-s',
      'v4.2.0',
      'abc',
      '-m',
      'm',
    ]);
  });

  it('tells a signed tag object from an annotated one', () => {
    expect(
      isSignedTag(
        'object abc\ntype commit\ntag v4.2.0\n\nm\n-----BEGIN SSH SIGNATURE-----\nU1NI\n-----END SSH SIGNATURE-----',
      ),
    ).toBe(true);
    expect(isSignedTag('object abc\ntype commit\ntag v4.2.0\n\nm mentions -----BEGIN SSH SIGNATURE----- inline')).toBe(
      false,
    );
    expect(isSignedTag('object abc\ntype commit\ntag v4.1.20\n\nm')).toBe(false);
  });

  it('is rehearsed with an ephemeral key: signed, verified, the key and the tag destroyed, nothing pushed', () => {
    const dir = tmp();
    const g = (args: string[]) =>
      spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e.org', ...args], { cwd: dir, encoding: 'utf8' });
    g(['init', '-q']);
    writeFileSync(join(dir, 'a.txt'), 'a');
    g(['add', '-A']);
    g(['commit', '-q', '--no-gpg-sign', '-m', 'one']);
    const { ok, report } = rehearse({ cwd: dir, now: new Date(0) });
    expect(ok).toBe(true);
    expect(report).toMatchObject({
      format: 'web-scumm-signing-rehearsal',
      signed: true,
      verified: true,
      keyDestroyed: true,
      tagDeleted: true,
      pushed: false,
    });
    expect(report.principal).toBe('rehearsal@web-scumm.invalid');
    expect(g(['tag', '-l']).stdout.trim()).toBe('');
  });
});

describe('ship preflight-stable', () => {
  /** gh, npm and git answering as a repository before any 4.2 setup. */
  function fakes(over: Record<string, { status?: number; stdout?: string; stderr?: string }> = {}) {
    const calls: string[] = [];
    const exec = (cmd: string, args: string[]) => {
      const k = `${cmd} ${args.join(' ')}`;
      calls.push(k);
      for (const [p, r] of Object.entries(over))
        if (k.startsWith(p)) return { status: 0, stdout: '', stderr: '', ...r };
      if (k.startsWith('npm view')) return { status: 1, stdout: '', stderr: 'E404' };
      if (k.startsWith('npm publish --dry-run')) return { status: 0, stdout: '', stderr: '' };
      if (k.startsWith('gh api repos/o/r/immutable-releases'))
        return { status: 0, stdout: '{"enabled":false}', stderr: '' };
      if (k.startsWith('gh api repos/o/r/rulesets')) return { status: 0, stdout: '[]', stderr: '' };
      if (k.startsWith('gh api users/')) return { status: 0, stdout: '[]', stderr: '' };
      return { status: 1, stdout: '', stderr: '' };
    };
    return { exec, calls };
  }
  const root = () => {
    const d = tmp();
    mkdirSync(join(d, '.github', 'workflows'), { recursive: true });
    mkdirSync(join(d, 'docs', 'dev'), { recursive: true });
    writeFileSync(join(d, '.github', 'workflows', 'release.yml'), release);
    writeFileSync(join(d, 'docs', 'dev', 'GO-NO-GO-4.2.md'), '**NO-GO for 4.2 today**');
    const pack = join(d, 'pack');
    mkdirSync(pack);
    for (const p of PACKAGES) writeFileSync(join(pack, `${p}-4.2.0.tgz`), 'x');
    return { d, pack };
  };
  const state = (rows: { id: string; state: string }[], id: string) => rows.find((r) => r.id === id)?.state;

  it('says each step still to take, apart, and changes nothing', () => {
    const { d, pack } = root();
    const { exec, calls } = fakes();
    const rows = preflight({
      exec,
      repo: 'o/r',
      login: 'me',
      version: '4.2.0',
      root: d,
      candidate: { run: '1', problems: [], pack },
    });
    for (const id of ['signing-key', 'signing-key-on-github', 'allowed-signers', 'immutable-releases', 'tag-ruleset'])
      expect(state(rows, id), id).toBe('missing');
    for (const p of packagesFor('4.2.0')) {
      expect(state(rows, `${p}:archive`)).toBe('ok');
      expect(state(rows, `${p}:name`)).toBe('ok');
      expect(state(rows, `${p}:bootstrap`)).toBe('missing');
      expect(state(rows, `${p}:trusted-publisher`)).toBe('missing');
      expect(state(rows, `${p}:oidc`)).toBe('missing');
      expect(state(rows, `${p}:version`)).toBe('ok');
    }
    expect(state(rows, 'candidate')).toBe('ok');
    expect(state(rows, 'publish-pins')).toBe('ok');
    expect(state(rows, 'go-no-go')).toBe('ok');
    expect(rows.filter((r: { state: string }) => r.state === 'blocked')).toEqual([]);
    // Nothing that writes: no publish but its dry run, no gh call but reads, no git but config reads.
    for (const c of calls) {
      expect(c).not.toMatch(/^npm (publish(?! --dry-run)|stage|trust (github|revoke)|dist-tag|unpublish)/);
      expect(c).not.toMatch(/^gh (release (create|edit|upload|delete)|api .* -X|api .* --method)/);
      expect(c).not.toMatch(/^git (tag|push|commit|config (?!--get))/);
    }
  });

  it("calls a name free only on npm's 404, never when the registry did not answer (second reading of #122)", () => {
    const { d, pack } = root();
    const down = fakes({ 'npm view': { status: 1, stderr: 'npm error code ECONNRESET\nnpm error network aborted' } });
    const rows = preflight({
      exec: down.exec,
      repo: 'o/r',
      login: 'me',
      version: '4.2.0',
      root: d,
      candidate: { run: '1', problems: [], pack },
    });
    for (const p of packagesFor('4.2.0')) {
      expect(state(rows, `${p}:name`)).toBe('blocked');
      expect(rows.find((r: { id: string }) => r.id === `${p}:name`).say).toMatch(/ECONNRESET|network aborted/);
      expect(state(rows, `${p}:bootstrap`)).toBeUndefined();
      expect(state(rows, `${p}:version`)).toBeUndefined();
    }
    const json404 = fakes({ 'npm view': { status: 1, stdout: '{"error":{"code":"E404","summary":"Not Found"}}' } });
    const free = preflight({
      exec: json404.exec,
      repo: 'o/r',
      login: 'me',
      version: '4.2.0',
      root: d,
      candidate: { run: '1', problems: [], pack },
    });
    for (const p of packagesFor('4.2.0')) expect(state(free, `${p}:name`)).toBe('ok');
  });

  it('reads user.signingkey as git does: a file, a ~/ path, or key:: and the key itself', () => {
    const { d, pack } = root();
    const home = tmp();
    mkdirSync(join(home, '.ssh'));
    writeFileSync(join(home, '.ssh', 'k.pub'), 'ssh-ed25519 AAAAhome me@x\n');
    const run = (setting: string) =>
      state(
        preflight({
          exec: fakes({
            'git config --get user.signingkey': { stdout: setting },
            'git config --get gpg.format': { stdout: 'ssh' },
          }).exec,
          repo: 'o/r',
          login: 'me',
          version: '4.2.0',
          root: d,
          home,
          candidate: { run: '1', problems: [], pack },
        }),
        'signing-key',
      );
    expect(run('~/.ssh/k.pub')).toBe('ok');
    expect(run('~/.ssh/k')).toBe('ok');
    expect(run('key::ssh-ed25519 AAAAliteral me@x')).toBe('ok');
    expect(run('~/.ssh/absent.pub')).toBe('missing');
    expect(run('')).toBe('missing');
  });

  it('blocks on a candidate that does not verify, a name taken, a version published, a publisher that may publish', () => {
    const { d, pack } = root();
    const cfg = (id: string, permissions: string[]) =>
      JSON.stringify({ id, type: 'github', repository: 'o/r', file: 'release.yml', permissions }, null, 2);
    const { exec } = fakes({
      'npm view web-scumm name': { stdout: '{"maintainers":["me-too <s@x>"]}' },
      'npm view web-scumm@4.2.0': { stdout: '4.2.0' },
      'npm view create-web-scumm name': { stdout: '{"maintainers":["me <me@x>"]}' },
      'npm view web-scumm-bridge name': { stdout: '{"maintainers":["me <me@x>"]}' },
      // npm 11.21.0's own shape: one indented object per configuration, its permissions beside its values.
      'npm trust list create-web-scumm': {
        stdout: `${cfg('a', ['createStagedPackage'])}\n${cfg('b', ['createPackage', 'createStagedPackage'])}\n`,
      },
      'npm trust list web-scumm-bridge': { stdout: `${cfg('c', ['createStagedPackage'])}\n` },
    });
    const at = (o: Record<string, unknown>) =>
      preflight({
        exec,
        repo: 'o/r',
        login: 'me',
        version: '4.2.0',
        root: d,
        candidate: { run: '1', problems: ['not green'], pack },
        ...o,
      });
    const rows = at({ npmUser: 'me' });
    expect(state(rows, 'candidate')).toBe('blocked');
    // `me-too` is not `me`: a name is ours by its exact npm user, never a prefix.
    expect(state(rows, 'web-scumm:name')).toBe('blocked');
    expect(state(rows, 'web-scumm:version')).toBe('blocked');
    expect(state(rows, 'create-web-scumm:name')).toBe('ok');
    expect(state(rows, 'create-web-scumm:trusted-publisher')).toBe('blocked');
    expect(state(rows, 'web-scumm-bridge:trusted-publisher')).toBe('ok');
    // Not logged in to npm: whose a taken name is cannot be told, said, not guessed.
    expect(state(at({}), 'create-web-scumm:name')).toBe('missing');
  });

  it('sees a ruleset on the release tags, immutability, and a GO the reports contradict', () => {
    const rs = {
      id: 7,
      name: 'tags',
      target: 'tag',
      enforcement: 'active',
      bypass_actors: [{ actor_type: 'RepositoryRole', actor_id: 5, bypass_mode: 'always' }],
      conditions: { ref_name: { include: ['refs/tags/v*'] } },
      rules: [{ type: 'creation' }, { type: 'deletion' }, { type: 'non_fast_forward' }],
    };
    expect(guardsTags(rs)).toBe(true);
    // Creation restricted to nobody: the maintainer could not tag either.
    expect(guardsTags({ ...rs, bypass_actors: [] })).toBe(false);
    expect(guardsTags({ ...rs, enforcement: 'evaluate' })).toBe(false);
    expect(guardsTags({ ...rs, rules: [{ type: 'deletion' }] })).toBe(false);
    expect(guardsTags({ ...rs, target: 'branch' })).toBe(false);
    const { d, pack } = root();
    // The last verdict the sheet writes counts (an older one may stay above it).
    writeFileSync(join(d, 'docs', 'dev', 'GO-NO-GO-4.2.md'), '**NO-GO for 4.2 today**\n\nlater: **GO for 4.2**');
    const { exec } = fakes({
      'gh api repos/o/r/rulesets/7': { stdout: JSON.stringify(rs) },
      'gh api repos/o/r/rulesets': { stdout: '[{"id":7}]' },
      'gh api repos/o/r/immutable-releases': { stdout: '{"enabled":true}' },
    });
    const rows = preflight({
      exec,
      repo: 'o/r',
      login: 'me',
      version: '4.2.0',
      root: d,
      candidate: { run: '1', problems: [], pack },
    });
    expect(state(rows, 'tag-ruleset')).toBe('ok');
    expect(state(rows, 'immutable-releases')).toBe('ok');
    expect(state(rows, 'go-no-go')).toBe('blocked');
    // D38: shipping before the passes, on a reduced scope, is not a GO; a plain GO written after it still blocks.
    const goRows = (sheet: string) => {
      writeFileSync(join(d, 'docs', 'dev', 'GO-NO-GO-4.2.md'), sheet);
      return preflight({
        exec,
        repo: 'o/r',
        login: 'me',
        version: '4.2.0',
        root: d,
        candidate: { run: '1', problems: [], pack },
      });
    };
    expect(state(goRows('**NO-GO for 4.2 today**\n\n**GO for 4.2 on a reduced scope.**'), 'go-no-go')).toBe('ok');
    expect(state(goRows('**GO for 4.2 on a reduced scope.**\n\n**GO for 4.2**'), 'go-no-go')).toBe('blocked');
    expect(state(goRows('**NO-GO for 4.2 on a reduced scope**'), 'go-no-go')).toBe('ok');
    // Every pass passed after a reduced GO: the sheet can be written GO.
    const field = join(d, 'docs', 'dev', 'field', '4.2.0');
    mkdirSync(field, { recursive: true });
    for (let i = 0; i < 13; i++) writeFileSync(join(field, `p${i}.json`), '{"status":"passed"}');
    expect(state(goRows('**GO for 4.2 on a reduced scope.**'), 'go-no-go')).toBe('missing');
  });

  it("reads npm's objects one after the other, and a gh error body is no list", () => {
    expect(jsonObjects('{\n  "a": "}"\n}\n{"b": [1, {"c": 2}]}\nnoise')).toEqual([{ a: '}' }, { b: [1, { c: 2 }] }]);
    const { d, pack } = root();
    // gh answers a 403 with a JSON body on stdout: no crash, the checks are missing.
    const exec = (cmd: string) =>
      cmd === 'gh'
        ? { status: 1, stdout: '{"message":"Forbidden","status":"403"}', stderr: '' }
        : { status: 1, stdout: '', stderr: 'E404' };
    const rows = preflight({
      exec,
      repo: 'o/r',
      login: 'me',
      version: '4.2.0',
      root: d,
      candidate: { run: '1', problems: [], pack },
    });
    expect(state(rows, 'tag-ruleset')).toBe('missing');
    expect(state(rows, 'signing-key-on-github')).toBe('missing');
  });
});

describe('what a release is asked', () => {
  it('the Studio Server archive from 4.2.1 on, and the two passes it came with', () => {
    expect(packagesFor('4.2.0')).not.toContain('web-scumm-studio-server');
    expect(packagesFor('4.2.1-rc.1')).toContain('web-scumm-studio-server');
    expect(passesAsked('4.2.0')).toHaveLength(13);
    expect(passesAsked('4.2.1')).toHaveLength(15);
    expect(passesAsked('4.2.1')).toContain('studio-collab');
  });
});

describe('the nightly', () => {
  it('watches the four npm names without gating', () => {
    const nightly = readFileSync('.github/workflows/nightly.yml', 'utf8');
    const job = nightly.slice(nightly.indexOf('\n  npm-names:'), nightly.indexOf('\n  heavy:'));
    expect(job).toContain('continue-on-error: true');
    for (const p of PACKAGES) expect(job).toContain(p);
    expect(job).toContain('::warning title=npm name taken::');
  });
});
