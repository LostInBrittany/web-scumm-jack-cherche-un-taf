// The Studio's simulated Bridge (4.1.1, plan §8): a development key signs signals as the Bridge would, and a port
// delivers them to the same RealityClient a real Bridge feeds, so the simulator tests verification, the session, the
// save and the deduplication, never a shortcut to `Engine.emit`. Faults on demand: a delay, a duplicate, the order
// reversed, a bad signature, an expired signal, the connection cut then resumed. No network.
import type { WorldSignalPort } from '../core/ports';
import type { GameDef } from '../core/types';
import {
  b64url,
  CLOCK_SKEW_MS,
  importBridgeKey,
  signSignal,
  type Keyring,
  type WorldSignal,
  type WorldSignalV1,
} from './protocol';

/**
 * What the simulator does wrong on purpose with one delivery: a delay, a duplicate, a bad signature, an expiry.
 * @public
 */
export interface Fault {
  /** Deliver it this many milliseconds later. */
  delayMs?: number;
  /** Deliver it twice. */
  duplicate?: boolean;
  /** One byte of the payload changed after signing. */
  badSignature?: boolean;
  /** Already expired when it arrives. */
  expired?: boolean;
}

/** One delivery the simulator made: its sequence, its signal, its fault and when. @public */
export interface SimulatedDelivery {
  sequence: number;
  signal: string;
  fault: string;
  at: number;
}

/**
 * A Bridge in the browser, for the Studio and the tests: signs and delivers a game's signals, with faults on demand.
 * @public
 */
export class SignalSimulator {
  readonly playerId: string;
  readonly history: SimulatedDelivery[] = [];
  private queue: string[] = [];
  private held: string[] = [];
  private wake: (() => void) | null = null;
  private cutOff = false;
  private sequence = 0;
  private acked = 0;
  /** The version it signs (4.1.10): V2 by default, as a multi-tenant Bridge does; 1 to try a player against a 4.1.9 Bridge. */
  private version: 1 | 2 = 2;

  private constructor(
    private game: GameDef,
    private key: CryptoKey,
    readonly keyring: Keyring,
    playerId: string,
    private now: () => number,
  ) {
    this.playerId = playerId;
  }

  static async create(
    game: GameDef,
    o: { playerId?: string; now?: () => number; after?: number; signalVersion?: 1 | 2 } = {},
  ): Promise<SignalSimulator> {
    const kp = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const raw = b64url.encode(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)));
    const sim = new SignalSimulator(
      game,
      kp.privateKey,
      [await importBridgeKey('studio', raw, { tenantId: 'studio', environment: 'dev' })],
      o.playerId ?? 'p-studio',
      o.now ?? Date.now,
    );
    sim.sequence = o.after ?? 0;
    sim.acked = o.after ?? 0;
    sim.version = o.signalVersion ?? 2;
    return sim;
  }

  /** The signals the game declares (the Studio's buttons). */
  get signals(): string[] {
    return this.game.reality?.signals.map((s) => s.id) ?? [];
  }
  get acknowledged(): number {
    return this.acked;
  }

  /** Signs a signal as the Bridge would, with the faults asked for, and queues it (or holds it while cut). */
  async inject(signal: string, f: Fault = {}): Promise<void> {
    const def = this.game.reality?.signals.find((s) => s.id === signal);
    const seq = ++this.sequence;
    const v1: WorldSignalV1 = {
      format: 'web-scumm-world-signal',
      schema: 1,
      id: `studio-${seq}`,
      sequence: seq,
      gameId: this.game.id,
      playerId: this.playerId,
      signal,
      source: def?.source ?? 'studio',
      receivedAt: this.now(),
      dedupeKey: `studio:${seq}`,
      policyVersion: 'studio',
      ...(f.expired ? { expiresAt: this.now() - CLOCK_SKEW_MS - 1 } : {}),
    };
    // V2 names its context (ADR 0010): the simulator is its own tenant, in `dev`, for the page that runs it.
    const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
    const payload: WorldSignal =
      this.version === 1
        ? v1
        : {
            ...v1,
            schema: 2,
            tenantId: 'studio',
            environment: 'dev',
            audience: origin && origin !== 'null' ? origin : 'studio',
            sessionId: 'studio',
            keyId: 'studio',
          };
    let jws = await signSignal(payload, this.key, 'studio');
    if (f.badSignature) {
      const [h, p, s] = jws.split('.') as [string, string, string];
      jws = `${h}.${p.slice(0, -2)}${p.at(-2) === 'A' ? 'B' : 'A'}${p.at(-1)}.${s}`;
    }
    const fault = Object.entries(f)
      .filter(([, v]) => v)
      .map(([k, v]) => (k === 'delayMs' ? `delay ${v} ms` : k))
      .join(', ');
    this.history.push({ sequence: seq, signal, fault: fault || 'none', at: this.now() });
    const push = () => {
      for (const j of f.duplicate ? [jws, jws] : [jws]) (this.cutOff ? this.held : this.queue).push(j);
      this.wake?.();
    };
    if (f.delayMs) setTimeout(push, f.delayMs);
    else push();
  }

  /** The signals waiting, delivered in the reverse order. */
  reverse(): void {
    this.queue.reverse();
  }
  /** The connection cut: what arrives is held until `resume`. */
  cut(): void {
    this.cutOff = true;
  }
  resume(): void {
    this.cutOff = false;
    this.queue.push(...this.held.splice(0));
    this.wake?.();
  }

  /** The port a RealityClient reads, as from a Bridge. */
  port(): WorldSignalPort {
    let closed = false;
    return {
      connect: ({ signal }) => {
        const self = this;
        return (async function* () {
          while (!closed && !signal?.aborted) {
            const next = self.queue.shift();
            if (next !== undefined) {
              yield next;
              continue;
            }
            // The abort listener goes when the wait ends either way (4.4.0): `once` alone kept one per empty wait.
            const stop = () => self.wake?.();
            await new Promise<void>((ok) => {
              self.wake = ok;
              signal?.addEventListener('abort', stop, { once: true });
            });
            signal?.removeEventListener('abort', stop);
            self.wake = null;
          }
        })();
      },
      acknowledge: async ({ through }) => {
        this.acked = Math.max(this.acked, through);
      },
      close: async () => {
        closed = true;
        this.wake?.();
      },
    };
  }
}
