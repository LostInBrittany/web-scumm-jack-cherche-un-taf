# Ce que prouve le solveur

Le solveur joue votre jeu sur le vrai moteur et vous dit s'il peut se finir. Selon la façon dont vous le lancez, il
donne trois réponses différentes : un chemin gagnant, une preuve exhaustive, ou une preuve exhaustive avec
abstractions. Elles ne promettent pas la même chose. Cette page dit ce que chacune permet de conclure, et où chacune
s'arrête.

<a name="overview"></a>

## Le solveur fait tourner le vrai moteur

`solve` ([`src/engine/tools/solve/`](../../src/engine/tools/solve/search.ts)) explore le jeu depuis « Nouvelle
partie » avec le même `Engine` que le joueur et un présentateur muet (`FakePresenter`). Il n'y a pas de second modèle
du contenu : ce que le solveur trouve, un joueur peut le faire, et ses chemins se rejouent comme des sessions
(`npm run replay` dans le dépôt du moteur). Le chemin de `solve()` jusqu'au verdict est décrit dans
[`src/engine/BOUNDARIES.md`](../../src/engine/BOUNDARIES.md), « Inside the solver ». Les commandes et leurs options
sont dans [Options du solveur](create.solver-options.md) ; la place du solveur parmi vos vérifications est dans
[Vérifier son jeu](create.checking.md).

<a name="what-it-proves"></a>

## Une fin trouvée, un blocage exclu : ce que chaque réponse permet de conclure

| Vous avez lancé | Il répond | Vous pouvez conclure | Vous ne pouvez **pas** conclure |
|---|---|---|---|
| `npm run solve` (un **chemin gagnant**, ou témoin) | `solved` et un chemin de « Nouvelle partie » à la fin | La fin est atteignable : au moins une suite d'actions, qu'un joueur pourrait jouer, y mène. | Que tout joueur peut finir. Un jeu où un héros choisi à l'intro peut finir et un autre non affiche quand même `solved`. La recherche s'arrête à la première fin trouvée : les états qu'elle n'a pas atteints, autres réponses d'un choix comprises, ne sont pas vérifiés. Aucun blocage n'est exclu. |
| `npm run solve -- --prove` (une **preuve exhaustive**) | `solved` | Depuis **chaque** état qu'un joueur peut atteindre, toutes les réponses de tous les choix et tous les tirages aléatoires compris, la fin reste atteignable : il n'y a aucun blocage (softlock), dans ce que le solveur modélise (plus bas). | Que le jeu est amusant, lisible ou clair : le solveur ne regarde pas l'écran. Qu'un mini-jeu peut être gagné : il suppose que chacun l'est (la ligne `assumptions` les nomme). |
| `npm run solve -- --prove` | `softlocks` | Chaque état listé est atteignable et la fin y est perdue. Les causes sont regroupées par le pas qui l'a perdue, et chaque cause porte ses entrées de session : le chemin qui y mène se rejoue (depuis la 4.1.13). | Que le chemin affiché est le plus court qui existe : c'est le plus court trouvé. |
| l'un ou l'autre | `truncated` | Rien. Un budget (états, temps ou mémoire) a arrêté la recherche. | Quoi que ce soit. Une recherche `truncated` ne dit jamais `solved`, et son code de sortie est 2. |

Le jeu de démo montre la différence : `npm run solve` affiche « The game can be finished » et un chemin de
« (tutorial) Look at pantry » à « Use key with pantry » ; `npm run solve -- --prove` explore tous les états
atteignables et affiche `Proof solved: the ending stays reachable from every one of the … reachable states`. Seul un
`solved` obtenu avec `--prove` est une preuve. La phrase du témoin le dit elle-même : « only --prove checks every
state, every answer of a choice included ».

> [!GUARANTEE id=witness-not-proof]
> Un chemin gagnant n'est pas une preuve : sur un jeu dont la dernière porte ne s'ouvre que pour l'un des héros
> proposés à l'intro, le témoin dit `solved` et `--prove` dit `softlocks`, et seule une preuve résolue dit « stays
> reachable from every one ».

> [!GUARANTEE id=truncated-never-solved]
> Une preuve (`--prove`) arrêtée par son budget d'états, de temps ou de mémoire répond `truncated`, jamais `solved`.

