// The game's intermediate representation (4.1.12 "Language", ADR 0013): the logic of a compiled game as plain,
// serialisable data, the same for the same game (`canonicalJson` of two compilations is equal). It is a projection of
// `CompiledGame` (the runtime, the solver and the replay keep reading `CompiledGame`; ADR 0013 says why): what the
// fingerprint's `logic` hashes, what the Studio's IR view and forms, the generated DSL page and the tests read. Which
// field is logic is said once, in core/ir-fields.ts. Pure: no file is read here; the tools hand the sources in for the
// provenance (`provenanceOf`).
import { FIELD_CLASSES, type FieldClass } from './ir-fields';
import { sourceKeys, type SourceKey } from './source-keys';
import type {
  Cmd,
  Cond,
  EventRule,
  GameDef,
  HintDef,
  Id,
  KindRule,
  ListLine,
  Migration,
  Point,
  RealityDef,
  Rule,
  VerbId,
} from './types';
import type { CompiledGame } from './define';
import type { AnchorDef, VariationManifest } from './remix/manifest';
import type { WorldVariant } from './remix/compile';

/** The IR's schema: 1 since 4.1.12. A field added is additive; a field's meaning never changes within a schema. */
export const IR_SCHEMA_VERSION = 1;

/** Where an id is written: a file relative to the working directory, and its line (from 1). @public */
export interface IrSource {
  file: string;
  line: number;
}

/** A room as logic: its name, looks, hints, exits and the conditions of its walk links; its entities by key. @public */
export interface IrRoom {
  id: Id;
  name: string;
  /** False for a room without the hero (a pure cutscene). */
  hero?: boolean;
  look: Readonly<Record<Id, string | ListLine[]>>;
  hints: readonly HintDef[];
  exits: readonly {
    id: Id;
    name: string;
    to: Id;
    entry?: Id | Point;
    if?: Cond;
    locked?: string;
    verbs?: VerbId[];
    visible?: Cond;
    kind?: string[];
    oneWay?: boolean;
    defaultVerb?: VerbId;
  }[];
  /** The stage's walk links (`stage.links`): a link whose `if` does not hold cannot be walked. */
  walkLinks: readonly { id: Id; if?: Cond; locked?: string }[];
  /** The keys of its props, actors and hotspots (`<room>.<id>`), in content order. */
  entities: readonly string[];
  /** Its tagged spots where Remix may place an item (4.1.15, `RoomDef.anchors`). */
  anchors?: Readonly<Record<Id, AnchorDef>>;
}

/** A thing of the game: a prop, an actor or a hotspot of a room, an item, a character. @public */
export interface IrEntity {
  /** `<room>.<id>` for what stands in a room, `item:<id>`, `char:<id>`. */
  key: string;
  kind: 'prop' | 'actor' | 'hotspot' | 'item' | 'character';
  id: Id;
  room?: Id;
  name?: string;
  kinds?: readonly string[];
  visible?: Cond;
  defaultVerb?: VerbId;
  /** A prop's state names and its first one; an animation's `at` commands by frame. */
  states?: readonly string[];
  initial?: string;
  anims?: Readonly<Record<string, Readonly<Record<string, Cmd[]>>>>;
  /** An actor's character, and whether it can be acted on. */
  char?: Id;
  interactive?: boolean;
  /** Generated from a declared exit. */
  exit?: boolean;
  /** An item's look lines. */
  look?: string | ListLine[];
  /** A character's starting room, its refusal and hug lines. */
  home?: Id;
  refuse?: string;
  hug?: string;
}

/** A reaction of the game: a written rule, a topic, a listener, a reaction by kind or a verb's fallback lines. @public */
export type IrRule =
  | {
      kind: 'rule';
      id: string;
      /** The room, or `game` for a rule valid everywhere. */
      scope: Id;
      verb: VerbId[];
      a: Id[];
      b?: Id[];
      if?: Cond;
      do: Cmd[];
      /** Generated from this declared exit (core/define.ts `normalizeExits`). */
      exit?: Id;
    }
  | { kind: 'topic'; id: string; room: Id; actor: Id; topic: string; if?: Cond; do: Cmd[] }
  | { kind: 'listener'; id: string; scope: Id; on: Id; if?: Cond; once?: boolean; do: Cmd[] }
  | { kind: 'reaction'; id: string; verb: VerbId[]; of?: string; target?: Id; item?: Id[]; say: string }
  | { kind: 'fallback'; id: string; verb: string; lines: ListLine[] };

