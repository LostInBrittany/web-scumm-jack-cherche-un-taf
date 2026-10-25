# Upgrading the engine of a hosted game

A game imported into a team Studio from an older project may still be written for an older engine: authoring schema 2
(a 4.1.x project that never ran `quest-n-click migrate`), or imports under the former name `web-scumm/…`. An owner
upgrades it on the server, in one call, judged before anything is written.

This page is about the **game's content**. Upgrading the **server** to a new engine version is a redeploy: see
[Upgrading the server](clever.upgrade-server.md).

<a name="what-you-get"></a>

## What you get

The hosted game at the current authoring schema (3, with stable ids), and its imports under the current name, as one
or two revisions, or a refusal that leaves the head as it was.

<a name="context-and-versions"></a>

## Context and versions

A hosted Studio with its worker, from 4.2.3; the rename of the former name from 4.3.0 (D47). The code is
[`studio-server/src/server/engine-upgrade.ts`](../../studio-server/src/server/engine-upgrade.ts). A local Studio has no
such route: run `quest-n-click migrate` in the project (see [Upgrade](install.upgrade.md)).

In the 4.2.x line the content format is frozen (D40): the schema migration is for a game made on 4.1.x.

<a name="prerequisites"></a>

## Prerequisites

- The `owner` role.
- **A backup taken just before**, as the way back (see [Backups](clever.backups.md)).
- An access token: `npx quest-n-click-studio-server token --server <url>` from the release archive, or
  `npm run studio-server -- token --server <url>` in the engine repository.
- `defineGame({...})` written in `game.ts` (a game that defines it elsewhere is refused: migrate it locally).

<a name="where-to-run"></a>

## Where to run the commands

