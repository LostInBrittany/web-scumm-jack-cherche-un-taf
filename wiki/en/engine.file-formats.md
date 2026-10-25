# File formats

The files the engine and its tools write and read: a save, a session, a speedrun proof (`.wsrun`), the storyboard,
the map's groupings, the notes, and the manifests a build writes. For each: its schema, a minimal example, what is
refused, what older versions it still reads, and what happens to a field it does not know. Everything here is read
from the code of the version this page applies to; the source file is named in each section.

Several formats still carry the identifier of the project's former name, `web-scumm` (`web-scumm-save`,
`web-scumm-session`, `web-scumm-speedrun`, `web-scumm-reality-manifest`). It is kept on purpose so existing saves,
sessions and runs keep loading after the rename (decision D47): it is not a sign of an old file.

<a name="save"></a>
<!-- applies: .. since 3.0.0 -->

## Save (`web-scumm-save`)

What a save holds: the game's state, wrapped in an envelope that says which game, which save version and which world
it belongs to. The autosave, the manual slots and the exported file all hold the same envelope. Source:
[`src/engine/core/save.ts`](../../src/engine/core/save.ts), migrations in
[`src/engine/core/migrate.ts`](../../src/engine/core/migrate.ts).

**Schema (envelope schema 4, written since 4.1.15).**

| Field | Type | Meaning |
|---|---|---|
| `format` | `"web-scumm-save"` | The format's identifier. |
| `schema` | `4` | The envelope's version. `3` is still read (below). |
| `gameId` | non-empty string | The game's `id`. |
| `gameSaveVersion` | integer ≥ 0 | The game's `saveVersion` when it saved. Must equal `state.v`. |
| `savedAt` | number | When it was saved, epoch milliseconds. |
| `state` | object | The game state (`GameState`, below). |
| `variant` | object | The world the game was played in (`WorldVariant`): `seed` (1 to 64 characters), `algorithm`, `algorithmVersion` (integer > 0), `manifestHash` (at most 64 characters), `mode` (1 to 64 characters, `story` for the game as written), `assignments` (what each Remix dimension took), `hash` (64 hex digits). |

