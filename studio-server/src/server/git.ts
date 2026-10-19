// The game to and from a Git repository (4.2.3 PR 6, plan H5, D44: a deploy key, one repository per instance). A push is
// one commit for the revisions confirmed since the last push, the game's files at the head, every author of those
// revisions a `Co-authored-by`; it never rewrites the remote's history: a branch that moved since the last push, or one
// the Studio never saw, is refused (409), never forced. An import reads a commit and writes the game as it is there in
// one operation, under the project's exclusive lease; the next push builds on the branch's tip.
// No working tree is ever checked out: a push builds its commit from objects in an index of its own, an import reads
// the blobs from the object database. A link, an attribute, an ignore rule or a stale file of the repository can
// therefore neither reach this server's files nor change the bytes; a link or a submodule in the game is refused. Git
// runs with an environment of its own (no secret of the platform), the deploy key in a 0600 file for one command.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SqlDb } from '../../../bridge/src/store-sql';
import type { BlobStore } from '../ops/blobs';
import { sha256 } from '../ops/durable';
import { StudioError } from '../ops/errors';

export interface GitConfig {
  /** The repository: `git@github.com:org/game.git`, `https://…` (public), `file://…` (tests). */
  remote: string;
  /** Default `main`. */
  branch?: string;
  /** The game's folder in the repository (`games/my-game`); default its root. */
  path?: string;
  /** Who commits (the authors are `Co-authored-by`). */
  committer?: { name: string; email: string };
  /** The remote host's keys (`known_hosts` lines): checked strictly; without them, trusted on first use. */
  knownHosts?: string;
}

export interface GitSyncOptions {
  db: SqlDb;
  blobs: BlobStore;
  gameDir: string;
  config: GitConfig;
  /** Where the clone lives (ephemeral: cloned again when missing). */
  workDir: string;
  /** The deploy key (a private key, PEM or OpenSSH), when the remote needs one. */
  key?: string;
  /** Writes files as one operation (the Studio core's `writeFiles`). */
  writeFiles: (what: string, files: { path: string; after: Buffer | null }[]) => Promise<unknown>;
  /** Runs under the project's exclusive lease. */
  exclusive: <T>(fn: () => Promise<T>) => Promise<T>;
  /** The mailbox domain of an author without a verified email (`users.noreply.<the Studio's host>`). */
  noreplyDomain?: string;
  /** The `git` binary (default `git` on the PATH). */
  git?: string;
  log?: (line: Record<string, unknown>) => void;
}

