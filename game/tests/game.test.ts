// The game's contract: it can be finished, and a save reads back as written. `npm test`.
import { describe, expect, it } from 'vitest';
import { Engine, FakePresenter, MemoryStore, parseSave, saveEnvelope, solve } from '@quest-n-click/engine/testing';
import { game, layouts } from '..';

describe('the game', () => {
  it('can be finished from a new game', async () => {
    const result = await solve(game, layouts, { mode: 'witness' });
    expect(result.status).toBe('solved');
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('reads its save back as written', async () => {
    const engine = new Engine(game, layouts, new FakePresenter(), new MemoryStore());
    // A new game may end on a guided action that waits for a player: don't wait for one.
    await Promise.race([engine.newGame(), new Promise((r) => setTimeout(r, 300))]);
    expect(parseSave(game, saveEnvelope(game, engine.state))).toEqual(engine.state);
  });
});
