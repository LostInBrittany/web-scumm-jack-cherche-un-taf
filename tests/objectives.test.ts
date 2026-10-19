// Objectives (4.1.12, ADR 0014): checked by the validator (`done` can hold, `parent` exists and makes no cycle),
// completed by the engine once (`objectiveCompleted` in the semantic journal, after the action that makes `done` hold,
// never again, never for what already held when a game was loaded), reached by the solver's 100% goal, the same on a
// replay, and declared by the bundled games.
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import type { SemanticEvent } from '@engine/core/journal';
import { completionGoal } from '@engine/core/objectives';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import type { GameDef, Session } from '@engine/core/types';
import { replay } from '@engine/tools/replay';
import { solve } from '@engine/tools/solve';
import { validate } from '@engine/tools/validate';
import { game as demo } from '../games/demo/game';
import { game as reference } from '../games/reference/game';
import { quest, questLayouts } from './fixtures/objectives';

const completed = (es: SemanticEvent[]) =>
  es.filter((e) => e.kind === 'objectiveCompleted').map((e) => (e as { objective: string }).objective);
const engine = (g: GameDef = quest()) => new Engine(g, questLayouts, new FakePresenter(), new MemoryStore());

describe('the validator reads objectives', () => {
  const errs = (g: GameDef) => validate(g, questLayouts).errors.filter((e) => e.startsWith('objectives'));

  it('passes the fixture and the bundled games', () => {
    expect(errs(quest())).toEqual([]);
    for (const g of [demo, reference])
      expect(validate(g, {}).errors.filter((e) => e.startsWith('objectives'))).toEqual([]);
  });

  it('refuses a parent that does not exist, a cycle, an empty title, a bad id', () => {
    const g = quest();
    g.objectives!.bell!.parent = 'nowhere';
    g.objectives!.escape!.parent = 'key';
    g.objectives!.chest!.title = '';
    g.objectives!['bad id'] = { title: 'x', done: 'out' };
    const e = errs(g);
    expect(e).toContainEqual(expect.stringMatching(/^objectives\.bell › unknown parent objective "nowhere"/));
    expect(e).toContainEqual(expect.stringMatching(/^objectives\.(escape|chest|key) › parent cycle: /));
    expect(e).toContainEqual(expect.stringMatching(/^objectives\.chest › a title is required/));
    expect(e).toContainEqual(expect.stringMatching(/^objectives\.bad id › id "bad id"/));
  });

  it('refuses a `done` that can never hold, and names why', () => {
    const g = quest();
    g.objectives!.chest!.done = { all: ['chest_open', 'never_set_anywhere'] };
    g.objectives!.key!.done = { has: 'ghost' };
    g.objectives!.bell!.done = { prop: ['hall.chest', 'gone'] };
    const e = errs(g);
    expect(e).toContainEqual(
      expect.stringMatching(/^objectives\.chest\.done › can never hold: flag "never_set_anywhere" is never set/),
    );
    expect(e).toContainEqual(expect.stringMatching(/^objectives\.key\.done › unknown item in condition: "ghost"/));
    expect(e).toContainEqual(expect.stringMatching(/^objectives\.bell\.done › /));
    // `any` holds when one branch can; `not` and `!flag` always can.
    const h = quest();
    h.objectives!.chest!.done = { any: ['chest_open', 'never_set_anywhere'] };
    h.objectives!.key!.done = { not: 'never_set_anywhere' };
    expect(errs(h)).toEqual([]);
  });
});

