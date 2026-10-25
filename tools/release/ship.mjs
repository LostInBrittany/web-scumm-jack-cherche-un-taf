#!/usr/bin/env node
// npm run ship -- <command> …: the release chain as commands (4.1.8), the logic the 4.1.2 → 4.1.7 releases were run
// with, kept in the repository instead of a session's scratchpad. Each command is idempotent and says what it waits for.
//
//   ship checks <pr>             wait for the pull request's checks; re-run a failed job once; exit 1 if it fails again
//   ship merge <pr>              `checks`, then merge (merge commit, the only method the ruleset allows); prints the SHA
//   ship main <sha>              wait for the `ci` run of main on that SHA to be green (re-run once)
//   ship tag <version> <sha>     the previous stable tag an ancestor of the SHA (4.1.16), `main`, then an annotated tag v<version> on the SHA, pushed; then `watch`
//                                (main's green ci on the SHA is what release.yml checks since 4.5.3, #291: the tag runs
//                                no ci of its own, and 4.1.10's `--now` is refused)
//                                `--candidate=<run id>` (4.1.17, required from 4.1.17 on): the `candidate` run that tested
//                                this SHA, green, its manifest naming this SHA and this run; the tag's annotation names it
//                                and release.yml publishes that run's files (tools/release/candidate.mjs)
//   ship watch <version>         wait for the `release` run of the tag's push; exit by its conclusion
//   ship verify <version>        download the release, check the SHA-256 sums and every provenance attestation; from 4.1.20
//                                also `gh release verify` and `gh release verify-asset` of each file (immutable releases)
//   ship preflight-stable --candidate=<run id> [--version=<x.y.z>]
//                                (4.1.20) what 4.2 stable still needs, check by check (tools/release/preflight.mjs):
//                                signing key, allowed_signers, immutability, the tag ruleset, the candidate, npm per
//                                package, the publishing pins, GO / NO-GO; signs, publishes and changes nothing
//   ship tag … --sign [--key=<file>] (4.1.20) the tag signed with an SSH key (`git tag -s`); inactive for 4.1.x (D30)
//   ship chain <pr> <version>    merge → tag → watch → verify; refused from 4.1.17, whose tags
//                                need a candidate run of the merge commit (merge, candidate, then tag)
//
// A pre-release version (`4.1.8-rc.1`) is tagged the same way; release.yml marks it a pre-release on GitHub.
// Every command writes its PID to `.cache/pids/ship-<command>.pid` (`SHIP_PIDS` to choose the folder): stop that
// PID, not a pattern.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { checkAncestry } from './ancestry.mjs';
import { FIRST as FIRST_LISTED, projectOf, publishedProblems } from './artifacts.mjs';
import { atLeast } from './candidate.mjs';
import { preflight } from './preflight.mjs';
import { isSignedTag, tagArgs } from './signing.mjs';
import { candidateOf, requiresCandidate, tagMessage } from './candidate.mjs';
import {
  candidateRunProblem,
  queryRun,
  readCandidateManifest,
  repoOfRelease,
  TRANSFERRED,
  verifyAttestation,
} from './provenance.mjs';
import {
  gh,
  ghJson,
  git,
  isPrerelease,
  localCommit,
  originTagCommit,
  releaseRemote,
  REPO,
  run,
  runIdOf,
  say,
  spawn,
  until,
  versionOf,
  warn,
  writePid,
} from './lib.mjs';

const [command, ...rest] = process.argv.slice(2).filter((a) => !a.startsWith('--')); // flags are read from argv

