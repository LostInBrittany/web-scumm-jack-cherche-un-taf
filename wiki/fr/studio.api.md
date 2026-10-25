# API du Studio

L'API JSON à laquelle parle la page du Studio : lire le jeu, modifier un lieu, lancer les vérifications. Chaque route
ci-dessous a sa propre section ; on y renvoie par `studio.api.md#put-room-id-layout` (la méthode et le chemin en
minuscules, `-` entre les mots).

<a name="overview"></a>

## Vue d'ensemble

- **Où elle se trouve.** Le serveur de dev (`npm run dev` ou `npm run studio`, dans le dépôt du moteur ou dans un
  projet créé) la sert sous `/__studio/api/`. Le Studio Server (4.2.1) sert la même table de routes sous `/api/`, et
  indique cette base dans une balise meta de la page qu'il sert
  ([`src/studio/api-base.ts`](../../src/studio/api-base.ts),
  [`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts)). Une seule table,
  [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts), donc les deux répondent de la même
  façon ; les routes marquées « serveur de dev seulement » ci-dessous n'existent que sur le serveur de dev.
- **Par rapport à quoi.** Chaque chemin est relatif au jeu courant (`GAME`, voir les
  [variables d'environnement](reference.environment-variables.md)).
- **Corps.** Le corps d'un `PUT`, `POST` ou `DELETE` est un objet JSON (sinon `the body must be a JSON object`, 400) ;
  un `GET` n'en prend pas. La réponse est du JSON (`cache-control: no-store`), sauf le flux des changements, les
  captures, les fichiers de l'onglet Assets et le flux de l'Assistant.
- **Sur le Studio Server**, une écriture doit porter l'en-tête `x-studio-request: 1` (la page du Studio l'envoie à
  chaque requête) : avec `Origin` et un corps JSON, c'est ce que la page d'aucun autre site ne peut envoyer sans
  requête préalable (preflight). La session, les rôles et les portées tenues par d'autres s'y appliquent aussi (403,
  423).
- **Erreurs.** Un refus répond `{ "error": "<message>" }`, parfois avec d'autres champs, et un statut 4xx ou 5xx : 400
  entrée invalide, 404 lieu, chemin ou endpoint inconnu (`no such endpoint: <path>`), 405 mauvaise méthode
  (`method <M> not allowed on <path>`), 409 existe déjà ou a changé entre-temps, 422 l'écriture ajouterait des erreurs
  de validation (ou pas de `defineRoom({...})` dans le fichier), 423 une portée tenue par un autre membre (Studio
  partagé), 500 le jeu ne se charge pas ou une modification casserait le fichier, 501 indisponible ici (une capture
  sans Playwright, une capture de diff sur un Studio hébergé). Chaque statut et chaque message sont listés dans le
  [registre des erreurs](reference.error-codes.md#studio).

<a name="core-functions"></a>

### Les mêmes opérations en fonctions

Les routes appellent les simples fonctions de
[`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts), qu'utilisent aussi le plugin Vite, les tests
et le serveur MCP : `gameInfo()`, `getRoom(id)`, `setLayout(id, layout)`, `setText(id, path, value)`,
`addEntity(id, e)`, `getStoryboard()`, `setStoryboard(sb)`, `exportStoryboardMarkdown()`, `getNotes()`, `addNote(n)`,
`editNote(id, { text, about? })`, `deleteNote(id)`, `validate()`, `solve(from?)`,
`screenshot(room, checkpoint, devServerUrl)` pour le jeu courant, et `createStudio({ gameDir, root, importFresh })`
pour n'importe quel autre dossier de jeu.

- Elles ne quittent jamais le processus : une erreur est levée en `StudioError`, avec son `status`.
- Le jeu est réimporté à chaque appel, pour qu'une modification sur le disque soit vue : par défaut avec le chargeur
  ciblé de tsx (rapide, dans le même processus) ; `importInChild` (un processus enfant `node` + tsx) est le repli là
  où les imports dans le processus sont mis en cache, dans Vitest par exemple.
- Les écritures sont sérialisées. Depuis 4.2.1 chaque écriture est une opération du journal du jeu
  ([`studio-server/src/ops/journal.ts`](../../studio-server/src/ops/journal.ts), rangé dans `.cache/studio-journal/`) :
  tous les fichiers qu'elle touche sont écrits ensemble ou pas du tout, durablement (fsync), et une opération qu'un
  crash a interrompue est terminée à la réouverture du Studio.
- Toute écriture sur des fichiers que lit le validateur est gardée sur le jeu tel qu'il serait après elle : 422
  quand elle ajoute des erreurs de validation (les textes aussi depuis 4.2.1).
- Ajouter un accessoire, une zone cliquable ou un acteur écrit le lieu et son layout en une seule opération, annulée
  en une fois.
- Un changement fait hors du Studio (un éditeur, un agent, git) est enregistré avant que la prochaine écriture touche
  ce fichier ; un fichier qu'un autre processus a réécrit pendant la préparation d'une modification donne un 409.
- Les types partagés sont dans [`tools/studio/types.ts`](../../tools/studio/types.ts) ; le schéma du storyboard, sa
  normalisation et l'export Markdown sont dans [`tools/pages/storyboard-data.ts`](../../tools/pages/storyboard-data.ts)
  (pur, partagé par le générateur de pages, le core et la page).

> [!LIMIT id=hosted-only-routes]
> Cette page couvre la table que les deux serveurs partagent et les routes propres au serveur de dev. Les routes
> propres au Studio Server (sessions et connexion, membres et invitations, commentaires, builds et prévisualisations,
> ses routes Assets, le curseur du journal `/api/ops`, la mise à niveau du moteur, les sondes, `/mcp`) ne sont pas
> décrites ici : voir les pages du Studio hébergé.

<a name="texts"></a>

### Textes

Un littéral de chaîne sous `defineRoom({...})` est un texte, repéré par son chemin JSON, quand le chemin finit par
`name`, `topic`, `toast`, `lines[n]`, `say[1]`, `shout[1]`, `guide.say`, `choice[n].text`, `look.<id>` ou
`look.<id>[n]`, ou quand c'est une chaîne nue dans une liste de commandes (`do`, `once`, `then`, `else`, `cutscene`,
`after`, `onEnter`, ou une branche de `nth`, `cycle`, `random`, `parallel`) : ce sont des répliques du héros. `kind`
dit laquelle (`name`, `look`, `say`, `hero`, `topic`, `hint`, `toast`, `choice`, `guide`) ; `who` est le locuteur
d'un `say`.

