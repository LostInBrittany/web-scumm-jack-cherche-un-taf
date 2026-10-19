// The vocabulary of content: ids, conditions, commands, verbs, rules, characters, items, props, actors, hotspots, topics, exits, hints, scripts and listeners. (core/types.ts re-exports every name; 4.1.0 "Clarity".)

/**
 * An identifier in the content (a room, an item, a flag, a character, a prop…): a plain string the game chooses.
 * @public
 */
export type Id = string;

/** What a flag holds: a boolean, a number or a string. @public */
export type Value = boolean | number | string;

/** Logical coordinates of a backdrop: 640 × 400, origin top-left. @public */
export type Point = [number, number];

// ---------------------------------------------------------------------------
// Conditions (data, never closures)
// ---------------------------------------------------------------------------

/**
 * A condition.
 * - `'flag'`: the flag is true; `'!flag'`: the flag is false or absent.
 * - `{ has: 'item' }`: the item is in the inventory.
 * - `{ flag: 'x', eq: 3 }`, `{ flag: 'x', gte: 2 }`, `{ flag: 'x', lt: 5 }`.
 * - `{ not: … }`, `{ all: […] }`, `{ any: […] }`.
 * - `{ visited: 'room' }`: this room has already been entered; `{ room: 'room' }`: we're in it.
 * - `{ prop: ['amp', 'on'] }`: the prop is in that state (in the current room, or `'room.prop'`).
 * - `{ unlocked: 'place' }`: the place is unlocked on the map.
 * - `{ seen: 'room.actor.0' }`: the conversation topic has already been heard.
 * - `{ actorIn: ['grandpa', 'garden'] }`: the character is in that room (one that moves: `CharacterDef.room`, `moveActor`).
 * - `{ player: 'laverne' }`: this character is the one the player controls now (`GameDef.players`).
 * @public
 */
export type Cond =
  | string
  | { has: Id }
  | { flag: Id; eq?: Value; gte?: number; lt?: number }
  | { not: Cond }
  | { all: Cond[] }
  | { any: Cond[] }
  | { visited: Id }
  | { room: Id }
  | { prop: [Id, string] }
  | { unlocked: Id }
  | { seen: string }
  | { actorIn: [Id, Id] }
  | { player: Id };

// ---------------------------------------------------------------------------
// Script commands
// ---------------------------------------------------------------------------

/** Who speaks or acts. `'hero'` always designates the hero, whatever their id. @public */
export type Who = Id;

/** Target of a move: a hotspot, an actor or a prop in the room (its approach point), or a point. @public */
export type WalkTarget = Id | Point;

/**
 * One line of a list the engine draws from (a look list, a hint, the fallback answers): a plain string, keyed by its
 * position in translations, or `{ id, text }` (schema 3, `npm run ids -- --lines=all`), keyed by its id so that
 * inserting or moving a line never shifts its translation or voice clip (`audio.voices[id]` is its clip).
 * @public
 */
export type ListLine = string | { id: Id; text: string };

/**
 * A command. A plain string = the hero says this line.
 * Command lists run in order, each one waiting for the previous one to finish.
 * @public
 */
