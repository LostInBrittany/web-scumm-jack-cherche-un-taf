// The hosted journal's database (4.2.1, plan §4): Postgres through `pg`, with the session limits the takeover bound
// rests on, set on every connection: `lock_timeout` 2 s, `statement_timeout` 5 s, `idle_in_transaction_session_timeout`
// 5 s. A writer frozen inside a transaction (after taking a row lock, before COMMIT) is cut by Postgres within 5 s,
// which releases its locks; its late COMMIT then fails (spike S measured 5.0 s on Clever Cloud's add-on).
// A transaction naming a lock key takes `pg_advisory_xact_lock` on it, as the Bridge's store does.
import type { Row, SqlDb, SqlQuery } from '../../../bridge/src/store-sql';

interface PgClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
  release(err?: Error): void;
}
interface PgPool {
  query(sql: string, params?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
  connect(): Promise<PgClient>;
  end(): Promise<void>;
  on(ev: 'error', fn: (e: Error) => void): void;
  on(ev: 'connect', fn: (c: PgClient) => void): void;
}
interface PgModule {
  Pool: new (o: { connectionString: string; max?: number; options?: string }) => PgPool;
}

/**
 * The session limits of every connection (plan §4), given at connection time: a connection that cannot have them is
 * no connection at all (never one that runs without them).
 */
const SESSION_LIMITS = '-c lock_timeout=2000 -c statement_timeout=5000 -c idle_in_transaction_session_timeout=5000';

/** Transient conflicts a transaction is tried again for: serialization, deadlock, a lock not obtained in time. */
const RETRY = new Set(['40001', '40P01', '55P03']);

class StudioPg implements SqlDb {
  readonly dialect = 'postgres' as const;
  constructor(private pool: PgPool) {}
  async all(sql: string, params?: unknown[]) {
    return (await this.pool.query(sql, params)).rows;
  }
  async run(sql: string, params?: unknown[]) {
    return (await this.pool.query(sql, params)).rowCount ?? 0;
  }
  async exec(sql: string) {
    await this.pool.query(sql);
  }
  async tx<T>(
    lockKey: string | undefined,
    fn: (q: SqlQuery) => Promise<T>,
    o: { readOnly?: boolean } = {},
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const c = await this.pool.connect();
      const q: SqlQuery = {
        all: async (sql, params) => (await c.query(sql, params)).rows,
        run: async (sql, params) => (await c.query(sql, params)).rowCount ?? 0,
        exec: async (sql) => void (await c.query(sql)),
      };
      try {
        await c.query(o.readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
        if (lockKey !== undefined) await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockKey]);
        const r = await fn(q);
        await c.query('COMMIT');
        c.release();
        return r;
      } catch (e) {
        let broken: Error | undefined;
        await c.query('ROLLBACK').catch((r: unknown) => {
          broken = r instanceof Error ? r : new Error(String(r));
        });
        c.release(broken);
        const code = (e as { code?: string }).code;
        if (!code || !RETRY.has(code) || attempt >= 3) throw e;
        await new Promise((ok) => setTimeout(ok, 20 + Math.random() * 50));
      }
    }
  }
  async close() {
    await this.pool.end();
  }
}

/** Connects to `url`; `pg` is the module (by default `import('pg')`), a test may pass its own. */
export async function openPostgresDb(url: string, o: { pg?: PgModule; max?: number } = {}): Promise<SqlDb> {
  const name = 'pg';
  const mod =
    o.pg ??
    ((
      (await import(/* @vite-ignore */ name).catch(() => {
        throw new Error('the hosted Studio needs the `pg` package: npm install pg');
      })) as { default?: PgModule } & PgModule
    ).default as PgModule);
  const pool = new mod.Pool({ connectionString: url, max: o.max ?? 4, options: SESSION_LIMITS });
  pool.on('error', () => {
    /* an idle client lost: the pool opens another on the next query */
  });
  return new StudioPg(pool);
}
