# Options du solveur

Chaque option de `solve`, la commande du solveur, et des outils qui l'entourent : ce qu'elle fait, sa valeur par
défaut, et depuis quand. Ce que veulent dire les réponses (un chemin gagnant, une preuve, `truncated`) est dans
[Ce que prouve le solveur](create.solver-proofs.md).

<a name="where-to-run"></a>

## Où le lancer

- **Dans le dépôt du moteur** (un clone de `quest-n-click`) : `npm run solve -- <options>`. Le jeu est `GAME=<id>`,
  sinon `config.game` de `package.json` (`games/<id>/`).
- **Dans un projet créé** (par `npx quest-n-click create`) : `npx quest-n-click solve <options>`. Le jeu est
  `game/`. `npm run verify` lance `validate`, `solve`, `i18n status`, `lint` et `playtests` ; `npm run release` ajoute
  `solve --prove` et `solve-reality`.

Les outils marqués *dépôt du moteur* plus bas (`prove:matrix`, `audit:corpus`, `bench`, `replay`, `page:*`) n'ont pas
de sous-commande `quest-n-click` : un projet créé ne les a pas.

```sh
# dans le dépôt du moteur
npm run solve -- --prove --profile

# dans un projet créé
npx quest-n-click solve --prove --profile
```

<a name="summary"></a>

## Toutes les options d'un coup d'œil

| Option | Ce qu'elle fait | Défaut | Depuis |
|---|---|---|---|
| *(aucune)* | Un témoin : un chemin de « Nouvelle partie » jusqu'à la fin | | |
| `--prove` | Tous les états atteignables ; chacun qui a perdu la fin est un blocage | témoin | |
| `--from=<checkpoint>` | Partir d'un checkpoint de `game.checkpoints` au lieu de « Nouvelle partie » | « Nouvelle partie » | |
| `--chapters` | Une recherche par checkpoint qui déclare des `goals`, puis du dernier jusqu'à la fin | | |
| `--goal=100%` | Le but est chaque objectif non facultatif (`GameDef.objectives`), tous à la fois, au lieu de la fin | la fin | 4.1.12 |
| `--max=<n>` | Budget d'états | 20000 | |
| `--time=<s>` | Budget de temps, en secondes | aucun | 3.5 |
| `--mem=<Mo>` | Budget de tas, en Mo (Node seulement, lu toutes les 256 expansions) | aucun | 4.1.13 |
| `--checkpoint=<fichier>` | Écrire la recherche au fil de l'eau | aucun | 4.1.13 |
| `--checkpoint-every=<s>` | À quelle fréquence, en secondes | 300 | 4.1.13 |
| `--resume` | Reprendre la recherche depuis le fichier de `--checkpoint` | | 4.1.13 |
| `--workers=<n>\|auto` | Développer la frontière sur des threads de travail | aucun (un seul thread) | 3.5 |
| `--batch=<n>` | Nœuds pris à la frontière d'un coup, avec des workers | 64 | 3.5 |
| `--profile` | Ce qu'a coûté la recherche et de quoi sont faits les états | | |
| `--json` | Une ligne de JSON sur stdout, aucun autre texte | | |
| `--no-cache` | Ne pas lire ni écrire le cache de preuves | cache actif | |
| `--por=sleep\|stubborn` | Réduction d'ordre partiel, témoin seulement | désactivée | |
| `--dominance` | Dominance des témoins, témoin seulement | désactivée | 3.5 |
| `--ownership=off` | Pas de propriétaire canonique dans une preuve | actif dans une preuve | 3.5 |
| `--symmetry` | Replier les objets symétriques dans une preuve | désactivé | 4.1.13 |
| `--representation=objects` | Le stockage des états de la 4.1.8 | `compact` | 4.1.13 |
| `--audit-abstractions` | La preuve avec abstractions contre la recherche explicite | | 3.3.1 |

Une option inconnue est ignorée : la commande ne lit que les options qu'elle connaît. `--goal=` avec autre chose que
`100%` est refusé (code 2).

<a name="modes"></a>

## `--prove`, `--from`, `--chapters`, `--goal=100%`

