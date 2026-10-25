# Voices and the heroes × languages matrix

The Voices tab holds the voice recording table, per language, and its second view, **Heroes × languages**: every line
that depends on the hero, the text each hero reads in each language and the clip that plays, with what is missing.

<a name="what-you-get"></a>

## What you get

A recording table the actors can work from (CSV out, CSV back in), and a matrix that shows at a glance which hero
lacks a translation, a clip, or a choice the source language makes.

<a name="context-and-versions"></a>

## Context and versions

The local Studio, engine repository or created project. The matrix is from 4.4.0, read-only, and works on every
backend: the dev server, a hosted Studio and the demo Studio. The recording table needs the dev server. How voices
and hero choice are written in the game: [Voices: per language and per hero](create.voices.md),
[Heroes: several characters and hero choice](create.heroes.md).

<a name="prerequisites"></a>

## Prerequisites

- The Studio running ([overview](studio.overview.md)).
- Lines with stable ids ([Voices](create.voices.md)); the matrix lists only lines with an id that depend on the hero.

<a name="where-to-run"></a>

## Where to run the commands

In the browser, on the Voices tab. `npm run voices` runs in the engine repository.

<a name="steps"></a>

## Steps

<a name="recording-table"></a>

### The recording table

<!-- step: table -->
1. Open the Voices tab, view **Recording table**, and pick the **Language**. Each line with a stable id is a row: who
   says it, its text in that language, its clip, and its status (draft, record, recorded, approved), with the actor
   and a note. A change is saved at once, into `games/<id>/voices.json`, and is undoable. "Find a line…" filters the
   rows; **Status** filters by status.

<!-- step: csv -->
2. **Export CSV** hands the table to the actors. Bring theirs back from the command line:

   ```sh
   # in the engine repository
   npm run voices -- import <file>
   ```

> [!LIMIT id=table-dev-server]
> The recording table needs the dev server (`npm run studio`): elsewhere the tab says "The voice table needs the dev
> server (npm run studio)." The matrix still works there.

<a name="matrix"></a>

### Heroes × languages

<!-- step: matrix -->
3. Switch the view to **Heroes × languages**. A row per line with an id that depends on the hero (a text switch or
   `{hero}`, in any language). A column per hero, that is per combination of the values the switched flags take,
   headed by the variant's portrait and name, and per language. Each cell: the text that hero reads and the clip that
   plays, or the clip that is missing (the plain id is named when it plays instead).

<!-- step: problems -->
4. **Show** "lines with a problem" keeps the rows that flag one:
   - **untranslated**: a language has no text for the line;
   - **agreement**: a translation drops a choice the source makes (a switch the source has, the translation lacks);
   - **unlisted**: a value of a flag that no switch lists, without a `*=` default;
   - a clip that is missing for a hero.

   **Language** narrows to one language; "Find a line…" searches. The bar counts the lines, those with a problem,
   the heroes and the languages.

> [!LIMIT id=matrix-bounds]
> The matrix shows 24 hero combinations at most; the bar says how many more were left out. The table shows 200 rows
> at most: "N more: narrow the search."

<a name="expected-result"></a>

## Expected result, and how to check it

With "lines with a problem", an empty matrix: every hero has every line in every language, and a clip where one is
expected. `npm run voices -- check` agrees on the command line.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| "The hero matrix is not available on this backend." | A backend without the route | Use the dev server, a hosted Studio or a recent demo |
| A cell names a plain id | The hero's clip is missing; the plain line's clip plays instead | Record the clip for that hero |
| A row is flagged `agreement` | The translation lost a switch | Put the switch back in the translation |

<a name="files-changed"></a>

## Files or data changed

`games/<id>/voices.json` (the recording table). The matrix writes nothing.

<a name="recovery"></a>

## Recovery or going back

A status, actor or note change is undoable from the header during the session; otherwise git.

<a name="references"></a>

## References

- [`src/studio/voices.ts`](../../src/studio/voices.ts), [`src/studio/hero-matrix.ts`](../../src/studio/hero-matrix.ts),
  [`src/engine/tools/hero-matrix.ts`](../../src/engine/tools/hero-matrix.ts), [`tools/voices.ts`](../../tools/voices.ts).
- The routes `GET voices[/:lang]`, `PUT voices/:lang/:id`, `GET voices/:lang/csv` and `GET hero-matrix`
  (`{ langs, flags, columns, rows, truncated? }`): [Studio API](studio.api.md).
