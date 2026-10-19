// Remix's compiler (4.1.15, ADR 0018): `GameIR + VariationManifest + seed + algorithmVersion → WorldVariant`. The hash
// is SHA-256 written out (the same as WebCrypto); a seed code carries a check symbol; a malformed seed, an unknown mode
// or version is an explicit error; an impossible manifest is a build error; every well-formed seed gives a valid world
// (10 000 seeds on the demo's extension, a generator); a catalogue is enumerated whole and refused beyond 10 000;
// presentation draws never move a logical one (D27); nothing on this path calls Math.random.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@engine/core/canonical';
import { compileIR } from '@engine/core/ir';
import { compileGame } from '@engine/core/define';
import {
  CATALOGUE_MAX,
  catalogue,
  compileManifest,
  compileVariant,
  linearExtensions,
  loadVariant,
  RemixManifestError,
  violations,
} from '@engine/core/remix/compile';
import { applyVariant, compileGameManifest, remixWorld } from '@engine/core/remix/apply';
import { parseManifest, type VariationManifest } from '@engine/core/remix/manifest';
import { encodeSeedCode, normalizeSeed, RemixSeedError } from '@engine/core/remix/seed-code';
import { sha256HexSync } from '@engine/core/remix/sha256';
import { game as demo } from '../games/demo/game';
import { extendedDemo, extensionManifest } from './fixtures/remix-extension';

const webSha = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

describe('sha256HexSync', () => {
  it('equals WebCrypto on the padding boundaries, Unicode and a long text', async () => {
    const inputs = [
      '',
      'abc',
      'a'.repeat(55),
      'a'.repeat(56),
      'a'.repeat(63),
      'a'.repeat(64),
      'a'.repeat(65),
      'é🐈‍⬛日本',
      'x'.repeat(10_000),
    ];
    for (const s of inputs) expect(sha256HexSync(s), JSON.stringify(s.slice(0, 8))).toBe(await webSha(s));
    expect(sha256HexSync('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('equals WebCrypto on 200 random strings', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ unit: 'binary', maxLength: 300 }),
        async (s) => sha256HexSync(s) === (await webSha(s)),
      ),
      { numRuns: 200 },
    );
  });
});

describe('seed codes', () => {
  it('round-trips every value, with its check symbol, and forgives case, I/L/O and dashes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 35 - 1 }),
        (v) => normalizeSeed(encodeSeedCode(v)) === encodeSeedCode(v),
      ),
    );
    const code = encodeSeedCode(123456789);
    expect(code).toMatch(/^WS-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(normalizeSeed(code.toLowerCase().replace(/-/g, ' '))).toBe(code);
    expect(normalizeSeed('ws-0000-0000')).toBe('WS-0000-0000');
    expect(normalizeSeed('WS-OOOO-OOOO')).toBe('WS-0000-0000');
    expect(normalizeSeed('Story')).toBe('story');
  });
  it('refuses a malformed code, a wrong check symbol and a symbol outside the alphabet', () => {
    expect(() => normalizeSeed('WS-0000-0001')).toThrow(RemixSeedError);
    expect(() => normalizeSeed('WS-000')).toThrow(/symbols/);
    expect(() => normalizeSeed('WS-00U0-0000')).toThrow(/not a symbol/);
    expect(() => normalizeSeed('hello world')).toThrow(RemixSeedError);
    // Non-ASCII lookalikes are refused before any case mapping (ı would uppercase to I, then read as 1).
    expect(() => normalizeSeed('WS-ı000-0000')).toThrow(/plain letters and digits/);
    expect(() => normalizeSeed('ＷＳ-0000-0000')).toThrow(/plain letters and digits/);
  });
  it('a one-symbol typo is always caught by the check symbol', () => {
    let caught = 0;
    let total = 0;
    for (let v = 0; v < 2000; v++) {
      const code = encodeSeedCode(v * 17_179_869);
      const i = 3 + (v % 4);
      const typo = code.slice(0, i) + (code[i] === '7' ? '8' : '7') + code.slice(i + 1);
      total++;
      try {
        normalizeSeed(typo);
      } catch {
        caught++;
      }
    }
    expect(caught).toBe(total);
  });
});

