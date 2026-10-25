# Review pages: validate from a phone

Five generated HTML pages let the author check the game away from the computer. Three take annotations: the
**storyboard**, the **sprite review** and the **placement** page. Two are read-only pictures: the **world** and the
**puzzles**. Each page is a single self-contained file (images embedded, no server), made to be published as a
claude.ai artifact: the author annotates on a phone, the AI reads the annotations back and acts on them.

<a name="commands"></a>

## Commands

```
npm run page:storyboard              # → dist-pages/storyboard.html   (needs games/<id>/storyboard.json)
npm run page:storyboard -- --md      # also writes games/<id>/storyboard.md (plain text for agents)
npm run page:review                  # → dist-pages/review.html
npm run page:placement               # → dist-pages/placement.html
npm run page:world                   # → dist-pages/world   (no .html extension: --out world.html for one)
npm run page:puzzles                 # → dist-pages/puzzles (no .html extension: --out puzzles.html for one)
npm run import-layout -- <file|dir>  # merges exported layouts into games/<id>/layout/<room>.json (--dry to preview)
```

Run them **in the engine repository**, on your machine. Options: `--out <dir>` or `--out <file.html>`. The game is the
current one (`GAME=<id>`, else the game `npm run game` chose, else `package.json`'s `config.game`); `GAME_DIR=<path>`
points at a game folder outside `games/` (for example `tests/fixture`).

> [!LIMIT id=engine-repo-only]
> The `quest-n-click` command of a created project does not offer these pages nor `import-layout`. In a created project,
> the Studio (`npm run studio`) shows the same things: the Storyboard tab, the Assets tab, the placement editor, and the
> world and puzzle graphs in the Check tab.

Images come from `games/<id>/art/` (following `sources.json`, like `npm run assets`), or from the prepared
`public/assets/img/` when the game's manifest lists them. With `python3` and Pillow installed they are downscaled to
WebP thumbnails (cached in `.cache/pages/`); without, the files are embedded as they are and the page gets bigger. Keep
a page under 16 MB, the artifact limit: the generator prints the page's size and warns above it.

<a name="the-three-pages"></a>

## The three annotated pages

<a name="storyboard-page"></a>

### Storyboard

`tools/pages/storyboard.ts`, schema in [`tools/pages/storyboard-schema.md`](../../tools/pages/storyboard-schema.md).
One section per board: the room's decor, the goal, then every panel with its action, its lines (portrait, name, text),
its sounds, and a notes box. Talk topics, optional reactions and hints follow. Notes go to the collection `notes` (doc
id = panel id; also `general`, `<board>__talk__<character>`, `<board>__reactions`, `<board>__hints`). Whatever Claude
writes in the collection `rewrites` under the same id shows up in green under the note. Ids are kept to letters,
digits and `_ - . ~ : @ +`; other characters become `_`.

The page refuses an invalid storyboard with the same sentences as the Studio and the MCP's `set_storyboard`. What the
storyboard is for: [The storyboard, source of truth](create.storyboard.md).

<a name="review-page"></a>

### Sprite review

`tools/pages/review.ts`. Every folder of `games/<id>/art/` is a sheet, every image in it a cell (nested folders, like
talk kits, are included: the cell is `pose/t1`). Each cell is tagged *used* when the game references it (same rules as
`tools/refs.ts` and `npm run assets`, so `sources.json` overrides count), with the ids that cite it. Ids the game cites
but no file provides are listed at the top. Per cell: keep / redo / unused and a note, saved in the collection `decide`
(doc id `<sheet>__<cell>`, value `{ choice, note, sheet, cell, used, updatedAt }`). Filters: all, used, not used,
undecided, redo. How the sheets are made: [Images](create.images.md).

<a name="placement-page"></a>

### Placement

`tools/pages/placement.ts`. One room at a time, on its decor (640 × 400 logical units, scaled to the screen). Drag
with a finger or the mouse:

- props and actors by their body (feet = the white dot), their height with the blue dot, their approach point with the
  pink diamond ("Add approach" creates one); actors are drawn at their depth scale, as in the game;
- hotspots (rectangles: move, resize with the corner dot; polygons: drag the points);
- the walk area points (select "Walk area"; tap a point, then "Add point" after it or "Delete point");
- the entries (rings; the hero is drawn faintly on `default`, at its scale) and the two scale lines (blue dashes).

Anything absent from the layout is shown in the middle with a "to place" badge, dashed, and is written only once
moved. Each change saves `{ room, layout }` in the collection `layouts` (doc id = room id). "Export room" gives the
room's layout, the same shape as `games/<id>/layout/<room>.json`; "Export JSON" gives `{ "layouts": { "<room>": … } }`.
The page does not edit per-state positions, rotation, `z` or `on`: those keys are kept as they are. For fine work, use
the in-game editor (`npm run dev`, then `?edit=<room>`) or the Studio: see [Placement and stage](studio.placement.md).

<a name="world-page"></a>

## The world page

`npm run page:world` draws the rooms and the ways between them (declared exits solid, `goto` commands dashed, rooms on
the map marked), lists unreachable rooms and exits with no way back, and prints the DOT source for Graphviz.
Read-only: no annotations, no artifact database. The same picture is in the Studio's Check tab.

<a name="puzzles-page"></a>

## The puzzles page

`npm run page:puzzles` draws the puzzle graph: things (items, flags, props, places, events, moved characters) in
colour, actions (rules, topics, scripts, listeners, chapter goals) in white; grey arrows for what an action needs,
dotted when it is read inside its commands, green for what it produces, red dashed for what it consumes. Tap a thing
for its card: acquired by, consumed by, used by, requires first, unlocks, downstream. The page lists what is read but
never produced and what is produced but never used, and prints the overview table and the DOT source. Read-only. How
to read it while designing: [Puzzle design](create.puzzle-design.md#puzzle-graph).

<a name="annotations"></a>

## Where the annotations go

Every annotated page shows a status line at the top and an **Export JSON** button. It works in three modes:

1. **Published as an artifact, with the `db` capability**: each change is saved in the artifact's database, and the
   page follows live changes, Claude's included. Status: "Connected".
2. **Opened as a plain file** (a browser, an email attachment): changes are saved in the browser's `localStorage`.
   Export JSON copies the data to the clipboard and downloads a `.json` file: send it back.
3. **Read-only** (the viewer may not write in the database): edits stay on the device; Export JSON still works.

A local copy is always kept, so a page reopened on the same device shows what was typed, even offline.

<a name="publish-read-back"></a>

## Publish and read back (Claude Code)

<!-- step: publish -->
1. Build the page, then publish it with the Artifact tool, declaring the database: `capabilities: { db: {} }`.
   Republish to the same URL after each regeneration (same file path in the same session, or pass `url`): the database
   is kept across versions.

<!-- step: share -->
2. Send the link to the author. Only people with edit rights (Contributor or more) can write.

<!-- step: read-back -->
3. Read the annotations with the **ArtifactData** tool, `action: "list"`, on the artifact's `url`:
   - storyboard: collection `notes`; answer by writing `rewrites/<panel id>` with `{ "text": "…" }` (`set`);
   - review: collection `decide`; list the `redo` cells with their notes, one regeneration prompt per sheet;
   - placement: collection `layouts`; save the documents to a JSON file and import them ([below](#import-layouts)).

<!-- step: plain-file -->
4. If the author used a plain file instead, they send the exported JSON: same content, read it directly.

The wider method of working with an assistant is in [Working with an AI](create.working-with-ai.md).

<a name="validate-the-storyboard"></a>

## Validate the storyboard on a page

The second step of the method, after the story is written as data: `npm run page:storyboard` renders the storyboard as
an illustrated page, every panel composed from the real backgrounds and sprites (once they exist), with the lines,
playable sounds, and a notes box under each panel. Publish it as an artifact: the author annotates from a phone, the AI
reads the notes back (ArtifactData) and rewrites the storyboard. Iterate until the author says "v final". Only then
write the rooms.

<a name="import-layouts"></a>

## Import layouts

```
npm run import-layout -- exported.json          # one file
npm run import-layout -- ./layouts/ --dry       # every .json of a folder, preview only
```

Accepted files: the page's Export JSON (`{ "layouts": { … } }`), Export room (`<room>.json`, the room is the file
name), one database document (`{ "room", "layout" }`), or a list of documents as ArtifactData returns them
(`[{ "id", "data": { "room", "layout" } }]`).

Only keys present in the export change: `hotspots`, `props`, `actors` and `entries` are merged id by id (each exported
entity replaces the stored one), `walk`, `scale` and `floor` are replaced when present. Removals made on the page
("Unplace", "Remove approach") are therefore not imported: delete those keys by hand or in the in-game editor. The
command prints every change (`+` added, `~` changed) and `<n> room(s) updated in …` (`would change` with `--dry`).
Then run `npm run validate` and look at the room (`?dev&at=<checkpoint>`).

> [!GUARANTEE id=import-layout-merges]
> `import-layout` replaces the exported entities, and keeps the other entities and the keys the export did not carry.

<a name="related"></a>

## Related

- Sources: [`tools/pages/`](../../tools/pages/storyboard.ts) (`storyboard.ts`, `review.ts`, `placement.ts`,
  `world.ts`, `puzzles.ts`, `import-layout.ts`, `lib.ts`), [`tests/pages.test.ts`](../../tests/pages.test.ts).
- [The storyboard, source of truth](create.storyboard.md) · [Images](create.images.md) ·
  [Placement and stage](studio.placement.md) · [Check in the Studio](studio.check.md) ·
  [Working with an AI](create.working-with-ai.md).
