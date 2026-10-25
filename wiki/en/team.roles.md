# Roles and actions: the full matrix

On a team Studio every member has one role: `owner`, `dev` or `reviewer`. This page lists every route of the Studio
Server and the role it needs, read from the code: the gate
([`auth/gate.ts`](../../studio-server/src/server/auth/gate.ts)), the role of each API route (`roleFor` in
[`http.ts`](../../studio-server/src/server/http.ts)), the owner's routes
([`auth/routes.ts`](../../studio-server/src/server/auth/routes.ts)) and the API's table
([`ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="how-to-read"></a>

## How to read it

- The roles are ranked: `reviewer` < `dev` < `owner`. A route that needs `dev` is open to owners too.
- **The rule**: a `GET` (and a `POST` that only reads, such as a check) needs a reviewer; any other write needs a dev;
  the members, the invitations, the audit and a few whole-game actions need an owner. The exceptions are listed in
  each table.
- Below the role a route needs, the answer is **403** `this needs the role <role>`. A logged-in person who is not a
  member gets **403** `not a member of this project`. Without a session or a token: **401**.
- The role is checked on every request, with the session cookie (the browser) or a Bearer access token (the CLI,
  scripts, the MCP). A role changed or a member removed takes effect at their next request.
- The routes below are under the Studio's public URL. The game's origin (`playUrl`) has its own rules, at the end.

<a name="owner"></a>

## `owner`

Everything a dev may do, plus: the members, their roles and sessions, invitations, the audit log; taking a span over;
the exclusive lease by hand; Git push and import; the engine's upgrade; a fresh rebuild of a published build;
bringing the notes in as comments; cancelling anyone's job. The last owner can be neither demoted nor removed.

<a name="dev"></a>

## `dev`

Writes the game, span by span: rooms, texts, values, the storyboard, the map's groupings, notes, voices, uploads and
cuts, Prepare, undo and redo of their own operations, publishing a build, asking for a bisection, taking and releasing
spans. Resolves any comment thread. Cancels the jobs they started.

<a name="reviewer"></a>

## `reviewer`

Reads and plays: every read of the game and of the Studio, the checks (validator, solver, lint…), the previews and
builds, the live stream. Writes no game file. Comments, edits their own comments, and resolves their own threads.
Holds no lease.

<a name="matrix-game"></a>

## The game: reads and edits

| Route | reviewer | dev | owner |
|---|---|---|---|
| `GET /api/game`, `/api/room/<id>`, `/api/ir`, `/api/graph`, `/api/history` | yes | yes | yes |
| `GET /api/storyboard`, `/api/groupings`, `/api/map`, `/api/notes` | yes | yes | yes |
| `GET /api/voices`, `/api/voices/<lang>`, `/api/voices/<lang>/csv`, `/api/hero-matrix` | yes | yes | yes |
| `GET /api/diff/<a>..<b>` | yes | yes | yes |
| `GET /api/diff/<a>..<b>/captures` (501 on a hosted Studio) | yes | yes | yes |
| `PUT /api/room/<id>/layout`, `/text`, `/value`; `POST /api/room/<id>/add` | no | yes | yes |
| `PUT /api/room/@game/value` (the game's objectives) | no | yes | yes |
| `PUT /api/storyboard`, `POST /api/storyboard/markdown` | no | yes | yes |
| `PUT /api/groupings` | no | yes | yes |
| `POST /api/notes`, `PUT /api/notes/<id>`, `DELETE /api/notes/<id>` | no | yes | yes |
| `PUT /api/voices/<lang>/<id>` | no | yes | yes |
| `POST /api/undo`, `POST /api/redo` (your own operations) | no | yes | yes |

<a name="matrix-checks"></a>

## Checks and history

| Route | reviewer | dev | owner |
|---|---|---|---|
| `POST /api/validate`, `/report`, `/puzzle`, `/coverage`, `/playtests`, `/lint`, `/solve` | yes | yes | yes |
| `POST /api/screenshot` (501 on a hosted Studio) | yes | yes | yes |
| `GET /api/revision`, `GET /api/ops?after=<rev>` | yes | yes | yes |
| `POST /api/health/bisect` `{good, bad}` | no | yes | yes |

These `POST`s only read: they take their options in a body, need no lease, and are never refused for a span.

<a name="matrix-live"></a>

## Live, presence and spans

| Route | reviewer | dev | owner |
|---|---|---|---|
| `GET /api/events` (the live stream) | yes | yes | yes |
| `POST /api/presence` (the heartbeat; it also renews a dev's or owner's leases) | yes | yes | yes |
| `GET /api/leases` | yes | yes | yes |
| `POST /api/leases` `{spans}`, `POST /api/leases/release` `{spans?}` | no | yes | yes |
| `POST /api/leases/takeover` `{span}` | no | no | yes |
| `POST /api/exclusive`, `POST /api/exclusive/release` | no | no | yes |
| `POST /api/play-ticket` (a browser session only, never a Bearer token) | yes | yes | yes |

<a name="matrix-comments"></a>

## Comments

| Route | reviewer | dev | owner |
|---|---|---|---|
| `GET /api/comments`, `POST /api/comments` | yes | yes | yes |
| `PUT /api/comments/<id>` with `text` | own comments | own comments | own comments |
| `PUT /api/comments/<id>` with `resolved` | own threads | any | any |
| `POST /api/comments/import-notes` | no | no | yes |

Only its author changes a comment's text, whatever their role (403 otherwise). There is no route to delete a comment.

<a name="matrix-assets"></a>

## Assets, jobs and builds

| Route | reviewer | dev | owner |
|---|---|---|---|
| `GET /api/assets`, `/api/assets/prompts`, `/api/assets/file/<path>`, `/api/assets/prepared` | yes | yes | yes |
| `POST /api/assets/sound`, `/decor` (uploads) | no | yes | yes |
| `POST /api/assets/sheet`, `/cell`, `/prepare` (jobs, under your exclusive lease) | no | yes | yes |
| `GET /api/jobs/<id>` | yes | yes | yes |
| `POST /api/jobs/<id>/cancel` | no | jobs they started | any job |
| `GET /api/builds`, `GET /api/builds/<n>` | yes | yes | yes |
| `POST /api/builds` (publish the head) | no | yes | yes |
| `POST /api/builds/<n>/rebuild` (rebuild fresh) | no | no | yes |
| The game's images and sounds on the Studio's origin (`/assets/img/…`, `/assets/audio/…`, `/assets/video/…`) | yes | yes | yes |

<a name="matrix-owner"></a>

## Members, Git and the engine

| Route | reviewer | dev | owner |
|---|---|---|---|
| `GET /api/members` (members and pending invitations) | no | no | yes |
| `POST /api/invitations` `{email, role}` | no | no | yes |
| `PUT /api/members/<id>` `{role}` | no | no | yes |
| `DELETE /api/members/<id>` | no | no | yes |
| `DELETE /api/members/<id>/sessions` | no | no | yes |
| `GET /api/audit` | no | no | yes |
| `GET /api/git` | yes | yes | yes |
| `POST /api/git/push`, `POST /api/git/import` `{ref?}` | no | no | yes |
| `POST /api/engine/migrate` | no | no | yes |

See [Managing members](team.members.md), [The game in Git](team.game-in-git.md) and
[Upgrading the engine of a hosted game](team.upgrade-engine.md).

<a name="matrix-mcp"></a>

## The remote MCP

`POST /mcp` takes a Bearer access token only (never the session cookie), from a member: a reviewer at least. Each tool
is then a request to the same `/api` with the caller's token, so a tool needs the role of its route: a reviewer's
agent reads and checks, a dev's agent writes. See [Remote MCP](team.remote-mcp.md).

<a name="public"></a>

## Routes without a role

| Route | Who |
|---|---|
| `GET /livez`, `/startz`, `/readyz` | anyone (no data) |
| `GET /metrics` | the bearer of `STUDIO_METRICS_TOKEN` only, never a session ([Health and metrics routes](team.health-metrics.md)) |
| `GET /.well-known/oauth-protected-resource`, `/.well-known/oauth-protected-resource/mcp` | anyone |
| The Studio's page and its static files (`/`, `/assets/…` other than images, sounds and video, `/icons/…`, `/fonts/…`) | anyone (they hold no data) |
| `GET /auth/login`, `GET /auth/callback`, `POST /auth/backchannel`, `GET /auth/cli` | anyone |
| `GET /auth/me`, `POST /auth/logout` | anyone logged in, member or not (`/auth/me` answers `role: null` for a non-member) |

Every `/auth/…` route takes 30 requests a minute per address at most; past that it answers 429 with `Retry-After: 60`.

<a name="game-origin"></a>

## The game's origin

On `playUrl` no Studio API and no `/auth` route answer. Every path needs a game session, made from a ticket that a
member's browser session asked for (`POST /api/play-ticket`): any role. The game session lasts 15 minutes, sliding,
and is checked at every request against the member's Studio session and membership. With `publicBuilds: true` in the
configuration, `/play/…` and `/icons/…` (the published builds) open without a session, to anyone.

<a name="refusals"></a>

## Refusals that are not about roles

Even with the right role, a write can be refused:

- **423**: the span is held by someone else, or the whole game is ([423](team.write-refused-423.md)).
- **409**: the file changed since you read it ([409](team.write-refused-409.md)), or the last owner would be demoted
  or removed.
- **403** `forbidden`: a browser write without the exact `Origin`, the header `X-Studio-Request: 1` and a JSON body.
- **503** with `Retry-After`: the instance does not serve writes yet (a redeploy), or the identity provider has not
  confirmed your session for 15 minutes (`suspended`).
- **429**: too many refused authentications from one address in a minute (30), or a busy job queue.

> [!GUARANTEE id=roles-read-review-write-dev]
> Every route of the Studio API's table needs a reviewer when it only reads (a `GET`, or one of the read-only `POST`s)
> and a dev otherwise; the test walks the whole table.

> [!LIMIT id=roles-fixed]
> The three roles are fixed: there is no custom role, no per-room right, and no read-only dev. A provider's groups give
> no right.

<a name="related"></a>

## Related identifiers

- [Managing members](team.members.md), [Invitations](team.invitations.md).
- [Concepts](team.concepts.md): spans, leases, the exclusive lease.
- [ADR 0027](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md): the four HTTP policies.
