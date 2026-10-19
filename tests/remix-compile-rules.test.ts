// Remix's compiler, rule by rule (4.1.17, mutation pass on core/remix/compile.ts and seed-code.ts): each manifest
// problem is raised alone with its exact text (a dimension or a mode declared twice, a group listed twice, an empty
// domain, a not-behind rule nobody wrote, an unknown or presentation dimension in a constraint, a daily mode nobody
// declared, a story world that breaks a constraint); `not-behind` reads `set` as a flag or a `[flag, value]` pair at
// any depth; an anchor is refused only when it needs its own item (never through `not`); a term splits at its first
// `=` and an order is written `a>b`; `uniform` rejects the biased tail and draws nothing for one value; each draw
// comes from its named stream (logic for a world, cosmetic for presentation, D27), so version 1's worlds are frozen;
// a generator keeps the fixed dimensions at their story value and backtracks; a catalogue holds exactly
// `CATALOGUE_MAX`; a seed code's range, prefix and WebCrypto draw.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@engine/core/canonical';
import { derive, type Prng } from '@engine/core/prng';
import {
  CATALOGUE_MAX,
  catalogue,
  compileManifest,
  compileVariant,
  RemixManifestError,
  type RemixWorld,
  uniform,
  violations,
} from '@engine/core/remix/compile';
import type {
  AnchorDef,
  VariationConstraint,
  VariationDimension,
  VariationManifest,
  VariationMode,
} from '@engine/core/remix/manifest';
import { encodeSeedCode, isSeed, newSeedCode, normalizeSeed, RemixSeedError } from '@engine/core/remix/seed-code';

/** One room `r` with three anchors (a, b, c) and one rule `open`. */
const world = (anchors: Record<string, AnchorDef> = {}, rules: RemixWorld['rules'] = []): RemixWorld => ({
  rooms: [{ id: 'r', anchors: { a: { at: 'a' }, b: { at: 'b' }, c: { at: 'c' }, ...anchors } }],
  rules,
});
const at = (anchor: string) => ({ room: 'r', anchor });
const placement = (id: string, item: string, anchors: string[], story: string): VariationDimension => ({
  id,
  kind: 'item-placement',
  item,
  anchors: anchors.map(at),
  story: at(story),
  logical: true,
});
const coupled = (id: string, n: number): VariationDimension => ({
  id,
  kind: 'coupled',
  story: 0,
  logical: true,
  pairs: Array.from({ length: n }, (_, i) => ({ hint: `h${i}`, answer: `${id}${i}` })),
});
const order: VariationDimension = {
  id: 'o',
  kind: 'puzzle-order',
  groups: ['x', 'y'],
  graph: [],
  story: ['x', 'y'],
  logical: true,
};
const pres = (id: string, n: number): VariationDimension => ({
  id,
  kind: 'presentation',
  target: `line:${id}`,
  values: Array.from({ length: n }, (_, i) => `v${i}`),
  story: 0,
  logical: false,
});
const BASE_DIMS = [placement('k', 'key', ['a', 'b'], 'a'), coupled('n', 3), order, pres('p', 2)];
const manifest = (over: {
  dimensions?: VariationDimension[];
  modes?: VariationMode[];
  constraints?: VariationConstraint[];
  daily?: VariationManifest['daily'];
}): VariationManifest => ({
  schema: 1,
  algorithm: 'web-scumm-remix-1',
  modes: over.modes ?? [{ id: 'remix', strategy: 'generator', dimensions: ['k', 'n', 'o', 'p'] }],
  dimensions: over.dimensions ?? BASE_DIMS,
  constraints: over.constraints ?? [],
  ...(over.daily ? { daily: over.daily } : {}),
});
/** The problems a manifest is refused with ([] when it compiles); any other error escapes. */
const problemsOf = (m: VariationManifest, w: RemixWorld = world()): readonly string[] => {
  try {
    compileManifest(m, w);
    return [];
  } catch (e) {
    if (e instanceof RemixManifestError) return e.problems;
    throw e;
  }
};
const seeds = (n: number) => Array.from({ length: n }, (_, x) => encodeSeedCode(x * 7919 + 1));

