# Upgrading the server and checking state after a migration

Upgrading the Studio Server is the same overlapping redeploy as any other, of a new version: the database migrations
run when the new instance starts. This page upgrades both apps and checks, afterwards, that the game is where it was.

<a name="what-you-get"></a>

## What you get

Both apps at the new version, the database migrated to its schema, the game's revision unchanged by the upgrade, writes
served again, and a backup taken just before, to go back to if needed.

<a name="context-and-versions"></a>

## Context and versions

- A hosted Studio on Clever Cloud, deployed from the repository, from 4.2.3 (the lease handoff).
- This page is about the server. The game's own content (authoring schema 2 → 3, the former `web-scumm/…` imports) is
  upgraded inside the Studio by its owner: [Upgrading the engine of a hosted game](team.upgrade-engine.md).
- **Verified on: 19 October 2026, by the reference deployment**: an upgrade from commit 52e68932 to c66fbf56 (both
  package.json 4.2.2, before the 4.2.3 tag), with one new migration (`0012`, the comments table), following these four
  steps. This page's exact text is not verified on a live installation.

<a name="prerequisites"></a>

## Prerequisites

- A running Studio with backups ([Backups](clever.backups.md)).
- The engine repository on your machine, checked out at the **new** version, `npm ci` done.

<a name="where-to-run"></a>

## Where to run the commands

`git`, `clever deploy`: on your machine, in the engine repository. The backup: in a shell on the studio app
(`clever ssh --alias my-game-studio`).

<a name="steps"></a>

## Steps

<!-- step: read -->
1. Read the version's CHANGELOG, and the upgrade notes for the game's content
   ([Upgrade](install.upgrade.md)). List the new database migrations between the two versions:

   ```sh
   # on your machine, in the engine repository
   git diff --name-only v4.3.1 v4.4.0 -- studio-server/migrations
   ```

   Migrations run when the new instance starts, while the old one may still serve. If one changes what the old
   version reads (a column it uses renamed or dropped, not a new table), stop the old one first, `clever stop --alias
   my-game-studio`, and accept the minute without the Studio.

<!-- step: backup -->
2. Take a backup to the bucket and note its revision:

   ```sh
   # in a shell on the studio app (clever ssh --alias my-game-studio)
   cd "$APP_HOME" && npm run -s studio-server -- backup --to-bucket
   ```

<!-- step: deploy -->
3. Deploy the worker first, then the studio, the same version:

   ```sh
   # on your machine, in the engine repository, at the new version
   clever deploy --alias my-game-worker
   clever deploy --alias my-game-studio
   ```

   Until both are at the new version, a job may be refused; the Studio then refuses the write it was checking (it
   fails closed, a 503) rather than letting it through.

<!-- step: check -->
4. Watch `/readyz` come back to 200 on the new instance (`instance` in the `lease-taken` log line), check the revision
   is unchanged, and make one write.

> [!MEASURE id=upgrade-run]
> The studio deploy with migration 0012: "1 minute and 29 seconds". The revision went on: 52 before the switch, 53 for
> the first write after it; later writes answered in 164 to 600 ms. Writes were refused for 2 min 23 s (this version
> had no lease handoff yet; [Redeploys](clever.redeploys.md)), and one write, retried 70 times with its id, was applied
> once.
> - date: 2026-10-19
> - version: 4.2.2
> - volume: the demo game, revision 52; one new migration
> - conditions: reference deployment phase B, 52e68932 → c66fbf56 on main before the 4.2.3 tag (package.json said 4.2.2); worker then studio, XS apps, PostgreSQL DEV, region par
> - source: [QUALIF-4.2.3-REFERENCE.md §1 and §5](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

<a name="expected-result"></a>

## Expected result, and how to check it

Check, in this order:

- **It started.** The new instance's log has `{"event":"lease-taken",…}`; `https://studio.example.fr/readyz` answers
  200, `"writes":"served"`, `rpoMs` back to 0.
- **The game did not move.** As a member, `GET /api/revision` gives the same `epoch` and `revision` as before the
  deploy (or later, if people wrote meanwhile).
- **It writes.** One change (a note) is saved, at the next revision.
- **The schema.** With `psql` and the add-on's URI (Clever's console shows it; never paste it anywhere),
  `SELECT MAX(version) FROM schema_migrations` gives the number of the newest file in `studio-server/migrations/` of
  the new version.
- **The worker.** The header's health goes green again and a preview builds (the worker's jobs succeed); in the logs,
  no `health-failed` or `preview-failed` after the switch.
- **A restore still works.** Run the [restore drill](clever.restore-drill.md) with the new version, on a backup taken
  after the upgrade.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| Writes 503 "the edit cannot be judged now: …" for a while | The worker at the old version, or redeploying | Wait for both deploys; deploy the worker first |
| Writes refused about 2.5 min | The first deploy onto a version with the lease handoff, from one without | Expected once ([Redeploys](clever.redeploys.md)) |
| `too many connections` in the logs during the deploy | PostgreSQL DEV plan | A larger plan |
| The old instance logs errors on a column the migration changed | A migration that changes what the old version reads | Next time, `clever stop` first (step 1) |

<a name="files-changed"></a>

## Files or data changed

The database schema (new migrations applied, recorded in `schema_migrations`), a new backup under `backups/`, the two
apps' deployed commit.

<a name="recovery"></a>

## Recovery or going back

Redeploying the previous version works only while it can still read the migrated database; an older server refuses a
database whose schema is newer than its own. Otherwise, going back is restoring the backup of step 2 into a new add-on,
with the previous version: [Limits of going back](clever.going-back.md).

<a name="references"></a>

## References

- The migrations: [`studio-server/migrations/`](../../studio-server/migrations/0012.up.sql) (one `NNNN.up.sql` and
  `NNNN.down.sql` per step); the runner: [`bridge/src/migrations.ts`](../../bridge/src/migrations.ts).
- [Redeploys](clever.redeploys.md), [Backups](clever.backups.md), [`CHANGELOG.md`](../../CHANGELOG.md).
