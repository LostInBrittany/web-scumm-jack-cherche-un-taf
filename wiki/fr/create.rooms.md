# Salles

Une salle est un fichier, `rooms/<salle>.ts` : ce qu'elle montre, ce sur quoi on peut agir, ce qui s'y passe. Cette
page parcourt une salle entière, puis en liste les champs un à un. L'emplacement des choses n'est pas ici : il est dans
le layout de la salle ([géométrie](create.geometry.md)).

<a name="overview"></a>

## Ce que vous allez écrire

Un fichier par salle dans `rooms/` (`game/rooms/` dans un projet créé, `games/<id>/rooms/` dans le dépôt du moteur),
uniquement des données : les accessoires et leurs états, les acteurs, les zones cliquables, les sorties, les textes
Regarder, les réactions (`verb` + cible + condition + commandes), les sujets de conversation, les indices, un script
d'arrivée, les scripts et écouteurs propres à la salle. Chaque salle est listée dans `game.ts` (`rooms: [...]`). Dans
Claude Code, le skill `/new-room` du dépôt en prépare une.

<a name="step-by-step"></a>

## Une salle, pas à pas

```ts
import { defineRoom } from '@quest-n-click/engine/content';

export default defineRoom({
  id: 'house',
  name: 'Chez Grand-mère',
  decor: 'decor/house',          // image de fond (voir « Images »)
  music: 'house',

  // Accessoires : des images posées sur le fond, qui peuvent changer d'état.
  props: {
    lamp:     { name: 'lampe', states: { off: 'house/r1c1', on: 'house/r1c2' } },
    armchair: { name: 'fauteuil', states: { full: 'house/armchair_full', empty: 'house/armchair' } },
    table:    { img: 'house/side_table', name: 'guéridon' },
    stool:    { name: 'tabouret', states: { shelf: 'house/r1c5', pulled: 'house/r1c6' } },
    talkie:   { name: 'talkie-walkie', img: 'items/r1c1', visible: { not: { has: 'talkie' } } },
  },

  // Les personnages présents.
  actors: {
    grandma: { char: 'grandma', facing: 'left' },
    cat: { char: 'cat', pose: 'sleep', visible: '!cat_awake' },
  },

  // Zones cliquables du fond lui-même (rien n'est dessiné, seule la zone compte).
  hotspots: {
    shelf:    { name: 'étagère' },
    cupboard: { name: 'placard' },
    door:     { name: 'porte du jardin' },
  },

  // Regarder. Une liste = une réplique différente à chaque fois, en boucle.
  look: {
    shelf: "L'étagère. Trop haute sans marchepied.",
    cupboard: ['Un vieux placard.', 'Toujours un vieux placard.', "Un jour, je regarderai ce qu'il y a derrière."],
  },

  // Les réactions écrites. Voir « Réactions ».
  on: [
    { id: 'pull.stool', verb: 'pull', a: 'stool', if: { prop: ['stool', 'shelf'] }, do: [
      { prop: ['stool', 'pulled'] }, 'Voilà. Un marchepied.',
    ] },
    { id: 'tie.rope', verb: 'use', a: 'rope', b: ['hook', 'bucket'], do: [
      { lose: 'rope' }, { set: 'tied' },
      "Noué. Un bout au crochet, l'autre au seau.",
      { id: 'house.open-door.l-careful-with-that', say: ['grandma', 'Attention avec ce seau, mon chat.'] },   // l'id : la traduction et le clip de voix le suivent
    ] },
  ],

  // Sujets de conversation (2 à 4). « Au revoir » s'ajoute à chaque menu, « Un câlin ? » aussi quand le jeu pose globalTalk.hug.
  talk: {
    grandma: [
      { id: 'ask.basket', topic: "Grand-mère, qu'y a-t-il dans le panier ?", do: [{ say: ['grandma', 'Une surprise pour tout le monde.'] }] },
      { id: 'ask.market', topic: 'Je peux aller au marché tout seul ?', do: [
        { say: ['grandma', "Tout seul ?! Avec ton écharpe, ton bonnet, ta gourde…"] },
        { say: ['grandma', '… Bon. Retour avant dix heures.'] },
      ] },
    ],
  },

  // Les indices de l'objet d'indices (le talkie-walkie) : le premier dont la condition `until` est encore fausse est donné.
  hints: [
    { until: { has: 'rope' }, lines: ['Khhh… le fauteuil… il mange tout.', 'Khhh… regarde sur le côté du fauteuil.'] },
    { until: 'tied', lines: ['Khhh… une corde… ça s’attache.'] },
  ],

  // À chaque entrée dans la salle.
  onEnter: [
    { once: [ 'Le salon. Le camp de base.' ], id: 'arrival.first' },
  ],
});
```

