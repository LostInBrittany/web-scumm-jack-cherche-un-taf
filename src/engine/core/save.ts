// zod/mini (3.9): the same checks as zod's classic API, as functions the bundle keeps only when used (the player
// carried ~250 kB of zod for these few schemas).
import * as z from 'zod/mini';
import type { GameDef, GameState, Id } from './types';
import { migrate } from './migrate';
import { splitRoomKey } from './keys';
import { storyWorld, type WorldVariant, WorldVariantSchema } from './remix/story';

const id = z.string().check(z.minLength(1));
const num = () => z.number();
const count = () => z.int().check(z.nonnegative());
const opt = <T extends z.core.SomeType>(t: T) => z.optional(t);
const value = z.union([z.boolean(), num(), z.string()]);
const point = z.tuple([num(), num()]);

/** Runtime schema for every persisted GameState field. Unknown fields are retained for forward-compatible imports. */
const GameStateSchema = z.looseObject({
  v: count(),
  room: id,
  inventory: z.array(id),
  flags: z.record(id, value),
  props: z.record(id, z.string()),
  actors: z.record(
    id,
    z.looseObject({
      x: opt(num()),
      y: opt(num()),
      pose: opt(id),
      facing: opt(z.enum(['left', 'right'])),
      visible: opt(z.boolean()),
    }),
  ),
  hero: z.record(id, point),
  unlocked: z.array(id),
  visited: z.record(id, count()),
  counters: z.record(id, count()),
  seen: z.record(id, z.literal(1)),
  used: opt(z.array(id)),
  where: opt(z.record(id, id)),
  scripts: opt(
    z.record(id, z.looseObject({ pc: count(), step: opt(id), done: opt(z.boolean()), off: opt(z.boolean()) })),
  ),
  camera: opt(z.looseObject({ x: num(), follow: z.boolean() })),
  active: opt(id),
  players: opt(
    z.record(
      id,
      z.looseObject({ room: id, inventory: z.array(id), hero: z.record(id, point), used: opt(z.array(id)) }),
    ),
  ),
  started: num(),
  done: opt(z.boolean()),
  music: opt(z.looseObject({ id, at: num().check(z.nonnegative()) })),
  reality: opt(
    z.strictObject({
      playerId: opt(z.string().check(z.minLength(1), z.maxLength(128))),
      cursor: count(),
      applied: z.record(z.string().check(z.minLength(1)), z.int().check(z.positive())),
    }),
  ),
});

export const SaveEnvelopeV3Schema = z.strictObject({
  // A format identifier from web-scumm, kept so existing saves and files still load (D47).
  format: z.literal('web-scumm-save'),
  schema: z.literal(3),
  gameId: id,
  gameSaveVersion: count(),
  savedAt: num(),
  state: GameStateSchema,
});

/** The save envelope of 4.1.15: the v3 envelope and the world it was played in. */
export const SaveEnvelopeV4Schema = z.strictObject({
  format: z.literal('web-scumm-save'),
  schema: z.literal(4),
  gameId: id,
  gameSaveVersion: count(),
  savedAt: num(),
  state: GameStateSchema,
  variant: WorldVariantSchema,
});

/** A manual slot as stored: what the menu shows, and the envelope (v4 since 4.1.15, v3 still read). v2 slots were `{ meta, state }`. */
export const SlotRecordSchema = z.strictObject({
  meta: z.looseObject({ at: num(), room: id, roomName: z.string(), v: count() }),
  envelope: z.lazy(() => z.union([SaveEnvelopeV4Schema, SaveEnvelopeV3Schema])),
});
export interface SlotRecord {
  meta: SlotMeta;
  envelope: SaveEnvelopeV4 | SaveEnvelopeV3;
}
export interface SlotMeta {
  at: number;
  room: Id;
  roomName: string;
  v: number;
  /** Where it was made, in a build that declares its revision (4.2.2, ADR 0026). */
  revision?: SavedRevision;
}

/** Where a save was made (4.2.2, ADR 0026): its revision and the full fingerprint of the content then. */
export interface SavedRevision {
  rev: number;
  fingerprint: string;
}

/** A save as written until 4.1.14: the state with the format, the schema, the game's id and save version and the date. @public */
export interface SaveEnvelopeV3 {
  format: 'web-scumm-save';
  schema: 3;
  gameId: string;
  gameSaveVersion: number;
  savedAt: number;
  state: GameState;
}

