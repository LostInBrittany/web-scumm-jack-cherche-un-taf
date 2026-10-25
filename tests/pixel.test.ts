// The pixel-art preset and the palette swap: tools/cut-sheet.py in pixel mode on a synthetic sheet drawn 4x up (cells at
// 1/4 size, indexed PNG, at most N colours, near-identical colours merged into one exact value shared by the cells,
// artStyle read from site.json), the pure palette swap of src/engine/dom/palette.ts on those exact colours, and the
// validator's warning on a palette that is not #rrggbb. Also the sheet background (#186): the grid cut of a sheet on a
// transparent background, tools/check-alpha.py and tools/pick-bg.py.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { GameDef } from '@engine/core/types';
import { paletteKey, parseHex, swapPalette } from '../src/engine/dom/palette';
import { validate } from '../src/engine/tools/validate';
import { game } from '../games/demo/game';

const ROOT = resolve(__dirname, '..');
mkdirSync(join(ROOT, '.cache'), { recursive: true });
const tmp = mkdtempSync(join(ROOT, '.cache', 'pixel-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const py = (code: string, ...args: string[]) =>
  execFileSync('python3', ['-c', code, ...args], { cwd: ROOT, encoding: 'utf8' });

/**
 * A 6 x 4 sheet drawn as 64 x 64 pixel art scaled up 4x on #2B2E45: per cell an outline box, a base, a highlight and a
 * shadow band, every figure pixel jittered by ±3 per channel (near-identical colours), and a 1 px anti-aliased fringe.
 */
function sheet(file: string) {
  py(
    `
import sys, numpy as np
from PIL import Image
rng = np.random.default_rng(7)
small = np.zeros((4 * 64, 6 * 64, 3), np.uint8); small[:] = (0x2B, 0x2E, 0x45)
for r in range(4):
    for c in range(6):
        y, x = r * 64, c * 64
        small[y + 8:y + 56, x + 16:x + 48] = (20, 10, 12)
        small[y + 10:y + 54, x + 18:x + 46] = (200, 80, 40)
        small[y + 10:y + 30, x + 18:x + 46] = (230, 140, 70)
        small[y + 40:y + 54, x + 18:x + 46] = (140, 50, 60)
big = np.repeat(np.repeat(small, 4, 0), 4, 1).astype(int)
fig = np.abs(big - np.array([0x2B, 0x2E, 0x45])).sum(-1) > 0
big[fig] = np.clip(big[fig] + rng.integers(-3, 4, big.shape)[fig], 0, 255)
Image.fromarray(big.astype(np.uint8), 'RGB').save(sys.argv[1])
`,
    file,
  );
}

/** Mode, size and the distinct opaque colours of each PNG of a folder (JSON). */
function inspect(
  dir: string,
): Record<string, { mode: string; size: [number, number]; colors: string[]; transparency: number | null }> {
  return JSON.parse(
    py(
      `
import sys, os, json, numpy as np
from PIL import Image
out = {}
for f in sorted(os.listdir(sys.argv[1])):
    im = Image.open(os.path.join(sys.argv[1], f))
    a = np.asarray(im.convert('RGBA'))
    cols = sorted({'#%02x%02x%02x' % tuple(int(v) for v in p) for p in a[a[..., 3] > 0][:, :3]})
    out[f[:-4]] = {'mode': im.mode, 'size': list(im.size), 'colors': cols, 'transparency': im.info.get('transparency')}
print(json.dumps(out))
`,
      dir,
    ),
  );
}

describe('tools/cut-sheet.py --pixel', () => {
  const src = join(tmp, 'sheet.png');
  sheet(src);

  it('cuts cells at 1/4 size, indexed with a transparent index, near-identical colours merged into one value per material', () => {
    execFileSync('python3', ['tools/cut-sheet.py', src, 'px', '--out', join(tmp, 'a'), '--pixel'], { cwd: ROOT });
    const cells = inspect(join(tmp, 'a', 'px'));
    expect(Object.keys(cells)).toHaveLength(24);
    const all = new Set<string>();
    for (const c of Object.values(cells)) {
      expect(c.mode).toBe('P');
      expect(c.transparency).toBe(0);
      // The figure is 32 x 48 art pixels (128 x 192 on the sheet).
      expect(c.size).toEqual([32, 48]);
      // Outline, shadow, base, highlight: the ±3 jitter is gone.
      expect(c.colors).toHaveLength(4);
      c.colors.forEach((x) => all.add(x));
    }
    // The same material has the same exact value in every cell.
    expect(all.size).toBe(4);
  });

  it('keeps at most --colors colours per cell', () => {
    execFileSync(
      'python3',
      ['tools/cut-sheet.py', src, 'px', '--out', join(tmp, 'b'), '--pixel', '--colors', '3', '--cells', 'r1c1,r2c2'],
      { cwd: ROOT },
    );
    const cells = inspect(join(tmp, 'b', 'px'));
    expect(Object.keys(cells)).toEqual(['r1c1', 'r2c2']);
    for (const c of Object.values(cells)) expect(c.colors.length).toBeLessThanOrEqual(3);
  });

  it("reads artStyle from the game's site.json next to the art folder; --cel overrides it", () => {
    const game = join(tmp, 'game');
    mkdirSync(game, { recursive: true });
    writeFileSync(join(game, 'site.json'), JSON.stringify({ title: 'x', artStyle: 'pixel' }));
    execFileSync('python3', ['tools/cut-sheet.py', src, 'px', '--out', join(game, 'art'), '--cells', 'r1c1'], {
      cwd: ROOT,
    });
    expect(inspect(join(game, 'art', 'px')).r1c1).toMatchObject({ mode: 'P', size: [32, 48] });
    execFileSync(
      'python3',
      ['tools/cut-sheet.py', src, 'cel', '--out', join(game, 'art'), '--cells', 'r1c1', '--cel'],
      { cwd: ROOT },
    );
    const cel = inspect(join(game, 'art', 'cel')).r1c1;
    expect(cel.mode).toBe('RGBA');
    expect(cel.size).toEqual([128, 192]);
    expect(cel.colors.length).toBeGreaterThan(4);
  });

  it('gives exact colours a palette swap can replace', () => {
    // The RGBA bytes of a cut cell, swapped in node with the pure function the engine uses.
    const raw = py(
      `
import sys, numpy as np
from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert('RGBA'))
print(a.shape[1], a.shape[0], a.tobytes().hex())
`,
      join(tmp, 'a', 'px', 'r1c1.png'),
    )
      .trim()
      .split(' ');
    const data = new Uint8ClampedArray(Buffer.from(raw[2], 'hex'));
    const colors = inspect(join(tmp, 'a', 'px')).r1c1.colors;
    const count = (hex: string) => {
      const [r, g, b] = parseHex(hex)!;
      let n = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i + 3] && data[i] === r && data[i + 1] === g && data[i + 2] === b) n++;
      return n;
    };
    const base = colors.find((c) => parseHex(c)![0] > 180 && parseHex(c)![1] < 100)!;
    const before = count(base);
    expect(before).toBeGreaterThan(100);
    const changed = swapPalette(data, { [base]: '#3060c0' });
    expect(changed).toBe(before);
    expect(count(base)).toBe(0);
    expect(count('#3060c0')).toBe(before);
  });
});

