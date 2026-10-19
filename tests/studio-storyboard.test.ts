// Studio core: the Storyboard and Notes endpoints added for the Studio's editors (markdown export, note edit and
// delete), on a temporary copy of games/demo (under .cache/, so the copy resolves @engine like the real game).
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createStudio, importInChild, StudioError } from '../studio-server/src/ops/core';
import { readStoryboard, storyboardMarkdown } from '../tools/pages/storyboard';

const ROOT = resolve(__dirname, '..');
mkdirSync(join(ROOT, '.cache'), { recursive: true });
const dir = mkdtempSync(join(ROOT, '.cache', 'studio-sb-test-'));
cpSync(join(ROOT, 'games', 'demo'), dir, {
  recursive: true,
  filter: (src) => !/[\\/](art|audio|private)([\\/]|$)/.test(src.slice(join(ROOT, 'games', 'demo').length)),
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const studio = createStudio({ gameDir: dir, root: ROOT, importFresh: (f) => importInChild(f, ROOT) });
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

describe('storyboard markdown export', () => {
  it('writes storyboard.md, the same text as the page generator, and follows edits of the JSON', async () => {
    const out = join(dir, 'storyboard.md');
    expect(existsSync(out)).toBe(false);
    const r = await studio.exportStoryboardMarkdown();
    expect(r).toMatchObject({ ok: true, boards: 5 });
    expect(r.panels).toBeGreaterThan(10);
    expect(r.file.endsWith('storyboard.md')).toBe(true);
    const md = read(out);
    expect(r.bytes).toBe(Buffer.byteLength(md));
    expect(md).toContain('### garden-1 · The pipe');
    expect(md).toContain('- ACTION: Pick up pipe');
    expect(md).toContain('- PIXEL: A pipe! Grandpa will not miss it.');
    expect(md).toContain('- SFX: metal');
    const game = (
      (await importInChild(join(dir, 'index.ts'), ROOT)) as { game: Parameters<typeof storyboardMarkdown>[0]['game'] }
    ).game;
    expect(md).toBe(storyboardMarkdown({ game }, readStoryboard(dir)));

    const sb = studio.getStoryboard() as { boards: { panels: { lines: { who: string; text: string }[] }[] }[] };
    sb.boards[1].panels[0].lines.push({ who: 'grandpa', text: 'Bring it back!' });
    await studio.setStoryboard(sb);
    await studio.exportStoryboardMarkdown();
    expect(read(out)).toContain('- GRANDPA: Bring it back!');
  });

  it('404 without a storyboard', async () => {
    rmSync(join(dir, 'storyboard.json'));
    await expectError(studio.exportStoryboardMarkdown(), 404, 'storyboard');
  });
});

describe('notes: edit and delete', () => {
  it('edits the text (and about) of one note, marks it edited, keeps the others', async () => {
    const a = await studio.addNote({ about: 'garden-1', text: 'Shorter line?' });
    const b = await studio.addNote({ about: 'house', text: 'More light.', author: 'an AI' });
    const e = await studio.editNote(a.id, { text: '  Shorter line, please.  ' });
    expect(e).toMatchObject({ id: a.id, about: 'garden-1', author: 'you', text: 'Shorter line, please.', at: a.at });
    expect(typeof e.edited).toBe('string');
    expect((await studio.editNote(a.id, { text: 'x', about: 'garden-2' })).about).toBe('garden-2');
    const all = studio.getNotes().entries;
    expect(all.map((n) => n.id)).toEqual([a.id, b.id]);
    expect(all[1]).toEqual(b);
    await expectError(studio.editNote(a.id, { text: ' ' }), 400);
    await expectError(studio.editNote('nope', { text: 'y' }), 404);
  });

  it('deletes one note; 404 for an unknown id', async () => {
    const before = studio.getNotes().entries;
    expect(await studio.deleteNote(before[0].id)).toEqual({ ok: true });
    expect(studio.getNotes().entries.map((n) => n.id)).toEqual(before.slice(1).map((n) => n.id));
    expect(JSON.parse(read(join(dir, 'notes.json'))).entries).toHaveLength(before.length - 1);
    await expectError(studio.deleteNote(before[0].id), 404);
  });

  it('game info lists the sound effects', async () => {
    const info = await studio.gameInfo();
    expect(info.sfx).toContain('metal');
  });
});
