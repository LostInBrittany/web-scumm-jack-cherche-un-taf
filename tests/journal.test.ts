// The semantic journal (4.1.11 "Viewport", ADR 0011): what happened in the game, in ids, sequenced by the core and
// emitted by the command handlers and the engine's lifecycle only, never by a painter. Each kind, its order, a
// contiguous sequence, an unknown kind refused, and the property the speedrun splits and the replay tool rely on:
// replaying a session yields the same journal, on the sample game, the reference chapter and 200 generated games.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import { Journal, journalDiff, SEMANTIC_KINDS, type SemanticEvent } from '@engine/core/journal';
import type { Action, GameDef, Layout, Session } from '@engine/core/types';
import { parseSessionFile, replay, sessionFile } from '@engine/tools/replay';
import { solve } from '@engine/tools/solve';
import { game as demo } from '../games/demo/game';
import { commands } from '../games/demo/index';
import { game as reference } from '../games/reference/game';
import house from '../games/demo/layout/house.json';
import garden from '../games/demo/layout/garden.json';
import market from '../games/demo/layout/market.json';
import { randomGame } from './gen/random-game';

const demoLayouts: Record<string, Layout> = {
  house: house as unknown as Layout,
  garden: garden as unknown as Layout,
  market: market as unknown as Layout,
};
const refDir = 'games/reference/layout';
const refLayouts: Record<string, Layout> = Object.fromEntries(
  readdirSync(refDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(`${refDir}/${f}`, 'utf8'))]),
);
const tick = () => new Promise((r) => setTimeout(r, 0));
const kinds = (es: SemanticEvent[]) => es.map((e) => e.kind);

