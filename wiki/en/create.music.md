# Music in stems

A game names its tracks by id in `audio.music` and plays them with `titleScreen.music`, a room's `music` or the
`music` command. This page says where those files come from: the engine repository's audio pipeline turns a MIDI into
a Sega Mega Drive arrangement, renders it, checks it, and can split it into stems that the game remixes as it is
played. It is also the reference of `audio.scores` and `audio.transitions`.

<a name="what-you-get"></a>

## What you get

A track in `games/<id>/audio/music/`, declared in `audio.music`, that sounds like the rest of the game (same palette as
the sound effects), with a QA report that says `ISSUES: none`; optionally its stems and a score whose mix follows the
game's state.

<a name="context-and-versions"></a>

## Context and versions

- The pipeline (`npm run audio`) runs in the **engine repository** only. A created project has no `audio` command
  (`npx quest-n-click help` lists none): render the track in a clone of the engine repository, then copy the `.mp3`
  (and its stems) into the project's `game/audio/music/`.
- Declaring and playing music (`audio.music`, `audio.scores`, `audio.transitions`) works the same in both.
- Stems and the music director exist since 3.5, transitions between scores since 3.6, music resumed from a save since
  3.6.1. This page is true from 4.2.5 (the `quest-n-click` command name).

<a name="prerequisites"></a>

## Prerequisites

- Python 3 with numpy, `ffmpeg` and `fluidsynth` (`brew install ffmpeg fluid-synth` on macOS). See
  [Audio toolchain](install.audio-toolchain.md).
- Furnace 0.6.8.3, downloaded by `npm run audio -- setup` into `tools/audio/.furnace` (not in the repository). On a
  system `setup` does not cover, install Furnace yourself and point `FURNACE_BIN` at it.
