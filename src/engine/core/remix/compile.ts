// Compiling a world (4.1.15 "Remix", ADR 0018): `GameIR + VariationManifest + seed + algorithmVersion → WorldVariant`,
// immutable, integers and xoshiro only so that every runtime computes the same (tested in Node; the cross-runtime
// check `scripts/e2e-remix.mjs` is written, not yet run on Chromium, WebKit and Firefox). The manifest is compiled first (domains, constraints,
// anchors that cannot hold the item removed): an impossible dependency is an error at build time (`validate`,
// `verify:variants`), never in a player's game. A malformed seed or an unknown algorithm version is an explicit error,
// never a silent fallback to another world. Draws come from core/prng.ts only (one stream per dimension, `logic` for
// the logical dimensions and `cosmetic` for presentation, D27); `Math` is not used in this folder (biome.json).
import { canonicalJson } from '../canonical';
import { condFlags } from '../cond';
import { eachCmd } from '../cmds';
import { derive, type Prng } from '../prng';
import type { Cmd, Id } from '../types';
import {
  type AnchorDef,
  REMIX_ALGORITHM,
  REMIX_ALGORITHM_VERSION,
  type VariationDimension,
  type VariationManifest,
  type VariationMode,
} from './manifest';
import { normalizeSeed, RemixSeedError, STORY_SEED } from './seed-code';
import { sha256HexSync } from './sha256';
import { EMPTY_MANIFEST, variantHash, type WorldVariant, WorldVariantSchema } from './story';

/** The largest catalogue a mode may enumerate (D25): beyond it, the mode is a generator with a published sample. @public */
export const CATALOGUE_MAX = 10_000;

export type { WorldVariant } from './story';

export { WorldVariantSchema } from './story';

/** A manifest that cannot produce a world: a build error, with every reason. @public */
export class RemixManifestError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`the variation manifest cannot be compiled:\n- ${problems.join('\n- ')}`);
    this.name = 'RemixManifestError';
  }
}

/** What the compiler reads of the game: its rooms' anchors and its rules (a `GameIR` is one). @public */
export interface RemixWorld {
  rooms: readonly { id: Id; anchors?: Readonly<Record<Id, AnchorDef>> }[];
  rules: readonly { id: string; kind: string; do?: Cmd[] }[];
}

/** A dimension compiled: its finite domain in a fixed order, and its story value. */
interface CompiledDimension {
  dim: VariationDimension;
  domain: readonly unknown[];
  story: unknown;
}

/** A manifest compiled once: its hash, its dimensions with their domains, its modes. @public */
export interface CompiledManifest {
  manifest: VariationManifest;
  hash: string;
  dims: ReadonlyMap<string, CompiledDimension>;
  /** The manifest's order: generation assigns in this order. */
  order: readonly string[];
  anchors: ReadonlyMap<string, AnchorDef>;
  modes: ReadonlyMap<string, VariationMode>;
}

const key = (v: unknown) => canonicalJson(v);
const anchorKey = (room: Id, anchor: Id) => `${room}.${anchor}`;

/** Every order of `groups` that keeps each edge `[a, b]` (a before b), in lexicographic order of positions. */
export function linearExtensions(groups: readonly Id[], graph: readonly (readonly [Id, Id])[]): Id[][] {
  const out: Id[][] = [];
  const walk = (prefix: Id[], rest: Id[]) => {
    if (!rest.length) {
      out.push(prefix);
      return;
    }
    for (const g of rest)
      if (!graph.some(([a, b]) => b === g && rest.includes(a)))
        walk(
          [...prefix, g],
          rest.filter((x) => x !== g),
        );
  };
  walk([], [...groups]);
  return out;
}

/** The finite domain of a dimension, in the order the catalogue enumerates. */
function domainOf(d: VariationDimension): unknown[] {
  switch (d.kind) {
    case 'item-placement':
      return d.anchors.map((a) => anchorKey(a.room, a.anchor));
    case 'actor-start':
      return [...d.rooms];
    case 'actor-route':
      return [...d.routes];
    case 'coupled':
      return d.pairs.map((_, i) => i);
    case 'puzzle-order':
      return linearExtensions(d.groups, d.graph);
    case 'presentation':
      return d.values.map((_, i) => i);
  }
}

