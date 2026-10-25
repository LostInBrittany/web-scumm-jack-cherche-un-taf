# Habillage et polices

L’habillage, c’est tout ce que le moteur affiche ou joue sans que votre contenu le nomme : les boutons de la colonne de
droite, les épingles et véhicules de la carte, les confettis de la fin scellée, les polices de l’interface, la hauteur
par défaut des personnages. Les textes de `ui` sont les mots de l’interface. Cette page est la référence de `skin` dans
`game.ts` et des clés de `ui` que le moteur remplit quand vous les omettez.

<a name="skin"></a>

## L’habillage (`skin`)

Les valeurs d’images sont des ids d’images du manifeste ; les sons sont des ids de `audio.sfx` (`phone`, `plane`,
`confetti`) ou de `audio.music` (`jingle`, `end`). Un son absent, c’est du silence. Le validateur vérifie chaque id
(`npx quest-n-click validate` dans un projet créé, `GAME=<id> npm run validate` dans le dépôt du moteur).

```ts
skin: {
  icons: {
    map: 'ui/r1c5', pause: 'ui/r3c5', music: 'ui/r3c6',   // obligatoires : les trois boutons de la colonne
    spark: 'ui/r3c4',                                        // étincelle du tutoriel guidé
    pin: 'ui/r1c6', news: 'ui/r2c4', plane: 'ui/r2c1', car: 'ui/r2c2',   // carte (map.vehicles les remplace s'ils y sont)
    confetti: ['ui/r4c1', 'ui/r4c2'], cardFallback: 'items/r3c6',      // fin scellée
  },
  sounds: { phone: 'phone', plane: 'plane', confetti: 'confetti', jingle: 'jingle', end: 'end' },
  fonts: { ui: 'Galmuri11', pixel: 'Press Start 2P' },     // familles CSS → variables --font-ui et --font-pixel
  heights: { actor: 110, hero: 84 },                       // hauteur d'un personnage sans `height`
  callPoses: ['phone', 'telephone', 'front', 'face', 'idle'],   // poses essayées pour le cadre d'un appel
  pixelArt: false,                                         // true : les images agrandies gardent des bords nets (artStyle "pixel")
},
```

Le type est `SkinDef`, dans [src/engine/core/types/game.ts](../../src/engine/core/types/game.ts).

<a name="skin-icons"></a>

## `skin.icons`

| Clé | Obligatoire | Ce que c’est |
|---|---|---|
| `map`, `pause`, `music` | oui | Les trois boutons de la colonne de droite. |
| `spark` | non | L’étincelle du tutoriel guidé. |
| `pin`, `news` | non | L’épingle de la carte, et son « ! » des nouvelles. |
| `plane`, `car` | non | Les véhicules de la carte ; `map.vehicles` les remplace là où il est donné (voir [Carte du monde](create.world-map.md)). |
| `confetti` | non | Les images dessinées en alternance à la fin scellée. |
| `cardFallback` | non | L’image de la carte finale quand le fichier scellé n’a pas de photo (voir [La fin scellée](create.sealed-ending.md)). |

<a name="skin-sounds"></a>

## `skin.sounds`

`phone`, `plane`, `confetti`, `jingle`, `end` : chacun un id de `audio.sfx` ou de `audio.music`, tous facultatifs. Un
son omis, ou un id sans fichier, ne joue rien.

<a name="skin-fonts"></a>

## `skin.fonts`

| Clé | Règle | Défaut |
|---|---|---|
| `ui` | La variable CSS `--font-ui` : dialogues, menus, ligne d’action. | `Galmuri11` depuis la 4.3.0 (`DotGothic16` avant). |
| `pixel` | La variable CSS `--font-pixel` : titres et libellés pixel. | `Press Start 2P`. |
| `readable` | La famille vers laquelle le réglage « Police lisible » bascule `--font-ui` (une famille adaptée à la dyslexie, par exemple). | Aucune : le réglage n’est pas proposé. |

La valeur est un **nom de famille de police CSS**. Le moteur fournit trois familles avec leurs règles `@font-face`
([src/engine/dom/style.css](../../src/engine/dom/style.css)), toutes sous licence OFL : Galmuri11 (un sous-ensemble
latin de 125 Ko), DotGothic16 et Press Start 2P. Chaque famille d’interface reçoit une pile de repli : la famille, puis
DotGothic16 (pour le japonais et les symboles qui manquent à Galmuri11), puis `'Courier New'`, puis `monospace`
([src/engine/dom/fonts.ts](../../src/engine/dom/fonts.ts)). Galmuri11 est dessinée avec un `size-adjust`, si bien que
le texte d’un jeu garde sa taille.