- `npm run solve` seul cherche un chemin gagnant et s'arrête à la fin.
- `--prove` explore chaque état atteignable et signale les blocages, regroupés par cause.
- `--from=<checkpoint>` part de ce checkpoint, par exemple `--from=market` : pratique quand on travaille sur un seul
  lieu.
- `--chapters` lance une recherche bornée par checkpoint qui déclare des `goals` : depuis le checkpoint précédent (ou
  « Nouvelle partie ») jusqu'à ce que ses objectifs tiennent, puis du dernier jusqu'à la fin. Chaque chapitre doit se
  résoudre seul. Un jeu sans checkpoint avec `goals` affiche « no chapter to solve » et sort avec 0.
- `--prove --chapters` prouve chaque chapitre depuis **chaque** état frontière atteignable du précédent (dédoublonnés
  par ce que lit le chapitre), pas depuis le checkpoint écrit à la main, qui doit lui-même être l'un de ces états
  frontière (`checkpoint_mismatch` sinon). Un chapitre part d'au plus 1 000 états frontière distincts ; au-delà, il est
  `truncated` et la preuve s'arrête là.
- `--goal=100%` cherche un état où chaque objectif non facultatif tient à la fois (4.1.12,
  [ADR 0014](../../docs/dev/adr/0014-objectives.md)). Code 2 pour un jeu qui n'en déclare aucun. Un objectif dont le
  contenu peut reprendre le `done` peut le rendre inatteignable ; le validateur le signale.

```sh
# dans le dépôt du moteur
npm run solve -- --from=market --max=50000
npm run solve -- --chapters
npm run solve -- --prove --chapters
npm run solve -- --goal=100%
```

<a name="budgets"></a>

## Les longues preuves : budgets, points de reprise, mémoire

`--max` (états, 20 000 par défaut), `--time` (secondes) et `--mem` (Mo de tas) bornent une recherche. Chacun l'arrête
en `truncated`, code 2, et la phrase nomme le budget qui l'a arrêtée (« raise --max », « raise --time », « raise
--mem, or resume from the checkpoint »). Une recherche tronquée n'est jamais une preuve.

`--checkpoint=<fichier>` écrit la recherche toutes les `--checkpoint-every` secondes (300 par défaut) et quand un
budget l'arrête : le stockage, la frontière dans son ordre, les compteurs. `--resume` la reprend depuis ce fichier,
jusqu'au même verdict et au même témoin qu'une recherche jamais interrompue
([`tests/checkpoint.test.ts`](../../tests/checkpoint.test.ts) tue un vrai processus avec SIGKILL à 30 % et le
reprend). Un instantané appartient à une recherche : le jeu et les options qui changent ce qui est trouvé sont son
empreinte, et une autre recherche l'ignore (le profil dit pourquoi). Une recherche finie supprime son fichier. Le point
de reprise couvre la recherche du jeu entier ; `--chapters` lance plusieurs recherches et ne l'utilise pas. Il demande
la représentation compacte.

```sh
# dans le dépôt du moteur : une longue preuve, écrite au fil de l'eau, puis reprise avec un budget plus grand
npm run solve -- --prove --checkpoint=p.ckpt --checkpoint-every=300 --mem=3500
npm run solve -- --prove --checkpoint=p.ckpt --resume --max=200000
```

> [!GUARANTEE id=checkpoint-resume-same-proof]
> Une recherche coupée par son budget est écrite, et un budget plus grand la reprend jusqu'à la même preuve qu'une
> recherche jamais interrompue.

<a name="workers"></a>

## Les workers

`--workers=N` développe la frontière un lot à la fois (`--batch`, 64 par défaut) sur des threads de travail ; `auto`
prend les cœurs moins un, 8 au plus. La fusion suit l'ordre du lot : le résultat dépend du lot, jamais du nombre de
workers ([`tests/workers.test.ts`](../../tests/workers.test.ts),
[`tests/partition.test.ts`](../../tests/partition.test.ts)). Depuis la 4.1.13, la recherche partage sa table des états
vus avec les workers (le hachage 64 bits de chaque état gardé) : un worker renvoie un état que la recherche a déjà
gardé sans son état moteur. Les clés exactes restent l'autorité : un « déjà gardé » d'un worker que la recherche ne
confirme pas est redéveloppé dans le thread de la recherche. Chaque nœud va d'abord au worker que désigne le hachage
de son lieu, et un worker inactif vole dans la file la plus longue. Un worker qui s'arrête en cours de recherche quitte
le pool, avec la même preuve, et le profil le dit.

