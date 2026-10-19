# MCP: the Studio for any AI assistant

`npm run mcp` starts a [Model Context Protocol](https://modelcontextprotocol.io) server over **stdio** that exposes the
Studio operations (`studio-server/src/ops/core.ts`, see STUDIO.md) as tools. Any MCP client (Claude Code, Claude Desktop,
Cursor, Codex CLI, Gemini CLI, a hand-written agent) can then read and edit a game exactly like the Studio does, and
the human sees the result live in `npm run studio` (it watches the files).

- Server: `tools/mcp/server.ts`, SDK `@modelcontextprotocol/sdk` 1.x. Name `web-scumm`. The tools are defined once in `tools/studio/tools.ts`,
  shared with the Studio's Assistant (STUDIO.md, "Assistant").
- Game: `GAME=<id>` (or `GAME_DIR=<folder>`) as for every tool; default `package.json` `config.game`.
- stdout carries the protocol only; logs go to stderr. Use `npm run -s mcp` (silent) in client configs: without `-s`,
  npm prints its `> web-scumm mcp` banner on stdout, which strict clients reject.
- A failing operation (unknown room, bad path, broken edit…) returns a tool error with the message; the server keeps
  running.

## Tools

| Tool | Arguments | Does |
|---|---|---|
| `list_rooms` | | game info: id, title, hero, rooms, characters, items, verbs, checkpoints, objectives (4.1.12), images |
| `get_room` | `id` | `{ def, layout, texts, file }`: every editable text with its JSON path |
| `set_layout` | `id, layout` | writes `layout/<id>.json` (the whole Layout) |
| `set_text` | `id, path, value \| null` | replaces a text literal in `rooms/<id>.ts`; `null` deletes a line; a path ending in `[+]` appends (`look.piano[+]`, `on[3].do[+]`) |
| `set_value` | `id, path, value \| null, dry?` | writes a structured value as code in `rooms/<id>.ts` (3.4): a reaction (`on[3]`, `on[<length>]` adds one), a condition (`on[3].if`), a command list (`on[3].do`), the room's `stage` or `renderer`; `null` removes; `dry` returns the diff only; the game is validated after the write and an edit that adds an error is taken back |
| `set_value` on the game | `id: "@game", path, value \| null, dry?` | the same in the game file's `defineGame({...})` (4.1.12), for its objectives only: `objectives.<id>` (`{ title, done, optional?, parent? }`) or one of its fields; validated the same way, so an objective whose `done` can never hold is refused |
| `get_ir` | | the game's intermediate representation (4.1.12): rooms, entities, rules, topics, listeners, scripts, objectives, Reality policies, trusted extensions by name, each id with its `file:line` (`provenance`); the JSON of `npm run ir -- --json` |
| `add_entity` | `id, kind, entityId, name?, img?, char?, at?, look?` | adds a prop / hotspot / actor to the room file and the layout (`at` defaults to `[320, 300]`) |
| `get_storyboard` / `set_storyboard` | `storyboard` | reads / writes `storyboard.json` (`{ boards: [...] }`) |
| `get_notes` / `add_note` | `about?, author?, text` | the shared log `notes.json`; `author` defaults to the MCP client's name, else `ai`; notes with `task: true` are requests the human sent from the Studio's Assistant |
| `validate` | | `{ ok, errors, warnings, ms }` |
| `solve` | `from?, profile?, prove?, reality?` | proves the game can be finished (from New Game or a checkpoint); `reality` (4.1.1, a game with `reality.signals`): the world to solve in, `closed`, a scenario `{ scenario, signals }` or `adversarial`, simulated, no service contacted; `prove: true` runs the exhaustive search (every reachable state, the softlocks; slow on a big game); `profile: true` adds what the states are made of and what the search cost (independent dimensions, rooms with runaway branching, monotonic things) |
| `content_report` | | the content profiler as Markdown: per room, item and character, what is thin; unreachable rooms |
| `world_graph` | | the rooms and the ways between them as DOT, with unreachable rooms and exits with no way back |
| `dialogue_tree` | `id, actor?` | a character's conversation in a room as an indented tree: topics with their conditions, lines, choices and their options, branches; derived from the topics |
| `puzzle_graph` | `id?` | what every rule, topic, script and listener needs and changes. Without `id`: the overview (every item and flag, what produces and uses it, flags read but never set, things produced but never used). With `id` (item, flag, prop, place, event): its card: acquired by, consumed by, used by, requires first, unlocks, downstream, and why the solver keeps it (critical, world, visible or dead, with the chain to the end) |
| `storyboard_coverage` | | the storyboard checked against the content, as Markdown: per board and panel, whether its room, speakers, lines, topics, sounds and actions exist in the game (ok, partial, missing, unknown); what of the story is not implemented yet |
| `playtests` | | the sessions players shared (`games/<id>/playtests/`) replayed on the current content and summed up, as Markdown: time per room, stalls, hints, where they stopped, sessions the content has outgrown |
| `speedrun_verify` | `path?, envelope?` | a speedrun's `.wsrun` (a file under the project, or its text) replayed against the game: `{ verdict, code, reason, trust }` (4.1.14, `docs/en/SPEEDRUN.md`); only `valid` ranks, `inconclusive` never does |
| `lint` | `prove?` | the content lint as Markdown (`npm run lint`): conditions nothing can satisfy, hidden rules, red herrings, stuck hints, dead options, and after a solver run the live actions never run and the rooms never reached; each finding with its path, id and fix |
| `screenshot` | `room, checkpoint?` | PNG of the room under `.cache/studio/`; needs the dev server (`npm run studio`) at `WEB_SCUMM_DEV_URL` (default `http://localhost:5173/`) and Playwright, else says why it is unavailable |
| `read_doc` | `name` | one of `CONTENT_GUIDE`, `ENGINE`, `TOOLS`, `STUDIO`, `WORKFLOW`, `AUDIO`, `UPGRADING`, `CLASSICS` (docs/en): the agent learns the DSL, the audio pipeline, the v2 → v3 move and the classic mechanics through MCP |
| `run_tests` | | runs `npx vitest run`, returns the summary and the failures |
| `asset_prompts` | `missing?` | the art prompts of `npm run prompts` (markdown), and `{ missing, sheets }` as structured content: the image ids not cut yet |

Resources: `webscumm://game` (= `list_rooms`) and `webscumm://room/<id>` (= `get_room`), JSON.

## Connect your client

Replace `/path/to/web-scumm` with the absolute path of your clone. `npm --prefix <dir> run -s mcp` runs the script
inside `<dir>` whatever the client's working directory. Add `"env": { "GAME": "<id>" }` to work on another game.

### Claude Code
The repository ships `.mcp.json` (project scope): open Claude Code in the repo and approve the `web-scumm` server.
```json
{ "mcpServers": { "web-scumm": { "type": "stdio", "command": "npm", "args": ["run", "-s", "mcp"], "env": {} } } }
```
Or from the command line, in the repo (`-s local` by default; `-s project` writes `.mcp.json`):
```
claude mcp add web-scumm -- npm run -s mcp
claude mcp add web-scumm -e GAME=demo -- npm --prefix /path/to/web-scumm run -s mcp
```

### Claude Desktop
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json`:
```json
{ "mcpServers": { "web-scumm": { "command": "npm", "args": ["--prefix", "/path/to/web-scumm", "run", "-s", "mcp"] } } }
```
If Claude Desktop does not find `npm` (no shell PATH), put its absolute path (`which npm`) in `command`.

### Cursor
The repository ships `.cursor/mcp.json` (project); the same block in `~/.cursor/mcp.json` works globally with an absolute path:
```json
{ "mcpServers": { "web-scumm": { "command": "npm", "args": ["--prefix", "${workspaceFolder}", "run", "-s", "mcp"] } } }
```

### Codex CLI
`~/.codex/config.toml`:
```toml
[mcp_servers.web-scumm]
command = "npm"
args = ["--prefix", "/path/to/web-scumm", "run", "-s", "mcp"]
# env = { GAME = "demo" }
```

### Gemini CLI
`~/.gemini/settings.json` (or `.gemini/settings.json` in the repo):
```json
{ "mcpServers": { "web-scumm": { "command": "npm", "args": ["run", "-s", "mcp"], "cwd": "/path/to/web-scumm" } } }
```

### Any other client
Command `npm run -s mcp` (or `npx tsx tools/mcp/server.ts`) with the repository as working directory, transport stdio.
Node 22.12+.

## A hosted Studio (4.2.3)

On a Studio Server (`docs/en/STUDIO-SERVER.md`) an agent works as a member, through the server's own checks: its
role, the spans others hold (a 423 it reads), the journal (its writes are revisions in the member's name). Two ways:

- **Remote, over HTTP**: the server's `/mcp` (MCP's Streamable HTTP, stateless). A client that follows MCP's
  authorization finds the OIDC provider at `/.well-known/oauth-protected-resource/mcp` (RFC 9728); the token it gets
  must carry the Studio's `oidc.audience` (a provider that takes it from MCP's `resource` gives `<public>/mcp`: set
  `oidc.audience` to that; Keycloak needs an audience mapper, and a client registered for the agent). Otherwise give
  it one: `npm run studio-server -- token --server <url>` prints an access token, sent as `Authorization: Bearer
  <token>`; it lasts minutes (`oidc.maxTokenSeconds`), so a long session is better on the stdio server below. The
  session cookie of the browser is never accepted there. One JSON-RPC message per request (no batch).
  ```json
  { "mcpServers": { "web-scumm": { "type": "http", "url": "https://studio.example.fr/mcp", "headers": { "Authorization": "Bearer <token>" } } } }
  ```
- **Local, over stdio, pointed at the server**: `npm run studio-server -- login --server <url>` once, then
  `npm run -s mcp -- --server <url>` (the token refreshed by itself; https only).

What only a machine with the repository can do is not offered there: screenshots, the test suite, the documents,
the asset prompts. An agent sends no revision it read: its writes are made by the server on the file as it is (the
guard checks them), not refused because someone wrote the file since (ADR 0029).

## A typical session
1. `read_doc CONTENT_GUIDE`, `list_rooms`, `get_storyboard`, `get_notes`.
2. Edit: `set_storyboard` first, then `set_text` / `add_entity` in the rooms.
3. `validate`, `solve`, `lint`, `run_tests`; `screenshot` if the human runs the Studio.
4. `add_note` for anything the human must decide or place; read their answer with `get_notes`.
