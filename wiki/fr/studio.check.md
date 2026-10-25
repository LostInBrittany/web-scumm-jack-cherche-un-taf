# Vérifier : validateur, solveur, chemin critique, chaleur, santé, couverture

L'onglet Check lance le validateur et le solveur après chaque enregistrement et présente ce qu'ils ont trouvé, avec la
carte du monde, le graphe de puzzles, le lint de contenu, les playtests et la couverture du storyboard, chacun le même
texte qu'un outil MCP renvoie.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un jeu dont vous savez qu'il se finit depuis New Game (ou depuis un checkpoint), et la liste de ce qui le bloque quand
il ne se finit pas : erreurs de validation, impasses, objets jamais utilisés, lieux jamais atteints, règles que rien
ne déclenche.

<a name="context-and-versions"></a>

## Contexte et versions

Le Studio local, dans le dépôt du moteur ou un projet créé. Vrai depuis la 4.2.1. Le Studio de démo lance Validate et
Solve dans la page ; la capture d'écran et les playtests demandent le serveur de dev. Les mêmes vérifications en ligne
de commande : [Vérifier son jeu](create.checking.md).

<a name="prerequisites"></a>

## Prérequis

- Le Studio lancé ([présentation](studio.overview.md)).
- Pour **Screenshot** seulement : Playwright et son Chromium ([doctor](install.doctor.md)).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le navigateur, sur l'onglet Check. Chaque panneau nomme la commande qui donne le même résultat dans le dépôt du
moteur ou le projet créé.

<a name="steps"></a>

## Étapes

<!-- step: run -->
1. **Laissez tourner.** Le validateur et le solveur tournent après chaque enregistrement ; le badge de l'onglet montre
   le résultat. **Run again** les relance à la main. **Solve from** choisit le départ : New game, ou un checkpoint (un
   checkpoint inconnu donne un 400).

<!-- step: read-solver -->
2. **Lisez le solveur.** D'abord les erreurs et avertissements du validateur, puis le solveur : fini ou non, le chemin
   trouvé, les lieux atteints, ce qui a été débloqué, les objets jamais utilisés et jamais obtenus, et les
   **impasses** (lieu, inventaire, et le chemin qui y mène).

<!-- step: read-graph -->
3. **Interrogez le graphe de puzzles** (plus bas) sur ce qui dépend d'une énigme avant de la changer.

<!-- step: screenshot -->
4. **Screenshot** rend un lieu à un checkpoint, surcouches de l'éditeur cachées, dans
   `.cache/studio/<jeu>-<lieu>[-<checkpoint>].png`.

<a name="panels"></a>

### Les panneaux

| Panneau | Ce qu'il montre | Équivalent |
|---|---|---|
| **Validator** | Erreurs et avertissements du contenu | `npm run validate`, l'outil `validate` |
| **Solver** | Fini ou non, le chemin, lieux atteints, débloqués, objets jamais utilisés ou obtenus, impasses | `npm run solve`, l'outil `solve` |
| **World** | La carte du monde : lieux, sorties, gotos ; lieux inaccessibles et sorties sans retour en rouge | l'outil `world_graph` |
| **Content report** | Ce que pèse chaque lieu, objet et personnage | `npm run validate -- --report`, l'outil `content_report` |
| **Puzzles** | Le graphe de puzzles (plus bas) | `npm run page:puzzles`, l'outil `puzzle_graph` |
| **Solver health** | Exécutions du moteur, actions sautées, actions sans effet, actions par état, les dimensions qui séparent le plus les états, et les avertissements qu'un auteur traite : dimensions indépendantes (un checkpoint entre elles couperait les états), un lieu au branchement démesuré | `npm run solve -- --profile` (le profil complet sous **Full profile**) |
| **Playtests** (serveur de dev seulement) | Les sessions de `games/<id>/playtests/` rejouées et cumulées | `npm run playtests`, l'outil `playtests` |
| **Content lint** | Erreurs, avertissements et infos, chacun un lien vers l'onglet Rooms | `npm run lint`, l'outil `lint` |
| **Storyboard coverage** | Le storyboard confronté au contenu | l'outil `storyboard_coverage` |
| **Changes between revisions** (serveur de dev) | Ce qui a changé entre deux révisions | [Diff sémantique](studio.semantic-diff.md) |

