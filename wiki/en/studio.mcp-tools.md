# MCP tools

Every tool an AI assistant can call on a quest-n-click game: the local MCP server, the remote MCP of a hosted Studio
and the Studio's Assistant all serve the same registry, [`tools/studio/tools.ts`](../../tools/studio/tools.ts). The
tool sections below are generated from that registry (`npm run wiki -- generate studio.mcp-tools`): the English text is
the description an MCP client receives, word for word.

<a name="overview"></a>

## Where the tools run

- **Local MCP server, engine repository.** From the root of the engine repository, `npm run -s mcp` starts the server
  over stdio for the current game (`GAME=<id>`, or `GAME_DIR=<folder>`; by default `package.json` → `config.game`).
  Its server name is `quest-n-click`; it uses the SDK `@modelcontextprotocol/sdk` 1.x
  ([`tools/mcp/server.ts`](../../tools/mcp/server.ts)). Use `-s` in a client's configuration: without it, npm prints its
  `> quest-n-click mcp` banner on stdout, and strict clients reject it. Setting up each client:
  [studio.mcp-setup](studio.mcp-setup.md).
- **Local MCP server, created project.** From the project's folder, `npx quest-n-click mcp` (the
  [`quest-n-click mcp`](reference.cli.md#quest-n-click-mcp) command) starts the same server for the project's game.
- **A hosted Studio.** `npm run mcp -- --server <url>` gives the same tools on a Studio Server, through its API with the
  CLI's token (`studio-server login --server <url>` first); the Studio Server also serves them itself at `/mcp`. Every
  write meets the API's checks. See [team.remote-mcp](team.remote-mcp.md).
- **The Studio's Assistant** runs the same tools in its own loop (dev server, or the demo in the browser).

stdout carries the protocol only; the server's logs go to stderr. A failing operation (an unknown room, a bad path, a
broken edit…) is a tool error with its message, never a crash: the server keeps running.

<a name="how-to-read"></a>

## How to read a tool's section

- **Writes**: whether the tool changes a file of the game. The Studio watches the files, so a person sees the change
  live in `npm run studio`.
- **Needs**: an optional ability of the backend the tool runs on. A backend without it leaves the tool out of the list
  it gives the client.
- **MCP hints**: the tool's `annotations` as the client receives them (`readOnlyHint`, `destructiveHint`,
  `idempotentHint`).
- **Input**: the arguments, from the tool's zod schema as JSON Schema; a field marked optional can be left out.

<a name="availability"></a>

## Which tools each backend offers

