# The storyboard, source of truth

`storyboard.json` holds the script of a game: one board per room, one panel per beat, who says what, the player action
that triggers each beat, the sounds, and the hints. The method says the storyboard is the source of truth for every
text, and the rooms are written from it. The engine, though, never reads it. This page explains what that choice
gives, where the storyboard and the game can drift apart, and how to keep them in step.

<a name="story-first"></a>

## Story first, as data

Write the story as a **storyboard** before any room file: boards (one per room), panels (one per beat), lines (who says
what), the player action that triggers each beat, the sounds, and the hints the helper voice gives when the player is
stuck. The file is `games/<id>/storyboard.json` in the engine repository, `game/storyboard.json` in a created project.
The code is derived from the storyboard, never the other way round.

Before writing, answer the four questions of [Story first](create.puzzle-design.md#story-first) (premise, want,
obstacle per room, ending) and read [Puzzle design](create.puzzle-design.md): what makes a good room, puzzle, hint chain
and fallback in this engine. In the engine repository, Claude Code has a `/storyboard` skill (`.claude/skills/`) that
writes the file with you; it is not shipped to a created project.

<a name="why"></a>

## Why a storyboard, and why it is the source of truth

- **The story can be judged before it is built.** A storyboard is short, readable and reviewable on a phone
  ([Review pages](create.review-pages.md#validate-the-storyboard)). Changing a panel costs a sentence; changing a room
  costs code, layout, art and proofs.
- **Every text has one home.** Lines, topics and hints are written once, in the order the player meets them. The rooms
  copy them; a writer or a translator reads them in one place.
- **An assistant works better from it.** `npm run page:storyboard -- --md` (or the Studio's **Export Markdown**) writes
  `storyboard.md`, plain text that sub-agents read before writing a room; the MCP tools `get_storyboard` and
  `set_storyboard` read and write the JSON.

<a name="divergence"></a>

## Where the storyboard and the game drift apart

The game runs from the rooms (`rooms/*.ts`, `cast.ts`, `rules.ts`…), not from `storyboard.json`. Nothing copies a line
from one to the other automatically. So they can differ, in three ways:

1. **The rooms changed, the storyboard did not.** A line rewritten in the Studio's Rooms tab (it edits the string in
   the room file) or by hand stays old in the storyboard.
2. **The storyboard changed, the rooms did not.** A panel added after the room was written is not in the game until
   someone writes it.
3. **Two editors of the same file.** In the local Studio, the Storyboard tab keeps every edit in memory until **Save**,
   which writes the whole document. When `storyboard.json` changes on disk meanwhile (an AI, an editor, git), a banner
   offers to reload; with unsaved edits it warns that saving would overwrite that change. On a hosted Studio the
   storyboard belongs to the span `story` ("story and storyboard"): a member editing it holds its lease, and another
   member's save is refused with a 423 ([span locked](team.write-refused-423.md)), or with a 409 when the file changed
   since they read it ([stale base](team.write-refused-409.md)).

**Coverage** measures the first two. It checks the saved storyboard against the content: each board's room, each
speaker, line, topic, sound and panel action is `ok` (found), `partial` (the pieces exist but not the whole: the
entities but no rule, a close line, a character not in that room), `missing` (the game has nothing of it) or
`unknown` (prose the checker cannot read). The same check feeds the Studio's badges on each board and panel ("✓
everything is in the game", "~" partly, "✗" missing), the **Storyboard coverage** panel of the Check tab, the MCP tool
`storyboard_coverage`, and `npm run page:storyboard`.

> [!GUARANTEE id=storyboard-coverage-reports-missing]
> A panel whose room, speaker, line or sound the game lacks is reported missing, not marked as in the game.

> [!LIMIT id=coverage-is-textual]
> Coverage compares text and ids; it does not play the game. A panel's action is matched against the rules as prose
> ("Open Grandpa's armchair"), so a free wording can stay `unknown`. A line the game has but reworded beyond
> "close" is `missing`. Coverage says what to look at; the solver and the playtests say whether the game works.

<a name="write-it"></a>

## Write it as the storyboard

The schema is [`tools/pages/storyboard-schema.md`](../../tools/pages/storyboard-schema.md). The habits that make it
useful:

- **One board per room**, in play order, with its `goal`. The sample game has `opening`, `house`, `garden`, `market`,
  `finale`.
- **One panel per beat.** A beat is something that changes: an item gained, a door opened, a revelation.
- **Each panel names the player `action`** that triggers it: `garden-1` "Pick up pipe", `garden-3` "Use pipe with water
  tank → minigame pipes", `garden-5` "Look at sock". If you cannot write the action, the beat is not a puzzle yet.
- **`talks`, `reactions` and `hints`** sit on the board. Reactions are the optional gags; hints go from vague to
  precise.
- A line is `{ "who", "text" }`: `who` is a character id, `"hero"` (whoever the hero is), `"action"` (a player action)
  or `"stage"` (a stage direction); an unknown id is shown as is, in grey, while the character does not exist yet.
- Panel ids are unique across the storyboard: notes hang on them. Keep ids to letters, digits and `_ - . ~ : @ +`.

A storyboard that is not valid (a board without an `id`, panels that are not a list, a line of the wrong kind) is
refused with the same sentences by the page generator, the Studio's server, its in-browser demo and `set_storyboard`.
The Studio's Save also refuses duplicate or empty panel ids.

<a name="steps"></a>

## Keep the storyboard and the game in step

In the engine repository (`games/<id>/`) or the created project (`game/`), on your machine.

<!-- step: write-storyboard -->
1. **Write or change the storyboard first**: by hand, in the Studio's Storyboard tab, or with an assistant
   (`set_storyboard`). Review it on a page until the author says it is final.

<!-- step: write-rooms -->
2. **Write the rooms from it**: copy the lines, topics and hints into the room files ([Rooms](create.rooms.md)).

<!-- step: check-coverage -->
3. **Check coverage.** Open the Studio (`npm run studio`, in either context) and read the badges and the Check tab's
   Storyboard coverage, or, in the engine repository, run:

   ```bash
   # in the engine repository
   npm run page:storyboard
   ```

<!-- step: fix-drift -->
4. **Fix each gap on the side that is wrong.** When the game is right (a better line found while writing), copy it back
   into the storyboard, so the storyboard stays the reference for translators and voice actors. When the storyboard is
   right, write the missing panel into the room.

<!-- step: commit -->
5. **Commit both together.** The Studio's undo does not cover storyboard saves: git is the history of
   `storyboard.json`.

<a name="alternatives"></a>

## Alternatives set aside

- **Generating the rooms from the storyboard.** The storyboard says *what happens* in prose ("Use pipe with water
  tank"); a room needs exact ids, conditions, states and geometry. A generator would have to guess them, and the
  guesses would be overwritten by the next generation. Coverage keeps a person (or an assistant) writing the room, and
  shows what is left.
- **Making the rooms the only source.** The text then lives in code, scattered by room, and cannot be reviewed as a
  story before the rooms exist.

<a name="trade-offs"></a>

## Trade-offs

Two copies of every line, kept in step by discipline and measured by coverage. It costs a pass after each change; in
return the story stays reviewable on its own, at any moment, by someone who does not read code. For a very small game
written in one sitting the storyboard can stay rough; it is worth its upkeep as soon as several people, several
languages or voices are involved.

<a name="decisions"></a>

## Decisions and references

- [`tools/pages/storyboard-schema.md`](../../tools/pages/storyboard-schema.md),
  [`tools/pages/storyboard-data.ts`](../../tools/pages/storyboard-data.ts) (normalisation and `storyboardProblems`),
  [`src/engine/tools/coverage.ts`](../../src/engine/tools/coverage.ts) (coverage),
  [`tests/coverage.test.ts`](../../tests/coverage.test.ts),
  [`tests/diagnostics-parity.test.ts`](../../tests/diagnostics-parity.test.ts).
- One normalisation and one diagnostic for every reader since 4.1.0 ([`CHANGELOG.md`](../../CHANGELOG.md)).
- [Storyboard in the Studio](studio.storyboard.md) · [Review pages](create.review-pages.md) ·
  [Puzzle design](create.puzzle-design.md) · [Working with an AI](create.working-with-ai.md).