function storyOf(d: VariationDimension): unknown {
  switch (d.kind) {
    case 'item-placement':
      return anchorKey(d.story.room, d.story.anchor);
    case 'puzzle-order':
      return [...d.story];
    default:
      return d.story;
  }
}

/** The flags a rule sets (`set`, at any depth of its commands). */
function flagsSetBy(list: Cmd[] | undefined): Set<string> {
  const out = new Set<string>();
  eachCmd(list, (c) => {
    if (c && typeof c === 'object' && 'set' in c) {
      const s = (c as { set: unknown }).set;
      if (typeof s === 'string') out.add(s);
      else if (Array.isArray(s) && typeof s[0] === 'string') out.add(s[0]);
    }
  });
  return out;
}

/**
 * Compiles a manifest against the game's world: every reason it cannot produce a world is collected and thrown
 * together (`RemixManifestError`). Anchors behind an action that needs their item (`not-behind`) leave the domain.
 * @public
 */
export function compileManifest(manifest: VariationManifest, world: RemixWorld): CompiledManifest {
  const problems: string[] = [];
  const anchors = new Map<string, AnchorDef>();
  for (const r of world.rooms)
    for (const [a, def] of Object.entries(r.anchors ?? {})) anchors.set(anchorKey(r.id, a), def);
  const dims = new Map<string, CompiledDimension>();
  for (const d of manifest.dimensions) {
    if (dims.has(d.id)) problems.push(`dimension "${d.id}" is declared twice`);
    let domain = domainOf(d);
    if (d.kind === 'item-placement') {
      for (const a of d.anchors) {
        const k = anchorKey(a.room, a.anchor);
        const def = anchors.get(k);
        if (!def) problems.push(`${d.id}: unknown anchor "${k}" (declare it in the room's anchors)`);
        else if (needsItem(def.reachableBy, d.item))
          problems.push(`${d.id}: anchor "${k}" is reached only with "${d.item}", the item placed there`);
      }
      for (const c of manifest.constraints)
        if (c.kind === 'not-behind' && c.item === d.item) {
          const rule = world.rules.find((r) => r.id === c.action);
          if (!rule) {
            problems.push(`not-behind: unknown rule "${c.action}"`);
            continue;
          }
          const behind = flagsSetBy(rule.do);
          domain = domain.filter(
            (k) => ![...condFlags(anchors.get(k as string)?.reachableBy)].some((f) => behind.has(f)),
          );
        }
    }
    if (d.kind === 'puzzle-order') {
      for (const [a, b] of d.graph)
        if (!d.groups.includes(a) || !d.groups.includes(b))
          problems.push(`${d.id}: the edge ${a} → ${b} names an unknown group`);
      if (new Set(d.groups).size !== d.groups.length) problems.push(`${d.id}: a group is listed twice`);
    }
    if (d.kind === 'coupled') {
      const answers = d.pairs.map((p) => p.answer);
      if (new Set(answers).size !== answers.length)
        problems.push(`${d.id}: two pairs share an answer (a hint would point at two)`);
    }
    if (!domain.length) problems.push(`${d.id}: its domain is empty`);
    const story = storyOf(d);
    if (!domain.some((v) => key(v) === key(story)))
      problems.push(`${d.id}: its story value ${key(story)} is not in its domain`);
    dims.set(d.id, { dim: d, domain, story });
  }
  const modes = new Map<string, VariationMode>();
  for (const m of manifest.modes) {
    if (modes.has(m.id)) problems.push(`mode "${m.id}" is declared twice`);
    for (const id of m.dimensions) if (!dims.has(id)) problems.push(`mode ${m.id}: unknown dimension "${id}"`);
    modes.set(m.id, m);
  }
  for (const c of manifest.constraints) {
    if (c.kind === 'exclusive')
      for (const id of c.dimensions) {
        const d = dims.get(id);
        if (!d) problems.push(`exclusive: unknown dimension "${id}"`);
        else if (!d.dim.logical)
          problems.push(`exclusive: "${id}" is presentation; a constraint binds logical dimensions only (D27)`);
      }
    if (c.kind === 'requires')
      for (const side of [c.a, c.b]) {
        const [id, value] = splitTerm(side);
        const d = dims.get(id);
        if (!d) problems.push(`requires: unknown dimension in "${side}"`);
        else if (!d.dim.logical)
          problems.push(`requires: "${id}" is presentation; a constraint binds logical dimensions only (D27)`);
        else if (value === undefined || !d.domain.some((v) => valueText(v) === value))
          problems.push(`requires: "${side}" names no value of ${id}`);
      }
  }
  if (manifest.daily && !modes.has(manifest.daily.mode)) problems.push(`daily: unknown mode "${manifest.daily.mode}"`);
  const compiled: CompiledManifest = {
    manifest,
    hash: sha256HexSync(canonicalJson(manifest)),
    dims,
    order: manifest.dimensions.map((d) => d.id),
    anchors,
    modes,
  };
  if (!problems.length) {
    const story = storyAssignments(compiled);
    const broken = violations(compiled, story);
    if (broken.length) problems.push(`the story world breaks a constraint: ${broken.join('; ')}`);
  }
  if (problems.length) throw new RemixManifestError(problems);
  return compiled;
}

