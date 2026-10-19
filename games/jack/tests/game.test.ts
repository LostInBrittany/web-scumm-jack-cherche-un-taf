import { describe, expect, it } from 'vitest';
import type { Layout } from 'web-scumm/content';
import { solve } from 'web-scumm/testing';
import { Engine } from 'web-scumm/testing';
import { FakePresenter, MemoryStore } from 'web-scumm/testing';
import { parseSave, saveEnvelope } from 'web-scumm/testing';
import { game } from '../game';
import manoir from '../layout/manoir.json';
import place from '../layout/place.json';
import foire from '../layout/foire.json';

const layouts: Record<string, Layout> = { manoir: manoir as unknown as Layout, place: place as unknown as Layout, foire: foire as unknown as Layout };

describe('selected game contract', () => {
  it('has a replayable winning walkthrough', async () => {
    const result = await solve(game, layouts, { mode: 'witness' });
    expect(result.status).toBe('solved');
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('round-trips its initial save envelope', async () => {
    const engine = new Engine(game, layouts, new FakePresenter(), new MemoryStore());
    // The intro ends on a guided action (look at the locker): don't wait for a player who never comes.
    await Promise.race([engine.newGame(), new Promise((r) => setTimeout(r, 300))]);
    expect(parseSave(game, saveEnvelope(game, engine.state))).toEqual(engine.state);
  });
});
