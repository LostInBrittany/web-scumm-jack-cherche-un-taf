### Changes

- **The sprite sheets' background (4.2.3)**: `"sheetBackground"` in `site.json`, next to `artStyle`, is
  `"transparent"` or a `#RRGGBB` colour (default `#2B2E45`, so a game without it gets the same prompts as before).
  `npm run prompts` writes every sheet's background from it; in transparent mode the prompts ask for real alpha, forbid
  a painted checkerboard and keep carved or open shapes (mouths, eyes) opaque. `tools/cut-sheet.py` cuts a sheet on a
  transparent background on its alpha, keying nothing by colour (a flat-background sheet cuts exactly as before). Two
  small scripts help choose: `tools/check-alpha.py` tells real alpha from a painted checkerboard, and
  `tools/pick-bg.py` ranks the flat colours by their distance to a character's drawing (PROMPTS.md, "Choosing the
  sheet background").
