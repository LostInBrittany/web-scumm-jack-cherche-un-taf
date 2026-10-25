# Classic mechanics

The famous mechanics of the LucasArts adventures, written with this engine's DSL. Before asking for a new primitive,
look here: most of what made those games memorable is a mix of rules, flags, scripts and events the engine already
has. Each entry gives a verdict and the DSL that does it.

<a name="overview"></a>

## Verdicts, and what is tested

| Verdict | Meaning |
|---|---|
| **native** | The DSL as is, a few lines; the validator and the solver understand it. |
| **feasible** | The DSL does it, with a detour or a convention worth knowing. |
| **custom** | A minigame of the registry or a `custom` command: the engine runs it, the solver only knows its declared effects. |
| **out of scope** | The engine will not do it, on purpose. |

The entries were written for v2.1 and checked against the 4.4.0 code. Every "native" entry is the real DSL. The ones
marked **(tested)** are played by the engine and proven by the solver in
[`tests/classics.test.ts`](../../tests/classics.test.ts), from the games in
[`tests/fixtures/classics.ts`](../../tests/fixtures/classics.ts): the insult duel, the haggling, the melting mug, the
tree planted in the past and its fruit sent through the Chron-O-John, and the nurse's patrol. The hero choice is tested
by [`tests/hero-choice.test.ts`](../../tests/hero-choice.test.ts).

The blocks below are fragments of a game written in TypeScript (`games/<id>/game.ts` and its rooms), not whole rooms:
they show the keys that matter. Where a line starts with `// past:` or `// hall:`, it is the part that lives in that
room's file.

Where the commands run: they are written for the engine repository (`npm run solve -- --chapters`). In a created
project the same solver is `npx quest-n-click solve --chapters` (and `--prove`), and the game's sources are in
`game/` instead of `games/<id>/`.

> [!GUARANTEE id=classics-insult-duel]
> Challenging the master before learning the insults cannot win the duel; once the thug taught two of them, the right
> replies win it and the game ends. Limit: the test plays the fixture of `tests/fixtures/classics.ts` (the same DSL as
> the block below, its own wording), not your game: run `npm run solve` on yours.

<a name="monkey-island"></a>

## Monkey Island

<a name="insult-sword-fighting"></a>

### Insult sword fighting — native (tested)

Insults are learnt from a thug: each one is a flag. The duel is a topic whose `choice` prompts offer only the replies
the hero knows; the right ones count wins, the threshold ends the duel. No minigame needed: the fight *is* a
conversation.

```ts
talk: {
  thug: [{ topic: 'Fight me!', if: '!learned_farmer', do: [{ say: ['thug', 'You fight like a dairy farmer!'] }, { set: 'learned_farmer' }] }],
  master: [{ topic: 'I challenge you!', do: [
    { say: ['master', 'You fight like a dairy farmer!'] },
    { choice: [
      { text: 'How appropriate. You fight like a cow.', if: 'learned_farmer', do: [{ inc: 'wins' }] },
      { text: 'Oh yeah?', do: [{ say: ['master', 'Pathetic.'] }] } ] },
    { if: { flag: 'wins', gte: 2 }, then: [{ set: 'master_beaten' }], else: [{ set: ['wins', 0] }] } ] }],
}
```

The solver tries every reply of a `choice`, so it proves the duel can be won, and only after the insults were learnt.

<a name="three-trials"></a>

### The three trials, in any order — native

Three flags, one rule that needs all three, and a chapter checkpoint whose `goals` list them:
`checkpoints: { pirate: { room: 'bar', goals: ['trial_sword', 'trial_theft', 'trial_treasure'] } }`.
`npm run solve -- --chapters` searches each chapter from the previous checkpoint until its goals hold, whatever the
order the trials were done in; add `--prove` to prove each chapter from every state the previous one can end in
([Chapters and objectives](create.chapters.md), [Solver options](create.solver-options.md)).

<a name="haggling"></a>

### Haggling with the used-ship salesman — native (tested)

A numeric flag goes *down*; a topic opens under a threshold, another one closes.

```ts
start: { room: 'yard', inventory: ['coins'], flags: { price: 8000 } },
talk: { stan: [
  { topic: 'That is too much.', if: { all: ['asked', { flag: 'price', gte: 6000 }] }, do: [{ inc: 'price', by: -1000 }, { say: ['stan', 'Fine, 1000 less!'] }] },
  { topic: 'Deal.', if: { all: ['asked', { flag: 'price', lt: 5001 }, { has: 'coins' }] }, do: [{ lose: 'coins' }, { set: 'ship_bought' }] } ] }
```

The solver keeps the exact value of a counter that is ever lowered (it only clamps counters that go up).

<a name="grog-mug"></a>

### The mug of grog that melts — native (tested)

A world script with a `while`: as long as the hero carries the mug, time eats it. The player must hurry, or refill.

