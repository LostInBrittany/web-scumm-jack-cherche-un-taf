# Developer setup

From an empty folder to an engine repository whose checks run on your machine. About fifteen minutes, most of it
downloads.

<a name="what-you-will-build"></a>

## What you will build

A clone of `Quest-n-Click/quest-n-click` with its dependencies, the Python image modules, a Playwright Chromium, and a report
from `npm run doctor` with no required item missing. At the end the sample game runs in your browser and the unit suite
passes.

This page is for working **on the engine**. To make a game with a released engine, create a project instead
([Your first game](create.first-game.md)); to install from the repository without contributing, see
[Install from the repository](install.from-repository.md).

<a name="what-you-need"></a>

## What you need

- **Git**.
- **Node.js 22.12 or newer** (`package.json` `engines`: `>=22.12`). The repository's `.nvmrc` says `22`, so `nvm use`
  takes the newest 22 you have installed: make sure it is at least 22.12. The Studio, the tools that write a game and
  the Reality Bridge on SQLite need **22.13 or newer** (`node:sqlite`).
- **Python 3** with the modules of `requirements.txt` (Pillow 13.0.0, NumPy 2.5.4, SciPy 1.18.1): the asset tests and
  `npm run assets` use them. CI uses Python 3.12.
- **ffmpeg** (optional): audio authoring, and `validate --release`, which measures the music stems with `ffprobe`.
- About 2 GB of disk for `node_modules` and the browsers.

The exact versions per system are in [Requirements](install.requirements.md).

<a name="steps"></a>

## Steps

Every command below runs in a terminal, in the engine repository once it is cloned.

<!-- step: clone -->
1. **Clone the repository** and enter it.

   ```sh
   # in the folder that will hold the clone
   git clone https://github.com/Quest-n-Click/quest-n-click.git
   cd quest-n-click
   ```

   You see the repository's folders: `src/`, `games/`, `tools/`, `tests/`, `wiki/`…

<!-- step: node -->
2. **Select Node.** With nvm:

   ```sh
   # in the engine repository
   nvm use
   node --version
   ```

   `node --version` prints `v22.12.0` or newer. Without nvm, install a Node 22 LTS from nodejs.org.

<!-- step: npm-ci -->
3. **Install the dependencies** exactly as the lockfile says.

   ```sh
   # in the engine repository
   npm ci
   ```

   It ends without error and creates `node_modules/`. Use `npm ci`, not `npm install`: the lockfile is part of what CI
   checks.

<!-- step: python -->
4. **Install the Python image modules.**

   ```sh
   # in the engine repository
   python3 -m pip install --require-hashes -r requirements.txt
   ```

   A virtual environment works too; the tools call `python3`, so activate it before running them.

<!-- step: playwright -->
5. **Install a browser for the end-to-end tests.**

   ```sh
   # in the engine repository
   npx playwright install chromium
   ```

   Chromium is required (the e2e and the Studio's checks use it). WebKit and Firefox are optional:
   `npx playwright install webkit firefox` adds them, for the rows CI runs in those browsers.

<!-- step: doctor -->
6. **Ask the doctor.**

   ```sh
   # in the engine repository
   npm run doctor
   ```

   Each line is `✔` (present), `○` (optional and missing) or `✖` (required and missing), with the command that fixes
   it, for instance `Run: python3 -m pip install --require-hashes -r requirements.txt` or
   `Run: npx playwright install chromium`. It
   checks Node (major version 22 or more), Python 3, the image modules, ffmpeg, the three Playwright browsers, and
   Ed25519 and Biscuit for the Reality Bridge. Only a required item fails the report: Python, ffmpeg, WebKit and
   Firefox are optional for daily work. `npm run doctor -- --release` makes Python, its modules and ffmpeg required, as
   `npm run release-check` needs them. The doctor never installs anything.

<!-- step: first-run -->
7. **Run the unit suite and the sample game.**

   ```sh
   # in the engine repository
   npm test
   npm run dev
   ```

   `npm test` runs the unit suite (`test:node`: every test file but the heavy solver tests and the two asset tests). `npm run dev` serves the sample game, "The Pantry Key",
   at `http://localhost:5173/`: open it in a phone-sized window.

<!-- step: game -->
8. **Pick another game** when you need one. The current game is, in this order: the `GAME` environment variable, the
   game the link `.cache/game` points to, `package.json` `"config": { "game" }`, then `demo`.

   ```sh
   # in the engine repository
   GAME=reference npm run dev        # this command only
   GAME=heroes npm run game          # moves the .cache/game link: later commands use heroes
   GAME=demo npm run game            # back to the sample game
   ```

   The bundled games are `demo`, `reference` ("The Night Market"), `heroes`, `signals` and `_template` (the model
   `npm run new-game` copies). `npm run dev`, `npm run check` and `npm run build` run `npm run game` first, so the
   link follows `GAME` when it is set.

> [!LIMIT id=windows-posix]
> On Windows the unit suite runs without the few test files that assume POSIX (file modes, `/` in paths, the shell's
> tools, the connectors' Telnet and SSH tests, the Studio Server's processing worker): CI's `windows` job names them.
> See [Requirements](install.requirements.md).

<a name="what-you-learned"></a>

## What you learned

- The repository's tools are npm scripts; [npm scripts](reference.npm-scripts.md) lists them all.
- `npm run doctor` says what is missing and how to fix it: [`doctor`](install.doctor.md).
- The current game is chosen by `GAME`, a link, then `package.json`.

<a name="next"></a>

## Where to go next

- [The dev loop](contribute.dev-loop.md): change, check, look.
- [Architecture](contribute.architecture.md) and the [Code tour](contribute.code-tour.md).
- [Before a pull request](contribute.before-a-pr.md).
