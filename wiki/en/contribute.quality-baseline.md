# The quality baseline

`tests/quality-baseline.json` freezes what the engine does: on a set of games, the witness the solver finds and the
digest of the state after every input, the proof's verdict and state count, every golden save played to its end, the
public surface, the number of tests and the first visit's JavaScript. A refactoring keeps it identical; a behaviour
change rewrites it on purpose and says so.

<a name="what-you-get"></a>

## What you get

Either `✔ same behaviour as tests/quality-baseline.json` for a change meant to keep behaviour, or a rewritten baseline
whose every moved line you know and own in the CHANGELOG fragment.

<a name="context-and-versions"></a>

## Context and versions

The engine repository. The baseline dates from 4.1.0 "Clarity" (frozen before the engine was split into modules); the
"ratcheted" report from 4.1.3; the READMEs' figures from 4.1.8; the README's install section from 4.1.20; `heroes` in
the measured games from 4.4.0.

What it measures, as of 4.4.0 ([`tools/quality-baseline.ts`](../../tools/quality-baseline.ts)):

| Part | What is frozen | Rule |
|---|---|---|
| `games` (16) | `demo`, `reference`, `heroes`, the five classics, three partial-order fixtures, and the `world`, `cast`, `scale`, `picture`, `mini` fixtures: the witness (status, finished, number of inputs, a hash of the digests after every input) and the proof (status, states, softlocks) | identical |
| `saves` (43 as of 4.4.0) | each golden save of `tests/fixtures/saves/demo-*.json`, loaded and played to its end: ended, inputs, last digest | identical |
| `surface.api` | a hash of `tests/api-surface.json` (the public API and the MCP tools) | identical |
| `tests` | test files and test declarations (`it(`, `test(`, `.each`, `.skipIf`, `.runIf`) | may only grow |
| `bundle.initialJsKB` | the first visit's JavaScript, gzipped, from `verify:dist` (with `--dist`) | may only shrink |

It also keeps two places of the READMEs in step: the figures between `<!-- metric:tests -->`, `metric:initialJsKB` and
`metric:referenceStates` markers (3257 declarations, 136 KB and 288 states at 4.4.0), and the archive URL between
`<!-- install:begin -->` and `<!-- install:end -->`.

<a name="prerequisites"></a>

## Prerequisites

A prepared repository ([Developer setup](contribute.setup.md)). For `--dist`, a production build of the sample game in
`dist/` (`npm run build:game`).

<a name="where-to-run"></a>

## Where to run the commands

In the engine repository, on your machine. CI's `check` job runs `npm run quality:baseline -- --check --dist` on every
change.

<a name="steps"></a>

## Steps

<!-- step: check -->
1. **Compare.**

   ```sh
   # in the engine repository
   npm run quality:baseline -- --check
   npm run build:game && npm run quality:baseline -- --check --dist   # with the first visit, as CI
   ```

   It solves and replays every game (`quality baseline: solving and replaying…`), then prints `✔ same behaviour…`, or
   one `✖` line per difference, for instance `demo witness.digests: … → …` (a state after some input differs:
   `npm run replay` on the witness names the entry), `golden save demo-3.4.0.json last: … → …`,
   `tests/api-surface.json: the public API or the MCP tools changed`, or `README.md: a figure is behind the baseline`.

<!-- step: decide -->
2. **Decide what a difference is.**
   - Your change was meant to keep behaviour (a refactoring, a rename, a speed-up): a difference is a regression. Find
     it; `npm run replay` on the witness names the first entry whose state differs.
   - Your change alters behaviour on purpose (a rule, a command, a solver change, a new test, a smaller bundle): go to
     step 3.

<!-- step: rewrite -->
3. **Rewrite it**, with the first visit if your change can move it:

   ```sh
   # in the engine repository
   npm run quality:baseline
   npm run build:game && npm run quality:baseline -- --dist
   ```

   A rewrite says what it moves, before writing: `⚠ behaviour moved: …` for a digest, a verdict, a save or the surface,
   and `✔ ratcheted: …` for more tests or a smaller first visit. It writes `tests/quality-baseline.json`, then the
   figures and the install URL of `README.md` and `README.fr.md` (`✔ README.md: the figures written`). Without
   `--dist`, the previous `bundle` is kept.

<!-- step: own -->
4. **Own it.** Commit the JSON and the READMEs with the change; say in the CHANGELOG fragment what moved and why ("the
   reference chapter's witness changes", "the first visit goes from 125 to 132 KB"). `tests/quality-baseline.json` is
   a file the maintainer reviews (`CODEOWNERS`).

> [!LIMIT id=what-baseline-covers]
> The baseline freezes these games, saves and figures only. A behaviour no measured game exercises can change without
> moving it; a new mechanic belongs in a fixture or a game of the list, or in its own test.

<a name="expected-result"></a>

## Expected result, and how to check it

`npm run quality:baseline -- --check --dist` ends with `✔ same behaviour as tests/quality-baseline.json: 16 games, n
golden saves, n test declarations, first visit n KB` and exit code 0.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `README.md: a figure is behind the baseline (npm run quality:baseline writes it)` | You added a test (the test count moved) without rewriting | `npm run quality:baseline`, commit the READMEs |
| `⚠ better than the baseline, ratchet it` | More tests, or a smaller first visit: not a failure by itself | Rewrite it so the gain is kept |
| `tests: n declarations → m (a test was removed)` | A test was deleted or merged | Restore it, or own the removal in the pull request and rewrite |
| `first visit's JavaScript: n KB → m KB gzipped` | The player's first chunk grew | Load the new code on demand ([Import boundaries](contribute.boundaries.md#layers)), or own the growth |
| `<game>: new game, not in the baseline` | A game was added to the list | Rewrite it |
| `README.md: the install section names another version` | `package.json`'s version changed (a release) | Rewrite it: the release branch does |

<a name="files-changed"></a>

## Files or data changed

`tests/quality-baseline.json`, `README.md`, `README.fr.md`. `--check` writes nothing.

<a name="recovery"></a>

## Recovery or going back

`git restore tests/quality-baseline.json README.md README.fr.md` undoes a rewrite you did not mean.

<a name="references"></a>

## References

- [`tools/quality-baseline.ts`](../../tools/quality-baseline.ts), [`tests/quality-baseline.json`](../../tests/quality-baseline.json).
- [Before a pull request](contribute.before-a-pr.md#steps), [The dev loop](contribute.dev-loop.md),
  [Benchmarks](contribute.benchmarks.md).
