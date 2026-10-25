# Licences and credits

What licence covers each part of quest'n'click, who made what, and where a sound or an image may come from. The files
of the repository are the legal texts: [`LICENSE`](../../LICENSE) (the code), [`LICENSE-ASSETS`](../../LICENSE-ASSETS)
(the sample game's art and audio) and [`CREDITS.md`](../../CREDITS.md); this page summarises them in both languages.

<a name="licences"></a>

## Licences

| Part | Licence | Where |
|---|---|---|
| The engine's source code and tools | MIT License, Copyright (c) 2026 Wano | `LICENSE` |
| The sample game's artwork (everything under `games/demo/art`) | Creative Commons Attribution 4.0 International (CC BY 4.0) | `LICENSE-ASSETS` |
| The generated sound effects (`games/demo/audio/sfx`) | CC BY 4.0 | `LICENSE-ASSETS` |
| The theme (`games/demo/audio/projects/swan-theme`, its renders under `games/demo/audio/music`) | CC BY 4.0 | `LICENSE-ASSETS` |
| The fonts under `public/fonts` and `src/engine/dom/fonts` | SIL Open Font License 1.1 | `src/engine/dom/fonts/OFL.txt`; `licenses/THIRD_PARTY_NOTICES.txt` in a build |

The attribution the CC BY 4.0 assets ask for is: "Artwork by Wano, from the quest'n'click project, formerly web-scumm
(https://github.com/Quest-n-Click/quest-n-click)". In short, as the README says: code MIT; sample artwork, sound effects and
theme CC BY 4.0 (attribution "Wano"); the theme is Tchaikovsky's *Swan Lake* (public domain), written out and
arranged for the project; fonts SIL OFL.

Every asset of the sample game is CC BY 4.0 since 3.7; `npm run verify:commercial` checks that a game's assets can be
shipped commercially ([Asset provenance](create.asset-provenance.md)).

<a name="credits"></a>

## Credits

### Code

quest'n'click (formerly web-scumm) engine and tools: MIT License, (c) 2026 Wano. Built with Vite, Vitest, Howler,
earcut, navmesh, Tweakpane, Playwright and zod.

- The Biscuit test vectors under `bridge/test-vectors/biscuit/` come from the Biscuit project (Apache-2.0, their
  `LICENSE` beside them).
- The SSH connector (`@quest-n-click/connectors`, 4.1.9) runs on ssh2 (MIT, Brian White) and its dependencies asn1
  (MIT), bcrypt-pbkdf (BSD-3-Clause), safer-buffer (MIT) and tweetnacl (Unlicense).

### Sample game artwork (`games/demo/art`)

Backgrounds, characters, objects and interface icons: generated for the project with an image model from written
prompts ([Images](create.images.md)), then cut and keyed with the tools in this repository. CC BY 4.0, attribution
"Wano". The four human characters are cartoon caricatures used with the consent of the people they are based on; they
are published under names that are not theirs.

### Music and sound effects (`games/demo/audio`)

Rendered for the project with the Mega Drive audio pipeline in `tools/audio` ([Music](create.music.md)), which drives
[Furnace](https://github.com/tildearrow/furnace) (GPL-2.0, downloaded by `npm run audio -- setup`, not bundled).

- **Music**: the oboe theme of *Swan Lake* (Pyotr Ilyich Tchaikovsky, 1876, public domain), its notes, harmony and
  arrangement written for the project (`audio/projects/swan-theme/compose.py`, then `spec.json`) and rendered for
  YM2612 + SN76489. No third-party transcription: CC BY 4.0, attribution "Wano"
  (`audio/projects/swan-theme/SOURCE.md`). Since 3.7; the earlier theme, arranged from a CC BY-NC transcription, is
  gone.
- **Sound effects**: synthesised from `audio/sfx.json` and the shared palette (`tools/audio/palette.json`). CC BY 4.0,
  attribution "Wano".

### Fonts (`public/fonts`, `src/engine/dom/fonts`)

- **Galmuri11**, by Lee Minseo (quiple). SIL Open Font License 1.1 (no Reserved Font Name). The default interface font
  since 4.3.0, shipped as a Latin subset made by `tools/subset-font.py` (`src/engine/dom/fonts/`).
- **DotGothic16**, by Fontworks. SIL Open Font License 1.1 (no Reserved Font Name). The engine ships it whole
  (`public/fonts/`) and as a Latin subset made by `tools/subset-font.py` (`src/engine/dom/fonts/`).
- **Press Start 2P**, by CodeMan38. SIL Open Font License 1.1.

<a name="audio-sources"></a>

## Where a sound may come from

A track is an arrangement of a source you may use: yours, or one in the public domain. Never drop a sound file of
unknown origin into `audio/`.

A `.wav`, `.mp3` or `.flac` source is first transcribed to MIDI by basic-pitch (the audio `.venv` is required; demucs
stems are optional and heavy). The result is a draft: keep the melody, the bass and the chord roots, delete ghost
notes, check the tempo (`--bpm`), rewrite the drums as a pattern. Prefer a MIDI when one exists. The whole workflow is
[Music](create.music.md#audio-sources); the toolchain is [Audio toolchain](install.audio-toolchain.md).

> [!LIMIT id=transcription-licence]
> A transcription carries the licence of what it transcribes: the tools do not make a source you may not use
> shippable. The sample game's earlier theme was arranged from a CC BY-NC transcription; since 3.7 the theme is written
> from the public-domain score without any third-party transcription, which is what lets it be CC BY 4.0.

<a name="not-affiliated"></a>

## Not affiliated

quest'n'click (formerly web-scumm) is an independent project. "SCUMM-style" describes a kind of game (verbs, a bag,
rooms, dialogue with choices); the project is not affiliated with, endorsed by or derived from LucasArts, Lucasfilm,
Disney or the ScummVM project, and ships none of their code, data or art.

<a name="related"></a>

## Related identifiers

- `npm run verify:commercial`, `npm run audio`, `npm run provenance`.
- [Security policy](contribute.security-policy.md#licensing), [Asset provenance](create.asset-provenance.md).