/** Per cell of a folder: size and a hash of the alpha channel (JSON), to compare two cuts of the same figures. */
function masks(dir: string): Record<string, { size: [number, number]; alpha: string; opaque: number }> {
  return JSON.parse(
    py(
      `
import sys, os, json, hashlib, numpy as np
from PIL import Image
out = {}
for f in sorted(os.listdir(sys.argv[1])):
    a = np.asarray(Image.open(os.path.join(sys.argv[1], f)).convert('RGBA'))[..., 3]
    out[f[:-4]] = {'size': [a.shape[1], a.shape[0]], 'alpha': hashlib.sha1(a.tobytes()).hexdigest(), 'opaque': int((a > 0).sum())}
print(json.dumps(out))
`,
      dir,
    ),
  );
}

describe('tools/cut-sheet.py on a transparent sheet (sheetBackground "transparent")', () => {
  const flat = join(tmp, 'flat.png');
  const clear = join(tmp, 'clear.png');
  sheet(flat);
  // The same sheet with its #2B2E45 background made transparent (black under alpha 0); in cell r1c1 the outline is then
  // repainted #2B2E45, opaque: a dark figure the colour of the old background.
  py(
    `
import sys, numpy as np
from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert('RGB')).copy()
bg = (a == (0x2B, 0x2E, 0x45)).all(-1)
a[bg] = 0  # what is under a transparent pixel is anything (black here): never a colour to key
rgba = np.dstack([a, np.where(bg, 0, 255).astype(np.uint8)])
Image.fromarray(rgba, 'RGBA').save(sys.argv[2])
dark = rgba.copy()
dark[32:224, 64:192][(dark[32:224, 64:192, :3] == (20, 10, 12)).all(-1), :3] = (0x2B, 0x2E, 0x45)
Image.fromarray(dark, 'RGBA').save(sys.argv[3])
`,
    flat,
    clear,
    join(tmp, 'dark.png'),
  );

  it('cuts the same cells as the flat sheet: same sizes, same alpha', () => {
    for (const [src, out] of [
      [flat, 'flat'],
      [clear, 'clear'],
    ])
      execFileSync('python3', ['tools/cut-sheet.py', src, 's', '--out', join(tmp, out), '--cel'], { cwd: ROOT });
    const a = masks(join(tmp, 'flat', 's'));
    expect(Object.keys(a)).toHaveLength(24);
    expect(a.r1c1.size).toEqual([128, 192]);
    expect(masks(join(tmp, 'clear', 's'))).toEqual(a);
  });

  it('keys nothing by colour: a figure painted in the old background colour stays whole', () => {
    execFileSync('python3', ['tools/cut-sheet.py', join(tmp, 'dark.png'), 's', '--out', join(tmp, 'dark'), '--cel'], {
      cwd: ROOT,
    });
    expect(masks(join(tmp, 'dark', 's')).r1c1).toEqual(masks(join(tmp, 'flat', 's')).r1c1);
  });

  it('cuts a sheet on a semi-transparent haze as a flat sheet: 24 figures, not one', () => {
    // The flat sheet with its #2B2E45 background at alpha 200: no pixel is really transparent, so the colour keys it.
    py(
      `
import sys, numpy as np
from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert('RGB'))
bg = (a == (0x2B, 0x2E, 0x45)).all(-1)
Image.fromarray(np.dstack([a, np.where(bg, 200, 255).astype(np.uint8)]), 'RGBA').save(sys.argv[2])
`,
      flat,
      join(tmp, 'haze.png'),
    );
    execFileSync('python3', ['tools/cut-sheet.py', join(tmp, 'haze.png'), 's', '--out', join(tmp, 'haze'), '--cel'], {
      cwd: ROOT,
    });
    expect(masks(join(tmp, 'haze', 's'))).toEqual(masks(join(tmp, 'flat', 's')));
  });
});

