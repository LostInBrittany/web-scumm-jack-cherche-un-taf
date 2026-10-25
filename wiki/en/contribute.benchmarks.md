# Benchmarks

<a name="overview"></a>

## A generated game of any size

What the engine's tools cost on a game of a given size, measured on generated games, and the solver's history told by
its measurements. Every figure below is dated, with its version and machine. Numbers move with the machine; the ratios
do not. The first tables were measured on 3 October 2026 (v2.3.0) on a laptop; each later section says its own date.

```sh
# in the engine repository
npm run bench -- --rooms=40 --players=3 --items=30 --flags=100 --npcs=5 --scripts=10 --topics=40 --max=200000
```

This generates a game of that size ([`src/engine/tools/stress.ts`](../../src/engine/tools/stress.ts)) and times every
tool on it: validate, solve (global and per chapter, plain and with the partial-order reduction), the content report,
the world and puzzle graphs, text extraction and translation, a save migration. The game is a chain: each room's item
opens the next room's lock, playable characters take over at chapter boundaries, walkers patrol pairs of rooms and emit
events, clocks tick in every other room, topics chain flags, trinkets go into bins, ten artificial save migrations lead
to the current version, a checkpoint with goals ends each chapter, two invariants watch the first item. No art: the
layouts are rectangles. A ten-room version runs in `tests/bench.test.ts`.

The other modes of [`tools/bench.ts`](../../tools/bench.ts):

| Flag | What it adds |
|---|---|
| `--prove` | The exhaustive proof of the whole game (slow on a big one: the reduction is off in proof mode) |
| `--v3` | The game with stable ids (schema 3), as a real v3 game |
| `--matrix [--eras]` | The 3.3 "Scale" reference table: the exhaustive proof on 20 and 40 rooms × 1, 2 and 3 playable characters, where the time goes and how many character positions the states hold, as Markdown |
| `--workers-table [--rooms --players --max --eras]` | The proof workers' table: the time with 0, 1, 2, 4 and 8 workers, and whether each result is the same as with one |

The 4.1.13 proof matrix has its own command, run nightly, never on a pull request:

```sh
# in the engine repository
npm run prove:matrix -- --only=c11,o21 --time=600 --max=10000000 --mem=4096 --json=matrix.json
```

It proves each of the twelve instances of [PROOF-MATRIX.md](../../docs/dev/PROOF-MATRIX.md) in its own process under
the published budgets, prints one row per instance and exits 1 only on a false verdict (`proved` where a softlock is
expected, or the reverse, or a search error); an instance out of budget is `unknown` (truncated), never `proved`.
`--representation=objects|compact`, `--checkpoint-dir=<dir>` and `--workers=N` are passed on to the solver.

<a name="results"></a>
<!-- applies: .. since 2.3.0 -->

## Results (3 October 2026, v2.3.0)

| Step | 40 rooms, 3 players, 39 items, 119 rules, 40 topics, 10 scripts | 100 rooms, 5 players, 119 items, 300 flags, 100 topics, 30 scripts |
|---|---|---|
| validate | 15 ms, 0 errors | 41 ms, 0 errors |
| content report | 24 ms | 103 ms |
| world graph + SVG | 1 ms | 2 ms |
| puzzle graph + SVG | 16 ms, 554 nodes | 72 ms, 1 399 nodes |
| texts: extract + translate | 4 ms, 697 texts | 8 ms, 1 752 texts |
| migrate a v1 save (10 steps) | 2 ms | 4 ms |
| solve, chapter 1 | 0.1 s, 156 states, 273 engine runs | 0.2 s, 343 states, 524 runs |
| solve, last chapter | 0.1 s, 257 states, 466 runs | 7.6 s, 3 290 states, 5 435 runs |
| solve, whole game | 0.3 s, 624 states, 123 actions, 1 110 runs | 5.8 s, 2 901 states, 309 actions, 4 499 runs |

Every tool but the solver is linear and instant. The solver is the one to watch.

v2.3 made it run three times fewer engine runs for the same states: an action no written rule can answer (whatever the
conditions) can only fall to a look line, a kind reaction or the fallback line, so it is not run at all (the profile
counts them as *skipped*). On the sample game: 2 076 runs became 280 for the same 35 states.

<a name="big-game"></a>

## What the solver does with a big game

The state space of an adventure game is the product of everything that can vary independently. Before v2.1 the solver
hashed every flag, every item and every script position: the ten-room version of this game, with its clocks, walkers,
"looked at" flags and trinkets, hit the 20 000-state limit after 54 seconds without finishing.

v2.1 asks the puzzle graph what can still change the outcome (`liveness` in
[`src/engine/tools/puzzle.ts`](../../src/engine/tools/puzzle.ts)): rooms, places, players, the end and the chapter goals
are live; an action is live when one of its effects reaches something live; a thing (item, flag, prop, character
position, event) is live when a live action reads it. The rest is left out of the state and out of the actions tried:
a flag only its own setter reads (a "looked at" marker), a trinket no gate needs, a clock nobody reads, a walker nobody
waits for, a topic chain that ends in a flag nothing uses. The same ten-room game now takes 102 states; the forty-room
one 624; the hundred-room one 2 901.

What still multiplies states, by design, is what matters: independent live things. Ten optional items that each open
something, in any order, are 2^10 states. The honest answer for a long game stays:

1. **Chapters** (`checkpoints` with `goals`, `npm run solve -- --chapters`): each chapter is proven from the previous
   checkpoint, with only its own things live. The last chapter above costs 3 290 states; the game as a whole 2 901,
   because the global search drops what earlier chapters consumed.
2. **Invariants** for the "never again" bugs, checked on every explored state.
3. The puzzle graph to see, before solving, what a thing depends on and what it unlocks.

> [!LIMIT id=scale-not-a-promise]
> A global solve of a 100-room, 5-player game in six seconds is not a promise that every 15-hour game will be proven
> in one go. It says the engine's tools scale with the content, and that the solver spends its budget on the puzzles.
> What a witness or a proof lets you conclude: [What the solver proves](create.solver-proofs.md).

<a name="profile"></a>

## When it gets slow: the profile

