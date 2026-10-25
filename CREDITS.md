# Credits

## Jack cherche un taf
Story, characters, puzzles and texts: Anna and Horacio, with the help of Claude Code. English and Spanish
translations written for the game.

Artwork (`game/art`): generated for the game with an image model from written prompts (`game/prompts.md`,
`game/ART_BRIEF.md`), then cut with the engine's tools and cleaned with `game/art-tools/`.

Music and sound effects (`game/audio`): rendered with quest'n'click's Mega Drive audio pipeline, which drives
[Furnace](https://github.com/tildearrow/furnace) (GPL-2.0, not bundled).
- Music: the opening of Bach's *Toccata in D minor* BWV 565 (the manor) and Grieg's *In the Hall of the Mountain King*
  (the ghost train), both public domain and written out for the game, plus three original pieces (the square, the fair,
  the ending jingle). Scores in `game/audio/projects/*/compose.py`, arrangements in `spec.json`. The manor and the fair
  use one FM patch of our own, `church_organ`, added to the engine's palette by the game's patch (`patches/`).
- Sound effects: 19 recipes copied from the engine's sample game (CC BY 4.0, attribution "Wano") and 9 written for the
  game (`game/audio/sfx.json`).

## Engine
[quest'n'click](https://github.com/Quest-n-Click/quest-n-click) (formerly web-scumm), installed from npm as
`@quest-n-click/engine`: MIT License, (c) 2026 Wano. Its own credits and the licences of what it ships (the fonts
included, under the SIL Open Font License 1.1) are in its package, and every build writes them to `dist/licenses/`.

## Not affiliated
"SCUMM-style" describes a kind of game; this game is not affiliated with, endorsed by or derived from LucasArts,
Lucasfilm, Disney or the ScummVM project.
