# La scène : lumières, particules, sols

Un lieu peut montrer plus que son décor : des calques devant et derrière les personnages, des éléments qui cachent un
personnage placé derrière eux, des halos de lumière, de la pluie ou de la poussière, plusieurs sols reliés par des
escaliers, et une transition à l’entrée du lieu. Cette page est la référence du `stage` d’un lieu et des champs du
layout qui le placent.

<a name="stage"></a>

## La scène d’un lieu

Trois parties se partagent le travail :

- **le contenu dit ce qui existe et quand** : `stage` dans le fichier du lieu ;
- **le layout dit où** : `layers`, `occluders`, `walkZones`, `walkLinks`, `lights` et `emitters` dans le layout du
  lieu, écrits par les éditeurs du Studio ;
- **le peintre le dessine**.

Rien sur la scène n’est un état du jeu. Un calque, une lumière ou une particule ne change jamais ce que voit le
solveur, et un lien de marche conditionnel est un chemin, jamais une énigme à lui seul : l’énigme, c’est une règle.
`tests/stage.test.ts` prouve le jeu d’exemple avec une scène sur chaque lieu et retrouve les mêmes états.

```ts
stage: {
  layers: [
    { id: 'ciel', image: 'quai/ciel', role: 'backdrop' },               // derrière tout (sinon `decor` est le fond)
    { id: 'comptoir', image: 'quai/comptoir', role: 'scenery' },        // parmi les personnages, selon le `z` du layout
    { id: 'lanterne', image: 'quai/lanterne', role: 'foreground', visible: 'lanterne_allumee' },  // devant tout le monde
    { id: 'brume', image: 'quai/brume', role: 'effect' },               // au-dessus de tout
  ],
  lights: [{ id: 'lampe', kind: 'radial', color: '#ffd28a', intensity: 0.7, visible: 'lanterne_allumee' }],
  emitters: [{ id: 'embruns', kind: 'rain', rate: 40 }],
  transition: 'fade',                                                    // cut (défaut), fade, wipe
  links: { escalier: { if: 'grille_ouverte', locked: 'La grille est fermée.' } }, // la logique d'un lien de marche
},
```

Un ancien lieu est une scène d’un fond (`decor`) et d’une zone de marche (`walk`, nommée `main`) : rien à réécrire.

> [!GUARANTEE id=stage-not-state]
> Des calques, des lumières et une transition sur chaque lieu du jeu d’exemple ne changent rien à ce que rapporte le
> solveur : le même verdict, le même nombre d’états, le même nombre de blocages.

<a name="stage-content"></a>

## Dans le lieu : `stage`

Les types sont dans [src/engine/core/types/stage.ts](../../src/engine/core/types/stage.ts).

### `layers`

| Champ | Sens |
|---|---|
| `id` | Id stable : sa géométrie est `layout.layers[id]`, et un masque peut être son alpha (`occluders[].layer`). |
| `image` | Un id d’image du manifeste. |
| `role` | `backdrop` derrière tout ; `scenery` parmi les personnages, à la profondeur de son `z` dans le layout ; `foreground` devant eux ; `effect` au-dessus de tout (brume, vignettage). |
| `visible` | Affiché seulement tant que cette condition tient (une fenêtre allumée la nuit, un rideau tiré). |

### `lights`

| Champ | Sens |
|---|---|
| `id` | Sa position est `layout.lights[id]`. |
| `kind` | `radial` : un halo à sa position dans le layout ; `ambient` : une couleur sur tout le lieu. |
| `color` | Une couleur CSS. |
| `intensity` | De 0 à 1, 0,6 par défaut. |
| `blend` | `screen` éclaircit (une lampe), `multiply` assombrit (la nuit, une ombre). Par défaut `screen` pour un halo, `multiply` pour une ambiance. |
| `visible` | Une condition. |

### `emitters`

| Champ | Sens |
|---|---|
| `id` | Sa zone est `layout.emitters[id]`. |
| `kind` | `dust`, `rain`, `snow`, `sparks`, `smoke` ou `leaves`. |
| `image` | Une image de particule (id du manifeste) ; par défaut un petit point de `color`. |
| `color` | La couleur du point. |
| `rate` | Particules par seconde (défaut selon le type). |
| `visible` | Une condition. |

Les particules sont tirées d’une graine : le même lieu dessine les mêmes particules.

### `transition`

Comment le lieu apparaît à l’entrée : `cut` (défaut), `fade` ou `wipe`, ou `{ kind, ms }` pour fixer la durée. Les
animations réduites font de chaque transition une coupe.

### `links`

