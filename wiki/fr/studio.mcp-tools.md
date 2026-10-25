# Outils MCP

Chaque outil qu’un assistant IA peut appeler sur un jeu quest-n-click : le serveur MCP local, le MCP distant d’un Studio
hébergé et l’Assistant du Studio servent tous le même registre,
[`tools/studio/tools.ts`](../../tools/studio/tools.ts). Les sections des outils ci-dessous sont générées depuis ce
registre (`npm run wiki -- generate studio.mcp-tools`) ; le client MCP, lui, reçoit la description anglaise du code.

<a name="overview"></a>

## Où tournent les outils

- **Serveur MCP local, dépôt du moteur.** Depuis la racine du dépôt du moteur, `npm run -s mcp` lance le serveur sur
  stdio pour le jeu courant (`GAME=<id>`, ou `GAME_DIR=<dossier>` ; par défaut `package.json` → `config.game`). Son nom
  de serveur est `quest-n-click` ; il utilise le SDK `@modelcontextprotocol/sdk` 1.x
  ([`tools/mcp/server.ts`](../../tools/mcp/server.ts)). Mettez `-s` dans la configuration d’un client : sans lui, npm
  écrit sa bannière `> quest-n-click mcp` sur stdout, ce que les clients stricts refusent. La configuration de chaque
  client : [studio.mcp-setup](studio.mcp-setup.md).
