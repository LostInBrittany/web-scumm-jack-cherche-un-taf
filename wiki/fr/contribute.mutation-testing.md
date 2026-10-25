# Tests de mutation

Des lignes exécutées par un test ne sont pas une preuve : les tests de mutation demandent si les tests distinguent un
bon résultat d'un mauvais. Cette page dit comment quest'n'click s'y prend, et que faire quand un mutant survit à votre
changement.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un ensemble de mutation qui repasse après votre changement : chaque mutant de ses fichiers est tué par un test, ou nommé
dans `docs/dev/mutants.json` avec une catégorie, une raison, une preuve, un responsable et une version de relecture.

<a name="why"></a>

## Pourquoi des tests de mutation, et pourquoi cet outil

Chaque mutant change une seule chose dans un fichier source : un opérateur de comparaison ou logique échangé (`<` pour
`<=`, `&&` pour `||`), une négation retirée, une condition forcée à `true` ou `false`, un booléen inversé. Les tests qui
jugent l'ensemble de ce fichier tournent contre lui, et l'un d'eux doit échouer. Un mutant qui survit est un **test qui
manque**, ou un **mutant équivalent** qu'aucune entrée ne distingue de l'original.

L'outil est [`tools/mutate.ts`](../../tools/mutate.ts), écrit pour le projet en 4.1.0 « Clarity » : Stryker 10
n'activait pas ses mutants sous Vitest ici (739 sur 749 survivaient, un bloc vidé compris), alors chaque mutant tourne
en source ordinaire. Le fichier est restauré après chaque mutant, et à la sortie (Ctrl-C compris).

**Un survivant non nommé fait échouer l'exécution, quel que soit le score.** Il n'y a pas de seuil : un ensemble passe
quand chaque survivant est expliqué, et une explication est une exemption avec ses conditions (plus bas), jamais « le
score est assez bon ».

<a name="context-and-versions"></a>

## Contexte et versions

Le dépôt du moteur. L'outil depuis la 4.1.0, les ensembles et la barrière par identité depuis la 4.1.2, le découpage en
morceaux et les conditions d'exemption depuis la 4.1.20 ; treize ensembles barrières en 4.4.0.

