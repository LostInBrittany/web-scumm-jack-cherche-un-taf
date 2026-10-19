// The seeded generator (4.1.14 "Time Attack", ADR 0016): xoshiro128** with its published reference outputs, the
// vectors every runtime must reproduce (tests/fixtures/prng-vectors.json; a later lot's e2e compares them in Chromium,
// WebKit and Firefox), independent streams per purpose, `engine.random` drawing from the run's `logic` stream,
// `Session.seed` written when a host chose it, and `rnd[]` as the trace a seeded replay reproduces.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import { derive, newSeed, Prng, PRNG_VERSION, type StreamId } from '@engine/core/prng';
import type { Layout, Session } from '@engine/core/types';
import { replay } from '@engine/tools/replay';
import { game as demo } from '../games/demo/game';
import { commands } from '../games/demo/index';
import house from '../games/demo/layout/house.json';
import garden from '../games/demo/layout/garden.json';
import market from '../games/demo/layout/market.json';
import { mini, miniLayouts } from './fixtures/mini';

const V = JSON.parse(readFileSync('tests/fixtures/prng-vectors.json', 'utf8')) as {
  prngVersion: number;
  reference: { state: [number, number, number, number]; u32: number[] };
  vectors: { seed: string; stream: StreamId; u32: number[] }[];
};
const demoLayouts: Record<string, Layout> = {
  house: house as unknown as Layout,
  garden: garden as unknown as Layout,
  market: market as unknown as Layout,
};

describe('xoshiro128**', () => {
  it('gives the published outputs from the state [1, 2, 3, 4]', () => {
    const p = new Prng('any');
    p.restore(V.reference.state);
    expect(Array.from({ length: V.reference.u32.length }, () => p.nextU32())).toEqual(V.reference.u32);
    // The first four, by hand from the algorithm (rotl(s1 × 5, 7) × 9): independent of the fixture.
    p.restore([1, 2, 3, 4]);
    expect([p.nextU32(), p.nextU32(), p.nextU32(), p.nextU32()]).toEqual([11520, 0, 5927040, 70819200]);
  });

  it('reproduces every vector of the fixture (seed × stream), the version included', () => {
    expect(V.prngVersion).toBe(PRNG_VERSION);
    expect(V.vectors.length).toBeGreaterThanOrEqual(20);
    for (const v of V.vectors) {
      const p = derive(v.seed, v.stream);
      expect(
        Array.from({ length: v.u32.length }, () => p.nextU32()),
        `${v.seed}/${v.stream}`,
      ).toEqual(v.u32);
    }
  });

  it('streams of one seed are independent, and the same stream of two seeds differs', () => {
    const draw = (s: string, id: StreamId) => {
      const p = derive(s, id);
      return Array.from({ length: 8 }, () => p.next());
    };
    expect(draw('a', 'logic')).not.toEqual(draw('a', 'cosmetic'));
    expect(draw('a', 'minigame:pipes')).not.toEqual(draw('a', 'minigame:cables'));
    expect(draw('a', 'logic')).not.toEqual(draw('b', 'logic'));
    expect(draw('a', 'logic')).toEqual(draw('a', 'logic'));
    // A cosmetic draw never moves the logic's sequence.
    const logic = derive('a', 'logic');
    const cosmetic = derive('a', 'cosmetic');
    const first = logic.next();
    cosmetic.next();
    cosmetic.next();
    expect([first, logic.next()]).toEqual(draw('a', 'logic').slice(0, 2));
  });

  it('draws in [0, 1), spread over the interval', () => {
    const p = derive('spread', 'logic');
    const xs = Array.from({ length: 4000 }, () => p.next());
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const buckets = [0, 0, 0, 0];
    for (const x of xs) buckets[Math.floor(x * 4)]!++;
    for (const b of buckets) expect(b).toBeGreaterThan(800);
  });

  it('saves and restores its state; a fresh seed is 32 hex digits', () => {
    const p = derive('s', 'logic');
    p.next();
    const st = p.state();
    const a = [p.next(), p.next()];
    p.restore(st);
    expect([p.next(), p.next()]).toEqual(a);
    expect(newSeed()).toMatch(/^[0-9a-f]{32}$/);
    expect(newSeed()).not.toBe(newSeed());
    // Without WebCrypto, an error: never a guessable draw (4.1.15, second reading).
    const crypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(() => newSeed()).toThrow(/no WebCrypto/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: crypto, configurable: true });
    }
  });
});

