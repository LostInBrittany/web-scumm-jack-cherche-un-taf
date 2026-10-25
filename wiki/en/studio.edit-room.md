# Edit a room

The Rooms tab edits a room's texts, reactions, talk topics and stage without opening its TypeScript file, and writes
the change back into that file as readable code.

<a name="what-you-get"></a>

## What you get

A room changed from the Studio: a look line added, a reaction edited through a form, a prop added and placed. Each
change is in `rooms/<room>.ts` (or `layout/<room>.json`) as if you had typed it, validated, and undoable.

<a name="context-and-versions"></a>

## Context and versions

The local Studio (`npm run studio`), in the engine repository or a created project. True from 4.2.1, when every
Studio write became one operation of the game's journal, judged before it is written. The hosted Studio uses the same
tab, with leases and roles on top ([Working together day to day](team.day-to-day.md)).

<a name="prerequisites"></a>

## Prerequisites

- The Studio running: [The local Studio: overview and launch](studio.overview.md).
- A room declared in the game (`index.ts` / `game.ts`); a room the game does not list answers
  `room "<id>" is not in the game (index.ts / game.ts)`.

<a name="where-to-run"></a>

## Where to run the commands

In the browser, on the Studio page (`http://localhost:5173/__studio/#rooms/<room>`). The only command is the one that
starts the Studio, in the engine repository or the created project.

<a name="steps"></a>

## Steps

<!-- step: select -->
1. **Select something.** Pick the room in the Rooms tab. The room is drawn by the engine with the placement editor on
   top; the list on the right holds its props, actors and hotspots. Selecting one, in the list or in the view, opens
   its sheet: name, kind, states, visibility, **look lines**, **reactions** (verb, targets, condition, and the commands
   as a list of lines: texts editable, other commands shown), and **talk topics**, as a list or as a **tree** (topics,
   lines, choices and their options, branches, each with its condition; tapping a node jumps to its editor). Under the
   view: the room's name, **hints**, **on enter** lines, the room's **scripts** and **events** (structure read-only,
   texts editable).

<!-- step: edit-text -->
2. **Edit a text.** Change a field, then leave it (or press Enter): the text is saved. Escape cancels. Each save shows
   a toast and runs Check in the background ([Check](studio.check.md)). A placement in progress in the view is saved
   first; the view reloads when the room file changes. The text is written into `rooms/<room>.ts` in place: the string
   literal is replaced through the TypeScript parser, with the same quote style, and the file stays readable code.
   Look lines can be added, edited and deleted from the sheet.

<!-- step: add-entity -->
3. **Add a prop, a hotspot or an actor.** "Add prop / hotspot / actor" creates the entry in the room file (the section
   is created if absent) and gives it a place in the layout: a prop has its foot at the point given and a height of
   60; a hotspot is a 60 × 60 box centred on it; an actor has its feet there. A prop or a hotspot needs a name. The id
   is letters, digits and `_`, not starting with a digit; an id the room already has is refused (409). The room file
   and its layout are written as one operation, undone in one step. Then drag it where it belongs
   ([Placement and stage](studio.placement.md)).

<!-- step: structured -->
4. **Edit a reaction or the stage through a form** (below, "Structured editing"): **Edit…** on a reaction,
   **+ Reaction** at the end of the list, **Stage…** and the **painter** on the room sheet. Each form shows the diff
   before it writes ([Preview, apply, undo](studio.preview-apply.md)).

<!-- step: timeline -->
5. **Check the timing of a script.** Next to every cutscene, arrival script and world script, the **Timeline** toggle
   draws how long each command takes and what overlaps: lines, walks, animations, parallel branches, the player's
   turns in red. Tap a bar to jump to its line; double-click a bar to change a wait's, an animation's or a motion's
   duration.

<a name="structured-editing"></a>

### Structured editing

