// Shared helpers of the release tooling (4.1.8): `gh` and `git` as functions, a PID file per long command (so an
// interrupted run is stopped by its own PID, never by a pattern), and a poll loop with a deadline.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The repository (renamed in 4.2.5, D47; moved to the Quest-n-Click organization in 4.5.2, D51; GitHub redirects the
// former addresses). WEB_SCUMM_REPO keeps its name: an environment variable a fork's maintainer may already set.
export const REPO = process.env.WEB_SCUMM_REPO ?? 'Quest-n-Click/quest-n-click';

/** Runs a command and returns its trimmed stdout; throws with stderr when it fails (unless `ok` lists the code). */
export function run(cmd, args, { ok = [0], input, cwd } = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', input, cwd, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (!ok.includes(r.status ?? -1)) throw new Error(`${cmd} ${args.join(' ')} → ${r.status}\n${r.stderr || r.stdout}`);
  return (r.stdout ?? '').trim();
}

/** `gh … -R <repo>` parsed as JSON (`--json` must be among the args). */
export const ghJson = (args, opts) => JSON.parse(run('gh', [...args, '-R', REPO], opts) || 'null');
export const gh = (args, opts) => run('gh', [...args, '-R', REPO], opts);
export const git = (args, opts) => run('git', args, opts);

/** Runs a command and returns `{ status, stdout, stderr }` without judging the exit code. */
export function spawn(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return { status: r.status ?? -1, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() };
}

/**
 * The commit a local ref points to, or null when the ref is unknown here. `git rev-parse X^{commit}` echoes `X^{commit}`
 * to stdout on an unknown ref (exit 128); `-q --verify` prints nothing and exits 1, which is what a fallback needs.
 */
export const localCommit = (ref) => git(['rev-parse', '-q', '--verify', `${ref}^{commit}`], { ok: [0, 1] }) || null;

/**
 * The git remote, among `git remote -v`'s lines, whose fetch URL is `repo` on GitHub (ssh or https, with or without
 * `.git`, any case): `origin` when it is one, else the first. Null when none is. A maintainer whose `origin` is a fork
 * (and `upstream` the organisation's repository) tags the organisation's all the same (4.5.3).
 */
export function remoteFor(repo, remotes) {
  const [owner, name] = repo.toLowerCase().split('/');
  const re = new RegExp(`github\\.com[:/]${owner}/${name}(?:\\.git)?/?$`);
  const hits = remotes
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .filter(([n, url, kind]) => n && url && kind === '(fetch)' && re.test(url.toLowerCase()))
    .map(([n]) => n);
  return hits.includes('origin') ? 'origin' : (hits[0] ?? null);
}

/** The remote of REPO here, or an error that says how to add one. */
export function releaseRemote() {
  const name = remoteFor(REPO, git(['remote', '-v']));
  if (!name)
    throw new Error(
      `no git remote here points to ${REPO} (git remote -v): add one, e.g. git remote add upstream git@github.com:${REPO}.git`,
    );
  return name;
}

/** The commit a tag points to on REPO's remote (peeled), or null when it has no such tag. */
export function originTagCommit(name, remote = releaseRemote()) {
  const lines = git(['ls-remote', '--tags', remote, `refs/tags/${name}`, `refs/tags/${name}^{}`])
    .split('\n')
    .filter(Boolean);
  if (!lines.length) return null;
  const peeled = lines.find((l) => l.endsWith('^{}'));
  return (peeled ?? lines[0]).split(/\s/)[0];
}

/** The PID of this command, written where `npm run ship` says (`SHIP_PIDS`, default `.cache/pids/`). */
export function writePid(name) {
  const dir = process.env.SHIP_PIDS ?? join('.cache', 'pids');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.pid`);
  writeFileSync(file, `${process.pid}\n`);
  return file;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The time, for the log lines. */
export const now = () => new Date().toISOString().slice(11, 19);
export const say = (s) => console.log(`${now()}  ${s}`);
/** A warning that must be seen: `⚠` on the terminal, and an annotation of the run in GitHub Actions. */
export const warn = (s) => {
  console.log(`${now()}  ⚠  ${s}`);
  if (process.env.GITHUB_ACTIONS === 'true') console.log(`::warning::${s}`);
};

/**
 * Polls `probe` every `everyMs` until it returns a value other than `undefined`, or the deadline passes (then throws).
 * `probe` may return a promise.
 */
export async function until(probe, { everyMs = 60_000, deadlineMs = 90 * 60_000, what = 'the condition' } = {}) {
  const end = Date.now() + deadlineMs;
  for (;;) {
    const v = await probe();
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error(`gave up waiting for ${what} after ${Math.round(deadlineMs / 60_000)} min`);
    await sleep(everyMs);
  }
}

/** The run id in a check's link (`…/actions/runs/<id>/job/<job>`), or null. */
export const runIdOf = (link) => link?.match(/\/actions\/runs\/(\d+)/)?.[1] ?? null;

/** `vX.Y.Z[-pre]` → `X.Y.Z[-pre]`; `X.Y.Z` → the same; anything else throws. */
export function versionOf(tagOrVersion) {
  const v = tagOrVersion.replace(/^v/, '');
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/.test(v))
    throw new Error(`not a SemVer version: ${tagOrVersion}`);
  return v;
}

/** Whether a version is a pre-release (`4.1.8-rc.1`). */
export const isPrerelease = (version) => version.includes('-');
