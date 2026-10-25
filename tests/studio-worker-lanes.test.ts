// The worker's lanes (4.4.0, studio-server/src/worker/lanes.ts): a preview has a lane of its own, so it never waits
// behind a validator, a solver or a load; each lane runs one job at a time, in order, whatever the outcome of the one
// before; each holds at most `max` jobs (the next refused at once), the other lane unaffected; a job leaves its lane
// before its caller hears of it.
import { describe, expect, it } from 'vitest';
import type { JobKind } from '../studio-server/src/worker/job';
import { Lanes, laneOf, MAX_QUEUED } from '../studio-server/src/worker/lanes';

/** A job that runs until `end` is called, and says when it started. */
function job(log: string[], name: string) {
  let end!: (v?: unknown) => void;
  let fail!: (e: Error) => void;
  const done = new Promise((ok, ko) => {
    end = ok;
    fail = ko;
  });
  return {
    fn: () => {
      log.push(name);
      return done;
    },
    end: () => end(name),
    fail: () => fail(new Error(name)),
  };
}
const tick = () => new Promise((ok) => setTimeout(ok, 0));

describe("the worker's lanes", () => {
  it('give a preview a lane of its own, every other kind the other', () => {
    expect(laneOf('preview')).toBe('preview');
    const others: JobKind[] = ['validate', 'load', 'lint', 'solve', 'playtests', 'prepare', 'cut', 'migrate'];
    for (const k of others) expect(laneOf(k), k).toBe('other');
  });

  it('run a preview while a solve runs, and one job at a time in each lane, in order', async () => {
    const lanes = new Lanes();
    const log: string[] = [];
    const solve = job(log, 'solve');
    const load = job(log, 'load');
    const p1 = job(log, 'preview 1');
    const p2 = job(log, 'preview 2');
    const a = lanes.run('other', solve.fn)!;
    const b = lanes.run('other', load.fn)!;
    const c = lanes.run('preview', p1.fn)!;
    const d = lanes.run('preview', p2.fn)!;
    await tick();
    expect(log).toEqual(['solve', 'preview 1']);
    p1.end();
    await c;
    await tick();
    expect(log).toEqual(['solve', 'preview 1', 'preview 2']);
    expect(lanes.held('other')).toBe(2);
    expect(lanes.held('preview')).toBe(1);
    expect(lanes.held()).toBe(3);
    // A job that fails does not stop its lane.
    solve.fail();
    await expect(a).rejects.toThrow('solve');
    await tick();
    expect(log.at(-1)).toBe('load');
    load.end();
    p2.end();
    expect(await b).toBe('load');
    expect(await d).toBe('preview 2');
    expect(lanes.held()).toBe(0);
  });

  it(`hold ${MAX_QUEUED} jobs a lane at most, the next refused, the other lane still open`, async () => {
    expect(MAX_QUEUED).toBe(8);
    const lanes = new Lanes();
    const log: string[] = [];
    const jobs = Array.from({ length: MAX_QUEUED }, (_, i) => job(log, `j${i}`));
    const runs = jobs.map((j) => lanes.run('other', j.fn));
    expect(runs.every((r) => r instanceof Promise)).toBe(true);
    expect(lanes.held('other')).toBe(MAX_QUEUED);
    expect(lanes.run('other', job(log, 'one too many').fn)).toBeUndefined();
    expect(lanes.held('other')).toBe(MAX_QUEUED);
    const p = job(log, 'preview');
    const pr = lanes.run('preview', p.fn);
    expect(pr).toBeInstanceOf(Promise);
    p.end();
    await pr;
    // One ended: one more is taken.
    jobs[0]!.end();
    await runs[0];
    expect(lanes.held('other')).toBe(MAX_QUEUED - 1);
    const again = job(log, 'again');
    expect(lanes.run('other', again.fn)).toBeInstanceOf(Promise);
    for (const j of jobs) j.end();
    again.end();
    await Promise.all(runs);
  });

  it('take their bound from the constructor, and count a job out before its caller hears', async () => {
    const lanes = new Lanes(1);
    const log: string[] = [];
    const a = job(log, 'a');
    const r = lanes.run('preview', a.fn)!;
    expect(lanes.run('preview', job(log, 'b').fn)).toBeUndefined();
    a.end();
    await r.then(() => expect(lanes.held('preview')).toBe(0));
    const f = job(log, 'f');
    const rf = lanes.run('preview', f.fn)!;
    f.fail();
    await rf.catch(() => expect(lanes.held()).toBe(0));
  });
});
