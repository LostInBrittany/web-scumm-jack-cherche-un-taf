# Studio API

The JSON API the Studio's page talks to: read the game, edit a room, run the checks. Each route below has its own
section; link to it as `studio.api.md#put-room-id-layout` (the method and the path in lowercase, `-` between words).

<a name="overview"></a>

## Overview

- **Where it lives.** The dev server (`npm run dev` or `npm run studio`, in the engine repository or in a created
  project) serves it under `/__studio/api/`. The Studio Server (4.2.1) serves the same table of routes under `/api/`,
  and names that base in a meta tag of the page it serves ([`src/studio/api-base.ts`](../../src/studio/api-base.ts),
  [`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts)). One table,
  [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts), so both answer alike; the routes marked
  "dev server only" below exist on the dev server alone.
- **What a path is relative to.** Every path is relative to the current game (`GAME`, see
  [environment variables](reference.environment-variables.md)).
- **Bodies.** A `PUT`, `POST` or `DELETE` body is a JSON object (`the body must be a JSON object` otherwise, 400); a
  `GET` takes none. The answer is JSON (`cache-control: no-store`), except the change feed, the screenshots, the
  Assets files and the Assistant's stream.
- **On the Studio Server**, a write must carry the header `x-studio-request: 1` (the Studio's page sends it on every
  request): with `Origin` and a JSON body, it is what no other site's page can send without a preflight. The session,
  the roles and the spans held by others apply there too (403, 423).
- **Errors.** A refusal answers `{ "error": "<message>" }`, sometimes with more fields, and a 4xx or 5xx status: 400
  bad input, 404 unknown room, path or endpoint (`no such endpoint: <path>`), 405 wrong method
  (`method <M> not allowed on <path>`), 409 already exists or changed since, 422 the write would add validation errors
  (or no `defineRoom({...})` in the file), 423 a span another member holds (shared Studio), 500 the game does not load
  or an edit would break the file, 501 unavailable here (a screenshot without Playwright, a capture on a hosted
  Studio). Every status and message is listed in the [error register](reference.error-codes.md#studio).

<a name="core-functions"></a>

### The same operations as functions

The routes call the plain functions of
[`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts), which the Vite plugin, the tests and the MCP
server use too: `gameInfo()`, `getRoom(id)`, `setLayout(id, layout)`, `setText(id, path, value)`, `addEntity(id, e)`,
`getStoryboard()`, `setStoryboard(sb)`, `exportStoryboardMarkdown()`, `getNotes()`, `addNote(n)`,
`editNote(id, { text, about? })`, `deleteNote(id)`, `validate()`, `solve(from?)`,
`screenshot(room, checkpoint, devServerUrl)` for the current game, and `createStudio({ gameDir, root, importFresh })`
for any other game folder.

- They never exit the process: an error is thrown as a `StudioError`, with its `status`.
- The game is imported again on every call, so an edit on disk is seen: by default with tsx's scoped loader (fast, in
  the same process); `importInChild` (a child `node` + tsx process) is the fallback where in-process imports are
  cached, inside Vitest for instance.
- Writes are serialized. Since 4.2.1 each write is one operation of the game's journal
  ([`studio-server/src/ops/journal.ts`](../../studio-server/src/ops/journal.ts), kept in `.cache/studio-journal/`):
  every file it touches is written at once or not at all, durably (fsync), and an operation a crash interrupted is
  finished when the Studio opens again.
- Every write whose files the validator reads is guarded on the game as it would be after it: 422 when it adds
  validation errors (text edits included since 4.2.1).
- Adding a prop, a hotspot or an actor writes the room and its layout as one operation, undone in one step.
- A change made outside the Studio (an editor, an agent, git) is recorded before the next write touches that file; a
  file another process rewrote while an edit was being prepared is a 409.
- The shared types are in [`tools/studio/types.ts`](../../tools/studio/types.ts); the storyboard's schema, its
  normalisation and the Markdown export are in
  [`tools/pages/storyboard-data.ts`](../../tools/pages/storyboard-data.ts) (pure, shared by the page generator, the
  core and the page).

