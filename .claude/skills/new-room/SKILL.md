---
name: new-room
description: Add a room to the current game, from its storyboard board to a validated, placed, solvable room.
---
# New room

Inputs: the board of `games/<id>/storyboard.json` for this room, and the decor id (`decor/<name>`).

1. Read `wiki/en/create.rooms.md`, `wiki/en/create.dsl.md` and `src/engine/core/types.ts` (RoomDef, Cmd, Cond).
2. Create `games/<id>/rooms/<room>.ts` with `defineRoom({...})`: `id`, `name`, `decor`, `music?`, `props`, `actors`,
   `hotspots`, `look` (one line or a list for every visible thing), `on` (rules: most specific first), `talk`, `hints`
   (in puzzle order, each with an `until` condition), `onEnter` (`once` for the arrival line), and when the room should
   feel alive, `scripts` (an NPC stroll, an ambient gag: `loop` + `wait`) and `events` (listeners of `{ emit }`). Export `checkpoints`
   with a ready state at the room's entrance and one after its puzzle.
3. Register the room in `game.ts` (`rooms`, `checkpoints`, map place if any).
4. Add new items to `items.ts`, new characters with `/new-character`.
5. `npm run validate` until clean; `npm run solve` must still finish.
6. Place: `npm run dev`, open `?edit=<room>` (or `npm run page:placement` for a phone), save, `npm run import-layout` if needed.
7. Screenshot `?dev&at=<checkpoint>` at 844×390 and look at it: nothing floating, nothing on furniture, readable scale.
8. Update the walkthrough test (`tests/<id>-walkthrough.test.ts`) with the new steps.
