# Limits of going back

After an upgrade, going back to the previous version of the Studio Server is sometimes a plain redeploy, and sometimes
a restore that loses what was written since. This page says which, why, and what to do in each case.

<a name="why"></a>

## Why

The Studio Server migrates its database **up** when it starts, step by step (`studio-server/migrations/NNNN.up.sql`,
recorded in `schema_migrations`). The migrations' runner refuses a database newer than every step it knows: an older
server cannot open a database a newer one migrated past it. Each step also has a `NNNN.down.sql`, and the shared
runner can apply them, but **the Studio Server has no command to migrate down**: a downgrade of the schema is not a
supported procedure.

> [!GUARANTEE id=newer-schema-refused]
> On the Bridge's SQLite store, migrating a database whose schema is newer than the Bridge's last migration is refused
> with an error that says the database is newer than this Bridge knows.

The full message is "the database is at schema N, newer than this Bridge knows (M): upgrade the Bridge". The code
throws it before any step, so nothing changes; the test does not assert that. The Studio Server runs the same runner
(`bridge/src/migrations.ts`), whose message still says "Bridge".

So there are two cases.

<a name="cases"></a>

## The two cases

| The upgrade… | Going back is… | What is lost |
|---|---|---|
| added no migration | a redeploy of the previous version | nothing |
| added at least one migration | not possible by redeploy (the old server refuses the newer schema): a restore, with the previous version, of the backup taken **before** the upgrade, into a **new** add-on | what was written since that backup, unless the replay can still apply it |

The replay after a restore applies the journal shipped since the backup, as long as each operation continues the head;
it stops at the first that does not (`stopped`). Whether the operations a newer version wrote replay onto an older
one was never measured; the restore's last line says how far it went.

<a name="procedure"></a>

## Going back, step by step

**Verified on: not verified on a live installation.** No downgrade was exercised by the reference deployment.

<!-- step: try-redeploy -->
1. If the upgrade added no migration (`git diff --name-only <old tag> <new tag> -- studio-server/migrations` is
   empty), redeploy the previous version, worker first. `clever deploy` pushes your checkout's commit; an older one is
   not a fast-forward of what is deployed, so it needs `--force`:

   ```sh
   # on your machine, in the engine repository
   git checkout v4.3.1
   clever deploy --alias my-game-worker --force
   clever deploy --alias my-game-studio --force
   ```

<!-- step: read-refusal -->
2. If the old studio does not start and its log says `the database is at schema …, newer than this Bridge knows`, the
   schema cannot go back. Redeploy the new version to serve again, then choose: stay on it, or restore.

<!-- step: restore-older -->
3. To restore: follow the [restore drill](clever.restore-drill.md) with the **previous** version checked out, the
   backup taken before the upgrade, and a **new** PostgreSQL add-on. Then link that add-on to the studio app in place
   of the old one, and deploy the previous version on it. Members log in again (sessions are not in a backup).

<!-- step: keep-old -->
4. Keep the upgraded database's add-on until you have checked the result: it is the only copy of what was written
   between the backup and the switch, if the replay stopped early.

> [!LIMIT id=no-schema-downgrade]
> There is no supported way to migrate the Studio's database down. The `NNNN.down.sql` files are kept for the
> runner's tests; running them by hand on production is not documented, not tested on a hosted Studio, and would
> leave a database no backup describes.

<a name="game-content"></a>

## Going back on the game's content

The owner's engine upgrade of the game (authoring schema 2 → 3) is one revision: the owner's Undo takes it back, as a
new revision (409 if someone wrote one of its files since). The rename of the former `web-scumm/…` imports (4.3.0) is
written without an undo; a backup taken before is the way back
([Upgrading the engine of a hosted game](team.upgrade-engine.md)).

<a name="alternatives"></a>

## Alternatives set aside

- **A `migrate --down` command.** It would let an older server open the database again, but a down step can drop
  data the newer version wrote (a new table, the comments of `0012` for instance), silently. A restore says what it
  kept and what it dropped.
- **Never migrating while the old instance serves.** That would mean a stop at every upgrade; the overlap is kept, with
  `clever stop` first for the one case that needs it ([Upgrading the server](clever.upgrade-server.md)).

<a name="trade-offs"></a>

## Trade-offs

Going back after a migration costs a restore, a new add-on, a logout of everyone, and possibly the writes since the
backup. That is why the backup of the upgrade's step 2, and a drill on the new version, come first.

<a name="decisions"></a>

## Decisions and ADRs

- The runner: [`bridge/src/migrations.ts`](../../bridge/src/migrations.ts) (ADR 0009 for the Bridge's schema, reused by
  the Studio Server); the migrations: [`studio-server/migrations/`](../../studio-server/migrations/0012.down.sql).
- The test behind the guarantee: [`tests/bridge-reality-store.test.ts`](../../tests/bridge-reality-store.test.ts).
- [Upgrading the server](clever.upgrade-server.md), [Restore drill](clever.restore-drill.md).
