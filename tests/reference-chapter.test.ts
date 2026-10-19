// The 3.4 reference chapter (games/reference, "The Night Market"): the content validates, the proof by chapters finds
// no softlock, and the stage holds what the 3.4 exit criteria ask of it — one scene with six layers or more, parallax
// and three masks; zones joined by stairs; two planes joined by a ladder and a jump; a staged finale.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Layout } from '@engine/core/types';
import { stageOf, rendererOf } from '@engine/core/stage';
import { validate } from '@engine/tools/validate';
import { solve } from '@engine/tools/solve';
import { minigames } from '@engine/minigames';
import { game } from '../games/reference/game';
import manifest from '../games/reference/assets.gen.json';

const dir = 'games/reference/layout';
const layouts: Record<string, Layout> = Object.fromEntries(
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))]),
);
const room = (id: string) => game.rooms.find((r) => r.id === id)!;
const stage = (id: string) => stageOf(room(id), layouts[id]);

describe('reference chapter: content', () => {
  it('validates without errors', () => {
    const { errors } = validate(game, layouts, {
      assets: manifest as never,
      minigameIds: Object.keys(minigames),
      minigameParams: Object.fromEntries(Object.entries(minigames).map(([k, m]) => [k, m.required ?? []])),
    });
    expect(errors).toEqual([]);
  });
  it('two playable characters, eight rooms or more, drawn by the Canvas painter', () => {
    expect(game.players?.ids).toEqual(['hero', 'biscuit']);
    expect(game.rooms.length).toBeGreaterThanOrEqual(8);
    expect(rendererOf(room('market'), game)).toBe('canvas');
  });
  it('the proof finds no softlock', async () => {
    const r = await solve(structuredClone(game), layouts, { mode: 'prove', maxStates: 200000 });
    expect(r.truncated).toBe(false);
    expect(r.status).toBe('solved');
    expect(r.softlockCount).toBe(0);
  }, 120000);
});

describe('reference chapter: the stage', () => {
  it('the market: six layers or more, parallax, three masks, two zones joined by stairs', () => {
    const s = stage('market');
    expect(s.layers.length).toBeGreaterThanOrEqual(6);
    expect(s.layers.some((l) => l.parallax[0] !== 1 || l.parallax[1] !== 1)).toBe(true);
    expect(s.occluders.length).toBeGreaterThanOrEqual(3);
    expect(s.zones.length).toBeGreaterThanOrEqual(2);
    expect(s.links.some((l) => l.mode === 'stairs')).toBe(true);
  });
  it('the yard: two planes, a ladder opened by a flag and a jump for Biscuit only', () => {
    const s = stage('yard');
    expect(s.zones.length).toBe(2);
    expect(s.links.find((l) => l.mode === 'ladder')?.if).toBe('ladder_down');
    expect(s.links.find((l) => l.mode === 'jump')?.if).toEqual({ player: 'biscuit' });
  });
  it('no layer or link changes the puzzle state: a link only reads a condition', () => {
    for (const r of game.rooms)
      for (const l of Object.values(r.stage?.links ?? {}))
        expect(Object.keys(l).every((k) => k === 'if' || k === 'locked')).toBe(true);
    for (const r of game.rooms)
      for (const l of r.stage?.layers ?? [])
        expect(Object.keys(l).every((k) => ['id', 'image', 'role', 'visible', 'name'].includes(k))).toBe(true);
  });
});
