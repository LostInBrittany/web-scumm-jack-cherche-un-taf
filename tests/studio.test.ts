// Studio core (studio-server/src/ops/core.ts) on temporary copies of games/demo and games/_template (under .cache/, so the
// copies resolve @engine like the real games).
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

// Every write is a journaled, guarded operation since 4.2.1 (the game validated in a child process): slower than a
// write to a file, the more under coverage. Each test may take a minute.
vi.setConfig({ testTimeout: 60_000 });
import type { ListLine, RoomDef } from '@engine/core/types';
import { listText } from '@engine/core/list-lines';
import { createStudio, importInChild, StudioError } from '../studio-server/src/ops/core';
import { classify, formatPath, parsePath, type Seg } from '../studio-server/src/ops/source';

const ROOT = resolve(__dirname, '..');
const temps: string[] = [];

function copyGame(id: string): string {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.cache', `studio-test-${id}-`));
  temps.push(dir);
  cpSync(join(ROOT, 'games', id), dir, {
    recursive: true,
    filter: (src) => !/[\\/](art|audio|private)([\\/]|$)/.test(src.slice(join(ROOT, 'games', id).length)),
  });
  return dir;
}

afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

const demoDir = copyGame('demo');
const tplDir = copyGame('_template');
// Inside Vitest, in-process imports are cached by its own loader: the game is read in a child process instead.
const importFresh = (file: string) => importInChild(file, ROOT);
const demo = createStudio({ gameDir: demoDir, root: ROOT, importFresh });
const tpl = createStudio({ gameDir: tplDir, root: ROOT, importFresh });

/** Every text of a RoomDef, found by walking the loaded data with the same path rules as the source parser. */
function textsOfDef(def: RoomDef): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (v: unknown, segs: Seg[]) => {
    if (typeof v === 'string') {
      if (classify(segs)) out.set(formatPath(segs), v);
      return;
    }
    // A list line with an id (`{ id, text }`) is a text at its own path.
    if (
      typeof segs[segs.length - 1] === 'number' &&
      v &&
      typeof v === 'object' &&
      typeof (v as { text?: unknown }).text === 'string' &&
      classify(segs)
    ) {
      out.set(formatPath(segs), (v as { text: string }).text);
      return;
    }
    // Hotspots and rules generated from declared exits are not in the source: their texts live under `exits`.
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      ((v as { exit?: unknown }).exit === true ||
        (segs[0] === 'on' && typeof (v as { exit?: unknown }).exit === 'string'))
    )
      return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...segs, i]));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, [...segs, k]);
  };
  walk(def, []);
  return out;
}

const texts = (l: string | ListLine[] | undefined) => (Array.isArray(l) ? l.map(listText) : l);
const roomFile = (dir: string, id: string) => join(dir, 'rooms', `${id}.ts`);
const read = (f: string) => readFileSync(f, 'utf8');

async function expectError(p: Promise<unknown>, status: number, text?: string) {
  const e = await p.then(
    () => null,
    (x) => x,
  );
  expect(e).toBeInstanceOf(StudioError);
  expect((e as StudioError).status).toBe(status);
  if (text) expect((e as Error).message).toContain(text);
}

describe('paths', () => {
  it('format and parse round-trip', () => {
    for (const p of [
      'look.pantry[1]',
      'on[3].do[2].say[1]',
      'talk.grandma[0].topic',
      'props["odd.key"].name',
      'look.piano[+]',
    ]) {
      expect(formatPath(parsePath(p) as Seg[])).toBe(p);
    }
    expect(() => parsePath('look..x')).toThrow();
  });
});

