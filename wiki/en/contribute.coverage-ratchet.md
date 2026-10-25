# The coverage ratchet

The coverage floors of `vite.config.ts` only rise. Two checks hold them: Vitest fails when the tests reach less than a
floor, and the ratchet fails when a floor lags three points or more behind what the tests reach. This page says what
to do when either is red.

<a name="what-you-get"></a>

## What you get

A `coverage` job green again: every floor met, and every floor within three points of what the tests measure.

<a name="context-and-versions"></a>

## Context and versions

The engine repository. The floors date from 4.1.0 "Clarity" (the level measured then); the ratchet,
[`tools/coverage-ratchet.ts`](../../tools/coverage-ratchet.ts), from 4.1.3; its GitHub annotations from 4.1.9.

What is measured: V8 coverage of `src/**/*.ts` (not `*.d.ts`), `bridge/src/**/*.ts` and `studio-server/src/**/*.ts`,
by the unit suite and the asset tests (`npm run test:coverage`). The floors as of 4.4.0:

| Scope | Floor |
|---|---|
| All measured files | lines 75, statements 74, functions 71, branches 70 |
| `src/engine/core/{cond,diff,migrate,save}.ts` | branches 100 |
| `src/engine/core/session-runtime.ts`, `tools/replay.ts`, `core/content-ids.ts` | branches 94, 99, 96 |
| `src/engine/core/reality-runtime.ts`, `reality/protocol.ts`, `reality/client.ts`, `reality/http-port.ts` | lines and branches, 90 to 100 |
| 23 files of the Studio Server (the journal, the gate, OIDC, leases, previews, the worker's jobs…) | lines and branches, set two points under what was measured when each arrived |
| 6 files of the Bridge (`bridge.ts`, `store.ts`, `server.ts`, `policy.ts`, `lock.ts`, `cli.ts`) | lines and branches |

The exact values are in [`vite.config.ts`](../../vite.config.ts), `test.coverage.thresholds`, with the reason for each
floor below 100 written beside it.

> [!LIMIT id=lines-not-proof]
> Coverage counts lines and branches run, not results checked. The browser-only parts of `src/` (the player's UI and
> the Studio's) are covered by the e2e, not by this measure; whether the tests tell a right result from a wrong one is
> [Mutation testing](contribute.mutation-testing.md)'s question.

<a name="prerequisites"></a>

## Prerequisites

A prepared repository with Python and its image modules ([Developer setup](contribute.setup.md)): the asset tests run
under coverage too.

<a name="where-to-run"></a>

## Where to run the commands

In the engine repository, on your machine. CI runs the same in its `coverage` job.

<a name="steps"></a>

## Steps

<!-- step: measure -->
1. **Measure.**

   ```sh
   # in the engine repository
   npm run test:coverage
   ```

   It runs the unit suite under coverage and writes `.cache/coverage/` (a text summary, `coverage-summary.json`, an
   HTML report in `.cache/coverage/index.html`). Vitest fails here when a floor is not met, naming the file and the
   metric.

<!-- step: floor-not-met -->
2. **A floor not met** (the tests reach less than it): your change removed tests or added code no test runs. Add the
   tests; open `.cache/coverage/index.html` to see the lines and branches not run. A floor is never lowered to let a
   change through.

<!-- step: ratchet -->
3. **Read the ratchet.**

   ```sh
   # in the engine repository, after test:coverage
   npx tsx tools/coverage-ratchet.ts            # warns
   npx tsx tools/coverage-ratchet.ts --strict   # fails, as on main
   ```

   Each line `⚠ <scope> <metric>: floor <n>, measured <m>` is a floor three points or more under what the tests reach.
   The end says `✔ every coverage floor is within three points of what the tests reach`, or the count to raise.

<!-- step: raise -->
4. **Raise the floors it names** in `vite.config.ts` (`test.coverage.thresholds`), to a value at or a little under what
   was measured, and commit them with the change that earned them. `vite.config.ts` is a file the maintainer reviews
   (`CODEOWNERS`).

> [!LIMIT id=ratchet-scope]
> The ratchet reads only the floors that exist: a file without a floor of its own is held by the global floors alone.
> A per-file floor applies when the summary holds that file.

<a name="expected-result"></a>

## Expected result, and how to check it

`npm run test:coverage` passes and `npx tsx tools/coverage-ratchet.ts --strict` exits 0. In CI, the `coverage` job is
green with no "coverage ratchet" annotation.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| Vitest: a threshold for lines, branches, functions or statements not met | Fewer lines run than the floor | Add tests (step 2) |
| `⚠ coverage ratchet` annotation on a pull request | A floor three points or more under the measure | Not blocking on a pull request: raise it (step 4), or leave it to the next change |
| `✖ n floor(s) at least 3 points below…` on `main`, a tag or `release-check` | The same, under `--strict` | Raise the floors, in a pull request |
| `✖ …: no coverage summary (npm run test:coverage first)` | The ratchet ran without a measure | Run `npm run test:coverage` first (exit 2 otherwise) |

<a name="files-changed"></a>

## Files or data changed

`vite.config.ts` (the floors); the measure writes only `.cache/coverage/`.

<a name="recovery"></a>

## Recovery or going back

A floor raised too high fails the next run: lower it back to what the tests reach (with the reason in the pull
request), since a floor above the measure is a red build, not a promise.

<a name="references"></a>

## References

- [`tools/coverage-ratchet.ts`](../../tools/coverage-ratchet.ts), [`vite.config.ts`](../../vite.config.ts).
- [Which tests run when](contribute.which-tests.md), [CI explained](contribute.ci.md#tiers),
  [Mutation testing](contribute.mutation-testing.md).
