# Redeploys

On Clever Cloud a deploy (or a push, or `clever restart`) starts the new instance while the old one still serves. The
Studio Server is built for that overlap: no write is lost, but writes are slow or refused for about a minute. This page
says why, what was measured, and how to deploy so that members are not surprised.

<a name="why"></a>

## Why

Spike S measured it on 17 October 2026: during `clever restart --without-cache`, the new instance started while the
old one still answered, and the old one never logged a SIGTERM. Two instances writing the same game at once would
corrupt its history, and waiting for a signal that does not come would stall the switch. So:

- The instances share a **service lease** in PostgreSQL: one holds it and serves writes. It lasts 30 s and is renewed
  every 10 s on the database's clock; an instance that cannot renew stops writing by its own clock before the 30 s
  can pass.
- The new instance starts, answers `/startz` (Clever's health check, `CC_HEALTH_CHECK_PATH=/startz`), then waits:
  `/readyz` is 503 (`"writes":"waiting"`) and its writes are 503 with `Retry-After: 2` ("this instance does not serve
  writes yet; try again").
- **The handoff (since 4.2.3).** Once it listens, the new instance asks for the lease; the holder gives it back at its
  next renewal (10 s at most) and logs `{"event":"lease-lost",…}`; the new one logs `{"event":"lease-taken",…}`. An
  older instance never takes the lease back from a newer one.
- A client retries a refused write with the same operation id (`X-Studio-Op`) and it is applied once. The journal's
  own fenced lease still keeps two instances from writing over the same head.

<a name="measured"></a>

## What was measured

Clever Cloud keeps the old instance `STOPPING` for about two minutes, still receiving requests until the deploy ends,
and it logs no `stopping` line.

> [!MEASURE id=handoff-window]
> Between two versions that both hand the lease over (two `clever restart` of the same commit): `lease-taken` 6.0 s
> and 10.1 s after the new instance listened; then writes were 503 (`Retry-After: 2`) for 16 s and 10 s, because
> Clever still sent requests to the old instance, which no longer held the lease, until the deploy ended. Before
> that, while the new instance started, one write waited 10.2 s and 19.4 s on its journal check and got a 503 too,
> then went through on a retry. No 409, no 500, no write applied twice.
> - date: 2026-10-19
> - version: 4.2.2
> - volume: two redeploys, a probe reading `/readyz` every second and writing a note every 3 s
> - conditions: reference deployment, studio app XS, one instance, PostgreSQL DEV, region par; engine at commit dd66b38d on main before the 4.2.3 tag (package.json said 4.2.2); one sample per deploy
> - source: [QUALIF-4.2.3-REFERENCE.md §5 bis](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

In all, about a minute of slow or refused writes per deploy, none lost.

> [!MEASURE id=first-deploy-onto-handoff]
> The first deploy onto a version with the handoff, from one without it (4.2.2, or a 4.2.3 commit before #183): the
> old version kept the lease until Clever stopped it, and writes were refused for 2 min 23 s and 2 min 27 s, reads
> going on.
> - date: 2026-10-19
> - version: 4.2.2
> - volume: two deploys (52e68932 → c66fbf56, then c66fbf56 → dd66b38d), the same probe
> - conditions: reference deployment, studio app XS, PostgreSQL DEV, region par; engine commits on main before the 4.2.3 tag (package.json said 4.2.2)
> - source: [QUALIF-4.2.3-REFERENCE.md §5 and §5 bis](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

While both instances run they hold twice the connections: on the PostgreSQL DEV plan (5) background work fails with
"too many connections" during each deploy, and an older version's write could fail with it (a 500). Take a larger plan
for a deployment people use ([Apps and add-ons](clever.apps-addons.md#postgresql-sizing)).

<a name="procedure"></a>

## Deploying without surprising the team

**Verified on: 19 October 2026** (the measures above; engine commits before the 4.2.3 tag, package.json 4.2.2). This
page's text itself is not verified on a live installation.

<!-- step: warn -->
1. Tell the members, or pick a quiet moment: about a minute of slow writes; about two and a half minutes of refused
   writes for the first deploy onto 4.2.3 or later from an older version.

<!-- step: deploy -->
2. Deploy from your machine, in the engine repository, the worker first when both change:

   ```sh
   # on your machine, in the engine repository
   clever deploy --alias my-game-worker
   clever deploy --alias my-game-studio
   ```

<!-- step: watch -->
3. Watch `/readyz` come back to 200 and the `lease-taken` line (its `instance` is the new one):

   ```sh
   # on your machine
   until curl -sf https://studio.example.fr/readyz; do sleep 2; done
   ```

<!-- step: one-write -->
4. Make one write (a note) and see it saved, at the next revision.

> [!LIMIT id=client-retry]
> "None lost" holds for a client that retries a 503 with the same operation id. The Studio in the browser does, up to
> 8 tries with waits growing to 8 s (about 40 s in all), so a window longer than that (the first deploy onto the
> handoff) ends in a refusal it shows. The local MCP's tools pointed at a hosted Studio send an operation id but do not
> retry: they report the 503, and the tool is run again. A script of your own that does not retry loses the write it
> sent during the window.

<a name="alternatives"></a>

## Alternatives set aside

- **Relying on SIGTERM** to hand the lease over: Clever never delivered it observably (spike S, the reference
  deployment).
- **Stopping the old instance first** (`clever stop`, then deploy): a minute or more with no Studio at all. Kept for
  one case only, a migration that changes what the old version reads ([Upgrading the server](clever.upgrade-server.md)).
- **Several instances serving at once**: the journal needs one writer per game.

<a name="trade-offs"></a>

## Trade-offs

The handoff shortens the refused window from minutes to seconds, but Clever's routing to the old instance until the
deploy ends keeps 10 to 16 s of 503. A `/readyz` alert must tolerate that ([Monitoring](clever.monitoring.md)).

<a name="decisions"></a>

## Decisions and ADRs

- The lease: [`studio-server/src/server/service-lease.ts`](../../studio-server/src/server/service-lease.ts) (master plan
  §4, P8); [ADR 0025](../../docs/dev/adr/0025-studio-server.md).
- The measures: [`docs/dev/SPIKE-4.2.1-CLEVER.md`](../../docs/dev/SPIKE-4.2.1-CLEVER.md) §2,
  [`docs/dev/QUALIF-4.2.3-REFERENCE.md`](../../docs/dev/QUALIF-4.2.3-REFERENCE.md) §5 and §5 bis.
- A 503 seen by a member: [Troubleshooting](clever.troubleshooting.md#deploy-503).
