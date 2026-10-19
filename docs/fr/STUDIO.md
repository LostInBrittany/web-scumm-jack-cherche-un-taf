# Studio : édition WYSIWYG locale, porte ouverte à n'importe quelle IA

`npm run studio` démarre le serveur de dev avec le Studio à `/__studio/`. Rien ne quitte la machine : chaque
changement est écrit dans des fichiers sous `games/<id>/`, les mêmes fichiers qu'un assistant IA ou un collègue
modifie avec git. Le Studio affiche le vrai moteur (le lieu rendu par `src/engine/dom`), donc ce qu'on voit est ce
que les joueurs auront.

Pour mettre le Studio d'un jeu en ligne pour une équipe (connexions, rôles, plusieurs personnes à la fois), voir
[STUDIO-SERVER](STUDIO-SERVER.md).

## Sécurité locale et réseau

`npm run studio` et `npm run dev` écoutent sur `127.0.0.1` : une autre machine ne peut pas atteindre leurs routes
d'écriture. Pour travailler depuis un téléphone, utiliser `npm run studio:lan` ou `npm run dev:lan` ; chaque commande
affiche une URL avec un nouveau jeton de capacité. Toutes les routes Studio, assets, layout et assistant exigent alors
ce jeton et une requête de même origine. Ne pas exposer le port de développement à Internet. Les clés fournisseur
restent dans `sessionStorage` ; les URL arbitraires sont désactivées sauf avec `WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1`,
et les destinations privées/link-local restent bloquées hors préréglage Ollama local (dans les deux familles d'adresses :
`[::1]`, `0.0.0.0`, IPv6 mappé IPv4, `fc00::/7`, `fe80::/10`, `.local`, `.internal`). Un appel au fournisseur ne suit
jamais une redirection, abandonne après 60 s et lit au plus 8 Mo de réponse. Le TypeScript d'un jeu et les
commandes personnalisées sont du code de confiance, pas des données isolées. Voir `SECURITY.md`.

## Organisation du Studio
- **Rooms** (onglet par défaut) : le lieu rendu par le moteur avec l'éditeur de placement par-dessus (glisser les
  zones, les pieds, les hauteurs, les points d'approche, la zone marchable, les lignes d'échelle, les entrées), la
  liste des accessoires / acteurs / zones cliquables du lieu à droite. En sélectionner un (dans la liste ou dans la
  vue) ouvre sa fiche : nom, sorte, états, visibilité, **lignes de Regarder** (ajouter, modifier, supprimer),
  **réactions** (verbe, cibles, condition, commandes en liste de lignes : textes modifiables, autres commandes
  affichées), **sujets de conversation** (en liste, ou en **arbre** : sujets, répliques, choix et leurs options,
  branches, chacun avec sa condition ; toucher un nœud saute à son éditeur) ; à côté de chaque cinématique, script d'arrivée et script du monde, un bouton **Timeline** dessine combien dure chaque commande et ce qui se chevauche (répliques, marches, animations, branches parallèles, les tours du joueur en rouge ; toucher une barre saute à sa ligne) ; sous la vue, le nom du lieu, les **indices**, les lignes **à
  l'entrée**, les **scripts** et les **événements** du lieu (structure en lecture, textes modifiables). Un texte est enregistré quand le champ perd le focus (Entrée) ; Échap annule. Chaque enregistrement
  affiche un toast et lance Check en arrière-plan ; un placement en cours dans la vue est enregistré d'abord (la vue
  se recharge quand le fichier du lieu change). Les modifications de texte sont écrites directement dans
  `rooms/<room>.ts` (les littéraux de chaîne sont remplacés via l'analyseur TypeScript ; le fichier reste du code
  lisible). « Add prop / hotspot / actor » crée l'entrée dans le fichier du lieu et la place dans le layout.
- **Storyboard** : un éditeur pour `storyboard.json` (schéma : `tools/pages/storyboard-schema.md`). À gauche, les
  tableaux (titre, lieu, objectif) avec monter / descendre, ajouter, supprimer. Au milieu, le tableau sélectionné :
  titre, id, lieu (« Open in Rooms » bascule sur ce lieu), objectif, sortie, ses lignes d'**arrivée**, ses **cases**
  en cartes dans l'ordre de jeu (titre, id, l'**action** du joueur qui la déclenche, les **répliques** avec un choix
  de locuteur : les personnages du jeu, `hero`, `action`, `stage` ; des puces **sfx** tirées de `audio.sfx` du jeu ;
  par réplique : déplacer, supprimer, « + line » ; par case : déplacer, dupliquer, supprimer), puis les **indices**
  (dans l'ordre), les **sujets de conversation** par personnage (sujet + répliques) et les **réactions**
  facultatives (action + répliques). À droite, la case sélectionnée composée comme une vignette de storyboard : le
  décor du lieu, les portraits des locuteurs de la case (celui qui parle en surbrillance), la réplique courante dans
  le style de parole du jeu (couleur du locuteur ; parcourir les répliques, ou cliquer sur l'une dans le script
  ci-dessous), l'action présentée comme la phrase du jeu, les sfx ; en dessous, les notes sur cette case (`about` =
  id de la case) et une zone pour en ajouter une.
  Chaque modification reste en mémoire jusqu'à ce que **Save** (ou Ctrl/Cmd+S) écrive le document entier ; « ●
  Unsaved changes » s'affiche jusque-là, et quitter la page le demande d'abord. Save refuse les ids de case
  dupliqués ou vides (les notes s'y accrochent). Quand `storyboard.json` change sur le disque (une IA, un éditeur,
  git), une bannière propose de recharger ; avec des modifications non enregistrées, elle prévient qu'enregistrer
  écraserait ce changement. **Export Markdown** écrit `games/<id>/storyboard.md` à partir du fichier enregistré
  (le même texte que `npm run page:storyboard -- --md` ; elle propose d'enregistrer d'abord).
