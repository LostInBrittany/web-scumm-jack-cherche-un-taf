# Accessibility

What a quest'n'click game offers a player who uses the keyboard, a screen reader, larger text or less motion; what is
checked by machines, what only people can check, and where those checks stand. True from 4.3.0 (verb keys and their
announcement); the rest is older and says since when.

<a name="engine"></a>

## What the engine does

Every game made with the engine gets these, without its author writing anything:

- **The whole game plays at the keyboard**: Tab reaches the verbs (the arrows move inside the grid, and the chosen
  verb is announced as pressed), the scene's targets (one hidden button per visible hotspot, prop or character, in
  the scene's order), the bag and the tools. A conversation's choices and the map's places take the focus when they
  appear (arrows, Enter). Space or Enter advances a line of dialogue. Escape closes what is on top (a menu, the map, a
  transcript, a cutscene's or minigame's Skip), otherwise opens the pause menu, whose focus stays inside. The keys:
  [Controls](play.controls.md#keyboard).
- **A live region** announces the room you enter, each line of dialogue with who speaks, and each item you gain. The
  "tap to continue" marker has a name for screen readers (`ui.advance`, "Continue" by default).
- **Verb keys** (a game's choice, since 4.3.0): a verb with a letter is announced with that shortcut
  (`aria-keyshortcuts`), and the settings can turn the keys off, as WCAG 2.1.4 asks of single-letter shortcuts.
- **Images** are decorative unless named: the scene is reached through its targets, an item through its name; an
  empty bag slot is left out of the accessibility tree.
- **Minigames** play to their end at the keyboard, not only skip: `pick` and `hide` (the options and hiding spots are
  named buttons, the arrows move, Enter picks), `pipes` (the arrows walk the grid, Enter turns a tile), `runner`
  (▲ / W jumps, ▼ / S ducks), `stroke` (◀ ▶ in turn at a calm rhythm; holding a key is "too fast"), `scratch` (the
  arrows move a coin over the silver layer, the revealed text is announced) and `cables` (Enter on a plug picks it up,
  Enter on a socket plugs it in). The minigame takes the focus on its first control; Skip is always reachable. The
  Remix code wheel turns with buttons, arrows or a gamepad, announces each turn, and can be printed.

<a name="text-and-motion"></a>

## Text, motion, sound and colour

- **Text**: a larger text size, and a slower text speed that keeps each line longer on screen, in the
  [settings](play.settings.md); a readable font when the game ships one. A line with a voice clip stays as long as
  the clip plays; a tap skips any line.
- **Motion**: "Reduce motion" removes shake, camera glides, parallax, particles and transitions; the system's own
  reduced-motion preference does the same and stops the interface's animations.
- **Sound**: every spoken line is also written. A sound that matters can be captioned on screen ("[A door slams
  upstairs]") when the author wrote a caption; the captions are on by default. Whether a puzzle needs to be heard is
  the author's choice. Music, sound and voice have separate volumes.
- **Colour**: the verbs, items and topics carry their names as text. There is no high-contrast mode or colour setting:
  a game's colours are its author's.

<a name="checked"></a>

## What is checked, and what is not

By machines, in CI, on every change that can affect the player:

- `npm run e2e -- --axe` runs axe-core on the title, a room, the pause menu and the ending; `npm run e2e:a11y` on a
  conversation menu, the map, the save and load slots, the overwrite and restart confirmations, and every bundled
  minigame as it opens. A `serious` or `critical` violation fails the run; the list of accepted rules is empty.
- `npm run e2e:a11y` also wins each bundled minigame in a real browser with key presses only, reading the page as a
  player does.
- The solver's winning path is replayed at the keyboard (`npm run e2e -- --generic --keyboard`), in Chromium and, since
  3.3.1, in WebKit.

What the engine can claim is therefore "tested at the keyboard, no serious or critical axe violation on the screens
checked". **It is not a WCAG conformance claim.**

> [!LIMIT id=no-screen-reader-pass]
> No person has played a quest'n'click game with a screen reader for a release yet. The checklist exists
> ([`docs/dev/SCREEN-READER.md`](../../docs/dev/SCREEN-READER.md): VoiceOver on iOS or TalkBack on Android, the
> title, a room, an action, an item, a conversation, the map, the pause menu, a minigame, the ending), and the support
> matrix lists a VoiceOver or NVDA pass under "checked by people (not yet done)". As of 4.4.0, the people's passes
> that read this surface, `phone-both-renderers` ([#83](https://github.com/Quest-n-Click/quest-n-click/issues/83)),
> `code-wheel-human` ([#78](https://github.com/Quest-n-Click/quest-n-click/issues/78), the code wheel's text alternative by a
> screen-reader user) and `blind-playtesters` ([#76](https://github.com/Quest-n-Click/quest-n-click/issues/76)), are not run.

<a name="fairness"></a>

## Accessibility and fair play in speedruns

A speedrun category declares the inputs it allows (mouse, touch, keyboard, gamepad, macros). An accessibility option is
**never an implicit cheat**: the text speed, the text size, reduced motion and the readable font change nothing in the
in-game time (a line costs the same logical time at every speed), and the keyboard's and the screen reader's targets
are the same actions as a tap. A category that forbids an input says so; the inputs a run used are declared by the
player's browser (its word, as the real-time clock is). See [Speedrun for players](play.speedrun.md) and, for
authors, [Speedrun for authors](create.speedrun.md#fairness).

<a name="report"></a>

## Report a barrier

A barrier is a bug. Open an issue on [the project's tracker](https://github.com/Quest-n-Click/quest-n-click/issues) with the
screen, your device, browser and assistive technology, and what you heard or could not reach. A session file
(pause menu › Save › Export session) helps the author replay what you did.

<a name="references"></a>

## References

- [Stability and support](start.stability.md): the player's statuses, its passes.
- The code: [`src/engine/dom/a11y.ts`](../../src/engine/dom/a11y.ts) (the focus trap, arrow navigation),
  [`src/engine/dom/input.ts`](../../src/engine/dom/input.ts) (the keys),
  [`tests/dom/minigames-keyboard.test.ts`](../../tests/dom/minigames-keyboard.test.ts) (five minigames won with key
  events).
