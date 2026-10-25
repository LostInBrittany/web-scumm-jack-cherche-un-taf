# Error codes and messages

What an error code or an error message of quest'n'click means: the HTTP statuses of the Studio's API (the local dev
server and the hosted Studio Server), the Reality Bridge's codes, the solver's statuses, and the exit codes of the
commands that check a game. Search this page for the exact code or the start of the message you got: a message with a
part filled at run time is written with `…` in that place.

<a name="quick-entry"></a>

## Quick entry, by what you see

| You see… | What it means | What to do |
|---|---|---|
| `409` from the hosted Studio | [someone changed the same thing first](#studio-409) | [409 on the hosted Studio](team.write-refused-409.md) |
| `423` from the hosted Studio | [another member holds that part of the game](#studio-423) | [423 on the hosted Studio](team.write-refused-423.md) |
| `401` or `403` from the Studio | [not signed in, or not allowed](#studio-401) | [hosted Studio troubleshooting](clever.troubleshooting.md), [local Studio troubleshooting](studio.troubleshooting.md) |
| `422` after a save in the Studio | [the change would add a validation error](#studio-422) | read its `errors`, fix them, save again |
| an error from the Reality Bridge | [its status and code](#bridge) | [Bridge troubleshooting](bridge.troubleshooting.md) |
| `npm run solve` exits with 1 or 2 | [no way to the end, or a search cut short](#exit-solve) | [checking your game](create.checking.md) |
| another command exits non-zero | [its exit codes](#exits) | the line of that command |

<a name="how-to-read"></a>

## How to read this page

- **An HTTP answer of the Studio** is JSON, `{ "error": "<message>" }`, sometimes with more fields (`errors` and `diff`
  for a 422, `unavailable` and `reason` for a 501, the span and its holder for a 423). Look up its status under
  [Studio API](#studio), then its message in the list below the status.
- **An HTTP answer of the Bridge** is `{ "error": "<code>", "message": "<message>" }`: look up the status and the code
  under [Reality Bridge](#bridge).
- **A command's exit code** (in a terminal, `echo $?` right after it; in CI, the step's result): see
  [Solver statuses](#solver) and [Exit codes of the checking commands](#exits).
- The messages are the code's own, in English: an API answers in English whatever the page's language. Most come with
  a troubleshooting page: [409 on the hosted Studio](team.write-refused-409.md), [423 on the hosted
  Studio](team.write-refused-423.md), [the Bridge's 409 and 503](bridge.troubleshooting.md).

The sections from "Studio API" to "Exit codes of the checking commands" are generated from the code and from
[`wiki/data/errors.json`](../../wiki/data/errors.json) (`npm run wiki -- generate reference.error-codes`, in the engine
repository): a status the code raises and the register does not describe fails `npm run wiki -- check`.

<a name="dev-server-answers"></a>

## The dev server's own answers

The local Studio's API (`/__studio/api/*`, [`tools/studio/plugin.ts`](../../tools/studio/plugin.ts)) also answers,
outside the `StudioError`s listed below:

| Status | Message | When |
|---|---|---|
| 404 | `no such endpoint: <path>` | no route has that path |
| 405 | `method <METHOD> not allowed on <path>` | the path exists, with another method |
| 404 | `no such screenshot` | `GET screenshots/<name>.png` of a capture that is not there |
| 404 | `no such endpoint: assets<path>`, `no such file` | the Assets tab's routes: an unknown route, a file outside `art/` and `audio/` |
| 405 | `method <METHOD> not allowed on assets<path>` | an Assets route with another method |
| 413 | `body too large` | a request body over the bound (the Assets tab takes up to 96 MiB) |
| 500 | the error's message | anything else thrown: the dev server writes its stack to its terminal |

<a name="bridge-other-answers"></a>

## The Bridge's other answers

Besides its `BridgeError`s, the Bridge's server ([`bridge/src/server.ts`](../../bridge/src/server.ts)) answers:

| Status | Body | When |
|---|---|---|
| 503 | `{ "error": "busy", "message": "the store is busy: try again in a second" }`, with `Retry-After: 1` | another process held the store's write lock longer than the request could wait; nothing was written, send it again |
| 503 | `{ "status": "unavailable" }` | `GET /readyz` or `/healthz` while the store does not answer |
| 500 | `{ "error": "internal" }` | an unexpected error, logged as a JSON line `{"event":"error", …}` on its output |
| 404 | `{ "error": "not found" }` | no route has that method and path |

<!-- generated:begin -->

<a name="studio"></a>

## Studio API (dev server and Studio Server)

Every refusal the Studio raises as a `StudioError`, by HTTP status. The answer is JSON, `{ "error": "<message>" }` (sometimes with more fields); the messages below are the code's, in English. `…` stands for a part filled at run time.

<a name="studio-400"></a>

### 400

A malformed request: a field missing or of the wrong type, an id that is not one, a body that is not a JSON object, a header of the Studio Server that does not have its form. Nothing was written. Fix the request as the message says and send it again.

Messages:

- `2,000 revisions at most between from and to` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `` `about` must be a string `` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts), [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts))
- `` `after` is a revision number `` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `` `at` must be [x, y] `` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts), [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts))
- `` `cell` must be like r1c2, or pose/t1 in a talk kit `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `cells` is empty `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `cells` must be a list like r1c1,r2c3 `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `data` (base64) is required `` ([`studio-server/src/server/hosted-assets.ts`](../../studio-server/src/server/hosted-assets.ts), [`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `data` is empty or not base64 `` ([`studio-server/src/server/hosted-assets.ts`](../../studio-server/src/server/hosted-assets.ts), [`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `email` is required `` ([`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts))
- `` `file` must be a plain file name ending in … `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `good` and `bad` are revision numbers `` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `` `grid` must be COLSxROWS, e.g. 6x4 `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `id` must be letters, digits and _ (not starting with a digit) `` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts), [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts))
- `` `key` must be auto, always or never `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `kind` must be music or sfx `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `kind` must be prop, hotspot or actor `` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts), [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts))
- `` `messages` must be a non-empty array `` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `` `name` is required for a prop or a hotspot `` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `` `name` must be letters, digits, _ and - `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `path` is a relative path of the game `` ([`studio-server/src/server/play.ts`](../../studio-server/src/server/play.ts))
- `` `path` is required `` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `` `provider.apiKey` must be a string `` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `` `provider.baseUrl` is not a valid URL `` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `` `provider.baseUrl` must be an http(s) URL `` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `` `provider.kind` must be openai, anthropic or ollama `` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `` `provider.model` is required `` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `` `resolved` is true or false `` ([`studio-server/src/server/comments.ts`](../../studio-server/src/server/comments.ts))
- `` `role` is owner, dev or reviewer `` ([`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts))
- `` `room` is required `` ([`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts))
- `` `sheetId` must be a sheet of art/ (not decor) `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `sheetId` must be letters, digits, _ and - (not "decor") `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `span` names one span `` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `` `spans` is a list of span names (room:<id>, lang:<code>, game, items, …) `` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `` `text` is required `` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts), [`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `` `value` must be a string or null `` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `` `…` must be a string `` ([`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts))
- `a comment is a text of 1 to … characters` ([`studio-server/src/server/comments.ts`](../../studio-server/src/server/comments.ts))
- `a decor must be a PNG or a JPEG image` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `a logout token is form-encoded` ([`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts))
- `an anchor is a stable id of the game (letters, digits, . : @ - _)` ([`studio-server/src/server/comments.ts`](../../studio-server/src/server/comments.ts))
- `custom provider URLs are disabled (set WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1 to opt in)` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `custom providers must use HTTPS and cannot target local or private network hosts` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `each message is { role: "user" | "assistant", content: string }` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `from and to are revisions, from ≤ to` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `image not in the manifest: "…"` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `invalid checkpoint: "…"` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `invalid room id: "…"` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `logout_token is required` ([`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts))
- `malformed voice id "…"` ([`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts))
- `not a cell of a … grid: "…"` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `not a path in the game: "…"` ([`studio-server/src/ops/journal.ts`](../../studio-server/src/ops/journal.ts))
- `npm run assets only prepares a game under games/<id>/` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `provider URLs cannot contain credentials` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `ref must be a branch of the repository or a commit` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))
- `the body is a JSON object` ([`studio-server/src/server/play.ts`](../../studio-server/src/server/play.ts))
- `the body is not valid JSON` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts), [`tools/studio/assets.ts`](../../tools/studio/assets.ts), [`tools/studio/plugin.ts`](../../tools/studio/plugin.ts))
- `the body must be a JSON object` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts), [`tools/studio/assets.ts`](../../tools/studio/assets.ts), [`tools/studio/assistant.ts`](../../tools/studio/assistant.ts), [`tools/studio/plugin.ts`](../../tools/studio/plugin.ts))
- `the last message must be the user's` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `the layout must be an object` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `the logout token is not valid` ([`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts))
- `the logout token was already used` ([`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts))
- `unknown character: "…"` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `unknown checkpoint: "…"` ([`studio-server/src/ops/diagnose.ts`](../../studio-server/src/ops/diagnose.ts))
- `x-studio-base must be a revision` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `x-studio-client must be 8 to 64 letters, digits, - or _` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `x-studio-fences is a JSON object of span → fence` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `x-studio-op must be 8 to 64 letters, digits, - or _` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- and 12 message(s) built at run time.

