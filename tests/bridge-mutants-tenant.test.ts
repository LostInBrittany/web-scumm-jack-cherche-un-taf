// The edges of the 4.1.10 Bridge (bridge/src/bridge.ts, bridge/src/lock.ts) that the other Bridge tests let live
// under the reality mutation set (tools/mutate.ts; docs/dev/MUTANTS.md): the slow pass's timer, a pairing's origin and
// session, a code confirmed or claimed twice, the telemetry's numbers, the V1 payload, a row whose sequence is not its
// own, a fetch or an export longer than one page, and a lock with three sections queued on one key. Each test says
// which mutants it kills; the Bridge is driven directly over a memory store.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeyedLock } from '../bridge/src/lock';
import { MemoryBridgeStore } from '../bridge/src/store';
import { fromBridgeStore, MemoryRealityStore } from '../bridge/src/store-memory';
import { type OtelApi, Telemetry } from '../bridge/src/telemetry';
import { tenantBridge } from './fixtures/bridge-tenant';

const payloadOf = (jws: string) =>
  JSON.parse(Buffer.from(jws.split('.')[1] ?? '', 'base64url').toString()) as Record<string, unknown>;

/** A telemetry whose histograms keep every value recorded, by name. */
function recordingTelemetry() {
  const values: Record<string, number[]> = {};
  const api: OtelApi = {
    metrics: {
      getMeter: () => ({
        createCounter: () => ({ add: () => {} }),
        createHistogram: (name) => ({
          record: (n) => {
            (values[name] ??= []).push(n);
          },
        }),
      }),
    },
  };
  return { telemetry: new Telemetry(api), values };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the slow pass's timer (mutants of bridge.ts)", () => {
  it('`pollMs: 0` starts no timer; a positive one starts one, and `close` clears that one', async () => {
    const started = vi.spyOn(globalThis, 'setInterval');
    // kills bridge.ts:101 condition true and > → >= : with no pass asked for, no interval is set (not one of 0 ms,
    // which would read every stream in a loop).
    const off = await tenantBridge(new MemoryRealityStore(), { pollMs: 0 });
    expect(started).not.toHaveBeenCalled();
    off.bridge.close();

    const cleared = vi.spyOn(globalThis, 'clearInterval');
    const on = await tenantBridge(new MemoryRealityStore(), { pollMs: 25 });
    expect(started).toHaveBeenCalledTimes(1);
    expect(started.mock.calls[0]?.[1]).toBe(25);
    const timer = started.mock.results[0]?.value;
    // kills bridge.ts:113 condition false: the pass would outlive the Bridge.
    on.bridge.close();
    expect(cleared).toHaveBeenCalledWith(timer);
  });
});

