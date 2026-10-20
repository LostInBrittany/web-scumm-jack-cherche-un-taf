// What the world shows: names, kinds, visibility, prop states, targets and where to stand to reach them.
// Part of the Engine (4.1.0 "Clarity"): its methods of the same name forward here, in the same order of effects.
import { check } from './cond';
import { FLOOR } from './define';
import { scaleAt } from './stage';
import type { CharacterDef, Id, Point, RoomDef } from './types';

import { near } from './engine-shared';
import type { Engine } from './engine';

/** Inactive players standing in this room with no actor declared for them: shown by the view, targetable. */
export function guests(eng: Engine, room: RoomDef = eng.room()): Record<Id, { char: Id; at: Point }> {
  const out: Record<Id, { char: Id; at: Point }> = {};
  for (const [pid, p] of Object.entries(eng.state.players ?? {})) {
    eng.reads?.add(`players:${pid}`);
    if (p.room !== room.id || pid === eng.heroId()) continue;
    if (Object.values(room.actors ?? {}).some((a) => a.char === pid)) continue;
    let at: Point = p.hero[room.id] ?? eng.layout(room.id).entries?.default ?? [320, 360];
    // Standing on the very spot of the active character (both arrived by the same entry): step aside.
    const h = eng.state.hero[room.id];
    if (h && Math.hypot(h[0] - at[0], h[1] - at[1]) < 12) at = [at[0] + (at[0] > 320 ? -60 : 60), at[1]];
    out[pid] = { char: pid, at };
  }
  return out;
}

/** Display name of any id (item, actor, prop, hotspot). */
export function nameOf(eng: Engine, id: Id, room: RoomDef = eng.room()): string {
  if (eng.game.items[id] && eng.state.inventory.includes(id)) return eng.game.items[id].name;
  const act = room.actors?.[id];
  if (act) return act.name ?? eng.game.characters[act.char]?.name ?? id;
  if (eng.guests(room)[id]) return eng.game.characters[id]?.name ?? id;
  if (room.props?.[id]?.name) return room.props[id].name!;
  if (room.hotspots?.[id]) return room.hotspots[id].name;
  if (eng.game.items[id]) return eng.game.items[id].name;
  if (eng.game.characters[id]) return eng.game.characters[id].name;
  return id;
}

/** A character's sheet with the variant that applies to the current state (sprites, mouths, portrait). */
export function character(eng: Engine, id: Id): CharacterDef | undefined {
  const c = eng.game.characters[id];
  if (!c?.variants || !eng.state) return c;
  const v = c.variants.find((x) => check(x.if, eng.state));
  return v
    ? {
        ...c,
        sprites: v.sprites ?? c.sprites,
        mouths: v.mouths ?? c.mouths,
        portrait: v.portrait ?? c.portrait,
        palette: v.palette ?? c.palette,
        paletteTolerance: v.palette ? v.paletteTolerance : c.paletteTolerance,
      }
    : c;
}

export function kindsOf(eng: Engine, id: Id, room: RoomDef = eng.room()): string[] {
  const act = room.actors?.[id];
  if (act) return eng.game.characters[act.char]?.kind ?? [];
  if (eng.guests(room)[id]) return eng.game.characters[id]?.kind ?? [];
  if (room.props?.[id]) return room.props[id].kind ?? [];
  if (room.hotspots?.[id]) return room.hotspots[id].kind ?? [];
  return eng.game.items[id]?.kind ?? [];
}

/** Has the inventory item already been used (`{ used }`)? */
export function isUsed(eng: Engine, id: Id): boolean {
  return !!eng.state?.used?.includes(id);
}

/**
 * Item greyed out and inert for Use / Give: it has been used, and no room or game rule (whose condition is true)
 * still targets it as `a` or `b`.
 */
export function usedLocked(eng: Engine, id: Id, room: RoomDef = eng.room()): boolean {
  if (!eng.isUsed(id)) return false;
  const has = (x: Id | Id[] | undefined) => x !== undefined && (Array.isArray(x) ? x.includes(id) : x === id);
  for (const list of [room.on ?? [], eng.game.rules.on ?? []]) {
    for (const r of list) if ((has(r.a) || has(r.b)) && eng.cond(r.if, room.id)) return false;
  }
  return true;
}

/** Is the entity visible in the current room? A moving character only shows in the room it is in. */
export function visible(eng: Engine, id: Id, room: RoomDef = eng.room(), guests = eng.guests(room)): boolean {
  const act = room.actors?.[id];
  if (eng.reads) {
    if (act) eng.reads.add(`where:${act.char}`);
    eng.reads.add(`visible:${room.id}.${id}`);
  }
  if (act) {
    const w = eng.state.where?.[act.char];
    if (w !== undefined && w !== room.id) return false;
  }
  const over = eng.state.actors[`${room.id}.${id}`]?.visible;
  if (over !== undefined) return over;
  const def = act ?? room.props?.[id] ?? room.hotspots?.[id];
  if (!def && guests[id]) return true;
  return def ? eng.cond(def.visible, room.id) : false;
}

