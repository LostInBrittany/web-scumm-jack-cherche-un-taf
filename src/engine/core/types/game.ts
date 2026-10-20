// A game and its rooms: the room, the map, the rules, the ending, the skin, the game itself, its migrations and its interface texts. (core/types.ts re-exports every name; 4.1.0 "Clarity".)
import type { AudioDef } from './audio';
import type { AnchorDef, VariationManifest } from '../remix/manifest';
import type { WorldVariant } from '../remix/compile';
import type { RealityDef } from './reality';
import type { SpeedrunManifest } from './speedrun';
import type {
  ActorDef,
  CharacterDef,
  Cmd,
  Cond,
  EventRule,
  ExitDef,
  HintDef,
  HotspotDef,
  Id,
  ItemDef,
  KindRule,
  ListLine,
  PropDef,
  Rule,
  ScriptDef,
  TalkTopic,
  Value,
  VerbDef,
  VerbId,
} from './content';
import type { StageDef } from './stage';

/**
 * A room: its backdrop or stage, props, actors, hotspots, exits, look lines, reactions, topics, hints and scripts.
 * @public
 */
export interface RoomDef {
  id: Id;
  name: string;
  /** Background image. */
  decor: Id;
  /**
   * What the background shows, left to right, with its light and mood: the LOCATION line of the background prompt
   * (`npm run prompts`, docs/en/PROMPTS.md). Not shown in the game.
   */
  description?: string;
  /**
   * Furniture drawn on its own sheet rather than painted into the decor (image ids, e.g. `furniture_dining/table`), so
   * the engine can depth-sort it with the characters. Props whose image lives in a `furniture_*` folder are counted
   * anyway; list here the pieces no prop uses yet. Only read by `npm run prompts`.
   */
  furniture?: Id[];
  music?: Id;
  props?: Record<Id, PropDef>;
  actors?: Record<Id, ActorDef>;
  hotspots?: Record<Id, HotspotDef>;
  /** Ways out (see ExitDef): hotspots with a goto rule, and the world's map for the tools. */
  exits?: Record<Id, ExitDef>;
  /** Look: a line, or a list (looped). Anything visible should have one. */
  look?: Record<Id, string | ListLine[]>;
  on?: Rule[];
  /** Conversation topics per actor (2 or 3). "Want a hug?" and "Bye" are added by the game. */
  talk?: Record<Id, TalkTopic[]>;
  hints?: HintDef[];
  onEnter?: Cmd[];
  /** Scripts that run on their own while the player is in the room (see ScriptDef). */
  scripts?: ScriptDef[];
  /** Listeners of the room's events, then of the game's (see EventRule). */
  events?: EventRule[];
  /** Is the hero present? (no for a pure cutscene) */
  hero?: boolean;
  /** Layers, lights, particles, the room's transition and the logic of its walk links (3.4, `StageDef`). */
  stage?: StageDef;
  /** Which painter draws this room (D10): `dom` (the reference) or `canvas`; default `GameDef.renderer`, else `dom`. */
  renderer?: 'dom' | 'canvas';
  /**
   * Tagged spots where Remix may place an item (4.1.15, ADR 0018): `at` the prop or hotspot it stands on, `visible`,
   * `reachableBy` (never a condition that needs the item placed there), `capacity` (default 1), `phase`.
   */
  anchors?: Record<Id, AnchorDef>;
  /** Narrator voice for the room, for offscreen comments. */
}

// ---------------------------------------------------------------------------
// World map
// ---------------------------------------------------------------------------

/** A region of the travel map: its image, its parent region and its frame on it. @public */
export interface MapRegion {
  name: string;
  image: Id;
  /** Parent region (France opens from World). */
  parent?: Id;
  /** The region's area on the parent image (0–100%), for the zoom button. */
  frame?: [number, number, number, number];
}

/** A place on the travel map: the room it opens, its region and position, its vehicle and its news marker. @public */
export interface PlaceDef {
  name: string;
  room: Id;
  region: Id;
  /** Position on the region's image, in % [x, y]. */
  pos: [number, number];
  portrait?: Id;
  /** Vehicle drawn along the route. */
  vehicle?: 'car' | 'plane';
  /** "!" shown while this condition is true. */
  news?: Cond;
}

/** The travel map: its regions, its places and the region shown first. @public */
export interface MapDef {
  regions: Record<Id, MapRegion>;
  /** Region shown on opening. */
  start: Id;
  places: Record<Id, PlaceDef>;
  music?: Id;
  vehicles?: { car?: Id; plane?: Id; pin?: Id; news?: Id };
}

