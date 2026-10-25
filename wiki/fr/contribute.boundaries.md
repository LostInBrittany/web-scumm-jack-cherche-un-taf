# Frontières d'import

Ce que chaque dossier de `src/engine/` peut importer, où vit chaque responsabilité du moteur, du joueur et du solveur,
et ce qui est public. La source est [`src/engine/BOUNDARIES.md`](../../src/engine/BOUNDARIES.md) (en anglais) ;
[`tests/boundaries.test.ts`](../../tests/boundaries.test.ts) vérifie les règles à chaque exécution de la suite unitaire.

<a name="layers"></a>
<!-- applies: .. since 3.9.0 -->

## Les couches et ce qu'elles peuvent importer

### Valeurs

| Couche | Dossier | Peut importer | Jamais |
|---|---|---|---|
| Cœur | `core/` | lui-même, des paquets simples (`zod/mini`) | le DOM, les outils, dev, les mini-jeux, le Studio |
| Joueur | `dom/`, `minigames/`, `ending/`, `boot.ts` | le cœur, les uns les autres ; `tools/i18n` (les langues au démarrage) ; `tools/replay` et `dev/` seulement par `import()` | le solveur, le validateur, le linter, tout autre outil, le Studio, tweakpane |
| Scène | `scene/` (4.1.11) | le cœur (les specs du peintre en types seulement) | le DOM, les outils, dev, le Studio, un peintre |
| Reality | `reality/` (4.1.1) | le cœur, des paquets simples (`zod/mini`) ; WebCrypto | le DOM, les outils, dev, le Studio, le Bridge (`bridge/`) |
| Outils | `tools/` | le cœur | le DOM (ils tournent sous Node, dans des workers et dans les tests) |
| Dev | `dev/` | tout | être importé statiquement par le joueur |

Hors de `src/engine/`, le test tient aussi deux règles de la 4.1.1 : **le moteur n'importe jamais le Bridge** (Biscuit,
les clés et le serveur restent hors de tout jeu), et **le Bridge n'atteint ni le Studio, ni les outils, ni un jeu** :
seulement le protocole qu'il partage avec le joueur.

> [!GUARANTEE id=core-imports-no-dom]
> Le cœur n'importe aucune autre couche du moteur : ni la couche DOM (`dom/`), ni les outils, ni le code de dev, ni les
> mini-jeux, ni `ending/`, ni le Studio. Un import statique qui enfreint cette règle fait échouer la suite unitaire. La
> vérification lit les instructions d'import des fichiers ; elle ne voit pas un module atteint par une variable globale
> ou un `eval`.

La vérification ne trie pas les paquets : garder simples ceux du cœur reste l'affaire de la relecture.

### Contraintes

- **La première visite du joueur** est tenue à `assetBudgets.initialJsKB` (`npm run verify:dist`) : les mini-jeux se
  chargent quand l'un d'eux démarre (`minigames/meta.ts` garde ce que les outils en lisent), le panneau de dev et le
  Studio à la demande.
- **Un peintre** (`dom/render-*.ts`, `dom/renderer.ts`, `dom/frame-renderer.ts`) n'importe jamais le moteur, ses ports
  ni ses modules d'exécution, pas même comme type (4.1.11, D21) : on lui donne des trames et des specs, il répond par
  des intentions.
- **Aucun cycle d'imports statiques** dans `src/engine` (4.1.0) : un module ne s'importe jamais lui-même en retour. Les
  types (`import type`) sont effacés et ne comptent pas.

### Comportement sur un dossier inconnu

Un nouveau dossier sous `src/engine/` n'appartient à aucune couche du test tant qu'on n'en a pas écrit une pour lui :
ajoutez-le à `BOUNDARIES.md` et à `tests/boundaries.test.ts` ensemble.

<a name="inside-the-core"></a>
<!-- applies: .. since 4.1.0 -->

## Dans le cœur (4.1.0 « Clarity »)

`Engine` (`core/engine.ts`) est la façade : son état, son cycle de vie (nouvelle partie, chargement, point de reprise)
et une méthode de renvoi par opération, dans le même ordre d'effets qu'avant le découpage. Ce que fait chaque opération
vit dans un module à part, une fonction qui prend le moteur en premier argument :

