# Working together day to day

Several people edit one game on a team Studio at the same time. This page is the daily routine: see who is where,
keep a room to yourself while you work on it, save without overwriting anyone, follow the others' changes, and undo
your own.

<a name="what-you-get"></a>

## What you get

Your changes land as revisions in your name, nobody's work is overwritten unseen, and you see the others' changes as
they land.

<a name="context-and-versions"></a>

## Context and versions

A hosted Studio (the Studio Server), from 4.2.3: the check of what each editor read (`x-studio-base`) arrived in
4.2.3, personal undo in 4.2.2, spans and the live stream in 4.2.1. Words such as *span* and *lease* are explained in
[Concepts](team.concepts.md).

<a name="prerequisites"></a>

## Prerequisites

- A member's account with the `dev` role (a reviewer reads, plays and comments; see [Roles and actions](team.roles.md)).
- You already logged in once (see [Starting as an invited dev](team.first-day.md)).

<a name="where-to-run"></a>

## Where to run the commands

In your browser, in the Studio at its public URL. Nothing runs on your machine.

<a name="steps"></a>

## Steps

<!-- step: see-who -->
1. **See who is here.** The header shows the revision you are at ("revision N", its dot green while the live stream
   is up), the game's health, and one avatar per member present, with where they are (a tab, a room). Presence is
   sent every 30 seconds and goes after 60 seconds without news.

<!-- step: hold-room -->
2. **Keep the room you work on.** Each room in the Rooms tab shows a chip: free, "held by you", or the holder's name.
   You do not have to do anything: **saving a file takes its span for you** for 120 seconds, renewed every 30 seconds
   while your Studio is open. To reserve a room before you start, open **Spans…** (your name in the header) and click
   **Take** on it. Every file belongs to one span: a room (its code and its layout), a language, the story, the items,
   the cast, the rules, the voices, the assets, the notes, the scenario map's groupings, the playtests, the Reality
   signals, the rest (`meta`).

<!-- step: edit-save -->
3. **Edit and save as usual.** Your save is one operation; the header moves to the new revision. If someone else holds
   that span, your save is refused with a 423 naming them, and your draft stays with you: see
   [Write refused: span locked (423)](team.write-refused-423.md).

<!-- step: what-you-read -->
4. **Saving checks what you read.** Each write carries the revision its editor read (`x-studio-base`; every read
   answers with its revision in `x-studio-revision`). If someone else wrote one of the same files since, the write is
   refused (409) with that file as you read it and as it is now. The writes you made since from the same tab never
   refuse it; those of your other tab, or of an agent of yours, do. The Studio shows what changed and keeps your draft:

   - for an edit the server makes on the file (a text, a value, a note, a voice), it offers **Apply my edit on the
     latest version**;
   - for a whole document (a room's layout, the storyboard, the map's groupings), it offers **Replace with my version
     (drops their change)**, and says so.

   Nothing is sent again unless you ask. See [Write refused: stale base revision (409)](team.write-refused-409.md).

<!-- step: follow-others -->
5. **Follow the others.** The Studio listens to `GET /api/events`: every revision with its author and files, who holds
   what, who is here, the previews and the health. Editors reload what others commit. The game view shows the preview
   of a revision; a label under it says when a newer one is ready (see
   [Recovering after a stale preview](team.recovery.md#stale-preview)).

<!-- step: undo -->
6. **Undo is yours.** Undo and Redo (Ctrl/Cmd+Z, with Shift to redo) take back **your own** last operation, whatever
   the others wrote meanwhile, as a new revision: history is never rewritten. Undo is refused when someone else wrote
   one of its files since (409), or holds its span (423, with their name). A new edit of yours drops your redo. Your
   stack is kept by the server: another tab, a restart, another instance see the same.

<!-- step: release -->
7. **Let go when you are done.** In **Spans…**, **Release** a span you hold, or simply close the Studio: your leases
   run out 120 seconds after it stops renewing them.

> [!LIMIT id=per-file]
> The 409 check is per file: two notes edited at once are one file (`notes.json`), so they refuse each other. The room
> view's placement is checked against what the Rooms tab read, while the view may still show an older preview for a
> moment. A script or an agent that sends no `x-studio-base` (the CLI's and the MCP's clients do not) is not checked
> this way: its writes are made on the file as it is, inside the span rules.

<a name="expected-result"></a>

## Expected result, and how to check it

Your save shows a new revision in the header. `GET /api/ops?after=<rev>` (or the history) lists your operation with
your name. The others see it at once on their screen.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| "The room *kitchen* is held by Léa" (423) | Someone holds that span | [423](team.write-refused-423.md) |
| "The file changed since you read it" (409) | Someone saved the same file after you opened it | [409](team.write-refused-409.md) |
| "Reconnecting… last revision seen: N" | The live stream was cut | [Recovery](team.recovery.md#disconnection) |
| "N changes not answered yet, sent again with the same id" | A write waits for an answer (a redeploy, a cut) | Wait: each applies once ([Recovery](team.recovery.md#writes-waiting)) |
| `undo is not available on this shared Studio` (409) | A shared Studio configured without personal undo | Not the case of a standard Studio Server; report it |

<a name="files-changed"></a>

## Files or data changed

Each save is one operation of the journal: the game's files at a new revision, in your name. Leases and presence live
in the database and in memory; they are not game files.

<a name="recovery"></a>

## Recovery or going back

Undo your own operation, or ask the author of another one to undo theirs. Going back further (a whole day) is a
restore from a backup: see [Backups](clever.backups.md).

<a name="references"></a>

## References

- [Concepts](team.concepts.md), [Roles and actions](team.roles.md).
- [Recovering after a lost lease, a disconnection or a stale preview](team.recovery.md).
- [Comments](team.comments.md), [Map and semantic diff](team.map-diff.md).
- [`src/studio/api.ts`](../../src/studio/api.ts) (what the Studio sends), [`src/studio/spans.ts`](../../src/studio/spans.ts).