**Une preuve avec abstractions.** Par défaut, `--prove` replie les états qui ne diffèrent que par ce qui ne peut pas
changer l'issue (voir [Les abstractions](#abstractions)). Son `solved` veut alors dire : le même verdict que
donnerait la recherche explicite, à condition que le moteur signale tout ce qu'une exécution lit. Cette condition est
vérifiée, pas supposée :

- pendant la preuve : chaque déplacement silencieux dont dépend une région de mobilité est joué et vérifié, et un
  déplacement qui change quelque chose relance la recherche avec les lieux exacts ; une passation dont dépend le
  propriétaire canonique est jouée aussi, et une qui change quelque chose relance la recherche sans mise en commun ;
  un succès du mémo des no-ops sur 16 est quand même exécuté et comparé, et une différence est une erreur du moteur,
  jamais un saut silencieux ;
- à la demande, pour votre jeu : `npm run solve -- --audit-abstractions` lance la preuve avec les abstractions (chaque
  succès du mémo exécuté) contre la recherche explicite (personnage canonique, régions de mobilité, propriétaire
  canonique et mémo tous désactivés) et compare les verdicts : code 0 identiques, 1 divergents, 2 la recherche
  explicite n'a pas tenu dans `--max`, les verdicts n'ont donc pas été comparés. `npm run release-check` le lance dans
  le dépôt du moteur ;
- chaque nuit, sur des jeux aléatoires : `npm run audit:corpus` (dépôt du moteur).

L'audit compare des verdicts (statut, fin atteinte, invariants cassés, présence de blocages, flags vivants, lieux et
lieux de la carte atteints), pas le nombre d'états ni les chemins : c'est justement ce que les abstractions replient.

> [!LIMIT id=liveness-not-audited]
> Toute recherche, y compris la recherche explicite de l'audit, ne distingue un état que par ce qui est *vivant* (ce
> que le graphe de puzzles dit capable de changer encore l'issue). L'audit vérifie donc les replis listés plus haut,
> pas l'analyse de vivacité elle-même. Une preuve prouve le jeu tel que le graphe de puzzles le lit.

> [!LIMIT id=minigames-assumed-won]
> Le solveur suppose que chaque mini-jeu est gagné. Sa sortie en fait la liste comme hypothèses
> (`assumptions: minigame:pipes:success`). Qu'une personne puisse le gagner, et que son bouton Passer marche, c'est
> l'affaire d'un playtest et de l'e2e.

<a name="statuses"></a>

## Un seul statut

Une exécution du solveur et une preuve par chapitres portent un seul statut, avec son code de sortie et sa phrase
([`src/engine/tools/status.ts`](../../src/engine/tools/status.ts)). `npm run solve` affiche la phrase et sort avec le
code ; `--json` porte `status`, `exit` et `headline` ; l'onglet Check du Studio affiche la phrase ; l'outil MCP
`solve` rend les trois. Aucun ne formule son propre verdict.

| Statut | Code | Sens |
|---|---|---|
| `solved` | 0 | La fin (ou l'objectif d'un chapitre) est atteinte ; avec `--prove`, elle reste atteignable depuis chaque état atteignable. |
| `softlocks` | 1 | Des états atteignables d'où elle ne peut plus être atteinte (`softlockCount`, `softlockCauses`). |
| `unsolved` | 1 | Elle n'est atteinte depuis aucun état exploré. |
| `truncated` | 2 | Un budget a arrêté la recherche : `--max` états, `--time` ou `--mem`. Rien n'est prouvé ; la phrase dit quel budget augmenter. |
| `broken` | 1 | Un invariant (`GameDef.invariants`) est vrai sur un état atteignable, affiché avec son chemin. Avant la 3.3 : `solved` avec le code 1. |
| `error` | 1 | Le moteur a échoué pendant l'exploration. |
| `checkpoint_mismatch` | 1 | Chapitres seulement : chaque chapitre est prouvé, mais un checkpoint écrit à la main n'est aucun de ses états frontière atteignables. |

Quand plusieurs s'appliquent, le pire l'emporte, dans cet ordre : `error`, `broken`, `truncated`, `unsolved`,
`softlocks`, `solved`.

