// The inventory abstractions of 3.5 (solve.ts). The canonical owner, for proofs: items no condition reads are one pool
// whoever holds them, while the characters can meet; the hand-overs are played and checked (tests/audit.test.ts
// compares it with the explicit search on random games with free items). Witness dominance, for witnesses only: a
// state with no more progress than one already seen is not explored, and a search that finds nothing with it runs again
// without it.
import { describe, expect, it } from 'vitest';
import type { GameDef, Layout } from '@engine/core/types';
import { dominanceThings, poolableItems, solve } from '@engine/tools/solve';
import { loadLayouts } from '@engine/tools/load';
import { makeStressGame } from '@engine/tools/stress';
import { game as reference } from '../games/reference/game';

describe('the canonical owner', () => {
  it('certifies only items no condition reads, never lost elsewhere, never given by a rule', () => {
    const g = makeStressGame({
      rooms: 6,
      players: 2,
      items: 6,
      flags: 4,
      npcs: 0,
      scripts: 0,
      topics: 2,
      schemaVersion: 3,
    }).game;
    const p = poolableItems(g);
    expect(p.items.has('item_0')).toBe(false); // in an invariant
    expect([...p.items].length).toBeGreaterThan(0);
    expect(poolableItems({ ...g, players: { ...g.players!, sharedInventory: true } }).reason).toContain('share');
  });
  it('the reference chapter: fewer states, the same verdict, every hand-over played', async () => {
    const layouts = loadLayouts('games/reference/layout');
    const on = await solve(structuredClone(reference), layouts, { mode: 'prove', maxStates: 200000 });
    const off = await solve(structuredClone(reference), layouts, {
      mode: 'prove',
      maxStates: 200000,
      ownership: false,
    });
    expect(on.status).toBe('solved');
    expect(off.status).toBe('solved');
    expect(on.profile.ownership).toMatchObject({ applied: true });
    expect(on.profile.ownership!.handovers).toBeGreaterThan(0);
    expect(on.states).toBeLessThan(off.states);
    expect(on.flagsReached).toEqual(off.flagsReached);
    expect(on.roomsReached).toEqual(off.roomsReached);
  }, 300_000);
  it('the open chain of 20 rooms and 2 characters, out of reach before, is proved', async () => {
    const g = makeStressGame({
      rooms: 20,
      players: 2,
      items: 12,
      flags: 30,
      npcs: 1,
      scripts: 2,
      topics: 8,
      schemaVersion: 3,
    });
    const r = await solve(g.game, g.layouts, { mode: 'prove', maxStates: 40000 });
    expect(r.status).toBe('solved');
    expect(r.profile.ownership?.items.length).toBeGreaterThan(10);
  }, 300_000);
});

describe('witness dominance', () => {
  // Three coins to pick in any order before the door opens: 8 orders of progress, the same everything else.
  const game = {
    id: 'dom',
    title: 'Dom',
    saveVersion: 1,
    hero: 'ann',
    verbs: [
      { id: 'take', label: 'Take', color: '#fff' },
      { id: 'use', label: 'Use', color: '#fff' },
    ],
    characters: { ann: { name: 'Ann', color: '#fff', sprites: { idle: ['a/1'] } } },
    items: {},
    rooms: [
      {
        id: 'hall',
        name: 'Hall',
        decor: 'd/h',
        hotspots: { c1: { name: 'c1' }, c2: { name: 'c2' }, c3: { name: 'c3' }, door: { name: 'door' } },
        props: {},
        exits: {},
        on: [
          { verb: 'take', a: 'c1', do: [{ set: 'c1' }] },
          { verb: 'take', a: 'c2', do: [{ set: 'c2' }] },
          { verb: 'take', a: 'c3', do: [{ set: 'c3' }] },
          { verb: 'use', a: 'door', if: { all: ['c1', 'c2', 'c3'] }, do: [{ end: true }] },
        ],
      },
    ],
    rules: { fallbacks: { take: ['No.'], use: ['No.'] } },
    start: { room: 'hall' },
    skin: { icons: { map: 'ui/map', pause: 'ui/pause', music: 'ui/music' } },
    ui: {},
  } as unknown as GameDef;
  const layouts: Record<string, Layout> = { hall: { entries: { default: [320, 360] } } as Layout };
  it('compares only what nothing reads for its absence', () => {
    expect([...dominanceThings(game).flags].sort()).toEqual(['c1', 'c2', 'c3']);
    const negated = structuredClone(game);
    negated.rooms[0].on!.push({ verb: 'take', a: 'c1', if: '!c2', do: ['Not before c2.'] });
    expect(dominanceThings(negated).flags.has('c2')).toBe(false);
  });
  it('prunes states with less progress, still finds the witness; a proof never uses it', async () => {
    const plain = await solve(structuredClone(game), layouts, { mode: 'witness' });
    const dom = await solve(structuredClone(game), layouts, { mode: 'witness', dominance: true });
    expect(dom.finished).toBe(true);
    expect(dom.profile.dominance?.applied).toBe(true);
    expect(dom.states).toBeLessThanOrEqual(plain.states);
    const proof = await solve(structuredClone(game), layouts, { mode: 'prove', dominance: true });
    expect(proof.profile.dominance).toMatchObject({ applied: false, reason: expect.stringContaining('proof') });
  });
});