// ---------------------------------------------------------------------------
// The game
// ---------------------------------------------------------------------------

/** The rules shared by every room: fallback responses per verb, reactions by kind, rules valid everywhere. @public */
export interface GameRules {
  /** Fallback responses per verb (picked at random, never the same one twice in a row). `use2` = two items that don't go together. */
  fallbacks: Partial<Record<VerbId | 'use2', ListLine[]>>;
  kinds?: KindRule[];
  /** Rules valid everywhere (e.g. combining two inventory items). */
  on?: Rule[];
}

/** Sealed ending (`ending` module): encrypted content, decrypted at the end of the game and shown on a card. @public */
export interface EndingDef {
  /** Encrypted file produced by `npm run seal`. */
  file: string;
  /** Password: typed by the player, or given to the engine (simpler, less secret). */
  password: { typed: true; prompt: string } | { given: string };
  /**
   * Player's guess, asked at the start (flag set by a script) and judged on the final card.
   * `labels` gives the word for each flag value; `{guess}` is replaced in the texts.
   */
  guess?: { flag: Id; labels: Record<string, string>; right: string; wrong: string; none: string };
  /** Params for the `scratch` minigame (the scratch ticket): `ticket` required, `sfx`, `color`… The hidden text comes from the sealed file. */
  scratch?: Record<string, unknown>;
  /** Final card: `accent` = color of the frame and scratched text (default #d4145a). */
  card?: { accent?: string };
}

/** The old name of `EndingDef`. @deprecated since 4.0, removed in 5.0 (docs/en/SUPPORT.md). @public */
export type RevealDef = EndingDef;

/**
 * UI skin: everything the engine shows or plays without the content referencing it.
 * Image ids come from the manifest; sounds are ids from `audio.sfx` (phone, plane, confetti)
 * or `audio.music` (jingle, end). A missing sound = silence.
 * @public
 */
export interface SkinDef {
  icons: {
    /** Column buttons: map, pause, music. */
    map: Id;
    pause: Id;
    music: Id;
    /** Guided tutorial spark. */
    spark?: Id;
    /** Map: pin, "!" for news, vehicles (plane, car) (MapDef.vehicles replaces them where present). */
    pin?: Id;
    news?: Id;
    plane?: Id;
    car?: Id;
    /** Ending confetti (images drawn in alternation). */
    confetti?: Id[];
    /** Final card image when the sealed file has no photo. */
    cardFallback?: Id;
  };
  sounds?: { phone?: Id; plane?: Id; confetti?: Id; jingle?: Id; end?: Id };
  /** CSS font families (--font-ui and --font-pixel variables). Default: 'DotGothic16' and 'Press Start 2P'. `readable`: the "readable font" setting (e.g. a dyslexia-friendly family the game ships). */
  fonts?: { ui?: string; pixel?: string; readable?: string };
  /** Default heights for characters with no `height` (logical units). Default: actor 110, hero 84. */
  heights?: { actor?: number; hero?: number };
  /** Poses tried, in order, for a call's frame (`phone`). Default: phone, front, face, idle. */
  callPoses?: string[];
  /**
   * Pixel-art game (site.json `artStyle: "pixel"`): images scaled up by the browser keep hard edges
   * (`image-rendering: pixelated` on the scene's images) instead of being smoothed. Default off.
   */
  pixelArt?: boolean;
}

/**
 * The whole game as written: verbs, characters, items, rooms, rules, audio, skin, budgets, migrations and texts.
 * @public
 */
