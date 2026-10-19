// Remix's worlds in the bundled games (4.1.15, ADR 0018): applying a variant is plain data (reserved flags, an actor's
// starting room, codes and hints in every text, presentation values); the rules' order is never touched; each
// dimension kind has a real fixture (the demo's pantry key among three anchors; the reference's seller, his round, the
// festival order and its password); a coupled hint and its answer are never desynchronised, in English and in French,
// over every instance of the catalogue; presentation never reaches the solver's space (D27); the validator refuses an
// anchor nobody can reach, an actor with no place, a route that is not a script, a code nobody declared.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GameDef, Layout } from '@engine/core/types';
import { canonicalJson } from '@engine/core/canonical';
import { catalogue, compileVariant } from '@engine/core/remix/compile';
import { applyStory, applyVariant, compileGameManifest, variantFlags } from '@engine/core/remix/apply';
import { encodeSeedCode } from '@engine/core/remix/seed-code';
import { applyLocale } from '@engine/tools/i18n';
import { puzzleGraph } from '@engine/tools/puzzle';
import { solve } from '@engine/tools/solve';
import { validate } from '@engine/tools/validate';
import { coverage, describeVariant, instancesOf, remixGoals, variantOf } from '@engine/tools/remix';
import { game as demo } from '../games/demo/game';
import { commands } from '../games/demo/index';
import { game as reference } from '../games/reference/game';

const layoutsOf = (id: string): Record<string, Layout> =>
  Object.fromEntries(
    readdirSync(`games/${id}/layout`)
      .filter((f) => f.endsWith('.json'))
      .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(`games/${id}/layout/${f}`, 'utf8'))]),
  );
const fr = (id: string) => JSON.parse(readFileSync(`games/${id}/locales/fr.json`, 'utf8')) as Record<string, string>;
/** The ids of every rule, topic and listener, in order: what a variant must never reorder. */
const ruleOrder = (g: GameDef) =>
  canonicalJson([
    g.rooms.map((r) => [
      (r.on ?? []).map((x) => x.id),
      Object.values(r.talk ?? {}).map((t) => t.map((x) => x.id)),
      (r.events ?? []).map((x) => x.id),
    ]),
    (g.rules.on ?? []).map((x) => x.id),
    (g.events ?? []).map((x) => x.id),
  ]);
const strings = (x: unknown): string[] =>
  typeof x === 'string'
    ? [x]
    : Array.isArray(x)
      ? x.flatMap(strings)
      : x && typeof x === 'object'
        ? Object.values(x).flatMap(strings)
        : [];

describe('the demo: the pantry key among three anchors', () => {
  const c = compileGameManifest(demo);
  const worlds = instancesOf(demo, 'remix').variants;

  it('the catalogue is the three anchors; the story world writes no flag and is the game as written', () => {
    expect(worlds.map((v) => v.assignments['key-spot'])).toEqual(['market.stall', 'market.oranges', 'market.lantern']);
    const story = applyStory(demo);
    expect(story.start.flags ?? {}).toEqual(demo.start.flags ?? {});
    expect(canonicalJson({ ...story, variant: undefined })).toBe(canonicalJson(demo));
    expect(variantFlags(c, worlds[1]!)).toEqual({ 'remix.key-spot': 'market.oranges' });
  });
  it('every instance validates and is solved; the hidden key is found where its anchor says', async () => {
    const layouts = layoutsOf('demo');
    for (const v of worlds) {
      const g = applyVariant(demo, v);
      expect(validate(g, layouts, { commands }).errors, v.assignments['key-spot'] as string).toEqual([]);
      const r = await solve(g, layouts, { maxStates: 20000, commands });
      expect(r.status).toBe('solved');
      const spot = (v.assignments['key-spot'] as string).split('.')[1];
      if (spot !== 'stall') expect(r.path.join(' ')).toContain(spot);
    }
  }, 60_000);
  it('never reorders a rule; the puzzle graph is computed per instance', () => {
    for (const v of worlds) {
      const g = applyVariant(demo, v);
      expect(ruleOrder(g)).toBe(ruleOrder(demo));
      expect(puzzleGraph(g).nodes.length).toBeGreaterThan(0);
    }
  });
  it('presentation never writes a flag (D27): two worlds differing only by a line share their logical world', () => {
    const a = variantOf(c, 'remix', 0, { 'key-spot': 'market.oranges', 'oranges-line': 0 });
    const b = variantOf(c, 'remix', 1, { 'key-spot': 'market.oranges', 'oranges-line': 1 });
    const ga = applyVariant(demo, a);
    const gb = applyVariant(demo, b);
    expect(gb.start).toEqual(ga.start);
    expect(canonicalJson(gb.rooms)).not.toBe(canonicalJson(ga.rooms));
    expect(strings(gb.rooms)).toContain('An orange. Round, bright, and tragically not a fish.');
    const french = applyVariant(applyLocale(demo, fr('demo')), b, { lang: 'fr' });
    expect(strings(french.rooms)).toContain('Une orange. Ronde, vive, et tragiquement pas un poisson.');
  });
});

