# Install troubleshooting

What goes wrong while installing the engine, creating a project or checking a machine, from what you see to the fix.
Each section says where it happens: in a **created project** or in the **engine repository**.

<a name="doctor-in-created-project"></a>

## `doctor` fails in a created project

**Symptom.** In a created project, `npx quest-n-click doctor` prints no report and stops with:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'playwright' imported from …/node_modules/@quest-n-click/engine/tools/doctor.ts
```

**Cause.** `doctor` imports Playwright to locate the browsers. The engine package leaves Playwright out of its
dependencies (`scripts/pack.mjs`: tests and Playwright stay out), so a created project never has it. Observed on
23 Oct 2026 with a project created from the v4.4.0 archive; `main` has the same code. Your project is not broken:
nothing else in it uses Playwright.

**Fix.** Either give `doctor` what it imports, or check the prerequisites by hand.

<!-- step: install-playwright -->
1. In the created project, install Playwright as a development dependency, at the engine repository's range:

   ```bash
   # in the created project
   npm install --save-dev playwright@^1.64.1
   ```

<!-- step: install-chromium -->
2. `doctor` requires Chromium, though a created project never opens it. If it says `✖  Playwright Chromium: browser
   binary missing`, install it:

   ```bash
   # in the created project
   npx playwright install chromium
   ```

<!-- step: run-doctor -->
3. Run `doctor` again:

   ```bash
   # in the created project
   npx quest-n-click doctor
   ```

   It ends with `Development, asset and browser-test prerequisites are ready.`, or names what is missing.

<!-- step: check-by-hand -->
4. Or, instead of steps 1 to 3, check by hand what a created project needs:

   ```bash
   # in the created project
   node --version                               # v22.12.0 or newer (22.13 for the local Studio)
   python3 -c "import PIL, numpy, scipy"        # no output: the art tools will run
   ffmpeg -version                              # only if the game has sounds or videos
   ```

> [!LIMIT id=doctor-created-project-workaround]
> The workaround adds Playwright, and a browser if `doctor` asks for one, to a project that does not otherwise use
> them. Remove them afterwards with `npm uninstall playwright` and `npx playwright uninstall --all` if you prefer.

<a name="npm-404"></a>

## `npm install` answers 404

**Symptom.** `npm error 404 Not Found - GET https://registry.npmjs.org/quest-n-click - Not found`, at `npm install` in
a created project, or at `npm init @quest-n-click`.

**Cause.** The engine is not on npm (checked on 23 Oct 2026). A project created without `--engine=<archive URL>`
depends on `^<version>`, which npm looks up in the registry.

**Fix.** In the created project, install the archive: `npm install
https://github.com/Quest-n-Click/quest-n-click/releases/download/v<version>/quest-n-click-<version>.tgz`. For a new project,
pass `--engine=$T`: [Install from the release archive](install.from-archive.md).

<a name="node-version"></a>

## Node is too old

**Symptom.** `npm warn EBADENGINE Unsupported engine` at install, then errors from Vite or the tools; or, from 4.2.1,
the local Studio or a writing tool (`ids`, `i18n`, `voices`, `import-layout`, `provenance`) stops on `node:sqlite`.

**Cause.** The engine needs Node 22.12; the Studio and the writing tools need 22.13, where `node:sqlite` is available
without a flag. `doctor` does not catch this: it checks only the major version.

**Fix.** Install Node 22.13 or newer (`nvm install 22`), then `node --version`.

<a name="python-modules"></a>

## The art tools cannot import Pillow, NumPy or SciPy

**Symptom.** `npm run assets` or `tools/cut-sheet.py` stops on `ModuleNotFoundError: No module named 'PIL'` (or
`numpy`, `scipy`); `doctor` says `○  Python image modules: Pillow, NumPy and/or SciPy missing (optional)`.

**Cause.** The modules are not installed for the `python3` the tools run.

**Fix.** In the engine repository, `python3 -m pip install --require-hashes -r requirements.txt`; in a created project,
`python3 -m pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt`. If pip answers
`error: externally-managed-environment` (a system Python, PEP 668), create a virtual environment first
(`python3 -m venv .venv && . .venv/bin/activate`); in a created project, `PYTHON=.venv/bin/python npm run assets` then
uses it.

<a name="chromium-missing"></a>

## `doctor` says Chromium is missing

**Symptom.** `✖  Playwright Chromium: browser binary missing`, then `1 prerequisite missing.`, exit code 1.

**Cause.** In the engine repository, `npx playwright install chromium` was not run (or ran for another Playwright
version, after a dependency update).

**Fix.** In the engine repository, `npx playwright install chromium`. A missing Firefox or WebKit is optional (`○`)
and does not fail `doctor`.

<a name="ffmpeg-missing"></a>

## No sound in the prepared assets

**Symptom.** `doctor` shows `○  ffmpeg: not found (optional)`; `npm run assets` stops when it reaches a sound or a
video.

**Cause.** `assets` converts music, sound effects and videos with ffmpeg.

**Fix.** Install ffmpeg (`brew install ffmpeg`, or your system's package). `npm run doctor -- --release` requires it.

<a name="create-not-empty"></a>

## `create` refuses the folder

**Symptom.** `my-game exists and is not empty`.

**Cause.** `create` never writes into a folder that holds files.

**Fix.** Give another folder name, or empty that one.

<a name="former-name"></a>

## An import of `web-scumm/…` no longer resolves

**Symptom.** After installing 4.3.0 or later, the game does not build: an import of `web-scumm/content` (or another
`web-scumm/…`) is not found; `npx web-scumm` is not a command.

**Cause.** The former name's aliases were removed in 4.3.0.

**Fix.** In the created project, `npx quest-n-click migrate`, then `npm install`:
[Coming from web-scumm](install.from-web-scumm.md).

<a name="furnace-windows"></a>

## `npm run audio -- setup` stops on Windows

**Symptom.** `mdpipe: install Furnace 0.6.8.3 yourself on Windows and put its executable in …`.

**Cause.** The pipeline downloads Furnace on macOS and Linux only.

**Fix.** Install Furnace 0.6.8.3 yourself, then put its executable in `tools/audio/.furnace/` or name it with
`FURNACE_BIN`: [Audio toolchain](install.audio-toolchain.md#furnace).

<a name="neighbours"></a>

## Neighbouring cases

- The Reality Bridge has its own `doctor` (`npx quest-n-click-bridge doctor`), about its journal and store, not about
  your machine: [Bridge and connector troubleshooting](bridge.troubleshooting.md).
- A game that installs but does not play as expected: [Player troubleshooting](play.troubleshooting.md).
- A deployment that fails: [Deployment issues](create.deploy-issues.md); a hosted Studio:
  [Clever troubleshooting](clever.troubleshooting.md).