describe('pairing: origin, session, a code confirmed or claimed twice (mutants of bridge.ts)', () => {
  it('a pairing without an origin stores none, and its player has none; one with an origin keeps it', async () => {
    const store = new MemoryRealityStore();
    const t = await tenantBridge(store);
    // kills bridge.ts:157 condition true: the waiting code holds no `origin` key, not even one holding undefined.
    const { code } = await t.bridge.startPairing('signals');
    expect(Object.keys((await store.pairing('default', code)) ?? {})).not.toContain('origin');
    await t.bridge.confirmPairing(t.mail, code);
    const link = await t.bridge.claimPairing(code);
    if (link.status !== 'paired') throw new Error('not paired');
    // kills bridge.ts:213 condition true: nor does the player confirmed from it.
    expect(Object.keys((await t.bridge.exportPlayer(t.admin, link.playerId)).player)).not.toContain('origin');

    const from = await t.pair('https://game.example');
    expect((await t.bridge.exportPlayer(t.admin, from.playerId)).player).toMatchObject({
      origin: 'https://game.example',
    });
  });

  it('a claim returns the link with its session id, new at each pairing', async () => {
    const t = await tenantBridge(new MemoryRealityStore());
    // kills bridge.ts:238 condition false: the session id the player's V2 signals carry is handed over at the claim.
    const a = await t.pair();
    const b = await t.pair();
    expect(a.sessionId).toMatch(/^s-[0-9a-f]{16}$/);
    expect(b.sessionId).toMatch(/^s-[0-9a-f]{16}$/);
    expect(a.sessionId).not.toBe(b.sessionId);
    expect((await t.bridge.exportPlayer(t.admin, a.playerId)).player.sessionId).toBe(a.sessionId);
  });

  it('a code already confirmed answers 409 before any token is read', async () => {
    const t = await tenantBridge(new MemoryRealityStore());
    const { code } = await t.bridge.startPairing('signals');
    await t.bridge.confirmPairing(t.mail, code);
    // kills bridge.ts:175 condition false: without the check, the token is read first and a junk one answers 401.
    await expect(t.bridge.confirmPairing('not-a-token', code)).rejects.toMatchObject({
      status: 409,
      message: 'already confirmed',
    });
  });

  it('a claim that read the code before its confirmation landed stays pending; the next claim collects it', async () => {
    const store = new MemoryRealityStore();
    const t = await tenantBridge(store);
    const { code } = await t.bridge.startPairing('signals');
    // Another instance confirms the code between the claim's read of it and its write.
    const read = store.pairing.bind(store);
    let armed = true;
    store.pairing = async (tenantId, c) => {
      const p = await read(tenantId, c);
      if (armed) {
        armed = false;
        await t.bridge.confirmPairing(t.mail, code);
      }
      return p;
    };
    // kills bridge.ts:227 condition false: the claim would go on with a pairing it read unconfirmed, take the link,
    // and return it without its player id.
    expect(await t.bridge.claimPairing(code)).toEqual({ status: 'pending' });
    const link = await t.bridge.claimPairing(code);
    expect(link).toMatchObject({ status: 'paired', playerId: expect.stringMatching(/^p-/) });
  });

  it('a code already claimed is refused by the Bridge itself, whatever the store would answer', async () => {
    const store = new MemoryRealityStore();
    const t = await tenantBridge(store);
    const { code } = await t.bridge.startPairing('signals');
    await t.bridge.confirmPairing(t.mail, code);
    const first = await t.bridge.claimPairing(code);
    if (first.status !== 'paired') throw new Error('not paired');
    // A store that would hand the link out again (a store with a bug, a restore of an older row).
    const claim = vi.fn(async () => 'claimed' as const);
    store.claimPairing = claim;
    // kills bridge.ts:228 condition false: the second claim would draw a second capability.
    await expect(t.bridge.claimPairing(code)).rejects.toMatchObject({ status: 410, message: 'already claimed' });
    expect(claim).not.toHaveBeenCalled();
    await expect(t.bridge.signals(first.capability, 0)).resolves.toEqual([]);
  });
});

describe('telemetry and the V1 payload (mutants of bridge.ts)', () => {
  it('records the backlog (sequence minus acknowledged) and the time a proposal took', async () => {
    const { telemetry, values } = recordingTelemetry();
    const t0 = Date.now();
    const t = await tenantBridge(new MemoryRealityStore(), { telemetry, now: () => t0 });
    const link = await t.pair();
    await t.propose(link.playerId, 'a');
    await t.propose(link.playerId, 'b');
    await t.bridge.ack(link.capability, 2);
    await t.propose(link.playerId, 'c');
    // kills bridge.ts:324 - → + : signal 3 with 2 acknowledged leaves a backlog of 1, not 5.
    expect(values['bridge.backlog']).toEqual([1, 2, 1]);
    // kills bridge.ts:337 - → + : the clock did not move, so each proposal took 0 ms.
    expect(values['bridge.propose.ms']).toEqual([0, 0, 0]);
    expect(telemetry.snapshot()['backlog.max']).toBe(2);
  });

  it('a V1 Bridge signs a V1 payload: schema 1, no tenant, session or key id', async () => {
    const t = await tenantBridge(new MemoryRealityStore(), { signalVersion: 1 });
    expect(t.bridge.signalVersion).toBe(1);
    const link = await t.pair();
    await t.propose(link.playerId, 'a');
    const [s] = await t.bridge.signals(link.capability, 0);
    // kills bridge.ts:371 condition false: a V1 Bridge would sign V2 payloads its players' keyring refuses.
    const payload = payloadOf(s?.jws ?? '');
    expect(payload.schema).toBe(1);
    for (const k of ['tenantId', 'environment', 'audience', 'sessionId', 'keyId'])
      expect(Object.keys(payload)).not.toContain(k);
  });
});

