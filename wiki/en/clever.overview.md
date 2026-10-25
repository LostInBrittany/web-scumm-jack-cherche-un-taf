# Clever Cloud: overview, cost and prerequisites

The team Studio (the Studio Server) puts one game's Studio online for a small team. This project documents one host
for it, Clever Cloud, in detail. This page says what runs there, why it is cut that way, what you need before you
start, what it costs to run and in which order to read the other Clever pages.

<a name="why"></a>

## Why

A shared Studio has to keep three promises a local one never had to: no confirmed change is lost, people are told
apart, and the game's own code never runs with a member's rights. Each part of the deployment answers one of them.

```text
browsers ─HTTPS─▶ studio (Node app, one instance) ──signed jobs──▶ studio-worker (Node app, no secrets)
CLI, MCP ─Bearer─┘   │  publicUrl: the Studio and /api              ▲ presigned snapshot and result
                     │  playUrl:   the game (another origin)        │
                     ├──▶ PostgreSQL: journal, members, sessions, leases
                     ├──▶ Cellar (S3): the files' contents, the worker's snapshots ─┘
                     └──▶ OpenID provider: who people are (never what they may do)
```

- **The game's files** live in PostgreSQL (which version of each file) and Cellar (their contents). The app's disk is
  a cache: Clever Cloud's disk does not survive a restart (measured by spike S: a marker written, then `clever
  restart`, was gone), and nothing is lost when it goes.
- **The game's code never runs in the Studio.** Validating it, building its previews and reading it go to
  `studio-worker`, a second app that holds no password, key or database access (ADR 0028).
- **The game is played on another origin** (`playUrl`), so its code cannot act with a member's Studio session.
- **The provider says who someone is**, the Studio decides what they may do (ADR 0027).

<a name="prerequisites"></a>

## What you need

- A Clever Cloud organisation where you may create apps and add-ons, and `clever-tools` logged in to it.
- Two Node.js applications (`studio`, `studio-worker`), a PostgreSQL add-on, a Cellar add-on with one bucket, and an
  OpenID Connect provider. Clever Cloud's managed Keycloak add-on works; another provider works for browser logins,
  with limits ([Generic OIDC and GitLab](clever.generic-oidc.md)).
- **A domain of your own**, for two subdomains of it (`studio.example.fr`, `play.example.fr`), never two
  `*.cleverapps.io` names ([Domains and TLS](clever.domains-tls.md)).
- On your machine: the engine repository at the version you deploy, with `npm ci` done, to make the job keys and to
  run backups, restores and exports.

> [!LIMIT id=experimental]
> The Studio Server is experimental. Its people's passes (`studio-hosted`, `studio-collab`, `studio-preview`,
> `studio-assets-hosted`, `studio-mcp-remote`, `studio-oidc-generic`) were still `not-run` for 4.4.0
> (`docs/dev/passes/4.4.0.md`). A real Safari, on macOS and iOS, has not been checked against a hosted Studio.

<a name="costs"></a>

## What it costs to run

No price was measured for this project: the repository holds no invoice and no dated price list, so this page gives
the resources, not an amount. Price them on Clever Cloud's pricing page on the day you deploy.

The reference deployment of 19 October 2026 (`docs/dev/QUALIF-4.2.3-REFERENCE.md` §1) ran on the smallest sizes:

| Resource | What it used | Enough? |
|---|---|---|
| `studio` app | Node.js, size XS (1 vCPU, about 1 GB), 1 instance | For one game and a few members |
| `studio-worker` app | Node.js, size XS, 1 instance | One job at a time per lane |
| PostgreSQL | plan DEV (5 connections) | **No** for a team: a redeploy runs two instances, which exceed 5 connections ([Apps and add-ons](clever.apps-addons.md#postgresql-sizing)) |
| Cellar | plan S, one bucket | Yes for the demo game (500 files) |
| Keycloak | managed, plan BASE | Yes |

During a redeploy both instances of each app run for minutes, so you pay for that overlap too
([Redeploys](clever.redeploys.md)). Deleting everything is [Costs and teardown](clever.costs-teardown.md).

<a name="pages"></a>

## The Clever pages, in order

1. [Apps and add-ons](clever.apps-addons.md)
2. [Domains and TLS](clever.domains-tls.md)
3. [Keycloak](clever.keycloak.md), or [Generic OIDC and GitLab](clever.generic-oidc.md)
4. [Configuration](clever.configuration.md)
5. [First deployment](clever.first-deployment.md)
6. [Backups](clever.backups.md), [RPO and RTO](clever.rpo-rto.md), the
   [restore drill](clever.restore-drill.md)
7. [Redeploys](clever.redeploys.md), [Upgrading the server](clever.upgrade-server.md),
   [Limits of going back](clever.going-back.md)
8. [Monitoring](clever.monitoring.md), [Security](clever.security.md), [Rotating keys](clever.key-rotation.md)
9. When something goes wrong: [Recovering admin access](clever.admin-recovery.md),
   [Changing domain or OIDC provider](clever.change-domain.md),
   [Worker, PostgreSQL or Cellar down](clever.dependency-down.md), [Troubleshooting](clever.troubleshooting.md)
10. Leaving: [Exporting the game](clever.export-leave.md), [Retention](clever.retention.md),
    [Costs and teardown](clever.costs-teardown.md)

<a name="alternatives"></a>

## Alternatives set aside

- **Other hosts.** The maintainer chose to document Clever Cloud only, in detail (D50). The server itself reads a
  JSON configuration and a few secrets and runs anywhere Node.js, PostgreSQL and an S3 store are: nothing in it is
  specific to Clever, but no other host is documented or checked.
- **One app instead of two.** Running the game's code in the Studio's process would give it the Studio's secrets.
  On Clever Cloud's Node.js runtime there is a single system user (`bas`), and a child can read its parent's
  environment through `/proc` (spike S §1): a second app is the separation (ADR 0028).
- **Docker.** The native Node.js runtime has Python 3.13, pip and ffmpeg (spike S §5), enough for the worker's asset
  tools; Docker is never required.
- **Two `*.cleverapps.io` names.** They are two sites (the Public Suffix List): the game's cookie then depends on
  partitioned cookies, which some browsers refuse ([Domains and TLS](clever.domains-tls.md)).

<a name="trade-offs"></a>

## Trade-offs

- **One instance.** One game per instance, one instance serving writes (a service lease in PostgreSQL). There is no
  horizontal scaling.
- **Redeploys refuse writes for a while.** About a minute of slow or refused writes per redeploy, none lost
  ([Redeploys](clever.redeploys.md)).
- **Backups live in the same bucket as the files.** They survive the loss of the database, not of the bucket
  ([Backups](clever.backups.md)).
- **Secrets in variables.** Clever Cloud injects add-on credentials as environment variables: the server reads each
  secret once and removes it from its environment, which departs from the house rule "secrets in files" (ADR 0027).

<a name="decisions"></a>

## Decisions and ADRs

- [ADR 0025, the Studio Server](../../docs/dev/adr/0025-studio-server.md);
  [ADR 0027, identity, sessions, tokens](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md);
  [ADR 0028, where the game's code runs](../../docs/dev/adr/0028-studio-content-execution.md).
- Spike S, the runtime measured: [`docs/dev/SPIKE-4.2.1-CLEVER.md`](../../docs/dev/SPIKE-4.2.1-CLEVER.md); the
  reference deployment: [`docs/dev/QUALIF-4.2.3-REFERENCE.md`](../../docs/dev/QUALIF-4.2.3-REFERENCE.md).
- What runs where, for members: [What runs where](team.what-runs-where.md).
