// The compact representation of 4.1.13 (src/engine/tools/solve/search/compact.ts, ADR 0015): its pieces on their own
// (the key, the hash, the store and its snapshot), then the search with it against the search with `objects` (the
// 4.1.8 storage) on the sample game and generated games: the same result, state for state. The 203 searches of the
// 4.1.8 fixture are tests/solver-oracle.test.ts (nightly).
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { solve, type SolveResult } from '@engine/tools/solve';
import type { Dims } from '@engine/tools/solve/abstractions';
import {
  Interner,
  Ints,
  StateStore,
  add64,
  decodeIds,
  encodeIds,
  fnv64,
  rehash,
  stateHash,
  sub64,
} from '@engine/tools/solve/search/compact';
import { replay } from '@engine/tools/replay';
import type { GameState } from '@engine/core/types';
import { game as demo, layouts as demoLayouts, commands } from '../games/demo';
import { matrixGame, randomGame } from './gen/random-game';

const full = (r: SolveResult) => {
  const { profile, ...rest } = r;
  return { ...rest, states: profile.states, positions: profile.positions, hashHits: profile.hashHits };
};
const state = (room: string, inventory: string[] = []): GameState =>
  ({ room, inventory, flags: {}, props: {}, unlocked: [], actors: {}, counters: {}, seen: {}, visited: {} }) as never;

