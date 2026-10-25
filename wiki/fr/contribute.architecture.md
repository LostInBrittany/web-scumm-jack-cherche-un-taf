# Architecture

Comment quest'n'click est construit, pour qui lit son code pour la première fois. La [Visite du code](contribute.code-tour.md)
parcourt la même carte dans l'ordre, en une demi-heure avec le code ouvert ;
[`docs/dev/adr/`](../../docs/dev/adr/README.md) explique les décisions qui semblent surprenantes sans leur contexte
([Décisions et ADR](contribute.decisions.md)).

<a name="overview"></a>

## Vue d'ensemble

Le moteur est un seul chemin de code, qu'un téléphone joue, que le solveur explore, que le rejeu refait et que le
Studio modifie. Un jeu est une donnée que le moteur lit ; tout ce qui vient de l'extérieur est vérifié avant d'être cru ;
chaque effet à l'écran passe par un seul port, si bien que le même moteur tourne en silence sous Node. Les sections
ci-dessous disent où vit chacune de ces idées. La description vaut pour le code de la 4.4.0 ; l'architecture date de la
4.1.0 « Clarity » (le moteur découpé en modules derrière des façades) et de la 4.1.1 (les signaux de l'extérieur).

<a name="layers"></a>

## Les couches

```text
games/<id>/          le contenu : des données seulement (lieux, règles, répliques, layouts, assets)
   │ defineGame / compileGame
   ▼
src/engine/core/     le moteur : état, règles, commandes, scripts, sessions, sauvegardes — sans DOM, tourne partout
   ▲            ▲
   │            └──── src/engine/tools/   validateur, solveur, replay, lint, poids, provenance (Node, workers, tests)
src/engine/dom/      le joueur : App, le Presenter, la vue du lieu, l'audio, les entrées, les menus, le hors-ligne
src/studio/, tools/  le Studio (interface, son serveur et le MCP), la ligne de commande
```

Ce que chaque dossier peut importer est écrit dans [`src/engine/BOUNDARIES.md`](../../src/engine/BOUNDARIES.md) et
vérifié par `tests/boundaries.test.ts` : le cœur n'importe ni le DOM ni les outils ; le joueur n'importe jamais
statiquement le solveur, le validateur ni le Studio ; les outils n'importent jamais le DOM ; aucun cycle d'imports
statiques. Le tableau complet est dans [Frontières d'import](contribute.boundaries.md).

<a name="code-layout"></a>

## Découpage du code

```text
src/engine/
  api/          les entrées publiques : content, player, minigames, testing, reality
  core/         logique pure (aucun DOM) : état, conditions, réactions, commandes, scripts, conversations, indices, sauvegardes
    types.ts      le format de contenu, commenté (la référence) ; découpé par sujet dans core/types/
    engine.ts     la façade Engine : actions du joueur, résolution, cycle de vie
    ports.ts      l'interface Presenter (ce que le cœur demande à l'affichage) et FakePresenter pour Node
    cmds.ts       le catalogue des commandes ; command-handlers.ts exécute chacune
    cond.ts       évaluation des conditions
    define.ts     defineGame / defineRoom, compileGame, clés stables des blocs once/nth/cycle/random
  scene/        la trame de scène (pure) : SceneFrame, le test de toucher, les contrats Renderer et Intent (4.1.11)
  dom/          l'affichage navigateur
    app.ts        mise en page paysage, verbes, sac, menus, écran titre ; compose le moteur, le presenter, le renderer
    presenter.ts  le Presenter auquel parle le moteur (répliques, surcouches, carte, mini-jeux, fin scellée) et intent()
    fonts.ts      polices par défaut (Galmuri11, DotGothic16 derrière elle, Press Start 2P), remplacées par skin.fonts
    room.ts       la scène : décor, accessoires, personnages, tri en profondeur, marche, poses
    walk.ts       zone marchable (triangulation earcut et chemins navmesh), échelle selon la profondeur
    audio.ts      musique (fondu, pile, morceau ponctuel) et bruitages, avec Howler
    assets.ts     images et sons préparés par npm run assets
  minigames/    mini-jeux (plugins DOM) : pipes, stroke, pick, hide, runner, scratch, cables, code-wheel ; leurs images viennent des params
  ending/       la fin scellée (facultative) : seal.ts (AES-GCM), card.ts (la carte finale), index.ts (déchiffrement, ticket, confettis)
  reality/      les signaux de l'extérieur (4.1.1) : protocole, client, port HTTP
  tools/        validateur, solveur, replay, lint, i18n et les autres outils (Node)
  dev/          overlay de debug et éditeur de placement (développement seulement)
  boot.ts       bootGame : branche un module de jeu, le moteur et le joueur
```

**Le moteur ne nomme aucun jeu.** `src/engine/` n'importe jamais `games/` et ne nomme aucune image, aucun son, aucun
texte d'interface :

- les textes viennent de `GameDef.ui` ;
- les icônes, sons, polices et hauteurs par défaut viennent de `GameDef.skin` ([Habillage et polices](create.skin-fonts.md)) ;
- les images des mini-jeux viennent de leurs `params` ;
- la fin scellée vient de `GameDef.ending`.

Un jeu est un dossier `games/<id>/` dont `index.ts` exporte `game`, `layouts` et `manifest`, et au besoin `minigames`,
`extraImages`, `commands` (les commandes personnalisées) et `locales` (le `GameModule` de `tools/game.ts`).
`src/main.ts` importe `@game`, un alias vers `games/<GAME>/index.ts`, et ne sait rien d'autre du jeu. Le jeu courant
est `GAME=<id>`, sinon le lien `.cache/game`, sinon `"config": { "game" }` de `package.json`, sinon `demo`
([Préparer son poste](contribute.setup.md#steps)).

**Constantes de géométrie.** La scène logique mesure 640 × 400 ; le sol descend au plus à `Layout.floor` (395 par
défaut, `FLOOR` dans `core/define.ts`) ; un point d'approche enregistré à plus de 150 unités de sa cible (`NEAR`) est
jugé périmé et recalculé.

**Verbes.** Leurs ids sont libres (les `verbs` du jeu). Quatre ont un sens pour le moteur : `look` (textes Regarder),
`talk` (conversations, indices), `give` et `use` (deux termes : un objet du sac puis une cible ; toucher un objet du sac
sans verbe choisi prend `use`).

<a name="a-game-is-data"></a>

## Un jeu est une donnée

Un jeu est un `GameDef` ([`src/engine/core/types.ts`](../../src/engine/core/types.ts), découpé par sujet dans
`src/engine/core/types/`) : lieux, verbes, objets, personnages, règles (`{ verb, a, b, if, do }`), scripts, écouteurs,
dialogues, une carte, une fin. Il ne contient aucune fonction : on peut donc le valider (`src/engine/tools/validate.ts`),
le sauvegarder, le comparer et le résoudre. Le code dont un jeu a besoin (une commande personnalisée, un mini-jeu) est
du code de confiance déclaré à côté du contenu et appelé par son nom (`core/custom.ts`, `src/engine/minigames/`).
`compileGame` (`src/engine/core/define.ts`) fige le contenu et donne un id stable à chaque règle, choix, sujet, écouteur
et étape de script : sauvegardes, sessions et solveur parlent avec ces ids. Comment le moteur fait tourner cette donnée,
c'est [Comment fonctionne le moteur](engine.how-it-works.md).

<a name="life-of-an-action"></a>

## La vie d'une action

1. **Entrée.** Un tap sur la scène ou l'inventaire (`src/engine/dom/input.ts`) devient une `Action` `{ verb, a, b }` ;
   un double tap choisit le verbe que le joueur veut dire (`src/engine/core/default-verb.ts`).
2. **Moteur.** `Engine.act` (`src/engine/core/engine.ts`) y conduit le héros, ouvre une entrée de session
   (`core/session-runtime.ts`) et demande la réponse à `resolve` (`core/interactions.ts`) : une règle écrite, sinon un
   genre, sinon un refus ou une réplique de repli.
3. **Commandes.** La liste `do` de la règle passe par `exec` (`core/command-runtime.ts`), une `Cmd` à la fois, chacune
   par son gestionnaire (`core/command-handlers.ts`) : poser un drapeau, donner un objet, dire une réplique, marcher,
   jouer un son, émettre un événement (`core/event-runtime.ts`), lancer un script (`core/script-runtime.ts`). Tout effet
   à l'écran est un appel au `Presenter` (`src/engine/core/ports.ts`).
4. **État.** Les commandes ne changent que `engine.state`, un `GameState` (`core/types/state.ts`) en JSON simple : lieu,
   inventaire, drapeaux, accessoires, compteurs, ce qui a été vu.
5. **Sauvegarde automatique.** Quand le moteur est de nouveau libre, `Engine.save` confie l'état au `SaveStore` : dans
   le navigateur `IndexedDbSaveStore` (`src/engine/dom/save-store.ts`), qui écrit une enveloppe versionnée
   (`core/save.ts`) et la relit avant de dire qu'elle est sauvegardée.
6. **Rendu.** `App` (`src/engine/dom/app.ts`) compose le moteur, le `Presenter` (`dom/presenter.ts`, depuis la 4.1.11)
   et le renderer de la vue du lieu : la vue du lieu (`dom/room.ts`, peinte par le DOM ou, à la demande, par Canvas), la
   parole (`dom/speech.ts`), l'inventaire, la musique (`dom/director.ts`, `dom/audio.ts`).

L'ordre dans lequel les réactions sont évaluées, et ce que chaque commande fait au temps et au hasard, c'est le
[Modèle d'exécution](engine.execution-model.md).

<a name="trust"></a>

## Contenu de confiance, entrées non fiables

Le contenu et le code du moteur sont de confiance ; tout ce qui vient de l'extérieur ne l'est pas, et commence en
`unknown` : une sauvegarde (`parseSave`, un schéma zod), un fichier de session (`parseSessionFile`), un storyboard
(`storyboardProblems`), un import de layout, la réponse d'un fournisseur d'assistant, une requête au Studio
(`tools/studio/security.ts`). La même entrée invalide donne le même diagnostic dans la ligne de commande, le Studio et
le MCP (`tests/diagnostics-parity.test.ts`).

> [!LIMIT id=no-sandbox]
> De confiance veut dire sans bac à sable : les modules TypeScript d'un jeu et ses commandes personnalisées tournent avec
> les droits du moteur. quest'n'click ne met pas en bac à sable un dossier `games/<id>/` dont on ne sait rien
> ([Politique de sécurité](contribute.security-policy.md)).

<a name="storage"></a>

## Stockage, sessions et replay

Une sauvegarde est une enveloppe `{ format, schema: 4, gameId, gameSaveVersion, variant, state }` (4.1.15 : `variant`
est le monde où la partie s'est jouée ; une enveloppe de schéma 3 se lit comme le monde de l'histoire). Une ancienne
sauvegarde est migrée par les `migrations` du jeu (`core/migrate.ts`), et une sauvegarde par version depuis la 3.0 est
chargée par `tests/save-v3.test.ts`. Chaque entrée est aussi une entrée de la **session** du moteur, avec les réponses
données pendant qu'elle tournait (choix, tirages aléatoires) et l'empreinte de l'état après elle : `replay`
(`src/engine/tools/replay.ts`) rejoue une session et nomme la première entrée dont l'état diffère. Un rapport de bug est
un fichier de session. Les formats sont dans [Formats de fichiers](engine.file-formats.md).

<a name="solver"></a>

## Le solveur fait tourner le vrai moteur

`solve` (`src/engine/tools/solve/`) explore le jeu depuis « Nouvelle partie » avec le même `Engine` et un presenter
muet (`FakePresenter`) : tout ce qu'il trouve, un joueur peut le faire. Une recherche de témoin trouve un chemin jusqu'à
la fin ; une preuve explore tous les états atteignables et nomme les blocages. La recherche ne distingue un état que par
ce qui peut encore compter (`solve/abstractions.ts`) ; chaque abstraction est auditée contre la recherche explicite
(`--audit-abstractions`, et le corpus de `npm run audit:corpus`). Le chemin de `solve()` jusqu'au verdict est dans
`src/engine/BOUNDARIES.md`, « Inside the solver » ([Frontières d'import](contribute.boundaries.md#inside-the-solver)).
Ce qu'un résultat permet de conclure à un auteur, c'est [Ce que prouve le solveur](create.solver-proofs.md).

<a name="signals"></a>

## Les signaux de l'extérieur (4.1.1)

Un jeu peut déclarer des signaux (`reality` ; [Reality Bridge](bridge.what-it-is.md)). Un Reality Bridge à part
(`bridge/src/`) autorise les connecteurs avec Biscuit et signe chaque fait accepté ; le joueur vérifie la signature avant
de lire quoi que ce soit (`src/engine/reality/protocol.ts`), et le moteur applique le signal au plus une fois, comme une
entrée de session, sauvegardée avant l'accusé de réception. Le moteur ne touche jamais au réseau : le transport est un
port (`WorldSignalPort`), et un jeu sans `reality` ne charge rien de ce code.

<a name="public-and-internal"></a>

## Public et interne

Public : `@quest-n-click/engine/content` (les types et `defineGame`), `@quest-n-click/engine/player` (le démarrage),
`@quest-n-click/engine/minigames`, `@quest-n-click/engine/testing` (`Engine`, les doublures, l'enveloppe de sauvegarde, `solve`),
`@quest-n-click/engine/reality` (depuis la 4.1.1), le format du contenu, l'enveloppe de sauvegarde et les outils MCP, tenus par
`tests/api-surface.json` et la politique de support ([Stabilité et support](start.stability.md),
[API publique](engine.api.md)). Interne : les modules derrière les façades `Engine` et `App` (leurs membres marqués
`@internal`), les modules du solveur, le code des outils. Le code interne peut bouger d'une version mineure à l'autre.

<a name="decisions"></a>

## Décisions et ADR

- [ADR 0002](../../docs/dev/adr/0002-declarative-content.md) le contenu déclaratif ;
  [ADR 0003](../../docs/dev/adr/0003-solver-runs-the-engine.md) le solveur fait tourner le moteur ;
  [ADR 0004](../../docs/dev/adr/0004-session-unit-of-reproduction.md) la session, unité de reproduction ;
  [ADR 0005](../../docs/dev/adr/0005-indexeddb-read-back.md) IndexedDB relu ;
  [ADR 0007](../../docs/dev/adr/0007-biscuit-and-signed-events.md) Biscuit et événements signés ;
  [ADR 0011](../../docs/dev/adr/0011-scene-frame-intents-journal.md) trame de scène, intentions, journal.
- L'index complet : [Décisions et ADR](contribute.decisions.md).
