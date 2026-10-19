// Where the Studio's API lives. The dev server serves it under /__studio/api (tools/studio/plugin.ts); the Studio
// Server (4.2.1) under /api, and says so in a meta tag of the page it serves (studio-server/src/server/client.ts),
// with the game's origin. One module, so no other spells the path itself.

export interface Hosting {
  /** On the Studio Server: logins, roles, the game on its own origin. */
  hosted: boolean;
  api: string;
  /** The game's origin (hosted): every page that runs the game is opened there, with a ticket. */
  play?: string;
}

function read(): Hosting {
  const local = { hosted: false, api: '/__studio/api' };
  const m = typeof document === 'undefined' ? null : document.querySelector('meta[name="web-scumm-studio"]');
  if (!m) return local;
  try {
    const v = JSON.parse(m.getAttribute('content') ?? '') as Partial<Hosting>;
    if (v.hosted === true && typeof v.api === 'string' && /^\/\w+$/.test(v.api) && typeof v.play === 'string')
      return { hosted: true, api: v.api, play: new URL(v.play).origin };
  } catch {
    /* not ours: the local Studio */
  }
  return local;
}

export const hosting: Hosting = read();

/** The URL of an API route: `apiUrl('game')` → `/__studio/api/game`. */
export const apiUrl = (path: string) => `${hosting.api}/${path}`;

/**
 * A request to the API, with the Studio's own header: the Studio Server refuses a write without it (plan §3.4,
 * policy A: with `Origin` and JSON, what no other site's page can send without a preflight).
 */
export function studioFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('x-studio-request', '1');
  return fetch(apiUrl(path), { ...init, headers, credentials: 'same-origin' });
}

/** Where a hosted Studio sends someone whose session has ended: the login, then back here. */
export const loginUrl = () =>
  `/auth/login?returnTo=${encodeURIComponent(`/${typeof location === 'undefined' ? '' : location.hash}`)}`;

/**
 * Goes to the login, once: back from it within 30 s without a session (a cookie the browser did not keep, a provider
 * that logs in silently), the page says so instead of going round forever.
 */
export function goLogin(): void {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem('studio.login-at') ?? 0);
    sessionStorage.setItem('studio.login-at', String(Date.now()));
  } catch {
    /* no storage: one try, then the same message */
  }
  if (Date.now() - last < 30_000) throw new Error('the login did not hold: this browser may refuse the session cookie');
  location.assign(loginUrl());
}

/** The session holds: a later end of it may go to the login again. */
export function loginHeld(): void {
  try {
    sessionStorage.removeItem('studio.login-at');
  } catch {
    /* no storage */
  }
}
