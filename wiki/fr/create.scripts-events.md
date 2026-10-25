# Scripts et événements

Tout le reste d'un jeu réagit au joueur : un tap, une règle, ses commandes. Trois primitives laissent le monde agir
tout seul : les **scripts** (ce qui se passe sans tap), les **événements** (il vient de se passer quelque chose) et les
[personnages mobiles](create.moving-characters.md). Ce sont des données comme le reste : `validate`, `solve` et la
sauvegarde les comprennent.

<a name="overview"></a>

## Le monde vit

Un chat qui s'étire toutes les quelques secondes, une voisine qui fait les cent pas, une cuisinière qui arrive quand
le gong sonne : un script. Une clé trouvée qui renvoie Papi chez lui et affiche un message, où que soit le joueur : un
événement et son écouteur. Lequel prendre pour retenir les choses : [drapeaux, variables et événements](create.flags-variables-events.md).

<a name="scripts"></a>

## Les scripts : ce qui se passe sans tap

Un script est une liste de commandes qui s'exécute toute seule, **une commande à la fois, dans les intervalles entre
les actions du joueur** : jamais pendant une action, une cinématique, une conversation ou un mini-jeu. Le moteur le
reprend à l'intervalle suivant. Les scripts d'une salle (`scripts` dans la salle) tournent tant que le joueur est dans
la salle ; ceux du jeu (`scripts` dans `game.ts`) tournent partout.

```ts
scripts: [
  // Biscuit s'étire toutes les sept secondes, pour toujours.
  { id: 'biscuit_naps', loop: true, stepIds: ['wait', 'stretch'],
    do: [{ wait: 7000 }, { anim: ['biscuit', 'stretch'], ms: 1200 }] },
  // Lou va et vient entre deux endroits jusqu'à l'affaire conclue ; quand `while` devient faux, le script revient au début et attend.
  { id: 'lou_paces', loop: true, while: '!bouquet_given', stepIds: ['w1', 'to-a', 'w2', 'to-b'], do: [
    { wait: 6000 }, { walk: [235, 262], who: 'neighbor' }, { wait: 3000 }, { walk: [147, 278], who: 'neighbor' },
  ] },
  // Une fois : la cuisinière vient quand le gong sonne, puis le script est fini.
  { id: 'cook_comes', stepIds: ['gong', 'move', 'dinner'],
    do: [{ waitEvent: 'gong' }, { moveActor: ['cook', 'hall'] }, { say: ['cook', 'À table !'] }] },
],
```

| Champ ou commande | Effet |
|---|---|
| `id` | Unique dans tout le jeu (un script se lance, s'arrête ou s'attend de n'importe où). |
| `stepIds` | Un id stable par commande de premier niveau, obligatoire en schéma 3 : la sauvegarde garde la position du script par id d'étape, si bien que réordonner ses commandes ne casse pas une sauvegarde. |
| `loop: true` | Recommence au début une fois fini. Une boucle doit contenir un `wait`, `waitUntil` ou `waitEvent` (`validate` : `loop script "…" never waits`). |
| `while: COND` | Ne tourne que tant que la condition tient ; quand elle devient fausse, le script revient à sa première commande et attend. Elle est vérifiée avant chaque commande : un script qui `lose` l'objet dont son `while` a besoin s'arrête net (gagnez d'abord le nouvel objet, puis perdez l'ancien). |
| `{ wait: 3000 }` | Une pause : le joueur continue de jouer pendant ce temps. |
| `{ waitUntil: COND }` | Attend que la condition tienne (vérifiée à chaque intervalle). |
| `{ waitEvent: 'gong' }` | Attend que l'événement soit déclenché, même depuis une autre salle. |
| `{ startScript: 'id' }`, `{ stopScript: 'id' }` | Depuis n'importe quel script ou règle : lancer un script depuis le début (à nouveau, s'il est fini ou arrêté), ou l'arrêter. |

La position d'un script est sauvegardée avec la partie : il reprend où il en était. Comme les commandes d'un script
s'intercalent entre les actions du joueur à l'échelle d'une commande entière, gardez chaque commande courte (une
`walk`, une réplique, une pose), et mettez dans une `cutscene` une séquence qui ne doit pas être interrompue. Le
solveur laisse tourner les scripts, une étape à la fois, comme un de ses choix
([ce que prouve le solveur](create.solver-proofs.md)).

> [!GUARANTEE id=scripts-between-actions]
> Un script n'exécute jamais une commande pendant que le moteur est occupé par une action, et un script dont le
> `while` devient faux revient à sa première commande.

> [!LIMIT id=script-not-skippable]
> Le joueur ne peut pas passer un script, et ce n'est pas du temps réel : un script ne tourne jamais au milieu de
> l'action ou de la réplique du joueur, seulement entre elles.

<a name="events"></a>

