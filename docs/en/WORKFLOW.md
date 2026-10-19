# Making a game with an AI assistant: the workflow

This is the method that produced the first game built with this engine (a 9-room, 15-character family adventure, written
and shipped in a single day by one person working with Claude Code). Each step has a tool in this repository, and
each step ends with something the author can validate on a phone before the next one starts.

## 1. Story first, as data
Write the story as a **storyboard**: boards (one per room), panels (one per beat), lines (who says what), the player
action that triggers each beat, the sounds, and the hints the helper voice gives when the player is stuck.
File: `games/<id>/storyboard.json`. Skill: `/storyboard`. The storyboard is the source of truth for every text in the game;
the code is derived from it, never the other way round.
Before writing, read [DESIGN.md](DESIGN.md): what makes a good room, puzzle, hint chain and fallback in this engine.

## 2. Validate the storyboard on a page
`npm run page:storyboard` renders the storyboard as an illustrated HTML page, with every panel composed from the real
backgrounds and sprites (once they exist), the lines, playable sounds, and a notes box under each panel.
Publish it as a claude.ai artifact: the author annotates from a phone, the AI reads the notes back (`ArtifactData`) and
rewrites the storyboard. Iterate until the author says "v final".

## 3. Generate the art
`docs/en/PROMPTS.md` holds the prompts that produce consistent sheets: backgrounds (1536 × 960, empty floor band,
no people), object sheets (6 × 4 grid of 256 px cells on a flat background, `#2B2E45` by default, or a transparent
one), character sheets (portraits, walk cycle, SCUMM poses), special poses, and the mouth kit for talking. One sheet
per prompt, always with the reference sheet attached for style.
In the Studio, the **Assets** tab shows each sheet's prompt next to its cells, with a Copy button.

## 4. Cut, key and review
`python3 tools/cut-sheet.py <sheet.png> <sheet-id>` cuts a sheet into `games/<id>/art/<sheet-id>/r<row>c<col>.png`
with the background keyed out. `npm run page:review` builds the **review page**: every cell of every sheet with a
keep / redo / unused decision and a note, saved in the artifact. The AI reads the decisions and lists what to regenerate.
The Studio's **Assets** tab does the cutting too (Upload generated sheet, Replace a cell, never recutting an existing
cell without asking) and runs `npm run assets`.

## 5. Write the rooms
One file per room in `games/<id>/rooms/`, pure data: props and their states, actors, hotspots, look lines, reactions
(`verb` + target + condition + commands), talk topics, hints, checkpoints. See `CONTENT_GUIDE.md`. Skill: `/new-room`.
`npm run validate` catches broken ids, missing look lines, unused flags. `npm run solve` proves the game can be finished.

## 6. Place everything
Geometry lives apart from logic, in `games/<id>/layout/<room>.json`, and is never typed by hand:
- in the browser: `npm run dev` then `?edit=<room>` drags zones, feet, heights, approach points, the walkable polygon;
- or on a phone: `npm run page:placement` publishes a drag-and-drop page; `npm run import-layout <file>` brings the result back.

## 7. Prove it plays
`npm test` runs the engine tests and the game's walkthrough (a scripted full playthrough on the real engine).
`npm run e2e` plays the whole game by touch in a phone-sized Chromium and saves screenshots of every step: the AI looks
at them to catch what the solver cannot see (a character standing on a table, a line cut by the screen edge).

## 8. Ship
`npm run build` type-checks, tests, bundles, and audits the output. Deploy `dist/` anywhere static (GitHub Pages via the
CI workflow, Clever Cloud, Netlify…). The service worker caches the app shell and every asset used or warmed nearby;
those cached rooms can then be resumed offline. Unvisited rooms are deliberately not downloaded in full up front.

## Working with sub-agents
For a game of several rooms, split the work into packages that an orchestrator hands to sub-agents: engine changes,
content per group of rooms, assets, minigames, QA. `docs/en/PRODUCTION.template.md` is the plan we used; the
`/production-plan` skill fills it from the storyboard. Each package ends with validate + solve + tests + screenshots.
