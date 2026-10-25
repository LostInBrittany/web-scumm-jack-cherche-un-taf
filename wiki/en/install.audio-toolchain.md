# Audio toolchain: ffmpeg, fluidsynth, Furnace, uv

`npm run audio` is the engine repository's Mega Drive pipeline: it turns a MIDI (or an audio file) into a Sega Mega
Drive arrangement (YM2612 FM, SN76489 PSG and DAC drums) and synthesises a game's sound effects from the same bank of
sounds, so every track and every blip of a game share one sonic identity. This page installs what it runs on. How to
write a track, the palette and the spec are on [Music](create.music.md) and [Sound effects](create.sound-effects.md).

<a name="what-you-get"></a>

## What you get

A machine where `npm run audio -- setup` has downloaded Furnace and a General MIDI SoundFont, and where the pipeline
renders a spec into `.fur`, `.wav`, `.vgm` and `.mp3` with its QA report. Optionally, a Python 3.11 virtual environment
that transcribes audio sources to MIDI.

<a name="context-and-versions"></a>

## Context and versions

- The **engine repository**. `npm run audio` is a script of its `package.json` (`python3 tools/audio.py`, which runs
  `tools/audio/mdpipe`); `quest-n-click` has no `audio` command for a created project.
- Furnace is pinned to **0.6.8.3** (`FURNACE_VERSION` in `tools/audio/mdpipe/render.py`).
- The pipeline is a tool for authors, not part of the game: a game plays the `.mp3` files it produced.

> [!LIMIT id=audio-repository-only]
> The pipeline is offered in the engine repository only. Its files are inside the engine package
> (`node_modules/@quest-n-click/engine/tools/audio/`), but no command of a created project runs it, and running it from there
> has not been checked.

<a name="prerequisites"></a>

## Prerequisites