## Les événements : « il vient de se passer quelque chose »

Un drapeau est un état (la porte *est* ouverte). Un événement est un moment (la cloche *vient* de sonner).
`{ emit: 'bell_rang' }` exécute, sur-le-champ et dans l'ordre : d'abord, il fait avancer chaque script en pause sur
`{ waitEvent: 'bell_rang' }`, où qu'il soit ; puis il lance les écouteurs de la salle courante (`events` dans la
salle), puis ceux du jeu (`events` dans `game.ts`)
([`src/engine/core/event-runtime.ts`](../../src/engine/core/event-runtime.ts)).

```ts
// market.ts, dans une règle :  { gain: 'key' }, { emit: 'key_found' }
// game.ts :
events: [
  { id: 'grandpa.goes-home', on: 'key_found', once: true, do: [{ moveActor: ['grandpa', 'house'] }, { toast: 'Papi est rentré.' }] },
],
```

| Champ | Contenu |
|---|---|
| `id` | Id stable, obligatoire en schéma 3 ; un écouteur `once` est retenu sous `event.<id>`. |
| `on` | Le nom de l'événement. |
| `if` | L'écouteur ne s'exécute que si ceci tient au moment où l'événement est déclenché. |
| `once` | Seulement la première fois. |
| `do` | Les commandes. |

**Un événement n'est pas retenu** : pour réagir plus tard (la prochaine fois que le joueur entre dans une salle),
posez un drapeau dans l'écouteur et testez-le dans `onEnter`. `validate` prévient d'un événement déclenché que rien
n'écoute, d'un écouteur d'un événement jamais déclenché, et d'un script qui attend un événement jamais déclenché.

> [!GUARANTEE id=emit-order]
> `emit` lance les écouteurs de la salle courante et ceux du jeu ; un écouteur `once` ne s'exécute qu'une fois.

Les écouteurs de la salle passent d'abord, puis ceux du jeu.

<a name="example"></a>

## Une salle qui vit

Un chat qui s'étire, un gong qui appelle la cuisinière, un écouteur qui réagit, vérifiés par le validateur :

```room-example
{
  "room": {
    "id": "hall",
    "name": "Le hall",
    "decor": "decor/hall",
    "actors": { "biscuit": { "char": "biscuit" }, "cook": { "char": "cook", "visible": "dinner_called" } },
    "hotspots": { "gong": { "name": "gong" } },
    "look": { "biscuit": "Biscuit, endormi. Presque.", "cook": "La cuisinière.", "gong": "Un gong en laiton." },
    "on": [
      { "id": "hall.ring-gong", "verb": "use", "a": "gong", "do": ["Bong.", { "emit": "gong" }] }
    ],
    "scripts": [
      { "id": "biscuit_naps", "loop": true, "stepIds": ["wait", "stretch"],
        "do": [{ "wait": 7000 }, { "anim": ["biscuit", "stretch"], "ms": 1200 }] },
      { "id": "cook_comes", "stepIds": ["gong", "called", "show", "dinner"],
        "do": [{ "waitEvent": "gong" }, { "set": "dinner_called" }, { "show": "cook", "fade": 800 }, { "say": ["cook", "À table !"] }] }
    ],
    "events": [
      { "id": "hall.gong-heard", "on": "gong", "once": true, "do": [{ "say": ["biscuit", "Mrrp ?"] }] }
    ],
    "hints": [{ "id": "hall.hint", "until": "dinner_called", "lines": ["Fais sonner le gong."] }]
  },
  "layout": {
    "walk": { "area": [[20, 300], [620, 300], [630, 395], [10, 395]] },
    "entries": { "default": [320, 360] },
    "hotspots": { "gong": { "rect": [500, 160, 70, 90], "approach": [530, 330] } },
    "actors": { "biscuit": { "x": 150, "y": 360 }, "cook": { "x": 420, "y": 350 } }
  },
  "characters": {
    "biscuit": { "name": "Biscuit", "color": "#ffd28a", "kind": ["cat"], "sprites": { "idle": ["cat/idle"], "stretch": ["cat/stretch"] } },
    "cook": { "name": "Cuisinière", "color": "#8fd3ff", "sprites": { "idle": ["cook/idle"] } }
  }
}
```

<a name="related"></a>

## Identifiants liés

- `ScriptDef`, `EventRule` dans [`src/engine/core/types/content.ts`](../../src/engine/core/types/content.ts) ;
  [`src/engine/core/script-runtime.ts`](../../src/engine/core/script-runtime.ts).
- `emit`, `waitUntil`, `waitEvent`, `startScript`, `stopScript` ([commandes](create.commands.md#world)).
- [Faire bouger les personnages](create.moving-characters.md), [drapeaux, variables et événements](create.flags-variables-events.md), [le modèle d'exécution](engine.execution-model.md).
