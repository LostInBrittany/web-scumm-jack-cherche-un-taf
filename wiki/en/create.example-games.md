# Example games

The engine repository holds five games under `games/`. Each one exists for a reason: a starting point, a sample that
shows every feature once, a reference chapter the CI proves and plays, a playable example of the hero choice, and the
sample game of the Reality Bridge. Read the one closest to what you want to write before writing it.

| Id | Title | Rooms | What it shows | Since |
|---|---|---|---|---|
| [`_template`](#template) | (the new game's title) | 1 | the starting point of every new game | 1.0.0 |
| [`demo`](#demo) | The Pantry Key | 3 | every engine feature once; the default game | 1.0.0 |
| [`reference`](#reference) | The Night Market | 8 | the reference chapter: two playable cats, staging, Remix, speedrun categories | 3.4.0 |
| [`heroes`](#heroes) | Who Am I Today? | 1 | choosing the hero, in two languages, voiced per hero | 4.4.0 |
| [`signals`](#signals) | Signals | 1 | signals from the world outside (Reality Bridge) and the connectors | 4.1.1 |

<a name="playing-one"></a>

## Playing or checking one of them

In the engine repository, the current game is `GAME=<id>`, else the game last selected (`npm run game`,
`npm run new-game`), else `package.json` → `config.game`, which is `demo`.

```sh
# in the engine repository, on your machine
GAME=reference npm run dev            # play it in the browser
GAME=reference npm run solve          # a way from New Game to the end
GAME=reference npm run game           # make it the current game for every later command
```

A created project holds one game, in `game/`, made from `_template`. The npm package ships `games/_template/` only:
read the other four in the engine repository ([github.com/Quest-n-Click/quest-n-click](https://github.com/Quest-n-Click/quest-n-click),
folder `games/`).

<a name="template"></a>

## `_template`

### Form

`games/_template/`: `game.ts`, `cast.ts`, `items.ts`, `rules.ts`, one room `rooms/start.ts` with its
`layout/start.json`, `storyboard.json`, `site.json`, placeholder art under `art/`, and `tests/game.test.ts`. The
strings `__ID__` and `__TITLE__` are replaced at creation.

### What it is for

The copy every new game starts from:

- `npm run new-game <id> ["Title"]` (engine repository) copies it to `games/<id>/`, draws placeholder art, and makes
  it the current game;
- `quest-n-click create <folder> ["Title"]`, or `npx @quest-n-click/create <folder>`, copies it to `<folder>/game/`
  without its `tests/` (a created project checks its game with `npm run verify`), and writes a `provenance.json` that
  marks the art as a placeholder.

It declares nine verbs (Give, Open, Close, Take, Look, Talk, Use, Push, Pull), a hero, a `hintItem` (`note`) given at
the start, and a `skin` that points at the starter interface icons.

### Constraints

The placeholder art is drawn from shapes (`tools/placeholder-art.py`). A release refuses it until every file is
replaced and its provenance reviewed (`quest-n-click provenance --lock`): see
[Asset provenance](create.asset-provenance.md).

<a name="demo"></a>

## `demo`: The Pantry Key

### What it is

A 15-minute point-and-click that shows every engine feature once. Pixel the cat wants the sardines; Grandma locked
them in the pantry and lost the key. Three rooms: Grandma's house, the garden, the market. Design: `games/demo/STORY.md`;
every line: `games/demo/storyboard.json`.

### What to read in it

- Two playable cats (`players`): Pixel first, Biscuit (asleep at home) can be switched to at any time, with his own
  inventory.
- Hints through an item (`hintItem: 'shell_phone'`) spoken by an offscreen character (`hintVoice: 'grandma_voice'`).
- A guided tutorial in the intro (`guide`), a `choice` before the first room, and the [sealed ending](create.sealed-ending.md)
  that judges that guess (`ending`, `npm run seal`).
- Two built-in minigames: `pipes` (garden) and `pick` (market) ([Built-in minigames](create.minigames.md)).
- Checkpoints that are also chapters (`goals`; `npm run solve -- --chapters`), objectives, three manual save slots.
- [Remix](create.remix.md): where the seller leaves the pantry key and how Pixel turns the oranges down, two catalogue
  modes.
- Stable ids written into the sources and their save migration (`ids.migration.json`, `saveVersion: 2`):
  [State and saves](create.state-saves.md).
- English and French (`locales/`), a playtest session (`playtests/`), its own browser playthrough (`e2e.mjs`), art
  prompts (`prompts.md`) and a locked provenance.

### Default

`demo` is the engine repository's default game (`package.json` → `config.game`).

<a name="reference"></a>

## `reference`: The Night Market

### What it is

The engine's second real game (3.4, D13): a 30-to-45-minute chapter built only from the sample game's art and sound,
reframed. Festival night, every light in the market is out, and Lou needs the lights, the festival board and a lit
lamp. Eight rooms: street, market, alley, backlot, yard, kitchen, cellar, hall. Design: `games/reference/STORY.md`.

### What to read in it

- Two playable cats who need each other: an item handed from one to the other, a link open to Biscuit only, a door
  only Pixel opens, a floor one of them changes for the other ([Heroes](create.heroes.md)).
- The stage: layers with parallax, masks, walk zones and links, lights and particles, a timed finale
  ([The stage](create.stage.md), [Geometry](create.geometry.md)).
- A character walking on his own until an event stops him (`scripts` `seller_rounds`, `events`)
  ([Scripts and events](create.scripts-events.md)).
- Two minigames: `cables` (street) and `code-wheel` (hall); choices in dialogue.
- Speedrun categories (Any%, No Hints, Real Time, the Remix categories, the wheel proved) and splits on the
  objectives ([Speedrun for authors](create.speedrun.md)); a Remix manifest and Remix playtest sessions.
- English and French.

### Constraints

It is a test bench as much as a story. The CI builds it (`GAME=reference`), proves it whole and chapter by chapter,
and plays it to the end at the keyboard in Chromium and WebKit, and in French with no English default visible. A
change to it can fail the `reference` gate.

<a name="heroes"></a>

## `heroes`: Who Am I Today?

### What it is

The playable example of choosing the hero (4.3.0 "Hero Choice", added in 4.4.0, ADR 0022). One room, the garden.
At New Game, three heroes on portrait cards (Pixel, Biscuit, Gaby the gull), the same puzzle for each (the gate key
under the watering can).

### What to read in it

- The intro that runs before the room's arrival, with a `choice` whose answers are cards with a portrait (`img`).
- The hero's name in the lines (`{hero}`) and the words used for each hero (`{form?…}`), in English and French
  (`locales/fr.json`, where French adds its own agreements).
- Lines voiced per hero (`<id>~form=<value>` in `audio.voices` and `audio.voicesByLang.fr`); a save keeps the hero.
- It reuses `demo`'s verbs and art.

### Constraints

Its browser test (`e2e.mjs`) picks each hero in each language, saves, continues and finishes. The CI builds it and
proves it for every hero (`GAME=heroes npm run solve -- --prove`). See [Heroes](create.heroes.md) and
[Voices](create.voices.md).

<a name="signals"></a>

## `signals`: Signals

### What it is

The sample game of the Reality Bridge (4.1.1). One room, a garden: the gate opens when the right answer arrives by
email (a signal from the world outside), or, if the outside never answers, when the radio on the bench is used (the
signal's fallback).

### What to read in it

- `reality.signals`: a required signal with a fallback, optional signals, a signal that can arrive more than once
  (`once: false`).
- Since 4.1.9, the real connectors' signals and what each connector may turn into a signal: words of a letter
  (email), the commands of a terminal (Telnet and SSH), badges (Open Badges).
- Scenarios for the simulated solver (`reality/scenarios/`) and a recorded replay (`replays/`).

### Constraints

The CI runs `GAME=signals npm run solve:reality` and plays it end to end against a reference Bridge. See
[What the Reality Bridge is](bridge.what-it-is.md) and [Signals and the manifest](bridge.signals-manifest.md).

> [!LIMIT id=examples-not-templates]
> Only `_template` is meant to be copied. The four others are examples and test benches: their content changes with
> the engine, and `demo`, `reference` and `heroes` reuse each other's art and verbs (`heroes` and `reference` import
> `demo`'s game file). Copy a mechanic, not a whole game.

<a name="related"></a>

## Related identifiers

- `GAME`, `GAME_DIR`, `npm run game`, `npm run new-game`, `quest-n-click create`.
- [Your first game](create.first-game.md), [Layout of a created project](create.project-layout.md),
  [Classic mechanics](create.classics.md).