const RERUN_ONCE = new Set();
/** The check that judges every job of ci.yml (4.1.9 lot 0): a pull request is green when it is. */
const GATE = 'pr-gate';
/** Re-runs the failed jobs of a run once; false when it was already re-run (the second failure is final). */
function rerunOnce(runId, why) {
  if (RERUN_ONCE.has(runId)) return false;
  // A job failed while its run still goes on (other jobs pending): GitHub re-runs nothing until the run is over.
  // Wait for it (the caller polls again), re-run once it is complete.
  const run = ghJson(['run', 'view', String(runId), '--json', 'status']);
  if (run.status !== 'completed') {
    say(`${why}: run ${runId} still has jobs running; re-run once it is over`);
    return true;
  }
  RERUN_ONCE.add(runId);
  say(`${why}: re-running the failed jobs of run ${runId} once`);
  gh(['run', 'rerun', String(runId), '--failed']);
  return true;
}

/** `gh pr checks --json`: every check's state. Exit 8 means pending, 1 a failing check; 1 with nothing on stdout is an error. */
function prChecks(pr) {
  const r = spawn('gh', ['pr', 'checks', String(pr), '--json', 'name,state,bucket,link,workflow', '-R', REPO]);
  // Right after a push GitHub has no check yet: gh says so on stderr with exit 1 and nothing on stdout. That is
  // "not started", not an error; any other exit 1 without output is one (a wrong number, no auth).
  if (r.status === 1 && !r.stdout && /no checks reported/i.test(r.stderr)) return [];
  if (![0, 1, 8].includes(r.status) || (r.status === 1 && !r.stdout))
    throw new Error(`gh pr checks ${pr} → ${r.status}: ${r.stderr || 'no output'}`);
  return JSON.parse(r.stdout || '[]');
}

async function checks(pr) {
  // A pull request that conflicts with main gets no `pull_request` run at all (GitHub makes no merge ref): waiting for
  // its checks would never end. Seen on #31.
  const st = ghJson(['pr', 'view', String(pr), '--json', 'mergeable,mergeStateStatus']);
  if (st.mergeable === 'CONFLICTING')
    throw new Error(
      `#${pr} conflicts with main (${st.mergeStateStatus}): no CI runs on it; merge main into the branch, push, run again`,
    );
  say(`waiting for the checks of #${pr}`);
  return until(
    () => {
      const list = prChecks(pr);
      // Right after a push GitHub lists no check at all for a moment: that is "not started", not "all pass".
      if (list.length === 0) {
        say('no check listed yet');
        return undefined;
      }
      const pending = list.filter((c) => c.bucket === 'pending');
      const failed = list.filter((c) => c.bucket === 'fail' || c.bucket === 'cancel');
      if (failed.length) {
        const runs = [...new Set(failed.map((c) => runIdOf(c.link)).filter(Boolean))];
        const retried = runs.map((id) => rerunOnce(id, `${failed.map((c) => c.name).join(', ')} ${failed[0].bucket}`));
        if (retried.some(Boolean)) return undefined;
        throw new Error(`checks failed again on #${pr}: ${failed.map((c) => `${c.name} (${c.link})`).join(', ')}`);
      }
      if (pending.length) {
        say(`${list.length - pending.length}/${list.length} done, pending: ${pending.map((c) => c.name).join(', ')}`);
        return undefined;
      }
      // 4.1.17: the jobs of the second tier are created only once `check` is done, so a list where every check passed
      // can still be partial (seen on #67: 8 of 32). The terminal gate is the one the ruleset requires: wait for it.
      if (!list.some((c) => c.name === GATE)) {
        say(`${list.length} checks pass, ${GATE} not listed yet`);
        return undefined;
      }
      say(`all ${list.length} checks pass on #${pr}`);
      return list;
    },
    // The mutation job alone runs for an hour or two when the sets' inputs changed (4.1.8): four hours, not ninety minutes.
    { what: `the checks of #${pr}`, deadlineMs: 240 * 60_000 },
  );
}

