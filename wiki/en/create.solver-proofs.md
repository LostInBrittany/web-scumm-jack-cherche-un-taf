# What the solver proves

The solver plays your game on the real engine and tells you whether it can be finished. It gives three different
answers depending on how you run it: a winning path, an exhaustive proof, or an exhaustive proof with abstractions.
They do not promise the same thing. This page says what each one lets you conclude, and where each one stops.

<a name="overview"></a>

## The solver runs the real engine

`solve` ([`src/engine/tools/solve/`](../../src/engine/tools/solve/search.ts)) explores the game from "New game" with
the same `Engine` the player uses and a silent presenter (`FakePresenter`). There is no second model of the content:
whatever the solver finds, a player can do, and its paths replay as sessions (`npm run replay` in the engine
repository). The path from `solve()` to a verdict is described in
[`src/engine/BOUNDARIES.md`](../../src/engine/BOUNDARIES.md), "Inside the solver". The commands and their options are
in [Solver options](create.solver-options.md); how to fit the solver into your checks is in
[Checking your game](create.checking.md).

<a name="what-it-proves"></a>

## An ending found, a softlock ruled out: what each answer lets you conclude

| You ran | It answers | You may conclude | You may **not** conclude |
|---|---|---|---|
| `npm run solve` (a **winning path**, or witness) | `solved` and one path from "New game" to the ending | The ending can be reached: at least one sequence of actions, which a player could play, gets there. | That every player can finish. A game where one hero chosen in the intro can finish and another cannot still prints `solved`. The search stops at the first ending it finds, so the states it did not reach, other answers of a choice included, are not checked. No softlock is ruled out. |
| `npm run solve -- --prove` (an **exhaustive proof**) | `solved` | From **every** state a player can reach, every answer of every choice and every random draw included, the ending stays reachable: there is no softlock, within what the solver models (below). | That the game is fun, readable or clear: the solver does not look at the screen. That a minigame can be won: it assumes each one is (the `assumptions` line names them). |
| `npm run solve -- --prove` | `softlocks` | Each listed state is reachable and the ending is lost from it. Causes are grouped by the step that lost it, and each cause carries its session entries, so the way into it replays (since 4.1.13). | That the path shown is the shortest one there is: it is the shortest found. |
| either | `truncated` | Nothing. A budget (states, time or memory) stopped the search. | Anything at all. A `truncated` search never reads `solved`, and its exit code is 2. |

The demo game shows the difference: `npm run solve` prints "The game can be finished" and a path from
"(tutorial) Look at pantry" to "Use key with pantry"; `npm run solve -- --prove` explores every reachable state and
prints `Proof solved: the ending stays reachable from every one of the … reachable states`. Only a `solved` from
`--prove` is a proof. The witness's own sentence says it: "only --prove checks every state, every answer of a choice
included".

> [!GUARANTEE id=witness-not-proof]
> A winning path is not a proof: on a game whose last door opens only for one of the heroes the intro offers, the
> witness search says `solved` and `--prove` says `softlocks`, and only a solved proof says "stays reachable from
> every one".

> [!GUARANTEE id=truncated-never-solved]
> A proof (`--prove`) stopped by its budget of states, of time or of memory reports `truncated`, never `solved`.

