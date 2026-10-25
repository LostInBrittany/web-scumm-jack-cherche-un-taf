# Write refused on the hosted Studio: stale base revision (409)

On a team Studio, your save was refused with a 409: someone else saved the same file after you opened it. Nothing of
theirs was overwritten, and your draft is kept. This page says how to see what changed and how to save yours.

<a name="symptom"></a>

## Symptom

- In the Studio: a dialog "The file changed since you read it", with "Someone saved `rooms/kitchen.ts` meanwhile
  (revision 42): this is what changed since you read it at revision 40. Your draft is kept: apply it on the latest
  version, or copy it."
- Through the API, the CLI or the MCP: HTTP **409**, `{"error": "rooms/kitchen.ts changed since revision 40 (now 42)",
  "path", "readAt", "head", "before", "now"}`: the file as you read it and as it is now, when it is text.

<a name="causes"></a>

## Possible causes

Each write says which revision its editor read, in the header `x-studio-base`; every read answers with its revision in
`x-studio-revision`. If one of the files the write changes was saved by someone else after that revision, the write is
refused:

1. **Another member saved the same file** after you opened it. The most common case.
2. **You saved it yourself from somewhere else**: another tab, or an AI agent working for you through the MCP. Only the
   writes of the same tab, CLI or MCP session never refuse each other.
3. **Undo or redo** of an operation whose file someone else changed since: refused the same way, "cannot undo …:
   <file> changed since".

> [!LIMIT id=per-file]
> The check is per file: two notes edited at once are one file (`notes.json`), so they refuse each other. A script that
> sends no `x-studio-base` is not checked this way. The room view's placement is checked against what the Rooms tab
> read, while the view may still show an older preview for a moment.

<a name="diagnosis"></a>

## Diagnosis

- The dialog shows what changed between the revision you read and now.
- Through the API, `readAt` is the revision you read, `head` the current one, `before` and `now` the file at each.
- If the error has no `path` but says "changed while this edit was being prepared" or "while this edit was being
  checked", another write landed during yours: try again, nothing else to do.

<a name="fix"></a>

## Fix

<!-- step: review-change -->
1. **Read what changed** in the dialog: it may already hold what you wanted, or clash with it.

<!-- step: apply-on-latest -->
2. **For an edit the server makes on the file** (a text, a value, a note, a voice line): click "Apply my edit on the
   latest version". Your edit is applied on top of theirs; nothing of theirs is lost.

<!-- step: replace-or-merge -->
3. **For a whole document** (a room's layout, the storyboard): either click "Replace with my version (drops their
   change)", knowing it removes theirs, or copy your draft, reload the file, and redo your change on the new version.

<!-- step: retry -->
4. Through the API, read the file again (its answer gives the new `x-studio-revision`), redo the change, and send it
   with that revision as `x-studio-base`. Nothing is sent again unless you ask.

<a name="check-fixed"></a>

## Check it is fixed

The save goes through, with a revision after the one in the error's `head`. `GET /api/ops` lists both operations,
theirs and yours.

<a name="neighbours"></a>

## Neighbouring cases

- **423, "… is held by …"**: someone holds the span right now; that is a lock, not a stale read. See
  [Write refused on the hosted Studio: span locked (423)](team.write-refused-423.md).
- **The Reality Bridge's 409** has nothing to do with the Studio: a pairing code confirmed twice, a speedrun run sent
  twice. See [Bridge and connector troubleshooting](bridge.troubleshooting.md#conflict-409).
- Other 409s of the Studio Server: `"… already exists in room …"` (an id already taken), and
  `"another epoch: resynchronise"` on `GET /api/ops?epoch=…` when the project is not the one the client knew (read
  the history again from the start).
