// The backup's survivors read one by one (4.1.20 PR 1b, `reality-store`): a file read bounded refuses what is missing,
// what is not a file and a file swapped or grown while read, and reads through short reads; a file written atomically or
// new writes through short writes, refuses a name that exists or appears, and lets any other error through; the
// Bridge's version is its own package's only. The canonical form: a missing column is null, BIGINTs are numbers, lists
// in code-unit order, `revoked`/`claimed` false and acks at 0 dropped. The file's checks: dates, the SQL schema of a SQL
// store, no rows but tenants in a tenants-only file, schema 3's digest and counts, every family's duplicate alone, a
// stray run or quota. A restore: what it refuses and says, what it deletes with `--force` (a quota only of what the file
// speaks for), an error before the commit as it is, a lost commit as unknown, `replace-store` read back, never `IN ()`.
// An audit: every family read back, `replace-store` only looking beyond the file, in a read-only transaction.
// One in-memory SQLite database per test, temporary folders removed, `node:fs` passed through unless a test hooks it.
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  auditRestore,
  BackupError,
  type BackupPayload,
  makeBackup,
  RestoreUnknown,
  readBackup,
  readBounded,
  restoreBackup,
  writeAtomic,
  writeNew,
} from '../bridge/src/backup';
import {
  byCodeUnit,
  countsOf,
  envelopeDigest,
  normalRow,
  normalTenant,
  payloadDigest,
  withoutCapabilities,
} from '../bridge/src/backup/canonical';
import { bridgeVersion } from '../bridge/src/backup/files';
import type { TenantExport } from '../bridge/src/store-async';
import { MemoryRealityStore } from '../bridge/src/store-memory';
import type { SqlQuery, SqlRealityStore } from '../bridge/src/store-sql';
import { SqliteRealityStore } from '../bridge/src/store-sqlite';

type Fs = typeof import('node:fs');
/** What a test makes `node:fs` do: nothing unless set (each reset after the test). */
const hook = vi.hoisted(() => ({
  afterLstat: undefined as undefined | ((path: string) => void),
  read: undefined as undefined | ((real: Fs['readSync'], ...a: [number, Buffer, number, number, number]) => number),
  write: undefined as undefined | ((real: Fs['writeSync'], ...a: [number, Buffer, number, number]) => number),
  link: undefined as undefined | ((a: string, b: string) => void),
  pkg: undefined as undefined | string,
}));
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<Fs>();
  const mocked = {
    ...fs,
    lstatSync: ((p: string, o: never) => {
      const r = fs.lstatSync(p, o);
      hook.afterLstat?.(String(p));
      return r;
    }) as Fs['lstatSync'],
    readSync: ((...a: [number, Buffer, number, number, number]) =>
      hook.read ? hook.read(fs.readSync, ...a) : fs.readSync(...a)) as Fs['readSync'],
    writeSync: ((...a: [number, Buffer, number, number]) =>
      hook.write ? hook.write(fs.writeSync, ...a) : fs.writeSync(...a)) as Fs['writeSync'],
    linkSync: ((a: string, b: string) => (hook.link ? hook.link(a, b) : fs.linkSync(a, b))) as Fs['linkSync'],
    readFileSync: ((f: unknown, o: never) =>
      hook.pkg !== undefined && String(f).endsWith('package.json')
        ? hook.pkg
        : fs.readFileSync(f as string, o)) as Fs['readFileSync'],
  };
  return { ...mocked, default: mocked };
});

const temps: string[] = [];
const opened: SqlRealityStore[] = [];
afterEach(() => {
  hook.afterLstat = hook.read = hook.write = hook.link = hook.pkg = undefined;
});
afterAll(async () => {
  for (const s of opened) await s.close().catch(() => {});
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'backup-mutants-'));
  temps.push(d);
  return d;
};
const open = async () => {
  const s = await SqliteRealityStore.open(':memory:', { pollMs: 0 });
  opened.push(s);
  return s;
};
const thrown = (f: () => unknown): Error => {
  try {
    f();
  } catch (e) {
    return e as Error;
  }
  throw new Error('nothing thrown');
};

