"""Cut an AI-generated sprite sheet (figures on a flat background, or on a transparent one) into keyed PNG cells.

Default mode (grid): detects one figure per cell of an invisible grid, like the sheets produced by the prompts in
wiki/en/create.images.md. Detection is per figure, not per fixed box, so a figure that overflows its cell a little is
still captured whole; a cell where detection finds nothing falls back to its fixed rectangle, keyed the same way,
so every requested cell is always written.

    python3 tools/cut-sheet.py games/demo/private/asset/hero_sheet.png hero
    python3 tools/cut-sheet.py sheet.png hero --grid 6x4 --out games/demo/art
    python3 tools/cut-sheet.py sheet.png hero --cells r1c2,r3c1      # only (re)cut these cells

    -> <out>/<sheet-id>/r<row>c<col>.png (row 1..R, col 1..C, top to bottom, left to right)

Auto mode (--auto): no grid assumption, detects each sprite wherever it falls on the sheet and writes an index.
Useful for a sheet whose figures are not laid out on a regular grid.

    python3 tools/cut-sheet.py sheet.png minigame_pieces --auto [--tol 40] [--min 2500]

    -> <out>/<sheet-id>/sprite_<row>_<col>.png + index.json (boxes, 0-indexed row/col by visual row)

Pixel art (--pixel, or "artStyle": "pixel" in the game's site.json when neither --pixel nor --cel is given): the
sheet is drawn 4x up (each art pixel a 4 x 4 block, see wiki/en/create.images.md). Each cut figure is scaled down by
--scale (default 4) with nearest neighbour, keyed to fully opaque / fully transparent pixels, quantized to at most
--colors colours (default 32, median cut, no dithering), and near-identical colours (RGB distance < 8) are merged into
one exact value, shared across the cells of the sheet. Written as an indexed PNG (mode P, index 0 transparent).

    python3 tools/cut-sheet.py sheet.png hero --pixel [--scale 4] [--colors 32]

The game: env GAME, else the game .cache/game links to (npm run game, 4.1.6), else package.json -> config.game, else 'demo' (tools/game.ts' rule). Its site.json is
looked up next to the --out folder (<game>/art -> <game>/site.json), then in $GAME_DIR, then in games/<GAME>/.
"""
import argparse
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

CELL = 256
PIXEL_SCALE = 4
PIXEL_COLORS = 32
MERGE_DIST = 8


def game_id():
    g = os.environ.get('GAME', '').strip()
    if g:
        return g
    try:
        g = os.path.basename(os.readlink(os.path.join('.cache', 'game')).rstrip('/\\'))
        if g:
            return g
    except OSError:
        pass
    try:
        g = json.load(open('package.json')).get('config', {}).get('game')
        if g:
            return g
    except Exception:
        pass
    return 'demo'


def art_style(out_root=None):
    """`artStyle` of the game's site.json ('cel' when absent): next to the art folder, then $GAME_DIR, then games/<GAME>."""
    cands = []
    if out_root:
        cands.append(os.path.join(os.path.dirname(os.path.abspath(out_root)), 'site.json'))
    gd = os.environ.get('GAME_DIR', '').strip()
    if gd:
        cands.append(os.path.join(gd, 'site.json'))
    cands.append(f'games/{game_id()}/site.json')
    for c in cands:
        if os.path.exists(c):
            try:
                return 'pixel' if json.load(open(c)).get('artStyle') == 'pixel' else 'cel'
            except Exception:
                return 'cel'
    return 'cel'


# ------------------------------------------------------------------ pixel art

def existing_colors(folder):
    """Opaque colours already used by the cut cells of a folder (so a partial recut reuses their exact values)."""
    out = []
    if not os.path.isdir(folder):
        return out
    for f in sorted(os.listdir(folder)):
        if not f.endswith('.png'):
            continue
        try:
            a = np.asarray(Image.open(os.path.join(folder, f)).convert('RGBA'))
        except Exception:
            continue
        px = a[a[..., 3] >= 128][:, :3]
        if len(px):
            out.extend(np.unique(px, axis=0).astype(int))
    return out


