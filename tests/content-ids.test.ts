import { describe, expect, it } from 'vitest';
import {
  assignIds,
  lineIdFor,
  lineIds,
  linePathSeg,
  listenerActionId,
  renamePaths,
  ruleActionId,
  slug,
  topicActionId,
  Namer,
} from '@engine/core/content-ids';
import { Engine } from '@engine/core/engine';
import { migrate } from '@engine/core/migrate';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import { textPaths } from '@engine/tools/i18n';
import type { Cmd, GameDef, GameState } from '@engine/core/types';
import { mini, miniLayouts } from './fixtures/mini';
import { game as demo } from '../games/demo/game';
import idsMigration from '../games/demo/ids.migration.json';

describe('naming', () => {
  it('slugs are ASCII, short, cut on a word', () => {
    expect(slug('Où est la clé ?')).toBe('ou-est-la-cle');
    expect(slug('What is for dinner tonight, Grandma?')).toBe('what-is-for-dinner');
    expect(slug('!!!')).toBe('x');
  });
  it('a namer never hands out the same id twice, in order', () => {
    const n = new Namer(['a']);
    expect([n.take('a'), n.take('a'), n.take('b'), n.take('b')]).toEqual(['a-2', 'a-3', 'b', 'b-2']);
  });
  it('action ids fall back to the position without an id', () => {
    expect(ruleActionId('house', 3, { verb: 'open', a: 'door', do: [] })).toBe('rule:house/on[3]');
    expect(ruleActionId('house', 3, { id: 'house.open-door', verb: 'open', a: 'door', do: [] })).toBe(
      'rule:house.open-door',
    );
    expect(topicActionId('house', 'grandma', 1, { topic: 'Hi', do: [] })).toBe('topic:house/grandma[1]');
    expect(topicActionId('house', 'grandma', 1, { id: 'house.grandma.hi', topic: 'Hi', do: [] })).toBe(
      'topic:house.grandma.hi',
    );
    expect(listenerActionId('game', 0, { on: 'x', do: [] })).toBe('listener:game/events[0]');
  });
});

describe('assignIds', () => {
  it('is deterministic, leaves the source alone, keeps written ids', () => {
    const src = mini();
    src.rooms[0].on![0].id = 'keep.me';
    const before = JSON.stringify(src);
    const a = assignIds(src),
      b = assignIds(src);
    expect(JSON.stringify(src)).toBe(before);
    expect(JSON.stringify(a.game)).toBe(JSON.stringify(b.game));
    expect(a.game.rooms[0].on![0].id).toBe('keep.me');
    expect(a.game.rooms[0].on!.slice(1).every((r) => r.id)).toBe(true);
    expect(a.added).toBeGreaterThan(0);
  });

  it('maps the positional v2 keys of a save to the new ids, and the engine reads them back', async () => {
    const v2 = mini();
    v2.verbs.push({ id: 'talk', label: 'Talk', color: '#fff' });
    v2.rooms[0].talk = {
      uncle: [
        { topic: 'Hello', do: ['Hi.'] },
        { topic: 'The key?', do: [{ once: ['Lost it.'] }, 'No idea.'] },
      ],
    };
    const ui = new FakePresenter();
    const e = new Engine(v2, miniLayouts, ui, new MemoryStore());
    await e.newGame();
    ui.picks = [1, 2];
    await e.act({ verb: 'talk', a: 'uncle' });
    expect(e.state.seen['a.uncle.1']).toBe(1);
    const counterKey = Object.keys(e.state.counters).find((k) => k.startsWith('a:talk.uncle.1'));
    expect(counterKey).toBeDefined();
    const saved = structuredClone(e.state);

    const { game: v3, map } = assignIds(v2);
    v3.schemaVersion = 3;
    v3.saveVersion = v2.saveVersion + 1;
    v3.migrations = [{ from: v2.saveVersion, renameSeen: map.seen, renameCounter: map.counters }];
    const topicId = v3.rooms[0].talk!.uncle[1].id!;
    expect(map.seen['a.uncle.1']).toBe(`topic.${topicId}`);
    const migrated = migrate(v3, saved)!;
    expect(migrated.seen[`topic.${topicId}`]).toBe(1);
    expect(migrated.counters[map.counters[counterKey!]]).toBe(1);
    // The v3 engine finds the topic already seen and the once block already played.
    const ui2 = new FakePresenter();
    const e2 = new Engine(v3, miniLayouts, ui2, new MemoryStore());
    await e2.load(migrated);
    ui2.picks = [1, 2];
    await e2.act({ verb: 'talk', a: 'uncle' });
    expect(ui2.log.join('\n')).not.toContain('Lost it.');
  });

  it('maps every translation path of a v2 table onto the v3 paths', () => {
    const v2 = mini();
    v2.rooms[0].on![0].do.push({
      choice: [
        { text: 'Yes', do: ['Yes.'] },
        { text: 'No', do: [] },
      ],
    });
    const old = Object.fromEntries(textPaths(v2).map(({ path, text }) => [path, text]));
    const { game: v3, map } = assignIds(v2);
    const renamed = renamePaths(old, map.paths);
    const now = new Set(textPaths(v3).map(({ path }) => path));
    for (const key of Object.keys(renamed)) expect(now.has(key), key).toBe(true);
    expect(Object.keys(renamed).length).toBe(Object.keys(old).length);
    expect(renamePaths({ '_stale:room:a/on[0].do[0]': 'x' }, map.paths)).toHaveProperty(
      `_stale:room:a/on.${v3.rooms[0].on![0].id}.do[0]`,
    );
  });
});