describe('each manifest problem, alone and in its words', () => {
  it('the base manifest compiles', () => {
    expect(problemsOf(manifest({}))).toEqual([]);
  });
  it('a dimension declared twice', () => {
    expect(problemsOf(manifest({ dimensions: [...BASE_DIMS, coupled('n', 3)] }))).toEqual([
      'dimension "n" is declared twice',
    ]);
  });
  it('a not-behind naming a rule the game does not have', () => {
    expect(problemsOf(manifest({ constraints: [{ kind: 'not-behind', item: 'key', action: 'ghost' }] }))).toEqual([
      'not-behind: unknown rule "ghost"',
    ]);
  });
  it('a puzzle group listed twice', () => {
    const twice: VariationDimension = { ...order, groups: ['x', 'y', 'x'], story: ['x', 'y'] };
    expect(problemsOf(manifest({ dimensions: [BASE_DIMS[0]!, BASE_DIMS[1]!, twice, BASE_DIMS[3]!] }))).toContain(
      'o: a group is listed twice',
    );
  });
  it('an empty domain (not-behind removed every anchor)', () => {
    const w = world({ a: { at: 'a', reachableBy: 'opened' }, b: { at: 'b', reachableBy: 'opened' } }, [
      { id: 'open', kind: 'use', do: [{ set: 'opened' }] },
    ]);
    expect(problemsOf(manifest({ constraints: [{ kind: 'not-behind', item: 'key', action: 'open' }] }), w)).toEqual([
      'k: its domain is empty',
      `k: its story value ${canonicalJson('r.a')} is not in its domain`,
    ]);
  });
  it('a mode declared twice', () => {
    const remix: VariationMode = { id: 'remix', strategy: 'generator', dimensions: ['n'] };
    expect(problemsOf(manifest({ modes: [remix, remix] }))).toEqual(['mode "remix" is declared twice']);
  });
  it('an unknown dimension in exclusive or requires', () => {
    expect(problemsOf(manifest({ constraints: [{ kind: 'exclusive', dimensions: ['n', 'ghost'] }] }))).toEqual([
      'exclusive: unknown dimension "ghost"',
    ]);
    expect(problemsOf(manifest({ constraints: [{ kind: 'requires', a: 'ghost=1', b: 'n=1' }] }))).toEqual([
      'requires: unknown dimension in "ghost=1"',
    ]);
  });
  it('a presentation dimension in requires (D27)', () => {
    expect(problemsOf(manifest({ constraints: [{ kind: 'requires', a: 'p=0', b: 'n=1' }] }))).toEqual([
      'requires: "p" is presentation; a constraint binds logical dimensions only (D27)',
    ]);
  });
  it('a term with no `=` names no value', () => {
    expect(problemsOf(manifest({ constraints: [{ kind: 'requires', a: 'n', b: 'n=1' }] }))).toEqual([
      'requires: "n" names no value of n',
    ]);
  });
  it('a daily naming a mode nobody declared', () => {
    expect(problemsOf(manifest({ daily: { kid: 'k1', publicKey: 'AAAA', mode: 'nope' } }))).toEqual([
      'daily: unknown mode "nope"',
    ]);
  });
  it('a story world that breaks a constraint; checked only once every other problem is gone', () => {
    const dims = [...BASE_DIMS, coupled('m', 3)];
    const exclusive: VariationConstraint = { kind: 'exclusive', dimensions: ['n', 'm'] };
    expect(problemsOf(manifest({ dimensions: dims, constraints: [exclusive] }))).toEqual([
      'the story world breaks a constraint: n and m take the same value',
    ]);
    expect(
      problemsOf(
        manifest({ dimensions: dims, constraints: [exclusive], daily: { kid: 'k1', publicKey: 'AAAA', mode: 'x' } }),
      ),
    ).toEqual(['daily: unknown mode "x"']);
  });
});

