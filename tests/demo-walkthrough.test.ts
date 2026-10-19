// The sample game (games/demo) played from New Game to the sealed ending on the real Engine, with a mute presenter.
// Also: the content validates, the solver finishes, hints and reactions answer, the guess is judged.
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import type { Layout } from '@engine/core/types';
import { validate } from '@engine/tools/validate';
import { solve } from '@engine/tools/solve';
import { minigames } from '@engine/minigames';
import { verdict } from '@engine/ending/card';
import { game } from '../games/demo/game';
import { commands } from '../games/demo/index';
import manifest from '../games/demo/assets.gen.json';
import house from '../games/demo/layout/house.json';
import garden from '../games/demo/layout/garden.json';
import market from '../games/demo/layout/market.json';

const layouts: Record<string, Layout> = {
  house: house as unknown as Layout,
  garden: garden as unknown as Layout,
  market: market as unknown as Layout,
};
const tick = () => new Promise((r) => setTimeout(r, 0));

function boot() {
  const ui = new FakePresenter();
  const e = new Engine(structuredClone(game), layouts, ui, new MemoryStore(), { commands });
  e.random = () => 0;
  return { e, ui };
}

describe('demo: content', () => {
  it('validates without errors (images, minigame params, skin, ending)', () => {
    const { errors } = validate(game, layouts, {
      assets: manifest as never,
      minigameIds: Object.keys(minigames),
      minigameParams: Object.fromEntries(Object.entries(minigames).map(([k, m]) => [k, m.required ?? []])),
    });
    expect(errors).toEqual([]);
  });

  it('the solver finishes the game from New Game and from every checkpoint', async () => {
    expect((await solve(game, layouts, { commands })).finished).toBe(true);
    for (const cp of Object.keys(game.checkpoints ?? {}))
      expect((await solve(game, layouts, { start: { checkpoint: cp }, commands })).finished, cp).toBe(true);
  });
});

