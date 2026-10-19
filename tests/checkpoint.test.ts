// Checkpoint and resume (4.1.13, src/engine/tools/solve/search/checkpoint.ts): a proof stopped at 30 % and taken up
// again gives the verdict, the witness and the softlocks of the proof that never stopped; a budget that cuts a search
// gives `truncated`, never `solved`, and a snapshot of another search is not taken up. The last test kills a real
// `npm run solve` process (SIGKILL, no clean-up) and resumes it from its file.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { solve, type SolveOptions, type SolveResult } from '@engine/tools/solve';
import { snapshotHeader } from '@engine/tools/solve/search/checkpoint';
import { game as demo, layouts as demoLayouts, commands } from '../games/demo';
import { matrixGame, randomGame } from './gen/random-game';

const sig = (r: SolveResult) => ({
  status: r.status,
  states: r.states,
  finished: r.finished,
  path: r.path,
  steps: r.steps,
  softlockCount: r.softlockCount,
  softlocks: r.softlocks,
  causes: r.softlockCauses,
  flags: r.flagsReached,
  rooms: r.roomsReached,
  unused: r.unusedItems,
  deadEnds: r.deadEnds,
  broken: r.broken,
});

/** A search stopped when it passes `at` states (an exception out of the loop: what was not written down is lost). */
async function interrupted(game: typeof demo, layouts: typeof demoLayouts, opts: SolveOptions, at: number) {
  let text: string | null = null;
  const stop = new Error('stopped');
  try {
    await solve(structuredClone(game), layouts, {
      ...opts,
      checkpoint: { save: (t) => (text = t), everyExpansions: 50 },
      onProgress: (p) => {
        if (p.states >= at) throw stop;
      },
    });
  } catch (e) {
    if (e !== stop) throw e;
  }
  return text as string | null;
}