describe('the journal itself', () => {
  it('numbers its events from 1, contiguously, and gives back those after a sequence', () => {
    const j = new Journal();
    expect(j.seq).toBe(0);
    j.emit({ kind: 'sessionStarted', session: 'new' });
    j.emit({ kind: 'roomEntered', room: 'a' });
    j.emit({ kind: 'itemAcquired', item: 'key' });
    expect(j.seq).toBe(3);
    expect(j.since(0).map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(j.since(1)).toEqual([
      { seq: 2, kind: 'roomEntered', room: 'a' },
      { seq: 3, kind: 'itemAcquired', item: 'key' },
    ]);
    expect(j.since(3)).toEqual([]);
  });

  it('tells its subscribers in order, and an unsubscribed one no more', () => {
    const j = new Journal();
    const seen: number[] = [];
    const off = j.subscribe((e) => seen.push(e.seq));
    j.emit({ kind: 'flagChanged', flag: 'f', value: true });
    off();
    j.emit({ kind: 'flagChanged', flag: 'f', value: false });
    expect(seen).toEqual([1]);
  });

  it('refuses a kind it does not know: a menu opened is not a semantic event (the presenter has its own)', () => {
    const j = new Journal();
    expect(() => j.emit({ kind: 'menuOpened' } as never)).toThrow(/unknown semantic event/);
    expect(j.seq).toBe(0);
    expect(SEMANTIC_KINDS).not.toContain('menuOpened');
  });

  it('keeps a bounded window: the oldest events go first, the sequence goes on', () => {
    const j = new Journal(4);
    for (let i = 0; i < 10; i++) j.emit({ kind: 'flagChanged', flag: `f${i}`, value: i });
    expect(j.seq).toBe(10);
    expect(j.since(0).map((e) => e.seq)).toEqual([7, 8, 9, 10]);
    expect(j.first).toBe(7);
  });

  it('a save is journalled only when something semantic happened since the last one', () => {
    const j = new Journal();
    j.saved();
    expect(j.seq).toBe(0);
    j.emit({ kind: 'itemAcquired', item: 'x' });
    j.saved();
    j.saved();
    expect(kinds(j.since(0))).toEqual(['itemAcquired', 'saveMade']);
  });

  it('journalDiff ignores the sequence numbers and points at the first difference', () => {
    const a: SemanticEvent[] = [
      { seq: 5, kind: 'roomEntered', room: 'a' },
      { seq: 6, kind: 'itemAcquired', item: 'k' },
    ];
    const b: SemanticEvent[] = [
      { seq: 1, kind: 'roomEntered', room: 'a' },
      { seq: 2, kind: 'itemAcquired', item: 'k' },
    ];
    expect(journalDiff(a, b)).toBe(-1);
    expect(journalDiff(a, [b[0]!])).toBe(1);
    expect(journalDiff(a, [b[0]!, { seq: 2, kind: 'itemLost', item: 'k' }])).toBe(1);
  });
});

describe('what the engine journals', () => {
  async function boot() {
    const ui = new FakePresenter();
    const e = new Engine(structuredClone(demo), demoLayouts, ui, new MemoryStore(), { commands });
    e.random = () => 0;
    await e.checkpoint('garden');
    return e;
  }

  it('a new session, then the room entered', async () => {
    const e = await boot();
    expect(e.journal.since(0)).toEqual([
      { seq: 1, kind: 'sessionStarted', session: 'checkpoint:garden' },
      { seq: 2, kind: 'roomEntered', room: 'garden' },
    ]);
    expect(e.sessionSeq).toBe(0);
  });

  it('items, flags (only when they change), rooms with where from, and the autosave that follows', async () => {
    const e = await boot();
    const s0 = e.journal.seq;
    await e.script([
      { gain: 'zz_test_item' },
      { gain: 'zz_test_item' },
      { set: 'zz_flag' },
      { set: 'zz_flag' },
      { inc: 'zz_count' },
      { unset: 'zz_flag' },
      { lose: 'zz_test_item' },
      { lose: 'zz_test_item' },
      { goto: 'house' },
    ]);
    expect(e.journal.since(s0).map(({ seq: _, ...x }) => x)).toEqual([
      { kind: 'itemAcquired', item: 'zz_test_item' },
      { kind: 'flagChanged', flag: 'zz_flag', value: true },
      { kind: 'flagChanged', flag: 'zz_count', value: 1 },
      { kind: 'flagChanged', flag: 'zz_flag', value: null }, // removed: not the same as set to false
      { kind: 'itemLost', item: 'zz_test_item' },
      { kind: 'roomEntered', room: 'house', from: 'garden' },
      { kind: 'saveMade' },
    ]);
  });

  it('set to false and unset are two events: false, then null', async () => {
    const e = await boot();
    const s0 = e.journal.seq;
    await e.script([{ set: ['zz_f', true] }, { set: ['zz_f', false] }, { unset: 'zz_f' }]);
    expect(e.journal.since(s0).flatMap((x) => (x.kind === 'flagChanged' ? [x.value] : []))).toEqual([
      true,
      false,
      null,
    ]);
  });

  it('an item handed to another player: lost by one, acquired by the other; a switch of player is journalled', async () => {
    const e = await boot();
    const [other] = e.playerIds().filter((p) => p !== e.heroId());
    expect(other).toBeTruthy();
    const me = e.heroId();
    const s0 = e.journal.seq;
    await e.script([{ gain: 'zz_gift' }, { transfer: ['zz_gift', other!] }]);
    await e.switchTo(other!);
    expect(e.journal.since(s0).map(({ seq: _, ...x }) => x)).toEqual(
      expect.arrayContaining([
        { kind: 'itemLost', item: 'zz_gift', player: me },
        { kind: 'itemAcquired', item: 'zz_gift', player: other },
        { kind: 'playerSwitched', player: other },
      ]),
    );
  });

  it('a load: the load, a new session, the room; the session starts at the load', async () => {
    const e = await boot();
    const before = e.journal.seq;
    await e.load(structuredClone(e.state));
    expect(e.sessionSeq).toBe(before);
    expect(kinds(e.journal.since(e.sessionSeq))).toEqual(['loadMade', 'sessionStarted', 'roomEntered']);
  });

  it('the ending', async () => {
    const e = await boot();
    const s0 = e.journal.seq;
    await e.script([{ end: true }]);
    expect(e.journal.since(s0).map(({ seq: _, ...x }) => x)).toEqual([
      { kind: 'endingReached', ending: 'end' },
      { kind: 'saveMade' },
    ]);
  });

  it('the sequence is contiguous over a whole game', async () => {
    const r = await solve(structuredClone(demo), demoLayouts, { maxStates: 20000, commands });
    const p = await replay(demo, demoLayouts, { start: { kind: 'new' }, log: r.steps }, { commands });
    expect(p.journal.map((x) => x.seq)).toEqual(p.journal.map((_, i) => i + 1));
    expect(p.journal.at(-2)).toMatchObject({ kind: 'endingReached', ending: 'sealed' });
    for (const x of p.journal) expect(SEMANTIC_KINDS).toContain(x.kind);
  });
});

/** Plays `picks` as actions on a live engine (as tests/properties.test.ts does): a verb, a target, maybe an item. */
async function play(game: GameDef, layouts: Record<string, Layout>, picks: number[]) {
  const ui = new FakePresenter();
  const e = new Engine(structuredClone(game), layouts, ui, new MemoryStore());
  e.digestOn = true;
  let d = 0;
  e.random = () => [0.1, 0.6, 0.35][d++ % 3]!;
  ui.picks = picks.map((p) => p % 3);
  await e.newGame();
  for (const p of picks) {
    if (e.state.done) break;
    const targets = e.targets();
    const verbs = e.game.verbs.map((v) => v.id);
    const items = e.state.inventory;
    if (!targets.length) break;
    const verb = verbs[p % verbs.length]!;
    const a = targets[Math.floor(p / verbs.length) % targets.length]!;
    const act: Action = items.length && p % 4 === 0 ? { verb, a: items[p % items.length]!, b: a } : { verb, a };
    await e.act(act);
  }
  return e;
}

describe('replay(session) yields the same journal', () => {
  it('the sample game, recorded live (the tutorial, a conversation, a random line)', async () => {
    const ui = new FakePresenter();
    const e = new Engine(structuredClone(demo), demoLayouts, ui, new MemoryStore(), { commands });
    e.digestOn = true;
    e.random = () => 0.7;
    ui.picks = [1];
    const p = e.newGame();
    await tick();
    await e.act({ verb: 'look', a: 'pantry' });
    await tick();
    ui.picks = [0];
    await e.act({ verb: 'talk', a: 'grandma' });
    await tick();
    await e.act({ verb: 'take', a: 'shell' });
    await p;
    await e.act({ verb: 'open', a: 'armchair' });
    await e.act({ verb: 'use', a: 'shell_phone', b: 'armchair' });
    await e.act({ verb: 'open', a: 'window' });
    const live = e.journal.since(e.sessionSeq);
    expect(kinds(live)).toContain('itemAcquired');
    const r = await replay(demo, demoLayouts, JSON.parse(JSON.stringify(e.session)) as Session, { commands });
    expect(r.divergedAt).toBeUndefined();
    expect(journalDiff(live, r.journal)).toBe(-1);
  });

  it('the sample game, from New Game to the sealed ending (the solver route, recorded, replayed)', async () => {
    const s = await solve(structuredClone(demo), demoLayouts, { maxStates: 20000, commands });
    const a = await replay(demo, demoLayouts, { start: { kind: 'new' }, log: s.steps }, { commands });
    const b = await replay(demo, demoLayouts, JSON.parse(JSON.stringify(a.session)) as Session, { commands });
    expect(b.divergedAt).toBeUndefined();
    expect(journalDiff(a.journal, b.journal)).toBe(-1);
    expect(kinds(a.journal)).toContain('endingReached');
  });

  it('the reference chapter, to its ending', async () => {
    const s = await solve(structuredClone(reference), refLayouts, { maxStates: 200000 });
    expect(s.finished).toBe(true);
    const a = await replay(reference, refLayouts, { start: { kind: 'new' }, log: s.steps });
    const b = await replay(reference, refLayouts, JSON.parse(JSON.stringify(a.session)) as Session);
    expect(b.divergedAt).toBeUndefined();
    expect(journalDiff(a.journal, b.journal)).toBe(-1);
    expect(new Set(kinds(a.journal))).toEqual(
      new Set([
        'sessionStarted',
        'roomEntered',
        'itemAcquired',
        'itemLost',
        'flagChanged',
        'playerSwitched',
        'objectiveCompleted',
        'saveMade',
        'endingReached',
      ]),
    );
  }, 120000);

  it('200 generated games played at random, live then replayed', async () => {
    let events = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { game, layouts } = randomGame(seed);
      const picks = [...Array(10)].map((_, i) => (seed * 7919 + i * 104729) % 500);
      const e = await play(game, layouts, picks);
      const live = e.journal.since(e.sessionSeq);
      events += live.length;
      const r = await replay(game, layouts, JSON.parse(JSON.stringify(e.session)) as Session);
      expect(r.divergedAt, `seed ${seed}`).toBeUndefined();
      expect(journalDiff(live, r.journal), `seed ${seed}`).toBe(-1);
    }
    expect(events).toBeGreaterThan(200 * 3);
  }, 120000);
});

