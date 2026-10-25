# MCP local : configurer chaque client

`npm run mcp` lance un serveur Model Context Protocol en stdio qui donne à n'importe quel assistant IA les opérations
du Studio comme des outils : Claude Code, Claude Desktop, Cursor, Codex CLI, Gemini CLI ou un agent maison lisent et
modifient alors un jeu comme le fait le Studio, et vous voyez le résultat en direct dans `npm run studio`. Cette page
branche chaque client.

<a name="what-you-get"></a>

## Ce que vous obtenez

Votre client IA liste un serveur `quest-n-click` avec des outils comme `list_rooms`, `get_room`, `set_text`,
`validate` et `solve`, qui travaillent sur les fichiers de votre jeu.

<a name="overview"></a>

## Le serveur

- **Lancé par** `npm run mcp` dans le dépôt du moteur ([`tools/mcp/server.ts`](../../tools/mcp/server.ts), SDK
  `@modelcontextprotocol/sdk` 1.x). Il s'appelle `quest-n-click` et annonce la version du moteur.
- **Les outils** sont définis une seule fois dans [`tools/studio/tools.ts`](../../tools/studio/tools.ts), partagés
  avec l'Assistant du Studio ; la liste : [Outils MCP](studio.mcp-tools.md). Deux ressources : `webscumm://game`
  (= `list_rooms`) et `webscumm://room/<id>` (= `get_room`), en JSON.
- **Le jeu** se choisit comme pour chaque outil : `GAME=<id>` (ou `GAME_DIR=<dossier>`), sinon le dernier jeu choisi
  avec `npm run game`, sinon `config.game` de `package.json`.
- **stdout ne porte que le protocole** ; les journaux vont sur stderr (`[quest-n-click mcp] ready: game "<id>"
  (<dossier>)`). Utilisez `npm run -s mcp` (silencieux) dans les configurations des clients : sans `-s`, npm imprime
  sa bannière `> quest-n-click mcp` sur stdout, que les clients stricts refusent.
- **Une opération qui échoue** (lieu inconnu, mauvais chemin, modification cassée…) rend une erreur d'outil avec le
  message ; le serveur continue de tourner.
- **Ce qu'on dit d'abord à l'agent** : le jeu et comment y travailler. Commencer par `list_rooms` et `get_room` ;
  apprendre le format avec `read_doc CONTENT_GUIDE` ; après chaque changement lancer `validate`, puis `solve`, puis
  `run_tests` ; ne jamais inventer de coordonnées, demander à l'humain avec `add_note` de placer les choses dans le
  Studio ; lire `AGENTS.md` pour les règles.
- **Les captures d'écran** demandent le serveur de dev (`npm run studio`) à `WEB_SCUMM_DEV_URL` (par défaut
  `http://localhost:5173/`) et Playwright ; sinon l'outil dit pourquoi il n'est pas disponible.

<a name="context-and-versions"></a>

## Contexte et versions

Le dépôt du moteur, depuis la 4.2.5 (le nom de serveur `quest-n-click`). Un projet créé lance le même serveur avec
`npx quest-n-click mcp` (plus bas). Pour un Studio hébergé, le `/mcp` distant ou `npm run mcp -- --server <url>` :
[MCP distant](team.remote-mcp.md).

<a name="prerequisites"></a>

## Prérequis

- Node 22.12 ou plus, le dépôt cloné et installé (`npm install`).
- Le chemin absolu de votre clone, écrit `/chemin/quest-n-click` ci-dessous.

<a name="where-to-run"></a>

## Où lancer les commandes

Les commandes `claude mcp add` se lancent dans le dépôt du moteur. Les autres clients lisent un fichier de
configuration, nommé dans chaque section ; le serveur tourne alors dans le dossier que donne ce fichier.

<a name="connect"></a>

## Étapes : brancher son client

Remplacez `/chemin/quest-n-click` par le chemin absolu de votre clone. `npm --prefix <dossier> run -s mcp` lance le
script dans `<dossier>` quel que soit le répertoire de travail du client. Ajoutez `"env": { "GAME": "<id>" }` pour
travailler sur un autre jeu.

<a name="claude-code"></a>

### Claude Code

