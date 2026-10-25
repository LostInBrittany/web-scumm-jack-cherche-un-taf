# The dev loop

How to change the engine one small step at a time, and how to carry a change through every place that reads it. The
worked case is the hardest common one: adding or changing a command of the DSL.

<a name="what-you-get"></a>

## What you get

A change that compiles, whose own tests pass, that the validator, the solver, the Studio and the MCP all understand,
and that you have looked at in the browser, before you run the full list of
[Before a pull request](contribute.before-a-pr.md).

<a name="context-and-versions"></a>

## Context and versions

The engine repository, on your machine. The command table (`HANDLERS`, `src/engine/core/command-handlers.ts`) exists
since 4.1.5; the catalogue `src/engine/core/cmds.ts` since 4.1.0. This page describes the code as of 4.4.0.

<a name="prerequisites"></a>

## Prerequisites

- A prepared repository: [Developer setup](contribute.setup.md).
- The map of the code: [Architecture](contribute.architecture.md); the walk through it:
  [Code tour](contribute.code-tour.md).

<a name="where-to-run"></a>

## Where to run the commands

In the engine repository, on your machine. `GAME=<id>` picks another game than the current one
([Developer setup](contribute.setup.md#steps)).

<a name="steps"></a>

## Steps

<!-- step: run-one-file -->
1. **Run the tests closest to what you change**, not the whole suite, while you work.

   ```sh
   # in the engine repository
   npx vitest run tests/core.test.ts          # one file
   npx vitest run tests/core.test.ts -t "fixture game"   # one test by name
   npx vitest tests/cmds.test.ts              # watch mode: re-runs on save
   ```

   [Which tests run when](contribute.which-tests.md#find-the-test-of-a-thing) says which file tests what.

<!-- step: type-check -->
2. **Type-check** as you go: the catalogue and the command table refuse a command you forgot, at compile time.

   ```sh
   # in the engine repository
   npm run -s tsc -- --noEmit
   npm run -s tsc -- --noEmit -p tsconfig.strictest.json   # every index access checked in src/
   ```

<!-- step: check-game -->
3. **Ask the game.** After a change that a game can feel, the truth commands answer in seconds:

   ```sh
   # in the engine repository
   npm run validate && npm run solve && npm run lint
   ```

   `validate` names broken ids and values, `solve` proves the game can still be finished from New Game, `lint` (the
   content lint) finds conditions nothing sets, hidden rules and actions never run.

<!-- step: look -->
4. **Look at it.** `npm run dev` serves the game at `http://localhost:5173/`; `npm run studio` opens the local Studio,
   which shows each room rendered by the real engine and reloads when a file changes. A visual change is looked at,
   not assumed: `?dev&at=<checkpoint>` starts the game at a checkpoint
   ([Dev URL parameters](reference.dev-url-parameters.md)).

<a name="changing-a-command"></a>

### Changing a command, end to end

<!-- step: command-end-to-end -->
5. **Changing a command, end to end.** A command (`Cmd`) is read by the engine, the validator, the solver, the puzzle
   graph, the texts, the Studio and the MCP. Touch each in this order; the type check or a test refuses what you
   forget:

   1. **Type.** Its variant of `Cmd` in [`src/engine/core/types/content.ts`](../../src/engine/core/types/content.ts),
      with a doc comment.
   2. **Catalogue.** Its key in `CMD_KEYS` ([`src/engine/core/cmds.ts`](../../src/engine/core/cmds.ts)): a variant
      missing from it, or a key no variant has, does not compile. Add it to `CHANGES` if it changes the state (the
      solver and the no-op memo read that set), to `CONTAINERS` and `subLists` if it holds command lists.
   3. **Engine.** Its handler in `HANDLERS`
      ([`src/engine/core/command-handlers.ts`](../../src/engine/core/command-handlers.ts)), which `step`
      ([`src/engine/core/command-runtime.ts`](../../src/engine/core/command-runtime.ts)) looks up by key; the type of
      the table refuses a missing handler. The screen is reached through a `Presenter` method
      ([`src/engine/core/ports.ts`](../../src/engine/core/ports.ts)), implemented by `DomPresenter`
      ([`src/engine/dom/presenter.ts`](../../src/engine/dom/presenter.ts)) and by `FakePresenter`. If it touches the
      state, what it reads and writes is recorded (`Engine.reads` and `Engine.writes`).
   4. **Validator.** Its references and values checked in
      [`src/engine/tools/validate.ts`](../../src/engine/tools/validate.ts).
   5. **Solver and puzzle graph.** Nothing to do if the catalogue is right; a command that branches or waits needs a
      look at [`src/engine/tools/puzzle.ts`](../../src/engine/tools/puzzle.ts) and
      [`src/engine/tools/solve/expansion.ts`](../../src/engine/tools/solve/expansion.ts).
   6. **Texts.** A command that carries a line needs its branch in the texts walker,
      [`src/engine/tools/i18n.ts`](../../src/engine/tools/i18n.ts) (extraction, locales), beside `say`, `toast`,
      `guide` and `choice`.
   7. **Studio.** Its form in [`src/studio/schema.ts`](../../src/studio/schema.ts); the MCP reads the same schemas
      ([MCP tools](studio.mcp-tools.md)).
   8. **Tests.** An example in the table of [`tests/cmds.test.ts`](../../tests/cmds.test.ts) (every key must have
      one), a behaviour test in [`tests/core.test.ts`](../../tests/core.test.ts), and a validator case.
   9. **Docs.** The wiki pages of the command, in both languages ([Game commands](create.commands.md),
      [DSL reference](create.dsl.md)), and the branch's fragment under `changes/`
      ([Conventions](contribute.conventions.md#changes-fragments)).

   A review of such a change reads these files in this order.

<!-- step: worked-example -->
6. **Worked example: `{ shake: ms }`**, the screen shaking for a moment.

   - The type is `| { shake: number }` in `core/types/content.ts`.
   - `'shake'` is in `CMD_KEYS` but not in `CHANGES`: it changes nothing the solver keys on, so a shake is a no-op for
     a proof.
   - Its handler in `command-handlers.ts` calls `eng.ui.shake(c.shake)` unless a cutscene is being skipped
     (`ctx.fast`). `DomPresenter.shake` adds the scene's `shake` CSS class for that many milliseconds; `FakePresenter`
     ignores it.
   - The validator accepts it inside a looping animation's frame events, with `sfx`, and nothing else
     (`tools/validate.ts`: "a looping animation only plays sounds and shakes at a frame").
   - The Studio offers it as "Shake (ms)", from 0 to 5000 in steps of 50 (`src/studio/schema.ts`).
   - `tests/cmds.test.ts` holds `shake: { shake: 2 }`.

> [!LIMIT id=no-function-in-games]
> A game holds no function. Logic a game needs beyond the DSL is a custom command or a minigame, trusted code declared
> beside the content and reached by name ([Custom code](create.custom-code.md)); it is not a new engine command.

<a name="expected-result"></a>

## Expected result, and how to check it

- `npm run -s tsc -- --noEmit` is silent; the test files you touched pass.
- `npm run validate && npm run solve` end green on the sample game (and on `GAME=reference` if your change reaches
  staging or several characters).
- What you changed looks right in the browser or the Studio.

Then go through [Before a pull request](contribute.before-a-pr.md).

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `'a Cmd variant is missing from CMD_KEYS'` at compile time | The variant was added to `Cmd`, not to the catalogue | Add its key to `CMD_KEYS` in `core/cmds.ts` |
| `'CMD_KEYS names a key no Cmd has'` | The key was added to the catalogue only | Add the variant to `Cmd` |
| A type error on `HANDLERS` | No handler for the new key | Add it to the table in `core/command-handlers.ts` |
| `tests/cmds.test.ts` fails on the new key | No example in its table | Add one |
| `quality:baseline -- --check` reports a moved digest | The change altered what the engine does on a frozen game | Intended: rewrite the baseline and say so in the fragment; not intended: find the regression ([The quality baseline](contribute.quality-baseline.md)) |

<a name="files-changed"></a>

## Files or data changed

The source files above; `tests/`; the wiki pages of the command; `changes/<slug>.md`. A command that the solver reads
can move `tests/quality-baseline.json`, which is then rewritten on purpose.

<a name="recovery"></a>

## Recovery or going back

Everything is in Git: `git restore <file>` or `git stash` undoes a local change. `GAME=demo npm run game` puts the `.cache/game`
link back when a `GAME=` experiment left it elsewhere.

<a name="references"></a>

## References

- [Architecture](contribute.architecture.md), [Code tour](contribute.code-tour.md),
  [Import boundaries](contribute.boundaries.md).
- [Which tests run when](contribute.which-tests.md), [Before a pull request](contribute.before-a-pr.md).
- [ADR 0002](../../docs/dev/adr/0002-declarative-content.md), declarative content;
  [ADR 0003](../../docs/dev/adr/0003-solver-runs-the-engine.md), the solver runs the engine.
