# Code tour

Half an hour with the code open: eight stops, from a tiny game to the test that proves each part. Each stop names the
files to read and the test that shows them at work. [Architecture](contribute.architecture.md) is the same map seen
from above.

<a name="overview"></a>

## What you will build

Not a feature: a picture of the engine in your head, made by reading real code and running the test of each stop. You
need a prepared repository ([Developer setup](contribute.setup.md)) and an editor. Every test of a stop runs alone:

```sh
# in the engine repository
npx vitest run <file>
```

The tour follows the code of 4.4.0; its stops date from 4.1.0 (and 4.1.1 for the signal).

<a name="declare"></a>

## 1. Declare a small game

<!-- step: declare -->
Read [`tests/fixtures/classics.ts`](../../tests/fixtures/classics.ts): five tiny games after the classics (`insults`,
`grog`, `dott`, `mansion`, `stan`), each a `GameDef` of a few rooms and rules. A rule is `{ verb, a, b, if, do }`;
`do` is a list of commands (`Cmd`, in [`src/engine/core/types/content.ts`](../../src/engine/core/types/content.ts)).
The types of a whole game are in [`src/engine/core/types/game.ts`](../../src/engine/core/types/game.ts). The demo,
written the same way but larger, is `games/demo/`.

```sh
# in the engine repository
npx vitest run tests/classics.test.ts
```

You see each classic mechanic played to its end by the real engine.

<a name="compile"></a>

## 2. Compile and freeze it

<!-- step: compile -->
`compileGame` in [`src/engine/core/define.ts`](../../src/engine/core/define.ts) clones the content, fills the
defaults, freezes it and gives each rule, choice, topic, listener and script step a stable id
([`src/engine/core/content-ids.ts`](../../src/engine/core/content-ids.ts)). Saves and sessions speak in those ids, so
renaming a line does not break a save.

```sh
# in the engine repository
npx vitest run tests/compile.test.ts tests/stable-ids.test.ts
```

<a name="start"></a>

## 3. Start a game

<!-- step: start -->
`new Engine(game, layouts, presenter, store)` then `newGame()`
([`src/engine/core/engine.ts`](../../src/engine/core/engine.ts)). In the tests the presenter is `FakePresenter` and the
store `MemoryStore` ([`src/engine/core/ports.ts`](../../src/engine/core/ports.ts)); in the browser `App`
([`src/engine/dom/app.ts`](../../src/engine/dom/app.ts)) composes the engine with the `DomPresenter`, and `bootGame`
([`src/engine/boot.ts`](../../src/engine/boot.ts)) wires everything.

```sh
# in the engine repository
npx vitest run tests/core.test.ts -t "fixture game"
```

<a name="run-an-action"></a>

## 4. Run an action

<!-- step: run-an-action -->
`Engine.act` walks there, opens a session entry and calls `resolve`
([`src/engine/core/interactions.ts`](../../src/engine/core/interactions.ts)): the rule `findRule` picks, else a kind,
else a fallback. Its commands run in `exec` and `step`
([`src/engine/core/command-runtime.ts`](../../src/engine/core/command-runtime.ts)), each through its handler in
[`src/engine/core/command-handlers.ts`](../../src/engine/core/command-handlers.ts); events and scripts in
[`src/engine/core/event-runtime.ts`](../../src/engine/core/event-runtime.ts) and
[`src/engine/core/script-runtime.ts`](../../src/engine/core/script-runtime.ts).

```sh
# in the engine repository
npx vitest run tests/core-runtime.test.ts
```

Each runtime module is called on its own there, with the engine as its first argument.

<a name="save-load-replay"></a>

## 5. Save, load and replay

<!-- step: save-load-replay -->
`saveEnvelope` and `parseSave` ([`src/engine/core/save.ts`](../../src/engine/core/save.ts)) write and check a save;
`migrate` ([`src/engine/core/migrate.ts`](../../src/engine/core/migrate.ts)) carries an old one forward;
`tests/save-v3.test.ts` loads one save per release since 3.0 and plays it to the ending. The session
([`src/engine/core/session-runtime.ts`](../../src/engine/core/session-runtime.ts)) records every input with a digest of
the state after it; `replay` ([`src/engine/tools/replay.ts`](../../src/engine/tools/replay.ts)) plays it again and
names the first entry that differs.