async function merge(pr) {
  const view = ghJson(['pr', 'view', String(pr), '--json', 'number,title,headRefName,state,mergeCommit,isDraft']);
  if (view.state === 'MERGED') {
    say(`#${pr} is already merged at ${view.mergeCommit.oid}`);
    console.log(view.mergeCommit.oid);
    return view.mergeCommit.oid;
  }
  if (view.isDraft) throw new Error(`#${pr} is a draft`);
  await checks(pr);
  const subject = `Merge ${view.headRefName}: ${view.title}`;
  const trailers = ['Agent: Claude', process.env.SHIP_TRAILERS ?? ''].filter(Boolean).join('\n');
  say(`merging #${pr} (${view.headRefName})`);
  // Right after another merge into main, GitHub recomputes mergeability and `gh pr merge` fails for a moment
  // (seen on #24, merged seconds after #22): asked again while the state is UNKNOWN, up to ten times.
  await until(
    () => {
      const st = ghJson(['pr', 'view', String(pr), '--json', 'mergeStateStatus,state,mergeable']);
      if (st.state === 'MERGED') return true;
      // A branch behind main with a conflict will not merge however long we wait (seen on #23): say it at once.
      if (st.mergeable === 'CONFLICTING' || st.mergeStateStatus === 'DIRTY')
        throw new Error(
          `#${pr} conflicts with main (${st.mergeStateStatus}): merge main into the branch, push, run again`,
        );
      if (st.mergeStateStatus === 'UNKNOWN') {
        say('mergeability being recomputed: asking again');
        return undefined;
      }
      try {
        gh(['pr', 'merge', String(pr), '--merge', '--subject', subject, '--body', trailers]);
        return true;
      } catch (e) {
        if (/UNKNOWN|not mergeable|Base branch was modified/i.test(String(e))) return undefined;
        throw e;
      }
    },
    { everyMs: 15_000, deadlineMs: 5 * 60_000, what: `the merge command of #${pr}` },
  );
  const after = await until(
    () => {
      const v = ghJson(['pr', 'view', String(pr), '--json', 'state,mergeCommit']);
      return v.state === 'MERGED' && v.mergeCommit?.oid ? v.mergeCommit.oid : undefined;
    },
    { everyMs: 10_000, deadlineMs: 5 * 60_000, what: `the merge of #${pr}` },
  );
  say(`merged: ${after}`);
  console.log(after);
  return after;
}

/** The `ci` run on a SHA with a given event/branch, as soon as GitHub lists it. */
const findRun = (workflow, sha, branch) =>
  ghJson([
    'run',
    'list',
    '--workflow',
    workflow,
    ...(branch ? ['--branch', branch] : []),
    '--limit',
    '40',
    '--json',
    'databaseId,headSha,status,conclusion,event,headBranch',
  ]).find((r) => r.headSha === sha);

async function waitRun(workflow, sha, branch, what) {
  say(`waiting for the ${workflow} run of ${sha.slice(0, 7)}${branch ? ` on ${branch}` : ''}`);
  return until(
    () => {
      const r = findRun(workflow, sha, branch);
      if (!r) return undefined;
      if (r.status !== 'completed') return undefined;
      if (r.conclusion === 'success') {
        say(`${workflow} run ${r.databaseId}: success`);
        return r;
      }
      if (r.conclusion === 'skipped') return r; // release.yml skips for a main push: the caller decides
      if (
        ['failure', 'cancelled', 'timed_out'].includes(r.conclusion) &&
        rerunOnce(r.databaseId, `${workflow} ${r.conclusion}`)
      )
        return undefined;
      throw new Error(
        `${workflow} run ${r.databaseId} on ${sha.slice(0, 7)}: ${r.conclusion} (https://github.com/${REPO}/actions/runs/${r.databaseId})`,
      );
    },
    { what },
  );
}

async function main(sha) {
  const r = await waitRun('ci', sha, 'main', `ci on main for ${sha.slice(0, 7)}`);
  if (r.conclusion !== 'success') throw new Error(`ci on main for ${sha.slice(0, 7)}: ${r.conclusion}`);
  return r;
}

/**
 * The candidate run a tag stands on (4.1.17): a `candidate` run, completed and green, whose manifest names this very
 * SHA and this very run. Several runs may exist for one SHA; the one named is the one checked.
 */
