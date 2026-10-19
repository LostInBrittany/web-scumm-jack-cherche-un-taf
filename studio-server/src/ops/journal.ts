// The operation journal (4.2.1, plan P1, P5, P6): every write to a game's files is one operation, applied whole or
// not at all, recorded before it touches a file and confirmed after. In local mode the files stay the truth (Git
// reads them): the journal records their hashes, keeps the "after" content of each operation as a blob, and rolls an
// interrupted operation forward. A change made outside (an editor, an agent, `git checkout`) is adopted as an
// `external` operation before the next operation is judged.
//
// One writer at a time per project: a promise chain inside this process, and a lease row across the processes that
// share the journal (the dev server, the MCP server, a CLI). The lease is taken on the database's clock, renewed while
// an operation runs, and fenced: the transactions that log and confirm an operation check that the lease is still
// this writer's (same fence) and not expired. A writer that lost its lease cannot log or confirm anything; the next
// holder rolls its logged operation forward before doing anything else.
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { migrate } from '../../../bridge/src/migrations';
import { EventEmitter } from 'node:events';
import type { SqlDb, SqlQuery } from '../../../bridge/src/store-sql';
import type { BlobStore } from './blobs';
import { ABSENT, sha256, sweepTemporaries, writeDurable } from './durable';
import { StudioError } from './errors';

const MIGRATIONS = new URL('../../migrations/', import.meta.url);

/** One file an operation writes: its path under the game folder (with `/`) and its whole new content, or `null`. */
export interface FileEffect {
  path: string;
  after: Buffer | string | null;
}

export interface Operation<R> {
  /** Chosen by the client: a retry with the same id gets the recorded response, never a second application. */
  id?: string;
  author: string;
  what: string;
  effects: FileEffect[];
  /** The revision of each file the client read (P5): a file written since by someone else is a 409. */
  base?: Record<string, number>;
  /**
   * The revision the client read its files at (4.2.3, H10): a file of the effects another author wrote after it is a 409
   * that says what changed meanwhile (`readAt`, `head`, `before` and `now`: its text at each, when it is text), never a
   * lost write. The writes since of the same `client` (a tab, a CLI or MCP session) are its own: they never refuse it.
   */
  readAt?: number;
  /** The client the operation comes from (`x-studio-client`): its own writes since its read are not a conflict. */
  client?: string;
  /**
   * The hash (or `ABSENT`) of each file as the operation read it to compute its effects: a file another process
   * wrote meanwhile is a 409, never a lost write.
   */
  expect?: Record<string, string>;
  /** Called once the effects are known to change something, before anything is logged: throws to refuse (P3). */
  guard?: (changed: FileEffect[]) => Promise<void>;
  /** The response recorded with the operation and sent to the client (and again on a retry). */
  respond: (rev: number) => R;
}

export interface Applied<R> {
  response: R;
  /** The revision the operation made, or the head when it changed nothing. */
  rev: number;
  changed: string[];
  replayed?: true;
}

/** What one file was and became in an operation: sha256 or `ABSENT`. */
interface Change {
  path: string;
  before: string;
  after: string;
}

/** The project needs a person: a file matches neither side of an interrupted operation, or the journal is damaged. */
export class MaintenanceError extends StudioError {
  constructor(message: string) {
    super(`maintenance: ${message}`, 503);
  }
}

/** This writer's lease ran out or was taken over: nothing more is logged or confirmed under it. */
export class LeaseLostError extends StudioError {
  constructor() {
    super('the write lease was lost (another process took over); try again', 503);
  }
}

export interface JournalOptions {
  db: SqlDb;
  blobs: BlobStore;
  /** The game folder the journal follows. */
  gameDir: string;
  /** Who holds the lease in this process (default: a random id). */
  holder?: string;
  /** How long an operation waits for another process's lease before a 409 (default 10 s). */
  leaseWaitMs?: number;
  /** How long a lease lasts without renewal (default 30 s); it is renewed every third of that while an op runs. */
  leaseMs?: number;
  /**
   * Hosted mode (plan §4): the database and the blobs are the truth, the game folder a cache of the instance. The
   * content of every file the journal adopts is stored as a blob too, and the folder is rebuilt from the head when
   * the journal opens (`materialize`).
   */
  hosted?: boolean;
  /**
   * Claims what an operation touches (4.2.1, plan P2: the spans' leases), inside the transaction that logs its intent
   * (its point of linearisation): throws to refuse it, before any file is touched.
   */
  claim?: (q: SqlQuery, paths: string[]) => Promise<void>;
  /** A cheap look before the guard: throws when the claim would surely be refused (the claim still decides). */
  precheck?: (paths: string[]) => Promise<void>;
}