<a name="studio-401"></a>

### 401

Not signed in, or the credentials are not valid: a hosted Studio's session is missing or expired (the answer may carry `login: "/auth/login"`), the remote MCP or the metrics came without their token. Sign in again (`quest-n-click-studio-server login --server <url>` for the CLI and the MCP).

Messages:

- `an access token is required` ([`studio-server/src/server/mcp.ts`](../../studio-server/src/server/mcp.ts))
- `the metrics need their token` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- and 2 message(s) built at run time.

<a name="studio-403"></a>

### 403

Signed in, and not allowed: not a member of this project, a role too low for the action (a reviewer writes nothing), a request from another origin, a game page opened outside a browser session, a comment that is not yours, a job someone else started. Ask an owner for the role.

Messages:

- `a reviewer resolves their own threads` ([`studio-server/src/server/comments.ts`](../../studio-server/src/server/comments.ts))
- `forbidden` ([`studio-server/src/server/auth/gate.ts`](../../studio-server/src/server/auth/gate.ts))
- `not a member of this project` ([`studio-server/src/server/auth/gate.ts`](../../studio-server/src/server/auth/gate.ts))
- `only its author changes a comment's text` ([`studio-server/src/server/comments.ts`](../../studio-server/src/server/comments.ts))
- `only who started a job, or an owner, cancels it` ([`studio-server/src/server/jobs.ts`](../../studio-server/src/server/jobs.ts))
- `origin refused` ([`studio-server/src/server/auth/gate.ts`](../../studio-server/src/server/auth/gate.ts))
- `the game is opened from a browser session` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- and 1 message(s) built at run time.

