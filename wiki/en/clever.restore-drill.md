# Restore the Studio on a fresh installation

This drill restores a hosted Studio's latest backup into a new, empty PostgreSQL database, replays what was written
since, and checks the result against production. Production is never touched. Run it before you need it: the day the
database is really lost, you will already know the commands and how long they take.

<a name="what-you-get"></a>

## What you get

A second database, created for the drill, that holds the game at the same revision as production: the backup's rows,
then every operation written after the backup, read back from the journal the server ships to the bucket. You also
get a timing, to write in your own records, and the proof that your backups can be restored.

<a name="context-and-versions"></a>

## Context and versions

- A hosted Studio (the Studio Server) on Clever Cloud: a `studio` app, its PostgreSQL add-on, its Cellar bucket.
- From 4.2.2, when `restore --replay` arrived. The daily backup to the bucket (`backup --to-bucket`) exists from
  4.2.3; before that, take the backup by hand.
- **Verified on: not verified on a live installation for this page.** The procedure is the one the 4.2.3 reference
  deployment ran on 19 October 2026 (the measure below), but nobody has replayed this page's text on a live Clever
  Cloud installation yet. Read each command before you run it.

<a name="prerequisites"></a>

## Prerequisites

- A running hosted Studio with at least one backup in its bucket (`backups/<date>-r<revision>.json`). The daily
  backup writes one when the studio app has `STUDIO_BACKUP_CRON=1`
  ([`STUDIO_BACKUP_CRON`](reference.environment-variables.md#studio-backup-cron)).
- `clever-tools`, logged in to the organisation that holds the apps.
- On your machine: the engine at the **same version** as the studio app, with `npm ci` done. A backup restores only
  into the database schema of the version that made it.
- An S3 tool (the Cellar console, `s3cmd`, `aws s3`) and the bucket's Cellar credentials, to download the backup.
- `psql`, to compare the two databases. Without access to the production database, a member's account on the Studio
  is enough (step 5 says how).

<a name="where-to-run"></a>

## Where to run the commands

- `clever …`: on your machine, in the folder where the studio app is linked (`clever link`).
- `npm run studio-server -- …`: on your machine, in the engine repository, at the version the studio app runs.
- Never on the production instance, and never with the production database's URI in your shell.

<a name="steps"></a>

## Steps

<!-- step: note-head -->
1. Note the head of production and check that nothing is waiting to be shipped. As a member, `GET /api/revision`
   gives the revision; `GET /readyz` gives `rpoMs`, which must be `0`. With metrics on, `studio_journal_revision` and
   `studio_journal_rpo_seconds` say the same.

<!-- step: create-addon -->
2. Create an empty PostgreSQL add-on for the drill, linked to no app, and read its URI:

   ```sh
   # on your machine, where the studio app is linked
   clever addon create postgresql-addon my-game-pg-drill --plan dev
   clever addon env <drill-addon-id>
   ```

<!-- step: fetch-backup -->
3. Download the latest `backups/` object of the bucket to your machine (any S3 tool, with the Cellar credentials),
   for example as `backups-latest.json`. Write the studio app's configuration (its `STUDIO_CONFIG_JSON`) to a file,
   with `workDir` changed to a folder of your machine. The loader checks it as the server would:

   ```studio-config
   {
     "publicUrl": "https://studio.example.fr",
     "playUrl": "https://play.example.fr",
     "game": "my-game",
     "workDir": "/tmp/my-game-drill",
     "host": "0.0.0.0",
     "trustProxy": ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
     "store": { "kind": "postgres" },
     "blobs": { "kind": "s3", "host": "cellar-c2.services.clever-cloud.com", "bucket": "my-game-studio" },
     "oidc": { "issuer": "https://keycloak.example.fr/realms/web-scumm", "clientId": "studio", "audience": "studio-api", "cliClientId": "web-scumm-cli" },
     "worker": { "url": "https://worker.example.fr", "instance": "my-game-studio" }
   }
   ```

<!-- step: restore -->
4. Point the server at the **drill** database and the bucket, then restore and time it:

   ```sh
   # on your machine, in the engine repository, same version as the studio app
   export STUDIO_DATABASE_URL='<the drill add-on URI from step 2>'
   export STUDIO_S3_KEY_ID='<Cellar key id>' STUDIO_S3_KEY_SECRET='<Cellar secret>'
   time npm run -s studio-server -- restore backups-latest.json --replay --config drill.config.json
   ```

   It checks the backup's digest, its tables and columns, and that every blob the backup and the journal name is in
   the bucket; writes the rows; then replays the operations shipped since the backup. Its last line gives the rows
   written, the rows `dropped`, the backup's revision, the revision reached, and `stopped` if the replay stopped early.

> [!GUARANTEE id=restore-empty-db-only]
> A restore into a database that already holds a project is refused with "the project is not empty". The test proves
> it on SQLite; the server runs the same code on PostgreSQL.

The check runs inside the restore's transaction, before the first row is written
([`studio-server/src/ops/backup.ts`](../../studio-server/src/ops/backup.ts)): pointing step 4 at production by mistake
is refused, and leaves it as it was. Still, never put production's URI in that shell.

> [!LIMIT id=same-engine-version]
> Run the restore with the same engine version as the backup, which is production's when the backup is recent.
> `restore` first migrates the target database to the engine it runs on, then compares the backup's schema with it.
> With a newer engine than production, the drill database is migrated past the backup and the restore is refused
> ("the backup is of schema …"): delete that add-on and start again with the right version.

<!-- step: compare -->
5. Compare, read-only, on both databases (`psql <URI>`): `SELECT value FROM studio_meta WHERE key = 'revision'` gives
   the head noted in step 1 (or later, if people wrote meanwhile), and `SELECT path, blob FROM studio_files ORDER BY
   path` gives the same rows. Without access to production's database, compare as a member: `GET /api/ops?after=0`
   (paged by `next`) against the drill's `SELECT rev, op_id FROM studio_ops WHERE state = 'confirmed' ORDER BY rev`.

<!-- step: clean-up -->
6. Write the time and the revisions in your records, then delete the drill's add-on:

   ```sh
   # on your machine, where the studio app is linked
   clever addon delete my-game-pg-drill
   ```

> [!MEASURE id=restore-time]
> Measured twice on the reference deployment, one sample each: 28.7 s in its phase A (a backup at revision 1, 508 rows,
> nothing to replay, engine at commit 52e68932) and 59.7 s in its phase B (a backup at revision 63, 593 rows, 2
> operations replayed, engine at commit c66fbf56). The report does not say what the difference comes from. Read it as
> about half a minute to a minute on one small game: an observation, not a promise for yours.
> - date: 2026-10-19
> - version: 4.2.2
> - volume: 508 rows (backup at revision 1); then 593 rows and 2 operations replayed (backup at revision 63, head 65)
> - conditions: Clever Cloud test organisation, region par; PostgreSQL add-on plan DEV, Cellar plan S; restore run from a machine in Paris, `tsx` start-up included; engine at commit 52e68932, then c66fbf56 on main before the 4.2.3 tag (package.json said 4.2.2); one sample each
> - source: [QUALIF-4.2.3-REFERENCE.md §4](https://github.com/Quest-n-Click/quest-n-click/blob/edb8d39a03a3ad6ba9aa8f33e1ab5473d3d7a34e/docs/dev/QUALIF-4.2.3-REFERENCE.md)

> [!LIMIT id=rpo]
> What a restore can lose is the operations confirmed but not yet shipped to the bucket when the database was lost:
> that is the RPO. `/readyz` gives its current value as `rpoMs`; the target is one minute, watched, never promised. In
> the measure above it was 0: both writes made after the backup were replayed, and `rpoMs` went back to 0 within 2 s
> of each write. If the bucket is lost too, the backups and the journal go with it. A copy elsewhere must hold the
> bucket's `backups/`, `sha256/` and `journal/` together: a backup names its blobs by hash without holding them, so
> `backups/` alone restores nothing ([Backups](clever.backups.md#steps)).

<a name="expected-result"></a>

## Expected result, and how to check it

`npm run -s studio-server -- restore …` exits 0 and prints one JSON line (`-s` keeps npm's own lines out), for example
`{"event":"restored","rows":593,"dropped":0,"backup":63,"revision":65}`, with no `stopped`. The revision reached is
the head you noted in step 1, or later. Step 5 shows the same files at the same revision in both databases.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `restore: the project is not empty (<table> holds rows): restore into a new one` | `STUDIO_DATABASE_URL` points at a database that holds a project (production, or a drill already run) | Point it at a new, empty add-on |
| `restore: the backup is of schema 12, this server's is 13` | The engine on your machine is not the version that made the backup | Check out the studio app's version, `npm ci`, run again |
| `restore: 3 blob(s) the backup names are missing (first: …)` | Another bucket, or a collection deleted them | Check `blobs.bucket` and the Cellar credentials |
| `restore restores a hosted project: store.kind is postgres` | The configuration is a local one | Use the studio app's configuration (step 3) |
| `"stopped":"gap"` (or `not-the-head`, `blob-missing`) in the last line | The journal in the bucket has a hole after the backup | The database holds the backup plus what was replayed; note it, and take the next backup into account |
| `STUDIO_DATABASE_URL (or POSTGRESQL_ADDON_URI) is required` | No database URI in the shell | Export the drill add-on's URI (step 4) |

<a name="files-changed"></a>

## Files or data changed

- The drill's PostgreSQL add-on: every table, written by the restore.
- The `workDir` folder of your configuration, on your machine.
- Nothing in production: neither its database, nor its bucket (a restore reads the bucket, it never writes to it).
  A new instance started on the restored database would ship its next operations on a new journal line, never over
  the old one.

<a name="recovery"></a>

## Recovery or going back

- The rows are written in one transaction. If the restore fails there (a lost connection, a missing blob, another
  schema), nothing of the backup is written: the drill database is left empty but migrated, since `restore` migrates
  it first. Run `restore` again into it; `replay` would only answer "no restore is under way".
- If the replay fails after the rows were written, the database is marked as being restored and the server will not
  start on it. Resume with `npm run -s studio-server -- replay --config drill.config.json`, or delete the add-on and
  start again.
- Never run `gc --delete` against the drill database: it would delete blobs production still names.
- A restore logs everyone out: sessions and leases are not in a backup. That matters on a real restore, not on a drill.

> [!LIMIT id=no-going-back-after-migrations]
> A backup restores only into the database schema of the version that made it; another schema is refused. The Studio
> Server migrates its database up when it starts and has no command to migrate it down. Once an upgrade has migrated
> production, an older version cannot open that database again: going back means restoring a backup taken before the
> upgrade, with the older version, into a new add-on. What was written since that backup is lost, unless the replay
> can still apply it.

<a name="references"></a>

## References

- [`STUDIO_DATABASE_URL`](reference.environment-variables.md#studio-database-url),
  [`STUDIO_S3_KEY_ID`](reference.environment-variables.md#studio-s3-key-id) and the other variables of the Studio
  Server: [Environment variables](reference.environment-variables.md#studio-server).
- The backup and the restore: [`studio-server/src/ops/backup.ts`](../../studio-server/src/ops/backup.ts); the replay:
  [`studio-server/src/ops/ship.ts`](../../studio-server/src/ops/ship.ts); the commands:
  [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts).
- The test behind the guarantee: [`tests/studio-backup.test.ts`](../../tests/studio-backup.test.ts).
- The design: [ADR 0025](../../docs/dev/adr/0025-studio-server.md).