/** A sequence of commands that runs without a player's action: a world script, a room's arrival, the intro. @public */
export interface IrScript {
  id: Id;
  /** The room, or `game`. */
  scope: Id;
  trigger: 'world' | 'enter' | 'intro';
  while?: Cond;
  loop?: boolean;
  do: Cmd[];
  stepIds?: Id[];
}

/** An objective (ADR 0014): its title, the condition that completes it, whether 100% needs it, its parent. @public */
export interface IrObjective {
  id: Id;
  title: string;
  done: Cond;
  optional: boolean;
  parent?: Id;
}

/** What the game declares of the world outside, its Bridge's address left out (deployment, not logic). @public */
export type IrRealityPolicies = Omit<RealityDef, 'bridge'>;

/** The trusted code a game names (ADR 0002): custom commands with their declared effects, minigames, plugins. @public */
export interface IrExtensions {
  /** SHA-256 of the extension sources (`hashSources`), '' when not given: the fingerprint's `trustedExtensions`. */
  trusted: string;
  commands: readonly { name: string; pure?: boolean; effects?: Cmd[] }[];
  minigames: readonly string[];
  plugins: readonly string[];
}

/**
 * A world variant of the story (4.1.15 "Remix", ADR 0018): filled when the game was compiled from an instance
 * (`applyVariant`): `id` is the variant's hash, `manifest` the game's `VariationManifest`, `variant` the instance.
 * @public
 */
export interface IrVariantSlot {
  mode: 'variant';
  id: Id;
  manifest: Readonly<Record<string, unknown>>;
  variant?: WorldVariant;
}

/** The game's world: its hero and players, verbs, start, map, checkpoints, invariants, saves. @public */
export interface IrWorld {
  schemaVersion?: 2 | 3;
  saveVersion: number;
  hero: Id;
  players?: GameDef['players'];
  hintItem?: Id;
  hintVoice?: Id;
  verbs: readonly { id: VerbId; label: string; join?: string }[];
  globalTalk?: GameDef['globalTalk'];
  start: GameDef['start'];
  map?: {
    start: Id;
    regions: readonly { id: Id; name: string; parent?: Id }[];
    places: readonly { id: Id; name: string; room: Id; region: Id; news?: Cond }[];
  };
  checkpoints: NonNullable<GameDef['checkpoints']>;
  invariants: readonly Cond[];
  migrations: readonly Migration[];
  /** What may vary between two games of this one (4.1.15, `GameDef.remix`): `compileVariant(ir, ir.world.remix, seed)`. */
  remix?: VariationManifest;
}

/**
 * The intermediate representation of a game (schema 1): its logic as plain data, the provenance of its ids, the
 * trusted extensions by name, and the slot 4.1.15 fills.
 * @public
 */
export interface GameIR {
  schema: typeof IR_SCHEMA_VERSION;
  /** The engine that compiled it (not part of `logic`: the fingerprint's `engine` says it). */
  engine: string;
  gameId: Id;
  world: IrWorld;
  rooms: readonly IrRoom[];
  entities: readonly IrEntity[];
  rules: readonly IrRule[];
  scripts: readonly IrScript[];
  objectives: readonly IrObjective[];
  reality: IrRealityPolicies;
  extensions: IrExtensions;
  variant: { mode: 'story' } | IrVariantSlot;
  /** Where each id is written, when the sources were given (an id written by code, not literally, has none). */
  provenance: Readonly<Record<string, IrSource>>;
}

/**
 * What `compileIR` is told of the trusted code: its hash (`hashSources` over the extension files, given by the build or
 * a tool; '' when unknown), the custom commands (their declared `effects` are logic; their code is not read),
 * the game's own minigames and plugins by name.
 * @public
 */
export interface ExtensionHashes {
  trusted: string;
  commands?: Readonly<Record<string, { pure?: boolean; effects?: Cmd[] }>>;
  minigames?: readonly string[];
  plugins?: readonly string[];
}

/** Options of `compileIR`: the extensions, the engine's version, and the sources for the provenance. @public */
export interface CompileIROptions {
  extensions: ExtensionHashes;
  /** The engine's version, recorded in `engine` (default 'unknown'). */
  engine?: string;
  /** The game's source files (path → text): fills `provenance` (`provenanceOf`). */
  sources?: Readonly<Record<string, string>>;
}

