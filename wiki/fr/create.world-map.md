# Carte du monde

La carte de voyage : des régions, des lieux qui ouvrent des salles, le trajet entre eux, et le marqueur de nouveauté.
Elle se déclare une fois dans `game.ts` (`map`). Un jeu de deux ou trois salles reliées par des portes n'en a pas
besoin.

<a name="map"></a>

## La carte

```ts
map: {
  start: 'world',
  regions: { world: { name: 'Monde', image: 'decor/map' }, town: { name: 'Ville', image: 'decor/map_town', parent: 'world' } },
  places: {
    market: { name: 'Marché', room: 'market', region: 'town', pos: [61, 41], portrait: 'seller/r1c2', vehicle: 'car', news: '!market_done' },
  },
},
```

| Champ | Contenu |
|---|---|
| `start` | La région montrée à l'ouverture de la carte. |
| `regions.<id>` | `name`, `image` (l'image de la carte), `parent` (la région d'où elle s'ouvre : la France depuis le Monde), `frame: [x, y, w, h]` (sa zone sur l'image du parent, en %, pour le bouton de zoom). |
| `places.<id>` | `name`, `room` (la salle qu'il ouvre), `region`, `pos: [x, y]` (en % de l'image de la région), `portrait`, `vehicle`, `news`, `joins`. |
| `music` | La musique de la carte. |
| `vehicles` | `{ car, plane, pin, news }` : des images qui remplacent, sur la carte, les icônes de l'habillage. |

Le validateur veut que la région de départ, la salle et la région de chaque lieu, et le parent de chaque région
existent.

<a name="unlocking"></a>

## Débloquer et voyager

Un lieu n'apparaît qu'une fois débloqué : `{ unlock: 'market' }` dans une règle, ou `start.unlocked` dans `game.ts`
(un point de reprise a son propre `unlocked`). `{ unlocked: 'market' }` le teste. Le joueur ouvre la carte avec son
bouton (`skin.icons.map`), ou une règle l'ouvre avec `{ map: true }` ; un tap sur une épingle emmène dans la salle de
son lieu (son `onEnter` s'exécute). `vehicle: 'car'` ou `'plane'` dessine le véhicule le long du trajet : une petite
animation et une impression de distance.

`news: COND` affiche un « ! » sur l'épingle tant que la condition est vraie : là où quelque chose de nouveau attend.
Dans la démo, le jardin a une nouveauté tant que `!tank_drained`, la maison quand on tient la clé et que le
garde-manger est encore fermé.

<a name="pins"></a>
<!-- applies: 4.4.0.. since 4.4.0 -->

## Une épingle pour plusieurs lieux

Le `portrait` d'un lieu peut être une liste : plusieurs visages côte à côte sur son épingle, quand plusieurs
personnages y vivent. Un lieu qui dit `joins: '<lieu>'` se pose sur l'épingle de ce lieu au lieu d'avoir la sienne :
une fois débloqué, son visage s'y ajoute, un tap sur un visage emmène dans le lieu de ce visage, et depuis n'importe
lequel d'entre eux l'épingle est « ici » (seul le visage courant est cerclé). Passer d'un lieu à l'autre d'une même
épingle ne dessine aucun trajet. Sa propre `pos` ne sert pas : écrivez celle de l'épingle.

```ts
places: {
  harbour: { name: 'Port', room: 'quay', region: 'town', pos: [30, 70], portrait: ['captain/r1c2', 'cook/r1c2'] },
  // Une autre salle de la même ville : son visage rejoint l'épingle du port et y mène directement.
  lighthouse: { name: 'Port : le phare', room: 'lighthouse', region: 'town', pos: [30, 70], portrait: 'keeper/r1c2', joins: 'harbour' },
},
```

Le validateur veut que le lieu de l'épingle existe, dans la même région, et qu'il n'en rejoigne pas lui-même un autre
(et refuse un lieu qui se rejoint lui-même). Une épingle qui n'a qu'un lieu s'affiche comme avant.

<a name="design"></a>

## Concevoir la carte

- **Une carte à partir de trois lieux.** À deux, une porte suffit ([sorties](create.exits.md)).
- **Les véhicules** donnent à chaque trajet une petite animation et une impression de distance.
- **Le marqueur de nouveauté** montre où quelque chose de nouveau attend.
- **Aucun lieu verrouillé visible.** Un lieu apparaît quand une règle le débloque, avec un `toast` (« Nouveau sur la
  carte : le jardin »). Le joueur ne devrait jamais voir une épingle qu'il ne peut pas utiliser.

Comment la carte sert l'histoire : [concevoir les énigmes](create.puzzle-design.md#map).

<a name="related"></a>

## Identifiants liés

- `MapDef`, `MapRegion`, `PlaceDef` dans [`src/engine/core/types/game.ts`](../../src/engine/core/types/game.ts) ; les
  règles du validateur dans [`src/engine/tools/validate/map.ts`](../../src/engine/tools/validate/map.ts).
- `unlock`, `map` ([commandes](create.commands.md#world)), `{ unlocked }` ([conditions](create.conditions.md)), les
  textes de la carte `ui.mapTitle`, `ui.mapBack`, `ui.world`, `ui.zoomIn`, `ui.arrival`. La vue carte du Studio :
  [carte du Studio](studio.map.md).
