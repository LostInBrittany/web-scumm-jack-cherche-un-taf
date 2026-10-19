// The run clock (4.1.14 "Time Attack", ADR 0016, D24): logical steps (one per session entry) and logical time (the
// declared durations of core/timing.ts, in microticks) are what a speedrun is ranked on, so they must be the same live
// and replayed: on the sample game and on 200 generated games played at random. The clock observes; it never writes
// the state, and the monotonic reading (RTA) is never mocked into a replay.
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import { EngineRunClock } from '@engine/core/run-clock';
import { logicalState } from '@engine/core/diff';
import { MICROTICKS_PER_MS, SAY_LOGICAL_MS, TIMING_VERSION, walkLogicalMs } from '@engine/core/timing';
import type { Action, GameDef, Layout, Session } from '@engine/core/types';
import { replay } from '@engine/tools/replay';
import { solve } from '@engine/tools/solve';
import { game as demo } from '../games/demo/game';
import { commands } from '../games/demo/index';
import house from '../games/demo/layout/house.json';
import garden from '../games/demo/layout/garden.json';
import market from '../games/demo/layout/market.json';
import { mini, miniLayouts } from './fixtures/mini';
import { randomGame } from './gen/random-game';

const demoLayouts: Record<string, Layout> = {
  house: house as unknown as Layout,
  garden: garden as unknown as Layout,
  market: market as unknown as Layout,
};
const ms = (n: number) => BigInt(n) * MICROTICKS_PER_MS;

async function boot(g: GameDef = mini(), layouts = miniLayouts) {
  const e = new Engine(g, layouts, new FakePresenter(), new MemoryStore());
  await e.newGame();
  return e;
}

describe('the logical durations', () => {
  it('a line costs SAY_LOGICAL_MS whatever its length; a wait, an anim, a camera pan their ms', async () => {
    const e = await boot();
    const t0 = e.runClock.logicalTime();
    await e.script(['Hi.', 'A much longer line that would take far longer to read on a screen than the first one.']);
    expect(e.runClock.logicalTime() - t0).toBe(2n * ms(SAY_LOGICAL_MS));
    const t1 = e.runClock.logicalTime();
    await e.script([{ wait: 1234 }, { anim: ['hero', 'wave'], ms: 500 }, { camera: { pan: 0, ms: 300 } }]);
    expect(e.runClock.logicalTime() - t1).toBe(ms(1234 + 500 + 300));
    expect(TIMING_VERSION).toBe(1);
  });

  it('what a skip cuts costs nothing; a played one is IGT but not Active IGT', async () => {
    const e = await boot();
    const t0 = e.runClock.logicalTime();
    const a0 = e.runClock.activeTime();
    await e.script([{ cutscene: [{ wait: 1000 }, 'Inside.'] }]);
    expect(e.runClock.logicalTime() - t0).toBe(ms(1000 + SAY_LOGICAL_MS));
    expect(e.runClock.activeTime() - a0).toBe(0n);
    // Skipped while its first wait plays: that wait was counted when it began, the rest is fast.
    const t1 = e.runClock.logicalTime();
    const p = e.script([{ cutscene: [{ wait: 1000 }, { wait: 2000 }] }]);
    e.skip();
    await p;
    expect(e.runClock.logicalTime() - t1).toBe(ms(1000));
  });

  it('an approach walk costs its distance from the logical anchor over the walk speed, not the presenter’s end', async () => {
    const e = await boot();
    const t0 = e.runClock.logicalTime();
    await e.act({ verb: 'look', a: 'valise' });
    const ap = e.approach('valise')!;
    const walk = walkLogicalMs(Math.sqrt((ap[0] - 320) ** 2 + (ap[1] - 360) ** 2));
    expect(e.runClock.logicalTime() - t0).toBe(ms(walk + SAY_LOGICAL_MS));
    // A second look from where the core left the hero: no walk.
    const t1 = e.runClock.logicalTime();
    await e.act({ verb: 'look', a: 'valise' });
    expect(e.runClock.logicalTime() - t1).toBe(ms(SAY_LOGICAL_MS));
  });

  it('one logical step per session entry; a new game resets, a load continues', async () => {
    const e = await boot();
    expect(e.runClock.logicalSteps()).toBe(1n);
    await e.act({ verb: 'look', a: 'valise' });
    await e.act({ verb: 'look', a: 'uncle' });
    expect(e.runClock.logicalSteps()).toBe(3n);
    await e.load(structuredClone(e.state));
    expect(e.runClock.logicalSteps()).toBe(3n);
    await e.newGame();
    expect(e.runClock.logicalSteps()).toBe(1n);
  });

  it('observes and never writes: the state is the same with the clock’s readings taken or not', async () => {
    const a = await boot();
    const b = await boot();
    for (const e of [a, b]) await e.act({ verb: 'use', a: 'cle', b: 'valise' });
    a.runClock.logicalTime();
    a.runClock.activeTime();
    a.runClock.monotonicNow();
    expect(logicalState(a.state)).toEqual(logicalState(b.state));
    expect(Object.keys(a.state)).not.toContain('clock');
  });

  it('snapshots and restores its counters and anchors (a resumed run)', async () => {
    const e = await boot();
    await e.act({ verb: 'look', a: 'valise' });
    const snap = e.runClock.snapshot();
    const c = new EngineRunClock(e);
    c.restore(snap);
    expect(c.logicalTime()).toBe(e.runClock.logicalTime());
    expect(c.logicalSteps()).toBe(e.runClock.logicalSteps());
    expect(c.snapshot()).toEqual(snap);
  });

  it('RTA is the host’s monotonic clock, never the logical one', async () => {
    const e = await boot();
    let now = 1000;
    e.runClock.now = () => now;
    expect(e.runClock.monotonicNow()).toBe(1000);
    now = 5000;
    expect(e.runClock.monotonicNow()).toBe(5000);
    expect(e.runClock.logicalTime()).toBe(e.runClock.logicalTime());
  });
});