const tenant = (id: string): TenantExport => ({
  tenantId: id,
  players: [{ playerId: 'p-0', gameId: 'g', capabilityHash: 'h'.repeat(64), capabilityExpiresAt: 2e12, issuedAt: 1 }],
  signals: [],
  acks: [],
  revokedTokens: [],
  keys: [],
  quarantine: [],
  pairings: [],
});
const run = (tenantId: string, id: string) => ({
  tenant_id: tenantId,
  id,
  game_id: 'g',
  category_id: 'any%',
  player: `player-${id}`,
  submitted_at: 1_000,
  status: 'verified',
  verdict: 'valid',
  code: null,
  reason: null,
  trust: 'replay-valid',
  ranked: '42',
  seed_kind: null,
  world_hash: null,
  world_mode: null,
  world_seed: null,
  leaderboard_key: 'any%',
  run_key: `key-${id}`,
  delete_token_hash: 'h'.repeat(64),
  envelope: '{"v":2}',
  lease_owner: null,
  lease_until: null,
});
const quota = (tenantId: string, client: string) => ({
  tenant_id: tenantId,
  client_key: client,
  key_version: 'k1',
  tokens: 2.5,
  at: 9_000,
});
const daily = (k: string) => ({ k, v: '{"token":"t"}', created_at: 7 });
/** One tenant with a run, a daily record and a quota: the store the restore and audit tests start from. */
const full = (): BackupPayload => ({
  tenants: [tenant('t-a')],
  runs: [run('t-a', 'r1')],
  daily: [daily('k1')],
  quotas: [quota('t-a', 'c1')],
});
const fill = async (s: SqlRealityStore, p: BackupPayload) => {
  const r = await restoreBackup(s, p, { force: false, carriesRuns: true, carriesQuotas: true });
  expect(r.ok, r.ok ? '' : r.why).toBe(true);
};
const count = async (s: SqlRealityStore, table: string) =>
  Number((await s.db.all(`SELECT COUNT(*) AS n FROM ${table}`))[0]?.n);

/** The store's transactions recorded: their options, every statement run in them. */
function spy(s: SqlRealityStore) {
  const txs: ({ readOnly?: boolean } | undefined)[] = [];
  const sql: string[] = [];
  const tx = s.db.tx.bind(s.db);
  (s.db as { tx: typeof s.db.tx }).tx = (key, fn, o) => {
    txs.push(o);
    return tx(
      key,
      (q) =>
        fn({
          all: (x, p) => (sql.push(x), q.all(x, p)),
          run: (x, p) => (sql.push(x), q.run(x, p)),
          exec: (x) => q.exec(x),
        } as SqlQuery),
      o,
    );
  };
  return { txs, sql };
}

describe('a backup file is read bounded', () => {
  it('a missing file is a BackupError that says so, not the system’s error', () => {
    const f = join(tmp(), 'none.json');
    const e = thrown(() => readBounded(f, 10));
    expect(e).toBeInstanceOf(BackupError);
    expect(e.message).toBe(`${f} does not exist`);
  });

  it('a folder is refused as not a regular file before it is opened', () => {
    const d = tmp();
    expect(thrown(() => readBounded(d, 10)).message).toBe(`${d} is not a regular file`);
  });

  it('a file swapped for another between the look and the open is refused', () => {
    const d = tmp();
    const f = join(d, 'b.json');
    writeFileSync(f, 'first');
    writeFileSync(join(d, 'other.json'), 'other');
    hook.afterLstat = (p) => {
      hook.afterLstat = undefined;
      if (p === f) renameSync(join(d, 'other.json'), f);
    };
    expect(() => readBounded(f, 100)).toThrow(/changed while it was opened/);
  });

  it('reads through short reads, and refuses a file that grew while it was read', () => {
    const f = join(tmp(), 'b.json');
    writeFileSync(f, '0123456789');
    hook.read = (real, fd, buf, off, len, pos) => real(fd, buf, off, Math.min(len, 3), pos);
    expect(readBounded(f, 100)).toBe('0123456789');
    hook.read = (real, ...a) => {
      hook.read = undefined;
      appendFileSync(f, 'more');
      return real(...a);
    };
    expect(() => readBounded(f, 100)).toThrow(/changed while it was read/);
  });
});

