# Images: prompts, cutting sheets, transparency, scale

The art of a game is generated as sheets (a grid of figures on a flat or transparent background), cut into one file per
cell, then prepared for the browser. This page takes you from a character description to an image the game shows, and
says what to do when a new image does not appear. It also holds the reference: how an image is named, the prompt
templates, and the rules that keep the art consistent.

<a name="what-you-get"></a>

## What you get

Every image the game names exists as a cut PNG in the game's `art/` folder and as a prepared WebP in
`public/assets/img/`, listed with its pixel size in `assets.gen.json`. `validate` finds no missing image, and the game
shows the new art after a reload.

<a name="context-and-versions"></a>

## Context and versions

Both contexts, with different command names:

- **Engine repository**: the game is `games/<id>/`; the commands are npm scripts (`npm run prompts`, `npm run assets`)
  and the Python tools under `tools/`.
- **Created project** (made with `quest-n-click create`): the game is `game/`; the commands go through the engine's
  command, `npx quest-n-click prompts` and `npm run assets`; the Python tools are in
  `node_modules/@quest-n-click/engine/tools/`.

What this page says is true from 4.2.5 (the `quest-n-click` command name; the choice of sheet background came in 4.2.4).
The Studio's **Assets** tab does the same cutting from the browser: see [Assets and cutting in the Studio](studio.assets.md).

<a name="prerequisites"></a>

## Prerequisites

- Python 3 with Pillow, NumPy and SciPy (`requirements.txt`): see [Image toolchain](install.image-toolchain.md).
  `npm run assets` needs Pillow; the cutter needs all three.
- An image model that takes an attached reference image. These prompts were written for ChatGPT's image generation.
- The game's content written: the rooms, characters and items name their images first (the prompts are made from them).

<a name="where-to-run"></a>

## Where to run the commands

On your machine, at the root of the engine repository or of the created project. Every block below says which.

<a name="steps"></a>

## Steps

<a name="generate-the-art"></a>

### Generate the art

<!-- step: describe -->
1. **Describe what the prompts cannot guess.** Three optional fields feed the prompts and change nothing in the game:
   `description` on a character (the CHARACTER line: age, hair, glasses, build, outfit, signature accessory,
   personality), `description` on a room (the LOCATION line: the room left to right, its light and mood), and
   `furniture` on a room (image ids of furniture drawn on its own sheet, e.g. `furniture_dining/table`, for pieces no
   prop uses yet). A character without a `description` keeps a `<describe: …>` placeholder in its prompt.