C'est un extrait d'un jeu plus grand : le crochet `hook`, le seau `bucket`, l'objet `rope` et le personnage `cat`
sont déclarés ailleurs. Dans le dépôt du moteur, les fichiers de salle importent `defineRoom` depuis
`@engine/core/define` ou depuis `@quest-n-click/engine/content` ; les deux mènent à la même fonction, qui ne fait que typer
l'objet.

Le même genre de salle, complète et vérifiée par le validateur : une lampe, un tabouret à tirer, Grand-mère avec un sujet,
un indice, et son layout.

```room-example
{
  "room": {
    "id": "house",
    "name": "Chez Grand-mère",
    "decor": "decor/house",
    "props": {
      "lamp": { "name": "lampe", "states": { "off": "house/r1c1", "on": "house/r1c2" } },
      "table": { "img": "house/side_table" },
      "stool": { "name": "tabouret", "states": { "shelf": "house/r1c5", "pulled": "house/r1c6" } }
    },
    "actors": { "grandma": { "char": "grandma", "facing": "left" } },
    "hotspots": { "shelf": { "name": "étagère" }, "door": { "name": "porte du jardin" } },
    "look": {
      "lamp": "Une vieille lampe.",
      "stool": "Un tabouret, sous l'étagère.",
      "grandma": "Grand-mère, qui tricote.",
      "shelf": "L'étagère. Trop haute sans marchepied.",
      "door": ["La porte du jardin.", "Toujours la porte du jardin."]
    },
    "on": [
      { "id": "pull.stool", "verb": "pull", "a": "stool", "if": { "prop": ["stool", "shelf"] },
        "do": [{ "prop": ["stool", "pulled"] }, "Voilà. Un marchepied."] },
      { "id": "use.lamp", "verb": "use", "a": "lamp", "if": { "prop": ["lamp", "off"] },
        "do": [{ "prop": ["lamp", "on"] }, "Lumière."] }
    ],
    "talk": {
      "grandma": [
        { "id": "ask.basket", "topic": "Grand-mère, qu'y a-t-il dans le panier ?",
          "do": [{ "say": ["grandma", "Une surprise pour tout le monde."] }] }
      ]
    },
    "hints": [{ "id": "house.stool", "until": { "prop": ["stool", "pulled"] }, "lines": ["Le tabouret. Tire-le."] }],
    "onEnter": [{ "once": ["Le salon. Le camp de base."], "id": "arrival.first" }]
  },
  "layout": {
    "walk": { "area": [[20, 300], [620, 300], [630, 395], [10, 395]] },
    "scale": [[300, 0.8], [395, 1]],
    "entries": { "default": [320, 360] },
    "hotspots": { "shelf": { "rect": [60, 80, 120, 60] }, "door": { "rect": [520, 150, 80, 200], "approach": [540, 360] } },
    "props": { "lamp": { "x": 200, "y": 330, "h": 60 }, "table": { "x": 260, "y": 340, "h": 40 }, "stool": { "x": 120, "y": 360, "h": 30 } },
    "actors": { "grandma": { "x": 420, "y": 350 } }
  },
  "characters": {
    "grandma": { "name": "Grand-mère", "color": "#f0c040", "height": 120, "kind": ["person"], "sprites": { "idle": ["grandma/idle"] } }
  }
}
```

<a name="fields"></a>

## Les champs d'une salle

