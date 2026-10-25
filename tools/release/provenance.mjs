// What a candidate's files prove, one contract for `ship` and the Field Kit (4.1.19, plan §6.5): four functions that
// compose, of which only the last asks GitHub anything.
//   1. readCandidateManifest: a candidate manifest's text read strictly (tools/release/candidate.mjs writes it);
//   2. digestProblems: files against the manifest's SHA-256 (integrity: they are the files it names);
//   3. verifyAttestation: a file's provenance attestation (authenticity: a workflow of this repository made it, in
//      which run), by `gh attestation verify`; offline with a downloaded attestation bundle and a trusted root saved
//      once (`gh attestation trusted-root > trusted-root.jsonl`), online otherwise;
//   4. queryRun: what GitHub says of a run now (its workflow, conclusion, event, branch).
// Integrity is not authenticity: (2) says a file is the one a manifest names, only (3) or (4) say who wrote the
// manifest.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { atLeast } from './candidate.mjs';

export const REPO = process.env.WEB_SCUMM_REPO ?? 'Quest-n-Click/quest-n-click';
export const CANDIDATE_WORKFLOW = `${REPO}/.github/workflows/candidate.yml`;
/**
 * The repository's name before 4.2.5 (D47): a release or a candidate made before the rename is attested by a workflow
 * of wanoo/web-scumm, and its signing certificate keeps saying so. Verifying one of them asks for that identity.
 */
export const FORMER_REPO = 'wanoo/web-scumm';
/** The first release attested under the repository's new name. */
export const RENAMED = '4.2.5';
/**
 * The repository before its transfer to the Quest-n-Click organization (4.5.2, D51): from 4.2.5 to 4.5.1 a workflow of
 * wanoo/quest-n-click attested the files, and GitHub keeps those attestations under the user wanoo, not under the
 * repository it moved: `--repo Quest-n-Click/quest-n-click` finds none of them.
 */
export const PRE_TRANSFER_REPO = 'wanoo/quest-n-click';
/** The first release attested by the repository in the organization. */
export const TRANSFERRED = '4.5.2';
/**
 * The repository's numeric id (D51): wanoo/web-scumm, wanoo/quest-n-click and Quest-n-Click/quest-n-click are one
 * repository, renamed then transferred, and every certificate they signed names it as `sourceRepositoryIdentifier`.
 * A repository created again under a former name would have another id: an attestation is accepted only when it names
 * this one. A fork sets WEB_SCUMM_REPO and, to keep the check, its own WEB_SCUMM_REPO_ID; with WEB_SCUMM_REPO alone the
 * id is not checked (`PINNED_ID` null), the name and the workflow still are.
 */
export const REPO_ID = process.env.WEB_SCUMM_REPO_ID ?? '1402166796';
export const PINNED_ID = process.env.WEB_SCUMM_REPO && !process.env.WEB_SCUMM_REPO_ID ? null : REPO_ID;

/**
 * Why `gh attestation verify --format json`'s output does not stand for the repository `id`; null when every
 * attestation it returns names it (`verificationResult.signature.certificate.sourceRepositoryIdentifier`). No id to
 * pin (a fork without its own): null.
 */
export function repoIdProblem(json, id = PINNED_ID) {
  if (id === null) return null;
  let list;
  try {
    list = JSON.parse(json);
  } catch {
    return 'the verification output is not JSON';
  }
  if (!Array.isArray(list) || list.length === 0) return 'the verification returned no attestation';
  for (const a of list) {
    const got = a?.verificationResult?.signature?.certificate?.sourceRepositoryIdentifier;
    if (got === undefined || got === null || got === '') return `an attestation names no repository id (want ${id})`;
    if (String(got) !== String(id)) return `an attestation names repository id ${got}, not ${id}`;
  }
  return null;
}