const list = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? [...x] : [x]);
/** A copy without the keys whose value is undefined: the IR never carries `undefined` (canonicalJson drops it anyway). */
function defined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
/** The fields of `o` its table classes as logic (or both). */
function logicFields<T extends object>(o: T, table: Readonly<Record<string, FieldClass>>): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([k, v]) => v !== undefined && (table[k] === 'logic' || table[k] === 'both')),
  ) as Partial<T>;
}

/**
 * A value of the IR without its choices' card images (`Choice.img`, presentation in core/ir-fields.ts): a portrait
 * changed on a choice moves no logic. The same value (not a copy) when nothing in it has one.
 */
function withoutChoiceImages<T>(x: T): T {
  if (Array.isArray(x)) {
    const out = x.map(withoutChoiceImages);
    return out.some((v, i) => v !== x[i]) ? (out as T) : x;
  }
  if (!x || typeof x !== 'object') return x;
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x)) {
    let nv = withoutChoiceImages(v);
    if (k === 'choice' && Array.isArray(nv))
      nv = nv.map((o: unknown) => {
        if (!o || typeof o !== 'object' || !('img' in o)) return o;
        const { img: _img, ...rest } = o as Record<string, unknown>;
        return rest;
      });
    if (nv !== v && !(Array.isArray(nv) && Array.isArray(v) && nv.every((e, i) => e === v[i]))) changed = true;
    out[k] = nv;
  }
  return changed ? (out as T) : x;
}

/**
 * The IR of a compiled game (ADR 0013): pure and deterministic. Rules without an id (v2 content) are named by their
 * position, as the puzzle graph names them.
 * @public
 */
