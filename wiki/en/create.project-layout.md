# Layout of a created project and of the engine repository

A game lives in one of two places, and the commands differ between them. This page says what each holds, where the
game's files are, and which `npm run` scripts exist where. When a page says "in the created project" or "in the engine
repository", this is the difference it means.

| | A created project | The engine repository |
|---|---|---|
| Made by | `npm init @quest-n-click my-game "My Game"` or `npx quest-n-click create …` | `git clone` of `Quest-n-Click/quest-n-click` |
| The game's folder | `game/` | `games/<id>/` (several games side by side) |
| The engine | `node_modules/@quest-n-click/engine/` (installed, never written) | `src/engine/` (you may change it) |
| Which game | always `game/` | `GAME`, else `.cache/game`, else `config.game` in `package.json`, else `demo` ([choosing the game](create.working-loop.md#choosing-the-game)) |
| `npm run` scripts | eight (below) | about 150, the whole toolbox |

<a name="created-project"></a>

## A created project

`quest-n-click create <folder> ["Title"] [--engine=<npm spec>]` ([`cli/create.mjs`](../../cli/create.mjs)) refuses a
folder that exists and is not empty, then writes:

| Path | What |
|---|---|
| `game/` | the template game ([`games/_template`](../../games/_template)), with `__ID__` and `__TITLE__` replaced; the template's own `tests/` is left out |
| `game/provenance.json` | one entry saying every image is a placeholder drawn from shapes: a release refuses it until each file is replaced and reviewed (`npx quest-n-click provenance --lock`) |
| `public/` | the page's icons, its preview image (`og.png`) and the full font the engine falls back to; `public/assets/` is written by `npm run assets`, not committed |
| `package.json` | `"config": { "game": "<id>" }`, the dependency on the engine (`^<version>`, or `--engine`), and the scripts below |
| `tsconfig.json` | `@engine/*` points into `node_modules/@quest-n-click/engine/src/engine`, `@quest-n-click/engine/*` into its public API, `@game` into `game/index.ts` |
| `.gitignore` | `node_modules`, `dist`, `.cache`, `public/assets` |
| `README.md` | the five commands below, as a reminder |

Later, `npm run build` writes `dist/` (with `licenses/`), and the tools write `.cache/`.

In the created project, `npm run dev` and `npm run studio` call `quest-n-click dev` or `quest-n-click studio`, which
run the package's own Vite configuration with the project as working folder and `game/` as the game: the game on
`http://127.0.0.1:5173/`, the Studio at `/__studio/`, opened in the browser. Neither is the hosted Studio Server
([team Studio](team.what-runs-where.md)).

The project's id is the folder's name in lowercase, letters, digits and dashes; the title defaults to that id in title
case.

<a name="game-files"></a>

## The game's files

The same files in both places: `game/` in a created project, `games/<id>/` in the engine repository.

```
index.ts          entry point: export { game, layouts, manifest, minigames?, extraImages?, commands?, locales? }
game.ts           the game: verbs, characters, items, map, global rules, game start, skin (the look), ending, interface texts
cast.ts           the characters, with helpers for the standard sprite sheets (human, cat, mouths)
items.ts          the inventory items
rules.ts          fallback answers, reactions by kind ("never pull a cat"), rules valid everywhere
rooms/<room>.ts   one file per room (logic)
layout/<room>.json one file per room (geometry, written by the editor; never by hand)
storyboard.json   the story, board by board and panel by panel: the source of truth for the text
assets.gen.json   manifest of images and sounds (written by npm run assets)
sources.json      where the asset sources come from (optional)
provenance.json   where each asset comes from and under which licence
site.json         page title, description, theme colour, art style
locales/<lang>.json translations (written by npm run i18n -- extract)
art/, audio/      the sources of the images and sounds
tests/            the game's own tests (engine repository only)
```

`index.ts` is the template's and is kept as is: it gathers the layouts and the translations with Vite and exports the
game's `minigames`, `extraImages` (images to prepare even when no content references them) and `commands`
([custom code](create.custom-code.md)).

<a name="site-json"></a>

## `site.json`

```json
{ "lang": "en", "title": "…", "shortName": "…", "description": "…", "themeColor": "#0a0a12", "artStyle": "cel" }
```

- `title`, `description` and `themeColor` go into `index.html` and the PWA manifest.
- `url` (optional) is the game's public address, `"https://example.org/my-game/"`. The page then gives link previews
  an absolute share image (`og:image`, `<url>og.png`) and its own address (`og:url`): LinkedIn, Facebook and X need
  both, where a relative `og.png` often shows no image. An address that is not an absolute `http(s)` URL, or that has a query, a fragment
  or credentials, is ignored.
- `artStyle` is `"cel"` (default: painted cartoon) or `"pixel"` (retro pixel art). It changes the art prompts
  (`npm run prompts`), the cutter (`tools/cut-sheet.py`) and `npm run assets` (lossless WebP, nearest-neighbour
  resizing). For `pixel`, also set `skin: { pixelArt: true }` in `game.ts`.
- `sheetBackground` (optional) is the background the sprite sheets are generated on: `"transparent"` or a
  `"#RRGGBB"` colour, `#2B2E45` when absent. It changes the art prompts, and the cutter follows the sheet it is given
  ([images](create.images.md)).

<a name="scripts"></a>

## Which scripts exist where

A created project's `package.json` has eight scripts. Each calls the engine's command, `quest-n-click`, with the
project's folder as the working folder ([`cli/quest-n-click.mjs`](../../cli/quest-n-click.mjs)):

| In the created project | Runs | In the engine repository |
|---|---|---|
| `npm run dev` | the game in the browser, reloading as you edit | `npm run dev` (the current game) |
| `npm run studio` | the Studio | `npm run studio` |
| `npm run assets` | `art/` and `audio/` into `public/assets` (Python 3 with Pillow) | `npm run assets` |
| `npm run verify` | validate, solve, i18n status, lint, playtests | `npm run verify:game` (adds the chapters proof and the Remix worlds) |
| `npm run build` | assets, verify, the production build in `dist/`, every file accounted for | `npm run build` (also type-checks and runs the engine's tests first) |
| `npm run release` | build, then the release gates; `--commercial`: no exception, no placeholder | `npm run verify:release`, `npm run verify:commercial` |
| `npm run preview` | serves `dist/` on 127.0.0.1 | `npm run preview` |
| `npm run quest-n-click -- <command>` | any other command of the engine | (the scripts below) |

Every other tool is a subcommand of `quest-n-click`, run with `npx` in the created project:

```sh
# in the created project
npx quest-n-click validate
npx quest-n-click solve --prove
npx quest-n-click help        # the full list
```

In the engine repository the same tools are scripts of their own: `npm run validate`, `npm run solve`,
`npm run lint`, `npm run i18n`, `npm run ids`, `npm run prompts`, `npm run voices`, `npm run weight`,
`npm run provenance`, `npm run playtests`, `npm run migrate`, `npm run mcp`, `npm run doctor`. The full table is on
[npm scripts](reference.npm-scripts.md).

Only in the engine repository: `npm run new-game`, `npm run game`, `npm run dev:lan`, `npm run studio:lan`,
`npm test` and `npm run check` (the engine's tests), `npm run e2e*`, `npm run replay`, `npm run remix`,
`npm run page:*`, `npm run seal`, and the release and qualification scripts.

> [!LIMIT id=no-lan-in-project]
> A created project has no `dev:lan` nor `studio:lan`, no `start` and no GitHub Pages workflow. Testing on a phone
> over the network from a created project is described on [testing on a phone over the LAN](create.lan-testing.md).

> [!LIMIT id=doctor-in-project]
> `npx quest-n-click doctor` in a created project imports Playwright, which the package does not depend on: it may
> fail there until Playwright is installed ([install troubleshooting](install.troubleshooting.md)).

<a name="engine-repository"></a>

## The engine repository

Clone it to work on the engine, or to keep several games beside it (`games/demo`, `games/heroes`, `games/reference`,
`games/signals`, `games/_template`, [example games](create.example-games.md)). Node 22.12 or later is required
(`engines` in `package.json`); `npm run doctor` says what is missing ([requirements](install.requirements.md)).

`npm run dev` and `npm run studio` work in both places. In the engine repository they first point `.cache/game` at the
current game ([choosing the game](create.working-loop.md#choosing-the-game)), then start Vite on
`http://127.0.0.1:5173/` (loopback only; the Studio at `/__studio/`). In a created project they open the project's one
game ([above](#created-project)). Neither is the hosted Studio Server ([team Studio](team.what-runs-where.md)).

<a name="engine-code"></a>

## Layout of the engine's code

```
src/engine/
  core/        pure logic (no DOM): state, conditions, reactions, scripts, events, conversations, hints, saves
    types.ts     the content format (re-exports types/: content, game, stage, audio, state, session, reality, speedrun)
    engine.ts    the Engine class: player actions, resolution, the command interpreter
    cmds.ts      the catalogue of commands (CMD_KEYS): which change the state, which hold nested lists
    cond.ts      condition evaluation
    define.ts    defineGame / defineRoom, normalizeExits, compileGame, FLOOR and NEAR
    ports.ts     the Presenter interface (what the core asks of the display) + FakePresenter for node
  scene/       the scene frame (pure): SceneFrame, the hit test, the Renderer and Intent contracts (4.1.11)
  dom/         the browser display: app.ts (layout, verbs, inventory, menus), presenter.ts, room.ts (the scene),
               walk.ts (walk areas: earcut triangulation + navmesh paths), audio.ts (Howler), render-dom.ts and
               render-canvas.ts (the two painters), fonts.ts, assets.ts
  minigames/   pipes, stroke, pick, hide, runner, scratch, cables, code-wheel; all their images come from params
  ending/      the sealed ending: seal.ts (AES-GCM), card.ts, index.ts
  reality/     the client of a Reality Bridge
  tools/       validator, solver, lint and the other node tools
  dev/         debug overlay and placement editor (dev server only)
  api/         the public entry points (content, player, minigames, reality, testing)
```

The rule: `src/engine/` never imports from `games/` and never names a single image, sound or interface text. Texts
come from `GameDef.ui`; icons, sounds, fonts and default heights from `GameDef.skin`
([skin and fonts](create.skin-fonts.md)); minigame images from their `params`; the sealed ending from
`GameDef.ending`. `src/main.ts` imports `@game` (an alias for the game's `index.ts`) and knows nothing else about the
game. Verb ids are free (the game's `verbs`); four have a meaning for the engine: `look`, `talk`, `give` and `use`
([reactions](create.reactions.md)). The tour of the code for contributors is on
[architecture](contribute.architecture.md).

<a name="related"></a>

## Related identifiers

- `quest-n-click create`, `npm init @quest-n-click`, `npm run new-game` ([your first game](create.first-game.md)).
- `GAME`, `GAME_DIR`, `config.game` ([the working loop](create.working-loop.md#choosing-the-game)).
- The CLIs, with every subcommand: [CLI reference](reference.cli.md).
