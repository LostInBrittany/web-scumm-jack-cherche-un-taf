# MCP : le Studio pour n'importe quel assistant IA

`npm run mcp` lance un serveur [Model Context Protocol](https://modelcontextprotocol.io) en **stdio** qui expose les
opérations du Studio (`studio-server/src/ops/core.ts`, voir STUDIO.md) comme des outils. N'importe quel client MCP (Claude Code,
Claude Desktop, Cursor, Codex CLI, Gemini CLI, un agent maison) lit et modifie alors un jeu exactement comme le Studio,
et l'humain voit le résultat en direct dans `npm run studio` (qui surveille les fichiers).

- Serveur : `tools/mcp/server.ts`, SDK `@modelcontextprotocol/sdk` 1.x. Nom `web-scumm`. Les outils sont définis une
  fois dans `tools/studio/tools.ts`, partagés avec l'Assistant du Studio (STUDIO.md, « Assistant »).
- Jeu : `GAME=<id>` (ou `GAME_DIR=<dossier>`) comme pour chaque outil ; défaut `package.json` `config.game`.
- stdout ne porte que le protocole ; les journaux vont sur stderr. Utiliser `npm run -s mcp` (silencieux) dans les
  configs des clients : sans `-s`, npm imprime sa bannière `> web-scumm mcp` sur stdout, que les clients stricts
  refusent.
- Une opération qui échoue (lieu inconnu, mauvais chemin, modification cassée…) rend une erreur d'outil avec le
  message ; le serveur continue de tourner.

## Outils

