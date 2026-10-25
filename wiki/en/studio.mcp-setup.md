# Local MCP: setting up each client

`npm run mcp` starts a Model Context Protocol server over stdio that gives any AI assistant the Studio's operations as
tools: Claude Code, Claude Desktop, Cursor, Codex CLI, Gemini CLI or a hand-written agent then read and edit a game the
way the Studio does, and you see the result live in `npm run studio`. This page connects each client.

<a name="what-you-get"></a>

## What you get

Your AI client lists a `quest-n-click` server with tools such as `list_rooms`, `get_room`, `set_text`, `validate` and
`solve`, working on your game's files.

<a name="overview"></a>

## The server

- **Started by** `npm run mcp` in the engine repository ([`tools/mcp/server.ts`](../../tools/mcp/server.ts), SDK
  `@modelcontextprotocol/sdk` 1.x). It is named `quest-n-click` and gives the engine's version.
- **Tools** are defined once in [`tools/studio/tools.ts`](../../tools/studio/tools.ts), shared with the Studio's
  Assistant; the list: [MCP tools](studio.mcp-tools.md). Two resources: `webscumm://game` (= `list_rooms`) and
  `webscumm://room/<id>` (= `get_room`), JSON.
- **The game** is chosen as for every tool: `GAME=<id>` (or `GAME_DIR=<folder>`), otherwise the game last chosen with
  `npm run game`, otherwise `config.game` of `package.json`.
- **stdout carries the protocol only**; logs go to stderr (`[quest-n-click mcp] ready: game "<id>" (<folder>)`). Use
  `npm run -s mcp` (silent) in client configs: without `-s`, npm prints its `> quest-n-click mcp` banner on stdout,
  which strict clients reject.
- **A failing operation** (unknown room, bad path, broken edit…) returns a tool error with the message; the server
  keeps running.
- **What the agent is told first**: the game and how to work on it. Start with `list_rooms` and `get_room`; learn the
  format with `read_doc CONTENT_GUIDE`; after any change run `validate`, then `solve`, then `run_tests`; never invent
  coordinates, ask the human with `add_note` to place things in the Studio; read `AGENTS.md` for the rules.
- **Screenshots** need the dev server (`npm run studio`) at `WEB_SCUMM_DEV_URL` (default `http://localhost:5173/`) and
  Playwright; otherwise the tool says why it is unavailable.

<a name="context-and-versions"></a>

## Context and versions