describe('the reference: an actor, a route, an order and a coupled password', () => {
  const c = compileGameManifest(reference);
  const all = catalogue(c, 'remix');

  it('a catalogue of 24 logical worlds, every value chosen', () => {
    expect(all).toHaveLength(24);
    const cov = coverage(
      c,
      'remix',
      all.map((a, i) => variantOf(c, 'remix', i, a)),
      { logicalOnly: true },
    );
    expect(cov.neverChosen).toEqual([]);
  });
  it("the seller's starting room and round, and the board before the lights", () => {
    const a = all.find(
      (x) =>
        x['seller-start'] === 'alley' &&
        x['seller-route'] === 'seller_rounds_late' &&
        canonicalJson(x['festival-order']) === '["board","lights"]',
    )!;
    const g = applyVariant(reference, variantOf(c, 'remix', 0, a));
    expect(g.characters.seller!.room).toBe('alley');
    expect(g.start.flags).toMatchObject({
      'remix.seller-route': 'seller_rounds_late',
      'remix.festival-order.board': 0,
      'remix.festival-order.lights': 1,
    });
    expect(ruleOrder(g)).toBe(ruleOrder(reference));
  });
  it('the hint and the answer are never desynchronised, in English and in French, over the whole catalogue', () => {
    const french = applyLocale(reference, fr('reference'));
    for (const [i, a] of all.entries()) {
      const v = variantOf(c, 'remix', i, a);
      const pair = (
        reference.remix!.dimensions.find((d) => d.id === 'festival-password') as unknown as {
          pairs: { hint: Record<string, string>; answer: string }[];
        }
      ).pairs[a['festival-password'] as number]!;
      for (const [g, lang] of [
        [applyVariant(reference, v), 'en'],
        [applyVariant(french, v, { lang: 'fr' }), 'fr'],
      ] as const) {
        const texts = strings({ rooms: g.rooms });
        expect(texts.some((t) => t.includes('{code:') || t.includes('{hint:'))).toBe(false);
        expect(texts.some((t) => t.includes(pair.hint[lang]!))).toBe(true);
        expect(texts.some((t) => t.startsWith(`${pair.answer} !`) || t.startsWith(`${pair.answer}!`))).toBe(true);
        // The answer the content accepts is the one the hint names: the reserved flag, or the story's when unset.
        const flag = g.start.flags?.['remix.festival-password'];
        expect(flag ?? '317').toBe(pair.answer);
        // No other pair's hint leaks into this world.
        for (const other of (
          reference.remix!.dimensions.find((d) => d.id === 'festival-password') as unknown as {
            pairs: { hint: Record<string, string> }[];
          }
        ).pairs)
          if (other.hint[lang] !== pair.hint[lang])
            expect(texts.some((t) => t.includes(other.hint[lang]!))).toBe(false);
      }
    }
  });
  it('the password world and the board-first world are solved to every objective', async () => {
    const layouts = layoutsOf('reference');
    const a = all.find(
      (x) =>
        x['festival-password'] === 2 &&
        canonicalJson(x['festival-order']) === '["board","lights"]' &&
        x['seller-start'] === 'alley',
    )!;
    const g = applyVariant(reference, variantOf(c, 'remix', 0, a));
    expect(remixGoals(reference)).toEqual(['password_ok', 'pirate_checked']);
    const r = await solve(g, layouts, {
      maxStates: 60000,
      goal: [...Object.values(g.objectives!).map((o) => o.done), ...remixGoals(g)],
    });
    expect(r.status).toBe('solved');
  }, 120_000);
  it('a seed reads as one line per dimension', () => {
    const v = compileVariant(c, reference.remix!, encodeSeedCode(7), 1, 'remix');
    const lines = describeVariant(reference, v);
    expect(lines).toHaveLength(1 + reference.remix!.dimensions.length);
    expect(lines.join('\n')).toMatch(/festival-password \[coupled\]: ".*" ↔ \d{3}/);
  });
});