- **Assets** : toutes les images et tous les sons du jeu, où chacun sert, son prompt de génération, et les envois qui
  les remplacent ou les ajoutent (voir « Onglet Assets » plus bas).
- **Storyboard** (voir plus bas) : le storyboard enregistré est confronté au contenu après chaque chargement et
  enregistrement (`src/engine/tools/coverage.ts`) : un badge sur chaque board et chaque case (✓ tout est dans le jeu,
  ~ en partie, ✗ quelque chose manque, ? de la prose), et sous une case la liste de ce qui n'y est pas encore (une
  action qu'aucune règle ne répond, une réplique que le jeu ne dit pas, un son absent de `audio.sfx`) ; la barre montre
  le score global.
- **Check** : le validateur et le solveur tournent après chaque enregistrement ; leur sortie et le chemin du
  solveur sont affichés ici. « Screenshot » rend un lieu à un checkpoint (nécessite Playwright).
  En dessous, la **carte du monde** (lieux, sorties, gotos ; lieux inaccessibles et sorties sans retour en rouge) et le
  **rapport de contenu** (ce que pèse chaque lieu, objet et personnage : le profileur de `npm run validate -- --report`),
  et le **graphe de puzzles** : chaque règle, sujet, script et écouteur avec ce qu'il exige (flèches grises, pointillées
  quand c'est lu à l'intérieur de ses commandes) et ce qu'il produit (vert) ou consomme (rouge) ; toucher un objet, un flag,
  un accessoire, un lieu de la carte ou un événement affiche sa fiche (obtenu par, utilisé par, exige d'abord, débloque,
  en aval, et pourquoi le solveur le garde : critical, world, visible ou dead, avec la chaîne jusqu'à la fin), le même
  texte que renvoie l'outil `puzzle_graph`. Deux interrupteurs au-dessus du graphe : **Critical path** estompe tout ce
  qui ne mène pas à la fin, à un objectif ou à un invariant ; **Heat** colore chaque règle, sujet, écouteur, script et
  lieu selon le nombre de fois où le solveur y est passé. Sous le chemin du solveur, **Solver health** : exécutions du
  moteur, actions sautées, actions sans effet, actions par état, les dimensions qui séparent le plus les états, les
  avertissements qu'un auteur traite (dimensions indépendantes : un checkpoint entre elles couperait les états ; un
  lieu au branchement démesuré), le profil complet de `npm run solve -- --profile`. Plus bas, **Storyboard coverage** :
  le storyboard confronté au contenu, le même texte que renvoie l'outil `storyboard_coverage`. Avant lui, **Content
  lint** : les constats de `npm run lint` (erreurs, avertissements, infos), chacun un lien vers l'onglet Rooms, le
  même texte que renvoie l'outil `lint`. Au-dessus, **Playtests** (serveur de dev seulement) : les sessions de
  `games/<id>/playtests/` rejouées et cumulées, et le sélecteur « Heat » du graphe de puzzles peut colorer les nœuds
  d'après les sessions des joueurs plutôt que les passes du solveur.
- **Play** : le jeu lui-même (outils de dev actifs) dans un cadre, à côté de l'**état** en direct (lieu, sac, flags,
  personnages mobiles, scripts, joueurs) et d'un **explicateur de règles** : choisis un verbe, un objet et une cible, et
  chaque règle qui pourrait répondre est listée avec chaque condition évaluée ✓ / ✗ sur l'état en direct ; la première ✓
  gagne, sinon l'onglet dit quel repli répond (ligne Regarder, sujets, réaction par kind, repli). En dessous, le
  **journal** : ce que chaque action a répondu (règle, ligne Regarder, repli…), les événements émis et les écouteurs
  atteints, chaque pas de script, les personnages déplacés, les changements de joueur ; filtrable par sorte. Le moteur
  ne le garde qu'en mode dev (`Engine.trace`, les 200 dernières entrées).
  À côté, **Export session** télécharge les entrées depuis le début de la partie (avec le journal : un rapport de bug
  que `npm run replay` rejoue) et **Replay…** en charge une : le moteur la joue en silence, le jeu se pose là où elle
  finit, un curseur parcourt les entrées (en toucher une y pose le jeu), et une divergence avec l'enregistrement est
  signalée. Pour un jeu avec `speedrun` (4.1.14, `docs/fr/SPEEDRUN.md`), le panneau **speedrun** : les catégories et
  leurs règles, les splits avec un éditeur (nom, déclencheur ; **+ split** ; **Write to the game** écrit le manifeste
  avec `set_value` sur `@game`), **Preview on this session** (la session du cadre rejouée avec les splits de la
  catégorie : les temps qu'un run enregistrerait), **Export route** / **Import route** (`.wsroute`), **Logical route
  (solver)** (le témoin, jamais un record), les deux dernières routes comparées, et **Export run (.wsrun)** une fois une
  tentative du cadre scellée.
- **Language** (4.1.12) : le jeu tel que le voient les outils. D'abord ses **objectifs** (ADR 0014) : id, titre,
  condition, parent, optionnel, et le `fichier:ligne` qui écrit chacun ; **Edit** et **+ objective** ouvrent un
  formulaire généré depuis le schéma d'un objectif (`src/studio/forms-gen.ts` : chaque champ avec sa description, l'id
  du parent avec les objectifs du jeu en suggestions, la condition avec l'éditeur du DSL). **Preview the change**
  montre le diff du fichier du jeu, **Apply** l'écrit (validé par le serveur, repris s'il ajoute une erreur), le bouton
  Undo de l'en-tête le reprend ; un problème est nommé par fichier, id et champ avant tout envoi, et les erreurs du
  validateur après. Puis l'IR (`npm run ir`) : salles, entités, règles, sujets, écouteurs et scripts, chacun avec
  l'endroit qui l'écrit, et l'IR entière en JSON.
