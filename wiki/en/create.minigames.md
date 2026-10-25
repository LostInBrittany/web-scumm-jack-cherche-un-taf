# Built-in minigames

The engine ships eight minigames. A game plays one with the `minigame` command; when it ends, the commands in `then`
run. This page lists each one, its gesture and its parameters, as the 4.4.0 code reads them
([`src/engine/minigames/`](../../src/engine/minigames/)). To write your own, see
[A custom minigame](create.custom-minigame.md).

<a name="available"></a>

## The contract, and the list

Each minigame declares its contract: `required` params, `textParams` (the player-visible strings, extracted for
translation) and `bindings` (the params that name an image or a sound: `validate` checks they exist, e.g. `stroke`'s
`sfx`, `cables`' `sfx.ring` / `sfx.stamp`, `scratch`'s `ticket` and `sfx`). Their metadata is in
[`src/engine/minigames/meta.ts`](../../src/engine/minigames/meta.ts).

> Where the commands run: this page writes them for the engine repository (`npm run validate`, `npm run solve`,
> with `GAME=<id>` in front for another game than the default). In a created project, the same tools are
> `npx quest-n-click validate`, `npx quest-n-click solve` (`--prove`, `--chapters`), `npx quest-n-click lint`,
> `npx quest-n-click i18n status` and `npx quest-n-click voices`, and the sources are in `game/` instead of
> `games/<id>/`.

Every minigame but `pick` and `code-wheel` accepts `intro` (a line from the hints voice at the start); `pick` shows
each round's `prompt` instead, `code-wheel` its `question`. Every one but `scratch` accepts `win` (the closing line). The engine never names an
image: each minigame gets its own from `params`. **Bold** parameters are required; `npm run validate` flags the ones
that are missing (`minigame "pipes": missing required param "tank"`), and an unknown id
(`unknown minigame: "…" (known: …)`).

| Id | Gesture | Parameters |
|---|---|---|
| `pipes` | Tap a pipe to rotate it a quarter turn | **`tiles`** `{ ground, straight: [dry, wet], elbow: [dry, wet], tee: [dry, wet] }` (base images: straight left-right, elbow left-down, tee left-right-down), **`source`**, **`nozzle`** `[dry, spraying]`, **`tank`**, `mushrooms` `[thirsty, happy]`, `cols` (4), `rows` (3), `helpAfter` (15 taps before the right pipe glows), `background` |
| `stroke` | Pet slowly: a gauge rises | **`target`** (the animal's image), **`hand`** (the ghost hand's image), `goal` (100), `sfx` (the success sound), `tooFast` (line shown if too fast) |
| `pick` | Tap the right image | **`rounds`** `[{ prompt, options: [image…], answer }]`, `decoy` (a trick image), `decoyLine`, `wrongLine`, `background` |
| `hide` | Find the right hiding spot | **`spots`** `[{ img, x, y, h, reply, found }]`, `bg` (background image), `answer` (index of the right one; default the last spot) |
| `runner` | Top of the screen: jump, bottom: duck | **`hero`** `{ run: [images], jump, slide, stumble, h, slideH }`, `buddy` (same shape, a second runner behind), **`chaser`** `{ frames: [images], fps, x, speed, h }`, **`obstacles`** `{ jump, duck }` (jumped over on the ground, ducked under when suspended), **`bg`** (scrolling background), `seconds` (20), `stumble` (line shown on a stumble) |
| `cables` | Pull a plug: its cable wiggles through the knot; drag it onto the right socket | **`board`** (a 4-socket panel), **`knot`**, **`plugs`** `{ color: image }` (free color ids, 4 at most), `sockets` (order of the colors on the panel, top to bottom), `tints` `{ color: css }`, `gags` (`lamp`, `phone`, `toaster`, `windows`; a gag missing its images or text is dropped), `lampOn`, `lampOff`, `phone`, `toaster`, `windowsText`, `sfx: { ring, stamp }`, `helpAfter` (4), `background` |
| `scratch` | Scratch a ticket | **`ticket`** (image), `text`, `color`, `sfx` (sound while scratching), `threshold` (0.55 of the surface), `cover` (text printed on the silver layer), `hold` (3200 ms shown once revealed), `background`, `skippable`; used by the sealed ending via `ending.scratch` |
| `code-wheel` | Turn two discs, read the window, type the answer | **`actors`** `[{ id, label, img? }]` (3 to 11, an odd number), **`symbols`** (as many), **`answers`** (as many, all different), `mode` (`parody`), `tries` (3), `seed`, and the texts `question`, `wrong`, `pass`, `win`, `fail`, `list`, `turnLeft`, `turnRight` |

