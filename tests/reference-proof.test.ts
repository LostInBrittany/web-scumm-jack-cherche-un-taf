// The 3.3 reference proof (BENCH.md "v3.3"): characters confined to their eras, items crossing through time chutes,
// one-way chutes, walkers, scripts and topics. The abstractions (canonical character, mobility regions) must give the
// explicit search's verdict, on the solvable game and on the variant with a softlock, and prove a 40-room
// 3-character game within the 3.3 budget.
import { describe, expect, it } from 'vitest';
import { solve } from '@engine/tools/solve';
import { makeStressGame } from '@engine/tools/stress';

const verdict = (r: Awaited<ReturnType<typeof solve>>) => ({
  status: r.status,
  finished: r.finished,
  broken: r.broken.length,
  softlocks: r.softlockCount > 0,
});

describe('the 3.3 reference proof', () => {
  for (const players of [2, 3])
    for (const softlock of [false, true])
      it(`12 rooms, ${players} characters${softlock ? ', with a softlock' : ''}: the explicit search's verdict`, async () => {
        const g = makeStressGame({
          rooms: 12,
          players,
          items: 12,
          flags: 10,
          npcs: 1,
          scripts: 2,
          topics: 4,
          schemaVersion: 3,
          eras: true,
          softlock,
        });
        const explicit = await solve(structuredClone(g.game), g.layouts, {
          mode: 'prove',
          maxStates: 60000,
          mobility: false,
          canonicalPlayers: false,
        });
        const abstract = await solve(structuredClone(g.game), g.layouts, { mode: 'prove', maxStates: 60000 });
        expect(explicit.truncated).toBe(false);
        expect(verdict(abstract)).toEqual(verdict(explicit));
        expect(abstract.status).toBe(softlock ? 'softlocks' : 'solved');
        expect(abstract.states * 5).toBeLessThan(explicit.states);
        if (softlock) expect(abstract.softlockCauses.map((c) => c.action).some((a) => a.includes('trash'))).toBe(true);
      }, 300000);

  it('40 rooms, 3 characters: proved, under 200 000 states', async () => {
    const g = makeStressGame({
      rooms: 40,
      players: 3,
      items: 12,
      flags: 30,
      npcs: 1,
      scripts: 2,
      topics: 8,
      schemaVersion: 3,
      eras: true,
    });
    const r = await solve(g.game, g.layouts, { mode: 'prove', maxStates: 200000 });
    expect(r.status).toBe('solved');
    expect(r.states).toBeLessThan(200000);
    expect(r.profile.mobility.applied && r.profile.canonical.applied).toBe(true);
  }, 300000);
});

describe('chapter boundaries', () => {
  it('the abstract shared search finds exactly the boundaries of the explicit search run from each start (demo, two chapters)', async () => {
    const { projectState } = await import('@engine/tools/solve');
    const { game: demo, layouts, commands } = await import('../games/demo');
    const cps = Object.entries(demo.checkpoints!).filter(([, c]) => c.goals?.length);
    const exp = { canonicalPlayers: false, mobility: false } as const;
    let startsExp = (await solve(demo, layouts, { mode: 'prove', goal: cps[0][1].goals, commands, ...exp })).boundaries;
    let startsAbs = (await solve(demo, layouts, { mode: 'prove', goal: cps[0][1].goals, commands })).boundaries;
    for (let c = 1; c <= 2; c++) {
      const goal = cps[c][1].goals,
        after = cps[c + 1]?.[1].goals;
      const key = (b: Parameters<typeof projectState>[2]) => projectState(demo, layouts, b, { commands, goal: after });
      const outExp = new Map<string, (typeof startsExp)[number]>();
      for (const s of startsExp)
        (await solve(demo, layouts, { mode: 'prove', goal, commands, start: { state: s }, ...exp })).boundaries.forEach(
          (b) => outExp.set(key(b), b),
        );
      const shared = await solve(demo, layouts, {
        mode: 'prove',
        goal,
        commands,
        start: { states: startsAbs },
        maxStates: 200000,
      });
      const outAbs = new Map(shared.boundaries.map((b) => [key(b), b]));
      expect([...outAbs.keys()].sort()).toEqual([...outExp.keys()].sort());
      startsExp = [...outExp.values()];
      startsAbs = [...outAbs.values()];
    }
  }, 600000);
});
