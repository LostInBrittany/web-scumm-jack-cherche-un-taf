# The proof matrix (4.1.13 "Proof at Scale")

*Frozen on 7 October 2026, before the code of 4.1.13 (programme §9.7, `docs/dev/plans/4.1.13-proof-at-scale.md`).
Sections 1 to 6 define the matrix: changing any of them (the family, a seed, a budget, a machine, an expected verdict)
is a LOG entry that says why. Section 7 onwards are measurements, added release by release.*

The promise of 4.1.13 is not "the solver no longer explodes": the distribution of characters and items across rooms
is exponential by nature. It is: **prove exhaustively a documented class of open three-character games within
published budgets, or say precisely why a proof is incomplete.** This page is that class.

## 1. The family

`matrixGame(seed, { characters: 3, rooms: [20, 40], open })` in `tests/gen/random-game.ts`, deterministic (the same
seed gives the same game on every machine). The seed draws the number of rooms (20 to 40) and the rest:

- **Three playable characters** (ann, bob, cid), each starting in their own third of a chain of rooms.
- **Locks and keys, crossed puzzles**: every 3 or 4 rooms of a zone a door needs a key; four keys in ten lie in the zone
  before (the previous character has to get it across: a pneumatic tube at the end of each zone `transfer`s anything
  to the next character, and in the open variant the characters can also walk over and give it).
- **Dialogues**: one keeper per zone, two topics; the second gives the code one lock of the zone also needs.
- **Scripts and events**: one bell per zone, a room script that emits an event after a wait; a listener of the game
  sets the flag a drawer reads (three drawers in ten wait for their zone's bell).
- **Transferable items** no condition reads (two to four trinkets: the canonical owner's ground).
- **Destructive actions and real softlocks**: a furnace destroys what goes in; in half the instances it accepts the
  keys (a real softlock: a key the game needs, burnt), in the other half only the trinkets.
- **Decor**: looks that set flags nothing reads (dead state, which the solver must not count).
- **The ending** needs the three zones' seals (each at its zone's far end).
- **Constrained** variant (`open: false`): walls between the zones, the tubes are the only way across. **Open**
  variant (`open: true`): lock-free doors between the zones, so the characters can meet, give, and wander.

## 2. The twelve instances

Seeds 11–16 constrained, 21–26 open (`MATRIX` in `tests/gen/random-game.ts`). Measured from the generator on
7 October 2026; "furnace" says what it can burn; "sub-puzzles" counts the groups of dimensions no rule links
(`subPuzzles`, the three largest in brackets); no instance has symmetric items.

| Id | Seed | Variant | Rooms | Keys | Other items | Rules | Topics | Furnace | Sub-puzzles |
|---|---|---|---|---|---|---|---|---|---|
| c11 | 11 | constrained | 39 | 10 | 2 | 78 | 6 | a trinket | 28 (6, 5, 5) |
| c12 | 12 | constrained | 37 | 8 | 2 | 79 | 6 | a key | 29 (7, 5, 5) |
| c13 | 13 | constrained | 20 | 4 | 3 | 53 | 6 | a key | 20 (6, 5, 4) |
| c14 | 14 | constrained | 25 | 5 | 2 | 51 | 6 | a trinket | 21 (6, 5, 4) |
| c15 | 15 | constrained | 37 | 8 | 3 | 72 | 6 | a trinket | 28 (6, 4, 4) |
| c16 | 16 | constrained | 21 | 4 | 4 | 55 | 6 | a key | 20 (5, 5, 4) |
| o21 | 21 | open | 26 | 6 | 2 | 53 | 6 | a trinket | 21 (6, 5, 4) |
| o22 | 22 | open | 39 | 11 | 3 | 103 | 6 | a key | 31 (15, 6, 5) |
| o23 | 23 | open | 27 | 6 | 3 | 65 | 6 | a key | 21 (9, 5, 5) |
| o24 | 24 | open | 38 | 9 | 4 | 93 | 6 | a key | 31 (5, 5, 5) |
| o25 | 25 | open | 29 | 6 | 2 | 55 | 6 | a trinket | 23 (5, 5, 5) |
| o26 | 26 | open | 22 | 5 | 3 | 57 | 6 | a key | 22 (4, 4, 3) |

## 3. Budgets

Per instance, each in its own process: **10 000 000 states**; **20 minutes** on the runner (`ubuntu-24.04`, the
nightly), **10 minutes** on the maintainer's Mac (measured with `--time=590`, ten seconds under, so a run with its
start-up stays within ten minutes); **4 GB of heap** (`--max-old-space-size=4096`; the search stops as `truncated` at
90 % of it, `--mem`). A run that a budget stops is `unknown`, never `proved`.

