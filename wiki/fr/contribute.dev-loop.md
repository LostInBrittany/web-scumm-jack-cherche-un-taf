# La boucle de développement

Comment modifier le moteur par petits pas, et comment faire suivre un changement partout où il est lu. Le cas traité
est le plus difficile des cas courants : ajouter ou modifier une commande du DSL.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un changement qui compile, dont les tests passent, que le validateur, le solveur, le Studio et le MCP comprennent, et
que vous avez regardé dans le navigateur, avant de dérouler la liste complète
d'[Avant une pull request](contribute.before-a-pr.md).

<a name="context-and-versions"></a>

## Contexte et versions

Le dépôt du moteur, sur votre machine. La table des commandes (`HANDLERS`, `src/engine/core/command-handlers.ts`)
existe depuis la 4.1.5 ; le catalogue `src/engine/core/cmds.ts` depuis la 4.1.0. Cette page décrit le code de la 4.4.0.

<a name="prerequisites"></a>

## Prérequis

- Un dépôt préparé : [Préparer son poste de développement](contribute.setup.md).
- La carte du code : [Architecture](contribute.architecture.md) ; son parcours : [Visite du code](contribute.code-tour.md).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le dépôt du moteur, sur votre machine. `GAME=<id>` choisit un autre jeu que le jeu courant
([Préparer son poste](contribute.setup.md#steps)).

<a name="steps"></a>

## Étapes

<!-- step: run-one-file -->
1. **Lancez les tests les plus proches de ce que vous changez**, pas toute la suite, pendant que vous travaillez.

   ```sh
   # dans le dépôt du moteur
   npx vitest run tests/core.test.ts          # un fichier
   npx vitest run tests/core.test.ts -t "fixture game"   # un test par son nom
   npx vitest tests/cmds.test.ts              # mode surveillance : relance à chaque enregistrement
   ```

   [Quels tests tournent quand](contribute.which-tests.md#find-the-test-of-a-thing) dit quel fichier teste quoi.

<!-- step: type-check -->
2. **Vérifiez les types** au fil de l'eau : le catalogue et la table des commandes refusent, à la compilation, une
   commande oubliée.

   ```sh
   # dans le dépôt du moteur
   npm run -s tsc -- --noEmit
   npm run -s tsc -- --noEmit -p tsconfig.strictest.json   # chaque accès indexé vérifié dans src/
   ```

<!-- step: check-game -->
3. **Interrogez le jeu.** Après un changement qu'un jeu peut ressentir, les commandes de vérité répondent en quelques
   secondes :

   ```sh
   # dans le dépôt du moteur
   npm run validate && npm run solve && npm run lint
   ```

   `validate` nomme les ids et les valeurs cassés, `solve` prouve que le jeu se termine encore depuis Nouvelle partie,
   `lint` (le lint de contenu) trouve les conditions que rien ne pose, les règles cachées et les actions jamais jouées.

<!-- step: look -->
4. **Regardez.** `npm run dev` sert le jeu sur `http://localhost:5173/` ; `npm run studio` ouvre le Studio local, qui
   montre chaque lieu rendu par le vrai moteur et se recharge quand un fichier change. Un changement visuel se
   regarde, il ne se suppose pas : `?dev&at=<checkpoint>` démarre le jeu à un point de reprise
   ([Paramètres d'URL de développement](reference.dev-url-parameters.md)).

<a name="changing-a-command"></a>

### Changer une commande de bout en bout

<!-- step: command-end-to-end -->
5. **Changer une commande de bout en bout.** Une commande (`Cmd`) est lue par le moteur, le validateur, le solveur, le
   graphe d'énigmes, les textes, le Studio et le MCP. Touchez chacun dans cet ordre ; la vérification de types ou un
   test refuse ce que vous oubliez :

   1. **Type.** Sa variante de `Cmd` dans [`src/engine/core/types/content.ts`](../../src/engine/core/types/content.ts),
      avec un commentaire de documentation.
   2. **Catalogue.** Sa clé dans `CMD_KEYS` ([`src/engine/core/cmds.ts`](../../src/engine/core/cmds.ts)) : une
      variante qui n'y est pas, ou une clé qu'aucune variante n'a, ne compile pas. Ajoutez-la à `CHANGES` si elle
      change l'état (le solveur et la mémoire des no-ops lisent cet ensemble), à `CONTAINERS` et `subLists` si elle
      contient des listes de commandes.
   3. **Moteur.** Son gestionnaire dans `HANDLERS`
      ([`src/engine/core/command-handlers.ts`](../../src/engine/core/command-handlers.ts)), que `step`
      ([`src/engine/core/command-runtime.ts`](../../src/engine/core/command-runtime.ts)) cherche par clé ; le type de
      la table refuse un gestionnaire manquant. L'écran passe par une méthode du `Presenter`
      ([`src/engine/core/ports.ts`](../../src/engine/core/ports.ts)), implémentée par `DomPresenter`
      ([`src/engine/dom/presenter.ts`](../../src/engine/dom/presenter.ts)) et par `FakePresenter`. Si elle touche
      l'état, ce qu'elle lit et écrit est enregistré (`Engine.reads` et `Engine.writes`).
   4. **Validateur.** Ses références et ses valeurs vérifiées dans
      [`src/engine/tools/validate.ts`](../../src/engine/tools/validate.ts).
   5. **Solveur et graphe d'énigmes.** Rien à faire si le catalogue est juste ; une commande qui bifurque ou qui attend
      demande un regard sur [`src/engine/tools/puzzle.ts`](../../src/engine/tools/puzzle.ts) et
      [`src/engine/tools/solve/expansion.ts`](../../src/engine/tools/solve/expansion.ts).
   6. **Textes.** Une commande qui porte une réplique a besoin de sa branche dans le parcours des textes,
      [`src/engine/tools/i18n.ts`](../../src/engine/tools/i18n.ts) (extraction, langues), à côté de `say`, `toast`,
      `guide` et `choice`.
   7. **Studio.** Son formulaire dans [`src/studio/schema.ts`](../../src/studio/schema.ts) ; le MCP lit les mêmes
      schémas ([Outils MCP](studio.mcp-tools.md)).
   8. **Tests.** Un exemple dans la table de [`tests/cmds.test.ts`](../../tests/cmds.test.ts) (chaque clé doit en
      avoir un), un test de comportement dans [`tests/core.test.ts`](../../tests/core.test.ts), et un cas du
      validateur.
   9. **Docs.** Les pages du wiki de la commande, dans les deux langues ([Commandes du jeu](create.commands.md),
      [Référence du DSL](create.dsl.md)), et le fragment de la branche sous `changes/`
      ([Conventions](contribute.conventions.md#changes-fragments)).

   La relecture d'un tel changement lit ces fichiers dans cet ordre.

<!-- step: worked-example -->
6. **Exemple complet : `{ shake: ms }`**, l'écran qui tremble un instant.

   - Le type est `| { shake: number }` dans `core/types/content.ts`.
   - `'shake'` est dans `CMD_KEYS` mais pas dans `CHANGES` : il ne change rien de ce sur quoi le solveur indexe ses
     états, donc un tremblement est un no-op pour une preuve.
   - Son gestionnaire dans `command-handlers.ts` appelle `eng.ui.shake(c.shake)` sauf quand une cinématique est
     passée (`ctx.fast`). `DomPresenter.shake` ajoute la classe CSS `shake` à la scène pour ce nombre de
     millisecondes ; `FakePresenter` l'ignore.
   - Le validateur l'accepte dans les événements d'image d'une animation en boucle, avec `sfx`, et rien d'autre
     (`tools/validate.ts` : « a looping animation only plays sounds and shakes at a frame »).
   - Le Studio le propose sous « Shake (ms) », de 0 à 5000 par pas de 50 (`src/studio/schema.ts`).
   - `tests/cmds.test.ts` contient `shake: { shake: 2 }`.

> [!LIMIT id=no-function-in-games]
> Un jeu ne contient aucune fonction. La logique dont un jeu a besoin au-delà du DSL est une commande personnalisée ou
> un mini-jeu, du code de confiance déclaré à côté du contenu et appelé par son nom
> ([Code personnalisé](create.custom-code.md)) ; ce n'est pas une nouvelle commande du moteur.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- `npm run -s tsc -- --noEmit` ne dit rien ; les fichiers de test que vous avez touchés passent.
- `npm run validate && npm run solve` finissent au vert sur le jeu d'exemple (et sur `GAME=reference` si votre
  changement touche la mise en scène ou les personnages multiples).
- Ce que vous avez changé a l'air juste dans le navigateur ou le Studio.

Passez ensuite par [Avant une pull request](contribute.before-a-pr.md).

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `'a Cmd variant is missing from CMD_KEYS'` à la compilation | La variante a été ajoutée à `Cmd`, pas au catalogue | Ajoutez sa clé à `CMD_KEYS` dans `core/cmds.ts` |
| `'CMD_KEYS names a key no Cmd has'` | La clé n'a été ajoutée qu'au catalogue | Ajoutez la variante à `Cmd` |
| Une erreur de type sur `HANDLERS` | Pas de gestionnaire pour la nouvelle clé | Ajoutez-le à la table de `core/command-handlers.ts` |
| `tests/cmds.test.ts` échoue sur la nouvelle clé | Pas d'exemple dans sa table | Ajoutez-en un |
| `quality:baseline -- --check` signale une empreinte qui a bougé | Le changement modifie ce que fait le moteur sur un jeu figé | Voulu : réécrivez la référence et dites-le dans le fragment ; pas voulu : cherchez la régression ([La référence de qualité](contribute.quality-baseline.md)) |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Les fichiers sources ci-dessus ; `tests/` ; les pages du wiki de la commande ; `changes/<slug>.md`. Une commande que
le solveur lit peut faire bouger `tests/quality-baseline.json`, qui est alors réécrit volontairement.

<a name="recovery"></a>

## Revenir en arrière

Tout est dans Git : `git restore <fichier>` ou `git stash` annule un changement local. `GAME=demo npm run game` remet le lien
`.cache/game` en place quand un essai avec `GAME=` l'a laissé ailleurs.

<a name="references"></a>

## Références

- [Architecture](contribute.architecture.md), [Visite du code](contribute.code-tour.md),
  [Frontières d'import](contribute.boundaries.md).
- [Quels tests tournent quand](contribute.which-tests.md), [Avant une pull request](contribute.before-a-pr.md).
- [ADR 0002](../../docs/dev/adr/0002-declarative-content.md), le contenu déclaratif ;
  [ADR 0003](../../docs/dev/adr/0003-solver-runs-the-engine.md), le solveur fait tourner le moteur.
