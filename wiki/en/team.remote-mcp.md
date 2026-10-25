# Remote MCP

An AI agent (Claude Code, Cursor, any MCP client) can work on a team Studio as a member: with your role, inside the
spans others hold, its writes in the journal under your name. This page connects an agent to a hosted Studio, either
over HTTP to the server's own `/mcp`, or through the local MCP server pointed at the Studio, and lists the tools each
offers.

<a name="what-you-get"></a>

## What you get

An agent that reads, checks and (with a dev's role) edits the hosted game through the same checks as the Studio's
page: the gate, the role, the spans, the journal, a retry applied once.

<a name="context-and-versions"></a>

## Context and versions

A hosted Studio (the Studio Server) with OIDC, from 4.2.3 ([ADR 0029](../../docs/dev/adr/0029-remote-mcp.md)). For the
local MCP on your own game folder, see [Local MCP: setting up each client](studio.mcp-setup.md) and
[MCP tools](studio.mcp-tools.md).

<a name="prerequisites"></a>

## Prerequisites

- A member's account: a `reviewer` at least to read and check, a `dev` to write.
- The Studio's provider gives the CLI or the agent **access tokens as JWTs for the Studio's audience**
  (`oidc.audience`). Keycloak does with an audience mapper; a provider that issues opaque access tokens (GitLab's
  OAuth applications, at the time of writing) cannot serve the CLI nor the remote MCP (see
  [Generic OIDC and GitLab](clever.generic-oidc.md)).
- For the local way: the engine repository (or the installed package) on your machine, and the CLI logged in.

<a name="where-to-run"></a>

## Where to run the commands

On your machine, in the engine repository's folder (or a created project with the package installed). The agent's
configuration is your MCP client's file.

<a name="steps"></a>

## Steps

<!-- step: choose -->
1. **Choose the way.**
   - **Remote, over HTTP**: the server's `/mcp`, in MCP's Streamable HTTP transport, stateless (each POST a whole
     exchange, answered in JSON). Nothing to run locally, but the token lasts minutes.
   - **Local, over stdio, pointed at the server**: the same tools, through the Studio's API, with the CLI's token
     refreshed by itself. Better for a long session.

<!-- step: remote-token -->
2. **Remote: give the client a token.** A client that follows MCP's authorization finds the provider at
   `/.well-known/oauth-protected-resource/mcp` (RFC 9728); the token it gets must carry the Studio's `oidc.audience`. A
   provider that sets the audience from MCP's `resource` parameter gives `<public URL>/mcp`: set `oidc.audience` to
   that URL. Keycloak needs an audience mapper either way, and a client registered for the agent. Otherwise give it a
   token yourself:

   ```sh
   # on your machine, in the engine repository
   npm run studio-server -- login --server https://studio.example.fr   # once: the device flow
   npm run studio-server -- token --server https://studio.example.fr   # prints an access token
   ```

   and send it as `Authorization: Bearer <token>`:

   ```json
   { "mcpServers": { "quest-n-click": { "type": "http", "url": "https://studio.example.fr/mcp", "headers": { "Authorization": "Bearer <token>" } } } }
   ```

   The token lasts minutes: the Studio refuses an access token that lives longer than 5 minutes, or the configuration's
   `oidc.maxTokenSeconds` (30 to 900). Give the client a new one when it ends. The browser's session cookie is never
   accepted there.

<!-- step: local-stdio -->
3. **Local: point the stdio server at the Studio.** Log in once, then start the MCP server with `--server`:

   ```sh
   # on your machine, in the engine repository
   npm run studio-server -- login --server https://studio.example.fr
   npm run -s mcp -- --server https://studio.example.fr
   ```

   In a client's configuration, the command is `npm` with the arguments
   `["--prefix", "/path/to/quest-n-click", "run", "-s", "mcp", "--", "--server", "https://studio.example.fr"]`. The
   token is refreshed by itself; https only.

<!-- step: first-call -->
4. **Check it works.** Ask the agent to call `list_rooms`. Its first instructions say it is on a shared Studio: a part
   another member holds refuses its write (423), and it should say what it needs in a note.

<a name="tools"></a>

## The tools offered

| Offered on a hosted Studio (both ways) | Not offered there |
|---|---|
| `list_rooms`, `get_room`, `get_ir`, `get_storyboard`, `get_notes` | `screenshot` (needs a browser on the machine) |
| `set_layout`, `set_text`, `set_value`, `add_entity`, `set_storyboard`, `add_note` | `run_tests` (needs the repository) |
| `validate`, `solve` (without a `reality` policy: a 501), `lint`, `content_report` | `read_doc`, `search_docs`, `list_docs` (the documentation) |
| `world_graph`, `dialogue_tree`, `puzzle_graph`, `storyboard_coverage`, `playtests` | `asset_prompts`, `speedrun_verify` |

A tool whose ability the backend lacks is not offered at all. An agent on a hosted Studio reads the documentation
through the local stdio MCP of the same engine version, without `--server`.

<a name="semantics"></a>

## What an agent's write is

- **A member's write.** Each tool call is a request to the Studio's `/api` with your token: your role, your spans, your
  name in the journal and the audit. A reviewer's agent cannot write (403).
- **423 like you.** A span another member holds refuses the write, and the tool returns the message naming them.
- **No base revision.** An agent sends no `x-studio-base`: its writes are computed by the server on the file as it is
  now and checked by the validation guard, but not refused because someone wrote the file since the agent read it.
- **Applied once.** Each write carries its own operation id.
- **Notes.** A note an agent adds without an author is signed `ai`, recorded under your member's name all the same
  (over HTTP the server never sees the MCP client's name).
- **Removed, stopped.** A member removed is refused at the next call; their tokens are revoked with them.

> [!GUARANTEE id=mcp-bearer-only]
> `/mcp` asks for a Bearer token, and refuses a token of another audience, the session cookie, a non-member, and a GET.

> [!LIMIT id=mcp-remote-limits]
> One JSON-RPC message per request: a batch is refused (400). `GET` and `DELETE` on `/mcp` answer 405 (no stream, no
> session). A tool's request gives up after 5 minutes, or when the client goes away. Many expired tokens at once can
> make the next refusals 429 for a minute (they are counted for the loopback's address); valid requests are never
> slowed.

<a name="expected-result"></a>

## Expected result, and how to check it

`list_rooms` answers the hosted game's rooms. A write made by the agent appears in the Studio's header as a new
revision, in your name; `GET /api/ops` lists it.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| 401 with `WWW-Authenticate: Bearer resource_metadata="…"` | No token, or an expired one | Give a token; renew it |
| 401 `the access token is not valid` | Another audience, an id_token, or a token living longer than allowed | Configure the audience mapper; use an access token |
| 403 `not a member of this project` | The account has no membership | Ask an owner for an invitation |
| `not logged in to <url>: run studio-server login --server <url>` | The local way without a login | Log in first |
| `<url> is not https: the tokens would travel in clear` | An http URL | Use the https URL |
| The tool returns a 423 message | A span someone holds | Leave a note, or wait |

<a name="files-changed"></a>

## Files or data changed

The agent's writes are operations of the journal like yours. The local way keeps tokens in
`~/.config/web-scumm/studio-tokens.json` (mode 0600).

<a name="recovery"></a>

## Recovery or going back

The agent's operations are yours: your Undo in the Studio takes them back, latest first. To stop an agent at once,
stop its process or remove its token from the client. An owner's **End sessions** on your account refuses every token
issued before now, but a local stdio server gets a new one from its refresh token (see
[Managing members](team.members.md#end-sessions)).

<a name="references"></a>

## References

- [ADR 0029](../../docs/dev/adr/0029-remote-mcp.md), [`studio-server/src/server/mcp.ts`](../../studio-server/src/server/mcp.ts).
- [`tools/studio/http-backend.ts`](../../tools/studio/http-backend.ts), [`tools/mcp/tools-server.ts`](../../tools/mcp/tools-server.ts).
- [The server's command line](team.server-cli.md#login).
