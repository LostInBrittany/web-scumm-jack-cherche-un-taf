# Import boundaries

What each folder of `src/engine/` may import, where each responsibility of the engine, the player and the solver
lives, and what is public. The source is [`src/engine/BOUNDARIES.md`](../../src/engine/BOUNDARIES.md);
[`tests/boundaries.test.ts`](../../tests/boundaries.test.ts) checks the rules on every run of the unit suite.

<a name="layers"></a>
<!-- applies: .. since 3.9.0 -->

## The layers and what they may import

### Values

| Layer | Folder | May import | Never |
|---|---|---|---|
| Core | `core/` | itself, plain packages (`zod/mini`) | the DOM, tools, dev, minigames, the Studio |
| Player | `dom/`, `minigames/`, `ending/`, `boot.ts` | core, each other; `tools/i18n` (locales at boot); `tools/replay` and `dev/` only through `import()` | the solver, the validator, the linter, any other tool, the Studio, tweakpane |
| Scene | `scene/` (4.1.11) | core (the painter's specs as types only) | the DOM, tools, dev, the Studio, a painter |
| Reality | `reality/` (4.1.1) | core, plain packages (`zod/mini`); WebCrypto | the DOM, tools, dev, the Studio, the Bridge (`bridge/`) |
| Tools | `tools/` | core | the DOM (they run in Node, workers and tests) |
| Dev | `dev/` | anything | being imported statically by the player |

Outside `src/engine/`, the test also holds two rules of 4.1.1: **the engine never imports the Bridge** (Biscuit, keys
and the server stay out of every game), and **the Bridge reaches neither the Studio, the tools, nor a game**: only the
protocol it shares with the player.

> [!GUARANTEE id=core-imports-no-dom]
> The core imports none of the engine's other layers: no DOM layer (`dom/`), no tools, no dev code, no minigames, no
> `ending/`, no Studio. A static import that breaks this fails the unit suite. The check reads the import statements of
> the files; it cannot see a module reached through a global or an `eval`.

The check does not sort packages: keeping the core's packages plain is left to review.

### Constraints

- **The player's first visit** is held to `assetBudgets.initialJsKB` (`npm run verify:dist`): the minigames load when
  one starts (`minigames/meta.ts` keeps what the tools read of them), the dev panel and the Studio on demand.
- **A painter** (`dom/render-*.ts`, `dom/renderer.ts`, `dom/frame-renderer.ts`) never imports the engine, its ports or
  its runtime modules, not even as a type (4.1.11, D21): it is given frames and specs, and answers with intentions.
- **No cycle of static imports** anywhere in `src/engine` (4.1.0): a module never imports itself back. Types
  (`import type`) are erased and do not count.

### Behaviour on an unknown folder

A new folder under `src/engine/` belongs to no layer of the test until one is written for it: add it to
`BOUNDARIES.md` and to `tests/boundaries.test.ts` together.

<a name="inside-the-core"></a>
<!-- applies: .. since 4.1.0 -->

## Inside the core (4.1.0 "Clarity")

`Engine` (`core/engine.ts`) is the facade: its state, its lifecycle (new game, load, checkpoint) and one forwarding
method per operation, in the same order of effects as before the split. What each operation does lives in a module of
its own, a function taking the engine as its first argument:

| Module | What it does |
|---|---|
| `core/session-runtime.ts` | the session: entries opened and closed, the answers recorded, digests, replay's feed |
| `core/event-runtime.ts` | `emit`: scripts waiting for the event, then the room's listeners, then the game's |
| `core/script-runtime.ts` | scripts: their state, one step, loops, the scheduler |
| `core/interactions.ts` | the rule, kind or fallback that answers an action; lines, hints, the talk loop |
| `core/command-runtime.ts` | `exec` and `step`: running `Cmd`s, each through its handler in `core/command-handlers.ts` (4.1.5); where a command points in the room |
| `core/world-queries.ts` | names, kinds, visibility, prop states, targets, approach points |
| `core/players.ts` | several playable characters: who is where, switch, swap, transfer |
| `core/movement.ts` | walking, entering a room, the map and its travel, a teleport (4.1.1) |
| `core/reality-runtime.ts` | a signal from outside: applied at most once, the cursor, the session entry (4.1.1) |
| `core/engine-shared.ts` | the context of a command, the journal's entry, small helpers |
| `core/journal.ts` | the semantic journal (4.1.11): what happened, in ids, numbered; emitted by the core alone |
| `core/busy.ts` | the busy owner (4.1.11): runs in progress, the tutorial step waited for, a skip |
| `core/run-clock.ts` | the run clock (4.1.14, ADR 0016): logical steps and time, told by the session and the commands; it never writes the state |
| `core/prng.ts` | the seeded generator (4.1.14): xoshiro128**, a stream per purpose; `engine.random` draws from `logic` |
| `core/run-tape.ts` | a run's links (4.1.14): each entry with its events and the clock after it, the same live and replayed |
| `core/journal-chunks.ts` | the run's chunks chained by SHA-256 (4.1.14), written to a `ChunkStore`, read back checked |
| `core/types/*.ts` | the content format by subject; `core/types.ts` re-exports every name |

The modules import `Engine` as a type only; `tests/core-runtime.test.ts` calls each directly.

<a name="inside-the-player"></a>
<!-- applies: .. since 4.1.0 -->

## Inside the player (4.1.0 "Clarity")

`App` (`dom/app.ts`) is the orchestration (4.1.11): its state, the constructor, and the composition of the engine, a
`Presenter` (`dom/presenter.ts`) and the room view's renderer. The rest lives in modules called through forwarding
methods, as in the core:

| Module | What it does |
|---|---|
| `dom/presenter.ts` | the `Presenter` the engine talks to (4.1.11): the scene's calls, lines, overlays, minigames, the ending; `intent()`, the one door of the player's input |
| `dom/room.ts` | the scene model: entities, walking, the camera; it makes the `SceneFrame` (`scene/frame.ts`) and paints it |
| `dom/room-stage.ts` | a room's stage for the painter: conditions evaluated, images placed on the backdrop (4.1.11) |
| `dom/frame-renderer.ts` | a painter (DOM or Canvas) as a `Renderer`: whole frames, an unchanged one skipped, a changed one by its differences |
| `dom/shell.ts` | the shell's elements, their layout for the screen, the accessible targets (from the frame's targets) |
| `dom/side-fit.ts` | the phone column's fit (pure): verb and slot heights that keep the tools row on a short screen |
| `dom/input.ts` | verbs, the inventory bar, taps and double taps (`verbFor`, `nearMiss`), the keyboard, the action line |
| `dom/speech.ts` | lines with their voice, the transcript, phone calls, the choice of responses |
| `dom/map-view.ts` | the map and the travel animation |
| `dom/menus.ts` | title, pause (and the session export, through `import()`), save slots, restart, credits |
| `dom/settings.ts` | the player's preferences, their defaults and menu |
| `dom/update.ts` | the offline warm-ups and status, the update offered after a verified save |
| `dom/storage.ts` | the localStorage autosave and slots (when IndexedDB is missing) |
| `dom/app-shared.ts` | small helpers (element factory, tap timings, the FPS meter) |
| `dom/reality-ui.ts` | the world link (4.1.1): pairing, status, the client; loaded by `import()` only for a game with `reality` |
| `dom/run-store.ts` | the runs' IndexedDB store (4.1.14, `web-scumm-runs`): chunks and heads in one transaction, local records |
| `dom/speedrun-ui.ts` | the speedrun mode (4.1.14): the recorder on the app's engine, its timer, records, ghost, export; loaded by `import()` (it reaches `tools/speedrun/` the same way) |

