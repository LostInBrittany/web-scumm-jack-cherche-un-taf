# Moving characters: patrols and walks

Make a character walk on its own: a guard who patrols a room, a nurse who goes from room to room and catches the hero,
Grandpa who goes home once the key is found. Everything here is the DSL as it is: a script, `walk`, `moveActor`,
an event, and conditions.

<a name="what-you-get"></a>

## What you get

A character that moves between two spots of a room, or between rooms, on a loop or when something happens; rules that
know where it is; and a game the solver still proves, because the patrol is part of the state it explores.

<a name="context-and-versions"></a>

## Context and versions

- A created project (`game/`) or the engine repository (`games/<id>/`); the same files and commands, see
  [the layout page](create.project-layout.md).
- From 4.3.0 for this page. Scripts, events and `moveActor` exist since 1.3 ("World"); schema 3 (stable ids, `stepIds`)
  since 3.0.

<a name="prerequisites"></a>

## Prerequisites

- The character declared in `game.ts` with a `walk` pose in its `sprites` (without one, it slides in its current pose)
  ([characters](create.characters.md)).
- The rooms placed in the editor: the character's actor placed in each room it can be in, with a walk area
  ([geometry](create.geometry.md)).
- [Scripts and events](create.scripts-events.md), for the fields used below.

<a name="where-to-run"></a>

## Where to run the commands

Write the content in the game's files (`rooms/<room>.ts`, `game.ts`, `cast.ts`). Check from the root of the project:
`npm run validate` and `npm run solve` in the engine repository, `npx quest-n-click validate` and
`npx quest-n-click solve` in a created project.

<a name="patrol-in-a-room"></a>

## Steps: a guard who patrols a room

<!-- step: script -->
1. **A looping script in the room.** The guard walks to the vault, waits, walks to the window, waits, forever:
   `{ walk: [x, y], who: 'guard' }` and `{ wait }` in a script with `loop: true`. A loop must contain a `wait`,
   `waitUntil` or `waitEvent`.

<!-- step: flags -->
2. **Say where he is with a flag.** Conditions cannot read a character's position inside a room; let the script set
   a flag at each stop (`{ set: ['guard_at', 'vault'] }`), and let the rules test it
   (`{ flag: 'guard_at', eq: 'vault' }`).

<!-- step: stop -->
3. **Stop the patrol** when it no longer matters: `while: '!vault_open'` rewinds the script and stops it once the
   vault is open (or `{ stopScript: 'guard_patrol' }` from a rule).

<!-- step: rules -->
4. **The rules.** The special case first: opening the vault while he is there gets caught; otherwise it works.

```room-example
{
  "room": {
    "id": "vault_hall",
    "name": "The vault hall",
    "decor": "decor/vault_hall",
    "actors": { "guard": { "char": "guard" } },
    "hotspots": { "vault": { "name": "vault door" } },
    "look": { "guard": "A guard. He walks. He turns. He walks.", "vault": "The vault door." },
    "on": [
      { "id": "hall.vault-watched", "verb": "open", "a": "vault", "if": { "flag": "guard_at", "eq": "vault" },
        "do": [{ "say": ["guard", "Hey! Step away from that door."] }] },
      { "id": "hall.vault-open", "verb": "open", "a": "vault", "if": "!vault_open",
        "do": ["Quick, while he is at the window.", { "set": "vault_open" }] }
    ],
    "scripts": [
      { "id": "guard_patrol", "loop": true, "while": "!vault_open",
        "stepIds": ["to-vault", "at-vault", "wait-vault", "to-window", "at-window", "wait-window"],
        "do": [
          { "walk": [520, 340], "who": "guard" },
          { "set": ["guard_at", "vault"] },
          { "wait": 4000 },
          { "walk": [140, 340], "who": "guard" },
          { "set": ["guard_at", "window"] },
          { "wait": 4000 }
        ] }
    ],
    "hints": [{ "id": "hall.hint", "until": "vault_open", "lines": ["Wait until the guard is at the window."] }]
  },
  "layout": {
    "walk": { "area": [[20, 300], [620, 300], [630, 395], [10, 395]] },
    "entries": { "default": [320, 360] },
    "hotspots": { "vault": { "rect": [480, 140, 90, 170], "approach": [470, 350] } },
    "actors": { "guard": { "x": 140, "y": 340 } }
  },
  "characters": {
    "guard": { "name": "Guard", "color": "#8fd3ff", "kind": ["person"], "sprites": { "idle": ["guard/idle"], "walk": ["guard/walk1", "guard/walk2"] } }
  }
}
```

The `walk … who` coordinates are the one place where a position is typed: a scripted move. Where the guard stops is
kept in the save.

<a name="patrols"></a>

## Steps: a patrol between rooms (the nurse)

<!-- step: starting-room -->
5. **Give the character a starting room.** A character declared as an actor in several rooms normally shows in all
   of them (Grandma in the kitchen *and* the garden). Give it a `room`, and only its actor in that room shows;
   `moveActor` sends it elsewhere:

   ```ts
   // cast.ts
   edna: { name: 'Edna', color: '#f0f', room: 'kitchen', sprites: { idle: ['edna/idle'], walk: […] } },
   // hall.ts and kitchen.ts both declare   actors: { edna: { char: 'edna' } }   and place her in their layout.
   // anywhere:  { moveActor: ['edna', 'hall'] }             at her layout position in the hall
   //            { moveActor: ['edna', 'hall'], at: 'door' } at that entry point (or a point) of the hall
   // conditions: { actorIn: ['edna', 'hall'] }
   ```

   The character is removed from the room it leaves and appears in the one it reaches, on screen if the player is
   there. The validator refuses `moveActor` toward a room where the character is not an actor, or for a character with
   no `room`.

