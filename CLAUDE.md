# quest'n'click — notes for an AI assistant working in this repo

The vendor-neutral manual is `AGENTS.md`: read it first; this file only adds what is specific to Claude Code (skills, MCP via `.mcp.json`).

A mobile-first, SCUMM-style point-and-click engine. A game is **data**, never code: the engine in `src/engine/` reads a
game folder `games/<id>/` (TypeScript objects + JSON layouts + art). The sample game is `games/demo` ("The Pantry Key").

## Where things are
- `src/engine/core/types.ts` — the content format (DSL). The reference: read it before writing any content.
- `src/engine/core/engine.ts` — rule resolution and the command interpreter. `dom/` renders it, `minigames/` are plugins,
  `ending/` is the optional sealed ending, `tools/` holds the validator and solver, `dev/` the in-browser editor.
- `games/<id>/` — `game.ts` (verbs, characters, items, map, rules, start, ui texts, skin), `rooms/*.ts` (one per room),
  `layout/*.json` (geometry, written by the editor), `art/` (cut sprites, `<sheet>/r<row>c<col>.png`), `audio/`,
  `storyboard.json` (the script), `site.json` (title, description), `index.ts` (what the engine loads).
- `wiki/en/` — the documentation, one page per subject, published as the GitHub wiki (4.5.0): `create.*` (how to write
  a game: rooms, the DSL, characters, images, music, classics, the working loop), `studio.*`, `engine.*`, `install.*`
  (one upgrade-notes page per line), `bridge.*`, `team.*` and `clever.*`, `contribute.*`, `reference.*`;
  `wiki/manifest.json` lists them. `wiki/fr/` mirrors it in French; `npm run wiki -- check` keeps both in step.
  `docs/en` and `docs/fr` are transition pages to it. `docs/dev/` is the work log (LOG.md, the decisions, the passes
  of each release).
- `tools/` — validate, solve, refs, assets.py, cut-sheet.py, talk-kit/apply/normalize, pages/, audit-assets.

## Commands
```
npm run dev                 # dev server; ?dev&at=<checkpoint> jumps to a state; ?edit=<room> opens the placement editor
npm run studio              # dev server + the Studio (/__studio/): rooms, texts, storyboard, notes, checks
npm run -s mcp              # MCP server; .mcp.json registers it for Claude Code in this project
npm run validate            # broken ids, missing look lines, flags never set/read, minigame params
npm run solve               # proves the game can be finished from New Game, prints the path
npm test                    # engine tests + the game's walkthrough
npm run e2e -- <url>        # full playthrough by touch in a phone-sized Chromium, screenshots in E2E_OUT
npm run assets              # games/<id>/art + audio → public/assets (webp, mp3) + assets.gen.json
npm run build               # tsc + tests + vite build + spoiler check + leak audit
GAME=<id> npm run …         # pick another game (default: package.json "config".game)
npm run new-game <id>       # scaffold games/<id> from games/_template
npm run lint                # content lint from the puzzle graph and a solver run (run it before asking for a review)
npm run playtests           # the sessions players shared, replayed and summed up (stalls, time per room, hints)
npm run ids -- --write --map   # stable ids (schema 3) into the sources, locales renamed, the save migration step
npm run prove:game          # the exhaustive proof; npm run doctor checks the prerequisites; npm run dev:lan serves the phone
```

## Rules that keep a game healthy
1. Content is data. No functions in `games/`. If you need logic, it is a condition (`if`) or a command (`do`).
2. Logic in `rooms/*.ts`, geometry in `layout/*.json`. Never type coordinates by hand: use `?edit=<room>` or the
   placement page, then `npm run import-layout`.
3. Every visible thing has a `look` line. Every action gets an answer (fallbacks live in `rules.ts`).
4. The storyboard is the source of truth for text. Change the storyboard, then the room, never only the room.
5. After any content change: `npm run validate && npm run solve && npm test`. After any visual change: a screenshot
   of the room (`?dev&at=<checkpoint>` + Playwright) and look at it.
6. Never delete an asset; rename to `_v1`. Never recut a sheet that was validated. `games/<id>/private/` is gitignored:
   raw sheets, photos, the real ending config live there.
7. Keep the hero's lines short, funny and kind. Rhythm for repeated looks: normal, normal, normal, absurd.

## Skills
`/new-game`, `/new-room`, `/new-character`, `/storyboard`, `/placement`, `/review`, `/production-plan` in `.claude/skills/`.
