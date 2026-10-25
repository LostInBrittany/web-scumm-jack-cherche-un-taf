# Architecture

How quest'n'click is put together, for someone reading its code for the first time. The [Code tour](contribute.code-tour.md)
is the same map walked in order, half an hour with the code open; [`docs/dev/adr/`](../../docs/dev/adr/README.md)
explains the decisions that look surprising without their context ([Decisions and ADRs](contribute.decisions.md)).

<a name="overview"></a>

## Overview

The engine is one code path that a phone plays, the solver explores, the replay re-runs and the Studio edits. A game is
data the engine reads; everything that comes from outside is checked before it is trusted; every effect on screen goes
through one port, so the same engine runs silent in Node. The sections below say where each of these lives. The
description holds for the code of 4.4.0; the architecture dates from 4.1.0 "Clarity" (the engine split into modules
behind facades) and 4.1.1 (signals from outside).

<a name="layers"></a>

## The layers

```text
games/<id>/          content: data only (rooms, rules, lines, layouts, assets)
   │ defineGame / compileGame
   ▼
src/engine/core/     the engine: state, rules, commands, scripts, sessions, saves — no DOM, runs anywhere
   ▲            ▲
   │            └──── src/engine/tools/   validator, solver, replay, lint, weight, provenance (Node, workers, tests)
src/engine/dom/      the player: App, the Presenter, the room view, audio, input, menus, offline
src/studio/, tools/  the Studio (browser UI, its server and MCP), the command line
```

What each folder may import is written in [`src/engine/BOUNDARIES.md`](../../src/engine/BOUNDARIES.md) and checked by
`tests/boundaries.test.ts`: the core imports neither the DOM nor the tools; the player never imports the solver, the
validator or the Studio statically; the tools never import the DOM; no cycle of static imports anywhere. The full table
is [Import boundaries](contribute.boundaries.md).

<a name="code-layout"></a>

## Layout of the code

```text
src/engine/
  api/          the public entries: content, player, minigames, testing, reality
  core/         pure logic (no DOM): state, conditions, reactions, commands, scripts, conversations, hints, saves
    types.ts      the content format, commented (the reference); split by subject in core/types/
    engine.ts     the Engine facade: player actions, resolution, lifecycle
    ports.ts      the Presenter interface (what the core asks of the display) and FakePresenter for Node
    cmds.ts       the catalogue of commands; command-handlers.ts runs each one
    cond.ts       condition evaluation
    define.ts     defineGame / defineRoom, compileGame, stable keys for once/nth/cycle/random blocks
  scene/        the scene frame (pure): SceneFrame, the hit test, the Renderer and Intent contracts (4.1.11)
  dom/          the browser display
    app.ts        landscape layout, verbs, inventory, menus, title screen; composes the engine, the presenter, the renderer
    presenter.ts  the Presenter the engine talks to (lines, overlays, map, minigames, sealed ending) and intent()
    fonts.ts      default fonts (Galmuri11, DotGothic16 behind it, Press Start 2P), overridden by skin.fonts
    room.ts       the scene: background, props, characters, depth sorting, walking, poses
    walk.ts       walkable area (earcut triangulation and navmesh paths), scale by depth
    audio.ts      music (fade, stack, one-off track) and sound effects, through Howler
    assets.ts     images and sounds prepared by npm run assets
  minigames/    minigames (DOM plugins): pipes, stroke, pick, hide, runner, scratch, cables, code-wheel; their images come from params
  ending/       the sealed ending (optional): seal.ts (AES-GCM), card.ts (the final card), index.ts (decryption, ticket, confetti)
  reality/      signals from outside (4.1.1): protocol, client, HTTP port
  tools/        validator, solver, replay, lint, i18n and the other tools (Node)
  dev/          debug overlay and placement editor (development only)
  boot.ts       bootGame: wires a game module, the engine and the player
```

**The engine names no game.** `src/engine/` never imports from `games/` and never names a single image, sound or
interface text:

