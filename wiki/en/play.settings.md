# Settings

The settings a player can change in a quest'n'click game, what each one does, and where they are kept. The menu exists
only when the game's author turned it on (`settings: true`); the sample game has it. Labels below are the engine's
English defaults; a game may word them otherwise.

<a name="where"></a>

## Where to find them

Pause menu › **Settings** (⚙). Each row shows its value; tapping the row moves to the next value, at once.
**Resume** closes the menu. Without a Settings row, the game offers only the pause menu's **Music** and **Sound**
switches and the sound button of the tools.

Settings are kept in this browser, for this game (local storage key `<game>.settings`), apart from the save: loading
a save or restarting does not change them, and they do not travel with an exported save.

<a name="text-speed"></a>

## Text speed

Slow, normal or fast: how long a line of dialogue stays on screen when it has no voice clip. A tap always skips a
line. The setting changes nothing in a speedrun's in-game time (see [Accessibility](play.accessibility.md#fairness)).

<a name="text-size"></a>

## Text size

Normal or large (1.3 times the normal size), for the lines of dialogue and the interface's text in the scene.

<a name="reduce-motion"></a>

## Reduce motion

On or off. On: no screen shake, the camera moves at once instead of gliding, no parallax, no particles, no room
transition, no fades. When your system asks for reduced motion (`prefers-reduced-motion`), the game behaves as if the
setting were on, and the interface's own animations (blinking hints, the rolling credits) stop too.

<a name="readable-font"></a>

## Readable font

On or off, only in a game that ships a readable font (for instance one designed for dyslexia): the interface and the
lines use it instead of the game's pixel font.

<a name="captions"></a>

## Sound captions

On (the default) or off, only in a game that captions some of its sounds: a sound that matters is also written on
screen ("[A door slams upstairs]"), translated like any line.

<a name="verb-keys"></a>

## Verb keys

On (the default) or off, only in a game whose verbs have keys (since 4.3.0): turns off the single-letter shortcuts
that pick a verb, for someone who types by voice or hits keys by accident. See
[Controls](play.controls.md#keyboard).

<a name="language"></a>

## Language

Only in a game that ships more than one language: each tap moves to the next language and reloads the page in it. The
choice is remembered in this browser. See [Languages](play.languages.md).

<a name="volumes"></a>

## Music, sound and voice volumes

Each steps through 0 %, 25 %, 50 %, 75 % and 100 %. The voice volume is offered only in a game with recorded voices.
While someone speaks, the music steps back by itself.

The pause menu's **Music** and **Sound** rows turn music and sound effects off or on; the sound button among the tools
turns both off or on together. These two switches last for the page: they are not kept with the settings.

> [!LIMIT id=no-contrast-setting]
> There is no high-contrast mode, no colour setting and no key remapping. A game's colours are its author's.

<a name="for-authors"></a>

## For authors

`settings: true` in `game.ts` adds the Settings entry to the pause menu: text speed (slow / normal / fast), text size
(normal / large), reduce motion (no shake, instant camera and fades), a readable font when the game ships one
(`skin.fonts.readable`), music / sound / voice volumes, the captions row when the game captions a sound, and the verbs'
keys on or off when a verb has a `key` (4.3.0). Preferences stay in the browser, outside the save. Texts:
`ui.settings`, `ui.textSpeed`, `ui.textSize`, `ui.reduceMotion`, `ui.readableFont`, `ui.captions`, `ui.volumeMusic`,
`ui.volumeSfx`, `ui.volumeVoice`, `ui.verbKeys`, `ui.language`, `ui.slow`, `ui.normal`, `ui.fast`, `ui.large`
(English defaults when absent). More in [Staging](create.staging.md#settings).

<a name="related"></a>

## Related

- [Accessibility](play.accessibility.md), [Controls](play.controls.md), [Languages](play.languages.md).
- The code: [`src/engine/dom/settings.ts`](../../src/engine/dom/settings.ts).
