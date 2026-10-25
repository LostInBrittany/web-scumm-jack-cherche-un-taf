# Dialogues

How to write a conversation with a character: talk topics that appear and change, choices, the menu's "Bye", and
what makes lines read well on a phone. The first part builds one conversation step by step; the second lists the
fields.

<a name="overview"></a>

## What you will build

Grandma, in the kitchen, with four topics: one that advances the plot, a running gag that changes each time, one that
appears only once the tank is drained, and a guess the player picks from two answers. Talking to her opens the topic
menu; "Bye" closes it.

<a name="what-you-need"></a>

## What you need

- A game with a room ([your first game](create.first-game.md)), and the character declared in `game.ts` with a
  `color` ([characters](create.characters.md)).
- The actor placed in the room's layout ([geometry](create.geometry.md)).

<a name="steps"></a>

## Steps

<!-- step: topics -->
1. **Topics.** In the room, `talk` lists the topics per actor: each has a stable `id`, the line the hero says
   (`topic`) and what follows (`do`). Talking to the actor opens the menu; picking a topic makes the hero say it, then
   runs `do`, and the menu comes back until the player picks "Bye".

<!-- step: gag -->
2. **A gag that changes.** Wrap the answer in `nth` (or `cycle`, `random`): a different answer each time, the last
   one repeating ([commands: logic](create.commands.md#logic)).

<!-- step: conditional -->
3. **A topic that appears.** Give it an `if`: it shows only while the condition holds. Grandpa's "There was no key in
   the tank!" shows only once `tank_drained` is set.

<!-- step: choice -->
4. **A choice.** In `do`, `{ choice: [...] }` offers the player lines to pick; the hero says the picked one, then its
   `do` runs. `once: true` on an option shows it once.

<!-- step: check -->
5. **Check it.** `npm run validate` (in a created project, `npx quest-n-click validate`), then talk to her on the dev
   server.

The whole room, checked by the validator:

```room-example
{
  "room": {
    "id": "kitchen",
    "name": "The kitchen",
    "decor": "decor/kitchen",
    "actors": { "grandma": { "char": "grandma", "facing": "left" } },
    "look": { "grandma": "Grandma, stirring a pot." },
    "talk": {
      "grandma": [
        { "id": "ask.key", "topic": "Where is the key?",
          "do": [{ "say": ["grandma", "Somewhere safe. Somewhere wet."] }, { "set": "key_hint" }] },
        { "id": "ask.dinner", "topic": "What's for dinner?",
          "do": [{ "nth": [
            [{ "say": ["grandma", "Soup."] }],
            [{ "say": ["grandma", "Still soup."] }],
            [{ "say": ["grandma", "Soup. It is always soup."] }]
          ], "id": "dinner.count" }] },
        { "id": "ask.tank", "topic": "There was no key in the tank!", "if": "tank_drained",
          "do": [{ "say": ["grandma", "Then try the pantry, dear."] }] },
        { "id": "ask.guess", "topic": "Guess who stole the key?",
          "do": [{ "choice": [
            { "id": "guess.cat", "text": "The cat.", "do": [{ "set": ["guess", "cat"] }, { "say": ["grandma", "Biscuit? Never."] }] },
            { "id": "guess.grandpa", "text": "Grandpa.", "once": true, "do": [{ "set": ["guess", "grandpa"] }, { "say": ["grandma", "Hm. Maybe."] }] }
          ] }] }
      ]
    },
    "hints": [{ "id": "kitchen.hint", "until": "key_hint", "lines": ["Ask Grandma about the key."] }]
  },
  "layout": {
    "walk": { "area": [[20, 300], [620, 300], [630, 395], [10, 395]] },
    "entries": { "default": [320, 360] },
    "actors": { "grandma": { "x": 420, "y": 350 } }
  },
  "characters": {
    "grandma": { "name": "Grandma", "color": "#ff9ec4", "kind": ["person"], "sprites": { "idle": ["grandma/idle"] },
      "hug": "Always.", "refuse": "Keep it, dear." }
  }
}
```

<a name="topics"></a>

## Talk topics

| Field | What |
|---|---|
| `id` | Stable id, required in schema 3: the save remembers a heard topic under `topic.<id>`. |
| `topic` | The line the hero says when it is picked (and the menu's label). |
| `if` | The topic shows only while this holds. |
| `do` | What follows. |

A topic already heard stays in the menu, marked as seen. A conversation is one action: it is saved once whole at
"Bye" (since 4.3.0 each finished topic is saved as soon as it ends, when the conversation is the rest of the action).
`{ seen: 'topic.ask.key' }` tests that a topic was heard ([conditions](create.conditions.md#seen)).

<a name="global-talk"></a>

## "Bye" and the hug

`globalTalk` in `game.ts` sets what every menu adds: `bye` (the last entry, "…" when absent), `byeLine` (what the hero
says on leaving, nothing when absent), `hug` (an extra entry, only when set). Picking the hug makes the hero say it and
the character answer with their `hug` line (♥ when absent). Give each character a `hug` line and a `refuse` line:
cheap, and players love them.

<a name="choice"></a>

## Choices

`{ choice: [{ id, text, do, if?, once?, img? }, …] }` works anywhere a command does, in a topic or in a cutscene. Only
the options whose `if` holds are offered; a `once` option disappears once picked (remembered as `choice.<id>`); with
no option left, nothing is shown. `img` (a manifest id, a portrait for instance) shows the option as a card with the
image and its `text` as the label (the screen reader's name too); cards come first. The solver tries every option.

<a name="talk-command"></a>

## Starting a conversation from a script

`{ talk: 'grandma' }` opens an actor's menu from a rule or a cutscene. A character speaks to the hero without a menu
with `{ say: [...] }`; a call is `{ phone: 'grandma', do: [...] }` ([commands](create.commands.md#sequences)). A
character with no topics answers Talk with the talk fallback ([reactions](create.reactions.md#fallbacks)).

<a name="writing"></a>

## Writing good dialogue

- **2 to 4 topics per character, one that advances the plot.** Grandma: "Where is the key?" (plot), "What is for
  dinner?" (a gag with `nth`), "Why lock the sardines?" (character). The plot topic goes first.
- **Topics can appear and change** with `if`.
- **`choice` sparingly.** Use it when the player's answer is fun to pick, not to branch the story. The demo has two:
  the opening guess (it sets `guess`, judged at the end) and Lou's "argue or accept", where both answers lead forward.
- **Speech colours** come from `color` on each character. Make them distinct: Grandma `#ff9ec4`, Grandpa `#8fd3ff`,
  Lou `#b8ff8f`, the seller `#ffb36b`. The demo's hint voice reuses Grandma's colour on purpose.
- **The transcript keeps every line.** Players scroll back: do not hide the only clue in a line said during a
  cutscene with no other trace.
- **Line length for a phone: under 90 characters**, two lines on screen. `validate` warns above 140, but 90 is the
  comfortable limit. Split long speeches into several `say`s.

More on dialogue in the design of a whole game: [puzzle design](create.puzzle-design.md#dialogue).

<a name="what-you-learned"></a>

## What you learned

- A conversation is a list of topics per actor, each a line and its commands.
- `if` makes topics appear; `nth`, `cycle` and `random` make answers change; `choice` lets the player pick.
- Heard topics and picked options are remembered by their ids.

<a name="next"></a>

## Where to go next

- See the tree of a conversation: the Studio, or the MCP tool `dialogue_tree` ([MCP tools](studio.mcp-tools.md)).
- Translate the lines ([translations](create.translations.md)) and voice them ([voices](create.voices.md)).
- [Scripts and events](create.scripts-events.md), for what happens without a tap.