<!-- step: claude-code -->
1. Le dépôt fournit `.mcp.json` (portée projet) : ouvrez Claude Code dans le dépôt et approuvez le serveur
   `quest-n-click`.

   ```json
   { "mcpServers": { "quest-n-click": { "type": "stdio", "command": "npm", "args": ["run", "-s", "mcp"], "env": {} } } }
   ```

   Ou en ligne de commande, dans le dépôt (`-s local` par défaut ; `-s project` écrit `.mcp.json`) :

   ```sh
   # dans le dépôt du moteur
   claude mcp add quest-n-click -- npm run -s mcp
   claude mcp add quest-n-click -e GAME=demo -- npm --prefix /chemin/quest-n-click run -s mcp
   ```

<a name="claude-desktop"></a>

### Claude Desktop

<!-- step: claude-desktop -->
2. Modifiez `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) ou
   `%APPDATA%\Claude\claude_desktop_config.json` (Windows) :

   ```json
   { "mcpServers": { "quest-n-click": { "command": "npm", "args": ["--prefix", "/chemin/quest-n-click", "run", "-s", "mcp"] } } }
   ```

   Claude Desktop ne démarre pas depuis votre shell : il peut ne pas trouver `npm` (pas de `PATH` du shell). Mettez
   alors le chemin absolu de npm dans `command` : ce qu'affiche `which npm` dans un terminal, par exemple
   `"command": "/usr/local/bin/npm"`.

<a name="cursor"></a>

### Cursor

<!-- step: cursor -->
3. Le dépôt fournit `.cursor/mcp.json` (projet). Le même bloc dans `~/.cursor/mcp.json` vaut pour tous les projets,
   avec un chemin absolu à la place de `${workspaceFolder}` :

   ```json
   { "mcpServers": { "quest-n-click": { "command": "npm", "args": ["--prefix", "${workspaceFolder}", "run", "-s", "mcp"] } } }
   ```

<a name="codex"></a>

### Codex CLI

<!-- step: codex -->
4. Ajoutez à `~/.codex/config.toml` :

   ```toml
   [mcp_servers.quest-n-click]
   command = "npm"
   args = ["--prefix", "/chemin/quest-n-click", "run", "-s", "mcp"]
   # env = { GAME = "demo" }
   ```

<a name="gemini"></a>

### Gemini CLI

<!-- step: gemini -->
5. Ajoutez à `~/.gemini/settings.json` (ou `.gemini/settings.json` dans le dépôt) :

   ```json
   { "mcpServers": { "quest-n-click": { "command": "npm", "args": ["run", "-s", "mcp"], "cwd": "/chemin/quest-n-click" } } }
   ```

<a name="other-clients"></a>

### Tout autre client

Commande `npm run -s mcp` (ou `npx tsx tools/mcp/server.ts`) avec le dépôt comme répertoire de travail, transport
stdio. Node 22.12+.

<a name="created-project"></a>

### Dans un projet créé

Un projet créé n'a pas de script `mcp` ; la commande de son moteur lance le même serveur pour le jeu du projet. Dans
chacune des configurations ci-dessus, utilisez `npx` avec les arguments `quest-n-click mcp`, le dossier du projet comme
répertoire de travail :

```sh
# dans le projet créé
claude mcp add quest-n-click -- npx quest-n-click mcp
```

Les `.mcp.json` et `.cursor/mcp.json` du dépôt ne sont pas copiés dans un projet créé : écrivez vous-même le fichier du
client.

<a name="docs-tools"></a>
<!-- applies: 4.5.0.. -->

### Lire la documentation par MCP

Depuis la 4.5.0, trois outils lisent ce wiki ([`tools/studio/tools.ts`](../../tools/studio/tools.ts)) :

- `search_docs { query, lang?, audience?, context?, version?, type?, includeArchived?, limit?, cursor? }` : des mots ou
  une question en français ou en anglais ; chaque résultat est `id#section` avec son titre, son type, son contexte, ses
  versions, son statut, un score, la raison de la correspondance et un extrait. Sans correspondance sûre, une liste
  vide et les pages d'index à essayer.
- `list_docs { audience?, context?, type?, lang?, state? }` : les pages à lire, avec leurs ids de section.
- `read_doc { id, section?, lang?, maxChars?, cursor? }` : une page ou une section, avec en tête d'où vient le texte
  (version, commit, révision de la doc) ; `maxChars` vaut 20 000 par défaut, 100 000 au plus, et un `cursor` donne la
  suite.

