// The scenario map (4.2.3 PR 2, plan H1): groupings that only reference what the game names. Writing or deleting one
// changes `groupings.json` alone, every content file's bytes the same; the map is derived, the same bytes for the same
// revision; a reference the IR does not know is "not declared"; a groupings file that is not one is refused.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createStudio, importInChild } from '../studio-server/src/ops/core';
import { spanOf } from '../studio-server/src/ops/spans';
import { groupingsProblems, readableGroupings, scenarioMap } from '../tools/studio/scenario-map';

const ROOT = resolve(__dirname, '..');
mkdirSync(join(ROOT, '.cache'), { recursive: true });
const dir = mkdtempSync(join(ROOT, '.cache', 'studio-map-'));
cpSync(join(ROOT, 'games', 'demo'), dir, {
  recursive: true,
  filter: (src) => !/[\\/](art|audio|private)([\\/]|$)/.test(src.slice(join(ROOT, 'games', 'demo').length)),
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const studio = createStudio({ gameDir: dir, root: ROOT, importFresh: (f: string) => importInChild(f, ROOT) });

/** Every file of the game but the groupings, by its sha256. */
function contentHashes(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const f = join(d, n);
      if (statSync(f).isDirectory()) walk(f);
      else if (n !== 'groupings.json')
        out[relative(dir, f)] = createHash('sha256').update(readFileSync(f)).digest('hex');
    }
  };
  walk(dir);
  return out;
}

describe('the scenario map', () => {
  it('writes the groupings alone: adding then deleting one leaves every content file the same', async () => {
    const before = contentHashes();
    const ir = await studio.ir();
    const room = ir.rooms[0]!.id;
    const rule = ir.rules.find((r) => ir.provenance[r.id])!.id;
    await studio.setGroupings({
      groupings: [{ id: 'the-key', kind: 'puzzle', title: 'The key', refs: [room, rule, 'nowhere.at-all'] }],
    });
    expect(existsSync(join(dir, 'groupings.json'))).toBe(true);
    expect(contentHashes()).toEqual(before);
    const map = await studio.map();
    const g = map.groupings[0]!;
    expect(g).toMatchObject({ id: 'the-key', kind: 'puzzle', title: 'The key' });
    expect(g.refs[0]).toMatchObject({ ref: room, kind: 'room', at: { file: expect.stringContaining('rooms/') } });
    expect(g.refs[1]!.at).toEqual(ir.provenance[rule]);
    // A reference the IR does not know: said, never guessed.
    expect(g.refs[2]).toEqual({ ref: 'nowhere.at-all', kind: 'unknown' });
    expect(map.ungrouped.room ?? []).not.toContain(room);
    // Two derivations of the same revision: the same bytes.
    expect(JSON.stringify(await studio.map())).toBe(JSON.stringify(map));
    // The same file again changes nothing; deleting the grouping leaves the content as it was.
    expect(await studio.setGroupings({ groupings: studio.getGroupings().groupings })).toEqual({
      ok: true,
      changed: false,
    });
    await studio.setGroupings({ groupings: [] });
    expect(contentHashes()).toEqual(before);
    expect((await studio.map()).ungrouped.room).toContain(room);
  });

  it('refuses a groupings file that is not one, and writes nothing', async () => {
    const was = readFileSync(join(dir, 'groupings.json'), 'utf8');
    await expect(
      studio.setGroupings({ groupings: [{ id: 'Bad Id', kind: 'saga', title: '', refs: ['a b'] }] }),
    ).rejects.toThrow(/id must be lowercase.*kind must be one of.*title must be.*refs\[0\]/);
    expect(readFileSync(join(dir, 'groupings.json'), 'utf8')).toBe(was);
  });

  it('reads a groupings file edited by hand: the readable groupings mapped, the others said', async () => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      join(dir, 'groupings.json'),
      JSON.stringify({
        groupings: [{ id: 'ok', kind: 'chapter', title: 'Ok', refs: [] }, { id: 'bad', refs: 3 }, null],
      }),
    );
    expect(studio.getGroupings().skipped).toHaveLength(4);
    expect((await studio.map()).groupings.map((x) => x.id)).toEqual(['ok']);
    await studio.setGroupings({ groupings: [] });
  });

  it('is its own span', () => {
    expect(spanOf('groupings.json')).toBe('groupings');
  });
});

