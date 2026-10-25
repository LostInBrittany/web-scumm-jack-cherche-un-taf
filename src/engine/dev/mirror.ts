// The placement editor's mirrors (#252): a checkbox in the Selection folder turns the selected prop or actor
// around, the layout's `flip` (and a prop's `flipV`), as the phone placement page already did.
import type { BladeApi, FolderApi } from 'tweakpane';
import type { Engine } from '../core/engine';
import type { Id, Layout, RoomDef } from '../core/types';
import type { Handle } from './overlay';

/** `flip` on a prop or an actor, `flipV` on a prop only. */
export type MirrorKey = 'flip' | 'flipV';
type Kind = 'prop' | 'actor';
type Mirrored = { flip?: boolean; flipV?: boolean };

/**
 * Where a mirror lives in the layout, or undefined when the element has no geometry yet (to place first). A prop shown
 * in a state whose variant sets its own value is edited there, as its position is; otherwise the prop's own value,
 * which every state without one falls back to (`dom/room.ts`).
 */
function target(L: Layout, kind: Kind, id: Id, key: MirrorKey, state?: string): Mirrored | undefined {
  if (kind === 'actor') return key === 'flip' ? L.actors?.[id] : undefined;
  const p = L.props?.[id];
  const ov = p && state ? p.states?.[state] : undefined;
  return ov && ov[key] !== undefined ? ov : p;
}

/** The mirror as the room shows it, or undefined when the element cannot carry it. */
export function mirrorOf(L: Layout, kind: Kind, id: Id, key: MirrorKey, state?: string): boolean | undefined {
  const t = target(L, kind, id, key, state);
  return t ? !!t[key] : undefined;
}

/**
 * Sets a mirror. On the prop's or actor's own entry, `false` removes the field, as the placement page does; on a
 * state's variant it stays written, or the state would fall back to the prop's own value.
 */
export function setMirror(L: Layout, kind: Kind, id: Id, key: MirrorKey, on: boolean, state?: string) {
  const t = target(L, kind, id, key, state);
  if (!t) return;
  if (on || t !== (kind === 'actor' ? L.actors?.[id] : L.props?.[id])) t[key] = on;
  else delete t[key];
}

/** The note under an actor's checkbox when its room sets `facing`: that wins over the layout (`dom/room.ts`). */
export function facingNote(room: RoomDef, id: Id): string | undefined {
  const f = room.actors?.[id]?.facing;
  return f ? `room facing '${f}':\nit wins over this` : undefined;
}

/**
 * The checkboxes for the selection (`prop:<id>` or `actor:<id>`), added to `folder`; nothing for anything else. A
 * prop is edited in the state shown. Turning an actor drops the facing a script left in the state (a `face` or a
 * `place`), which would hide the change, as a drag drops its remembered position. `changed` then redraws the room.
 */
export function mirrorControls(
  folder: FolderApi,
  selected: string,
  ctx: { engine: Engine; room: RoomDef; L: Layout; changed: (h: Handle) => void },
): BladeApi[] {
  const [k, id] = selected.split(':');
  if (!id || (k !== 'prop' && k !== 'actor')) return [];
  const state = k === 'prop' ? ctx.engine.propState(id, ctx.room) : undefined;
  const out: BladeApi[] = [];
  for (const [key, label] of [
    ['flip', 'mirror ↔'],
    ['flipV', 'mirror ↕'],
  ] as const) {
    const on = mirrorOf(ctx.L, k, id, key, state);
    if (on === undefined) continue;
    const b = folder.addBinding({ [key]: on }, key, { label });
    b.on('change', (ev) => {
      setMirror(ctx.L, k, id, key, ev.value, state);
      if (k === 'actor') delete ctx.engine.state.actors[`${ctx.room.id}.${id}`]?.facing;
      ctx.changed({ t: k === 'actor' ? 'actor-pos' : 'prop-pos', id });
    });
    out.push(b);
  }
  const note = k === 'actor' && out.length ? facingNote(ctx.room, id) : undefined;
  if (note) out.push(folder.addBinding({ note }, 'note', { readonly: true, multiline: true, rows: 2, label: '' }));
  return out;
}
