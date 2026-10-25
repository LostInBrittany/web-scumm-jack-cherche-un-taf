# Chapters and objectives

A long game is easier to check, and to play, in parts. Three declarations of `game.ts` cut it: **checkpoints** with
`goals` (the chapters the solver proves one by one), **invariants** (what must never happen), and **objectives** (what
the player has to do, shown in the quest journal). This page is their reference, and says why they are separate.

The tools are written by name below (`solve`, `validate`). In a created project they run as
`npx quest-n-click solve …`; in the engine repository as `GAME=<id> npm run solve -- …`.

<a name="invariants"></a>

## Chapters and invariants

A checkpoint is a ready-made state: a room, an inventory, flags, unlocked places, prop states, where the moving
characters are, and for a game with several playable characters who is active and where the others stand. In
development you can jump to one; the solver can start from one (`solve --from=<checkpoint>`).

A checkpoint with `goals` is **the end of a chapter**. `solve --chapters` proves each chapter on its own,
from the previous checkpoint (or a new game) until its goals hold, then from the last checkpoint to the ending: a long
game is checked in small bounded searches, and a broken chapter is named.

```ts
checkpoints: {
  garden: { room: 'garden', inventory: ['token'], goals: [{ has: 'token' }] },
  market: { room: 'market', …, goals: ['tank_drained', { unlocked: 'market' }] },
},
// Must never become true (the solver reports the path that makes one true):
invariants: [{ all: [{ not: { has: 'token' } }, '!flowers_done'] }],
```

### The fields of a checkpoint

| Field | Meaning |
|---|---|
| `room` (required) | The room the state is in. |
| `inventory`, `flags`, `unlocked`, `props` | The state's inventory, flags, unlocked map places and prop states (`<room>.<prop>` keys). |
| `where` | Where the moving characters are (character → room); the others are in their starting room. |
| `active`, `players` | Several playable characters: who is active, and the others' room, inventory and used items. |
| `used`, `seen` | Items already used, and the topics, listeners and choices already seen (`seen` keys by id, such as `topic.<id>`). |
| `goals` | Conditions that must all hold when the chapter ending here is done. Only a checkpoint with `goals` ends a chapter. |

`invariants` is a list of conditions of `game.ts` that must **never** become true. The solver reports the path that
makes one true.

### Run it

```sh
# in the created project
npx quest-n-click solve --chapters

# in the engine repository
GAME=<id> npm run solve -- --chapters
```

With `--prove`, `--chapters` proves each chapter from **every** reachable boundary state of the previous one (deduped by
what the chapter reads), not from the hand-written checkpoint; that checkpoint must then be one of those boundary
states (`used` and `seen` let it name what the boundary state holds). A game without any checkpoint with `goals` is
proved by the global search (`--prove`), and that is not a failure. The options are on
[Solver options](create.solver-options.md).

> [!LIMIT id=chapters-hand-written-start]
> Without `--prove`, each chapter starts from its hand-written checkpoint. If that checkpoint is not a state the
> previous chapter can actually reach, the chapter's proof says nothing about the real game: use `--prove` to check it.

<a name="objectives"></a>

## Objectives and the quest journal

`objectives` names what the player has to do. Since 4.1.12 it feeds three things:

- the pause menu's **Objectives** list (a step under its parent, ✓ done, ○ open, a side objective in italics);
- the semantic journal: `objectiveCompleted`, once, the first time `done` holds after an action;
- the solver: `solve --goal=100%` searches for a state where every objective that is not `optional` holds,
  instead of the ending.

```ts
objectives: {
  key: { title: 'Find the pantry key', done: { any: [{ has: 'key' }, 'pantry_open'] } },
  tank: { title: 'Drain the water tank', done: 'tank_drained', parent: 'key' },
  pantry: { title: 'Open the pantry', done: 'pantry_open' },
  guess: { title: 'Guess what is in the pantry', done: 'guess', optional: true },
},
```

| Field | Meaning |
|---|---|
| `title` (required) | What the journal shows. Translated under `objectives/<id>.title`. |
| `done` (required) | The condition that completes it. |
| `optional` | A side objective: not part of 100 %. |
| `parent` | The objective this one is a step of: the journal shows it under its parent. |

Write `done` as a condition that **stays true once true** (a flag set once, an item kept). The journal never takes a
completion back, but a game loaded later counts as done only what holds then.

`validate` refuses:

- an id other than letters, digits and `. _ -`, or longer than 64;
- a missing `title` or `done`;
- a `done` that can never hold (a flag nothing sets, an item nothing gives), with the reason;
- an unknown `parent`, and a cycle of parents.

It warns when a `done` that is not `optional` can be taken back by the content: the journal keeps it completed, but
`--goal=100%` needs every objective to hold at the same time.

The titles are translated like every text, and the menu's row is `ui.objectives` (English default "Objectives"). The
Studio's **Language** tab edits them ([Language and objectives](studio.language-objectives.md)); the MCP tool
`set_value` writes them with `id: "@game"`. Every condition and command, with its shape, is in the
[DSL reference](create.dsl.md).

<a name="speedrun"></a>

## Speedrun categories, in the same file

`speedrun` (4.1.14) declares speedrun categories and splits as content: triggers on the semantic events (a room
entered, an item acquired, an objective completed, the ending), the rules of each category (saves, pauses, hints,
reloads, Reality, the fingerprint components a run must match, the inputs), and the rules' version. `validate`
checks it; the guide is [Speedrun for authors](create.speedrun.md).

<a name="why"></a>

## Why three declarations, not one

- **A checkpoint is for the author and the solver**; the player never sees it. Its goals cut the proof into bounded
  searches, so a long game is not one search that runs out of states.
- **An objective is for the player.** It says what to do next, and the journal records when it is done. It is not a
  chapter: objectives may be completed in any order, and a side objective never blocks the ending.
- **An invariant is a safety property**: something the content must never allow, whatever the player does. The
  solver checks it on every state it explores.

- **The set of completed objectives is not in the save.** What already holds when a game starts, loads or jumps to a
  checkpoint is counted done silently. The save format did not change for objectives, and the solver's state did not
  grow; the cost is that an objective whose condition held once and no longer does is open again after a load, hence
  the advice to write `done` as a condition that stays true.

Why objectives are their own primitive (a checkpoint is a place to start from, a flag says a fact, neither says that a
player finished something) and when the engine completes them is [ADR 0014](../../docs/dev/adr/0014-objectives.md).

<a name="related"></a>

## Related identifiers

- `solve` and its options `--chapters`, `--prove`, `--from`, `--goal=100%`:
  [Solver options](create.solver-options.md), [What the solver proves](create.solver-proofs.md).
- Conditions (`has`, `unlocked`, `all`, `any`, `not`, `flag`): [Conditions](create.conditions.md).
- The semantic journal and `objectiveCompleted`: [Execution model](engine.execution-model.md).
