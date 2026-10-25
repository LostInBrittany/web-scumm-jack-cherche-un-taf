# Rooms

A room is one file, `rooms/<room>.ts`: what it shows, what can be acted on, what happens. This page walks through a
whole room, then lists its fields one by one. Where things stand is not here: it is the room's layout
([geometry](create.geometry.md)).

<a name="overview"></a>

## What you will write

One file per room in `rooms/` (`game/rooms/` in a created project, `games/<id>/rooms/` in the engine repository), pure
data: props and their states, actors, hotspots, exits, look lines, reactions (`verb` + target + condition +
commands), talk topics, hints, an arrival script, the room's own scripts and listeners. Each room is listed in
`game.ts` (`rooms: [...]`). In Claude Code, the repository's `/new-room` skill drafts one.

<a name="step-by-step"></a>

## A room, step by step

```ts
import { defineRoom } from '@quest-n-click/engine/content';

export default defineRoom({
  id: 'house',
  name: "Grandma's house",
  decor: 'decor/house',          // background image (see "Images")
  music: 'house',

  // Props: images placed on the background, which can change state.
  props: {
    lamp:     { name: 'lamp', states: { off: 'house/r1c1', on: 'house/r1c2' } },
    armchair: { name: 'armchair', states: { full: 'house/armchair_full', empty: 'house/armchair' } },
    table:    { img: 'house/side_table', name: 'side table' },
    stool:    { name: 'stool', states: { shelf: 'house/r1c5', pulled: 'house/r1c6' } },
    talkie:   { name: 'walkie-talkie', img: 'items/r1c1', visible: { not: { has: 'talkie' } } },
  },

  // Characters present.
  actors: {
    grandma: { char: 'grandma', facing: 'left' },
    cat: { char: 'cat', pose: 'sleep', visible: '!cat_awake' },
  },

  // Clickable zones of the background itself (nothing is drawn, only the zone counts).
  hotspots: {
    shelf:    { name: 'shelf' },
    cupboard: { name: 'cupboard' },
    door:     { name: 'garden door' },
  },

  // Look. A list = a different line each time, cycling.
  look: {
    shelf: 'The shelf. Too high without a step up.',
    cupboard: ['An old cupboard.', 'Still an old cupboard.', 'Someday I will check what is behind it.'],
  },

  // Written reactions. See "Reactions".
  on: [
    { id: 'pull.stool', verb: 'pull', a: 'stool', if: { prop: ['stool', 'shelf'] }, do: [
      { prop: ['stool', 'pulled'] }, 'There. A step up.',
    ] },
    { id: 'tie.rope', verb: 'use', a: 'rope', b: ['hook', 'bucket'], do: [
      { lose: 'rope' }, { set: 'tied' },
      'Tied. One end on the hook, the other on the bucket.',
      { id: 'house.open-door.l-careful-with-that', say: ['grandma', 'Careful with that bucket, dear.'] },   // the id: translations and the voice clip follow it
    ] },
  ],

  // Talk topics (2 to 4). "Bye" is added to every menu, "Hug?" too when the game sets globalTalk.hug.
  talk: {
    grandma: [
      { id: 'ask.basket', topic: "Grandma, what's in the basket?", do: [{ say: ['grandma', 'A surprise for everyone.'] }] },
      { id: 'ask.market', topic: 'Can I go to the market alone?', do: [
        { say: ['grandma', 'Alone?! With your scarf, your hat, your water bottle…'] },
        { say: ['grandma', '… Fine. Back by ten.'] },
      ] },
    ],
  },

  // Hints from the hint item (the walkie-talkie): the first one whose `until` condition is still false is given.
  hints: [
    { until: { has: 'rope' }, lines: ['Khhh… the armchair… eats everything.', 'Khhh… check the side of the armchair.'] },
    { until: 'tied', lines: ['Khhh… a rope… it ties to things.'] },
  ],

  // On every entry into the room.
  onEnter: [
    { once: [ 'The living room. Home base.' ], id: 'arrival.first' },
  ],
});
```

This is an excerpt of a larger game: the `hook`, the `bucket`, the `rope` item and the `cat` character are declared
elsewhere. In the engine repository, room files import `defineRoom` from `@engine/core/define` or from
`@quest-n-click/engine/content`; both resolve to the same function, which only types the object.

The same kind of room, complete and checked by the validator: a lamp, a stool to pull, Grandma with one topic, a hint,
and its layout.

