# Before a pull request

One list of what to run and check before opening a pull request on the engine, so that CI confirms what you already
know instead of telling you.

<a name="what-you-get"></a>

## What you get

A branch whose fast tier is green on your machine (format, lint, types, unit tests, the sample game's gates), whose
behaviour change is owned, whose CHANGELOG fragment is there, and whose pull request description says what changed and
what is left.

<a name="context-and-versions"></a>

## Context and versions

The engine repository, on a branch named as [Conventions](contribute.conventions.md#branches) says. The commands are
those of 4.4.0; the CHANGELOG fragments exist since 4.1.9, `release-check:local` since 4.1.17.

<a name="prerequisites"></a>

## Prerequisites

- A prepared repository: [Developer setup](contribute.setup.md), with Python and its modules (the asset tests need
  them) and Playwright Chromium.
- Your change made with [The dev loop](contribute.dev-loop.md).

<a name="where-to-run"></a>

## Where to run the commands

In the engine repository, on your machine, on your branch. Run one test suite at a time: two suites side by side
compete for the same cores and leave orphan workers behind when interrupted.

<a name="steps"></a>

## Steps

<!-- step: content-rules -->
1. **Keep the content rules.**
   - Gameplay stays declarative in `games/<id>/`; geometry belongs in `layout/*.json`, never typed by hand.
   - Every schema-3 rule, choice, topic, listener, persistent block and script step has a stable id. `npm run ids --
     --write --map` writes the missing ones into the sources ([State and saves](create.state-saves.md)).
   - No private source asset, nothing whose commercial rights are unclear.

<!-- step: quality -->
2. **Format, lint and types.**

   ```sh
   # in the engine repository
   npm run quality
   ```

   It runs, in this order: `format:check` (Biome formatting), `lint:code` (Biome lint), `knip` (unused files, exports
   and dependencies), `tsc --noEmit` with `tsconfig.json`, `tsc --noEmit -p tsconfig.strictest.json` (every index
   access checked in `src/`), and `lint:content` (the content lint). `npm run format` writes the formatting; a commit
   that only reformats is its own commit, listed in `.git-blame-ignore-revs`
   ([Conventions](contribute.conventions.md#formatting-commits)).

<!-- step: check -->
3. **The unit suite.**

   ```sh
   # in the engine repository
   npm run check
   ```

   `check` selects the game, type-checks, then runs `test:node`: every test file except the heavy solver tests (the
   nightly and the candidate run those) and the two asset tests (next step).

<!-- step: assets -->
4. **The asset tests**, which need Python and its image modules.

   ```sh
   # in the engine repository
   npm run test:assets
   ```

<!-- step: verify-game -->
5. **The game's gates.**

   ```sh
   # in the engine repository
   npm run verify:game
   ```

   It runs `validate`, `solve`, `solve -- --chapters`, `verify:variants`, `i18n -- status`, the content lint and
   `playtests`, on the current game.

<!-- step: baseline -->
6. **The behaviour baseline.** A change meant to keep behaviour leaves it identical:

   ```sh
   # in the engine repository
   npm run quality:baseline -- --check
   ```

   A change that alters behaviour on purpose, or adds a test, rewrites it with `npm run quality:baseline` (which also
   writes the READMEs' figures) and commits the result. See [The quality baseline](contribute.quality-baseline.md).

<!-- step: docs -->
7. **The documentation**, when you touched it or the code a page rests on:

   ```sh
   # in the engine repository
   npm run docs:truth
   npm run wiki -- check
   ```

   `wiki -- check` ends with `✔ … 0 error(s)`; [Writing documentation](contribute.writing-docs.md) says how pages are
   written and checked.

<!-- step: fragment -->
8. **The CHANGELOG fragment.** A branch that changes `src/`, `bridge/`, `tools/`, `scripts/`, `cli/`, `connectors/` or
   `games/` carries `changes/<slug>.md` (and `changes/<slug>.log.md` for a LOG entry):

   ```sh
   # in the engine repository
   npm run changes -- --check
   ```

   It prints `✔ … a fragment or a CHANGELOG edit is there, or no code moved`, or the refusal and what to write
   ([Conventions](contribute.conventions.md#changes-fragments)).

<!-- step: browser -->
9. **A browser or visual change**: build for production, serve it, play it, and look at the screenshots.

   ```sh
   # in the engine repository
   npm run build:game
   npm run preview -- --port 5173 &
   npm run e2e:smoke -- http://127.0.0.1:5173/
   ```

   `e2e:smoke` plays the production build with the generic harness in a 844 × 390 Chromium; the screenshots land in
   `E2E_OUT` (default `/tmp/e2e`). Open them. Stop the preview server afterwards (`kill %1` in the same shell).

<!-- step: one-line -->
10. **The same, in one line.** `release-check:local` chains most of the above:

    ```sh
    # in the engine repository
    npm run release-check:local
    ```

    It runs `quality`, `docs:truth`, `test:node`, `build:game` (the game's gates, the bundle, `verify:dist`, the
    spoiler check, the asset audit) and `quality:baseline -- --check --dist`. It does not run `test:assets`,
    `changes -- --check`, `wiki -- check` nor the browser.

<!-- step: open-pr -->
11. **Open the pull request** from `.github/PULL_REQUEST_TEMPLATE.md`, its title as
    [Conventions](contribute.conventions.md#titles) says. Fill every section: "What changes" (what a player, an author
    or a host sees differently), "Checked", and "Not done, said as such" ("Nothing" when nothing is left). A visual
    change carries a screenshot in the description.

> [!LIMIT id=template-checklist]
> The template's "Checked" list names `npm run quality` and `npm test` only. The list on this page is the complete one:
> `knip` (inside `quality`), `check`, `test:assets` and `verify:game` are expected too.

<a name="milestone-verification"></a>

### The milestone checklist (from the roadmap)

The roadmap of the v1.3 to v2 milestones held its own list, run at every milestone; it is kept here as it was written:

1. `npm run validate && npm run solve && npm test && npm run build` green, CI green, the asset audit green.
2. The demo uses every new primitive at least once and the e2e goes through it (844 × 390 captures).
3. A save made with the previous version of the demo loads after migration (a unit test on a JSON frozen per
   milestone). Today one golden save per release since 3.0 lives in `tests/fixtures/saves/` and is played to its end by
   `tests/save-v3.test.ts` and the baseline.
4. A copy of `src/engine` into the private game: its tests, solver and e2e unchanged (the French roadmap gives the
   figures of that time: 37 tests, a 62-action solution, the private game's e2e).
5. MCP: `npm run -s mcp` lists the updated tools; a fresh AI session adds a script or an event to the demo following
   only the content guide.
6. A tagged release with notes, and the README's "Releases" table updated. The README now names the current release
   in its Documentation section instead of a table; releases are made as [Releasing](contribute.releasing.md) says.

<a name="expected-result"></a>

## Expected result, and how to check it

Every command above ends green. On the pull request, `pr-gate` is green once every job of the plan succeeded
([CI explained](contribute.ci.md)); a job the plan spares says "not needed by the plan" and succeeds.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `format:check` fails | A file is not formatted | `npm run format`, in a commit of its own if it reformats more than your change |
| `knip` names an unused export or file | Dead code left by the change | Remove it, or use it |
| `✖ this branch changes the code and carries no fragment` | No `changes/<slug>.md` | Write it ([Conventions](contribute.conventions.md#changes-fragments)) |
| `✖ behaviour moved from tests/quality-baseline.json` | A digest, a verdict, a golden save or the API surface moved, or a README figure lags | [The quality baseline](contribute.quality-baseline.md) |
| `test:assets` fails at import | Python modules missing | `python3 -m pip install --require-hashes -r requirements.txt` |
| CI's coverage job warns "coverage ratchet" | A floor is three points or more below what the tests reach | Not blocking on a pull request; raise it ([The coverage ratchet](contribute.coverage-ratchet.md)) |

<a name="files-changed"></a>

## Files or data changed

`npm run format` rewrites source files; `npm run quality:baseline` rewrites `tests/quality-baseline.json` and the
figures of `README.md` and `README.fr.md`; `npm run ids -- --write --map` writes ids into `games/<id>/`. The checks
themselves write only under `.cache/` and `/tmp/e2e`.

<a name="recovery"></a>

## Recovery or going back

A rewrite you did not mean (`format`, `quality:baseline`) is undone with `git restore <file>`. An interrupted test run
can leave Vitest workers running: stop them by their process id (`ps` then `kill <pid>`), not by a pattern.

<a name="references"></a>

## References

- [Which tests run when](contribute.which-tests.md), [CI explained](contribute.ci.md).
- [Conventions](contribute.conventions.md), [The quality baseline](contribute.quality-baseline.md),
  [The coverage ratchet](contribute.coverage-ratchet.md).
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md), [`.github/PULL_REQUEST_TEMPLATE.md`](../../.github/PULL_REQUEST_TEMPLATE.md).