## 4. Machines and command

- The maintainer's Mac: Apple M5, 10 cores, 32 GB, macOS 26.5.1, Node 22.14.0. One instance at a time, nothing else
  running.
- The runner: GitHub's `ubuntu-24.04` (4 vCPU, 16 GB), Node 22, the `matrix` job of `.github/workflows/nightly.yml`,
  one job per instance. The runner varies by about 20 %: its numbers are published as the median of three nights.

```bash
npm run prove:matrix                                   # the twelve, 600 s each (the Mac)
npm run prove:matrix -- --only=o21 --time=1200 --json=m.json --profile=p.md   # one instance, the runner's budget
```

Exit 1 on a false verdict (`proved` where the matrix expects a softlock, or the reverse) or an engine error. Nightly
only, never on a pull request.

## 5. Expected verdicts

Established by the reference proof of 4.1.8 (its audited abstractions on, the explicit search's verdict on the corpus
every night) within the Mac's budget, on 7 October 2026, from `.cache/before` (the 4.1.8 sources with only the
matrix's generator and tool added). `unknown`: the 4.1.8 proof did not finish within the budget, so nothing is
expected. A softlock names the step that lost the game in the shortest sample found (the cause; the full path is in the
`--json` output, and replays with `npm run replay`).

| Id | Expected | 4.1.8: states | time | states/s | peak RSS | stopped by | softlock states | cause (last steps of the sample) |
|---|---|---|---|---|---|---|---|---|
| c11 | `proved` | 5 385 | 32.1 s | 168 | 392 MB | | | |
| c12 | `softlock` | 7 333 | 46.7 s | 157 | 535 MB | | 2 162 | … › Use key14 with tube › Switch to bob › Go to room12 › Use key14 with furnace |
| c13 | `softlock` | 341 | 0.8 s | 425 | 168 MB | | 8 | … › Use key9 with door9 › Go to room10 › Use key15 with furnace |
| c14 | `proved` | 1 871 | 6.0 s | 314 | 219 MB | | | |
| c15 | `proved` | 1 605 | 7.8 s | 205 | 266 MB | | | |
| c16 | `softlock` | 259 | 0.6 s | 410 | 165 MB | | 94 | … › Take drawer_key10 › Switch to bob › Go to room10 › Use key17 with furnace |
| o21 | `proved` | 80 967 | 461.4 s | 175 | 2 721 MB | | | |
| o22 | `unknown` | 33 498 | 591.4 s | 57 | 2 263 MB | time | | |
| o23 | `unknown` | 79 822 | 590.1 s | 135 | 2 800 MB | time | | |
| o24 | `unknown` | 16 900 | 591.0 s | 29 | 1 094 MB | time | | |
| o25 | `unknown` | 81 071 | 590.1 s | 137 | 2 078 MB | time | | |
| o26 | `softlock` | 8 638 | 58.0 s | 149 | 546 MB | | 4 860 | … › Go to room4 › Use back › Pool to bob › Use key9 with furnace |

Eight of twelve within the budget on 4.1.8; the four open instances o22–o25 run out of time, not memory (the heap
was at 1.0–2.8 GB of 4 when the clock stopped them).

## 6. The two thresholds (programme §5.5)

- **Minimum to release**: a measured gain against the previous release on this matrix, ×3 in states per second **or**
  ÷3 in memory (both published); the compact representation delivered; checkpoint and resume; the explicit search's
  verdict on the small games (0 divergence on 500 seeds, the nightly corpus); no false proof (`truncated` never
  `proved`).
- **Release objective**: the twelve instances finish within their budget with a verdict.
- The minimum without the objective: the release is called **"Solver Research"**, with the gap report (section 8).
  Not even the minimum: no release, the work stays on its branch.

## 7. 4.1.13, measured (7 October 2026, the Mac)

The same command, the same budget, the 4.1.13 sources (compact representation, no workers). Details per instance in
`wiki/en/contribute.benchmarks.md` ("4.1.13"); the explosion profile of each instance in [PROOF-PROFILE.md](PROOF-PROFILE.md).

