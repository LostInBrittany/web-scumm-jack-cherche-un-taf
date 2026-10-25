# Preview, apply, undo

Every edit the local Studio makes goes the same way: shown as a diff first when you ask, judged on the game as it
would be, written whole or not at all, and undoable. This page says why it works that way and where it stops.

<a name="why"></a>

## Why

A game is TypeScript and JSON files that people, editors, git and AI agents all touch. The Studio must change those
files without breaking them and without hiding what it changes. So:

- **Preview the change.** In a form ("Preview the change"), the server computes the exact diff it would write and
  writes nothing: a dry run. You read the code the form produces before it exists.
- **Apply.** "Apply" writes the value as code in the file's own style, through the TypeScript parser: comments and
  the rest of the file stay as they were. The same path is used by the `set_value` MCP tool.
- **The guard.** Every write whose files the validator reads is judged on a copy of the game as it would be after it.
  If it adds a validation error (or the game would no longer load), it is refused with 422 and the errors, and
  nothing is written. Texts are guarded too. An edit that would break the file's syntax is refused (500) before that.
- **One operation, all or nothing.** Each write is one operation of the game's journal
  ([`studio-server/src/ops/journal.ts`](../../studio-server/src/ops/journal.ts), kept in `.cache/studio-journal/`):
  every file it touches is written at once or not at all, durably (fsync); an operation a crash interrupted is
  finished when the Studio opens again. Adding a prop writes the room and its layout as one operation, undone in one
  step. Writes are serialised.
- **Changes from outside.** A change made outside the Studio (an editor, an agent, git) is recorded in the journal
  before the next write touches that file. A file another process rewrites while an edit is being prepared is a 409:
  the Studio never writes over what it did not read.
- **Undo / Redo.** The header's Undo (Ctrl/Cmd+Z) and Redo (with Shift) cover every write of the session: texts,
  values, layouts, voices. An undo is itself a new operation (each file back to its content before), never a rewrite
  of history. It refuses (409) when the file changed since.

> [!GUARANTEE id=dry-run-writes-nothing]
> A preview writes nothing; an applied write lands in the Undo history, and can be undone and redone.

> [!GUARANTEE id=edit-taken-back]
> An edit that would add a validation error is refused (422) with nothing written, and an undo refuses a file that
> changed since the write.

<a name="alternatives"></a>

## Alternatives set aside

- **Writing what the form says, then validating.** Before 4.2.1 a structured write was written, validated, then taken
  back if it broke the game; now the game is judged as it would be, before anything is written.
- **Regenerating the room file from data.** The Studio could own the room files and rewrite them whole. It would lose
  your comments, your helpers and your layout of the code; the TypeScript parser edits only the literal or the value
  at the path.
- **A Studio-only history.** Undo could live in the page. It lives on the server side, over the journal, so an undo
  sees a file the AI or git changed meanwhile and refuses rather than overwrite it.

<a name="trade-offs"></a>

## Trade-offs

- A write waits for a validation of the whole game: on a big game, applying takes the time of `npm run validate`.
- The guard judges what the validator sees. A text built by code (a shared constant, a helper) is not reachable by the
  Studio, and what the validator does not check (a joke that falls flat) is not caught.
- The undo stack of the local Studio belongs to the Studio's process: it covers the writes made through that Studio
  since it started. An agent's writes through the MCP server (another process) are not on it; take them back with
  git.

> [!LIMIT id=undo-session-only]
> Undo and Redo cover the writes of the current Studio session only. After a restart, or for a change made outside
> the Studio, use git (`git diff`, `git checkout -- <file>`).

<a name="decisions"></a>

## Decisions and ADRs

- The journal and the guard came with 4.2.1 (`CHANGELOG.md`, 4.2.1); the hosted Studio uses the same journal with
  per-member undo ([Concepts](team.concepts.md)).
- Sources: [`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts),
  [`studio-server/src/ops/undo.ts`](../../studio-server/src/ops/undo.ts), [`src/studio/structured.ts`](../../src/studio/structured.ts).
- Where it is used: [Edit a room](studio.edit-room.md), [Language and objectives](studio.language-objectives.md).
