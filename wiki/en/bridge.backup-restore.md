# Backup and restore

How to back up a Reality Bridge's store to one file, restore it all or nothing, and get a Bridge back after an instance
or its database is lost. This is the **Bridge's** backup (`npm run bridge -- backup`), not the hosted Studio's
(`studio-server backup`, [Backups on Clever Cloud](clever.backups.md)).

<a name="what-you-get"></a>

## What you get

A backup file of the whole store taken in one snapshot, with a digest that catches a file changed or cut by accident;
and, when you need it, a store restored from that file in one transaction, checked before and after its commit, in a
mode you name.

<a name="context-and-versions"></a>

## Context and versions

- A Bridge on a **SQL store** (SQLite or Postgres). The JSON-lines journal can be backed up, but not restored: migrate
  it to SQLite first ([Stores](bridge.install-run.md#stores)).
- From 4.1.20: backup schema 4 (ADR 0023), the two restore modes, and the maintenance leases. Schema 3 came with
  4.1.19 (ADR 0021). A restore reads schemas 1 to 4. This page applies from 4.2.5 (the `quest-n-click-bridge` names).
- **Verified on:** `backup`, `restore --mode=merge` (refused, then with `--force`) and `restore --mode=replace-store`
  were run on 23 October 2026 on a SQLite store of the game `signals` (one tenant, one signal), macOS, Node 22.14,
  engine 4.4.0. A large or a Postgres store was not replayed for this page; the rehearsals in CI are named under
  References.

<a name="prerequisites"></a>

## Prerequisites

- The Bridge's folder (`--dir`, with `config.json`) and access to its store (the SQLite file, or the Postgres URL in
  `BRIDGE_STORE` or `BRIDGE_STORE_FILE`).
- Memory for the file's size, about 10 MB per MiB backed up and 20 MB per MiB restored (the measure below).
- For a restore: every Bridge instance on that store **stopped**, and every instance older than 4.1.20 stopped before
  the first restore (they take no maintenance lease).

<a name="where-to-run"></a>

## Where to run the commands

On a machine that reaches the store, with the Bridge's folder: the Bridge's own machine, or one with more memory (a
restore only needs to reach the store). `npm run bridge -- …` in the engine repository; `npx quest-n-click-bridge …`
with the standalone package.

<a name="steps"></a>

## Steps

<!-- step: backup -->
1. Back up the store:

   ```sh
   # on the Bridge's machine, in the engine repository
   npm run bridge -- backup --out=bridge-2026-10-23.json
   ```

   It prints `✔  1 tenant(s), 1 signal(s), 0 run(s), 0 daily record(s) backed up to …/bridge-2026-10-23.json (schema
   4, one snapshot, sha256 1edef3c0f48b…)`. The whole store is read in one read-only transaction: tenants, runs, daily
   records and the speedrun quota. The file is mode 600, written to a temporary file then renamed. It holds the hashes
   of capabilities, never a capability or a key.

   Its envelope gives the backend, the Bridge and SQL schema versions, what it holds (`completeness`: `whole-store`
   for a SQL store, `tenants-only` for the journal or memory), the start and end, the counts per family, and a SHA-256
   of all of it (`scope: envelope`).

> [!LIMIT id=bridge-backup-digest-not-signature]
> The digest is an integrity check against a file changed or truncated by accident, not a signature: whoever can
> change the file can compute it again. Keep backups where only you can write.

> [!LIMIT id=bridge-backup-bounds]
> A store above `--max-rows` (2 000 000) or a file above `--max-bytes` (256 MiB) is refused and no file is written.
> Past a few hundred MiB, use the database's own tools (`pg_dump`, the provider's snapshots, a copy of the SQLite file
> with the Bridge stopped).

<!-- step: stop -->
2. To restore, stop every `serve` on that store first. From 4.1.20 the store refuses a restore while anything holds a
   live lease, naming who holds it and until when; a restore is never run beside live writers.

<!-- step: restore-merge -->
3. Restore with `--mode=merge`: into an empty store, or with `--force` over the tenants the file holds.

   ```sh
   # on a machine that reaches the store, in the engine repository
   npm run bridge -- restore --from=bridge-2026-10-23.json --mode=merge          # into an empty store, or refused
   npm run bridge -- restore --from=bridge-2026-10-23.json --mode=merge --force  # the file's tenants replaced, the others kept
   ```

   A conflict (a tenant, a run or a quota of its tenants, a daily key) refuses it without `--force`: `✖  the store
   already holds tenant(s) default: restore into an empty store, or --force; nothing restored`. With `--force` the
   file's families replace what they clash with, and **what the file does not speak of stays** (another tenant,
   another daily key). Any schema, 1 to 4.

