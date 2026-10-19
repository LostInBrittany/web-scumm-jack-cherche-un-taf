## 4.2.3 PR 4: the semantic diff (H3)

- `tools/studio/semantic-diff.ts`: a source parsed (the compiler API, never run): every object literal with
  `id: '<text>'` compared by its id, its other fields by their text, an object inside a field that has an id of its own
  shown as that id (a change is said once, by the object that owns it); a JSON compared by the paths of its leaves;
  anything else, or a side that is not text, "file changed" (`opaque`); a list cut at 500 (`cut`).
- `core.diff(from, to)` and GET `/api/diff/<from>..<to>` (a reviewer's): the files the operations between the revisions
  wrote, each compared at both sides through the journal (`blobAt`); a file written back is no change; 2,000 revisions
  at most; a content the journal did not keep (a local journal's adopted files) is opaque. The Check tab's panel
  (`src/studio/diff-panel.ts`).
- Limits: the ids are the ones written in the sources (an id made by code is not seen); a file without ids (code that
  is not content, an image), or a change outside every id, is "file changed"; JSON arrays are compared by index.
  Between builds is between their revisions. No before/after captures in 4.2.3, local or hosted (D45, carried to 4.3).
- **After the second reading**: an id written twice in one file is told by occurrence (`daily#2`); a `.ts` change that
  touches no id is "file changed"; each file's sides read from the operations of the range (the first one's before,
  the last one's after: no history scan), 500 files at most (`cut`); the game's `private/` left out; the panel checks
  the two revisions and says the captures are not made; D45 recorded.
- Tests: `tests/studio-semantic-diff.test.ts` (a source's ids and fields, a JSON's paths, added, removed, opaque, cut;
  over a journal, a written-back file no change, bad ranges refused), `tests/dom/studio-diff-panel.test.ts`.

→ next: Claude (4.2.3 PR 7: sprite sheets and uploads hosted, H8)
