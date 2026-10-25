import { describe, expect, it } from 'vitest';
import { parseSave, saveEnvelope, SaveEnvelopeV3Schema, SaveEnvelopeV4Schema } from '@engine/core/save';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import { mini, miniLayouts } from './fixtures/mini';

describe('save envelope v3', () => {
  it('round-trips a complete, game-bound envelope', async () => {
    const game = mini();
    const engine = new Engine(game, miniLayouts, new FakePresenter(), new MemoryStore());
    await engine.newGame();
    const envelope = saveEnvelope(game, engine.state);
    // Written as v4 since 4.1.15 (the world inside); a v3 envelope is still read (below).
    expect(SaveEnvelopeV4Schema.parse(envelope).schema).toBe(4);
    const { variant: _v, ...v3 } = { ...envelope, schema: 3 as const };
    expect(SaveEnvelopeV3Schema.parse(v3).schema).toBe(3);
    expect(parseSave(game, JSON.parse(JSON.stringify(v3)))).toEqual(engine.state);
    expect(parseSave(game, JSON.parse(JSON.stringify(envelope)))).toEqual(engine.state);
  });

  it('rejects a foreign game, corrupt shape and missing current room without touching current state', async () => {
    const game = mini();
    const engine = new Engine(game, miniLayouts, new FakePresenter(), new MemoryStore());
    await engine.newGame();
    const before = structuredClone(engine.state);
    const foreign = { ...saveEnvelope(game, engine.state), gameId: 'other' };
    expect(() => parseSave(game, foreign)).toThrow(/belongs to game/);
    expect(() => parseSave(game, { ...engine.state, room: 'missing' })).toThrow(/unknown current room/);
    expect(() => parseSave(game, { ...engine.state, started: 'yesterday' })).toThrow();
    expect(engine.state).toEqual(before);
  });

  it('prunes stale non-essential content references and warns once', async () => {
    const game = mini();
    const engine = new Engine(game, miniLayouts, new FakePresenter(), new MemoryStore());
    await engine.newGame();
    const raw = structuredClone(engine.state);
    raw.inventory.push('removed-item');
    raw.used = ['removed-item'];
    raw.unlocked.push('removed-place');
    raw.hero.removed = [1, 2];
    raw.visited.removed = 1;
    raw.where = { removedCharacter: 'a', uncle: 'removed-room' };
    raw.props['removed.prop'] = 'old';
    raw.actors['removed.actor'] = { x: 1 };
    raw.scripts = { removedScript: { pc: 1 } };
    const warnings: string[] = [];
    const parsed = parseSave(game, raw, { warn: (message) => warnings.push(message) });
    expect(parsed).toMatchObject({ inventory: ['cle', 'badge'], used: [], unlocked: [], where: {} });
    expect(parsed.hero.removed).toBeUndefined();
    expect(parsed.visited.removed).toBeUndefined();
    expect(parsed.props['removed.prop']).toBeUndefined();
    expect(parsed.actors['removed.actor']).toBeUndefined();
    expect(parsed.scripts?.removedScript).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('removed-item');
    expect(raw.inventory).toContain('removed-item'); // parsing never mutates the imported object
  });

  it('accepts a validated legacy raw state for deliberate v2 migration', async () => {
    const game = mini();
    const engine = new Engine(game, miniLayouts, new FakePresenter(), new MemoryStore());
    await engine.newGame();
    expect(parseSave(game, engine.state).room).toBe('a');
  });
});

describe('golden saves', () => {
  // One save per release, made by the demo of that release eight inputs into the witness: it must load on the
  // current engine (migrated when its save version is older) and still reach the ending with the remaining inputs.
  it.each([
    '3.0.0',
    '3.1.0',
    '3.2.0',
    '3.3.0',
    '3.4.0',
    '3.5.0',
    '3.6.0',
    '3.6.1',
    '3.7.0',
    '3.7.1',
    '3.8.0',
    '3.9.0',
    '4.0.0',
    '4.1.0',
    '4.1.1',
    '4.1.2',
    '4.1.3',
    '4.1.4',
    '4.1.5',
    '4.1.6',
    '4.1.7',
    '4.1.8',
    '4.1.9',
    '4.1.10',
    '4.1.11',
    '4.1.12',
    '4.1.13',
    '4.1.14',
    '4.1.15',
    '4.1.16',
    '4.1.17',
    '4.1.18',
    '4.1.19',
    '4.1.20',
    '4.2.0',
    '4.2.1',
    '4.2.2',
    '4.2.3',
    '4.2.4',
    '4.2.5',
    '4.3.0',
    '4.3.1',
    '4.4.0',
    '4.5.0',
    '4.5.1',
    '4.5.2',
    '4.5.3',
  ])('a save made by the demo at %s loads on this engine and still reaches the ending', async (version) => {
    const { readFileSync } = await import('node:fs');
    const { replay } = await import('@engine/tools/replay');
    const { game: demo, layouts: demoLayouts, commands } = await import('../games/demo');
    const golden = JSON.parse(readFileSync(`tests/fixtures/saves/demo-${version}.json`, 'utf8'));
    const warnings: string[] = [];
    const state = parseSave(demo, golden.envelope, { warn: (m) => warnings.push(m) });
    expect(warnings).toEqual([]); // nothing pruned: the content this save names still exists
    expect(state.v).toBe(demo.saveVersion);
    const p = await replay(
      demo,
      demoLayouts,
      { start: { kind: 'load' }, base: state, log: golden.remaining },
      { commands },
    );
    expect(p.divergedAt).toBeUndefined();
    expect(p.ended).toBe(true);
  });
});
