# La ligne de commande du serveur

`studio-server` est l'unique commande du Studio Server : elle sert, importe et exporte le jeu, invite le premier owner,
connecte la CLI, sauvegarde, restaure et ramasse. Cette page liste chaque sous-commande de
[`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts), ses options, ce qu'elle affiche et son
code de sortie.

<a name="how-to-run"></a>

## Comment la lancer

```sh
# dans le dépôt du moteur
npm run studio-server -- <subcommand> [options]
# depuis les archives de la release, dans le dossier où elles sont installées
npx quest-n-click-studio-server <subcommand> [options]
```

Les deux lancent le même programme. Sur Clever Cloud, lancez-la dans `clever ssh --alias <app studio>`, après
`cd "$APP_HOME"` : ce shell a déjà les variables de l'application.

<a name="configuration"></a>

## La configuration et les secrets

Toutes les sous-commandes sauf `login`, `token`, `deps` et `worker-keys` lisent la configuration du serveur, depuis la
première source présente :

1. `--config <fichier>`, n'importe où dans les arguments ;
2. la variable `STUDIO_CONFIG`, le chemin d'un fichier ;
3. la variable `STUDIO_CONFIG_JSON`, la configuration elle-même sur une ligne (Clever Cloud).

Sans aucune : `usage: studio-server <serve|import <dir>|export <dir>> --config <file> (or STUDIO_CONFIG_JSON)`, code
de sortie 2. Une clé inconnue ou manquante dans la configuration arrête la commande avec `configuration: <fichier>: …`,
code de sortie 1.

Les secrets (`STUDIO_DATABASE_URL`, les clés S3, `STUDIO_OIDC_CLIENT_SECRET`, `STUDIO_SESSION_KEY`,
`STUDIO_WORKER_KEY`, `STUDIO_METRICS_TOKEN`, `STUDIO_GIT_KEY`) se lisent dans `<NOM>_FILE` (un fichier en mode 0600)
ou dans l'environnement (sur Clever Cloud aussi les variables des add-ons `POSTGRESQL_ADDON_URI`,
`CELLAR_ADDON_KEY_ID`, `CELLAR_ADDON_KEY_SECRET`), puis sont retirés de l'environnement avant que quoi que ce soit
d'autre ne tourne. Voir [Variables d'environnement](reference.environment-variables.md#studio-server).

<a name="exit-codes"></a>

## Codes de sortie et sorties

| Code | Sens |
|---|---|
| 0 | terminé ; `serve` sort aussi en 0 après un `SIGTERM` ou un `SIGINT`, une fois vidé |
| 1 | refusé ou échoué : une erreur de configuration (`configuration: …`), `import` sur une instance qui a déjà un projet, `replay` sans restauration en cours, `token` sans connexion, toute autre erreur (son message, ou sa pile) |
| 2 | usage : un argument ou un drapeau de sous-commande manquant ou faux, une sous-commande inconnue, `serve` sur une adresse hors boucle locale sans OIDC |

La plupart des sous-commandes affichent **une ligne JSON** sur la sortie standard (`{"event": …}`), décrite plus bas ;
`invite`, `login`, `token` et `worker-keys` affichent du texte simple. Les erreurs vont sur la sortie d'erreur.

<a name="serve"></a>

## `serve`

```sh
npm run studio-server -- serve --config studio.config.json
```

Démarre le serveur : l'API, les sondes, l'origine du jeu, le bail de service. Il écrit des lignes de journal JSON
(`lease-taken`, `listening`, une ligne `request` par requête, `stopping`…). Il écoute sur le `port` de la
configuration, sinon `PORT`, sinon 8080, sur `host` (`0.0.0.0` par défaut).

- Sans `oidc` dans la configuration, c'est le serveur local, qui refuse tout `host` autre que la boucle locale :
  `serve: <host> is refused without authentication (configure oidc); use 127.0.0.1` (code 2).
- Avec `oidc`, il lui faut `STUDIO_OIDC_CLIENT_SECRET`, `STUDIO_SESSION_KEY` (32 caractères ou plus, plusieurs
  séparées par des virgules pour une rotation), `worker` avec `STUDIO_WORKER_KEY`, la page du Studio construite
  (`npm run studio-client`), et la découverte du fournisseur joignable ; s'il en manque un, c'est une erreur
  `configuration:` (code 1).
- `STUDIO_METRICS_TOKEN`, s'il est défini, doit faire 32 caractères ou plus.
- Il refuse de démarrer pendant une restauration : `a restore is under way: end it with replay`.
- Sur `SIGTERM` ou `SIGINT`, il n'accepte plus de requêtes, laisse finir celles en cours (5 s au plus), rend le bail
  de service, et sort en 0.

<a name="import"></a>

## `import <dossier>`

```sh
npm run studio-server -- import games/my-game --config studio.config.json
```

Fait d'un dossier de jeu (avec son `index.ts`) le projet de l'instance : copié à côté, puis renommé à sa place, et
adopté par le journal comme révision 1. Sur une instance hébergée, chaque fichier part dans le bucket, et le journal
est expédié avant la fin de la commande. Affiche `{"event":"imported","game","revision"}`.

- Pas de dossier, ou pas d'`index.ts` : `import: a game folder (with its index.ts) is required` (code 2).
- L'instance a déjà un projet (dans sa base, ou un dossier de travail non vide) :
  `import: this instance already has a project` (code 1). On importe une fois, sur une instance neuve ; ensuite on
  passe par Git ([Le jeu dans Git](team.game-in-git.md)) ou par une restauration.

<a name="export"></a>

## `export <dossier>`

```sh
npm run studio-server -- export ./my-game-export --config studio.config.json
```

Écrit le jeu à la tête dans un dossier neuf ou vide, avec `export-manifest.json` :
`{"game", "epoch", "revision", "files": [{"path", "blob"}]}`, où `blob` est le sha256 de chaque fichier. Les fichiers
et la révision viennent d'un seul instantané de la base, et le contenu de chaque fichier est vérifié contre son
empreinte. Affiche `{"event":"exported","revision","files"}`. Elle ne fait que lire : elle peut tourner pendant que le
serveur sert.

- Un dossier qui existe et n'est pas vide : `export: an empty or new folder is required` (code 2).
- Un contenu qui ne correspond pas à la tête : une erreur qui nomme le fichier (code 1).

> [!GUARANTEE id=export-same-files]
> Un jeu importé, puis exporté à sa tête, sort avec un manifeste des empreintes de ses fichiers, et chaque fichier
> exporté correspond à son empreinte dans le manifeste.

> [!LIMIT id=export-game-only]
> Un export contient les fichiers du jeu à la tête, rien d'autre : ni l'historique, ni les membres, ni les
> commentaires, ni les builds publiés, ni les assets préparés. Une sauvegarde les contient (voir
> [Sauvegardes](clever.backups.md)). Sur Clever Cloud, le dossier est écrit sur le disque de l'instance, qui ne survit
> pas à un redémarrage : copiez-le ailleurs (voir
> [Exporter le jeu et quitter l'installation](clever.export-leave.md)).

<a name="invite"></a>

## `invite --email <email> --role <owner|dev|reviewer>`

```sh
npm run studio-server -- invite --email you@example.fr --role owner
```

Affiche un lien d'invitation à usage unique (`<publicUrl>/auth/login?invite=…`, 7 jours, pour cet email vérifié).
C'est ainsi qu'entre le premier owner ; le journal d'audit en nomme l'auteur `studio-server invite`. Chaque drapeau
demande sa valeur, jamais un autre drapeau ; sinon
`usage: studio-server invite --email <email> --role <owner|dev|reviewer> --config <file>` (code 2). Voir
[Invitations](team.invitations.md).

<a name="login"></a>

## `login --server <url>`

```sh
npm run studio-server -- login --server https://studio.example.fr   # device flow : ouvrez le lien, tapez le code
npm run studio-server -- token --server https://studio.example.fr   # un jeton d'accès pour les scripts et le MCP
```

Aucune configuration. Demande au Studio quel fournisseur et quel client utiliser (`GET /auth/cli`), puis lance le
device flow : elle affiche `Open <url> and enter the code <code>`, attend, puis `logged in`. Les jetons sont gardés
dans `~/.config/web-scumm/studio-tokens.json` (mode 0600), une entrée par serveur, et envoyés en https seulement.

- Le fournisseur refuse : `the login was refused: <error> (<description>)`, par exemple
  `not_allowed (Offline tokens not allowed for the user or client)` quand il manque `offline_access` au membre (voir
  [Keycloak](clever.keycloak.md)).
- Le Studio ne nomme aucun client CLI : `<url> names no CLI client: ask its owner to configure oidc.cliClientId`.
- Une URL `http://` : `<url> is not https: the tokens would travel in clear`.

<a name="token"></a>

## `token --server <url>`

```sh
npm run studio-server -- token --server https://studio.example.fr   # un jeton d'accès pour les scripts et le MCP
```

Affiche un jeton d'accès valide pour ce serveur, renouvelé d'abord s'il lui reste moins d'une minute. Envoyez-le en
`Authorization: Bearer <jeton>`. Les jetons doivent porter l'`oidc.audience` du Studio. Sans connexion :
`not logged in to <url>: run studio-server login --server <url>` (code 1) ; jeton de rafraîchissement perdu :
`the login to <url> expired: log in again`. Un agent IA s'en sert par le `/mcp` du Studio, ou par le serveur MCP local
tourné vers le Studio (`npm run -s mcp -- --server <url>`) : voir [MCP distant](team.remote-mcp.md).

<a name="deps"></a>

## `deps`

Aucune configuration. Affiche les dépendances propres du serveur telles qu'elles se résolvent depuis l'endroit où il
tourne : `{"openid-client": {"version", "from"}, "jose": {…}, "pg": {…}}`. Une dépendance manquante échoue ici, pas à
la première connexion. Utile après une installation depuis les archives, où `pg` prend la dernière 8.x que permet sa
plage.

<a name="worker-keys"></a>

## `worker-keys --out <dossier existant>`

```sh
mkdir -p ~/secrets/my-game && npm run studio-server -- worker-keys --out ~/secrets/my-game
```

Aucune configuration. Écrit les clés de jobs : `studio-worker.key` (mode 0600, le secret `STUDIO_WORKER_KEY` du Studio)
et `studio-worker.pub` (le `WORKER_PUBLIC_KEY` du worker). N'affiche jamais une clé. Le dossier doit exister
(`usage: studio-server worker-keys --out <existing folder>`, code 2) ; un fichier de clé existant n'est jamais écrasé
(code 1).

<a name="backup"></a>

## `backup <fichier>` et `backup --to-bucket [--keep n]`

```sh
npm run studio-server -- backup ./backup.json --config studio.config.json
npm run studio-server -- backup --to-bucket --keep 14 --config studio.config.json
```

Écrit les tables du projet en un seul instantané (les membres, le journal, la tête, les aperçus, les builds et les
ensembles préparés ; ni les sessions ni les baux), avec les blobs qu'elles nomment et une empreinte.

- `backup <fichier>` : un fichier neuf (mode 0600). Un fichier existant, ou aucun :
  `backup: a new file is required (or --to-bucket [--keep n])` (code 2). Affiche
  `{"event":"backup","revision","blobs","digest"}`.
- `--to-bucket` : dans le bucket de l'instance, sous `backups/<date>-r<révision>.json` (UTC,
  `2026-10-19T03-17-00Z`) ; demande `blobs.kind` `s3`. Avec `--keep n` (1 à 9999), les sauvegardes que cette commande
  a écrites au-delà des `n` plus récentes sont supprimées, jamais un autre objet ; sans `--keep`, aucune n'est
  supprimée. Affiche `{"event":"backup","key","revision","digest","removed"}`. Un `--keep` invalide :
  `backup: --keep is the number of backups kept (1 or more)` (code 2).

