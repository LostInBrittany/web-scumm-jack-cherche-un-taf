# Notes

The Notes tab is the shared log of the game, `games/<id>/notes.json`: you, your teammates and any AI leave notes
there about a panel, a room, an entity or anything, and answer each other.

<a name="what-you-get"></a>

## What you get

A note the AI reads with `get_notes` (or by reading `notes.json`), its answer shown live in the Studio, and the whole
conversation kept with the game, in git.

<a name="context-and-versions"></a>

## Context and versions

The local Studio, engine repository or created project; the demo Studio keeps its notes in the browser (and its
patch). True from 4.2.1. A hosted Studio adds comments to the same tab ([Comments](team.comments.md)).

<a name="prerequisites"></a>

## Prerequisites

- The Studio running ([overview](studio.overview.md)).

<a name="where-to-run"></a>

## Where to run the commands

In the browser, on the Notes tab (and at the bottom of a room in the Rooms tab, under a panel in the Storyboard tab).

<a name="steps"></a>

## Steps

<!-- step: write -->
1. **Write a note** in the composer: **about** (a panel id, a room id, `room.entity`, or empty for a general note),
   **author** (defaults to `you`, and is remembered), the text. Ctrl/Cmd+Enter adds it. The note gets an id and the
   time (`at`, an ISO date); `notes.json` is created on the first note.

<!-- step: read -->
2. **Read the log.** The whole log, newest first, grouped by `about`: a room, a panel or an entity is tagged, with
   "Open in Rooms" or "Open in Storyboard". Filters: free text, about (rooms with their entities, panels, others),
   author. Each note shows its author and time.

<!-- step: answer -->
3. **Reply** pre-fills `about` with the note's; **Edit** changes a note in place (its text trimmed, `edited` set to
   now; its time, author and place in the log unchanged); **Delete** removes it.

<!-- step: elsewhere -->
4. **Notes where you work.** Notes about a room or one of its entities also appear at the bottom of that room's
   section in the Rooms tab ("Notes (n)", with a box to add one); notes about a panel appear under the panel in the
   Storyboard tab.

<a name="with-an-ai"></a>

### Working with an AI through notes

- An agent connected through MCP writes notes with `add_note`; its author is the MCP client's name, else `ai`. It reads
  them with `get_notes` ([Local MCP: setting up each client](studio.mcp-setup.md)).
- An AI without MCP edits the files; the Studio reloads (it watches the files), you see the result and answer in Notes
  or in the Storyboard, and the AI reads `notes.json` back. Git carries the history.
- Without an API key, the Assistant's **Send as a task to the AI agent** writes a note with `task: true`; the Notes tab
  tags it "task" ([The Assistant](studio.assistant.md#no-key-tasks)).

The log follows changes on disk: a note an AI writes shows up without a reload.

<a name="expected-result"></a>

## Expected result, and how to check it

The note shows at the top of the log, and `games/<id>/notes.json` holds it: `{ id, about, author, text, at, edited? }`.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `` `text` is required `` (400) | An empty note | Write something |
| `no such note: "<id>"` (404) | The note was deleted meanwhile (by you, a teammate, an AI) | Reload the log |

<a name="files-changed"></a>

## Files or data changed

`games/<id>/notes.json` only.

<a name="recovery"></a>

## Recovery or going back

The header's Undo does not cover notes; a deleted note comes back with git (`git checkout -- games/<id>/notes.json`).

<a name="references"></a>

## References

- [`src/studio/notes.ts`](../../src/studio/notes.ts); the operations `getNotes`, `addNote`, `editNote`, `deleteNote` of
  [`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts).
- The routes `GET/POST notes`, `PUT/DELETE notes/:id`: [Studio API](studio.api.md). Working with an AI in general:
  [Working with an AI](create.working-with-ai.md).