| Module | Ce qu'il fait |
|---|---|
| `core/session-runtime.ts` | la session : entrées ouvertes et fermées, réponses enregistrées, empreintes, ce que lit le rejeu |
| `core/event-runtime.ts` | `emit` : les scripts qui attendent l'événement, puis les écouteurs du lieu, puis ceux du jeu |
| `core/script-runtime.ts` | les scripts : leur état, un pas, les boucles, l'ordonnanceur |
| `core/interactions.ts` | la règle, le genre ou la réplique de repli qui répond à une action ; répliques, indices, la boucle de conversation |
| `core/command-runtime.ts` | `exec` et `step` : l'exécution des `Cmd`, chacune par son gestionnaire de `core/command-handlers.ts` (4.1.5) ; où pointe une commande dans le lieu |
| `core/world-queries.ts` | noms, genres, visibilité, états des accessoires, cibles, points d'approche |
| `core/players.ts` | plusieurs personnages jouables : qui est où, changer, échanger, transférer |
| `core/movement.ts` | marcher, entrer dans un lieu, la carte et ses trajets, une téléportation (4.1.1) |
| `core/reality-runtime.ts` | un signal de l'extérieur : appliqué au plus une fois, le curseur, l'entrée de session (4.1.1) |
| `core/engine-shared.ts` | le contexte d'une commande, l'entrée du journal, de petits utilitaires |
| `core/journal.ts` | le journal sémantique (4.1.11) : ce qui s'est passé, en ids, numéroté ; émis par le cœur seul |
| `core/busy.ts` | le propriétaire de l'occupation (4.1.11) : les exécutions en cours, l'étape du tutoriel attendue, un passage |
| `core/run-clock.ts` | l'horloge du run (4.1.14, ADR 0016) : pas logiques et temps, donnés par la session et les commandes ; elle n'écrit jamais l'état |
| `core/prng.ts` | le générateur à graine (4.1.14) : xoshiro128**, un flux par usage ; `engine.random` tire dans `logic` |
| `core/run-tape.ts` | les maillons d'un run (4.1.14) : chaque entrée avec ses événements et l'horloge qui suit, les mêmes en direct et rejoués |
| `core/journal-chunks.ts` | les morceaux du run chaînés par SHA-256 (4.1.14), écrits dans un `ChunkStore`, relus vérifiés |
| `core/types/*.ts` | le format de contenu par sujet ; `core/types.ts` réexporte chaque nom |

Les modules importent `Engine` comme type seulement ; `tests/core-runtime.test.ts` appelle chacun directement.

<a name="inside-the-player"></a>
<!-- applies: .. since 4.1.0 -->

## Dans le joueur (4.1.0 « Clarity »)

`App` (`dom/app.ts`) est l'orchestration (4.1.11) : son état, le constructeur, et la composition du moteur, d'un
`Presenter` (`dom/presenter.ts`) et du renderer de la vue du lieu. Le reste vit dans des modules appelés par des
méthodes de renvoi, comme dans le cœur :