- texts come from `GameDef.ui`;
- icons, sounds, fonts and default heights come from `GameDef.skin` ([Skin and fonts](create.skin-fonts.md));
- minigame images come from their `params`;
- the sealed ending comes from `GameDef.ending`.

A game is a folder `games/<id>/` whose `index.ts` exports `game`, `layouts` and `manifest`, and optionally
`minigames`, `extraImages`, `commands` (custom commands) and `locales` (the `GameModule` of `tools/game.ts`).
`src/main.ts` imports `@game`, an alias for `games/<GAME>/index.ts`, and knows nothing else about the game. The
current game is `GAME=<id>`, else the `.cache/game` link, else `package.json` `"config": { "game" }`, else `demo`
([Developer setup](contribute.setup.md#steps)).

**Geometry constants.** The logical scene measures 640 × 400; the floor goes no lower than `Layout.floor` (default 395,
`FLOOR` in `core/define.ts`); an approach point recorded more than 150 units from its target (`NEAR`) is considered
stale and recomputed.

**Verbs.** Their ids are free (the game's `verbs`). Four have a meaning for the engine: `look` (Look texts), `talk`
(conversations, hints), `give` and `use` (two terms: an inventory item then a target; tapping an inventory item with no
verb selected picks `use`).

<a name="a-game-is-data"></a>

## A game is data

A game is a `GameDef` ([`src/engine/core/types.ts`](../../src/engine/core/types.ts), split by subject in
`src/engine/core/types/`): rooms, verbs, items, characters, rules (`{ verb, a, b, if, do }`), scripts, listeners,
dialogues, a map, an ending. There is no function in it, so it can be validated (`src/engine/tools/validate.ts`),
saved, diffed and solved. Code a game needs (a custom command, a minigame) is trusted code declared beside the content
and reached by name (`core/custom.ts`, `src/engine/minigames/`). `compileGame` (`src/engine/core/define.ts`) freezes
the content and gives every rule, choice, topic, listener and script step a stable id: saves, sessions and the solver
speak in those ids. How the engine runs that data is [How the engine works](engine.how-it-works.md).

<a name="life-of-an-action"></a>

## The life of an action

1. **Input.** A tap on the scene or the inventory (`src/engine/dom/input.ts`) becomes an `Action` `{ verb, a, b }`; a
   double tap picks the verb a player means (`src/engine/core/default-verb.ts`).
2. **Engine.** `Engine.act` (`src/engine/core/engine.ts`) walks the hero there, opens a session entry
   (`core/session-runtime.ts`) and asks `resolve` (`core/interactions.ts`) for the answer: a written rule, else a kind,
   else a refusal or a fallback line.
3. **Commands.** The rule's `do` list runs through `exec` (`core/command-runtime.ts`), one `Cmd` at a time, each by its
   handler (`core/command-handlers.ts`): set a flag, give an item, say a line, walk, play a sound, emit an event
   (`core/event-runtime.ts`), start a script (`core/script-runtime.ts`). Every effect on screen is a call to the
   `Presenter` (`src/engine/core/ports.ts`).
4. **State.** Commands only change `engine.state`, a `GameState` (`core/types/state.ts`) of plain JSON: room,
   inventory, flags, props, counters, what was seen.
5. **Autosave.** When the engine is idle again, `Engine.save` hands the state to the `SaveStore`: in the browser
   `IndexedDbSaveStore` (`src/engine/dom/save-store.ts`), which writes a versioned envelope (`core/save.ts`) and reads
   it back before saying it is saved.
6. **Render.** `App` (`src/engine/dom/app.ts`) composes the engine, the `Presenter` (`dom/presenter.ts`, since 4.1.11)
   and the room view's renderer: the room view (`dom/room.ts`, painted by the DOM or, on demand, by Canvas), speech
   (`dom/speech.ts`), the inventory, music (`dom/director.ts`, `dom/audio.ts`).

The order in which reactions are evaluated, and what each command does to time and randomness, is
[Execution model](engine.execution-model.md).

<a name="trust"></a>

## Trusted content, untrusted input

Content and engine code are trusted; everything that comes from outside is not, and starts as `unknown`: a save
(`parseSave`, a zod schema), a session file (`parseSessionFile`), a storyboard (`storyboardProblems`), a layout import,
an assistant provider's response, a Studio request (`tools/studio/security.ts`). The same invalid input gives the same
diagnostic in the command line, the Studio and the MCP (`tests/diagnostics-parity.test.ts`).

> [!LIMIT id=no-sandbox]
> Trusted means not sandboxed: a game's TypeScript modules and custom commands run with the engine's rights.
> quest'n'click does not sandbox an untrusted `games/<id>/` directory ([Security policy](contribute.security-policy.md)).

<a name="storage"></a>

## Storage, sessions and replay

Saves are envelopes `{ format, schema: 4, gameId, gameSaveVersion, variant, state }` (4.1.15: `variant` is the world
the game was played in; a schema 3 envelope is read as the story world). An old save is migrated by the game's
`migrations` (`core/migrate.ts`), and one save per release since 3.0 is loaded by `tests/save-v3.test.ts`. Every input
is also an entry of the engine's **session**, with the answers given while it ran (choices, random draws) and the
digest of the state after it: `replay` (`src/engine/tools/replay.ts`) plays a session again and names the first entry
whose state differs. A bug report is a session file. The formats are in [File formats](engine.file-formats.md).

<a name="solver"></a>

## The solver runs the real engine

`solve` (`src/engine/tools/solve/`) explores the game from "New game" with the same `Engine` and a silent presenter
(`FakePresenter`): whatever it finds, a player can do. A witness search finds one path to the ending; a proof explores
every reachable state and names the softlocks. The search keys a state only on what can still matter
(`solve/abstractions.ts`); each abstraction is audited against the explicit search (`--audit-abstractions`, and the
corpus of `npm run audit:corpus`). The path from `solve()` to a verdict is in `src/engine/BOUNDARIES.md`, "Inside the
solver" ([Import boundaries](contribute.boundaries.md#inside-the-solver)). What a result lets an author conclude is
[What the solver proves](create.solver-proofs.md).

<a name="signals"></a>

## Signals from outside (4.1.1)

A game may declare signals (`reality`; [Reality Bridge](bridge.what-it-is.md)). A separate Reality Bridge
(`bridge/src/`) authorises connectors with Biscuit and signs each accepted fact; the player verifies the signature
before reading anything (`src/engine/reality/protocol.ts`), and the engine applies the signal at most once, as a session
entry, saved before it is acknowledged. The engine never touches the network: the transport is a port
(`WorldSignalPort`), and a game without `reality` loads none of this code.

<a name="public-and-internal"></a>

## Public and internal

Public: `@quest-n-click/engine/content` (the types and `defineGame`), `@quest-n-click/engine/player` (boot), `@quest-n-click/engine/minigames`,
`@quest-n-click/engine/testing` (`Engine`, the fakes, the save envelope, `solve`), `@quest-n-click/engine/reality` (since 4.1.1), the
content format, the save envelope and the MCP tools, held by `tests/api-surface.json` and the support policy
([Stability and support](start.stability.md), [Public API](engine.api.md)). Internal: the modules behind the `Engine`
and `App` facades (their members marked `@internal`), the solver's modules, the tools' code. Internal code may move
between minor versions.

<a name="decisions"></a>

## Decisions and ADRs

- [ADR 0002](../../docs/dev/adr/0002-declarative-content.md) declarative content;
  [ADR 0003](../../docs/dev/adr/0003-solver-runs-the-engine.md) the solver runs the engine;
  [ADR 0004](../../docs/dev/adr/0004-session-unit-of-reproduction.md) the session is the unit of reproduction;
  [ADR 0005](../../docs/dev/adr/0005-indexeddb-read-back.md) IndexedDB read back;
  [ADR 0007](../../docs/dev/adr/0007-biscuit-and-signed-events.md) Biscuit and signed events;
  [ADR 0011](../../docs/dev/adr/0011-scene-frame-intents-journal.md) scene frame, intents, journal.
- The full index: [Decisions and ADRs](contribute.decisions.md).