`npm run solve -- --profile` (the Check tab's "Solver health", the `solve` MCP tool with `profile: true`) says why:

```text
SOLVER PROFILE
  states explored       35
  engine runs           280  (211 changed nothing, 35 landed on a known state)
  actions not run       1808  (no rule could answer them)
  actions per state     22.3 on average, 27 at most (house, 3 items in the bag…)

What splits the states (states that would merge without it):
      13  room  (3 values)
       4  player hero  (11 values)
       3  flag lou_has_key  (2 values)
…
Use / give combinations per room (over its expansions):
  garden: 272 candidates, 2 answered by a rule, 271 could only fall back (100% useless)
Independent dimensions (their combinations multiply the states; a checkpoint between them would cut it):
  ⚠ item rope, item coin, item book: 8 of 8 combinations seen
Monotonic (never lost once gained): 9 flags, 1 items (shell_phone)
```

Each dimension of the state (an item in the bag, a flag, a prop state, a script position…) is scored by how many
states would merge if it were dropped: the top of that list is what the game's logic is made of, or the puzzle that
went combinatorial. Groups of two-valued dimensions whose combinations all show up evolve independently: a checkpoint
with goals between them makes each chapter's search small. The heat map on the puzzle graph (Check tab) shows the same
numbers on the rules and rooms; "why is this live?" on a card explains why the solver keeps a thing in its state.
Every solver option: [Solver options](create.solver-options.md#profile).

<a name="history"></a>

## The solver's history, measured

Each section below is the measurement of its version, kept as it was (the machine of the section, cache off unless
said). They explain why the solver works the way it does today.

<a name="por-v23"></a>

### Fewer orders: the partial-order reduction (historical, v2.3)

> [!LIMIT id=por-not-for-proofs]
> Never use the partial-order reduction to certify that a game has no softlock. Measured in proof mode in 3.3, it
> reported a softlock that does not exist ([below](#v33-noop-memo)). `--por` only applies to witness searches: in proof
> mode the solver ignores it and says so. This section is the v2.3 measurement, kept as it was.

Two actions that touch different things commute: taking the rope then the coin, or the coin then the rope, land on the
same state. The solver already merges the states (one hash); what it still paid was the orders in between: k
independent pickups before a door are 2^k states when the search cannot finish (a proof of a dead end, a truncated
run). `npm run solve -- --por=sleep|stubborn` ([`src/engine/tools/por.ts`](../../src/engine/tools/por.ts)) uses what the
engine recorded while each action ran (what it read, what it changed, in the state's dimensions) and, for the actions a
condition still holds back, what the puzzle graph says they need:

| `tests/fixtures/por.ts`, k pickups then a door that cannot open | states | engine runs |
|---|---|---|
| plain, k = 8 | 256 | 2 304 |
| `--por=sleep`, k = 8 | 256 | 1 535 |
| `--por=stubborn`, k = 8 | 9 | 81 |
| plain, k = 12 | 4 096 | 53 248 |
| `--por=stubborn`, k = 12 | 13 | 169 |

`sleep` only skips engine runs (an action tried before an independent one is not tried again on the way back);
`stubborn` explores one of several commuting actions at a time, so the states go too. On the chain-shaped stress game
nothing commutes and nothing changes; on a real game with optional side quests it is the difference between a proof and
a time-out (in a witness search: see the warning above). The reduction is off by default: the plain search is the
proof.

<a name="v31"></a>

### v3.1: schema 3 and the exhaustive proof (4 October 2026)

`npm run bench -- --v3` generates the stress game with stable ids (`assignIds`), as a real v3 game; `--prove` adds the
exhaustive search (`solve -- --prove`: every reachable state, the softlocks). Same laptop as above.

| Step | 40 rooms, 3 players (v3) | 100 rooms, 5 players (v3) |
|---|---|---|
| validate | 11 ms, 0 errors | 41 ms, 0 errors |
| solve, whole game (witness) | 0.13 s, 624 states, 123 actions, 1 110 runs | 3.0 s, 2 901 states, 309 actions, 4 640 runs |
| solve, last chapter (witness) | 63 ms, 257 states | 4.5 s, 3 290 states |
| solve, whole game, `--por=stubborn` | 0.16 s, 624 states, 0 postponed (a chain: nothing commutes) | 2.9 s, 2 901 states, 0 postponed |
| solve, whole game, `--prove` | **truncated** at 50 000 states after 408 s, 119 411 runs | not attempted |

The witness did not move between v2.3 and v3.1 (same states, same runs: the stable ids change nothing for the search).
The exhaustive proof is another matter: it visits every reachable state, the partial-order reduction is off in that mode
(a reduction must not drop a losing branch from a proof until it has its own equivalence proof), and a 40-room game
already exceeds a 50 000-state budget. So `npm run prove:game` is a release gate for a small game (the sample proves in
1.3 s) and a weekly job with a budget for a big one (`.github/workflows/prove.yml`); on a long game, prove chapter by
chapter (`--prove --chapters`), where each search is bounded by its goals. Bringing the reduction into proof mode, with
the equivalence tests of `tests/por.test.ts` as its proof, was then the next step for the solver.

<a name="v32"></a>

### v3.2: softlock causes, the proof by chapters, and where the proof stops (4 October 2026)

A proof now reports **every** reachable softlock state (`softlockCount`), grouped by the step that lost the game
(`softlockCauses`: the first action from a state that could still win into one that cannot), and a proof from "New
game" branches over the intro's choices too (the demo's proof grew from 2 176 to 6 528 states: it had only proved the
default answer). `npm run solve -- --prove --chapters` proves each chapter from **every** reachable boundary state of
the previous one (every state where its goals hold, deduped by what the next chapter reads), and reports a checkpoint
that matches none, with the dimensions that differ: it found three of the demo's four checkpoints disagreeing with the
content (Biscuit's position and the pipe already used, a once-listener already fired, the room where the key is found),
all fixed. One state budget covers the whole proof (`maxStates × 10`, at most 1 000 boundary starts per chapter): past
it the result is `truncated`, never green.

Same laptop; 12 items, 30 flags, 1 walker, 2 scripts, 8 topics; `maxStates` 20 000:

| Game | Global proof | Proof by chapters |
|---|---|---|
| sample game (3 rooms, 4 chapters) | solved, 6 528 states, 4.9 s | solved from 1/78/243/312/288 boundary states, 115 670 states, 89 s |
| 20 rooms, 1 player, 4 chapters | solved, 797 states, 0.2 s | solved, 1 466 states, 0.4 s |
| 40 rooms, 1 player, 8 chapters | solved, 3 197 states, 1.1 s | solved, 6 034 states, 2.3 s |
| 20 rooms, 2 players, 4 chapters | **truncated** at 20 000 states, 8.7 s | **truncated** in chapter 1, 6.8 s |
| 40 rooms, 3 players, 3 chapters | **truncated** at 20 000 states, 51 s | **truncated** in chapter 1, 26 s |

What this said, plainly: the exhaustive proof is complete and fast for a single-character chain of 40 rooms; with
several playable characters the reachable states multiply (each one's room and bag) and both proofs stop at the budget
and say so. **This was a limit of the explicit search as written, not of the engine**: the state kept every
character's exact room and the active character, and a switch of character was a transition of its own, so equivalent
states were explored thousands of times (three characters free in 30 rooms: 81 000 position combinations before any
flag). The 3.3 solver track attacked exactly that. Cutting the game into chapters does not change that, because the
first chapter already holds the product; it checks the checkpoints and proves each chapter from every way into it,
which is what a long single-character game needs. Without a written equivalence argument, the reductions stay off in
proof mode, and the differential suite (`tests/por.test.ts`) shows why: sleep sets invent softlocks on three of eight
fixtures (dropped edges feed the reverse reachability that classifies them), stubborn sets agreed on all eight. A
multi-character long game is proved per character (a checkpoint where the others wait) or relies on the witness, the
chapter witnesses and the playtests.

The solver's next steps then, in order (an outside review, LOG #38): measure where the time goes (engine runs, clones,
hashes, queue); a proof-mode frontier without best-first ordering or copied paths; the active character out of the
state (each character's actions offered from one canonical state, a switch kept explicit only when it has an effect);
**mobility regions** (rooms joined by reversible, silent exits merged into one region per character, moves as macro
steps with the route kept for the walkthrough); chapter interfaces projected on what the rest reads; a proof-safe
reduction (dependency closure, goal and invariant visibility, deadlocks, a cycle proviso, since the property is "from
every reachable state the ending stays reachable"), validated against the explicit search on thousands of generated
games with every counter-example replayed on the real engine; then parallel frontiers. Exit criterion: the 40-room
stress game proved with 1, 2 and 3 characters, a state count that no longer grows like the product of positions, no
generated game where the reduced and explicit verdicts differ, and a truncation that stays a truncation.

<a name="v33-matrix"></a>

### v3.3 "Scale": the reference matrix (4 October 2026)

`npm run bench -- --matrix --max=20000`: the exhaustive proof on generated chains of 20 and 40 rooms with 1, 2 and 3
playable characters (12 items, 30 flags, 1 walker, 2 scripts, 8 topics). `Positions` counts the distinct (active
character, room of each character) combinations among the states; the time split comes from the solver's own profile
(`profile.timing`).

| Game | Proof | States | Engine runs | Time | Positions | Time split (run / clone / hash / queue / tries / other) |
|---|---|---|---|---|---|---|
| 20 rooms, 1 character | solved | 797 | 3 295 | 0.2 s | 20 | 47% / 21% / 13% / 3% / 6% / 7% |
| 20 rooms, 2 characters | truncated | 20 000 | 100 863 | 7.6 s | 800 | 45% / 23% / 9% / 15% / 2% / 4% |
| 20 rooms, 3 characters | truncated | 20 000 | 49 538 | 22.6 s | 13 858 | 9% / 5% / 2% / 83% / 0% / 1% |
| 40 rooms, 1 character | solved | 3 197 | 13 245 | 1.1 s | 40 | 46% / 25% / 13% / 6% / 3% / 5% |
| 40 rooms, 2 characters | truncated | 20 000 | 92 475 | 19.0 s | 3 200 | 30% / 16% / 8% / 42% / 1% / 3% |
| 40 rooms, 3 characters | truncated | 20 000 | 44 298 | 50.9 s | 18 796 | 6% / 3% / 1% / 89% / 0% / 1% |

Two causes, measured. **The states are positions**: with two characters on 20 rooms, the 800 positions are exactly
20 × 20 × 2, every combination; with three, positions are most of the states. **The time goes to the queue** as soon as
states pile up: the best-first queue inserted in O(n) (`splice`), 83–89% of the time with three characters; with one
character, running the engine (about half) and copying states (about a quarter) dominate. The 3.3 branches attacked
them in that order: an exact proof core (O(1) frontier, parent pointers), then the canonical character and the mobility
regions for the positions.

<a name="v33-proof-core"></a>

### After `v33-proof-core` (exact: same witnesses, same proofs, same printed output on the demo)

The frontier is a binary heap in the old list's order (score, then arrival), and a state keeps a pointer to its parent
and its last step instead of a copy of the whole path and session.

| Game | Proof | States | Engine runs | Time | Positions | Time split (run / clone / hash / queue / tries / other) |
|---|---|---|---|---|---|---|
| 20 rooms, 1 character | solved | 797 | 3 295 | 0.2 s | 20 | 48% / 22% / 13% / 1% / 7% / 7% |
| 20 rooms, 2 characters | truncated | 20 000 | 100 863 | 6.6 s | 800 | 53% / 27% / 11% / 0% / 3% / 5% |
| 20 rooms, 3 characters | truncated | 20 000 | 49 538 | 4.1 s | 13 858 | 53% / 29% / 10% / 0% / 2% / 5% |
| 40 rooms, 1 character | solved | 3 197 | 13 245 | 1.1 s | 40 | 49% / 26% / 14% / 0% / 3% / 6% |
| 40 rooms, 2 characters | truncated | 20 000 | 92 475 | 11.4 s | 3 200 | 52% / 27% / 13% / 0% / 2% / 5% |
| 40 rooms, 3 characters | truncated | 20 000 | 44 298 | 6.2 s | 18 796 | 50% / 29% / 13% / 0% / 1% / 5% |

The queue is gone from the profile (89% → 0%) and the heaviest case runs 8× faster for the same 20 000 states (50.9 s →
6.2 s). The state counts are unchanged, as they must be: what remains is the engine (about half) and the state copies
(about 30%), and above all the number of states, which the next branches attacked.

<a name="v33-player-canonical"></a>

### After `v33-player-canonical` (same verdicts, checked against the explicit search)

In proof mode, states that differ only by the active character are one state, and each state offers every character's
actions (`Switch to X › action`) when the switch changes nothing the solver reads; a switch that does stays an explicit
step, and invariants are checked on every character's view. The demo's proof: 6 528 → 3 480 states, same verdict.

| Game | Proof | States | Engine runs | Time | Positions |
|---|---|---|---|---|---|
| 20 rooms, 1 character | solved | 797 | 3 295 | 0.2 s | 20 |
| 20 rooms, 2 characters | truncated | 20 000 | 153 282 | 12.7 s | 757 |
| 20 rooms, 3 characters | truncated | 20 000 | 79 081 | 5.5 s | 60 |
| 40 rooms, 1 character | solved | 3 197 | 13 245 | 1.0 s | 40 |
| 40 rooms, 2 characters | truncated | 20 000 | 83 535 | 6.1 s | 44 |
| 40 rooms, 3 characters | truncated | 20 000 | 65 577 | 6.4 s | 112 |

The active character is no longer a factor (positions 18 796 → 112 with three characters), but the stress chains still
truncate: each character's exact room and bag now split the states. That is the mobility regions' job.

<a name="v33-mobility"></a>

### After `v33-mobility`: mobility regions, and the reference proof

A character's exact room is replaced by its **region**: the rooms it can walk between silently (generated exits and map
trips to rooms without `onEnter`, whose `visited` nothing reads, and that no condition names), the strongly connected
part around it under its own view. The proof offers the actions of every room of the region as
`Go to <room> › action`; the route is played once per room, every hop checked (it arrives, it changes nothing the solver
reads), and one that is not silent restarts the search with exact rooms (`profile.mobility.reason`). The witness of a
region proof replays on the real engine.

**The reference** (`npm run bench -- --matrix --eras`, `makeStressGame({ eras: true })`): each character confined to its
era, the item that opens the next era's first lock sent through a time chute (`{ transfer }`), one-way chutes, walkers,
scripts and topics; `softlock: true` adds a trash can that destroys item 0. Proof mode, 200 000-state budget:

| Game | Proof | States | Engine runs | Time |
|---|---|---|---|---|
| 20 rooms, 1 character | solved | 83 | 1 787 | 0.2 s |
| 20 rooms, 2 characters | solved | 358 | 7 260 | 0.8 s |
| 20 rooms, 3 characters | solved | 481 | 11 277 | 1.1 s |
| 40 rooms, 1 character | solved | 163 | 6 787 | 2.1 s |
| 40 rooms, 2 characters | solved | 678 | 25 660 | 6.5 s |
| 40 rooms, 3 characters | solved | 578 | 21 886 | 4.2 s |

The 3.3 target is met on it: 40 rooms × 3 characters proved in 578 states and 4.2 s. On 12-room versions the explicit
search (both abstractions off) gives the same verdicts with 13–15× more states (2 906 vs 230 with two characters,
16 944 vs 1 100 with three), and finds the same softlock in the negative variant (`tests/reference-proof.test.ts`).

**The open chain is still out of reach, and that is the game, not the abstraction.** Without eras, every character can
walk the whole chain and pick up anyone's item: which character carries which item is a real product the proof must
cover (20 000-state budget):

| Game | Proof | States | Time |
|---|---|---|---|
| 20 rooms, 2 characters | truncated | 20 000 | 57.9 s |
| 20 rooms, 3 characters | truncated | 20 000 | 33.8 s |
| 40 rooms, 2 characters | truncated | 20 000 | 451.7 s |
| 40 rooms, 3 characters | truncated | 20 000 | 65.9 s |

Exact reductions cannot remove those states; a game built that way is checked by the witness, the chapter witnesses and
the playtests, or by bounding who can carry what. With one character the regions shrink the open chain too (40 rooms:
3 197 → 163 states).

<a name="v33-chapter-interfaces"></a>

### After `v33-chapter-interfaces`: one search per chapter, from every boundary state at once

A chapter is now proved by **one** search that starts from all its boundary states together and shares what it has
seen (a state is safe or not whichever start reached it): it costs the union of what the starts reach, not the sum.
Checking that against the explicit search run from each start found a real defect, older than 3.3: a chapter goal that
reads the active character's bag (`{ has: 'token' }`) was evaluated on whichever character the merged state kept, so
some boundary states were lost. A canonical state now reaches a goal when any character, seen as active, meets it. On
the demo, the abstract shared search finds exactly the explicit search's boundaries at every chapter
(`tests/reference-proof.test.ts`), with 15–36× fewer states.

| Demo | Before 3.3 | Now | 3.3 target |
|---|---|---|---|
| Global proof | 6 528 states, 4.4 s | 3 480 states, 4.5 s | under 5 s |
| Proof by chapters | 115 620 states, 90–147 s | 5.7 s | under 20 s |

Mobility is off on the demo, and the profile says why (`no move of this game can be silent`: every room has an
`onEnter` or is named by a condition), which also spares the region computation on every hash.

<a name="v33-noop-memo"></a>

### After `v33-noop-memo`: no partial-order reduction in proofs, a no-op memo instead

**The reduction, measured in proof mode.** Sleep sets visit every state but skip edges: an action already tried in a
commuting order is not run again. The proof classifies states by reverse reachability over those edges, so a skipped
edge can hide the only way to the goal. On the era game it does: 20 rooms × 3 characters reports a softlock that the
plain proof does not have (40 × 3 too), while skipping under 2% of the engine runs and taking 20–25% longer
(`tests/por.test.ts`, "why proof mode keeps the reductions off"). Reductions stay off in proofs; the cost is elsewhere:
78% of the demo's engine runs (92% on the era game) change nothing.

**The no-op memo.** The engine records what a run writes (`Engine.writes`, beside `Engine.reads`), even a value already
there. A run that writes nothing the solver hashes is kept with the values it read; the same action on a state with the
same values is a no-op too, and is not run. It drops no edge (a no-op is a loop), so the proof is the same. It relies on
the read trace being complete: one skip in 16 is run anyway and compared, and a difference is an error, never a silent
skip. `tests/memo.test.ts` runs every skip anyway on twelve fixtures (witness and proof) and on the demo: same verdicts,
states, softlocks, witnesses and reachability counts.

> [!LIMIT id=memo-corpus-equivalence]
> The no-op memo's equivalence is checked on that corpus, not proved for every game: a future condition or command
> that forgets to declare a read would break it, and only a check that runs every skip would catch it
> (`npm run solve -- --audit-abstractions`, 3.3.1).

| Demo | Before | With the memo |
|---|---|---|
| Global proof | 129 840 runs, 4.4 s | 40 191 runs, 2.2 s |
| Proof by chapters | 5.7 s | 3.3 s |
| Era game, 40 rooms × 3 characters | 21 886 runs, 4.5 s | 10 647 runs, 3.5 s |

`npm run solve -- --profile` ends its header with what each abstraction did, or why it is off:

```text
Abstractions (what each one did, or why it is off):
  canonical character   3048 switches folded, 0 kept explicit
  mobility regions      off (no move of this game can be silent)
  no-op memo            95625 runs skipped (5976 of them run anyway and identical), 522 kept, 4728 refused
```

<a name="v330-release"></a>

### 3.3.0, measured on the release (5 October 2026, cache off)

| Game | Status | States | Engine runs | Time | 3.3 budget |
|---|---|---|---|---|---|
| Demo, global proof | solved | 3 480 | 40 191 | 2.2 s | 5 s |
| Demo, proof by chapters | solved | 5 chapters | | 3.3 s | 20 s |
| Reference, 40 rooms, 1 character | solved | 163 | 764 | 1.8 s | |
| Reference, 40 rooms, 2 characters | solved | 678 | 11 348 | 5.6 s | |
| Reference, 40 rooms, 3 characters | solved | 578 | 10 647 | 3.5 s | 200 000 states, 60 s |

With the proof cache warm, the demo's global proof answers in 0.17 s and its chapters in 1.1 s. The open matrix
(characters not confined to an era, items moving freely) still truncated with 2 and 3 characters: see
[After `v33-mobility`](#v33-mobility).

<a name="v331-audit"></a>

### 3.3.1: the abstractions audited (5 October 2026)

`npm run solve -- --audit-abstractions` ([`src/engine/tools/audit.ts`](../../src/engine/tools/audit.ts)) proves the
selected game twice: with the abstractions, every memo hit run anyway and compared, and with all of them off. It fails
(exit 1) on any difference in the verdict, the broken invariants, whether softlocks exist, or the flags, rooms and
places reached; it says `partial` (exit 2) when the explicit search does not fit the budget, because then the verdicts
were not compared. On the demo: `same`, 3 480 states against 6 528, 95 625 memo hits all identical, 9.5 s.
`release-check` runs it.

`tests/audit.test.ts` runs the same audit on 120 random games (`tests/gen/random-game.ts`: 2–4 rooms, 1–2 characters,
negative `has`, consumption, transfers, counters, `once` / `nth` / `cycle`, nested `if`), and on one game per command
and per condition of the DSL (the two tables are checked against the `Cmd` and `Cond` types: a new variant without a
sample does not compile). Of the 120 random games, 92 are `same` (the explicit search: 26 solved, 18 with softlocks, 48
unsolved) and 28 `partial` at 3 000 states; none diverged.

What it found, and what was fixed:

- **A dead flag that was not dead.** The first written rule that matches answers. A flag that gates only an earlier
  rule, which itself only touches that flag, looked dead to the liveness analysis, yet it decides whether the earlier
  rule or a later one answers. The solver merged the two states and lost every path through the later rule; on one
  random game, the abstractions happened to reach a flag the explicit search did not. This was a flaw of the base
  search, not of an abstraction. The puzzle graph now links an earlier rule's condition to every later rule it can
  shadow (`puzzleGraph`); the demo and the reference game keep exactly the same state counts.
- **Rooms reached.** With the canonical character, a room where only another playable character stood was missing from
  `roomsReached` (and so could be reported by the lint as never reached). Every character's view now counts.

<a name="v34-reference"></a>

### 3.4: the reference chapter (5 October 2026)

`games/reference`, "The Night Market": 8 rooms, 9 items, 5 characters, two of them playable (Pixel and Biscuit, who hand
items to each other and open places for each other), a staged market (Canvas, 960 wide, 6 layers with parallax, 3
occluders, 2 walk zones joined by stairs), a yard on two planes (a ladder opened by a flag, a jump for Biscuit only), an
autonomous script, a minigame, a timeline finale. Measured on an M-series laptop, cache off.

| Measure | Result | Gate |
|---|---|---|
| Witness | 1 450 states, 0.6 s, 49 steps | — |
| Global proof | solved, 904 states, 1.9 s | no softlock |
| Proof by chapters (`lights`, `ending`) | 848 + 72 states, 16 boundary states, 2.0 s | every chapter from every boundary state |
| `--audit-abstractions` | `same`: 904 states against 83 672 explicit, 36 144 memo hits identical, 40.8 s | no divergence |
| Frame rate, CPU ÷4, Canvas | market 50.2 fps (47.3 at ÷8), yard / alley / street 60.2 fps | ≥ 30 fps |
| First visit | 1 989 KB transferred, 2 198 KB predicted, nothing outside the prediction | within 10%, nothing outside |
| Rooms | 541–718 KB each; the whole chapter 4 249 KB | 3 000 KB a room, 6 000 KB a chapter |
| Visual baselines | 8 / 8 rooms, 0.00% | ≤ 0.5% |

Played to the end by CI: at the keyboard in Chromium and WebKit, in French with no English default visible, and by the
generic harness with axe and a save round trip.

<a name="v340-release"></a>

### 3.4.0, measured on the release (5 October 2026, cache off)

| Game | Status | States | Time | Against 3.3.0 |
|---|---|---|---|---|
| Demo, global proof | solved | 3 480 | 2.3 s | same states (2.2 s) |
| Demo, proof by chapters | solved | 5 chapters | 3.6 s | same chapters (3.3 s) |
| Era reference, 40 rooms × 3 characters | solved | 578 (10 647 engine runs) | 3.9 s | same states (3.5 s) |
| The Night Market, global proof | solved | 904 | 1.9 s | new |
| The Night Market, by chapters | solved | 2 chapters | 2.0 s | new |

3.4 changed the picture, not the logic: every state count is the one 3.3.0 measured; the times move within the noise of
a laptop.

<a name="v35-workers"></a>

### 3.5: proof workers (5 October 2026)

`npm run solve -- --prove --workers=N` ([`src/engine/tools/solve-pool.ts`](../../src/engine/tools/solve-pool.ts)): the
search takes a batch of nodes from its frontier (64 by default, best first, `--batch`), each node goes to whichever
worker thread is free, and the expansions come back to be merged in the batch's order. An expansion reads nothing of the
search (no `seen`, no frontier): it is the node's tries run on the engine, built from the game and the options alone
(`makeExpander`), the same in every thread. The merge, in the search's thread, is where `seen`, the goals, the edges and
the frontier change. So the result depends on the batch and never on the number of workers; one worker is the same
batched search in the search's thread. Without `--workers` nothing changes: one node at a time, the same witnesses and
proofs as 3.4 (checked byte for byte on the demo and the reference chapter, witness and proof). A worker that cannot
start, or stops, leaves its nodes to the search's thread (the result does not change; `profile.workers.reason` says
it); the custom commands reach the workers from the game's module; the partial-order reduction keeps them off. `--time`
stops a search, workers or not.

Measured with `npm run bench -- --workers-table` on a 10-core laptop, cache off.

The open chain, 20 rooms × 2 characters, items moving freely, stopped at 40 000 states:

| Workers | Proof | States | Time | Speed-up | Result |
|---|---|---|---|---|---|
| none (one node at a time) | truncated | 40000 | 58.1 s | ×1.00 | `9806965f9b` |
| 1 | truncated | 40000 | 55.0 s | ×1.06 | `530cfb4002` |
| 2 | truncated | 40000 | 32.3 s | ×1.80 | `530cfb4002`, the same as 1 |
| 4 | truncated | 40000 | 22.8 s | ×2.54 | `530cfb4002`, the same as 1 |
| 8 | truncated | 40000 | 16.9 s | ×3.43 | `530cfb4002`, the same as 1 |

The era reference, 40 rooms × 3 characters (solved):

| Workers | Proof | States | Time | Speed-up | Result |
|---|---|---|---|---|---|
| none (one node at a time) | solved | 578 | 3.8 s | ×1.00 | `2717e116b8` |
| 1 | solved | 578 | 3.9 s | ×0.99 | `17cf8b1721` |
| 2 | solved | 578 | 2.4 s | ×1.59 | `17cf8b1721`, the same as 1 |
| 4 | solved | 578 | 1.9 s | ×2.01 | `17cf8b1721`, the same as 1 |
| 8 | solved | 578 | 1.7 s | ×2.20 | `17cf8b1721`, the same as 1 |

The 3.5 gate (×2 with 4 workers on a large proof, the same result for 1, 2, 4 and 8) is met. The result without workers
has another signature: the order of a batched search differs (the same states and verdict, other first-found paths);
`tests/workers.test.ts` checks both. What does not scale: the merge (the states cross between threads, the search's
thread checks each one), and starting the workers (about 0.3 s): a small proof, like each of the sample game's chapters,
is not faster. So workers stay off unless asked for; `--workers=auto` (the cores but one, at most 8) is the setting for a
large game.

<a name="v35-ownership"></a>

### 3.5: who holds what (5 October 2026)

**The canonical owner** (proofs, on by default with the canonical character and mobility regions; `--ownership=off`).
With several playable characters, which one holds an item multiplies the states: three characters and twelve items that
move freely is the open matrix that 3.3 could not prove. An item no condition reads (so lacking it decides nothing: no
`else`, no rule shadowed by one that needs it), in no invariant or goal, lost or moved only by an action on it, and given
by no rule or reaction by kind (`poolableItems`), is pooled while every two characters can meet: the state keeps how
many of each pooled item exist, not who holds them. Before a character's actions are tried, the hand-overs that give it
the pool are played on the engine: the other holder switches in, both walk to a room their regions share, the items are
given, the controls come back, and every step must leave the state as the search sees it. One that does not restarts
the proof without pooling (`profile.ownership.reason`), like mobility.

Checked against the explicit search (`--audit-abstractions`, `tests/audit.test.ts`): the reference chapter `same`, 288
states against 83 672; 60 random games with free items, no divergence (32 compared within 3 000 states, 10 of them with
hand-overs played; 44 compared within 20 000, 14 with hand-overs, none diverged). The first version diverged on 3 of the
60: the pool listed items the search otherwise ignores (dead ones), and the audit caught it.

| Game | Without the owner | With it |
|---|---|---|
| The Night Market (2 characters) | 904 states, 2.0 s | 288 states, 1 559 hand-overs, 1.2 s |
| The sample game | 3 480 states | the same: no mobility region, so no owner |
| Open chain, 20 rooms × 2 characters, 12 items | truncated at 40 000 states (58 s) | **solved**, 14 002 states, 19.4 s |
| Open chain, 20 rooms × 3 characters | truncated | **still truncated** at 200 000 states (154 s with 4 workers) |

The 3.5 target, the 20 × 3 open matrix within budget, was **not met**. The owner applies only while every two characters
can meet, and in the open chain locked doors keep them apart most of the time (1 817 hand-overs in 200 000 states). As
decided, this did not block 3.5; it was the open question for what followed.

**Witness dominance** (`--dominance`, witnesses only: it cannot prune a proof). A state with no more progress than one
already seen (the same everything else; its monotonic items and boolean flags, those nothing reads for their absence, a
subset) is not explored. A witness search that finds nothing with it runs again without it, so it never reports
`unsolved` by itself. Measured: it prunes nothing on the sample game, the reference chapter or the stress games. The
best-first search reaches a witness before a dominated state comes up, and a dominated state only comes up once the
better ones are exhausted, which (when absence is never read) means the search is failing anyway. It stays an option,
off by default.

<a name="v350-release"></a>

### 3.5.0, measured on the release (5 October 2026, cache off)

| Game | Status | States | Time | Against 3.4.0 |
|---|---|---|---|---|
| Demo, global proof | solved | 3 480 | 2.5 s | same states (no mobility region, so no owner) |
| Demo, proof by chapters | solved | 5 chapters | 3.7 s | same chapters |
| Era reference, 40 rooms × 3 characters | solved | 578 (10 647 engine runs) | 4.1 s | same states (characters in their eras never meet) |
| The Night Market, global proof | solved | 288 | 1.2 s | 904 → 288 (the canonical owner) |
| The Night Market, by chapters | solved | 2 chapters | 1.2 s | 2.0 → 1.2 s |

<a name="v351-memory"></a>

### 3.5.1: what the workers cost in memory (5 October 2026)

```sh
# in the engine repository
NODE_OPTIONS=--expose-gc npm run bench -- --workers-table --max=20000
```

The open chain of 20 rooms × 2 characters, batches of 64. The table has a peak RSS column since 3.5.1: the whole
process, worker threads included, sampled every 20 ms, collected before each row. Memory a run frees is not always given
back to the system, so later rows are an upper bound.

| Workers | Proof | States | Time | Speed-up | Peak RSS |
|---|---|---|---|---|---|
| none (one node at a time) | solved | 14002 | 18.3 s | ×1.00 | 534 MB |
| 1 | solved | 14002 | 18.8 s | ×0.97 | 866 MB |
| 2 | solved | 14002 | 11.0 s | ×1.65 | 1026 MB |
| 4 | solved | 14002 | 7.0 s | ×2.62 | 1211 MB |
| 8 | solved | 14002 | 6.1 s | ×3.01 | 1496 MB |

Each worker loads its own engine and game: about 150 to 350 MB more per worker. Four workers cost more than twice the
memory of one search for ×2.6 of speed. This is one more reason the workers stay off unless asked for. It also showed
that more workers would not reach 20 × 3: that needs fewer states (3.6).

A worker that stops mid-search leaves the pool for good: its node goes back to the others, or to the search's thread
when none is left. `stats()` asks only the live workers, 2 s at most each. `tests/workers.test.ts` stops one worker of
four after 5 expansions, then all three of three, both by exit and by an uncaught error: the proof is the same.

<a name="v36-pooling"></a>

### 3.6: pooling by group, a leak, and a corpus (5 October 2026)

**Pooling by group.** 3.5 pooled the free items only while every two playable characters could meet. With three
characters in the open chain they seldom all could, so who held each key multiplied the states. 3.6 splits the
characters by who can meet whom. A group where every two can meet shares one pool of the free items its members hold; a
character outside any group keeps its own bag. The hand-overs before a character acts are played within its group only,
checked as in 3.5.

| Open chain, 3 characters, 12 items | 3.5 | 3.6 |
|---|---|---|
| 8 rooms | 29 909 states, 24 s | 12 613 states, 11 s |
| 10 rooms | 64 957 states, 63 s | 14 528 states, 18 s |
| 12 rooms | truncated at 120 000 | **solved**, 66 189 states, 93 s |
| 14 rooms | truncated at 120 000 | **solved**, 93 480 states, 166 s |

Checked against the explicit search:

- the 7-room chain with three characters, with and without a softlock: `same` (4 909 states against 97 257, 2 599
  hand-overs);
- 40 random three-character games (`tests/audit.test.ts`);
- `npm run audit:corpus -- --seeds=300`: 900 games, 549 compared to the end, 196 of them with hand-overs played. No
  divergence (599 s). It runs every night on 500 seeds (`.github/workflows/nightly.yml`); 351 of the 900 stopped partial
  (the explicit search hit its 3 000 states) and were not compared: a claim reads "900 tried, 549 compared".

The first corpus reported three divergences, all in unsolvable games: every flag is dead there, so it is not in the
states, and which flags show as reached depends on which merged state was kept. The audit now compares the live flags
only (`SolveResult.liveFlags`). The corpus also ran out of memory. The solver left a zero-delay timer queued on every
action, about 15 MB a search, until the process went idle. Fixed: 918 MB after 60 audits before, 9 MB after.

**20 rooms × 3 characters: still truncated**, at 600 000 states in 2 375 s, 7.6 GB at the peak (1 879 041 hand-overs,
2 407 distinct positions). Pooling by group moves the limit from 10 to 14 rooms, not to 20. What is left is where the
characters stand: three of them in regions apart, with the doors each has opened. That needs an abstraction of
characters who cannot meet, the open question since 3.3.

Not done from the 3.6 plan: removing items no remaining condition reads (the group was the lever that the profile
pointed to), and counting the traffic between workers.

<a name="v4113-matrix"></a>

### 4.1.13: the proof matrix, a compact store, checkpoints (7 October 2026)

[`docs/dev/PROOF-MATRIX.md`](../../docs/dev/PROOF-MATRIX.md) fixes the class of games the solver is measured on, before
any code of 4.1.13: twelve generated games (`matrixGame`, `tests/gen/random-game.ts`) of 20 to 40 rooms and three
playable characters, six constrained and six open, with crossed key puzzles, dialogues, a script and an event per zone,
free trinkets and a furnace. Budget per instance: 10 000 000 states, 10 minutes on the maintainer's Mac (Apple M5, Node
22.14; measured with `--time=590`), 4 GB of heap. `npm run prove:matrix -- --only=<id> --time=590 --json=…`, one
instance per process, one at a time. "Before" is the 4.1.8 solver (its sources with only the matrix's generator and
tool added); "after" is 4.1.13, compact representation, no workers.

| Instance | Before: verdict, states, time | After: verdict, states, time | States/s | Peak heap | Peak RSS |
|---|---|---|---|---|---|
| c11 (39 rooms) | proved, 5 385, 32.1 s | proved, 5 385, 31.7 s | 168 → 170 | 233 → 81 MB | 392 → 236 MB |
| c12 (37) | softlock, 7 333, 46.7 s | softlock, 7 333, 47.7 s | 157 → 154 | 333 → 87 MB | 535 → 240 MB |
| c13 (20) | softlock, 341, 0.8 s | softlock, 341, 0.8 s | 425 → 409 | 24 → 30 MB | 168 → 167 MB |
| c14 (25) | proved, 1 871, 6.0 s | proved, 1 871, 6.1 s | 314 → 307 | 71 → 64 MB | 219 → 208 MB |
| c15 (37) | proved, 1 605, 7.8 s | proved, 1 605, 8.0 s | 205 → 202 | 89 → 68 MB | 266 → 227 MB |
| c16 (21) | softlock, 259, 0.6 s | softlock, 259, 0.6 s | 410 → 411 | 28 → 30 MB | 165 → 165 MB |
| o21 (26) | proved, 80 967, 461 s | proved, 80 967, 419 s | 175 → 193 | 2 556 → 127 MB | 2 721 → 267 MB |
| o22 (39) | truncated (time), 33 498 | truncated (time), 36 399 | 57 → 62 | 1 998 → 297 MB | 2 263 → 415 MB |
| o23 (27) | truncated (time), 79 822 | truncated (time), 89 266 | 135 → 151 | 2 598 → 141 MB | 2 800 → 272 MB |
| o24 (38) | truncated (time), 16 900 | truncated (time), 17 079 | 29 → 29 | 894 → 104 MB | 1 094 → 253 MB |
| o25 (29) | truncated (time), 81 071 | truncated (time), 75 246 | 137 → 128 | 1 896 → 115 MB | 2 078 → 229 MB |
| o26 (22) | softlock, 8 638, 58.0 s | softlock, 8 638, 57.5 s | 149 → 150 | 349 → 86 MB | 546 → 247 MB |

> [!MEASURE id=proof-matrix-memory]
> The compact store divides the proof matrix's memory by 9 in heap and 4.5 in RSS (the twelve peaks summed: 11 069 →
> 1 230 MB of heap, 13 247 → 2 926 MB of RSS), with the time unchanged (×1.03 in geometric mean). An observation on
> that matrix and machine, not a promise for another game.
> - date: 2026-10-07
> - version: 4.1.13
> - volume: the twelve instances of the proof matrix, 20 to 40 rooms, three playable characters
> - conditions: the maintainer's Mac (Apple M5, Node 22.14), --time=590, 4 GB of heap, no workers, one instance per process
> - source: [docs/en/BENCH.md, 4.1.13](https://github.com/Quest-n-Click/quest-n-click/blob/570b57d891d42266e6af46e285d85e26e09777e9/docs/en/BENCH.md)

**Memory: ÷9 in heap, ÷4.5 in RSS over the matrix** (the RSS holds about 160 MB of Node and the engine whatever the
search). On the large open proofs the heap falls by 16 to 20 times: o21 held 31.6 KB per state, it holds 1.6 KB.
**Time: unchanged** (×0.93 to ×1.12 per instance, ×1.03 in geometric mean): the time per state is the engine's runs,
which a representation does not touch. The verdicts and state counts are the same where both finished (the oracle,
below). **The objective was not met**: the same eight instances of twelve finish within the budget; o22 to o25 still
run out of time, now with 4 GB of heap almost untouched. 4.1.13 was therefore "Solver Research"; the gap report is
section 8 of `docs/dev/PROOF-MATRIX.md`.

With four workers (`--workers=4`, the shared visited table on), o23 reaches 237 618 states in the same 590 s (403
states/s, ×2.7 on one thread; 787 MB of RSS with the four engines) and is still truncated, its frontier growing (2 920
states queued at the end).

**The oracle.** `tests/solver-oracle.test.ts`: the sample game (witness and proof), the reference game's proof and 200
generated games (proofs within 3 000 states) give, with the compact store, exactly what the 4.1.8 implementation wrote
in `tests/fixtures/solver-oracle.json` before any change: the verdict, the path and its session entries, the softlocks
and their causes, the dead ends, the flags and rooms reached and the whole reachable set, state for state (203
searches, 90 s). `tests/compact.test.ts` compares compact and `objects` field for field on the sample game, 40 generated
games and two matrix instances.

**The rest of the lot, measured.** The nightly corpus on this code (`npm run audit:corpus`, 500 seeds × 3 kinds in four
shards of 250–278 s): 1 500 games, 909 compared to the explicit search, 0 divergence (591 partial). A checkpoint of o23
weighs 1.7 MB at 8 796 states and 3.2 MB at 17 968 (about 180 bytes a state, the frontier's engine states included);
taken up with a second budget of 60 s, the search went on from 8 796 to 17 968 states. Symmetric items (`--symmetry`), on
30 generated games with twin coins: 0 divergence against the explicit search (14 compared, 16 partial), 11 616 → 8 802
states on the 19 that finished both ways (÷1.3); none in the bundled games nor the matrix, so it stays off by default.
Dominance in a proof (`--dominance` with the test-only `unsafeReduction`): 1 verdict changed in 43 generated games
compared, so it stays off in proofs. The shared visited table sends states back from the workers without their engine
state (the profile's `shared` line counts them); the result is the same for 1, 2 and 4 workers
(`tests/partition.test.ts`). Not done: the symbolic backend (BDD, SAT/SMT, CEGAR) was not tried.

<a name="related"></a>

## Related

- [What the solver proves](create.solver-proofs.md), [Solver options](create.solver-options.md),
  [Which tests run when](contribute.which-tests.md) (the nightly heavy tests, the corpus, the proof matrix).
- [`tools/bench.ts`](../../tools/bench.ts), [`tools/prove-matrix.ts`](../../tools/prove-matrix.ts),
  [`docs/dev/PROOF-MATRIX.md`](../../docs/dev/PROOF-MATRIX.md), [`docs/dev/PROOF-PROFILE.md`](../../docs/dev/PROOF-PROFILE.md).
