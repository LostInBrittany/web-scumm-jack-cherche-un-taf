# Sorties

Comment un lieu mène à un autre. On peut écrire une sortie à la main, comme un hotspot plus une règle qui lance
`goto` ; la déclarer dans les `exits` du lieu est plus court, et donne aux outils la carte du monde. Cette page est la
référence de `exits`.

<a name="overview"></a>

## Sorties, chapitres et sauvegardes : où trouver quoi

L’ancien chapitre « Sorties, chapitres, sauvegardes » du guide du contenu tient désormais en trois pages :

- les sorties d’un lieu : cette page ;
- les chapitres, invariants et objectifs : [Chapitres et objectifs](create.chapters.md) ;
- les emplacements de sauvegarde, les migrations et ce qu’une sauvegarde garde : [État et sauvegardes](create.state-saves.md).

<a name="declared-exits"></a>

## Les sorties déclarées

Dans un fichier de lieu (`game/rooms/<lieu>.ts` dans un projet créé, `games/<id>/rooms/<lieu>.ts` dans le dépôt du
moteur) :

```ts
exits: {
  fenetre: { name: 'fenêtre du jardin', to: 'jardin', entry: 'maison', if: { unlocked: 'jardin' },
    locked: 'Pas encore. D’abord, la clé.', sfx: 'porte', verbs: ['use', 'open', 'push'] },
  trappe: { name: 'trappe', to: 'cave', oneWay: true },
},
```

Ce qu’en fait le moteur quand il compile le jeu (`normalizeExits` dans
[src/engine/core/define.ts](../../src/engine/core/define.ts)) :

1. **Un hotspot du même id**, de kind `exit` (plus les kinds ajoutés dans `kind`), visible quand `visible` tient. On le
   place dans le layout comme toute zone, et sa ligne de regard va dans le `look` du lieu, comme pour tout hotspot.
2. **Des règles ajoutées à la fin du `on` du lieu** : « VERBE sortie → `goto` » quand `if` tient (précédé du `sfx`
   s’il y en a un), puis une seconde règle qui dit la ligne `locked`. Leurs ids sont `exit.<lieu>.<sortie>.go` et
   `exit.<lieu>.<sortie>.locked`.
3. **Vos propres règles passent avant.** Une règle écrite sur la sortie est évaluée avant les règles générées : une
   réaction spéciale (un objet utilisé sur la porte) gagne toujours.

Quand `if` ne tient pas et qu’il n’y a pas de ligne `locked`, c’est la réponse par défaut du verbe qui s’affiche, comme
pour tout hotspot sans règle qui corresponde.

À partir des sorties, des commandes `goto` et de la carte, le validateur sait **quels lieux ne sont atteints par rien**
et **quelles sorties n’ont pas de retour** ; l’onglet Check du Studio et, dans le dépôt du moteur, `npm run page:world` dessinent
cette carte (voir [Pages de relecture](create.review-pages.md)). Ce que fait un simple tap sur une sortie, c’est `onTap`, plus bas.

<a name="exit-fields"></a>

## Les champs d’une sortie

### Forme

`exits` est un dictionnaire dans un lieu : la clé est l’id de la sortie (c’est aussi l’id de son hotspot), la valeur
un objet avec les champs ci-dessous. Le type est `ExitDef`, dans
[src/engine/core/types/content.ts](../../src/engine/core/types/content.ts).

