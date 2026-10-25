# Working with an AI

quest'n'click is built to be written with an AI assistant: the game is data, every step has a tool that says whether
it is right, and the human sees each change in the Studio. This page gives the method, the MCP server that hands the
Studio's operations to any assistant, a typical session, the documentation search an agent uses, and how to split a
big game between sub-agents.

<a name="what-you-get"></a>

## What you get

An assistant (Claude Code, Claude Desktop, Cursor, Codex CLI, Gemini CLI, or an agent you wrote) that reads and edits
your game the way the Studio does, checks its own work with the validator, the solver, the lint and the tests, and
asks you through the notes when it should not guess. You watch the result live in `npm run studio`.

<a name="context-and-versions"></a>

## Context and versions

- **Engine repository**: `npm run mcp`, with `GAME=<id>` (or `GAME_DIR=<folder>`) for another game than
  `package.json` → `config.game`. `AGENTS.md` at the root is the operating manual for any assistant; `CLAUDE.md`
  points to it. The skills of `.claude/skills/` (`/storyboard`, `/new-room`, `/placement`, `/review`,
  `/production-plan`…) are in this repository only.
- **Created project**: the same server is `npx quest-n-click mcp`, on the game in `game/`.
- **Hosted Studio**: the same tools reach a Studio Server, as a member, through its checks: see
  [Remote MCP](team.remote-mcp.md).
- The MCP server exists since 1.0.0, when the project was still named web-scumm; it is named `quest-n-click` since
  4.2.5 (D47). The documentation tools `search_docs` and `list_docs`, and `read_doc { id }`, come with 4.5.0.

<a name="prerequisites"></a>

## Prerequisites

- A working game: `npm run validate` and `npm run solve` pass ([Checking your game](create.checking.md)).
- Node 22.12 or later, the version the tools need.
- An MCP client configured for this server: one block per client in
  [Local MCP: setting up each client](studio.mcp-setup.md). In the engine repository, Claude Code finds `.mcp.json`
  and Cursor finds `.cursor/mcp.json`: approve the `quest-n-click` server when asked.

<a name="where-to-run"></a>

## Where to run the commands

On your machine, in the engine repository (or in the created project). The MCP client starts the server itself, with
the repository as its working folder; you start the Studio in another terminal to watch.

<a name="workflow"></a>

## The method

This is the method that produced the first game built with this engine: a 9-room, 15-character family adventure,
written and shipped in a single day by one person working with Claude Code. Each step has a tool in
this repository, and each step ends with something the author can validate on a phone before the next one starts.

| Step | What the AI does | What you validate | Page |
|---|---|---|---|
| 1. Story first, as data | writes `games/<id>/storyboard.json` (skill `/storyboard`) | the story, the lines, the hints | [The storyboard](create.storyboard.md) |
| 2. The storyboard on a page | `npm run page:storyboard`, published so you annotate from a phone | your notes under each panel | [Review pages](create.review-pages.md) |
| 3. The art | `npm run prompts`, one prompt per sheet | the sheets you generate | [Images](create.images.md) |
| 4. Cut, key, review | `tools/cut-sheet.py`, `npm run page:review` | keep / redo / unused per cell | [Images](create.images.md) |
| 5. The rooms | one file per room (skill `/new-room`), then `validate` and `solve` | — | [Rooms](create.rooms.md) |
| 6. Placement | never types coordinates: asks you | you drag in the Studio, `?edit=<room>` or the placement page | [Geometry](create.geometry.md) |
| 7. Prove it plays | `npm test`, `npm run e2e`, looks at the screenshots | a playthrough on your phone | [Checking your game](create.checking.md) |
| 8. Ship | `npm run build` | the link you send | [Build and release a game](create.build-release.md) |

The rules an agent follows are those of `AGENTS.md`: content is data; logic in `rooms/*.ts`, geometry in
`layout/*.json`; the storyboard changes first, then the room; after any content change, `npm run validate && npm run
solve && npm test` with the output reported, not summed up; a screenshot looked at after any visual change; never
delete an asset; a note in `notes.json` rather than a guess.

<a name="steps"></a>

## Steps

<!-- step: start-studio -->
1. Start the Studio, so you see what the agent changes.

   ```sh
   # in the engine repository, on your machine (created project: npm run studio)
   npm run studio
   ```

