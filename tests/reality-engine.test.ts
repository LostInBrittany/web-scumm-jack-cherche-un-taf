// Signals from the world outside in the engine and the player's client (4.1.1): delivered at least once, applied at
// most once, saved before acknowledged, replayed offline. A crash at every boundary of the protocol, then the Bridge
// delivers again: the effect happens once.
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore, type WorldSignalPort } from '@engine/core/ports';
import { parseSave, saveEnvelope } from '@engine/core/save';
import { stateDigest } from '@engine/core/diff';
import type { ExternalEntry, GameState, Session } from '@engine/core/types';
import { CLOCK_SKEW_MS, importBridgeKey, signSignal, type WorldSignalV1 } from '@engine/reality/protocol';
import { RealityClient } from '@engine/reality/client';
import { compact, MAX_PENDING } from '@engine/core/reality-runtime';
import { labelOf, replay } from '@engine/tools/replay';
import { signals, signalsLayouts } from './fixtures/signals';

const NOW = Date.UTC(2026, 9, 6, 12);
const PLAYER = 'p-7f3a';
const x = (sequence: number, signal = 'mail.answer.correct', id = `sig-${sequence}`): ExternalEntry => ({
  id,
  sequence,
  signal,
  source: signal.split('.')[0]!,
  receivedAt: NOW,
});

async function engine(store = new MemoryStore(), saved?: GameState) {
  const e = new Engine(signals(), signalsLayouts, new FakePresenter(), store);
  e.digestOn = true;
  if (saved) await e.load(saved);
  else await e.newGame();
  return e;
}

