# Un objet est visible mais inaccessible

Vous voyez une chose dans la salle, mais la toucher ne fait rien, en choisit une autre, ou le héros s'arrête avant
elle. Cette page part de ce que vous voyez pour remonter à la cause, dans la géométrie (`layout/<salle>.json`) ou dans
le contenu de la salle.

<a name="symptom"></a>

## Symptôme

L'un de ceux-ci, dans le jeu ou dans la vue de jeu du Studio :

- **Le tap mène au sol.** La ligne de phrase affiche le libellé de marche (« Walk to » dans le modèle) sans aucun nom
  (à la souris, le survol n'affiche pas de nom non plus), et le héros marche là où vous avez touché, comme sur un sol
  vide.
- **Le tap nomme autre chose.** La ligne de phrase affiche un autre nom (le placard au lieu de la clé qu'il contient).
- **Le héros s'arrête avant.** La chose est nommée, le héros marche, mais s'arrête loin d'elle, ou de l'autre côté
  d'un mur, puis agit ou parle de là.
- **Le héros s'arrête et dit une réplique** comme « Le portail est fermé. » en chemin : un lien de marche fermé.
- **La chose est au-delà du bord** : dans une salle large, la caméra ne la montre jamais, ou le héros ne peut pas
  aller aussi loin.

<a name="causes"></a>

## Causes possibles

**Ce n'est pas une cible.** Un tap n'atteint que les zones cliquables de la salle, ses accessoires qui ont un `name`,
ses acteurs sans `interactive: false`, et les autres personnages jouables qui s'y trouvent, chacun seulement tant
qu'il est visible ([ce que touche un tap](create.geometry.md#hit-test)). Donc :

1. La chose est **peinte dans le décor** et aucune zone cliquable ne la couvre. Une peinture ne se clique pas.
2. C'est un **accessoire sans `name`** : du décor, voulu comme tel.
3. C'est une **zone cliquable sans forme** : ni `rect` ni `poly` dans le layout (`validate` dit
   `no zone in the layout (rect or poly)`), ou la salle n'a pas de layout du tout
   (`no layout: nothing will be clickable`).
4. Sa **condition `visible` est fausse** : une zone ou un accessoire caché n'est pas une cible. Une zone cliquable
   n'est dessinée par rien, si bien que le décor montre toujours la chose pendant que la zone est cachée.
5. C'est un **acteur en `interactive: false`** (un décor vivant), ou un **personnage mobile** qui est maintenant dans
   une autre salle (`moveActor`) : son acteur ne se montre que dans la salle où il est.

**Une cible plus petite l'emporte.** Quand plusieurs cibles contiennent le tap, la plus petite boîte gagne. Une
petite zone dessinée dans l'image d'un accessoire, ou un petit accessoire sur un grand, prend le tap à cet endroit.

**Le point d'approche est hors d'atteinte.** Avant d'agir, le héros marche jusqu'au point d'approche de la chose
([points d'approche](create.geometry.md#approach)) :

6. Le point d'approche est **hors de la zone de marche ou dans un trou** : la marche va au point le plus proche à
   l'intérieur, et l'action continue de là (de loin, ou du mauvais côté d'un comptoir).
7. Il n'y a **pas de point d'approche**, et celui qui est calculé tombe mal : pour un accessoire, 12 unités sous ses
   pieds (jamais sous `floor`, 395 par défaut) ; pour une zone cliquable, sous le milieu de sa forme. Une zone haute
   sur un mur reçoit un point dans le vide, ramené ensuite au bord du sol.
8. Un accessoire ou un acteur a **bougé** de plus de 150 unités par rapport à son point d'approche enregistré
   (`NEAR`) : l'ancien point est ignoré et un nouveau calculé.

**Un sol est fermé ou manquant** (salles à `walkZones`) :

9. La chose se trouve dans une zone derrière un **lien de marche fermé** (`stage.links.<id>.if` faux) : le héros va
   au pied du lien et dit sa réplique `locked`. Si la règle de la salle sur cette chose ne teste pas la même condition,
   l'action s'exécute ensuite du mauvais côté.
10. Aucun lien ne rejoint sa zone, ou un lien à sens unique va dans le mauvais sens (`validate` refuse une zone à
    laquelle rien ne mène).

**La salle est plus large que dessinée** :

11. La chose, sa forme ou une entrée est **au-delà de la `width` du layout** (`validate` prévient
    `… is beyond the room's width`), ou la salle fait plus de 640 de large mais son layout n'a pas de `width`.

> [!LIMIT id=not-presentation]
> Un calque dessiné devant une chose (`foreground`) ou un masque n'empêche jamais de la toucher : ils ne changent que
> ce que l'on voit. Si le tap atteint la chose et que la règle ne répond toujours pas, la cause n'est pas ici : voir les
> cas voisins plus bas.

<a name="diagnosis"></a>

## Diagnostic

<!-- step: dev-overlay -->
1. Ouvrez la salle avec la géométrie dessinée par-dessus : `/?dev&at=<point>` sur le serveur de développement (dans le
   projet créé ou dans le dépôt du moteur : `npm run dev`). La zone de marche est en vert, ses trous en rouge, les zones
   cliquables en bleu, les accessoires en violet, les acteurs en vert, les liens de marche en jaune ; un point
   d'approche est une pastille, **pleine** quand le layout le donne, **creuse** quand le moteur le calcule. Une zone ou
   un accessoire caché n'est pas dessiné. La touche D affiche ou masque la couche.
   - Pas de zone bleue ni de boîte violette sur la chose : causes 1 à 5.
   - Une zone plus petite à l'intérieur : la plus petite gagne.
   - La pastille d'approche hors de la zone verte, dans le rouge, ou loin de la chose : causes 6 à 8.

<!-- step: sentence-line -->
2. Touchez la chose sans verbe choisi (ou survolez-la à la souris) : la ligne de phrase affiche le libellé de marche
   et le nom de la cible atteinte, ou aucun nom.

<!-- step: validate -->
3. Lancez les vérifications :

   ```sh
   # dans le dépôt du moteur
   npm run validate
   npm run lint
   ```

   ```sh
   # dans le projet créé
   npx quest-n-click validate
   npx quest-n-click lint
   ```

   Cherchez `no zone in the layout`, `no position in the layout`, `no layout`, `is beyond the room's width`,
   `walk zone "…" cannot be reached`, `no walk link (portal) joins walk zone`, et le code de lint `walk-link-gate`.

<!-- step: read-content -->
4. Dans `rooms/<salle>.ts`, relisez la déclaration de la chose : est-ce une zone cliquable ou un accessoire avec un
   `name`, que vaut son `visible`, l'acteur est-il en `interactive: false` ? Pour un personnage mobile, le panneau DEV
   montre où il se trouve.

<a name="fix"></a>

## Correction

<!-- step: add-target -->
1. **Pas une cible** : donnez une zone cliquable à la chose peinte (déclarez-la dans la salle avec un `name`, puis
   tracez sa forme dans `/?edit=<salle>` ou dans l'onglet Rooms du Studio, et enregistrez) ; donnez un `name` à
   l'accessoire ; corrigez sa condition `visible` ; retirez `interactive: false`.

<!-- step: move-approach -->
2. **Approche** : dans `/?edit=<salle>`, faites glisser le point d'approche de la chose dans la zone verte, hors des
   trous rouges, à côté de la chose. Le point devient une pastille pleine et s'écrit dans `layout/<salle>.json`.
   Élargissez la zone de marche si la chose doit pouvoir être atteinte d'où elle se trouve.

<!-- step: smaller-wins -->
3. **Une plus petite l'emporte** : réduisez ou déplacez la zone intérieure, ou faites de la chose intérieure une cible
   à part, avec sa propre règle ; un polygone (`poly`) épouse mieux une forme qu'un rectangle.

<!-- step: walk-link -->
4. **Lien fermé** : quand c'est l'énigme, ajoutez la condition du lien au `if` de la règle sur la chose qui est
   derrière (ce que demande `walk-link-gate`). Quand la zone n'est simplement reliée à rien, ajoutez un lien de marche
   dans l'éditeur.

<!-- step: width -->
5. **Largeur** : posez la `width` du layout à la largeur logique du décor, ou ramenez la chose à l'intérieur.

Ne corrigez jamais une position en tapant des coordonnées dans le fichier de layout : l'éditeur l'écrit, et une
retouche à la main est perdue au prochain enregistrement ([géométrie](create.geometry.md#placement)).

<a name="check-fixed"></a>

## Comment vérifier que c'est réglé

- Dans `/?dev`, la chose a sa forme ou sa boîte, et sa pastille d'approche est dans la zone verte.
- Un tap la nomme sur la ligne de phrase ; le héros marche jusqu'à elle, se tourne vers elle, et la règle répond.
- `validate` et `lint` n'affichent plus aucun des messages ci-dessus.

<a name="neighbours"></a>

## Cas voisins

- **Le héros l'atteint mais la réponse est une réponse de repli** (« Je ne peux pas faire ça ») : le tap et la marche
  fonctionnent ; aucune règle écrite ne correspond. Vérifiez le verbe de la règle, ses `a`/`b` et sa condition
  ([réactions](create.reactions.md), [conditions](create.conditions.md)) ; `npm run lint` signale une règle qui ne
  peut jamais s'exécuter (`rule-never-run`) ou qu'une règle précédente masque (`rule-shadowed`).
- **C'est la salle elle-même qu'on ne peut pas atteindre** : `validate` prévient
  `no exit, goto or map place leads to this room from the start` ([sorties](create.exits.md),
  [carte du monde](create.world-map.md)).
- **L'objet ne peut plus être utilisé** : un objet d'inventaire grisé a été marqué `used`
  ([objets](create.items.md#used)).
- **Le héros traverse les meubles en ligne droite** : la salle n'a pas de zone `walk`, ou il manque des trous
  ([la zone de marche](create.geometry.md#walk-area)).
