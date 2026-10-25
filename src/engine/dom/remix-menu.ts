// Remix in the player (4.1.15, ADR 0018): the title's Remix button opens "Which world?" (the story, a new world, a
// typed seed `WS-XXXX-XXXX`, the daily challenge); the chosen world is kept in the browser (`<game>.world`) and the
// page starts again in it, so that the engine, its saves and its sessions are built from that world from the first
// frame. A shared link names a world too: `?seed=WS-…` or `?daily=<signed token>` (verified offline with the key of the
// game's manifest). The pause menu shows the world's code to copy, or "hidden until the end" in a masked mode
// (Mystery). Accessibility settings never touch the seed: nothing here reads them, and they never write the world.
import { compileVariant, loadVariant, type WorldVariant, WorldVariantSchema } from '../core/remix/compile';
import { compileGameManifest } from '../core/remix/apply';
import { MYSTERY_START_WINDOW_MS } from '../core/remix/categories';
import { REMIX_ALGORITHM_VERSION } from '../core/remix/manifest';
import { newSeedCode, normalizeSeed, RemixSeedError } from '../core/remix/seed-code';
import type { GameDef } from '../core/types';
import { trapFocus } from './a11y';
import { el, esc } from './app-shared';
import type { UiKey } from './ui-defaults';

/** What the menu needs of the player (an `App` is one). */
export interface RemixHost {
  game: GameDef;
  t(key: UiKey): string;
  presenter: { toast(text: string): void };
}

const KEY = (id: string) => `${id}.world`;
const PENDING = (id: string) => `${id}.world-start`;
const EVIDENCE = (id: string) => `${id}.world-evidence`;
const storage = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

/** The world this browser plays the game in, if one was chosen (else the story). */
export function storedWorld(gameId: string): WorldVariant | undefined {
  try {
    const raw = storage()?.getItem(KEY(gameId));
    return raw ? (JSON.parse(raw) as WorldVariant) : undefined;
  } catch {
    return undefined;
  }
}

/** What a speedrun in a Daily or Mystery world carries (`SpeedrunWorldEvidence`). */
type StoredEvidence =
  | { kind: 'daily'; token: string }
  | { kind: 'mystery'; commitmentToken: string; revealToken: string; startedAt: number };

/**
 * What a world rests on (4.1.16): the day's signed token of a Daily world, or (4.1.17) the Bridge's signed
 * commitment and reveal of a Mystery world, kept beside it so a speedrun in that world carries them. Only for the
 * world whose hash they name: another world has none. A Mystery run starts now (`startedAt`), never before the
 * reveal's own time (a clock a little behind the Bridge's would otherwise date it before), within the minute the reveal
 * allows (`mysteryLate`).
 */
