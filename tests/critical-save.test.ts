// Every check and pruning rule of save parsing, envelope and slot (core/save.ts).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSave, parseSlot, saveEnvelope, SlotRecordSchema } from '@engine/core/save';
import type { GameDef, GameState } from '@engine/core/types';
import { mini } from './fixtures/mini';

/** mini, with what the pruning reads: map places, players, a moving character, scripts with and without step ids. */
const game = (): GameDef => {
  const g = mini();
  g.map = {
    regions: {},
    start: 'r',
    places: { park: { name: 'Park' } } as unknown as NonNullable<GameDef['map']>['places'],
  };
  g.players = { ids: ['hero', 'bea', 'ann'], start: { bea: { room: 'b' }, ann: { room: 'gone' } } };
  g.characters.uncle!.room = 'b';
  g.characters.ann!.room = 'gone';
  g.rooms[0]!.props!.valise!.states = { open: 'o/open' };
  g.rooms[0]!.props!.lamp = { img: 'o/lamp' };
  g.scripts = [{ id: 'clock', do: ['a', 'b'], stepIds: ['clock.a', 'clock.b'] }];
  g.rooms[1]!.scripts = [{ id: 'drip', do: ['a'] }];
  return g;
};

const state = (over: Partial<GameState> = {}): GameState => ({
  v: 1,
  room: 'a',
  inventory: ['cle'],
  flags: {},
  props: {},
  actors: {},
  hero: {},
  unlocked: [],
  visited: {},
  counters: {},
  seen: {},
  started: 0,
  ...over,
});

const quiet = { warn: () => {} };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('saveEnvelope', () => {
  it('wraps a copy of the state with the game id, its save version, the time and its world (v4, 4.1.15)', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    const s = state();
    const env = saveEnvelope(mini(), s);
    expect(env).toEqual({
      format: 'web-scumm-save',
      schema: 4,
      gameId: 'mini',
      gameSaveVersion: 1,
      savedAt: 1234,
      state: s,
      variant: expect.objectContaining({ seed: 'story', mode: 'story', assignments: {} }),
    });
    expect(env.state).not.toBe(s);
  });
});

describe('parseSave: envelope and shape', () => {
  it('unwraps a valid envelope', () => {
    const g = game();
    expect(parseSave(g, saveEnvelope(g, state()), quiet)).toEqual(state());
  });
  it('rejects an envelope of another game, or whose versions disagree', () => {
    const g = game();
    expect(() => parseSave(g, { ...saveEnvelope(g, state()), gameId: 'other' })).toThrow(
      /^save belongs to game "other", not "mini"$/,
    );
    expect(() => parseSave(g, { ...saveEnvelope(g, state()), gameSaveVersion: 2 })).toThrow(
      /^save envelope and state versions disagree$/,
    );
  });
  it('rejects a malformed envelope, and an object with format but no envelope shape', () => {
    const g = game();
    expect(() => parseSave(g, { ...saveEnvelope(g, state()), schema: 2 })).toThrow();
    expect(() => parseSave(g, { ...saveEnvelope(g, state()), extra: 1 })).toThrow();
    expect(() => parseSave(g, { ...state(), format: 'web-scumm-save' })).toThrow();
  });
  it('reads a raw state, and rejects what is not one', () => {
    const g = game();
    expect(parseSave(g, state(), quiet)).toEqual(state());
    expect(() => parseSave(g, null)).toThrow();
    expect(() => parseSave(g, 'save')).toThrow();
    expect(() => parseSave(g, { ...state(), v: -1 })).toThrow();
  });
  it('migrates an older state, and rejects one that cannot be', () => {
    const g = { ...game(), saveVersion: 2, migrations: [{ from: 1, renameItem: { key: 'cle' } }] };
    expect(parseSave(g, state({ inventory: ['key'] }), quiet)).toEqual(state({ v: 2, inventory: ['cle'] }));
    expect(() => parseSave(g, state({ v: 5 }))).toThrow(/^save version 5 cannot be migrated to 2$/);
  });
  it('does not touch the input', () => {
    const s = state({ inventory: ['cle', 'gone'] });
    parseSave(game(), s, quiet);
    expect(s.inventory).toEqual(['cle', 'gone']);
  });
});

