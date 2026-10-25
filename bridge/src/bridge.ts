// The reference Reality Bridge (4.1.1, docs/dev/PLAN-4.1-REALITY-BRIDGE.md §7): pairing, signals proposed by
// connectors under a Biscuit, the journal, Ed25519 signatures, acknowledgements, revocation, quotas, export and
// deletion by player. No HTTP here (`server.ts` maps routes onto these methods), so the tests drive it directly. It
// never touches a game's files, the Studio or the repository: what it knows of a game is its manifest.
// 4.1.10 (ADR 0009): one `Bridge` is one tenant, and it reads and writes through `RealityStore` only, so several
// instances share one database and several tenants share one deployment; streams live in `streams.ts`.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { manifestHash } from '../../src/engine/reality/manifest';
import { type WorldSignal, WorldSignalV1Schema, WorldSignalV2Schema } from '../../src/engine/reality/protocol';
import { biscuitLib, errorClass } from './biscuit';
import { type BridgeConfig, BridgeError, type BridgeLog, checkLimits, IDENT, type Limits, sha256 } from './config';
import { KeyedLock } from './lock';
import { authorize, LIMITS, type Proposal } from './policy';
import { keyObject, signSignalSync } from './sign';
import type { BridgeStore, Pairing, Player } from './store';
import { DEFAULT_TENANT, isRealityStore, type RealityStore, type StoredSignal } from './store-async';
import { fromBridgeStore } from './store-memory';
import { type Stream, Streams } from './streams';
import { Telemetry } from './telemetry';

export { type BridgeConfig, BridgeError, type BridgeLog, type Limits } from './config';

const PAIR_POLICY = readFileSync(new URL('../policy/pair.datalog', import.meta.url), 'utf8');

const b64url = (b: Buffer) => b.toString('base64url');
/** A short code a person can type: 8 characters, no 0/O or 1/I/L. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const pairingCode = () => [...randomBytes(8)].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');

/** The unsubscribe function of a stream, and the read that sends what is already after its cursor. */
export type Subscription = (() => void) & { pump: () => Promise<void> };

export class Bridge {
  readonly limits: Limits;
  readonly tenantId: string;
  readonly telemetry: Telemetry;
  private store: RealityStore;
  private recent = new Map<string, number[]>();
  private streams: Streams;
  /** One section at a time per player (`propose`) and per pairing code (`confirmPairing`): see `lock.ts`. */
  private locks = new KeyedLock();
  /** Signals signed again under the current key after a rotation, by `<tenant>:<kid>:<player>:<sequence>`; LRU. */
  private resigned = new Map<string, string>();
  private signer: ReturnType<typeof keyObject>;
  private stopWatch: () => void = () => {};
  private timer: ReturnType<typeof setInterval> | undefined;
  /** How many signals were signed again (diagnostics, tests). */
  resignedCount(): number {
    return this.resigned.size;
  }

  private constructor(
    readonly config: BridgeConfig,
    store: RealityStore,
    private now: () => number,
    private log: (l: BridgeLog) => void,
    telemetry: Telemetry,
  ) {
    this.limits = checkLimits(config.limits);
    this.tenantId = config.tenantId ?? DEFAULT_TENANT;
    this.store = store;
    this.telemetry = telemetry;
    this.signer = keyObject(config.eventKey.privateKey);
    this.streams = new Streams(
      { page: (p, after, limit) => this.page(p, after, limit), ends: (p) => this.streamEnds(p) },
      () => this.limits.streamPage,
      (e) => {
        // A read that failed (the store restarting, busy): logged and counted; the next wake-up or pass reads again.
        this.telemetry.count('errors', { tenant: this.tenantId, code: 'stream' });
        this.log({ event: 'stream.error', message: e instanceof Error ? e.message.slice(0, 200) : 'unknown' });
      },
    );
  }