describe('the validator reads the manifest', () => {
  const errorsOf = (g: GameDef) => validate(g, layoutsOf('demo')).errors.join('\n');

  it('refuses an anchor on nothing, an anchor in a room the start cannot reach, an actor with no place, a bad route', () => {
    const g = structuredClone(demo);
    const market = g.rooms.find((r) => r.id === 'market')!;
    market.anchors = { ...market.anchors, ghost: { at: 'nothing' } };
    g.rooms.push({
      ...structuredClone(market),
      id: 'island',
      anchors: { rock: { at: 'stall' } },
      on: [],
      talk: {},
      hints: [],
      scripts: [],
      onEnter: [],
    });
    g.remix = {
      ...g.remix!,
      dimensions: [
        ...g.remix!.dimensions,
        {
          id: 'grandma-start',
          kind: 'actor-start',
          actor: 'grandma',
          rooms: ['house', 'garden'],
          story: 'house',
          logical: true,
        },
        {
          id: 'lou-route',
          kind: 'actor-route',
          actor: 'neighbor',
          routes: ['lou_paces', 'nowhere'],
          story: 'lou_paces',
          logical: true,
        },
      ],
    };
    const text = errorsOf(g);
    expect(text).toMatch(/market.anchors.ghost › "nothing" is not a prop or hotspot of market/);
    expect(text).toMatch(/island.anchors.rock › the anchor is in island, a room the start cannot reach/);
    expect(text).toMatch(/garden has no actor for "grandma"/);
    expect(text).toMatch(/route "nowhere" is not a script/);
  });
  it('refuses a code placeholder no coupled dimension declares, and a presentation target that names nothing', () => {
    const g = structuredClone(demo);
    g.rooms[0]!.look = { ...g.rooms[0]!.look, clock: 'It says {code:time}.' };
    g.remix = {
      ...g.remix!,
      dimensions: [
        ...g.remix!.dimensions,
        { id: 'x', kind: 'presentation', target: 'line:no-such-line', values: ['a'], story: 0, logical: false },
      ],
    };
    g.rooms[0]!.on = [
      ...(g.rooms[0]!.on ?? []),
      { id: 'house.cheat', verb: 'look', a: 'clock', do: [{ set: 'remix.key-spot' }] },
    ];
    const text = errorsOf(g);
    expect(text).toMatch(/"remix.key-spot" is a reserved Remix flag/);
    expect(text).toMatch(/\{code:time\}: "time" is not a coupled dimension/);
    expect(text).toMatch(/target "line:no-such-line" names nothing/);
  });
  it("refuses a presentation value on a minigame parameter that decides a win (the wheel's answers), allows a text", () => {
    const g = structuredClone(reference);
    const base = g.remix!.dimensions;
    g.remix = {
      ...g.remix!,
      dimensions: [
        ...base,
        {
          id: 'answers',
          kind: 'presentation',
          target: 'minigame:hall.use-map:answers',
          values: [['A', 'B', 'C', 'D', 'E']],
          story: 0,
          logical: false,
        },
        {
          id: 'win-line',
          kind: 'presentation',
          target: 'minigame:hall.use-map:win',
          values: ['Aye!', 'Arr!'],
          story: 0,
          logical: false,
        },
      ],
    };
    const text = validate(g, layoutsOf('reference')).errors.join('\n');
    expect(text).toMatch(
      /remix.answers › target "minigame:hall.use-map:answers" names nothing, or a minigame parameter/,
    );
    expect(text).not.toMatch(/win-line/);
  });
  it('warns when no condition reads a logical value: that world would play like the story', () => {
    const g = structuredClone(demo);
    const d = g.remix!.dimensions[0] as unknown as { anchors: { room: string; anchor: string }[] };
    d.anchors = [...d.anchors, { room: 'market', anchor: 'far' }];
    g.rooms.find((r) => r.id === 'market')!.anchors!.far = { at: 'far_stalls', reachableBy: 'bouquet_given' };
    expect(validate(g, layoutsOf('demo')).warnings.join('\n')).toMatch(
      /no condition reads remix.key-spot = "market.far"/,
    );
  });
  it('the bundled games validate with their manifests', () => {
    expect(validate(demo, layoutsOf('demo')).errors).toEqual([]);
    expect(validate(reference, layoutsOf('reference')).errors).toEqual([]);
  });
});