export interface GameDef {
  /** Authoring schema. Version 3 requires stable ids and is compiled before use. Omitted means legacy v2 content. */
  schemaVersion?: 2 | 3;
  id: Id;
  title: string;
  /** Language of the content as written (BCP 47, e.g. 'en', 'fr'). Translations: `locales/<lang>.json` (tools/i18n.ts). */
  lang?: string;
  /** Save format version. Bump it if the content changes incompatibly. */
  saveVersion: number;
  /** The painter of every room without its own `renderer` (D10): `dom` (default, the reference) or `canvas`. */
  renderer?: 'dom' | 'canvas';
  hero: Id;
  /**
   * Several playable characters (Day of the Tentacle style). `hero` is the one controlled first. Each has their own
   * room, position and inventory (unless `sharedInventory`); `{ switchPlayer }`, the switch buttons and `{ transfer }`
   * move between them. A character declared as an actor in a room stands for that player there when they are not
   * active; otherwise the engine shows the inactive players standing where they are.
   */
  players?: {
    ids: Id[];
    sharedInventory?: boolean;
    /** Where the others start (default: the start room, nothing in hand). */
    start?: Record<Id, { room: Id; inventory?: Id[] }>;
    /** Line said when an item is handed to another player with no written rule ({objet}, {nom}). Default English. */
    give?: string;
  };
  /** Inventory item that gives hints when talked to. */
  hintItem?: Id;
  /** Character who speaks during hints (often the plush toy, offscreen). */
  hintVoice?: Id;
  verbs: VerbDef[];
  characters: Record<Id, CharacterDef>;
  items: Record<Id, ItemDef>;
  rooms: RoomDef[];
  map?: MapDef;
  rules: GameRules;
  /** Scripts that run everywhere (see ScriptDef). */
  scripts?: ScriptDef[];
  /** Listeners of the game's events, after the room's (see EventRule). */
  events?: EventRule[];
  /** Topics added to every conversation. */
  globalTalk?: { hug?: string; bye?: string; byeLine?: string };
  start: { room: Id; inventory?: Id[]; flags?: Record<Id, Value>; unlocked?: Id[]; intro?: Cmd[] };
  audio?: AudioDef;
  /** UI skin (icons, sounds, fonts, default heights). */
  skin: SkinDef;
  /** Sealed ending, optional. */
  ending?: EndingDef;
  /** Signals from the world outside, through a Reality Bridge (4.1.1, docs/en/REALITY.md). Absent: none, no code loaded. */
  reality?: RealityDef;
  /**
   * Ready-to-use states for testing a specific moment (teleport in dev mode, solver). A checkpoint with `goals` is the
   * end of a chapter: `npm run solve -- --chapters` proves each chapter from the previous checkpoint until its goals hold.
   */
  checkpoints?: Record<
    Id,
    {
      room: Id;
      inventory?: Id[];
      flags?: Record<Id, Value>;
      unlocked?: Id[];
      props?: Record<string, string>;
      /** Where the moving characters are (character → room); the others are in their starting room. */
      where?: Record<Id, Id>;
      /** Conditions that must all hold when the chapter ending here is done (solver `--chapters`). */
      goals?: Cond[];
      /** Several playable characters: who is active, and where the others are. */
      active?: Id;
      players?: Record<Id, { room: Id; inventory?: Id[]; used?: Id[] }>;
      /** Items already used (`used` once/`used` conditions) and topics / listeners / choices already seen (`seen`
       *  keys by id): a checkpoint that the proof by chapters recognises as a reachable boundary state names them. */
      used?: Id[];
      seen?: Record<string, 1>;
    }
  >;
  /** Conditions that must never become true (the solver reports the path that makes one true). */
  invariants?: Cond[];
  /**
   * The player's objectives (4.1.12, ADR 0014): the pause menu's quest journal, the semantic journal's
   * `objectiveCompleted` (once, the first time `done` holds after an action) and the solver's `--goal=100%` (every
   * objective that is not `optional`). Keyed by a stable id; `parent` nests a step under another objective.
   */
  objectives?: Record<Id, ObjectiveDef>;
  /**
   * What may vary between two games of this one (4.1.15 "Remix", ADR 0018): dimensions with finite domains and story
   * values, constraints, modes (`story`, `remix`, `daily`…) with their strategy (D25). Absent: one world, the story.
   */
  remix?: VariationManifest;
  /**
   * The world instance this game is (set by `applyVariant`, never written by an author): what a save, a session and a
   * speedrun envelope (schema 2, since 4.1.16) record so that a load, a replay and a verifier rebuild the same world.
   */
  variant?: WorldVariant;
  /** Speedrun categories, splits and the rules' version (4.1.14, `docs/en/SPEEDRUN.md`). */
  speedrun?: SpeedrunManifest;
  /** Manual save slots (pause menu: save, load, export, import). Absent or 0: autosave only. */
  saves?: { slots: number };
  /**
   * A Settings entry in the pause menu: text speed and size, reduced motion (no shake, instant camera and fades),
   * readable font (`skin.fonts.readable`), music / sound / voice volumes. Kept in the browser, outside the save.
   */
  settings?: boolean;
  /**
   * How the player's taps read (4.2.3). `exitOnTap`: a single tap on an exit with no verb picked walks there and goes
   * through on arrival, as in the LucasArts classics, instead of only walking there (a double tap always went through);
   * a picked verb still wins, a tap elsewhere during the walk still redirects, and an exit's `onTap` overrides it.
   * Default off. Input only: the rules, the solver and saves do not see it.
   */
  input?: { exitOnTap?: boolean };
  /**
   * What the game caches for offline play. `full` (default): after the current room and its neighbours, every image
   * and sound of the game is fetched in the background, in batches, so the whole game plays offline after the first
   * visit (skipped on a "save data" or 2G connection; music waits for better than 3G). `nearby`: only the current
   * room and its neighbours, a room never visited may need the network.
   */
  offline?: 'full' | 'nearby';
  /**
   * How far the hero stands from a character it walks up to (talk, give, look…) when the layout gives no `approach`
   * point: a share of the two characters' mean height, times the depth scale where the character stands. `0.8` suits
   * characters who gesture as they talk (their arms stay clear of each other). Omitted: a fixed 44 units, whatever
   * their size.
   */
  actorGap?: number;
  /** Content lint (`npm run lint`): codes to silence, as `code`, `code:<stable id>` or `code:<room>/<path>`. */
  lint?: { ignore?: string[] };
  /** Translation paths whose text stays the same in every language on purpose (a name, "OK", ▲): every other text
   *  identical to the source is an untranslated line and fails `npm run i18n -- status`. */
  i18n?: { same?: string[] };
  /**
   * Background-preload batch sizes (per step, not totals: `initialImages`, `neighboringRooms`, `audioFiles`), and the
   * weight budgets in KB that `npm run weight` holds the game to: before the first room is playable (`initialKB`), per
   * room (`roomKB`), per chapter (`chapterKB`, every room a player can be in during it). Those three count each track's
   * single mix: what every device needs to play. Since 3.6 the rest is held too: the scores' stems the music director
   * downloads in the background (`backgroundScoreKB`, all of them), everything the full offline warm-up stores
   * (`offlineTotalKB`, app shell included), and the largest score decoded in memory (`decodedAudioMB`, its `pcmBytes`), and the most held at once
   * (`transitionPeakMB`, 3.6.1: a transition's two scores and its bridge, plus the largest stinger). `initialJsKB` (3.9):
   * the gzipped JavaScript a first visit runs before anything is asked for (the entry and its static imports; a
   * minigame, the dev tools and the Studio load on demand), checked on the build by `npm run verify:dist`.
   * The batch sizes never affect the assets required to render the current room.
   */
  assetBudgets?: {
    initialImages?: number;
    neighboringRooms?: number;
    audioFiles?: number;
    initialKB?: number;
    roomKB?: number;
    chapterKB?: number;
    backgroundScoreKB?: number;
    offlineTotalKB?: number;
    decodedAudioMB?: number;
    transitionPeakMB?: number;
    initialJsKB?: number;
  };
  /**
   * How to bring an older save up to date, one step per version, as data: renames and drops. A save whose version has
   * no migration starts a new game (as before). The chain must reach `saveVersion`.
   */
  migrations?: Migration[];
  /** Engine texts (menus, confirmations). The engine never hardcodes any text. */
  ui: UiTexts;
  /** Title screen: background image, logo, music, footer. */
  titleScreen?: {
    decor: Id;
    logo?: Id;
    music?: Id;
    footer?: string;
    /** Silent looping video behind the title (file in public/assets/video/), the backdrop serves as a poster. */
    video?: string;
  };
  /** Credits background: same video as the title by default. */
  creditsScreen?: { video?: string; decor?: Id };
  /** End credits, line by line (an empty line = a blank space). */
  credits?: string[];
}