describe('the manifest', () => {
  it('its schema refuses a malformed manifest and accepts the bundled ones', () => {
    expect(() => parseManifest({ schema: 2 })).toThrow();
    expect(() => parseManifest({ ...extensionManifest, algorithm: 'other' })).toThrow();
    expect(parseManifest(demo.remix)).toBeTruthy();
    expect(parseManifest(extensionManifest)).toBeTruthy();
  });
  it('an impossible manifest is a build error with every reason', () => {
    const g = extendedDemo();
    const bad: VariationManifest = {
      ...extensionManifest,
      modes: [{ id: 'remix', strategy: 'generator', dimensions: ['nope'] }],
      dimensions: [
        {
          id: 'k',
          kind: 'item-placement',
          item: 'key',
          anchors: [{ room: 'house', anchor: 'ghost' }],
          story: { room: 'house', anchor: 'clock' },
          logical: true,
        },
        {
          id: 'c',
          kind: 'coupled',
          story: 5,
          logical: true,
          pairs: [
            { hint: 'a', answer: '1' },
            { hint: 'b', answer: '1' },
          ],
        },
        { id: 'o', kind: 'puzzle-order', groups: ['a', 'b'], graph: [['a', 'z']], story: ['b', 'a'], logical: true },
        { id: 'p', kind: 'presentation', target: 'line:x', values: ['x'], story: 0, logical: false },
      ],
      constraints: [
        { kind: 'exclusive', dimensions: ['k', 'p'] },
        { kind: 'requires', a: 'k=house.clock', b: 'c=9' },
      ],
    };
    let problems: readonly string[] = [];
    try {
      compileManifest(bad, remixWorld(g));
    } catch (e) {
      expect(e).toBeInstanceOf(RemixManifestError);
      problems = (e as RemixManifestError).problems;
    }
    const text = problems.join('\n');
    expect(text).toMatch(/unknown anchor "house.ghost"/);
    expect(text).toMatch(/c: two pairs share an answer/);
    expect(text).toMatch(/c: its story value 5/);
    expect(text).toMatch(/o: the edge a → z/);
    expect(text).toMatch(/mode remix: unknown dimension "nope"/);
    expect(text).toMatch(/"p" is presentation/);
    expect(text).toMatch(/"c=9" names no value/);
  });
  it('an anchor reached only with the item placed there is refused; not-behind removes anchors behind the action', () => {
    const g = extendedDemo();
    g.rooms.find((r) => r.id === 'house')!.anchors!.clock = { at: 'clock', reachableBy: { all: [{ has: 'token' }] } };
    expect(() => compileGameManifest(g)).toThrow(/reached only with "token"/);
    const h = extendedDemo();
    h.rooms.find((r) => r.id === 'garden')!.anchors!.tree = { at: 'tree', reachableBy: 'pantry_open' };
    h.remix = {
      ...extensionManifest,
      constraints: [
        ...extensionManifest.constraints,
        { kind: 'not-behind', item: 'token', action: 'house.use-key-pantry' },
      ],
    };
    const c = compileGameManifest(h);
    expect(c.dims.get('token-spot')!.domain).not.toContain('garden.tree');
    expect(c.dims.get('pipe-spot')!.domain).toContain('garden.tree');
  });
  it('linear extensions keep every edge, in a fixed order', () => {
    expect(linearExtensions(['a', 'b', 'c'], [['a', 'b']])).toEqual([
      ['a', 'b', 'c'],
      ['a', 'c', 'b'],
      ['c', 'a', 'b'],
    ]);
    expect(linearExtensions(['a', 'b', 'c', 'd', 'e'], [['a', 'b']])).toHaveLength(60);
  });
});

