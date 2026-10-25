# Géométrie : placement, zones de marche, masques, calques, caméra

Où sont les choses dans une salle, et ce qu'en fait le moteur : le fichier de layout, la zone de marche, les points
d'approche, ce que touche un tap, la caméra d'une salle large, et les sols, calques et masques de la scène. La logique
de la salle (ce qui s'y passe) est dans `rooms/<salle>.ts` ; tout ce que décrit cette page est dans
`layout/<salle>.json`.

<a name="placement"></a>

## Placement : écrit par l'éditeur, jamais tapé

Chaque salle a un layout, `layout/<salle>.json`, écrit par l'éditeur de placement (`/?edit=<salle>` sur le serveur de
développement) ou par l'onglet Rooms du Studio ([placement et scène dans le Studio](studio.placement.md)). Vous faites
glisser les choses sur l'image ; l'éditeur enregistre le fichier. Vous ne tapez jamais de coordonnées à la main, sauf
pour un déplacement scripté ponctuel (`{ walk: [300, 350] }`, `{ place: … }`).

- **Coordonnées logiques.** Un écran mesure 640 × 400, origine en haut à gauche, quel que soit l'appareil. Un
  personnage et un accessoire se placent par les pieds (le milieu du bas).
- **Une salle sans layout** n'a rien de cliquable : `npm run validate` prévient `no layout: nothing will be clickable`.
  Un accessoire ou un acteur non placé est une erreur (`no position in the layout`), de même qu'une zone cliquable sans
  forme (`no zone in the layout (rect or poly)`).
- **Placé mais pas déclaré** : une forme ou une position dont la salle ne déclare pas l'id donne un avertissement
  (`zone "x" has no hotspot in the room`, `position "x" has no prop in the room`).
- `/?edit=<salle>&at=<point>` ouvre l'éditeur dans l'état d'un point de reprise, pour placer un accessoire dans un
  état donné.

<a name="layout-file"></a>

## Le fichier de layout

