// The save envelope v4's world (4.1.15, in the `core` mutation set as critical-*): every branch of core/save.ts that reads a world, and the story world written
// without the compiler (core/remix/story.ts) equal to the compiler's. core/save.ts is held to 100 % of its branches.
import { describe, expect, it } from 'vitest';
import {
  parseSave,
  type SaveEnvelopeV3,
  SaveWorldMismatch,
  saveEnvelope,
  savedWorld,
  upgradeEnvelope,
} from '@engine/core/save';
import { storyWorld } from '@engine/core/remix/story';
import { storyVariant } from '@engine/core/remix/compile';
import { applyStory, applyVariant, compileGameManifest, remixWorld } from '@engine/core/remix/apply';
import { compileVariant } from '@engine/core/remix/compile';
import { encodeSeedCode } from '@engine/core/remix/seed-code';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import { mini, miniLayouts } from './fixtures/mini';
import { extendedDemo } from './fixtures/remix-extension';
import { game as reference } from '../games/reference/game';
import { game as demo } from '../games/demo/game';

const stateOf = async (g = mini()) => {
  const e = new Engine(g, miniLayouts, new FakePresenter(), new MemoryStore());
  await e.newGame();
  return e.state;
};

describe('the story world without the compiler', () => {
  it('equals the compiler’s, for no manifest, the demo, the reference and the extension (anchors, an order)', () => {
    for (const g of [mini(), demo, reference, extendedDemo()])
      expect(storyWorld(g.remix)).toEqual(storyVariant(g.remix, remixWorld(g)));
  });
});

describe('savedWorld', () => {
  it('reads a v4 envelope or a slot holding one; nothing from v3, a raw state, a broken world or a non-object', async () => {
    const g = mini();
    const env = saveEnvelope(g, await stateOf(g));
    expect(savedWorld(env)).toEqual(storyWorld(undefined));
    expect(savedWorld({ meta: {}, envelope: env })).toEqual(storyWorld(undefined));
    expect(savedWorld({ meta: {}, envelope: undefined })).toBeUndefined();
    expect(savedWorld({ ...env, schema: 3 })).toBeUndefined();
    expect(savedWorld({ ...env, variant: { seed: 'x' } })).toBeUndefined();
    expect(savedWorld(null)).toBeUndefined();
    expect(savedWorld('save')).toBeUndefined();
  });
});

describe('parseSave and the world', () => {
  it('upgradeEnvelope keeps a v4 envelope as it is', async () => {
    const g = mini();
    const env = saveEnvelope(g, await stateOf(g));
    expect(upgradeEnvelope(g, env)).toBe(env);
  });
  it('a story save loads into the story world, applied or not; a remix world refuses it, and a v3 save', async () => {
    const g = mini();
    const state = await stateOf(g);
    const env = JSON.parse(JSON.stringify(saveEnvelope(g, state)));
    expect(parseSave(g, env)).toEqual(state);
    const r = applyStory(reference);
    const e = new Engine(structuredClone(r), {}, new FakePresenter(), new MemoryStore());
    await e.checkpoint('night_market');
    const storyEnv = JSON.parse(JSON.stringify(saveEnvelope(r, e.state)));
    expect(parseSave(r, storyEnv).room).toBe('market');
    const v = compileVariant(compileGameManifest(reference), reference.remix!, encodeSeedCode(3));
    const world = applyVariant(reference, v);
    expect(() => parseSave(world, storyEnv)).toThrow(SaveWorldMismatch);
    const { variant: _v, ...rest } = storyEnv;
    const v3 = { ...rest, schema: 3 } as SaveEnvelopeV3;
    expect(() => parseSave(world, v3)).toThrow(SaveWorldMismatch);
    expect(parseSave(r, v3).room).toBe('market');
    // The same world loads; another world's save names it.
    const we = new Engine(structuredClone(world), {}, new FakePresenter(), new MemoryStore());
    await we.checkpoint('night_market');
    const worldEnv = JSON.parse(JSON.stringify(saveEnvelope(world, we.state)));
    expect(parseSave(world, worldEnv).room).toBe('market');
    let err: unknown;
    try {
      parseSave(r, worldEnv);
    } catch (x) {
      err = x;
    }
    expect((err as SaveWorldMismatch).variant.hash).toBe(v.hash);
    expect((err as Error).message).toMatch(/another world/);
  });
});

describe('the session records its world', () => {
  it('a game played in a world writes it into its session; a game without one writes no variant key', async () => {
    const e = new Engine(mini(), miniLayouts, new FakePresenter(), new MemoryStore());
    await e.newGame();
    expect(e.session).not.toBeNull();
    expect('variant' in e.session!).toBe(false);
    const v = compileVariant(compileGameManifest(reference), reference.remix!, encodeSeedCode(5));
    const w = new Engine(structuredClone(applyVariant(reference, v)), {}, new FakePresenter(), new MemoryStore());
    await w.checkpoint('night_market');
    expect(w.session!.variant).toEqual(v);
  });
});