<a name="inside-the-solver"></a>
<!-- applies: .. since 4.1.0 -->

## Inside the solver (4.1.0 "Clarity")

`tools/solve.ts` re-exports what it exported before; the solver lives in `tools/solve/`:

| Module | What it does |
|---|---|
| `src/engine/tools/solve/search.ts` | `solve()`: the frontier, the proof workers, termination and the verdict |
| `src/engine/tools/solve/expansion.ts` | `makeExpander`: every action worth trying from a state, run on the real engine; the no-op memo |
| `src/engine/tools/solve/abstractions.ts` | what a state is made of (dimensions), the canonical forms (players, mobility, ownership), dominance |
| `src/engine/tools/solve/model.ts` | options, `SearchNode`, `Expansion` and a transition (`TryRecord`), with their invariants |
| `src/engine/tools/solve/scenarios.ts` | signals from outside in a search: closed, a scenario, adversarial (4.1.1) |
| `src/engine/tools/solve/report.ts` | the result, its profile, the profile as text |
| `src/engine/tools/solve/drive.ts` | an engine promise awaited, the guided tutorial's steps played meanwhile |
| `src/engine/tools/solve/explosion.ts` | the explosion profile (4.1.13): the states attributed to positions, inventories, flags, dialogues, scripts |
| `src/engine/tools/solve/search/compact.ts` | the store of the states seen (4.1.13, ADR 0015): by index, interned keys, parents, paths and session entries |
| `src/engine/tools/solve/search/checkpoint.ts` | a search written down and taken up again (4.1.13): snapshot, header, fingerprint |
| `src/engine/tools/solve/search/classify.ts` | the verdict of a proof over the stored states: reverse reachability, softlocks and their causes |
| `src/engine/tools/solve/search/dominance.ts` | dominance, symmetric items, independent sub-puzzles (4.1.13) |
| `src/engine/tools/solve/search/partition.ts` | the workers' shared visited table, the partition of a batch and work stealing (4.1.13) |

The path of a proof reads `solve()` → `solveOnce()` (search) → `makeExpander()` (expansion) → the engine's `act()` →
a `TryRecord` merged into the store and the frontier → the verdict.

<a name="file-size"></a>

## File size

No file of `src/` is over 800 lines but the exceptions `tests/file-size.test.ts` lists with their reason, each capped
at its size: an exception never grows, and leaves the list once under the limit.

<a name="public-and-internal"></a>

## Public and internal

Public, and held to semantic versioning: the five entries of `src/engine/api/`, published as `@quest-n-click/engine/content`
(the types and `defineGame`), `@quest-n-click/engine/player` (boot), `@quest-n-click/engine/minigames`, `@quest-n-click/engine/testing`
(`Engine`, the fakes, the save envelope, `solve`) and `@quest-n-click/engine/reality` (since 4.1.1); the content format, the
save envelope and the MCP tools. They are held by `tests/api-surface.json` and the support policy
([Stability and support](start.stability.md), [Public API](engine.api.md)).

Internal: the modules behind the `Engine` and `App` facades (their members marked `@internal`), the solver's modules,
the tools' code. They may move between minor versions.

<a name="related"></a>

## Related identifiers

- `npm run verify:dist` (the first visit's budget), `tests/boundaries.test.ts`, `tests/file-size.test.ts`,
  `tests/api-surface.json`.
- [Architecture](contribute.architecture.md), [Code tour](contribute.code-tour.md).
