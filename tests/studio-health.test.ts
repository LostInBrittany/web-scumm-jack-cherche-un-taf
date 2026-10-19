// The game's health by revision (4.2.2 PR 3b, plan §2.3, G3 and G4): the head judged after each burst of revisions,
// once per revision and epoch; the revision that broke a passing one found by bisection in ⌈log₂ n⌉ validations,
// named with its operation and files; a failing head after a failing revision keeps it; a worker away records nothing
// and is tried again; a bisection asked for checks its ends. Underneath: the journal gives any revision's files back
// (the head with the later operations undone), and a snapshot of them is the folder's own.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from '../bridge/src/migrations';
import type { SqlDb } from '../bridge/src/store-sql';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { Journal } from '../studio-server/src/ops/journal';
import { Health, type HealthState, judgeBy } from '../studio-server/src/server/health';
import type { SolveData } from '../tools/studio/types';
import { packable, packFiles, packSnapshot } from '../studio-server/src/worker/snapshot';
import { healthText } from '../src/studio/health-chip';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, db: SqlDb;

beforeEach(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-health-'));
  db = await openSqliteDb(join(tmp, 'j.sqlite'));
  await migrate(db, { dir: new URL('../studio-server/migrations/', import.meta.url) });
});
afterEach(async () => {
  await db.close();
  rmSync(tmp, { recursive: true, force: true });
});

/** A history of `n` revisions where revision `k` and every later one fail; each snapshot names its revision. */
function history(o: { k: number; down?: () => boolean; unknownAt?: number; failAt?: Set<number> }) {
  let head = { epoch: 'e1', rev: 1 };
  const validated: number[] = [];
  const revOf = (bytes: Buffer) =>
    Number((JSON.parse(bytes.toString()) as { files: { text: string }[] }).files[0]!.text.replace('rev ', ''));
  const files = (rev: number) => [{ path: 'game.ts', bytes: Buffer.from(`rev ${rev}`) }];
  const health = new Health({
    db,
    journal: {
      filesAt: async (rev, keep) => files(rev).filter((f) => !keep || keep(f.path)),
      revision: async () => head.rev,
      opAt: async (rev) => ({ rev, what: `edit ${rev}`, paths: [`rooms/r${rev}.ts`] }),
    },
    snapshot: async () => ({ ...head, bytes: packFiles(files(head.rev)) }),
    judge: async (bytes, at) => {
      if (o.down?.()) throw new Error('the processing worker refused the job (503)');
      const rev = revOf(bytes);
      if (o.failAt?.has(rev)) throw new Error(`the processing worker refused revision ${rev} (503)`);
      expect(at.rev).toBe(rev);
      validated.push(rev);
      if (rev === o.unknownAt)
        return { ok: false, errors: [], warnings: [], ms: 1, unknown: 'the solver was cut short' };
      const ok = rev < o.k;
      return { ok, errors: ok ? [] : [`broken at ${rev}`], warnings: [], ms: 1 };
    },
  });
  return {
    health,
    validated,
    go: (rev: number, epoch = 'e1') => {
      head = { epoch, rev };
    },
  };
}