/** What a confirmed operation changed, emitted once it is committed (P7: the live events). */
export interface Confirmed {
  id: string;
  rev: number;
  author: string;
  paths: string[];
}

export class Journal {
  /** `confirmed` (Confirmed): after the commit, at least once per operation of this process. */
  readonly events = new EventEmitter();
  private claim: JournalOptions['claim'];
  private precheck: JournalOptions['precheck'];
  private chain: Promise<unknown> = Promise.resolve();
  private readonly holder: string;
  /** The fence of the lease this writer holds now (0: none). */
  private fence = 0;
  /** Hashes of files by their size and mtime: a full look at the game rehashes only what changed. */
  private seen = new Map<string, { size: number; mtime: number; hash: string }>();

  private constructor(
    private db: SqlDb,
    private blobs: BlobStore,
    readonly gameDir: string,
    holder: string | undefined,
    private leaseWaitMs: number,
    private leaseMs: number,
    private hosted: boolean,
  ) {
    this.holder = holder ?? `${process.pid}-${randomBytes(6).toString('hex')}`;
  }

  /**
   * Opens the journal of `gameDir`: migrates its database, gives a new project its epoch, rolls forward what an
   * interruption left, sweeps the temporary files, and adopts what changed outside since the last operation.
   */
  static async open(o: JournalOptions): Promise<Journal> {
    await migrate(o.db, { dir: MIGRATIONS });
    const j = new Journal(
      o.db,
      o.blobs,
      o.gameDir,
      o.holder,
      o.leaseWaitMs ?? 10_000,
      o.leaseMs ?? 30_000,
      o.hosted ?? false,
    );
    j.claim = o.claim;
    j.precheck = o.precheck;
    j.events.setMaxListeners(0);
    await j.serial(() =>
      j.withLease(async () => {
        await o.db.tx('studio', async (q) => {
          const [e] = await q.all("SELECT value FROM studio_meta WHERE key = 'epoch'");
          if (!e) {
            await q.run("INSERT INTO studio_meta (key, value) VALUES ('epoch', $1)", [randomUUID()]);
            await q.run("INSERT INTO studio_meta (key, value) VALUES ('revision', '0')");
          }
        });
        await j.settle();
        sweepTemporaries(o.gameDir);
      }),
    );
    return j;
  }

  // ------------------------------------------------------------------ reading

  async epoch(): Promise<string> {
    const [r] = await this.db.all("SELECT value FROM studio_meta WHERE key = 'epoch'");
    return String(r?.value);
  }

  async revision(): Promise<number> {
    const [r] = await this.db.all("SELECT value FROM studio_meta WHERE key = 'revision'");
    return Number(r?.value ?? 0);
  }

  /** One file's content hash at revision `rev`: the "before" of the first operation after it that wrote it, else the head's. */
  async blobAt(path: string, rev: number): Promise<string> {
    for (const effects of await this.opsSince(path, rev)) for (const c of effects) if (c.path === path) return c.before;
    return (await this.file(path)).blob;
  }

  /**
   * The effects of the confirmed operations after `rev` that may have written `path` (by another client than `client`),
   * oldest first: those whose JSON names it (a `LIKE`, the caller checks each path), all of them for a path JSON escapes.
   * `!` escapes the pattern (not `\`, whose meaning in a literal depends on Postgres's settings).
   */
  private async opsSince(path: string, rev: number, client = ''): Promise<Change[][]> {
    const like = JSON.stringify(path) === `"${path}"` ? `%"path":"${path.replace(/[!%_]/g, (c) => `!${c}`)}"%` : '%';
    // Without a client (''), every operation: an operation with no client is nobody's own.
    const rows = await this.db.all(
      `SELECT effects FROM studio_ops WHERE state = 'confirmed' AND rev > $1 AND effects LIKE $2 ESCAPE '!' AND ($3 = '' OR client <> $3) ORDER BY rev`,
      [rev, like, client],
    );
    return rows.map((r) => JSON.parse(String(r.effects)) as Change[]);
  }

