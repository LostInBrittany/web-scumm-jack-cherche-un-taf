// The client's edges (4.1.1, src/engine/reality/client.ts): what it does with each verdict of the engine, when it is
// stopped while waiting, and what it hands to `onApplied`; and two boundaries of the protocol. Each test names the
// mutant of the reality mutation set (tools/mutate.ts) that survived without it.
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore, type WorldSignalPort } from '@engine/core/ports';
import type { ReceiveResult } from '@engine/core/reality-runtime';
import type { ExternalEntry, GameState } from '@engine/core/types';
import {
  CLOCK_SKEW_MS,
  importBridgeKey,
  MAX_SIGNAL_CHARS,
  signSignal,
  verifySignal,
  type WorldSignalV1,
} from '@engine/reality/protocol';
import { RealityClient } from '@engine/reality/client';
import { signals, signalsLayouts } from './fixtures/signals';

const NOW = Date.UTC(2026, 9, 6, 12);
const PLAYER = 'p-7f3a';
const MANIFEST = new Set(['mail.answer.correct', 'mail.answer.wrong', 'hook.bell']);
const sleep = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

async function engine(store = new MemoryStore(), saved?: GameState) {
  const e = new Engine(signals(), signalsLayouts, new FakePresenter(), store);
  e.digestOn = true;
  if (saved) await e.load(saved);
  else await e.newGame();
  return e;
}

/** A Bridge in memory: signed signals per sequence, redelivered from the cursor on every connect; counts `close()`. */
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
  let closed = 0;
  const payload = (sequence: number, signal: string, extra: Partial<WorldSignalV1> = {}): WorldSignalV1 => ({
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
  });
  const sign = async (sequence: number, signal: string, extra: Partial<WorldSignalV1> = {}) => {
    journal[sequence - 1] = await signSignal(payload(sequence, signal, extra), kp.privateKey, 'k1');
  };
  /** Signs anything, as a Bridge whose payload went wrong would. */
  const signRaw = (p: unknown) => signSignal(p as WorldSignalV1, kp.privateKey, 'k1');
  // The port ignores the abort signal on purpose: a real stream may still yield what it buffered before the abort,
  // and the client's own `stopped` check is what keeps those out of the engine.
  const port = (extra: string[] = []): WorldSignalPort => ({
    async *connect({ after }) {
      for (const j of extra) yield j;
      for (let i = after; i < journal.length; i++) if (journal[i]) yield journal[i]!;
    },
    async acknowledge({ through }) {
      acks.push(through);
    },
    async close() {
      closed++;
    },
  });
  return { key, journal, acks, sign, signRaw, payload, port, closed: () => closed };
}

describe('the protocol at its boundaries', () => {
  it('a signal of exactly MAX_SIGNAL_CHARS is read, one character more is refused for its size', async () => {
    const b = await fakeBridge();
    const expectation = { gameId: 'signals', playerId: PLAYER, signals: MANIFEST, now: NOW };
    // kills protocol.ts:118 operator `>` → `>=`: at the limit the signal is still looked at (and refused for its shape)
    const atLimit = await verifySignal('a'.repeat(MAX_SIGNAL_CHARS), [b.key], expectation);
    expect(atLimit).toMatchObject({ ok: false, code: 'shape' });
    const over = await verifySignal('a'.repeat(MAX_SIGNAL_CHARS + 1), [b.key], expectation);
    expect(over).toMatchObject({ ok: false, code: 'size', reason: `larger than ${MAX_SIGNAL_CHARS} characters` });
  });

  it('a payload refusal names the field at fault, or `shape` when the payload is not an object', async () => {
    const b = await fakeBridge();
    const expectation = { gameId: 'signals', playerId: PLAYER, signals: MANIFEST, now: NOW };
    // kills protocol.ts:160 operator `||` → `&&`: with a path, the reason names the field, not `shape`
    const badField = await verifySignal(
      await b.signRaw({ ...b.payload(1, 'hook.bell'), evidenceHash: 'not-a-sha256' }),
      [b.key],
      expectation,
    );
    expect(badField).toEqual({ ok: false, code: 'payload', reason: 'not a world signal: evidenceHash' });
    // kills protocol.ts:160 too: with no path (the payload itself is wrong), `shape` is written, not an empty string
    const notAnObject = await verifySignal(await b.signRaw('hello'), [b.key], expectation);
    expect(notAnObject).toEqual({ ok: false, code: 'payload', reason: 'not a world signal: shape' });
  });
});

