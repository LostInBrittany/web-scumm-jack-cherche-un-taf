// One handler per command (4.1.5, the plan's fourth release): `step` looks the command's key up in this table, where
// 4.1.0 walked a 450-line chain of `if ('x' in c)`. The order of effects of each handler is the one it had in that
// chain; a key that shares its handler with another (`show`/`hide`, the four motions, `nth`/`cycle`,
// `ending`/`reveal`) says so by naming the same function. The catalogue (`cmds.ts`) is checked against this table.
import { motionEnd, type MotionSpec } from './motion';
import { CMD_KEYS, type CmdKey } from './cmds';
import { must } from './must';
import { stateDiff } from './diff';
import { ANIM_MS, CAMERA_MS, FPS } from './timing';
import type { Cmd, Id, Point, Value } from './types';
import { HERO, type Ctx } from './engine-shared';
import type { Engine } from './engine';
import { roomKey, seenKey } from './keys';

type CmdObj = Exclude<Cmd, string>;
/** The command variants that carry the key `K`. */
type CmdOf<K extends CmdKey> = K extends unknown ? Extract<CmdObj, Record<K, unknown>> : never;
export type Handler<K extends CmdKey> = (eng: Engine, c: CmdOf<K>, ctx: Ctx) => Promise<void> | void;
type Handlers = { [K in CmdKey]: Handler<K> };

// The clip: `voice` as written, else the line's id, keyed by its switches' values when it has some (voice-key.ts).
const sayLine: Handler<'say'> = (eng, c, ctx) =>
  eng.say(c.say[0], c.say[1], ctx, !!c.shout, c.voice ?? eng.voiceOf(c, c.say[1]));

const walk: Handler<'walk'> = async (eng, c, ctx) => {
  const s = eng.state;
  const room = ctx.room;
  const who = eng.who(c.who ?? HERO);
  const end = await eng.ui.walk(who, eng.point(c.walk, room), ctx.fast);
  if (end) {
    if (who === eng.heroId()) s.hero[room.id] = end;
    else s.actors[eng.actorKey(who, room)] = { ...s.actors[eng.actorKey(who, room)], x: end[0], y: end[1] };
  }
};

/** Stage physics (core/motion.ts): presentation only; a character keeps where its motion ends, like `place`. */
const motion: Handler<'launch' | 'spring' | 'path' | 'follow'> = async (eng, c, ctx) => {
  const s = eng.state;
  const room = ctx.room;
  const L = 'launch' in c ? c.launch : 'spring' in c ? c.spring : 'path' in c ? c.path : c.follow;
  const who = eng.who(L.target);
  const m: MotionSpec =
    'launch' in c
      ? {
          kind: 'launch',
          to: eng.spot(c.launch.to, room),
          ...(c.launch.from !== undefined ? { from: eng.spot(c.launch.from, room) } : {}),
          ...(c.launch.height !== undefined ? { height: c.launch.height } : {}),
          ms: c.launch.ms ?? 900,
          rotate: c.launch.rotate ?? 0,
        }
      : 'spring' in c
        ? {
            kind: 'spring',
            axis: c.spring.axis ?? 'rot',
            amplitude: c.spring.amplitude ?? 10,
            frequency: c.spring.frequency ?? 3,
            damping: c.spring.damping ?? 0.25,
            ms: c.spring.ms ?? 1200,
          }
        : 'path' in c
          ? { kind: 'path', points: c.path.points, ms: c.path.ms ?? 1500, orient: !!c.path.orient }
          : { kind: 'follow', offset: c.follow.offset ?? [0, -40], ms: c.follow.ms };
  await eng.ui.motion(who, m, ctx.fast, 'follow' in c ? eng.who(c.follow.leader) : undefined);
  const end = motionEnd(m);
  if (end && who === eng.heroId()) s.hero[room.id] = end;
  else if (end && (room.actors?.[who] || Object.values(room.actors ?? {}).some((a) => a.char === who)))
    s.actors[eng.actorKey(who, room)] = { ...s.actors[eng.actorKey(who, room)], x: end[0], y: end[1] };
};