export function storedEvidence(
  gameId: string,
  worldHash: string | undefined,
  now = Date.now(),
): StoredEvidence | undefined {
  try {
    const raw = storage()?.getItem(EVIDENCE(gameId));
    const e = raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
    if (!e || e.hash !== worldHash) return undefined;
    if (typeof e.token === 'string') return { kind: 'daily', token: e.token };
    if (typeof e.commitmentToken === 'string' && typeof e.revealToken === 'string') {
      const startedAt = typeof e.revealedAt === 'number' ? Math.max(now, e.revealedAt) : now;
      return { kind: 'mystery', commitmentToken: e.commitmentToken, revealToken: e.revealToken, startedAt };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether the minute a Mystery world's reveal allows has passed (4.1.17): a speedrun started now would be refused by
 * the verifier (`mystery-start-window`), so it is not started; a new Mystery world gives a new minute.
 */
export function mysteryLate(gameId: string, worldHash: string | undefined, now = Date.now()): boolean {
  try {
    const raw = storage()?.getItem(EVIDENCE(gameId));
    const e = raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
    return e?.hash === worldHash && typeof e?.revealedAt === 'number' && now - e.revealedAt > MYSTERY_START_WINDOW_MS;
  } catch {
    return false;
  }
}

function keepEvidence(
  gameId: string,
  hash: string,
  e: { token: string } | { commitmentToken: string; revealToken: string; revealedAt: number },
): void {
  try {
    storage()?.setItem(EVIDENCE(gameId), JSON.stringify({ hash, ...e }));
  } catch {
    /* no storage: a Daily or Mystery speedrun cannot start on this page (the recorder says why) */
  }
}

/** Keeps the chosen world; `start` asks the next page to begin a new game in it at once. */
export function keepWorld(gameId: string, v: WorldVariant | undefined, start = false): void {
  const s = storage();
  try {
    if (v) s?.setItem(KEY(gameId), JSON.stringify(v));
    else s?.removeItem(KEY(gameId));
    if (start) s?.setItem(PENDING(gameId), '1');
  } catch {
    /* no storage: the world lives for this page only */
  }
}

/** Whether a new game in a chosen world is waiting for this page (not consumed: the boot reads it). */
export function hasPendingStart(gameId: string): boolean {
  try {
    return storage()?.getItem(PENDING(gameId)) === '1';
  } catch {
    return false;
  }
}

/** Whether the page was reloaded to start a new game in a world just chosen (read once). */
export function takePendingStart(gameId: string): boolean {
  const s = storage();
  try {
    if (s?.getItem(PENDING(gameId)) !== '1') return false;
    s.removeItem(PENDING(gameId));
    return true;
  } catch {
    return false;
  }
}

/** The world of a seed in a mode of the game (an explicit error for a malformed seed). */
export function worldOf(game: GameDef, seed: string, mode = 'remix'): WorldVariant {
  return compileVariant(compileGameManifest(game), game.remix!, seed, REMIX_ALGORITHM_VERSION, mode);
}

/** The modes of the game's manifest a player may pick from the menu. */
const has = (game: GameDef, mode: string) => !!game.remix?.modes.some((m) => m.id === mode);

/**
 * "Which world?": resolves with the world chosen (the story is `story`), or null when the player closes the menu.
 * `daily` fetches and verifies the day's token (absent: the entry says it needs the Bridge).
 */
export function chooseWorld(
  host: RemixHost,
  parent: HTMLElement,
  daily?: () => Promise<WorldVariant>,
  mystery?: () => Promise<WorldVariant>,
): Promise<WorldVariant | null> {
  const t = (k: UiKey) => host.t(k);
  return new Promise((done) => {
    const d = el('div', 'dim');
    const m = el('div', 'menu', `<h3>${esc(t('remixTitle'))}</h3>`);
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-label', t('remixTitle'));
    const off = trapFocus(m, { onEscape: () => finish(null), restore: true });
    const finish = (v: WorldVariant | null) => {
      off();
      d.remove();
      done(v);
    };
    const button = (label: string, value: string, cls = '') => {
      const b = el('button', cls, `<span>${esc(label)}</span><span>${esc(value)}</span>`) as HTMLButtonElement;
      b.type = 'button';
      m.append(b);
      return b;
    };
    button(t('remixStory'), '▶').onclick = () => finish(worldOf(host.game, 'story'));
    if (has(host.game, 'remix'))
      button(t('remixRandom'), '🎲').onclick = () => finish(worldOf(host.game, newSeedCode()));
    if (has(host.game, 'remix')) {
      const form = el('form', 'remix-seed');
      const id = `remix-seed-${host.game.id}`;
      form.innerHTML = `<label for="${id}">${esc(t('remixSeed'))}</label>`;
      const input = el('input') as HTMLInputElement;
      Object.assign(input, { id, name: 'seed', autocomplete: 'off', spellcheck: false, placeholder: 'WS-XXXX-XXXX' });
      input.setAttribute('autocapitalize', 'characters');
      input.setAttribute('aria-describedby', `${id}-error`);
      const error = el('p', 'remix-error');
      error.id = `${id}-error`;
      error.setAttribute('aria-live', 'polite');
      const go = el('button', '', esc(t('remixPlay'))) as HTMLButtonElement;
      go.type = 'submit';
      form.append(input, go, error);
      form.onsubmit = (e) => {
        e.preventDefault();
        try {
          finish(worldOf(host.game, normalizeSeed(input.value)));
        } catch (x) {
          error.textContent = `${t('remixInvalid')}${x instanceof RemixSeedError ? ` (${x.message})` : ''}`;
          input.setAttribute('aria-invalid', 'true');
        }
      };
      m.append(form);
    }
    if (host.game.remix?.daily) {
      const b = button(t('remixDaily'), daily ? '★' : t('remixNoBridge'));
      b.disabled = !daily;
      b.onclick = () =>
        void daily!().then(finish, (e: unknown) => host.presenter.toast(e instanceof Error ? e.message : String(e)));
    }
    // 4.1.17: a Mystery world, its seed committed by the Bridge before it is revealed.
    if (host.game.remix?.daily && host.game.remix.modes.some((x) => x.mask)) {
      const b = button(t('remixMystery'), mystery ? '?' : t('remixNoBridge'));
      b.disabled = !mystery;
      b.onclick = () =>
        void mystery!().then(finish, (e: unknown) => host.presenter.toast(e instanceof Error ? e.message : String(e)));
    }
    d.append(m);
    parent.append(d);
    queueMicrotask(() => (m.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true }));
  });
}

/** The pause menu's world row: the code to copy, or "hidden until the end" in a masked mode before the end. */
export function worldRowText(host: RemixHost, done: boolean): string | undefined {
  const v = host.game.variant;
  if (!host.game.remix || !v) return undefined;
  const mode = host.game.remix.modes.find((m) => m.id === v.mode);
  if (mode?.mask && !done) return host.t('remixHidden');
  return v.mode === 'story' ? host.t('remixStory') : v.seed;
}

/** Copies the world's code (the pause menu's row); a toast says so. */
export async function copyWorld(host: RemixHost): Promise<void> {
  const v = host.game.variant;
  if (!v || v.mode === 'story') return;
  try {
    await globalThis.navigator?.clipboard?.writeText(v.seed);
    host.presenter.toast(`${host.t('remixCopied')}: ${v.seed}`);
  } catch {
    host.presenter.toast(v.seed);
  }
}

/** A day token verified offline with the game's daily key, as a world (an error says why it is refused). */
export async function dailyWorldOf(game: GameDef, token: string, now = Date.now()): Promise<WorldVariant> {
  const d = game.remix?.daily;
  if (!d) throw new RemixSeedError('this game has no daily challenge');
  // The Reality chunk only for a daily challenge (a game without `reality` does not precache it: the boot never needs it).
  const [{ importBridgeKey }, { verifyDayToken }] = await Promise.all([
    import('../reality/protocol'),
    import('../reality/daily'),
  ]);
  const r = await verifyDayToken(token, await importBridgeKey(d.kid, d.publicKey), game.id, now);
  if (!r.ok) throw new RemixSeedError(r.reason);
  const v = worldOf(game, r.token.seed, d.mode);
  keepEvidence(game.id, v.hash, { token });
  return v;
}

/**
 * A Mystery world from its Bridge's signed commitment and reveal (4.1.17), both verified offline with the game's
 * daily key: the reveal must be of that commitment, its seed the one the commitment hid. The tokens are kept beside
 * the world; a speedrun in it must start within the minute the reveal allows. Without a server witness the run is
 * `valid-unranked` (wiki/en/create.speedrun.md).
 */
export async function mysteryWorldOf(
  game: GameDef,
  commitmentToken: string,
  revealToken: string,
): Promise<WorldVariant> {
  const d = game.remix?.daily;
  if (!d) throw new RemixSeedError('this game has no Bridge key for a Mystery world');
  const [{ importBridgeKey }, { verifyCommitment, verifyReveal }] = await Promise.all([
    import('../reality/protocol'),
    import('../reality/daily'),
  ]);
  const key = await importBridgeKey(d.kid, d.publicKey);
  const c = await verifyCommitment(commitmentToken, key, game.id);
  if (!c.ok) throw new RemixSeedError(c.reason);
  const r = await verifyReveal(revealToken, key, c.token);
  if (!r.ok) throw new RemixSeedError(r.reason);
  if (!has(game, r.token.mode)) throw new RemixSeedError(`this game has no mode "${r.token.mode}"`);
  const v = worldOf(game, r.token.seed, r.token.mode);
  keepEvidence(game.id, v.hash, { commitmentToken, revealToken, revealedAt: r.token.revealedAt });
  return v;
}

/**
 * A Mystery world from the game's Bridge (4.1.17): `POST /v1/commit`, then `GET /v1/reveal/<id>`; undefined when the
 * game names no Bridge, no daily key or no masked mode.
 */
export function mysteryFetcher(game: GameDef): (() => Promise<WorldVariant>) | undefined {
  const bridge = game.reality?.bridge;
  if (!game.remix?.daily || !bridge || !game.remix.modes.some((m) => m.mask)) return undefined;
  const base = bridge.replace(/\/$/, '');
  return async () => {
    const c = await fetch(`${base}/v1/commit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ game: game.id }),
    });
    if (!c.ok) throw new RemixSeedError(`the Bridge answered ${c.status}`);
    const commit = (await c.json()) as { id: string; token: string };
    if (!/^[\w-]{1,64}$/.test(commit.id ?? '')) throw new RemixSeedError('the Bridge sent no commitment');
    const r = await fetch(`${base}/v1/reveal/${commit.id}`);
    if (!r.ok) throw new RemixSeedError(`the Bridge answered ${r.status}`);
    return mysteryWorldOf(game, commit.token, ((await r.json()) as { token: string }).token);
  };
}

/** The daily challenge from the game's Bridge (`reality.bridge`), or undefined when the game names none. */
export function dailyFetcher(game: GameDef): (() => Promise<WorldVariant>) | undefined {
  const bridge = game.reality?.bridge;
  if (!game.remix?.daily || !bridge) return undefined;
  return async () => {
    const r = await fetch(`${bridge.replace(/\/$/, '')}/v1/daily?game=${encodeURIComponent(game.id)}`);
    if (!r.ok) throw new RemixSeedError(`the Bridge answered ${r.status}`);
    return dailyWorldOf(game, ((await r.json()) as { token: string }).token);
  };
}

const toB64url = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string) => {
  if (!/^[\w-]*$/.test(s)) throw new RemixSeedError('this link names no world');
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** A frozen world as a link's parameter (`?world=`): its JSON in base64url (the Studio's export, a bug report). */
export function frozenParam(v: WorldVariant): string {
  return toB64url(new TextEncoder().encode(JSON.stringify(v)));
}

/**
 * A world a link names: `?world=<frozen world>` (kept as it is; its hash is checked when it is applied), `?seed=WS-…`
 * (the remix mode) or `?daily=<signed day token>`; undefined when none.
 */
export async function worldFromQuery(
  game: GameDef,
  q: URLSearchParams,
  now = Date.now(),
): Promise<WorldVariant | undefined> {
  if (!game.remix) return undefined;
  const frozen = q.get('world');
  // A frozen world is checked like a save's: its shape here, its hash and every value against the game by applyVariant.
  if (frozen) {
    const r = WorldVariantSchema.safeParse(JSON.parse(new TextDecoder().decode(fromB64url(frozen))));
    if (!r.success) throw new RemixSeedError('this link names no world');
    return loadVariant(compileGameManifest(game), r.data).variant;
  }
  const daily = q.get('daily');
  if (daily) return dailyWorldOf(game, daily, now);
  const seed = q.get('seed');
  return seed ? worldOf(game, seed) : undefined;
}
