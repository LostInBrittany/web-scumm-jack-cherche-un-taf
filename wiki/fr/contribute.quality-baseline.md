# La référence de qualité

`tests/quality-baseline.json` fige ce que fait le moteur : sur un ensemble de jeux, le témoin que trouve le solveur et
l'empreinte de l'état après chaque entrée, le verdict de la preuve et son nombre d'états, chaque sauvegarde de référence
jouée jusqu'au bout, la surface publique, le nombre de tests et le JavaScript de la première visite. Une refonte la
laisse identique ; un changement de comportement la réécrit volontairement et le dit.

<a name="what-you-get"></a>

## Ce que vous obtenez

Soit `✔ same behaviour as tests/quality-baseline.json` pour un changement censé garder le comportement, soit une
référence réécrite dont vous connaissez chaque ligne qui a bougé et que vous assumez dans le fragment du CHANGELOG.

<a name="context-and-versions"></a>

## Contexte et versions

Le dépôt du moteur. La référence date de la 4.1.0 « Clarity » (figée avant le découpage du moteur en modules) ; le
rapport « ratcheted » de la 4.1.3 ; les chiffres des README de la 4.1.8 ; la section d'installation du README de la
4.1.20 ; `heroes` parmi les jeux mesurés de la 4.4.0.

Ce qu'elle mesure, en 4.4.0 ([`tools/quality-baseline.ts`](../../tools/quality-baseline.ts)) :

| Partie | Ce qui est figé | Règle |
|---|---|---|
| `games` (16) | `demo`, `reference`, `heroes`, les cinq classiques, trois fixtures d'ordre partiel, et les fixtures `world`, `cast`, `scale`, `picture`, `mini` : le témoin (statut, terminé, nombre d'entrées, une empreinte des empreintes après chaque entrée) et la preuve (statut, états, blocages) | identique |
| `saves` (43 en 4.4.0) | chaque sauvegarde de référence de `tests/fixtures/saves/demo-*.json`, chargée et jouée jusqu'au bout : terminée, entrées, dernière empreinte | identique |
| `surface.api` | une empreinte de `tests/api-surface.json` (l'API publique et les outils MCP) | identique |
| `tests` | fichiers de test et déclarations de test (`it(`, `test(`, `.each`, `.skipIf`, `.runIf`) | ne peut que croître |
| `bundle.initialJsKB` | le JavaScript de la première visite, compressé, d'après `verify:dist` (avec `--dist`) | ne peut que diminuer |

Elle tient aussi à jour deux endroits des README : les chiffres entre les marqueurs `<!-- metric:tests -->`,
`metric:initialJsKB` et `metric:referenceStates` (3257 déclarations, 136 Ko et 288 états en 4.4.0), et l'URL de
l'archive entre `<!-- install:begin -->` et `<!-- install:end -->`.

<a name="prerequisites"></a>

## Prérequis

Un dépôt préparé ([Préparer son poste de développement](contribute.setup.md)). Pour `--dist`, un build de production du
jeu d'exemple dans `dist/` (`npm run build:game`).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le dépôt du moteur, sur votre machine. Le job `check` de la CI lance
`npm run quality:baseline -- --check --dist` à chaque changement.

<a name="steps"></a>

## Étapes

<!-- step: check -->
1. **Comparez.**

   ```sh
   # dans le dépôt du moteur
   npm run quality:baseline -- --check
   npm run build:game && npm run quality:baseline -- --check --dist   # avec la première visite, comme la CI
   ```

   Elle résout et rejoue chaque jeu (`quality baseline: solving and replaying…`), puis affiche `✔ same behaviour…`, ou
   une ligne `✖` par différence, par exemple `demo witness.digests: … → …` (un état après une entrée diffère :
   `npm run replay` sur le témoin nomme l'entrée), `golden save demo-3.4.0.json last: … → …`,
   `tests/api-surface.json: the public API or the MCP tools changed`, ou `README.md: a figure is behind the baseline`.

<!-- step: decide -->
2. **Décidez ce qu'est une différence.**
   - Votre changement devait garder le comportement (une refonte, un renommage, une accélération) : une différence est
     une régression. Trouvez-la ; `npm run replay` sur le témoin nomme la première entrée dont l'état diffère.
   - Votre changement modifie le comportement volontairement (une règle, une commande, un changement du solveur, un
     nouveau test, un bundle plus petit) : passez à l'étape 3.

<!-- step: rewrite -->
3. **Réécrivez-la**, avec la première visite si votre changement peut la faire bouger :

   ```sh
   # dans le dépôt du moteur
   npm run quality:baseline
   npm run build:game && npm run quality:baseline -- --dist
   ```

   Une réécriture dit ce qu'elle déplace, avant d'écrire : `⚠ behaviour moved: …` pour une empreinte, un verdict, une
   sauvegarde ou la surface, et `✔ ratcheted: …` pour plus de tests ou une première visite plus légère. Elle écrit
   `tests/quality-baseline.json`, puis les chiffres et l'URL d'installation de `README.md` et `README.fr.md`
   (`✔ README.md: the figures written`). Sans `--dist`, le `bundle` précédent est gardé.

<!-- step: own -->
4. **Assumez-la.** Committez le JSON et les README avec le changement ; dites dans le fragment du CHANGELOG ce qui a
   bougé et pourquoi (« le témoin du chapitre de référence change », « la première visite passe de 125 à 132 Ko »).
   `tests/quality-baseline.json` est un fichier que relit le mainteneur (`CODEOWNERS`).

> [!LIMIT id=what-baseline-covers]
> La référence ne fige que ces jeux, ces sauvegardes et ces chiffres. Un comportement qu'aucun jeu mesuré n'exerce peut
> changer sans la faire bouger ; une nouvelle mécanique va dans une fixture ou un jeu de la liste, ou dans son propre
> test.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`npm run quality:baseline -- --check --dist` se termine par `✔ same behaviour as tests/quality-baseline.json: 16 games,
n golden saves, n test declarations, first visit n KB` et le code de sortie 0.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `README.md: a figure is behind the baseline (npm run quality:baseline writes it)` | Vous avez ajouté un test (le nombre de tests a bougé) sans réécrire | `npm run quality:baseline`, committez les README |
| `⚠ better than the baseline, ratchet it` | Plus de tests, ou une première visite plus légère : pas un échec en soi | Réécrivez-la pour garder le gain |
| `tests: n declarations → m (a test was removed)` | Un test a été supprimé ou fusionné | Remettez-le, ou assumez le retrait dans la pull request et réécrivez |
| `first visit's JavaScript: n KB → m KB gzipped` | Le premier morceau du joueur a grossi | Chargez le nouveau code à la demande ([Frontières d'import](contribute.boundaries.md#layers)), ou assumez la hausse |
| `<jeu>: new game, not in the baseline` | Un jeu a été ajouté à la liste | Réécrivez-la |
| `README.md: the install section names another version` | La version de `package.json` a changé (une release) | Réécrivez-la : c'est la branche de release qui le fait |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`tests/quality-baseline.json`, `README.md`, `README.fr.md`. `--check` n'écrit rien.

<a name="recovery"></a>

## Revenir en arrière

`git restore tests/quality-baseline.json README.md README.fr.md` annule une réécriture non voulue.

<a name="references"></a>

## Références

- [`tools/quality-baseline.ts`](../../tools/quality-baseline.ts), [`tests/quality-baseline.json`](../../tests/quality-baseline.json).
- [Avant une pull request](contribute.before-a-pr.md#steps), [La boucle de développement](contribute.dev-loop.md),
  [Mesures de performance](contribute.benchmarks.md).