describe('the session file carries the journal, and the replay tool compares it', () => {
  it('exported, parsed back, equal to its replay; a tampered one differs', async () => {
    const ui = new FakePresenter();
    const e = new Engine(structuredClone(demo), demoLayouts, ui, new MemoryStore(), { commands });
    e.random = () => 0;
    await e.checkpoint('garden');
    await e.act({ verb: 'look', a: 'tank' });
    const f = parseSessionFile(JSON.stringify(sessionFile(demo.id, e)));
    expect(f.journal?.length).toBeGreaterThan(0);
    const r = await replay(demo, demoLayouts, f.session, { commands });
    expect(journalDiff(f.journal!, r.journal)).toBe(-1);
    const bad = parseSessionFile(
      JSON.stringify({ ...sessionFile(demo.id, e), journal: [{ seq: 1, kind: 'roomEntered', room: 'nowhere' }] }),
    );
    expect(journalDiff(bad.journal!, r.journal)).toBe(0);
    // An event of an unknown kind is dropped when the file is read: the file is data, not the engine's word.
    const odd = parseSessionFile(JSON.stringify({ ...sessionFile(demo.id, e), journal: [{ seq: 1, kind: 'x' }] }));
    expect(odd.journal).toEqual([]);
    expect(f.journalTruncated).toBeUndefined();
  });

  it('a session longer than the window is exported without a journal, marked truncated', async () => {
    const e = new Engine(structuredClone(demo), demoLayouts, new FakePresenter(), new MemoryStore(), { commands });
    (e as unknown as { journal: Journal }).journal = new Journal(3);
    e.random = () => 0;
    await e.checkpoint('garden');
    await e.script([{ gain: 'a1' }, { gain: 'a2' }, { gain: 'a3' }, { gain: 'a4' }]);
    const f = parseSessionFile(JSON.stringify(sessionFile(demo.id, e)));
    expect(f.journal).toBeUndefined();
    expect(f.journalTruncated).toBe(true);
  });
});
