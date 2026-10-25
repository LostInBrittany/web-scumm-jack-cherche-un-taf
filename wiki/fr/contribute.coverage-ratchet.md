# Le cliquet de couverture

Les seuils de couverture de `vite.config.ts` ne font que monter. Deux vérifications les tiennent : Vitest échoue quand
les tests atteignent moins qu'un seuil, et le cliquet échoue quand un seuil traîne trois points ou plus derrière ce que
les tests atteignent. Cette page dit quoi faire quand l'une ou l'autre est rouge.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un job `coverage` de nouveau vert : chaque seuil atteint, et chaque seuil à moins de trois points de ce que mesurent
les tests.

<a name="context-and-versions"></a>

## Contexte et versions

Le dépôt du moteur. Les seuils datent de la 4.1.0 « Clarity » (le niveau mesuré alors) ; le cliquet,
[`tools/coverage-ratchet.ts`](../../tools/coverage-ratchet.ts), de la 4.1.3 ; ses annotations GitHub de la 4.1.9.

Ce qui est mesuré : la couverture V8 de `src/**/*.ts` (pas les `*.d.ts`), `bridge/src/**/*.ts` et
`studio-server/src/**/*.ts`, par la suite unitaire et les tests d'assets (`npm run test:coverage`). Les seuils en
4.4.0 :

| Portée | Seuil |
|---|---|
| Tous les fichiers mesurés | lignes 75, instructions 74, fonctions 71, branches 70 |
| `src/engine/core/{cond,diff,migrate,save}.ts` | branches 100 |
| `src/engine/core/session-runtime.ts`, `tools/replay.ts`, `core/content-ids.ts` | branches 94, 99, 96 |
| `src/engine/core/reality-runtime.ts`, `reality/protocol.ts`, `reality/client.ts`, `reality/http-port.ts` | lignes et branches, de 90 à 100 |
| 23 fichiers du Studio Server (le journal, la barrière, OIDC, les baux, les aperçus, les jobs du worker…) | lignes et branches, deux points sous ce qui était mesuré à l'arrivée de chacun |
| 6 fichiers du Bridge (`bridge.ts`, `store.ts`, `server.ts`, `policy.ts`, `lock.ts`, `cli.ts`) | lignes et branches |

Les valeurs exactes sont dans [`vite.config.ts`](../../vite.config.ts), `test.coverage.thresholds`, avec la raison de
chaque seuil sous 100 écrite à côté.

> [!LIMIT id=lines-not-proof]
> La couverture compte les lignes et les branches exécutées, pas les résultats vérifiés. Les parties de `src/` propres
> au navigateur (l'interface du joueur et celle du Studio) sont couvertes par les e2e, pas par cette mesure ; savoir si
> les tests distinguent un bon résultat d'un mauvais, c'est la question des [Tests de mutation](contribute.mutation-testing.md).

<a name="prerequisites"></a>

## Prérequis

Un dépôt préparé avec Python et ses modules d'image ([Préparer son poste de développement](contribute.setup.md)) : les
tests d'assets tournent eux aussi sous couverture.

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le dépôt du moteur, sur votre machine. La CI lance la même chose dans son job `coverage`.

<a name="steps"></a>

## Étapes

<!-- step: measure -->
1. **Mesurez.**

   ```sh
   # dans le dépôt du moteur
   npm run test:coverage
   ```

   Elle lance la suite unitaire sous couverture et écrit `.cache/coverage/` (un résumé texte, `coverage-summary.json`,
   un rapport HTML dans `.cache/coverage/index.html`). Vitest échoue ici quand un seuil n'est pas atteint, en nommant
   le fichier et la mesure.

<!-- step: floor-not-met -->
2. **Un seuil non atteint** (les tests atteignent moins que lui) : votre changement a retiré des tests ou ajouté du code
   qu'aucun test n'exécute. Ajoutez les tests ; ouvrez `.cache/coverage/index.html` pour voir les lignes et les
   branches non exécutées. On n'abaisse jamais un seuil pour laisser passer un changement.

<!-- step: ratchet -->
3. **Lisez le cliquet.**

   ```sh
   # dans le dépôt du moteur, après test:coverage
   npx tsx tools/coverage-ratchet.ts            # avertit
   npx tsx tools/coverage-ratchet.ts --strict   # échoue, comme sur main
   ```

   Chaque ligne `⚠ <portée> <mesure>: floor <n>, measured <m>` est un seuil trois points ou plus sous ce que les tests
   atteignent. La fin dit `✔ every coverage floor is within three points of what the tests reach`, ou le nombre de
   seuils à relever.

<!-- step: raise -->
4. **Relevez les seuils qu'il nomme** dans `vite.config.ts` (`test.coverage.thresholds`), à une valeur égale ou un peu
   inférieure à la mesure, et committez-les avec le changement qui les a mérités. `vite.config.ts` est un fichier que
   relit le mainteneur (`CODEOWNERS`).

> [!LIMIT id=ratchet-scope]
> Le cliquet ne lit que les seuils qui existent : un fichier sans seuil propre n'est tenu que par les seuils globaux.
> Un seuil par fichier s'applique quand le résumé contient ce fichier.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`npm run test:coverage` passe et `npx tsx tools/coverage-ratchet.ts --strict` sort avec 0. Dans la CI, le job
`coverage` est vert, sans annotation « coverage ratchet ».

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| Vitest : un seuil de lignes, branches, fonctions ou instructions non atteint | Moins de lignes exécutées que le seuil | Ajoutez des tests (étape 2) |
| Annotation `⚠ coverage ratchet` sur une pull request | Un seuil trois points ou plus sous la mesure | Pas bloquant sur une pull request : relevez-le (étape 4), ou laissez-le au prochain changement |
| `✖ n floor(s) at least 3 points below…` sur `main`, un tag ou `release-check` | La même chose, sous `--strict` | Relevez les seuils, dans une pull request |
| `✖ …: no coverage summary (npm run test:coverage first)` | Le cliquet a tourné sans mesure | Lancez d'abord `npm run test:coverage` (sortie 2 sinon) |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`vite.config.ts` (les seuils) ; la mesure n'écrit que dans `.cache/coverage/`.

<a name="recovery"></a>

## Revenir en arrière

Un seuil relevé trop haut fait échouer l'exécution suivante : redescendez-le à ce que les tests atteignent (avec la
raison dans la pull request), car un seuil au-dessus de la mesure est un build rouge, pas une promesse.

<a name="references"></a>

## Références

- [`tools/coverage-ratchet.ts`](../../tools/coverage-ratchet.ts), [`vite.config.ts`](../../vite.config.ts).
- [Quels tests tournent quand](contribute.which-tests.md), [La CI expliquée](contribute.ci.md#tiers),
  [Tests de mutation](contribute.mutation-testing.md).
