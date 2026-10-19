// The game's fingerprint (4.1.12 "Language", ADR 0013): four SHA-256, one per part of what a player runs. `logic` is
// the IR (`logicView`: no provenance, no engine version, no extensions hash), `trustedExtensions` the hash of the
// code beside the content (given by the build or a tool), `presentation` every presentation field of the game with
// its asset manifest, `engine` the engine's version and the random generator's (`prngVersion`, reserved until
// 4.1.14). Hashed with WebCrypto (`crypto.subtle`, in the browser and in Node 22): `async` everywhere, never a
// synchronous hash behind a polyfill. The speedrun of 4.1.14 picks, per category, which components a run must match.
import { canonicalJson } from './canonical';
import { type CompiledGame, compileGame } from './define';
import { compileIR, type ExtensionHashes, type GameIR, logicView } from './ir';
import type { GameDef, Id } from './types';
import { PRNG_VERSION } from './prng';

/** The random generator's version, part of `engine`: core/prng.ts's (4.1.14, ADR 0016). */
export { PRNG_VERSION } from './prng';

/**
 * A game's fingerprint: SHA-256 in hex of its logic, its trusted extensions, its presentation and its engine (an empty
 * `trustedExtensions` when the build did not say).
 * @public
 */
export interface GameFingerprint {
  logic: string;
  trustedExtensions: string;
  presentation: string;
  engine: string;
}

/** SHA-256 of a text's UTF-8 bytes, in hex, with WebCrypto. @public */
export async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('sha256Hex: WebCrypto (crypto.subtle) is not available here');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 of a set of source files (path → text) through their canonical text: the trusted extensions' hash. @public */
export function hashSources(files: Readonly<Record<string, string>>): Promise<string> {
  return sha256Hex(canonicalJson(files));
}

const pick = <T extends object>(o: T | undefined, keys: readonly (keyof T)[]): Partial<T> | undefined => {
  if (!o) return undefined;
  const out: Partial<T> = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return Object.keys(out).length ? out : undefined;
};
const each = <V, R>(rec: Readonly<Record<Id, V>> | undefined, f: (v: V) => R | undefined) =>
  rec ? Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, f(v) ?? {}])) : undefined;

/**
 * What the fingerprint's `presentation` hashes: the asset manifest, and every field core/ir-fields.ts classes as
 * presentation (whole) or both (its presentation part: a room's decor, music, stage layers and lights, its props'
 * images and animation frames, its actors' poses; the characters' looks; the items' icons; the verbs' colours; the
 * map's images and pins). No condition nor command of the content is in it.
 * @public
 */
export function presentationOf(game: CompiledGame | GameDef, manifest: unknown = null): unknown {
  const g = game as GameDef;
  return {
    manifest: manifest ?? null,
    game: {
      ...pick(g, [
        'title',
        'renderer',
        'audio',
        'skin',
        'ending',
        'saves',
        'settings',
        'input',
        'ui',
        'titleScreen',
        'creditsScreen',
        'credits',
      ]),
      verbs: g.verbs.map((v) => ({ id: v.id, color: v.color })),
      characters: each(g.characters, (c) =>
        pick(c, [
          'color',
          'height',
          'sprites',
          'portrait',
          'offscreen',
          'fps',
          'glow',
          'mouths',
          'palette',
          'paletteTolerance',
          'variants',
        ]),
      ),
      items: each(g.items, (it) => pick(it, ['icon'])),
      rooms: g.rooms.map((r) => ({
        id: r.id,
        ...pick(r, ['decor', 'music', 'renderer']),
        props: each(r.props, (p) => ({
          ...pick(p, ['img', 'states']),
          anims: each(p.anims, (a) => pick(a, ['frames', 'fps', 'loop'])),
        })),
        actors: each(r.actors, (a) => pick(a, ['pose', 'facing'])),
        exits: each(r.exits, (x) => pick(x, ['sfx', 'onTap'])),
        stage: pick(r.stage, ['layers', 'lights', 'emitters', 'transition']),
      })),
      map: g.map
        ? {
            ...pick(g.map, ['music', 'vehicles']),
            regions: each(g.map.regions, (x) => pick(x, ['image', 'frame'])),
            places: each(g.map.places, (x) => pick(x, ['pos', 'portrait', 'vehicle'])),
          }
        : undefined,
    },
  };
}

/**
 * The fingerprint of a game from its IR, its presentation (`presentationOf`) and its engine's version.
 * @public
 */
export async function fingerprint(ir: GameIR, o: { presentation: unknown; engine: string }): Promise<GameFingerprint> {
  const [logic, presentation, engine] = await Promise.all([
    sha256Hex(canonicalJson(logicView(ir))),
    sha256Hex(canonicalJson(o.presentation)),
    sha256Hex(canonicalJson({ version: o.engine, prngVersion: PRNG_VERSION })),
  ]);
  return { logic, trustedExtensions: ir.extensions.trusted, presentation, engine };
}

/** The short form the pause menu shows: the first eight hex digits of each component (`????????` for an unknown one). @public */
export function shortFingerprint(f: GameFingerprint): string {
  return [f.logic, f.trustedExtensions, f.presentation, f.engine].map((h) => h.slice(0, 8) || '????????').join('-');
}

/**
 * A game's fingerprint from its sources as written (before a translation): compiled, its IR made, its presentation
 * read with the manifest. What the pause menu shows; `extensions.trusted` comes from the build.
 * @public
 */
export function fingerprintGame(
  game: GameDef,
  o: { manifest?: unknown; extensions: ExtensionHashes; engine: string },
): Promise<GameFingerprint> {
  const compiled = compileGame(game);
  const ir = compileIR(compiled, { extensions: o.extensions, engine: o.engine });
  return fingerprint(ir, { presentation: presentationOf(compiled, o.manifest), engine: o.engine });
}
