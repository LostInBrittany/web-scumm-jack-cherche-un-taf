# Solver options

Every option of `solve`, the solver's command, and of the tools around it: what it does, its default, and since when.
What the answers mean (a winning path, a proof, `truncated`) is in [What the solver proves](create.solver-proofs.md).

<a name="where-to-run"></a>

## Where to run it

- **In the engine repository** (a clone of `quest-n-click`): `npm run solve -- <options>`. The game is `GAME=<id>`,
  otherwise `config.game` of `package.json` (`games/<id>/`).
- **In a created project** (made by `npx quest-n-click create`): `npx quest-n-click solve <options>`. The game is
  `game/`. `npm run verify` runs `validate`, `solve`, `i18n status`, `lint` and `playtests`; `npm run release` adds
  `solve --prove` and `solve-reality`.

The tools marked *engine repository* below (`prove:matrix`, `audit:corpus`, `bench`, `replay`, `page:*`) have no
`quest-n-click` subcommand: a created project does not have them.

```sh
# in the engine repository
npm run solve -- --prove --profile

# in a created project
npx quest-n-click solve --prove --profile
```

<a name="summary"></a>

## All the options at a glance

| Option | What it does | Default | Since |
|---|---|---|---|
| *(none)* | A witness: one path from "New game" to the ending | | |
| `--prove` | Every reachable state; each one that lost the ending is a softlock | witness | |
| `--from=<checkpoint>` | Start from a checkpoint of `game.checkpoints` instead of "New game" | "New game" | |
| `--chapters` | One search per checkpoint that declares `goals`, then from the last one to the ending | | |
| `--goal=100%` | The goal is every objective that is not optional (`GameDef.objectives`), all at once, instead of the ending | the ending | 4.1.12 |
| `--max=<n>` | State budget | 20000 | |
| `--time=<s>` | Time budget, in seconds | none | 3.5 |
| `--mem=<MB>` | Heap budget, in MB (Node only, read every 256 expansions) | none | 4.1.13 |
| `--checkpoint=<file>` | Write the search down as it goes | none | 4.1.13 |
| `--checkpoint-every=<s>` | How often, in seconds | 300 | 4.1.13 |
| `--resume` | Take the search up from `--checkpoint`'s file | | 4.1.13 |
| `--workers=<n>\|auto` | Expand the frontier on worker threads | none (one thread) | 3.5 |
| `--batch=<n>` | Nodes taken from the frontier at once, with workers | 64 | 3.5 |
| `--profile` | What the search cost and what the states are made of | | |
| `--json` | One line of JSON on stdout, no other text | | |
| `--no-cache` | Do not read or write the proof cache | cache on | |
| `--por=sleep\|stubborn` | Partial-order reduction, witness only | off | |
| `--dominance` | Witness dominance, witness only | off | 3.5 |
| `--ownership=off` | No canonical owner in a proof | on in a proof | 3.5 |
| `--symmetry` | Fold symmetric items in a proof | off | 4.1.13 |
| `--representation=objects` | The 4.1.8 storage of states | `compact` | 4.1.13 |
| `--audit-abstractions` | The proof with the abstractions against the explicit search | | 3.3.1 |

An unknown option is ignored: the command reads only the options it knows. `--goal=` with anything other than `100%`
is refused (exit 2).

<a name="modes"></a>

## `--prove`, `--from`, `--chapters`, `--goal=100%`

