// The contract of `RealityStore` (4.1.10, ADR 0009), the same tests for every store: memory, a 4.1.9 store wrapped,
// SQLite (a file, two connections), and Postgres when `BRIDGE_PG_URL` names a database (CI's `bridge-postgres` job;
// locally a throwaway server: wiki/en/bridge.install-run.md). Properties with fast-check: n proposals at once for one player
// give contiguous sequences and one row per dedupe key; every read and write with the wrong tenant sees nothing of the
// other tenant. The schema goes up, down and up again.
import { readdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import type { WorldSignalV1 } from '@engine/reality/protocol';
import type { Player } from '../bridge/src/store';
import { MemoryBridgeStore } from '../bridge/src/store';
import type { ProposedSignalRow, RealityStore } from '../bridge/src/store-async';
import { fromBridgeStore, MemoryRealityStore } from '../bridge/src/store-memory';
import { type PgModule, PostgresRealityStore } from '../bridge/src/store-postgres';
import { SqliteRealityStore } from '../bridge/src/store-sqlite';
import { pgDatabase } from './fixtures/pg-database';

const dir = mkdtempSync(join(tmpdir(), 'bridge-store-'));
const opened: RealityStore[] = [];
afterAll(async () => {
  for (const s of opened) await s.close().catch(() => {});
  rmSync(dir, { recursive: true, force: true });
});

const PG_URL = process.env.BRIDGE_PG_URL;
const pgModule = async (): Promise<PgModule> =>
  ((await import(/* @vite-ignore */ process.env.BRIDGE_PG_MODULE ?? 'pg')) as { default: PgModule }).default;

/** Each kind: a way to open it, and a second handle on the same data (another connection, another instance). */
interface Kind {
  name: string;
  multiTenant: boolean;
  open(): Promise<{ a: RealityStore; b: RealityStore }>;
}
const KINDS: Kind[] = [
  {
    name: 'memory',
    multiTenant: true,
    open: async () => {
      const s = new MemoryRealityStore();
      return { a: s, b: s };
    },
  },
  {
    name: 'a 4.1.9 store wrapped',
    multiTenant: false,
    open: async () => {
      const s = fromBridgeStore(new MemoryBridgeStore());
      return { a: s, b: s };
    },
  },
  {
    name: 'sqlite',
    multiTenant: true,
    open: async () => {
      const file = join(dir, `${randomBytes(4).toString('hex')}.sqlite`);
      const a = await SqliteRealityStore.open(file, { pollMs: 20 });
      const b = await SqliteRealityStore.open(file, { pollMs: 20 });
      opened.push(a, b);
      return { a, b };
    },
  },
];
if (PG_URL)
  KINDS.push({
    name: 'postgres',
    multiTenant: true,
    open: async () => {
      const pg = await pgModule();
      const url = await pgDatabase('bridge_contract');
      const a = await PostgresRealityStore.open(url, { pg });
      const b = await PostgresRealityStore.open(url, { pg });
      opened.push(a, b);
      await b.listening();
      return { a, b };
    },
  });

/** A tenant id of its own for each test (Postgres keeps one database for the whole run). */
const tenant = (kind: Kind) => (kind.multiTenant ? `t-${randomBytes(4).toString('hex')}` : 'default');

const player = (playerId: string, o: Partial<Player> = {}): Player => ({
  playerId,
  gameId: 'signals',
  capabilityHash: randomBytes(32).toString('hex'),
  capabilityExpiresAt: 9_999_999_999_999,
  issuedAt: 1,
  ...o,
});
const payload = (playerId: string, sequence: number, dedupeKey: string): WorldSignalV1 => ({
  format: 'web-scumm-world-signal',
  schema: 1,
  id: `s-${playerId}-${sequence}`,
  sequence,
  gameId: 'signals',
  playerId,
  signal: 'mail.answer.correct',
  source: 'mail',
  receivedAt: 1,
  dedupeKey,
  policyVersion: '1',
});
const proposal = (tenantId: string, playerId: string, dedupeKey: string): ProposedSignalRow => ({
  tenantId,
  playerId,
  dedupeKey,
  sign: ({ sequence }) => ({
    id: `s-${playerId}-${sequence}`,
    jws: `h.p${sequence}.s`,
    kid: 'k1',
    payload: payload(playerId, sequence, dedupeKey),
    at: 1,
  }),
});

describe.each(KINDS)('RealityStore: $name', (kind) => {
  it('a code is confirmed once and claimed once; expired codes are swept and stop counting', async () => {
    const { a, b } = await kind.open();
    const t = tenant(kind);
    await a.putPairing(t, { code: 'ABCDEFGH', gameId: 'signals', expiresAt: 1_000, origin: 'https://game.example' });
    expect(await a.pendingPairings(t, 1_000)).toBe(1);
    expect(await a.pendingPairings(t, 1_001)).toBe(0);
    expect(await b.claimPairing(t, 'ABCDEFGH', 'f'.repeat(64))).toBe('pending');
    const confirmed = await Promise.all([
      a.confirmPairing(t, 'ABCDEFGH', player('p-1')),
      b.confirmPairing(t, 'ABCDEFGH', player('p-2')),
    ]);
    expect(confirmed.filter(Boolean)).toHaveLength(1);
    const winner = confirmed[0] ? 'p-1' : 'p-2';
    expect((await b.pairing(t, 'ABCDEFGH'))?.playerId).toBe(winner);
    expect(await b.player(t, confirmed[0] ? 'p-2' : 'p-1')).toBeUndefined();
    const claims = await Promise.all([
      a.claimPairing(t, 'ABCDEFGH', 'a'.repeat(64)),
      b.claimPairing(t, 'ABCDEFGH', 'b'.repeat(64)),
    ]);
    expect([...claims].sort()).toEqual(['already', 'claimed']);
    const hash = claims[0] === 'claimed' ? 'a'.repeat(64) : 'b'.repeat(64);
    expect((await a.playerByCapability(t, hash))?.playerId).toBe(winner);
    expect(await a.claimPairing(t, 'ZZZZZZZZ', 'c'.repeat(64))).toBe('missing');
    await a.sweepPairings(t, 1_001);
    expect(await b.pairing(t, 'ABCDEFGH')).toBeUndefined();
  }, 30000); // SQLite on the Windows runner: three times over 5 s on 7 October 2026

  it('n proposals at once for one player: contiguous sequences, one row per dedupe key (property)', async () => {
    const { a, b } = await kind.open();
    await fc.assert(
      fc.asyncProperty(fc.array(fc.integer({ min: 0, max: 12 }), { minLength: 1, maxLength: 40 }), async (keys) => {
        const t = tenant(kind);
        const p = `p-${randomBytes(4).toString('hex')}`;
        await a.putPlayer(t, player(p));
        // Half through each handle (two connections, two instances): the same order must come out.
        const results = await Promise.all(keys.map((k, i) => (i % 2 ? b : a).appendSignal(proposal(t, p, `key-${k}`))));
        const distinct = new Set(keys).size;
        const fresh = results.filter((r) => !r.duplicate).map((r) => r.signal.sequence);
        expect(fresh.sort((x, y) => x - y)).toEqual(Array.from({ length: distinct }, (_, i) => i + 1));
        // A duplicate answers with the row of its key.
        const byKey = new Map(results.filter((r) => !r.duplicate).map((r) => [r.signal.dedupeKey, r.signal.sequence]));
        for (const r of results) expect(r.signal.sequence).toBe(byKey.get(r.signal.dedupeKey));
        const rows = await b.listAfter({ tenantId: t, playerId: p, after: 0, limit: 1000 });
        expect(rows.map((r) => r.sequence)).toEqual(Array.from({ length: distinct }, (_, i) => i + 1));
        expect(new Set(rows.map((r) => r.dedupeKey)).size).toBe(distinct);
        expect(await a.lastSequence(t, p)).toBe(distinct);
        if (!kind.multiTenant) await a.forgetPlayer(t, p);
      }),
      { numRuns: kind.name === 'postgres' ? 15 : 25 },
    );
  });

  it('a refusal inside the transaction writes nothing; the next proposal takes the same sequence', async () => {
    const { a } = await kind.open();
    const t = tenant(kind);
    await a.putPlayer(t, player('p-r'));
    await a.appendSignal(proposal(t, 'p-r', 'one'));
    await a.acknowledge({ tenantId: t, playerId: 'p-r', sequence: 1 });
    let seen: { sequence: number; acked: number } | undefined;
    await expect(
      a.appendSignal({
        ...proposal(t, 'p-r', 'two'),
        sign: (ctx) => {
          seen = ctx;
          throw new Error('quota');
        },
      }),
    ).rejects.toThrow('quota');
    expect(seen).toEqual({ sequence: 2, acked: 1 });
    expect(await a.lastSequence(t, 'p-r')).toBe(1);
    expect((await a.appendSignal(proposal(t, 'p-r', 'two'))).signal.sequence).toBe(2);
    await a.acknowledge({ tenantId: t, playerId: 'p-r', sequence: 1 });
    expect(await a.acked(t, 'p-r')).toBe(1);
    await a.acknowledge({ tenantId: t, playerId: 'p-r', sequence: 0 });
    expect(await a.acked(t, 'p-r')).toBe(1);
    if (!kind.multiTenant) await a.forgetPlayer(t, 'p-r');
  });

  it('another instance is woken when a signal lands', async () => {
    const { a, b } = await kind.open();
    const t = tenant(kind);
    await a.putPlayer(t, player('p-w'));
    const woken: string[] = [];
    const stop = b.watch(t, (p) => woken.push(p));
    await new Promise((ok) => setTimeout(ok, 50));
    await a.appendSignal(proposal(t, 'p-w', 'w1'));
    for (let i = 0; i < 100 && !woken.length; i++) await new Promise((ok) => setTimeout(ok, 20));
    stop();
    expect(woken).toContain('p-w');
    if (!kind.multiTenant) await a.forgetPlayer(t, 'p-w');
  });

  it('forgetting a player deletes its link, journal, acknowledgement and pairing, and nothing else', async () => {
    const { a, b } = await kind.open();
    const t = tenant(kind);
    for (const p of ['p-a', 'p-b']) {
      await a.putPlayer(t, player(p));
      await a.appendSignal(proposal(t, p, 'x'));
      await a.acknowledge({ tenantId: t, playerId: p, sequence: 1 });
    }
    await a.putPairing(t, { code: 'CODEAAAA', gameId: 'signals', expiresAt: 9e12 });
    await a.confirmPairing(t, 'CODEAAAA', player('p-c'));
    await a.quarantine({ tenantId: t, playerId: 'p-a', sequence: 1, reason: 'test', at: 1 });
    await b.forgetPlayer(t, 'p-a');
    await b.forgetPlayer(t, 'p-c');
    expect(await a.player(t, 'p-a')).toBeUndefined();
    expect(await a.listAfter({ tenantId: t, playerId: 'p-a', after: 0, limit: 10 })).toEqual([]);
    expect(await a.acked(t, 'p-a')).toBe(0);
    expect(await a.pairing(t, 'CODEAAAA')).toBeUndefined();
    expect(await a.quarantined(t)).toEqual([]);
    expect((await a.player(t, 'p-b'))?.playerId).toBe('p-b');
    expect(await a.acked(t, 'p-b')).toBe(1);
    if (!kind.multiTenant) await a.forgetPlayer(t, 'p-b');
  });

  it.runIf(kind.multiTenant)(
    'every read and write with the wrong tenant sees nothing of the other (property)',
    async () => {
      const { a, b } = await kind.open();
      type Op =
        | { t: 'player'; p: number }
        | { t: 'signal'; p: number; k: number }
        | { t: 'ack'; p: number }
        | { t: 'revoke'; k: number }
        | { t: 'key'; k: number }
        | { t: 'quarantine'; p: number };
      const op: fc.Arbitrary<Op> = fc.oneof(
        fc.record({ t: fc.constant('player' as const), p: fc.integer({ min: 0, max: 3 }) }),
        fc.record({
          t: fc.constant('signal' as const),
          p: fc.integer({ min: 0, max: 3 }),
          k: fc.integer({ min: 0, max: 5 }),
        }),
        fc.record({ t: fc.constant('ack' as const), p: fc.integer({ min: 0, max: 3 }) }),
        fc.record({ t: fc.constant('revoke' as const), k: fc.integer({ min: 0, max: 5 }) }),
        fc.record({ t: fc.constant('key' as const), k: fc.integer({ min: 0, max: 5 }) }),
        fc.record({ t: fc.constant('quarantine' as const), p: fc.integer({ min: 0, max: 3 }) }),
      );
      await fc.assert(
        fc.asyncProperty(fc.array(op, { maxLength: 25 }), async (ops) => {
          const A = tenant(kind);
          const B = tenant(kind);
          const hashes: string[] = [];
          // Tenant A gets everything; tenant B gets the same player ids, empty.
          for (const o of ops) {
            const p = `p-${'p' in o ? o.p : 0}`;
            if (o.t === 'player') {
              const pl = player(p);
              hashes.push(pl.capabilityHash);
              await a.putPlayer(A, pl);
            } else if (o.t === 'signal') await a.appendSignal(proposal(A, p, `k${o.k}`));
            else if (o.t === 'ack') await a.acknowledge({ tenantId: A, playerId: p, sequence: 1 });
            else if (o.t === 'revoke') await a.revokeToken(A, `tok${o.k}`);
            else if (o.t === 'key') await a.rotateKeys({ tenantId: A, keyId: `k${o.k}`, publicKey: 'x' });
            else await a.quarantine({ tenantId: A, playerId: p, sequence: 1, reason: 'r', at: 1 });
          }
          for (let i = 0; i < 4; i++) {
            const p = `p-${i}`;
            expect(await b.player(B, p)).toBeUndefined();
            expect(await b.listAfter({ tenantId: B, playerId: p, after: 0, limit: 100 })).toEqual([]);
            expect(await b.lastSequence(B, p)).toBe(0);
            expect(await b.acked(B, p)).toBe(0);
          }
          for (const h of hashes) expect(await b.playerByCapability(B, h)).toBeUndefined();
          for (let k = 0; k < 6; k++) expect(await b.tokenRevoked(B, `tok${k}`)).toBe(false);
          expect([...(await b.revokedTokens(B))]).toEqual([]);
          expect(await b.keys(B)).toEqual([]);
          expect(await b.quarantined(B)).toEqual([]);
          const x = await b.exportTenant(B);
          expect(
            [x.players, x.signals, x.acks, x.revokedTokens, x.keys, x.quarantine].every((l) => l.length === 0),
          ).toBe(true);
          // A write to B lands in B only: A's journal for the same player id is unchanged.
          const before = await a.listAfter({ tenantId: A, playerId: 'p-0', after: 0, limit: 100 });
          await b.putPlayer(B, player('p-0'));
          await b.appendSignal(proposal(B, 'p-0', 'k0'));
          expect(await a.listAfter({ tenantId: A, playerId: 'p-0', after: 0, limit: 100 })).toEqual(before);
          // Deleting B leaves A whole.
          const exportA = await a.exportTenant(A);
          await b.deleteTenant(B);
          expect(await a.exportTenant(A)).toEqual(exportA);
        }),
        { numRuns: kind.name === 'postgres' ? 10 : 20 },
      );
    },
  );

  it.runIf(kind.multiTenant)('a tenant exports, imports elsewhere identically, and deletes entirely', async () => {
    const { a, b } = await kind.open();
    const t = tenant(kind);
    await a.putPlayer(t, player('p-x', { sessionId: 's-1', origin: 'https://game.example' }));
    await a.appendSignal(proposal(t, 'p-x', 'one'));
    await a.appendSignal(proposal(t, 'p-x', 'two'));
    await a.acknowledge({ tenantId: t, playerId: 'p-x', sequence: 1 });
    await a.revokeToken(t, 'tok');
    await a.rotateKeys({ tenantId: t, keyId: 'k1', publicKey: 'raw', retireAfter: '2026-11-01T00:00:00.000Z' });
    await a.quarantine({ tenantId: t, playerId: 'p-x', sequence: 2, reason: 'r', at: 5 });
    const x = await b.exportTenant(t);
    expect(x.signals.map((s) => s.sequence)).toEqual([1, 2]);
    expect(x.signals[0]?.payload).toEqual(payload('p-x', 1, 'one'));
    const copy = tenant(kind);
    await b.importTenant({
      ...x,
      tenantId: copy,
      keys: x.keys.map((k) => ({ ...k, tenantId: copy })),
      quarantine: x.quarantine.map((q) => ({ ...q, tenantId: copy })),
      signals: x.signals.map((s) => ({ ...s, tenantId: copy })),
    });
    const y = await a.exportTenant(copy);
    const strip = (e: typeof x) => JSON.parse(JSON.stringify(e).replaceAll(e.tenantId, 'T'));
    expect(strip(y)).toEqual(strip(x));
    expect(await a.tenants()).toEqual(expect.arrayContaining([t, copy]));
    await a.deleteTenant(t);
    const gone = await b.exportTenant(t);
    expect([gone.players, gone.signals, gone.revokedTokens, gone.keys, gone.quarantine].flat()).toEqual([]);
    expect(await a.tenants()).not.toContain(t);
    expect((await a.exportTenant(copy)).signals).toHaveLength(2);
  });

  it('refuses a tenant id that is not one', async () => {
    const { a } = await kind.open();
    await expect(a.player('Not A Tenant', 'p')).rejects.toThrow(/tenant/);
    await expect(a.player('', 'p')).rejects.toThrow(/tenant/);
  });
});

describe('a 4.1.9 store wrapped', () => {
  it('holds the tenant `default` only', async () => {
    const s = fromBridgeStore(new MemoryBridgeStore());
    await expect(s.player('acme', 'p-1')).rejects.toThrow(/default/);
    await expect(s.appendSignal(proposal('acme', 'p-1', 'k'))).rejects.toThrow(/default/);
    expect(await s.tenants()).toEqual(['default']);
  });
});

describe('the schema', () => {
  // Every step on disk (4.1.17: 0003 the leaderboard's ranking, 0004 the shared quota), up in order, down in reverse.
  const UP = readdirSync('bridge/migrations')
    .map((f) => /^(\d{4})\.up\.sql$/.exec(f)?.[1])
    .filter((v): v is string => !!v)
    .map(Number)
    .sort((a, b) => a - b);
  const DOWN = (to: number) =>
    UP.filter((v) => v > to)
      .reverse()
      .map((v) => -v);
  it('SQLite: goes up, down to empty, and up again; a database newer than the Bridge is refused', async () => {
    const file = join(dir, 'migrate.sqlite');
    const s = await SqliteRealityStore.open(file, { migrate: false });
    opened.push(s);
    expect(await s.schemaVersion()).toBe(0);
    expect(await s.migrate()).toEqual(UP);
    expect(await s.migrate()).toEqual([]);
    // 4.1.16: version 2 and later (the leaderboards, the daily challenge) go down alone, version 1's data untouched.
    expect(await s.migrate({ to: 1 })).toEqual(DOWN(1));
    expect(await s.migrate()).toEqual(UP.slice(1));
    await s.putPlayer('t-1', player('p-1'));
    expect(await s.migrate({ to: 0 })).toEqual(DOWN(0));
    expect(await s.schemaVersion()).toBe(0);
    await expect(s.player('t-1', 'p-1')).rejects.toThrow(/no such table/);
    expect(await s.migrate()).toEqual(UP);
    expect(await s.player('t-1', 'p-1')).toBeUndefined();
    await s.db.all('INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)', [99, 0]);
    await expect(s.migrate()).rejects.toThrow(/newer than this Bridge/);
  });

  it.runIf(PG_URL)('Postgres: goes up, down to empty, and up again, in a database of its own', async () => {
    const pg = await pgModule();
    const name = `bridge_mig_${randomBytes(4).toString('hex')}`;
    const admin = new pg.Pool({ connectionString: PG_URL! });
    await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(PG_URL!);
    url.pathname = `/${name}`;
    const s = await PostgresRealityStore.open(url.toString(), { pg, migrate: false });
    try {
      expect(await s.schemaVersion()).toBe(0);
      expect(await s.migrate()).toEqual(UP);
      await s.putPlayer('t-1', player('p-1'));
      expect(await s.migrate({ to: 0 })).toEqual(DOWN(0));
      expect(await s.migrate()).toEqual(UP);
      expect(await s.player('t-1', 'p-1')).toBeUndefined();
    } finally {
      await s.close();
      await admin.query(`DROP DATABASE ${name}`);
      await admin.end();
    }
  });
});