describe('not-behind and the anchors that need their own item', () => {
  it('reads `set` as a flag, a [flag, value] pair, nested, past a plain-string command', () => {
    const w = world(
      {
        a: { at: 'a', reachableBy: 'opened' },
        b: { at: 'b', reachableBy: { all: ['lit', { flag: 'deep', eq: true }] } },
        d: { at: 'd', reachableBy: '!pair' },
      },
      [{ id: 'open', kind: 'use', do: ['wait', { set: 'opened' }, { if: 'x', then: [{ set: 'deep' }] }] }],
    );
    const w2 = world({ d: { at: 'd', reachableBy: '!pair' } }, [
      { id: 'open', kind: 'use', do: [{ set: ['pair', true] }] },
    ]);
    const m = manifest({
      dimensions: [placement('k', 'key', ['a', 'b', 'c', 'd'], 'c')],
      modes: [],
      constraints: [{ kind: 'not-behind', item: 'key', action: 'open' }],
    });
    expect(compileManifest(m, w).dims.get('k')!.domain).toEqual(['r.c', 'r.d']);
    expect(compileManifest(m, w2).dims.get('k')!.domain).toEqual(['r.a', 'r.b', 'r.c']);
  });
  it('an anchor is refused only when it needs its own item, through all/any but never through not', () => {
    const fine = world({
      a: { at: 'a', reachableBy: { flag: 'f' } },
      b: { at: 'b', reachableBy: { has: 'lamp' } },
      c: { at: 'c', reachableBy: { not: { has: 'key' } } },
      d: { at: 'd', reachableBy: { prop: ['door', 'open'] } },
    });
    const m = manifest({ dimensions: [placement('k', 'key', ['a', 'b', 'c', 'd'], 'a')], modes: [] });
    expect(problemsOf(m, fine)).toEqual([]);
    const nested = world({
      b: { at: 'b', reachableBy: { any: [{ flag: 'f' }, { all: [{ has: 'key' }] }] } },
      d: { at: 'd' },
    });
    expect(problemsOf(m, nested)).toEqual(['k: anchor "r.b" is reached only with "key", the item placed there']);
  });
});

describe('violations: terms and exclusive', () => {
  const actor: VariationDimension = {
    id: 'w',
    kind: 'actor-start',
    actor: 'cat',
    rooms: ['r', 's=t'],
    story: 'r',
    logical: true,
  };
  const dims = [...BASE_DIMS, { ...coupled('m', 3), story: 1 } as VariationDimension, actor];
  const c = compileManifest(
    manifest({
      dimensions: dims,
      modes: [],
      constraints: [
        { kind: 'exclusive', dimensions: ['n', 'm'] },
        { kind: 'requires', a: 'w=s=t', b: 'n=1' },
        { kind: 'requires', a: 'o=y>x', b: 'm=2' },
      ],
    }),
    world(),
  );
  it('exclusive: two dimensions with one value; a dimension the assignment lacks is skipped', () => {
    expect(violations(c, { n: 1, m: 1 })).toEqual(['n and m take the same value']);
    expect(violations(c, { n: 1, m: 2 })).toEqual([]);
    expect(violations(c, { m: 1 })).toEqual([]);
  });
  it('a term splits at its first `=`; an order is written with `>`', () => {
    expect(violations(c, { w: 's=t', n: 0, m: 2 })).toEqual(['w=s=t requires n=1']);
    expect(violations(c, { w: 's=t', n: 1, m: 2 })).toEqual([]);
    expect(violations(c, { o: ['y', 'x'], n: 0, m: 1 })).toEqual(['o=y>x requires m=2']);
    expect(violations(c, { o: ['y', 'x'], n: 0, m: 2 })).toEqual([]);
  });
});

describe('uniform', () => {
  const fake = (xs: number[]) => {
    const q = [...xs];
    return { nextU32: () => q.shift()! } as unknown as Prng;
  };
  it('one value (or none) is 0 and draws nothing from the stream', () => {
    const r = derive('u', 'logic');
    expect(uniform(r, 1)).toBe(0);
    expect(r.nextU32()).toBe(derive('u', 'logic').nextU32());
    // Checked after the line above: without the guard, n = 0 would never leave the rejection loop.
    expect(uniform(fake([]), 0)).toBe(0);
  });
  it('rejects the biased tail [2^32 - 2^32 mod n, 2^32) and keeps everything below', () => {
    // n = 3: 2^32 mod 3 = 1, so the limit is 4294967295, itself refused.
    expect(uniform(fake([4294967295, 5]), 3)).toBe(2);
    expect(uniform(fake([4294967294]), 3)).toBe(4294967294 % 3);
    // n = 5: 2^32 mod 5 = 1 as well; n = 7: 2^32 mod 7 = 4, limit 4294967292.
    expect(uniform(fake([4294967292, 4294967295, 9]), 7)).toBe(2);
  });
});