export type Cmd =
  | string
  // --- speech
  | {
      say: [Who, string];
      shout?: boolean;
      /** Stable id of the line (schema 3, `npm run ids -- --lines`): translations and voice clips are keyed by it, so
       *  inserting or moving a line never shifts them. A plain string line stays keyed by its owner and position. */
      id?: Id;
      /** A voice clip (`audio.voices`): the line stays as long as the clip plays, then moves on. Defaults to the
       *  line's `id` when `audio.voices` has a clip under it. */
      voice?: Id;
    }
  // --- movement and poses
  | { walk: WalkTarget; who?: Who }
  | { face: 'left' | 'right' | Id; who?: Who }
  | { pose: [Who, string] }
  /** `at`: commands run when the animation reaches that frame (index in the pose's images, at the character's `fps`). */
  | { anim: [Who, string]; ms?: number; at?: Record<number, Cmd[]> }
  | { place: [Who, Point]; face?: 'left' | 'right' }
  | { wait: number }
  /** Stage physics (3.4, core/motion.ts): computed motions, presentation only. A ballistic flight from `from` (default
   *  where the target is) to `to`, peaking `height` above the line (default a third of the distance), turning `rotate`
   *  degrees. A character stays where it lands (like `place`), a prop until the room is entered again. */
  | { launch: { target: Who; to: Id | Point; from?: Id | Point; height?: number; ms?: number; rotate?: number } }
  /** A damped oscillation around the target's place: `axis` x, y or rot (degrees), `amplitude` (default 10),
   *  `frequency` in hertz (default 3), `damping` 0–1 (default 0.25), `ms` (default 1200). A lamp swinging, a shelf shaking. */
  | {
      spring: {
        target: Who;
        axis?: 'x' | 'y' | 'rot';
        amplitude?: number;
        frequency?: number;
        damping?: number;
        ms?: number;
      };
    }
  /** Along a Catmull-Rom spline through `points` (eased), optionally turned along it (`orient`). */
  | { path: { target: Who; points: Point[]; ms?: number; orient?: boolean } }
  /** Keeps the target at `offset` from `leader` for `ms` (a parrot on a shoulder, a balloon on a string). */
  | { follow: { target: Who; leader: Who; offset?: Point; ms: number } }
  | { parallel: Cmd[][] }
  /**
   * Camera of a wide room (`Layout.width` > 640): follow the hero again, pan to a left edge x (animated over `ms`),
   * centre on something (`to`), or `reset` (= follow). Ignored in a 640-wide room.
   */
  | { camera: 'follow' | 'reset' | { pan: number; ms?: number } | { to: Id; ms?: number } }
  /** Plays a prop animation (`PropDef.anims`): waits for it to end, unless it loops. Its `at` commands run on the way. */
  | { play: [Id, string] }
  /** Stops a looping prop animation: the prop shows its state image again. */
  | { stopAnim: Id }
  // --- world
  | { prop: [Id, string] }
  | { show: Id; fade?: number }
  | { hide: Id; fade?: number }
  | { gain: Id }
  | { lose: Id }
  /** The item has been used: it stays in the inventory, greyed out, and isn't offered again unless a rule targets it. `gain` re-enables it. */
  | { used: Id | Id[] }
  | { set: Id | [Id, Value] }
  | { unset: Id }
  | { inc: Id; by?: number }
  | { unlock: Id }
  | { goto: Id; at?: Id | Point }
  | { map: true }
  /**
   * Moves a character to another room, where it must be declared as an actor (and placed in the layout). The character
   * needs a starting room (`CharacterDef.room`). `at`: an entry point or a point of that room; otherwise its layout position.
   */
  | { moveActor: [Id, Id]; at?: Id | Point }
  // --- events and scripts (EventRule, ScriptDef)
  /** Fires an event: the listeners of the current room, then of the game (`events`), run right here, in order. */
  | { emit: Id }
  /** In a script: pause until the condition holds. */
  | { waitUntil: Cond }
  /** In a script: pause until the event is emitted. */
  | { waitEvent: Id }
  // --- several playable characters (GameDef.players)
  /** The player now controls this character: the view moves to their room, their inventory shows. */
  | { switchPlayer: Id }
  /** Hands an item of the active character to another playable character (their own inventory). */
  | { transfer: [Id, Id] }
  /**
   * A command the game defines in code (`commands` exported by games/<id>/index.ts, see core/custom.ts): its declared
   * `effects` run here (the solver and the save know them), then its `run` draws whatever it wants in the browser.
   */
  | { custom: string; args?: unknown }
  /** Starts a script from its first command (again, if it was done or stopped). */
  | { startScript: Id }
  /** Stops a script; `startScript` brings it back. */
  | { stopScript: Id }
  // --- audio and effects
  /** `caption`: what the sound means, written for whoever cannot hear it (shown with the captions setting, translated). */
  | { sfx: Id; caption?: string }
  | { music: Id | { push: Id } | { pop: true } | { stop: true } | { once: Id } | { stinger: Id } }
  | { toast: string; id?: Id }
  | { shake: number }
  // --- logic
  | { if: Cond; then: Cmd[]; else?: Cmd[] }
  | { once: Cmd[] /** Stable persistence id (v3). */; id?: Id /** @deprecated v2 alias. */; key?: string }
  | { nth: Cmd[][] /** Stable persistence id (v3). */; id?: Id /** @deprecated v2 alias. */; key?: string }
  | { cycle: Cmd[][] /** Stable persistence id (v3). */; id?: Id /** @deprecated v2 alias. */; key?: string }
  | { random: Cmd[][] /** Stable persistence id (v3). */; id?: Id /** @deprecated v2 alias. */; key?: string }
  // --- sequences and screens
  | { cutscene: Cmd[] }
  | { choice: Choice[] }
  | { minigame: Id; params?: Record<string, unknown>; then?: Cmd[] }
  /** Incoming call. A list = several callers in the same call (shown side by side). */
  | { phone: Who | Who[]; do: Cmd[] }
  | { guide: { verb: VerbId; target: Id; say: string }; id?: Id }
  | { talk: Id }
  | { hint: true }
  /**
   * The sealed ending (`ending` module): decryption, scratch ticket and confetti rain, then `after` (celebration lines),
   * then the final card. `{ reveal: true }` is the old name, still accepted.
   */
  | { ending: true; after?: Cmd[] }
  | { reveal: true; after?: Cmd[] }
  | { end: true };

