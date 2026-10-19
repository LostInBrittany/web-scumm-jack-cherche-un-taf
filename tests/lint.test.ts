import { describe, expect, it } from 'vitest';
import { lintContent, lintMarkdown } from '@engine/tools/lint';
import { solve } from '@engine/tools/solve';
import type { GameDef, Layout } from '@engine/core/types';
import { grog, stan } from './fixtures/classics';
import { mini, miniLayouts } from './fixtures/mini';
import { game as demo } from '../games/demo/game';
import { commands as demoCommands } from '../games/demo';

const codes = (g: GameDef, layouts: Record<string, Layout> = {}, opts = {}) =>
  lintContent(g, layouts, opts).findings.map((f) => `${f.code} ${f.where.room ?? ''}/${f.where.path}`);

describe('content lint', () => {
  it('a condition nothing sets: on a rule, a topic, a choice, a hint', () => {
    const g = mini();
    g.verbs.push({ id: 'talk', label: 'Talk', color: '#fff' });
    g.rooms[0].on!.push({ verb: 'look', a: 'door', if: 'ghost_flag', do: ['Boo.'] });
    g.rooms[0].talk = { uncle: [{ topic: 'Hi', if: 'ghost_topic', do: ['Hello.'] }] };
    g.rooms[0].onEnter = [
      {
        choice: [
          { text: 'Yes', if: 'ghost_choice', do: [] },
          { text: 'No', do: [] },
        ],
      },
    ];
    g.rooms[0].hints = [
      { until: 'never_set', lines: ['Try the door.'] },
      { until: 'never_set', lines: ['Still the door.'] },
    ];
    const r = lintContent(g, miniLayouts);
    const byCode = Object.fromEntries(r.findings.map((f) => [f.code, f]));
    expect(byCode['cond-never-true']?.severity).toBe('error');
    expect(byCode['cond-never-true']?.message).toContain('ghost_flag');
    expect(byCode['topic-never-visible']?.where.path).toBe('talk.uncle[0]');
    expect(byCode['choice-dead']?.where.path).toBe('onEnter[0].choice[0]');
    expect(byCode['hint-stuck']?.severity).toBe('error');
    expect(byCode['hint-never-fires']?.where.path).toBe('hints[1]');
    expect(r.counts.error).toBe(3); // the rule's condition and both stuck hints
    expect(lintMarkdown(r)).toContain('`hint-stuck`');
  });

  it('a rule hidden by an earlier one, an item nothing needs, an item nothing gives', () => {
    const g = grog();
    const room = g.rooms[0];
    room.on!.push({ verb: room.on![0].verb, a: room.on![0].a, b: room.on![0].b, do: ['Never.'] });
    g.items.bait = { name: 'bait', icon: 'bait', look: 'Bait.' };
    room.on!.push({ verb: 'look', a: room.on![0].a as string, do: [{ gain: 'bait' }] });
    g.items.phantom = { name: 'phantom', icon: 'phantom', look: 'A phantom.' };
    room.on!.push({ verb: 'look', a: room.on![0].a as string, if: { has: 'phantom' }, do: ['Nothing.'] });
    const c = codes(g);
    expect(c.some((x) => x.startsWith('rule-shadowed'))).toBe(true);
    expect(c).toContain('item-red-herring /items.bait');
    expect(c).toContain('item-never-gained /items.phantom');
    expect(
      codes(g, {}, { ignore: ['item-red-herring:bait', 'item-never-gained'] }).filter((x) => x.startsWith('item-')),
    ).toEqual([]);
    expect(lintContent(g, {}, { ignore: ['item-red-herring:bait'] }).ignored).toBe(1);
  });

  it('with a solver run: a live rule the witness never ran, a room never reached', async () => {
    const g = stan();
    const room = g.rooms[0];
    g.items.extra = { name: 'extra', icon: 'extra', look: 'Extra.' };
    room.hotspots = { ...(room.hotspots ?? {}), crate: { name: 'crate' } };
    (room.on ??= []).push(
      { verb: 'look', a: 'crate', do: [{ gain: 'extra' }, { set: 'crate_seen' }] },
      { verb: 'look', a: 'crate', if: 'crate_seen', do: [{ set: 'ended' }] },
    );
    g.rooms.push({ id: 'nowhere', name: 'Nowhere', decor: 'x', on: [] });
    const s = await solve(g, {}, { mode: 'witness' });
    const r = lintContent(g, {}, { solve: s });
    expect(r.findings.some((f) => f.code === 'room-never-reached' && f.where.room === 'nowhere')).toBe(true);
    expect(
      r.findings
        .filter((f) => f.code === 'rule-never-run')
        .every((f) => f.solver === 'witness' && f.severity === 'info'),
    ).toBe(true);
  });

  it('the sample game has no error, and only the findings we know of', async () => {
    const s = await solve(demo, {}, { commands: demoCommands, mode: 'witness' });
    const r = lintContent(demo, {}, { solve: s, commands: demoCommands });
    expect(r.counts.error).toBe(0);
    expect(r.counts.warning).toBe(0);
    expect(r.findings.map((f) => `${f.code} ${f.where.room}/${f.where.path}`)).toEqual([
      'action-dead house/on[8]',
      'action-dead market/talk.neighbor[0]',
      'rule-no-effect house/talk.grandma[0]',
    ]);
  });

  it('counts a topic the solver tried as reached, even when it changed nothing', async () => {
    const s = await solve(demo, {}, { commands: demoCommands, mode: 'prove' });
    expect(s.truncated).toBe(false);
    expect(s.profile.attempted['topic:house.grandma.where-is-the-key']).toBeGreaterThan(0);
    const r = lintContent(demo, {}, { solve: s, commands: demoCommands });
    expect(r.findings.filter((f) => f.code === 'rule-never-run')).toEqual([]);
    const noEffect = r.findings.find((f) => f.code === 'rule-no-effect');
    expect(noEffect).toMatchObject({ severity: 'info', where: { room: 'house', path: 'talk.grandma[0]' } });
  }, 120_000); // the demo's full proof: 1.5 s here, far slower on a loaded runner (it timed out at 30 s three times in 4.1.6)

  it('a truncated proof never calls anything unreachable', async () => {
    const s = await solve(demo, {}, { commands: demoCommands, mode: 'prove', maxStates: 1 });
    expect(s.truncated).toBe(true);
    const r = lintContent(demo, {}, { solve: s, commands: demoCommands });
    const reach = r.findings.filter((f) => f.code === 'rule-never-run' || f.code === 'room-never-reached');
    expect(reach.length).toBeGreaterThan(0);
    expect(
      reach.every(
        (f) => f.severity === 'info' && f.message.includes('truncated search') && !f.fix.includes('nothing reaches'),
      ),
    ).toBe(true);
    expect(r.counts.warning).toBe(0);
  });
});