describe('texts of a room', () => {
  it('finds known paths in the demo', async () => {
    const r = await demo.getRoom('house');
    const by = new Map(r.texts.map((t) => [t.path, t]));
    expect(by.get('look.pantry[0]')?.value).toBe('The pantry cupboard. The sardines live in there.');
    expect(by.get('look.pantry[0]')?.kind).toBe('look');
    expect(by.get('look.shell')?.kind).toBe('look');
    expect(by.get('talk.grandma[0].topic')?.value).toBe('Where is the key?');
    expect(by.get('talk.grandma[0].do[0].say[1]')?.who).toBe('grandma');
    expect(by.get('hints[1].lines[1]')?.value).toBe('Open the armchair, sweetie. Or pull it.');
    expect(by.get('props.pantry.name')?.value).toBe('pantry cupboard');
    expect(by.get('hotspots.door.name')?.value).toBe('hall door');
    expect(by.get('on[6].do[0].cutscene[12].say[1]')?.who).toBe('biscuit');
    expect(by.get('onEnter[0].then[0].once[0].say[1]')?.who).toBe('hero'); // a plain line, now a say object with its id (3.2.1)
    expect(by.get('talk.grandma[0].do[1].then[1].toast')?.kind).toBe('toast');
    expect(by.get('talk.grandma[1].do[0].nth[2][0].say[1]')?.value).toBe('Pixel. Sardines. Go.');
    // ids, images, flags and conditions are not texts
    expect(
      r.texts.some(
        (t) =>
          /\.(img|char|decor|id|verb|a|b)$|\.states\.|until|\.if/.test(t.path) || t.path === 'id' || t.path === 'decor',
      ),
    ).toBe(false);
    const ln = by.get('look.pantry[0]')!;
    expect(ln.file).toMatch(/rooms[\\/]house\.ts$/);
    expect(read(roomFile(demoDir, 'house')).split('\n')[ln.line - 1]).toContain('The pantry cupboard.');
  });

  it('is complete: every text of every demo room, nothing else', async () => {
    const info = await demo.gameInfo();
    expect(info.rooms.map((r) => r.id)).toEqual(['house', 'garden', 'market']);
    for (const { id } of info.rooms) {
      const r = await demo.getRoom(id);
      const fromSource = new Map(r.texts.map((t) => [t.path, t.value]));
      expect(fromSource).toEqual(textsOfDef(r.def));
      expect(fromSource.size).toBeGreaterThan(20);
    }
  });
});