| Backend | Tools left out |
|---|---|
| Local server (`npm run mcp`, `quest-n-click mcp`, the dev server's Assistant): [`tools/studio/backend.ts`](../../tools/studio/backend.ts) | none |
| A hosted Studio (`npm run mcp -- --server <url>`, `/mcp`): [`tools/studio/http-backend.ts`](../../tools/studio/http-backend.ts) | `screenshot`, `search_docs`, `list_docs`, `read_doc`, `run_tests`, `asset_prompts`, `speedrun_verify` |
| The demo's Assistant, in the browser: [`src/studio/assistant.ts`](../../src/studio/assistant.ts) | every tool that needs an ability, except the documentation tools when the demo's snapshot holds the pages; `set_value` answers that it needs the dev server |

> [!LIMIT id=demo-writes]
> In the demo, the tools write to the visitor's copy in the browser only, and `set_value` is refused: structured
> writes edit the room's code through the TypeScript parser of the dev server.

<a name="tools"></a>

## The tools

<!-- generated:begin -->

<a name="list-rooms"></a>

### `list_rooms`

**Game overview.** The current game: id, title, hero, rooms (id, name, decor), characters, items, verbs, checkpoints (named save states usable by solve and screenshot) and the image ids of the asset manifest with their size. Read-only.

- Writes: no (read-only).
- MCP hints: `readOnlyHint: true`.

Input:

No argument.

<a name="get-room"></a>

### `get_room`

**Read a room.** One room: `def` (the RoomDef as loaded: props, actors, hotspots, look lines, reactions `on`, talk, hints, onEnter), `layout` (geometry from layout/&lt;id>.json), `texts` (every editable string literal with its JSON path, value, kind, line and speaker) and `file`. Use the `path` of a text with set_text. Read-only.

- Writes: no (read-only).
- MCP hints: `readOnlyHint: true`.

Input:

| Field | Type | Required | Means |
|---|---|---|---|
| `id` | `string` | yes | Room id, e.g. "house" (see list_rooms). |

<a name="set-layout"></a>

### `set_layout`

**Write a room layout.** Replaces layout/&lt;id>.json with `layout` (the whole Layout object, same shape as get_room returns: props, hotspots, actors, walk, scale, entries…). Read the room first and change only what you must; never invent coordinates the human has not given you.

- Writes: yes, it changes a file of the game (the Studio refreshes after it).
- MCP hints: `destructiveHint: true, idempotentHint: true`.

Input:

| Field | Type | Required | Means |
|---|---|---|---|
| `id` | `string` | yes | Room id, e.g. "house" (see list_rooms). |
| `layout` | `object` | yes | The complete Layout object. |

<a name="set-text"></a>

### `set_text`

**Edit a text of a room.** Edits one string literal of rooms/&lt;id>.ts in place, addressed by its path from get_room `texts` (e.g. "look.pantry[1]", "on[3].do[0]", "talk.grandma[0].topic", "hints[2].lines[0]", "props.lamp.name"). `value` replaces the string. `value: null` deletes a list line, or a whole `look.<id>`. A path ending in "[+]" appends a line: "look.piano[+]", "hints[2].lines[+]", "on[3].do[+]" (a bare string in a command list is a hero line). Ids, image refs, flags and conditions are not texts and are refused. Paths after an append or a deletion shift: call get_room again. Result { ok, line, changed } (changed false: the value was already there).

- Writes: yes, it changes a file of the game (the Studio refreshes after it).
- MCP hints: `destructiveHint: true`.

Input:

| Field | Type | Required | Means |
|---|---|---|---|
| `id` | `string` | yes | Room id, e.g. "house" (see list_rooms). |
| `path` | `string` | yes | JSON path of the text under defineRoom({...}); may end in "[+]" to append. |
| `value` | `string \| null` | yes | The new text, or null to delete. |

<a name="set-value"></a>

### `set_value`

**Write a structured value in a room.** Writes a structured value (3.4) at a path of rooms/&lt;id>.ts, as code in the file's style: a reaction ("on[3]", or "on[&lt;length>]" to add one), a condition ("on[3].if"), a command list ("on[3].do", "onEnter"), the room's stage ("stage": layers, lights, emitters, transition, links; CONTENT_GUIDE "The stage"), its painter ("renderer": "dom" | "canvas"). With `id: "@game"` the game file instead, for its objectives only ("objectives.&lt;id>": { title, done, optional?, parent? }, or one of its fields; list_rooms shows them). `value` is the JSON of it; omit it (null) to remove the path. `dry: true` returns the diff only. Otherwise the game is reloaded and validated after the write: an edit that adds a validation error is taken back and refused with the errors. Result { ok, line, changed, diff }.

- Writes: yes, it changes a file of the game (the Studio refreshes after it).
- MCP hints: `destructiveHint: true`.

Input:

| Field | Type | Required | Means |
|---|---|---|---|
| `id` | `string` | yes | Room id, e.g. "house" (see list_rooms). |
| `path` | `string` | yes | Path under defineRoom({...}): "stage", "renderer", "on[3]", "on[3].if", "on[3].do", "onEnter"; with id "@game": "objectives.&lt;id>". |
| `value` | `any JSON \| null` | yes | The value as JSON (a condition, a command list, a stage…); null removes the path. |
| `dry` | `boolean` | no | Only return the diff, write nothing. |

<a name="add-entity"></a>

### `add_entity`

**Add a prop, hotspot or actor.** Adds an entry to rooms/&lt;id>.ts (section created if absent), its optional first look line, and a place in the layout: prop foot at `at` (height 60), hotspot 60 × 60 box centred on `at`, actor feet at `at`. `name` is required for props and hotspots; `img` is a prop image id (list_rooms images); `char` is the actor character id. `at` defaults to [320, 300]: then ask the human (add_note) to drag it in place in the Studio. 409 if the id exists.

- Writes: yes, it changes a file of the game (the Studio refreshes after it).
- MCP hints: `destructiveHint: false`.

Input:

| Field | Type | Required | Means |
|---|---|---|---|
| `id` | `string` | yes | Room id, e.g. "house" (see list_rooms). |
| `kind` | `"prop" \| "hotspot" \| "actor"` | yes |  |
| `entityId` | `string` | yes | The new entity id (letters, digits, _ and -). |
| `name` | `string` | no | Display name. |
| `img` | `string` | no | Prop image id. |
| `char` | `string` | no | Actor character id. |
| `at` | `[number, number]` | no | [x, y] in the logical 640 × 400 room space. |
| `look` | `string` | no | First look line. |

<a name="get-storyboard"></a>

### `get_storyboard`

**Read the storyboard.** storyboard.json: { boards: [...] } with panels, lines, hints and talk topics. The storyboard is the source of truth for text: change it first, then the rooms. Read-only.

- Writes: no (read-only).
- MCP hints: `readOnlyHint: true`.

Input:

No argument.

<a name="set-storyboard"></a>

### `set_storyboard`

**Write the storyboard.** Replaces storyboard.json with `storyboard` (must be { boards: [...] }; send the whole object as read with get_storyboard, modified). Written compactly; an unchanged storyboard is not rewritten. Result { ok, changed }.

- Writes: yes, it changes a file of the game (the Studio refreshes after it).
- MCP hints: `destructiveHint: true, idempotentHint: true`.

Input:

| Field | Type | Required | Means |
|---|---|---|---|
| `storyboard` | `{ boards }` | yes | The whole storyboard. |

<a name="get-notes"></a>

### `get_notes`

**Read the notes.** notes.json, the shared log between the human and the AI: { entries: [{ id, about, author, text, at, task? }] }. The human answers your questions here; entries with `task: true` are requests from the human for you to do. Read-only.

- Writes: no (read-only).
- MCP hints: `readOnlyHint: true`.

Input:

No argument.

<a name="add-note"></a>

### `add_note`

**Write a note to the human.** Appends a note to notes.json (shown in the Studio Notes tab). Use it when unsure what the human wants, or to ask them to place something. `about` is a room id, a panel id, `room.entity` or free text. `author` defaults to the name of your MCP client.

- Writes: yes, it changes a file of the game (the Studio refreshes after it).

Input:

| Field | Type | Required | Means |
|---|---|---|---|
| `about` | `string` | no | What it is about. |
| `author` | `string` | no | Who writes (default: the MCP client name, or "ai"). |
| `text` | `string` | yes | The note. |

<a name="validate"></a>

### `validate`

**Validate the game.** Static checks: broken ids, missing look lines, flags never set or read, minigame params. Result { ok, errors, warnings, ms }. Run after every content change.

- Writes: no (read-only).
- MCP hints: `readOnlyHint: true`.

Input:

No argument.

<a name="solve"></a>

### `solve`

**Solve the game.** Explores the game states to prove it can be finished, from New Game or from checkpoint `from`. Result { status, exit, headline, mode, finished, states, truncated, path, roomsReached, flagsReached, itemsNeverUsed, unusedItems, deadEnds, softlocks, errors, from, ms }. `status`/`exit`/`headline` are exactly what `npm run solve` prints (0 solved, 2 truncated: nothing proved, 1 a bug to fix). `prove: true` runs the exhaustive search (softlocks complete). `profile: true` adds why the search is slow or big.

- Writes: no (read-only).
- MCP hints: `readOnlyHint: true`.

Input:

| Field | Type | Required | Means |
|---|---|---|---|
| `from` | `string` | no | Checkpoint id (list_rooms checkpoints). |
| `profile` | `boolean` | no | Add the solver profile as text: what the states are made of, what the search cost, independent dimensions, monotonic things. |
| `prove` | `boolean` | no | Exhaustive search: every reachable state and the softlocks (slow on a big game; default: the fast witness). |
| `reality` | `"closed" \| "adversarial" \| { scenario, signals }` | no | A game with reality.signals (4.1.1): the world to solve in. `closed` (default) no signal, a scenario { scenario, signals } in that order, `adversarial` any declared signal at any point. A simulation: no service is contacted. |

<a name="content-report"></a>

### `content_report`

**Content profiler.** Game-design profiler, as Markdown: per room (zones, props, actors, exits, rules, topics, hints, scripts; things with no look line, verbs that only get fallbacks, props that never change), per item (obtained where, how many rules use it, consumed), per character (rooms, topics, lines, unreachable topics), unreachable rooms and exits with no way back. Read it to decide what to write next. Read-only.

- Writes: no (read-only).
- Needs: the backend ability `report`: a backend without it (the demo, a hosted Studio without that route) leaves the tool out.
- MCP hints: `readOnlyHint: true`.

Input:

No argument.

<a name="get-ir"></a>

### `get_ir`

**The game as the tools see it.** The game's intermediate representation (4.1.12): rooms, entities, rules, topics, listeners, scripts, objectives, Reality policies and the trusted extensions by name, each id with the file and line that writes it (`provenance`). The same JSON as `npm run ir -- --json`. Read-only.

- Writes: no (read-only).
- Needs: the backend ability `ir`: a backend without it (the demo, a hosted Studio without that route) leaves the tool out.
- MCP hints: `readOnlyHint: true`.

Input:

No argument.

<a name="world-graph"></a>

### `world_graph`

**World map.** The rooms and the ways between them (declared exits, goto commands, map places) as a DOT graph, with unreachable rooms and exits with no way back. Read-only.

- Writes: no (read-only).
- Needs: the backend ability `graph`: a backend without it (the demo, a hosted Studio without that route) leaves the tool out.
- MCP hints: `readOnlyHint: true`.

Input:

No argument.

<a name="dialogue-tree"></a>

### `dialogue_tree`

**Dialogue tree.** The conversation of a character in a room as an indented tree: topics (with their conditions), lines, choices and their options, branches. Derived from the talk topics, nothing else to maintain. Read-only.

- Writes: no (read-only).
- MCP hints: `readOnlyHint: true`.

Input:

| Field | Type | Required | Means |
|---|---|---|---|
| `id` | `string` | yes | Room id. |
| `actor` | `string` | no | Actor id (default: every character with topics). |

<a name="puzzle-graph"></a>

### `puzzle_graph`

**Puzzle graph.** What every rule, topic, script and listener needs (conditions, items) and changes (items, flags, props, places, events). Without `id`: the overview as Markdown (every item and flag with what produces and uses it, flags read but never set, things produced but never used). With `id` (an item, flag, prop, place or event): its card: acquired by, consumed by, used by, requires first, unlocks, downstream. Read it before changing a puzzle. Read-only.

- Writes: no (read-only).
- Needs: the backend ability `puzzle`: a backend without it (the demo, a hosted Studio without that route) leaves the tool out.
- MCP hints: `readOnlyHint: true`.

Input:

| Field | Type | Required | Means |
|---|---|---|---|
| `id` | `string` | no | An item, flag, prop (room.prop), place or event id; none for the overview. |

<a name="storyboard-coverage"></a>

### `storyboard_coverage`

**Storyboard coverage.** The storyboard (get_storyboard) checked against the content, as Markdown: per board and panel, whether its room, speakers, lines, talk topics, sounds and actions ("Open the armchair", "Use pipe with tank") exist in the game: ok, partial (the pieces exist, no rule answers; a close line), missing, or unknown (prose). Read it to find what of the story is not implemented yet. Read-only.

- Writes: no (read-only).
- Needs: the backend ability `coverage`: a backend without it (the demo, a hosted Studio without that route) leaves the tool out.
- MCP hints: `readOnlyHint: true`.

Input:

No argument.

<a name="playtests"></a>

### `playtests`

**Playtests.** The sessions players shared from their phones (games/&lt;id>/playtests/*.session.json, ids only) replayed on the current content and summed up, as Markdown: time per room, where players stall (the same action again and again without effect), hints shown, where they stopped, minigames played, sessions the content has outgrown. Read it to know where the game is harder than you think. Read-only.

- Writes: no (read-only).
- Needs: the backend ability `playtests`: a backend without it (the demo, a hosted Studio without that route) leaves the tool out.
- MCP hints: `readOnlyHint: true`.

Input:

No argument.

<a name="lint"></a>

### `lint`

**Content lint.** What the validator cannot say and the solver does not say loudly, as Markdown: conditions nothing can satisfy, rules another rule hides, items no rule needs or nothing gives, hints that cannot fire, choices with a dead option, and, from a solver run, live actions never run and rooms never reached. Each finding names its content path, its stable id and what to do. `prove: true` runs the exhaustive search first (slow on a big game). Read it before asking a human for a review. Read-only.

- Writes: no (read-only).
- Needs: the backend ability `lint`: a backend without it (the demo, a hosted Studio without that route) leaves the tool out.
- MCP hints: `readOnlyHint: true`.

Input:

| Field | Type | Required | Means |
|---|---|---|---|
| `prove` | `boolean` | no | Run the exhaustive proof first (default: the fast witness). |

<a name="screenshot"></a>

### `screenshot`

**Screenshot a room.** Renders a room (optionally at a checkpoint) with the real engine through the running dev server (default http://localhost:5173/, env WEB_SCUMM_DEV_URL; start it with npm run studio or npm run dev) and Playwright. Returns the PNG path (relative to the repository) to open and look at, or an explanation when unavailable.

- Writes: no (read-only).
- Needs: the backend ability `screenshot`: a backend without it (the demo, a hosted Studio without that route) leaves the tool out.
- MCP hints: `readOnlyHint: true`.

Input:

| Field | Type | Required | Means |
|---|---|---|---|
| `room` | `string` | yes | Room id, e.g. "house" (see list_rooms). |
| `checkpoint` | `string` | no | Checkpoint id. |

<a name="search-docs"></a>

### `search_docs`

**Search the documentation.** Searches the documentation pages (the wiki written under wiki/, 4.5.0) by words, in French or English: page titles and questions first, then aliases, keywords and identifiers (a DSL command, an npm script, an HTTP code such as 423), then section headings, then section text. Accents and case do not matter; the glossary adds the other language's words (verrou, lease). Each result is `id#section` with its title, type, context, versions, status, score, the reason of the match and an excerpt with the words found in bold: read it with read_doc { id, section }. No confident match gives an empty list and the index pages to try. `version` leaves out what does not apply to that version. Read-only.

- Writes: no (read-only).
- Needs: the backend ability `docs`: a backend without it (the demo, a hosted Studio without that route) leaves the tool out.
- MCP hints: `readOnlyHint: true`.

Input:

| Field | Type | Required | Means |
|---|---|---|---|
| `query` | `string` | yes | Words or a question, in French or English. |
| `lang` | `"en" \| "fr"` | no | Only pages in this language (default: both). |
| `audience` | `"player" \| "author" \| "admin" \| "contributor"` | no |  |
| `context` | `"engine-repo" \| "created-project" \| "studio-local" \| "studio-demo" \| "studio-hosted" \| "bridge" \| "player"` | no |  |
| `version` | `string` | no | A product version (4.5.0): only what applies to it. |
| `type` | `"tutorial" \| "howto" \| "reference" \| "explanation" \| "troubleshooting" \| "index"` | no |  |
| `includeArchived` | `boolean` | no | Also deprecated and archived pages, and with `version` the pages that do not apply, marked so. |
| `limit` | `integer 1..20` | no | Results per answer (default 5, at most 20). |
| `cursor` | `string` | no | The `cursor` of a previous answer to the same request, for more. |

<a name="list-docs"></a>

### `list_docs`

**List the documentation pages.** The documentation pages there are to read (wiki/, 4.5.0), filtered by audience, context, type, language or state: id, title, type, audience, context, versions, state, languages and section ids. A page still to write is not listed. Read-only.

- Writes: no (read-only).
- Needs: the backend ability `docs`: a backend without it (the demo, a hosted Studio without that route) leaves the tool out.
- MCP hints: `readOnlyHint: true`.

Input:

| Field | Type | Required | Means |
|---|---|---|---|
| `audience` | `"player" \| "author" \| "admin" \| "contributor"` | no |  |
| `context` | `"engine-repo" \| "created-project" \| "studio-local" \| "studio-demo" \| "studio-hosted" \| "bridge" \| "player"` | no |  |
| `type` | `"tutorial" \| "howto" \| "reference" \| "explanation" \| "troubleshooting" \| "index"` | no |  |
| `lang` | `"en" \| "fr"` | no |  |
| `state` | `"draft" \| "ready"` | no | draft pages exist in the repository only. |

<a name="read-doc"></a>

### `read_doc`

**Read a documentation page.** Reads the documentation. Recommended: search_docs, then read_doc { id, section } for the section it found (`lang` en or fr, default en; `maxChars` 20000 by default, at most 100000, and a `cursor` for the rest), with where the text comes from (version, commit, doc revision) at its top. `name` instead returns a large historical page in one block, rebuilt from the sections of the documentation and possibly shortened: a section too long for the page's bound gives its heading, its first paragraph and the read_doc { id, section } that returns the rest. The names: CONTENT_GUIDE (the game format, the DSL of rooms, conditions and commands), ENGINE, TOOLS, STUDIO, WORKFLOW, AUDIO (music and effects), UPGRADING (v2 to v3), CLASSICS (the famous mechanics of the genre, each with its DSL: read it before asking for a new command); with `name`, the other arguments are ignored. Give either `name` or `id`, not both. Read-only.

- Writes: no (read-only).
- Needs: the backend ability `readDoc`: a backend without it (the demo, a hosted Studio without that route) leaves the tool out.
- MCP hints: `readOnlyHint: true`.

Input:

| Field | Type | Required | Means |
|---|---|---|---|
| `name` | `"CONTENT_GUIDE" \| "ENGINE" \| "TOOLS" \| "STUDIO" \| "WORKFLOW" \| "AUDIO" \| "UPGRADING" \| "CLASSICS"` | no | One of the eight historical pages, rebuilt and possibly shortened: a long section points to read_doc { id, section } for the rest (the other arguments are then ignored). |
| `id` | `string` | no | A page id from search_docs or list_docs, e.g. "create.rooms". |
| `section` | `string` | no | A section id of that page (its `<a name>`), e.g. "walkable-zones". |
| `lang` | `"en" \| "fr"` | no | The page's language (default en). |
| `cursor` | `string` | no | The `cursor` of the previous answer, for the rest of the text. |
| `maxChars` | `integer 1..100000` | no | At most this many characters per answer (default 20000). |

<a name="run-tests"></a>

### `run_tests`

**Run the tests.** Runs `npx vitest run` (engine tests and the game walkthrough) and returns the summary lines and the failures. Takes a few seconds to a minute. Read-only.

- Writes: no (read-only).
- Needs: the backend ability `runTests`: a backend without it (the demo, a hosted Studio without that route) leaves the tool out.
- MCP hints: `readOnlyHint: true`.

Input:

No argument.

<a name="asset-prompts"></a>

### `asset_prompts`

**Art prompts.** The image-model prompts for the game's art (same as `npm run prompts`): one STYLE block, then one ready-to-paste prompt per sheet (characters with the engine's pose rows and special poses, mouth kits, object sheets cell by cell, backgrounds with LOCATION and EMPTY SPOTS, furniture) and a checklist to cut and import them. Hand the sections to the human as-is; never write a sprite prompt by hand. `missing: true` keeps only the sheets with images not cut yet. Returns the markdown, and { missing, sheets } as structured content. Read-only.

- Writes: no (read-only).
- Needs: the backend ability `assetPrompts`: a backend without it (the demo, a hosted Studio without that route) leaves the tool out.
- MCP hints: `readOnlyHint: true`.

Input:

| Field | Type | Required | Means |
|---|---|---|---|
| `missing` | `boolean` | no | Only the sheets with at least one missing image, and only their missing cells. |

<a name="speedrun-verify"></a>

### `speedrun_verify`

**Verify a speedrun.** Replays a speedrun envelope (.wsrun, 4.1.14) against the current game: reloads the exact rules of its category, replays its inputs with its seed, recomputes the in-game time, the splits, the final state and the hash chain, and checks the category’s rules. Returns { verdict, code, reason, trust }: `valid` is the only rankable verdict, `inconclusive` is never valid, and a verifier grants at most `replay-valid`. Pass the file path under the game project, or the envelope text. Read-only.

- Writes: no (read-only).
- Needs: the backend ability `speedrunVerify`: a backend without it (the demo, a hosted Studio without that route) leaves the tool out.
- MCP hints: `readOnlyHint: true`.

Input:

| Field | Type | Required | Means |
|---|---|---|---|
| `path` | `string` | no | Path of the .wsrun file, relative to the repository or project. |
| `envelope` | `string` | no | The .wsrun text itself (instead of a path). |

<!-- generated:end -->

<a name="resources"></a>

## Resources

The local server also gives two resources, as JSON: `webscumm://game` (the same as `list_rooms`) and
`webscumm://room/<id>` (the same as `get_room`). They keep the former name's scheme, `webscumm://`.

<a name="errors"></a>

## Errors

- A tool that fails returns a tool error, `isError: true`, whose text is `Error: <message>`, with ` (status <n>)` when
  the operation carries an HTTP status (an id that exists already is 409, an edit that would add validation errors
  422: see [reference.error-codes](reference.error-codes.md#studio)).
- Arguments that do not match a tool's input are refused before it runs: `bad arguments for <tool>: <field>: <why>`.
- An unknown tool, or one the backend leaves out: `no such tool: <name>`.
- `search_docs`, `list_docs` and `read_doc` name a stale cursor `stale_cursor` in their structured content.

<a name="related"></a>

## Related

- [studio.api](studio.api.md): the HTTP routes behind the same operations.
- [reference.cli](reference.cli.md#quest-n-click-mcp): the `quest-n-click mcp` command.
