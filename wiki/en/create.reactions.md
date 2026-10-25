# Reactions

What answers the player's action: a written rule, a look line, a conversation, a reaction by kind, a refusal, or a
fallback line. This page gives the fields of a rule, the exact order in which the engine looks for an answer, and the
verb a double tap uses.

<a name="reactions"></a>

## Written reactions

A reaction says: "when VERB happens on A (with or to B), if CONDITION, then these commands".

| Field | Meaning |
|---|---|
| `id` | Its stable id, required in schema 3 ([identity contract](create.principles.md#identity-contract)). |
| `verb` | A verb id of the game: in the template `give`, `open`, `close`, `take`, `look`, `talk`, `use`, `push`, `pull`. A list accepts several verbs. |
| `a` | The targeted thing. For Use/Give with two terms, it is the inventory item. A list = any of them. |
| `b` | The target of "Use A with B" or "Give A to B". Absent = a single-term action only. |
| `if` | Optional [condition](create.conditions.md). The first rule whose condition is true wins: put special cases first. |
| `do` | The [commands](create.commands.md) to run. |

```ts
on: [
  { id: 'pull.stool', verb: 'pull', a: 'stool', if: { prop: ['stool', 'shelf'] }, do: [{ prop: ['stool', 'pulled'] }, 'There. A step up.'] },
  { id: 'tie.rope', verb: 'use', a: 'rope', b: ['hook', 'bucket'], do: [{ lose: 'rope' }, { set: 'tied' }, 'Tied.'] },
]
```

Two inventory items combine both ways: a rule `a: 'piece1', b: 'piece2'` also works for "Use piece 2 with piece 1"
(only when both are in the bag). Rules valid everywhere (combining two items, for instance) go in the game's
`rules.on`, not in a room. Room rules are tried before the game's.

Verb ids are free: the game's `verbs` declare them. Four have a meaning for the engine: `look` (look lines), `talk`
(conversations, the hint item), `give` and `use` (two terms: an inventory item, then a target; tapping an item with no
verb picked selects it for Use). Any other verb is handled only through written rules and fallback lines.

<a name="fallbacks"></a>

## When nothing is written

The engine looks for an answer in this order, and stops at the first one found
([`src/engine/core/interactions.ts`](../../src/engine/core/interactions.ts)):

1. a room rule (`on`), then a game rule (`rules.on`), whose verb, `a`, `b` and condition match;
2. Look on one thing: the room's `look` line for it, else, for an inventory item, the item's `look`;
3. Talk on one thing: to the hint item (when it is in the bag), the hints; to an actor with topics, the conversation
   menu;
4. a reaction by kind (`rules.kinds`): first one aimed at that exact id (`target`), then one by kind (`kind`);
5. Give to a character: their refusal line (`refuse` on their sheet);
6. the verb's fallback line (`rules.fallbacks`, `use2` for "Use A with B"), drawn at random, never the same twice in a
   row. A verb with no fallback list uses the `look` list, else says "…".

```ts
// rules.ts
export const rules = {
  fallbacks: {
    look: ['Hmm. {item}. Nothing suspicious. For now.'],
    take: ['Not mine to take.', 'Too heavy. Even for me.'],
    use2: ['{item} with {target}? Does not work. But it was worth a try.'],
    // … one array per verb: give, open, close, take, look, talk, use, push, pull, use2
  },
  kinds: [
    { verb: 'pull', kind: 'cat', say: 'No! Never pull a cat’s tail.' },
    { verb: 'take', target: 'grandma', say: 'Grandma already has enough to carry.' },   // precise target: wins first
    { verb: 'take', kind: 'person', say: 'I cannot carry {name}. But {name} could carry me.' },
    { verb: 'use', item: 'stinky_cheese', kind: 'person', say: 'No. Even I am not that mean.' },
  ],
  on: [
    { id: 'combine.postcard', verb: 'use', a: 'left_half', b: 'right_half', do: [{ lose: 'left_half' }, { lose: 'right_half' }, { gain: 'postcard' }] },
  ],
};
```

In fallback, kind and refusal lines, `{item}` is replaced by the item's name, `{target}` by the target's (empty without
one), `{name}` by the name of whatever is targeted. `{objet}`, `{cible}` and `{nom}` are the same three under their
names of 4.0: every game written with them keeps working. A kind rule's `item` restricts it to an item used or given.

> [!GUARANTEE id=fallback-order]
> With no written rule, a reaction by kind answers when one matches. An item given to a character who refuses gets
> the refusal, not the verb's fallback line. Anything else gets the fallback line.

When a reaction by kind and a refusal both match a gift, the reaction by kind answers.

**Writing the fallback layer.** Most clicks hit no written rule: what answers them is the game's voice.

- **3 to 6 variants per verb** in `rules.fallbacks`, plus `use2`. The demo has two or three; aim higher.
- **Write them in character.** Pixel's `push`: "It does not move. I need more breakfast." Pixel's `use2`: "These do
  not go together. Like cats and baths."
- **`kinds`** answer a whole family at once: every `cat` refuses to be pulled, every `person` refuses to be carried. A
  precise `target` wins over a `kind`.
- **`refuse` per character** answers any Give that has no rule: Lou says "Thanks, but my pockets are full. Of other
  people's things."
- **"That doesn't work" is never acceptable.** It tells the player nothing. A fallback should be a joke, a hint at the
  hero's want, or both ([puzzle design](create.puzzle-design.md#fallbacks)).

<a name="once"></a>

## `once`, four times

The word names one idea, an effect that happens once per game, on four things: the command `{ once: […], id }` runs
its list the first time only; `once: true` on an option of a `choice` shows it once; `once: true` on a listener
(`events`) fires it once; a signal from the world outside applies once by default (`once: false` repeats it on each new
delivery). The engine remembers each in the save under the thing's stable id.

<a name="double-tap"></a>

## A double tap: the verb a player means

A single tap walks to a thing; a double tap acts on it without choosing a verb
([`src/engine/core/default-verb.ts`](../../src/engine/core/default-verb.ts)):

- an exit is gone through (its first verb the game has);
- a character is talked to;
- anything else is looked at.

When that is not right, the thing names its own: `hotspots: { cupboard: { name: 'cupboard', defaultVerb: 'open' } }`
(also on a prop, an actor, an exit). An item picked from the bag without a verb is given to a character and used on
anything else; the sentence line says which before the tap. A verb the game does not have is never chosen. The player's
side of it: [controls](play.controls.md).

<a name="exit-on-tap"></a>
<!-- applies: .. since 4.2.4 -->

## A single tap that goes through an exit

In the LucasArts classics, a click on a door with the default "Walk to" took the hero through it.
`input: { exitOnTap: true }` in `game.ts` does the same: a single tap on an exit with no verb picked walks there and
goes through on arrival, with the double tap's verb (a locked exit says its `locked` line). A picked verb still wins, a
tap elsewhere during the walk still redirects the hero, and nothing is gone through; a double tap is unchanged. An exit
can say otherwise: `onTap: 'walk'` keeps it walk-only in a game with the switch, `onTap: 'go'` makes it go through in a
game without it (`exits: { path: { name: 'path', to: 'village', onTap: 'go' } }`). Off by default.

> [!LIMIT id=input-only]
> `exitOnTap`, `onTap`, `defaultVerb` and the verb keys are input only: the rules, the solver and saves do not see them.

<a name="hotspot-on-tap"></a>
<!-- applies: 4.4.0.. since 4.4.0 -->

## A hotspot that acts on a single tap

A hotspot can say `onTap: 'go'` too: a single tap walks there and acts on arrival with its `defaultVerb`. For example
an endless aisle that says why one does not walk down it. Without it a tap on a hotspot only walks there;
`input.exitOnTap` is about exits and never changes that.

```room-example
{
  "room": {
    "id": "shop",
    "name": "The shop",
    "decor": "decor/shop",
    "hotspots": {
      "aisle": { "name": "aisle", "defaultVerb": "use", "onTap": "go" },
      "cupboard": { "name": "cupboard", "defaultVerb": "open" }
    },
    "look": { "aisle": "Shelves, as far as the eye can see.", "cupboard": "A cupboard." },
    "on": [
      { "id": "shop.use-aisle", "verb": "use", "a": "aisle", "do": ["That aisle never ends. I am not going down it."] },
      { "id": "shop.open-cupboard", "verb": "open", "a": "cupboard", "do": ["Empty. Of course."] }
    ],
    "hints": [{ "id": "shop.hint", "until": "never", "lines": ["Not down the aisle."] }]
  },
  "layout": {
    "walk": { "area": [[20, 300], [620, 300], [630, 395], [10, 395]] },
    "entries": { "default": [320, 360] },
    "hotspots": {
      "aisle": { "rect": [400, 120, 120, 180], "approach": [460, 320] },
      "cupboard": { "rect": [80, 150, 90, 150], "approach": [125, 320] }
    }
  }
}
```

<a name="verb-keys"></a>
<!-- applies: .. since 4.3.0 -->

## A key per verb

On a desktop, the LucasArts games picked a verb at the keyboard: O for Open, L for Look at. A verb's `key` does the
same: `{ id: 'open', label: 'Open', color: '#8fd3ff', key: 'o' }`. The key, in any case and without Ctrl, Alt or Meta,
picks the verb as a tap on its button would (and drops it if it is already picked). It does nothing while the engine
is busy, while a line is on screen, or while a conversation, the map, a minigame or a menu is over the scene. The
button underlines the letter's first occurrence in its label and says it to a screen reader (`aria-keyshortcuts`).

The key is translated with the label (`verb:open/key` in the locales: Close's `c` is Fermer's `f`).
`npm run validate` refuses a key that is not one character, Space (it advances a line) and a key two verbs share, in
the game and in each translation, and warns when the label does not contain the letter. Choose letters once the
labels are written: "Pick up", "Push" and "Pull" all start with P, so one of them takes another letter of its label
(`s` for Push). Without `key`, no shortcut.

With `settings: true`, the settings offer a "Verb keys" row (`ui.verbKeys`) in any game whose verbs have keys, so a
player can turn them off, as WCAG 2.1.4 asks of a single-letter shortcut (someone who types by voice, or hits keys by
accident); `npm run validate` warns about keys without a settings menu. Nothing happens either while the credits roll.

<a name="related"></a>

## Related identifiers

- `on`, `rules.on`, `rules.kinds`, `rules.fallbacks`, `refuse`, `defaultVerb`, `onTap`, `input.exitOnTap`,
  `VerbDef.key`.
- [Commands](create.commands.md), [conditions](create.conditions.md), [exits](create.exits.md),
  [the DSL reference](create.dsl.md), [ADR 0006, the double tap](../../docs/dev/adr/0006-double-tap-default-verb.md).