The state (`GameState`) requires `v` (its save version), `room` (the current room), `inventory`, `flags` (values are
booleans, numbers or strings), `props`, `actors`, `hero` (the hero's position per room), `unlocked`, `visited`,
`counters`, `seen` and `started`. It may hold `used`, `where` (where each character is), `scripts`, `camera`,
`active` (the active player), `players`, `done`, `music` and `reality` (the Reality Bridge's cursor, see
[Reality signals in the session and the save](#session-reality)).

**Minimal example** (a save of the `demo` game, story world; abridged from
[`tests/fixtures/saves/demo-4.2.0.json`](../../tests/fixtures/saves/demo-4.2.0.json), where the `hash` and
`manifestHash` are real):

```json
{
  "format": "web-scumm-save",
  "schema": 4,
  "gameId": "demo",
  "gameSaveVersion": 2,
  "savedAt": 1792022400000,
  "state": {
    "v": 2,
    "room": "garden",
    "inventory": ["pipe"],
    "flags": { "pipe_taken": true },
    "props": { "house.pantry": "locked" },
    "actors": {},
    "hero": { "garden": [320, 360] },
    "unlocked": ["house", "garden"],
    "visited": { "house": 1, "garden": 1 },
    "counters": {},
    "seen": {},
    "started": 1792029074445
  },
  "variant": {
    "seed": "story",
    "algorithm": "web-scumm-remix-1",
    "algorithmVersion": 1,
    "manifestHash": "<64 hex digits>",
    "mode": "story",
    "assignments": {},
    "hash": "<64 hex digits>"
  }
}
```

**Constraints, in the order `parseSave` checks them.**

- The envelope's shape (its zod schema). A field missing or of the wrong type refuses the save.
- `gameId` is this game's: otherwise "save belongs to game "…", not "…"".
- `gameSaveVersion` equals `state.v`: otherwise "save envelope and state versions disagree".
- The world. A story save loads into the story world whatever the Remix manifest's hash; any other save loads only
  into the world whose `hash` it names. Otherwise the load throws `SaveWorldMismatch`, which carries the saved world:
  the player rebuilds that very world from its stored assignment (`applyVariant`) and loads again. Nothing is
  regenerated from the seed.
- The state's version. A save older than the game's `saveVersion` goes through the game's `migrations`, one step per
  version (renames and drops of flags, items, rooms, props, actors, places, counters, seen lines, scripts, characters,
  players). If a step is missing, or the save is newer than the game, the load fails with "save version N cannot be
  migrated to M".
- The references needed to resume. An unknown current room ("state.room: unknown current room") or an unknown active
  player ("state.active: unknown active player") refuses the save.
- The other references are pruned, not refused: an item, a place, a prop state, an actor, a script or a character's
  room the content no longer has is removed (a character goes back to its home room, a player to its start room), and
  one warning lists them all: "save adjusted after a content update: …". An ordinary content update therefore does not
  break Continue.

**Compatibility.**

- Envelope schema 3 (until 4.1.14: the same fields without `variant`) is read as a save of the story world. Loaded
  into a game running another world, it raises `SaveWorldMismatch` with the story world.
- A bare state with no envelope (the v2 format) is read too, through the same checks.
- One save per release, from 3.0.0 to 4.4.0, is kept in
  [`tests/fixtures/saves/`](../../tests/fixtures/saves/) (`demo-<version>.json`). The test
  [`tests/save-v3.test.ts`](../../tests/save-v3.test.ts) loads each on the current engine, migrates it, and plays it to
  the ending.

**Unknown fields.** The envelope is strict: a field it does not know refuses the whole save. The state is not: a field
it does not know is accepted and left in the state, so a save from a newer engine can still be imported. The
`reality` part of the state is strict again (`playerId`, `cursor`, `applied` only).

> [!GUARANTEE id=save-foreign-game-refused]
> A save of another game, a state of the wrong shape, or a state whose current room does not exist is refused, and
> the game being played is left as it was. The test covers these three cases; the other refusals above are read from
> the code.

<a name="save-storage"></a>
<!-- applies: .. since 3.0.0 -->

## Where saves are kept, and what each operation reports

Source: [`src/engine/dom/save-store.ts`](../../src/engine/dom/save-store.ts).

- **In the browser.** IndexedDB database `web-scumm-saves`, object store `slots`. The autosave is the key
  `<gameId>:auto` (the envelope). A manual slot is the key `<gameId>:slot:<n>`, holding a record
  `{ meta, envelope }`: `meta` is what the menu shows (`at`, `room`, `roomName`, `v`, and since 4.2.2 `revision`:
  `{ rev, fingerprint }`, the revision and content fingerprint the save was made in, ADR 0026). A v2 slot,
  `{ meta, state }`, is still read.
- **Every write is read back and verified.** A browser without IndexedDB (a private window, a locked profile) gets the
  localStorage store instead (`<gameId>.save`, `<gameId>.slot.<n>`, verified the same way), and the player is told
  once.
- **The v2 localStorage saves** (`<gameId>.save`, `<gameId>.slot.<n>`) are copied into IndexedDB once, and each is
  removed only after its copy is verified.
- **Every operation says what it did.** `save()` reports a refused write through the store's failure callback, and
  `whenIdle()` rejects. `clear()` and `clearSlot()` return `false` when the browser refused the deletion: the save is
  still there, and the page keeps showing it. The game acts on it: "Restart" keeps the current game when the autosave
  cannot be cleared; "New game" from the title continues the saved game instead; a file import never loads over the
  current game when its copy into a free slot was refused. Each case shows the `ui.saveFailed` message.
- **The exported file.** The save menu's export writes `<gameId>-save.json`: the envelope, with the music playing at
  that moment. Importing it checks it as above, then copies it into the first free slot so the next autosave does not
  lose it.

How this is tested: refused writes and deletions with a fake IndexedDB
([`tests/save-store.test.ts`](../../tests/save-store.test.ts)); the golden saves above; and in a real browser,
`npm run e2e -- --save` (a manual save survives a reload) and `npm run e2e -- --save --no-indexeddb` (the fallback
does too), in the engine repository. The upgrade of an older save by the real build runs in Chromium and WebKit
(`npm run e2e:a11y`, its storage part, a CI gate since 3.3): the v2 localStorage autosave and slot are copied into
IndexedDB and removed only after the copy is verified, a 3.1.0 envelope already in IndexedDB is migrated, the title's
Continue resumes it, and a manual save then survives a reload.

For what a player or an author does with saves (slots, renaming an id, migrations), see
[State and saves](create.state-saves.md#guarantees).

<a name="session"></a>
<!-- applies: .. since 3.7.1 -->

## Session file (`web-scumm-session`)

A session is every input of a game, in order, with the answers given while it ran (dialogue choices, map picks,
random draws, minigame results) and a digest of the state after each. `replay` plays it again on the real engine
without a display and names the first entry whose state differs: a tester's bug report is a session file. Sources:
[`src/engine/tools/replay.ts`](../../src/engine/tools/replay.ts) (`sessionFile`, `parseSessionFile`),
[`src/engine/core/types/session.ts`](../../src/engine/core/types/session.ts).

**Where it comes from.** The save menu's "Export session" (`<gameId>-session.json`), "Share session" (a playtest,
`<gameId>-<date>.session.json`, for `games/<id>/playtests/`), the Studio's Play tab and the dev panel.

**Schema.**

| Field | Meaning |
|---|---|
| `kind` | `"web-scumm-session"`. |
| `game` | The game's id. |
| `v` | The game's save version. |
| `at` | When the session started, epoch ms. |
| `session` | `{ v, start, base, log, at?, seed?, variant? }`. `start` is `{ "kind": "new" }`, `{ "kind": "load" }` or `{ "kind": "checkpoint", "id": … }`; `base` the state it started from; `seed` the run's generator seed (since 4.1.14; absent before); `variant` the world it was played in (since 4.1.15). |
| `trace` | The engine's trace (empty in a playtest). |
| `device` | `ios`, `android` or `desktop`, when shared as a playtest (3.7.1). |
| `misses` | Taps on nothing next to a target, by `room/target` (3.8). |
| `journal` | The semantic journal, in ids (4.1.11): `replay` checks the replay yields the same. |
| `journalTruncated` | `true` when the session outgrew the journal's window: no journal to compare. |

Each entry of `log` is one input: `act` (a verb on a target, `aborted` if the walk was interrupted), `travel`,
`switch`, `map`, `step`, `script`, `enter`, `start`, or `external` (a Reality signal). An entry may carry `picks`,
`maps`, `rnd` (the random draws), `mg` and `mgt` (minigame results and, since 4.1.17, their transcripts), `skipAt`,
`ran`, `digest` and `t` (ms since the start; playtests read it, `replay` ignores it).

**Minimal example** (abridged from [`tests/fixtures/formats/session.json`](../../tests/fixtures/formats/session.json)):

```json
{
  "kind": "web-scumm-session",
  "game": "signals",
  "v": 1,
  "at": 1791329746159,
  "session": {
    "v": 1,
    "start": { "kind": "new" },
    "base": { "v": 1, "room": "hall", "inventory": [], "flags": {}, "props": {}, "actors": {}, "hero": {},
              "unlocked": [], "visited": {}, "counters": {}, "seen": {}, "started": 1791329686159 },
    "log": [{ "start": "new", "ran": ["rule:game/start"], "digest": "86c55b44" }]
  },
  "trace": []
}
```

**Constraints.** The file must hold a session with a `log` list and a `start.kind`: otherwise "not a session file". A
session that starts from a save needs its `base`. A session holds at most 500 entries: the next input starts a new
session from the current state.

**Compatibility.** A bare session (the `session` object alone) is read too. A session recorded before 4.1.14 has no
`seed`; one recorded before 4.1.15 has no `variant` and replays in the story world; one from 4.1.16 has no `mgt` and
replays as it was. With a `variant`, the replay rebuilds that world from its stored assignment.

**Unknown fields.** At the top level, `parseSessionFile` keeps only the fields above and drops the rest; a `device`
outside the three values is dropped, and so are `misses` keys not shaped `room/target` and journal events it does not
recognise. The `session` object is taken as it is.

**Replay it**, in the engine repository (the game is `GAME`, otherwise `package.json`'s `config.game`):

```sh
# in the engine repository
npm run replay -- demo-session.json
```

It prints the journal and the final state, and exits 1 where the replay stops matching the recording. A created
project has no `replay` script.

> [!GUARANTEE id=session-replays]
> The session file format of 4.1.7 is frozen in a fixture: its keys are checked, and it replays to the digest it
> recorded. A change of the format is a change of that test.

<a name="session-reality"></a>
<!-- applies: .. since 4.1.8 -->

## Reality signals in the session and the save

A signal from the Reality Bridge is a session entry,
`{ "external": { "id", "sequence", "signal", "source", "receivedAt", "playerId" } }` (plus `evidenceHash`, and
`skipped: "expired" | "signal"` for a signal signed by the Bridge but refused for good, recorded so the cursor moves
past it with no effect). `npm run replay` applies it offline, with no Bridge. A session never keeps a token, an
email, a credential or the connector's payload.

The save keeps the last sequence received without a gap and the ids above it (`state.reality`: `cursor`, `applied`),
so a signal delivered again (the Bridge delivers at least once) is recognised and not applied twice.

The transport keeps three cursors (since 4.1.8): *received*, the last sequence the Bridge sent; *delivered*, the
last one handed to the game; *durable*, the last one acknowledged, after the save. Every request to the Bridge, a
poll or a reconnection, asks from the durable one. A signal handed over and not acknowledged (a refusal that may pass
later, a save that failed, a crash before the acknowledgement) is delivered again on the same connection, with a wait
that grows up to a minute while nothing settles: a poll asks again; a stream the Bridge keeps open is ended by the
player after that wait and reopened from the durable cursor. Before 4.1.8 the transport asked from the delivered
cursor, so such a signal waited for a full reconnection.

The first signal binds the save to its pseudonymous player (`state.reality.playerId`, the `p-…` the Bridge gave at
pairing; never the capability). A save that reaches a device linked as someone else (imported from another device,
or saved before an unlink and a new pairing) is a **mismatch**: nothing of it is applied or acknowledged, the game
plays on, and the pause menu's "World link" offers to use this device's link with that save. Its link state then
starts over for this player (cursor 0), and the signals whose effect the save already has are not applied again. The
solver's worlds name no player, so they bind nothing.

The Bridge's side of these guarantees: [Bridge guarantees](bridge.guarantees.md#session-and-save).

<a name="wsrun"></a>
<!-- applies: .. since 4.1.14 -->

## Speedrun proof (`.wsrun`)

The proof of one speedrun: the run's entries, chained by hashes, and the summary a leaderboard shows. Sources:
[`src/engine/tools/speedrun/envelope.ts`](../../src/engine/tools/speedrun/envelope.ts) (written),
[`src/engine/tools/speedrun/verify.ts`](../../src/engine/tools/speedrun/verify.ts) (read). ADRs 0016, 0017, 0019.

**Schema 2 (written since 4.1.16, `SpeedrunEnvelopeV2`).**

| Field | Meaning |
|---|---|
| `format`, `schema` | `"web-scumm-speedrun"`, `2`. |
| `gameId`, `fingerprint` | The game, and its fingerprint (`logic`, `trustedExtensions`, `presentation`, `engine`) as written, before any world. |
| `engineVersion`, `prngVersion`, `timingVersion` | The engine's, the generator's and the durations' versions. |
| `categoryId`, `rulesVersion` | The category and its rules' version. |
| `runSeed` | The run's generator seed, never the world's. |
| `variant` | The exact world played, assignments included: never regenerated from a seed. |
| `worldEvidence` | For a Daily world `{ kind: "daily", token }`; for a Mystery world `{ kind: "mystery", commitmentToken, revealToken, startedAt }`: the Bridge's signed tokens, as received (each at most 4096 characters). |
| `timing` | `rtaMs`, `logicalSteps`, `logicalTime`, `activeTime` (the last three decimal strings), `excluded` (the declared pauses, menus, background, loads and saves: `{ kind, entry, atMs, durationMs }`). |
| `splits` | The recorded splits. |
| `chunks` | The entries in chunks of 500, each `{ index, prevHash, hash, entries }`, chained by SHA-256 from `h0` to the last hash. |
| `loads`, `inputsUsed`, `realitySignals` | Optional: the loads, the inputs used (`mouse`, `touch`, `keyboard`, `gamepad`), the Reality signals (each with the Bridge's JWS, its hash and the client's verdict). |
| `h0` | The chain's head: the hash of the rules. In schema 2 it also seals the world (its hash, the category's world policy, the evidence's hash, the Remix algorithm's version): the same inputs in two worlds are two runs. |
| `finalStateHash`, `finalProof` | The hash of the final state's logical part; the proof sealing the last chain hash with the timing, splits, final state, loads and signals. |
| `trust` | Always `local` when exported. |

Every hash is over `canonicalJson`, and the file itself is written as canonical JSON. The chain shows that the file
was not altered after it was sealed; it does not show that the client was honest. A verifier replays the run, and
only a witness raises its trust. The full description of categories, timing and trust levels is in
[Speedrun for authors](create.speedrun.md#proof).

**Minimal example** (the shape, values abridged):

```json
{
  "format": "web-scumm-speedrun",
  "schema": 2,
  "gameId": "demo",
  "fingerprint": { "logic": "…", "trustedExtensions": "…", "presentation": "…", "engine": "…" },
  "engineVersion": "4.4.0",
  "prngVersion": 1,
  "timingVersion": 1,
  "categoryId": "any",
  "rulesVersion": 1,
  "runSeed": "…",
  "variant": { "seed": "story", "mode": "story", "…": "…" },
  "timing": { "rtaMs": 61000, "logicalSteps": "42", "logicalTime": "58000", "activeTime": "57000", "excluded": [] },
  "splits": [],
  "chunks": [{ "index": 0, "prevHash": "<h0>", "hash": "…", "entries": [{ "start": "new" }] }],
  "h0": "…",
  "finalStateHash": "…",
  "finalProof": "…",
  "trust": "local"
}
```

**Constraints, as the verifier reads the file.** It must be JSON of format `web-scumm-speedrun` and schema 1 or 2
(another schema: `unsupported-version`). Every field must be present with its type (`envelope-shape`); a schema 2 run
must name its world (`world-missing`), and its evidence must be a Daily or a Mystery proof (`world-shape`). Then the
versions: a generator, durations or engine version other than the verifier's is `unsupported-version` ("replay it
with that version's archive"). Chunks must be contiguous, linked and full but the last. The checks after that
(category, seed policy, replay, timing, splits, final state) are described in
[Speedrun for authors](create.speedrun.md).

**Compatibility.** A schema 1 file (4.1.14 and 4.1.15: an optional `seed`, no `variant`) is still read, as a Story
run. Offered to a Remix category it is refused (`legacy-world-missing`), never requalified from its seed.

**Unknown fields.** Refused: "unknown field(s) in the envelope: …", code `envelope-shape`, verdict `invalid-replay`.
A schema 1 field in a schema 2 envelope (`seed`) is unknown too.

> [!GUARANTEE id=wsrun-unknown-field-refused]
> A `.wsrun` file with a field the verifier does not know is refused with `envelope-shape`, naming the fields; a
> schema 1 field in a schema 2 envelope counts as unknown.

Verify one:

```sh
# in the engine repository
npm run speedrun:verify -- run.wsrun
# in a created project
npx quest-n-click speedrun verify run.wsrun
```

<a name="storyboard"></a>
<!-- applies: .. since 4.1.0 -->

## `storyboard.json`

The script of a game, in `games/<id>/storyboard.json`: the source of truth for every text, the rooms are written
from it. Sources: [`tools/pages/storyboard-data.ts`](../../tools/pages/storyboard-data.ts) (normalisation and
checks), [`tools/pages/storyboard-schema.md`](../../tools/pages/storyboard-schema.md) (the schema, commented).

**Schema.** `{ title?, intro?, boards: Board[] }`. A board: `id`, `title`, and optionally `room` (a room id: its
decor is shown), `goal`, `music`, `arrival` (lines), `panels` (in play order: `{ id, title, action?, lines?, sfx? }`,
the `id` unique across the storyboard), `talks` (topics per character id: `{ topic, lines }`), `reactions`
(`{ action, lines }`, not needed to finish), `hints` (vague to precise) and `exit`. A line is
`{ "who": "<speaker>", "text": "…" }`: `who` is a character id, `hero` (always the hero), `action` (a player action)
or `stage` (a stage direction); an unknown id is shown as it is.

**Minimal example:**

```json
{
  "boards": [
    {
      "id": "kitchen",
      "title": "The kitchen",
      "room": "kitchen",
      "goal": "Get the key.",
      "panels": [
        { "id": "kitchen-1", "title": "The drawer", "action": "Open drawer",
          "lines": [{ "who": "hero", "text": "Empty. Of course." }] }
      ],
      "hints": ["Something in this kitchen opens.", "Look in the drawer."]
    }
  ]
}
```

**Constraints** (`storyboardProblems`, the same sentences in the page generator, the local Studio, the hosted Studio,
the Studio demo and the MCP's `set_storyboard`): the file is an object with a `boards` list; each board is an object
with an `id` (a string or a number); `panels`, when present, is a list of objects; a line list holds lines written
`"text"`, `[who, text]` or `{ who, text }`. A storyboard with a problem is refused and nothing is written. A file
that is not JSON is reported as "storyboard.json: invalid JSON (…)".

**Tolerated forms**, normalised when read: `talk` for `talks`; `talks` as a list `[{ "who", "topics" }]`; topics
written `{ "q", "answer" }`; `optional` for `reactions`; a line written as a plain string (the hero says it) or as
`["who", "text"]`. A panel without an `id` or a `title` gets empty ones.

**Unknown fields.** The Studio and the MCP keep them: they read the raw file, edit the fields they know in place, and
write the whole object back (compactly; an unchanged storyboard is not rewritten). The review page and the Markdown
export (`npm run page:storyboard -- --md`, `games/<id>/storyboard.md`) only show the fields above.

How to write a storyboard: [The storyboard](create.storyboard.md).

<a name="groupings"></a>
<!-- applies: .. since 4.2.3 -->

## `groupings.json`

The groupings a team declares for the scenario map (a character, a puzzle, a chapter), in `games/<id>/groupings.json`.
A grouping only lists references to what the game already names; it never writes them. The map itself is never
stored: it is derived from the IR and this file. Source:
[`tools/studio/scenario-map.ts`](../../tools/studio/scenario-map.ts).

**Schema.** `{ "groupings": [{ id, kind, title, refs }] }`.

- `id`: lowercase letters, digits and `-`, starting with a letter or digit, at most 64 characters, unique in the file.
- `kind`: `character`, `puzzle` or `chapter`.
- `title`: 1 to 200 characters, not blank, with no control character or bidirectional override.
- `refs`: at most 500 references, each the IR's provenance key of something the game names (a room id, a rule, topic
  or listener id, `item:<id>`, `char:<id>`, `<room>.<entity>`, `objective:<id>`, `checkpoint:<id>`): no space, no
  control character, at most 200 characters, none named twice.
- At most 500 groupings.

**Minimal example:**

```json
{ "groupings": [{ "id": "the-key", "kind": "puzzle", "title": "The pantry key", "refs": ["kitchen", "item:key"] }] }
```

A reference the IR does not know is shown as "not declared" (a typo, an id written by code, something removed), never
guessed.

**Unknown fields.** Refused on write: "`<field>` is unknown" for an extra top-level field, "groupings[n].`<field>` is
unknown" for an extra field of a grouping; nothing is written. On read, a file edited by hand (by a person, an AI, a
merge) is not refused as a whole: the well-formed groupings are used (the first of a repeated id), the others are
left out with the reason, and the Map tab says what it skipped. Saving from the Studio then writes the readable ones.

> [!GUARANTEE id=groupings-unknown-refused]
> The groupings check names an unknown field of the file or of a grouping with the sentences above. It also names, one
> sentence each, a problem of shape, count, id, title or references.

On a hosted Studio, `groupings.json` is a span of its own. See [The map](studio.map.md).

<a name="notes"></a>

## `notes.json`

The shared log between the author and an AI assistant, in `games/<id>/notes.json`, shown in the Studio's Notes tab
and read by the MCP's `get_notes` and `add_note`. Sources:
[`tools/studio/types.ts`](../../tools/studio/types.ts) (`Note`, `NotesFile`),
[`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts) (read and write).

**Schema.** `{ "entries": [{ id, about, author, text, at, edited?, task? }] }`: `id` is given by the Studio (`n`
followed by a time-based suffix); `about` is a panel id, a room id, `room.entity` or free text; `author` is the
writer's name (on a hosted Studio, always the signed-in member's, never what the page sends); `at` and `edited` are
ISO dates; `task: true` marks a request from the author for an AI agent to pick up.

**Minimal example:**

```json
{
  "entries": [
    { "id": "n1a2b3c4", "about": "kitchen-1", "author": "you", "text": "Shorter line here?", "at": "2026-10-23T09:00:00.000Z" }
  ]
}
```

**Constraints.** A new note needs a non-empty `text`; an edit too, and its `about` must be a string; editing or
deleting an unknown id is "no such note" (404). A missing file reads as no note; a file that is not JSON is an error.
Writes are not in the Studio's undo history.

**Unknown fields.** A file without an `entries` list reads as empty. Fields of an entry the Studio does not know are
kept. Any other top-level field is dropped at the next write, which rewrites `{ "entries": … }` only.

<a name="build-files"></a>
<!-- applies: .. since 4.1.12 -->

## The files a build writes about itself

`npm run build`, in the engine repository or in a created project, writes, next to the game in `dist/`, the files
that describe the build. Sources: [`tools/vite/plugins.ts`](../../tools/vite/plugins.ts) (`sealBuild`),
[`tools/dist.ts`](../../tools/dist.ts), [`src/engine/tools/inventory.ts`](../../src/engine/tools/inventory.ts).

**`dist/site.json`** (since 4.1.12): the game's own `games/<id>/site.json` (its title, short name, description,
theme colour, language…) with two fields added: `trustedExtensions` (the hash of the game's code beside its content,
the fingerprint part a player cannot compute from the content) and `engine` (the engine's version). The player
receives the same two values in its code. A field the game's `site.json` holds is copied as it is.

**`dist/licenses/assets-manifest.json`** (since 3.7.1):

```json
{ "game": "demo", "assets": [
  { "key": "<asset key>", "path": "<path in dist>", "sha256": "…", "bytes": 1234, "licence": "CC-BY-4.0", "status": "…", "author": "…", "source": "…", "url": "…" }
] }
```

One entry per asset of `provenance.lock.json`, sorted by key; `author`, `source` and `url` come from the provenance
entry when it has them. `npm run verify:dist` refuses the build when the manifest does not list the same number of
assets with the same hashes as the lock ("licenses/assets-manifest.json: does not match provenance.lock.json"); it
reads no other field. The same folder holds `LICENSE`, `LICENSE-ASSETS`, `CREDITS.md` and `THIRD_PARTY_NOTICES.txt`.

**`dist/reality-manifest.json`**, only for a game that declares `reality`: see the next section.

For the build itself and its checks: [Build and release a game](create.build-release.md).

<a name="reality-manifest"></a>
<!-- applies: .. since 4.1.1 -->

## Reality manifest (`web-scumm-reality-manifest`)

The signals a game declares, with no secret, built from its content: what the Bridge checks proposals against.
Source: [`src/engine/reality/manifest.ts`](../../src/engine/reality/manifest.ts); read by
[`bridge/src/cli.ts`](../../bridge/src/cli.ts) and [`bridge/src/bridge.ts`](../../bridge/src/bridge.ts).

**Schema 1.**

```json
{
  "format": "web-scumm-reality-manifest",
  "schema": 1,
  "gameId": "signals",
  "signals": [{ "id": "mail.answer.correct", "source": "mail", "availability": "optional", "replay": "record" }]
}
```

`signals` is sorted by id; `availability` is `optional` or `required`; `replay` is `record`. `connectors` (since
4.1.9) is present only when the game declares it: what the game's connectors may turn into signals.

**Where it goes.** The build writes it to `dist/reality-manifest.json` when the game declares `reality`, and only
then. `quest-n-click-bridge init --manifest=<game>/dist/reality-manifest.json` copies it into the Bridge's
`config.json` with its hash (SHA-256 of its JSON text, keys in the order written).

**Constraints.** The Bridge refuses a signal the manifest does not declare. At start, it refuses a manifest whose
hash is not the one its configuration recorded ("the game's manifest (…) is not the one configured (…)"), or whose
`gameId` is not the configuration's. A game without `reality.signals` has no manifest: `init` says "the game
declares no reality.signals: nothing to bridge".

**Unknown fields.** The Bridge does not check the manifest's shape on `init`: a field it does not know is kept in its
configuration and counted in the hash. Editing the manifest held in `config.json` without running `init` again makes
the Bridge refuse to start.

The signals themselves: [Signals and the manifest](bridge.signals-manifest.md).

<a name="ir-and-fingerprint"></a>
<!-- applies: .. since 4.1.12 -->

## The game's IR and fingerprint

ADR 0013. [`src/engine/core/ir.ts`](../../src/engine/core/ir.ts) `compileIR` makes the game's intermediate
representation from the compiled game: its logic as plain data (rooms, entities, rules, scripts, objectives, Reality
policies, the world, the trusted extensions by name, the variant slot of 4.1.15), with the `file:line` of each id
when the sources are given (`provenanceOf`, from the object keys of the sources,
[`src/engine/core/source-keys.ts`](../../src/engine/core/source-keys.ts)).

**The IR as a file.** It is not stored: `npm run ir -- --json` prints it, the same text for the same sources (engine
repository; `--game <id>` for another game; without `--json`, a readable outline). Its top level is `schema` (1 since
4.1.12), `engine`, `gameId`, `world`, `rooms`, `entities`, `rules`, `scripts`, `objectives`, `reality`,
`extensions`, `variant` and `provenance`. Within schema 1 a field may be added, and a field's meaning never changes.

```sh
# in the engine repository
npm run ir -- --json > demo-ir.json
```

The runtime, the solver and the replay keep reading `CompiledGame`: the IR is a projection of it. The ADR measured
the alternative: making the runtime read the IR would rewrite 641 reads and carry the presentation the IR leaves out.

**How each field counts.** [`src/engine/core/ir-fields.ts`](../../src/engine/core/ir-fields.ts) classifies every
field of a game, a room and an entity, checked by the compiler (a field added without a class does not compile):
`logic` is in the IR and the fingerprint's `logic`; `presentation` in its `presentation`; `both` splits (the IR keeps
the logic part, the presentation the whole); `meta` is for the tools only.

The game (`GameDef`):

- **logic**: `schemaVersion`, `id`, `saveVersion`, `hero`, `players`, `hintItem`, `hintVoice`, `rules`, `scripts`,
  `events`, `globalTalk`, `start`, `reality`, `checkpoints`, `invariants`, `migrations`, `objectives`, `remix`,
  `variant`
- **both**: `verbs`, `characters`, `items`, `rooms`, `map`
- **presentation**: `title`, `renderer`, `audio`, `skin`, `ending`, `saves`, `settings`, `input`, `actorGap`, `ui`,
  `titleScreen`, `creditsScreen`, `credits`
- **meta**: `lang`, `offline`, `lint`, `i18n`, `assetBudgets`, `speedrun`

A room (`RoomDef`):

- **logic**: `id`, `name`, `hotspots`, `look`, `on`, `talk`, `hints`, `onEnter`, `scripts`, `events`, `hero`,
  `anchors`
- **both**: `props`, `actors`, `exits`, `stage`
- **presentation**: `decor`, `music`, `renderer`
- **meta**: `description`, `furniture`

The field-by-field DSL reference: [DSL reference](create.dsl.md#field-counts).

**The fingerprint.** [`src/engine/core/canonical.ts`](../../src/engine/core/canonical.ts) `canonicalJson` writes one
text per value in every runtime (NFC, sorted keys, no `-0`, big integers as strings).
[`src/engine/core/fingerprint.ts`](../../src/engine/core/fingerprint.ts) hashes it with WebCrypto (SHA-256) into four
components:

- `logic`: the IR without its provenance;
- `trustedExtensions`: the build's hash of the game's code beside its content (`__TRUSTED_EXTENSIONS__`, also written
  into `dist/site.json`);
- `presentation`: `presentationOf`, every presentation field and the asset manifest;
- `engine`: its version and `prngVersion` (reserved).

The fingerprint is not a file of its own: a `.wsrun` carries it, and a save slot's `meta.revision` carries the content
fingerprint it was made in. The pause menu's fingerprint row (`ui.fingerprint`, "Build" by default) computes it on
demand, on the game as written (before a translation), and shows the first eight digits of each component. The
objectives row (`ui.objectives`) opens the quest journal
([`src/engine/dom/objectives-menu.ts`](../../src/engine/dom/objectives-menu.ts)).

<a name="related"></a>

## Related identifiers and pages

- `npm run replay`, `npm run speedrun:verify`, `npm run ir` (engine repository); `quest-n-click speedrun verify`
  (created project).
- [State and saves](create.state-saves.md), [Speedrun for authors](create.speedrun.md),
  [Bridge guarantees](bridge.guarantees.md), [Execution model](engine.execution-model.md),
  [Architecture](contribute.architecture.md#storage).