```ts
scripts: [{ id: 'mug_melts', loop: true, while: { has: 'mug_grog' },
  do: [{ wait: 8000 }, { gain: 'mug_holey' }, { lose: 'mug_grog' }, { toast: 'The mug melted.' }] }]
```

Gain the new mug *before* losing the old one: `while` is checked before every command. The solver plays "let the mug
melt" as one of the choices and still finds the path where the hero arrives in time.

<a name="following-the-storekeeper"></a>

### Following the storekeeper to the Sword Master — native

A script waits for the hero to catch up, room after room:

```ts
scripts: [{ id: 'keeper_leads', do: [
  { waitEvent: 'ask_master' }, { moveActor: ['keeper', 'path'] }, { waitUntil: { room: 'path' } },
  { moveActor: ['keeper', 'forest'] }, { waitUntil: { room: 'forest' } }, { set: 'master_found' }, { moveActor: ['keeper', 'shop'] } ] }]
```

<a name="rubber-chicken"></a>

### The rubber chicken with a pulley in the middle — native

An exit with a condition and a line when it is not met:
`exits: { cable: { name: 'cable', to: 'island', if: { has: 'chicken' }, locked: 'Too far to jump.' } }`
([Exits](create.exits.md)).

<a name="forest-maze"></a>

### The forest maze and the navigator's head — feasible

Rooms linked by `exits`, several of them leading back to the same room (`oneWay: true` silences the validator's
"no way back"), and a flag the head sets (`{ set: 'head_points' }`) that opens the right exit (`if: 'head_points'`).
It works, it is tedious to write, and the world map in the Studio helps more than the DSL does.

> [!LIMIT id=no-generated-maze]
> A generated maze is not something this engine offers: every room of the maze is written by hand.

<a name="under-water"></a>

### Ten minutes under water with the idol — feasible

A script with a long `wait` and a `while: { room: 'seabed' }`: when it ends, a cutscene and a `goto` to a "game over"
room with `{ end: true }`.

> [!LIMIT id=no-reload-command]
> The engine has no "reload the last save" command. The player presses Continue on the title screen. A `custom`
> command cannot do it either: its `run` receives the game, the state (read-only), the room, its arguments, the
> presenter and the scene, not the engine (`CustomContext` in
> [`src/engine/core/custom.ts`](../../src/engine/core/custom.ts)).

<a name="spitting-contest"></a>

### The spitting contest and the wind — native

A looping script that raises and drops a flag, with a looping prop animation to show it:

```ts
scripts: [{ id: 'wind', loop: true, do: [{ wait: 3000 }, { set: 'wind_blows' }, { play: ['flag', 'flutter'] }, { wait: 3000 }, { unset: 'wind_blows' }, { stopAnim: 'flag' }] }],
on: [{ verb: 'use', a: 'spit', b: 'line', if: 'wind_blows', do: [{ set: 'spit_won' }] }]
```

Because the solver advances a script one `wait` at a time, it sees the state with the wind up.

<a name="map-pieces"></a>

### The four map pieces — native

Four items, one rule with `{ all: [{ has: 'piece_1' }, …] }`, or a `goals` list on the chapter's checkpoint.

<a name="library-catalogue"></a>

### The library catalogue — native

A `choice` with as many options as drawers, one right one. Since v2.1 the solver tries every option.

<a name="voodoo-doll"></a>

### Largo's voodoo doll, four ingredients — native

One rule per ingredient on the doll (`use thread on doll` → `{ set: 'doll_thread' }`), then the needle, guarded by
`{ all: ['doll_thread', 'doll_bone', 'doll_spit', 'doll_hair'] }`.

<a name="stan-in-the-coffin"></a>

### Stan locked in the coffin — native

The coffin's rule emits an event; a game listener moves him:
`events: [{ on: 'coffin_closed', do: [{ moveActor: ['stan', 'coffin'] }, { set: 'stan_boxed' }] }]`.
Every room where Stan can be lists him in `actors`; `{ actorIn: ['stan', 'coffin'] }` guards the rules that need him
there ([Scripts and events](create.scripts-events.md)).

<a name="day-of-the-tentacle"></a>

## Day of the Tentacle

<a name="tree-in-the-past"></a>

### The tree planted in the past, seen in the future — native (tested)

Two playable characters. One sets a flag in his room; a hotspot of the other's room is `visible` under that flag.

```ts
players: { ids: ['hoagie', 'laverne'], start: { laverne: { room: 'future' } } },
// past: { verb: 'use', a: 'seed', b: 'ground', do: [{ lose: 'seed' }, { set: 'tree_planted' }] }
// future: hotspots: { tree: { name: 'huge tree', visible: 'tree_planted' }, stump: { name: 'bare ground', visible: '!tree_planted' } }
```

