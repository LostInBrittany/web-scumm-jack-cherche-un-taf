<!--
Template: how-to (a procedure), docs/dev/PLAN-4.5-WIKI.md Annex B. Copy it to wiki/en/<id>.md, its French twin to
wiki/fr/<id>.md, and keep the ten headings and their section ids. The header (type, audience, context, versions,
language switch) and the footer are generated from the manifest: do not write them. Link another page by its source,
`create.rooms.md#walkable-zones`; link the code by its path from the repository root, `src/engine/core/save.ts`.
Every command block says first the folder and the context it runs in.
A section true for fewer versions than its page says so in an HTML comment on the line right after its anchor, as
"Recovery" below: `applies: 4.2.2..` (from), `applies: 4.2.2..4.4.0` (both inclusive) or `applies: ..4.4.0`, with
`since 4.2.0` after the range for the version the feature appeared in; it stays inside the page's versions, the same
in both languages. A `[!GUARANTEE id]` has its claim in the manifest, `{"id", "test": "file.test.ts › its name"}`.
A review is recorded with who made it: `npm run wiki -- review-claim <id> --by <name> --kind human|ai --relation
author|independent` (and `translations --ack` alike); a published page needs a person's review, and an AI's check of
what it wrote is not one.
A `[!MEASURE id]` gives five `- key: value` lines, the same keys in both languages: date, version, volume, conditions,
source (a GitHub link at a full 40-character commit, `blob/<sha>/…`). A fenced block tagged `room-example` (a room's
JSON, or `{"room", "layout", "items", "characters", "verbs", "hero"}` when it needs its geometry, its items, its
actors, the game's own verbs or another hero) or `studio-config` (a Studio Server configuration) is run through the
real validator by `wiki -- check`. Delete these comments.
-->

# Restore the Studio on a fresh installation

<a name="what-you-get"></a>

## What you get

One or two sentences: the state you are in at the end.

<a name="context-and-versions"></a>

## Context and versions

Where this applies (engine repository, created project, local or hosted Studio, Bridge) and from which version: the
manifest's `versions.appliesFrom`.

<a name="prerequisites"></a>

## Prerequisites

- What must be installed or done before, each with its page.

<a name="where-to-run"></a>

## Where to run the commands

The folder and the machine: "in the engine repository, on your machine", "in the created project", "on the Clever
Cloud app, through `clever ssh`".

<a name="steps"></a>

## Steps

<!-- step: first-step -->
1. The first essential step, with its exact command.

   ```sh
   # in the created project
   npm run validate
   ```

<!-- step: second-step -->
2. The next one. Each essential step keeps its `step` id, the same in both languages.

> [!LIMIT id=example-limit]
> What this procedure does not cover, said plainly.

> [!GUARANTEE id=example-guarantee]
> What the product guarantees here, and the test that shows it (named in the manifest).

> [!MEASURE id=example-measure]
> A figure, and what it was measured on: an observation, never a promise.
> - date: 2026-10-19
> - version: 4.2.3
> - volume: 508 journal lines
> - conditions: the smallest plans, the maintainer's test organisation
> - source: [QUALIF-4.2.3-REFERENCE.md §4](https://github.com/Quest-n-Click/quest-n-click/blob/c00b44fcffe56ffa99f9d2228297414ebe3145ac/docs/dev/QUALIF-4.2.3-REFERENCE.md)

<a name="expected-result"></a>

## Expected result, and how to check it

What you see when it worked, and the command or screen that shows it.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| The exact message | Why | What to do |

<a name="files-changed"></a>

## Files or data changed

What the procedure writes, so you know what to back up or review.

<a name="recovery"></a>
<!-- applies: 4.2.2.. -->

## Recovery or going back

How to undo it, when it can be undone; and say so when it cannot.

<a name="references"></a>

## References

- The reference pages, ADRs and source files this procedure rests on.
