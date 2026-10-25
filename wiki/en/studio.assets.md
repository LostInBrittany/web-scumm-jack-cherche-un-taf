# Assets and cutting

The Assets tab lists every image and sound of the game against what the game uses, gives each sheet its art prompt,
and takes the generated images and sounds that replace or add to them, cutting sheets into cells, without ever
deleting a file.

<a name="what-you-get"></a>

## What you get

A generated sprite sheet cut into the cells the game names, a picture or a sound replaced with the old one kept
beside it, and the game showing the new art once prepared.

<a name="context-and-versions"></a>

## Context and versions

The local Studio, in the engine repository or a created project. True from 4.2.1 (every upload is one operation of
the game's journal). The demo Studio shows the listing read-only; a hosted Studio has the same tab with its own
limits (below).

<a name="prerequisites"></a>

## Prerequisites

- The Studio running ([overview](studio.overview.md)).
- Python 3 with Pillow for cutting and keying (`tools/cut-sheet.py`), ffmpeg for sounds, the image and audio
  toolchains: [Image toolchain](install.image-toolchain.md), [Audio toolchain](install.audio-toolchain.md).
- The art prompts and the sheet ids come from the game: [Images: prompts, cutting sheets, transparency, scale](create.images.md).

<a name="where-to-run"></a>

## Where to run the commands

In the browser, on the Assets tab. **Prepare assets** runs `npm run assets` for you, in the folder the Studio serves.

<a name="assets-tab"></a>

## The Assets tab

The tab lists everything under `games/<id>/art/` and `audio/` against what the game references
([`tools/refs.ts`](../../tools/refs.ts)), with the prompts of `npm run prompts` ([`tools/prompts.ts`](../../tools/prompts.ts)).

- **Tree** (left): Characters (one entry per sprite sheet, named after the character whose poses it holds), Objects,
  Backgrounds, Furniture, Talk kits, Sounds (music, sound effects). Badges: **red** = cells the game references
  without a file; **orange** = used but not prepared, or older than their source; **grey** = cut but unused.
- **Sheet** (centre): the cells as thumbnails with their id and what uses them (`walk`, `portrait`, `items.key`,
  `house.props.pantry`…); filters All / Used / Unused / Missing. On top, the **Prompt** panel: the sheet's section of
  the prompts with **Copy prompt** (the fenced block for the image model), **Copy prompt for missing cells only** when
  some are missing, and the shared Style block (folded) with its own Copy.
- **Cell** (right): large preview, file, size, image ids, prepared or not, where it is used (with "Open room"),
  **Replace…**, and the backups.
- **Backgrounds**: the decor with the room's hotspots, props (foot and height), actors and walk area drawn over it,
  and the dashed floor band the prompt asks to keep empty; Replace… and "+ background".
- **Sounds**: a player per file, where it is used, Replace… (same extension) and Add sound…. The music and sound ids
  the game declares are listed whether or not a file exists; `npm run assets` ships what is there and reports what is
  missing ([Music](studio.music.md#audio-tools)).

<a name="steps"></a>

## Steps

<!-- step: copy-prompt -->
1. Pick the sheet in the tree, **Copy prompt** (or **Copy prompt for missing cells only**) and generate the image
   with your image model.

<!-- step: upload-sheet -->
2. **Upload generated sheet…** sends the image with the sheet's id and grid (6 × 4 by default). It is saved under
   `private/sheets/<sheetId>-<time>.<ext>` and cut by [`tools/cut-sheet.py`](../../tools/cut-sheet.py) into
   `art/<sheetId>/`. If cells of that sheet exist already, a dialog lists them, each with a **recut** box: unticked,
   the cell is kept and only the new cells are cut. The cut result is shown. For a sheet that has no folder yet, use
   **Upload sheet into a new sheet id…** in the toolbar.

<!-- step: replace -->
3. To change one picture, select the cell and **Replace…**. Keying: a flat background is keyed by default; choose
   "always" or "never" to force it. A decor (PNG or JPEG) is replaced the same way from Backgrounds, a sound from
   Sounds (any format ffmpeg reads, same extension).

<!-- step: prepare -->
4. **Prepare assets (npm run assets)** in the toolbar runs the pipeline with its output live in a drawer; the count
   next to it is what it would process. Afterwards the Rooms view reloads. A replaced cell shows in the game once
   prepared.

> [!GUARANTEE id=no-silent-recut]
> An upload that would recut existing cells without naming them is refused with 409 and the list of those cells. An
> upload that names a cell recuts only that cell, and the old file is kept as `<name>_v<N>` first.

Nothing is deleted: a replaced sound or decor is kept as `<name>_v<N>` too.

Backups are not cells: the listing and the prompts ignore them.

> [!LIMIT id=demo-read-only]
> In the demo Studio the listing comes from the snapshot (`assets` in `snapshot.json`), the thumbnails and sounds
> from the prepared files of `public/assets` (unused cells have no preview); uploads and Prepare are hidden.

<a name="hosted"></a>
<!-- applies: 4.2.3.. -->

### On a hosted Studio

The same tab, served by the Studio Server under `/api/assets`. Uploads are bounded (10 MiB; PNG, JPEG or WebP images,
Ogg, MP3 or WAV sounds, recognised from their bytes); the cutting, the keying and **Prepare assets (on the server)**
are jobs of the processing worker, under the project's exclusive lease, shown in a small panel with a **Cancel**
button (a job cancelled before its write leaves nothing). The uploaded sheet itself is not kept there. See
[Hosted assets](team.hosted-assets.md).

<a name="expected-result"></a>

## Expected result, and how to check it

The cell's badge leaves red; after Prepare it leaves orange; the cell shows in the game. `git status` shows the new
files under `art/<sheetId>/` and the `_v<N>` backups beside them.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| 409 with `conflicts` on an upload | Cells of that sheet exist and were not named | Tick **recut** for the cells to replace, or leave them kept |
| `` `sheetId` must be letters, digits, _ and - (not "decor") `` | A bad sheet id | Use the game's sheet id |
| A replaced cell does not show in the game | Not prepared yet (orange badge) | **Prepare assets** |
| The cut fails | Python 3 or Pillow is missing | [Image toolchain](install.image-toolchain.md) |

<a name="files-changed"></a>

## Files or data changed

`games/<id>/art/<sheetId>/<cell>.png` and their `_v<N>` backups; `art/decor/<name>.<ext>`; `audio/<music|sfx>/<file>`;
the uploaded sheet under `games/<id>/private/sheets/`; the prepared files under `public/assets/` after Prepare.

<a name="recovery"></a>

## Recovery or going back

A replaced file is kept as `<name>_v<N>`: copy it back over the cell, or use git. Prepare can be run again at any
time.

<a name="references"></a>

## References

- Server side: [`tools/studio/assets.ts`](../../tools/studio/assets.ts) (mounted at `/__studio/api/assets`), the
  cutting in [`tools/studio/cut.ts`](../../tools/studio/cut.ts). The tab: [`src/studio/assets.ts`](../../src/studio/assets.ts)
  with its model, IO and views beside it (`assets-model.ts`, `assets-io.ts`, `assets-view.ts`, `assets-sheets.ts`,
  `assets-decors.ts`, `assets-sounds.ts`); the Storyboard and Rooms tabs are laid out the same way since 4.1.8, every
  file under 800 lines.
- The routes: [Studio API](studio.api.md).