  /** A Bridge for one tenant's game; refuses a manifest that is not the one its configuration names. */
  static async start(
    config: BridgeConfig,
    store: BridgeStore | RealityStore,
    o: { now?: () => number; log?: (l: BridgeLog) => void; telemetry?: Telemetry; pollMs?: number } = {},
  ): Promise<Bridge> {
    const actual = await manifestHash(config.manifest);
    if (actual !== config.manifestHash)
      throw new Error(
        `the game's manifest (${actual.slice(0, 12)}…) is not the one configured (${config.manifestHash.slice(0, 12)}…)`,
      );
    if (config.manifest.gameId !== config.gameId) throw new Error(`the manifest is for ${config.manifest.gameId}`);
    const s = isRealityStore(store) ? store : fromBridgeStore(store);
    const b = new Bridge(
      config,
      s,
      o.now ?? Date.now,
      o.log ?? ((l) => console.log(JSON.stringify(l))),
      o.telemetry ?? new Telemetry(),
    );
    await s.rotateKeys({ tenantId: b.tenantId, keyId: config.eventKey.kid, publicKey: config.eventKey.raw });
    // Another instance (or process) accepted a signal for a player with a stream here: read the store.
    b.stopWatch = s.watch(b.tenantId, (playerId) => void b.streams.wake(playerId));
    // And a slow pass over every stream, should a wake-up be lost (a NOTIFY during a reconnection).
    const poll = o.pollMs ?? 5000;
    if (poll > 0) {
      b.timer = setInterval(() => {
        for (const p of b.streams.players()) void b.streams.wake(p);
      }, poll);
      b.timer.unref?.();
    }
    return b;
  }

  /** Stops watching the store (the store itself is closed by its owner). */
  close(): void {
    this.stopWatch();
    if (this.timer) clearInterval(this.timer);
  }

  /** The signals version this Bridge signs: V2 when configured, V1 otherwise (ADR 0010). */
  get signalVersion(): 1 | 2 {
    return this.config.signalVersion ?? 1;
  }

  /**
   * The keys a player verifies events with (public halves only). A V2 Bridge (ADR 0010) says the tenant, environment
   * and its own audience each key signs for; a V1 Bridge says nothing more, since a player refuses a V1 signal under a
   * key bound to a tenant.
   */
  keys(): {
    kid: string;
    raw: string;
    notBefore?: number;
    notAfter?: number;
    tenantId?: string;
    environment?: string;
    audience?: string;
  }[] {
    const ctx =
      this.signalVersion === 2
        ? { tenantId: this.tenantId, environment: this.config.environment ?? 'prod', audience: this.config.audience }
        : {};
    return [
      { kid: this.config.eventKey.kid, raw: this.config.eventKey.raw, ...ctx },
      ...(this.config.previousKeys ?? []).map((k) => ({ ...k, ...ctx })),
    ];
  }

  // ------------------------------------------------------------------ pairing

  /** The player's side asks to be linked: a short code to give to a connector (an email, a webhook form). */
  async startPairing(gameId: string, origin?: string): Promise<{ code: string; expiresAt: number }> {
    if (gameId !== this.config.gameId) throw new BridgeError(404, 'game', 'not a game of this Bridge');
    // Anyone may ask for a code: the codes waiting are bounded and swept.
    const now = this.now();
    await this.store.sweepPairings(this.tenantId, now);
    if ((await this.store.pendingPairings(this.tenantId, now)) >= this.limits.pendingPairings)
      throw new BridgeError(429, 'pairings', 'too many codes waiting for a confirmation: try again in a minute');
    const code = pairingCode();
    const expiresAt = now + this.limits.pairingMs;
    await this.store.putPairing(this.tenantId, { code, gameId, expiresAt, ...(origin ? { origin } : {}) });
    this.log({ event: 'pairing.started' });
    return { code, expiresAt };
  }
  private async pairingOf(code: string): Promise<Pairing> {
    const p = await this.store.pairing(this.tenantId, code);
    if (!p || p.expiresAt < this.now()) throw new BridgeError(404, 'pairing', 'unknown or expired code');
    return p;
  }