Ce que contient une sauvegarde, la tâche quotidienne et la rétention : [Sauvegardes](clever.backups.md).

<a name="restore"></a>

## `restore <fichier> [--replay]` et `replay`

```sh
npm run studio-server -- restore ./backup.json --replay --config studio.config.json
npm run studio-server -- replay --config studio.config.json
```

`restore` met une sauvegarde dans une base hébergée **vide** (`store.kind` `postgres` ; une base SQLite est refusée),
vérifie son empreinte, ses tables et ses blobs, puis, avec `--replay`, rejoue le journal expédié au bucket depuis la
sauvegarde. `replay` reprend un rejeu qui s'est arrêté et termine la restauration. Les deux affichent
`{"event":"restored", "rows", "dropped", "backup", "revision", "stopped"}`. `replay` sans restauration en cours :
`replay: no restore is under way` (code 1). La procédure :
[Restaurer le Studio sur une installation neuve](clever.restore-drill.md).

<a name="gc"></a>

## `gc [--delete]`

```sh
npm run studio-server -- gc --config studio.config.json
```

Liste les blobs qu'aucune ligne ne nomme et qui ont plus d'un jour, et les dépôts du worker de plus d'une heure ;
`--delete` les supprime. Affiche `{"event":"collectable"|"collected", "referenced", "unreferenced", "removed",
"staging"}`. Les blobs de la tête et du journal ne sont jamais ramassés. Ne lancez jamais `gc --delete` depuis la base
d'un exercice : il ramasserait des blobs que la production nomme encore.

<a name="worker-command"></a>

## La commande du worker

Le worker est un autre programme : `npm run studio-worker` dans le dépôt, `npx quest-n-click-studio-worker` depuis les
archives. Il n'a pas de sous-commande ; il lit `WORKER_PUBLIC_KEY` (ou `WORKER_PUBLIC_KEY_FILE`), `WORKER_INSTANCE` et
`PORT`. Voir [Outils en ligne de commande](reference.cli.md) et
[Variables d'environnement](reference.environment-variables.md#studio-worker).

<a name="related"></a>

## Identifiants liés

- [Routes de santé et de métriques](team.health-metrics.md), [Rôles et actions](team.roles.md).
- [`tests/studio-server.test.ts`](../../tests/studio-server.test.ts) (`import, serve, export through the command`).