```room-example
{
  "room": {
    "id": "house",
    "name": "Grandma's house",
    "decor": "decor/house",
    "props": {
      "lamp": { "name": "lamp", "states": { "off": "house/r1c1", "on": "house/r1c2" } },
      "table": { "img": "house/side_table" },
      "stool": { "name": "stool", "states": { "shelf": "house/r1c5", "pulled": "house/r1c6" } }
    },
    "actors": { "grandma": { "char": "grandma", "facing": "left" } },
    "hotspots": { "shelf": { "name": "shelf" }, "door": { "name": "garden door" } },
    "look": {
      "lamp": "An old lamp.",
      "stool": "A stool, under the shelf.",
      "grandma": "Grandma, knitting.",
      "shelf": "The shelf. Too high without a step up.",
      "door": ["The garden door.", "Still the garden door."]
    },
    "on": [
      { "id": "pull.stool", "verb": "pull", "a": "stool", "if": { "prop": ["stool", "shelf"] },
        "do": [{ "prop": ["stool", "pulled"] }, "There. A step up."] },
      { "id": "use.lamp", "verb": "use", "a": "lamp", "if": { "prop": ["lamp", "off"] },
        "do": [{ "prop": ["lamp", "on"] }, "Light."] }
    ],
    "talk": {
      "grandma": [
        { "id": "ask.basket", "topic": "Grandma, what's in the basket?",
          "do": [{ "say": ["grandma", "A surprise for everyone."] }] }
      ]
    },
    "hints": [{ "id": "house.stool", "until": { "prop": ["stool", "pulled"] }, "lines": ["The stool. Pull it."] }],
    "onEnter": [{ "once": ["The living room. Home base."], "id": "arrival.first" }]
  },
  "layout": {
    "walk": { "area": [[20, 300], [620, 300], [630, 395], [10, 395]] },
    "scale": [[300, 0.8], [395, 1]],
    "entries": { "default": [320, 360] },
    "hotspots": { "shelf": { "rect": [60, 80, 120, 60] }, "door": { "rect": [520, 150, 80, 200], "approach": [540, 360] } },
    "props": { "lamp": { "x": 200, "y": 330, "h": 60 }, "table": { "x": 260, "y": 340, "h": 40 }, "stool": { "x": 120, "y": 360, "h": 30 } },
    "actors": { "grandma": { "x": 420, "y": 350 } }
  },
  "characters": {
    "grandma": { "name": "Grandma", "color": "#f0c040", "height": 120, "kind": ["person"], "sprites": { "idle": ["grandma/idle"] } }
  }
}
```

<a name="fields"></a>

## The fields of a room