describe('parseSave: what resuming needs', () => {
  it('rejects an unknown current room', () => {
    expect(() => parseSave(game(), state({ room: 'gone' }))).toThrow(/^state\.room: unknown current room "gone"$/);
  });
  it('rejects an unknown active player, among the game players or the lone hero', () => {
    expect(() => parseSave(game(), state({ active: 'zed' }))).toThrow(/^state\.active: unknown active player "zed"$/);
    expect(parseSave(game(), state({ active: 'bea' }), quiet).active).toBe('bea');
    expect(parseSave(mini(), state({ active: 'hero' }), quiet).active).toBe('hero');
    expect(() => parseSave(mini(), state({ active: 'bea' }))).toThrow(/unknown active player "bea"/);
  });
});

describe('parseSave: stale content is pruned with one warning', () => {
  const run = (g: GameDef, s: GameState) => {
    const warnings: string[] = [];
    const out = parseSave(g, s, { warn: (m) => warnings.push(m) });
    return { out, warnings };
  };

  it('warns nothing when nothing is stale', () => {
    const { out, warnings } = run(game(), state({ used: ['cle'], unlocked: ['park'], hero: { a: [1, 2] } }));
    expect(out).toEqual(state({ used: ['cle'], unlocked: ['park'], hero: { a: [1, 2] } }));
    expect(warnings).toEqual([]);
  });

  it('falls back to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    parseSave(game(), state({ inventory: ['gone'] }));
    expect(spy).toHaveBeenCalledWith('save adjusted after a content update: state.inventory "gone"');
    spy.mockClear();
    parseSave(game(), state());
    expect(spy).not.toHaveBeenCalled();
  });

  it('prunes items, used items, places, hero positions and visits', () => {
    const { out, warnings } = run(
      game(),
      state({
        inventory: ['cle', 'gone'],
        used: ['old', 'badge'],
        unlocked: ['park', 'zoo'],
        hero: { a: [1, 2], nowhere: [3, 4] },
        visited: { b: 1, nowhere: 2 },
      }),
    );
    expect(out).toEqual(
      state({ inventory: ['cle'], used: ['badge'], unlocked: ['park'], hero: { a: [1, 2] }, visited: { b: 1 } }),
    );
    expect(warnings).toEqual([
      'save adjusted after a content update: state.inventory "gone", state.used "old", state.unlocked "zoo", state.hero "nowhere", state.visited "nowhere"',
    ]);
  });

  it('drops every unlocked place when the game has no map', () => {
    const { out, warnings } = run(mini(), state({ unlocked: ['park'] }));
    expect(out.unlocked).toEqual([]);
    expect(warnings[0]).toBe('save adjusted after a content update: state.unlocked "park"');
  });

  it('sends a character in a stale room home, or forgets it', () => {
    const { out, warnings } = run(
      game(),
      state({ where: { uncle: 'nowhere', ann: 'nowhere2', bea: 'a', ghost: 'a', hero: 'nowhere3' } }),
    );
    expect(out.where).toEqual({ uncle: 'b', bea: 'a' });
    expect(warnings).toEqual([
      'save adjusted after a content update: state.where room "nowhere", state.where room "nowhere2", state.where character "ghost", state.where room "nowhere3"',
    ]);
  });

  it('repairs or forgets the other players', () => {
    const { out, warnings } = run(
      game(),
      state({
        players: {
          bea: { room: 'nowhere', inventory: ['cle', 'gone'], hero: { a: [1, 1], x: [2, 2] }, used: ['old'] },
          ann: { room: 'nowhere', inventory: [], hero: {} },
          zed: { room: 'a', inventory: [], hero: {} },
          hero: { room: 'b', inventory: ['badge'], hero: {} },
        },
      }),
    );
    expect(out.players).toEqual({
      bea: { room: 'b', inventory: ['cle'], hero: { a: [1, 1] }, used: [] },
      hero: { room: 'b', inventory: ['badge'], hero: {} },
    });
    expect(warnings).toEqual([
      'save adjusted after a content update: state.players.bea.room "nowhere", state.players.bea.inventory "gone", state.players.bea.used "old", state.players.bea.hero "x", state.players.ann.room "nowhere", state.players "zed"',
    ]);
  });

  it('sends a player without a start of its own to the game start room', () => {
    const g = game();
    g.players = { ids: ['hero', 'bea'] };
    const { out } = run(g, state({ players: { bea: { room: 'nowhere', inventory: [], hero: {} } } }));
    expect(out.players).toEqual({ bea: { room: 'a', inventory: [], hero: {} } });
  });

  it('keeps only prop states the content still has', () => {
    const { out, warnings } = run(
      game(),
      state({
        props: {
          'a.valise': 'open',
          'a.valise2': 'open',
          'a.lamp': 'on',
          'nowhere.valise': 'open',
          valise: 'open',
          '.valise': 'open',
          'a.valise.x': 'open',
        },
      }),
    );
    expect(out.props).toEqual({ 'a.valise': 'open' });
    expect(warnings[0]).toBe(
      'save adjusted after a content update: state.props "a.valise2", state.props "a.lamp", state.props "nowhere.valise", state.props "valise", state.props ".valise", state.props "a.valise.x"',
    );
  });

  it('drops a prop state that its prop no longer has', () => {
    const { out } = run(game(), state({ props: { 'a.valise': 'shut' } }));
    expect(out.props).toEqual({});
  });

  it('keeps actor overrides of room actors and props only', () => {
    const { out, warnings } = run(
      game(),
      state({
        actors: {
          'a.uncle': { x: 1 },
          'a.valise': { visible: false },
          'a.nobody': { x: 2 },
          'nowhere.uncle': { x: 3 },
          uncle: { x: 4 },
          '.uncle': { x: 5 },
        },
      }),
    );
    expect(out.actors).toEqual({ 'a.uncle': { x: 1 }, 'a.valise': { visible: false } });
    expect(warnings[0]).toBe(
      'save adjusted after a content update: state.actors "a.nobody", state.actors "nowhere.uncle", state.actors "uncle", state.actors ".uncle"',
    );
  });

  it('keeps script positions the scripts still have', () => {
    const { out, warnings } = run(
      game(),
      state({
        scripts: {
          clock: { pc: 1, step: 'clock.b' },
          drip: { pc: 1 },
          ghost: { pc: 0 },
        },
      }),
    );
    expect(out.scripts).toEqual({ clock: { pc: 1, step: 'clock.b' }, drip: { pc: 1 } });
    expect(warnings[0]).toBe('save adjusted after a content update: state.scripts "ghost"');
  });

  it('drops a script at an unknown step, or past its end', () => {
    const { out, warnings } = run(game(), state({ scripts: { clock: { pc: 0, step: 'clock.z' }, drip: { pc: 2 } } }));
    expect(out.scripts).toEqual({});
    expect(warnings[0]).toBe('save adjusted after a content update: state.scripts "clock", state.scripts "drip"');
  });

  it('keeps a step id of a script with no step ids, and a pc at its end', () => {
    const { out, warnings } = run(game(), state({ scripts: { drip: { pc: 5, step: 'any' }, clock: { pc: 2 } } }));
    expect(out.scripts).toEqual({ drip: { pc: 5, step: 'any' }, clock: { pc: 2 } });
    expect(warnings).toEqual([]);
  });

  it('reads scripts of a game with no global ones', () => {
    const g = game();
    delete g.scripts;
    delete g.rooms[1]!.scripts;
    const { out } = run(g, state({ scripts: { clock: { pc: 0 } } }));
    expect(out.scripts).toEqual({});
  });
});