| Champ | Contenu | Remarques |
|---|---|---|
| `id` | l'id de la salle | utilisé par `goto`, les sorties, la carte, `{ room }` et `{ visited }` |
| `name` | son nom affiché | |
| `decor` | l'image de fond (un id du manifeste) | [images](create.images.md) |
| `description` | ce que montre le fond, pour les prompts d'images (`npm run prompts`) | jamais affiché en jeu |
| `furniture` | des meubles dessinés sur leur propre planche, pour que le moteur les trie en profondeur | lu par `npm run prompts` seulement |
| `music` | la musique de la salle | [musique](create.music.md) |
| `props` | des images posées sur le fond, avec des états | [ci-dessous](#props) |
| `actors` | les personnages présents | [ci-dessous](#actors) |
| `hotspots` | des zones cliquables du fond | [ci-dessous](#hotspots) |
| `exits` | les sorties, déclarées | [sorties](create.exits.md) |
| `look` | une réplique par chose, ou une liste qui tourne | [ci-dessous](#look) |
| `on` | les réactions écrites | [réactions](create.reactions.md) |
| `talk` | les sujets de conversation par acteur | [dialogues](create.dialogues.md) |
| `hints` | ce que dit ici l'objet d'indices | [ci-dessous](#hints) |
| `onEnter` | des commandes lancées à chaque entrée | [ci-dessous](#on-enter) |
| `scripts`, `events` | les scripts et écouteurs propres à la salle | [scripts et événements](create.scripts-events.md) |
| `hero` | `false` pour une salle sans le héros (une cinématique pure) | |
| `stage`, `renderer` | calques, lumières, particules, liens de marche ; le peintre | [la scène](create.stage.md), [géométrie](create.geometry.md#layers-and-masks) |
| `anchors` | où Remix peut poser un objet | [Remix](create.remix.md) |

<a name="props"></a>

## Accessoires

Un accessoire est une image posée sur le fond. `img` donne une image, `states` une image par état (`initial` choisit
l'état de départ, sinon la première clé) ; le validateur refuse un accessoire qui n'a ni l'un ni l'autre. Un
accessoire qui a un `name` est interactif : on peut le toucher, le regarder, agir dessus. Sans `name`, c'est du décor
(`table`, `chair`, `stall_left`) : de quoi habiller la scène. `visible` ne le montre que tant qu'une condition tient ;
`kind` lui donne des sortes pour les [réactions par sorte](create.reactions.md#fallbacks) ; `defaultVerb` nomme le
verbe du double tap ; `anims` porte ses animations ([mise en scène](create.staging.md)). Sa position, et une par état
s'il bouge, sont dans le layout.

On change l'état d'un accessoire avec `{ prop: ['stool', 'pulled'] }` ; on le teste avec `{ prop: ['stool', 'pulled'] }`
dans une condition. `'salle.accessoire'` atteint un accessoire d'une autre salle.

<a name="actors"></a>

## Acteurs

`actors: { grandma: { char: 'grandma', facing: 'left' } }` met un personnage du jeu dans la salle. `pose` est une pose
durable de sa planche (`sleep`), `facing` son côté, `visible` une condition, `name` un nom affiché autre que celui du
personnage, `interactive: false` en fait un décor vivant, ni cliquable ni nommé
([personnages](create.characters.md#presence)). Le validateur veut chaque acteur placé dans le layout, et signale une
`person` sans sujet de conversation.

<a name="hotspots"></a>

## Zones cliquables

Une zone cliquable (hotspot) est un morceau du fond avec un nom, sans rien de dessiné :
`hotspots: { shelf: { name: 'étagère' } }`. Sa forme (un rectangle ou un polygone) et son point d'approche sont dans le
layout. Elle accepte aussi `kind`, `visible`, `defaultVerb` et `onTap` ([réactions](create.reactions.md#double-tap)).
Pour une chose dessinée qui change, prenez plutôt un accessoire à états
([personnages : choses à plusieurs états](create.characters.md#multiple-states)).

<a name="look"></a>

## Regarder

`look: { shelf: 'Une réplique.' }`, ou une liste : une réplique différente à chaque fois, en boucle. Tout ce qui se voit
devrait en avoir une : `npm run validate` signale une chose nommée sans texte Regarder (c'est alors la réponse de repli
qui parle). Le texte Regarder d'un objet d'inventaire est sur l'objet ([objets](create.items.md)). Une réplique peut
s'écrire `{ id, text }` pour que sa traduction suive l'id.

<a name="hints"></a>

## Indices

`hints: [{ until, lines }]` : parler à l'objet d'indices (`hintItem` dans `game.ts`, le talkie-walkie de la démo)
donne le premier indice dont la condition `until` est encore fausse, ses répliques dites dans l'ordre par `hintVoice`
(ou par le héros). Quand tous les indices sont satisfaits, c'est la réponse de repli de Parler qui répond.
`{ hint: true }` donne l'indice courant depuis un script. Le validateur signale une salle qui a des énigmes mais aucun
indice.

<a name="on-enter"></a>

## Le script d'arrivée

`onEnter` tourne à chaque entrée dans la salle, une fois la salle affichée. Enveloppez ce qui ne doit arriver que la
première fois dans `{ once: [...], id }`. Une condition sur un drapeau posé par un écouteur permet à une salle de
réagir à ce qui s'est passé ailleurs ([drapeaux, variables et événements](create.flags-variables-events.md)).

<a name="rules-of-thumb"></a>

## Repères

| Élément | Repère |
|---|---|
| Zones + accessoires nommés + acteurs | **8 à 15** par salle. Moins, la salle paraît vide ; plus, on cherche le pixel. La maison de la démo a 11 choses nommées. |
| Accessoires à états | Seulement pour ce que l'histoire change (`armchair`, `tank`, `pantry`). |
| Accessoires de décor | Sans `name`, pas cliquables (`table`, `chair`, `stall_left`). |
| Sorties | Une sortie évidente, au bord de l'écran, nommée d'après sa destination (`back_door` : « Retour chez Grand-mère. »). |

- **Espace logique : 640 × 400**, origine en haut à gauche, personnages placés par les pieds.
- **La bande du sol.** La zone de marche occupe le bas du fond ; `floor` (395 par défaut) en est le bas. Gardez-la
  libre de meubles peints, pour que accessoires et acteurs s'y tiennent.
- **Les tailles des personnages** sont en unités de cet espace : dans la démo, Pixel mesure 36, Grand-mère 120, Papi (assis)
  100. Un humain de 110 à 125 dans une salle de 640 de large se lit bien sur un téléphone.
- **Points d'approche** : posez-les dans l'éditeur (`?edit=<salle>`), pour que le héros marche à côté d'une chose, pas
  dessus. `validate` signale une cible de `walk` sans géométrie.
- **Les sorties sont des choses cliquables**, pas des bords invisibles. Une sortie fermée répond quand même : la
  `window` de la maison de la démo dit « Pas encore. D'abord, la clé. Grand-mère sait des choses. » tant que le jardin
  n'est pas débloqué.
- **Un point de reprise par salle** dans `game.checkpoints`, avec l'inventaire, les drapeaux et les accessoires
  qu'aurait le joueur. La démo a `house`, `garden`, `market`, `finale`. Ouvrez `?dev&at=market` pour tester cette salle
  seule.

Pourquoi ces nombres, et comment une salle sert les énigmes : [concevoir les énigmes](create.puzzle-design.md#rooms).

<a name="write-the-rooms"></a>

## Écrire les salles d'un jeu entier

Un fichier par salle, uniquement des données, puis vérifier :

```sh
# dans le dépôt du moteur (dans un projet créé : npx quest-n-click validate, npx quest-n-click solve)
npm run validate          # ids cassés, textes Regarder manquants, drapeaux inutilisés
npm run solve             # un chemin pour finir le jeu
npm run solve -- --prove  # on peut toujours le finir, depuis chaque état atteignable
```

Ce que couvre une preuve, et ce qu'elle ne couvre pas : [ce que prouve le solveur](create.solver-proofs.md).

<a name="next"></a>

## Et ensuite

- [Géométrie](create.geometry.md) : placer la salle. [Réactions](create.reactions.md), [commandes](create.commands.md),
  [conditions](create.conditions.md).
- [Personnages](create.characters.md), [objets](create.items.md), [dialogues](create.dialogues.md),
  [sorties](create.exits.md).
