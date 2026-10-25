"""Prepares the images and sounds cited by the current game's content (reads .cache/refs.json, produced by tools/refs.ts).

Current game: env GAME, else the game .cache/game links to (npm run game, 4.1.6), else package.json -> "config": { "game" }, else "demo" (same rule as tools/game.ts).
Sources: games/<id>/sources.json, else the game's default folders:
  images  games/<id>/art/{id}.png            decors  games/<id>/art/decor/{name}.png
  video   games/<id>/art/decor/{name}.mp4    sounds  games/<id>/audio/music/{file}, games/<id>/audio/sfx/{file}, games/<id>/audio/voice/{file}
Outputs: public/assets/img/<id>.webp, public/assets/audio/{music,sfx}/<file>, public/assets/video/<name>.mp4,
and the manifest games/<id>/assets.gen.json (pixel sizes, for proportions).
Only reprocesses what changed. See wiki/en/create.images.md#pipeline (sources.json format, "overrides").
Pixel art ("artStyle": "pixel" in games/<id>/site.json): lossless WebP, every resize with nearest neighbour, and a
background wider than 640 px (drawn 4x up, wiki/en/create.images.md) is scaled down 4x to its art pixels; the engine scales
it back up with hard edges (skin.pixelArt). "cel" (default): unchanged.
"""
import glob, json, os, re, subprocess, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# A game project outside the repository (3.9, the `quest-n-click` command): its folder holds game/, public/ and .cache/.
PROJECT = os.environ.get('WEB_SCUMM_PROJECT', '').strip()
os.chdir(PROJECT or ROOT)

def game_id():
    g = os.environ.get('GAME', '').strip()
    if g: return g
    try:
        g = os.path.basename(os.readlink(os.path.join('.cache', 'game')).rstrip('/\\'))
        if g: return g
    except OSError: pass
    try:
        g = json.load(open('package.json')).get('config', {}).get('game')
        if g: return g
    except Exception: pass
    return 'demo'

GAME = game_id()
GAME_DIR = os.path.relpath(os.environ['GAME_DIR']) if os.environ.get('GAME_DIR', '').strip() else 'game' if PROJECT else f'games/{GAME}'

def art_style():
    try: return 'pixel' if json.load(open(f'{GAME_DIR}/site.json')).get('artStyle') == 'pixel' else 'cel'
    except Exception: return 'cel'

PIXEL = art_style() == 'pixel'
PIXEL_SCALE = 4
# Resampling filter and WebP options: smooth and lossy for painted (cel) art, exact for pixel art.
SMOOTH = Image.NEAREST if PIXEL else Image.LANCZOS
def webp(im, dst, quality):
    if PIXEL: im.save(dst, lossless=True, exact=True)
    else: im.save(dst, quality=quality)
refs = json.load(open('.cache/refs.json'))
OUT_IMG = 'public/assets/img'
OUT_AUDIO = 'public/assets/audio'
MANIFEST = f'{GAME_DIR}/assets.gen.json'

DEFAULT_SOURCES = {
    'images': f'{GAME_DIR}/art/{{id}}.png',
    'decors': f'{GAME_DIR}/art/decor/{{name}}.png',
    'video': f'{GAME_DIR}/art/decor/{{name}}.mp4',
    'music': f'{GAME_DIR}/audio/music/{{file}}',
    'sfx': f'{GAME_DIR}/audio/sfx/{{file}}',
    'voices': f'{GAME_DIR}/audio/voice/{{file}}',
}
SOURCES = dict(DEFAULT_SOURCES)
if os.path.exists(f'{GAME_DIR}/sources.json'):
    SOURCES.update(json.load(open(f'{GAME_DIR}/sources.json')))
OVERRIDES = SOURCES.get('overrides', {})

def patterns(v):
    """A pattern or a list of patterns; each pattern is a string or { "path": …, "rate": … }."""
    return [x if isinstance(x, dict) else {'path': x} for x in (v if isinstance(v, list) else [v])]

