#!/usr/bin/env python3
"""The interface fonts as Latin subsets (src/engine/dom/fonts/), each with the unicode-range style.css gives its face.

Galmuri11 (the default interface font since 4.3.0): a proportional pixel font with a narrow i and l and a period on the
baseline, close to the LucasArts dialogue fonts. The release holds 12 695 glyphs, mostly Hangul (5 MB): the subset keeps
what a game's Latin text and interface use. The source is the pinned release, downloaded from GitHub
(github.com/quiple/galmuri), or a local Galmuri11.ttf given with --galmuri.

DotGothic16 (the default until 4.2.5, now the fallback): 9 362 glyphs, mostly Japanese (2 MB). Its Latin subset answers
what Galmuri11 lacks in the same ranges, and games that set `skin.fonts.ui: 'DotGothic16'`; the full font stays in
public/fonts as a face whose unicode-range covers only the rest, loaded only for a character outside the subsets.

Both under the SIL Open Font License 1.1, no Reserved Font Name. The subsets keep Latin, Latin-1 and Latin Extended-A,
the punctuation, the euro sign and the arrows, boxes and symbols a game's text and interface use.
Run: python3 tools/subset-font.py [galmuri|dotgothic|all] [--galmuri Galmuri11.ttf] (default: galmuri; needs
fonttools: pip install fonttools).
The source is checked before it is cut (4.3.0): Galmuri11.ttf must have the sha256 of the pinned release's, downloaded
or given, so the subset the engine ships is made from the very font its credits name.
"""
import hashlib
import io
import sys
import urllib.request
import zipfile

RANGES = [(0x20, 0x7E), (0xA0, 0x17F), (0x2010, 0x2027), (0x2030, 0x203A), (0x20AC, 0x20AC), (0x2122, 0x2122),
          (0x2190, 0x21FF), (0x2500, 0x25FF), (0x2600, 0x26FF), (0x2700, 0x27BF)]
UNICODES = [c for a, b in RANGES for c in range(a, b + 1)]
GALMURI = 'https://github.com/quiple/galmuri/releases/download/v2.40.4/Galmuri-v2.40.4.zip'
# Galmuri11.ttf in that release, the file the subset is cut from (4.3.0).
GALMURI_SHA256 = 'e24256f42e43713d2ea086a1e1669d78b968f5b3cc547e5c157f0606ffa5def1'


def spans(codes):
    """Code points as CSS unicode-range spans."""
    out = []
    for c in sorted(codes):
        if out and c == out[-1][1] + 1:
            out[-1][1] = c
        else:
            out.append([c, c])
    return ', '.join(f'U+{a:04X}-{b:04X}' if a != b else f'U+{a:04X}' for a, b in out)


def cut(src, dest):
    from fontTools import subset  # imported here: the source's check below needs no fonttools

    opts = subset.Options()
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    font = subset.load_font(src, opts)
    s = subset.Subsetter(opts)
    s.populate(unicodes=UNICODES)
    s.subset(font)
    subset.save_font(font, dest, opts)
    from fontTools.ttLib import TTFont

    kept = [c for c in TTFont(dest).getBestCmap() if c >= 0x20]
    print(f'{dest}: {len(kept)} characters\n  unicode-range: {spans(kept)}')


def galmuri_source(args):
    """Galmuri11.ttf, given with --galmuri or read from the pinned release, refused unless its sha256 is the pinned one."""
    if '--galmuri' in args:
        with open(args[args.index('--galmuri') + 1], 'rb') as f:
            data = f.read()
    else:
        with urllib.request.urlopen(GALMURI) as r:
            data = zipfile.ZipFile(io.BytesIO(r.read())).read('Galmuri11.ttf')
    got = hashlib.sha256(data).hexdigest()
    if got != GALMURI_SHA256:
        sys.exit(f'Galmuri11.ttf: sha256 {got}, not the pinned release\'s {GALMURI_SHA256} ({GALMURI})')
    return io.BytesIO(data)


if __name__ == '__main__':
    args = sys.argv[1:]
    which = next((a for a in args if a in ('galmuri', 'dotgothic', 'all')), 'galmuri')
    if which in ('galmuri', 'all'):
        cut(galmuri_source(args), 'src/engine/dom/fonts/Galmuri11-latin.ttf')
    if which in ('dotgothic', 'all'):
        cut('public/fonts/DotGothic16.ttf', 'src/engine/dom/fonts/DotGothic16-latin.ttf')