/** The identities attested before the transfer, the most recent first: their attestations live under their owner. */
export const PRE_TRANSFER = [PRE_TRANSFER_REPO, FORMER_REPO];
/**
 * The repository whose workflow attested the files of a release of `version` (its identity): wanoo/web-scumm up to
 * 4.2.4, wanoo/quest-n-click from 4.2.5 to 4.5.1, the repository (Quest-n-Click/quest-n-click) from 4.5.2.
 */
export const repoOfRelease = (version) => {
  if (process.env.WEB_SCUMM_REPO) return process.env.WEB_SCUMM_REPO;
  const v = String(version).replace(/^v/, '');
  return atLeast(v, TRANSFERRED) ? REPO : atLeast(v, RENAMED) ? PRE_TRANSFER_REPO : FORMER_REPO;
};
const preTransfer = (identity) => PRE_TRANSFER.some((r) => r.toLowerCase() === String(identity).toLowerCase());

/**
 * Where `gh attestation verify` looks an identity's attestations up, and how it pins the signer. The repository's own
 * (or a fork's): `--repo <identity>`, with `--signer-workflow` when one is asked. A pre-transfer identity: `--owner`
 * its owner (where GitHub keeps them), the identity pinned by `--signer-workflow <identity>/.github/workflows/<wf>`
 * or, when no workflow is asked, `--signer-repo <identity>`: an owner alone would accept any of its repositories.
 */
export function lookupArgs(identity, signerWorkflow) {
  if (!preTransfer(identity))
    return ['--repo', identity, ...(signerWorkflow ? ['--signer-workflow', signerWorkflow] : [])];
  if (signerWorkflow && !signerWorkflow.toLowerCase().startsWith(`${identity.toLowerCase()}/`))
    throw new Error(`${signerWorkflow}: not a workflow of ${identity}`);
  return [
    '--owner',
    identity.split('/')[0],
    ...(signerWorkflow ? ['--signer-workflow', signerWorkflow] : ['--signer-repo', identity]),
  ];
}

/** Where `gh attestation download` finds an identity's attestations: `--repo`, or `--owner` before the transfer. */
export const downloadArgs = (identity) =>
  preTransfer(identity) ? ['--owner', identity.split('/')[0]] : ['--repo', identity];

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** A candidate manifest, read strictly; throws saying why it is not one. */
export function readCandidateManifest(text) {
  let m;
  try {
    m = JSON.parse(text);
  } catch {
    throw new Error('the candidate manifest is not JSON');
  }
  if (
    m?.format !== 'web-scumm-candidate' ||
    m.schema !== 1 ||
    !/^[0-9a-f]{40}$/.test(m.sha ?? '') ||
    !/^\d+$/.test(m.candidateRunId ?? '') ||
    !Array.isArray(m.artifacts) ||
    !m.artifacts.every((a) => typeof a?.name === 'string' && /^[0-9a-f]{64}$/.test(a?.sha256 ?? ''))
  )
    throw new Error('not a candidate manifest of schema 1');
  return m;
}

/**
 * What is wrong with files against a manifest; [] when nothing is. `files`: name → bytes (or their SHA-256). Every file
 * given must be named, with its digest; `all` asks for every named file too.
 */
export function digestProblems(manifest, files, { all = false } = {}) {
  const want = new Map(manifest.artifacts.map((a) => [a.name, a.sha256]));
  const bad = [];
  for (const [name, bytes] of files) {
    const d = typeof bytes === 'string' ? bytes : sha256(bytes);
    if (!want.has(name)) bad.push(`${name}: not in the manifest`);
    else if (want.get(name) !== d) bad.push(`${name}: its SHA-256 differs from the manifest's`);
  }
  if (all) for (const name of want.keys()) if (!files.has(name)) bad.push(`${name}: missing`);
  return bad;
}

/** The run id a provenance statement names (its `invocationId`, …/actions/runs/<id>/attempts/<n>), or null. */
export const runOfStatement = (json) => /\/actions\/runs\/(\d+)(?:\/attempts\/\d+)?"/.exec(json)?.[1] ?? null;