/**
 * A save as written since 4.1.15 (ADR 0018): the v3 envelope and the `WorldVariant` the game was played in, so that a
 * load rebuilds the same world (its assignment, never regenerated with another algorithm version). @public
 */
export interface SaveEnvelopeV4 {
  format: 'web-scumm-save';
  schema: 4;
  gameId: string;
  gameSaveVersion: number;
  savedAt: number;
  state: GameState;
  variant: WorldVariant;
}

/** The world a game is: the one `applyVariant` recorded, else its story world. */
function worldOf(game: GameDef): WorldVariant {
  return game.variant ?? storyWorld(game.remix);
}

/**
 * Wraps a state in the save envelope a store writes (v4: format, schema, game id and save version, date, and the
 * world the game is played in). @public
 */
export function saveEnvelope(game: GameDef, state: GameState, now = Date.now()): SaveEnvelopeV4 {
  return {
    format: 'web-scumm-save',
    schema: 4,
    gameId: game.id,
    gameSaveVersion: game.saveVersion,
    savedAt: now,
    state: structuredClone(state),
    variant: structuredClone(worldOf(game)),
  };
}

/**
 * A v3 envelope as a v4 one (the save migration of 4.1.15): every save made before Remix was played in the story world,
 * so it receives the game's story instance. A v4 envelope is returned as it is. @public
 */
export function upgradeEnvelope(game: GameDef, env: SaveEnvelopeV3 | SaveEnvelopeV4): SaveEnvelopeV4 {
  if (env.schema === 4) return env;
  return { ...env, schema: 4, variant: storyWorld(game.remix) };
}

/**
 * A save made in another world than the game it is loaded into (another seed, another mode): the caller rebuilds the
 * game with `applyVariant(game, error.variant)` and loads again; nothing is regenerated. @public
 */
export class SaveWorldMismatch extends Error {
  constructor(readonly variant: WorldVariant) {
    super(`this save was played in another world (seed ${variant.seed}, mode ${variant.mode}): load it in that world`);
    this.name = 'SaveWorldMismatch';
  }
}

/** The world a raw save names (a v4 envelope, a slot record holding one), or undefined (v3, a raw state). @public */
export function savedWorld(input: unknown): WorldVariant | undefined {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : undefined;
  const env = o && 'envelope' in o ? (o.envelope as Record<string, unknown> | undefined) : o;
  if (!env || env.schema !== 4) return undefined;
  const r = WorldVariantSchema.safeParse(env.variant);
  return r.success ? (r.data as WorldVariant) : undefined;
}

export interface ParseSaveOptions {
  warn?: (message: string) => void;
}

/**
 * Parses an envelope (or a legacy raw state). Structural corruption and references needed to resume (the current room
 * and active player) are rejected. Stale, non-essential content references are pruned so an ordinary content update
 * does not destroy Continue; the caller receives one warning listing what changed.
 * @public
 */
