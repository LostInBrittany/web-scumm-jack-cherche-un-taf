---
name: asset-prompts
description: Produce the image-model prompts for the current game's art (characters, special poses, mouths, objects, backgrounds, furniture) with npm run prompts, hand them to the human, then cut and import the results.
---
# Asset prompts

**When**: the human asks for art prompts, a new character / room / prop / item needs an image, or `npm run audit` /
`npm run assets` reports a missing image. Never write a sprite prompt by hand: the generator knows the engine's pose
rows, the special poses the rooms use, the states of each prop and the empty spots of each background.

1. Make sure the content describes what to draw: `description` on each character in `cast.ts` and on each room,
   `furniture` on a room for pieces no prop uses yet (see `wiki/en/create.images.md`). A `<describe: …>` placeholder in the
   output means a description is missing: add it, don't fill the prompt yourself.
2. `npm run prompts -- --missing` (or the MCP tool `asset_prompts { missing: true }`). It writes
   `games/<id>/prompts.md`; the structured result lists the missing image ids.
3. Hand the human the sections to generate, in the checklist's order (reference → hero → other characters → objects →
   backgrounds → furniture), each with the files to attach. One sheet per message; a new conversation every few
   characters. They save each image to `games/<id>/private/sheets/<sheet>.png`.
4. Cut each sheet with the checklist's command (`python3 tools/cut-sheet.py <file> <sheet-id> [--grid …] [--cells …]`),
   rename named pieces as listed, run the mouth kits (`tools/talk-kit.py`, `tools/talk-apply.py`) for talking poses.
   Never recut a validated sheet: `--cells` only the missing ones.
5. Add any new `sprites` lines the output gives to `cast.ts`, then `npm run assets`, `npm run audit`,
   `npm run validate`, and a screenshot of a room using the new art (look at it).