- **Remix** (4.1.15, `docs/fr/REMIX.md`) : les dimensions du jeu avec leurs valeurs, valeur histoire et modes ;
  **Preview** d'une seed tapée ou **New seed** (la valeur de chaque dimension, l'empreinte du monde, un lien qui le joue
  dans le jeu, un monde figé à **Export**) ; **Lock** des dimensions et **Reroll the others** ; **Compare** avec une
  autre seed ; l'ordre d'une dimension puzzle-order dessiné ; **Coverage and bias** sur beaucoup de seeds ; les
  **Anchors** des salles, et une ajoutée depuis la sélection de l'onglet Salles. Un manifeste qui ne peut faire de monde
  montre les raisons du validateur. Calculé avec le compilateur du moteur (`src/studio/remix-model.ts`) : le Studio ne
  montre jamais un monde que le joueur ne jouerait pas.
- **Map** (4.2.3) : les regroupements du scénario, chapitres, énigmes et personnages (`games/<id>/groupings.json`),
  chacun une liste de ce que le jeu nomme déjà (une salle, un id de règle ou de sujet, `item:<id>`, `char:<id>`,
  `objective:<id>`, `checkpoint:<id>`) avec le `fichier:ligne` qui l'écrit, ou « not declared » quand le jeu ne le
  connaît pas ; puis les salles, personnages, objets,
  objectifs et points de passage qu'aucun regroupement ne nomme encore (les ids écrits par du code, et ceux des lignes
  ou des étapes, ne sont pas dans la provenance de l'IR : ils apparaissent « not declared »). Un regroupement ne fait que référencer : l'enregistrer
  écrit `groupings.json` seul, jamais le contenu. La carte est dérivée à chaque lecture (de la provenance de l'IR et des
  regroupements), jamais stockée.
- **Notes** : le journal partagé (`games/<id>/notes.json`), une entrée par auteur (« you », ou le nom de l'IA), à
  propos d'un id de case, d'un id de lieu, de `lieu.entité`, ou de n'importe quoi (vide : général). Le journal
  entier, le plus récent d'abord, groupé par `about` (lieu / case / entité étiquetés, avec « Open in Rooms » /
  « Open in Storyboard ») ; filtres : texte libre, about (lieux avec leurs entités, cases, autres), auteur. Une zone
  de saisie (about, auteur par défaut `you` et mémorisé, texte ; Ctrl/Cmd+Entrée ajoute). Chaque note montre son
  auteur et son heure, et **Reply** (préremplit `about`), **Edit** (sur place) et **Delete**. Les notes à propos
  d'un lieu ou d'une de ses entités apparaissent aussi en bas de la section de ce lieu dans l'onglet **Rooms**
  (« Notes (n) », avec une zone pour en ajouter une). Le journal suit les changements sur le disque (une IA qui
  écrit une note apparaît).

### Édition structurée (3.4)

- **Des formulaires plutôt que du code.** Dans l'onglet Lieux, chaque réaction a **Modifier…** (verbe, cibles,
  condition, commandes en formulaire) et la liste finit par **+ Réaction** ; la fiche du lieu a **Scène…** (calques avec
  leur image, leur rôle et leur condition ; lumières ; émetteurs de particules ; la transition ; la logique des liens de
  marche) et le **peintre** (celui du jeu, DOM ou canvas). Les formulaires viennent d'une seule table de toutes les
  conditions et commandes (`src/studio/schema.ts`, vérifiée contre les types à la compilation) : une nouvelle commande
  sans formulaire ne compile pas. Ce qui n'a pas de champ simple (les paramètres d'un mini-jeu, les événements d'image
  d'une animation) est une case JSON.
- **Calques, masques, zones (4.1.11).** Sous la fiche du lieu, l'éditeur de scène (`src/studio/rooms-stage.ts`)
  montre le fond avec les masques d'occlusion (rouges), les zones de marche (vertes) et les liens entre zones : la
  profondeur, la parallaxe, l'opacité et la fusion de chaque calque sont des champs ; **Draw a mask** et **Draw a
  zone** prennent les coins cliqués sur le fond, puis **Close the polygon** (un polygone qui ne ferme aucune surface
  n'est pas gardé) ; **Link them** relie deux zones par un escalier, une échelle, un saut, une téléportation ou une
  marche, placé en deux clics. **Save stage** écrit cette géométrie sur le layout du lieu une fois la vue de placement
  enregistrée ; il reste éteint tant qu'un masque ne ferme aucune surface ou qu'une zone n'a pas de lien, ce que le
  validateur refuse aussi.
- **Aperçu, puis application.** « Preview the change » montre le diff que le serveur écrirait (à blanc) ; « Apply »
  l'écrit en code dans le style du fichier (`set_value`, par l'analyseur TypeScript : les commentaires et le reste du
  fichier restent), puis le jeu est rechargé et validé : une modification qui ajoute une erreur de validation est reprise
  et les erreurs sont montrées.