On any machine where the CLI is logged in to the Studio (see [The server's command line](team.server-cli.md#login)).
There is no button in the Studio yet: the route is the way in.

<a name="steps"></a>

## Steps

<!-- step: backup -->
1. **Take a backup** and note the revision (the header's "revision N").

<!-- step: call -->
2. **Call the route** as an owner:

   ```bash
   curl -X POST -H "Authorization: Bearer $(npx quest-n-click-studio-server token --server https://studio.example)" \
     https://studio.example/api/engine/migrate
   ```

<!-- step: read-answer -->
3. **Read the answer.**
   - `{ "changed": 0, "schema": {…} }`: the game was already at schema 3 (and under the current name); nothing was
     written.
   - `{ "revision", "changed", "paths", "schema": { "from", "to" } }`: the migration was written as one revision,
     `engine upgrade: authoring schema 2 → 3`; `paths` are the files written. With `renamed`, the imports were renamed
     first, as a revision of their own.
   - A **422** with `errors` (and `skipped`, `rev`, possibly `renamed`): refused, nothing of the migration was written.

<!-- step: replay-playtests -->
4. **Replay the playtests** after it: they are neither migrated nor judged (a session recorded at schema 2 may name the
   old positional keys).

<a name="what-it-does"></a>

## What it does

- **Exclusive.** It runs under the owner's exclusive lease (`*`): nobody else writes meanwhile. Their writes get a 423
  with the owner's name, their drafts stay with them, and they write again once it is done. One upgrade at a time
  (429).
- **On the worker.** The worker runs the same migration as `quest-n-click migrate` on the head's snapshot: the stable
  ids written into `rooms/*.ts`, `rules.ts`, `items.ts` and `game.ts`, the translation tables' keys renamed,
  `ids.migration.json` and `ids.paths.json`, then the three lines UPGRADING leaves to the author in `game.ts`
  (`schemaVersion: 3`, `saveVersion` + 1, `migrations: [..., idsMigration]` and its import: all three or none, said in
  `skipped`). Nothing is written yet, and nothing but those files: the Studio refuses an answer that names another
  file, or a file the game does not have (the game's code runs before the migration and could shape it).
- **Judged before it is written.** The migrated game is judged on the worker as the health judges a revision: the
  validator, then the solver from a new game, bounded in time. A game the migration would break (an id the tool could
  not write, a list built by code, a game that can no longer be finished), or that the solver cannot judge in time, is
  refused with a 422 (`errors`, `skipped`: what the tool could not write), and the head stays as it was.
- **One revision.** Otherwise the changed files are written as one operation, through the validation guard.

<a name="former-name"></a>
<!-- applies: 4.3.0.. -->

## The former name

A game that still imports `web-scumm/…` does not load on a 4.3.0 Studio or later (the aliases are gone): its health is
not green and the guard refuses its writes (a 422: the game still does not load). The upgrade first renames those
imports itself, in every TypeScript source of the head (no game code involved), as a revision of its own,
`engine upgrade: the former name's imports renamed`, judged by the validator alone: the game must load after it and,
if it loaded before, gain no error. The solver does not judge it, so a game that cannot be finished yet is never
stuck. The schema's migration follows, judged as above; when it is refused, the answer's `body.renamed` says the
rename was kept.

From 4.5.2 the same rename also moves the unscoped imports of 4.5.1 and before, `quest-n-click/…`, to the scoped
package, `@quest-n-click/engine/…` (D53). Those still load on a 4.5.x Studio meanwhile, so such a game is not refused
before its upgrade.

The rename is written **without an undo** (an undo would bring back imports that no longer resolve), so the owner's
earlier history stays reachable; a backup taken before is the way back. A worker that refuses, times out or leaves no
result while the guard asks never counts as the game not loading: the write fails (503) and the next one asks again.

> [!GUARANTEE id=engine-upgrade-judged-first]
> A game the migration would break is refused before anything is written, and the head stays intact.

> [!LIMIT id=engine-upgrade-scope]
> The project's `tsconfig.json` (`baseUrl`, which `quest-n-click migrate` also fixes) is not part of a hosted game and
> is left alone. The playtests (`playtests/`) are neither migrated nor judged. A game whose `defineGame` is not in
> `game.ts` is refused: migrate it on a local Studio.

<a name="expected-result"></a>

## Expected result, and how to check it

The header shows the new revision(s); the history lists `engine upgrade: …`; the health turns green for the new head.
A second call answers `{ "changed": 0 }`.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| 422 `refused: the migration would break the game (…); nothing was written` | An id the tool could not write, a list built by code, a game that can no longer be finished | Migrate it on a local Studio (`quest-n-click migrate`, then `npm run ids` to see what is left) and import it again, or fix it first |
| 422 `refused: the migrated game cannot be judged (…); nothing was written` | The solver ran out of time | The same: migrate locally |
| 422 `refused: the game still does not load once its imports are renamed (…)` | Something else than the name keeps it from loading | Fix the game locally |
| 422 `refused: renaming the imports adds N validation error(s)` | The rename would add errors | Fix them locally |
| 429 `the engine's upgrade is running: try again when it is done` | Another upgrade runs | Wait |
| 423 for the others while it runs | The exclusive lease | Expected; they write again once it ends |
| 404 `the engine's upgrade needs a hosted Studio with its processing worker` | No worker, or a local server | Use `quest-n-click migrate` locally |

<a name="files-changed"></a>

## Files or data changed

`rooms/*.ts`, `rules.ts`, `items.ts`, `game.ts`, the translation tables, `ids.migration.json`, `ids.paths.json`; for
the former name, every TypeScript source that imported `web-scumm/…` (from 4.5.2, or `quest-n-click/…`).

<a name="recovery"></a>

## Recovery or going back

- **The schema's migration**: the owner's Undo takes it back as a new revision (409 if someone wrote one of its files
  since).
- **The rename**: not undoable; restore the backup taken before (see [Restore drill](clever.restore-drill.md)).

<a name="references"></a>

## References

- [Upgrade](install.upgrade.md), [Upgrade notes: 4.3](install.upgrade-notes-4-3.md).
- [`tests/studio-engine-upgrade.test.ts`](../../tests/studio-engine-upgrade.test.ts).
