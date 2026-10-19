// The spans' leases (4.2.1, studio-server/src/server/leases.ts), pinned for the mutation set `studio-auth`, on the
// database's clock pinned by the test: a lease is over in the very millisecond it ends; a member's own claim keeps
// its fence, another's takes the next; client fences refused for a missing, ended or other lease, each alone; a
// release of some spans keeps the others; a takeover of a span never claimed; a lease's end; Postgres's clock.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../bridge/src/migrations';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import type { SqlDb } from '../bridge/src/store-sql';
import { Leases } from '../studio-server/src/server/leases';

const SQLITE_CLOCK = "CAST(unixepoch('subsec') * 1000 AS INTEGER)";
const PG_CLOCK = '(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT';
let root: string, real: SqlDb, now: number, asked: number;

/** The database with its clock answered by the test (as Postgres when asked, to check that expression too). */
function pinned(dialect: 'sqlite' | 'postgres' = 'sqlite') {
  const pin = (sql: string) => {
    if (sql.includes(PG_CLOCK)) asked++;
    return sql.replaceAll(SQLITE_CLOCK, () => String(now)).replaceAll(PG_CLOCK, () => String(now));
  };
  type Q = {
    all(s: string, p?: unknown[]): Promise<unknown>;
    run(s: string, p?: unknown[]): Promise<unknown>;
    exec(s: string): Promise<void>;
  };
  const wrap = (q: Q) => ({
    all: (sql: string, p?: unknown[]) => q.all(pin(sql), p),
    run: (sql: string, p?: unknown[]) => q.run(pin(sql), p),
    exec: (sql: string) => q.exec(pin(sql)),
  });
  return {
    ...wrap(real),
    dialect,
    tx: (k: string | undefined, fn: (q: unknown) => Promise<unknown>, o?: unknown) =>
      real.tx(k, (q) => fn(wrap(q)), o as never),
    close: () => real.close(),
  } as unknown as SqlDb;
}

beforeEach(async () => {
  mkdirSync(join(process.cwd(), '.cache'), { recursive: true });
  root = mkdtempSync(join(process.cwd(), '.cache', 'leases-mut-'));
  real = await openSqliteDb(join(root, 'j.sqlite'));
  await migrate(real, { dir: new URL('../studio-server/migrations/', import.meta.url) });
  now = 1_000_000;
  asked = 0;
});
afterEach(async () => {
  await real.close();
  rmSync(root, { recursive: true, force: true });
});

const lea = { userId: 'lea', name: 'Léa' };
const tom = { userId: 'tom', name: 'Tom' };

describe('a lease', () => {
  it('lasts its TTL from the claim, and is over in the very millisecond it ends', async () => {
    const l = new Leases(pinned(), { ttlMs: 1_000 });
    expect(await l.take(lea, ['room:a'])).toEqual({ 'room:a': 1 });
    expect((await l.list())[0]).toMatchObject({ span: 'room:a', holder: 'lea', until: 1_001_000 });
    now = 1_000_999;
    await expect(l.take(tom, ['room:a'])).rejects.toMatchObject({ status: 423 });
    now = 1_001_000;
    expect(await l.take(tom, ['room:a'])).toEqual({ 'room:a': 2 });
  });

  it("a member's own claim keeps its fence; another's takes the next", async () => {
    const l = new Leases(pinned(), { ttlMs: 1_000 });
    expect(await l.take(lea, ['story'])).toEqual({ story: 1 });
    expect(await l.take(lea, ['story'])).toEqual({ story: 1 });
    now += 2_000;
    expect(await l.take(tom, ['story'])).toEqual({ story: 2 });
  });

  it("refuses a client's fence for a span with no lease, an ended one, or another fence, each alone", async () => {
    const l = new Leases(pinned(), { ttlMs: 1_000 });
    await expect(l.take({ ...lea, fences: { notes: 1 } }, ['notes'])).rejects.toMatchObject({ status: 423 });
    await l.take(lea, ['notes']);
    await expect(l.take({ ...lea, fences: { notes: 2 } }, ['notes'])).rejects.toMatchObject({ status: 423 });
    expect(await l.take({ ...lea, fences: { notes: 1 } }, ['notes'])).toEqual({ notes: 1 });
    now += 1_000;
    await expect(l.take({ ...lea, fences: { notes: 1 } }, ['notes'])).rejects.toMatchObject({ status: 423 });
  });

  it('a release of some spans keeps the others; with none named, all go', async () => {
    const l = new Leases(pinned(), { ttlMs: 1_000 });
    await l.take(lea, ['room:a', 'room:b', 'story']);
    await l.release('lea', ['room:a']);
    expect((await l.list()).map((x) => x.span)).toEqual(['room:b', 'story']);
    await l.release('lea');
    expect(await l.list()).toEqual([]);
  });
});

describe('a takeover', () => {
  it('of a span never claimed has no previous holder and fence 1; of a live one, names it; of an ended one, not', async () => {
    const l = new Leases(pinned(), { ttlMs: 1_000 });
    expect(await l.takeover(lea, 'room:x')).toEqual({ previous: undefined, fence: 1 });
    expect((await l.list())[0]).toMatchObject({ until: 1_001_000 });
    await l.take(tom, ['room:y']);
    const live = await l.takeover(lea, 'room:y');
    expect(live).toMatchObject({ fence: 2, previous: { holder: 'tom' } });
    now += 1_000;
    expect((await l.takeover(tom, 'room:y')).previous).toBeUndefined();
  });
});

describe("the database's clock", () => {
  it('on Postgres, its own expression', async () => {
    const l = new Leases(pinned('postgres'), { ttlMs: 1_000 });
    await l.take(lea, ['meta']);
    expect(asked).toBeGreaterThan(0);
  });
});
