#!/usr/bin/env node
// node tools/release/main-ci.mjs <sha> (4.5.3, #291, D55): what stands in place of the tag's own `ci` run, which is
// gone. A release tag's commit must be on main's first-parent line (a merge into main, never a topic branch's commit
// tagged directly), and the `ci` workflow must have succeeded on a push of main at that very SHA. release.yml runs it
// before anything is downloaded or published; `ship tag` waits for that run before it pushes the tag.
//
//   node tools/release/main-ci.mjs <sha> [--main=<ref>] [--repo=<owner/name>]
//
// `--main` (default `refs/remotes/origin/main`) is the ref whose first-parent line is read; `--repo` (default
// GITHUB_REPOSITORY) the repository whose runs `gh api` lists. Exit 1 on a refusal, said on one line.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const FULL = /^[0-9a-f]{40}$/;

/** Why `sha` is not on the first-parent line of `main` in the repository at `cwd`; undefined when it is. */
export function firstParentProblem(sha, { main = 'refs/remotes/origin/main', cwd = process.cwd() } = {}) {
  if (!FULL.test(sha ?? '')) return `not a full SHA: ${sha}`;
  const r = spawnSync('git', ['rev-list', '--first-parent', main], { cwd, encoding: 'utf8', maxBuffer: 256 << 20 });
  if (r.status !== 0) return `git rev-list --first-parent ${main} failed: ${(r.stderr || '').trim()}`;
  if (r.stdout.split('\n').includes(sha)) return undefined;
  return `${sha.slice(0, 12)} is not on ${main.split('/').pop()}'s first-parent line: a release tag stands on a merge into main`;
}

/**
 * Why the `ci` runs listed for `sha` (the `workflow_runs` of `GET /repos/{repo}/actions/workflows/ci.yml/runs`) hold no
 * green run of a push of main at that SHA; undefined when one is. A run still going, failed, cancelled, of a pull
 * request, of another branch or of another commit is not one.
 */
export function mainCiProblem(runs, sha) {
  const ours = (runs ?? []).filter(
    (r) =>
      r?.head_sha === sha &&
      r.event === 'push' &&
      r.head_branch === 'main' &&
      (r.path ?? '.github/workflows/ci.yml') === '.github/workflows/ci.yml',
  );
  if (ours.some((r) => r.status === 'completed' && r.conclusion === 'success')) return undefined;
  const said = ours.map((r) => `run ${r.id}: ${r.status === 'completed' ? r.conclusion : r.status}`).join(', ');
  return `main's ci has not succeeded on ${sha.slice(0, 12)} (${said || 'no ci run of a push of main at this SHA'}): wait for it, then re-run this job`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const flag = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const [sha] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const repo = flag('repo') ?? process.env.GITHUB_REPOSITORY;
  if (!sha || !repo) {
    console.error('usage: node tools/release/main-ci.mjs <sha> [--main=<ref>] [--repo=<owner/name>]');
    process.exit(2);
  }
  const line = firstParentProblem(sha, { main: flag('main') });
  if (line) {
    console.log(`::error::${line}`);
    process.exit(1);
  }
  // Any error of gh (auth, network) stops here: never read as "no run", never as a success.
  const r = spawnSync(
    'gh',
    ['api', `repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&event=push&branch=main&per_page=100`],
    { encoding: 'utf8', maxBuffer: 64 << 20 },
  );
  if (r.status !== 0) {
    console.log(`::error::gh api (main's ci runs of ${sha.slice(0, 12)}): ${(r.stderr || '').trim().split('\n')[0]}`);
    process.exit(1);
  }
  let runs;
  try {
    runs = JSON.parse(r.stdout).workflow_runs;
  } catch {
    console.log(`::error::gh api (main's ci runs of ${sha.slice(0, 12)}): not JSON`);
    process.exit(1);
  }
  const why = mainCiProblem(runs, sha);
  if (why) {
    console.log(`::error::${why}`);
    process.exit(1);
  }
  console.log(`✔ ${sha.slice(0, 12)}: on main's first-parent line, main's ci green on it`);
}
