# The local Studio: overview and launch

The Studio is a page of the dev server where you edit a game with the real engine in front of you: what you see is
what players get. This page starts it, on your computer or on your phone, and tours its tabs.

<a name="overview"></a>

## What the Studio is

`npm run studio` starts the dev server and opens the Studio at `http://localhost:5173/__studio/`. Nothing leaves your
machine: every change is written to files under `games/<id>/` (in a created project, under `game/`), the same files
an AI assistant or a teammate edits with git. The room you edit is drawn by the engine itself (`src/engine/dom`), so a
change shows as the game will show it.

The Studio is one page, `studio.html` (entry [`src/studio/main.ts`](../../src/studio/main.ts)). Any dev server of the
repository serves it at `/__studio/`, `npm run dev` too; `npm run studio` also opens it in your browser. A production
build leaves it out, unless it is built on purpose as a static demo ([Demo mode](studio.demo-mode.md)).

To put a game's Studio online for a team (logins, roles, several people at once), use the hosted Studio instead:
[What runs where](team.what-runs-where.md).

> [!LIMIT id=one-person]
> The local Studio is for one person on one machine. It has no accounts, no roles and no locks: two people editing
> the same files at once go through git, not through the Studio.

<a name="what-you-will-build"></a>

## What you will get

The Studio open on the demo game (or yours), the Rooms tab showing a room with its placement editor, and, if you
want, the same Studio on your phone over your local network.

<a name="what-you-need"></a>

## What you need

- Node 22.12 or later, and the repository installed with `npm install` ([Install from the repository](install.from-repository.md)),
  or a created project ([Your first game](create.first-game.md)).
- The prepared assets of the game (`npm run assets`), so rooms are drawn with their pictures.
- For screenshots and before/after captures only: Playwright and its Chromium ([doctor](install.doctor.md)).

<a name="steps"></a>

## Steps

<!-- step: start -->
1. Start the Studio.

   ```sh
   # in the engine repository
   npm run studio
   ```

   ```sh
   # or in a created project
   npm run studio
   ```

   In the engine repository the game is `GAME=<id>` when you set it, otherwise the last game chosen with
   `npm run game`, otherwise `config.game` of `package.json`, otherwise `demo`. A game folder without `index.ts` stops
   the start with `✖  games/<id>/index.ts not found (GAME=<id>)`. Your browser opens `/__studio/` on the Rooms tab.

<!-- step: pick-a-room -->
2. Pick a room in the Rooms tab. The room is drawn by the engine, with the placement editor on top, and the list of
   its props, actors and hotspots on the right. Select one to open its sheet ([Edit a room](studio.edit-room.md)).

<!-- step: lan -->
3. To work from a phone or a tablet on the same network, stop the Studio and start it in LAN mode instead.

   ```sh
   # in the engine repository
   npm run studio:lan
   ```

   The command prints a one-session token and the Studio address with it:

   ```text
   LAN write access is protected by this one-session token:
     <token>
   Studio: http://<this machine's address>:5173/__studio/?token=<token>
   Layout editor: http://<this machine's address>:5173/?edit=<room>&token=<token>
   ```

   Open that address on the phone. A new token is drawn at each start, unless you set `WEB_SCUMM_STUDIO_TOKEN`
   yourself. Why the token, and what it protects: [Local and LAN security](studio.security.md).

> [!LIMIT id=lan-engine-repo]
> `npm run studio:lan` and `npm run dev:lan` are scripts of the engine repository. A created project has no LAN
> script yet; [Testing on a phone over the LAN](create.lan-testing.md) says how to do without.

<a name="layout"></a>

## The tabs

The tabs, in the order of the bar. The URL keeps the tab (`#check`, or `#rooms/<room>` for a room), so a reload
lands where you were.

| Tab | What it does | Page |
|---|---|---|
| **Rooms** (default) | The room drawn by the engine with the placement editor on top; sheets for props, actors and hotspots: look lines, reactions, talk topics, the timeline of scripts; forms for structured values and the stage | [Edit a room](studio.edit-room.md), [Placement and stage](studio.placement.md) |
| **Storyboard** | The editor of `storyboard.json`, each panel drawn like a frame, with its coverage against the content | [Storyboard](studio.storyboard.md) |
| **Map** | The scenario's groupings (chapters, puzzles, characters) and what no grouping names yet | [Map](studio.map.md) |
| **Assets** | Every image and sound, where it is used, its art prompt, uploads and the cutting of sheets | [Assets and cutting](studio.assets.md) |
| **Voices** | The voice recording table per language, and the heroes × languages matrix | [Voices and the heroes × languages matrix](studio.voices-matrix.md) |
| **Music** | The game's scores through its own music director | [Music](studio.music.md) |
| **Check** | Validator, solver, world map, puzzle graph, lint, playtests, storyboard coverage, changes between revisions | [Check](studio.check.md), [Semantic diff](studio.semantic-diff.md), [Before and after captures](studio.captures.md) |
| **Play** | The game in a frame with its live state, the rule explainer, the journal, sessions to export and replay | [Play and replay a session](studio.sessions.md), [Rule explainer](studio.rule-explainer.md) |
| **Language** | The objectives with their forms, and the game's IR | [Language and objectives](studio.language-objectives.md) |
| **Remix** | Seeds, dimensions, worlds compared, coverage and bias | [Remix in the Studio](studio.remix.md) |
| **Notes** | The shared log with the AI and your teammates | [Notes](studio.notes.md) |

Beside the tabs: **Undo** and **Redo** in the header (Ctrl/Cmd+Z, Shift for redo) over every write of the session
([Preview, apply, undo](studio.preview-apply.md)), and the **Assistant** button (or the `a` key when no field has
focus), a chat with a model of your choice that has the same tools as the MCP server ([The Assistant](studio.assistant.md)).

The Studio follows the files: when an AI, an editor or git changes a file of the game, the Studio reloads what it
touches and keeps what you are typing. Vite's full reloads caused by game files are ignored by the Studio page (the
engine view reloads).

<a name="what-you-learned"></a>

## What you learned

- `npm run studio` opens the Studio; `npm run studio:lan` opens it to your network behind a token
  ([Local and LAN security](studio.security.md)).
- Every edit is a file of the game, written atomically and undoable ([Preview, apply, undo](studio.preview-apply.md)).
- Any AI can work on the same files beside you ([Local MCP: setting up each client](studio.mcp-setup.md)).

<a name="next"></a>

## Where to go next

- [Edit a room](studio.edit-room.md), then [Check](studio.check.md).
- [Studio troubleshooting](studio.troubleshooting.md) when the Studio refuses something.
