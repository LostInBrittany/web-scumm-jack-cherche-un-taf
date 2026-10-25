// tools/release/provenance.mjs (4.1.19, plan §6.5): the one contract `ship` and the Field Kit verify a candidate with.
// The manifest read strictly, files against its digests, the run an attestation names, and what makes a run one a tag
// or a pass may stand on. The GitHub calls themselves are field-kit.test.ts's (a stand-in `gh`) and ship's.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  candidateRunProblem,
  digestProblems,
  downloadArgs,
  FORMER_REPO,
  lookupArgs,
  PRE_TRANSFER_REPO,
  REPO,
  REPO_ID,
  repoIdProblem,
  readCandidateManifest,
  repoOfRelease,
  runOfStatement,
  sha256,
  verifyAttestation,
  // @ts-expect-error: a plain .mjs module without declarations
} from '../tools/release/provenance.mjs';

const m = {
  format: 'web-scumm-candidate',
  schema: 1,
  sha: 'a'.repeat(40),
  candidateRunId: '42',
  createdAt: 'x',
  artifacts: [
    { name: 'pack/web-scumm-4.1.19.tgz', sha256: sha256(Buffer.from('engine')) },
    { name: 'image/web-scumm-bridge-image.json', sha256: sha256(Buffer.from('image')) },
  ],
};

describe('provenance', () => {
  it('reads a candidate manifest strictly', () => {
    expect(readCandidateManifest(JSON.stringify(m)).candidateRunId).toBe('42');
    for (const bad of [
      { ...m, schema: 2 },
      { ...m, sha: 'abc' },
      { ...m, candidateRunId: 'x' },
      { ...m, artifacts: [{ name: 'a', sha256: 'z' }] },
    ])
      expect(() => readCandidateManifest(JSON.stringify(bad))).toThrow(/not a candidate manifest/);
    expect(() => readCandidateManifest('{')).toThrow(/not JSON/);
  });

  it('checks files against the digests, every one when asked', () => {
    const files = new Map([['pack/web-scumm-4.1.19.tgz', Buffer.from('engine')]]);
    expect(digestProblems(m, files)).toEqual([]);
    expect(digestProblems(m, files, { all: true })).toEqual(['image/web-scumm-bridge-image.json: missing']);
    expect(digestProblems(m, new Map([['pack/web-scumm-4.1.19.tgz', Buffer.from('other')]]))).toEqual([
      "pack/web-scumm-4.1.19.tgz: its SHA-256 differs from the manifest's",
    ]);
    expect(digestProblems(m, new Map([['extra', sha256(Buffer.from('x'))]]))).toEqual(['extra: not in the manifest']);
  });

  it('names the run of a provenance statement', () => {
    expect(
      runOfStatement('{"invocationId":"https://github.com/wanoo/web-scumm/actions/runs/38060321565/attempts/1"}'),
    ).toBe('38060321565');
    expect(runOfStatement('{"invocationId":"https://github.com/wanoo/web-scumm/actions/runs/7"}')).toBe('7');
    expect(runOfStatement('{}')).toBeNull();
  });

  it('a candidate run is a green candidate started by hand on main, nothing else', () => {
    const ok = {
      workflowName: 'candidate',
      status: 'completed',
      conclusion: 'success',
      event: 'workflow_dispatch',
      headBranch: 'main',
    };
    expect(candidateRunProblem(ok, '1')).toBeNull();
    expect(candidateRunProblem({ ...ok, workflowName: 'ci' }, '1')).toMatch(/not a candidate run/);
    expect(candidateRunProblem({ ...ok, event: 'pull_request' }, '1')).toMatch(/started by hand on main/);
    expect(candidateRunProblem({ ...ok, headBranch: 'feature' }, '1')).toMatch(/started by hand on main/);
    expect(candidateRunProblem({ ...ok, conclusion: 'failure' }, '1')).toMatch(/green candidate/);
  });
});

