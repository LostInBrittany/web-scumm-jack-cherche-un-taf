# Réactions

Ce qui répond à l'action du joueur : une règle écrite, un texte Regarder, une conversation, une réaction par sorte, un
refus, ou une réponse de repli. Cette page donne les champs d'une règle, l'ordre exact dans lequel le moteur cherche
une réponse, et le verbe qu'utilise un double tap.

<a name="reactions"></a>

## Les réactions écrites

Une réaction dit : « quand VERBE arrive sur A (avec B, ou à B), si CONDITION, alors ces commandes ».

| Champ | Sens |
|---|---|
| `id` | Son id stable, obligatoire en schéma 3 ([contrat d'identité](create.principles.md#identity-contract)). |
| `verb` | Un id de verbe du jeu : dans le modèle `give`, `open`, `close`, `take`, `look`, `talk`, `use`, `push`, `pull`. Une liste accepte plusieurs verbes. |
| `a` | La chose visée. Pour Utiliser/Donner à deux termes, c'est l'objet d'inventaire. Une liste = n'importe lequel. |
| `b` | La cible de « Utiliser A avec B » ou « Donner A à B ». Absent = action à un seul terme uniquement. |
| `if` | [Condition](create.conditions.md) facultative. La première règle dont la condition est vraie gagne : mettez les cas particuliers d'abord. |
| `do` | Les [commandes](create.commands.md) à lancer. |

```ts
on: [
  { id: 'pull.stool', verb: 'pull', a: 'stool', if: { prop: ['stool', 'shelf'] }, do: [{ prop: ['stool', 'pulled'] }, 'Voilà. Un marchepied.'] },
  { id: 'tie.rope', verb: 'use', a: 'rope', b: ['hook', 'bucket'], do: [{ lose: 'rope' }, { set: 'tied' }, 'Noué.'] },
]
```

Deux objets d'inventaire se combinent dans les deux sens : une règle `a: 'piece1', b: 'piece2'` marche aussi pour
« Utiliser pièce 2 avec pièce 1 » (seulement quand les deux sont dans le sac). Les règles valables partout (combiner
deux objets, par exemple) vont dans `rules.on` du jeu, pas dans une salle. Les règles de la salle passent avant celles
du jeu.

Les ids de verbes sont libres : les `verbs` du jeu les déclarent. Quatre ont un sens pour le moteur : `look` (les
textes Regarder), `talk` (les conversations, l'objet d'indices), `give` et `use` (deux termes : un objet d'inventaire,
puis une cible ; toucher un objet sans verbe choisi le prend pour Utiliser). Tout autre verbe ne passe que par les
règles écrites et les réponses de repli.

<a name="fallbacks"></a>

## Quand rien n'est écrit

Le moteur cherche une réponse dans cet ordre, et s'arrête à la première trouvée
([`src/engine/core/interactions.ts`](../../src/engine/core/interactions.ts)) :

1. une règle de la salle (`on`), puis une règle du jeu (`rules.on`), dont le verbe, `a`, `b` et la condition
   correspondent ;
2. Regarder sur une chose : le texte `look` de la salle pour elle, sinon, pour un objet d'inventaire, le `look` de
   l'objet ;
3. Parler à une chose : à l'objet d'indices (quand il est dans le sac), les indices ; à un acteur qui a des sujets, le
   menu de conversation ;
4. une réaction par sorte (`rules.kinds`) : d'abord celle qui vise exactement cet id (`target`), puis celle par sorte
   (`kind`) ;
5. Donner à un personnage : sa réplique de refus (`refuse` sur sa fiche) ;
6. la réponse de repli du verbe (`rules.fallbacks`, `use2` pour « Utiliser A avec B »), tirée au hasard, jamais deux
   fois la même de suite. Un verbe sans liste de repli prend la liste de `look`, sinon dit « … ».

```ts
// rules.ts
export const rules = {
  fallbacks: {
    look: ['Hmm. {item}. Rien de suspect. Pour l’instant.'],
    take: ['Ce n’est pas à moi.', 'Trop lourd. Même pour moi.'],
    use2: ['{item} avec {target} ? Ça ne marche pas. Mais ça valait le coup d’essayer.'],
    // … un tableau par verbe : give, open, close, take, look, talk, use, push, pull, use2
  },
  kinds: [
    { verb: 'pull', kind: 'cat', say: 'Non ! On ne tire jamais la queue d’un chat.' },
    { verb: 'take', target: 'grandma', say: 'Grand-mère a déjà bien assez à porter.' },   // cible précise : passe en premier
    { verb: 'take', kind: 'person', say: 'Je ne peux pas porter {name}. Mais {name} pourrait me porter.' },
    { verb: 'use', item: 'stinky_cheese', kind: 'person', say: 'Non. Même moi, je ne suis pas si méchant.' },
  ],
  on: [
    { id: 'combine.postcard', verb: 'use', a: 'left_half', b: 'right_half', do: [{ lose: 'left_half' }, { lose: 'right_half' }, { gain: 'postcard' }] },
  ],
};
```

Dans les répliques de repli, de sorte et de refus, `{item}` est remplacé par le nom de l'objet, `{target}` par celui de
la cible (vide s'il n'y en a pas), `{name}` par le nom de ce qui est visé. `{objet}`, `{cible}` et `{nom}` sont les
trois mêmes sous leurs noms de la 4.0 : tout jeu écrit avec eux continue de marcher. Le `item` d'une réaction par sorte
la limite à un objet utilisé ou donné.

> [!GUARANTEE id=fallback-order]
> Sans règle écrite, une réaction par sorte répond quand l'une correspond. Un objet donné à un personnage qui refuse
> reçoit son refus, pas la réponse de repli du verbe. Le reste reçoit la réponse de repli.

Quand une réaction par sorte et un refus correspondent tous deux à un don, la réaction par sorte répond.

**Écrire la couche de repli.** La plupart des clics ne tombent sur aucune règle écrite : ce qui leur répond, c'est la
voix du jeu.

- **3 à 6 variantes par verbe** dans `rules.fallbacks`, plus `use2`. La démo en a deux ou trois ; visez plus haut.
- **Écrivez-les dans le ton du personnage.** Le `push` de Pixel : « Ça ne bouge pas. Il me faut un plus gros petit
  déjeuner. » Son `use2` : « Ça ne va pas ensemble. Comme les chats et les bains. »
- **`kinds`** répond à toute une famille d'un coup : aucun `cat` ne se laisse tirer, aucune `person` ne se laisse
  porter. Une `target` précise l'emporte sur une `kind`.
- **`refuse` par personnage** répond à tout Donner sans règle : Lou dit « Merci, mais mes poches sont pleines. Des
  affaires des autres. »
- **« Ça ne marche pas » n'est jamais acceptable.** Ça n'apprend rien au joueur. Une réponse de repli doit être une
  blague, un indice sur ce que veut le héros, ou les deux ([concevoir les énigmes](create.puzzle-design.md#fallbacks)).

<a name="once"></a>

## `once`, quatre fois

Le mot désigne une seule idée, un effet qui n'arrive qu'une fois par partie, sur quatre choses : la commande
`{ once: […], id }` ne lance sa liste que la première fois ; `once: true` sur une option d'un `choice` ne la montre
qu'une fois ; `once: true` sur un écouteur (`events`) ne le déclenche qu'une fois ; un signal du monde extérieur
s'applique une fois par défaut (`once: false` le répète à chaque nouvelle livraison). Le moteur retient chacun dans la
sauvegarde, sous l'id stable de la chose.

<a name="double-tap"></a>

## Un double tap : le verbe que le joueur veut dire

Sur un téléphone, un simple tap marche jusqu'à une chose ; un double tap agit dessus sans choisir de verbe
([`src/engine/core/default-verb.ts`](../../src/engine/core/default-verb.ts)) :

- on passe une sortie (son premier verbe que le jeu possède) ;
- on parle à un personnage ;
- on regarde tout le reste.

Quand ce n'est pas le bon verbe, la chose nomme le sien :
`hotspots: { cupboard: { name: 'placard', defaultVerb: 'open' } }` (aussi sur un accessoire, un acteur, une sortie). Un
objet pris dans le sac sans verbe est donné à un personnage, et utilisé sur tout le reste ; la ligne de phrase dit
lequel avant le tap. Un verbe que le jeu n'a pas n'est jamais choisi. Le côté joueur : [commandes](play.controls.md).

<a name="exit-on-tap"></a>
<!-- applies: .. since 4.2.4 -->

## Un simple tap qui passe une sortie

Dans les classiques de LucasArts, un clic sur une porte avec le « Aller vers » par défaut y faisait passer le héros.
`input: { exitOnTap: true }` dans `game.ts` fait pareil : un simple tap sur une sortie, sans verbe choisi, y marche et
la passe à l'arrivée, avec le verbe du double tap (une sortie fermée dit sa réplique `locked`). Un verbe choisi
l'emporte toujours, un tap ailleurs pendant la marche redirige toujours le héros, et rien n'est passé ; le double tap
ne change pas. Une sortie peut dire autre chose : `onTap: 'walk'` la garde en simple marche dans un jeu qui a
l'interrupteur, `onTap: 'go'` la fait passer dans un jeu qui ne l'a pas
(`exits: { path: { name: 'chemin', to: 'village', onTap: 'go' } }`). Désactivé par défaut.

> [!LIMIT id=input-only]
> `exitOnTap`, `onTap`, `defaultVerb` et les touches des verbes ne concernent que la saisie : ni les règles, ni le
> solveur, ni les sauvegardes ne les voient.

<a name="hotspot-on-tap"></a>
<!-- applies: 4.4.0.. since 4.4.0 -->

## Une zone cliquable qui agit au simple tap

Une zone cliquable peut aussi dire `onTap: 'go'` : un simple tap y marche et agit à l'arrivée avec son `defaultVerb`.
Par exemple un rayon sans fin qui dit pourquoi on ne s'y engage pas. Sans cela, un tap sur une zone ne fait qu'y
marcher ; `input.exitOnTap` ne concerne que les sorties et n'y change rien.

```room-example
{
  "room": {
    "id": "shop",
    "name": "La boutique",
    "decor": "decor/shop",
    "hotspots": {
      "aisle": { "name": "rayon", "defaultVerb": "use", "onTap": "go" },
      "cupboard": { "name": "placard", "defaultVerb": "open" }
    },
    "look": { "aisle": "Des étagères à perte de vue.", "cupboard": "Un placard." },
    "on": [
      { "id": "shop.use-aisle", "verb": "use", "a": "aisle", "do": ["Ce rayon ne finit jamais. Je n'y vais pas."] },
      { "id": "shop.open-cupboard", "verb": "open", "a": "cupboard", "do": ["Vide. Évidemment."] }
    ],
    "hints": [{ "id": "shop.hint", "until": "never", "lines": ["Pas dans le rayon."] }]
  },
  "layout": {
    "walk": { "area": [[20, 300], [620, 300], [630, 395], [10, 395]] },
    "entries": { "default": [320, 360] },
    "hotspots": {
      "aisle": { "rect": [400, 120, 120, 180], "approach": [460, 320] },
      "cupboard": { "rect": [80, 150, 90, 150], "approach": [125, 320] }
    }
  }
}
```

<a name="verb-keys"></a>
<!-- applies: .. since 4.3.0 -->

## Une touche par verbe

Sur ordinateur, les jeux LucasArts choisissaient un verbe au clavier : O pour Ouvrir, L pour Regarder. Le `key` d'un
verbe fait pareil : `{ id: 'open', label: 'Ouvrir', color: '#8fd3ff', key: 'o' }`. La touche, en majuscule ou
minuscule et sans Ctrl, Alt ni Meta, choisit le verbe comme un tap sur son bouton (et le retire s'il est déjà choisi).
Elle ne fait rien quand le moteur est occupé, qu'une réplique est à l'écran, ou qu'une conversation, la carte, un
mini-jeu ou un menu couvre la scène. Le bouton souligne la première occurrence de la lettre dans son libellé et
l'annonce au lecteur d'écran (`aria-keyshortcuts`).

La touche se traduit avec le libellé (`verb:open/key` dans les locales : le `c` de Close est le `f` de Fermer).
`npm run validate` refuse une touche qui ne fait pas un caractère, Espace (elle fait avancer une réplique) et une
touche partagée par deux verbes, dans le jeu comme dans chaque traduction, et prévient quand le libellé ne contient
pas la lettre. Choisissez les lettres une fois les libellés écrits : « Pousser », « Prendre » et « Parler »
commencent tous par P, l'un d'eux prendra donc une autre lettre de son libellé. Sans `key`, pas de raccourci.

Avec `settings: true`, les réglages offrent une ligne « Verb keys » (`ui.verbKeys`) dans tout jeu dont les verbes ont
des touches, pour que le joueur puisse les couper, comme le demande le critère WCAG 2.1.4 pour un raccourci d'une seule
lettre (quelqu'un qui tape à la voix, ou qui frappe des touches par mégarde) ; `npm run validate` prévient des touches
sans menu de réglages. Rien ne se passe non plus pendant le générique.

<a name="related"></a>

## Identifiants liés

- `on`, `rules.on`, `rules.kinds`, `rules.fallbacks`, `refuse`, `defaultVerb`, `onTap`, `input.exitOnTap`,
  `VerbDef.key`.
- [Commandes](create.commands.md), [conditions](create.conditions.md), [sorties](create.exits.md),
  [la référence du DSL](create.dsl.md), [ADR 0006, le double tap](../../docs/dev/adr/0006-double-tap-default-verb.md).
