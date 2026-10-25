# Requirements

What a machine needs to make a game with quest'n'click, or to work on the engine. Two contexts recur on this page: a
**created project** (a game made with `quest-n-click create`, the engine installed under `node_modules/@quest-n-click/engine`)
and the **engine repository** (a clone of `Quest-n-Click/quest-n-click`). Only Node.js is needed for everything; the rest
depends on what you do.

| Tool | Needed for | Created project | Engine repository |
|---|---|---|---|
| Node.js 22.12 or newer | everything | required | required |
| Node.js 22.13 or newer | the local Studio, the tools that write a game, a Bridge on SQLite | when you use them | when you use them |
| Python 3 and `requirements.txt` | `npm run assets` (the art), the image tools | required to prepare art | required for `assets` and the asset tests |
| ffmpeg | sounds and videos in `assets`, the audio pipeline | optional | optional (required by `doctor -- --release`) |
| Playwright Chromium | browser tests, the Studio's checks, `doctor` | not used, but `doctor` needs Playwright (see below) | required |
| Playwright WebKit, Firefox | the second browsers of the e2e | not used | optional |
| fluidsynth, Furnace, `uv` | the Mega Drive audio pipeline | not offered | optional |

`doctor` checks most of this for you: [doctor: checking your machine](install.doctor.md).

<a name="node"></a>

## Node.js

### Version

**22.12 or newer.** The engine's `package.json` says `"engines": { "node": ">=22.12" }`, and the `@quest-n-click/engine`
package carries the same field: Vite 8 and Vitest 5 need it (4.1.8). The repository's `.nvmrc` says `22`, so
`nvm use` takes the newest 22 you have installed.

### Node 22.13 for the Studio, the writing tools and SQLite

From 4.2.1, the local Studio and the tools that write a game (`ids`, `i18n`, `voices`, `import-layout`, `provenance`,
the Studio's own edits) write through a journal kept under `.cache/studio-journal/` in SQLite, through `node:sqlite`,
which needs **Node 22.13 or newer**. A Reality Bridge on its `local` profile (SQLite) needs it too. Playing and
building a game still run on 22.12.

### Checked by

CI runs Node 22 and 24 on Ubuntu, and installs the release archives on Ubuntu, macOS and Windows with Node 22 (and
Ubuntu with Node 24), in the candidate's `external-consumer` job.

> [!LIMIT id=doctor-node-major]
> `doctor` only checks that Node's major version is 22 or more: it passes Node 22.0 to 22.11, which the engine does not
> support. Read `node --version` yourself. npm prints an `EBADENGINE` warning, not an error, when you install the
> engine on an older Node.

<a name="python"></a>

## Python 3 and its modules

### Needed for

`npm run assets` (`tools/assets.py`) prepares the images a game names, and the image tools (`tools/cut-sheet.py`, the
talking-mouth tools) cut and fix sheets: both are Python. Without Python, a game still plays with assets already
prepared, and `doctor` calls Python optional.

### Version

`requirements.txt` pins the modules: Pillow 13.0.0, NumPy 2.5.4, SciPy 1.18.1 (Pillow moved to 13.0.0 in 4.3.0),
each with the sha256 of every file PyPI publishes for it, so pip checks what it downloads (since 4.5.2). CI uses
Python 3.12. No other Python version is checked.

### Install

```sh
# in the engine repository
python3 -m pip install --require-hashes -r requirements.txt
```

```sh
# in a created project: the file comes with the engine package
python3 -m pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt
```

In a created project, `npx quest-n-click assets` runs `python3`, or the interpreter the variable
[`PYTHON`](reference.environment-variables.md#python) names (a virtual environment's, for instance). In the engine
repository, `npm run assets` always calls `python3`.

> [!LIMIT id=opencv-not-pinned]
> The talking-mouth tools (`tools/talk-apply.py`, `tools/talk-normalize.py`) also import OpenCV (`cv2`), which
> `requirements.txt` does not list and `doctor` does not check. Install it yourself if you use them.

The image tools are on [Image toolchain](install.image-toolchain.md).

<a name="ffmpeg"></a>

## ffmpeg

### Needed for

`assets` converts music, sound effects and videos with ffmpeg; the audio pipeline (`npm run audio`) renders and encodes
with it. A game without sounds or videos to convert never calls it. `doctor` calls it optional;
`npm run doctor -- --release` (the engine repository's release check) requires it.

### Install

Any recent build on your `PATH`: `brew install ffmpeg` on macOS, your distribution's package on Linux. CI installs it
with `scripts/ci-ffmpeg.sh`.

<a name="playwright"></a>

## Playwright browsers

### Needed for

In the engine repository, the e2e scripts and the Studio's checks drive Chromium through Playwright, a development
dependency. `doctor` requires Chromium there, and calls Firefox and WebKit optional.

```sh
# in the engine repository, after npm ci
npx playwright install chromium
```

### In a created project

No command of `quest-n-click` opens a browser through Playwright, and the engine package does not depend on it. Only
`doctor` imports it, so `npx quest-n-click doctor` stops on a missing `playwright` module in a fresh project:
[Install troubleshooting](install.troubleshooting.md#doctor-in-created-project) gives the workaround.

<a name="audio-tools"></a>

## Audio pipeline tools

fluidsynth, Furnace 0.6.8.3 (downloaded by `npm run audio -- setup` on macOS and Linux) and, for audio sources, `uv`
with a Python 3.11 virtual environment. They serve the engine repository's `npm run audio` only:
[Audio toolchain](install.audio-toolchain.md).

<a name="systems"></a>

## Windows, macOS, Linux

- **Linux and macOS**: every command of these pages runs as written. The maintainer works on macOS; CI runs on Ubuntu.
- **Windows**: CI runs a `windows-latest` job (since 4.1.8): `doctor`, the type checks, the unit suite except six test
  files that assume POSIX (file modes, `/` in paths; named in `ci.yml`), without the Telnet and SSH tests and the
  Studio Server's worker, then `build` and the production server answering. Each release candidate installs the archives on Windows, creates and builds a game,
  and plays it to its ending through `@quest-n-click/engine/testing` (no browser). Nobody has
  checked `npm run dev` and the Studio on Windows yet. Run the shell blocks of these pages in Git Bash, the shell CI
  uses there.
- The audio pipeline does not download Furnace on Windows: install it yourself
  ([Audio toolchain](install.audio-toolchain.md#furnace)).
- A hosted Studio's processing worker and its previews run on Linux only.

The support matrix, with what people have and have not checked, is [Support matrix](reference.support-matrix.md).

<a name="related"></a>

## Related

- [doctor: checking your machine](install.doctor.md)
- [Install from the release archive](install.from-archive.md)
- [Install from the repository to work on the engine](install.from-repository.md)
- [Environment variables](reference.environment-variables.md): `PYTHON`, `FURNACE_BIN`
