---
name: megadrive-audio
description: Make a game's music and sound effects with the Mega Drive audio pipeline (npm run audio): a MIDI or audio source becomes a YM2612 + SN76489 arrangement written as spec.json, the effects are sfx.json recipes, all on the shared palette. Use when the human asks for a Mega Drive / Genesis / 16-bit version of a track, for a game's theme, or for sound effects.
---
# Mega Drive audio

The whole workflow, the rules and the spec reference are in `wiki/en/create.music.md` (vendor-neutral: read it first, it is
the only source of truth). In short:

1. Check the source may be used (yours, public domain, or a licence that allows derived works) and say where it
   comes from. Never a film or game theme under copyright.
2. `npm run audio -- ingest <source> games/<id>/audio/projects/<slug>`, read `analysis.md` fully, report tempo, meter,
   bars, the tracks' roles, the doublings, the sections.
3. Write `spec.json`: re-orchestrate (never one MIDI track per channel), keep the melody, the bass and the structure,
   use the palette's patches, the default channel roles, PSG echo and arps.
4. `npm run audio -- all …/spec.json` until `qa.txt` says `ISSUES: none`; read `<slug>_patterns.txt` for the key bars.
5. Copy the MP3 to `games/<id>/audio/music/`, declare it in `audio.music`, play it, `npm run assets`, update
   `CREDITS.md`. Say what you could not check by ear.

Sound effects: one recipe per id in `games/<id>/audio/sfx.json` (copy the sample game's as a start), then
`npm run audio -- sfx games/<id>/audio/sfx.json`.
