# Your first game

The shortest path from nothing to a room you can play on your phone, with the files you touch named at each step.

<a name="overview"></a>

## What you will build

A game of one room from the template: a garden, a bucket, a gate. Take the bucket, use it on the gate, the end. You
add a lamp the hero can switch on: you tell it in the storyboard first, write its rule, place it with the mouse,
check the game with the validator and the solver, and play it on your phone. The steps are planned for about fifteen
minutes. Everything you will write afterwards is a variation of what is already there.

**The content is data.** Rooms, props with states, characters, items, rules, conversations, hints, scripts and events
are plain TypeScript objects, with no code in them, so every tool can read, check and play them:

```ts
export const garden: RoomDef = {
  id: 'garden', name: 'The garden', decor: 'garden',
  props: { tank: { name: 'water tank', states: { full: 'tank_full', empty: 'tank_empty' } } },
  exits: { back_door: { name: 'back door', to: 'house', entry: 'garden' } },
  on: [
    { verb: 'use', a: 'pipe', b: 'tank', if: '!tank_drained',
      do: [{ minigame: 'pipes' }, { lose: 'pipe' }, { set: 'tank_drained' }, { prop: ['tank', 'empty'] }] },
  ],
  hints: [{ until: 'tank_drained', lines: ['Use the pipe on the water tank.'] }],
};
```

A rule is a verb, a target, a condition and a list of commands. What a game needs beyond them, a custom command, is
TypeScript of its own: trusted code, named in the game and hashed with it ([custom code](create.custom-code.md)).
Famous mechanics of the genre are written this way in [classic mechanics](create.classics.md). The Studio is the real
engine with an editor on top: rooms with their placements, the storyboard panel by panel, the checks after every
save ([the local Studio](studio.overview.md)).

**Art, sound and languages.** A prompt for every sprite sheet, object and backdrop in one style, and sheets cut into
sprites ([images](create.images.md)); chip-tune music arranged from a MIDI and sound effects from one palette
([music](create.music.md), [sound effects](create.sound-effects.md)); every line translatable, a missing translation
found before release ([translations](create.translations.md)).

<a name="what-you-need"></a>

## What you need

