// Content validator: checks that everything referenced exists, and flags what's missing for a good experience.
// Pure TypeScript (no DOM): runs in node (npm run validate) and in tests.
import { eventChecks } from './validate-events';
import { rendererOf, stageOf } from '../core/stage';
import { stageLayoutChecks } from './validate-stage';
import { migrationChecks } from './validate/migrations';
import { objectiveChecks } from './validate/objectives';
import { mapChecks } from './validate/map';
import { playerChecks } from './validate/player';
import { remixChecks } from './validate/remix';
import { speedrunChecks } from './validate/speedrun';
import { textSwitchChecks } from './validate/text-switches';
import { type VoiceCheckOptions, voiceValueChecks } from './validate/voices';
import { listId, listText } from '../core/list-lines';
import { condFlags } from '../core/cond';
import { subLists } from '../core/cmds';
import { normalizeExits } from '../core/define';
import { worldGraph } from './graph';
import { transitionPeak } from './weight';
import { puzzleGraph, puzzleIssues } from './puzzle';
import type {
  Cmd,
  Cond,
  EventRule,
  GameDef,
  Id,
  Layout,
  ListLine,
  RoomDef,
  Rule,
  ScriptDef,
  VerbId,
} from '../core/types';

export interface AssetIndex {
  images: Record<string, [number, number]>;
  audio?: Record<string, unknown>;
}
export interface ValidateOptions extends VoiceCheckOptions {
  /** A release: every `say` / `toast` / `guide` object needs a stable `id` (translations and voices are keyed by it). */
  release?: boolean;
  /** The game ships more than one language (or voices): in a release every line, plain strings included, needs a stable id. */
  translated?: boolean;
  assets?: AssetIndex;
  /** Ids of the minigames known to the engine. Absent = no check. */
  minigameIds?: string[];
  /** Required params of each minigame (Minigame.required). Absent = no check. */
  minigameParams?: Record<string, string[]>;
  /** Params that name an image or a sound (Minigame.bindings): they must exist. Absent = images found by shape only. */
  minigameBindings?: Record<string, { images?: string[]; sfx?: string[] }>;
  /** Maximum length of a line before a warning. */
  maxText?: number;
  /** The game's custom commands (`{ custom }`): checked to exist and to declare `effects` or `pure`. Absent = no check. */
  commands?: Record<string, { effects?: unknown[]; pure?: boolean }>;
}

export interface Report {
  errors: string[];
  warnings: string[];
}

const HERO = 'hero';