<a name="studio-404"></a>

### 404

What the request names is not there: a room, a note, a line, a revision, a build, a job, a file, a storyboard; or a feature this Studio does not have (published builds, comments, the health of revisions are a hosted Studio's; preparing assets, cutting a sheet or upgrading the engine needs its processing worker; Git needs `git` in the configuration).

Messages:

- `comments are a shared Studio's` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `cutting a sheet needs the hosted Studio's processing worker` ([`studio-server/src/server/hosted-assets.ts`](../../studio-server/src/server/hosted-assets.ts))
- `no build …` ([`studio-server/src/server/builds.ts`](../../studio-server/src/server/builds.ts), [`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `no comment …` ([`studio-server/src/server/comments.ts`](../../studio-server/src/server/comments.ts))
- `no commit … in the repository` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))
- `no defineGame({...}) in the game folder` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `no job …` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts), [`studio-server/src/server/jobs.ts`](../../studio-server/src/server/jobs.ts))
- `no line "…" in the game` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `no revision … yet` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `no storyboard.json in this game` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `no such file` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `no such note: "…"` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `not found` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `preparing the assets needs a hosted Studio with its processing worker` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `published builds are a hosted Studio's` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `room "…" is not in the game (index.ts / game.ts)` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `the engine's upgrade needs a hosted Studio with its processing worker` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `the health of revisions is a hosted Studio's` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `this Studio has no Git repository (config git)` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `unknown room: "…"` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `… does not exist in the repository` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))

<a name="studio-409"></a>

### 409

A conflict, nothing overwritten: a file changed since the revision you read (the hosted Studio's stale base), a file changed while the edit was being prepared or checked (try again), an undo whose file changed since, an id that already exists, cells of a sheet that already exist, a job already ended, a build from another history of the game, a Git branch that moved, undo on a shared Studio.

Messages:

- `"…" already exists in room "…"` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `build … belongs to another history of the game (an import or a restore since)` ([`studio-server/src/server/builds.ts`](../../studio-server/src/server/builds.ts))
- `build …: the revision's snapshot rebuilt from the journal is not the one published` ([`studio-server/src/server/builds.ts`](../../studio-server/src/server/builds.ts))
- `cannot … "…": the journal has no such operation` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `cannot … "…": … changed since` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `cannot … "…": … was written again at revision …` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `the job has already ended (…)` ([`studio-server/src/server/jobs.ts`](../../studio-server/src/server/jobs.ts))
- `too late: the job is writing its result` ([`studio-server/src/server/jobs.ts`](../../studio-server/src/server/jobs.ts))
- `undo is not available on this shared Studio` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `… cell(s) of "…" already exist: name the cells to recut (cells), or upload into a new sheet id` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `… changed since revision … (now …)` ([`studio-server/src/ops/journal.ts`](../../studio-server/src/ops/journal.ts))
- `… changed while this edit was being checked; try again` ([`studio-server/src/ops/journal.ts`](../../studio-server/src/ops/journal.ts))
- `… changed while this edit was being prepared; try again` ([`studio-server/src/ops/journal.ts`](../../studio-server/src/ops/journal.ts))
- `… is not a file` ([`studio-server/src/ops/journal.ts`](../../studio-server/src/ops/journal.ts))
- `… moved while pushing: import it first, never forced` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))
- `…: the folder does not match the head; try again` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))

