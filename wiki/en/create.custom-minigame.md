# A custom minigame

When none of the [built-in minigames](create.minigames.md) fits, a game writes its own in TypeScript and plays it with
the same `minigame` command. This page walks through one, from the contract to the checks.

<a name="overview"></a>

## Overview: minigames as plugins

The engine ships pipes, cables, pick, hide, runner, stroke, scratch and the code wheel. A game adds its own in the
`minigames` its module exports (`index.ts`): an object `{ run(ctx): Promise<void>; required?: string[] }`, where `ctx`
gives the overlay element, the scale, images, sounds, the `params` of the command and an abort signal; `required`
names the params the validator checks. `{ minigame: 'sword_fight', params: { … }, then: [ … ] }` then plays it like a
built-in one. That is the plugin format: the same contract as the built-in ones.

The public module `@quest-n-click/engine/minigames` gives what a plugin needs:

| Name | What |
|---|---|
| `Minigame` | the contract: `run(ctx)`, and what the validator reads (`required`, `textParams`, `bindings`) |
| `MinigameCtx` | what a minigame is given: its zone, images, sounds, parameters, labels, an abort signal |
| `minigames` | the built-in ones (pipes, stroke, pick, hide, runner, scratch, cables, code-wheel), each loaded when it starts |
| `MINIGAME_CSS` | their shared style |

