# Bruitages

Un jeu nomme ses sons par id dans `audio.sfx` et les joue avec la commande `sfx` (`{ sfx: 'door_open' }`). Cette page
est la référence des recettes qui les synthétisent depuis la palette Mega Drive commune (`sfx.json`), de la façon dont
`npm run assets` les publie, et des sous-titres pour les joueurs qui ne les entendent pas.

<a name="rules"></a>

## Les règles

Les bruitages suivent les règles de la musique ([Musique en stems](create.music.md#rules)), celles qui les concernent :

- **Une seule palette.** Chaque bruitage se construit depuis
  [`tools/audio/palette.json`](../../tools/audio/palette.json), les mêmes patches FM, enveloppes PSG et bruit que la
  musique : une porte et le thème sonnent comme un seul jeu. Un son manquant est un nouveau patch dans la palette (avec
  un `desc`), jamais un patch ad hoc ; un patch dont dépendent des sons livrés ne se modifie pas (on en ajoute un, ou on
  incrémente `version`).
- **Les fichiers rendus sont commités** : `audio/sfx/*.mp3` et `sfx.json`. Le dossier de construction (`.sfx-build`)
  est supprimé après chaque passage.
- **Les sources.** Un bruitage que vous n’avez pas synthétisé (un enregistrement, une banque de sons) doit être à vous,
  dans le domaine public, ou sous une licence qui autorise une œuvre dérivée ; dites d’où il vient dans `CREDITS.md`
  et dans la provenance du jeu ([Provenance des assets](create.asset-provenance.md)).

<a name="recipes"></a>

## `sfx.json` : une recette par bruitage

`games/<id>/audio/sfx.json` contient une recette par id de `audio.sfx`. Dans le dépôt du moteur, à sa racine :

```sh
# dans le dépôt du moteur
npm run audio -- sfx games/<id>/audio/sfx.json
```

les rend en `games/<id>/audio/sfx/<id>.mp3` : silence final coupé, crête normalisée, fondu de 10 ms à la fin.
`--only door_open latch` n’en rend que certains ; `--out <dossier>` écrit ailleurs. Un projet créé n’a pas de commande
`audio` : rendez les bruitages dans un clone du dépôt du moteur et copiez les `.mp3` dans le `game/audio/sfx/` du
projet.

Une recette, ce sont quelques lignes d’un ou plusieurs canaux à 60 lignes par seconde, avec les instruments de la
palette :

```json
"door_open": { "desc": "a latch, then a wooden creak", "rows": 40, "tracks": [
  { "ch": "NOISE", "ins": "noise_hat", "events": [{ "row": 0, "note": "C6", "vol": 12 }] },
  { "ch": "FM1", "ins": "muted_pluck", "events": [{ "row": 3, "note": "D2", "vol": 118, "fx": [["01", "03"]] }, { "row": 28, "off": true }] }
] }
```

Les recettes sont rangées sous `"sfx"` dans le fichier, à côté de `"rate"` (lignes par seconde, 60 par défaut) et d’un
`"palette"` optionnel (un fichier de palette relatif à `sfx.json` ; par défaut, la palette commune).

| Champ | Forme | Par défaut |
|---|---|---|
| `desc` | ce qu’est le son, en mots | aucun |
| `rows` | la longueur en lignes (le silence final est coupé de toute façon) | 32 |
| `tracks[].ch` | un canal : `FM1`…`FM6`, `PSG1`…`PSG3`, `NOISE` | obligatoire |
| `tracks[].ins` | un instrument de la palette, pour toute la piste | aucun |
| `events[].row` | la ligne où tombe l’événement | obligatoire |
| `events[].note` | un nom de note (`C6`) ou un numéro MIDI | aucun |
| `events[].ins` | un instrument pour cet événement seulement | celui de la piste |
| `events[].vol` (ou `tracks[].vol`) | FM 0–127, PSG 0–15 | celui de l’instrument |
| `events[].fx` | paires hex : `01` / `02` glissando montant / descendant, `00xy` arpège, `04xy` vibrato, `0Axy` glissé de volume, `EDxx` retard | aucun |
| `events[].off` | une coupure de note | aucun |
| `gain` | la crête après normalisation | 0,9 |

Le rendu s’arrête sur une recette qu’il ne sait pas jouer, en la nommant : `<id>: unknown channel <ch>`,
`<id>: <ch> row <r> needs an instrument`, `<id>: event at row <r> beyond length <rows>`,
`<id>: <ch> row <r>: more than 4 effects`.

<a name="vocabulary"></a>

## Le vocabulaire du jeu d’exemple

Le [`sfx.json`](../../games/demo/audio/sfx.json) du jeu d’exemple couvre le vocabulaire habituel d’un jeu
d’aventure : `click`, `select`, `success`, `error`, `door_open`, `door_close`, `latch`, `coins`, `cloth`, `paper`,
`ring`, `drop`, `bell`, `glass`, `metal`, `shuffle`, `chips`, `pluck`, `bong`. Copiez-le dans un nouveau jeu et gardez
les ids : le contenu des jeux d’exemple s’en sert, donc les règles que vous y copiez gardent leur son.

Le moteur lui-même ne joue aucun son sous un id fixe. Les sons qu’il joue de lui-même sont ceux que le jeu nomme dans
`skin.sounds` (`phone`, `plane`, `confetti`, `jingle`, `end` ; voir [Habillage et polices](create.skin-fonts.md)), et
un mini-jeu joue les ids que nomment ses paramètres.

<a name="captions"></a>

## Les sous-titres

Un son qui compte reçoit un sous-titre, montré par écrit pour qui ne l’entend pas, et traduit comme toute ligne :

```ts
{ sfx: 'door_slam', caption: '[A door slams upstairs]' }
```

Le réglage des sous-titres est actif par défaut, et le menu Réglages ne le propose que dans un jeu qui sous-titre au
moins un son.

<a name="shipping"></a>

## Comment `npm run assets` les publie

`npm run assets` (dans le dépôt du moteur, ou dans un projet créé) prépare chaque son que cite le contenu :

| Quoi | Source par défaut | Sortie | Encodage |
|---|---|---|---|
| musique | `games/<id>/audio/music/<fichier>` | `public/assets/audio/music/<fichier>` | 96 kb/s, stéréo |
| bruitages | `games/<id>/audio/sfx/<fichier>` | `public/assets/audio/sfx/<fichier>` | 128 kb/s, mono |
| voix | `games/<id>/audio/voice/<fichier>` | `public/assets/audio/voices/<fichier>` | 64 kb/s, mono |

Dans un projet créé, le dossier est `game/` au lieu de `games/<id>/`. Seul ce qui a changé est réencodé.

`games/<id>/sources.json` remplace ces motifs (`{file}` est le fichier nommé dans `audio`) :

- un motif peut être une liste de candidats essayés dans l’ordre, et fixer son propre débit :
  `"sfx": ["private/audio/sfx/{file}", { "path": "private/audio/{file}", "rate": "64k" }]` ;
- un `.mp3` demandé peut venir d’un `.ogg` du même nom ;
- un son sans source mais déjà présent dans `public/assets` est gardé tel quel ;
- un son sans l’un ni l’autre est signalé manquant (`sfx:<id>=<fichier>`) et le jeu joue un silence à sa place.

Le côté images de `sources.json` (motifs, `overrides`) est sur [Images](create.images.md#pipeline).

<a name="related"></a>

## Identifiants liés

- `audio.sfx`, la commande `sfx` et son `caption`, `skin.sounds`.
- `npm run audio -- sfx`, `npm run assets`, `games/<id>/sources.json`.
- [Musique en stems](create.music.md), [Voix](create.voices.md), [Outils audio](install.audio-toolchain.md).