describe('compileVariant', () => {
  const g = extendedDemo();
  const ir = compileIR(compileGame(g), { extensions: { trusted: '' } });
  const c = compileGameManifest(g);

  it('the same seed gives the same world and hash; from the IR or the game alike', () => {
    const a = compileVariant(ir, extensionManifest, 'WS-1234-5678'.slice(0, 3) + encodeSeedCode(42).slice(3));
    const b = compileVariant(c, extensionManifest, encodeSeedCode(42));
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(compileVariant(c, extensionManifest, encodeSeedCode(43)).hash).not.toBe(a.hash);
  });
  it('a malformed seed, an unknown mode and an unknown algorithm version are explicit errors', () => {
    expect(() => compileVariant(c, extensionManifest, 'not-a-seed')).toThrow(RemixSeedError);
    expect(() => compileVariant(c, extensionManifest, encodeSeedCode(1), 1, 'nope')).toThrow(/unknown mode/);
    expect(() => compileVariant(c, extensionManifest, encodeSeedCode(1), 2)).toThrow(
      /unknown Remix algorithm version 2/,
    );
  });
  it('story gives every dimension its story value', () => {
    const v = compileVariant(c, extensionManifest, 'story');
    expect(v.mode).toBe('story');
    expect(v.assignments).toEqual({
      'token-spot': 'house.chair',
      'pipe-spot': 'garden.bench',
      'phone-spot': 'house.table',
      code: 0,
      order: ['a', 'b', 'c', 'd', 'e'],
      tea: 0,
      'grandma-palette': 0,
    });
  });
  it('every well-formed seed gives a valid world (10 000 seeds, the generator)', () => {
    let n = 0;
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 35 - 1 }), (x) => {
        const v = compileVariant(c, extensionManifest, encodeSeedCode(x));
        n++;
        for (const id of c.order) {
          const dom = c.dims.get(id)!.domain.map((d) => canonicalJson(d));
          if (!dom.includes(canonicalJson(v.assignments[id]))) return false;
        }
        return (
          violations(c, v.assignments).length === 0 && v.hash === compileVariant(c, extensionManifest, v.seed).hash
        );
      }),
      { numRuns: 10_000 },
    );
    expect(n).toBeGreaterThanOrEqual(10_000);
  }, 120_000);
  it('a catalogue is enumerated whole, constraints applied; beyond 10 000 it is refused', () => {
    const small = catalogue(c, 'small');
    expect(small).toHaveLength(4 * 60);
    expect(new Set(small.map((a) => canonicalJson(a))).size).toBe(small.length);
    expect(() => catalogue(c, 'too-big')).toThrow(new RegExp(`exceed the catalogue's ${CATALOGUE_MAX}`));
  });
  it('the requires constraint holds in every drawn world', () => {
    for (let x = 0; x < 3000; x++) {
      const v = compileVariant(c, extensionManifest, encodeSeedCode(x * 7919));
      if (v.assignments['token-spot'] === 'house.clock') expect(v.assignments['pipe-spot']).toBe('garden.bench');
    }
  });
  it('a generator never dead-ends: it backtracks (A in {x, y}, C in {x}, capacity 1)', () => {
    const tight: VariationManifest = {
      ...extensionManifest,
      modes: [{ id: 'remix', strategy: 'generator', dimensions: ['token-spot', 'pipe-spot'] }],
      dimensions: [
        {
          id: 'token-spot',
          kind: 'item-placement',
          item: 'token',
          logical: true,
          story: { room: 'house', anchor: 'table' },
          anchors: [
            { room: 'house', anchor: 'clock' },
            { room: 'house', anchor: 'table' },
          ],
        },
        {
          id: 'pipe-spot',
          kind: 'item-placement',
          item: 'pipe',
          logical: true,
          story: { room: 'house', anchor: 'clock' },
          anchors: [{ room: 'house', anchor: 'clock' }],
        },
      ],
      constraints: [],
    };
    const ct = compileManifest(tight, remixWorld(g));
    const seen = new Set<unknown>();
    for (let x = 0; x < 300; x++) {
      const v = compileVariant(ct, tight, encodeSeedCode(x * 7919));
      expect(v.assignments).toEqual({ 'token-spot': 'house.table', 'pipe-spot': 'house.clock' });
      seen.add(v.assignments['token-spot']);
    }
    expect(seen.size).toBe(1);
  });
  it('adding a presentation dimension moves no logical draw (D27: its own cosmetic stream)', () => {
    const more: VariationManifest = {
      ...extensionManifest,
      modes: extensionManifest.modes.map((m) =>
        m.id === 'remix' ? { ...m, dimensions: [...m.dimensions, 'clock-img'] } : m,
      ),
      dimensions: [
        ...extensionManifest.dimensions,
        {
          id: 'clock-img',
          kind: 'presentation',
          target: 'prop-img:house.clock',
          values: ['a', 'b'],
          story: 0,
          logical: false,
        },
      ],
    };
    const c2 = compileManifest(more, remixWorld(g));
    for (let x = 0; x < 200; x++) {
      const s = encodeSeedCode(x * 104729);
      const a = compileVariant(c, extensionManifest, s).assignments;
      const b = compileVariant(c2, more, s).assignments;
      for (const id of ['token-spot', 'pipe-spot', 'phone-spot', 'code', 'order', 'tea']) expect(b[id]).toEqual(a[id]);
    }
  });
});