old = {}
if os.path.exists(MANIFEST):
    try: old = json.load(open(MANIFEST)).get('images', {})
    except Exception: old = {}

# Switching artStyle reprocesses every image (the manifest remembers the style it was built with).
old_style = None
if os.path.exists(MANIFEST):
    try: old_style = json.load(open(MANIFEST)).get('artStyle')
    except Exception: pass
RESTYLE = (old_style or 'cel') != ('pixel' if PIXEL else 'cel')

def fresh(src, dst):
    return not RESTYLE and os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src)

def keyed(im, tol=12):
    """Makes transparent the flat background connected to the border (same rule as tools/cut-sheet.py, without the holes)."""
    import numpy as np
    from collections import deque
    a = np.asarray(im).astype(int)
    h, w, _ = a.shape
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    near = np.sqrt(((a - bg) ** 2).sum(axis=2)) < tol
    seen = np.zeros((h, w), bool)
    q = deque([(y, x) for x in range(w) for y in (0, h - 1)] + [(y, x) for y in range(h) for x in (0, w - 1)])
    while q:
        y, x = q.popleft()
        if y < 0 or x < 0 or y >= h or x >= w or seen[y, x] or not near[y, x]: continue
        seen[y, x] = True
        q.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    rgba = np.dstack([a.astype('uint8'), np.where(seen, 0, 255).astype('uint8')])
    return Image.fromarray(rgba, 'RGBA')

def image_source(rid):
    """(source path, options): "overrides" first (a list of candidates is possible), else the game's patterns."""
    if rid in OVERRIDES:
        o = OVERRIDES[rid]
        for c in (o if isinstance(o, list) else [o]):
            c = c if isinstance(c, dict) else {'src': c}
            if os.path.exists(c['src']): return c['src'], c
        return None, {}
    if rid.startswith('decor/'):
        name = rid.split('/', 1)[1]
        cands = [p['path'].format(name=name) for p in patterns(SOURCES['decors'])]
        # A decor painted as .jpg is accepted where a .png is expected.
        cands += [c[:-4] + ext for c in cands if c.endswith('.png') for ext in ('.jpg', '.jpeg')]
    else:
        cands = [p['path'].format(id=rid) for p in patterns(SOURCES['images'])]
    return next((c for c in cands if os.path.exists(c)), None), {}

images, missing, done = {}, [], 0
for rid in refs['images']:
    dst = f'{OUT_IMG}/{rid}.webp'
    src, opt = image_source(rid)
    if not src:
        missing.append(rid); continue
    if fresh(src, dst) and rid in old:
        images[rid] = old[rid]; continue
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im = Image.open(src)
    if opt.get('keyed'):
        # Image on a flat background: keyed out like a sprite (background connected to the border, tolerance 12), then bounded to `fit` px.
        im = keyed(im.convert('RGB'))
        box = im.getbbox()
        if box: im = im.crop(box)
        fit = opt.get('fit', 420)
        k = min(1.0, fit / max(im.width, im.height))
        if k < 1: im = im.resize((round(im.width * k), round(im.height * k)), SMOOTH)
        webp(im, dst, opt.get('quality', 85))
    elif rid.startswith('decor/'):
        # Decor: 1280 x 800 by default; "crop" [x0, y0, x1, y1] then "size" [w, h], or "height" (proportional width).
        im = im.convert('RGB')
        if 'crop' in opt: im = im.crop(tuple(opt['crop']))
        if 'size' in opt:
            im = im.resize(tuple(opt['size']), SMOOTH)
        elif 'height' in opt:
            h = opt['height']
            im = im.resize((round(im.width * h / im.height), h), SMOOTH)
        elif PIXEL:
            # Drawn 4x up: back to its art pixels (a background already at pixel size, 640 px wide or less, stays as is).
            if im.width > 640: im = im.resize((round(im.width / PIXEL_SCALE), round(im.height / PIXEL_SCALE)), Image.NEAREST)
        elif im.width / im.height > 1.6 + 0.02:
            # A wide room (Layout.width > 640): 800 tall, as wide as the source says (e.g. 1920 for 960 logical units).
            im = im.resize((round(im.width * 800 / im.height), 800), Image.LANCZOS)
        else:
            im = im.resize((1280, 800), Image.LANCZOS)
        webp(im, dst, opt.get('quality', 82))
    else:
        im = im.convert('RGBA')
        box = im.getbbox()
        if box: im = im.crop(box)
        k = min(1.0, 420 / max(im.width, im.height))
        if k < 1: im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), SMOOTH)
        webp(im, dst, 88)
    images[rid] = [im.width, im.height]
    done += 1

