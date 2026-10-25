// The reference Bridge (4.1.1, bridge/src/), over real HTTP on a free port: pairing, signals proposed under a
// Biscuit or by a signed webhook, deduplication, the fetch by cursor and SSE, acknowledgements, revocation, quotas,
// sizes, export and deletion by player, a restart on its journal, and a log with no secret.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import { manifestHash, realityManifest } from '@engine/reality/manifest';
import { importBridgeKey } from '@engine/reality/protocol';
import { RealityClient } from '@engine/reality/client';
import { httpPort, sseEvents } from '@engine/reality/http-port';
import { Bridge, type BridgeConfig, type BridgeLog } from '../bridge/src/bridge';
import { biscuitLib } from '../bridge/src/biscuit';
import { grantToken } from '../bridge/src/policy';
import { bridgeServer, type ServeOptions, webhookSignature } from '../bridge/src/server';
import {
  inspectJournal,
  JournalLock,
  JsonlBridgeStore,
  MemoryBridgeStore,
  type BridgeStore,
} from '../bridge/src/store';
import { signals, signalsLayouts } from './fixtures/signals';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { signSignalSync } from '../bridge/src/sign';

// The re-sign cache's hits are counted by the signatures made (4.4.0): the JWS of a hit and of a miss are the same
// bytes (Ed25519 is deterministic), so only the calls tell a hit from a signature made again.
vi.mock('../bridge/src/sign', async (orig) => {
  const m = await orig<typeof import('../bridge/src/sign')>();
  return { ...m, signSignalSync: vi.fn(m.signSignalSync) };
});

