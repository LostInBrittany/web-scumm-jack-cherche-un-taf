# Public API

What a game, a host page and a game's own tests may import from the engine: five entry modules and the
`quest-n-click` command. Their names are the contract; everything else under `src/engine` is internal. The
[Signatures](#signatures) part at the end is generated from the sources.

<a name="overview"></a>

## The contract

Since 4.0 a game, a host page and a game's tests use the entry modules and the `quest-n-click` command. Their names are
the contract: [`tests/api-surface.json`](../../tests/api-surface.json) lists them,
[`tests/api-surface.test.ts`](../../tests/api-surface.test.ts) fails when one changes without the documentation, and
[start.stability.md](start.stability.md) says how a change is made (announced in the CHANGELOG, then removed at the next
major version). Everything else under `src/engine` is internal and may change in any release; the `@engine/*` alias
still reaches it, without that promise.

- **In a created project** the entries are `@quest-n-click/engine/content`, `@quest-n-click/engine/player`,
  `@quest-n-click/engine/minigames`, `@quest-n-click/engine/testing` and, since 4.1.1, `@quest-n-click/engine/reality` (the package's
  `exports`).
- **In the engine repository** the same names resolve to [`src/engine/api/`](../../src/engine/api/).
- The old names `web-scumm/content` and the others (before 4.2.5, decision D47) resolved through 4.2.x and are removed
  in 4.3.0: `quest-n-click migrate` renames them.
- The save envelope's `web-scumm-save` and the other `format` strings of the files are format identifiers from
  web-scumm, kept so existing saves and files still load.

Each exported name carries one stability tag on its declaration: `@public` (a name a game or a host calls or reads) or
`@extension` (a contract a game or a host implements, such as a `Presenter`, a save store or a minigame: a member added
to it is a breaking change too). The [Signatures](#signatures) tables show it, and list every export: the tables
below group the main names by what they are for, and leave some out (the IR and fingerprint helpers such as `compileIR`,
`fingerprintGame` and the `Ir*` types, `ObjectiveDef`, the minigame transcripts, `WorldSignalV2`).

<a name="content"></a>

## `@quest-n-click/engine/content`: writing a game

| Name | What |
|---|---|
| `defineGame` | declares the game (`GameDef`); with `schemaVersion: 3`, compiled and frozen |
| `defineRoom` | declares a room (`RoomDef`) |
| `compileGame` | the compiled, frozen game a host or a tool runs (`defineGame` already calls it for schema 3) |
| `GameSource` · `CompiledGame` | a game as written, and as compiled |
| `EMPTY_LAYOUT` · `FLOOR` · `NEAR` | the layout of a room nobody placed yet, the default floor line, the default "near" distance |
| `GameDef` | the whole game: verbs, characters, items, rooms, rules, audio, skin, budgets, migrations, texts |
| `RoomDef` | a room: backdrop or stage, props, hotspots, actors, exits, reactions, hints, scripts |
| `Id` · `Value` · `Point` | an id, a flag's value, a point of the 640 × 400 scene |
| `Cond` | a condition (`'flag'`, `'!flag'`, `{ has }`, `{ flag, eq }`, `{ not }`, `{ all }`, `{ any }`…) |
| `Cmd` | a command of a reaction or a script (`say`, `set`, `gain`, `goto`, `minigame`…) |
| `Who` · `WalkTarget` · `ListLine` | who speaks, where to walk, a line of a list the engine draws from |
| `Choice` · `TalkTopic` | a dialogue choice, a conversation topic |
| `VerbId` · `VerbDef` | a verb's id, a verb as the interface shows it |
| `Rule` · `KindRule` · `EventRule` | a written reaction, a reaction by kind, a listener on an emitted event |
| `Action` | a player action: verb, a, b |
| `CharacterDef` · `SpriteSet` · `MouthSet` | a character, its poses, its mouths |
| `ItemDef` | an inventory item |
| `PropDef` · `PropAnim` · `ActorDef` · `HotspotDef` · `ExitDef` | what a room holds (each may name the `defaultVerb` of a double tap, 4.0) |
| `HintDef` · `ScriptDef` | a room's hints, a script of the world |
| `StageDef` · `StageLayer` · `LightDef` · `EmitterDef` · `TransitionKind` | the staged room (layers, lights, particles, transitions) |
| `MapDef` · `MapRegion` · `PlaceDef` | the travel map |
| `GameRules` | rules shared by every room |
| `AudioDef` · `ScoreDef` · `ScoreState` | music, sounds, voices; a score's stems and which sound when |
| `EndingDef` | the sealed ending |
| `RealityDef` · `SignalDef` · `RealityState` · `ExternalEntry` | signals from the world outside through a Reality Bridge (4.1.1, [bridge.signals-manifest.md](bridge.signals-manifest.md)): what a game declares, what a save keeps of the link, a signal as a session entry |
| `RevealDef` | **deprecated** (4.0): the old name of `EndingDef`; removed in 5.0 |
| `SkinDef` · `UiTexts` | the interface's images and sounds, its texts |
| `Migration` | one step of save migration (renames, drops) |
| `Layout` | a room's geometry, written by the placement editor |
| `GameState` · `Session` · `SessionEntry` | the state a save holds, a replayable session and its inputs (`Session.seed`, 4.1.14: the run's seed when a host chose it) |
| `SpeedrunManifest` · `SpeedrunCategory` · `SpeedrunSplit` · `SpeedrunTrigger` · `SemanticTrigger` | (4.1.14, [create.speedrun.md](create.speedrun.md)) `GameDef.speedrun`: categories (timing, start and finish triggers, saves, pauses, hints, reload, Reality policy, fingerprint components, inputs, seed), splits on semantic events, the rules' version |
| `CustomCommand` · `CustomCommands` · `CustomContext` | a game's own commands (`{ custom }`), the escape hatch, and what they receive |
| `VariationManifest` · `VariationMode` · `VariationDimension` · `VariationConstraint` · `AnchorDef` · `AnchorRef` · `CoupledPair` · `RemixText` · `parseManifest` · `variantFlag` · `REMIX_ALGORITHM_VERSION` | (4.1.15, ADR 0018) what may vary between two games of one (`GameDef.remix`, `RoomDef.anchors`, [create.remix.md](create.remix.md)), its schema, the reserved flag a dimension writes, the generator's version |
| `compileManifest` · `CompiledManifest` · `RemixWorld` · `catalogue` · `CATALOGUE_MAX` · `RemixManifestError` | (4.1.15) a manifest compiled against the game (domains, constraints, anchors), a catalogue mode's every world, the build error that lists why a manifest cannot make a world |
| `compileVariant` · `storyVariant` · `loadVariant` · `WorldVariant` | (4.1.15) the world a seed makes (`GameIR + VariationManifest + seed + algorithmVersion`), the story's, a stored one checked and kept as it is |
| `applyVariant` · `applyStory` · `ApplyOptions` · `compileGameManifest` · `remixWorld` | (4.1.15) the game as a world makes it: reserved flags, actors' starts, codes and hints in every text, presentation values |
| `normalizeSeed` · `encodeSeedCode` · `isSeed` · `newSeedCode` · `STORY_SEED` · `RemixSeedError` | (4.1.15) seed codes `WS-XXXX-XXXX` (Crockford base32 and a check symbol), the story's seed, an explicit error for a malformed one |
| `generateWheel` · `checkWheel` · `wheelProblems` · `wheelTable` · `CodeWheel` · `CodeWheelParams` · `CodeWheelMode` · `WheelItem` · `WheelRecord` · `CODE_WHEEL_VERSION` | (4.1.15, §11.13) the code wheel a seed draws (the `copy-protection` stream), its single solution, its table, what a played wheel records |

<a name="player"></a>

## `@quest-n-click/engine/player`: starting the game in a page

| Name | What |
|---|---|
| `bootGame` | starts the game in the page (`BootOptions`: the game module, the root element, the service worker) |
| `BootOptions` · `SwModule` | its options, the service worker's registration module |
| `Locales` · `pickLanguage` | the translations a game ships, which one a visit gets |
| `openStore` · `StoreOpener` | the save store a page opens (IndexedDB, else localStorage), and how to supply another |
| `SaveStore` · `SlotStore` | the autosave store and the manual slots a host may provide |
| `Presenter` | what the engine asks of a front end (a line said, a choice, a walk, a minigame) |
| `AssetManifest` | `assets.gen.json`: the images, their sizes, the audio files |
| `SceneRenderer` | the painter contract (the DOM and canvas painters implement it) |
| `SpriteSpec` · `LayerSpec` · `OccluderSpec` · `LightSpec` · `EmitterSpec` · `StageSpec` | what a painter is given to draw |
| `SceneFrame` · `Renderer` · `Intent` | (4.1.11) an immutable picture of a room with its precomputed hit polygons, the contract of whatever draws one, and the intentions it answers with: the only thing a renderer sends back (D21) |

<a name="minigames"></a>

## `@quest-n-click/engine/minigames`: minigames as plugins

| Name | What |
|---|---|
| `Minigame` | the contract: `run(ctx)`, and what the validator reads (`required`, `textParams`, `bindings`) |
| `MinigameCtx` | what a minigame is given: its zone, images, sounds, parameters, labels, an abort signal |
| `minigames` | the built-in ones (pipes, stroke, pick, hide, runner, scratch, cables), each loaded when it starts |
| `MINIGAME_CSS` | their shared style |

A game adds its own in its module's `minigames` (same contract): that is the plugin format.

How to write one: [create.custom-minigame.md](create.custom-minigame.md).

<a name="testing"></a>

## `@quest-n-click/engine/testing`: a game's own tests

| Name | What |
|---|---|
| `Engine` | the engine without a page (its members marked `@internal` are read by the modules of `core/` since 4.1.0: not part of the contract). Since 4.1.4: `destroy()` ends it (loops stopped, waiters released, nothing called back); `onError(error, where)` hears a script that threw (stopped, `scripts[id].off`) or a custom command that changed more than it declared; `beforeSave(state)` shapes what the store writes, `onLoad.before/after` frame a load; `clock` is the only time it knows (`started`, the trace, a session's date) |
| `FakePresenter` · `MemoryStore` | a front end that answers by script, a save store in memory |
| `solve` · `SolveOptions` · `SolveResult` | the solver: a way to the end, softlocks with `prove` |
| `parseSave` · `saveEnvelope` · `SaveEnvelopeV3` | a save's envelope: write it, read it back (migrations applied) |
| `SaveEnvelopeV4` · `upgradeEnvelope` · `SaveWorldMismatch` · `savedWorld` | (4.1.15) the save envelope with its world, the v3 → v4 migration (the story world), the error that names the world a save belongs to, the world a raw save names |
| `worldVerdict` · `MYSTERY_START_WINDOW_MS` · `leaderboardKey` · `REMIX_CATEGORIES` · `RemixCategoryRules` · `SpeedrunSeedPolicy` · `WorldEvidence` · `seedCommitment` · `logicalKey` | (4.1.15, D26) a run's world checked against its category (Story, Fixed, Random, Mystery, Daily), the leaderboard it goes to, a Mystery commitment, the key a proof certificate is filed under |
| `SemanticEvent` · `SemanticJournal` | (4.1.11) `Engine.journal`: what happened in the game, in ids, numbered (rooms, items with the player who lost or acquired them, flags, `null` for a flag removed, a player switch, the ending, loads and saves), emitted by the core alone and the same on a replay |
| `RunClock` | (4.1.14, ADR 0016) `Engine.runClock`: RTA (`monotonicNow`, never an authority), `logicalSteps` and `logicalTime` (bigints, microticks): it observes the core, never writes the state |
| `verifyRun` · `VerifyContext` · `SpeedrunVerifyResult` · `SpeedrunVerdict` · `isRankable` | (4.1.14, ADR 0017) a `.wsrun` replayed against the approved game: one verdict, a code, a reason, the trust it grants; only `valid` ranks, `inconclusive` never does |
| `SpeedrunEnvelope` · `TrustLevel` | (4.1.14) a run's proof (chunks chained from H0, final state hash, final proof, bigints as decimal strings) and how far it is believed (`local` → `replay-valid` → `server-witnessed` → `moderator-verified`) |

<a name="reality"></a>

## `@quest-n-click/engine/reality`: signals from the world outside (4.1.1)

The signed signal and its verification, the client and its HTTP transport, the simulator, the manifest. A game with its
own transport implements `WorldSignalPort`. What a game declares and how a Bridge checks it:
[bridge.signals-manifest.md](bridge.signals-manifest.md).

| Name | What |
|---|---|
| `verifySignal` · `SignalExpectation` · `VerifyResult` · `RefusalCode` | a signed signal checked before it is read: size, algorithm, key, signature, then game, player, manifest, expiry; a refusal has a code |
| `signSignal` · `importBridgeKey` · `BridgeKey` · `Keyring` | signing as a Bridge does (tests, simulators); a Bridge's public key and the set the player trusts |
| `WorldSignalV1` · `WorldSignalV1Schema` · `SignedWorldSignalV1` · `MAX_SIGNAL_CHARS` | the payload and its schema, the compact JWS that carries it, its size limit |
| `WorldSignalPort` | where signals come from: a Bridge's transport, the simulator, a game's own |
| `RealityClient` · `RealityClientOptions` | verify, apply, wait for the durable save, acknowledge |
| `httpPort` · `HttpPortOptions` | the transport to a Bridge: Server-Sent Events read with fetch, or a fetch by cursor |
| `SignalSimulator` · `Fault` · `SimulatedDelivery` | a Bridge in the browser for the Studio and the tests: delays, duplicates, order, bad signatures, expiry, cuts |
| `realityManifest` · `manifestHash` · `RealityManifest` | the signals a game declares, as the Bridge checks them, and the hash its configuration keeps |
| `verifyDayToken` · `verifyCommitment` · `revealMatches` · `DayToken` · `CommitToken` · `TokenResult` | (4.1.15, D26) the daily challenge's signed seed and a Mystery commitment, checked offline with the key of the game's manifest, and a reveal against its commitment |

<a name="beside-the-modules"></a>

## Beside the modules

- **Authoring schema**: `schemaVersion: 3` in `defineGame`; `quest-n-click migrate` (in a created project) brings an
  older game to it.
- **Saves**: the envelope `web-scumm-save` schema 3; every save of the 3.x line loads in 4.x
  ([`tests/save-v3.test.ts`](../../tests/save-v3.test.ts) keeps one per release).
- **Studio and MCP**: the tools of `npm run mcp` are described by their schemas
  ([studio.mcp-tools.md](studio.mcp-tools.md)); their names and their required and optional arguments are in
  `tests/api-surface.json` (`mcp`): a tool removed or a required argument added is an API change like any other.
- **Command line**: `quest-n-click <command>` and its options ([reference.cli.md](reference.cli.md)).

<a name="signatures"></a>

## Signatures

One table per entry, one line per export, read from the sources with the TypeScript compiler
([`tools/api-doc.ts`](../../tools/api-doc.ts)): the signature (a wider one is cut at 160 characters: the page is a map,
the source is the territory), the declared stability, and the first sentence of the declaration's doc comment, in
English as the source writes it. To regenerate it, in the engine repository, from its root folder:

```sh
# in the engine repository
npm run wiki -- generate engine.api
```

`npm run wiki -- check` fails when it is behind the code, or when an export has no description or no stability.
`npx tsx tools/api-doc.ts` (`--check` to only check) writes it again, as `npm run wiki -- generate engine.api` does, and
[`tests/api-doc.test.ts`](../../tests/api-doc.test.ts) checks it.

<!-- generated:begin -->

<a name="content-reference"></a>

### @quest-n-click/engine/content

| Name | Signature | Stability | Doc |
|---|---|---|---|
| `Action` | `interface { verb, a, b }` | public | A player action: VERB a (with/to b). `a` can be an inventory item, `b` is always a target. |
| `ActorDef` | `interface { defaultVerb, char, interactive, pose, facing, visible, … 1 more }` | public | A character standing in a room: which one, its pose and facing, and when it shows. |
| `AnchorDef` | `interface { at, visible, reachableBy, capacity, phase }` | public | A tagged spot of a room where an item can be placed (`RoomDef.anchors`): the prop or hotspot it stands on (`at`), when it shows, what it tak |
| `AnchorRef` | `interface { room, anchor }` | public | An anchor named from anywhere: its room and its id in `RoomDef.anchors`. |
| `ApplyOptions` | `interface { lang }` | public | Options of `applyVariant`: the language the texts are in. |
| `applyStory` | `(game: GameDef, o?: ApplyOptions): GameDef` | public | The game's story world applied (codes and hints at their story values): what a game without a chosen seed plays. |
| `applyVariant` | `(game: GameDef, variant: WorldVariant, o?: ApplyOptions): GameDef` | public | The game as the world `variant` makes it: a copy, the reserved flags in `start.flags`, actors' starting rooms, codes and hints in every text |
| `AudioDef` | `interface { music, sfx, voices, voicesByLang, scores, maxDecodedMB, … 1 more }` | public | The game's music, sounds and voice clips by id, its scores in stems and the transitions between them. |
| `canonicalJson` | `(v: unknown): string` | public | The canonical JSON text of plain data (objects, arrays, strings, numbers, booleans, null, bigints): NFC strings, sorted keys, no `-0`, big i |
| `catalogue` | `(c: CompiledManifest, modeId: string): Record<string, unknown>[]` | public | Every logical world of a catalogue mode, in a fixed order (the product of its dimensions' domains, the others at their story value, filtered |
| `CATALOGUE_MAX` | `number` | public | The largest catalogue a mode may enumerate (D25): beyond it, the mode is a generator with a published sample. |
| `CharacterDef` | `interface { name, description, color, height, sprites, portrait, … 11 more }` | public | A character: its name, dialogue colour, poses, mouths and portrait, its kinds, and the variants its state selects. |
| `checkWheel` | `(w: CodeWheel): string[]` | public | The wheel's solution, checked the way a player reads it (turn, then read): a solution exists, it is unique (one rotation aligns the pair), a |
| `Choice` | `interface { id, text, if, once, img, do }` | public | One answer the player may pick in a `{ choice }` command: its text, when it is offered, what it runs. |
| `Cmd` | `type Cmd = union of 56` | public | A command. A plain string = the hero says this line. Command lists run in order, each one waiting for the previous one to finish. |
| `CODE_WHEEL_VERSION` | `number` | public | The wheel's layout version: a stored record of another version is replayed as it is, never regenerated. |
| `CodeWheel` | `interface { version, seed, n, outer, track, inner, … 3 more }` | public | A wheel as a seed makes it: the order of each disc, the windows' offsets, the question and its answer. |
| `CodeWheelMode` | `type CodeWheelMode = 'parody' \| 'story' \| 'strict' \| 'cosmetic' \| 'disabled' \| 'daily'` | public | How the check behaves (§11.13): `parody` (the default) lets the player through after a few funny refusals. |
| `CodeWheelParams` | `interface { actors, symbols, answers, mode, tries, seed }` | public | What an author writes in `{ minigame: 'code-wheel', params }`. |
| `CodeWheelTranscript` | `interface { v, wheel, answers, end }` | public | What a minigame records so its result can be computed again (4.1.17, D31, ADR 0020): the code wheel's answers, by their place in the list it |
| `CompiledGame` | `type CompiledGame = Readonly<GameDef>` | public | A game as `compileGame` returns it: normalised and, for schema 3, frozen. |
| `CompiledManifest` | `interface { manifest, hash, dims, order, anchors, modes }` | public | A manifest compiled once: its hash, its dimensions with their domains, its modes. |
| `compileGame` | `(source: GameSource): CompiledGame` | public | Compiles authoring data once into the single normalised representation consumed by the engine and tools. The source is never mutated; genera |
| `compileGameManifest` | `(game: GameDef): CompiledManifest` | public | The game's manifest compiled (an empty one for a game without `remix`). Throws `RemixManifestError`. |
| `compileIR` | `(game: CompiledGame, o: CompileIROptions): GameIR` | public | The IR of a compiled game (ADR 0013): pure and deterministic. Rules without an id (v2 content) are named by their position, as the puzzle gr |
| `CompileIROptions` | `interface { extensions, engine, sources }` | public | Options of `compileIR`: the extensions, the engine's version, and the sources for the provenance. |
| `compileManifest` | `(manifest: VariationManifest, world: RemixWorld): CompiledManifest` | public | Compiles a manifest against the game's world: every reason it cannot produce a world is collected and thrown together (`RemixManifestError`) |
| `compileVariant` | `(world: RemixWorld \| CompiledManifest, manifest: VariationManifest, seed: string, algorithmVersion?: number, modeId?: string): WorldVariant` | public | The world of a seed: `GameIR + VariationManifest + seed + algorithmVersion → WorldVariant` (ADR 0018). `story` (the seed or the mode) gives  |
| `completionGoal` | `(game: GameDef): Cond[]` | public | The solver's 100% goal (`npm run solve -- --goal=100%`): the `done` of every objective that is not optional, all holding at once in one stat |
| `Cond` | `type Cond = union of 13` | public | A condition. |
| `CoupledPair` | `interface { hint, answer }` | public | One coupled pair: the hint the player reads and the answer the content accepts, chosen together or not at all. |
| `CustomCommand` | `interface { effects, pure, run }` | extension | A command a game defines in code: its effects on the state as plain commands, and its browser-only `run`. |
| `CustomCommands` | `type CustomCommands = Record<string, CustomCommand>` | extension | A game's custom commands by name, as `games/<id>/index.ts` exports them. |
| `CustomContext` | `interface { game, state, room, args, ui, scene, … 1 more }` | extension | What a custom command's `run` receives: the game, its state, the room, the arguments, the presenter and the scene element. |
| `defineGame` | `(game: GameDef): GameDef` | public | Declares the full game. |
| `defineRoom` | `(room: RoomDef): RoomDef` | public | Declares a room. Does nothing but type it: autocomplete guides the writing. |
| `EmitterDef` | `interface { id, kind, image, color, rate, visible }` | public | A particle source of the staged room (dust, rain, snow, sparks, smoke, leaves) and its rate. |
| `EMPTY_LAYOUT` | `Layout` | public | Empty layout, when the room hasn't been placed in the editor yet. |
| `encodeSeedCode` | `(v: number): string` | public | A 35-bit value (0 ≤ v < 2^35) as its `WS-XXXX-XXXX` code. |
| `EndingDef` | `interface { file, password, guess, scratch, card }` | public | Sealed ending (`ending` module): encrypted content, decrypted at the end of the game and shown on a card. |
| `EventRule` | `interface { id, on, if, once, do }` | public | A listener: when `on` is emitted (`{ emit }`) and the condition holds, `do` runs. `once`: only the first time. |
| `ExitDef` | `interface { defaultVerb, name, to, entry, if, locked, … 6 more }` | public | A way out of the room, declared rather than written as a hotspot plus a rule. The engine turns it into exactly that (core/define.ts `normali |
| `ExtensionHashes` | `interface { trusted, commands, minigames, plugins }` | public | What `compileIR` is told of the trusted code: its hash (`hashSources` over the extension files, given by the build or a tool; '' when unknow |
| `ExternalEntry` | `interface { id, sequence, signal, source, receivedAt, playerId, … 2 more }` | public | What a session keeps of a signal from outside (4.1.1): its id and sequence on the Bridge, the signal, the source and when it arrived. Never  |
| `FLOOR` | `number` | public | Default floor bottom (logical y), when the layout doesn't give `floor`. |
| `GameDef` | `interface { schemaVersion, id, title, lang, saveVersion, renderer, … 37 more }` | public | The whole game as written: verbs, characters, items, rooms, rules, audio, skin, budgets, migrations and texts. |
| `GameIR` | `interface { schema, engine, gameId, world, rooms, entities, … 7 more }` | public | The intermediate representation of a game (schema 1): its logic as plain data, the provenance of its ids, the trusted extensions by name, an |
| `GameRules` | `interface { fallbacks, kinds, on }` | public | The rules shared by every room: fallback responses per verb, reactions by kind, rules valid everywhere. |
| `GameSource` | `type GameSource = GameDef` | public | A game as its sources write it: a `GameDef` before compilation. |
| `GameState` | `interface { v, room, inventory, flags, props, actors, … 15 more }` | public | The state of a game in progress, serialised as-is in a save: room, inventory, flags, props, actors, counters, scripts. |
| `generateWheel` | `(p: CodeWheelParams, seed: string, id?: string): CodeWheel` | public | The wheel of a seed (the `copy-protection` stream of `<seed>\|code-wheel\|<id>`). Throws on parameters `wheelProblems` refuses. |
| `HintDef` | `interface { id, until, lines }` | public | A hint the hint item gives while its `until` condition is false, as lines said in order. |
| `HotspotDef` | `interface { defaultVerb, name, kind, visible, exit, onTap }` | public | A named zone of the room the player can act on; its geometry lives in the layout. |
| `Id` | `type Id = string` | public | An identifier in the content (a room, an item, a flag, a character, a prop…): a plain string the game chooses. |
| `IrEntity` | `interface { key, kind, id, room, name, kinds, … 12 more }` | public | A thing of the game: a prop, an actor or a hotspot of a room, an item, a character. |
| `IrExtensions` | `interface { trusted, commands, minigames, plugins }` | public | The trusted code a game names (ADR 0002): custom commands with their declared effects, minigames, plugins. |
| `IrObjective` | `interface { id, title, done, optional, parent }` | public | An objective (ADR 0014): its title, the condition that completes it, whether 100% needs it, its parent. |
| `IrRealityPolicies` | `type IrRealityPolicies = Omit<RealityDef, 'bridge'>` | public | What the game declares of the world outside, its Bridge's address left out (deployment, not logic). |
| `IrRoom` | `interface { id, name, hero, look, hints, exits, … 3 more }` | public | A room as logic: its name, looks, hints, exits and the conditions of its walk links; its entities by key. |
| `IrRule` | `type IrRule = union of 5` | public | A reaction of the game: a written rule, a topic, a listener, a reaction by kind or a verb's fallback lines. |
| `IrScript` | `interface { id, scope, trigger, while, loop, do, … 1 more }` | public | A sequence of commands that runs without a player's action: a world script, a room's arrival, the intro. |
| `IrSource` | `interface { file, line }` | public | Where an id is written: a file relative to the working directory, and its line (from 1). |
| `IrVariantSlot` | `interface { mode, id, manifest, variant }` | public | A world variant of the story (4.1.15 "Remix", ADR 0018): filled when the game was compiled from an instance (`applyVariant`): `id` is the va |
| `IrWorld` | `interface { schemaVersion, saveVersion, hero, players, hintItem, hintVoice, … 8 more }` | public | The game's world: its hero and players, verbs, start, map, checkpoints, invariants, saves. |
| `isSeed` | `(input: string): boolean` | public | Whether a string is a well-formed seed (a code with its check symbol, or `story`). |
| `ItemDef` | `interface { name, icon, look, kind }` | public | An inventory item: its name, its icon, its look lines and its kinds. |
| `KindRule` | `interface { id, verb, kind, target, item, say }` | public | Reaction by "kind": applies to anything with this `kind` (e.g. `person`, `cat`), before fallback responses. `target` targets a specific id ( |
| `Layout` | `interface { width, floor, walk, scale, entries, hotspots, … 8 more }` | public | A room's geometry, written by the placement editor: walk areas, entries, and where every hotspot, prop, actor, layer and light stands. |
| `LightDef` | `interface { id, kind, color, intensity, blend, visible }` | public | A light of the staged room: a radial pool at its layout position, or an ambient colour over the whole room. |
| `ListLine` | `type ListLine = string \| { id: Id; text: string; }` | public | One line of a list the engine draws from (a look list, a hint, the fallback answers): a plain string, keyed by its position in translations, |
| `loadVariant` | `(c: CompiledManifest, input: unknown): { variant: WorldVariant; stale: boolean; }` | public | A stored variant (a save's, a session's, a speedrun's) checked and kept as it is: its hash must match its content; it is never regenerated,  |
| `logicView` | `(ir: GameIR): Omit<GameIR, "engine" \| "provenance">` | public | The part of the IR the fingerprint's `logic` hashes: everything but the engine's version, the provenance (a line added above a rule moves no |
| `MapDef` | `interface { regions, start, places, music, vehicles }` | public | The travel map: its regions, its places and the region shown first. |
| `MapRegion` | `interface { name, image, parent, frame }` | public | A region of the travel map: its image, its parent region and its frame on it. |
| `Migration` | `interface { from, renameFlag, renameItem, renameRoom, renameProp, renameActor, … 12 more }` | public | One step of save migration: from version `from` to `from + 1`. Keys are old ids, values new ones. |
| `MinigameOutcome` | `interface { result, transcript }` | public | A minigame's result and, when it can prove it, its transcript (4.1.17). |
| `MinigameResult` | `type MinigameResult = 'won' \| 'passed' \| 'skipped' \| 'failed' \| 'disabled'` | public | How a minigame that says so ended (4.1.16): won, let through (`passed`, a parody's mercy), skipped, lost (`failed`, the story goes on with i |
| `MinigameTranscript` | `type MinigameTranscript = CodeWheelTranscript` | public | A minigame's transcript (4.1.17: the code wheel's only). |
| `MouthSet` | `interface { closed, open, blink, smile }` | public | Mouth images for a pose: the body doesn't move while speaking, only the mouth changes. `closed` replaces the idle pose's image (t1), `open`  |
| `NEAR` | `number` | public | Distance (logical units) beyond which a saved approach point is considered stale and recomputed. |
| `newSeedCode` | `(): string` | public | A fresh code from WebCrypto (the Remix button). No WebCrypto: an error, never a guessable draw. |
| `normalizeSeed` | `(input: string): string` | public | The canonical form of a typed code (`ws-abcd-efgh`, `WSABCDEFGH`, with `I`/`L`/`O` read as digits), or a `RemixSeedError` that says what is  |
| `ObjectiveDef` | `interface { title, done, optional, parent }` | public | An objective of the game (4.1.12, ADR 0014): its title in the quest journal, the condition that completes it, whether 100% needs it, and the |
| `parseManifest` | `(input: unknown): VariationManifest` | public | A manifest checked against its schema (a malformed one is an error naming the path). |
| `PlaceDef` | `interface { name, room, region, pos, portrait, joins, … 2 more }` | public | A place on the travel map: the room it opens, its region and position, its vehicle and its news marker. |
| `Point` | `type Point = [number, number]` | public | Logical coordinates of a backdrop: 640 × 400, origin top-left. |
| `PropAnim` | `interface { frames, fps, loop, at }` | public | A prop animation: images in order at `fps` (default 8); `at` = commands run when a frame is reached (index). |
| `PropDef` | `interface { defaultVerb, img, states, anims, initial, name, … 2 more }` | public | A prop in the scenery, with states (e.g. amp off/on). Its position comes from the layout. |
| `provenanceOf` | `(ir: GameIR, sources: Readonly<Record<string, string>>): Record<string, IrSource>` | public | Where each id of the IR is written in the sources (path → text), read from their object-literal keys (core/source-keys.ts: strings and comme |
| `RealityDef` | `interface { signals, bridge, connectors }` | public | The game's link to the world outside: the signals it declares and the Reality Bridge it pairs with. |
| `RealityState` | `interface { playerId, cursor, applied }` | public | What a save keeps of the link (`GameState.reality`): no token, no email, no payload. |
| `REMIX_ALGORITHM_VERSION` | `number` | public | The generator's version: bumped when a single assignment of a given seed would change (ADR 0018). |
| `RemixManifestError` | `class RemixManifestError` | public | A manifest that cannot produce a world: a build error, with every reason. |
| `RemixSeedError` | `class RemixSeedError` | public | A seed refused: malformed, a wrong check symbol, an unknown algorithm version. |
| `RemixText` | `type RemixText = string \| Readonly<Record<string, string>>` | public | A text in the game's language, or one per language (`{ en, fr }`): what a coupled hint shows. |
| `remixWorld` | `(game: GameDef): RemixWorld` | public | What the compiler reads of a game definition: its rooms' anchors and every rule with an id. |
| `RemixWorld` | `interface { rooms, rules }` | public | What the compiler reads of the game: its rooms' anchors and its rules (a `GameIR` is one). |
| `RevealDef` | `type RevealDef = EndingDef` | public (deprecated) | The old name of `EndingDef`. |
| `RoomDef` | `interface { id, name, decor, description, furniture, music, … 15 more }` | public | A room: its backdrop or stage, props, actors, hotspots, exits, look lines, reactions, topics, hints and scripts. |
| `Rule` | `interface { id, verb, a, b, if, do, … 1 more }` | public | A written reaction: "when VERB is done on A (with/to B), if CONDITION, then …". `a` and `b` accept a list: the rule works with any of them.  |
| `ScoreDef` | `interface { stems, bpm, beatsPerBar, loop, states, quantize, … 4 more }` | public | A score in stems: its files, its tempo and loop, and which stems sound in each game state. |
| `ScoreState` | `interface { if, stems }` | public | Which stems sound in a given state: the first entry whose condition holds wins (`if` absent: always). |
| `ScriptDef` | `interface { id, while, loop, do, stepIds }` | public | A script of the world: it runs on its own, without a player action, one command at a time, in the gaps between the player's actions (never d |
| `SemanticTrigger` | `interface { event, room, item, flag, value, objective, … 3 more }` | public | A semantic trigger: the first event of this kind (and these fields, when given) in the run's journal. A room entered, an item acquired or lo |
| `Session` | `interface { v, start, base, log, at, seed, … 1 more }` | public | A player's inputs since the game started or a save was loaded, with the state they started from: enough to replay them. |
| `SessionEntry` | `type SessionEntry = union of 9` | public | One input of a session (`Engine.session`). The answers given while it ran (`picks`, `maps`, `rnd`) are what makes it replayable; `ran` lists |
| `SignalDef` | `interface { id, source, availability, replay, once, fallback }` | public | A signal the game may receive from the world outside: its id, source, availability, replay mode and fallback. |
| `SkinDef` | `interface { icons, sounds, fonts, heights, callPoses, pixelArt }` | public | UI skin: everything the engine shows or plays without the content referencing it. Image ids come from the manifest; sounds are ids from `aud |
| `SpeedrunCategory` | `interface { id, name, timing, start, finish, allowSaves, … 8 more }` | public | A speedrun category: what counts as a run, how it is timed, what it may do. `timing` names the time it is ranked on: `rta` (the wall clock,  |
| `SpeedrunManifest` | `interface { categories, splits, rulesVersion }` | public | The game's speedrun manifest (`GameDef.speedrun`): categories, splits, and the version of the rules (a change never silently requalifies an  |
| `SpeedrunSplit` | `interface { id, name, at, parent }` | public | A split: a semantic trigger, a name, and the split it is a step of. |
| `SpeedrunTrigger` | `type SpeedrunTrigger = SemanticTrigger` | public | A category's start or finish: a semantic trigger. |
| `SpeedrunWorldPolicy` | `interface { policy, mode, fixedSeed, codeWheel }` | public | Which world a category's runs are played in (4.1.16, D29, ADR 0019): `story` (no logical variation), `fixed` (the published `fixedSeed`), `r |
| `SpriteSet` | `type SpriteSet = Record<string, Id[]>` | public | A set of images for a character: pose → list of images (looped). |
| `StageDef` | `interface { layers, lights, emitters, transition, links }` | public | What a room shows beyond its backdrop: layers, lights, particles, its transition and the logic of its walk links. |
| `StageLayer` | `interface { id, image, role, visible }` | public | A picture of the room: `backdrop` behind everything, `scenery` among the characters (depth from its layout `z`), `foreground` in front of th |
| `STORY_SEED` | `string` | public | The seed of the author's world: no variation, every dimension at its story value. |
| `storyVariant` | `(manifest: VariationManifest \| undefined, world: RemixWorld): WorldVariant` | public | The story world of a game: every dimension at its story value (an empty manifest gives an empty assignment). |
| `TalkTopic` | `interface { id, topic, if, do }` | public | A conversation topic offered when talking to an actor: its line, when it is offered, what it runs. |
| `TransitionKind` | `type TransitionKind = 'cut' \| 'fade' \| 'wipe'` | public | How a room appears when entered: a cut, a fade or a wipe. |
| `UiTexts` | `interface { walkTo, newGame, continue, confirmErase, yes, no, … 84 more }` | public | Every text the interface shows (menus, confirmations, settings), so a game speaks its own language. |
| `Value` | `type Value = boolean \| number \| string` | public | What a flag holds: a boolean, a number or a string. |
| `variantFlag` | `(dimension: string, group?: string): string` | public | The reserved flag a logical dimension writes (`remix.<id>`; a puzzle order writes `remix.<id>.<group>`). |
| `VariationConstraint` | `type VariationConstraint = union of 3` | public | A constraint between dimensions: `exclusive` (no two of them take the same value), `requires` (`a` and `b` are `<dimension>=<value>`: when ` |
| `VariationDimension` | `type VariationDimension = union of 6` | public | A dimension: what varies and its finite domain. Logical dimensions are in the solver's space (each instance is proved); `presentation` ones  |
| `VariationManifest` | `interface { schema, algorithm, modes, dimensions, constraints, daily }` | public | What a game lets vary (`GameDef.remix`), schema 1, algorithm `web-scumm-remix-1`. `daily` names the Bridge key a daily challenge is signed w |
| `VariationMode` | `interface { id, strategy, dimensions, mask }` | public | A mode of play: which dimensions vary (the others keep their story value) and the strategy that backs it (D25): `catalogue` (every instance  |
| `VerbDef` | `interface { id, label, color, join, key }` | public | A verb as the interface shows it: its id, its label, its colour and the joining word of a two-term sentence. |
| `VerbId` | `type VerbId = string` | public | Verb id, free-form: the game's own `verbs` declare them. Four ids have meaning to the engine: `look` ("Look" text for rooms and items), `tal |
| `WalkTarget` | `type WalkTarget = Id \| Point` | public | Target of a move: a hotspot, an actor or a prop in the room (its approach point), or a point. |
| `WheelItem` | `interface { id, label, img }` | public | One item of a disc: its id, its name (said to a screen reader, printed), its image (a sprite, a portrait). |
| `wheelProblems` | `(p: Partial<CodeWheelParams>): string[]` | public | Everything wrong with a wheel's parameters (the validator's check); empty when it can be built. |
| `WheelRecord` | `interface { seed, version, wheel, mode, rotations, answers, … 2 more }` | public | What a played wheel records for a replay and a speedrun (§11.13). |
| `wheelTable` | `(w: CodeWheel): { actor: string; symbol: string; answer: string; }[]` | public | The full table the wheel encodes: for each actor and symbol, the answer (the accessible list, the booklet). |
| `Who` | `type Who = Id` | public | Who speaks or acts. `'hero'` always designates the hero, whatever their id. |
| `WorldVariant` | `interface { seed, algorithm, algorithmVersion, manifestHash, mode, assignments, … 1 more }` | public | One world instance: the seed it came from, the algorithm and its version, the manifest's hash, the mode, one value per dimension, and the ha |

<a name="player-reference"></a>

### @quest-n-click/engine/player

| Name | Signature | Stability | Doc |
|---|---|---|---|
| `AssetManifest` | `interface { images, audio, videos }` | public | Catalogue of images and sounds prepared by `npm run assets`. |
| `bootGame` | `(o: BootOptions): Promise<App>` | public | Boots the game in the page and returns the App (after the title screen is shown, or the dev tools started). |
| `BootOptions` | `interface { game, layouts, manifest, minigames, commands, locales, … 9 more }` | public | What `bootGame` starts the game with: the game, its layouts and manifest, minigames, commands, locales, root, store, service worker, and the |
| `EmitterSpec` | `interface { id, kind, url, color, rate, area, … 1 more }` | extension | A particle source, resolved for the painter: its kind, image, colour, rate and area. |
| `Intent` | `type Intent = union of 5` | extension | What a renderer sends the engine's side: the only thing it may (D21). A tap on a target with the verb the player chose (`act`, with `item` w |
| `LayerSpec` | `interface { id, url, role, x, y, w, … 6 more }` | extension | A stage layer, resolved: its image, its box in the room (logical units, before parallax), its depth and look. |
| `LightSpec` | `interface { id, kind, color, intensity, blend, at, … 2 more }` | extension | A light, resolved for the painter: its kind, colour, intensity and blend, and for a radial one its centre and radius. |
| `Locales` | `type Locales = Record<string, Record<string, string>>` | public | The translations a game ships, by language then by text path (`locales/<lang>.json`). |
| `OccluderSpec` | `interface { id, z, polygon, mask, layer, feather, … 1 more }` | extension | What hides a character deeper than `z`: the backdrop's pixels (or a layer's) inside a polygon, a mask image or a layer's alpha. |
| `openStore` | `(game: GameDef, open?: StoreOpener): Promise<{ store?: SaveStore; attach: (app: App) => void; }>` | public | Opens the verified store and keeps its early errors and warnings until an App can show them. Without IndexedDB the App's verified localStora |
| `pickLanguage` | `(_written: GameDef, locales: Locales \| undefined, o?: { query?: string \| null; stored?: string \| null; navigatorLang?: string; }): string \| undefined` | public | `?lang=`, then the player's saved choice, then the browser's language when the game ships it. |
| `Presenter` | `interface { enterRoom, say, walk, face, pose, anim, … 21 more }` | extension | What the core asks the display for. The DOM renderer implements it for the browser, FakePresenter implements it for node (tests, solver). Al |
| `Renderer` | `interface { mount, render, onIntent, unmount }` | extension | A renderer: mounted in an element, given frames, it tells its intentions. The DOM and Canvas painters are wrapped as one (dom/frame-renderer |
| `SaveStore` | `interface { load, save, clear, whenIdle }` | extension | The autosave store a host provides: load, save, clear, and when the latest write is durable. |
| `SceneFrame` | `interface { hash, room, camera, layers, actors, hotspots, … 2 more }` | extension | A room as it is to be drawn: immutable, in logical units. `hash` digests the rest: a renderer skips a frame equal to the last one. |
| `SceneRenderer` | `interface { el, reset, sprite, camera, resize, stage, … 1 more }` | extension | The painter contract: a surface, sprites and a stage to draw, a camera to follow; the DOM and canvas painters implement it. |
| `SlotStore` | `interface { listSlots, getSlot, putSlot, clearSlot }` | extension | Manual save slots (`GameDef.saves.slots`), durable and verified like the autosave. Numbered from 1. |
| `SpriteSpec` | `interface { id, url, fx, fy, w, h, … 9 more }` | extension | One thing drawn in the scene, in logical units. `fx, fy`: its feet (bottom centre), the pivot of rotations. |
| `StageSpec` | `interface { backdrop, layers, occluders, lights, emitters, reduceMotion }` | extension | Everything a room shows besides its sprites (`RoomDef.stage`, normalized by `stageOf`, conditions evaluated by the model). |
| `StoreOpener` | `type StoreOpener = (game: GameDef, fail: (e: Error) => void, warn: (m: string) => void) => Promise<SaveStore>` | extension | How a host supplies the save store `openStore` opens, in place of the verified IndexedDB one. |
| `SwModule` | `interface { registerSW }` | extension | `registerSW` of `virtual:pwa-register` (vite-plugin-pwa), injected so the engine never imports a virtual module. |

<a name="minigames-reference"></a>

### @quest-n-click/engine/minigames

| Name | Signature | Stability | Doc |
|---|---|---|---|
| `Minigame` | `interface { run, required, textParams, bindings }` | extension | A minigame: `run(ctx)` until it is won or skipped, and what the validator reads of its params. |
| `MINIGAME_CSS` | `string` | public | The shared styles of the minigames, injected once by the host. |
| `MinigameCtx` | `interface { root, u, img, size, sfx, instruct, … 5 more }` | extension | What the host hands a minigame: its zone, the unit scale, images and sounds, parameters, labels and an abort signal. |
| `minigames` | `Record<string, Minigame>` | public | Minigames provided by the engine. A game can add others with the same interface. What tools read (`required`, `textParams`, `bindings`) is h |

<a name="testing-reference"></a>

### @quest-n-click/engine/testing

| Name | Signature | Stability | Doc |
|---|---|---|---|
| `categoryWorld` | `(cat: Pick<SpeedrunCategory, "seed" \| "world">): { world: SpeedrunWorldPolicy; deprecated: boolean; }` | public | The world of a category (4.1.16, D29): its `world`, else what a 4.1.15 `seed` meant (`daily`, `mystery`: that mode's worlds), else the story |
| `Engine` | `class Engine` | public | The engine without a page: it runs a game against a Presenter and a SaveStore, in the browser, in node tests and in the solver. |
| `FakePresenter` | `class FakePresenter` | public | Silent presenter for node: everything finishes immediately, and everything is logged to `log`. |
| `fingerprint` | `(ir: GameIR, o: { presentation: unknown; engine: string; }): Promise<GameFingerprint>` | public | The fingerprint of a game from its IR, its presentation (`presentationOf`) and its engine's version. |
| `fingerprintGame` | `(game: GameDef, o: { manifest?: unknown; extensions: ExtensionHashes; engine: string; }): Promise<GameFingerprint>` | public | A game's fingerprint from its sources as written (before a translation): compiled, its IR made, its presentation read with the manifest. Wha |
| `GameFingerprint` | `interface { logic, trustedExtensions, presentation, engine }` | public | A game's fingerprint: SHA-256 in hex of its logic, its trusted extensions, its presentation and its engine (an empty `trustedExtensions` whe |
| `hashSources` | `(files: Readonly<Record<string, string>>): Promise<string>` | public | SHA-256 of a set of source files (path → text) through their canonical text: the trusted extensions' hash. |
| `isRankable` | `(v: SpeedrunVerdict): boolean` | public | Whether a verdict may be ranked on a leaderboard. |
| `leaderboardKey` | `(categoryId: string, rules: RemixCategoryRules \| SpeedrunWorldPolicy, v: WorldVariant): string` | public | The leaderboard a run goes to: its category, and for a Fixed or a Daily its seed (a Daily's seed names its day). Random and Mystery rank eve |
| `logicalKey` | `(c: CompiledManifest, v: WorldVariant): string` | public | A key for proofs: two variants with the same logical world share a proof certificate. |
| `MemoryStore` | `class MemoryStore` | public | A save store in memory, for the tests and the solver: nothing survives the process. |
| `MYSTERY_START_WINDOW_MS` | `number` | public | How long a Mystery run may start after its seed was first revealed (D26, after the second reading): the client must build the world to play  |
| `parseSave` | `(game: GameDef, input: unknown, opts?: ParseSaveOptions): GameState` | public | Parses an envelope (or a legacy raw state). Structural corruption and references needed to resume (the current room and active player) are r |
| `presentationOf` | `(game: CompiledGame \| GameDef, manifest?: unknown): unknown` | public | What the fingerprint's `presentation` hashes: the asset manifest, and every field core/ir-fields.ts classes as presentation (whole) or both  |
| `REMIX_CATEGORIES` | `Readonly<Record<string, RemixCategoryRules>>` | public | The five categories a Remix game offers by default. |
| `RemixCategoryRules` | `interface { seed, mode, fixedSeed, codeWheel }` | public | What a speedrun category says of the world, as 4.1.15 wrote it (`seed` for the policy). Kept for the frozen surface (D28); `SpeedrunWorldPol |
| `RunClock` | `interface { monotonicNow, logicalSteps, logicalTime }` | public | A run's three clocks: `monotonicNow` the host's monotonic milliseconds (RTA: never reproducible, never an authority), `logicalSteps` one per |
| `runSeedPolicy` | `(cat: Pick<SpeedrunCategory, "seed">): "fixed" \| "random"` | public | The run's generator (D29): `fixed` only when the category says so; anything else is a fresh seed per run. |
| `savedWorld` | `(input: unknown): WorldVariant \| undefined` | public | The world a raw save names (a v4 envelope, a slot record holding one), or undefined (v3, a raw state). |
| `saveEnvelope` | `(game: GameDef, state: GameState, now?: number): SaveEnvelopeV4` | public | Wraps a state in the save envelope a store writes (v4: format, schema, game id and save version, date, and the world the game is played in). |
| `SaveEnvelopeV3` | `interface { format, schema, gameId, gameSaveVersion, savedAt, state }` | public | A save as written until 4.1.14: the state with the format, the schema, the game's id and save version and the date. |
| `SaveEnvelopeV4` | `interface { format, schema, gameId, gameSaveVersion, savedAt, state, … 1 more }` | public | A save as written since 4.1.15 (ADR 0018): the v3 envelope and the `WorldVariant` the game was played in, so that a load rebuilds the same w |
| `SaveWorldMismatch` | `class SaveWorldMismatch` | public | A save made in another world than the game it is loaded into (another seed, another mode): the caller rebuilds the game with `applyVariant(g |
| `seedCommitment` | `(seed: string, nonce: string): string` | public | The commitment to a Mystery seed (D26): SHA-256 of the seed and a nonce, published (signed) before the start. |
| `SemanticEvent` | `type SemanticEvent = union of 8` | public | One thing that happened in the game, numbered (`seq`, from 1, contiguous). An item handed between players (`transfer`) is lost by one and ac |
| `SemanticJournal` | `interface { seq, subscribe, since }` | public | What a host reads of the journal (`Engine.journal`): the last sequence number, a subscription, the events after a sequence (within the windo |
| `sha256Hex` | `(text: string): Promise<string>` | public | SHA-256 of a text's UTF-8 bytes, in hex, with WebCrypto. |
| `shortFingerprint` | `(f: GameFingerprint): string` | public | The short form the pause menu shows: the first eight hex digits of each component (`????????` for an unknown one). |
| `solve` | `(gameIn: GameDef, layouts: Record<string, Layout>, opts?: SolveOptions): Promise<SolveResult>` | public | Searches the game for a way to its ending (`witness`), or explores every reachable state for softlocks (`prove`). |
| `SolveOptions` | `interface { reality, maxStates, mode, start, goal, commands, … 21 more }` | public | What a search is told: its mode, where it starts and stops, the custom commands, the world's signals and its budgets. |
| `SolveResult` | `interface { status, exit, headline, mode, reality, finished, … 20 more }` | public | The verdict of a search: its status, exit code and headline, the path found, the softlocks and the search's statistics. |
| `SpeedrunEnvelope` | `type SpeedrunEnvelope = SpeedrunEnvelopeV1 \| SpeedrunEnvelopeV2` | public | A `.wsrun` file: the proof of one speedrun (schema 1 read, schema 2 written). |
| `SpeedrunEnvelopeV1` | `interface { schema, seed, format, gameId, fingerprint, engineVersion, … 14 more }` | public | A `.wsrun` file of 4.1.14 and 4.1.15 (schema 1): its seed is the run's, its world the story world. |
| `SpeedrunEnvelopeV2` | `interface { schema, runSeed, variant, worldEvidence, format, gameId, … 16 more }` | public | A `.wsrun` file since 4.1.16 (schema 2, ADR 0019): the run's generator seed and the exact world it was played in, with what that world rests |
| `SpeedrunSeedPolicy` | `type SpeedrunSeedPolicy = SpeedrunWorldPolicy['policy']` | public | How a category picks its world. |
| `SpeedrunVerdict` | `type SpeedrunVerdict = union of 8` | public | A verifier's verdict (ADR 0017). Only `valid` ranks; `inconclusive` is never valid. |
| `SpeedrunVerifyResult` | `interface { verdict, code, reason, trust, world, recomputed }` | public | What a verifier answers: the verdict, a stable code, one sentence, and the trust it grants. |
| `SpeedrunWorldEvidence` | `type SpeedrunWorldEvidence = { kind: 'daily'; token: string; } \| { kind: 'mystery'; commitmentToken: string; revealToken: string; startedAt: number; }` | public | What a Daily or a Mystery world rests on (4.1.16, ADR 0019): the Bridge's signed tokens, as received. A Daily run carries the day's token; a |
| `TrustLevel` | `type TrustLevel = 'local' \| 'replay-valid' \| 'server-witnessed' \| 'moderator-verified'` | public | How far a run is believed (ADR 0017): raised only by someone other than the player's client. |
| `upgradeEnvelope` | `(game: GameDef, env: SaveEnvelopeV3 \| SaveEnvelopeV4): SaveEnvelopeV4` | public | A v3 envelope as a v4 one (the save migration of 4.1.15): every save made before Remix was played in the story world, so it receives the gam |
| `VerifyContext` | `interface { game, layouts, commands, fingerprint, engineVersion, keyring, … 3 more }` | public | The approved game a run is checked against: its content, layouts, fingerprint, engine, the Bridge's keys. |
| `verifyRun` | `(input: unknown, ctx: VerifyContext): Promise<SpeedrunVerifyResult>` | public | Verifies a run (`.wsrun` text or object) against the approved game: never throws, every failure is a verdict. |
| `WorldEvidence` | `interface { dailySeed, commitment, reveal, revealedAt, runStartedAt }` | public | What a run's world must match, given the category and what the Bridge published (the day's seed, a commitment). |
| `worldVerdict` | `(rules: RemixCategoryRules \| SpeedrunWorldPolicy, v: WorldVariant, e?: WorldEvidence): string[]` | public | Whether a run's world is the one its category allows: empty when it is, else the reasons (a verifier refuses the run with them). The world i |

<a name="reality-reference"></a>

### @quest-n-click/engine/reality

| Name | Signature | Stability | Doc |
|---|---|---|---|
| `BridgeKey` | `interface { kid, key, notBefore, notAfter, tenantId, environment, … 1 more }` | public | One verification key of the Bridge: its id, the key, and when it may sign (epoch ms; rotation overlaps). |
| `CommitToken` | `type CommitToken = { format, v, id, gameId, mode, commitment, … 1 more }` | public | What a Mystery commitment says. |
| `DayToken` | `type DayToken = { format, v, gameId, date, seed, mode, … 3 more }` | public | What a day token says. |
| `Fault` | `interface { delayMs, duplicate, badSignature, expired }` | public | What the simulator does wrong on purpose with one delivery: a delay, a duplicate, a bad signature, an expiry. |
| `httpPort` | `(o: HttpPortOptions): WorldSignalPort` | public | The transport to a Bridge, as a WorldSignalPort: Server-Sent Events read with fetch, or a fetch by cursor. |
| `HttpPortOptions` | `interface { url, capability, fetch, retryMs, mode, onStatus, … 3 more }` | public | How `httpPort` reaches a Bridge: its URL, the pairing's capability, the fetch to use, the retry delay and the mode. |
| `importBridgeKey` | `(kid: string, raw: string, window?: Omit<BridgeKey, "kid" \| "key">): Promise<BridgeKey>` | public | An Ed25519 public key from its 32 raw bytes in base64url (a manifest's or a Bridge's configuration). |
| `Keyring` | `type Keyring = BridgeKey[]` | public | The Bridge's verification keys the player trusts (several during a rotation). |
| `manifestHash` | `(m: RealityManifest): Promise<string>` | public | The manifest's hash: SHA-256 of its JSON (keys in this fixed order), hex. |
| `MAX_SIGNAL_CHARS` | `number` | public | The largest signed signal accepted, in characters: a signal is an identifier, not a document. |
| `RealityClient` | `class RealityClient` | public | The player's side of the Reality Bridge: reads signed signals from a port, verifies each, hands it to the engine, waits for the durable save |
| `RealityClientOptions` | `interface { engine, store, port, keyring, refreshKeys, playerId, … 7 more }` | public | What a RealityClient is built with: the engine, the store, the port, the keyring, and how it refreshes keys and reports. |
| `realityManifest` | `(game: GameDef): RealityManifest \| null` | public | The manifest of a game that declares `reality`, null otherwise. |
| `RealityManifest` | `interface { format, schema, gameId, signals, connectors }` | public | A game's Reality manifest: the signals it declares, with no secret, as the Bridge checks them. |
| `RefusalCode` | `type RefusalCode = union of 14` | public | Why a signal was refused, as a code (the conformance corpus and the Rust cross-check compare codes) and a sentence. |
| `revealMatches` | `(c: CommitToken, reveal: { seed: string; nonce: string; }): boolean` | public | Whether a reveal (seed, nonce) is the one a verified commitment hid. |
| `SignalEnvironment` | `type SignalEnvironment = 'prod' \| 'staging' \| 'dev'` | public | Where a Bridge runs, as a signal names it (4.1.10): a signal of one environment is refused by another. |
| `SignalExpectation` | `interface { gameId, playerId, signals, now, versions, tenantId, … 3 more }` | public | What a signal must match besides its signature. |
| `SignalSimulator` | `class SignalSimulator` | public | A Bridge in the browser, for the Studio and the tests: signs and delivers a game's signals, with faults on demand. |
| `SignedWorldSignalV1` | `type SignedWorldSignalV1 = string` | public | A signed signal as it travels: the compact JWS string. |
| `signSignal` | `(payload: WorldSignal, key: CryptoKey, kid: string): Promise<SignedWorldSignalV1>` | public | Signs a payload as the Bridge does (the Bridge, the tests, the Studio's simulator). |
| `SimulatedDelivery` | `interface { sequence, signal, fault, at }` | public | One delivery the simulator made: its sequence, its signal, its fault and when. |
| `TokenResult` | `type TokenResult = { ok: true; token: T; } \| { ok: false; reason: string; }` | public | A verified token, or why it is refused. |
| `verifyCommitment` | `(jws: string, key: BridgeKey, gameId: string): Promise<TokenResult<CommitToken>>` | public | Checks a Mystery commitment's signature and game. |
| `verifyDayToken` | `(jws: string, key: BridgeKey, gameId: string, now: number \| null): Promise<TokenResult<DayToken>>` | public | Checks a day token offline: the signature (the game's daily key), the game, the window (24 hours), a well-formed seed. `now` in epoch ms; `n |
| `VerifyResult` | `type VerifyResult = { ok: true; signal: WorldSignal; } \| { ok: false; code: RefusalCode; reason: string; }` | public | The outcome of `verifySignal`: the signal it accepted, or the refusal's code and reason. |
| `verifySignal` | `(jws: unknown, keyring: Keyring, expect: SignalExpectation): Promise<VerifyResult>` | public | Checks a signed signal, then what it says. The reason of a refusal is a short sentence (logged, never shown raw). |
| `WorldSignal` | `type WorldSignal = WorldSignalV1 \| WorldSignalV2` | public | Either version of the signed payload. |
| `WorldSignalPort` | `interface { connect, acknowledge, close }` | extension | Where signals from the world outside come from (4.1.1, Reality Bridge): the Bridge's transport (Server-Sent Events, a fetch by cursor), or t |
| `WorldSignalV1` | `type WorldSignalV1 = { schema, format, id, sequence, gameId, playerId, … 8 more }` | public | The signed payload, as `WorldSignalV1Schema` types it. |
| `WorldSignalV1Schema` | `z.ZodMiniObject<{ schema: z.ZodMiniLiteral<1>; format: z.ZodMiniLiteral<"web-scumm-world-signal">; id: z.ZodMiniString<string>; sequence: z.ZodMiniInt; gameId: ` | public | The payload the Bridge signs: one accepted fact from outside, as a finite identifier (§4.1). |
| `WorldSignalV2` | `type WorldSignalV2 = { schema, tenantId, environment, audience, sessionId, keyId, … 13 more }` | public | The signed payload of 4.1.10, as `WorldSignalV2Schema` types it. |
| `WorldSignalV2Schema` | `z.ZodMiniObject<{ schema: z.ZodMiniLiteral<2>; tenantId: z.ZodMiniString<string>; environment: z.ZodMiniEnum<{ prod: "prod"; staging: "staging"; dev: "dev"; }>;` | public | The payload of 4.1.10 (ADR 0010): V1's fields and the context it was signed for, so a signal of one tenant, one environment, one origin, one |

<!-- generated:end -->
