# Scripts and events

Everything else in a game reacts to the player: a tap, a rule, its commands. Three primitives let the world act on its
own: **scripts** (things that happen without a tap), **events** (something just happened) and
[moving characters](create.moving-characters.md). They are data like the rest, so `validate`, `solve` and the save
understand them.

<a name="overview"></a>

## The world lives

A cat that stretches every few seconds, a neighbour who paces, a cook who comes when the gong rings: a script. A
key found that sends Grandpa home and shows a message, wherever the player is: an event and its listener. Which to use
for remembering things is on [flags, variables and events](create.flags-variables-events.md).

<a name="scripts"></a>

## Scripts: things that happen without a tap

A script is a list of commands that runs on its own, **one command at a time, in the gaps between the player's
actions**: never during an action, a cutscene, a conversation or a minigame. The engine resumes it at the next gap.
A room's scripts (`scripts` in the room) run while the player is in the room; the game's scripts (`scripts` in
`game.ts`) run everywhere.

```ts
scripts: [
  // Biscuit stretches every seven seconds, forever.
  { id: 'biscuit_naps', loop: true, stepIds: ['wait', 'stretch'],
    do: [{ wait: 7000 }, { anim: ['biscuit', 'stretch'], ms: 1200 }] },
  // Lou strolls between two spots until the deal is done; when `while` turns false the script rewinds and waits.
  { id: 'lou_paces', loop: true, while: '!bouquet_given', stepIds: ['w1', 'to-a', 'w2', 'to-b'], do: [
    { wait: 6000 }, { walk: [235, 262], who: 'neighbor' }, { wait: 3000 }, { walk: [147, 278], who: 'neighbor' },
  ] },
  // Once: the cook comes when the gong rings, then the script is done.
  { id: 'cook_comes', stepIds: ['gong', 'move', 'dinner'],
    do: [{ waitEvent: 'gong' }, { moveActor: ['cook', 'hall'] }, { say: ['cook', 'Dinner!'] }] },
],
```

| Field or command | Effect |
|---|---|
| `id` | Unique in the whole game (a script can be started, stopped or waited on from anywhere). |
| `stepIds` | One stable id per top-level command, required in schema 3: the save keeps the script's position by step id, so reordering its commands does not break a save. |
| `loop: true` | Starts again from the top when done. A loop must contain a `wait`, `waitUntil` or `waitEvent` (`validate`: `loop script "…" never waits`). |
| `while: COND` | Runs only while the condition holds; when it turns false, the script rewinds to its first command and waits. It is checked before every command: a script that `lose`s the item its `while` needs stops right there (gain the new item first, then lose the old one). |
| `{ wait: 3000 }` | A pause: the player keeps playing meanwhile. |
| `{ waitUntil: COND }` | Pauses until the condition holds (checked at every gap). |
| `{ waitEvent: 'gong' }` | Pauses until the event is emitted, even from another room. |
| `{ startScript: 'id' }`, `{ stopScript: 'id' }` | From any script or rule: start a script from the top (again, if done or stopped), or stop it. |

A script's position is saved with the game: it resumes where it was. Since a script's commands interleave with the
player's actions at the level of a whole command, keep each command short (a `walk`, a line, a pose), and put a
sequence that must not be interrupted in a `cutscene`. The solver lets scripts run, one step at a time, as one of its
choices ([what the solver proves](create.solver-proofs.md)).

> [!GUARANTEE id=scripts-between-actions]
> A script never runs a command while the engine is busy with an action, and a script whose `while` turns false
> rewinds to its first command.

> [!LIMIT id=script-not-skippable]
> A script cannot be skipped by the player, and it is not real time: a script never runs in the middle of the
> player's action or line, only between them.

<a name="events"></a>

## Events: "something just happened"

A flag is a state (the door *is* open). An event is a moment (the bell *just* rang). `{ emit: 'bell_rang' }` runs,
right there and in order: first it moves on every script paused on `{ waitEvent: 'bell_rang' }`, wherever it is; then
it runs the listeners of the current room (`events` in the room), then the game's (`events` in `game.ts`)
([`src/engine/core/event-runtime.ts`](../../src/engine/core/event-runtime.ts)).