- **Annuler / Rétablir** dans l'en-tête (Ctrl/Cmd+Z, avec Maj pour rétablir), sur toutes les écritures de la session
  (textes, valeurs, layouts, voix). Une annulation refuse quand le fichier a changé depuis (une IA, un éditeur, git). Les
  écritures sont atomiques (un fichier temporaire renommé).
- **La géométrie dans la vue.** Le dossier **Walk zones** de l'éditeur de placement fait du polygone de marche une zone,
  ajoute des zones (trous, zoom) et des liens entre elles (mode, durée, sens unique) ; son dossier **Stage** règle la
  profondeur, la parallaxe, la fusion et l'opacité de chaque calque, dessine les occulteurs en polygones (profondeur,
  adoucissement, inversion) et place lumières et zones de particules. Poignées : glisser ; double-clic sur un bord de
  zone pour ajouter un sommet ; Alt-clic pour en retirer un.
- **Timeline.** Double-clic sur une barre pour changer la durée d'une attente, d'une animation ou d'un mouvement.
- **Jouer.** Le peintre de chaque lieu (celui du jeu, DOM ou canvas) et la vitesse de dessin (images par seconde,
  repeints du peintre canvas).
- **Voix.** Le tableau de production des voix par langue (`npm run voices`) : statut, comédien et note par ligne,
  enregistrés aussitôt ; Export CSV pour les comédiens.
- **Musique** (3.5). Les partitions du jeu par son propre directeur musical : en jouer une, entendre le mix de chaque
  état à la mesure suivante, couper ou isoler un stem, la mesure et le temps affichés pendant la lecture. Rien n'est
  écrit : les états sont du contenu dans `game.ts`.

`npm run e2e:studio -- <url du Studio>` (bloquant en CI) crée une scène par le formulaire, vérifie le diff, l'applique,
la voit dans le jeu, et l'annule.