Les workers accélèrent une exploration ; ils ne répondent pas à une explosion d'états. Mesuré en 3.5 (5 octobre 2026,
[Benchmarks](contribute.benchmarks.md)) : une grosse preuve allait environ 2,5 fois plus vite avec 4 workers. Ils ne
se combinent pas avec une réduction d'ordre partiel.

```sh
# dans le dépôt du moteur
npm run solve -- --prove --workers=4 --batch=64 --time=60
```

<a name="profile"></a>

## Lire le profil

`npm run solve -- --profile` (l'onglet Check du Studio, « Solver health » ; l'outil MCP `solve` avec
`profile: true`) dit pourquoi une recherche est lente ou grosse. Avec `--prove`, depuis la 4.1.13, il donne aussi le
profil d'explosion. Voici un extrait sur le jeu de démo (dépôt du moteur, `main`, 23 octobre 2026) :

```text
SOLVER PROFILE
  states explored       3480
  engine runs           56588  (107244 tries changed nothing, 79588 of them not run: the no-op memo knew; 25455 landed on a known state)
  actions not run       713640  (no rule could answer them)
  actions per state     44.7 on average, 51 at most (market, 3 items in the bag: 1 Give, 2 Map, 3 Switch changed something)

Abstractions (what each one did, or why it is off):
  canonical character   3048 switches folded, 0 kept explicit
  mobility regions      off (no move of this game can be silent)
  witness dominance     off (off in proofs: it changes softlock verdicts on generated games (tests/dominance.test.ts))
  symmetric items       off (not asked for (--symmetry))
  representation        compact, 427 KB of tables

Explosion: what multiplies the 3480 states measured (states that would merge without it)
  positions        2904  (18 distinct values over 3 dimension(s))
  inventories      3042  (76 distinct values over 2 dimension(s))
  flags            3000  (78 distinct values over 13 dimension(s))
…
What splits the states (states that would merge without it):
    2940  pos biscuit  (44 values)
    2400  pos hero  (30 values)
…
Use / give combinations per room (over its expansions):
  house: 84096 candidates, 465 answered by a rule, 81021 could only fall back (96% useless)
Independent dimensions (their combinations multiply the states; a checkpoint between them would cut it):
  ⚠ nth house.take-teacup.nth, flag lou_has_key, prop house.armchair: 8 of 8 combinations seen
Monotonic (never lost once gained): 10 flags, 1 items (shell_phone)
```

Comment le lire :

- **What splits the states.** Chaque dimension de l'état (un objet dans le sac, un flag, l'état d'un prop, la position
  d'un script…) est notée par le nombre d'états qui fusionneraient sans elle. Le haut de la liste, c'est ce dont est
  faite la logique du jeu, ou le puzzle devenu combinatoire.
- **Explosion.** Les états gardés sont attribués à cinq familles : positions, inventaires, flags et compteurs, ce
  qu'écrit un dialogue, ce qu'écrit un script ou un événement. Pour chacune, combien d'états fusionneraient sans elle :
  ce qu'elle multiplie. Trois comptes disent ce qui n'est jamais devenu un état : les symétries repliées, les essais
  qui n'ont rien changé, et les transitions arrivées sur un état déjà vu (deux ordres d'actions indépendantes).
- **Abstractions.** Chaque abstraction a sa ligne : ce qu'elle a fait, ou pourquoi elle est désactivée.
- **Independent dimensions.** Des groupes de dimensions à deux valeurs dont toutes les combinaisons apparaissent
  évoluent indépendamment : un checkpoint avec `goals` entre eux rend petite la recherche de chaque chapitre. Les
  sous-puzzles indépendants sont signalés, pas appliqués : prouver chacun seul demande un argument de produit que la
  recherche ne fait pas.