describe('a stored world is never regenerated', () => {
  const g = extendedDemo();
  const c = compileGameManifest(g);
  it('a tampered variant is refused; a changed manifest keeps the stored assignment when its values still exist', () => {
    const v = compileVariant(c, extensionManifest, encodeSeedCode(99));
    expect(() =>
      loadVariant(c, { ...v, assignments: { ...v.assignments, code: ((v.assignments.code as number) + 1) % 4 } }),
    ).toThrow(/does not match its hash/);
    const moved = compileManifest(
      {
        ...extensionManifest,
        modes: [...extensionManifest.modes, { id: 'extra', strategy: 'catalogue', dimensions: ['code'] }],
      },
      remixWorld(g),
    );
    const r = loadVariant(moved, v);
    expect(r.stale).toBe(true);
    expect(r.variant.assignments).toEqual(v.assignments);
  });
  it('a forged world with its own correct hash is refused: out of domain, incomplete, against a constraint, malformed', () => {
    const v = compileVariant(c, extensionManifest, encodeSeedCode(7));
    const rehash = (body: Record<string, unknown>) => {
      const { hash: _h, ...rest } = body as unknown as typeof v;
      return { ...rest, hash: sha256HexSync(canonicalJson(rest)) };
    };
    expect(() => loadVariant(c, rehash({ ...v, assignments: { ...v.assignments, code: 99 } }))).toThrow(
      /does not exist/,
    );
    const { code: _c, ...missing } = v.assignments;
    expect(() => loadVariant(c, rehash({ ...v, assignments: missing }))).toThrow(/no value for code/);
    expect(() =>
      loadVariant(
        c,
        rehash({ ...v, assignments: { ...v.assignments, 'token-spot': 'house.clock', 'pipe-spot': 'house.clock' } }),
      ),
    ).toThrow(/constraints/);
    expect(() => loadVariant(c, rehash({ ...v, mode: 'nope' }))).toThrow(/mode "nope"/);
    expect(() => loadVariant(c, { ...v, hash: 'x' })).toThrow(/not a world/);
    expect(() => loadVariant(c, 'nonsense')).toThrow(/not a world/);
  });
  it('after a fictitious algorithmVersion 2 that draws otherwise, an old save reloads its exact assignment', () => {
    const v1 = compileVariant(c, extensionManifest, encodeSeedCode(2024));
    // Version 2 as a later engine might write it: the same seed draws another world.
    const v2Assignments = { ...v1.assignments, code: ((v1.assignments.code as number) + 1) % 4 };
    expect(v2Assignments).not.toEqual(v1.assignments);
    const stored = JSON.parse(JSON.stringify(v1));
    const applied = applyVariant(g, stored);
    expect(applied.variant!.assignments).toEqual(v1.assignments);
    expect(applied.variant!.algorithmVersion).toBe(1);
    // The engine refuses to generate with a version it does not know, but loads a stored world of any version as is.
    expect(() => compileVariant(c, extensionManifest, v1.seed, 2)).toThrow(RemixSeedError);
  });
});

describe('no Math.random on the variant path', () => {
  afterEach(() => vi.restoreAllMocks());
  it('compiling and applying a world never calls it', () => {
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random on the variant path');
    });
    const g = extendedDemo();
    const c = compileGameManifest(g);
    for (let x = 0; x < 50; x++) applyVariant(g, compileVariant(c, extensionManifest, encodeSeedCode(x)));
    applyVariant(demo, compileVariant(compileGameManifest(demo), demo.remix!, encodeSeedCode(5)));
    expect(spy).not.toHaveBeenCalled();
  });
  it('no source of src/engine/core nor src/engine/minigames calls it, and biome.json forbids it there', () => {
    const files = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? files(join(d, e.name)) : e.name.endsWith('.ts') ? [join(d, e.name)] : [],
      );
    const users = [...files('src/engine/core'), ...files('src/engine/minigames')].filter((f) =>
      /Math\.random\s*\(/.test(readFileSync(f, 'utf8')),
    );
    // The minigames draw from the run's `minigame:<id>` stream (ctx.random) since the second reading of 4.1.15.
    expect(users).toEqual([]);
    expect(readFileSync('tools/biome/no-math-random.grit', 'utf8')).toContain('$m = Math');
    const biome = readFileSync('biome.json', 'utf8');
    expect(biome).toContain('noRestrictedGlobals');
    expect(biome).toContain('no-math-random.grit');
    expect(
      readdirSync('src/engine/core/remix')
        .map((f) => readFileSync(join('src/engine/core/remix', f), 'utf8'))
        .join('\n'),
    ).not.toMatch(/\bMath\./);
  });
});
