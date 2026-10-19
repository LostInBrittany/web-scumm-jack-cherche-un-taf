// The Studio's structured edits (3.4): a stage, a condition or a command list written into a room file as code, a
// dry run that shows the diff, a write validated before it stays, undo / redo that refuse when the file changed since,
// and the voice table.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createStudio, importInChild, StudioError } from '../studio-server/src/ops/core';
import { lineDiff, setValueInSource, valueText } from '../studio-server/src/ops/source';

const ROOT = resolve(__dirname, '..');
mkdirSync(join(ROOT, '.cache'), { recursive: true });
const dir = mkdtempSync(join(ROOT, '.cache', 'studio-structured-'));
cpSync(join(ROOT, 'games', 'demo'), dir, {
  recursive: true,
  filter: (src) => !/[\\/](art|audio|private)([\\/]|$)/.test(src.slice(join(ROOT, 'games', 'demo').length)),
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const studio = createStudio({ gameDir: dir, root: ROOT, importFresh: (f: string) => importInChild(f, ROOT) });
const garden = () => readFileSync(join(dir, 'rooms', 'garden.ts'), 'utf8');

describe('values as code', () => {
  it("in the file's style: bare keys, its quotes, one line when short, one item per line when long", () => {
    expect(valueText({ all: ['a', { not: { has: 'key' } }] }, "'")).toBe("{ all: ['a', { not: { has: 'key' } }] }");
    expect(valueText({ 'two words': 1 }, '"')).toBe("{ 'two words': 1 }");
    expect(
      valueText(
        {
          layers: Array.from({ length: 4 }, (_, i) => ({
            id: `layer_${i}`,
            image: `pier/layer_${i}`,
            role: 'scenery',
          })),
        },
        "'",
        '  ',
        '  ',
      ).split('\n').length,
    ).toBeGreaterThan(4);
  });
  it('replaces, adds, appends and removes, leaving the rest of the file alone', () => {
    const code =
      "export const r = defineRoom({\n  id: 'x', name: 'X', decor: 'd/x',\n  // a comment that stays\n  on: [\n    { verb: 'look', a: 'door', do: ['A door.'] },\n  ],\n});\n";
    const a = setValueInSource(code, 'on[0].if', 'lit');
    expect(a.code).toContain("{ verb: 'look', a: 'door', do: ['A door.'], if: 'lit' }");
    const b = setValueInSource(a.code, 'on[1]', { verb: 'use', a: 'door', do: [{ set: 'open' }] });
    expect(b.code).toContain("{ verb: 'use', a: 'door', do: [{ set: 'open' }] }");
    const c = setValueInSource(b.code, 'stage', { transition: 'fade' });
    expect(c.code).toContain("stage: { transition: 'fade' }");
    expect(c.code).toContain('// a comment that stays');
    const d = setValueInSource(c.code, 'on[0].if', undefined);
    expect(d.code).not.toContain("if: 'lit'");
    expect(setValueInSource(d.code, 'stage', { transition: 'fade' }).changed).toBe(false);
    expect(lineDiff('a\nb\nc', 'a\nB\nc')).toBe('@@ line 1 @@\n a\n-b\n+B\n c');
  });
});

describe('the Studio core', () => {
  it('a dry run shows the diff and writes nothing; the real write is validated, recorded, undone and redone', async () => {
    const before = garden();
    const stage = { layers: [{ id: 'fg', image: 'decor/backyard', role: 'foreground' }], transition: 'fade' };
    const dry = await studio.setValue('garden', 'stage', stage, { dry: true });
    expect(dry).toMatchObject({ dry: true, changed: true });
    expect(dry.diff).toContain('+  stage: {');
    expect(garden()).toBe(before);
    const r = await studio.setValue('garden', 'stage', stage);
    expect(r.changed).toBe(true);
    expect((await studio.getRoom('garden')).def.stage).toEqual(stage);
    expect((await studio.history()).undo[0]).toBe('garden: stage');
    expect(await studio.undo()).toMatchObject({ ok: true, what: 'garden: stage' });
    expect(garden()).toBe(before);
    await studio.redo();
    expect(garden()).toContain('stage:');
    await studio.undo();
  }, 120000);

  it('an edit that breaks the game is taken back (422), and undo refuses a file changed since', async () => {
    const before = garden();
    const e = await studio.setValue('garden', 'on[0].do', [{ gain: 'no_such_item' }]).catch((x) => x);
    expect(e).toBeInstanceOf(StudioError);
    expect((e as StudioError).status).toBe(422);
    expect(garden()).toBe(before);
    await studio.setValue('garden', 'renderer', 'canvas');
    writeFileSync(join(dir, 'rooms', 'garden.ts'), garden() + '\n// edited elsewhere\n');
    const u = await studio.undo().catch((x) => x);
    expect((u as StudioError).status).toBe(409);
  }, 120000);

  it('the voice table: rows per language, a status set and kept, CSV out', async () => {
    const v = await studio.voices('fr');
    expect(v.langs).toEqual(['en', 'fr']);
    expect(v.rows.length).toBeGreaterThan(100);
    const id = v.rows[0].id;
    await studio.setVoice('fr', id, { status: 'record', note: 'Plus doux' });
    expect((await studio.voices('fr')).rows[0]).toMatchObject({ status: 'record', note: 'Plus doux' });
    expect((await studio.voicesCsv('fr')).csv.split('\n')[1]).toContain('record');
    const bad = await studio.setVoice('fr', 'nope', { status: 'record' }).catch((x) => x);
    expect((bad as StudioError).status).toBe(404);
  }, 120000);
});
