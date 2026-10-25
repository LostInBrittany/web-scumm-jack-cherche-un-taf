# Contributing to quest'n'click

Use Node.js 22.12 or newer. Asset tests also need Python 3 with `requirements.txt`; audio authoring needs ffmpeg. Run `npm run doctor` for an exact local report.

Everyone here follows `CODE_OF_CONDUCT.md`. A pull request starts from `.github/PULL_REQUEST_TEMPLATE.md`; a request for
something new starts from the feature issue template, after `wiki/en/create.classics.md` (most mechanics are combinations of
what exists).

Titles read the same way whoever opens them (4.3.0):

- **Issue:** the template's prefix, `[bug]` or `[feature]` (`[field]` for a release's field pass), then the problem or
  the need as a sentence. An issue opened from the command line skips the template: type the prefix yourself.
- **Pull request:** `<Area>: <what changes> (#issue)`, e.g. `Interface font: a proportional pixel font by default
  (#204)`. A pull request of a release's pass starts with its version instead (`4.2.3: …`, `4.3 "Name": …`).
- **Body:** every section of the template, "Not done, said as such" included ("Nothing" when nothing is left).
- **Branch:** its kind and a slash as a prefix (`feature`, `fix`, `docs`, `test`, `refactor`, or `release` with its version), then the
  issue's number and a few words, e.g. fix/210-job-late-poll. The fragment under `changes/` takes the branch without
  its prefix as its name (`210-job-late-poll.md`).

Before opening a pull request:

1. Keep gameplay declarative in `games/<id>/`; geometry belongs in `layout/*.json`.
2. Add stable IDs to all schema-v3 rules, choices, topics, listeners, persistent blocks and script steps.
3. Run `npm run quality` (Biome formatting and lint, TypeScript with `tsconfig.json` and with every index access
   checked in `src/` by `tsconfig.strictest.json`, the content lint), `npm run check`, `npm run test:assets`, and
   `npm run verify:game`. `npm run format` writes the formatting; a change that only reformats is its own commit,
   listed in `.git-blame-ignore-revs`. A game's content (`games/`) is linted, never reformatted: the Studio writes it.
4. For browser or visual changes, run the production build and `npm run e2e:smoke -- http://127.0.0.1:5173/`; inspect the screenshots.
5. Never add private source assets or material with unclear commercial rights.

Keep changes small and include a regression test for bug fixes. A branch that changes the code writes its CHANGELOG bullets and its LOG entry as a fragment under `changes/` (`changes/README.md`), not in `CHANGELOG.md` or `docs/dev/LOG.md` directly (a release branch is the exception: it assembles the fragments and edits the CHANGELOG itself): the assembly on `main` orders and numbers them. Public DSL, save and plugin contracts follow SemVer from v3 onward, except on the 4.1.8–4.1.15 incubation line (`wiki/en/start.stability.md`: a break is documented, with a migration); internal modules are not compatibility promises unless documented otherwise.

## Reading the code

Start with `wiki/en/contribute.architecture.md` (the layers, the life of an action, what is public), then walk
`wiki/en/contribute.code-tour.md` (half an hour). `src/engine/BOUNDARIES.md` says what each folder may import and where each
responsibility of the engine, the player and the solver lives; `docs/dev/adr/` explains the decisions that look
surprising. A behaviour-preserving change keeps `npm run quality:baseline -- --check` green: the same witnesses,
proofs, golden saves and public surface. A new test or a lighter bundle is a ratchet: run `npm run quality:baseline`,
which rewrites the JSON and the READMEs' figures with it, and commit them.

## What CI runs

A pull request runs in tiers (`.github/workflows/ci.yml`, 4.1.9). The fast tier runs on every change: `plan`, then
`check` (formatting, lint, knip, both TypeScript configurations, the sample game's gates and build, the baseline, its
proof, `audit:deps` when the lockfile moved) beside `coverage` (the unit suite, once, under coverage; a floor that could
rise is a warning on a pull request). The second tier waits for `check` and runs only what the change can break, as
`tools/ci-plan.ts` reads the diff (`npm run ci:plan` shows it locally): a Bridge change runs Reality, a painter the
browser rows and the reference chapter, the template the packaging jobs, a docs-only change none of them. A job the
plan spares still appears and succeeds with "not needed by the plan". The workflow itself, the plan, a shared
configuration (`package.json`, the lockfile, `vite.config.ts`, the tsconfigs), the engine's core and any path the plan
does not know run everything. On `main` and on a tag everything runs, the coverage ratchet is strict and the mutation
sets run; label a pull request `full-ci` (then push) to get the same before merging. `pr-gate` sums every job up.

## Changing a command, end to end

A command (`Cmd`) is read by the engine, the validator, the solver, the puzzle graph, the texts, the Studio and the
MCP. Touch each in this order, and the type check or a test refuses what you forget:

1. **Type**: the variant of `Cmd` in `src/engine/core/types/content.ts`, with a doc comment.
2. **Catalogue**: its key in `CMD_KEYS` (`src/engine/core/cmds.ts`); in `CHANGES` if it changes the state (the solver
   and the no-op memo read it), in `CONTAINERS` / `subLists` if it holds command lists, in `TEXTS` if it carries a line.
3. **Engine**: its branch in `step` (`src/engine/core/command-runtime.ts`), the screen through a `Presenter` method
   (`src/engine/core/ports.ts`, implemented by `App` and `FakePresenter`), and what it reads and writes recorded
   (`Engine.reads` / `writes`) if it touches the state.
4. **Validator**: its references and values checked in `src/engine/tools/validate.ts`.
5. **Solver and puzzle graph**: nothing to do if the catalogue is right; a command that branches or waits needs a look at
   `src/engine/tools/puzzle.ts` and `src/engine/tools/solve/expansion.ts`.
6. **Texts**: a command carrying a line is walked by `src/engine/tools/i18n.ts` (extraction, locales).
7. **Studio**: its form in `src/studio/schema.ts`; the MCP reads the same schemas (`wiki/en/studio.mcp-setup.md`).
8. **Tests**: an example in the table of `tests/cmds.test.ts` (every key must have one), a behaviour test in
   `tests/core.test.ts`, and a validator case.
9. **Docs**: the wiki's pages that describe it, in both languages (`wiki/en/create.*.md` and `wiki/fr/create.*.md`, `npm run wiki -- check`), the CHANGELOG.

**Worked example: `{ shake: ms }`**, the screen shaking for a moment. The type is `| { shake: number }` in
`core/types/content.ts`; `'shake'` is in `CMD_KEYS` but not in `CHANGES` (it changes nothing the solver keys on, so a
shake is a no-op for a proof); `step` calls `ui.shake(ms)` unless a cutscene is being skipped (`core/command-runtime.ts`), which `App` draws with a CSS
animation and `FakePresenter` ignores; the validator accepts it inside a looping animation's frame events, with
`sfx`, and nothing else (`tools/validate.ts`); the Studio offers it as "Shake (ms)", 0 to 5000 (`src/studio/schema.ts`);
`tests/cmds.test.ts` holds `shake: { shake: 2 }`. A review of such a change reads these files in this order.