describe('setText', () => {
  it('replaces exactly one literal, and is idempotent', async () => {
    const f = roomFile(demoDir, 'house');
    const before = read(f);
    const r = await demo.setText('house', 'look.teacup[1]', 'Not sardine-flavoured. Pass. Twice.');
    expect(r).toEqual({ ok: true, line: 48, changed: true });
    const after = read(f);
    expect(after).toBe(before.replace("'Not sardine-flavoured. Pass.'", "'Not sardine-flavoured. Pass. Twice.'"));
    const again = await demo.setText('house', 'look.teacup[1]', 'Not sardine-flavoured. Pass. Twice.');
    expect(again.changed).toBe(false);
    expect(read(f)).toBe(after);
  });

  it("escapes quotes, backslashes and new lines in the file's quote style", async () => {
    const tricky = 'It\'s "fine" \\ really\nyes';
    await demo.setText('house', 'hotspots.lamp.name', tricky);
    expect(read(roomFile(demoDir, 'house'))).toContain(`lamp: { name: 'It\\'s "fine" \\\\ really\\nyes' }`);
    const r = await demo.getRoom('house');
    expect(r.def.hotspots!.lamp.name).toBe(tricky);
    await demo.setText('house', 'hotspots.lamp.name', 'lamp');
  });

  it('appends and deletes look lines', async () => {
    const f = roomFile(demoDir, 'house');
    const before = read(f);
    await demo.setText('house', 'look.clock[+]', 'Cuckoo? No cuckoo.');
    let def = (await demo.getRoom('house')).def;
    expect(texts(def.look!.clock)).toEqual([
      "Tick. Tock. Breakfast o'clock.",
      'Two hours past breakfast, actually.',
      'The clock agrees with me: food.',
      'Cuckoo? No cuckoo.',
    ]);
    await demo.setText('house', 'look.clock[3]', null);
    expect(read(f)).toBe(before);

    // a single line becomes a list, and back
    await demo.setText('house', 'look.door[+]', 'Still the hall.');
    def = (await demo.getRoom('house')).def;
    expect(texts(def.look!.door)).toEqual(['The hall. Nothing to eat there. I checked. Twice.', 'Still the hall.']);
    await demo.setText('house', 'look.door[1]', null);
    expect(texts((await demo.getRoom('house')).def.look!.door)).toEqual([
      'The hall. Nothing to eat there. I checked. Twice.',
    ]);

    // deleting the first line, then a whole look entry
    await demo.setText('house', 'look.teacup[0]', null);
    expect(texts((await demo.getRoom('house')).def.look!.teacup)).toEqual(['Not sardine-flavoured. Pass. Twice.']);
    await demo.setText('house', 'look.lamp', null);
    expect((await demo.getRoom('house')).def.look!.lamp).toBeUndefined();
    // creating an entry
    await demo.setText('house', 'look.lamp[+]', 'A warm lamp.');
    expect((await demo.getRoom('house')).def.look!.lamp).toBe('A warm lamp.');
  }, 60000);

  it('refuses unknown paths and non-texts', async () => {
    await expectError(demo.setText('house', 'look.nothing[4]', 'x'), 404, 'path not found');
    await expectError(demo.setText('house', 'on[0].verb', 'eat'), 400, 'not a text');
    await expectError(demo.setText('house', 'decor', 'x'), 400, 'not a text');
    await expectError(demo.setText('house', 'on[0].do[+]', 7 as unknown as string), 400);
    await expectError(demo.setText('nowhere', 'name', 'x'), 404, 'unknown room');
    await expectError(demo.setText('house', 'name', null), 400, 'cannot delete');
  });
});

describe('addEntity', () => {
  it('adds a prop, a hotspot and an actor; the room still imports and validates', async () => {
    const f = roomFile(tplDir, 'start');
    const r1 = await tpl.addEntity('start', {
      kind: 'hotspot',
      id: 'well',
      name: 'old well',
      at: [500, 220],
      look: 'A well. Wishes not included.',
    });
    expect(read(f).split('\n')[r1.line - 1]).toContain(`well: { name: 'old well' },`);
    await tpl.addEntity('start', {
      kind: 'prop',
      id: 'pail',
      name: 'pail',
      img: 'home2/r4c2',
      at: [200, 330],
      look: 'Another bucket.',
    });
    // the template has no actors section: it is created
    const r3 = await tpl.addEntity('start', {
      kind: 'actor',
      id: 'cat',
      char: Object.keys((await tpl.gameInfo()).characters)[0],
      at: [300, 350],
      look: 'A cat.',
    });
    expect(read(f)).toMatch(/\n {2}actors: \{\n {4}\w+: \{ char: '\w+' \},\n {2}\},\n/);
    expect(r3.line).toBeGreaterThan(1);

    const room = await tpl.getRoom('start');
    expect(room.def.hotspots!.well.name).toBe('old well');
    expect(room.def.props!.pail.img).toBe('home2/r4c2');
    expect(room.def.actors!.cat).toBeTruthy();
    expect(room.def.look!.well).toBe('A well. Wishes not included.');
    expect(room.layout.hotspots!.well.rect).toEqual([470, 190, 60, 60]);
    expect(room.layout.props!.pail).toEqual({ x: 200, y: 330, h: 60 });
    expect(room.layout.actors!.cat).toEqual({ x: 300, y: 350 });
    // The template ships without prepared images: only "image not found" errors are expected.
    const v = await tpl.validate();
    expect(v.errors.filter((e) => !e.includes('image not found'))).toEqual([]);
    expect(v.warnings.filter((w) => /well|pail|cat/.test(w))).toEqual([]);
  });

  it('adds to the demo, which still validates and solves', async () => {
    await demo.addEntity('house', {
      kind: 'hotspot',
      id: 'rug',
      name: 'rug',
      at: [320, 380],
      look: 'A rug. Nap zone.',
    });
    const v = await demo.validate();
    expect(v.errors).toEqual([]);
    expect((await demo.solve()).finished).toBe(true);
  });

  it('refuses duplicates and bad input', async () => {
    await expectError(demo.addEntity('house', { kind: 'prop', id: 'pantry', name: 'x', at: [1, 1] }), 409);
    await expectError(demo.addEntity('house', { kind: 'prop', id: '9bad', name: 'x', at: [1, 1] }), 400);
    await expectError(demo.addEntity('house', { kind: 'hotspot', id: 'nameless', at: [1, 1] }), 400, 'name');
    await expectError(
      demo.addEntity('house', { kind: 'actor', id: 'ghost', char: 'nobody', at: [1, 1] }),
      400,
      'character',
    );
    await expectError(
      demo.addEntity('house', { kind: 'prop', id: 'thing', name: 'x', img: 'no/such', at: [1, 1] }),
      400,
      'manifest',
    );
    await expectError(demo.addEntity('house', { kind: 'hotspot', id: 'spot', name: 'x', at: [1] as never }), 400);
  });
});