/** The actor of a character in a room (its id in `room.actors`), if declared there. */
export function instanceOf(_eng: Engine, char: Id, room: RoomDef): Id | undefined {
  return Object.entries(room.actors ?? {}).find(([, a]) => a.char === char)?.[0];
}

export function propState(eng: Engine, id: Id, room: RoomDef = eng.room()): string | undefined {
  const def = room.props?.[id];
  if (!def) return undefined;
  return eng.state.props[`${room.id}.${id}`] ?? def.initial ?? (def.states ? Object.keys(def.states)[0] : undefined);
}

/** Everything that can be targeted in the room (ids), in the content's display order. */
export function targets(eng: Engine, room: RoomDef = eng.room()): Id[] {
  // The guests of the room once (4.1.5): `visible` asked for them again for every id, on every pointer move.
  const guests = eng.guests(room);
  const ids = [
    ...Object.keys(room.hotspots ?? {}),
    ...Object.entries(room.props ?? {})
      .filter(([, p]) => p.name)
      .map(([k]) => k),
    ...Object.entries(room.actors ?? {})
      .filter(([, a]) => a.interactive !== false)
      .map(([k]) => k),
    ...Object.keys(guests),
  ];
  return ids.filter((id) => visible(eng, id, room, guests));
}

/** Is this id something the room offers to target (declared and visible)? Reads only what concerns it. */
export function inScene(eng: Engine, id: Id, room: RoomDef): boolean {
  const declared =
    !!room.hotspots?.[id] ||
    !!room.props?.[id]?.name ||
    (room.actors?.[id] !== undefined && room.actors[id].interactive !== false) ||
    !!eng.guests(room)[id];
  return declared && eng.visible(id, room);
}

/** Distance from a character to where the hero stands to reach it: 44, or `actorGap` × their mean height × depth. */
function gap(eng: Engine, L: ReturnType<Engine['layout']>, at: Point, h: number | undefined): number {
  const k = eng.game.actorGap;
  if (!k) return 44;
  const heights = eng.game.skin?.heights;
  const hero = eng.game.characters[eng.heroId()]?.height ?? heights?.hero ?? 84;
  return Math.round(((k * (hero + (h ?? heights?.actor ?? 110))) / 2) * scaleAt(L, at));
}

/** Point where the hero stands to act on a target. */
export function approach(eng: Engine, id: Id, room: RoomDef = eng.room()): Point | null {
  const L = eng.layout(room.id);
  const floor = L.floor ?? FLOOR;
  const h = L.hotspots?.[id];
  if (h?.approach) return h.approach;
  const p0 = L.props?.[id];
  if (p0) {
    const st = eng.propState(id, room);
    const p = { ...p0, ...(st ? p0.states?.[st] : undefined) };
    // An approach point too far from the prop predates its move: recompute it.
    if (p.approach && near(p.approach, [p.x, p.y])) return p.approach;
    return [p.x, Math.min(floor, p.y + 12)];
  }
  const a = L.actors?.[id];
  if (a) {
    const o = eng.state.actors[`${room.id}.${id}`];
    const x = o?.x ?? a.x,
      y = o?.y ?? a.y;
    if (a.approach && near(a.approach, [x, y])) return a.approach;
    const char = room.actors?.[id]?.char;
    return [
      x + (x > 320 ? -1 : 1) * gap(eng, L, [x, y], a.h ?? (char ? eng.game.characters[char]?.height : undefined)),
      y,
    ];
  }
  if (h?.rect) return [h.rect[0] + h.rect[2] / 2, Math.min(floor, h.rect[1] + h.rect[3] + 12)];
  if (h?.poly) {
    const xs = h.poly.map((p) => p[0]),
      ys = h.poly.map((p) => p[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, Math.min(floor, Math.max(...ys) + 12)];
  }
  const g = eng.guests(room)[id];
  if (g) return [g.at[0] + (g.at[0] > 320 ? -1 : 1) * gap(eng, L, g.at, eng.game.characters[g.char]?.height), g.at[1]];
  return null;
}

/** Horizontal center of a target (for turning to face it). */
export function centerX(eng: Engine, id: Id, room: RoomDef = eng.room()): number | null {
  const L = eng.layout(room.id);
  const h = L.hotspots?.[id];
  if (h?.rect) return h.rect[0] + h.rect[2] / 2;
  if (h?.poly) return h.poly.reduce((s, p) => s + p[0], 0) / h.poly.length;
  const o = eng.state.actors[`${room.id}.${id}`];
  if (o?.x !== undefined) return o.x;
  const p = L.props?.[id];
  if (p) {
    const st = eng.propState(id, room);
    return (st ? p.states?.[st]?.x : undefined) ?? p.x;
  }
  return L.actors?.[id]?.x ?? eng.guests(room)[id]?.at[0] ?? null;
}