<!-- step: restore-replace -->
4. Or restore with `--mode=replace-store`: **the store becomes the file**.

   ```sh
   # on a machine that reaches the store, in the engine repository
   npm run bridge -- restore --from=bridge-2026-10-23.json --mode=replace-store --yes-replace-store --safety-out=before-restore.json
   ```

   Every table but the control ones (`schema_migrations`) is emptied in the same transaction, then the file is written
   and read back, nothing more held. It takes only a schema 4 backup of a whole SQL store, of this store's SQL schema.
   First, a backup of the store being replaced is written to `--safety-out`, a path that must not exist (no link
   either), read back and checked; if that fails, nothing is deleted. Its path is said in every outcome.

> [!LIMIT id=bridge-replace-store-two-transactions]
> The safety backup and the replacement are two transactions: stop every writer between them (the maintenance lease
> refuses them from 4.1.20 on). The safety file is written through a hard link, which never replaces a name: give it a
> path on a file system that has them (not FAT or exFAT).

<!-- step: doctor -->
5. Check the store, then start the Bridge again:

   ```sh
   # in the engine repository
   npm run bridge -- doctor
   ```

> [!GUARANTEE id=bridge-restore-names-its-mode]
> Without `--mode`, or with `--force` alone, `restore` stops with exit code 2, and its usage names both modes.

> [!GUARANTEE id=bridge-restore-refused-while-serving]
> While a Bridge serves the store, a restore is refused and says nothing was restored. Once the Bridge stops, it
> restores.

<a name="expected-result"></a>

## Expected result, and how to check it

`restore` exits 0 with one line: `✔  1 tenant(s), 0 run(s), 0 daily record(s), 0 quota row(s) restored from
<date> (schema 4, merge), checked before and after the commit` (with `replace-store`, followed by `(the store
before: <safety file>)`). The file was read bounded and checked whole before the store was opened (schemas 1 to 4;
every row, duplicates, relations, schema 3's counts and payload digest, schema 4's envelope digest, dates, version and
completeness), written in one transaction, read back and compared before the commit, then audited after it.
`doctor` then lists each tenant's players and signals, with no gap.

<a name="common-errors"></a>

## Common errors

| Message or exit code | Cause | Fix |
|---|---|---|
| exit 2, `say the mode: --mode=merge … --mode=replace-store …; nothing restored` | No `--mode` | Name the mode |
| `the store already holds tenant(s) …: restore into an empty store, or --force; nothing restored` | A conflict in `merge` | A new store, or `--force` |
| `replace-store needs a schema 4 backup of a whole SQL store (…)` | An older file, or one from the journal (`tenants-only`) | `--mode=merge`, or a new backup |
| `the backup comes from a store at schema N, newer than this one (M): upgrade the Bridge` | The engine is older than the backup's | Upgrade the Bridge |
| `the JSON-lines journal cannot be restored all or nothing: migrate it to SQLite first …` | The store is the journal | `migrate --from=jsonl --to=sqlite`, then restore with `--store=sqlite` |
| `the backup would be N bytes, more than M (--max-bytes=): no file written` | A store too large for one file | The database's own tools |
| A refusal naming the lease's holder `; nothing restored` | A Bridge still serves the store | Stop it |
| exit 3, `P0: the restore committed but …` | A difference found after the commit | Stop every instance, keep this store for inspection; a writer during the restore may explain it |
| exit 3, `the commit's answer was lost …` | The connection dropped at the commit | `doctor`, and take a backup, to see which way it went |

<a name="files-changed"></a>

## Files or data changed

- `backup`: the `--out` file only (mode 600). It reads the store.
- `restore --mode=merge`: the tenants, runs, daily records and quotas the file holds (with `--force`, those it
  clashes with are replaced). The rest of the store stays.
- `restore --mode=replace-store`: every table but `schema_migrations`; and the `--safety-out` file, written first.

<a name="recovery"></a>

## Recovery or going back

- A failed restore says "nothing restored" and leaves the store as it was (one transaction).
- After a `replace-store`, the way back is its safety file: `restore --from=<safety file> --mode=replace-store …`
  with a new `--safety-out`.
- **An instance killed or crashed:** start another; nothing is lost (a transaction is committed or not there;
  `tests/bridge-fanout.test.ts` kills one of three during 1 000 proposals).
- **The database lost:** restore the last backup into a new one, then `doctor`. Connectors send again what they sent
  since (their `dedupeKey` makes it idempotent), and players keep their cursors.
- **A journal that will not start:** `doctor` names the line.
- A key or a Biscuit root compromised, or an instance's host: [Security](bridge.security.md#procedures).

<a name="health"></a>

## Health and measures

- `GET /livez`: the process answers. `GET /readyz`: the store answers (503 otherwise). `GET /healthz`: both, with the
  tenants, the store's kind and the open streams. No token, no tenant's data.
