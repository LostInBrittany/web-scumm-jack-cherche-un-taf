# Studio: local WYSIWYG authoring, and the open door for any AI

`npm run studio` starts the dev server with the Studio at `/__studio/`. Nothing leaves your machine: every change is
written to files under `games/<id>/`, the same files an AI assistant or a teammate edits with git. The Studio shows the
real engine (the room rendered by `src/engine/dom`), so what you see is what players get.

To put a game's Studio online for a team (logins, roles, several people at once), see
[STUDIO-SERVER](STUDIO-SERVER.md).

## Local and LAN security

`npm run studio` and `npm run dev` listen on `127.0.0.1`: another machine cannot reach their file-writing routes.
To work from a phone, use `npm run studio:lan` or `npm run dev:lan`; each command prints a fresh capability-token URL.
Every Studio, asset, layout and assistant route then requires that token and a same-origin request. Do not expose the
development port to the Internet. Provider keys stay in `sessionStorage`; arbitrary provider URLs are disabled unless
`WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1`, and private/link-local destinations remain blocked except the explicit local
Ollama preset (both IP families: `[::1]`, `0.0.0.0`, IPv4-mapped IPv6, `fc00::/7`, `fe80::/10`, `.local`, `.internal`).
A provider call never follows a redirect, gives up after 60 s, and reads at most 8 MB of answer. Game TypeScript and custom commands are trusted code, not sandboxed data. See `SECURITY.md`.

