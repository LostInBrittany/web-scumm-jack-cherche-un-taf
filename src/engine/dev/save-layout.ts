// The room editor's write (4.2.1): a room's layout through the Studio's API on the dev server
// (PUT /__studio/api/room/<id>/layout, one guarded operation of the game's journal).

import type { Layout } from '../core/types';

/** Rounds coordinates to the unit (scale factors keep two decimals): what the editor writes. */
export function roundLayout(L: Layout): Layout {
  const r = (v: unknown): unknown => {
    if (typeof v === 'number') return Math.round(v);
    if (Array.isArray(v)) return v.map(r);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, r(x)]));
    return v;
  };
  const out = r({ ...L, scale: undefined }) as Layout;
  if (L.scale) out.scale = L.scale.map(([y, s]) => [Math.round(y), Math.round(s * 100) / 100]) as Layout['scale'];
  else delete out.scale;
  return out;
}

/** `offline`: no Studio API here (a demo build, a static host); `error`: the Studio refused, with its reason. */
export async function putLayout(room: string, layout: unknown): Promise<{ offline: true } | { error?: string }> {
  try {
    const token = new URLSearchParams(location.search).get('token');
    const url = `/__studio/api/room/${encodeURIComponent(room)}/layout`;
    const r = await fetch(`${url}${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(layout),
    });
    if (r.ok) return {};
    // The Studio answers its refusals in JSON (an unknown room is a 404 too); anything else on 404/405 means there is
    // no Studio API here: the layout then goes to the patch.
    const t = await r.text();
    let studio: string | undefined;
    try {
      studio = (JSON.parse(t) as { error?: string }).error;
    } catch {
      studio = undefined;
    }
    if (studio !== undefined) return { error: studio };
    if (r.status === 404 || r.status === 405) return { offline: true };
    return { error: t };
  } catch {
    return { offline: true };
  }
}

/** The Studio's origin: another one when this page is on a hosted Studio's game origin, named by its meta tag (4.2.1). */
export const studioOrigin = (): string =>
  document.querySelector('meta[name="web-scumm-studio-origin"]')?.getAttribute('content') ?? location.origin;