export function compileIR(game: CompiledGame, o: CompileIROptions): GameIR {
  const rooms: IrRoom[] = [];
  const entities: IrEntity[] = [];
  const rules: IrRule[] = [];
  const scripts: IrScript[] = [];
  const ruleOf = (scope: Id, r: Rule, i: number): IrRule =>
    defined({
      kind: 'rule' as const,
      id: r.id ?? `${scope}/on[${i}]`,
      scope,
      verb: list(r.verb),
      a: list(r.a),
      b: r.b === undefined ? undefined : list(r.b),
      if: r.if,
      do: r.do,
      exit: r.exit,
    });
  const listenerOf = (scope: Id, e: EventRule, i: number): IrRule =>
    defined({
      kind: 'listener' as const,
      id: e.id ?? `${scope}/events[${i}]`,
      scope,
      on: e.on,
      if: e.if,
      once: e.once,
      do: e.do,
    });

  for (const r of game.rooms) {
    const keys: string[] = [];
    for (const [id, p] of Object.entries(r.props ?? {})) {
      const key = `${r.id}.${id}`;
      keys.push(key);
      const anims = Object.entries(p.anims ?? {}).filter(([, a]) => a.at && Object.keys(a.at).length);
      entities.push(
        defined({
          key,
          kind: 'prop' as const,
          id,
          room: r.id,
          name: p.name,
          kinds: p.kind,
          visible: p.visible,
          defaultVerb: p.defaultVerb,
          initial: p.initial,
          states: p.states ? Object.keys(p.states) : undefined,
          anims: anims.length
            ? Object.fromEntries(anims.map(([n, a]) => [n, a.at as Record<string, Cmd[]>]))
            : undefined,
        }),
      );
    }
    for (const [id, a] of Object.entries(r.actors ?? {})) {
      const key = `${r.id}.${id}`;
      keys.push(key);
      entities.push(
        defined({
          key,
          kind: 'actor' as const,
          id,
          room: r.id,
          char: a.char,
          name: a.name,
          interactive: a.interactive,
          visible: a.visible,
          defaultVerb: a.defaultVerb,
        }),
      );
    }
    for (const [id, h] of Object.entries(r.hotspots ?? {})) {
      const key = `${r.id}.${id}`;
      keys.push(key);
      entities.push(
        defined({
          key,
          kind: 'hotspot' as const,
          id,
          room: r.id,
          name: h.name,
          kinds: h.kind,
          visible: h.visible,
          defaultVerb: h.defaultVerb,
          exit: h.exit,
        }),
      );
    }
    rooms.push(
      defined({
        id: r.id,
        name: r.name,
        hero: r.hero,
        look: r.look ?? {},
        hints: r.hints ?? [],
        exits: Object.entries(r.exits ?? {}).map(([id, x]) =>
          defined({ id, ...(logicFields(x, FIELD_CLASSES.exit) as Omit<typeof x, 'sfx' | 'onTap'>) }),
        ),
        walkLinks: Object.entries(r.stage?.links ?? {}).map(([id, l]) => defined({ id, if: l.if, locked: l.locked })),
        entities: keys,
        anchors: r.anchors,
      }),
    );
    (r.on ?? []).forEach((x, i) => rules.push(ruleOf(r.id, x, i)));
    for (const [actor, topics] of Object.entries(r.talk ?? {}))
      topics.forEach((t, i) =>
        rules.push(
          defined({
            kind: 'topic' as const,
            id: t.id ?? `${r.id}/${actor}[${i}]`,
            room: r.id,
            actor,
            topic: t.topic,
            if: t.if,
            do: t.do,
          }),
        ),
      );
    (r.events ?? []).forEach((e, i) => rules.push(listenerOf(r.id, e, i)));
    if (r.onEnter) scripts.push({ id: `${r.id}.enter`, scope: r.id, trigger: 'enter', do: r.onEnter });
    for (const s of r.scripts ?? [])
      scripts.push(
        defined({
          id: s.id,
          scope: r.id,
          trigger: 'world' as const,
          while: s.while,
          loop: s.loop,
          do: s.do,
          stepIds: s.stepIds,
        }),
      );
  }
  (game.rules.on ?? []).forEach((x, i) => rules.push(ruleOf('game', x, i)));
  (game.events ?? []).forEach((e, i) => rules.push(listenerOf('game', e, i)));
  (game.rules.kinds ?? []).forEach((k: KindRule, i) =>
    rules.push(
      defined({
        kind: 'reaction' as const,
        id: k.id ?? `rules/kinds[${i}]`,
        verb: list(k.verb),
        of: k.kind,
        target: k.target,
        item: k.item === undefined ? undefined : list(k.item),
        say: k.say,
      }),
    ),
  );
  for (const [verb, lines] of Object.entries(game.rules.fallbacks))
    if (lines) rules.push({ kind: 'fallback', id: `fallback.${verb}`, verb, lines });
  for (const s of game.scripts ?? [])
    scripts.push(
      defined({
        id: s.id,
        scope: 'game',
        trigger: 'world' as const,
        while: s.while,
        loop: s.loop,
        do: s.do,
        stepIds: s.stepIds,
      }),
    );
  if (game.start.intro) scripts.push({ id: 'game.intro', scope: 'game', trigger: 'intro', do: game.start.intro });

  for (const [id, it] of Object.entries(game.items))
    entities.push(
      defined({ key: `item:${id}`, kind: 'item' as const, id, name: it.name, kinds: it.kind, look: it.look }),
    );
  for (const [id, c] of Object.entries(game.characters))
    entities.push(
      defined({
        key: `char:${id}`,
        kind: 'character' as const,
        id,
        name: c.name,
        kinds: c.kind,
        home: c.room,
        refuse: c.refuse,
        hug: c.hug,
      }),
    );

  const { bridge: _bridge, ...reality } = game.reality ?? { signals: [] };
  const world: IrWorld = defined({
    schemaVersion: game.schemaVersion,
    saveVersion: game.saveVersion,
    hero: game.hero,
    players: game.players,
    hintItem: game.hintItem,
    hintVoice: game.hintVoice,
    verbs: game.verbs.map((v) => defined({ id: v.id, label: v.label, join: v.join })),
    globalTalk: game.globalTalk,
    start: game.start,
    map: game.map
      ? {
          start: game.map.start,
          regions: Object.entries(game.map.regions).map(([id, r]) => defined({ id, name: r.name, parent: r.parent })),
          places: Object.entries(game.map.places).map(([id, p]) =>
            defined({ id, name: p.name, room: p.room, region: p.region, news: p.news }),
          ),
        }
      : undefined,
    checkpoints: game.checkpoints ?? {},
    invariants: game.invariants ?? [],
    migrations: game.migrations ?? [],
    remix: game.remix,
  });
  const ext = o.extensions;
  const ir: GameIR = {
    schema: IR_SCHEMA_VERSION,
    engine: o.engine ?? 'unknown',
    gameId: game.id,
    world: withoutChoiceImages(world),
    rooms,
    entities: withoutChoiceImages(entities),
    rules: withoutChoiceImages(rules),
    scripts: withoutChoiceImages(scripts),
    objectives: Object.entries(game.objectives ?? {}).map(([id, x]) =>
      defined({ id, title: x.title, done: x.done, optional: !!x.optional, parent: x.parent }),
    ),
    reality,
    extensions: {
      trusted: ext.trusted,
      commands: Object.entries(ext.commands ?? {})
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([name, c]) => defined({ name, pure: c.pure, effects: withoutChoiceImages(c.effects) })),
      minigames: [...(ext.minigames ?? [])].sort(),
      plugins: [...(ext.plugins ?? [])].sort(),
    },
    variant: game.variant
      ? {
          mode: 'variant',
          id: game.variant.hash,
          manifest: (game.remix ?? {}) as unknown as Record<string, unknown>,
          variant: game.variant,
        }
      : { mode: 'story' },
    provenance: {},
  };
  if (o.sources) ir.provenance = provenanceOf(ir, o.sources);
  return ir;
}