export function parseSave(game: GameDef, input: unknown, opts: ParseSaveOptions = {}): GameState {
  let raw: unknown = input;
  if (input && typeof input === 'object' && 'format' in input) {
    const env =
      (input as { schema?: unknown }).schema === 4
        ? SaveEnvelopeV4Schema.parse(input)
        : SaveEnvelopeV3Schema.parse(input);
    if (env.gameId !== game.id) throw new Error(`save belongs to game "${env.gameId}", not "${game.id}"`);
    if (env.gameSaveVersion !== env.state.v) throw new Error('save envelope and state versions disagree');
    // The world (4.1.15): a story save loads into the story world whatever the manifest's hash; any other into the very
    // world it names (its hash), else the caller rebuilds that world first.
    if (env.schema === 4) {
      const saved = env.variant as WorldVariant;
      const here = game.variant;
      const bothStory = saved.mode === 'story' && (!here || here.mode === 'story');
      if (!bothStory && saved.hash !== here?.hash) throw new SaveWorldMismatch(saved);
    } else if (game.variant && game.variant.mode !== 'story')
      // A v3 save was played in the story world (the migration of 4.1.15).
      throw new SaveWorldMismatch(upgradeEnvelope(game, env).variant);
    raw = env.state;
  }
  const parsed = GameStateSchema.parse(raw) as GameState;
  const state = migrate(game, parsed);
  if (!state) throw new Error(`save version ${parsed.v} cannot be migrated to ${game.saveVersion}`);
  const rooms = new Map(game.rooms.map((r) => [r.id, r]));
  const players = new Set(game.players?.ids ?? [game.hero]);
  const stale: string[] = [];
  const drop = (where: string, id: Id) => stale.push(`${where} "${id}"`);
  const knownItems = (xs: Id[], where: string) => xs.filter((x) => (game.items[x] ? true : (drop(where, x), false)));
  const pruneKeys = <T>(record: Record<Id, T>, keep: (id: Id, value: T) => boolean, where: string) => {
    for (const [id, value] of Object.entries(record))
      if (!keep(id, value)) {
        delete record[id];
        drop(where, id);
      }
  };
  if (!rooms.has(state.room)) throw new Error(`state.room: unknown current room "${state.room}"`);
  if (state.active && !players.has(state.active))
    throw new Error(`state.active: unknown active player "${state.active}"`);
  state.inventory = knownItems(state.inventory, 'state.inventory');
  if (state.used) state.used = knownItems(state.used, 'state.used');
  state.unlocked = state.unlocked.filter((x) => (game.map?.places[x] ? true : (drop('state.unlocked', x), false)));
  pruneKeys(state.hero, (id) => rooms.has(id), 'state.hero');
  pruneKeys(state.visited, (id) => rooms.has(id), 'state.visited');
  for (const [actor, at] of Object.entries(state.where ?? {})) {
    const character = game.characters[actor];
    if (!character) {
      delete state.where![actor];
      drop('state.where character', actor);
      continue;
    }
    if (!rooms.has(at)) {
      const home = character.room;
      if (home && rooms.has(home)) state.where![actor] = home;
      else delete state.where![actor];
      drop('state.where room', at);
    }
  }
  for (const [pid, p] of Object.entries(state.players ?? {})) {
    if (!players.has(pid)) {
      delete state.players![pid];
      drop('state.players', pid);
      continue;
    }
    if (!rooms.has(p.room)) {
      const start = game.players?.start?.[pid]?.room ?? game.start.room;
      if (!rooms.has(start)) {
        delete state.players![pid];
        drop(`state.players.${pid}.room`, p.room);
        continue;
      }
      drop(`state.players.${pid}.room`, p.room);
      p.room = start;
    }
    p.inventory = knownItems(p.inventory, `state.players.${pid}.inventory`);
    if (p.used) p.used = knownItems(p.used, `state.players.${pid}.used`);
    pruneKeys(p.hero, (id) => rooms.has(id), `state.players.${pid}.hero`);
  }
  for (const [key, propState] of Object.entries(state.props)) {
    const parts = splitRoomKey(key);
    const p = parts ? rooms.get(parts[0])?.props?.[parts[1]] : undefined;
    if (!p || !p.states || !p.states[propState]) {
      delete state.props[key];
      drop('state.props', key);
    }
  }
  for (const key of Object.keys(state.actors)) {
    const parts = splitRoomKey(key);
    const r = parts ? rooms.get(parts[0]) : undefined;
    if (!parts || (!r?.actors?.[parts[1]] && !r?.props?.[parts[1]])) {
      delete state.actors[key];
      drop('state.actors', key);
    }
  }
  const scripts = new Map(
    [...(game.scripts ?? []), ...game.rooms.flatMap((r) => r.scripts ?? [])].map((s) => [s.id, s]),
  );
  for (const [sid, st] of Object.entries(state.scripts ?? {})) {
    const def = scripts.get(sid);
    if (!def || (st.step && def.stepIds && !def.stepIds.includes(st.step)) || (!st.step && st.pc > def.do.length)) {
      delete state.scripts![sid];
      drop('state.scripts', sid);
    }
  }
  if (stale.length) (opts.warn ?? console.warn)(`save adjusted after a content update: ${stale.join(', ')}`);
  return state;
}

/** Reads a stored slot (v3 record, or a v2 `{ meta, state }`), validating the state like `parseSave`. */
export function parseSlot(
  game: GameDef,
  input: unknown,
  opts: ParseSaveOptions = {},
): { meta: SlotMeta; state: GameState } {
  if (!input || typeof input !== 'object' || !('meta' in input)) throw new Error('not a save slot');
  const raw = input as { meta: SlotMeta; envelope?: unknown; state?: unknown };
  const state = parseSave(game, raw.envelope ?? raw.state, opts);
  const meta: SlotMeta = {
    at: Number(raw.meta?.at) || 0,
    room: state.room,
    roomName: String(raw.meta?.roomName ?? state.room),
    v: state.v,
  };
  // Kept as stored: dom/revision.ts reads it only when well formed (the player's first visit carries no check).
  if (raw.meta?.revision) meta.revision = raw.meta.revision;
  return { meta, state };
}
