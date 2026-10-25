# Translations

The content stays written in one language (`lang` in `game.ts`, `en` when absent). Translating is a table, not keys
in the content: one JSON file per language, `{ "<path>": "<text>" }`, made and kept up to date by the `i18n` tool.
This page is the procedure, then the reference of the paths and of how the player picks a language.

<a name="what-you-get"></a>

## What you get

`locales/<lang>.json` beside the game, every text of the game translated, a game that offers the language in its
Settings and picks it from the browser, and `i18n status` at ✔ for every language.

<a name="context-and-versions"></a>

## Context and versions

The engine repository and a created project alike; only the command and the folder differ. True from 4.3.0: text
switches kept by a translation and `i18n.same` are checked by `status` since then.

<a name="prerequisites"></a>

## Prerequisites

- A game that loads (`validate` passes).
- Stable ids on the lines you will voice or reorder: `ids --lines --write` (see [Voices](create.voices.md#steps)).
  Without one, a line is keyed by its position.

<a name="where-to-run"></a>

## Where to run the commands

| Context | Folder | Command | Files |
|---|---|---|---|
| Engine repository | its root | `npm run i18n -- <sub>` (the game: `GAME=<id>`, else the one `npm run game` chose, else `config.game`) | `games/<id>/locales/` |
| Created project | its root | `npx quest-n-click i18n <sub>` | `game/locales/` |

<a name="steps"></a>

## Steps

<!-- step: extract-reference -->
1. **Write the reference file**, every text of the game with its path, in the game's own language:

   ```bash
   npm run i18n -- extract              # games/<id>/locales/en.json: every text with its path (the reference)
   npm run i18n -- extract --lang fr    # locales/fr.json: keeps what is translated, follows moved texts, adds the missing ones
   npm run i18n -- status               # coverage of every language, stale paths, long lines
   ```

   These three run in the engine repository; in a created project they are `npx quest-n-click i18n extract`,
   `npx quest-n-click i18n extract --lang fr` and `npx quest-n-click i18n status`.

<!-- step: extract-language -->
2. **Create or update the language file** with `extract --lang fr`. The missing paths are added with the source text,
   to translate; the file's `_` entry says so. It prints how many texts are to translate, followed a moved text,
   came back, or were parked as `_stale`.

<!-- step: translate -->
3. **Translate the values**, never the keys. Keep the text switches of the source (`{form?m=him|f=her}`): a
   translation must keep each choice its source makes, and may add its own (a French agreement English writes alike,
   `Prêt{form?f=e|*=}`). The syntax is on [Heroes](create.heroes.md#hero-choice).

<!-- step: status -->
4. **Check** with `status`. For each language: translated / total, missing, stale, long (more than 140 characters),
   with other text switches, and the texts identical to the source. It exits 1 while a language has a missing or stale
   path, a dropped switch, or an identical text that `i18n.same` does not list.

<!-- step: ship -->
5. **Ship.** The game's `index.ts` picks up every `locales/*.json` (the template's and the sample games' do); build as
   usual. Commit the reference file with the translations.

<a name="translations"></a>

## Paths, and what a refactor does to them

A path looks like `room:house/look.pantry[1]`, `item:key/name`, `char:grandma/refuse`, `ui/newGame`,
`rules/fallbacks.look[2]`, `start/intro[0].say`, `credits[3]`, `map/places.house.name`, `objectives/key.title`. A line
with an id is keyed by it: `room:house/look.pantry.<id>`, `rules/fallbacks.look.<id>` (lists take `{ id, text }`
lines; see [Upgrade notes v3](install.upgrade-notes-v3.md#list-lines)). The file is `{ "<path>": "<text>" }`.

Paths follow the structure, so a refactor moves them; `extract --lang xx` copes. It compares the game with the
reference file (refreshed at the same time):

- a text that moved (a reordered list, a rule moved up) keeps its translation, because its source text is the same;
- a text that disappeared is parked under `_stale:<old path>`: ignored in play, listed by `status`, deleted by hand
  when you are sure; it comes back with its translation if the path returns;
- a text whose source changed is offered again to translate.

Rule of thumb: run `extract --lang xx` after every refactor, before translating anything new, and commit the reference
file with the translations.

> [!GUARANTEE id=i18n-moved-texts]
> `extract --lang` keeps the translation of a text that moved, parks the one that disappeared under `_stale:`, and
> brings it back with its translation when its path returns.

<a name="language-choice"></a>

## How the player gets a language

The language is chosen when the page loads, the first that applies:

1. `?lang=fr` in the address;
2. the player's choice in Settings (kept in the browser as `<game id>.lang`): with `settings: true`, the Settings menu
   shows a Language row (`ui.language`) when the game ships another language; each tap moves to the next language and
   reloads the page;
3. the browser's language, when the game ships it (`fr-CA` picks `fr`);
4. otherwise the game's own language.

A text a file lacks stays as written. The voices follow the language: [Voices](create.voices.md#per-language).

> [!LIMIT id=lang-not-shipped]
> `?lang=xx` for a language the game does not ship shows the texts as written, with no message.

<a name="i18n-same"></a>

## `i18n.same`: identical on purpose

A text identical to the source is an untranslated line, and fails `status`, unless `i18n.same` in `game.ts` lists its
path: a name, `OK`, ▲, a word French borrowed.

```ts
i18n: { same: ['char:hero/name', 'ui/ok'] },
```

`status` also lists the `ui` keys the game leaves to the engine's English defaults: a player sees those in English in
every language.

<a name="coverage"></a>

## Where else the coverage shows

`npm run validate -- --report` (`npx quest-n-click validate --report`) and the Studio's Check tab show the coverage
per language. `verify`, `build` and `release` in a created project run `i18n status` and stop on its failure.

<a name="expected-result"></a>

## Expected result, and how to check it

`status` prints `✔  fr: <n>/<n> translated` for every language and exits 0; `?lang=fr` shows the game in French.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `… fr: 120/131 translated, 11 missing` | New texts since the last extract | `extract --lang fr`, translate |
| `stale   room:house/look.pantry[3]` | A text that no longer exists | Delete it once sure, or let it come back |
| `switch  <path> (source: …; translation: …)` | The translation drops a choice of the source's switches | Put the switch back in the translation |
| `same    <path> (translate it, or list it in i18n.same)` | A text left as the source | Translate it, or list it in `i18n.same` |
| `[<id>] no locales` | No language file yet | `extract --lang <xx>` |
| The page stays in English | `?lang=` misspelt, a choice stored for another language, or the file not shipped | Check the address and Settings; rebuild |

<a name="files-changed"></a>

## Files or data changed

`locales/<base>.json` (the reference) and `locales/<lang>.json`; nothing else. `ids --write` (a prerequisite) renames
the keys of the locale files to id-based paths.

<a name="recovery"></a>

## Recovery or going back

Both files are in Git: `git checkout -- <file>` undoes an extract. Nothing is lost by `extract`: a disappeared text
goes to `_stale:`, never deleted.

<a name="references"></a>

## References

- [`tools/i18n.ts`](../../tools/i18n.ts), [`src/engine/tools/i18n.ts`](../../src/engine/tools/i18n.ts) (`textPaths`, `mergeLocale`, `localeStatus`, `switchesKept`), [`src/engine/boot.ts`](../../src/engine/boot.ts) (`pickLanguage`)
- [Voices](create.voices.md), [Heroes](create.heroes.md), [Languages, for the player](play.languages.md)