describe('checks, storyboard, notes, layout', () => {
  it('validate and solve return structured results', async () => {
    const v = await demo.validate();
    expect(v).toMatchObject({ ok: true, errors: [], warnings: expect.any(Array) });
    const s = await demo.solve('market');
    expect(s.finished).toBe(true);
    expect(s.from).toBe('market');
    expect(s.path.length).toBeGreaterThan(0);
    expect(Array.isArray(s.deadEnds)).toBe(true);
    await expectError(demo.solve('no_such_checkpoint'), 400, 'checkpoint');
  });

  it('notes: created on first write, appended after', async () => {
    expect(demo.getNotes()).toEqual({ entries: [] });
    const a = await demo.addNote({ about: 'house.teacup', text: 'Make it steam.' });
    const b = await demo.addNote({ text: 'Second.', author: 'an AI' });
    expect(a).toMatchObject({ about: 'house.teacup', author: 'you', text: 'Make it steam.' });
    expect(b.author).toBe('an AI');
    expect(demo.getNotes().entries.map((n) => n.id)).toEqual([a.id, b.id]);
    expect(JSON.parse(read(join(demoDir, 'notes.json'))).entries).toHaveLength(2);
    await expectError(demo.addNote({ text: '  ' }), 400);
  });

  it('storyboard: an unchanged board is not rewritten', async () => {
    const f = join(demoDir, 'storyboard.json');
    const before = read(f);
    const sb = demo.getStoryboard();
    expect(await demo.setStoryboard(sb)).toEqual({ ok: true, changed: false });
    expect(read(f)).toBe(before);
    (sb.boards as { title: string }[])[0].title = 'Opening';
    expect((await demo.setStoryboard(sb)).changed).toBe(true);
    expect(demo.getStoryboard()).toEqual(sb);
    await expectError(demo.setStoryboard({ nope: 1 }), 400);
  });

  it('layout: written as JSON', async () => {
    const L = demo.getLayout('garden');
    await demo.setLayout('garden', { ...L, floor: 390 });
    expect(demo.getLayout('garden').floor).toBe(390);
    await expectError(demo.setLayout('garden', [] as never), 400);
    // A layout that adds a validation error is taken back (4.1.6, as setValue does): a layer the room has not.
    const kept = demo.getLayout('garden');
    await expectError(demo.setLayout('garden', { ...kept, layers: { ghost: { x: 0, y: 0 } } }), 422);
    expect(demo.getLayout('garden')).toEqual(kept);
  });
});
