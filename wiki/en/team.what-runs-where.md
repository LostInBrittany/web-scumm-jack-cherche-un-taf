# What runs where

The team Studio, or Studio Server, puts one game's Studio online for a small team. This page shows its parts, where
each runs, what each holds, and why it is cut that way.

<a name="overview"></a>

## Overview

The Studio Server puts a game's Studio online for a small team. Everyone logs in through an OpenID Connect provider
(Keycloak or another), works on the same game at the same time, and sees every change as it lands. It is the work of
the 4.2.x line (plan [`docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md`](../../docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md)).

Alone on your machine you do not need any of this: `npm run studio` stays as it was (see
[The local Studio](studio.overview.md)).

What the hosted Studio brings, by version:

- **4.2.1**: the journal (no confirmed change is lost), logins and roles, the processing worker, spans and leases,
  the live stream.
- **4.2.2**: the game on its own origin with one preview per revision, the health by revision, personal undo,
  published builds, assets prepared on the worker, backup and restore, and the Studio's screens for all of this.
- **4.2.3**: the Assets tab's uploads and the cutting of sheets, Prepare and the cuts as jobs you can follow and
  cancel, the revision each editor read, the scenario map, comments, the diff, the remote MCP, Git, the engine's
  upgrade, metrics and the daily backup.

Deploying it is documented for Clever Cloud, from the repository or from the release archive
`quest-n-click-studio-server` (the same server): see [Clever Cloud: overview](clever.overview.md) and
[First deployment](clever.first-deployment.md).

<a name="the-picture"></a>

## The picture

```text
browsers ─HTTPS─▶ studio (Node app, one instance) ──signed jobs──▶ studio-worker (Node app, no secrets)
CLI, MCP ─Bearer─┘   │  public_url: the Studio and /api        ▲ presigned snapshot and result
                     │  play_url:   the game (another origin)  │
                     ├──▶ PostgreSQL: journal, members, sessions, leases
                     ├──▶ Cellar (S3): the files' contents, the worker's snapshots ─┘
                     └──▶ OpenID provider: who people are (never what they may do)
```

In words:

- **Browsers** reach the `studio` app over HTTPS with a session cookie. **The CLI and MCP clients** reach it with a
  Bearer access token.
- **`studio`** is one Node.js instance. On its public URL (`publicUrl`) it serves the Studio's page and `/api`. On a
  second origin (`playUrl`) it serves the game: the previews and the published builds.
- **PostgreSQL** holds the journal, the members, the sessions and the leases.
- **Cellar** (an S3 store) holds the files' contents and the snapshots the worker reads.
- **`studio-worker`** is a second Node.js app. It receives jobs signed by `studio`, reads the snapshot and writes its
  result through presigned URLs, and holds no secret.
- **The OpenID provider** says who people are. What they may do is decided in the Studio (see
  [Roles and actions](team.roles.md)).

<a name="why"></a>

## Why it is cut this way

- **The game's files live in PostgreSQL and Cellar.** Postgres says which version of each file is current, Cellar
  holds the contents. The app's disk is only a cache: Clever Cloud's disk does not survive a restart, and nothing is
  lost when it goes. The instance that serves writes checks its folder against the head every 30 seconds and repairs
  it without a restart.
- **The game's code never runs in the Studio.** A game is TypeScript: reading or validating it means running it. So
  validation, reads of the game module, previews, builds, lint, the solver and playtests go to `studio-worker`, which
  holds no password, key or database access ([ADR 0028](../../docs/dev/adr/0028-studio-content-execution.md)).
- **The game is played on another origin** (`playUrl`). Its code cannot act with a member's Studio session: the
  Studio's cookie never goes there, and no Studio API answers there.
- **The provider gives identity only.** Roles, invitations and the audit live in the Studio's database
  ([ADR 0027](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md)).
- **One writer per project.** Every change is a transaction in a journal, every file belongs to one span, and one
  instance at a time serves writes, under a service lease in PostgreSQL
  ([ADR 0025](../../docs/dev/adr/0025-studio-server.md)). The words are explained in
  [Concepts](team.concepts.md).

<a name="alternatives"></a>

## Alternatives set aside

- **Running the game's code in the Studio's process**, or in a child of it: a child runs as the same system user and
  can read the parent's environment, so a `dev` could have read every secret (ADR 0028).
- **Rights managed in the provider** (groups): the maintainer chose the Studio on 17 October 2026 (ADR 0027).
- **A private workspace per person**, merged later: rejected by the maintainer on 17 October 2026 (ADR 0025). The
  team works on one live copy, with explicit locks.
- **A WebSocket channel**: Server-Sent Events plus an HTTP read by cursor are enough until a measurement says
  otherwise (ADR 0025, P7).

<a name="trade-offs"></a>

## Trade-offs

- One game per instance, and one instance serving writes at a time: a second instance waits for the lease.
- Every job costs a round trip to the worker; previews and checks are not instant (see
  [Known limits](team.limits.md)).
- Members are trusted: a `dev` still runs code on the worker machine, under the asset tools' user (ADR 0028).

> [!LIMIT id=hosted-only]
> Everything on this page is the hosted Studio (the Studio Server). The local Studio, `npm run studio`, has one
> person, no worker, no second origin and no login.

<a name="decisions"></a>

## Decisions and ADRs

- [ADR 0025: one shared game, edited live](../../docs/dev/adr/0025-studio-server.md)
- [ADR 0026: saves across revisions](../../docs/dev/adr/0026-saves-across-revisions.md)
- [ADR 0027: OIDC for who, the Studio for what](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md)
- [ADR 0028: a worker without secrets](../../docs/dev/adr/0028-studio-content-execution.md)
- [ADR 0029: the remote MCP](../../docs/dev/adr/0029-remote-mcp.md)
- Decisions D39 to D47 in [`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md).