describe('the client, stopped or waiting', () => {
  it('waits for a game to exist before anything, then applies what the port delivers', async () => {
    // kills client.ts:55 negation `!this.stopped` → `this.stopped`: an unstopped link with no game yet must wait, not
    // run on (there is no state to check the player against, nothing to acknowledge).
    const b = await fakeBridge();
    await b.sign(1, 'hook.bell');
    const store = new MemoryStore();
    const e = new Engine(signals(), signalsLayouts, new FakePresenter(), store);
    const c = new RealityClient({
      engine: e,
      store,
      port: b.port(),
      keyring: [b.key],
      playerId: PLAYER,
      retryMs: 5,
      now: () => NOW,
    });
    const run = c.run();
    await sleep(25);
    expect(b.acks).toEqual([]);
    await e.newGame();
    await run;
    expect(e.state.flags.rang_1).toBe(true);
    expect(b.acks).toEqual([1]);
  });

  it('stopped while a signal was being handled: what the port still yields is not handed to the engine', async () => {
    // kills client.ts:84 condition `this.stopped` → `false`: the second delivery arrives after `stop()`
    const b = await fakeBridge();
    await b.sign(1, 'hook.bell');
    await b.sign(2, 'mail.answer.correct');
    const store = new MemoryStore();
    const e = await engine(store);
    const c = new RealityClient({
      engine: e,
      store,
      port: b.port(),
      keyring: [b.key],
      playerId: PLAYER,
      now: () => NOW,
      onApplied: () => {
        void c.stop();
      },
    });
    await c.run();
    expect(e.state.flags.rang_1).toBe(true);
    expect(e.state.flags.vault_open).toBeUndefined();
    expect(b.acks).toEqual([1]);
    expect(b.closed()).toBe(1);
  });

  it('waits while the engine is busy, then applies; stopped meanwhile, the delivery is refused, not acknowledged', async () => {
    const b = await fakeBridge();
    await b.sign(1, 'hook.bell');
    await b.sign(2, 'hook.bell');
    const store = new MemoryStore();
    const e = await engine(store);
    const c = new RealityClient({
      engine: e,
      store,
      port: b.port(),
      keyring: [b.key],
      playerId: PLAYER,
      retryMs: 5,
      now: () => NOW,
    });
    // kills client.ts:134 negation `!this.stopped` → `this.stopped`: not stopped, the client tries again until the
    // engine is free (the mutant gives up at the first `busy`)
    let release!: () => void;
    let busy = e.run(() => new Promise<void>((r) => (release = r)));
    const handled = c.handle(b.journal[0]!);
    await sleep(20);
    release();
    await busy;
    expect(await handled).toBe('applied');
    expect(b.acks).toEqual([1]);
    // kills client.ts:144 condition → `false` and the second `||` → `&&`: stopped while the engine is busy, the last
    // verdict is `busy`, and a busy verdict is refused (the mutants acknowledge it as a duplicate)
    busy = e.run(() => new Promise<void>((r) => (release = r)));
    await c.stop();
    const freed = sleep(30).then(release); // the mutant of line 134 would otherwise retry forever
    expect(await c.handle(b.journal[1]!)).toBe('refused');
    await freed;
    await busy;
    expect(b.acks).toEqual([1]);
    expect(e.state.flags.rang_2).toBeUndefined();
  });
});