  /** Whether a client other than `client` wrote `path` after revision `rev` ('': any client). */
  private async writtenSince(path: string, rev: number, client: string): Promise<boolean> {
    return (await this.opsSince(path, rev, client)).some((effects) => effects.some((c) => c.path === path));
  }

  /** A blob as text, when it is (UTF-8, no NUL, 256 KiB at most) and kept; null otherwise (absent, binary, not kept). */
  private async textOf(hash: string): Promise<string | null> {
    // `ABSENT` is no blob: the store refuses it as it refuses any name that is not a hash.
    const bytes = await this.blobs.get(hash).catch(() => null);
    if (!bytes || bytes.length > 256 * 1024 || bytes.includes(0)) return null;
    const text = bytes.toString('utf8');
    return Buffer.from(text, 'utf8').equals(bytes) ? text : null;
  }

  /** The head of one file: its content hash and the revision that last wrote it (`rev` 0: never written). */
  async file(path: string): Promise<{ blob: string; rev: number }> {
    const [r] = await this.db.all('SELECT blob, rev FROM studio_files WHERE path = $1', [path]);
    return r ? { blob: String(r.blob), rev: Number(r.rev) } : { blob: ABSENT, rev: 0 };
  }

  /**
   * The game's files as they were at revision `rev` (4.2.2, plan §2.3: the bisection's snapshots): the head, with every
   * operation after `rev` undone, newest first, from the "before" of its effects. Their contents are read from the
   * blobs, which are kept for every operation; `keep` says which (a snapshot needs no picture).
   */
  async filesAt(
    rev: number,
    keep: (path: string) => boolean = () => true,
    /** The blobs already read (a bisection reads the same ones at each step): filled as they are read. */
    cache?: Map<string, Buffer>,
  ): Promise<{ path: string; bytes: Buffer }[]> {
    const files = new Map<string, string>();
    for (const r of await this.db.all('SELECT path, blob FROM studio_files')) files.set(String(r.path), String(r.blob));
    const ops = await this.db.all(
      "SELECT effects FROM studio_ops WHERE state = 'confirmed' AND rev > $1 ORDER BY rev DESC",
      [rev],
    );
    for (const op of ops) for (const c of JSON.parse(String(op.effects)) as Change[]) files.set(c.path, c.before);
    const out: { path: string; bytes: Buffer }[] = [];
    for (const [path, blob] of [...files].sort(([a], [b]) => (a < b ? -1 : 1)))
      if (blob !== ABSENT && keep(path)) {
        let bytes = cache?.get(blob);
        if (!bytes) {
          bytes = await this.blobs.get(blob);
          cache?.set(blob, bytes);
        }
        out.push({ path, bytes });
      }
    return out;
  }

  /** The files the operation that made revision `rev` changed, each before and after it (sha256 or `ABSENT`). */
  async effectsAt(rev: number): Promise<{ path: string; before: string; after: string }[]> {
    const [r] = await this.db.all("SELECT effects FROM studio_ops WHERE state = 'confirmed' AND rev = $1", [rev]);
    return r ? (JSON.parse(String(r.effects)) as Change[]) : [];
  }

  /** Whether every content this journal's files ever held is in its blobs (hosted: the import's and the adopted too). */
  get keepsEverything(): boolean {
    return this.hosted;
  }

  /** Keeps bytes as a blob (4.2.2: what a personal undo puts back, which a local journal did not keep). */
  keep(bytes: Buffer): Promise<string> {
    return this.blobs.put(bytes);
  }

  /** A blob's bytes (an operation's content before or after it), checked against its hash. */
  blob(hash: string): Promise<Buffer> {
    return this.blobs.get(hash);
  }