describe('rows and pages (mutants of bridge.ts)', () => {
  it('a row whose payload names another sequence than its own is quarantined, in V1 too', async () => {
    const mem = new MemoryBridgeStore();
    const t = await tenantBridge(fromBridgeStore(mem));
    const link = await t.pair();
    await t.propose(link.playerId, 'a');
    const [row] = mem.signals(link.playerId, 0);
    if (!row) throw new Error('no row');
    // A second line that copies the first one's payload (sequence 1) under sequence 2: a damaged restore.
    mem.write({ t: 'signal', e: { ...row, sequence: 2, id: 's-0000000000000002', dedupeKey: 'copy' } });
    // kills bridge.ts:410 || → && : with `&&` a sequence mismatch counts only with a tenant mismatch, which a V1
    // payload never has.
    expect((await t.bridge.signals(link.capability, 0)).map((s) => s.sequence)).toEqual([1]);
    expect(t.logs.filter((l) => l.event === 'signal.quarantined')).toHaveLength(1);
  });

  it('a fetch by cursor reads every page, a last page exactly full included', async () => {
    const t = await tenantBridge(new MemoryRealityStore(), { limits: { streamPage: 2 } });
    const link = await t.pair();
    for (const k of ['a', 'b', 'c', 'd']) await t.propose(link.playerId, k);
    // kills bridge.ts:475 condition true and < → <= : four signals are two full pages, then an empty one.
    expect((await t.bridge.signals(link.capability, 0)).map((s) => s.sequence)).toEqual([1, 2, 3, 4]);
    await t.propose(link.playerId, 'e');
    expect((await t.bridge.signals(link.capability, 0)).map((s) => s.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect((await t.bridge.signals(link.capability, 1)).map((s) => s.sequence)).toEqual([2, 3, 4, 5]);
  });

  it("a player's export holds the whole journal, past a first read of exactly 1000 rows", async () => {
    const mem = new MemoryBridgeStore();
    const t = await tenantBridge(fromBridgeStore(mem));
    const link = await t.pair();
    for (let sequence = 1; sequence <= 1001; sequence++)
      mem.write({
        t: 'signal',
        e: { playerId: link.playerId, sequence, id: `s-${sequence}`, dedupeKey: `k-${sequence}`, jws: 'a.b.c', at: 0 },
      });
    // kills bridge.ts:577 condition true and < → <= : the 1001st row is in a second read.
    const { signals } = await t.bridge.exportPlayer(t.admin, link.playerId);
    expect(signals).toHaveLength(1001);
    expect(signals.at(-1)?.sequence).toBe(1001);
  });
});

describe('the keyed lock with three sections (mutants of lock.ts)', () => {
  it('a section queued behind a waiting one waits for it, not only for the one that ran first', async () => {
    const lock = new KeyedLock();
    const order: string[] = [];
    const gate = () => {
      let open: () => void = () => {};
      const p = new Promise<void>((ok) => {
        open = ok;
      });
      return { p, open };
    };
    const a = gate();
    const b = gate();
    const runA = lock.run('k', async () => {
      order.push('a+');
      await a.p;
      order.push('a-');
    });
    const runB = lock.run('k', async () => {
      order.push('b+');
      await b.p;
      order.push('b-');
    });
    a.open();
    await runA;
    // kills lock.ts:22 condition true and === → !== : when A ends, the key's tail is B's; forgetting it would let C
    // start beside B.
    const runC = lock.run('k', async () => {
      order.push('c+');
    });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(order).toEqual(['a+', 'a-', 'b+']);
    b.open();
    await Promise.all([runB, runC]);
    expect(order).toEqual(['a+', 'a-', 'b+', 'b-', 'c+']);
  });
});

// Killed mutant (4.3.0 reread of the exemptions): a key nobody waits on is forgotten. Keys are player ids and pairing
// codes, so a lock that kept them would grow with every code anyone asked to confirm on a long-running Bridge.
describe('KeyedLock forgets an idle key', () => {
  it('holds no key once every section has ended, one or several on a key', async () => {
    const lock = new KeyedLock();
    const tails = () => (lock as unknown as { tails: Map<string, unknown> }).tails.size;
    expect(await lock.run('a', async () => 1)).toBe(1);
    expect(await Promise.all([lock.run('b', async () => 2), lock.run('b', async () => 3)])).toEqual([2, 3]);
    expect(tails()).toBe(0);
  });
});