def pixelize(rgba, scale=PIXEL_SCALE, colors=PIXEL_COLORS, merge=MERGE_DIST, shared=None):
    """An RGBA array of a figure drawn `scale` x up -> an indexed PIL image (mode P, index 0 transparent) at 1/scale,
    with at most `colors` colours, near-identical ones (distance < merge) merged. `shared`: a list of RGB colours
    reused across the cells of a sheet (a colour close to one of them takes its exact value; new ones are appended)."""
    im = Image.fromarray(np.ascontiguousarray(rgba), 'RGBA')
    w, h = im.size
    if scale > 1:
        im = im.resize((max(1, round(w / scale)), max(1, round(h / scale))), Image.NEAREST)
    a = np.asarray(im)
    opaque = a[..., 3] >= 128
    out = np.zeros(a.shape[:2], np.uint8)
    pal = [(0, 0, 0)]
    if opaque.any():
        px = np.ascontiguousarray(a[opaque][:, :3])
        strip = Image.fromarray(px.reshape(1, -1, 3), 'RGB')
        q = strip.quantize(colors=max(1, min(int(colors), 255)), method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        idx = np.asarray(q)[0]
        qp = np.array(q.getpalette()[:768] + [0] * max(0, 768 - len(q.getpalette()))).reshape(-1, 3).astype(int)
        used, counts = np.unique(idx, return_counts=True)
        shared = shared if shared is not None else []
        keep, lut = [], np.zeros(256, np.uint8)
        for u in used[np.argsort(-counts, kind='stable')]:
            c = qp[u]
            # Snap to a colour of the sheet first, then to one of this cell: one exact value per material.
            near = next((k for k in shared if np.sqrt(((c - k) ** 2).sum()) < merge), None)
            if near is not None:
                c = np.array(near, int)
            j = next((i for i, k in enumerate(keep) if np.sqrt(((c - k) ** 2).sum()) < merge), None)
            if j is None:
                keep.append(c)
                j = len(keep) - 1
                if near is None:
                    shared.append(c)
            lut[u] = j + 1
        out[opaque] = lut[idx]
        pal += [tuple(int(v) for v in k) for k in keep]
    p = Image.frombytes('P', (out.shape[1], out.shape[0]), out.tobytes())
    flat = [v for c in pal for v in c]
    p.putpalette(flat + [0] * (768 - len(flat)))
    p.info['transparency'] = 0
    return p


def save_cell(rgba, path, pixel=None):
    """Writes a cut figure: RGBA PNG, or with `pixel` = (scale, colors, shared) an indexed pixel-art PNG."""
    if pixel:
        scale, colors, shared = pixel
        pixelize(rgba, scale, colors, shared=shared).save(path, transparency=0)
    else:
        Image.fromarray(rgba, 'RGBA').save(path)


def snap(sl, scale, limit):
    """Widens a slice to the art-pixel grid (multiples of `scale` from the canvas origin)."""
    a = (sl.start // scale) * scale
    b = min(limit, -(-sl.stop // scale) * scale)
    return slice(a, b)


def bg_mask(a, tol=30):
    """Background pixels: close to the sheet's border color (median of the 4 edges)."""
    edge = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(edge, axis=0)
    return np.sqrt(((a - bg) ** 2).sum(-1)) <= tol


def flood_from_border(close):
    """Of the pixels close to the background color, only those connected to the border count as
    background: a dark area fully enclosed by a figure's outline stays part of the figure."""
    lab, _ = ndimage.label(close)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    return np.isin(lab, list(border))


# ------------------------------------------------------------------ grid mode

def cut_grid(src, out_dir, cols, rows, only=None, pixel=None):
    """Detect one figure per cell of a cols x rows grid of CELL x CELL px cells.
    `pixel`: None, or (scale, colors) for pixel art (see pixelize)."""
    im = Image.open(src).convert('RGBA')
    if im.size != (cols * CELL, rows * CELL):
        im = im.resize((cols * CELL, rows * CELL), Image.NEAREST if pixel else Image.LANCZOS)
    rgba = np.asarray(im)
    a = rgba[..., :3].astype(int)
    src_alpha = rgba[..., 3]
    # A sheet generated with a transparent background has real (near) alpha-0 pixels. A sheet on a semi-transparent
    # haze (a flat colour at alpha 200, say) has none: it is a flat sheet, keyed by colour as before.
    transparent = (src_alpha < 8).mean() > 0.2
    if transparent:
        # Transparent pixels are the background, wherever they are (between an arm and the body too), and nothing is
        # keyed by colour.
        close = src_alpha < 128
        fg_all = ndimage.binary_opening(~close, iterations=1)
    else:
        close = bg_mask(a)
        fg_all = ndimage.binary_opening(~flood_from_border(close), iterations=1)
    comp, _n = ndimage.label(ndimage.binary_dilation(fg_all, iterations=4))

    # Every piece goes to the cell holding its centre: a sprite made of several separate
    # parts (sparkles, sound waves, flying objects) keeps all of them together.
    cells = {}
    for k, sl in enumerate(ndimage.find_objects(comp), start=1):
        area = int((fg_all & (comp == k))[sl].sum())
        if area < 40:
            continue
        cy = (sl[0].start + sl[0].stop) / 2
        cx = (sl[1].start + sl[1].stop) / 2
        cell = (min(rows - 1, int(cy // CELL)), min(cols - 1, int(cx // CELL)))
        cells.setdefault(cell, []).append((area, k))
    detected = {}
    for cell, parts in cells.items():
        if max(ar for ar, _ in parts) < 1500:  # only specks: not a sprite
            continue
        detected[cell] = parts

    os.makedirs(out_dir, exist_ok=True)
    written, fallback = [], []
    # Pixel art: colours shared by the cells of the sheet (seeded with the cells already cut, for a partial recut).
    px = (pixel[0], pixel[1], existing_colors(out_dir) if only else []) if pixel else None
    for r in range(rows):
        for c in range(cols):
            name = f'r{r + 1}c{c + 1}'
            if only and name not in only:
                continue
            y0, x0 = r * CELL, c * CELL
            if (r, c) in detected:
                m = np.zeros(fg_all.shape, bool)
                for _, k in detected[(r, c)]:
                    m |= fg_all & (comp == k)
                ys, xs = np.nonzero(m)
                sl = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
                if px:
                    sl = (snap(sl[0], px[0], a.shape[0]), snap(sl[1], px[0], a.shape[1]))
                cut = (m[sl] * 255).astype(np.uint8)
                if transparent:  # keep the source's soft edge
                    cut = np.minimum(cut, src_alpha[sl])
                rgba = np.dstack([a[sl].astype(np.uint8), cut])
            else:
                # Fixed-grid fallback: no figure detected in this cell, key its own rectangle
                # instead of skipping it, so every requested cell is always produced.
                crop = a[y0:y0 + CELL, x0:x0 + CELL]
                alpha = (~close[y0:y0 + CELL, x0:x0 + CELL]) * 255
                rgba = np.dstack([crop.astype(np.uint8), alpha.astype(np.uint8)])
                fallback.append(name)
            save_cell(rgba, f'{out_dir}/{name}.png', px)
            written.append(name)
    return written, fallback


# ------------------------------------------------------------------ auto mode (free layout)

def cut_auto(src, out_dir, tol=40, minarea=2500, pixel=None):
    """Detect sprites anywhere on the sheet (no grid assumption), group them into visual rows,
    and write an index.json with each box. Ported from the former scripts/extract-sheet.py."""
    raw = Image.open(src)
    alpha = np.asarray(raw.convert('RGBA'))[..., 3] if raw.mode == 'RGBA' else None
    im = raw.convert('RGB')
    a = np.asarray(im).astype(int)
    close = bg_mask(a, tol)
    fg = ~flood_from_border(close)
    if alpha is not None and (alpha < 250).mean() > 0.2:
        # The sheet is already keyed (transparent background, or a semi-transparent haze):
        # keep the opaque pixels instead of relying on a flat background color.
        fg = alpha > 215
        fg = ndimage.binary_fill_holes(ndimage.binary_closing(fg, iterations=2))
    fg = ndimage.binary_opening(fg, iterations=1)
    lab, _n = ndimage.label(ndimage.binary_dilation(fg, iterations=3))
    boxes = []
    for sl in ndimage.find_objects(lab):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        if (y1 - y0) * (x1 - x0) < minarea:
            continue
        boxes.append([x0, y0, x1, y1])
    # Sort into rows by vertical center.
    boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
    rows = []
    for b in boxes:
        cy = (b[1] + b[3]) / 2
        if rows and abs(cy - rows[-1][0]) < (b[3] - b[1]) * 0.45:
            rows[-1][1].append(b)
        else:
            rows.append([cy, [b]])

    os.makedirs(out_dir, exist_ok=True)
    rgba = np.dstack([np.asarray(im), (fg * 255).astype(np.uint8)])
    index = []
    px = (pixel[0], pixel[1], []) if pixel else None
    for r, (_, bs) in enumerate(rows):
        for c, (x0, y0, x1, y1) in enumerate(sorted(bs, key=lambda b: b[0])):
            name = f'sprite_{r}_{c}.png'
            save_cell(np.ascontiguousarray(rgba[y0:y1, x0:x1]), os.path.join(out_dir, name), px)
            index.append({'file': name, 'row': r, 'col': c, 'box': [x0, y0, x1, y1]})
    json.dump(index, open(os.path.join(out_dir, 'index.json'), 'w'), indent=1)
    return index, rows


def main():
    p = argparse.ArgumentParser(description='Cut a sprite sheet on a flat or transparent background into keyed PNG cells.')
    p.add_argument('sheet', help='source sheet image (.png)')
    p.add_argument('sheet_id', help='sheet id: output subfolder, and how images are referenced (<sheet-id>/r<row>c<col>)')
    p.add_argument('--grid', default='6x4', help='grid mode: COLSxROWS, e.g. 6x4 (default) or 3x3')
    p.add_argument('--out', default=None, help='output root (default: games/<GAME>/art)')
    p.add_argument('--cells', default=None, help='grid mode: only (re)cut these cells, e.g. r1c2,r3c1')
    p.add_argument('--auto', action='store_true', help='auto mode: free layout detection + index.json, instead of a fixed grid')
    p.add_argument('--tol', type=float, default=40, help='auto mode: background color tolerance (default 40)')
    p.add_argument('--min', dest='minarea', type=int, default=2500, help='auto mode: minimum sprite area in px (default 2500)')
    p.add_argument('--pixel', action='store_true', help='pixel art: scale down, fix the colours, write indexed PNGs (default: the game\'s site.json "artStyle")')
    p.add_argument('--cel', action='store_true', help='not pixel art, whatever site.json says')
    p.add_argument('--scale', type=int, default=PIXEL_SCALE, help=f'pixel art: the sheet is drawn SCALE x up (default {PIXEL_SCALE})')
    p.add_argument('--colors', type=int, default=PIXEL_COLORS, help=f'pixel art: at most this many colours per cell (default {PIXEL_COLORS})')
    args = p.parse_args()

    out_root = args.out or f'games/{game_id()}/art'
    out_dir = os.path.join(out_root, args.sheet_id)
    is_pixel = args.pixel or (not args.cel and art_style(out_root) == 'pixel')
    pixel = (max(1, args.scale), max(1, args.colors)) if is_pixel else None

    if args.auto:
        index, rows = cut_auto(args.sheet, out_dir, tol=args.tol, minarea=args.minarea, pixel=pixel)
        print(f'ok: {len(index)} sprites, {len(rows)} row(s) in {out_dir}: {[len(b) for _, b in rows]}')
        return

    cols, rows = (int(x) for x in args.grid.lower().split('x'))
    only = set(args.cells.split(',')) if args.cells else None
    written, fallback = cut_grid(args.sheet, out_dir, cols, rows, only=only, pixel=pixel)
    msg = f'ok: {len(written)} cell(s) in {out_dir}' + (f' (pixel art: 1/{pixel[0]} scale, <= {pixel[1]} colours)' if pixel else '')
    if fallback:
        msg += f' (fixed-grid fallback, no figure detected: {fallback})'
    print(msg)


if __name__ == '__main__':
    main()
