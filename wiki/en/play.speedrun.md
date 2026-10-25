# Speedrun for players: LiveSplit and OBS

How to run a quest'n'click game against the clock, export the proof of your run, and show your timer in OBS or drive
LiveSplit. For authors who want to declare categories: [Speedrun for authors](create.speedrun.md).

<a name="what-you-get"></a>

## What you get

A timed attempt in a category the game declares (Any%, for instance), split on what happens in the game, never on
pixels; at the finish, a sealed `.wsrun` file that anyone can replay and verify; your records on your device; and, if
you stream, a timer in OBS or LiveSplit driven by the game.

A replay proves that a run is possible and that its in-game time is exact. It does not promise to detect every cheat:
only a server's or a person's observation raises the trust further (see [the limits](#limits)).

<a name="context-and-versions"></a>

## Context and versions

The player of a game that declares speedrun categories (`speedrun` in its content). The engine has had speedruns since
4.1.14 "Time Attack"; this page holds from that version. The sample game at
[quest-n-click.cleverapps.io/demo](https://quest-n-click.cleverapps.io/demo/) declares no category, so its pause menu has no
Speedrun row; the reference game in the engine repository (`games/reference`) declares several.

<a name="prerequisites"></a>

## Prerequisites

- A game whose pause menu shows **Speedrun**.
- For OBS or LiveSplit only: Node 22.12 or newer on the machine you stream from, and a copy of the engine (a created
  project, or the engine repository); [OBS](https://obsproject.com/) or [LiveSplit](https://livesplit.org/).

<a name="where-to-run"></a>

## Where to run the commands

The run itself needs no command: it happens in the game. The streaming tools are small Node processes on **your own
machine**, never on a server and never in the game: in the engine repository through `npm run`, or in a created
project from the engine package it installed (`node_modules/@quest-n-click/engine/tools/speedrun/`).

<a name="steps"></a>

## Steps

<!-- step: start-run -->
1. **Start**: pause menu › **Speedrun** › a category. The game restarts with the category's seed; a small timer shows
   the category, the time it is ranked on (real time, in-game time, or in-game time without pauses) and the last
   split.

<!-- step: during-run -->
2. **During the run**: the pause menu shows **Abandon run**. Opening the menu is recorded as a pause, and the tab
   going to the background is recorded too; neither stops the in-game time (the game does not run while it waits).

<!-- step: export-run -->
3. **At the finish**: the run is sealed, and the pause menu shows **Export run**: a `.wsrun` file, the proof to send
   to a leaderboard or a friend. The dev panel (`?dev`) has the same export.

<!-- step: records -->
4. **Your records** stay on the device, offline (IndexedDB `web-scumm-runs`): the personal best and its splits, the
   best segment of every split, the sum of best, attempts, finishes, abandons, notes. A run resumes after a crash or
   a closed tab from its last stored chunk (every 500 inputs); what was played after it is played again.

**The ghost** is your personal best played beside you, on semantic targets: the room it is in, the action it does and
what it holds, ahead or behind at each split, never a pixel trail. It is **off the first time** you play a category
on this device, because it would show the answers of the puzzles.

<a name="streaming"></a>

## Streaming: OBS and LiveSplit

The tools run on the player's machine (decision D23), never on the Bridge, never in the game. Open the game with
`?speedrunTool=<port>` in its address: the page then posts its run's events (the category, the split ids and names,
the times; nothing else: no save, no player id, no token) to `127.0.0.1:<port>`. A page carries one port, so it feeds
one tool at a time. The tools accept events from the game's origin only: the dev server and the preview by default
(`localhost` and `127.0.0.1`, ports 5173 and 4173), `--origin=<url>` for a deployed game. Another page open in the
browser cannot post fake splits.

<!-- step: obs-overlay -->
5. **OBS**: start the overlay, then add an OBS **Browser Source** at `http://127.0.0.1:7777/?mode=full` (or
   `compact`: the timer and the last split; `transparent`: the same on no background). It updates by Server-Sent
   Events.

   ```sh
   # in the engine repository, on your machine
   npm run speedrun:overlay -- --port=7777 --origin=https://quest-n-click.cleverapps.io
   ```

   ```sh
   # in a created project, on your machine
   node node_modules/@quest-n-click/engine/tools/speedrun/overlay.mjs --port=7777 --origin=https://quest-n-click.cleverapps.io
   ```

   Then open the game at `https://…/?speedrunTool=7777`. Use your game's own address in `--origin`.

<!-- step: livesplit -->
6. **LiveSplit**: in LiveSplit, Control › **Start WebSocket Server** (it listens on `ws://127.0.0.1:16834/livesplit`),
   then start the bridge and open the game with `?speedrunTool=7778`. The game drives LiveSplit: start, in-game time,
   split, skip, pause, reset.

   ```sh
   # in the engine repository, on your machine
   npm run speedrun:livesplit -- serve --port=7778 --origin=https://quest-n-click.cleverapps.io
   ```

   `--livesplit=ws://…` points to another LiveSplit address.

<!-- step: livesplit-export -->
7. **LiveSplit splits from a run**: write a LiveSplit `.lss` file with a run's splits as the personal best.

   ```sh
   # in the engine repository, on your machine
   npm run speedrun:livesplit -- export run.wsrun --names=Pantry,Garden,Market --out=run.lss
   ```

   Without `--names`, the segments are named by the split ids; without `--out`, the file is written beside the run.

<a name="expected-result"></a>

## Expected result, and how to check it

- In the game: the timer, then **Export run** at the finish.
- In OBS: the Browser Source shows the category's name instead of "waiting for a run…", and the splits as you reach
  them.
- In LiveSplit: the timer starts when the run starts and splits with the game.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| No **Speedrun** row in the pause menu | The game declares no category | Nothing to do: that game has no speedrun |
| The overlay stays on "waiting for a run…" | The page was opened without `?speedrunTool=<port>`, or with another port | Reload the game with the overlay's port in the address |
| The overlay gets nothing from a deployed game | The tool accepts the dev server's origins only by default | Restart it with `--origin=<the game's address>` |
| LiveSplit does not move | Its WebSocket server is not started | LiveSplit › Control › Start WebSocket Server |
| The run does not start | The category could not start (the message says why) | Read the message; report it to the game's author |

<a name="files-changed"></a>

## Files or data changed

In the browser: the run's chunks and your records in IndexedDB (`web-scumm-runs`). On disk: the `.wsrun` you export,
the `.lss` that `export` writes. The tools keep nothing.

<a name="recovery"></a>

## Recovery or going back

**Abandon run** ends an attempt (counted as an abandon). A run resumed after a crash continues from its last chunk;
a run cannot be resumed in another world or with another proof. A run submitted to a leaderboard on a Bridge can be
deleted with the token the Bridge gave at submission ([Privacy](play.privacy.md#runs)).

<a name="limits"></a>

## Limits

> [!LIMIT id=integrity-not-authenticity]
> The chain proves a file was not altered after it was sealed, not that the player was honest: pauses, menus, saves,
> the real time and the inputs used are the player's word. A run whose inputs a script chose replays as valid; only a
> witness or a moderator rules it out.

> [!LIMIT id=livesplit-obs-not-tried]
> OBS and LiveSplit are tested by machines only. A real session by a person is the pass `livesplit-obs`, open
> ([#81](https://github.com/Quest-n-Click/quest-n-click/issues/81)) as of 4.4.0.

<a name="references"></a>

## References

- [Speedrun for authors](create.speedrun.md): categories, timing, verification, leaderboards, trust levels.
- [Accessibility](play.accessibility.md#fairness): options that never count as cheats.
- Design: [ADR 0016](../../docs/dev/adr/0016-run-clock-and-envelope.md) (the clock, the seeded generator, the chained
  proof), [ADR 0017](../../docs/dev/adr/0017-speedrun-verdicts-and-trust.md) (verdicts and trust).
- The code: [`tools/speedrun/overlay.mjs`](../../tools/speedrun/overlay.mjs),
  [`tools/speedrun/livesplit.mjs`](../../tools/speedrun/livesplit.mjs),
  [`tools/speedrun/local.mjs`](../../tools/speedrun/local.mjs).
