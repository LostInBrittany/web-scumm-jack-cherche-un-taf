import { describe, expect, it } from 'vitest';
import type { Layout } from '@quest-n-click/engine/content';
import { solve } from '@quest-n-click/engine/testing';
import { Engine } from '@quest-n-click/engine/testing';
import { FakePresenter, MemoryStore } from '@quest-n-click/engine/testing';
import { parseSave, saveEnvelope } from '@quest-n-click/engine/testing';
import { game } from '../game';
import start from '../layout/start.json';

const layouts: Record<string, Layout> = { start: start as unknown as Layout };

describe('selected game contract', () => {
  it('has a replayable winning walkthrough', async () => {
    const result = await solve(game, layouts, { mode: 'witness' });
    expect(result.status).toBe('solved');
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('round-trips its initial save envelope', async () => {
    const engine = new Engine(game, layouts, new FakePresenter(), new MemoryStore());
    await engine.newGame();
    expect(parseSave(game, saveEnvelope(game, engine.state))).toEqual(engine.state);
  });
});