describe('the validator reads what an objective depends on', () => {
  const warns = (g: GameDef) => validate(g, questLayouts).warnings.filter((e) => e.startsWith('objectives'));

  it('warns when the content can take a `done` back (100 % is every objective at once)', () => {
    expect(warns(quest())).toEqual([]);
    const g = quest();
    g.rooms[0]!.on!.push({
      id: 'hall.use-key-rug',
      verb: 'use',
      a: 'key',
      b: 'rug',
      do: [{ unset: 'key_found' }, { lose: 'key' }],
    });
    g.objectives!.chest!.done = { all: ['chest_open', { has: 'key' }] };
    const w = warns(g);
    expect(w).toContainEqual(
      expect.stringMatching(/^objectives\.key\.done › flag "key_found" can be unset: .*at once/),
    );
    expect(w).toContainEqual(expect.stringMatching(/^objectives\.chest\.done › item "key" can be lost/));
    // A side objective is not part of 100 %: no warning.
    g.objectives!.bell!.done = 'key_found';
    expect(warns(g).some((x) => x.startsWith('objectives.bell'))).toBe(false);
  });

  it('a flag only a custom command without declared effects sets: the error says to declare them', () => {
    const g = quest();
    g.rooms[0]!.on!.push({ id: 'hall.use-bell-2', verb: 'use', a: 'bell', b: 'key', do: [{ custom: 'magic' }] });
    g.objectives!.bell!.done = 'magic_done';
    const e = validate(g, questLayouts, { commands: { magic: {} } }).errors.filter((x) => x.startsWith('objectives'));
    expect(e).toContainEqual(
      expect.stringMatching(
        /^objectives\.bell\.done › can never hold: flag "magic_done" is never set \(unless a custom command does it: "magic" declares no `effects`, declare the command's effects\)/,
      ),
    );
    const ok = validate(g, questLayouts, { commands: { magic: { effects: [{ set: 'magic_done' }] } } }).errors;
    expect(ok.filter((x) => x.startsWith('objectives'))).toEqual([]);
  });
});

describe('the engine completes objectives once, in the journal', () => {
  it('after the action that makes `done` hold, in declaration order, parents after their steps', async () => {
    const e = engine();
    await e.newGame();
    const from = e.journal.seq;
    await e.act({ verb: 'take', a: 'rug' });
    expect(completed(e.journal.since(from))).toEqual(['key']);
    // The event follows the flag that completed it and precedes the autosave.
    const after = e.journal.since(from).map((x) => x.kind);
    expect(after.indexOf('objectiveCompleted')).toBeGreaterThan(after.indexOf('flagChanged'));
    expect(after.at(-1)).toBe('saveMade');
    await e.act({ verb: 'use', a: 'key', b: 'chest' });
    await e.act({ verb: 'use', a: 'gate' });
    expect(completed(e.journal.since(from))).toEqual(['key', 'chest', 'escape']);
    // The last objective is said before the ending.
    const all = e.journal.since(from).map((x) => x.kind);
    expect(all.lastIndexOf('objectiveCompleted')).toBeLessThan(all.indexOf('endingReached'));
    expect([...e.objectives.completed()].sort()).toEqual(['chest', 'escape', 'key']);
  });

  it('right after the event that completes it, even inside a cutscene, before what follows', async () => {
    const e = engine();
    await e.newGame();
    const from = e.journal.seq;
    await e.script([{ cutscene: [{ set: 'rang' }, 'Ding.', { gain: 'key' }, { set: 'key_found' }, 'Found it.'] }]);
    const kinds = e.journal.since(from).map((x) => (x.kind === 'objectiveCompleted' ? `done:${x.objective}` : x.kind));
    expect(kinds).toEqual(['flagChanged', 'done:bell', 'itemAcquired', 'flagChanged', 'done:key', 'saveMade']);
  });

  it('never twice: an objective whose condition stops holding and holds again is not completed again', async () => {
    const e = engine();
    await e.newGame();
    await e.act({ verb: 'use', a: 'bell' });
    await e.script([{ unset: 'rang' }]);
    await e.act({ verb: 'use', a: 'bell' });
    expect(completed(e.journal.since(0))).toEqual(['bell']);
  });

  it('what already holds when a game starts or loads is done, silently', async () => {
    const e = engine();
    await e.newGame();
    await e.act({ verb: 'take', a: 'rug' });
    const saved = structuredClone(e.state);
    const f = engine();
    await f.load(saved);
    expect(completed(f.journal.since(0))).toEqual([]);
    expect([...f.objectives.completed()]).toEqual(['key']);
    await f.act({ verb: 'use', a: 'key', b: 'chest' });
    expect(completed(f.journal.since(0))).toEqual(['chest']);
  });

  it('a replay yields the same objectives, at the same places', async () => {
    const e = engine();
    await e.newGame();
    for (const a of [
      { verb: 'use', a: 'bell' },
      { verb: 'take', a: 'rug' },
      { verb: 'use', a: 'key', b: 'chest' },
      { verb: 'use', a: 'gate' },
    ])
      await e.act(a);
    const live = e.journal.since(e.sessionSeq);
    const r = await replay(quest(), questLayouts, JSON.parse(JSON.stringify(e.session)) as Session);
    expect(r.divergedAt).toBeUndefined();
    expect(completed(r.journal)).toEqual(completed(live));
    expect(completed(live)).toEqual(['bell', 'key', 'chest', 'escape']);
  });

  it('a game without objectives emits none and costs nothing', async () => {
    const g = quest();
    delete g.objectives;
    const e = engine(g);
    await e.newGame();
    await e.act({ verb: 'take', a: 'rug' });
    expect(completed(e.journal.since(0))).toEqual([]);
  });
});

describe("the solver's 100% goal", () => {
  it('is every objective that is not optional', () => {
    expect(completionGoal(quest())).toEqual(['out', 'chest_open', 'key_found']);
    expect(completionGoal({ ...quest(), objectives: undefined })).toEqual([]);
  });

  it('reaches it on the fixture, and says when it cannot', async () => {
    const r = await solve(quest(), questLayouts, { goal: completionGoal(quest()), mode: 'prove' });
    expect(r.status).toBe('solved');
    const g = quest();
    g.rooms[0]!.on = g.rooms[0]!.on!.filter((x) => x.id !== 'hall.use-gate');
    const s = await solve(g, questLayouts, { goal: completionGoal(g) });
    expect(s.finished).toBe(false);
  });
});

describe('the bundled games declare objectives', () => {
  for (const [name, g] of [
    ['demo', demo],
    ['reference', reference],
  ] as const)
    it(`${name}: three to five, at least one optional, titles and parents set`, () => {
      const o = Object.entries(g.objectives ?? {});
      expect(o.length).toBeGreaterThanOrEqual(3);
      expect(o.length).toBeLessThanOrEqual(5);
      expect(o.some(([, x]) => x.optional)).toBe(true);
      expect(o.some(([, x]) => x.parent)).toBe(true);
    });
});
