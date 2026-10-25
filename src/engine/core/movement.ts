// Moving through the world: walking to a point, entering a room, the map and its travel, a teleport.
// Part of the Engine (4.1.1): its methods of the same name forward here, in the same order of effects.

import type { Id, Point, RoomDef } from './types';

import type { Engine } from './engine';

/** Walk to a point on the floor. */
export async function walkTo(eng: Engine, p: Point): Promise<void> {
  if (eng.busy) return;
  const g = eng.busyState.guide;
  if (g) {
    await eng.run(async () => {
      await eng.ui.say(eng.heroId(), eng.text(g.say), {});
    });
    return;
  }
  const end = await eng.ui.walk(eng.heroId(), p, false);
  if (end) {
    eng.state.hero[eng.state.room] = end;
    eng.save();
  }
}

/** Travel to a place on the map. */
export async function travel(eng: Engine, place: Id): Promise<void> {
  const p = eng.game.map?.places[place];
  if (!p || !eng.state.unlocked.includes(place)) return;
  eng.begin({ travel: place });
  try {
    await eng.run(() => eng.enter(p.room, undefined, true));
  } finally {
    eng.end();
  }
}

/** Opens the map from the UI. */
export async function openMap(eng: Engine): Promise<void> {
  if (eng.busy) return;
  eng.begin({ map: true });
  try {
    await eng.run(async () => {
      const pick = await eng.pickPlace();
      if (pick) {
        const p = eng.game.map?.places[pick];
        if (p) await eng.enter(p.room, undefined, true);
      }
    });
  } finally {
    eng.end();
  }
}

/** Goes to a room without playing its arrival script (dev panel). */
export async function teleport(eng: Engine, id: Id): Promise<void> {
  eng.begin({ enter: id });
  try {
    await eng.enter(id, undefined, false);
  } finally {
    eng.end();
  }
}

// ------------------------------------------------------------------ rooms
/** Enters a room: state, display, music, then arrival script. */
export async function enter(eng: Engine, id: Id, at: Id | Point | undefined, runEnter: boolean) {
  const room = eng.room(id);
  const from = eng.state.room;
  if (eng.state.room !== id || at !== undefined) eng.state.camera = { x: 0, follow: true };
  eng.state.room = id;
  eng.journal.emit({ kind: 'roomEntered', room: id, ...(from && from !== id ? { from } : {}) });
  eng.writes?.add('*');
  const L = eng.layout(id);
  if (at) eng.state.hero[id] = Array.isArray(at) ? at : (L.entries?.[at] ?? L.entries?.default ?? [320, 360]);
  else eng.state.hero[id] ??= L.entries?.default ?? [320, 360];
  eng.runClock.enter(id, at);
  eng.state.visited[id] = (eng.state.visited[id] ?? 0) + 1;
  eng.save();
  await eng.ui.enterRoom(room, eng.state);
  eng.ui.inventory(eng.state.inventory, eng.state.used);
  if (room.music) eng.ui.music({ play: room.music });
  eng.onChange();
  if (runEnter && room.onEnter) {
    eng.ran(`rule:${id}/enter`);
    await eng.exec(room.onEnter, { room, fast: false });
  }
  if (runEnter) eng.startScripts(false);
}

/**
 * After the walk to a target: the hero turns towards it, and a targeted character turns to face the hero (two
 * characters talking look at each other).
 */
export function faceEachOther(eng: Engine, id: Id, room: RoomDef) {
  const x = eng.centerX(id, room);
  const hx = eng.state.hero[room.id]?.[0];
  if (x === null || hx === undefined) return;
  eng.ui.face(eng.heroId(), x < hx ? 'left' : 'right');
  if (room.actors?.[id] && Math.abs(hx - x) > 8) eng.ui.face(id, hx < x ? 'left' : 'right');
}
