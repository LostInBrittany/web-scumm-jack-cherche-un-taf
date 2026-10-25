# Sound effects

A game names its sounds by id in `audio.sfx` and plays them with the `sfx` command (`{ sfx: 'door_open' }`). This page
is the reference of the recipes that synthesise them from the shared Mega Drive palette (`sfx.json`), of how
`npm run assets` ships them, and of captions for players who cannot hear them.

<a name="rules"></a>

## The rules

The sound effects follow the rules of the music ([Music in stems](create.music.md#rules)), the ones that concern them:

- **One palette.** Every effect builds from [`tools/audio/palette.json`](../../tools/audio/palette.json), the same
  FM patches, PSG envelopes and noise as the music, so a door and the theme sound like one game. A missing sound is a
  new patch in the palette (with a `desc`), never an ad-hoc patch; a patch shipped sounds rely on is not edited (add
  one, or bump `version`).
- **The rendered files are committed**: `audio/sfx/*.mp3` and `sfx.json`. The build folder (`.sfx-build`) is removed
  after each run.
- **Sources.** An effect you did not synthesise (a recording, a sound bank) must be yours, in the public domain, or
  under a licence that allows a derived work; say where it comes from in `CREDITS.md` and in the game's provenance
  ([Asset provenance](create.asset-provenance.md)).

<a name="recipes"></a>

## `sfx.json`: one recipe per effect

`games/<id>/audio/sfx.json` holds one recipe per effect id of `audio.sfx`. In the engine repository, at its root:

```sh
# in the engine repository
npm run audio -- sfx games/<id>/audio/sfx.json
```

renders them to `games/<id>/audio/sfx/<id>.mp3`: the trailing silence trimmed, the peak normalised, a 10 ms fade at
the end. `--only door_open latch` renders some of them; `--out <dir>` writes elsewhere. A created project has no
`audio` command: render the effects in a clone of the engine repository and copy the `.mp3` files into the project's
`game/audio/sfx/`.

A recipe is a few rows of one or more channels at 60 rows per second, with the palette's instruments:

```json
"door_open": { "desc": "a latch, then a wooden creak", "rows": 40, "tracks": [
  { "ch": "NOISE", "ins": "noise_hat", "events": [{ "row": 0, "note": "C6", "vol": 12 }] },
  { "ch": "FM1", "ins": "muted_pluck", "events": [{ "row": 3, "note": "D2", "vol": 118, "fx": [["01", "03"]] }, { "row": 28, "off": true }] }
] }
```

The recipes sit under `"sfx"` in the file, beside `"rate"` (rows per second, default 60) and an optional `"palette"`
(a palette file relative to `sfx.json`; default the shared one).

| Field | Form | Default |
|---|---|---|
| `desc` | what the sound is, in words | none |
| `rows` | the length in rows (the trailing silence is trimmed anyway) | 32 |
| `tracks[].ch` | a channel: `FM1`…`FM6`, `PSG1`…`PSG3`, `NOISE` | required |
| `tracks[].ins` | a palette instrument, for the whole track | none |
| `events[].row` | the row the event falls on | required |
| `events[].note` | a note name (`C6`) or a MIDI number | none |
| `events[].ins` | an instrument for this event only | the track's |
| `events[].vol` (or `tracks[].vol`) | FM 0–127, PSG 0–15 | the instrument's |
| `events[].fx` | hex pairs: `01` / `02` pitch slide up / down, `00xy` arpeggio, `04xy` vibrato, `0Axy` volume slide, `EDxx` delay | none |
| `events[].off` | a note off | none |
| `gain` | the peak after normalisation | 0.9 |

The render stops on a recipe it cannot play, naming it: `<id>: unknown channel <ch>`, `<id>: <ch> row <r> needs an
instrument`, `<id>: event at row <r> beyond length <rows>`, `<id>: <ch> row <r>: more than 4 effects`.

<a name="vocabulary"></a>

## The sample game's vocabulary

The sample game's [`sfx.json`](../../games/demo/audio/sfx.json) covers the usual vocabulary of an adventure game:
`click`, `select`, `success`, `error`, `door_open`, `door_close`, `latch`, `coins`, `cloth`, `paper`, `ring`, `drop`,
`bell`, `glass`, `metal`, `shuffle`, `chips`, `pluck`, `bong`. Copy it into a new game and keep the ids: the sample
games' content uses them, so rules you copy from them keep their sound.

The engine itself plays no sound by a fixed id. The sounds it plays on its own are the ones the game names in
`skin.sounds` (`phone`, `plane`, `confetti`, `jingle`, `end`; see [Skin and fonts](create.skin-fonts.md)), and a
minigame plays the ids its parameters name.

<a name="captions"></a>

## Captions

A sound that matters gets a caption, shown in writing for whoever cannot hear it, and translated like any line:

```ts
{ sfx: 'door_slam', caption: '[A door slams upstairs]' }
```

The captions setting is on by default, and the Settings menu offers it only in a game that captions some sound.

<a name="shipping"></a>

## How `npm run assets` ships them

`npm run assets` (in the engine repository, or in a created project) prepares every sound the content cites:

| What | Default source | Output | Encoding |
|---|---|---|---|
| music | `games/<id>/audio/music/<file>` | `public/assets/audio/music/<file>` | 96 kb/s, stereo |
| sound effects | `games/<id>/audio/sfx/<file>` | `public/assets/audio/sfx/<file>` | 128 kb/s, mono |
| voices | `games/<id>/audio/voice/<file>` | `public/assets/audio/voices/<file>` | 64 kb/s, mono |

In a created project the folder is `game/` instead of `games/<id>/`. Only what changed is encoded again.

`games/<id>/sources.json` replaces these patterns (`{file}` is the file named in `audio`):

- a pattern can be a list of candidates tried in order, and set its own bitrate:
  `"sfx": ["private/audio/sfx/{file}", { "path": "private/audio/{file}", "rate": "64k" }]`;
- a requested `.mp3` can come from an `.ogg` of the same name;
- a sound with no source but already present in `public/assets` is kept as it is;
- a sound with neither is reported missing (`sfx:<id>=<file>`) and the game plays silence in its place.

The image side of `sources.json` (patterns, `overrides`) is on [Images](create.images.md#pipeline).

<a name="related"></a>

## Related identifiers

- `audio.sfx`, the `sfx` command and its `caption`, `skin.sounds`.
- `npm run audio -- sfx`, `npm run assets`, `games/<id>/sources.json`.
- [Music in stems](create.music.md), [Voices](create.voices.md), [Audio toolchain](install.audio-toolchain.md).
