import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import { analyzePlaytests, playtestsMarkdown, quotaShortfalls } from '@engine/tools/playtests';
import { deviceFamily, parseSessionFile, sessionFile } from '@engine/tools/replay';
import { solve } from '@engine/tools/solve';
import { game as demo, layouts as demoLayouts, commands } from '../games/demo';

const tick = () => new Promise((r) => setTimeout(r, 0));

/** A session played on the demo with a fake clock: a stall on the armchair, a hint, an interrupted walk. */
async function record() {
  const ui = new FakePresenter();
  const e = new Engine(structuredClone(demo), demoLayouts, ui, new MemoryStore(), { commands });
  e.digestOn = true;
  e.random = () => 0.7;
  let now = 0;
  e.clock = () => (now += 1500);
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
  // Three times the same useless action: a stall.
  for (let i = 0; i < 3; i++) await e.act({ verb: 'use', a: 'shell_phone', b: 'armchair' });
  // A hint.
  await e.act({ verb: 'talk', a: 'shell_phone' });
  // An interrupted walk: the presenter refuses once.
  const walk = ui.walk.bind(ui);
  ui.walk = (async () => {
    ui.walk = walk;
    return null;
  }) as unknown as typeof ui.walk;
  await e.act({ verb: 'open', a: 'armchair' });
  return e;
}

describe('playtests', () => {
  it('a shared session carries timestamps and ids only; the analysis finds the stall, the hint, the abort', async () => {
    const e = await record();
    const file = parseSessionFile(JSON.stringify(sessionFile('demo', e, { playtest: true })));
    expect(file.trace).toEqual([]);
    expect(file.session.at).toBeGreaterThan(0);
    const ts = file.session.log.map((en) => en.t!);
    expect(ts.every((t, i) => t !== undefined && (i === 0 || t >= ts[i - 1]))).toBe(true);
    expect(JSON.stringify(file)).not.toContain('smells like the sea');
    const r = await analyzePlaytests(demo, demoLayouts, [{ name: 'phone-1', file }], { commands });
    expect(r.files[0].divergedAt).toBeUndefined();
    expect(r.stalls[0]).toMatchObject({
      file: 'phone-1',
      room: 'house',
      action: 'use shell_phone armchair',
      repeats: 3,
    });
    expect(Object.keys(r.hints).some((k) => k.startsWith('hint:house/'))).toBe(true);
    expect(r.rooms.house.hints).toBe(1);
    expect(r.aborts).toBe(1);
    expect(r.rooms.house.ms).toBeGreaterThan(0);
    expect(r.files[0].abandon.room).toBe('house');
    expect(Object.keys(r.heat).some((k) => k.startsWith('rule:house.'))).toBe(true);
    expect(r.heat['room:house']).toBeGreaterThan(0);
    const md = playtestsMarkdown(r, demo);
    expect(md).toContain('Where players stall');
    expect(md).toContain('phone-1');
  });

  it('a session the content outgrew is reported as diverged, never thrown', async () => {
    const e = await record();
    const file = parseSessionFile(JSON.stringify(sessionFile('demo', e, { playtest: true })));
    const changed = structuredClone(demo);
    const house = changed.rooms.find((r) => r.id === 'house')!;
    house.hotspots = Object.fromEntries(Object.entries(house.hotspots ?? {}).filter(([k]) => k !== 'pantry'));
    house.look = Object.fromEntries(Object.entries(house.look ?? {}).filter(([k]) => k !== 'pantry'));
    const r = await analyzePlaytests(changed, demoLayouts, [{ name: 'old', file }], { commands });
    expect(r.divergences).toBe(1);
    expect(r.files[0].divergedAt).toBeDefined();
  });

  it("without a clock, nothing is timestamped: the solver's steps stay as before", async () => {
    const s = await solve(demo, demoLayouts, { commands });
    expect(s.steps.every((en) => en.t === undefined)).toBe(true);
    const e = new Engine(structuredClone(demo), demoLayouts, new FakePresenter(), new MemoryStore(), { commands });
    await e.checkpoint(Object.keys(demo.checkpoints ?? {})[0]);
    expect(e.session?.at).toBeUndefined();
  });
});

