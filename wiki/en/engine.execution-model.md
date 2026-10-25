# Execution model

What the engine does between a tap and the next frame: which reaction answers an action, in which order rules are
tried, what each command changes, when the state is saved, how time is counted, where randomness comes from, and why
the same inputs always land on the same state. Every statement here is read from `src/engine/core`; the file is named
each time, so you can check it against your version.

<a name="why"></a>

## Why one model

The same `Engine` class ([`engine.ts`](../../src/engine/core/engine.ts)) runs in the browser, in the node tests, in
the solver and in the replay tool. It knows nothing of the page: everything it shows goes through a `Presenter`
([`ports.ts`](../../src/engine/core/ports.ts)), everything it keeps goes through a `SaveStore`. The browser plugs the
real ones in; the solver and the tests plug a silent presenter and a memory store. So the order of effects described
below is not a description of the browser only: it is what the solver proves and what a replay reproduces
([What the solver proves](create.solver-proofs.md)).

<a name="action-cycle"></a>

## The action cycle

1. **Input.** The player picks a verb, then taps something (or an inventory item, then a target). The input layer
   ([`src/engine/dom/input.ts`](../../src/engine/dom/input.ts)) turns it into an intention
   (`{ kind: 'act', verb, target, item }`); the presenter calls `engine.act({ verb, a, b })` (since 4.1.11). A double
   tap picks the verb the player most likely means
   ([`default-verb.ts`](../../src/engine/core/default-verb.ts)).
2. **Busy check.** `Engine.act` returns `null` and does nothing while the engine is busy (an action, a cutscene, a
   conversation, a script step running). During a tutorial step (`{ guide }`), only the awaited verb on the awaited
   target is accepted; any other action makes the hero repeat the instruction and answers `'guide'`.
3. **Session entry.** The action opens an entry of the session (`{ act }`,
   [`session-runtime.ts`](../../src/engine/core/session-runtime.ts)): one logical step of the run clock.
4. **Approach.** When the target is in the scene (not in the inventory), the hero walks to its approach point (from
   the layout) and both turn to face each other. A walk the player interrupts marks the entry `aborted`: nothing else
   happens, and a replay of that entry does nothing either.
5. **Resolution.** `resolve` ([`interactions.ts`](../../src/engine/core/interactions.ts)) finds the one reaction that
   answers (next section) and runs its commands.
6. **Commands.** The commands run one by one through `exec`
   ([`command-runtime.ts`](../../src/engine/core/command-runtime.ts)); each changes `engine.state` and calls the
   presenter (speak, walk, change a prop, play a sound…).
