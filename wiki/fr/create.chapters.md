# Chapitres et objectifs

Un long jeu se vérifie, et se joue, mieux par morceaux. Trois déclarations de `game.ts` le découpent : les
**checkpoints** avec `goals` (les chapitres que le solveur prouve un par un), les **invariants** (ce qui ne doit jamais
arriver) et les **objectifs** (ce que le joueur doit faire, affiché dans le journal de quêtes). Cette page en est la
référence, et dit pourquoi ils sont séparés.

Les outils sont écrits par leur nom ci-dessous (`solve`, `validate`). Dans un projet créé, ils se lancent avec
`npx quest-n-click solve …` ; dans le dépôt du moteur, avec `GAME=<id> npm run solve -- …`.

<a name="invariants"></a>

## Chapitres et invariants

Un checkpoint est un état tout prêt : un lieu, un inventaire, des drapeaux, des places débloquées, des états
d’accessoires, la position des personnages mobiles et, dans un jeu à plusieurs personnages jouables, qui est actif et
où se tiennent les autres. En développement, on peut y sauter ; le solveur peut en partir
(`solve --from=<checkpoint>`).

Un checkpoint avec `goals` est **la fin d’un chapitre**. `solve --chapters` prouve chaque chapitre
séparément, depuis le checkpoint précédent (ou une nouvelle partie) jusqu’à ce que ses objectifs tiennent, puis du
dernier checkpoint à la fin : un jeu long se vérifie en petites recherches bornées, et un chapitre cassé est nommé.

```ts
checkpoints: {
  jardin: { room: 'jardin', inventory: ['jeton'], goals: [{ has: 'jeton' }] },
  marche: { room: 'marche', …, goals: ['cuve_videe', { unlocked: 'marche' }] },
},
// Ne doit jamais devenir vrai (le solveur donne le chemin qui le rend vrai) :
invariants: [{ all: [{ not: { has: 'jeton' } }, '!fleurs_faites'] }],
```

### Les champs d’un checkpoint

| Champ | Sens |
|---|---|
| `room` (obligatoire) | Le lieu de l’état. |
| `inventory`, `flags`, `unlocked`, `props` | L’inventaire, les drapeaux, les places de carte débloquées et les états d’accessoires (clés `<lieu>.<accessoire>`). |
| `where` | Où sont les personnages mobiles (personnage → lieu) ; les autres sont dans leur lieu de départ. |
| `active`, `players` | Plusieurs personnages jouables : qui est actif, et le lieu, l’inventaire et les objets utilisés des autres. |
| `used`, `seen` | Les objets déjà utilisés, et les sujets, écouteurs et choix déjà vus (clés de `seen` par id, comme `topic.<id>`). |
| `goals` | Les conditions qui doivent toutes tenir à la fin du chapitre qui finit ici. Seul un checkpoint avec `goals` termine un chapitre. |

`invariants` est une liste de conditions de `game.ts` qui ne doivent **jamais** devenir vraies. Le solveur donne le
chemin qui en rend une vraie.

### Lancer la preuve

```sh
# dans le projet créé
npx quest-n-click solve --chapters

# dans le dépôt du moteur
GAME=<id> npm run solve -- --chapters
```

Avec `--prove`, `--chapters` prouve chaque chapitre depuis **chaque** état frontière atteignable du précédent
(dédoublonnés selon ce que le chapitre lit), et non depuis le checkpoint écrit à la main ; ce checkpoint doit alors
être l’un de ces états frontières (`used` et `seen` lui permettent de nommer ce que tient l’état frontière). Un jeu
sans aucun checkpoint avec `goals` est prouvé par la recherche globale (`--prove`), et ce n’est pas un échec. Les
options sont dans [Options du solveur](create.solver-options.md).

> [!LIMIT id=chapters-hand-written-start]
> Sans `--prove`, chaque chapitre part de son checkpoint écrit à la main. Si ce checkpoint n’est pas un état que le
> chapitre précédent peut vraiment atteindre, la preuve du chapitre ne dit rien du vrai jeu : vérifiez-le avec
> `--prove`.

<a name="objectives"></a>

## Objectifs et journal de quêtes

`objectives` nomme ce que le joueur doit faire. Depuis la 4.1.12, il alimente trois choses :

- la liste **Objectifs** du menu pause (une étape sous son parent, ✓ fait, ○ ouvert, un objectif secondaire en
  italique) ;
- le journal sémantique : `objectiveCompleted`, une fois, la première fois que `done` tient après une action ;
- le solveur : `solve --goal=100%` cherche un état où chaque objectif non `optional` tient, au lieu de la
  fin.