describe('the engine draws from the run’s logic stream', () => {
  async function seeded(seed: string) {
    const e = new Engine(structuredClone(demo), demoLayouts, new FakePresenter(), new MemoryStore(), { commands });
    e.sessions.nextSeed = seed;
    await e.checkpoint('garden');
    return e;
  }

  it('the same seed, the same draws; the session names the seed it was given', async () => {
    const a = await seeded('seed-1');
    const b = await seeded('seed-1');
    const c = await seeded('seed-2');
    const xs = [a.random(), a.random(), a.random()];
    expect([b.random(), b.random(), b.random()]).toEqual(xs);
    expect([c.random(), c.random(), c.random()]).not.toEqual(xs);
    expect(a.session?.seed).toBe('seed-1');
    const ref = derive('seed-1', 'logic');
    expect(xs).toEqual([ref.next(), ref.next(), ref.next()]);
  });

  it('a session nobody seeded carries no seed (sessions before 4.1.14 are unchanged)', async () => {
    const e = new Engine(mini(), miniLayouts, new FakePresenter(), new MemoryStore());
    await e.newGame();
    expect(e.session && 'seed' in e.session).toBe(false);
    expect(e.sessions.seed).toMatch(/^[0-9a-f]{32}$/);
  });

  it('a load continues the stream; a new game reseeds', async () => {
    const e = await seeded('cont');
    const ref = derive('cont', 'logic');
    expect(e.random()).toBe(ref.next());
    await e.load(structuredClone(e.state));
    expect(e.random()).toBe(ref.next());
    expect(e.session?.seed).toBe('cont');
    e.sessions.nextSeed = 'other';
    void e.newGame(); // the demo's intro waits for its tutorial step: the reseed happens before it
    await new Promise((r) => setTimeout(r, 0));
    expect(e.sessions.seed).toBe('other');
  });

  it('a resumed run restores the stream where it stood', async () => {
    const e = await seeded('resume');
    e.random();
    const st = e.sessions.drawState()!;
    const next = [e.random(), e.random()];
    const f = new Engine(structuredClone(demo), demoLayouts, new FakePresenter(), new MemoryStore(), { commands });
    f.sessions.restoreDraws(st);
    expect([f.random(), f.random()]).toEqual(next);
  });

  it('rnd[] is the trace: a seeded replay, not fed the draws, draws them again', async () => {
    const e = await seeded('trace');
    // The demo's look lines are picked at random: each look draws.
    for (let i = 0; i < 6; i++) await e.act({ verb: 'look', a: i % 2 ? 'tank' : 'shell' });
    const s = JSON.parse(JSON.stringify(e.session)) as Session;
    const recorded = s.log.flatMap((x) => x.rnd ?? []);
    expect(recorded.length).toBeGreaterThan(0);
    const r = await replay(demo, demoLayouts, s, { commands, seed: 'trace' });
    expect(r.divergedAt).toBeUndefined();
    expect(r.session.log.flatMap((x) => x.rnd ?? [])).toEqual(recorded);
    const w = await replay(demo, demoLayouts, s, { commands, seed: 'not-the-seed' });
    expect(w.session.log.flatMap((x) => x.rnd ?? [])).not.toEqual(recorded);
  });

  it('before any session: a draw seeds the stream from nextSeed, or from a fresh seed; no draw state yet', () => {
    const e = new Engine(mini(), miniLayouts, new FakePresenter(), new MemoryStore());
    expect(e.sessions.drawState()).toBeNull();
    e.sessions.nextSeed = 'early';
    expect(e.random()).toBe(derive('early', 'logic').next());
    expect(e.sessions.drawState()!.seed).toBe('early');
    const f = new Engine(mini(), miniLayouts, new FakePresenter(), new MemoryStore());
    f.random();
    expect(f.sessions.seed).toMatch(/^[0-9a-f]{32}$/);
    expect(f.sessions.nextSeed).toBeNull();
  });

  it('a load as the first session takes nextSeed, and the session writes it', async () => {
    const e = new Engine(mini(), miniLayouts, new FakePresenter(), new MemoryStore());
    e.sessions.nextSeed = 'loaded';
    await e.load(e.fresh());
    expect(e.session?.seed).toBe('loaded');
    expect(e.random()).toBe(derive('loaded', 'logic').next());
  });
});
