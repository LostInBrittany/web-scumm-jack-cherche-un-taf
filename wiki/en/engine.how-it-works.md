# How the engine works

The engine's parts and why they are cut that way: the game as data, how a page boots a game, the two screen layouts,
the scene model and its painters, the scene frame and the semantic journal, walking, the asset graph, the music
director, and the cache that lets a game play offline. The order in which an action runs is on
[Execution model](engine.execution-model.md).

<a name="overview"></a>

## The engine

A SCUMM-style point-and-click engine for the browser, built for phones in landscape. It knows nothing about any
particular game: a game is a content folder that the engine reads.

- **In the engine repository**, games live in `games/<id>/`. The current game is, in this order: the `GAME`
  environment variable; else the game `.cache/game` points to (set by `npm run game` or `npm run new-game`); else
  `package.json` → `"config": { "game" }`; else `demo` ([`tools/game.ts`](../../tools/game.ts)).
- **In a created project** (the `quest-n-click` command), the game's sources are in the project's `game/` folder and
  the engine is the installed package, never written to.

See [Layout of a project](create.project-layout.md) and [The working loop](create.working-loop.md).

<a name="a-game-is-data"></a>

## A game is data

A game is a `GameDef` ([`src/engine/core/types.ts`](../../src/engine/core/types.ts), split by subject in
`src/engine/core/types/`): rooms, verbs, items, characters, rules (`{ verb, a, b, if, do }`), scripts, listeners,
dialogues, a map, an ending. There is no function in it, so it can be validated
([`src/engine/tools/validate.ts`](../../src/engine/tools/validate.ts), `npm run validate`), saved, diffed and solved
(`npm run solve`). Code a game needs (a custom command, a minigame) is trusted code declared beside the content and
reached by name ([`core/custom.ts`](../../src/engine/core/custom.ts), `src/engine/minigames/`).
`compileGame` ([`src/engine/core/define.ts`](../../src/engine/core/define.ts)) freezes the content and gives every
rule, choice, topic, listener and script step a stable id: saves, sessions and the solver speak in those ids. See
[Custom code](create.custom-code.md) and [File formats](engine.file-formats.md).

<a name="bootstrap"></a>

## Bootstrap