- Les ids, références d'image, drapeaux et conditions ne sont jamais des textes, et l'API refuse de les modifier.
- Un remplacement ne touche que le littéral (même style de guillemets, échappé si besoin).
- Un ajout suit la mise en forme de la liste (en ligne, ou un élément par ligne avec la même indentation).
- Une suppression retire l'élément et son séparateur.
- Les chemins des éléments suivants se décalent après un ajout ou une suppression : relisez le lieu.

<a name="serving"></a>

### Diffusion

La page du Studio est `studio.html` à la racine du moteur (point d'entrée `src/studio/main.ts`). N'importe quel
serveur de dev la sert à `/__studio/` (`npm run dev` aussi) ; `npm run studio` l'ouvre en plus. Un build de
production ne l'inclut pas, sauf avec `STUDIO=1` (le mode démo). L'onglet Rooms affiche
`/?edit=<room>&at=<checkpoint>` dans une iframe et parle à l'éditeur via `postMessage`
([éditeur de placement](reference.dev-url-parameters.md#edit)). La page du Studio ignore les rechargements complets
de Vite causés par les fichiers du jeu : la vue du moteur se recharge, le Studio garde ce que vous êtes en train de
taper et suit le changement via [`GET /events`](#get-events).

<!-- generated:begin -->

<a name="game"></a>

## Le jeu et ses lieux

Lire le jeu, lire un lieu, et écrire le layout, les textes, les entités et les valeurs structurées d'un lieu. Chaque écriture est une opération du journal du jeu, gardée sur le jeu tel qu'il serait après elle.

<a name="get-game"></a>

### `GET /game`

- Réponse : `{ id, title, hero, rooms: [{ id, name, decor }], characters: { id: { name, color, portrait } }, items: { id: { name, icon } }, verbs, checkpoints, images, sfx }`, lu depuis le module du jeu (avec ses `objectives` depuis 4.1.12). `images` est le manifeste des assets, id → `[w, h]`, vignettes à `/assets/img/<id>.webp` ; `sfx` les ids de `audio.sfx`.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="get-room-id"></a>

### `GET /room/:id`

- Réponse : `{ def: RoomDef, layout: Layout, texts: TextRef[], file }`, avec `TextRef = { path, value, file, line, kind, who? }` pour chaque littéral de texte du fichier du lieu (voir [Textes](#texts)). 404 pour un lieu inconnu.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="put-room-id-layout"></a>

### `PUT /room/:id/layout`

- Corps : l'objet `Layout` entier.
- Réponse : `{ ok }` : `layout/<id>.json` écrit.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="put-room-id-text"></a>

### `PUT /room/:id/text`

- Corps : `{ path, value }`, `value` une chaîne ou `null`.
- Réponse : `{ ok, line, changed }` : le littéral de chaîne à `path` remplacé dans `rooms/<id>.ts` ; `changed: false` quand la valeur était déjà là (rien n'est écrit). `value: null` supprime une ligne de liste (ou tout un `look.<id>`) ; un chemin finissant par `[+]` ajoute une ligne (`look.piano[+]`, `hints[2].lines[+]`, `on[3].do[+]`). Un chemin qui n'est pas un texte (un id, une image, un drapeau, une condition) est refusé ; une `value` ni chaîne ni null donne un 400. Gardée depuis 4.2.1 : 422 quand la modification ajouterait des erreurs de validation.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="post-room-id-add"></a>

### `POST /room/:id/add`

- Corps : `{ kind: 'prop' | 'hotspot' | 'actor', id, name?, img?, char?, at: [x, y], look? }`.
- Réponse : `{ ok, line, changed }` : l'entrée insérée dans le fichier du lieu (sa section créée si absente), la première ligne de Regarder facultative, et une place dans le layout (accessoire : pied à `at`, hauteur 60 ; zone cliquable : une boîte 60 × 60 centrée sur `at` ; acteur : pieds à `at`), en une seule opération annulée en une fois. `name` est obligatoire pour les accessoires et les zones cliquables ; 409 quand l'id existe ; `kind`, `id` et `at` sont vérifiés d'abord (`` `kind` must be prop, hotspot or actor ``, `` `at` must be [x, y] ``).
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="put-room-id-value"></a>

### `PUT /room/:id/value`

- Corps : `{ path, value?, dry? }`.
- Réponse : `{ ok, line, changed, diff, dry? }` : une valeur structurée (une réaction `on[3]` ou `on[<longueur>]` pour en ajouter une, une condition `on[3].if`, une liste de commandes `on[3].do` ou `onEnter`, le `stage` ou le `renderer` du lieu) écrite en code à `path` dans le style du fichier ; `value` absente retire le chemin ; `dry: true` ne renvoie que le diff. 422 `{ error, errors, diff }` quand l'écriture ajouterait des erreurs de validation : depuis 4.2.1 rien n'est écrit, la garde juge le jeu tel qu'il serait.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Depuis : 3.4.

<a name="put-room-game-value"></a>

### `PUT /room/@game/value`

- Corps : `{ path, value?, dry? }`.
- Réponse : La même chose pour le `defineGame({...})` du fichier du jeu, objectifs seulement : `objectives`, `objectives.<id>` (`{ title, done, optional?, parent? }`) ou un de ses champs ; tout autre chemin est un 400. Validée de la même façon : un objectif dont le `done` ne peut jamais être vrai est refusé.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Depuis : 4.1.12.

<a name="history"></a>

## Révisions et annulation

Ce qui a changé entre deux révisions du journal, les lieux qu'il nomme dessinés aux deux, et l'annulation et le rétablissement des modifications du Studio.

<a name="get-diff-from-to"></a>

### `GET /diff/:from..:to`

- Réponse : Ce qui a changé entre deux révisions du journal, par ce que le jeu nomme : `{ files: [{ path, change: added|removed|changed, ids?: { added, removed, changed: [{ id, fields }] }, values?: { added, removed, changed }, opaque?, cut? }] }` ; 2 000 révisions au plus. « Changes between revisions » dans l'onglet Check. Chaque révision fait 1 à 12 chiffres.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Depuis : 4.2.3.

<a name="get-diff-from-to-captures"></a>

### `GET /diff/:from..:to/captures`

- Réponse : Studio local seulement : chaque lieu que le diff nomme, dessiné aux deux révisions : `{ from, to, size: [960, 600], rooms: [{ room, why, before, after, box?, same? }], cut?, ms }`. Un côté est `{ file, url }` (une data URL PNG et son fichier sous `.cache/studio/`) ou `{ missing }` (pourquoi il n'est pas dessiné : la révision ne se construit pas, le lieu n'y est pas) ; `box` `[x, y, l, h]` où ils diffèrent, `same` quand nulle part. 501 `{ unavailable, reason }` sur un Studio hébergé ou sans Playwright.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Depuis : 4.4.0.

<a name="post-undo"></a>

### `POST /undo`

- Réponse : `{ ok, file, what }`, ou `{ ok: false, reason }` quand il n'y a rien à annuler ; 409 quand un des fichiers de l'opération a changé depuis (une IA, un éditeur, git, un autre auteur). Elle-même une opération du journal. Sur un Studio partagé (4.2.2) chaque membre annule sa propre dernière opération, et une portée tenue par un autre membre donne un 423.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Depuis : 3.4.

<a name="post-redo"></a>

### `POST /redo`

- Réponse : `{ ok, file, what }`, ou `{ ok: false, reason }` quand il n'y a rien à rétablir ; 409 quand un des fichiers de l'opération a changé depuis (une IA, un éditeur, git, un autre auteur). Elle-même une opération du journal. Sur un Studio partagé (4.2.2) chaque membre rétablit sa propre dernière opération, et une portée tenue par un autre membre donne un 423.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Depuis : 3.4.

<a name="get-history"></a>

### `GET /history`

- Réponse : `{ undo: [what], redo: [what] }` : ce qu'une annulation et un rétablissement reprendraient, le plus récent en dernier.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Depuis : 3.4.

<a name="story"></a>

## Storyboard, carte du scénario et notes

Le storyboard (`storyboard.json`), les regroupements de la carte du scénario (`groupings.json`) et les notes partagées (`notes.json`) du dossier du jeu.

<a name="get-storyboard"></a>

### `GET /storyboard`

- Réponse : `storyboard.json`, `{ boards: [] }` s'il est absent.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="put-storyboard"></a>

### `PUT /storyboard`

- Corps : `{ boards: [...] }`.
- Réponse : `{ ok, changed }` : un storyboard inchangé n'est pas réécrit, un storyboard modifié est écrit de façon compacte (ce qui tient sur 120 colonnes reste sur une ligne).
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="post-storyboard-markdown"></a>

### `POST /storyboard/markdown`

- Réponse : `{ ok, file, bytes, boards, panels }` : `games/<id>/storyboard.md` écrit à partir du `storyboard.json` enregistré (le même texte que `npm run page:storyboard -- --md`) ; 404 sans `storyboard.json`.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="get-groupings"></a>

### `GET /groupings`

- Réponse : Le fichier des regroupements, `{ groupings: [{ id, kind: chapter|puzzle|character, title, refs }] }`.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Depuis : 4.2.3.

<a name="put-groupings"></a>

### `PUT /groupings`

- Corps : `{ groupings: [...] }`.
- Réponse : Écrit le fichier des regroupements, vérifié : ids uniques et en minuscules, sortes connues, références sans espace, 500 au plus de chaque.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Depuis : 4.2.3.

<a name="get-map"></a>

### `GET /map`

- Réponse : La carte du scénario dérivée des regroupements et de l'IR : `{ groupings: [{ …, refs: [{ ref, kind, at? }] }], ungrouped: { <sorte>: [refs] } }`.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Depuis : 4.2.3.

<a name="get-notes"></a>

### `GET /notes`

- Réponse : `{ entries: Note[] }`, avec `Note = { id, about, author, text, at, edited? }`.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="post-notes"></a>

### `POST /notes`

- Corps : `{ about?, author?, text, task? }`.
- Réponse : La nouvelle `Note`, ajoutée à `notes.json` (créé à la première écriture) ; `author` vaut `you` par défaut, `at` est une date ISO. `task: true` marque une demande pour un agent connecté en MCP.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="put-notes-id"></a>

### `PUT /notes/:id`

- Corps : `{ text, about? }`.
- Réponse : La `Note` mise à jour : texte débarrassé des espaces superflus, `edited` réglé à maintenant ; `at`, `author` et l'ordre inchangés. 400 pour un texte vide (ou un `about` qui n'est pas une chaîne), 404 pour un id inconnu.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="delete-notes-id"></a>

### `DELETE /notes/:id`

- Réponse : `{ ok }` : la note retirée de `notes.json` ; 404 pour un id inconnu.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="checks"></a>

## Vérifications et vues

Le validateur, le solveur, le lint, les playtests, la couverture du storyboard, le profileur, la carte du monde, le graphe des énigmes et l'IR du jeu : en lecture seule, le jeu rechargé à chaque appel. Sur le Studio Server, `validate`, `solve`, `lint` et `playtests` tournent sur l'application de traitement.

<a name="post-validate"></a>

### `POST /validate`

- Réponse : `{ ok, errors: string[], warnings: string[], ms }`.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="post-report"></a>

### `POST /report`

- Réponse : Le profileur de contenu : `{ report, markdown, ms }`, ce que représente chaque lieu, objet et personnage et ce qui est maigre (`src/engine/tools/report.ts`, l'outil MCP `content_report`).
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="get-graph"></a>

### `GET /graph`

- Réponse : La carte du monde : `{ graph, svg, dot }`, les lieux et les passages entre eux (`src/engine/tools/graph.ts`, l'outil MCP `world_graph`).
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="post-puzzle"></a>

### `POST /puzzle`

- Corps : `{ id? }`.
- Réponse : Le graphe des énigmes : `{ graph, svg, dot, markdown, classes, id? }`, ce dont chaque règle a besoin et ce qu'elle change ; `markdown` est la vue d'ensemble, ou avec `id` la fiche de cet objet, drapeau ou accessoire ; `classes` dit pourquoi le solveur garde chaque nœud (critical, world, visible ou dead). L'outil MCP `puzzle_graph`.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="post-coverage"></a>

### `POST /coverage`

- Réponse : `{ coverage, markdown, ms }` : le storyboard enregistré confronté au contenu (`src/engine/tools/coverage.ts` : par board et par case, chaque lieu, locuteur, réplique, sujet, son et action ok / partial / missing / unknown).
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="post-playtests"></a>

### `POST /playtests`

- Réponse : `{ report, markdown, files, ms }` : les playtests de `games/<id>/playtests/` rejoués et cumulés (`src/engine/tools/playtests.ts`).
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="post-lint"></a>

### `POST /lint`

- Corps : `{ prove? }`.
- Réponse : `{ lint, markdown, mode, ms }` : le lint de contenu après une passe du solveur (`src/engine/tools/lint.ts` ; `prove` : la recherche exhaustive d'abord).
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="post-solve"></a>

### `POST /solve`

- Corps : `{ from?: checkpoint, prove? }`.
- Réponse : `{ finished, states, truncated, path, roomsReached, unlockedReached, flagsReached, itemsNeverUsed, unusedItems, deadEnds: [{ room, inventory, path }], errors, from, ms, profile }` ; `profile` est le `SolveProfile` de `src/engine/tools/solve.ts`. 400 pour un checkpoint inconnu. 20 000 états au plus ; `prove` lance la recherche exhaustive au lieu du témoin. Sur le Studio Server il tourne sur l'application de traitement, sous une limite de temps.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="get-ir"></a>

### `GET /ir`

- Réponse : L'IR du jeu ([référence du DSL](create.dsl.md#game-as-data)) : sa logique en données avec le `fichier:ligne` de chaque id (`provenance`) et l'empreinte des extensions de confiance ; le même JSON que `npm run ir -- --json`.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Depuis : 4.1.12.

<a name="voices"></a>

## Voix et héros

La table des voix de chaque langue (`voices.json`) et la matrice héros × langue.

<a name="get-voices-lang"></a>

### `GET /voices[/:lang]`

- Réponse : La table des voix d'une langue (celle du jeu par défaut ; une langue inconnue y revient) : `{ lang, langs, statuses, rows }`.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Depuis : 3.4.

<a name="put-voices-lang-id"></a>

### `PUT /voices/:lang/:id`

- Corps : `{ status?, note?, actor? }` (`null` compte comme absent).
- Réponse : `{ ok }`, la ligne écrite dans `voices.json` (statut `draft`, note et acteur vides par défaut). L'id est celui de la réplique, encodé dans l'URL par le client : un clip d'une réplique à aiguillages a pour clé `<id>~<flag>=<value>` (4.3.0, `=` envoyé en `%3D`) ; 404 quand le jeu n'a pas cette réplique ; un champ qui n'est pas une chaîne donne un 400.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Depuis : 3.4.

<a name="get-voices-lang-csv"></a>

### `GET /voices/:lang/csv`

- Réponse : `{ lang, csv }` : la table des voix en CSV.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Depuis : 3.4.

<a name="get-hero-matrix"></a>

### `GET /hero-matrix`

- Réponse : La matrice héros × langue (`src/engine/tools/hero-matrix.ts`), en lecture seule : `{ langs, flags, columns, rows, truncated? }`, les `cells[colonne][langue]` de chaque ligne `{ text, want, clip?, file?, fallback?, missing?, borrowed?, unlisted? }` et ses `untranslated`, `agreement`, `problem`.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).
- Depuis : 4.4.0.

<a name="feed"></a>

## Flux des changements et captures

Les évènements envoyés par le serveur de dev et les captures de lieux qu'il rend.

<a name="post-screenshot"></a>

### `POST /screenshot`

- Corps : `{ room, checkpoint? }`.
- Réponse : `{ file, url }` : un PNG du lieu (les surcouches de l'éditeur masquées) sous `.cache/studio/<game>-<room>[-<checkpoint>].png`, servi à `url` (`GET screenshots/<name>.png`). 400 sans `room` ; 501 `{ unavailable: true, reason, error }` si Playwright ou son Chromium manque.
- Servie par : le serveur de dev et le Studio Server (la table commune, [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts)).

<a name="get-screenshots-name"></a>

### `GET /screenshots/:name`

- Réponse : Le PNG qu'une capture a écrit (`image/png`, sans cache) ; 404 `no such screenshot`. `name` est fait de lettres, chiffres, `.`, `_` et `-`, et finit par `.png`.
- Servie par : le serveur de dev seulement ([`tools/studio/plugin.ts`](../../tools/studio/plugin.ts)).

<a name="get-events"></a>

### `GET /events`

- Réponse : Évènements envoyés par le serveur (SSE) : `{ type: 'hello', game }` à la connexion, puis `{ type: 'changed', file }` quand un fichier du dossier du jeu change sur le disque (`file` relatif à ce dossier, par exemple `rooms/house.ts` ; les dotfiles, les sauvegardes d'éditeur et `private/` sont ignorés ; anti-rebond de 150 ms par fichier) ; un commentaire `: ping` toutes les 25 s.
- Servie par : le serveur de dev seulement ([`tools/studio/plugin.ts`](../../tools/studio/plugin.ts)).

<a name="assets"></a>

## Onglet Assets

Chaque image et chaque son du jeu avec l'endroit où il sert, les prompts d'image par planche, et les envois. Rien n'est jamais supprimé : un fichier remplacé est d'abord gardé en `<nom>_v<N>.<ext>` à côté. Depuis 4.2.1 chaque envoi est une opération du journal : les sauvegardes, les nouveaux fichiers et les cases qu'un outil a découpées sont écrits ensemble ou pas du tout. Un corps JSON fait 96 Mio au plus (413 au-delà). Le Studio Server sert ses propres routes Assets (`studio-server/src/server/hosted-assets.ts`), non décrites ici.

<a name="get-assets"></a>

### `GET /assets`

- Réponse : `{ sheets: [{ id, kind: 'sprites' | 'furniture' | 'talk', character?, grid, promptKind?, cells: [{ id, file, w, h, used, ids, prepared, asset?, backups, mtime, missing? }] }], decors: [{ name, rooms, …cell }], sounds: { music, sfx: [{ id, kind, file, used, prepared, asset?, backups }] }, missing, unprepared, prompts: { sheets: [{ id, kind, markdown, missingMarkdown? }], style } }`.
- Servie par : le serveur de dev seulement ([`tools/studio/assets.ts`](../../tools/studio/assets.ts)).

<a name="get-assets-file-path"></a>

### `GET /assets/file/:path`

- Réponse : Un fichier source de `art/` ou `audio/`, son chemin relatif au dossier du jeu ; tout autre chemin est un 404 `no such file`.
- Servie par : le serveur de dev seulement ([`tools/studio/assets.ts`](../../tools/studio/assets.ts)).

<a name="get-assets-prompts"></a>

### `GET /assets/prompts`

- Réponse : `{ markdown }` : tout le document de `npm run prompts` ; `?missing=1` donne celui de `npm run prompts -- --missing`.
- Servie par : le serveur de dev seulement ([`tools/studio/assets.ts`](../../tools/studio/assets.ts)).

<a name="post-assets-sheet"></a>

### `POST /assets/sheet`

- Corps : `{ sheetId, grid?: '6x4', cells?: 'r1c1,r2c3', data }`, `data` en base64 ou en data URL.
- Réponse : `{ ok, file, output, written, backups, cells }` : la planche enregistrée en `private/sheets/<sheetId>-<heure>.<ext>` et découpée par `tools/cut-sheet.py` dans `art/<sheetId>/`. 409 `{ conflicts }` quand des cases de cette planche existent et que `cells` ne les nomme pas ; une case nommée qui existe est d'abord gardée en `<case>_v<N>.png`.
- Servie par : le serveur de dev seulement ([`tools/studio/assets.ts`](../../tools/studio/assets.ts)).

<a name="post-assets-cell"></a>

### `POST /assets/cell`

- Corps : `{ sheetId, cell, data, key?: 'auto' | 'always' | 'never' }`.
- Réponse : `{ ok, file, backup?, keyed: 'keyed' | 'kept' | 'opaque', cell }` : `art/<sheetId>/<case>.png` remplacé (ou ajouté), l'ancien fichier gardé en `<case>_v<N>.png` ; un fond uni est détouré avec la règle du découpeur.
- Servie par : le serveur de dev seulement ([`tools/studio/assets.ts`](../../tools/studio/assets.ts)).

<a name="post-assets-sound"></a>

### `POST /assets/sound`

- Corps : `{ kind: 'music' | 'sfx', file, data }`.
- Réponse : `{ ok, file, backup? }` : écrit dans `audio/<kind>/<file>` (tout format que lit ffmpeg), l'ancien fichier gardé en sauvegarde.
- Servie par : le serveur de dev seulement ([`tools/studio/assets.ts`](../../tools/studio/assets.ts)).

<a name="post-assets-decor"></a>

### `POST /assets/decor`

- Corps : `{ name, data }`, un PNG ou un JPEG.
- Réponse : `{ ok, file, backup? }` : écrit dans `art/decor/<name>.<ext>`, l'ancienne image gardée en `<name>_v<N>.<ext>`.
- Servie par : le serveur de dev seulement ([`tools/studio/assets.ts`](../../tools/studio/assets.ts)).

<a name="post-assets-prepare"></a>

### `POST /assets/prepare`

- Réponse : Lance `npm run assets` : `{ ok, code, output }`. Avec `?stream=1`, la sortie en texte brut pendant l'exécution, terminée par `[exit <code>]`.
- Servie par : le serveur de dev seulement ([`tools/studio/assets.ts`](../../tools/studio/assets.ts)).

<a name="assistant"></a>

## Assistant

L'Assistant du Studio sur le serveur de dev : une conversation relayée vers un modèle de chat, et une tâche pour un agent connecté en MCP.

<a name="post-assistant-chat"></a>

### `POST /assistant/chat`

- Corps : `{ provider: { kind, baseUrl, model, apiKey? }, messages: [{ role: 'user' | 'assistant', content }], context? }`.
- Réponse : Évènements envoyés par le serveur pour la conversation : `{ type: 'text', delta }`, `{ type: 'tool_call', id, name, args }`, `{ type: 'tool_result', id, name, result, isError? }`, `{ type: 'done', usage?, wrote?, stopped? }`, `{ type: 'error', message }`. Les appels d'outils du modèle s'exécutent sur le jeu par le registre des outils MCP ([outils MCP](studio.mcp-tools.md)). La clé d'API arrive avec chaque requête et ne vit en mémoire que le temps de celle-ci, jamais sur disque ni dans un journal. 400 pour un fournisseur ou une conversation invalide : `kind` vaut `openai`, `anthropic` ou `ollama` ; `baseUrl` est une URL http(s) sans identifiants, l'origine d'un fournisseur connu ou un Ollama sur la boucle locale, sinon refusée sauf `WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1`, et alors en HTTPS vers un hôte public seulement ; `model` obligatoire ; le dernier message est celui de l'utilisateur.
- Servie par : le serveur de dev seulement ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts)).

<a name="post-assistant-task"></a>

### `POST /assistant/task`

- Corps : `{ text, about? }`.
- Réponse : La nouvelle note, marquée `task: true`, auteur `you` : une demande pour un agent connecté en MCP, sans clé. 400 sans `text`.
- Servie par : le serveur de dev seulement ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts)).

<!-- generated:end -->