describe('checkpoint and resume', () => {
  // The matrix instance c12 (softlocks, 7 333 states) is tests/checkpoint-matrix.test.ts, a heavy test: too slow
  // under the coverage instrumentation on the runner. The softlocks are resumed here by the 30-game cut below.
  const cases = [
    { name: 'the sample game', game: demo, layouts: demoLayouts, opts: { mode: 'prove', commands } as SolveOptions },
  ];
  for (const c of cases)
    it(`${c.name}: stopped at 30 %, taken up again, the same proof`, async () => {
      const whole = await solve(structuredClone(c.game), c.layouts, { ...c.opts, maxStates: 50000 });
      expect(whole.truncated).toBe(false);
      const text = await interrupted(c.game, c.layouts, { ...c.opts, maxStates: 50000 }, whole.states * 0.3);
      expect(text).not.toBeNull();
      const h = snapshotHeader(text!)!;
      expect(h.states).toBeGreaterThan(0);
      expect(h.states).toBeLessThan(whole.states * 0.5);
      const resumed = await solve(structuredClone(c.game), c.layouts, {
        ...c.opts,
        maxStates: 50000,
        checkpoint: { save: () => {}, resume: text },
      });
      expect(resumed.profile.checkpoint?.resumedAt?.states).toBe(h.states);
      expect(resumed.profile.checkpoint?.refused).toBeUndefined();
      expect(sig(resumed)).toEqual(sig(whole));
    }, 300_000);

  it('a budget that cuts gives truncated, never solved: states, time, memory', async () => {
    const o = { mode: 'prove', commands } as SolveOptions;
    const states = await solve(structuredClone(demo), demoLayouts, { ...o, maxStates: 300 });
    expect([states.status, states.truncated, states.profile.stoppedBy]).toEqual(['truncated', true, 'states']);
    const time = await solve(structuredClone(demo), demoLayouts, { ...o, timeLimitMs: 1 });
    expect([time.status, time.profile.stoppedBy]).toEqual(['truncated', 'time']);
    const memory = await solve(structuredClone(demo), demoLayouts, { ...o, maxMemoryMb: 1 });
    expect([memory.status, memory.profile.stoppedBy]).toEqual(['truncated', 'memory']);
    expect(memory.headline).toContain('nothing is proved');
    for (const r of [states, time, memory]) {
      expect(r.softlockCount).toBe(0);
      expect(r.exit).not.toBe(0);
    }
  }, 120_000);

  it('a search cut by its budget is written down, and a bigger budget takes it up to the same proof', async () => {
    const o = { mode: 'prove', commands } as SolveOptions;
    const whole = await solve(structuredClone(demo), demoLayouts, o);
    let text: string | null = null;
    const cut = await solve(structuredClone(demo), demoLayouts, {
      ...o,
      maxStates: 1000,
      checkpoint: { save: (t) => (text = t), everyMs: 1e9 },
    });
    expect(cut.status).toBe('truncated');
    expect(cut.profile.checkpoint?.written).toBe(1);
    const more = await solve(structuredClone(demo), demoLayouts, {
      ...o,
      checkpoint: { save: () => {}, resume: text },
    });
    expect(sig(more)).toEqual(sig(whole));
    // Taken up with the same small budget: still truncated, never solved.
    const again = await solve(structuredClone(demo), demoLayouts, {
      ...o,
      maxStates: 1000,
      checkpoint: { save: () => {}, resume: text },
    });
    expect(again.status).toBe('truncated');
  }, 120_000);

  it('a budget that falls inside a node: its other children are written down too, the resumed proof is the uncut one', async () => {
    // Tiny budgets cut the first expansions in the middle of their children (some reachable only from there).
    let compared = 0;
    const differ: string[] = [];
    for (let seed = 1; seed <= 30; seed++) {
      const { game, layouts } = randomGame(seed);
      const o = { mode: 'prove', maxStates: 3000 } as SolveOptions;
      const whole = await solve(structuredClone(game), layouts, o);
      if (whole.truncated) continue;
      for (const cut of [2, 3, 5, 8]) {
        if (cut >= whole.states) continue;
        let text: string | null = null;
        const r = await solve(structuredClone(game), layouts, {
          ...o,
          maxStates: cut,
          checkpoint: { save: (t) => (text = t), everyMs: 1e9 },
        });
        expect(r.status).toBe('truncated');
        const resumed = await solve(structuredClone(game), layouts, {
          ...o,
          checkpoint: { save: () => {}, resume: text },
        });
        compared++;
        if (JSON.stringify(sig(resumed)) !== JSON.stringify(sig(whole))) differ.push(`seed ${seed} cut at ${cut}`);
      }
    }
    expect(compared).toBeGreaterThan(40);
    expect(differ).toEqual([]);
  }, 300_000);

  it('a snapshot of another search, or not a snapshot, is not taken up (and the profile says why)', async () => {
    const g = matrixGame(13, { characters: 3, rooms: [20, 40] });
    let text: string | null = null;
    await solve(structuredClone(g.game), g.layouts, {
      mode: 'prove',
      maxStates: 100,
      checkpoint: { save: (t) => (text = t), everyMs: 1e9 },
    });
    const other = await solve(structuredClone(demo), demoLayouts, {
      mode: 'prove',
      commands,
      maxStates: 200,
      checkpoint: { save: () => {}, resume: text },
    });
    expect(other.profile.checkpoint?.refused).toContain('another search');
    const junk = await solve(structuredClone(demo), demoLayouts, {
      mode: 'prove',
      commands,
      maxStates: 200,
      checkpoint: { save: () => {}, resume: 'nonsense' },
    });
    expect(junk.profile.checkpoint?.refused).toContain('not a snapshot');
    const objects = await solve(structuredClone(g.game), g.layouts, {
      mode: 'prove',
      maxStates: 100,
      representation: 'objects',
      checkpoint: { save: () => {}, resume: text },
    });
    expect(objects.profile.checkpoint?.refused).toContain('compact');
  }, 120_000);

  // Not on Windows: there SIGKILL is TerminateProcess and the test's reader holds the snapshot open while the child
  // renames a new one over it, which Windows refuses (the child fails, nothing is killed at 30 %). The durability of
  // the write (fsync, then rename) is the same code on every system; the other cases here run everywhere.
  it.skipIf(process.platform === 'win32')(
    'a real process killed (SIGKILL) at 30 % and run again with --resume: the same verdict and witness',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'ckpt-'));
      const file = join(dir, 'demo.ckpt');
      const run = (extra: string[], killAt?: number) =>
        new Promise<{ code: number | null; out: string; killed: boolean }>((done) => {
          const p = spawn(
            process.execPath,
            ['--import', 'tsx', 'tools/solve.ts', '--prove', '--json', '--no-cache', ...extra],
            { env: { ...process.env, GAME: 'demo' }, stdio: ['ignore', 'pipe', 'ignore'] },
          );
          let out = '';
          let killed = false;
          p.stdout.on('data', (d) => (out += d));
          const poll =
            killAt === undefined
              ? undefined
              : setInterval(() => {
                  if (!existsSync(file)) return;
                  const h = snapshotHeader(readFileSync(file, 'utf8'));
                  if (h && h.states >= killAt) {
                    killed = true;
                    p.kill('SIGKILL');
                  }
                }, 5);
          p.on('close', (code) => {
            if (poll) clearInterval(poll);
            done({ code, out, killed });
          });
        });
      try {
        const whole = JSON.parse((await run([])).out) as SolveResult;
        const first = await run([`--checkpoint=${file}`, '--checkpoint-every=0.05'], Math.floor(whole.states * 0.3));
        expect(first.killed).toBe(true);
        expect(first.out).toBe('');
        const h = snapshotHeader(readFileSync(file, 'utf8'))!;
        expect(h.states).toBeGreaterThanOrEqual(Math.floor(whole.states * 0.3));
        expect(h.states).toBeLessThan(whole.states);
        const second = await run([`--checkpoint=${file}`, '--resume']);
        const resumed = JSON.parse(second.out) as SolveResult;
        expect(resumed.profile.checkpoint?.resumedAt?.states).toBe(h.states);
        expect([resumed.status, resumed.states, resumed.path, resumed.steps, resumed.softlockCount]).toEqual([
          whole.status,
          whole.states,
          whole.path,
          whole.steps,
          whole.softlockCount,
        ]);
        // A finished search removes its snapshot.
        expect(existsSync(file)).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    180_000,
  );
});
