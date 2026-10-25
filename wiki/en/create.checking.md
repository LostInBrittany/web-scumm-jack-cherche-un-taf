# Checking your game

Four commands tell you most of what is wrong with a game before anyone plays it: `validate` checks the content,
`solve` finds a way to the ending, `lint` reads the puzzle graph for what a player would trip on, and `solve --prove`
proves that no player can get stuck. Then the game is played for real: by a scripted walkthrough, in a browser, on a
phone, and by a person.

<a name="what-you-get"></a>

## What you get

A game whose references all resolve, that can be finished from "New game", whose softlocks are ruled out by an
exhaustive proof, and whose remaining warnings you have read and either fixed or kept on purpose. At the end, the
checklist [Before you share the link](#before-you-share).

<a name="context-and-versions"></a>

## Context and versions

- **The engine repository** (a clone of `quest-n-click`, to work on the engine or its sample games): the commands are
  npm scripts, `npm run validate`. The game is `GAME=<id>`, otherwise `config.game` of `package.json`.
- **A created project** (made by `npx quest-n-click create`): the commands are `quest-n-click` subcommands,
  `npx quest-n-click validate`, and the project's scripts `npm run verify`, `npm run build`, `npm run release`. The game
  is `game/`.
- This page describes 4.3.0 and later (the lint's `hero-looks-default` arrived in 4.3.0). The status of a solver run
  is the same since 3.3.

<a name="prerequisites"></a>

## Prerequisites

- The engine installed: [Install from the repository](install.from-repository.md) or a created project
  ([Your first game](create.first-game.md)).
- A game with at least one room. The working loop is in [The working loop](create.working-loop.md).

<a name="where-to-run"></a>

## Where to run the commands

On your machine, at the root of the folder:

| Check | Engine repository | Created project |
|---|---|---|
| Content | `npm run validate` | `npx quest-n-click validate` |
| A way to the ending | `npm run solve` | `npx quest-n-click solve` |
| What a player would trip on | `npm run lint` | `npx quest-n-click lint` |
| No softlock | `npm run solve -- --prove` | `npx quest-n-click solve --prove` |
| All the game's gates | `npm run verify:game` | `npm run verify` |
| The exhaustive gates | `npm run prove:game` | part of `npm run release` |

In the engine repository, options go after `--` (`npm run solve -- --prove`); with `npx quest-n-click` they follow the
subcommand directly.

<a name="steps"></a>

## Steps

<!-- step: validate -->
1. **Validate the content.**

   ```sh
   # in the engine repository
   npm run validate
   # in a created project
   npx quest-n-click validate
   ```

   Everything referenced exists, every visible thing has a Look line, texts are neither empty nor too long, flags are
   set and read. Exit 1 on an error. What it checks is listed in [What each check looks at](#checking).

<!-- step: solve -->
2. **Find a way to the ending.**

   ```sh
   # in the engine repository
   npm run solve
   # in a created project
   npx quest-n-click solve
   ```

   It prints `✔ The game can be finished`, the path, and three warnings to read: dead ends, items obtained but never
   used, items never obtained ([the warnings](create.solver-proofs.md#warnings)). A winning path is not a proof.

<!-- step: lint -->
3. **Lint the content.**

   ```sh
   # in the engine repository
   npm run lint
   # in a created project
   npx quest-n-click lint
   ```

   Conditions nothing can satisfy, rules another rule hides, red herrings, hints that cannot fire, actions the solver
   never ran. Fix each finding, or keep it on purpose in `game.ts` (`lint.ignore`, below).

<!-- step: prove -->
4. **Prove there is no softlock.**

   ```sh
   # in the engine repository: the global proof, the proof by chapters, every Reality world
   npm run prove:game
   # in a created project
   npx quest-n-click solve --prove
   ```

   Only a `solved` from `--prove` rules out softlocks. A `truncated` result proves nothing: raise the budget
   ([Solver options](create.solver-options.md#budgets)).

<!-- step: play -->
5. **Play it for real.** A scripted walkthrough and the browser e2e ([Prove it plays](#prove-it-plays)), a real phone
   in landscape ([Testing on a phone over the LAN](create.lan-testing.md)), then a person who has never seen the game
   ([Playtests](create.playtests.md)).

<!-- step: checklist -->
6. **Go through the checklist** [Before you share the link](#before-you-share).

<a name="checking"></a>

## What each check looks at

- **Validated.** Broken references, unreachable rooms and untranslated lines are found before anyone plays.
  `validate` checks shapes and references: everything referenced exists, every visible thing has a Look line, texts
  are not empty or too long, flags are set and read. It warns about rooms nothing leads to and declared exits with no
  way back (`oneWay: true` when intended). It checks each minigame's required parameters (`required`), the images
  cited in their `params`, every `skin` id (manifest images, `audio` sounds) and `ending.scratch`, and that a required
  Reality signal's `fallback` names a rule.
- **Solved.** The solver runs the real engine, with no second model of the content. `solve` asks for a **witness**, a
  path to an ending; `solve --prove` explores **every reachable state** and fails on a softlock or a truncated search.
  These are two different promises, and a release asks for the second
  ([What the solver proves](create.solver-proofs.md)). `solve` also reports the invariants (`GameDef.invariants`) that
  became true, with their path.
- **Linted.** `lint` says what `validate` cannot (it checks shapes and references) and what `solve` does not say loudly
  (it answers "can it be finished"). From the puzzle graph:
  - a condition nothing sets (`cond-never-true`, an error);
  - a rule another rule matches first (`rule-shadowed`);
  - an item no rule needs (`item-red-herring`) or nothing gives (`item-never-gained`);
  - a hint that waits for something nothing sets (`hint-stuck`, an error), or that shares its `until` with an earlier
    hint (`hint-never-fires`);
  - a dead topic, choice option or listener; a choice with one option; an exit with a condition and no `locked` line;
  - an action that only changes what nothing live reads (`action-dead`, info; a flag a character's variant or a text
    switch reads is not counted as nothing, so the intro's choice of the hero is not reported);
  - two or more values of the hero's flag that no hero variant matches, so those heroes look like the written one
    (`hero-looks-default`, info, 4.3.0; see [Heroes](create.heroes.md));
  - a target behind a walk link a condition closes, whose rule does not check that condition (`walk-link-gate`: the
    link stops the walk, never the action).

  After a solver run, also: a required signal's fallback the closed witness never plays (`fallback-unplayed`, a
  warning); a live action the witness never ran and a room it never entered (`rule-never-run`,
  `room-never-reached`: information with the witness, warnings with a completed `--prove`; a truncated proof keeps them
  as information and says so, it never calls anything unreachable); a live action that ran without ever changing the
  state (`rule-no-effect`, info: a topic that only talks, or a `set` already true). Reachability counts every try the
  solver made, whether or not it changed the state.

  Each finding names its room and path (the one the Studio's Rooms tab shows), its stable id, and what to do. Exit
  codes: 0 clean, 1 an error that is not ignored, 2 the search was truncated (`--json` carries `status` and
  `truncated`). `--prove` runs the exhaustive search first (slow on a big game), `--static` runs no solver at all,
  `--max=<n>` sets the search's budget (20 000). The Studio's Check tab shows the same list with links into Rooms; the
  `lint` MCP tool returns it as Markdown. `verify:game` runs it, so does CI.
- **Replayed.** A session is the unit of reproduction ([Playtests](create.playtests.md#sessions)); saves load across
  versions, with one frozen save per release from 3.0.0 on ([State and saves](create.state-saves.md)).
- **Accessible as far as a machine can tell.** axe-core on every screen, keyboard and touch play in CI. That is not a
  WCAG conformance claim: screen-reader and real-device passes are a person's to make
  ([Accessibility](play.accessibility.md), [Field passes](contribute.field-passes.md)).

**Keeping a finding on purpose.** A red herring you want, or a decorative flag (set, never read), is silenced in
`game.ts`; the same list keeps `flag-never-read:<flag>` out of `validate`'s warnings:

```ts
lint: { ignore: ['item-red-herring:rubber_chicken', 'rule-shadowed:house/on[4]'] },   // a code, `code:<id>` or `code:<room>/<path>`
```

`ui.shareSession` names the pause menu's row that sends a playtest from a phone ([Playtests](create.playtests.md)).

<a name="commands"></a>

## Commands

Every command below runs in the **engine repository** with `npm run`. The second column gives the created project's
equivalent when there is one; "—" means the created project has none.

**The game's content**

| Engine repository | Created project | What it does |
|---|---|---|
| `npm run validate` | `npx quest-n-click validate` | Broken references, empty or too-long text, missing Look lines, flags never set or never read. Exit 1 on an error. |
| `npm run validate -- --report` | `npx quest-n-click validate --report` | The content profiler (Markdown): rooms, items, characters, what is thin. |
| `npm run validate -- --release` | `npx quest-n-click validate --release` | Also provenance, placeholders, and a stable id on every line of a game shipped in another language than its own or voiced. |
| `npm run validate -- --commercial --errors` | `npx quest-n-click validate --commercial --errors` | A release that may be sold: no exception, no placeholder, no non-commercial licence, every source checkable; `--errors` prints the errors only. |
| `npm run solve …` | `npx quest-n-click solve …` | The solver: [Solver options](create.solver-options.md). |
| `npm run lint [-- --prove \| --static \| --json]` | `npx quest-n-click lint …` | The content lint, above. `lint:content` is the same command (alias since 4.1.0). |
| `npm run i18n -- extract [--lang xx]` | `npx quest-n-click i18n extract …` | Translation tables (`locales/<xx>.json`); `status` for the coverage. [Translations](create.translations.md). |
| `npm run playtests …` | `npx quest-n-click playtests …` | Players' sessions replayed and summed up: [Playtests](create.playtests.md). |
| `npm run page:world` | — | The map of the world as a page: exits, gotos, unreachable rooms, DOT source. |
| `npm run page:puzzles` | — | The puzzle graph as a page: what every rule needs and changes, a card per item and flag. |
| `npm run replay -- session.json` | — (the Studio's Play tab) | A session played on the real engine: [Sessions](create.playtests.md#sessions). |

**The game's gates**

| Engine repository | Created project | What it does |
|---|---|---|
| `npm run verify:game` | `npm run verify` | Engine repository: validate, the witness, the witness by chapters, the variants (`verify:variants`), the translation status, the lint, the playtests. Created project: validate, solve, `i18n status`, lint, playtests. |
| `npm run prove:game` | — (`npm run release` runs `solve --prove` and `solve-reality`) | The global proof, the proof by chapters and every Reality world; fails on a softlock or a truncation. |
| `npm run build:game` | `npm run build` | The game's gates, the bundle, `verify:dist`, then (engine repository) the spoiler check and the asset audit. No type-check, no unit suite. |
| `npm run build` | `npm run build` | Engine repository: `check` (type-check and Node tests), then `build:game`. |
| `npm run verify:release` | part of `npm run release` | `validate --release`, `weight --release`, `i18n status`, `voices check --release`, strict playtests. |
| `npm run verify:commercial` | `npm run release -- --commercial` | `verify:release`, then no exception, no placeholder, no NC or ND licence, every source checkable, then `verify:dist`. |
| `npm run verify:dist` | part of `build` | Every file of `dist/` accounted for: code, locked assets (their reviewed bytes), named data, fonts, icons, `licenses/`. |
| `npm run verify:field` | — | `verify:commercial`, then the playtest quotas of a release tested by players (not a step of `release-check`, D12). |
| `npm run provenance [-- --lock]` | `npx quest-n-click provenance [--lock]` | The shipped assets by licence, what changed since the reviewed lock; `--lock` records the files after a review. [Asset provenance](create.asset-provenance.md). |
| `npm run weight [-- --release --json --stems]` | `npx quest-n-click weight …` | What a phone downloads before the first room, per room and per chapter, against `assetBudgets`. |
| `npm run voices -- status \| export \| import \| check` | `npx quest-n-click voices …` | Recorded lines per language. `status [--lang xx]`: lines with an id by status (draft, record, recorded, approved), clips, orphans; a line with text switches has one row per value, `<id>~form=f`. `export --lang xx [--json] > t.csv`: the actors' table (id, who, text, status, file, actor, note). `import t.csv --lang xx`: statuses, actors and notes back into `voices.json` (unknown lines refused). `check [--lang xx] [--release]`: every clip measured with ffmpeg (codec, rate, length for its text, loudness about −16 LUFS, peak); `--release`: an approved line needs its clip. [Voices](create.voices.md). |
| `npm run i18n -- voices` | `npx quest-n-click i18n voices` | The lines with an id and no clip, the clips no line claims. |
| `npm run ids [-- --write --map]`, `npm run ids -- --lines` | `npx quest-n-click ids …` | Stable ids (schema 3) written into the sources, locales renamed, the save migration step. `--lines`: an id on every say, toast, guide object, list line, hint and kind reaction (`--lines=all`: plain strings too, required for a translated or voiced release); translations and voices are keyed by it. [State and saves](create.state-saves.md). |

**The engine repository's own checks**

| Command | What it does |
|---|---|
| `npm test` | The Node tests of the engine, the tools and the selected game, without the heavy solver tests. |
| `npm run test:heavy` | The CPU-bound solver tests: every night, minutes each ([Solver options](create.solver-options.md#tests)). |
| `npm run test:coverage` | The suite under V8 coverage against the floors of `vite.config.ts`; then `npx tsx tools/coverage-ratchet.ts --strict` fails on a floor at least three points behind what the tests reach ([The coverage ratchet](contribute.coverage-ratchet.md)). |
| `npm run test:assets` | The Python-backed image and asset-pipeline tests. |
| `npm run check` | Type-check and Node tests. |
| `npm run tsc -- …` | The TypeScript 7 compiler itself; `check` and `quality` call it. |
| `npm run quality` | Biome formatting and lint, `knip`, `tsconfig.json` and `tsconfig.strictest.json`, then the content lint. |
| `npm run quality:baseline -- --check [--dist]` | The behaviour of 4.0.0 kept: witnesses, proofs, golden saves, public surface, first visit ([The quality baseline](contribute.quality-baseline.md)). |
| `npm run doctor [-- --release]` | Node, Python modules, ffmpeg, Playwright browsers ([`doctor`](install.doctor.md)). |
| `npm run release-check` | What CI runs, in one go: `doctor --release`, `quality`, `build`, coverage and its strict ratchet, `verify:release`, `prove:game`, `solve --audit-abstractions`, the Rust cross-check, mutation of the core, the packages with `npm publish --dry-run`, the dependency audits. `release-check:ci` is the same without the mutation sets ([Releasing](contribute.releasing.md)). |
| `npm run field:init`, `field:check`, `field:report`, `field:bundle`, `field:verify-bundle`, `field:carry` | The Field Kit: the people's passes as JSON reports bound to a candidate run ([Field passes](contribute.field-passes.md)). |

**In a browser** (engine repository; the dev server or a production build already running at `<url>`)

| Command | What it does |
|---|---|
| `npm run e2e -- <url>` | A playthrough in Chromium, phone landscape, along the solver's path ([Prove it plays](#prove-it-plays)). |
| `npm run e2e -- <url> --renderer canvas` | The whole game drawn by the Canvas painter. |
| `npm run e2e -- <url> --lang fr` | The whole game in that language; fails on any visible English default of the engine. |
| `npm run e2e:visual -- <url> [--update]` | Every room, still, against `tests/visual/<game>/*.png` (0.5 % of the pixels at most). |
| `npm run e2e:a11y -- <url> [--only=axe,keys,storage] [--allow-skip]` | axe on the conversation, map, slots, confirmations and every minigame; every minigame won at the keyboard; an older save upgraded (`E2E_BROWSER=chromium\|webkit`; exit 3: a check the browser cannot automate). |
| `npm run e2e:perf -- <url> [--renderer=canvas\|dom --cpu=4 --min=30 --room=<id>]` | Frames per second while the hero walks, CPU slowed (the phone stand-in). |
| `npm run e2e:music -- <url> [--only=offline\|live\|game\|reference …]` | The music director: 30 min offline without drift, 100 changes without a click, real-time jitter (`--live=chromium\|webkit`), the theme's stems in the game; `--only=reference [--browser=webkit]` with `GAME=reference`: two scores, bridges, a restore and a stop mid-transition, the decoded peak ([Music](create.music.md)). |

**Documentation and repository tooling** (engine repository)

| Command | What it does |
|---|---|
| `npm run docs:screenshots [-- --only=game\|studio --keep-png]` | The README images from the production bundle and the Studio, as WebP (needs Python with Pillow). |
| `npm run docs:truth` | What the docs state against the code: the save and `.wsrun` schemas, every npm script and `tools/` or `scripts/` file they cite, no release link newer than the version. CI's check job. |
| `npm run docs:links [-- --timeout=10000]` | Every external link of the docs asked once; a person runs it before a release, CI never does. |
| `npm run changes -- --check \| --assemble` | The CHANGELOG and LOG fragments of a branch ([Conventions](contribute.conventions.md)). |
| `npm run ci:plan [-- --base=origin/main \| --files=a,b \| --all]` | Which of CI's heavier jobs a change needs, one line of JSON; since 4.5.0 also `docs` and `docsPages`, the wiki pages whose `sources` the change touches ([CI explained](contribute.ci.md)). |
| `npx tsx tools/api-doc.ts [--check]`, `npx tsx tools/dsl-doc.ts [--check]` | The generated API and DSL references ([Public API](engine.api.md), [DSL reference](create.dsl.md)). |

<a name="prove-it-plays"></a>

## Prove it plays

In the engine repository, `npm test` runs the engine tests and the game's walkthrough: a scripted full playthrough on
the real engine (`tests/demo-walkthrough.test.ts` for the demo). `npm run e2e` plays the whole game by touch in a
phone-sized Chromium and saves a screenshot of every step: look at them, or have your assistant look, to catch what
the solver cannot see (a character standing on a table, a line cut by the screen edge).

```sh
# in the engine repository: start the dev server, then in another terminal
npm run dev
npm run e2e -- http://localhost:5173/
```

`npm run e2e` takes the solver's path (`npm run solve -- --json`, its `steps`) and taps through it. It passes only when
the solver's run is `solved` (its exit code, status and steps are checked) **and** the engine itself reports the
ending (`state.done`): a truncated or unsolved game is a failure, never "the best path replayed anyway".
[`games/demo/e2e.mjs`](../../games/demo/e2e.mjs) is the example of a game-specific e2e script: it starts from the
title screen, plays the pipes and pick minigames and the sealed ending's scratch ticket for real instead of skipping
them, then checks the final card.

> [!LIMIT id=created-project-no-e2e]
> A created project has no `test` or `e2e` command: its checks are `verify`, `build` and `release`. The browser e2e
> and the visual, accessibility, performance and music checks run in the engine repository.

**In CI** (the engine repository's [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)): every push to
`main`, every tag and every pull request runs `npm run build:game` (the game's gates, the bundle, the spoiler and asset
audits) and `npm run prove:game` on the sample game; the heavier jobs (the production e2e in several browsers, the
keyboard and French playthroughs, a second game made from the template…) run when [`ci:plan`](contribute.ci.md) says
the change needs them. `main` deploys to Pages; a tag releases. The weekly `prove` workflow (Mondays, or by hand) runs
`prove:game`, the strict playtests and the bench on a generated 100-room game. Dependabot proposes npm and Actions
updates weekly, pip ones monthly ([Bot PRs](contribute.bot-prs.md)).

<a name="before-you-share"></a>

## Before you share the link

- [ ] Premise, want, obstacle per room and ending fit in four lines.
- [ ] The storyboard is final, and every room text comes from it.
- [ ] Each room has one goal, 3 to 6 steps, one "aha", 8 to 15 named things.
- [ ] Every named thing has a Look line; repeated looks follow normal, normal, normal, absurd.
- [ ] Each character has 2 to 4 topics, a `hug`, a `refuse` and a distinct colour.
- [ ] Each verb has 3 to 6 fallbacks in the hero's voice. No "That doesn't work".
- [ ] Hints cover every step of every room, in order, until the ending.
- [ ] Every minigame has a reason in the story, a Skip, and lasts about 30 seconds.
- [ ] The map shows only unlocked places; news markers point to the next step.
- [ ] Every state change has a sound.
- [ ] No line over 90 characters.
- [ ] `validate`: no errors. `solve`: finished, no dead ends, no unused items. `solve --prove`: `solved`.
- [ ] Engine repository: `npm test` and `npm run e2e` pass; screenshots reviewed.
- [ ] Played start to end on a real phone, in landscape.
- [ ] Sealed ending checked with `npm run check:spoilers` ([The sealed ending](create.sealed-ending.md)).
- [ ] Someone else played it without help ([Playtests](create.playtests.md)).

Then build and ship it: [Build and release a game](create.build-release.md).

<a name="expected-result"></a>

## Expected result, and how to check it

- `validate`: its last line starts with `✔  [<game>]` and counts the rooms, items and characters; exit 0. Warnings
  (`⚠`) do not fail it. "(images not checked: run npm run assets)" means the images were not checked.
- `solve`: `✔ The game can be finished` and `✔ Witness solved: …`, exit 0.
- `solve --prove`: `✔ Proof solved: the ending stays reachable from every one of the N reachable states`, exit 0.
- `lint`: exit 0; the findings left are information, or ignored on purpose.

The exit code is the verdict: 0 passed, 1 a problem to fix, 2 the search was truncated and nothing is proved.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `solve` exits 2, `truncated: the search stopped at N states, nothing is proved (raise --max)` | The budget is too small for the game | Raise `--max`, `--time` or `--mem`, prove by chapters, read the profile ([Solver options](create.solver-options.md)). |
| `softlocks: N reachable state(s) can no longer reach the ending` | A consumed item, a closing flag, a hidden clue | Read the causes and replay their path ([What the solver proves](create.solver-proofs.md#what-it-proves)). |
| `Dead ends (n): …` | A state where no action changes anything | Give the item back, or loosen the condition ([the warnings](create.solver-proofs.md#warnings)). |
| `broken: N invariant(s) broken on a reachable state` | A "never again" bug came back | The path is printed; fix the rule it names. |
| `lint` exits 1 with `cond-never-true` or `hint-stuck` | A condition or hint waits for something nothing sets | Set it somewhere, or change the condition; or ignore it in `lint.ignore` if intended. |
| `fallback-unplayed` | A required signal's fallback is declared on a rule the closed witness never plays | [A game with the outside world](create.solver-proofs.md#reality-worlds). |
| The result says `(from the proof cache, key …)` and you doubt it | The cache answered because nothing changed | `--no-cache` or `PROOF_CACHE=0` runs it again ([the proof cache](create.solver-options.md#proof-cache)). |

<a name="files-changed"></a>

## Files or data changed

The checks only read your game. What they write: `.cache/proofs/` (the proof cache), and the folders you
name with `--out`. `npm run e2e` writes its screenshots to `E2E_OUT` (default `/tmp/e2e`). `validate --report` prints to the terminal; `page:world` and `page:puzzles` write their page under `dist-pages/`
(or `--out <dir|file.html>`). `ids --write` and
`provenance --lock` are the exceptions that change files you commit: they are not checks, and they say so.

<a name="recovery"></a>

## Recovery or going back

Nothing to undo: a check does not change the game. To start from a clean slate, delete `.cache/proofs/`.

<a name="references"></a>

## References

- [`tools/validate.ts`](../../tools/validate.ts), [`tools/solve.ts`](../../tools/solve.ts), [`tools/lint.ts`](../../tools/lint.ts),
  [`cli/quest-n-click.mjs`](../../cli/quest-n-click.mjs)
- [What the solver proves](create.solver-proofs.md), [Solver options](create.solver-options.md), [Playtests](create.playtests.md)
- [The Studio's Check tab](studio.check.md), [MCP tools](studio.mcp-tools.md)
- [npm scripts](reference.npm-scripts.md), [CLIs](reference.cli.md)