| Outil | Arguments | Fait |
|---|---|---|
| `list_rooms` | | les infos du jeu : id, titre, héros, lieux, personnages, objets, verbes, checkpoints, objectifs (4.1.12), images |
| `get_room` | `id` | `{ def, layout, texts, file }` : chaque texte modifiable avec son chemin JSON |
| `set_layout` | `id, layout` | écrit `layout/<id>.json` (le Layout entier) |
| `set_text` | `id, path, value \| null` | remplace un texte littéral dans `rooms/<id>.ts` ; `null` supprime une ligne ; un chemin finissant par `[+]` ajoute (`look.piano[+]`, `on[3].do[+]`) |
| `set_value` | `id, path, value \| null, dry?` | écrit une valeur structurée en code dans `rooms/<id>.ts` (3.4) : une réaction (`on[3]`, `on[<longueur>]` en ajoute une), une condition (`on[3].if`), une liste de commandes (`on[3].do`), la `stage` ou le `renderer` du lieu ; `null` supprime ; `dry` ne rend que le diff ; le jeu est validé après l'écriture et une modification qui ajoute une erreur est reprise |
| `set_value` sur le jeu | `id: "@game", path, value \| null, dry?` | la même chose dans le `defineGame({...})` du fichier du jeu (4.1.12), pour ses objectifs seulement : `objectives.<id>` (`{ title, done, optional?, parent? }`) ou un de ses champs ; validé de la même façon : un objectif dont `done` ne peut jamais être vrai est refusé |
| `get_ir` | | la représentation intermédiaire du jeu (4.1.12) : salles, entités, règles, sujets, écouteurs, scripts, objectifs, politiques Reality, extensions de confiance par nom, chaque id avec son `fichier:ligne` (`provenance`) ; le JSON de `npm run ir -- --json` |
| `add_entity` | `id, kind, entityId, name?, img?, char?, at?, look?` | ajoute un prop / point chaud / personnage au fichier du lieu et au layout (`at` vaut `[320, 300]` par défaut) |
| `get_storyboard` / `set_storyboard` | `storyboard` | lit / écrit `storyboard.json` (`{ boards: [...] }`) |
| `get_notes` / `add_note` | `about?, author?, text` | le journal partagé `notes.json` ; `author` vaut par défaut le nom du client MCP, sinon `ai` ; les notes avec `task: true` sont des demandes envoyées par l'humain depuis l'Assistant du Studio |
| `validate` | | `{ ok, errors, warnings, ms }` |
| `solve` | `from?, profile?, prove?, reality?` | prouve que le jeu se finit (depuis Nouvelle partie ou un checkpoint) ; `reality` (4.1.1, un jeu avec `reality.signals`) : le monde où résoudre, `closed`, un scénario `{ scenario, signals }` ou `adversarial`, simulé, aucun service contacté ; `prove: true` lance la recherche exhaustive (tous les états atteignables, les softlocks ; lente sur un grand jeu) ; `profile: true` ajoute de quoi les états sont faits et ce que la recherche a coûté (dimensions indépendantes, lieux au branchement démesuré, choses monotones) |
| `content_report` | | le profileur de contenu en Markdown : par lieu, objet et personnage, ce qui est mince ; lieux inaccessibles |
| `world_graph` | | les lieux et les chemins entre eux en DOT, avec les lieux inaccessibles et les sorties sans retour |
| `dialogue_tree` | `id, actor?` | la conversation d'un personnage dans un lieu en arbre indenté : sujets et conditions, répliques, choix et options, branches ; dérivé des sujets |
| `puzzle_graph` | `id?` | ce que chaque règle, sujet, script et écouteur exige et change. Sans `id` : le récapitulatif (chaque objet et flag, ce qui le produit et l'utilise, flags lus jamais posés, choses produites jamais utilisées). Avec `id` (objet, flag, prop, lieu, événement) : sa fiche : obtenu par, consommé par, utilisé par, exige d'abord, débloque, en aval, et pourquoi le solveur le garde (critical, world, visible ou dead, avec la chaîne jusqu'à la fin) |
| `storyboard_coverage` | | le storyboard confronté au contenu, en Markdown : par board et par case, si son lieu, ses locuteurs, ses répliques, ses sujets, ses sons et ses actions existent dans le jeu (ok, partial, missing, unknown) ; ce qui, de l'histoire, n'est pas encore implémenté |
| `playtests` | | les sessions partagées par les joueurs (`games/<id>/playtests/`) rejouées sur le contenu courant et cumulées, en Markdown : temps par lieu, blocages, indices, où ils se sont arrêtés, sessions que le contenu a dépassées |
| `speedrun_verify` | `path?, envelope?` | le `.wsrun` d'un speedrun (un fichier du projet, ou son texte) rejoué contre le jeu : `{ verdict, code, reason, trust }` (4.1.14, `docs/fr/SPEEDRUN.md`) ; seul `valid` est classé, `inconclusive` jamais |
| `lint` | `prove?` | le lint de contenu en Markdown (`npm run lint`) : conditions insatisfaisables, règles masquées, faux indices, indices bloqués, options mortes, et après une passe du solveur les actions vivantes jamais jouées et les lieux jamais atteints ; chaque constat avec son chemin, son id et quoi faire |
| `screenshot` | `room, checkpoint?` | PNG du lieu sous `.cache/studio/` ; demande le serveur de dev (`npm run studio`) à `WEB_SCUMM_DEV_URL` (défaut `http://localhost:5173/`) et Playwright, sinon dit pourquoi c'est indisponible |
| `read_doc` | `name` | l'une des pages `CONTENT_GUIDE`, `ENGINE`, `TOOLS`, `STUDIO`, `WORKFLOW`, `AUDIO`, `UPGRADING`, `CLASSICS` (docs/en) : l'agent apprend le DSL, la chaîne audio, la migration v2 → v3 et les mécaniques classiques par MCP |
| `run_tests` | | lance `npx vitest run`, rend le résumé et les échecs |
| `asset_prompts` | `missing?` | les prompts d'images de `npm run prompts` (markdown), et `{ missing, sheets }` en contenu structuré : les ids d'images pas encore découpés |

Ressources : `webscumm://game` (= `list_rooms`) et `webscumm://room/<id>` (= `get_room`), en JSON.

## Brancher son client

Remplacer `/chemin/web-scumm` par le chemin absolu de votre clone. `npm --prefix <dossier> run -s mcp` lance le
script dans `<dossier>` quel que soit le répertoire de travail du client. Ajouter `"env": { "GAME": "<id>" }` pour
travailler sur un autre jeu.

### Claude Code
Le dépôt fournit `.mcp.json` (portée projet) : ouvrir Claude Code dans le dépôt et approuver le serveur `web-scumm`.
```json
{ "mcpServers": { "web-scumm": { "type": "stdio", "command": "npm", "args": ["run", "-s", "mcp"], "env": {} } } }
```
Ou en ligne de commande, dans le dépôt (`-s local` par défaut ; `-s project` écrit `.mcp.json`) :
```
claude mcp add web-scumm -- npm run -s mcp
claude mcp add web-scumm -e GAME=demo -- npm --prefix /chemin/web-scumm run -s mcp
```

### Claude Desktop
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) ou `%APPDATA%\Claude\claude_desktop_config.json` :
```json
{ "mcpServers": { "web-scumm": { "command": "npm", "args": ["--prefix", "/chemin/web-scumm", "run", "-s", "mcp"] } } }
```
Si Claude Desktop ne trouve pas `npm` (pas de PATH du shell), mettre son chemin absolu (`which npm`) dans `command`.

### Cursor
Le dépôt fournit `.cursor/mcp.json` (projet) ; le même bloc dans `~/.cursor/mcp.json` vaut partout avec un chemin absolu :
```json
{ "mcpServers": { "web-scumm": { "command": "npm", "args": ["--prefix", "${workspaceFolder}", "run", "-s", "mcp"] } } }
```

### Codex CLI
`~/.codex/config.toml` :
```toml
[mcp_servers.web-scumm]
command = "npm"
args = ["--prefix", "/chemin/web-scumm", "run", "-s", "mcp"]
# env = { GAME = "demo" }
```

### Gemini CLI
`~/.gemini/settings.json` (ou `.gemini/settings.json` dans le dépôt) :
```json
{ "mcpServers": { "web-scumm": { "command": "npm", "args": ["run", "-s", "mcp"], "cwd": "/chemin/web-scumm" } } }
```

### Tout autre client
Commande `npm run -s mcp` (ou `npx tsx tools/mcp/server.ts`) avec le dépôt comme répertoire de travail, transport
stdio. Node 22.12+.

## Un Studio hébergé (4.2.3)

Sur un Studio Server (`docs/fr/STUDIO-SERVER.md`), un agent travaille comme un membre, à travers les vérifications du
serveur : son rôle, les pans que d'autres tiennent (un 423 qu'il lit), le journal (ses écritures sont des révisions au
nom du membre). Deux façons :

