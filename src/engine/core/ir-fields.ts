// Every field of the content, classified once (4.1.12 "Language", ADR 0013): what the game IS (`logic`, in the IR and
// the fingerprint's `logic`), what it LOOKS and SOUNDS like (`presentation`, in the fingerprint's `presentation`),
// both (`both`: the IR keeps its logic part, the presentation the whole), or tooling only (`meta`: lint, budgets,
// descriptions for the art prompts; in neither). The tables are `Record`s over each type's keys: a field added to the
// content without a class here does not compile, and tests/ir.test.ts reads the bundled games against them.
import type {
  ActorDef,
  CharacterDef,
  ExitDef,
  GameDef,
  HotspotDef,
  ItemDef,
  PropDef,
  RoomDef,
  StageDef,
} from './types';

/** How a field of the content counts for the IR and the fingerprint. */
export type FieldClass = 'logic' | 'presentation' | 'both' | 'meta';

type Classes<T> = { readonly [K in keyof Required<T>]: FieldClass };

const game: Classes<GameDef> = {
  schemaVersion: 'logic',
  id: 'logic',
  title: 'presentation',
  lang: 'meta',
  saveVersion: 'logic',
  renderer: 'presentation',
  hero: 'logic',
  players: 'logic',
  hintItem: 'logic',
  hintVoice: 'logic',
  // Ids and joining words are logic; labels too (said in the sentence line); colours are presentation.
  verbs: 'both',
  characters: 'both',
  items: 'both',
  rooms: 'both',
  // Places (room, region, news) are logic; region images and the vehicles' sprites are presentation.
  map: 'both',
  rules: 'logic',
  scripts: 'logic',
  events: 'logic',
  globalTalk: 'logic',
  start: 'logic',
  audio: 'presentation',
  skin: 'presentation',
  // The sealed ending's file, password and card: what the `{ ending }` command shows, not what the game does.
  ending: 'presentation',
  // Signals and their fallbacks are logic; `bridge` (an address) is deployment and left out of both.
  reality: 'logic',
  checkpoints: 'logic',
  invariants: 'logic',
  saves: 'presentation',
  settings: 'presentation',
  // How a tap reads (`exitOnTap`, #188): the player's input, never what an action does.
  input: 'presentation',
  // Where the hero stands to reach a character: geometry, like the layout's approach points.
  actorGap: 'presentation',
  offline: 'meta',
  lint: 'meta',
  i18n: 'meta',
  assetBudgets: 'meta',
  migrations: 'logic',
  objectives: 'logic',
  // Remix (4.1.15): the manifest is what may vary, the variant what was chosen; both change what the game does.
  remix: 'logic',
  variant: 'logic',
  // Speedrun rules carry their own `rulesVersion` (4.1.14, ADR 0016): a new category never changes the game's logic.
  speedrun: 'meta',
  ui: 'presentation',
  titleScreen: 'presentation',
  creditsScreen: 'presentation',
  credits: 'presentation',
};

const room: Classes<RoomDef> = {
  id: 'logic',
  name: 'logic',
  decor: 'presentation',
  description: 'meta',
  furniture: 'meta',
  music: 'presentation',
  props: 'both',
  actors: 'both',
  hotspots: 'logic',
  exits: 'both',
  look: 'logic',
  on: 'logic',
  talk: 'logic',
  hints: 'logic',
  onEnter: 'logic',
  scripts: 'logic',
  events: 'logic',
  hero: 'logic',
  // Layers, lights, emitters and the transition are presentation; the walk links' conditions are logic.
  stage: 'both',
  renderer: 'presentation',
  anchors: 'logic',
};

const prop: Classes<PropDef> = {
  defaultVerb: 'logic',
  img: 'presentation',
  // State names are logic (`{ prop: [id, state] }`), their images presentation.
  states: 'both',
  // An animation's `at` commands are logic, its frames presentation.
  anims: 'both',
  initial: 'logic',
  name: 'logic',
  kind: 'logic',
  visible: 'logic',
};

const actor: Classes<ActorDef> = {
  defaultVerb: 'logic',
  char: 'logic',
  interactive: 'logic',
  pose: 'presentation',
  facing: 'presentation',
  visible: 'logic',
  name: 'logic',
};

const hotspot: Classes<HotspotDef> = {
  defaultVerb: 'logic',
  name: 'logic',
  kind: 'logic',
  visible: 'logic',
  exit: 'logic',
};

const exit: Classes<ExitDef> = {
  defaultVerb: 'logic',
  name: 'logic',
  to: 'logic',
  entry: 'logic',
  if: 'logic',
  locked: 'logic',
  verbs: 'logic',
  sfx: 'presentation',
  visible: 'logic',
  kind: 'logic',
  oneWay: 'logic',
  // A single tap's meaning (#188): the player's input; the rules generated from the exit are the same.
  onTap: 'presentation',
};

const item: Classes<ItemDef> = { name: 'logic', icon: 'presentation', look: 'logic', kind: 'logic' };

const character: Classes<CharacterDef> = {
  name: 'logic',
  description: 'meta',
  color: 'presentation',
  height: 'presentation',
  sprites: 'presentation',
  portrait: 'presentation',
  kind: 'logic',
  room: 'logic',
  offscreen: 'presentation',
  refuse: 'logic',
  hug: 'logic',
  fps: 'presentation',
  glow: 'presentation',
  mouths: 'presentation',
  palette: 'presentation',
  paletteTolerance: 'presentation',
  variants: 'presentation',
};

const stage: Classes<StageDef> = {
  layers: 'presentation',
  lights: 'presentation',
  emitters: 'presentation',
  transition: 'presentation',
  links: 'logic',
};

/** The classification of every field, by type. */
export const FIELD_CLASSES = { game, room, prop, actor, hotspot, exit, item, character, stage } as const;
