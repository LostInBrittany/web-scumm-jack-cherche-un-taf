# Visite du code

Une demi-heure avec le code ouvert : huit étapes, d'un tout petit jeu jusqu'au test qui prouve chaque partie. Chaque
étape nomme les fichiers à lire et le test qui les montre à l'œuvre. [Architecture](contribute.architecture.md) est la
même carte vue d'en haut.

<a name="overview"></a>

## Ce que vous allez construire

Pas une fonctionnalité : une image du moteur dans votre tête, faite en lisant du vrai code et en lançant le test de
chaque étape. Il vous faut un dépôt préparé ([Préparer son poste de développement](contribute.setup.md)) et un
éditeur. Chaque test d'une étape se lance seul :

```sh
# dans le dépôt du moteur
npx vitest run <fichier>
```

La visite suit le code de la 4.4.0 ; ses étapes datent de la 4.1.0 (et de la 4.1.1 pour le signal).

<a name="declare"></a>

## 1. Déclarer un petit jeu

<!-- step: declare -->
Lisez [`tests/fixtures/classics.ts`](../../tests/fixtures/classics.ts) : cinq tout petits jeux d'après les classiques
(`insults`, `grog`, `dott`, `mansion`, `stan`), chacun un `GameDef` de quelques lieux et règles. Une règle est
`{ verb, a, b, if, do }` ; `do` est une liste de commandes (`Cmd`, dans
[`src/engine/core/types/content.ts`](../../src/engine/core/types/content.ts)). Les types d'un jeu complet sont dans
[`src/engine/core/types/game.ts`](../../src/engine/core/types/game.ts). La démo, écrite de la même façon mais plus
grande, est `games/demo/`.

```sh
# dans le dépôt du moteur
npx vitest run tests/classics.test.ts
```

Vous voyez chaque mécanique classique jouée jusqu'au bout par le vrai moteur.

<a name="compile"></a>

## 2. Le compiler et le figer

<!-- step: compile -->
`compileGame` dans [`src/engine/core/define.ts`](../../src/engine/core/define.ts) clone le contenu, remplit les valeurs
par défaut, le fige et donne à chaque règle, choix, sujet, écouteur et étape de script un id stable
([`src/engine/core/content-ids.ts`](../../src/engine/core/content-ids.ts)). Sauvegardes et sessions parlent avec ces
ids : renommer une réplique ne casse pas une sauvegarde.

```sh
# dans le dépôt du moteur
npx vitest run tests/compile.test.ts tests/stable-ids.test.ts
```

<a name="start"></a>

## 3. Démarrer une partie

<!-- step: start -->
`new Engine(game, layouts, presenter, store)` puis `newGame()`
([`src/engine/core/engine.ts`](../../src/engine/core/engine.ts)). Dans les tests, le presenter est `FakePresenter` et le
stockage `MemoryStore` ([`src/engine/core/ports.ts`](../../src/engine/core/ports.ts)) ; dans le navigateur, `App`
([`src/engine/dom/app.ts`](../../src/engine/dom/app.ts)) compose le moteur avec le `DomPresenter`, et `bootGame`
([`src/engine/boot.ts`](../../src/engine/boot.ts)) branche le tout.

```sh
# dans le dépôt du moteur
npx vitest run tests/core.test.ts -t "fixture game"
```

<a name="run-an-action"></a>

## 4. Jouer une action

<!-- step: run-an-action -->
`Engine.act` y va, ouvre une entrée de session et appelle `resolve`
([`src/engine/core/interactions.ts`](../../src/engine/core/interactions.ts)) : la règle que choisit `findRule`, sinon un
genre, sinon une réplique de repli. Ses commandes passent par `exec` et `step`
([`src/engine/core/command-runtime.ts`](../../src/engine/core/command-runtime.ts)), chacune par son gestionnaire dans
[`src/engine/core/command-handlers.ts`](../../src/engine/core/command-handlers.ts) ; les événements et les scripts dans
[`src/engine/core/event-runtime.ts`](../../src/engine/core/event-runtime.ts) et
[`src/engine/core/script-runtime.ts`](../../src/engine/core/script-runtime.ts).

```sh
# dans le dépôt du moteur
npx vitest run tests/core-runtime.test.ts
```

Chaque module d'exécution y est appelé seul, avec le moteur en premier argument.

<a name="save-load-replay"></a>

## 5. Sauvegarder, charger, rejouer