> [!LIMIT id=hosted-only-routes]
> This page covers the table both servers share and the dev server's own routes. The Studio Server's own routes
> (sessions and login, members and invitations, comments, builds and previews, its Assets routes, the journal's
> cursor `/api/ops`, the engine upgrade, the probes, `/mcp`) are not described here: see the hosted Studio's pages.

<a name="texts"></a>

### Texts

A string literal under `defineRoom({...})` is a text, addressed by its JSON path, when the path ends in `name`,
`topic`, `toast`, `lines[n]`, `say[1]`, `shout[1]`, `guide.say`, `choice[n].text`, `look.<id>` or `look.<id>[n]`, or
when it is a bare string in a command list (`do`, `once`, `then`, `else`, `cutscene`, `after`, `onEnter`, or a branch
of `nth`, `cycle`, `random`, `parallel`): those are hero lines. `kind` says which (`name`, `look`, `say`, `hero`,
`topic`, `hint`, `toast`, `choice`, `guide`); `who` is the speaker of a `say`.

- Ids, image refs, flags and conditions are never texts, and the API refuses to edit them.
- A replacement touches only the literal (the same quote style, escaped as needed).
- An append follows the list's layout (inline, or one item per line with the same indentation).
- A deletion removes the item and its separator.
- The paths of the following items shift after an append or a deletion: read the room again.

<a name="serving"></a>

### Serving