- Un jeu qui veut l’allure de la 4.2 et d’avant pose `skin.fonts.ui: 'DotGothic16'`.
- Un jeu qui avait déjà posé `skin.fonts.ui` garde sa police ; un caractère qui manque à sa police se rabat sur
  DotGothic16 avant `'Courier New'`.

> [!LIMIT id=skin-fonts-not-loaded]
> `skin.fonts` nomme une famille ; il ne charge pas de fichier de police. Une famille autre que les trois fournies par
> le moteur doit être rendue disponible à la page par votre propre `@font-face` ; sinon le navigateur dessine la
> famille suivante de la pile.

Le réglage « Police lisible » est décrit dans [Mise en scène](create.staging.md#settings).

<a name="skin-other"></a>

## `skin.heights`, `skin.callPoses`, `skin.pixelArt`

| Clé | Ce que c’est | Défaut |
|---|---|---|
| `heights.actor`, `heights.hero` | La hauteur, en unités logiques, d’un personnage sans `height` propre. | acteur 110, héros 84 |
| `callPoses` | Les poses essayées, dans l’ordre, pour le cadre d’un appel téléphonique (`phone`). | `phone`, `front`, `face`, `idle` |
| `pixelArt` | `true` : les images agrandies par le navigateur gardent des bords nets (`image-rendering: pixelated` sur les images de la scène) au lieu d’être lissées. À poser pour un jeu dont le `site.json` dit `artStyle: "pixel"`. | `false` |

<a name="ui-defaults"></a>

## Les textes d’interface (`ui`) et leurs valeurs par défaut

Les textes d’interface sont dans `ui`, dans `game.ts`, dont `tapToContinue` (« ▼ toucher pour continuer ») et `ok`
(le bouton du mot de passe). Les clés que le moteur affiche de lui-même ont une **valeur anglaise par défaut** quand le
jeu les omet ([src/engine/dom/ui-defaults.ts](../../src/engine/dom/ui-defaults.ts)). En 4.4.0, ce sont :

| Groupe | Clés |
|---|---|
| Verbes et saisie | `verbs` (le libellé ARIA de la barre des verbes), `advance`, `jump`, `duck`, `verbKeys` (4.3.0) |
| Sauvegardes | `saveFailed`, `saveAdjusted`, `save`, `load`, `slot`, `emptySlot`, `confirmOverwrite`, `exportSave`, `importSave` |
| Mises à jour et hors ligne | `updateAvailable`, `updateNow`, `offlineStatus`, `offlineComplete`, `offlineRetry` |
| Sessions | `exportSession`, `shareSession` |
| Réglages | `settings`, `textSpeed`, `textSize`, `slow`, `normal`, `fast`, `large`, `reduceMotion`, `readableFont`, `language`, `captions`, `volumeMusic`, `volumeSfx`, `volumeVoice` |
| Objectifs et version | `objectives`, `fingerprint` |
| Remix (4.1.15) | `remix`, `remixTitle`, `remixStory`, `remixRandom`, `remixSeed`, `remixDaily`, `remixMystery`, `remixPlay`, `remixInvalid`, `remixWorld`, `remixHidden`, `remixCopied`, `remixNoBridge`, `remixConflict`, `remixKeepSaved`, `remixStartLinked` |
| Speedrun (4.1.14) | `speedrun`, `exportRun`, `abandonRun` |

Un jeu dans une autre langue les fournit toutes. Pour trouver celles laissées aux valeurs anglaises :

```sh
# dans le projet créé
npx quest-n-click i18n status

# dans le dépôt du moteur
GAME=<id> npm run i18n -- status
```

Dans le dépôt du moteur, `npm run e2e -- --lang <xx>` échoue aussi dès que l’une de ces valeurs par défaut est visible
à l’écran. Traduire le reste du jeu : [Traductions](create.translations.md).

<a name="related"></a>

## Identifiants liés

- `settings`, le réglage de police lisible : [Mise en scène](create.staging.md#settings).
- `artStyle` dans `site.json`, les planches sur lesquelles l’art est dessiné : [Images](create.images.md).
- `map.vehicles`, `map.places` : [Carte du monde](create.world-map.md).
- `ending`, la carte scellée : [La fin scellée](create.sealed-ending.md).