describe('a backup file is written whole', () => {
  /** Node refuses a length past the buffer; each call writes three bytes at most. */
  const short = (real: Fs['writeSync'], fd: number, buf: Buffer, off: number, len: number) => {
    if (off + len > buf.length) throw new RangeError(`${off} + ${len} is past ${buf.length}`);
    return real(fd, buf, off, Math.min(len, 3));
  };

  it('through short writes, atomically and new', () => {
    const d = tmp();
    hook.write = short;
    writeAtomic(join(d, 'a.json'), 'atomic content');
    writeNew(join(d, 'n.json'), 'new content');
    hook.write = undefined;
    expect(readFileSync(join(d, 'a.json'), 'utf8')).toBe('atomic content');
    expect(readFileSync(join(d, 'n.json'), 'utf8')).toBe('new content');
  });

  it('new: a name that exists is refused before a byte is written, one that appears meanwhile at the link', () => {
    const d = tmp();
    const f = join(d, 'n.json');
    writeFileSync(f, 'old');
    expect(() => writeNew(f, 'x')).toThrow(`${f} already exists (a file, a link or anything else): give a new path`);
    const g = join(d, 'g.json');
    hook.afterLstat = (p) => {
      hook.afterLstat = undefined;
      if (p === g) writeFileSync(g, 'theirs');
    };
    const e = thrown(() => writeNew(g, 'mine'));
    expect(e).toBeInstanceOf(BackupError);
    expect(e.message).toBe(`${g} already exists: give a new path`);
    expect(readFileSync(g, 'utf8')).toBe('theirs');
    expect(readdirSync(d).sort()).toEqual(['g.json', 'n.json']);
  });

  it('new: any other error of the link is let through as it is, the temporary file removed', () => {
    const d = tmp();
    hook.link = () => {
      throw Object.assign(new Error('EXDEV: cross-device link'), { code: 'EXDEV' });
    };
    const e = thrown(() => writeNew(join(d, 'n.json'), 'x'));
    expect(e).not.toBeInstanceOf(BackupError);
    expect(e.message).toMatch(/EXDEV/);
    expect(readdirSync(d)).toEqual([]);
  });

  it('names its own package’s version only', () => {
    hook.pkg = '{"name":"someone-else","version":"6.6.6"}';
    expect(bridgeVersion()).toBe('unknown');
    hook.pkg = '{"name":"quest-n-click"}';
    expect(bridgeVersion()).toBe('unknown');
    hook.pkg = '{"name":"quest-n-click-bridge","version":"1.2.3"}';
    expect(bridgeVersion()).toBe('1.2.3');
    // The scoped name since 4.5.2 (D53).
    hook.pkg = '{"name":"@quest-n-click/bridge","version":"1.2.4"}';
    expect(bridgeVersion()).toBe('1.2.4');
    // The former name's alias went in 4.3.0 (D47): not this Bridge's package any more.
    hook.pkg = '{"name":"web-scumm-bridge","version":"1.2.3"}';
    expect(bridgeVersion()).toBe('unknown');
    hook.pkg = undefined;
    expect(bridgeVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('the canonical form', () => {
  it('a row: a missing column is null, a BIGINT a number (as text only for the BIGINT columns)', () => {
    expect(normalRow({}, ['a'])).toStrictEqual({ a: null });
    expect(normalRow({ n: 5n }, ['n'])).toStrictEqual({ n: 5 });
    const big = { submitted_at: '1', lease_until: '2', created_at: '3', at: '4', tokens: '5' };
    expect(normalRow(big, Object.keys(big))).toStrictEqual({
      submitted_at: 1,
      lease_until: 2,
      created_at: 3,
      at: 4,
      tokens: '5',
    });
  });

  it('in code-unit order: equal is 0, before is -1, after is 1', () => {
    const cmp = byCodeUnit((r) => String(r.k));
    expect(cmp({ k: 'a' }, { k: 'a' })).toBe(0);
    expect(cmp({ k: 'a' }, { k: 'b' })).toBe(-1);
    expect(cmp({ k: 'b' }, { k: 'a' })).toBe(1);
  });

  it('a tenant: its lists sorted (rows of equal key in their order), false flags and acks at 0 dropped', () => {
    const t = tenant('t');
    const player = (playerId: string, gameId = 'g') => ({
      playerId,
      gameId,
      capabilityHash: 'h',
      capabilityExpiresAt: 1,
    });
    expect(normalTenant({ ...t, players: [player('b'), player('a')] }).players.map((p) => p.playerId)).toEqual([
      'a',
      'b',
    ]);
    // Two rows of equal key: a comparison that says "equal" keeps them in their order.
    expect(
      normalTenant({ ...t, players: [player('same', 'g-0'), player('same', 'g-1')] }).players.map((p) => p.gameId),
    ).toEqual(['g-0', 'g-1']);
    const flags = normalTenant({
      ...t,
      players: [
        { playerId: 'a', gameId: 'g', capabilityHash: 'h', capabilityExpiresAt: 1, revoked: false },
        { playerId: 'b', gameId: 'g', capabilityHash: 'h', capabilityExpiresAt: 1, revoked: true },
      ],
      acks: [
        { playerId: 'a', through: 0 },
        { playerId: 'b', through: 1 },
      ],
      pairings: [
        { code: 'c1', gameId: 'g', expiresAt: 1, claimed: false },
        { code: 'c2', gameId: 'g', expiresAt: 1, claimed: true },
      ],
    });
    expect(flags.players.map((p) => p.revoked)).toEqual([undefined, true]);
    expect(flags.acks).toEqual([{ playerId: 'b', through: 1 }]);
    expect(flags.pairings!.map((p) => p.claimed)).toEqual([undefined, true]);
  });

  it('a tenant without pairings is kept as it is', () => {
    const t = { ...tenant('t'), pairings: undefined };
    expect(withoutCapabilities(t)).toBe(t);
  });
});

describe('the file’s checks', () => {
  /** A schema 4 backup changed, then its counts and digest made to fit: only the envelope's own checks can refuse it. */
  const v4 = (b: object, edit: (x: any) => void) => {
    const x = JSON.parse(JSON.stringify(b));
    edit(x);
    x.counts = countsOf(x.payload);
    x.digest.value = envelopeDigest(x);
    return JSON.stringify(x);
  };
  const legacy = (o: object) => JSON.stringify({ format: 'web-scumm-bridge-backup', schema: 2, at: 'x', ...o });

  it('schema 4: a date that looks ISO but is none, a SQL store without a SQL schema, a quota of no tenant', async () => {
    const b = await makeBackup(await open());
    expect(readBackup(v4(b, () => {})).schema).toBe(4);
    expect(() => readBackup(v4(b, (x) => (x.startedAt = '2020-13-45T25:61:00.000Z')))).toThrow(
      /startedAt is not an ISO 8601 date/,
    );
    expect(() => readBackup(v4(b, (x) => (x.store.schema = null)))).toThrow('a sqlite store with SQL schema null');
    const miscounted = JSON.parse(v4(b, () => {}));
    miscounted.counts.tenants = 1;
    miscounted.digest.value = envelopeDigest(miscounted);
    expect(() => readBackup(JSON.stringify(miscounted))).toThrow('the counts do not match the payload');
    expect(() =>
      readBackup(
        v4(b, (x) => {
          x.payload.tenants = [tenant('t-a')];
          x.payload.quotas = [quota('t-z', 'c')];
        }),
      ),
    ).toThrow('a quota belongs to tenant t-z, which the backup does not carry');
  });

  it('schema 4: a tenants-only file with a run, a daily record or a quota, each alone, is refused', async () => {
    const b = await makeBackup(new MemoryRealityStore());
    expect(readBackup(v4(b, (x) => (x.payload.tenants = [tenant('t-a')]))).schema).toBe(4);
    for (const [family, row] of [
      ['runs', run('t-a', 'r1')],
      ['daily', daily('k')],
      ['quotas', quota('t-a', 'c')],
    ] as const)
      expect(
        () =>
          readBackup(
            v4(b, (x) => {
              x.payload.tenants = [tenant('t-a')];
              x.payload[family] = [row];
            }),
          ),
        family,
      ).toThrow('a memory store holds no runs, daily records or quotas');
  });

  it('schema 3: its digest and its counts', () => {
    const p: BackupPayload = { tenants: [tenant('t-a')], runs: [run('t-a', 'r1')], daily: [] };
    const v3 = (o: { digest?: string; counts?: object } = {}) =>
      JSON.stringify({
        format: 'web-scumm-bridge-backup',
        schema: 3,
        bridge: { version: 'x' },
        store: { kind: 'sqlite', schema: 4 },
        startedAt: 'a',
        endedAt: 'b',
        counts: o.counts ?? countsOf(p),
        payload: p,
        digest: { alg: 'sha256', value: o.digest ?? payloadDigest(p) },
      });
    expect(readBackup(v3()).schema).toBe(3);
    expect(() => readBackup(v3({ digest: 'f'.repeat(64) }))).toThrow(/payload does not match its digest/);
    expect(() => readBackup(v3({ counts: { ...countsOf(p), tenants: 2 } }))).toThrow(/counts do not match/);
  });

  it('every family’s duplicate, alone, is refused with its name', () => {
    const sig = (sequence: number, dedupeKey: string) => ({
      tenantId: 't-a',
      playerId: 'p-0',
      sequence,
      id: `s-${sequence}-${dedupeKey}`,
      dedupeKey,
      jws: 'j',
      at: 1,
    });
    const key = { tenantId: 't-a', keyId: 'k', publicKey: 'pk' };
    const quarantined = { tenantId: 't-a', playerId: 'p-0', sequence: 1, reason: 'r', at: 1 };
    const pairing = { code: 'c', gameId: 'g', expiresAt: 1 };
    const cases: [string, Partial<TenantExport>][] = [
      ["a signal's sequence appears twice", { signals: [sig(1, 'a'), sig(1, 'b')] }],
      ["a signal's dedupe key appears twice", { signals: [sig(1, 'a'), sig(2, 'a')] }],
      [
        'an acknowledgement appears twice',
        {
          acks: [
            { playerId: 'p-0', through: 1 },
            { playerId: 'p-0', through: 2 },
          ],
        },
      ],
      ['a revoked token appears twice', { revokedTokens: ['x', 'x'] }],
      ['a key appears twice', { keys: [key, { ...key, publicKey: 'other' }] }],
      ['a quarantined row appears twice', { quarantine: [quarantined, { ...quarantined, reason: 'other' }] }],
      ['a pairing code appears twice', { pairings: [pairing, { ...pairing, gameId: 'other' }] }],
    ];
    for (const [why, rows] of cases)
      expect(() => readBackup(legacy({ tenants: [{ ...tenant('t-a'), ...rows }] })), why).toThrow(`tenant t-a: ${why}`);
    const r = run('t-a', 'r1');
    expect(() => readBackup(legacy({ tenants: [tenant('t-a')], runs: [r, { ...r, run_key: 'other' }] }))).toThrow(
      'a run appears twice',
    );
  });

  it('schemas 1 and 2: a run of a tenant not carried is not theirs to refuse', () => {
    expect(readBackup(legacy({ tenants: [tenant('t-a')], runs: [run('t-z', 'r1')] })).payload.runs).toHaveLength(1);
  });
});

describe('a restore', () => {
  it('refuses what the store holds, and says exactly what', async () => {
    const s = await open();
    await fill(s, { tenants: [tenant('t-a')], runs: [], daily: [daily('k1')], quotas: [] });
    const refused = async (p: BackupPayload, carriesQuotas = false) => {
      const r = await restoreBackup(s, p, { force: false, carriesRuns: true, carriesQuotas });
      return r.ok ? 'restored' : r.why;
    };
    const tail = ': restore into an empty store, or --force';
    expect(await refused({ tenants: [tenant('t-a')], runs: [], daily: [] })).toBe(
      `the store already holds tenant(s) t-a${tail}`,
    );
    expect(await refused({ tenants: [tenant('t-b')], runs: [], daily: [daily('k1')] })).toBe(
      `the store already holds 1 daily record(s)${tail}`,
    );
    const q = await open();
    await fill(q, { tenants: [tenant('t-a')], runs: [], daily: [], quotas: [quota('t-a', 'c1')] });
    const r = await restoreBackup(
      q,
      { tenants: [tenant('t-a')], runs: [], daily: [], quotas: [] },
      { force: false, carriesRuns: true, carriesQuotas: true },
    );
    expect(r.ok ? '' : r.why).toBe(`the store already holds tenant(s) t-a, 1 quota row(s) of these tenants${tail}`);
  });

  it('names twenty tenants it clashes with, and says there are more beyond twenty', async () => {
    const ids = Array.from({ length: 21 }, (_, i) => `t-${String(i).padStart(2, '0')}`);
    const s = await open();
    await fill(s, { tenants: ids.map(tenant), runs: [], daily: [], quotas: [] });
    const why = async (n: number) => {
      const r = await restoreBackup(
        s,
        { tenants: ids.slice(0, n).map(tenant), runs: [], daily: [] },
        { force: false, carriesRuns: false },
      );
      return r.ok ? '' : r.why;
    };
    expect(await why(20)).toBe(
      `the store already holds tenant(s) ${ids.slice(0, 20).join(', ')}: restore into an empty store, or --force`,
    );
    expect(await why(21)).toBe(
      `the store already holds tenant(s) ${ids.slice(0, 20).join(', ')}…: restore into an empty store, or --force`,
    );
  });

  it('--force deletes the quotas of the tenants the file speaks for only, and the daily records it holds', async () => {
    // A file that does not carry quotas (schema 3, or the option left out) leaves its tenants' quotas alone.
    for (const carriesQuotas of [undefined, false]) {
      const s = await open();
      await fill(s, full());
      const r = await restoreBackup(
        s,
        { tenants: [tenant('t-a')], runs: [], daily: [] },
        { force: true, carriesRuns: true, carriesQuotas },
      );
      expect(r.ok).toBe(true);
      expect(await count(s, 'run_quota'), String(carriesQuotas)).toBe(1);
    }
    // One that carries them speaks for every tenant it holds: the store's quota of t-a goes.
    const s = await open();
    await fill(s, full());
    const r = await restoreBackup(
      s,
      { tenants: [tenant('t-a')], runs: [], daily: [], quotas: [] },
      { force: true, carriesRuns: true, carriesQuotas: true },
    );
    expect(r.ok, r.ok ? '' : r.why).toBe(true);
    expect(await count(s, 'run_quota')).toBe(0);
    // A daily record held is deleted before the file's is written again.
    const again = await restoreBackup(s, full(), { force: true, carriesRuns: true, carriesQuotas: true });
    expect(again.ok, again.ok ? '' : again.why).toBe(true);
    expect(await count(s, 'daily_kv')).toBe(1);
  });

  it('without --force it deletes nothing: a row another connection commits after its checks is refused, kept (4.4.0)', async () => {
    // Postgres READ COMMITTED: a run or a quota of t-a committed elsewhere between the checks and the writes. The checks
    // here do not see it (the wrapper answers as the store was before that commit); a restore without --force must keep
    // it: the read-back sees a row the file does not hold and refuses, rolled back. Deleting it (what --force does) would
    // read back clean and lose another connection's data.
    const racing = async (held: BackupPayload) => {
      const s = await open();
      await fill(s, held);
      const tx = s.db.tx.bind(s.db);
      (s.db as { tx: typeof s.db.tx }).tx = (key, fn, o) =>
        tx(
          key,
          (q) =>
            fn({
              all: async (x, a) => {
                if (/^SELECT COUNT\(\*\) AS n FROM (runs|run_quota) /.test(x)) return [{ n: 0 }];
                const rows = await q.all(x, a);
                return x.startsWith('SELECT tenant_id FROM players UNION')
                  ? rows.filter((r) => r.tenant_id !== 't-a')
                  : rows;
              },
              run: (x, a) => q.run(x, a),
              exec: (x) => q.exec(x),
            } as SqlQuery),
          o,
        );
      const r = await restoreBackup(
        s,
        { tenants: [tenant('t-a')], runs: [], daily: [], quotas: [] },
        { force: false, carriesRuns: true, carriesQuotas: true },
      );
      expect(await s.db.all("SELECT tenant_id FROM players WHERE tenant_id = 't-a'")).toEqual([]);
      return [r.ok ? 'restored' : r.why, await count(s, 'runs'), await count(s, 'run_quota')];
    };
    expect(await racing({ tenants: [tenant('t-z')], runs: [run('t-a', 'r9')], daily: [], quotas: [] })).toEqual([
      'the runs do not read back as the backup holds them',
      1,
      0,
    ]);
    const quotaOnly = await racing({ tenants: [tenant('t-z')], runs: [], daily: [], quotas: [quota('t-a', 'c1')] });
    expect(quotaOnly[1]).toBe(0);
    expect(quotaOnly[2]).toBe(1);
    expect(quotaOnly[0]).not.toBe('restored');
  });

  it('an error before the commit is let through as it is; a commit whose answer is lost is unknown', async () => {
    const s = await open();
    const twice: BackupPayload = { tenants: [tenant('t-a')], runs: [run('t-a', 'r1'), run('t-a', 'r1')], daily: [] };
    const e = await restoreBackup(s, twice, { force: false, carriesRuns: true }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(RestoreUnknown);
    expect(await count(s, 'players')).toBe(0);
    const t = await open();
    const tx = t.db.tx.bind(t.db);
    (t.db as { tx: typeof t.db.tx }).tx = async (key, fn, o) => {
      await tx(key, fn, o);
      throw new Error('the connection was lost at the commit');
    };
    await expect(restoreBackup(t, full(), { force: false, carriesRuns: true })).rejects.toBeInstanceOf(RestoreUnknown);
  });

  it('replace-store refuses a file whose rows name a tenant it does not carry', async () => {
    const s = await open();
    const r = await restoreBackup(
      s,
      { tenants: [tenant('t-a')], runs: [run('t-z', 'r1')], daily: [], quotas: [] },
      { force: false, carriesRuns: true, carriesQuotas: true, mode: 'replace-store' },
    );
    expect(r).toEqual({ ok: false, why: 'the store holds tenants the backup does not' });
  });

  it('never sends `IN ()` (Postgres refuses it): an empty list asks nothing', async () => {
    const s = await open();
    const { sql } = spy(s);
    await fill(s, { tenants: [tenant('t-a')], runs: [], daily: [], quotas: [] });
    await restoreBackup(s, { tenants: [tenant('t-a')], runs: [], daily: [] }, { force: true, carriesRuns: false });
    expect(sql.length).toBeGreaterThan(0);
    expect(sql.filter((x) => /IN \(\)/.test(x))).toEqual([]);
  });
});

describe('a backup and an audit', () => {
  it('a backup reads its snapshot read-only, and loads a store of exactly --max-rows', async () => {
    const s = await open();
    await fill(s, full());
    const { txs } = spy(s);
    // A player, a run, a daily record and a quota: four rows.
    expect((await makeBackup(s, { maxRows: 4 })).counts.runs).toBe(1);
    await expect(makeBackup(s, { maxRows: 3 })).rejects.toThrow(/more than 3/);
    expect(txs[0]).toEqual({ readOnly: true });
  });

  it('reads every family back, the file’s families only, beyond the file only for replace-store', async () => {
    const s = await open();
    await fill(s, full());
    const { txs } = spy(s);
    const all = { carriesRuns: true, carriesQuotas: true };
    const audit = (p: BackupPayload, o: Parameters<typeof auditRestore>[2] = all) => auditRestore(s, p, o);
    expect(await audit(full(), { ...all, mode: 'replace-store' })).toBeUndefined();
    expect(txs).toEqual([{ readOnly: true }]);
    // The file's tenant without its run, its quota: a file that does not speak for them is not refused over them.
    const bare = { tenants: [tenant('t-a')], runs: [], daily: [daily('k1')], quotas: [] };
    expect(await audit(bare, { carriesRuns: false, mode: 'merge' })).toBeUndefined();
    expect(await audit({ ...bare, runs: [run('t-a', 'r1')] }, { carriesRuns: true })).toBeUndefined();
    expect(await audit(bare, { carriesRuns: true })).toBe('the runs do not read back as the backup holds them');
    // replace-store: the store holds a run, a quota beyond what the file speaks for.
    expect(await audit(bare, { carriesRuns: false, mode: 'replace-store' })).toBe(
      'the store holds runs the backup does not',
    );
    expect(await audit({ ...bare, runs: [run('t-a', 'r1')] }, { carriesRuns: true, mode: 'replace-store' })).toBe(
      'the store holds quotas the backup does not',
    );
    // A tenant and a daily record beyond the file: replace-store says so, merge does not.
    await s.db.run('INSERT INTO daily_kv (k, v, created_at) VALUES ($1, $2, $3)', ['k2', 'v', 1]);
    expect(await audit(full(), { ...all, mode: 'merge' })).toBeUndefined();
    expect(await audit(full(), { ...all, mode: 'replace-store' })).toBe(
      'the store holds daily records the backup does not',
    );
    await s.db.run('DELETE FROM daily_kv WHERE k = $1', ['k2']);
    await fill(s, { tenants: [tenant('t-x')], runs: [], daily: [], quotas: [] });
    expect(await audit(full(), { ...all, mode: 'merge' })).toBeUndefined();
    expect(await audit(full(), { ...all, mode: 'replace-store' })).toBe('the store holds tenants the backup does not');
  });

  it('a run, a daily record or a quota changed (or a daily record gone) is told', async () => {
    const changed = async (sql: string, why: string) => {
      const s = await open();
      await fill(s, full());
      await s.db.run(sql);
      expect(await auditRestore(s, full(), { carriesRuns: true, carriesQuotas: true })).toBe(why);
    };
    await changed("UPDATE runs SET status = 'other'", 'the runs do not read back as the backup holds them');
    await changed("UPDATE daily_kv SET v = 'other'", 'the daily record k1 does not read back as the backup holds it');
    await changed('DELETE FROM daily_kv', 'the daily record k1 does not read back as the backup holds it');
    await changed('UPDATE run_quota SET tokens = 1', 'the quotas do not read back as the backup holds them');
  });
});
