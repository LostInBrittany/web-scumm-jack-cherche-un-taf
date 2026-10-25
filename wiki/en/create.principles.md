# Content principles and the identity contract

Why a quest'n'click game is written as data, why its geometry lives in a separate file, and why everything a save
remembers carries a stable id.

<a name="overview"></a>

## Writing the game content

This page and the other "Create a game" pages are for whoever writes the story: the rooms, the lines, the puzzles.
They describe the format the engine reads. You never need to touch the engine (`src/engine/`): the whole game lives in
one folder, `games/<id>/` in the engine repository, `game/` in a project made with `quest-n-click create`
([layout of both](create.project-layout.md)).

The full types, with their comments, are in [`src/engine/core/types.ts`](../../src/engine/core/types.ts), which
re-exports the files of `src/engine/core/types/` (split by subject in 4.1.0). Your editor offers them as autocomplete.
The generated [DSL reference](create.dsl.md) lists every command and condition.

These pages replace the old `docs/en/CONTENT_GUIDE.md`, split by question. Since the 4.5 switch-over, that old file is
a transition page: it keeps every old anchor, each old heading links to its new destinations here, and a fallback link
to `blob/v4.4.0/docs/en/CONTENT_GUIDE.md` always works.

<a name="principles"></a>

## The principles

1. **Content, not code.** The content is made of data: objects, lists, texts. No functions. That is what lets the
   engine check the game on its own (`npm run validate`) and prove it can be finished (`npm run solve`).
2. **Logic on one side, geometry on the other.** You write *what happens* in `rooms/<room>.ts`. *Where things are*
   (clickable rectangles, character positions, the walkable area) lives in `layout/<room>.json`, placed with the mouse
   in the placement editor (`npm run dev`, then `?edit=<room>`) or in the Studio. You never type coordinates by hand,
   except for a one-off scripted move ([geometry](create.geometry.md)).
3. **Nothing is a dead end.** Every action gets a response. With no written reaction, the engine answers with the
   game's fallback responses ([reactions](create.reactions.md#fallbacks)).
4. **Logical coordinates.** A backdrop measures 640 × 400, origin top-left. A character is placed by its feet.

> [!LIMIT id=custom-code-is-code]
> "No functions" holds for the content. What a game really needs beyond the DSL, a custom command or a minigame, is
> TypeScript of its own beside the content, named in the game and declaring its effects
> ([custom code](create.custom-code.md)).

<a name="identity-contract"></a>

## The v3 identity contract

New games set `schemaVersion: 3` in `game.ts` (the template does). Anything whose execution position survives in a
save has an explicit, unique id: every `Rule`, `TalkTopic`, `Choice`, `EventRule`, and every `once`, `nth`, `cycle` or
`random` block. A `ScriptDef` already has an id and adds one `stepIds` entry per top-level command. The validator
rejects a v3 game with a missing or duplicate id (`… requires a stable "id" in schema v3`,
`duplicate stable id "…"`, `schema v3 script needs one stable step id per command`). Reordering content or
translating a text therefore does not change the meaning of a save.

```ts
schemaVersion: 3,
// …
{ id: 'open.pantry', verb: 'open', a: 'pantry', do: […] }
{ id: 'ask.key', topic: 'Where is the key?', do: […] }
{ once: […], id: 'arrival.first' }
{ id: 'clock', stepIds: ['wait', 'chime'], do: [{ wait: 1000 }, { sfx: 'chime' }] }
```

Lines can carry ids too (`{ say: [...], id }`, `{ id, text }` in a list): translations and voice clips then follow the
id, not the line's position (`npm run ids -- --lines`).

`npm run ids -- --write --map` writes those ids into an existing game, with the migration step its saves need; how
to rename an id later without breaking saves is on [state and saves](create.state-saves.md#renaming-an-id).
`compileGame(source)` ([`src/engine/core/define.ts`](../../src/engine/core/define.ts)) clones and normalises the
authoring source once; a v3 result is frozen, so a tool that tries to change it fails at once. The engine, the
validator, the solver, the replay and the puzzle tools all consume that same compiled representation. Read the
[v2 → v3 upgrade notes](install.upgrade-notes-v2-to-v3.md) before converting an existing game.

> [!LIMIT id=ids-not-renames]
> Stable ids protect a save against reordering and translation. They do not protect it against a rename: changing an
> id is a change of meaning, which needs a migration step (`migrations` in `game.ts`).

<a name="why"></a>

## Why

A game has to be checked, saved, translated, compared between two revisions, edited by the Studio and an assistant,
and proved finishable by a machine. A function inside the content can do none of that: no tool can read what it
does without running it. Data can be read by all of them. The solver even runs the real engine on that data, so what
it proves, a player can do ([what the solver proves](create.solver-proofs.md)).

Geometry is apart because it is edited differently (with the mouse, against the picture) and changes for different
reasons (a new backdrop moves every rectangle, not a single rule).

<a name="alternatives"></a>

## Alternatives set aside

- **Scripts in a general-purpose language** (callbacks in the content): flexible, but the validator, the solver, the
  Studio and the translation tools would lose sight of the game.
- **Ids by position** (the schema 2 rule: a topic is `<room>.<actor>.<index>`): no work for the author, but inserting
  a topic or translating a text shifted what an old save meant. Schema 3 made the ids explicit.

<a name="trade-offs"></a>

## Trade-offs

Some ideas take a custom command instead of three lines of code, and the DSL grows slowly, one primitive per real
need. Writing ids is extra work; `npm run ids -- --write` does most of it.

<a name="decisions"></a>

## Decisions and ADRs

- [ADR 0002, content is data; the code a game needs is trusted and named](../../docs/dev/adr/0002-declarative-content.md)
- [ADR 0003, the solver runs the real engine](../../docs/dev/adr/0003-solver-runs-the-engine.md)
- [ADR 0026, saves across revisions](../../docs/dev/adr/0026-saves-across-revisions.md)
- Source: [`src/engine/core/content-ids.ts`](../../src/engine/core/content-ids.ts) (the stable ids),
  [`src/engine/core/define.ts`](../../src/engine/core/define.ts) (`compileGame`).
