// The publication record and the wiki's push (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.5.1 to §4.5.4 and §4.5.7;
// ADR 0030). `publication.json` is the only place that says a documentation was published: which revision of each
// version is approved, with its archive's sha256, its release tag and its date, and which one is the latest; the
// archive never says it (§4.5.1). Its home is the wiki's repository (`publication.json` at its root, pushed with the
// pages), and Pages serves a copy at `/docs/publication.json`.
//
// `decide` is the ordering rule, pure: a state is compared SemVer first, then by its revision number, across versions
// as well as within one. A newer state moves `latest` and the wiki; the same state again changes nothing (a rerun);
// a fix to an older version records that version's revision for Pages and leaves `latest` and the wiki alone; a
// revision older than the one approved, or the same revision with other bytes, is refused; `--rollback-to
// <version>[-r<n>]` is the one way back. A pre-release never publishes the wiki nor `latest` (§4.5.2), and the
// bootstrap's preview (§4.5.3) is refused once a release is recorded.
//
// `pushWiki` clones the wiki's repository, replaces its content with the archive's `wiki/` folder (keeping `.git` and
// the generated redirect pages a later build no longer writes), writes the record, and pushes one commit, "wiki:
// <version> r<n> (<docRevision>)"; nothing changed, no commit. The push is one ref update: a failure leaves the last
// good state, and a rerun is a new dispatch.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { REVISION } from './archive';
import { compareVersions } from './docs';
import { formatJson } from './json';
import { SEMVER } from './page';

const PUBLICATION_FORMAT = 'quest-n-click-docs-publication';
/** The first line of a generated redirect page: kept in the wiki when a later build no longer writes it (§4.5.7). */
export const REDIRECT_MARKER = '<!-- quest-n-click: generated redirect page -->';
/** The build's own marker file (tools/wiki/build.ts): never pushed. */
const BUILD_MARKER = '.quest-n-click-wiki-build';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sha = z.string().regex(/^[0-9a-f]{64}$/);
const version = z.string().regex(SEMVER);
const revision = z.string().regex(REVISION);
/**
 * What the archive says it is, beside its sha256: the doc revision (a commit) and the build (the candidate run). A
 * page compares them with its own (tools/wiki/display.ts), so an rc's page, which says 4.5.0 r1 like the final's,
 * is never called the published one unless it is the same build.
 */
const built = { docRevision: z.string().min(1), buildId: z.string().min(1).optional() };
const PublicationSchema = z
  .object({
    format: z.literal(PUBLICATION_FORMAT),
    version: z.literal(1),
    latest: z
      .object({ version, revision, sha256: sha, date: day, ...built })
      .strict()
      .nullable(),
    versions: z.record(
      version,
      z
        .object({
          approved: revision,
          revisions: z.record(
            revision,
            z.object({ sha256: sha, tag: z.string().min(1), date: day, ...built }).strict(),
          ),
        })
        .strict(),
    ),
    /** The bootstrap's preview (§4.5.3), recorded until a release is: Pages serves it under `/docs/preview/`. */
    preview: z
      .object({ version, sha256: sha, tag: z.string().min(1), date: day, ...built })
      .strict()
      .optional(),
  })
  .strict();
export type Publication = z.infer<typeof PublicationSchema>;

export const emptyPublication = (): Publication => ({
  format: PUBLICATION_FORMAT,
  version: 1,
  latest: null,
  versions: {},
});