/** Plays `picks` as actions on a live engine: a verb, a target, maybe an item (as tests/journal.test.ts does). */
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

describe('the same session gives the same logical steps and time, live and replayed', () => {
  it('the sample game from New Game to its ending (the solver’s route)', async () => {
    const s = await solve(structuredClone(demo), demoLayouts, { maxStates: 20000, commands });
    let clock: [bigint, bigint, bigint] = [0n, 0n, 0n];
    const a = await replay(demo, demoLayouts, { start: { kind: 'new' }, log: s.steps }, { commands });
    const read = (e: Engine) => [e.runClock.logicalSteps(), e.runClock.logicalTime(), e.runClock.activeTime()];
    let other: bigint[] = [];
    await replay(demo, demoLayouts, JSON.parse(JSON.stringify(a.session)) as Session, {
      commands,
      onEntry: (_i, e) => {
        other = read(e);
      },
    });
    await replay(demo, demoLayouts, JSON.parse(JSON.stringify(a.session)) as Session, {
      commands,
      onEntry: (_i, e) => {
        clock = read(e) as [bigint, bigint, bigint];
      },
    });
    expect(other).toEqual(clock);
    expect(clock[1]).toBeGreaterThan(0n);
    expect(clock[1]).toBeGreaterThanOrEqual(clock[2]);
  });

  it('200 generated games played at random', async () => {
    let total = 0n;
    for (let seed = 1; seed <= 200; seed++) {
      const { game, layouts } = randomGame(seed);
      const picks = [...Array(10)].map((_, i) => (seed * 7919 + i * 104729) % 500);
      const e = await play(game, layouts, picks);
      const live = [e.runClock.logicalSteps(), e.runClock.logicalTime(), e.runClock.activeTime()];
      let replayed: bigint[] = [];
      const r = await replay(game, layouts, JSON.parse(JSON.stringify(e.session)) as Session, {
        onEntry: (_i, x) => {
          replayed = [x.runClock.logicalSteps(), x.runClock.logicalTime(), x.runClock.activeTime()];
        },
      });
      expect(r.divergedAt, `seed ${seed}`).toBeUndefined();
      expect(replayed, `seed ${seed}`).toEqual(live);
      total += live[1]!;
    }
    expect(total).toBeGreaterThan(0n);
  }, 120000);
});