function needsItem(c: unknown, item: Id): boolean {
  if (!c || typeof c !== 'object') return false;
  if ('has' in c && (c as { has: unknown }).has === item) return true;
  if ('not' in c) return false;
  return Object.values(c).some((v) => (Array.isArray(v) ? v.some((x) => needsItem(x, item)) : false));
}

/** `<dimension>=<value>` split at its first `=`. */
function splitTerm(t: string): [string, string | undefined] {
  const i = t.indexOf('=');
  return i < 0 ? [t, undefined] : [t.slice(0, i), t.slice(i + 1)];
}

/** A value as a constraint's term writes it: a string as is, a number in decimal, an order joined by `>`. */
function valueText(v: unknown): string {
  return Array.isArray(v) ? v.join('>') : String(v);
}

/** Every dimension at its story value. */
function storyAssignments(c: CompiledManifest): Record<string, unknown> {
  return Object.fromEntries(c.order.map((id) => [id, c.dims.get(id)!.story]));
}

/** The constraints a (partial) assignment breaks among the dimensions it has. */
export function violations(c: CompiledManifest, a: Readonly<Record<string, unknown>>): string[] {
  const out: string[] = [];
  for (const k of c.manifest.constraints) {
    if (k.kind === 'exclusive') {
      const seen = new Map<string, string>();
      for (const id of k.dimensions) {
        if (!(id in a)) continue;
        const v = key(a[id]);
        if (seen.has(v)) out.push(`${seen.get(v)} and ${id} take the same value`);
        seen.set(v, id);
      }
    } else if (k.kind === 'requires') {
      const [ia, va] = splitTerm(k.a);
      const [ib, vb] = splitTerm(k.b);
      if (ia in a && ib in a && valueText(a[ia]) === va && valueText(a[ib]) !== vb) out.push(`${k.a} requires ${k.b}`);
    }
  }
  // Capacity: two items share an anchor only when it says so.
  const load = new Map<string, number>();
  for (const id of c.order) {
    const d = c.dims.get(id)!.dim;
    if (d.kind !== 'item-placement' || !(id in a)) continue;
    const k = a[id] as string;
    load.set(k, (load.get(k) ?? 0) + 1);
    if (load.get(k)! > (c.anchors.get(k)?.capacity ?? 1)) out.push(`anchor ${k} is over its capacity`);
  }
  return out;
}

/** A uniform draw in [0, n) from a stream, by rejection (no modulo bias), integers only. */
export function uniform(rng: Prng, n: number): number {
  if (n <= 1) return 0;
  const limit = 4294967296 - (4294967296 % n);
  for (;;) {
    const x = rng.nextU32();
    if (x < limit) return x % n;
  }
}

const streamOf = (seed: string, what: string, logical: boolean) =>
  derive(`${seed}|remix|${what}`, logical ? 'logic' : 'cosmetic');

/**
 * Every logical world of a catalogue mode, in a fixed order (the product of its dimensions' domains, the others at
 * their story value, filtered by the constraints). More than `CATALOGUE_MAX`: an error (D25: make it a generator).
 * @public
 */
