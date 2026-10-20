# Writing the game content

This guide is for whoever writes the story: the rooms, the lines, the puzzles. It describes the format the engine reads.
You never need to touch the engine (`src/engine/`). The whole game lives in `games/<id>/` (here, `games/demo/`).

The full types, with their comments, are in `src/engine/core/types.ts`. Your editor offers them as autocomplete.

## The principles

1. **Content, not code.** The content is made of data: objects, lists, texts. No functions.
   That's what lets the engine check the game on its own (`npm run validate`) and prove it can be finished (`npm run solve`).
2. **Logic on one side, geometry on the other.** You write *what happens* in `rooms/<room>.ts`.
   *Where things are* (clickable rectangles, character positions, the walkable area) lives in
   `layout/<room>.json`, placed with the mouse in the editor (`npm run dev`, then `?edit=<room>`). You never type
   coordinates by hand, except for a one-off scripted move.
3. **Nothing is a dead end.** Every action gets a response. With no written reaction, the engine answers with the
   game's fallback responses.
4. **Logical coordinates.** A background measures 640 × 400, origin top-left. A character is placed by its feet.

## The v3 identity contract

New games set `schemaVersion: 3` in `game.ts`. Anything whose execution position survives in a save has an explicit,
unique id: every `Rule`, `TalkTopic`, `Choice`, `EventRule`, and every `once`, `nth`, `cycle` or `random` block. A
`ScriptDef` already has an id and adds one `stepIds` entry per top-level command. The validator rejects a v3 game with
missing or duplicate ids. Reordering content or translating text therefore does not change the meaning of a save.

```ts
schemaVersion: 3,
// …
{ id: 'open.pantry', verb: 'open', a: 'pantry', do: […] }
{ id: 'ask.key', topic: 'Where is the key?', do: […] }
{ once: […], id: 'arrival.first' }
{ id: 'clock', stepIds: ['wait', 'chime'], do: [{ wait: 1000 }, { sfx: 'chime' }] }
```

`npm run ids -- --write --map` writes those ids into an existing game and the migration step its saves need
(`docs/en/UPGRADING.md` §2). `compileGame(source)` clones and normalises the authoring source once; v3 output is frozen in development. The engine,
validator, solver, replay and puzzle tools consume the same compiled representation. See [UPGRADING.md](UPGRADING.md)
before converting an existing game.

## The files

```
games/<id>/
  index.ts         entry point: export { game, layouts, manifest, minigames?, extraImages? }
  game.ts          the game: verbs, characters, items, map, global rules, game start, skin (the look), ending, interface texts
  rules.ts         fallback answers, reactions by kind ("never pull a cat")
  rooms/house.ts   one file per room (logic)
  layout/house.json one file per room (geometry, written by the editor)
  assets.gen.json  manifest of images and sounds (written by npm run assets)
  sources.json     where the asset sources come from (optional, see TOOLS.md)
  site.json        page title, description, theme colour, art style (see below)
```