- **Use / give combinations.** Combien d'essais n'ont pu que retomber sur une réponse par défaut.

La carte de chaleur sur le graphe de puzzles (onglet Check) montre les mêmes chiffres sur les règles et les lieux ;
« why is this live? » sur une carte explique pourquoi le solveur garde une chose dans son état.
[`docs/dev/PROOF-PROFILE.md`](../../docs/dev/PROOF-PROFILE.md) donne ce profil pour chaque instance de la matrice de
preuve.

<a name="output"></a>

## `--json` et la sortie

Sans `--json`, la sortie est faite pour les gens, et d'autres scripts la lisent telle quelle : la ligne de verdict, le
chemin trouvé (ou le chemin jusqu'au dernier état exploré), les lieux atteints, les lieux débloqués sur la carte, les
flags posés, les objets obtenus mais jamais utilisés, les objets jamais obtenus, jusqu'à cinq impasses, jusqu'à dix
causes de blocage, les invariants cassés et les erreurs du moteur.

`--json` affiche une ligne de JSON et rien d'autre : `status`, `exit`, `headline`, `mode`, `cached`, `finished`,
`states`, `truncated`, `path` (étiqueté pour les gens), `steps` (les entrées de session que rejoue `npm run e2e`),
`softlockCount`, `softlockCauses`, `roomsReached`, `unlockedReached`, `flagsReached`, `itemsNeverUsed`, `unusedItems`,
`softlocks`, `assumptions`, `errors`, `broken`, `profile`. Avec `--prove --chapters` : `status`, `exit`, `headline`,
`ms` et `chapters`.

<a name="proof-cache"></a>

## Le cache de preuves : `--no-cache`, `PROOF_CACHE`, `PROOF_CACHE_DIR`

Une exécution du solveur ne dépend que du code du moteur, du jeu (contenu, dispositions, commandes personnalisées, et
sources du dossier du jeu) et des options. `solve` (tous les modes), `--chapters` et `lint` gardent chaque résultat
dans `.cache/proofs/` et le rendent quand rien de tout ça n'a changé, en le disant : `(from the proof cache, key …)`,
et `cached` dans `--json`. Le build, `verify:game`, `prove:game` et `release-check` posent plusieurs fois les mêmes
questions ; sur la démo, une preuve à chaud prenait 0,17 s au lieu de 2,4 s à froid à l'arrivée du cache (3.3.0,
[`CHANGELOG.md`](../../CHANGELOG.md)).

- `--no-cache` (sur `solve`) ou `PROOF_CACHE=0` relance sans le lire ni l'écrire.
- `PROOF_CACHE_DIR=<dossier>` le déplace.
- Une erreur du moteur n'est jamais gardée. Les 300 résultats les plus récents sont gardés ; les plus anciens partent
  d'abord.
- Les tests appellent le solveur directement et ne l'utilisent jamais.

<a name="reductions"></a>

## `--por`, `--dominance`, `--ownership=off`, `--symmetry`, `--representation=objects`

- `--por=sleep|stubborn` : réduction d'ordre partiel, des actions qui commutent essayées une seule fois (moins
  d'exécutions du moteur avec `sleep`, moins d'états aussi avec `stubborn`). Elle n'a pas de preuve d'équivalence pour
  les blocages : avec `--prove`, elle est ignorée, et la commande le dit.
- `--dominance` : un témoin saute un état sans plus de progrès qu'un état déjà vu. Témoins seulement ; un témoin qui
  ne trouve rien avec elle est relancé sans elle.