```sh
# in the engine repository
npx vitest run tests/replay.test.ts -t "a recorded session"
```

<a name="solver"></a>

## 6. The same action in the solver

<!-- step: solver -->
`solve` ([`src/engine/tools/solve/search.ts`](../../src/engine/tools/solve/search.ts)) takes a state from the
frontier; `makeExpander` ([`src/engine/tools/solve/expansion.ts`](../../src/engine/tools/solve/expansion.ts)) runs every
action worth trying on a real `Engine`, records each transition (`TryRecord`,
[`src/engine/tools/solve/model.ts`](../../src/engine/tools/solve/model.ts)) and what it read and wrote; the search merges
them and gives its verdict. What a state is made of for the search is in
[`src/engine/tools/solve/abstractions.ts`](../../src/engine/tools/solve/abstractions.ts).

```sh
# in the engine repository
npx vitest run tests/solver-contract.test.ts
npm run quality:baseline -- --check
```

`tests/memo.test.ts` is a heavy test (minutes): it runs in the nightly and the candidate, or alone with
`npx vitest run tests/memo.test.ts`. The behaviour of every game is frozen by `tests/quality-baseline.json`, which
`quality:baseline -- --check` compares ([The quality baseline](contribute.quality-baseline.md)).

<a name="signal"></a>

## 7. A signal from the world outside (4.1.1)

<!-- step: signal -->
[`tests/fixtures/signals.ts`](../../tests/fixtures/signals.ts) declares three signals;
[`src/engine/reality/protocol.ts`](../../src/engine/reality/protocol.ts) checks a signed one before it is read;
[`src/engine/reality/client.ts`](../../src/engine/reality/client.ts) verifies it, hands it to `Engine.receive`
([`src/engine/core/reality-runtime.ts`](../../src/engine/core/reality-runtime.ts): applied at most once, a session
entry), waits for the durable save, then acknowledges. The solver offers signals under a policy
([`src/engine/tools/solve/scenarios.ts`](../../src/engine/tools/solve/scenarios.ts)). The reference Bridge is
`bridge/src/`.

```sh
# in the engine repository
npx vitest run tests/reality-engine.test.ts tests/reality-proof.test.ts tests/bridge.test.ts
```

`tests/reality-engine.test.ts` crashes the engine at each boundary. In the browser, `scripts/e2e-reality.mjs` plays the
same path (`npm run e2e:reality`).

<a name="find-the-test"></a>

## 8. Find the test of a thing

<!-- step: find-the-test -->
- **A command**: grep its key in `tests/cmds.test.ts` and `tests/core.test.ts`.
- **A layer rule**: `tests/boundaries.test.ts`.
- **The public names**: `tests/api-surface.json`.
- **A browser behaviour**: the scripts `scripts/e2e*.mjs` (`npm run e2e`, `e2e:taps`, `e2e:pwa`, `e2e:a11y`…), which
  CI runs in Chromium and WebKit (and Firefox for the PWA).

Which suite runs where, and when, is [Which tests run when](contribute.which-tests.md#find-the-test-of-a-thing).

> [!LIMIT id=tour-scope]
> The tour stays inside the engine. The Studio, the Studio Server and the connectors have their own entry points
> (`src/studio/`, `studio-server/src/`, `connectors/src/`), not walked here.

<a name="what-you-learned"></a>

## What you learned

- A game is data, compiled and frozen with stable ids: [Architecture](contribute.architecture.md#a-game-is-data).
- One engine runs in the player, the tests and the solver, behind the `Presenter` port.
- Each part has its test, and the baseline freezes the whole: [The quality baseline](contribute.quality-baseline.md).

<a name="next"></a>

## Where to go next

- [The dev loop](contribute.dev-loop.md#changing-a-command): change a command end to end.
- [Import boundaries](contribute.boundaries.md): what each folder may import.
