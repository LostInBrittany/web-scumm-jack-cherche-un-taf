# Exporting the game and leaving the installation

How to take everything out of a hosted Studio on Clever Cloud: the game's files as a folder you can open in a local
Studio, and the rest of the project (members, comments, history) in a form you keep. Then you can delete the
installation.

<a name="what-you-get"></a>

## What you get

- A folder with the game's files at the head revision and an `export-manifest.json` naming each file's hash and the
  revision: a game you can run with a local Studio, with no server.
- The latest backup and a copy of the bucket (`backups/`, `sha256/`, `journal/`) on storage of yours: everything a
  restore needs, should you want the hosted project back.

<a name="context-and-versions"></a>

## Context and versions

- A hosted Studio on Clever Cloud, from 4.2.3. `studio-server export` exists since 4.2.1.
- **Verified on: not verified on a live installation.** No export was made from the reference deployment. The export
  reads the database and the bucket as a restore does; running it against a restored copy (below) was not exercised.

<a name="prerequisites"></a>

## Prerequisites

- The engine repository on your machine at the studio app's version, `npm ci` done.
- An S3 tool and the Cellar credentials; `clever-tools` logged in.
- The [restore drill](clever.restore-drill.md), read: the export runs on a restored copy, never on production.

<a name="where-to-run"></a>

## Where to run the commands

On your machine, in the engine repository at the studio app's version, with `STUDIO_DATABASE_URL` pointing at a
**drill** add-on, never at production's.

<a name="steps"></a>

## Steps

<!-- step: tell-and-freeze -->
1. Tell the members, and agree on a last write: what is written after the backup of step 2 is in the journal shipped
   to the bucket, and comes back with the replay, but nobody should keep working on an installation being left.

<!-- step: backup-and-copy -->
2. Take a backup to the bucket (`npm run -s studio-server -- backup --to-bucket` in `clever ssh`), then copy the whole
   bucket to storage of yours with an S3 tool: `backups/`, `sha256/` (the contents) and `journal/`. A backup without
   its blobs restores nothing ([Backups](clever.backups.md#holds)).

<!-- step: restore-copy -->
3. Restore that backup into a new, empty PostgreSQL add-on, following the [restore drill](clever.restore-drill.md)
   steps 2 to 4. You now have a copy of the project that is not production.

<!-- step: export -->
4. Export the game at its head from that copy, into a new folder:

   ```sh
   # on your machine, in the engine repository, STUDIO_DATABASE_URL and the Cellar keys exported as in the drill
   npm run -s studio-server -- export ./my-game-export --config drill.config.json
   ```

   It writes every file of the head, checks each one's hash against the head (a mismatch stops it: "the content does
   not match the head"), and writes `export-manifest.json` (`game`, `epoch`, `revision`, `files`). Its last line is
   `{"event":"exported","revision":…,"files":…}`. It refuses a folder that is not empty.

<!-- step: open-locally -->
5. Open the exported game in a local Studio: copy the folder as `games/my-game` of a created project (or the engine
   repository) and run its Studio there ([Overview and launch](studio.overview.md)).

<!-- step: git-alternative -->
6. If the Studio pushes to a Git repository (`git` in its configuration), a last push from the Studio gives the same
   files with their history as commits ([The game in Git](team.game-in-git.md)): keep that repository too.

> [!LIMIT id=export-is-files]
> The export holds the game's files only. Members, invitations, comments, the audit log, personal undo, the previews,
> the published builds and the prepared assets are not in it; they are in the backup's JSON (step 2), which keeps them
> readable but which only a Studio Server of the same version restores.

<a name="expected-result"></a>

## Expected result, and how to check it

`export-manifest.json`'s `revision` is the head you noted (`GET /api/revision` before leaving), its `files` list as
many entries as the folder holds, and the local Studio opens the game and validates it.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `export: an empty or new folder is required` | The folder exists and holds files | A new folder |
| `STUDIO_DATABASE_URL (or POSTGRESQL_ADDON_URI) is required` | No database URI in the shell | Export the drill add-on's URI |
| `<path>: the content does not match the head` | A blob in the bucket differs from what the head names | Stop; check the bucket and the Cellar credentials |
| The local Studio says the game does not load | The game imports files outside its folder, or the engine version differs | Use the engine at the studio app's version |

<a name="files-changed"></a>

## Files or data changed

The export folder and the bucket copy on your side; a drill add-on in Clever Cloud (delete it afterwards). Production
is only read, for the backup.

<a name="recovery"></a>

## Recovery or going back

Nothing in production is changed. To come back to a hosted Studio later, restore the kept backup and bucket copy into
a new installation of the same version ([restore drill](clever.restore-drill.md)), or import the exported folder into a
new one (`npm run studio-server -- import`, [First deployment](clever.first-deployment.md#steps)): an import starts a
new history.

<a name="references"></a>

## References

- `export`, `import`: [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts); the backup:
  [`studio-server/src/ops/backup.ts`](../../studio-server/src/ops/backup.ts); Git:
  [`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts).
- Then delete the installation: [Costs and teardown](clever.costs-teardown.md); what is kept and for how long:
  [Retention](clever.retention.md).
