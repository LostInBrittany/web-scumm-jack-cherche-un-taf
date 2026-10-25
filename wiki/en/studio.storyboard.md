# Storyboard

The Storyboard tab edits `storyboard.json`, the script of the game, board by board and panel by panel, shows each
panel the way the game would stage it, and says what of it the game already does.

<a name="what-you-get"></a>

## What you get

A `games/<id>/storyboard.json` written by the Studio, each panel previewed as a frame, a coverage badge on every board
and panel, and, if you want, a `storyboard.md` to read or share.

<a name="context-and-versions"></a>

## Context and versions

The local Studio, in the engine repository or a created project; the demo Studio too (its edits stay in the browser).
True from 4.2.1. Why the storyboard is the source of truth, and how it relates to the content:
[The storyboard, source of truth](create.storyboard.md).

<a name="prerequisites"></a>

## Prerequisites

- The Studio running ([overview](studio.overview.md)).
- No `storyboard.json` yet is fine: the tab starts from `{ boards: [] }`. The schema is
  [`tools/pages/storyboard-schema.md`](../../tools/pages/storyboard-schema.md).

<a name="where-to-run"></a>

## Where to run the commands

In the browser, on the Studio's Storyboard tab. The optional command line export runs in the engine repository.

<a name="steps"></a>

## Steps

<!-- step: boards -->
1. **Boards.** On the left, the boards (title, room, goal), with move up, move down, add and delete.

<!-- step: board -->
2. **The selected board**, in the middle: title, id, room ("Open in Rooms" switches to that room), goal, exit, its
   **arrival** lines, then its **panels** as cards in play order. A panel has a title, an id, the player **action**
   that triggers it, and **lines** with a speaker chooser (the game's characters, `hero`, `action`, `stage`) and
   **sfx** chips taken from the game's `audio.sfx`. Per line: move, delete, "+ line". Per card: move, duplicate,
   delete. Then the board's **hints** (ordered), the **talk topics** per character (topic and lines) and the optional
   **reactions** (action and lines).

<!-- step: preview -->
3. **The frame**, on the right: the selected panel composed like a storyboard frame, with the room's decor, the
   portraits of the panel's speakers (the one speaking highlighted), the current line in the game's speech style (the
   speaker's colour; step through the lines, or click one in the script below), the action as the game's sentence bar,
   and the sfx. Under it, the notes about this panel (`about` = the panel id) and a box to add one
   ([Notes](studio.notes.md)).

<!-- step: save -->
4. **Save.** Every edit stays in memory until **Save** (or Ctrl/Cmd+S while the tab is shown) writes the whole
   document. "● Unsaved changes" shows until then, and leaving the page asks first. Save refuses duplicate or empty
   panel ids, because notes hang on them. An unchanged storyboard is not rewritten; a changed one is written compactly
   (what fits on 120 columns stays on one line).

<!-- step: coverage -->
5. **Read the coverage.** After every load and save, the saved storyboard is checked against the content
   ([`src/engine/tools/coverage.ts`](../../src/engine/tools/coverage.ts)): a badge on each board and panel, **✓**
   everything is in the game, **~** partly, **✗** something is missing, **?** prose. Under a panel, the list of what
   is not there yet: an action no rule answers, a line the game does not say, a sound not in `audio.sfx`. The bar shows
   the overall score. The same check is in the Check tab ("Storyboard coverage") and is the `storyboard_coverage` MCP
   tool.

<!-- step: export -->
6. **Export Markdown** writes `games/<id>/storyboard.md` from the saved file; it offers to save first. The same text
   comes from the command line:

   ```sh
   # in the engine repository
   npm run page:storyboard -- --md
   ```

> [!LIMIT id=whole-document-save]
> Save writes the whole document. When `storyboard.json` changes on disk (an AI, an editor, git), a banner offers to
> reload; with unsaved edits, it warns that saving would overwrite that change. Reload first if you want to keep it.

<a name="expected-result"></a>

## Expected result, and how to check it

"● Unsaved changes" disappears after Save; `git diff games/<id>/storyboard.json` shows your change; the badges turn
✓ as the content catches up with the script.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| Save refused: a panel id is empty or used twice | Notes hang on panel ids | Give each panel a unique id |
| A banner says the file changed on disk | An AI, an editor or git wrote it | Reload, or save knowingly over it |
| Export Markdown answers 404 | No `storyboard.json` saved yet | Save first |
| ✗ under a panel | The game does not do it yet | Write the rule, line or sound it names |

<a name="files-changed"></a>

## Files or data changed

`games/<id>/storyboard.json`; `games/<id>/storyboard.md` on export; `games/<id>/notes.json` for panel notes.

<a name="recovery"></a>

## Recovery or going back

The header's Undo does not cover the storyboard (nor the notes): a Save is a journal operation, but not an undoable
one. Go back with git: `git checkout -- games/<id>/storyboard.json`.

<a name="references"></a>

## References

- [`src/studio/storyboard.ts`](../../src/studio/storyboard.ts), [`src/studio/storyboard-model.ts`](../../src/studio/storyboard-model.ts),
  [`tools/pages/storyboard-data.ts`](../../tools/pages/storyboard-data.ts) (schema, normalisation and Markdown export,
  shared by the page generator, the core and the UI).
- [The storyboard, source of truth](create.storyboard.md), [Check](studio.check.md).
