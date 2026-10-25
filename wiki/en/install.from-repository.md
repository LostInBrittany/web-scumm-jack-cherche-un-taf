# Install from the repository to work on the engine

To change the engine itself, its tools or its Studio, or to play its sample games from source, you work in a clone of
the engine repository. To make a game of your own, you do not need it: [Install from the release archive](install.from-archive.md).

<a name="what-you-get"></a>

## What you get

A clone of `Quest-n-Click/quest-n-click` with its development dependencies, the Python modules and Chromium installed,
checked by `npm run doctor`, and the sample game running with `npm run dev`.

<a name="context-and-versions"></a>

## Context and versions

- The **engine repository**, on your machine. Every command runs at the root of the clone.
- `main` holds work not released yet. To work on a released version, check out its tag (`git checkout v4.4.0`).
- The repository is `github.com/Quest-n-Click/quest-n-click` since 4.5.2; the older addresses,
  `github.com/wanoo/quest-n-click` (4.2.5 to 4.5.1) and `github.com/wanoo/web-scumm`, redirect to it.
- The whole contributor setup, with the conventions and the checks before a pull request, is
  [Developer setup](contribute.setup.md); this page is the installation only.

<a name="prerequisites"></a>

## Prerequisites

- git, and Node.js 22.12 or newer (22.13 for the local Studio and the writing tools); `nvm` reads the repository's
  `.nvmrc` ([Requirements](install.requirements.md#node)).
- Python 3 ([Requirements](install.requirements.md#python)).
- Optional: ffmpeg, for sounds and the audio pipeline ([Requirements](install.requirements.md#ffmpeg)).

<a name="where-to-run"></a>

## Where to run the commands

On your machine, in the folder that will hold the clone, then at the clone's root. On Windows, in Git Bash.

<a name="steps"></a>

## Steps

<!-- step: clone -->
1. Clone the repository and enter it:

   ```bash
   # in the folder that will hold the clone
   git clone https://github.com/Quest-n-Click/quest-n-click.git
   cd quest-n-click
   ```

<!-- step: node-version -->
2. Use the Node version the repository names (`.nvmrc` says `22`: the newest Node 22 you have):

   ```bash
   # at the root of the clone
   nvm use
   node --version        # v22.12.0 or newer
   ```

<!-- step: npm-ci -->
3. Install the exact dependencies of `package-lock.json`, development tools included (Playwright, Vitest, Biome):

   ```bash
   # at the root of the clone
   npm ci
   ```

<!-- step: python-modules -->
4. Install the pinned Python modules (Pillow, NumPy, SciPy):

   ```bash
   # at the root of the clone
   python3 -m pip install --require-hashes -r requirements.txt
   ```

<!-- step: chromium -->
5. Install the browser the e2e scripts and the Studio's checks drive:

   ```bash
   # at the root of the clone
   npx playwright install chromium
   ```

   `npx playwright install webkit firefox` adds the two optional browsers.

<!-- step: doctor -->
6. Check the machine:

   ```bash
   # at the root of the clone
   npm run doctor
   ```

<!-- step: run-demo -->
7. Run the sample game. The game is chosen by `GAME`, else the game `.cache/game` links to (`npm run game` makes the
   link), else `config.game` in `package.json`, which is `demo`:

   ```bash
   # at the root of the clone
   npm run dev                 # the sample game, games/demo
   GAME=heroes npm run dev     # another game of games/
   ```

<a name="expected-result"></a>

## Expected result, and how to check it

`npm run doctor` ends with `Development, asset and browser-test prerequisites are ready.` (or says which optional
prerequisite is missing, and exits 0 all the same); see [doctor](install.doctor.md). `npm run dev` prints a local URL
that opens the sample game. The checks to run before a change are on [Before a PR](contribute.before-a-pr.md).

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `npm ci` refuses: the lock and `package.json` disagree | A local change to `package.json` | `git checkout package.json package-lock.json`, or `npm install` if you meant the change |
| `✖  Playwright Chromium: browser binary missing` | Step 5 not done | `npx playwright install chromium` |
| `error: externally-managed-environment` from pip | Your system's Python refuses global installs (PEP 668) | Use a virtual environment: `python3 -m venv .venv && . .venv/bin/activate`, then step 4 |
| `✖  games/<id>/index.ts not found (GAME=<id>)` | `GAME` names no folder of `games/` | `ls games` and pick an existing id |

[Install troubleshooting](install.troubleshooting.md) has more.

<a name="files-changed"></a>

## Files or data changed

The clone; `node_modules/`; Playwright's browsers in its cache folder (outside the clone, shared by every project);
the Python modules in your Python environment; `.cache/` in the clone (the game link, the journal of the writing
tools, caches), ignored by git.

<a name="recovery"></a>

## Recovery or going back

Delete the clone. Playwright's browsers stay in its cache until `npx playwright uninstall --all`.

<a name="references"></a>

## References

- [Developer setup](contribute.setup.md), [Dev loop](contribute.dev-loop.md), [Before a PR](contribute.before-a-pr.md)
- [Requirements](install.requirements.md), [doctor](install.doctor.md)
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md), [`tools/select-game.ts`](../../tools/select-game.ts) (how the game is chosen)