describe('Engine.receive', () => {
  it('applies a declared signal once, records it, and saves it with the state', async () => {
    const store = new MemoryStore();
    const e = await engine(store);
    expect(await e.receive(x(1))).toBe('applied');
    expect(e.state.flags.vault_open).toBe(true);
    expect(e.state.reality).toEqual({ cursor: 1, applied: {} });
    expect(e.session?.log.at(-1)).toMatchObject({ external: { id: 'sig-1', signal: 'mail.answer.correct' } });
    expect(store.data?.reality?.cursor).toBe(1);
    expect(await e.receive(x(1))).toBe('duplicate');
    expect(e.session?.log.filter((l) => 'external' in l)).toHaveLength(1);
  });

  it('refuses a signal the game does not declare, and waits while the engine is busy', async () => {
    const e = await engine();
    expect(await e.receive(x(1, 'mail.admin.reset'))).toBe('unknown');
    let release!: () => void;
    const busy = e.run(() => new Promise<void>((r) => (release = r)));
    expect(await e.receive(x(1))).toBe('busy');
    release();
    await busy;
    expect(await e.receive(x(1))).toBe('applied');
  });

  it('out of order: the cursor waits for the gap, then compacts', async () => {
    const e = await engine();
    expect(await e.receive(x(2, 'mail.answer.wrong'))).toBe('applied');
    expect(e.state.reality).toEqual({ cursor: 0, applied: { 'sig-2': 2 } });
    expect(await e.receive(x(3, 'hook.bell'))).toBe('applied');
    expect(await e.receive(x(2, 'mail.answer.wrong'))).toBe('duplicate');
    expect(await e.receive(x(1))).toBe('applied');
    expect(e.state.reality).toEqual({ cursor: 3, applied: {} });
  });

  it('`once` (the default): a second correct answer, a new id, changes nothing; `once: false` repeats', async () => {
    const e = await engine();
    await e.receive(x(1));
    const before = structuredClone(e.state);
    expect(await e.receive(x(2, 'mail.answer.correct', 'sig-other'))).toBe('applied');
    // Only the link moved: the signal's effect, once per game, did not run again.
    expect({ ...e.state, reality: undefined }).toEqual({ ...before, reality: undefined });
    expect(e.state.reality?.cursor).toBe(2);
    await e.receive(x(3, 'hook.bell'));
    await e.receive(x(4, 'hook.bell'));
    expect(e.state.flags).toMatchObject({ rang_1: true, rang_2: true });
    expect(e.state.flags.rang_3).toBeUndefined();
  });

  it('a signal entry reads as a signal in the journal and the Studio', () => {
    expect(labelOf(signals(), { external: x(4, 'hook.bell') })).toBe('Signal hook.bell (#4)');
  });

  it('compact moves the cursor over contiguous sequences only', () => {
    const st = { cursor: 0, applied: { a: 1, b: 2, d: 4 } };
    compact(st);
    expect(st).toEqual({ cursor: 2, applied: { d: 4 } });
  });

  it('the first delivery binds the save to its player; a delivery for another player is a mismatch', async () => {
    const e = await engine();
    expect(await e.receive({ ...x(1), playerId: PLAYER })).toBe('applied');
    expect(e.state.reality).toEqual({ playerId: PLAYER, cursor: 1, applied: {} });
    // Another player's sequence 1 is neither "already applied" nor applied: the save is not that player's stream.
    expect(await e.receive({ ...x(1, 'mail.answer.wrong', 'other-1'), playerId: 'p-other' })).toBe('mismatch');
    expect(await e.receive({ ...x(2, 'mail.answer.wrong', 'other-2'), playerId: 'p-other' })).toBe('mismatch');
    expect(e.state.reality).toEqual({ playerId: PLAYER, cursor: 1, applied: {} });
    expect(e.state.flags.wrong_count).toBeUndefined();
    expect(e.session?.log.filter((l) => 'external' in l)).toHaveLength(1);
    // The solver's worlds name no player: they apply to any save, and bind none.
    expect(await e.receive(x(2, 'mail.answer.wrong'))).toBe('applied');
    expect(e.state.reality?.playerId).toBe(PLAYER);
  });

  it('a skipped delivery moves the cursor and emits nothing; beyond MAX_PENDING ids above the cursor, overflow', async () => {
    const e = await engine();
    // Signed by the Bridge, expired for good: recorded as skipped, its event never runs.
    expect(await e.receive({ ...x(1), skipped: 'expired' })).toBe('applied');
    expect(e.state.flags.vault_open).toBeUndefined();
    expect(e.state.reality).toEqual({ cursor: 1, applied: {} });
    // Sequence 2 never arrives: everything above waits as ids, up to a bound; then a delivery is refused, never dropped.
    for (let i = 0; i < MAX_PENDING; i++) expect(await e.receive(x(3 + i, 'hook.bell', `id-${i}`))).toBe('applied');
    expect(await e.receive(x(3 + MAX_PENDING, 'hook.bell', 'one-too-many'))).toBe('overflow');
    expect(Object.keys(e.state.reality!.applied)).toHaveLength(MAX_PENDING);
  });

  it('a save keeps the link and nothing else: no token, no payload', async () => {
    const e = await engine();
    await e.receive(x(1));
    await e.receive(x(3, 'hook.bell'));
    const env = JSON.parse(JSON.stringify(saveEnvelope(e.game, e.state)));
    expect(parseSave(e.game, env).reality).toEqual({ cursor: 1, applied: { 'sig-3': 3 } });
    expect(JSON.stringify(env)).not.toMatch(/dedupe|policy|token|@/);
    expect(() =>
      parseSave(e.game, { ...env, state: { ...env.state, reality: { cursor: -1, applied: {} } } }),
    ).toThrow();
  });

  it('a session with signals replays offline to the same state', async () => {
    const e = await engine();
    await e.receive(x(2, 'hook.bell'));
    await e.act({ verb: 'look', a: 'vault' });
    await e.receive(x(1));
    await e.act({ verb: 'use', a: 'vault' });
    const s = JSON.parse(JSON.stringify(e.session)) as Session;
    const r = await replay(signals(), signalsLayouts, s);
    expect(r.divergedAt).toBeUndefined();
    expect(r.ended).toBe(true);
    expect(stateDigest(r.state)).toBe(stateDigest(e.state));
    expect(JSON.stringify(s)).not.toMatch(/dedupe|policy|token/);
  });
});

