# Map and semantic diff

Two tools help a team see the game as a whole on a team Studio: the **Map** tab, where the team groups what the game
names into chapters, puzzles and characters, and **Changes between revisions** in the Check tab, which says what
changed between two revisions by the names the game uses, not line by line.

<a name="what-you-get"></a>

## What you get

- A shared map of the scenario: each chapter, puzzle or character with the rooms, items, rules and objectives it
  covers, where each is written (`file:line`), and what no grouping covers yet.
- For any two revisions (or two published builds), the list of what was added, removed or changed, file by file.

<a name="context-and-versions"></a>

## Context and versions

From 4.2.3, on a hosted Studio, and on the local Studio as well (the same routes; see [Map](studio.map.md) and
[Semantic diff](studio.semantic-diff.md) for the local side). The before/after captures of the rooms (4.4.0) are local
only.

<a name="prerequisites"></a>

## Prerequisites

- Any role reads the map and the diff; editing the groupings is a dev's (see [Roles and actions](team.roles.md)).

<a name="where-to-run"></a>

## Where to run the commands

In the Studio: the **Map** tab, and the **Check** tab's panel **Changes between revisions**. Or through the API.

<a name="steps"></a>

## Steps

<!-- step: open-map -->
1. **Open the Map tab.** Each grouping (`chapter`, `puzzle`, `character`) lists its references, each with the
   `file:line` that writes it, or **not declared** when the game does not know it (a typo, an id written by code,
   something removed). Below, what no grouping names yet, by kind: rooms, characters, items, objectives, checkpoints.

<!-- step: edit-grouping -->
2. **Add or edit a grouping** (a dev). Give it an id (lowercase letters, digits and `-`), a kind, a title (1 to 200
   characters) and its references: a room id, a rule or topic or listener id, `item:<id>`, `char:<id>`,
   `<room>.<entity>`, `objective:<id>`, `checkpoint:<id>`. Saving writes `groupings.json` only, in its own span
   (`groupings`): a grouping never changes what it names. It is a whole document, so if someone saved the groupings
   since you read them, the Studio offers to replace theirs with yours, and says so ([409](team.write-refused-409.md)).

<!-- step: compare -->
3. **Compare two revisions.** In **Check**, under **Changes between revisions**, type the two revision numbers (from,
   then to) and click **Show the changes**. For each file it lists the ids a source added, removed or changed (with
   the fields that changed), the values of a JSON that were added, removed or changed, or "file changed" when it
   cannot say more. "Nothing changed between them." when nothing did.

<!-- step: compare-builds -->
4. **Compare two builds.** A published build is a revision: compare the two builds' revisions (the Play tab's
   **Published builds** gives each build's revision).

Through the API:

| Route | Does |
|---|---|
| `GET /api/map` | the map, derived from the game and the groupings at each read, never stored |
| `GET /api/groupings`, `PUT /api/groupings` `{groupings: [{id, kind, title, refs}]}` | the groupings file (a dev writes) |
| `GET /api/diff/<from>..<to>` | `{from, to, files: [{path, change, ids?, values?, opaque?}], cut?}` |

<a name="limits"></a>

## Limits

> [!LIMIT id=diff-bounds]
> The diff covers 2,000 revisions and 500 files at most (`cut: true`, "… and more files (cut at 500)"); `to` must not
> be past the head (404). The game's `private/` folder is left out, since a reviewer reads the diff. A file larger than
> 1 MiB, or not text, is "file changed". On a hosted Studio the before/after captures of the rooms (4.4.0) are not
> available (501, "a hosted Studio has no browser to draw them"): run the same diff on a local Studio.

> [!LIMIT id=map-bounds]
> 500 groupings at most, 500 references each. A grouping's title refuses control characters and bidirectional
> overrides. The map is the team's declaration: it proves nothing about the game, and a reference "not declared" is
> said, never guessed.

<a name="expected-result"></a>

## Expected result, and how to check it

The Map tab shows your grouping for everyone at once; `GET /api/map` returns it with its references resolved. The diff
lists the files your revisions wrote.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `two revisions, as numbers` | A field empty or not a number | Type two revision numbers |
| `from and to are revisions, from ≤ to` (400) | The order is reversed | Put the older first |
| `2,000 revisions at most between from and to` (400) | Too wide a range | Split it |
| `no revision <n> yet` (404) | Past the head | Use the header's revision |
| A reference shows **not declared** | A typo, a removed id, or an id made by code the game does not declare | Fix the reference, or the game |
| "groupings.json holds entries the Studio cannot read" | The file was edited by hand with entries it refuses | Saving keeps only the readable ones; fix the file otherwise |

<a name="files-changed"></a>

## Files or data changed

Only `groupings.json` (span `groupings`), as one operation. The diff and the map write nothing.

<a name="recovery"></a>

## Recovery or going back

Undo your groupings save like any operation of yours (see [Working together](team.day-to-day.md#steps)).

<a name="references"></a>

## References

- [`tools/studio/scenario-map.ts`](../../tools/studio/scenario-map.ts), [`tools/studio/semantic-diff.ts`](../../tools/studio/semantic-diff.ts).
- [`src/studio/map-tab.ts`](../../src/studio/map-tab.ts), [`src/studio/diff-panel.ts`](../../src/studio/diff-panel.ts).
