// Commands: `exec` runs a list of `Cmd`, `step` runs one through the table of command-handlers.ts (4.1.5); where a
// command points in the room.
// Part of the Engine (4.1.0 "Clarity"): its methods of the same name forward here, in the same order of effects.
import { CHANGES, type CmdKey, cmdKey } from './cmds';
import { HANDLERS, type Handler } from './command-handlers';
import type { Cmd, Id, Point, RoomDef } from './types';

import { HERO, type Ctx } from './engine-shared';
import type { Engine } from './engine';
import { roomKey } from './keys';

export async function say(eng: Engine, who: Id, text: string, ctx: Ctx, shout = false, voice?: Id) {
  eng.runClock.line(ctx.fast);
  // The switches and `{hero}` of the line (4.3.0), filled now: a flag set by the previous command is already read.
  await eng.ui.say(eng.who(who), eng.text(text), { shout, fast: ctx.fast, voice });
}

export function point(eng: Engine, t: Id | Point, room: RoomDef): Point {
  if (Array.isArray(t)) return t;
  const ap = eng.approach(t, room);
  if (!ap) throw new Error(`no point for "${t}" in ${room.id} (missing layout?)`);
  return ap;
}

export function actorKey(_eng: Engine, who: Id, room: RoomDef) {
  return roomKey(room.id, who);
}

/** Where a thing stands, for a motion's ends: a prop's or an actor's feet, a hotspot's centre, else its approach point. */
export function spot(eng: Engine, t: Id | Point, room: RoomDef): Point {
  if (Array.isArray(t)) return t;
  const L = eng.layout(room.id);
  const p = L.props?.[t];
  if (p) return [p.x, p.y];
  const a = eng.state.actors[eng.actorKey(t, room)],
    al = L.actors?.[t];
  if (a?.x !== undefined && a.y !== undefined) return [a.x, a.y];
  if (al) return [al.x, al.y];
  const h = L.hotspots?.[t];
  if (h?.rect) return [h.rect[0] + h.rect[2] / 2, h.rect[1] + h.rect[3] / 2];
  return eng.point(t, room);
}

export async function exec(eng: Engine, cmds: Cmd[] | undefined, ctx: Ctx): Promise<void> {
  if (!cmds) return;
  for (const c of cmds) {
    // A destroyed engine runs nothing more (4.1.4): what was waiting ends, what followed never starts.
    if (eng.destroyed) return;
    if (eng.busyState.skipping && !ctx.fast) ctx = { ...ctx, fast: true };
    await eng.step(c, ctx);
    if (eng.state.done) return;
  }
}

export async function step(eng: Engine, c: Cmd, ctx: Ctx): Promise<void> {
  const o = eng.sessions.cur;
  if (o) {
    if (o.src?.skipAt === o.steps) eng.busyState.skipping = true;
    o.steps++;
  }
  if (typeof c === 'string') return eng.say(HERO, c, ctx);
  const k = cmdKey(c);
  if (!k) throw new Error(`unknown command: ${JSON.stringify(c)}`);
  if (eng.writes && CHANGES.has(k))
    eng.writes.add(
      'set' in c
        ? `flag:${Array.isArray(c.set) ? c.set[0] : c.set}`
        : 'unset' in c
          ? `flag:${c.unset}`
          : 'inc' in c
            ? `flag:${c.inc}`
            : '*',
    );
  // The run clock observes (4.1.14, D24): the command's logical duration, before it runs.
  eng.runClock.command(c, ctx, (w) => eng.who(w));
  // The table (command-handlers.ts, 4.1.5): one function per command, typed by its key.
  await (HANDLERS[k] as Handler<CmdKey>)(eng, c as never, ctx);
}