/** One answer the player may pick in a `{ choice }` command: its text, when it is offered, what it runs. @public */
export interface Choice {
  /** Stable id used by saves, translations and voice production (required by schema v3). */
  id?: Id;
  text: string;
  if?: Cond;
  /** Disappears once chosen. */
  once?: boolean;
  do: Cmd[];
}

// ---------------------------------------------------------------------------
// Verbs and reactions
// ---------------------------------------------------------------------------

/**
 * Verb id, free-form: the game's own `verbs` declare them.
 * Four ids have meaning to the engine: `look` ("Look" text for rooms and items), `talk` (conversation
 * topics, hint item), `give` and `use` (two terms: inventory item then target; `use` alone on an inventory
 * item selects it). Other verbs are only handled through written rules and fallback responses.
 * @public
 */
export type VerbId = string;

/**
 * A verb as the interface shows it: its id, its label, its colour and the joining word of a two-term sentence.
 * @public
 */
export interface VerbDef {
  id: VerbId;
  label: string;
  color: string;
  /** For Use / Give: joining word shown in the sentence ("with", "to"). */
  join?: string;
}

/**
 * A written reaction: "when VERB is done on A (with/to B), if CONDITION, then …".
 * `a` and `b` accept a list: the rule works with any of them.
 * For Use/Give with two terms, `a` is the inventory item, `b` the target. The reverse order is also accepted
 * for two inventory items (combining).
 * @public
 */
export interface Rule {
  /** Stable id used by saves, diagnostics and the puzzle graph (required by schema v3). */
  id?: Id;
  verb: VerbId | VerbId[];
  a: Id | Id[];
  b?: Id | Id[];
  if?: Cond;
  do: Cmd[];
  /** Generated from this exit of `RoomDef.exits` (core/define.ts): not written by the author. */
  exit?: Id;
}

/**
 * Reaction by "kind": applies to anything with this `kind` (e.g. `person`, `cat`), before fallback responses.
 * `target` targets a specific id (takes priority over `kind`), `item` restricts to a used/given item.
 * `{nom}` is replaced by the target's name, `{objet}` by the item.
 * @public
 */
export interface KindRule {
  /** Stable id (schema 3, `npm run ids -- --lines`): its translation (`kinds.<id>.say`) and voice clip follow it. */
  id?: Id;
  verb: VerbId | VerbId[];
  kind?: string;
  target?: Id;
  item?: Id | Id[];
  say: string;
}

// ---------------------------------------------------------------------------
// Characters, items, rooms
// ---------------------------------------------------------------------------

/** A set of images for a character: pose → list of images (looped). @public */
export type SpriteSet = Record<string, Id[]>;

/**
 * Mouth images for a pose: the body doesn't move while speaking, only the mouth changes.
 * `closed` replaces the idle pose's image (t1), `open` cycles randomly during the line (t2, t3, t4),
 * `blink` occasionally returns to idle (t5), `smile` ends a happy line (t6).
 * @public
 */
export interface MouthSet {
  closed: Id;
  open: Id[];
  blink?: Id;
  smile?: Id;
}

/**
 * A character: its name, dialogue colour, poses, mouths and portrait, its kinds, and the variants its state selects.
 * @public
 */
