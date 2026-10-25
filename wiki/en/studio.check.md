# Check: validator, solver, critical path, heat, health, coverage

The Check tab runs the validator and the solver after every save and lays out what they found, with the world map,
the puzzle graph, the content lint, the playtests and the storyboard coverage, each the same text an MCP tool returns.

<a name="what-you-get"></a>

## What you get

A game you know can be finished from New Game (or from a checkpoint), and the list of what blocks it when it cannot:
validation errors, dead ends, items never used, rooms never reached, rules nothing can trigger.

<a name="context-and-versions"></a>

## Context and versions

The local Studio, in the engine repository or a created project. True from 4.2.1. The demo Studio runs Validate and
Solve in the page; the screenshot and the playtests need the dev server. The same checks on the command line:
[Checking your game](create.checking.md).

<a name="prerequisites"></a>

## Prerequisites

- The Studio running ([overview](studio.overview.md)).
- For **Screenshot** only: Playwright and its Chromium ([doctor](install.doctor.md)).

<a name="where-to-run"></a>

## Where to run the commands

In the browser, on the Check tab. Each panel names the command that gives the same result in the engine repository
or the created project.

<a name="steps"></a>

## Steps

<!-- step: run -->
1. **Let it run.** The validator and the solver run after every save; the tab's badge shows the result. **Run again**
   runs them by hand. **Solve from** picks the start: New game, or a checkpoint (an unknown checkpoint is a 400).

<!-- step: read-solver -->
2. **Read the solver.** The validator's errors and warnings first, then the solver: finished or not, the path it
   found, the rooms reached, what was unlocked, the items never used and never obtained, and the **dead ends** (room,
   inventory, and the path that leads there).

<!-- step: read-graph -->
3. **Ask the puzzle graph** (below) what hangs on a puzzle before you change it.

<!-- step: screenshot -->
4. **Screenshot** renders a room at a checkpoint, the editor's overlays hidden, into
   `.cache/studio/<game>-<room>[-<checkpoint>].png`.

<a name="panels"></a>

### The panels

| Panel | What it shows | Same as |
|---|---|---|
| **Validator** | Errors and warnings of the content | `npm run validate`, the `validate` tool |
| **Solver** | Finished or not, the path, rooms reached, unlocked, items never used or obtained, dead ends | `npm run solve`, the `solve` tool |
| **World** | The world map: rooms, exits, gotos; unreachable rooms and exits with no way back in red | the `world_graph` tool |
| **Content report** | What each room, item and character amounts to | `npm run validate -- --report`, the `content_report` tool |
| **Puzzles** | The puzzle graph (below) | `npm run page:puzzles`, the `puzzle_graph` tool |
| **Solver health** | Engine runs, actions skipped, no-ops, actions per state, the dimensions that split the states most, and the warnings a designer acts on: independent dimensions (a checkpoint between them would cut the states), a room with runaway branching | `npm run solve -- --profile` (the full profile under **Full profile**) |
| **Playtests** (dev server only) | The sessions of `games/<id>/playtests/` replayed and summed up | `npm run playtests`, the `playtests` tool |
| **Content lint** | Errors, warnings and info, each a link into the Rooms tab | `npm run lint`, the `lint` tool |
| **Storyboard coverage** | The storyboard checked against the content | the `storyboard_coverage` tool |
| **Changes between revisions** (dev server) | What changed between two revisions | [Semantic diff](studio.semantic-diff.md) |

<a name="puzzle-graph"></a>

### The puzzle graph

Every rule, topic, script and listener, with what it needs (grey arrows, dotted when it is read inside its commands)
and what it produces (green) or consumes (red). Tap an item, flag, prop, place or event for its card: acquired by,
used by, requires first, unlocks, downstream, and why the solver keeps it (critical, world, visible or dead, with the
chain to the end), the same text the `puzzle_graph` tool returns.

Two toggles above the graph:

- **Critical path** fades everything that does not lead to the end, a goal or an invariant.
- **Heat** colours each rule, topic, listener, script and room by how many times the solver went through it. Its
  selector can colour the nodes by the players' sessions (the playtests) instead of the solver's runs.

**Reading it before you change a puzzle.** The card of the pantry key in the demo reads: acquired by *give bouquet +
seller*; used by *use key + pantry* and the finale's goal; requires first *bouquet*, *flowers_done*, *bouquet_given*;
unlocks the pantry and the end. Remove the bouquet trade and the card tells you what breaks before the solver does.
The overview lists three smells:

- a thing **read but never produced** (a flag nobody sets);
- a thing **produced but never used** (a flag or item that leads nowhere);
- a flag **set only by actions that already need it**: it can never become true (the validator warns too).

How to design puzzles with it: [Puzzle design](create.puzzle-design.md#puzzle-graph).

> [!LIMIT id=solver-scope]
> The solver says whether **a** way to the end exists from the start you picked; its search is bounded, and a
> truncated search says so. What a result lets you conclude, and the exhaustive proof (`--prove`):
> [What the solver proves](create.solver-proofs.md).

<a name="expected-result"></a>

## Expected result, and how to check it

The tab's badge is green; the solver says it finished, with no dead end; the lint has no error. On the command line,
in the engine repository:

```sh
# in the engine repository (or a created project: npm run verify)
npm run validate && npm run solve
```

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| Screenshot: 501 `unavailable` | Playwright or its Chromium is missing | `npm i -D playwright && npx playwright install chromium` |
| 400 for **Solve from** | The checkpoint is not in the game | Pick one of the list |
| The solver does not finish | A dead end or an unreachable goal | Read the dead ends and the puzzle graph's card of the missing item |
| No Playtests panel | No session in `games/<id>/playtests/`, or the demo | Add sessions ([Playtests](create.playtests.md)) |

<a name="files-changed"></a>

## Files or data changed

None in the game. Screenshots go to `.cache/studio/`.

<a name="references"></a>

## References

- [`src/studio/check.ts`](../../src/studio/check.ts); the engine's tools in [`src/engine/tools/`](../../src/engine/tools).
- [Checking your game](create.checking.md), [Solver options](create.solver-options.md), [MCP tools](studio.mcp-tools.md).
