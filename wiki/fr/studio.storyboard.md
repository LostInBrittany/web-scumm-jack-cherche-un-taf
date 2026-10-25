# Storyboard

L'onglet Storyboard modifie `storyboard.json`, le scénario du jeu, tableau par tableau et case par case, montre chaque
case comme le jeu la mettrait en scène, et dit ce que le jeu en fait déjà.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un `games/<id>/storyboard.json` écrit par le Studio, chaque case prévisualisée comme une vignette, un badge de
couverture sur chaque tableau et chaque case, et, si vous le voulez, un `storyboard.md` à lire ou à partager.

<a name="context-and-versions"></a>

## Contexte et versions

Le Studio local, dans le dépôt du moteur ou un projet créé ; le Studio de démo aussi (ses modifications restent dans
le navigateur). Vrai depuis la 4.2.1. Pourquoi le storyboard fait foi, et son lien avec le contenu :
[Le storyboard, source de vérité](create.storyboard.md).

<a name="prerequisites"></a>

## Prérequis

- Le Studio lancé ([présentation](studio.overview.md)).
- Pas encore de `storyboard.json` : aucun souci, l'onglet part de `{ boards: [] }`. Le schéma est
  [`tools/pages/storyboard-schema.md`](../../tools/pages/storyboard-schema.md).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le navigateur, sur l'onglet Storyboard du Studio. L'export facultatif en ligne de commande se lance dans le dépôt
du moteur.

<a name="steps"></a>

## Étapes

<!-- step: boards -->
1. **Les tableaux.** À gauche, les tableaux (titre, lieu, objectif), avec monter, descendre, ajouter et supprimer.

<!-- step: board -->
2. **Le tableau sélectionné**, au milieu : titre, id, lieu (« Open in Rooms » bascule sur ce lieu), objectif, sortie,
   ses lignes d'**arrivée**, puis ses **cases** en cartes dans l'ordre de jeu. Une case a un titre, un id, l'**action**
   du joueur qui la déclenche, et des **répliques** avec un choix de locuteur (les personnages du jeu, `hero`,
   `action`, `stage`) et des puces **sfx** tirées de `audio.sfx` du jeu. Par réplique : déplacer, supprimer,
   « + line ». Par carte : déplacer, dupliquer, supprimer. Puis les **indices** du tableau (dans l'ordre), les
   **sujets de conversation** par personnage (sujet et répliques) et les **réactions** facultatives (action et
   répliques).

<!-- step: preview -->
3. **La vignette**, à droite : la case sélectionnée composée comme une vignette de storyboard, avec le décor du lieu,
   les portraits des locuteurs de la case (celui qui parle en surbrillance), la réplique courante dans le style de
   parole du jeu (couleur du locuteur ; parcourir les répliques, ou cliquer sur l'une dans le script ci-dessous),
   l'action présentée comme la phrase du jeu, et les sfx. En dessous, les notes sur cette case (`about` = l'id de la
   case) et une zone pour en ajouter une ([Notes](studio.notes.md)).

<!-- step: save -->
4. **Enregistrer.** Chaque modification reste en mémoire jusqu'à ce que **Save** (ou Ctrl/Cmd+S quand l'onglet est
   affiché) écrive le document entier. « ● Unsaved changes » s'affiche jusque-là, et quitter la page le demande
   d'abord. Save refuse les ids de case vides ou en double, parce que les notes s'y accrochent. Un storyboard inchangé
   n'est pas réécrit ; un storyboard modifié est écrit de façon compacte (ce qui tient sur 120 colonnes reste sur une
   ligne).

<!-- step: coverage -->
5. **Lire la couverture.** Après chaque chargement et enregistrement, le storyboard enregistré est confronté au
   contenu ([`src/engine/tools/coverage.ts`](../../src/engine/tools/coverage.ts)) : un badge sur chaque tableau et
   chaque case, **✓** tout est dans le jeu, **~** en partie, **✗** quelque chose manque, **?** de la prose. Sous une
   case, la liste de ce qui n'y est pas encore : une action à laquelle aucune règle ne répond, une réplique que le jeu
   ne dit pas, un son absent de `audio.sfx`. La barre montre le score global. La même vérification est dans l'onglet
   Check (« Storyboard coverage ») et c'est l'outil MCP `storyboard_coverage`.

<!-- step: export -->
6. **Export Markdown** écrit `games/<id>/storyboard.md` à partir du fichier enregistré ; il propose d'enregistrer
   d'abord. Le même texte s'obtient en ligne de commande :

   ```sh
   # dans le dépôt du moteur
   npm run page:storyboard -- --md
   ```

> [!LIMIT id=whole-document-save]
> Save écrit le document entier. Quand `storyboard.json` change sur le disque (une IA, un éditeur, git), un bandeau
> propose de recharger ; avec des modifications non enregistrées, il prévient qu'enregistrer écraserait ce changement.
> Rechargez d'abord si vous voulez le garder.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

« ● Unsaved changes » disparaît après Save ; `git diff games/<id>/storyboard.json` montre votre changement ; les badges
passent à ✓ à mesure que le contenu rattrape le scénario.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Que faire |
|---|---|---|
| Save refusé : un id de case est vide ou en double | Les notes s'accrochent aux ids de case | Donner à chaque case un id unique |
| Un bandeau dit que le fichier a changé sur le disque | Une IA, un éditeur ou git l'a écrit | Recharger, ou enregistrer par-dessus en connaissance de cause |
| Export Markdown répond 404 | Aucun `storyboard.json` enregistré | Enregistrer d'abord |
| ✗ sous une case | Le jeu ne le fait pas encore | Écrire la règle, la réplique ou le son qu'elle nomme |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`games/<id>/storyboard.json` ; `games/<id>/storyboard.md` à l'export ; `games/<id>/notes.json` pour les notes des
cases.

<a name="recovery"></a>

## Revenir en arrière

Undo dans l'en-tête ne couvre pas le storyboard (ni les notes) : un Save est une opération du journal, mais pas une
opération annulable. Revenez en arrière avec git : `git checkout -- games/<id>/storyboard.json`.

<a name="references"></a>

## Références

- [`src/studio/storyboard.ts`](../../src/studio/storyboard.ts), [`src/studio/storyboard-model.ts`](../../src/studio/storyboard-model.ts),
  [`tools/pages/storyboard-data.ts`](../../tools/pages/storyboard-data.ts) (schéma, normalisation et export Markdown,
  partagés par le générateur de pages, le cœur et l'interface).
- [Le storyboard, source de vérité](create.storyboard.md), [Vérifier](studio.check.md).
