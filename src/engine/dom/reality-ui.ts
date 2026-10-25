// The player's link to the world outside (4.1.1, wiki/en/bridge.what-it-is.md): loaded by `import()` only when the game declares
// `reality`, so a game without it carries none of this. The pause menu's "World link": link this game (a code to give
// to the game's connector), see the link's state, unlink. Once linked, a RealityClient reads the Bridge (one tab at a
// time, through the Web Locks API), verifies each signal, hands it to the engine, waits for the durable save, then
// acknowledges. In the dev tools and the Studio (`?dev`, `?reality=sim`), a simulated Bridge stands in: the same path.
//
// What is kept in the browser: the Bridge's URL, the pseudonymous player id and the capability, under
// `<game>:reality-link` in localStorage. The capability only reads and acknowledges this game's signals; it is
// sensitive all the same (wiki/en/bridge.install-run.md), and never written into a save or a session.
import type { App } from './app';
import { RealityClient } from '../reality/client';
import { httpPort } from '../reality/http-port';
import { importBridgeKey, type Keyring } from '../reality/protocol';
import { SignalSimulator } from '../reality/simulator';
import { el, esc } from './app-shared';

/** The texts of the link, overridable in the game's `ui` like every other (English defaults). */
export const REALITY_UI = {
  realityLink: 'World link',
  realityStart: 'Link this game',
  realityCode: 'Give this code to the game: {code}',
  realityWaiting: 'Waiting for the link…',
  realityOpen: 'linked',
  realityOffline: 'offline, will retry',
  realityRevoked: 'unlinked by the game',
  realityNone: 'not linked',
  realitySimulated: 'simulated',
  realityUnlink: 'Unlink this game',
  realityMismatch: 'this save belongs to another link',
  realityRelink: 'Use this link with this save',
} as const;
type Key = keyof typeof REALITY_UI;

/** `mismatch` (4.1.2): the game in progress was linked as another player; it plays on, the link waits for a choice. */
export type LinkStatus = 'none' | 'pairing' | 'connecting' | 'open' | 'retrying' | 'revoked' | 'simulated' | 'mismatch';
interface LinkRecord {
  bridge: string;
  playerId: string;
  capability: string;
  pairedAt: number;
  /** The link's id (4.1.10): a V2 signal of another link is refused. Absent in a link made before 4.1.10. */
  sessionId?: string;
}

export class RealityLink {
  status: LinkStatus = 'none';
  simulator?: SignalSimulator;
  client?: RealityClient;
  private listeners = new Set<(s: LinkStatus) => void>();
  private releaseLock?: () => void;
  /** A reconnection or a retry planned: cancelled by `unlink` and `relink`, so an old link never comes back. */
  private retry?: ReturnType<typeof setTimeout>;

  constructor(private app: App) {}

  t(k: Key, vars: Record<string, string> = {}): string {
    const own = (this.app.game.ui as unknown as Record<string, string | undefined>)[k];
    return (own ?? REALITY_UI[k]).replace(/\{(\w+)\}/g, (_m, v: string) => vars[v] ?? '');
  }
  private get storageKey() {
    return `${this.app.game.id}:reality-link`;
  }
  private get bridge(): string | undefined {
    return this.app.game.reality?.bridge;
  }
  record(): LinkRecord | null {
    try {
      const r = JSON.parse(localStorage.getItem(this.storageKey) ?? 'null') as LinkRecord | null;
      return r && typeof r.capability === 'string' && typeof r.playerId === 'string' ? r : null;
    } catch {
      return null;
    }
  }
  onStatus(f: (s: LinkStatus) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }
  private set(s: LinkStatus) {
    if (s === this.status) return;
    const was = this.status;
    this.status = s;
    for (const f of this.listeners) f(s);
    // Announced politely, never over a line being said: a toast, not a dialogue.
    if (s === 'open' && was !== 'retrying')
      this.app.presenter.toast(`${this.t('realityLink')}: ${this.t('realityOpen')}`);
    if (s === 'revoked') this.app.presenter.toast(`${this.t('realityLink')}: ${this.t('realityRevoked')}`);
  }
  statusText(): string {
    const k: Record<LinkStatus, Key> = {
      none: 'realityNone',
      pairing: 'realityWaiting',
      connecting: 'realityWaiting',
      open: 'realityOpen',
      retrying: 'realityOffline',
      revoked: 'realityRevoked',
      simulated: 'realitySimulated',
      mismatch: 'realityMismatch',
    };
    return this.t(k[this.status]);
  }

