# Placement et scène

L'emplacement des choses dans un lieu (zones, pieds, hauteurs, points d'approche, zone marchable, échelle de
profondeur, entrées) et la géométrie de sa scène (calques, masques, zones de marche et leurs liens) se placent à la
souris, jamais à la main dans un fichier.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un lieu dont `layout/<lieu>.json` porte toutes les places dont il a besoin, réglées en glissant dans la vue du moteur
lui-même, et une scène (calques, masques d'occlusion, zones de marche, liens entre elles) que le validateur accepte.

<a name="context-and-versions"></a>

## Contexte et versions

L'éditeur de placement tourne sur n'importe quel serveur de dev : dans l'onglet Rooms du Studio, ou seul à
`?edit=<lieu>` sur le jeu (`npm run dev`). L'éditeur de scène est celui de l'onglet Rooms. Vrai depuis la 4.2.1 (un
layout enregistré est une opération du journal du jeu) ; le réglage `actorGap` ci-dessous depuis la 4.2.4.

<a name="prerequisites"></a>

## Prérequis

- Le Studio lancé ([présentation](studio.overview.md)), ou `npm run dev`.
- Chaque entité déclarée dans le fichier du lieu ([Modifier une salle](studio.edit-room.md)) ; l'éditeur propose une
  place à celles qui manquent au layout.

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le dépôt du moteur ou le projet créé, sur votre machine. L'éditeur lui-même est dans le navigateur.

<a name="steps"></a>

## Étapes

<a name="place-everything"></a>

### Tout placer

La géométrie vit à part de la logique, dans `games/<id>/layout/<lieu>.json`, et ne se tape jamais à la main. Trois
façons :

<!-- step: open-editor -->
1. **Dans le Studio** : l'onglet Rooms montre le lieu avec l'éditeur de placement par-dessus (c'est la page
   `/?edit=<lieu>&at=<checkpoint>` dans une iframe). Ou **dans le jeu seul** : lancez le serveur de dev et ouvrez
   l'éditeur du lieu.

   ```sh
   # dans le dépôt du moteur ou le projet créé
   npm run dev
   # puis ouvrir http://localhost:5173/?edit=<lieu>
   ```

<!-- step: phone-page -->
2. **Sur un téléphone, sans serveur de dev** : publiez une page de glisser-déposer, placez-y les choses, et rapatriez
   le résultat.

   ```sh
   # dans le dépôt du moteur
   npm run page:placement
   npm run import-layout <fichier>
   ```

<!-- step: drag -->
3. Glissez, puis **Save the layout** (les gestes ci-dessous). Dans le Studio, un placement en cours est enregistré
   avant tout autre enregistrement du lieu.

<a name="placement-editor"></a>

### L'éditeur de placement (`?edit=<lieu>`)

Au démarrage, l'éditeur charge le premier checkpoint situé dans ce lieu ; s'il n'y en a pas, il part d'un état neuf,
sans jouer de script d'arrivée. Toutes les coordonnées sont logiques (640 × 400).

| Geste | Effet |
|---|---|
| Glisser une zone | La déplace, avec son point d'approche |
| Glisser un coin | Redimensionne la zone |
| Glisser un point de pied (cercle) | Déplace un accessoire ou un personnage, avec son point d'approche |
| Glisser le carré au-dessus du pied, ou la molette | Règle la hauteur |
| Glisser un petit cercle (plein ou creux) | Place le point d'approche : là où le héros va avant d'agir |
| Glisser un sommet de la zone marchable ou d'un trou | Le déplace |
| Double-clic sur un bord de la zone marchable | Ajoute un sommet |
| Alt-clic sur un sommet | Le supprime ; sur un trou réduit à 3 sommets, supprime le trou |
| Glisser une ligne d'échelle orange | Change sa profondeur (y) ; le facteur se règle dans le panneau |
| Glisser un triangle rose | Déplace un point d'entrée |

Le panneau de l'éditeur :

- **Save the layout** : écrit `games/<GAME>/layout/<lieu>.json`, coordonnées arrondies à l'unité ; la page se
  recharge ensuite avec le fichier enregistré.
- **Reload (undo)** : abandonne les changements non enregistrés.
- **hidden zones** : montre aussi les zones et accessoires dont la condition de visibilité est fausse (en pointillés).
- **Selection** : l'élément touché et ses valeurs. Pour un accessoire ou un personnage, **mirror ↔** le retourne (le
  `flip` du layout) et, pour un accessoire, **mirror ↕** le met à l'envers (`flipV`), comme la page de placement ; le
  lieu est redessiné aussitôt et le changement est enregistré avec le layout. Un accessoire est retourné dans l'état
  affiché quand cet état fixe son propre miroir, sinon sur l'accessoire lui-même. Un personnage dont le lieu fixe
  `facing` le garde : le `facing` du lieu l'emporte sur le `flip` du layout, et le panneau le dit sous la case.
- **To place** : un bouton par zone cliquable, accessoire ou acteur défini dans le lieu mais absent du layout ; il le
  crée au centre, prêt à être déplacé.
- **Walkable zone** : créer la zone, ajouter un trou.
- **Depth scale** : créer l'échelle, régler les facteurs du fond et de l'avant.
- **Entries** : ajouter un point d'entrée par son nom (`default` est celui utilisé par défaut).
- **Room width** : la largeur logique d'un lieu large (640 = pas de défilement) et un curseur de caméra pour regarder
  autour en plaçant.
- Dossier **Walk zones** : fait du polygone de marche unique une zone, ajoute des zones (trous, zoom) et des liens
  entre elles (mode, durée, sens unique).
