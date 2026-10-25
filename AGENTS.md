# AGENTS.md — working in this repository with any AI assistant

This file is vendor-neutral: Claude Code, Cursor, Codex, Gemini CLI, Aider or a hand-written agent should all read it.
`CLAUDE.md` is a short pointer to it.

## What this is
A mobile-first, SCUMM-style point-and-click engine. **A game is data, never code**: the engine in `src/engine/` reads a
game folder `games/<id>/` (TypeScript objects, JSON layouts, cut sprites). Sample game: `games/demo` ("The Pantry Key").

## The files you will edit
| File | Role | Edited by |
|---|---|---|
| `games/<id>/storyboard.json` | the script: boards, panels, lines, hints, talk topics | the human and the AI, first |
| `games/<id>/rooms/<room>.ts` | one room: props, actors, hotspots, look lines, reactions, talk, hints | the AI mostly; the Studio edits the strings in place |
| `games/<id>/layout/<room>.json` | geometry (never typed by hand) | the Studio / `?edit=<room>` / placement page |
| `games/<id>/{game,cast,items,rules}.ts` | verbs, characters, items, map, fallbacks, ui texts, skin | the AI |
| `games/<id>/art/<sheet>/r<row>c<col>.png`, `audio/` | sources of `npm run assets` | the human (generated art), `tools/cut-sheet.py` |
| `games/<id>/notes.json` | the shared log between the human and the AI (per room, panel or id) | both |
| `games/<id>/site.json` | title, description, colour | either |

The reference for the content format is `src/engine/core/types.ts`; the guide is the wiki's
`create.*` pages (`wiki/en/create.principles.md` first; through MCP, `search_docs` then `read_doc` by id and section).

## Commands that tell you the truth
```
npm run validate      # broken ids, missing look lines, flags never set or read, minigame params
npm run solve         # proves the game can be finished from New Game; --json for machines
npm test              # engine tests + the game's walkthrough
npm run e2e -- <url>  # full playthrough by touch in a phone-sized Chromium, screenshots in E2E_OUT
npm run assets        # art + audio → public/assets + assets.gen.json
npm run prompts       # image-model prompts for every sheet → games/<id>/prompts.md (--missing: only what is not cut)
npm run audio -- …    # Mega Drive music from a MIDI (ingest → spec.json → all) and sound effects from sfx.json (wiki/en/create.music.md)
npm run build         # type-check, tests, bundle, spoiler check, leak audit
npm run studio        # the local WYSIWYG Studio (wiki/en/studio.overview.md); it watches the files you edit
npm run mcp           # Model Context Protocol server exposing the Studio operations as tools (wiki/en/studio.mcp-setup.md)
npm run i18n -- status   # translation coverage (locales/<lang>.json); `extract --lang <xx>` to (re)build a table
npm run lint          # content lint: conditions nothing sets, hidden rules, red herrings, stuck hints, actions never run (run it before a review)
npm run playtests     # the sessions players shared (games/<id>/playtests) replayed and summed up: stalls, time per room, hints
npm run ids -- --write --map   # stable ids (schema 3) written into the sources, locales renamed, the save migration step
npm run prove:game    # the exhaustive proof (global and per chapter): a release gate for a small game, a weekly job for a big one
npm run doctor        # Node, Python, ffmpeg, Playwright browsers, with the fix for each missing one
npm run dev:lan       # the dev server on the local network (phone), with a one-session token for the Studio's writes
GAME=<id> npm run …   # another game than package.json "config".game
```

## Rules
1. Content is data: no functions in `games/`. Logic is a condition (`if`) or a command (`do`).
2. Logic in `rooms/*.ts`, geometry in `layout/*.json`. Never invent coordinates: ask the human to place things in the
   Studio, or use the placement page, then read the JSON.
3. Every visible thing has a `look` line; every action gets an answer (fallbacks in `rules.ts`).
4. The storyboard is the source of truth for text. Change it first, then the room.
5. After any content change run `npm run validate && npm run solve && npm test` and report the output, not a summary.
6. After any visual change take a screenshot (`?dev&at=<checkpoint>` with Playwright, or the Studio's Check tab) and look at it.
7. Never delete an asset; rename to `_v1`. Never recut a validated sheet. `games/<id>/private/` is gitignored and stays so.
8. Write short, kind, funny lines for the hero. Repeated looks: normal, normal, normal, absurd.
9. When unsure what the human wants, write a note in `notes.json` (`about` = the room, panel or id) instead of guessing.
10. Art prompts: never write a sprite prompt by hand; run `npm run prompts` (or the `asset_prompts` MCP tool) and paste
    its sections, so every sheet shares the style block and the engine's pose rows.
11. A character that moves or acts on its own is a `scripts` entry (room or game), not a rule; "something just
    happened" is `{ emit }` + `events`, not a flag; a character present in several rooms over the story gets a `room`
    and `moveActor`. See "The world lives" in the content guide.
12. Before asking for a new command or a new field, read `wiki/en/create.classics.md`: the famous mechanics of the genre are
    combinations of rules, flags, scripts and events the engine already has (insult fights, melting items, patrols,
    haggling, cross-character puzzles…), each with its DSL.
13. Sounds come from `npm run audio` (wiki/en/create.music.md): a track is a `spec.json` arrangement of a source you may use (yours, public domain), the effects are `sfx.json` recipes, both on the shared palette. Never drop a sound file of unknown origin into `audio/`.

## How the human sees your work
`npm run studio` shows the rooms rendered by the real engine and reloads when you change a file. The human answers in the
Studio's Notes tab (`notes.json`) or by editing the storyboard. Commit small, explain in the message what changed in the game.

**Through MCP.** `npm run -s mcp` serves the same operations as tools (`get_room`, `set_text`, `add_note`, `validate`,
`solve`, `screenshot`, `read_doc`…) to any MCP client; `.mcp.json` (Claude Code) and `.cursor/mcp.json` are in the repo,
other clients in `wiki/en/studio.mcp-setup.md`. The human sees your edits live in the Studio and answers through `get_notes`.
Notes tagged `task: true` in `notes.json` are requests from the human (written from the Studio's Assistant): do them,
then answer with `add_note` on the same `about`.