export function validate(gameIn: GameDef, layouts: Record<string, Layout>, opts: ValidateOptions = {}): Report {
  // Declared exits are checked as what they become (hotspots and rules), on a copy: the caller's game stays as written.
  const game = normalizeExits(structuredClone(gameIn));
  const errors: string[] = [];
  const warnings: string[] = [];
  const maxText = opts.maxText ?? 140;
  const err = (where: string, msg: string) => errors.push(`${where} › ${msg}`);
  const warn = (where: string, msg: string) => warnings.push(`${where} › ${msg}`);
  const v3Ids = new Map<string, string>();
  const stable = (id: string | undefined, where: string, kind: string) => {
    if (game.schemaVersion !== 3) return;
    if (!id) {
      err(where, `${kind} requires a stable "id" in schema v3`);
      return;
    }
    const previous = v3Ids.get(id);
    if (previous) err(where, `duplicate stable id "${id}" (also in ${previous})`);
    else v3Ids.set(id, where);
  };

  const roomIds = new Set<string>();
  for (const r of game.rooms) {
    if (roomIds.has(r.id)) err(r.id, `duplicate room: "${r.id}"`);
    roomIds.add(r.id);
  }
  const rooms = new Map(game.rooms.map((r) => [r.id, r]));
  const items = game.items;
  const chars = game.characters;
  const places = game.map?.places ?? {};
  const music = game.audio?.music ?? {};
  const sfx = game.audio?.sfx ?? {};
  const voices = game.audio?.voices ?? {};

  const flagsRead = new Map<string, string>();
  const flagsSet = new Map<string, string>();
  // Events: emitted somewhere, listened to somewhere, waited for by a script; scripts by id.
  const emitted = new Map<string, string>();
  const listened = new Map<string, string>();
  const waited = new Map<string, string>();
  const scriptIds = new Map<string, string>();
  const scriptRefs: [string, string][] = [];
  for (const sc of game.scripts ?? []) scriptIds.set(sc.id, 'scripts');
  for (const r of game.rooms)
    for (const sc of r.scripts ?? []) {
      if (scriptIds.has(sc.id))
        err(`${r.id}.scripts`, `duplicate script id: "${sc.id}" (also in ${scriptIds.get(sc.id)})`);
      scriptIds.set(sc.id, `${r.id}.scripts`);
    }
  /** A moving character: declared with a starting room, and an actor of it in the target room. */
  const mover = (char: Id, roomId: Id, where: string) => {
    const ch = chars[char];
    if (!ch) {
      err(where, `unknown character: "${char}"`);
      return;
    }
    if (!ch.room)
      err(
        where,
        `character "${char}" has no starting room ("room" in its definition), needed to move it between rooms`,
      );
    else if (!rooms.has(ch.room)) err(where, `character "${char}": unknown starting room "${ch.room}"`);
    const r = rooms.get(roomId);
    if (!r) {
      err(where, `unknown room: "${roomId}"`);
      return;
    }
    if (!Object.values(r.actors ?? {}).some((a) => a.char === char))
      err(where, `"${char}" is not an actor in ${roomId}: declare it there (actors) and place it in the layout`);
  };
  const read = (c: Cond | undefined, where: string) => {
    for (const f of condFlags(c)) if (!flagsRead.has(f)) flagsRead.set(f, where);
  };
  const setF = (f: string, where: string) => {
    if (!flagsSet.has(f)) flagsSet.set(f, where);
  };
  for (const f of Object.keys(game.start.flags ?? {})) setF(f, 'start');

  // ------------------------------------------------------------ images
  const images = opts.assets?.images;
  const img = (id: Id | undefined, where: string) => {
    if (id && images && !images[id]) err(where, `image not found: "${id}"`);
  };

  // ------------------------------------------------------------ text
  const text = (t: string | undefined, where: string) => {
    if (t === undefined) return;
    if (!t.trim()) err(where, 'empty text');
    else if (t.length > maxText)
      warn(where, `long text (${t.length} characters, ${maxText} recommended max): "${t.slice(0, 40)}…"`);
  };
  // A list line (look list, hint, fallback answer, kind reaction) is keyed by position unless it has an id: in a
  // translated or voiced release that is an error, as for `say` lines.
  const strictLines = () => !!opts.release && (!!opts.translated || !!game.audio?.voices);
  const listLineId = (id: string | undefined, where: string, what = 'this line') => {
    if (id) {
      const first = lineIds.get(id);
      if (first) err(where, `line id "${id}" is already used at ${first}`);
      else lineIds.set(id, where);
      return;
    }
    if (strictLines())
      err(
        where,
        `${what} has no stable id in a translated or voiced release (\`npm run ids -- --lines=all --write --map\`)`,
      );
    else if (opts.release)
      warn(
        where,
        `${what} has no stable id (\`npm run ids -- --lines=all\`): its translation and voice clip are keyed by position`,
      );
  };
  const texts = (t: string | ListLine[] | undefined, where: string) => {
    if (t === undefined) return;
    if (Array.isArray(t)) {
      if (!t.length) err(where, 'empty text list');
      t.forEach((x, i) => {
        const w = `${where}[${i}]`;
        text(listText(x), w);
        listLineId(listId(x), w);
      });
    } else text(t, where);
  };

  // ------------------------------------------------------------ entities of a room
  const entities = (r: RoomDef) =>
    new Set<string>([...Object.keys(r.hotspots ?? {}), ...Object.keys(r.props ?? {}), ...Object.keys(r.actors ?? {})]);
  const allEntities = new Set<string>();
  for (const r of game.rooms) entities(r).forEach((e) => allEntities.add(e));

  const hasGeometry = (r: RoomDef, id: Id): boolean => {
    const L = layouts[r.id];
    if (!L) return false;
    const h = L.hotspots?.[id];
    if (h && (h.rect || h.poly || h.approach)) return true;
    if (L.props?.[id]) return true;
    if (L.actors?.[id]) return true;
    return false;
  };

  // ------------------------------------------------------------ conditions
  const cond = (c: Cond | undefined, where: string, room?: RoomDef) => {
    if (c === undefined) return;
    read(c, where);
    const visit = (x: Cond) => {
      if (typeof x === 'string') {
        if (!x.replace(/^!/, '')) err(where, 'empty condition');
        return;
      }
      if ('has' in x) {
        if (!items[x.has]) err(where, `unknown item in condition: "${x.has}"`);
      } else if ('not' in x) visit(x.not);
      else if ('all' in x) x.all.forEach(visit);
      else if ('any' in x) x.any.forEach(visit);
      else if ('visited' in x) {
        if (!rooms.has(x.visited)) err(where, `unknown room in condition: "${x.visited}"`);
      } else if ('room' in x) {
        if (!rooms.has(x.room)) err(where, `unknown room in condition: "${x.room}"`);
      } else if ('prop' in x) propRef(x.prop[0], x.prop[1], where, room);
      else if ('unlocked' in x) {
        if (!places[x.unlocked]) err(where, `unknown map place: "${x.unlocked}"`);
      } else if ('actorIn' in x) mover(x.actorIn[0], x.actorIn[1], where);
      else if ('player' in x) {
        if (!playerIds.includes(x.player)) err(where, `"${x.player}" is not a playable character (players.ids)`);
      }
    };
    visit(c);
  };

  const propRef = (id: Id, state: string | undefined, where: string, room?: RoomDef) => {
    let r = room;
    let pid = id;
    if (id.includes('.')) {
      const [rid = '', p = ''] = id.split('.'); // never the defaults: `id` has a dot
      r = rooms.get(rid);
      pid = p;
      if (!r) {
        err(where, `unknown room: "${rid}" in "${id}"`);
        return;
      }
    }
    if (!r) {
      err(where, `prop "${id}" has no room (use "room.prop")`);
      return;
    }
    const def = r.props?.[pid];
    if (!def) {
      err(where, `unknown prop in ${r.id}: "${pid}"`);
      return;
    }
    if (state !== undefined) {
      const states = def.states ? Object.keys(def.states) : [];
      if (!states.includes(state))
        err(where, `unknown state "${state}" for prop "${pid}" (states: ${states.join(', ') || 'none'})`);
    }
  };

  const whoOk = (w: Id, room?: RoomDef) => w === HERO || !!chars[w] || !!room?.actors?.[w];
  const playerIds = game.players?.ids ?? [game.hero];

  // ------------------------------------------------------------ commands
  let inScript = false;
  const cmds = (list: Cmd[] | undefined, where: string, room?: RoomDef) => {
    list?.forEach((c, i) => cmd(c, `${where}[${i}]`, room));
  };
  const cmd = (c: Cmd, where: string, room?: RoomDef) => {
    cmdChecks(c, where, room);
    for (const s of subLists(c)) nested(() => cmds(s.list, where + s.path, room));
  };
  const lineIds = new Map<string, string>();
  let generated = false;
  const cmdChecks = (c: Cmd, where: string, room?: RoomDef) => {
    // A translated or voiced release keys every line by id: a line keyed by position loses its translation or its
    // clip as soon as a line is inserted before it.
    const strict = opts.release && !generated && (opts.translated || !!game.audio?.voices);
    if (typeof c === 'string') {
      text(c, where);
      if (strict)
        err(
          where,
          'a plain line has no stable id in a translated or voiced release (`npm run ids -- --lines=all --write --map`)',
        );
      return;
    }
    if ('say' in c || 'toast' in c || 'guide' in c) {
      const id = (c as { id?: Id }).id;
      if (id) {
        const first = lineIds.get(id);
        if (first) err(where, `line id "${id}" is already used at ${first}`);
        else lineIds.set(id, where);
      } else if (opts.release)
        (strict ? err : warn)(
          where,
          'this line has no stable id (`npm run ids -- --lines`): its translation and voice clip are keyed by position',
        );
    }
    if ('say' in c) {
      if (!whoOk(c.say[0], room)) err(where, `unknown character: "${c.say[0]}"`);
      text(c.say[1], where);
      if (c.voice && !voices[c.voice]) err(where, `unknown voice clip: "${c.voice}" (audio.voices)`);
      return;
    }
    if ('walk' in c) {
      if (c.who && !whoOk(c.who, room)) err(where, `unknown character: "${c.who}"`);
      if (typeof c.walk === 'string' && room) {
        if (!entities(room).has(c.walk)) err(where, `unknown walk target: "${c.walk}"`);
        else if (!hasGeometry(room, c.walk))
          (layouts[room.id] ? err : warn)(where, `"${c.walk}" has no geometry in the layout (approach point)`);
      }
      return;
    }
    if ('place' in c) {
      if (!whoOk(c.place[0], room)) err(where, `unknown character: "${c.place[0]}"`);
      return;
    }
    if ('launch' in c || 'spring' in c || 'path' in c || 'follow' in c) {
      const m = 'launch' in c ? c.launch : 'spring' in c ? c.spring : 'path' in c ? c.path : c.follow;
      const known = (t: string) => whoOk(t, room) || (!!room && !!room.props?.[t]);
      if (!known(m.target)) err(where, `unknown motion target: "${m.target}" (a character or a prop of the room)`);
      if ('launch' in c)
        for (const end of [c.launch.to, c.launch.from])
          if (typeof end === 'string' && room && !entities(room).has(end)) err(where, `unknown point: "${end}"`);
      if ('path' in c && c.path.points.length < 2) err(where, 'a path needs two points at least');
      if ('follow' in c && !known(c.follow.leader)) err(where, `unknown leader: "${c.follow.leader}"`);
      if ('spring' in c && c.spring.damping !== undefined && (c.spring.damping < 0 || c.spring.damping > 1))
        err(where, 'damping is between 0 and 1');
      const ms = 'follow' in c ? c.follow.ms : m.ms;
      if (ms !== undefined && !(ms > 0)) err(where, 'a motion lasts more than 0 ms');
      return;
    }
    if ('face' in c) {
      if (c.who && !whoOk(c.who, room)) err(where, `unknown character: "${c.who}"`);
      if (c.face !== 'left' && c.face !== 'right' && room && !entities(room).has(c.face) && !whoOk(c.face, room))
        err(where, `unknown target: "${c.face}"`);
      return;
    }
    if ('pose' in c) {
      if (!whoOk(c.pose[0], room)) err(where, `unknown character: "${c.pose[0]}"`);
      poseRef(c.pose[0], c.pose[1], where, room);
      return;
    }
    if ('anim' in c) {
      if (!whoOk(c.anim[0], room)) err(where, `unknown character: "${c.anim[0]}"`);
      poseRef(c.anim[0], c.anim[1], where, room);
      for (const i of Object.keys(c.at ?? {})) if (!/^\d+$/.test(i)) err(where, `at: "${i}" is not a frame index`);
      return;
    }
    if ('play' in c) {
      const [pid, an] = c.play;
      const p = room?.props?.[pid];
      if (room && !p) err(where, `unknown prop: "${pid}"`);
      else if (p && !p.anims?.[an])
        err(
          where,
          `prop "${pid}" has no animation "${an}" (anims: ${Object.keys(p.anims ?? {}).join(', ') || 'none'})`,
        );
      return;
    }
    if ('stopAnim' in c) {
      if (room && !room.props?.[c.stopAnim]) err(where, `unknown prop: "${c.stopAnim}"`);
      return;
    }
    if ('camera' in c) {
      const cam = c.camera;
      if (typeof cam === 'object' && 'to' in cam && room && !entities(room).has(cam.to) && !whoOk(cam.to, room))
        err(where, `unknown camera target: "${cam.to}"`);
      const lay = room ? layouts[room.id] : undefined;
      if (lay && (lay.width ?? 640) <= 640)
        warn(where, `camera in a 640-wide room (set "width" in the layout): no effect`);
      return;
    }
    if ('wait' in c) return;
    if ('parallel' in c) return;
    if ('prop' in c) {
      propRef(c.prop[0], c.prop[1], where, room);
      return;
    }
    if ('show' in c || 'hide' in c) {
      const id = 'show' in c ? c.show : (c as { hide: Id }).hide;
      if (room && !entities(room).has(id)) err(where, `unknown actor or prop: "${id}"`);
      return;
    }
    if ('gain' in c) {
      if (!items[c.gain]) err(where, `unknown item: "${c.gain}"`);
      return;
    }
    if ('lose' in c) {
      if (!items[c.lose]) err(where, `unknown item: "${c.lose}"`);
      return;
    }
    if ('used' in c) {
      for (const u of Array.isArray(c.used) ? c.used : [c.used]) if (!items[u]) err(where, `unknown item: "${u}"`);
      return;
    }
    if ('set' in c) {
      setF(Array.isArray(c.set) ? c.set[0] : c.set, where);
      return;
    }
    if ('unset' in c || 'inc' in c) {
      setF('unset' in c ? c.unset : c.inc, where);
      return;
    }
    if ('unlock' in c) {
      if (!places[c.unlock]) err(where, `unknown map place: "${c.unlock}"`);
      return;
    }
    if ('goto' in c) {
      const target = rooms.get(c.goto);
      const lay = layouts[c.goto];
      if (!target) err(where, `unknown room: "${c.goto}"`);
      else if (typeof c.at === 'string' && lay && !lay.entries?.[c.at])
        err(where, `unknown entry point "${c.at}" in ${c.goto}`);
      return;
    }
    if ('map' in c) return;
    if ('moveActor' in c) {
      const [char, to] = c.moveActor;
      if (char === HERO || char === game.hero)
        err(where, 'moveActor is for other characters: the hero changes rooms with goto');
      else mover(char, to, where);
      if (typeof c.at === 'string' && layouts[to] && !layouts[to].entries?.[c.at])
        err(where, `unknown entry point "${c.at}" in ${to}`);
      return;
    }
    if ('emit' in c) {
      if (!c.emit) err(where, 'empty event id');
      else if (!emitted.has(c.emit)) emitted.set(c.emit, where);
      return;
    }
    if ('waitUntil' in c) {
      cond(c.waitUntil, where, room);
      if (!inScript) warn(where, 'waitUntil outside a script: it polls the condition and blocks the player');
      return;
    }
    if ('waitEvent' in c) {
      if (!waited.has(c.waitEvent)) waited.set(c.waitEvent, where);
      if (!inScript) warn(where, 'waitEvent outside the top level of a script does nothing');
      return;
    }
    if ('startScript' in c) {
      scriptRefs.push([c.startScript, where]);
      return;
    }
    if ('stopScript' in c) {
      scriptRefs.push([c.stopScript, where]);
      return;
    }
    if ('custom' in c) {
      if (opts.commands) {
        const k = opts.commands[c.custom];
        if (!k)
          err(
            where,
            `unknown custom command: "${c.custom}" (known: ${Object.keys(opts.commands).join(', ') || 'none'})`,
          );
        else if (!k.effects && !k.pure)
          err(
            where,
            `custom command "${c.custom}" declares neither "effects" nor "pure: true": the solver cannot know what it does`,
          );
        else if (k.effects) nested(() => cmds(k.effects as Cmd[], `commands.${c.custom}.effects`, room));
      }
      return;
    }
    if ('switchPlayer' in c) {
      if (!playerIds.includes(c.switchPlayer))
        err(where, `"${c.switchPlayer}" is not a playable character (players.ids)`);
      return;
    }
    if ('transfer' in c) {
      if (!items[c.transfer[0]]) err(where, `unknown item: "${c.transfer[0]}"`);
      if (!playerIds.includes(c.transfer[1]))
        err(where, `"${c.transfer[1]}" is not a playable character (players.ids)`);
      return;
    }
    if ('sfx' in c) {
      if (!sfx[c.sfx]) err(where, `unknown sound effect: "${c.sfx}"`);
      if (c.caption !== undefined) text(c.caption, `${where}.caption`);
      return;
    }
    if ('music' in c) {
      const m = c.music;
      const id = typeof m === 'string' ? m : 'push' in m ? m.push : 'once' in m ? m.once : undefined;
      if (id && !music[id]) err(where, `unknown music: "${id}"`);
      if (typeof m !== 'string' && 'stinger' in m && !music[m.stinger] && !sfx[m.stinger])
        err(where, `unknown stinger: "${m.stinger}" (audio.music or audio.sfx)`);
      return;
    }
    if ('toast' in c) {
      text(c.toast, where);
      return;
    }
    if ('shake' in c) return;
    if ('if' in c) {
      cond(c.if, where, room);
      return;
    }
    if ('once' in c || 'nth' in c || 'cycle' in c || 'random' in c) {
      stable(c.id, where, 'persistent command block');
      return;
    }
    if ('cutscene' in c) return;
    if ('choice' in c) {
      if (!c.choice.length) err(where, 'choice with no option');
      c.choice.forEach((o, j) => {
        const w = `${where}.choice[${j}]`;
        stable(o.id, w, 'choice');
        text(o.text, w);
        img(o.img, `${w}.img`);
        cond(o.if, w, room);
      });
      return;
    }
    if ('minigame' in c) {
      if (opts.minigameIds && !opts.minigameIds.includes(c.minigame))
        err(where, `unknown minigame: "${c.minigame}" (known: ${opts.minigameIds.join(', ')})`);
      minigameParams(c.minigame, c.params, where);
      return;
    }
    if ('phone' in c) {
      const list = Array.isArray(c.phone) ? c.phone : [c.phone];
      if (!list.length) err(where, 'call with no one on the line');
      for (const w of list) if (!whoOk(w, room)) err(where, `unknown character: "${w}"`);
      return;
    }
    if ('guide' in c) {
      const g = c.guide;
      if (!game.verbs.some((v) => v.id === g.verb)) err(where, `unknown verb: "${g.verb}"`);
      if (!(room && entities(room).has(g.target)) && !items[g.target])
        err(where, `unknown tutorial target: "${g.target}"`);
      text(g.say, where);
      return;
    }
    if ('talk' in c) {
      if (room && !room.talk?.[c.talk]) err(where, `no conversation topics for "${c.talk}"`);
      return;
    }
    if ('ending' in c || 'reveal' in c) {
      if (!game.ending) err(where, 'sealed ending without "ending" in the game');
      return;
    }
    if ('hint' in c || 'end' in c) return;
    err(where, `unknown command: ${JSON.stringify(c)}`);
  };
  /** Commands nested in a block are not at a script's top level (where waitUntil / waitEvent pause the script). */
  const nested = (fn: () => void) => {
    const was = inScript;
    inScript = false;
    fn();
    inScript = was;
  };

  /** The world's scripts: unique ids (checked above), a loop that waits, commands checked at the top level. */
  const scripts = (list: ScriptDef[] | undefined, where: string, room?: RoomDef) => {
    list?.forEach((sc, i) => {
      const w = `${where}[${i}]`;
      if (!sc.id) err(w, 'script without id');
      if (game.schemaVersion === 3) {
        if (sc.stepIds?.length !== sc.do.length)
          err(w, `schema v3 script needs one stable step id per command (${sc.do.length} expected)`);
        for (const [j, id] of (sc.stepIds ?? []).entries()) stable(id, `${w}.stepIds[${j}]`, 'script step');
      }
      cond(sc.while, `${w}.while`, room);
      if (!sc.do?.length) {
        err(w, 'script with no command');
        return;
      }
      const pauses = sc.do.some((c) => typeof c === 'object' && ('wait' in c || 'waitUntil' in c || 'waitEvent' in c));
      if (sc.loop && !pauses) err(w, `loop script "${sc.id}" never waits (add a wait, waitUntil or waitEvent)`);
      inScript = true;
      cmds(sc.do, `${w}.do`, room);
      inScript = false;
    });
  };
  const events = (list: EventRule[] | undefined, where: string, room?: RoomDef) => {
    list?.forEach((ev, i) => {
      const w = `${where}[${i}]`;
      stable(ev.id, w, 'event listener');
      if (!ev.on) err(w, 'listener without event id ("on")');
      else if (!listened.has(ev.on)) listened.set(ev.on, w);
      cond(ev.if, w, room);
      if (!ev.do?.length) warn(w, 'listener with no command');
      cmds(ev.do, `${w}.do`, room);
    });
  };

  /** Required params of the minigame, and images referenced in the params. */
  const minigameParams = (id: Id, params: Record<string, unknown> | undefined, where: string) => {
    const need = opts.minigameParams?.[id];
    for (const k of need ?? [])
      if (params?.[k] === undefined) err(where, `minigame "${id}": missing required param "${k}"`);
    const b = opts.minigameBindings?.[id];
    const at = (path: string) =>
      path
        .split('.')
        .reduce<unknown>(
          (v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined),
          params,
        );
    for (const k of b?.images ?? []) {
      const v = at(k);
      if (typeof v === 'string') img(v, `${where}.params.${k}`);
      else if (v !== undefined) err(`${where}.params.${k}`, `minigame "${id}": "${k}" must be an image id`);
    }
    for (const k of b?.sfx ?? []) {
      const v = at(k);
      if (v === undefined) continue;
      if (typeof v !== 'string' || !game.audio?.sfx?.[v])
        err(`${where}.params.${k}`, `minigame "${id}": unknown sound "${String(v)}" (audio.sfx)`);
    }
    const scan = (v: unknown, w: string) => {
      if (typeof v === 'string') {
        if (/^[a-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(v)) img(v, w);
      } else if (Array.isArray(v)) v.forEach((x, i) => scan(x, `${w}[${i}]`));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) scan(x, `${w}.${k}`);
    };
    scan(params, `${where}.params`);
  };

  const poseRef = (who: Id, pose: string, where: string, room?: RoomDef) => {
    const charId = who === HERO ? game.hero : (room?.actors?.[who]?.char ?? who);
    const ch = chars[charId];
    if (ch?.sprites && !ch.sprites[pose]) warn(where, `pose "${pose}" missing for "${charId}" (falls back to idle)`);
  };

  const ids = (x: Id | Id[] | undefined) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
  const verbIds = new Set(game.verbs.map((v) => v.id));
  const rule = (r: Rule, where: string, room?: RoomDef) => {
    stable(r.id, where, 'rule');
    for (const v of ids(r.verb as Id | Id[])) if (!verbIds.has(v as VerbId)) err(where, `unknown verb: "${v}"`);
    const known = (id: Id) => !!items[id] || (room ? entities(room).has(id) : allEntities.has(id));
    for (const a of ids(r.a)) if (!known(a)) err(where, `"${a}" is neither an item nor something in the room`);
    for (const b of ids(r.b)) if (!known(b)) err(where, `"${b}" is neither an item nor something in the room`);
    cond(r.if, where, room);
    if (!r.do?.length) warn(where, 'rule with no command');
    // An exit's generated rule says its `locked` line, translated under `exits.<id>.locked`: not a line of its own.
    if (r.exit) {
      const was = generated;
      generated = true;
      cmds(r.do, where, room);
      generated = was;
    } else cmds(r.do, where, room);
  };

  // ------------------------------------------------------------ skin and ending
  const sk = game.skin;
  if (!sk?.icons) err('skin', 'requires "skin.icons" (map, pause, music)');
  else {
    for (const k of ['map', 'pause', 'music'] as const)
      if (!sk.icons[k]) err('skin.icons', `missing required icon: "${k}"`);
    for (const [k, v] of Object.entries(sk.icons))
      for (const id of Array.isArray(v) ? v : [v]) img(id, `skin.icons.${k}`);
  }
  if (game.audio?.maxDecodedMB !== undefined && !(game.audio.maxDecodedMB > 0))
    err('audio.maxDecodedMB', `a number of MB above 0 (got ${String(game.audio.maxDecodedMB)})`);
  for (const [id, sc] of Object.entries(game.audio?.scores ?? {}))
    if (sc.pcmBytes !== undefined && sc.pcmBytes > (game.audio?.maxDecodedMB ?? 160) * 1048576)
      warn(
        `audio.scores.${id}`,
        `decodes to ${Math.round(sc.pcmBytes / 1048576)} MB, over audio.maxDecodedMB (${game.audio?.maxDecodedMB ?? 160}): it will always play as its single mix`,
      );
  // Transitions between scores (3.6): scores that exist, a landing their grid has, a bridge that is a track.
  (game.audio?.transitions ?? []).forEach((t, i) => {
    const w = `audio.transitions[${i}]`;
    for (const k of ['from', 'to'] as const)
      if (t[k] !== '*' && !game.audio?.scores?.[t[k]])
        err(`${w}.${k}`, `unknown score "${t[k]}" (audio.scores, or "*")`);
    const from = t.from === '*' ? undefined : game.audio?.scores?.[t.from];
    if (t.at !== undefined && !['beat', 'bar', 'phrase'].includes(t.at) && from && from.markers?.[t.at] === undefined)
      err(
        `${w}.at`,
        `"${t.at}" is not beat, bar, phrase or a marker of "${t.from}" (markers: ${Object.keys(from.markers ?? {}).join(', ') || 'none'})`,
      );
    // From any score to a marker (3.6.1): every score it can leave needs that marker, else it lands on a bar unsaid.
    if (t.from === '*' && t.at !== undefined && !['beat', 'bar', 'phrase'].includes(t.at)) {
      const lacking = Object.entries(game.audio?.scores ?? {})
        .filter(([id, sc]) => id !== t.to && sc.markers?.[t.at!] === undefined)
        .map(([id]) => id);
      if (lacking.length)
        err(
          `${w}.at`,
          `"${t.at}" from any score, but ${lacking.map((id) => `"${id}"`).join(', ')} has no such marker: name the scores, or give each the marker`,
        );
    }
    // The first rule naming both scores applies (core/score.ts transitionFor): one an earlier rule covers is never used.
    const masked = (game.audio?.transitions ?? [])
      .slice(0, i)
      .findIndex((r) => (r.from === '*' || r.from === t.from) && (r.to === '*' || r.to === t.to));
    const maskedBy = (game.audio?.transitions ?? [])[masked];
    if (maskedBy)
      err(w, `never used: audio.transitions[${masked}] (${maskedBy.from} → ${maskedBy.to}) comes first and covers it`);
    if (t.bridge !== undefined && !music[t.bridge]) err(`${w}.bridge`, `unknown track "${t.bridge}" (audio.music)`);
    if (t.fadeBeats !== undefined && !(t.fadeBeats >= 0)) err(`${w}.fadeBeats`, 'a number of beats, 0 or more');
  });
  // The most decoded audio a transition holds (3.6.1), from the declared pcmBytes (bridges and stingers counted by
  // `npm run weight`, which measures them): over the director's cap, that transition becomes a cut.
  const peak = transitionPeak(game, () => 0);
  if (peak && peak > (game.audio?.maxDecodedMB ?? 160) * 1048576)
    warn(
      'audio.transitions',
      `a transition holds ${Math.round(peak / 1048576)} MB decoded (both scores), over audio.maxDecodedMB (${game.audio?.maxDecodedMB ?? 160}): it will cut, without its bridge`,
    );
  // Scores (3.5): the stems of a track that exists, a tempo, mixes that name its stems, a loop inside the file.
  for (const [id, sc] of Object.entries(game.audio?.scores ?? {})) {
    const w = `audio.scores.${id}`;
    if (!music[id])
      err(w, `no single mix "${id}" in audio.music: the score's fallback (Save-Data, a low-end device) is missing`);
    const stems = Object.keys(sc.stems ?? {});
    if (!stems.length) err(w, 'no stems');
    if (!(sc.bpm > 0)) err(`${w}.bpm`, `a tempo above 0 is required (got ${String(sc.bpm)})`);
    if (sc.beatsPerBar !== undefined && !(Number.isInteger(sc.beatsPerBar) && sc.beatsPerBar > 0))
      err(`${w}.beatsPerBar`, 'a whole number of beats above 0');
    if (sc.loop && !(sc.loop[0] >= 0 && sc.loop[1] > sc.loop[0]))
      err(`${w}.loop`, `[first bar, end bar) with end > first (got ${JSON.stringify(sc.loop)})`);
    if (sc.fadeBeats !== undefined && !(sc.fadeBeats >= 0)) err(`${w}.fadeBeats`, 'a number of beats, 0 or more');
    for (const [m, bar] of Object.entries(sc.markers ?? {}))
      if (!(Number.isInteger(bar) && bar >= 0)) err(`${w}.markers.${m}`, `a bar counted from 0 (got ${String(bar)})`);
    if (sc.phraseBars !== undefined && !(Number.isInteger(sc.phraseBars) && sc.phraseBars > 0))
      err(`${w}.phraseBars`, 'a whole number of bars above 0');
    if (sc.pcmBytes !== undefined && !(Number.isInteger(sc.pcmBytes) && sc.pcmBytes > 0))
      err(`${w}.pcmBytes`, `a whole number of bytes above 0 (got ${String(sc.pcmBytes)})`);
    else if (sc.pcmBytes === undefined)
      warn(
        w,
        'no "pcmBytes" (npm run audio -- stems writes it): a browser that does not tell its memory (Safari) plays the single mix',
      );
    (sc.states ?? []).forEach((st, i) => {
      for (const x of st.stems)
        if (!stems.includes(x)) err(`${w}.states[${i}]`, `unknown stem "${x}" (stems: ${stems.join(', ')})`);
      if (st.if !== undefined) cond(st.if, `${w}.states[${i}].if`);
    });
  }
  for (const [k, id] of Object.entries(sk?.sounds ?? {})) {
    if (!id) continue;
    const inMusic = k === 'jingle' || k === 'end';
    if (inMusic ? !music[id] : !sfx[id])
      err(`skin.sounds.${k}`, `unknown ${inMusic ? 'music' : 'sound effect'}: "${id}"`);
  }
  if (game.ending) {
    const E = game.ending;
    if (!E.file) err('ending', 'requires "file" (file produced by npm run seal)');
    minigameParams('scratch', E.scratch, 'ending.scratch');
    if (E.guess) {
      if (!flagsRead.has(E.guess.flag)) flagsRead.set(E.guess.flag, 'ending.guess');
      text(E.guess.right, 'ending.guess.right');
      text(E.guess.wrong, 'ending.guess.wrong');
      text(E.guess.none, 'ending.guess.none');
    }
  }

  // ------------------------------------------------------------ game
  if (!chars[game.hero]) err('game', `unknown hero: "${game.hero}"`);
  if (game.players) {
    const P = game.players;
    if (!P.ids?.length) err('players', 'no ids');
    for (const id of P.ids ?? []) if (!chars[id]) err('players', `unknown character: "${id}"`);
    if (!P.ids?.includes(game.hero)) err('players', `the hero "${game.hero}" must be one of players.ids`);
    for (const [id, st] of Object.entries(P.start ?? {})) {
      if (!P.ids?.includes(id)) err(`players.start.${id}`, 'not a playable character');
      if (!rooms.has(st.room)) err(`players.start.${id}`, `unknown room: "${st.room}"`);
      for (const i of st.inventory ?? []) if (!items[i]) err(`players.start.${id}`, `unknown item: "${i}"`);
    }
    text(P.give, 'players.give');
    for (const id of P.ids ?? [])
      if (id !== game.hero && !chars[id]?.sprites?.idle && !chars[id]?.offscreen)
        warn('players', `"${id}" has no idle sprite: nothing to draw when they stand in a room`);
  }
  if (game.hintItem && !items[game.hintItem]) err('game', `unknown hint item: "${game.hintItem}"`);
  if (game.hintVoice && !chars[game.hintVoice]) err('game', `unknown hint voice: "${game.hintVoice}"`);
  if (!rooms.has(game.start.room)) err('start', `unknown start room: "${game.start.room}"`);
  for (const i of game.start.inventory ?? []) if (!items[i]) err('start', `unknown item: "${i}"`);
  for (const p of game.start.unlocked ?? []) if (!places[p]) err('start', `unknown map place: "${p}"`);
  cmds(game.start.intro, 'start.intro', rooms.get(game.start.room));

  for (const [cid, c] of Object.entries(chars)) {
    const w = `character ${cid}`;
    text(c.name, w);
    text(c.refuse, `${w}.refuse`);
    text(c.hug, `${w}.hug`);
    img(c.portrait, w);
    for (const [pose, frames] of Object.entries(c.sprites ?? {})) {
      if (!frames.length) err(w, `pose "${pose}" has no image`);
      frames.forEach((f) => img(f, `${w}.${pose}`));
    }
    if (!c.offscreen && c.sprites && !c.sprites.idle) warn(w, 'no "idle" pose');
    if (c.room) {
      if (!rooms.has(c.room)) err(w, `unknown starting room: "${c.room}"`);
      else if (!Object.values(rooms.get(c.room)!.actors ?? {}).some((a) => a.char === cid))
        err(w, `starting room "${c.room}" has no actor of "${cid}"`);
    }
    // Palette swap: source and target colours must be #rrggbb (others are ignored by the renderer).
    const palette = (pal: unknown, tol: unknown, pw: string) => {
      if (pal === undefined) return;
      if (!pal || typeof pal !== 'object' || Array.isArray(pal)) {
        warn(pw, 'palette must be an object { "#rrggbb": "#rrggbb" }');
        return;
      }
      for (const [k, v] of Object.entries(pal)) {
        if (!/^#[0-9a-fA-F]{6}$/.test(k)) warn(pw, `palette key "${k}" is not a #rrggbb colour (ignored)`);
        if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v))
          warn(pw, `palette value for "${k}" is not a #rrggbb colour (ignored): ${JSON.stringify(v)}`);
      }
      if (tol !== undefined && (typeof tol !== 'number' || tol < 0)) warn(pw, 'paletteTolerance must be a number >= 0');
    };
    palette(c.palette, c.paletteTolerance, `${w}.palette`);
    (c.variants ?? []).forEach((v, i) => palette(v.palette, v.paletteTolerance, `${w}.variants[${i}].palette`));
  }
  for (const [iid, it] of Object.entries(items)) {
    const w = `item ${iid}`;
    text(it.name, w);
    img(it.icon, w);
    if (it.look === undefined) warn(w, 'no text for Look');
    else texts(it.look, `${w}.look`);
  }

  // Fallback responses
  for (const v of [...game.verbs.map((x) => x.id), 'use2'] as const) {
    const list = game.rules.fallbacks[v as VerbId];
    if (!list?.length) warn('rules.fallbacks', `no fallback response for "${v}"`);
    else texts(list, `rules.fallbacks.${v}`);
  }
  (game.rules.kinds ?? []).forEach((k, i) => {
    const w = `rules.kinds[${i}]`;
    text(k.say, w);
    listLineId(k.id, w, 'this reaction by kind');
    if (!k.kind && !k.target) err(w, 'requires "kind" or "target"');
    for (const it of ids(k.item)) if (!items[it]) warn(w, `unknown item (reserved for later?): "${it}"`);
  });
  (game.rules.on ?? []).forEach((r, i) => rule(r, `rules.on[${i}]`));
  scripts(game.scripts, 'scripts');
  events(game.events, 'events');

  // Map
  mapChecks(game, { err, img, cond: (c, w) => cond(c, w), rooms, music });

  // Rooms
  // The stage (3.4): ids, images, geometry for every id and nothing else, walk zones joined by their links, what
  // only the canvas painter can draw on a room the DOM paints. Its conditions are read (a layer's flag is not dead).
  const stageChecks = (r: RoomDef, L: Layout | undefined, w: string) => {
    const st = r.stage;
    const ids = new Map<string, string>();
    const own = (id: string, kind: string, where: string) => {
      if (ids.has(id)) err(where, `stage id "${id}" is used twice (${ids.get(id)} and ${kind})`);
      else ids.set(id, kind);
    };
    for (const [i, l] of (st?.layers ?? []).entries()) {
      const lw = `${w}.stage.layers[${i}]`;
      own(l.id, 'layer', lw);
      img(l.image, lw);
      read(l.visible, lw);
      if (!['backdrop', 'scenery', 'foreground', 'effect'].includes(l.role)) err(lw, `unknown layer role: "${l.role}"`);
    }
    if ((st?.layers ?? []).filter((l) => l.role === 'backdrop').length > 1)
      warn(`${w}.stage.layers`, 'more than one backdrop layer: they are drawn in order, the first one behind');
    for (const [i, l] of (st?.lights ?? []).entries()) {
      const lw = `${w}.stage.lights[${i}]`;
      own(l.id, 'light', lw);
      read(l.visible, lw);
      if (l.kind === 'radial' && !L?.lights?.[l.id])
        err(lw, `radial light "${l.id}" has no place: layout.lights.${l.id} { at, radius }`);
    }
    for (const [i, e] of (st?.emitters ?? []).entries()) {
      const ew = `${w}.stage.emitters[${i}]`;
      own(e.id, 'emitter', ew);
      read(e.visible, ew);
      img(e.image, ew);
      if (!L?.emitters?.[e.id]) err(ew, `emitter "${e.id}" has no area: layout.emitters.${e.id} { area }`);
    }
    for (const [id, link] of Object.entries(st?.links ?? {})) {
      const kw = `${w}.stage.links.${id}`;
      read(link.if, kw);
      text(link.locked, `${kw}.locked`);
      if (!L?.walkLinks?.[id]) err(kw, `no walk link "${id}" in the layout`);
    }
    if (!L) return;
    const layerIds = new Set(['decor', ...(st?.layers ?? []).map((l) => l.id)]);
    for (const id of Object.keys(L.layers ?? {}))
      if (!layerIds.has(id)) err(`layout ${w}.layers.${id}`, `no stage layer "${id}" in the room`);
    stageLayoutChecks(w, r, L, st, layerIds, { err, warn, img });
    const S = stageOf(r, L);
    if (S.canvasOnly.length && rendererOf(r, game) === 'dom')
      warn(
        `${w}.stage`,
        `only the canvas painter draws ${S.canvasOnly.join(', ')}: the DOM painter leaves them out (renderer: 'canvas' on the room or the game)`,
      );
  };

  for (const r of game.rooms) {
    const w = r.id;
    const L = layouts[r.id];
    const ents = entities(r);
    text(r.name, w);
    for (const [xid, ex] of Object.entries(r.exits ?? {})) {
      const xw = `${w}.exits.${xid}`;
      text(ex.name, xw);
      text(ex.locked, `${xw}.locked`);
      const lay = layouts[ex.to];
      if (!rooms.has(ex.to)) err(xw, `unknown room: "${ex.to}"`);
      else if (typeof ex.entry === 'string' && lay && !lay.entries?.[ex.entry])
        err(xw, `unknown entry point "${ex.entry}" in ${ex.to}`);
      if (ex.to === r.id) warn(xw, 'exit leading to its own room');
      for (const v of ex.verbs ?? []) if (!verbIds.has(v)) err(xw, `unknown verb: "${v}"`);
      if (ex.sfx && !sfx[ex.sfx]) err(xw, `unknown sound effect: "${ex.sfx}"`);
      const written = gameIn.rooms.find((x) => x.id === r.id)?.hotspots?.[xid];
      if (written && !written.exit) err(xw, `"${xid}" is both an exit and a hotspot`);
    }
    if (images) img(r.decor, `${w}.decor`);
    if (r.music && !music[r.music]) err(w, `unknown music: "${r.music}"`);
    stageChecks(r, L, w);
    if (!L) warn(w, 'no layout: nothing will be clickable (place the room in the editor)');

    for (const [pid, p] of Object.entries(r.props ?? {})) {
      const pw = `${w}.props.${pid}`;
      if (!p.img && !p.states) err(pw, 'neither "img" nor "states"');
      img(p.img, pw);
      for (const [st, im] of Object.entries(p.states ?? {})) img(im, `${pw}.${st}`);
      if (p.initial && p.states && !p.states[p.initial]) err(pw, `unknown initial state: "${p.initial}"`);
      for (const [an, a] of Object.entries(p.anims ?? {})) {
        const aw = `${pw}.anims.${an}`;
        if (a.loop)
          for (const [k, b] of Object.entries(a.at ?? {}))
            for (const x of b)
              if (typeof x !== 'object' || !('sfx' in x || 'shake' in x))
                err(
                  `${aw}.at[${k}]`,
                  'a looping animation only plays sounds and shakes at a frame (sfx, shake): the loop never ends, anything else would repeat forever',
                );
        if (!a.frames?.length) err(aw, 'animation with no frame');
        a.frames?.forEach((f, i) => img(f, `${aw}[${i}]`));
        if (a.fps !== undefined && !(a.fps > 0)) err(aw, 'fps must be positive');
        for (const [i, b] of Object.entries(a.at ?? {})) {
          if (!/^\d+$/.test(i) || Number(i) >= (a.frames?.length ?? 0))
            err(aw, `at: frame ${i} is outside the animation (${a.frames?.length ?? 0} frames)`);
          cmds(b, `${aw}.at[${i}]`, r);
        }
      }
      cond(p.visible, pw, r);
      if (p.name !== undefined) text(p.name, pw);
      if (L && !L.props?.[pid]) err(pw, 'no position in the layout');
    }
    for (const [aid, a] of Object.entries(r.actors ?? {})) {
      const aw = `${w}.actors.${aid}`;
      const ch = chars[a.char];
      if (!ch) err(aw, `unknown character: "${a.char}"`);
      else if (a.pose && ch.sprites && !ch.sprites[a.pose]) warn(aw, `pose "${a.pose}" missing (falls back to idle)`);
      cond(a.visible, aw, r);
      if (L && !L.actors?.[aid]) err(aw, 'no position in the layout');
      if (
        a.interactive !== false &&
        ch?.kind?.includes('person') &&
        !r.talk?.[aid] &&
        !(r.on ?? []).some((x) => ids(x.verb as Id | Id[]).includes('talk') && ids(x.a).includes(aid))
      )
        warn(aw, 'person with no conversation topics');
    }
    for (const [hid, h] of Object.entries(r.hotspots ?? {})) {
      const hw = `${w}.hotspots.${hid}`;
      text(h.name, hw);
      cond(h.visible, hw, r);
      if (L && !hasGeometry(r, hid)) err(hw, 'no zone in the layout (rect or poly)');
    }
    // Look: anything named should have a response
    const named = [
      ...Object.keys(r.hotspots ?? {}),
      ...Object.entries(r.props ?? {})
        .filter(([, p]) => p.name)
        .map(([k]) => k),
      ...Object.entries(r.actors ?? {})
        .filter(([, a]) => a.interactive !== false)
        .map(([k]) => k),
    ];
    for (const id of named)
      if (
        !r.look?.[id] &&
        !(r.on ?? []).some((x) => ids(x.verb as Id | Id[]).includes('look') && ids(x.a).includes(id))
      )
        warn(`${w}.look`, `"${id}" has no text for Look (fallback response)`);
    for (const [k, t] of Object.entries(r.look ?? {})) {
      if (!ents.has(k) && !items[k] && !(game.players && playerIds.includes(k)))
        err(`${w}.look.${k}`, `"${k}" does not exist in the room`);
      texts(t, `${w}.look.${k}`);
    }
    (r.on ?? []).forEach((x, i) => rule(x, `${w} › on[${i}]`.replace(`${w} › `, `${w}.`), r));
    for (const [aid, topics] of Object.entries(r.talk ?? {})) {
      const tw = `${w}.talk.${aid}`;
      if (!r.actors?.[aid]) err(tw, `"${aid}" is not an actor in the room`);
      if (!topics.length) warn(tw, 'no topics');
      topics.forEach((t, i) => {
        const xw = `${tw}[${i}]`;
        stable(t.id, xw, 'talk topic');
        text(t.topic, xw);
        cond(t.if, xw, r);
        cmds(t.do, xw, r);
      });
    }
    (r.hints ?? []).forEach((h, i) => {
      cond(h.until, `${w}.hints[${i}]`, r);
      texts(h.lines, `${w}.hints[${i}]`);
      if (!h.id && strictLines())
        err(
          `${w}.hints[${i}]`,
          'this hint has no stable id in a translated or voiced release (`npm run ids -- --lines=all --write --map`)',
        );
    });
    if ((r.on ?? []).length && !(r.hints ?? []).length) warn(w, 'has puzzles but no hints');
    cmds(r.onEnter, `${w}.onEnter`, r);
    scripts(r.scripts, `${w}.scripts`, r);
    events(r.events, `${w}.events`, r);

    if (L) {
      if (L.width !== undefined && (typeof L.width !== 'number' || L.width < 640))
        err(`${w}.layout`, 'width must be a number of at least 640');
      const W = L.width ?? 640;
      for (const [k, h] of Object.entries(L.hotspots ?? {}))
        if (h.rect && h.rect[0] + h.rect[2] > W + 1)
          warn(`${w}.layout`, `zone "${k}" goes beyond the room's width (${W})`);
      for (const [k, p] of Object.entries(L.props ?? {}))
        if (p.x > W) warn(`${w}.layout`, `prop "${k}" is beyond the room's width (${W})`);
      for (const [k, p] of Object.entries(L.entries ?? {}))
        if (p[0] > W) warn(`${w}.layout`, `entry "${k}" is beyond the room's width (${W})`);
      for (const k of Object.keys(L.hotspots ?? {}))
        if (!r.hotspots?.[k]) warn(`${w}.layout`, `zone "${k}" has no hotspot in the room`);
      for (const k of Object.keys(L.props ?? {}))
        if (!r.props?.[k]) warn(`${w}.layout`, `position "${k}" has no prop in the room`);
      for (const k of Object.keys(L.actors ?? {}))
        if (!r.actors?.[k]) warn(`${w}.layout`, `position "${k}" has no actor in the room`);
      if (!L.entries?.default) warn(`${w}.layout`, 'no "default" entry point');
    }
  }

  // World map: every room should be reachable, every exit should have a way back (or say it has not).
  const g = worldGraph(game);
  for (const id of g.unreachable) warn(id, 'no exit, goto or map place leads to this room from the start');
  for (const e of g.oneWay)
    warn(`${e.from}.exits.${e.via}`, `no way back from ${e.to} to ${e.from} (add oneWay: true if intended)`);

  // Chapters, invariants, the player's side (menus, taps), migrations
  (game.invariants ?? []).forEach((c, i) => cond(c, `invariants[${i}]`));
  playerChecks(game, { err, warn, locales: opts.locales });
  migrationChecks(game, { items, rooms, places, scriptIds, playerIds, chars, err, warn });
  // Checkpoints
  for (const [cid, c] of Object.entries(game.checkpoints ?? {})) {
    const w = `checkpoints.${cid}`;
    (c.goals ?? []).forEach((g, i) => cond(g, `${w}.goals[${i}]`, rooms.get(c.room)));
    if (!rooms.has(c.room)) err(w, `unknown room: "${c.room}"`);
    for (const i of c.inventory ?? []) if (!items[i]) err(w, `unknown item: "${i}"`);
    for (const p of c.unlocked ?? []) if (!places[p]) err(w, `unknown map place: "${p}"`);
    for (const [k, st] of Object.entries(c.props ?? {})) propRef(k, st, w);
    for (const [ch, rid] of Object.entries(c.where ?? {})) mover(ch, rid, `${w}.where`);
    if (c.active && !playerIds.includes(c.active)) err(w, `"${c.active}" is not a playable character`);
    for (const [pid, p] of Object.entries(c.players ?? {})) {
      if (!playerIds.includes(pid)) err(`${w}.players`, `"${pid}" is not a playable character`);
      if (!rooms.has(p.room)) err(`${w}.players.${pid}`, `unknown room: "${p.room}"`);
      for (const i of p.inventory ?? []) if (!items[i]) err(`${w}.players.${pid}`, `unknown item: "${i}"`);
    }
  }
  // Events and scripts, objectives, Remix (4.1.15), the speedrun manifest (4.1.14), text switches (4.3.0); then the flags
  for (const [id, where] of scriptRefs) if (!scriptIds.has(id)) err(where, `unknown script: "${id}"`);
  eventChecks(game, { emitted, listened, waited }, err, warn);
  objectiveChecks(game, { cond, err, warn, commands: opts.commands });
  remixChecks(game, { err, warn, flagsSet, flagsRead });
  speedrunChecks(game, { err, warn, flags: new Set(flagsSet.keys()) });
  textSwitchChecks(gameIn, { err, warn, flagsSet, flagsRead, commands: opts.commands });
  voiceValueChecks(gameIn, warn, opts.locales);
  for (const [f, where] of flagsRead) if (!flagsSet.has(f)) warn(where, `flag "${f}" is read but never set`);
  // A decorative flag kept on purpose: `lint.ignore` names it (`flag-never-read` or `flag-never-read:<flag>`), like the lint's codes.
  const ignored = new Set(game.lint?.ignore ?? []);
  for (const [f, where] of flagsSet)
    if (!flagsRead.has(f) && !ignored.has('flag-never-read') && !ignored.has(`flag-never-read:${f}`))
      warn(where, `(info) flag "${f}" is set but never read (flag-never-read)`);
  // The puzzle graph: a flag only set by actions that already need it can never become true.
  for (const n of puzzleIssues(puzzleGraph(game, { commands: opts.commands })).selfLocked)
    warn(
      flagsSet.get(n.label) ?? 'flags',
      `flag "${n.label}" is only set by actions that already require it: it can never become true`,
    );

  return { errors, warnings };
}