- **À distance, en HTTP** : le `/mcp` du serveur (Streamable HTTP de MCP, sans état). Un client qui suit
  l'autorisation de MCP trouve le fournisseur OIDC à `/.well-known/oauth-protected-resource/mcp` (RFC 9728) ; le
  jeton qu'il obtient doit porter l'`oidc.audience` du Studio (un fournisseur qui la tire du `resource` de MCP donne
  `<public>/mcp` : mettez cette URL dans `oidc.audience` ; Keycloak demande un mapper d'audience, et un client
  enregistré pour l'agent). Sinon, donnez-lui en un : `npm run studio-server -- token --server <url>` affiche un jeton
  d'accès, envoyé en `Authorization: Bearer <jeton>` ; il dure quelques minutes (`oidc.maxTokenSeconds`), une longue
  session va donc mieux sur le serveur stdio ci-dessous. Le cookie de session du navigateur n'y est jamais accepté. Un
  message JSON-RPC par requête (pas de lot).
  ```json
  { "mcpServers": { "web-scumm": { "type": "http", "url": "https://studio.example.fr/mcp", "headers": { "Authorization": "Bearer <jeton>" } } } }
  ```
- **En local, en stdio, tourné vers le serveur** : `npm run studio-server -- login --server <url>` une fois, puis
  `npm run -s mcp -- --server <url>` (le jeton se renouvelle seul ; https seulement).

Ce que seule une machine avec le dépôt sait faire n'y est pas proposé : les captures, la suite de tests, les
documents, les prompts d'assets. Un agent n'envoie pas la révision qu'il a lue : ses écritures sont faites par le
serveur sur le fichier tel qu'il est (le garde les vérifie), pas refusées parce que quelqu'un l'a écrit depuis (ADR
0029).

## Une session type
1. `read_doc CONTENT_GUIDE`, `list_rooms`, `get_storyboard`, `get_notes`.
2. Modifier : `set_storyboard` d'abord, puis `set_text` / `add_entity` dans les lieux.
3. `validate`, `solve`, `lint`, `run_tests` ; `screenshot` si l'humain fait tourner le Studio.
4. `add_note` pour tout ce que l'humain doit décider ou placer ; lire sa réponse avec `get_notes`.
