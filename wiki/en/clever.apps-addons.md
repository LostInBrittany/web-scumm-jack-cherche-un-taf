# Apps and add-ons

The first step of a hosted Studio on Clever Cloud: the two Node.js applications, the PostgreSQL and Cellar add-ons,
the bucket, and the links between them, made with `clever-tools`.

<a name="what-you-get"></a>

## What you get

Two Node.js applications, `my-game-studio` and `my-game-worker`, both linked to the folder of your engine
repository under an alias; a PostgreSQL add-on and a Cellar add-on with one bucket, linked to the studio app only;
the studio app held at exactly one instance. Nothing is deployed yet.

<a name="context-and-versions"></a>

## Context and versions

- A hosted Studio (the Studio Server) on Clever Cloud, deployed from the engine repository. From 4.2.3 (the worker's
  build hook arrived in 4.2.2, the daily backup in 4.2.3).
- **Verified on: not verified on a live installation for this page.** The reference deployment of 19 October 2026
  ran on applications and add-ons of the same kind (two Node.js apps of size XS, PostgreSQL DEV, Cellar S), but they
  had been created for spike S on 17 October 2026 and reused; nobody has replayed this page's commands from an empty
  organisation.

<a name="prerequisites"></a>

## Prerequisites

- A Clever Cloud organisation, and `clever-tools` installed and logged in (`clever login`).
- The engine repository cloned on your machine, at the version you will deploy.
- The [overview](clever.overview.md), to know what each part is for.

<a name="where-to-run"></a>

## Where to run the commands

On your machine, in the folder of the engine repository: `clever link` writes `.clever.json` there, and
`clever deploy` later pushes that folder's commit. Keep `.clever.json` out of Git.

<a name="steps"></a>

## Steps

<!-- step: create-apps -->
1. Create the two applications and the two add-ons, link the add-ons to the studio app only, and hold the studio at
   one instance:

   ```sh
   # on your machine, in the engine repository
   clever create --type node my-game-studio
   clever create --type node my-game-worker
   clever addon create postgresql-addon my-game-pg --plan dev      # 5 connections: tight (the server keeps 4); larger for a team
   clever addon create cellar-addon my-game-cellar
   clever service link-addon my-game-pg --app my-game-studio
   clever service link-addon my-game-cellar --app my-game-studio
   clever scale --min-instances 1 --max-instances 1 --app my-game-studio
   ```

   **Never link the add-ons to the worker.** The worker holds no password, key or database access: it reads and
   writes only through the presigned URLs a job gives it (ADR 0028).

<!-- step: create-bucket -->
2. Create the bucket in Cellar, with its console or any S3 tool (the Cellar add-on's credentials). Its name goes in
   the configuration's `blobs.bucket` ([Configuration](clever.configuration.md)).

<!-- step: app-folder -->
3. Both apps build from the repository's root: leave `APP_FOLDER` unset. An app that held another project may still
   have one:

   ```sh
   # on your machine, in the engine repository
   clever env rm APP_FOLDER --app my-game-studio
   clever env rm APP_FOLDER --app my-game-worker
   ```

<!-- step: link-aliases -->
4. `clever deploy` and `clever ssh` act on an app linked in the folder you run them from (clever-tools 4 has no
   `--app` for `deploy`). Link both once, each under an alias:

   ```sh
   # on your machine, in the engine repository
   clever link <studio-app-id> --alias my-game-studio
   clever link <worker-app-id> --alias my-game-worker
   ```

<a name="postgresql-sizing"></a>

### PostgreSQL sizing during the redeploy overlap

A redeploy starts the new instance while the old one still serves, for minutes ([Redeploys](clever.redeploys.md)).
Both hold connections meanwhile: twice the usual count. The DEV plan allows 5 connections and the server keeps a pool
of 4, so a redeploy exceeds it.

> [!MEASURE id=dev-plan-connections]
> On the DEV plan, every redeploy made the instances' background work fail with "too many connections"
> (`leases-read-failed`, `reconcile-failed`, `ship-failed`), and one write served by the old instance got a 500
> ("too many connections for role …") before it went through on a retry. The background work recovered by itself.
> - date: 2026-10-19
> - version: 4.2.2
> - volume: three redeploys of the studio app, a probe writing a note every 3 s
> - conditions: Clever Cloud test organisation, region par; studio app XS, one instance; PostgreSQL plan DEV (5 connections); engine at commits c66fbf56 then dd66b38d on main before the 4.2.3 tag (package.json said 4.2.2)
> - source: [QUALIF-4.2.3-REFERENCE.md §5 and §5 bis](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

For a deployment people use, take a PostgreSQL plan with more connections than DEV. This project has not measured
which plan is enough: count about 4 connections per instance, two instances during a redeploy, plus the ones you open
yourself (`psql`, a restore drill uses its own add-on).

<a name="expected-result"></a>

## Expected result, and how to check it

- `clever applications` (in the repository folder) lists both aliases.
- `clever addon` lists the two add-ons; `clever service --app my-game-studio` shows them linked to the studio app,
  and the same command for the worker shows none.
- `clever env --app my-game-studio` holds `POSTGRESQL_ADDON_URI` and `CELLAR_ADDON_KEY_ID`. **It prints values,
  multi-line ones included:** filter it to names before you show or paste it anywhere. This keeps only what comes
  before the first `=` of lines that start with a variable name:

  ```sh
  # on your machine, in the engine repository
  clever env --app my-game-studio | grep -oE '^[A-Z][A-Z0-9_]*='
  ```

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `clever deploy` deploys the wrong app, or asks which one | Several apps linked, no alias given | `clever deploy --alias my-game-studio` |
| The build looks for a `package.json` in a subfolder | `APP_FOLDER` left from another project | `clever env rm APP_FOLDER` on that app |
| The worker has `POSTGRESQL_ADDON_URI` | An add-on linked to the worker | `clever service unlink-addon <addon-id> --app my-game-worker` |
| "too many connections" in the logs during a deploy | PostgreSQL DEV plan | A larger plan (above) |

<a name="files-changed"></a>

## Files or data changed

- `.clever.json` in the repository folder (the links and aliases): keep it out of Git.
- In Clever Cloud: two applications, two add-ons, one bucket. They are billed from their creation.

<a name="recovery"></a>

## Recovery or going back

Nothing holds data yet. Delete what you created with `clever addon delete` and `clever delete`
([Costs and teardown](clever.costs-teardown.md)).

<a name="references"></a>

## References

- The variables the add-ons inject: [`POSTGRESQL_ADDON_URI`](reference.environment-variables.md#postgresql-addon-uri),
  [`CELLAR_ADDON_KEY_ID`](reference.environment-variables.md#cellar-addon-key-id),
  [`CELLAR_ADDON_KEY_SECRET`](reference.environment-variables.md#cellar-addon-key-secret),
  [`APP_FOLDER`](reference.environment-variables.md#app-folder).
- Next: [Domains and TLS](clever.domains-tls.md), then [Configuration](clever.configuration.md).
- The measures: [`docs/dev/QUALIF-4.2.3-REFERENCE.md`](../../docs/dev/QUALIF-4.2.3-REFERENCE.md); the runtime:
  [`docs/dev/SPIKE-4.2.1-CLEVER.md`](../../docs/dev/SPIKE-4.2.1-CLEVER.md).