7. **Save.** When the outermost run ends (`Engine.run`, the busy counter back to zero), the engine saves: the
   objectives are checked, then the state goes to the `SaveStore`. In the browser that is `IndexedDbSaveStore`
   ([`save-store.ts`](../../src/engine/dom/save-store.ts)), which writes a versioned envelope
   ([`save.ts`](../../src/engine/core/save.ts)) and reads it back before saying it is saved; the manual slots live in
   the same database, as envelopes, verified too; `localStorage` is the compatibility fallback. The whole state is
   plain JSON, a `GameState` ([`types/state.ts`](../../src/engine/core/types/state.ts)): room, inventory, flags,
   props, counters, what was seen. The file format is on [File formats](engine.file-formats.md#save).
8. **Render.** `App` ([`app.ts`](../../src/engine/dom/app.ts)) is the browser's presenter: the room view
   ([`room.ts`](../../src/engine/dom/room.ts), painted by the DOM or, on demand, by Canvas), speech
   ([`speech.ts`](../../src/engine/dom/speech.ts)), the inventory, music
   ([`director.ts`](../../src/engine/dom/director.ts), [`audio.ts`](../../src/engine/dom/audio.ts)). See
   [How the engine works](engine.how-it-works.md#scene-frame).

**Conversations.** A conversation is one action until "Bye". Since 4.3.0 (#218) it is also saved after each topic,
so what a topic changed survives a page that dies before "Bye". Only when the conversation is the rest of its action:
the talk verb on a character with topics, or a `{ talk }` that is the last command of a rule. A talk followed by more
commands, a talk inside a cutscene or inside a topic is saved at the action's end, never with half a `do` done. A save
holds no open conversation: loaded, it lands in the room, with the topics seen marked.

**Room entry also saves.** Entering a room (`enter`, [`movement.ts`](../../src/engine/core/movement.ts)) sets the
room, emits `roomEntered`, places the hero (at the entry asked, else where it last stood, else the layout's `default`
entry, else `[320, 360]`), counts the visit, **saves**, then shows the room, the inventory and the room's music, and
only then runs the room's `onEnter` and starts its scripts (when the entry came from a `goto` or the map).

**Between actions.** The world's scripts advance one command each (`ScriptDef`, `Engine.advance`): NPC strolls,
ambient gags, a character who `moveActor`s to another room when an `emit`ted event wakes its `waitEvent`. Their
position lives in the state, so a save resumes them. See [Events and scripts](#events-and-scripts).

<a name="reaction-order"></a>

## Which reaction answers an action

`resolve` tries these, in this order, and stops at the first that answers. The returned *source* (`'rule'`,
`'look'`, `'talk'`, `'hint'`, `'kind'`, `'refuse'`, `'fallback'`) is what the solver and the session read.

| Order | What | When it answers |
|---|---|---|
| 1 | A written **rule of the room** (`room.on`) | The first rule, in written order, whose verb matches, whose `if` holds, and whose `a` / `b` match the action |
| 2 | A written **rule of the game** (`rules.on`) | Same test, after every room rule |
| 3 | **Look** lines | Verb `look` with no second object: the room's `look[a]`, else the item's `look` when it is in the inventory |
| 4 | **Talk**: the hint item | Verb `talk` on the game's `hintItem` while it is in the inventory: the current room's first hint whose `until` is still false |
| 5 | **Talk**: a conversation | Verb `talk` on an actor that has topics in this room (`room.talk[a]`) |
| 6 | A **kind** reaction (`rules.kinds`) | First one aimed at that exact target, else the first one for a kind the target has; an `item` constraint only matches with a second object |
| 7 | **Give** to another playable character | Verb `give` to a playable character other than the active one, the item in the inventory, inventories not shared: the item moves to their inventory (source `'rule'`) |
| 8 | The character's **refusal** | Verb `give` to a character whose sheet has `refuse` |
| 9 | A **fallback** line | Always: `rules.fallbacks[verb]` (`use2` for "use A on B"), else the `look` fallbacks, else `…` |

How a rule matches (`findRule`):

- **Room before game, then written order.** Room rules are all tried before any game rule; inside each list the first
  match wins. There is no other priority: no specificity score, no weight.
- **Exits come after the written rules of their room.** A declared exit becomes a hotspot of kind `exit` and rules
  appended at the end of `room.on` ([`define.ts`](../../src/engine/core/define.ts) `normalizeExits`): "verb on the
  exit → `goto`" when its condition holds, then its `locked` line. A written rule on the same exit therefore wins.
- **`a` and `b`.** A rule without `b` only answers an action without a second object; a rule with `b` only answers one
  with it. `a` or `b` may be a list of ids. When both objects are inventory items, the order does not matter: "use A on
  B" also matches a rule written for B on A.
- **`if`.** The rule's condition is evaluated against the state at the moment of the action (after the approach walk).

Only a written rule (or a hint) moves the game forward for the solver; look lines, kinds, refusals and fallbacks are
answers the player sees, nothing more. Rules, kinds and fallbacks are written as described on
[Reactions](create.reactions.md) and [Conditions](create.conditions.md).

<a name="command-effects"></a>

## How commands run and what they change

**One at a time, in order.** `exec` runs a `do` list command by command, awaiting each one (a line is awaited until it
is said, a walk until it arrives). It stops early in two cases: the engine was destroyed (`Engine.destroy`, a Studio
preview closed), or the game ended (`state.done`). A plain string in a list is a line the hero says.

**Each command, through one table.** `step` looks the command's key up in
[`command-handlers.ts`](../../src/engine/core/command-handlers.ts). The catalogue of keys is
[`cmds.ts`](../../src/engine/core/cmds.ts) (`CMD_KEYS`); a type check refuses a command declared in one place and not
the other. Before a command runs, the run clock is told its logical duration ([Time](#time-and-randomness)).

**What changes the state.** `CHANGES` in `cmds.ts` lists the commands that change the game's state: `prop`, `show`,
`hide`, `gain`, `lose`, `used`, `set`, `unset`, `inc`, `unlock`, `goto`, `map`, `moveActor`, `emit`, `switchPlayer`,
`transfer`, `custom`, `startScript`, `stopScript`, `minigame`, `phone`, `ending`, `reveal`, `end`. The others only show
something, with these exceptions read in the handlers: `walk`, `place`, the four motions (`launch`, `spring`, `path`,
`follow`), `face` and `pose` record where a character stands, faces or poses (`state.hero`, `state.actors`), and
`camera` records the camera.

Effects worth knowing, from the handlers:

| Command | Effect on the state | Journal event |
|---|---|---|
| `set`, `unset`, `inc` | Writes or removes a flag; `inc` adds `by` (default 1) to a number, starting from 0 | `flagChanged`, only when the value really changes |
| `gain` | Adds the item once; clears its `used` mark | `itemAcquired` when it was not held |
| `lose` | Removes the item, the state first, then the event | `itemLost` when it was held |
| `used` | Marks one or more items used (greyed, inert unless a rule still targets them) | — |
| `goto` | Enters the room (see "Room entry also saves") and runs its `onEnter` | `roomEntered` |
| `emit` | Runs the event (next section) | — |
| `once`, `nth`, `cycle`, `random` | Keep a counter under the block's key in `state.counters` | — |
| `minigame` | Plays it; a result it reports is written in the reserved flag `minigame.<id>` (since 4.1.16), then `then` runs | `flagChanged` |
| `custom` | Runs the declared `effects` (commands) always; the `run` part only in the browser, never in the solver or a skipped cutscene. In dev, a state change by `run` outside its `effects` is reported | — |
| `end`, `ending`, `reveal` | Set `state.done`, check the objectives, save | `endingReached` |
| `waitEvent` | Nothing outside the top level of a script, where it pauses the script | — |
| `waitUntil` | Waits until the condition holds, woken by every state change, bounded by 100,000 rounds | — |

**Containers.** `if` runs `then` or `else`; `once` runs its list the first time only; `nth` runs list *n* on the
*n*-th time and stays on the last; `cycle` wraps around; `random` draws a branch, never the same one twice in a row
when it has more than one; `choice` offers the options whose `if` holds (and, for a `once` option, not taken yet), the
hero says the chosen text, then its `do` runs; `parallel` starts every branch at once and waits for all of them, so
their effects interleave; `cutscene` runs its list as skippable.

**The keys of `once`, `nth`, `cycle`, `random`.** `compileGame` gives each block a key: its `id` when you wrote one,
else its position (`<room>:on<i>.<j>`, `game:intro.<i>`…; [`define.ts`](../../src/engine/core/define.ts)
`assignKeys`). The counter is saved under that key. Reorder the content above an unnamed block and its key changes: a
save made before then counts it from zero again. Give an `id` to a block whose memory matters
([State and saves](create.state-saves.md)).

**Skipping.** `skip()` during a cutscene makes the remaining commands run *fast*: their state effects all happen, their
presentation is cut (`sfx` and `shake` are not played, walks and waits end at once). The session records after how
many commands the skip happened (`skipAt`), so a replay skips at the same point.

> [!LIMIT id=parallel-order]
> Inside a `parallel`, branches run concurrently: the order in which their state effects land depends on how long each
> presenter call takes. The silent presenter of the solver and of a replay answers at once, so a branch's effects are
> ordered the same way there each time, which may not be the browser's order. Keep the branches of a `parallel`
> independent (presentation in one, state in at most one).

<a name="events-and-scripts"></a>

## Events and scripts

**An `emit`** ([`event-runtime.ts`](../../src/engine/core/event-runtime.ts)) does three things, in this order:

1. Every script of the game and of every room (not only the current room's) that is paused on `waitEvent` for this
   event moves past it.
2. The current room's listeners (`room.events`) whose `on` is the event and whose `if` holds run, in written order. A
   `once` listener that already ran is skipped, and is marked seen before it runs.
3. Then the game's listeners (`events`), the same way.

The listeners run inside the action that emitted, so the action is saved once they are done.

**Scripts** ([`script-runtime.ts`](../../src/engine/core/script-runtime.ts),
[`scheduler.ts`](../../src/engine/core/scheduler.ts)). In the browser, scripts run on their own (`autoScripts`):
the current room's scripts start on each room entry, the game's on a new session; each loop calls `advance`, and waits
250 ms whenever nothing ran. In node (tests, the solver) they only move when stepped. One `advance`:

- does nothing (`blocked`) while the engine is busy with an action, a cutscene, a conversation or a minigame, or the
  game has ended;
- with a `while` condition that is false, rewinds the script to its first command and waits;
- on `waitUntil`, moves on only when the condition holds; on `waitEvent`, waits for the `emit`;
- otherwise runs exactly one command, then saves when the engine is idle;
- at the end, stops (`done`), or starts again from the top when the script has `loop`.

Changing room ends the room's loops at their next step; a new session (new game, load, checkpoint) and a player switch
end the game's loops too and start them again. A script that throws is stopped and marked `off` in the state, so a
save does not show it alive. The position of each script (`pc`, and since v3 saves its named `step`, which follows
the script when its commands are reordered) is in the state.

The solver plays scripts as actions ("Script &lt;id&gt;", run up to its next `wait`, so a patrol is seen room by room),
tries every option of a `choice` (the path reads `Talk x: "topic" › "reply"`), and keeps the exact value of a counter
that is ever lowered or set to a number. See [What the solver proves](create.solver-proofs.md).

<a name="time-and-randomness"></a>

## Time and randomness

ADR 0016 and decision D24 (4.1.14). Three clocks coexist, and none of them is an authority for the game's logic.

- **`Engine.clock`**: wall-clock milliseconds, set by the browser only. It dates the session and each entry's `t`.
  The solver and the tests set none, so their sessions are byte-identical from one run to the next. The state's
  `started` field also comes from it (else `Date.now()`); it is not part of the state digest.
- **The run clock** ([`run-clock.ts`](../../src/engine/core/run-clock.ts), `EngineRunClock`, `Engine.runClock`; `Engine.clock`
  keeps its meaning, the run clock is a new name): what a
  speedrun is timed with. The core tells it of every session entry (one logical step), of every command before it runs,
  of every line said, of every approach walk that arrived, of every room entered at a point and of every cutscene
  entered and left. It keeps its own counters (`bigint` microticks, 1 ms = 1,000) and **never writes the state**;
  nothing the content does can depend on it. `monotonicNow()` is real time (RTA), never an authority.
- **Logical durations** ([`timing.ts`](../../src/engine/core/timing.ts), `TIMING_VERSION = 1`; a run records the
  version and a verifier refuses another one):

| What | Logical cost |
|---|---|
| A line (a `say`, a plain string, a look, a fallback, a hint) | 2,200 ms, whatever its text, language or text speed (`SAY_LOGICAL_MS`) |
| A walk (the approach walk, a `walk` command) | Its distance from the character's last logical anchor, over `WALK_SPEED` = 150 units per second, rounded to the ms |
| `wait` | Its `ms` |
| `anim` | Its `ms`, default 800 |
| `camera` pan | Its `ms`, default 600 (`follow` and `reset` cost nothing) |
| `launch`, `spring`, `path`, `follow` | Their `ms`, default 900, 1,200, 1,500 and 0 |
| Anything run *fast* (a skipped cutscene) | Nothing (a walk still moves the anchor) |
| Anything else, a choice included | Nothing: the time a player thinks is real time (RTA) only |

What runs inside a cutscene counts in the in-game time (IGT) but not in the Active IGT. On screen a line lasts
`max(2,200, 70 ms per character) / text speed`; that presentation time is never counted.
Categories, splits and verification are on [Speedrun for authors](create.speedrun.md).

**The seeded generator** ([`prng.ts`](../../src/engine/core/prng.ts)): xoshiro128** over 32-bit integers
(`PRNG_VERSION = 1`), written with `Math.imul` and unsigned shifts only, so Node, Chromium, WebKit and Firefox draw the
same numbers from the same seed (`tests/fixtures/prng-vectors.json`). A seed is a string; `derive(seed, stream)` gives
independent streams: `logic`, `cosmetic`, `minigame:<id>`, `copy-protection`. A cosmetic draw never moves the logic's
sequence.

- `engine.random` draws from the run's `logic` stream (`Engine.sessions.seed`).
- A **new game** or a **checkpoint** starts a new run: a new seed (the host's `nextSeed` when it chose one, else 128
  fresh bits from WebCrypto; without WebCrypto, an error, never a guessable draw) and the run clock back to zero.
- A **load** continues the stream and the clock.
- The seed is written in the session (`Session.seed`) only when the host chose it (a speedrun category, a verifier); a
  session nobody seeded stays as it was before 4.1.14.
- **Every draw is recorded** in the entry that made it (`rnd[]`): the `random` command, and the choice of a fallback
  line (which also avoids repeating the previous one).
- Look lines and hints are not random: they cycle in order, with a counter in the state.
- Particles are seeded per emitter on the presentation clock, never with the engine's dice.
- `rnd[]` stays the trace: a verifier replays **without** feeding it and demands that the seeded draws equal it.

**The run's journal.** [`run-tape.ts`](../../src/engine/core/run-tape.ts) turns each entry into a link (the entry,
the semantic events from its beginning to the next one's, the run clock after it);
[`journal-chunks.ts`](../../src/engine/core/journal-chunks.ts) chains the links by SHA-256 into chunks of
`SESSION_MAX` = 500 entries (also the session's rollover), each written in one transaction
([`run-store.ts`](../../src/engine/dom/run-store.ts), IndexedDB `web-scumm-runs`) and read back checked. The speedrun
itself (categories, splits, the `.wsrun`, the verifier) is in `tools/speedrun/`: see
[Speedrun for authors](create.speedrun.md) and [File formats](engine.file-formats.md).

> [!GUARANTEE id=prng-same-seed-same-draws]
> The same seed gives the same draws, and the session names the seed it was given.

> [!GUARANTEE id=run-clock-never-writes]
> The run clock observes and never writes: the state is the same whether its readings are taken or not.

<a name="determinism"></a>

## Determinism: record, replay, prove

**What the session records.** Every input is an entry of `Engine.session`: an action, a map travel, a player switch,
a script step, an outside signal (Reality Bridge). Each entry keeps the answers it met on the way: the choices
(`picks`), the map picks (`maps`), the random draws (`rnd`), the minigames' results (`mg`, since 4.1.16) and their
transcripts (`mgt`, since 4.1.17), the skip point (`skipAt`), what answered (`ran`: the ids of rules, topics,
listeners, script steps), and in the browser a digest of the state after it. The digest covers the logical state
(`logicalState`, [`diff.ts`](../../src/engine/core/diff.ts)): positions, camera and timestamps are left out. A session holds at most 500 entries
(`SESSION_MAX`); the next input starts a new one from the current state.

**Replay.** `replay()` ([`src/engine/tools/replay.ts`](../../src/engine/tools/replay.ts), `npm run replay`) runs a
session on a fresh silent engine and feeds back the recorded answers instead of asking anyone; the scripts advance
exactly when they did. It lands on the same state, and says at which entry it diverges when it does not. By default the
recorded draws are fed back (and a missing draw is 0); given a seed, it drops the recorded draws and draws again from
the seeded stream. A minigame is never played again on a replay: its recorded result is used, and a recorded transcript
that does not give that result stops the replay.

**The solver** ([`src/engine/tools/solve`](../../src/engine/tools/solve/expansion.ts)) runs the same engine with its
own random source: for every draw it meets, it tries one representative value per branch of every `random` block of
the game, so each branch is explored. It leaves out of the state whatever cannot change the outcome (a flag read by
nothing but its own setter, a clock script nobody reads, a walker nobody waits for), so a decorative world costs it
nothing. It records what every action read (`Engine.reads`) and what answered (`SessionEntry.ran`): the profile
(`--profile`) says what the states are made of, and the partial-order reduction (`--por`,
[`por.ts`](../../src/engine/tools/por.ts)) skips orders of actions that commute. Its solution is a session
(`SolveResult.steps`), replayable like any other. Options are on [Solver options](create.solver-options.md).

**What makes this hold.** The engine's logic reads only the state, the content, the recorded answers and the seeded
generator. Wall-clock time only dates entries. Presentation (animation frames, the text speed, particles, the
renderer) never feeds back into the state: [How the engine works](engine.how-it-works.md#scene-frame).

> [!LIMIT id=determinism-scope]
> Determinism covers the engine's logic. A custom command's `run` part and a minigame's own code are trusted code the
> engine cannot check; only what they declare (`effects`) or report (a result, a transcript) enters the state and the
> session. Wall-clock time (`t`, `started`, RTA) differs from one run to the next.

<a name="alternatives"></a>

## Alternatives set aside

- **A line's logical cost as a function of its length**: refused in ADR 0016. A translation is presentation; a French
  run and an English run of the same route must have the same in-game time.
- **The presenter, or the frame rate, as a source of time**: refused by D21 and D24. A duration the player could
  shorten without an input the session records would make the time unverifiable.
- **`Math.random`**: the engine drew from it until 4.1.13, with `rnd[]` as a trace only. The seeded streams of 4.1.14
  let a verifier draw the same numbers again instead of trusting the trace.
- **A timer that changes the state on its own**: it would break replay (ADR 0004). Scripts move by steps that the
  session records, and the engine's clock is recorded, never read by the logic.

<a name="trade-offs"></a>

## Trade-offs

- Written order is simple to read and to reproduce, but an early broad rule silently shadows a later narrow one: put
  the narrow rule first. The engine has no other priority between rules.
- A save on every room entry and after every action means many small IndexedDB writes; each is read back before it
  counts.
- Position-based keys for `once`, `nth`, `cycle` and `random` need no authoring, but move when the content is
  reordered; an explicit `id` costs one word.
- One more observer on the hottest path of the core: a function call per command and per entry for the run clock
  (ADR 0016).
- The logical clock ignores how long the player really took to read or think; that is what RTA is for, and RTA is the
  client's word, not a proof.

<a name="decisions"></a>

## Decisions and ADRs

- [ADR 0002, declarative content](../../docs/dev/adr/0002-declarative-content.md)
- [ADR 0003, the solver runs the engine](../../docs/dev/adr/0003-solver-runs-the-engine.md)
- [ADR 0004, the session as the unit of reproduction](../../docs/dev/adr/0004-session-unit-of-reproduction.md)
- [ADR 0005, IndexedDB read back](../../docs/dev/adr/0005-indexeddb-read-back.md)
- [ADR 0011, scene frame, intents, journal](../../docs/dev/adr/0011-scene-frame-intents-journal.md)
- [ADR 0016, run clock and envelope](../../docs/dev/adr/0016-run-clock-and-envelope.md) (D24)
- [ADR 0020, minigame transcripts](../../docs/dev/adr/0020-minigame-transcripts.md)
- [Decisions](../../docs/dev/DECISIONS.md)
