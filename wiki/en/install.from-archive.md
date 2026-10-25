# Install from the release archive

The engine is on npm from 4.5.2 ([Install from npm](install.from-npm.md)). Each GitHub release also attaches it as an
archive, `quest-n-click-<version>.tgz`, and that archive creates and runs a game the same way, without the registry.

<a name="what-you-get"></a>

## What you get

A game project of your own, outside the engine repository: one room, a hero and placeholder art, the engine installed
from the release archive under `node_modules/@quest-n-click/engine`, playing in your browser with `npm run dev`.

<a name="context-and-versions"></a>

## Context and versions

- A **created project**, on your machine. Nothing here needs a clone of the engine repository.
- From 4.2.5, the release files are named `quest-n-click-…`. Before 4.2.5 they were `web-scumm-…`
  ([Coming from web-scumm](install.from-web-scumm.md)).
- The commands below are the README's quick start. Each release candidate runs them as a reader copies them, in an
  empty folder outside the repository, against its own archive (`scripts/readme-quickstart.mjs`); after the tag,
  `--published` checks that the URL answers and that its bytes match the release's `SHA256SUMS`.

<a name="prerequisites"></a>

## Prerequisites

- Node.js 22.12 or newer; 22.13 if you will use the local Studio ([Requirements](install.requirements.md#node)).
- Python 3, to prepare the art with `npm run assets` ([Requirements](install.requirements.md#python)).
- ffmpeg is optional: it converts sounds and videos ([Requirements](install.requirements.md#ffmpeg)).
- A release version: take the latest, on <https://github.com/Quest-n-Click/quest-n-click/releases/latest>. This page's commands
  and outputs were run with 4.4.0, a past release: put the latest version in their place.

<a name="where-to-run"></a>

## Where to run the commands

On your machine, in a terminal, from the folder that will **contain** the new project (`create` makes the project's
folder itself). Every command after `cd my-game` runs inside the created project. On Windows, use Git Bash.

<a name="steps"></a>

## Steps

<!-- step: set-archive-url -->
1. Name the archive of the release you want. The URL pattern is
   `https://github.com/Quest-n-Click/quest-n-click/releases/download/v<version>/quest-n-click-<version>.tgz`:

   ```bash
   # in the folder that will contain the project
   T=https://github.com/Quest-n-Click/quest-n-click/releases/download/v4.4.0/quest-n-click-4.4.0.tgz
   ```

<!-- step: create-project -->
2. Create the project from that archive. `--package=$T` runs the `quest-n-click` command of the archive;
   `--engine=$T` writes the same archive as the project's dependency:

   ```bash
   # in the folder that will contain the project
   npx --package=$T quest-n-click create my-game "My Game" --engine=$T
   ```

   `create <folder> ["Title"]` refuses a folder that exists and is not empty. The game's id is the folder's name in
   lowercase kebab case; the title defaults to that name.

<!-- step: npm-install -->
3. Install the engine into the project:

   ```bash
   cd my-game
   npm install
   ```

<!-- step: python-modules -->
4. Install the Python modules the art tools need, from the file the engine package carries:

   ```bash
   # in the created project
   python3 -m pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt
   ```

<!-- step: assets-and-dev -->
5. Prepare the art, then play:

   ```bash
   # in the created project
   npm run assets && npm run dev
   ```

   Open the URL `dev` prints. In landscape on a phone it plays as it will for players (the dev server listens on your
   machine only; [Test on a phone on your network](create.lan-testing.md) opens it to the LAN). `?edit=start` in
   the URL opens the placement editor on the room `start`.

<!-- step: verify-and-build -->
6. When you have changed something, check the game and build it:

   ```bash
   # in the created project
   npm run verify
   npm run build
   ```

   `npm run build` writes `dist/`, a static site any host serves ([Build and release](create.build-release.md)).

To check the archive before you run it, download it with the release's sums and install from the file:

```bash
# in the folder that will contain the project
gh release download v4.4.0 --repo Quest-n-Click/quest-n-click -p 'quest-n-click-4.4.0.tgz' -p 'quest-n-click-v4.4.0-SHA256SUMS'
shasum -a 256 -c --ignore-missing quest-n-click-v4.4.0-SHA256SUMS
npx --package=./quest-n-click-4.4.0.tgz quest-n-click create my-game "My Game" --engine=file:../quest-n-click-4.4.0.tgz
```

The `file:` path is read from the project's folder, hence the `../`. `shasum` prints
`quest-n-click-4.4.0.tgz: OK` when the bytes are those the release lists (checked on 23 Oct 2026 with v4.4.0).

> [!LIMIT id=sums-are-not-provenance]
> A matching sum says the file is the one the release lists, not who made the release. The release's attestations
> and `ship verify` answer that; they are described in [Releasing](contribute.releasing.md).

<a name="expected-result"></a>

## Expected result, and how to check it

`create` ends with:

```text
my-game: "My Game" created (quest-n-click https://github.com/Quest-n-Click/quest-n-click/releases/download/v4.4.0/quest-n-click-4.4.0.tgz).
Next:
  cd my-game
  npm install
  npm run assets && npm run dev
```

`npx quest-n-click help` in the project prints `quest-n-click 4.4.0: an engine for point-and-click games in the
browser` and the list of commands. `npm run dev` shows the template's room with its hero; `npm run verify` ends
without an error (validate, solve, translations status, lint, playtests).

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `npm error 404 Not Found - GET https://registry.npmjs.org/quest-n-click` at `npm install` | The project was created without `--engine=$T`: its dependency is `^<version>`, looked up on npm, where the engine is not published | Create it again with `--engine=$T`, or run `npm install $T` in the project |
| `my-game exists and is not empty` | `create` never writes into a folder that holds files | Pick another folder name, or empty it |
| `npm warn EBADENGINE Unsupported engine` | Node older than 22.12 | Install Node 22.12 or newer ([Requirements](install.requirements.md#node)) |
| `npm run assets` fails on `import PIL` | The Python modules are missing | Step 4 |
| `warning: missing images: …` after `assets` | The content names an image whose file is not in `game/art` | Add the file, or fix the name ([Images](create.images.md)) |
| `npx quest-n-click doctor` stops with `Cannot find package 'playwright'` | `doctor` imports Playwright, which the engine package does not carry | [Install troubleshooting](install.troubleshooting.md#doctor-in-created-project) |

<a name="files-changed"></a>

## Files or data changed

`create` writes only the new folder:

| Path | What |
|---|---|
| `game/` | the game: `game.ts`, `rooms/`, `cast.ts`, `items.ts`, `rules.ts`, `layout/`, `locales/`, `art/`, `audio/`, `provenance.json` |
| `public/` | the page's icons, its preview image, the full font; `public/assets` is written by `npm run assets` (not committed) |
| `dist/` | the build, with `licenses/` (`npm run build`) |
| `package.json` | the scripts `dev`, `studio`, `assets`, `verify`, `build`, `release`, `preview`, each calling `quest-n-click`, and the engine as its one dependency |
| `tsconfig.json` | `@engine/*` points into `node_modules/@quest-n-click/engine/src/engine`, `@quest-n-click/engine/*` into its public API |
| `.gitignore`, `README.md` | `node_modules`, `dist`, `.cache`, `public/assets` ignored; the commands above |

The template's art is a placeholder drawn from shapes (`tools/placeholder-art.py`): `game/provenance.json` says so, and
`npm run release` refuses it until each file is replaced and reviewed (`npx quest-n-click provenance --lock`). The
whole layout of a project is on [Project layout](create.project-layout.md).

`npm install` adds `node_modules/` and `package-lock.json`; `npm run assets` writes `public/assets/` and `.cache/`,
and updates `game/assets.gen.json` (the pixel sizes of the prepared images). The commands run with the project as their working folder
([`WEB_SCUMM_PROJECT`](reference.environment-variables.md#web-scumm-project)): the engine in `node_modules/@quest-n-click/engine`
is read, never written. Outside the project, only npm's cache and the Python modules of step 4 change.

<a name="recovery"></a>

## Recovery or going back

Delete the project's folder: nothing else was written for it. To change the engine version later, see
[Upgrade](install.upgrade.md).

<a name="other-archives"></a>
<!-- applies: 4.2.5.. since 4.2.1 -->

## The other archives of a release

A release attaches five npm archives, all at the same version (v4.4.0's list, read on 23 Oct 2026):
`quest-n-click-<version>.tgz` (the engine), `create-quest-n-click-<version>.tgz` (`npm init @quest-n-click`, once
on npm), `quest-n-click-bridge-<version>.tgz` (the reference Reality Bridge, [Install and run the Bridge](bridge.install-run.md)), `quest-n-click-connectors-<version>.tgz` (the connectors, an operator's, never a
game's) and, from 4.2.1, `quest-n-click-studio-server-<version>.tgz`. What each holds is on
[Package reference](install.package.md).

The Studio Server archive holds the two commands `quest-n-click-studio-server` and `quest-n-click-studio-worker`, the
Studio's page already built, and its own dependencies (OpenID Connect, JWT, Postgres). Their versions are locked in its
`npm-shrinkwrap.json` and its SBOM; npm reads that lock when it installs from the registry, not from an archive file,
where `pg` takes the latest 8.x its range allows (`quest-n-click-studio-server deps` says which). It runs the server of
the engine installed beside it, which must be the same version:

```sh
# on the server's machine, in an empty folder for the installation
npm install quest-n-click-<version>.tgz quest-n-click-studio-server-<version>.tgz
npx quest-n-click-studio-server import ./my-game --config studio.config.json
npx quest-n-click-studio-server serve --config studio.config.json
npx quest-n-click-studio-worker          # on the worker's machine, with WORKER_PUBLIC_KEY and WORKER_INSTANCE
```

A worker installed from the archives prepares assets too (since 4.2.3): its build hook installs the hashed
`requirements.txt` the engine's package carries, from the worker's folder, where the worker looks for the packages
([`WORKER_PYTHON_PATH`](reference.environment-variables.md#worker-python-path) to put them elsewhere):
`CC_POST_BUILD_HOOK=python3 -m pip install --target .python --require-hashes --only-binary=:all: -r
node_modules/@quest-n-click/engine/requirements.txt`. Its hashes cover the wheels of every platform PyPI
publishes, Clever Cloud's native runtime (CPython 3.13, Linux x86_64) among them; before 4.5.2 the hook named
`ops/studio/worker-requirements.lock`, which is gone. In 4.2.2 this needed a worker deployed from the repository.

The engine's archive brings Vite and tsx, which the worker needs to run the game's code and build its previews (the
Studio itself no longer runs Vite, since 4.2.2). Set `publicDir` to your game's prepared assets (`public/` of your
game's repository): the engine's own holds only its icons and font. Each release's candidate installs these two
archives in an empty folder and serves a game from them, its dependencies found whether npm hoists or nests them
(`scripts/studio-install-smoke.mjs`). Deploying it is [First deployment on Clever Cloud](clever.first-deployment.md).

<a name="references"></a>

## References

- [Requirements](install.requirements.md), [Package reference](install.package.md), [Upgrade](install.upgrade.md)
- [Your first game](create.first-game.md), [Play online](start.play-online.md)
- [`cli/create.mjs`](../../cli/create.mjs) (what `create` writes), [`scripts/readme-quickstart.mjs`](../../scripts/readme-quickstart.mjs)
  (the quick start replayed by each candidate)