The engine repository, from 4.2.5 (the server's name `quest-n-click`). A created project runs the same server with
`npx quest-n-click mcp` (below). For a hosted Studio, the remote `/mcp` or `npm run mcp -- --server <url>`:
[Remote MCP](team.remote-mcp.md).

<a name="prerequisites"></a>

## Prerequisites

- Node 22.12 or later, the repository cloned and installed (`npm install`).
- The absolute path of your clone, written `/path/to/quest-n-click` below.

<a name="where-to-run"></a>

## Where to run the commands

The `claude mcp add` commands run in the engine repository. The other clients read a configuration file, named in
each section; the server then runs in the folder that file gives.

<a name="connect"></a>

## Steps: connect your client

Replace `/path/to/quest-n-click` with the absolute path of your clone. `npm --prefix <folder> run -s mcp` runs the
script inside `<folder>` whatever the client's working directory. Add `"env": { "GAME": "<id>" }` to work on another
game.

<a name="claude-code"></a>

### Claude Code

<!-- step: claude-code -->
1. The repository ships `.mcp.json` (project scope): open Claude Code in the repository and approve the `quest-n-click`
   server.

   ```json
   { "mcpServers": { "quest-n-click": { "type": "stdio", "command": "npm", "args": ["run", "-s", "mcp"], "env": {} } } }
   ```

   Or from the command line, in the repository (`-s local` by default; `-s project` writes `.mcp.json`):

   ```sh
   # in the engine repository
   claude mcp add quest-n-click -- npm run -s mcp
   claude mcp add quest-n-click -e GAME=demo -- npm --prefix /path/to/quest-n-click run -s mcp
   ```

<a name="claude-desktop"></a>

### Claude Desktop

<!-- step: claude-desktop -->
2. Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or
   `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

   ```json
   { "mcpServers": { "quest-n-click": { "command": "npm", "args": ["--prefix", "/path/to/quest-n-click", "run", "-s", "mcp"] } } }
   ```

   Claude Desktop does not start from your shell, so it may not find `npm` (no shell `PATH`). Then put npm's absolute
   path in `command`: the output of `which npm` in a terminal, for instance `"command": "/usr/local/bin/npm"`.

<a name="cursor"></a>

### Cursor

<!-- step: cursor -->
3. The repository ships `.cursor/mcp.json` (project). The same block in `~/.cursor/mcp.json` works for every project,
   with an absolute path instead of `${workspaceFolder}`:

   ```json
   { "mcpServers": { "quest-n-click": { "command": "npm", "args": ["--prefix", "${workspaceFolder}", "run", "-s", "mcp"] } } }
   ```

<a name="codex"></a>

### Codex CLI

<!-- step: codex -->
4. Add to `~/.codex/config.toml`:

   ```toml
   [mcp_servers.quest-n-click]
   command = "npm"
   args = ["--prefix", "/path/to/quest-n-click", "run", "-s", "mcp"]
   # env = { GAME = "demo" }
   ```

<a name="gemini"></a>

### Gemini CLI

<!-- step: gemini -->
5. Add to `~/.gemini/settings.json` (or `.gemini/settings.json` in the repository):

   ```json
   { "mcpServers": { "quest-n-click": { "command": "npm", "args": ["run", "-s", "mcp"], "cwd": "/path/to/quest-n-click" } } }
   ```

<a name="other-clients"></a>

### Any other client

Command `npm run -s mcp` (or `npx tsx tools/mcp/server.ts`) with the repository as working directory, transport
stdio. Node 22.12+.

<a name="created-project"></a>

### In a created project

A created project has no `mcp` script; its engine command starts the same server for the project's game. In any of
the configurations above, use `npx` with the arguments `quest-n-click mcp`, the project folder as working directory:

```sh
# in the created project
claude mcp add quest-n-click -- npx quest-n-click mcp
```

The repository's `.mcp.json` and `.cursor/mcp.json` are not copied into a created project: write the client's file
yourself.

<a name="docs-tools"></a>
<!-- applies: 4.5.0.. -->

### Reading the documentation through MCP

From 4.5.0, three tools read this wiki ([`tools/studio/tools.ts`](../../tools/studio/tools.ts)):

- `search_docs { query, lang?, audience?, context?, version?, type?, includeArchived?, limit?, cursor? }`: words or a
  question in French or English; each result is `id#section` with its title, type, context, versions, status, score,
  the reason of the match and an excerpt. No confident match gives an empty list and the index pages to try.
- `list_docs { audience?, context?, type?, lang?, state? }`: the pages there are to read, with their section ids.
- `read_doc { id, section?, lang?, maxChars?, cursor? }`: one page or one section, with where the text comes from
  (version, commit, doc revision) at its top; `maxChars` is 20,000 by default, 100,000 at most, and a `cursor` gives
  the rest.

`read_doc { name }` still answers as in 4.4.0: one of the eight historical pages (`CONTENT_GUIDE`, `ENGINE`, `TOOLS`,
`STUDIO`, `WORKFLOW`, `AUDIO`, `UPGRADING`, `CLASSICS`), in one text block, possibly shortened (below); the other
arguments are then ignored. Since 4.5.0 that page is rebuilt from the wiki's sections in the old page's order (`wiki/legacy.json`), within
1.5 times its 4.4.0 size: when the sections say more, the longest give their heading, their first paragraph and the
`read_doc { id, section }` that returns the rest. Giving both `name` and `id`, or neither, is a tool error: `give either name (one of the 8 legacy pages) or id,
not both`. In the engine repository the tools read `wiki/` as it is (draft pages included, said so in the
provenance); in an installed package they read its documentation bundle (ready pages only).

> [!LIMIT id=no-docs-remote]
> A hosted Studio's remote `/mcp` offers neither `read_doc` nor `search_docs` nor `list_docs`: an agent working on a
> hosted Studio reads the documentation through the local stdio server of the same engine version.

<a name="any-ai"></a>

## Any AI, not one AI

- `AGENTS.md` at the repository root is the vendor-neutral operating manual; `CLAUDE.md` points to it.
- Every MCP client connects the same way, with the configuration above.
- An AI without MCP still works: it edits the files, the Studio reloads (it watches them), you see the result and answer
  in Notes or in the Storyboard, and the AI reads `notes.json` back ([Notes](studio.notes.md)). Git carries the
  history. A typical session: [Working with an AI](create.working-with-ai.md#typical-session).

<a name="expected-result"></a>

## Expected result, and how to check it

The client lists the `quest-n-click` server as connected, with its tools. Ask it to call `list_rooms`: it answers with
the game's id, title, rooms and characters. In Claude Code, `claude mcp list` shows the server.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| The client rejects the server, an "invalid JSON" or parse error at start | npm's banner on stdout | Use `npm run -s mcp` (with `-s`) |
| Claude Desktop: the server fails to start, `npm` not found | No shell `PATH` | Put npm's absolute path (`which npm`) in `command` |
| The tools work on another game | `GAME` or the game last chosen | Add `"env": { "GAME": "<id>" }` |
| `screenshot` says it is unavailable | No dev server at `WEB_SCUMM_DEV_URL`, or no Playwright | Start `npm run studio`; install Playwright |
| `reading by id needs the documentation of wiki/, not available here` | No wiki or bundle where the server runs | Use `read_doc { name }`, or a 4.5.0 engine |

More: [Studio troubleshooting](studio.troubleshooting.md#mcp).

<a name="files-changed"></a>

## Files or data changed

The client's configuration file only (`.mcp.json` with `claude mcp add -s project`). The server writes the game's
files when a tool writes, as the Studio would.

<a name="references"></a>

## References

- [`tools/mcp/server.ts`](../../tools/mcp/server.ts), [`tools/mcp/tools-server.ts`](../../tools/mcp/tools-server.ts),
  [`.mcp.json`](../../.mcp.json), [`.cursor/mcp.json`](../../.cursor/mcp.json).
- [MCP tools](studio.mcp-tools.md), [Remote MCP](team.remote-mcp.md), [Working with an AI](create.working-with-ai.md).