const place: Handler<'place'> = (eng, c, ctx) => {
  const s = eng.state;
  const room = ctx.room;
  const who = eng.who(c.place[0]);
  eng.ui.place(who, c.place[1], c.face);
  if (who === eng.heroId()) s.hero[room.id] = c.place[1];
  else
    s.actors[eng.actorKey(who, room)] = {
      ...s.actors[eng.actorKey(who, room)],
      x: c.place[1][0],
      y: c.place[1][1],
      ...(c.face ? { facing: c.face } : {}),
    };
};

const face: Handler<'face'> = (eng, c, ctx) => {
  const s = eng.state;
  const room = ctx.room;
  const who = eng.who(c.who ?? HERO);
  let dir = c.face as 'left' | 'right';
  if (c.face !== 'left' && c.face !== 'right') {
    // The hero is not a hotspot, a prop nor an actor: its x is in the state (#193).
    const xOf = (id: Id) => (eng.who(id) === eng.heroId() ? (s.hero[room.id]?.[0] ?? null) : eng.centerX(id, room));
    const x = xOf(c.face);
    const me = xOf(who);
    dir = x !== null && me !== null && x < me ? 'left' : 'right';
  }
  eng.ui.face(who, dir);
  if (who !== eng.heroId()) s.actors[eng.actorKey(who, room)] = { ...s.actors[eng.actorKey(who, room)], facing: dir };
};

const pose: Handler<'pose'> = (eng, c, ctx) => {
  const s = eng.state;
  const room = ctx.room;
  const who = eng.who(c.pose[0]);
  eng.ui.pose(who, c.pose[1]);
  if (who !== eng.heroId())
    s.actors[eng.actorKey(who, room)] = { ...s.actors[eng.actorKey(who, room)], pose: c.pose[1] };
};

const anim: Handler<'anim'> = async (eng, c, ctx) => {
  const who = eng.who(c.anim[0]);
  if (!c.at) return eng.ui.anim(who, c.anim[1], c.ms ?? ANIM_MS, ctx.fast);
  // Frame events: the commands of `at` run when the pose reaches that frame (at the character's fps).
  const fps = eng.character(who)?.fps ?? FPS;
  const p = eng.ui.anim(who, c.anim[1], c.ms ?? ANIM_MS, ctx.fast);
  let t = 0;
  for (const i of Object.keys(c.at)
    .map(Number)
    .sort((a, b) => a - b)) {
    const at = (i * 1000) / fps;
    if (at > t) {
      await eng.ui.wait(at - t, ctx.fast);
      t = at;
    }
    await eng.exec(c.at[i], ctx);
  }
  await p;
};

const play: Handler<'play'> = async (eng, c, ctx) => {
  const room = ctx.room;
  const [pid, name] = c.play;
  const def = room.props?.[pid]?.anims?.[name];
  if (!def) throw new Error(`no animation "${name}" on prop "${pid}" in ${room.id}`);
  const fps = def.fps ?? FPS;
  if (def.loop) {
    // A loop never ends: its frame events only play sounds and shakes (the validator refuses anything else).
    const at = def.at;
    eng.ui.propLoop(
      pid,
      def.frames,
      fps,
      at && Object.keys(at).length
        ? (i) => {
            for (const x of at[i] ?? [])
              if (typeof x === 'object' && ('sfx' in x || 'shake' in x)) void eng.step(x, ctx);
          }
        : undefined,
    );
    return;
  }
  for (let i = 0; i < def.frames.length; i++) {
    eng.ui.propFrame(pid, must(def.frames[i], `frame ${i}`));
    if (def.at?.[i]) await eng.exec(def.at[i], ctx);
    await eng.ui.wait(1000 / fps, ctx.fast);
  }
  eng.ui.propFrame(pid, null);
};