function verifyCandidate(runId, full) {
  if (!/^\d+$/.test(runId ?? '')) throw new Error(`--candidate=<run id> is required: ${runId ?? 'none given'}`);
  // tools/release/provenance.mjs (4.1.19): the same contract the Field Kit's bundles are verified with.
  const why = candidateRunProblem(queryRun(runId), runId);
  if (why) throw new Error(why);
  const dir = join('.cache', 'candidate', runId);
  rmSync(dir, { recursive: true, force: true }); // `gh run download` never overwrites a file a previous attempt left
  mkdirSync(dir, { recursive: true });
  gh(['run', 'download', runId, '-n', 'candidate-manifest', '-D', dir]);
  const m = readCandidateManifest(readFileSync(join(dir, 'candidate-manifest.json'), 'utf8'));
  if (m.sha !== full) throw new Error(`candidate run ${runId} tested ${m.sha}, not ${full}`);
  if (m.candidateRunId !== runId) throw new Error(`the manifest of run ${runId} names run ${m.candidateRunId}`);
  say(`candidate run ${runId}: green on ${full.slice(0, 12)}, ${m.artifacts.length} files in its manifest`);
}

const candidateFlag = () => process.argv.find((a) => a.startsWith('--candidate='))?.slice('--candidate='.length);

async function tag(versionArg, sha) {
  const version = versionOf(versionArg);
  const name = `v${version}`;
  const candidate = candidateFlag();
  // `--now` (4.1.10) tagged without waiting for main's run, the tag's own ci being the gate: that run is gone (4.5.3,
  // #291) and release.yml requires main's ci green on the SHA, so it is refused before anything is done.
  if (process.argv.includes('--now'))
    throw new Error(
      `--now is gone (4.5.3, #291): release.yml requires main's ci green on the SHA, ship tag waits for it`,
    );
  // The organisation's repository, whatever its remote is called here (`upstream` when `origin` is a fork, 4.5.3).
  const remote = releaseRemote();
  git(['fetch', '--quiet', remote]); // the merge commit `chain` just made is on the remote, not here yet (seen on 4.1.9, 4.1.10)
  const full = localCommit(sha);
  if (!full) throw new Error(`${sha}: not a commit on ${remote} either`);
  const onOrigin = originTagCommit(name, remote);
  if (onOrigin) {
    if (onOrigin !== full)
      throw new Error(
        `${name} exists on origin at ${onOrigin.slice(0, 7)}, not ${full.slice(0, 7)}: a tag is never moved`,
      );
    say(`${name} already on origin at ${full.slice(0, 7)}`);
  } else {
    git(['fetch', '--quiet', '--tags', remote]);
    // release.yml's notes are the CHANGELOG section of the version, on the tagged commit: without it the release run
    // fails after the tag exists, and the tag is spent (v4.5.3-rc.1). Checked here, before anything is tagged.
    // Loaded here, not at the top: tools/ ships in the package, scripts/ does not, and only the repository tags.
    const { releaseNotes } = await import('../../scripts/release-notes.mjs');
    const changelog = git(['show', `${full}:CHANGELOG.md`], { ok: [0, 128] });
    if (!releaseNotes(changelog, name))
      throw new Error(
        `${name}: no "## ${version.replace(/-.*$/, '')}" section in CHANGELOG.md at ${full.slice(0, 7)}: merge the release pull request first, then tag its merge commit`,
      );
    const line = checkAncestry(version, full);
    if (!line.ok)
      throw new Error(`${name} on ${full.slice(0, 7)}: ${line.reason} (merge that tag into the branch first, 4.1.16)`);
    say(`${name}: ${line.reason}`);
    if (requiresCandidate(version) || candidate) verifyCandidate(candidate, full);
    // From 4.1.20 a release is published only immutable (second reading of 4.1.20 PR 3b): `ship verify` asks GitHub
    // for its release attestation, which only an immutable release has. Checked here, with the maintainer's access
    // (release.yml's token cannot read the setting), before the tag exists: never a release published unverifiable.
    if (atLeast(version, FIRST_LISTED)) {
      // The setting off answers a 404 (gh exits 1): read as off, so the reason below is the one said (second reading
      // of #122); an answer that is not JSON (auth, network) is said as unreadable.
      const out = run('gh', ['api', `repos/${REPO}/immutable-releases`], { ok: [0, 1] });
      let imm;
      try {
        imm = JSON.parse(out || '{}');
      } catch {
        throw new Error(`immutable releases on ${REPO}: unreadable (${out.split('\n')[0]}): ${name} is not tagged`);
      }
      if (imm.enabled !== true)
        throw new Error(
          `immutable releases are off on ${REPO} (Settings → General → Releases): ${name} is not tagged (https://github.com/Quest-n-Click/quest-n-click/wiki/EN-Contribute-Releasing)`,
        );
      say(`${REPO}: immutable releases on`);
    }
    // Main's green ci on this SHA is the gate release.yml checks (4.5.3, #291): the tag runs no ci of its own, so the
    // tag waits for main's run, always.
    await main(full);
    const local = localCommit(name);
    if (local && local !== full)
      throw new Error(
        `${name} exists here at ${local.slice(0, 7)}, not ${full.slice(0, 7)}: delete it by hand if it was never published`,
      );
    if (local) {
      // A tag left here by a failed push must name the candidate just verified, or it would publish another run.
      const named = candidateOf(git(['for-each-ref', '--format=%(contents)', `refs/tags/${name}`]));
      if ((candidate ?? null) !== named)
        throw new Error(
          `${name} here names candidate ${named ?? 'none'}, not ${candidate ?? 'none'}: delete it by hand`,
        );
      // `--sign` asked for a signed tag: a tag left here unsigned is never pushed in its place (second reading of #122).
      if (process.argv.includes('--sign') && !isSignedTag(git(['cat-file', 'tag', name])))
        throw new Error(`${name} here is not signed, and --sign asks for a signed tag: delete it by hand`);
      say(`${name} already here at ${full.slice(0, 7)} (a push that failed before): pushing it`);
    } else {
      say(`tagging ${name} on ${full.slice(0, 7)}${isPrerelease(version) ? ' (pre-release)' : ''}`);
      // Annotated, or signed with the maintainer's SSH key (`--sign`, 4.1.20 PR 3b): 4.1.x tags stay annotated (D30).
      const sign = process.argv.includes('--sign');
      if (sign && !atLeast(version, '4.2.0')) throw new Error(`--sign is 4.2's: ${name} stays an annotated tag (D30)`);
      const key = process.argv.find((a) => a.startsWith('--key='))?.slice('--key='.length);
      git(tagArgs({ name, sha: full, message: candidate ? tagMessage(version, candidate) : version, sign, key }));
    }
    git(['push', remote, `refs/tags/${name}`]);
  }
  return watch(version);
}

