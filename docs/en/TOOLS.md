# Engine tools

All commands are run from the project root.

## Choosing the game (`GAME`)

The repo can hold several games, each in `games/<id>/`. The current game is, in order:

1. the `GAME` environment variable (`GAME=demo npm run dev`);
2. else `package.json` → `"config": { "game": "demo" }`;
3. else `demo`.

The rule is coded once, in `tools/game.ts`, and read by `vite.config.ts` (the `@game` alias → `games/<GAME>/index.ts`,
the editor's layouts written to `games/<GAME>/layout/`), `tools/validate.ts`, `tools/solve.ts`, `tools/refs.ts`; `tools/assets.py` does the same reading in Python.

`tsconfig.json` cannot read an environment variable: its `@game` and `@game/*` paths look in `.cache/game`, a symbolic link that
`npm run game` (`tools/select-game.ts`) points at the current game, with `games/demo` as the fallback when no link exists yet (4.1.6; until
4.1.5 it rewrote `tsconfig.json`, a tracked file, on every `dev` and `build`). `npm run dev`, `npm run check` and `npm run build` run it first; `GAME=<id> npm run game` and `npm run new-game`
switch the game, and the tools read the link when `GAME` is not set. Vite and Vitest don't need it: they resolve the alias in `vite.config.ts`.

Tests don't depend on the current game: the engine's tests run on `tests/fixture/` (a tiny game), a game's own tests import
its files directly (`tests/demo.test.ts`, `tests/walkthrough.test.ts`).

## Playing and debugging

```bash
npm run dev        # loopback-only dev server
npm run dev:lan    # explicit LAN mode for a phone; prints a one-session capability-token URL
npm run studio     # loopback-only Studio
npm run studio:lan # token-protected Studio on the LAN
```

URL parameters, dev server only (they are ignored in the production build):

| URL | Effect |
|---|---|
| `/` | The normal game: title screen, New Game / Continue. |
| `/?dev` | Starts on the first checkpoint, with the debug layer and the DEV panel. |
| `/?dev&at=<checkpoint>` | Starts on this checkpoint (defined in the game's `checkpoints`). |
| `/?edit=<room>` | The room's placement editor. |
| `/?edit=<room>&at=<checkpoint>` | Same thing, in that checkpoint's state (useful to place a prop in a given state). |

### The layer and the DEV panel (`?dev`)

- **Layer**, drawn over the scene:
  - clickable zones in blue, props in purple, characters in green;
  - the walkable zone in green, holes (furniture) in red;
  - depth-scale lines in orange, entry points in pink;
  - approach points: filled if set in the layout, hollow if computed.
- **Show or hide the layer**: the **D** key, or the **DEV** button in the bottom left (on a phone).
- **Panel**:
  - current room and "busy" state (a script is running);
  - **Checkpoints**: load a ready state, or start a New Game;
  - **Rooms**: go to any room, without playing its arrival script;
  - **Bag**: check or uncheck an item;
  - **Flags**: edit existing flags, or set a flag name / value (`true`, `false`, a number or text);
  - **Map**: unlock a place, or **Unlock all**;
  - **World**: the room of each moving character (change it to `moveActor` them);
  - **Scripts**: the position of each script in scope (`next command / length`, done, stopped), with a stop / restart button;
  - **Journal**: the last ten entries of the engine's journal (what answered, events, script steps, moves, switches; the Studio's Play tab shows it whole), and **Export session**: the inputs since the game started, with the session's semantic journal, for `npm run replay`;
  - **Semantic journal** (4.1.11): the last twelve events the core numbered in this session (room entered, item acquired or lost, flag changed, ending, load, save), refreshed with the panel;
  - **Edit this room**: opens the editor on the room shown.

### The placement editor (`?edit=<room>`)

On start, the editor loads the first checkpoint located in that room. If there is none, it starts from a fresh state, without playing an arrival script. All coordinates are logical (640 × 400).

| Gesture | Effect |
|---|---|
| Drag a zone | Move it, with its approach point. |
| Drag a corner | Resize the zone. |
| Drag a foot point (circle) | Move a prop or a character, with its approach point. |
| Drag the square above the foot, or scroll | Set the height. |
| Drag a small circle (filled or hollow) | Place the approach point: where the hero goes before acting. |
| Drag a vertex of the walkable zone or a hole | Move it. |
| Double-click an edge of the walkable zone | Add a vertex. |
| Alt-click a vertex | Delete it. On a hole reduced to 3 vertices, deletes the hole. |
| Drag an orange depth-scale line | Change its depth (y). The scale factor is set in the panel. |
| Drag a pink triangle | Move an entry point. |

The editor's panel holds:

- **Save the layout**: writes `games/<GAME>/layout/<room>.json`, coordinates rounded to the unit. The page then reloads with the saved file.
- **Reload (undo)**: discards unsaved changes.
- **hidden zones**: also shows zones and props whose visibility condition is false (dashed).
- **Selection**: the touched element and its values.
- **To place**: one button per hotspot, prop or actor defined in the room but missing from the layout. It creates it at the center, ready to be moved.
- **Walkable zone**: create the zone, add a hole.
- **Depth scale**: create the scale, set the back and front factors.
- **Entries**: add an entry point by name (`default` is the one used by default).
- **Room width**: the logical width of a wide room (640 = no scrolling) and a camera slider to look around while placing.

For a prop with a per-state position (`states` in the layout, e.g. a pulled-out stool), the editor edits the variant of the state shown.

Inside the Studio (`/__studio/`, see STUDIO.md) the editor runs in an iframe and talks to the parent page with
`postMessage` (same origin only). It sends `{ source: 'web-scumm-editor', room, type }` messages: `ready` (with
`missing`, the entities that have no place yet), `select` (`key` such as `prop:lamp`, `hs:door`, `actor:grandma`, plus
`kind` and `id` for those three), `dirty` (unsaved changes) and `saved` (`ok`, `error`). It accepts
`{ source: 'web-scumm-studio', type }` messages: `select` (`kind`, `id`), `create` (gives a place to an entity the
room declares but the layout lacks, optionally at `at`) and `save`. In an iframe its panel starts folded.

## Preparing images and sounds

Before `npm run assets`, a generated sheet is cut into keyed sprites with `tools/cut-sheet.py <sheet.png> <sheet-id>`
(and the tools `tools/talk-kit.py`, `tools/talk-apply.py`, `tools/talk-normalize.py` for talking mouths):
see `docs/en/PROMPTS.md`. The prompts themselves come from `npm run prompts` (`--missing` for the sheets not cut yet),
which writes `games/<id>/prompts.md`. With `"artStyle": "pixel"` in `site.json` (or `--pixel`), the cutter also
scales each cell down 4× (`--scale`), limits it to 32 exact colours (`--colors`) and writes indexed PNGs; `npm run
assets` then writes lossless WebP (see PROMPTS.md, "Art style"). A sheet on a transparent background
(`"sheetBackground": "transparent"`) is cut on its alpha, nothing keyed by colour. Two small scripts choose that
background (PROMPTS.md, "Choosing the sheet background"): `python3 tools/check-alpha.py <image.png>` says whether an
image tool writes real alpha (`TRANSPARENT`, `FAKE CHECKERBOARD` or `OPAQUE`), and `python3 tools/pick-bg.py <sheet |
sprite folder | image> [...]` ranks the flat colours by their distance to the drawing (`BEST #RRGGBB`).

```bash
npm run prompts    # one ready-to-paste prompt per sheet + the cut commands → games/<id>/prompts.md
npm run assets     # prepares in public/assets/ the images and sounds cited by the content
```

`tools/refs.ts` lists the images and sounds cited by the content (rooms, characters, items, the map, minigame parameters, `skin`,
the title and credits screens, `ending.scratch`, and `index.ts`'s `extraImages`), then `tools/assets.py` prepares them.
The command writes `games/<GAME>/assets.gen.json` and only reprocesses what changed.

A game's default sources:

| What | Source | Output |
|---|---|---|
| image `sheet/cell` | `games/<id>/art/sheet/cell.png` | `public/assets/img/sheet/cell.webp` (cropped, 420 px at most) |
| decor `decor/<name>` | `games/<id>/art/decor/<name>.png` | `public/assets/img/decor/<name>.webp` (1280 × 800) |
| video | `games/<id>/art/decor/<name>.mp4` | `public/assets/video/<name>.mp4` (720p, muted) |
| music, sfx | `games/<id>/audio/music/<file>`, `games/<id>/audio/sfx/<file>` | `public/assets/audio/{music,sfx}/<file>` |

`games/<id>/sources.json` replaces these patterns (`{id}`, `{name}`, `{file}`). A pattern can be a list of candidates tried in order;
an audio pattern can set its bitrate (`{ "path": …, "rate": "64k" }`). A requested `.mp3` can come from an `.ogg` of the same name;
a sound with no source but already present in `public/assets` is kept as is. `overrides` handles one image apart:

```json
{
  "images": "private/extract/{id}.png",
  "decors": "private/asset/decor_{name}.png",
  "video": "private/asset/decor_{name}.mp4",
  "music": [{ "path": "private/audio/rendered/{file}", "rate": "64k" }, "private/audio/{file}"],
  "sfx": ["private/audio/sfx/{file}", "private/audio/sfx/densif/{file}", "private/audio/{file}"],
  "overrides": {
    "decor/france_map": [
      { "src": "private/asset/decor_france_map.png", "keyed": true, "fit": 1100, "quality": 85 },
      { "src": "private/asset/decor_map.png", "crop": [75, 590, 400, 880], "size": [1100, 982] }
    ],
    "decor/souk_chase": { "src": "private/asset/decor_souk_chase.png", "height": 800 }
  }
}
```

An override's options: `keyed` (a flat background connected to the border made transparent, then bounded to `fit` px at most), `crop` [x0, y0, x1, y1], `size` [w, h],
`height` (proportional width), `quality`. This is the sample game's `sources.json`, whose sources stay in `private/`.

## Checking the content

```bash
npm run validate   # broken references, empty or too-long text, missing Look lines, flags never set or never read
npm run solve      # fast witness: finds one path to the ending
npm run solve -- --prove # exhaustive reachable-state proof: reports states with no path to the ending
npm run solve -- --from=<checkpoint> --max=50000
npm run solve -- --prove --workers=4 [--batch=64] [--time=60]   # proof workers (3.5): the same result for any number of workers; a large proof ×2.5 with 4 (BENCH.md "3.5")
npm run solve -- --prove --ownership=off   # without the canonical owner (who holds a free item, pooled in proofs since 3.5)
npm run solve -- --dominance             # a witness with dominance (3.5; prunes nothing on the bundled games, BENCH.md)
npm run solve -- --prove --profile       # the profile, with the explosion profile (4.1.13): states attributed to positions, inventories, flags, dialogues, scripts; symmetries, no-ops, permutations
npm run solve -- --prove --checkpoint=p.ckpt [--checkpoint-every=300] [--resume]   # the proof written down as it goes (4.1.13), and taken up again with --resume: the same verdict and witness; a finished proof removes the file
npm run solve -- --prove --mem=3500      # stop as `truncated` once the heap passes 3 500 MB (4.1.13), never a proof
npm run solve -- --prove --symmetry      # fold symmetric items, two items the game treats alike (4.1.13, off by default; SOLVER.md)
npm run solve -- --prove --representation=objects   # the 4.1.8 storage of the states (the reference of the differential tests; compact by default, 4.1.13)
npm run prove:matrix [-- --only=c11,o21 --time=600 --mem=4096 --json=m.json --profile=docs/dev/PROOF-PROFILE.md]   # the proof matrix (4.1.13, docs/dev/PROOF-MATRIX.md): twelve three-character games under the published budgets; exit 1 on a false verdict; nightly only
npm test           # Node engine/tool tests and the selected game's tests (the heavy solver tests excluded, 4.1.3)
npm run test:heavy # the CPU-bound solver tests (abstraction audits, canonical owner, memo and ownership proofs, the reference chapter's proof): nightly, minutes each
npm run test:coverage   # the suite under V8 coverage, against the floors of vite.config.ts; then `npx tsx tools/coverage-ratchet.ts --strict` fails on a floor at least three points behind what the tests reach (CI on main and tags, release-check, 4.1.8; on a pull request it warns, 4.1.9)
npm run quality:baseline -- --check [--dist]   # the behaviour of 4.0.0 kept (4.1.0): witnesses, proofs, golden saves, public surface, first visit (tests/quality-baseline.json; without --check: write it, and the READMEs' three figures with it: a new test or a lighter bundle means running it, 4.1.8)
npm run test:assets # Python-backed image and asset-pipeline tests
npm run e2e        # a playthrough in Chromium, phone landscape (dev server already running)
```

`validate` and `solve` exit with code 1 for a blocking problem. `solve` exits 2 when its state budget is exhausted:
that is `truncated`, never a proof. `npm run build` requires a winning witness; `npm run prove:game` is the explicit
exhaustive softlock gate, and `npm run release-check` includes it.

```bash
npm run solve -- --chapters        # one bounded search per checkpoint with `goals`, then from the last one to the ending
npm run solve -- --goal=100%       # the search's goal is every objective that is not optional (GameDef.objectives, 4.1.12) instead of the ending; exit 2 for a game that declares none
npm run solve -- --prove --chapters   # the proof by chapters: each chapter proved from EVERY reachable boundary state of the previous one; a checkpoint that matches none is an error
npm run validate -- --report       # the content profiler: rooms, items, characters, what is thin (Markdown)
npm run page:world                 # the map of the world as a page (exits, gotos, unreachable rooms, DOT source)
npm run page:puzzles               # the puzzle graph as a page: what every rule needs and changes, a card per item / flag
npm run bench -- --matrix [--eras] [--max=20000]   # the 3.3 reference table (--eras: characters confined to eras, the reference game): the proof on 20/40 rooms × 1/2/3 characters, where the time goes (BENCH.md)
npm run bench -- --rooms=40 [--prove --v3]   # a generated game of that size, every tool timed on it; --prove adds the exhaustive proof, --v3 generates it with stable ids (docs/en/BENCH.md)
npm run i18n -- extract [--lang xx]   # translation tables (games/<id>/locales/<xx>.json); `status` for the coverage
npm run solve -- --audit-abstractions   # the proof with the abstractions against the explicit search, every memo hit run anyway: 0 same, 1 diverged, 2 the explicit search did not fit --max (BENCH.md "3.3.1")
npm run audit:corpus -- --seeds=500     # the same on random games (plain, free items, three characters), every night in CI (3.6): exit 1 on a divergence
npm run audit:corpus -- --from=126 --seeds=125 --json=s.json   # one shard: tried, compared, partial, diverged per kind (3.6.1)
npm run audit:corpus -- --shard=1/4 --total=500 --json=s1.json  # shard 1 of 4 over seeds 1–500, split evenly (3.7.1)
npm run audit:corpus -- --merge s0.json s1.json … --total=500   # shards added up; fails on a seed missed or run twice (3.7.1)
npm run solve -- --profile         # what the states are made of, what the search cost, what each abstraction did (docs/en/BENCH.md)
npm run solve -- --por=stubborn    # partial-order reduction: commuting actions one at a time (fewer states, same proof)
npm run replay -- session.json     # plays a session file on the real engine, prints the journal, the semantic journal (4.1.11) and the final state; exit 1 when the replay diverges or its semantic journal differs from the file's
npm run ids [-- --write --map]     # stable ids (schema 3) written into the sources, locales renamed, the save migration step (docs/en/UPGRADING.md)
npm run ids -- --lines [--write --map]   # an id on every say / toast / guide object, list line, hint and kind reaction (--lines=all: plain strings too, required for a translated or voiced release): translations and voices keyed by it (UPGRADING §9, §10)
npm run i18n -- voices             # the lines with an id and no voice clip, the clips no line claims
npm run voices -- status [--lang xx]                 # per language: lines with an id by status (draft, record, recorded, approved), clips, orphans
npm run voices -- export --lang xx [--json] > t.csv  # the table for the actors: id, who, the text in that language, status, file, actor, note
npm run voices -- import t.csv --lang xx             # their statuses, actors and notes back into games/<id>/voices.json (unknown lines refused)
npm run voices -- check [--lang xx] [--release]      # every clip measured with ffmpeg: codec, rate, length for its text, loudness (≈ −16 LUFS), peak; --release: an approved line needs its clip
npm run validate -- --release      # also: provenance, placeholders, and a stable id on every line of a game shipped in another language than its own or voiced
npm run verify:release             # validate --release + weight --release + i18n status + strict playtests: a step of release-check
npm run verify:commercial          # verify:release, then no exception, no placeholder, no NC/ND licence, every source checkable, then verify:dist
npm run verify:dist                # every file of dist/ accounted for: code, locked assets (their reviewed bytes), named data, fonts, icons, licenses/ (3.7.1)
npm run provenance [-- --lock]     # the shipped assets by licence, what changed since the reviewed lock; --lock records the files after a review
npm run weight [-- --release --json --stems]   # what a phone downloads before the first room, per room and per chapter, against assetBudgets (the single mixes; the scores' stems on their own line, --stems counts them)
npm run playtests [-- --strict --out=.cache/playtests]  # the sessions players shared (games/<id>/playtests) replayed and summed up: time per room, stalls, hints, heat map
npm run playtests -- --strict --require=5 --require-completed=3 --require-devices=2   # field quotas (3.7.1): --strict alone asks for no number of sessions
npm run field:init -- --release=<x.y.z> --candidate=<run id>   # the Field Kit (4.1.18, FIELD): the thirteen passes as JSON reports at not-run, bound to that candidate run
npm run field:check -- --dir=<folder> [--require=<id,…>]   # each report against its candidate (commit, run, digests), its evidence's SHA-256 and the leak scan
npm run field:report -- --dir=<folder> --out=docs/dev/passes/<x.y.z>.md   # the people's passes table generated from the reports
npm run field:bundle -- --report=<report.json> --out=<bundle.tar.gz>   # the report and its listed evidence, logs redacted, refused on a key or a token
npm run field:verify-bundle -- <bundle.tar.gz> [--offline --trusted-root=<file>]   # 4.1.19: integrity, the candidate, then who made its manifest (its attestation, or the run)
npm run field:carry -- --from=<folder> --to=<folder> --pass=<id>   # 4.1.20 (ADR 0024): a pass carried to a new candidate when no file of its surface changed (the version included): a pending attestation the maintainer approves in a signed commit; --check-range=<a..b> refuses a range that changes the trust root and an attestation
npm run verify:field               # verify:commercial, then those quotas: what a release tested by players needs (not a step of release-check, D12)
npm run e2e:perf -- <url> [--renderer=canvas|dom --cpu=4 --min=30 --room=<id>]   # frames per second while the hero walks, CPU slowed (the phone stand-in)
npm run e2e:music -- <url> [--only=offline|live|game --live=chromium|webkit]   # the music director: 30 min offline without drift, 100 changes without a click, real-time jitter, the theme's stems in the game
npm run e2e:music -- <url> --only=reference [--browser=webkit]   # GAME=reference: two scores, bridges, a restore and a stop mid-transition, the decoded peak (Chromium and WebKit, 3.8)
npm run e2e -- <url> --renderer canvas  # the whole game drawn by the Canvas painter
npm run e2e:visual -- <url> [--update] # every room, still, against tests/visual/<game>/*.png (0.5% of the pixels at most)
npm run e2e -- <url> --lang fr           # the whole game in that language; fails on any visible English default of the engine
npm run e2e:a11y -- <url> [--only=axe,keys,storage] [--allow-skip]   # axe on the conversation, map, slots, confirmations, every minigame; every minigame won at the keyboard; an older save upgraded (E2E_BROWSER=chromium|webkit; exit 3: a check the browser cannot automate)
npm run docs:screenshots [-- --only=game|studio --keep-png]   # the README images from the production bundle and the Studio, as WebP in docs/img/ (needs Python with Pillow)
npm run changes -- --check [--base=origin/main] | --assemble [--date=YYYY-MM-DD]   # the CHANGELOG and LOG fragments of a branch (changes/<slug>.md, <slug>.log.md): --check fails a pull request that changes the code without one (CI's check job), --assemble folds them into CHANGELOG.md and docs/dev/LOG.md in the order they reached main (changes/README.md)
npm run docs:links [-- --timeout=10000]                       # every external link of the docs asked once, statuses by domain; a person runs it before a release, CI never does (the network is not a test)
npm run docs:truth                                             # what the docs state against the code (4.1.16): the save and .wsrun schemas, every npm script and tools/ or scripts/ file they cite, the capabilities they call mounted, no release link newer than the version; CI's check job
npm run ci:plan [-- --base=origin/main | --files=a,b | --all]   # which of CI's heavier jobs a change needs (4.1.9, tools/ci-plan.ts): each changed file classified by the first rule that matches, one line of JSON (a boolean per gate: node24, e2e, reference, reality, pwaFirefox, windows, secondGame, freshInstall, upgrade, auditDeps); the workflow, the plan, a shared configuration, the engine's core and a path no rule knows run everything; read-only
npx tsx tools/api-doc.ts [--check]                            # the public API's signatures and stability (@public | @extension, 4.1.8) into docs/en/API.md and docs/fr/API.md; tests/api-doc.test.ts fails when a page is behind or an export has no description or stability
npx tsx tools/dsl-doc.ts [--check]                            # the DSL's reference (every condition, command, objective field and how each field counts for the IR) generated from the schemas into docs/en/DSL.md and docs/fr/DSL.md (4.1.12); tests/dsl-doc.test.ts fails when a page is behind
npm run lint [-- --prove | --static | --json]   # content lint: conditions nothing can satisfy, hidden rules, red herrings, stuck hints, actions never run (alias of lint:content since 4.1.0)
npm run quality   # engine code (4.1.0): Biome formatting and lint, tsconfig.json and tsconfig.strictest.json, then the content lint
npm run doctor [-- --release]      # checks Node, Python modules, ffmpeg and Playwright browsers; --release (4.1.8) requires Python, its modules and ffmpeg, as release-check does, and Chromium as always (release-check opens no browser: Firefox and WebKit stay optional)
npm run check                      # type-check and Node tests
npm run tsc -- …                   # the TypeScript 7 compiler itself (4.1.8; the `tsc` bin link may belong to the tools' typescript6 package): `npm run check` and `quality` call it
npm run build:game                 # the game's gates (verify:game), the bundle, verify:dist, the spoiler check, the asset audit: no tsc, no unit suite (CI runs those once)
npm run verify:game                # validation, global/chapter witnesses and translation coverage
npm run prove:game                 # global/chapter exhaustive proof; fails on softlocks or truncation
npm run release-check              # what CI runs, in one go: doctor --release, quality, build, coverage and its strict ratchet, verify:release, proofs, the Rust cross-check, mutation of the core, the packages with `npm publish --dry-run`, the dependency audits
npm run release-check:ci           # the same without the mutation sets (4.1.10): release.yml runs them as two jobs beside it, core and reality, each gating the release
```

**Lint.** `npm run lint` says what `validate` cannot (it checks shapes and references) and what `solve` does not say
loudly (it answers "can it be finished"): from the puzzle graph, a condition nothing sets (`cond-never-true`, an
error), a rule another rule matches first (`rule-shadowed`), an item no rule needs (`item-red-herring`) or nothing
gives (`item-never-gained`), a hint that waits for something nothing sets (`hint-stuck`, an error) or shares its
`until` with an earlier hint (`hint-never-fires`), a dead topic, choice option or listener, a choice with one option,
an exit with a condition and no `locked` line, an action that only changes what nothing live reads (`action-dead`,
info), a target standing behind a walk link a condition closes whose rule does not check that condition
(`walk-link-gate`: the link stops the walk, never the action); after a solver run, a required signal's fallback the closed witness never plays (`fallback-unplayed`, a warning), a live action the witness never ran and a room it never entered (`rule-never-run`,
`room-never-reached`: info with the witness, warnings with a completed `--prove`; a truncated proof keeps them as
information and says so, it never calls anything unreachable), and a live action that ran without ever changing the
state (`rule-no-effect`, info: a topic that only talks, or a `set` already true). Reachability counts every try the
solver made, whether or not it changed the state. Each finding names its room and path (the one the Rooms tab shows),
its stable id, and what to do. Exit codes: 0 clean, 1 an error that is not ignored, 2 the search was truncated
(`--json` carries `status` and `truncated`). `lint: { ignore: ['code',
'code:<id>', 'code:<room>/<path>'] }` in `game.ts` keeps a red herring on purpose. The Studio's Check tab shows the
same list with links into Rooms; the `lint` MCP tool returns it as Markdown. `verify:game` runs it (so does the CI).

**Proof cache.** A solver run depends only on the engine's code, the game (content, layouts, custom commands, and
the game folder's sources) and the options: `npm run solve` (every mode), `--chapters` and `npm run lint` keep each
result in `.cache/proofs/` and give it back when none of that changed, saying so (`(from the proof cache, key …)`;
`cached` in `--json`). The build, `verify:game`, `prove:game` and `release-check` ask the same questions several
times; on the demo a warm proof takes 0.2 s instead of 2.4 s. `--no-cache` or `PROOF_CACHE=0` runs again;
`PROOF_CACHE_DIR` moves it; an engine error is never kept. Tests call the solver directly and never use it.

**One status.** A solver run and a proof by chapters carry one status, its exit code and its sentence
(`src/engine/tools/status.ts`): `npm run solve` prints the sentence and exits with the code, `--json` carries
`status`, `exit` and `headline`, the Studio's Check tab shows the sentence, the `solve` MCP tool returns all three.
None of them words its own verdict.

| Status | Exit | Meaning |
|---|---|---|
| `solved` | 0 | the ending (or a chapter's goal) is reached; with `--prove`, it stays reachable from every reachable state |
| `softlocks` | 1 | reachable states from which it can no longer be reached (`softlockCount`, `softlockCauses`) |
| `unsolved` | 1 | it is not reached from any state explored |
| `truncated` | 2 | the search stopped at `--max` states: nothing is proved |
| `broken` | 1 | an invariant is true on a reachable state (before 3.3: `solved` with exit 1) |
| `error` | 1 | the engine failed while exploring |
| `checkpoint_mismatch` | 1 | chapters only: every chapter proved, but a checkpoint is none of its reachable boundary states |

**Continuous integration.** Every push to `main`, `v3` or `v3-*` runs `npm run build` (checks, Node and Python tests,
`verify:game`, the bundle, the spoiler and asset audits), `npm run prove:game` on the sample game, `npm run audit:deps`,
then the production e2e in Chromium (the demo's own walkthrough) and WebKit (the generic replay), both gates, the
whole game at the keyboard (Chromium and WebKit) and the whole game in French (Chromium), all gates since 3.3.1. An e2e only passes when the solver's run is `solved` (its exit code, status and steps
are checked) and the engine itself reports the ending (`state.done`): a truncated or unsolved game is a failure, never
"the best path replayed anyway". `main` deploys to Pages. The weekly `prove` workflow (or `workflow_dispatch`) runs
the proof and the bench on a 100-room schema-3 game within a budget and uploads `bench.md`. A `v3.x` tag runs
`npm run release-check` and publishes the GitHub release with the matching `CHANGELOG.md` section
(`scripts/release-notes.mjs`). Dependabot proposes weekly npm and actions updates, monthly pip ones.

**Playtests.** On a phone, the pause menu's **Share session** sends the session as a file (Web Share, else a
download): ids and indices only, no text, no journal. Drop it in `games/<id>/playtests/` (committed; `npm run audit`
covers it). `npm run playtests` replays every file on the current content and sums them up: play time per room (gaps
over a minute are pauses), where players stall (the same action three times without effect), hints shown, minigames
played, where each player stopped, and a heat map keyed like the solver's (`--out` writes `report.md`, `report.json`,
`heat.svg`). A session the content has outgrown is reported as diverged; with `--strict` (the release gate:
`release-check` and the weekly `prove` workflow) it is an error, exit 1: re-record or delete it. `verify:game` runs it
without `--strict`, so the CI replays every committed playtest and a content change never blocks a push. The Studio's Check tab shows the same report and
lets the puzzle graph's heat come from the players; the `playtests` MCP tool returns the Markdown.

