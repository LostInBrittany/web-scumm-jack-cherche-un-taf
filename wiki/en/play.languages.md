# Languages

Which language a quest'n'click game shows, how to change it, and what happens to voices and missing translations.
True from 4.4.0, when a translation's own voice clips started shipping with the game; the rest is older.

<a name="which-language"></a>

## Which language the game starts in

A game is written in one language (its base) and may ship translations. When a page opens, the game picks, in order:

1. the `?lang=` of the address (`https://…/?lang=fr`), when the link carries one;
2. the language you chose earlier in the settings, remembered in this browser (local storage key `<game>.lang`);
3. your browser's language, when the game ships a translation for it (a browser in `fr-CA` gets `fr`);
4. otherwise the game's base language.

The sample game, *The Pantry Key*, is written in English and ships French.

<a name="change"></a>

## Changing it

Pause menu › **Settings** › **Language**: each tap moves to the next language the game ships and reloads the page in
it, on the title screen: **Continue** resumes your game from the autosave. The row exists only in a game with the settings menu and more than one
language. Without it, a link with `?lang=` still works.

<a name="voices"></a>

## Voices

A game may have recorded voices, and per language:

- in a language with its own recordings, the lines play those clips; a line that has no clip in that language is
  shown without a voice;
- in a language without recordings of its own, the lines play the base language's clips, so you may read French and
  hear English;
- a game with a hero chosen at New Game (since 4.3.0) may have a clip per hero for the lines that change with the
  hero.

The voice volume is a setting of its own. Before 4.4.0, a translation's clips were not shipped with the built game, so
a translated page played no voice; 4.4.0 fixed it.

<a name="missing-translations"></a>

## A missing translation

A text the translation does not cover is shown in the game's base language. The engine's own interface texts (menu
rows, the update banner) that a game does not translate are shown in English. Authors find both before release:
`npm run i18n -- status` lists them, and the French end-to-end run fails on any visible English default (see
[Translations](create.translations.md)).

> [!LIMIT id=no-in-game-translation-of-voices]
> The engine never translates or synthesises speech: a voice exists only where someone recorded it. It sets no
> right-to-left text direction, and no right-to-left language has been tried.

<a name="related"></a>

## Related

- [Settings](play.settings.md#language), [Player troubleshooting](play.troubleshooting.md#no-sound).
- For authors: [Translations](create.translations.md), [Voices](create.voices.md).
- The code: [`src/engine/boot.ts`](../../src/engine/boot.ts) (`pickLanguage`, the voices of the chosen language),
  [`src/engine/core/voice-key.ts`](../../src/engine/core/voice-key.ts).