describe("the repository's former names (4.2.5, D47) and its transfer to the organization (4.5.2, D51)", () => {
  it('names the identity that attested each release: wanoo/web-scumm, then wanoo/quest-n-click, then the organization', () => {
    expect(REPO).toBe('Quest-n-Click/quest-n-click');
    expect(PRE_TRANSFER_REPO).toBe('wanoo/quest-n-click');
    expect(FORMER_REPO).toBe('wanoo/web-scumm');
    expect(repoOfRelease('4.2.4')).toBe('wanoo/web-scumm');
    expect(repoOfRelease('v4.1.20-rc.1')).toBe('wanoo/web-scumm');
    expect(repoOfRelease('4.2.5')).toBe('wanoo/quest-n-click');
    expect(repoOfRelease('4.2.5-rc.1')).toBe('wanoo/quest-n-click');
    expect(repoOfRelease('v4.5.1')).toBe('wanoo/quest-n-click');
    expect(repoOfRelease('4.5.2')).toBe('Quest-n-Click/quest-n-click');
    expect(repoOfRelease('4.5.2-rc.1')).toBe('Quest-n-Click/quest-n-click');
    expect(repoOfRelease('v4.6.0')).toBe('Quest-n-Click/quest-n-click');
  });

  it('looks a pre-transfer identity up under its owner, pinned to its workflow or its repository, never the owner alone', () => {
    const wf = (r: string) => `${r}/.github/workflows/release.yml`;
    expect(lookupArgs(REPO)).toEqual(['--repo', REPO]);
    expect(lookupArgs(REPO, wf(REPO))).toEqual(['--repo', REPO, '--signer-workflow', wf(REPO)]);
    expect(lookupArgs('wanoo/quest-n-click', wf('wanoo/quest-n-click'))).toEqual([
      '--owner',
      'wanoo',
      '--signer-workflow',
      'wanoo/quest-n-click/.github/workflows/release.yml',
    ]);
    expect(lookupArgs('wanoo/quest-n-click')).toEqual(['--owner', 'wanoo', '--signer-repo', 'wanoo/quest-n-click']);
    expect(lookupArgs('wanoo/web-scumm')).toEqual(['--owner', 'wanoo', '--signer-repo', 'wanoo/web-scumm']);
    // A workflow of another repository under the owner is refused: it would pin nothing of the identity.
    expect(() => lookupArgs('wanoo/web-scumm', wf(REPO))).toThrow(/not a workflow of wanoo\/web-scumm/);
    // A fork names its own repository: looked up there, whatever its owner.
    expect(lookupArgs('someone/quest-n-click')).toEqual(['--repo', 'someone/quest-n-click']);
    expect(downloadArgs(REPO)).toEqual(['--repo', REPO]);
    expect(downloadArgs('wanoo/quest-n-click')).toEqual(['--owner', 'wanoo']);
    expect(downloadArgs(repoOfRelease('4.2.4'))).toEqual(['--owner', 'wanoo']);
  });

  it.skipIf(process.platform === 'win32')(
    'tries the pre-transfer identities only when asked, in order, and their workflow under their owner',
    () => {
      const d = mkdtempSync(join(tmpdir(), 'former-repo-'));
      const gh = join(d, 'gh');
      // A `gh` whose attestations are under the user wanoo, signed by wanoo/web-scumm only (a candidate before 4.2.5).
      writeFileSync(
        gh,
        `#!/bin/sh\necho "$@" >> "${d}/calls"\ncase "$*" in\n  *"--owner wanoo --signer-workflow wanoo/web-scumm/"*) echo '[{"x":"/actions/runs/7/attempts/1","verificationResult":{"signature":{"certificate":{"sourceRepositoryIdentifier":"1402166796"}}}}]' ;;\n  *) echo "no attestation" >&2; exit 1 ;;\nesac\n`,
        { mode: 0o755 },
      );
      const file = join(d, 'candidate-manifest.json');
      writeFileSync(file, '{}');
      const signerWorkflow = `${REPO}/.github/workflows/candidate.yml`;
      expect(() => verifyAttestation(file, { gh, signerWorkflow })).toThrow(/does not verify/);
      expect(readFileSync(join(d, 'calls'), 'utf8').trim().split('\n')).toHaveLength(1);
      expect(verifyAttestation(file, { gh, signerWorkflow, former: true })).toEqual({ runId: '7' });
      const calls = readFileSync(join(d, 'calls'), 'utf8').trim().split('\n').slice(1);
      expect(calls).toEqual([
        `attestation verify ${file} --repo Quest-n-Click/quest-n-click --signer-workflow Quest-n-Click/quest-n-click/.github/workflows/candidate.yml --format json`,
        `attestation verify ${file} --owner wanoo --signer-workflow wanoo/quest-n-click/.github/workflows/candidate.yml --format json`,
        `attestation verify ${file} --owner wanoo --signer-workflow wanoo/web-scumm/.github/workflows/candidate.yml --format json`,
      ]);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'a release of 4.5.1 is asked under wanoo, pinned to wanoo/quest-n-click',
    () => {
      const d = mkdtempSync(join(tmpdir(), 'pre-transfer-'));
      const gh = join(d, 'gh');
      writeFileSync(
        gh,
        `#!/bin/sh\necho "$@" >> "${d}/calls"\necho '[{"verificationResult":{"signature":{"certificate":{"sourceRepositoryIdentifier":"1402166796"}}}}]'\n`,
        { mode: 0o755 },
      );
      const file = join(d, 'quest-n-click-4.5.1.tgz');
      writeFileSync(file, 'x');
      verifyAttestation(file, { gh, repo: repoOfRelease('4.5.1') });
      expect(readFileSync(join(d, 'calls'), 'utf8').trim()).toBe(
        `attestation verify ${file} --owner wanoo --signer-repo wanoo/quest-n-click --format json`,
      );
    },
  );

  it("accepts an attestation only when every certificate names the repository's id, 1402166796 (D51)", () => {
    const att = (id?: unknown) => ({
      verificationResult: { signature: { certificate: id === undefined ? {} : { sourceRepositoryIdentifier: id } } },
    });
    expect(REPO_ID).toBe('1402166796');
    expect(repoIdProblem(JSON.stringify([att('1402166796')]))).toBeNull();
    expect(repoIdProblem(JSON.stringify([att(1402166796)]))).toBeNull();
    // A repository created again under a former name: another id, refused, even beside the right one.
    expect(repoIdProblem(JSON.stringify([att('1402166796'), att('77')]))).toBe(
      'an attestation names repository id 77, not 1402166796',
    );
    expect(repoIdProblem(JSON.stringify([att()]))).toBe('an attestation names no repository id (want 1402166796)');
    expect(repoIdProblem('[]')).toBe('the verification returned no attestation');
    expect(repoIdProblem('nope')).toBe('the verification output is not JSON');
    // A fork with no id of its own: not checked.
    expect(repoIdProblem(JSON.stringify([att('77')]), null)).toBeNull();
  });

  it.skipIf(process.platform === 'win32')('refuses a verified attestation of another repository id', () => {
    const d = mkdtempSync(join(tmpdir(), 'repo-id-'));
    const gh = join(d, 'gh');
    writeFileSync(
      gh,
      `#!/bin/sh\necho '[{"verificationResult":{"signature":{"certificate":{"sourceRepositoryIdentifier":"77"}}}}]'\n`,
      { mode: 0o755 },
    );
    const file = join(d, 'quest-n-click-4.5.1.tgz');
    writeFileSync(file, 'x');
    expect(() => verifyAttestation(file, { gh, repo: repoOfRelease('4.5.1') })).toThrow(
      /does not verify \(an attestation names repository id 77, not 1402166796\)/,
    );
  });
});