- `--ownership=off` : pas de propriétaire canonique (qui porte un objet qu'aucune condition ne lit) dans une preuve.
- `--symmetry` : deux objets que le jeu traite pareil sont repliés dans une preuve. Désactivé par défaut.
- `--representation=objects` : chaque état gardé en entier, comme en 4.1.8 : la référence à laquelle comparent les
  tests différentiels. Le défaut est `compact` ([ADR 0015](../../docs/dev/adr/0015-compact-state.md)).

Ce que chacune change à un verdict est dans [Ce que prouve le solveur](create.solver-proofs.md#abstractions).

<a name="audit"></a>

## `--audit-abstractions` et `audit:corpus`

```sh
# dans le dépôt du moteur, ou npx quest-n-click solve --audit-abstractions dans un projet créé
npm run solve -- --audit-abstractions
```

La preuve avec abstractions (chaque succès du mémo des no-ops quand même exécuté et comparé) contre la recherche
explicite (personnage canonique, régions de mobilité, propriétaire canonique et mémo désactivés). Code 0 identiques,
1 divergents, 2 la recherche explicite n'a pas tenu dans `--max` (les verdicts n'ont pas été comparés).
`npm run release-check` le lance.

```sh
# dans le dépôt du moteur seulement
npm run audit:corpus -- --seeds=500                              # chaque nuit en CI : code 1 sur une divergence
npm run audit:corpus -- --from=126 --seeds=125 --json=s.json     # un morceau : essayés, comparés, partiels, divergents par sorte
npm run audit:corpus -- --shard=1/4 --total=500 --json=s1.json   # morceau 1 sur 4 des graines 1-500, partagées également
npm run audit:corpus -- --merge s0.json s1.json --total=500      # morceaux additionnés ; échoue sur une graine manquée ou lancée deux fois
```

`audit:corpus` lance le même audit sur des jeux aléatoires de trois sortes (simples, avec objets libres, avec trois
personnages et objets libres). `partial` (la recherche explicite a atteint `--max`) n'est pas un échec : ces verdicts
ne sont simplement pas comparés, et les comptes le disent.

<a name="matrix-and-bench"></a>

## `prove:matrix` et `bench` (dépôt du moteur)

```sh
# dans le dépôt du moteur seulement
npm run prove:matrix -- --only=c11,o21 --time=600 --mem=4096 --json=m.json --profile=docs/dev/PROOF-PROFILE.md
npm run bench -- --matrix --eras --max=20000
npm run bench -- --rooms=40 --prove --v3
```

- `prove:matrix` (4.1.13) : les douze instances de [la matrice de preuve](create.solver-proofs.md#proof-matrix),
  chacune dans son processus sous les budgets publiés (10 000 000 états, `--time` 600 s sur le Mac du mainteneur et
  1 200 s sur le runner, `--mem` 4 096 Mo). Code 1 sur un faux verdict ; une instance hors budget est `unknown`, le
  rapport d'écart, pas un échec. Aussi `--representation=objects|compact`, `--checkpoint-dir=<dossier>` et
  `--workers=N`, transmis tels quels. La nuit seulement.
- `bench -- --matrix [--eras] [--max=20000]` : la table de référence de la 3.3, la preuve sur 20 ou 40 lieux × 1, 2
  ou 3 personnages, et où passe le temps (`--eras` : personnages confinés à des époques).
- `bench -- --rooms=40 [--prove --v3]` : un jeu généré de cette taille, chaque outil chronométré dessus ; `--prove`
  ajoute la preuve exhaustive, `--v3` le génère avec des ids stables. Le workflow hebdomadaire `prove` le lance sur 100
  lieux.

Les mesures sont dans [Benchmarks](contribute.benchmarks.md#profile).

<a name="tests"></a>

## Les tests lourds du solveur (dépôt du moteur)

`npm test` lance les tests Node du moteur, des outils et du jeu sélectionné, sans les tests du solveur gourmands en
CPU. `npm run test:heavy` lance ceux-là (les audits des abstractions, le propriétaire canonique, les preuves du mémo et
de la mise en commun, la preuve du chapitre de référence, l'oracle du solveur, la dominance, les partitions, la
matrice des points de reprise) : chaque nuit, des minutes chacun. Voir
[Quels tests tournent quand](contribute.which-tests.md).

<a name="related"></a>

## Identifiants liés

- `npm run validate`, `npm run lint`, `npm run verify:game`, `npm run prove:game` :
  [Vérifier son jeu](create.checking.md#commands).
- `npm run replay` : [Vérifier son jeu](create.checking.md#commands).
- `npm run solve:reality` : [Ce que prouve le solveur](create.solver-proofs.md#reality-worlds).
- `PROOF_CACHE`, `PROOF_CACHE_DIR` : [Variables d'environnement](reference.environment-variables.md).
