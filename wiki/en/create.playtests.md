# Playtests

The solver tells you the game can be finished. It cannot tell you where a person gets stuck. A playtest can: players
share their session from the pause menu, you drop the files into the game, and `playtests` replays them on the current
content and sums them up.

<a name="what-you-get"></a>

## What you get

A report of how real people played: play time per room, where they stalled, the hints they saw, the minigames they
played, where each one stopped, the taps that just missed a target, and a heat map on the puzzle graph keyed like the
solver's. The sessions stay in the game and are replayed by every later check, so you also learn when a content change
makes an old session no longer replay.

<a name="context-and-versions"></a>

## Context and versions

- The engine repository (the files go in `games/<id>/playtests/`) or a created project (`game/playtests/`).
- From 3.9.0: playtests, field quotas (3.7.1) and near misses (3.8.0) are all there, and a created project has the
  `quest-n-click playtests` command. The Studio's Check tab and the `playtests` MCP tool show the same report.

<a name="prerequisites"></a>

## Prerequisites

- A build of the game that testers can open on their phone: a deployed URL
  ([Build and release a game](create.build-release.md)) or your machine on the local network
  ([Testing on a phone over the LAN](create.lan-testing.md)).
- Testers who have never seen the game.

<a name="where-to-run"></a>

## Where to run the commands

- On the tester's phone: the game's pause menu.
- `npm run playtests …`: in the engine repository, on your machine. `npx quest-n-click playtests …`: in the created
  project, on your machine.

<a name="like-a-player"></a>

## Testing like a player

Each check catches something the others miss. Run them in this order:

| Step | Command (engine repository) | Catches |
|---|---|---|
| Validate | `npm run validate` | broken ids, missing Look lines, long lines, flags never set |
| Solve | `npm run solve` | dead ends, an unreachable ending, items never used |
| Walkthrough test | `npm test` (`tests/demo-walkthrough.test.ts` for the demo) | a scripted full playthrough on the real engine |
| Screenshots | `npm run e2e` | what the solver cannot see: a character on a table, a line cut by the edge |
| A real phone | `npm run dev:lan`, landscape | thumb size, readability, sound, the rotate screen |
| Sealed ending | `npm run seal`, `npm run build`, `npm run check:spoilers` | the ending text never in the clear |
| A person | the steps below | what nobody on the team can see any more |

