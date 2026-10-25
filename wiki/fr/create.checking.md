# Vérifier son jeu

Quatre commandes disent l'essentiel de ce qui ne va pas dans un jeu avant que quiconque y joue : `validate` vérifie le
contenu, `solve` trouve un chemin jusqu'à la fin, `lint` lit le graphe de puzzles pour y trouver ce qui ferait
trébucher un joueur, et `solve --prove` prouve qu'aucun joueur ne peut rester bloqué. Ensuite, le jeu est joué pour de
vrai : par un parcours scripté, dans un navigateur, sur un téléphone, et par une personne.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un jeu dont toutes les références existent, qui se finit depuis « Nouvelle partie », dont les blocages sont exclus par
une preuve exhaustive, et dont vous avez lu les avertissements restants pour les corriger ou les garder exprès. Pour
finir, la liste [Avant de partager le lien](#before-you-share).

<a name="context-and-versions"></a>

## Contexte et versions

- **Le dépôt du moteur** (un clone de `quest-n-click`, pour travailler sur le moteur ou ses jeux d'exemple) : les
  commandes sont des scripts npm, `npm run validate`. Le jeu est `GAME=<id>`, sinon `config.game` de `package.json`.
- **Un projet créé** (par `npx quest-n-click create`) : les commandes sont des sous-commandes de `quest-n-click`,
  `npx quest-n-click validate`, et les scripts du projet `npm run verify`, `npm run build`, `npm run release`. Le jeu
  est dans `game/`.
- Cette page décrit la 4.3.0 et après (le `hero-looks-default` du lint est arrivé en 4.3.0). Le statut d'une
  exécution du solveur est le même depuis la 3.3.

<a name="prerequisites"></a>

## Prérequis

- Le moteur installé : [Installer depuis le dépôt](install.from-repository.md) ou un projet créé
  ([Votre premier jeu](create.first-game.md)).
- Un jeu d'au moins un lieu. La boucle de travail est dans [La boucle de travail](create.working-loop.md).

<a name="where-to-run"></a>

## Où lancer les commandes

Sur votre machine, à la racine du dossier :

| Vérification | Dépôt du moteur | Projet créé |
|---|---|---|
| Le contenu | `npm run validate` | `npx quest-n-click validate` |
| Un chemin jusqu'à la fin | `npm run solve` | `npx quest-n-click solve` |
| Ce qui ferait trébucher un joueur | `npm run lint` | `npx quest-n-click lint` |
| Aucun blocage | `npm run solve -- --prove` | `npx quest-n-click solve --prove` |
| Tous les garde-fous du jeu | `npm run verify:game` | `npm run verify` |
| Les garde-fous exhaustifs | `npm run prove:game` | inclus dans `npm run release` |

Dans le dépôt du moteur, les options viennent après `--` (`npm run solve -- --prove`) ; avec `npx quest-n-click`,
elles suivent directement la sous-commande.

<a name="steps"></a>

## Étapes

<!-- step: validate -->
1. **Validez le contenu.**

   ```sh
   # dans le dépôt du moteur
   npm run validate
   # dans un projet créé
   npx quest-n-click validate
   ```

   Tout ce qui est référencé existe, chaque chose visible a sa ligne Regarder, les textes ne sont ni vides ni trop
   longs, les flags sont posés et lus. Code 1 sur une erreur. Ce qu'il vérifie est listé dans
   [Ce que regarde chaque vérification](#checking).

<!-- step: solve -->
2. **Trouvez un chemin jusqu'à la fin.**

   ```sh
   # dans le dépôt du moteur
   npm run solve
   # dans un projet créé
   npx quest-n-click solve
   ```

   Il affiche `✔ The game can be finished`, le chemin, et trois alertes à lire : impasses, objets obtenus mais jamais
   utilisés, objets jamais obtenus ([les alertes](create.solver-proofs.md#warnings)). Un chemin gagnant n'est pas une
   preuve.

<!-- step: lint -->
3. **Passez le lint sur le contenu.**

   ```sh
   # dans le dépôt du moteur
   npm run lint
   # dans un projet créé
   npx quest-n-click lint
   ```

   Des conditions que rien ne peut satisfaire, des règles qu'une autre cache, des fausses pistes, des indices qui ne
   peuvent pas se déclencher, des actions que le solveur n'a jamais jouées. Corrigez chaque remarque, ou gardez-la
   exprès dans `game.ts` (`lint.ignore`, plus bas).

<!-- step: prove -->
4. **Prouvez qu'il n'y a aucun blocage.**

   ```sh
   # dans le dépôt du moteur : la preuve globale, la preuve par chapitres, chaque monde Reality
   npm run prove:game
   # dans un projet créé
   npx quest-n-click solve --prove
   ```

   Seul un `solved` obtenu avec `--prove` exclut les blocages. Un résultat `truncated` ne prouve rien : augmentez le
   budget ([Options du solveur](create.solver-options.md#budgets)).

<!-- step: play -->
5. **Jouez-y pour de vrai.** Un parcours scripté et l'e2e dans le navigateur
   ([Prouver que ça se joue](#prove-it-plays)), un vrai téléphone en paysage
   ([Tester sur un téléphone en réseau local](create.lan-testing.md)), puis une personne qui n'a jamais vu le jeu ([Playtests](create.playtests.md)).

<!-- step: checklist -->
6. **Parcourez la liste** [Avant de partager le lien](#before-you-share).

<a name="checking"></a>

## Ce que regarde chaque vérification

- **Validé.** Les références cassées, les lieux inatteignables et les lignes non traduites sont trouvés avant que
  quiconque joue. `validate` vérifie les formes et les références : tout ce qui est référencé existe, chaque chose
  visible a sa ligne Regarder, les textes ne sont ni vides ni trop longs, les flags sont posés et lus. Il signale les
  lieux vers lesquels rien ne mène et les sorties déclarées sans retour (`oneWay: true` si c'est voulu). Il vérifie
  les paramètres obligatoires de chaque mini-jeu (`required`), les images citées dans leurs `params`, chaque id de
  `skin` (images du manifeste, sons `audio`) et `ending.scratch`, et que le `fallback` d'un signal Reality requis nomme
  une règle.
- **Résolu.** Le solveur fait tourner le vrai moteur, sans second modèle du contenu. `solve` demande un **témoin**, un
  chemin jusqu'à une fin ; `solve --prove` explore **chaque état atteignable** et échoue sur un blocage ou une
  recherche tronquée. Ce sont deux promesses différentes, et une release demande la seconde
  ([Ce que prouve le solveur](create.solver-proofs.md)). `solve` signale aussi les invariants (`GameDef.invariants`)
  devenus vrais, avec leur chemin.
- **Passé au lint.** `lint` dit ce que `validate` ne peut pas voir (il vérifie formes et références) et ce que `solve`
  ne dit pas fort (il répond à « peut-on finir »). Depuis le graphe de puzzles :
  - une condition que rien ne pose (`cond-never-true`, une erreur) ;
  - une règle qu'une autre règle attrape d'abord (`rule-shadowed`) ;
  - un objet dont aucune règle n'a besoin (`item-red-herring`) ou que rien ne donne (`item-never-gained`) ;
  - un indice qui attend quelque chose que rien ne pose (`hint-stuck`, une erreur), ou qui partage son `until` avec un
    indice précédent (`hint-never-fires`) ;
  - un sujet, une option de choix ou un écouteur morts ; un choix à une seule option ; une sortie avec une condition
    et sans ligne `locked` ;
  - une action qui ne change que ce que rien de vivant ne lit (`action-dead`, info ; un flag que lit la variante d'un
    personnage ou un changement de texte ne compte pas pour rien, donc le choix du héros à l'intro n'est pas signalé) ;
  - deux valeurs ou plus du flag du héros qu'aucune variante de héros ne reconnaît, si bien que ces héros ressemblent
    à celui qui est écrit (`hero-looks-default`, info, 4.3.0 ; voir [Héros](create.heroes.md)) ;
  - une cible derrière un lien de marche fermé par une condition, dont la règle ne vérifie pas cette condition
    (`walk-link-gate` : le lien arrête la marche, jamais l'action).

  Après une exécution du solveur, aussi : un fallback de signal requis que le témoin du monde fermé ne joue jamais
  (`fallback-unplayed`, un avertissement) ; une action vivante que le témoin n'a jamais jouée et un lieu où il n'est
  jamais entré (`rule-never-run`, `room-never-reached` : information avec le témoin, avertissements avec un `--prove`
  terminé ; une preuve tronquée les garde comme information et le dit, elle ne déclare jamais rien inatteignable) ;
  une action vivante jouée sans jamais changer l'état (`rule-no-effect`, info : un sujet qui ne fait que parler, ou un
  `set` déjà vrai). L'atteignabilité compte chaque essai du solveur, qu'il ait changé l'état ou non.

  Chaque remarque nomme son lieu et son chemin (celui qu'affiche l'onglet Rooms du Studio), son id stable, et ce qu'il
  faut faire. Codes de sortie : 0 propre, 1 une erreur non ignorée, 2 la recherche a été tronquée (`--json` porte
  `status` et `truncated`). `--prove` lance d'abord la recherche exhaustive (lente sur un gros jeu), `--static` ne
  lance aucun solveur, `--max=<n>` fixe le budget de la recherche (20 000). L'onglet Check du Studio montre la même
  liste avec des liens vers Rooms ; l'outil MCP `lint` la rend en Markdown. `verify:game` le lance, la CI aussi.
- **Rejoué.** Une session est l'unité de reproduction ([Playtests](create.playtests.md#sessions)) ; les sauvegardes
  se chargent d'une version à l'autre, avec une sauvegarde figée par release depuis la 3.0.0
  ([État et sauvegardes](create.state-saves.md)).
- **Accessible autant qu'une machine peut le dire.** axe-core sur chaque écran, jeu au clavier et au toucher en CI. Ce
  n'est pas une déclaration de conformité WCAG : les passes au lecteur d'écran et sur de vrais appareils reviennent à
  une personne ([Accessibilité](play.accessibility.md), [Passes de terrain](contribute.field-passes.md)).

**Garder une remarque exprès.** Une fausse piste voulue, ou un flag décoratif (posé, jamais lu), se fait taire dans
`game.ts` ; la même liste retire `flag-never-read:<flag>` des avertissements de `validate` :

```ts
lint: { ignore: ['item-red-herring:rubber_chicken', 'rule-shadowed:house/on[4]'] },   // un code, `code:<id>` ou `code:<lieu>/<chemin>`
```

`ui.shareSession` nomme la ligne du menu pause qui envoie un playtest depuis un téléphone
([Playtests](create.playtests.md)).

<a name="commands"></a>

## Commandes

Chaque commande ci-dessous se lance dans le **dépôt du moteur** avec `npm run`. La deuxième colonne donne
l'équivalent dans un projet créé quand il existe ; « — » veut dire que le projet créé n'en a pas.

**Le contenu du jeu**

| Dépôt du moteur | Projet créé | Ce qu'elle fait |
|---|---|---|
| `npm run validate` | `npx quest-n-click validate` | Références cassées, textes vides ou trop longs, Regarder manquants, flags jamais posés ou jamais lus. Code 1 sur une erreur. |
| `npm run validate -- --report` | `npx quest-n-click validate --report` | Le profileur de contenu (Markdown) : lieux, objets, personnages, ce qui est maigre. |
| `npm run validate -- --release` | `npx quest-n-click validate --release` | Aussi la provenance, les placeholders, et un id stable sur chaque ligne d'un jeu livré dans une autre langue que la sienne ou doublé. |
| `npm run validate -- --commercial --errors` | `npx quest-n-click validate --commercial --errors` | Une release qu'on peut vendre : aucune exception, aucun placeholder, aucune licence non commerciale, chaque source vérifiable ; `--errors` n'affiche que les erreurs. |
| `npm run solve …` | `npx quest-n-click solve …` | Le solveur : [Options du solveur](create.solver-options.md). |
| `npm run lint [-- --prove \| --static \| --json]` | `npx quest-n-click lint …` | Le lint du contenu, plus haut. `lint:content` est la même commande (alias depuis la 4.1.0). |
| `npm run i18n -- extract [--lang xx]` | `npx quest-n-click i18n extract …` | Les tables de traduction (`locales/<xx>.json`) ; `status` pour la couverture. [Traductions](create.translations.md). |
| `npm run playtests …` | `npx quest-n-click playtests …` | Les sessions des joueurs rejouées et résumées : [Playtests](create.playtests.md). |
| `npm run page:world` | — | La carte du monde en page : sorties, gotos, lieux inatteignables, source DOT. |
| `npm run page:puzzles` | — | Le graphe de puzzles en page : ce dont chaque règle a besoin et ce qu'elle change, une carte par objet et par flag. |
| `npm run replay -- session.json` | — (l'onglet Play du Studio) | Une session jouée sur le vrai moteur : [Les sessions](create.playtests.md#sessions). |

**Les garde-fous du jeu**

| Dépôt du moteur | Projet créé | Ce qu'elle fait |
|---|---|---|
| `npm run verify:game` | `npm run verify` | Dépôt du moteur : validate, le témoin, le témoin par chapitres, les variantes (`verify:variants`), l'état des traductions, le lint, les playtests. Projet créé : validate, solve, `i18n status`, lint, playtests. |
| `npm run prove:game` | — (`npm run release` lance `solve --prove` et `solve-reality`) | La preuve globale, la preuve par chapitres et chaque monde Reality ; échoue sur un blocage ou une troncature. |
| `npm run build:game` | `npm run build` | Les garde-fous du jeu, le bundle, `verify:dist`, puis (dépôt du moteur) le contrôle des spoilers et l'audit des assets. Pas de vérification de types, pas de suite unitaire. |
| `npm run build` | `npm run build` | Dépôt du moteur : `check` (types et tests Node), puis `build:game`. |
| `npm run verify:release` | inclus dans `npm run release` | `validate --release`, `weight --release`, `i18n status`, `voices check --release`, playtests stricts. |
| `npm run verify:commercial` | `npm run release -- --commercial` | `verify:release`, puis aucune exception, aucun placeholder, aucune licence NC ou ND, chaque source vérifiable, puis `verify:dist`. |
| `npm run verify:dist` | inclus dans `build` | Chaque fichier de `dist/` justifié : code, assets verrouillés (leurs octets relus), données nommées, polices, icônes, `licenses/`. |
| `npm run verify:field` | — | `verify:commercial`, puis les quotas de playtests d'une version testée par des joueurs (pas une étape de `release-check`, D12). |
| `npm run provenance [-- --lock]` | `npx quest-n-click provenance [--lock]` | Les assets livrés par licence, ce qui a changé depuis le verrou relu ; `--lock` enregistre les fichiers après une relecture. [Provenance des assets](create.asset-provenance.md). |
| `npm run weight [-- --release --json --stems]` | `npx quest-n-click weight …` | Ce qu'un téléphone télécharge avant le premier lieu, par lieu et par chapitre, contre `assetBudgets`. |
| `npm run voices -- status \| export \| import \| check` | `npx quest-n-click voices …` | Les répliques enregistrées par langue. `status [--lang xx]` : les répliques avec un id par statut (draft, record, recorded, approved), les clips, les orphelins ; une réplique à changements de texte a une ligne par valeur, `<id>~form=f`. `export --lang xx [--json] > t.csv` : la table des comédiens (id, qui, texte, statut, fichier, comédien, note). `import t.csv --lang xx` : statuts, comédiens et notes ramenés dans `voices.json` (répliques inconnues refusées). `check [--lang xx] [--release]` : chaque clip mesuré avec ffmpeg (codec, fréquence, durée pour son texte, volume vers −16 LUFS, crête) ; `--release` : une réplique approuvée exige son clip. [Voix](create.voices.md). |
| `npm run i18n -- voices` | `npx quest-n-click i18n voices` | Les répliques avec un id et sans clip, les clips qu'aucune réplique ne réclame. |
| `npm run ids [-- --write --map]`, `npm run ids -- --lines` | `npx quest-n-click ids …` | Les ids stables (schéma 3) écrits dans les sources, les locales renommées, l'étape de migration des sauvegardes. `--lines` : un id sur chaque say, toast, objet guide, ligne de liste, indice et réaction de sorte (`--lines=all` : les chaînes simples aussi, exigé pour une release traduite ou doublée) ; traductions et voix s'y rattachent. [État et sauvegardes](create.state-saves.md). |

**Les vérifications propres au dépôt du moteur**

| Commande | Ce qu'elle fait |
|---|---|
| `npm test` | Les tests Node du moteur, des outils et du jeu sélectionné, sans les tests lourds du solveur. |
| `npm run test:heavy` | Les tests du solveur gourmands en CPU : chaque nuit, des minutes chacun ([Options du solveur](create.solver-options.md#tests)). |
| `npm run test:coverage` | La suite sous couverture V8 contre les planchers de `vite.config.ts` ; puis `npx tsx tools/coverage-ratchet.ts --strict` échoue sur un plancher d'au moins trois points sous ce qu'atteignent les tests ([Le cliquet de couverture](contribute.coverage-ratchet.md)). |
| `npm run test:assets` | Les tests des images et du pipeline d'assets, qui s'appuient sur Python. |
| `npm run check` | Vérification des types et tests Node. |
| `npm run tsc -- …` | Le compilateur TypeScript 7 lui-même ; `check` et `quality` l'appellent. |
| `npm run quality` | Formatage et lint Biome, `knip`, `tsconfig.json` et `tsconfig.strictest.json`, puis le lint du contenu. |
| `npm run quality:baseline -- --check [--dist]` | Le comportement de la 4.0.0 conservé : témoins, preuves, sauvegardes de référence, surface publique, première visite ([La base de qualité](contribute.quality-baseline.md)). |
| `npm run doctor [-- --release]` | Node, modules Python, ffmpeg, navigateurs Playwright ([`doctor`](install.doctor.md)). |
| `npm run release-check` | Ce que lance la CI, d'un coup : `doctor --release`, `quality`, `build`, la couverture et son cliquet strict, `verify:release`, `prove:game`, `solve --audit-abstractions`, la contre-vérification Rust, la mutation du cœur, les paquets avec `npm publish --dry-run`, les audits des dépendances. `release-check:ci` est le même sans les jeux de mutation ([Publier une release](contribute.releasing.md)). |
| `npm run field:init`, `field:check`, `field:report`, `field:bundle`, `field:verify-bundle`, `field:carry` | Le Field Kit : les passes des personnes en rapports JSON liés à un run candidat ([Passes de terrain](contribute.field-passes.md)). |

**Dans un navigateur** (dépôt du moteur ; le serveur de dev ou une build de production qui répond déjà à `<url>`)

| Commande | Ce qu'elle fait |
|---|---|
| `npm run e2e -- <url>` | Une partie dans Chromium, téléphone en paysage, le long du chemin du solveur ([Prouver que ça se joue](#prove-it-plays)). |
| `npm run e2e -- <url> --renderer canvas` | Tout le jeu dessiné par le peintre Canvas. |
| `npm run e2e -- <url> --lang fr` | Tout le jeu dans cette langue ; échoue sur tout texte anglais par défaut du moteur resté visible. |
| `npm run e2e:visual -- <url> [--update]` | Chaque lieu, à l'arrêt, contre `tests/visual/<jeu>/*.png` (0,5 % des pixels au plus). |
| `npm run e2e:a11y -- <url> [--only=axe,keys,storage] [--allow-skip]` | axe sur la conversation, la carte, les emplacements, les confirmations et chaque mini-jeu ; chaque mini-jeu gagné au clavier ; une ancienne sauvegarde mise à niveau (`E2E_BROWSER=chromium\|webkit` ; code 3 : une vérification que le navigateur ne sait pas automatiser). |
| `npm run e2e:perf -- <url> [--renderer=canvas\|dom --cpu=4 --min=30 --room=<id>]` | Images par seconde pendant que le héros marche, CPU ralenti (pour imiter un téléphone). |
| `npm run e2e:music -- <url> [--only=offline\|live\|game\|reference …]` | Le directeur musical : 30 min hors ligne sans dérive, 100 changements sans clic, la gigue en temps réel (`--live=chromium\|webkit`), les stems du thème dans le jeu ; `--only=reference [--browser=webkit]` avec `GAME=reference` : deux partitions, des ponts, une reprise et un arrêt en pleine transition, la crête décodée ([Musique](create.music.md)). |

**Documentation et outillage du dépôt** (dépôt du moteur)

| Commande | Ce qu'elle fait |
|---|---|
| `npm run docs:screenshots [-- --only=game\|studio --keep-png]` | Les images du README depuis le bundle de production et le Studio, en WebP (demande Python avec Pillow). |
| `npm run docs:truth` | Ce que disent les docs contre le code : les schémas de sauvegarde et de `.wsrun`, chaque script npm et fichier de `tools/` ou `scripts/` cités, aucun lien de release plus récent que la version. Le job check de la CI. |
| `npm run docs:links [-- --timeout=10000]` | Chaque lien externe des docs demandé une fois ; une personne le lance avant une release, jamais la CI. |
| `npm run changes -- --check \| --assemble` | Les fragments de CHANGELOG et de LOG d'une branche ([Conventions](contribute.conventions.md)). |
| `npm run ci:plan [-- --base=origin/main \| --files=a,b \| --all]` | Quels jobs lourds de la CI un changement demande, sur une ligne de JSON ; depuis la 4.5.0 aussi `docs` et `docsPages`, les pages du wiki dont le changement touche les `sources` ([La CI expliquée](contribute.ci.md)). |
| `npx tsx tools/api-doc.ts [--check]`, `npx tsx tools/dsl-doc.ts [--check]` | Les références générées de l'API et du DSL ([API publique](engine.api.md), [Référence du DSL](create.dsl.md)). |

<a name="prove-it-plays"></a>

## Prouver que ça se joue

Dans le dépôt du moteur, `npm test` lance les tests du moteur et le parcours du jeu : une partie complète scriptée sur
le vrai moteur (`tests/demo-walkthrough.test.ts` pour la démo). `npm run e2e` joue tout le jeu au toucher dans un
Chromium à la taille d'un téléphone et enregistre une capture de chaque étape : regardez-les, ou faites-les regarder
par votre assistant, pour attraper ce que le solveur ne voit pas (un personnage debout sur une table, une ligne coupée
par le bord de l'écran).

```sh
# dans le dépôt du moteur : lancez le serveur de dev, puis dans un autre terminal
npm run dev
npm run e2e -- http://localhost:5173/
```

`npm run e2e` prend le chemin du solveur (`npm run solve -- --json`, ses `steps`) et le tapote. Il ne passe que si
l'exécution du solveur est `solved` (son code de sortie, son statut et ses pas sont vérifiés) **et** que le moteur
lui-même signale la fin (`state.done`) : un jeu tronqué ou non résolu est un échec, jamais « le meilleur chemin rejoué
quand même ». [`games/demo/e2e.mjs`](../../games/demo/e2e.mjs) est l'exemple d'un script e2e propre à un jeu : il part
de l'écran titre, joue pour de vrai les mini-jeux des tuyaux et de la cueillette et le ticket à gratter de la fin
scellée au lieu de les passer, puis vérifie la carte finale.

> [!LIMIT id=created-project-no-e2e]
> Un projet créé n'a pas de commande `test` ni `e2e` : ses vérifications sont `verify`, `build` et `release`. L'e2e
> dans le navigateur et les vérifications visuelles, d'accessibilité, de performance et de musique tournent dans le
> dépôt du moteur.

**En CI** (le [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) du dépôt du moteur) : chaque push sur
`main`, chaque tag et chaque pull request lancent `npm run build:game` (les garde-fous du jeu, le bundle, les audits
des spoilers et des assets) et `npm run prove:game` sur le jeu d'exemple ; les jobs plus lourds (l'e2e de production
dans plusieurs navigateurs, les parties au clavier et en français, un second jeu fait depuis le modèle…) tournent
quand [`ci:plan`](contribute.ci.md) dit que le changement en a besoin. `main` se déploie sur Pages ; un tag publie une
release. Le workflow hebdomadaire `prove` (le lundi, ou à la main) lance `prove:game`, les playtests stricts et le
bench sur un jeu généré de 100 lieux. Dependabot propose les mises à jour npm et Actions chaque semaine, pip chaque
mois ([PR des bots](contribute.bot-prs.md)).

<a name="before-you-share"></a>

## Avant de partager le lien

- [ ] Prémisse, envie, obstacle par lieu et fin tiennent en quatre lignes.
- [ ] Le storyboard est définitif, et chaque texte de lieu en vient.
- [ ] Chaque lieu a un but, 3 à 6 étapes, un « aha », 8 à 15 choses nommées.
- [ ] Chaque chose nommée a sa ligne Regarder ; les regards répétés suivent normal, normal, normal, absurde.
- [ ] Chaque personnage a 2 à 4 sujets, un `hug`, un `refuse` et une couleur à lui.
- [ ] Chaque verbe a 3 à 6 réponses par défaut dans la voix du héros. Pas de « Ça ne marche pas ».
- [ ] Les indices couvrent chaque étape de chaque lieu, dans l'ordre, jusqu'à la fin.
- [ ] Chaque mini-jeu a une raison dans l'histoire, un bouton Passer, et dure une trentaine de secondes.
- [ ] La carte ne montre que les lieux débloqués ; les marques de nouveauté pointent vers l'étape suivante.
- [ ] Chaque changement d'état a un son.
- [ ] Aucune ligne de plus de 90 caractères.
- [ ] `validate` : aucune erreur. `solve` : fini, sans impasse, sans objet inutilisé. `solve --prove` : `solved`.
- [ ] Dépôt du moteur : `npm test` et `npm run e2e` passent ; captures relues.
- [ ] Joué du début à la fin sur un vrai téléphone, en paysage.
- [ ] Fin scellée vérifiée avec `npm run check:spoilers` ([La fin scellée](create.sealed-ending.md)).
- [ ] Quelqu'un d'autre y a joué sans aide ([Playtests](create.playtests.md)).

Ensuite, construisez et livrez : [Construire et publier un jeu](create.build-release.md).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- `validate` : sa dernière ligne commence par `✔  [<jeu>]` et compte les lieux, objets et personnages ; code 0. Les
  avertissements (`⚠`) ne le font pas échouer. « (images not checked: run npm run assets) » veut dire que les images
  n'ont pas été vérifiées.
- `solve` : `✔ The game can be finished` et `✔ Witness solved: …`, code 0.
- `solve --prove` : `✔ Proof solved: the ending stays reachable from every one of the N reachable states`, code 0.
- `lint` : code 0 ; les remarques qui restent sont de l'information, ou ignorées exprès.

Le code de sortie est le verdict : 0 réussi, 1 un problème à corriger, 2 la recherche a été tronquée et rien n'est
prouvé.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `solve` sort avec 2, `truncated: the search stopped at N states, nothing is proved (raise --max)` | Le budget est trop petit pour le jeu | Augmentez `--max`, `--time` ou `--mem`, prouvez par chapitres, lisez le profil ([Options du solveur](create.solver-options.md)). |
| `softlocks: N reachable state(s) can no longer reach the ending` | Un objet consommé, un flag qui ferme, un indice caché | Lisez les causes et rejouez leur chemin ([Ce que prouve le solveur](create.solver-proofs.md#what-it-proves)). |
| `Dead ends (n): …` | Un état où aucune action ne change rien | Rendez l'objet, ou assouplissez la condition ([les alertes](create.solver-proofs.md#warnings)). |
| `broken: N invariant(s) broken on a reachable state` | Un bug « plus jamais » est revenu | Le chemin est affiché ; corrigez la règle qu'il nomme. |
| `lint` sort avec 1 avec `cond-never-true` ou `hint-stuck` | Une condition ou un indice attend quelque chose que rien ne pose | Posez-le quelque part, ou changez la condition ; ou ignorez-le dans `lint.ignore` si c'est voulu. |
| `fallback-unplayed` | Le fallback d'un signal requis est déclaré sur une règle que le témoin du monde fermé ne joue jamais | [Un jeu relié au monde extérieur](create.solver-proofs.md#reality-worlds). |
| Le résultat dit `(from the proof cache, key …)` et vous en doutez | Le cache a répondu parce que rien n'a changé | `--no-cache` ou `PROOF_CACHE=0` relance le calcul ([le cache de preuves](create.solver-options.md#proof-cache)). |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Les vérifications ne font que lire votre jeu. Ce qu'elles écrivent : `.cache/proofs/` (le cache de preuves), et les
dossiers que vous nommez avec `--out`. `npm run e2e` écrit ses captures dans `E2E_OUT` (par défaut `/tmp/e2e`).
`validate --report` écrit dans le terminal ; `page:world` et `page:puzzles` écrivent leur page sous `dist-pages/` (ou
`--out <dossier|fichier.html>`). `ids --write` et `provenance --lock` sont les exceptions qui changent des fichiers
que vous commitez : ce ne sont pas des vérifications, et elles le disent.

<a name="recovery"></a>

## Revenir en arrière

Rien à défaire : une vérification ne change pas le jeu. Pour repartir de zéro, supprimez `.cache/proofs/`.

<a name="references"></a>

## Références

- [`tools/validate.ts`](../../tools/validate.ts), [`tools/solve.ts`](../../tools/solve.ts), [`tools/lint.ts`](../../tools/lint.ts),
  [`cli/quest-n-click.mjs`](../../cli/quest-n-click.mjs)
- [Ce que prouve le solveur](create.solver-proofs.md), [Options du solveur](create.solver-options.md), [Playtests](create.playtests.md)
- [L'onglet Check du Studio](studio.check.md), [Outils MCP](studio.mcp-tools.md)
- [Scripts npm](reference.npm-scripts.md), [CLI](reference.cli.md)
