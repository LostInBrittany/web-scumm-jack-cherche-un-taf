# Musique

L'onglet Music joue les partitions du jeu par le directeur musical du jeu lui-même : on entend le mix de chaque état
comme le joueur l'entendra, et on coupe ou isole des stems, sans rien écrire.

<a name="what-you-get"></a>

## Ce que vous obtenez

Une partition écoutée état par état, à la mesure où le jeu en changerait, avec la mesure et le temps affichés pendant
la lecture ; et la liste des musiques et des sons que déclare le jeu, avec ceux qui manquent encore.

<a name="context-and-versions"></a>

## Contexte et versions

Le Studio local (dépôt du moteur ou projet créé) et le Studio de démo. Vrai depuis la 4.2.1. Comment s'écrivent
partitions, états et stems : [La musique en stems](create.music.md).

<a name="prerequisites"></a>

## Prérequis

- Le Studio lancé ([présentation](studio.overview.md)).
- Un jeu avec des partitions (`audio.scores` dans `game.ts`) et leurs fichiers préparés (`npm run assets`).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le navigateur, sur l'onglet Music.

<a name="steps"></a>

## Étapes

<!-- step: pick -->
1. Choisissez une partition et jouez-la.

<!-- step: states -->
2. Choisissez un état : son mix s'entend à la mesure suivante, comme dans le jeu.

<!-- step: stems -->
3. Coupez ou isolez un stem à la main pour entendre ce que chacun apporte. La mesure et le temps montrent où en est la
   musique.

> [!LIMIT id=music-read-only]
> Rien n'est écrit : les états d'une partition sont du contenu dans `game.ts` (`audio.scores`), modifié avec le reste
> du jeu.

<a name="audio-tools"></a>

### Musiques et sons dans le Studio et les outils

L'onglet Assets liste les ids de musique et de son que déclare le jeu et, pour chacun, si un fichier existe, avec un
lecteur par fichier ([Assets et découpe](studio.assets.md)) ; `npm run assets` livre ce qui est là et signale ce qui
manque. L'outil MCP `read_doc` sert la page de la chaîne audio sous le nom `AUDIO` ([Outils MCP](studio.mcp-tools.md)).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Changer d'état change le mix à la mesure suivante ; les stems coupés se taisent.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Que faire |
|---|---|---|
| Une partition reste muette | Ses fichiers ne sont pas préparés | `npm run assets`, puis recharger |
| Un id de son n'a pas de fichier dans l'onglet Assets | Il est déclaré mais pas encore fait | L'ajouter ([Effets sonores](create.sound-effects.md)) |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Aucun.

<a name="references"></a>

## Références

- [`src/studio/music.ts`](../../src/studio/music.ts) (par le directeur du jeu, `src/engine/dom/director.ts`).
- [La musique en stems](create.music.md#tools), [Chaîne d'outils audio](install.audio-toolchain.md).
