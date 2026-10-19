// The puzzle graph (src/engine/tools/puzzle.ts): what each action needs and changes, derived from the content.
import { describe, expect, it } from 'vitest';
import { condAtoms } from '@engine/core/cond';
import {
  extraReads,
  findNode,
  heatFill,
  liveClasses,
  puzzleFor,
  puzzleGraph,
  puzzleIssues,
  puzzleMarkdown,
  toPuzzleDot,
  toPuzzleSvg,
  whyLive,
} from '@engine/tools/puzzle';
import { game as demo } from '../games/demo/game';
import { commands } from '../games/demo/index';
import { validate } from '@engine/tools/validate';
import { grog, grogLayouts, mansion, stan } from './fixtures/classics';
import { scale } from './fixtures/scale';

describe('condAtoms', () => {
  it('lists what a condition reads, with negations', () => {
    expect(
      condAtoms(
        {
          all: [
            'a',
            '!b',
            { not: { has: 'key' } },
            { flag: 'n', gte: 2 },
            { prop: ['door', 'open'] },
            { actorIn: ['cook', 'hall'] },
          ],
        },
        'kitchen',
      ),
    ).toEqual([
      { kind: 'flag', id: 'a' },
      { kind: 'flag', id: 'b', neg: true },
      { kind: 'has', id: 'key', neg: true },
      { kind: 'flag', id: 'n', detail: '≥ 2' },
      { kind: 'prop', id: 'kitchen.door', detail: 'open' },
      { kind: 'actorIn', id: 'cook@hall' },
    ]);
    expect(condAtoms({ not: '!x' })).toEqual([{ kind: 'flag', id: 'x' }]);
  });
});

describe('the puzzle graph', () => {
  it('links items, flags and actions', () => {
    const g = puzzleGraph(grog());
    const mug = puzzleFor(g, 'mug_grog')!;
    expect(mug.node).toMatchObject({ kind: 'item', label: 'mug of grog' });
    expect(mug.acquiredBy.map((a) => a.action.label).sort()).toEqual(['use barrel', 'use mug_holey + barrel']);
    expect(mug.consumedBy.map((a) => a.action.label).sort()).toEqual(['script mug_melts', 'use mug_grog + lock']);
    expect(mug.usedBy.map((u) => u.action.label)).toContain('use mug_grog + lock');
    expect(mug.unlocks.map((n) => n.id)).toEqual(expect.arrayContaining(['flag:free', 'end:end', 'item:mug_holey']));
    expect(findNode(g, 'item:mug_holey')).toBeDefined();
    expect(puzzleFor(g, 'nothing')).toBeUndefined();
    // the script's while is a gate, its effects are effects
    expect(g.edges).toContainEqual({ from: 'item:mug_grog', to: 'script:mug_melts', kind: 'requires' });
    expect(g.edges).toContainEqual({ from: 'script:mug_melts', to: 'item:mug_holey', kind: 'produces' });
  });

  it('sees events, moved characters, counters and goals', () => {
    const g = puzzleGraph(mansion());
    expect(g.edges).toContainEqual({ from: 'script:edna_patrols', to: 'event:edna_moved', kind: 'produces' });
    expect(g.edges).toContainEqual({ from: 'event:edna_moved', to: 'listener:game/events[0]', kind: 'requires' });
    expect(g.edges).toContainEqual({ from: 'actor:edna@hall', to: 'rule:hall/enter', kind: 'reads' });
    const s = puzzleGraph(stan());
    expect(s.edges).toContainEqual({ from: 'rule:game/start', to: 'flag:price', kind: 'produces', detail: '= 8000' });
    expect(s.edges.filter((e) => e.to === 'flag:price' && e.kind === 'produces').map((e) => e.detail)).toContain(
      '-1000',
    );
    const sc = puzzleGraph(scale());
    expect(sc.nodes.some((n) => n.kind === 'goal')).toBe(true);
  });

  it('renders as SVG, DOT and Markdown', () => {
    const g = puzzleGraph(grog());
    expect(toPuzzleSvg(g)).toContain('data-node="item:mug_grog"');
    expect(toPuzzleDot(g)).toContain('"item:mug_grog" -> "rule:jail/on[0]"');
    expect(puzzleMarkdown(g)).toContain('| item mug of grog |');
    expect(puzzleMarkdown(g, 'free')).toContain('**acquired by:** use mug_grog + lock (jail)');
    expect(puzzleMarkdown(g, 'nope')).toMatch(/^No item/);
  });

  it('finds the flag nobody can ever set, and the validator warns', () => {
    const g = grog();
    g.rooms[0].on!.push({ verb: 'use', a: 'door', if: 'locked', do: [{ set: 'locked' }] });
    expect(puzzleIssues(puzzleGraph(g)).selfLocked.map((n) => n.label)).toEqual(['locked']);
    expect(
      validate(g, grogLayouts).warnings.some((w) => /"locked" is only set by actions that already require it/.test(w)),
    ).toBe(true);
    expect(puzzleIssues(puzzleGraph(grog())).selfLocked).toEqual([]);
  });
});

describe('why the solver keeps a thing', () => {
  it('classes every node: critical reaches the end or a goal, dead is read by nothing live', () => {
    const g = puzzleGraph(demo, { commands });
    const extra = extraReads(demo);
    const cl = liveClasses(g, extra);
    expect(cl.get('item:key')).toBe('critical');
    expect(cl.get('end:end')).toBe('critical');
    expect(cl.get('flag:guess')).toBe('visible'); // only the ending's guess reads it
    expect(cl.get('flag:tea_drunk')).toBe('dead');
    expect([...cl.values()].filter((c) => c === 'critical').length).toBeGreaterThan(20);
  });
  it('explains the chain from a thing to its seed', () => {
    const g = puzzleGraph(demo, { commands });
    const extra = extraReads(demo);
    const why = whyLive(g, 'key', extra);
    expect(why.class).toBe('critical');
    expect(why.chain.map((n) => n.id)).toEqual(['item:key', 'goal:finale']);
    expect(whyLive(g, 'tea_drunk', extra)).toEqual({ class: 'dead', chain: [] });
    const card = puzzleMarkdown(g, 'key', { extra });
    expect(card).toContain('**solver: critical:**');
    expect(card).toContain('pantry key → goal goal finale');
    expect(puzzleFor(g, 'key')!.live).toBeUndefined();
  });
  it('draws heat and fades everything off the critical path', () => {
    const g = puzzleGraph(demo, { commands });
    const cl = liveClasses(g, extraReads(demo));
    const svg = toPuzzleSvg(g, {
      heat: { 'rule:house/enter': 24, 'rule:garden/enter': 2 },
      focus: new Set([...cl].filter(([, c]) => c === 'critical').map(([id]) => id)),
    });
    expect(svg).toContain('rule:house/enter · 24');
    expect(svg).toContain('opacity="0.25"');
    expect(heatFill(0)).not.toBe(heatFill(1));
  });
});