describe('the groupings, checked', () => {
  const g = (o: Record<string, unknown> = {}) => ({ id: 'a', kind: 'chapter', title: 'A', refs: [], ...o });
  it('takes a well-formed file', () => {
    expect(groupingsProblems({ groupings: [] })).toEqual([]);
    expect(groupingsProblems({ groupings: [g(), g({ id: 'b-2', kind: 'character', refs: ['char:lou'] })] })).toEqual(
      [],
    );
  });
  it('says each problem', () => {
    expect(groupingsProblems(null)).toEqual(['`groupings` must be a list']);
    expect(groupingsProblems({ groupings: {} })).toEqual(['`groupings` must be a list']);
    expect(groupingsProblems({ groupings: Array(501).fill(g()) })).toEqual(['at most 500 groupings']);
    expect(groupingsProblems({ groupings: [null] })).toEqual(['groupings[0] must be an object']);
    expect(groupingsProblems({ groupings: [g(), g()] })).toEqual(['groupings[1].id "a" is used twice']);
    expect(groupingsProblems({ groupings: [g({ id: '-a' })] })).toEqual([
      'groupings[0].id must be lowercase letters, digits and -',
    ]);
    expect(groupingsProblems({ groupings: [g({ id: 'a'.repeat(65) })] })).toHaveLength(1);
    expect(groupingsProblems({ groupings: [g({ title: ' ' })] })).toEqual([
      'groupings[0].title must be a text of 1 to 200 characters, without control characters',
    ]);
    expect(groupingsProblems({ groupings: [g({ title: 'x'.repeat(201) })] })).toHaveLength(1);
    expect(groupingsProblems({ groupings: [g({ refs: 'x' })] })).toEqual([
      'groupings[0].refs must be a list of at most 500',
    ]);
    expect(groupingsProblems({ groupings: [g({ refs: Array(501).fill('x') })] })).toHaveLength(1);
    expect(groupingsProblems({ groupings: [g({ refs: ['', 3, 'x'.repeat(201)] })] })).toHaveLength(3);
    expect(groupingsProblems({ groupings: [g({ extra: 1 })] })).toEqual(['groupings[0].extra is unknown']);
    expect(groupingsProblems({ groupings: [], other: 1 })).toEqual(['other is unknown']);
    expect(groupingsProblems({ groupings: [g({ title: 'a\u202eb' })] })).toHaveLength(1);
    expect(groupingsProblems({ groupings: [g({ title: 'two\nlines' })] })).toHaveLength(1);
    expect(groupingsProblems({ groupings: [g({ refs: ['hall', 'hall'] })] })).toEqual([
      'groupings[0].refs[1] "hall" is named twice',
    ]);
    expect(groupingsProblems({ groupings: [g({ refs: ['a\u0007b'] })] })).toHaveLength(1);
  });

  it('reads what it can of a file edited by hand, and says what it left out', () => {
    expect(readableGroupings(null)).toEqual({ groupings: [], skipped: [] });
    expect(readableGroupings({ groupings: 'x' })).toEqual({ groupings: [], skipped: ['`groupings` must be a list'] });
    const r = readableGroupings({ groupings: [null, g(), g({ refs: 'x' }), g({ title: 'again' }), g({ id: 'b' })] });
    expect(r.groupings.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r.groupings[0]!.title).toBe('A');
    expect(r.skipped).toEqual([
      'groupings[0] must be an object',
      'groupings[2].refs must be a list of at most 500',
      'groupings[3].id "a" is used twice',
    ]);
    expect(readableGroupings({ groupings: Array(501).fill(null) }).skipped.at(-1)).toBe('past 500 groupings');
  });
});

describe('the map, derived', () => {
  const ir = {
    rooms: [{ id: 'hall' }],
    entities: [{ key: 'hall.door' }, { key: 'item:key' }],
    rules: [
      { id: 'hall.r1', kind: 'rule' },
      { id: 'hall.lou.t', kind: 'topic' },
    ],
    scripts: [{ id: 'intro' }],
    provenance: {
      hall: { file: 'rooms/hall.ts', line: 1 },
      'hall.door': { file: 'rooms/hall.ts', line: 3 },
      'item:key': { file: 'items.ts', line: 2 },
      'char:lou': { file: 'cast.ts', line: 1 },
      'objective:out': { file: 'game.ts', line: 4 },
      'checkpoint:c1': { file: 'game.ts', line: 9 },
      'hall.r1': { file: 'rooms/hall.ts', line: 7 },
      'hall.lou.t': { file: 'rooms/hall.ts', line: 8 },
      intro: { file: 'game.ts', line: 12 },
    },
  } as never;
  it("names only the IR's own keys: `constructor` is not declared", () => {
    const m = scenarioMap(ir, {
      groupings: [{ id: 'x', kind: 'puzzle', title: 'X', refs: ['constructor', '__proto__'] }],
    });
    expect(m.groupings[0]!.refs).toEqual([
      { ref: 'constructor', kind: 'unknown' },
      { ref: '__proto__', kind: 'unknown' },
    ]);
  });

  it('gives a key both a rule and an entity carry the kind whose line the provenance says (the rule, first)', () => {
    const both = {
      rooms: [],
      entities: [{ key: 'garden.look-tank' }, { key: 'garden.intro' }],
      rules: [{ id: 'garden.look-tank', kind: 'rule' }],
      scripts: [{ id: 'garden.intro' }],
      provenance: {
        'garden.look-tank': { file: 'rooms/garden.ts', line: 9 },
        'garden.intro': { file: 'rooms/garden.ts', line: 2 },
      },
    } as never;
    const m = scenarioMap(both, {
      groupings: [{ id: 'x', kind: 'puzzle', title: 'X', refs: ['garden.look-tank', 'garden.intro'] }],
    });
    expect(m.groupings[0]!.refs.map((r) => r.kind)).toEqual(['rule', 'script']);
  });

  it('says each reference by its kind, sorted by grouping, and what no grouping names', () => {
    const m = scenarioMap(ir, {
      groupings: [
        { id: 'z', kind: 'chapter', title: 'Z', refs: ['checkpoint:c1', 'objective:out', 'intro', 'hall.lou.t'] },
        { id: 'a', kind: 'character', title: 'A', refs: ['char:lou', 'item:key', 'hall.door', 'hall.r1', 'gone'] },
      ],
    });
    expect(m.groupings.map((g) => g.id)).toEqual(['a', 'z']);
    expect(m.groupings[0]!.refs.map((r) => r.kind)).toEqual(['character', 'item', 'entity', 'rule', 'unknown']);
    expect(m.groupings[1]!.refs.map((r) => r.kind)).toEqual(['checkpoint', 'objective', 'script', 'topic']);
    expect(m.ungrouped).toEqual({ room: ['hall'] });
    expect(scenarioMap(ir, { groupings: [] }).ungrouped).toEqual({
      character: ['char:lou'],
      checkpoint: ['checkpoint:c1'],
      item: ['item:key'],
      objective: ['objective:out'],
      room: ['hall'],
    });
  });
});