<!-- step: patrol-script -->
6. **A game script moves her and says so.** After each move it emits an event; a game listener catches the hero when
   they meet, and each room's `onEnter` catches him when he walks in on her:

   ```ts
   // game.ts
   scripts: [{ id: 'edna_patrols', loop: true, stepIds: ['w1', 'to-hall', 'moved-1', 'w2', 'to-kitchen', 'moved-2'], do: [
     { wait: 6000 }, { moveActor: ['edna', 'hall'] }, { emit: 'edna_moved' },
     { wait: 6000 }, { moveActor: ['edna', 'kitchen'] }, { emit: 'edna_moved' },
   ] }],
   events: [{ id: 'edna.catches', on: 'edna_moved',
     if: { any: [{ all: [{ room: 'hall' }, { actorIn: ['edna', 'hall'] }] }, { all: [{ room: 'kitchen' }, { actorIn: ['edna', 'kitchen'] }] }] },
     do: [{ say: ['edna', 'Got you!'] }, { goto: 'dungeon' }] }],
   // hall.ts (and the same in kitchen.ts):
   onEnter: [{ if: { actorIn: ['edna', 'hall'] }, then: [{ say: ['edna', 'Got you!'] }, { goto: 'dungeon' }] }],
   ```

   The dungeon has a loose brick back to the hall. The whole game is a test fixture,
   [`tests/fixtures/classics.ts`](../../tests/fixtures/classics.ts) (`mansion`), and the mechanic is described on
   [classic mechanics](create.classics.md#nurse-on-patrol).

<!-- step: checkpoints -->
7. **Checkpoints.** A checkpoint starts with every moving character in its starting room; `where: { edna: 'hall' }`
   puts one elsewhere. A checkpoint with `goals` must be a state the game can really reach when those goals hold:
   `npm run solve -- --prove --chapters` proves each chapter from every reachable boundary state and reports a
   checkpoint that matches none, with the dimensions that differ (`room: house vs market`). `used`, `seen` and
   `players[].used` let a checkpoint name what a real playthrough leaves behind (an item already used, a once-listener
   already fired) ([chapters](create.chapters.md)).

> [!LIMIT id=turn-by-turn]
> A patrol is turn by turn, not real time. Scripts run between the player's actions, never during one: the nurse
> cannot walk in while the hero is mid-sentence or mid-walk. That is what lets the solver prove the puzzle (it waits
> for her to leave, then crosses) and what a save restores exactly. A sequence that must not be interrupted goes in a
> `cutscene`.

> [!LIMIT id=no-position-condition]
> No condition reads where a character stands inside a room, nor its line of sight. Model "the guard is at the door"
> with a flag the script sets, and "the guard is in this room" with `{ actorIn }`.

> [!GUARANTEE id=patrol-turn-by-turn]
> A patrolling character moved by a script catches the hero turn by turn: when the hero enters her room, or when she
> enters his.

<a name="expected-result"></a>

## Expected result, and how to check it

- On the dev server, the guard walks back and forth while you play; opening the vault while he stands by it gets the
  warning, at the window it opens.
- `npm run validate` (or `npx quest-n-click validate`) prints no error.
- `npm run solve` finishes, and its path shows the script's turns as steps (`Script edna_patrols`): the solver waits
  for the patrol to move, then acts.

> [!GUARANTEE id=patrol-solved]
> The solver proves the patrolling nurse's game: it lets her script run and waits for her to leave.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `loop script "…" never waits (add a wait, waitUntil or waitEvent)` | A loop without a pause | Add a `{ wait }` |
| `schema v3 script needs one stable step id per command (n expected)` | `stepIds` missing or the wrong length | One id per top-level command |
| `character "…" has no starting room ("room" in its definition), needed to move it between rooms` | `moveActor` on a character without `room` | Add `room` in its definition |
| `"…" is not an actor in <room>: declare it there (actors) and place it in the layout` | `moveActor` toward a room that does not declare it | Declare the actor there and place it |
| The character shows in every room at once | No `room` on the character | Give it a starting room |
| The character slides instead of walking | No `walk` pose | Add `walk` to its `sprites` |
| The patrol stops for good after an item changes hands | A `while` checked before every command | Gain the new item before losing the old one |

<a name="files-changed"></a>

## Files or data changed

`rooms/<room>.ts` (the room's script, rules, `onEnter`), `game.ts` (game scripts, listeners, checkpoints), `cast.ts`
(the starting room), `layout/<room>.json` (the actor placed in each room). In a save: the script's position, where each
moving character is (`where`), each actor's position and the flags the script sets.

<a name="recovery"></a>

## Recovery or going back

Removing a script or renaming its steps changes what an old save holds: add a migration step (`renameScript`,
`renameScriptStep`, `dropScript`) when players have saves ([state and saves](create.state-saves.md)).

<a name="references"></a>

## References

- [Scripts and events](create.scripts-events.md), [flags, variables and events](create.flags-variables-events.md),
  [conditions](create.conditions.md), [classic mechanics](create.classics.md).
- [`src/engine/core/movement.ts`](../../src/engine/core/movement.ts),
  [`src/engine/core/script-runtime.ts`](../../src/engine/core/script-runtime.ts),
  [`tests/classics.test.ts`](../../tests/classics.test.ts).
