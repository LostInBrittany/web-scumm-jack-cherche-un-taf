## 4.2.3 PR 1: the revision read, and the 409 that says what changed (H10)

- **The journal** (`ops/journal.ts`): an operation's `readAt`; a file of its effects another author wrote after it (the
  operations since that name it, found by a `LIKE` on their effects, then checked) is a 409 whose body
  says `path`, `readAt`, `head`, and the file's text at each (`before`, `now`: null when absent, binary, longer than
  256 KiB, not UTF-8, or not kept). `blobAt(path, rev)`: a file's content hash at a revision (the first later
  operation's `before`, else the head's).
- **The server** (`http.ts`, `core.ts`): `x-studio-base` (a revision, else 400) into the operation's context; a write's
  answer carries `x-studio-revision`, the revision after it.
- **The Studio** (`src/studio/api.ts`): the revision each resource was last read at by its editor, by its read path; a
  write sends the longest read path's revision. Only an editor's read moves it: not a write's answer (the server never
  counts the member's own writes, so a replayed answer cannot make them conflict with themselves), not a read made for
  something else (`room(id, { track: false })`, the Assets tab's overlay); no base for a derived file
  (`storyboard/markdown`). The Voices tab reads again when `voices.json` changes. The 409 dialog (`spans.ts`) shows the
  changed lines with two lines of context (`line-diff.ts`, an LCS bounded at 2,000 lines, in typed rows) and offers
  "Apply my edit on the latest version" (sent again from the head's revision, computed again by the server on the
  file as it is), or for a whole document (a layout, the storyboard) "Replace with my version (drops their change)".
- **Limits**: a write is checked against the revision of the resource its editor read, for every file it writes (a
  file outside what the editor showed can refuse it too, never the reverse), per file (two notes are one file); the room
  view's placement (the in-game editor) is checked against what the Rooms tab read, while the view may show an older
  preview for a moment; a client that sends no `x-studio-base` (a script, the MCP until PR 5) is not checked this way. The merge is the edit applied again, not a three-way merge of
  texts: two edits of the same field keep the later one, after the member saw the earlier.
- **Mutation** (`studio-ops`, gated): `journal.ts` 159 of 165 killed locally, 6 named (one new, equivalent: the
  condition that spares a head read when no revision was read).
- **After the second reading**: a client's own writes exempt (`x-studio-client`, one per tab or CLI/MCP session, kept in
  `studio_ops.client`, migration 0011; the same member's other tab or agent still counts; no NUL sentinel, which Postgres
  refuses; `!` as the LIKE escape, whatever Postgres's string settings), (a replayed answer, a dry run or a write's answer no longer move the
  base past changes the editor never loaded), side reads untracked, whole documents said, derived files without base,
  the voices read again, the journal's scan bounded by a `LIKE`, the diff in typed rows.
- Tests: `tests/studio-journal-mutants.test.ts` (the revision read, own writes, LIKE patterns, JSON-escaped paths),
  `tests/dom/studio-api-base.test.ts` (the client: the base sent, moved by an editor's read only, none for a derived
  file, the head on retry, a whole document said), `tests/studio-collab.test.ts` (two members over
  HTTP, the 409, the edit applied on the head, a write's own revision), `tests/studio-line-diff.test.ts`,
  `tests/dom/studio-hosted-screens.test.ts` (the dialog).

→ next: Claude (4.2.3 PR 2: the scenario map, H1)