| Tool | Used for | Install |
|---|---|---|
| Python 3 with NumPy | every command | `python3 -m pip install --require-hashes -r requirements.txt` ([Requirements](install.requirements.md#python)) |
| ffmpeg | encoding the `.mp3`, loudness | `brew install ffmpeg`, or your system's package |
| fluidsynth | the General MIDI reference render, to compare with the arrangement | `brew install fluid-synth`, or your system's package |
| curl | `setup`'s downloads | usually present |
| Furnace 0.6.8.3 | rendering the arrangement (`.wav`, per-channel `.wav`, `.vgm`) | `npm run audio -- setup` on macOS and Linux (below) |
| `uv` and Python 3.11 | audio sources (a `.wav`, `.mp3`, `.flac` transcribed to MIDI) | optional, step 3 |

<a name="where-to-run"></a>

## Where to run the commands

At the root of the engine repository, on your machine.

<a name="steps"></a>

## Steps

<!-- step: system-tools -->
1. Install ffmpeg and fluidsynth (macOS with Homebrew):

   ```bash
   # anywhere
   brew install ffmpeg fluid-synth
   ```

<!-- step: setup -->
2. Download Furnace and the SoundFont, once per machine:

   ```bash
   # at the root of the engine repository
   npm run audio -- setup
   ```

   On macOS it downloads Furnace's `.dmg` for your processor (arm64 or Intel) from Furnace's GitHub release, copies
   `Furnace.app` and clears its quarantine; on Linux it downloads the x86_64 `.tar.gz`. Both go to
   `tools/audio/.furnace/` (ignored by git). The SoundFont is `GeneralUser-GS.sf2`, downloaded beside it. It prints the
   paths of both at the end.

<!-- step: audio-sources-venv -->
3. Optional, for audio sources (not MIDI): a Python 3.11 virtual environment with the transcription modules
   (`basic-pitch`, NumPy; `demucs` is optional, large, and pulls `torch`):

   ```bash
   # at the root of the engine repository
   uv venv --python 3.11 tools/audio/.venv
   uv pip install --python tools/audio/.venv/bin/python -r tools/audio/requirements-audio.txt
   ```

   `npm run audio` calls `python3`, which does not see this environment. For an audio source, run the pipeline with
   the environment's Python (or activate it first):

   ```bash
   # at the root of the engine repository
   tools/audio/.venv/bin/python tools/audio.py ingest song.wav games/<id>/audio/projects/<slug>
   ```

<!-- step: first-render -->
4. Run the pipeline once:

   ```bash
   # at the root of the engine repository
   npm run audio -- ingest song.mid games/<id>/audio/projects/<slug>   # MIDI (or .wav/.mp3, step 3)
   npm run audio -- all games/<id>/audio/projects/<slug>/spec.json     # .fur + .wav + .vgm + .mp3 + QA report
   npm run audio -- sfx games/<id>/audio/sfx.json                      # the game's sound effects → audio/sfx/*.mp3
   npm run assets                                                      # ships audio/ to public/assets
   ```

<a name="furnace"></a>

## Furnace

### Where the pipeline finds it

In this order: the variable [`FURNACE_BIN`](reference.environment-variables.md#furnace-bin), then
`tools/audio/.furnace/Furnace.app/Contents/MacOS/Furnace`, `tools/audio/.furnace/furnace`, then a `furnace` on your
`PATH`. None found: `Furnace not found: run python -m mdpipe setup or set FURNACE_BIN`.

### On Windows

`setup` does not download Furnace on Windows (Furnace ships a zip there): it stops with
`mdpipe: install Furnace 0.6.8.3 yourself on Windows and put its executable in …/tools/audio/.furnace (the Mega Drive
pipeline downloads it on macOS and Linux only)`. Install that version yourself and put its executable there, or name it
with `FURNACE_BIN`. The rest of the pipeline is unchanged.

### Licence

Furnace is GPL-2.0: it is downloaded on your machine, never bundled with the engine or a game.

### Hardware and Furnace facts (handled in code)

Furnace plays SN76489 tone channels two octaves above the written note; the builder compensates, so specs use real
pitches (keep PSG notes ≥ A2). The DAC has no volume: dynamics are separate samples (`snare` / `ghost`). One note per
channel, four effects per cell, 32nd-note rows at 60 Hz with a groove for the tempo.

<a name="expected-result"></a>

## Expected result, and how to check it

`setup` ends with `Furnace: <path>` and `SoundFont: <path>`. `all` writes the `.fur`, `.wav`, `.vgm` and `.mp3` of the
spec and its QA report in the project's folder. `npm run doctor` says whether ffmpeg is there; it does not check
fluidsynth, Furnace or `uv`.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `Furnace not found: run python -m mdpipe setup or set FURNACE_BIN` | Step 2 not done, or Windows | Step 2, or `FURNACE_BIN=<path to furnace>` |
| `needs fluidsynth (brew install fluid-synth) and python -m mdpipe setup for the SoundFont` | fluidsynth or the SoundFont missing | Steps 1 and 2 |
| `missing "basic_pitch": pip install "basic-pitch[onnx]" (python <= 3.11 recommended)` | An audio source run without the environment of step 3 | Step 3, and run `ingest` with `tools/audio/.venv/bin/python` |
| `ffmpeg` not found | ffmpeg missing from `PATH` | Step 1 |

<a name="files-changed"></a>

## Files or data changed

`tools/audio/.furnace/` (Furnace and the SoundFont) and `tools/audio/.venv/`, both outside git; the project folders
under `games/<id>/audio/projects/`, and `games/<id>/audio/sfx/*.mp3` for the sound effects.

<a name="recovery"></a>

## Recovery or going back

Delete `tools/audio/.furnace/` and `tools/audio/.venv/`; `setup` downloads Furnace again.

<a name="references"></a>

## References

- [Music](create.music.md) (the palette, the spec, the workflow), [Sound effects](create.sound-effects.md)
- [Requirements](install.requirements.md), [Image toolchain](install.image-toolchain.md)
- [`tools/audio/README.md`](../../tools/audio/README.md), [`tools/audio/mdpipe/render.py`](../../tools/audio/mdpipe/render.py),
  [`tools/audio/requirements-audio.txt`](../../tools/audio/requirements-audio.txt)