export function catalogue(c: CompiledManifest, modeId: string): Record<string, unknown>[] {
  const mode = c.modes.get(modeId);
  if (!mode) throw new RemixSeedError(`unknown mode "${modeId}"`);
  const varying = mode.dimensions.filter((id) => c.dims.get(id)!.dim.logical);
  const size = varying.reduce((n, id) => n * c.dims.get(id)!.domain.length, 1);
  if (size > CATALOGUE_MAX)
    throw new RemixManifestError([
      `mode ${modeId}: ${size} instances exceed the catalogue's ${CATALOGUE_MAX} (use a generator)`,
    ]);
  const base = Object.fromEntries(
    c.order
      .filter((id) => c.dims.get(id)!.dim.logical && !varying.includes(id))
      .map((id) => [id, c.dims.get(id)!.story]),
  );
  const out: Record<string, unknown>[] = [];
  const walk = (i: number, acc: Record<string, unknown>) => {
    if (i === varying.length) {
      if (!violations(c, acc).length) out.push({ ...acc });
      return;
    }
    for (const v of c.dims.get(varying[i]!)!.domain) walk(i + 1, { ...acc, [varying[i]!]: v });
  };
  walk(0, base);
  return out;
}

/** The logical assignments of a generator mode, built dimension by dimension; a dead end is an internal error. */
function construct(c: CompiledManifest, mode: VariationMode, seed: string): Record<string, unknown> {
  // The dimensions the mode keeps at their story value are assigned first: the others are drawn around them.
  const a: Record<string, unknown> = {};
  for (const id of c.order) {
    const d = c.dims.get(id)!;
    if (d.dim.logical && !mode.dimensions.includes(id)) a[id] = d.story;
  }
  const varying = c.order.filter((id) => c.dims.get(id)!.dim.logical && mode.dimensions.includes(id));
  // Depth-first with backtracking, deterministic: each dimension tries first the value its stream draws among those
  // the constraints still allow, then the others in domain order. A world always exists (the story's satisfies the
  // constraints, `compileManifest` checks it), so the search always ends with one: never a dead end at run time.
  const place = (i: number): boolean => {
    if (i === varying.length) return true;
    const id = varying[i]!;
    const ok = c.dims.get(id)!.domain.filter((v) => !violations(c, { ...a, [id]: v }).length);
    if (!ok.length) return false;
    const first = uniform(streamOf(seed, id, true), ok.length);
    for (let k = 0; k < ok.length; k++) {
      a[id] = ok[(first + k) % ok.length];
      if (place(i + 1)) return true;
    }
    delete a[id];
    return false;
  };
  if (!place(0)) throw new RemixManifestError([`mode ${mode.id}: no world satisfies the constraints (seed ${seed})`]);
  return a;
}

/** The value of each presentation dimension a mode varies (the `cosmetic` stream), the others at their story value. */
function presentation(c: CompiledManifest, mode: VariationMode | undefined, seed: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const id of c.order) {
    const d = c.dims.get(id)!;
    if (d.dim.logical) continue;
    out[id] = mode?.dimensions.includes(id) ? uniform(streamOf(seed, id, false), d.domain.length) : d.story;
  }
  return out;
}

/** The generators this engine knows, by algorithm version. Only version 1 exists; a stored variant of another is loaded as is. */
const GENERATORS: Readonly<
  Record<number, (c: CompiledManifest, mode: VariationMode, seed: string) => Record<string, unknown>>
> = {
  1: (c, mode, seed) => {
    const logical =
      mode.strategy === 'catalogue'
        ? (() => {
            const list = catalogue(c, mode.id);
            return list[uniform(streamOf(seed, `catalogue:${mode.id}`, true), list.length)]!;
          })()
        : construct(c, mode, seed);
    const all = { ...logical, ...presentation(c, mode, seed) };
    return Object.fromEntries(c.order.map((id) => [id, all[id]]));
  },
};

/**
 * The world of a seed: `GameIR + VariationManifest + seed + algorithmVersion → WorldVariant` (ADR 0018). `story` (the
 * seed or the mode) gives every dimension its story value. A malformed seed, an unknown mode or an unknown algorithm
 * version throws `RemixSeedError`; a manifest that cannot produce a world throws `RemixManifestError`.
 * @public
 */