| Ensemble | Mute | Barrière depuis |
|---|---|---|
| `core` | `src/engine/core/{cond,save,session-runtime,migrate}.ts` | 4.1.2 |
| `reality` | la réception du moteur, le protocole, le client, le port HTTP ; le Bridge, son stockage de journal, son verrou et sa politique | 4.1.2 |
| `runs` | la file des speedruns : `bridge/src/{runs,runs-store,runs-limiter}.ts` | 4.1.17 |
| `remix` | la graine d'un monde, sa compilation, son application, ses catégories ; les jetons Daily et Mystery | 4.1.17 |
| `speedrun` | l'enveloppe d'un run, l'enregistreur, le vérificateur | 4.1.17 |
| `connectors-pure` (`connectors` jusqu'à la 4.2) | les parties pures des connecteurs : SDK, lecteur MIME, éditeur de ligne, disque virtuel, cryptographie et récupération des badges | 4.1.18 |
| `reality-store` | les stockages du Bridge en mémoire, SQL et SQLite, migrations, flux, signature (pas l'adaptateur Postgres) | 4.1.18 |
| `connectors-edge` | configuration et démarrage, le connecteur e-mail, la vérification des badges, garde et shell du terminal, SSH, Telnet (4 morceaux) | 4.1.20 |
| `reality-store-postgres` | `bridge/src/store-postgres.ts`, jugé sur un vrai Postgres (`BRIDGE_PG_URL`) | 4.1.20 |
| `studio-ops` | le journal du Studio Server, ses écritures durables et les pans des fichiers d'un jeu | 4.2.1 |
| `studio-auth` | la barrière du Studio Server, le fournisseur OpenID, les routes et le stockage d'authentification, les baux des pans, l'origine du jeu | 4.2.1 |
| `studio-workshop` | l'annulation personnelle, la santé par révision, les aperçus, les builds, les assets préparés, la sauvegarde, le journal expédié et la collecte | 4.2.3 |
| `voices` | les voix par valeur : les clés des clips d'une réplique, la table d'enregistrement et son CSV, la vérification du validateur ; les phrases du solveur | 4.3.1 |

Les ensembles et les fichiers de test qui jugent chacun sont dans [`tools/mutation-sets.ts`](../../tools/mutation-sets.ts)
(`SETS`, `TESTS`, `GATED`) ; `MEASURED` (les ensembles qui rapportent sans barrière) est vide depuis la 4.2.1. Où
chacun tourne, c'est [Quels tests tournent quand](contribute.which-tests.md#suites) : une pull request étiquetée
`full-ci`, chaque nuit (de zéro), le candidat et la release.

<a name="prerequisites"></a>

## Prérequis

- Un dépôt préparé ([Préparer son poste de développement](contribute.setup.md)), et les tests de l'ensemble verts avant
  toute mutation : l'outil refuse de démarrer sinon (`✖ the tests fail before any mutation: fix them first`).
- Pour `reality-store-postgres` : un Postgres que les tests peuvent utiliser, donné par `BRIDGE_PG_URL` (l'outil sort
  avec le code 2 sans lui, puisque chaque mutant survivrait à un test qui saute ses cas Postgres).
- Du temps : un ensemble prend de quelques minutes à quelques heures ; `connectors-edge` a pris 2 h 02 en un seul job
  sur un runner avant d'être coupé en quatre morceaux. En local, préférez `--file`, ou le workflow `mutation`.

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le dépôt du moteur, sur votre machine ; ou sur un runner avec le workflow `mutation`, qui mesure un ensemble sur
une référence et garde le rapport :

```sh
# depuis n'importe quel clone avec la CLI GitHub
gh workflow run mutation --ref main -f set=remix -f ref=<branche ou SHA> [-f file=<chemin>]
```

L'outil réécrit le fichier source qu'il mute : ne le modifiez pas pendant une exécution.

<a name="steps"></a>

## Étapes

<!-- step: run-file -->
1. **Mutez le fichier que vous avez changé**, jugé par les tests de son ensemble :

   ```sh
   # dans le dépôt du moteur
   npm run test:mutation:core -- --file=src/engine/core/cond.ts
   ```

   Il affiche chaque mutant survivant sous la forme `survived <fichier>:<ligne> <opérateur>: <avant> → <après>`, puis
   le score de chaque fichier, puis `✖ not in docs/dev/mutants.json: …` pour chaque survivant que personne n'a nommé.

<!-- step: run-set -->
2. **Ou lancez l'ensemble entier**, comme la CI :

   ```sh
   # dans le dépôt du moteur
   npm run test:mutation:core -- --set=core          # l'ensemble par défaut
   npm run test:mutation:reality                     # équivaut à --set=reality
   npm run test:mutation:core -- --set=all           # chaque ensemble barrière, l'un après l'autre
   ```

   Un rapport dont les entrées n'ont pas changé (`inputHash` : les sources et les tests de l'ensemble, tout ce qu'ils
   importent, les deux configurations, l'outil, les survivants nommés, le fichier de verrouillage sans ses champs de
   version) est **réutilisé** : l'exécution le dit et s'arrête. `--fresh` relance quand même. Les rapports sont écrits
   dans `.cache/mutation/report-<ensemble>.json`.

<!-- step: kill -->
3. **Tuez le survivant avec un test**, la réponse habituelle : écrivez l'entrée qui distingue le mutant de l'original,
   dans un fichier de test que `TESTS` liste déjà pour l'ensemble (ou ajoutez-y le fichier). Relancez l'étape 1 : le
   mutant est tué.

<!-- step: name -->
4. **Ou nommez-le**, quand aucune entrée ne peut le distinguer. Ajoutez une entrée à `docs/dev/mutants.json` (en
   anglais, comme toute la documentation de développement) :

   ```json
   {
     "file": "src/engine/core/session-runtime.ts",
     "operator": "condition true",
     "from": "this.open.length",
     "to": "true",
     "context": "return this.open.length ? this.open[this.open.length - 1] : undefined;",
     "why": "`cur`: with no open entry, `this.open[-1]` is undefined, which is what the condition returned",
     "category": "equivalent",
     "proof": "argument",
     "owner": "@wanoo",
     "revisit": "4.6.0"
   }
   ```

   - `category` : `equivalent`, `unreachable`, `instrumentation` ou `out-of-contract`.
   - `why` : plus de 20 caractères qui le disent.
   - `proof` : `argument` (la raison est la preuve ; un mutant équivalent seulement), ou un fichier de test sous
     `tests/` qui existe et fixe ce qui le rend tel.
   - `owner`, et `revisit` : la version à partir de laquelle l'entrée est refusée tant qu'elle n'a pas été relue.
   - `context` : la ligne source sans ses espaces, pour que l'entrée ne nomme que le mutant de cette ligne.

   Puis régénérez la table de `docs/dev/MUTANTS.md` et relancez l'ensemble :

   ```sh
   # dans le dépôt du moteur
   npm run test:mutation:core -- --doc
   npm run test:mutation:core -- --set=<ensemble> --fresh
   ```

   `docs/dev/mutants.json` est un fichier que relit le mainteneur (`CODEOWNERS`) : dites dans la pull request pourquoi
   chaque entrée est équivalente.

> [!LIMIT id=revisit-due]
> Une entrée dont la version `revisit` est atteinte arrête **chaque** ensemble, quel que soit son fichier :
> « docs/dev/mutants.json: n entries do not hold … to be read again at x.y.z ». En 4.4.0, les 132 entrées disent toutes
> `revisit: 4.5.0` : dès que `package.json` dit 4.5.0 (ses pré-versions comprises), chaque exécution de mutation refuse
> tant que chaque entrée n'a pas été relue et son `revisit` déplacé.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`✔ n/m mutants killed, k survivors explained, 0 not; report in .cache/mutation/…`, et le code de sortie 0. Dans la CI,
les jobs `mutation (<ensemble>)` de l'ensemble et `mutation-merge` sont verts.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `✖ not in docs/dev/mutants.json: <fichier>:<ligne> …` | Un survivant que personne n'a nommé | Tuez-le avec un test (étape 3), ou nommez-le (étape 4) |
| `⚠ named in docs/dev/mutants.json but killed or gone` | Une entrée dont le mutant ne survit plus | Retirez l'entrée |
| `✖ docs/dev/mutants.json: n entries do not hold` | Une entrée sans ses conditions, ou dont le `revisit` est passé | Complétez-la, ou relisez-la et déplacez `revisit` |
| `✖ --set=… mutates reality-store-postgres, which needs BRIDGE_PG_URL` | Aucun Postgres donné | Définissez `BRIDGE_PG_URL`, ou lancez un autre ensemble |
| `ℹ --set=connectors is --set=connectors-pure since 4.1.19` | L'ancien nom | Utilisez le nouveau (l'alias marche jusqu'à la 4.2) |
| `✖ <ensemble>: … nothing merged, the set is not judged` (CI) | Un morceau manquant, en double, annulé ou d'autres entrées | Relancez les jobs de morceaux en échec, puis `mutation-merge` |

<a name="files-changed"></a>

## Fichiers ou données modifiés

L'outil réécrit le fichier source muté pendant qu'il tourne et le restaure après chaque mutant et à la sortie ; il écrit
ses rapports sous `.cache/mutation/`. Vous modifiez des fichiers de test, `docs/dev/mutants.json` et, par `--doc`,
`docs/dev/MUTANTS.md`.

<a name="recovery"></a>

## Revenir en arrière

Si une exécution a été tuée sans son gestionnaire de sortie (un `kill -9`, un plantage), regardez `git status` : un
fichier source muté apparaît modifié ; `git restore <fichier>` le remet en place.

<a name="references"></a>

## Références

- [`docs/dev/MUTANTS.md`](../../docs/dev/MUTANTS.md), les survivants nommés expliqués ;
  [`docs/dev/mutants.json`](../../docs/dev/mutants.json), la liste que lit la barrière.
- [`tools/mutate.ts`](../../tools/mutate.ts), [`tools/mutation-sets.ts`](../../tools/mutation-sets.ts),
  [`tools/mutation-shards.ts`](../../tools/mutation-shards.ts), [`vitest.mutation.config.ts`](../../vitest.mutation.config.ts).
- [Le cliquet de couverture](contribute.coverage-ratchet.md), [La CI expliquée](contribute.ci.md).
