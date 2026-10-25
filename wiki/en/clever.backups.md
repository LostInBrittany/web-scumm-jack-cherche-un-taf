# Backups

A hosted Studio protects its game twice: the journal of every confirmed change is shipped to the bucket as it is
written, and a daily backup of the project's tables is written to the same bucket. This page sets up the daily backup,
says what a backup holds and does not hold, and how long backups are kept.

<a name="what-you-get"></a>

## What you get

A backup `backups/<date>-r<revision>.json` in the instance's bucket every day at 03:17 UTC, the 14 most recent kept
(or `STUDIO_BACKUP_KEEP`), its `"event":"backup"` line in the studio app's logs, and the way to take one by hand
before an upgrade. With the journal shipped since, a backup restores the game to its last shipped revision
([restore drill](clever.restore-drill.md)).

<a name="context-and-versions"></a>

## Context and versions

- A hosted Studio on Clever Cloud. `backup <file>` and `restore` exist from 4.2.2; `backup --to-bucket --keep` and the
  daily cron from 4.2.3.
- **Verified on: 19 October 2026, by the reference deployment** (engine at commit c66fbf56, package.json 4.2.2 before
  the 4.2.3 tag): the cron installed on the studio app (`crontab -l` showed it), the script run by hand on instance 0
  without `--config`, and `--keep` deleting the oldest. **Not observed**: the 03:17 UTC run itself, and whether exactly
  one backup a day is made.

<a name="prerequisites"></a>

## Prerequisites

- A deployed Studio ([First deployment](clever.first-deployment.md)) whose configuration has `blobs.kind: "s3"`.
- For a copy outside the bucket: an S3 tool (the Cellar console, `s3cmd`, `aws s3`) and the Cellar credentials.

<a name="where-to-run"></a>

## Where to run the commands

- `clever env set`, `clever ssh`, `clever logs`: on your machine, in the engine repository where the studio app is
  linked.
- `npm run studio-server -- backup …`: in a shell on the studio app (`clever ssh --alias my-game-studio`, then
  `cd "$APP_HOME"`), where the configuration and the add-ons' credentials are already in the environment.

<a name="steps"></a>

## Steps

<!-- step: enable-cron -->
1. Turn the daily backup on, on the studio app only, never the worker:

   ```sh
   # on your machine, in the engine repository
   clever env set --alias my-game-studio STUDIO_BACKUP_CRON 1
   clever env set --alias my-game-studio STUDIO_BACKUP_KEEP 14      # optional; 14 when absent
   ```

   The repository's [`clevercloud/cron.json`](../../clevercloud/cron.json) runs
   [`ops/studio/backup-cron.sh`](../../ops/studio/backup-cron.sh) at 03:17 UTC every day. Clever Cloud installs a
   repository's crons on every app and every instance deployed from it, so the script does nothing unless the app sets
   `STUDIO_BACKUP_CRON=1`, and nothing on another instance than number 0 (`INSTANCE_NUMBER`). It then runs
   `npm run -s studio-server -- backup --to-bucket --keep "${STUDIO_BACKUP_KEEP:-14}"`. A variable change applies at
   the next deploy or restart.

<!-- step: check-run -->
2. The next morning, find the backup's line in the logs (`clever logs --alias my-game-studio --since 12h`, stopped by
   its process id: it keeps following otherwise), or run the script by hand to see it at once:

   ```sh
   # in a shell on the studio app (clever ssh --alias my-game-studio)
   cd "$APP_HOME" && ops/studio/backup-cron.sh
   ```

   Its line is `{"event":"backup","key":"backups/2026-10-19T19-38-41Z-r63.json","revision":63,"digest":"…","removed":[…]}`.