describe('parseSlot', () => {
  it('has a stored-record schema: meta and a v3 envelope, nothing else', () => {
    const g = game();
    const record = { meta: { at: 1, room: 'a', roomName: 'A', v: 1 }, envelope: saveEnvelope(g, state()) };
    expect(SlotRecordSchema.parse(record)).toEqual(record);
    expect(() => SlotRecordSchema.parse({ ...record, state: state() })).toThrow();
    expect(() => SlotRecordSchema.parse({ meta: record.meta, envelope: state() })).toThrow();
  });
  it('rejects what is not a slot', () => {
    expect(() => parseSlot(game(), null)).toThrow(/^not a save slot$/);
    expect(() => parseSlot(game(), 3)).toThrow(/^not a save slot$/);
    expect(() => parseSlot(game(), { state: state() })).toThrow(/^not a save slot$/);
  });
  it('reads a v3 slot, its meta rebuilt from the state', () => {
    const g = game();
    const slot = { meta: { at: 42, room: 'b', roomName: 'Room A', v: 9 }, envelope: saveEnvelope(g, state()) };
    expect(parseSlot(g, slot, quiet)).toEqual({
      meta: { at: 42, room: 'a', roomName: 'Room A', v: 1 },
      state: state(),
    });
  });
  it('reads a v2 slot, with defaults for a meta it lacks', () => {
    expect(parseSlot(game(), { meta: {}, state: state() }, quiet)).toEqual({
      meta: { at: 0, room: 'a', roomName: 'a', v: 1 },
      state: state(),
    });
    expect(parseSlot(game(), { meta: null, state: state() }, quiet).meta).toEqual({
      at: 0,
      room: 'a',
      roomName: 'a',
      v: 1,
    });
    expect(parseSlot(game(), { meta: { at: 'soon', roomName: 7 }, state: state() }, quiet).meta).toEqual({
      at: 0,
      room: 'a',
      roomName: '7',
      v: 1,
    });
  });
  it('keeps the revision a slot was made in, and adds none to a slot without one (ADR 0026)', () => {
    const revision = { rev: 7, fingerprint: 'f'.repeat(64) };
    expect(parseSlot(game(), { meta: { revision }, state: state() }, quiet).meta.revision).toEqual(revision);
    expect('revision' in parseSlot(game(), { meta: {}, state: state() }, quiet).meta).toBe(false);
  });
  it('passes the warning through, and rejects a slot with no state', () => {
    const warnings: string[] = [];
    parseSlot(game(), { meta: {}, state: state({ inventory: ['gone'] }) }, { warn: (m) => warnings.push(m) });
    expect(warnings).toEqual(['save adjusted after a content update: state.inventory "gone"']);
    expect(() => parseSlot(game(), { meta: {} })).toThrow();
  });
});

// Killed mutants (npm run test:mutation:core): a key without a room part is pruned even when, cut one character short,
// it names a room that has such a prop or actor ('ax' is not 'a.ax').
describe('parseSave: a prop or actor key without its room', () => {
  it('is dropped, whatever room its first letters name', () => {
    const g = game();
    g.rooms[0]!.props!.ax = { img: 'o/ax', states: { on: 'o/on' } };
    g.rooms[0]!.actors = { ...g.rooms[0]!.actors, ay: { char: 'uncle' } };
    const warn: string[] = [];
    const s = parseSave(g, state({ props: { ax: 'on', 'a.ax': 'on' }, actors: { ay: { x: 1 }, 'a.ay': { x: 2 } } }), {
      warn: (m) => warn.push(m),
    });
    expect(s.props).toEqual({ 'a.ax': 'on' });
    expect(s.actors).toEqual({ 'a.ay': { x: 2 } });
    expect(warn.join('\n')).toMatch(/state\.props.*ax/);
  });
});