- **Serveur MCP local, projet créé.** Depuis le dossier du projet, `npx quest-n-click mcp` (la commande
  [`quest-n-click mcp`](reference.cli.md#quest-n-click-mcp)) lance le même serveur pour le jeu du projet.
- **Un Studio hébergé.** `npm run mcp -- --server <url>` donne les mêmes outils sur un Studio Server, par son API avec
  le jeton de la CLI (`studio-server login --server <url>` d’abord) ; le Studio Server les sert aussi lui-même sur
  `/mcp`. Chaque écriture passe les contrôles de l’API. Voir [team.remote-mcp](team.remote-mcp.md).
- **L’Assistant du Studio** lance les mêmes outils dans sa propre boucle (serveur de dev, ou la démo dans le
  navigateur).

stdout ne porte que le protocole ; les journaux du serveur vont sur stderr. Une opération qui échoue (une salle
inconnue, un mauvais chemin, une modification cassée…) est une erreur d’outil avec son message, jamais un plantage : le
serveur continue de tourner.

<a name="how-to-read"></a>

## Lire la section d’un outil

- **Écrit** : si l’outil modifie un fichier du jeu. Le Studio surveille les fichiers : une personne voit le changement
  en direct dans `npm run studio`.
- **Requiert** : une capacité facultative du backend sur lequel tourne l’outil. Un backend qui ne l’a pas retire
  l’outil de la liste qu’il donne au client.
- **Indications MCP** : les `annotations` de l’outil telles que le client les reçoit (`readOnlyHint`,
  `destructiveHint`, `idempotentHint`).
- **Entrée** : les arguments, depuis le schéma zod de l’outil vu en JSON Schema ; un champ non requis peut être omis.

<a name="availability"></a>

## Les outils de chaque backend

| Backend | Outils absents |
|---|---|
| Serveur local (`npm run mcp`, `quest-n-click mcp`, l’Assistant du serveur de dev) : [`tools/studio/backend.ts`](../../tools/studio/backend.ts) | aucun |
| Un Studio hébergé (`npm run mcp -- --server <url>`, `/mcp`) : [`tools/studio/http-backend.ts`](../../tools/studio/http-backend.ts) | `screenshot`, `search_docs`, `list_docs`, `read_doc`, `run_tests`, `asset_prompts`, `speedrun_verify` |
| L’Assistant de la démo, dans le navigateur : [`src/studio/assistant.ts`](../../src/studio/assistant.ts) | chaque outil qui requiert une capacité, sauf les outils de documentation quand l’instantané de la démo contient les pages ; `set_value` répond qu’il lui faut le serveur de dev |

> [!LIMIT id=demo-writes]
> Dans la démo, les outils n’écrivent que dans la copie du visiteur, dans son navigateur, et `set_value` est refusé :
> les écritures structurées modifient le code de la salle avec l’analyseur TypeScript du serveur de dev.

<a name="tools"></a>

## Les outils

<!-- generated:begin -->

<a name="list-rooms"></a>

### `list_rooms`

**Vue d’ensemble du jeu.** Le jeu courant : id, titre, héros, salles (id, nom, décor), personnages, objets, verbes, points de reprise (des états de sauvegarde nommés, utilisables par solve et screenshot) et les ids d’images du manifeste des ressources avec leur taille. Lecture seule.

- Écrit : non (lecture seule).
- Indications MCP : `readOnlyHint: true`.

Entrée :

Aucun argument.

<a name="get-room"></a>

### `get_room`

**Lire une salle.** Une salle : `def` (le RoomDef tel qu’il est chargé : props, acteurs, zones, répliques de regard, réactions `on`, dialogues, indices, onEnter), `layout` (la géométrie de layout/&lt;id>.json), `texts` (chaque chaîne littérale modifiable avec son chemin JSON, sa valeur, son genre, sa ligne et son locuteur) et `file`. Le `path` d’un texte sert à set_text. Lecture seule.

- Écrit : non (lecture seule).
- Indications MCP : `readOnlyHint: true`.

Entrée :

| Champ | Type | Requis | Signifie |
|---|---|---|---|
| `id` | `string` | oui | Id de la salle, par exemple "house" (voir list_rooms). |

<a name="set-layout"></a>

### `set_layout`

**Écrire la mise en place d’une salle.** Remplace layout/&lt;id>.json par `layout` (l’objet Layout entier, de la forme que renvoie get_room : props, zones, acteurs, zone de marche, échelle, entrées…). Lisez d’abord la salle et ne changez que le nécessaire ; n’inventez jamais de coordonnées que la personne ne vous a pas données.

- Écrit : oui, il modifie un fichier du jeu (le Studio se rafraîchit ensuite).
- Indications MCP : `destructiveHint: true, idempotentHint: true`.

Entrée :

| Champ | Type | Requis | Signifie |
|---|---|---|---|
| `id` | `string` | oui | Id de la salle, par exemple "house" (voir list_rooms). |
| `layout` | `object` | oui | L’objet Layout complet. |

<a name="set-text"></a>

### `set_text`

**Modifier un texte d’une salle.** Modifie sur place une chaîne littérale de rooms/&lt;id>.ts, désignée par son chemin dans les `texts` de get_room (par exemple "look.pantry[1]", "on[3].do[0]", "talk.grandma[0].topic", "hints[2].lines[0]", "props.lamp.name"). `value` remplace la chaîne. `value: null` supprime une ligne d’une liste, ou un `look.<id>` entier. Un chemin qui finit par "[+]" ajoute une ligne : "look.piano[+]", "hints[2].lines[+]", "on[3].do[+]" (une chaîne seule dans une liste de commandes est une réplique du héros). Les ids, les références d’images, les drapeaux et les conditions ne sont pas des textes et sont refusés. Après un ajout ou une suppression, les chemins suivants se décalent : rappelez get_room. Résultat { ok, line, changed } (changed à false : la valeur y était déjà).

- Écrit : oui, il modifie un fichier du jeu (le Studio se rafraîchit ensuite).
- Indications MCP : `destructiveHint: true`.

Entrée :

| Champ | Type | Requis | Signifie |
|---|---|---|---|
| `id` | `string` | oui | Id de la salle, par exemple "house" (voir list_rooms). |
| `path` | `string` | oui | Chemin JSON du texte sous defineRoom({...}) ; peut finir par "[+]" pour ajouter. |
| `value` | `string \| null` | oui | Le nouveau texte, ou null pour supprimer. |

<a name="set-value"></a>

### `set_value`

**Écrire une valeur structurée dans une salle.** Écrit une valeur structurée (3.4) à un chemin de rooms/&lt;id>.ts, en code, dans le style du fichier : une réaction ("on[3]", ou "on[&lt;longueur>]" pour en ajouter une), une condition ("on[3].if"), une liste de commandes ("on[3].do", "onEnter"), la scène de la salle ("stage" : couches, lumières, émetteurs, transition, liens ; CONTENT_GUIDE « The stage »), son peintre ("renderer" : "dom" | "canvas"). Avec `id: "@game"`, le fichier du jeu à la place, pour ses objectifs seulement ("objectives.&lt;id>" : { title, done, optional?, parent? }, ou l’un de ses champs ; list_rooms les montre). `value` en est le JSON ; omettez-le (null) pour retirer le chemin. `dry: true` ne renvoie que le diff. Sinon le jeu est rechargé et validé après l’écriture : une modification qui ajoute une erreur de validation est annulée et refusée avec les erreurs. Résultat { ok, line, changed, diff }.

- Écrit : oui, il modifie un fichier du jeu (le Studio se rafraîchit ensuite).
- Indications MCP : `destructiveHint: true`.

Entrée :

| Champ | Type | Requis | Signifie |
|---|---|---|---|
| `id` | `string` | oui | Id de la salle, par exemple "house" (voir list_rooms). |
| `path` | `string` | oui | Chemin sous defineRoom({...}) : "stage", "renderer", "on[3]", "on[3].if", "on[3].do", "onEnter" ; avec l’id "@game" : "objectives.&lt;id>". |
| `value` | `any JSON \| null` | oui | La valeur en JSON (une condition, une liste de commandes, une scène…) ; null retire le chemin. |
| `dry` | `boolean` | non | Ne renvoyer que le diff, ne rien écrire. |

<a name="add-entity"></a>

### `add_entity`

**Ajouter un prop, une zone ou un acteur.** Ajoute une entrée à rooms/&lt;id>.ts (la section est créée si elle manque), sa première réplique de regard facultative, et une place dans la mise en place : le pied d’un prop en `at` (hauteur 60), une zone de 60 × 60 centrée sur `at`, les pieds d’un acteur en `at`. `name` est requis pour un prop et une zone ; `img` est un id d’image de prop (les images de list_rooms) ; `char` l’id du personnage d’un acteur. `at` vaut [320, 300] par défaut : demandez alors à la personne (add_note) de le faire glisser à sa place dans le Studio. 409 si l’id existe.

- Écrit : oui, il modifie un fichier du jeu (le Studio se rafraîchit ensuite).
- Indications MCP : `destructiveHint: false`.

Entrée :

| Champ | Type | Requis | Signifie |
|---|---|---|---|
| `id` | `string` | oui | Id de la salle, par exemple "house" (voir list_rooms). |
| `kind` | `"prop" \| "hotspot" \| "actor"` | oui |  |
| `entityId` | `string` | oui | L’id de la nouvelle entité (lettres, chiffres, _ et -). |
| `name` | `string` | non | Nom affiché. |
| `img` | `string` | non | Id d’image du prop. |
| `char` | `string` | non | Id du personnage de l’acteur. |
| `at` | `[number, number]` | non | [x, y] dans l’espace logique de la salle, 640 × 400. |
| `look` | `string` | non | Première réplique de regard. |

<a name="get-storyboard"></a>

### `get_storyboard`

**Lire le storyboard.** storyboard.json : { boards: [...] } avec les cases, les répliques, les indices et les sujets de dialogue. Le storyboard fait foi pour le texte : changez-le d’abord, puis les salles. Lecture seule.

- Écrit : non (lecture seule).
- Indications MCP : `readOnlyHint: true`.

Entrée :

Aucun argument.

<a name="set-storyboard"></a>

### `set_storyboard`

**Écrire le storyboard.** Remplace storyboard.json par `storyboard` (forcément { boards: [...] } ; envoyez l’objet entier tel que get_storyboard l’a lu, modifié). Écrit de façon compacte ; un storyboard inchangé n’est pas réécrit. Résultat { ok, changed }.

- Écrit : oui, il modifie un fichier du jeu (le Studio se rafraîchit ensuite).
- Indications MCP : `destructiveHint: true, idempotentHint: true`.

Entrée :

| Champ | Type | Requis | Signifie |
|---|---|---|---|
| `storyboard` | `{ boards }` | oui | Le storyboard entier. |

<a name="get-notes"></a>

### `get_notes`

**Lire les notes.** notes.json, le journal partagé entre la personne et l’IA : { entries: [{ id, about, author, text, at, task? }] }. La personne répond ici à vos questions ; les entrées avec `task: true` sont des demandes qu’elle vous adresse. Lecture seule.

- Écrit : non (lecture seule).
- Indications MCP : `readOnlyHint: true`.

Entrée :

Aucun argument.

<a name="add-note"></a>

### `add_note`

**Écrire une note à la personne.** Ajoute une note à notes.json (affichée dans l’onglet Notes du Studio). Servez-vous-en quand vous n’êtes pas sûr de ce que veut la personne, ou pour lui demander de placer quelque chose. `about` est un id de salle, un id de case, `salle.entité` ou du texte libre. `author` vaut par défaut le nom de votre client MCP.

- Écrit : oui, il modifie un fichier du jeu (le Studio se rafraîchit ensuite).

Entrée :

| Champ | Type | Requis | Signifie |
|---|---|---|---|
| `about` | `string` | non | Le sujet de la note. |
| `author` | `string` | non | Qui écrit (par défaut : le nom du client MCP, ou "ai"). |
| `text` | `string` | oui | La note. |

<a name="validate"></a>

### `validate`

**Valider le jeu.** Vérifications statiques : ids cassés, répliques de regard manquantes, drapeaux jamais posés ou jamais lus, paramètres des mini-jeux. Résultat { ok, errors, warnings, ms }. À lancer après chaque changement de contenu.

- Écrit : non (lecture seule).
- Indications MCP : `readOnlyHint: true`.

Entrée :

Aucun argument.

<a name="solve"></a>

### `solve`

**Résoudre le jeu.** Explore les états du jeu pour prouver qu’on peut le finir, depuis Nouvelle partie ou depuis le point de reprise `from`. Résultat { status, exit, headline, mode, finished, states, truncated, path, roomsReached, flagsReached, itemsNeverUsed, unusedItems, deadEnds, softlocks, errors, from, ms }. `status`/`exit`/`headline` sont exactement ce qu’affiche `npm run solve` (0 résolu, 2 tronqué : rien n’est prouvé, 1 un bug à corriger). `prove: true` lance la recherche exhaustive (les impasses au complet). `profile: true` ajoute pourquoi la recherche est lente ou grosse.

- Écrit : non (lecture seule).
- Indications MCP : `readOnlyHint: true`.

Entrée :

| Champ | Type | Requis | Signifie |
|---|---|---|---|
| `from` | `string` | non | Id du point de reprise (les checkpoints de list_rooms). |
| `profile` | `boolean` | non | Ajouter le profil du solveur en texte : de quoi sont faits les états, ce qu’a coûté la recherche, les dimensions indépendantes, ce qui ne fait qu’augmenter. |
| `prove` | `boolean` | non | Recherche exhaustive : chaque état atteignable et les impasses (lente sur un gros jeu ; par défaut, le témoin rapide). |
| `reality` | `"closed" \| "adversarial" \| { scenario, signals }` | non | Un jeu avec reality.signals (4.1.1) : le monde dans lequel résoudre. `closed` (par défaut) aucun signal, un scénario { scenario, signals } dans cet ordre, `adversarial` n’importe quel signal déclaré à n’importe quel moment. Une simulation : aucun service n’est contacté. |

<a name="content-report"></a>

### `content_report`

**Profileur de contenu.** Profileur de game design, en Markdown : par salle (zones, props, acteurs, sorties, règles, sujets, indices, scripts ; ce qui n’a pas de réplique de regard, les verbes qui n’obtiennent que des réponses par défaut, les props qui ne changent jamais), par objet (où on l’obtient, combien de règles l’utilisent, s’il est consommé), par personnage (salles, sujets, répliques, sujets inaccessibles), les salles inaccessibles et les sorties sans retour. À lire pour décider quoi écrire ensuite. Lecture seule.

- Écrit : non (lecture seule).
- Requiert : la capacité `report` du backend : un backend qui ne l’a pas (la démo, un Studio hébergé sans cette route) ne propose pas l’outil.
- Indications MCP : `readOnlyHint: true`.

Entrée :

Aucun argument.

<a name="get-ir"></a>

### `get_ir`

**Le jeu tel que le voient les outils.** La représentation intermédiaire du jeu (4.1.12) : salles, entités, règles, sujets, écouteurs, scripts, objectifs, politiques Reality et extensions de confiance par leur nom, chaque id avec le fichier et la ligne qui l’écrivent (`provenance`). Le même JSON que `npm run ir -- --json`. Lecture seule.

- Écrit : non (lecture seule).
- Requiert : la capacité `ir` du backend : un backend qui ne l’a pas (la démo, un Studio hébergé sans cette route) ne propose pas l’outil.
- Indications MCP : `readOnlyHint: true`.

Entrée :

Aucun argument.

<a name="world-graph"></a>

### `world_graph`

**Carte du monde.** Les salles et les passages entre elles (sorties déclarées, commandes goto, lieux de la carte) en graphe DOT, avec les salles inaccessibles et les sorties sans retour. Lecture seule.

- Écrit : non (lecture seule).
- Requiert : la capacité `graph` du backend : un backend qui ne l’a pas (la démo, un Studio hébergé sans cette route) ne propose pas l’outil.
- Indications MCP : `readOnlyHint: true`.

Entrée :

Aucun argument.

<a name="dialogue-tree"></a>

### `dialogue_tree`

**Arbre de dialogue.** La conversation d’un personnage dans une salle en arbre indenté : sujets (avec leurs conditions), répliques, choix et leurs options, embranchements. Dérivé des sujets de dialogue, rien d’autre à tenir à jour. Lecture seule.

- Écrit : non (lecture seule).
- Indications MCP : `readOnlyHint: true`.

Entrée :

| Champ | Type | Requis | Signifie |
|---|---|---|---|
| `id` | `string` | oui | Id de la salle. |
| `actor` | `string` | non | Id de l’acteur (par défaut : chaque personnage qui a des sujets). |

<a name="puzzle-graph"></a>

### `puzzle_graph`

**Graphe des énigmes.** Ce dont chaque règle, sujet, script et écouteur a besoin (conditions, objets) et ce qu’il change (objets, drapeaux, props, lieux, événements). Sans `id` : la vue d’ensemble en Markdown (chaque objet et drapeau avec ce qui le produit et l’utilise, les drapeaux lus mais jamais posés, ce qui est produit mais jamais utilisé). Avec `id` (un objet, un drapeau, un prop, un lieu ou un événement) : sa fiche : obtenu par, consommé par, utilisé par, requiert d’abord, débloque, en aval. À lire avant de modifier une énigme. Lecture seule.

- Écrit : non (lecture seule).
- Requiert : la capacité `puzzle` du backend : un backend qui ne l’a pas (la démo, un Studio hébergé sans cette route) ne propose pas l’outil.
- Indications MCP : `readOnlyHint: true`.

Entrée :

| Champ | Type | Requis | Signifie |
|---|---|---|---|
| `id` | `string` | non | Un id d’objet, de drapeau, de prop (salle.prop), de lieu ou d’événement ; aucun pour la vue d’ensemble. |

<a name="storyboard-coverage"></a>

### `storyboard_coverage`

**Couverture du storyboard.** Le storyboard (get_storyboard) confronté au contenu, en Markdown : par planche et par case, si sa salle, ses locuteurs, ses répliques, ses sujets de dialogue, ses sons et ses actions ("Open the armchair", "Use pipe with tank") existent dans le jeu : ok, partiel (les pièces existent, aucune règle ne répond ; une réplique proche), manquant, ou inconnu (de la prose). À lire pour trouver ce qui, de l’histoire, n’est pas encore implémenté. Lecture seule.

- Écrit : non (lecture seule).
- Requiert : la capacité `coverage` du backend : un backend qui ne l’a pas (la démo, un Studio hébergé sans cette route) ne propose pas l’outil.
- Indications MCP : `readOnlyHint: true`.

Entrée :

Aucun argument.

<a name="playtests"></a>

### `playtests`

**Sessions de test.** Les sessions que des joueurs ont partagées depuis leur téléphone (games/&lt;id>/playtests/*.session.json, des ids seulement) rejouées sur le contenu courant et résumées, en Markdown : le temps par salle, où les joueurs piétinent (la même action encore et encore, sans effet), les indices montrés, où ils se sont arrêtés, les mini-jeux joués, les sessions que le contenu a dépassées. À lire pour savoir où le jeu est plus dur que vous ne le pensez. Lecture seule.

- Écrit : non (lecture seule).
- Requiert : la capacité `playtests` du backend : un backend qui ne l’a pas (la démo, un Studio hébergé sans cette route) ne propose pas l’outil.
- Indications MCP : `readOnlyHint: true`.

Entrée :

Aucun argument.

<a name="lint"></a>

### `lint`

**Lint du contenu.** Ce que le validateur ne peut pas dire et que le solveur ne dit pas assez fort, en Markdown : les conditions que rien ne peut satisfaire, les règles qu’une autre cache, les objets dont aucune règle n’a besoin ou que rien ne donne, les indices qui ne peuvent pas se déclencher, les choix avec une option morte et, d’après une recherche du solveur, les actions vivantes jamais lancées et les salles jamais atteintes. Chaque constat nomme son chemin dans le contenu, son id stable et ce qu’il faut faire. `prove: true` lance d’abord la recherche exhaustive (lente sur un gros jeu). À lire avant de demander une relecture à une personne. Lecture seule.

- Écrit : non (lecture seule).
- Requiert : la capacité `lint` du backend : un backend qui ne l’a pas (la démo, un Studio hébergé sans cette route) ne propose pas l’outil.
- Indications MCP : `readOnlyHint: true`.

Entrée :

| Champ | Type | Requis | Signifie |
|---|---|---|---|
| `prove` | `boolean` | non | Lancer d’abord la preuve exhaustive (par défaut : le témoin rapide). |

<a name="screenshot"></a>

### `screenshot`

**Capturer une salle.** Dessine une salle (à un point de reprise, au choix) avec le vrai moteur, par le serveur de dev lancé (par défaut http://localhost:5173/, variable WEB_SCUMM_DEV_URL ; démarrez-le avec npm run studio ou npm run dev) et Playwright. Renvoie le chemin du PNG (relatif au dépôt) à ouvrir et regarder, ou une explication quand ce n’est pas possible.

- Écrit : non (lecture seule).
- Requiert : la capacité `screenshot` du backend : un backend qui ne l’a pas (la démo, un Studio hébergé sans cette route) ne propose pas l’outil.
- Indications MCP : `readOnlyHint: true`.

Entrée :

| Champ | Type | Requis | Signifie |
|---|---|---|---|
| `room` | `string` | oui | Id de la salle, par exemple "house" (voir list_rooms). |
| `checkpoint` | `string` | non | Id du point de reprise. |

<a name="search-docs"></a>

### `search_docs`

**Chercher dans la documentation.** Cherche dans les pages de la documentation (le wiki écrit sous wiki/, 4.5.0) par mots, en français ou en anglais : d’abord les titres et les questions des pages, puis les alias, les mots-clés et les identifiants (une commande du DSL, un script npm, un code HTTP comme 423), puis les titres de section, puis le texte des sections. Ni les accents ni la casse ne comptent ; le glossaire ajoute les mots de l’autre langue (verrou, lease). Chaque résultat est `id#section` avec son titre, son type, son contexte, ses versions, son statut, son score, la raison de la correspondance et un extrait avec les mots trouvés en gras : lisez-le avec read_doc { id, section }. Sans correspondance sûre, la liste est vide et donne les pages d’index à essayer. `version` écarte ce qui ne s’applique pas à cette version. Lecture seule.

- Écrit : non (lecture seule).
- Requiert : la capacité `docs` du backend : un backend qui ne l’a pas (la démo, un Studio hébergé sans cette route) ne propose pas l’outil.
- Indications MCP : `readOnlyHint: true`.

Entrée :

| Champ | Type | Requis | Signifie |
|---|---|---|---|
| `query` | `string` | oui | Des mots ou une question, en français ou en anglais. |
| `lang` | `"en" \| "fr"` | non | Seulement les pages dans cette langue (par défaut : les deux). |
| `audience` | `"player" \| "author" \| "admin" \| "contributor"` | non |  |
| `context` | `"engine-repo" \| "created-project" \| "studio-local" \| "studio-demo" \| "studio-hosted" \| "bridge" \| "player"` | non |  |
| `version` | `string` | non | Une version du produit (4.5.0) : seulement ce qui s’y applique. |
| `type` | `"tutorial" \| "howto" \| "reference" \| "explanation" \| "troubleshooting" \| "index"` | non |  |
| `includeArchived` | `boolean` | non | Aussi les pages dépréciées et archivées, et avec `version` les pages qui ne s’y appliquent pas, marquées comme telles. |
| `limit` | `integer 1..20` | non | Résultats par réponse (5 par défaut, 20 au plus). |
| `cursor` | `string` | non | Le `cursor` d’une réponse précédente à la même demande, pour la suite. |

<a name="list-docs"></a>

### `list_docs`

**Lister les pages de la documentation.** Les pages de la documentation qu’il y a à lire (wiki/, 4.5.0), filtrées par public, contexte, type, langue ou état : id, titre, type, public, contexte, versions, état, langues et ids de section. Une page encore à écrire n’est pas listée. Lecture seule.

- Écrit : non (lecture seule).
- Requiert : la capacité `docs` du backend : un backend qui ne l’a pas (la démo, un Studio hébergé sans cette route) ne propose pas l’outil.
- Indications MCP : `readOnlyHint: true`.

Entrée :

| Champ | Type | Requis | Signifie |
|---|---|---|---|
| `audience` | `"player" \| "author" \| "admin" \| "contributor"` | non |  |
| `context` | `"engine-repo" \| "created-project" \| "studio-local" \| "studio-demo" \| "studio-hosted" \| "bridge" \| "player"` | non |  |
| `type` | `"tutorial" \| "howto" \| "reference" \| "explanation" \| "troubleshooting" \| "index"` | non |  |
| `lang` | `"en" \| "fr"` | non |  |
| `state` | `"draft" \| "ready"` | non | Les pages draft n’existent que dans le dépôt. |

<a name="read-doc"></a>

### `read_doc`

**Lire une page de la documentation.** Lit la documentation. Conseillé : search_docs, puis read_doc { id, section } pour la section trouvée (`lang` en ou fr, en par défaut ; `maxChars` 20000 par défaut, 100000 au plus, et un `cursor` pour la suite), avec en tête d’où vient le texte (version, commit, révision de la doc). `name` renvoie à la place une grande page historique d’un seul bloc, reconstruite à partir des sections de la documentation et peut-être abrégée : une section trop longue pour la borne de la page donne son titre, son premier paragraphe et le read_doc { id, section } qui renvoie la suite. Les noms : CONTENT_GUIDE (le format du jeu, le DSL des salles, des conditions et des commandes), ENGINE, TOOLS, STUDIO, WORKFLOW, AUDIO (musique et effets), UPGRADING (de v2 à v3), CLASSICS (les mécaniques célèbres du genre, chacune avec son DSL : à lire avant de demander une nouvelle commande) ; avec `name`, les autres arguments sont ignorés. Donnez `name` ou `id`, pas les deux. Lecture seule.

- Écrit : non (lecture seule).
- Requiert : la capacité `readDoc` du backend : un backend qui ne l’a pas (la démo, un Studio hébergé sans cette route) ne propose pas l’outil.
- Indications MCP : `readOnlyHint: true`.

Entrée :

| Champ | Type | Requis | Signifie |
|---|---|---|---|
| `name` | `"CONTENT_GUIDE" \| "ENGINE" \| "TOOLS" \| "STUDIO" \| "WORKFLOW" \| "AUDIO" \| "UPGRADING" \| "CLASSICS"` | non | Une des huit pages historiques, reconstruite et peut-être abrégée : une section longue renvoie à read_doc { id, section } pour la suite (les autres arguments sont alors ignorés). |
| `id` | `string` | non | Un id de page venu de search_docs ou de list_docs, par exemple "create.rooms". |
| `section` | `string` | non | Un id de section de cette page (son `<a name>`), par exemple "walkable-zones". |
| `lang` | `"en" \| "fr"` | non | La langue de la page (en par défaut). |
| `cursor` | `string` | non | Le `cursor` de la réponse précédente, pour la suite du texte. |
| `maxChars` | `integer 1..100000` | non | Au plus ce nombre de caractères par réponse (20000 par défaut). |

<a name="run-tests"></a>

### `run_tests`

**Lancer les tests.** Lance `npx vitest run` (les tests du moteur et la soluce du jeu) et renvoie les lignes de résumé et les échecs. Prend de quelques secondes à une minute. Lecture seule.

- Écrit : non (lecture seule).
- Requiert : la capacité `runTests` du backend : un backend qui ne l’a pas (la démo, un Studio hébergé sans cette route) ne propose pas l’outil.
- Indications MCP : `readOnlyHint: true`.

Entrée :

Aucun argument.

<a name="asset-prompts"></a>

### `asset_prompts`

**Prompts d’images.** Les prompts pour modèle d’image des graphismes du jeu (comme `npm run prompts`) : un bloc STYLE, puis un prompt prêt à coller par planche (personnages avec les rangées de poses du moteur et les poses spéciales, kits de bouches, planches d’objets case par case, décors avec LOCATION et EMPTY SPOTS, mobilier) et une liste de contrôle pour les découper et les importer. Transmettez les sections telles quelles à la personne ; n’écrivez jamais un prompt de sprite à la main. `missing: true` ne garde que les planches dont des images ne sont pas encore découpées. Renvoie le Markdown, et { missing, sheets } en contenu structuré. Lecture seule.

- Écrit : non (lecture seule).
- Requiert : la capacité `assetPrompts` du backend : un backend qui ne l’a pas (la démo, un Studio hébergé sans cette route) ne propose pas l’outil.
- Indications MCP : `readOnlyHint: true`.

Entrée :

| Champ | Type | Requis | Signifie |
|---|---|---|---|
| `missing` | `boolean` | non | Seulement les planches qui ont au moins une image manquante, et seulement leurs cases manquantes. |

<a name="speedrun-verify"></a>

### `speedrun_verify`

**Vérifier un speedrun.** Rejoue une enveloppe de speedrun (.wsrun, 4.1.14) contre le jeu courant : recharge les règles exactes de sa catégorie, rejoue ses entrées avec sa graine, recalcule le temps de jeu, les splits, l’état final et la chaîne de hachage, et vérifie les règles de la catégorie. Renvoie { verdict, code, reason, trust } : `valid` est le seul verdict classable, `inconclusive` n’est jamais valide, et un vérificateur accorde au plus `replay-valid`. Donnez le chemin du fichier dans le projet du jeu, ou le texte de l’enveloppe. Lecture seule.

- Écrit : non (lecture seule).
- Requiert : la capacité `speedrunVerify` du backend : un backend qui ne l’a pas (la démo, un Studio hébergé sans cette route) ne propose pas l’outil.
- Indications MCP : `readOnlyHint: true`.

Entrée :

| Champ | Type | Requis | Signifie |
|---|---|---|---|
| `path` | `string` | non | Chemin du fichier .wsrun, relatif au dépôt ou au projet. |
| `envelope` | `string` | non | Le texte du .wsrun lui-même (au lieu d’un chemin). |

<!-- generated:end -->

<a name="resources"></a>

## Ressources

Le serveur local donne aussi deux ressources, en JSON : `webscumm://game` (comme `list_rooms`) et
`webscumm://room/<id>` (comme `get_room`). Elles gardent le schéma de l’ancien nom, `webscumm://`.

<a name="errors"></a>

## Erreurs

- Un outil qui échoue renvoie une erreur d’outil, `isError: true`, dont le texte est `Error: <message>`, avec
  ` (status <n>)` quand l’opération porte un statut HTTP (un id qui existe déjà donne 409, une modification qui
  ajouterait des erreurs de validation 422 : voir [reference.error-codes](reference.error-codes.md#studio)).
- Des arguments qui ne correspondent pas à l’entrée d’un outil sont refusés avant qu’il tourne :
  `bad arguments for <tool>: <field>: <why>`.
- Un outil inconnu, ou absent du backend : `no such tool: <name>`.
- `search_docs`, `list_docs` et `read_doc` nomment un curseur périmé `stale_cursor` dans leur contenu structuré.

<a name="related"></a>

## Voir aussi

- [studio.api](studio.api.md) : les routes HTTP derrière les mêmes opérations.
- [reference.cli](reference.cli.md#quest-n-click-mcp) : la commande `quest-n-click mcp`.