/**
 * An objective of the game (4.1.12, ADR 0014): its title in the quest journal, the condition that completes it,
 * whether 100% needs it, and the objective it is a step of.
 * @public
 */
export interface ObjectiveDef {
  /** What the quest journal shows (translated under `objectives/<id>.title`). */
  title: string;
  /**
   * Done the first time this holds after an action. A condition that stays true once true (a flag set once, an item
   * kept) reads best: the journal never takes a completed objective back, but a game loaded later sees it open again
   * if its condition no longer holds then.
   */
  done: Cond;
  /** A side objective: not part of 100% (the solver's `--goal=100%`). */
  optional?: boolean;
  /** The objective this one is a step of: the journal shows it under its parent. */
  parent?: Id;
}

/** One step of save migration: from version `from` to `from + 1`. Keys are old ids, values new ones. @public */
export interface Migration {
  from: number;
  renameFlag?: Record<Id, Id>;
  renameItem?: Record<Id, Id>;
  renameRoom?: Record<Id, Id>;
  /** `room.prop` → `room.prop`. */
  renameProp?: Record<string, string>;
  /** `room.actor` → `room.actor`. */
  renameActor?: Record<string, string>;
  renamePlace?: Record<Id, Id>;
  /** Persistent v3 ids. */
  renameCounter?: Record<Id, Id>;
  renameSeen?: Record<Id, Id>;
  renameScript?: Record<Id, Id>;
  /** Script id → old step id → new step id. */
  renameScriptStep?: Record<Id, Record<Id, Id>>;
  renamePlayer?: Record<Id, Id>;
  renameCharacter?: Record<Id, Id>;
  dropFlag?: Id[];
  dropItem?: Id[];
  dropCounter?: Id[];
  dropSeen?: Id[];
  dropScript?: Id[];
}