A game can add its own minigames: `export const minigames = { mygame: { required: ['…'], run(ctx) { … } } }` in
`index.ts` ([A custom minigame](create.custom-minigame.md)).

Example:

```ts
{ music: { push: 'minigame' } },
{ minigame: 'pipes', params: {
  tiles: { ground: 'pipes/r3c1', straight: ['pipes/r3c2', 'pipes/r3c5'], elbow: ['pipes/r3c3', 'pipes/r3c6'], tee: ['pipes/r3c4', 'pipes/r4c1'] },
  source: 'pipes/r4c2', nozzle: ['pipes/r4c3', 'pipes/r4c4'], tank: 'house/r3c6', mushrooms: ['house/r4c5', 'house/r4c6'],
  intro: 'Khhh… turn the pipes… until the plants get water.', win: 'Khhh… they drank.',
}, then: [
  { music: { pop: true } },
  { say: ['grandpa', 'Thanks. Now I remember: I left your key at the market.'] },
  { unlock: 'market' },
] },
```

`{ music: { push: 'minigame' } }` and `{ music: { pop: true } }` around it switch to the minigame's music and back
([Music in stems](create.music.md)).

> [!LIMIT id=minigame-solver-counts-won]
> The solver does not play a minigame: it counts it as won and runs `then`. A puzzle that only a minigame's result
> decides is not proven by `npm run solve`.

<a name="skip-and-failure"></a>

## Skip, failure and the result

- **Skip.** Every built-in minigame has a "Skip" button, except `scratch` (the sealed ending itself, unless
  `skippable: true`) and a `code-wheel` in `strict` mode. Skipping still runs `then`, so the story goes on. Its label
  is the game's `ui.skip`.
- **Failure.** None of the built-in minigames can be failed, except a `code-wheel` in `story` mode, which ends
  `failed` after its `tries`.
- **The result** (4.1.16). In the player, a minigame that ends writes how it ended in the reserved flag
  `minigame.<id>`: `won`, `passed`, `skipped`, `failed` or `disabled` (every minigame says `skipped` or `won`; only
  the code wheel says the others). The story reads it with `{ flag: 'minigame.pipes', eq: 'skipped' }`, the journal
  reports it as `flagChanged`, and a session records it so a replay plays it back. A command can never set a
  `minigame.*` flag (the validator refuses it). The solver records none: it does not explore branches hung on that
  flag.

<a name="choosing"></a>

## Choosing one for the story