describe('the committed demo playtest', () => {
  it('counts its inputs from the first one after `start`, down to the last real action', async () => {
    const { readFileSync } = await import('node:fs');
    const file = parseSessionFile(readFileSync('games/demo/playtests/walkthrough-hesitant.session.json', 'utf8'));
    expect(file.session.log.length).toBe(24);
    const r = await analyzePlaytests(demo, demoLayouts, [{ name: 'hesitant', file }], { commands });
    const f = r.files[0];
    expect(f.played).toBe(23);
    expect(f.entries).toBe(23);
    expect(f.divergedAt).toBeUndefined();
    expect(f.ended).toBe(true);
    expect(f.abandon).toMatchObject({ index: 23, label: 'Use key with pantry', room: 'house' });
    expect(r.total.entries).toBe(23);
    expect(r.heat['rule:house.use-key-pantry']).toBe(1);
    expect(playtestsMarkdown(r, demo)).toContain('| 23/23 | yes |');
  });

  it('near misses (3.8): summed over the sessions by room and target, ids only, a malformed key dropped', async () => {
    const { readFileSync } = await import('node:fs');
    const raw = JSON.parse(readFileSync('games/demo/playtests/walkthrough-hesitant.session.json', 'utf8'));
    const a = parseSessionFile(
      JSON.stringify({ ...raw, misses: { 'house/pantry': 2, 'house/armchair': 1, 'bad key': 4 } }),
    );
    const b = parseSessionFile(JSON.stringify({ ...raw, misses: { 'house/pantry': 3 } }));
    expect(a.misses).toEqual({ 'house/pantry': 2, 'house/armchair': 1 });
    const r = await analyzePlaytests(
      demo,
      demoLayouts,
      [
        { name: 'a', file: a },
        { name: 'b', file: b },
      ],
      { commands },
    );
    expect(r.misses).toEqual({ 'house/pantry': 5, 'house/armchair': 1 });
    expect(playtestsMarkdown(r, demo)).toMatch(/## Near misses[\s\S]*\| pantry \| 5 \|/);
  });
});

describe('the field quotas (3.7.1)', () => {
  const f = (ended: boolean, device?: string, divergedAt?: number) => ({ ended, device, divergedAt });
  it('none asked: met, even with no session', () => {
    expect(quotaShortfalls([], {})).toEqual([]);
  });
  it('zero sessions miss every quota asked', () => {
    expect(quotaShortfalls([], { sessions: 5, completed: 3, devices: 2 })).toEqual([
      '0 session(s), 5 asked',
      '0 played to the end, 3 asked',
      '0 device families, 2 asked',
    ]);
  });
  it('a diverged session counts for nothing; devices are families, counted once', () => {
    const files = [f(true, 'ios'), f(true, 'ios'), f(false, 'android', 4), f(true, 'desktop'), f(false)];
    expect(quotaShortfalls(files, { sessions: 4, completed: 3, devices: 2 })).toEqual([]);
    expect(quotaShortfalls(files, { sessions: 5, completed: 4, devices: 3 })).toEqual([
      '4 session(s), 5 asked',
      '3 played to the end, 4 asked',
      '2 device families, 3 asked',
    ]);
  });
  it('a session file says its device family, nothing finer', () => {
    expect(deviceFamily('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios');
    expect(deviceFamily('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios');
    expect(deviceFamily('Mozilla/5.0 (Linux; Android 15; Pixel 9)')).toBe('android');
    expect(deviceFamily('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('desktop');
    expect(
      parseSessionFile(JSON.stringify({ session: { log: [], start: { kind: 'new' } }, device: 'android' })).device,
    ).toBe('android');
    expect(
      parseSessionFile(JSON.stringify({ session: { log: [], start: { kind: 'new' } }, device: 'Pixel 9' })).device,
    ).toBeUndefined();
  });
});