<a name="warnings"></a>

## Les trois alertes à lire

Même quand le statut est `solved`, `npm run solve` affiche ce qu'il a remarqué en route :

| Sortie | Sens | Correction |
|---|---|---|
| `Dead ends (n): - garden, inventory [shell_phone, pipe] after: A › B › C` | Un état où aucune action ne change rien. | Un objet consommé sans moyen d'en avoir un autre, un flag qui ferme le seul passage, ou un `if` de sujet qui cache l'indice. Rendre l'objet, ou assouplir la condition. |
| `Items obtained but never used in a rule` | Une fausse piste, ou une énigme oubliée. | S'en servir, ou le retirer. Un objet inutile visible coûte des minutes au joueur. |
| `Items never obtained` | Déclaré dans `items`, mais rien ne le donne. | Ajouter le `gain`, ou supprimer l'objet. |

`npm run solve -- --from=market` part du checkpoint `market` au lieu de « Nouvelle partie » : pratique quand on
travaille sur un seul lieu.

<a name="states"></a>

## Comment un état est gardé

Un état, c'est ce que le contenu peut encore distinguer : les flags, objets, props, compteurs, scripts et positions
vivants (les *dimensions*, [`solve/abstractions.ts`](../../src/engine/tools/solve/abstractions.ts)). Depuis la 4.1.13
([ADR 0015](../../docs/dev/adr/0015-compact-state.md)), la recherche garde chaque état vu comme un indice dans des
colonnes plates : son parent, la longueur de son chemin, son dernier pas, son lieu et son sac, chaque chaîne internée
une seule fois. Sa clé, ce sont ses paires (dimension, valeur) internées et triées : deux états ont la même clé
exactement quand leurs dimensions sont égales, aucune collision de hachage ne peut donc les fusionner. L'état du
moteur n'est gardé que tant que le nœud attend d'être développé.

Sur les instances ouvertes de la matrice de preuve, le tas est ainsi divisé par 16 à 20 (1,6 Ko par état sur o21 au
lieu de 31,6, mesuré pour la 4.1.13 le 7 octobre 2026, [Benchmarks](contribute.benchmarks.md)) ; le temps par état
est celui du moteur et ne change pas. `--representation=objects` garde le stockage de la 4.1.8 : la référence à
laquelle les tests différentiels comparent ([`tests/solver-oracle.test.ts`](../../tests/solver-oracle.test.ts) : les
mêmes verdicts, chemins et ensembles atteignables).

<a name="abstractions"></a>

## Ce qui replie les états : les abstractions

Une preuve replie les états qui ne diffèrent que par ce qui ne peut pas compter. Chaque repli est audité contre la
recherche explicite (`npm run solve -- --audit-abstractions` ; `npm run audit:corpus` chaque nuit) :

- **le personnage canonique** : avec plusieurs personnages jouables, qui tient les commandes ne fait pas partie de
  l'état quand changer de personnage ne change rien de ce que lit le solveur, et qu'aucun invariant ni objectif ne lit
  `{ player }`. Chaque état propose les actions de chaque personnage (`Switch to X › action`). Actif dans une preuve,
  inactif pour un témoin.
- **les régions de mobilité** : les lieux entre lesquels un personnage marche sans rien changer forment une région ;
  les actions de chaque lieu de la région sont proposées comme `Go to <room> › action`. Actif dans une preuve, inactif
  pour un témoin.
- **le propriétaire canonique** : les objets qu'aucune condition ne lit sont mis en commun, quel que soit leur
  porteur, tant que les personnages peuvent se rejoindre. Actif dans une preuve avec les deux précédents ;
  `--ownership=off` le désactive.
- **le mémo des no-ops** : un essai dont on sait qu'il ne change rien sur les mêmes valeurs n'est pas rejoué.
- **les objets symétriques** (4.1.13, `--symmetry`, désactivé par défaut) : deux objets que le jeu traite pareil,
  échangés, donnent le même jeu, donc un état et son jumeau échangé n'en font qu'un. C'est mesuré contre la recherche
  explicite sur des jeux générés avec des jumeaux ; il n'en trouve aucun dans les jeux fournis ni dans la matrice.

