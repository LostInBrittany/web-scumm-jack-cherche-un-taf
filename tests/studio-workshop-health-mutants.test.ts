// The game's health by revision (4.2.2, studio-server/src/server/health.ts), pinned for the mutation set
// `studio-workshop` (4.2.3 PR 10): a failing verdict kept without a culprit names none when read back, a run asked for
// as the last one ends is not lost, a closed health judges nothing, the failures counted per revision and given up on
// at the fifth, the verdict kept while the next revision cannot be judged and dropped in another epoch, the events
// sent once, the revisions already judged never judged again by a bisection asked for, its ends checked from 0, its
// epoch the journal's before any run, and an error that is no unknown verdict thrown. What no test can reach is named
// in docs/dev/mutants.json.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from '../bridge/src/migrations';
import type { SqlDb } from '../bridge/src/store-sql';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { Health, type HealthState } from '../studio-server/src/server/health';
import { packFiles } from '../studio-server/src/worker/snapshot';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, db: SqlDb;

beforeEach(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-workshop-health-'));
  db = await openSqliteDb(join(tmp, 'j.sqlite'));
  await migrate(db, { dir: new URL('../studio-server/migrations/', import.meta.url) });
});
afterEach(async () => {
  vi.useRealTimers();
  await db.close();
  rmSync(tmp, { recursive: true, force: true });
});

/** Revisions from `k` on fail; `down(rev)` says the worker refuses that revision's job. */
function history(o: { k: number; down?: (rev: number) => boolean; log?: (l: Record<string, unknown>) => void }) {
  let head = { epoch: 'e1', rev: 1 };
  const judged: number[] = [];
  const files = (rev: number) => [{ path: 'game.ts', bytes: Buffer.from(`rev ${rev}`) }];
  const revOf = (bytes: Buffer) =>
    Number((JSON.parse(bytes.toString()) as { files: { text: string }[] }).files[0]!.text.replace('rev ', ''));
  const health = new Health({
    db,
    journal: {
      filesAt: async (rev) => files(rev),
      revision: async () => head.rev,
      opAt: async (rev) => ({ rev, what: `edit ${rev}`, paths: [`rooms/r${rev}.ts`] }),
    },
    snapshot: async () => ({ ...head, bytes: packFiles(files(head.rev)) }),
    judge: async (bytes) => {
      const rev = revOf(bytes);
      if (o.down?.(rev)) throw new Error(`the processing worker refused revision ${rev} (503)`);
      judged.push(rev);
      const ok = rev < o.k;
      return { ok, errors: ok ? [] : [`broken at ${rev}`], warnings: [], ms: 1 };
    },
    log: o.log,
  });
  return {
    health,
    judged,
    go: (rev: number, epoch = 'e1') => {
      head = { epoch, rev };
    },
  };
}

describe('a verdict read back', () => {
  it('names no revision when it was kept without one', async () => {
    const h = history({ k: 1 });
    await h.health.schedule();
    const [row] = await db.all('SELECT ok, culprit FROM studio_health');
    expect(row).toEqual({ ok: 0, culprit: null });
    const again = history({ k: 1 });
    await again.health.schedule();
    expect(again.judged).toEqual([]);
    expect(again.health.state()).toMatchObject({ rev: 1, ok: false, brokenSince: null });
  });
});

describe('the runs', () => {
  it('runs again at once when asked as the last run ends', async () => {
    let down = true;
    const h = history({ k: 99, down: () => down });
    let asked = false;
    h.health.events.on('changed', (s: HealthState) => {
      // The run's last word (its `running` cleared after a failure), then the loop looks no more: an ask made
      // right after must not wait for the retry timer.
      if (s.running === null && !asked) {
        asked = true;
        down = false;
        queueMicrotask(() => void h.health.schedule());
      }
    });
    await h.health.schedule();
    await expect.poll(() => h.health.state().ok, { timeout: 1_000 }).toBe(true);
    h.health.close();
  });

  it('judges nothing once closed', async () => {
    const h = history({ k: 99 });
    h.health.close();
    await h.health.schedule();
    expect(h.judged).toEqual([]);
    expect(h.health.state().rev).toBeNull();
  });

  it('gives up on a revision at its fifth failure, counting each revision apart', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const tries: number[] = [];
    const h = history({ k: 99, down: () => true, log: (l) => void tries.push(Number(l.tries)) });
    await h.health.schedule();
    for (const ms of [5_000, 10_000, 20_000]) await vi.advanceTimersByTimeAsync(ms);
    expect(tries).toEqual([1, 2, 3, 4]);
    expect(h.health.state().unknown).toBeNull();
    // Another revision starts its own count.
    h.go(2);
    await h.health.schedule();
    expect(tries.at(-1)).toBe(1);
    expect(h.health.state().unknown).toBeNull();
    for (const ms of [80_000, 160_000, 300_000, 300_000]) await vi.advanceTimersByTimeAsync(ms);
    expect(tries.slice(-5)).toEqual([1, 2, 3, 4, 5]);
    expect(h.health.state()).toMatchObject({ rev: 2, ok: null, unknown: expect.stringMatching(/^cannot be judged/) });
    h.health.close();
  });

  it('keeps the last verdict while the next revision cannot be judged, and drops it in another epoch', async () => {
    let down = false;
    const h = history({ k: 99, down: () => down });
    await h.health.schedule();
    down = true;
    h.go(2);
    await h.health.schedule();
    expect(h.health.state()).toMatchObject({ epoch: 'e1', head: 2, rev: 1, ok: true, running: null });
    h.go(1, 'e2');
    await h.health.schedule();
    expect(h.health.state()).toMatchObject({ epoch: 'e2', head: 1, rev: null, ok: null, running: null });
    h.health.close();
  });

  it('says each change once: judging, then the verdict', async () => {
    const h = history({ k: 99 });
    const seen: (number | null)[] = [];
    h.health.events.on('changed', (s: HealthState) => seen.push(s.running));
    await h.health.schedule();
    expect(seen).toEqual([1, null]);
  });
});

describe('a bisection asked for', () => {
  it('reads back the revisions already judged, judging none twice', async () => {
    const h = history({ k: 6 });
    await h.health.schedule();
    h.go(11);
    await h.health.schedule();
    const before = [...h.judged];
    expect(await h.health.bisectOn(1, 11)).toMatchObject({ rev: 6 });
    expect(h.judged).toEqual(before);
  });

  it('takes revision 0 as its passing end', async () => {
    const h = history({ k: 2 });
    h.go(3);
    expect(await h.health.bisectOn(0, 3)).toEqual({ rev: 2, what: 'edit 2', paths: ['rooms/r2.ts'] });
  });

  it("keeps its verdicts under the journal's epoch when no run has looked yet", async () => {
    const h = history({ k: 2 });
    h.go(3);
    await h.health.bisectOn(1, 3);
    expect((await db.all('SELECT DISTINCT epoch FROM studio_health')).map((r) => r.epoch)).toEqual(['e1']);
  });

  it('throws an error that is no unknown verdict (the worker away)', async () => {
    const h = history({ k: 2, down: () => true });
    h.go(3);
    await expect(h.health.bisectOn(1, 3)).rejects.toThrow(/refused revision 1/);
  });
});
