# Prompts for generating assets

These prompts were used with an image model (ChatGPT image generation) to produce the validated assets of a
real game built on this engine. Reuse them as-is, only changing the parts between angle brackets (`<...>`). Each
prompt produces a sheet on a flat background color that `tools/cut-sheet.py` keys out, so plan the final asset as
a grid from the start.

## Generate them for your game: `npm run prompts`

Don't fill the templates below by hand: `npm run prompts` writes `games/<id>/prompts.md`, with every prompt of the
game ready to paste, one section per sheet to generate, all sharing one STYLE block and one reference sheet
(`games/<id>/art/_reference.png`, or the hero's validated sheet while it doesn't exist).

```bash
npm run prompts                      # games/<id>/prompts.md: every sheet, cells already cut marked "(exists — keep)"
npm run prompts -- --missing         # only the sheets with an image not cut yet, and only their missing cells
npm run prompts -- --out notes.md    # another output file
```

It reads the game module and the art folder:
- **characters** (`cast.ts`): the base 6 × 4 sheet with the engine's pose rows (`human()` or `cat()`), the special
  poses the content uses (extra `sprites` keys, `{ pose: [who, p] }` and `{ anim: [who, p] }` in the rooms, actor
  poses, `variants`) on their cells, a new `<sheet>_poses` sheet for poses no sprite provides yet (with the lines to
  add to `cast.ts`), the seat rule for seated poses, and the mouth kit for the poses listed in `mouths`;
- **objects**: every image a prop, an item, a minigame or the interface uses, grouped by sheet folder, cell by cell;
  the states of one prop are "the SAME object, state …" so they keep size and angle;
- **backgrounds** (`decor/<name>` of each room): LOCATION, the hotspots to show, and EMPTY SPOTS for the props,
  furniture and characters (left / center / right from `layout/<room>.json`);
- **furniture**: props whose image lives in a `furniture_*` folder, and the room's `furniture` list;
- a **checklist**: reference → hero → other characters → objects → backgrounds → furniture, each with its
  `python3 tools/cut-sheet.py` command (`--cells` for the missing ones only), then `npm run assets`.

Three optional fields feed it (they change nothing in the game):
- `description` on a character (`CharacterDef`): the CHARACTER line — age, hair, glasses, build, outfit, signature
  accessory, personality. Missing, the prompt keeps a `<describe: …>` placeholder.
- `description` on a room (`RoomDef`): the LOCATION line — the room left to right, its light and mood.
- `furniture` on a room (`RoomDef`): image ids of furniture drawn on its own sheet (e.g. `furniture_dining/table`),
  for pieces no prop uses yet.

The same text is available to an AI assistant through the MCP tool `asset_prompts` (`{ missing?: boolean }`), which
also returns the missing image ids as structured JSON. The templates below are what the generator fills in.

## Common rules

- **Style**: attach a reference sheet. `hero_sheet.png` (or any already-validated character sheet) for characters,
  an item sheet for objects, the room's background for its furniture.
- **Background**: flat `#2B2E45` by default, no gradient, no floor, no cast shadow, no grid, no text or logo. The
  cutter (`tools/cut-sheet.py <sheet.png> <sheet-id>`) keys this blue out. `sheetBackground` in `site.json` changes it
  (below, "Choosing the sheet background").
- **Light**: coming from the upper left.
- **Brand names**: never write a brand name in a prompt, such as "Darth Vader" — the content filter blocks it.
  Describe the object instead: "a small pink knight plush with a round helmet".
- **Grid**: 1536 × 1024. 6 × 4 cells of 256 px for characters and objects, 3 × 3 or 2 × 2 for larger objects.
- **Object states**: same size, same angle, same position from one cell to the next; only the described change
  differs.
- **Cutting**: only cut the new sheet, using `CUT_OUT` if needed. Never re-cut sprites that are already validated.
- **Colours**: every prompt carries the same COLOR RULES block, whatever the art style (`npm run prompts` adds it to
  the style block and to every sheet; on a background, "sheet" reads "image"):

```
COLOR RULES:
- Use a limited palette. For each material (skin, hair, each garment, each object) use at most 4 flat tones: highlight, base, shadow, deep shadow.
- Hue-shift every ramp: highlights are brighter, slightly less saturated and shifted toward the warm light (yellow); shadows are darker, more saturated and shifted toward cool purple. Never make highlights by adding white, never make shadows by adding black.
- Flat, clearly separated areas: no gradients, no airbrush, no blur, no dithering.
- One single outline colour for the whole sheet (dark warm brown-black), consistent line weight.
- The same material keeps exactly the same tones on every cell of the sheet and on every animation frame.
```