const camera: Handler<'camera'> = async (eng, c, ctx) => {
  const s = eng.state;
  const room = ctx.room;
  const W = eng.layout(room.id).width ?? 640;
  const clamp = (x: number) => Math.max(0, Math.min(W - 640, x));
  if (c.camera === 'follow' || c.camera === 'reset') {
    s.camera = { x: 0, follow: true };
    await eng.ui.camera(null, true, 0, ctx.fast);
    return;
  }
  const x = clamp('pan' in c.camera ? c.camera.pan : (eng.centerX(c.camera.to, room) ?? 320) - 320);
  s.camera = { x, follow: false };
  await eng.ui.camera(x, false, c.camera.ms ?? CAMERA_MS, ctx.fast);
};

const prop: Handler<'prop'> = (eng, c, ctx) => {
  const s = eng.state;
  const [id, st] = c.prop;
  const key = id.includes('.') ? id : roomKey(ctx.room.id, id);
  s.props[key] = st;
  if (key.startsWith(`${s.room}.`)) eng.ui.prop(key.slice(s.room.length + 1), st);
};

const showHide: Handler<'show' | 'hide'> = (eng, c, ctx) => {
  const s = eng.state;
  const room = ctx.room;
  const id = 'show' in c ? c.show : (c as { hide: Id }).hide;
  const vis = 'show' in c;
  s.actors[eng.actorKey(id, room)] = { ...s.actors[eng.actorKey(id, room)], visible: vis };
  return eng.ui.show(id, vis, c.fade ?? 0, ctx.fast);
};

const gain: Handler<'gain'> = (eng, c) => {
  const s = eng.state;
  if (!s.inventory.includes(c.gain)) {
    s.inventory.push(c.gain);
    eng.journal.emit({ kind: 'itemAcquired', item: c.gain });
  }
  if (s.used?.includes(c.gain)) s.used = s.used.filter((x) => x !== c.gain);
  eng.ui.inventory(s.inventory, s.used);
  eng.onChange();
};

const lose: Handler<'lose'> = (eng, c) => {
  const s = eng.state;
  // The state first, then its event: a listener of the journal (objectives) reads the state after it.
  const had = s.inventory.includes(c.lose);
  s.inventory = s.inventory.filter((x) => x !== c.lose);
  if (had) eng.journal.emit({ kind: 'itemLost', item: c.lose });
  eng.ui.inventory(s.inventory, s.used);
  eng.onChange();
};

const used: Handler<'used'> = (eng, c) => {
  const s = eng.state;
  const u = (s.used ??= []);
  for (const id of Array.isArray(c.used) ? c.used : [c.used]) if (!u.includes(id)) u.push(id);
  eng.ui.inventory(s.inventory, u);
  eng.onChange();
};

const set: Handler<'set'> = (eng, c) => {
  const [k, v]: [Id, Value] = Array.isArray(c.set) ? c.set : [c.set, true];
  const changed = eng.state.flags[k] !== v;
  eng.state.flags[k] = v;
  if (changed) eng.journal.emit({ kind: 'flagChanged', flag: k, value: v });
};

const unset: Handler<'unset'> = (eng, c) => {
  const was = eng.state.flags[c.unset] !== undefined;
  delete eng.state.flags[c.unset];
  if (was) eng.journal.emit({ kind: 'flagChanged', flag: c.unset, value: null });
};

const inc: Handler<'inc'> = (eng, c) => {
  const s = eng.state;
  const old = s.flags[c.inc];
  const v = (typeof old === 'number' ? old : 0) + (c.by ?? 1);
  s.flags[c.inc] = v;
  if (old !== v) eng.journal.emit({ kind: 'flagChanged', flag: c.inc, value: v });
};

const unlock: Handler<'unlock'> = (eng, c) => {
  const s = eng.state;
  if (!s.unlocked.includes(c.unlock)) s.unlocked.push(c.unlock);
};

