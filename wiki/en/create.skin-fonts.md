# Skin and fonts

The skin is everything the engine shows or plays without your content naming it: the buttons of the right-hand
column, the map's pins and vehicles, the sealed ending's confetti, the interface fonts, default character heights. The
`ui` texts are the interface's words. This page is the reference of `skin` in `game.ts` and of the `ui` keys the engine
fills in when you leave them out.

<a name="skin"></a>

## The skin (`skin`)

Image values are manifest image ids; sounds are ids from `audio.sfx` (`phone`, `plane`, `confetti`) or `audio.music`
(`jingle`, `end`). A missing sound is silence. The validator checks every id (`npx quest-n-click validate` in a created
project, `GAME=<id> npm run validate` in the engine repository).

```ts
skin: {
  icons: {
    map: 'ui/r1c5', pause: 'ui/r3c5', music: 'ui/r3c6',   // required: the three column buttons
    spark: 'ui/r3c4',                                        // spark for the guided tutorial
    pin: 'ui/r1c6', news: 'ui/r2c4', plane: 'ui/r2c1', car: 'ui/r2c2',   // map (map.vehicles overrides these if set)
    confetti: ['ui/r4c1', 'ui/r4c2'], cardFallback: 'items/r3c6',      // sealed ending
  },
  sounds: { phone: 'phone', plane: 'plane', confetti: 'confetti', jingle: 'jingle', end: 'end' },
  fonts: { ui: 'Galmuri11', pixel: 'Press Start 2P' },     // CSS families → the --font-ui and --font-pixel variables
  heights: { actor: 110, hero: 84 },                       // default height for a character with no `height`
  callPoses: ['phone', 'telephone', 'front', 'face', 'idle'],   // poses tried for a call's frame
  pixelArt: false,                                         // true: scaled-up images keep hard edges (artStyle "pixel")
},
```

The type is `SkinDef` in [src/engine/core/types/game.ts](../../src/engine/core/types/game.ts).

<a name="skin-icons"></a>

## `skin.icons`

| Key | Required | What it is |
|---|---|---|
| `map`, `pause`, `music` | yes | The three buttons of the right-hand column. |
| `spark` | no | The spark of the guided tutorial. |
| `pin`, `news` | no | The map's pin, and its "!" for news. |
| `plane`, `car` | no | The map's vehicles; `map.vehicles` replaces them where it is set (see [World map](create.world-map.md)). |
| `confetti` | no | Images drawn in alternation at the sealed ending. |
| `cardFallback` | no | The final card's image when the sealed file has no photo (see [The sealed ending](create.sealed-ending.md)). |

<a name="skin-sounds"></a>

## `skin.sounds`

`phone`, `plane`, `confetti`, `jingle`, `end`: each an id of `audio.sfx` or `audio.music`, all optional. A sound left out,
or an id with no file, plays nothing.

<a name="skin-fonts"></a>

## `skin.fonts`

| Key | Sets | Default |
|---|---|---|
| `ui` | The CSS variable `--font-ui`: dialogue, menus, the action line. | `Galmuri11` since 4.3.0 (`DotGothic16` before). |
| `pixel` | The CSS variable `--font-pixel`: titles and pixel labels. | `Press Start 2P`. |
| `readable` | The family the "Readable font" setting switches `--font-ui` to (for instance a dyslexia-friendly family). | None: the setting is not offered. |

The value is a **CSS font family name**. The engine ships three families with their `@font-face` rules
([src/engine/dom/style.css](../../src/engine/dom/style.css)), all under the OFL: Galmuri11 (a 125 KB Latin subset),
DotGothic16 and Press Start 2P. Every interface family gets a fallback stack: the family, then DotGothic16 (for
Japanese text and the symbols Galmuri11 lacks), then `'Courier New'`, then `monospace`
([src/engine/dom/fonts.ts](../../src/engine/dom/fonts.ts)). Galmuri11 is drawn with a `size-adjust`, so a game's text
keeps its size.

- A game that wants the look of 4.2 and before sets `skin.fonts.ui: 'DotGothic16'`.
- A game that already set `skin.fonts.ui` keeps its font; a character its font lacks falls back to DotGothic16 before
  `'Courier New'`.

> [!LIMIT id=skin-fonts-not-loaded]
> `skin.fonts` names a family; it does not load a font file. A family other than the three the engine ships must be
> made available to the page by your own `@font-face`; otherwise the browser draws the next family of the stack.

The "Readable font" setting is on [Staging](create.staging.md#settings).

<a name="skin-other"></a>

## `skin.heights`, `skin.callPoses`, `skin.pixelArt`

| Key | What it is | Default |
|---|---|---|
| `heights.actor`, `heights.hero` | The height, in logical units, of a character with no `height` of its own. | actor 110, hero 84 |
| `callPoses` | The poses tried, in order, for the frame of a phone call (`phone`). | `phone`, `front`, `face`, `idle` |
| `pixelArt` | `true`: images scaled up by the browser keep hard edges (`image-rendering: pixelated` on the scene's images) instead of being smoothed. Set it for a game whose `site.json` says `artStyle: "pixel"`. | `false` |

<a name="ui-defaults"></a>

## Interface texts (`ui`) and their defaults

Interface texts are in `ui` in `game.ts`, including `tapToContinue` ("▼ tap to continue") and `ok` (the password
button). The keys the engine shows by itself have an **English default** when the game leaves them out
([src/engine/dom/ui-defaults.ts](../../src/engine/dom/ui-defaults.ts)). As of 4.4.0 they are:

| Group | Keys |
|---|---|
| Verbs and input | `verbs` (the verb bar's ARIA label), `advance`, `jump`, `duck`, `verbKeys` (4.3.0) |
| Saves | `saveFailed`, `saveAdjusted`, `save`, `load`, `slot`, `emptySlot`, `confirmOverwrite`, `exportSave`, `importSave` |
| Updates and offline | `updateAvailable`, `updateNow`, `offlineStatus`, `offlineComplete`, `offlineRetry` |
| Sessions | `exportSession`, `shareSession` |
| Settings | `settings`, `textSpeed`, `textSize`, `slow`, `normal`, `fast`, `large`, `reduceMotion`, `readableFont`, `language`, `captions`, `volumeMusic`, `volumeSfx`, `volumeVoice` |
| Objectives and build | `objectives`, `fingerprint` |
| Remix (4.1.15) | `remix`, `remixTitle`, `remixStory`, `remixRandom`, `remixSeed`, `remixDaily`, `remixMystery`, `remixPlay`, `remixInvalid`, `remixWorld`, `remixHidden`, `remixCopied`, `remixNoBridge`, `remixConflict`, `remixKeepSaved`, `remixStartLinked` |
| Speedrun (4.1.14) | `speedrun`, `exportRun`, `abandonRun` |

A game in another language provides them all. To find the ones left to the English defaults:

```sh
# in the created project
npx quest-n-click i18n status

# in the engine repository
GAME=<id> npm run i18n -- status
```

In the engine repository, `npm run e2e -- --lang <xx>` also fails when one of these defaults is visible on screen.
Translating the rest of the game is on [Translations](create.translations.md).

<a name="related"></a>

## Related identifiers

- `settings`, the readable font setting: [Staging](create.staging.md#settings).
- `artStyle` in `site.json`, the sheets the art is drawn on: [Images](create.images.md).
- `map.vehicles`, `map.places`: [World map](create.world-map.md).
- `ending`, the sealed card: [The sealed ending](create.sealed-ending.md).