Use one as **a gate the player understands**: the fiction says why you play it. The tank needs another way out, so you
lay pipes. The seller wants flowers, so you pick them. Keep it short: 30 seconds, not 3 minutes (three rounds of
`pick`, one 4 × 3 grid of `pipes`), with `helpAfter` so the right pipe glows when the player is lost, and `intro` and
`win` lines in the hint voice. The reasoning is in [Puzzle design](create.puzzle-design.md#minigames).

| Minigame | Fits a fiction about |
|---|---|
| `pipes` | water, plumbing, irrigation, anything that flows |
| `cables` | electricity, a switchboard, a tangle behind the TV |
| `pick` | shopping, choosing the right one, a recipe, a line-up |
| `hide` | hide and seek, finding someone or something in a scene |
| `runner` | a chase, an escape, a race to catch a bus |
| `stroke` | calming an animal, putting a baby to sleep |
| `scratch` | the sealed ending only ([The sealed ending](create.sealed-ending.md)) |
| `code-wheel` | a playful copy-protection wheel of the 1990s, drawn from your own characters ([Remix](create.remix.md)) |

<a name="pipes"></a>

## `pipes`

A grid of pipes (`cols` × `rows`, default 4 × 3, at least 2 × 1) to rotate until water runs from `source` to the
`nozzle`, which waters the `mushrooms`. Required: `tiles`, `source`, `nozzle`, `tank`. Texts: `intro`, `win`.
`helpAfter` (15) is the number of taps before the right pipe glows.

<a name="stroke"></a>

## `stroke`

Pet the `target` slowly with a finger; the ghost `hand` shows the gesture; a gauge rises to `goal` (100). Required:
`target`, `hand`. Texts: `intro`, `win`, `tooFast`. Binding: `sfx` must be a sound of `audio.sfx`.

<a name="pick"></a>

## `pick`

Rounds of images; tap the `answer` of each. Required: `rounds`. Texts: each round's `prompt`, `decoyLine`,
`wrongLine`, `win`; no `intro` (the first round's `prompt` opens it). A `decoy` image says `decoyLine` when tapped.

<a name="hide"></a>

## `hide`

Hiding spots drawn over `bg`; each answers with its `reply`, the right one (`answer`, default the last spot) ends it.
Required: `spots`. Texts: `intro`, `win`, each spot's `reply`.

<a name="runner"></a>

## `runner`

A side-scrolling chase for `seconds` (20): tap the top of the screen to jump, the bottom to duck. Required: `hero`,
`chaser`, `obstacles`, `bg`. Texts: `intro`, `win`, `stumble`. The jump and duck labels are the game's interface
texts.

<a name="cables"></a>

## `cables`

Up to four plugs, each tangled in the `knot`, to drag onto the right socket of the `board`. Required: `board`, `knot`,
`plugs`. Texts: `intro`, `win`, `windowsText`. Bindings: `sfx.ring` and `sfx.stamp` must be sounds of `audio.sfx`. A
gag (`lamp`, `phone`, `toaster`, `windows`) missing its images or its text is dropped.

<a name="scratch"></a>

## `scratch`

A silver layer that rubs off under a finger; it ends when `threshold` (0.55) of the surface is scratched and the
`text` was shown for `hold` ms (3200). Required: `ticket`. Text: `intro` (the `text` is the decrypted sealed ending,
given at run time, never content to translate). Bindings: `ticket` (an image) and `sfx`. Used by the sealed ending
through `ending.scratch`.

<a name="code-wheel"></a>
<!-- applies: .. since 4.1.15 -->

## `code-wheel`

"The Extremely Legitimate Pirate Check": two discs drawn from the game's own characters and symbols, never DRM (the
answer is in the page, and the wheel says so). Required: `actors`, `symbols`, `answers`: an odd number of actors from
3 to 11, as many symbols and as many different answers. `mode`: `parody` (default: after `tries` wrong answers, 3 by
default, the player is let through, `passed`), `story` (ends `failed` after its tries), `strict` (no skip, never lets
through), `cosmetic` (any answer wins), `disabled`, `daily`. The `seed` is filled from the world's seed by Remix.
Turned by buttons, arrow keys or a gamepad, announced to a screen reader, readable as a plain list. `npm run code-wheel`
prints it. Everything about it, its proof and the speedrun rules: [Remix](create.remix.md).

<a name="related"></a>

## Related identifiers

- The command: `{ minigame: '<id>', params: { … }, then: [ … ] }` ([Game commands](create.commands.md)).
- The flag `minigame.<id>`; `ending.scratch`; `audio.sfx` for the bindings.
- `npm run validate`, `npm run i18n` (the `textParams` are extracted for translation).
- The API: `minigames`, `Minigame`, `MinigameCtx`, `MINIGAME_CSS` from `@quest-n-click/engine/minigames`
  ([Public API](engine.api.md#minigames)).
