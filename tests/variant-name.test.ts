// A character variant may carry a `name` (4.3.0 "Hero Choice", plan §3.1): while the variant applies, the character is
// called by it everywhere the player reads a name (`character()`, `nameOf()`, a `{name}` in a fallback line); with no
// variant matching, the written name stays.
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import type { GameDef } from '@engine/core/types';
import { applyLocale, textPaths } from '@engine/tools/i18n';
import { mini, miniLayouts } from './fixtures/mini';

function named(): GameDef {
  const g = mini();
  g.characters.hero!.variants = [{ if: { flag: 'form', eq: 'f' }, name: 'Heroine', portrait: 'h/f' }];
  // A variant with no name keeps the character's: only the sprites change.
  g.characters.uncle!.variants = [
    { if: { flag: 'wet', eq: true }, sprites: { idle: ['pa/wet'] } },
    { if: { flag: 'revealed', eq: true }, name: 'The Count' },
  ];
  g.rules.fallbacks.look = ['That is {name}.'];
  return g;
}

async function boot(g: GameDef = named()) {
  const ui = new FakePresenter();
  const e = new Engine(g, miniLayouts, ui, new MemoryStore());
  await e.newGame();
  return { e, ui };
}

describe('a character variant’s name', () => {
  it('character() returns the variant’s name with its other fields, the written name otherwise', async () => {
    const { e } = await boot();
    expect(e.character('hero')?.name).toBe('Hero');
    e.state.flags.form = 'f';
    expect(e.character('hero')).toMatchObject({ name: 'Heroine', portrait: 'h/f', color: '#fff' });
    e.state.flags.form = 'm';
    expect(e.character('hero')?.name).toBe('Hero');
  });

  it('nameOf() follows it, for an actor with no name of its own and for a character id', async () => {
    const { e } = await boot();
    expect(e.nameOf('uncle')).toBe('Uncle');
    expect(e.nameOf('hero')).toBe('Hero');
    e.state.flags.revealed = true;
    e.state.flags.form = 'f';
    expect(e.nameOf('uncle')).toBe('The Count');
    expect(e.nameOf('hero')).toBe('Heroine');
  });

  it('the first matching variant wins: one with no name keeps the written name', async () => {
    const { e } = await boot();
    e.state.flags.wet = true;
    e.state.flags.revealed = true;
    expect(e.character('uncle')).toMatchObject({ name: 'Uncle', sprites: { idle: ['pa/wet'] } });
    expect(e.nameOf('uncle')).toBe('Uncle');
  });

  it('a {name} in a fallback line is filled with it', async () => {
    const { e, ui } = await boot();
    await e.act({ verb: 'look', a: 'uncle' });
    expect(ui.log.at(-1)).toBe('hero: That is Uncle.');
    e.state.flags.revealed = true;
    await e.act({ verb: 'look', a: 'uncle' });
    expect(ui.log.at(-1)).toBe('hero: That is The Count.');
  });

  it('is a text of the game: listed for translation, replaced by a locale', () => {
    const g = named();
    const paths = Object.fromEntries(textPaths(g).map((p) => [p.path, p.text]));
    expect(paths['char:hero/variants[0].name']).toBe('Heroine');
    expect(paths['char:uncle/variants[0].name']).toBeUndefined();
    const fr = applyLocale(g, { 'char:hero/variants[0].name': 'Héroïne' });
    expect(fr.characters.hero!.variants![0]!.name).toBe('Héroïne');
  });
});