/** A Bridge in memory: a queue of signed signals per sequence, redelivered from the cursor on every connect. */
async function fakeBridge() {
  const kp = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const key = await importBridgeKey(
    'k1',
    btoa(String.fromCharCode(...raw))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, ''),
  );
  const journal: string[] = [];
  const acks: number[] = [];
  const sign = async (sequence: number, signal: string, extra: Partial<WorldSignalV1> = {}, kid = 'k1') => {
    const p: WorldSignalV1 = {
      format: 'web-scumm-world-signal',
      schema: 1,
      id: `sig-${sequence}`,
      sequence,
      gameId: 'signals',
      playerId: PLAYER,
      signal,
      source: signal.split('.')[0]!,
      receivedAt: NOW,
      dedupeKey: `d-${sequence}`,
      policyVersion: '1',
      ...extra,
    };
    journal[sequence - 1] = await signSignal(p, kp.privateKey, kid);
  };
  const port = (extra: string[] = []): WorldSignalPort => ({
    async *connect({ after }) {
      for (const j of extra) yield j;
      for (let i = after; i < journal.length; i++) if (journal[i]) yield journal[i]!;
    },
    async acknowledge({ through }) {
      acks.push(through);
    },
    async close() {},
  });
  return { key, journal, acks, sign, port };
}

