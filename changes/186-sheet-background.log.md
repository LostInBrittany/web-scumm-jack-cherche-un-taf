## 4.2.3: the sprite sheets' background, transparent or chosen (#186)

- Found while making "Jack cherche un taf" (12 characters, pixel art): the fixed `#2B2E45` keyed out a vampire's black
  cape and a blob's dark eyes; magenta instead ate the purple-shifted shadows of an orange pumpkin; and the generator
  painted the pumpkin's carved mouth and eyes in the background colour, which the flood fill took for background where
  they touched the edge. Whatever colour is fixed, some character has it in its palette or its shadows.
- `tools/prompts.ts`: `readSheetBackground(gameDir)` (`transparent`, or `#RRGGBB` upper-cased; `BG` when absent, and
  with a warning when invalid, where `artStyle` falls back silently) and the `sheetBackground` option. The BACKGROUND
  line, the style block's note, the furniture LAYOUT line and the EMPTY cells follow it; `BG` stays exported as the
  default. Without the setting the output is byte-identical (checked on demo, signals and reference, cel and pixel,
  with and without `--missing`).
- `tools/cut-sheet.py`, grid mode: an RGBA sheet whose pixels are more than 20% below alpha 250 is cut on its alpha
  (`alpha < 128` is background, wherever it is), as auto mode already did. A flat sheet, native size or resized, cel
  or pixel, cuts to the same bytes as before.
- `tools/check-alpha.py` and `tools/pick-bg.py`, ported from the game's own `art-tools/`. `tools/talk-kit.py` keeps
  its `#2B2E45` backdrop: `talk-apply.py` pastes the mouths back through the validated sprite's alpha and keys nothing.
- Tests: `tests/prompts.test.ts` (the default still `#2B2E45` in every line, a colour replacing it everywhere, the
  transparent wording in every kind of sheet, `site.json` read and validated), `tests/pixel.test.ts` (a transparent
  copy of the synthetic sheet cuts to the same cells, a figure painted `#2B2E45` on it stays whole, the verdicts of
  check-alpha, cyan for an orange figure from pick-bg with a sheet's own background left out).

→ next: removing the fringe of a flat colour in the cutter itself, if it is wanted (the game's script is written for
magenta, and it is the delicate part).
