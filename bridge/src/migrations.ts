// The Bridge's schema, versioned (4.1.10, ADR 0009): `bridge/migrations/NNNN.up.sql` and `NNNN.down.sql`, one
// dialect-neutral file per step, applied in order inside a transaction each, recorded in `schema_migrations`. A
// database newer than this Bridge is refused (an older Bridge must not write a schema it does not know).
import { readdirSync, readFileSync } from 'node:fs';

/** Where the migrations are: beside `src/` in this repository and in the packed web-scumm-bridge. */
const DIR = new URL('../migrations/', import.meta.url);

/** The steps in `dir` (the Bridge's by default), in order: their version and both directions. */
function migrationSteps(dir: URL = DIR): { version: number; up: string; down: string }[] {
  return readdirSync(dir)
    .map((f) => /^(\d{4})\.up\.sql$/.exec(f)?.[1])
    .filter((v): v is string => v !== undefined)
    .sort()
    .map((v) => ({
      version: Number(v),
      up: readFileSync(new URL(`${v}.up.sql`, dir), 'utf8'),
      down: readFileSync(new URL(`${v}.down.sql`, dir), 'utf8'),
    }));
}

/** What a migration needs of a database: statements without parameters, one transaction per step. */
interface Statements {
  exec(sql: string): Promise<void>;
  all(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
}
export interface MigrationTarget extends Statements {
  tx<T>(lockKey: string | undefined, fn: (q: Statements) => Promise<T>): Promise<T>;
}

/** The version a database is at (0: empty). */
export async function schemaVersion(db: MigrationTarget): Promise<number> {
  await db.tx('schema', (q) =>
    q.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at BIGINT NOT NULL)'),
  );
  const [row] = await db.all('SELECT MAX(version) AS v FROM schema_migrations');
  return Number(row?.v ?? 0);
}

/**
 * Brings a database to `to` (the latest by default), up or down, one step per transaction. Returns the versions
 * applied (negative when undone). Refuses a database newer than every step this Bridge has.
 */
export async function migrate(
  db: MigrationTarget,
  o: { to?: number; now?: number; dir?: URL } = {},
): Promise<number[]> {
  // `dir` (4.2.1): another component's steps through the same runner (the Studio Server's journal).
  const steps = migrationSteps(o.dir);
  const latest = steps.at(-1)?.version ?? 0;
  const to = o.to ?? latest;
  const at = await schemaVersion(db);
  if (at > latest)
    throw new Error(`the database is at schema ${at}, newer than this Bridge knows (${latest}): upgrade the Bridge`);
  const done: number[] = [];
  for (const s of steps)
    if (s.version > at && s.version <= to) {
      // Two instances starting at once: the second finds the step done inside its own transaction and skips it.
      const applied = await db.tx('schema', async (q) => {
        const [r] = await q.all('SELECT COUNT(*) AS n FROM schema_migrations WHERE version = $1', [s.version]);
        if (Number(r?.n ?? 0) > 0) return false;
        await q.exec(s.up);
        await q.all('INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)', [
          s.version,
          o.now ?? Date.now(),
        ]);
        return true;
      });
      if (applied) done.push(s.version);
    }
  for (const s of [...steps].reverse())
    if (s.version <= at && s.version > to) {
      await db.tx('schema', async (q) => {
        await q.exec(s.down);
        await q.all('DELETE FROM schema_migrations WHERE version = $1', [s.version]);
        return undefined;
      });
      done.push(-s.version);
    }
  return done;
}