describe('the sample game on schema 3', () => {
  it('declares schema 3 and its migration follows the ids for a v1 save', async () => {
    expect(demo.schemaVersion).toBe(3);
    expect(demo.saveVersion).toBe(2);
    // A v1 save: the keys this content had before the ids (the inverse of the generated migration).
    const back = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([a, b]) => [b, a]));
    const seenBack = back(idsMigration.renameSeen),
      counterBack = back(idsMigration.renameCounter);
    const v1: GameState = {
      v: 1,
      room: 'house',
      inventory: [],
      flags: {},
      props: {},
      actors: {},
      hero: {},
      unlocked: [],
      visited: {},
      counters: {},
      seen: {},
      started: 1,
    };
    const topicNew = Object.keys(idsMigration.renameSeen).map(
      (k) => idsMigration.renameSeen[k as keyof typeof idsMigration.renameSeen],
    )[0];
    const counterNew = Object.values(idsMigration.renameCounter)[0];
    v1.seen[seenBack[topicNew]] = 1;
    v1.counters[counterBack[counterNew]] = 3;
    const m = migrate(demo as GameDef, v1)!;
    expect(m.v).toBe(2);
    expect(m.seen[topicNew]).toBe(1);
    expect(m.counters[counterNew]).toBe(3);
  });
});

describe('line ids', () => {
  const game = (): GameDef => {
    const g = mini();
    g.rooms[0].on = [
      {
        id: 'r.open-door',
        verb: 'open',
        a: 'door',
        do: [
          'Locked.',
          { say: ['hero', 'Really locked.'] },
          { toast: 'Try the key' },
          { cutscene: [{ say: ['hero', 'Inside.'] }] },
        ],
      },
    ];
    return g;
  };
  it('names a line by its owner and its text, keeps written ids, converts plain strings only with `all`', () => {
    const a = assignIds(game(), { lines: true });
    const rule = a.game.rooms[0].on![0];
    expect(rule.do[0]).toBe('Locked.');
    expect(rule.do[1]).toMatchObject({ id: 'r.open-door.l-really-locked' });
    expect(rule.do[2]).toMatchObject({ id: 'r.open-door.l-try-the-key' });
    expect((rule.do[3] as { cutscene: Cmd[] }).cutscene[0]).toMatchObject({ id: 'r.open-door.l-inside' });
    expect(lineIdFor('x', 'Hello, world! How are you today?')).toBe('x.l-hello-world-how');
    const all = assignIds(game(), { lines: 'all' });
    expect(all.game.rooms[0].on![0].do[0]).toEqual({ say: ['hero', 'Locked.'], id: 'r.open-door.l-locked' });
    // the plain line's translation was keyed by its position; as a say object it lives under `.say` (3.2.1)
    expect(renamePaths({ 'room:a/on.r.open-door.do[0]': 'Fermé.' }, all.map.paths)).toEqual({
      'room:a/on.r.open-door.do.r.open-door.l-locked.say': 'Fermé.',
    });
    const again = assignIds(a.game, { lines: true });
    expect(again.added).toBe(0);
    expect(lineIds(a.game).map((l) => l.id)).toEqual([
      'r.open-door.l-really-locked',
      'r.open-door.l-try-the-key',
      'r.open-door.l-inside',
    ]);
  });
  it('maps the translation paths from the current ones (a second pass on a schema-3 game), and an insertion keeps them', () => {
    const a = assignIds(game(), { lines: true });
    expect(a.map.paths['room:a/on.r.open-door.do[1]']).toBe('room:a/on.r.open-door.do.r.open-door.l-really-locked');
    expect(a.map.paths['room:a/on.r.open-door.do[3].cutscene[0]']).toBe(
      'room:a/on.r.open-door.do[3].cutscene.r.open-door.l-inside',
    );
    const paths = textPaths(a.game).map((p) => p.path);
    expect(paths).toContain('room:a/on.r.open-door.do.r.open-door.l-really-locked.say');
    expect(paths).toContain('room:a/on.r.open-door.do.r.open-door.l-try-the-key.toast');
    // A line inserted before the others: the ids, and so the paths of the existing lines, do not move.
    const g2 = structuredClone(a.game);
    g2.rooms[0].on![0].do.unshift({ say: ['hero', 'Hmm.'] });
    const b = assignIds(g2, { lines: true });
    expect(textPaths(b.game).map((p) => p.path)).toContain('room:a/on.r.open-door.do.r.open-door.l-really-locked.say');
    expect(linePathSeg(0, 'plain')).toBe('[0]');
  });
});