`site.json`: `{ "lang": "en", "title": "…", "shortName": "…", "description": "…", "themeColor": "#0a0a12",
"artStyle": "cel" }`. `title`, `description` and `themeColor` go into `index.html` and the PWA manifest. `artStyle` is
`"cel"` (default: painted cartoon) or `"pixel"` (retro pixel art): it changes the art prompts (`npm run prompts`), the
cutter (`tools/cut-sheet.py`) and `npm run assets` (lossless WebP, nearest-neighbour resizing); see
[PROMPTS.md](PROMPTS.md). For `pixel`, also set `skin: { pixelArt: true }` in `game.ts`. `sheetBackground`
(optional) is the background the sprite sheets are generated on: `"transparent"` or a `"#RRGGBB"` colour, `#2B2E45`
when absent; it changes the art prompts, and the cutter follows the sheet it is given (PROMPTS.md, "Choosing the sheet
background").

## A room, step by step

```ts
import { defineRoom } from '@engine/core/define';

export default defineRoom({
  id: 'house',
  name: "Grandma's house",
  decor: 'decor/house',          // background image (see "The images")
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

  // Clickable zones of the background itself (nothing is drawn, only the rectangle counts).
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

  // Written reactions. See "The reactions".
  on: [
    { id: 'pull.stool', verb: 'pull', a: 'stool', if: { prop: ['stool', 'shelf'] }, do: [
      { prop: ['stool', 'pulled'] }, 'There. A step up.',
    ] },
    { id: 'tie.rope', verb: 'use', a: 'rope', b: ['hook', 'bucket'], do: [
      { lose: 'rope' }, { set: 'tied' },
      'Tied. One end on the hook, the other on the bucket.',
      { id: 'house.open-door.l-careful-with-that', say: ['grandma', 'Careful with that bucket, dear.'] },   // the id: translations and the voice clip follow it (UPGRADING §9)
    ] },
  ],

  // Talk topics (2 or 3). "Hug?" and "Bye" are added automatically.
  talk: {
    grandma: [
      { id: 'ask.basket', topic: "Grandma, what's in the basket?", do: [{ say: ['grandma', 'A surprise for everyone.'] }] },
      { id: 'ask.market', topic: 'Can I go to the market alone?', do: [
        { say: ['grandma', 'Alone?! With your scarf, your hat, your water bottle…'] },
        { say: ['grandma', '… Fine. Back by ten.'] },
      ] },
    ],
  },

  // Hints from the walkie-talkie: the first one whose `until` condition is still false is given.
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

## The reactions

A reaction says: "when VERB happens on A (with or to B), if CONDITION, then these commands".

| Field | Meaning |
|---|---|
| `verb` | `give` Give, `open` Open, `close` Close, `take` Take, `look` Look, `talk` Talk, `use` Use, `push` Push, `pull` Pull. A list accepts several verbs. |
| `a` | The targeted thing. For Use/Give with two terms, it's the inventory item. A list = any of them. |
| `b` | The target of "Use A with B" or "Give A to B". Absent = a single-term action. |
| `if` | Optional condition. The first rule whose condition is true wins: put special cases first. |
| `do` | The commands to run. |

Two inventory items combine both ways: a rule `a: 'piece1', b: 'piece2'` also works for "Use piece 2 with piece 1".
Rules valid everywhere (combining two items, for instance) go in the game's `rules.on`, not in a room.

### When nothing is written

The engine looks for an answer in this order, and stops at the first one found:

1. a room rule (`on`), then a global game rule (`rules.on`);
2. Look: the room's `look` text, or the item's `look` if it's an inventory item;
3. Talk: to the hint object (the walkie-talkie), these are the hints; to an actor with topics, it's the conversation menu;
4. a reaction by kind (`rules.kinds`), first the ones targeting a precise id (`target`), then the ones by kind (`kind`);
5. Giving to a character: their refusal line (`refuse` on their sheet);
6. a verb's fallback response (`rules.fallbacks`), drawn at random, never the same one twice in a row.

In fallback and kind texts, `{item}` is replaced by the item's name, `{target}` by the target, `{name}` by the name of
whatever is targeted.
`{objet}`, `{cible}` and `{nom}` are the same three under their names of 4.0: every game written with them keeps
working, and the sample game still uses them.

**`once`, four times.** The word names one idea, an effect that happens once per game, on four things: the command
`{ once: […], id }` runs its list the first time only; `once: true` on an option of a `choice` shows it once; `once:
true` on a listener (`events`) fires it once; a signal from the world outside applies once by default (`once: false`
repeats it on each new delivery). The engine remembers each in `GameState.seen` under the thing's stable id.

```ts
// rules.ts
export const rules = {
  fallbacks: {
    look: ['Hmm. {objet}. Nothing suspicious. For now.'],
    take: ['Not mine to take.', 'Too heavy. Even for me.'],
    use2: ['{objet} with {cible}? Does not work. But it was worth a try.'],
    // … one array per verb: give, open, close, take, look, talk, use, push, pull, use2
  },
  kinds: [
    { verb: 'pull', kind: 'cat', say: 'No! Never pull a cat’s tail.' },
    { verb: 'take', target: 'grandma', say: 'Grandma already has enough to carry.' },   // precise target: wins first
    { verb: 'take', kind: 'person', say: 'I cannot carry {nom}. But {nom} could carry me.' },
    { verb: 'use', item: 'stinky_cheese', kind: 'person', say: 'No. Even I am not that mean.' },
  ],
  on: [
    { verb: 'use', a: 'left_half', b: 'right_half', do: [{ lose: 'left_half' }, { lose: 'right_half' }, { gain: 'postcard' }] },
  ],
};
```

### A double tap: the verb a player means (4.0)

A single tap walks to a thing; a double tap acts on it without choosing a verb: an exit is gone through (its first
verb), a character is talked to, anything else is looked at. When that is not right, the thing names its own:
`hotspots: { cupboard: { name: 'cupboard', defaultVerb: 'open' } }` (also on a prop, an actor, an exit). An item
picked from the bag without a verb is given to a character and used on anything else; the sentence line says which
before the tap. A verb the game does not have is never chosen (`src/engine/core/default-verb.ts`).

**A single tap that goes through (4.2.3).** In the LucasArts classics a click on a door with the default "Walk to"
took the hero through it. `input: { exitOnTap: true }` in `game.ts` does the same: a single tap on an exit with no verb
picked walks there and goes through on arrival, with the double tap's verb (a locked exit says its `locked` line). A
picked verb still wins, a tap elsewhere during the walk still redirects the hero – and nothing is gone through – and a
double tap is unchanged. An exit can say otherwise: `onTap: 'walk'` keeps it walk-only in a game with the switch,
`onTap: 'go'` makes it go through in a game without it
(`exits: { path: { name: 'path', to: 'village', onTap: 'go' } }`). Off by default. It is input only: the rules, the
solver and saves do not see it.

## The commands

A single command, as plain text, makes the hero speak: `'There. A step up.'`.

### Speech

| Command | Effect |
|---|---|
| `'text'` | The hero says the line. |
| `{ say: ['grandma', 'text'] }` | A character speaks. `'hero'` always designates the hero. An `offscreen` character (narrator, radio) speaks in a frame at the top of the screen. |
| `{ say: ['grandma', 'LOOK OUT!'], shout: true }` | A shout: bigger text, and it shakes. |

A line stays on screen for as long as it takes to read, or until a tap.

### Movement and poses

| Command | Effect |
|---|---|
| `{ walk: 'shelf' }` | The hero walks to the shelf's approach point (set in the layout). |
| `{ walk: [300, 350], who: 'grandpa' }` | Grandpa walks to that point (any actor in the room; with no `walk` pose, they slide in their current pose). |
| `{ face: 'left' }`, `{ face: 'grandma' }` | Turn left, or turn to face someone or something. |
| `{ pose: ['cat', 'sleep'] }` | A lasting pose (until the next one). Character poses: see their `sprites` sheet. |
| `{ anim: ['hero', 'use'], ms: 600 }` | Hold the pose for the given time, then return to normal. Works for any actor in the room, even one in `pose: 'front'`: `{ anim: ['grandpa', 'surprise'], ms: 900 }` plays the `surprise` pose from their sheet (`sprites: { …, surprise: ['grandpa_seated/r2c3'] }`), then they go back to `front`. |
| `{ place: ['grandpa', [420, 360]], face: 'left' }` | Teleport a character. |
| `{ launch: { target: 'vase', to: [420, 310], height: 60, rotate: 360, ms: 900 } }` | Stage physics (3.4): a ballistic flight of a prop or a character from where it stands (or `from`) to `to`, a point or a thing. Computed, never simulated: the same flight on every device. A character stays where it lands; a prop until the room is entered again: follow it with what it means (`{ hide: 'vase' }`, `{ prop: ['vase', 'broken'] }`). |
| `{ spring: { target: 'lamp', axis: 'rot', amplitude: 12, frequency: 3, damping: 0.25 } }` | A damped swing or shake around its place (`axis` x, y or rot). |
| `{ path: { target: 'bat', points: [[80, 120], [300, 60], [560, 140]], orient: true } }` | Along a smooth curve through the points, turned along it. |
| `{ follow: { target: 'parrot', leader: 'hero', offset: [10, -70], ms: 3000 } }` | Keeps one at an offset from another for a while. With reduced motion, every motion jumps to its end. |
| `{ wait: 500 }` | Pause, in milliseconds. |
| `{ parallel: [[…], […]] }` | Play several lists at the same time (e.g. two characters walking). |

### The world

| Command | Effect |
|---|---|
| `{ prop: ['lamp', 'on'] }` | Change a prop's state. `'room.prop'` targets another room. |
| `{ show: 'ghost', fade: 1200 }`, `{ hide: 'ghost', fade: 1500 }` | Make an actor or prop appear or disappear, with an optional fade. |
| `{ gain: 'rope' }`, `{ lose: 'rope' }` | Add or remove an inventory item. `gain` on an item marked `used` reactivates it. |
| `{ used: 'rope' }`, `{ used: ['rope', 'badge'] }` | The item has served its purpose: it stays in the bag, **greyed out**, and can no longer be picked for Use/Give (Look still works). It becomes active again wherever a room or game rule targets it in `a` or `b` and its `if` condition is true. So: keep the rule that consumed it behind an `if` (e.g. `if: '!tied'`), otherwise it stays active in that room. Saved; old saves load without it. |
| `{ set: 'tied' }`, `{ set: ['tries', 3] }`, `{ unset: 'x' }`, `{ inc: 'tries' }` | Flags: checkboxes and counters, named however you like. |
| `{ unlock: 'market' }` | Unlock a place on the map. A locked place does not appear. |
| `{ goto: 'market', at: 'gate' }` | Change rooms (optional entry point, defined in the layout). |
| `{ map: true }` | Open the map. |
| `{ moveActor: ['grandpa', 'house'], at?: 'door' }` | Send a character to another room: see "The world lives" below. |
| `{ emit: 'bell_rang' }` | Fire an event: its listeners run right here (see "The world lives"). |

### Audio and effects

| Command | Effect |
|---|---|
| `{ sfx: 'coin' }` | Sound effect. |
| `{ music: 'market' }` | Change the music (crossfade). |
| `{ music: { push: 'minigame' } }` then `{ music: { pop: true } }` | Temporary music, then back to the previous track. |
| `{ music: { once: 'jingle' } }` | Play a track once on top, then the music resumes. |
| `{ music: { stinger: 'success' } }` | A short cue (a track of `audio.music` or a sound of `audio.sfx`) on the next beat of the score that plays (3.5); at once with a single mix. |
| `{ toast: 'New place: Market' }` | A small message at the top of the screen. |
| `{ shake: 400 }` | The screen shakes. |

### Logic

| Command | Effect |
|---|---|
| `{ if: COND, then: […], else: […] }` | Branch. |
| `{ once: […] }` | Only once in the whole game. |
| `{ nth: [[…1st time], […2nd time], […after]] }` | By number of times; the last branch repeats. |
| `{ cycle: [[…], […]] }` | In a loop: 1, 2, 1, 2… (e.g. a record player alternating two tracks). |
| `{ random: [[…], […]] }` | At random, never the same one twice in a row. |

### Sequences and screens

| Command | Effect |
|---|---|
| `{ cutscene: […] }` | Cutscene: black bars, a "Skip" button. Skipping plays the rest instantly: effects (items, flags, states) still apply. |
| `{ choice: [{ text, do, if?, once? }, …] }` | The player picks a line; the hero says it, then `do` plays. |
| `{ talk: 'grandma' }` | Open an actor's conversation menu from a script. |
| `{ minigame: 'pipes', params: { tiles: …, cols: 4 }, then: […] }` | Launch a minigame. A minigame is never failed: `then` always plays, even if you skip. All its images come from `params` (see "Available minigames"). |
| `{ phone: 'grandma', do: […] }` | Incoming call: ringtone (`skin.sounds.phone`), a Pick-up button, then the lines in `do`. During the call, the caller shows in a phone frame (bottom left), mouth animated while they talk; their lines appear at the top. |
| `{ phone: ['lou', 'seller'], do: […] }` | A call with several people: all shown side by side in the same frame (the first one in front), each at its own size (`height`). Each `{ say: ['lou', …] }` animates the right person's mouth. Pose shown: the first of `skin.callPoses` that exists (default `phone`, `front`, `face`, `idle`); mouths from `mouths.phone` (otherwise the `phone_talk` pose alternates, otherwise a small bounce). Ids are characters from `characters` (no actor needed in the room). |
| `{ guide: { verb: 'look', target: 'shelf', say: 'Pick Look, then tap the shelf.' } }` | Tutorial: the hero gives the instruction, the verb blinks, the target glows. The script waits until the player does exactly that action; any other action repeats the instruction. |
| `{ hint: true }` | Give the current hint (same as talking to the walkie-talkie). |
| `{ ending: true, after?: […] }` | The sealed ending (`GameDef.ending`): scratch ticket, confetti, then `after`, then the final card. `{ reveal: true }` is the old name, still accepted. |
| `{ end: true }` | End of game. |

## The conditions

| Condition | True when… |
|---|---|
| `'tied'` / `'!tied'` | the flag is true / false or absent. |
| `{ has: 'rope' }` | the item is in the inventory. |
| `{ flag: 'tries', eq: 3 }`, `{ flag: 'tries', gte: 2 }`, `{ flag: 'x', lt: 5 }` | comparing a flag. |
| `{ not: … }`, `{ all: [ … ] }`, `{ any: [ … ] }` | not, and, or. |
| `{ visited: 'market' }`, `{ room: 'market' }` | we have already visited the market / we are there now. |
| `{ prop: ['lamp', 'on'] }`, `{ prop: ['house.lamp', 'on'] }` | the prop is in that state (in the current room, or `'room.prop'`). |
| `{ unlocked: 'market' }` | the place is unlocked on the map. |
| `{ seen: 'house.grandma.0' }` | topic #0 of grandma's conversation at the house has already been heard. |
| `{ actorIn: ['grandpa', 'house'] }` | the moving character is in that room (see "The world lives"). |

## When the DSL is not enough

A game can define its own commands in code, in `games/<id>/index.ts`:

```ts
export const commands: CustomCommands = {
  sparkle: { pure: true, run: async ({ scene, args }) => { /* draw stars over `scene` for args.ms */ } },
  explode: { effects: [{ set: 'chicken_exploded' }, { lose: 'chicken' }, { sfx: 'boom' }], run: ({ scene }) => { /* the blast */ } },
};
// in a script:  { custom: 'sparkle', args: { ms: 1200 } }
```

`effects` says what the command does to the game, as plain commands: they run first, in the browser **and** in the
solver, so a custom command never breaks `npm run solve` nor the save. `run` is the visual part, browser only (it gets
the scene element, the presenter, the state to read, the arguments). A command that changes nothing says `pure: true`.
The validator refuses a command that declares neither. `run` must not touch the state: in dev mode the engine compares
the state before and after it and reports in the journal a `run` that changed something outside `effects` (the solver,
the saves and the replay only know `effects`).

## Translations

Content stays written in one language (`lang: 'en'` in `game.ts`). Translating is a table, not keys in the content:

```bash
npm run i18n -- extract              # games/<id>/locales/en.json: every text with its path (the reference)
npm run i18n -- extract --lang fr    # locales/fr.json: keeps what is translated, follows moved texts, adds the missing ones
npm run i18n -- status               # coverage of every language, stale paths, long lines
```

A path looks like `room:house/look.pantry[1]`, `item:key/name`, `char:grandma/refuse`, `ui/newGame`,
`rules/fallbacks.look[2]`, `start/intro[0].say`; a line with an id is keyed by it (`room:house/look.pantry.<id>`,
`rules/fallbacks.look.<id>`: lists take `{ id, text }` lines, UPGRADING §10); the file is `{ "<path>": "<text>" }`. The game ships the files it has
(`locales` in `index.ts` picks them up); the player gets `?lang=fr`, their choice in Settings (`ui.language`), or their
browser's language when a translation exists. Texts a file lacks stay as written. `npm run validate -- --report` and the
Studio's Check tab show the coverage.

Paths follow the structure, so a refactor moves them: `extract --lang fr` copes. It compares the game with the
reference file (`locales/en.json`, refreshed at the same time): a text that moved (a reordered list, a rule moved up)
keeps its translation because its source text is the same; a text that disappeared is parked under `_stale:<old path>`
(ignored in play, listed by `status`, deleted by hand when sure) and comes back with its translation if the path returns;
a text whose source changed is offered again to translate. Rule of thumb: run `extract --lang xx` after every refactor,
before translating anything new, and commit the reference file with the translations.

## Your own minigames

The engine ships pipes, cables, pick, hide, runner, stroke and scratch. A game adds its own (`minigames` in
`index.ts`): an object `{ run(ctx): Promise<void>; required?: string[] }` where `ctx` gives the overlay element,
scale, images, sounds, the `params` of the command and an abort signal; `required` names the params the validator
checks. `{ minigame: 'sword_fight', params: { … }, then: [ … ] }` then plays it like a built-in one. See `src/engine/minigames/types.ts`.

## Several playable characters

```ts
hero: 'bernard',
players: { ids: ['bernard', 'hoagie', 'laverne'], start: { hoagie: { room: 'past_lab' }, laverne: { room: 'future_lab' } },
  give: 'Here, {nom}: the {objet}.' },
```

Each playable character has their own room, position and inventory (`sharedInventory: true` to share one bag). The
hero is the one controlled first. A button per other character sits in the tools row (their portrait, or their
initial): tapping it is `{ switchPlayer: 'hoagie' }`, the view moves to their room. An inactive character standing in
the room is drawn and can be **given** an item: it goes to their bag (`{ transfer: ['hamster', 'laverne'] }` does the
same from a script). The condition `{ player: 'laverne' }` tells who is acting; `'hero'` in commands always means the
active one. If a room declares an actor for a playable character, that actor stands for them while they are inactive
(poses, talk topics); they are not drawn twice. Checkpoints take `active` and `players: { id: { room, inventory } }`.
The solver switches characters like the player would ("Switch to hoagie" in its path).

## Staging: wide rooms, animations, voice, settings

### Wide rooms and the camera

A room is 640 × 400 logical units. Give its layout a `width` (e.g. 960, 1280: in the editor's "Room width" folder, or
in `layout/<room>.json`) and paint its backdrop that wide (800 px tall, the width in proportion; `npm run assets` keeps
it): the room scrolls, and the **camera** follows the hero. Positions stay world coordinates (a prop at x 900 is in the
right part). Commands move the camera:

| Command | Effect |
|---|---|
| `{ camera: { to: 'far_stalls', ms: 900 } }` | Pan to centre on something (an actor, a prop, a zone), then stay there. |
| `{ camera: { pan: 320, ms: 600 } }` | Pan to a left edge, in logical units (clamped to the room). |
| `{ camera: 'follow' }` (or `'reset'`) | Follow the hero again. Entering a room always follows the hero. |

The camera is in the state (a save restores it), the solver ignores it, and "reduce motion" makes every pan instant.

### Prop animations and frame events

```ts
props: {
  pantry: { name: 'pantry', states: { locked: 'home/r1c3', open: 'home/r1c4' }, initial: 'locked',
    anims: { rattle: { frames: ['home/r1c4', 'home/r1c3', 'home/r1c4', 'home/r1c3'], fps: 12, at: { 1: [{ sfx: 'latch' }] } },
             glow: { frames: ['home/g1', 'home/g2'], fps: 4, loop: true } } },
},
on: [{ verb: 'open', a: 'pantry', do: [{ play: ['pantry', 'rattle'] }, 'Locked.'] }],
```

`{ play: [prop, name] }` shows the frames in turn at `fps` and **runs the commands of `at` when that frame is reached**
(a sound on the right frame, a flag, a line), then the prop goes back to its state image. A `loop` animation plays on
its own until `{ stopAnim: prop }`; its `at` only plays sounds and shakes (`sfx`, `shake`), every turn of the loop: a
machine that clanks on frame 4 is `glow: { frames: […], loop: true, at: { 4: [{ sfx: 'clank' }] } }`, and the validator
refuses a flag or a line there (the loop never ends). Character poses get the same: `{ anim: ['hero', 'jump'], ms: 600, at: { 2: [{ sfx: 'thud' }] } }`
runs the commands when the pose reaches that frame, at the character's `fps`.

### Voice

```ts
audio: { voices: { grandma_01: 'grandma-01.mp3' } },   // files in games/<id>/audio/voice/
{ say: ['grandma', 'Pixel! Bad news.'], voice: 'grandma_01' }
```

The line stays on screen as long as the clip plays (a tap still skips it); without a clip, the reading time applies.
The voice volume is a setting of its own, and the music steps back while someone speaks. A line with a stable id
plays the clip under its id (`audio.voices[id]`); the other languages have their own clips,
`audio.voicesByLang: { fr: { <line id>: 'fr/…mp3' } }`, chosen with the language. Production: `npm run voices`
(TOOLS). A sound that matters gets a caption, shown in writing with the captions setting (on by default, offered in
the settings only when the game captions something) and translated like any line:
`{ sfx: 'door_slam', caption: '[A door slams upstairs]' }`.

### Settings

`settings: true` adds a Settings entry to the pause menu: text speed (slow / normal / fast), text size (normal / large),
reduce motion (no shake, instant camera and fades), a readable font when the game ships one (`skin.fonts.readable`),
music / sound / voice volumes. Preferences stay in the browser, outside the save. Texts: `ui.settings`, `ui.textSpeed`,
`ui.textSize`, `ui.reduceMotion`, `ui.readableFont`, `ui.volumeMusic`, `ui.volumeSfx`, `ui.volumeVoice`, `ui.slow`,
`ui.normal`, `ui.fast`, `ui.large` (English defaults when absent).

## The stage (3.4): layers, masks, lights, particles, floors

A room can show more than its backdrop. The content says what exists and when (`stage` in the room); the layout says
where (written by the Studio's editors); the painter draws it. Nothing on the stage is game state: a layer, a light or
a particle never changes what the solver sees (tests/stage.test.ts proves the sample game with a stage on every room:
same states).

```ts
stage: {
  layers: [
    { id: 'sky', image: 'pier/sky', role: 'backdrop' },               // behind everything (else `decor` is the backdrop)
    { id: 'counter', image: 'pier/counter', role: 'scenery' },        // among the characters, by its layout `z`
    { id: 'lantern', image: 'pier/lantern', role: 'foreground', visible: 'lantern_lit' },  // in front of everyone
    { id: 'fog', image: 'pier/fog', role: 'effect' },                 // above all
  ],
  lights: [{ id: 'lamp', kind: 'radial', color: '#ffd28a', intensity: 0.7, visible: 'lantern_lit' }],
  emitters: [{ id: 'spray', kind: 'rain', rate: 40 }],
  transition: 'fade',                                                  // cut (default), fade, wipe
  links: { stairs: { if: 'gate_open', locked: 'The gate is shut.' } }, // the logic of a walk link
},
```

In the layout: `layers.<id> { x, y, z, parallax: [x, y], blend, opacity }`, `occluders.<id> { polygon | mask | layer,
z, feather?, invert? }` (what hides a character standing deeper than `z`: a pillar, a counter, a window frame),
`walkZones.<id> { area, holes?, scale?, zoom? }` (several floors; they replace `walk`), `walkLinks.<id> { from: { zone,
at }, to: { zone, at }, mode: walk | stairs | ladder | jump | teleport, ms?, facing?, oneWay? }`, `lights.<id> { at,
radius }`, `emitters.<id> { area }`. A link that is closed cannot be walked: the hero walks to its foot, says its
`locked` line, and the action goes on from there, so the rules of what stands behind it must check the same condition
(`npm run lint` warns, `walk-link-gate`): the puzzle is the rule, the link only stops the walk. Each zone scales the
characters by its own depth line (`scale`) and can zoom the camera (`zoom`, 1–2: a balcony seen closer); a zoomed
camera also moves up and down to keep the hero in view. `renderer: 'canvas'` (on the room or the game) chooses the Canvas painter: masks
from images or layers, lights, particles and blend modes are drawn only by it (`npm run validate` says so on a DOM
room). An old room is a stage of one backdrop (`decor`) and one zone (`walk`, named `main`): nothing to rewrite.

## Exits, chapters, saves

### Declared exits

A way out can be written as a hotspot plus a rule with `goto`. Declaring it is shorter, and tells the tools the map of
the world:

```ts
exits: {
  window: { name: 'garden window', to: 'garden', entry: 'house', if: { unlocked: 'garden' },
    locked: 'Not yet. First, the key.', sfx: 'door_open', verbs: ['use', 'open', 'push'] },
  trapdoor: { name: 'trapdoor', to: 'cellar', oneWay: true },
},
```

The engine turns each exit into a hotspot of the same id (kind `exit`, placed in the layout like any zone, with its
`look` line in `look`) and rules at the end of `on`: "VERB exit → goto" when `if` holds, then the `locked` line. Your own
rules on the exit come first, so a special reaction (an item used on the door) still wins. `verbs` defaults to use, open,
walk, go, enter, push, pull (those your game has). From the exits, the `goto` commands and the map, the validator knows
**which rooms nothing leads to** and **which exits have no way back** (say `oneWay: true` when that is intended); the
Studio's Check tab and `npm run page:world` draw that map. What a single tap on an exit does is `onTap` (see "A single tap that goes
through" above).

### Chapters and invariants

A checkpoint with `goals` is the end of a chapter. `npm run solve -- --chapters` proves each chapter on its own, from
the previous checkpoint (or a new game) until its goals hold, then from the last checkpoint to the ending: a long game
is checked in small bounded searches, and a broken chapter is named.

```ts
checkpoints: {
  garden: { room: 'garden', inventory: ['token'], goals: [{ has: 'token' }] },
  market: { room: 'market', …, goals: ['tank_drained', { unlocked: 'market' }] },
},
// Must never become true (the solver reports the path that makes one true):
invariants: [{ all: [{ not: { has: 'token' } }, '!flowers_done'] }],
```

### Objectives and the quest journal (4.1.12)

`objectives` names what the player has to do, for the pause menu's **Objectives** list (a step under its parent, ✓ done,
○ open, a side objective in italics), for the semantic journal (`objectiveCompleted`, once, the first time `done`
holds after an action) and for the solver: `npm run solve -- --goal=100%` searches for a state where every objective
that is not `optional` holds. Write `done` as a condition that stays true once true (a flag set once, an item kept):
the journal never takes a completion back, but a game loaded later counts as done only what holds then.

```ts
objectives: {
  key: { title: 'Find the pantry key', done: { any: [{ has: 'key' }, 'pantry_open'] } },
  tank: { title: 'Drain the water tank', done: 'tank_drained', parent: 'key' },
  pantry: { title: 'Open the pantry', done: 'pantry_open' },
  guess: { title: 'Guess what is in the pantry', done: 'guess', optional: true },
},
```

`npm run validate` refuses an objective whose `done` can never hold (a flag nothing sets, an item nothing gives), an
unknown `parent` and a cycle of parents. The titles are translated like every text (`objectives/<id>.title`), and the
menu's row is `ui.objectives`. The Studio's **Language** tab edits them; MCP's `set_value` writes them with
`id: "@game"`. Every condition and command, with its shape, is in the generated reference (`docs/en/DSL.md`).

`speedrun` (4.1.14) declares speedrun categories and splits as content: triggers on the semantic events (a room
entered, an item acquired, an objective completed, the ending), the rules of each category (saves, pauses, hints,
reloads, Reality, the fingerprint components a run must match, the inputs), the rules' version. `npm run validate`
checks it; `docs/en/SPEEDRUN.md` is the guide.

### Save slots and migrations

```ts
saves: { slots: 3 },   // the pause menu gets Save / Load with three slots, plus export and import as a JSON file
ui: { …, save: 'Save', load: 'Load', slot: 'Slot {n}', emptySlot: 'empty', exportSave: 'Export to a file', importSave: 'Import a file', confirmOverwrite: 'Overwrite this slot?' },
```

Manual slots are stored like the autosave: in IndexedDB, as envelopes, read back after each write; a file imported
from the menu also fills the first free slot. Autosaves use a v3 envelope validated before the current game changes, with a verified IndexedDB write and a
localStorage compatibility import. When the content changes incompatibly, bump `saveVersion` and carry the state over
as data, one step per version:

```ts
saveVersion: 3,
migrations: [
  { from: 1, renameFlag: { found: 'key_found' }, renameItem: { cle: 'key' } },
  { from: 2, renameRoom: { lobby: 'hall' }, renameProp: { 'hall.lamp': 'hall.lantern' }, dropFlag: ['tmp'] },
],
```

The migration also supports counters, seen ids, scripts, named script steps, players and characters; see the complete
`Migration` type. The chain must reach `saveVersion`; a save with no path still starts a new game. Stale optional
references left after migration are pruned with a visible warning, while structural corruption, a foreign game, a
missing current room or an unknown active player is rejected without changing the current session.

## The world lives: scripts, events, moving characters

Everything above reacts to the player: a tap, a rule, its commands. Three primitives let the world act on its own.
They are data like the rest, so `validate`, `solve` and the save understand them.

### Scripts: things that happen without a tap

A script is a list of commands that runs on its own, **one command at a time, in the gaps between the player's actions**:
never during an action, a cutscene, a conversation or a minigame. The engine resumes it at the next gap. A room's scripts
run while the player is in the room; the game's scripts (`scripts` in `game.ts`) run everywhere.

```ts
scripts: [
  // Biscuit stretches every seven seconds, forever.
  { id: 'biscuit_naps', loop: true, do: [{ wait: 7000 }, { anim: ['biscuit', 'stretch'], ms: 1200 }] },
  // Lou strolls between two spots until the deal is done; when `while` turns false the script rewinds and waits.
  { id: 'lou_paces', loop: true, while: '!bouquet_given', do: [
    { wait: 6000 }, { walk: [235, 262], who: 'neighbor' }, { wait: 3000 }, { walk: [147, 278], who: 'neighbor' },
  ] },
  // Once: the cook comes when the gong rings, then the script is done.
  { id: 'cook_comes', do: [{ waitEvent: 'gong' }, { moveActor: ['cook', 'hall'] }, { say: ['cook', 'Dinner!'] }] },
],
```

| Field or command | Effect |
|---|---|
| `id` | Unique in the whole game (a script can be waited on from anywhere). |
| `loop: true` | Starts again from the top when done. A loop must contain a `wait`, `waitUntil` or `waitEvent`. |
| `while: COND` | Runs only while the condition holds; when it turns false, the script rewinds to its first command and waits. It is checked before every command: a script that `lose`s the item its `while` needs stops right there (gain the new item first, then lose the old one). |
| `{ wait: 3000 }` | A pause: the player keeps playing meanwhile. |
| `{ waitUntil: COND }` | Pauses until the condition holds (checked at every gap). |
| `{ waitEvent: 'gong' }` | Pauses until the event is emitted, even from another room. |
| `{ startScript: 'id' }`, `{ stopScript: 'id' }` | From any script or rule: start a script from the top (again, if done or stopped), or stop it. |

A script's position is saved with the game: it resumes where it was. Since a script's commands interleave with the
player's actions at the level of a whole command, keep each command short (a `walk`, a line, a pose), and put a sequence
that must not be interrupted in a `cutscene`. A script cannot be skipped by the player.

### Events: "something just happened"

A flag is a state (the door *is* open). An event is a moment (the bell *just* rang). `{ emit: 'bell_rang' }` runs, right
there and in order, the listeners of the current room, then the game's:

```ts
// market.ts, in a rule:  { gain: 'key' }, { emit: 'key_found' }
// game.ts:
events: [
  { on: 'key_found', once: true, do: [{ moveActor: ['grandpa', 'house'] }, { toast: 'Grandpa went home.' }] },
],
```

`if` and `once` work as on a rule. An event is not remembered: to react later (next time the player enters a room), set
a flag in the listener and test it in `onEnter`. A script paused on `waitEvent` for that event moves on, wherever it is.

### Moving characters

A character declared as an actor in several rooms normally shows in all of them (Grandma in the kitchen *and* the
garden). Give it a starting room, and only its actor in that room shows; `moveActor` sends it elsewhere:

```ts
// cast.ts
grandpa: { name: 'Grandpa', room: 'garden', … },
// house.ts and garden.ts both declare   actors: { grandpa: { char: 'grandpa' } }   and place him in their layout.
// anywhere:  { moveActor: ['grandpa', 'house'] }            at his layout position in the house
//            { moveActor: ['grandpa', 'house'], at: 'door' } at that entry point (or a point) of the house
// conditions: { actorIn: ['grandpa', 'house'] }
```

The character is removed from the room it leaves and appears in the one it reaches, on screen if the player is there.
`checkpoints` take a `where: { grandpa: 'house' }` to start with a character elsewhere than its starting room.
A checkpoint with `goals` must be a state the game can really reach when those goals hold: `npm run solve -- --prove
--chapters` proves each chapter from every reachable boundary state and reports a checkpoint that matches none, with
the dimensions that differ (`room: house vs market`). `used`, `seen` and `players[].used` let a checkpoint name what a
real playthrough leaves behind (an item already used, a once-listener already fired).
The validator refuses `moveActor` toward a room where the character is not an actor, or for a character with no `room`.

## Characters, items, map

```ts
characters: {
  grandma: {
    name: 'Grandma', color: '#f0c040', height: 124, kind: ['person'],
    portrait: 'grandma/r1c2',
    sprites: { idle: ['grandma/r3c3'], talk: ['grandma/r3c4', 'grandma/r3c3'], walk: ['grandma/r2c1', 'grandma/r2c2', …] },
    refuse: 'That is sweet, dear. But keep it, you will need it for your errand.',
    hug: 'Always. Even with a basket in my arms.',
  },
  talkie: { name: 'the walkie-talkie', color: '#ff6fb5', offscreen: true },   // speaks in a frame, no body
},
items: {
  rope: { name: 'rope', icon: 'items/r1c2', look: 'A length of rope. One end for the hook, one for the bucket.' },
},
map: {
  start: 'world',
  regions: { world: { name: 'World', image: 'decor/map' }, town: { name: 'Town', image: 'decor/map_town', parent: 'world' } },
  places: {
    market: { name: 'Market', room: 'market', region: 'town', pos: [61, 41], portrait: 'seller/r1c2', vehicle: 'car', news: '!market_done' },
  },
},
```

### Speech: only the mouth moves

A character with a talking sheet declares their mouths per pose. During a line, the body never changes:
the open-mouth images cycle at random (160 to 220 ms), a blink passes by now and then at rest.
The "mouth closed" image replaces the pose's rest image, so rest and speech come from the same drawing.

```ts
import { human, mouths } from './cast';
grandpa: { …, mouths: mouths('talk_grandpa', { idle: 'profile', front: 'face', seated: 'seated' }) },
```

`mouths(folder, { pose: line })` reads `talk_<char>/<line>/t1…t6` (t1 closed, t2 to t4 open, t5 blink, t6 smile).
With no mouths for a pose, the character keeps the same image and bounces a pixel while talking; a long line starts
with a gesture (`talk` pose) played once.

### Variants depending on state

```ts
import { cat } from './cast';
hero: { …, sprites: cat('hero'), variants: [{ if: { has: 'bucket' }, sprites: cat('hero_bucket'), mouths: … }] },
```

The first variant whose condition is true replaces `sprites`, `mouths` and `portrait`. The change shows right away
(e.g. as soon as the bucket is picked up).

### Palette swap (`palette`, also on variants)

One sheet, several looks: `palette` maps source colours to target colours, both `#rrggbb`. The room view recolours
every sprite and mouth frame of the character once, in an offscreen canvas (cached, alpha kept). A variant's
`palette` replaces the character's while its condition holds (a variant without one keeps the character's).

