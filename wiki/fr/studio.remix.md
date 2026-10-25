# Remix dans le Studio

Pour un jeu doté d'un manifeste Remix, l'onglet Remix montre ses dimensions, prévisualise le monde de n'importe quelle
seed, verrouille des dimensions et retire les autres, compare deux mondes, et mesure couverture et biais sur beaucoup
de seeds, avec le compilateur du moteur lui-même : le Studio ne montre jamais un monde que le joueur ne jouerait pas.

<a name="what-you-get"></a>

## Ce que vous obtenez

Une seed regardée avant les joueurs : la valeur de chaque dimension, l'empreinte du monde, un lien qui le joue, et,
quand quelque chose cloche, un monde figé à exporter pour un rapport de bug.

<a name="context-and-versions"></a>

## Contexte et versions

Le Studio local, dépôt du moteur ou projet créé, depuis la 4.1.15. Ce qu'est Remix et comment s'écrit un manifeste :
[Remix](create.remix.md).

<a name="prerequisites"></a>

## Prérequis

- Le Studio lancé ([présentation](studio.overview.md)).
- Un jeu avec un manifeste Remix. Un manifeste qui ne peut pas faire de monde montre à la place les raisons du
  validateur.

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le navigateur, sur l'onglet Remix.

<a name="steps"></a>

## Étapes

<!-- step: dimensions -->
1. **Lisez les dimensions** : chacune avec ses valeurs, la valeur histoire, et les modes que le jeu propose.

<!-- step: preview -->
2. **Preview** d'une seed tapée, ou **New seed** : la valeur de chaque dimension, l'empreinte du monde, un lien qui joue
   ce monde dans le jeu (`?seed=`, `?world=`), et un monde figé à exporter (**Export**).

<!-- step: lock -->
3. **Lock** sur les dimensions à garder, puis **Reroll the others**.

<!-- step: compare -->
4. **Compare** avec une autre seed. Une dimension d'ordre des énigmes dessine son ordre en graphe.

<!-- step: coverage -->
5. **Coverage and bias** tire beaucoup de seeds et compte combien de fois sort chaque valeur.

<!-- step: anchors -->
6. **Anchors** : les ancres des lieux (lieu, ancre, ce sur quoi elle porte, phase, utilisée par). **Add an anchor from
   the scene's selection** écrit `anchors.<entité>` dans le fichier du lieu de l'entité sélectionnée dans l'onglet
   Rooms, par `set_value` (serveur de dev seulement).

<a name="player-side"></a>

### Ce que voit le joueur

L'écran titre gagne **Remix** (après New game et Continue) : l'histoire, un nouveau monde, une seed tapée ou le défi du
jour ; la page repart dans le monde choisi. Le menu pause montre le code à copier, ou « caché jusqu'à la fin » dans un
mode masqué. Les options d'accessibilité ne touchent jamais la seed. Un lien nomme un monde : `?seed=`, `?daily=`,
`?world=`.

> [!LIMIT id=remix-compiled]
> Chaque monde que montre l'onglet est calculé avec le compilateur du moteur ([`src/studio/remix-model.ts`](../../src/studio/remix-model.ts)).
> L'onglet n'écrit rien dans le jeu sauf une ancre que vous ajoutez ; le manifeste lui-même se modifie dans le code.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Le lien de l'aperçu ouvre le jeu dans ce monde ; **Coverage and bias** ne montre aucune valeur qui ne sort jamais.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Que faire |
|---|---|---|
| Les raisons du validateur à la place d'un monde | Le manifeste ne peut pas faire de monde | Corriger le manifeste ([Remix](create.remix.md)) |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Une ancre ajoutée depuis la sélection est écrite dans `rooms/<lieu>.ts` (`anchors.<entité>`). Les mondes exportés sont
des téléchargements.

<a name="references"></a>

## Références

- [`src/studio/remix-tab.ts`](../../src/studio/remix-tab.ts), [`src/studio/remix-model.ts`](../../src/studio/remix-model.ts).
- [Remix](create.remix.md).
