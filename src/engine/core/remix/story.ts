// The story world without the compiler (4.1.15, after the CI run of PR #50): what a save needs to write a game played
// in its story world (`SaveEnvelopeV4`), and the shape a stored world is checked against, in the player's first chunk.
// The compiler (core/remix/compile.ts, apply.ts) is loaded only when a game is played in another world: the boot
// imports it for a game with a manifest, a link or a save of another world. `storyWorld` gives exactly what
// `storyVariant` gives (tests/remix-compile.test.ts compares them) without compiling the manifest.
import * as z from 'zod/mini';
import { canonicalJson } from '../canonical';
import type { VariationManifest } from './manifest';
import { sha256HexSync } from './sha256';

/** The algorithm's name: an identifier from web-scumm, kept so existing remixes and runs still load (D47). */
export const REMIX_ALGORITHM = 'web-scumm-remix-1';
/** The generator's version: bumped when a single assignment of a given seed would change (ADR 0018). @public */
export const REMIX_ALGORITHM_VERSION = 1;

/**
 * One world instance: the seed it came from, the algorithm and its version, the manifest's hash, the mode, one value
 * per dimension, and the hash of all that (`canonicalJson`, SHA-256). Stored in a save and a speedrun envelope, never
 * regenerated with another algorithm version.
 * @public
 */
export interface WorldVariant {
  seed: string;
  algorithm: string;
  algorithmVersion: number;
  manifestHash: string;
  mode: string;
  assignments: Readonly<Record<string, unknown>>;
  hash: string;
}

/** A world as stored (a save, a link, a session): its shape, checked before anything reads it. */
export const WorldVariantSchema = z.strictObject({
  seed: z.string().check(z.minLength(1), z.maxLength(64)),
  algorithm: z.string().check(z.minLength(1)),
  algorithmVersion: z.int().check(z.positive()),
  manifestHash: z.string().check(z.maxLength(64)),
  mode: z.string().check(z.minLength(1), z.maxLength(64)),
  assignments: z.record(z.string(), z.unknown()),
  hash: z.string().check(z.regex(/^[0-9a-f]{64}$/)),
});

/** The manifest of a game that declares none: no mode, no dimension. */
export const EMPTY_MANIFEST: VariationManifest = {
  schema: 1,
  algorithm: REMIX_ALGORITHM,
  modes: [],
  dimensions: [],
  constraints: [],
};

/** The hash of a variant's content (everything but `hash`). */
export function variantHash(v: Omit<WorldVariant, 'hash'>): string {
  return sha256HexSync(canonicalJson(v));
}

/** The story world of a manifest (none: the empty one), every dimension at its story value. */
export function storyWorld(manifest: VariationManifest | undefined): WorldVariant {
  const m = manifest ?? EMPTY_MANIFEST;
  const assignments = Object.fromEntries(
    m.dimensions.map((d) => [
      d.id,
      d.kind === 'item-placement'
        ? `${d.story.room}.${d.story.anchor}`
        : d.kind === 'puzzle-order'
          ? [...d.story]
          : d.story,
    ]),
  );
  const body = {
    seed: 'story',
    algorithm: REMIX_ALGORITHM,
    algorithmVersion: REMIX_ALGORITHM_VERSION,
    manifestHash: sha256HexSync(canonicalJson(m)),
    mode: 'story',
    assignments,
  };
  return { ...body, hash: variantHash(body) };
}