/** A record read and checked; a record of another format or major version is refused, plainly. */
export function parsePublication(text: string): Publication {
  const raw = JSON.parse(text) as { format?: unknown; version?: unknown };
  if (raw?.format !== PUBLICATION_FORMAT) throw new Error(`publication.json is not a ${PUBLICATION_FORMAT} file`);
  if (raw.version !== 1)
    throw new Error(`publication.json is format version ${String(raw.version)}; this tool reads version 1 only`);
  const r = PublicationSchema.safeParse(raw);
  if (!r.success)
    throw new Error(
      `publication.json does not read: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  for (const [v, entry] of Object.entries(r.data.versions))
    if (!entry.revisions[entry.approved])
      throw new Error(`publication.json: ${v} approves ${entry.approved}, not recorded`);
  return r.data;
}

const revisionNumber = (r: string) => Number(r.slice(1));
/** SemVer first, then the revision number (§4.5.2): negative when `a` is older than `b`. */
export function compareStates(
  a: { version: string; revision: string },
  b: { version: string; revision: string },
): number {
  return compareVersions(a.version, b.version) || revisionNumber(a.revision) - revisionNumber(b.revision);
}

export interface Promotion {
  version: string;
  revision: string;
  sha256: string;
  /** The release that carries the archive: `v<version>` for r1, `docs-v<version>-r<n>` for a fix. */
  tag: string;
  date: string;
  /** The archive's doc revision and build (its `bundle-manifest.json`). */
  docRevision: string;
  buildId?: string;
  /** The bootstrap's preview (§4.5.3), not a release. */
  preview?: boolean;
}

const builtOf = (p: Promotion) => ({ docRevision: p.docRevision, ...(p.buildId ? { buildId: p.buildId } : {}) });

/** The ways docs-publish writes, and the one ref each may run from (a dispatch from elsewhere is refused). */
export const MODES = ['release', 'revision', 'rollback', 'promote', 'preview'] as const;
export type Mode = (typeof MODES)[number];
/**
 * Why a mode may not write from this ref: a doc revision from `refs/heads/docs/<v>` only; a release from its own tag,
 * `refs/tags/v<v>` (release.yml runs on the tag's push since 4.5.3, #291; on main's `workflow_run` before); everything
 * else (a rollback, a promotion, the preview) from `refs/heads/main` only.
 */
export function refProblem(mode: Mode, ref: string, version: string): string | undefined {
  const want =
    mode === 'revision'
      ? `refs/heads/docs/${version}`
      : mode === 'release'
        ? `refs/tags/v${version}`
        : 'refs/heads/main';
  return ref === want ? undefined : `a ${mode} publishes from ${want}, not from ${ref}`;
}

export type Decision =
  | {
      ok: true;
      record: Publication;
      /** The wiki's pages are replaced: this state is the latest (or a rollback to it). */
      wiki: boolean;
      note: string;
    }
  | { ok: false; problem: string };

/** `<version>` or `<version>-r<n>`: what `--rollback-to` names. */
function parseRollback(s: string): { version: string; revision?: string } | undefined {
  const m = /^(.+?)(?:-(r[1-9]\d*))?$/.exec(s);
  if (!m || !SEMVER.test(m[1]!)) return undefined;
  return { version: m[1]!, ...(m[2] ? { revision: m[2] } : {}) };
}

/** The ordering rule (§4.5.2): what publishing `p` does to the record, or why it is refused. */
export function decide(record: Publication, p: Promotion, o: { rollbackTo?: string } = {}): Decision {
  if (!SEMVER.test(p.version)) return { ok: false, problem: `${p.version} is not a SemVer version` };
  if (!REVISION.test(p.revision)) return { ok: false, problem: `${p.revision} is not a revision (r1, r2…)` };
  if (!/^[0-9a-f]{64}$/.test(p.sha256)) return { ok: false, problem: `${p.sha256} is not a sha256` };
  if (p.version.includes('-'))
    return {
      ok: false,
      problem: `${p.version} is a pre-release: it never publishes the wiki nor latest, only /docs/${p.version}/ on Pages (§4.5.2)`,
    };
  const next = structuredClone(record);
  if (p.preview) {
    if (record.latest)
      return {
        ok: false,
        problem: `a preview is the bootstrap's one exception (§4.5.3): ${record.latest.version} ${record.latest.revision} is published`,
      };
    if (o.rollbackTo) return { ok: false, problem: '--rollback-to is for a published state, not a preview' };
    const same = record.preview?.sha256 === p.sha256;
    if (!same) next.preview = { version: p.version, sha256: p.sha256, tag: p.tag, date: p.date, ...builtOf(p) };
    return { ok: true, record: next, wiki: true, note: same ? 'the same preview again' : `preview of ${p.version}` };
  }
  const entry = record.versions[p.version];
  const known = entry?.revisions[p.revision];
  if (known && known.sha256 !== p.sha256)
    return {
      ok: false,
      problem: `${p.version} ${p.revision} is recorded with the archive ${known.sha256.slice(0, 12)}, not ${p.sha256.slice(0, 12)}: a doc revision is immutable, a fix is a new revision`,
    };
  const rollback = o.rollbackTo ? parseRollback(o.rollbackTo) : undefined;
  if (o.rollbackTo && !rollback)
    return { ok: false, problem: `--rollback-to ${o.rollbackTo}: <version> or <version>-r<n>` };
  if (rollback && (rollback.version !== p.version || (rollback.revision ?? p.revision) !== p.revision))
    return {
      ok: false,
      problem: `--rollback-to ${o.rollbackTo} does not name the archive given (${p.version} ${p.revision})`,
    };
  const latest = record.latest;
  const vsLatest = latest ? compareStates(p, latest) : 1;
  const vsApproved = entry ? revisionNumber(p.revision) - revisionNumber(entry.approved) : 1;
  if (rollback && vsLatest >= 0 && vsApproved >= 0)
    return {
      ok: false,
      problem: `--rollback-to ${o.rollbackTo}: ${p.version} ${p.revision} is not older than what is published`,
    };
  if (!rollback && vsApproved < 0)
    return {
      ok: false,
      problem: `${p.version} ${p.revision} is older than its approved revision ${entry!.approved}: refused (--rollback-to ${p.version}-${p.revision} to go back on purpose)`,
    };
  if (!rollback && vsLatest < 0 && latest!.version === p.version)
    return {
      ok: false,
      problem: `${p.version} ${p.revision} is older than the latest ${latest!.version} ${latest!.revision}: refused (--rollback-to to go back on purpose)`,
    };
  if (!known) {
    next.versions[p.version] ??= { approved: p.revision, revisions: {} };
    next.versions[p.version]!.revisions[p.revision] = { sha256: p.sha256, tag: p.tag, date: p.date, ...builtOf(p) };
  }
  next.versions[p.version]!.approved = p.revision;
  // Newer than the latest, the latest again, or a rollback: the wiki follows. An older version's fix: Pages only.
  const moves = vsLatest >= 0 || Boolean(rollback);
  if (moves && !(latest && vsLatest === 0))
    next.latest = { version: p.version, revision: p.revision, sha256: p.sha256, date: p.date, ...builtOf(p) };
  // A release recorded ends the bootstrap: the preview is no longer served.
  if (moves) delete next.preview;
  const note = rollback
    ? `rollback to ${p.version} ${p.revision}`
    : !moves
      ? `${p.version} ${p.revision} recorded for /docs/${p.version}/; the wiki and latest stay on ${latest!.version} ${latest!.revision}`
      : vsLatest === 0
        ? `${p.version} ${p.revision} is already the latest`
        : `${p.version} ${p.revision} is the latest`;
  return { ok: true, record: next, wiki: moves, note };
}