async function watch(versionArg) {
  const version = versionOf(versionArg);
  const name = `v${version}`;
  const sha = localCommit(name) ?? originTagCommit(name);
  if (!sha) throw new Error(`${name}: not a tag here nor on origin`);
  // No ci run of the tag to wait for since 4.5.3 (#291): release.yml starts on the tag's push and checks main's.
  const rel = await until(
    () => {
      const r = ghJson([
        'run',
        'list',
        '--workflow',
        'release',
        '--limit',
        '40',
        '--json',
        'databaseId,headSha,status,conclusion,headBranch',
        // The SHA is the key (up to 4.5.2 a `workflow_run` run reported `main` as its branch, not the tag); a
        // `skipped` run is never the tag's.
      ]).find((x) => x.headSha === sha && x.conclusion !== 'skipped');
      if (!r || r.status !== 'completed') return undefined;
      return r;
    },
    { what: `the release run of ${name}`, deadlineMs: 120 * 60_000 },
  );
  if (rel.conclusion !== 'success')
    throw new Error(
      `release run ${rel.databaseId} of ${name}: ${rel.conclusion} (https://github.com/${REPO}/actions/runs/${rel.databaseId})`,
    );
  say(`release ${name} published by run ${rel.databaseId}`);
  return verify(version);
}