const map: Handler<'map'> = async (eng) => {
  const pick = await eng.pickPlace();
  if (pick) {
    const p = eng.game.map?.places[pick];
    if (p) await eng.enter(p.room, undefined, true);
  }
};

const moveActor: Handler<'moveActor'> = async (eng, c, ctx) => {
  const s = eng.state;
  const room = ctx.room;
  const [char, to] = c.moveActor;
  eng.log('actor', `${char} → ${to}`);
  const dest = eng.room(to);
  const from = s.where?.[char];
  (s.where ??= {})[char] = to;
  const inst = eng.instanceOf(char, dest);
  let at: Point | undefined;
  if (inst) {
    const key = roomKey(to, inst);
    const L = eng.layout(to);
    at = c.at ? (Array.isArray(c.at) ? c.at : L.entries?.[c.at]) : undefined;
    const o = { ...s.actors[key] };
    delete o.x;
    delete o.y;
    delete o.visible;
    s.actors[key] = at ? { ...o, x: at[0], y: at[1] } : o;
  }
  // The view: the character leaves the room on screen, or arrives in it.
  if (from === s.room && to !== s.room) {
    const i = eng.instanceOf(char, room);
    if (i) await eng.ui.show(i, false, 0, true);
  }
  if (to === s.room && inst) {
    const pos =
      at ??
      (() => {
        const a = eng.layout(to).actors?.[inst];
        return a ? ([a.x, a.y] as Point) : undefined;
      })();
    if (pos) eng.ui.place(inst, pos);
    await eng.ui.show(inst, true, 0, true);
  }
  eng.onChange();
};

const waitUntil: Handler<'waitUntil'> = async (eng, c, ctx) => {
  // Woken by the next state change (4.1.4), with the presenter's wait as a bound: a condition met is seen at once,
  // never a quarter of a second later; the guard keeps a condition nothing can meet from waiting for ever.
  for (let guard = 0; guard < 100000 && !eng.cond(c.waitUntil, ctx.room.id) && !eng.destroyed; guard++) {
    let woken = () => {};
    const change = new Promise<void>((ok) => {
      woken = ok;
      eng.waiters.add(ok);
    });
    await Promise.race([eng.ui.wait(250, ctx.fast), change]);
    eng.waiters.delete(woken);
  }
};

const startScript: Handler<'startScript'> = (eng, c) => {
  const s = eng.state;
  if (!eng.scriptDef(c.startScript)) throw new Error(`unknown script: ${c.startScript}`);
  (s.scripts ??= {})[c.startScript] = { pc: 0 };
  if (eng.autoScripts && !eng.scheduler.has(c.startScript)) {
    const global = !!eng.game.scripts?.some((x) => x.id === c.startScript);
    if (global || eng.room().scripts?.some((x) => x.id === c.startScript)) eng.scheduler.launch(c.startScript, global);
  }
};

const switchPlayer: Handler<'switchPlayer'> = async (eng, c) => {
  if (!eng.isPlayer(c.switchPlayer)) throw new Error(`not a playable character: ${c.switchPlayer}`);
  if (c.switchPlayer === eng.heroId()) return;
  await eng.swap(c.switchPlayer);
  await eng.enter(eng.state.room, undefined, false);
  eng.startScripts(true);
};

const custom: Handler<'custom'> = async (eng, c, ctx) => {
  const s = eng.state;
  const cmd = eng.opts.commands?.[c.custom];
  if (!cmd) throw new Error(`unknown custom command: ${c.custom} (export it from games/<id>/index.ts "commands")`);
  await eng.exec(cmd.effects, ctx);
  if (cmd.run && eng.opts.runCustom && !ctx.fast) {
    // `run` is display only: in dev (journal on), a state change outside the declared `effects` is reported.
    const before = eng.traceOn ? structuredClone(s) : null;
    await cmd.run({
      game: eng.game,
      state: s,
      room: ctx.room,
      args: c.args,
      ui: eng.ui,
      scene: eng.opts.scene?.(),
      fast: ctx.fast,
    });
    if (before) {
      const diff = stateDiff(before, s);
      if (diff.length) {
        const msg = `custom "${c.custom}" changed ${diff.join(', ')} outside its declared effects`;
        eng.log('action', msg);
        eng.onError(new Error(msg), `custom ${c.custom}`);
      }
    }
  }
};