describe("the game's health by revision", () => {
  it('judges the head once per revision, a burst by its last revision', async () => {
    const h = history({ k: 99 });
    await h.health.schedule();
    h.go(5);
    await h.health.schedule();
    await h.health.schedule();
    expect(h.validated).toEqual([1, 5]);
    expect(h.health.state()).toMatchObject({ head: 5, rev: 5, ok: true, brokenSince: null, running: null });
  });

  it('finds the revision that broke a passing one in ⌈log₂ n⌉ validations, and names its operation', async () => {
    for (const [n, k] of [
      [2, 2],
      [17, 9],
      [33, 2],
      [33, 33],
      [100, 64],
    ] as const) {
      await db.exec('DELETE FROM studio_health');
      const h = history({ k });
      await h.health.schedule(); // revision 1 passes
      h.go(n);
      await h.health.schedule();
      const bisection = h.validated.slice(2);
      expect(bisection.length, `n=${n} k=${k}`).toBeLessThanOrEqual(Math.ceil(Math.log2(n - 1)));
      expect(h.health.state(), `n=${n} k=${k}`).toMatchObject({
        rev: n,
        ok: false,
        errors: [`broken at ${n}`],
        brokenSince: { rev: k, what: `edit ${k}`, paths: [`rooms/r${k}.ts`] },
      });
    }
  });

  it('keeps the revision found while the head stays broken, and forgets it once it passes again', async () => {
    const h = history({ k: 4 });
    await h.health.schedule();
    h.go(8);
    await h.health.schedule();
    const after = h.validated.length;
    h.go(9);
    await h.health.schedule();
    // One more validation (the head), no new bisection.
    expect(h.validated.length).toBe(after + 1);
    expect(h.health.state().brokenSince?.rev).toBe(4);
    // A restart reads the verdicts back: nothing is judged twice.
    const again = new Health({
      db,
      journal: {
        filesAt: async () => [],
        revision: async () => 9,
        opAt: async (rev) => ({ rev, what: `edit ${rev}`, paths: [] }),
      },
      snapshot: async () => ({ epoch: 'e1', rev: 9, bytes: Buffer.from('{}') }),
      judge: async () => {
        throw new Error('not asked');
      },
    });
    await again.schedule();
    expect(again.state()).toMatchObject({ rev: 9, ok: false, brokenSince: { rev: 4 } });
  });

  it('says nothing is known when no revision passed before, and in another epoch', async () => {
    const h = history({ k: 1 });
    await h.health.schedule();
    expect(h.health.state()).toMatchObject({ rev: 1, ok: false, brokenSince: null });
    h.go(1, 'e2');
    await h.health.schedule();
    expect(h.health.state()).toMatchObject({ epoch: 'e2', rev: 1, ok: false, brokenSince: null });
  });

  it('records nothing when the worker is away, and tries again later', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let down = true;
      const h = history({ k: 99, down: () => down });
      const seen: HealthState[] = [];
      h.health.events.on('changed', (s: HealthState) => seen.push(s));
      await h.health.schedule();
      expect(h.health.state()).toMatchObject({ rev: null, ok: null, running: null });
      expect(seen.at(-1)?.running).toBeNull();
      expect(await db.all('SELECT * FROM studio_health')).toEqual([]);
      down = false;
      await vi.advanceTimersByTimeAsync(5_000);
      await h.health.schedule();
      expect(h.health.state()).toMatchObject({ rev: 1, ok: true });
      h.health.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('records nothing for a verdict it cannot give, and names no revision past one', async () => {
    const h = history({ k: 5, unknownAt: 3 });
    await h.health.schedule();
    h.go(3);
    await h.health.schedule();
    expect(h.health.state()).toMatchObject({ rev: 3, ok: null, unknown: 'the solver was cut short' });
    expect((await db.all('SELECT rev FROM studio_health ORDER BY rev')).map((r) => Number(r.rev))).toEqual([1]);
    // From 1 (valid) to 9 (broken), the search meets revision 3: no revision is named.
    h.go(9);
    await h.health.schedule();
    expect(h.health.state()).toMatchObject({ rev: 9, ok: false, brokenSince: null, unknown: null });
    expect(await h.health.bisectOn(1, 9)).toEqual({
      error: 'revision 3: the solver was cut short: no revision can be named',
    });
  });

  it('keeps the revision that broke it when a bisection stopped part-way, and never loses it on a row kept', async () => {
    const failAt = new Set([5]);
    const h = history({ k: 3, failAt });
    await h.health.schedule(); // 1 passes
    h.go(9);
    // The bisection of 1..9 judges 5 first: the worker refuses, the run fails, no row is kept for 9.
    await h.health.schedule();
    h.health.close();
    failAt.clear();
    const again = history({ k: 3 });
    again.go(9);
    await again.health.schedule();
    expect(again.health.state()).toMatchObject({ rev: 9, ok: false, brokenSince: { rev: 3 } });
    // Rows kept along the way (failing, with no revision of their own) do not hide it on a newer failing head.
    again.go(12);
    await again.health.schedule();
    expect(again.health.state()).toMatchObject({ rev: 12, brokenSince: { rev: 3 } });
    expect(again.validated.at(-1)).toBe(12);
  });

  it('says a revision that cannot be judged again and again is unknown, with its reason', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const h = history({ k: 99, failAt: new Set([1]) });
      await h.health.schedule();
      for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(h.health.state()).toMatchObject({
        rev: 1,
        ok: null,
        unknown: 'cannot be judged: the processing worker refused revision 1 (503)',
      });
      h.health.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("judges a revision from its snapshot when asked (a published build's), once, and keeps no unknown", async () => {
    const h = history({ k: 4, unknownAt: 6 });
    await h.health.judgeSnapshot('e1', 2, packFiles([{ path: 'game.ts', bytes: Buffer.from('rev 2') }]));
    await h.health.judgeSnapshot('e1', 2, packFiles([{ path: 'game.ts', bytes: Buffer.from('rev 2') }]));
    expect(h.validated).toEqual([2]);
    await h.health.judgeSnapshot('e1', 6, packFiles([{ path: 'game.ts', bytes: Buffer.from('rev 6') }]));
    expect(
      (await db.all('SELECT rev, ok FROM studio_health ORDER BY rev')).map((r) => [Number(r.rev), Number(r.ok)]),
    ).toEqual([[2, 1]]);
  });

  it('runs a bisection asked for between a passing and a failing revision, and checks its ends', async () => {
    const h = history({ k: 6 });
    await h.health.schedule();
    expect(await h.health.bisectOn(2, 11)).toEqual({ error: 'revision 11 is past the head (1)' });
    h.go(11);
    expect(await h.health.bisectOn(2, 11)).toEqual({ rev: 6, what: 'edit 6', paths: ['rooms/r6.ts'] });
    // The revision found is kept on the failing end too: the loop's next look at revision 11 names it.
    const [row] = await db.all('SELECT culprit FROM studio_health WHERE rev = 11');
    expect(Number(row!.culprit)).toBe(6);
    await h.health.schedule();
    expect(h.health.state()).toMatchObject({ rev: 11, brokenSince: { rev: 6 } });
    expect(h.health.state().running).toBeNull();
    expect(await h.health.bisectOn(7, 11)).toEqual({ error: 'revision 7 does not pass' });
    expect(await h.health.bisectOn(2, 5)).toEqual({ error: 'revision 5 passes' });
    expect(await h.health.bisectOn(5, 5)).toMatchObject({ error: expect.stringMatching(/before/) });
  });
});

describe('a verdict', () => {
  const v = (ok: boolean) => ({ ok, errors: ok ? [] : ['bad'], warnings: ['w'], ms: 2 });
  const s = (status: string, exit: number, errors: string[] = []) =>
    ({ status, exit, headline: `the solver: ${status}`, errors, ms: 3 }) as unknown as SolveData;
  it('is the validator, then the solver from a new game', async () => {
    const at = { epoch: 'e', rev: 1 };
    let solved = 0;
    const judge = (st: SolveData) =>
      judgeBy({ validate: async () => v(true), solve: async () => (solved++, st) })(Buffer.from(''), at);
    expect(await judge(s('solved', 0))).toEqual({ ok: true, errors: [], warnings: ['w'], ms: 5 });
    expect(await judge(s('softlocks', 1, ['a softlock in the cellar']))).toMatchObject({
      ok: false,
      errors: ['a softlock in the cellar', 'the solver: softlocks'],
    });
    expect((await judge(s('truncated', 2))).unknown).toBe('the solver was cut short (the solver: truncated)');
    // The validator failing: its verdict, the solver not asked.
    const before = solved;
    expect(
      await judgeBy({ validate: async () => v(false), solve: async () => (solved++, s('solved', 0)) })(
        Buffer.from(''),
        at,
      ),
    ).toEqual(v(false));
    expect(solved).toBe(before);
  });
});

describe("a past revision's files", () => {
  it('are the head with the later operations undone, and pack as the folder does', async () => {
    const game = join(tmp, 'game');
    mkdirSync(join(game, 'rooms'), { recursive: true });
    mkdirSync(join(game, 'art'), { recursive: true });
    writeFileSync(join(game, 'rooms', 'a.ts'), 'a0');
    writeFileSync(join(game, 'art', 'x.png'), 'png');
    writeFileSync(join(game, 'notes.json'), '{}');
    const j = await Journal.open({ db, blobs: fsBlobStore(join(tmp, 'blobs')), gameDir: game, hosted: true });
    const write = (path: string, after: string | null, what = 'w') =>
      j.apply({ author: 'lea', what, effects: [{ path, after }], respond: (rev) => rev });
    await write('rooms/a.ts', 'a0');
    const r0 = await j.revision();
    await write('rooms/a.ts', 'a1', 'edit a');
    await write('rooms/b.ts', 'b1', 'add b');
    await write('rooms/a.ts', null, 'remove a');
    const at = async (rev: number) =>
      Object.fromEntries((await j.filesAt(rev, (p) => packable(p))).map((f) => [f.path, f.bytes.toString()]));
    expect(await at(r0 + 1)).toEqual({ 'notes.json': '{}', 'rooms/a.ts': 'a1' });
    expect(await at(r0 + 2)).toEqual({ 'notes.json': '{}', 'rooms/a.ts': 'a1', 'rooms/b.ts': 'b1' });
    expect(await at(r0 + 3)).toEqual({ 'notes.json': '{}', 'rooms/b.ts': 'b1' });
    // The pictures stay out (`packable`), and the head's snapshot is the folder's own, byte for byte.
    expect(Object.keys(await at(r0))).not.toContain('art/x.png');
    expect(packFiles(await j.filesAt(r0 + 3, (p) => packable(p))).equals(packSnapshot(game))).toBe(true);
    expect(await j.opAt(r0 + 2)).toMatchObject({ rev: r0 + 2, what: 'add b', paths: ['rooms/b.ts'] });
    expect(await j.opAt(r0 + 99)).toBeUndefined();
    await j.close();
  });
});

describe('the files a snapshot keeps', () => {
  it('are the sources and data, never hidden, outside, art, sound, private or tests (playtests when asked)', () => {
    for (const p of ['game.ts', 'rooms/a.ts', 'layout/garden.json', 'notes.md', 'docs/readme.md'])
      expect(packable(p), p).toBe(true);
    for (const p of [
      '.env.ts',
      'rooms/.hidden.ts',
      'node_modules/x/index.js',
      '../outside.ts',
      'rooms//a.ts',
      'art/sheet.json',
      'audio/cues.json',
      'private/notes.md',
      'tests/a.test.ts',
      'playtests/a.session.json',
      'art/x.png',
      'rooms/a.png',
    ])
      expect(packable(p), p).toBe(false);
    expect(packable('playtests/a.session.json', { playtests: true })).toBe(true);
    const big = Array.from({ length: 5_001 }, (_, i) => ({ path: `f${i}.ts`, bytes: Buffer.from('x') }));
    expect(() => packFiles(big)).toThrow(/too large/);
  });
});

describe("the health in a hosted Studio's header", () => {
  const base = {
    epoch: 'e',
    head: 4,
    rev: 4,
    ok: true,
    errors: [],
    warnings: 0,
    brokenSince: null,
    running: null,
    unknown: null,
  };
  it('says unknown, never valid, until a revision is judged', () => {
    expect(healthText(null).state).toBe('unknown');
    expect(healthText({ ...base, rev: null, ok: null, running: 2 }).text).toBe('checking revision 2…');
    expect(healthText({ ...base, ok: null, unknown: 'the solver was cut short' })).toMatchObject({
      text: 'health unknown at revision 4: the solver was cut short',
      state: 'unknown',
    });
  });
  it('says the verdict, its revision, the head past it, and what broke it', () => {
    expect(healthText(base).text).toBe('✔ valid at revision 4');
    expect(healthText({ ...base, head: 6, running: 6 })).toMatchObject({
      text: '✔ valid at revision 4 · head 6 · checking revision 6…',
      state: 'stale',
    });
    expect(healthText({ ...base, running: 3 }).text).toBe('✔ valid at revision 4 · checking revision 3…');
    const bad = healthText({
      ...base,
      ok: false,
      errors: ['e1', 'e2'],
      brokenSince: { rev: 3, what: 'Move the door', paths: ['layout/garden.json'] },
    });
    expect(bad).toEqual({
      text: '✖ 2 error(s) at revision 4 · broken since revision 3: Move the door (layout/garden.json)',
      title: 'broken since revision 3: Move the door (layout/garden.json)\ne1\ne2',
      state: 'bad',
    });
  });
});
