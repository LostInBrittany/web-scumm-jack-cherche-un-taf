# npm scripts

Every `npm run` script of the engine repository, and every script a project made with `quest-n-click create` gets.
Each script has its own section: link to it as `reference.npm-scripts.md#verify-game` (the name in lowercase, `:`
written `-`; a created project's script is `#project-<name>`).

<a name="quick-entry"></a>

## Quick entry, by task

| I want to… | In the engine repository | In a created project |
|---|---|---|
| play the game while I write it | [`npm run dev`](#dev) | [`npm run dev`](#project-dev) |
| edit it with the mouse | [`npm run studio`](#studio) | [`npm run studio`](#project-studio) |
| prepare the art | [`npm run assets`](#assets) | [`npm run assets`](#project-assets) |
| check it after a change | [`npm run validate`](#validate), [`npm run solve`](#solve) | [`npm run verify`](#project-verify) |
| prove that nobody gets stuck | [`npm run solve -- --prove`](#solve), [`npm run prove:game`](#prove-game) | `npx quest-n-click solve --prove` |
| build it to publish | [`npm run build`](#build) | [`npm run build`](#project-build) |
| contribute to the engine | [`npm run check`](#check), [`npm run quality`](#quality) | — |

<a name="overview"></a>

## Where to run them

All the commands run from the root folder of their project, the one that holds `package.json`:

- in a clone of the **engine repository** (`quest-n-click/`), after `npm ci`: the scripts of
  [the engine repository](#repository) below. They work on the current game, `games/<id>/`: the `GAME` variable
  (`GAME=demo npm run dev`), else `package.json` → `"config": { "game": "demo" }`, else `demo`. How to choose it,
  and how `npm run game` keeps the editor in step: [create.working-loop](create.working-loop.md#choosing-the-game);
- in a **created project** (made by `npx @quest-n-click/create <folder>`), after `npm install`: only the eight scripts
  of [a created project](#project). Each calls the `quest-n-click` command of the installed engine; its other commands
  are in [reference.cli](reference.cli.md#quest-n-click).

A script that takes arguments gets them after `--`: `npm run solve -- --prove`. `npm run -s <script>` silences npm's
own lines (what an MCP client needs for `npm run -s mcp`).

> [!LIMIT id=repository-only]
> The scripts of the engine repository are not in a created project: there, `npm run validate` does not exist, use
> `npx quest-n-click validate` (or `npm run quest-n-click -- validate`).

The sections below are generated from `package.json`, from [`cli/create.mjs`](../../cli/create.mjs) and from the
descriptions of [`wiki/data/npm-scripts.json`](../../wiki/data/npm-scripts.json) (`npm run wiki -- generate
reference.npm-scripts`): a script added without a description, or a description whose script is gone, fails
`npm run wiki -- check`.

<!-- generated:begin -->

<a name="repository"></a>

## Scripts of the engine repository

Run in a clone of the engine repository, from its root folder (the one that holds `package.json`), after `npm ci`.

<a name="playing"></a>

### Playing, serving and choosing the game

Run the game or the Studio on this machine, serve a build, pick the current game of the repository.

<a name="dev"></a>

#### `npm run dev`

The game in the browser on a loopback-only Vite dev server, reloading as you edit. It first points `.cache/game` at the current game (`npm run game`). URL parameters such as `?dev` and `?edit=<room>` work on it ([reference.dev-url-parameters](reference.dev-url-parameters.md)).

- Runs: `tsx tools/select-game.ts && vite`

<a name="dev-lan"></a>

#### `npm run dev:lan`

The dev server in explicit LAN mode, for a phone on the same network: `tools/serve.ts --lan` starts Vite with a fresh capability token for every file-writing route and prints a one-session token URL to open on the phone.

- Runs: `tsx tools/select-game.ts && tsx tools/serve.ts --lan`

<a name="game"></a>

#### `npm run game`

Points `.cache/game` (a symbolic link git ignores) at `games/<GAME>/`, where `tsconfig.json`'s `@game` paths look first (`games/demo` second, so a fresh checkout type-checks). `dev`, `check` and `build` run it first; `GAME=<id> npm run game` switches the current game (4.1.6).

- Runs: `tsx tools/select-game.ts`
- Usage: `GAME=<id> npm run game`

<a name="new-game"></a>

#### `npm run new-game`

Scaffolds `games/<id>` from `games/_template` and makes it the current game; it writes a `provenance.json` for the art it borrows (all placeholders, CC BY 4.0).

- Runs: `node scripts/new-game.mjs`
- Usage: `npm run new-game <id> ["Working title"]`

<a name="preview"></a>

#### `npm run preview`

Serves `dist/` on 127.0.0.1 (`vite preview`): what the e2e scripts are pointed at after a build.

- Runs: `vite preview --host 127.0.0.1`

<a name="start"></a>

#### `npm run start`

Serves `dist/` on every interface at `$PORT` (8080 by default) with `sirv`, through `scripts/start.mjs`: a Node launcher, so it also runs on Windows (4.1.8). What a host such as Clever Cloud runs.

- Runs: `node scripts/start.mjs`
- Usage: `npm start`

<a name="studio"></a>

#### `npm run studio`

The Studio (`STUDIO=1`), loopback-only, opened at `/__studio/`: rooms, dialogues, the puzzle graph, the mixer.

- Runs: `tsx tools/select-game.ts && cross-env STUDIO=1 vite --open /__studio/`

<a name="studio-lan"></a>

#### `npm run studio:lan`

The Studio on the LAN, protected by a capability token (`tools/serve.ts --lan --studio`).

- Runs: `tsx tools/select-game.ts && tsx tools/serve.ts --lan --studio`

<a name="media"></a>

### Images, sounds and review pages

Prepare what the content cites, write the art prompts, and the pages a person reads on a phone.

<a name="assets"></a>

#### `npm run assets`

Prepares in `public/assets/` the images and sounds the content cites: `tools/refs.ts` lists them (rooms, characters, items, the map, minigame parameters, `skin`, the title and credits screens, `ending.scratch`, `extraImages`) into `.cache/refs.json`, then `python3 tools/assets.py` converts them (Python 3 with Pillow) and writes `games/<GAME>/assets.gen.json`, reprocessing only what changed.

- Runs: `node -e "require('node:fs').mkdirSync('.cache',{recursive:true})" && tsx --tsconfig tsconfig.json tools/refs.ts > .cache/refs.json && python3 tools/assets.py`

<a name="audio"></a>

#### `npm run audio`

The Mega Drive music and sound-effect pipeline (`python3 tools/audio.py`; [create.music](create.music.md), [create.sound-effects](create.sound-effects.md)).

- Runs: `python3 tools/audio.py`
- Usage: `npm run audio -- …`

<a name="code-wheel"></a>

#### `npm run code-wheel`

The printable code wheel of a game (4.1.15): the large disc with the portraits from the sprites, the small disc with its windows, a booklet (assembly, the question, practice answers upside down), in colour and economy; SVG always, PDF with Pillow (`tools/code-wheel-pdf.py`; `npm run doctor` checks it).

- Runs: `tsx tools/code-wheel.ts`
- Usage: `npm run code-wheel -- --game <id> [--format svg|pdf --seed <code> --out <dir>]`

<a name="icons"></a>

#### `npm run icons`

Writes `public/icons/icon-192.png`, `icon-512.png` and `public/og.png` from the game's `site.json` (`title`, optional `ogLines`: up to three lines above the title), with no dependency.

- Runs: `node scripts/gen-icons.mjs`

<a name="import-layout"></a>

#### `npm run import-layout`

Merges layouts exported from the placement page into `games/<id>/layout/<room>.json`. Accepted per file: `{ "layouts": { "<room>": Layout } }` (the page's "Export JSON"), `{ "room", "layout" }` (one document of the `layouts` collection), or a list of such documents. `--dry`: say, write nothing.

- Runs: `tsx --tsconfig tsconfig.json tools/pages/import-layout.ts`
- Usage: `npm run import-layout -- <file.json|dir> [--dry]`

<a name="page-placement"></a>

#### `npm run page:placement`

Writes the placement page, to place things from a phone; its export comes back with `npm run import-layout` ([create.review-pages](create.review-pages.md)).

- Runs: `tsx --tsconfig tsconfig.json tools/pages/placement.ts`
- Usage: `npm run page:placement [-- --out <dir|file.html>]`

<a name="page-puzzles"></a>

#### `npm run page:puzzles`

Writes the puzzle graph as a page: what every rule needs and changes, a card per item and flag ([create.review-pages](create.review-pages.md)).

- Runs: `tsx --tsconfig tsconfig.json tools/pages/puzzles.ts`
- Usage: `npm run page:puzzles [-- --out <dir|file.html>]`

<a name="page-review"></a>

#### `npm run page:review`

Writes the art review page: every cell of every sheet of `games/<id>/art/` as a thumbnail with a keep / redo / unused decision and a note, the cells the game uses marked with the ids that cite them, the ids no file provides listed as missing ([create.review-pages](create.review-pages.md)).

- Runs: `tsx --tsconfig tsconfig.json tools/pages/review.ts`
- Usage: `npm run page:review [-- --out <dir|file.html>]`

<a name="page-storyboard"></a>

#### `npm run page:storyboard`

Writes `games/<id>/storyboard.json` as a phone-friendly page with a notes box under every panel (`--md` also writes `games/<id>/storyboard.md`, the plain text sub-agents read, the same text as the Studio's Markdown export) ([create.review-pages](create.review-pages.md)).

- Runs: `tsx --tsconfig tsconfig.json tools/pages/storyboard.ts`
- Usage: `npm run page:storyboard [-- --out <dir|file.html>] [--md]`

<a name="page-world"></a>

#### `npm run page:world`

Writes the map of the world as a page: exits, gotos, unreachable rooms, the DOT source ([create.review-pages](create.review-pages.md)).

- Runs: `tsx --tsconfig tsconfig.json tools/pages/world.ts`
- Usage: `npm run page:world [-- --out <dir|file.html>]`

<a name="prompts"></a>

#### `npm run prompts`

Writes `games/<id>/prompts.md`: every image-model prompt of the game ready to paste, one section per sheet, all sharing one STYLE block and one reference sheet (`games/<id>/art/_reference.png`, or the hero's validated sheet while it does not exist); cells already cut are marked "(exists — keep)". `--missing`: only the sheets with an image not cut yet, and only their missing cells; `--out <file>`: another output file. It reads the game module and the art folder: characters (`cast.ts`: the base 6 × 4 sheet with the engine's pose rows, `human()` or `cat()`; the special poses the content uses — extra `sprites` keys, `{ pose: [who, p] }` and `{ anim: [who, p] }` in rooms, actor poses, `variants` — a new `<sheet>_poses` sheet for poses no sprite provides yet with the lines to add to `cast.ts`, the seat rule, the mouth kit for the poses in `mouths`); objects (every image a prop, item, minigame or the interface uses, by sheet folder; a prop's states drawn as "the SAME object, state …"); backgrounds (`decor/<name>`: LOCATION, the hotspots to show, EMPTY SPOTS left / center / right from `layout/<room>.json`); furniture (props whose image is in a `furniture_*` folder, and a room's `furniture` list); and a checklist (reference → hero → other characters → objects → backgrounds → furniture, each with its `python3 tools/cut-sheet.py` command, `--cells` for the missing ones, then `npm run assets`). Three optional fields feed it without changing the game: `description` on a character (the CHARACTER line; missing, a `<describe: …>` placeholder stays), `description` on a room (the LOCATION line), `furniture` on a room (image ids drawn on their own sheet, e.g. `furniture_dining/table`). The MCP tool `asset_prompts` (`{ missing?: boolean }`) gives the same text and the missing image ids as JSON.

- Runs: `tsx --tsconfig tsconfig.json tools/prompts.ts`
- Usage: `npm run prompts [-- --missing] [-- --out <file>]`

<a name="seal"></a>

#### `npm run seal`

Encrypts the sealed ending (ticket and final card) into `public/data/dossier.bin`, only the chosen outcome (one key of `outcomes` in `games/<GAME>/private/ending.config.ts`; without it, the committed `ending.config.example.ts`). The config's password must match `ending.password` in the game file.

- Runs: `tsx scripts/seal.ts`
- Usage: `npm run seal -- --outcome=<key>`

<a name="checking"></a>

### Checking the game

What a game must pass: validation, the solver and its proofs, the lint, translations, voices, weight, provenance, the release gates.

<a name="audit-corpus"></a>

#### `npm run audit:corpus`

The solver's abstractions against the explicit search on many random games (plain, free items, three characters), every night: tried, compared, partial, diverged per kind; exit 1 on a divergence. `--shard`/`--merge` split and join the seeds (3.7, 3.7.1).

- Runs: `tsx tools/audit-corpus.ts`
- Usage: `npm run audit:corpus [-- --seeds=500 --from=1 --max=3000 --json=<file> | --shard=i/n --total=N | --merge a.json b.json …]`

<a name="bench"></a>

#### `npm run bench`

A generated game of the given size, every tool timed on it (`--prove` adds the exhaustive proof, `--v3` stable ids); `--workers-table` the proof workers' table; `--matrix [--eras]` the 3.3 reference table ([contribute.benchmarks](contribute.benchmarks.md)).

- Runs: `tsx --tsconfig tsconfig.json tools/bench.ts`
- Usage: `npm run bench [-- --rooms=40 --players=3 … --prove --v3 | --workers-table | --matrix [--eras]]`

<a name="i18n"></a>

#### `npm run i18n`

Translations: `extract` writes `games/<id>/locales/<lang>.json` (the base language's reference file, or a translation kept, followed and completed), `status` the coverage of every file (a text identical to the source fails unless `i18n: { same: [paths] }`), `voices` the lines with an id and no clip, and the clips no line claims.

- Runs: `tsx --tsconfig tsconfig.json tools/i18n.ts`
- Usage: `npm run i18n -- extract [--lang <xx>] | status | voices`

<a name="ids"></a>

#### `npm run ids`

Stable ids (schema 3) for rules, topics, listeners, choices, once/nth/cycle/random blocks and script steps. Without flags, a dry run. `--write`: into the sources (`rooms/*.ts`, `rules.ts`, `game.ts`), translation keys renamed; `--map`: `ids.migration.json` and `ids.paths.json`, and the manual steps printed; `--lines`: also every say / toast / guide object, list line, hint and kind reaction (translations and voices follow it); `--lines=all`: plain strings too, required for a translated or voiced release.

- Runs: `tsx tools/ids.ts`
- Usage: `npm run ids [-- --write] [--map] [--lines | --lines=all]`

<a name="ir"></a>

#### `npm run ir`

The game's intermediate representation (4.1.12): rooms and what stands in them, rules, topics, listeners, scripts, objectives, each with the `file:line` that writes it, and the hash of the trusted extensions; `--json` prints the whole IR, the same text for the same sources.

- Runs: `tsx tools/ir.ts`
- Usage: `npm run ir [-- --game <id> --json]`

<a name="lint"></a>

#### `npm run lint`

The content lint (alias of `lint:content` since 4.1.0): conditions nothing can satisfy, hidden rules, red herrings, stuck hints, dead topics and options, then after a solver run the live actions never run and the rooms never reached. Exit 1 only on an error not ignored by `GameDef.lint.ignore`. `--prove`: the exhaustive search first; `--static`: no solver run.

- Runs: `npm run lint:content --`
- Usage: `npm run lint [-- --json | --prove | --static | --max=20000]`

<a name="lint-content"></a>

#### `npm run lint:content`

The content lint itself (`tools/lint.ts`); `npm run lint` runs it with the same arguments, and `npm run quality` runs it last.

- Runs: `tsx tools/lint.ts`
- Usage: `npm run lint:content [-- …]`

<a name="migrate"></a>

#### `npm run migrate`

A game project moved to this release (`quest-n-click migrate`): an older schema gets its stable ids and the manual steps printed; since 4.3.0 it first renames the former name's `web-scumm/…` imports, the tsconfig's paths and the scripts' `web-scumm` commands (`--check` names them).

- Runs: `tsx tools/migrate.ts`
- Usage: `npm run migrate [-- --check]`

<a name="playtests"></a>

#### `npm run playtests`

Replays every session players shared (`games/<id>/playtests/`) on the current content and sums them up: time per room, stalls, hints, where they stopped, a heat map on the puzzle graph. A diverged session is reported (re-record or delete it); `--strict` (the release gate) makes it an error, exit 1, and asks for no number of sessions. Field quotas (3.7.1): `--require=N` sessions, `--require-completed=N`, `--require-devices=N` device families; one missed is an error. No file: exit 0.

- Runs: `tsx tools/playtests.ts`
- Usage: `npm run playtests [-- --json --strict --require=N --require-completed=N --require-devices=N --dir=games/<id>/playtests --out=.cache/playtests]`

<a name="prove-game"></a>

#### `npm run prove:game`

The exhaustive softlock gate: the proof, the proof by chapters, then `solve:reality`; fails on softlocks or truncation. `release-check` runs it.

- Runs: `npm run solve -- --prove && npm run solve -- --prove --chapters && npm run solve:reality`

<a name="prove-matrix"></a>

#### `npm run prove:matrix`

The proof matrix (4.1.13): twelve generated three-character games, each proved in its own process under the published budgets; one row each (verdict, expected verdict, states, time, peak memory). Exit 1 on a false verdict; out of budget is `unknown`, never `proved`. Nightly only.

- Runs: `tsx tools/prove-matrix.ts`
- Usage: `npm run prove:matrix [-- --only=c11,o21 --time=600 --max=10000000 --mem=4096 --json=<file> --profile=<file>]`

<a name="provenance"></a>

#### `npm run provenance`

The shipped assets by licence and what changed since the reviewed lock; `--lock` writes `games/<id>/provenance.lock.json` (each file's SHA-256 and size) after a review. Exit 0 clean, 1 something to review.

- Runs: `tsx tools/provenance.ts`
- Usage: `npm run provenance [-- --lock]`

<a name="remix"></a>

#### `npm run remix`

A Remix world of the current game (4.1.15): `--seed` prints each dimension's value and the world's hash (`--json` the whole `WorldVariant`), `--preview` adds validate and a solver witness on that world, `--record=N` solves the first N seeds of the published sample and writes each as a playtest session carrying its world (`games/<id>/playtests/remix-<seed>.session.json`).

- Runs: `tsx tools/remix.ts`
- Usage: `npm run remix -- --seed <code> [--mode=remix --json] | --preview <code> [--max=N] | --record=N`

<a name="replay"></a>

#### `npm run replay`

Plays a session exported from the game (settings › save › "Export session", the Studio's Play tab, the DEV panel) on the real engine without a display; prints the journal, the semantic journal (4.1.11) and the final state; exit 1 where the replay stops matching the recording or its semantic journal differs from the file's.

- Runs: `tsx tools/replay.ts`
- Usage: `npm run replay -- <session.json> [--upTo=N] [--json]`

<a name="solve"></a>

#### `npm run solve`

The solver: a fast witness that the game can be finished from New Game. `--prove`: the exhaustive proof of the reachable states, softlocks reported. Other options: `--from=<checkpoint>`, `--max=<states>`, `--chapters` (one bounded search per checkpoint with `goals`; with `--prove`, each chapter proved from every reachable boundary state), `--goal=100%` (every non-optional objective, 4.1.12; exit 2 for a game that declares none), `--json`, `--profile`, `--por=sleep|stubborn`, `--workers=N|auto [--batch=64]`, `--time=<s>`, `--mem=<MB>`, `--ownership=off`, `--dominance`, `--symmetry`, `--representation=objects`, `--checkpoint=<file> [--checkpoint-every=300] [--resume]`, `--audit-abstractions`. Exit 0 solved, 2 truncated (nothing proved: raise the budget), 1 otherwise ([reference.error-codes](reference.error-codes.md#solver)); see [create.solver-options](create.solver-options.md).

- Runs: `tsx tools/solve.ts`
- Usage: `npm run solve [-- --prove | --from=<checkpoint> | --max=<n> | --chapters | --goal=100% | --json | --profile …]`

<a name="solve-reality"></a>

#### `npm run solve:reality`

A game that takes signals from outside, proved in every world it may meet (4.1.1): closed (through each required signal's fallback), each scenario of `games/<id>/reality/scenarios/*.json`, each recorded replay of `games/<id>/replays/` (4.1.9), and adversarial.

- Runs: `tsx tools/solve-reality.ts`
- Usage: `npm run solve:reality [-- --json]`

<a name="validate"></a>

#### `npm run validate`

Checks the game content: broken references, empty or too-long text, missing Look lines, flags never set or never read. Exit 1 for a blocking problem. `--report`: the content profiler (rooms, items, characters, what is thin, as Markdown). `--release`: also the asset provenance (`games/<id>/provenance.json` required, a placeholder an error unless an exception names it) and a stable id on every line of a game shipped in another language than its own or voiced. `--commercial`: no exception, no placeholder, no non-commercial licence, every source checkable.

- Runs: `tsx tools/validate.ts`
- Usage: `npm run validate [-- --report | --release | --commercial [--errors]]`

<a name="verify-commercial"></a>

#### `npm run verify:commercial`

verify:release, then `validate --commercial --errors` (no exception, no placeholder, no NC/ND licence, every source checkable), then verify:dist.

- Runs: `npm run verify:release && npm run validate -- --commercial --errors && npm run verify:dist`

<a name="verify-dist"></a>

#### `npm run verify:dist`

Every file of the built game accounted for (3.7.1): engine code, this game's locked assets (their reviewed bytes), named data, fonts, icons, the notices under `licenses/`; anything else, or a locked file missing, fails.

- Runs: `tsx tools/dist.ts`
- Usage: `npm run verify:dist [-- --dir=dist] [--json]`

<a name="verify-field"></a>

#### `npm run verify:field`

verify:commercial, then strict playtests with the field quotas (`--require=5 --require-completed=3 --require-devices=2`): what a release tested by players needs; not a step of release-check (D12).

- Runs: `npm run verify:commercial && npm run playtests -- --strict --require=5 --require-completed=3 --require-devices=2`

<a name="verify-game"></a>

#### `npm run verify:game`

The game's gates: validate, solve, solve by chapters, verify:variants, i18n status, lint, playtests. A step of `build:game`.

- Runs: `npm run validate && npm run solve && npm run solve -- --chapters && npm run verify:variants && npm run i18n -- status && npm run lint && npm run playtests`

<a name="verify-release"></a>

#### `npm run verify:release`

validate `--release`, weight `--release`, i18n status, voices check `--release`, strict playtests: a step of `release-check`.

- Runs: `npm run validate -- --release && npm run weight -- --release && npm run i18n -- status && npm run voices -- check --release && npm run playtests -- --strict`

<a name="verify-variants"></a>

#### `npm run verify:variants`

Every world of every Remix mode (4.1.15, D25): a catalogue's every logical world, a generator's published sample, each validated and solved to the ending and every objective (`--prove`: the exhaustive proof), a certificate per world in `.cache/proofs/variants/`, coverage per dimension and pair, values never chosen, dominant ones; `--out` writes the report a release publishes; exit 1 if one world fails. Part of verify:game.

- Runs: `tsx tools/verify-variants.ts`
- Usage: `npm run verify:variants [-- --prove --max=N --sample=50 --draws=1000 --out=<file>]`

<a name="voices"></a>

#### `npm run voices`

The voice production table: `status` per language (lines by status draft, record, recorded, approved; a line with text switches has one row per value, `<id>~form=f`), `export` the table for the actors (CSV or JSON), `import` their statuses, actors and notes back into `voices.json` (exit 1 on an unknown line or status), `check` every clip measured with ffmpeg (codec, rate, length, loudness ≈ −16 LUFS, peak; exit 1 on an error; `--release`: an approved line needs its clip).

- Runs: `tsx tools/voices.ts`
- Usage: `npm run voices -- status [--lang xx] | export --lang xx [--json] | import <file> --lang xx | check [--lang xx] [--release]`

<a name="weight"></a>

#### `npm run weight`

What a phone downloads before the first room is playable, per room and per chapter, against `assetBudgets` (`initialKB`, `roomKB`, `chapterKB`), from the built files and the asset graph. Exit 0 within budget, 1 over a budget or a file missing (`--release`: or a budget not set). `--stems` counts the scores' stems.

- Runs: `tsx tools/weight.ts`
- Usage: `npm run weight [-- --release --json --stems]`

<a name="tests"></a>

### Tests and code quality

The engine's own test suites, its mutation sets, the formatting, the types and the quality baseline.

<a name="check"></a>

#### `npm run check`

Points `.cache/game` at the current game, type-checks (`tsc --noEmit`), then runs `test:node`.

- Runs: `tsx tools/select-game.ts && npm run -s tsc -- --noEmit && npm run test:node`

<a name="doctor"></a>

#### `npm run doctor`

An actionable report of the prerequisites, installing nothing: Node and Chromium required; Python, its modules, ffmpeg and WebKit optional. `--release` (4.1.8) requires Python, its modules and ffmpeg as release-check does, and Chromium as always; Firefox and WebKit stay optional.

- Runs: `tsx tools/doctor.ts`
- Usage: `npm run doctor [-- --release]`

<a name="format"></a>

#### `npm run format`

Biome's formatting, written (`biome format --write .`).

- Runs: `biome format --write .`

<a name="format-check"></a>

#### `npm run format:check`

Biome's formatting, checked without writing (`npm run quality` runs it).

- Runs: `biome format .`

<a name="lint-code"></a>

#### `npm run lint:code`

Biome's lint of the code alone (`biome lint .`).

- Runs: `biome lint .`

<a name="quality"></a>

#### `npm run quality`

The engine code's gate (4.1.0): Biome formatting check and lint, knip (unused files and exports), `tsconfig.json` and `tsconfig.strictest.json` type checks, then the content lint.

- Runs: `npm run format:check && npm run lint:code && knip --no-progress && npm run -s tsc -- --noEmit && npm run -s tsc -- --noEmit -p tsconfig.strictest.json && npm run lint:content`

<a name="quality-baseline"></a>

#### `npm run quality:baseline`

The behaviour of 4.0.0 kept (4.1.0): for the demo, the reference game, the heroes example and the solver's fixtures, the witness and proof, every golden save played to its end, the public API and MCP surface, the first visit (`tests/quality-baseline.json`). `--check` compares; without it, it writes the file and the READMEs' three figures: a new test or a lighter bundle means running it (4.1.8).

- Runs: `tsx tools/quality-baseline.ts`
- Usage: `npm run quality:baseline [-- --check] [--dist=dist]`

<a name="test"></a>

#### `npm run test`

Runs `test:node`: the engine's and tools' Node tests and the selected game's, the heavy solver tests and the Python-bound ones excluded.

- Runs: `npm run test:node`
- Usage: `npm test`

<a name="test-assets"></a>

#### `npm run test:assets`

The Python-backed image and asset-pipeline tests (`tests/pixel.test.ts`, `tests/studio-assets.test.ts`).

- Runs: `vitest run tests/pixel.test.ts tests/studio-assets.test.ts`

<a name="test-coverage"></a>

#### `npm run test:coverage`

The suite under V8 coverage (heavy tests excluded), against the floors of `vite.config.ts`; then `npx tsx tools/coverage-ratchet.ts --strict` fails on a floor at least three points behind what the tests reach (CI on main and tags, release-check, 4.1.8; a warning on a pull request, 4.1.9).

- Runs: `vitest run --coverage --exclude tests/ownership.test.ts --exclude tests/audit.test.ts --exclude tests/canonical.test.ts --exclude tests/memo.test.ts --exclude tests/reference-proof.test.ts --exclude tests/solver-oracle.test.ts --exclude tests/dominance.test.ts --exclude tests/partition.test.ts --exclude tests/checkpoint-matrix.test.ts`

<a name="test-heavy"></a>

#### `npm run test:heavy`

The CPU-bound solver tests (abstraction audits, canonical owner, memo and ownership proofs, the reference chapter's proof, dominance, partition, checkpoint matrix), one file at a time: nightly, minutes each.

- Runs: `vitest run --no-file-parallelism tests/ownership.test.ts tests/audit.test.ts tests/canonical.test.ts tests/memo.test.ts tests/reference-proof.test.ts tests/solver-oracle.test.ts tests/dominance.test.ts tests/partition.test.ts tests/checkpoint-matrix.test.ts`

<a name="test-mutation-core"></a>

#### `npm run test:mutation:core`

Mutation testing of the modules a save, a session, a condition, a signal, a run or a store rest on, and of the connectors' pure parts (SDK, MIME reader, line editor, virtual disk, badge crypto and fetch: `connectors-pure`, which `connectors` still names until 4.2). Every set gated since 4.1.20, `reality-store-postgres` (the Postgres adapter, on a Postgres) and `connectors-edge` (configuration, email, badge verification, terminal guard and shell, SSH, Telnet, in 4 shards) among them. 4.1.20: `--shard=i/n` mutates one shard (whole files, a deterministic cut balanced on their mutants) and `--merge` joins a set's shards into its report, refusing a shard missing, doubled, cancelled or of other inputs; ci, the nightly, the candidate and the release run one matrix generated by `npx tsx tools/mutation-shards.ts --matrix=gated|nightly`. Every entry of `docs/dev/mutants.json` has a category, a why, a proof, an owner and a revisit version, refused from that version on (an entry due stops every set). A run that mutates `reality-store-postgres` (`--set=all` included, so release-check) needs `BRIDGE_PG_URL`. A report whose input hash (sources, tests, configurations, lockfile) is current is reused unless `--fresh`; `--hash` prints that hash (the CI cache key); `--doc` writes the named survivors' table into docs/dev/MUTANTS.md.

- Runs: `tsx tools/mutate.ts`
- Usage: `npm run test:mutation:core [-- --set=core|reality|runs|remix|speedrun|connectors-pure|reality-store|connectors-edge|reality-store-postgres|all --file=… --shard=i/n --merge [--from=…] --fresh --hash --doc]`

<a name="test-mutation-reality"></a>

#### `npm run test:mutation:reality`

One mutation set (4.1.16): the Reality signal path. `core`, `reality`, `runs`, `remix` and `speedrun` are gated since 4.1.17 (`--set=all`, one job each in ci with `full-ci`, the nightly, the candidate and the release).

- Runs: `tsx tools/mutate.ts --set=reality`

<a name="test-mutation-remix"></a>

#### `npm run test:mutation:remix`

One mutation set (4.1.16): a world's seed, hash, compilation, application, constraints, category and Daily/Mystery tokens. `core`, `reality`, `runs`, `remix` and `speedrun` are gated since 4.1.17 (`--set=all`, one job each in ci with `full-ci`, the nightly, the candidate and the release).

- Runs: `tsx tools/mutate.ts --set=remix`

<a name="test-mutation-runs"></a>

#### `npm run test:mutation:runs`

The speedrun queue's mutation set (4.1.17): admission, quota and leaderboard ranking (`bridge/src/runs.ts`, `runs-store.ts`, `runs-limiter.ts`), judged by the four short Bridge run test files; gated from the start (`--set=all`, the release, one job of its own).

- Runs: `tsx tools/mutate.ts --set=runs`

<a name="test-mutation-speedrun"></a>

#### `npm run test:mutation:speedrun`

One mutation set (4.1.16): a run's envelope and `h0`, the recorder and the verifier. `core`, `reality`, `runs`, `remix` and `speedrun` are gated since 4.1.17 (`--set=all`, one job each in ci with `full-ci`, the nightly, the candidate and the release).

- Runs: `tsx tools/mutate.ts --set=speedrun`

<a name="test-node"></a>

#### `npm run test:node`

The unit suite without the Python-bound tests (`tests/pixel.test.ts`, `tests/studio-assets.test.ts`) and the CPU-bound ones (`test:heavy`'s files); `npm run check` runs it, the heavy ones run nightly.

- Runs: `vitest run --exclude tests/pixel.test.ts --exclude tests/studio-assets.test.ts --exclude tests/ownership.test.ts --exclude tests/audit.test.ts --exclude tests/canonical.test.ts --exclude tests/memo.test.ts --exclude tests/reference-proof.test.ts --exclude tests/solver-oracle.test.ts --exclude tests/dominance.test.ts --exclude tests/partition.test.ts --exclude tests/checkpoint-matrix.test.ts`

<a name="tsc"></a>

#### `npm run tsc`

The TypeScript 7 compiler itself (4.1.8; the `tsc` bin link may belong to the tools' typescript6 package): `check` and `quality` call it.

- Runs: `node node_modules/typescript/bin/tsc`
- Usage: `npm run tsc -- …`

<a name="browser-tests"></a>

### Browser tests (e2e)

Each runs the product in a real browser with Playwright (`npm run doctor` says which browsers are installed). A browser that cannot launch exits 3 where the script says so (0 with `--allow-skip`).

<a name="e2e"></a>

#### `npm run e2e`

A playthrough by touch in a phone-sized browser (`E2E_BROWSER=chromium|webkit|firefox`; screenshots in `E2E_OUT`, default `/tmp/e2e`); the server must already answer at the URL. A game's own `games/<id>/e2e.mjs` (exporting `run(harness)`) is used when present, otherwise the solver's path (`npm run solve -- --json`) is tapped through. `--renderer canvas`: the whole game drawn by the Canvas painter; `--lang <xx>`: the whole game in that language, failing on any visible English default of the engine.

- Runs: `node scripts/e2e.mjs`
- Usage: `npm run e2e -- [url] [--game <id>] [--at=<checkpoint>] [--prod] [--generic] [--keyboard] [--renderer canvas] [--lang <xx>]`

<a name="e2e-a11y"></a>

#### `npm run e2e:a11y`

Accessibility and storage gates in a real browser (`E2E_BROWSER=chromium|webkit`) on the production build of the sample game: axe on the conversation, map, slots, confirmations and every minigame; every minigame won at the keyboard; an older save upgraded. Exit 3: a check the browser cannot automate.

- Runs: `node scripts/e2e-a11y.mjs`
- Usage: `npm run e2e:a11y -- <url> [--only=axe,keys,storage] [--allow-skip]`

<a name="e2e-canonical"></a>

#### `npm run e2e:canonical`

`canonicalJson` (`src/engine/core/canonical.ts`, 4.1.12) on fifty edge values in Chromium, WebKit and Firefox, against the texts Node writes: one browser that writes one value differently fails; exit 3 when a browser cannot launch (0 with `--allow-skip`).

- Runs: `node scripts/e2e-canonical.mjs`
- Usage: `npm run e2e:canonical [-- --browsers=chromium,webkit,firefox --allow-skip]`

<a name="e2e-music"></a>

#### `npm run e2e:music`

The music director's gates (3.5) on the served production build: 30 minutes offline without drift, 100 changes without a click, real-time jitter, the theme's stems in the game; `--only=reference` (GAME=reference): two scores, bridges, a restore and a stop mid-transition, the decoded peak (Chromium and WebKit, 3.8).

- Runs: `node scripts/e2e-music.mjs`
- Usage: `npm run e2e:music -- <url> [--only=offline|live|game|reference --live=chromium|webkit --browser=webkit]`

<a name="e2e-perf"></a>

#### `npm run e2e:perf`

Frames per second while the hero walks, the CPU slowed (default 4×, the phone stand-in); fails under `--min` (default 30).

- Runs: `node scripts/e2e-perf.mjs`
- Usage: `npm run e2e:perf -- <url> [--renderer=canvas|dom --cpu=4 --min=30 --room=<id> --seconds=5]`

<a name="e2e-pwa"></a>

#### `npm run e2e:pwa`

The PWA in a real browser (`E2E_BROWSER`): installed, the whole game warmed and opened offline. With `--serve=dist` the script serves the build itself and can publish a second one: `--update` (the banner, the save kept, the new worker in charge), `--interrupted` (the worker's fetch fails: no banner, the old one serves), `--reinstall` (worker and caches gone, installed again, the save kept); `--allow-skip` accepts WebKit's offline navigation, which Playwright cannot drive.

- Runs: `node scripts/e2e-pwa.mjs`
- Usage: `npm run e2e:pwa [-- --serve=dist --update --interrupted --reinstall --allow-skip]`

<a name="e2e-reality"></a>

#### `npm run e2e:reality`

The Reality Bridge end to end on the production build of `games/signals` and a real reference Bridge it starts on 127.0.0.1:8787 (4.1.1): pairing, the same webhook twice, offline, back online, the signal applied once, the session replayed; since 4.1.9 two connectors and the sample chapter's replays.

- Runs: `node scripts/e2e-reality.mjs`
- Usage: `npm run e2e:reality -- <url> [--browser=chromium|webkit]`

<a name="e2e-remix"></a>

#### `npm run e2e:remix`

The same seed makes the same world, the same hash and the same code wheel in Node, Chromium, WebKit and Firefox (4.1.15, ADR 0018): 50 seeds of the reference in three modes; a browser that differs fails with the seed named; exit 3 when one cannot launch (0 with `--allow-skip`).

- Runs: `node scripts/e2e-remix.mjs`
- Usage: `npm run e2e:remix [-- --browsers=chromium,webkit,firefox --seeds=50 --allow-skip]`

<a name="e2e-remix-speedrun"></a>

#### `npm run e2e:remix-speedrun`

Remix and Time Attack together (4.1.16): for each world policy of the reference (Story, Remix Fixed, Remix Random, Daily, Mystery) the world made, the solver's route recorded by the real recorder in Node, Chromium, WebKit and Firefox (the four `.wsrun` the same, byte for byte), verified in a new process, then by a Bridge queue's isolated worker: verdict, leaderboard key, trust; exit 3 when a browser cannot launch (0 with `--allow-skip`).

- Runs: `tsx scripts/e2e-remix-speedrun.ts`
- Usage: `npm run e2e:remix-speedrun [-- --browsers=chromium,webkit,firefox --allow-skip]`

<a name="e2e-smoke"></a>

#### `npm run e2e:smoke`

The generic playthrough of the production build (`e2e.mjs --generic --prod`): the solver's path replayed by touch.

- Runs: `node scripts/e2e.mjs --generic --prod`

<a name="e2e-speedrun"></a>

#### `npm run e2e:speedrun`

The speedrun's determinism in Chromium (also with its CPU four times slower), WebKit and Firefox (4.1.14): the generator's vectors, the reference run replayed to the same final state, IGT and final proof, a run resumed from IndexedDB after its tab closed; exit 3 when a browser cannot launch (0 with `--allow-skip`).

- Runs: `node scripts/e2e-speedrun.mjs`
- Usage: `npm run e2e:speedrun [-- --browsers=chromium,webkit,firefox --allow-skip --bundle-only]`

<a name="e2e-studio"></a>

#### `npm run e2e:studio`

The Studio in a browser on the dev server: a stage edited without JSON by hand (the form, the diff preview, Apply validated by the server, Undo), the room file restored either way.

- Runs: `node scripts/e2e-studio.mjs`

<a name="e2e-studio-collab"></a>

#### `npm run e2e:studio-collab`

Three people on one hosted Studio (4.2.1, CI's `studio-hosted` job; `studio-client` first): presence, a span held by another refused with the draft kept, a reviewer kept from writing, a cut caught up from the journal, the members screen, the login and "access not granted" pages.

- Runs: `tsx scripts/e2e-studio-collab.ts`
- Usage: `npm run e2e:studio-collab [-- --browser=firefox|webkit]`

<a name="e2e-studio-hosted"></a>

#### `npm run e2e:studio-hosted`

The hosted Studio in a browser (4.2.1, CI's `studio-hosted` job; `studio-client` first): login, the room editor on the game's origin, its save through the Studio, the wall between the two origins, Play, logout (Firefox and WebKit over https; WebKit on macOS only).

- Runs: `tsx scripts/e2e-studio-hosted.ts`
- Usage: `npm run e2e:studio-hosted [-- --browser=firefox|webkit]`

<a name="e2e-taps"></a>

#### `npm run e2e:taps`

The default verbs in the browser on the reference chapter (4.0, GAME=reference): a double tap on an exit goes through it, on a character talks to it; an item picked from the bag is given to a character, used on anything else.

- Runs: `node scripts/e2e-taps.mjs`
- Usage: `npm run e2e:taps -- <url> [--browser=chromium|webkit]`

<a name="e2e-visual"></a>

#### `npm run e2e:visual`

Every room, still, against `tests/visual/<game>/<room>.png` (the scene only, animations frozen); more than 0.5 % of the pixels changed fails; `--update` writes the references. The production build must be served.

- Runs: `node scripts/e2e-visual.mjs`
- Usage: `npm run e2e:visual -- <url> [--update] [--tolerance=0.005]`

<a name="e2e-weight"></a>

#### `npm run e2e:weight`

The weight budget against the bytes a browser really transfers: a first visit to the production build in Chromium, from the title to the first playable room; a request outside the predicted initial scope (`npm run weight -- --json`) fails.

- Runs: `node scripts/e2e-weight.mjs`
- Usage: `npm run e2e:weight -- <url>`

<a name="e2e-worker-container"></a>

#### `npm run e2e:worker-container`

The speedrun worker in its container profile (4.1.17, Linux with Docker, CI's `worker-container` job): the reference run verified inside; a hostile script refused HTTP, DNS, TCP, writes outside `/tmp` and the host's secrets, its child process without a network, all killed by the container's own timeout; a run again. `node tools/speedrun/container.mjs --image= --app= [--games=] [--allow-network]` prints the profile as a `worker` command.

- Runs: `tsx scripts/e2e-worker-container.ts`
- Usage: `npm run e2e:worker-container [-- --image=node:22-bookworm-slim]`

<a name="release"></a>

### Building, packaging and releasing

The build, the archives a release ships, the checks a candidate runs, the people's passes (Field Kit) and the release chain.

<a name="audit"></a>

#### `npm run audit`

Runs `audit:assets`.

- Runs: `npm run audit:assets`

<a name="audit-assets"></a>

#### `npm run audit:assets`

Fails the build if anything from the private origin project leaks into the public repository (names of real people, private sheet ids, the private project name), the blocked words stored as SHA-1 prefixes. A game may allow some of these words in its own files, by their SHA-1 prefix and a reason, in `games/<id>/audit-allow.json` ([create.build-release](create.build-release.md#audit-allow)). `build:game` runs it. The licences of `dist/`'s files are `verify:dist`'s job.

- Runs: `tsx tools/audit-assets.ts`

<a name="audit-deps"></a>

#### `npm run audit:deps`

`npm audit --omit=dev`: the runtime dependencies' advisories (CI on main and release-check).

- Runs: `npm audit --omit=dev`

<a name="build"></a>

#### `npm run build`

`npm run check` (types and the Node tests), then `build:game`: the static `dist/` (the game, its assets, the service worker). It requires a winning witness.

- Runs: `npm run check && npm run build:game`

<a name="build-game"></a>

#### `npm run build:game`

The game's gates (verify:game), the Vite bundle, verify:dist, the spoiler check, the leak audit (`audit:assets`): no tsc, no unit suite (CI runs those once).

- Runs: `npm run verify:game && vite build && npm run verify:dist && npm run check:spoilers && npm run audit:assets`

<a name="build-web"></a>

#### `npm run build:web`

`vite build` alone, no gate: what a host runs after its own install (on Clever Cloud, `CC_POST_BUILD_HOOK=npm run build:web`).

- Runs: `vite build`

<a name="check-spoilers"></a>

#### `npm run check:spoilers`

Checks that no sealed-ending text, of any outcome, appears in clear in `dist/`.

- Runs: `tsx scripts/check-spoilers.ts`

<a name="connector-archive-e2e"></a>

#### `npm run connector-archive-e2e`

The four connectors played end to end from their archive against a Bridge from its archive (4.1.19): email by webhook and by IMAP (a server of the script's own), Telnet, SSH and Open Badge; the candidate's `connector-archive-e2e` job. Real providers and exposure stay a person's pass (`connectors-real-security`).

- Runs: `node scripts/connector-archive-e2e.mjs`
- Usage: `npm run connector-archive-e2e -- [--tarballs=<dir>] [--keep]`

<a name="external-consumer"></a>

#### `npm run external-consumer`

The four archives used as a third party uses them, on Linux, macOS and Windows (4.1.18): read (names, versions, licences, binaries, exports, dependencies), a game made on the older release moved to them (since 4.3.0 as its author would: the old `web-scumm` package uninstalled, `quest-n-click` installed, migrate, verify, build, its save and a new game played to the end through `@quest-n-click/engine/testing`), `create-quest-n-click`, the Bridge (SQLite, Postgres with `CONSUMER_PG_URL`) and a connector scenario (a pairing code, a signed letter accepted, its duplicate, a forged one refused); no module of the checkout. The candidate runs it on its own archives.

- Runs: `node scripts/external-consumer.mjs`
- Usage: `npm run external-consumer -- [--tarballs=<dir>] [--from=4.1.17] [--dir=<folder>] [--keep]`

<a name="field-bundle"></a>

#### `npm run field:bundle`

A report and its listed evidence in one archive, logs redacted, refused on a key or a token. ([contribute.field-passes](contribute.field-passes.md))

- Runs: `tsx tools/field/field.ts bundle`
- Usage: `npm run field:bundle -- --report=<report.json> --out=<bundle.tar.gz>`

<a name="field-carry"></a>

#### `npm run field:carry`

4.1.20 (ADR 0024): a pass carried to a new candidate when no file of its surface changed (the version included): a pending attestation the maintainer approves in a signed commit; `--check-range=<a..b>` refuses a range that changes the trust root and an attestation. ([contribute.field-passes](contribute.field-passes.md))

- Runs: `tsx tools/field/field.ts carry`
- Usage: `npm run field:carry -- --from=<folder> --to=<folder> --pass=<id> [--check-range=<a..b>]`

<a name="field-check"></a>

#### `npm run field:check`

Each pass report checked against its candidate (commit, run, digests), its evidence's SHA-256 and the leak scan. ([contribute.field-passes](contribute.field-passes.md))

- Runs: `tsx tools/field/field.ts check`
- Usage: `npm run field:check -- --dir=<folder> [--require=<id,…>]`

<a name="field-init"></a>

#### `npm run field:init`

The Field Kit (4.1.18): the people's passes as JSON reports at `not-run`, bound to that candidate run. ([contribute.field-passes](contribute.field-passes.md))

- Runs: `tsx tools/field/field.ts init`
- Usage: `npm run field:init -- --release=<x.y.z> --candidate=<run id>`

<a name="field-report"></a>

#### `npm run field:report`

The people's passes table generated from the reports. ([contribute.field-passes](contribute.field-passes.md))

- Runs: `tsx tools/field/field.ts report`
- Usage: `npm run field:report -- --dir=<folder> --out=docs/dev/passes/<x.y.z>.md`

<a name="field-verify-bundle"></a>

#### `npm run field:verify-bundle`

4.1.19: a bundle's integrity, its candidate, then who made its manifest (its attestation, or the run). ([contribute.field-passes](contribute.field-passes.md))

- Runs: `tsx tools/field/field.ts verify-bundle`
- Usage: `npm run field:verify-bundle -- <bundle.tar.gz> [--offline --trusted-root=<file>]`

<a name="fresh-install"></a>

#### `npm run fresh-install`

The engine used as another project uses it (3.9): a game created from the packed template outside the repository, the tarball installed, its own `assets`, `verify` and `build`, then played to its end in a browser; `create-quest-n-click` installed from its tarball and run, the Bridge installed and serving, the connectors installed without native code and answering `--help`. CI runs it.

- Runs: `node scripts/fresh-install.mjs`
- Usage: `npm run fresh-install [-- --dir=<folder>] [--keep]`

<a name="locks"></a>

#### `npm run locks`

The versioned locks of the Bridge, the connectors and the Bridge's image (`scripts/locks/`, 4.1.19), made from the root lock (every version kept); `--check` says whether each still fits its manifest and the root lock, without the network. `scripts/pack.mjs` copies them into the archives as `npm-shrinkwrap.json`; `scripts/sbom.mjs` and `scripts/bridge-image.mjs` make the candidate's five CycloneDX SBOMs and its image. Run it when a dependency of those packages changes, review the diff, commit it.

- Runs: `node scripts/locks.mjs`
- Usage: `npm run locks [-- --check]`

<a name="ops-qualify"></a>

#### `npm run ops:qualify`

The Bridge's qualification profile (`ops/qualify/`, 4.1.18) built from the tarball and brought up behind HTTPS on Docker: three instances on one Postgres, two tenants, an instance killed during proposals, a stream on another, the tenants apart, backup, the topology destroyed and restored, then (4.1.20) a restore refused while the Bridges serve and `--mode=replace-store` with them stopped. It writes `ops-qualify.json` (schema 2: the profile, the commit, `--candidate-run`, the four archives' SHA-256, each step by its stable id with its duration and first defect; the `qualify` workflow). A candidate started by hand runs the full profile and its gate refuses less (`tools/release/candidate.mjs qualification`); a pull request's runs `--short`.

- Runs: `node scripts/ops-qualify.mjs`
- Usage: `npm run ops:qualify -- [--tarballs=<dir>] [--image-from=<dir>] [--short] [--candidate-run=<id>] [--old-bridge=<tgz>] [--out=<dir>] [--keep]`

<a name="pack"></a>

#### `npm run pack`

The `quest-n-click`, `create-quest-n-click`, `quest-n-click-bridge` and `quest-n-click-connectors` (4.1.9) tarballs a release ships, from tracked files only: an untracked file under a shipped root refuses the pack (4.1.8); `--publish-dry-run` shows what `npm publish` would send ([contribute.npm-packages](contribute.npm-packages.md)).

- Runs: `node scripts/pack.mjs`
- Usage: `npm run pack [-- --out=<dir> --publish-dry-run]`

<a name="readme-quickstart"></a>

#### `npm run readme-quickstart`

The README's quick start as a reader copies it (4.1.19): the block under "## Start" run as written in a folder outside the repository, its archive URL pointed at the candidate's own archive (`file:`), `npm run dev` until it answers, then `verify` and `build`; the candidate's `readme-quickstart` job. `--published`, after the tag: the README's URL answers with the SHA-256 the release's SHA256SUMS lists.

- Runs: `node scripts/readme-quickstart.mjs`
- Usage: `npm run readme-quickstart -- --tarballs=<dir> | --published`

<a name="release-check"></a>

#### `npm run release-check`

What CI runs, in one go: doctor `--release`, quality, build, coverage and its strict ratchet, verify:release, prove:game, `solve --audit-abstractions`, the Rust cross-check (`--require-rust`), every mutation set (`--set=all`), the packages with `--publish-dry-run`, `audit:deps` and `npm audit --audit-level=high`.

- Runs: `npm run doctor -- --release && npm run quality && npm run build && npm run test:coverage && npx tsx tools/coverage-ratchet.ts --strict && npm run verify:release && npm run prove:game && npm run solve -- --audit-abstractions && npm run reality:xcheck -- --require-rust && npm run test:mutation:core -- --set=all && node scripts/pack.mjs --out=.cache/pack --publish-dry-run && npm run audit:deps && npm audit --audit-level=high`

<a name="release-check-ci"></a>

#### `npm run release-check:ci`

The same without the mutation sets (4.1.10; the release workflow runs them as jobs beside it), coverage reported for GitHub Actions and as JSON in `.cache/test-report/vitest.json`.

- Runs: `npm run doctor -- --release && npm run quality && npm run build && npm run test:coverage -- --reporter=default --reporter=github-actions --reporter=json --outputFile.json=.cache/test-report/vitest.json && npx tsx tools/coverage-ratchet.ts --strict && npm run verify:release && npm run prove:game && npm run solve -- --audit-abstractions && npm run reality:xcheck -- --require-rust && node scripts/pack.mjs --out=.cache/pack --publish-dry-run && npm run audit:deps && npm audit --audit-level=high`

<a name="release-check-local"></a>

#### `npm run release-check:local`

What a machine can run of the release chain: quality, docs:truth, the unit suite, build:game, `quality:baseline -- --check --dist`.

- Runs: `npm run quality && npm run docs:truth && npm run test:node && npm run build:game && npm run quality:baseline -- --check --dist`

<a name="ship"></a>

#### `npm run ship`

The release chain as commands (4.1.8): wait for a pull request's checks (one re-run of a failed job), merge it, wait for `main`'s CI on the merge, tag and push, follow the tag's CI and the release run, download the release and verify its sums and attestations; `chain <pr> <version>` does all of it. Each command writes its PID to `.cache/pids/`. `tag` requires `--candidate=<run id>` from 4.1.17 on: a green run of the `candidate` workflow (`gh workflow run candidate --ref main -f sha=<sha>`: release-check, the heavy suite three times on new runners, the load on SQLite and Postgres, the four runtimes, one job per gated mutation set) whose manifest names that SHA; release.yml publishes that run's `.wsrun` files after checking their SHA-256 (`tools/release/candidate.mjs`). 4.1.20: `preflight-stable --candidate=<run>` says what 4.2 stable still needs, check by check, changing nothing; `tag --sign` signs a tag with an SSH key; `verify` also runs `gh release verify` ([contribute.releasing](contribute.releasing.md)).

- Runs: `node tools/release/ship.mjs`
- Usage: `npm run ship -- <checks|merge|main|tag|watch|verify|chain|preflight-stable> …`

<a name="upgrade-check"></a>

#### `npm run upgrade-check`

A game made on an older release moved to this one as a team would (4.0): created with the older package, verified, a save made in it, then this package installed, migrated, upgraded and played with that save. CI runs it.

- Runs: `node scripts/upgrade-check.mjs`
- Usage: `npm run upgrade-check -- --from=<version|previous|engine tarball>`

<a name="studio-and-mcp"></a>

### Studio, Studio Server and MCP

The Studio's static demo, the hosted Studio's server and worker, and the MCP server for an AI assistant.

<a name="build-studio-demo"></a>

#### `npm run build:studio-demo`

The Studio's static build in demo mode (`STUDIO=1 VITE_STUDIO_DEMO=1 vite build`), with its snapshot of the current game ([studio.demo-mode](studio.demo-mode.md)).

- Runs: `tsx tools/select-game.ts && cross-env STUDIO=1 VITE_STUDIO_DEMO=1 vite build`

<a name="mcp"></a>

#### `npm run mcp`

The MCP server of the current game on stdio, for an AI assistant (`-s` keeps npm's banner off the protocol's stdout); with `--server <url>`, the tools of a hosted Studio through its API, with the CLI's token (`studio-server login --server <url>` first, 4.2.3). [studio.mcp-setup](studio.mcp-setup.md), [studio.mcp-tools](studio.mcp-tools.md).

- Runs: `tsx tools/mcp/server.ts`
- Usage: `npm run -s mcp [-- --server <url>]`

<a name="studio-apply"></a>

#### `npm run studio-apply`

Applies a patch downloaded from the Studio demo ("Download patch") to the current game through the Studio core: the same writes the dev-server Studio would have made (texts, layouts, `storyboard.json`, notes).

- Runs: `tsx studio-server/src/ops/apply.ts`
- Usage: `npm run studio-apply <patch.json>`

<a name="studio-client"></a>

#### `npm run studio-client`

The Studio's page the Studio Server serves (4.2.1): `studio.html` and its code alone, built into `.cache/studio-client` (`STUDIO_CLIENT=1 VITE_STUDIO_HOSTED=1`).

- Runs: `cross-env STUDIO_CLIENT=1 VITE_STUDIO_HOSTED=1 vite build`

<a name="studio-server"></a>

#### `npm run studio-server`

The Studio Server, a Studio online for a team (4.2.1; [reference.cli](reference.cli.md) lists its commands); `backup --to-bucket [--keep n]` writes the backup to the instance's bucket (4.2.3).

- Runs: `tsx studio-server/src/server/main.ts`
- Usage: `npm run studio-server -- <serve|import|export|invite|worker-keys|login|token|deps|backup|restore|replay|gc> …`

<a name="studio-snapshot"></a>

#### `npm run studio-snapshot`

The demo's snapshot alone: everything the Studio reads from the dev server for the current game, in one JSON file (default `public/studio-demo/snapshot.json`).

- Runs: `tsx tools/studio/snapshot.ts`
- Usage: `npm run studio-snapshot [-- <out.json>]`

<a name="studio-worker"></a>

#### `npm run studio-worker`

The Studio Server's processing worker, holding no secret of the platform (ADR 0028); `WORKER_PUBLIC_KEY` and `WORKER_INSTANCE` are required.

- Runs: `tsx studio-server/src/worker/main.ts`

<a name="reality"></a>

### Reality Bridge, connectors and speedrun

The world outside the game (signals, connectors) and the speedrun tools.

<a name="bridge"></a>

#### `npm run bridge`

The Reality Bridge's command line for the current game: `init`, `serve` (`--tenants=a,b`, `--store=`, `--trust-proxy=<list>`, `--tenant-header`), `grant`, `rotate`, `revoke`, `doctor`, `compact`; since 4.1.10 `migrate --from=jsonl --to=sqlite` and `migrate --schema=N`, `tenant export|delete`, `backup --out=`, `restore --from= --mode=merge|replace-store [--lock-timeout=<ms>]` (4.1.20: the mode always said, the store held alone under a maintenance lease). [bridge.cli](bridge.cli.md).

- Runs: `tsx tools/bridge.ts`
- Usage: `npm run bridge -- <init|serve|grant|rotate|revoke|doctor|compact|migrate|tenant|backup|restore> …`

<a name="bridge-load"></a>

#### `npm run bridge:load`

The Bridge under load (4.1.10): three `serve` processes on one store (SQLite, or Postgres with `--store` or `BRIDGE_STORE`; an empty value is no value), the report naming the backend actually opened and the commit, checked by `npx tsx tools/load-report.ts <report> --store=<kind>` (4.1.17); throughput and latency p50/p95/p99, the journal and the streams checked afterwards (exit 1 on a lost, doubled or out-of-order signal). The nightly runs it on both stores.

- Runs: `tsx tools/bridge-load.ts`
- Usage: `npm run bridge:load [-- --store=sqlite|postgres://… --instances=3 --players=1000 --proposals=50000 --concurrency=64 --streams=50 --out=<file>]`

<a name="connector"></a>

#### `npm run connector`

One connector of the world outside, as its own process, from the repository's sources (4.1.9): health and metrics on a local port, SIGTERM drains and exits 0; the package's command is `quest-n-click-connector` ([bridge.connectors](bridge.connectors.md)).

- Runs: `node connectors/bin.mjs`
- Usage: `npm run connector -- <email|telnet|ssh|open-badge> --config <file.json>`

<a name="fuzz-connectors"></a>

#### `npm run fuzz:connectors`

The connectors' parsers under seeded mutations of their corpus, no network: every input answered, no crash, RSS before and after (4.1.9; nightly a minute per connector, CI half a minute).

- Runs: `tsx tools/fuzz-connectors.ts`
- Usage: `npm run fuzz:connectors [-- --connector=email|telnet|ssh|open-badge|all --cases=10000 --seconds=60 --seed=1 --json]`

<a name="reality-spike"></a>

#### `npm run reality:spike`

A load probe of the Bridge's cryptography (4.1.1): Ed25519 in WebCrypto (Node, Chromium, WebKit), a compact JWS verified on its exact bytes, the gzipped size of that verifier, Biscuit create, attenuate and authorise times; a Markdown table.

- Runs: `node scripts/reality-spike.mjs`

<a name="reality-xcheck"></a>

#### `npm run reality:xcheck`

The Rust cross-check of the protocol (4.1.1): Biscuit's official samples through the JavaScript implementation the Bridge runs and through the Rust crate (`bridge/xcheck`, when cargo is there); `--require-rust` fails without it, as CI and release-check do.

- Runs: `tsx tools/reality-xcheck.ts`
- Usage: `npm run reality:xcheck [-- --require-rust]`

<a name="runs-load"></a>

#### `npm run runs:load`

The speedrun leaderboard at size (4.1.17): a store of the Bridge's schema filled with `--runs` verified runs on one board (and as many on another), the board read `--reads` times; p50/p95 latency, resident memory and the SQL plan (`EXPLAIN QUERY PLAN` / `EXPLAIN`) reported with the backend and the commit; a bound passed exits 1. The candidate and the nightly run it on both stores (2 000 ms p95, 512 MB).

- Runs: `tsx tools/runs-load.ts`
- Usage: `npm run runs:load [-- --store=sqlite|postgres://… --runs=100000 --players=5000 --reads=200 --max-p95-ms=<ms> --max-rss-mb=<MB> --out=<file>]`

<a name="speedrun-livesplit"></a>

#### `npm run speedrun:livesplit`

LiveSplit (4.1.14, D23): `export` writes a `.lss` splits file from a run (its category, splits and in-game times as the personal best); `serve` is the autosplitter, driving LiveSplit through LiveSplit's own local WebSocket server from the events the game posts (`?speedrunTool=7778`).

- Runs: `node tools/speedrun/livesplit.mjs`
- Usage: `npm run speedrun:livesplit -- export <run.wsrun> [--names=A,B,…] [--out=<file.lss>] | serve [--port=7778] [--origin=<url>] [--livesplit=ws://127.0.0.1:16834/livesplit]`

<a name="speedrun-overlay"></a>

#### `npm run speedrun:overlay`

An OBS Browser Source (4.1.14, D23): http://127.0.0.1:7777/?mode=full, `compact` or `transparent`, by Server-Sent Events, 127.0.0.1 only; the game posts its run's events with `?speedrunTool=<port>`, nothing else, and only from its origin (the dev server and the preview by default).

- Runs: `node tools/speedrun/overlay.mjs`
- Usage: `npm run speedrun:overlay [-- --port=7777 --origin=<url>]`

<a name="speedrun-verify"></a>

#### `npm run speedrun:verify`

A speedrun's `.wsrun` replayed against the current game (`GAME=<id>`): one verdict, its code, its reason and the trust it grants (ADR 0017); exit 0 for `valid` and `valid-unranked`, 1 otherwise (`inconclusive` included). The CLI's `quest-n-click speedrun verify` and the MCP tool `speedrun_verify` run it. `npx tsx tools/speedrun/reference-run.ts` re-records the committed reference run (after `npm version` or a change of the reference chapter's logic).

- Runs: `tsx tools/speedrun/verify.ts`
- Usage: `npm run speedrun:verify -- <run.wsrun> [--keys=<file> --json --timeout=<ms>]`

<a name="other-scripts"></a>

### Documentation, changes and CI

The tools that keep the documentation, the CHANGELOG and CI's plan true to the code.

<a name="changes"></a>

#### `npm run changes`

The CHANGELOG and LOG fragments of a branch (`changes/<slug>.md`, `<slug>.log.md`): `--check` fails a pull request that changes the code without one (CI's check job); `--assemble` folds them into CHANGELOG.md and docs/dev/LOG.md in the order they reached main.

- Runs: `tsx tools/changes.ts`
- Usage: `npm run changes -- --check [--base=origin/main] | --assemble [--date=YYYY-MM-DD]`

<a name="ci-plan"></a>

#### `npm run ci:plan`

Which of CI's heavier jobs a change needs (4.1.9, `tools/ci-plan.ts`): each changed file classified by the first rule that matches, one line of JSON (a boolean per gate: node24, e2e, reference, reality, pwaFirefox, windows, secondGame, freshInstall, upgrade, auditDeps), and since 4.5.0 `docs` with `docsPages`, the wiki pages whose `sources` the change touches; the workflow, the plan, a shared configuration, the engine's core and a path no rule knows run everything; read-only.

- Runs: `tsx tools/ci-plan.ts`
- Usage: `npm run ci:plan [-- --base=origin/main | --files=a,b | --all]`

<a name="docs-links"></a>

#### `npm run docs:links`

Every external link of the docs asked once (HEAD, then GET), statuses by domain, exit 1 on one not 2xx or 3xx; a person runs it before a release, CI never does (the network is not a test).

- Runs: `node scripts/check-links.mjs`
- Usage: `npm run docs:links [-- --timeout=10000]`

<a name="docs-screenshots"></a>

#### `npm run docs:screenshots`

The README's images from the real production bundle and the real Studio (Playwright, then Pillow): WebP files in `docs/img/readme/`, at most 1440 px wide, named for the release that took them; `--keep-png` keeps the raw captures in `.cache/docs-shots`.

- Runs: `node scripts/docs-screenshots.mjs`
- Usage: `npm run docs:screenshots [-- --only=game|studio --keep-png]`

<a name="docs-truth"></a>

#### `npm run docs:truth`

What the docs state against the code (4.1.16): the save and `.wsrun` schemas, every npm script and `tools/` or `scripts/` file they cite, the capabilities they call mounted, no release link newer than the version; exit 1 with each contradiction named. CI's check job.

- Runs: `tsx tools/docs-truth.ts`

<a name="wiki"></a>

#### `npm run wiki`

The documentation's source in `wiki/` (4.5.0, `tools/wiki.ts`): `check` validates the manifest (`wiki/manifest.json`: ids, URLs `EN-<Domain>-<Topic>` / `FR-<Domaine>-<Sujet>`, states, sources, questions), the pages, their links, sections and generated parts, and fails on errors only (links to planned pages are listed); `stats` counts the pages by state, domain, type and language; `build --target wiki` writes the folder published to the GitHub wiki (`Home.md`, a sidebar per language, the footer, the `ready` pages under their URL, `--preview` adding the drafts under a banner, the four indexes), into a folder outside the working tree (or under `.cache/`) that it empties only when it built it; `env` and `generate` rewrite the generated reference pages from the code; the other commands bundle, archive and publish ([contribute.writing-docs](contribute.writing-docs.md)).

- Runs: `tsx tools/wiki.ts`
- Usage: `npm run wiki -- check | stats [--json] | coverage … | build --target wiki --out <dir> [--preview] | bundle … | archive … | publish … | pages … | env | generate [<page>…] | acceptance …`

<a name="project"></a>

## Scripts of a created project

Written by `quest-n-click create` (or `npm init @quest-n-click`) into the new project's `package.json`. Run them from the project's folder, after `npm install`: each calls the `quest-n-click` command of the installed engine.

<a name="project-dev"></a>

#### `npm run dev`

`quest-n-click dev`: the game in the browser on Vite's dev server, reloading as you edit; `?edit=<room>` opens the placement editor.

- Runs: `quest-n-click dev`

<a name="project-studio"></a>

#### `npm run studio`

`quest-n-click studio`: the Studio (rooms, dialogues, the puzzle graph, the mixer), opened at `/__studio/`.

- Runs: `quest-n-click studio`

<a name="project-assets"></a>

#### `npm run assets`

`quest-n-click assets`: `game/art` and `game/audio` into `public/assets` (Python 3 with Pillow).

- Runs: `quest-n-click assets`

<a name="project-verify"></a>

#### `npm run verify`

`quest-n-click verify`: validate, solve, i18n status, lint, playtests: the content checked, the solver finds the end.

- Runs: `quest-n-click verify`

<a name="project-build"></a>

#### `npm run build`

`quest-n-click build`: assets, verify, the production build in `dist/`, every file of it accounted for, licences inside.

- Runs: `quest-n-click build`

<a name="project-release"></a>

#### `npm run release`

`quest-n-click release`: build, then the release gates (validate and weight `--release`, i18n status, voices check `--release`, strict playtests, the exhaustive proof, `solve-reality`); `--commercial`: no exception, no placeholder. The template's art is a placeholder: a release refuses it until each file is replaced and reviewed (`npx quest-n-click provenance --lock`).

- Runs: `quest-n-click release`
- Usage: `npm run release [-- --commercial]`

<a name="project-preview"></a>

#### `npm run preview`

`quest-n-click preview`: serves `dist/` on 127.0.0.1.

- Runs: `quest-n-click preview`

<a name="project-quest-n-click"></a>

#### `npm run quest-n-click`

The engine's command itself, for every other command (`doctor`, `validate`, `solve`, `lint`, `migrate`…): `npm run quest-n-click -- help` lists them ([reference.cli](reference.cli.md#quest-n-click)).

- Runs: `quest-n-click`
- Usage: `npm run quest-n-click -- <command> [options]`

<!-- generated:end -->
