# Retention

What a hosted Studio keeps, where, and for how long, read from the code of the current version; then what you can
delete, and how. Most of the project is kept for good on purpose: the journal is the game's history.

**Verified on: not verified on a live installation** for the deletions below (`gc --delete` was not run on the
reference deployment); `--keep` was ([Backups](clever.backups.md)). Applies from 4.2.3.

<a name="journal"></a>

## The journal and the game's files

| What | Where | Kept |
|---|---|---|
| Every confirmed operation (who, when, which files, their contents' hashes before and after) | PostgreSQL, `studio_ops` | **For good.** Nothing deletes a confirmed operation: it is the history undo, the diff and the replay read |
| The head: each file's current version | PostgreSQL, `studio_files` | While the file exists |
| The files' contents (blobs, by hash) | Cellar, `sha256/<hash>` | While a row names it (the head, any operation, a preview, a build, a prepared set), and at least a day; after that, only `gc --delete` removes it |
| The journal shipped to the bucket | Cellar, `journal/<epoch>/<line>/<rev>.json` | **For good**: nothing deletes a segment |

<a name="previews"></a>

## Previews, builds, prepared assets

| What | Kept |
|---|---|
| Each revision's preview (its paths and hashes, or why it failed) | For good, with its blobs: about 1 MB per revision for the sample game, few files shared between revisions. No command deletes previews in this version |
| Published builds | For good |
| Prepared asset sets | The rows for good; on the instance's disk only the current set (an older one is removed when a new one is served) |
| The worker's staging (a job's snapshot and result) | `staging/` in the bucket: deleted after each job; anything left older than an hour is removed by `gc --delete` |

<a name="backups"></a>

## Backups

The daily backup keeps the `STUDIO_BACKUP_KEEP` most recent (14 by default) of the backups it wrote; a backup taken by
hand with `backup --to-bucket` and no `--keep` is counted among them at the next daily run, as it has the same name
form. Copies you make elsewhere are yours to delete ([Backups](clever.backups.md)).

<a name="people"></a>

## People and sessions

| What | Kept |
|---|---|
| Users (the provider's `iss`, `sub`, email, name), seen at first login | For good, also after a member is removed (their email and name follow the provider at each login) |
| Members and roles | Until removed by an owner |
| Invitations (stored by their hash) | Used once, valid 7 days; the rows stay |
| The audit log (logins, invitations, role changes, removals, revocations; the actor's id) | For good. `GET /api/audit` shows the 200 most recent |
| Comments, with their author's name | For good: a comment is edited or resolved, never deleted |
| Browser sessions | 8 h idle, 24 h in all (configurable); a session row is deleted at logout, removal, revocation, or when presented after it ended. No periodic sweep |
| Logins under way | 10 min; deleted at the next login |
| The game origin's tickets and sessions | 60 s and 15 min; expired ones deleted at the next use |
| Answers kept for a client's retry (by operation id) | 7 days |
| Back-channel logout tokens seen | Until their own expiry |

> [!LIMIT id=no-erasure-command]
> There is no command to erase a person from a project: removing a member ends their access, but their user row, the
> audit entries and the operations they wrote (authored by them in the history) remain, in the database and in every
> backup. Erasing them means editing the database by hand, which this project does not document.

<a name="memory-and-logs"></a>

## In memory, and the logs

- Jobs (Prepare, cuts) are kept in the instance's memory, the 50 most recent ended ones; a restart forgets them.
- The metrics live in memory and restart from zero.
- The logs go to Clever Cloud's log service; how long Clever keeps them is Clever's setting, not this project's.
  Request lines carry the path, the status and the client's address; never a secret.

<a name="purge"></a>

## Deleting what can be deleted

<!-- step: list -->
1. List what the collection would delete, without deleting anything:

   ```sh
   # in a shell on the studio app (clever ssh --alias my-game-studio)
   cd "$APP_HOME" && npm run -s studio-server -- gc
   ```

   Its line, `{"event":"collectable","referenced":…,"unreferenced":…,"removed":0,"staging":…}`, counts the blobs
   no row names (older than a day) and the stale staging objects.

<!-- step: delete -->
2. Take a backup first, then delete:

   ```sh
   # in a shell on the studio app (clever ssh --alias my-game-studio)
   cd "$APP_HOME" && npm run -s studio-server -- gc --delete
   ```

   An older backup restored after a collection loses only the previews, builds and prepared sets whose blobs the
   collection took (counted as `dropped`). Never run it against a drill's database: it would delete blobs production
   still names.

> [!GUARANTEE id=gc-keeps-referenced]
> The collection keeps every blob a row names and every blob still in its grace period (a write may be storing it now),
> and deletes the rest only with `--delete`.

The grace period is a day by default.

<a name="related"></a>

## Related identifiers

- `npm run studio-server -- gc`, `backup --to-bucket --keep`, [`STUDIO_BACKUP_KEEP`](reference.environment-variables.md#studio-backup-keep).
- The code: [`studio-server/src/ops/gc.ts`](../../studio-server/src/ops/gc.ts),
  [`studio-server/src/ops/backup.ts`](../../studio-server/src/ops/backup.ts) (what a backup keeps or skips, and why),
  [`studio-server/src/server/auth/store.ts`](../../studio-server/src/server/auth/store.ts); the test:
  [`tests/studio-backup.test.ts`](../../tests/studio-backup.test.ts).
- Leaving altogether: [Exporting the game](clever.export-leave.md), [Costs and teardown](clever.costs-teardown.md).