| Champ | Contenu | Par défaut |
|---|---|---|
| `width` | la largeur de la salle en unités logiques ; au-delà de 640, la salle défile ([caméra](#camera)) | 640 |
| `floor` | le bas du sol (y logique) : un point d'approche calculé ne descend jamais plus bas | 395 (`FLOOR`) |
| `walk` | la zone de marche : `{ area: [[x, y], …], holes?: [[[x, y], …], …] }` (un polygone extérieur, des trous pour les meubles) | aucune : on marche en ligne droite |
| `scale` | l'échelle des personnages selon la profondeur : `[[y du fond, échelle], [y de devant, échelle]]` | 1 |
| `entries` | les points d'entrée du héros, au moins `default` | `default` en [320, 360] |
| `hotspots.<id>` | `rect: [x, y, w, h]` ou `poly: [[x, y], …]`, `approach`, `face` | |
| `props.<id>` | `x`, `y` (les pieds), `h` (la hauteur), `z`, `on`, `flip`, `flipV`, `rot`, `approach`, `states.<état>` | |
| `actors.<id>` | `x`, `y`, `h`, `z`, `flip`, `approach` | |
| `walkZones`, `walkLinks`, `layers`, `occluders`, `lights`, `emitters` | la scène ([ci-dessous](#layers-and-masks)) | |

Champs lus par le moteur en plus des positions :

- Sur un accessoire (et dans chacun de ses `states`) : `rot` (degrés, sens horaire, pivot aux pieds), `flip` (miroir
  horizontal), `flipV` (miroir vertical : l'image passe sous la ligne des pieds, comme sur la page de placement), `z`
  (ligne de profondeur forcée). Un champ absent d'un état reprend celui de l'accessoire. `on: true` dit que
  l'accessoire est posé sur un meuble.
- Sur un acteur : `z` force sa profondeur (sinon elle suit ses pieds) ; `flip` le tourne vers la gauche, sauf si le
  `facing` que le lieu lui donne (ou celui qu'un script a laissé) dit autre chose. La case **mirror ↔** de l'éditeur de
  placement le règle : [Placement](studio.placement.md#placement-editor).
- Sur la salle : `floor`.

<a name="approach"></a>

## Points d'approche et distance à un personnage

Avant d'agir sur quelque chose de la salle, le héros marche jusqu'à son point d'approche, puis se tourne vers lui (et
un personnage sur qui il agit se tourne vers lui). Ce point est, dans l'ordre
([`src/engine/core/world-queries.ts`](../../src/engine/core/world-queries.ts)) :

1. l'`approach` que donne le layout (toujours pour une zone cliquable ; pour un accessoire ou un acteur, seulement s'il
   est à moins de 150 unités de la chose, `NEAR` : plus loin, il date d'avant un déplacement et il est recalculé) ;
2. pour un accessoire : sous ses pieds, 12 unités plus bas, jamais sous `floor` ;
3. pour un acteur : à côté de lui, du côté qui regarde le milieu de la salle, à 44 unités quelle que soit sa taille ;
   avec `actorGap` sur le jeu (4.2.4 ; par exemple `0.8`), à cette part de la taille moyenne des deux personnages
   (`height` du héros et du personnage, ou le `h` de l'acteur dans le layout), multipliée par l'échelle de profondeur
   là où se tient le personnage ;
4. pour une zone cliquable : sous le milieu de son rectangle ou de son polygone, 12 unités plus bas, jamais sous
   `floor`.

De grands personnages qui gesticulent en parlant finissent, à 44 unités, avec une main dans la tête de l'autre : c'est
à ça que sert `actorGap`. Un `approach` du layout l'emporte toujours, pour un personnage qu'il faut aborder de l'autre
côté. `actorGap` n'est que de la présentation, comme les points d'approche : aucune règle ni le solveur ne le lisent.

<a name="walk-area"></a>

## La zone de marche

La zone de marche est triangulée une fois (earcut), puis le chemin entre deux points est le plus court chemin du
navmesh, redressé là où le raccourci reste dedans ([`src/engine/dom/walk.ts`](../../src/engine/dom/walk.ts)). Une
cible hors de la zone est remplacée par **le point le plus proche à l'intérieur** : le héros va aussi près que
possible, puis l'action continue de là. Une salle sans `walk` se parcourt en ligne droite, partout.

`scale` règle la taille d'un personnage selon la profondeur de ses pieds : dans le modèle, 0,8 à y 250 et 1 à y 396.
Les tailles des personnages sont en unités logiques (dans la démo, Pixel mesure 36, Grand-mère 120).

<a name="hit-test"></a>

## Ce que touche un tap

Le moteur calcule, à chaque image, les cibles de la salle et leurs boîtes
([`src/engine/scene/frame.ts`](../../src/engine/scene/frame.ts)) :

- les cibles sont les zones cliquables de la salle, ses accessoires **qui ont un `name`**, ses acteurs sans
  `interactive: false`, et les autres personnages jouables qui s'y trouvent, chacun seulement tant qu'il est visible ;
- la boîte d'une cible est celle de l'image dessinée (rotation comprise) quand elle en montre une, sinon le rectangle
  du layout, sinon l'encombrement de son polygone ; une cible qui n'a rien de tout cela n'est pas dans l'image : rien à
  toucher ;
- une zone cliquable qui a un `poly` est testée sur son polygone, tout le reste sur sa boîte (bords compris) ;
- quand plusieurs cibles contiennent le tap, **la plus petite gagne** (par l'aire de sa boîte). Aucune cible : le tap
  est une marche vers ce point du sol.

Les calques et les masques de la scène ne sont pas des cibles : un calque de premier plan dessiné par-dessus un
accessoire n'empêche pas de le toucher.

<a name="camera"></a>
<!-- applies: .. since 3.4.0 -->

## Salles larges et caméra

Une salle mesure 640 × 400 unités logiques. Donnez à son layout une `width` (par exemple 960 ou 1280 : dans le dossier
« Room width » de l'éditeur, ou dans `layout/<salle>.json`) et peignez son décor aussi large (800 px de haut, la
largeur en proportion ; `npm run assets` la garde) : la salle défile, et la caméra suit le héros. Les positions restent
en coordonnées du monde (un accessoire en x 900 est dans la partie droite). `validate` refuse une `width` sous 640 et
signale une forme, un accessoire ou une entrée au-delà.

| Commande | Effet |
|---|---|
| `{ camera: { to: 'far_stalls', ms: 900 } }` | Panoramique pour centrer quelque chose (un acteur, un accessoire, une zone), puis rester là. |
| `{ camera: { pan: 320, ms: 600 } }` | Panoramique vers un bord gauche, en unités logiques (borné à la salle). |
| `{ camera: 'follow' }` (ou `'reset'`) | Suivre de nouveau le héros. Entrer dans une salle suit toujours le héros. |

La caméra fait partie de l'état (une sauvegarde la restaure), le solveur l'ignore, et « réduire les animations » rend
chaque panoramique instantané. Une commande de caméra dans une salle de 640 de large ne fait rien (`validate`
prévient). Les animations et le reste de la mise en scène : [mise en scène](create.staging.md).

<a name="layers-and-masks"></a>
<!-- applies: .. since 3.4.0 -->

## Sols, calques et masques (la scène)

Une salle peut montrer plus que son décor. Le contenu dit ce qui existe et quand (`stage` dans la salle : calques,
lumières, particules, logique des liens de marche) ; le layout dit où ; le peintre dessine. Le côté contenu, les
lumières et les particules sont dans [la scène](create.stage.md). La géométrie, c'est :

- `walkZones.<id> { area, holes?, scale?, zoom?, elevation? }` : plusieurs sols. Elles **remplacent** `walk`
  (`validate` prévient si les deux sont donnés). Chaque zone met les personnages à l'échelle selon sa propre ligne de
  profondeur (`scale`) et peut zoomer la caméra (`zoom`, de 1 à 2 : un balcon vu de plus près) ; une caméra zoomée
  monte et descend aussi pour garder le héros dans le cadre. Là où des zones se chevauchent, celle dont l'`elevation`
  est la plus haute prend le point.
- `walkLinks.<id> { from: { zone, at }, to: { zone, at }, mode, anim?, ms?, facing?, oneWay? }` : comment passer d'une
  zone à l'autre ; `mode` vaut `walk`, `stairs`, `ladder`, `jump` ou `teleport`. Un chemin entre zones prend le moins de
  liens possible. Chaque zone doit être reliée à une autre, et atteignable depuis la zone de l'entrée `default`, tous
  liens ouverts : `validate` refuse une zone à laquelle rien ne mène.
- `layers.<id> { x, y, z, parallax: [x, y], blend, opacity }` : où se tient un calque de la scène. Son rôle (dans le
  contenu) le met derrière tout (`backdrop`), parmi les personnages selon son `z` (`scenery`), devant eux
  (`foreground`), ou au-dessus de tout (`effect`). `parallax` 1 bouge avec la salle, 0,5 deux fois moins vite
  (derrière), 1,2 plus vite (devant).
- `occluders.<id> { polygon | mask | layer, z, feather?, invert? }` : ce qui cache un personnage plus profond que `z`
  (un pilier, un comptoir, un cadre de fenêtre) : un polygone, une image de masque noir et blanc, ou l'alpha d'un calque.
- `lights.<id> { at, radius }` et `emitters.<id> { area: [x, y, w, h] }` : où sont les lumières radiales et les
  particules.

Une ancienne salle est une scène d'un seul décor (`decor`) et d'une seule zone (`walk`, nommée `main`) : rien à
réécrire.

**Un lien fermé.** `stage.links.<id> { if, locked }` dans le contenu ferme un lien tant que sa condition ne tient pas.
Le héros marche jusqu'à son pied, dit sa réplique `locked`, et l'action continue de là. Les règles de ce qui se trouve
derrière doivent donc tester la même condition : `npm run lint` prévient (`walk-link-gate`) quand une règle sur une
cible derrière un lien fermé ne le fait pas. L'énigme, c'est la règle ; le lien ne fait qu'arrêter la marche.

> [!GUARANTEE id=closed-link-stops-walk]
> Un lien de marche fermé n'est jamais franchi : la marche s'arrête à son pied et nomme le lien.

> [!GUARANTEE id=geometry-stage-not-state]
> Les calques et les lumières de la scène ne sont pas un état du jeu : ils ne changent pas ce que voit le solveur. Le
> jeu d'exemple, avec un calque de premier plan et une lumière dans chaque salle, se prouve à l'identique : même
> verdict, même nombre d'états, mêmes softlocks.

> [!LIMIT id=canvas-only-effects]
> Les masques tirés d'images ou de calques, les lumières, les particules et les modes de fusion ne sont dessinés que
> par le peintre Canvas : `renderer: 'canvas'` sur la salle ou sur le jeu. Sur une salle que peint le DOM (le défaut),
> `npm run validate` dit ce qu'il ne dessinera pas.

<a name="debugging"></a>

## Voir la géométrie

`/?dev` dessine la géométrie par-dessus la salle : la zone de marche en vert et ses trous en rouge, les zones
cliquables en bleu, les accessoires en violet (leur boîte et leurs pieds), les acteurs en vert, les points d'entrée en
triangles roses, les lignes d'échelle en orange, les liens de marche en jaune. Un point d'approche est une pastille :
**pleine** quand le layout le donne, **creuse** quand le moteur le calcule. Une zone ou un accessoire caché (sa
condition `visible` fausse) n'est pas dessiné. La touche D masque la couche. Quand une chose est inaccessible,
commencez par [un objet est visible mais inaccessible](create.unreachable.md).

<a name="why"></a>

## Pourquoi la géométrie est à part

La géométrie s'édite à la souris, sur l'image, et change pour d'autres raisons que l'histoire : un nouveau décor
déplace tous les rectangles et aucune règle. La garder dans son propre fichier, c'est qu'un placement ne touche jamais
la logique, que le Studio peut l'écrire sans risque, et que le solveur l'ignore : la marche, la caméra et la scène sont
de la présentation, et ce que prouve le solveur n'en dépend pas ([ce que prouve le solveur](create.solver-proofs.md)).
Le peintre de référence est le DOM, pour l'accessibilité ; Canvas est permis pour les salles qui ont besoin de ses
effets ([ADR 0001](../../docs/dev/adr/0001-dom-renderer.md), [ADR 0011](../../docs/dev/adr/0011-scene-frame-intents-journal.md)).

<a name="related"></a>

## Identifiants liés

- `FLOOR` (395) et `NEAR` (150) dans [`src/engine/core/define.ts`](../../src/engine/core/define.ts) ; `actorGap` dans
  `game.ts`.
- Les types : `Layout`, `StageDef` dans [`src/engine/core/types/stage.ts`](../../src/engine/core/types/stage.ts).
- [Salles](create.rooms.md), [mise en scène](create.staging.md), [la scène](create.stage.md),
  [placement dans le Studio](studio.placement.md).
