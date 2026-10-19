"""Does an image really have a transparent background? Run it on a test image before asking for transparent sheets.

Usage (from the repo root):  python3 games/jack/art-tools/check-alpha.py <image.png>

Prints the share of transparent, semi-transparent and opaque pixels, and says one of:
- TRANSPARENT: real alpha, the background is transparent. Generate the sheets that way.
- FAKE CHECKERBOARD: no alpha, but a grey-and-white checkerboard painted where the transparency should be.
- OPAQUE: no transparency at all.
"""
import sys
import numpy as np
from PIL import Image

path = sys.argv[1]
im = Image.open(path)
a = np.asarray(im.convert('RGBA')).astype(int)
alpha = a[..., 3]
n = alpha.size
clear = (alpha == 0).sum() / n
semi = ((alpha > 0) & (alpha < 255)).sum() / n
print(f'{path}: mode {im.mode}, {im.size[0]}x{im.size[1]}')
print(f'  transparent {clear:.0%}, semi-transparent {semi:.1%}, opaque {1 - clear - semi:.0%}')
if clear > 0.2:
    border = np.concatenate([alpha[0], alpha[-1], alpha[:, 0], alpha[:, -1]])
    print(f'  border transparent: {(border == 0).mean():.0%}')
    print('TRANSPARENT' if (border == 0).mean() > 0.9 else 'TRANSPARENT (but the border is not: check the image)')
    sys.exit(0)
# A painted checkerboard: the border is made of two light greys (or grey and white) only.
rgb = a[..., :3]
border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
light = (border.min(1) > 150) & (border.max(1) - border.min(1) < 12)
tones = np.unique((border[light] // 8), axis=0)
if light.mean() > 0.9 and 2 <= len(tones) <= 6:
    print('FAKE CHECKERBOARD')
else:
    print('OPAQUE')