| Module | Ce qu'il fait |
|---|---|
| `dom/presenter.ts` | le `Presenter` auquel parle le moteur (4.1.11) : les appels de la scène, les répliques, les surcouches, les mini-jeux, la fin ; `intent()`, la seule porte des entrées du joueur |
| `dom/room.ts` | le modèle de scène : entités, marche, caméra ; il fabrique la `SceneFrame` (`scene/frame.ts`) et la peint |
| `dom/room-stage.ts` | la scène d'un lieu pour le peintre : conditions évaluées, images placées sur le décor (4.1.11) |
| `dom/frame-renderer.ts` | un peintre (DOM ou Canvas) en `Renderer` : des trames entières, une trame inchangée sautée, une trame changée par ses différences |
| `dom/shell.ts` | les éléments de l'interface, leur disposition à l'écran, les cibles accessibles (depuis les cibles de la trame) |
| `dom/side-fit.ts` | l'ajustement de la colonne du téléphone (pur) : hauteurs des verbes et des cases qui gardent la rangée d'outils sur un écran court |
| `dom/input.ts` | les verbes, la barre d'inventaire, les taps et doubles taps (`verbFor`, `nearMiss`), le clavier, la ligne d'action |
| `dom/speech.ts` | les répliques avec leur voix, la transcription, les appels téléphoniques, le choix des réponses |
| `dom/map-view.ts` | la carte et l'animation des trajets |
| `dom/menus.ts` | titre, pause (et l'export de session, par `import()`), emplacements de sauvegarde, recommencer, crédits |
| `dom/settings.ts` | les préférences du joueur, leurs valeurs par défaut et leur menu |
| `dom/update.ts` | les préchargements hors ligne et leur état, la mise à jour proposée après une sauvegarde vérifiée |
| `dom/storage.ts` | la sauvegarde automatique et les emplacements en localStorage (quand IndexedDB manque) |
| `dom/app-shared.ts` | de petits utilitaires (fabrique d'éléments, délais des taps, compteur d'images par seconde) |
| `dom/reality-ui.ts` | le lien au monde (4.1.1) : appairage, état, le client ; chargé par `import()` seulement pour un jeu avec `reality` |
| `dom/run-store.ts` | le stockage IndexedDB des runs (4.1.14, `web-scumm-runs`) : morceaux et têtes dans une transaction, records locaux |
| `dom/speedrun-ui.ts` | le mode speedrun (4.1.14) : l'enregistreur sur le moteur de l'app, son chrono, les records, le fantôme, l'export ; chargé par `import()` (il atteint `tools/speedrun/` de la même façon) |

<a name="inside-the-solver"></a>
<!-- applies: .. since 4.1.0 -->

## Dans le solveur (4.1.0 « Clarity »)

`tools/solve.ts` réexporte ce qu'il exportait avant ; le solveur vit dans `tools/solve/` :

| Module | Ce qu'il fait |
|---|---|
| `src/engine/tools/solve/search.ts` | `solve()` : la frontière, les workers de preuve, l'arrêt et le verdict |
| `src/engine/tools/solve/expansion.ts` | `makeExpander` : chaque action qui vaut la peine depuis un état, jouée sur le vrai moteur ; la mémoire des no-ops |
| `src/engine/tools/solve/abstractions.ts` | ce dont un état est fait (dimensions), les formes canoniques (joueurs, mobilité, possession), la dominance |
| `src/engine/tools/solve/model.ts` | les options, `SearchNode`, `Expansion` et une transition (`TryRecord`), avec leurs invariants |
| `src/engine/tools/solve/scenarios.ts` | les signaux de l'extérieur dans une recherche : fermé, un scénario, adverse (4.1.1) |
| `src/engine/tools/solve/report.ts` | le résultat, son profil, le profil en texte |
| `src/engine/tools/solve/drive.ts` | une promesse du moteur attendue, les étapes du tutoriel guidé jouées pendant ce temps |
| `src/engine/tools/solve/explosion.ts` | le profil d'explosion (4.1.13) : les états attribués aux positions, inventaires, drapeaux, dialogues, scripts |
| `src/engine/tools/solve/search/compact.ts` | le stockage des états vus (4.1.13, ADR 0015) : par index, clés internées, parents, chemins et entrées de session |
| `src/engine/tools/solve/search/checkpoint.ts` | une recherche écrite puis reprise (4.1.13) : instantané, en-tête, empreinte |
| `src/engine/tools/solve/search/classify.ts` | le verdict d'une preuve sur les états stockés : atteignabilité inverse, blocages et leurs causes |
| `src/engine/tools/solve/search/dominance.ts` | la dominance, les objets symétriques, les sous-énigmes indépendantes (4.1.13) |
| `src/engine/tools/solve/search/partition.ts` | la table partagée des états vus des workers, le partage d'un lot et le vol de travail (4.1.13) |

Le chemin d'une preuve se lit `solve()` → `solveOnce()` (recherche) → `makeExpander()` (expansion) → le `act()` du
moteur → un `TryRecord` fusionné dans le stockage et la frontière → le verdict.

<a name="file-size"></a>

## Taille des fichiers

Aucun fichier de `src/` ne dépasse 800 lignes, sauf les exceptions que `tests/file-size.test.ts` liste avec leur
raison, chacune plafonnée à sa taille : une exception ne grossit jamais, et quitte la liste une fois sous la limite.

<a name="public-and-internal"></a>

## Public et interne

Public, et tenu au versionnage sémantique : les cinq entrées de `src/engine/api/`, publiées comme
`@quest-n-click/engine/content` (les types et `defineGame`), `@quest-n-click/engine/player` (le démarrage), `@quest-n-click/engine/minigames`,
`@quest-n-click/engine/testing` (`Engine`, les doublures, l'enveloppe de sauvegarde, `solve`) et `@quest-n-click/engine/reality`
(depuis la 4.1.1) ; le format du contenu, l'enveloppe de sauvegarde et les outils MCP. Ils sont tenus par
`tests/api-surface.json` et la politique de support ([Stabilité et support](start.stability.md),
[API publique](engine.api.md)).

Interne : les modules derrière les façades `Engine` et `App` (leurs membres marqués `@internal`), les modules du
solveur, le code des outils. Ils peuvent bouger d'une version mineure à l'autre.

<a name="related"></a>

## Identifiants liés

- `npm run verify:dist` (le budget de la première visite), `tests/boundaries.test.ts`, `tests/file-size.test.ts`,
  `tests/api-surface.json`.
- [Architecture](contribute.architecture.md), [Visite du code](contribute.code-tour.md).