> [!MEASURE id=backup-time]
> The script run by hand on instance 0: 1.87 s, `tsx` start-up included, for a backup of 253,958 bytes at revision
> 63. A second run at once with `STUDIO_BACKUP_KEEP=3` deleted the one backup past 3, in 2.07 s.
> - date: 2026-10-19
> - version: 4.2.2
> - volume: the demo game at revision 63 (500 files); backups of 170,746 bytes (r1) to 253,958 bytes (r63)
> - conditions: reference deployment phase B, engine at commit c66fbf56 before the 4.2.3 tag (package.json said 4.2.2); studio app XS, PostgreSQL DEV, Cellar S, region par; one sample each
> - source: [QUALIF-4.2.3-REFERENCE.md §3](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

<!-- step: by-hand -->
3. Before an upgrade, or any risky operation, take one by hand and note its revision. Without `--keep`, nothing is
   deleted:

   ```sh
   # in a shell on the studio app (clever ssh --alias my-game-studio)
   cd "$APP_HOME" && npm run -s studio-server -- backup --to-bucket
   ```

   `backup <file>` writes the same backup to a new file instead (mode 0600; it refuses an existing file), on the
   instance's disk, which does not survive a restart: prefer the bucket on Clever Cloud.

<!-- step: copy-elsewhere -->
4. Copy the bucket outside Cellar yourself, with an S3 tool, to storage only operators can write: `backups/`, and
   also `sha256/` (the files' contents) and `journal/` (the operations shipped). A backup names its blobs without
   holding them, and a restore refuses a backup whose blobs are missing: a copy of `backups/` alone restores nothing.
   The bucket holds all three together: a backup survives the loss of the database, not of the bucket or its
   credentials.

> [!GUARANTEE id=backup-keep-own-only]
> `--keep n` deletes only backups this command wrote (keys `backups/<date>-r<revision>.json`) past the n most recent,
> the one just written counting as one of them: never another object of the bucket, nor a file of another name under
> `backups/`.

<a name="holds"></a>

### What a backup holds, and what it does not

| Holds | Does not hold |
|---|---|
| The project's tables, read in one read-only snapshot: the head (`studio_files`, `studio_meta`), the confirmed operations (`studio_ops`), members, users, invitations, the audit log, personal undo, the health verdicts, previews, published builds, prepared sets, comments | **The files' contents**: it lists the blobs it names, by hash; they stay in the bucket |
| A digest (sha256 of its tables), checked at restore: an altered or cut backup is refused | Sessions and logins under way: **a restore logs everyone out** |
| The schema version it was made at: a restore needs the same | The leases (the writer's, the service's, the spans'): nobody holds a span after a restore |
| | Operations under way or aborted at the snapshot; the answers kept for a client's retry (7 days); the game origin's tickets and sessions |

A backup is trusted input, like the database's credentials: it can add owners. Its digest says it is whole, not who
made it: keep it where only operators write.

<a name="journal"></a>

### The journal shipped to the bucket

Each confirmed operation is copied to the bucket, in order, as an immutable segment
(`journal/<epoch>/<line>/<rev>.json`; the contents are blobs already). A failure is logged `ship-failed` and retried
within 30 s. `/readyz` gives `rpoMs`, the age of the oldest operation not shipped yet (0 when everything is): the
target is one minute (D42), watched, never promised ([RPO and RTO](clever.rpo-rto.md)). The line is `0`, then new
after each restore: the revisions a restored instance writes again never overwrite the segments of the timeline it
left. Take a new backup after a restore: the next ones replay on the new line.

<a name="restore"></a>

### What a restore does

The procedure is the [restore drill](clever.restore-drill.md); what the command does, in short. It restores a hosted
instance only, into an empty database (a new PostgreSQL add-on, the same bucket):
`npm run studio-server -- restore <file> --replay --config <file>` checks the digest, the tables and columns, and that
every blob of the head and of the journal is in the bucket (a preview, build or prepared set whose blobs were collected
since is left out and counted as `dropped`); writes the rows; then replays the journal shipped since the backup. Each
replayed operation must continue the head (its revision, each file's previous content, its blobs); the replay stops
at the first that does not (`stopped`: `gap`, `not-the-head`, `blob-missing`…). If it fails midway, the server refuses
to start until `npm run studio-server -- replay --config <file>` resumes it. Then start the server: its folder is made
from the head. Replayed operations keep no answer: a client retrying one gets `null`. Take a new backup after a
restore: the next ones replay on the new line.

<a name="from-archives"></a>

### From the release archives

The release archives do not carry `ops/studio/backup-cron.sh`. Copy it into your app's repository with its last line
replaced by:

```sh
# the last line of backup-cron.sh, in your app's repository (run by Clever's cron on the studio app)
exec npx quest-n-click-studio-server backup --to-bucket --keep "${STUDIO_BACKUP_KEEP:-14}"
```

make it executable, and point your own `clevercloud/cron.json` at it: `["17 3 * * * $ROOT/backup-cron.sh"]`. Clever
Cloud runs a cron with no environment unless its script starts with `#!/bin/bash -l` (the script's first line), and
with absolute paths only (`$ROOT` is the app's folder).

<a name="expected-result"></a>

## Expected result, and how to check it

- A new `backups/…json` object each day in the bucket, and its `"event":"backup"` line in the logs.
- No more than `STUDIO_BACKUP_KEEP` of them (other objects under `backups/` are left alone).
- The real check is a restore: run the [restore drill](clever.restore-drill.md) at least once, and after each upgrade.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| No `"event":"backup"` line one morning | `STUDIO_BACKUP_CRON` not `1`, not redeployed since, or no `INSTANCE_NUMBER=0` | [Troubleshooting](clever.troubleshooting.md#silent-cron) |
| `backup --to-bucket writes to the instance's bucket: blobs.kind is s3` | A local configuration | Run it on the studio app |
| `backup: --keep is the number of backups kept (1 or more)` | `STUDIO_BACKUP_KEEP` is `0`, negative or not a whole number | A whole number from 1 |
| `backup: a new file is required (or --to-bucket [--keep n])` | `backup` with no file, or an existing one | A new file name, or `--to-bucket` |
| Two backups the same minute | An overlapping redeploy at 03:17: two instances both numbered 0 for a moment | Harmless |

<a name="files-changed"></a>

## Files or data changed

Objects under `backups/` in the bucket; with `--keep`, older ones of its own deleted. Nothing in the database.

<a name="recovery"></a>

## Recovery or going back

A backup deleted by `--keep` is gone, unless you copied it elsewhere (step 4). Restoring a backup is the
[restore drill](clever.restore-drill.md), into a new database.

<a name="gc"></a>

### Collecting unused blobs

`npm run studio-server -- gc` lists the blobs no row names (older than a day) and the worker's staging older than an
hour; `--delete` deletes them. A blob stored again gets a new date, so a write naming an old blob is covered by the
day of grace. The head's and the journal's blobs are never collected (the journal keeps every operation); an older
backup restored after a collection loses only the previews, builds and prepared sets the collection took (counted as
`dropped`). Never run `gc --delete` against a drill's database: it would delete blobs production still names.

<a name="references"></a>

## References

- [`studio-server/src/ops/backup.ts`](../../studio-server/src/ops/backup.ts) (what is kept, and why),
  [`studio-server/src/ops/backup-bucket.ts`](../../studio-server/src/ops/backup-bucket.ts),
  [`studio-server/src/ops/gc.ts`](../../studio-server/src/ops/gc.ts),
  [`ops/studio/backup-cron.sh`](../../ops/studio/backup-cron.sh), [`clevercloud/cron.json`](../../clevercloud/cron.json).
- [`STUDIO_BACKUP_CRON`](reference.environment-variables.md#studio-backup-cron),
  [`STUDIO_BACKUP_KEEP`](reference.environment-variables.md#studio-backup-keep).
- [Retention](clever.retention.md), [Restore drill](clever.restore-drill.md), [RPO and RTO](clever.rpo-rto.md).
