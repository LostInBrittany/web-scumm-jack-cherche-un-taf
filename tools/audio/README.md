# tools/audio — Mega Drive music and sound effects

The pipeline behind `npm run audio` (`tools/audio.py` at the repository root runs this package): a MIDI or audio
source becomes a Sega Mega Drive arrangement (YM2612 FM + SN76489 PSG + DAC drums) through a `spec.json` written by
the human or the AI assistant; the sound effects of a game come from `sfx.json` recipes; everything builds from one
`palette.json`. The workflow, the rules (sources you may use, one palette, QA before delivery) and the spec reference
are in `wiki/en/create.music.md`, written for any assistant.

```bash
npm run audio -- setup                                              # Furnace 0.6.8.3 + GM SoundFont → tools/audio/.furnace (once)
npm run audio -- ingest song.mid games/<id>/audio/projects/<slug>
npm run audio -- all games/<id>/audio/projects/<slug>/spec.json     # .fur + .wav + .vgm + .mp3 + QA
npm run audio -- sfx games/<id>/audio/sfx.json                      # audio/sfx/*.mp3
```

- `mdpipe/`: `midi.py` (SMF reader), `analyze.py` (the report), `arrange.py` (spec → patterns), `furwriter.py`
  (Furnace module writer), `render.py` (Furnace, FluidSynth, ffmpeg), `qa.py` (levels, pitch, peak), `sfx.py`
  (effect recipes), `transcribe.py` (audio → MIDI, needs `.venv`), `__main__.py` (the commands).
- `palette.json`: the house sound bank. Add patches, do not edit the ones shipped tracks use.
- Dependencies: Python 3 + numpy, `ffmpeg`, `fluidsynth`; `requirements-audio.txt` in a Python 3.11 venv for audio
  sources. Furnace (GPL-2.0) is downloaded, never bundled.
