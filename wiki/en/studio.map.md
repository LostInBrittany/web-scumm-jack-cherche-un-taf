# Map

The Map tab groups what the game already names into the scenario's chapters, puzzles and characters, shows where
each piece is written, and lists what no grouping names yet. It only refers to the content: it never changes it.

<a name="what-you-get"></a>

## What you get

A `games/<id>/groupings.json` that sorts rooms, rules, topics, items, characters, objectives and checkpoints into
chapters, puzzles and characters, and a map that says, for each reference, the `file:line` that writes it.

<a name="context-and-versions"></a>

## Context and versions

The local Studio and a hosted Studio (where a reviewer reads it without editing), from 4.2.3; not the demo Studio,
which says "The scenario map needs the dev server or a hosted Studio." On a team Studio the map and the semantic diff
work together: [Map and semantic diff](team.map-diff.md).

<a name="prerequisites"></a>

## Prerequisites

- The Studio running ([overview](studio.overview.md)).

<a name="where-to-run"></a>

## Where to run the commands

In the browser, on the Map tab.

<a name="steps"></a>

## Steps

<!-- step: new -->
1. **New grouping**: a **Title** and a **Kind**, chapter, puzzle or character.

<!-- step: refs -->
2. Add its references, each something the game already names:

   | Reference | Names |
   |---|---|
   | `<room id>` | A room |
   | `<rule or topic id>` | A rule or a talk topic |
   | `item:<id>` | An item |
   | `char:<id>` | A character |
   | `objective:<id>` | An objective |
   | `checkpoint:<id>` | A checkpoint |

<!-- step: save -->
3. **Save**. Each reference is then shown with the `file:line` that writes it, or "not declared" when the game does
   not know it. **Edit** changes a grouping, **Delete the grouping** removes it.

<!-- step: ungrouped -->
4. Read **Not in any grouping**: the rooms, characters, items, objectives and checkpoints no grouping names yet
   ("Everything is in a grouping." when none is left).

> [!GUARANTEE id=groupings-only]
> A grouping only refers: saving it writes `groupings.json` alone, never the content. Adding then deleting a grouping
> leaves every content file as it was.

> [!LIMIT id=not-declared]
> The map is derived at each read from the IR's provenance and the groupings, never stored. Ids written by code, and
> the ids of lines or steps, are not in the IR's provenance: they show as "not declared" even when the game uses them.

<a name="checks"></a>

### What a groupings file must be

Saving refuses a file that breaks one of these, and says each problem:

- `groupings` is a list of at most 500 groupings, and nothing else is in the file;
- a grouping's `id` is lowercase letters, digits and `-` (64 characters at most), unique;
- `kind` is `chapter`, `puzzle` or `character`;
- `title` is a text of 1 to 200 characters, without control characters;
- `refs` is a list of at most 500 references, each without spaces (200 characters at most), none named twice;
- no other field.

A `groupings.json` edited by hand is read as far as it can be: the readable groupings are mapped, the others are said.

<a name="expected-result"></a>

## Expected result, and how to check it

Each reference shows a `file:line`; `git diff` shows `games/<id>/groupings.json` changed and nothing else.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `groupings[n].id must be lowercase letters, digits and -` | A capital, a space or another sign in the id | Rename it |
| `groupings[n].refs[k] must be a reference without spaces` | A space in a reference | Use the id as the game writes it |
| A reference shows "not declared" | The game does not know it, or it is written by code | Check the id; a code-made id stays "not declared" |

<a name="files-changed"></a>

## Files or data changed

`games/<id>/groupings.json` only (on a hosted Studio, a span of its own).

<a name="recovery"></a>

## Recovery or going back

The header's Undo does not cover the groupings: use git (`git checkout -- games/<id>/groupings.json`) or delete the
grouping.

<a name="references"></a>

## References

- [`tools/studio/scenario-map.ts`](../../tools/studio/scenario-map.ts), [`src/studio/map-tab.ts`](../../src/studio/map-tab.ts).
- The routes `GET/PUT groupings` and `GET map`: [Studio API](studio.api.md). The world map of exits is a different
  thing: [World map](create.world-map.md).