**A proof with abstractions.** By default `--prove` folds states that differ only in what cannot change the outcome
(see [Abstractions](#abstractions)). Its `solved` then means: the same verdict as the explicit search would give, on
the condition that the engine reports everything a run reads. That condition is checked, not assumed:

- while the proof runs: every silent move a mobility region relies on is played and checked, and a move that changes
  something restarts the search with exact rooms; a hand-over the canonical owner relies on is played too, and one that
  changes something restarts the search without pooling; one no-op memo hit in 16 is run anyway and compared, and a
  difference is an engine error, never a silent skip;
- on demand, for your game: `npm run solve -- --audit-abstractions` runs the proof with the abstractions (every memo
  hit run) against the explicit search (canonical character, mobility regions, canonical owner and memo all off) and
  compares the verdicts: exit 0 same, 1 diverged, 2 the explicit search did not fit `--max`, so the verdicts were not
  compared. `npm run release-check` runs it in the engine repository;
- every night, on random games: `npm run audit:corpus` (engine repository).

The audit compares verdicts (status, ending reached, invariants broken, whether there are softlocks, the live flags,
rooms and map places reached), not the number of states or the paths: those are what the abstractions fold.

> [!LIMIT id=liveness-not-audited]
> Every search, the explicit one of the audit included, keys a state only on what is *live* (what the puzzle graph
> says can still change the outcome). The audit therefore checks the folds listed above, not the liveness analysis
> itself. A proof is a proof of the game as the puzzle graph reads it.

> [!LIMIT id=minigames-assumed-won]
> The solver assumes every minigame is won. Its output lists each one as an assumption
> (`assumptions: minigame:pipes:success`). Whether a person can win it, and whether its Skip works, is for a playtest
> and the e2e run.

<a name="statuses"></a>

## The one status

A solver run and a proof by chapters carry one status, with its exit code and its sentence
([`src/engine/tools/status.ts`](../../src/engine/tools/status.ts)). `npm run solve` prints the sentence and exits with
the code; `--json` carries `status`, `exit` and `headline`; the Studio's Check tab shows the sentence; the `solve` MCP
tool returns all three. None of them words its own verdict.

| Status | Exit | Meaning |
|---|---|---|
| `solved` | 0 | The ending (or a chapter's goal) is reached; with `--prove`, it stays reachable from every reachable state. |
| `softlocks` | 1 | Reachable states from which it can no longer be reached (`softlockCount`, `softlockCauses`). |
| `unsolved` | 1 | It is not reached from any state explored. |
| `truncated` | 2 | A budget stopped the search: `--max` states, `--time` or `--mem`. Nothing is proved; the sentence says which budget to raise. |
| `broken` | 1 | An invariant (`GameDef.invariants`) is true on a reachable state, printed with its path. Before 3.3 this was `solved` with exit 1. |
| `error` | 1 | The engine failed while exploring. |
| `checkpoint_mismatch` | 1 | Chapters only: every chapter proved, but a hand-written checkpoint is none of its reachable boundary states. |

When several apply, the worst wins, in this order: `error`, `broken`, `truncated`, `unsolved`, `softlocks`, `solved`.

<a name="warnings"></a>

## The three warnings worth reading

Even when the status is `solved`, `npm run solve` prints what it noticed on the way:

| Output | Meaning | Fix |
|---|---|---|
| `Dead ends (n): - garden, inventory [shell_phone, pipe] after: A › B › C` | A state where no action changes anything. | An item was consumed with no way to get another, a flag closed the only way forward, or a topic's `if` hides the clue. Give the item back, or loosen the condition. |
| `Items obtained but never used in a rule` | A red herring, or a forgotten puzzle. | Use it, or remove it. A visible useless item costs the player minutes. |
| `Items never obtained` | Declared in `items`, but nothing gives it. | Add the `gain`, or delete the item. |

`npm run solve -- --from=market` starts from the checkpoint `market` instead of "New game": handy while you work on
one room.

<a name="states"></a>

## How a state is stored

A state is what the content can still tell apart: the live flags, items, props, counters, scripts and positions (the
*dimensions*, [`solve/abstractions.ts`](../../src/engine/tools/solve/abstractions.ts)). Since 4.1.13
([ADR 0015](../../docs/dev/adr/0015-compact-state.md)) the search stores each state it has seen as an index into flat
columns: its parent, its path length, its last step, its room and bag, each string interned once. Its key is its
interned (dimension, value) pairs, sorted: two states share a key exactly when their dimensions are equal, so no hash
collision can merge them. The engine state is kept only while the node waits to be expanded.

On the open instances of the proof matrix this divides the heap by 16 to 20 (1.6 KB a state on o21 instead of 31.6,
measured for 4.1.13 on 7 October 2026, [Benchmarks](contribute.benchmarks.md)); the time per state is the engine's and
does not change. `--representation=objects` keeps the 4.1.8 storage: the reference the differential tests compare
with ([`tests/solver-oracle.test.ts`](../../tests/solver-oracle.test.ts): the same verdicts, paths and reachable sets).

<a name="abstractions"></a>

## What folds states: the abstractions

A proof folds states that differ only in what cannot matter. Each fold is audited against the explicit search
(`npm run solve -- --audit-abstractions`; `npm run audit:corpus` every night):

- **the canonical character**: with several playable characters, who holds the controls is not part of the state when
  switching changes nothing the solver reads, and no invariant or goal reads `{ player }`. Each state offers every
  character's actions (`Switch to X › action`). On in a proof, off for a witness.
- **the mobility regions**: rooms a character walks between silently are one region; the actions of every room of the
  region are offered as `Go to <room> › action`. On in a proof, off for a witness.
- **the canonical owner**: items no condition reads are one pool, whoever holds them, while the characters can meet.
  On in a proof with the two above; `--ownership=off` turns it off.
- **the no-op memo**: a try known to change nothing on the same values is not run again.
- **symmetric items** (4.1.13, `--symmetry`, off by default): two items the game treats alike, swapped, give the same
  game, so a state and its swapped twin are one. It is measured against the explicit search on generated games with
  twins; it finds none in the bundled games or the matrix.

**Dominance** (a state with no more progress than one already seen) prunes **witnesses only**, with `--dominance`. In a
proof it would change verdicts on generated games ([`tests/dominance.test.ts`](../../tests/dominance.test.ts)), so it
stays off there and the profile says why. A witness search that finds nothing with dominance is run again without it,
so `unsolved` is never its doing.

The **partial-order reduction** (`--por=sleep|stubborn`) has no proof of equivalence for softlocks: `--prove` ignores it
and says so.

<a name="big-games"></a>

## What the solver does with a big game

The state space of an adventure game is the product of everything that can vary independently. The solver first asks
the puzzle graph what can still change the outcome (`liveness` in
[`src/engine/tools/puzzle.ts`](../../src/engine/tools/puzzle.ts)): rooms, map places, players, the ending and the
chapter goals are live; an action is live when one of its effects reaches something live; a thing (item, flag, prop,
character position, event) is live when a live action reads it. The rest is left out of the state and out of the
actions tried: a flag only its own setter reads (a "looked at" marker), a trinket no gate needs, a clock nobody reads,
a walker nobody waits for, a topic chain that ends in a flag nothing uses.

This arrived in v2.1. Measured then ([Benchmarks](contribute.benchmarks.md#big-game)): the ten-room version of the
benchmark game hit the 20 000-state limit after 54 seconds without finishing before v2.1, and took 102 states after;
the forty-room one 624 states; the hundred-room one 2 901.

What still multiplies states, by design, is what matters: independent live things. Ten optional items that each open
something, in any order, are 2^10 states. The honest answer for a long game is:

1. **Chapters** (`checkpoints` with `goals`, `npm run solve -- --chapters`): each chapter is searched from the
   previous checkpoint, with only its own things live. With `--prove --chapters`, each chapter is proved from every
   reachable boundary state of the previous one, and a hand-written checkpoint that matches none of them is
   `checkpoint_mismatch`. In the v2.1 measure, the last chapter cost 3 290 states and the whole game 2 901, because
   the global search drops what earlier chapters consumed.
2. **Invariants** (`GameDef.invariants`) for the "never again" bugs, checked on every explored state.
3. **The puzzle graph** (`npm run page:puzzles`, the Studio's graph), to see before solving what a thing depends on
   and what it unlocks.

A global solve of a 100-room, 5-player generated game in seconds does not promise that every 15-hour game will be
proven in one go. It says the engine's tools scale with the content, and that the solver spends its budget on the
puzzles. When a proof gets slow, [the profile](create.solver-options.md#profile) says which dimension multiplies the
states.

<a name="reality-worlds"></a>

## A game with the outside world: prove it in every world

A proof never assumes the outside cooperates. For a game that declares `reality.signals`, `npm run solve:reality`
(engine repository; part of `prove:game`) and `npx quest-n-click solve-reality` (created project; part of
`quest-n-click release`) prove the game in three kinds of world:

1. **closed**: no signal at all. The game must be finishable through its fallbacks.
2. **each scenario** of `games/<id>/reality/scenarios/*.json`
   (`{ "signals": ["mail.answer.wrong", "mail.answer.correct"] }`): those signals, in that order, each able to arrive
   at any point after the one before. A required signal needs a scenario that sends it.
3. **adversarial**: any declared signal, at any point, again and again.

Each must be `solved` with no softlock and never truncated. The solver hands the engine the signal itself: no service
is contacted. In the Studio's MCP, `solve` takes `reality` to try one world. The report names the world its verdict
holds in.

`validate` checks that a required signal's `fallback` names a rule; the content lint (`npm run lint`, in
`verify:game`) checks that the closed witness plays it. A game that finishes without the outside world by another route
gets `fallback-unplayed`, a warning: the fallback is declared on a rule nobody needs, often one that cannot run.
Declare the action the witness plays, or make the declared one the way through. The Bridge side is in
[Bridge guarantees](bridge.guarantees.md#proof).

<a name="proof-matrix"></a>

## The proof matrix

[`docs/dev/PROOF-MATRIX.md`](../../docs/dev/PROOF-MATRIX.md) is the class of games the solver is measured on since
4.1.13: twelve generated games of 20 to 40 rooms and three playable characters, six constrained (walls between the
characters' zones) and six open, with transferable items, crossed puzzles, dialogues, scripts, events and destructive
actions. `npm run prove:matrix` (engine repository) proves each one in its own process under the published budgets
(10 000 000 states, 10 minutes on the maintainer's Mac, 20 on the CI runner, 4 GB of heap) and fails on a false
verdict. It runs every night, never on a pull request. An instance that does not finish is `unknown`, never `proved`:
the matrix's gap report says which budget stopped it and which dimension grew.
[`docs/dev/PROOF-PROFILE.md`](../../docs/dev/PROOF-PROFILE.md) is the profile of each instance.

<a name="why"></a>

## Why

A model of the game written for the solver would drift from the engine, and a proof would then prove the model, not
the game ([ADR 0003](../../docs/dev/adr/0003-solver-runs-the-engine.md)). Running the real engine means every path the
solver prints is a path a player can play, and replays as a session.

<a name="alternatives"></a>

## Alternatives set aside

- **A hand-written model of the content**: faster to search, but it proves the model. Set aside by ADR 0003.
- **Hashing every state**: a hash collision could merge two different states. The compact store keys on the sorted
  (dimension, value) pairs instead (ADR 0015).
- **Dominance and partial-order reduction in proofs**: they cut states but can change a softlock verdict, so proofs do
  without them.

<a name="trade-offs"></a>

## Trade-offs

Proofs are slower than on a hand-written model: the engine runs for every try. Large games prove by chapter, on
workers, and with checkpoints ([Solver options](create.solver-options.md#budgets)). Workers speed an exploration up;
they do not answer an explosion of states.

<a name="decisions"></a>

## Decisions and ADRs

- [ADR 0003, the solver runs the real engine](../../docs/dev/adr/0003-solver-runs-the-engine.md)
- [ADR 0015, the compact state](../../docs/dev/adr/0015-compact-state.md)
- [ADR 0014, objectives](../../docs/dev/adr/0014-objectives.md) (`--goal=100%`)
- [Benchmarks](contribute.benchmarks.md), [Architecture](contribute.architecture.md#solver)
