# Several tenants

How to serve several games, or one game in several environments, from one Bridge deployment, and how to run several
instances of it on one store. A **tenant** is one operator's game in one environment: its own folder, its own Biscuit
root, event key, operator token, quotas, rotation and revocations. What isolates them, and where that stops:
[Guarantees](bridge.guarantees.md#tenant-isolation).

<a name="what-you-get"></a>

## What you get

One `serve` (or several identical ones) holding several tenants on one SQL store, each reached by its own host name,
each signing `WorldSignalV2` signals that name their tenant, with connector tokens bound to their tenant.

<a name="context-and-versions"></a>

## Context and versions

- A Bridge, from 4.1.10 ("Constellation", ADR 0009, ADR 0010); this page applies from 4.2.5 (the
  `quest-n-click-bridge` names).
- Several tenants need a SQL store: SQLite for one machine, Postgres for several instances (the `distributed`
  profile, **experimental**).
- **Verified on: not replayed for this page.** The same layout (two tenants, three instances, one Postgres) is what
  `npm run ops:qualify` brings up and checks ([The reference deployment](bridge.install-run.md#reference-deployment)).

<a name="prerequisites"></a>

## Prerequisites

- A running single Bridge is understood first: [Install and run the Bridge](bridge.install-run.md).
- One host name per tenant (`bridge.a.example`, `bridge.b.example`) pointing at the deployment, or a proxy that sets
  `X-Web-Scumm-Tenant`.
- For several instances: Postgres, and `pg` installed beside the Bridge.

<a name="where-to-run"></a>

## Where to run the commands

On the deployment's machine (or each instance's), with one folder per tenant, for example `/srv/bridge/a` and
`/srv/bridge/b`. `npm run bridge -- …` in the engine repository, `npx quest-n-click-bridge …` with the package (then
pass `--manifest=` to `init`).

<a name="steps"></a>

## Steps

<!-- step: init-tenants -->
1. Make each tenant's folder, with its id, its environment and its host names:

   ```sh
   # on the deployment's machine, in the engine repository
   npm run bridge -- init --dir=/srv/bridge/a --tenant=a --environment=prod --hosts=bridge.a.example --no-demo-webhooks --origin=https://game-a.example
   npm run bridge -- init --dir=/srv/bridge/b --tenant=b --environment=staging --hosts=bridge.b.example --no-demo-webhooks --origin=https://game-b.example
   ```

   `--environment` is `prod`, `staging` or `dev` (`prod` by default); it is named in every signal and in the keys the
   tenant lists.

<!-- step: serve-tenants -->
2. Serve them together on one SQL store:

   ```sh
   # on the deployment's machine, in the engine repository
   BRIDGE_STORE=postgres://… npm run bridge -- serve --tenants=/srv/bridge/a,/srv/bridge/b [--tenant-header]
   ```

   A request is routed by its `Host` (each tenant's `hosts`), or by `X-Web-Scumm-Tenant` with `--tenant-header`,
   before anything is read; no tenant, a 404. Two folders that configure the same tenant are refused at start, and so
   is a journal (several tenants share a SQL store: `--store=sqlite:<file>`, `BRIDGE_STORE=postgres://…` or
   `BRIDGE_STORE_FILE`).

<!-- step: grant-tenants -->
3. Grant each tenant's connectors from that tenant's folder: `grant` adds the tenant to the token, so no other tenant
   accepts it.

   ```sh
   # on the deployment's machine, in the engine repository
   npm run bridge -- grant --dir=/srv/bridge/a --connector=mail-a --source=mail --signals=mail.answer.correct --pair > mail-a.token
   ```

<!-- step: instances -->
4. For more capacity, start as many identical `serve` as needed on the same store, with no sticky sessions, behind a
   load balancer. Instances are stateless.

<a name="expected-result"></a>

## Expected result, and how to check it

- `GET /healthz` on any instance says `"tenants": 2` and the store's kind.
- `npm run bridge -- doctor --dir=/srv/bridge/a` (with the same `BRIDGE_STORE`) lists every tenant of the store, with
  its players, signals, gaps and quarantined rows.
- A request with an unknown `Host` gets 404 `{"error": "tenant"}`.

<a name="how-instances-share"></a>

## How instances share one store

- Sequences, deduplication and acknowledgements are decided in one database transaction; delivery is at least once
  and applied once (D20).
- A signal accepted by one instance reaches a stream held by another, which reads the store when woken: Postgres
  `NOTIFY`, a 250 ms poll on SQLite, and a pass every 5 s should a wake-up be lost.
- Every row of the store carries its tenant and every query filters on it. A tenant of a shared deployment signs
  `WorldSignalV2` (the signal names its tenant, environment, origin, link and key), so neither a token nor a signal of
  one tenant is accepted by another, even when two of them were (wrongly) given one key.
- Each instance bounds its open streams (`streamsPerInstance`, 10 000; then 429) and its per-connector minute: with N
  instances a connector may propose N times its quota.
- A stored row that no longer verifies is quarantined, never delivered, and `doctor` lists it.

> [!LIMIT id=bridge-tenants-demo-webhooks]
> One server keeps one map of demonstration webhooks, by source, across all its tenants: two tenants with a webhook of
> the same source collide. Give the tenants of a shared server `--no-demo-webhooks` and one `grant` per connector.

> [!LIMIT id=bridge-tenants-shared-process]
> The tenants of one server share its process, its CORS list (every tenant's `--origin` together) and its database.
> The isolation is the Bridge's code; there is no row-level security per tenant in Postgres, and a compromised
> instance holds every tenant's keys.

<a name="common-errors"></a>

## Common errors

| Message | Cause | Fix |
|---|---|---|
| `✖  two directories configure the same tenant (a, a)` | Two folders with the same `--tenant` | One folder per tenant |
| `✖  several tenants share a SQL store: --store=sqlite:<file>, BRIDGE_STORE=postgres://… or BRIDGE_STORE_FILE` | The first tenant's configuration names the journal | Name a SQL store |
| 404 `{"error":"tenant","message":"no tenant here"}` | The `Host` is none of the tenants' `hosts`, and no allowed header | Add the host to the tenant's `hosts` in `config.json`, or `--tenant-header` behind a proxy that sets it |
| 403 on `POST /v1/signals` | The connector's token belongs to another tenant | `grant` from the right tenant's folder |
| `BRIDGE_STORE_FILE: … does not exist` / `… is empty` | The secret file is missing or empty | Mount it; an empty one is refused rather than falling back to a journal |

<a name="files-changed"></a>

## Files or data changed

One folder per tenant (`config.json`, `root.key`, `admin-token`); the shared store, where every row carries its
tenant.

<a name="recovery"></a>

## Recovery or going back

- One tenant's rows, out of a shared store: `tenant export --tenant=<id> --out=<file>`; deleted: `tenant delete
  --tenant=<id> --yes` ([Backup and restore](bridge.backup-restore.md#tenant-export)).
- A tenant's key or root compromised, or an instance: [Security](bridge.security.md#procedures). The other tenants are
  untouched by a tenant's rotation.

<a name="references"></a>

## References

- The routing: [`bridge/src/server.ts`](../../bridge/src/server.ts); one tenant's configuration:
  [`bridge/src/config.ts`](../../bridge/src/config.ts); the stores:
  [`bridge/src/store-async.ts`](../../bridge/src/store-async.ts).
- [ADR 0009](../../docs/dev/adr/0009-reality-store.md), [ADR 0010](../../docs/dev/adr/0010-signal-v2.md), the threat
  model [`docs/dev/threat-models/constellation.md`](../../docs/dev/threat-models/constellation.md).
- Tested by [`tests/bridge-tenancy.test.ts`](../../tests/bridge-tenancy.test.ts) and
  [`tests/bridge-fanout.test.ts`](../../tests/bridge-fanout.test.ts).
