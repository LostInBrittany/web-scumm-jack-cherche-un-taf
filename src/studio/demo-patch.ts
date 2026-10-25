// Studio demo mode (no server, e.g. GitHub Pages): the user's edits are a list of patches kept in localStorage under
// `web-scumm.studio-demo.<game>`, replayed on top of the build-time snapshot by the Studio (src/studio/api-browser.ts)
// and on top of the compiled game by the engine view (src/main.ts, with ?edit / ?dev only). Pure: no DOM access, the
// storage is passed in, so the tests run it in node.
import type { GameDef, Id, Layout, RoomDef } from '@engine/core/types';
import { classify, parsePath, type Seg } from '../../tools/studio/paths';
import type { AddEntity, StudioPatch } from '../../tools/studio/types';
import { must } from '../engine/core/must';

/** The subset of the Storage interface used here (localStorage, or a Map-backed fake in tests). */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const storageKey = (game: string) => `web-scumm.studio-demo.${game}`;

export function readPatches(store: KeyValue | undefined, game: string): StudioPatch[] {
  try {
    const raw = store?.getItem(storageKey(game));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.kind === 'string') : [];
  } catch {
    return [];
  }
}

export function writePatches(store: KeyValue | undefined, game: string, patches: StudioPatch[]) {
  try {
    if (patches.length) store?.setItem(storageKey(game), JSON.stringify(patches));
    else store?.removeItem(storageKey(game));
  } catch {
    /* storage full or blocked: the edits live until the page is closed */
  }
}

/** Deep copy of plain data that keeps functions (and other non-plain values) by reference. */
export function cloneData<T>(v: T): T {
  if (Array.isArray(v)) return v.map(cloneData) as T;
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cloneData(x)])) as T;
  }
  return v;
}

type Obj = Record<string | number, unknown>;

function at(root: unknown, segs: Seg[]): unknown {
  let v = root;
  for (const s of segs) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Obj)[s];
  }
  return v;
}

/**
 * Applies a text edit (`setText` semantics, wiki/en/studio.api.md#texts) to a room definition: replace the string at
 * `path`, `value: null` deletes a list line (or a whole look entry; the last line of a look list removes the entry),
 * a path ending in `[+]` appends a line (`look.<id>[+]` creates the entry, and turns a single look line into a list).
 * Best effort on the data: returns false when the definition has nothing at that path (a text built by code).
 */
export function editRoomText(def: RoomDef, path: string, value: string | null): boolean {
  const segs = parsePath(path);
  // parsePath throws on an empty path
  const last = must(segs[segs.length - 1], 'last path segment');
  if (last === '+') {
    if (value === null) return false;
    const list = segs.slice(0, -1);
    const target = at(def, list);
    if (Array.isArray(target)) {
      target.push(value);
      return true;
    }
    if (list.length === 2 && list[0] === 'look') {
      const look = ((def as unknown as Obj).look ??= {}) as Obj;
      const id = list[1] as string;
      look[id] = typeof look[id] === 'string' ? [look[id], value] : value;
      return true;
    }
    return false;
  }
  const parent = at(def, segs.slice(0, -1));
  if (parent === null || typeof parent !== 'object') return false;
  if (value === null) {
    if (Array.isArray(parent) && typeof last === 'number') {
      if (last >= parent.length) return false;
      if (segs[0] === 'look' && segs.length === 3 && parent.length === 1) {
        delete ((def as unknown as Obj).look as Obj)[must(segs[1], 'look id segment')];

        return true;
      }
      parent.splice(last, 1);
      return true;
    }
    if (segs[0] === 'look' && segs.length === 2 && last in (parent as Obj)) {
      delete (parent as Obj)[last];
      return true;
    }
    return false;
  }
  const cur = (parent as Obj)[last];
  // A list line with an id (`{ id, text }`): its text.
  if (cur && typeof cur === 'object' && typeof (cur as Obj).text === 'string') {
    (cur as Obj).text = value;
    return true;
  }
  if (typeof cur !== 'string') return false;
  (parent as Obj)[last] = value;
  return true;
}

/** Adds a prop / hotspot / actor (`addEntity` semantics) to a room definition. */
export function addRoomEntity(def: RoomDef, e: AddEntity, characterName?: string) {
  const name = e.name?.trim() ?? '';
  const d = def as unknown as Obj;
  if (e.kind === 'prop') ((d.props ??= {}) as Obj)[e.id] = { name, ...(e.img ? { img: e.img } : {}) };
  else if (e.kind === 'hotspot') ((d.hotspots ??= {}) as Obj)[e.id] = { name };
  else ((d.actors ??= {}) as Obj)[e.id] = { char: e.char, ...(name && name !== characterName ? { name } : {}) };
  if (e.look?.trim()) editRoomText(def, `look.${e.id}[+]`, e.look.trim());
}

/** The place `addEntity` gives a new entity in the layout (prop: foot, height 60; hotspot: 60 × 60 box; actor: feet). */
export function placeEntity(layout: Layout, e: AddEntity): Layout {
  const L = cloneData(layout);
  const x = Math.round(Math.max(0, Math.min(640, e.at[0]))),
    y = Math.round(Math.max(0, Math.min(400, e.at[1])));
  if (e.kind === 'prop') (L.props ??= {})[e.id] = { x, y, h: 60 };
  else if (e.kind === 'hotspot')
    (L.hotspots ??= {})[e.id] = { rect: [Math.max(0, x - 30), Math.max(0, y - 30), 60, 60] };
  else (L.actors ??= {})[e.id] = { x, y };
  return L;
}

/** Is this path a text (an id, a flag or an image ref is not)? `[+]` is checked on its first line. */
export function isTextPath(path: string): boolean {
  const segs = parsePath(path);
  return !!classify(segs[segs.length - 1] === '+' ? [...segs.slice(0, -1), 0] : segs);
}

/**
 * The compiled game with the room patches applied (texts reachable by their path, added entities) and the layouts
 * with the layout patches: what the engine view shows in demo mode. Rooms without patches are shared, not copied.
 */
export function patchGame(
  game: GameDef,
  layouts: Record<Id, Layout>,
  patches: StudioPatch[],
): { game: GameDef; layouts: Record<Id, Layout> } {
  const rooms = new Map<Id, RoomDef>();
  const room = (id: Id) => {
    if (!rooms.has(id)) {
      const r = game.rooms.find((x) => x.id === id);
      if (r) rooms.set(id, cloneData(r));
    }
    return rooms.get(id);
  };
  const outLayouts = { ...layouts };
  for (const p of patches) {
    try {
      if (p.kind === 'text') {
        const r = room(p.room);
        if (r) editRoomText(r, p.path, p.value);
      } else if (p.kind === 'entity') {
        const r = room(p.room);
        if (!r) continue;
        addRoomEntity(r, p.entity, p.entity.char ? game.characters[p.entity.char]?.name : undefined);
        outLayouts[p.room] = placeEntity(outLayouts[p.room] ?? {}, p.entity);
      } else if (p.kind === 'layout') outLayouts[p.room] = p.layout;
    } catch {
      /* a patch that no longer fits the game is skipped */
    }
  }
  if (!rooms.size) return { game, layouts: outLayouts };
  return { game: { ...game, rooms: game.rooms.map((r) => rooms.get(r.id) ?? r) }, layouts: outLayouts };
}
