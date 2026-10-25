# Remix

Remix lets one game produce several games that really differ: where an item is, where a character starts and which
round he walks, a code and its hint, the order of two groups of puzzles, a line said another way. It never turns the
story into random content. Every variation is declared by the author, finite, deterministic from a seed, and
understood by the validator, the solver, the saves, the replay, the Studio and the speedrun tools. The design is
[ADR 0018](../../docs/dev/adr/0018-variation-manifest-and-world-variant.md); the decisions are D25 to D28
([`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md)). Remix arrived in 4.1.15.

The first half of this page is a tutorial (move one key between three hiding places), the second a reference of the
manifest, the seeds, the tools and what the player sees.

<a name="what-you-will-build"></a>

## What you will build

The sample game's key, which the seller hands over on his stall in the story, hidden in one of three spots of the
market depending on the world: on the stall, under the oranges, inside the lantern. A seed such as `WS-0000-02DZ`
names one world; the same seed gives the same world on every machine and browser. At the end, `npm run remix` prints
the world a seed makes and `npm run verify:variants` proves every world can be finished.

The whole example is in the repository: [`games/demo/game.ts`](../../games/demo/game.ts) (the manifest) and
[`games/demo/rooms/market.ts`](../../games/demo/rooms/market.ts) (the anchors and the branches).

<a name="what-you-need"></a>

## What you need

- The engine repository, installed ([Install from the repository](install.from-repository.md)), with a game of your
  own or the `demo` game selected (`GAME=<id>` or `npm run game`).
- A game you can already finish: `npm run validate` and `npm run solve` green ([Checking your game](create.checking.md)).
- Twenty minutes.

> [!LIMIT id=engine-repo-tools]
> The Remix tools (`npm run remix`, `npm run verify:variants`, `npm run code-wheel`) are scripts of the engine
> repository. A created project's `quest-n-click` command has none of them: there, the manifest still works in the
> game, but you check its worlds from a clone of the engine repository.

<a name="steps"></a>

## Steps

<!-- step: anchors -->
1. **Tag the spots.** In the room, declare the anchors the item may be placed at. `anchors` is a record keyed by the
   anchor's id; `at` names the prop or hotspot it stands on:

   ```ts
   // games/<id>/rooms/market.ts
   anchors: {
     stall: { at: 'stall', reachableBy: 'bouquet_given', phase: 'deposit' },
     oranges: { at: 'oranges', reachableBy: 'bouquet_given', phase: 'deposit' },
     lantern: { at: 'lantern', reachableBy: 'bouquet_given', phase: 'deposit' },
   },
   ```

   `npm run validate` now checks each anchor stands on something and can be reached.

<!-- step: manifest -->
2. **Declare the manifest.** In `game.ts`, `remix` lists the modes and the dimensions. Here one logical dimension
   moves the key and one presentation dimension changes a line:

   ```ts
   // games/<id>/game.ts
   remix: {
     schema: 1, algorithm: 'web-scumm-remix-1',
     modes: [
       { id: 'story', strategy: 'catalogue', dimensions: [] },
       { id: 'remix', strategy: 'catalogue', dimensions: ['key-spot', 'oranges-line'] },
     ],
     dimensions: [
       { id: 'key-spot', kind: 'item-placement', item: 'key', logical: true,
         anchors: [{ room: 'market', anchor: 'stall' }, { room: 'market', anchor: 'oranges' }, { room: 'market', anchor: 'lantern' }],
         story: { room: 'market', anchor: 'stall' } },
       { id: 'oranges-line', kind: 'presentation', target: 'line:market.take-oranges.l-oranges-are-not', logical: false, story: 0,
         values: [{ en: 'Oranges are not sardines…', fr: '…' }, { en: 'An orange. Round, bright…', fr: '…' }] },
     ],
     constraints: [{ kind: 'not-behind', item: 'key', action: 'house.use-key-pantry' }],
   },
   ```

<!-- step: branches -->
3. **Write the branches.** A logical value away from its story value writes the reserved flag `remix.<dimension>`
   when the game starts (`remix.key-spot` = `market.oranges`). The content reads it like any flag:

   ```ts
   // games/<id>/rooms/market.ts, a rule's condition
   if: { all: ['bouquet_given', { flag: 'remix.key-spot', eq: 'market.oranges' }, '!hidden_key_found'] },
   ```

   The story world writes no flag, so you write a condition for each other value and the story keeps its own text.
   The demo hands the key over in the story, says where it is hidden otherwise, and lets Pixel take it under the
   oranges or inside the lantern. `npm run validate` warns about a value no condition reads.

<!-- step: look -->
4. **Look at a world.**

   ```sh
   # in the engine repository, with your game selected
   npm run remix -- --seed WS-0000-02DZ
   npm run remix -- --preview WS-0000-02DZ
   ```

   The first prints each dimension's value and the world's hash; the second adds `validate` and a solver witness on
   that world.

<!-- step: prove -->
5. **Prove every world.**

   ```sh
   # in the engine repository, with your game selected
   npm run verify:variants -- --prove
   ```

   Each mode is checked: in a catalogue, every logical world is validated and proved without a softlock. It exits 1
   when one world fails, naming it.

<a name="what-you-learned"></a>

## What you learned

- A dimension varies one thing among values you list, each with its story value
  ([What varies](#what-varies)).
- A logical value writes a `remix.*` flag the content reads; a presentation value writes nothing
  ([Declaring a manifest](#manifest), [Presentation variance](#presentation)).
- A seed names a world, the same everywhere ([Seeds and worlds](#seeds)); a catalogue's worlds are all proved
  ([Strategies per mode](#strategies)).

<a name="next"></a>

## Where to go next

- [Speedrun for authors](create.speedrun.md): categories played in Remix worlds (Fixed, Random, Daily, Mystery).
- [Remix in the Studio](studio.remix.md): the Remix tab, its previews and its coverage.
- [What the solver proves](create.solver-proofs.md): what "proved" means for each world.

<a name="what-varies"></a>

## What varies, and what never does

A dimension varies one thing among values the author lists, each with its **story** value (the world as written):

| `kind` | What it varies | Its fields |
|---|---|---|
| `item-placement` | an item at one of several tagged anchors | `item`, `anchors` (`{room, anchor}`), `story` (an anchor) |
| `actor-start` | the room a character starts in | `actor`, `rooms`, `story` (a room) |
| `actor-route` | which script is his round | `actor`, `routes` (script ids), `story` |
| `coupled` | a code and its hint, drawn together | `pairs` (`{hint, answer}`), `story` (an index) |
| `puzzle-order` | an order of puzzle groups that keeps the author's edges | `groups` (1 to 8), `graph` (`[a, b]`: `a` before `b`), `story` |
| `presentation` | a line, an image, a palette or a minigame parameter | `target`, `values`, `story` (an index) |

Every dimension has an `id` and `logical: true`, except `presentation`, which is `logical: false`. Remix never
reorders the rules (their order can carry meaning), never writes a text, never invents a dependency: the author writes
each branch with the conditions the DSL already has.

<a name="manifest"></a>

## Declaring a manifest

The manifest is `remix` in `game.ts` (`GameDef.remix`, type `VariationManifest`):

- `schema: 1` and `algorithm: 'web-scumm-remix-1'`, both required as written.
- `modes`: each `{ id, strategy: 'catalogue' | 'generator', dimensions, mask? }`. The dimensions a mode does not name
  keep their story value. `mask: true` hides what the seed reveals until the end (a Mystery run).
- `dimensions` (table above) and `constraints` (below).
- `daily` (optional): `{ kid, publicKey, mode }`, the Bridge key a daily challenge is signed with (Ed25519, raw,
  base64url), so a player verifies the day's seed offline.

The flags a logical dimension writes are `remix.<dimension>`; a puzzle order writes `remix.<dimension>.<group>` (the
group's position). Read them with `{ flag: 'remix.key-spot', eq: 'market.oranges' }`; the value of an item placement is
`<room>.<anchor>`.

**Unknown fields.** The manifest is checked against a strict schema
([`src/engine/core/remix/manifest.ts`](../../src/engine/core/remix/manifest.ts)): an unknown key, a missing field or a
wrong literal is refused, with the path of what is wrong. A manifest that cannot produce a world (a domain emptied by
its constraints, for instance) is a build error that lists every reason.

<a name="anchors"></a>

## Anchors and item placement

An anchor is a tagged spot of a room, `anchors` in `rooms/<room>.ts`:

| Field | Meaning | Default |
|---|---|---|
| `at` | the prop or hotspot it stands on | required |
| `visible` | when it shows (a condition) | always |
| `reachableBy` | what it takes to reach it (a condition) | none |
| `capacity` | how many items it holds at once | 1: two items never share it unless it says so |
| `phase` | a label the Studio groups by, and `verify:variants` counts | none |

The validator refuses an anchor on nothing, an anchor in a room the start cannot reach, and an anchor reached only
with the item placed there. Three constraints tie the dimensions:

- `not-behind` (`{ item, action }`): removes the anchors behind a rule that needs the item;
- `exclusive` (`{ dimensions }`, two at least): no two of them take the same value;
- `requires` (`{ a, b }`, each `<dimension>=<value>`): when `a` holds, `b` holds.

<a name="characters-codes-orders"></a>

## Characters, codes and orders

- `actor-start` moves the character's starting room. Each candidate room must declare an actor for him; the solver
  proves the character is where each world needs him.
- `actor-route` names scripts: each script's `while` reads the flag (in
  [`games/reference/game.ts`](../../games/reference/game.ts), `seller_rounds` and `seller_rounds_late`).
- `coupled` pairs a hint (a text, or one per language) with an answer. `{code:<id>}` in any text becomes the answer and
  `{hint:<id>}` the hint, in every language at once, after the translation. The content accepts the answer through the
  flag: see the festival password in [`games/reference/rooms/hall.ts`](../../games/reference/rooms/hall.ts) and
  Grandma's riddle in `kitchen.ts`.
- `puzzle-order` writes each group's position: `remix.festival-order.board` = 0 when the board comes first.

<a name="presentation"></a>

## Presentation variance

A `presentation` dimension's `target` is one of:

- `line:<line id>`
- `prop-img:<room>.<prop>`
- `palette:<character>`
- `minigame:<rule id>:<param>`: a minigame's text or backdrop only. A parameter that could decide a win, such as a
  wheel's answers or a difficulty, is refused, since a proof is keyed by the logical world.

It draws from the `cosmetic` stream, writes no flag, takes no constraint, and stays out of the solver's space (D27):
two worlds that differ only by presentation share their proof. Adding a presentation dimension moves no logical draw.

<a name="seeds"></a>

## Seeds and worlds

A seed is `story` or a code `WS-XXXX-XXXX`: seven Crockford base32 symbols and a check symbol. Typing forgives case,
`I` and `L` (read as `1`), `O` (read as `0`), spaces and dashes; a wrong symbol is an explicit error, never another
world.

> [!GUARANTEE id=seed-typo-caught]
> A code with one of its first four symbols typed wrong is refused by its check symbol: it never opens another world.

The check symbol's weights are odd, so a wrong symbol anywhere in the code changes it too.

The same game, manifest, seed and algorithm version give the same `WorldVariant`: the seed, the algorithm and its
version, the manifest's hash, the mode, one value per dimension, and a SHA-256 of it all. The draws come from the
seeded generator only, one stream per dimension; `Math.random` is forbidden in `src/engine/core` by the linter and by a
test. That it is the same in Node is tested on every run; `npm run e2e:remix` compares the worlds and code wheels of 50
seeds (500 in the nightly and the release candidate) in Node, Chromium, WebKit and Firefox, in CI's cross-runtime job.
A code says nothing about the player
([`docs/dev/threat-models/remix-seed.md`](../../docs/dev/threat-models/remix-seed.md)): it is a world's name, not a
secret.

<a name="strategies"></a>

## Strategies per mode

Each mode says how its worlds are backed (D25):

- A **catalogue** enumerates every logical world (at most 10 000, `CATALOGUE_MAX`; beyond, it is refused) and each is
  validated and solved: each one is a release gate.
- A **generator** builds a world by construction; its invariants are tested by properties and its published sample of
  seeds is solved. It is never said that every seed is proved.

The bundled games use catalogues only.

> [!MEASURE id=bundled-worlds-proved]
> Every logical world of the bundled games proved exhaustively, no softlock: `demo` story 1 and remix 3 worlds;
> `reference` story 1, and remix, daily and mystery 24 worlds each.
> - date: 2026-10-07
> - version: 4.1.15
> - volume: 1 + 3 worlds (`demo`), 1 + 3 × 24 worlds (`reference`)
> - conditions: `npm run verify:variants -- --prove --max=200000`, exhaustive proof per logical world
> - source: [docs/en/REMIX.md, "Strategies per mode"](https://github.com/Quest-n-Click/quest-n-click/blob/d7ed9c01022306fe34b2da5af666eaff4bd056a5/docs/en/REMIX.md)

The generator path is exercised by a test fixture
([`tests/fixtures/remix-extension.ts`](../../tests/fixtures/remix-extension.ts), 527 280 logical worlds): 10 000 seeds
give valid worlds (a property test); none is claimed proved.

<a name="tools"></a>

## Tools

All in the engine repository, for the selected game:

| Command | Does |
|---|---|
| `npm run remix -- --seed <code>` | prints a world and its hash; `--json` the whole `WorldVariant`; `--mode=<id>` (default `remix`); `--version=<n>` an algorithm version |
| `npm run remix -- --preview <code>` | the same world, then `validate` and a solver witness on it (`--max=<states>`, default 20 000) |
| `npm run remix -- --record=20` | the playtest seeds: the first N seeds of the published sample, each solved and its witness written as a session in `games/<id>/playtests/remix-<seed>.session.json`, which `npm run playtests` replays in its own world |
| `npm run verify:variants` | every mode: a catalogue's every world, a generator's sample (`--sample=50`), with the coverage per dimension and per pair, the values never chosen, the dominant ones over 1 000 seeds (`--draws`), a certificate per logical world in `.cache/proofs/variants/`; `--prove` the exhaustive proof, `--max=<states>` (default 20 000), `--out=<file>` the report the release publishes. Exit 1 when a world fails |
| `npm run e2e:remix` | 50 seeds' worlds and code wheels compared across Node, Chromium, WebKit and Firefox (`--seeds=`, `--browsers=`; exit 3 when a browser cannot launch, 0 with `--allow-skip`) |
| `npm run code-wheel -- --game <id> --format svg\|pdf` | the printable code wheel ([below](#code-wheel)) |

A game without a `remix` manifest has one world, the story: `npm run remix` says so and exits 1.

<a name="saves-replays"></a>

## Saves, replays and speedruns

A save is the envelope v4 (`SaveEnvelopeV4`): the v3 envelope and the world. A save made before 4.1.15 receives the
story world. A save is never loaded into another world: `SaveWorldMismatch` names the world to rebuild.

> [!GUARANTEE id=save-other-world-refused]
> A save of a Remix world carries that world; loading it into another world is refused and names the world to
> rebuild.

The session records the world (`Session.variant`), and a replay rebuilds it from the stored assignment, never from the
seed with a newer generator. The speedrun categories are Story, Fixed (a published seed), Random (drawn at the start
and shown), Mystery and Daily; Fixed and Daily rank each seed apart (`leaderboardKey`), and `worldVerdict` checks a
run's world against what its category allows: see [Speedrun for authors](create.speedrun.md#worlds). The file formats
are in [File formats](engine.file-formats.md).

<a name="daily-mystery"></a>

## The daily challenge and Mystery

The Bridge's daily module ([`bridge/src/daily.ts`](../../bridge/src/daily.ts)) signs the day's seed and rules for 24
hours (`GET /v1/daily`); the player verifies the token offline with the public key in `remix.daily`. Mystery is a
commitment: `POST /v1/commit` publishes the signed hash of a seed and a nonce before the run, `GET /v1/reveal/:id` the
seed afterwards. The day's seed depends on the day alone, and a Mystery seed is fixed before its commitment is signed:
the Bridge never picks a seed after seeing actions (D26).

`bridge serve` mounts it from a configuration's `daily` section (4.1.16; see
[Install and run the Bridge](bridge.install-run.md)), and the player's Remix menu has a Daily entry and (4.1.17) a
Mystery entry when the game names its Bridge.

> [!LIMIT id=reference-daily-key]
> The reference game's daily key is a published test key: its challenges show the mechanism, not trust. A game that
> wants real daily challenges ships its own key.

<a name="code-wheel"></a>

## The code wheel

"The Extremely Legitimate Pirate Check" is a minigame, `code-wheel`: two discs drawn from the game's characters,
symbols and answers; turn the small disc until a symbol sits under a character and read its window. The seed draws it
from the `copy-protection` stream, so the same seed gives the same wheel everywhere; the validator checks each wheel has
one solution; the solver treats it as winnable.

Modes (`mode`): `parody` (the default: after three wrong answers it lets you through), `story`, `strict` (never lets
through, cannot be skipped), `cosmetic` (any answer is accepted), `disabled`, `daily`.

It turns with buttons, the arrow keys and a gamepad, announces each turn, lists the whole wheel as text, and does not
animate under reduced motion. The whole wheel plays by keyboard (the arrows turn it, Tab and Enter answer, Escape
skips) and by gamepad (left and right turn, up and down choose an answer, A confirms, B skips), and the focus returns
to the game when it closes.

```sh
# in the engine repository
npm run code-wheel -- --game <id> --format svg|pdf [--seed <code>|story] [--out <dir>]
```

prints the discs, cut marks, the centre hole and a booklet, in colour and economy. The SVG pages are always written;
the PDF needs Pillow (`npm run doctor` says whether it is there; without it the command says so and keeps the SVG). It
is a playful reconstruction, never DRM; the art direction is the game's own.

**Its outcome counts** (4.1.16). The wheel ends `won`, `passed` (a parody's mercy), `skipped`, `failed` (a `story`
wheel lost after its tries: the story goes on with it) or `disabled`. The engine records the result in the session
(the entry's `mg`, fed back on a replay like a choice) and writes it in the reserved flag `minigame.code-wheel`, which
the story reads with `{ flag: 'minigame.code-wheel', eq: 'failed' }` and the journal reports as `flagChanged`. A command
never sets a `minigame.*` flag (the validator refuses it). Every minigame reports how it ended in the player (skipped,
else won); one that reports nothing (the solver, a replay of a 4.1.15 session) records nothing.

A speedrun category says what it allows of the wheel in `world.codeWheel`: `skip: false` wants it won, `enabled: false`
wants it not played (skipped or disabled), `medium` is `digital`, `physical` or `either`, and `proof: 'transcript'`
(4.1.17) wants the answers that give the result. See [Speedrun for authors](create.speedrun.md#trust).

> [!LIMIT id=wheel-result-word]
> A recorded result is the player's word, as the medium is: the replay checks it was recorded and replays it, not
> that it was earned (unless the category asks for a transcript). The solver, whose minigames report nothing, does not
> explore the branches a story hangs on `minigame.*`: they are not searched.

<a name="player-studio"></a>

## The player and the Studio

The title screen gains **Remix** (after New game and Continue): the story, a new world, a typed seed or the daily
challenge. The page starts again in the chosen world. The pause menu shows the code to copy, or "hidden until the end"
in a masked mode. Accessibility options never touch the seed. A link names a world (`?seed=`, `?daily=`, `?world=`).

The Studio's **Remix** tab lists the dimensions, previews a seed, locks dimensions and rerolls the others, compares two
worlds, draws a puzzle order, counts coverage and bias, lists the anchors and adds one from the Rooms tab's selection,
and plays or exports a world: see [Remix in the Studio](studio.remix.md).