## Layout of the Studio
- **Rooms** (default tab): the room rendered by the engine with the placement editor on top (drag zones, feet, heights,
  approach points, walk area, scale lines, entries), the list of the room's props / actors / hotspots on the right.
  Selecting one (in the list or in the view) opens its sheet: name, kind, states, visibility, **look lines** (add, edit,
  delete), **reactions** (verb, targets, condition, commands as a list of lines: texts editable, other commands shown),
  **talk topics** (as a list, or as a **tree**: topics, lines, choices and their options, branches, each with its
  condition; tapping a node jumps to its editor); next to every cutscene, arrival script and world script, a **Timeline** toggle draws how long each command takes and what overlaps (lines, walks, animations, parallel branches, the player's turns in red; tap a bar to jump to its line); under the view, the room's name, **hints**, **on enter** lines, the
  room's **scripts** and **events** (read-only structure, texts editable). A text is saved when the field
  loses focus (Enter); Escape cancels. Each save shows a toast and runs Check in the background; a placement in
  progress in the view is saved first (the view reloads when the room file changes). Text edits are written into `rooms/<room>.ts`
  in place (string literals replaced through the TypeScript parser; the file stays readable code). "Add prop / hotspot /
  actor" creates the entry in the room file and places it in the layout.
- **Storyboard**: an editor for `storyboard.json` (schema: `tools/pages/storyboard-schema.md`). Left, the boards
  (title, room, goal) with move up / down, add, delete. Middle, the selected board: title, id, room ("Open in Rooms"
  switches to that room), goal, exit, its **arrival** lines, its **panels** as cards in play order (title, id, the
  player **action** that triggers it, **lines** with a speaker chooser: the game's characters, `hero`, `action`,
  `stage`; **sfx** chips from the game's `audio.sfx`; per line: move, delete, "+ line"; per card: move, duplicate,
  delete), then the **hints** (ordered), the **talk topics** per character (topic + lines) and the optional
  **reactions** (action + lines). Right, the selected panel composed like a storyboard frame: the room's decor, the
  portraits of the panel's speakers (the one speaking highlighted), the current line in the game's speech style
  (speaker colour; step through the lines, or click one in the script below), the action as the game's sentence bar,
  the sfx; under it, the notes about this panel (`about` = panel id) and a box to add one.
  Every edit stays in memory until **Save** (or Ctrl/Cmd+S) writes the whole document; "● Unsaved changes" shows
  until then, and leaving the page asks first. Save refuses duplicate or empty panel ids (notes hang on them). When
  `storyboard.json` changes on disk (an AI, an editor, git), a banner offers to reload; with unsaved edits it warns
  that saving would overwrite that change. **Export Markdown** writes `games/<id>/storyboard.md` from the saved file
  (the same text as `npm run page:storyboard -- --md`; it offers to save first).
- **Assets**: every image and sound of the game, where each one is used, its art prompt, and the uploads that replace
  or add them (see "Assets tab" below).
- **Storyboard** (see below): the saved storyboard is checked against the content after every load and save
  (`src/engine/tools/coverage.ts`): a badge on each board and panel (✓ everything is in the game, ~ partly, ✗ something
  is missing, ? prose), and under a panel the list of what is not there yet (an action no rule answers, a line the game
  does not say, a sound not in `audio.sfx`); the bar shows the overall score.
- **Check**: the validator and the solver run after every save; their output and the solver path are shown here.
  "Screenshot" renders a room at a checkpoint (needs Playwright).
  Below them, the **world map** (rooms, exits, gotos; unreachable rooms and exits with no way back in red) and the
  **content report** (what each room, item and character amounts to: the profiler of `npm run validate -- --report`),
  and the **puzzle graph**: every rule, topic, script and listener with what it needs (grey arrows, dotted when read
  inside its commands) and what it produces (green) or consumes (red); tap an item, flag, prop, place or event for its
  card (acquired by, used by, requires first, unlocks, downstream, and why the solver keeps it: critical, world,
  visible or dead, with the chain to the end), the same text the `puzzle_graph` tool returns. Two toggles above the
  graph: **Critical path** fades everything that does not lead to the end, a goal or an invariant; **Heat** colours
  each rule, topic, listener, script and room by how many times the solver went through it. Under the solver path,
  **Solver health**: engine runs, actions skipped, no-ops, actions per state, which dimensions split the states most,
  the warnings a designer acts on (independent dimensions: a checkpoint between them would cut the states; a room with
  runaway branching), the full profile of `npm run solve -- --profile`. Further down, **Storyboard coverage**: the
  storyboard checked against the content, the same text the `storyboard_coverage` tool returns. Before it, **Content
  lint**: the findings of `npm run lint` (errors, warnings, info), each a link into the Rooms tab, the same text the
  `lint` tool returns. Above it, **Playtests** (dev server only): the sessions of `games/<id>/playtests/` replayed and
  summed up, and the puzzle graph's "Heat" selector can colour the nodes by the players' sessions instead of the solver's runs.
- **Play**: the game itself (dev tools on) in a frame, next to the live **state** (room, bag, flags, moving
  characters, scripts, players) and a **rule explainer**: pick a verb, an item and a target, and every rule that could
  answer is listed with each condition evaluated ✓ / ✗ against the live state; the first ✓ wins, or the tab says which
  fallback answers (look line, topics, kind reaction, fallback). Under it, the **journal**: what every action answered
  (rule, look line, fallback…), the events emitted and the listeners they reached, each script step, characters moved,
  player switches; filter by kind. The engine keeps it only in dev mode (`Engine.trace`, the last 200 entries).
  Next to it, **Export session** downloads the inputs since the game started (with the journal: a bug report
  `npm run replay` plays back) and **Replay…** loads one: the engine plays it silently, the game lands where it ends,
  a slider scrubs through the entries (tap one to land there), and a divergence from the recording is flagged.
  For a game with `speedrun` (4.1.14, `docs/en/SPEEDRUN.md`), the **speedrun** panel: the categories and their rules,
  the splits with an editor (name, trigger; **+ split**; **Write to the game** writes the manifest with `set_value` on
  `@game`), **Preview on this session** (the frame's session replayed with the category's splits: the times a run
  would record), **Export route** / **Import route** (`.wsroute`), **Logical route (solver)** (the witness, never a
  record), the last two routes compared, and **Export run (.wsrun)** once an attempt in the frame is sealed.
- **Language** (4.1.12): the game as the tools see it. First its **objectives** (ADR 0014): id, title, condition,
  parent, optional, and the `file:line` that writes each; **Edit** and **+ objective** open a form generated from the
  objective's schema (`src/studio/forms-gen.ts`: each field with its description, the parent's id with the game's
  objectives as suggestions, the condition with the DSL's editor). **Preview the change** shows the diff of the game
  file, **Apply** writes it (validated by the server, taken back when it adds an error), the header's Undo takes it
  back; a problem is named by file, id and field before anything is sent, and the validator's errors after. Then the
  IR (`npm run ir`): rooms, entities, rules, topics, listeners and scripts, each with where it is written, and the
  whole IR as JSON.
- **Remix** (4.1.15, `docs/en/REMIX.md`): the game's dimensions with their values, story value and modes; **Preview**
  a typed seed or a **New seed** (each dimension's value, the world's hash, a link that plays it in the game, a frozen
  world to **Export**); **Lock** dimensions and **Reroll the others**; **Compare** with another seed; the order of a
  puzzle-order dimension drawn; **Coverage and bias** over many seeds; the rooms' **Anchors**, and one added from the
  Rooms tab's selection. A manifest that cannot make a world shows the validator's reasons. Computed with the engine's
  compiler (`src/studio/remix-model.ts`): the Studio never shows a world the player would not play.
- **Map** (4.2.3): the scenario's groupings, chapters, puzzles and characters (`games/<id>/groupings.json`), each a
  list of what the game already names (a room, a rule or topic id, `item:<id>`, `char:<id>`, `objective:<id>`,
  `checkpoint:<id>`) with the `file:line` that writes it, or "not declared" when the game does not know it; then the rooms,
  characters, items, objectives and checkpoints no grouping names yet (ids written by code, and line or step ids, are
  not in the IR's provenance: they show as "not declared"). A grouping only refers: saving it writes `groupings.json` alone, never the content. The map is
  derived at each read (from the IR's provenance and the groupings), never stored.
- **Notes**: the shared log (`games/<id>/notes.json`), one entry per author ("you", or the AI's name), about a panel
  id, a room id, `room.entity`, or anything (empty: general). The whole log, newest first, grouped by `about` (tagged
  room / panel / entity, with "Open in Rooms" / "Open in Storyboard"); filters: free text, about (rooms with their
  entities, panels, others), author. A composer (about, author defaulting to `you` and remembered, text;
  Ctrl/Cmd+Enter adds). Each note shows its author and time, and **Reply** (pre-fills `about`), **Edit** (in place)
  and **Delete**. Notes about a room or one of its entities also appear at the bottom of that room's section in the
  Rooms tab ("Notes (n)", with a box to add one). The log follows changes on disk (an AI writing a note shows up).

### Structured editing (3.4)

- **Forms instead of code.** In the Rooms tab, each reaction has **Edit…** (verb, targets, condition, commands as a
  form) and the list ends with **+ Reaction**; the room sheet has **Stage…** (layers with their image, role and
  condition; lights; particle emitters; the transition; the logic of walk links) and the **painter** (game, DOM or
  canvas). The forms come from one table of every condition and command (`src/studio/schema.ts`, checked against the
  types at compile time): a new command without a form does not compile. What has no simple field (a minigame's params,
  an animation's frame events) is a JSON box.
- **Layers, masks, zones (4.1.11).** Under the room sheet, the stage editor (`src/studio/rooms-stage.ts`) shows the
  backdrop with the occlusion masks (red), the walk zones (green) and the links between zones: each layer's depth,
  parallax, opacity and blend are fields; **Draw a mask** and **Draw a zone** take the corners clicked on the backdrop,
  then **Close the polygon** (one that closes no surface is not kept); **Link them** joins two zones by a stairs,
  ladder, jump, teleport or walk link placed by two clicks. **Save stage** writes this geometry over the room's layout
  once the placement view is saved; it stays off while a mask closes no surface or a zone has no link, which the
  validator refuses too.
- **Preview, then apply.** "Preview the change" shows the diff the server would write (a dry run); "Apply" writes it
  as code in the file's style (`set_value`, through the TypeScript parser: comments and the rest of the file stay), then
  the game is reloaded and validated: an edit that adds a validation error is taken back and the errors are shown.
- **Undo / Redo** in the header (Ctrl/Cmd+Z, with Shift to redo), over every write of the session (texts, values,
  layouts, voices). An undo refuses when the file changed since (an AI, an editor, git). Writes are atomic (a
  temporary file renamed).
- **Geometry in the view.** The placement editor's **Walk zones** folder makes the single walk polygon a zone, adds
  zones (holes, zoom) and links between them (mode, duration, one way); its **Stage** folder sets each layer's depth,
  parallax, blend and opacity, draws occluders as polygons (depth, feather, invert) and places lights and particle
  areas. Handles: drag; double-click a zone edge to add a vertex; Alt-click one to remove it.
- **Timeline.** Double-click a bar to change a wait's, an animation's or a motion's duration.
- **Play.** The painter of every room (as the game says, DOM or canvas) and how fast it draws (frames per second, the
  canvas painter's repaints).
- **Voices.** The voice production table per language (`npm run voices`): status, actor and note per line, saved at
  once; Export CSV for the actors.
- **Music** (3.5). The game's scores through its own music director: play one, hear each state's mix on the next bar,
  mute or solo a stem, the bar and beat shown as it plays. Nothing is written: the states are content in `game.ts`.

`npm run e2e:studio -- <studio url>` (a CI gate) creates a stage with the form, checks the diff, applies, sees it in
the game, and undoes it.

## The API (`/__studio/api/*`, JSON, dev server only)
All paths are relative to the current game (`GAME`). Errors return `{ error }` with a 4xx/5xx status (400 bad input,
404 unknown room / path / endpoint, 405 wrong method, 409 already exists, 422 no `defineRoom({...})` in the file,
500 the game does not load or an edit would break the file, 501 screenshot unavailable).

| Method, path | Body → Result |
|---|---|
| GET `game` | `{ id, title, hero, rooms: [{ id, name, decor }], characters: { id: { name, color, portrait } }, items: { id: { name, icon } }, verbs, checkpoints, images, sfx }` (from the game module; `images` is the asset manifest, id → `[w, h]`, thumbnails at `/assets/img/<id>.webp`; `sfx` the ids of `audio.sfx`) |
| GET `room/:id` | `{ def: RoomDef, layout: Layout, texts: TextRef[], file }` — `TextRef = { path, value, file, line, kind, who? }` for every text literal of the room file (see "Texts" below) |
| PUT `room/:id/layout` | `Layout` → writes `layout/<id>.json`; `{ ok }` |
| PUT `room/:id/text` | `{ path, value }` → replaces that string literal in `rooms/<id>.ts`; `value: null` deletes a list line (or a whole `look.<id>`); a path ending in `[+]` appends a line (`look.piano[+]`, `hints[2].lines[+]`, `on[3].do[+]`); result `{ ok, line, changed }` (`changed: false` when the value was already there: nothing is written) |
| POST `room/:id/add` | `{ kind: 'prop' \| 'hotspot' \| 'actor', id, name?, img?, char?, at: [x, y], look? }` → inserts the entry in the room file (the section is created if absent), the optional first look line, and a place in the layout (prop: foot at `at`, height 60; hotspot: 60 × 60 box centred on `at`; actor: feet at `at`); `{ ok, line, changed }`. `name` is required for props and hotspots |
| GET/PUT `storyboard` | `storyboard.json` (`{ boards: [] }` if absent). PUT needs `{ boards: [...] }`, returns `{ ok, changed }`: an unchanged storyboard is not rewritten, a changed one is written compactly (what fits on 120 columns stays on one line) |
| POST `storyboard/markdown` | → writes `games/<id>/storyboard.md` from the saved `storyboard.json` (same text as `npm run page:storyboard -- --md`); `{ ok, file, bytes, boards, panels }`; 404 without a `storyboard.json` |
| GET `diff/<from>..<to>` | 4.2.3: what changed between two revisions, by what the game names: `{ files: [{ path, change: added\|removed\|changed, ids?: { added, removed, changed: [{ id, fields }] }, values?: { added, removed, changed }, opaque?, cut? }] }` (2,000 revisions at most; the Check tab's "Changes between revisions") |
| GET `groupings`, PUT `groupings`, GET `map` | 4.2.3: the groupings file `{ groupings: [{ id, kind: chapter\|puzzle\|character, title, refs }] }` (checked: ids unique and lowercase, kinds known, references without spaces; 500 at most of each), and the map derived from it and the IR: `{ groupings: [{ …, refs: [{ ref, kind, at? }] }], ungrouped: { <kind>: [refs] } }` |
| GET `notes`, POST `notes` | GET → `{ entries: Note[] }`; POST `{ about?, author?, text }` → the new `Note = { id, about, author, text, at, edited? }` (author defaults to `you`, `at` is an ISO date), appended to `notes.json` (created on first write) |
| PUT `notes/:id` | `{ text, about? }` → the updated `Note` (text trimmed, `edited` set to now; `at`, `author` and the order unchanged); 400 empty text, 404 unknown id |
| DELETE `notes/:id` | → `{ ok }`, the note removed from `notes.json`; 404 unknown id |
| POST `validate` | → `{ ok, errors: string[], warnings: string[], ms }` |
| POST `coverage` | → `{ coverage, markdown, ms }`: the saved storyboard checked against the content (`src/engine/tools/coverage.ts`: per board and panel, each room, speaker, line, topic, sound and action ok / partial / missing / unknown) |
| POST `playtests` | → `{ report, markdown, files, ms }`: the playtests of `games/<id>/playtests/` replayed and summed up (`src/engine/tools/playtests.ts`) |
| POST `lint` | `{ prove? }` → `{ lint, markdown, mode, ms }`: the content lint after a solver run (`src/engine/tools/lint.ts`; `prove`: the exhaustive search first) |
| POST `solve` | `{ from?: checkpoint }` → `{ finished, states, truncated, path, roomsReached, unlockedReached, flagsReached, itemsNeverUsed, unusedItems, deadEnds: [{ room, inventory, path }], errors, from, ms, profile }` (400 for an unknown checkpoint); `profile` is the `SolveProfile` of `src/engine/tools/solve.ts` |
| POST `screenshot` | `{ room, checkpoint? }` → `{ file, url }`: a PNG of the room (editor overlays hidden) under `.cache/studio/<game>-<room>[-<checkpoint>].png`, served at `url` (`GET screenshots/<name>.png`). 501 `{ unavailable: true, reason, error }` if Playwright or its Chromium is missing |
| GET `assets` | `{ sheets: [{ id, kind: 'sprites' \| 'furniture' \| 'talk', character?, grid, promptKind?, cells: [{ id, file, w, h, used, ids, prepared, asset?, backups, mtime, missing? }] }], decors: [{ name, rooms, …cell }], sounds: { music, sfx: [{ id, kind, file, used, prepared, asset?, backups }] }, missing, unprepared, prompts: { sheets: [{ id, kind, markdown, missingMarkdown? }], style } }`: see "Assets tab" |
| GET `assets/file/<path>` | a source file of `art/` or `audio/` (path relative to the game folder; anything else is 404) |
| GET `assets/prompts?missing=1` | `{ markdown }`: the whole `npm run prompts [-- --missing]` document |
| POST `assets/sheet` | `{ sheetId, grid?: '6x4', cells?: 'r1c1,r2c3', data }` (base64 or data URL) → saves `private/sheets/<sheetId>-<time>.<ext>` and cuts it with `tools/cut-sheet.py` into `art/<sheetId>/`; `{ ok, file, output, written, backups, cells }`. 409 `{ conflicts }` when cells of that sheet exist and `cells` does not name them; a named cell that exists is kept as `<cell>_v<N>.png` first |
| POST `assets/cell` | `{ sheetId, cell, data, key?: 'auto' \| 'always' \| 'never' }` → replaces (or adds) `art/<sheetId>/<cell>.png`; the old file becomes `<cell>_v<N>.png`; a flat background is keyed with the cutter's rule; `{ ok, file, backup?, keyed: 'keyed' \| 'kept' \| 'opaque', cell }` |
| POST `assets/decor` | `{ name, data }` (PNG or JPEG) → `art/decor/<name>.<ext>`, the old picture kept as `<name>_v<N>.<ext>`; `{ ok, file, backup? }` |
| POST `assets/sound` | `{ kind: 'music' \| 'sfx', file, data }` → `audio/<kind>/<file>` (any format ffmpeg reads), the old file kept as a backup; `{ ok, file, backup? }` |
| POST `assets/prepare` | runs `npm run assets` → `{ ok, code, output }`; with `?stream=1`, the output as plain text while it runs, ending with `[exit <code>]` |
| PUT `room/:id/value` | `{ path, value, dry? }` → `{ ok, line, changed, diff, dry? }`: a structured value written as code at `path` (3.4; `value` absent removes it); 422 `{ error, errors, diff }` when the write would add validation errors (since 4.2.1 nothing is written: the guard judges the game as it would be) |
| PUT `room/@game/value` | the same for the game file's `defineGame({...})` (4.1.12), objectives only: `objectives`, `objectives.<id>` or one of its fields; any other path is 400 |
| GET `ir` | the game's IR (4.1.12, `docs/en/DSL.md`): its logic as data with the `file:line` of each id (`provenance`) and the trusted extensions' hash; the same JSON as `npm run ir -- --json` |
| POST `undo`, POST `redo`, GET `history` | → `{ ok, file, what }` or `{ ok: false, reason }`; 409 when the file changed since; `history` → `{ undo: [what], redo: [what] }` |
| GET `voices[/:lang]`, PUT `voices/:lang/:id`, GET `voices/:lang/csv` | the voice table `{ lang, langs, statuses, rows }`; `{ status?, note?, actor? }` → `{ ok }` (into `voices.json`); `{ lang, csv }` |
| GET `events` | server-sent events: `{ type: 'hello', game }` on connection, then `{ type: 'changed', file }` when a file of the game folder changes on disk (`file` relative to it, e.g. `rooms/house.ts`; dotfiles and `private/` are ignored; 150 ms debounce per file) |

The same operations exist as plain functions in `studio-server/src/ops/core.ts`, used by the Vite plugin, by the tests and by
the MCP server: `gameInfo()`, `getRoom(id)`, `setLayout(id, layout)`, `setText(id, path, value)`, `addEntity(id, e)`,
`getStoryboard()`, `setStoryboard(sb)`, `exportStoryboardMarkdown()`, `getNotes()`, `addNote(n)`, `editNote(id, { text, about? })`,
`deleteNote(id)`, `validate()`, `solve(from?)`,
`screenshot(room, checkpoint, devServerUrl)` for the current game, and `createStudio({ gameDir, root, importFresh })`
for any other game folder. They never exit the process: errors are thrown as `StudioError` (with `status`). The game is
re-imported on every call so that edits on disk are seen: by default with tsx's scoped loader (fast, in process);
`importInChild` (a child node + tsx process) is the fallback where in-process imports are cached, e.g. inside Vitest.
Writes are serialized. Since 4.2.1 each write is one operation of the game's journal
(`studio-server/src/ops/journal.ts`, kept in `.cache/studio-journal/`): every file it touches is written at once or
not at all, durably (fsync), and an operation a crash interrupted is finished when the Studio opens again. Every write
whose files the validator reads is guarded on the game as it would be after it (422 when it adds validation errors;
text edits included since 4.2.1). Adding a prop, hotspot or actor writes the room and its layout as one operation,
undone in one step. A change made outside the Studio (an editor, an agent, git) is recorded before the next write
touches that file, and a file another process rewrote while an edit was being prepared is a 409. Shared types are in
`tools/studio/types.ts`; the storyboard schema, its normalisation and the
Markdown export are in `tools/pages/storyboard-data.ts` (pure, shared by the page generator, the core and the UI).

### Texts
A string literal under `defineRoom({...})` is a text, addressed by its JSON path, when the path ends in `name`, `topic`,
`toast`, `lines[n]`, `say[1]`, `shout[1]`, `guide.say`, `choice[n].text`, `look.<id>` or `look.<id>[n]`, or when it is a
bare string in a command list (`do`, `once`, `then`, `else`, `cutscene`, `after`, `onEnter`, or a branch of `nth`,
`cycle`, `random`, `parallel`): those are hero lines. `kind` says which (`name`, `look`, `say`, `hero`, `topic`, `hint`,
`toast`, `choice`, `guide`); `who` is the speaker of a `say`. Ids, image refs, flags and conditions are never texts, and
the API refuses to edit them. A replacement touches only the literal (same quote style, escaped as needed); an append
follows the list's layout (inline, or one item per line with the same indentation); a deletion removes the item and
its separator. Paths of the following items shift after an append or a deletion: read the room again.

### Serving
The Studio page is `studio.html` at the repository root (entry `src/studio/main.ts`). Any dev server serves it at
`/__studio/` (`npm run dev` too); `npm run studio` also opens it. A production build leaves it out unless `STUDIO=1` (see "Demo mode").
The Rooms tab shows `/?edit=<room>&at=<checkpoint>` in an iframe and talks to the editor through `postMessage`
(see TOOLS.md, "The placement editor"). The Studio page ignores Vite's full reloads caused by game files (the engine
view reloads, the Studio keeps what you are typing and follows the change through `events`).

## Assets tab
The tab lists everything under `games/<id>/art/` and `audio/` against what the game references (`tools/refs.ts`), with
the prompts of `npm run prompts` (`tools/prompts.ts`, docs/en/PROMPTS.md). Server side: `tools/studio/assets.ts`, mounted
at `/__studio/api/assets` by the plugin; UI: `src/studio/assets.ts` (the tab) with its model, IO and views beside it
(`assets-model.ts`, `assets-io.ts`, `assets-view.ts`, `assets-sheets.ts`, `assets-decors.ts`, `assets-sounds.ts`;
the Storyboard and Rooms tabs are laid out the same way since 4.1.8, every file under 800 lines).

- **Tree** (left): Characters (one entry per sprite sheet, named after the character whose poses it holds), Objects,
  Backgrounds, Furniture, Talk kits, Sounds (music, sound effects). Badges: red = cells the game references without a
  file, orange = used but not prepared (or older than their source), grey = cut but unused.
- **Sheet** (center): the cells as thumbnails with their id and what uses them (`walk`, `portrait`, `items.key`,
  `house.props.pantry`…); filters All / Used / Unused / Missing. On top, the **Prompt** panel: the sheet's section of the
  prompts with **Copy prompt** (copies the fenced block for the image model), **Copy prompt for missing cells only** when
  some are missing, and the shared Style block (folded) with its own Copy. **Upload generated sheet…** sends the image
  to `POST assets/sheet` with the sheet id and grid; if cells exist already, a dialog lists them, each with a "recut"
  box (unticked: kept; only the new cells are cut), then the cut result is shown. **Upload sheet into a new sheet id…**
  (toolbar) does the same for a sheet that has no folder yet.
- **Cell** (right): large preview, file, size, image ids, prepared or not, where it is used (with "Open room"),
  **Replace…** (keying: a flat background is keyed by default, or always, or never), and the backups.
- **Backgrounds**: the decor with the room's hotspots, props (foot and height), actors and walk area drawn over it, and
  the dashed floor band the prompt asks to keep empty; Replace… and "+ background". **Sounds**: a player per file,
  where it is used, Replace… (same extension) and Add sound….
- **Prepare assets (npm run assets)** (toolbar) runs the pipeline with its output live in a drawer; the count next to
  it is what it would process. Afterwards the Rooms view reloads. A replaced cell shows in the game once prepared.
- Nothing is ever deleted, and a validated cell is never recut by accident: overwriting needs the cell named, and the
  old file is kept as `<name>_v<N>`. Backups are not cells (the listing and the prompts ignore them).
- **Demo mode**: the listing comes from the snapshot (`assets` in `snapshot.json`), the thumbnails and sounds from the
  prepared files of `public/assets` (unused cells have no preview); uploads and Prepare are hidden.
- **Hosted Studio** (Studio Server, 4.2.3): the same tab, served by `studio-server/src/server/hosted-assets.ts` under
  `/api/assets`. Uploads are bounded (10 MiB; PNG, JPEG or WebP images, Ogg, MP3 or WAV sounds, read from their
  bytes); the cutting, the keying and **Prepare assets (on the server)** are jobs of the processing worker, under the
  project's exclusive lease, shown in a small panel with a **Cancel** button (a job cancelled before its write leaves
  nothing). The uploaded sheet itself is not kept there. See docs/en/STUDIO-SERVER.md.

## Demo mode
The Studio also runs without any server, on a static host: https://wanoo.github.io/web-scumm/studio.html is the demo
game's Studio, built by the CI. Same UI, same engine view and placement editor; the edits stay in the browser.

- **Build**: `npm run build:studio-demo` (= `STUDIO=1 VITE_STUDIO_DEMO=1 vite build`); the CI sets both variables on its
  `npm run build`. With `STUDIO=1`, the build first writes `public/studio-demo/snapshot.json` (`tools/studio/snapshot.ts`,
  also `npm run studio-snapshot`; gitignored): `{ game, rooms: { <id>: { def, layout, texts, file } }, storyboard, notes,
  docs: { CONTENT_GUIDE }, assets }`, everything the Studio reads from the API. Without `STUDIO=1`, neither `studio.html` nor
  the snapshot reach `dist/`. The Studio's and the dev tools' code goes to `dist/assets/tools/`, outside the service
  worker's precache.
- **Backend**: `src/studio/api.ts` defines the `Api` interface; the dev server's one is the default. The browser one
  (`src/studio/api-browser.ts`) is used when the build says so (`VITE_STUDIO_DEMO=1`) or when `GET /__studio/api/game`
  answers 404 (or a page instead of JSON). It loads the snapshot and replays the edits kept in `localStorage` under
  `web-scumm.studio-demo.<game>`: a list of patches `{ kind: 'text', room, path, value }` (replace, `[+]` append, `null`
  delete, with the same path shifts as the room file), `{ kind: 'layout', room, layout }`, `{ kind: 'entity', room,
  entity }` (Add prop / hotspot / actor), `{ kind: 'storyboard', storyboard }`, `{ kind: 'note', note }`, `{ kind:
  'note-edit', id, text, about?, edited }`, `{ kind: 'note-delete', id }`. A later layout or storyboard replaces the
  earlier one; editing or deleting a note added in the demo rewrites its `note` patch.
- **Checks**: Validate and Solve run in the page (`src/engine/tools/validate.ts`, `solve.ts`) on the real game module
  with the edits applied: layouts, added entities, and every text whose path reaches a string of the compiled room
  (look lines, names, hints, topics, lines of `on`/`talk`/`onEnter`…). A text the room builds with code (a shared
  constant, a helper) is only validated on the server version. Screenshots need the dev server: the panel is hidden.
  Export Markdown downloads `storyboard.md`. No events (nothing on disk to watch).
- **Engine view**: in a demo build the dev tools also load with `?edit` / `?dev` (and only then: the player's game is
  the same). They apply the same patches to the game and the layouts at start. Save layout in the editor posts the
  layout to the Studio around it (`postMessage`, message `saved` with `layout`), which keeps it as a `layout` patch;
  the editor opened alone writes the patch to `localStorage` itself. On the dev server, the editor writes
  `layout/<room>.json` through the Studio's API (`PUT /__studio/api/room/<id>/layout`, one guarded operation of the
  journal since 4.2.1); it falls back to the patch only when that API does not exist.
- **Banner**: "Demo: your edits stay in this browser", **Download patch** (`studio-patch-<game>.json`: `{ format:
  'web-scumm-studio-patch', version, game, created, patches }`) and **Reset demo** (drops every edit).
- **Apply**: `npm run studio-apply patch.json` replays a downloaded patch on your copy through the core (`setText`,
  `setLayout`, `addEntity`, `setStoryboard`, `addNote`, `editNote`, `deleteNote`, in order) and prints one line per
  patch and a summary; a patch that fails is reported, the others still apply (exit code 1 if any failed).
  `GAME=<id>` or `GAME_DIR=<folder>` pick the game, as for every tool.

## Assistant
The **Assistant** button in the top bar (or the `a` key when no field has focus) opens a drawer on the right where you
ask a chat model to help complete the game. It works with any provider, and it has the same tools as the MCP server
(`list_rooms`, `get_room`, `set_text`, `add_entity`, `set_layout`, `get_storyboard`, `set_storyboard`, `get_notes`,
`add_note`, `validate`, `solve`, `screenshot`, `read_doc`, `run_tests`, `asset_prompts`). One registry,
`tools/studio/tools.ts`, defines them (name, description, zod schema, handler over a backend), and both the MCP server
and the Assistant use it.

- **How it works.** The page posts the conversation to `POST /__studio/api/assistant/chat` with `{ provider: { kind,
  baseUrl, model, apiKey? }, messages: [{ role, content }], context }`. The relay (`tools/studio/assistant.ts`, loop in
  `tools/studio/assistant-loop.ts`) builds a system prompt from `AGENTS.md`, the game (rooms, characters, items,
  checkpoints) and the current selection with its texts. It calls the model, runs the tool calls on the game files
  (at most 12 rounds), and streams server-sent events back: `{ type: 'text', delta }`, `{ type: 'tool_call', id, name,
  args }`, `{ type: 'tool_result', id, name, result, isError? }` (result cut at 4 KB), `{ type: 'error', message }`,
  then `{ type: 'done', usage?, wrote?, stopped? }`. The model is told to ask before destructive changes and to keep the
  game's voice. **Stop** aborts the request, and the server aborts the provider call too.
- **Context.** The composer shows what the request is about: `house › pantry (prop)` (the room and the entity selected
  in Rooms), `storyboard › <board> › <panel> (panel)` (the selected panel, as edited, even unsaved), or the whole game.
  The quick actions use it: *Write 3 look lines*, *Suggest a puzzle for this room*, *Write the talk topics for this
  character*, *Find what's missing (validate + solve)*, *Draft the hint chain*, *Generate the art prompts for this sheet*.
- **The conversation.** Answers are rendered as light markdown (paragraphs, lists, code). Each tool call is a chip you
  can unfold to see its arguments and result. **New chat** starts over. Earlier turns are sent back as text only.
  After a turn that wrote something, the Studio reloads the room, the storyboard (a banner when it has unsaved edits)
  or the notes, and runs Check. The file watcher shows the same changes.
- **Providers** (gear icon). *OpenAI* (`https://api.openai.com`), *Anthropic* (`https://api.anthropic.com`, default
  model `claude-sonnet-5`), *Ollama* (`http://localhost:11434`, `llama3.1`, no key; pick a model that supports tools),
  *Mistral* (`https://api.mistral.ai`), or *Custom*: any OpenAI-compatible base URL. Two wire formats, no SDK:
  OpenAI-compatible `POST <base>/v1/chat/completions` with `tools` and `stream: true` (OpenAI, Mistral, Ollama, most
  others), and Anthropic's `POST <base>/v1/messages` with `tools`, `x-api-key` and `anthropic-version: 2023-06-01`.
  Streaming responses are read as server-sent events. A provider that answers with plain JSON works too.
- **Key safety.** The key is stored in this browser's `localStorage` only (the settings show a warning) and sent with
  each request. The relay keeps it in memory for that request: it is never written to disk, never logged, and removed
  from error messages. Use a key with a spending limit; "Forget the key" removes it.
- **No key: tasks for an MCP agent.** Without a key (and not on Ollama), the composer offers **Send as a task to the AI
  agent**. `POST /__studio/api/assistant/task` `{ about, text }` appends a note with `author: "you"` and `task: true`
  to `notes.json`, about the current selection. An agent connected through MCP (`docs/en/MCP.md`) reads it with
  `get_notes` and does the work, and the Studio shows its edits live. The Notes tab tags these notes "task".
- **Demo mode.** There is no relay on a static host: the page runs the same loop itself, with the tools on the browser
  backend (edits kept as demo patches; `screenshot`, `run_tests` and `asset_prompts` are not available, and `read_doc`
  only has CONTENT_GUIDE). The browser calls the provider directly. Anthropic gets its
  `anthropic-dangerous-direct-browser-access` header. OpenAI refuses browser calls from unknown origins for some keys,
  and the error says so. Use Ollama on your machine (`OLLAMA_ORIGINS=<the page's origin> ollama serve`) or the local
  Studio (`npm run studio`), whose server relays the call. Tasks go into the demo's notes (and its patch).

## Any AI, not one AI
- `AGENTS.md` at the repo root is the vendor-neutral operating manual (`CLAUDE.md` points to it).
- `npm run mcp` starts a Model Context Protocol server (stdio) exposing the API above as tools: `list_rooms`, `get_room`,
  `set_layout`, `set_text`, `add_entity`, `get_storyboard`, `set_storyboard`, `get_notes`, `add_note`, `validate`,
  `solve`, `screenshot`. Claude Code, Cursor, Codex, Gemini CLI, or a hand-written agent connect to it the same way
  (`docs/en/MCP.md` has the two-line config for each).
- An AI without MCP still works: it edits the files, the Studio reloads (file watcher), the human sees the result,
  answers in Notes or in the Storyboard, and the AI reads `notes.json` back. Git carries the history.
