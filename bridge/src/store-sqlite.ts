// The `local` profile's store (4.1.10, D20): SQLite through `node:sqlite` (Node 22.13+; no native dependency), one
// file, WAL, `synchronous = FULL` (a write reported done survives a power cut), several processes allowed: a
// transaction is `BEGIN IMMEDIATE` (the file's write lock), so two instances drawing a sequence for one player never
// draw the same. `node:sqlite` waits synchronously, so SQLite itself waits 50 ms at most (the event loop is held that
// long), then this store backs off asynchronously and tries again until `busyMs`; beyond, `StoreBusyError` (a 503).
// Every statement goes through that wait, the opening's `PRAGMA`s and the migrations included (4.1.14: three processes
// opening one fresh file at once raced on `PRAGMA journal_mode = WAL`, and the loser exited on "database is locked").
// The file and its `-wal` and `-shm` are the owner's only (0600). The other instances' acceptances are seen by a short poll of the
// journal's `rowid` (the wake-up; the Bridge reads the rows itself).
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { checkTenant, StoreBusyError } from './store-async';
import { type Row, type SqlDb, type SqlQuery, SqlRealityStore } from './store-sql';

/** `$1` placeholders as SQLite's `?`, the parameters in the order they appear (a `$n` may appear twice). */
function positional(sql: string, params: unknown[] = []): [string, unknown[]] {
  const out: unknown[] = [];
  const text = sql.replace(/\$(\d+)/g, (_m, n: string) => {
    out.push(params[Number(n) - 1]);
    return '?';
  });
  return [text, out];
}
const value = (v: unknown) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v);

const BUSY = /SQLITE_BUSY|database is locked/i;
/** How long SQLite may hold the event loop waiting for another process's lock, per attempt (ms). */
const SYNC_WAIT_MS = 50;

/**
 * One chain of statements per file in this process: two connections to one file in one process would otherwise
 * deadlock, the second's `BEGIN IMMEDIATE` blocking the event loop the first needs to finish its transaction.
 * Across processes the file's lock does the same work.
 */
const CHAINS = new Map<string, { tail: Promise<unknown> }>();

class SqliteDb implements SqlDb {
  readonly dialect = 'sqlite' as const;
  private statements = new Map<string, StatementSync>();
  /** One transaction or statement at a time on this file in this process (its awaits would interleave otherwise). */
  private chain: { tail: Promise<unknown> };
  retries = 0;

  constructor(
    readonly db: DatabaseSync,
    private busyMs: number,
    file: string,
  ) {
    // `:memory:` is never a key (each in-memory database is its own): it always gets a chain of its own.
    let c = CHAINS.get(file);
    if (!c) {
      c = { tail: Promise.resolve() };
      if (file !== ':memory:') CHAINS.set(file, c);
    }
    this.chain = c;
  }

  private prepared(sql: string): StatementSync {
    let s = this.statements.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this.statements.set(sql, s);
    }
    return s;
  }
  /**
   * Inside a transaction: each statement waits too (a read-only transaction takes its snapshot at its first `SELECT`,
   * which may meet another process's recovery or checkpoint; a statement that failed busy did nothing, so it runs again).
   */
  private direct: SqlQuery = {
    all: (sql, params) => {
      const [text, args] = positional(sql, params);
      return this.patiently(() => this.prepared(text).all(...(args.map(value) as never[])) as Row[]);
    },
    run: (sql, params) => {
      const [text, args] = positional(sql, params);
      return this.patiently(() => Number(this.prepared(text).run(...(args.map(value) as never[])).changes));
    },
    exec: (sql) => this.patiently(() => this.db.exec(sql)),
  };
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.tail.then(fn, fn);
    this.chain.tail = run.catch(() => {});
    return run;
  }
  /**
   * Runs `fn` until SQLite stops answering "busy", backing off asynchronously (the event loop free meanwhile), for
   * `busyMs` at most; then `StoreBusyError`.
   */
  async patiently<T>(fn: () => T): Promise<T> {
    const start = Date.now();
    for (let attempt = 0; ; attempt++) {
      try {
        return fn();
      } catch (e) {
        if (!BUSY.test(String(e))) throw e;
        if (Date.now() - start >= this.busyMs) throw new StoreBusyError(`the store stayed busy for ${this.busyMs} ms`);
        this.retries++;
        await new Promise((ok) => setTimeout(ok, Math.min(200, 5 * 2 ** attempt) + Math.random() * 10));
      }
    }
  }
  all(sql: string, params?: unknown[]) {
    const [text, args] = positional(sql, params);
    return this.serial(() => this.patiently(() => this.prepared(text).all(...(args.map(value) as never[])) as Row[]));
  }
  run(sql: string, params?: unknown[]) {
    const [text, args] = positional(sql, params);
    return this.serial(() =>
      this.patiently(() => Number(this.prepared(text).run(...(args.map(value) as never[])).changes)),
    );
  }
  exec(sql: string) {
    return this.serial(() => this.patiently(() => this.db.exec(sql)));
  }
  /** Any synchronous work on the connection, in this file's chain and through the busy wait (the opening's pragmas). */
  apply<T>(fn: (db: DatabaseSync) => T): Promise<T> {
    return this.serial(() => this.patiently(() => fn(this.db)));
  }
  tx<T>(_lockKey: string | undefined, fn: (q: SqlQuery) => Promise<T>, o: { readOnly?: boolean } = {}): Promise<T> {
    return this.serial(async () => {
      // The write lock is taken at BEGIN (a read-only transaction takes none: WAL gives it a snapshot).
      await this.patiently(() => this.db.exec(o.readOnly ? 'BEGIN' : 'BEGIN IMMEDIATE'));
      try {
        const r = await fn(this.direct);
        await this.patiently(() => this.db.exec('COMMIT'));
        return r;
      } catch (e) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          /* the transaction was already rolled back by SQLite */
        }
        throw e;
      }
    });
  }
  private closed = false;
  async close() {
    // Once: a second close (a shutdown's fallback timer) finds nothing left to do, not a closed database.
    await this.serial(async () => {
      if (this.closed) return;
      this.closed = true;
      this.db.close();
    });
  }
  /** How long `BEGIN IMMEDIATE` waits for another process (ms). */
  get busy(): number {
    return this.busyMs;
  }
}

