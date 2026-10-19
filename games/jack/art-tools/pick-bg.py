"""Picks the flat background colour farthest from a character's colours, for a sheet that cannot be transparent.

Usage (from the repo root):
  python3 games/jack/art-tools/pick-bg.py <sheet.png | sprite folder | image> [...]

Give it what you have of the character: its current sheet, its cut sprites (games/jack/art/<id>/), or the reference
it is drawn after. A sheet's own flat background is left out (the colour of its border). Prints the candidates from
the farthest to the closest: use the first one, and pass it to defringe.py with --bg.

The distance that matters is to the closest colour of the drawing: shadows are hue-shifted toward purple by the
prompts' COLOR RULES, so an orange character has pinkish shadows, and a magenta background eats them.
"""
import sys
import numpy as np
from pathlib import Path
from PIL import Image

CANDIDATES = {'#00FFFF': (0, 255, 255), '#FF00FF': (255, 0, 255), '#00FF00': (0, 255, 0), '#0000FF': (0, 0, 255)}

def colours(path):
    a = np.asarray(Image.open(path).convert('RGBA')).astype(int)
    rgb, alpha = a[..., :3], a[..., 3]
    keep = alpha > 0
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    if (np.sqrt(((border - bg) ** 2).sum(-1)) < 30).mean() > 0.9:  # a flat-background sheet: leave its background out
        keep &= np.sqrt(((rgb - bg) ** 2).sum(-1)) > 60
    return rgb[keep]

px = []
for arg in sys.argv[1:]:
    p = Path(arg)
    for f in (sorted(p.rglob('*.png')) if p.is_dir() else [p]):
        px.append(colours(f))
if not px:
    sys.exit(__doc__)
px = np.unique(np.concatenate(px) // 4 * 4, axis=0)
ranking = []
for name, c in CANDIDATES.items():
    d = np.sqrt(((px - np.array(c)) ** 2).sum(-1))
    ranking.append((d.min(), (d < 120).sum(), name))
ranking.sort(reverse=True)
print(f'{len(px)} colours in the drawing')
for dmin, near, name in ranking:
    print(f'  {name}: closest colour of the drawing at {dmin:.0f}, {near} colour(s) within 120')
print(f'BEST {ranking[0][2]}')