const once: Handler<'once'> = (eng, c, ctx) => {
  const s = eng.state;
  const k = c.key!;
  eng.reads?.add(`once:${k}`);
  if (s.counters[k]) return;
  s.counters[k] = 1;
  eng.writes?.add(`once:${k}`);
  return eng.exec(c.once, ctx);
};

const nthCycle: Handler<'nth' | 'cycle'> = (eng, c, ctx) => {
  const s = eng.state;
  const list = 'nth' in c ? c.nth : c.cycle;
  const k = c.key!;
  eng.reads?.add(`nth:${k}`);
  const n = s.counters[k] ?? 0;
  s.counters[k] = n + 1;
  eng.writes?.add(`nth:${k}`);
  const i = 'nth' in c ? Math.min(n, list.length - 1) : n % list.length;
  return eng.exec(list[i], ctx);
};

const random: Handler<'random'> = (eng, c, ctx) => {
  const s = eng.state;
  const k = c.key!;
  eng.reads?.add(`random:${k}`);
  let i = Math.floor(eng.rand() * c.random.length);
  if (c.random.length > 1 && i === s.counters[k]) i = (i + 1) % c.random.length;
  s.counters[k] = i;
  eng.writes?.add(`random:${k}`);
  return eng.exec(c.random[i], ctx);
};

const cutscene: Handler<'cutscene'> = async (eng, c, ctx) => {
  eng.ui.cutscene(true);
  eng.busyState.skipping = false;
  eng.runClock.cutscene(true);
  try {
    await eng.exec(c.cutscene, ctx);
  } finally {
    eng.runClock.cutscene(false);
    eng.busyState.skipping = false;
    eng.ui.cutscene(false);
  }
};

const choice: Handler<'choice'> = async (eng, c, ctx) => {
  const s = eng.state;
  const room = ctx.room;
  const choiceKey = (o: (typeof c.choice)[number]) => seenKey.choice(o, room.id);
  const opts = c.choice
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => {
      const k = choiceKey(o);
      if (o.once) eng.reads?.add(`seen:${k}`);
      return eng.cond(o.if, room.id) && !(o.once && s.seen[k]);
    });
  if (!opts.length) return;
  const pick = await eng.choose(opts.map(({ o }) => ({ text: o.text, ...(o.img ? { img: o.img } : {}) })));
  const { o } = must(opts[Math.max(0, Math.min(pick, opts.length - 1))], 'choice option');
  if (o.once) {
    s.seen[choiceKey(o)] = 1;
    eng.writes?.add(`seen:${choiceKey(o)}`);
  }
  await eng.say(HERO, o.text, ctx);
  return eng.exec(o.do, ctx);
};

const minigame: Handler<'minigame'> = async (eng, c, ctx) => {
  eng.ran(`minigame:${c.minigame}`);
  // 4.1.16: a minigame that says how it ended writes it in the reserved flag `minigame.<id>` (the story reads it with
  // `{ flag, eq }`, the journal says `flagChanged`); its result is recorded in the session and fed back on a replay.
  const result = await eng.sessions.minigame(c.minigame, c.params ?? {});
  if (result !== undefined) await set(eng, { set: [`minigame.${c.minigame}`, result] }, ctx);
  return eng.exec(c.then, ctx);
};