```ts
// market.ts, in a rule:  { gain: 'key' }, { emit: 'key_found' }
// game.ts:
events: [
  { id: 'grandpa.goes-home', on: 'key_found', once: true, do: [{ moveActor: ['grandpa', 'house'] }, { toast: 'Grandpa went home.' }] },
],
```

| Field | What |
|---|---|
| `id` | Stable id, required in schema 3; a `once` listener is remembered as `event.<id>`. |
| `on` | The event's name. |
| `if` | The listener runs only if this holds when the event is emitted. |
| `once` | Only the first time. |
| `do` | The commands. |

**An event is not remembered**: to react later (next time the player enters a room), set a flag in the listener and
test it in `onEnter`. `validate` warns about an event emitted that nothing listens to, a listener of an event never
emitted, and a script waiting for an event never emitted.

> [!GUARANTEE id=emit-order]
> `emit` runs the current room's listeners and the game's; a `once` listener runs once.

The room's listeners run first, then the game's.

<a name="example"></a>

## A room that lives

A cat that stretches, a gong that calls the cook, a listener that reacts, checked by the validator:

```room-example
{
  "room": {
    "id": "hall",
    "name": "The hall",
    "decor": "decor/hall",
    "actors": { "biscuit": { "char": "biscuit" }, "cook": { "char": "cook", "visible": "dinner_called" } },
    "hotspots": { "gong": { "name": "gong" } },
    "look": { "biscuit": "Biscuit, asleep. Mostly.", "cook": "The cook.", "gong": "A brass gong." },
    "on": [
      { "id": "hall.ring-gong", "verb": "use", "a": "gong", "do": ["Bong.", { "emit": "gong" }] }
    ],
    "scripts": [
      { "id": "biscuit_naps", "loop": true, "stepIds": ["wait", "stretch"],
        "do": [{ "wait": 7000 }, { "anim": ["biscuit", "stretch"], "ms": 1200 }] },
      { "id": "cook_comes", "stepIds": ["gong", "called", "show", "dinner"],
        "do": [{ "waitEvent": "gong" }, { "set": "dinner_called" }, { "show": "cook", "fade": 800 }, { "say": ["cook", "Dinner!"] }] }
    ],
    "events": [
      { "id": "hall.gong-heard", "on": "gong", "once": true, "do": [{ "say": ["biscuit", "Mrrp?"] }] }
    ],
    "hints": [{ "id": "hall.hint", "until": "dinner_called", "lines": ["Ring the gong."] }]
  },
  "layout": {
    "walk": { "area": [[20, 300], [620, 300], [630, 395], [10, 395]] },
    "entries": { "default": [320, 360] },
    "hotspots": { "gong": { "rect": [500, 160, 70, 90], "approach": [530, 330] } },
    "actors": { "biscuit": { "x": 150, "y": 360 }, "cook": { "x": 420, "y": 350 } }
  },
  "characters": {
    "biscuit": { "name": "Biscuit", "color": "#ffd28a", "kind": ["cat"], "sprites": { "idle": ["cat/idle"], "stretch": ["cat/stretch"] } },
    "cook": { "name": "Cook", "color": "#8fd3ff", "sprites": { "idle": ["cook/idle"] } }
  }
}
```

<a name="related"></a>

## Related identifiers

- `ScriptDef`, `EventRule` in [`src/engine/core/types/content.ts`](../../src/engine/core/types/content.ts);
  [`src/engine/core/script-runtime.ts`](../../src/engine/core/script-runtime.ts).
- `emit`, `waitUntil`, `waitEvent`, `startScript`, `stopScript` ([commands](create.commands.md#world)).
- [Moving characters](create.moving-characters.md), [flags, variables and events](create.flags-variables-events.md),
  [the execution model](engine.execution-model.md).