/**
 * A file's provenance attestation, verified by the GitHub CLI: `bundle` and `trustedRoot` given, nothing is fetched
 * (offline); else the attestation is looked up on GitHub (`lookupArgs`: under the owner for an identity attested
 * before the transfer). `signerWorkflow` asks for the workflow that signed it, `sourceRef` for the branch it ran on.
 * `former`: a file whose version is not known (a field bundle's candidate) may also be attested by the repository
 * before its transfer (PRE_TRANSFER_REPO, 4.2.5 to 4.5.1) or under its former name (FORMER_REPO, before 4.2.5), tried
 * in that order after the repository, and nothing else.
 * Returns the run id the attestation names; throws when it does not verify.
 */
export function verifyAttestation(file, options = {}) {
  const { repo = REPO, signerWorkflow, former = false } = options;
  try {
    return verifyOnce(file, options);
  } catch (e) {
    if (!former) throw e;
    let last = e;
    for (const identity of PRE_TRANSFER) {
      if (identity.toLowerCase() === repo.toLowerCase()) continue;
      const old = signerWorkflow?.replace(`${repo}/`, `${identity}/`);
      try {
        return verifyOnce(file, { ...options, repo: identity, signerWorkflow: old });
      } catch (err) {
        last = err;
      }
    }
    throw last;
  }
}

function verifyOnce(file, { repo = REPO, bundle, trustedRoot, signerWorkflow, sourceRef, gh = 'gh', timeoutMs } = {}) {
  const args = ['attestation', 'verify', file, ...lookupArgs(repo, signerWorkflow), '--format', 'json'];
  if (bundle) args.push('--bundle', bundle);
  if (trustedRoot) args.push('--custom-trusted-root', trustedRoot);
  if (sourceRef) args.push('--source-ref', sourceRef);
  let out;
  try {
    out = execFileSync(gh, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1 << 26,
      ...(timeoutMs ? { timeout: timeoutMs } : {}),
    });
  } catch (e) {
    const why = String(e.stderr || e.message)
      .trim()
      .split('\n')
      .slice(-2)
      .join(' ');
    throw new Error(`${file}: its attestation does not verify (${why})`);
  }
  // The name and the workflow verified, the repository itself: the id every certificate names (D51).
  const wrong = repoIdProblem(out);
  if (wrong) throw new Error(`${file}: its attestation does not verify (${wrong})`);
  return { runId: runOfStatement(out) };
}

/**
 * What GitHub says of a run now. Its `headSha` is not the SHA a candidate tested: a run started by hand on main has
 * main's tip there, and the SHA it tested is its `inputs.sha`, written into the manifest. The manifest's attestation (or
 * the manifest the run keeps) binds that SHA to the run; comparing `headSha` would refuse every candidate of an older
 * commit (second reading of 4.1.19 PR 2b, plan §6.5 said to compare it).
 */
export function queryRun(runId, { gh = 'gh', repo = REPO, timeoutMs } = {}) {
  if (!/^\d+$/.test(String(runId ?? ''))) throw new Error(`not a run id: ${runId}`);
  const out = execFileSync(
    gh,
    ['run', 'view', String(runId), '--repo', repo, '--json', 'workflowName,status,conclusion,event,headBranch,headSha'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...(timeoutMs ? { timeout: timeoutMs } : {}) },
  );
  return JSON.parse(out);
}

/** Why a run is not a candidate a tag (or a pass) may stand on; null when it is one. */
export function candidateRunProblem(r, runId) {
  if (r.workflowName !== 'candidate') return `run ${runId} is a ${r.workflowName} run, not a candidate run`;
  // A pull request's run (full-ci) or a run started from another branch judges that branch's copy of candidate.yml.
  if (r.event !== 'workflow_dispatch' || r.headBranch !== 'main')
    return `candidate run ${runId} is a ${r.event} run on ${r.headBranch}: a tag names one started by hand on main`;
  if (r.status !== 'completed' || r.conclusion !== 'success')
    return `candidate run ${runId}: ${r.status} ${r.conclusion ?? ''}; a tag stands on a green candidate`;
  return null;
}