- Measures: acceptances, duplicates, refusals by code, acknowledgements, store retries, quarantine, refused streams,
  the backlog and a proposal's latency. Kept in the process always; through OpenTelemetry's metrics API when
  `@opentelemetry/api` is installed beside the Bridge, exported over OTLP when
  [`OTEL_EXPORTER_OTLP_ENDPOINT`](reference.environment-variables.md#otel-exporter-otlp-endpoint) is set and
  `@opentelemetry/sdk-node` is installed. Attributes: the tenant and a code, never a player or a payload.
- A stored row that no longer verifies is quarantined, never delivered, and `doctor` lists it.

<a name="memory"></a>

## Memory: size the machine to the backup

`backup`, `tenant export` and `restore` hold the whole file in memory, parsed and canonical; a restore holds it twice
(the file, then the store read back to compare).

> [!MEASURE id=bridge-backup-memory]
> Peak memory (RSS) of the archive's Bridge, against about 72 MB at rest: a 64 MiB backup took 0.6 GB to export, 1.4
> GB to restore on SQLite and 1.3 GB on Postgres; 128 MiB, 1.1 to 1.3 GB, 2.7 GB and 2.4 GB; 256 MiB, 2.1 to 2.2 GB,
> 3.1 GB and 3.7 GB. Read it as about 10 MB of memory per MiB of file for a backup, 20 MB for a restore: an
> observation, not a promise for your machine.
> - date: 2026-10-13
> - version: 4.1.20
> - volume: backups of 64, 128 and 256 MiB, on SQLite and on Postgres
> - conditions: the candidate's `backup-memory` job (`tools/backup-memory.ts`), a GitHub Linux runner, the Bridge from the candidate's archive; one measure per size and store
> - source: [REALITY-OPS.md, "Health, measures, backups"](https://github.com/Quest-n-Click/quest-n-click/blob/b55bd9bbf42145d44e1eaa5c1041fff74a2e905e/docs/en/REALITY-OPS.md)

In a 512 MiB container, a restore holds up to about 20 MiB of backup. Run a larger one from a machine that has the
memory, or lower `--max-bytes` and `--max-rows` to what the machine holds, so that a file too large is refused before
it is parsed.

<a name="leases"></a>

## Maintenance leases (4.1.20)

From schema 5 (migration 0005), every writer holds a lease in the store itself (ADR 0023):

- `serve` and every command that writes (`migrate`, `tenant delete`, `backup` and `tenant export`, which bring the
  schema up) hold a `serving` lease, side by side.
- `restore`, and `migrate --schema=N` going down, take the `exclusive` one. They are **refused**, naming who holds the
  store and until when, while anything else holds a live lease: at once on SQLite; on Postgres after the advisory
  lock's `--lock-timeout` at most (30 s by default, never waited for longer).
- An expired lease (a process killed) is deleted, never in the way. Every time is the database's own.
- A `serve` whose lease is lost (not renewed, or its lock's connection dropped) holds its writes, which answer 503,
  and fails `/readyz` until it takes a lease again; so does a process that stalls past two thirds of its lease, on its
  own clock. A restore whose lease is lost before its commit is rolled back.

> [!LIMIT id=bridge-leases-older-bridges]
> A Bridge older than 4.1.20 takes no lease: stop every older instance before the first restore. `migrate --schema=N`
> below 5 drops the lease table with its first step, so stop every writer for it.

<a name="tenant-export"></a>

## One tenant's rows

`tenant export --tenant=<id> [--out=<file>]` writes one tenant's rows, in every table (to standard output without
`--out`); `tenant delete --tenant=<id> --yes` deletes them. Without `--yes`, nothing is deleted. The backup is logical,
portable and bounded; for a large deployment, `pg_dump` or the provider's snapshots remain the backup of the database
itself.

<a name="references"></a>

## References

- The code: [`bridge/src/backup/`](../../bridge/src/backup/index.ts), [`bridge/src/cli-store.ts`](../../bridge/src/cli-store.ts),
  [`bridge/src/maintenance.ts`](../../bridge/src/maintenance.ts).
- The design: [ADR 0021](../../docs/dev/adr/0021-backup-snapshot-and-atomic-restore.md) (one snapshot, all or
  nothing), [ADR 0023](../../docs/dev/adr/0023-backup-completeness-and-restore-modes.md) (completeness, the modes, the
  leases).
- Rehearsed by [`tests/bridge-backup.test.ts`](../../tests/bridge-backup.test.ts),
  [`tests/bridge-backup-v4.test.ts`](../../tests/bridge-backup-v4.test.ts),
  [`tests/bridge-maintenance.test.ts`](../../tests/bridge-maintenance.test.ts) and
  [`tests/bridge-ops.test.ts`](../../tests/bridge-ops.test.ts); the whole topology destroyed and restored by
  `npm run ops:qualify` ([The reference deployment](bridge.install-run.md#reference-deployment)).
- [The Bridge's command line](bridge.cli.md#backup) · [Troubleshooting](bridge.troubleshooting.md).