  /** Starts what the game has: the simulator in the dev tools, else the stored link, else nothing until paired. */
  async start(o: { simulated?: boolean } = {}): Promise<void> {
    if (o.simulated) {
      this.simulator = await SignalSimulator.create(this.app.game, {
        after: this.app.engine.state.reality?.cursor ?? 0,
      });
      this.run(this.simulator.port(), this.simulator.keyring, this.simulator.playerId);
      this.set('simulated');
      return;
    }
    const r = this.record();
    if (r) await this.connect(r);
  }

  /** The last failure of the client, for the diagnostics (a message, never a payload). */
  lastError = '';

  private run(
    port: ReturnType<SignalSimulator['port']>,
    keyring: Keyring,
    playerId: string,
    refreshKeys?: () => Promise<Keyring>,
    attempt = 0,
    sessionId?: string,
  ) {
    const client = new RealityClient({
      engine: this.app.engine,
      store: this.app.engine.store,
      port,
      keyring,
      ...(refreshKeys ? { refreshKeys } : {}),
      playerId,
      // A V2 signal names the link it was signed for (ADR 0010); the page's origin is checked by the client itself.
      ...(sessionId ? { context: { sessionId } } : {}),
      // The game in progress belongs to another player: the link idles until the pause menu's choice (`relink`).
      onMismatch: () => this.set('mismatch'),
      // A speedrun in progress keeps each signal's JWS as its Reality proof (4.1.14).
      onSigned: (jws, x) => this.app.speedrun?.recorder.realitySignal(jws, x),
    });
    this.client = client;
    void client.run().catch((e: unknown) => {
      // A failure of the client (a save that did not complete, a transport error) never ends the link: it starts again
      // from the saved cursor, and what was not acknowledged comes again.
      this.lastError = e instanceof Error ? e.message : String(e);
      console.warn(`Reality link: ${this.lastError}`);
      if (this.client !== client || this.status === 'revoked' || this.status === 'none' || this.status === 'mismatch')
        return;
      this.set('retrying');
      this.retry = setTimeout(
        () => this.run(port, keyring, playerId, refreshKeys, attempt + 1, sessionId),
        Math.min(60_000, 1000 * 2 ** attempt),
      );
    });
  }

  /** Connects with a stored link: the Bridge's keys over TLS, one tab at a time, the client reading the stream. */
  private async connect(r: LinkRecord): Promise<void> {
    this.set('connecting');
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (locks) {
      // Another tab of this game holds the link: this one waits its turn (two engines must not apply the same signal).
      await new Promise<void>((acquired) => {
        void locks.request(`web-scumm-reality-${this.app.game.id}`, () => {
          acquired();
          return new Promise<void>((release) => (this.releaseLock = release));
        });
      });
    }
    let keyring: Keyring;
    try {
      keyring = await fetchKeys(r.bridge);
    } catch {
      this.set('retrying');
      this.retry = setTimeout(() => void this.connect(r), 10_000);
      this.releaseLock?.();
      return;
    }
    const port = httpPort({
      url: r.bridge,
      capability: r.capability,
      onStatus: (s) => this.set(s === 'open' ? 'open' : s === 'closed' ? this.status : 'retrying'),
      fetch: async (input, init) => {
        const res = await fetch(input, init);
        // A capability the Bridge no longer knows: the link was revoked or expired; forget it.
        if (res.status === 401) {
          this.forget();
          this.set('revoked');
          void this.client?.stop();
        }
        return res;
      },
    });
    // The keys again when a signal names one this keyring does not hold: the Bridge rotated while the link was open.
    this.run(port, keyring, r.playerId, () => fetchKeys(r.bridge), 0, r.sessionId);
  }

