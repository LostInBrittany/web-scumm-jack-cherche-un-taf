# Studio troubleshooting

The local Studio refuses something, or a tool in it says it is unavailable. Find the exact message below: each one
has its cause and its fix. Nothing in this page concerns the hosted Studio, whose 409 and 423 have their own pages
(see "Neighbouring cases").

<a name="symptom"></a>

## Symptom

The messages, as the Studio, its server or the MCP server print them:

| Message or code | Where | Section |
|---|---|---|
| `✖  games/<id>/index.ts not found (GAME=<id>)` | Terminal, at `npm run studio` | [Start](#start) |
| 400 `invalid Host` | Browser or script | [Access](#access) |
| 403 `the Studio answers its own names only (localhost, 127.0.0.1, [::1], or the address dev:lan serves)` | Browser, phone | [Access](#access) |
| 403 `cross-origin Studio request refused` | Browser, script | [Access](#access) |
| 403 `Studio writes require a same-origin Origin header` | Script (curl, an agent's HTTP call) | [Access](#access) |
| 401 `Studio token required` | Phone, browser in LAN mode | [Access](#access) |
| 503 `LAN Studio token is not configured` | LAN mode started by hand | [Access](#access) |
| 422 `refused: the edit adds N validation error(s): …` | A toast in the Studio | [Edits](#edits) |
| 422 `refused: the game would no longer load after the edit (…); nothing was written` | A toast | [Edits](#edits) |
| 500 `refused: the edit would break <file> (…)` | A toast | [Edits](#edits) |
| 409 `cannot undo "<what>": <file> changed since` | Undo in the header | [Edits](#edits) |
| 409 with `conflicts` | Assets tab upload | [Edits](#edits) |
| 501 `unavailable` … `Playwright is not installed (npm i -D playwright && npx playwright install chromium)` | Check tab: Screenshot, captures | [Checks](#checks) |
| `The voice table needs the dev server (npm run studio).` / `The scenario map needs the dev server or a hosted Studio.` | Demo Studio | [Checks](#checks) |
| `custom provider URLs are disabled (set WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1 to opt in)` | Assistant | [Assistant](#assistant) |
| `<url> did not answer within 60 s`, `the provider's answer exceeds 8 MB`, `… answered with a redirect …` | Assistant | [Assistant](#assistant) |
| The MCP client cannot parse the server's output; Claude Desktop cannot start `npm` | AI client | [MCP](#mcp) |

<a name="causes"></a>

## Possible causes

<a name="start"></a>

### Start

- `GAME` (or the game last chosen with `npm run game`, or `config.game`) names a folder without `index.ts`: a typo, or
  a game not created yet.

<a name="access"></a>

### Access (400, 401, 403, 503)

The Studio's routes answer only their own machine, same-origin requests, and in LAN mode the session's token
([Local and LAN security](studio.security.md)).

- **403 own names**: the page was opened by a name that is not `localhost`, `127.0.0.1` or `[::1]` (a custom host name,
  the machine's address without `studio:lan`), or a page tried DNS rebinding.
- **403 cross-origin**: the request came from another origin (another port, another site, a page opened from a file).
- **403 same-origin Origin header**: a write sent without an `Origin` header (curl, a script).
- **401 token**: LAN mode, and the request carries no token, or the token of an earlier session (a new one is drawn
  at each start).
- **503 token not configured**: `WEB_SCUMM_LAN=1` was set by hand without `WEB_SCUMM_STUDIO_TOKEN`.
- **400 invalid Host**: a `Host` header missing or holding spaces, `/`, `@` or `\`.

<a name="edits"></a>

### Edits (409, 422, 500)

- **422**: the guard judged the game as it would be after the edit, and the edit adds validation errors or stops the
  game from loading. Nothing was written ([Preview, apply, undo](studio.preview-apply.md)).
- **500 would break**: the change would make the file's TypeScript invalid.
- **409 undo**: the file was written again since that operation (by an AI, an editor, git, or another write of the
  Studio). Another 409, without undo: a file another process rewrote while the edit was being prepared.
- **409 conflicts**: an uploaded sheet would recut cells that exist, and they were not named
  ([Assets and cutting](studio.assets.md)).

<a name="checks"></a>

### Checks and tools (501, "needs the dev server")

- **501**: Playwright or its Chromium is missing on this machine (Screenshot, before/after captures); or the Studio is
  a hosted one, which has no captures.
- **"needs the dev server"**: the demo Studio has no server: no voice table, no scenario map, no semantic diff, no
  structured writes, no screenshots ([Demo mode](studio.demo-mode.md)).

<a name="assistant"></a>

### Assistant

- **Custom provider disabled**: the base URL is not a preset (OpenAI, Anthropic, Mistral) nor Ollama on this machine.
- **HTTPS / private host**: with the opt-in, the URL is `http://` or a local or private address.
- **60 s, 8 MB, redirect**: the provider was too slow, answered too much, or redirected
  ([The Assistant](studio.assistant.md#limits)).
- **CORS in the demo**: the provider refuses calls from a web page (OpenAI does for some keys).
- **"Stopped after 12 tool rounds"**: the request needed more rounds than one turn allows.

<a name="mcp"></a>

### MCP

- **The client cannot parse the output**: the config runs `npm run mcp` without `-s`, and npm's banner reaches stdout.
- **Claude Desktop cannot start `npm`**: it does not have your shell's `PATH`.
- **The wrong game**: `GAME` unset, so the server took the game last chosen or `config.game`.

<a name="diagnosis"></a>

## Diagnosis

- The browser's network panel shows the status and the body (the message above) of the refused request.
- The terminal running `npm run studio` shows the dev server's errors; the MCP server writes its own on stderr, with
  `[quest-n-click mcp]` in front.
- In LAN mode, compare the URL you opened with the one the command printed: host, port and `token=`.
- For a 422, the toast lists the first errors; the Check tab gives them all.

<a name="fix"></a>

## Fix

<!-- step: fix-start -->
1. **Start.** Point `GAME` at a game that exists:

   ```sh
   # in the engine repository
   GAME=demo npm run studio
   ```

<!-- step: fix-access -->
2. **Access.** Open the Studio at `http://localhost:5173/__studio/` on the machine itself. From a phone, start
   `npm run studio:lan` and open the URL it prints, token included; after a restart, open the new URL. A script sends
   `Origin: http://localhost:5173` (and in LAN mode `x-web-scumm-token: <token>`). Never set `WEB_SCUMM_LAN=1` by hand:
   use the LAN scripts.

<!-- step: fix-edits -->
3. **Edits.** For a 422, read the errors and change the value; for an undo refused, compare with `git diff` and take the
   file back with git; for a 409 `conflicts`, tick **recut** on the cells to replace.

<!-- step: fix-playwright -->
4. **Playwright.** Install it where the Studio runs:

   ```sh
   # in the engine repository or the created project
   npm i -D playwright && npx playwright install chromium
   ```

<!-- step: fix-assistant -->
5. **Assistant.** Use a preset, or restart with the opt-in for an HTTPS public endpoint:

   ```sh
   # in the engine repository or the created project
   WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1 npm run studio
   ```

   For a local model, use the Ollama preset; in the demo Studio, Ollama with `OLLAMA_ORIGINS=<the page's origin>`, or
   the local Studio. After "Stopped after 12 tool rounds", ask again to continue.

<!-- step: fix-mcp -->
6. **MCP.** Write `npm run -s mcp` in the client's configuration; for Claude Desktop, npm's absolute path (`which npm`)
   in `command`; add `"env": { "GAME": "<id>" }` ([Local MCP: setting up each client](studio.mcp-setup.md)).

> [!LIMIT id=local-only-page]
> This page covers the local Studio and the local MCP server. A hosted Studio's refusals (401 to a session, 409 stale
> base, 423 span locked, 503 during a redeploy) are in the Team pages.

<a name="check-fixed"></a>

## How to check it is fixed

The Studio opens on the Rooms tab and a text edit shows its toast; the Check tab's badge is green; the Assistant
answers; the MCP client lists the `quest-n-click` tools and `list_rooms` answers.

<a name="neighbours"></a>

## Neighbouring cases

- **409 "The file changed since you read it"** on a hosted Studio: [stale base revision (409)](team.write-refused-409.md).
- **423** on a hosted Studio: [span locked (423)](team.write-refused-423.md). The local Studio has no 423.
- **The engine itself does not install or run** (Node, Python, Chromium): [Install troubleshooting](install.troubleshooting.md).
- **Something is visible but the hero cannot reach it**: [Something is visible but unreachable](create.unreachable.md).