<!-- step: write-prompts -->
2. **Write the prompts from the content.** Do not fill the templates by hand.

   ```bash
   # in the engine repository
   npm run prompts                      # games/<id>/prompts.md: every sheet, cells already cut marked "(exists — keep)"
   npm run prompts -- --missing         # only the sheets with an image not cut yet, and only their missing cells
   npm run prompts -- --out notes.md    # another output file
   ```

   ```bash
   # in the created project
   npx quest-n-click prompts            # game/prompts.md
   npx quest-n-click prompts --missing
   ```

   The file has one section per sheet to generate, all sharing one STYLE block and one reference sheet
   (`art/_reference.png`, or the hero's validated sheet while it does not exist), and ends with a checklist (see
   [What `npm run prompts` reads](#prompts)). An assistant gets the same text through the MCP tool `asset_prompts`
   (`{ missing?: boolean }`), which also returns the missing image ids as JSON. In the Studio, the **Assets** tab
   shows each sheet's prompt beside its cells, with a **Copy prompt** button.

<!-- step: generate-sheets -->
3. **Generate one sheet per prompt**, in this order: the reference, the hero, the other characters, the objects, the
   backgrounds, the furniture. Attach the reference sheet to every prompt, for the style. Save each sheet as a PNG.

<a name="cut-and-key"></a>

### Cut, key and review

<!-- step: cut -->
4. **Cut each new sheet** into one file per cell, the background removed:

   ```bash
   # in the engine repository
   python3 tools/cut-sheet.py <sheet.png> <sheet-id>                 # → games/<id>/art/<sheet-id>/r<row>c<col>.png
   python3 tools/cut-sheet.py <sheet.png> <sheet-id> --cells r1c2,r3c1   # only these cells
   ```

   ```bash
   # in the created project
   python3 node_modules/@quest-n-click/engine/tools/cut-sheet.py <sheet.png> <sheet-id> --out game/art
   ```

   Cut only the new sheet. The cutter writes over a cell that already exists without asking: give `--cells` with the
   missing cells only (`prompts.md`'s checklist writes the command that way). The Studio's Assets tab never recuts an
   existing cell unless you tick it, and keeps the old file as a backup. The cutter's options are in
   [the cutter](#cutter).

<!-- step: review -->
5. **Review the cells.** In the engine repository, `npm run page:review` builds a page with every cell of every sheet
   and a keep / redo / unused choice per cell (see [Review pages](create.review-pages.md#the-three-pages)). Regenerate
   only the cells marked redo.

<!-- step: prepare -->
6. **Prepare the images** for the browser:

   ```bash
   # in the engine repository, or in the created project
   npm run assets
   ```

   It prepares only the images the content references, writes `assets.gen.json`, and reprocesses only what changed.

> [!LIMIT id=talk-tools-repo]
> The mouth-kit tools (`tools/talk-kit.py`, `tools/talk-apply.py`, `tools/talk-normalize.py`) write to
> `games/<id>/private/` and `games/<id>/art/`: they are written for the engine repository's layout. In a created
> project, cut and place the talking frames by hand, or use the Studio's Assets tab.

<a name="expected-result"></a>

## Expected result, and how to check it

- `npm run assets` prints `images: <n> ready (<m> processed), …` and no `warning: missing images:` line.
- `npm run validate` (created project: `npx quest-n-click validate`, or `npm run verify`) reports no `image not found: "<id>"`.
- The game (`npm run dev`) shows the image where the content names it.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `warning: missing images: grandma/r3c4` from `npm run assets` | No file at the source path (`art/grandma/r3c4.png`, or what `sources.json` says) | Cut the cell, or fix the id in the content |
| `image not found: "grandma/r3c4"` from `validate` | The id is not in `assets.gen.json`: `npm run assets` was not run since the content named it, or the source is missing | Run `npm run assets`, then `validate` again |
| A dark cape or dark eyes became holes | The sheet background is too close to the figure's colours | Choose another background: [Choosing the sheet background](#sheet-background) |
| Holes in a mouth or eyes at a figure's edge | The generator painted a "see-through" part with the background colour | Same fix; the prompts already ask for opaque figures |
| `ok: … (fixed-grid fallback, no figure detected: […])` | The cutter found no figure in those cells and cut the fixed rectangle | Look at those cells: an empty cell, or a figure too close to the background colour |
| A figure cut in two, or two figures in one cell | The figure touches or crosses a cell border | Regenerate with more room; or `--auto` for a sheet that is not a regular grid |

<a name="troubleshooting"></a>

## My new image does not show in the game

<a name="symptom"></a>

### Symptom

You cut or replaced an image, and the game still shows the old one, a blank, or nothing.

<a name="causes"></a>

### Possible causes, most frequent first

1. **`npm run assets` was not run** after the cut. The game reads `public/assets/img/<id>.webp`, never the PNG in
   `art/`.
2. **The prepared file is older than the source, and `assets` skipped it.** `npm run assets` reprocesses an image only
   when the source's modification time is newer than the WebP's. A source copied with its old date (a `cp -p`, an
   archive, a git checkout of an older file) is skipped.
3. **The id does not match.** The content names `grandma/r3c4`; the file is `art/grandma/r4c3.png`, or the sheet folder
   has another name.
4. **The browser serves its cached copy.** Image URLs carry `?v=<hash of public/assets>`, computed when Vite starts. A
   running `npm run dev` keeps the hash it started with; a deployed game's service worker keeps images in its cache
   (cache-first, 90 days) until the version in the URL changes, which a new build does.
5. **A `sources.json` override** points the id at another file (`overrides`, or a pattern list tried in order).

<a name="diagnosis"></a>

### Diagnosis

```bash
# in the engine repository
npm run assets                       # read the "missing images" line
ls -l games/<id>/art/grandma/r3c4.png public/assets/img/grandma/r3c4.webp   # which one is newer?
grep -n '"grandma/r3c4"' games/<id>/assets.gen.json
npm run validate
```

```bash
# in the created project
npm run assets
ls -l game/art/grandma/r3c4.png public/assets/img/grandma/r3c4.webp
grep -n '"grandma/r3c4"' game/assets.gen.json
npx quest-n-click validate
```

<a name="fix"></a>

### Fix

<!-- step: fix-prepare -->
1. Run `npm run assets` (cause 1).

<!-- step: fix-stale -->
2. For cause 2, delete the prepared file (`public/assets/img/<id>.webp`), or touch the source, then run
   `npm run assets` again. Switching `artStyle` in `site.json` reprocesses every image by itself.

<!-- step: fix-id -->
3. For cause 3, rename the file or fix the id in the content, then `npm run assets` and `npm run validate` (created
   project: `npx quest-n-click validate`).

<!-- step: fix-cache -->
4. For cause 4, restart `npm run dev` and reload the page. For a deployed game, build and deploy again: the new build
   changes the version in every asset URL; a player gets it when they accept the update banner. See
   [Sub-path, cache and service worker](create.deploy-issues.md).

<a name="size-and-colours"></a>

### Size and colours that don't match the reference sheet

This is normal: an image generator never reproduces a reference image's scale or colours exactly. Do not fight it;
correct it afterwards:

- **Talking frames for an already validated character**: the mouth kit ([talking](#character-talking)). The body stays
  the validated sprite, pixel for pixel.
- **A talking sheet generated as one block**: `python3 tools/talk-normalize.py <talk_sheet.png> <row>
  <validated_sprite.png> <output_folder>` (engine repository). Same height, same colours, same bounding box for all 6
  images, and the "mouth closed" cell becomes the rest pose.
- **General rule**: never mix, within one animation, frames from two different sheets. One animation, one sheet.

<a name="files-changed"></a>

## Files or data changed

| File | Written by |
|---|---|
| `games/<id>/prompts.md` (created project: `game/prompts.md`) | `npm run prompts` |
| `games/<id>/art/<sheet-id>/r<row>c<col>.png` | `tools/cut-sheet.py` (grid mode) |
| `games/<id>/art/<sheet-id>/sprite_<row>_<col>.png` and `index.json` | `tools/cut-sheet.py --auto` |
| `public/assets/img/…webp`, `public/assets/video/…` | `npm run assets` |
| `games/<id>/assets.gen.json` | `npm run assets` (pixel sizes, the art style it was built with) |
| `.cache/refs.json` | `npm run assets` (the ids the content cites) |

`public/assets` is generated: a created project's `.gitignore` leaves it out.

<a name="recovery"></a>

## Recovery or going back

The cutter keeps no backup: a recut cell is overwritten. Back up the sheet's folder before recutting it, or work under
git and restore the cell with `git checkout -- <file>`. Layouts and mouth kits depend on the cells: never recut a
validated sprite. The Studio's Assets tab keeps the old file as a backup when you tick a cell to recut. Prepared files
can always be rebuilt: delete `public/assets/img/` and run `npm run assets`.

<a name="images"></a>

## How an image is named, cached and budgeted

An image is designated by `folder/name`, the path of the cut file in the game's `art/` folder without the extension:
`grandma/r3c3` (grandma's sheet, row 3, column 3), `items/r1c2`, `house/armchair`. Backgrounds are named
`decor/<room>`. `npm run assets` prepares only the images the content references, and `npm run validate` flags any
missing image.

After the first visit the game caches every image and sound for offline play (`offline: 'full'`, the default;
`'nearby'` keeps only the current room and its neighbours). A 40 MB game is 40 MB on the phone.

`assetBudgets` in `game.ts` says how much the game may ask a phone to download:

| Budget | What it bounds | Since |
|---|---|---|
| `initialKB` | before the first room is playable | |
| `roomKB`, `chapterKB` | per room, per chapter | |
| `backgroundScoreKB` | a score's stems | 3.6 |
| `decodedAudioMB` | the largest score decoded | 3.6 |
| `offlineTotalKB` | the full warm-up | 3.6 |
| `transitionPeakMB` | two scores, a bridge and a stinger decoded at once | 3.6.1 |
| `initialJsKB` | the JavaScript of a first visit, checked on the build by `npm run verify:dist` | 3.9 |

`npm run weight` checks them, and a release requires them: see [Build and release](create.build-release.md).

<a name="scale"></a>

### Scale and transparency

- The file's pixel size does not set the size on screen. A prop is drawn at the height `h` its layout gives (logical
  units of the 640 × 400 room), a character at its `height`, scaled by depth; the width follows the image's
  proportions, read from `assets.gen.json`. See [Geometry](create.geometry.md).
- `npm run assets` crops each sprite to its opaque pixels, then bounds it to 420 px on its longest side. A cell's empty
  margin therefore does not count.
- A background becomes 1280 × 800. A wider source (a wide room) keeps its ratio at 800 px tall; a `.jpg` is accepted
  where a `.png` is expected.
- Transparency comes from the cutter (keyed background or real alpha). `npm run assets` keeps the alpha it finds; an
  override with `keyed: true` makes a flat background touching the border transparent.

<a name="pipeline"></a>

## The preparation pipeline

`npm run assets` runs `tools/refs.ts`, which lists the images and sounds the content cites (rooms, characters, items,
the map, minigame parameters, `skin`, the title and credits screens, `ending.scratch`, and `index.ts`'s
`extraImages`), then `tools/assets.py`, which prepares them. The sounds' part is in
[Sound effects](create.sound-effects.md).

A game's default sources (engine repository; in a created project, `game/` replaces `games/<id>/`):

| What | Source | Output |
|---|---|---|
| image `sheet/cell` | `games/<id>/art/sheet/cell.png` | `public/assets/img/sheet/cell.webp` (cropped, 420 px at most) |
| decor `decor/<name>` | `games/<id>/art/decor/<name>.png` | `public/assets/img/decor/<name>.webp` (1280 × 800) |
| video | `games/<id>/art/decor/<name>.mp4` | `public/assets/video/<name>.mp4` (720p, muted) |
| music, sfx | `games/<id>/audio/music/<file>`, `games/<id>/audio/sfx/<file>` | `public/assets/audio/{music,sfx}/<file>` |

`games/<id>/sources.json` replaces these patterns (`{id}`, `{name}`, `{file}`). A pattern can be a list of candidates
tried in order; an audio pattern can set its bitrate (`{ "path": …, "rate": "64k" }`). `overrides` handles one image
apart:

```json
{
  "images": "private/extract/{id}.png",
  "decors": "private/asset/decor_{name}.png",
  "video": "private/asset/decor_{name}.mp4",
  "music": [{ "path": "private/audio/rendered/{file}", "rate": "64k" }, "private/audio/{file}"],
  "sfx": ["private/audio/sfx/{file}", "private/audio/sfx/densif/{file}", "private/audio/{file}"],
  "overrides": {
    "decor/france_map": [
      { "src": "private/asset/decor_france_map.png", "keyed": true, "fit": 1100, "quality": 85 },
      { "src": "private/asset/decor_map.png", "crop": [75, 590, 400, 880], "size": [1100, 982] }
    ],
    "decor/souk_chase": { "src": "private/asset/decor_souk_chase.png", "height": 800 }
  }
}
```

An override's options: `keyed` (a flat background connected to the border made transparent, then bounded to `fit` px
at most, 420 by default), `crop` [x0, y0, x1, y1], `size` [w, h], `height` (proportional width), `quality`. An
override can be a list: the first source that exists is used. This example is the shape of a real game's
`sources.json`, whose sources stay in `private/`.

With `"artStyle": "pixel"`, `npm run assets` writes lossless WebP, resizes only with nearest neighbour, and scales a
background wider than 640 px down 4× to its art pixels. Switching `artStyle` reprocesses every image.

<a name="cutter"></a>

### The cutter: `tools/cut-sheet.py`

| Option | Default | What it does |
|---|---|---|
| `<sheet.png> <sheet-id>` | | The sheet, and the folder its cells go to (how images are referenced: `<sheet-id>/r<row>c<col>`) |
| `--grid COLSxROWS` | `6x4` | The grid (`3x3`, `2x2` for larger objects) |
| `--out <dir>` | `games/<GAME>/art` | The art root (a created project: `game/art`) |
| `--cells r1c2,r3c1` | all | Only (re)cut these cells |
| `--auto` | | No grid: detect each sprite wherever it is; writes `sprite_<row>_<col>.png` and `index.json` |
| `--tol`, `--min` | 40, 2500 | Auto mode: background colour tolerance, minimum sprite area in px |
| `--pixel` / `--cel` | `artStyle` of `site.json` | Force pixel-art processing on or off |
| `--scale`, `--colors` | 4, 32 | Pixel art: the sheet's scale-up, the colours per cell |

Detection is per figure, not per fixed box: a figure that overflows its cell a little is still captured whole; a cell
where nothing is found falls back to its fixed rectangle, so every requested cell is written. The game is `GAME`, else
the game `.cache/game` links to, else `package.json`'s `config.game`; its `site.json` is looked up next to the `--out`
folder first.

<a name="prompts"></a>

## The prompts

These prompts were used with an image model (ChatGPT image generation) to produce the validated assets of a real game
built on this engine. Each prompt produces a sheet on a flat background colour (or a transparent one) that the cutter
removes, so plan the final asset as a grid from the start. `npm run prompts` fills them for your game; the templates
below are what it fills, the parts between angle brackets (`<...>`) being the game's.

What `npm run prompts` reads, from the game module and the art folder:

- **characters** (`cast.ts`): the base 6 × 4 sheet with the engine's pose rows (`human()` or `cat()`), the special poses
  the content uses (extra `sprites` keys, `{ pose: [who, p] }` and `{ anim: [who, p] }` in the rooms, actor poses,
  `variants`) on their cells, a new `<sheet>_poses` sheet for poses no sprite provides yet (with the lines to add to
  `cast.ts`), the seat rule for seated poses, and the mouth kit for the poses listed in `mouths`;
- **objects**: every image a prop, an item, a minigame or the interface uses, grouped by sheet folder, cell by cell;
  the states of one prop are "the SAME object, state …" so they keep size and angle;
- **backgrounds** (`decor/<name>` of each room): LOCATION, the hotspots to show, and EMPTY SPOTS for the props,
  furniture and characters (left / center / right from `layout/<room>.json`);
- **furniture**: props whose image lives in a `furniture_*` folder, and the room's `furniture` list;
- a **checklist**: reference → hero → other characters → objects → backgrounds → furniture, each with its
  `python3 tools/cut-sheet.py` command (`--cells` for the missing ones only), then `npm run assets`.

<a name="common-rules"></a>

### Common rules

- **Style**: attach a reference sheet. `hero_sheet.png` (or any already validated character sheet) for characters, an
  item sheet for objects, the room's background for its furniture.
- **Background**: flat `#2B2E45` by default, no gradient, no floor, no cast shadow, no grid, no text or logo. The cutter
  keys this blue out. `sheetBackground` in `site.json` changes it ([below](#sheet-background)).
- **Light**: from the upper left.
- **Brand names**: never write a brand name in a prompt, such as "Darth Vader": the content filter blocks it. Describe
  the object instead: "a small pink knight plush with a round helmet".
- **Grid**: 1536 × 1024. 6 × 4 cells of 256 px for characters and objects, 3 × 3 or 2 × 2 for larger objects.
- **Object states**: same size, same angle, same position from one cell to the next; only the described change
  differs.
- **Cutting**: cut only the new sheet, into its own folder (`--out` for another art root). Never recut sprites that are
  already validated.
- **Colours**: every prompt carries the same COLOR RULES block, whatever the art style (`npm run prompts` adds it to the
  style block and to every sheet; on a background, "sheet" reads "image"):

```
COLOR RULES:
- Use a limited palette. For each material (skin, hair, each garment, each object) use at most 4 flat tones: highlight, base, shadow, deep shadow.
- Hue-shift every ramp: highlights are brighter, slightly less saturated and shifted toward the warm light (yellow); shadows are darker, more saturated and shifted toward cool purple. Never make highlights by adding white, never make shadows by adding black.
- Flat, clearly separated areas: no gradients, no airbrush, no blur, no dithering.
- One single outline colour for the whole sheet (dark warm brown-black), consistent line weight.
- The same material keeps exactly the same tones on every cell of the sheet and on every animation frame.
```

<a name="art-style"></a>

### Art style: `cel` or `pixel` (`artStyle` in `site.json`)

`"artStyle": "cel"` (default) is the painted cartoon look: clean dark outlines, clean cel shading with flat tones.
`"artStyle": "pixel"` switches the whole pipeline to retro pixel art:

- **Prompts**: the STYLE sentence becomes "retro pixel art in the spirit of 1990s LucasArts adventures (Day of the
  Tentacle, Monkey Island 2), 1 pixel = 1 pixel, crisp, no anti-aliasing…". The canvas stays 1536 × 1024 (256 px
  cells), drawn as pixel art scaled up 4×: each figure lives on a 64 × 64 grid per cell, a background on 384 × 240.
  Every prompt gets the strict block after the COLOR RULES:

```
PIXEL RULES — strict:
- The whole canvas is drawn on a 384 x 256 pixel grid (64 x 64 per 256 px cell), scaled up 4x with hard edges: every art pixel is an exact 4 x 4 square of one single colour, aligned to the grid. No detail smaller than one art pixel.
- Exact flat RGB values: every pixel uses one of its material's tones exactly, never an in-between value.
- No anti-aliasing: no semi-transparent, blended or soft pixels on any edge, not even against the background.
- The same material keeps exactly the same RGB values on every frame and every cell.
```

- **The tools enforce these rules after generation**, since no image model follows them exactly: the cutter (it reads
  `artStyle`; `--pixel` / `--cel` force it, `--scale 4`, `--colors 32`) scales each figure down 4× with nearest
  neighbour, keeps only fully opaque or fully transparent pixels, quantizes each cell to at most 32 colours (median
  cut, no dithering) and merges near-identical colours (RGB distance < 8) into one exact value, shared by every cell of
  the sheet; cells are written as indexed PNGs (mode P, index 0 transparent). The Studio's sheet and cell uploads do
  the same. `npm run assets` then writes lossless WebP, resizes only with nearest neighbour, and scales a background
  wider than 640 px down 4× to its art pixels.
- **Engine**: set `skin: { pixelArt: true }` in `game.ts` so the scaled-up images keep hard edges
  (`image-rendering: pixelated`). See [Skin and fonts](create.skin-fonts.md).
- **Palette swaps** (`palette` on a character, see [Characters](create.characters.md)) work best with `pixel`: the
  colours are exact.

<a name="sheet-background"></a>

### Choosing the sheet background (`sheetBackground` in `site.json`)

A sprite sheet is drawn on a background the cutter removes. The default is a flat `#2B2E45`, and any fixed colour fails
on some character: a black cape or dark eyes close to `#2B2E45` are keyed out with it; a magenta background eats the
shadows the COLOR RULES shift toward purple (on an orange head they are pinkish); and the generator often paints
"see-through" parts, a carved mouth or eyes seen in profile, with the background colour, so they become holes when
they touch the figure's edge. Try, in this order:

1. **`"sheetBackground": "transparent"`**, when your image tool really writes alpha. Test it once: ask it for a small
   figure on a transparent background and run `python3 tools/check-alpha.py <image.png>`. `TRANSPARENT` means real
   alpha; `FAKE CHECKERBOARD` means a grey-and-white checkerboard painted where the transparency should be (some tools
   do that), and `OPAQUE` no transparency at all. With real alpha there is nothing to key: the prompts ask for a
   transparent PNG and forbid the painted checkerboard, and the cutter keeps exactly the opaque pixels, colour-blind (a
   transparent copy of a flat-background sheet cuts to the same cells).
2. **Otherwise, the flat colour farthest from the drawing**: `python3 tools/pick-bg.py <sheet | sprite folder | image>
   [...]` on the character's reference or previous sheet ranks cyan, magenta, green and blue by their distance to the
   drawing's closest colour (a sheet's own background left out) and prints `BEST #RRGGBB`. Set it as
   `"sheetBackground": "#00FFFF"`; the cutter keys whatever flat colour the border has.

In both cases the prompts say that every pixel of a figure is opaque, including the inside of carved or open shapes
(mouths, eyes). Without `sheetBackground` (or with a value that is neither `transparent` nor `#RRGGBB`, which warns),
everything stays on `#2B2E45`. The templates below show that default; `npm run prompts` writes the game's own. Room
backgrounds are not concerned, and the mouth kits keep their `#2B2E45` backdrop: the mouths are pasted back through the
validated sprite's own alpha, nothing is keyed.

<a name="background"></a>

### Background (1536 × 960, 16:10)

```
Create a background image for a point-and-click adventure game.
STYLE: match exactly the art style of the attached reference sheet (same clean dark outlines, clean cel shading with flat tones, warm saturated palette). A hand-painted background for a 1990s LucasArts point-and-click adventure, in the spirit of Day of the Tentacle and Monkey Island 2 remastered: cozy, funny, full of small details, but readable.
FORMAT: 1536 x 960 pixels (16:10).
COMPOSITION — follow it strictly:
- One single eye-level perspective: the back wall or horizon seen from the front, one vanishing point in the center. No fisheye, no isometric view, no tilted camera.
- Scale: an adult standing on the floor near the front is about one third of the image height.
- A clear, empty, walkable floor band across the lower part of the image, from about 58% to 95% of the height. Keep the center of the floor clear: large furniture stays against the walls.
- One single main light source, warm; shadows lean toward deep purple, never pure black.
DO NOT draw any people or animals. DO NOT write any text, letters, numbers or logos: signs and screens stay blank.
LOCATION: <describe the room, left to right, with its light and mood>
EMPTY SPOTS: <spots left empty, where the game will place stateful objects>
```

Furniture that blocks the path, such as a sofa, a table or a market stall, is generated separately: the room empty on
one side, the furniture on the other. The engine then depth-sorts it with the characters. Prompt for the furniture
sheet:

```
Create an item sheet for a point-and-click adventure game.
STYLE: match exactly the art style, lighting and colors of the attached decor_<room>.png.
LAYOUT: canvas 1536 x 1024, an invisible grid of <columns> x <rows>, one object per cell, centered, nothing touching the cell borders. One single flat uniform background color #2B2E45, no gradient, no floor, no cast shadow on the background, no text.
Every object is seen from the SAME angle and at the SAME scale as in the attached decor.
<row by row: each piece of furniture, and its states if it has any>
```

<a name="objects"></a>

### Objects (6 × 4 sheet)

```
Create an item sheet for a point-and-click adventure game: <theme of the sheet>.
STYLE: match exactly the art style of the attached item sheets: same clean dark outlines, same clean cel shading with flat tones, same warm palette and level of detail, Day of the Tentacle / Monkey Island 2 remastered spirit, funny and friendly. Objects are shown in a 3/4 view from slightly above.
LAYOUT — follow it strictly:
- Canvas 1536 x 1024 pixels, landscape.
- An invisible grid of 6 columns x 4 rows, every cell exactly 256 x 256 pixels.
- One object per cell, centered, filling about 70% of the cell. Nothing may touch or cross a cell border.
- When several cells show STATES of the same object, draw it with the exact same size, angle and position in each of those cells: only the described change differs.
BACKGROUND: one single flat uniform color #2B2E45 over the whole canvas. No gradient, no texture, no floor, no cast shadow on the background, no grid lines, no borders.
DO NOT add any text, letters, numbers, labels, logos or watermarks. No hands, no people. Consistent lighting from the upper left.
CELL BY CELL (left to right):
ROW 1: - cell 1: <object> - cell 2: <the SAME object, state 2> …
ROW 2: …
```

Minigame pieces seen from above, such as tiles, add: "seen from DIRECTLY ABOVE, flat, no perspective", a fixed tile
size, and edges that line up at the middle of each border.

<a name="character-base"></a>

### Character: base sheet (SCUMM poses)

```
Create a pixel-art character sprite sheet for a point-and-click adventure game.
STYLE: match exactly the art style of the first attached image (reference sheet): warm expressive cartoon caricature in the spirit of Day of the Tentacle and Monkey Island 2 remastered, clean dark outlines, clean cel shading with flat tones, head about one third of the body height, friendly and funny.
CHARACTER: <description: age, hair, glasses, build, outfit, signature accessory, personality>
SHEET LAYOUT — follow it strictly:
- Canvas 1536 x 1024 pixels, landscape.
- An invisible grid of 6 columns x 4 rows, every cell exactly 256 x 256 pixels. One figure per cell, centered horizontally.
- Full-body figures (rows 2 to 4) all at the SAME scale, about 220 pixels tall, feet resting on the same baseline 16 pixels above the bottom of each cell.
- Leave empty space around each figure: nothing may touch or cross a cell border.
ROW 1 — head-and-shoulders portraits, facing the viewer: neutral | smiling | talking (mouth open) | laughing | surprised | thinking (hand on chin)
ROW 2 — walk cycle, full body, profile facing RIGHT, 6 consecutive frames of one smooth walk loop: contact | down | passing | up | contact (other leg) | passing (other leg)
ROW 3 — full-body poses: standing facing the viewer | standing seen from the back | standing facing right | talking facing right with one hand gesturing | pointing to the right | reaching forward to pick up or use an object
ROW 4 — full-body walk: walking toward the viewer (3 frames) | walking away from the viewer, seen from the back (3 frames)
BACKGROUND: one single flat uniform color #2B2E45 over the whole canvas. No gradient, no texture, no vignette, no floor, no cast shadow on the background, no grid lines, no borders.
DO NOT add any text, names, labels, numbers, logos or watermarks. Same outfit, same colors and same proportions in all 24 cells. Consistent lighting from the upper left.
```

Rather than relying on a reference photo for likeness, describe the character fully in words in the CHARACTER line: the
more specific, the more consistent the character stays across sheets generated in different conversations.

Pose mapping with the engine: `portrait` = r1c2; `walk` = r2c1 to r2c6; `front` = r3c1; `back` = r3c2; `idle` = r3c3;
`point` = r3c5; `use` = r3c6; `walk_front` = r4c1 to r4c3; `walk_back` = r4c4 to r4c6.

Variant "holding an object", for a character who always carries a signature prop (a cane, a plush toy, a tool): same
grid, same poses, adding "now always holding <object> in her LEFT hand, clearly visible and clearly separated from her
coat". The free hand still does the gestures.

<a name="character-special"></a>

### Character: running, jumping, special poses

```
Create a pixel-art character sprite sheet for a point-and-click adventure game: SPECIAL POSES of the character of the attached <sheet>.png (same face, same outfit, same scale).
LAYOUT: canvas 1536 x 1024, 6 columns x 4 rows of 256 x 256 cells, one figure per cell, feet on the baseline 16 pixels above the bottom of each cell (except jumps, which rise above it), nothing touching the borders.
ROW 1 — running away, profile facing RIGHT: running frame 1 | frame 2 | frame 3 | frame 4 | jumping high, knees tucked | ducking low, sliding forward
ROW 2 — sneaking to the right on tiptoes, frame 1 | frame 2 | frame 3 | frozen pose 1 | frozen pose 2 | frozen pose 3
ROW 3 — <story-specific poses: sitting, gags, finale reactions (pinching nose, celebrating), stumbling, showing an object…>
ROW 4 — <other poses, or EMPTY (flat background only)>
BACKGROUND: one single flat uniform color #2B2E45, no gradient, no floor, no shadow, no grid lines. No text. Lighting from the upper left.
```

For seated characters, draw the seat together with the character and say so: "exactly as on the attached
seated_poses.png row N". For two characters in one cell, say "one single figure group".

<a name="character-talking"></a>

### Character: talking (calm animation)

The body must never change while a character talks: only the mouth moves. Otherwise the character seems to jump from
pose to pose.

**Recommended method: the mouth kit** (engine repository). The generator is never asked to redraw the character. It
only supplies mouths, which a script pastes back onto the validated sprite.

1. **Prepare the kits:** `python3 tools/talk-kit.py`. It writes the validated sprite's head, enlarged and copied 6 times
   into a 3 × 2 grid (1536 × 1024), to `games/<id>/private/talk_kits/<character>_<pose>.png`, and a `.json` file that
   keeps the head's exact position. The characters and poses are set at the top of the script (`POSES`): `profile`
   (`r3c3`), `front` (`r3c1`), and `seated` (`seated_poses`) for characters who talk while seated.
2. **Send each kit to the generator**, one kit per message, with the prompt below.
3. **Save the reply** next to the kit, as `<character>_<pose>_out.png` (or `_chatgpt.png`).
4. **Paste the mouths back:** `python3 tools/talk-apply.py <character>_<pose>`. The script aligns the reply's 6 cells
   with each other, then cell 1 with the original head; it detects what changed (mouth, eyes), corrects the colour on
   the ring around it, and pastes only that area onto the validated sprite. Output:
   `games/<id>/art/talk_<character>/<pose>/t1.png` … `t6.png`; `t1` is exactly the validated sprite.
5. **Check**: only the mouth and eyes should move. The script prints the area it repainted for each image: a few
   thousand pixels is normal, tens of thousands means a cell is misaligned.

The generator may redraw the whole head in a slightly different style: that is fine, only the mouth is reused. What
matters is that the 6 cells of its reply are consistent with each other.

```
This image is a grid of 6 identical cartoon portraits (3 columns x 2 rows).
Keep EVERYTHING exactly identical in all 6 cells: same drawing, same size, same position, same colors, same style, same background, same image size (1536 x 1024).
Change ONLY the mouth, and the eyes in cell 5:
- cell 1 (top left): unchanged, mouth closed
- cell 2 (top middle): mouth slightly open, talking
- cell 3 (top right): mouth open, talking
- cell 4 (bottom left): mouth wide open, exclaiming
- cell 5 (bottom middle): eyes gently closed (blinking), mouth closed
- cell 6 (bottom right): mouth closed, small warm smile
Do not redraw, move, resize or recolor anything else. No text.
```

Tips: one kit per message, and a new conversation every few characters so the generator does not mix up faces. If it
redraws too much, use its selection tool to highlight only the six mouths, then give it the same text again.

Engine side: `t1` at rest; while talking, `t2`, `t3` and `t4` at random, never the same one twice in a row, every 160
to 220 ms; `t5` now and then to blink; `t6` at the end of a cheerful line; back to `t1` at the end of the line.

**Other method, for a brand-new character**: generate the base sheet and its talking sheet in the same conversation,
with the prompt below. Useful when a character's colours are decided at the same time as its talking frames. The two
sheets come out consistent, then `tools/talk-normalize.py` brings them to the same size and colours.

```
Create a pixel-art character sprite sheet for a point-and-click adventure game: TALKING FRAMES of a character who already exists.
STYLE: match exactly the art style of the attached <sheet>.png: warm expressive cartoon caricature in the spirit of Day of the Tentacle and Monkey Island 2 remastered, clean dark outlines, clean cel shading with flat tones.
CHARACTER: <name and short description> EXACTLY as on the attached sheet: same face, hair, glasses, beard, clothes, colors, proportions and scale.
IMPORTANT: in each row, the body, arms, hands, feet, hair and position are EXACTLY IDENTICAL in all 6 cells, like frames of an animation where ONLY the mouth and eyes change. Nothing else moves.
LAYOUT: canvas 1536 x 1024, 6 columns x 4 rows of 256 x 256 cells, one figure per cell, centered, same scale as the attached sheet, feet (or seat) on the same baseline 16 pixels above the bottom of each cell, nothing touching the borders.
ROW 1 — standing facing RIGHT, arms relaxed: mouth closed | mouth slightly open | mouth open | mouth wide open (exclaiming) | mouth closed, eyes blinking | mouth closed, small smile
ROW 2 — standing facing the viewer, arms relaxed: the same 6 mouth and eye states
ROW 3 — <pose where the character talks the most: seated, turned to the left…>: the same 6 mouth and eye states
ROW 4 — <special pose with the same 6 states, or EMPTY (flat background only)>
BACKGROUND: one single flat uniform color #2B2E45, no gradient, no floor, no shadow, no grid lines. No text. Lighting from the upper left.
```

<a name="object-animation"></a>

### Object animation (looping frames)

```
Create an animation sprite sheet for a point-and-click adventure game: <object> <motion>, <n> consecutive frames of one smooth loop.
STYLE: match exactly the art style of the attached reference. Same size and position in every frame, only the motion changes.
LAYOUT: canvas 1536 x 1024, an invisible grid of 6 columns x <rows> rows, one frame per cell, read left to right then top to bottom, nothing touching the borders.
BACKGROUND: one single flat uniform color #2B2E45. No text.
```

<a name="art-consistency"></a>

## Art consistency

- **One reference sheet** for the style, attached to every image prompt.
- **Colour discipline**: every prompt carries the COLOR RULES (at most 4 hue-shifted flat tones per material, one
  outline colour, the same tones on every frame). `artStyle` picks `cel` (default) or `pixel`, whose tools then enforce
  exact colours.
- **Generate prompts, do not improvise them**: `npm run prompts` writes them from the content (the `description` of
  each room and character), so names, looks and sizes match.
- **Backgrounds with an empty floor band** and no people: 1536 × 960; characters and props are added on top.
- **Props with states drawn on the same sheet, same size, same angle.** In the sample game, the `armchair` states
  `remote` and `searched` are `home2/r2c1` and `home2/r2c2`: side by side, so the swap does not jump.
- **Cut, then review**: the cutter cuts a sheet, `npm run page:review` shows every cell with keep / redo / unused.
  Regenerate only the redo cells.
- **Never recut a validated sprite.** Recut one sheet at a time, after a backup. Layouts and mouths depend on the cells.

The design reasons behind these rules are in [Puzzle design](create.puzzle-design.md).

<a name="references"></a>

## References

- [`tools/prompts.ts`](../../tools/prompts.ts), [`tools/cut-sheet.py`](../../tools/cut-sheet.py),
  [`tools/check-alpha.py`](../../tools/check-alpha.py), [`tools/pick-bg.py`](../../tools/pick-bg.py),
  [`tools/refs.ts`](../../tools/refs.ts), [`tools/assets.py`](../../tools/assets.py),
  [`src/engine/dom/assets.ts`](../../src/engine/dom/assets.ts) (the `?v=` version on asset URLs).
- [Image toolchain](install.image-toolchain.md) · [Assets and cutting in the Studio](studio.assets.md) ·
  [Asset provenance](create.asset-provenance.md) · [Review pages](create.review-pages.md) ·
  [Sound effects](create.sound-effects.md).