  /** The operation that made revision `rev` (what it did, the files it wrote), or undefined. */
  async opAt(rev: number): Promise<{ id: string; rev: number; what: string; paths: string[] } | undefined> {
    const [r] = await this.db.all(
      "SELECT op_id, rev, what, effects FROM studio_ops WHERE state = 'confirmed' AND rev = $1",
      [rev],
    );
    if (!r) return undefined;
    const paths = (JSON.parse(String(r.effects)) as Change[]).map((c) => c.path);
    return { id: String(r.op_id), rev: Number(r.rev), what: String(r.what), paths };
  }

  /** The operations after `rev`, oldest first (P6: a client that reconnects asks for what it missed). */
  async opsAfter(
    rev: number,
    limit = 500,
  ): Promise<{ id: string; rev: number; author: string; what: string; paths: string[] }[]> {
    const rows = await this.db.all(
      "SELECT op_id, rev, author, what, effects FROM studio_ops WHERE state = 'confirmed' AND rev > $1 ORDER BY rev LIMIT $2",
      [rev, limit],
    );
    return rows.map((r) => ({
      id: String(r.op_id),
      rev: Number(r.rev),
      author: String(r.author),
      what: String(r.what),
      paths: (JSON.parse(String(r.effects)) as Change[]).map((c) => c.path),
    }));
  }

  // ------------------------------------------------------------------ writing

  /** Applies one operation (see the file's head). Operations of this process run one after the other. */
  apply<R>(op: Operation<R>): Promise<Applied<R>> {
    return this.serial(() => this.withLease(() => this.applyNow(op)));
  }

  /**
   * Under the lease, before any operation is judged: every logged operation is dead (its writer lost the lease or
   * died), so it is rolled forward; then what changed on the disk outside the journal is adopted. The head then says
   * exactly what the files hold.
   */
  private async settle(): Promise<void> {
    await this.recover();
    // Hosted: the head is the truth and the folder a cache that may be behind (a new instance waited for the lease
    // while the old one confirmed more): the folder follows the head, never the other way. Only a project with no
    // head yet (its first import) is adopted.
    if (this.hosted && (await this.db.all('SELECT path FROM studio_files LIMIT 1')).length) await this.materialize();
    else await this.adopt();
  }

