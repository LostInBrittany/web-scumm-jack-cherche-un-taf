// The Studio's Assets tab, server side (tools/studio/assets.ts): the listing on games/demo (sheets, where each cell is
// used, prompts), then the uploads on a temporary copy (under .cache/, so the copy resolves @engine like the real
// game): a cell replaced with a backup first, a synthetic 6 x 4 sheet cut into 24 cells and refused (409) when uploaded
// again without naming the cells, a sound, a decor.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { BrowserApi } from '../src/studio/api-browser';
import { createAssets, imageSize } from '../tools/studio/assets';
import { createStudio, importInChild, StudioError } from '../studio-server/src/ops/core';
import { buildSnapshot } from '../tools/studio/snapshot';

const ROOT = resolve(__dirname, '..');
const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

const importFresh = (file: string) => importInChild(file, ROOT);
const assetsOf = (gameDir: string) => createAssets(createStudio({ gameDir, root: ROOT, importFresh }));

function copyDemo(): string {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.cache', 'studio-assets-test-'));
  temps.push(dir);
  const src = join(ROOT, 'games', 'demo');
  cpSync(src, dir, { recursive: true, filter: (f) => !/[\\/]private([\\/]|$)/.test(f.slice(src.length)) });
  return dir;
}

/** A PNG made with PIL (python3), as base64: `figures` coloured discs on the flat #2B2E45 background, in a cols x rows grid of 256 px cells. */
function png(cols: number, rows: number, opts: { alpha?: boolean } = {}): string {
  const out = join(ROOT, '.cache', `studio-assets-test-${process.pid}-${cols}x${rows}${opts.alpha ? 'a' : ''}.png`);
  execFileSync('python3', [
    '-c',
    `
from PIL import Image, ImageDraw
import sys
c, r, a = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3] == '1'
im = Image.new('RGBA' if a else 'RGB', (c * 256, r * 256), (0, 0, 0, 0) if a else (0x2B, 0x2E, 0x45))
d = ImageDraw.Draw(im)
for y in range(r):
    for x in range(c):
        d.ellipse([x * 256 + 48, y * 256 + 40, x * 256 + 208, y * 256 + 230], fill=(200, 40 + 8 * x, 40 + 30 * y, 255), outline=(10, 10, 10, 255), width=4)
im.save(sys.argv[4])
`,
    String(cols),
    String(rows),
    opts.alpha ? '1' : '0',
    out,
  ]);
  const b64 = readFileSync(out).toString('base64');
  rmSync(out);
  return `data:image/png;base64,${b64}`;
}

async function expectError(
  p: Promise<unknown>,
  status: number,
): Promise<StudioError & { body?: Record<string, unknown> }> {
  const e = await p.then(
    () => null,
    (x) => x,
  );
  expect(e).toBeInstanceOf(StudioError);
  expect((e as StudioError).status).toBe(status);
  return e as StudioError & { body?: Record<string, unknown> };
}

