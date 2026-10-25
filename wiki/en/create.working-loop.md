# The working loop

Write a rule, place it, check it, play it: the loop every change to a game goes through, with the commands for each
step in a created project and in the engine repository.

<a name="what-you-get"></a>

## What you get

A game running in your browser that reloads as you edit, a placement editor for the geometry, the validator and the
solver run after each change, and debug views that start the game at any checkpoint.

<a name="context-and-versions"></a>

## Context and versions

- A created project (`quest-n-click create`, the game in `game/`) or the engine repository (the games in
  `games/<id>/`). The [layout page](create.project-layout.md) says which scripts exist where.
- From 4.3.0. The current game is a link in `.cache/game` since 4.1.6 (until 4.1.5, `npm run dev` rewrote
  `tsconfig.json`).

<a name="prerequisites"></a>

## Prerequisites

- Node 22.12 or later, and the project's dependencies installed (`npm install` in a created project, `npm ci` in the
  engine repository): [requirements](install.requirements.md).
- Python 3 with Pillow for `npm run assets` ([image toolchain](install.image-toolchain.md)).
- A game: [your first game](create.first-game.md) makes one.

<a name="where-to-run"></a>

## Where to run the commands

Every command runs at the root of the project, on your machine: the folder that holds `package.json` (the created
project's folder, or the clone of the engine repository). `npm run dev` and `npm run studio` exist in both places;
`npm run validate` and `npm run solve` are scripts of the engine repository only, and are `npx quest-n-click validate`
and `npx quest-n-click solve` in a created project.

<a name="steps"></a>

## Steps

<!-- step: prepare-assets -->
1. Prepare the images and sounds once, and again after you add some:

   ```sh
   # in the created project, or in the engine repository
   npm run assets
   ```

<!-- step: run-dev -->
2. Start the game. It opens on `http://127.0.0.1:5173/` and reloads when a file of the game changes:

   ```sh
   # in the created project, or in the engine repository
   npm run dev
   ```

   Or start the Studio, the real engine with an editor on top, on `http://127.0.0.1:5173/__studio/`
   ([the local Studio](studio.overview.md)):

   ```sh
   # in the created project, or in the engine repository
   npm run studio
   ```

<!-- step: write -->
3. Write what happens in `rooms/<room>.ts` (props, actors, hotspots, look lines, reactions, topics, hints), with the
   story in `storyboard.json` ([rooms](create.rooms.md), [the storyboard](create.storyboard.md)).

<!-- step: place -->
4. Place what you wrote: open `?edit=<room>` on the dev server, or the Studio's Rooms tab. The editor writes
   `layout/<room>.json` ([geometry](create.geometry.md)).

<!-- step: check -->
5. Check. The Studio's Check tab runs the validator and the solver after every save; from the terminal:

   ```sh
   # in the engine repository
   npm run validate
   npm run solve
   ```

   ```sh
   # in the created project
   npx quest-n-click validate
   npx quest-n-click solve
   npm run verify        # validate, solve, i18n status, lint, playtests
   ```

<!-- step: play -->
6. Play the room: `/?dev&at=<checkpoint>` starts on a checkpoint with the debug layer
   ([URL parameters below](#playing)). On a phone, see [testing over the LAN](create.lan-testing.md).

<a name="choosing-the-game"></a>

## Choosing the game (`GAME`)

In a created project there is one game, `game/`, and nothing to choose.

The engine repository can hold several games, each in `games/<id>/`. The current game is, in this order
([`tools/game.ts`](../../tools/game.ts)):

1. the `GAME` environment variable (`GAME=demo npm run dev`);
2. else the game `.cache/game` links to (set by `npm run game` or `npm run new-game`);
3. else `package.json` → `"config": { "game": "demo" }`;
4. else `demo`.

`GAME_DIR=<folder>` points the tools at a game folder outside `games/` (a test fixture, for instance).

The rule is coded once, in `tools/game.ts`, and read by `vite.config.ts` (the `@game` alias → `games/<GAME>/index.ts`,
the editor's layouts written to `games/<GAME>/layout/`), `tools/validate.ts`, `tools/solve.ts`, `tools/refs.ts`;
`tools/assets.py` does the same reading in Python.

`tsconfig.json` cannot read an environment variable: its `@game` and `@game/*` paths look in `.cache/game`, a symbolic
link that `npm run game` (`tools/select-game.ts`) points at the current game, with `games/demo` as the fallback when no
link exists yet. `npm run dev`, `npm run studio`, `npm run check` and `npm run build` run it first;
`GAME=<id> npm run game` and `npm run new-game` switch the game. Vite and Vitest do not need the link: they resolve
the alias in `vite.config.ts`.

```sh
# in the engine repository
GAME=heroes npm run game     # heroes becomes the current game
npm run dev                  # plays games/heroes
```

The engine's tests do not depend on the current game: they run on `tests/fixture/` (a tiny game), and a game's own
tests import its files directly (`tests/demo.test.ts`, `tests/walkthrough.test.ts`).

<a name="playing"></a>

## Playing and debugging

```sh
# in the engine repository
npm run dev        # loopback-only dev server
npm run dev:lan    # explicit LAN mode for a phone; prints a one-session capability-token URL
npm run studio     # loopback-only Studio
npm run studio:lan # token-protected Studio on the LAN
```

URL parameters, dev server only (the production build ignores them; the full list is on
[dev URL parameters](reference.dev-url-parameters.md)):

| URL | Effect |
|---|---|
| `/` | The normal game: title screen, New Game / Continue. |
| `/?dev` | Starts on the first checkpoint, with the debug layer and the DEV panel. Press D to hide the debug layer. |
| `/?dev&at=<checkpoint>` | Starts on this checkpoint (defined in the game's `checkpoints`). |
| `/?edit=<room>` | The room's placement editor. |
| `/?edit=<room>&at=<checkpoint>` | The same, in that checkpoint's state (useful to place a prop in a given state). |

<a name="expected-result"></a>

## Expected result, and how to check it

- The page reloads with your change; the Studio's Check tab, or `validate`, prints no error.
- `solve` prints a way from New Game to the end, step by step.
- `/?dev` shows the zones of the room (walk area green, hotspots blue, props purple, approach points as dots).

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `npm run validate` says "Missing script" | You are in a created project | `npx quest-n-click validate` |
| The dev server plays another game than the one you edit | `GAME` set in your shell, or `.cache/game` points elsewhere | `GAME=<id> npm run game`, or unset `GAME` |
| An image is missing on screen | `npm run assets` not run since you added it | Run `npm run assets` |
| `?dev` or `?edit` does nothing | You opened a production build (`npm run preview`) | Use the dev server |
| "no layout: nothing will be clickable" | The room was never placed | Open `?edit=<room>` and save |

<a name="files-changed"></a>

## Files or data changed

- `npm run assets`: `public/assets/` and `assets.gen.json`, `.cache/refs.json`.
- The placement editor and the Studio: `layout/<room>.json` (and the files you edit in the Studio).
- `npm run game`, `npm run new-game`: the `.cache/game` link (engine repository).

<a name="recovery"></a>

## Recovery or going back

Everything the loop writes is a file of your project: commit before a large change, and `git restore` the files to go
back. `public/assets/` is rebuilt by `npm run assets`.

<a name="references"></a>

## References

- [Layout of a created project and of the engine repository](create.project-layout.md)
- [Checking your game](create.checking.md), [the local Studio](studio.overview.md)
- [`tools/game.ts`](../../tools/game.ts), [`cli/quest-n-click.mjs`](../../cli/quest-n-click.mjs),
  [`src/engine/dev/index.ts`](../../src/engine/dev/index.ts)