  private async applyNow<R>(op: Operation<R>): Promise<Applied<R>> {
    await this.settle();
    const id = op.id ?? randomUUID();
    // A retry: the recorded response, never a second application (a recovered operation answers that it was).
    const [seen] = await this.db.all('SELECT state, rev, response, effects FROM studio_ops WHERE op_id = $1', [id]);
    if (seen && String(seen.state) === 'confirmed')
      return {
        response: JSON.parse(String(seen.response)) as R,
        rev: Number(seen.rev),
        changed: (JSON.parse(String(seen.effects)) as Change[]).map((c) => c.path),
        replayed: true,
      };
    if (seen) await this.db.run('DELETE FROM studio_ops WHERE op_id = $1', [id]);

    // The base (P5): a file written since the client read it is a conflict, whoever wrote it.
    for (const [path, rev] of Object.entries(op.base ?? {})) {
      const head = await this.file(path);
      if (head.rev !== rev)
        throw Object.assign(new StudioError(`${path} changed since revision ${rev} (now ${head.rev})`, 409), {
          body: { path, base: rev, head: head.rev },
        });
    }

    // The revision read (H10): every file of the effects as the client saw it, or a 409 saying what changed since.
    if (op.readAt !== undefined)
      for (const e of op.effects) {
        const head = await this.file(e.path);
        if (head.rev > op.readAt && (await this.writtenSince(e.path, op.readAt, op.client ?? '')))
          throw Object.assign(new StudioError(`${e.path} changed since revision ${op.readAt} (now ${head.rev})`, 409), {
            body: {
              path: e.path,
              readAt: op.readAt,
              head: head.rev,
              before: await this.textOf(await this.blobAt(e.path, op.readAt)),
              now: await this.textOf(head.blob),
            },
          });
      }

    const changes: Change[] = [];
    const changed: FileEffect[] = [];
    for (const e of op.effects) {
      const before = this.hashOf(e.path);
      const read = op.expect?.[e.path];
      if (read !== undefined && read !== before)
        throw new StudioError(`${e.path} changed while this edit was being prepared; try again`, 409);
      const after = e.after === null ? ABSENT : sha256(e.after);
      if (before === after) continue;
      changes.push({ path: e.path, before, after });
      changed.push(e);
    }
    const head = await this.revision();
    if (!changes.length) return { response: op.respond(head), rev: head, changed: [] };

    await this.precheck?.(changes.map((c) => c.path));
    await op.guard?.(changed);

    // The "after" contents first: a recovery rolls forward from them.
    for (const e of changed) if (e.after !== null) await this.blobs.put(Buffer.from(e.after));
    // The guard took time: a file written outside meanwhile is a 409 here, not overwritten.
    for (const c of changes)
      if (this.hashOf(c.path) !== c.before)
        throw new StudioError(`${c.path} changed while this edit was being checked; try again`, 409);
    const rev = head + 1;
    // The intent: logged and on the disk (synchronous = FULL) before any file is touched, under a live lease.
    await this.db.tx('studio', async (q) => {
      await this.checkLease(q);
      await this.claim?.(
        q,
        changes.map((c) => c.path),
      );
      await q.run(
        "INSERT INTO studio_ops (op_id, rev, author, what, state, effects, at, client) VALUES ($1, $2, $3, $4, 'intent', $5, $6, $7)",
        [id, rev, op.author, op.what, JSON.stringify(changes), Date.now(), op.client ?? ''],
      );
    });
    // The befores, kept in memory: an error of this process undoes what it already wrote.
    const befores = new Map<string, Buffer | null>();
    for (const c of changes) {
      const f = this.abs(c.path);
      befores.set(c.path, existsSync(f) ? readFileSync(f) : null);
    }
    const written: string[] = [];
    try {
      for (const e of changed) {
        writeDurable(this.abs(e.path), e.after === null ? null : Buffer.from(e.after));
        written.push(e.path);
      }
    } catch (err) {
      try {
        for (const p of written.reverse()) writeDurable(this.abs(p), befores.get(p) ?? null);
        await this.db.run("UPDATE studio_ops SET state = 'aborted' WHERE op_id = $1", [id]);
      } catch (e2) {
        throw new MaintenanceError(
          `${op.what}: a write failed (${(err as Error).message}) and undoing it failed too (${(e2 as Error).message})`,
        );
      }
      throw err;
    }
    const response = op.respond(rev);
    // Confirmed under the same lease; a writer that lost it stops here, and the next holder rolls this forward.
    await this.db.tx('studio', async (q) => {
      await this.checkLease(q);
      await this.confirm(q, id, rev, changes, response);
    });
    const paths = changes.map((c) => c.path);
    this.events.emit('confirmed', { id, rev, author: op.author, paths } satisfies Confirmed);
    return { response, rev, changed: paths };
  }

  /**
   * Records a confirmed operation: the head of its files, the project's revision, its response. The revision only
   * ever moves forward by one: anything else is a damaged journal.
   */
  private async confirm(q: SqlQuery, id: string, rev: number, changes: Change[], response: unknown) {
    const [r] = await q.all("SELECT value FROM studio_meta WHERE key = 'revision'");
    const head = Number(r?.value ?? 0);
    if (head !== rev - 1) throw new MaintenanceError(`operation ${id} is revision ${rev} but the head is ${head}`);
    for (const c of changes) {
      await q.run('DELETE FROM studio_files WHERE path = $1', [c.path]);
      await q.run('INSERT INTO studio_files (path, blob, rev) VALUES ($1, $2, $3)', [c.path, c.after, rev]);
    }
    await q.run("UPDATE studio_meta SET value = $1 WHERE key = 'revision'", [String(rev)]);
    await q.run("UPDATE studio_ops SET state = 'confirmed', response = $1 WHERE op_id = $2", [
      JSON.stringify(response ?? null),
      id,
    ]);
  }

