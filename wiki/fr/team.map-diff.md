# Carte et diff sémantique

Deux outils aident une équipe à voir le jeu dans son ensemble sur un Studio d'équipe : l'onglet **Map**, où l'équipe
range ce que le jeu nomme en chapitres, énigmes et personnages, et **Changes between revisions** dans l'onglet Check,
qui dit ce qui a changé entre deux révisions avec les noms qu'emploie le jeu, pas ligne par ligne.

<a name="what-you-get"></a>

## Ce que vous obtenez

- Une carte partagée du scénario : chaque chapitre, énigme ou personnage avec les salles, objets, règles et objectifs
  qu'il couvre, l'endroit où chacun est écrit (`fichier:ligne`), et ce qu'aucun regroupement ne couvre encore.
- Pour deux révisions quelconques (ou deux builds publiés), la liste de ce qui a été ajouté, retiré ou modifié,
  fichier par fichier.

<a name="context-and-versions"></a>

## Contexte et versions

Depuis la 4.2.3, sur un Studio hébergé, et aussi sur le Studio local (les mêmes routes ; voir [Carte](studio.map.md)
et [Diff sémantique](studio.semantic-diff.md) pour le côté local). Les captures avant/après des salles (4.4.0) sont
réservées au Studio local.

<a name="prerequisites"></a>

## Prérequis

- Tout rôle lit la carte et le diff ; modifier les regroupements revient à un dev (voir
  [Rôles et actions](team.roles.md)).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le Studio : l'onglet **Map**, et le panneau **Changes between revisions** de l'onglet **Check**. Ou par l'API.

<a name="steps"></a>

## Étapes

<!-- step: open-map -->
1. **Ouvrez l'onglet Map.** Chaque regroupement (`chapter`, `puzzle`, `character`) liste ses références, chacune avec
   le `fichier:ligne` qui l'écrit, ou **not declared** quand le jeu ne la connaît pas (une faute de frappe, un
   identifiant écrit par du code, quelque chose de supprimé). En dessous, ce qu'aucun regroupement ne nomme encore, par
   sorte : salles, personnages, objets, objectifs, points de passage.

<!-- step: edit-grouping -->
2. **Ajoutez ou modifiez un regroupement** (un dev). Donnez-lui un identifiant (minuscules, chiffres et `-`), une
   sorte, un titre (1 à 200 caractères) et ses références : l'identifiant d'une salle, d'une règle, d'un sujet ou d'un
   écouteur, `item:<id>`, `char:<id>`, `<salle>.<entité>`, `objective:<id>`, `checkpoint:<id>`. Enregistrer n'écrit
   que `groupings.json`, dans son propre pan (`groupings`) : un regroupement ne modifie jamais ce qu'il nomme. C'est un
   document entier : si quelqu'un a enregistré les regroupements depuis votre lecture, le Studio propose de remplacer
   les siens par les vôtres, et le dit ([409](team.write-refused-409.md)).

<!-- step: compare -->
3. **Comparez deux révisions.** Dans **Check**, sous **Changes between revisions**, tapez les deux numéros de révision
   (de, puis à) et cliquez sur **Show the changes**. Pour chaque fichier, il liste les identifiants qu'une source a
   ajoutés, retirés ou modifiés (avec les champs qui ont changé), les valeurs d'un JSON ajoutées, retirées ou
   modifiées, ou « file changed » quand il ne peut pas en dire plus. « Nothing changed between them. » quand rien n'a
   changé.

<!-- step: compare-builds -->
4. **Comparez deux builds.** Un build publié est une révision : comparez les révisions des deux builds (le panneau
   **Published builds** de l'onglet Play donne la révision de chaque build).

Par l'API :

| Route | Fait |
|---|---|
| `GET /api/map` | la carte, dérivée du jeu et des regroupements à chaque lecture, jamais stockée |
| `GET /api/groupings`, `PUT /api/groupings` `{groupings: [{id, kind, title, refs}]}` | le fichier des regroupements (un dev l'écrit) |
| `GET /api/diff/<de>..<à>` | `{from, to, files: [{path, change, ids?, values?, opaque?}], cut?}` |

<a name="limits"></a>

## Limites

> [!LIMIT id=diff-bounds]
> Le diff couvre 2 000 révisions et 500 fichiers au plus (`cut: true`, « … and more files (cut at 500) ») ; `to` ne
> doit pas dépasser la tête (404). Le dossier `private/` du jeu est laissé de côté, puisqu'un reviewer lit le diff. Un
> fichier de plus de 1 Mio, ou qui n'est pas du texte, donne « file changed ». Sur un Studio hébergé, les captures
> avant/après des salles (4.4.0) ne sont pas disponibles (501, « a hosted Studio has no browser to draw them ») :
> faites le même diff sur un Studio local.

> [!LIMIT id=map-bounds]
> 500 regroupements au plus, 500 références chacun. Le titre d'un regroupement refuse les caractères de contrôle et les
> inversions bidirectionnelles. La carte est une déclaration de l'équipe : elle ne prouve rien sur le jeu, et une
> référence « not declared » est dite, jamais devinée.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

L'onglet Map montre votre regroupement à tout le monde aussitôt ; `GET /api/map` le renvoie avec ses références
résolues. Le diff liste les fichiers écrits par vos révisions.

<a name="common-errors"></a>

## Erreurs courantes

| Symptôme | Cause | Correction |
|---|---|---|
| `two revisions, as numbers` | Un champ vide ou qui n'est pas un nombre | Tapez deux numéros de révision |
| `from and to are revisions, from ≤ to` (400) | L'ordre est inversé | Mettez la plus ancienne d'abord |
| `2,000 revisions at most between from and to` (400) | Un écart trop grand | Découpez-le |
| `no revision <n> yet` (404) | Au-delà de la tête | Prenez la révision de l'en-tête |
| Une référence affiche **not declared** | Une faute de frappe, un identifiant supprimé, ou un identifiant fait par du code que le jeu ne déclare pas | Corrigez la référence, ou le jeu |
| « groupings.json holds entries the Studio cannot read » | Le fichier a été modifié à la main avec des entrées qu'il refuse | Enregistrer ne garde que les entrées lisibles ; sinon corrigez le fichier |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Seulement `groupings.json` (pan `groupings`), en une opération. Le diff et la carte n'écrivent rien.

<a name="recovery"></a>

## Revenir en arrière

Annulez l'enregistrement des regroupements comme toute opération à vous (voir
[Travailler ensemble](team.day-to-day.md#steps)).

<a name="references"></a>

## Références

- [`tools/studio/scenario-map.ts`](../../tools/studio/scenario-map.ts), [`tools/studio/semantic-diff.ts`](../../tools/studio/semantic-diff.ts).
- [`src/studio/map-tab.ts`](../../src/studio/map-tab.ts), [`src/studio/diff-panel.ts`](../../src/studio/diff-panel.ts).