### Art style: `cel` or `pixel` (`artStyle` in `games/<id>/site.json`)

`"artStyle": "cel"` (default) is the painted cartoon look above: clean dark outlines, clean cel shading with flat
tones. `"artStyle": "pixel"` switches the whole pipeline to retro pixel art:

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

- **The tools enforce these rules after generation**, since no image model follows them exactly:
  `tools/cut-sheet.py` (it reads `artStyle`; `--pixel` / `--cel` force it, `--scale 4`, `--colors 32`) scales each
  figure down 4× with nearest neighbour, keeps only fully opaque or fully transparent pixels, quantizes each cell to at
  most 32 colours (median cut, no dithering) and merges near-identical colours (RGB distance < 8) into one exact value,
  shared by every cell of the sheet; cells are written as indexed PNGs (mode P, index 0 transparent). The Studio's
  sheet and cell uploads do the same. `npm run assets` then writes lossless WebP, resizes only with nearest neighbour,
  and scales a background wider than 640 px down 4× to its art pixels.
- **Engine**: set `skin: { pixelArt: true }` in `game.ts` so the scaled-up images keep hard edges
  (`image-rendering: pixelated`).
- **Palette swaps** (`palette` on a character, CONTENT_GUIDE.md) work best with `pixel`: the colours are exact.

### Choosing the sheet background (`sheetBackground` in `games/<id>/site.json`)

A sprite sheet is drawn on a background the cutter removes. The default is a flat `#2B2E45`, and any fixed colour
fails on some character: a black cape or dark eyes close to `#2B2E45` are keyed out with it; a magenta background
eats the shadows the COLOR RULES shift toward purple (on an orange head they are pinkish); and the generator often
paints "see-through" parts, a carved mouth or eyes seen in profile, with the background colour, so they become holes
when they touch the figure's edge. Try, in this order:

1. **`"sheetBackground": "transparent"`**, when your image tool really writes alpha. Test it once: ask it for a small
   figure on a transparent background and run `python3 tools/check-alpha.py <image.png>`. `TRANSPARENT` means real
   alpha; `FAKE CHECKERBOARD` means a grey-and-white checkerboard painted where the transparency should be (some
   tools do that), and `OPAQUE` no transparency at all. With real alpha there is nothing to key: the prompts ask for a
   transparent PNG and forbid the painted checkerboard, and `tools/cut-sheet.py` keeps exactly the opaque pixels,
   colour-blind (a transparent copy of a flat-background sheet cuts to the same cells).
2. **Otherwise, the flat colour farthest from the drawing**: `python3 tools/pick-bg.py <sheet | sprite folder |
   image> [...]` on the character's reference or previous sheet ranks cyan, magenta, green and blue by their distance
   to the drawing's closest colour (a sheet's own background left out) and prints `BEST #RRGGBB`. Set it as
   `"sheetBackground": "#00FFFF"`; the cutter keys whatever flat colour the border has.

In both cases the prompts say that every pixel of a figure is opaque, including the inside of carved or open shapes
(mouths, eyes). Without `sheetBackground` (or with a value that is neither `transparent` nor `#RRGGBB`, which warns),
everything stays on `#2B2E45`. The templates below show that default; `npm run prompts` writes the game's own. Room
backgrounds are not concerned, and the mouth kits (`tools/talk-kit.py`) keep their `#2B2E45` backdrop: the mouths
are pasted back through the validated sprite's own alpha, nothing is keyed.

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

Furniture that blocks the path, such as a sofa, a table or a market stall, is generated separately: the room
empty on one side, the furniture on the other. The engine then depth-sorts it with the characters. Prompt for
the furniture sheet:

```
Create an item sheet for a point-and-click adventure game.
STYLE: match exactly the art style, lighting and colors of the attached decor_<room>.png.
LAYOUT: canvas 1536 x 1024, an invisible grid of <columns> x <rows>, one object per cell, centered, nothing touching the cell borders. One single flat uniform background color #2B2E45, no gradient, no floor, no cast shadow on the background, no text.
Every object is seen from the SAME angle and at the SAME scale as in the attached decor.
<row by row: each piece of furniture, and its states if it has any>
```

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

Minigame pieces seen from above, such as tiles, add: "seen from DIRECTLY ABOVE, flat, no perspective", a fixed
tile size, and edges that line up at the middle of each border.

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