const temps: string[] = [];
const servers: { close(): void }[] = [];
afterAll(() => {
  for (const s of servers) s.close();
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

async function setup(
  o: {
    store?: BridgeStore;
    limits?: BridgeConfig['limits'];
    now?: () => number;
    /** The event key's id (a rotation: a second Bridge on the same store with another key). */
    kid?: string;
    previousKeys?: BridgeConfig['previousKeys'];
    serve?: Partial<ServeOptions>;
  } = {},
) {
  const b = await biscuitLib();
  const root = new b.KeyPair(b.SignatureAlgorithm.Ed25519);
  const ev = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = Buffer.from(await crypto.subtle.exportKey('raw', ev.publicKey)).toString('base64url');
  const manifest = realityManifest(signals())!;
  const admin = 'operator-secret-token';
  const logs: BridgeLog[] = [];
  const config: BridgeConfig = {
    gameId: 'signals',
    manifest,
    manifestHash: await manifestHash(manifest),
    audience: 'bridge.test',
    biscuitRootPublicKey: root.getPublicKey().toString(),
    eventKey: { kid: o.kid ?? 'k1', privateKey: ev.privateKey, raw },
    ...(o.previousKeys ? { previousKeys: o.previousKeys } : {}),
    adminTokenHash: createHash('sha256').update(admin).digest('hex'),
    policyVersion: '1',
    ...(o.limits ? { limits: o.limits } : {}),
  };
  const bridge = await Bridge.start(config, o.store ?? new MemoryBridgeStore(), {
    log: (l) => logs.push(l),
    ...(o.now ? { now: o.now } : {}),
  });
  const mail = await grantToken(root.getPrivateKey().toString(), {
    connector: 'mail-1',
    gameId: 'signals',
    sources: ['mail'],
    signals: ['mail.answer.correct', 'mail.answer.wrong'],
    players: 'any',
    audience: 'bridge.test',
    pair: true,
    expiresAt: Date.now() + 3_600_000,
  });
  const hookSecret = 'hook-secret';
  const hookToken = await grantToken(root.getPrivateKey().toString(), {
    connector: 'hook',
    gameId: 'signals',
    sources: ['webhook'],
    signals: ['hook.bell'],
    players: 'any',
    audience: 'bridge.test',
    expiresAt: Date.now() + 3_600_000,
  });
  const server = bridgeServer(bridge, {
    origins: ['http://game.test'],
    webhooks: { webhook: { secret: hookSecret, token: hookToken, source: 'webhook', map: { bell: 'hook.bell' } } },
    ...o.serve,
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  servers.push(server);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  const call = (path: string, init: RequestInit & { token?: string } = {}) =>
    fetch(new URL(path, url), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...(init.headers as Record<string, string>),
      },
    });
  const pair = async () => {
    const { code } = (await (
      await call('v1/pairings', { method: 'POST', body: JSON.stringify({ gameId: 'signals' }) })
    ).json()) as { code: string };
    expect(await (await call(`v1/pairings/${code}`)).json()).toEqual({ status: 'pending' });
    expect((await call(`v1/pairings/${code}/confirm`, { method: 'POST', token: mail })).status).toBe(200);
    return (await (await call(`v1/pairings/${code}`)).json()) as {
      status: string;
      playerId: string;
      capability: string;
    };
  };
  const propose = (playerId: string, signal: string, dedupeKey: string, token = mail) =>
    call('v1/signals', {
      method: 'POST',
      token,
      body: JSON.stringify({
        playerId,
        signal,
        source: signal.split('.')[0] === 'hook' ? 'webhook' : 'mail',
        dedupeKey,
      }),
    });
  return {
    bridge,
    url,
    call,
    pair,
    propose,
    mail,
    admin,
    logs,
    hookSecret,
    raw,
    rootPub: root.getPublicKey().toString(),
  };
}

describe('the reference Bridge', () => {
  it('pairs a game, accepts a signal once, delivers it by cursor, takes the acknowledgement', async () => {
    const t = await setup();
    const link = await t.pair();
    expect(link.status).toBe('paired');
    expect(link.playerId).toMatch(/^p-[a-f0-9]{16}$/);
    // The capability is handed over once.
    expect((await t.call(`v1/pairings/${'X'.repeat(8)}`)).status).toBe(404);
    const first = await t.propose(link.playerId, 'mail.answer.correct', 'mail:42');
    expect(first.status).toBe(202);
    const again = await t.propose(link.playerId, 'mail.answer.correct', 'mail:42');
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ sequence: 1, duplicate: true });
    const got = (await (await t.call('v1/signals?after=0', { token: link.capability })).json()) as {
      signals: string[];
    };
    expect(got.signals).toHaveLength(1);
    expect(
      (await t.call('v1/ack', { method: 'POST', token: link.capability, body: JSON.stringify({ through: 1 }) })).status,
    ).toBe(204);
    expect(
      (await t.call('v1/ack', { method: 'POST', token: link.capability, body: JSON.stringify({ through: 9 }) })).status,
    ).toBe(400);
    expect((await t.call('v1/signals?after=0', { token: 'not-a-capability' })).status).toBe(401);
  });

  it('refuses what the manifest or the token does not allow', async () => {
    const t = await setup();
    const link = await t.pair();
    expect((await t.propose(link.playerId, 'mail.admin.reset', 'x')).status).toBe(422);
    expect((await t.propose(link.playerId, 'hook.bell', 'x')).status).toBe(403); // the mail token has no hook.bell
    expect((await t.propose('p-0000000000000000', 'mail.answer.correct', 'x')).status).toBe(404);
    expect((await t.propose(link.playerId, 'mail.answer.correct', 'x', 'garbage')).status).toBe(401);
    expect(t.logs.filter((l) => l.event === 'signal.refused').length).toBeGreaterThan(0);
  });

  it('turns a signed webhook into its signal, once per delivery id; a bad signature is refused', async () => {
    const t = await setup();
    const link = await t.pair();
    const body = JSON.stringify({ playerId: link.playerId, event: 'bell', id: 'delivery-1' });
    const hook = (b: string, sig = webhookSignature(t.hookSecret, b)) =>
      t.call('v1/hooks/webhook', { method: 'POST', body: b, headers: { 'X-Web-Scumm-Signature': sig } });
    expect((await hook(body)).status).toBe(202);
    expect((await hook(body)).status).toBe(200);
    expect((await hook(body, webhookSignature('wrong', body))).status).toBe(401);
    expect((await hook(JSON.stringify({ playerId: link.playerId, event: 'shutdown', id: 'd2' }))).status).toBe(422);
  });

  it('a game plays through the Bridge: SSE and poll give the same signals, applied once, acknowledged', async () => {
    const t = await setup();
    const link = await t.pair();
    await t.propose(link.playerId, 'mail.answer.correct', 'mail:1');
    await t.propose(link.playerId, 'mail.answer.wrong', 'mail:2');
    const keys = await Promise.all(
      ((await (await t.call('v1/keys')).json()) as { keys: { kid: string; raw: string }[] }).keys.map((k) =>
        importBridgeKey(k.kid, k.raw),
      ),
    );
    for (const mode of ['sse', 'poll'] as const) {
      const e = new Engine(signals(), signalsLayouts, new FakePresenter(), new MemoryStore());
      await e.newGame();
      const port = httpPort({ url: t.url, capability: link.capability, mode, retryMs: 20 });
      const c = new RealityClient({
        engine: e,
        store: new MemoryStore(),
        port,
        keyring: keys,
        playerId: link.playerId,
      });
      const run = c.run();
      for (let i = 0; i < 100 && (e.state.reality?.cursor ?? 0) < 2; i++) await new Promise((r) => setTimeout(r, 20));
      await c.stop();
      await run;
      expect(e.state.reality?.cursor, mode).toBe(2);
      expect(e.state.flags.vault_open, mode).toBe(true);
    }
    expect((await t.bridge.exportPlayer(t.admin, link.playerId)).acked).toBe(2);
  });

  it('the operator revokes a player and a token, exports and deletes what the Bridge holds', async () => {
    const t = await setup();
    const link = await t.pair();
    await t.propose(link.playerId, 'mail.answer.correct', 'mail:1');
    const exp = (await (await t.call(`v1/admin/players/${link.playerId}`, { token: t.admin })).json()) as Record<
      string,
      unknown
    >;
    expect(JSON.stringify(exp)).not.toMatch(/capabilityHash/);
    expect(JSON.stringify(exp)).not.toContain(link.capability);
    expect((exp.signals as unknown[]).length).toBe(1);
    expect((await t.call(`v1/admin/players/${link.playerId}`, { token: 'nope' })).status).toBe(401);
    const b = await biscuitLib();
    const tok = b.Biscuit.fromBase64(
      t.mail,
      b.PublicKey.fromString(t.rootPub.replace(/^ed25519\//, ''), b.SignatureAlgorithm.Ed25519),
    );
    const tokenId = (tok.getRevocationIdentifiers() as string[])[0]!;
    expect(
      (await t.call('v1/admin/revoke', { method: 'POST', token: t.admin, body: JSON.stringify({ tokenId }) })).status,
    ).toBe(204);
    expect((await t.propose(link.playerId, 'mail.answer.wrong', 'mail:2')).status).toBe(401);
    expect(
      (
        await t.call('v1/admin/revoke', {
          method: 'POST',
          token: t.admin,
          body: JSON.stringify({ playerId: link.playerId }),
        })
      ).status,
    ).toBe(204);
    expect((await t.call('v1/signals?after=0', { token: link.capability })).status).toBe(401);
    expect((await t.call(`v1/admin/players/${link.playerId}`, { method: 'DELETE', token: t.admin })).status).toBe(204);
    expect((await t.call(`v1/admin/players/${link.playerId}`, { token: t.admin })).status).toBe(404);
  });

  it('holds its limits: body size, a quota per connector, signals waiting per player', async () => {
    const t = await setup({ limits: { perMinutePerConnector: 3, pendingPerPlayer: 2 } });
    const link = await t.pair();
    expect((await t.call('v1/signals', { method: 'POST', token: t.mail, body: 'x'.repeat(9000) })).status).toBe(413);
    expect((await t.propose(link.playerId, 'mail.answer.correct', 'a')).status).toBe(202);
    expect((await t.propose(link.playerId, 'mail.answer.wrong', 'b')).status).toBe(202);
    expect((await t.propose(link.playerId, 'mail.answer.wrong', 'c')).status).toBe(429); // two waiting
    await t.call('v1/ack', { method: 'POST', token: link.capability, body: JSON.stringify({ through: 2 }) });
    expect((await t.propose(link.playerId, 'mail.answer.wrong', 'd')).status).toBe(202);
    expect((await t.propose(link.playerId, 'mail.answer.wrong', 'e')).status).toBe(429); // three this minute
  });

  it('sequences concurrent proposals one by one: no shared sequence, one acceptance per dedupeKey', async () => {
    // 4.1.1 awaited the Biscuit check and the signature between reading the last sequence and writing the journal:
    // concurrent proposals all took sequence 1, and the player's client then skipped them as already seen.
    const t = await setup();
    const link = await t.pair();
    const body = (dedupeKey: string) => ({
      playerId: link.playerId,
      signal: 'mail.answer.wrong',
      source: 'mail',
      dedupeKey,
    });
    const distinct = await Promise.all(Array.from({ length: 100 }, (_, i) => t.bridge.propose(t.mail, body(`m:${i}`))));
    expect(distinct.every((r) => !r.duplicate)).toBe(true);
    expect(new Set(distinct.map((r) => r.sequence)).size).toBe(100);
    expect((await t.bridge.signals(link.capability, 0)).map((s) => s.sequence)).toEqual(
      Array.from({ length: 100 }, (_, i) => i + 1),
    );
    const same = await Promise.all(Array.from({ length: 50 }, () => t.bridge.propose(t.mail, body('once'))));
    expect(same.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(new Set(same.map((r) => r.id)).size).toBe(1);
    expect(await t.bridge.signals(link.capability, 100)).toHaveLength(1);
  });

  it('a proposal that overlaps a revocation is refused; a code confirmed twice at once is confirmed once', async () => {
    const t = await setup();
    const link = await t.pair();
    const inFlight = t.bridge.propose(t.mail, {
      playerId: link.playerId,
      signal: 'mail.answer.correct',
      source: 'mail',
      dedupeKey: 'late',
    });
    await t.bridge.revoke(t.admin, { playerId: link.playerId }); // lands while the proposal awaits its Biscuit check
    await expect(inFlight).rejects.toMatchObject({ status: 404 });
    expect((await t.bridge.exportPlayer(t.admin, link.playerId)).signals).toHaveLength(0);
    const { code } = await t.bridge.startPairing('signals');
    const both = await Promise.allSettled([
      t.bridge.confirmPairing(t.mail, code),
      t.bridge.confirmPairing(t.mail, code),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = both.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409 });
    const claimed = await t.bridge.claimPairing(code);
    expect(claimed.status).toBe('paired');
    const confirmed = both.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ playerId: string }>;
    expect(claimed.status === 'paired' && claimed.playerId).toBe(confirmed.value.playerId);
  });

  it('the fetch by cursor names each sequence; a stream holds what is proposed while it opens; streams are bounded', async () => {
    const t = await setup({ limits: { streamsPerPlayer: 1 } });
    const link = await t.pair();
    await t.propose(link.playerId, 'mail.answer.correct', 'mail:1');
    await t.propose(link.playerId, 'mail.answer.wrong', 'mail:2');
    const got = (await (await t.call('v1/signals?after=1', { token: link.capability })).json()) as {
      signals: string[];
      sequences: number[];
    };
    expect(got.signals).toHaveLength(1);
    expect(got.sequences).toEqual([2]);
    // A stream opened and a signal proposed at once: the stream gets the backlog, then the new one, in order.
    const stream = t.call('v1/events?after=0', { token: link.capability, headers: { Accept: 'text/event-stream' } });
    await t.propose(link.playerId, 'mail.answer.wrong', 'mail:3');
    const res = await stream;
    expect(res.status).toBe(200);
    const seen: number[] = [];
    const events = sseEvents(res.body!);
    while (seen.length < 3) seen.push(Number((await events.next()).value?.id));
    expect(seen).toEqual([1, 2, 3]);
    // A second stream for the same player, over the limit.
    expect(
      (await t.call('v1/events?after=0', { token: link.capability, headers: { Accept: 'text/event-stream' } })).status,
    ).toBe(429);
    // Revoked: the Bridge ends the open stream itself.
    await t.call('v1/admin/revoke', {
      method: 'POST',
      token: t.admin,
      body: JSON.stringify({ playerId: link.playerId }),
    });
    let ended = false;
    for (let i = 0; i < 50 && !ended; i++) ended = (await events.next()).done === true;
    expect(ended).toBe(true);
  });

  it('a rotation: what waits is delivered under the new key; a link whose keyring is older asks for the keys once', async () => {
    const store = new MemoryBridgeStore();
    const before = await setup({ store });
    const link = await before.pair();
    await before.propose(link.playerId, 'mail.answer.correct', 'mail:1');
    const oldKeys = await Promise.all(
      ((await (await before.call('v1/keys')).json()) as { keys: { kid: string; raw: string }[] }).keys.map((k) =>
        importBridgeKey(k.kid, k.raw),
      ),
    );
    // The operator rotates: a new key, the previous one listed until its end (already past: the player was away).
    const after = await setup({
      store,
      kid: 'k2',
      previousKeys: [{ kid: 'k1', raw: before.raw, notAfter: Date.now() - 24 * 3_600_000 }],
    });
    await after.propose(link.playerId, 'mail.answer.wrong', 'mail:2', after.mail);
    const delivered = await after.bridge.signals(link.capability, 0);
    expect(delivered.map((d) => JSON.parse(atob(d.jws.split('.')[0]!)).kid)).toEqual(['k2', 'k2']);
    expect((await after.bridge.exportPlayer(after.admin, link.playerId)).signals.map((s) => s.kid)).toEqual([
      'k1',
      'k2',
    ]);
    // A player that connected before the rotation: its keyring knows k1 only; it asks once, then applies both.
    const e = new Engine(signals(), signalsLayouts, new FakePresenter(), new MemoryStore());
    await e.newGame();
    let asked = 0;
    const c = new RealityClient({
      engine: e,
      store: new MemoryStore(),
      port: httpPort({ url: after.url, capability: link.capability, mode: 'poll', retryMs: 20 }),
      keyring: oldKeys,
      refreshKeys: async () => {
        asked++;
        return Promise.all(
          ((await (await after.call('v1/keys')).json()) as { keys: { kid: string; raw: string }[] }).keys.map((k) =>
            importBridgeKey(k.kid, k.raw),
          ),
        );
      },
      playerId: link.playerId,
    });
    const run = c.run();
    for (let i = 0; i < 100 && (e.state.reality?.cursor ?? 0) < 2; i++) await new Promise((r) => setTimeout(r, 20));
    await c.stop();
    await run;
    expect(asked).toBe(1);
    expect(e.state.reality?.cursor).toBe(2);
    expect((await after.bridge.exportPlayer(after.admin, link.playerId)).acked).toBe(2);
  });

  it('a bad token is refused before an unknown player is named; an address out of failed authentications waits', async () => {
    const t = await setup({ serve: { perMinutePerIp: 3 } });
    for (let i = 0; i < 3; i++)
      expect((await t.propose('p-0000000000000000', 'mail.answer.correct', 'x', 'garbage')).status).toBe(401);
    const blocked = await t.call('v1/keys');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('60');
  });

  it('the routes anyone may call are bounded per address; a token holder is not', async () => {
    const t = await setup({ serve: { perMinutePerIp: 3 } });
    const link = await t.pair(); // three anonymous calls: the code, its state, its claim
    expect((await t.call('v1/keys')).status).toBe(429);
    expect((await t.call('v1/signals?after=0', { token: link.capability })).status).toBe(200);
  });

  it('codes waiting for a confirmation are bounded, in memory, never written', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-codes-'));
    temps.push(dir);
    const file = join(dir, 'journal.jsonl');
    const t = await setup({ store: new JsonlBridgeStore(file), limits: { pendingPairings: 2 } });
    const ask = () => t.call('v1/pairings', { method: 'POST', body: JSON.stringify({ gameId: 'signals' }) });
    expect((await ask()).status).toBe(201);
    expect((await ask()).status).toBe(201);
    expect((await ask()).status).toBe(429);
    expect(existsSync(file) ? readFileSync(file, 'utf8') : '').toBe('');
  });

  it('a player ends its own link: revoked on the Bridge, not only forgotten; a link has a longest life', async () => {
    let t0 = Date.now();
    const t = await setup({ now: () => t0, limits: { capabilityMaxMs: 5_000 } });
    const link = await t.pair();
    expect((await t.call('v1/unlink', { method: 'POST', token: link.capability })).status).toBe(204);
    expect((await t.call('v1/signals?after=0', { token: link.capability })).status).toBe(401);
    expect((await t.propose(link.playerId, 'mail.answer.correct', 'after')).status).toBe(404);
    expect(t.logs.some((l) => l.event === 'player.unlinked')).toBe(true);
    const other = await t.pair();
    expect((await t.call('v1/signals?after=0', { token: other.capability })).status).toBe(200);
    t0 += 6_000;
    const old = await t.call('v1/signals?after=0', { token: other.capability });
    expect(old.status).toBe(401);
    expect(await old.json()).toMatchObject({ message: expect.stringMatching(/too old/) });
  });

  it('whatever the interleaving and the repeats, sequences are 1..n and a dedupeKey is accepted once', async () => {
    const t = await setup({ limits: { perMinutePerConnector: 100_000 } });
    const link = await t.pair();
    let offset = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 3 })), {
          minLength: 1,
          maxLength: 12,
        }),
        async (batch) => {
          // Each pick: a dedupeKey from a small alphabet (so repeats happen) and a delay before the call.
          const base = offset;
          offset += 100;
          const results = await Promise.all(
            batch.map(([k, delay]) =>
              new Promise((r) => setTimeout(r, delay)).then(() =>
                t.bridge.propose(t.mail, {
                  playerId: link.playerId,
                  signal: 'mail.answer.wrong',
                  source: 'mail',
                  dedupeKey: `k${base + k}`,
                }),
              ),
            ),
          );
          const fresh = results.filter((r) => !r.duplicate);
          const distinctKeys = new Set(batch.map(([k]) => k)).size;
          expect(fresh).toHaveLength(distinctKeys);
          // A repeat answers with the first acceptance's id and sequence.
          for (const [i, r] of results.entries())
            if (r.duplicate) {
              const first = results.find((x, j) => !x.duplicate && batch[j]![0] === batch[i]![0]);
              expect(r).toMatchObject({ id: first?.id, sequence: first?.sequence });
            }
          const all = await t.bridge.signals(link.capability, 0);
          expect(all.map((s) => s.sequence)).toEqual(all.map((_, i) => i + 1));
        },
      ),
      { numRuns: 25 },
    );
  });

  it('a write that fails leaves nothing behind: the proposal is refused, the next one takes the same sequence', async () => {
    class Flaky extends MemoryBridgeStore {
      fail = false;
      override write(e: Parameters<MemoryBridgeStore['write']>[0]): void {
        if (this.fail && e.t === 'signal') {
          this.fail = false;
          throw new Error('disk full');
        }
        super.write(e);
      }
    }
    const store = new Flaky();
    const t = await setup({ store });
    const link = await t.pair();
    await t.propose(link.playerId, 'mail.answer.correct', 'mail:1');
    store.fail = true;
    expect((await t.propose(link.playerId, 'mail.answer.wrong', 'mail:2')).status).toBe(500);
    expect(await t.bridge.signals(link.capability, 0)).toHaveLength(1);
    const again = await t.propose(link.playerId, 'mail.answer.wrong', 'mail:2');
    expect(again.status).toBe(202);
    expect(await again.json()).toMatchObject({ sequence: 2, duplicate: false });
    expect(t.logs.filter((l) => l.event === 'signal.accepted')).toHaveLength(2);
  });

  it('refuses another game, an expired or claimed code, a revoked pairing token; keeps what a proposal says', async () => {
    let t0 = Date.now();
    const t = await setup({ now: () => t0 });
    await expect(
      Bridge.start(
        { ...t.bridge.config, gameId: 'demo', manifestHash: t.bridge.config.manifestHash },
        new MemoryBridgeStore(),
      ),
    ).rejects.toThrow(/for signals/);
    await expect(t.bridge.startPairing('demo')).rejects.toMatchObject({ status: 404 });
    // A code past its ten minutes: unknown to a connector and to the player alike.
    const { code: stale } = await t.bridge.startPairing('signals');
    t0 += 11 * 60_000;
    await expect(t.bridge.claimPairing(stale)).rejects.toMatchObject({ status: 404 });
    await expect(t.bridge.confirmPairing(t.mail, stale)).rejects.toMatchObject({ status: 404 });
    // Claimed once; a second claim is gone, a second confirmation is already done.
    const { code } = await t.bridge.startPairing('signals');
    await t.bridge.confirmPairing(t.mail, code);
    expect((await t.bridge.claimPairing(code)).status).toBe('paired');
    await expect(t.bridge.claimPairing(code)).rejects.toMatchObject({ status: 410 });
    await expect(t.bridge.confirmPairing(t.mail, code)).rejects.toMatchObject({ status: 409 });
    // A revoked token may not pair either.
    const b = await biscuitLib();
    const tok = b.Biscuit.fromBase64(
      t.mail,
      b.PublicKey.fromString(t.rootPub.replace(/^ed25519\//, ''), b.SignatureAlgorithm.Ed25519),
    );
    const link = await t.pair();
    const body = (extra: Record<string, unknown>) => ({
      playerId: link.playerId,
      signal: 'mail.answer.correct',
      source: 'mail',
      dedupeKey: `k-${JSON.stringify(extra)}`,
      ...extra,
    });
    await expect(t.bridge.propose(t.mail, body({ evidenceHash: 'xyz' }))).rejects.toMatchObject({ status: 400 });
    await expect(
      t.bridge.propose(t.mail, body({ signal: 'mail.answer.correct', source: 'webhook' })),
    ).rejects.toMatchObject({ status: 422 });
    await t.bridge.propose(t.mail, body({ occurredAt: 1234, evidenceHash: 'ab'.repeat(32) }));
    await t.bridge.propose(t.mail, body({ occurredAt: -5 }));
    const payloads = (await t.bridge.signals(link.capability, 0)).map(
      (x) => JSON.parse(Buffer.from(x.jws.split('.')[1]!, 'base64url').toString()) as Record<string, unknown>,
    );
    expect(payloads[0]).toMatchObject({ occurredAt: 1234, evidenceHash: 'ab'.repeat(32), sequence: 1 });
    expect(payloads[1]).not.toHaveProperty('occurredAt');
    expect(payloads[1]).not.toHaveProperty('evidenceHash');
    await t.bridge.revoke(t.admin, { tokenId: (tok.getRevocationIdentifiers() as string[])[0]! });
    await expect(t.bridge.confirmPairing(t.mail, (await t.bridge.startPairing('signals')).code)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('a stream ends when the link expires, and a proposal for an expired link is refused', async () => {
    let t0 = Date.now();
    const t = await setup({ now: () => t0, limits: { capabilityMs: 1_000 } });
    const link = await t.pair();
    const res = await t.call('v1/events?after=0', { token: link.capability, headers: { Accept: 'text/event-stream' } });
    expect(res.status).toBe(200);
    const events = sseEvents(res.body!);
    t0 += 2_000; // no acknowledgement within the capability's life: it is gone (the connector's token still lives)
    const late = await t.propose(link.playerId, 'mail.answer.correct', 'late');
    expect([late.status, await late.text()]).toEqual([202, expect.any(String)]);
    let ended = false;
    for (let i = 0; i < 50 && !ended; i++) ended = (await events.next()).done === true;
    expect(ended).toBe(true);
    expect((await t.call('v1/signals?after=0', { token: link.capability })).status).toBe(401);
  });

  it('answers CORS for the game only, and logs no secret', async () => {
    const t = await setup();
    const ok = await t.call('v1/keys', { headers: { Origin: 'http://game.test' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://game.test');
    const other = await t.call('v1/keys', { headers: { Origin: 'http://evil.test' } });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    const link = await t.pair();
    await t.propose(link.playerId, 'mail.answer.correct', 'secret-dedupe-key');
    const all = JSON.stringify(t.logs);
    expect(all).not.toContain(link.capability);
    expect(all).not.toContain(t.mail);
    expect(all).not.toContain('secret-dedupe-key');
    expect(all).not.toContain(t.admin);
  });

  it('starts only on the manifest it was configured with', async () => {
    const t = await setup();
    const g = signals();
    g.reality!.signals[0]!.id = 'mail.answer.right';
    await expect(
      Bridge.start({ ...t.bridge.config, manifest: realityManifest(g)! }, new MemoryBridgeStore()),
    ).rejects.toThrow(/not the one configured/);
  });

  it('a restart replays its journal; forgetting a player removes it from the file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-'));
    temps.push(dir);
    const file = join(dir, 'journal.jsonl');
    const t = await setup({ store: new JsonlBridgeStore(file) });
    const link = await t.pair();
    await t.propose(link.playerId, 'mail.answer.correct', 'mail:1');
    const again = await Bridge.start(t.bridge.config, new JsonlBridgeStore(file), { log: () => {} });
    expect(await again.signals(link.capability, 0)).toHaveLength(1);
    expect(readFileSync(file, 'utf8')).not.toContain(link.capability);
    await again.forgetPlayer(t.admin, link.playerId);
    expect(readFileSync(file, 'utf8')).not.toContain(link.playerId);
    expect(() => new JsonlBridgeStore(file).player(link.playerId)).not.toThrow();
    expect(new JsonlBridgeStore(file).player(link.playerId)).toBeUndefined();
  });
});

describe('the journal file', () => {
  it('drops a last line cut short by a crash and says so; refuses a corrupt line; forgets by reading, not matching', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-journal-'));
    temps.push(dir);
    const file = join(dir, 'journal.jsonl');
    const t = await setup({ store: new JsonlBridgeStore(file) });
    const a = await t.pair();
    const b = await t.pair();
    await t.propose(a.playerId, 'mail.answer.correct', 'mail:1');
    // B's dedupeKey is A's id: a deletion that matched text would take B's line with A's.
    await t.propose(b.playerId, 'mail.answer.correct', a.playerId);
    const { appendFileSync, writeFileSync } = await import('node:fs');
    appendFileSync(file, '{"t":"signal","e":{"playerId":"p-00');
    const repairs: string[] = [];
    const again = new JsonlBridgeStore(file, { onRepair: (w) => repairs.push(w) });
    expect(repairs).toEqual([expect.stringMatching(/cut short by a crash/)]);
    expect(readFileSync(file, 'utf8').endsWith('}\n')).toBe(true);
    expect(again.signals(a.playerId, 0)).toHaveLength(1);
    expect(inspectJournal(file)).toMatchObject({ players: 2, signals: 2, torn: false });
    const whole = readFileSync(file, 'utf8');
    writeFileSync(file, `${whole}not json\n`);
    expect(inspectJournal(file).corrupt).toMatch(/line \d+ is not an event/);
    expect(() => new JsonlBridgeStore(file)).toThrow(/line \d+ is not an event/);
    writeFileSync(file, whole);
    const bridge = await Bridge.start(t.bridge.config, new JsonlBridgeStore(file), { log: () => {} });
    await bridge.forgetPlayer(t.admin, a.playerId);
    expect(readFileSync(file, 'utf8')).not.toContain(`"${a.playerId}"`.replace(/"/g, '"playerId":"'));
    const after = new JsonlBridgeStore(file);
    expect(after.player(a.playerId)).toBeUndefined();
    expect(after.signals(b.playerId, 0)).toHaveLength(1);
  });

  it('compaction keeps what a player may still need: its unacknowledged signals, its last sequence', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-compact-'));
    temps.push(dir);
    const file = join(dir, 'journal.jsonl');
    const t = await setup({ store: new JsonlBridgeStore(file) });
    const link = await t.pair();
    for (const k of ['1', '2', '3']) await t.propose(link.playerId, 'mail.answer.wrong', `mail:${k}`);
    await t.call('v1/ack', { method: 'POST', token: link.capability, body: JSON.stringify({ through: 2 }) });
    const store = new JsonlBridgeStore(file);
    const r = store.compact({ now: Date.now() + 100 * 24 * 3_600_000, retentionMs: 90 * 24 * 3_600_000 });
    expect(r.after).toBeLessThan(r.before);
    const fresh = new JsonlBridgeStore(file);
    expect(fresh.lastSequence(link.playerId)).toBe(3);
    expect(fresh.acked(link.playerId)).toBe(2);
    expect(fresh.signals(link.playerId, 2).map((e) => e.sequence)).toEqual([3]);
    expect(fresh.playerByCapability(createHash('sha256').update(link.capability).digest('hex'))).toBeDefined();
    // Still a Bridge: the next proposal takes sequence 4, the recent duplicate is still known.
    const bridge = await Bridge.start(t.bridge.config, fresh, { log: () => {} });
    expect(
      await bridge.propose(t.mail, {
        playerId: link.playerId,
        signal: 'mail.answer.wrong',
        source: 'mail',
        dedupeKey: 'mail:3',
      }),
    ).toMatchObject({ duplicate: true });
    expect(
      await bridge.propose(t.mail, {
        playerId: link.playerId,
        signal: 'mail.answer.wrong',
        source: 'mail',
        dedupeKey: 'mail:4',
      }),
    ).toMatchObject({ sequence: 4 });
  });
});

describe('web-scumm bridge init', () => {
  it('writes a configuration only its owner reads, from which a Bridge starts', async () => {
    const { main, loadBridge } = await import('../bridge/src/cli');
    const { statSync } = await import('node:fs');
    const dir = mkdtempSync(join(tmpdir(), 'bridge-init-'));
    temps.push(dir);
    const log = console.log;
    console.log = () => {};
    try {
      expect(await main(['init', `--dir=${dir}`], { manifest: realityManifest(signals()) })).toBe(0);
      expect(await main(['init', `--dir=${dir}`], { manifest: realityManifest(signals()) })).toBe(1); // no silent overwrite
    } finally {
      console.log = log;
    }
    expect(statSync(join(dir, 'config.json')).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, 'admin-token')).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, 'root.key')).mode & 0o777).toBe(0o600);
    const file = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
    expect(Object.keys(file.webhooks).sort()).toEqual(['mail', 'webhook']);
    // The root's private half is in root.key only; `grant` reads it there, `serve` never loads it.
    expect(file.biscuitRoot.privateKey).toBeUndefined();
    expect(readFileSync(join(dir, 'config.json'), 'utf8')).not.toContain('ed25519-private');
    const write = process.stdout.write;
    const out: string[] = [];
    process.stdout.write = ((s: string) => (out.push(s), true)) as typeof process.stdout.write;
    try {
      expect(
        await main(['grant', `--dir=${dir}`, '--connector=c', '--source=mail', '--signals=mail.answer.wrong']),
      ).toBe(0);
    } finally {
      process.stdout.write = write;
    }
    expect(out.join('')).toMatch(/^\S{40,}\n$/);
    const bare = mkdtempSync(join(tmpdir(), 'bridge-bare-'));
    temps.push(bare);
    console.log = () => {};
    try {
      expect(
        await main(['init', `--dir=${bare}`, '--no-demo-webhooks'], { manifest: realityManifest(signals()) }),
      ).toBe(0);
    } finally {
      console.log = log;
    }
    expect(JSON.parse(readFileSync(join(bare, 'config.json'), 'utf8')).webhooks).toEqual({});
    const bridge = await loadBridge(file, dir);
    expect(bridge.keys()[0]!.kid).toBe(file.eventKey.kid);
    console.log = () => {};
    try {
      expect(await main(['rotate', `--dir=${dir}`, '--keep-days=2'])).toBe(0);
    } finally {
      console.log = log;
    }
    console.log = () => {};
    try {
      expect(await main(['doctor', `--dir=${dir}`])).toBe(0);
      expect(await main(['compact', `--dir=${dir}`])).toBe(0);
    } finally {
      console.log = log;
    }
    const rotated = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
    expect(rotated.eventKey.kid).not.toBe(file.eventKey.kid);
    expect(rotated.previousKeys[0].kid).toBe(file.eventKey.kid);
    expect((await loadBridge(rotated, dir)).keys().map((k) => k.kid)).toEqual([
      rotated.eventKey.kid,
      file.eventKey.kid,
    ]);
  });
});