In a created project, `npm run verify` runs validate, solve, the translation status, the lint and the playtests; the
other rows have no `quest-n-click` command, see [Checking your game](create.checking.md#commands). The Studio's Check
tab runs validate and solve in one place.

Then hand the phone to someone who has never seen the game, and stay silent. Every time they hesitate more than a
minute, write it down: it is a missing Look line, a vague hint, or an exit nobody saw.

<a name="steps"></a>

## Steps

<!-- step: send-url -->
1. **Send the game's URL.** Say only: "play as you like; when you stop, finished or not, open the pause menu and tap
   *Share session*". Do not explain a puzzle, even when asked: write down the question.

<!-- step: share-session -->
2. **The tester shares the session.** *Share session* (the pause menu's row, named by `ui.shareSession`) makes a file
   `<game>-<date>-<time>.session.json` and sends it through the phone's share sheet (Web Share), or downloads it where
   the browser cannot share. The file holds the inputs since the game started, as ids and indices only (no journal
   text, no name), the time of each input, the device family (`ios`, `android` or `desktop`, nothing finer), and the
   near misses: a tap on nothing within 24 px of a target, by room and target. The tester sends it the way they like.

> [!GUARANTEE id=session-ids-only]
> A shared playtest session has a timestamp on every step and an empty journal, and a line the game said during the
> play is not in the file.

<!-- step: drop-files -->
3. **Drop the files into the game** and commit them:
   - engine repository: `games/<id>/playtests/` (`npm run audit` scans that folder with the rest of `games/`);
   - created project: `game/playtests/`.

   Only files whose name ends in `.session.json` are read.

<!-- step: report -->
4. **Replay and read the report.**

   ```sh
   # in the engine repository
   npm run playtests -- --out=.cache/playtests

   # in a created project
   npx quest-n-click playtests --out=.cache/playtests
   ```

   It replays every file on the current content and prints, as Markdown: play time per room (a gap over a minute
   between two inputs counts as a pause), where players stall (the same action three times in a row without effect),
   the hints shown, the minigames played, where each player stopped, the near misses, and the sessions the content has
   outgrown. `--out` writes `report.md`, `report.json` and `heat.svg` (the puzzle graph, heated by the players);
   `--json` prints the report on stdout and nothing else; `--dir=<folder>` reads another folder.

<!-- step: act -->
5. **Turn the report into work.** A stall is a puzzle to clue better, a near miss a hotspot to widen, an abandon a
   place to look at. In the Studio's Check tab, the puzzle graph's heat can come from the players instead of the
   solver.

<!-- step: gate -->
6. **Keep the sessions as a gate.** The sessions stay in the game. Once the content changes they may no longer replay:
   - without `--strict` (what `verify:game`, `npm run build` and a created project's `verify` and `build` run), a
     diverged session is reported, not an error, so a content change never blocks a push;
   - with `--strict` (the release gate: `verify:release` and `release-check` in the engine repository, `quest-n-click
     release` in a created project, and the weekly `prove` workflow), a diverged session is an error, exit 1:
     re-record it or delete it.

   `--strict` alone asks for no number of sessions: zero sessions pass it, and it says so.

<!-- step: quotas -->
7. **For a release tested by players, ask for quotas.**

   ```sh
   # in the engine repository: verify:commercial, then 5 sessions that still replay, 3 played to the end, 2 device families
   npm run verify:field

   # in either context, your own numbers
   npm run playtests -- --strict --require=5 --require-completed=3 --require-devices=2
   npx quest-n-click playtests --strict --require=5 --require-completed=3 --require-devices=2
   ```

   A diverged session counts for nothing; device families are counted once each. One quota missed is an error, and so
   is no session at all. `verify:field` is not a step of `release-check` (decision D12): it is what a release tested by
   players needs. The maintainer's field pass is described in [Field passes](contribute.field-passes.md#playtesters).

<a name="sessions"></a>

## Sessions: the unit of reproduction

The engine records every input since the game started or a save was loaded (actions, map, character switches, script
steps) with the answers given on the way (choice answers, random draws). Besides *Share session*, the game's save
menu, the dev panel and the Studio's Play tab export it as `<game>-session.json`. A tester's bug report is that file
and a screenshot.

```sh
# in the engine repository
npm run replay -- session.json
npm run replay -- session.json --upTo=40 --json
```

`npm run replay` plays it back without a display and prints the journal, the semantic journal (4.1.11) and the final
state. It exits 1 at the first entry whose outcome differs from the recording, or when its semantic journal differs
from the file's. `--upTo=N` stops earlier; `--json` is for scripts. A created project has no `replay` command: play a
session in the Studio's Play tab ([Play and replay a session](studio.sessions.md)). The solver's solution is a session
too (`npm run solve -- --json` gives `steps`), which is what `npm run e2e` taps through. The file's format is in
[File formats](engine.file-formats.md).

<a name="expected-result"></a>

## Expected result, and how to check it

The command ends with `N session(s) replayed in … s`, and nothing diverged. With `--out`, open `report.md` and
`heat.svg`. With `--strict` and quotas, the exit code is 0.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `no playtests in games/<id>/playtests` | The folder is empty, or the files do not end in `.session.json` (the save menu's export is `<game>-session.json`) | Use *Share session*, or rename the file to end in `.session.json`. |
| `✖ <file>: recorded on game "x", not "y"` (exit 1) | A session of another game | Move it to that game's folder. |
| `⚠ <file>: recorded with save version N, the game is at M` | The save version changed since | A warning: the replay may diverge. |
| `… diverged (content changed since: re-record or delete)` | The content has outgrown the session | Re-record it, or delete it. With `--strict` this is exit 1. |
| `✖ [<id>] field quotas missed: …` (exit 1) | Fewer sessions, completed runs or device families than asked | Collect more sessions, from other kinds of device. |

<a name="files-changed"></a>

## Files or data changed

The session files you add to `playtests/`. `--out` writes into the folder you give it (`.cache/playtests` above).
Nothing else is written.

<a name="recovery"></a>

## Recovery or going back

A session is a plain file: delete it, or replace it with a fresh recording. Nothing else depends on it.

<a name="references"></a>

## References

- [`tools/playtests.ts`](../../tools/playtests.ts), [`src/engine/tools/playtests.ts`](../../src/engine/tools/playtests.ts)
- [`tests/playtests.test.ts`](../../tests/playtests.test.ts)
- [Checking your game](create.checking.md), [What the solver proves](create.solver-proofs.md)
- [Field passes](contribute.field-passes.md#playtesters), [Privacy](play.privacy.md)
