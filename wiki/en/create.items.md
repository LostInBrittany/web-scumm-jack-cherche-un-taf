# Items and inventory

An inventory item is declared once, in `game.ts` (`items`, usually from `items.ts`), and enters the bag with
`{ gain }`. This page gives an item's fields, how the bag works, how items combine, and what a "used" item is.

<a name="items"></a>

## An item

```ts
items: {
  rope: { name: 'rope', icon: 'items/r1c2', look: 'A length of rope. One end for the hook, one for the bucket.' },
},
```

| Field | What |
|---|---|
| `name` | The display name (the sentence line, `{item}` in fallback lines). |
| `icon` | The image in the bag (a manifest id). |
| `look` | Looking at it in the bag: a line, or a list that gives a different line each time, cycling. |
| `kind` | Kinds, for the reactions by kind (`item` in a `rules.kinds` entry restricts one to that item). |

An item can also be shown in a room as a prop (an image with a `name`, hidden once taken with
`visible: { not: { has: 'talkie' } }`): the prop and the item are two things, joined by the rule that takes it
(`{ hide: 'bucket' }, { gain: 'bucket' }`).

<a name="inventory"></a>

## The bag

- The game starts with `start.inventory` (`game.ts`); a checkpoint names its own (`checkpoints.<id>.inventory`).
- `{ gain: 'rope' }` adds an item (once: gaining an item already held changes nothing), `{ lose: 'rope' }` removes it.
- `{ has: 'rope' }` tests it ([conditions](create.conditions.md)).
- Tapping an item with no verb picked selects it for Use; the sentence line says "Use rope with …" and the next tap
  names the target. With a double tap on a target, an item picked from the bag is given to a character and used on
  anything else ([reactions](create.reactions.md#double-tap)).
- Several playable characters each have their own bag unless `players.sharedInventory`; `{ transfer }` hands an item
  over ([heroes](create.heroes.md)).

<a name="combining"></a>

## Combining and giving

"Use A with B" and "Give A to B" are rules with `a` the item and `b` the target. Two inventory items combine both
ways: a rule `a: 'left_half', b: 'right_half'` also answers "Use right half with left half" (only when both are held).
Rules valid everywhere, combining two items for instance, go in the game's `rules.on`. With no rule, "Use A with B"
answers with the `use2` fallback lines, and "Give" to a character with their `refuse` line
([reactions](create.reactions.md#fallbacks)).

<a name="used"></a>

## A used item

`{ used: 'rope' }` (or a list) says the item has served its purpose: it stays in the bag, **greyed out**, and can no
longer be picked for Use or Give (Look still works). It becomes active again wherever a room or game rule targets it in
`a` or `b` and that rule's `if` condition is true. So keep the rule that consumed it behind an `if` (here `'!tied'`),
otherwise it stays active in that room. `gain` on a used item reactivates it. The used list is saved; older saves load
without it.

```room-example
{
  "room": {
    "id": "well",
    "name": "The well",
    "decor": "decor/well",
    "hotspots": { "hook": { "name": "hook" } },
    "look": { "hook": "A rusty hook over the well." },
    "on": [
      { "id": "well.tie-rope", "verb": "use", "a": "rope", "b": "hook", "if": "!tied",
        "do": [{ "set": "tied" }, { "used": "rope" }, "Tied. The rope hangs down the well."] }
    ],
    "hints": [{ "id": "well.hint", "until": "tied", "lines": ["The rope. The hook."] }]
  },
  "layout": {
    "walk": { "area": [[20, 300], [620, 300], [630, 395], [10, 395]] },
    "entries": { "default": [320, 360] },
    "hotspots": { "hook": { "rect": [300, 120, 40, 40], "approach": [320, 330] } }
  },
  "items": {
    "rope": { "name": "rope", "icon": "items/rope", "look": ["A length of rope.", "Still a rope."], "kind": ["tool"] }
  }
}
```

> [!LIMIT id=used-is-not-lost]
> A used item still counts for `{ has }`. To make it leave the bag, `lose` it; to test that it was used, set a flag in
> the rule that used it.

<a name="hint-item"></a>

## The hint item

`hintItem` in `game.ts` names an item that gives hints when talked to (the demo's walkie-talkie, the template's
note); `hintVoice` names the character who says them, often an `offscreen` one. Talking to it gives the current room's
first hint whose `until` is still false ([rooms: hints](create.rooms.md#hints)). The validator refuses a `hintItem`
that is not an item.

<a name="related"></a>

## Related identifiers

- `ItemDef` in [`src/engine/core/types/content.ts`](../../src/engine/core/types/content.ts); `gain`, `lose`, `used`,
  `transfer` ([commands](create.commands.md#world)); `{ has }` ([conditions](create.conditions.md)).
- `npm run lint` reports an item never gained (`item-never-gained`) and a red herring nothing uses
  (`item-red-herring`) ([checking your game](create.checking.md)).
