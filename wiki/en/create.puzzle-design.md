# Puzzle design

A practical, opinionated guide for an author, often working alone with an AI assistant: what to write so that the game
is fun, fair and finished. The format is in the [Create a game](create.rooms.md) pages, the method in
[Working with an AI](create.working-with-ai.md); this page is about taste.

<a name="overview"></a>

## The running example

The sample game, *The Pantry Key* (`games/demo/` in the engine repository): Pixel the cat, three rooms (`house`,
`garden`, `market`), about 15 minutes. Every id quoted here exists in that folder. The game's texts are in English and
quoted as they are. The code excerpts are simplified: the sample game's files also carry each line's stable id
(`{ id, text }`), which the identity contract adds ([State and saves](create.state-saves.md)).

<a name="what-works"></a>

## What makes these games work

The classic LucasArts adventures (Monkey Island, Day of the Tentacle) settled a few rules. They still hold.

| Rule | What it means here |
|---|---|
| **No death** | The hero never dies and never loses. A built-in minigame cannot be failed: winning or skipping it plays `then`. |
| **No dead ends** | The player can never reach a state where the game cannot be finished. `npm run solve -- --prove` proves it (`npm run solve` finds one winning path). |
| **Every action is answered** | Any verb on any thing gets a line. A wrong try is a joke, not a silence. |
| **Humour lives in the failures** | Most of what a player reads is a reaction to a wrong idea. That is where the voice is. |
| **Thinking, not pixel hunting** | Every useful thing is named, visible and has a Look line. The puzzle is in the head, not in the hitbox. |
| **A small cast with strong voices** | Four or five characters you can tell apart from one line. |
| **One goal per room** | The player always knows what they want here. The storyboard says it in `goal`. |
| **10 to 20 minutes per room** | Long enough to explore, short enough to finish on a bus. |

The sample game follows all of them. Pixel cannot fail. Pulling Biscuit gives "Never pull a cat. Cat law, article
one." The key is never hidden in a corner: it is in a tank that a character tells you about.

In a created project the solver runs as `npx quest-n-click solve` (and `npx quest-n-click solve --prove`). What each
result lets you conclude is in [What the solver proves](create.solver-proofs.md).

<a name="story-first"></a>

## Story first

Write the story before any room file. Four answers, one line each:

| Question | The sample game |
|---|---|
| Premise in one sentence | Grandma locked the sardines in the pantry and lost the key. |
| The hero's want | Pixel wants the sardines. |
| The obstacle per room | House: nobody knows where the key is. Garden: it fell in a tank with a stuck tap. Market: it is a deposit for a lantern. |
| The ending | The pantry opens, two cats share one tin, the sealed card judges the player's guess. |