<a name="studio-413"></a>

### 413

Too big: a request body over the route's bound (`body too large`), an upload over the hosted Studio's size, an import of more files or bytes than the Studio takes. Send less, or split it.

Messages:

- `an upload is … MiB at most` ([`studio-server/src/server/hosted-assets.ts`](../../studio-server/src/server/hosted-assets.ts))
- `body too large` ([`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts), [`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts), [`tools/studio/assets.ts`](../../tools/studio/assets.ts), [`tools/studio/assistant.ts`](../../tools/studio/assistant.ts), [`tools/studio/plugin.ts`](../../tools/studio/plugin.ts))
- `more than 64 MiB to import` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))
- `more than … files to import` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))

<a name="studio-415"></a>

### 415

The wrong kind of content: a write that is not sent as JSON, a sound on a hosted Studio that is not an .ogg, .mp3 or .wav file, or whose bytes say it is something else.

Messages:

- `a sound on a hosted Studio is an .ogg, .mp3 or .wav file` ([`studio-server/src/server/hosted-assets.ts`](../../studio-server/src/server/hosted-assets.ts))
- `a write is sent as JSON` ([`studio-server/src/server/auth/gate.ts`](../../studio-server/src/server/auth/gate.ts))
- `the file is not … sound: its bytes say otherwise` ([`studio-server/src/server/hosted-assets.ts`](../../studio-server/src/server/hosted-assets.ts))

<a name="studio-422"></a>

### 422

Understood and refused: the edit would add validation errors (the answer lists them, with the diff; nothing is written since 4.2.1), a Git commit that holds no game, or a link or a submodule, prepared assets that would lose files the game had, a cut, a migration or an engine upgrade the processing worker refused.

Messages:

- `refused: the edit adds … validation error(s): …` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `refused: the prepared assets would lose … image(s) or sound(s) the game had (…): prepare them on a local Studio` ([`studio-server/src/server/prepared.ts`](../../studio-server/src/server/prepared.ts))
- `refused: …; nothing was written` ([`studio-server/src/server/engine-upgrade.ts`](../../studio-server/src/server/engine-upgrade.ts))
- `spans.json: not JSON (…)` ([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts))
- `spans.json: not a file` ([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts))
- `spans.json: … bytes, at most …` ([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts))
- `the commit holds no game at "…"` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))
- `the cut is refused: …` ([`studio-server/src/server/remote-executor.ts`](../../studio-server/src/server/remote-executor.ts))
- `the migration cannot run: …` ([`studio-server/src/server/remote-executor.ts`](../../studio-server/src/server/remote-executor.ts))
- `the migration is refused: …` ([`studio-server/src/server/remote-executor.ts`](../../studio-server/src/server/remote-executor.ts))
- `the prepared assets are refused: …` ([`studio-server/src/server/remote-executor.ts`](../../studio-server/src/server/remote-executor.ts))
- `… is a link or a submodule: not imported` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))
- `… is not a folder of the repository (a file, a link or a submodule): not read` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))
- `…: "…" is an engine file, its span is the engine's` ([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts))
- `…: "…" is not a path relative to the game folder` ([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts))
- `…: "…" names no span a client may take (…)` ([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts))
- `…: a key of … characters, at most …` ([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts))
- `…: an object { "<path>, <folder>/ or <glob>": "<span>" }` ([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts))
- `…: … entries, at most …` ([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts))
- and 2 message(s) built at run time.

<a name="studio-423"></a>

### 423

A span (a room, a language, the game…) is held by another member of a hosted Studio, or your own lease on it ended: the answer names the span and its holder; your draft is kept.

Messages:

- `your lease on … ended or was taken again: take it again` ([`studio-server/src/server/leases.ts`](../../studio-server/src/server/leases.ts))

<a name="studio-429"></a>

### 429

Too much at once, try again later: a build or an asset preparation is already running, the engine's upgrade is running, too many jobs wait, too many open comments.

Messages:

- `a build is being made: try again when it is done` ([`studio-server/src/server/builds.ts`](../../studio-server/src/server/builds.ts))
- `the assets are being prepared: try again when it is done` ([`studio-server/src/server/prepared.ts`](../../studio-server/src/server/prepared.ts))
- `the engine's upgrade is running: try again when it is done` ([`studio-server/src/server/engine-upgrade.ts`](../../studio-server/src/server/engine-upgrade.ts))
- `too many jobs are waiting: try again when one is done` ([`studio-server/src/server/jobs.ts`](../../studio-server/src/server/jobs.ts))
- `… open comments at most each: resolve some first` ([`studio-server/src/server/comments.ts`](../../studio-server/src/server/comments.ts))

<a name="studio-500"></a>

### 500

The game or the Studio itself failed: the game does not load (a syntax error, a former `web-scumm/…` import), a JSON file of the game is invalid, an edit would break the file it writes (refused, nothing written), a write on a shared Studio without its author. The dev server writes the stack to its terminal.

Messages:

- `a write on a shared Studio says who writes` ([`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts))
- `no cell "…/…" after the write` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `refused: the edit would break … (…)` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `the game does not load: …` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `…: invalid JSON (…)` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- and 1 message(s) built at run time.

<a name="studio-501"></a>

### 501

Not available here: a screenshot or the captures of a diff without Playwright or its Chromium, or on a hosted Studio (the answer carries `unavailable: true` and `reason`); a Reality policy solved on a hosted Studio (local only).

Messages:

- `a reality policy is solved on a local Studio` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- and 2 message(s) built at run time.

<a name="studio-502"></a>

### 502

A service behind the Studio Server failed: a `git` command or a push to the game's repository.

Messages:

- `git …: …` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))
- `the push failed: …` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))

<a name="studio-503"></a>

### 503

Not now, nothing lost: another process is writing this game, the edit cannot be judged now (the validation could not run), or a hosted Studio's identity provider cannot be reached (the session is suspended). Try again.

Messages:

- `another process is writing this game; try again` ([`studio-server/src/ops/journal.ts`](../../studio-server/src/ops/journal.ts))
- `the edit cannot be judged now: …` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `the identity provider cannot be reached: the session is suspended` ([`studio-server/src/server/auth/gate.ts`](../../studio-server/src/server/auth/gate.ts))

<a name="studio-504"></a>

### 504

The processing worker of a hosted Studio did not answer in time (a preparation, a cut, a diagnostic): try again, or do it on a local Studio.

Messages:

- `…: the diagnostic is unknown for now` ([`studio-server/src/server/remote-executor.ts`](../../studio-server/src/server/remote-executor.ts))
- `…: try again` ([`studio-server/src/server/remote-executor.ts`](../../studio-server/src/server/remote-executor.ts))
- `…: try again, or cut it on a local Studio` ([`studio-server/src/server/remote-executor.ts`](../../studio-server/src/server/remote-executor.ts))
- `…: try again, or prepare on a local Studio` ([`studio-server/src/server/remote-executor.ts`](../../studio-server/src/server/remote-executor.ts))

<a name="bridge"></a>

## Reality Bridge

Every refusal the Bridge raises as a `BridgeError`, by HTTP status and code. The answer is JSON, `{ "error": "<code>", "message": "<message>" }`.

<a name="bridge-400-shape"></a>

### 400 `shape`

The request is not what the route reads: not JSON, a field missing or malformed, a `through` the Bridge never sent, a revocation id that is not hex, a webhook delivery without its `id`.

Messages:

- `` `id` names the delivery (deduplication) `` ([`bridge/src/server.ts`](../../bridge/src/server.ts))
- `` `through` is a sequence the Bridge sent `` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))
- `` `…` is missing or malformed `` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))
- `a revocation id is hex` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))
- `not JSON` ([`bridge/src/server.ts`](../../bridge/src/server.ts))

<a name="bridge-401-admin"></a>

### 401 `admin`

An operator route (`/v1/admin/…`, as `quest-n-click-bridge revoke` calls it) without the operator's token (`admin-token` in the Bridge's folder).

Messages:

- `not the operator` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-401-capability"></a>

### 401 `capability`

The player's link to the Bridge (its capability) is unknown, revoked, expired or too old: the player pairs again.

Messages:

- `link expired: pair again` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))
- `link too old: pair again` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))
- `unknown or revoked link` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-401-revoked"></a>

### 401 `revoked`

The connector's token was revoked while its signal was being proposed: grant a new one (`quest-n-click-bridge grant`).

Messages:

- `token revoked` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-401-signature"></a>

### 401 `signature`

A webhook delivery whose HMAC signature does not match the webhook's secret.

Messages:

- `bad webhook signature` ([`bridge/src/server.ts`](../../bridge/src/server.ts))

<a name="bridge-401-token"></a>

### 401 `token`

A connector's token that cannot be read, or that was revoked, on a pairing confirmation or a signal.

Messages:

- `token revoked` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))
- `unreadable token` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-403-denied"></a>

### 403 `denied`

The connector's token is valid and does not allow this: it may not pair (granted without `--pair`), or its Biscuit does not allow that signal, source or player.

Messages:

- `this token may not pair (…)` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-404-game"></a>

### 404 `game`

A pairing asked for a game this Bridge does not serve (its `gameId` is another).

Messages:

- `not a game of this Bridge` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-404-hook"></a>

### 404 `hook`

No webhook of that name in the Bridge's configuration.

Messages:

- `no such webhook` ([`bridge/src/server.ts`](../../bridge/src/server.ts))

<a name="bridge-404-pairing"></a>

### 404 `pairing`

The pairing code is unknown or expired: the player starts a new pairing.

Messages:

- `unknown or expired code` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-404-player"></a>

### 404 `player`

The player is unknown to this Bridge, or was revoked (`quest-n-click-bridge revoke --player=…`, or the player unlinked).

Messages:

- `unknown or revoked player` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))
- `unknown player` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-404-tenant"></a>

### 404 `tenant`

A Bridge serving several tenants found none for this request.

Messages:

- `no tenant here` ([`bridge/src/server.ts`](../../bridge/src/server.ts))

<a name="bridge-409-pairing"></a>

### 409 `pairing`

The pairing code was already confirmed, by this connector or another one: the player is paired, nothing to redo.

Messages:

- `already confirmed` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-410-pairing"></a>

### 410 `pairing`

The pairing was already claimed: the player's capability was handed out once and never again; pair again from the game.

Messages:

- `already claimed` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-413-size"></a>

### 413 `size`

The request body is over the Bridge's bound.

Messages:

- `a request body is at most … bytes` ([`bridge/src/server.ts`](../../bridge/src/server.ts))

<a name="bridge-422-event"></a>

### 422 `event`

The webhook does not map that event to a signal (its configuration lists the events it knows).

Messages:

- `this webhook does not know that event` ([`bridge/src/server.ts`](../../bridge/src/server.ts))

<a name="bridge-422-signal"></a>

### 422 `signal`

The signal is not in the game's Reality manifest.

Messages:

- `signal … is not in the game's manifest` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-422-source"></a>

### 422 `source`

The signal is declared for another source than the connector that sends it.

Messages:

- `signal … comes from …` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-429-pairings"></a>

### 429 `pairings`

Too many pairing codes wait for a confirmation: try again in a minute.

Messages:

- `too many codes waiting for a confirmation: try again in a minute` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-429-pending"></a>

### 429 `pending`

The player has too many signals waiting to be delivered.

Messages:

- `the player has too many signals waiting` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-429-quota"></a>

### 429 `quota`

Too many signals this minute for the player (the Bridge's per-minute quota).

Messages:

- `too many signals this minute` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-429-rate"></a>

### 429 `rate`

Too many requests from this address: the answer carries `Retry-After: 60`.

Messages:

- `too many requests from this address: try again in a minute` ([`bridge/src/server.ts`](../../bridge/src/server.ts))

<a name="bridge-429-streams"></a>

### 429 `streams`

Too many open event streams: for this player, or for this instance of the Bridge.

Messages:

- `at most … open streams for a player` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))
- `this instance holds as many streams as it may: try again` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="solver"></a>

## Solver statuses

The one status of a solver run or of a proof by chapters ([`src/engine/tools/status.ts`](../../src/engine/tools/status.ts)): the command line, its `--json`, the Studio's Check tab and the MCP `solve` tool all read it.

| Status | Exit code | Means |
|---|---|---|
| `solved` | 0 | The ending (or the goal) is reached: on one path for a witness search, from every reachable state with `--prove`. |
| `softlocks` | 1 | Some reachable states can no longer reach the ending: the output lists them with the path to each. |
| `unsolved` | 1 | The ending is not reached from any state explored. |
| `truncated` | 2 | The search stopped on its budget (states `--max`, time `--time`, memory `--mem`): nothing is proved; raise the budget or resume from the checkpoint. |
| `broken` | 1 | An invariant of the game became true on a reachable state. |
| `error` | 1 | The engine raised errors while exploring. |
| `checkpoint_mismatch` | 1 | A proof by chapters (`--prove --chapters`): every chapter is proved, but a hand-written checkpoint is none of its chapter's reachable boundary states. |

<a name="exits"></a>

## Exit codes of the checking commands

What a script or a CI job reads after the command.

<a name="exit-validate"></a>

### `npm run validate`

[`tools/validate.ts`](../../tools/validate.ts).

| Code | Means |
|---|---|
| 0 | No error (warnings may be printed); `--report` always exits 0. |
| 1 | At least one error, listed after `✖`. |

<a name="exit-solve"></a>

### `npm run solve`

[`tools/solve.ts`](../../tools/solve.ts).

| Code | Means |
|---|---|
| 0 | `solved`; also `--prove --chapters` on a game that declares no chapter. |
| 1 | Any other status but `truncated` (`softlocks`, `unsolved`, `broken`, `error`, `checkpoint_mismatch`); with `--audit-abstractions`, the two searches diverged. |
| 2 | `truncated`: nothing proved (with `--audit-abstractions`, the explicit search was truncated); or a refused `--goal` (only `--goal=100%`, and only on a game with an objective that is not optional). |

<a name="exit-solve-reality"></a>

### `npm run solve:reality`

[`tools/solve-reality.ts`](../../tools/solve-reality.ts).

| Code | Means |
|---|---|
| 0 | Every world proved (closed, each scenario and replay, adversarial), or a game without `reality`. |
| 1 | A world fails; a truncated search counts as a failure. |

<a name="exit-lint"></a>

### `npm run lint`

[`tools/lint.ts`](../../tools/lint.ts).

| Code | Means |
|---|---|
| 0 | No finding of severity `error`, and the solver's search was not truncated. |
| 1 | At least one finding of severity `error`. |

<a name="exit-doctor"></a>

### `npm run doctor`

[`tools/doctor.ts`](../../tools/doctor.ts).

| Code | Means |
|---|---|
| 0 | Every required prerequisite is there (optional ones may be missing). |
| 1 | A required prerequisite is missing; with `--release`, every prerequisite of `npm run release-check` is required. |

<a name="exit-speedrun-verify"></a>

### `npm run speedrun:verify`

[`tools/speedrun/verify.ts`](../../tools/speedrun/verify.ts).

| Code | Means |
|---|---|
| 0 | The verdict is `valid` or `valid-unranked`. |
| 1 | Any other verdict, `inconclusive` included: never valid. |
| 2 | No `.wsrun` file named: the usage line is printed. |

<a name="exit-e2e-canonical"></a>

### `npm run e2e:canonical`

[`scripts/e2e-canonical.mjs`](../../scripts/e2e-canonical.mjs).

| Code | Means |
|---|---|
| 0 | Every browser writes every value as Node does (or a browser skipped with `--allow-skip`, said on the output). |
| 1 | A browser writes a value differently. |
| 3 | A browser Playwright cannot launch here, without `--allow-skip`. |

<a name="exit-e2e-remix"></a>

### `npm run e2e:remix`

[`scripts/e2e-remix.mjs`](../../scripts/e2e-remix.mjs).

| Code | Means |
|---|---|
| 0 | Every runtime makes the same worlds (or a browser skipped with `--allow-skip`, said). |
| 1 | A difference, the seed named. |
| 3 | A browser Playwright cannot launch, without `--allow-skip`. |

<a name="exit-e2e-speedrun"></a>

### `npm run e2e:speedrun`

[`scripts/e2e-speedrun.mjs`](../../scripts/e2e-speedrun.mjs).

| Code | Means |
|---|---|
| 0 | Determinism proved in every browser run (or `--bundle-only`, or a browser skipped with `--allow-skip`). |
| 1 | A check failed. |
| 3 | A browser Playwright cannot launch, without `--allow-skip`. |

<a name="exit-e2e-pwa"></a>

### `npm run e2e:pwa`

[`scripts/e2e-pwa.mjs`](../../scripts/e2e-pwa.mjs).

| Code | Means |
|---|---|
| 0 | Proved; or skipped with `--allow-skip` (an explicit "skipped" line, never a proof). |
| 1 | Failed. |
| 3 | Skipped: the browser cannot navigate offline under automation (WebKit), without `--allow-skip`. |

<a name="exit-e2e-remix-speedrun"></a>

### `npm run e2e:remix-speedrun`

[`scripts/e2e-remix-speedrun.ts`](../../scripts/e2e-remix-speedrun.ts).

| Code | Means |
|---|---|
| 0 | Every world policy recorded the same run in every runtime, verified (or a browser skipped with `--allow-skip`). |
| 1 | A check failed. |
| 3 | A browser Playwright cannot launch, without `--allow-skip`. |

<!-- generated:end -->

<a name="lint-truncated"></a>

## `npm run lint`: exit code 2

Besides 0 and 1 above, `npm run lint` exits **2** when it found no error but the solver's search it runs first was
truncated: "never run" and "never reached" are then information, not verdicts. Raise `--max`, or prove by chapters
([`tools/lint.ts`](../../tools/lint.ts)).

> [!LIMIT id=register-scope]
> The register lists what the code raises with a structure: `new StudioError(<message>, <status>)` in
> `studio-server/src/` and `tools/studio/`, `new BridgeError(<status>, '<code>', <message>)` in `bridge/src/`, the
> solver's statuses and the exit codes named in the data. It does not list the answers a route sends directly (the
> Studio Server's `429 too many requests` and `429 too many refused attempts`, with `Retry-After: 60`; the Bridge's speedrun and daily routes, `/v1/runs` and `/v1/daily`, with their own error bodies), a refusal
> whose status is computed (the Bridge's signal check answers 401 or 403 with the Biscuit check's own code), nor the
> text of a message built at run time (counted under its status). The speedrun verifier's verdicts and codes belong to
> the speedrun pages.

<a name="related"></a>

## Related identifiers

- [Studio API](studio.api.md), [command-line tools](reference.cli.md), [npm scripts](reference.npm-scripts.md).
