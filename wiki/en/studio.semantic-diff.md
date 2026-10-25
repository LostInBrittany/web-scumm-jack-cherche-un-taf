# Semantic diff

"Changes between revisions", in the Check tab, says what changed between two revisions of the game by what the game
names: the rules, rooms, lines and values added, removed or changed, file by file, rather than a text diff.

<a name="what-you-get"></a>

## What you get

For two revision numbers, the list of the files the Studio's operations between them changed, and in each one the ids
added, removed and changed (with the fields that changed), or the JSON value paths, or "file changed" when it cannot
say more.

<a name="context-and-versions"></a>

## Context and versions

The local Studio (`npm run studio`) and a hosted Studio; not the demo Studio (it has no journal). From 4.2.3. On a
hosted Studio a build is a revision: compare two builds by theirs ([Map and semantic diff](team.map-diff.md)).

<a name="prerequisites"></a>

## Prerequisites

- The Studio running ([overview](studio.overview.md)), with writes made through it (or through the MCP server, which
  shares the journal).

<a name="where-to-run"></a>

## Where to run the commands

In the browser, on the Check tab, panel **Changes between revisions**.

<a name="revisions"></a>

## What a revision is here

Every write to the game is one operation of its journal (`.cache/studio-journal/`), numbered: that number is the
revision. A Studio write, an MCP write and an undo each make one; a change made outside (an editor, git) is recorded
as an operation of its own before the next write touches that file. Revision 0 is before the first operation.

> [!LIMIT id=local-revision-numbers]
> The local Studio does not display the current revision number. Asking for a revision past the last one answers
> `no revision <n> yet` (404): lower the number until it answers.

<a name="steps"></a>

## Steps

<!-- step: numbers -->
1. Type two revisions, **From** and **to** (whole numbers, from ≤ to; at most 2,000 apart).

<!-- step: show -->
2. **Show the changes.** For each file the operations between them wrote, compared at both ends (its content before
   the first of those operations, after the last):
   - a source: the ids it **added**, **removed** and **changed**, each changed id with the fields that changed (or
     "its place" when only its position moved);
   - a JSON file: the value paths added, removed and changed;
   - anything else, or a content it cannot read: "file changed";
   - a file written back to what it was: no change.

<!-- step: captures -->
3. To see the rooms those changes name, drawn at both revisions: [Before and after captures](studio.captures.md).

<a name="expected-result"></a>

## Expected result, and how to check it

A list of files with what they gained and lost, or "Nothing changed between them." A list past 500 entries ends
with "… and more (cut at 500)"; past 500 files, "… and more files (cut at 500)".

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `two revisions, as numbers` | A field is empty or not a whole number | Type two numbers |
| `from and to are revisions, from ≤ to` | From is after to | Swap them |
| `2,000 revisions at most between from and to` | The range is too wide | Narrow it |
| `no revision <n> yet` (404) | The journal has not reached that number | Lower it |
| "file changed" for a source you know | Content the local journal did not keep (a file adopted from outside) | Compare with `git diff` |

<a name="files-changed"></a>

## Files or data changed

None: the diff only reads the journal. The game's `private/` folder is left out of it.

<a name="references"></a>

## References

- [`tools/studio/semantic-diff.ts`](../../tools/studio/semantic-diff.ts), [`src/studio/diff-panel.ts`](../../src/studio/diff-panel.ts),
  the `diff` operation of [`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts).
- The route `GET diff/<from>..<to>`: [Studio API](studio.api.md).
