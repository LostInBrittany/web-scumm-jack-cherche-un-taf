# Credits

## Code
quest'n'click (formerly web-scumm) engine and tools: MIT License, (c) 2026 Wano. Built with Vite, Vitest, Howler, earcut, navmesh, Tweakpane, Playwright, zod.
The Biscuit test vectors under `bridge/test-vectors/biscuit/` come from the Biscuit project (Apache-2.0, their `LICENSE` beside them).
The SSH connector (`@quest-n-click/connectors`, 4.1.9) runs on ssh2 (MIT, Brian White) and its dependencies asn1 (MIT),
bcrypt-pbkdf (BSD-3-Clause), safer-buffer (MIT) and tweetnacl (Unlicense).

## Sample game artwork (games/demo/art)
Backgrounds, characters, objects and interface icons: generated for the project with an image model from written prompts
(see wiki/en/create.images.md), then cut and keyed with the tools in this repository. CC BY 4.0, attribution "Wano".
The four human characters are cartoon caricatures used with the consent of the people they are based on; they are
published under names that are not theirs.

## Music and sound effects (games/demo/audio)
Rendered for the project with the Mega Drive audio pipeline in `tools/audio` (wiki/en/create.music.md), which drives
[Furnace](https://github.com/tildearrow/furnace) (GPL-2.0, downloaded by `npm run audio -- setup`, not bundled).
- Music: the oboe theme of *Swan Lake* (Pyotr Ilyich Tchaikovsky, 1876, public domain), its notes, harmony and
  arrangement written for the project (`audio/projects/swan-theme/compose.py`, then `spec.json`) and rendered for
  YM2612 + SN76489. No third-party transcription: CC BY 4.0, attribution "Wano" (`audio/projects/swan-theme/SOURCE.md`).
  Since 3.7; the earlier theme, arranged from a CC BY-NC transcription, is gone.
- Sound effects: synthesised from `audio/sfx.json` and the shared palette (`tools/audio/palette.json`). CC BY 4.0,
  attribution "Wano".

## Fonts (public/fonts, src/engine/dom/fonts)
- Galmuri11, by Lee Minseo (quiple). SIL Open Font License 1.1 (no Reserved Font Name). The default interface font
  since 4.3.0, shipped as a Latin subset made by `tools/subset-font.py` (`src/engine/dom/fonts/`).
- DotGothic16, by Fontworks. SIL Open Font License 1.1 (no Reserved Font Name). The engine ships it whole
  (`public/fonts/`) and as a Latin subset made by `tools/subset-font.py` (`src/engine/dom/fonts/`).
- Press Start 2P, by CodeMan38. SIL Open Font License 1.1.

## Not affiliated

quest'n'click (formerly web-scumm) is an independent project. "SCUMM-style" describes a kind of game (verbs, a bag, rooms, dialogue with
choices); the project is not affiliated with, endorsed by or derived from LucasArts, Lucasfilm, Disney or the ScummVM
project, and ships none of their code, data or art.

## Jack cherche un taf (games/jack/audio)
Rendered with the same Mega Drive pipeline (`tools/audio`, Furnace not bundled).
- Music: the opening of Bach's *Toccata in D minor* BWV 565 (the manor) and Grieg's *In the Hall of the Mountain King*
  (the ghost train), both public domain and written out for the game, plus three original pieces (the square, the fair,
  the ending jingle). Scores in `games/jack/audio/projects/*/compose.py`, arrangements in `spec.json`.
- Sound effects: 19 recipes copied from the sample game (CC BY 4.0, attribution "Wano") and 9 written for the game
  (`games/jack/audio/sfx.json`). The palette gained one patch, `church_organ`.