- **Forms instead of code.** Each reaction has **Edit…** (verb, targets, condition, commands as a form), and the list
  ends with **+ Reaction**. The room sheet has **Stage…** (layers with their image, role and condition; lights;
  particle emitters; the transition; the logic of walk links) and the **painter** (the game's, DOM or canvas). The
  forms come from one table of every condition and command, [`src/studio/schema.ts`](../../src/studio/schema.ts),
  checked against the engine's types at compile time: a new command without a form does not compile. What has no
  simple field (a minigame's parameters, an animation's frame events) is a JSON box.
- **Layers, masks, zones.** Under the room sheet, the stage editor ([`src/studio/rooms-stage.ts`](../../src/studio/rooms-stage.ts))
  draws the backdrop with the occlusion masks (red), the walk zones (green) and the links between zones; the
  geometry itself is described in [Placement and stage](studio.placement.md#stage-editor).
- **Preview, then apply.** "Preview the change" shows the diff the server would write, without writing; "Apply"
  writes it as code in the file's style, then the game is validated: an edit that adds a validation error is refused
  and nothing is written ([Preview, apply, undo](studio.preview-apply.md)).
- **Undo / Redo** in the header (Ctrl/Cmd+Z, with Shift to redo), over every write of the session: texts, values,
  layouts, voices.
- **Play.** The Play tab shows the painter of every room (DOM or canvas, as the game says) and how fast it draws
  (frames per second, the canvas painter's repaints).

<a name="text-switches"></a>
<!-- applies: 4.3.0.. -->

### Texts that switch on the hero

For a game whose texts hold switches (`{form?m=…|f=…}`, `{hero}`), the Rooms tab keeps the raw braces in its text
editor. Under a text holding a switch, a read-only line shows the text as a player reads it with the values picked in
the Play tab's **Text switches** (`(form=?)` while none is picked). See
[Play and replay a session](studio.sessions.md#text-switches) and [Heroes: several characters and hero choice](create.heroes.md).

<a name="room-notes"></a>

### Notes about the room

Notes about the room or one of its entities appear at the bottom of the room's section ("Notes (n)"), with a box to
add one ([Notes](studio.notes.md)).

> [!LIMIT id=texts-only-literals]
> Only string literals the Studio recognises as texts are edited this way: names, look lines, lines of `say`,
> topics, hints, toasts, choices, hero lines in command lists. Ids, image references, flags and conditions are never
> texts, and the API refuses to edit them; a text the room builds with code (a shared constant, a helper) is not
> reachable. The full rule is in [Studio API](studio.api.md#texts).

<a name="expected-result"></a>

## Expected result, and how to check it

The toast says the text was saved; the engine view shows the change; `git diff games/<id>/rooms/<room>.ts` shows a
one-line change in the file's own style. The Check tab's badge shows whether the game still validates.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `refused: the edit adds N validation error(s): …` (422) | The change would break the game; nothing was written | Read the errors, change the value, apply again |
| `"<id>" already exists in room "<room>"` (409) | The id is taken in that room | Pick another id |
| `` `name` is required for a prop or a hotspot `` | Add prop or hotspot without a name | Give a name |
| `cannot undo "<what>": <file> changed since` (409) | The file was edited outside the Studio after that write | Undo by hand, or with git |

More: [Studio troubleshooting](studio.troubleshooting.md).

<a name="files-changed"></a>

## Files or data changed

- `games/<id>/rooms/<room>.ts` (texts, reactions, stage, painter, added entities).
- `games/<id>/layout/<room>.json` (an added entity's place).
- The journal of the game under `.cache/studio-journal/` (the operations, for undo).

<a name="recovery"></a>

## Recovery or going back

Undo in the header takes back the last write of the session, Redo puts it back. An undo refuses when the file was
changed since by someone else (an AI, an editor, git): then use `git diff` and `git checkout -- <file>`.

<a name="references"></a>

## References

- [`src/studio/rooms.ts`](../../src/studio/rooms.ts), [`src/studio/rooms-sheet.ts`](../../src/studio/rooms-sheet.ts),
  [`src/studio/structured.ts`](../../src/studio/structured.ts), [`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts).
- `npm run e2e:studio -- <studio url>` (a CI gate) creates a stage with the form, checks the diff, applies it, sees
  it in the game and undoes it ([`scripts/e2e-studio.mjs`](../../scripts/e2e-studio.mjs)).
- [Rooms](create.rooms.md), [Reactions](create.reactions.md), [Dialogues](create.dialogues.md).