/** The first release that carries its documentation archive. */
const DOCS_SINCE = '4.5.0';
/** The first release that carries the website's demo, `<proj>-<tag>-web.tar.gz` (D52); 4.5.1 and before verify without it. */
const WEB_SINCE = '4.5.2';

async function verify(versionArg) {
  const version = versionOf(versionArg);
  const name = `v${version}`;
  const dir = join('.cache', 'release', name);
  mkdirSync(dir, { recursive: true });
  say(`downloading ${name} into ${dir}`);
  // Right after an upload the release's asset list may lag: asked again for up to three minutes.
  const files = await until(
    () => {
      try {
        gh(['release', 'download', name, '-D', dir, '--clobber']);
      } catch (e) {
        say(`download not yet complete: ${String(e).split('\n')[0]}`);
        return undefined;
      }
      const got = readdirSync(dir);
      return got.some((f) => f.endsWith('-SHA256SUMS')) ? got : undefined;
    },
    { everyMs: 15_000, deadlineMs: 3 * 60_000, what: `the files of ${name}` },
  );
  const sums = files.find((f) => f.endsWith('-SHA256SUMS'));
  if (!sums) throw new Error(`${name}: no SHA256SUMS among ${files.join(', ')}`);
  // The sums file lists bare names: checked from inside the download folder.
  const check = run('shasum', ['-a', '256', '-c', sums], { ok: [0, 1], cwd: dir });
  console.log(
    check
      .split('\n')
      .map((l) => `   ${l}`)
      .join('\n'),
  );
  if (/FAILED/.test(check)) throw new Error(`${name}: a checksum failed`);
  let attested = 0;
  for (const f of files) {
    // A release is verified under the identity that attested it: wanoo/web-scumm up to 4.2.4 (D47), wanoo/quest-n-click
    // up to 4.5.1, looked up under the user wanoo, the organization's repository from 4.5.2 (D51).
    verifyAttestation(join(dir, f), { repo: repoOfRelease(version) });
    attested++;
  }
  // GitHub's own release attestation (4.1.20 PR 3b, immutable releases): the release, then each of its files. One made
  // before the transfer (up to 4.5.1, D51) is kept under the user wanoo, and `gh release verify` looks only under the
  // repository, which has none: said and skipped, the files' provenance attestations above being verified under wanoo.
  const preTransfer = atLeast(version, FIRST_LISTED) && !atLeast(version, TRANSFERRED);
  if (preTransfer)
    warn(
      `${name}: GitHub's release attestation was made before the transfer (kept under wanoo, out of gh release verify's reach): not checked`,
    );
  else if (atLeast(version, FIRST_LISTED)) {
    gh(['release', 'verify', name]);
    for (const f of files) gh(['release', 'verify-asset', name, join(dir, f)]);
    say(`${name}: gh release verify and verify-asset passed for ${files.length} files`);
  }
  // The release's files, exactly the one manifest's (4.1.20, plan §8.4): none forgotten, none extra.
  const listed = publishedProblems(name, files, dir);
  if (listed.length)
    throw new Error(`${name}: not the files tools/release/artifacts.mjs lists:\n  ${listed.join('\n  ')}`);
  say(
    `${name}: ${files.length} files, sums ok, ${attested} attestations verified, as the manifest lists them${preTransfer ? "; GitHub's release attestation not checked (pre-transfer)" : ''}`,
  );
  // The tarballs carry package.json's version, never a tag's pre-release suffix (v4.1.8-rc.1 ships web-scumm-4.1.8.tgz;
  // from 4.2.5, quest-n-click-4.2.5.tgz).
  const packed = version.replace(/-.*$/, '');
  const engine = `${projectOf(version)}-${packed}.tgz`;
  if (!existsSync(join(dir, engine))) throw new Error(`${name}: ${engine} missing`);
  // The documentation archive (4.5.0, docs/dev/PLAN-4.5-WIKI.md §4.5.4): summed, attested and listed above like every
  // file; named here because docs-publish promotes it once this verification passed.
  const docs = `quest-n-click-docs-${version}.tar.gz`;
  if (atLeast(version, DOCS_SINCE) && !existsSync(join(dir, docs))) throw new Error(`${name}: ${docs} missing`);
  // The website's demo (4.5.2, D52): the game and the Studio demo under /demo/, summed and attested above; the website
  // downloads it from the latest release.
  const web = `${projectOf(version)}-${name}-web.tar.gz`;
  if (atLeast(version, WEB_SINCE) && !existsSync(join(dir, web))) throw new Error(`${name}: ${web} missing`);
  return { files, attested };
}

