# Play and replay a session

The Play tab runs the game in a frame beside its live state and its journal, exports what you played as a session
file, replays one to land the game where it ends, and, for a speedrun game or a game with hero choice, adds the
panels that go with them.

<a name="what-you-get"></a>

## What you get

A session file (`<game>-session.json`) that reproduces a bug, the game put back exactly where a tester stopped, and
the journal of what every action answered.

<a name="context-and-versions"></a>

## Context and versions

The local Studio, engine repository or created project. True from 4.1.14 (the speedrun panel); the text switches from
4.3.0. On a hosted Studio the game runs on its own origin: the frame shows it with its dev tools, and the panels that
read into the frame (state, journal, rule explainer, sessions, text switches) are left out.

<a name="prerequisites"></a>

## Prerequisites

- The Studio running ([overview](studio.overview.md)).

<a name="where-to-run"></a>

## Where to run the commands

In the browser, on the Play tab. `npm run replay` runs in the engine repository.

<a name="steps"></a>

## Steps

<!-- step: play -->
1. **Play in the frame.** The game runs with its dev tools on. Beside it, the live **state**: room, bag, flags, what
   is unlocked, where the moving characters are, the scripts running, the players. Under it, the
   [rule explainer](studio.rule-explainer.md).

<!-- step: journal -->
2. **Read the journal.** What every action answered (a rule, a look line, a fallback…), the events emitted and the
   listeners they reached, each script step, characters moved, player switches; filter it by kind. The engine keeps it
   in dev mode only (`Engine.trace`, the last 200 entries).

<!-- step: export -->
3. **Export session** downloads the inputs since the game started, with the journal: `<game>-session.json`. That file
   is a bug report.

<!-- step: replay -->
4. **Replay…** loads a session file: the engine plays it silently and the game lands where it ends. A slider scrubs
   through the entries (tap one to land there), and a divergence from the recording is flagged. On the command line,
   the same file replays without a display, prints the journal and the final state, and exits 1 where the replay
   stops matching the recording:

   ```sh
   # in the engine repository
   npm run replay -- <game>-session.json
   ```

<a name="speedrun"></a>

### The speedrun panel

For a game that declares `speedrun` ([Speedrun for authors](create.speedrun.md)): the categories and their rules; the
splits with an editor (name, trigger; **+ split**; **Write to the game** writes the manifest with `set_value` on
`@game`); **Preview on this session** (the frame's session replayed with the category's splits: the times a run would
record); **Export route** / **Import route** (`.wsroute`); **Logical route (solver)** (the solver's witness, never a
record); the last two routes compared; and **Export run (.wsrun)** once an attempt in the frame is sealed.

<a name="text-switches"></a>
<!-- applies: 4.3.0.. -->

### Text switches: preview another hero

For a game whose texts hold switches (`{form?m=…|f=…}`, `{hero}`), **Text switches** under the state offers a select
per flag a switch reads; its values are the ones the switches list and the ones a literal `set` (or the start, a
checkpoint) writes. A pick sets the flag in the frame ("unset" removes it), so the room, the hero's sprite variant,
`{hero}` and every line show that hero; the hero's name as shown now is in the heading. The Rooms tab reads the same
pick to show a switched text as a player reads it ([Edit a room](studio.edit-room.md#text-switches)).

> [!LIMIT id=text-switches-local]
> Text switches are the local Studio's: a hosted Studio's game runs on its own origin; set the flag there in the
> game's DEV panel.

<a name="expected-result"></a>

## Expected result, and how to check it

After **Replay…**, the frame shows the game where the session ends and the slider is at its last entry; no divergence
is flagged. `npm run replay` exits 0.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| A divergence is flagged during a replay | The content changed since the session was recorded | Look at the entry flagged: that is where the game now answers differently |
| The journal is empty | The game in the frame was not played yet | Play in the frame |
| No state, journal or replay on a hosted Studio | The game is on another origin | Use a local Studio, or the game's own DEV panel |

<a name="files-changed"></a>

## Files or data changed

None in the game, except **Write to the game** in the speedrun panel (the game's `speedrun` manifest, through
`set_value`). Sessions, routes and runs are downloads.

<a name="references"></a>

## References

- [`src/studio/play.ts`](../../src/studio/play.ts), [`src/studio/speedrun-panel.ts`](../../src/studio/speedrun-panel.ts),
  [`src/studio/hero-picker.ts`](../../src/studio/hero-picker.ts), [`tools/replay.ts`](../../tools/replay.ts).
- [Playtests](create.playtests.md) (shared sessions summed up), [Heroes: several characters and hero choice](create.heroes.md).