<a name="puzzle-graph"></a>

### Le graphe de puzzles

Chaque règle, sujet, script et écouteur, avec ce qu'il exige (flèches grises, pointillées quand c'est lu à l'intérieur
de ses commandes) et ce qu'il produit (vert) ou consomme (rouge). Toucher un objet, un flag, un accessoire, un lieu ou
un événement affiche sa fiche : obtenu par, utilisé par, exige d'abord, débloque, en aval, et pourquoi le solveur le
garde (critical, world, visible ou dead, avec la chaîne jusqu'à la fin), le même texte que renvoie l'outil
`puzzle_graph`.

Deux interrupteurs au-dessus du graphe :

- **Critical path** estompe tout ce qui ne mène pas à la fin, à un objectif ou à un invariant.
- **Heat** colore chaque règle, sujet, écouteur, script et lieu selon le nombre de fois où le solveur y est passé. Son
  sélecteur peut colorer les nœuds d'après les sessions des joueurs (les playtests) plutôt que les passes du solveur.

**Le lire avant de toucher une énigme.** La fiche de la clé du garde-manger dans la démo dit : obtenue par *give
bouquet + seller* ; utilisée par *use key + pantry* et l'objectif du final ; exige d'abord *bouquet*, *flowers_done*,
*bouquet_given* ; débloque le garde-manger et la fin. Retirez l'échange du bouquet et la fiche dit ce qui casse avant
le solveur. La vue d'ensemble liste trois signes suspects :

- une chose **lue mais jamais produite** (un flag que personne ne pose) ;
- une chose **produite mais jamais utilisée** (un flag ou un objet qui ne mène nulle part) ;
- un flag **posé seulement par des actions qui en ont déjà besoin** : il ne peut jamais devenir vrai (le validateur
  prévient aussi).

Concevoir ses énigmes avec : [Conception des énigmes](create.puzzle-design.md#puzzle-graph).

> [!LIMIT id=solver-scope]
> Le solveur dit s'il existe **un** chemin vers la fin depuis le départ choisi ; sa recherche est bornée, et une
> recherche tronquée le dit. Ce qu'un résultat permet de conclure, et la preuve exhaustive (`--prove`) :
> [Ce que prouve le solveur](create.solver-proofs.md).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Le badge de l'onglet est vert ; le solveur dit qu'il a fini, sans impasse ; le lint n'a pas d'erreur. En ligne de
commande, dans le dépôt du moteur :

```sh
# dans le dépôt du moteur (ou un projet créé : npm run verify)
npm run validate && npm run solve
```

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Que faire |
|---|---|---|
| Screenshot : 501 `unavailable` | Playwright ou son Chromium manque | `npm i -D playwright && npx playwright install chromium` |
| 400 pour **Solve from** | Le checkpoint n'est pas dans le jeu | En choisir un de la liste |
| Le solveur ne finit pas | Une impasse ou un objectif inatteignable | Lire les impasses et la fiche de l'objet qui manque dans le graphe |
| Pas de panneau Playtests | Aucune session dans `games/<id>/playtests/`, ou la démo | Ajouter des sessions ([Playtests](create.playtests.md)) |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Aucun dans le jeu. Les captures vont dans `.cache/studio/`.

<a name="references"></a>

## Références

- [`src/studio/check.ts`](../../src/studio/check.ts) ; les outils du moteur dans [`src/engine/tools/`](../../src/engine/tools).
- [Vérifier son jeu](create.checking.md), [Options du solveur](create.solver-options.md), [Outils MCP](studio.mcp-tools.md).