describe("the client and the engine's verdicts", () => {
  it('`unknown` and `overflow` are refused: nothing acknowledged, nothing applied', async () => {
    const b = await fakeBridge();
    await b.sign(1, 'hook.bell');
    await b.sign(2, 'hook.bell');
    const store = new MemoryStore();
    const e = await engine(store);
    const applied: string[] = [];
    const c = new RealityClient({
      engine: e,
      store,
      port: b.port(),
      keyring: [b.key],
      playerId: PLAYER,
      now: () => NOW,
      onApplied: (x) => applied.push(x.id),
    });
    expect(await c.handle(b.journal[0]!)).toBe('applied');
    expect(b.acks).toEqual([1]);
    // From here the engine's verdict is forced: the client's manifest is the engine's, so a verified signal is never
    // `unknown` to a real engine, and `overflow` needs MAX_PENDING deliveries out of order.
    for (const verdict of ['unknown', 'overflow'] as const) {
      // kills client.ts:144 condition → `false` and both `||` → `&&` (the first with `unknown`, the second with
      // `overflow`): the mutants fall through, acknowledge the cursor again and answer `duplicate`
      e.receive = async (): Promise<ReceiveResult> => verdict;
      expect(await c.handle(b.journal[1]!), verdict).toBe('refused');
    }
    expect(b.acks).toEqual([1]);
    expect(applied).toEqual(['sig-1']);
  });

  it('`mismatch` from the engine stops the link: the port is closed, the save untouched', async () => {
    // kills client.ts:138 condition `r === 'mismatch'` → `false`: without the branch the player is still reported
    // (line 147) but the link stays open
    const b = await fakeBridge();
    await b.sign(1, 'hook.bell');
    const store = new MemoryStore();
    const e = await engine(store);
    const bound = structuredClone(e.state);
    bound.reality = { playerId: 'p-a', cursor: 0, applied: {} };
    await e.load(bound);
    const mismatches: string[] = [];
    const c = new RealityClient({
      engine: e,
      store,
      port: b.port(),
      keyring: [b.key],
      playerId: PLAYER,
      now: () => NOW,
      onMismatch: (p) => mismatches.push(p),
    });
    expect(await c.handle(b.journal[0]!)).toBe('refused');
    expect(mismatches).toEqual(['p-a']);
    expect(b.closed()).toBe(1);
    expect(b.acks).toEqual([]);
    expect(e.state.reality).toEqual({ playerId: 'p-a', cursor: 0, applied: {} });
    expect(e.state.flags.rang_1).toBeUndefined();
  });

  it("another player's save loaded while the save was being written: refused, not acknowledged", async () => {
    // kills client.ts:147 condition `this.mismatch()` → `false`: the check between the durable save and the
    // acknowledgement is the one that sees a save swapped under the link
    const b = await fakeBridge();
    await b.sign(1, 'hook.bell');
    const store = new MemoryStore() as MemoryStore & { whenIdle?(): Promise<void> };
    const e = await engine(store);
    const other = structuredClone(e.state);
    other.reality = { playerId: 'p-a', cursor: 1, applied: {} };
    store.whenIdle = async () => {
      store.whenIdle = undefined;
      await e.load(other);
    };
    const mismatches: string[] = [];
    const applied: string[] = [];
    const c = new RealityClient({
      engine: e,
      store,
      port: b.port(),
      keyring: [b.key],
      playerId: PLAYER,
      now: () => NOW,
      onMismatch: (p) => mismatches.push(p),
      onApplied: (x) => applied.push(x.id),
    });
    expect(await c.handle(b.journal[0]!)).toBe('refused');
    expect(mismatches).toEqual(['p-a']);
    expect(b.acks).toEqual([]);
    expect(applied).toEqual([]);
  });

  it('onApplied: once per delivery applied, with the entry as recorded; never for a duplicate', async () => {
    const b = await fakeBridge();
    await b.sign(1, 'hook.bell');
    await b.sign(2, 'hook.bell', { evidenceHash: 'ab'.repeat(32) });
    const store = new MemoryStore();
    const e = await engine(store);
    const applied: ExternalEntry[] = [];
    const c = new RealityClient({
      engine: e,
      store,
      port: b.port(),
      keyring: [b.key],
      playerId: PLAYER,
      now: () => NOW,
      onApplied: (x) => applied.push(x),
    });
    // kills client.ts:150 condition `r === 'applied'` → `false` and `===` → `!==`: applied, it is reported
    expect(await c.handle(b.journal[0]!)).toBe('applied');
    expect(applied).toHaveLength(1);
    // kills client.ts:114 condition `s.evidenceHash` → `true`: a signal without evidence hash gives an entry without
    // the key, not a key holding undefined (the entry is what the session records and what `onApplied` gets)
    expect(applied[0]).toStrictEqual({
      id: 'sig-1',
      sequence: 1,
      signal: 'hook.bell',
      source: 'hook',
      receivedAt: NOW,
      playerId: PLAYER,
    });
    expect(Object.hasOwn(applied[0]!, 'evidenceHash')).toBe(false);
    // kills client.ts:150 condition → `true` and `===` → `!==`: a duplicate is acknowledged again but not reported
    expect(await c.handle(b.journal[0]!)).toBe('duplicate');
    expect(applied).toHaveLength(1);
    expect(await c.handle(b.journal[1]!)).toBe('applied');
    expect(applied.map((x) => x.id)).toEqual(['sig-1', 'sig-2']);
    expect(applied[1]!.evidenceHash).toBe('ab'.repeat(32));
    expect(b.acks).toEqual([1, 1, 2]);
  });

  it('a refusal the Bridge did sign for good is skipped, counted, and reported with its code', async () => {
    // Not a survivor's test: pins the FINAL table and the counters the other tests lean on.
    const b = await fakeBridge();
    await b.sign(1, 'mail.answer.wrong', { expiresAt: NOW - CLOCK_SKEW_MS - 1 });
    const store = new MemoryStore();
    const e = await engine(store);
    const refused: [string, string][] = [];
    const c = new RealityClient({
      engine: e,
      store,
      port: b.port(),
      keyring: [b.key],
      playerId: PLAYER,
      now: () => NOW,
      onRefused: (code, reason) => refused.push([code, reason]),
    });
    expect(await c.handle(b.journal[0]!)).toBe('skipped');
    expect(refused).toEqual([['expired', 'expired']]);
    expect(c.refused).toEqual({ expired: 1 });
    expect(e.state.reality).toEqual({ playerId: PLAYER, cursor: 1, applied: {} });
    expect(e.state.flags.wrong_count).toBeUndefined();
    expect(b.acks).toEqual([1]);
  });
});

