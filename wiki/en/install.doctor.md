# doctor: checking your machine

`doctor` reports, one line each, whether the prerequisites of quest'n'click are on this machine, and how to install
what is missing. It never installs anything. It runs in the engine repository as `npm run doctor`, and in a created
project as `npx quest-n-click doctor` (which needs a workaround today: [below](#in-created-project)).

<a name="run"></a>

## Running it

```bash
# in the engine repository
npm run doctor
npm run doctor -- --release
```

```bash
# in a created project (read "In a created project" first)
npx quest-n-click doctor
```

Both run the same file, `tools/doctor.ts`, whose checks live in `tools/doctor-checks.ts`.

<a name="checks"></a>

## What it checks

| Line | Probe | Required | Fix it prints |
|---|---|---|---|
| `Node.js` | the running Node's major version is 22 or more | yes | `Install Node.js 22 or newer.` |
| `Python` | `python3 -c …` prints its version | optional (required with `--release`) | `Install Python 3 to prepare the assets (npm run assets).` |
| `Python image modules` | `python3` imports Pillow, NumPy and SciPy | optional (required with `--release`) | `Run: python3 -m pip install --require-hashes -r requirements.txt` |
| `ffmpeg` | `ffmpeg -version` succeeds | optional (required with `--release`) | `Install ffmpeg to build audio.` |
| `Playwright Chromium` | Playwright's Chromium executable exists | yes | `Run: npx playwright install chromium` |
| `Playwright Firefox` | its executable exists | optional | `Run: npx playwright install firefox` |
| `Playwright WebKit` | its executable exists | optional | `Run: npx playwright install webkit` |
| `Reality Bridge` | Ed25519 in Node's WebCrypto, then Biscuit's WebAssembly loads | only Ed25519 | `Install Node.js 22 or newer.` |

The `Reality Bridge` line fails only when Node's WebCrypto has no Ed25519. When Biscuit does not load, it passes and
says `Biscuit not installed (only a Bridge needs it)`: a game that runs no Bridge never needs it.

The Python fix names `requirements.txt` at the current folder: in a created project the file is
`node_modules/@quest-n-click/engine/requirements.txt`.

<a name="output"></a>

## Output and exit code

Each line starts with `✔` (present), `✖` (missing and required) or `○` (missing and optional, followed by
`(optional)`); a missing one is followed by its fix. The last line is one of:

- `Development, asset and browser-test prerequisites are ready.`
- `Development and browser-test prerequisites are ready; <n> optional one(s) missing (assets, audio or a second browser).`
- `<n> prerequisite(s) missing.`

`doctor` exits 1 when a required prerequisite is missing, 0 otherwise: a machine without Python or WebKit still
develops and plays (since 4.1.6). An example, on the maintainer's Mac on 23 Oct 2026, engine 4.4.0 (paths shortened):

```text
✔  Node.js: 22.14.0
✔  Python: 3.12.7
✔  Python image modules: Pillow 12.3.0, NumPy 2.4.6, SciPy 1.18.1
✔  ffmpeg: ffmpeg version 9.0.2 Copyright (c) 2000-2026 the FFmpeg developers
✔  Playwright Chromium: /Users/…/ms-playwright/chromium-1248/…/Google Chrome for Testing
✔  Playwright Firefox: /Users/…/ms-playwright/firefox-1555/…/firefox
✔  Playwright WebKit: /Users/…/ms-playwright/webkit-2370/pw_run.sh
✔  Reality Bridge: Ed25519 in WebCrypto; Biscuit not installed (only a Bridge needs it)

Development, asset and browser-test prerequisites are ready.
```

That run shows a limit of the probe: Pillow 12.3.0 passes, while `requirements.txt` pins 13.0.0. `doctor` checks
that the modules import, not their versions.

> [!GUARANTEE id=doctor-optional-not-fatal]
> A missing Python, Python module, ffmpeg or WebKit is reported with its fix and does not make `doctor` fail; a
> missing Node 22 or Chromium does. With `--release`, Python, its modules and ffmpeg become required, and WebKit stays
> optional. The test runs the checks with probes it injects, not on a real machine.

<a name="release"></a>
<!-- applies: .. since 4.1.8 -->

## `--release`

`npm run doctor -- --release` requires what `npm run release-check` runs: Python, its modules and ffmpeg. Firefox and
WebKit stay optional (release-check opens no browser; the e2e run in CI on every change); Chromium stays required.
The report ends with `(release mode: every prerequisite of npm run release-check is required)`. `release-check` and
the candidate's `release-check:ci` start with it.

<a name="not-checked"></a>

## What it does not check

- Node's minor version: Node 22.0 to 22.11 pass, though the engine needs 22.12, and 22.13 for the Studio and SQLite
  ([Requirements](install.requirements.md#node)).
- The versions of the Python modules, OpenCV (the talking-mouth tools), fluidsynth, Furnace and `uv` (the audio
  pipeline).
- The network, npm's registry, the release archives.

<a name="in-created-project"></a>

## In a created project

`npx quest-n-click doctor` runs `tools/doctor.ts` from the engine package, and that file imports `playwright` to find
the browsers' executables. The engine package does not depend on Playwright (`scripts/pack.mjs` leaves it out with the
other test tools), so in a fresh project the command stops before printing anything:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'playwright' imported from …/my-game/node_modules/@quest-n-click/engine/tools/doctor.ts
```

Observed on 23 Oct 2026 in a project created from the v4.4.0 archive; the code of `main` is the same. Nothing in a
created project uses Playwright otherwise: `dev`, `assets`, `verify`, `build` and `release` open no browser through
it. Two ways round it, in the created project:

```bash
# in the created project: give doctor the Playwright it imports, as a development dependency
npm install --save-dev playwright@^1.64.1
npx playwright install chromium     # only if doctor then says Chromium is missing
npx quest-n-click doctor
```

The range `^1.64.1` is the engine repository's own (its `package.json` at v4.4.0 and on `main` on 23 Oct 2026). Or check by hand
what a created project needs: `node --version` (22.12 or newer), `python3 -c "import PIL, numpy, scipy"`, and
`ffmpeg -version` if your game has sounds or videos. The step-by-step version is in
[Install troubleshooting](install.troubleshooting.md#doctor-in-created-project).

> [!LIMIT id=doctor-needs-playwright]
> In a created project, `doctor` works only once `playwright` is installed in that project, and it then requires
> Chromium, which a created project never uses.

<a name="since"></a>

## Since

`npm run doctor` exists since 3.0.0. Missing optional prerequisites stopped failing it in 4.1.6, when
`quest-n-click doctor` (then `web-scumm doctor`) joined the package's commands; the `Reality Bridge` line came with
4.1.1, `--release` with 4.1.8.

<a name="related"></a>

## Related identifiers

- `npm run release-check` (runs `doctor -- --release` first), `npx playwright install`
- [Requirements](install.requirements.md), [Install troubleshooting](install.troubleshooting.md)
- The Reality Bridge has its own `doctor`, for its journal (`npx quest-n-click-bridge doctor`): [The Bridge's CLI](bridge.cli.md)