<!-- step: save-load-replay -->
`saveEnvelope` et `parseSave` ([`src/engine/core/save.ts`](../../src/engine/core/save.ts)) écrivent et vérifient une
sauvegarde ; `migrate` ([`src/engine/core/migrate.ts`](../../src/engine/core/migrate.ts)) fait suivre une ancienne ;
`tests/save-v3.test.ts` charge une sauvegarde par version depuis la 3.0 et la joue jusqu'à la fin. La session
([`src/engine/core/session-runtime.ts`](../../src/engine/core/session-runtime.ts)) enregistre chaque entrée avec
l'empreinte de l'état qui suit ; `replay` ([`src/engine/tools/replay.ts`](../../src/engine/tools/replay.ts)) la rejoue et
nomme la première entrée qui diffère.

```sh
# dans le dépôt du moteur
npx vitest run tests/replay.test.ts -t "a recorded session"
```

<a name="solver"></a>

## 6. La même action dans le solveur

<!-- step: solver -->
`solve` ([`src/engine/tools/solve/search.ts`](../../src/engine/tools/solve/search.ts)) prend un état de la frontière ;
`makeExpander` ([`src/engine/tools/solve/expansion.ts`](../../src/engine/tools/solve/expansion.ts)) joue sur un vrai
`Engine` chaque action qui vaut la peine, enregistre chaque transition (`TryRecord`,
[`src/engine/tools/solve/model.ts`](../../src/engine/tools/solve/model.ts)) et ce qu'elle a lu et écrit ; la recherche
les fusionne et rend son verdict. Ce dont un état est fait pour la recherche est dans
[`src/engine/tools/solve/abstractions.ts`](../../src/engine/tools/solve/abstractions.ts).

```sh
# dans le dépôt du moteur
npx vitest run tests/solver-contract.test.ts
npm run quality:baseline -- --check
```

`tests/memo.test.ts` est un test lourd (des minutes) : il tourne dans la nightly et le candidat, ou seul avec
`npx vitest run tests/memo.test.ts`. Le comportement de chaque jeu est figé par `tests/quality-baseline.json`, que
`quality:baseline -- --check` compare ([La référence de qualité](contribute.quality-baseline.md)).

<a name="signal"></a>

## 7. Un signal du monde extérieur (4.1.1)

<!-- step: signal -->
[`tests/fixtures/signals.ts`](../../tests/fixtures/signals.ts) déclare trois signaux ;
[`src/engine/reality/protocol.ts`](../../src/engine/reality/protocol.ts) vérifie un signal signé avant de le lire ;
[`src/engine/reality/client.ts`](../../src/engine/reality/client.ts) le vérifie, le donne à `Engine.receive`
([`src/engine/core/reality-runtime.ts`](../../src/engine/core/reality-runtime.ts) : appliqué au plus une fois, une entrée
de session), attend la sauvegarde durable, puis accuse réception. Le solveur propose des signaux selon une politique
([`src/engine/tools/solve/scenarios.ts`](../../src/engine/tools/solve/scenarios.ts)). Le Bridge de référence est
`bridge/src/`.

```sh
# dans le dépôt du moteur
npx vitest run tests/reality-engine.test.ts tests/reality-proof.test.ts tests/bridge.test.ts
```

`tests/reality-engine.test.ts` fait tomber le moteur à chaque frontière. Dans le navigateur, `scripts/e2e-reality.mjs`
joue le même chemin (`npm run e2e:reality`).

<a name="find-the-test"></a>

## 8. Trouver le test d'une chose

<!-- step: find-the-test -->
- **Une commande** : cherchez sa clé dans `tests/cmds.test.ts` et `tests/core.test.ts`.
- **Une règle de couche** : `tests/boundaries.test.ts`.
- **Les noms publics** : `tests/api-surface.json`.
- **Un comportement du navigateur** : les scripts `scripts/e2e*.mjs` (`npm run e2e`, `e2e:taps`, `e2e:pwa`,
  `e2e:a11y`…), que la CI lance sous Chromium et WebKit (et Firefox pour la PWA).

Quelle suite tourne où, et quand : [Quels tests tournent quand](contribute.which-tests.md#find-the-test-of-a-thing).

> [!LIMIT id=tour-scope]
> La visite reste dans le moteur. Le Studio, le Studio Server et les connecteurs ont leurs propres points d'entrée
> (`src/studio/`, `studio-server/src/`, `connectors/src/`), non parcourus ici.

<a name="what-you-learned"></a>

## Ce que vous avez appris

- Un jeu est une donnée, compilée et figée avec des ids stables : [Architecture](contribute.architecture.md#a-game-is-data).
- Un seul moteur tourne dans le joueur, les tests et le solveur, derrière le port `Presenter`.
- Chaque partie a son test, et la référence fige l'ensemble : [La référence de qualité](contribute.quality-baseline.md).

<a name="next"></a>

## Pour aller plus loin

- [La boucle de développement](contribute.dev-loop.md#changing-a-command) : changer une commande de bout en bout.
- [Frontières d'import](contribute.boundaries.md) : ce que chaque dossier peut importer.