  /** Links this game: a code to give to the game's connector, then the link collected when it confirms it. */
  async pair(onCode: (code: string) => void, signal?: AbortSignal): Promise<boolean> {
    const bridge = this.bridge;
    if (!bridge) return false;
    this.set('pairing');
    const res = await fetch(new URL('v1/pairings', bridge), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: this.app.game.id }),
    });
    const { code, expiresAt } = (await res.json()) as { code: string; expiresAt: number };
    onCode(code);
    while (Date.now() < expiresAt && !signal?.aborted) {
      await new Promise((ok) => setTimeout(ok, 2000));
      const r = (await (await fetch(new URL(`v1/pairings/${code}`, bridge))).json()) as {
        status: string;
        playerId?: string;
        capability?: string;
        sessionId?: string;
      };
      if (r.status === 'paired' && r.playerId && r.capability) {
        const rec: LinkRecord = {
          bridge,
          playerId: r.playerId,
          capability: r.capability,
          pairedAt: Date.now(),
          ...(typeof r.sessionId === 'string' && /^[\w.:-]{1,128}$/.test(r.sessionId)
            ? { sessionId: r.sessionId }
            : {}),
        };
        try {
          localStorage.setItem(this.storageKey, JSON.stringify(rec));
        } catch {
          /* private mode: linked for this visit only */
        }
        await this.connect(rec);
        return true;
      }
    }
    this.set('none');
    return false;
  }

  forget(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      /* nothing stored */
    }
  }

  /** Ends the client and the tab's lock, the stored link kept: the next start connects again (`App.destroy`). */
  async stop(): Promise<void> {
    clearTimeout(this.retry);
    const client = this.client;
    this.client = undefined;
    await client?.stop();
    this.releaseLock?.();
  }

  /**
   * Unlinks this game: the link is revoked on the Bridge (`POST /v1/unlink`, so a capability copied from this browser
   * stops working too) and forgotten here. Offline, the revocation is asked anyway and lost: the capability then
   * ends with its expiry or the operator's revocation.
   */
  async unlink(): Promise<void> {
    clearTimeout(this.retry);
    const r = this.record();
    this.forget();
    await this.client?.stop();
    this.releaseLock?.();
    this.set('none');
    if (!r) return;
    try {
      await fetch(new URL('v1/unlink', r.bridge), {
        method: 'POST',
        headers: { Authorization: `Bearer ${r.capability}` },
      });
    } catch {
      /* offline: the capability ends with its expiry or the operator's revocation */
    }
  }

  /**
   * Binds the game in progress to this device's link (after a `mismatch`): its link state starts over for this
   * player (cursor 0, nothing pending), as a loaded game, so the session and its replay stay exact. The signals whose
   * effect the save already has (`once`) are not applied again; the Bridge delivers this player's own from the start.
   */
  async relink(): Promise<void> {
    const r = this.record();
    if (!r || this.status !== 'mismatch') return;
    clearTimeout(this.retry);
    await this.client?.stop();
    this.releaseLock?.();
    const s = JSON.parse(JSON.stringify(this.app.engine.state)) as typeof this.app.engine.state;
    s.reality = { playerId: r.playerId, cursor: 0, applied: {} };
    await this.app.engine.load(s);
    await this.connect(r);
  }

  /** The pause menu's page: the state of the link and what can be done with it. */
  menu(m: HTMLElement, back: () => void): void {
    m.innerHTML = `<h3>${esc(this.t('realityLink').toUpperCase())}</h3>`;
    const status = el('p', 'reality-status', esc(this.statusText()));
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    m.append(status);
    const stop = this.onStatus(() => (status.textContent = this.statusText()));
    const button = (t: string, v: string) => {
      const b = el('button', '', `<span>${esc(t)}</span><span>${esc(v)}</span>`);
      m.append(b);
      return b;
    };
    const ctrl = new AbortController();
    if (this.status === 'none' || this.status === 'revoked') {
      if (this.bridge)
        button(this.t('realityStart'), '⇄').onclick = () => {
          void this.pair((code) => (status.textContent = this.t('realityCode', { code })), ctrl.signal);
        };
    } else if (this.status === 'mismatch') {
      button(this.t('realityRelink'), '⇄').onclick = () => {
        void this.relink().then(() => {
          stop();
          back();
        });
      };
      button(this.t('realityUnlink'), '✕').onclick = () => void this.unlink();
    } else if (this.status !== 'simulated') button(this.t('realityUnlink'), '✕').onclick = () => void this.unlink();
    button(this.app.game.ui.resume, '▶').onclick = () => {
      ctrl.abort();
      stop();
      back();
    };
  }
}

/** The Bridge's verification keys (`GET /v1/keys`: current and previous, with their windows). */
async function fetchKeys(bridge: string): Promise<Keyring> {
  const res = await fetch(new URL('v1/keys', bridge));
  const { keys } = (await res.json()) as {
    keys: {
      kid: string;
      raw: string;
      notBefore?: number;
      notAfter?: number;
      tenantId?: string;
      environment?: 'prod' | 'staging' | 'dev';
      audience?: string;
    }[];
  };
  // The fields a key may carry, picked one by one: nothing else of the response reaches the keyring.
  return Promise.all(
    keys.map((k) =>
      importBridgeKey(k.kid, k.raw, {
        ...(typeof k.notBefore === 'number' ? { notBefore: k.notBefore } : {}),
        ...(typeof k.notAfter === 'number' ? { notAfter: k.notAfter } : {}),
        ...(typeof k.tenantId === 'string' ? { tenantId: k.tenantId } : {}),
        ...(k.environment === 'prod' || k.environment === 'staging' || k.environment === 'dev'
          ? { environment: k.environment }
          : {}),
        ...(typeof k.audience === 'string' ? { audience: k.audience } : {}),
      }),
    ),
  );
}

/** Starts the link of a game that declares `reality` (bootGame, after the App exists). */
export async function startReality(app: App, o: { simulated?: boolean } = {}): Promise<RealityLink> {
  const link = new RealityLink(app);
  await link.start(o);
  return link;
}