describe("the client's V2 context (4.1.10)", () => {
  /** Hands each signal to a client built as in a page of `origin` (none: Node), with `context`; the refusal codes. */
  async function verdicts(
    o: { origin?: string; context?: { sessionId?: string } },
    make: (b: Awaited<ReturnType<typeof fakeBridge>>) => Promise<string[]>,
  ) {
    const b = await fakeBridge();
    const jws = await make(b);
    const refused: string[] = [];
    const g = globalThis as { location?: unknown };
    const had = 'location' in g;
    const before = g.location;
    if (o.origin !== undefined) g.location = { origin: o.origin };
    try {
      const e = await engine();
      const client = new RealityClient({
        engine: e,
        store: e.store,
        port: b.port(),
        keyring: [b.key],
        playerId: PLAYER,
        now: () => NOW,
        onRefused: (code) => void refused.push(code),
        ...(o.context ? { context: o.context } : {}),
      });
      const out: string[] = [];
      for (const j of jws) out.push(await client.handle(j));
      return { out, refused };
    } finally {
      if (had) g.location = before;
      else delete g.location;
    }
  }
  const v2 = (
    b: Awaited<ReturnType<typeof fakeBridge>>,
    sequence: number,
    o: { audience: string; sessionId?: string },
  ) =>
    b.signRaw({
      ...b.payload(sequence, 'hook.bell'),
      schema: 2,
      tenantId: 't-1',
      environment: 'prod',
      sessionId: o.sessionId ?? 's-1',
      keyId: 'k1',
      audience: o.audience,
    });

  it("checks the page's origin by default", async () => {
    const r = await verdicts({ origin: 'https://game.example' }, async (b) => [
      await v2(b, 1, { audience: 'https://game.example' }),
      await v2(b, 2, { audience: 'https://other.example' }),
    ]);
    expect(r).toEqual({ out: ['applied', 'refused'], refused: ['audience-mismatch'] });
  });

  it('an opaque origin ("null") is not an expectation', async () => {
    const r = await verdicts({ origin: 'null' }, async (b) => [
      await v2(b, 1, { audience: 'https://anything.example' }),
    ]);
    expect(r).toEqual({ out: ['applied'], refused: [] });
  });

  it("takes the link's session from its context", async () => {
    const r = await verdicts({ context: { sessionId: 's-1' } }, async (b) => [
      await v2(b, 1, { audience: 'x', sessionId: 's-1' }),
      await v2(b, 2, { audience: 'x', sessionId: 's-0' }),
    ]);
    expect(r).toEqual({ out: ['applied', 'refused'], refused: ['audience-mismatch'] });
  });
});

// Killed mutant (4.3.0 reread of the exemptions): the payload of a refusal recorded as skipped is read with the right
// base64 padding whatever its length; `(4 + n % 4) % 4` would pad three `=`, which atob refuses.
describe('a skipped refusal, whatever the length of its payload', () => {
  it('reads the payload at every length modulo 4', async () => {
    const b = await fakeBridge();
    const lengths = new Set<number>();
    for (let i = 0; i < 4; i++) {
      await b.sign(i + 1, 'mail.answer.wrong', { expiresAt: NOW - CLOCK_SKEW_MS - 1, dedupeKey: `d-${'x'.repeat(i)}` });
      lengths.add(b.journal[i]!.split('.')[1]!.length % 4);
    }
    expect(lengths).toContain(3);
    const store = new MemoryStore();
    const e = await engine(store);
    const c = new RealityClient({
      engine: e,
      store,
      port: b.port(),
      keyring: [b.key],
      playerId: PLAYER,
      now: () => NOW,
    });
    for (const j of b.journal) expect(await c.handle(j)).toBe('skipped');
    expect(e.state.reality?.cursor).toBe(4);
  });
});