  /**
   * Adopts as one `external` operation what changed on the disk since the journal last saw it, across the whole
   * game (a file's hash is recomputed only when its size or mtime moved). In local mode an editor, an agent or Git may
   * write the files; the journal follows them, so the head (and the guard's baseline, kept per revision) is the disk.
   */
  private async adopt(): Promise<void> {
    const known = new Map(
      (await this.db.all('SELECT path, blob FROM studio_files')).map((r) => [String(r.path), String(r.blob)]),
    );
    const files = new Set([...this.listFiles(), ...[...known].filter(([, b]) => b !== ABSENT).map(([p]) => p)]);
    const changes: Change[] = [];
    for (const path of files) {
      const disk = this.hashOf(path);
      const head = known.get(path) ?? ABSENT;
      if (disk !== head) changes.push({ path, before: head, after: disk });
    }
    if (!changes.length) return;
    // Hosted: what is adopted (the first import) must survive the instance, so its content goes to the blobs.
    if (this.hosted)
      for (const c of changes) if (c.after !== ABSENT) await this.blobs.put(readFileSync(this.abs(c.path)));
    const rev = (await this.revision()) + 1;
    const id = randomUUID();
    await this.db.tx('studio', async (q) => {
      await this.checkLease(q);
      await q.run(
        "INSERT INTO studio_ops (op_id, rev, author, what, state, effects, at) VALUES ($1, $2, 'external', 'changed outside the Studio', 'intent', $3, $4)",
        [id, rev, JSON.stringify(changes), Date.now()],
      );
      await this.confirm(q, id, rev, changes, null);
    });
    this.events.emit('confirmed', {
      id,
      rev,
      author: 'external',
      paths: changes.map((c) => c.path),
    } satisfies Confirmed);
  }

  /**
   * Rebuilds the game folder from the head (hosted mode): every file the head holds is written from its blob when the
   * folder's copy differs; a file the head does not hold is removed. Logged intents are left to `recover`.
   */
  async materialize(): Promise<{ written: number; removed: number }> {
    const head = (await this.db.all('SELECT path, blob FROM studio_files')).map((r) => ({
      path: String(r.path),
      blob: String(r.blob),
    }));
    // A project the journal has never recorded (a first import) has no head yet: its folder is what is adopted, never
    // emptied.
    if (!head.length) return { written: 0, removed: 0 };
    const want = new Map(head.filter((h) => h.blob !== ABSENT).map((h) => [h.path, h.blob]));
    let written = 0,
      removed = 0;
    for (const [path, blob] of want)
      if (this.hashOf(path) !== blob) {
        writeDurable(this.abs(path), await this.blobs.get(blob));
        written++;
      }
    for (const path of this.listFiles())
      if (!want.has(path)) {
        writeDurable(this.abs(path), null);
        removed++;
      }
    return { written, removed };
  }

  /**
   * Hosted mode: brings the folder back to the head (a file changed or lost on the instance's disk), under the lease
   * and after the operations of this process. Returns what it rewrote; local mode leaves the folder to its author.
   */
  reconcile(): Promise<{ written: number; removed: number }> {
    if (!this.hosted) return Promise.resolve({ written: 0, removed: 0 });
    return this.serial(() => this.withLease(() => this.materialize()));
  }

  /** Rolls forward every operation logged but not confirmed, oldest first (P1). */
  private async recover(): Promise<void> {
    const rows = await this.db.all("SELECT op_id, rev, effects FROM studio_ops WHERE state = 'intent' ORDER BY rev");
    for (const r of rows) {
      const id = String(r.op_id);
      const changes = JSON.parse(String(r.effects)) as Change[];
      for (const c of changes) {
        const now = this.hashOf(c.path);
        if (now === c.after) continue;
        if (now !== c.before)
          throw new MaintenanceError(
            `operation ${id} (revision ${r.rev}) was interrupted and ${c.path} is neither what it was nor what it became`,
          );
        writeDurable(this.abs(c.path), c.after === ABSENT ? null : await this.blobs.get(c.after));
      }
      await this.db.tx('studio', async (q) => {
        await this.checkLease(q);
        await this.confirm(q, id, Number(r.rev), changes, { recovered: true });
      });
    }
  }

  // ------------------------------------------------------------------ files

