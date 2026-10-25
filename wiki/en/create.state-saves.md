# State and saves: persistent or temporary, renaming an id, migrations

What a player's save keeps, what it forgets, and how to change your game without breaking the saves of the people
already playing it: renaming an id, migrating a save from one version of your content to the next, and what happens
when an installed game updates itself.

<a name="what-a-save-holds"></a>

## What a save holds, and what it does not

A save is the **state of the game in progress** (`GameState`,
[src/engine/core/types/state.ts](../../src/engine/core/types/state.ts)), wrapped in an envelope that names the game,
its `saveVersion`, the time and the world (`SaveEnvelopeV4`, [src/engine/core/save.ts](../../src/engine/core/save.ts)).

**Persistent: in the save.**

| What | Field |
|---|---|
| The current room, the hero's position in each room, the rooms visited and how often | `room`, `hero`, `visited` |
| The inventory and the items already used | `inventory`, `used` |
| Every flag, with its value (boolean, number or text) | `flags` |
| Each prop's state, and actors moved, hidden or shown by a script | `props`, `actors` (keys `<room>.<id>`) |
| The places unlocked on the map | `unlocked` |
| The counters of `once`, `nth`, `cycle` and `random` blocks | `counters` (keyed by the block's id) |
| What was already seen: topics, `once` listeners, `once` choices, applied Reality signals | `seen` (`topic.<id>`, `event.<id>`, `choice.<id>`, `reality.<signal>`) |
| Where each moving character is | `where` |
| Each script's position: its next step, finished or stopped | `scripts` (the step by its `stepIds` id) |
| The camera of the current room | `camera` |
| Several playable characters: who is active, the others' room, positions and inventory | `active`, `players` |
| Whether the game is finished | `done` |
| The music and where it was | `music` (written and read by the player's app only) |
| The link to a Reality Bridge: cursor and signals applied | `reality` |

**Temporary: never in the save.**

- An event (`emit`): it happens, its listeners run, and it is gone. Only a `once` listener remembers it fired, in
  `seen`.
- The rest of an action that is running: the remaining commands of a cutscene, a conversation in progress, a
  minigame being played. The state is written when an action ends, and at some points inside one (entering a room,
  for instance); what was left to run of that action is not run again after a reload. Scripts are different: their
  position is saved, and they resume.
- A looping prop animation (`play` of a `loop` animation): presentation only; after a load the prop shows its state's
  image until a command plays the loop again.
- The stage: layers, lights, particles, transitions. They read the state (`visible` conditions), they never change it.
- The set of objectives already completed. It is rebuilt from the state on load: what holds then counts as done (see
  [Chapters and objectives](create.chapters.md#objectives)).
- The player's preferences: text speed and size, reduced motion, readable font, volumes, captions, verb keys
  (`<game>.settings` in the browser's localStorage) and the language (`<game>.lang`). They belong to the browser, not
  to a game in progress; see [Staging](create.staging.md#settings).

So the rule of thumb: **what must survive a reload is a flag, an item, a prop's state, a counter or a script position**.
A variable you keep in a custom command's JavaScript (see [Custom code](create.custom-code.md)) is lost on reload
unless you write it into the state. Which of flags, variables and events to use is explained in
[Flags, variables and events](create.flags-variables-events.md).

<a name="guarantees"></a>

## What is guaranteed

**Where saves live.** The autosave and the manual slots live in IndexedDB
([src/engine/dom/save-store.ts](../../src/engine/dom/save-store.ts)). Writes are serialised, and each committed write
is **read back and compared** before the save counts as done
([ADR 0005](../../docs/dev/adr/0005-indexeddb-read-back.md)). A browser without IndexedDB (a private window, a locked
profile) gets the localStorage store ([src/engine/dom/storage.ts](../../src/engine/dom/storage.ts)), announced once.

> [!GUARANTEE id=save-read-back]
> The autosave is written to IndexedDB without an error, and found again, identical, after the database is reopened.

Each write is read back and verified before it counts (`whenIdle()` rejects when the copy does not match).

**Every operation says what it did.** `save()` reports a refused write through the store's failure callback and
`whenIdle()` rejects; `clear()` and `clearSlot()` return `false` when the browser refused the deletion (the save is
still there, and the page keeps showing it). The player's app acts on it:

- "Restart" keeps the current game when the autosave cannot be cleared;
- "New game" from the title continues the saved game instead;
- a file import never loads over the current game when its copy into a free slot was refused.

Each case shows `ui.saveFailed` (English default "Save failed").

> [!GUARANTEE id=save-refused-write-reported]
> A write refused by the browser (a full quota) makes `whenIdle()` reject and is reported; the state is kept in
> memory.

**What is refused, and what is adjusted.** When a save is loaded (the autosave at start, a slot, an imported file),
`parseSave` checks it against the game:

- **refused, without touching the current session**: structural corruption, a save of another game, envelope and
  state versions that disagree, a current room that no longer exists, an unknown active player, a save version with no
  chain of migrations to the game's `saveVersion` (including a save **newer** than the game: never half read);
- **adjusted, with one visible warning**: references the content no longer has but that resuming does not need (an
  item gone from the inventory, a prop state that no longer exists, a script removed or whose step id is gone, a
  moving character's room that disappeared, which falls back to the character's home room). The player sees
  `ui.saveAdjusted` ("Save adjusted for this version") with the list, and Continue keeps working.

> [!GUARANTEE id=save-refused-untouched]
> A save of another game, a corrupt shape or a missing current room is refused without changing the game in progress.

> [!GUARANTEE id=save-stale-pruned]
> Stale references that resuming does not need are pruned, and the player is warned once.

**Across releases of the engine.** A save written by any release of the 3.x or 4.x line loads in every later 4.x: the
envelope is versioned (schema 4 since 4.1.15, schema 3 still read), and your game's own `migrations` carry its ids.
`tests/save-v3.test.ts` loads one frozen save of the sample game per release (`tests/fixtures/saves/demo-<version>.json`,
3.0.0 to 4.4.0 at 4.4.0), migrates it and plays it to the ending. In the engine repository, in a real browser,
`npm run e2e -- --save` checks that a manual save survives a reload, and `--save --no-indexeddb` the same for the
fallback. The storage part of `npm run e2e:a11y` (a CI gate since 3.3, Chromium and WebKit) upgrades an older save
with the real build: the v2 localStorage autosave and slot are copied into IndexedDB and removed only once the copy is verified, a 3.1.0 envelope
already in IndexedDB is migrated, the title's Continue resumes it, and a manual save then survives a reload.

A speedrun's `.wsrun` file is schema 2 since 4.1.16 (the run's world sealed into its proof); a schema 1 file of 4.1.14
or 4.1.15 is still verified, as a Story run. Its format is on [File formats](engine.file-formats.md).

> [!LIMIT id=save-own-content-only]
> The engine guarantees its own envelope across releases. Whether **your** saves survive a change of **your**
> content depends on your `migrations`: the engine cannot guess that you renamed a flag.

<a name="renaming-an-id"></a>

## Renaming an id without breaking saves

Since schema 3 (`schemaVersion: 3` in `game.ts`), everything whose position survives in a save has an explicit,
unique id: every `Rule`, `TalkTopic`, `Choice`, `EventRule`, and every `once`, `nth`, `cycle` or `random` block; a
`ScriptDef` adds one `stepIds` entry per top-level command. The validator refuses a v3 game with missing or duplicate
ids. So **reordering content or translating a text no longer changes what a save means**; renaming an id does. The
contract itself is on [Content principles](create.principles.md#identity-contract).

```ts
schemaVersion: 3,
// …
{ id: 'open.pantry', verb: 'open', a: 'pantry', do: […] }
{ id: 'ask.key', topic: 'Where is the key?', do: […] }
{ once: […], id: 'arrival.first' }
{ id: 'clock', stepIds: ['wait', 'chime'], do: [{ wait: 1000 }, { sfx: 'chime' }] }
```

The `ids` tool with `--write --map` writes those ids into an existing game, and writes the migration step its saves
need (`ids.migration.json`) and the map of translation paths (`ids.paths.json`) beside the game's sources. The full move to
schema 3 is in [Upgrade notes, v2 to v3](install.upgrade-notes-v2-to-v3.md#v3-schema).

**What a rename touches in a save.** A flag, an item, a room, a prop, an actor, a map place, a script, a script step,
a playable character, a moving character, a counter's block id, or the id of something remembered in `seen` (a topic,
a `once` listener, a `once` choice). When in doubt, look for the id among the keys of a save's state (the table at the
top of this page). A hotspot's id never appears there; renaming it can still change translation paths (below).

The procedure. The game's sources are in `game/` in a created project, in `games/<id>/` in the engine repository;
the tools run as `npx quest-n-click <tool>` in a created project, as `GAME=<id> npm run <tool> --` in the engine
repository.

<!-- step: rename-in-content -->
1. **Rename the id everywhere in the content**: its definition and every reference (conditions, commands, `goals`,
   `objectives`). The validator lists every reference you missed as an unknown id.

<!-- step: bump-save-version -->
2. **Bump `saveVersion`** in `game.ts`, by one.

<!-- step: add-migration -->
3. **Add one migration step** from the old version, with the rename:

   ```ts
   saveVersion: 4,
   migrations: [
     // …the earlier steps, unchanged
     { from: 3, renameFlag: { found: 'key_found' } },
   ],
   ```

   The renamed target must exist in the content: the validator refuses `renamed item does not exist: "<id>"` (likewise
   for rooms, map places, scripts, players, characters, props and actors).

<!-- step: move-texts -->
4. **Follow the texts.** Translation paths contain ids (`room:house/props.pantry.name`). After a rename, run the
   `i18n` tool's `extract --lang <xx>` for each language: what no longer matches is parked under `_stale:<path>`;
   move each translation from its old path to its new one by hand (see [Translations](create.translations.md)). Voice
   clips keyed by a line id (`audio.voices`, `voicesByLang`) are renamed in the same way ([Voices](create.voices.md)).

<!-- step: check-rename -->
5. **Check** that the content validates and that every translation is still in place:

   ```sh
   # in the created project
   npx quest-n-click validate
   npx quest-n-click i18n status

   # in the engine repository
   GAME=<id> npm run validate
   GAME=<id> npm run i18n -- status
   ```

The three cases a player meets, said the same way on [Saves](play.saves.md#what-is-kept) and
[Troubleshooting](play.troubleshooting.md): an item gone loads, adjusted; the current room gone is refused; the current
room renamed with a migration (`{ from: 2, renameRoom: { lobby: 'hall' } }`, [Migrations](#migrations)) loads, in
`hall`, because the migration runs before the room is checked. So before you remove or rename a room, keep the current
room and the active player valid after migration: rename with `renameRoom`, never by deleting the old room.

<a name="migrations"></a>

## Save slots and migrations

**Manual slots** are opt-in:

```ts
saves: { slots: 3 },   // the pause menu gets Save / Load with three slots, plus export and import as a JSON file
ui: { …, save: 'Save', load: 'Load', slot: 'Slot {n}', emptySlot: 'empty', exportSave: 'Export to a file', importSave: 'Import a file', confirmOverwrite: 'Overwrite this slot?' },
```

Absent or 0: autosave only. Manual slots are stored like the autosave: in IndexedDB, as envelopes, read back after each
write. A file imported from the menu also fills the first free slot. The autosave is a validated envelope, checked
before the current game changes; the first run of a v3 build imports the old `<game>.save` localStorage autosave
once (and the `<game>.slot.<n>` slots), removing them only after the verified copy. What the player sees of slots,
export and import is on [Saves, for players](play.saves.md).

**Migrations.** When the content changes incompatibly, bump `saveVersion` and carry the state over as data, one step
per version:

```ts
saveVersion: 3,
migrations: [
  { from: 1, renameFlag: { found: 'key_found' }, renameItem: { cle: 'key' } },
  { from: 2, renameRoom: { lobby: 'hall' }, renameProp: { 'hall.lamp': 'hall.lantern' }, dropFlag: ['tmp'] },
],
```

A step goes from `from` to `from + 1`; keys are old ids, values new ones. The complete `Migration` type
([src/engine/core/types/game.ts](../../src/engine/core/types/game.ts)):

| Field | What it carries |
|---|---|
| `renameFlag`, `dropFlag` | Flags. |
| `renameItem`, `dropItem` | Items, in the active player's inventory and in `used`. |
| `renameRoom` | The current room, the hero's positions, `visited`, the room part of prop and actor keys, `where`. |
| `renameProp`, `renameActor` | `room.prop` → `room.prop`, `room.actor` → `room.actor`. |
| `renamePlace` | Unlocked map places. |
| `renameCounter`, `dropCounter` | The counters of `once` / `nth` / `cycle` / `random` blocks. |
| `renameSeen`, `dropSeen` | Seen topics, listeners and choices (`topic.<id>`, `event.<id>`, `choice.<id>`). |
| `renameScript`, `dropScript` | Script positions. |
| `renameScriptStep` | Script id → old step id → new step id. |
| `renamePlayer` | The active player and the other players' records. |
| `renameCharacter` | Moving characters in `where`. |

`renameItem` and `dropItem` do not reach the inventories of the other playable characters (`players`): an item id
renamed there is no longer known, and loading prunes it with the warning below.

The chain is applied in order on a copy, until the save reaches `saveVersion`
([src/engine/core/migrate.ts](../../src/engine/core/migrate.ts)). The validator refuses two steps from the same
version, a `from` that is not below `saveVersion`, and a renamed target that does not exist; it warns when a version
has no step (`no migration from version <n>: those saves start a new game`).

> [!GUARANTEE id=migration-newer-save-refused]
> An older save is migrated by the game's steps; a save newer than the game is refused, never read in part.

A save with no path to `saveVersion` is not loaded: the player starts a new game. Map positional counter and topic keys
of old content only when you know the old content and its meaning: after content has been reordered or translated,
there is no safe automatic conversion. An unmapped stale optional reference is pruned with the visible warning above.

<a name="offline-updates"></a>

## Saves across updates of an installed game

A published game is a PWA: once visited, it plays offline from the service worker's cache. When you publish a new
version, an installed game finds it on its next visit online, and the player's save meets your new content.

1. **The update waits for a verified save.** The page shows `ui.updateAvailable` ("A new version is ready.") with a
   button `ui.updateNow` ("Save and update"). On a tap, a game in progress is saved first, and the new version is
   activated only after the store confirms the write (`offerUpdate` in
   [src/engine/dom/update.ts](../../src/engine/dom/update.ts)). If the write is refused, the update does not happen,
   `ui.saveFailed` is shown, and the button can be tapped again. On the title screen there is no live state: the
   autosave already on disk is the progress.
2. **The new version reads the old save** with your `migrations`, as above: migrated, adjusted with a warning, or
   refused (and then a new game).
3. **Until the player taps**, the open page keeps the version it loaded, offline included. The new service worker
   waits (`registerType: 'prompt'`, `skipWaiting: false` in [vite.config.ts](../../vite.config.ts)); a browser
   switches to it by itself only once every tab of the game is closed, and the autosave written after each action is
   then the progress.

> [!LIMIT id=update-needs-migrations]
> The update protects the write, not the meaning: if your new content renamed an id without a migration, the old save
> loses that reference (pruned with a warning) or, for a current room that no longer exists, is refused.

On a hosted Studio, the previews of every revision share one origin, so a save made in one revision can be resumed in
another. A preview build asks first when the content differs (Resume here, Restart, Stay in revision N); the
player's builds never ask. That is [ADR 0026](../../docs/dev/adr/0026-saves-across-revisions.md); see
[Preview, apply, undo](studio.preview-apply.md).

<a name="why"></a>

## Why it works this way

- **Read back before it counts** ([ADR 0005](../../docs/dev/adr/0005-indexeddb-read-back.md)). Browsers lose writes:
  a full quota, a private window, a tab killed during a write, evicted storage. A save the player believes is there
  and is not is the worst bug a long game can have. The cost is one more read per save, and an asynchronous store
  everywhere.
- **Migrations are data, not code.** A step is a list of renames and drops: the validator can check that each target
  exists, and a migration cannot run arbitrary code on a player's save. The alternative, a migration function, would
  be more powerful and much harder to check.
- **Prune what is optional, refuse what is essential.** Refusing every save with a stale reference would make Continue
  disappear after any content update; accepting a save whose current room is gone would leave the player nowhere. The
  line between the two is "can the game resume from it".
- **Stable ids instead of positions** (schema 3). Before, a counter or a seen topic was keyed by its position: inserting
  a rule above it, or translating its text, silently changed what an old save meant.

<a name="references"></a>

## References

- [src/engine/core/save.ts](../../src/engine/core/save.ts), [src/engine/core/migrate.ts](../../src/engine/core/migrate.ts),
  [src/engine/dom/save-store.ts](../../src/engine/dom/save-store.ts), [src/engine/dom/update.ts](../../src/engine/dom/update.ts).
- ADRs: [0005](../../docs/dev/adr/0005-indexeddb-read-back.md) (read back),
  [0026](../../docs/dev/adr/0026-saves-across-revisions.md) (saves across Studio revisions).
- The save file's format, field by field: [File formats](engine.file-formats.md).
- What the project promises across versions: [Stability and support](start.stability.md).
