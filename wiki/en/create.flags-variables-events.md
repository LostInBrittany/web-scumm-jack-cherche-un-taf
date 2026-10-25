# Flags, variables and events: which to use

A flag is a state: the door *is* open. An event is a moment: the bell *just* rang. quest'n'click has no separate
"variable": a flag holds a value (a boolean, a number or a string), so a counter or a choice is a flag too. This page
says what each one is, what the engine keeps of it, and how to choose.

<a name="why"></a>

## What each one is

**A flag** is a named value in the save (`GameState.flags`), set by commands and read by
[conditions](create.conditions.md):

| Write | Read |
|---|---|
| `{ set: 'door_open' }` (true) | `'door_open'`, `'!door_open'` |
| `{ set: ['guess', 'grandpa'] }` (a string), `{ set: ['tries', 3] }` (a number) | `{ flag: 'guess', eq: 'grandpa' }`, `{ flag: 'tries', gte: 3 }`, `{ flag: 'tries', lt: 3 }` |
| `{ inc: 'tries' }`, `{ inc: 'tries', by: -1 }` (an absent or non-number flag counts from 0) | the same |
| `{ unset: 'door_open' }` (removed: false, absent) | |

A flag stays until something changes it; a save keeps it, a load restores it. Flags are named however you like; the
validator warns about one read and never set, or set and never read. A minigame that says how it ended writes the
reserved flag `minigame.<id>` (4.1.16). A text can show a flag's value through a text switch,
`{form?gull=e|*=}` ([translations](create.translations.md)).

**An event** is a name fired by `{ emit: 'bell_rang' }`. Right there, in order, it moves on every script paused on
`{ waitEvent: 'bell_rang' }`, then runs the listeners of the current room, then the game's
([scripts and events](create.scripts-events.md#events)):

```ts
// market.ts, in a rule:  { gain: 'key' }, { emit: 'key_found' }
// game.ts:
events: [
  { id: 'grandpa.goes-home', on: 'key_found', once: true, do: [{ moveActor: ['grandpa', 'house'] }, { toast: 'Grandpa went home.' }] },
],
```

`if` and `once` work as on a rule. **An event is not remembered**: once its listeners have run, nothing of it is left,
except what they changed (and a `once` listener's mark that it fired). A listener of a room the player is not in does
not hear it.

Other parts of the state answer "has it happened?" without a flag: a prop's state (`{ prop: ['lamp', 'on'] }`), the
inventory (`{ has }`), a room visited (`{ visited }`), where a moving character is (`{ actorIn }`), a topic heard
(`{ seen }`), the count of a `once`, `nth`, `cycle` or `random` block.

<a name="choosing"></a>

## How to choose

| You want | Use |
|---|---|
| To remember that something happened, and test it later (next room, next session) | a flag: `{ set: 'x' }`, then `'x'` |
| A counter (tries, coins, a price that goes down) | a numeric flag: `{ inc }`, `{ flag, gte/lt }` |
| A choice among several (the player's guess, the hero picked) | a string flag: `{ set: ['guess', 'grandpa'] }`, `{ flag, eq }` |
| Something that shows on screen (a lamp on, a drawer open) | a prop state, not a flag: the picture and the condition stay one thing |
| Several places to react **now** to one moment, without each rule knowing the others | an event: `{ emit }` and listeners |
| A script that waits for a moment (the cook comes when the gong rings) | an event: `{ waitEvent }` |
| A script that waits for a state | a flag or any condition: `{ waitUntil: COND }` |
| Something said only the first time | `{ once: […], id }`, no flag needed |
| A room that reacts later to an event that happened elsewhere | the listener sets a flag; the room's `onEnter` tests it |

The last row is the usual pattern: an event is not remembered, so to react the next time the player enters a room,
set a flag in the listener and test it in `onEnter`.

```ts
events: [{ id: 'bell.heard', on: 'bell_rang', do: [{ set: 'bell_rang_once' }] }],
// hall.ts
onEnter: [{ if: 'bell_rang_once', then: [{ say: ['butler', 'You rang?'] }] }],
```

<a name="alternatives"></a>

## Alternatives set aside

- **Typed variables beside flags.** A second store would be one more thing to save, migrate, show in the DEV panel and
  explain; a flag that holds a value covers counters and choices.
- **Remembered events** (a log of moments that conditions could query). Conditions would then depend on history, and
  the solver's states would grow with it. A flag set by a listener says exactly what is worth remembering.
- **Code in listeners.** Listeners are data, like rules, so the validator, the solver and the save understand them
  ([principles](create.principles.md#why)).

<a name="trade-offs"></a>

## Trade-offs

- Every flag the solver can see is part of the state it explores: a flag nobody needs to read makes proofs slower.
  `npm run lint` and `validate` point at flags never read.
- `{ flag, lt }` is true for an absent flag: test `gte` first, or set the flag at the start (`start.flags` in
  `game.ts`), when absent must mean "zero tries".
- Renaming a flag breaks old saves unless a migration renames it too (`migrations: [{ from, renameFlag }]`,
  [state and saves](create.state-saves.md)).

> [!LIMIT id=event-not-remembered]
> An event fired while a listener's condition is false, or in a room whose listeners are not in scope, is lost for
> that listener: nothing replays it later. Use a flag for anything that must survive.

<a name="decisions"></a>

## Decisions and ADRs

- [ADR 0002, content is data](../../docs/dev/adr/0002-declarative-content.md): listeners and flags are data the tools
  read.
- [ADR 0003, the solver runs the real engine](../../docs/dev/adr/0003-solver-runs-the-engine.md): every flag is part
  of the state it explores.
- References: [commands, logic](create.commands.md#logic), [conditions](create.conditions.md),
  [scripts and events](create.scripts-events.md), the generated [DSL reference](create.dsl.md).