The full signatures are in the [Public API](engine.api.md#minigames) and in
[`src/engine/minigames/types.ts`](../../src/engine/minigames/types.ts).

<a name="what-you-get"></a>

## What you get

A minigame of your own, registered under an id, that a script or a rule starts with
`{ minigame: '<id>', params: { … }, then: [ … ] }`; the validator checks its parameters, images and sounds like a
built-in one's, and the player shows it over the scene with the hint voice's frame.

<a name="context-and-versions"></a>

## Context and versions

A created project (the module is `game/index.ts`) or a game of the engine repository (`games/<id>/index.ts`). The
contract has been public since 4.0; the module is named `@quest-n-click/engine/minigames` since 4.2.5 (`web-scumm/minigames`
before, removed in 4.3.0: `quest-n-click migrate` renames it). `MinigameCtx.random` exists since 4.1.15, the
result a minigame can report since 4.1.16.

<a name="prerequisites"></a>

## Prerequisites

- A game that runs: [Your first game](create.first-game.md).
- Basic TypeScript and DOM: the minigame draws itself with the browser's DOM (or a canvas).
- The images and sounds it uses, prepared like the others ([Images](create.images.md),
  [Sound effects](create.sound-effects.md)).

<a name="where-to-run"></a>

## Where to run the commands

On your machine, in the created project's folder (`npx quest-n-click …`) or in the engine repository
(`GAME=<id> npm run …`). The code goes in the game module: `game/index.ts` in a created project,
`games/<id>/index.ts` in the engine repository.

<a name="steps"></a>

## Steps

<!-- step: write-run -->
1. **Write `run(ctx)`.** It fills `ctx.root` (an element over the scene, 16:10; `ctx.u` is pixels per logical unit,
   the root's width / 640), and returns a promise that resolves when the player won or skipped. A minigame never
   fails by itself: the promise resolves, and `then` runs. Clean up when `ctx.signal` is aborted (the host closes the
   minigame). Images come from `params` through `ctx.img(id)` and `ctx.size(id)`; sounds through `ctx.sfx(id)`;
   `ctx.instruct(text)` shows a line in the hint voice's frame; `ctx.labels.skip` is the game's "Skip" label.

   ```ts
   // game/index.ts in a created project (games/<id>/index.ts in the engine repository)
   import type { Minigame } from '@quest-n-click/engine/minigames';

   const swordFight: Minigame = {
     required: ['foe'],
     textParams: ['intro', 'win'],
     bindings: { images: ['foe'], sfx: ['hit'] },
     run(ctx) {
       return new Promise<void>((resolve) => {
         const box = document.createElement('div');
         ctx.root.append(box);
         const done = () => {
           box.remove();
           resolve();
         };
         ctx.signal.addEventListener('abort', done, { once: true });
         if (typeof ctx.params.intro === 'string') ctx.instruct(ctx.params.intro);
         const foe = document.createElement('img');
         foe.src = ctx.img(String(ctx.params.foe));
         foe.style.height = `${120 * ctx.u}px`;
         let hits = 0;
         foe.addEventListener('click', () => {
           if (typeof ctx.params.hit === 'string') ctx.sfx(ctx.params.hit);
           hits += 1;
           if (hits === 3) {
             if (typeof ctx.params.win === 'string') ctx.instruct(ctx.params.win);
             setTimeout(done, 1200);
           }
         });
         const skip = document.createElement('button');
         skip.textContent = ctx.labels.skip;
         skip.addEventListener('click', () => {
           box.dispatchEvent(new CustomEvent('mg-skip', { bubbles: true }));
           done();
         });
         box.append(foe, skip);
       });
     },
   };
   ```

<!-- step: declare-contract -->
2. **Declare what the tools read.** `required`: the params a `{ minigame }` must give, or the validator refuses it.
   `textParams`: dot paths of the player-visible strings in `params` (`*` visits every item of an array or value of
   an object, as in `rounds.*.prompt`). `bindings`: the params that name an image (`images`) or a sound of
   `audio.sfx` (`sfx`), which the validator checks exist. Any string param shaped like an image id
   (`folder/name`) is checked as an image too.

<!-- step: register -->
3. **Register it** in the module's `minigames`, which the template already exports empty:

   ```ts
   export const minigames: Record<string, Minigame> = { sword_fight: swordFight };
   ```

   The player, the Studio and the validator all read this export, merged over the built-in ones. An id that is
   already a built-in one replaces it for this game.

<!-- step: use-command -->
4. **Play it** from a rule, a topic or a script:

   ```ts
   { minigame: 'sword_fight', params: { foe: 'pirate/r1c1', hit: 'clang', intro: 'Three hits!', win: 'Touché.' },
     then: [{ set: 'pirate_beaten' }] }
   ```

<!-- step: report-result -->
5. **Say how it ended (optional).** The player writes the result in the reserved flag `minigame.<id>`: `skipped` when
   a bubbling `mg-skip` event left the minigame's zone (as the Skip button above sends), `won` otherwise. To give
   another result (`passed`, `failed`, `disabled`), dispatch from inside `ctx.root` a bubbling
   `new CustomEvent('mg-record', { bubbles: true, detail: { result: 'failed' } })` before resolving. The story reads it
   with `{ flag: 'minigame.sword_fight', eq: 'failed' }`.

<!-- step: check -->
6. **Check it.**

   ```sh
   # in the created project
   npx quest-n-click validate
   npx quest-n-click dev
   ```

   ```sh
   # in the engine repository
   GAME=mygame npm run validate
   GAME=mygame npm run dev
   ```

> [!LIMIT id=custom-minigame-solver]
> The solver does not run `run`: it counts the minigame as won and runs `then`, and records no `minigame.<id>` flag.
> Put the minigame's effect on the game in `then` (or in the commands after it), never inside `run`: the save, the
> solver and the replay only know the commands.

> [!LIMIT id=custom-minigame-i18n-extract]
> `npm run i18n -- extract` (`npx quest-n-click i18n extract`) writes the texts of the built-in minigames' params, not
> those of a game's own minigame: as of 4.4.0 it reads the game without its module's `minigames`. Its `textParams`
> are applied when the player loads a translation, but you add their paths to the locale file yourself, and a later
> extract may park them as `_stale`.

> [!LIMIT id=custom-minigame-random]
> `ctx.random` (a draw from the run's `minigame:<id>` stream, the same for the same seed) is given by the engine's
> player and may be absent under another host. Use it rather than `Math.random` when a layout or a timing should
> replay the same.

<a name="expected-result"></a>

## Expected result, and how to check it

`validate` reports nothing about the command. In the game, the rule opens the minigame over the scene, the hint voice
shows `intro`, three taps show `win` and close it, and `pirate_beaten` is set; Skip closes it at once and `then` runs
too. The dev journal (`?dev`) shows the `minigame.sword_fight` flag change.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `unknown minigame: "sword_fight" (known: …)` | Not in the module's `minigames`, or a typo in the id | Register it under that exact id |
| `minigame "sword_fight": missing required param "foe"` | The command does not give a param listed in `required` | Add the param, or drop it from `required` |
| `minigame "sword_fight": "foe" must be an image id` | A param of `bindings.images` is not a string | Give an image id, `folder/name` |
| `minigame "sword_fight": unknown sound "clang" (audio.sfx)` | A param of `bindings.sfx` names no sound of `audio.sfx` | Declare the sound ([Sound effects](create.sound-effects.md)) |
| `… image not found: "pirate/r1c1"` | The image is not cut or not prepared | `npm run assets` (`npx quest-n-click assets`) |
| The minigame never closes | `run`'s promise never resolves | Resolve on win, on skip and on `ctx.signal` abort |

<a name="files-changed"></a>

## Files or data changed

The game module (`game/index.ts`, or `games/<id>/index.ts`) and the content that plays it. A player's saves gain the
flag `minigame.<id>` once the minigame was played.

<a name="recovery"></a>

## Recovery or going back

Remove the command, then the entry in `minigames`: the validator refuses a command whose minigame is no longer
registered, so it shows every place left. A `minigame.<id>` flag in older saves stays there and is harmless unless the
story reads it.

<a name="references"></a>

## References

- [`src/engine/minigames/types.ts`](../../src/engine/minigames/types.ts): the contract; the built-in minigames beside
  it are working examples (`src/engine/minigames/util.ts` holds their helpers, not part of the public API).
- [`src/engine/dom/presenter.ts`](../../src/engine/dom/presenter.ts): how the player runs a minigame and reads its
  result.
- [Built-in minigames](create.minigames.md), [Public API](engine.api.md#minigames),
  [Custom code](create.custom-code.md) for custom commands.