describe('bounded, validated, one per journal (4.1.8)', () => {
  it('the re-sign cache is an LRU bounded by limits.resignedCache; a delivery still signs every signal with the current key', async () => {
    const store = new MemoryBridgeStore();
    const before = await setup({ store });
    const link = await before.pair();
    await before.propose(link.playerId, 'mail.answer.correct', 'mail:1');
    await before.propose(link.playerId, 'mail.answer.wrong', 'mail:2');
    const after = await setup({
      store,
      kid: 'k2',
      previousKeys: [{ kid: 'k1', raw: before.raw, notAfter: Date.now() - 24 * 3_600_000 }],
      limits: { resignedCache: 1 },
    });
    for (let round = 0; round < 3; round++) {
      const delivered = await after.bridge.signals(link.capability, 0);
      expect(delivered.map((d) => JSON.parse(atob(d.jws.split('.')[0]!)).kid)).toEqual(['k2', 'k2']);
      expect(after.bridge.resignedCount()).toBe(1);
    }
    // A cache of two with three signals: the one used last recently stays, the least recently used goes.
    const wide = await setup({
      store,
      kid: 'k2',
      previousKeys: [{ kid: 'k1', raw: before.raw, notAfter: Date.now() - 24 * 3_600_000 }],
      limits: { resignedCache: 2 },
    });
    await before.propose(link.playerId, 'mail.answer.correct', 'mail:3');
    await wide.bridge.signals(link.capability, 0); // s1, s2, s3 signed: s1 evicted when s3 arrives, s2 and s3 kept
    expect(wide.bridge.resignedCount()).toBe(2);
    vi.mocked(signSignalSync).mockClear();
    await wide.bridge.signals(link.capability, 1); // s2 (hit, moved to the back), s3 (hit): nothing signed again
    expect(signSignalSync).not.toHaveBeenCalled();
    const beforeAgain = wide.bridge.resignedCount();
    // s1 (miss: evicts the least recently used, s2), s2 (miss: evicts s3), s3 (miss): a scan wider than the cache
    // misses all along, as an LRU does.
    await wide.bridge.signals(link.capability, 0);
    expect(signSignalSync).toHaveBeenCalledTimes(3);
    expect(beforeAgain).toBe(2);
    expect(wide.bridge.resignedCount()).toBe(2);
  });

  it('a journal line that is JSON but not an event of the schema is corruption: the Bridge refuses to start', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-schema-'));
    temps.push(dir);
    const file = join(dir, 'journal.jsonl');
    writeFileSync(file, `${JSON.stringify({ t: 'ack', playerId: 'p-1', through: 'two' })}\n`);
    expect(() => new JsonlBridgeStore(file, { lock: false })).toThrow(/journal line 1 is not an event \(through/);
    writeFileSync(file, `${JSON.stringify({ t: 'player', p: { playerId: 'p-1', gameId: 'signals' } })}\n`);
    expect(() => new JsonlBridgeStore(file, { lock: false })).toThrow(
      /journal line 1 is not an event \(p\.capabilityHash/,
    );
    writeFileSync(file, `${JSON.stringify({ t: 'ack', playerId: 'p-1', through: 2 })}\n`);
    expect(new JsonlBridgeStore(file, { lock: false }).acked('p-1')).toBe(2);
  });

  it('refuses to start on a limit below its least, not an integer, or a name that is no limit (4.3.0)', async () => {
    // config.json's limits were spread unchecked: `resignedCache: -1` made the re-sign cache's eviction loop run on an
    // empty map, held off only by a guard; now the Bridge does not start, and says which limit and what it was given.
    for (const [limits, said] of [
      [{ resignedCache: -1 }, /^limits\.resignedCache must be an integer of at least 0, not -1$/],
      [{ streamPage: 1.5 }, /^limits\.streamPage must be an integer of at least 1, not 1\.5$/],
      [{ bodyBytes: '8192' }, /^limits\.bodyBytes must be an integer of at least 1, not "8192"$/],
      [{ pairingMs: JSON.parse('1e400') }, /^limits\.pairingMs must be an integer of at least 0, not Infinity$/],
      [{ pendingPairings: null }, /^limits\.pendingPairings must be an integer of at least 0, not null$/],
      [{ resignCache: 10 }, /^limits\.resignCache is no limit of the Bridge \(bodyBytes, /],
      // 0 would break these three: a fetch by cursor that never ends, no body, every stream closed at once.
      [{ streamPage: 0 }, /^limits\.streamPage must be an integer of at least 1, not 0$/],
      [{ bodyBytes: 0 }, /^limits\.bodyBytes must be an integer of at least 1, not 0$/],
      [{ streamBufferBytes: 0 }, /^limits\.streamBufferBytes must be an integer of at least 1, not 0$/],
    ] as const)
      await expect(setup({ limits: limits as never }), JSON.stringify(limits)).rejects.toThrow(said);
    const zero = await setup({ limits: { resignedCache: 0, streamPage: 7, pendingPairings: undefined } });
    expect(zero.bridge.limits).toMatchObject({ resignedCache: 0, streamPage: 7, pendingPairings: 1000 });
  });

  it('the 4.3.0 upgrade notes say, in English and in French, that the limits are checked and which take at least 1', async () => {
    // A host upgrading to 4.3.0 learns there (the wiki's `install.upgrade-notes-4-3#from-4-2-5-to-4-3-0`, UPGRADING
    // §39 until 4.5.0) that a limit its Bridge took before may now stop it (every tenant of a shared one); the limits named there as taking at least 1 are exactly those checkLimits refuses at 0.
    const { checkLimits, DEFAULT_LIMITS } = await import('../bridge/src/config');
    const atLeastOne = Object.keys(DEFAULT_LIMITS).filter((k) => {
      try {
        checkLimits({ [k]: 0 });
        return false;
      } catch {
        return true;
      }
    });
    expect(atLeastOne.sort()).toEqual(['bodyBytes', 'streamBufferBytes', 'streamPage']);
    for (const lang of ['en', 'fr']) {
      const doc = readFileSync(`wiki/${lang}/install.upgrade-notes-4-3.md`, 'utf8');
      const at = doc.indexOf('<a name="from-4-2-5-to-4-3-0">');
      expect(at, lang).toBeGreaterThanOrEqual(0);
      const next = doc.indexOf('<a name=', at + 1);
      const s39 = doc.slice(at, next > 0 ? next : undefined);
      const para = s39.split('\n\n').find((p) => p.includes('`limits`') && p.includes('config.json')) ?? '';
      expect(para, lang).toMatch(/DEFAULT_LIMITS/);
      for (const k of atLeastOne) expect(para, `${lang}: ${k}`).toContain(`\`${k}\``);
    }
  });

  it('a journal line that is not JSON is refused with what the parser said of it', () => {
    // 4.3.0 (the reread of the exemptions) kills store.ts parseLine `err instanceof Error` → false: the message the
    // Bridge refuses to start with, and `doctor` prints, quotes JSON.parse's reason, never a bare "unreadable"
    const dir = mkdtempSync(join(tmpdir(), 'bridge-notjson-'));
    temps.push(dir);
    const file = join(dir, 'journal.jsonl');
    writeFileSync(file, 'not json\n');
    expect(() => new JsonlBridgeStore(file, { lock: false })).toThrow(
      /^journal line 1 is not an event \((?!unreadable\)).*JSON/,
    );
    expect(inspectJournal(file).corrupt).toMatch(/^journal line 1 is not an event \((?!unreadable\)).*JSON/);
  });

  it('one Bridge per journal: a live owner refuses the second, a dead one is taken over and said', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-lock-'));
    temps.push(dir);
    const journal = join(dir, 'journal.jsonl');
    const first = new JournalLock(journal, { pid: 1234, alive: () => true });
    first.acquire();
    expect(readFileSync(`${journal}.lock`, 'utf8').trim()).toBe('1234');
    const second = new JournalLock(journal, { pid: 5678, alive: () => true });
    expect(() => second.acquire()).toThrow(/journal in use by process 1234/);
    const taken: number[] = [];
    const afterCrash = new JournalLock(journal, {
      pid: 5678,
      alive: () => false,
      onTakeover: (pid) => taken.push(pid),
    });
    afterCrash.acquire();
    expect(taken).toEqual([1234]);
    expect(readFileSync(`${journal}.lock`, 'utf8').trim()).toBe('5678');
    afterCrash.release();
    expect(existsSync(`${journal}.lock`)).toBe(false);
    // A lock that is not a process id is not taken over: it is looked at by hand.
    writeFileSync(`${journal}.lock`, 'what is this\n');
    expect(() => new JournalLock(journal, { pid: 5678 }).acquire()).toThrow(/not a process id/);
    rmSync(`${journal}.lock`);
    // `compact` (a writer) takes the lock too: refused while a Bridge holds it.
    // The store judges liveness with the real `process.kill(pid, 0)`: the parent process is alive and is not us.
    const live = new JournalLock(journal, { pid: process.ppid, alive: () => true });
    live.acquire();
    expect(() => new JsonlBridgeStore(journal)).toThrow(new RegExp(`in use by process ${process.ppid}`));
    live.release();
    // The store takes the lock itself, and `doctor` / `compact` read without one.
    const store = new JsonlBridgeStore(journal);
    expect(existsSync(`${journal}.lock`)).toBe(true);
    expect(() => new JsonlBridgeStore(journal, { lock: false })).not.toThrow();
    store.close();
    expect(existsSync(`${journal}.lock`)).toBe(false);
  });
});

describe('web-scumm bridge serve, stopped', () => {
  it('SIGTERM ends the streams and the server, then releases the journal lock, and the process exits 0', async () => {
    const { main } = await import('../bridge/src/cli');
    const dir = mkdtempSync(join(tmpdir(), 'bridge-serve-'));
    temps.push(dir);
    const log = console.log;
    console.log = () => {};
    try {
      expect(await main(['init', `--dir=${dir}`, '--no-demo-webhooks'], { manifest: realityManifest(signals()) })).toBe(
        0,
      );
    } finally {
      console.log = log;
    }
    const file = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')) as { journal: string };
    const lock = `${join(dir, file.journal)}.lock`;
    const child = spawn(process.execPath, ['bridge/bin.mjs', 'serve', `--dir=${dir}`, '--port=0', '--host=127.0.0.1'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (out += d.toString()));
    const exited = new Promise<number | null>((ok) => child.on('exit', (code) => ok(code)));
    try {
      for (let i = 0; i < 600 && !out.includes('bridge.listening'); i++) await new Promise((r) => setTimeout(r, 50));
      expect(out, out).toContain('bridge.listening');
      expect(existsSync(lock), 'the lock is held while serving').toBe(true);
      expect(readFileSync(lock, 'utf8').trim()).toBe(String(child.pid));
      child.kill('SIGTERM');
      const code = await Promise.race([exited, new Promise<null>((ok) => setTimeout(() => ok(null), 15_000))]);
      expect(code, out).toBe(0);
      expect(out).toContain('bridge.stopping');
      expect(existsSync(lock), 'the lock is released at the stop').toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }, 60_000);

  it('in this process: serve listens, holds the lock, and a SIGTERM handler stops it with exit 0', async () => {
    const { main } = await import('../bridge/src/cli');
    const dir = mkdtempSync(join(tmpdir(), 'bridge-serve-in-'));
    temps.push(dir);
    const lines: string[] = [];
    const log = console.log;
    console.log = (x: unknown) => void lines.push(String(x));
    try {
      expect(await main(['init', `--dir=${dir}`, '--no-demo-webhooks'], { manifest: realityManifest(signals()) })).toBe(
        0,
      );
      const file = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')) as { journal: string };
      const lock = `${join(dir, file.journal)}.lock`;
      const serving = main(['serve', `--dir=${dir}`, '--port=0', '--host=127.0.0.1']);
      for (let i = 0; i < 200 && !lines.some((l) => l.includes('bridge.listening')); i++)
        await new Promise((r) => setTimeout(r, 25));
      expect(lines.some((l) => l.includes('bridge.listening'))).toBe(true);
      expect(existsSync(lock)).toBe(true);
      // The handler, not the signal: the test's own process must not die.
      process.emit('SIGTERM');
      expect(await serving).toBe(0);
      expect(lines.some((l) => l.includes('"bridge.stopping"') && l.includes('SIGTERM'))).toBe(true);
      expect(existsSync(lock)).toBe(false);
      // A second signal after the stop finds no handler of ours any more.
      expect(process.listeners('SIGTERM').some((f) => String(f).includes("stop('SIGTERM')"))).toBe(false);
    } finally {
      console.log = log;
    }
  }, 30_000);
});
