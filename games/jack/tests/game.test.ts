import { describe, expect, it } from 'vitest';
import type { Layout } from '@quest-n-click/engine/content';
import { solve } from '@quest-n-click/engine/testing';
import { Engine } from '@quest-n-click/engine/testing';
import { FakePresenter, MemoryStore } from '@quest-n-click/engine/testing';
import { parseSave, saveEnvelope } from '@quest-n-click/engine/testing';
import { game } from '../game';
import manoir from '../layout/manoir.json';
import place from '../layout/place.json';
import foire from '../layout/foire.json';
import train from '../layout/train.json';

const layouts: Record<string, Layout> = { manoir: manoir as unknown as Layout, place: place as unknown as Layout, foire: foire as unknown as Layout, train: train as unknown as Layout };

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
