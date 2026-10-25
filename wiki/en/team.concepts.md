# Concepts: revision, transaction, span, lease, preview, build

The team Studio uses a few words in its messages, its screens and its API. This page says what each one means, why it
exists, and where you meet it. The words are the same in French and English in the code: *span* is *pan*, *lease* is
*bail* (a lock).

<a name="why"></a>

## Why these concepts

Several people edit one live copy of a game at the same time. The server must answer three questions for every
change: did it land (and only once), which version is everyone looking at, and who may write what right now. Each
concept below answers one of them ([ADR 0025](../../docs/dev/adr/0025-studio-server.md)).

<a name="transaction"></a>

## Transaction (operation)

Every change is one **operation** in a journal: it may touch several files, and it lands whole or not at all. Its new
contents are stored first, the game is validated on its final state (a change that adds validation errors is refused
with a 422), then the operation is confirmed. On a hosted Studio it is confirmed by its PostgreSQL commit, after its
contents are in the bucket.

A write may carry an **operation id** (`x-studio-op`, 8 to 64 letters, digits, `-` or `_`). A retry with the same id
gets the first answer and is applied once; the answer comes back with `x-studio-replayed: 1`. The Studio, the CLI and
the MCP send one with every write. Answers are kept 7 days, and only given back to the member who wrote.

<a name="revision"></a>

## Revision and epoch

Each confirmed operation moves the project to the next **revision**, a number that only grows. `GET /api/revision`
gives it with the project's **epoch**, an id that changes when the history starts again (a new import, a restore). A
read answers with the revision it was made at, in `x-studio-revision`; the Studio's header shows "revision N".

The **base revision** is the revision an editor read before writing. The Studio sends it with each write
(`x-studio-base`); if someone else wrote one of the same files since, the write is refused with a 409 (see
[Write refused: stale base revision (409)](team.write-refused-409.md)).

<a name="span"></a>

## Span

Every file of the game belongs to exactly one **span**, decided by its path
([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts)):

| Span | Files |
|---|---|
| `room:<id>` | `rooms/<id>.ts`, `layout/<id>.json` |
| `game`, `items`, `cast`, `rules` | `game.ts`, `items.ts`, `cast.ts`, `rules.ts` |
| `story` | `storyboard.json`, `storyboard.md`, `STORY.md`, `prompts.md` |
| `lang:<code>` | `locales/<code>.json` |
| `voices` | `voices.json` |
| `assets` | `art/`, `audio/`, `assets.gen.json`, `talk-kits.json`, `provenance.json`, `provenance.lock.json` |
| `notes` | `notes.json` |
| `groupings` | `groupings.json` (the scenario map) |
| `meta` | `index.ts`, `site.json`, `e2e.mjs`, `ending.config.example.ts`, `ids.paths.json`, `ids.migration.json`, `spans.json`, `audit-allow.json`, `tests/` |
| `playtests` | `playtests/`, `replays/` |
| `reality` | `reality/` |

A file no rule names is refused (422) on a shared Studio until the engine gives it a span.

A game's own files (4.5.1), which the engine cannot know (the modules its `index.ts` imports, its notes, its scripts),
get their span from the game's `spans.json`, `meta` itself: a path, a folder (`minigames/`) or a glob (`prompts-*.md`,
`art-tools/**/*.py`), each with a span a client may take. The first that matches wins; the engine's rules above come
first, so a game never moves an engine file, and a key that names an engine file or folder literally (`cast.ts`,
`art/`) is refused. A file neither names is still refused. The file holds at most 256 entries of at most 256
characters, in 64 KiB; the hosted Studio reads it again when it changes, and while it is faulty it reports why and
the game's own files have no span, `spans.json` itself staying writable to repair it.

```json
{ "minigames/": "meta", "commands/": "meta", "swag.ts": "items", "prompts-*.md": "story", "art-tools/": "assets" }
```

<a name="lease"></a>

## Lease

Writing a file takes its span for you for **120 seconds**: a **lease**. Your Studio renews your leases every 30
seconds while it is open (the presence heartbeat). While you hold a span, another member's write in it is refused with
a 423 that names you (see [Write refused: span locked (423)](team.write-refused-423.md)). A write that touches
several spans takes them all or none, without waiting.

You can also take a span ahead, to reserve a room, and release it, in the Spans panel. An owner can **take a span
over**: it becomes theirs, the previous holder's next write there is refused, and the audit log records it.

Each lease has a **fence**, a number that grows with each new holder. A script may send the fences it was given
(`x-studio-fences`); its write is then refused if its lease ran out or was taken over since. The Studio and the MCP do
not send fences.

<a name="exclusive-lease"></a>

## Exclusive lease

The span `*` is the whole game. Its lease is **exclusive**: it is granted only when nobody else holds a span, and it
blocks every other write while it lasts. The jobs that touch everything take it for the member who starts them and
give it back when they end: Prepare and the cutting of sheets (a dev), the engine's upgrade and a Git import (an
owner). An owner can also take it and release it by hand.

<a name="preview"></a>

## Preview

The game you see in the Studio is the **preview** of one revision: after each change the worker builds the head (a
burst of changes builds its last revision only), and the game's origin serves it at `/preview/<rev>/`. A preview
never changes once built. The label under the room view says which revision you see, the one building, and a revision
that does not build. See [Recovering after a lost lease, a disconnection or a stale preview](team.recovery.md).

<a name="health"></a>

## Health

After each burst of changes the worker judges the head: the validator, then the solver from a new game, 45 s at most.
The header shows the verdict for a revision. A solver cut short says "unknown", never "valid". See
[Health and metrics routes](team.health-metrics.md#game-health).

<a name="build"></a>

## Published build

A **build** is the player's game at one revision, numbered (`#n`), served at `/play/<n>/` on the game's origin, and
never changed. `/play/` always goes to the last green build. See [Publishing builds](team.builds.md).

<a name="job"></a>

## Job

The long work of a hosted Studio (Prepare, the cutting of a sheet, the keying of a cell) runs as a **job**: the
request answers 202 at once, the job's states arrive on the live stream, and it can be cancelled until it starts
writing. See [Hosted assets](team.hosted-assets.md#jobs).

<a name="roles"></a>

## Roles

`owner`, `dev`, `reviewer`: reading is a reviewer's, writing a dev's, the members and the audit an owner's. The full
matrix is [Roles and actions](team.roles.md).

> [!LIMIT id=hosted-only]
> Spans, leases, previews, health, published builds and jobs exist on a hosted Studio only. The local Studio has one
> writer, no lease and no preview by revision.

<a name="decisions"></a>

## Decisions and ADRs

- [ADR 0025](../../docs/dev/adr/0025-studio-server.md): transactions, one owner per file, revisions.
- [ADR 0026](../../docs/dev/adr/0026-saves-across-revisions.md): saves across revisions.
- [What runs where](team.what-runs-where.md): the parts that hold all this.