/**
 * The part of the IR the fingerprint's `logic` hashes: everything but the engine's version, the provenance (a line
 * added above a rule moves no logic) and the extensions' hash (the fingerprint's `trustedExtensions`).
 * @public
 */
export function logicView(ir: GameIR): Omit<GameIR, 'engine' | 'provenance'> {
  const { engine: _e, provenance: _p, extensions, ...rest } = ir;
  const { trusted: _t, ...named } = extensions;
  return { ...rest, extensions: { ...named, trusted: '' } };
}

/**
 * Where each id of the IR is written in the sources (path → text), read from their object-literal keys
 * (core/source-keys.ts: strings and comments skipped, each key with the key or variable that owns its object):
 * `id: '<id>'` for rooms, rules, topics, listeners and scripts; the key itself under `items`, `characters`,
 * `objectives` and `checkpoints`, and, inside the room's own file, under its `props`, `actors`, `hotspots` and
 * `exits` (a declared exit gives its line to the hotspot and the rules generated from it). An id not found has no
 * entry (written by code, not literally): never a guessed line. Files are read in path order.
 * @public
 */
export function provenanceOf(ir: GameIR, sources: Readonly<Record<string, string>>): Record<string, IrSource> {
  const files = Object.keys(sources).sort();
  const keys = new Map(files.map((f) => [f, sourceKeys(sources[f]!)]));
  const out: Record<string, IrSource> = {};
  const first = (pick: (k: SourceKey) => boolean, only?: string): IrSource | undefined => {
    for (const file of only ? [only] : files) {
      const hit = (keys.get(file) ?? []).find(pick);
      if (hit) return { file, line: hit.line };
    }
    return undefined;
  };
  const byId = (id: string) => first((k) => k.key === 'id' && k.value === id);
  const under = (parents: readonly string[], key: string, only?: string) =>
    first((k) => k.key === key && parents.includes(k.parent ?? ''), only);
  const put = (id: string, at: IrSource | undefined) => {
    if (at && !(id in out)) out[id] = at;
  };
  for (const r of ir.rooms) put(r.id, byId(r.id));
  const roomFile = (room: string | undefined) => (room ? out[room]?.file : undefined);
  for (const r of ir.rules)
    if (r.kind === 'rule' && r.exit) {
      // Generated from a declared exit: where the exit is written.
      const file = roomFile(r.scope);
      if (file) put(r.id, under(['exits'], r.exit, file));
    } else if (r.kind !== 'fallback') put(r.id, byId(r.id));
  for (const s of ir.scripts) if (s.trigger === 'world') put(s.id, byId(s.id));
  for (const e of ir.entities) {
    if (e.kind === 'item') put(e.key, under(['items'], e.id));
    else if (e.kind === 'character') put(e.key, under(['characters'], e.id));
    else {
      const file = roomFile(e.room);
      if (file) put(e.key, under(e.exit ? ['exits', 'hotspots'] : ['props', 'actors', 'hotspots'], e.id, file));
    }
  }
  for (const x of ir.objectives) put(`objective:${x.id}`, under(['objectives'], x.id));
  for (const id of Object.keys(ir.world.checkpoints)) put(`checkpoint:${id}`, under(['checkpoints'], id));
  return out;
}