describe('assets listing on games/demo', () => {
  const demo = assetsOf(join(ROOT, 'games', 'demo'));

  it('lists the sheets with where each cell is used', async () => {
    const l = await demo.list();
    const hero = l.sheets.find((s) => s.id === 'hero')!;
    expect(hero).toMatchObject({ kind: 'sprites', character: 'hero', grid: '6x4', promptKind: 'character' });
    expect(hero.cells).toHaveLength(24);
    const portrait = l.sheets.find((s) => s.id === 'grandpa')!.cells.find((c) => c.id === 'r1c2')!;
    expect(portrait.used).toContain('cast.grandpa.portrait');
    expect(portrait).toMatchObject({
      file: 'art/grandpa/r1c2.png',
      ids: ['grandpa/r1c2'],
      prepared: true,
      asset: 'img/grandpa/r1c2.webp',
    });
    expect(portrait.w).toBeGreaterThan(100);
    // Used and unused cells, talk kits and furniture apart.
    expect(hero.cells.filter((c) => c.used.length).length).toBeGreaterThan(10);
    expect(l.sheets.find((s) => s.id === 'grandpa')!.cells.filter((c) => !c.used.length).length).toBeGreaterThan(10);
    expect(l.sheets.find((s) => s.id === 'talk_grandpa')).toMatchObject({ kind: 'talk', character: 'grandpa' });
    expect(l.sheets.find((s) => s.id === 'talk_grandpa')!.cells.some((c) => c.id === 'assis/t1')).toBe(true);
    expect(l.sheets.find((s) => s.id === 'furniture_market')!.kind).toBe('furniture');
    expect(l.sheets.find((s) => s.id === 'items')!.cells.some((c) => c.used.some((u) => u.startsWith('items.')))).toBe(
      true,
    );
    expect(l.missing).toEqual([]);
    expect(l.unprepared).toBeGreaterThanOrEqual(0);
  });

  it('lists the decors with their rooms, and the sounds with their ids', async () => {
    const l = await demo.list();
    const dining = l.decors.find((d) => d.name === 'decor/dining')!;
    expect(dining.rooms).toEqual(['house']);
    expect(dining.used).toContain('house.decor');
    expect(dining.file).toBe('art/decor/dining.jpg');
    const bell = l.sounds.sfx.find((s) => s.id === 'bell.mp3')!;
    expect(bell.used[0]).toBe('audio.sfx.bell');
    expect(bell.asset).toBe('audio/sfx/bell.mp3');
    // The audio folder is shared with the reference chapter (3.7): its market score and bridges are listed, unused here.
    expect(l.sounds.music.map((m) => m.id)).toEqual([
      'bridge_to_market.mp3',
      'bridge_to_theme.mp3',
      'night_market.mp3',
      'swan_theme.mp3',
    ]);
    expect(l.sounds.music.find((m) => m.id === 'swan_theme.mp3')!.used).toContain('audio.music.theme');
    expect(l.sounds.music.find((m) => m.id === 'night_market.mp3')!.used).toEqual([]);
  });

  it('carries the prompt of each sheet and the shared style block', async () => {
    const l = await demo.list();
    expect(l.prompts.style).toMatch(/^## Style block/);
    expect(l.prompts.style).toContain('#2B2E45');
    const hero = l.prompts.sheets.find((p) => p.id === 'hero')!;
    expect(hero.markdown).toMatch(/^#### Base sheet `hero`/);
    expect(hero.markdown).toContain('```text');
    expect(hero.missingMarkdown).toBeUndefined();
    expect(l.prompts.sheets.find((p) => p.id === 'decor/dining')!.markdown).toMatch(/^### Background `decor\/dining`/);
    expect(l.prompts.sheets.find((p) => p.id === 'items')!.markdown).toMatch(/^### Objects `items`/);
    expect((await demo.prompts(true)).markdown).toContain('Nothing is missing');
  });

  it('serves only files of art/ and audio/', () => {
    expect(demo.filePath('art/hero/r1c1.png')).toBe(join(ROOT, 'games', 'demo', 'art', 'hero', 'r1c1.png'));
    expect(demo.filePath('audio/sfx/bell.mp3')).toBeTruthy();
    for (const bad of [
      '../package.json',
      'art/../index.ts',
      'art/%2e%2e/index.ts',
      'index.ts',
      'art/hero',
      'rooms/house.ts',
      'art//hero/r1c1.png',
    ]) {
      expect(demo.filePath(bad), bad).toBeNull();
    }
  });
});

describe('asset uploads on a copy of games/demo', () => {
  const dir = copyDemo();
  const a = assetsOf(dir);

  it('replaces a cell: the old file is kept as _v1, then _v2; a flat background is keyed', async () => {
    const file = join(dir, 'art', 'hero', 'r1c1.png');
    const before = readFileSync(file);
    const r = await a.replaceCell({ sheetId: 'hero', cell: 'r1c1', data: png(1, 1) });
    expect(r).toMatchObject({ ok: true, file: 'art/hero/r1c1.png', backup: 'art/hero/r1c1_v1.png', keyed: 'keyed' });
    expect(readFileSync(join(dir, 'art', 'hero', 'r1c1_v1.png')).equals(before)).toBe(true);
    const after = readFileSync(file);
    expect(after.equals(before)).toBe(false);
    expect(after[25]).toBe(6); // PNG colour type 6: RGBA
    expect(imageSize(file)[0]).toBeLessThan(256); // cropped to the figure
    expect(r.cell.backups).toEqual(['art/hero/r1c1_v1.png']);
    // Backups are not cells.
    expect((await a.list()).sheets.find((s) => s.id === 'hero')!.cells).toHaveLength(24);
    const r2 = await a.replaceCell({ sheetId: 'hero', cell: 'r1c1', data: png(1, 1, { alpha: true }) });
    expect(r2).toMatchObject({ backup: 'art/hero/r1c1_v2.png', keyed: 'kept' });
    await expectError(a.replaceCell({ sheetId: 'hero', cell: '../x', data: png(1, 1) }), 400);
    await expectError(a.replaceCell({ sheetId: 'hero', cell: 'r1c1', data: 'bm90IGFuIGltYWdl' }), 400);
  }, 30000);

  it('cuts an uploaded 6 x 4 sheet into 24 cells, and refuses to overwrite them without naming the cells', async () => {
    const data = png(6, 4);
    const r = await a.uploadSheet({ sheetId: 'synth', grid: '6x4', data });
    expect(r.written).toHaveLength(24);
    expect(r.cells.filter((c) => !c.missing)).toHaveLength(24);
    expect(r.output).toContain('24 cell(s)');
    expect(r.file).toMatch(/private\/sheets\/synth-.*\.png$/);
    expect(existsSync(join(ROOT, r.file))).toBe(true);
    expect(readdirSync(join(dir, 'art', 'synth')).filter((f) => f.endsWith('.png'))).toHaveLength(24);

    const e = await expectError(a.uploadSheet({ sheetId: 'synth', grid: '6x4', data }), 409);
    expect(e.body?.conflicts).toHaveLength(24);

    const r2 = await a.uploadSheet({ sheetId: 'synth', grid: '6x4', cells: 'r2c3', data });
    expect(r2.written).toEqual(['r2c3']);
    expect(r2.backups).toEqual(['art/synth/r2c3_v1.png']);
    await expectError(a.uploadSheet({ sheetId: 'synth', grid: '6x4', cells: 'r9c1', data }), 400);
    await expectError(a.uploadSheet({ sheetId: 'decor', data }), 400);
  }, 60000);

  it('saves a sound, keeping the one it replaces', async () => {
    const r = await a.uploadSound({ kind: 'sfx', file: 'beep.ogg', data: Buffer.from('OggS fake').toString('base64') });
    expect(r).toEqual({ ok: true, file: 'audio/sfx/beep.ogg' });
    const r2 = await a.uploadSound({
      kind: 'sfx',
      file: 'beep.ogg',
      data: Buffer.from('OggS other').toString('base64'),
    });
    expect(r2.backup).toBe('audio/sfx/beep_v1.ogg');
    expect(readFileSync(join(dir, 'audio', 'sfx', 'beep.ogg'), 'utf8')).toBe('OggS other');
    const beep = (await a.list()).sounds.sfx.find((s) => s.id === 'beep.ogg')!;
    expect(beep).toMatchObject({ used: [], backups: ['audio/sfx/beep_v1.ogg'] });
    await expectError(a.uploadSound({ kind: 'sfx', file: '../beep.ogg', data: 'AAAA' }), 400);
    await expectError(a.uploadSound({ kind: 'voice' as 'sfx', file: 'beep.ogg', data: 'AAAA' }), 400);
  });

  it('saves a decor, moving away the picture it replaces', async () => {
    const r = await a.uploadDecor({ name: 'street', data: png(2, 1) });
    expect(r).toEqual({ ok: true, file: 'art/decor/street.png', backup: 'art/decor/street_v1.jpg' });
    expect(existsSync(join(dir, 'art', 'decor', 'street.jpg'))).toBe(false);
    const street = (await a.list()).decors.find((d) => d.name === 'decor/street')!;
    expect(street).toMatchObject({
      file: 'art/decor/street.png',
      w: 512,
      h: 256,
      backups: ['art/decor/street_v1.jpg'],
    });
    await expectError(a.uploadDecor({ name: 'a/b', data: png(1, 1) }), 400);
  });
});

describe('demo mode', () => {
  it('reads the assets listing from the snapshot', async () => {
    const snapshot = await buildSnapshot({ gameDir: join(ROOT, 'games', 'demo'), root: ROOT, importFresh });
    const l = await new BrowserApi({ snapshot }).assets();
    expect(l.sheets.find((s) => s.id === 'hero')!.cells).toHaveLength(24);
    expect(l.prompts.sheets.length).toBeGreaterThan(5);
    // No file data in the snapshot: the demo shows the prepared copies of public/assets.
    expect(JSON.stringify(l)).not.toContain('base64');
    const { assets: _a, ...rest } = snapshot;
    await expect(new BrowserApi({ snapshot: rest }).assets()).rejects.toThrow(/no assets listing/);
  }, 30000);
});
