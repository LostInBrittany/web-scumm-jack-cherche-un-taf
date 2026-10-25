# Conditions

A condition is data: a string for a flag, an object for the rest, nested with `not`, `all` and `any`. Rules (`if`),
`if` commands, exits, topics, hints (`until`), `visible`, scripts (`while`, `waitUntil`), listeners, map news,
objectives and checkpoints' goals all take one. Each condition's exact shape is also in the generated
[DSL reference](create.dsl.md).

<a name="conditions"></a>

## The conditions

| Condition | True when… |
|---|---|
| `'tied'` / `'!tied'` | the flag is true (any value but `false`, `0`, `''`) / the flag is false or absent. |
| `{ has: 'rope' }` | the item is in the inventory (a greyed-out `used` item still counts). |
| `{ flag: 'tries', eq: 3 }` | the flag holds exactly that value (a number, a string or a boolean). |
| `{ flag: 'tries', gte: 2 }` | the flag is a number, 2 or more. An absent flag is false. |
| `{ flag: 'x', lt: 5 }` | the flag is below 5, **or is not a number** (an absent flag is true). |
| `{ not: … }`, `{ all: [ … ] }`, `{ any: [ … ] }` | not, and, or. |
| `{ visited: 'market' }` | the player has already entered the market. |
| `{ room: 'market' }` | the player is in the market now. |
| `{ prop: ['lamp', 'on'] }`, `{ prop: ['house.lamp', 'on'] }` | the prop is in that state (in the current room, or `'room.prop'`). A prop never changed is in its `initial` state, else its first. |
| `{ unlocked: 'market' }` | the place is unlocked on the map. |
| `{ seen: 'topic.ask.basket' }` | that conversation topic has already been heard (see below). |
| `{ actorIn: ['grandpa', 'house'] }` | the moving character is in that room ([moving characters](create.moving-characters.md)). |
| `{ player: 'laverne' }` | this character is the one the player controls now ([heroes](create.heroes.md)). |

The code is [`src/engine/core/cond.ts`](../../src/engine/core/cond.ts). The Studio's rule explainer shows which part
of a condition fails, and why ([rule explainer](studio.rule-explainer.md)).

```room-example
{
  "room": {
    "id": "market",
    "name": "The market",
    "decor": "decor/market",
    "actors": { "seller": { "char": "seller" } },
    "props": { "stall": { "name": "stall", "states": { "closed": "market/stall_closed", "open": "market/stall_open" } } },
    "look": { "seller": "The seller.", "stall": "A flower stall." },
    "on": [
      { "id": "market.haggle-done", "verb": "talk", "a": "seller", "if": { "flag": "tries", "gte": 3 },
        "do": [{ "say": ["seller", "Fine. Two coins. Take them and go."] }, { "set": "deal" }] },
      { "id": "market.haggle", "verb": "talk", "a": "seller",
        "if": { "all": [{ "prop": ["stall", "open"] }, { "not": "deal" }, { "any": [{ "has": "coin" }, { "visited": "market" }] }] },
        "do": [{ "inc": "tries" }, { "say": ["seller", "Too low!"] }] }
    ],
    "onEnter": [{ "if": { "flag": "tries", "eq": 2 }, "then": ["One more try. I can feel it."], "else": [] }],
    "hints": [{ "id": "market.hint", "until": "deal", "lines": ["Haggle. Again."] }]
  },
  "layout": {
    "walk": { "area": [[20, 300], [620, 300], [630, 395], [10, 395]] },
    "entries": { "default": [320, 360] },
    "props": { "stall": { "x": 200, "y": 340, "h": 120 } },
    "actors": { "seller": { "x": 420, "y": 350 } }
  },
  "items": { "coin": { "name": "coin", "icon": "items/coin" } },
  "characters": { "seller": { "name": "Seller", "color": "#ffb36b", "sprites": { "idle": ["seller/idle"] } } }
}
```

<a name="seen"></a>

## `seen`: what has been heard

`{ seen: key }` reads the save's record of what happened once: a heard topic, a fired `once` listener, a picked
`once` option. In a schema 3 game the keys are made from the stable ids
([`src/engine/core/keys.ts`](../../src/engine/core/keys.ts)):

| Thing | Key in schema 3 | Key without ids (schema 2) |
|---|---|---|
| A talk topic | `topic.<topic id>` | `<room>.<actor>.<index>` (for example `house.grandma.0`) |
| A `once` listener | `event.<listener id>` | `event.<room or game>.<index>` |
| A `once` option of a `choice` | `choice.<option id>` | `choice.<room>.<text>` |

> [!LIMIT id=seen-key-v3]
> In a schema 3 game, `{ seen: 'house.grandma.0' }` (the positional form older pages showed) is never true: a topic
> with an id is recorded as `topic.<id>`. The validator does not check `seen` keys, so a wrong one is silently false.

<a name="flags"></a>

## Flags in conditions

A flag holds a boolean, a number or a string ([which to use](create.flags-variables-events.md)). `'name'` tests its
truth, `{ flag, eq }` an exact value, `{ flag, gte }` and `{ flag, lt }` a number. Prefer a condition that stays true
once true (a flag set once, an item kept) for objectives and goals: the journal never takes a completed objective
back ([chapters and objectives](create.chapters.md)).

`npm run validate` reports a flag a condition reads that nothing sets, and a flag set that nothing reads; `npm run lint`
reports a condition that can never be true (`cond-never-true`).

<a name="related"></a>

## Related identifiers

- `Cond` in [`src/engine/core/types/content.ts`](../../src/engine/core/types/content.ts); `check` and `explainCond` in
  `cond.ts`.
- [Reactions](create.reactions.md), [commands](create.commands.md), [the DSL reference](create.dsl.md).
