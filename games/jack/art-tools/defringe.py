"""Removes the pink fringe a magenta (#FF00FF) sheet background leaves around cut sprites.

A fringe pixel is opaque, touches transparency (or another fringe pixel, so 2-3 px thick fringes go too) and leans
to magenta: red and blue both clearly above green. Those pixels become transparent. Characters with pink parts
(Mémé Guimauve's hat and apron) keep them: only pixels connected to the edge of the figure are removed, and only
while they stay magenta-ish.

Usage (from the repo root):  python3 games/jack/art-tools/defringe.py <folder or png> [...] [--dry] [--navy] [--safe]
--navy: for sheets generated on the old #2B2E45 background (bluish fringe) instead of magenta.
--bg '#RRGGBB': for sheets generated on another flat colour (the one pick-bg.py chose, e.g. '#00FFFF'). A fringe
pixel is then close to that colour, or has its hue (a blend of it with the outline).
Sheets generated with a transparent background need no defringe.
"""
import sys
import numpy as np
from pathlib import Path
from PIL import Image

BG = 'magenta'
BG_RGB = None  # with --bg: the background colour

def hue(rgb):
    r, g, b = (rgb[..., i].astype(float) / 255 for i in range(3))
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    d = np.where(mx - mn == 0, 1, mx - mn)
    h = np.where(mx == r, (g - b) / d % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    sat = np.where(mx == 0, 0, (mx - mn) / np.where(mx == 0, 1, mx))
    return h, sat, mx

def magentaish(rgb):
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    if BG == 'custom':
        # Blend of the background with the outline: the background's hue, still saturated.
        h, sat, val = hue(rgb[..., :3])
        bh, _, _ = hue(np.array(BG_RGB, np.uint8).reshape(1, 1, 3))
        dh = np.abs((h - bh[0, 0] + 180) % 360 - 180)
        return (dh < 25) & (sat > 0.35) & (val > 0.25)
    if BG == 'navy':
        # Blend of the #2B2E45 background with the outline: dark and bluish, close to the background colour.
        d = ((r - 43) ** 2 + (g - 46) ** 2 + (b - 69) ** 2) ** 0.5
        return (d < 28) & (b - r > 12)
    # Blend of #FF00FF with the outline: red and blue high, green almost gone (wanted pinks keep much more green).
    return (r - g > 60) & (b - g > 60) & (g * 100 < 45 * np.minimum(r, b))

def defringe(path, dry):
    im = Image.open(path)
    mode, pal, trans = im.mode, im.getpalette(), im.info.get('transparency')
    a = np.asarray(im.convert('RGBA')).copy()
    opaque = a[..., 3] > 0
    cand = opaque & magentaish(a)
    removed = np.zeros_like(cand)
    if BG == 'custom':
        rgb = a[..., :3].astype(int)
        removed |= opaque & (np.sqrt(((rgb - BG_RGB) ** 2).sum(-1)) < 90)
        if SAFE:
            cand = removed.copy()
    if BG == 'magenta':
        # Background enclosed by the figure (between an arm and the body, between the legs): the cutter keeps such
        # areas on purpose, but here they are plain #FF00FF. Close to it means background, wherever it is.
        rgb = a[..., :3].astype(int)
        removed |= opaque & (np.sqrt(((rgb - [255, 0, 255]) ** 2).sum(-1)) < 90)
        # Its darker blends (e.g. 239,21,154): magenta-ish with almost no green. No wanted pink is that green-free.
        if SAFE:
            cand = removed.copy()  # no blends, no peeling beyond plain magenta
        else:
            removed |= cand & (rgb[..., 1] < 40)
    for _ in range(4):  # peel the fringe from the outside in
        t = ~opaque | removed
        near = np.zeros_like(t)
        near[1:] |= t[:-1]; near[:-1] |= t[1:]; near[:, 1:] |= t[:, :-1]; near[:, :-1] |= t[:, 1:]
        new = cand & near & ~removed
        if not new.any(): break
        removed |= new
    n = int(removed.sum())
    if n and not dry:
        a[removed] = 0
        out = Image.fromarray(a, 'RGBA')
        if mode == 'P':  # keep the indexed pixel-art format: same palette, index 0 transparent
            q = Image.new('P', out.size); q.putpalette(pal)
            idx = np.asarray(im).copy(); idx[removed] = trans if trans is not None else 0
            q = Image.frombytes('P', out.size, idx.astype(np.uint8).tobytes()); q.putpalette(pal)
            q.save(path, transparency=trans if trans is not None else 0)
        else:
            out.save(path)
    return n

dry = '--dry' in sys.argv
if '--navy' in sys.argv: BG = 'navy'
args = sys.argv[1:]
if '--bg' in args:
    i = args.index('--bg'); hx = args[i + 1].lstrip('#'); del args[i:i + 2]
    BG, BG_RGB = 'custom', np.array([int(hx[k:k + 2], 16) for k in (0, 2, 4)])
SAFE = '--safe' in sys.argv  # only plain background colour: for art whose own colours are close to it
files = []
for arg in [x for x in args if x not in ('--dry', '--navy', '--safe')]:
    p = Path(arg); files += sorted(p.rglob('*.png')) if p.is_dir() else [p]
total = 0
for f in files:
    n = defringe(f, dry); total += n
    if n: print(f'{f}: {n} px')
print(f'{"would remove" if dry else "removed"} {total} px in {len(files)} files')