describe('streams and generation (version 1 is frozen)', () => {
  const dims = [...BASE_DIMS, pres('q', 3)];
  const m = manifest({
    dimensions: dims,
    modes: [
      { id: 'remix', strategy: 'generator', dimensions: ['n', 'p'] },
      { id: 'cat', strategy: 'catalogue', dimensions: ['n', 'o'] },
    ],
  });
  const c = compileManifest(m, world());
  it('a generator draws a logical value from the logic stream named after the dimension', () => {
    for (const s of seeds(20))
      expect(compileVariant(c, m, s).assignments.n).toBe(uniform(derive(`${s}|remix|n`, 'logic'), 3));
  });
  it('a presentation value comes from the cosmetic stream (D27); one the mode leaves alone keeps its story value', () => {
    for (const s of seeds(20)) {
      const a = compileVariant(c, m, s).assignments;
      expect(a.p).toBe(uniform(derive(`${s}|remix|p`, 'cosmetic'), 2));
      expect(a.q).toBe(0);
    }
  });
  it('a catalogue mode picks from its enumerated list with the logic stream `catalogue:<mode>`', () => {
    const list = catalogue(c, 'cat');
    expect(list).toHaveLength(6);
    for (const s of seeds(20)) {
      const a = compileVariant(c, m, s, 1, 'cat').assignments;
      const pick = list[uniform(derive(`${s}|remix|catalogue:cat`, 'logic'), list.length)]!;
      expect({ n: a.n, o: a.o, k: a.k }).toEqual(pick);
    }
  });
  it('mode `story` gives the story seed even with a code', () => {
    const v = compileVariant(c, m, encodeSeedCode(5), 1, 'story');
    expect(v.seed).toBe('story');
    expect(v.mode).toBe('story');
  });
});

describe('a generator around fixed dimensions', () => {
  const w = world();
  it('a dimension the mode does not vary keeps its story value and bounds the others', () => {
    const m = manifest({
      dimensions: [placement('k', 'key', ['a', 'b', 'c'], 'a'), placement('j', 'pipe', ['a', 'b', 'c'], 'b')],
      modes: [{ id: 'remix', strategy: 'generator', dimensions: ['k'] }],
      constraints: [{ kind: 'exclusive', dimensions: ['k', 'j'] }],
    });
    const c = compileManifest(m, w);
    const seen = new Set<unknown>();
    for (const s of seeds(60)) {
      const a = compileVariant(c, m, s).assignments;
      expect(a.j).toBe('r.b');
      expect(a.k).not.toBe('r.b');
      seen.add(a.k);
    }
    expect([...seen].sort()).toEqual(['r.a', 'r.c']);
  });
  it('a varying dimension is not held at its story value while an earlier one is drawn', () => {
    const m = manifest({
      dimensions: [placement('k', 'key', ['a', 'b', 'c'], 'a'), placement('j', 'pipe', ['a', 'b', 'c'], 'b')],
      modes: [{ id: 'remix', strategy: 'generator', dimensions: ['k', 'j'] }],
      constraints: [{ kind: 'exclusive', dimensions: ['k', 'j'] }],
    });
    const c = compileManifest(m, w);
    expect(seeds(60).some((s) => compileVariant(c, m, s).assignments.k === 'r.b')).toBe(true);
  });
  it('a value whose subtree dead-ends is abandoned, never returned half-built', () => {
    const m = manifest({
      dimensions: [
        placement('t', 'key', ['a', 'b', 'c'], 'c'),
        placement('u', 'pipe', ['a', 'b'], 'b'),
        placement('v', 'cup', ['a'], 'a'),
      ],
      modes: [{ id: 'remix', strategy: 'generator', dimensions: ['t', 'u', 'v'] }],
    });
    const c = compileManifest(m, w);
    for (const s of seeds(60)) expect(compileVariant(c, m, s).assignments).toEqual({ t: 'r.c', u: 'r.b', v: 'r.a' });
  });
});