| Champ | Type | Sens |
|---|---|---|
| `name` | texte, obligatoire | Le nom affiché au survol et dans la ligne d’action. Se traduit comme tout texte. |
| `to` | id de lieu, obligatoire | Le lieu où mène la sortie. |
| `entry` | id de point d’entrée, ou `[x, y]` | Où apparaît le héros : un point d’entrée du layout du lieu cible (`entries`), ou un point. Sans lui, voir plus bas. |
| `if` | condition | La sortie ne se prend que tant qu’elle tient. |
| `locked` | texte | Ce que dit le héros quand il essaie la sortie alors que `if` ne tient pas. |
| `verbs` | ids de verbes | Les verbes qui prennent la sortie. |
| `sfx` | id de son | Joué au départ (un id de `audio.sfx`). |
| `visible` | condition | Le hotspot n’apparaît que tant qu’elle tient. |
| `kind` | texte[] | Des kinds en plus pour le hotspot, après `exit`. |
| `oneWay` | booléen | On ne revient pas par là, et c’est voulu : les outils cessent de signaler l’absence de retour. |
| `defaultVerb` | id de verbe | Le verbe d’un double tap sur elle, quand le verbe logique ne convient pas (voir [Réactions](create.reactions.md#double-tap)). |
| `onTap` | `'go'` ou `'walk'` | Ce que fait un simple tap sans verbe choisi : `go` y marche et la franchit à l’arrivée, `walk` y marche seulement. |

### Valeurs et défaut

- `verbs` : par défaut, ceux de `use`, `open`, `walk`, `go`, `enter`, `push`, `pull` que votre jeu possède. Un jeu qui
  n’en a aucun prend tous ses verbes sauf `look`, `talk`, `give` et `take`.
- `onTap` : par défaut `go` quand le jeu pose `input: { exitOnTap: true }` dans `game.ts`, sinon `walk`. Un verbe
  choisi gagne toujours ; un tap ailleurs pendant la marche redirige toujours le héros ; un double tap a toujours
  franchi la sortie. `onTap` et `exitOnTap` ne touchent qu’à la saisie : les règles, le solveur et les sauvegardes ne
  les voient pas.
- `entry` : sans lui, le héros revient là où il se tenait la dernière fois dans le lieu cible ; dans un lieu jamais
  visité, au point d’entrée `default` de son layout (ou en 320, 360 si le layout n’en a pas).

### Contraintes

Le validateur (`npx quest-n-click validate` dans le projet créé, `GAME=<id> npm run validate` dans le dépôt du
moteur) signale :

- une erreur pour un lieu `to` inconnu (`unknown room: "<id>"`), une `entry` qui n’est pas un point d’entrée du layout
  du lieu cible, un verbe inconnu dans `verbs`, un `sfx` inconnu, un `onTap` autre que `go` ou `walk`, et une sortie
  dont l’id est aussi un hotspot que vous avez écrit (`"<id>" is both an exit and a hotspot`) ;
- un avertissement pour une sortie qui mène à son propre lieu, pour un lieu qu’aucune sortie, aucun `goto` ni aucune
  place de la carte n’atteint depuis le départ, et pour une sortie sans retour
  (`no way back from <to> to <from> (add oneWay: true if intended)`).

### Exemple minimal

```ts
// game/rooms/house.ts (projet créé)
exits: { door: { name: 'door', to: 'garden' } },
```

Le hotspot `door` a quand même besoin de sa zone dans `game/layout/house.json`, placée dans l’éditeur du Studio ; le layout
du lieu cible devrait donner un point d’entrée `default`.

### Comportement sur un champ inconnu

Le moteur et le validateur ne le lisent pas. TypeScript le signale, comme pour tout objet littéral écrit dans un
`defineRoom` typé.

### Depuis

Les sorties déclarées existent depuis la 1.4.0 « Scale ». `onTap` et `input.exitOnTap` sont arrivés en 4.2.4 ;
`defaultVerb` en 4.0.0.

> [!LIMIT id=exits-input-only]
> `onTap` et `input.exitOnTap` changent la lecture d’un tap, pas ce que le jeu permet : ils n’ouvrent jamais une sortie
> dont le `if` ne tient pas, et le solveur ne les voit pas.

<a name="related"></a>

## Identifiants liés

- `goto` (la commande que lance une sortie), `entries` (les points d’entrée du layout) :
  [Commandes du jeu](create.commands.md), [Géométrie](create.geometry.md).
- `input.exitOnTap`, `defaultVerb`, le double tap : [Réactions](create.reactions.md#double-tap).
- La carte des places et `unlocked` : [Carte du monde](create.world-map.md).
- Les lieux que rien n’atteint, vus dans le Studio : [Check](studio.check.md).
