# Avant une pull request

Une seule liste de ce qu'il faut lancer et vérifier avant d'ouvrir une pull request sur le moteur, pour que la CI
confirme ce que vous savez déjà au lieu de vous l'apprendre.

<a name="what-you-get"></a>

## Ce que vous obtenez

Une branche dont le premier palier est vert sur votre machine (formatage, lint, types, tests unitaires, barrières du
jeu d'exemple), dont le changement de comportement est assumé, dont le fragment du CHANGELOG est là, et dont la
description de pull request dit ce qui change et ce qui reste.

<a name="context-and-versions"></a>

## Contexte et versions

Le dépôt du moteur, sur une branche nommée comme le dit [Conventions](contribute.conventions.md#branches). Les
commandes sont celles de la 4.4.0 ; les fragments du CHANGELOG existent depuis la 4.1.9, `release-check:local` depuis
la 4.1.17.

<a name="prerequisites"></a>

## Prérequis

- Un dépôt préparé : [Préparer son poste de développement](contribute.setup.md), avec Python et ses modules (les tests
  d'assets en ont besoin) et le Chromium de Playwright.
- Votre changement fait avec [La boucle de développement](contribute.dev-loop.md).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le dépôt du moteur, sur votre machine, sur votre branche. Lancez une suite de tests à la fois : deux suites côte
à côte se disputent les mêmes cœurs et laissent des workers orphelins quand on les interrompt.

<a name="steps"></a>

## Étapes

<!-- step: content-rules -->
1. **Respectez les règles du contenu.**
   - Le gameplay reste déclaratif dans `games/<id>/` ; la géométrie va dans `layout/*.json`, jamais tapée à la main.
   - Chaque règle, choix, sujet, écouteur, bloc persistant et étape de script du schéma 3 a un id stable.
     `npm run ids -- --write --map` écrit ceux qui manquent dans les sources ([État et sauvegardes](create.state-saves.md)).
   - Aucun asset source privé, rien dont les droits commerciaux sont flous.

<!-- step: quality -->
2. **Formatage, lint et types.**

   ```sh
   # dans le dépôt du moteur
   npm run quality
   ```

   Elle lance, dans cet ordre : `format:check` (formatage Biome), `lint:code` (lint Biome), `knip` (fichiers, exports
   et dépendances inutilisés), `tsc --noEmit` avec `tsconfig.json`, `tsc --noEmit -p tsconfig.strictest.json` (chaque
   accès indexé vérifié dans `src/`), et `lint:content` (le lint de contenu). `npm run format` écrit le formatage ; un
   commit qui ne fait que reformater est un commit à part, listé dans `.git-blame-ignore-revs`
   ([Conventions](contribute.conventions.md#formatting-commits)).

<!-- step: check -->
3. **La suite unitaire.**

   ```sh
   # dans le dépôt du moteur
   npm run check
   ```

   `check` choisit le jeu, vérifie les types, puis lance `test:node` : tous les fichiers de test sauf les tests lourds
   du solveur (la nightly et le candidat les lancent) et les deux tests d'assets (étape suivante).

<!-- step: assets -->
4. **Les tests d'assets**, qui demandent Python et ses modules d'image.

   ```sh
   # dans le dépôt du moteur
   npm run test:assets
   ```

<!-- step: verify-game -->
5. **Les barrières du jeu.**

   ```sh
   # dans le dépôt du moteur
   npm run verify:game
   ```

   Elle lance `validate`, `solve`, `solve -- --chapters`, `verify:variants`, `i18n -- status`, le lint de contenu et
   `playtests`, sur le jeu courant.

<!-- step: baseline -->
6. **La référence de comportement.** Un changement censé garder le comportement la laisse identique :

   ```sh
   # dans le dépôt du moteur
   npm run quality:baseline -- --check
   ```

   Un changement qui modifie volontairement le comportement, ou qui ajoute un test, la réécrit avec
   `npm run quality:baseline` (qui écrit aussi les chiffres des README) et committe le résultat. Voir
   [La référence de qualité](contribute.quality-baseline.md).

<!-- step: docs -->
7. **La documentation**, quand vous l'avez touchée, ou le code sur lequel repose une page :

   ```sh
   # dans le dépôt du moteur
   npm run docs:truth
   npm run wiki -- check
   ```

   `wiki -- check` se termine par `✔ … 0 error(s)` ; [Écrire la documentation](contribute.writing-docs.md) dit
   comment les pages s'écrivent et se vérifient.

<!-- step: fragment -->
8. **Le fragment du CHANGELOG.** Une branche qui modifie `src/`, `bridge/`, `tools/`, `scripts/`, `cli/`,
   `connectors/` ou `games/` porte `changes/<slug>.md` (et `changes/<slug>.log.md` pour une entrée du LOG) :

   ```sh
   # dans le dépôt du moteur
   npm run changes -- --check
   ```

   Elle affiche `✔ … a fragment or a CHANGELOG edit is there, or no code moved`, ou le refus et ce qu'il faut écrire
   ([Conventions](contribute.conventions.md#changes-fragments)).

<!-- step: browser -->
9. **Un changement visuel ou dans le navigateur** : construisez pour la production, servez, jouez, et regardez les
   captures.

   ```sh
   # dans le dépôt du moteur
   npm run build:game
   npm run preview -- --port 5173 &
   npm run e2e:smoke -- http://127.0.0.1:5173/
   ```

   `e2e:smoke` joue le build de production avec le harnais générique dans un Chromium de 844 × 390 ; les captures
   arrivent dans `E2E_OUT` (par défaut `/tmp/e2e`). Ouvrez-les. Arrêtez ensuite le serveur de prévisualisation
   (`kill %1` dans le même shell).

<!-- step: one-line -->
10. **La même chose, en une ligne.** `release-check:local` enchaîne la plupart des étapes ci-dessus :

    ```sh
    # dans le dépôt du moteur
    npm run release-check:local
    ```

    Elle lance `quality`, `docs:truth`, `test:node`, `build:game` (les barrières du jeu, le bundle, `verify:dist`, la
    vérification des spoilers, l'audit des assets) et `quality:baseline -- --check --dist`. Elle ne lance ni
    `test:assets`, ni `changes -- --check`, ni `wiki -- check`, ni le navigateur.

<!-- step: open-pr -->
11. **Ouvrez la pull request** depuis `.github/PULL_REQUEST_TEMPLATE.md`, avec un titre comme le dit
    [Conventions](contribute.conventions.md#titles). Remplissez chaque section : « What changes » (ce qu'un joueur, un
    auteur ou un hébergeur voit de différent), « Checked », et « Not done, said as such » (« Nothing » quand il ne
    reste rien). Un changement visuel porte une capture dans la description.

> [!LIMIT id=template-checklist]
> La liste « Checked » du modèle ne nomme que `npm run quality` et `npm test`. La liste de cette page est la liste
> complète : `knip` (dans `quality`), `check`, `test:assets` et `verify:game` sont attendus aussi.

<a name="milestone-verification"></a>

### La liste de chaque jalon (reprise de la feuille de route)

La feuille de route des jalons v1.3 à v2 avait sa propre liste, déroulée à chaque jalon ; elle est gardée ici telle
qu'elle était écrite :

1. `npm run validate && npm run solve && npm test && npm run build` verts, CI verte, audit d'assets vert.
2. La démo utilise chaque nouvelle primitive au moins une fois et l'e2e la traverse (captures 844 × 390).
3. Une sauvegarde faite avec la version précédente de la démo se charge après migration (un test unitaire sur un JSON
   figé par jalon). Aujourd'hui, une sauvegarde de référence par version depuis la 3.0 vit dans
   `tests/fixtures/saves/` et se joue jusqu'à la fin dans `tests/save-v3.test.ts` et dans la référence de qualité.
4. Une copie de `src/engine` dans le jeu privé : ses tests, son solveur et son e2e inchangés (à l'époque : 37 tests,
   une solution de 62 actions, l'e2e du jeu privé d'origine identiques).
5. MCP : `npm run -s mcp` liste les outils mis à jour ; une session d'IA neuve ajoute un script ou un événement à la
   démo en suivant seulement le guide de contenu.
6. Une release taguée avec ses notes, et la table « Versions » du README mise à jour. Le README nomme désormais la
   version courante dans sa section Documentation plutôt que dans une table ; les releases se font comme le dit
   [Publier une release](contribute.releasing.md).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Chaque commande ci-dessus finit au vert. Sur la pull request, `pr-gate` passe au vert une fois que chaque job du plan
a réussi ([La CI expliquée](contribute.ci.md)) ; un job que le plan épargne dit « not needed by the plan » et réussit.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `format:check` échoue | Un fichier n'est pas formaté | `npm run format`, dans un commit à part s'il reformate plus que votre changement |
| `knip` nomme un export ou un fichier inutilisé | Du code mort laissé par le changement | Supprimez-le, ou utilisez-le |
| `✖ this branch changes the code and carries no fragment` | Pas de `changes/<slug>.md` | Écrivez-le ([Conventions](contribute.conventions.md#changes-fragments)) |
| `✖ behaviour moved from tests/quality-baseline.json` | Une empreinte, un verdict, une sauvegarde de référence ou la surface d'API a bougé, ou un chiffre du README est en retard | [La référence de qualité](contribute.quality-baseline.md) |
| `test:assets` échoue à l'import | Modules Python absents | `python3 -m pip install --require-hashes -r requirements.txt` |
| Le job de couverture de la CI avertit « coverage ratchet » | Un seuil est à trois points ou plus sous ce que les tests atteignent | Pas bloquant sur une pull request ; relevez-le ([Le cliquet de couverture](contribute.coverage-ratchet.md)) |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`npm run format` réécrit des fichiers sources ; `npm run quality:baseline` réécrit `tests/quality-baseline.json` et les
chiffres de `README.md` et `README.fr.md` ; `npm run ids -- --write --map` écrit des ids dans `games/<id>/`. Les
vérifications elles-mêmes n'écrivent que sous `.cache/` et `/tmp/e2e`.

<a name="recovery"></a>

## Revenir en arrière

Une réécriture non voulue (`format`, `quality:baseline`) s'annule avec `git restore <fichier>`. Une exécution de tests
interrompue peut laisser des workers Vitest en marche : arrêtez-les par leur numéro de processus (`ps` puis
`kill <pid>`), pas par un motif.

<a name="references"></a>

## Références

- [Quels tests tournent quand](contribute.which-tests.md), [La CI expliquée](contribute.ci.md).
- [Conventions](contribute.conventions.md), [La référence de qualité](contribute.quality-baseline.md),
  [Le cliquet de couverture](contribute.coverage-ratchet.md).
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md), [`.github/PULL_REQUEST_TEMPLATE.md`](../../.github/PULL_REQUEST_TEMPLATE.md).