| Field | What | Notes |
|---|---|---|
| `id` | the room's id | used by `goto`, exits, the map, `{ room }` and `{ visited }` |
| `name` | its display name | |
| `decor` | the background image (a manifest id) | [images](create.images.md) |
| `description` | what the background shows, for the art prompts (`npm run prompts`) | not shown in the game |
| `furniture` | furniture drawn on its own sheet, so the engine can depth-sort it | read by `npm run prompts` only |
| `music` | the room's music track | [music](create.music.md) |
| `props` | images placed on the background, with states | [below](#props) |
| `actors` | the characters present | [below](#actors) |
| `hotspots` | clickable zones of the background | [below](#hotspots) |
| `exits` | ways out, declared | [exits](create.exits.md) |
| `look` | a line per thing, or a list that cycles | [below](#look) |
| `on` | the written reactions | [reactions](create.reactions.md) |
| `talk` | conversation topics per actor | [dialogues](create.dialogues.md) |
| `hints` | what the hint item says here | [below](#hints) |
| `onEnter` | commands run on every entry | [below](#on-enter) |
| `scripts`, `events` | the room's own scripts and listeners | [scripts and events](create.scripts-events.md) |
| `hero` | `false` for a room without the hero (a pure cutscene) | |
| `stage`, `renderer` | layers, lights, particles, walk links; the painter | [the stage](create.stage.md), [geometry](create.geometry.md#layers-and-masks) |
| `anchors` | where Remix may place an item | [Remix](create.remix.md) |

<a name="props"></a>

## Props

A prop is an image placed on the background. `img` gives one image, `states` one image per state (`initial` picks the
first state, else the first key); the validator refuses a prop with neither. A prop with a `name` is interactive: it
can be tapped, looked at, acted on. A prop without a `name` is decoration (`table`, `chair`, `stall_left`): use it to
dress the scene. `visible` shows it only while a condition holds; `kind` gives it kinds for the
[reactions by kind](create.reactions.md#fallbacks); `defaultVerb` names the verb of a double tap; `anims` holds its
animations ([staging](create.staging.md)). Its position, and one per state if it moves, are in the layout.

Change a prop's state with `{ prop: ['stool', 'pulled'] }`; test it with `{ prop: ['stool', 'pulled'] }` in a
condition. `'room.prop'` reaches a prop of another room.

<a name="actors"></a>

## Actors

`actors: { grandma: { char: 'grandma', facing: 'left' } }` puts a character of the game in the room. `pose` is a
lasting pose of its sprite sheet (`sleep`), `facing` its side, `visible` a condition, `name` a display name other than
the character's, `interactive: false` makes it living scenery, neither clickable nor named
([characters](create.characters.md#presence)). The validator wants every actor placed in the layout, and warns about
a `person` with no conversation topics.

<a name="hotspots"></a>

## Hotspots

A hotspot is a zone of the background with a name and nothing drawn: `hotspots: { shelf: { name: 'shelf' } }`. Its
zone (a rectangle or a polygon) and its approach point are in the layout. A hotspot also takes `kind`, `visible`,
`defaultVerb` and `onTap` ([reactions](create.reactions.md#double-tap)). For a drawn thing that changes, use a prop with
states instead ([characters: multiple states](create.characters.md#multiple-states)).

<a name="look"></a>

## Look

`look: { shelf: 'One line.' }`, or a list: a different line each time, cycling. Anything visible should have one:
`npm run validate` warns about a named thing with no look line (the fallback answers instead). An inventory item's
look line is on the item ([items](create.items.md)). A line can be `{ id, text }` so its translation follows the id.

<a name="hints"></a>

## Hints

`hints: [{ until, lines }]`: talking to the hint item (`hintItem` in `game.ts`, the walkie-talkie of the demo) gives
the first hint whose `until` condition is still false, its lines said in order by `hintVoice` (or the hero). When every
hint is satisfied, the talk fallback answers. `{ hint: true }` gives the current hint from a script. The validator
warns about a room that has puzzles but no hints.

<a name="on-enter"></a>

## The arrival script

`onEnter` runs on every entry into the room, after the room is shown. Wrap what should happen only the first time in
`{ once: [...], id }`. A condition on a flag set by a listener lets a room react to something that happened elsewhere
([flags, variables and events](create.flags-variables-events.md)).

<a name="rules-of-thumb"></a>

## Rules of thumb

| Element | Rule of thumb |
|---|---|
| Hotspots + named props + actors | **8 to 15** per room. Fewer feels empty, more feels like pixel hunting. The demo's house has 11 named things. |
| Props with states | Only for things the story changes (`armchair`, `tank`, `pantry`). |
| Decor props | No `name`, not clickable (`table`, `chair`, `stall_left`). |
| Exits | One obvious way out, at the edge of the screen, named after where it goes (`back_door`: "Back to Grandma's house."). |

- **Logical space: 640 × 400**, origin top-left, characters placed by their feet.
- **The floor band.** The walk area sits in the lower part of the background; `floor` (default 395) is its bottom.
  Keep it free of drawn furniture, so props and actors stand on it.
- **Character heights** are in units of that space: in the demo, Pixel is 36, Grandma 120, Grandpa (seated) 100. A
  human around 110 to 125 next to a 640-wide room reads right on a phone.
- **Approach points**: set them in the editor (`?edit=<room>`), so the hero walks next to a thing, not onto it.
  `validate` reports a `walk` target with no geometry.
- **Exits are clickable things**, not invisible edges. A locked exit still answers: the demo's house `window` says
  "Not yet. First, the key. Grandma knows things." until the garden is unlocked.
- **One checkpoint per room** in `game.checkpoints`, with the inventory, flags and props the player would have. The
  demo has `house`, `garden`, `market`, `finale`. Open `?dev&at=market` to test that room alone.

Why these numbers, and how a room serves the puzzles: [puzzle design](create.puzzle-design.md#rooms).

<a name="write-the-rooms"></a>

## Writing the rooms of a whole game

One file per room, pure data, then check:

```sh
# in the engine repository (in a created project: npx quest-n-click validate, npx quest-n-click solve)
npm run validate          # broken ids, missing look lines, unused flags
npm run solve             # a way to finish the game
npm run solve -- --prove  # it can always be finished, from every reachable state
```

What a proof covers, and what it does not: [what the solver proves](create.solver-proofs.md).

<a name="next"></a>

## Where to go next

- [Geometry](create.geometry.md): placing the room. [Reactions](create.reactions.md), [commands](create.commands.md),
  [conditions](create.conditions.md).
- [Characters](create.characters.md), [items](create.items.md), [dialogues](create.dialogues.md),
  [exits](create.exits.md).
