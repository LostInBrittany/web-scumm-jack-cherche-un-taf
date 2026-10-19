// Where the game runs (4.2.1, plan §6.1). On the dev server, beside the Studio. On the Studio Server, on the game's
// own origin: its code never runs with a member's Studio session. A page of it is opened with a ticket (used once,
// within 60 s) that the Studio asks for; the ticket becomes a game session on that origin.
import { goLogin, hosting, studioFetch } from './api-base';
import { h } from './ui';

const BASE: string = import.meta.env.BASE_URL ?? '/';

/** The origin the game's frames are on: the only one their messages are taken from and posted to. */
export const gameOrigin = (): string => hosting.play ?? location.origin;

/** Whether the game is on another origin: the Studio then cannot reach into its frame (`window.__game`). */
export const gameElsewhere = (): boolean => hosting.hosted;

/** The URL of a page of the game here, or null on a hosted Studio (it then needs a ticket: `gameUrl`). */
export const localGameUrl = (query: string): string | null => (hosting.hosted ? null : `${BASE}${query}`);

/** The URL of a page of the game (`?dev`, `?edit=garden`): here, or on the game's origin with a fresh ticket. */
export async function gameUrl(query: string): Promise<string> {
  if (!hosting.hosted) return `${BASE}${query}`;
  const r = await studioFetch('play-ticket', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `/${query}` }),
  });
  if (r.status === 401) goLogin();
  const data = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!r.ok || !data.url) throw new Error(data.error ?? `${r.status} ${r.statusText}`);
  return data.url;
}

/**
 * Opens a page of the game in a new tab. Hosted, the tab is opened at once (a browser blocks a window opened after
 * an await) and sent to the game when its ticket arrives; it never holds a reference back to the Studio.
 */
function openGame(query: string): void {
  if (!hosting.hosted) {
    window.open(`${BASE}${query}`, '_blank', 'noopener');
    return;
  }
  const w = window.open('about:blank', '_blank');
  if (!w) return;
  w.opener = null;
  gameUrl(query).then(
    (url) => w.location.replace(url),
    () => w.close(),
  );
}

/** A link that opens a page of the game in a new tab: a plain link here, a ticket first on a hosted Studio. */
export function gameLink(query: string, label: string, attrs: Record<string, string | undefined> = {}) {
  return h(
    'a',
    {
      ...attrs,
      href: hosting.hosted ? '#' : `${BASE}${query}`,
      target: '_blank',
      rel: 'noopener',
      onclick: (e: MouseEvent) => {
        if (!hosting.hosted) return;
        e.preventDefault();
        openGame(query);
      },
    },
    label,
  );
}
