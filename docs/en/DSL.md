# The DSL, generated from its schemas

A game is data (`docs/en/CONTENT_GUIDE.md` shows how to write one): conditions and commands inside rooms, rules,
topics, listeners and scripts, typed by `web-scumm/content`. This page is the reference of that vocabulary, generated
by `npx tsx tools/dsl-doc.ts` from the schemas the tools themselves read: the Studio's forms (`src/studio/schema.ts`),
the IR's schema (`src/engine/core/ir-schema.ts`) and the table that says what each field of a game counts as
(`src/engine/core/ir-fields.ts`). `tests/dsl-doc.test.ts` fails when the page is behind them, so what you read here is
what the validator, the solver and the Studio accept.

## Stability

Since 4.1.12 the names and meanings listed below are **stable** (D22): a change to one is a break that ships with its
migration of the bundled games and saves. What may still grow until 4.1.15, and what is frozen after it for 4.2, is
written in `docs/dev/DSL-STABILITY.md`, with the primitives proposed for this release and why each was admitted or
refused. A new primitive enters with a short decision record and reaches the runtime, the validator, the solver, the
replay, the Studio, MCP and this page (`tests/propagation.test.ts`).

## The game as the tools see it

`npm run ir` prints the game's intermediate representation: its logic as plain data, each id with the file and line
that writes it. The Studio's **Language** tab shows the same, and MCP's `get_ir` returns it. The game's fingerprint
hashes it (`logic`), with the trusted extensions, the presentation and the engine apart; the pause menu shows its
short form. See `docs/dev/adr/0013-game-ir-and-fingerprint.md`.

## Reference

<!-- dsl-doc:begin -->
### Conditions

A condition is data: a string for a flag, an object for the rest, nested with `not`, `all`, `any`.

| Written | Means |
|---|---|
| `'flag'` | The flag is set (true, a number other than 0, a word). |
| `'!flag'` | The flag is false or was never set. |
| `{ has: 'item' }` | The player holds the item. |
| `{ flag: 'x', eq?: value, gte?: n, lt?: n }` | The flag's value equals, reaches or stays under a number. |
| `{ not: cond }` | The condition does not hold. |
| `{ all: [cond, …] }` | Every condition holds. |
| `{ any: [cond, …] }` | At least one condition holds. |
| `{ visited: 'room' }` | The room has been entered at least once. |
| `{ room: 'room' }` | The player is in this room. |
| `{ prop: ['room.prop', 'state'] }` | The prop is in that state. |
| `{ unlocked: 'place' }` | The place is unlocked on the map. |
| `{ seen: 'key' }` | The topic, choice or listener was already seen. |
| `{ actorIn: ['who', 'room'] }` | The character is in that room. |
| `{ player: 'who' }` | This character is the one the player controls. |

### Commands

A command is one key of `CMD_KEYS`; its fields are the Studio form’s. A plain string is the hero’s line.

