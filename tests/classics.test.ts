// The classic mechanics (the wiki's `create.classics`, wiki/en|fr/create.classics.md, since 4.5.0) written with the
// DSL as is: the engine plays them, the solver proves them, and the page describes each one in
// both languages.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { splitSections } from '../tools/wiki/docs';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import type { GameDef, Layout } from '@engine/core/types';
import { validate } from '@engine/tools/validate';
import { solve } from '@engine/tools/solve';
import {
  dott,
  dottLayouts,
  grog,
  grogLayouts,
  insults,
  insultsLayouts,
  mansion,
  mansionLayouts,
  stan,
  stanLayouts,
} from './fixtures/classics';

function boot(g: GameDef, layouts: Record<string, Layout>) {
  const ui = new FakePresenter();
  const e = new Engine(g, layouts, ui, new MemoryStore());
  e.random = () => 0;
  return { e, ui };
}
const clean = (g: GameDef, l: Record<string, Layout>) => expect(validate(g, l).errors).toEqual([]);

describe('insult sword fighting', () => {
  it('is a topic whose choices depend on what the thug taught', async () => {
    clean(insults(), insultsLayouts);
    const { e, ui } = boot(insults(), insultsLayouts);
    await e.newGame();
    // Challenging the master before learning: the only replies lose.
    ui.picks = [0, 0, 0];
    await e.act({ verb: 'talk', a: 'master' });
    expect(e.state.flags.master_beaten).toBeUndefined();
    ui.picks = [0];
    await e.act({ verb: 'talk', a: 'thug' });
    ui.picks = [0];
    await e.act({ verb: 'talk', a: 'thug' });
    expect(e.state.flags).toMatchObject({ learned_farmer: true, learned_dog: true });
    ui.picks = [0, 0, 0];
    await e.act({ verb: 'talk', a: 'master' });
    expect(e.state.flags.master_beaten).toBe(true);
    expect(e.state.done).toBe(true);
  });
  it('is proven by the solver, which tries every reply of a choice', async () => {
    const r = await solve(insults(), insultsLayouts, { maxStates: 2000 });
    expect(r.finished).toBe(true);
    expect(r.path.filter((s) => s.startsWith('Talk thug'))).toHaveLength(2);
  });
});

describe('the melting mug of grog', () => {
  it('is a world script: the item changes while the player walks', async () => {
    clean(grog(), grogLayouts);
    const { e } = boot(grog(), grogLayouts);
    await e.newGame();
    expect(await e.runScript('mug_melts')).toBe(false); // nothing to melt
    await e.act({ verb: 'use', a: 'barrel' });
    expect(e.state.inventory).toEqual(['mug_grog']);
    await e.runScript('mug_melts');
    expect(e.state.inventory).toEqual(['mug_holey']);
    await e.act({ verb: 'use', a: 'mug_holey', b: 'barrel' });
    expect(e.state.inventory).toEqual(['mug_grog']);
  });
  it('lets the solver see both outcomes and still finish', async () => {
    const r = await solve(grog(), grogLayouts, { maxStates: 2000 });
    expect(r.finished).toBe(true);
    expect(r.deadEnds).toEqual([]);
  });
});

describe('the tree planted in the past', () => {
  it('changes what the other playable character sees, and the fruit travels back', async () => {
    clean(dott(), dottLayouts);
    const { e } = boot(dott(), dottLayouts);
    await e.newGame();
    await e.switchTo('laverne');
    expect(e.targets(e.room())).not.toContain('tree');
    await e.switchTo('hoagie');
    await e.act({ verb: 'use', a: 'seed', b: 'ground' });
    await e.switchTo('laverne');
    expect(e.targets(e.room())).toContain('tree');
    await e.act({ verb: 'take', a: 'tree' });
    await e.act({ verb: 'use', a: 'fruit', b: 'chron' });
    expect(e.state.inventory).toEqual([]);
    await e.switchTo('hoagie');
    expect(e.state.inventory).toEqual(['fruit']);
    await e.act({ verb: 'give', a: 'fruit', b: 'oldman' });
    expect(e.state.done).toBe(true);
  });
  it('is proven by the solver switching characters', async () => {
    const r = await solve(dott(), dottLayouts, { maxStates: 2000 });
    expect(r.finished).toBe(true);
    expect(r.path.filter((s) => s.startsWith('Switch to')).length).toBeGreaterThanOrEqual(2);
  });
});

describe('the patrolling nurse', () => {
  it('catches the hero turn by turn: entering her room, or her entering his', async () => {
    clean(mansion(), mansionLayouts);
    const { e } = boot(mansion(), mansionLayouts);
    await e.newGame();
    await e.act({ verb: 'use', a: 'kitchen' }); // Edna is in the kitchen
    expect(e.state.room).toBe('dungeon');
    await e.act({ verb: 'use', a: 'brick' });
    expect(e.state.room).toBe('hall');
    expect(await e.advance('edna_patrols')).toBe('ran'); // wait
    expect(await e.advance('edna_patrols')).toBe('ran'); // she walks into the hall
    expect(await e.advance('edna_patrols')).toBe('ran'); // the event: caught
    expect(e.state.room).toBe('dungeon');
  });
  it('is proven by the solver, which waits for her to leave', async () => {
    const r = await solve(mansion(), mansionLayouts, { maxStates: 3000 });
    expect(r.finished).toBe(true);
    expect(r.path.some((s) => s === 'Script edna_patrols')).toBe(true);
  });
});

describe('haggling with Stan', () => {
  it('is a numeric flag that goes down', async () => {
    clean(stan(), stanLayouts);
    const { e, ui } = boot(stan(), stanLayouts);
    await e.newGame();
    ui.picks = [0];
    await e.act({ verb: 'talk', a: 'stan' });
    for (let i = 0; i < 3; i++) {
      ui.picks = [0];
      await e.act({ verb: 'talk', a: 'stan' });
    }
    expect(e.state.flags.price).toBe(5000);
    ui.picks = [0];
    await e.act({ verb: 'talk', a: 'stan' });
    expect(e.state.flags.price).toBe(5000);
    ui.picks = [1];
    await e.act({ verb: 'talk', a: 'stan' });
    expect(e.state.done).toBe(true);
  });
  it('is proven by the solver, which counts down without clamping', async () => {
    const r = await solve(stan(), stanLayouts, { maxStates: 2000 });
    expect(r.finished).toBe(true);
    expect(r.path.filter((s) => s.includes('too much'))).toHaveLength(3);
  });
});

describe('the page that describes them', () => {
  it('has a section for each classic proven here, in English and in French', () => {
    const proven = ['insult-sword-fighting', 'grog-mug', 'tree-in-the-past', 'nurse-on-patrol', 'haggling'];
    for (const lang of ['en', 'fr']) {
      const ids = splitSections(readFileSync(`wiki/${lang}/create.classics.md`, 'utf8')).map((s) => s.id);
      expect(ids, lang).toEqual(expect.arrayContaining(proven));
    }
  });
});