[`src/engine/boot.ts`](../../src/engine/boot.ts)
`bootGame({ game, layouts, manifest, minigames, commands, locales, version, dev, sw })` is what a page does to start a
game: the language, the fonts, the verified save store (early errors are kept until the `App` can show them), the
`App`, `window.__game`, the dev tools, the title, the service worker. [`src/main.ts`](../../src/main.ts) calls it; a
game that embeds the engine calls it too ([Upgrade notes, v3: a game that embeds the engine](install.upgrade-notes-v3.md#embedded-engine)). `pickLanguage`, `waitFonts` and
`openStore` are exported for a page that needs another order. The full signature is on
[Public API](engine.api.md).

<a name="two-layouts"></a>

## Two layouts

- **Phone (touchscreen), landscape**: the scene on the left; on the right, a column with the 9 verbs in a 3×3 grid,
  the inventory over 3 columns, and the Map / Pause / Sound icons. The sentence shows at the bottom of the scene. The
  column fits the screen's height inside the safe areas ([`dom/side-fit.ts`](../../src/engine/dom/side-fit.ts)): on a
  short screen the inventory's slots stop being square first, then the verbs come down to 44 px, and the icons always
  stay in sight.
- **Desktop (a mouse, a screen of at least 720 × 450)**: the classic SCUMM layout. The scene takes the top; the
  sentence sits just below it; bottom left, the 9 verbs; on the right, the inventory (4 × 2, arrows on the left); far
  right, the 3 icons in a column. Conversation choices and the place list take the spot of the verbs and the
  inventory.

The choice is made automatically (`App.layout`, [`dom/shell.ts`](../../src/engine/dom/shell.ts)): the desktop layout
needs a fine pointer (`pointer: fine`) and a content box of at least 720 × 450 once the safe areas are taken out. It is
made again whenever the window is resized.

<a name="scene"></a>

## The scene: a model and a painter

[`dom/room.ts`](../../src/engine/dom/room.ts) (`RoomView`) is the scene model of a room: who is where, which image of
which pose, depth, walking, mouths and blinks, fades, the camera, and the hit test (the smallest visible target under
the finger). It hands each entity to a painter as a finished sprite (`SpriteSpec` in
[`dom/renderer.ts`](../../src/engine/dom/renderer.ts): image, feet position, size, depth, mirror, rotation, opacity,
glow, shadow) and never asks the painter anything back, so two painters cannot disagree on what a tap touches.

**The DOM painter** ([`dom/render-dom.ts`](../../src/engine/dom/render-dom.ts)) is the reference (D10): an `<img>`
per sprite, the z-index for depth, a CSS translation for the camera. `RoomView.still()` stops every animation on a
fixed picture (first frames, mouths closed, the camera at rest): `npm run e2e:visual` compares each room of the sample
game, still, with its reference in `tests/visual/demo/` (a CI gate; `--update` rewrites the references after a wanted
change). The DOM painter draws layers, parallax and polygon occluders (the backdrop clipped at the occluder's depth).

**The Canvas 2D painter** ([`dom/render-canvas.ts`](../../src/engine/dom/render-canvas.ts)): one `<canvas>` the size
of the viewport, held in place while the room under it moves with the camera, repainted on the next frame after a
change.

- The backdrop and the still backdrop layers are pre-rendered once over the whole room and copied each frame.
- Depth is the draw order; a sprite pivots on its feet; an upright sprite is snapped to device pixels in the room as
  the DOM's layout does (the camera's translation keeps its fractions, like the DOM room's); sprites off screen are
  skipped; the backdrop covers the room like `object-fit: cover`.
- It draws the whole stage (`RoomDef.stage`): layers at their depth with their parallax, blend and opacity; occluders
  (the backdrop's pixels, or a layer's, through a polygon, a black-and-white mask or a layer's alpha, feathered or
  inverted, composited once) at theirs; the foreground; lights (radial and ambient, `screen` or `multiply`, falling on
  the foreground too); particles (seeded per emitter, on the presentation clock, never the engine's dice); effect
  layers.

The model evaluates every stage condition and gives the stage again when one changes; a room's `transition` fades or
wipes the painter's surface; reduced motion (the setting or the system's) turns off parallax, particles and
transitions. A room chooses Canvas with `renderer: 'canvas'` (or the game, for every room); the URL parameter
`?renderer=canvas|dom` forces one painter for every room. The UI, the dialogue and every accessible target stay in the
DOM, above the canvas.

> [!MEASURE id=canvas-parity]
> The sample game's rooms painted by Canvas within 0.31% of the DOM references; the whole game played to the end with
> it; 60 frames per second with the CPU slowed 4× (`npm run e2e:perf`), all in the CI's `chromium / canvas` row.
> - date: 2026-10-05
> - version: 3.4.0
> - volume: the sample game (`games/demo`), every room
> - conditions: Chromium under Playwright in CI, CPU throttled 4× for the frame rate
> - source: [docs/en/ENGINE.md at the commit that added the Canvas painter](https://github.com/Quest-n-Click/quest-n-click/blob/4610320b931384abb50341a54ff1450176d8fb24/docs/en/ENGINE.md)

<a name="scene-frame"></a>

## The scene frame, the renderer and the journal

ADR 0011 and decision D21 (4.1.11): rendering is not a source of state. Three contracts carry it.

**The scene frame.** [`scene/frame.ts`](../../src/engine/scene/frame.ts) `sceneFrame(state, layouts, anim)` is a pure
function that returns an immutable `SceneFrame` in logical units: the camera; the layers (the backdrop, the stage
layers, the occluders, the props); the characters (where they stand, which way they face, whether they speak or walk,
their sprite); the targets with their hit polygons precomputed (the layout's polygon, else the box of what is drawn,
rotation included; the smallest wins); the effects (lights, particles, the transition); and a `hash` of all of it.
`RoomView` resolves every sprite, makes the frame and paints it when a room is built; between builds, an entity that
changes paints its own sprite (its part of the frame). The hit test (`hitTest`) and the accessible buttons read the
frame, so the semantic DOM layer (buttons, focus, keyboard, screen reader) follows whatever paints the room.
`tests/dom/scene-frame.test.ts` holds the DOM of every room of the sample game and of the reference chapter, in three
states, to what it was before the frame existed.

**The renderer.** `Renderer` (`mount`, `render(frame)`, `onIntent`, `unmount`) is what draws a frame. The DOM and
Canvas painters are wrapped as one ([`dom/frame-renderer.ts`](../../src/engine/dom/frame-renderer.ts)): an unchanged
frame is skipped by its hash, a new room is painted whole, a changed frame by its differences.
[`scene/null-renderer.ts`](../../src/engine/scene/null-renderer.ts) draws nothing, for tests and headless runs. The
render loop, the screen-to-scene conversion and the presentation animations (walk cycles, mouths, particles) belong
to the renderer side; the engine knows no frame. A painter never imports the engine (`tests/boundaries.test.ts`).

**Intentions.** An `Intent` is the only thing that goes back: `act` (a verb on a target, an item on it), `walk` (a
point of the floor), `pick` (a choice), `skip`, `open` (the map, the bag, the menu). The input layer
([`dom/input.ts`](../../src/engine/dom/input.ts)) makes them from taps, keys and clicks and gives them to the presenter
([`dom/presenter.ts`](../../src/engine/dom/presenter.ts) `intent()`), which applies the engine's
([`scene/intent.ts`](../../src/engine/scene/intent.ts)) and answers its own. `App` composes the engine, the presenter
and the room view's renderer. The same clicks on the DOM and on the Canvas painter record the same session and the
same journal, at device pixel ratios 1, 2 and 3, on a phone and a desktop screen, with and without reduced motion
(`tests/dom/intent-equivalence.test.ts`).

> [!GUARANTEE id=same-clicks-same-session]
> The same clicks on the DOM painter and on the Canvas painter record the same session and the same journal.

**The semantic journal.** `Engine.journal` ([`core/journal.ts`](../../src/engine/core/journal.ts)) numbers what
happened, in ids:

| Event | When |
|---|---|
| `sessionStarted` | A new game, a load, a checkpoint |
| `roomEntered` | A room is entered (with `from` when it comes from another room) |
| `itemAcquired`, `itemLost` | An item enters or leaves the inventory (an item handed between players is both, each with its `player`) |
| `flagChanged` | A flag's value changes (only then; `null` for a flag removed) |
| `playerSwitched` | The player takes another character |
| `objectiveCompleted` | An objective holds for the first time in the session (4.1.12, ADR 0014) |
| `endingReached` | `end`, or the sealed ending |
| `loadMade` | A save is loaded (journalled before its `sessionStarted`) |
| `saveMade` | The autosave that follows something semantic |

The command handlers, a room's entry and the engine's lifecycle emit it; nothing in the DOM does, and a kind it does
not know is refused (it is not the interface's bus). `since(seq)` gives the events after a sequence number,
`subscribe` hears them as they come. The window keeps the last 10,000 events: a longer session is exported with
`journalTruncated`, and `npm run replay` then says it compared no journal. Replaying a session yields the same journal
(`tests/journal.test.ts`: the sample game, the reference chapter, 200 generated games); a session file carries it,
`npm run replay` prints it and fails when the replay's differs, and the dev panel lists the latest events.

[`core/objectives.ts`](../../src/engine/core/objectives.ts) checks every objective's `done` at each save and just
before an ending, and emits `objectiveCompleted` the first time one holds, never again in the session, after the flag
that completed it and before the autosave's `saveMade`. A slot on `saveMade` and `loadMade` waits for a save that is
part of the session. See [Chapters and objectives](create.chapters.md).

<a name="walking"></a>

## Walking and motions

[`dom/walk.ts`](../../src/engine/dom/walk.ts) walks a character over its room's walk zones (`walkZones`: one polygon
with holes each, its own depth scale and camera zoom) and the links between them (`walkLinks`: walk, stairs, ladder,
jump, teleport, with a duration, an animation and a facing): the fewest links first, then the shortest path inside
each zone.

- A link's condition is DSL (`RoomDef.stage.links[id].if`), read when the walk is planned. A closed link stops the
  walk at its foot with its `locked` line, and the action that asked for the walk still runs: `npm run lint` warns
  (`walk-link-gate`) when a rule behind such a walk does not check the condition itself.
- The route between zones belongs to the core since 4.1.11 ([`core/motion.ts`](../../src/engine/core/motion.ts)
  `zoneRoute`, pure: breadth first, a one-way link forward only, a closed link named as what blocks); the walker walks
  it.
- `core/motion.ts` gives `launch`, `spring`, `path` and `follow` as closed forms of time: the same flight at any frame
  rate, nothing simulated, nothing logical inside. A character keeps where its motion ends, like `place`.
- The Studio's Rooms tab draws masks, zones and their links on the backdrop
  ([`src/studio/rooms-stage.ts`](../../src/studio/rooms-stage.ts)). The validator refuses a mask polygon that closes
  no surface and, in a room of several zones, a zone no link joins.

How to draw them: [Geometry](create.geometry.md); when something is visible but cannot be reached:
[Something is visible but unreachable](create.unreachable.md).

<a name="assets"></a>

## Assets: one graph

[`src/engine/core/asset-graph.ts`](../../src/engine/core/asset-graph.ts) says which files each part of the game
needs, from the content:

- the title: backdrop, logo, music, video, the column's icons, the bag at the start;
- each room: backdrop; props in every state and animation frame; every character who can stand there (its actors,
  the playable characters who can reach it from their start through exits, the map or commands, characters moved
  there), with variants, mouths and portrait; its music; what its commands can play or show;
- the map; what game-wide rules can play;
- `offline`: every file the game ships.

The renderer preloads a room's subset for who is actually there; the background warm-up reads the current and
neighbouring rooms' scopes; the full offline plan is the `offline` scope; provenance covers it; `npm run weight`
budgets it. A file one of them knows cannot escape the others. A room's scope over-approximates one visit (every
variant, every character who could be there), never the other way: `npm run e2e:weight` fails on a request outside
the prediction.

**Fonts.** The default fonts go through the bundler, with hashed names, so the service worker's precache takes them
from the HTTP cache instead of downloading them again. The interface font, Galmuri11 (since 4.3.0), is a proportional
pixel font close to the LucasArts dialogue fonts, shipped as a Latin subset (125 KB,
[`tools/subset-font.py`](../../tools/subset-font.py)) with a `size-adjust` that gives its capitals the height
DotGothic16's had. DotGothic16, the default until 4.2.5, stays behind every interface family (`fontStack` in
[`dom/fonts.ts`](../../src/engine/dom/fonts.ts)): its own Latin subset (118 KB) answers the few symbols Galmuri11
lacks, and the full font (2 MB, mostly Japanese) is a face whose `unicode-range` covers only the rest, so a browser
fetches it, and caches it, only for a character outside the subsets. See [Skin and fonts](create.skin-fonts.md).

<a name="music"></a>

## Music: a director and its stems

[`dom/director.ts`](../../src/engine/dom/director.ts) plays a score (`audio.scores`, since 3.5) on Web Audio from
decoded buffers: every stem starts at the same instant of the audio clock and loops over the same window, so they stay
sample-locked; a change of the game's state moves stem gains on the next bar (or beat), crossfaded, scheduled ahead on
the audio thread. [`core/score.ts`](../../src/engine/core/score.ts) decides what and when, without a sound card: the
mix per state, the grid through the loop, the ramps.

**Stems or the single mix.** [`dom/audio.ts`](../../src/engine/dom/audio.ts) hands a scored track to the director
where it fits: Web Audio, no Save-Data, more than 2 GB of memory and 2 cores; on a browser that does not tell its
memory (Safari), only when the scores decode to 128 MB at most (`pcmBytes`). Elsewhere it plays the single mix with
Howler. The URL parameter `?music=mix|stems` forces one. Voices and one-off tracks duck the score like the mix.

**What the director guarantees.**

- Only the latest request plays (3.5.1): a score whose stems finish decoding after another score was asked for, or
  after a stop, is dropped (`tests/director.test.ts`).
- The decoded audio it keeps is capped (3.6, `audio.maxDecodedMB`, default 160): past it, the scores least recently
  played are let go, and a score that alone is larger plays as its single mix (judged by its `pcmBytes`, before any
  download). The cap counts every buffer: a bridge that does not fit is dropped, two scores that do not fit become a
  cut, stingers evict like scores; a stinger that does not fit beside the score is streamed, not decoded (3.7.1), so the
  cap holds after every operation.
- From one score to another, `audio.transitions` lands the new one on the old one's beat, bar, phrase or marker, after
  a bridge if any (3.6, `core/score.ts` `landing`).
- The music has three intents (3.6.1): `play` (the story's, with its transitions), `restore` (a loaded save: whatever
  plays stops at once and the saved track starts at its point, even when it is the one playing; no transition or bridge
  until the save is in place) and `stop`.
- The director owns what it schedules: a transition not landed yet is a plan (the old score, the bridge, the new score)
  that a stop, a restore or a new request cancels, so no bridge sounds after them; the old score is stopped by a timer,
  never by a stop scheduled up front.
- Voices duck one bus under everything it plays (bridges and stingers too), never the fades.
- A save's phase (`state.music`, written by the app, never read by the engine) resumes where it was; a score that falls
  back to its mix keeps the saved point.

> [!MEASURE id=music-e2e]
> `npm run e2e:music` renders thirty minutes offline with 0 samples of drift, plays 100 changes of mix with no click (a
> hard switch is caught), and measures the real-time jitter in Chromium and WebKit at 0.02 ms, all in CI. Since 3.6 it
> also checks transitions and the saved phase to the sample.
> - date: 2026-10-05
> - version: 3.5.0
> - volume: thirty minutes of rendered audio, 100 mix changes
> - conditions: Chromium and WebKit under Playwright in CI
> - source: [docs/en/ENGINE.md at the commit that added the director](https://github.com/Quest-n-Click/quest-n-click/blob/af2baa85a132266e87e75f0139f764cb6df492ca/docs/en/ENGINE.md)

How to write a score: [Music in stems](create.music.md).

<a name="cache"></a>

## Cache and responsiveness

**The service worker** (vite-plugin-pwa / Workbox, configured in [`vite.config.ts`](../../vite.config.ts)) keeps the
app shell cached from the first visit. Images, sounds, videos and the full fonts are kept on first use (cache first),
then served without the network; music is served in chunks (range requests) from the cache. The sealed ending's file
(`data/`) is always requested from the network first. A new version never activates on its own: the game asks the
player, after a durable save. What this means for a deployment (a sub-path, an update that does not show) is on [Sub-path, cache and service worker](create.deploy-issues.md).

**The warm-up.** From the title screen and after each room change, the engine warms in the background the current
room, the directly reachable rooms and their audio, in batches sized by `GameDef.assetBudgets`. Then, once per page,
**the rest of the game** (`GameDef.offline`, default `full`): every image, effect, voice, music track and video,
batch by batch during idle time, paused while the page is hidden. Nothing is fetched on a "save data" or 2G
connection; music and video wait for better than 3G. `offline: 'nearby'` keeps only the room-scoped warm-up.

**Cache busting.** Every image or sound address carries `?v=<hash>`: the hash changes as soon as a file in
`public/assets` changes, which bypasses the old cache.

**Offline, and saying so.** After the first visit the whole game plays offline, and the game says whether that is
true: the warm-up returns a status (`App.offlineStatus`, `offlineReady`):

| Status | Meaning |
|---|---|
| `complete` | Every file of the plan is in the cache |
| `partial` | With its reason: `network` (and the failed files), `save-data`, `slow`, `quota` (the browser reports less than 64 MB free before starting) |
| `skipped` | Nothing was tried: `worker` when the service worker never took control of the page in time (fetching would have cached nothing) |
| `off` | `offline: 'nearby'` |

The pause menu shows it (`ui.offlineStatus`: "312/400", "whole game cached", "312/400 ⚠ tap to retry"); a tap retries
a partial warm-up, and a file already in the Cache API is never fetched twice, so the warm-up resumes across reloads
with no state of its own. `npm run e2e:pwa` requires `complete`, then checks every file of the plan against the cache
offline and renders a room never visited (Chromium; WebKit cannot navigate offline under automation and reports
"skipped", exit 3, accepted only by the CI's `--allow-skip`).

> [!LIMIT id=nearby-needs-network]
> With `offline: 'nearby'`, a room never visited or warmed may still need the network.

<a name="why"></a>

## Why these choices

- **DOM rendering rather than Phaser** (ADR 0001). The validated mockups are in DOM (positioned images, crisp text,
  CSS for layout). An adventure scene holds about twenty images: the DOM handles that easily, and the interface (verbs,
  inventory, menus) stays in CSS. The core does not depend on the renderer: another painter can replace it without
  touching the content, as the Canvas painter did (ADR 0012). Phaser and a general physics engine stay out (D10): they
  would duplicate the engine's scenes, input, camera and assets, and a simulated collision cannot be saved, replayed or
  proved.
- **Content as data** (ADR 0002): no functions in the content, so it can be validated (`npm run validate`), solved
  (`npm run solve`) and saved.
- **Rendering is not a source of state** (ADR 0011, D21): one pure frame, intents as the only way back, a journal in
  ids. A painter, a test or a screen reader all read the same frame.
- **Libraries**: Howler (audio, iOS unlock), earcut and navmesh (paths), Tweakpane (dev tools), Vite, Vitest,
  Playwright.

<a name="trade-offs"></a>

## Trade-offs

- The DOM painter is the reference, but it does not draw the whole stage (no lights, particles or mask occluders):
  a room that needs them asks for Canvas.
- A room's asset scope over-approximates a visit, so a room can preload files a given visit does not show; the
  opposite (a request outside the prediction) fails `npm run e2e:weight`.
- Stems need memory: a device under the thresholds plays the single mix, and a score bigger than the cap always does.
- The full offline warm-up downloads the whole game once; `offline: 'nearby'` saves that, at the cost of needing the
  network for rooms not visited.

<a name="decisions"></a>

## Decisions and ADRs

- [ADR 0001, DOM renderer](../../docs/dev/adr/0001-dom-renderer.md)
- [ADR 0002, declarative content](../../docs/dev/adr/0002-declarative-content.md)
- [ADR 0011, scene frame, intents, journal](../../docs/dev/adr/0011-scene-frame-intents-journal.md) (D21)
- [ADR 0012, Canvas backend](../../docs/dev/adr/0012-canvas-backend.md)
- [ADR 0014, objectives](../../docs/dev/adr/0014-objectives.md)
- [Decisions](../../docs/dev/DECISIONS.md) (D10: a Canvas painter beside the DOM reference, Phaser out)
- To write a game: [Your first game](create.first-game.md); the commands: [npm scripts](reference.npm-scripts.md); the
  prompts for consistent art: [Images](create.images.md).
