# MCP distant

Un agent IA (Claude Code, Cursor, n'importe quel client MCP) peut travailler sur un Studio d'équipe comme un membre :
avec votre rôle, dans les pans que tiennent les autres, ses écritures dans le journal à votre nom. Cette page branche
un agent sur un Studio hébergé, soit en HTTP sur le `/mcp` du serveur, soit par le serveur MCP local tourné vers le
Studio, et liste les outils que chacun propose.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un agent qui lit, vérifie et (avec un rôle de dev) modifie le jeu hébergé à travers les mêmes vérifications que la page
du Studio : le contrôle d'accès, le rôle, les pans, le journal, une nouvelle tentative appliquée une seule fois.

<a name="context-and-versions"></a>

## Contexte et versions

Un Studio hébergé (le Studio Server) avec OIDC, depuis la 4.2.3 ([ADR 0029](../../docs/dev/adr/0029-remote-mcp.md)).
Pour le MCP local sur votre propre dossier de jeu, voir [MCP local : brancher chaque client](studio.mcp-setup.md) et
[Les outils MCP](studio.mcp-tools.md).

<a name="prerequisites"></a>

## Prérequis

- Un compte de membre : un `reviewer` au moins pour lire et vérifier, un `dev` pour écrire.
- Le fournisseur du Studio donne à la CLI ou à l'agent des **jetons d'accès JWT pour l'audience du Studio**
  (`oidc.audience`). Keycloak le fait avec un mapper d'audience ; un fournisseur qui émet des jetons d'accès opaques
  (les applications OAuth de GitLab, au moment où ces lignes sont écrites) ne peut servir ni la CLI ni le MCP distant
  (voir [OIDC générique et GitLab](clever.generic-oidc.md)).
- Pour la voie locale : le dépôt du moteur (ou le paquet installé) sur votre machine, et la CLI connectée.

<a name="where-to-run"></a>

## Où lancer les commandes

Sur votre machine, dans le dossier du dépôt du moteur (ou dans un projet créé où le paquet est installé). La
configuration de l'agent est le fichier de votre client MCP.

<a name="steps"></a>

## Étapes

<!-- step: choose -->
1. **Choisissez la voie.**
   - **À distance, en HTTP** : le `/mcp` du serveur, dans le transport Streamable HTTP de MCP, sans état (chaque POST
     est un échange complet, avec une réponse JSON). Rien à lancer en local, mais le jeton ne dure que quelques
     minutes.
   - **En local, en stdio, tourné vers le serveur** : les mêmes outils, par l'API du Studio, avec le jeton de la CLI
     renouvelé tout seul. Mieux pour une longue session.

<!-- step: remote-token -->
2. **À distance : donnez un jeton au client.** Un client qui suit l'autorisation de MCP trouve le fournisseur à
   `/.well-known/oauth-protected-resource/mcp` (RFC 9728) ; le jeton qu'il obtient doit porter l'`oidc.audience` du
   Studio. Un fournisseur qui tire l'audience du paramètre `resource` de MCP donne `<URL publique>/mcp` : mettez cette
   URL dans `oidc.audience`. Keycloak demande un mapper d'audience dans tous les cas, et un client enregistré pour
   l'agent. Sinon, donnez-lui un jeton vous-même :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   npm run studio-server -- login --server https://studio.example.fr   # une fois : le device flow
   npm run studio-server -- token --server https://studio.example.fr   # affiche un jeton d'accès
   ```

   et envoyez-le en `Authorization: Bearer <jeton>` :

   ```json
   { "mcpServers": { "quest-n-click": { "type": "http", "url": "https://studio.example.fr/mcp", "headers": { "Authorization": "Bearer <jeton>" } } } }
   ```

   Le jeton dure quelques minutes : le Studio refuse un jeton d'accès qui vit plus de 5 minutes (ou plus que
   `oidc.maxTokenSeconds`, de 30 à 900, si la configuration le donne). Donnez-en un nouveau au client quand il expire. Le cookie de
   session du navigateur n'y est jamais accepté.

<!-- step: local-stdio -->
3. **En local : tournez le serveur stdio vers le Studio.** Connectez-vous une fois, puis lancez le serveur MCP avec
   `--server` :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   npm run studio-server -- login --server https://studio.example.fr
   npm run -s mcp -- --server https://studio.example.fr
   ```

   Dans la configuration d'un client, la commande est `npm` avec les arguments
   `["--prefix", "/path/to/quest-n-click", "run", "-s", "mcp", "--", "--server", "https://studio.example.fr"]`. Le
   jeton se renouvelle tout seul ; https seulement.

<!-- step: first-call -->
4. **Vérifiez que ça marche.** Demandez à l'agent d'appeler `list_rooms`. Ses premières instructions lui disent qu'il
   est sur un Studio partagé : une partie qu'un autre membre tient refuse son écriture (423), et il doit dire ce dont il
   a besoin dans une note.

<a name="tools"></a>

## Les outils proposés

| Proposés sur un Studio hébergé (les deux voies) | Non proposés |
|---|---|
| `list_rooms`, `get_room`, `get_ir`, `get_storyboard`, `get_notes` | `screenshot` (demande un navigateur sur la machine) |
| `set_layout`, `set_text`, `set_value`, `add_entity`, `set_storyboard`, `add_note` | `run_tests` (demande le dépôt) |
| `validate`, `solve` (sans politique `reality` : une 501), `lint`, `content_report` | `read_doc`, `search_docs`, `list_docs` (la documentation) |
| `world_graph`, `dialogue_tree`, `puzzle_graph`, `storyboard_coverage`, `playtests` | `asset_prompts`, `speedrun_verify` |

Un outil dont le backend n'a pas la capacité n'est pas proposé du tout. Un agent sur un Studio hébergé lit la
documentation par le MCP stdio local de la même version du moteur, sans `--server`.

<a name="semantics"></a>

## Ce qu'est l'écriture d'un agent

- **L'écriture d'un membre.** Chaque appel d'outil est une requête à la `/api` du Studio avec votre jeton : votre
  rôle, vos pans, votre nom dans le journal et dans l'audit. L'agent d'un reviewer ne peut pas écrire (403).
- **Une 423 comme vous.** Un pan tenu par un autre membre refuse l'écriture, et l'outil renvoie le message qui le
  nomme.
- **Pas de révision de base.** Un agent n'envoie pas de `x-studio-base` : ses écritures sont calculées par le serveur
  sur le fichier tel qu'il est maintenant et vérifiées par la garde de validation, mais pas refusées parce que
  quelqu'un a écrit le fichier depuis la lecture de l'agent.
- **Appliquée une fois.** Chaque écriture porte son propre identifiant d'opération.
- **Les notes.** Une note qu'un agent ajoute sans auteur est signée `ai`, enregistrée quand même au nom de votre membre
  (en HTTP, le serveur ne voit jamais le nom du client MCP).
- **Retiré, arrêté.** Un membre retiré est refusé à l'appel suivant ; ses jetons sont révoqués avec lui.

> [!GUARANTEE id=mcp-bearer-only]
> `/mcp` demande un jeton Bearer, et refuse un jeton d'une autre audience, le cookie de session, un non-membre et un
> GET.

> [!LIMIT id=mcp-remote-limits]
> Un message JSON-RPC par requête : un lot est refusé (400). `GET` et `DELETE` sur `/mcp` répondent 405 (pas de flux,
> pas de session). La requête d'un outil abandonne au bout de 5 minutes, ou quand le client s'en va. Beaucoup de jetons
> expirés à la fois peuvent rendre les refus suivants 429 pendant une minute (ils sont comptés pour l'adresse de la
> boucle locale) ; les requêtes valides ne sont jamais ralenties.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`list_rooms` répond les salles du jeu hébergé. Une écriture faite par l'agent apparaît dans l'en-tête du Studio comme
une nouvelle révision, à votre nom ; `GET /api/ops` la liste.

<a name="common-errors"></a>

## Erreurs courantes

| Symptôme | Cause | Correction |
|---|---|---|
| 401 avec `WWW-Authenticate: Bearer resource_metadata="…"` | Pas de jeton, ou un jeton expiré | Donnez un jeton ; renouvelez-le |
| 401 `the access token is not valid` | Une autre audience, un id_token, ou un jeton qui vit plus longtemps que permis | Configurez le mapper d'audience ; utilisez un jeton d'accès |
| 403 `not a member of this project` | Le compte n'est pas membre | Demandez une invitation à un owner |
| `not logged in to <url>: run studio-server login --server <url>` | La voie locale sans connexion | Connectez-vous d'abord |
| `<url> is not https: the tokens would travel in clear` | Une URL en http | Utilisez l'URL en https |
| L'outil renvoie un message de 423 | Un pan que quelqu'un tient | Laissez une note, ou attendez |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Les écritures de l'agent sont des opérations du journal comme les vôtres. La voie locale garde les jetons dans
`~/.config/web-scumm/studio-tokens.json` (mode 0600).

<a name="recovery"></a>

## Revenir en arrière

Les opérations de l'agent sont les vôtres : votre Undo dans le Studio les reprend, la plus récente d'abord. Pour
arrêter un agent tout de suite, arrêtez son processus ou retirez son jeton du client. Le **End sessions** d'un owner
sur votre compte refuse tous les jetons émis avant maintenant, mais un serveur stdio local en obtient un nouveau grâce
à son jeton de rafraîchissement (voir [Gérer les membres](team.members.md#end-sessions)).

<a name="references"></a>

## Références

- [ADR 0029](../../docs/dev/adr/0029-remote-mcp.md), [`studio-server/src/server/mcp.ts`](../../studio-server/src/server/mcp.ts).
- [`tools/studio/http-backend.ts`](../../tools/studio/http-backend.ts), [`tools/mcp/tools-server.ts`](../../tools/mcp/tools-server.ts).
- [La ligne de commande du serveur](team.server-cli.md#login).