Instead of relying on a reference photo for likeness, describe the character fully in words in the `CHARACTER`
line: age, hair, glasses, build, outfit, signature accessory, personality. The more specific the description, the
more consistent the character stays across sheets generated in different conversations.

Pose mapping with the engine: `portrait` = r1c2; `walk` = r2c1 to r2c6; `front` = r3c1; `back` = r3c2; `idle` =
r3c3; `point` = r3c5; `use` = r3c6; `walk_front` = r4c1 to r4c3; `walk_back` = r4c4 to r4c6.

Variant "holding an object", for a character who always carries a signature prop (a cane, a plush toy, a tool):
same grid, same poses, adding "now always holding <object> in her LEFT hand, clearly visible and clearly
separated from her coat". The free hand still does the gestures.

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

### Character: talking (calm animation)

The body must never change while a character talks: only the mouth moves. Otherwise the character seems to jump
from pose to pose.

**Recommended method: the mouth kit.** The generator is never asked to redraw the character. It only supplies
mouths, which a script pastes back onto the already-validated sprite.

1. **Prepare the kits:** `python3 tools/talk-kit.py`
   - It writes the validated sprite's head, enlarged and copied 6 times into a 3 × 2 grid (1536 × 1024), to
     `games/<id>/private/talk_kits/<character>_<pose>.png`.
   - It also writes a `.json` file that keeps the head's exact position.
   - The list of characters and poses is set at the top of the script (`POSES`): `profile` (`r3c3`), `front`
     (`r3c1`), and `seated` (`seated_poses`) for characters who talk while seated.
2. **Send each kit to the generator**, one kit per message, with the prompt below.
3. **Save the reply** next to the kit, under the name `<character>_<pose>_out.png` (or `_chatgpt.png`).
4. **Paste the mouths back:** `python3 tools/talk-apply.py <character>_<pose>`
   - The script first aligns the reply's 6 cells with each other, then cell 1 with the original head.
   - It detects what changed (mouth, eyes) and corrects the color on the ring around it.
   - It only pastes that area back onto the validated sprite.
   - Output: `games/<id>/art/talk_<character>/<pose>/t1.png` … `t6.png`. `t1` is exactly the validated sprite.
5. **Check**: only the mouth and eyes should move. The script prints the area it repainted for each image: a few
   thousand pixels is normal, tens of thousands means a cell is misaligned.

The generator may redraw the whole head in a slightly different style: that's fine, only the mouth is reused.
What matters is that the 6 cells of its reply are consistent with each other.

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

Tips: one kit per message, and a new conversation every few characters so the generator doesn't mix up faces.
If it redraws too much, use its selection tool to highlight only the six mouths, then give it the same text
again.

Engine side: `t1` at rest; while talking, `t2`, `t3` and `t4` at random, never the same one twice in a row, every
160 to 220 ms; `t5` now and then to blink; `t6` at the end of a cheerful line; back to `t1` at the end of the line.

**Other method, when generating a brand-new character from scratch:** generate the base sheet and its talking
sheet in the same conversation, with the prompt below. This is useful when a character's colors are decided at
the same time as its talking frames. The two sheets come out consistent, then `tools/talk-normalize.py` brings
them back to the same size and colors.

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

### Object animation (looping frames)

```
Create an animation sprite sheet for a point-and-click adventure game: <object> <motion>, <n> consecutive frames of one smooth loop.
STYLE: match exactly the art style of the attached reference. Same size and position in every frame, only the motion changes.
LAYOUT: canvas 1536 x 1024, an invisible grid of 6 columns x <rows> rows, one frame per cell, read left to right then top to bottom, nothing touching the borders.
BACKGROUND: one single flat uniform color #2B2E45. No text.
```

### Size and colors that don't match the reference sheet

This is normal: an image generator never reproduces a reference image's scale or colors exactly. Don't fight it —
correct it afterward instead:
- **Talking frames for an already-validated character**: the mouth kit above (`tools/talk-kit.py` then
  `tools/talk-apply.py`). The body stays the validated sprite, pixel for pixel.
- **A talking sheet generated as one block**: `python3 tools/talk-normalize.py <talk_sheet.png> <row> <validated_sprite.png> <output_folder>`. Same height, same colors, same bounding box for all 6 images, and the "mouth closed" cell becomes the rest pose.
- **General rule**: never mix, within one animation, frames that come from two different sheets. One animation,
  one sheet.