export function compileVariant(
  world: RemixWorld | CompiledManifest,
  manifest: VariationManifest,
  seed: string,
  algorithmVersion: number = REMIX_ALGORITHM_VERSION,
  modeId = 'remix',
): WorldVariant {
  const generate = GENERATORS[algorithmVersion];
  if (!generate)
    throw new RemixSeedError(
      `unknown Remix algorithm version ${algorithmVersion} (this engine knows ${Object.keys(GENERATORS).join(', ')})`,
    );
  const s = normalizeSeed(seed);
  const c = 'dims' in world ? world : compileManifest(manifest, world);
  const story = s === STORY_SEED || modeId === 'story';
  const mode = story ? undefined : c.modes.get(modeId);
  if (!story && !mode) throw new RemixSeedError(`unknown mode "${modeId}"`);
  const assignments = mode ? generate(c, mode, s) : { ...storyAssignments(c) };
  const body = {
    seed: story ? STORY_SEED : s,
    algorithm: REMIX_ALGORITHM,
    algorithmVersion,
    manifestHash: c.hash,
    mode: story ? 'story' : modeId,
    assignments,
  };
  return { ...body, hash: variantHash(body) };
}

/** The story world of a game: every dimension at its story value (an empty manifest gives an empty assignment). @public */
export function storyVariant(manifest: VariationManifest | undefined, world: RemixWorld): WorldVariant {
  return compileVariant(world, manifest ?? EMPTY_MANIFEST, STORY_SEED);
}

export { EMPTY_MANIFEST } from './story';

/**
 * A stored variant (a save's, a session's, a speedrun's) checked and kept as it is: its hash must match its content;
 * it is never regenerated, whatever this engine's algorithm version. Against a changed manifest, each assignment must
 * still be in its dimension's domain (a world the game no longer has is an error); `stale` says the manifest moved.
 * @public
 */
export function loadVariant(c: CompiledManifest, input: unknown): { variant: WorldVariant; stale: boolean } {
  const parsed = WorldVariantSchema.safeParse(input);
  if (!parsed.success) throw new RemixSeedError('the stored world is not a world: refused', 'world-shape');
  const stored = parsed.data as WorldVariant;
  const { hash, ...body } = stored;
  if (stored.algorithm !== REMIX_ALGORITHM)
    throw new RemixSeedError(`unknown Remix algorithm "${stored.algorithm}"`, 'world-shape');
  // The hash proves the world was not altered after it was hashed, not who made it (integrity, not authenticity): a
  // forged world can carry its own correct hash, so every value is checked against this game whatever the hash says.
  // A world canonical JSON refuses (a number JSON reads as Infinity, two keys equal once NFC-composed) has no hash: it
  // is a world of the wrong shape, refused as such, never a crash of whoever reads it (4.3.0).
  let computed: string;
  try {
    computed = variantHash(body);
  } catch (err) {
    throw new RemixSeedError(`the stored world cannot be hashed: ${(err as Error).message}`, 'world-shape');
  }
  if (computed !== hash) throw new RemixSeedError('the stored world does not match its hash: refused', 'world-hash');
  const stale = stored.manifestHash !== c.hash;
  if (stored.mode !== 'story' && !c.modes.has(stored.mode))
    throw new RemixSeedError(`this world's mode "${stored.mode}" does not exist in the game`, 'world-value');
  for (const [id, v] of Object.entries(stored.assignments)) {
    const d = c.dims.get(id);
    if (!d || !d.domain.some((x) => key(x) === key(v)))
      throw new RemixSeedError(`this world's ${id} = ${key(v)} does not exist in the game`, 'world-value');
  }
  // Complete: every dimension has its value (a world stored before a dimension was added plays it at its story value).
  for (const id of c.order)
    if (!(id in stored.assignments) && !stale)
      throw new RemixSeedError(`this world has no value for ${id}: refused`, 'world-value');
  const broken = violations(c, stored.assignments);
  if (broken.length)
    throw new RemixSeedError(`this world breaks the game's constraints: ${broken.join('; ')}`, 'world-constraint');
  return { variant: stored, stale };
}

/** The logical part of a variant: what the solver's space depends on (presentation left out, D27). */
function logicalAssignments(c: CompiledManifest, v: WorldVariant): Record<string, unknown> {
  return Object.fromEntries(Object.entries(v.assignments).filter(([id]) => c.dims.get(id)?.dim.logical));
}

/** A key for proofs: two variants with the same logical world share a proof certificate. @public */
export function logicalKey(c: CompiledManifest, v: WorldVariant): string {
  return sha256HexSync(canonicalJson({ manifest: c.hash, logical: logicalAssignments(c, v) }));
}