/**
 * The doc revision a run from `docs/<v>` publishes: the next one after the last released, unless the last released
 * one was never recorded (its release went out, the push of the record did not): then that one again, to complete
 * (`existing`: its release is reused when the rebuilt archive has its sha256, refused otherwise).
 */
export function nextRevision(
  version: string,
  releaseTags: readonly string[],
  record: Publication | null,
): { revision: string; existing: boolean } {
  const n = releaseTags
    .map((t) => new RegExp(`^docs-v${version.replace(/\./g, '\\.')}-r([1-9]\\d*)$`).exec(t)?.[1])
    .filter((x): x is string => x !== undefined)
    .map(Number);
  const last = Math.max(1, ...n);
  if (last > 1 && !record?.versions[version]?.revisions[`r${last}`]) return { revision: `r${last}`, existing: true };
  return { revision: `r${last + 1}`, existing: false };
}

// ——— The wiki's repository ———

/** How git reaches the wiki: a token (HTTPS, as actions/checkout passes it, never in a URL) or a deploy key (SSH). */
export type WikiAuth =
  | { kind: 'token'; token: string }
  | { kind: 'key'; keyFile: string; knownHosts: string }
  | { kind: 'none' };

/** GitHub's SSH host keys (https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints). */
const GITHUB_KNOWN_HOSTS =
  'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl\n';

/** The remote of a repository's wiki, for an auth. */
export const wikiRemote = (repo: string, auth: WikiAuth) =>
  auth.kind === 'key' ? `git@github.com:${repo}.wiki.git` : `https://github.com/${repo}.wiki.git`;

/** The environment that gives git its credentials: `http.extraheader` by GIT_CONFIG_*, or `GIT_SSH_COMMAND`. */
export function gitEnv(auth: WikiAuth): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  if (auth.kind === 'token') {
    const basic = Buffer.from(`x-access-token:${auth.token}`).toString('base64');
    env.GIT_CONFIG_COUNT = '1';
    env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${basic}`;
  } else if (auth.kind === 'key')
    env.GIT_SSH_COMMAND = `ssh -i "${auth.keyFile}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="${auth.knownHosts}"`;
  return env;
}

