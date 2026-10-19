"""Turns a generated background into pixel art at the game's screen size (640 x 400 by default).

Why: the image model draws finer than its "4x pixel" promise, so the engine's 4x nearest-neighbour reduction loses
lines. Here: crop to the target ratio, average-downscale, then quantize to a fixed palette without dithering. The
result is 640 px wide or less, so `npm run assets` keeps it as is, and its pixels match the characters cut with
`tools/cut-sheet.py --scale 2`.

Usage (from the repo root):
    python3 games/jack/art-tools/reduce-bg.py <generated.png> <name> [--size 640x400] [--colors 64]
Writes games/jack/art/decor/<name>.png; an existing file is first renamed <name>_v1.png (_v2, … if taken).
"""
import argparse, os
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('name')
ap.add_argument('--size', default='640x400')
ap.add_argument('--colors', type=int, default=64)
a = ap.parse_args()

W, H = (int(v) for v in a.size.split('x'))
im = Image.open(a.src).convert('RGB')
# Centre-crop to the target ratio.
r = W / H
if im.width / im.height > r:
    w = round(im.height * r); x = (im.width - w) // 2; im = im.crop((x, 0, x + w, im.height))
else:
    h = round(im.width / r); y = (im.height - h) // 2; im = im.crop((0, y, im.width, y + h))
im = im.resize((W, H), Image.BOX)
im = im.quantize(colors=a.colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')

out_dir = os.path.join(os.path.dirname(__file__), '..', 'art', 'decor')
dst = os.path.join(out_dir, a.name + '.png')
for ext in ('.png', '.jpg', '.jpeg', '.webp'):
    old = os.path.join(out_dir, a.name + ext)
    if os.path.exists(old):
        n = 1
        while os.path.exists(os.path.join(out_dir, f'{a.name}_v{n}{ext}')): n += 1
        os.rename(old, os.path.join(out_dir, f'{a.name}_v{n}{ext}'))
im.save(dst, optimize=True)
print(f'ok: {os.path.normpath(dst)} ({W}x{H}, {a.colors} colours)')
