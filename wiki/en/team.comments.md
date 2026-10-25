# Comments

On a team Studio, members comment on what the game names (a room, a door, an item, a rule, a storyboard panel) or on
the game itself, in threads. Comments are kept by the Studio, never in a game file, so a reviewer comments too.

<a name="what-you-get"></a>

## What you get

A thread anchored on a stable id of the game, with the revision it was written at, that the team answers, resolves
and opens again; and the old `notes.json` notes brought in as comments.

<a name="context-and-versions"></a>

## Context and versions

A hosted Studio (the Studio Server), from 4.2.3. The local Studio has notes (`notes.json`), not comments. The code is
[`studio-server/src/server/comments.ts`](../../studio-server/src/server/comments.ts).

<a name="prerequisites"></a>

## Prerequisites

- Any role: a `reviewer` comments, replies and resolves their own threads; a `dev` or an `owner` resolves any thread;
  bringing the notes in is an owner's (see [Roles and actions](team.roles.md#matrix-comments)).

<a name="where-to-run"></a>

## Where to run the commands

In the Studio, the **Notes** tab, panel **Comments**. Or through the API with a member's token.

<a name="steps"></a>

## Steps

<!-- step: write -->
1. **Write a comment.** In the *about* field, type what it is about: a room id (`hall`), an entity (`hall.door`), an
   item (`item:key`), a character (`char:lou`), a rule's id, an objective (`objective:<id>`), a checkpoint
   (`checkpoint:<id>`), or a storyboard board or panel id. Leave it empty for the game itself. Type the text (1 to
   4,000 characters), then **Comment**.

<!-- step: reply -->
2. **Reply.** Under a thread, type in **Reply**. A thread is one level deep: a reply to a reply joins the same thread,
   on its anchor.

<!-- step: resolve -->
3. **Resolve, or open again.** **Resolve** closes the whole thread; **Open again** reopens it.

<!-- step: import-notes -->
4. **Bring the notes in (owner).** **Bring the notes in** turns each note of `notes.json` into a comment, once: its
   `about` becomes the anchor when it is an id, otherwise the note lands on the game's thread with its `about` in front
   of its text. Running it again brings only the new notes. It answers `{imported, already}`.

Through the API:

```sh
# anywhere, with a member's token
curl -H "Authorization: Bearer $TOKEN" "https://studio.example.fr/api/comments?anchor=hall.door"
curl -X POST -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"anchor": "hall.door", "text": "The door should creak."}' https://studio.example.fr/api/comments
curl -X PUT -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"resolved": true}' https://studio.example.fr/api/comments/<id>
```

| Route | Does |
|---|---|
| `GET /api/comments[?anchor=<id>]` | every comment (or one anchor's), oldest first, the 2,000 newest at most |
| `POST /api/comments` `{anchor?, text, parent?}` | a comment, or a reply with `parent` (201) |
| `PUT /api/comments/<id>` `{text?, resolved?}` | its text changed (its author only), its thread resolved or opened again |
| `POST /api/comments/import-notes` | the notes of `notes.json` in, each once (owner) |

Each comment has `id`, `anchor` (`''` for the game), `rev` (the revision it was written at), `parent`, `author`,
`text`, `resolved`, `at`, `edited`, and `orphan`.

<a name="rules"></a>

## The rules

- **A comment keeps its revision.** It says which version of the game it was written about.
- **Orphan, never moved.** A comment whose anchor the game no longer names (a room removed, an id renamed) is shown
  "orphan: the game no longer names it"; it is never attached elsewhere. The anchors are the game's rooms, rules,
  scripts, entities, objectives and checkpoints, and the storyboard's boards and panels. **A line's id is not an
  anchor.** While the game does not load, no comment is said orphan.
- **Its author alone changes its text.** The Studio's panel has no edit button: the text is changed through
  `PUT /api/comments/<id>` with `text`.
- **A reviewer resolves their own threads**; a dev or an owner, any thread.
- **Kept by the Studio**: in its database and in its backups, never in a game file; no game file is written, so a
  comment needs no span and is never refused with a 423.

> [!GUARANTEE id=comment-author-edits]
> Only its author changes a comment's text; a thread is resolved as a whole; a reviewer resolves their own threads
> only.

> [!LIMIT id=comments-limits]
> A comment cannot be deleted (there is no route). One member keeps 2,000 open comments at most (429 past it: resolve
> some first). The list gives the 2,000 newest. Comments are not in the game's Git repository nor in an export: they
> live in the Studio's database.

<a name="expected-result"></a>

## Expected result, and how to check it

The thread appears in everyone's Comments panel, under its anchor, with its revision. `GET /api/comments?anchor=<id>`
lists it.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `a comment is a text of 1 to 4000 characters` (400) | Empty or too long | Shorten it, or split it |
| `an anchor is a stable id of the game (letters, digits, . : @ - _)` (400) | Spaces or other characters in *about* | Use the id, not a sentence |
| `only its author changes a comment's text` (403) | Someone else's comment | Reply instead |
| `a reviewer resolves their own threads` (403) | A reviewer on someone else's thread | Ask a dev |
| `comments are a shared Studio's` (404) | A Studio Server without OIDC (local mode) | Comments need a team Studio |

<a name="files-changed"></a>

## Files or data changed

Rows of the `studio_comments` table. No game file, no revision.

<a name="recovery"></a>

## Recovery or going back

A thread resolved by mistake is opened again. A text is corrected by its author. Nothing else can be undone.

<a name="references"></a>

## References

- [Roles and actions](team.roles.md#matrix-comments).
- [The local Studio's notes](studio.notes.md).
- [`tests/studio-comments.test.ts`](../../tests/studio-comments.test.ts).