describe('demo: walkthrough', () => {
  it('plays the whole game, tutorial to sealed ending', async () => {
    const { e, ui } = boot();
    // Picks, in order: the opening guess (Sardines), then "Where is the key?" in the guided talk (then Bye by default).
    ui.picks = [0, 0];
    const started = e.newGame();

    // Tutorial: look, talk, pick up. Any other action repeats the instruction.
    await tick();
    expect(e.guiding).toEqual({ verb: 'look', target: 'pantry' });
    await e.act({ verb: 'take', a: 'clock' });
    expect(ui.log.at(-1)).toBe('hero: First, LOOK AT the pantry cupboard.');
    await e.act({ verb: 'look', a: 'pantry' });
    await tick();
    expect(e.guiding).toEqual({ verb: 'talk', target: 'grandma' });
    await e.act({ verb: 'talk', a: 'grandma' });
    await tick();
    expect(e.guiding).toEqual({ verb: 'take', target: 'shell' });
    await e.act({ verb: 'take', a: 'shell' });
    await started;
    expect(e.state.flags.guess).toBe('sardines');
    expect(e.state.unlocked).toEqual(['house', 'garden']);
    expect(e.state.inventory).toEqual(['shell_phone']);
    expect(e.visible('shell')).toBe(false);

    // Hint voice: Grandma answers from the shell phone.
    await e.act({ verb: 'talk', a: 'shell_phone' });
    expect(ui.log.at(-1)).toBe("grandma_voice: Grandpa's armchair eats everything. Look behind the cushion.");
    // Kinds: never pull a cat; using anything on Biscuit.
    await e.act({ verb: 'pull', a: 'biscuit' });
    expect(ui.log.at(-1)).toBe('hero: Never pull a cat. Cat law, article one.');
    await e.act({ verb: 'use', a: 'shell_phone', b: 'biscuit' });
    expect(ui.log.at(-1)).toBe('hero: Biscuit purrs and goes back to sleep.');

    // The armchair: the token once, then crumbs.
    expect(await e.act({ verb: 'open', a: 'armchair' })).toBe('rule');
    expect(e.state.inventory).toContain('token');
    expect(e.propState('armchair')).toBe('searched');
    await e.act({ verb: 'pull', a: 'armchair' });
    expect(ui.log.at(-1)).toBe('hero: Just crumbs. Old crumbs.');

    // The garden.
    await e.act({ verb: 'use', a: 'window' });
    expect(e.state.room).toBe('garden');
    expect(ui.log).toContain('grandpa: Pixel! Did you come to help me fix the pipes?');
    ui.picks = [0];
    await e.act({ verb: 'talk', a: 'grandpa' });
    expect(ui.log).toContain('grandpa: The key? It fell in the water tank. Plop.');
    await e.act({ verb: 'use', a: 'tank' });
    expect(ui.log.at(-1)).toMatch(/tap is stuck/);
    await e.act({ verb: 'take', a: 'pipe' });
    await e.act({ verb: 'use', a: 'pipe', b: 'tank' });
    expect(ui.log).toContain('minigame pipes');
    expect(e.propState('tank')).toBe('draining');
    expect(e.isUsed('pipe')).toBe(true);
    expect(e.usedLocked('pipe')).toBe(true);
    expect(e.visible('sock')).toBe(true);
    await e.act({ verb: 'look', a: 'sock' });
    expect(e.state.flags.lou_has_key).toBe(true);

    // The call: two voices on the line, then the market is on the map.
    await e.act({ verb: 'talk', a: 'shell_phone' });
    expect(ui.log).toContain('phone neighbor+seller');
    expect(ui.log).toContain('seller: LOU! Your lantern is ready!');
    expect(e.state.unlocked).toContain('market');

    // The market.
    await e.travel('market');
    expect(e.state.room).toBe('market');
    ui.picks = [0, 1]; // "Where is the pantry key?", then "Fine. How do I pay?"
    await e.act({ verb: 'talk', a: 'neighbor' });
    expect(e.state.flags.deposit_known).toBe(true);
    expect(ui.log).toContain('neighbor: He loves tokens. And flowers. Mostly flowers today.');
    expect(e.visible('bouquet')).toBe(false);
    await e.act({ verb: 'give', a: 'token', b: 'seller' });
    expect(ui.log).toContain('minigame pick');
    expect(e.state.inventory).not.toContain('token');
    expect(e.visible('bouquet')).toBe(true);
    await e.act({ verb: 'take', a: 'bouquet' });
    expect(e.visible('bouquet')).toBe(false);
    await e.act({ verb: 'give', a: 'bouquet', b: 'seller' });
    expect(e.state.inventory).toContain('key');

    // Home: the pantry, the sealed ending.
    // The key_found event moved Grandpa home: he greets us after the arrival line, his armchair prop is gone (he brought his own).
    expect(e.state.where).toEqual({ grandpa: 'house' });
    await e.travel('house');
    expect(ui.log.slice(-2)).toEqual([
      'hero: Home! Pantry, here I come.',
      'grandpa: Pixel! I beat you home. The armchair is faster than it looks.',
    ]);
    expect(e.visible('grandpa')).toBe(true);
    expect(e.visible('armchair')).toBe(false);
    await e.act({ verb: 'use', a: 'key', b: 'pantry' });
    expect(e.propState('pantry')).toBe('open');
    expect(e.isUsed('key')).toBe(true);
    expect(ui.log).toContain('ENDING');
    expect(ui.log.at(-1)).toBe('hero: Best. Breakfast. Ever.');

    // The final card judges the opening guess against the sealed outcome.
    expect(verdict(e.game, e.state.flags, { ticket: '', headline: '', outcome: 'sardines' } as never)).toContain(
      'Right!',
    );
    expect(verdict(e.game, e.state.flags, { ticket: '', headline: '', outcome: 'mouse' } as never)).toContain('Nope!');
  });
});