def encode(src, dst, rate, stereo):
    if fresh(src, dst): return False
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    # .ogg output: keep an .ogg source as is (ffmpeg's built-in vorbis encoder is experimental), else re-encode with libvorbis.
    codec = (['-c:a', 'copy'] if src.endswith('.ogg') else ['-c:a', 'libvorbis']) if dst.endswith('.ogg') else []
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-vn', *codec, *([] if codec[-1:] == ['copy'] else ['-b:a', rate, '-ac', '2' if stereo else '1']), dst]
    subprocess.run(cmd, check=True)
    return True

audio = {'music': {}, 'sfx': {}, 'voices': {}}
amissing, aenc = [], 0
for kind, rate, stereo in (('music', '96k', True), ('sfx', '128k', False), ('voices', '64k', False)):
    pats = patterns(SOURCES[kind])
    for aid, f in refs['audio'].get(kind, {}).items():
        # Candidates in pattern order; a requested .mp3 can come from an .ogg of the same name.
        cands = [(p['path'].format(file=f), p.get('rate', rate)) for p in pats]
        if f.endswith('.mp3'):
            cands += [(c[:-4] + '.ogg', r) for c, r in cands]
        found = next(((c, r) for c, r in cands if os.path.exists(c)), None)
        dst = f'{OUT_AUDIO}/{kind}/{f}'
        if not found:
            # No source, but a file already rendered in public/assets: keep it as is.
            if os.path.exists(dst):
                audio[kind][aid] = f'{kind}/{f}'
                continue
            amissing.append(f'{kind}:{aid}={f}'); continue
        src, r = found
        if encode(src, dst, r, stereo): aenc += 1
        audio[kind][aid] = f'{kind}/{f}'

# Video: "video" pattern ({name}) -> public/assets/video/<name>.mp4 (H.264 720p, muted, fast start)
videos = {}
vpat = patterns(SOURCES['video'])[0]['path']
vre = re.compile('^' + re.escape(vpat).replace(re.escape('{name}'), '(.+)') + '$')
for src in sorted(glob.glob(vpat.replace('{name}', '*'))):
    m = vre.match(src)
    if not m: continue
    name = m.group(1) + '.mp4' if not m.group(1).endswith('.mp4') else m.group(1)
    dst = f'public/assets/video/{name}'
    if not fresh(src, dst):
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-an', '-vf', 'scale=-2:720', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30',
                        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dst], check=True)
    videos[name] = os.path.getsize(dst)

manifest = {'images': dict(sorted(images.items())), 'audio': audio, 'videos': videos}
if PIXEL: manifest['artStyle'] = 'pixel'
json.dump(manifest, open(MANIFEST, 'w'), indent=1)

size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk('public/assets') for f in fs)
print(f'images: {len(images)} ready ({done} processed), sounds: {sum(len(v) for v in audio.values())} ({aenc} encoded), public/assets = {size / 1e6:.1f} MB')
if missing: print('warning: missing images:', ', '.join(missing))
if amissing: print('warning: missing sounds:', ', '.join(amissing))