describe('the pieces', () => {
  it('a key is the sorted ids, one or two UTF-16 units each, and decodes back', () => {
    for (const ids of [[], [0], [1, 2, 3], [0x7fff, 0x8000, 0xffff, 0x10000, 0x7fffffff]]) {
      const k = encodeIds(ids);
      expect(decodeIds(k)).toEqual(ids);
    }
    expect(encodeIds([1, 2]).length).toBe(2);
    expect(encodeIds([0x8000]).length).toBe(2);
    expect(encodeIds([3, 0x12345]).length).toBe(3);
  });

  it('FNV-1a 64: the standard vectors, and a reference implementation on any string', () => {
    const hex = (h: [number, number]) => ((BigInt(h[0]) << 32n) | BigInt(h[1])).toString(16).padStart(16, '0');
    expect(hex(fnv64(''))).toBe('cbf29ce484222325');
    expect(hex(fnv64('a'))).toBe('af63dc4c8601ec8c');
    expect(hex(fnv64('foobar'))).toBe('85944171f73967e8');
    const ref = (s: string) => {
      let h = 0xcbf29ce484222325n;
      for (let k = 0; k < s.length; k++) {
        const c = s.charCodeAt(k);
        for (const b of c > 0xff ? [c & 0xff, c >>> 8] : [c]) {
          h ^= BigInt(b);
          h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
        }
      }
      return h.toString(16).padStart(16, '0');
    };
    for (const s of [
      'item:key3\u00011',
      'héllo €',
      '\u00ff\u0100',
      'pos:ann\u0001room4 key3,trinket0 ',
      'x'.repeat(300),
    ])
      expect(hex(fnv64(s))).toBe(ref(s));
  });

  it('64-bit sums carry across the halves, and only when they overflow', () => {
    expect(add64([0, 0xffffffff], [0, 0])).toEqual([0, 0xffffffff]);
    expect(add64([0, 0xffffffff], [0, 1])).toEqual([1, 0]);
    expect(add64([0xffffffff, 0xffffffff], [0, 1])).toEqual([0, 0]);
    expect(sub64([1, 0], [0, 1])).toEqual([0, 0xffffffff]);
    expect(sub64([0, 5], [0, 5])).toEqual([0, 0]);
    expect(sub64([0, 0], [0, 1])).toEqual([0xffffffff, 0xffffffff]);
  });

  it('the state hash ignores the order, and a transition updates it by what changed', () => {
    const a: Dims = [
      ['flag:x', 'true'],
      ['item:k', '1'],
      ['room', 'r1'],
    ];
    const b: Dims = [
      ['flag:y', 'true'],
      ['item:k', '1'],
      ['room', 'r2'],
    ];
    expect(stateHash(a)).toEqual(stateHash([...a].reverse()));
    expect(stateHash(a)).not.toEqual(stateHash(b));
    expect(rehash(stateHash(a), a, b)).toEqual(stateHash(b));
    expect(rehash(stateHash(b), b, a)).toEqual(stateHash(a));
    expect(rehash(stateHash(a), a, [])).toEqual([0, 0]);
  });

  it('the interner and the growing columns', () => {
    const t = new Interner(['a', 'b']);
    expect([t.id('a'), t.id('b'), t.id('c'), t.str(2)]).toEqual([0, 1, 2, 'c']);
    const c = new Ints();
    for (let i = 0; i < 100; i++) c.push(i * 3);
    expect([c.n, c.at(99), c.slice().length]).toEqual([100, 297, 100]);
    expect(new Ints([5, 6]).at(1)).toBe(6);
  });

  for (const compact of [true, false])
    it(`the store (${compact ? 'compact' : 'objects'}): keys, paths, places, a snapshot taken up again`, () => {
      const st = new StateStore(compact);
      const d0: Dims = [['room', 'r0']],
        d1: Dims = [
          ['item:k', '1'],
          ['room', 'r1'],
        ];
      const i0 = st.ref(st.keyOf(d0));
      expect(st.ref(st.keyOf(d0))).toBe(i0);
      // The key of a set of pairs, whatever their order (compact: sorted ids).
      const three: Dims = [
        ['a', '1'],
        ['b', '2'],
        ['c', '3'],
      ];
      if (compact) expect(st.keyOf(three)).toBe(st.keyOf([...three].reverse()));
      st.insert(i0, {
        parent: -1,
        len: 1,
        tail: ['(start)'],
        tailSteps: [{ start: 'new' }] as never,
        state: state('r0'),
        dims: d0,
      });
      const i1 = st.ref(st.keyOf(d1));
      expect(st.isSeen(i1)).toBe(false);
      st.insert(i1, {
        parent: i0,
        len: 2,
        tail: ['Take k'],
        tailSteps: [{ act: { verb: 'take', a: 'k' } }] as never,
        via: 'Take k',
        state: state('r1', ['k']),
        dims: d1,
      });
      st.edge(i0, i1);
      st.goals.add(i1);
      // A pair interned before another whose dimension sorts first: decoded, the dimensions come back in their order.
      const d2: Dims = [
        ['flag:a', 'true'],
        ['room', 'r1'],
      ];
      const before = compact ? st.bytes() : 0;
      const i2 = st.ref(st.keyOf(d2));
      st.insert(i2, { parent: i1, len: 3, tail: ['Look'], tailSteps: [], via: 'Look', state: state('r1'), dims: d2 });
      expect(st.dimsOf(i2)).toEqual(d2);
      expect(st.jsonKey(i2)).toBe(JSON.stringify(d2));
      if (compact) expect(st.bytes()).toBeGreaterThan(before);
      const check = (s: StateStore) => {
        expect(s.seenCount).toBe(3);
        expect(s.path(i1)).toEqual(['(start)', 'Take k']);
        expect(s.path(i0)).toEqual(['(start)']);
        expect(s.steps(i1)).toEqual([{ start: 'new' }, { act: { verb: 'take', a: 'k' } }]);
        expect(s.placeOf(i1)).toEqual({ room: 'r1', inventory: ['k'] });
        expect(s.placeOf(i0)).toEqual({ room: 'r0', inventory: [] });
        expect(s.viaOf(i0)).toBeUndefined();
        expect(s.dimsOf(i1)).toEqual(d1);
        expect(s.jsonKey(i1)).toBe(JSON.stringify(d1));
        expect(s.viaOf(i1)).toBe('Take k');
        expect([s.parentOf(i1), s.lenOf(i1), s.positions]).toEqual([i0, 2, 2]);
        expect(s.size).toBe(3);
        expect([...s.goals]).toEqual([i1]);
        expect(Array.from(s.edgeTo.slice())).toEqual([i1]);
        expect(s.dimsOf(i2)).toEqual(d2);
        expect(s.path(i2)).toEqual(['(start)', 'Take k', 'Look']);
      };
      check(st);
      check(StateStore.restore(JSON.parse(JSON.stringify(st.snapshot()))));
      if (compact) expect(st.bytes()).toBeGreaterThan(0);
      else expect(st.stateOf(i1)?.room).toBe('r1');
    });
});