The Studio page is `studio.html` at the root of the engine (entry `src/studio/main.ts`). Any dev server serves it at
`/__studio/` (`npm run dev` too); `npm run studio` also opens it. A production build leaves it out unless `STUDIO=1`
(the demo mode). The Rooms tab shows `/?edit=<room>&at=<checkpoint>` in an iframe and talks to the editor through
`postMessage` ([placement editor](reference.dev-url-parameters.md#edit)). The Studio page ignores Vite's full reloads
caused by the game's files: the engine view reloads, the Studio keeps what you are typing and follows the change
through [`GET /events`](#get-events).

<!-- generated:begin -->

<a name="game"></a>

## The game and its rooms

Read the game, read a room, and write a room's layout, texts, entities and structured values. Every write is one operation of the game's journal, guarded on the game as it would be after it.

<a name="get-game"></a>

### `GET /game`

- Answer: `{ id, title, hero, rooms: [{ id, name, decor }], characters: { id: { name, color, portrait } }, items: { id: { name, icon } }, verbs, checkpoints, images, sfx }`, read from the game module (with its `objectives` since 4.1.12). `images` is the asset manifest, id → `[w, h]`, thumbnails at `/assets/img/<id>.webp`; `sfx` the ids of `audio.sfx`.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="get-room-id"></a>

### `GET /room/:id`

- Answer: `{ def: RoomDef, layout: Layout, texts: TextRef[], file }`, with `TextRef = { path, value, file, line, kind, who? }` for every text literal of the room file (see [Texts](#texts)). 404 for an unknown room.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="put-room-id-layout"></a>

### `PUT /room/:id/layout`

- Body: the whole `Layout` object.
- Answer: `{ ok }`: `layout/<id>.json` written.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="put-room-id-text"></a>

### `PUT /room/:id/text`

- Body: `{ path, value }`, `value` a string or `null`.
- Answer: `{ ok, line, changed }`: the string literal at `path` replaced in `rooms/<id>.ts`; `changed: false` when the value was already there (nothing is written). `value: null` deletes a list line (or a whole `look.<id>`); a path ending in `[+]` appends a line (`look.piano[+]`, `hints[2].lines[+]`, `on[3].do[+]`). A path that is not a text (an id, an image, a flag, a condition) is refused; `value` that is neither a string nor null is a 400. Guarded since 4.2.1: 422 when the edit would add validation errors.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="post-room-id-add"></a>

### `POST /room/:id/add`

- Body: `{ kind: 'prop' | 'hotspot' | 'actor', id, name?, img?, char?, at: [x, y], look? }`.
- Answer: `{ ok, line, changed }`: the entry inserted in the room file (its section created if absent), the optional first look line, and a place in the layout (prop: foot at `at`, height 60; hotspot: a 60 × 60 box centred on `at`; actor: feet at `at`), as one operation undone in one step. `name` is required for props and hotspots; 409 when the id exists; `kind`, `id` and `at` are checked first (`` `kind` must be prop, hotspot or actor ``, `` `at` must be [x, y] ``).
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="put-room-id-value"></a>

### `PUT /room/:id/value`

- Body: `{ path, value?, dry? }`.
- Answer: `{ ok, line, changed, diff, dry? }`: a structured value (a reaction `on[3]` or `on[<length>]` to add one, a condition `on[3].if`, a command list `on[3].do` or `onEnter`, the room's `stage` or `renderer`) written as code at `path` in the file's style; `value` absent removes the path; `dry: true` returns the diff only. 422 `{ error, errors, diff }` when the write would add validation errors: since 4.2.1 nothing is written, the guard judges the game as it would be.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Since: 3.4.

<a name="put-room-game-value"></a>

### `PUT /room/@game/value`

- Body: `{ path, value?, dry? }`.
- Answer: The same for the game file's `defineGame({...})`, objectives only: `objectives`, `objectives.<id>` (`{ title, done, optional?, parent? }`) or one of its fields; any other path is a 400. Validated the same way, so an objective whose `done` can never hold is refused.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Since: 4.1.12.

<a name="history"></a>

## Revisions and undo

What changed between two revisions of the journal, the rooms it names drawn at both, and the undo and redo of the Studio's own edits.

<a name="get-diff-from-to"></a>

### `GET /diff/:from..:to`

- Answer: What changed between two revisions of the journal, by what the game names: `{ files: [{ path, change: added|removed|changed, ids?: { added, removed, changed: [{ id, fields }] }, values?: { added, removed, changed }, opaque?, cut? }] }`; 2,000 revisions at most. The Check tab's "Changes between revisions". Each revision is 1 to 12 digits.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Since: 4.2.3.

<a name="get-diff-from-to-captures"></a>

### `GET /diff/:from..:to/captures`

- Answer: Local Studio only: each room the diff names, drawn at both revisions: `{ from, to, size: [960, 600], rooms: [{ room, why, before, after, box?, same? }], cut?, ms }`. A side is `{ file, url }` (a PNG data URL and its file under `.cache/studio/`) or `{ missing }` (why it is not drawn: the revision does not build, the room is not there); `box` `[x, y, w, h]` where they differ, `same` when nowhere. 501 `{ unavailable, reason }` on a hosted Studio or without Playwright.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Since: 4.4.0.

<a name="post-undo"></a>

### `POST /undo`

- Answer: `{ ok, file, what }`, or `{ ok: false, reason }` when there is nothing to undo; 409 when one of the operation's files changed since (an AI, an editor, git, another author). Itself one operation of the journal. On a shared Studio (4.2.2) each member undoes their own latest operation, and a span another member holds is a 423.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Since: 3.4.

<a name="post-redo"></a>

### `POST /redo`

- Answer: `{ ok, file, what }`, or `{ ok: false, reason }` when there is nothing to redo; 409 when one of the operation's files changed since (an AI, an editor, git, another author). Itself one operation of the journal. On a shared Studio (4.2.2) each member redoes their own latest operation, and a span another member holds is a 423.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Since: 3.4.

<a name="get-history"></a>

### `GET /history`

- Answer: `{ undo: [what], redo: [what] }`: what an undo and a redo would take back, latest last.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Since: 3.4.

<a name="story"></a>

## Storyboard, scenario map and notes

The storyboard (`storyboard.json`), the groupings of the scenario map (`groupings.json`) and the shared notes (`notes.json`) of the game folder.

<a name="get-storyboard"></a>

### `GET /storyboard`

- Answer: `storyboard.json`, `{ boards: [] }` when it is absent.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="put-storyboard"></a>

### `PUT /storyboard`

- Body: `{ boards: [...] }`.
- Answer: `{ ok, changed }`: an unchanged storyboard is not rewritten, a changed one is written compactly (what fits on 120 columns stays on one line).
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="post-storyboard-markdown"></a>

### `POST /storyboard/markdown`

- Answer: `{ ok, file, bytes, boards, panels }`: `games/<id>/storyboard.md` written from the saved `storyboard.json` (the same text as `npm run page:storyboard -- --md`); 404 without a `storyboard.json`.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="get-groupings"></a>

### `GET /groupings`

- Answer: The groupings file, `{ groupings: [{ id, kind: chapter|puzzle|character, title, refs }] }`.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Since: 4.2.3.

<a name="put-groupings"></a>

### `PUT /groupings`

- Body: `{ groupings: [...] }`.
- Answer: Writes the groupings file, checked: ids unique and lowercase, kinds known, references without spaces, 500 at most of each.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Since: 4.2.3.

<a name="get-map"></a>

### `GET /map`

- Answer: The scenario map derived from the groupings and the IR: `{ groupings: [{ …, refs: [{ ref, kind, at? }] }], ungrouped: { <kind>: [refs] } }`.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Since: 4.2.3.

<a name="get-notes"></a>

### `GET /notes`

- Answer: `{ entries: Note[] }`, with `Note = { id, about, author, text, at, edited? }`.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="post-notes"></a>

### `POST /notes`

- Body: `{ about?, author?, text, task? }`.
- Answer: The new `Note`, appended to `notes.json` (created on first write); `author` defaults to `you`, `at` is an ISO date. `task: true` marks a request for an MCP-connected agent.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="put-notes-id"></a>

### `PUT /notes/:id`

- Body: `{ text, about? }`.
- Answer: The updated `Note`: text trimmed, `edited` set to now; `at`, `author` and the order unchanged. 400 for an empty text (or an `about` that is not a string), 404 for an unknown id.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="delete-notes-id"></a>

### `DELETE /notes/:id`

- Answer: `{ ok }`: the note removed from `notes.json`; 404 for an unknown id.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="checks"></a>

## Checks and views

The validator, the solver, the lint, the playtests, the coverage of the storyboard, the profiler, the world map, the puzzle graph and the game's IR: read-only, the game reloaded on each call. On the Studio Server, `validate`, `solve`, `lint` and `playtests` run on the processing worker.

<a name="post-validate"></a>

### `POST /validate`

- Answer: `{ ok, errors: string[], warnings: string[], ms }`.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="post-report"></a>

### `POST /report`

- Answer: The content profiler: `{ report, markdown, ms }`, what each room, item and character amounts to and what is thin (`src/engine/tools/report.ts`, the MCP tool `content_report`).
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="get-graph"></a>

### `GET /graph`

- Answer: The world map: `{ graph, svg, dot }`, the rooms and the ways between them (`src/engine/tools/graph.ts`, the MCP tool `world_graph`).
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="post-puzzle"></a>

### `POST /puzzle`

- Body: `{ id? }`.
- Answer: The puzzle graph: `{ graph, svg, dot, markdown, classes, id? }`, what every rule needs and changes; `markdown` is the overview, or with `id` the card of that item, flag or prop; `classes` says why the solver keeps each node (critical, world, visible or dead). The MCP tool `puzzle_graph`.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="post-coverage"></a>

### `POST /coverage`

- Answer: `{ coverage, markdown, ms }`: the saved storyboard checked against the content (`src/engine/tools/coverage.ts`: per board and panel, each room, speaker, line, topic, sound and action ok / partial / missing / unknown).
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="post-playtests"></a>

### `POST /playtests`

- Answer: `{ report, markdown, files, ms }`: the playtests of `games/<id>/playtests/` replayed and summed up (`src/engine/tools/playtests.ts`).
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="post-lint"></a>

### `POST /lint`

- Body: `{ prove? }`.
- Answer: `{ lint, markdown, mode, ms }`: the content lint after a solver run (`src/engine/tools/lint.ts`; `prove`: the exhaustive search first).
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="post-solve"></a>

### `POST /solve`

- Body: `{ from?: checkpoint, prove? }`.
- Answer: `{ finished, states, truncated, path, roomsReached, unlockedReached, flagsReached, itemsNeverUsed, unusedItems, deadEnds: [{ room, inventory, path }], errors, from, ms, profile }`; `profile` is the `SolveProfile` of `src/engine/tools/solve.ts`. 400 for an unknown checkpoint. 20,000 states at most; `prove` runs the exhaustive search instead of the witness. On the Studio Server it runs on the worker, under a time limit.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="get-ir"></a>

### `GET /ir`

- Answer: The game's IR ([DSL reference](create.dsl.md#game-as-data)): its logic as data with the `file:line` of each id (`provenance`) and the trusted extensions' hash; the same JSON as `npm run ir -- --json`.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Since: 4.1.12.

<a name="voices"></a>

## Voices and heroes

The voice table of each language (`voices.json`) and the hero × language matrix.

<a name="get-voices-lang"></a>

### `GET /voices[/:lang]`

- Answer: The voice table of a language (the game's own by default; an unknown language falls back to it): `{ lang, langs, statuses, rows }`.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Since: 3.4.

<a name="put-voices-lang-id"></a>

### `PUT /voices/:lang/:id`

- Body: `{ status?, note?, actor? }` (`null` counts as absent).
- Answer: `{ ok }`, the row written into `voices.json` (status `draft`, empty note and actor by default). The id is the line's, URL-encoded by the client: a clip of a line with switches is keyed `<id>~<flag>=<value>` (4.3.0, `=` sent as `%3D`); 404 when the game has no such line; a field that is not a string is a 400.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Since: 3.4.

<a name="get-voices-lang-csv"></a>

### `GET /voices/:lang/csv`

- Answer: `{ lang, csv }`: the voice table as CSV.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Since: 3.4.

<a name="get-hero-matrix"></a>

### `GET /hero-matrix`

- Answer: The hero × language matrix (`src/engine/tools/hero-matrix.ts`), read-only: `{ langs, flags, columns, rows, truncated? }`, each row's `cells[column][language]` `{ text, want, clip?, file?, fallback?, missing?, borrowed?, unlisted? }` and its `untranslated`, `agreement`, `problem`.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Since: 4.4.0.

<a name="feed"></a>

## Change feed and screenshots

The dev server's server-sent events and the room screenshots it renders.

<a name="post-screenshot"></a>

### `POST /screenshot`

- Body: `{ room, checkpoint? }`.
- Answer: `{ file, url }`: a PNG of the room (the editor's overlays hidden) under `.cache/studio/<game>-<room>[-<checkpoint>].png`, served at `url` (`GET screenshots/<name>.png`). 400 without `room`; 501 `{ unavailable: true, reason, error }` when Playwright or its Chromium is missing.
- Served by: both the dev server and the Studio Server (the shared table, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="get-screenshots-name"></a>

### `GET /screenshots/:name`

- Answer: The PNG a screenshot wrote (`image/png`, not cached); 404 `no such screenshot`. `name` is letters, digits, `.`, `_` and `-`, ending in `.png`.
- Served by: the dev server only ([`tools/studio/plugin.ts`](../../tools/studio/plugin.ts)).

<a name="get-events"></a>

### `GET /events`

- Answer: Server-sent events: `{ type: 'hello', game }` on connection, then `{ type: 'changed', file }` when a file of the game folder changes on disk (`file` relative to it, e.g. `rooms/house.ts`; dotfiles, editor backups and `private/` are ignored; 150 ms debounce per file); a `: ping` comment every 25 s.
- Served by: the dev server only ([`tools/studio/plugin.ts`](../../tools/studio/plugin.ts)).

<a name="assets"></a>

## Assets tab

Every image and sound of the game with where it is used, the art prompts per sheet, and the uploads. Nothing is ever deleted: a replaced file is first kept as `<name>_v<N>.<ext>` beside it. Since 4.2.1 every upload is one operation of the journal: the backups, the new files and the cells a tool cut are written together or not at all. A JSON body is 96 MiB at most (413 above). The Studio Server serves its own Assets routes (`studio-server/src/server/hosted-assets.ts`), not described here.

<a name="get-assets"></a>

### `GET /assets`

- Answer: `{ sheets: [{ id, kind: 'sprites' | 'furniture' | 'talk', character?, grid, promptKind?, cells: [{ id, file, w, h, used, ids, prepared, asset?, backups, mtime, missing? }] }], decors: [{ name, rooms, …cell }], sounds: { music, sfx: [{ id, kind, file, used, prepared, asset?, backups }] }, missing, unprepared, prompts: { sheets: [{ id, kind, markdown, missingMarkdown? }], style } }`.
- Served by: the dev server only ([`tools/studio/assets.ts`](../../tools/studio/assets.ts)).

<a name="get-assets-file-path"></a>

### `GET /assets/file/:path`

- Answer: A source file of `art/` or `audio/`, its path relative to the game folder; anything else is a 404 `no such file`.
- Served by: the dev server only ([`tools/studio/assets.ts`](../../tools/studio/assets.ts)).

<a name="get-assets-prompts"></a>

### `GET /assets/prompts`

- Answer: `{ markdown }`: the whole `npm run prompts` document; `?missing=1` gives `npm run prompts -- --missing`'s.
- Served by: the dev server only ([`tools/studio/assets.ts`](../../tools/studio/assets.ts)).

<a name="post-assets-sheet"></a>

### `POST /assets/sheet`

- Body: `{ sheetId, grid?: '6x4', cells?: 'r1c1,r2c3', data }`, `data` in base64 or a data URL.
- Answer: `{ ok, file, output, written, backups, cells }`: the sheet saved as `private/sheets/<sheetId>-<time>.<ext>` and cut with `tools/cut-sheet.py` into `art/<sheetId>/`. 409 `{ conflicts }` when cells of that sheet exist and `cells` does not name them; a named cell that exists is first kept as `<cell>_v<N>.png`.
- Served by: the dev server only ([`tools/studio/assets.ts`](../../tools/studio/assets.ts)).

<a name="post-assets-cell"></a>

### `POST /assets/cell`

- Body: `{ sheetId, cell, data, key?: 'auto' | 'always' | 'never' }`.
- Answer: `{ ok, file, backup?, keyed: 'keyed' | 'kept' | 'opaque', cell }`: `art/<sheetId>/<cell>.png` replaced (or added), the old file kept as `<cell>_v<N>.png`; a flat background is keyed with the cutter's rule.
- Served by: the dev server only ([`tools/studio/assets.ts`](../../tools/studio/assets.ts)).

<a name="post-assets-sound"></a>

### `POST /assets/sound`

- Body: `{ kind: 'music' | 'sfx', file, data }`.
- Answer: `{ ok, file, backup? }`: written to `audio/<kind>/<file>` (any format ffmpeg reads), the old file kept as a backup.
- Served by: the dev server only ([`tools/studio/assets.ts`](../../tools/studio/assets.ts)).

<a name="post-assets-decor"></a>

### `POST /assets/decor`

- Body: `{ name, data }`, a PNG or a JPEG.
- Answer: `{ ok, file, backup? }`: written to `art/decor/<name>.<ext>`, the old picture kept as `<name>_v<N>.<ext>`.
- Served by: the dev server only ([`tools/studio/assets.ts`](../../tools/studio/assets.ts)).

<a name="post-assets-prepare"></a>

### `POST /assets/prepare`

- Answer: Runs `npm run assets`: `{ ok, code, output }`. With `?stream=1`, the output as plain text while it runs, ending with `[exit <code>]`.
- Served by: the dev server only ([`tools/studio/assets.ts`](../../tools/studio/assets.ts)).

<a name="assistant"></a>

## Assistant

The Studio's Assistant on the dev server: a conversation relayed to a chat model, and a task for an MCP-connected agent.

<a name="post-assistant-chat"></a>

### `POST /assistant/chat`

- Body: `{ provider: { kind, baseUrl, model, apiKey? }, messages: [{ role: 'user' | 'assistant', content }], context? }`.
- Answer: Server-sent events of the conversation: `{ type: 'text', delta }`, `{ type: 'tool_call', id, name, args }`, `{ type: 'tool_result', id, name, result, isError? }`, `{ type: 'done', usage?, wrote?, stopped? }`, `{ type: 'error', message }`. The model's tool calls run on the game through the MCP tools' registry ([MCP tools](studio.mcp-tools.md)). The API key comes with each request and lives in memory for that request only, never on disk nor in a log. 400 for a bad provider or conversation: `kind` must be `openai`, `anthropic` or `ollama`; `baseUrl` an http(s) URL without credentials, one of the known providers' origins or an Ollama on the loopback, otherwise refused unless `WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1`, and then HTTPS to a public host only; `model` required; the last message the user's.
- Served by: the dev server only ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts)).

<a name="post-assistant-task"></a>

### `POST /assistant/task`

- Body: `{ text, about? }`.
- Answer: The new note, tagged `task: true`, author `you`: a request for an MCP-connected agent, no key needed. 400 without `text`.
- Served by: the dev server only ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts)).

<!-- generated:end -->
