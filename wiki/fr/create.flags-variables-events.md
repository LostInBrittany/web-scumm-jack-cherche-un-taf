# Drapeaux, variables et événements : lequel choisir

Un drapeau (flag) est un état : la porte *est* ouverte. Un événement est un moment : la cloche *vient* de sonner.
quest'n'click n'a pas de « variable » à part : un drapeau contient une valeur (un booléen, un nombre ou une chaîne),
si bien qu'un compteur ou un choix est aussi un drapeau. Cette page dit ce qu'est chacun, ce que le moteur en garde, et
comment choisir.

<a name="why"></a>

## Ce qu'est chacun

**Un drapeau** est une valeur nommée dans la sauvegarde (`GameState.flags`), posée par des commandes et lue par des
[conditions](create.conditions.md) :

| Écrire | Lire |
|---|---|
| `{ set: 'door_open' }` (vrai) | `'door_open'`, `'!door_open'` |
| `{ set: ['guess', 'grandpa'] }` (une chaîne), `{ set: ['tries', 3] }` (un nombre) | `{ flag: 'guess', eq: 'grandpa' }`, `{ flag: 'tries', gte: 3 }`, `{ flag: 'tries', lt: 3 }` |
| `{ inc: 'tries' }`, `{ inc: 'tries', by: -1 }` (un drapeau absent ou non numérique compte à partir de 0) | pareil |
| `{ unset: 'door_open' }` (retiré : faux, absent) | |

Un drapeau reste jusqu'à ce que quelque chose le change ; une sauvegarde le garde, un chargement le restaure. On nomme
les drapeaux comme on veut ; le validateur prévient d'un drapeau lu et jamais posé, ou posé et jamais lu. Un mini-jeu
qui dit comment il s'est terminé écrit le drapeau réservé `minigame.<id>` (4.1.16). Un texte peut afficher la valeur
d'un drapeau par un aiguillage de texte, `{form?gull=e|*=}` ([traductions](create.translations.md)).

**Un événement** est un nom déclenché par `{ emit: 'bell_rang' }`. Sur-le-champ, dans l'ordre, il fait avancer chaque
script en pause sur `{ waitEvent: 'bell_rang' }`, puis lance les écouteurs de la salle courante, puis ceux du jeu
([scripts et événements](create.scripts-events.md#events)) :

```ts
// market.ts, dans une règle :  { gain: 'key' }, { emit: 'key_found' }
// game.ts :
events: [
  { id: 'grandpa.goes-home', on: 'key_found', once: true, do: [{ moveActor: ['grandpa', 'house'] }, { toast: 'Papi est rentré.' }] },
],
```

`if` et `once` marchent comme sur une règle. **Un événement n'est pas retenu** : une fois ses écouteurs passés, il
n'en reste rien, sauf ce qu'ils ont changé (et, pour un écouteur `once`, la marque qu'il s'est déclenché). Un écouteur
d'une salle où le joueur n'est pas ne l'entend pas.

D'autres parties de l'état répondent à « est-ce arrivé ? » sans drapeau : l'état d'un accessoire
(`{ prop: ['lamp', 'on'] }`), l'inventaire (`{ has }`), une salle visitée (`{ visited }`), l'endroit où se trouve un
personnage mobile (`{ actorIn }`), un sujet entendu (`{ seen }`), le compte d'un bloc `once`, `nth`, `cycle` ou
`random`.

<a name="choosing"></a>

## Comment choisir

| Vous voulez | Prenez |
|---|---|
| Retenir qu'une chose est arrivée, et le tester plus tard (salle suivante, partie suivante) | un drapeau : `{ set: 'x' }`, puis `'x'` |
| Un compteur (essais, pièces, un prix qui baisse) | un drapeau numérique : `{ inc }`, `{ flag, gte/lt }` |
| Un choix parmi plusieurs (le pari du joueur, le héros choisi) | un drapeau texte : `{ set: ['guess', 'grandpa'] }`, `{ flag, eq }` |
| Quelque chose qui se voit (une lampe allumée, un tiroir ouvert) | un état d'accessoire, pas un drapeau : l'image et la condition restent une seule chose |
| Que plusieurs endroits réagissent **maintenant** à un même moment, sans que chaque règle connaisse les autres | un événement : `{ emit }` et des écouteurs |
| Un script qui attend un moment (la cuisinière vient quand le gong sonne) | un événement : `{ waitEvent }` |
| Un script qui attend un état | un drapeau ou n'importe quelle condition : `{ waitUntil: COND }` |
| Une chose dite seulement la première fois | `{ once: […], id }`, sans drapeau |
| Une salle qui réagit plus tard à un événement arrivé ailleurs | l'écouteur pose un drapeau ; le `onEnter` de la salle le teste |

La dernière ligne est le schéma habituel : un événement n'est pas retenu, donc pour réagir la prochaine fois que le
joueur entre dans une salle, posez un drapeau dans l'écouteur et testez-le dans `onEnter`.

```ts
events: [{ id: 'bell.heard', on: 'bell_rang', do: [{ set: 'bell_rang_once' }] }],
// hall.ts
onEnter: [{ if: 'bell_rang_once', then: [{ say: ['butler', 'Vous avez sonné ?'] }] }],
```

<a name="alternatives"></a>

## Solutions écartées

- **Des variables typées à côté des drapeaux.** Un second stockage, c'est une chose de plus à sauvegarder, à migrer, à
  montrer dans le panneau DEV et à expliquer ; un drapeau qui contient une valeur couvre compteurs et choix.
- **Des événements retenus** (un journal de moments que les conditions pourraient interroger). Les conditions
  dépendraient alors de l'historique, et les états du solveur grossiraient avec lui. Un drapeau posé par un écouteur
  dit exactement ce qui mérite d'être retenu.
- **Du code dans les écouteurs.** Les écouteurs sont des données, comme les règles : le validateur, le solveur et la
  sauvegarde les comprennent ([principes](create.principles.md#why)).

<a name="trade-offs"></a>

## Compromis

- Chaque drapeau que voit le solveur fait partie de l'état qu'il explore : un drapeau que personne n'a besoin de lire
  ralentit les preuves. `npm run lint` et `validate` désignent les drapeaux jamais lus.
- `{ flag, lt }` est vrai pour un drapeau absent : testez d'abord `gte`, ou posez le drapeau au départ (`start.flags`
  dans `game.ts`), quand absent doit vouloir dire « zéro essai ».
- Renommer un drapeau casse les anciennes sauvegardes, sauf si une migration le renomme aussi
  (`migrations: [{ from, renameFlag }]`, [état et sauvegardes](create.state-saves.md)).

> [!LIMIT id=event-not-remembered]
> Un événement déclenché pendant que la condition d'un écouteur est fausse, ou dans une salle dont les écouteurs ne
> sont pas concernés, est perdu pour cet écouteur : rien ne le rejoue plus tard. Prenez un drapeau pour tout ce qui doit
> durer.

<a name="decisions"></a>

## Décisions et ADR

- [ADR 0002, le contenu est une donnée](../../docs/dev/adr/0002-declarative-content.md) : écouteurs et drapeaux sont des
  données que lisent les outils.
- [ADR 0003, le solveur fait tourner le vrai moteur](../../docs/dev/adr/0003-solver-runs-the-engine.md) : chaque
  drapeau fait partie de l'état qu'il explore.
- Références : [commandes, logique](create.commands.md#logic), [conditions](create.conditions.md),
  [scripts et événements](create.scripts-events.md), la [référence du DSL](create.dsl.md), générée.