/** The deploy key, written for ssh (mode 0600) beside GitHub's host keys, in a folder of the caller's. */
export function keyAuth(dir: string, privateKey: string): WikiAuth {
  mkdirSync(dir, { recursive: true });
  const keyFile = join(dir, 'wiki-deploy-key');
  const knownHosts = join(dir, 'known_hosts');
  writeFileSync(keyFile, privateKey.endsWith('\n') ? privateKey : `${privateKey}\n`, { mode: 0o600 });
  chmodSync(keyFile, 0o600);
  writeFileSync(knownHosts, GITHUB_KNOWN_HOSTS);
  return { kind: 'key', keyFile, knownHosts };
}

export interface PushOptions {
  /** The wiki's remote (a URL, or a local path in the tests). */
  remote: string;
  auth: WikiAuth;
  /** An empty folder for the clone. */
  workDir: string;
  promotion: Promotion;
  /** The archive's `wiki/` folder, by path inside it. */
  wiki: Map<string, Buffer>;
  rollbackTo?: string;
  /** false: decide and prepare the commit, push nothing (a dry run). */
  push: boolean;
  /** A test seam: runs between the commit and the push, where another publication could land. */
  beforePush?: () => void;
}

export type PushResult =
  | { ok: true; committed: boolean; pushed: boolean; wiki: boolean; note: string; record: Publication }
  | { ok: false; problem: string };

const walk = (dir: string, prefix = ''): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.name === '.git' && !prefix
      ? []
      : e.isDirectory()
        ? walk(join(dir, e.name), `${prefix}${e.name}/`)
        : [`${prefix}${e.name}`],
  );

/** Clones the wiki, decides, replaces its content, commits and pushes (§4.5.7, "Publishing safely"). */
export function pushWiki(o: PushOptions): PushResult {
  const env = gitEnv(o.auth);
  const git = (args: string[], cwd = o.workDir) =>
    execFileSync('git', args, {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    }).trim();
  git(['clone', '--depth', '1', '--no-tags', o.remote, o.workDir], dirname(o.workDir));
  const recordFile = join(o.workDir, 'publication.json');
  const record = existsSync(recordFile) ? parsePublication(readFileSync(recordFile, 'utf8')) : emptyPublication();
  const d = decide(record, o.promotion, o.rollbackTo ? { rollbackTo: o.rollbackTo } : {});
  if (!d.ok) return d;
  if (d.wiki) {
    // Every file the build no longer writes goes, except a generated redirect page: an old URL keeps working.
    const incoming = new Set([...o.wiki.keys()].filter((k) => k !== BUILD_MARKER));
    for (const f of walk(o.workDir)) {
      if (f === 'publication.json' || incoming.has(f)) continue;
      const text = readFileSync(join(o.workDir, f), 'utf8');
      if (f.endsWith('.md') && text.startsWith(REDIRECT_MARKER)) continue;
      rmSync(join(o.workDir, f));
    }
    for (const f of incoming) {
      const file = join(o.workDir, f);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, o.wiki.get(f)!);
    }
  }
  writeFileSync(recordFile, formatJson(d.record));
  git(['add', '-A']);
  if (!git(['status', '--porcelain']))
    return {
      ok: true,
      committed: false,
      pushed: false,
      wiki: d.wiki,
      note: `${d.note}: nothing changed`,
      record: d.record,
    };
  const what = o.promotion.preview
    ? `${o.promotion.version} preview`
    : `${o.promotion.version} ${o.promotion.revision}`;
  git([
    '-c',
    'user.name=github-actions[bot]',
    '-c',
    'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'commit',
    '--quiet',
    '-m',
    `wiki: ${what} (${o.promotion.docRevision})`,
    '-m',
    `${d.note}. Generated from wiki/ by npm run wiki -- publish; an edit made in the wiki is overwritten.`,
  ]);
  if (o.push) {
    o.beforePush?.();
    try {
      git(['push', 'origin', 'HEAD']);
    } catch (e) {
      // Never forced: the wiki moved since the clone (another publication, a web edit), so this one is refused whole
      // and the wiki keeps its last good state. Running docs-publish again decides on the new state.
      const why = String((e as { stderr?: unknown }).stderr ?? (e as Error).message).trim();
      return {
        ok: false,
        problem: `the push was refused, nothing published (${/non-fast-forward|fetch first|rejected/.test(why) ? 'the wiki moved since the clone' : why.split('\n')[0]}): run docs-publish again`,
      };
    }
  }
  return { ok: true, committed: true, pushed: o.push, wiki: d.wiki, note: d.note, record: d.record };
}