Several playable characters are described in [Heroes](create.heroes.md#several-characters).

<a name="chron-o-john"></a>

### The Chron-O-John: an item sent to another time — native (tested)

`{ transfer: ['fruit', 'hoagie'] }` moves the item to the other character's bag, wherever he is. Giving an item to a
playable character standing in the room does the same.

<a name="frozen-hamster"></a>

### The frozen hamster — native

Items with states are two items: `{ lose: 'hamster' }, { gain: 'hamster_frozen' }`. The report lists both and where
they come from.

<a name="storm-cutscene"></a>

### The storm, the lightning, the cutscene — native

`cutscene` plus `parallel`, with frame events on the animation:
`{ parallel: [[{ anim: ['sky', 'lightning'], at: { 2: [{ sfx: 'thunder' }, { shake: 4 }] } }], [{ say: ['hoagie', 'Uh-oh.'] }]] }`
([Staging](create.staging.md)).

<a name="maniac-mansion"></a>

## Maniac Mansion

<a name="nurse-on-patrol"></a>

### The nurse on patrol, and the dungeon — feasible, with a different clock (tested)

A script moves her between two rooms and emits an event after each move; the rooms' `onEnter` and a game listener
catch the hero when they meet; the dungeon has a loose brick.

```ts
scripts: [{ id: 'edna_patrols', loop: true, do: [{ wait: 6000 }, { moveActor: ['edna', 'hall'] }, { emit: 'edna_moved' }, { wait: 6000 }, { moveActor: ['edna', 'kitchen'] }, { emit: 'edna_moved' }] }],
events: [{ on: 'edna_moved', if: { all: [{ room: 'hall' }, { actorIn: ['edna', 'hall'] }] }, do: [{ say: ['edna', 'Got you!'] }, { goto: 'dungeon' }] }],
// hall: onEnter: [{ if: { actorIn: ['edna', 'hall'] }, then: [{ say: ['edna', 'Got you!'] }, { goto: 'dungeon' }] }]
```

> [!LIMIT id=patrol-turn-based]
> The honest difference with the original: scripts run *between* the player's actions, never during one. The patrol
> is turn by turn, not real time: Edna cannot walk in while the hero is mid-sentence. That is what lets the solver
> prove the puzzle (it waits for her to leave, then crosses), and what a save restores exactly.

More on patrols: [Moving characters](create.moving-characters.md#patrols).

<a name="choose-your-hero"></a>

### Choose your hero at the start — native (4.3.0, tested)

Maniac Mansion opens on a choice of kids, each with a talent of their own. When the choice is *who the hero is* (the
same story, another look, name and the words the others use: "him", "her", "it"), it is one character with a variant
per hero, an intro `choice` with portraits that sets a flag, and switches in the lines:
`'Good morning, {hero}! Ready, my {form?knight=brave knight|witch=clever witch|*=shiny robot}?'`.
`npm run solve -- --prove` checks every hero (`npm run solve` alone stops at the first winning path, which one hero
may be enough for). The whole recipe, with a playable example: [Heroes](create.heroes.md#hero-choice) (fixture
`tests/fixtures/heroes.ts`). When the kids come *along* and the player switches between them, that is `players`
([several playable characters](create.heroes.md#several-characters)).

<a name="doorbell"></a>

### The doorbell — native

`{ emit: 'doorbell' }` on the button, listeners in the rooms that react (`once: true` for the one-time gag).

<a name="sam-and-max"></a>

## Sam & Max

<a name="use-max-on"></a>

### "Use Max on…" — feasible

The partner is both an item (`items: { max: { name: 'Max' } }`, in the starting inventory) and an actor listed in
every room's `actors` without a starting `room`, so he is always there. `use max on door` is a rule like any other,
with an `anim` of the actor. The engine has no notion of "companion"; this convention is enough.

<a name="running-gag"></a>

### The running gag when nothing works — native

`rules.fallbacks` per verb, a list for variety, plus `rules.kinds` for a line per kind of thing (`kind: ['glass']`)
([Reactions](create.reactions.md)).

<a name="indiana-jones-loom"></a>

## Indiana Jones, Loom

<a name="three-paths"></a>

### The three paths (team, wits, fists) — native

A `choice` early on sets a flag; rooms, topics and rules carry `if` on it. `npm run solve -- --prove --chapters`
proves each path with a chapter checkpoint per branch (`npm run solve` alone finds one winning path, not every one).

<a name="fist-fights"></a>

### Fist fights, the drafts of Loom — custom

A minigame of the registry (`minigames` exported by `games/<id>/index.ts`): the engine draws nothing of it, the solver
counts it as won. `{ minigame: 'fists', params: { rounds: 3 }, then: [{ set: 'guard_down' }] }`. How to write one:
[A custom minigame](create.custom-minigame.md).

<a name="out-of-scope"></a>

## What stays out of scope

- A real-time world: scripts advance between actions; animations and loops are the real-time layer
  ([Scripts and events](create.scripts-events.md)).
- A second dialogue format: topics, `choice` and `if` are the dialogue graph; the Studio draws it.
- Physics, zoom, a camera that moves on two axes.

The whole list of what quest'n'click does not do: [What quest'n'click does not do](index.not-supported.md).