- For an audio source (not a MIDI) only: a Python 3.11 virtual environment for the transcription (step
  [Audio sources](#audio-sources)).

<a name="where-to-run"></a>

## Where to run the commands

At the root of the engine repository, on your machine. `<id>` is the game's folder under `games/`, `<slug>` the
project's name.

<a name="one-palette"></a>

## One pipeline, one sonic identity

`tools/audio` turns a MIDI (or an audio file) into a **Sega Mega Drive** arrangement: YM2612 FM, SN76489 PSG and DAC
drums. It synthesises the sound effects from the same bank of sounds, so every track and every blip of a game share
one identity, the way `npm run prompts` gives every image one style. The decisions are a JSON file (`spec.json`), the
rest is code: an AI assistant or a person follows the same steps.

```bash
npm run audio -- setup                                              # once per machine: Furnace 0.6.8.3 + a GM SoundFont
npm run audio -- ingest song.mid games/<id>/audio/projects/<slug>   # MIDI (or .wav/.mp3: see "Audio sources")
npm run audio -- all games/<id>/audio/projects/<slug>/spec.json     # .fur + .wav + .vgm + .mp3 + QA report
npm run audio -- sfx games/<id>/audio/sfx.json                      # the game's sound effects → audio/sfx/*.mp3
npm run assets                                                      # ships audio/ to public/assets
```

The other subcommands: `analyze <file.mid> [--dump N] [--drums N]`, `transcribe <audio> -o <out.mid> [--bpm N]
[--no-separate]`, `build <spec.json>` (the `.fur` only), `qa <spec.json>` (the report only), `stems <spec.json>
[--out <dir>]`. Sound effects have their own page: [Sound effects](create.sound-effects.md).

<a name="rules"></a>

## The rules

1. **Sources.** A track's source must be yours, in the public domain, or under a licence that allows a derived work
   (a MIDI of a 19th-century piece is fine; a film theme is not). Say where it comes from in `spec.json` (`author`,
   `comment`), in a `SOURCE.md` next to `source.mid`, and in `CREDITS.md`. A transcription has a licence of its own,
   and the arrangement inherits it. The sample game's theme is Tchaikovsky's *Swan Lake* (public domain), its notes
   written out for the project by a script (`games/demo/audio/projects/swan-theme/compose.py` writes `source.mid`):
   no transcription to inherit from, so it is CC BY 4.0 and a game may be sold with it (3.7; the theme before it came
   from a CC BY-NC MIDI). Licences in general: [Licences and credits](contribute.licences.md).
2. **One palette.** [`tools/audio/palette.json`](../../tools/audio/palette.json) holds the FM patches, the PSG
   envelopes, the DAC drum kit and the mix targets. Every project and every sound effect builds from it. A missing
   sound is a new patch in the palette (with a `desc`), never an ad-hoc patch in one spec; a patch that shipped tracks
   rely on is not edited (add one, or bump `version`).
3. **Re-orchestrate, never convert track by track.** Keep the melody, the harmony that matters, the structure and the
   tempo; reduce the polyphony on purpose (merge doublings, drop inner voices, turn held chords into arpeggios).
4. **A build is done when the QA report says `ISSUES: none`.** The report measures levels against the palette's
   targets, pitch accuracy and clipping.
5. **The rendered files are committed** (`audio/music/*.mp3`, `audio/sfx/*.mp3`, the project's `spec.json`,
   `source.mid`, `analysis.md`, `qa.txt`); the heavy intermediates are not (`out/*.wav`, `reference.wav`).

> [!LIMIT id=qa-does-not-listen]
> The QA report measures; it does not listen. A build at `ISSUES: none` can still sound wrong: say so, and tell the
> person what to check by ear (lead and bass balance, the echo level, the stereo split).

<a name="workflow"></a>

## Steps

<!-- step: ingest -->
1. **Ingest.** Copy the source into a new project:

   ```sh
   # in the engine repository
   npm run audio -- ingest song.mid games/<id>/audio/projects/<slug>
   ```

   It copies the MIDI to `source.mid`, writes `analysis.md` and `analysis.json` (tracks, ranges, polyphony, detected
   doublings, a bar-by-bar activity map that shows the sections, tempo and meter changes), a `spec.json` skeleton
   (ten channels with their default roles, and a drum map when a track is drums), and renders `reference.wav` with a
   GM SoundFont for A/B listening.

<!-- step: analyse -->
2. **Analyse.** Read `analysis.md` fully. Decide what is essential (melody, bass, defining riffs, harmonic rhythm)
   and what can go. A build does not handle tempo changes: cut the piece at a tempo change (`bars`), or make one
   project per section. `npm run audio -- analyze source.mid --dump N` lists the notes of track N bar by bar.

<!-- step: arrange -->
3. **Arrange: write `spec.json`.** The default channel plan, to adapt and justify:

   | Channel | Role (`role` = QA target) | Typical content |
   |---|---|---|
   | FM1 | lead | the melody (`lead_brass`, `synth_lead`, `bright_strings`) |
   | FM2 | double, pan L | the melody an octave away on a contrasting patch, detuned (`fx_init: [["E5", "86"]]`) |
   | FM3 | bass | the lowest voice (`slap_bass`, `finger_bass`) |
   | FM4 | harmony | horn / countermelody / chord voice; the patch can change per section |
   | FM5 | counter, pan R | a secondary line, a chord tone |
   | FM6 | drums (DAC) | kick / snare / toms; an FM part where there are no drums |
   | PSG1 | echo | the melody delayed `delay_rows: 4` at vol ~8 |
   | PSG2 | arp | `type: arp` (`00 7C` power arps, `00 37` / `00 47` minor / major) |
   | PSG3 | accent | brass bite +12, a chord tone |
   | NOISE | noise | hats, open hat, crash |

   GM family → palette: brass → `lead_brass`; horn / trombone / tuba → `horn_section`; strings / pads →
   `bright_strings` or `soft_pad`; piano → `e_piano`; mallets / bells → `bell`; organ → `organ`; distorted guitar →
   `power_guitar` (feed it the low octave: it adds the octave and the fifth); clean guitar → `muted_pluck`; bass →
   `slap_bass` (busy) or `finger_bass` (sustained); synth lead → `synth_lead`; orchestra hits → `orch_hit`.

   The fields are in [The spec reference](#spec-reference) below;
   `games/demo/audio/projects/swan-theme/spec.json` is a complete example.

<!-- step: build -->
4. **Build, render, check, iterate.**

   ```sh
   # in the engine repository
   npm run audio -- all games/<id>/audio/projects/<slug>/spec.json
   ```

   It writes `out/<slug>.fur` (editable in Furnace), `.wav`, `.vgm` (emulators, real hardware players), `.mp3`
   (−14 LUFS), `<slug>_patterns.txt` and `qa.txt`. Fix what `ISSUES` lists and build again: a level off target → the
   part's `vol` (FM: one step ≈ 0.75 dB at the top of the range, more lower down; PSG: one step = 2 dB); a low pitch
   match → a wrong `transpose`, two parts overlapping on one channel, or `voice` picking the wrong line;
   `note collision` → two notes on one row.

<!-- step: deliver -->
5. **Deliver.** Copy `out/<slug>.mp3` to `games/<id>/audio/music/<id>.mp3`, declare it in `audio.music`, play it
   (`titleScreen.music`, a room's `music`, a `music` command), then ship it:

   ```sh
   # in the engine repository
   npm run assets
   ```

   Tell the person which channel plays what, which liberties the arrangement took, and what to check by ear.

<a name="spec-reference"></a>

### The spec reference

- Top level: `title`, `author`, `comment`, `slug`, `source`, `bars` (how many bars to build), `rows_per_beat`
  (8 = 32nd-note rows), `pattern_rows` (64), `hz` (60), `extra_bars` (ring-out), `stop_at_end`, `sections`
  `{ name: [first, last] }`, `bpm` (override), `stems` (see [Stems](#stems)).
- `channels.<CH>`: `name`, `role`, `pan` (`L` / `R` / `C`, FM only), `fx_init` `[["E5", "86"]]`,
  `fx` `[["bar:beat", "04", "00"]]`, `parts`.
- A part: `track` (an index, a name fragment, or a list to merge), `voice` (`high` / `low` / `latest` / `rankN`),
  `bars` (`[a, b]`, a section name, or a list of either) or `from` / `to` (`"bar:beat"`), `exclude_bars`, `ins`
  (palette key), `vol` (FM 0–127, PSG 0–15), `weak_vol` (off-beat accent), `accent_long`, `transpose`, `delay_rows`,
  `vibrato` (hex `"34"`, on notes ≥ 1.5 beats), `offs`.
- An arp part: `type: "arp"`, `root_track`, `voice`, `bars`, `every_rows`, `transpose`, `arp` (hex xy), `ins`, `vol`,
  `weak_vol`.
- `drums`: `track`, `dac`, `noise`, `accent: "beat"`, `map` (GM note → `kick` / `snare` / `ghost` / `tom:G3` / `hat` /
  `ohat` / `crash` / `noise_snare`), `hat_fill`, `extra_crash`, `noise_vols`.
- `extras`: single notes for endings and stabs `{ ch, at: "bar:beat", note: "C5", beats, ins, vol }`.

The hardware facts the builder handles for you (Furnace's PSG octave, the DAC without volume) are on
[Audio toolchain](install.audio-toolchain.md#furnace).

<a name="audio-sources"></a>

### Audio sources

A `.wav`, `.mp3`, `.flac` (or `.ogg`, `.m4a`, `.aac`, `.aif`, `.aiff`, `.opus`) is first transcribed to MIDI by
basic-pitch. It needs a Python 3.11 virtual environment, made once:

```sh
# in the engine repository
uv venv --python 3.11 tools/audio/.venv && uv pip install --python tools/audio/.venv/bin/python -r tools/audio/requirements-audio.txt
```

Demucs stem separation is optional and heavy (`transcribe --no-separate` skips it). The result is a draft: keep the
melody, the bass and the chord roots, delete ghost notes, check the tempo (`--bpm`), rewrite the drums as a pattern.
Prefer a MIDI when one exists.

<a name="stems"></a>

## Stems and the music director

A track of `audio.music` can also have a **score**: its stems, played together by the music director, the mix
following the game: it changes with the room, a flag or the active character ([`audio.scores`](#audio-scores)).

```sh
# in the engine repository
npm run audio -- stems games/<id>/audio/projects/<slug>/spec.json
```

It renders the arrangement channel by channel (Furnace's per-channel output) and sums the channels into stems: the
spec's `"stems": { "<name>": ["FM1", "PSG1"], … }`, or, without it, by channel role (melody: lead and echo; harmony:
double, harmony, counter, accent, arp; bass; drums: the DAC and the noise). Every stem comes from the same render, so
all have the same length and start, and their sum is the mix. One gain, the same for every stem, brings the sum to
−14 LUFS: never a per-stem normalisation, the balance is the arrangement's. It writes
`games/<id>/audio/music/<slug>-stems/<stem>.mp3` (or `--out <dir>`) and a `score.json` to paste under `audio.scores`,
by the id of the single mix. The tempo in it is measured from the render (bars × beats over its length); `pcmBytes`
is the stems' decoded weight at 48 kHz.

Group channels by what the game will switch on and off: the sample game's theme has melody, strings, harp and bass,
and plays only the harp and the bass while Biscuit is active. A stem that is nearly silent (a noise channel alone,
−54 LUFS) is a wasted download: fold it into another one.

Stems made by hand are welcome; `npm run validate -- --release` measures them with ffprobe (3.6). Every stem must have
the same rate, channels and number of samples, the loop must end inside them, and `pcmBytes` must be what they decode
to (1 % of slack for an encoder's padding).

> [!GUARANTEE id=stems-consistent]
> The stem check reports stems that would drift apart: a different rate, number of channels or length, each mismatch
> named.

<a name="audio-scores"></a>

### `audio.scores`

```ts
audio: {
  music: { theme: 'swan_theme.mp3' },            // the single mix: Save-Data, low-end devices, no Web Audio
  scores: {
    theme: {
      stems: { melody: 'swan-theme-stems/melody.mp3', strings: 'swan-theme-stems/strings.mp3', harp: 'swan-theme-stems/harp.mp3', bass: 'swan-theme-stems/bass.mp3' },
      bpm: 80, beatsPerBar: 4,                  // from score.json
      states: [                                 // the first that holds sets the mix; none: every stem
        { if: { player: 'biscuit' }, stems: ['harp', 'bass'] },
        { if: { room: 'garden' }, stems: ['strings', 'harp', 'bass'] },
      ],
      // quantize: 'bar' (default) or 'beat'; fadeBeats: 2; loop: [first bar, end bar)
    },
  },
}
```

| Field | Form | Default |
|---|---|---|
| `stems` | stem id → file under `audio/music/` | required |
| `bpm`, `beatsPerBar` | tempo; beats in a bar | `beatsPerBar` 4 |
| `loop` | `[first, end)` in bars, counted from 0 | the whole file |
| `states` | `{ if?, stems }[]`, the first whose condition holds wins (no `if`: always) | every stem |
| `quantize` | where a change of mix lands: `bar` or `beat` | `bar` |
| `fadeBeats` | the crossfade of a change of mix, in beats | 2 |
| `pcmBytes` | the stems decoded, in bytes | none |
| `markers` | named bars, counted from 0, where a transition may land | none |
| `phraseBars` | a phrase's length in bars, for `at: 'phrase'` | 4 |

A state is any condition of the DSL (a flag, the room, the active character; see [Conditions](create.conditions.md)).
A change of state takes effect on the next bar (or beat), crossfaded; another room with the same track keeps the
music going and only changes the mix. `npm run validate` checks the stems, the tempo, the states' stems and
conditions, and that the single mix exists. The Studio's Music tab plays a score and each state's mix
([Studio: music](studio.music.md)).

> [!GUARANTEE id=score-first-state-wins]
> The mix is the first state whose condition holds, in the order written; when none holds, every stem plays.

<a name="transitions"></a>

### `audio.transitions`: from one score to another

From one score to another (3.6), a rule says where the old one lets the new one in, on its own grid:

```ts
audio: {
  scores: { day: { …, markers: { calm: 8 }, phraseBars: 4 }, night: { … } },
  transitions: [
    { from: 'day', to: 'night', at: 'calm', bridge: 'dusk_sting' },  // on bar 8 of "day", then the bridge, then "night"
    { from: '*', to: 'day', at: 'phrase', fadeBeats: 2 },             // on the next phrase, crossfaded over 2 beats
  ],
  maxDecodedMB: 160,                                                  // decoded audio kept (default 160)
}
```

- `at` is `beat`, `bar` (default), `phrase` or a marker of the old score, counted through its loop. A marker the loop
  never reaches again falls back to the next bar.
- `bridge` is a track of `audio.music`, played once between the two; `fadeBeats` defaults to 0 (on the downbeat).
- The first rule naming both scores (or `*`) applies: `validate` refuses a rule an earlier one covers, and a marker
  from `'*'` that a score it can leave lacks.
- Without a rule, a score replaces another at once, faded, as in 3.5.
- A save keeps where the music is; loading it resumes there, cut, never through a transition (3.6.1).
- `maxDecodedMB` (default 160): past it, the director lets go of the scores played least recently, and a score larger
  on its own plays as its single mix.

> [!LIMIT id=not-imuse]
> This is an adaptive stem mixer with transitions, not iMUSE: no tempo changes and no branches inside a score. The
> single mix (no director) ignores transitions.

<a name="who-hears-stems"></a>

### Who hears the stems, who hears the single mix

The single mix in `audio.music` always stays: the director plays the stems only where they fit
([`src/engine/dom/director.ts`](../../src/engine/dom/director.ts), `directorFits`):

- no Web Audio (`AudioContext`): the single mix;
- the browser asks to save data (Save-Data): the single mix;
- a low-end device (2 GB of memory or less, or 2 cores or less): the single mix;
- a browser that does not tell its memory (Safari, iOS included): the stems only when every score declares
  `pcmBytes` and the largest is at most 128 MB, otherwise the single mix.

No music at all plays before the player's first tap, click or key press: browsers refuse sound before a gesture. A
track asked for earlier starts at that first gesture.

<a name="tools"></a>

## In the Studio and the tools

The Studio's Assets tab lists the music and sound ids a game declares and whether a file exists for each;
`npm run assets` ships what is there and reports what is missing. The Music tab is described on
[Studio: music](studio.music.md). The MCP `read_doc` tool served the old page of this subject as `AUDIO`.

<a name="sound-design"></a>

## A loop per room

A loop per room, set with `music` on the room: short and quiet, since the player hears it for fifteen minutes. The
sample game has none yet and says so in `game.ts`: silence is better than a bad loop. The rest of the sound design
(an effect on every change of state, the hint voice) is on [Puzzle design](create.puzzle-design.md#sound).

<a name="expected-result"></a>

## Expected result, and how to check it

- `qa.txt` in `games/<id>/audio/projects/<slug>/out/` ends with `ISSUES: none`.
- `npm run assets` reports no missing `music:` file; `npm run validate` reports no `audio.scores` error.
- In the game, the track plays after your first tap; with a score, the mix changes on the next bar when the state
  changes.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| "Furnace not found: run \`python -m mdpipe setup\` or set FURNACE_BIN" | Furnace not installed | `npm run audio -- setup`, or `FURNACE_BIN=<path>` |
| `unsupported source type .xyz` | `ingest` takes a MIDI or an audio file only | Convert the source to MIDI or WAV |
| `ISSUES` lists a level off target | A part's `vol` | Change `vol` (FM ≈ 0.75 dB a step at the top, PSG 2 dB) |
| `note collision` | Two notes on one row of one channel | Split the parts, or change `voice` |
| `audio.scores.<id>.stems.<s> › "<file>" is missing or not readable audio` (`validate --release`) | A stem file missing or broken | Render the stems again, or fix the path |
| The music never starts | No gesture yet, or music off in the pause menu | Tap the screen; check the Music setting |

<a name="files-changed"></a>

## Files or data changed

`games/<id>/audio/projects/<slug>/` (`source.mid`, `analysis.md`, `analysis.json`, `spec.json`, `out/`, `qa.txt`),
`games/<id>/audio/music/` (the `.mp3`, the `<slug>-stems/` folder), `game.ts` (`audio`), and `public/assets/audio/`
with `games/<id>/assets.gen.json` after `npm run assets`. Commit the rendered `.mp3`, `spec.json`, `source.mid`,
`analysis.md` and `qa.txt`; not `out/*.wav` nor `reference.wav`.

<a name="recovery"></a>

## Recovery or going back

A build overwrites `out/` only; the previous track stays in `audio/music/` until you copy the new one over it. Git
holds the committed versions: `git checkout -- games/<id>/audio/music/<file>.mp3` brings one back.

<a name="references"></a>

## References

- [`tools/audio/mdpipe/__main__.py`](../../tools/audio/mdpipe/__main__.py), [`tools/audio/mdpipe/stems.py`](../../tools/audio/mdpipe/stems.py), [`tools/audio/palette.json`](../../tools/audio/palette.json)
- [`src/engine/core/types/audio.ts`](../../src/engine/core/types/audio.ts), [`src/engine/core/score.ts`](../../src/engine/core/score.ts), [`src/engine/tools/stems.ts`](../../src/engine/tools/stems.ts)
- [Sound effects](create.sound-effects.md), [Voices](create.voices.md), [Audio toolchain](install.audio-toolchain.md)