If you cannot fill this table, do not open the editor yet. Then write the story as the storyboard, one board per room
and one panel per beat, and review it on a phone until the author says it is final: see
[The storyboard, source of truth](create.storyboard.md#write-it). Only then write rooms.

<a name="repeated-looks"></a>

### The rhythm of repeated looks

A `look` list cycles, one line per look. Use the rhythm **normal, normal, normal, absurd**: three useful or plain lines,
then a joke that rewards the player who keeps clicking. The sample game's pantry:

```ts
pantry: ['The pantry cupboard. The sardines live in there.',
  'Locked. I can hear the sardines. (Sardines are silent. I hear them anyway.)',
  'Still locked. Still sardines.', 'I could stare at it all day. I might.'],
```

Two lines are fine for decor (`gnome`: "He has seen things." then "He never blinks. Respect."). Never put the solution
only in the fourth line.

<a name="puzzles"></a>

## Puzzle design with this engine

<a name="five-shapes"></a>

### The five shapes the DSL handles well

| Shape | How it is written | In the sample game |
|---|---|---|
| **Fetch and give** | `give` rule with `a` = item, `b` = actor | `bouquet` → `seller` gives the `key` |
| **Combine two items** (or item on a thing) | `use` rule with `a` and `b`; in `rules.on` if it works everywhere | `pipe` on `tank` |
| **State machine prop** | `states` + `{ prop: [...] }` command + `if: { prop: [...] }` | `armchair`: `remote` → `searched`; `tank`: `full` → `draining`; `pantry`: `locked` → `open` |
| **Dialogue unlock** | a talk topic that sets a flag or `unlock`s a place | Grandma's "Where is the key?" unlocks `garden`; Lou's topic sets `deposit_known` |
| **Minigame as a gate** | `{ minigame, params, then }` inside a rule | `pipes` drains the tank, `pick` wins the bouquet |

Anything else (timers, real-time action, random outcomes) fights the solver. Avoid it. When a famous mechanic seems to
need something else, [Classic mechanics](create.classics.md) shows how the DSL writes it.

<a name="chains"></a>

### Chains and the "aha"

- **3 to 6 steps per room.** The garden: take `spare_pipe` → use `pipe` on `tank` → pipes → look at `sock` → talk to
  `shell_phone`. Five steps.
- **One "aha" per room.** The garden's is the sock: you drain a tank for a key and find a note instead. The market's is
  the anniversary: the seller wanted flowers because he forgot his wedding anniversary.
- **Cross rooms once or twice.** The `token` comes from the house armchair and pays at the market. That is enough.
- **Say the goal out loud.** Grandpa says "Drain it. But the tap is stuck." The player knows *what*, not *how*.

<a name="hints"></a>

### Hints in puzzle order

Each room has `hints`. The engine gives the first entry whose `until` condition is still false. Write them in the
order of the puzzle, one entry per step, vague then precise inside an entry. The garden:

```ts
hints: [
  { until: { any: ['pipe_taken', 'tank_drained'] }, lines: ['There is a spare pipe on the ground. Take it, sweetie.'] },
  { until: 'tank_drained', lines: ['Use the pipe on the water tank.', 'Pipe. Tank. Together. Go!'] },
  { until: 'lou_has_key', lines: ['Something came out of the tank. Look at it.'] },
  { until: { unlocked: 'market' }, lines: ['Talk into my shell phone and call Lou.'] },
  { until: { has: 'key' }, lines: ['Lou is at the market. Open the map.'] },
  { until: 'pantry_open', lines: ['Come home with that key, sweetie!'] },
],
```

Two habits: use `any` when a step can be skipped (the pipe is gone once the tank is drained), and always cover the
rest of the game, so the hint voice is never silent in a room the player comes back to.

<a name="puzzle-graph"></a>

### Reading the puzzle graph

Before touching a puzzle, ask the graph what hangs on it: `npm run page:puzzles` (engine repository), the Puzzles panel
of the Studio's Check tab (either context), or the MCP tool `puzzle_graph` with an id. The card of the pantry key in the
sample game reads: acquired by *give bouquet + seller*; used by *use key + pantry* and the finale's goal; requires first
*bouquet*, *flowers_done*, *bouquet_given*; unlocks the pantry and the end. Remove the bouquet trade and the card tells
you what breaks before the solver does. The overview lists three smells: a thing **read but never produced** (a flag
nobody sets), a thing **produced but never used** (a flag or item that leads nowhere), and a flag **set only by actions
that already need it** (it can never become true; the validator warns too). The page itself:
[Review pages](create.review-pages.md#puzzles-page).

The solver's warnings (dead ends, items never used, items never obtained) and how to read them are in
[What the solver proves](create.solver-proofs.md).

<a name="rooms"></a>

## Rooms

| Element | Rule of thumb |
|---|---|
| Hotspots + named props + actors | **8 to 15** per room. Fewer feels empty, more feels like pixel hunting. The sample game's house has 11 named things. |
| Props with states | Only for things the story changes (`armchair`, `tank`, `pantry`). |
| Decor props | No `name` = not clickable (`table`, `chair`, `stall_left`). Use them to dress the scene. |
| Exits | One obvious way out, at the edge of the screen, named after where it goes (`back_door`: "Back to Grandma's house."). |

- **Logical space: 640 × 400**, origin top-left, characters placed by their feet.
- **The floor band.** The walk area sits in the lower part of the background; `floor` (default 395) is its bottom. Keep
  it free of drawn furniture, so props and actors stand on it.
- **Character heights** are in pixels of that space: in the sample game, Pixel is 36, Grandma 120, Grandpa (seated)
  100. A human around 110 to 125 next to a 640-wide room reads right on a phone.
- **Approach points**: set them in the editor (`?edit=<room>`), so the hero walks next to a thing, not onto it.
  `validate` warns when a `walk` target has no geometry.
- **Exits are clickable things**, not invisible edges. A locked exit still answers: the house `window` says "Not yet.
  First, the key. Grandma knows things." until the garden is unlocked.
- **One checkpoint per room** in `game.checkpoints`, with the inventory, flags and props the player would have. The
  sample game has `house`, `garden`, `market`, `finale`. Open `?dev&at=market` to test that room alone.

The reference for all of this is in [Rooms](create.rooms.md), [Geometry](create.geometry.md) and
[Exits](create.exits.md).

<a name="dialogue"></a>

## Dialogue

- **2 to 4 talk topics per character, one that advances the plot.** Grandma: "Where is the key?" (plot), "What is for
  dinner?" (gag with `nth`), "Why lock the sardines?" (character). The plot topic goes first.
- **Topics can appear and change** with `if`: Grandpa's "There was no key in the tank!" shows only once `tank_drained`.
- **`choice` sparingly.** Use it when the player's answer is fun to pick, not to branch the story. The sample game has
  two: the opening guess (it sets `guess`, judged at the end) and Lou's "argue or accept", where both answers lead
  forward.
- **Hug and bye are global** (`globalTalk`): "Can I have a cuddle?" and "Bye!" are added to every menu. Give each
  character a `hug` line and a `refuse` line in `cast.ts`: cheap, and players love them.
- **Speech colours** come from `color` on each character. Make them distinct: Grandma `#ff9ec4`, Grandpa `#8fd3ff`,
  Lou `#b8ff8f`, the seller `#ffb36b`. The hint voice `grandma_voice` reuses Grandma's colour on purpose.
- **The transcript** keeps every line. Players will scroll back: do not hide the only clue in a line said during a
  cutscene with no other trace.
- **Line length for a phone: under 90 characters**, two lines on screen. `validate` warns above 140, but 90 is the
  comfortable limit. Split long speeches into several `say`s.

The format is in [Dialogues](create.dialogues.md).

<a name="fallbacks"></a>

## The fallback layer

Most clicks hit no written rule. What answers them is the game's voice.

- **`rules.fallbacks`: 3 to 6 variants per verb**, drawn at random, never twice in a row. One array per verb, plus
  `use2` for "Use A with B". The sample game has two or three; aim higher in a real game.
- **Write them in character.** Pixel's `push`: "It does not move. I need more breakfast." Pixel's `use2`: "These do not
  go together. Like cats and baths." `{objet}`, `{cible}` and `{nom}` insert names.
- **`kinds`** answer a whole family at once: every `cat` refuses to be pulled, every `person` refuses to be carried. A
  precise `target` wins over a `kind`.
- **`refuse` per character** answers any Give that has no rule: Lou says "Thanks, but my pockets are full. Of other
  people's things."
- **"That doesn't work" is never acceptable.** It tells the player nothing and kills the mood. A fallback should be a
  joke, a hint at the hero's want, or both.

The format is in [Reactions](create.reactions.md).

<a name="minigames"></a>

## Minigames

Use one as **a gate the player understands**: the fiction says why you play it. The tank needs another way out, so you
lay pipes. The seller wants flowers, so you pick them.

- **Always a Skip**, except the finale's `scratch` ticket. Skipping still runs `then`, so the story goes on.
- **30 seconds, not 3 minutes.** Three rounds of `pick`, one 4 × 3 grid of `pipes`. `helpAfter` makes the right pipe
  glow when the player is lost.
- **`intro` and `win` lines** frame it in the hint voice.

| Minigame | Fits a fiction about |
|---|---|
| `pipes` | water, plumbing, irrigation, anything that flows |
| `cables` | electricity, a switchboard, a tangle behind the TV |
| `pick` | shopping, choosing the right one, a recipe, a line-up |
| `hide` | hide and seek, finding someone or something in a scene |
| `runner` | a chase, an escape, a race to catch a bus |
| `stroke` | calming an animal, putting a baby to sleep |
| `scratch` | the sealed ending only |
| `code-wheel` | a paper code wheel, the 1990s "copy protection" played as a joke (4.1.15) |

> [!LIMIT id=code-wheel-can-fail]
> The "no failure" rule holds for the built-in minigames above, with one exception: a `code-wheel` in `story` mode,
> lost after its tries, ends `failed`. The parameters of every minigame are in [Built-in minigames](create.minigames.md).

<a name="map"></a>

## The map

- **Add one from three places.** With two, a door is enough.
- **Vehicles** (`vehicle: 'car'`, `'plane'`) give each trip a small animation and a sense of distance.
- **The "news" marker** shows where something new is waiting. The sample game: the garden has news while
  `!tank_drained`, the market while the hero does not hold the key, the house when the hero holds the key and the
  pantry is still closed.
- **No locked places shown.** A place appears when a rule `unlock`s it, with a `toast` ("New on the map: the garden").
  Players should never see a pin they cannot use.

The format is in [World map](create.world-map.md).

<a name="sound"></a>

## Sound

- **Music per room**, set with `music` on the room. Short and quiet: the player hears it for 15 minutes. The sample game
  plays one theme in every room (`music: 'theme'`), split into stems so the mix changes with the room: see
  [Music in stems](create.music.md).
- **An sfx on every state change.** Armchair searched: `cloth`. Tank drained: `drop`. Pantry: `latch` then
  `door_open`. Item gained: `select`, `pluck`, `metal`. A change with no sound feels like a bug.
- **The hint voice** is an `offscreen` character (`grandma_voice`) answering through the hint item (`shell_phone`).
  Make it someone the player likes, with a tic ("sweetie"), so hints feel like help, not a manual.

<a name="alternatives"></a>

## What this design sets aside

- **Death and failure states.** They punish exploration, and every one must be proved recoverable.
- **Timers, real-time action and random outcomes.** The solver explores choices, not reflexes or dice: a puzzle built on
  them cannot be proved finishable, and a phone player on a bus cannot play it. When a story needs urgency, a world
  script that changes an item as time passes (the grog mug of [Classic mechanics](create.classics.md)) keeps it
  provable.
- **Pixel hunting.** A thing that matters is named, visible and answers Look.

<a name="trade-offs"></a>

## Trade-offs

These rules make games that are fair and provable, and short sessions that fit a phone. They cost tension: no
deadline, no loss, no luck. A game that wants those leans on a `custom` minigame, whose inside the solver does not see
(only its declared effects), and gives up part of the proof for it.

<a name="decisions"></a>

## Decisions and references

- The sample game: [`games/demo/`](../../games/demo/game.ts) (`game.ts`, `rooms/`, `cast.ts`, `rules.ts`,
  `storyboard.json`).
- Checking a game like a player, and the checklist before sharing the link: [Playtests](create.playtests.md),
  [Checking your game](create.checking.md).
- [What the solver proves](create.solver-proofs.md) · [Classic mechanics](create.classics.md) ·
  [The storyboard](create.storyboard.md) · [Images](create.images.md#art-consistency).