export interface CharacterDef {
  name: string;
  /**
   * What the character looks like, in words, for the art prompts (`npm run prompts`, docs/en/PROMPTS.md): age, hair,
   * glasses, build, outfit, signature accessory, personality. Not shown in the game. The more specific, the more
   * consistent the character stays across sheets generated in different conversations.
   */
  description?: string;
  /** Color of their dialogue text. */
  color: string;
  /** On-screen height, in logical units (640 × 400), in the foreground. */
  height?: number;
  /** Poses: at minimum `idle`. Conventions: idle, talk, walk, walk_front, walk_back, point, use, + special poses. */
  sprites?: SpriteSet;
  /** Portrait for the map, calls and conversation menus. */
  portrait?: Id;
  /** Kinds, for kind-based reactions (e.g. ['person'], ['cat']). */
  kind?: string[];
  /**
   * Starting room of a character that moves between rooms (`moveActor`, `actorIn`): only its actor in that room shows
   * at first, the ones declared in other rooms wait for it. Without it, every actor of the character shows (the usual case).
   */
  room?: Id;
  /** Offscreen voice: speaks in a frame at the top of the screen (narrator, plush toy, phone). */
  offscreen?: boolean;
  /** Refusal when given an item with no written reaction. */
  refuse?: string;
  /** Response to the global "Want a hug?" topic. */
  hug?: string;
  /** Animation frames per second (default 8). */
  fps?: number;
  /** Soft glow around the character (CSS color), e.g. an apparition. */
  glow?: string;
  /** Mouths per pose (see MouthSet). With no mouth for a pose, the character keeps the same image while speaking. */
  mouths?: Record<string, MouthSet>;
  /**
   * Palette swap: source colour → target colour, both `#rrggbb` (e.g. `{ '#492a25': '#b0592a' }`). The room view
   * recolours every sprite and mouth frame of the character once (offscreen canvas, cached), keeping alpha. Exact RGB
   * matches only, unless `paletteTolerance` is set. Exact colours survive best with the `pixel` art style (site.json
   * `artStyle`), whose cutter writes one exact value per material. Portraits in menus are not recoloured.
   */
  palette?: Record<string, string>;
  /**
   * RGB distance under which a pixel counts as a source colour of `palette` (default 0: exact matches only). With a
   * tolerance, the nearest source colour wins and the pixel keeps its offset from it, so painted (`cel`) art and lossy
   * WebP still recolour cleanly. Around 10 to 16 suits cel art; keep it below the distance to the outline colour.
   */
  paletteTolerance?: number;
  /**
   * Image sets depending on state: the first variant whose condition is true replaces sprites / mouths / portrait,
   * and `palette` / `paletteTolerance` when it has them (a variant with no palette keeps the character's).
   */
  variants?: {
    if: Cond;
    sprites?: SpriteSet;
    mouths?: Record<string, MouthSet>;
    portrait?: Id;
    palette?: Record<string, string>;
    paletteTolerance?: number;
  }[];
}

/** An inventory item: its name, its icon, its look lines and its kinds. @public */
export interface ItemDef {
  name: string;
  icon: Id;
  /** Looking at the item in the inventory. A list = a different line each time (looped). */
  look?: string | ListLine[];
  kind?: string[];
}

/**
 * A prop animation: images in order at `fps` (default 8); `at` = commands run when a frame is reached (index).
 * @public
 */
export interface PropAnim {
  frames: Id[];
  fps?: number;
  loop?: boolean;
  at?: Record<number, Cmd[]>;
}

/** A prop in the scenery, with states (e.g. amp off/on). Its position comes from the layout. @public */
export interface PropDef {
  /** The verb a double tap uses on it (4.0), when the logical one is not right: see core/default-verb.ts. */
  defaultVerb?: VerbId;
  /** A single image, or one image per state. */
  img?: Id;
  states?: Record<string, Id>;
  /** Animations played by `{ play: [prop, name] }`; the prop goes back to its state image afterwards. */
  anims?: Record<string, PropAnim>;
  initial?: string;
  /** Display name: if there is one, the prop is interactive. */
  name?: string;
  kind?: string[];
  /** Visible only if… */
  visible?: Cond;
}

