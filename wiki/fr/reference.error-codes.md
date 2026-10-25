# Codes et messages d'erreur

Ce que veut dire un code ou un message d'erreur de quest'n'click : les statuts HTTP de l'API du Studio (le serveur de
dev local et le Studio Server hébergé), les codes du Reality Bridge, les statuts du solveur et les codes de sortie des
commandes qui vérifient un jeu. Cherchez dans cette page le code exact ou le début du message reçu : un message dont une
partie est remplie à l'exécution s'écrit avec `…` à cet endroit.

<a name="quick-entry"></a>

## Accès rapide, par ce que vous voyez

| Vous voyez… | Ce que cela veut dire | Que faire |
|---|---|---|
| `409` du Studio hébergé | [quelqu'un a changé la même chose avant vous](#studio-409) | [409 sur le Studio hébergé](team.write-refused-409.md) |
| `423` du Studio hébergé | [un autre membre tient cette partie du jeu](#studio-423) | [423 sur le Studio hébergé](team.write-refused-423.md) |
| `401` ou `403` du Studio | [pas connecté, ou pas autorisé](#studio-401) | [dépannage du Studio hébergé](clever.troubleshooting.md), [dépannage du Studio local](studio.troubleshooting.md) |
| `422` après un enregistrement dans le Studio | [le changement ajouterait une erreur de validation](#studio-422) | lisez ses `errors`, corrigez-les, enregistrez à nouveau |
| une erreur du Reality Bridge | [son statut et son code](#bridge) | [dépannage du Bridge](bridge.troubleshooting.md) |
| `npm run solve` sort avec 1 ou 2 | [aucun chemin jusqu’à la fin, ou une recherche tronquée](#exit-solve) | [vérifier son jeu](create.checking.md) |
| une autre commande sort en erreur | [ses codes de sortie](#exits) | la ligne de cette commande |

<a name="how-to-read"></a>

## Lire cette page

- **Une réponse HTTP du Studio** est du JSON, `{ "error": "<message>" }`, parfois avec d'autres champs (`errors` et
  `diff` pour un 422, `unavailable` et `reason` pour un 501, le pan et qui le tient pour un 423). Cherchez son statut
  sous [API du Studio](#studio), puis son message dans la liste sous le statut.
- **Une réponse HTTP du Bridge** est `{ "error": "<code>", "message": "<message>" }` : cherchez le statut et le code
  sous [Reality Bridge](#bridge).
- **Le code de sortie d'une commande** (dans un terminal, `echo $?` juste après ; en CI, le résultat de l'étape) : voir
  [Statuts du solveur](#solver) et [Codes de sortie des commandes de vérification](#exits).
- Les messages sont ceux du code, en anglais : une API répond en anglais quelle que soit la langue de la page. La
  plupart ont leur page de dépannage : [409 sur le Studio hébergé](team.write-refused-409.md), [423 sur le Studio
  hébergé](team.write-refused-423.md), [les 409 et 503 du Bridge](bridge.troubleshooting.md).

Les sections de « API du Studio » à « Codes de sortie des commandes de vérification » sont générées depuis le code et
depuis [`wiki/data/errors.json`](../../wiki/data/errors.json) (`npm run wiki -- generate reference.error-codes`, dans
le dépôt du moteur) : un statut que le code lève et que le registre ne décrit pas fait échouer `npm run wiki -- check`.

<a name="dev-server-answers"></a>

## Les réponses propres du serveur de dev

L'API du Studio local (`/__studio/api/*`, [`tools/studio/plugin.ts`](../../tools/studio/plugin.ts)) répond aussi, en
dehors des `StudioError` listées plus bas :

| Statut | Message | Quand |
|---|---|---|
| 404 | `no such endpoint: <path>` | aucune route n'a ce chemin |
| 405 | `method <METHOD> not allowed on <path>` | le chemin existe, avec une autre méthode |
| 404 | `no such screenshot` | `GET screenshots/<name>.png` d'une capture absente |
| 404 | `no such endpoint: assets<path>`, `no such file` | les routes de l'onglet Assets : une route inconnue, un fichier hors de `art/` et `audio/` |
| 405 | `method <METHOD> not allowed on assets<path>` | une route Assets avec une autre méthode |
| 413 | `body too large` | un corps de requête au-delà de la limite (l'onglet Assets prend jusqu'à 96 Mio) |
| 500 | le message de l'erreur | toute autre erreur levée : le serveur de dev écrit sa pile dans son terminal |

<a name="bridge-other-answers"></a>

## Les autres réponses du Bridge

En plus de ses `BridgeError`, le serveur du Bridge ([`bridge/src/server.ts`](../../bridge/src/server.ts)) répond :

| Statut | Corps | Quand |
|---|---|---|
| 503 | `{ "error": "busy", "message": "the store is busy: try again in a second" }`, avec `Retry-After: 1` | un autre processus a tenu le verrou d'écriture du store plus longtemps que la requête ne pouvait attendre ; rien n'a été écrit, renvoyez-la |
| 503 | `{ "status": "unavailable" }` | `GET /readyz` ou `/healthz` quand le store ne répond pas |
| 500 | `{ "error": "internal" }` | une erreur inattendue, journalisée en ligne JSON `{"event":"error", …}` sur sa sortie |
| 404 | `{ "error": "not found" }` | aucune route n'a cette méthode et ce chemin |

<!-- generated:begin -->

<a name="studio"></a>

## API du Studio (serveur de dev et Studio Server)

Chaque refus que le Studio lève en `StudioError`, par statut HTTP. La réponse est du JSON, `{ "error": "<message>" }` (parfois avec d’autres champs) ; les messages ci-dessous sont ceux du code, en anglais. `…` tient la place d’une partie remplie à l’exécution.

<a name="studio-400"></a>

### 400

Une requête mal formée : un champ absent ou du mauvais type, un id qui n’en est pas un, un corps qui n’est pas un objet JSON, un en-tête du Studio Server qui n’a pas sa forme. Rien n’a été écrit. Corrigez la requête comme le dit le message, puis renvoyez-la.

Messages :

- `2,000 revisions at most between from and to` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `` `about` must be a string `` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts), [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts))
- `` `after` is a revision number `` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `` `at` must be [x, y] `` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts), [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts))
- `` `cell` must be like r1c2, or pose/t1 in a talk kit `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `cells` is empty `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `cells` must be a list like r1c1,r2c3 `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `data` (base64) is required `` ([`studio-server/src/server/hosted-assets.ts`](../../studio-server/src/server/hosted-assets.ts), [`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `data` is empty or not base64 `` ([`studio-server/src/server/hosted-assets.ts`](../../studio-server/src/server/hosted-assets.ts), [`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `email` is required `` ([`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts))
- `` `file` must be a plain file name ending in … `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `good` and `bad` are revision numbers `` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `` `grid` must be COLSxROWS, e.g. 6x4 `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `id` must be letters, digits and _ (not starting with a digit) `` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts), [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts))
- `` `key` must be auto, always or never `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `kind` must be music or sfx `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `kind` must be prop, hotspot or actor `` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts), [`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts))
- `` `messages` must be a non-empty array `` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `` `name` is required for a prop or a hotspot `` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `` `name` must be letters, digits, _ and - `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `path` is a relative path of the game `` ([`studio-server/src/server/play.ts`](../../studio-server/src/server/play.ts))
- `` `path` is required `` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `` `provider.apiKey` must be a string `` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `` `provider.baseUrl` is not a valid URL `` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `` `provider.baseUrl` must be an http(s) URL `` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `` `provider.kind` must be openai, anthropic or ollama `` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `` `provider.model` is required `` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `` `resolved` is true or false `` ([`studio-server/src/server/comments.ts`](../../studio-server/src/server/comments.ts))
- `` `role` is owner, dev or reviewer `` ([`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts))
- `` `room` is required `` ([`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts))
- `` `sheetId` must be a sheet of art/ (not decor) `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `sheetId` must be letters, digits, _ and - (not "decor") `` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `` `span` names one span `` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `` `spans` is a list of span names (room:<id>, lang:<code>, game, items, …) `` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `` `text` is required `` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts), [`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `` `value` must be a string or null `` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `` `…` must be a string `` ([`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts))
- `a comment is a text of 1 to … characters` ([`studio-server/src/server/comments.ts`](../../studio-server/src/server/comments.ts))
- `a decor must be a PNG or a JPEG image` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `a logout token is form-encoded` ([`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts))
- `an anchor is a stable id of the game (letters, digits, . : @ - _)` ([`studio-server/src/server/comments.ts`](../../studio-server/src/server/comments.ts))
- `custom provider URLs are disabled (set WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1 to opt in)` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `custom providers must use HTTPS and cannot target local or private network hosts` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `each message is { role: "user" | "assistant", content: string }` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `from and to are revisions, from ≤ to` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `image not in the manifest: "…"` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `invalid checkpoint: "…"` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `invalid room id: "…"` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `logout_token is required` ([`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts))
- `malformed voice id "…"` ([`studio-server/src/ops/routes.ts`](../../studio-server/src/ops/routes.ts))
- `not a cell of a … grid: "…"` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `not a path in the game: "…"` ([`studio-server/src/ops/journal.ts`](../../studio-server/src/ops/journal.ts))
- `npm run assets only prepares a game under games/<id>/` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `provider URLs cannot contain credentials` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `ref must be a branch of the repository or a commit` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))
- `the body is a JSON object` ([`studio-server/src/server/play.ts`](../../studio-server/src/server/play.ts))
- `the body is not valid JSON` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts), [`tools/studio/assets.ts`](../../tools/studio/assets.ts), [`tools/studio/plugin.ts`](../../tools/studio/plugin.ts))
- `the body must be a JSON object` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts), [`tools/studio/assets.ts`](../../tools/studio/assets.ts), [`tools/studio/assistant.ts`](../../tools/studio/assistant.ts), [`tools/studio/plugin.ts`](../../tools/studio/plugin.ts))
- `the last message must be the user's` ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts))
- `the layout must be an object` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `the logout token is not valid` ([`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts))
- `the logout token was already used` ([`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts))
- `unknown character: "…"` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `unknown checkpoint: "…"` ([`studio-server/src/ops/diagnose.ts`](../../studio-server/src/ops/diagnose.ts))
- `x-studio-base must be a revision` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `x-studio-client must be 8 to 64 letters, digits, - or _` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `x-studio-fences is a JSON object of span → fence` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `x-studio-op must be 8 to 64 letters, digits, - or _` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- et 12 message(s) construit(s) à l’exécution.

<a name="studio-401"></a>

### 401

Pas connecté, ou des identifiants non valides : la session d’un Studio hébergé manque ou a expiré (la réponse peut porter `login: "/auth/login"`), le MCP distant ou les métriques sont arrivés sans leur jeton. Reconnectez-vous (`quest-n-click-studio-server login --server <url>` pour la CLI et le MCP).

Messages :

- `an access token is required` ([`studio-server/src/server/mcp.ts`](../../studio-server/src/server/mcp.ts))
- `the metrics need their token` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- et 2 message(s) construit(s) à l’exécution.

<a name="studio-403"></a>

### 403

Connecté, mais pas autorisé : pas membre de ce projet, un rôle trop bas pour l’action (un relecteur n’écrit rien), une requête d’une autre origine, une page du jeu ouverte hors d’une session de navigateur, un commentaire qui n’est pas le vôtre, une tâche lancée par quelqu’un d’autre. Demandez le rôle à un owner.

Messages :

- `a reviewer resolves their own threads` ([`studio-server/src/server/comments.ts`](../../studio-server/src/server/comments.ts))
- `forbidden` ([`studio-server/src/server/auth/gate.ts`](../../studio-server/src/server/auth/gate.ts))
- `not a member of this project` ([`studio-server/src/server/auth/gate.ts`](../../studio-server/src/server/auth/gate.ts))
- `only its author changes a comment's text` ([`studio-server/src/server/comments.ts`](../../studio-server/src/server/comments.ts))
- `only who started a job, or an owner, cancels it` ([`studio-server/src/server/jobs.ts`](../../studio-server/src/server/jobs.ts))
- `origin refused` ([`studio-server/src/server/auth/gate.ts`](../../studio-server/src/server/auth/gate.ts))
- `the game is opened from a browser session` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- et 1 message(s) construit(s) à l’exécution.

<a name="studio-404"></a>

### 404

Ce que la requête nomme n’existe pas : une salle, une note, une réplique, une révision, un build, une tâche, un fichier, un storyboard ; ou une fonction que ce Studio n’a pas (les builds publiés, les commentaires, la santé des révisions sont ceux d’un Studio hébergé ; préparer les assets, découper une planche ou mettre à jour le moteur demande son application de traitement ; Git demande `git` dans la configuration).

Messages :

- `comments are a shared Studio's` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `cutting a sheet needs the hosted Studio's processing worker` ([`studio-server/src/server/hosted-assets.ts`](../../studio-server/src/server/hosted-assets.ts))
- `no build …` ([`studio-server/src/server/builds.ts`](../../studio-server/src/server/builds.ts), [`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `no comment …` ([`studio-server/src/server/comments.ts`](../../studio-server/src/server/comments.ts))
- `no commit … in the repository` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))
- `no defineGame({...}) in the game folder` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `no job …` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts), [`studio-server/src/server/jobs.ts`](../../studio-server/src/server/jobs.ts))
- `no line "…" in the game` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `no revision … yet` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `no storyboard.json in this game` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `no such file` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `no such note: "…"` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `not found` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `preparing the assets needs a hosted Studio with its processing worker` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `published builds are a hosted Studio's` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `room "…" is not in the game (index.ts / game.ts)` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `the engine's upgrade needs a hosted Studio with its processing worker` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `the health of revisions is a hosted Studio's` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `this Studio has no Git repository (config git)` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `unknown room: "…"` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `… does not exist in the repository` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))

<a name="studio-409"></a>

### 409

Un conflit, rien d’écrasé : un fichier modifié depuis la révision que vous avez lue (la base périmée du Studio hébergé), un fichier modifié pendant que l’édition se préparait ou se vérifiait (réessayez), une annulation dont le fichier a changé depuis, un id qui existe déjà, des cases d’une planche qui existent déjà, une tâche déjà finie, un build d’une autre histoire du jeu, une branche Git qui a bougé, l’annulation sur un Studio partagé.

Messages :

- `"…" already exists in room "…"` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `build … belongs to another history of the game (an import or a restore since)` ([`studio-server/src/server/builds.ts`](../../studio-server/src/server/builds.ts))
- `build …: the revision's snapshot rebuilt from the journal is not the one published` ([`studio-server/src/server/builds.ts`](../../studio-server/src/server/builds.ts))
- `cannot … "…": the journal has no such operation` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `cannot … "…": … changed since` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `cannot … "…": … was written again at revision …` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `the job has already ended (…)` ([`studio-server/src/server/jobs.ts`](../../studio-server/src/server/jobs.ts))
- `too late: the job is writing its result` ([`studio-server/src/server/jobs.ts`](../../studio-server/src/server/jobs.ts))
- `undo is not available on this shared Studio` ([`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts))
- `… cell(s) of "…" already exist: name the cells to recut (cells), or upload into a new sheet id` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `… changed since revision … (now …)` ([`studio-server/src/ops/journal.ts`](../../studio-server/src/ops/journal.ts))
- `… changed while this edit was being checked; try again` ([`studio-server/src/ops/journal.ts`](../../studio-server/src/ops/journal.ts))
- `… changed while this edit was being prepared; try again` ([`studio-server/src/ops/journal.ts`](../../studio-server/src/ops/journal.ts))
- `… is not a file` ([`studio-server/src/ops/journal.ts`](../../studio-server/src/ops/journal.ts))
- `… moved while pushing: import it first, never forced` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))
- `…: the folder does not match the head; try again` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))

<a name="studio-413"></a>

### 413

Trop gros : un corps de requête au-delà de la limite de la route (`body too large`), un envoi au-delà de la taille du Studio hébergé, un import de plus de fichiers ou d’octets que le Studio n’en prend. Envoyez moins, ou découpez.

Messages :

- `an upload is … MiB at most` ([`studio-server/src/server/hosted-assets.ts`](../../studio-server/src/server/hosted-assets.ts))
- `body too large` ([`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts), [`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts), [`tools/studio/assets.ts`](../../tools/studio/assets.ts), [`tools/studio/assistant.ts`](../../tools/studio/assistant.ts), [`tools/studio/plugin.ts`](../../tools/studio/plugin.ts))
- `more than 64 MiB to import` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))
- `more than … files to import` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))

<a name="studio-415"></a>

### 415

Le mauvais type de contenu : une écriture qui n’est pas envoyée en JSON, un son sur un Studio hébergé qui n’est pas un fichier .ogg, .mp3 ou .wav, ou dont les octets disent autre chose.

Messages :

- `a sound on a hosted Studio is an .ogg, .mp3 or .wav file` ([`studio-server/src/server/hosted-assets.ts`](../../studio-server/src/server/hosted-assets.ts))
- `a write is sent as JSON` ([`studio-server/src/server/auth/gate.ts`](../../studio-server/src/server/auth/gate.ts))
- `the file is not … sound: its bytes say otherwise` ([`studio-server/src/server/hosted-assets.ts`](../../studio-server/src/server/hosted-assets.ts))

<a name="studio-422"></a>

### 422

Compris et refusé : l’édition ajouterait des erreurs de validation (la réponse les liste, avec le diff ; rien n’est écrit depuis la 4.2.1), un commit Git qui ne contient pas de jeu, ou un lien, ou un sous-module, des assets préparés qui perdraient des fichiers que le jeu avait, une découpe, une migration ou une mise à jour du moteur refusée par l’application de traitement.

Messages :

- `refused: the edit adds … validation error(s): …` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `refused: the prepared assets would lose … image(s) or sound(s) the game had (…): prepare them on a local Studio` ([`studio-server/src/server/prepared.ts`](../../studio-server/src/server/prepared.ts))
- `refused: …; nothing was written` ([`studio-server/src/server/engine-upgrade.ts`](../../studio-server/src/server/engine-upgrade.ts))
- `spans.json: not JSON (…)` ([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts))
- `spans.json: not a file` ([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts))
- `spans.json: … bytes, at most …` ([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts))
- `the commit holds no game at "…"` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))
- `the cut is refused: …` ([`studio-server/src/server/remote-executor.ts`](../../studio-server/src/server/remote-executor.ts))
- `the migration cannot run: …` ([`studio-server/src/server/remote-executor.ts`](../../studio-server/src/server/remote-executor.ts))
- `the migration is refused: …` ([`studio-server/src/server/remote-executor.ts`](../../studio-server/src/server/remote-executor.ts))
- `the prepared assets are refused: …` ([`studio-server/src/server/remote-executor.ts`](../../studio-server/src/server/remote-executor.ts))
- `… is a link or a submodule: not imported` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))
- `… is not a folder of the repository (a file, a link or a submodule): not read` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))
- `…: "…" is an engine file, its span is the engine's` ([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts))
- `…: "…" is not a path relative to the game folder` ([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts))
- `…: "…" names no span a client may take (…)` ([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts))
- `…: a key of … characters, at most …` ([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts))
- `…: an object { "<path>, <folder>/ or <glob>": "<span>" }` ([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts))
- `…: … entries, at most …` ([`studio-server/src/ops/spans.ts`](../../studio-server/src/ops/spans.ts))
- et 2 message(s) construit(s) à l’exécution.

<a name="studio-423"></a>

### 423

Un pan (une salle, une langue, le jeu…) est tenu par un autre membre d’un Studio hébergé, ou votre propre bail dessus a pris fin : la réponse nomme le pan et qui le tient ; votre brouillon est gardé.

Messages :

- `your lease on … ended or was taken again: take it again` ([`studio-server/src/server/leases.ts`](../../studio-server/src/server/leases.ts))

<a name="studio-429"></a>

### 429

Trop à la fois, réessayez plus tard : un build ou une préparation des assets est déjà en cours, la mise à jour du moteur tourne, trop de tâches attendent, trop de commentaires ouverts.

Messages :

- `a build is being made: try again when it is done` ([`studio-server/src/server/builds.ts`](../../studio-server/src/server/builds.ts))
- `the assets are being prepared: try again when it is done` ([`studio-server/src/server/prepared.ts`](../../studio-server/src/server/prepared.ts))
- `the engine's upgrade is running: try again when it is done` ([`studio-server/src/server/engine-upgrade.ts`](../../studio-server/src/server/engine-upgrade.ts))
- `too many jobs are waiting: try again when one is done` ([`studio-server/src/server/jobs.ts`](../../studio-server/src/server/jobs.ts))
- `… open comments at most each: resolve some first` ([`studio-server/src/server/comments.ts`](../../studio-server/src/server/comments.ts))

<a name="studio-500"></a>

### 500

Le jeu ou le Studio lui-même a échoué : le jeu ne se charge pas (une erreur de syntaxe, un ancien import `web-scumm/…`), un fichier JSON du jeu n’est pas valide, une édition casserait le fichier qu’elle écrit (refusée, rien d’écrit), une écriture sur un Studio partagé sans son auteur. Le serveur de dev écrit la pile dans son terminal.

Messages :

- `a write on a shared Studio says who writes` ([`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts))
- `no cell "…/…" after the write` ([`tools/studio/assets.ts`](../../tools/studio/assets.ts))
- `refused: the edit would break … (…)` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `the game does not load: …` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `…: invalid JSON (…)` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- et 1 message(s) construit(s) à l’exécution.

<a name="studio-501"></a>

### 501

Pas disponible ici : une capture ou les captures d’un diff sans Playwright ou son Chromium, ou sur un Studio hébergé (la réponse porte `unavailable: true` et `reason`) ; une politique Reality résolue sur un Studio hébergé (en local seulement).

Messages :

- `a reality policy is solved on a local Studio` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- et 2 message(s) construit(s) à l’exécution.

<a name="studio-502"></a>

### 502

Un service derrière le Studio Server a échoué : une commande `git` ou un push vers le dépôt du jeu.

Messages :

- `git …: …` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))
- `the push failed: …` ([`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts))

<a name="studio-503"></a>

### 503

Pas maintenant, rien de perdu : un autre processus écrit ce jeu, l’édition ne peut pas être jugée maintenant (la validation n’a pas pu tourner), ou le fournisseur d’identité d’un Studio hébergé ne répond pas (la session est suspendue). Réessayez.

Messages :

- `another process is writing this game; try again` ([`studio-server/src/ops/journal.ts`](../../studio-server/src/ops/journal.ts))
- `the edit cannot be judged now: …` ([`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts))
- `the identity provider cannot be reached: the session is suspended` ([`studio-server/src/server/auth/gate.ts`](../../studio-server/src/server/auth/gate.ts))

<a name="studio-504"></a>

### 504

L’application de traitement d’un Studio hébergé n’a pas répondu à temps (une préparation, une découpe, un diagnostic) : réessayez, ou faites-le sur un Studio local.

Messages :

- `…: the diagnostic is unknown for now` ([`studio-server/src/server/remote-executor.ts`](../../studio-server/src/server/remote-executor.ts))
- `…: try again` ([`studio-server/src/server/remote-executor.ts`](../../studio-server/src/server/remote-executor.ts))
- `…: try again, or cut it on a local Studio` ([`studio-server/src/server/remote-executor.ts`](../../studio-server/src/server/remote-executor.ts))
- `…: try again, or prepare on a local Studio` ([`studio-server/src/server/remote-executor.ts`](../../studio-server/src/server/remote-executor.ts))

<a name="bridge"></a>

## Reality Bridge

Chaque refus que le Bridge lève en `BridgeError`, par statut HTTP et code. La réponse est du JSON, `{ "error": "<code>", "message": "<message>" }`.

<a name="bridge-400-shape"></a>

### 400 `shape`

La requête n’est pas ce que la route lit : pas du JSON, un champ absent ou mal formé, un `through` que le Bridge n’a jamais envoyé, un id de révocation qui n’est pas hexadécimal, une livraison de webhook sans son `id`.

Messages :

- `` `id` names the delivery (deduplication) `` ([`bridge/src/server.ts`](../../bridge/src/server.ts))
- `` `through` is a sequence the Bridge sent `` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))
- `` `…` is missing or malformed `` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))
- `a revocation id is hex` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))
- `not JSON` ([`bridge/src/server.ts`](../../bridge/src/server.ts))

<a name="bridge-401-admin"></a>

### 401 `admin`

Une route d’opérateur (`/v1/admin/…`, comme l’appelle `quest-n-click-bridge revoke`) sans le jeton de l’opérateur (`admin-token` dans le dossier du Bridge).

Messages :

- `not the operator` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-401-capability"></a>

### 401 `capability`

Le lien du joueur avec le Bridge (sa capacité) est inconnu, révoqué, expiré ou trop vieux : le joueur s’apparie de nouveau.

Messages :

- `link expired: pair again` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))
- `link too old: pair again` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))
- `unknown or revoked link` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-401-revoked"></a>

### 401 `revoked`

Le jeton du connecteur a été révoqué pendant que son signal était proposé : accordez-en un nouveau (`quest-n-click-bridge grant`).

Messages :

- `token revoked` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-401-signature"></a>

### 401 `signature`

Une livraison de webhook dont la signature HMAC ne correspond pas au secret du webhook.

Messages :

- `bad webhook signature` ([`bridge/src/server.ts`](../../bridge/src/server.ts))

<a name="bridge-401-token"></a>

### 401 `token`

Un jeton de connecteur illisible, ou révoqué, sur une confirmation d’appariement ou un signal.

Messages :

- `token revoked` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))
- `unreadable token` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-403-denied"></a>

### 403 `denied`

Le jeton du connecteur est valide et ne permet pas ceci : il ne peut pas apparier (accordé sans `--pair`), ou son Biscuit ne permet pas ce signal, cette source ou ce joueur.

Messages :

- `this token may not pair (…)` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-404-game"></a>

### 404 `game`

Un appariement demandé pour un jeu que ce Bridge ne sert pas (son `gameId` est un autre).

Messages :

- `not a game of this Bridge` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-404-hook"></a>

### 404 `hook`

Aucun webhook de ce nom dans la configuration du Bridge.

Messages :

- `no such webhook` ([`bridge/src/server.ts`](../../bridge/src/server.ts))

<a name="bridge-404-pairing"></a>

### 404 `pairing`

Le code d’appariement est inconnu ou expiré : le joueur lance un nouvel appariement.

Messages :

- `unknown or expired code` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-404-player"></a>

### 404 `player`

Le joueur est inconnu de ce Bridge, ou a été révoqué (`quest-n-click-bridge revoke --player=…`, ou le joueur s’est délié).

Messages :

- `unknown or revoked player` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))
- `unknown player` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-404-tenant"></a>

### 404 `tenant`

Un Bridge qui sert plusieurs tenants n’en trouve aucun pour cette requête.

Messages :

- `no tenant here` ([`bridge/src/server.ts`](../../bridge/src/server.ts))

<a name="bridge-409-pairing"></a>

### 409 `pairing`

Le code d’appariement a déjà été confirmé, par ce connecteur ou un autre : le joueur est apparié, rien à refaire.

Messages :

- `already confirmed` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-410-pairing"></a>

### 410 `pairing`

L’appariement a déjà été réclamé : la capacité du joueur a été remise une fois et ne le sera plus ; appariez de nouveau depuis le jeu.

Messages :

- `already claimed` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-413-size"></a>

### 413 `size`

Le corps de la requête dépasse la limite du Bridge.

Messages :

- `a request body is at most … bytes` ([`bridge/src/server.ts`](../../bridge/src/server.ts))

<a name="bridge-422-event"></a>

### 422 `event`

Le webhook n’associe pas cet événement à un signal (sa configuration liste les événements qu’il connaît).

Messages :

- `this webhook does not know that event` ([`bridge/src/server.ts`](../../bridge/src/server.ts))

<a name="bridge-422-signal"></a>

### 422 `signal`

Le signal n’est pas dans le manifeste Reality du jeu.

Messages :

- `signal … is not in the game's manifest` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-422-source"></a>

### 422 `source`

Le signal est déclaré pour une autre source que le connecteur qui l’envoie.

Messages :

- `signal … comes from …` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-429-pairings"></a>

### 429 `pairings`

Trop de codes d’appariement attendent une confirmation : réessayez dans une minute.

Messages :

- `too many codes waiting for a confirmation: try again in a minute` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-429-pending"></a>

### 429 `pending`

Le joueur a trop de signaux en attente de livraison.

Messages :

- `the player has too many signals waiting` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-429-quota"></a>

### 429 `quota`

Trop de signaux cette minute pour le joueur (le quota par minute du Bridge).

Messages :

- `too many signals this minute` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="bridge-429-rate"></a>

### 429 `rate`

Trop de requêtes depuis cette adresse : la réponse porte `Retry-After: 60`.

Messages :

- `too many requests from this address: try again in a minute` ([`bridge/src/server.ts`](../../bridge/src/server.ts))

<a name="bridge-429-streams"></a>

### 429 `streams`

Trop de flux d’événements ouverts : pour ce joueur, ou pour cette instance du Bridge.

Messages :

- `at most … open streams for a player` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))
- `this instance holds as many streams as it may: try again` ([`bridge/src/bridge.ts`](../../bridge/src/bridge.ts))

<a name="solver"></a>

## Statuts du solveur

Le statut unique d’une recherche du solveur ou d’une preuve par chapitres ([`src/engine/tools/status.ts`](../../src/engine/tools/status.ts)) : la ligne de commande, son `--json`, l’onglet Vérifier du Studio et l’outil MCP `solve` le lisent tous.

| Statut | Code de sortie | Signifie |
|---|---|---|
| `solved` | 0 | La fin (ou le but) est atteinte : sur un chemin pour une recherche de témoin, depuis chaque état atteignable avec `--prove`. |
| `softlocks` | 1 | Certains états atteignables ne peuvent plus atteindre la fin : la sortie les liste avec le chemin vers chacun. |
| `unsolved` | 1 | La fin n’est atteinte depuis aucun des états explorés. |
| `truncated` | 2 | La recherche s’est arrêtée sur son budget (états `--max`, temps `--time`, mémoire `--mem`) : rien n’est prouvé ; augmentez le budget ou reprenez depuis le point de reprise. |
| `broken` | 1 | Un invariant du jeu est devenu vrai sur un état atteignable. |
| `error` | 1 | Le moteur a levé des erreurs pendant l’exploration. |
| `checkpoint_mismatch` | 1 | Une preuve par chapitres (`--prove --chapters`) : chaque chapitre est prouvé, mais un checkpoint écrit à la main n’est aucun des états frontières atteignables de son chapitre. |

<a name="exits"></a>

## Codes de sortie des commandes de vérification

Ce qu’un script ou un job de CI lit après la commande.

<a name="exit-validate"></a>

### `npm run validate`

[`tools/validate.ts`](../../tools/validate.ts).

| Code | Signifie |
|---|---|
| 0 | Aucune erreur (des avertissements peuvent s’afficher) ; `--report` sort toujours avec 0. |
| 1 | Au moins une erreur, listée après `✖`. |

<a name="exit-solve"></a>

### `npm run solve`

[`tools/solve.ts`](../../tools/solve.ts).

| Code | Signifie |
|---|---|
| 0 | `solved` ; aussi `--prove --chapters` sur un jeu qui ne déclare aucun chapitre. |
| 1 | Tout autre statut que `truncated` (`softlocks`, `unsolved`, `broken`, `error`, `checkpoint_mismatch`) ; avec `--audit-abstractions`, les deux recherches divergent. |
| 2 | `truncated` : rien de prouvé (avec `--audit-abstractions`, la recherche explicite a été tronquée) ; ou un `--goal` refusé (seulement `--goal=100%`, et seulement sur un jeu qui a un objectif non facultatif). |

<a name="exit-solve-reality"></a>

### `npm run solve:reality`

[`tools/solve-reality.ts`](../../tools/solve-reality.ts).

| Code | Signifie |
|---|---|
| 0 | Chaque monde prouvé (fermé, chaque scénario et replay, adversarial), ou un jeu sans `reality`. |
| 1 | Un monde échoue ; une recherche tronquée compte comme un échec. |

<a name="exit-lint"></a>

### `npm run lint`

[`tools/lint.ts`](../../tools/lint.ts).

| Code | Signifie |
|---|---|
| 0 | Aucun constat de gravité `error`, et la recherche du solveur n’a pas été tronquée. |
| 1 | Au moins un constat de gravité `error`. |

<a name="exit-doctor"></a>

### `npm run doctor`

[`tools/doctor.ts`](../../tools/doctor.ts).

| Code | Signifie |
|---|---|
| 0 | Chaque prérequis obligatoire est là (des optionnels peuvent manquer). |
| 1 | Un prérequis obligatoire manque ; avec `--release`, chaque prérequis de `npm run release-check` est obligatoire. |

<a name="exit-speedrun-verify"></a>

### `npm run speedrun:verify`

[`tools/speedrun/verify.ts`](../../tools/speedrun/verify.ts).

| Code | Signifie |
|---|---|
| 0 | Le verdict est `valid` ou `valid-unranked`. |
| 1 | Tout autre verdict, `inconclusive` compris : jamais valide. |
| 2 | Aucun fichier `.wsrun` nommé : la ligne d’usage s’affiche. |

<a name="exit-e2e-canonical"></a>

### `npm run e2e:canonical`

[`scripts/e2e-canonical.mjs`](../../scripts/e2e-canonical.mjs).

| Code | Signifie |
|---|---|
| 0 | Chaque navigateur écrit chaque valeur comme Node (ou un navigateur sauté avec `--allow-skip`, dit dans la sortie). |
| 1 | Un navigateur écrit une valeur autrement. |
| 3 | Un navigateur que Playwright ne peut pas lancer ici, sans `--allow-skip`. |

<a name="exit-e2e-remix"></a>

### `npm run e2e:remix`

[`scripts/e2e-remix.mjs`](../../scripts/e2e-remix.mjs).

| Code | Signifie |
|---|---|
| 0 | Chaque environnement fait les mêmes mondes (ou un navigateur sauté avec `--allow-skip`, dit). |
| 1 | Une différence, la graine nommée. |
| 3 | Un navigateur que Playwright ne peut pas lancer, sans `--allow-skip`. |

<a name="exit-e2e-speedrun"></a>

### `npm run e2e:speedrun`

[`scripts/e2e-speedrun.mjs`](../../scripts/e2e-speedrun.mjs).

| Code | Signifie |
|---|---|
| 0 | Déterminisme prouvé dans chaque navigateur lancé (ou `--bundle-only`, ou un navigateur sauté avec `--allow-skip`). |
| 1 | Une vérification a échoué. |
| 3 | Un navigateur que Playwright ne peut pas lancer, sans `--allow-skip`. |

<a name="exit-e2e-pwa"></a>

### `npm run e2e:pwa`

[`scripts/e2e-pwa.mjs`](../../scripts/e2e-pwa.mjs).

| Code | Signifie |
|---|---|
| 0 | Prouvé ; ou sauté avec `--allow-skip` (une ligne « skipped » explicite, jamais une preuve). |
| 1 | Échec. |
| 3 | Sauté : le navigateur ne sait pas naviguer hors ligne sous automatisation (WebKit), sans `--allow-skip`. |

<a name="exit-e2e-remix-speedrun"></a>

### `npm run e2e:remix-speedrun`

[`scripts/e2e-remix-speedrun.ts`](../../scripts/e2e-remix-speedrun.ts).

| Code | Signifie |
|---|---|
| 0 | Chaque politique de monde a enregistré la même partie dans chaque environnement, vérifiée (ou un navigateur sauté avec `--allow-skip`). |
| 1 | Une vérification a échoué. |
| 3 | Un navigateur que Playwright ne peut pas lancer, sans `--allow-skip`. |

<!-- generated:end -->

<a name="lint-truncated"></a>

## `npm run lint` : code de sortie 2

En plus de 0 et 1 ci-dessus, `npm run lint` sort avec **2** quand il n'a trouvé aucune erreur mais que la recherche du
solveur qu'il lance d'abord a été tronquée : « jamais exécuté » et « jamais atteint » sont alors des informations, pas
des verdicts. Augmentez `--max`, ou prouvez par chapitres ([`tools/lint.ts`](../../tools/lint.ts)).

> [!LIMIT id=register-scope]
> Le registre liste ce que le code lève avec une structure : `new StudioError(<message>, <status>)` dans
> `studio-server/src/` et `tools/studio/`, `new BridgeError(<status>, '<code>', <message>)` dans `bridge/src/`, les
> statuts du solveur et les codes de sortie nommés dans les données. Il ne liste pas les réponses qu'une route envoie
> directement (les `429 too many requests` et `429 too many refused attempts` du Studio Server, avec
> `Retry-After: 60` ; les routes speedrun et quotidiennes du Bridge, `/v1/runs` et `/v1/daily`, avec leurs propres
> corps d'erreur), un refus dont le statut est calculé (la vérification d'un signal par le Bridge répond 401 ou 403 avec
> le code de la vérification Biscuit), ni le texte d'un message construit à l'exécution (compté sous son statut). Les
> verdicts et les codes du vérificateur de speedrun relèvent des pages speedrun.

<a name="related"></a>

## Identifiants liés

- [API du Studio](studio.api.md), [outils en ligne de commande](reference.cli.md), [scripts npm](reference.npm-scripts.md).