**Sessions.** The engine records every input since the game started or a save was loaded (actions, map, switches,
script steps) with the answers given on the way (choices, random draws). The game's save menu, the dev panel and the
Studio's Play tab export it as `<game>-session.json`; `npm run replay` plays it back without a display and exits 1 at
the first entry whose outcome differs from the recording (`--upTo=N` stops earlier, `--json` for scripts). A tester's
bug report is that file and a screenshot. The solver's solution is a session too (`npm run solve -- --json` gives
`steps`), which is what `npm run e2e` taps through.

`solve` also reports **invariants** (`GameDef.invariants`) that became true, with the path. The validator warns about
rooms nothing leads to and declared exits with no way back.
`validate` also checks each minigame's required parameters (`required`), the images cited in their `params`,
every `skin` id (manifest images, `audio` sounds) and `ending.scratch`.
`games/demo/e2e.mjs` is the example of a game-specific `npm run e2e` script: it starts from the title screen, plays the pipes and pick minigames and the sealed ending's scratch ticket for real instead of skipping them, then checks the final card.

## Asset provenance

`games/<id>/provenance.json` says where every shipped asset comes from: entries `{ match, source, licence, author?, url?,
prompt?, status: 'final' | 'placeholder', note? }`, where `match` covers asset keys with `*` (`img:<manifest image
id>`, `sfx:<file>`, `music:<file>`, `voice:<file>`, `video:<file>`). `npm run validate` checks a game that has the
file (every asset covered by exactly one entry: two entries matching the same asset are an error, whatever their
order; every entry complete); `npm run validate -- --release` requires the file, and a placeholder is an error unless
a `releaseExceptions: [{ match, reason }]` entry names that asset (an exception never covers a placeholder added
later). A release also needs a licence policy, `licences: { allow: ['CC BY 4.0', 'own work'] }` (any other licence
fails unless an exception names the asset), and `provenance.lock.json`: `npm run provenance -- --lock` writes, after a
review, each shipped file's SHA-256 and size with the claims its entry made (pattern, licence, status). `validate
--release` then fails on a file that changed, an asset shipped since, a missing file or an entry edited since the
review; a plain `validate` only warns. `npm run provenance` prints the assets by licence and what changed since the
lock (exit 1 when something needs a review). The files are read from `public/assets` (`ASSETS_DIR` for a fixture).
**Weight.** `npm run weight` adds up what a phone downloads, from the built files and the asset graph (ENGINE
"Assets"): before the first room is playable (the app shell the service worker precaches, read from `dist/sw.js`,
compressed as a static host sends it, with the files a first visit pays twice; the title, the column icons, the bag at
the start, the first room), per room (backdrop, props in every state and animation frame, every character who can
stand there with variants, mouths and portrait, its music, and what its commands play or show: effects, music changes,
voice clips, gained items' icons, phone callers, a minigame's images and sounds), and per chapter (every room a player
can be in during it, from the proof by chapters), with the decoded memory of the images (width × height × 4).
`assetBudgets: { initialKB, roomKB, chapterKB }` in `game.ts` are the limits; over one, or a file missing, exits 1.
They count each track's single mix, what every device plays. Since 3.6 the rest has budgets too:
- `backgroundScoreKB`: the scores' stems, downloaded after the room is playable where the director plays them;
- `offlineTotalKB`: everything the full warm-up stores, app shell included;
- `decodedAudioMB`: the largest score decoded in memory (its `pcmBytes`; unknown is over);
- `transitionPeakMB` (3.6.1, required with `audio.transitions`): the most decoded at once, the worst transition's two
  scores and its bridge, plus the largest stinger (`{ music: { stinger } }`). Bridges and stingers are measured with
  ffprobe; unmeasured is over. The director holds the runtime side: `audio.maxDecodedMB` caps every buffer it keeps,
  and a transition over it cuts without its bridge (docs/en/AUDIO.md).
- `initialJsKB` (3.9): the gzipped JavaScript a first visit runs (the entry and its static imports), measured on the
  build by `npm run verify:dist`, not by `weight`: the minigames, the dev panel and the Studio load on demand
  (`src/engine/BOUNDARIES.md`). The sample game runs 122 KB, the reference chapter 124 KB, both held to 140.
`--release` (a step of `verify:release`) also fails when a budget is not set. `--json`. `npm run e2e:weight -- <url>`
(a CI gate since 3.4) checks the prediction against a real first visit in Chromium, the warm-ups off: every request
inside the predicted initial scope, the bytes within 10% of it or below.
`npm run new-game` writes one for the art it borrows from the sample game (all placeholders, CC BY 4.0); the
sample game's file has no exception: every one of its assets is CC BY 4.0 since 3.7. `npm run verify:release` (validate `--release`,
`i18n -- status`, strict playtests) is a step of `npm run release-check`, so the release workflow runs it. What an
exception lets through is printed by name as accepted, not as a warning to fix.
**A commercial release.** A green `verify:release` does not mean every asset may be sold: an exception is a reason,
not a licence. `npm run verify:commercial` (`verify:release`, then `validate --commercial`) refuses any
`releaseExceptions` entry, any placeholder, any non-commercial or no-derivatives licence (`NC`, `ND`), and any entry
without an `author` or a source that can be checked (a `url`, or a repository file named in `source`). It checks that
the claims are complete and allow a sale, not that they are true. The sample game passes it since 3.7 (its theme is
written for the project); `tests/fixtures/release-game` fails it on purpose.
**What the archive holds (3.7.1).** The checks above read the game's asset graph; the archive is what Vite copies
into `dist/`, and `public/` is shared by the games of the repository. So every build ends with `tools/dist.ts seal`
(a Vite plugin): the assets that are not this game's are removed, and `dist/licenses/` is written: the engine's
`LICENSE`, `LICENSE-ASSETS` (the game's own if it has one), `CREDITS.md` from its provenance, `THIRD_PARTY_NOTICES.txt`
(the licence of every package the bundle took code from, Workbox's for the service worker, the fonts' OFL) and
`assets-manifest.json` (each file: path, author, source, licence, SHA-256, status). Then `npm run verify:dist` (a step
of `npm run build`, so of the release) classifies every file of `dist/`: code, a locked asset whose bytes are the ones
reviewed, a data file the game names (`ending.file`), a font, an icon, a notice. Anything else fails, and so does a
locked file or a notice that is missing. The release attaches the assets manifest beside the archive.
Translations: a text identical to the source fails `npm run i18n -- status` unless `i18n: { same: [paths] }` in
`game.ts` lists it (a name, "OK", an arrow).
`npm run audit` is a different check: it keeps names from a private project out of the public repository.

## The sealed ending

```bash
mkdir -p games/<GAME>/private && cp games/<GAME>/ending.config.example.ts games/<GAME>/private/ending.config.ts   # then fill in the texts (fix the import path)
npm run seal -- --outcome=<key>     # one of the `outcomes` keys: encrypts only the chosen outcome
npm run build && npm run check:spoilers   # checks that no outcome's text is in the clear in dist/
```

`outcomes` keys are free-form (`scripts/seal-types.ts`, type `EndingConfig`); the sealed key is compared against the guess flag (`ending.guess.flag`).
Without `games/<GAME>/private/ending.config.ts`, `npm run seal` uses the committed example. The config's password must match `ending.password` in `games/<GAME>/game.ts`.
The dossier's format (`ticket`, `headline`, `message`, `photos`, `lines`, `outcome`) never changes: a dossier.bin already sealed stays valid.

## Deploying

`npm run build` produces a static `dist/` (the game, its assets, the service worker). Any static host works.

**GitHub Pages (built in).** The CI workflow (`.github/workflows/ci.yml`) runs the checks on every push and, on `main`,
deploys `dist/` to Pages. Enable it once in the repository settings: Pages → Source → "GitHub Actions". The site lives
under `https://<user>.github.io/<repo>/`, so the workflow builds with `BASE_PATH=/<repo>/`: every path (assets, fonts,
manifest, service worker, sealed ending file) honours that base. A custom domain at the root needs no `BASE_PATH`.