| Id | Verdict | States | Time | States/s (4.1.8 → 4.1.13) | Peak heap (4.1.8 → 4.1.13) |
|---|---|---|---|---|---|
| c11 | `proved` | 5 385 | 31.7 s | 168 → 170 | 233 → 81 MB |
| c12 | `softlock` | 7 333 | 47.7 s | 157 → 154 | 333 → 87 MB |
| c13 | `softlock` | 341 | 0.8 s | 425 → 409 | 24 → 30 MB |
| c14 | `proved` | 1 871 | 6.1 s | 314 → 307 | 71 → 64 MB |
| c15 | `proved` | 1 605 | 8.0 s | 205 → 202 | 89 → 68 MB |
| c16 | `softlock` | 259 | 0.6 s | 410 → 411 | 28 → 30 MB |
| o21 | `proved` | 80 967 | 419.1 s | 175 → 193 | 2 556 → 127 MB |
| o22 | `unknown` (time) | 36 399 | 591.0 s | 57 → 62 | 1 998 → 297 MB |
| o23 | `unknown` (time) | 89 266 | 590.0 s | 135 → 151 | 2 598 → 141 MB |
| o24 | `unknown` (time) | 17 079 | 590.6 s | 29 → 29 | 894 → 104 MB |
| o25 | `unknown` (time) | 75 246 | 590.0 s | 137 → 128 | 1 896 → 115 MB |
| o26 | `softlock` | 8 638 | 57.5 s | 149 → 150 | 349 → 86 MB |

No false verdict: every instance with a verdict gives the expected one, with the same number of states as 4.1.8.

**The thresholds.**

| Criterion | Measured | Met |
|---|---|---|
| ×3 states/s **or** ÷3 memory on the matrix | states/s ×1.03 (geometric mean; ×0.93 to ×1.12); memory ÷9.0 in peak heap (11 069 → 1 230 MB, the twelve summed), ÷4.5 in peak RSS (13 247 → 2 926 MB); ÷16 to ÷20 on o21, o23, o25 | **yes, by memory** |
| The compact representation | `search/compact.ts`, ADR 0015; the 4.1.8 oracle reproduced on 203 searches | yes |
| Checkpoint and resume | `--checkpoint`, `--resume`; a real process killed at 30 % resumes to the same verdict and witness | yes |
| The explicit search's verdict on the small games | `npm run audit:corpus`, 500 seeds × 3 kinds on this code: 1 500 games, 909 compared, 0 divergence (591 partial: the explicit search hit its 3 000 states) | yes |
| No false proof | a cut budget (states, time, memory) gives `truncated`, tested; no false verdict on the matrix | yes |
| **Objective: the twelve within the budget** | **8 of 12** (the same eight as 4.1.8) | **no** |

The minimum is met and the objective is not: **4.1.13 is "Solver Research"**.

## 8. The gap report (4.1.13)

| Instance | Budget that stopped it | States reached | What multiplies the states | What costs the time |
|---|---|---|---|---|
| o22 (39 rooms) | time, 590 s (heap 297 MB of 4 096) | 36 399, frontier still growing | the bags (517 distinct bags and pools in 2 758 states) | 78 tries that change nothing per state; one region spans all 39 rooms |
| o23 (27) | time (141 MB) | 89 266; with 4 workers 237 618, still growing | the bags (13 171 of 16 395 states would merge without them) | 26 no-op tries per state |
| o24 (38) | time (104 MB) | 17 079 | the bags, then the dialogues | 49 no-op tries per state, 29 states/s |
| o25 (29) | time (115 MB) | 75 246 | the dialogues and the flags, then the bags | 58 no-op tries per state |

Profiles at two minutes (PROOF-PROFILE.md); "no-op tries per state" is the profile's tries that changed nothing over
its states. What this says:

- **Memory is no longer the limit** (it was not the binding one on the Mac's ten minutes either, but it was the wall
  for longer runs: 4.1.8 needed 31.6 KB per state on o21, 4.1.13 1.6 KB). A proof can now run for hours under 4 GB,
  checkpointed, and be taken up again; the runner's nightly measures the 20-minute budget.
- **Time is the limit, and it is the engine's runs on tries that change nothing.** In an open instance a character's
  mobility region is the whole map, so every state tries every room's actions, through a hand-over when the item is
  pooled; the no-op memo refuses to keep most of those runs (they read what it cannot value). The next lever is there:
  a memo that values the reads of a macro move and of a hand-over, or a static filter of the tries no rule of the
  target room can answer. Workers multiply the speed (×2.7 with four on o23) without changing the shape.
- **The states that remain are who carries which key.** The canonical owner pools only the items no condition reads;
  the keys are read by the doors, so their carrier stays in the state. An abstraction of "a key any character of the
  group could bring to its door" would need its own audit; it is not attempted here.
- **Not tried in 4.1.13**: a symbolic backend (BDD, SAT/SMT, CEGAR; the sheet's branch 6), dominance in proofs (it
  changes 1 verdict in 43 generated games, so it stays off), proving independent sub-puzzles separately (reported by
  the profile, not applied).