```ts
objectives: {
  cle: { title: 'Trouver la clé du garde-manger', done: { any: [{ has: 'cle' }, 'garde_manger_ouvert'] } },
  cuve: { title: 'Vider la citerne', done: 'cuve_videe', parent: 'cle' },
  garde_manger: { title: 'Ouvrir le garde-manger', done: 'garde_manger_ouvert' },
  pari: { title: 'Deviner ce qu’il y a dedans', done: 'pari', optional: true },
},
```

| Champ | Sens |
|---|---|
| `title` (obligatoire) | Ce qu’affiche le journal. Se traduit sous `objectives/<id>.title`. |
| `done` (obligatoire) | La condition qui l’accomplit. |
| `optional` | Un objectif secondaire : hors des 100 %. |
| `parent` | L’objectif dont celui-ci est une étape : le journal l’affiche sous son parent. |

Écrivez `done` comme une condition qui **reste vraie une fois vraie** (un drapeau levé une fois, un objet gardé). Le
journal ne reprend jamais un objectif accompli, mais une partie chargée plus tard ne compte comme faits que ceux qui
tiennent à ce moment.

`validate` refuse :

- un id fait d’autre chose que des lettres, des chiffres et `. _ -`, ou plus long que 64 ;
- un `title` ou un `done` absent ;
- un `done` qui ne peut jamais tenir (un drapeau que rien ne lève, un objet que rien ne donne), avec la raison ;
- un `parent` inconnu, et un cycle de parents.

Il avertit quand un `done` non `optional` peut être défait par le contenu : le journal le garde accompli, mais
`--goal=100%` exige que tous les objectifs tiennent en même temps.

Les titres se traduisent comme tout texte, et la ligne du menu est `ui.objectives` (valeur anglaise par défaut
« Objectives »). L’onglet **Language** du Studio les édite ([Langue et objectifs](studio.language-objectives.md)) ;
l’outil MCP `set_value` les écrit avec `id: "@game"`. Chaque condition et chaque commande, avec sa forme, est dans la
[référence du DSL](create.dsl.md).

<a name="speedrun"></a>

## Les catégories de speedrun, dans le même fichier

`speedrun` (4.1.14) déclare des catégories et des splits de speedrun dans le contenu : des déclencheurs sur les
événements sémantiques (un lieu atteint, un objet acquis, un objectif accompli, la fin), les règles de chaque
catégorie (sauvegardes, pauses, indices, rechargements, Reality, les composants d’empreinte qu’un run doit égaler, les
entrées) et la version des règles. `validate` le vérifie ; le guide est
[Le speedrun pour les auteurs](create.speedrun.md).

<a name="why"></a>

## Pourquoi trois déclarations, et pas une

- **Un checkpoint sert à l’auteur et au solveur** ; le joueur ne le voit jamais. Ses `goals` découpent la preuve en
  recherches bornées : un long jeu n’est pas une seule recherche qui manque d’états.
- **Un objectif sert au joueur.** Il dit quoi faire ensuite, et le journal note quand c’est fait. Ce n’est pas un
  chapitre : les objectifs s’accomplissent dans n’importe quel ordre, et un objectif secondaire ne bloque jamais la fin.
- **Un invariant est une propriété de sûreté** : quelque chose que le contenu ne doit jamais permettre, quoi que fasse
  le joueur. Le solveur le vérifie sur chaque état qu’il explore.
- **L’ensemble des objectifs accomplis n’est pas dans la sauvegarde.** Ce qui tient déjà quand une partie commence, se
  charge ou saute à un checkpoint est compté comme fait, sans bruit. Le format de sauvegarde n’a pas changé pour les
  objectifs, et l’état du solveur n’a pas grossi ; le prix, c’est qu’un objectif dont la condition a tenu puis ne
  tient plus redevient ouvert après un chargement, d’où le conseil d’écrire `done` comme une condition qui reste vraie.

Pourquoi les objectifs sont une primitive à part (un checkpoint est un point de départ, un drapeau dit un fait, aucun
ne dit qu’un joueur a fini quelque chose) et quand le moteur les accomplit :
[ADR 0014](../../docs/dev/adr/0014-objectives.md).

<a name="related"></a>

## Identifiants liés

- `solve` et ses options `--chapters`, `--prove`, `--from`, `--goal=100%` :
  [Options du solveur](create.solver-options.md), [Ce que prouve le solveur](create.solver-proofs.md).
- Les conditions (`has`, `unlocked`, `all`, `any`, `not`, `flag`) : [Conditions](create.conditions.md).
- Le journal sémantique et `objectiveCompleted` : [Modèle d’exécution](engine.execution-model.md).