describe('compact against objects (the 4.1.8 storage)', () => {
  it('the sample game: the witness and the proof, the same in every field', async () => {
    for (const mode of ['witness', 'prove'] as const) {
      const a = await solve(structuredClone(demo), demoLayouts, { mode, commands, keepReachable: true });
      const b = await solve(structuredClone(demo), demoLayouts, {
        mode,
        commands,
        keepReachable: true,
        representation: 'objects',
      });
      expect(a.profile.representation?.mode).toBe('compact');
      expect(b.profile.representation?.mode).toBe('objects');
      expect(full(a)).toEqual(full(b));
    }
  }, 120_000);

  it('40 generated games and two matrix instances: the same result, the same reachable set', async () => {
    const games = [
      ...Array.from({ length: 20 }, (_, k) => randomGame(k + 1)),
      ...Array.from({ length: 10 }, (_, k) => randomGame(k + 1, { free: true })),
      ...Array.from({ length: 10 }, (_, k) => randomGame(k + 1, { free: true, players: 3 })),
      matrixGame(13, { characters: 3, rooms: [20, 40] }),
      matrixGame(16, { characters: 3, rooms: [20, 40] }),
    ];
    const differ: string[] = [];
    for (const [k, g] of games.entries()) {
      const o = { mode: 'prove' as const, maxStates: 3000, keepReachable: true };
      const a = await solve(structuredClone(g.game), g.layouts, o);
      const b = await solve(structuredClone(g.game), g.layouts, { ...o, representation: 'objects' });
      const h = (r: SolveResult) =>
        createHash('sha256')
          .update(JSON.stringify(full(r)))
          .digest('hex');
      if (h(a) !== h(b)) differ.push(`game ${k}`);
    }
    expect(differ).toEqual([]);
  }, 300_000);

  it('the partial-order reduction keeps every state (it expands one again): objects, said in the profile', async () => {
    const r = await solve(structuredClone(demo), demoLayouts, { commands, por: 'sleep' });
    expect(r.profile.representation).toMatchObject({ mode: 'objects', reason: expect.stringContaining('again') });
  }, 60_000);

  it('a softlock cause carries its session entries, and `replay` plays them to the cause', async () => {
    const g = matrixGame(13, { characters: 3, rooms: [20, 40] });
    const r = await solve(structuredClone(g.game), g.layouts, { mode: 'prove', maxStates: 20000 });
    expect(r.status).toBe('softlocks');
    for (const c of r.softlockCauses.slice(0, 3)) {
      expect(c.steps?.length).toBeGreaterThan(0);
      const p = await replay(structuredClone(g.game), g.layouts, { start: { kind: 'new' }, log: c.steps! });
      expect(p.divergedAt).toBeUndefined();
      expect(p.played).toBe(c.steps!.filter((s) => !('start' in s)).length);
    }
    // The witness too, from a proof that found one.
    const w = await solve(structuredClone(g.game), g.layouts, { maxStates: 20000 });
    if (w.finished) {
      const p = await replay(structuredClone(g.game), g.layouts, { start: { kind: 'new' }, log: w.steps });
      expect(p.divergedAt).toBeUndefined();
      expect(p.ended).toBe(true);
    }
  }, 120_000);
});
