# Rule explainer

The Play tab's **Why?** panel answers "what happens if the player does this, now?": pick a verb, an item and a target,
and it lists every rule that could answer, each condition evaluated against the live state of the game in the frame,
and which answer wins.

<a name="where"></a>

## Where it is

In the Studio's Play tab, under the game's live state ([Play and replay a session](studio.sessions.md)). Its heading
reads "Why? — the rules that could answer, first ✓ wins". It reads the game running in the frame, so it follows what
you play. Local Studio only: on a hosted Studio the game is on another origin and the panel is left out.

<a name="inputs"></a>

## Inputs

| Field | Values | Default |
|---|---|---|
| **Verb** | The game's verbs | The first verb |
| **Item** | An item in the bag now, or `(no item)` | `(no item)` |
| **Target** | What the action is on: a target of the current room, or an item in the bag (`bag: <id>`) | `(target)`: the panel says "Pick a target." |

With an item, the action is "verb item → target" (use key on door); without one, "verb target".

<a name="matching"></a>

## Which rules are listed

The room's rules (`on` of the current room) first, then the game's rules (`rules.on` of the game), in their written
order. A rule is listed when its verb includes the verb picked and its targets match: `a` is the target (or the item
when there is one) and `b` the target when there is an item. For two items, the rule also matches the other way
round (item and target swapped).

<a name="marks"></a>

## What each line shows

- The mark: **▶** the rule that wins (the first whose condition holds), **✓** a rule whose condition holds but comes
  after the winner, **✗** a rule whose condition does not hold.
- The rule's id, or `<room>.on[<n>]` / `game.on[<n>]` when it has none, and "(exit)" for an exit rule.
- The verb and targets it answers, then its condition, each part evaluated **✓ / ✗** against the live state, nested
  as the condition is.

<a name="fallbacks"></a>

## When no rule answers

The panel says which answer the engine falls back to: "No rule answers: …"

| Action | Fallback named |
|---|---|
| look at a target, which has a look line (in the room or on the item) | the look line |
| look at a target without one | the look fallback |
| talk to a target with conversation topics in the room | the conversation topics |
| talk to the game's hint item | the hints |
| talk otherwise | the talk fallback |
| anything else | a kind reaction, a refusal or the fallback line |

> [!LIMIT id=explainer-live-state-only]
> The panel judges the state in the frame now: it does not search for a state where a rule would hold (that is the
> solver's job, [Check](studio.check.md)), and it does not run the rule. Rules a script or a listener answers outside
> a verb are not listed.

<a name="related"></a>

## Related identifiers

- [Reactions](create.reactions.md), [Conditions](create.conditions.md).
- [`src/studio/play.ts`](../../src/studio/play.ts) (the panel, `explainCond`).