/**
 * Opens (or creates) a SQLite file as this module's `SqlDb`: WAL, `synchronous = FULL`, the busy wait of `busyMs` and
 * one chain of statements per file in this process. The Bridge's store and the Studio Server's journal (4.2.1) both
 * open their file through it; neither migrates here.
 */
export async function openSqliteDb(file: string, o: { busyMs?: number } = {}): Promise<SqliteDb> {
  if (file !== ':memory:') {
    mkdirSync(dirname(file), { recursive: true });
    // Created empty with mode 0600 first: SQLite gives its `-wal` and `-shm` the database file's permissions.
    if (!existsSync(file)) writeFileSync(file, '', { mode: 0o600 });
  }
  // Loaded here, not at the top: a 4.1.9 configuration (the JSON-lines journal) never needs it, on any Node.
  const { DatabaseSync } = await import('node:sqlite');
  const busyMs = o.busyMs ?? 5000;
  // The connection's own busy wait (`timeout`, Node 22.16+; the pragma for older Nodes): it touches no page, so it
  // cannot itself meet a lock.
  const db = new DatabaseSync(file, { timeout: SYNC_WAIT_MS } as ConstructorParameters<typeof DatabaseSync>[1]);
  db.exec(`PRAGMA busy_timeout = ${SYNC_WAIT_MS}`);
  const sqlite = new SqliteDb(db, busyMs, file === ':memory:' ? file : resolve(file));
  try {
    // Switching a fresh file to WAL takes its exclusive lock: another process opening it at the same moment waits.
    if (file !== ':memory:')
      await sqlite.apply((d) => {
        const [r] = d.prepare('PRAGMA journal_mode = WAL').all() as Row[];
        const mode = String(r?.journal_mode ?? '');
        // SQLite answers the mode it kept when it could not switch: another process held the file; wait and ask again.
        if (mode.toLowerCase() !== 'wal') throw new Error(`SQLITE_BUSY: the journal stayed in ${mode} mode`);
      });
    await sqlite.apply((d) => d.exec('PRAGMA synchronous = FULL'));
  } catch (e) {
    db.close();
    throw e;
  }
  return sqlite;
}

export class SqliteRealityStore extends SqlRealityStore {
  readonly kind = 'sqlite' as const;
  private polls = new Set<ReturnType<typeof setInterval>>();

  private constructor(
    private sqlite: SqliteDb,
    readonly file: string,
    private pollMs: number,
    private onPollError?: (e: unknown) => void,
  ) {
    super(sqlite);
  }

  /**
   * Opens (or creates) the file and brings its schema to the latest version, unless `migrate: false` (`bridge
   * migrate` and `doctor` look first). `pollMs`: how often the other processes' acceptances are looked for;
   * `onPollError`: told when a poll fails (once, until one succeeds again; the next poll tries again).
   */
  static async open(
    file: string,
    o: { migrate?: boolean; pollMs?: number; busyMs?: number; onPollError?: (e: unknown) => void } = {},
  ): Promise<SqliteRealityStore> {
    const sqlite = await openSqliteDb(file, { busyMs: o.busyMs });
    const store = new SqliteRealityStore(sqlite, file, o.pollMs ?? 250, o.onPollError);
    if (o.migrate !== false) await store.migrate();
    // The owner's only: hashes of capabilities, the journal, revocations (the WAL holds recent pages of the same).
    if (file !== ':memory:')
      for (const f of [file, `${file}-wal`, `${file}-shm`]) if (existsSync(f)) chmodSync(f, 0o600);
    return store;
  }

  /** Transactions that waited for another process's lock and tried again. */
  get retries(): number {
    return this.sqlite.retries;
  }

  protected async announce(): Promise<void> {
    // Nothing to send: the other processes poll the journal (`watch`).
  }

  watch(tenantId: string, wake: (playerId: string) => void): () => void {
    checkTenant(tenantId);
    let mark: number | undefined;
    let busy = false;
    let failing = false;
    const look = async () => {
      if (busy) return;
      busy = true;
      try {
        if (mark === undefined) {
          const [r] = await this.db.all('SELECT COALESCE(MAX(rowid), 0) AS m FROM signals');
          mark = Number(r?.m ?? 0);
          return;
        }
        const rows = await this.db.all(
          'SELECT rowid AS r, player_id FROM signals WHERE rowid > $1 AND tenant_id = $2 ORDER BY rowid LIMIT 1000',
          [mark, tenantId],
        );
        const players = new Set<string>();
        for (const row of rows) {
          mark = Math.max(mark, Number(row.r));
          players.add(String(row.player_id));
        }
        for (const p of players) wake(p);
        failing = false;
      } catch (e) {
        // The store is closing, or busy past its wait: never fatal, the next poll looks again. Said once per outage.
        if (!failing && this.polls.size) this.onPollError?.(e);
        failing = true;
      } finally {
        busy = false;
      }
    };
    void look();
    const t = setInterval(() => void look(), this.pollMs);
    t.unref?.();
    this.polls.add(t);
    return () => {
      clearInterval(t);
      this.polls.delete(t);
    };
  }

  override async close() {
    for (const t of this.polls) clearInterval(t);
    this.polls.clear();
    await super.close();
  }
}