describe('tools/check-alpha.py and tools/pick-bg.py', () => {
  /** Writes `file`: a 512 x 512 image, an orange figure with a pinkish purple shadow and a dark outline on `bg`. */
  const figure = (file: string, bg: string) =>
    py(
      `
import sys, numpy as np
from PIL import Image
bg = sys.argv[2]
a = np.zeros((512, 512, 4), np.uint8)
if bg == 'checker':
    yy, xx = np.mgrid[0:512, 0:512]
    a[..., :3] = np.where((((yy // 16) + (xx // 16)) % 2 == 0)[..., None], 255, 204)
    a[..., 3] = 255
elif bg != 'transparent':
    a[..., :3] = [int(bg[i:i + 2], 16) for i in (1, 3, 5)]
    a[..., 3] = 255
a[120:400, 160:360] = (30, 20, 25, 255)
a[124:396, 164:356] = (230, 120, 40, 255)
a[300:396, 164:356] = (150, 60, 90, 255)
Image.fromarray(a, 'RGBA').save(sys.argv[1])
`,
      file,
      bg,
    );
  const verdict = (file: string) =>
    execFileSync('python3', ['tools/check-alpha.py', file], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').pop();

  it('check-alpha tells real alpha from a painted checkerboard and from an opaque image', () => {
    figure(join(tmp, 'alpha.png'), 'transparent');
    figure(join(tmp, 'checker.png'), 'checker');
    figure(join(tmp, 'opaque.png'), '#2B2E45');
    expect(verdict(join(tmp, 'alpha.png'))).toBe('TRANSPARENT');
    expect(verdict(join(tmp, 'checker.png'))).toBe('FAKE CHECKERBOARD');
    expect(verdict(join(tmp, 'opaque.png'))).toBe('OPAQUE');
  });

  it("pick-bg ranks cyan first for an orange figure, leaving a sheet's own flat background out", () => {
    const pick = (...files: string[]) =>
      execFileSync('python3', ['tools/pick-bg.py', ...files], { cwd: ROOT, encoding: 'utf8' });
    const best = (...files: string[]) =>
      pick(...files)
        .trim()
        .split('\n')
        .pop();
    figure(join(tmp, 'orange.png'), 'transparent');
    expect(best(join(tmp, 'orange.png'))).toBe('BEST #00FFFF');
    // On a flat cyan sheet, cyan is still the farthest from the drawing: the border colour is not counted.
    figure(join(tmp, 'on-cyan.png'), '#00FFFF');
    expect(best(join(tmp, 'on-cyan.png'))).toBe('BEST #00FFFF');
    expect(pick(join(tmp, 'on-cyan.png'))).toMatch(/^3 colours in the drawing/);
    // A folder of cut sprites works too.
    mkdirSync(join(tmp, 'sprites'), { recursive: true });
    figure(join(tmp, 'sprites', 'r1c1.png'), 'transparent');
    expect(best(join(tmp, 'sprites'))).toBe('BEST #00FFFF');
  });

  it('pick-bg counts the dark colours of a cut sprite: its transparent border (black underneath) is no background', () => {
    // A dark navy figure with a white patch, alpha 0 around it and black under the alpha.
    py(
      `
import sys, numpy as np
from PIL import Image
a = np.zeros((256, 256, 4), np.uint8)
a[40:216, 60:196] = (20, 24, 48, 255)
a[80:120, 100:140] = (252, 252, 252, 255)
Image.fromarray(a, 'RGBA').save(sys.argv[1])
`,
      join(tmp, 'navy.png'),
    );
    const out = execFileSync('python3', ['tools/pick-bg.py', join(tmp, 'navy.png')], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toMatch(/^2 colours in the drawing/);
    // Navy counted, blue and green are close to the drawing; white alone would have ranked them first.
    expect(out.trim().split('\n').pop()).toBe('BEST #FF00FF');
  });
});

describe('palette swap (src/engine/dom/palette.ts)', () => {
  const px = (...p: number[][]) => new Uint8ClampedArray(p.flat());

  it('exact matches only by default, alpha kept, transparent pixels untouched', () => {
    const d = px([10, 20, 30, 255], [10, 20, 31, 255], [10, 20, 30, 128], [10, 20, 30, 0], [1, 2, 3, 255]);
    expect(swapPalette(d, { '#0a141e': '#ff8000', '#010203': '#00ff00' })).toBe(3);
    expect([...d]).toEqual([255, 128, 0, 255, 10, 20, 31, 255, 255, 128, 0, 128, 10, 20, 30, 0, 0, 255, 0, 255]);
  });

  it('with a tolerance: the nearest source wins and the pixel keeps its offset; beyond it nothing changes', () => {
    const d = px([12, 20, 30, 255], [100, 100, 100, 255], [40, 20, 30, 255]);
    expect(swapPalette(d, { '#0a141e': '#ff8000', '#646464': '#000000' }, 5)).toBe(2);
    expect([...d]).toEqual([255, 128, 0, 255, 0, 0, 0, 255, 40, 20, 30, 255]);
    const e = px([12, 20, 30, 255]);
    swapPalette(e, { '#0a141e': '#808080' }, 5);
    expect([...e]).toEqual([130, 128, 128, 255]);
  });

  it('ignores invalid entries and keys palettes independently of order', () => {
    const d = px([10, 20, 30, 255]);
    expect(swapPalette(d, { red: '#000000', '#0a141e': 'blue' })).toBe(0);
    expect(parseHex('#0A141E')).toEqual([10, 20, 30]);
    expect(parseHex('#abc')).toBeNull();
    expect(paletteKey({ '#000000': '#111111', '#AAAAAA': '#222222' })).toBe(
      paletteKey({ '#aaaaaa': '#222222', '#000000': '#111111' }),
    );
    expect(paletteKey({ '#000000': '#111111' }, 12)).not.toBe(paletteKey({ '#000000': '#111111' }));
  });

  it('the validator warns about a palette colour that is not #rrggbb, and accepts the demo', () => {
    const g = structuredClone(game) as GameDef;
    expect(validate(g, {}).warnings.filter((w) => w.includes('palette'))).toEqual([]);
    g.characters.biscuit.palette = { ginger: '#c0682a', '#123456': 'red' };
    g.characters.hero.variants = [{ if: 'x', palette: { '#12345': '#000000' }, paletteTolerance: -1 }];
    const w = validate(g, {}).warnings.filter((x) => x.includes('palette'));
    expect(w).toEqual(
      expect.arrayContaining([
        expect.stringContaining('character biscuit.palette › palette key "ginger" is not a #rrggbb colour'),
        expect.stringContaining('palette value for "#123456" is not a #rrggbb colour'),
        expect.stringContaining('character hero.variants[0].palette › palette key "#12345"'),
        expect.stringContaining('paletteTolerance must be a number >= 0'),
      ]),
    );
  });
});