`read_doc { name }` répond toujours comme en 4.4.0 : une des huit pages historiques (`CONTENT_GUIDE`, `ENGINE`,
`TOOLS`, `STUDIO`, `WORKFLOW`, `AUDIO`, `UPGRADING`, `CLASSICS`), en un seul bloc de texte, peut-être abrégée
(ci-dessous) ; les autres arguments sont alors ignorés. Depuis la 4.5.0, cette page est reconstruite à partir des sections du wiki dans l'ordre
de l'ancienne page (`wiki/legacy.json`), dans la limite de 1,5 fois sa taille en 4.4.0 : quand les sections en disent
plus, les plus longues donnent leur titre, leur premier paragraphe et le `read_doc { id, section }` qui renvoie la
suite. Donner à la fois `name` et `id`, ou aucun des deux, est une erreur d'outil :
`give either name (one of the 8 legacy pages) or id, not both`. Dans le dépôt du moteur, les outils lisent `wiki/` tel
qu'il est (brouillons compris, ce que dit la provenance) ; dans un paquet installé, ils lisent son bundle de
documentation (pages prêtes seulement).

> [!LIMIT id=no-docs-remote]
> Le `/mcp` distant d'un Studio hébergé n'offre ni `read_doc`, ni `search_docs`, ni `list_docs` : un agent qui
> travaille sur un Studio hébergé lit la documentation par le serveur stdio local de la même version du moteur.

<a name="any-ai"></a>

## N'importe quelle IA, pas une seule IA

- `AGENTS.md` à la racine du dépôt est le manuel d'exploitation neutre vis-à-vis du fournisseur ; `CLAUDE.md` y
  renvoie.
- Chaque client MCP se branche de la même façon, avec la configuration ci-dessus.
- Une IA sans MCP fonctionne quand même : elle modifie les fichiers, le Studio se recharge (il les surveille), vous
  voyez le résultat et répondez dans Notes ou dans le Storyboard, et l'IA relit `notes.json` ([Notes](studio.notes.md)).
  Git porte l'historique. Une session type : [Travailler avec une IA](create.working-with-ai.md#typical-session).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Le client affiche le serveur `quest-n-click` connecté, avec ses outils. Demandez-lui d'appeler `list_rooms` : il
répond avec l'id du jeu, son titre, ses lieux et ses personnages. Dans Claude Code, `claude mcp list` montre le
serveur.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Que faire |
|---|---|---|
| Le client refuse le serveur, une erreur de JSON invalide au démarrage | La bannière de npm sur stdout | Utiliser `npm run -s mcp` (avec `-s`) |
| Claude Desktop : le serveur ne démarre pas, `npm` introuvable | Pas de `PATH` du shell | Mettre le chemin absolu de npm (`which npm`) dans `command` |
| Les outils travaillent sur un autre jeu | `GAME` ou le dernier jeu choisi | Ajouter `"env": { "GAME": "<id>" }` |
| `screenshot` se dit indisponible | Pas de serveur de dev à `WEB_SCUMM_DEV_URL`, ou pas de Playwright | Lancer `npm run studio` ; installer Playwright |
| `reading by id needs the documentation of wiki/, not available here` | Ni wiki ni bundle là où tourne le serveur | Utiliser `read_doc { name }`, ou un moteur 4.5.0 |

Plus : [Dépannage du Studio](studio.troubleshooting.md#mcp).

<a name="files-changed"></a>

## Fichiers ou données modifiés

Le fichier de configuration du client seulement (`.mcp.json` avec `claude mcp add -s project`). Le serveur écrit les
fichiers du jeu quand un outil écrit, comme le ferait le Studio.

<a name="references"></a>

## Références

- [`tools/mcp/server.ts`](../../tools/mcp/server.ts), [`tools/mcp/tools-server.ts`](../../tools/mcp/tools-server.ts),
  [`.mcp.json`](../../.mcp.json), [`.cursor/mcp.json`](../../.cursor/mcp.json).
- [Outils MCP](studio.mcp-tools.md), [MCP distant](team.remote-mcp.md), [Travailler avec une IA](create.working-with-ai.md).
