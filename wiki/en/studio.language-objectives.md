# Language and objectives

The Language tab shows the game as the tools see it: its objectives first, editable through forms generated from
their schema, then its IR, the game's logic as data with the `file:line` that writes each piece.

<a name="what-you-get"></a>

## What you get

An objective added or changed in the game file from a form, previewed as a diff, validated before it is written; and
the place in the code of every room, rule, topic, listener and script.

<a name="context-and-versions"></a>

## Context and versions

The local Studio, engine repository or created project. True from 4.2.1 (the write is judged before it is written).
What objectives are and how a game uses them: [Chapters and objectives](create.chapters.md).

<a name="prerequisites"></a>

## Prerequisites

- The Studio running ([overview](studio.overview.md)).
- A game file with `defineGame({...})`; a folder without one answers `no defineGame({...}) in the game folder` (404).

<a name="where-to-run"></a>

## Where to run the commands

In the browser, on the Language tab. `npm run ir` runs in the engine repository.

<a name="steps"></a>

## Steps

<!-- step: read-objectives -->
1. **Read the objectives.** Each with its id, title, condition (`done`), parent, whether it is optional, and the
   `file:line` that writes it.

<!-- step: edit -->
2. **Edit** an objective, or **+ objective**. The form is generated from the objective's schema
   ([`src/studio/forms-gen.ts`](../../src/studio/forms-gen.ts)): each field with its description, the parent's id with
   the game's objectives as suggestions, the condition with the DSL's editor. A problem is named by file, id and field
   before anything is sent.

<!-- step: preview -->
3. **Preview the change** shows the diff of the game file. **Apply** writes it: the server validates the game as it
   would be, and refuses the write when it adds an error, so an objective whose `done` can never hold is refused. The
   validator's errors are shown after. The header's Undo takes an applied change back
   ([Preview, apply, undo](studio.preview-apply.md)).

<!-- step: ir -->
4. **Read the IR.** Under the objectives: the rooms, entities, rules, topics, listeners and scripts, each with where it
   is written, and the whole IR as JSON. The same JSON comes from the command line:

   ```sh
   # in the engine repository
   npm run ir -- --json
   ```

> [!LIMIT id=game-file-objectives-only]
> Through the Studio (and the `set_value` tool on `@game`), only the game file's objectives can be written:
> `objectives`, `objectives.<id>` or one of its fields. Any other path of `defineGame({...})` is refused (400).

<a name="expected-result"></a>

## Expected result, and how to check it

The objective appears in the list with its new `file:line`; `git diff` shows the change in the game file; the Check
tab still validates and solves.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| A field is named in red before sending | The form's own check (file, id, field) | Fix that field |
| `refused: the edit adds N validation error(s): …` (422) | The objective breaks the game (a `done` that can never hold, an unknown parent) | Read the errors and change the objective |
| 400 on a path other than `objectives` | Only objectives are written in the game file | Edit other fields in code |

<a name="files-changed"></a>

## Files or data changed

The game file that holds `defineGame({...})` (`games/<id>/game.ts` or where the game defines it).

<a name="recovery"></a>

## Recovery or going back

The header's Undo, during the session; otherwise git.

<a name="references"></a>

## References

- [`src/studio/ir-tab.ts`](../../src/studio/ir-tab.ts), [`src/studio/forms-gen.ts`](../../src/studio/forms-gen.ts), [`tools/ir.ts`](../../tools/ir.ts).
- [File formats](engine.file-formats.md), [DSL reference](create.dsl.md).