- Dossier **Stage** : profondeur, parallaxe, fusion et opacité de chaque calque ; occulteurs dessinés en polygones
  (profondeur, adoucissement, inversion) ; lumières et zones de particules placées. Poignées : glisser ; double-clic
  sur un bord de zone pour ajouter un sommet ; Alt-clic pour en retirer un.

Pour un accessoire dont la position dépend de l'état (`states` dans le layout, un tabouret tiré par exemple),
l'éditeur modifie la variante de l'état affiché.

Dans le Studio, l'éditeur tourne dans une iframe et parle à la page par `postMessage` (même origine seulement). Dans
une iframe, son panneau démarre replié. Il envoie des messages `{ source: 'web-scumm-editor', room, type }` : `ready`
(avec `missing`, les entités sans place), `select` (`key` comme `prop:lamp`, `hs:door`, `actor:grandma`, plus `kind`
et `id` pour ces trois-là), `dirty` (changements non enregistrés) et `saved` (`ok`, `error`). Il accepte des messages
`{ source: 'web-scumm-studio', type }` : `select` (`kind`, `id`), `create` (donne une place à une entité que le lieu
déclare mais que le layout n'a pas, éventuellement à `at`) et `save`. Sur le serveur de dev, l'éditeur écrit le
layout par l'API du Studio (`PUT /__studio/api/room/<id>/layout`) ; dans la démo, il le garde en patch
([Mode démo](studio.demo-mode.md)).

<a name="stage-editor"></a>

### L'éditeur de scène : calques, masques, zones

Sous la fiche du lieu de l'onglet Rooms, l'éditeur de scène montre le fond avec les masques d'occlusion (rouges), les
zones de marche (vertes) et les liens entre zones.

<!-- step: stage -->
4. Réglez la profondeur, la parallaxe, l'opacité et la fusion de chaque calque dans ses champs. **Draw a mask** ou
   **Draw a zone**, cliquez ses coins sur le fond, puis **Close the polygon** (un polygone qui ne ferme aucune surface
   n'est pas gardé). **Link them** relie deux zones par un escalier, une échelle, un saut, une téléportation ou une
   marche, placé en deux clics. **Save stage** écrit cette géométrie (`layers`, `occluders`, `walkZones`,
   `walkLinks`) sur le layout du lieu une fois la vue de placement enregistrée.

> [!LIMIT id=stage-save-blocked]
> **Save stage** reste éteint tant qu'un masque ne ferme aucune surface ou qu'une zone n'a pas de lien : le
> validateur refuse les deux aussi ([`src/engine/tools/validate-stage.ts`](../../src/engine/tools/validate-stage.ts)).

<a name="layout-fields"></a>

### Ce que le layout porte en plus des positions

Champs lus par le moteur : sur un accessoire (et dans chacun de ses `states`) `rot` (degrés, sens horaire, pivot aux
pieds), `flip` (miroir horizontal), `flipV` (miroir vertical : l'image passe sous la ligne des pieds, comme sur la page
de placement), `z` (calque forcé) ; un champ absent d'un état reprend celui de l'accessoire. Sur un acteur, `z` force
son calque (sinon, il suit ses pieds) et `flip` le tourne vers la gauche, sauf si le lieu fixe son `facing`. Sur le
lieu, `floor` (395 par défaut) est le bas du sol : un point d'approche calculé ne descend jamais plus bas.

Un acteur sans point `approach` dans le layout est abordé du côté qui fait face au milieu du lieu, à 44 unités quelle
que soit la taille des personnages. Le format complet du layout : [Géométrie](create.geometry.md#layout-file).

<a name="actor-gap"></a>
<!-- applies: 4.2.4.. -->

### Personnages grands : `actorGap`

Des personnages grands qui gesticulent en parlant peuvent finir une main dans la tête de l'autre. Posez `actorGap` sur
le jeu (par exemple `0.8`) : la distance devient cette part de la taille moyenne des deux personnages (`height` du
héros et du personnage, ou `h` de l'acteur dans le layout), multipliée par l'échelle de profondeur là où se tient le
personnage. Un point `approach` dans le layout l'emporte toujours, pour un personnage qu'il faut aborder de l'autre
côté.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Après **Save the layout**, la page se recharge avec le fichier enregistré et l'élément reste où vous l'avez laissé.
`npm run validate` (ou l'onglet Check) ne signale aucune erreur de géométrie, et le solveur atteint toujours la fin.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Que faire |
|---|---|---|
| Une entité manque dans la vue | Elle est déclarée dans le lieu mais n'a pas de place dans le layout | **To place**, puis la glisser |
| **Save stage** est grisé | Un masque ne ferme aucune surface, ou une zone n'a pas de lien | Fermer le polygone, ou relier la zone |
| Quelque chose de visible est inaccessible | Son point d'approche est hors de la zone marchable | [Quelque chose est visible mais inaccessible](create.unreachable.md) |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`games/<id>/layout/<lieu>.json` seulement (dans un projet créé, `game/layout/<lieu>.json`).

<a name="recovery"></a>

## Revenir en arrière

Avant d'enregistrer : **Reload (undo)**. Après : Undo du Studio (un pas par enregistrement), ou
`git checkout -- games/<id>/layout/<lieu>.json`.

<a name="references"></a>

## Références

- [Géométrie : placement, zones de marche, masques, calques, caméra](create.geometry.md), [Paramètres d'URL de dev](reference.dev-url-parameters.md#edit).
- [`src/studio/rooms-stage.ts`](../../src/studio/rooms-stage.ts), [`src/studio/rooms-bridge.ts`](../../src/studio/rooms-bridge.ts).
