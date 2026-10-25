# Quels tests tournent quand

Chaque suite de tests du dépôt du moteur, la commande qui la lance, et quand la CI la lance : sur une pull request, sur
`main`, dans un candidat, dans la release, chaque nuit ou chaque semaine. À lire avec [La CI expliquée](contribute.ci.md),
qui dit ce qu'est chaque workflow et chaque job.

<a name="suites"></a>

## Les suites

« PR » est une pull request ordinaire ; « barrière » veut dire que le job ne tourne que si le plan ouvre cette barrière
([La CI expliquée](contribute.ci.md#the-plan)), et toujours sur `main`, sur un tag et sur une pull request étiquetée
`full-ci`. « Release » est le workflow `release` sur un tag `v*`. Chaque commande se lance dans le dépôt du moteur.

| Suite | Commande | Ce qu'elle lance | PR | `main` | Candidat | Release | Nightly | Hebdo |
|---|---|---|---|---|---|---|---|---|
| Unitaire (Node) | `npm test` (`test:node`) | chaque `tests/**/*.test.ts` et les `games/<GAME>/tests/` du jeu, sauf les 9 fichiers lourds et les 2 fichiers d'assets | via la couverture ; sous Node 24 (barrière `node24`) ; sous Windows sans les fichiers POSIX (barrière `windows`) | oui | oui (`release-check:ci`) | oui (`release-check:ci`) | — | — |
| Couverture | `npm run test:coverage` | la suite unitaire et les tests d'assets sous couverture V8, puis les seuils de `vite.config.ts` et le cliquet | oui (job `coverage` ; le cliquet avertit) | oui (cliquet strict) | oui | oui | — | — |
| Assets | `npm run test:assets` | `tests/pixel.test.ts`, `tests/studio-assets.test.ts` (Python nécessaire) | dans la couverture | dans la couverture | dans la couverture | dans la couverture | — | — |
| Solveur lourd | `npm run test:heavy` | 9 fichiers l'un après l'autre : `ownership`, `audit`, `canonical`, `memo`, `reference-proof`, `solver-oracle`, `dominance`, `partition`, `checkpoint-matrix` | — | — | trois fois, chacune sur un runner neuf (`heavy` ×3) | — | oui (`heavy`) | — |
| Qualité | `npm run quality` | formatage, lint du code, knip, les deux configurations TypeScript, lint de contenu | oui (`check`) | oui | oui | oui | — | — |
| Vérité des docs | `npm run docs:truth` | ce que disent les docs, comparé au code | oui (`check`) | oui | — | — | — | — |
| Wiki | `npm run wiki -- check` | le manifeste, les pages, les liens, la parité, les exemples ; dans la suite unitaire sous forme de `tests/wiki-*.test.ts` | oui | oui | oui (suite unitaire) | `check --publish` (`docs-publish`) | — | — |
| Barrières du jeu | `npm run build:game` (`verify:game`, le bundle, `verify:dist`, spoilers, audit des assets) | le jeu d'exemple | oui (`check`) ; le chapitre de référence et `heroes` (barrière `reference`) ; un nouveau jeu (barrière `secondGame`) | oui | oui | oui | — | — |
| Référence | `npm run quality:baseline -- --check --dist` | témoins, preuves, sauvegardes de référence, surface publique, nombre de tests, première visite | oui (`check`) | oui | — | — | — | — |
| Preuve | `npm run prove:game` | la preuve exhaustive, globale et par chapitre, et `solve:reality` | oui (`check` ; `reference`, `second-game` selon la barrière) | oui | oui | oui | — | oui (`prove`) |
| Audit des abstractions | `npm run solve -- --audit-abstractions` | le jeu d'exemple prouvé avec et sans les abstractions | — | — | oui (`release-check:ci`) | oui | — | — |
| Corpus | `npm run audit:corpus` | les abstractions contre la recherche explicite sur des jeux aléatoires | — | — | — | — | oui (500 graines de chaque sorte, quatre morceaux) | — |
| Matrice de preuve | `npm run prove:matrix` | les douze instances de `docs/dev/PROOF-MATRIX.md` | — | — | — | — | oui (`matrix`) | — |
| Banc d'essai | `npm run bench` | un jeu généré de 100 lieux, chronométré et prouvé dans un budget | — | — | — | — | — | oui (`prove`, téléversé) |
| Playtests | `npm run playtests` | les sessions committées rejouées et résumées | dans `verify:game` | oui | `--strict` dans `verify:release` | `--strict` dans `verify:release` | — | `--strict` (`prove`) |
| e2e, Chromium | `npm run e2e`, `e2e:weight`, `e2e:music`, `e2e:visual`, `e2e:perf`, `e2e:studio`, `e2e:a11y`, `e2e:pwa`, `e2e:taps` | le build de production joué au toucher, au clavier, en français, avec Canvas | barrières `e2e`, `reference`, `secondGame` | oui | — | — | — | — |
| e2e, WebKit | les mêmes scripts avec `E2E_BROWSER=webkit` | lignes générique et clavier, le chapitre de référence, `e2e:pwa` (hors ligne sauté) | barrières `e2e`, `reference` | oui | — | — | — | — |
| e2e, Firefox | `npm run e2e:pwa`, `e2e:studio-hosted -- --browser=firefox` | le scénario PWA ; le Studio hébergé | barrières `pwaFirefox`, `studioHosted` | oui | — | — | — | — |
| Cross-runtime | `npm run e2e:canonical`, `e2e:remix`, `e2e:speedrun`, `e2e:remix-speedrun` | les mêmes résultats sous Node, Chromium, WebKit et Firefox | oui (chaque changement) | oui | oui (500 graines Remix) | — | oui (500 graines Remix) | — |
| Reality | `npm run e2e:reality`, `npm run reality:xcheck -- --require-rust`, les tests et le fuzz des connecteurs, le Bridge sur Postgres | les signaux de bout en bout ; Biscuit en JS et en Rust ; les connecteurs | barrière `reality` | oui | `reality:xcheck` dans `release-check:ci` | oui | fuzz, une minute par connecteur | — |
| Studio hébergé | `npx vitest run tests/studio-server.test.ts …`, `npm run e2e:studio-hosted`, `e2e:studio-collab` | Postgres, S3, Keycloak ; Chromium et Firefox | barrière `studioHosted` | oui | `studio-install-smoke` | — | — | — |
| Paquets | `npm run fresh-install`, `npm run external-consumer`, `npm run upgrade-check -- --from=previous` | empaqueté, installé hors du dépôt, mis à jour | barrières `freshInstall`, `upgrade` | oui | oui, sur les archives propres du candidat | — | — | — |
| Mutation | `npm run test:mutation:core -- --set=<ensemble>` | chaque ensemble barrière ([Tests de mutation](contribute.mutation-testing.md)) | seulement avec `full-ci` | — | oui | oui | oui (`--fresh`) | — |
| Charges du Bridge | `npm run bridge:load`, `npm run runs:load` | SQLite et Postgres | — | — | oui (médianes) | — | oui | — |
| Qualification | `npm run ops:qualify` | le profil de déploiement du Bridge sous Docker | quand `ops/`, `bridge/`, `scripts/pack.mjs` ou les dépendances changent (`qualify`) | mêmes chemins | oui (`deployment-smoke`) | — | — | — |
| Passes de terrain | `npm run field:*` | ce que seuls des gens et de vrais appareils peuvent vérifier | — | — | les rapports committés pour la version sont vérifiés | rapportées dans les notes | — | — |

Le workflow `release` ne refait pas ce que le candidat a construit : ses tests sont `release-check:ci` et les ensembles
de mutation, sur le commit du tag ([Publier une release](contribute.releasing.md)).

> [!LIMIT id=heavy-not-on-pr]
> Les tests lourds du solveur ne tournent pas sur une pull request ordinaire. L'étiquette `full-ci` lance un run de
> candidat, qui les passe trois fois ; sinon, un changement du solveur qui les casse se voit à la nightly suivante.
> Lancez `npm run test:heavy` en local (environ 13 minutes sur un portable, un fichier après l'autre) avant de demander
> la relecture d'un tel changement.

<a name="locally"></a>

## En local, avant une pull request

[Avant une pull request](contribute.before-a-pr.md) donne l'ordre. En bref : `npm run quality`, `npm run check`,
`npm run test:assets`, `npm run verify:game`, `npm run quality:baseline -- --check` ; `npm run release-check:local`
enchaîne l'essentiel. Lancez une suite à la fois.

<a name="find-the-test-of-a-thing"></a>

## Trouver le test d'une chose

- **Une commande** : cherchez sa clé dans `tests/cmds.test.ts` (chaque clé y a un exemple) et `tests/core.test.ts`.
- **Une règle de couche** : `tests/boundaries.test.ts` ([Frontières d'import](contribute.boundaries.md)).
- **Les noms publics** : `tests/api-surface.json`.
- **Un comportement du navigateur** : les scripts `scripts/e2e*.mjs` et `scripts/e2e-*.ts` (`npm run e2e`, `e2e:taps`,
  `e2e:pwa`, `e2e:a11y`…), lancés par la CI sous Chromium et WebKit (et Firefox pour la PWA et le Studio hébergé).
- **Ce que parcourt une étape du code** : chaque étape de la [Visite du code](contribute.code-tour.md) nomme son test.
- **Ce qui juge un mutant** : `TESTS` dans `tools/mutation-sets.ts` liste, pour chaque ensemble, les fichiers de test
  qui le jugent (`npx tsx tools/mutation-sets.ts --tests=<ensemble>`).

Pour changer une commande de bout en bout, suivez [La boucle de développement](contribute.dev-loop.md#changing-a-command).

<a name="related"></a>

## Identifiants liés

- `npm test`, `npm run test:node`, `npm run test:coverage`, `npm run test:assets`, `npm run test:heavy`,
  `npm run verify:game`, `npm run prove:game`, `npm run prove:matrix`, `npm run audit:corpus`, `npm run e2e`.
- [La CI expliquée](contribute.ci.md), [Le cliquet de couverture](contribute.coverage-ratchet.md),
  [La référence de qualité](contribute.quality-baseline.md), [Tests de mutation](contribute.mutation-testing.md).
