# Custom code

When the DSL is not enough, a game defines its own commands in TypeScript. This page explains how they stay
compatible with the validator, the solver and the save, and how to write one.

<a name="custom-commands"></a>

## Custom commands

A game exports its own commands from its `index.ts` (`game/index.ts` in a created project, `games/<id>/index.ts` in
the engine repository); a rule or a script then calls one by name:

```ts
import type { CustomCommands } from '@quest-n-click/engine/content';

export const commands: CustomCommands = {
  sparkle: { pure: true, run: async ({ scene, args }) => { /* draw stars over `scene` for args.ms */ } },
  explode: { effects: [{ set: 'chicken_exploded' }, { lose: 'chicken' }, { sfx: 'boom' }], run: ({ scene }) => { /* the blast */ } },
};
// in a rule or a script:  { custom: 'sparkle', args: { ms: 1200 } }
```

A custom command has two parts ([`src/engine/core/custom.ts`](../../src/engine/core/custom.ts)):

- **`effects`** says what the command does to the game, as plain commands. They run first, in the browser **and** in
  the solver, so a custom command never breaks `npm run solve` nor the save.
- **`run`** is the visual part, browser only. It gets the game, the state to read, the room, the arguments (`args`),
  the presenter (`ui`), the scene element (`scene`, DOM painter only) and `fast` (true while a cutscene is skipped:
  finish at once). It does not run in node, nor while a cutscene is skipped.

A command that changes nothing says `pure: true`. The validator refuses a `{ custom }` naming a command the game does
not export, and a command that declares neither `effects` nor `pure`; it checks the commands of `effects` like any
other.

> [!GUARANTEE id=custom-effects-everywhere]
> A custom command's declared `effects` apply in the engine and in the solver alike; its `run` runs only when the engine
> is asked to run it.

> [!LIMIT id=run-must-not-change-state]
> `run` must not touch the state. In dev mode (with the journal on) the engine compares the state before and after it,
> and reports in the journal and the error handler a `run` that changed something outside its `effects`
> (`custom "x" changed … outside its declared effects`). In production nothing stops it, and the solver, the saves and
> the replay only know `effects`: a change made by `run` alone is invisible to them.

<a name="steps"></a>

## Writing one

<!-- step: declare -->
1. In the game's `index.ts`, add the command to the exported `commands` (the template exports an empty one). Put in
   `effects` every change to the game, as DSL commands; if there is none, write `pure: true`.

<!-- step: draw -->
2. Write `run`: draw into `scene`, wait for your animation, clean up after yourself, and return quickly when `fast`
   is true.

<!-- step: call -->
3. Call it from a rule, a topic or a script: `{ custom: 'explode', args: { … } }`.

<!-- step: check -->
4. Check it:

   ```sh
   # in the engine repository
   npm run validate
   npm run solve
   ```

   ```sh
   # in the created project
   npx quest-n-click validate
   npx quest-n-click solve
   ```

   Then play it on the dev server (`npm run dev`) with the browser console open: a `run` that changes the state is
   reported there.

A minigame is the other kind of game code: [a custom minigame](create.custom-minigame.md).

<a name="why"></a>

## Why effects are declared

The content is data so that every tool can read it ([principles](create.principles.md#why)). A function cannot be
read without running it, and the solver and the validator run in node, without a browser. Declaring the effects as
DSL commands lets the solver apply them without the code, lets the save record them, and lets the replay reproduce
them; the code keeps what only a browser can do, drawing.

The code is trusted: it ships with the game and is hashed in its fingerprint (`trustedExtensions`, so a change to a
custom command's code is seen as such). On a hosted Studio, the game's code, custom commands included, runs in a
separate worker that holds no secret of the platform ([ADR 0028](../../docs/dev/adr/0028-studio-content-execution.md)).

<a name="alternatives"></a>

## Alternatives set aside

- **Callbacks in the content**: the solver would have to run the browser's code, or ignore it and prove a different
  game.
- **A plugin that changes the state freely**: saves and replays would no longer reproduce a game.

<a name="trade-offs"></a>

## Trade-offs

A command whose effect depends on what happens in its `run` (a reflex game whose outcome changes the story) cannot be
expressed as fixed `effects`: that is a minigame, whose result the engine records and the solver explores. Some ideas
take a custom command instead of three lines of code.

<a name="decisions"></a>

## Decisions and ADRs

- [ADR 0002, content is data; the code a game needs is trusted and named](../../docs/dev/adr/0002-declarative-content.md)
- [ADR 0003, the solver runs the real engine](../../docs/dev/adr/0003-solver-runs-the-engine.md)
- [ADR 0028, where a hosted Studio runs the game's code](../../docs/dev/adr/0028-studio-content-execution.md)