- `npm run solve` alone looks for one winning path and stops at the ending.
- `--prove` explores every reachable state and reports the softlocks, grouped by cause.
- `--from=<checkpoint>` starts from that checkpoint, for example `--from=market`: handy while you work on one room.
- `--chapters` runs one bounded search per checkpoint that declares `goals`: from the previous checkpoint (or "New
  game") until its goals hold, then from the last one to the ending. Each chapter must be solvable on its own. A game
  with no checkpoint declaring `goals` prints "no chapter to solve" and exits 0.
- `--prove --chapters` proves each chapter from **every** reachable boundary state of the previous one (deduplicated by
  what the chapter reads), not from the hand-written checkpoint, which must itself be one of those boundary states
  (`checkpoint_mismatch` otherwise). A chapter starts from at most 1 000 distinct boundary states; past that, it is
  `truncated` and the proof stops there.
- `--goal=100%` searches for a state where every objective that is not optional holds at once (4.1.12,
  [ADR 0014](../../docs/dev/adr/0014-objectives.md)). Exit 2 for a game that declares none. An objective whose `done`
  the content can take back may make it unreachable; the validator warns about it.

```sh
# in the engine repository
npm run solve -- --from=market --max=50000
npm run solve -- --chapters
npm run solve -- --prove --chapters
npm run solve -- --goal=100%
```

<a name="budgets"></a>

## Long proofs: budgets, checkpoints, memory

`--max` (states, 20 000 by default), `--time` (seconds) and `--mem` (MB of heap) bound a search. Each one stops it as
`truncated`, exit 2, with the budget that stopped it named in the sentence ("raise --max", "raise --time", "raise
--mem, or resume from the checkpoint"). A truncated search is never a proof.

`--checkpoint=<file>` writes the search down every `--checkpoint-every` seconds (300 by default) and when a budget
stops it: the store, the frontier in its order, the counters. `--resume` takes it up from that file, to the same
verdict and the same witness as a search that never stopped
([`tests/checkpoint.test.ts`](../../tests/checkpoint.test.ts) kills a real process with SIGKILL at 30 % and resumes
it). A snapshot belongs to one search: the game and the options that change what is found are its fingerprint, and
another search ignores it (the profile says why). A finished search removes its file. The checkpoint covers the whole
game's search; `--chapters` runs several searches and does not use it. It needs the compact representation.

```sh
# in the engine repository: a long proof, written down, then resumed with a bigger budget
npm run solve -- --prove --checkpoint=p.ckpt --checkpoint-every=300 --mem=3500
npm run solve -- --prove --checkpoint=p.ckpt --resume --max=200000
```

> [!GUARANTEE id=checkpoint-resume-same-proof]
> A search cut by its budget is written down, and a bigger budget takes it up to the same proof as a search that
> never stopped.

<a name="workers"></a>

## Workers

`--workers=N` expands the frontier a batch at a time (`--batch`, 64 by default) on worker threads; `auto` takes the
cores but one, at most 8. The merge stays in the batch's order, so the result depends on the batch, never on the number
of workers ([`tests/workers.test.ts`](../../tests/workers.test.ts),
[`tests/partition.test.ts`](../../tests/partition.test.ts)). Since 4.1.13 the search shares its visited table with the
workers (the 64-bit hash of every stored state): a worker sends a state the search has already stored back without its
engine state. The exact keys stay the authority: a worker's "already stored" that the search does not confirm is
expanded again in the search's thread. Each node goes first to the worker its room hashes to, and an idle worker steals
from the longest queue. A worker that stops mid-search leaves the pool, with the same proof, and the profile says so.

Workers speed an exploration up; they do not answer an explosion of states. Measured in 3.5 (5 October 2026,
[Benchmarks](contribute.benchmarks.md)): a large proof went about 2.5 times faster with 4 workers. They do not combine
with a partial-order reduction.

```sh
# in the engine repository
npm run solve -- --prove --workers=4 --batch=64 --time=60
```

<a name="profile"></a>

## Reading the profile

`npm run solve -- --profile` (the Studio's Check tab, "Solver health"; the `solve` MCP tool with `profile: true`) says
why a search is slow or big. With `--prove`, since 4.1.13, it also gives the explosion profile. Here is an excerpt on
the demo game (engine repository, `main`, 23 October 2026):

```text
SOLVER PROFILE
  states explored       3480
  engine runs           56588  (107244 tries changed nothing, 79588 of them not run: the no-op memo knew; 25455 landed on a known state)
  actions not run       713640  (no rule could answer them)
  actions per state     44.7 on average, 51 at most (market, 3 items in the bag: 1 Give, 2 Map, 3 Switch changed something)

Abstractions (what each one did, or why it is off):
  canonical character   3048 switches folded, 0 kept explicit
  mobility regions      off (no move of this game can be silent)
  witness dominance     off (off in proofs: it changes softlock verdicts on generated games (tests/dominance.test.ts))
  symmetric items       off (not asked for (--symmetry))
  representation        compact, 427 KB of tables

Explosion: what multiplies the 3480 states measured (states that would merge without it)
  positions        2904  (18 distinct values over 3 dimension(s))
  inventories      3042  (76 distinct values over 2 dimension(s))
  flags            3000  (78 distinct values over 13 dimension(s))
…
What splits the states (states that would merge without it):
    2940  pos biscuit  (44 values)
    2400  pos hero  (30 values)
…
Use / give combinations per room (over its expansions):
  house: 84096 candidates, 465 answered by a rule, 81021 could only fall back (96% useless)
Independent dimensions (their combinations multiply the states; a checkpoint between them would cut it):
  ⚠ nth house.take-teacup.nth, flag lou_has_key, prop house.armchair: 8 of 8 combinations seen
Monotonic (never lost once gained): 10 flags, 1 items (shell_phone)
```

How to read it:

- **What splits the states.** Each dimension of the state (an item in the bag, a flag, a prop state, a script
  position…) is scored by how many states would merge if it were dropped. The top of that list is what the game's
  logic is made of, or the puzzle that went combinatorial.
- **Explosion.** The stored states are attributed to five families: positions, inventories, flags and counters, what a
  dialogue writes, what a script or an event writes. For each, how many states would merge without it: what it
  multiplies. Three counts say what never became a state: symmetries folded, tries that changed nothing, and
  transitions that landed on a state already seen (two orders of independent actions).
- **Abstractions.** Each abstraction has a line: what it did, or why it is off.
- **Independent dimensions.** Groups of two-valued dimensions whose combinations all show up evolve independently: a
  checkpoint with `goals` between them makes each chapter's search small. The independent sub-puzzles are reported,
  not applied: proving each alone needs a product argument the search does not make.
- **Use / give combinations.** How many tries could only fall back to a default answer.

The heat map on the puzzle graph (Check tab) shows the same numbers on the rules and rooms; "why is this live?" on a
card explains why the solver keeps a thing in its state.
[`docs/dev/PROOF-PROFILE.md`](../../docs/dev/PROOF-PROFILE.md) is this profile for each instance of the proof matrix.

<a name="output"></a>

## `--json` and the output

Without `--json`, the output is for people and other scripts read it as is: the verdict line, the path found (or the
path to the last state explored), the rooms reached, the map places unlocked, the flags set, the items obtained but
never used, the items never obtained, up to five dead ends, up to ten softlock causes, the invariants broken and the
engine errors.

`--json` prints one line of JSON and nothing else: `status`, `exit`, `headline`, `mode`, `cached`, `finished`,
`states`, `truncated`, `path` (labelled for people), `steps` (the session entries `npm run e2e` replays),
`softlockCount`, `softlockCauses`, `roomsReached`, `unlockedReached`, `flagsReached`, `itemsNeverUsed`, `unusedItems`,
`softlocks`, `assumptions`, `errors`, `broken`, `profile`. With `--prove --chapters`: `status`, `exit`, `headline`,
`ms` and `chapters`.

<a name="proof-cache"></a>

## The proof cache: `--no-cache`, `PROOF_CACHE`, `PROOF_CACHE_DIR`

A solver run depends only on the engine's code, the game (content, layouts, custom commands, and the sources of the
game folder) and the options. `solve` (every mode), `--chapters` and `lint` keep each result in `.cache/proofs/` and
give it back when none of that changed, saying so: `(from the proof cache, key …)`, and `cached` in `--json`. The
build, `verify:game`, `prove:game` and `release-check` ask the same questions several times; on the demo a warm proof
took 0.17 s instead of 2.4 s cold when the cache arrived (3.3.0, [`CHANGELOG.md`](../../CHANGELOG.md)).

- `--no-cache` (on `solve`) or `PROOF_CACHE=0` runs again without reading or writing it.
- `PROOF_CACHE_DIR=<folder>` moves it.
- An engine error is never kept. The 300 most recent results are kept; older ones go first.
- Tests call the solver directly and never use it.

<a name="reductions"></a>

## `--por`, `--dominance`, `--ownership=off`, `--symmetry`, `--representation=objects`

- `--por=sleep|stubborn`: partial-order reduction, commuting actions tried one at a time (fewer engine runs with
  `sleep`, fewer states too with `stubborn`). It has no proof of equivalence for softlocks: with `--prove` it is
  ignored, and the command says so.
- `--dominance`: a witness skips a state with no more progress than one already seen. Witnesses only; a witness that
  finds nothing with it is run again without it.
- `--ownership=off`: no canonical owner (who holds an item no condition reads) in a proof.
- `--symmetry`: two items the game treats alike are folded in a proof. Off by default.
- `--representation=objects`: every state stored whole, as in 4.1.8: the reference the differential tests compare with.
  The default is `compact` ([ADR 0015](../../docs/dev/adr/0015-compact-state.md)).

What each of these changes in a verdict is in [What the solver proves](create.solver-proofs.md#abstractions).

<a name="audit"></a>

## `--audit-abstractions` and `audit:corpus`

```sh
# in the engine repository, or npx quest-n-click solve --audit-abstractions in a created project
npm run solve -- --audit-abstractions
```

The proof with the abstractions (every no-op memo hit run anyway and compared) against the explicit search (canonical
character, mobility regions, canonical owner and memo off). Exit 0 same, 1 diverged, 2 the explicit search did not fit
`--max` (the verdicts were not compared). `npm run release-check` runs it.

```sh
# in the engine repository only
npm run audit:corpus -- --seeds=500                              # every night in CI: exit 1 on a divergence
npm run audit:corpus -- --from=126 --seeds=125 --json=s.json     # one shard: tried, compared, partial, diverged per kind
npm run audit:corpus -- --shard=1/4 --total=500 --json=s1.json   # shard 1 of 4 over seeds 1-500, split evenly
npm run audit:corpus -- --merge s0.json s1.json --total=500      # shards added up; fails on a seed missed or run twice
```

`audit:corpus` runs the same audit on random games of three kinds (plain, with free items, with three characters and
free items). `partial` (the explicit search hit `--max`) is not a failure: those verdicts are just not compared, and the
counts say so.

<a name="matrix-and-bench"></a>

## `prove:matrix` and `bench` (engine repository)

```sh
# in the engine repository only
npm run prove:matrix -- --only=c11,o21 --time=600 --mem=4096 --json=m.json --profile=docs/dev/PROOF-PROFILE.md
npm run bench -- --matrix --eras --max=20000
npm run bench -- --rooms=40 --prove --v3
```

- `prove:matrix` (4.1.13): the twelve instances of [the proof matrix](create.solver-proofs.md#proof-matrix), each in
  its own process under the published budgets (10 000 000 states, `--time` 600 s on the maintainer's Mac and 1 200 s on
  the runner, `--mem` 4 096 MB). Exit 1 on a false verdict; an instance out of budget is `unknown`, the gap report,
  not a failure. Also `--representation=objects|compact`, `--checkpoint-dir=<dir>` and `--workers=N`, passed on.
  Nightly only.
- `bench -- --matrix [--eras] [--max=20000]`: the 3.3 reference table, the proof on 20 or 40 rooms × 1, 2 or 3
  characters, and where the time goes (`--eras`: characters confined to eras).
- `bench -- --rooms=40 [--prove --v3]`: a generated game of that size, every tool timed on it; `--prove` adds the
  exhaustive proof, `--v3` generates it with stable ids. The weekly `prove` workflow runs it on 100 rooms.

The measures are in [Benchmarks](contribute.benchmarks.md#profile).

<a name="tests"></a>

## The solver's heavy tests (engine repository)

`npm test` runs the Node tests of the engine, the tools and the selected game, without the CPU-bound solver tests.
`npm run test:heavy` runs those (the abstraction audits, the canonical owner, the memo and ownership proofs, the
reference chapter's proof, the solver oracle, dominance, partitions, the checkpoint matrix): every night, minutes each.
See [Which tests run when](contribute.which-tests.md).

<a name="related"></a>

## Related identifiers

- `npm run validate`, `npm run lint`, `npm run verify:game`, `npm run prove:game`: [Checking your game](create.checking.md#commands).
- `npm run replay`: [Checking your game](create.checking.md#commands).
- `npm run solve:reality`: [What the solver proves](create.solver-proofs.md#reality-worlds).
- `PROOF_CACHE`, `PROOF_CACHE_DIR`: [Environment variables](reference.environment-variables.md).