```bash
BASE_PATH=/my-repo/ npm run build        # same thing locally
```

**Clever Cloud (or any Node host).** `npm start` serves `dist/` with sirv. On Clever Cloud: a Node application with
`CC_NODE_DEV_DEPENDENCIES=install` (Vite is a dev dependency) and `CC_POST_BUILD_HOOK=npm run build:web`, then `clever deploy`.

```bash
npm run assets                           # if images or sounds changed (the generated files are committed)
npm run build                            # local checks: types, tests, build, spoiler check, leak audit
node scripts/e2e.mjs https://<your-site>/   # plays the live version end to end
```

`games/<id>/private/` is never sent: it is excluded by `.gitignore`. **Before sharing a game with a sealed ending**: seal
the real outcome (`npm run seal -- --outcome=…` with `games/<id>/private/ending.config.ts`), then `npm run build`, commit, deploy.

## Every other script

The scripts above are the ones a game needs. The rest of `package.json` is listed here so that every `npm run` has a
line (4.1.7; a script missing from this page fails `tests/scripts-documented.test.ts`):

| Script | What |
|---|---|
| `npm run preview` | serves `dist/` on 127.0.0.1 (what the e2e scripts are pointed at after a build) |
| `npm start` | serves `dist/` on every interface at `$PORT` (8080 by default) with `sirv`, through `scripts/start.mjs` (a Node launcher: it runs on Windows too, 4.1.8): what a host such as Clever Cloud runs |
| `npm run test:node` | the unit suite without the Python-bound and the CPU-bound tests (`npm run check` runs it; the heavy ones run nightly) |
| `npm run test:mutation:core [-- --set=core\|reality\|runs\|remix\|speedrun\|connectors-pure\|reality-store\|connectors-edge\|reality-store-postgres\|all --file=… --shard=i/n --merge [--from=…] --fresh --hash --doc]` | mutation testing of the modules a save, a session, a condition, a signal, a run or a store rest on, and of the connectors' pure parts (SDK, MIME reader, line editor, virtual disk, badge crypto and fetch: `connectors-pure`, which `connectors` still names until 4.2) (`docs/dev/MUTANTS.md`; every set gated since 4.1.20, `reality-store-postgres` (the Postgres adapter, on a Postgres) and `connectors-edge` (configuration, email, badge verification, terminal guard and shell, SSH, Telnet, in 4 shards) among them). 4.1.20: `--shard=i/n` mutates one shard of a set (whole files, a deterministic cut balanced on their mutants) and `--merge` joins a set's shards into its report, refusing a shard missing, doubled, cancelled or of other inputs; ci, the nightly, the candidate and the release run one matrix generated by `npx tsx tools/mutation-shards.ts --matrix=gated|nightly`; every entry of `docs/dev/mutants.json` has a category, a why, a proof, an owner and a revisit version, refused from that version on (any entry due stops every set: it is read again before a release of that version); a run that mutates `reality-store-postgres` (`--set=all` included, so `release-check`) needs `BRIDGE_PG_URL`; a report whose input hash (sources, tests, configurations, lockfile) is the current one is reused unless `--fresh`; `--hash` prints that hash (the CI cache's key); `--doc` writes the named survivors' table into MUTANTS.md |
| `npm run test:mutation:reality`, `npm run test:mutation:remix`, `npm run test:mutation:speedrun` | one set each (4.1.16): the Reality signal path; a world's seed, hash, compilation, application, constraints, category and Daily/Mystery tokens; a run's envelope and `h0`, the recorder and the verifier. `core`, `reality`, `runs`, `remix` and `speedrun` are gated since 4.1.17 (`--set=all`, one job each in ci with `full-ci`, the nightly, the candidate and the release) |
| `npm run test:mutation:runs` | the speedrun queue (4.1.17): admission, quota and leaderboard ranking (`bridge/src/runs.ts`, `runs-store.ts`, `runs-limiter.ts`), judged by the four short Bridge run test files; gated from the start (`--set=all`, the release, one job of its own) |
| `npm run e2e:smoke` | the generic playthrough of the production build (the solver's path replayed by touch) |
| `npm run e2e:pwa [-- --serve=dist --update --interrupted --reinstall --allow-skip]` | the PWA in a real browser (`E2E_BROWSER`): installed, the whole game warmed and opened offline; with `--serve=dist` the script serves the build itself and can publish a second one: `--update` (the banner, the save kept, the new worker in charge), `--interrupted` (the worker's fetch fails: no banner, the old one serves), `--reinstall` (worker and caches gone, installed again, the save kept); `--allow-skip` accepts WebKit's offline navigation, which Playwright cannot drive |
| `npm run e2e:studio`, `e2e:taps`, `e2e:reality` | the Studio, the default verbs, the Reality Bridge, each in a real browser |
| `npm run e2e:canonical [-- --browsers=chromium,webkit,firefox --allow-skip]` | `canonicalJson` (`src/engine/core/canonical.ts`, 4.1.12) on fifty edge values in Chromium, WebKit and Firefox, against the texts Node writes (`tests/canonical-json.test.ts`): one browser that writes one value differently fails; a browser that cannot launch exits 3 (0 with `--allow-skip`) |
| `npm run speedrun:verify -- run.wsrun [--keys=<file> --json --timeout=<ms>]` | a speedrun's `.wsrun` replayed against the current game (`GAME=<id>`): one verdict, its code, its reason and the trust it grants (`docs/en/SPEEDRUN.md`, ADR 0017); exit 0 for `valid` and `valid-unranked`, 1 otherwise (`inconclusive` included). The CLI's `web-scumm speedrun verify` and the MCP tool `speedrun_verify` run it. `npx tsx tools/speedrun/reference-run.ts` re-records the committed reference run (after `npm version` or a change of the reference chapter's logic) |
| `npm run speedrun:overlay [-- --port=7777 --origin=<url>]`, `speedrun:livesplit [-- export <run.wsrun> \| serve --port=7778 --origin=<url>]` | the local speedrun tools (4.1.14, D23): an OBS Browser Source (full, compact, transparent; Server-Sent Events) and LiveSplit (a `.lss` from a run; the autosplitter over LiveSplit's own WebSocket server); the game posts its run's events with `?speedrunTool=<port>`, nothing else, and only from its origin (the dev server and the preview by default) |
| `npm run e2e:speedrun [-- --browsers=chromium,webkit,firefox --allow-skip --bundle-only]` | the speedrun's determinism in Chromium (also with its CPU four times slower), WebKit and Firefox (4.1.14): the generator's vectors, the reference run replayed to the same final state, IGT and final proof, a run resumed from IndexedDB after its tab closed; a browser that cannot launch exits 3 (0 with `--allow-skip`) |
| `npm run migrate` | a game project moved to this release (`web-scumm migrate`; `docs/en/UPGRADING.md`) |
| `npm run ir [-- --game <id> --json]` | the game's intermediate representation (4.1.12, `docs/dev/adr/0013-game-ir-and-fingerprint.md`): rooms and what stands in them, rules, topics, listeners, scripts, objectives, each with the `file:line` that writes it, and the hash of the trusted extensions; `--json` prints the whole IR, the same text for the same sources |
| `npm run remix -- --seed <code> [--mode=remix --json] \| --preview <code> [--max=N] \| --record=N` | a Remix world of the current game (4.1.15, `docs/en/REMIX.md`): `--seed` prints each dimension's value and the world's hash (`--json` the whole `WorldVariant`), `--preview` adds `validate` and a solver witness on that world, `--record=N` solves the first N seeds of the published sample and writes each as a playtest session carrying its world (`games/<id>/playtests/remix-<seed>.session.json`) |
| `npm run verify:variants [-- --prove --max=N --sample=50 --draws=1000 --out=<file>]` | every world of every Remix mode (4.1.15, D25): a catalogue's every logical world, a generator's published sample, each validated and solved to the ending and to every objective (`--prove`: the exhaustive proof), a certificate per world in `.cache/proofs/variants/`, the coverage per dimension and per pair, the values never chosen, the dominant ones; `--out` writes the report a release publishes; exit 1 if one world fails. Part of `verify:game` |
| `npm run code-wheel -- --game <id> [--format svg\|pdf --seed <code> --out <dir>]` | the printable code wheel of a game (4.1.15): the large disc with the portraits from the sprites, the small disc with its windows, a booklet (assembly, the question, practice answers upside down), in colour and economy; SVG always, PDF with Pillow (`tools/code-wheel-pdf.py`; `npm run doctor` checks it) |
| `npm run e2e:remix [-- --browsers=chromium,webkit,firefox --seeds=50 --allow-skip]` | the same seed makes the same world, the same hash and the same code wheel in Node, Chromium, WebKit and Firefox (4.1.15, ADR 0018): 50 seeds of the reference in three modes; a browser that differs fails with the seed named; one that cannot launch exits 3 (0 with `--allow-skip`) |
| `npm run e2e:remix-speedrun [-- --browsers=chromium,webkit,firefox --allow-skip]` | Remix and Time Attack together (4.1.16, plan §10): for each world policy of the reference (Story, Remix Fixed, Remix Random, Daily, Mystery) the world made, the solver's route recorded by the real recorder in Node, Chromium, WebKit and Firefox (the four `.wsrun` the same, byte for byte), verified in a new process, then by a Bridge queue's isolated worker: verdict, leaderboard key, trust; exit 3 when a browser cannot launch (0 with `--allow-skip`) |
| `npm run e2e:worker-container [-- --image=node:22-bookworm-slim]` | the speedrun worker in its container profile (4.1.17, Linux with Docker, CI's `worker-container` job): the reference run verified inside; a hostile script refused HTTP, DNS, TCP, writes outside `/tmp` and the host's secrets, its child process without a network, all killed by the container's own timeout; a run again. `node tools/speedrun/container.mjs --image= --app= [--games=] [--allow-network]` prints the profile as a `worker` command |
| `npm run lint:content`, `lint:code` | the content lint alone (`npm run lint` runs it with a solver pass), Biome's lint alone |
| `npm run format`, `format:check` | Biome's formatting, written or checked (`npm run quality` checks) |
| `npm run mcp` | the MCP server of the current game on stdio (`docs/en/MCP.md`; `npm run -s mcp` for a client) |
| `npm run icons` | `public/icons/*.png` and `public/og.png` from the game's `site.json` |
| `npm run audit:assets` | every file of `dist/` accounted for with its licence (`npm run build:game` runs it) |
| `npm run audio -- …` | the Mega Drive music and sound-effect pipeline (`docs/en/AUDIO.md`) |
| `npm run build:studio-demo`, `studio-snapshot`, `studio-apply <patch>` | the Studio's static build, its snapshot alone, a demo patch applied to your copy (`docs/en/STUDIO.md`, "Demo mode") |
| `npm run studio-server -- <serve\|import\|export\|invite\|worker-keys\|login\|token\|backup\|restore\|replay\|gc>`, `studio-worker` | the Studio Server and its processing worker, a Studio online for a team (`docs/en/STUDIO-SERVER.md`) |
| `npm run studio-client` | the Studio's page the Studio Server serves (4.2.1): `studio.html` and its code alone, in `.cache/studio-client` |
| `npm run e2e:studio-hosted [-- --browser=firefox\|webkit]` | the hosted Studio in a browser (4.2.1, CI's `studio-hosted` job; `studio-client` first): login, the room editor on the game's origin, its save through the Studio, the wall between the two origins, Play, logout (Firefox and WebKit over https; WebKit on macOS only) |
| `npm run e2e:studio-collab [-- --browser=firefox\|webkit]` | three people on one hosted Studio (4.2.1, CI's `studio-hosted` job; `studio-client` first): presence, a span held by another refused with the draft kept, a reviewer kept from writing, a cut caught up from the journal, the members screen, the login and "access not granted" pages |
| `npm run pack [-- --publish-dry-run]` | the `web-scumm`, `create-web-scumm`, `web-scumm-bridge` and (4.1.9) `web-scumm-connectors` tarballs a release ships (`docs/en/PACKAGE.md`), from tracked files only: an untracked file under a shipped root refuses the pack (4.1.8); `--publish-dry-run` shows what `npm publish` would send |
| `npm run fresh-install`, `upgrade-check` | a game created from the tarball and played to its end, `create-web-scumm` installed from its own tarball and run, the Bridge installed and serving, the connectors installed without native code and answering `--help`; a game made on the previous release migrated, upgraded and played (CI runs both) |
| `npm run external-consumer -- [--tarballs=<dir>] [--from=4.1.17]` | the four archives used as a third party uses them, on Linux, macOS and Windows (4.1.18): read (names, versions, licences, binaries, exports, dependencies), a game made on the older release moved to them (migrate, verify, build, its save and a new game played to the end through `web-scumm/testing`), `create-web-scumm`, the Bridge (SQLite, Postgres with `CONSUMER_PG_URL`) and a connector scenario (a pairing code, a signed letter accepted, its duplicate, a forged one refused); no module of the checkout, no path to it. The candidate runs it on its own archives |
| `npm run readme-quickstart -- --tarballs=<dir>` / `--published` | the README's quick start as a reader copies it (4.1.19): the block under "## Start" run as written in a folder outside the repository, its archive URL pointed at the candidate's own archive (`file:`), `npm run dev` until it answers, then `verify` and `build`; the candidate's `readme-quickstart` job. `--published`, after the tag: the README's URL answers with the SHA-256 the release's SHA256SUMS lists |
| `npm run connector-archive-e2e [-- --tarballs=<dir>]` | the four connectors played end to end from their archive against a Bridge from its archive (4.1.19): email by webhook and by IMAP (a server of the script's own), Telnet, SSH and Open Badge; the candidate's `connector-archive-e2e` job. Real providers and exposure stay a person's pass (`connectors-real-security`) |
| `npm run locks` | the versioned locks of the Bridge, the connectors and the Bridge's image (`scripts/locks/`, 4.1.19), made from the root lock (every version kept); `-- --check` says whether each still fits its manifest and the root lock, without the network. `scripts/pack.mjs` copies them into the archives as `npm-shrinkwrap.json`; `scripts/sbom.mjs` and `scripts/bridge-image.mjs` make the candidate's five CycloneDX SBOMs and its image |
| `npm run ops:qualify` | the Bridge's qualification profile (`ops/qualify/`, 4.1.18) built from the tarball and brought up behind HTTPS on Docker: three instances on one Postgres, two tenants, an instance killed during proposals, a stream on another, the tenants apart, backup, the topology destroyed and restored, then (4.1.20) a restore refused while the Bridges serve and `--mode=replace-store` with them stopped (`ops-qualify.json`, schema 2: the profile, the commit, `--candidate-run=<id>`, the four archives' SHA-256, each step by its stable id with its duration and first defect; the `qualify` workflow). A candidate started by hand runs the full profile and its gate refuses less (`tools/release/candidate.mjs qualification`); a pull request's runs `--short` |
| `npm run ship -- <checks\|merge\|main\|tag\|watch\|verify\|chain> …` | the release chain as commands (4.1.8): wait for a pull request's checks (one re-run of a failed job), merge it, wait for `main`'s CI on the merge, tag and push, follow the tag's CI and the release run, download the release and verify its sums and attestations; `chain <pr> <version>` does all of it. Each command writes its PID to `.cache/pids/`; `tag` requires `--candidate=<run id>` from 4.1.17 on: a green run of the `candidate` workflow (`gh workflow run candidate --ref main -f sha=<sha>`: release-check, the heavy suite three times on new runners, the load on SQLite and on Postgres, the four runtimes, one job per gated mutation set) whose manifest names that SHA; release.yml publishes that run's `.wsrun` files after checking their SHA-256 (`tools/release/candidate.mjs`). `npm run release-check:local` is what a machine can run of it (quality, docs:truth, the unit suite, the build, the baseline) 4.1.20: `preflight-stable --candidate=<run>` says what 4.2 stable still needs, check by check, and changes nothing; `tag --sign` signs a 4.2 tag with an SSH key; `verify` also runs `gh release verify` (RELEASING) |
| `npm run page:storyboard`, `page:review`, `page:placement`, `import-layout` | the phone-friendly review pages and the placement page's import (`docs/en/PAGES.md`) |
| `npm run bridge -- …` | the Reality Bridge's command line (`docs/en/REALITY-OPS.md`): `init`, `serve` (`--tenants=a,b`, `--store=`, `--trust-proxy=<list>`, `--tenant-header`), `grant`, `rotate`, `revoke`, `doctor`, `compact`; since 4.1.10 `migrate --from=jsonl --to=sqlite` and `migrate --schema=N`, `tenant export\|delete`, `backup --out=`, `restore --from= --mode=merge\|replace-store [--lock-timeout=<ms>]` (4.1.20: the mode always said, the store held alone under a maintenance lease) |
| `npm run bridge:load [-- --store=sqlite\|postgres://… --instances=3 --players=1000 --proposals=50000 --concurrency=64 --streams=50 --out=<file>]` | the Bridge under load (4.1.10, `docs/dev/BENCH-BRIDGE.md`): three `serve` processes on one store (SQLite, or Postgres with `--store` or `BRIDGE_STORE`; an empty value is no value), the report naming the backend actually opened and the commit, checked by `npx tsx tools/load-report.ts <report> --store=<kind>` (4.1.17), throughput and latency p50/p95/p99, the journal and the streams checked afterwards (exit 1 on a lost, doubled or out-of-order signal); the nightly runs it on both stores |
| `npm run runs:load [-- --store=sqlite\|postgres://… --runs=100000 --players=5000 --reads=200 --max-p95-ms=<ms> --max-rss-mb=<MB> --out=<file>]` | the speedrun leaderboard at size (4.1.17): a store of the Bridge's schema filled with `--runs` verified runs on one board (and as many on another), the board read `--reads` times; p50/p95 latency, resident memory and the SQL plan (`EXPLAIN QUERY PLAN` / `EXPLAIN`) reported with the backend and the commit; a bound passed exits 1. The candidate and the nightly run it on both stores (2 000 ms p95, 512 MB) |
| `npm run solve:reality`, `reality:spike`, `reality:xcheck` | the solver under every reality scenario (and every recorded replay of `games/<id>/replays/`, 4.1.9), a load probe of the Bridge, the Rust cross-check of the protocol (`docs/en/REALITY.md`) |
| `npm run connector -- <email\|telnet\|ssh\|open-badge> --config <file.json>` | one connector of the world outside, as its own process, from the repository's sources (4.1.9, `docs/en/CONNECTORS.md`): health and metrics on a local port, SIGTERM drains and exits 0; the package's command is `web-scumm-connector` |
| `npm run fuzz:connectors [-- --connector=… --cases=10000 --seconds=60 --seed=1 --json]` | the connectors' parsers under seeded mutations of their corpus, no network: every input answered, no crash, RSS before and after (4.1.9; nightly a minute per connector, CI half a minute) |
