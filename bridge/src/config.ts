// What a Bridge is configured with (4.1.1; split from bridge.ts in 4.1.10): one tenant's game, keys, audience and
// limits, the errors it answers with, its log lines. A deployment of several tenants runs one `Bridge` per tenant
// over one shared `RealityStore` (ADR 0009); nothing here is shared between tenants.
import { createHash } from 'node:crypto';
import type { RealityManifest } from '../../src/engine/reality/manifest';
import type { SignalEnvironment } from '../../src/engine/reality/protocol';

export interface BridgeConfig {
  /** The tenant this configuration is (4.1.10): `default` for a single-tenant Bridge. */
  tenantId?: string;
  /** Where it runs (4.1.10): named in a V2 signal and in the keys it lists. `prod` by default. */
  environment?: SignalEnvironment;
  /** The version of the signals it signs (4.1.10, ADR 0010): 1 by default for a single tenant, 2 for several. */
  signalVersion?: 1 | 2;
  /** The `Host` names that reach this tenant (a multi-tenant server routes by them). */
  hosts?: string[];
  /** The origins its players use (CORS); the first is a V2 signal's audience when a pairing said none. */
  origins?: string[];
  gameId: string;
  manifest: RealityManifest;
  /** The manifest's hash as deployed: the Bridge refuses to start on another manifest (an old configuration). */
  manifestHash: string;
  /** Who the Bridge is for its connectors' tokens (`audience` in a grant). */
  audience: string;
  /** Biscuit's root public key (`ed25519/<hex>`): the connectors' tokens are minted from its private half. */
  biscuitRootPublicKey: string;
  /** The key that signs events, and the previous ones the players may still hold (rotation). */
  eventKey: { kid: string; privateKey: CryptoKey; raw: string };
  previousKeys?: { kid: string; raw: string; notAfter: number }[];
  /** SHA-256 (hex) of the operator's token. */
  adminTokenHash: string;
  policyVersion: string;
  limits?: Partial<Limits>;
}

export interface Limits {
  /** A request body, in bytes. */
  bodyBytes: number;
  /** Signals one connector may propose per minute (per instance: N instances admit N times this). */
  perMinutePerConnector: number;
  /** Signals waiting for a player's acknowledgement: beyond, a proposal is refused (visible, never dropped). */
  pendingPerPlayer: number;
  /** How long a pairing code waits for its confirmation. */
  pairingMs: number;
  /** How long a player's capability lives without an acknowledgement (renewed on each). */
  capabilityMs: number;
  /** Open event streams (SSE) one player may hold at once: beyond, a 429 (a tab reconnects when another closes). */
  streamsPerPlayer: number;
  /** Open event streams on one instance, every player together (4.1.10): beyond, a 429. */
  streamsPerInstance: number;
  /** Bytes a stream may hold unsent before it is closed (the player reconnects from its cursor). */
  streamBufferBytes: number;
  /** Pairing codes waiting for a confirmation, all players together: beyond, a 429 (anyone may ask). */
  pendingPairings: number;
  /** The longest a capability lives, renewals included: then the player pairs again. */
  capabilityMaxMs: number;
  /** Signals signed again after a rotation and kept in memory (4.1.8): beyond, the least recently used is forgotten. */
  resignedCache: number;
  /** Signals a stream reads from the store at once (4.1.10). */
  streamPage: number;
}
/** The limits a Bridge runs with where its configuration says nothing. @public */
export const DEFAULT_LIMITS: Limits = {
  bodyBytes: 8192,
  perMinutePerConnector: 120,
  pendingPerPlayer: 1000,
  pairingMs: 10 * 60_000,
  capabilityMs: 30 * 24 * 3_600_000,
  streamsPerPlayer: 4,
  streamsPerInstance: 10_000,
  streamBufferBytes: 64 * 1024,
  pendingPairings: 1000,
  capabilityMaxMs: 180 * 24 * 3_600_000,
  resignedCache: 10_000,
  streamPage: 100,
};

/**
 * The least each limit takes (4.3.0): 0 for most (no pairing, no stream, no cache: the Bridge refuses that, visibly),
 * 1 for the three where 0 would break it: `streamPage` (a page of none never ends the fetch by cursor), `bodyBytes`
 * (no request could carry a body) and `streamBufferBytes` (every stream closed as soon as it holds a byte).
 */
const LIMIT_MIN: Partial<Record<keyof Limits, number>> = { streamPage: 1, bodyBytes: 1, streamBufferBytes: 1 };

/**
 * A configuration's limits merged over the defaults, each checked (4.3.0): a limit is a count, a size or a duration, so
 * an integer, at least its `LIMIT_MIN` (0 when it has none). A name that is no limit, or a value that is not one (a
 * number below the least, a fraction, a string, a number JSON reads as Infinity), stops the Bridge before it starts,
 * with the name, the least it takes and the value; a limit left out (or undefined) keeps its default.
 */
export function checkLimits(given: Partial<Limits> = {}): Limits {
  const out: Limits = { ...DEFAULT_LIMITS };
  for (const [k, v] of Object.entries(given)) {
    if (!Object.hasOwn(DEFAULT_LIMITS, k))
      throw new Error(`limits.${k} is no limit of the Bridge (${Object.keys(DEFAULT_LIMITS).join(', ')})`);
    if (v === undefined) continue;
    const min = LIMIT_MIN[k as keyof Limits] ?? 0;
    if (!Number.isSafeInteger(v) || v < min)
      throw new Error(
        `limits.${k} must be an integer of at least ${min}, not ${typeof v === 'string' ? JSON.stringify(v) : String(v)}`,
      );
    out[k as keyof Limits] = v;
  }
  return out;
}

export class BridgeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** A line of the Bridge's log: what happened, never a token, an email, a payload or a key. */
export type BridgeLog = { event: string; [k: string]: string | number | boolean | undefined };

export const IDENT = /^[\w.:-]{1,128}$/;
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