const MAX_FILES = 5_000;
const MAX_BYTES = 64 * 1024 * 1024;
/** A branch name as `git check-ref-format` takes it, a little narrower. */
export const BRANCH = /^(?![-./])(?!.*\.\.)(?!.*[./]$)(?!.*@\{)[\w./-]{1,100}$/;
const SHA = /^[0-9a-f]{7,40}$/;

/**
 * What never goes to or comes from the repository: a path with a segment that starts with a dot (the repository's own,
 * `.github/`, `.gitignore`), and the game's `private/` (sealed endings, raw sheets: never in a repository, as
 * `.gitignore` says) and `node_modules/`.
 */
const excluded = (p: string) => p.split('/').some((s) => s.startsWith('.')) || /^(private|node_modules)(\/|$)/.test(p);

export class GitSync {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly branch: string;
  private readonly prefix: string;
  private readonly repo: string;

  constructor(private o: GitSyncOptions) {
    this.branch = o.config.branch ?? 'main';
    if (!BRANCH.test(this.branch)) throw new Error(`git.branch "${this.branch}" is not a branch name`);
    this.prefix = (o.config.path ?? '').replace(/^\/+|\/+$/g, '');
    if (this.prefix.split('/').some((s) => s === '..' || s === '.'))
      throw new Error('git.path stays in the repository');
    this.repo = join(o.workDir, 'repo.git');
    // A key a crash left behind is not left there.
    rmSync(join(o.workDir, 'deploy-key'), { force: true });
  }

  /** One at a time: a push and an import never overlap. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async meta(key: string): Promise<string | undefined> {
    const [r] = await this.o.db.all('SELECT value FROM studio_meta WHERE key = $1', [key]);
    return r ? String(r.value) : undefined;
  }

  private async setMeta(values: Record<string, string>) {
    await this.o.db.tx('studio', async (q) => {
      for (const [key, value] of Object.entries(values))
        await q.run(
          'INSERT INTO studio_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
          [key, value],
        );
    });
  }

  /** Git on the bare clone, with its own environment: the deploy key for this command only, no prompt, no user config. */
  private async git(
    args: string[],
    o: { allowFail?: boolean; input?: Buffer; env?: Record<string, string> } = {},
  ): Promise<{ out: Buffer; err: string; code: number }> {
    const keyFile = join(this.o.workDir, 'deploy-key');
    const quote = (p: string) => `'${p.replace(/'/g, `'\\''`)}'`;
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      HOME: this.o.workDir,
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: join(this.o.workDir, 'gitconfig'),
      GIT_DIR: this.repo,
      ...o.env,
    };
    // `init` makes the repository: no GIT_DIR yet.
    if (!env.GIT_DIR) delete env.GIT_DIR;
    if (this.o.key) {
      writeFileSync(keyFile, this.o.key.endsWith('\n') ? this.o.key : `${this.o.key}\n`, { mode: 0o600 });
      const hosts = join(this.o.workDir, 'known_hosts');
      if (this.o.config.knownHosts) writeFileSync(hosts, `${this.o.config.knownHosts.trim()}\n`);
      const strict = this.o.config.knownHosts ? 'yes' : 'accept-new';
      env.GIT_SSH_COMMAND = `ssh -i ${quote(keyFile)} -o IdentitiesOnly=yes -o StrictHostKeyChecking=${strict} -o UserKnownHostsFile=${quote(hosts)}`;
    }
    try {
      return await new Promise((ok, ko) => {
        const child = execFile(
          this.o.git ?? 'git',
          args,
          { cwd: this.o.workDir, env, maxBuffer: 256 * 1024 * 1024, encoding: 'buffer' },
          (e, stdout, stderr) => {
            const code = e ? Number((e as { code?: number }).code ?? 1) : 0;
            const all = String(stderr).trim();
            const err = all.split('\n').slice(-2).join(' ');
            if (code && !o.allowFail) return ko(new StudioError(`git ${args[0]}: ${err}`, 502));
            ok({ out: stdout as Buffer, err: all.slice(-4_000), code });
            return;
          },
        );
        child.stdin?.end(o.input);
      });
    } finally {
      if (this.o.key) rmSync(keyFile, { force: true });
    }
  }

  /** The bare clone, made when missing, fetched; the remote branch's tip, or undefined when it does not exist yet. */
  private async fetch(): Promise<string | undefined> {
    mkdirSync(this.o.workDir, { recursive: true });
    if (!existsSync(join(this.repo, 'HEAD'))) {
      await this.git(['init', '-q', '--bare', this.repo], { env: { GIT_DIR: '' } });
      await this.git(['remote', 'add', 'origin', '--', this.o.config.remote]);
    }
    // The configuration's remote, even when it changed since the clone was made.
    await this.git(['remote', 'set-url', 'origin', '--', this.o.config.remote]);
    await this.git(['fetch', '-q', '--prune', 'origin', `+refs/heads/*:refs/remotes/origin/*`]);
    const tip = await this.git(['rev-parse', '-q', '--verify', `refs/remotes/origin/${this.branch}^{commit}`], {
      allowFail: true,
    });
    return tip.code ? undefined : String(tip.out).trim();
  }

  /** The game at the head: its files by path, each checked against its hash. */
  private async head(): Promise<{ revision: number; files: Map<string, Buffer> }> {
    const rows = await this.o.db.tx(
      undefined,
      async (q) => ({
        files: await q.all("SELECT path, blob FROM studio_files WHERE blob <> 'absent' ORDER BY path"),
        rev: (await q.all("SELECT value FROM studio_meta WHERE key = 'revision'"))[0]?.value,
      }),
      { readOnly: true },
    );
    const files = new Map<string, Buffer>();
    for (const r of rows.files) {
      const path = String(r.path);
      if (excluded(path)) continue;
      const blob = String(r.blob);
      const bytes = (await this.o.blobs.has(blob))
        ? await this.o.blobs.get(blob)
        : readFileSync(join(this.o.gameDir, ...path.split('/')));
      if (sha256(bytes) !== blob) throw new StudioError(`${path}: the folder does not match the head; try again`, 409);
      files.set(path, bytes);
    }
    return { revision: Number(rows.rev ?? 0), files };
  }

  /** A game path's path in the repository. */
  private inRepo(path: string) {
    return this.prefix ? `${this.prefix}/${path}` : path;
  }

  /**
   * The entries of a commit's tree under the game's folder, the repository's own (dotted) left out: path relative to
   * the folder, mode, object id.
   */
  private async tree(commit: string): Promise<{ path: string; mode: string; oid: string }[]> {
    const listed = await this.git(['ls-tree', '-r', '-z', '--full-tree', commit, '--', this.prefix || '.']);
    const out: { path: string; mode: string; oid: string }[] = [];
    for (const line of String(listed.out).split('\0').filter(Boolean)) {
      const tab = line.indexOf('\t');
      const [mode, , oid] = line.slice(0, tab).split(' ');
      const full = line.slice(tab + 1);
      const path = this.prefix ? full.slice(this.prefix.length + 1) : full;
      if (this.prefix && !full.startsWith(`${this.prefix}/`)) {
        // The folder itself is a file, a link or a submodule: never followed.
        throw new StudioError(
          `${full} is not a folder of the repository (a file, a link or a submodule): not read`,
          422,
        );
      }
      if (excluded(path)) continue;
      out.push({ path, mode: mode!, oid: oid! });
    }
    return out;
  }

  /** What the Studio knows of the repository. */
  async status() {
    return {
      remote: this.o.config.remote.replace(/\/\/[^@/]*@/, '//'),
      branch: this.branch,
      path: this.prefix,
      pushed: Number((await this.meta('git_pushed')) ?? 0) || null,
      commit: (await this.meta('git_commit')) ?? null,
    };
  }

  /** An author as a trailer: their email when the provider verified it, else their name at the instance's noreply. */
  private async coAuthor(a: string): Promise<string> {
    const plain = a.replace(/[<>\s]+/g, ' ').trim() || 'someone';
    if (plain.includes('@')) {
      const [u] = await this.o.db
        .all('SELECT name FROM studio_users WHERE email = $1 AND email_verified <> 0', [plain])
        .catch(() => [] as Record<string, unknown>[]);
      if (u)
        return `${
          String(u.name ?? '')
            .replace(/[<>\s]+/g, ' ')
            .trim() || plain.split('@')[0]
        } <${plain}>`;
    }
    const name = plain.includes('@') ? plain.split('@')[0]! : plain;
    const local = name
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      .replace(/[^\w.-]+/g, '.')
      .replace(/^\.+|\.+$/g, '');
    return `${name} <${local || 'someone'}@${this.o.noreplyDomain ?? 'users.noreply.web-scumm.invalid'}>`;
  }

  /**
   * One commit of the revisions confirmed since the last push, on the branch's tip the Studio knows; refused (409) when
   * the branch moved since, or exists and the Studio never imported or pushed it. Nothing new: nothing pushed.
   */
  push(): Promise<{ pushed: boolean; commit: string | null; revisions: [number, number] | null }> {
    return this.serial(async () => {
      const tip = await this.fetch();
      const known = await this.meta('git_commit');
      if (tip && tip !== known)
        throw new StudioError(
          known
            ? `${this.branch} moved since the Studio's last push (${known.slice(0, 12)} → ${tip.slice(0, 12)}): import it first, never forced`
            : `${this.branch} exists and the Studio never imported it: import it first, or push to a new branch`,
          409,
        );
      const head = await this.head();
      const from = Number((await this.meta('git_pushed')) ?? 0);
      // The commit's tree: the tip's, the game's folder made exactly the head (the repository's own files kept).
      // Nothing to push and no branch yet: nothing made.
      if (!tip && !head.files.size) return { pushed: false, commit: null, revisions: null };
      // An index of its own, and a work tree that stays empty (the index commands want one; nothing is checked out).
      const index = join(this.o.workDir, `index-${process.pid}-${Date.now()}`);
      const empty = join(this.o.workDir, 'no-work-tree');
      mkdirSync(empty, { recursive: true });
      const env = { GIT_INDEX_FILE: index, GIT_WORK_TREE: empty };
      try {
        await this.git(tip ? ['read-tree', tip] : ['read-tree', '--empty'], { env });
        // The head's files stored as objects in one command, from a scratch copy of this server's own (never the
        // repository's) bytes; then the index told everything in one: removals (mode 0), then the game's files.
        const scratch = join(this.o.workDir, `objects-${process.pid}-${Date.now()}`);
        const paths = [...head.files.keys()];
        let oids: string[] = [];
        try {
          mkdirSync(scratch, { recursive: true });
          paths.forEach((p, n) => writeFileSync(join(scratch, String(n)), head.files.get(p)!));
          if (paths.length)
            oids = String(
              (
                await this.git(['hash-object', '-w', '--no-filters', '--stdin-paths'], {
                  input: Buffer.from(paths.map((_, n) => join(scratch, String(n))).join('\n')),
                })
              ).out,
            )
              .trim()
              .split('\n');
        } finally {
          rmSync(scratch, { recursive: true, force: true });
        }
        const zero = '0'.repeat(40);
        // NUL-terminated records: a path is taken as it is, never unquoted nor split.
        const records: string[] = [];
        const modes = new Map<string, string>();
        if (tip)
          for (const e of await this.tree(tip)) {
            modes.set(e.path, e.mode);
            if (!head.files.has(e.path)) records.push(`0 ${zero}\t${this.inRepo(e.path)}`);
          }
        // A file the repository has as executable stays so.
        paths.forEach((p, n) =>
          records.push(`${modes.get(p) === '100755' ? '100755' : '100644'} ${oids[n]}\t${this.inRepo(p)}`),
        );
        if (records.length)
          await this.git(['update-index', '-z', '--index-info'], {
            env,
            input: Buffer.from(`${records.join('\0')}\0`),
          });
        const tree = String((await this.git(['write-tree'], { env })).out).trim();
        const before = tip ? String((await this.git(['rev-parse', `${tip}^{tree}`])).out).trim() : undefined;
        if (tree === before) {
          await this.setMeta({ git_pushed: String(head.revision), ...(tip ? { git_commit: tip } : {}) });
          return { pushed: false, commit: tip ?? null, revisions: null };
        }
        const ops = await this.o.db.all(
          "SELECT rev, author, what FROM studio_ops WHERE state = 'confirmed' AND rev > $1 AND rev <= $2 ORDER BY rev",
          [from, head.revision],
        );
        const line = (s: unknown, n: number) => String(s).replace(/\s+/g, ' ').slice(0, n);
        const authors = [...new Set(ops.map((r) => String(r.author)))].filter((a) => a !== 'external');
        const who = this.o.config.committer ?? { name: 'web-scumm Studio', email: 'studio@web-scumm.invalid' };
        const message = [
          `Studio revisions ${from + 1}–${head.revision}`,
          '',
          ...ops.slice(0, 200).map((r) => `- r${r.rev} ${line(r.what, 120)} (${line(r.author, 80)})`),
          ...(ops.length > 200 ? [`- … ${ops.length - 200} more`] : []),
          '',
          ...(await Promise.all(authors.map(async (a) => `Co-authored-by: ${await this.coAuthor(a)}`))),
        ].join('\n');
        const ident = {
          GIT_AUTHOR_NAME: who.name,
          GIT_AUTHOR_EMAIL: who.email,
          GIT_COMMITTER_NAME: who.name,
          GIT_COMMITTER_EMAIL: who.email,
        };
        const commit = String(
          (
            await this.git(['commit-tree', tree, ...(tip ? ['-p', tip] : []), '-F', '-'], {
              input: Buffer.from(message),
              env: ident,
            })
          ).out,
        ).trim();
        // Never forced: a branch that moved meanwhile refuses it; anything else is said as git said it.
        const pushed = await this.git(['push', '--porcelain', 'origin', `${commit}:refs/heads/${this.branch}`], {
          allowFail: true,
        });
        if (pushed.code) {
          // The ref's status line: `!` then `(fetch first)` or `(non-fast-forward)` when the branch moved; anything else
          // (a protected branch, a refused key, the network) is said as git said it.
          const status = String(pushed.out)
            .split('\n')
            .find((l) => l.startsWith('!'));
          if (status && /\((fetch first|non-fast-forward)\)/.test(status))
            throw new StudioError(`${this.branch} moved while pushing: import it first, never forced`, 409);
          throw new StudioError(`the push failed: ${(status ?? pushed.err).replace(/\s+/g, ' ').slice(0, 300)}`, 502);
        }
        await this.setMeta({ git_pushed: String(head.revision), git_commit: commit });
        this.o.log?.({ event: 'git-pushed', commit, revisions: [from + 1, head.revision] });
        return { pushed: true, commit, revisions: [from + 1, head.revision] };
      } finally {
        rmSync(index, { force: true });
      }
    });
  }

  /**
   * The game as it is at `ref` (the branch by default, another branch of the remote, or a commit by its hash), written
   * as one operation under the exclusive lease; it replaces what the Studio had not pushed (kept in its history). A
   * link, a submodule or a file the game cannot hold refuses the whole import.
   */
  import(ref?: string): Promise<{ commit: string; changed: number }> {
    if (ref !== undefined && !BRANCH.test(ref) && !SHA.test(ref))
      throw new StudioError('ref must be a branch of the repository or a commit');
    return this.serial(() =>
      this.o.exclusive(async () => {
        const tip = await this.fetch();
        // Only what the remote has: one of its branches, or a commit by its hash; never this clone's own refs.
        const remote = ref === undefined ? undefined : `refs/remotes/origin/${ref}`;
        const isBranch =
          remote !== undefined &&
          (await this.git(['rev-parse', '-q', '--verify', remote], { allowFail: true })).code === 0;
        const want = ref === undefined ? tip : isBranch ? remote : SHA.test(ref) ? ref : remote;
        if (!want) throw new StudioError(`${this.branch} does not exist in the repository`, 404);
        const at = await this.git(['rev-parse', '-q', '--verify', `${want}^{commit}`], { allowFail: true });
        if (at.code) throw new StudioError(`no commit ${ref} in the repository`, 404);
        const commit = String(at.out).trim();
        const theirs = new Map<string, Buffer>();
        let bytes = 0;
        for (const e of await this.tree(commit)) {
          if (e.mode === '120000' || e.mode === '160000')
            throw new StudioError(`${e.path} is a link or a submodule: not imported`, 422);
          if (theirs.size >= MAX_FILES) throw new StudioError(`more than ${MAX_FILES} files to import`, 413);
          const b = (await this.git(['cat-file', 'blob', e.oid])).out;
          bytes += b.length;
          if (bytes > MAX_BYTES) throw new StudioError('more than 64 MiB to import', 413);
          theirs.set(e.path, b);
        }
        if (!theirs.size) throw new StudioError(`the commit holds no game at "${this.prefix || '/'}"`, 422);
        const head = await this.head();
        const files: { path: string; after: Buffer | null }[] = [];
        for (const [path, b] of theirs) if (!head.files.get(path)?.equals(b)) files.push({ path, after: b });
        for (const path of head.files.keys()) if (!theirs.has(path)) files.push({ path, after: null });
        if (files.length) await this.o.writeFiles(`import from git ${commit.slice(0, 12)}`, files);
        // The branch's tip imported: the next push builds on it. Another commit: the head is that commit's game, and
        // the next push goes on the tip the Studio knows.
        if (tip === commit) {
          const [r] = await this.o.db.all("SELECT value FROM studio_meta WHERE key = 'revision'");
          await this.setMeta({ git_pushed: String(r?.value ?? 0), git_commit: commit });
        }
        this.o.log?.({ event: 'git-imported', commit, files: files.length });
        return { commit, changed: files.length };
      }),
    );
  }
}
