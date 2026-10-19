// The game's fingerprint (core/fingerprint.ts, 4.1.12, ADR 0013): four SHA-256, each moved by its own part of the game
// only. A rule changed moves `logic`, a decor `presentation`, a custom command's code `trustedExtensions`, a version
// `engine`; the hash Node computes (`node:crypto`, tools/extensions.ts) is the one WebCrypto computes.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@engine/core/canonical';
import { compileGame } from '@engine/core/define';
import {
  fingerprint,
  type GameFingerprint,
  hashSources,
  PRNG_VERSION,
  presentationOf,
  sha256Hex,
  shortFingerprint,
} from '@engine/core/fingerprint';
import { compileIR } from '@engine/core/ir';
import { FIELD_CLASSES } from '@engine/core/ir-fields';
import type { GameDef } from '@engine/core/types';
import { game as demo, manifest } from '../games/demo';
import { extensionFiles, sha256Files, trustedExtensionsHash } from '../tools/extensions';

/** The sample game's fingerprint, its extension files given as they are on disk (or changed). */
async function print(
  g: GameDef,
  files = extensionFiles('games/demo'),
  m: unknown = manifest,
): Promise<GameFingerprint> {
  const compiled = compileGame(structuredClone(g));
  const ir = compileIR(compiled, { extensions: { trusted: await hashSources(files) }, engine: '4.1.12' });
  return fingerprint(ir, { presentation: presentationOf(compiled, m), engine: '4.1.12' });
}
const changed = (a: GameFingerprint, b: GameFingerprint) =>
  (Object.keys(a) as (keyof GameFingerprint)[]).filter((k) => a[k] !== b[k]).sort();

describe('the fingerprint', () => {
  it('is four SHA-256 in hex, the same twice', async () => {
    const a = await print(demo);
    for (const v of Object.values(a)) expect(v).toMatch(/^[0-9a-f]{64}$/);
    expect(await print(demo)).toEqual(a);
    expect(shortFingerprint(a)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}$/);
  });

  it('a rule changed moves logic only', async () => {
    const g = structuredClone(demo);
    const rule = g.rooms[0]!.on![0]!;
    rule.do = [...rule.do, { set: 'something_new' }];
    expect(changed(await print(demo), await print(g))).toEqual(['logic']);
  });

  it('a decor changed moves presentation only', async () => {
    const g = structuredClone(demo);
    g.rooms[0]!.decor = 'decor/elsewhere';
    expect(changed(await print(demo), await print(g))).toEqual(['presentation']);
    // So does an image of the manifest, a sprite, an icon, a stage layer.
    const m = structuredClone(manifest) as { images: Record<string, unknown> };
    m.images['decor/new'] = [640, 400];
    expect(changed(await print(demo), await print(demo, undefined, m))).toEqual(['presentation']);
    const h = structuredClone(demo);
    h.items.key!.icon = 'items/r1c1';
    expect(changed(await print(demo), await print(h))).toEqual(['presentation']);
  });

  it("a custom command's code changed moves trustedExtensions only", async () => {
    const files = extensionFiles('games/demo');
    expect(Object.keys(files)).toEqual(['index.ts']);
    const edited = { ...files, 'index.ts': files['index.ts']!.replace("'#ffe9a0'", "'#ffffff'") };
    expect(edited['index.ts']).not.toBe(files['index.ts']);
    expect(changed(await print(demo), await print(demo, edited))).toEqual(['trustedExtensions']);
  });

  it('the engine version moves engine only, and prngVersion is reserved', async () => {
    const compiled = compileGame(structuredClone(demo));
    const ir = compileIR(compiled, { extensions: { trusted: '' } });
    const presentation = presentationOf(compiled, manifest);
    const a = await fingerprint(ir, { presentation, engine: '4.1.12' });
    const b = await fingerprint(ir, { presentation, engine: '4.1.13' });
    expect(changed(a, b)).toEqual(['engine']);
    // The generator's version since 4.1.14 (core/prng.ts), no longer fingerprint.ts's own 0.
    expect(PRNG_VERSION).toBe(1);
    // Unknown extensions are said as such: an empty component, never a hash of nothing.
    expect(a.trustedExtensions).toBe('');
  });

  it('Node and WebCrypto agree, on a text and on a set of files', async () => {
    const { createHash } = await import('node:crypto');
    for (const t of ['', 'abc', 'é', '😀'.repeat(1000)])
      expect(await sha256Hex(t)).toBe(createHash('sha256').update(t).digest('hex'));
    const files = extensionFiles('games/demo');
    expect(await hashSources(files)).toBe(sha256Files(files));
    expect(trustedExtensionsHash('games/demo')).toBe(sha256Files(files));
  });

  it('presentation carries every presentation field the sample game writes, and nothing of the logic', () => {
    const p = presentationOf(compileGame(structuredClone(demo)), manifest) as {
      game: Record<string, unknown>;
      manifest: unknown;
    };
    for (const [k, c] of Object.entries(FIELD_CLASSES.game))
      if (c === 'presentation' && (demo as unknown as Record<string, unknown>)[k] !== undefined)
        expect(p.game, `GameDef.${k}`).toHaveProperty(k);
    const text = canonicalJson(p);
    // No rule, no condition, no line of the content: a rule id never appears.
    expect(text).not.toContain(demo.rooms[0]!.on![0]!.id!);
    expect(text).not.toContain('"invariants"');
  });
});

describe('the build writes trustedExtensions (tools/vite/plugins.ts sealBuild)', () => {
  it('the plugin and the player read the same hash', () => {
    const plugins = readFileSync('tools/vite/plugins.ts', 'utf8');
    expect(plugins).toContain('trustedExtensionsHash(GAME_DIR)');
    expect(plugins).toContain("fileName: 'site.json'");
    expect(readFileSync('vite.config.ts', 'utf8')).toContain('__TRUSTED_EXTENSIONS__');
  });
});