describe('the client: verify, apply, save, acknowledge', () => {
  it('acknowledges only after the save is durable, and through the contiguous cursor', async () => {
    const b = await fakeBridge();
    await b.sign(1, 'mail.answer.correct');
    await b.sign(2, 'hook.bell');
    const order: string[] = [];
    const store = new MemoryStore() as MemoryStore & { whenIdle(): Promise<void> };
    store.whenIdle = async () => void order.push(`saved ${store.data?.reality?.cursor}`);
    const e = await engine(store);
    const port = b.port();
    const ack = port.acknowledge.bind(port);
    port.acknowledge = async (a) => {
      order.push(`ack ${a.through}`);
      await ack(a);
    };
    await new RealityClient({ engine: e, store, port, keyring: [b.key], playerId: PLAYER, now: () => NOW }).run();
    expect(order).toEqual(['saved 1', 'ack 1', 'saved 2', 'ack 2']);
    expect(e.state.flags).toMatchObject({ vault_open: true, rang_1: true });
  });

  it('a tampered or foreign signal is refused and never acknowledged; an expired one is skipped and moves on', async () => {
    const b = await fakeBridge();
    await b.sign(1, 'mail.answer.wrong', { expiresAt: NOW - CLOCK_SKEW_MS - 1 });
    await b.sign(2, 'mail.answer.correct');
    const good = b.journal[1]!;
    const [h, p, s] = good.split('.') as [string, string, string];
    const tampered = `${h}.${p.slice(0, -3)}AAA.${s}`;
    const e = await engine();
    const refused: string[] = [];
    const c = new RealityClient({
      engine: e,
      store: new MemoryStore(),
      port: b.port([tampered]),
      keyring: [b.key],
      playerId: PLAYER,
      now: () => NOW,
      onRefused: (code) => refused.push(code),
    });
    await c.run();
    expect(refused).toEqual(['signature', 'expired']);
    expect(c.refused).toEqual({ signature: 1, expired: 1 });
    expect(e.state.reality).toEqual({ playerId: PLAYER, cursor: 2, applied: {} });
    expect(e.state.flags.wrong_count).toBeUndefined(); // the expired wrong answer ran nothing
    expect(
      e.session?.log
        .filter((l) => 'external' in l)
        .map((l) => ('external' in l ? (l.external.skipped ?? 'applied') : '')),
    ).toEqual(['expired', 'applied']);
    expect(e.state.flags.vault_open).toBe(true);
  });

  it('handle says what became of a delivery; the keys are asked for again only for a key the keyring lacks', async () => {
    const b = await fakeBridge();
    await b.sign(1, 'hook.bell', { evidenceHash: 'ab'.repeat(32) });
    await b.sign(2, 'mail.answer.wrong', { expiresAt: NOW - CLOCK_SKEW_MS - 1 });
    const good = b.journal[0]!;
    const [h, p, s] = good.split('.') as [string, string, string];
    const tampered = `${h}.${p.slice(0, -3)}AAA.${s}`;
    const e = await engine();
    let asked = 0;
    const c = new RealityClient({
      engine: e,
      store: new MemoryStore(),
      port: b.port(),
      keyring: [b.key],
      refreshKeys: async () => (asked++, [b.key]),
      playerId: PLAYER,
      now: () => NOW,
    });
    expect(await c.handle(tampered)).toBe('refused'); // a bad signature is not a key problem
    expect(asked).toBe(0);
    expect(await c.handle(good)).toBe('applied');
    expect(e.session?.log.at(-1)).toMatchObject({ external: { id: 'sig-1', evidenceHash: 'ab'.repeat(32) } });
    expect(await c.handle(good)).toBe('duplicate'); // acknowledged again: the Bridge may have missed the first
    expect(await c.handle(b.journal[1]!)).toBe('skipped');
    expect(b.acks).toEqual([1, 1, 2]);
    // A key the keyring does not hold: the keys are asked for once; still unknown, the signal is refused.
    const other = await fakeBridge();
    await other.sign(3, 'hook.bell', {}, 'k9');
    expect(await c.handle(other.journal[2]!)).toBe('refused');
    expect(asked).toBe(1);
    expect(b.acks).toEqual([1, 1, 2]);
    // Delivered out of order, the cursor does not move and nothing is acknowledged as 0.
    const e2 = await engine();
    const c2 = new RealityClient({
      engine: e2,
      store: new MemoryStore(),
      port: b.port(),
      keyring: [b.key],
      playerId: PLAYER,
      now: () => NOW,
    });
    await b.sign(4, 'hook.bell');
    expect(await c2.handle(b.journal[3]!)).toBe('applied');
    expect(e2.state.reality).toEqual({ playerId: PLAYER, cursor: 0, applied: { 'sig-4': 4 } });
    expect(b.acks).toEqual([1, 1, 2]);
    // Stopped before any game exists: run returns, acknowledges nothing.
    const e3 = new Engine(signals(), signalsLayouts, new FakePresenter(), new MemoryStore());
    const c3 = new RealityClient({
      engine: e3,
      store: new MemoryStore(),
      port: b.port(),
      keyring: [b.key],
      playerId: PLAYER,
      retryMs: 5,
    });
    const run = c3.run();
    await c3.stop();
    await run;
    expect(b.acks).toEqual([1, 1, 2]);
  });

  // The boundaries of the protocol: received, applied, saved, acknowledged. A crash at each, the game reloaded from
  // what was saved, the Bridge delivering again from its own record: the vault opens once, the bell rings once.
  it.each([
    'before applying',
    'after applying, before the save',
    'after the save, before the acknowledgement',
  ] as const)('a crash %s: delivered again, applied once', async (when) => {
    const b = await fakeBridge();
    await b.sign(1, 'hook.bell');
    const store = new MemoryStore() as MemoryStore & { whenIdle?(): Promise<void> };
    let durable: GameState | null = null;
    store.whenIdle = async () => {
      if (when === 'after applying, before the save') throw new Error('crash');
      durable = structuredClone(store.data);
      if (when === 'after the save, before the acknowledgement') throw new Error('crash');
    };
    const e = await engine(store);
    durable = structuredClone(store.data);
    const c = new RealityClient({
      engine: e,
      store,
      port: b.port(),
      keyring: [b.key],
      playerId: PLAYER,
      now: () => NOW,
    });
    if (when === 'before applying')
      e.receive = async () => {
        throw new Error('crash');
      };
    await expect(c.run()).rejects.toThrow('crash');
    expect(b.acks).toEqual([]);
    // The tab is gone; the game comes back from the last durable save, the Bridge has no acknowledgement.
    const store2 = new MemoryStore();
    const e2 = await engine(store2, structuredClone(durable!));
    await new RealityClient({
      engine: e2,
      store: store2,
      port: b.port(),
      keyring: [b.key],
      playerId: PLAYER,
      now: () => NOW,
    }).run();
    expect(e2.state.flags.rang_1).toBe(true);
    expect(e2.state.flags.rang_2).toBeUndefined();
    expect(b.acks).toEqual([1]);
  });

  it('a save bound to another player is neither acknowledged nor changed under this link, until it is relinked', async () => {
    const b = await fakeBridge();
    await b.sign(1, 'hook.bell');
    await b.sign(2, 'mail.answer.correct');
    // Player A's save, cursor 1, imported on a device linked as player B.
    const store = new MemoryStore();
    const a = await engine(store);
    expect(await a.receive({ ...x(1, 'hook.bell'), playerId: 'p-a' })).toBe('applied');
    const envelope = JSON.stringify(saveEnvelope(a.game, a.state));
    const savedA = () => parseSave(a.game, JSON.parse(envelope));
    const e = await engine(store, savedA());
    const mismatches: string[] = [];
    const client = () =>
      new RealityClient({
        engine: e,
        store,
        port: b.port(),
        keyring: [b.key],
        playerId: PLAYER,
        now: () => NOW,
        onMismatch: (p) => mismatches.push(p),
      });
    await client().run();
    expect(mismatches).toEqual(['p-a']);
    expect(b.acks).toEqual([]); // not even the cursor the save holds: it is A's, not B's
    expect(e.state.reality).toEqual({ playerId: 'p-a', cursor: 1, applied: {} });
    expect(e.state.flags.vault_open).toBeUndefined();
    // Relinked (the pause menu's choice): the link state starts over for B, as a loaded game.
    const s = JSON.parse(JSON.stringify(e.state)) as GameState;
    s.reality = { playerId: PLAYER, cursor: 0, applied: {} };
    await e.load(s);
    await client().run();
    expect(mismatches).toHaveLength(1);
    expect(b.acks).toEqual([1, 2]);
    expect(e.state.reality).toEqual({ playerId: PLAYER, cursor: 2, applied: {} });
    expect(e.state.flags.vault_open).toBe(true);
    // A's save loaded again while B's link is open: the next signal stops the link instead of being applied.
    await b.sign(3, 'mail.answer.wrong');
    await e.load(savedA());
    const late = client();
    await late.run();
    expect(mismatches).toEqual(['p-a', 'p-a']);
    expect(b.acks).toEqual([1, 2]);
  });

  it('a delivery repeated after the acknowledgement (the Bridge did not get it) is recognised', async () => {
    const b = await fakeBridge();
    await b.sign(1, 'hook.bell');
    const store = new MemoryStore();
    const e = await engine(store);
    const c = () =>
      new RealityClient({
        engine: e,
        store,
        port: b.port([b.journal[0]!]),
        keyring: [b.key],
        playerId: PLAYER,
        now: () => NOW,
      });
    await c().run();
    await c().run();
    expect(e.state.flags.rang_2).toBeUndefined();
    expect(e.session?.log.filter((l) => 'external' in l)).toHaveLength(1);
  });
});

describe('the golden saves of games/signals', () => {
  it.each([
    ['4.1.1', {}],
    ['4.1.2', { playerId: 'p-golden' }], // bound to its player since 4.1.2
  ])(
    '%s keeps its link state, and its remaining inputs (a signal, then the gate) reach the ending offline',
    async (version, link) => {
      const { readFileSync } = await import('node:fs');
      const { game, layouts } = await import('../games/signals');
      const golden = JSON.parse(readFileSync(`tests/fixtures/saves/signals-${version}.json`, 'utf8'));
      const state = parseSave(game, golden.envelope);
      expect(state.reality).toEqual({ ...link, cursor: 1, applied: { 's-3': 3 } });
      const r = await replay(game, layouts, { start: { kind: 'load' }, base: state, log: golden.remaining });
      expect(r.divergedAt).toBeUndefined();
      expect(r.ended).toBe(true);
      expect(r.state.reality).toEqual({ ...link, cursor: 3, applied: {} });
    },
  );
});