- Node 22.13 or later: the local Studio (step 5) and the tools that write a game need it; 22.12 only plays and
  builds a game ([requirements](install.requirements.md#node)). Python 3 with Pillow for `npm run assets`
  (`python3 -m pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt` in a created
  project, `python3 -m pip install --require-hashes -r requirements.txt` in the engine repository).
- A phone on the same network, for the last step (optional).
- One of two places to work, the same steps in both ([which is which](create.project-layout.md)):
  - **a created project**, where the game is `game/`; this page's paths say `game/`;
  - **the engine repository**, where the game is `games/<id>/` (here `games/lamp/`).

<a name="steps"></a>

## Steps

<a name="from-the-template"></a>

### 1. A game from the release archive (two minutes)

<!-- step: create -->
The packages are not on the npm registry yet, so a game starts from the archive each GitHub release attaches
([install from the release archive](install.from-archive.md)). Take the latest version from
<https://github.com/Quest-n-Click/quest-n-click/releases/latest> and, in an empty folder of your choice:

```sh
# in the folder that will contain the project: makes the folder my-game
V=4.5.0             # the version of the release you take
T=https://github.com/Quest-n-Click/quest-n-click/releases/download/v$V/quest-n-click-$V.tgz
npx --package=$T quest-n-click create my-game "My Game" --engine=$T
cd my-game
npm install
python3 -m pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt
npm run assets      # the placeholder art into public/assets
npm run dev         # http://127.0.0.1:5173/: a garden, a bucket, a gate
```

The packages are on npm from 4.5.2: `npm init @quest-n-click my-game "My Game"` creates the same project from the
registry, without an archive URL ([install from npm](install.from-npm.md)).

Or, in the engine repository, the same template becomes `games/lamp`, set as the current game (`.cache/game`):

```sh
# in the engine repository
npm install
npm run new-game lamp "The Lamp"
npm run assets
npm run dev
```

You see a garden. The template is a complete game of one room. Its art is a placeholder drawn from shapes
(`tools/placeholder-art.py`): `provenance.json` says so, and a release refuses it until each file is replaced and
reviewed.

<a name="read-the-room"></a>

### 2. Read the room you are about to change (two minutes)

<!-- step: read-room -->
`game/rooms/start.ts` (`games/lamp/rooms/start.ts`) is the whole room. Read it top to bottom: `props` (things with an
image), `hotspots` (places on the backdrop), `look` (one line, or three that cycle, for each of them), `on` (the rules:
a verb, a target, a condition, what happens), `hints` (what the hint item says, until a flag is set), `onEnter`.
Geometry is not here: `layout/start.json` holds where things stand, and only the Studio or the placement editor
writes it ([geometry](create.geometry.md)).

<a name="story-then-check"></a>

### 3. Tell it in the storyboard first (two minutes)

<!-- step: story -->
`storyboard.json` is the source of truth for the text: the story is written there before the room
([the storyboard](create.storyboard.md)). Add a panel to the garden board, after the bucket's:

```json
{ "id": "start-lamp", "title": "The lamp", "action": "Use lamp", "lines": [{ "who": "hero", "text": "There. Light." }] }
```

The Studio's Storyboard tab will show this panel as not implemented yet: the next step implements it, with the same
line.

<a name="add-a-prop"></a>

### 4. Add the prop and its rule (five minutes)

<!-- step: add-prop -->
Add the lamp to the garden. In `rooms/start.ts`:

```ts
props: {
  bucket: { name: 'bucket', img: 'starter/items/bucket' },
  lamp: { name: 'lamp', states: { off: 'starter/items/bucket', on: 'starter/items/note' }, initial: 'off' },
},
look: {
  // …
  lamp: ['A garden lamp. Off.', 'Still off.', 'It is thinking about it.'],
},
on: [
  // …
  { id: 'start.light-lamp', verb: 'use', a: 'lamp', if: '!lamp_on',
    do: [{ set: 'lamp_on' }, { prop: ['lamp', 'on'] }, 'There. Light.'] },
],
```

The placeholder art has no lamp, so the lamp borrows the template's two item images: switched off it shows the
bucket's, switched on the note's. The change is a stand-in, but you see it. For a real lamp, `npm run prompts` writes
the prompt and the Studio's Assets tab cuts what you generate ([images](create.images.md)). A rule is a verb, a
target, a condition and a list of commands; a string in `do` is a line the hero says, the storyboard's line.
`{ prop: ['lamp', 'on'] }` switches the prop's state, `{ set: 'lamp_on' }` remembers it in the save
([reactions](create.reactions.md), [commands](create.commands.md)).

<a name="place-it"></a>

### 5. Place it (two minutes)

<!-- step: place -->
```sh
# in the created project, or in the engine repository
npm run studio      # the Studio opens; Rooms tab, "start"
```

The lamp has no place yet, so the Studio shows it at the default spot. Drag it where you want, drag its height, save:
`layout/start.json` gains a `lamp` entry. Never type coordinates by hand; the editor and the Studio exist for that.
Until it is placed, `validate` says `no position in the layout`.

<a name="check-it"></a>

### 6. Check it (three minutes)

<!-- step: check -->
The Storyboard tab now shows the lamp's panel as implemented; the Check tab runs the validator and the solver after
every save. From the terminal:

```sh
# in the engine repository
npm run validate   # a prop without a look line, a flag nothing reads, a rule nobody can reach: said here
npm run solve      # one winning path from New Game to the end, printed step by step (not a proof that no one gets stuck)
npm test           # the engine's tests and your game's walkthrough (games/lamp/tests/game.test.ts)
```

```sh
# in the created project
npx quest-n-click validate
npx quest-n-click solve
npm run verify     # validate, solve, i18n status, lint, playtests
```

`solve` stops at the first way to the end it finds: another path may still lead the player into a dead end.
`npm run solve -- --prove` (`npx quest-n-click solve --prove`) searches every state it can reach for one, within its
budgets ([what the solver proves](create.solver-proofs.md)). A rule the solver never needs is not a bug (the lamp is
decoration), but `npm run lint` (`npx quest-n-click lint`) tells you it is decoration
([checking your game](create.checking.md)).

<a name="play-on-your-phone"></a>

### 7. Play it on your phone (two minutes)

<!-- step: play-phone -->
```sh
# in the engine repository
npm run dev:lan     # the dev server on your network; open the printed URL on the phone, landscape
```

A created project has no `dev:lan`: [testing on a phone over the LAN](create.lan-testing.md) says how to do it there.
Tap the lamp with Use. Before: the lamp shows the bucket's image. After: the hero says "There. Light.", the lamp
shows the note's image, and a second Use no longer runs the rule (its `if: '!lamp_on'`). Reload the page: the lamp is
still on, because the save remembers `lamp_on` and the prop's state.

> [!LIMIT id=tutorial-scope]
> This tutorial leaves out the art (the lamp borrows the template's placeholder images), the map, characters and
> conversations, and publishing. Each has its page below.

<a name="what-you-learned"></a>

## What you learned

That is the loop: tell it in the storyboard, write the rule, place it, check, play
([the working loop](create.working-loop.md)).

- The storyboard comes first: the room's lines are the storyboard's ([the storyboard](create.storyboard.md)).
- A room is data: props, hotspots, look lines, rules ([rooms](create.rooms.md)).
- Geometry lives in `layout/`, placed with the mouse ([geometry](create.geometry.md)).
- The validator and the solver check the game after each change; `solve` finds a winning path, `solve --prove` looks
  for dead ends ([checking your game](create.checking.md)).

<a name="next"></a>

## Where to go next

- [Rooms](create.rooms.md), field by field; [reactions](create.reactions.md); [commands](create.commands.md);
  [conditions](create.conditions.md).
- [Classic mechanics](create.classics.md): famous puzzles written with these fields.
- [The local Studio](studio.overview.md), and [puzzle design](create.puzzle-design.md) for a whole game from the
  first idea to the release.