```ts
biscuit: { …, sprites: cat('cat'),
  palette: { '#2c1818': '#7a3416', '#492a25': '#b0592a', '#543329': '#c4703a' }, paletteTolerance: 14,
  variants: [{ if: 'muddy', palette: { '#492a25': '#5a4a3a' } }] },
```

Matches are exact RGB by default: this suits the `pixel` art style, whose cutter gives every material one exact value.
Painted (`cel`) sheets and lossy WebP have many neighbouring tones: `paletteTolerance` (an RGB distance, 10 to 16 is a
good start, below the distance to the outline colour) recolours every pixel near a source colour, keeping its offset
from it. Pick the source colours from the cut PNG (the most frequent opaque colours of a cell). The demo's Biscuit
uses this to become a ginger tabby. Portraits in menus and calls are not recoloured. `npm run validate` warns about a
key or value that is not `#rrggbb`.

### Things with multiple states (a seagull that watches / snaps, an old dog that sleeps / sulks / yawns, a cat's eye glowing on a screen)

A hotspot has only a name and a zone. For a drawn thing that changes, use a **stateful prop**:
`props: { seagull: { name: 'seagull', states: { watch: 'obj_yard/r2c4', snap: 'obj_yard/r2c5' }, initial: 'watch' } }`,
with positions per state in the layout (`props.seagull.states.snap`); the clickable zone follows the image. Change state
with `{ prop: ['seagull', 'snap'] }` and react to the state with `if: { prop: ['seagull', 'snap'] }`. For a zone of the
background that changes name or shape, use two hotspots with opposite `visible` conditions (`visible: 'x'` /
`visible: '!x'`), each with its own zone; a rule can target both (`a: ['h1', 'h2']`).