<!-- step: connect-client -->
2. Connect your client to the MCP server. The command it runs is:

   ```sh
   # in the engine repository: what the client starts, over stdio
   npm run -s mcp
   ```

   ```sh
   # in a created project: what the client starts, over stdio
   npx quest-n-click mcp
   ```

   Keep `-s` (silent): without it, npm prints its `> quest-n-click mcp` banner on stdout, which carries the protocol
   only, and strict clients reject it. The server's own logs go to stderr; it says
   `[quest-n-click mcp] ready: game "<id>" (<folder>)` there. The per-client blocks are in
   [Local MCP: setting up each client](studio.mcp-setup.md).

<!-- step: typical-session -->
3. Ask for the work, and let the agent run a session like the one below.

<!-- step: answer-notes -->
4. Answer the agent in the Studio's **Notes** tab, or by editing the storyboard. It reads you back with `get_notes`.

<a name="mcp-server"></a>

### What the MCP server is

`npm run mcp` starts a [Model Context Protocol](https://modelcontextprotocol.io) server over **stdio**, named
`quest-n-click`, that exposes the Studio's operations (`studio-server/src/ops/core.ts`) as tools. Any MCP client then
reads and edits a game exactly as the Studio does, and the human sees the result live in `npm run studio`, which
watches the files.

- Server: [`tools/mcp/server.ts`](../../tools/mcp/server.ts), SDK `@modelcontextprotocol/sdk` 1.x. Its version is the
  engine's, read from `package.json`.
- The tools are defined once, in [`tools/studio/tools.ts`](../../tools/studio/tools.ts), and shared with the Studio's
  Assistant ([The Assistant](studio.assistant.md)). Each one, with its arguments: [MCP tools](studio.mcp-tools.md).
  In short: `list_rooms`, `get_room`, `set_layout`, `set_text`, `set_value`, `add_entity`, `get_storyboard`,
  `set_storyboard`, `get_notes`, `add_note`, `validate`, `solve`, `content_report`, `get_ir`, `world_graph`,
  `dialogue_tree`, `puzzle_graph`, `storyboard_coverage`, `playtests`, `lint`, `screenshot`, `search_docs`,
  `list_docs`, `read_doc`, `run_tests`, `asset_prompts`, `speedrun_verify`.
- A failing operation (an unknown room, a bad path, a broken edit…) returns a tool error with its message; the server
  keeps running.

> [!LIMIT id=screenshot-needs-dev-server]
> `screenshot` renders through a running dev server (`npm run studio` or `npm run dev`, at `WEB_SCUMM_DEV_URL`,
> default `http://localhost:5173/`) and Playwright; without them it says why it is unavailable. A tool whose ability
> the backend lacks is not offered at all.

<a name="without-mcp"></a>

### An AI without MCP

It still works. The AI edits the files; the Studio reloads (it watches them); the human sees the result and answers in
**Notes** or in the **Storyboard**; the AI reads `games/<id>/notes.json` back. Git carries the history.

<a name="typical-session"></a>

## A typical session

1. Learn the game and the format: `list_rooms`, `get_storyboard`, `get_notes`, and the documentation (below:
   `search_docs` then `read_doc { id, section }`; or the historical page `read_doc { name: "CONTENT_GUIDE" }`, which may
   shorten long sections to a pointer to `read_doc { id, section }`).
2. Edit: `set_storyboard` first, then `set_text` / `add_entity` in the rooms.
3. Check: `validate`, `solve`, `lint`, `run_tests`; `screenshot` if the human runs the Studio.
4. Ask: `add_note` for anything the human must decide or place; read their answer with `get_notes`. Notes with
   `task: true` are requests the human wrote from the Studio's Assistant: the agent does them, then answers with
   `add_note` on the same `about`.

<a name="search-docs"></a>
<!-- applies: 4.5.0.. since 4.5.0 -->

### Finding the answer in the documentation

An agent does not need to read whole pages. `search_docs { query }` searches the pages of this wiki, in English or
French: titles and questions first, then aliases, keywords and identifiers (a DSL command, an npm script, an HTTP code
such as `423`), then section headings, then section text. Accents and case do not matter, and the glossary adds the
other language's words. Each result is `id#section`, with its title, type, context, versions and an excerpt: read it
with `read_doc { id, section }` (`lang` `en` or `fr`, at most 20,000 characters per answer by default, a `cursor` for
the rest). `version` leaves out what does not apply to that version. `list_docs` lists the pages by audience,
context, type, language or state. With no confident match, `search_docs` gives an empty list and the index pages to
try.

`read_doc { name }` still returns one of the eight historical pages: `CONTENT_GUIDE`, `ENGINE`, `TOOLS`, `STUDIO`,
`WORKFLOW`, `AUDIO`, `UPGRADING`, `CLASSICS`. It is not always the whole text: rebuilt from the wiki within 1.5 times
its 4.4.0 size, it shortens its longest sections to their heading, first paragraph and the `read_doc { id, section }`
that gives the rest; read those too before relying on a section. Give `name` or `id`, not both.

<a name="publish-read-back"></a>

### Publish a page and read the annotations back (Claude Code)

The review pages (`npm run page:storyboard`, `page:review`, `page:placement`) let the author annotate from a phone.
With Claude Code:

1. Build the page, then publish it with the Artifact tool, declaring the database: `capabilities: { db: {} }`.
   Republish to the same URL after each regeneration (same file path in the same session, or pass `url`): the
   database is kept across versions.
2. Send the link to the author. Only people with edit rights (Contributor or more) can write.
3. Read the annotations with the **ArtifactData** tool, `action: "list"`, on the artifact's `url`:
   - storyboard: collection `notes`; answer by writing `rewrites/<panel id>` with `{ "text": "…" }` (`set`);
   - review: collection `decide`; list the `redo` cells with their notes, one regeneration prompt per sheet;
   - placement: collection `layouts`; save the documents to a JSON file and import them.
4. If the author used a plain file instead, they send the exported JSON: same content, read it directly.

The pages themselves: [Review pages](create.review-pages.md).

<a name="sub-agents"></a>

## Working with sub-agents

For a game of several rooms, split the work into packages that an orchestrator hands to sub-agents: engine changes,
content per group of rooms, assets, minigames, QA. The plan we used is the
[Production template](create.production-template.md); in the engine repository, the `/production-plan` skill fills it
from the storyboard. Each package ends with validate + solve + tests + screenshots.

<a name="expected-result"></a>

## Expected result, and how to check it

The client lists the `quest-n-click` server with its tools. Ask it to call `list_rooms`: it answers with the game's id,
title, hero, rooms, characters and items. An edit it makes shows in the Studio as soon as the file is written, and `validate` returns
`{ ok, errors, warnings, ms }`.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| The client says the server's output is not valid JSON, or drops the connection at start | `npm run mcp` without `-s`: npm's banner went to stdout | Use `npm run -s mcp` in the client's configuration |
| The agent edits another game than the one open in the Studio | `GAME` differs between the two, or `config.game` changed | Give the same `GAME=<id>` to the client's `env` and to the Studio |
| `screenshot` answers that it is unavailable | No dev server at `WEB_SCUMM_DEV_URL`, or Playwright's Chromium is not installed | Start `npm run studio`; `npx playwright install chromium` |
| `read_doc` answers "give either name … or id, not both" | Both `name` and `id`, or neither | Give one |
| `read_doc { id }` answers that reading by id needs the documentation of `wiki/` | The backend it runs on has no documentation set | Read the page on the wiki, or use `name` |
| An edit is taken back after the write | `set_value` validates the game after the write and undoes an edit that adds an error | Read the error it returns, fix the value |

<a name="files-changed"></a>

## Files or data changed

What the tools write: `games/<id>/rooms/<room>.ts` (`set_text`, `set_value`, `add_entity`), `games/<id>/layout/<room>.json`
(`set_layout`, `add_entity`), `games/<id>/storyboard.json` (`set_storyboard`), `games/<id>/notes.json` (`add_note`), the
game file for its objectives (`set_value` on `@game`). `screenshot` writes a PNG under `.cache/studio/`. The other tools
read only. Commit small, and review the diff the agent made.

<a name="recovery"></a>

## Recovery or going back

Every write is a file change in your working copy: `git diff` shows it and `git restore <file>` takes it back.

<a name="references"></a>

## References

- [`AGENTS.md`](../../AGENTS.md): the rules and commands for any assistant.
- [`tools/mcp/server.ts`](../../tools/mcp/server.ts), [`tools/studio/tools.ts`](../../tools/studio/tools.ts).
- [Local MCP: setting up each client](studio.mcp-setup.md), [MCP tools](studio.mcp-tools.md),
  [Remote MCP](team.remote-mcp.md), [The Assistant](studio.assistant.md).
- [Production template](create.production-template.md), [Contributing with AI agents](contribute.ai-agents.md).