describe('catalogue', () => {
  it('an unknown mode is a seed error', () => {
    const c = compileManifest(manifest({}), world());
    expect(() => catalogue(c, 'nope')).toThrow(RemixSeedError);
    expect(() => catalogue(c, 'nope')).toThrow('unknown mode "nope"');
  });
  it('holds every logical dimension (fixed ones at their story value), no presentation, constraints applied', () => {
    const m = manifest({
      dimensions: [...BASE_DIMS, placement('j', 'pipe', ['a', 'b'], 'b')],
      modes: [{ id: 'cat', strategy: 'catalogue', dimensions: ['k', 'j', 'p'] }],
    });
    const list = catalogue(compileManifest(m, world()), 'cat');
    // k, j over {a, b} with capacity 1: only the two crossed worlds.
    expect(list).toEqual([
      { k: 'r.a', n: 0, o: ['x', 'y'], j: 'r.b' },
      { k: 'r.b', n: 0, o: ['x', 'y'], j: 'r.a' },
    ]);
  });
  it(`exactly ${CATALOGUE_MAX} instances is still a catalogue`, () => {
    const m = manifest({
      dimensions: [coupled('n', 100), coupled('m', 100)],
      modes: [{ id: 'cat', strategy: 'catalogue', dimensions: ['n', 'm'] }],
    });
    expect(catalogue(compileManifest(m, world()), 'cat')).toHaveLength(CATALOGUE_MAX);
  });
});

describe('seed codes: range, prefix, isSeed, WebCrypto', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('encodes exactly the integers of [0, 2^35)', () => {
    expect(encodeSeedCode(0)).toBe('WS-0000-0000');
    expect(normalizeSeed(encodeSeedCode(2 ** 35 - 1))).toBe(encodeSeedCode(2 ** 35 - 1));
    for (const v of [2 ** 35, -1, 0.5, Number.NaN, 2 ** 36])
      expect(() => encodeSeedCode(v), String(v)).toThrow(`seed value out of range: ${v}`);
  });
  it('the `WS` prefix is optional; the length error counts eight symbols', () => {
    const code = encodeSeedCode(123_456_789);
    expect(normalizeSeed(code.slice(3))).toBe(code);
    expect(() => normalizeSeed('WS-000')).toThrow('a seed code has 8 symbols after "WS-": "WS-000"');
  });
  it('isSeed says yes to a code and to story, no to a typo', () => {
    expect(isSeed(encodeSeedCode(7))).toBe(true);
    expect(isSeed('story')).toBe(true);
    expect(isSeed('WS-0000-0001')).toBe(false);
  });
  it('newSeedCode: 32 bits from the first word and 3 from the second; no WebCrypto is an error', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (w: Uint32Array) => {
        w[0] = 1;
        w[1] = 11;
        return w;
      },
    });
    expect(newSeedCode()).toBe(encodeSeedCode(1 * 8 + 3));
    vi.stubGlobal('crypto', undefined);
    expect(() => newSeedCode()).toThrow(RemixSeedError);
    expect(() => newSeedCode()).toThrow('no WebCrypto to draw a fresh seed: type a code instead');
  });
  it('newSeedCode draws a well-formed code from the real WebCrypto', () => {
    expect(isSeed(newSeedCode())).toBe(true);
  });
});

describe('a stored world of another algorithm', () => {
  it('is refused for its algorithm, even with a correct hash of its own', async () => {
    const { game: demo } = await import('../games/demo/game');
    const { compileGameManifest } = await import('@engine/core/remix/apply');
    const { loadVariant } = await import('@engine/core/remix/compile');
    const { variantHash } = await import('@engine/core/remix/story');
    const c = compileGameManifest(demo);
    const v = compileVariant(c, demo.remix!, encodeSeedCode(5), 1, 'remix');
    const { hash: _, ...body } = { ...v, algorithm: 'web-scumm-remix/other' };
    const forged = { ...body, hash: variantHash(body as never) };
    let err: unknown;
    try {
      loadVariant(c, forged);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(RemixSeedError);
    expect(err).toMatchObject({ code: 'world-shape', message: 'unknown Remix algorithm "web-scumm-remix/other"' });
    expect(loadVariant(c, v).variant).toEqual(v);
  });
});