const phone: Handler<'phone'> = async (eng, c, ctx) => {
  const who = Array.isArray(c.phone) ? c.phone.map((w) => eng.who(w)) : eng.who(c.phone);
  await eng.ui.phone(who, true);
  await eng.exec(c.do, ctx);
  await eng.ui.phone(who, false);
};

const guide: Handler<'guide'> = async (eng, c, ctx) => {
  const g = c.guide;
  if (ctx.fast) return;
  await eng.say(HERO, g.say, ctx);
  await new Promise<void>((resolve) => {
    eng.busyState.guide = { ...g, resolve };
    eng.ui.guide({ verb: g.verb, target: g.target });
    eng.onChange();
  });
};

const ending: Handler<'ending' | 'reveal'> = async (eng, c, ctx) => {
  await eng.ui.ending('open');
  await eng.exec(c.after, { ...ctx, fast: false });
  // The sealed ending ends the game as `end` does: `state.done` is the one truth an e2e or a replay reads, the card
  // is only how it is shown.
  eng.state.done = true;
  eng.objectives.check(); // the objectives the last action completed, before the ending
  eng.journal.emit({ kind: 'endingReached', ending: 'sealed' });
  eng.save();
  eng.journal.saved();
  return eng.ui.ending('card');
};

export const HANDLERS: Handlers = {
  say: sayLine,
  walk,
  launch: motion,
  spring: motion,
  path: motion,
  follow: motion,
  place,
  face,
  pose,
  anim,
  play,
  stopAnim: (eng, c) => eng.ui.propLoop(c.stopAnim, [], 0),
  camera,
  wait: (eng, c, ctx) => eng.ui.wait(c.wait, ctx.fast),
  parallel: async (eng, c, ctx) => {
    await Promise.all(c.parallel.map((b) => eng.exec(b, ctx)));
  },
  prop,
  show: showHide,
  hide: showHide,
  gain,
  lose,
  used,
  set,
  unset,
  inc,
  unlock,
  goto: (eng, c) => eng.enter(c.goto, c.at, true),
  map,
  moveActor,
  emit: (eng, c, ctx) => eng.emit(c.emit, ctx),
  waitUntil,
  waitEvent: () => {}, // only meaningful at the top level of a script (advance); elsewhere it is a no-op
  startScript,
  stopScript: (eng, c) => {
    eng.scriptState(c.stopScript).off = true;
  },
  switchPlayer,
  transfer: (eng, c) => eng.transfer(c.transfer[0], c.transfer[1]),
  custom,
  sfx: (eng, c, ctx) => {
    if (!ctx.fast) eng.ui.sfx(c.sfx, c.caption === undefined ? undefined : eng.text(c.caption));
  },
  music: (eng, c) => eng.ui.music(typeof c.music === 'string' ? { play: c.music } : c.music),
  toast: (eng, c) => eng.ui.toast(eng.text(c.toast)),
  shake: (eng, c, ctx) => {
    if (!ctx.fast) eng.ui.shake(c.shake);
  },
  if: (eng, c, ctx) => eng.exec(eng.cond(c.if, ctx.room.id) ? c.then : c.else, ctx),
  once,
  nth: nthCycle,
  cycle: nthCycle,
  random,
  cutscene,
  choice,
  minigame,
  phone,
  guide,
  talk: (eng, c, ctx) => eng.talkLoop(c.talk, ctx, c === eng.tailTalk),
  hint: (eng, _c, ctx) => eng.hint(ctx),
  ending,
  reveal: ending,
  end: (eng) => {
    eng.state.done = true;
    eng.objectives.check(); // the objectives the last action completed, before the ending
    eng.journal.emit({ kind: 'endingReached', ending: 'end' });
    eng.save();
    eng.journal.saved();
    eng.ui.end();
  },
};

/** Every key of the catalogue has its handler, and nothing else does (a new command is declared in both places). */
const _complete: [Exclude<CmdKey, keyof typeof HANDLERS>] extends [never] ? true : 'a command has no handler' = true;
void _complete;
void CMD_KEYS;