/** A character standing in a room: which one, its pose and facing, and when it shows. @public */
export interface ActorDef {
  /** The verb a double tap uses on it (4.0), when the logical one is not right: see core/default-verb.ts. */
  defaultVerb?: VerbId;
  char: Id;
  /** false: living scenery, neither clickable nor named (e.g. an apparition). */
  interactive?: boolean;
  pose?: string;
  facing?: 'left' | 'right';
  visible?: Cond;
  /** Display name if different from the character. */
  name?: string;
}

/** A named zone of the room the player can act on; its geometry lives in the layout. @public */
export interface HotspotDef {
  /** The verb a double tap uses on it (4.0), when the logical one is not right: see core/default-verb.ts. */
  defaultVerb?: VerbId;
  name: string;
  kind?: string[];
  visible?: Cond;
  /** Generated from `RoomDef.exits` (core/define.ts): not written by the author. */
  exit?: boolean;
}

/** A conversation topic offered when talking to an actor: its line, when it is offered, what it runs. @public */
export interface TalkTopic {
  /** Stable id used by saves and translations (required by schema v3). */
  id?: Id;
  topic: string;
  if?: Cond;
  do: Cmd[];
}

/**
 * A way out of the room, declared rather than written as a hotspot plus a rule. The engine turns it into exactly that
 * (core/define.ts `normalizeExits`): a hotspot `id` (placed in the layout like any zone, kind `exit`) and, first in the
 * room's rules, "VERB id → goto". So everything else (look lines, other rules, the editor, the solver) sees a hotspot.
 * Declared exits also give the tools the map of the world (unreachable rooms, one-way passages).
 * @public
 */
export interface ExitDef {
  /** The verb a double tap uses on it (4.0), when the logical one is not right: see core/default-verb.ts. */
  defaultVerb?: VerbId;
  name: string;
  to: Id;
  /** Entry point (layout `entries`) or point in the target room. */
  entry?: Id | Point;
  /** Passable only if… (otherwise `locked` is said, or the fallback). */
  if?: Cond;
  /** The hero's line when the exit is not passable yet. */
  locked?: string;
  /** Verbs that take the exit. Default: use, open, walk, go, enter, push, pull (those the game has). */
  verbs?: VerbId[];
  /** Sound played when leaving. */
  sfx?: Id;
  visible?: Cond;
  kind?: string[];
  /** The player cannot come back this way: the tools stop reporting it as a missing way back. */
  oneWay?: boolean;
  /**
   * What a single tap on it does with no verb picked (4.1.x): `go` walks there and goes through on arrival (the
   * double tap's verb, `defaultVerb`), `walk` only walks there. Default: `go` when the game sets
   * `input.exitOnTap`, else `walk`. Input only: the rules, the solver and saves do not see it.
   */
  onTap?: 'go' | 'walk';
}

/** A hint the hint item gives while its `until` condition is false, as lines said in order. @public */
export interface HintDef {
  /** Stable id (schema 3, `npm run ids -- --lines`): translations follow it (`hints.<id>.lines…`), not its position. */
  id?: Id;
  /** The hint holds as long as this condition is false. The first unsatisfied hint is given. */
  until: Cond;
  lines: ListLine[];
}

/**
 * A script of the world: it runs on its own, without a player action, one command at a time, in the gaps between the
 * player's actions (never during one, a cutscene, a conversation or a minigame). A room's scripts run while the player
 * is in the room; the game's scripts run everywhere. Its position is saved: it resumes where it was.
 * @public
 */
export interface ScriptDef {
  /** Unique in the whole game. */
  id: Id;
  /** Runs only while this holds; when false, the script rewinds and waits. */
  while?: Cond;
  /** Starts again from the top when done. A loop needs a `wait`, `waitUntil` or `waitEvent`. */
  loop?: boolean;
  do: Cmd[];
  /** Stable id of each command in `do`, at the matching position (required by schema v3). */
  stepIds?: Id[];
}

/**
 * A listener: when `on` is emitted (`{ emit }`) and the condition holds, `do` runs. `once`: only the first time.
 * @public
 */
export interface EventRule {
  /** Stable id used by saves and diagnostics (required by schema v3). */
  id?: Id;
  on: Id;
  if?: Cond;
  once?: boolean;
  do: Cmd[];
}