### Presence without interaction

`actors: { ghost: { char: 'ghost', interactive: false, visible: 'ghost_seen' } }`: visible, but neither clickable nor
named. Combine with `{ show: 'ghost', fade: 1500 }` / `{ hide: 'ghost', fade: 1500 }` and `glow` on the character sheet.

Character poses, by convention: `idle`, `talk`, `walk` (profile, facing right; the engine flips the image for left),
`walk_front`, `walk_back`, `point`, `use`, plus any special pose you want (`sleep`, `sit`, `celebrate`…).
A pose is a list of images played in a loop. A missing pose falls back to `idle`.

## The skin (`skin`)

Everything the engine shows or plays without the content naming it. Manifest image ids; sounds are ids from `audio.sfx`
(`phone`, `plane`, `confetti`) or `audio.music` (`jingle`, `end`). A missing sound = silence. `npm run validate`
checks every id.

```ts
skin: {
  icons: {
    map: 'ui/r1c5', pause: 'ui/r3c5', music: 'ui/r3c6',   // required: the three column buttons
    spark: 'ui/r3c4',                                        // spark for the guided tutorial
    pin: 'ui/r1c6', news: 'ui/r2c4', plane: 'ui/r2c1', car: 'ui/r2c2',   // map (map.vehicles overrides these if set)
    confetti: ['ui/r4c1', 'ui/r4c2'], cardFallback: 'items/r3c6',      // sealed ending
  },
  sounds: { phone: 'phone', plane: 'plane', confetti: 'confetti', jingle: 'jingle', end: 'end' },
  fonts: { ui: 'DotGothic16', pixel: 'Press Start 2P' },   // CSS families → the --font-ui and --font-pixel variables
  heights: { actor: 110, hero: 84 },                       // default height for a character with no `height`
  callPoses: ['phone', 'telephone', 'front', 'face', 'idle'],   // poses tried for a call's frame
  pixelArt: false,                                         // true: scaled-up images keep hard edges (artStyle "pixel")
},
```

