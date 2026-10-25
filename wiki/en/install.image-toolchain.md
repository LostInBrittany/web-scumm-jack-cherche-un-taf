# Image toolchain

The tools that turn generated or drawn sheets into a game's images are Python scripts the engine ships under
`tools/`: they cut a sheet into sprites, choose its background, and prepare every image a game names for the browser.
This page installs them and runs each once, in the engine repository and in a created project. What the art should
look like, and how the prompts are written, is on [Images](create.images.md).

<a name="what-you-get"></a>

## What you get

Python and its pinned modules installed, a sheet cut into keyed sprites under your game's `art/`, and those sprites
prepared into `public/assets/` by `npm run assets`.

<a name="context-and-versions"></a>

## Context and versions

- The **engine repository** (a game under `games/<id>/`) or a **created project** (the game under `game/`, the tools
  under `node_modules/@quest-n-click/engine/tools/`). The commands differ only by the path of the tool and its output.
- From 4.3.0 the modules are Pillow 13.0.0, NumPy 2.4.6 and SciPy 1.18.1 (`requirements.txt`); with that upgrade the
  sample game's images came out byte for byte the same ([4.3 notes](install.upgrade-notes-4-3.md)).

<a name="prerequisites"></a>

## Prerequisites

- Python 3 ([Requirements](install.requirements.md#python)); CI uses 3.12.
- A game, with its `site.json` (the template has one).
- For sounds and videos in `npm run assets`: ffmpeg ([Requirements](install.requirements.md#ffmpeg)).

<a name="where-to-run"></a>

## Where to run the commands

At the root of the engine repository, or at the root of the created project. Each block says which.

<a name="steps"></a>

## Steps

<!-- step: python-modules -->
1. Install the pinned modules:

   ```sh
   # in the engine repository
   python3 -m pip install --require-hashes -r requirements.txt
   ```

   ```sh
   # in a created project
   python3 -m pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt
   ```

<!-- step: prompts -->
2. Get one ready-to-paste prompt per sheet the game names, with the cut command of each (`--missing` for the sheets
   not cut yet). It writes `prompts.md` in the game's folder:

   ```sh
   # in the engine repository: games/<id>/prompts.md
   npm run prompts
   ```

   ```sh
   # in a created project: game/prompts.md
   npx quest-n-click prompts
   ```

<!-- step: cut-sheet -->
3. Cut a generated sheet into keyed sprites, `<out>/<sheet-id>/r<row>c<col>.png` (a 6 × 4 grid by default, `--grid`
   to change it, `--auto` for figures not on a grid):

   ```sh
   # in the engine repository: writes games/<GAME>/art/hero/
   python3 tools/cut-sheet.py hero_sheet.png hero
   ```

   ```sh
   # in a created project: name the output folder, the tool's default is the repository's games/<GAME>/art
   python3 node_modules/@quest-n-click/engine/tools/cut-sheet.py hero_sheet.png hero --out game/art
   ```

   With `"artStyle": "pixel"` in `site.json` (or `--pixel`), the cutter also scales each cell down 4× (`--scale`),
   limits it to 32 exact colours (`--colors`) and writes indexed PNGs; `npm run assets` then writes lossless WebP. A
   sheet on a transparent background (`"sheetBackground": "transparent"`) is cut on its alpha, nothing keyed by colour.

<!-- step: choose-background -->
4. Choose the sheets' background, once per image tool:

   ```sh
   # in the engine repository (in a created project, prefix the tool with node_modules/@quest-n-click/engine/)
   python3 tools/check-alpha.py test_image.png
   python3 tools/pick-bg.py games/<id>/art/hero/
   ```

   `check-alpha.py` says whether an image tool writes real alpha: `TRANSPARENT`, `FAKE CHECKERBOARD` or `OPAQUE`.
   `pick-bg.py` takes sheets, sprite folders or reference images and ranks the flat colours by their distance to the
   drawing; its first line, `BEST #RRGGBB`, is the `sheetBackground` to use.

<!-- step: assets -->
5. Prepare every image and sound the content names:

   ```sh
   # in the engine repository, for the current game
   npm run assets
   ```

   ```sh
   # in a created project
   npm run assets
   ```

   `tools/refs.ts` lists what the content cites (rooms, characters, items, the map, minigame parameters, `skin`, the
   title and credits screens, `ending.scratch`, and `index.ts`'s `extraImages`), then `tools/assets.py` prepares it into
   `public/assets/`. Only what changed is processed again. Where each image is read from, and `sources.json` to read
   it from elsewhere, are on [Images](create.images.md).

<a name="expected-result"></a>

## Expected result, and how to check it

After step 3, the sheet's folder under `art/` holds one PNG per cell. After step 5, `public/assets/img/<sheet>/<cell>.webp`
exists for each image the content names, and `assets` prints a warning for each one it could not find:
`warning: missing images: …` (and `warning: missing sounds: …`). No warning means every image the content names was
prepared.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `ModuleNotFoundError: No module named 'PIL'` (or `numpy`, `scipy`) | Step 1 not done, or done for another Python | Step 1 with the `python3` that runs the tools; in a created project, `PYTHON=<path>` makes `assets` use another interpreter |
| `ModuleNotFoundError: No module named 'cv2'` | A talking-mouth tool needs OpenCV, not in `requirements.txt` | Install OpenCV's Python module yourself |
| The sprites land in `games/<id>/art` of a folder that does not exist | `cut-sheet.py` run in a created project without `--out` | Add `--out game/art` |
| `warning: missing images: …` | The content names an image with no file | Cut or add it, or fix the name in the content |

<a name="files-changed"></a>

## Files or data changed

- `prompts.md` in the game's folder (step 2).
- `art/<sheet-id>/` in the game's folder (step 3); `--cells r1c2,r3c1` cuts only those cells again.
- `public/assets/` (not committed), the game's `assets.gen.json` (the pixel sizes of the prepared images) and
  `.cache/refs.json` (step 5).

<a name="recovery"></a>

## Recovery or going back

Commit the game's `art/` before cutting a sheet again: the cutter overwrites the cells it writes. `public/assets/` is
rebuilt from the sources by `npm run assets` at any time.

<a name="talking-mouths"></a>

## The talking-mouth tools

`tools/talk-kit.py` prepares a "talking kit" per character and pose (the validated sprite's head copied into a 3 × 2
grid), `tools/talk-apply.py` pastes the generated mouths back onto the sprite, and `tools/talk-normalize.py` makes one
row of a talking sheet match the validated sprite. The last two import OpenCV (`cv2`).

> [!LIMIT id=talk-tools-repository-layout]
> `talk-kit.py` and `talk-apply.py` read and write `games/<GAME>/…` from the current folder (`games/<id>/talk-kits.json`,
> `games/<id>/private/talk_kits/`): they work in the engine repository's layout only, not in a created project.
> `talk-normalize.py` takes every path as an argument and works anywhere.

<a name="references"></a>

## References

- [Images](create.images.md) (the pipeline, `sources.json`, the art style), [Sound effects](create.sound-effects.md)
- [Requirements](install.requirements.md#python), [Audio toolchain](install.audio-toolchain.md)
- [`tools/cut-sheet.py`](../../tools/cut-sheet.py), [`tools/assets.py`](../../tools/assets.py),
  [`tools/check-alpha.py`](../../tools/check-alpha.py), [`tools/pick-bg.py`](../../tools/pick-bg.py),
  [`requirements.txt`](../../requirements.txt)