| Command | Shape | Does |
|---|---|---|
| `say` | `{ say: [who, line], id?: id, shout?: true, voice?: id }` | A character says a line (a plain string is the hero). |
| `walk` | `{ walk: target \| [x, y], who?: who }` | A character walks to a thing or a point. |
| `face` | `{ face: target, who?: who }` | A character turns left, right or towards a thing. |
| `pose` | `{ pose: [who, pose] }` | A character takes a pose until told otherwise. |
| `anim` | `{ anim: [who, pose], ms?: number, at?: … }` | A character plays a pose once, with commands at chosen frames. |
| `place` | `{ place: [who, at], face?: 'left' \| 'right' }` | A character appears at a point, without walking. |
| `wait` | `{ wait: number }` | Waits that many milliseconds. |
| `parallel` | `{ parallel: [[cmd, …], …] }` | Runs several lists at the same time, until all end. |
| `camera` | `{ camera: … }` | Moves the camera of a wide room: follow, pan, or centre on a thing. |
| `play` | `{ play: [prop, animation] }` | Plays a prop's animation. |
| `stopAnim` | `{ stopAnim: prop }` | Stops a prop's looping animation. |
| `launch` | `{ launch: { target: who, to: target \| [x, y], from?: target \| [x, y], height?: number, ms?: number, rotate?: number } }` | Throws a thing along a ballistic arc (presentation only). |
| `spring` | `{ spring: { target: who, axis?: 'x' \| 'y' \| 'rot', amplitude?: number, frequency?: number, damping?: number, ms?: number } }` | Makes a thing swing and settle (presentation only). |
| `path` | `{ path: { target: who, points: [[x, y], …], ms?: number, orient?: true } }` | Moves a thing along a smooth path (presentation only). |
| `follow` | `{ follow: { target: who, leader: who, offset?: [x, y], ms: number } }` | Keeps a thing next to another for a while (presentation only). |
| `prop` | `{ prop: [prop, state] }` | Puts a prop in a state. |
| `show` | `{ show: target, fade?: number }` | Shows a hidden thing, with an optional fade. |
| `hide` | `{ hide: target, fade?: number }` | Hides a thing, with an optional fade. |
| `gain` | `{ gain: item }` | The player gains an item. |
| `lose` | `{ lose: item }` | The player loses an item. |
| `used` | `{ used: item }` | Marks items used: kept, greyed, offered only to a rule that names them. |
| `set` | `{ set: flag }` | Sets a flag (true, or the value given). |
| `unset` | `{ unset: flag }` | Removes a flag. |
| `inc` | `{ inc: flag, by?: number }` | Adds to a flag counted as a number. |
| `unlock` | `{ unlock: place }` | Unlocks a place on the map. |
| `goto` | `{ goto: room, at?: id \| [x, y] }` | Takes the player to a room, at an entry or a point. |
| `map` | `{ map: true }` | Opens the travel map. |
| `moveActor` | `{ moveActor: [who, room], at?: id \| [x, y] }` | Moves a character to another room. |
| `emit` | `{ emit: event }` | Fires an event: the room's listeners, then the game's. |
| `waitUntil` | `{ waitUntil: cond }` | In a script: pauses until the condition holds. |
| `waitEvent` | `{ waitEvent: event }` | In a script: pauses until the event is fired. |
| `switchPlayer` | `{ switchPlayer: char }` | The player takes another playable character. |
| `transfer` | `{ transfer: [item, to] }` | Hands an item to another playable character. |
| `custom` | `{ custom: command, args?: … }` | Runs a custom command: its declared effects, then its browser code. |
| `startScript` | `{ startScript: script }` | Starts a script from its first command. |
| `stopScript` | `{ stopScript: script }` | Stops a script until it is started again. |
| `sfx` | `{ sfx: sfx, caption?: text }` | Plays a sound effect, with an optional caption. |
| `music` | `{ music: … }` | Changes the music: a track, push, pop, stop, once or a stinger. |
| `toast` | `{ toast: text, id?: id }` | Shows a short message at the top of the screen. |
| `shake` | `{ shake: number }` | Shakes the screen that many milliseconds. |
| `if` | `{ if: cond, then: [cmd, …], else?: [cmd, …] }` | Runs `then` when the condition holds, else `else`. |
| `once` | `{ once: [cmd, …], id?: id }` | Runs its list the first time only. |
| `nth` | `{ nth: [[cmd, …], …], id?: id }` | Runs the next list each time, the last one again after. |
| `cycle` | `{ cycle: [[cmd, …], …], id?: id }` | Runs its lists in turn, looping. |
| `random` | `{ random: [[cmd, …], …], id?: id }` | Runs one of its lists at random (recorded for replays). |
| `cutscene` | `{ cutscene: [cmd, …] }` | Runs a list the player can skip. |
| `choice` | `{ choice: [{ id?: id, text: text, if?: cond, once?: true, do: [cmd, …] }, …] }` | Offers the player options, each with its commands. |
| `minigame` | `{ minigame: minigame, params?: …, then?: [cmd, …] }` | Starts a minigame, then runs `then`. |
| `phone` | `{ phone: char, do: [cmd, …] }` | An incoming call from one or several characters. |
| `guide` | `{ guide: { verb: verb, target: target, say: text }, id?: id }` | A tutorial step: waits for that verb on that target. |
| `talk` | `{ talk: char }` | Opens a conversation with a character. |
| `hint` | `{ hint: true }` | Gives the next hint of the room. |
| `ending` | `{ ending: true, after?: [cmd, …] }` | The sealed ending: decrypted, scratched, celebrated, then its card. |
| `reveal` | `{ reveal: true, after?: [cmd, …] }` | The old name of `ending` (removed in 5.0). |
| `end` | `{ end: true }` | Ends the game. |

### Objectives (`GameDef.objectives[id]`)

| Field | Type | Means |
|---|---|---|
| `title` | string | What the quest journal shows (translated under `objectives/<id>.title`). |
| `done` | cond | Done the first time this condition holds after an action; best a condition that stays true. |
| `optional` | boolean (optional) | A side objective: not part of 100% (`npm run solve -- --goal=100%`). |
| `parent` | string (optional) | The objective this one is a step of: shown under it. |

### How each field counts (IR and fingerprint)

From `core/ir-fields.ts`: `logic` is in the IR and the fingerprint’s `logic`; `presentation` in its `presentation`; `both` splits; `meta` is for the tools only.

The game (`GameDef`):

- **logic**: `schemaVersion`, `id`, `saveVersion`, `hero`, `players`, `hintItem`, `hintVoice`, `rules`, `scripts`, `events`, `globalTalk`, `start`, `reality`, `checkpoints`, `invariants`, `migrations`, `objectives`, `remix`, `variant`
- **both**: `verbs`, `characters`, `items`, `rooms`, `map`
- **presentation**: `title`, `renderer`, `audio`, `skin`, `ending`, `saves`, `settings`, `input`, `ui`, `titleScreen`, `creditsScreen`, `credits`
- **meta**: `lang`, `offline`, `lint`, `i18n`, `assetBudgets`, `speedrun`

A room (`RoomDef`):

- **logic**: `id`, `name`, `hotspots`, `look`, `on`, `talk`, `hints`, `onEnter`, `scripts`, `events`, `hero`, `anchors`
- **both**: `props`, `actors`, `exits`, `stage`
- **presentation**: `decor`, `music`, `renderer`
- **meta**: `description`, `furniture`
<!-- dsl-doc:end -->