async function chain(pr, version) {
  versionOf(version); // refused before anything is merged
  // From 4.1.17 a tag stands on a candidate run of the merge commit, which cannot exist before the merge.
  if (requiresCandidate(version))
    throw new Error(
      `${version} needs a candidate of the merge commit: ship merge ${pr}, run the candidate on it, then ship tag`,
    );
  const sha = await merge(pr);
  return tag(version, sha);
}

/** What 4.2 stable still needs (4.1.20 PR 3b): every check said; exit 1 only on one `blocked`. */
async function preflightStable() {
  const runId = candidateFlag();
  if (!/^\d+$/.test(runId ?? '')) throw new Error('--candidate=<run id> is required');
  const version = process.argv.find((a) => a.startsWith('--version='))?.slice('--version='.length) ?? '4.2.0';
  const problems = [];
  // A run gh cannot read (a wrong id, the network) is a blocked row, not a crash (second reading of #122).
  try {
    const why = candidateRunProblem(queryRun(runId), runId);
    if (why) problems.push(why);
  } catch (e) {
    problems.push(`run ${runId}: ${String(e.message ?? e).split('\n')[0]}`);
  }
  const dir = join('.cache', 'preflight', runId);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let pack;
  try {
    gh(['run', 'download', runId, '-n', 'candidate-manifest', '-D', dir]);
    readCandidateManifest(readFileSync(join(dir, 'candidate-manifest.json'), 'utf8'));
    verifyAttestation(join(dir, 'candidate-manifest.json'), { repo: REPO });
    gh(['run', 'download', runId, '-n', 'candidate-pack', '-D', join(dir, 'pack')]);
    pack = join(dir, 'pack');
  } catch (e) {
    problems.push(String(e.message ?? e).split('\n')[0]);
  }
  // `gh api` takes no `-R` (lib's `gh` adds it): asked directly (second reading of PR 3b).
  const login = JSON.parse(run('gh', ['api', 'user'])).login;
  const exec = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' });
  const who = exec('npm', ['whoami']);
  const npmUser = who.status === 0 ? who.stdout.trim() : undefined;
  const rows = preflight({ exec, repo: REPO, login, npmUser, version, candidate: { run: runId, problems, pack } });
  for (const r of rows) console.log(`${r.state === 'ok' ? '✔' : r.state === 'missing' ? '·' : '✖'} ${r.id}: ${r.say}`);
  const blocked = rows.filter((r) => r.state === 'blocked').length;
  const missing = rows.filter((r) => r.state === 'missing').length;
  say(`preflight for ${version}: ${rows.length - blocked - missing} ok, ${missing} still to do, ${blocked} blocked`);
  if (blocked) throw new Error(`${blocked} check(s) blocked`);
}

const COMMANDS = { checks, merge, main, tag, watch, verify, chain, 'preflight-stable': preflightStable };
if (!command || !(command in COMMANDS)) {
  console.error(
    `usage: npm run ship -- <${Object.keys(COMMANDS).join('|')}> …  (see the header of tools/release/ship.mjs)`,
  );
  process.exit(2);
}
writePid(`ship-${command}`);
COMMANDS[command](...rest).then(
  () => process.exit(0),
  (e) => {
    console.error(`✖  ship ${command}: ${e.message}`);
    process.exit(1);
  },
);
