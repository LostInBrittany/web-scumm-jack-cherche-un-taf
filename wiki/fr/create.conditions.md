# Conditions

Une condition est une donnée : une chaîne pour un drapeau, un objet pour le reste, imbriqués avec `not`, `all` et
`any`. Les règles (`if`), les commandes `if`, les sorties, les sujets, les indices (`until`), `visible`, les scripts
(`while`, `waitUntil`), les écouteurs, les nouvelles de la carte, les objectifs et les buts des points de reprise en
prennent tous une. La forme exacte de chaque condition est aussi dans la [référence du DSL](create.dsl.md), générée.

<a name="conditions"></a>

## Les conditions

| Condition | Vraie quand… |
|---|---|
| `'tied'` / `'!tied'` | le drapeau est vrai (toute valeur sauf `false`, `0`, `''`) / le drapeau est faux ou absent. |
| `{ has: 'rope' }` | l'objet est dans l'inventaire (un objet grisé `used` compte toujours). |
| `{ flag: 'tries', eq: 3 }` | le drapeau vaut exactement cette valeur (un nombre, une chaîne ou un booléen). |
| `{ flag: 'tries', gte: 2 }` | le drapeau est un nombre, 2 ou plus. Un drapeau absent donne faux. |
| `{ flag: 'x', lt: 5 }` | le drapeau est sous 5, **ou n'est pas un nombre** (un drapeau absent donne vrai). |
| `{ not: … }`, `{ all: [ … ] }`, `{ any: [ … ] }` | non, et, ou. |
| `{ visited: 'market' }` | le joueur est déjà entré au marché. |
| `{ room: 'market' }` | le joueur est au marché en ce moment. |
| `{ prop: ['lamp', 'on'] }`, `{ prop: ['house.lamp', 'on'] }` | l'accessoire est dans cet état (dans la salle courante, ou `'salle.accessoire'`). Un accessoire jamais changé est dans son état `initial`, sinon le premier. |
| `{ unlocked: 'market' }` | le lieu est débloqué sur la carte. |
| `{ seen: 'topic.ask.basket' }` | ce sujet de conversation a déjà été entendu (voir plus bas). |
| `{ actorIn: ['grandpa', 'house'] }` | le personnage mobile est dans cette salle ([faire bouger les personnages](create.moving-characters.md)). |
| `{ player: 'laverne' }` | ce personnage est celui que le joueur contrôle maintenant ([héros](create.heroes.md)). |

Le code est [`src/engine/core/cond.ts`](../../src/engine/core/cond.ts). L'explication de règle du Studio montre quelle
partie d'une condition échoue, et pourquoi ([explication de règle](studio.rule-explainer.md)).

```room-example
{
  "room": {
    "id": "market",
    "name": "Le marché",
    "decor": "decor/market",
    "actors": { "seller": { "char": "seller" } },
    "props": { "stall": { "name": "étal", "states": { "closed": "market/stall_closed", "open": "market/stall_open" } } },
    "look": { "seller": "La marchande.", "stall": "Un étal de fleurs." },
    "on": [
      { "id": "market.haggle-done", "verb": "talk", "a": "seller", "if": { "flag": "tries", "gte": 3 },
        "do": [{ "say": ["seller", "Bon. Deux pièces. Prends-les et file."] }, { "set": "deal" }] },
      { "id": "market.haggle", "verb": "talk", "a": "seller",
        "if": { "all": [{ "prop": ["stall", "open"] }, { "not": "deal" }, { "any": [{ "has": "coin" }, { "visited": "market" }] }] },
        "do": [{ "inc": "tries" }, { "say": ["seller", "Trop bas !"] }] }
    ],
    "onEnter": [{ "if": { "flag": "tries", "eq": 2 }, "then": ["Encore un essai. Je le sens."], "else": [] }],
    "hints": [{ "id": "market.hint", "until": "deal", "lines": ["Marchande. Encore."] }]
  },
  "layout": {
    "walk": { "area": [[20, 300], [620, 300], [630, 395], [10, 395]] },
    "entries": { "default": [320, 360] },
    "props": { "stall": { "x": 200, "y": 340, "h": 120 } },
    "actors": { "seller": { "x": 420, "y": 350 } }
  },
  "items": { "coin": { "name": "pièce", "icon": "items/coin" } },
  "characters": { "seller": { "name": "Marchande", "color": "#ffb36b", "sprites": { "idle": ["seller/idle"] } } }
}
```

<a name="seen"></a>

## `seen` : ce qui a été entendu

`{ seen: clé }` lit ce que la sauvegarde retient de ce qui n'arrive qu'une fois : un sujet entendu, un écouteur `once`
déclenché, une option `once` choisie. Dans un jeu en schéma 3, les clés sont faites des ids stables
([`src/engine/core/keys.ts`](../../src/engine/core/keys.ts)) :

| Chose | Clé en schéma 3 | Clé sans ids (schéma 2) |
|---|---|---|
| Un sujet de conversation | `topic.<id du sujet>` | `<salle>.<acteur>.<index>` (par exemple `house.grandma.0`) |
| Un écouteur `once` | `event.<id de l'écouteur>` | `event.<salle ou game>.<index>` |
| Une option `once` d'un `choice` | `choice.<id de l'option>` | `choice.<salle>.<texte>` |

> [!LIMIT id=seen-key-v3]
> Dans un jeu en schéma 3, `{ seen: 'house.grandma.0' }` (la forme par position que montraient d'anciennes pages)
> n'est jamais vraie : un sujet qui a un id est noté `topic.<id>`. Le validateur ne vérifie pas les clés de `seen` :
> une clé fausse est fausse en silence.

<a name="flags"></a>

## Les drapeaux dans les conditions

Un drapeau contient un booléen, un nombre ou une chaîne ([lequel choisir](create.flags-variables-events.md)).
`'nom'` teste s'il est vrai, `{ flag, eq }` une valeur exacte, `{ flag, gte }` et `{ flag, lt }` un nombre. Pour les
objectifs et les buts, préférez une condition qui reste vraie une fois vraie (un drapeau posé une fois, un objet
gardé) : le journal ne reprend jamais un objectif accompli ([chapitres et objectifs](create.chapters.md)).

`npm run validate` signale un drapeau qu'une condition lit et que rien ne pose, et un drapeau posé que rien ne lit ;
`npm run lint` signale une condition qui ne peut jamais être vraie (`cond-never-true`).

<a name="related"></a>

## Identifiants liés

- `Cond` dans [`src/engine/core/types/content.ts`](../../src/engine/core/types/content.ts) ; `check` et `explainCond`
  dans `cond.ts`.
- [Réactions](create.reactions.md), [commandes](create.commands.md), [la référence du DSL](create.dsl.md).