Interface texts are in `ui` (including `tapToContinue`, "▼ tap to continue", and `ok`, the password button). The
keys the engine shows itself have an **English default** when the game leaves them out (`src/engine/dom/ui-defaults.ts`):
`verbs` (the verb bar's ARIA label), `saveFailed`, `saveAdjusted`, `updateAvailable`, `updateNow`, `advance`, `jump`,
`duck`, `offlineStatus`, `offlineComplete`, `offlineRetry`, `save`, `load`, `slot`, `emptySlot`, `confirmOverwrite`,
`exportSave`, `importSave`, `exportSession`, `shareSession`, `settings`, `textSpeed`, `textSize`, `slow`, `normal`,
`fast`, `large`, `reduceMotion`, `readableFont`, `language`, `volumeMusic`, `volumeSfx`, `volumeVoice`, and since 4.1.14
`speedrun`, `exportRun`, `abandonRun` (the pause menu's speedrun rows). A game in
another language provides them all: `npm run i18n -- status` lists the keys left to the defaults, and
`npm run e2e -- --lang <xx>` fails when one is visible.

## The layout (written by the editor, never typed by hand)

Fields read by the engine, in addition to positions: on a prop (and in each of its `states`) `rot` (degrees, clockwise,
pivot at the feet), `flip` (horizontal mirror), `flipV` (vertical mirror, the image sits below the feet line, as on the
placement page), `z` (forced layer); a field missing from a state falls back to the prop's own. On an actor: `z` forces
their layer (otherwise, it follows their feet). On the room: `floor` (default 395) is the bottom of the floor; a computed
approach point never goes lower.

An actor with no `approach` point in the layout is reached from the side facing the middle of the room, 44 units
away whatever the characters' size. Tall characters who gesture as they talk end up with a hand in each other's head:
set `actorGap` on the game (for example `0.8`) and the distance becomes that share of the two characters' mean height
(`height` of the hero and of the character, or the actor's `h` in the layout), times the depth scale where the
character stands. An `approach` point in the layout still wins, for a character who needs the other side.

## Title screen and credits

`titleScreen: { decor, video, logo, music, footer }`: the video (file `games/<id>/art/decor/decor_<name>.mp4`,
re-encoded by `npm run assets`) loops silently behind the logo; the background image serves as a poster.
`creditsScreen: { video, decor }`: the credits background (the title's video by default). `credits: [lines…]`: the text.

## The images

An image is designated by `folder/name`, the path of the cut file in `games/<id>/art/` without the extension:
`grandma/r3c3` (grandma's sheet, row 3, column 3), `items/r1c2`, `house/armchair`. Backgrounds are named `decor/<room>`.
`npm run assets` prepares only the images referenced by the content, and `npm run validate` flags any missing image.
After the first visit the game caches every image and sound for offline play (`offline: 'full'`, the default; `'nearby'`
keeps only the current room and its neighbours); `assetBudgets` sizes the batches. A 40 MB game is 40 MB on the phone.
`assetBudgets.initialKB`, `roomKB` and `chapterKB` say how much the game may ask a phone to download before the first
room is playable, per room and per chapter. With a score, `backgroundScoreKB` (its stems), `decodedAudioMB` (decoded),
and for every game `offlineTotalKB` (the full warm-up) hold the rest (3.6); with transitions, `transitionPeakMB` (two
scores, a bridge and a stinger decoded at once, 3.6.1); `initialJsKB` the JavaScript of a first visit (3.9, checked on
the build by `npm run verify:dist`). `npm run weight` checks them, and a release
requires them (docs/en/TOOLS.md).

## Available minigames

Each minigame declares its contract: `required` params, `textParams` (the player-visible strings, extracted for
translation) and `bindings` (the params that name an image or a sound: `validate` checks they exist, e.g. `stroke`'s
`sfx`, `cables`' `sfx.ring` / `sfx.stamp`, `scratch`'s `ticket` and `sfx`).

Every minigame accepts `intro` (a line from the hints voice at the start) and `win` (the closing line). None of them can
be failed, and all have a "Skip" button (except `scratch`, which is the sealed ending itself).
The engine never names an image: each minigame gets its own from `params`. **Bold** parameters are required;
`npm run validate` flags the ones that are missing.

| Id | Gesture | Parameters |
|---|---|---|
| `pipes` | Tap a pipe to rotate it a quarter turn | **`tiles`** `{ ground, straight: [dry, wet], elbow: [dry, wet], tee: [dry, wet] }` (base images: straight left-right, elbow left-down, tee left-right-down), **`source`**, **`nozzle`** `[dry, spraying]`, **`tank`**, `mushrooms` `[thirsty, happy]`, `cols` (4), `rows` (3), `helpAfter` (15 taps before the right pipe glows), `background` |
| `stroke` | Pet slowly: a gauge rises | **`target`** (the animal's image), **`hand`** (the ghost hand's image), `goal` (100), `sfx` (the success sound), `tooFast` (line shown if too fast) |
| `pick` | Tap the right image | **`rounds`** `[{ prompt, options: [image…], answer }]`, `decoy` (a trick image), `decoyLine`, `wrongLine`, `background` |
| `hide` | Find the right hiding spot | **`spots`** `[{ img, x, y, h, reply, found }]`, `bg` (background image), `answer` (index of the right one) |
| `runner` | Top of the screen: jump, bottom: duck | **`hero`** `{ run: [images], jump, slide, stumble, h, slideH }`, `buddy` (same shape, a second runner behind), **`chaser`** `{ frames: [images], fps, x, speed, h }`, **`obstacles`** `{ jump, duck }` (jumped over on the ground, ducked under when suspended), **`bg`** (scrolling background), `seconds` (20), `stumble` (line shown on a stumble) |
| `cables` | Pull a plug: its cable wiggles through the knot; drag it onto the right socket | **`board`** (a 4-socket panel), **`knot`**, **`plugs`** `{ color: image }` (free color ids, 4 at most), `sockets` (order of the colors on the panel, top to bottom), `tints` `{ color: css }`, `gags` (`lamp`, `phone`, `toaster`, `windows`; a gag missing its images or text is dropped), `lampOn`, `lampOff`, `phone`, `toaster`, `windowsText`, `sfx: { ring, stamp }`, `helpAfter` (4) |
| `scratch` | Scratch a ticket | **`ticket`** (image), `text`, `color`, `sfx` (sound while scratching), `threshold`; used by the sealed ending via `ending.scratch` |

A game can add its own minigames: `export const minigames = { mygame: { required: ['…'], run(ctx) { … } } }` in
`index.ts`.

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

## The sealed ending (`ending`)

An optional module. `GameDef.ending` describes it:

```ts
ending: {
  file: 'data/ending.bin',                          // produced by npm run seal
  password: { given: '…' },                         // or { typed: true, prompt: 'Password?' }
  guess: { flag: 'guess', labels: { a: '…', b: '…' }, right: '… {guess} …', wrong: '…', none: '…' },   // a prediction, judged on the map
  scratch: { ticket: 'items/r4c1', sfx: 'scratch' },   // parameters of the scratch minigame
  card: { accent: '#d4145a' },                       // the final card's frame and scratched-text color
},
```

`{ ending: true, after: […] }` plays, in order: the scratch ticket (the text comes from the encrypted file), the
confetti (`skin.icons.confetti`, `skin.sounds.confetti`) and the jingle (`skin.sounds.jingle`), then `after`, then the
final card (music `skin.sounds.end`). `{ reveal: true }` is the old name.
Ending texts are **never** in the game content: they live in `games/<id>/private/ending.config.ts` (see `TOOLS.md`, "The sealed
ending"). Right before it, the script plays whatever it wants (the family gathered on the sofa, the lock melting away…).

## Checking your work

`ui.shareSession` names the pause menu's row that sends a playtest from a phone (docs/en/TOOLS.md, "Playtests").
`npm run lint` (docs/en/TOOLS.md, "Lint") reads the puzzle graph and a solver run for what the validator cannot see:
a condition nothing sets, a rule another rule hides, an item no rule needs, a hint that cannot fire, an action the
solver never ran. A finding you keep on purpose (a red herring) is silenced in `game.ts`:

```ts
lint: { ignore: ['item-red-herring:rubber_chicken', 'rule-shadowed:house/on[4]'] },   // a code, `code:<id>` or `code:<room>/<path>`
```

The same list keeps a decorative flag (set, never read) out of `npm run validate`'s warnings: `flag-never-read:<flag>`.


```bash
npm run validate   # everything referenced exists, every visible thing has a Look, texts are not empty
npm run solve      # the game can be finished from "New game"; lists items that are never used
npm run dev        # then ?dev to jump to a checkpoint, ?edit=house to place things
```

## Music in stems (3.5)

A track of `audio.music` can also have a score: its stems, played together by the music director, the mix following
the game. `npm run audio -- stems` makes them (docs/en/AUDIO.md).

```ts
audio: {
  music: { theme: 'swan_theme.mp3' },            // the single mix: Save-Data, low-end devices, no Web Audio
  scores: {
    theme: {
      stems: { melody: 'swan-theme-stems/melody.mp3', strings: 'swan-theme-stems/strings.mp3', harp: 'swan-theme-stems/harp.mp3', bass: 'swan-theme-stems/bass.mp3' },
      bpm: 80, beatsPerBar: 4,                  // from score.json
      states: [                                 // the first that holds sets the mix; none: every stem
        { if: { player: 'biscuit' }, stems: ['harp', 'bass'] },
        { if: { room: 'garden' }, stems: ['strings', 'harp', 'bass'] },
      ],
      // quantize: 'bar' (default) or 'beat'; fadeBeats: 2; loop: [first bar, end bar)
    },
  },
}
```

A state is any condition of the DSL (a flag, the room, the active character). A change of state takes effect on the
next bar, crossfaded; another room with the same track keeps the music going and only changes the mix. `npm run
validate` checks the stems, the tempo, the states' stems and conditions, and that the single mix exists. The Studio's
Music tab plays a score and each state's mix.

From one score to another (3.6), a rule says where the old one lets the new one in, on its own grid:

```ts
audio: {
  scores: { day: { …, markers: { calm: 8 }, phraseBars: 4 }, night: { … } },
  transitions: [
    { from: 'day', to: 'night', at: 'calm', bridge: 'dusk_sting' },  // on bar 8 of "day", then the bridge, then "night"
    { from: '*', to: 'day', at: 'phrase', fadeBeats: 2 },             // on the next phrase, crossfaded over 2 beats
  ],
  maxDecodedMB: 160,                                                  // decoded audio kept (default 160)
}
```

`at` is `beat`, `bar` (default), `phrase` or a marker of the old score, counted through its loop. Without a rule, a
score replaces another at once, faded, as in 3.5. A save keeps where the music is, and loading it resumes there,
cut, never through a transition (3.6.1). The first rule naming both scores applies: `validate` refuses a rule an
earlier one covers, and a marker from `'*'` that a score it can leave lacks.
This is an adaptive stem mixer with transitions, not iMUSE: no tempo changes, no branches inside a score.
