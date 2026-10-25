// Every rename and drop of a migration step, and the chain that brings a save to the game's version (core/migrate.ts).
import { describe, expect, it } from 'vitest';
import { applyMigration, migrate } from '@engine/core/migrate';
import type { GameDef, GameState, Migration } from '@engine/core/types';
import { mini } from './fixtures/mini';
import { scale } from './fixtures/scale';

const bare = (over: Partial<GameState> = {}): GameState => ({
  v: 1,
  room: 'lobby',
  inventory: [],
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

const rich = (): GameState =>
  bare({
    room: 'lobby',
    inventory: ['cle', 'gone', 'pen'],
    used: ['cle', 'gone'],
    flags: { found: true, tmp: 1, keep: 'x' },
    props: { 'lobby.door': 'open', 'yard.well': 'full', loose: 'a' },
    actors: { 'lobby.ann': { x: 1 }, 'yard.bob': { visible: false } },
    hero: { lobby: [1, 2], yard: [3, 4] },
    visited: { lobby: 1, yard: 2 },
    unlocked: ['old-park', 'zoo'],
    counters: { c1: 1, c2: 2, c3: 3 },
    seen: { s1: 1, s2: 1, s3: 1 },
    where: { annie: 'lobby', bob: 'yard' },
    scripts: { sc1: { pc: 1, step: 'sc1.a' }, sc2: { pc: 0 }, sc3: { pc: 2, step: 'sc3.x' }, dead: { pc: 0 } },
    active: 'laverne',
    players: { laverne: { room: 'lobby', inventory: [], hero: {} }, hoagie: { room: 'yard', inventory: [], hero: {} } },
  });

describe('applyMigration', () => {
  it('applies every rename and drop of a step, and sets the version', () => {
    const m: Migration = {
      from: 4,
      renameFlag: { found: 'key_found' },
      dropFlag: ['tmp'],
      renameItem: { cle: 'key' },
      dropItem: ['gone'],
      renameRoom: { lobby: 'hall' },
      renameProp: { 'yard.well': 'yard.fountain' },
      renameActor: { 'yard.bob': 'yard.robert' },
      renamePlace: { 'old-park': 'park' },
      renameCounter: { c1: 'k1' },
      dropCounter: ['c2'],
      renameSeen: { s1: 't1' },
      dropSeen: ['s2'],
      renameScript: { sc1: 'intro' },
      dropScript: ['dead'],
      renameScriptStep: { intro: { 'sc1.a': 'intro.a' }, sc3: { other: 'y' } },
      renameCharacter: { annie: 'ann' },
      renamePlayer: { laverne: 'verne' },
    };
    const s = rich();
    expect(applyMigration(s, m)).toBe(s);
    expect(s).toEqual(
      bare({
        v: 5,
        room: 'hall',
        inventory: ['key', 'pen'],
        used: ['key'],
        flags: { key_found: true, keep: 'x' },
        props: { 'hall.door': 'open', 'yard.fountain': 'full', loose: 'a' },
        actors: { 'hall.ann': { x: 1 }, 'yard.robert': { visible: false } },
        hero: { hall: [1, 2], yard: [3, 4] },
        visited: { hall: 1, yard: 2 },
        unlocked: ['park', 'zoo'],
        counters: { k1: 1, c3: 3 },
        seen: { t1: 1, s3: 1 },
        where: { ann: 'hall', bob: 'yard' },
        scripts: { intro: { pc: 1, step: 'intro.a' }, sc2: { pc: 0 }, sc3: { pc: 2, step: 'sc3.x' } },
        active: 'verne',
        players: {
          verne: { room: 'lobby', inventory: [], hero: {} },
          hoagie: { room: 'yard', inventory: [], hero: {} },
        },
      }),
    );
  });

  it('leaves everything as it is for an empty step, but the version', () => {
    const s = rich();
    const before = structuredClone(s);
    applyMigration(s, { from: 7 });
    expect(s).toEqual({ ...before, v: 8 });
  });

  it('copes with a save without the optional fields', () => {
    const s = bare({ room: 'lobby', inventory: ['cle'] });
    delete (s as Partial<GameState>).unlocked;
    delete (s as Partial<GameState>).inventory;
    applyMigration(s, {
      from: 1,
      renameItem: { cle: 'key' },
      renameRoom: { other: 'x' },
      renameScript: { a: 'b' },
      renameCharacter: { a: 'b' },
      renamePlayer: { a: 'b' },
    });
    expect(s).toEqual(bare({ v: 2, room: 'lobby', inventory: [], unlocked: [] }));
    expect('used' in s).toBe(false);
    expect('where' in s).toBe(false);
    expect('scripts' in s).toBe(false);
    expect('players' in s).toBe(false);
    expect('active' in s).toBe(true);
    expect(s.active).toBeUndefined();
  });

  it('renames the characters in where only when the step says so', () => {
    const s = bare({ where: { annie: 'lobby' } });
    applyMigration(s, { from: 1, renameRoom: { lobby: 'hall' } });
    expect(s.where).toEqual({ annie: 'hall' });
    applyMigration(s, { from: 2, renameCharacter: { annie: 'ann' } });
    expect(s.where).toEqual({ ann: 'hall' });
  });

  it('keeps an active player the step does not rename, and players without an active one', () => {
    const s = bare({ active: 'hoagie', players: { laverne: { room: 'a', inventory: [], hero: {} } } });
    applyMigration(s, { from: 1, renamePlayer: { laverne: 'verne' } });
    expect(s.active).toBe('hoagie');
    expect(Object.keys(s.players!)).toEqual(['verne']);
    const t = bare({ players: { laverne: { room: 'a', inventory: [], hero: {} } } });
    applyMigration(t, { from: 1, renamePlayer: { laverne: 'verne' } });
    expect(t.active).toBeUndefined();
    expect(Object.keys(t.players!)).toEqual(['verne']);
  });

  it('keeps script steps the step map does not know', () => {
    const s = bare({ scripts: { a: { pc: 1, step: 'a.x' }, b: { pc: 1, step: 'b.x' } } });
    applyMigration(s, { from: 1, renameScriptStep: { a: { 'a.y': 'a.z' } } });
    expect(s.scripts).toEqual({ a: { pc: 1, step: 'a.x' }, b: { pc: 1, step: 'b.x' } });
  });
});

describe('migrate', () => {
  const game = (saveVersion: number, migrations?: Migration[]): GameDef => ({ ...mini(), saveVersion, migrations });

  it('is null for no save', () => {
    expect(migrate(mini(), null)).toBeNull();
  });

  it('returns the very save when it is already at the game version', () => {
    const s = bare({ v: 1 });
    expect(migrate(game(1), s)).toBe(s);
  });

  it('chains the steps on a copy, and never touches the input', () => {
    const s = bare({ v: 1, room: 'lobby', flags: { found: true, tmp: 1 }, inventory: ['cle'] });
    const out = migrate(scale(), s);
    expect(out).not.toBe(s);
    expect(out).toEqual(bare({ v: 3, room: 'hall', flags: { key_found: true }, inventory: ['key'] }));
    expect(s.v).toBe(1);
    expect(s.flags).toEqual({ found: true, tmp: 1 });
  });

  it('is null when a step is missing, or the game has no migrations', () => {
    expect(migrate(game(3, [{ from: 1 }]), bare({ v: 1 }))).toBeNull();
    expect(migrate(game(3), bare({ v: 1 }))).toBeNull();
    expect(migrate(game(3, [{ from: 2 }]), bare({ v: 1 }))).toBeNull();
  });

  it('is null for a save newer than the game', () => {
    expect(migrate(game(1, [{ from: 1 }]), bare({ v: 2 }))).toBeNull();
  });

  it('follows at most 1000 steps', () => {
    const steps = Array.from({ length: 1001 }, (_, i) => ({ from: i + 1 }));
    expect(migrate(game(1001, steps), bare({ v: 1 }))?.v).toBe(1001);
    expect(migrate(game(1002, steps), bare({ v: 1 }))).toBeNull();
  });

  it('gives up on a chain that runs past the game version', () => {
    // From a save newer than the game, steps that keep going never land on it.
    const steps = Array.from({ length: 1001 }, (_, i) => ({ from: i + 2 }));
    expect(migrate(game(1, steps), bare({ v: 2 }))).toBeNull();
  });
});

// Killed mutant (npm run test:mutation:core): renaming a room renames the room part of `room.prop` keys only; a key
// without a dot is left as it is, even when its first letters name the room.
describe('applyMigration: room renames and undotted keys', () => {
  it('leaves a key without a room part alone', async () => {
    const { applyMigration } = await import('@engine/core/migrate');
    const s = {
      v: 1,
      room: 'lobby',
      inventory: [],
      flags: {},
      props: { lobbyx: 'on', 'lobby.door': 'open' },
      actors: {},
      hero: {},
      unlocked: [],
      visited: {},
      counters: {},
      seen: {},
      started: 0,
    } as never;
    const out = applyMigration(s, { from: 1, renameRoom: { lobby: 'hall' } }) as { props: Record<string, string> };
    expect(out.props).toEqual({ lobbyx: 'on', 'hall.door': 'open' });
  });
});

// Killed mutants (4.3.0 reread of the exemptions): a rename map's keys are old ids, never checked, so one may be the
// text "undefined". A save with no script step or no active player keeps it absent: the map is not read with an
// undefined id (which would find that key).
describe('applyMigration: an absent step or active player is not renamed', () => {
  it('leaves a script with no step without one, whatever the step map holds', () => {
    const out = applyMigration(bare({ scripts: { s: { pc: 0 } } }), {
      from: 1,
      renameScriptStep: { s: { undefined: 'b' } },
    });
    expect(out.scripts?.s?.step).toBeUndefined();
  });
  it('leaves a save with no active player without one, whatever the player map holds', () => {
    const out = applyMigration(bare(), { from: 1, renamePlayer: { undefined: 'p2' } });
    expect(out.active).toBeUndefined();
  });
});
