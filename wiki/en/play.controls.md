# Controls on phone and desktop

How you play a quest'n'click game: with a finger on a phone, with a mouse or the keyboard on a computer. The labels
below are the engine's defaults and the sample game's (*The Pantry Key*); a game may name its verbs and buttons
otherwise, and it may have fewer or more verbs.

<a name="layouts"></a>

## Two layouts

- **On a phone** the game plays in landscape. Held upright, a phone shows "Rotate your phone" (the game's own words)
  until you turn it. The scene fills the left; a column on the right holds the verbs, the bag (your inventory) and
  the tools: a portrait per playable character when the game has several (a tap switches to that character), the
  map, the pause menu, and a sound button that turns music and effects off or on together. On a short
  landscape screen (a phone under its browser's bars), the column shrinks its slots and verbs to fit, and scrolls
  instead of cutting below a floor (4.4.0).
- **On a computer** with a mouse and a window at least 720 × 450 pixels, the classic layout: the scene on top, the
  sentence line, then the verbs, the bag and the tools in a row below. Hovering a thing names it in the sentence line
  and turns the pointer into a hand.

<a name="tap-and-verbs"></a>

## Verbs, taps and the sentence line

A verb is a button: Give, Open, Close, Pick up, Look at, Talk to, Use, Push, Pull in the sample game. Then:

- **Tap (or click) a verb, then a thing** in the scene or in the bag: the hero walks there and does it. Tapping the
  chosen verb again drops it.
- **Use and Give take two things**: pick the verb, the first thing (an item of the bag), then the second ("Use pipe
  with tank", "Give token to seller").
- **Tap a thing with no verb chosen**: the hero walks to it. On a phone, its name shows above it for a moment.
- **Tap an empty spot**: the hero walks there, within the floor.
- **Tap an item of the bag with no verb**: it is picked for Use (or Give, on a character); the next tap on a target
  says what happens.
- **The sentence line** says what the next tap will do before you tap: "Walk to", "Look at the clock", "Use pipe
  with …".
- While a line of dialogue is on screen, a tap anywhere advances it.

<a name="double-tap"></a>

## A double tap: the verb you mean

Two taps on the same thing within 400 ms act on it without choosing a verb (since 4.0):

- an **exit** is gone through (its first verb);
- a **character** is talked to;
- **anything else** is looked at;
- a thing may name its own verb instead (a cupboard that opens on a double tap, for instance);
- with an **item picked from the bag**, the double tap gives it to a character, or uses it on anything else.

A verb the game does not have is never chosen.

> [!GUARANTEE id=double-tap-verb]
> With nothing picked from the bag, a double tap goes through an exit, talks to a character and looks at anything else.

<a name="single-tap-exit"></a>

## A single tap that goes through

Some games make a single tap on an exit walk there **and** go through on arrival, as the classics did with "Walk to"
(a game's `input.exitOnTap`, since 4.2.4; an exit or a hotspot can also ask for it, since 4.2.4 and 4.4.0). A verb you
picked still wins, and a tap elsewhere during the walk redirects the hero and cancels the crossing. A locked exit says
why it is locked.

<a name="keyboard"></a>

## The keyboard

The whole game plays at the keyboard:

| Key | What it does |
|---|---|
| Tab, Shift+Tab | Moves between the verbs, the scene's targets (one per visible thing, in the scene's order), the bag and the tools |
| Arrow keys | Move inside the verb grid; choose among a conversation's topics or the map's places |
| Enter, Space | Press the focused button; advance a line of dialogue |
| Escape | Closes what is on top (a menu, the map, a transcript, a cutscene's or minigame's Skip), otherwise opens the pause menu |
| A verb's letter | Picks that verb, when the game gives its verbs a key (since 4.3.0) |

**Verb keys.** A game may give each verb a letter, as the LucasArts games did: O for Open, L for Look at. The button
underlines the letter. The key works in either case, without Ctrl, Alt or Meta, and does nothing while a line is on
screen, while the engine is busy, or while a conversation, the map, a minigame or a menu is open. You can turn the
keys off in the settings ("Verb keys"), for instance if you type by voice. The sample game gives its verbs no key.

On macOS, Safari moves Tab between buttons only with Option held (Option+Tab), unless you change that in the system's
keyboard settings.

<a name="minigames"></a>

## Minigames

Every bundled minigame plays to its end by touch or with the keyboard: the arrows move, Enter picks or turns, and in
the runner ▲ / W jumps and ▼ / S ducks. Each has a **Skip** button (Escape presses it).

<a name="gamepad"></a>

## Gamepad

A gamepad does not play the game. The one exception is the code wheel of a Remix world (since 4.1.16): left and right
turn it, up and down choose an answer, A confirms. See [What quest'n'click does not do](index.not-supported.md).

> [!LIMIT id=controls-not-tried-by-people]
> The touch and keyboard controls are checked by machines (Chromium and WebKit at a phone's size, touch and keyboard,
> in CI). On a real phone they have not been tried by a person yet: the pass `phone-both-renderers` is open
> ([#83](https://github.com/Quest-n-Click/quest-n-click/issues/83)) as of 4.4.0.

<a name="see-also"></a>

## See also

- [Accessibility](play.accessibility.md): focus, screen readers, what is checked.
- [Settings](play.settings.md): text speed and size, reduced motion, verb keys.
- For authors: [Reactions](create.reactions.md), which says how a game names a thing's default verb.
- The code: [`src/engine/dom/input.ts`](../../src/engine/dom/input.ts),
  [`src/engine/core/default-verb.ts`](../../src/engine/core/default-verb.ts).
