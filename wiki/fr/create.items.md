# Objets et inventaire

Un objet d'inventaire se déclare une fois, dans `game.ts` (`items`, en général depuis `items.ts`), et entre dans le sac
avec `{ gain }`. Cette page donne les champs d'un objet, le fonctionnement du sac, la façon dont les objets se
combinent, et ce qu'est un objet « utilisé ».

<a name="items"></a>

## Un objet

```ts
items: {
  rope: { name: 'corde', icon: 'items/r1c2', look: 'Un bout de corde. Un côté pour le crochet, un côté pour le seau.' },
},
```

| Champ | Contenu |
|---|---|
| `name` | Le nom affiché (la ligne de phrase, `{item}` dans les réponses de repli). |
| `icon` | L'image dans le sac (un id du manifeste). |
| `look` | Le regarder dans le sac : une réplique, ou une liste qui en donne une différente à chaque fois, en boucle. |
| `kind` | Ses sortes, pour les réactions par sorte (le `item` d'une entrée de `rules.kinds` en limite une à cet objet). |

Un objet peut aussi se montrer dans une salle sous forme d'accessoire (une image avec un `name`, cachée une fois prise
avec `visible: { not: { has: 'talkie' } }`) : l'accessoire et l'objet sont deux choses, reliées par la règle qui le
prend (`{ hide: 'bucket' }, { gain: 'bucket' }`).

<a name="inventory"></a>

## Le sac

- La partie commence avec `start.inventory` (`game.ts`) ; un point de reprise nomme le sien
  (`checkpoints.<id>.inventory`).
- `{ gain: 'rope' }` ajoute un objet (une fois : gagner un objet déjà tenu ne change rien), `{ lose: 'rope' }` le
  retire.
- `{ has: 'rope' }` le teste ([conditions](create.conditions.md)).
- Toucher un objet sans verbe choisi le prend pour Utiliser ; la ligne de phrase dit « Utiliser corde avec … » et le tap
  suivant nomme la cible. Avec un double tap sur une cible, un objet pris dans le sac est donné à un personnage, et
  utilisé sur tout le reste ([réactions](create.reactions.md#double-tap)).
- Plusieurs personnages jouables ont chacun leur sac, sauf avec `players.sharedInventory` ; `{ transfer }` passe un
  objet de l'un à l'autre ([héros](create.heroes.md)).

<a name="combining"></a>

## Combiner et donner

« Utiliser A avec B » et « Donner A à B » sont des règles avec `a` l'objet et `b` la cible. Deux objets d'inventaire se
combinent dans les deux sens : une règle `a: 'left_half', b: 'right_half'` répond aussi à « Utiliser moitié droite avec
moitié gauche » (seulement quand les deux sont tenus). Les règles valables partout, combiner deux objets par exemple,
vont dans `rules.on` du jeu. Sans règle, « Utiliser A avec B » répond par les réponses de repli `use2`, et « Donner » à
un personnage par sa réplique `refuse` ([réactions](create.reactions.md#fallbacks)).

<a name="used"></a>

## Un objet utilisé

`{ used: 'rope' }` (ou une liste) dit que l'objet a servi : il reste dans le sac, **grisé**, et ne peut plus être
choisi pour Utiliser ou Donner (Regarder marche toujours). Il redevient actif partout où une règle de salle ou de jeu
le vise en `a` ou `b` et que la condition `if` de cette règle est vraie. Gardez donc la règle qui l'a consommé derrière
un `if` (ici `'!tied'`), sinon il reste actif dans cette salle. `gain` sur un objet utilisé le réactive. La liste des
objets utilisés est sauvegardée ; les anciennes sauvegardes se chargent sans elle.

```room-example
{
  "room": {
    "id": "well",
    "name": "Le puits",
    "decor": "decor/well",
    "hotspots": { "hook": { "name": "crochet" } },
    "look": { "hook": "Un crochet rouillé au-dessus du puits." },
    "on": [
      { "id": "well.tie-rope", "verb": "use", "a": "rope", "b": "hook", "if": "!tied",
        "do": [{ "set": "tied" }, { "used": "rope" }, "Noué. La corde pend dans le puits."] }
    ],
    "hints": [{ "id": "well.hint", "until": "tied", "lines": ["La corde. Le crochet."] }]
  },
  "layout": {
    "walk": { "area": [[20, 300], [620, 300], [630, 395], [10, 395]] },
    "entries": { "default": [320, 360] },
    "hotspots": { "hook": { "rect": [300, 120, 40, 40], "approach": [320, 330] } }
  },
  "items": {
    "rope": { "name": "corde", "icon": "items/rope", "look": ["Un bout de corde.", "Toujours une corde."], "kind": ["tool"] }
  }
}
```

> [!LIMIT id=used-is-not-lost]
> Un objet utilisé compte toujours pour `{ has }`. Pour qu’il quitte le sac, retirez-le avec `lose` ; pour tester qu'il a servi,
> posez un drapeau dans la règle qui l'a utilisé.

<a name="hint-item"></a>

## L'objet d'indices

`hintItem` dans `game.ts` nomme un objet qui donne des indices quand on lui parle (le talkie-walkie de la démo, le
mot du modèle) ; `hintVoice` nomme le personnage qui les dit, souvent un personnage `offscreen`. Lui parler donne le
premier indice de la salle courante dont le `until` est encore faux ([salles : indices](create.rooms.md#hints)). Le
validateur refuse un `hintItem` qui n'est pas un objet.

<a name="related"></a>

## Identifiants liés

- `ItemDef` dans [`src/engine/core/types/content.ts`](../../src/engine/core/types/content.ts) ; `gain`, `lose`, `used`,
  `transfer` ([commandes](create.commands.md#world)) ; `{ has }` ([conditions](create.conditions.md)).
- `npm run lint` signale un objet jamais gagné (`item-never-gained`) et une fausse piste que rien n'utilise
  (`item-red-herring`) ([vérifier son jeu](create.checking.md)).