La logique des liens de marche du layout, par id de lien : `if` (le lien ne se franchit que tant qu’elle tient) et
`locked` (ce que dit le héros quand il l’essaie fermé). Voir [Liens de marche](#walk-links) plus bas.

<a name="stage-layout"></a>

## Dans le layout : où se tient chaque chose

Les éditeurs du Studio les écrivent dans le fichier de layout du lieu ; on ne les tape pas à la main (voir
[Placement et scène](studio.placement.md)).

| Champ du layout | Forme | Ce qu’il place |
|---|---|---|
| `layers.<id>` | `{ x, y, z, parallax: [x, y], blend, opacity }` | Le coin haut gauche d’un calque, sa ligne de profondeur, sa parallaxe par axe (1 suit le lieu, 0,5 deux fois moins vite, derrière ; 1,2 plus vite, devant), son mode de fusion (`normal`, `multiply`, `screen`, `overlay`) et son opacité. |
| `occluders.<id>` | `{ polygon \| mask \| layer, z, feather?, invert? }` | Ce qui cache un personnage plus profond que `z` : un pilier, un comptoir, un cadre de fenêtre. Un polygone, une image de masque noir et blanc, ou l’alpha d’un calque. |
| `walkZones.<id>` | `{ area, holes?, scale?, zoom? }` | Plusieurs sols ; elles remplacent `walk`. Chaque zone met les personnages à l’échelle selon sa propre ligne de profondeur (`scale`) et peut zoomer la caméra (`zoom`, de 1 à 2 : un balcon vu de plus près). |
| `walkLinks.<id>` | `{ from: { zone, at }, to: { zone, at }, mode, ms?, facing?, oneWay? }` | Comment passer d’une zone à l’autre ; `mode` vaut `walk`, `stairs`, `ladder`, `jump` ou `teleport`. |
| `lights.<id>` | `{ at, radius }` | La position et le rayon d’un halo. |
| `emitters.<id>` | `{ area }` | Où apparaissent les particules. |

Une caméra zoomée monte et descend aussi pour garder le héros en vue. La géométrie elle-même (zones de marche, trous,
échelle de profondeur, caméra) est expliquée dans [Géométrie](create.geometry.md#layers-and-masks).

<a name="walk-links"></a>

## Les liens de marche et leur énigme

Un lien fermé (son `if` dans `stage.links` ne tient pas) ne se franchit pas : le héros va jusqu’à son pied, dit sa
ligne `locked`, et **l’action continue de là**. Les règles de ce qui se trouve derrière le lien doivent donc vérifier
la même condition : l’énigme est la règle, le lien ne fait qu’arrêter la marche. Le lint avertit quand une règle
derrière un lien ne vérifie pas sa condition (`walk-link-gate`) :

```sh
# dans le projet créé
npx quest-n-click lint

# dans le dépôt du moteur
GAME=<id> npm run lint
```

Le marcheur prend le moins de liens possible entre deux points.

<a name="renderer"></a>

## Quel peintre dessine quoi

`renderer: 'canvas'` (sur le lieu, ou sur le jeu pour tous les lieux) choisit le peintre Canvas. Les masques d’image
ou de calque, les lumières, les particules et les modes de fusion ne sont dessinés **que** par lui ; les occulteurs en
polygone sont dessinés par les deux peintres. Le validateur le dit sur un lieu peint par le peintre DOM (le défaut).
`?renderer=canvas` ou `?renderer=dom` dans l’URL du jeu force un peintre pour tous les lieux, pour les comparer.

> [!LIMIT id=stage-dom-painter]
> Avec le peintre DOM (le défaut), les occulteurs en masque, les lumières, les particules et les modes de fusion ne sont
> pas dessinés. Mettez `renderer: 'canvas'` sur les lieux qui en ont besoin.

Les animations réduites (le réglage, ou le `prefers-reduced-motion` du système) coupent la parallaxe, les particules
et les transitions.

<a name="since"></a>

## Depuis

Calques, masques, lumières, particules, transitions, zones de marche multiples et liens, zoom par zone, peintre Canvas
et `walk-link-gate` : 3.4.0. Avant la 3.4, un lieu avait un fond et une zone de marche, et c’est toujours ainsi qu’un
ancien lieu se lit.

<a name="related"></a>

## Identifiants liés

- `layout.width`, la commande `camera` : [Mise en scène](create.staging.md#wide-rooms).
- `walk`, `scale`, `entries`, `hotspots` : [Géométrie](create.geometry.md).
- Placer calques, lumières et zones dans le Studio : [Placement et scène](studio.placement.md).
- « Je le vois mais je ne peux pas l’atteindre » : [Visible mais inaccessible](create.unreachable.md).
