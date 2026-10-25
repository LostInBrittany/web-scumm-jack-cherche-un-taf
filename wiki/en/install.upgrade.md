# Upgrade

Moving a game to a newer engine is three commands: install the new engine, `migrate`, `verify`. This page gives them
with the checks around them, for a created project first, then for a game inside the engine repository and on a
hosted Studio.

<a name="overview"></a>

## In short

```bash
# in the created project
npm install https://github.com/Quest-n-Click/quest-n-click/releases/download/v<version>/quest-n-click-<version>.tgz
npx quest-n-click migrate
npm run verify
```

Once the engine is on npm, the first line is `npm install @quest-n-click/engine@<version>`. Read the upgrade notes of each
version you cross first; the rest of this page is the same procedure with its checks.

<a name="what-you-get"></a>

## What you get

Your game on the new engine version: its sources at that engine's authoring format, checked by `verify`, its players'
saves still loading.

<a name="context-and-versions"></a>

## Context and versions

- A **created project** (the engine under `node_modules/@quest-n-click/engine`). A game inside the engine repository and a
  game on a hosted Studio have their own section below.
- This procedure is the one for a target of 4.3.0 or later, where `quest-n-click migrate` also renames a project still
  under the former name `web-scumm`. Coming from before 4.2.5, read [Coming from web-scumm](install.from-web-scumm.md)
  too.
- What each version changes is in the upgrade notes: [4.5](install.upgrade-notes-4-5.md),
  [4.4](install.upgrade-notes-4-4.md), [4.3](install.upgrade-notes-4-3.md), [4.2](install.upgrade-notes-4-2.md), [4.1](install.upgrade-notes-4-1.md),
  [v3](install.upgrade-notes-v3.md), [v2 to v3](install.upgrade-notes-v2-to-v3.md). Which versions are supported, and
  how long a deprecation lasts, is on [Stability](start.stability.md).
- Every upgrade is checked before a release: the candidate creates a game with an older release, makes a save in it,
  moves the project to the new archives as below, and plays the old save to the ending (`npm run upgrade-check`,
  `scripts/external-consumer.mjs`, on Ubuntu, macOS and Windows).

<a name="prerequisites"></a>

## Prerequisites

- The project committed (or copied): `migrate` rewrites sources in place.
- The [Requirements](install.requirements.md) of the new version (Node 22.12, 22.13 for the local Studio).
- The upgrade notes of every version between yours and the target, read for what concerns your game.

<a name="where-to-run"></a>

## Where to run the commands

In the created project's folder, on your machine.

<a name="steps"></a>

## Steps

<!-- step: commit -->
1. Commit the project as it is, so the upgrade is one reviewable change:

   ```bash
   # in the created project
   git add -A && git commit -m "Before the engine upgrade"
   ```

<!-- step: install-new-engine -->
2. Install the new engine, from npm from 4.5.2 (`npm install @quest-n-click/engine@<version>`,
   [Install from npm](install.from-npm.md)) or from the release archive:

   ```bash
   # in the created project
   npm install https://github.com/Quest-n-Click/quest-n-click/releases/download/v4.4.0/quest-n-click-4.4.0.tgz
   ```

   Once the engine is on npm, this step is `npm install @quest-n-click/engine@<version>`.