  /** A connector, under a Biscuit that may pair (`pair(true)`), confirms a code it received: a pseudonymous player. */
  confirmPairing(token: string, code: string): Promise<{ playerId: string }> {
    // Two connectors confirming one code at once: the second waits for the first and finds it confirmed.
    return this.locks.run(`pairing:${code}`, () => this.confirmPairingLocked(token, code));
  }

  private async confirmPairingLocked(token: string, code: string): Promise<{ playerId: string }> {
    const p = await this.pairingOf(code);
    if (p.playerId) throw new BridgeError(409, 'pairing', 'already confirmed');
    const b = await biscuitLib();
    let t: ReturnType<typeof b.Biscuit.fromBase64>;
    try {
      t = b.Biscuit.fromBase64(
        token,
        b.PublicKey.fromString(
          this.config.biscuitRootPublicKey.replace(/^ed25519\//, ''),
          b.SignatureAlgorithm.Ed25519,
        ),
      );
    } catch {
      throw new BridgeError(401, 'token', 'unreadable token');
    }
    for (const id of t.getRevocationIdentifiers() as string[])
      if (await this.store.tokenRevoked(this.tenantId, id)) throw new BridgeError(401, 'token', 'token revoked');
    const a = new b.AuthorizerBuilder();
    a.addCodeWithParameters(
      PAIR_POLICY,
      { now: { date: new Date(this.now()).toISOString() }, game: p.gameId, audience: this.config.audience },
      {},
    );
    // A token bound to a tenant checks it (4.1.10): the tenant asked, as a fact (policy.ts says the same for proposals).
    a.addCodeWithParameters('request_tenant({tenant});', { tenant: this.tenantId }, {});
    try {
      a.buildAuthenticated(t).authorizeWithLimits(LIMITS);
    } catch (e) {
      throw new BridgeError(403, 'denied', `this token may not pair (${errorClass(e)})`);
    }
    const playerId = `p-${randomBytes(8).toString('hex')}`;
    // The capability is drawn when the player claims it: until then the link holds the hash of a secret nobody has.
    const player: Player = {
      playerId,
      gameId: p.gameId,
      capabilityHash: sha256(b64url(randomBytes(32))),
      capabilityExpiresAt: this.now() + this.limits.capabilityMs,
      issuedAt: this.now(),
      sessionId: `s-${randomBytes(8).toString('hex')}`,
      ...(p.origin ? { origin: p.origin } : {}),
    };
    // Another instance may confirm the same code at the same instant: the store lets one through.
    if (!(await this.store.confirmPairing(this.tenantId, code, player)))
      throw new BridgeError(409, 'pairing', 'already confirmed');
    this.log({ event: 'pairing.confirmed', playerId });
    return { playerId };
  }

  /** The player's side collects its link once: its id and its capability (read and acknowledge, nothing else). */
  async claimPairing(
    code: string,
  ): Promise<{ status: 'pending' } | { status: 'paired'; playerId: string; capability: string; sessionId?: string }> {
    const p = await this.pairingOf(code);
    if (!p.playerId) return { status: 'pending' };
    if (p.claimed) throw new BridgeError(410, 'pairing', 'already claimed');
    const capability = b64url(randomBytes(32));
    const r = await this.store.claimPairing(this.tenantId, code, sha256(capability));
    if (r === 'pending') return { status: 'pending' };
    if (r !== 'claimed') throw new BridgeError(410, 'pairing', 'already claimed');
    const player = await this.store.player(this.tenantId, p.playerId);
    return {
      status: 'paired',
      playerId: p.playerId,
      capability,
      ...(player?.sessionId ? { sessionId: player.sessionId } : {}),
    };
  }

  // ------------------------------------------------------------------ signals

  /** A connector proposes a signal: authorised, checked against the manifest, deduplicated, sequenced, signed. */
  async propose(token: string, body: unknown): Promise<{ id: string; sequence: number; duplicate: boolean }> {
    const started = this.now();
    const r = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const str = (k: string, re = IDENT) => {
      const v = r[k];
      if (typeof v !== 'string' || !re.test(v)) throw new BridgeError(400, 'shape', `\`${k}\` is missing or malformed`);
      return v;
    };
    const playerId = str('playerId');
    const signal = str('signal');
    const source = str('source');
    const dedupeKey = str('dedupeKey', /^.{1,256}$/s);
    const occurredAt =
      typeof r.occurredAt === 'number' && Number.isInteger(r.occurredAt) && r.occurredAt >= 0
        ? r.occurredAt
        : undefined;
    const evidenceHash = r.evidenceHash === undefined ? undefined : str('evidenceHash', /^[a-f0-9]{64}$/);
    // The manifest (public, `GET /v1/manifest`) answers first; then the token, before any player is named: a caller
    // without a valid token learns nothing of which players exist (a 401 or 403 before any 404).
    const declared = this.config.manifest.signals.find((s) => s.id === signal);
    if (!declared) throw new BridgeError(422, 'signal', `signal ${signal} is not in the game's manifest`);
    if (declared.source !== source)
      throw new BridgeError(422, 'source', `signal ${signal} comes from ${declared.source}`);
    const proposal: Proposal = {
      gameId: this.config.gameId,
      playerId,
      source,
      signal,
      audience: this.config.audience,
      tenantId: this.tenantId,
    };
    const auth = await authorize(
      token,
      this.config.biscuitRootPublicKey,
      proposal,
      this.now(),
      await this.store.revokedTokens(this.tenantId),
    );
    if (!auth.ok) {
      this.log({ event: 'signal.refused', code: auth.code, signal });
      this.telemetry.count('signals.refused', { tenant: this.tenantId, code: auth.code });
      throw new BridgeError(auth.code === 'denied' ? 403 : 401, auth.code, auth.reason);
    }
    const player = await this.store.player(this.tenantId, playerId);
    if (!player || player.gameId !== this.config.gameId || player.revoked)
      throw new BridgeError(404, 'player', 'unknown or revoked player');
    // From here to the journal line, one proposal at a time for this player in this process, and one transaction in
    // the store across processes: the deduplication, the quota, the sequence and the write are decided together, and
    // what was checked before the Biscuit's `await` (the player, the token) is checked again, as a revocation may have
    // landed meanwhile.
    const out = await this.locks.run(`player:${playerId}`, async () => {
      const current = await this.store.player(this.tenantId, playerId);
      if (!current || current.revoked) throw new BridgeError(404, 'player', 'unknown or revoked player');
      for (const id of auth.revocationIds)
        if (await this.store.tokenRevoked(this.tenantId, id)) throw new BridgeError(401, 'revoked', 'token revoked');
      const connector = auth.revocationIds[0] ?? 'unknown';
      const appended = await this.store.appendSignal({
        tenantId: this.tenantId,
        playerId,
        dedupeKey,
        sign: ({ sequence, acked }) => {
          const now = this.now();
          const window = (this.recent.get(connector) ?? []).filter((t) => t > now - 60_000);
          if (window.length >= this.limits.perMinutePerConnector)
            throw new BridgeError(429, 'quota', 'too many signals this minute');
          if (sequence - 1 - acked >= this.limits.pendingPerPlayer)
            throw new BridgeError(429, 'pending', 'the player has too many signals waiting');
          window.push(now);
          this.recent.set(connector, window);
          const payload = this.payload(current, {
            id: `s-${randomBytes(8).toString('hex')}`,
            sequence,
            signal,
            source,
            occurredAt,
            dedupeKey,
            evidenceHash,
          });
          const { kid } = this.config.eventKey;
          this.telemetry.record('backlog', sequence - acked, { tenant: this.tenantId });
          return { id: payload.id, jws: signSignalSync(payload, this.signer, kid), kid, payload, at: now };
        },
      });
      return appended;
    });
    const { signal: row, duplicate } = out;
    if (duplicate) {
      this.telemetry.count('signals.duplicate', { tenant: this.tenantId });
      return { id: row.id, sequence: row.sequence, duplicate: true };
    }
    this.log({ event: 'signal.accepted', playerId, sequence: row.sequence, signal });
    this.telemetry.count('signals.accepted', { tenant: this.tenantId });
    this.telemetry.record('propose.ms', this.now() - started, { tenant: this.tenantId });
    // The signal is committed: delivery can no longer fail the proposal (a stream's read catches its own errors).
    await this.streams.wake(playerId);
    return { id: row.id, sequence: row.sequence, duplicate: false };
  }

  /** The payload signed for a player: V1, or V2 with the context it is signed for (ADR 0010). */
  private payload(
    player: Player,
    f: {
      id: string;
      sequence: number;
      signal: string;
      source: string;
      dedupeKey: string;
      occurredAt: number | undefined;
      evidenceHash: string | undefined;
    },
  ): WorldSignal {
    const v1 = {
      format: 'web-scumm-world-signal' as const,
      schema: 1 as const,
      id: f.id,
      sequence: f.sequence,
      gameId: this.config.gameId,
      playerId: player.playerId,
      signal: f.signal,
      source: f.source,
      ...(f.occurredAt !== undefined ? { occurredAt: f.occurredAt } : {}),
      receivedAt: this.now(),
      dedupeKey: f.dedupeKey,
      policyVersion: this.config.policyVersion,
      ...(f.evidenceHash ? { evidenceHash: f.evidenceHash } : {}),
    };
    if (this.signalVersion === 1) return v1;
    return {
      ...v1,
      schema: 2,
      tenantId: this.tenantId,
      environment: this.config.environment ?? 'prod',
      // The origin the player paired from; without one, the Bridge's own audience, which its keys declare.
      audience: player.origin ?? this.config.audience,
      sessionId: player.sessionId ?? player.playerId,
      keyId: this.config.eventKey.kid,
    };
  }

  private async streamEnds(playerId: string): Promise<'revoked' | 'expired' | undefined> {
    const p = await this.store.player(this.tenantId, playerId);
    if (!p || p.revoked) return 'revoked';
    if (p.capabilityExpiresAt < this.now()) return 'expired';
    return undefined;
  }

  /** A page of a player's journal, each signal as it goes out: signed by the current key, or set aside. */
  private async page(playerId: string, after: number, limit: number) {
    const rows = await this.store.listAfter({ tenantId: this.tenantId, playerId, after, limit });
    return Promise.all(rows.map(async (e) => ({ sequence: e.sequence, jws: await this.deliverable(e) })));
  }

  /**
   * A journal entry as the player receives it: signed by the current key. After a rotation the entries the previous
   * key signed are signed again (once, then kept in memory), so what waits for a player never depends on a key that
   * is about to leave the keyring; a 4.1.1 line, without its payload, goes out as it was signed. A row whose payload
   * or JWS no longer reads (a manual edit, a damaged restore) is quarantined and skipped (null), never sent.
   */
  private async deliverable(e: StoredSignal): Promise<string | null> {
    const why = !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(e.jws)
      ? 'not a compact JWS'
      : e.payload && !(e.payload.schema === 2 ? WorldSignalV2Schema : WorldSignalV1Schema).safeParse(e.payload).success
        ? 'payload is not a world signal'
        : e.payload &&
            (e.payload.playerId !== e.playerId ||
              e.payload.sequence !== e.sequence ||
              (e.payload.schema === 2 && e.payload.tenantId !== this.tenantId))
          ? 'payload names another player, sequence or tenant than its row'
          : undefined;
    if (why) {
      await this.store.quarantine({
        tenantId: this.tenantId,
        playerId: e.playerId,
        sequence: e.sequence,
        reason: why,
        at: this.now(),
      });
      this.telemetry.count('quarantine', { tenant: this.tenantId });
      this.log({ event: 'signal.quarantined', playerId: e.playerId, sequence: e.sequence, reason: why });
      return null;
    }
    const { kid } = this.config.eventKey;
    if (!e.payload || e.kid === kid) return e.jws;
    const k = `${this.tenantId}:${kid}:${e.playerId}:${e.sequence}`;
    let jws = this.resigned.get(k);
    if (jws !== undefined) {
      // Least recently used at the front: a hit moves to the back.
      this.resigned.delete(k);
      this.resigned.set(k, jws);
      return jws;
    }
    // A V2 payload names its key: signed again, it names the key that signs it now.
    const payload: WorldSignal = e.payload.schema === 2 ? { ...e.payload, keyId: kid } : e.payload;
    jws = signSignalSync(payload, this.signer, kid);
    this.resigned.set(k, jws);
    // Bounded (4.1.8): a Bridge with many players and a rotation is not a cache that grows with every delivery.
    while (this.resigned.size > this.limits.resignedCache) {
      const oldest = this.resigned.keys().next().value;
      if (oldest === undefined) break;
      this.resigned.delete(oldest);
    }
    return jws;
  }

  /** The player whose capability this is (read and acknowledge only). */
  async playerOf(capability: string | undefined): Promise<Player> {
    const p = capability ? await this.store.playerByCapability(this.tenantId, sha256(capability)) : undefined;
    if (!p || p.revoked) throw new BridgeError(401, 'capability', 'unknown or revoked link');
    if (p.capabilityExpiresAt < this.now()) throw new BridgeError(401, 'capability', 'link expired: pair again');
    if (p.issuedAt !== undefined && this.now() > p.issuedAt + this.limits.capabilityMaxMs)
      throw new BridgeError(401, 'capability', 'link too old: pair again');
    return p;
  }

  /** The player's side ends its own link (the pause menu's "Unlink"): revoked on the Bridge, not only forgotten. */
  async unlink(capability: string | undefined): Promise<void> {
    const p = await this.playerOf(capability);
    await this.store.putPlayer(this.tenantId, { ...p, revoked: true });
    this.streams.endAll(p.playerId, 'revoked');
    this.log({ event: 'player.unlinked', playerId: p.playerId });
  }

  /** The signed signals of a player after a sequence (the fetch by cursor; SSE sends the same), under the current key. */
  async signals(capability: string | undefined, after: number): Promise<{ sequence: number; jws: string }[]> {
    const p = await this.playerOf(capability);
    const out: { sequence: number; jws: string }[] = [];
    // The whole journal after the cursor, page by page (a fetch by cursor is bounded by `pendingPerPlayer`).
    for (let cursor = after; ; ) {
      const rows = await this.page(p.playerId, cursor, this.limits.streamPage);
      for (const r of rows) if (r.jws !== null) out.push({ sequence: r.sequence, jws: r.jws });
      if (rows.length < this.limits.streamPage) return out;
      cursor = rows.at(-1)?.sequence ?? cursor;
    }
  }

  /**
   * New signals of a player as they are accepted (SSE), from `after` (by default, its last sequence: only new ones).
   * Returns the unsubscribe function, whose `pump` sends what is already after the cursor; `onClose` is called when
   * the Bridge ends the stream itself (the link revoked or expired). At most `streamsPerPlayer` streams per player and
   * `streamsPerInstance` on this instance.
   */
  async subscribe(
    capability: string | undefined,
    on: (seq: number, jws: string) => void,
    onClose: (why: 'revoked' | 'expired') => void = () => {},
    o: { after?: number } = {},
  ): Promise<Subscription> {
    const p = await this.playerOf(capability);
    if (this.streams.count(p.playerId) >= this.limits.streamsPerPlayer) {
      this.telemetry.count('streams.refused', { tenant: this.tenantId, code: 'player' });
      throw new BridgeError(429, 'streams', `at most ${this.limits.streamsPerPlayer} open streams for a player`);
    }
    if (this.streams.size >= this.limits.streamsPerInstance) {
      this.telemetry.count('streams.refused', { tenant: this.tenantId, code: 'instance' });
      throw new BridgeError(429, 'streams', 'this instance holds as many streams as it may: try again');
    }
    const cursor = o.after ?? (await this.store.lastSequence(this.tenantId, p.playerId));
    const s: Stream = { playerId: p.playerId, cursor, on, close: onClose };
    const off = this.streams.add(s);
    return Object.assign(() => void off(), { pump: () => this.streams.read(s) });
  }

  /** Whether a player's stream may stay open (the heartbeat asks; a link revoked or expired meanwhile ends it). */
  async streamAlive(capability: string | undefined): Promise<boolean> {
    try {
      await this.playerOf(capability);
      return true;
    } catch {
      return false;
    }
  }

  /** Everything up to `through` is applied and saved on the player's side; the link lives on. */
  async ack(capability: string | undefined, through: unknown): Promise<void> {
    const p = await this.playerOf(capability);
    if (
      typeof through !== 'number' ||
      !Number.isInteger(through) ||
      through < 0 ||
      through > (await this.store.lastSequence(this.tenantId, p.playerId))
    )
      throw new BridgeError(400, 'shape', '`through` is a sequence the Bridge sent');
    await this.store.acknowledge({ tenantId: this.tenantId, playerId: p.playerId, sequence: through });
    await this.store.putPlayer(this.tenantId, { ...p, capabilityExpiresAt: this.now() + this.limits.capabilityMs });
    this.telemetry.count('acks', { tenant: this.tenantId });
  }

  // ------------------------------------------------------------------ the operator

  admin(token: string | undefined): void {
    const got = Buffer.from(token ? sha256(token) : '');
    const want = Buffer.from(this.config.adminTokenHash);
    if (got.length !== want.length || !timingSafeEqual(got, want))
      throw new BridgeError(401, 'admin', 'not the operator');
  }

  /** Revokes a player's link, or a connector's token (one of its revocation ids). */
  async revoke(adminToken: string | undefined, what: { playerId?: string; tokenId?: string }): Promise<void> {
    this.admin(adminToken);
    if (what.playerId) {
      const p = await this.store.player(this.tenantId, what.playerId);
      if (!p) throw new BridgeError(404, 'player', 'unknown player');
      await this.store.putPlayer(this.tenantId, { ...p, revoked: true });
      this.streams.endAll(p.playerId, 'revoked');
      this.log({ event: 'player.revoked', playerId: p.playerId });
    }
    if (what.tokenId) {
      if (!/^[a-f0-9]{16,256}$/.test(what.tokenId)) throw new BridgeError(400, 'shape', 'a revocation id is hex');
      await this.store.revokeToken(this.tenantId, what.tokenId);
      this.log({ event: 'token.revoked' });
    }
  }

  /** Deletes everything the Bridge holds about a player (wiki/en/bridge.install-run.md#retention). */
  async forgetPlayer(adminToken: string | undefined, playerId: string): Promise<void> {
    this.admin(adminToken);
    if (!(await this.store.player(this.tenantId, playerId))) throw new BridgeError(404, 'player', 'unknown player');
    await this.store.forgetPlayer(this.tenantId, playerId);
    this.streams.endAll(playerId, 'revoked');
    this.log({ event: 'player.forgotten' });
  }

  /** What the Bridge holds about a player: the link (without its secret) and the journal. */
  async exportPlayer(adminToken: string | undefined, playerId: string) {
    this.admin(adminToken);
    const p = await this.store.player(this.tenantId, playerId);
    if (!p) throw new BridgeError(404, 'player', 'unknown player');
    const { capabilityHash: _, ...link } = p;
    const signals: StoredSignal[] = [];
    for (let after = 0; ; ) {
      const rows = await this.store.listAfter({ tenantId: this.tenantId, playerId, after, limit: 1000 });
      signals.push(...rows);
      if (rows.length < 1000) break;
      after = rows.at(-1)?.sequence ?? after;
    }
    return {
      player: link,
      acked: await this.store.acked(this.tenantId, playerId),
      signals: signals.map(({ tenantId: _t, ...e }) => e),
    };
  }

  /** Whether the store answers (`/readyz`). */
  async ready(): Promise<{ store: string; streams: number }> {
    await this.store.ping();
    return { store: this.store.kind, streams: this.streams.size };
  }
}