**La dominance** (un état sans plus de progrès qu'un état déjà vu) n'élague que **les témoins**, avec `--dominance`.
Dans une preuve elle changerait des verdicts sur des jeux générés
([`tests/dominance.test.ts`](../../tests/dominance.test.ts)) : elle y reste donc désactivée et le profil dit pourquoi.
Un témoin qui ne trouve rien avec la dominance est relancé sans elle, donc `unsolved` n'est jamais de son fait.

**La réduction d'ordre partiel** (`--por=sleep|stubborn`) n'a pas de preuve d'équivalence pour les blocages :
`--prove` l'ignore et le dit.

<a name="big-games"></a>

## Ce que le solveur fait d'un gros jeu

L'espace d'états d'un jeu d'aventure est le produit de tout ce qui peut varier indépendamment. Le solveur demande
d'abord au graphe de puzzles ce qui peut encore changer l'issue (`liveness` dans
[`src/engine/tools/puzzle.ts`](../../src/engine/tools/puzzle.ts)) : les lieux, les lieux de la carte, les joueurs, la
fin et les objectifs de chapitre sont vivants ; une action est vivante quand un de ses effets atteint quelque chose de
vivant ; une chose (objet, flag, prop, position d'un personnage, événement) est vivante quand une action vivante la
lit. Le reste sort de l'état et des actions essayées : un flag que seul son poseur lit (un marqueur « regardé »), une
babiole qu'aucune porte n'exige, une horloge que personne ne lit, un promeneur que personne n'attend, une chaîne de
sujets qui finit dans un flag que rien n'utilise.

C'est arrivé avec la v2.1. Mesuré alors ([Benchmarks](contribute.benchmarks.md#big-game)) : la version à dix lieux
du jeu de benchmark atteignait la limite de 20 000 états après 54 secondes sans finir avant la v2.1, et prenait 102
états après ; celle à quarante lieux 624 états ; celle à cent 2 901.

Ce qui multiplie encore les états, par construction, c'est ce qui compte : les choses vivantes indépendantes. Dix
objets facultatifs qui ouvrent chacun quelque chose, dans n'importe quel ordre, font 2^10 états. La réponse honnête
pour un jeu long :

1. **Les chapitres** (`checkpoints` avec `goals`, `npm run solve -- --chapters`) : chaque chapitre est cherché depuis
   le checkpoint précédent, avec seulement ses propres choses vivantes. Avec `--prove --chapters`, chaque chapitre est
   prouvé depuis chaque état frontière atteignable du précédent, et un checkpoint écrit à la main qui n'en est aucun
   donne `checkpoint_mismatch`. Dans la mesure de la v2.1, le dernier chapitre coûtait 3 290 états et le jeu entier
   2 901, parce que la recherche globale abandonne ce que les chapitres précédents ont consommé.
2. **Les invariants** (`GameDef.invariants`) pour les bugs « plus jamais », vérifiés sur chaque état exploré.
3. **Le graphe de puzzles** (`npm run page:puzzles`, le graphe du Studio), pour voir avant de résoudre de quoi une
   chose dépend et ce qu'elle débloque.

Une résolution globale d'un jeu généré de 100 lieux et 5 joueurs en quelques secondes ne promet pas que chaque jeu de
15 heures sera prouvé d'un coup. Elle dit que les outils du moteur suivent le contenu, et que le solveur dépense son
budget sur les puzzles. Quand une preuve ralentit, [le profil](create.solver-options.md#profile) dit quelle dimension
multiplie les états.

<a name="reality-worlds"></a>

## Un jeu relié au monde extérieur : le prouver dans chaque monde

Une preuve ne suppose jamais que l'extérieur coopère. Pour un jeu qui déclare des `reality.signals`,
`npm run solve:reality` (dépôt du moteur ; dans `prove:game`) et `npx quest-n-click solve-reality` (projet créé ; dans
`quest-n-click release`) prouvent le jeu dans trois sortes de mondes :

1. **fermé** : aucun signal. Le jeu doit se finir par ses fallbacks.
2. **chaque scénario** de `games/<id>/reality/scenarios/*.json`
   (`{ "signals": ["mail.answer.wrong", "mail.answer.correct"] }`) : ces signaux, dans cet ordre, chacun pouvant
   arriver à tout moment après le précédent. Un signal requis a besoin d'un scénario qui l'envoie.
3. **adversarial** : n'importe quel signal déclaré, à tout moment, encore et encore.

Chacun doit être `solved`, sans blocage et jamais tronqué. Le solveur donne le signal au moteur lui-même : aucun
service n'est contacté. Dans le MCP du Studio, `solve` prend `reality` pour essayer un monde. Le rapport nomme le
monde dans lequel son verdict vaut.

`validate` vérifie que le `fallback` d'un signal requis nomme une règle ; le lint de contenu (`npm run lint`, dans
`verify:game`) vérifie que le témoin du monde fermé le joue. Un jeu qui se finit sans l'extérieur par un autre chemin
reçoit `fallback-unplayed`, un avertissement : le fallback est déclaré sur une règle dont personne n'a besoin, souvent
une qui ne peut pas s'exécuter. Déclarez l'action que joue le témoin, ou faites de celle déclarée le passage. Le côté
Bridge est dans [Garanties du Bridge](bridge.guarantees.md#proof).

<a name="proof-matrix"></a>

## La matrice de preuve

[`docs/dev/PROOF-MATRIX.md`](../../docs/dev/PROOF-MATRIX.md) est la classe de jeux sur laquelle le solveur est mesuré
depuis la 4.1.13 : douze jeux générés de 20 à 40 lieux et trois personnages jouables, six contraints (des murs entre
les zones des personnages) et six ouverts, avec objets transférables, puzzles croisés, dialogues, scripts, événements
et actions destructrices. `npm run prove:matrix` (dépôt du moteur) prouve chacun dans son propre processus sous les
budgets publiés (10 000 000 états, 10 minutes sur le Mac du mainteneur, 20 sur le runner de la CI, 4 Go de tas) et
échoue sur un faux verdict. Il tourne chaque nuit, jamais sur une pull request. Une instance qui ne finit pas est
`unknown`, jamais `proved` : le rapport d'écart de la matrice dit quel budget l'a arrêtée et quelle dimension a
grossi. [`docs/dev/PROOF-PROFILE.md`](../../docs/dev/PROOF-PROFILE.md) donne le profil de chaque instance.

<a name="why"></a>

## Pourquoi

Un modèle du jeu écrit pour le solveur dériverait du moteur, et une preuve prouverait alors le modèle, pas le jeu
([ADR 0003](../../docs/dev/adr/0003-solver-runs-the-engine.md)). Faire tourner le vrai moteur garantit que chaque
chemin affiché par le solveur est un chemin qu'un joueur peut jouer, et qu'il se rejoue comme une session.

<a name="alternatives"></a>

## Alternatives écartées

- **Un modèle du contenu écrit à la main** : plus rapide à explorer, mais il prouve le modèle. Écarté par
  l'ADR 0003.
- **Hacher chaque état** : une collision de hachage pourrait fusionner deux états différents. Le stockage compact
  utilise plutôt les paires (dimension, valeur) triées comme clé (ADR 0015).
- **La dominance et la réduction d'ordre partiel dans les preuves** : elles coupent des états mais peuvent changer un
  verdict de blocage, les preuves s'en passent donc.

<a name="trade-offs"></a>

## Compromis

Les preuves sont plus lentes que sur un modèle écrit à la main : le moteur tourne pour chaque essai. Les gros jeux se
prouvent par chapitres, avec des workers et des points de reprise
([Options du solveur](create.solver-options.md#budgets)). Les workers accélèrent une exploration ; ils ne répondent
pas à une explosion d'états.

<a name="decisions"></a>

## Décisions et ADR

- [ADR 0003, le solveur fait tourner le vrai moteur](../../docs/dev/adr/0003-solver-runs-the-engine.md)
- [ADR 0015, l'état compact](../../docs/dev/adr/0015-compact-state.md)
- [ADR 0014, les objectifs](../../docs/dev/adr/0014-objectives.md) (`--goal=100%`)
- [Benchmarks](contribute.benchmarks.md), [Architecture](contribute.architecture.md#solver)