<!-- step: migrate -->
3. Bring the sources to the installed engine's format. `--check` first says what is due and writes nothing:

   ```bash
   # in the created project
   npx quest-n-click migrate --check
   npx quest-n-click migrate
   ```

   `migrate` does, in order: makes `tsconfig.json` acceptable to TypeScript 7 (drops `baseUrl`, the paths made
   relative, 4.1.8); renames what still says `web-scumm` (imports, `tsconfig.json`, `package.json`'s commands, 4.3.0);
   then, for a game still on authoring schema 2, writes its stable ids (`ids --write --map`) and prints what is left to
   do by hand. A game already on schema 3 gets `✔  [<id>] authoring schema 3: up to date with this engine`.

<!-- step: reinstall -->
4. If `migrate` renamed `package.json`, install again: `npm install`.

<!-- step: verify -->
5. Check the game, then rebuild its assets if the notes ask for it:

   ```bash
   # in the created project
   npm run verify
   npm run assets
   ```

<!-- step: check-saves -->
6. Load a save made before the upgrade. In `npm run dev`, continue from an autosave or a slot, or import an exported
   save from the pause menu, and play on.

<!-- step: build -->
7. Build: `npm run build`, then commit the upgrade.

> [!GUARANTEE id=migrate-check-says-due]
> `migrate --check` on a game still at authoring schema 2 exits with code 1 and says `authoring schema 2: a migration
> to 3 is due`.

The test runs it on a schema-2 fixture. That nothing is written is read in the code (`--check` exits before the ids
are written); the test does not assert it.

<a name="saves"></a>

## Players' saves

- A save from any 3.x or 4.x release loads in every later 4.x. Since 4.1.15 a save is written as envelope schema 4;
  schema 3 (every save before 4.1.15) is still read and opens in the story world. The sample game keeps one save per
  release, from 3.0.0 to 4.4.0, and each must load on the current engine and reach the ending
  (`tests/save-v3.test.ts`, "golden saves").
- A save newer than the game is refused, never half read: with a `saveVersion` above the game's, no chain of
  migrations reaches the game's version, and loading stops with `save version <n> cannot be migrated to <m>`
  (`src/engine/core/save.ts`); the current session is left as it was.
- When **your** content changes in a way that breaks saves, you raise `saveVersion` and add one `migrations` step per
  version: [State and saves](create.state-saves.md).
- Downgrades are not supported: a save made by a newer engine may not load on an older one (a 4.1.15 save does not
  load on 4.1.14).

<a name="expected-result"></a>

## Expected result, and how to check it

`npx quest-n-click help` prints the new version on its first line. `npx quest-n-click migrate --check` exits 0.
`npm run verify` passes. An old save loads and plays on.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `npm error 404 Not Found - GET https://registry.npmjs.org/quest-n-click` | `npm install @quest-n-click/engine@<version>`: not on npm | Install the archive's URL (step 2) |
| ✖ tsconfig.json has baseUrl, which TypeScript 7 refuses: a migration is due | A project made before 4.1.8 | `npx quest-n-click migrate` |
| `✖  still under the former name web-scumm: …` | A project made before 4.2.5 | `npx quest-n-click migrate`, then `npm install` ([Coming from web-scumm](install.from-web-scumm.md)) |
| `✖  [<id>] authoring schema <n> is newer than this engine's (3): install a newer quest-n-click` | The game was written for a newer engine | Install that engine, not an older one |
| An import of `web-scumm/content` (or another `web-scumm/…`) no longer resolves | Imports under the former name, gone in 4.3.0 | `npx quest-n-click migrate` |

<a name="files-changed"></a>

## Files or data changed

`package.json` and `package-lock.json` (the engine's version); what `migrate` rewrites: `tsconfig.json`,
`package.json`'s scripts, the game's sources (imports, and stable ids for a schema-2 game, with `ids.migration.json`
and `ids.paths.json`); `public/assets/` after `assets`. Players' saves stay in their browsers: nothing on your side
rewrites them; the new engine reads them.

<a name="recovery"></a>

## Recovery or going back

Before the release goes out: `git reset --hard` to the commit of step 1, then `npm install` to put the old engine
back. After players have played on the new version, going back is not supported: their saves may already be in a
format the old engine does not read.

<a name="engine-repository"></a>

## A game inside the engine repository

In the engine repository the engine is the checkout itself: move it to the new version (`git pull`, or
`git checkout v<version>`), then:

```bash
# at the root of the engine repository
npm ci
GAME=<id> npm run migrate -- --check
GAME=<id> npm run migrate
npm run verify:game
```

<a name="hosted-studio"></a>

## A game on a hosted Studio

The owner upgrades a hosted game's engine from the Studio (`POST /api/engine/migrate`): the migration runs on the
worker, is judged like a revision, and is written as one undoable operation, or refused (422) with nothing written:
[Upgrading the engine of a hosted game](team.upgrade-engine.md). Upgrading the server itself is
[Upgrading the server](clever.upgrade-server.md).

<a name="references"></a>

## References

- The upgrade notes: [4.5](install.upgrade-notes-4-5.md), [4.4](install.upgrade-notes-4-4.md), [4.3](install.upgrade-notes-4-3.md),
  [4.2](install.upgrade-notes-4-2.md), [4.1](install.upgrade-notes-4-1.md), [v3](install.upgrade-notes-v3.md),
  [v2 to v3](install.upgrade-notes-v2-to-v3.md)
- [Stability](start.stability.md), [State and saves](create.state-saves.md), [Changelog](reference.changelog.md)
- [`tools/migrate.ts`](../../tools/migrate.ts), [`scripts/upgrade-check.mjs`](../../scripts/upgrade-check.mjs),
  [`tests/save-v3.test.ts`](../../tests/save-v3.test.ts)