  /** The files of the game the journal follows: every file but dot-files (and so the leftovers of a write). */
  private listFiles(): string[] {
    const out: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue;
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.isFile()) out.push(relative(this.gameDir, p).split(sep).join('/'));
      }
    };
    if (existsSync(this.gameDir)) walk(this.gameDir);
    return out;
  }

  /** The hash of a game file as it is on the disk now, or `ABSENT`; rehashed only when its size or mtime moved. */
  private hashOf(path: string): string {
    const f = this.abs(path);
    let st: { size: number; mtimeMs: number; isFile(): boolean };
    try {
      st = statSync(f);
    } catch {
      this.seen.delete(path);
      return ABSENT;
    }
    if (!st.isFile()) throw new StudioError(`${path} is not a file`, 409);
    const k = this.seen.get(path);
    if (k && k.size === st.size && k.mtime === st.mtimeMs) return k.hash;
    const hash = sha256(readFileSync(f));
    this.seen.set(path, { size: st.size, mtime: st.mtimeMs, hash });
    return hash;
  }

  private abs(path: string): string {
    if (path.startsWith('/') || path.split('/').includes('..'))
      throw new StudioError(`not a path in the game: "${path}"`);
    return join(this.gameDir, ...path.split('/'));
  }

  // ------------------------------------------------------------------ the lease and the chain

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(fn, fn);
    this.chain = p.catch(() => undefined);
    return p;
  }

  /** The database's clock, in ms. */
  private get clock(): string {
    return this.db.dialect === 'postgres'
      ? '(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT'
      : "CAST(unixepoch('subsec') * 1000 AS INTEGER)";
  }

  /** Throws `LeaseLostError` unless this writer still holds an unexpired lease with its fence (inside `q`'s tx). */
  private async checkLease(q: SqlQuery): Promise<void> {
    const [r] = await q.all(`SELECT holder, fence, until_ms, ${this.clock} AS now FROM studio_lease WHERE id = 1`);
    if (!r || String(r.holder) !== this.holder || Number(r.fence) !== this.fence || Number(r.until_ms) <= Number(r.now))
      throw new LeaseLostError();
  }

  /**
   * Runs `fn` holding the project's write lease (P8 in small): taken on the database's clock with a new fence,
   * renewed every third of its life while `fn` runs, refused (503, to retry) after `leaseWaitMs` when another writer holds it.
   */
  private async withLease<T>(fn: () => Promise<T>): Promise<T> {
    const deadline = Date.now() + this.leaseWaitMs;
    for (;;) {
      const fence = await this.db.tx('studio', async (q) => {
        const [now] = await q.all(`SELECT ${this.clock} AS now`);
        const t = Number(now?.now);
        const [cur] = await q.all('SELECT holder, fence, until_ms FROM studio_lease WHERE id = 1');
        if (cur && String(cur.holder) !== this.holder && Number(cur.until_ms) > t) return 0;
        const next = Number(cur?.fence ?? 0) + 1;
        await q.run('DELETE FROM studio_lease WHERE id = 1');
        await q.run('INSERT INTO studio_lease (id, holder, fence, until_ms) VALUES (1, $1, $2, $3)', [
          this.holder,
          next,
          t + this.leaseMs,
        ]);
        return next;
      });
      if (fence) {
        this.fence = fence;
        break;
      }
      // A wait, not a conflict (4.2.3: an instance starting beside this one during a deploy): retried as a 503 is.
      if (Date.now() > deadline) throw new StudioError('another process is writing this game; try again', 503);
      await new Promise((ok) => setTimeout(ok, 50));
    }
    const renew = setInterval(
      () => {
        void this.db
          .run(`UPDATE studio_lease SET until_ms = ${this.clock} + $1 WHERE id = 1 AND holder = $2 AND fence = $3`, [
            this.leaseMs,
            this.holder,
            this.fence,
          ])
          .catch(() => undefined);
      },
      Math.max(50, Math.floor(this.leaseMs / 3)),
    );
    renew.unref?.();
    try {
      return await fn();
    } finally {
      clearInterval(renew);
      await this.db
        .run('DELETE FROM studio_lease WHERE id = 1 AND holder = $1 AND fence = $2', [this.holder, this.fence])
        .catch(() => undefined);
      this.fence = 0;
    }
  }

  async close(): Promise<void> {
    await this.serial(async () => this.db.close());
  }
}
