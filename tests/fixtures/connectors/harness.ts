// A real Bridge for the connector tests (4.1.9): the sample game's manifest (games/signals, with its connectors block),
// HTTP on a free port, tokens minted per connector, pairing codes asked as the game would, the journal counted. Every
// line a connector logs is kept, so a test can grep the fixtures in it ("a log without content").
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ssh2 from 'ssh2';
import type { AddressInfo } from 'node:net';
import { Bridge, type BridgeConfig } from '../../../bridge/src/bridge';
import { biscuitLib } from '../../../bridge/src/biscuit';
import { grantToken } from '../../../bridge/src/policy';
import { bridgeServer } from '../../../bridge/src/server';
import { MemoryBridgeStore } from '../../../bridge/src/store';
import { createContext } from '../../../connectors/src/sdk';
import { manifestHash, type RealityManifest, realityManifest } from '../../../src/engine/reality/manifest';
import { game } from '../../../games/signals/game';

export const MANIFEST: RealityManifest = realityManifest(game)!;

export interface TestBridge {
  url: string;
  store: MemoryBridgeStore;
  /** A connector's Biscuit: these sources and signals, any player, may pair unless said otherwise. */
  token(o: { connector: string; sources: string[]; signals: string[]; pair?: boolean }): Promise<string>;
  /** A pairing code, asked as the game's pause menu asks it. */
  code(): Promise<string>;
  /** Signals the journal holds for a player. */
  count(playerId: string): number;
  close(): Promise<void>;
}

export async function startBridge(limits?: BridgeConfig['limits']): Promise<TestBridge> {
  const b = await biscuitLib();
  const root = new b.KeyPair(b.SignatureAlgorithm.Ed25519);
  const ev = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = Buffer.from(await crypto.subtle.exportKey('raw', ev.publicKey)).toString('base64url');
  const store = new MemoryBridgeStore();
  const bridge = await Bridge.start(
    {
      gameId: 'signals',
      manifest: MANIFEST,
      manifestHash: await manifestHash(MANIFEST),
      audience: 'bridge.test',
      biscuitRootPublicKey: root.getPublicKey().toString(),
      eventKey: { kid: 'k1', privateKey: ev.privateKey, raw },
      adminTokenHash: createHash('sha256').update('admin').digest('hex'),
      policyVersion: '1',
      ...(limits ? { limits } : {}),
    },
    store,
    { log: () => {} },
  );
  const server = bridgeServer(bridge, { perMinutePerIp: 100_000 });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  return {
    url,
    store,
    token: (o) =>
      grantToken(root.getPrivateKey().toString(), {
        connector: o.connector,
        gameId: 'signals',
        sources: o.sources,
        signals: o.signals,
        players: 'any',
        audience: 'bridge.test',
        pair: o.pair ?? true,
        expiresAt: Date.now() + 3_600_000,
      }),
    code: async () => {
      const r = await fetch(new URL('v1/pairings', url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: 'signals' }),
      });
      return ((await r.json()) as { code: string }).code;
    },
    count: (playerId) => store.signals(playerId, 0).length,
    close: () =>
      new Promise<void>((ok) => {
        server.closeAllConnections();
        server.close(() => ok());
      }),
  };
}

/** The signals and sources of the sample game, per connector. */
export const GRANTS = {
  email: { sources: ['email'], signals: ['letter.door', 'letter.unclear'] },
  telnet: { sources: ['terminal'], signals: ['terminal.lamp'] },
  ssh: { sources: ['terminal'], signals: ['terminal.lamp'] },
  'open-badge': { sources: ['badge'], signals: ['badge.valid', 'badge.refused'] },
} as const;

/** A context for one connector against the test Bridge, its log lines kept in `lines`. */
export async function contextFor(
  t: TestBridge,
  connector: keyof typeof GRANTS,
  o: { limits?: Parameters<typeof createContext>[0]['limits']; token?: string; lines?: string[] } = {},
) {
  const lines = o.lines ?? [];
  const token =
    o.token ??
    (await t.token({
      connector,
      ...GRANTS[connector],
      sources: [...GRANTS[connector].sources],
      signals: [...GRANTS[connector].signals],
    }));
  const ctx = createContext({
    bridge: { url: t.url, token },
    gameId: 'signals',
    manifest: MANIFEST,
    connector,
    write: (l) => lines.push(l),
    ...(o.limits ? { limits: o.limits } : {}),
  });
  return { ctx, lines, token };
}

/**
 * An ed25519 key pair ssh2 can read back (4.1.11): `generateKeyPairSync` now and then writes a private key its own
 * `parseKey` calls "Malformed OpenSSH private key" (seen on CI, node-24 and the connectors job, one run in ten),
 * so the pair is drawn again until it parses. Never more than a few draws.
 */
export function sshKeyPair(): { private: string; public: string } {
  for (let i = 0; i < 20; i++) {
    const k = ssh2.utils.generateKeyPairSync('ed25519');
    // Read back both halves and sign with one, verify with the other (4.1.19, plan §8.5): a pair ssh2 cannot use in
    // full is drawn again, and kept with why, so the flake's next occurrence says what ssh2 refused.
    const why = keyProblem(k);
    if (!why) return k;
    flakeEvidence('ssh-key', `${why}\n${k.private}\n${k.public}`);
  }
  throw new Error('ssh2 produced no usable ed25519 key pair in 20 draws (.cache/flakes/ holds them)');
}

function keyProblem(k: { private: string; public: string }): string | null {
  const priv = ssh2.utils.parseKey(k.private);
  if (priv instanceof Error) return `private: ${priv.message}`;
  const pub = ssh2.utils.parseKey(k.public);
  if (pub instanceof Error) return `public: ${pub.message}`;
  const data = Buffer.from('web-scumm ssh key check');
  const sig = (priv as unknown as { sign(d: Buffer): Buffer | Error }).sign(data);
  if (sig instanceof Error) return `sign: ${sig.message}`;
  return (pub as unknown as { verify(d: Buffer, s: Buffer): boolean | Error }).verify(data, sig) === true
    ? null
    : 'the public half does not verify what the private half signed';
}

/** What a flaky draw was, kept under .cache/flakes/ (a CI artefact when a job uploads it), never only retried. */
function flakeEvidence(kind: string, text: string): void {
  const dir = join(process.cwd(), '.cache', 'flakes');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${kind}-${Date.now()}-${process.pid}.txt`), text);
  console.warn(`[flake] ${kind}: ${text.split('\n')[0]} (kept in .cache/flakes/)`);
}