/** Every text the interface shows (menus, confirmations, settings), so a game speaks its own language. @public */
export interface UiTexts {
  walkTo: string;
  newGame: string;
  continue: string;
  confirmErase: string;
  yes: string;
  no: string;
  pause: string;
  resume: string;
  music: string;
  sfx: string;
  autosave: string;
  credits: string;
  restart: string;
  skip: string;
  rotate: string;
  rotateSub: string;
  mapTitle: string;
  mapLocked?: string;
  mapBack: string;
  world: string;
  zoomIn: string;
  arrival: string;
  pickUp: string;
  hangUp?: string;
  calling: string;
  loading: string;
  on: string;
  off: string;
  giveWhat: string;
  replay: string;
  miniGame: string;
  /** Runner minigame zones. */
  jump?: string;
  duck?: string;
  password?: string;
  /** Footer of the transcript panel ("▼ tap to continue"). */
  tapToContinue: string;
  /** Confirm button (sealed ending password). */
  ok: string;
  // --- manual saves (`GameDef.saves`); English defaults when absent
  save?: string;
  load?: string;
  /** "Slot {n}" ({n} replaced). */
  slot?: string;
  emptySlot?: string;
  exportSave?: string;
  importSave?: string;
  /** The session file (the inputs since the game started: a bug report `npm run replay` reproduces). */
  exportSession?: string;
  confirmOverwrite?: string;
  /** Visible warning when the browser refuses or loses a save write. */
  saveFailed?: string;
  /** The pause menu's "Share session" row (Web Share, else a download): a playtest file for `npm run playtests`. */
  shareSession?: string;
  /** Label of the "tap to continue" marker for screen readers (Space / Enter advance a line). English default. */
  advance?: string;
  /** ARIA label of the verb bar (English default "Verbs"). */
  verbs?: string;
  /** Prefix shown when obsolete references were removed from an otherwise valid save. */
  saveAdjusted?: string;
  /** The pause menu's offline row: its label, the word for a complete cache, the word that invites a retry. English defaults. */
  offlineStatus?: string;
  offlineComplete?: string;
  offlineRetry?: string;
  /** Prompt displayed when a new PWA build is ready. */
  updateAvailable?: string;
  updateNow?: string;
  // --- settings (`GameDef.settings`); English defaults when absent
  settings?: string;
  textSpeed?: string;
  textSize?: string;
  reduceMotion?: string;
  readableFont?: string;
  /** The settings row of the sound captions (shown only in a game that captions a sound). */
  captions?: string;
  volumeMusic?: string;
  volumeSfx?: string;
  volumeVoice?: string;
  /** Language row of the settings menu (when the game ships translations). */
  language?: string;
  /** The pause menu's fingerprint row (4.1.12, ADR 0013): the build a player runs, in four short hashes. English default "Build". */
  fingerprint?: string;
  /** The pause menu's speedrun entry (4.1.14, `GameDef.speedrun`). English default "Speedrun". */
  speedrun?: string;
  /** Downloads the sealed `.wsrun` of the attempt (4.1.14). English default "Export run". */
  exportRun?: string;
  /** Gives up the attempt in progress (4.1.14). English default "Abandon run". */
  abandonRun?: string;
  /** The pause menu's quest journal (4.1.12, `GameDef.objectives`). English default "Objectives". */
  objectives?: string;
  /**
   * Remix (4.1.15): the title's Remix button, its menu (which world: the story, a new one, a typed seed, the daily
   * challenge) and the pause menu's world row (the seed to copy, or "hidden until the end" in a masked mode).
   */
  remix?: string;
  remixTitle?: string;
  remixStory?: string;
  remixRandom?: string;
  remixSeed?: string;
  remixDaily?: string;
  /** The Remix menu's Mystery entry (4.1.17). */
  remixMystery?: string;
  remixPlay?: string;
  remixInvalid?: string;
  remixWorld?: string;
  remixHidden?: string;
  remixCopied?: string;
  remixNoBridge?: string;
  /** The title's question when a link names another world than the saved game's (4.1.15). */
  remixConflict?: string;
  remixKeepSaved?: string;
  remixStartLinked?: string;
  /** Values of text speed / size: slow, normal, fast, large. */
  slow?: string;
  normal?: string;
  fast?: string;
  large?: string;
}