## L'API (`/__studio/api/*`, JSON, serveur de dev uniquement)
Tous les chemins sont relatifs au jeu courant (`GAME`). Les erreurs renvoient `{ error }` avec un statut 4xx/5xx
(400 entrée invalide, 404 lieu / chemin / endpoint inconnu, 405 mauvaise méthode, 409 existe déjà, 422 pas de
`defineRoom({...})` dans le fichier, 500 le jeu ne se charge pas ou une modification casserait le fichier, 501
capture d'écran indisponible).

| Méthode, chemin | Corps → Résultat |
|---|---|
| GET `game` | `{ id, title, hero, rooms: [{ id, name, decor }], characters: { id: { name, color, portrait } }, items: { id: { name, icon } }, verbs, checkpoints, images, sfx }` (depuis le module du jeu ; `images` est le manifeste des assets, id → `[w, h]`, vignettes à `/assets/img/<id>.webp` ; `sfx` les ids de `audio.sfx`) |
| GET `room/:id` | `{ def: RoomDef, layout: Layout, texts: TextRef[], file }` — `TextRef = { path, value, file, line, kind, who? }` pour chaque littéral de texte du fichier du lieu (voir « Textes » ci-dessous) |
| PUT `room/:id/layout` | `Layout` → écrit `layout/<id>.json` ; `{ ok }` |
| PUT `room/:id/text` | `{ path, value }` → remplace ce littéral de chaîne dans `rooms/<id>.ts` ; `value: null` supprime une ligne de liste (ou tout un `look.<id>`) ; un chemin finissant par `[+]` ajoute une ligne (`look.piano[+]`, `hints[2].lines[+]`, `on[3].do[+]`) ; résultat `{ ok, line, changed }` (`changed: false` quand la valeur était déjà là : rien n'est écrit) |
| POST `room/:id/add` | `{ kind: 'prop' \| 'hotspot' \| 'actor', id, name?, img?, char?, at: [x, y], look? }` → insère l'entrée dans le fichier du lieu (la section est créée si absente), la première ligne de Regarder facultative, et une place dans le layout (accessoire : pied à `at`, hauteur 60 ; zone cliquable : boîte 60 × 60 centrée sur `at` ; acteur : pieds à `at`) ; `{ ok, line, changed }`. `name` est obligatoire pour les accessoires et les zones cliquables |
| GET/PUT `storyboard` | `storyboard.json` (`{ boards: [] }` si absent). PUT attend `{ boards: [...] }`, renvoie `{ ok, changed }` : un storyboard inchangé n'est pas réécrit, un storyboard modifié est écrit de façon compacte (ce qui tient sur 120 colonnes reste sur une ligne) |
| POST `storyboard/markdown` | → écrit `games/<id>/storyboard.md` à partir du `storyboard.json` enregistré (même texte que `npm run page:storyboard -- --md`) ; `{ ok, file, bytes, boards, panels }` ; 404 sans `storyboard.json` |
| GET `diff/<de>..<à>` | 4.2.3 : ce qui a changé entre deux révisions, par ce que le jeu nomme : `{ files: [{ path, change: added\|removed\|changed, ids?: { added, removed, changed: [{ id, fields }] }, values?: { added, removed, changed }, opaque?, cut? }] }` (2 000 révisions au plus ; « Changes between revisions » dans l'onglet Check) |
| GET `groupings`, PUT `groupings`, GET `map` | 4.2.3 : le fichier des regroupements `{ groupings: [{ id, kind: chapter\|puzzle\|character, title, refs }] }` (vérifié : ids uniques et en minuscules, sortes connues, références sans espace ; 500 au plus de chaque), et la carte dérivée de lui et de l'IR : `{ groupings: [{ …, refs: [{ ref, kind, at? }] }], ungrouped: { <sorte>: [refs] } }` |
| GET `notes`, POST `notes` | GET → `{ entries: Note[] }` ; POST `{ about?, author?, text }` → la nouvelle `Note = { id, about, author, text, at, edited? }` (auteur par défaut `you`, `at` est une date ISO), ajoutée à `notes.json` (créé à la première écriture) |
| PUT `notes/:id` | `{ text, about? }` → la `Note` mise à jour (texte débarrassé des espaces superflus, `edited` réglé à maintenant ; `at`, `author` et l'ordre inchangés) ; 400 texte vide, 404 id inconnu |
| DELETE `notes/:id` | → `{ ok }`, la note retirée de `notes.json` ; 404 id inconnu |
| POST `validate` | → `{ ok, errors: string[], warnings: string[], ms }` |
| POST `coverage` | → `{ coverage, markdown, ms }` : le storyboard enregistré confronté au contenu (`src/engine/tools/coverage.ts` : par board et par case, chaque lieu, locuteur, réplique, sujet, son et action ok / partial / missing / unknown) |
| POST `playtests` | → `{ report, markdown, files, ms }` : les playtests de `games/<id>/playtests/` rejoués et cumulés (`src/engine/tools/playtests.ts`) |
| POST `lint` | `{ prove? }` → `{ lint, markdown, mode, ms }` : le lint de contenu après une passe du solveur (`src/engine/tools/lint.ts` ; `prove` : la recherche exhaustive d'abord) |
| POST `solve` | `{ from?: checkpoint }` → `{ finished, states, truncated, path, roomsReached, unlockedReached, flagsReached, itemsNeverUsed, unusedItems, deadEnds: [{ room, inventory, path }], errors, from, ms, profile }` (400 pour un checkpoint inconnu) ; `profile` est le `SolveProfile` de `src/engine/tools/solve.ts` |
| POST `screenshot` | `{ room, checkpoint? }` → `{ file, url }` : un PNG du lieu (overlays de l'éditeur masqués) sous `.cache/studio/<game>-<room>[-<checkpoint>].png`, servi à `url` (`GET screenshots/<name>.png`). 501 `{ unavailable: true, reason, error }` si Playwright ou son Chromium est manquant |
| PUT `room/@game/value` | comme `set_value` pour le `defineGame({...})` du fichier du jeu (4.1.12), objectifs seulement : `objectives`, `objectives.<id>` ou un de ses champs ; tout autre chemin est un 400 |
| GET `ir` | l'IR du jeu (4.1.12, `docs/fr/DSL.md`) : sa logique en données avec le `fichier:ligne` de chaque id (`provenance`) et l'empreinte des extensions de confiance ; le même JSON que `npm run ir -- --json` |
| GET `events` | évènements envoyés par le serveur (SSE) : `{ type: 'hello', game }` à la connexion, puis `{ type: 'changed', file }` quand un fichier du dossier du jeu change sur le disque (`file` relatif à ce dossier, ex. `rooms/house.ts` ; les dotfiles et `private/` sont ignorés ; anti-rebond de 150 ms par fichier) |

Les mêmes opérations existent comme de simples fonctions dans `studio-server/src/ops/core.ts`, utilisées par le plugin Vite,
par les tests et par le serveur MCP : `gameInfo()`, `getRoom(id)`, `setLayout(id, layout)`, `setText(id, path, value)`,
`addEntity(id, e)`, `getStoryboard()`, `setStoryboard(sb)`, `exportStoryboardMarkdown()`, `getNotes()`, `addNote(n)`,
`editNote(id, { text, about? })`, `deleteNote(id)`, `validate()`, `solve(from?)`,
`screenshot(room, checkpoint, devServerUrl)` pour le jeu courant, et `createStudio({ gameDir, root, importFresh })`
pour n'importe quel autre dossier de jeu. Elles ne quittent jamais le processus : les erreurs sont levées comme
`StudioError` (avec `status`). Le jeu est réimporté à chaque appel pour que les modifications sur le disque soient
prises en compte : par défaut avec le chargeur ciblé de tsx (rapide, dans le même processus) ; `importInChild` (un
processus enfant node + tsx) est le repli là où les imports dans le même processus sont mis en cache, par exemple
dans Vitest. Les écritures sont sérialisées. Depuis 4.2.1, chaque écriture est une opération du journal du jeu
(`studio-server/src/ops/journal.ts`, rangé dans `.cache/studio-journal/`) : tous les fichiers qu'elle touche sont écrits
ensemble ou pas du tout, durablement (fsync), et une opération interrompue par un crash est terminée à la réouverture du
Studio. Toute écriture sur des fichiers que lit le validateur est gardée sur le jeu tel qu'il serait après elle (422
si elle ajoute des erreurs de validation ; les textes aussi depuis 4.2.1). Ajouter un prop, un hotspot ou un acteur
écrit la salle et son layout en une seule opération, annulée en une seule fois. Un changement fait hors du Studio (un
éditeur, un agent, git) est enregistré avant que la prochaine écriture touche ce fichier, et un fichier réécrit par un
autre processus pendant la préparation d'une modification donne un 409. Les types partagés sont dans
`tools/studio/types.ts` ; le schéma du
storyboard, sa normalisation et l'export Markdown sont dans `tools/pages/storyboard-data.ts` (pur, partagé par le
générateur de pages, le core et l'UI).

### Textes
Un littéral de chaîne sous `defineRoom({...})` est un texte, repéré par son chemin JSON, quand le chemin finit par
`name`, `topic`, `toast`, `lines[n]`, `say[1]`, `shout[1]`, `guide.say`, `choice[n].text`, `look.<id>` ou
`look.<id>[n]`, ou quand c'est une chaîne nue dans une liste de commandes (`do`, `once`, `then`, `else`, `cutscene`,
`after`, `onEnter`, ou une branche de `nth`, `cycle`, `random`, `parallel`) : ce sont des répliques du héros. `kind`
dit laquelle (`name`, `look`, `say`, `hero`, `topic`, `hint`, `toast`, `choice`, `guide`) ; `who` est le locuteur d'un
`say`. Les ids, références d'image, flags et conditions ne sont jamais des textes, et l'API refuse de les modifier.
Un remplacement ne touche que le littéral (même style de guillemets, échappé si besoin) ; un ajout suit la mise en
forme de la liste (en ligne, ou un élément par ligne avec la même indentation) ; une suppression retire l'élément et
son séparateur. Les chemins des éléments suivants se décalent après un ajout ou une suppression : relire le lieu.

### Diffusion
La page du Studio est `studio.html` à la racine du dépôt (point d'entrée `src/studio/main.ts`). N'importe quel
serveur de dev la sert à `/__studio/` (`npm run dev` aussi) ; `npm run studio` l'ouvre en plus. Un build de
production ne l'inclut pas, sauf `STUDIO=1`. L'onglet **Rooms** affiche `/?edit=<room>&at=<checkpoint>` dans une
iframe et parle à l'éditeur via `postMessage` (voir TOOLS.md, « L'éditeur de placement »). La page du Studio ignore
les rechargements complets de Vite causés par les fichiers du jeu (la vue du moteur se recharge, le Studio garde ce
qu'on est en train de taper et suit le changement via `events`).

## Onglet Assets
L'onglet liste tout ce qui se trouve sous `games/<id>/art/` et `audio/` face à ce que le jeu référence (`tools/refs.ts`),
avec les prompts de `npm run prompts` (`tools/prompts.ts`, docs/fr/PROMPTS.md). Côté serveur : `tools/studio/assets.ts`,
monté sur `/__studio/api/assets` par le plugin ; interface : `src/studio/assets.ts` (l'onglet) avec son modèle, ses
entrées-sorties et ses vues à côté (`assets-model.ts`, `assets-io.ts`, `assets-view.ts`, `assets-sheets.ts`,
`assets-decors.ts`, `assets-sounds.ts` ; les onglets Storyboard et Rooms sont découpés de même depuis 4.1.8, chaque
fichier sous 800 lignes).

- **Arbre** (à gauche) : Characters (une entrée par planche de sprites, nommée d'après le personnage dont elle porte
  les poses), Objects, Backgrounds, Furniture, Talk kits, Sounds (musiques, bruitages). Pastilles : rouge = cases que
  le jeu référence sans fichier, orange = utilisées mais pas préparées (ou plus anciennes que leur source), gris =
  découpées mais inutilisées.
- **Planche** (au centre) : les cases en vignettes avec leur id et ce qui les utilise (`walk`, `portrait`, `items.key`,
  `house.props.pantry`…) ; filtres All / Used / Unused / Missing. Au-dessus, le panneau **Prompt** : la section de la
  planche dans les prompts avec **Copy prompt** (copie le bloc pour le modèle d'image), **Copy prompt for missing cells
  only** quand des cases manquent, et le bloc Style partagé (replié) avec son propre Copy. **Upload generated sheet…**
  envoie l'image à `POST assets/sheet` avec l'id et la grille de la planche ; si des cases existent déjà, une boîte de
  dialogue les liste, chacune avec une case « recut » (décochée : conservée ; seules les nouvelles cases sont
  découpées), puis le résultat de la découpe s'affiche. **Upload sheet into a new sheet id…** (barre d'outils) fait de
  même pour une planche qui n'a pas encore de dossier.
- **Case** (à droite) : aperçu en grand, fichier, taille, ids d'image, préparée ou non, où elle sert (avec « Open
  room »), **Replace…** (détourage : un fond uni est détouré par défaut, ou toujours, ou jamais), et les sauvegardes.
- **Backgrounds** : le décor avec les hotspots, les props (pied et hauteur), les acteurs et la zone de marche du lieu
  dessinés par-dessus, et la bande de sol en pointillés que le prompt demande de laisser vide ; Replace… et « +
  background ». **Sounds** : un lecteur par fichier, où il sert, Replace… (même extension) et Add sound….
- **Prepare assets (npm run assets)** (barre d'outils) lance le pipeline avec sa sortie en direct dans un tiroir ; le
  compte à côté est ce qu'il traiterait. Ensuite la vue Rooms se recharge. Une case remplacée apparaît dans le jeu une
  fois préparée.
- Rien n'est jamais supprimé, et une case validée n'est jamais redécoupée par accident : écraser demande la case
  nommée, et l'ancien fichier est gardé en `<nom>_v<N>`. Les sauvegardes ne sont pas des cases (la liste et les prompts
  les ignorent).
- **Mode démo** : la liste vient de l'instantané (`assets` dans `snapshot.json`), les vignettes et les sons des
  fichiers préparés de `public/assets` (les cases inutilisées n'ont pas d'aperçu) ; les envois et Prepare sont cachés.
- **Studio hébergé** (Studio Server, 4.2.3) : le même onglet, servi par `studio-server/src/server/hosted-assets.ts`
  sous `/api/assets`. Les envois sont bornés (10 Mio ; images PNG, JPEG ou WebP, sons Ogg, MP3 ou WAV, lus dans leurs
  octets) ; la découpe, le détourage et **Prepare assets (on the server)** sont des jobs de l'application de
  traitement, sous le bail exclusif du projet, montrés dans un petit panneau avec un bouton **Cancel** (un job annulé
  avant son écriture ne laisse rien). La planche téléversée elle-même n'y est pas gardée. Voir docs/fr/STUDIO-SERVER.md.
## Mode démo
Le Studio tourne aussi sans aucun serveur, sur un hébergement statique : https://wanoo.github.io/web-scumm/studio.html
est le Studio du jeu d'exemple, construit par la CI. Même interface, même vue du moteur et même éditeur de placement ;
les modifications restent dans le navigateur.

- **Build** : `npm run build:studio-demo` (= `cross-env STUDIO=1 VITE_STUDIO_DEMO=1 vite build`) ; la CI pose les deux
  variables sur son `npm run build`. Avec `STUDIO=1`, le build écrit d'abord `public/studio-demo/snapshot.json`
  (`tools/studio/snapshot.ts`, aussi `npm run studio-snapshot` ; ignoré par git) : `{ game, rooms: { <id>: { def,
  layout, texts, file } }, storyboard, notes, docs: { CONTENT_GUIDE }, assets }`, tout ce que le Studio lit dans
  l'API. Sans `STUDIO=1`, ni `studio.html` ni l'instantané n'atteignent `dist/`. Le code du Studio et des outils de dev
  va dans `dist/assets/tools/`, hors du précache du service worker.
- **Backend** : `src/studio/api.ts` définit l'interface `Api` ; celle du serveur de dev est la valeur par défaut. Celle
  du navigateur (`src/studio/api-browser.ts`) sert quand le build le dit (`VITE_STUDIO_DEMO=1`) ou quand `GET
  /__studio/api/game` répond 404 (ou une page à la place du JSON). Elle charge l'instantané et rejoue les
  modifications gardées dans `localStorage` sous `web-scumm.studio-demo.<game>` : une liste de patchs `{ kind:
  'text', room, path, value }` (remplacement, `[+]` ajout, `null` suppression, avec les mêmes décalages de chemin que
  le fichier de la pièce), `{ kind: 'layout', room, layout }`, `{ kind: 'entity', room, entity }` (Add prop / hotspot /
  actor), `{ kind: 'storyboard', storyboard }`, `{ kind: 'note', note }`, `{ kind: 'note-edit', id, text, about?,
  edited }`, `{ kind: 'note-delete', id }`. Un layout ou un storyboard plus récent remplace le précédent ; modifier ou
  supprimer une note ajoutée en démo réécrit son patch `note`.
- **Vérifications** : Validate et Solve tournent dans la page (`src/engine/tools/validate.ts`, `solve.ts`) sur le vrai
  module du jeu avec les modifications appliquées : layouts, entités ajoutées, et chaque texte dont le chemin atteint
  une chaîne de la pièce compilée (lignes look, noms, indices, sujets, lignes de `on`/`talk`/`onEnter`…). Un texte que
  la pièce construit par du code (une constante partagée, une fonction) n'est validé que dans la version serveur. Les
  captures d'écran demandent le serveur de dev : le panneau est caché. Export Markdown télécharge `storyboard.md`.
  Pas d'événements (rien sur disque à surveiller).
- **Vue du moteur** : dans un build démo, les outils de dev se chargent aussi avec `?edit` / `?dev` (et seulement
  alors : le jeu du joueur est le même). Ils appliquent les mêmes patchs au jeu et aux layouts au démarrage. Save
  layout dans l'éditeur envoie le layout au Studio qui l'entoure (`postMessage`, message `saved` avec `layout`), qui
  le garde comme patch `layout` ; l'éditeur ouvert seul écrit le patch dans `localStorage` lui-même. Sur le serveur de
  dev, l'éditeur écrit `layout/<room>.json` par l'API du Studio (`PUT /__studio/api/room/<id>/layout`, une opération
  gardée du journal depuis 4.2.1) ; il se rabat sur le patch seulement quand cette API n'existe pas.
- **Bandeau** : « Demo: your edits stay in this browser », **Download patch** (`studio-patch-<game>.json` : `{ format:
  'web-scumm-studio-patch', version, game, created, patches }`) et **Reset demo** (abandonne chaque modification).
- **Appliquer** : `npm run studio-apply patch.json` rejoue un patch téléchargé sur votre copie à travers le cœur
  (`setText`, `setLayout`, `addEntity`, `setStoryboard`, `addNote`, `editNote`, `deleteNote`, dans l'ordre) et imprime
  une ligne par patch et un résumé ; un patch qui échoue est signalé, les autres s'appliquent quand même (code de
  sortie 1 si l'un a échoué). `GAME=<id>` ou `GAME_DIR=<dossier>` choisissent le jeu, comme pour chaque outil.
## Assistant
Le bouton **Assistant** de la barre du haut (ou la touche `a` quand aucun champ n'a le focus) ouvre un tiroir à droite
où l'on demande à un modèle de conversation d'aider à compléter le jeu. Il marche avec n'importe quel fournisseur, et il
a les mêmes outils que le serveur MCP (`list_rooms`, `get_room`, `set_text`, `add_entity`, `set_layout`,
`get_storyboard`, `set_storyboard`, `get_notes`, `add_note`, `validate`, `solve`, `screenshot`, `read_doc`,
`run_tests`, `asset_prompts`). Un seul registre, `tools/studio/tools.ts`, les définit (nom, description, schéma zod,
handler sur un backend), et le serveur MCP comme l'Assistant s'en servent.

- **Comment ça marche.** La page envoie la conversation à `POST /__studio/api/assistant/chat` avec `{ provider: {
  kind, baseUrl, model, apiKey? }, messages: [{ role, content }], context }`. Le relais (`tools/studio/assistant.ts`,
  boucle dans `tools/studio/assistant-loop.ts`) construit un prompt système à partir d'`AGENTS.md`, du jeu (pièces,
  personnages, objets, checkpoints) et de la sélection courante avec ses textes. Il appelle le modèle, exécute les
  appels d'outils sur les fichiers du jeu (12 tours au plus), et renvoie des événements SSE : `{ type: 'text', delta
  }`, `{ type: 'tool_call', id, name, args }`, `{ type: 'tool_result', id, name, result, isError? }` (résultat coupé à
  4 Ko), `{ type: 'error', message }`, puis `{ type: 'done', usage?, wrote?, stopped? }`. Le modèle a pour consigne de
  demander avant un changement destructif et de garder la voix du jeu. **Stop** interrompt la requête, et le serveur
  interrompt aussi l'appel au fournisseur.
- **Contexte.** Le composeur montre sur quoi porte la demande : `house › pantry (prop)` (la pièce et l'entité
  sélectionnées dans Rooms), `storyboard › <board> › <panel> (panel)` (le panneau sélectionné, tel qu'édité, même non
  enregistré), ou le jeu entier. Les actions rapides s'en servent : *Write 3 look lines*, *Suggest a puzzle for this
  room*, *Write the talk topics for this character*, *Find what's missing (validate + solve)*, *Draft the hint chain*,
  *Generate the art prompts for this sheet*.
- **La conversation.** Les réponses sont rendues en markdown léger (paragraphes, listes, code). Chaque appel d'outil
  est une puce que l'on déplie pour voir ses arguments et son résultat. **New chat** repart de zéro. Les tours
  précédents sont renvoyés sous forme de texte seulement. Après un tour qui a écrit quelque chose, le Studio recharge
  la pièce, le storyboard (un bandeau s'il a des modifications non enregistrées) ou les notes, et relance Check. Le
  surveillant de fichiers montre les mêmes changements.
- **Fournisseurs** (icône d'engrenage). *OpenAI* (`https://api.openai.com`), *Anthropic* (`https://api.anthropic.com`,
  modèle par défaut `claude-sonnet-5`), *Ollama* (`http://localhost:11434`, `llama3.1`, sans clé ; choisir un modèle qui
  gère les outils), *Mistral* (`https://api.mistral.ai`), ou *Custom* : toute base URL compatible OpenAI. Deux formats
  de câble, pas de SDK : `POST <base>/v1/chat/completions` compatible OpenAI avec `tools` et `stream: true` (OpenAI,
  Mistral, Ollama, la plupart des autres), et `POST <base>/v1/messages` d'Anthropic avec `tools`, `x-api-key` et
  `anthropic-version: 2023-06-01`. Les réponses en flux sont lues comme des événements SSE. Un fournisseur qui répond
  en JSON simple marche aussi.
- **Sûreté de la clé.** La clé n'est gardée que dans le `localStorage` de ce navigateur (les réglages l'avertissent)
  et envoyée à chaque requête. Le relais la garde en mémoire le temps de la requête : jamais écrite sur disque, jamais
  journalisée, retirée des messages d'erreur. Utilisez une clé à plafond de dépense ; « Forget the key » la retire.
- **Sans clé : des tâches pour un agent MCP.** Sans clé (et hors Ollama), le composeur propose **Send as a task to the
  AI agent**. `POST /__studio/api/assistant/task` `{ about, text }` ajoute une note avec `author: "you"` et `task:
  true` à `notes.json`, à propos de la sélection courante. Un agent connecté en MCP (`docs/fr/MCP.md`) la lit avec
  `get_notes` et fait le travail, et le Studio montre ses modifications en direct. L'onglet Notes étiquette ces notes
  « task ».
- **Mode démo.** Pas de relais sur un hébergement statique : la page exécute la même boucle elle-même, avec les outils
  sur le backend navigateur (modifications gardées comme patchs de démo ; `screenshot`, `run_tests` et `asset_prompts`
  ne sont pas disponibles, et `read_doc` n'a que CONTENT_GUIDE). Le navigateur appelle le fournisseur directement.
  Anthropic reçoit son en-tête `anthropic-dangerous-direct-browser-access`. OpenAI refuse les appels depuis un
  navigateur d'origine inconnue pour certaines clés, et l'erreur le dit. Utilisez Ollama sur votre machine
  (`OLLAMA_ORIGINS=<l'origine de la page> ollama serve`) ou le Studio local (`npm run studio`), dont le serveur relaie
  l'appel. Les tâches vont dans les notes de la démo (et son patch).
## N'importe quelle IA, pas une seule IA
- `AGENTS.md` à la racine du dépôt est le manuel d'exploitation neutre vis-à-vis du fournisseur (`CLAUDE.md` y
  renvoie).
- `npm run mcp` démarre un serveur [Model Context Protocol](https://modelcontextprotocol.io) (stdio) qui expose
  l'API ci-dessus comme des outils : `list_rooms`, `get_room`, `set_layout`, `set_text`, `add_entity`,
  `get_storyboard`, `set_storyboard`, `get_notes`, `add_note`, `validate`, `solve`, `screenshot`. Claude Code,
  Cursor, Codex, Gemini CLI, ou un agent écrit à la main s'y connectent de la même façon (`docs/fr/MCP.md` a la
  config en deux lignes pour chacun).
- Une IA sans MCP fonctionne quand même : elle modifie les fichiers, le Studio se recharge (surveillance des
  fichiers), l'humain voit le résultat, répond dans **Notes** ou dans le **Storyboard**, et l'IA relit `notes.json`.
  Git porte l'historique.
