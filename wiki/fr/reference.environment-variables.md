# Variables d’environnement

Toutes les variables d’environnement que lit quest-n-click, et celles que Clever Cloud et ses add-ons donnent au Studio
hébergé. Chacune a sa propre section : liez-la sous la forme
`reference.environment-variables.md#studio-session-key` (le nom en minuscules, `_` écrit `-`).

<a name="quick-entry"></a>

## Accès rapide, par tâche

- **Déployer un Studio hébergé chez Clever Cloud** : vous posez [`STUDIO_SESSION_KEY`](#studio-session-key) et
  [`STUDIO_WORKER_KEY`](#studio-worker-key) ; la base et le bucket viennent des add-ons liés, laissez donc
  [`STUDIO_DATABASE_URL`](#studio-database-url) et [`STUDIO_S3_KEY_ID`](#studio-s3-key-id) vides là-bas
  ([le premier déploiement](clever.first-deployment.md)).
- **Changer une clé** : [`STUDIO_SESSION_KEY`](#studio-session-key), puis [la rotation des clés](clever.key-rotation.md).
- **Lire les métriques** : [`STUDIO_METRICS_TOKEN`](#studio-metrics-token), puis [la surveillance](clever.monitoring.md).
- **Choisir le jeu sur lequel vous travaillez dans le dépôt du moteur** : [`GAME`](#game).
- **Ouvrir le Studio ou le serveur de développement à votre réseau** : `npm run studio:lan` ou `npm run dev:lan`, qui
  posent [`WEB_SCUMM_LAN`](#web-scumm-lan) pour vous ([tester sur un téléphone par le réseau local](create.lan-testing.md)).
- **Stocker un Reality Bridge dans SQLite ou Postgres** : [`BRIDGE_STORE`](#bridge-store).
- **Une variable croisée dans un message d'erreur** : cherchez son nom dans cette page (chacune a sa section), puis la
  page de dépannage de son lieu : [Studio hébergé](clever.troubleshooting.md), [Studio local](studio.troubleshooting.md),
  [Bridge](bridge.troubleshooting.md).

<a name="how-to-read"></a>

## Comment lire cette page

- **Origine** dit qui pose la variable : vous (le code la lit), la construction, la plateforme (Clever Cloud, GitHub
  Actions, npm, le système), un add-on Clever Cloud, ou un workflow de CI. Une variable qu’une commande de quest-n-click pose elle-même le
  dit : vous ne la posez pas.
- **Secret** : lue une fois au démarrage du Studio Server, puis retirée de son environnement, pour qu’aucun processus
  enfant n’en hérite ; jamais écrite dans un journal. Chaque secret peut aussi venir d’un fichier :
  `STUDIO_SESSION_KEY_FILE=/run/secrets/session` lit la clé dans ce fichier, lisible par son seul propriétaire (mode
  0600) sous Linux et macOS. Le fichier passe avant la variable.
- **Lue par** renvoie aux fichiers du code qui la lisent, dans la version documentée.
- Sur Clever Cloud, posez une variable avec `clever env set NOM valeur` sur la bonne application ; `clever env`
  affiche en entier les valeurs sur plusieurs lignes, filtrez sa sortie avant de la partager.

> [!LIMIT id=generated-scope]
> Les sections qui suivent sont générées depuis `wiki/data/env.json` et depuis le code : ce que lisent `process.env`,
> `import.meta.env`, `os.environ` en Python, les scripts shell de `ops/` et `clevercloud/`, et les workflows de
> `.github/workflows/` (leurs blocs `env:`, `${{ env.X }}`, `$GITHUB_ENV` et leur shell). Une variable lue seulement
> par une bibliothèque tierce (les `OTEL_*` standard, `NODE_OPTIONS`, `PG*`) n’y figure pas.

<!-- env:begin -->

<a name="studio-server"></a>

## Studio Server (Studio hébergé)

Ce que lit l’application `studio-server` : sur Clever Cloud, posez-les avec `clever env set` sur l’application studio, jamais sur le worker. Chaque secret peut venir d’un fichier (`<NOM>_FILE`, mode 0600), et quitte l’environnement une fois lu.

<a name="git-dir"></a>

### `GIT_DIR`

Pas prise dans votre environnement : le Studio Server construit l’environnement de ses propres commandes `git`, y pose `GIT_DIR` sur le dépôt du jeu, et la retire pour `git init`. Une `GIT_DIR` à vous ne leur parvient jamais.

- Origine : posée par le Studio Server lui-même.
- Lue par : [`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts).

<a name="studio-backup-cron"></a>

### `STUDIO_BACKUP_CRON`

`1` active la sauvegarde quotidienne vers le bucket que `clevercloud/cron.json` lance à 03:17 UTC (`ops/studio/backup-cron.sh`). À poser sur l’application studio seulement, jamais sur le worker.

- Origine : vous la posez ; le code la lit.
- Lue par : [`ops/studio/backup-cron.sh`](../../ops/studio/backup-cron.sh).

<a name="studio-backup-keep"></a>

### `STUDIO_BACKUP_KEEP`

Le nombre de sauvegardes que la sauvegarde quotidienne garde dans le bucket (`--keep`) ; 14 quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`ops/studio/backup-cron.sh`](../../ops/studio/backup-cron.sh).

<a name="studio-config"></a>

### `STUDIO_CONFIG`

Le chemin du fichier de configuration, lu quand aucun `--config <fichier>` n’est donné. Il passe avant `STUDIO_CONFIG_JSON`.

- Origine : vous la posez ; le code la lit.
- Lue par : [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts).

<a name="studio-config-json"></a>

### `STUDIO_CONFIG_JSON`

Toute la configuration en JSON sur une ligne, pour une plateforme qui ne donne pas de fichier (Clever Cloud). Elle ne contient aucun secret ; le chargeur refuse une clé inconnue.

- Origine : vous la posez ; le code la lit.
- Lue par : [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts).

<a name="studio-database-url"></a>

### `STUDIO_DATABASE_URL`

L’URI de connexion PostgreSQL (`store.kind: postgres`). Sur Clever Cloud, ne la posez pas : la variable `POSTGRESQL_ADDON_URI` de l’add-on lié est lue à sa place. Pour un exercice de restauration, faites-la pointer vers la base vide de l’exercice, jamais vers la production.

- Origine : vous la posez ; le code la lit.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Depuis un fichier : `STUDIO_DATABASE_URL_FILE` nomme un fichier où la lire à la place (mode 0600 sous Linux et macOS).
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-git-key"></a>

### `STUDIO_GIT_KEY`

Facultative (4.2.3) : la clé de déploiement SSH du dépôt Git du jeu (`git.remote`). Inutile pour un dépôt public en https.

- Origine : vous la posez ; le code la lit.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Depuis un fichier : `STUDIO_GIT_KEY_FILE` nomme un fichier où la lire à la place (mode 0600 sous Linux et macOS).
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-metrics-token"></a>

### `STUDIO_METRICS_TOKEN`

Facultative (4.2.3) : le jeton bearer de `GET /metrics`, 32 caractères ou plus. Sans elle, la route `/metrics` n’existe pas (404).

- Origine : vous la posez ; le code la lit.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Depuis un fichier : `STUDIO_METRICS_TOKEN_FILE` nomme un fichier où la lire à la place (mode 0600 sous Linux et macOS).
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-oidc-client-secret"></a>

### `STUDIO_OIDC_CLIENT_SECRET`

Le secret du fournisseur OpenID pour le client `studio`. Obligatoire quand la configuration a `oidc`.

- Origine : vous la posez ; le code la lit.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Depuis un fichier : `STUDIO_OIDC_CLIENT_SECRET_FILE` nomme un fichier où la lire à la place (mode 0600 sous Linux et macOS).
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-s3-key-id"></a>

### `STUDIO_S3_KEY_ID`

L’identifiant de clé d’accès S3 (Cellar) du bucket (`blobs.kind: s3`). Sur Clever Cloud, `CELLAR_ADDON_KEY_ID` de l’add-on est lue quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Depuis un fichier : `STUDIO_S3_KEY_ID_FILE` nomme un fichier où la lire à la place (mode 0600 sous Linux et macOS).
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-s3-key-secret"></a>

### `STUDIO_S3_KEY_SECRET`

La clé secrète S3 (Cellar) du bucket. Sur Clever Cloud, `CELLAR_ADDON_KEY_SECRET` de l’add-on est lue quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Depuis un fichier : `STUDIO_S3_KEY_SECRET_FILE` nomme un fichier où la lire à la place (mode 0600 sous Linux et macOS).
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-session-key"></a>

### `STUDIO_SESSION_KEY`

Les clés qui scellent les cookies de session des membres : une clé, ou plusieurs séparées par des virgules, chacune de 32 caractères ou plus (`openssl rand -base64 48`). La première scelle ; toutes celles de la liste ouvrent. Pour la faire tourner, mettez la nouvelle clé en tête et gardez l’ancienne dans la liste jusqu’à l’expiration des sessions qu’elle a scellées ; retirer une clé déconnecte les sessions scellées avec elle. Obligatoire avec `oidc`.

- Origine : vous la posez ; le code la lit.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Depuis un fichier : `STUDIO_SESSION_KEY_FILE` nomme un fichier où la lire à la place (mode 0600 sous Linux et macOS).
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-worker-key"></a>

### `STUDIO_WORKER_KEY`

La clé privée Ed25519 (PEM) qui signe les jobs envoyés au worker ; les retours à la ligne peuvent s’écrire `\n`. Produite par `npm run studio-server -- worker-keys --out <dossier>`. Obligatoire avec un worker.

- Origine : vous la posez ; le code la lit.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Depuis un fichier : `STUDIO_WORKER_KEY_FILE` nomme un fichier où la lire à la place (mode 0600 sous Linux et macOS).
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="web-scumm-studio-client"></a>

### `WEB_SCUMM_STUDIO_CLIENT`

Le dossier de la page du Studio construite que le serveur sert, quand la configuration n’a pas de `clientDir` ; `.cache/studio-client` à côté du moteur par défaut. Le lanceur de l’archive de publication la pose.

- Origine : vous la posez ; le code la lit.
- Lue par : [`scripts/pack.mjs`](../../scripts/pack.mjs), [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts).

<a name="studio-worker"></a>

## Worker du Studio

Ce que lit le worker de traitement (`npm run studio-worker`). Il ne détient aucun secret : seulement la clé publique qui vérifie les jobs que le Studio signe.

<a name="worker-instance"></a>

### `WORKER_INSTANCE`

Le nom du seul Studio dont ce worker exécute les jobs : le même que `worker.instance` dans la configuration du Studio.

- Origine : vous la posez ; le code la lit.
- Lue par : [`studio-server/src/worker/main.ts`](../../studio-server/src/worker/main.ts).

<a name="worker-public-key"></a>

### `WORKER_PUBLIC_KEY`

La clé publique Ed25519 (PEM) qui vérifie les jobs signés du Studio : le contenu de `studio-worker.pub`.

- Origine : vous la posez ; le code la lit.
- Lue par : [`studio-server/src/worker/main.ts`](../../studio-server/src/worker/main.ts).

<a name="worker-public-key-file"></a>

### `WORKER_PUBLIC_KEY_FILE`

Un fichier qui contient la clé publique, lu à la place de `WORKER_PUBLIC_KEY` quand elle est posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`studio-server/src/worker/main.ts`](../../studio-server/src/worker/main.ts).

<a name="worker-python-path"></a>

### `WORKER_PYTHON_PATH`

L’endroit où le hook de construction a installé les paquets Python des outils d’images ; `.python` dans le dossier du worker quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`studio-server/src/worker/prepare.ts`](../../studio-server/src/worker/prepare.ts).

<a name="clever-cloud"></a>

## Posées par Clever Cloud et ses add-ons

Clever Cloud les donne à une application, ou les lit lui-même pour la construire et la lancer. Les variables d’un add-on n’arrivent à l’application studio que si l’add-on lui est lié.

<a name="app-folder"></a>

### `APP_FOLDER`

À ne pas poser : les deux applications se construisent depuis la racine du dépôt. Une application qui a contenu un autre projet peut encore en avoir une (`clever env rm APP_FOLDER`).

- Origine : posée par vous ; Clever Cloud la lit.
- Lue par : aucun fichier du code ; la plateforme la lit.

<a name="app-home"></a>

### `APP_HOME`

Le dossier de l’application sur l’instance ; la sauvegarde quotidienne s’y lance (`cd "$APP_HOME"` dans une session `clever ssh` aussi).

- Origine : posée par Clever Cloud.
- Lue par : [`ops/studio/backup-cron.sh`](../../ops/studio/backup-cron.sh).

<a name="cc-health-check-path"></a>

### `CC_HEALTH_CHECK_PATH`

Le chemin que Clever Cloud sonde avant d’envoyer du trafic à une nouvelle instance : `/startz` sur l’application studio.

- Origine : posée par vous ; Clever Cloud la lit.
- Lue par : aucun fichier du code ; la plateforme la lit.

<a name="cc-node-dev-dependencies"></a>

### `CC_NODE_DEV_DEPENDENCIES`

À poser à `install` sur les deux applications : le serveur tourne depuis le dépôt avec `tsx`, une dépendance de développement.

- Origine : posée par vous ; Clever Cloud la lit.
- Lue par : aucun fichier du code ; la plateforme la lit.

<a name="cc-post-build-hook"></a>

### `CC_POST_BUILD_HOOK`

Une commande que Clever Cloud lance après la construction : `npm run studio-client` sur l’application studio ; celle du worker installe les paquets Python de `requirements.txt`, empreintes vérifiées.

- Origine : posée par vous ; Clever Cloud la lit.
- Lue par : aucun fichier du code ; la plateforme la lit.

<a name="cc-run-command"></a>

### `CC_RUN_COMMAND`

La commande qui lance l’application : `npm run studio-server -- serve` sur l’application studio, `npm run studio-worker` sur le worker.

- Origine : posée par vous ; Clever Cloud la lit.
- Lue par : aucun fichier du code ; la plateforme la lit.

<a name="cellar-addon-key-id"></a>

### `CELLAR_ADDON_KEY_ID`

L’identifiant de clé de l’add-on Cellar, lu quand `STUDIO_S3_KEY_ID` n’est pas posée.

- Origine : injectée par l’add-on Cellar de Clever Cloud.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Lue à la place de `STUDIO_S3_KEY_ID` quand `STUDIO_S3_KEY_ID` n’est pas posée.
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="cellar-addon-key-secret"></a>

### `CELLAR_ADDON_KEY_SECRET`

La clé secrète de l’add-on Cellar, lue quand `STUDIO_S3_KEY_SECRET` n’est pas posée.

- Origine : injectée par l’add-on Cellar de Clever Cloud.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Lue à la place de `STUDIO_S3_KEY_SECRET` quand `STUDIO_S3_KEY_SECRET` n’est pas posée.
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="instance-number"></a>

### `INSTANCE_NUMBER`

Le numéro de l’instance de l’application. La sauvegarde quotidienne ne tourne que sur l’instance `0`, pour que deux instances ne sauvegardent pas toutes les deux.

- Origine : posée par Clever Cloud.
- Lue par : [`ops/studio/backup-cron.sh`](../../ops/studio/backup-cron.sh).

<a name="port"></a>

### `PORT`

Le port d’écoute. Clever Cloud la donne aux applications studio et worker ; ailleurs, 8080 quand elle n’est pas posée. Un `port` dans la configuration du Studio passe avant.

- Origine : posée par l’hébergeur (Clever Cloud la donne).
- Lue par : [`scripts/start.mjs`](../../scripts/start.mjs), [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts), [`studio-server/src/worker/main.ts`](../../studio-server/src/worker/main.ts).

<a name="postgresql-addon-uri"></a>

### `POSTGRESQL_ADDON_URI`

L’URI de connexion de l’add-on PostgreSQL. Le Studio Server la lit quand `STUDIO_DATABASE_URL` n’est pas posée.

- Origine : injectée par l’add-on PostgreSQL de Clever Cloud.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Lue à la place de `STUDIO_DATABASE_URL` quand `STUDIO_DATABASE_URL` n’est pas posée.
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="root"></a>

### `ROOT`

Le dossier de l’application, utilisé par `clevercloud/cron.json` (les crons veulent des chemins absolus) et par le script de sauvegarde quand `APP_HOME` manque.

- Origine : posée par Clever Cloud.
- Lue par : [`clevercloud/cron.json`](../../clevercloud/cron.json), [`ops/studio/backup-cron.sh`](../../ops/studio/backup-cron.sh).

<a name="local-tools"></a>

## Moteur, Studio local et outils

Lues par les commandes du moteur, le Studio local et son serveur MCP, dans le dépôt du moteur ou dans un projet créé.

<a name="assets-dir"></a>

### `ASSETS_DIR`

Le dossier des images et sons construits livrés, à la place de `public/assets` (les fichiers propres à une fixture de test).

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/game.ts`](../../tools/game.ts).

<a name="dist-dir"></a>

### `DIST_DIR`

Le dossier construit que mesure `npm run weight` ; `dist` quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/weight.ts`](../../tools/weight.ts).

<a name="furnace-bin"></a>

### `FURNACE_BIN`

Le chemin de l’exécutable Furnace avec lequel la chaîne audio fait son rendu, quand il n’est pas là où `python -m mdpipe setup` l’a mis.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/audio/mdpipe/render.py`](../../tools/audio/mdpipe/render.py).

<a name="game"></a>

### `GAME`

Le jeu de `games/` sur lequel travaillent les commandes du dépôt du moteur (`GAME=reference npm run validate`). Sans elle, le dernier jeu choisi (`npm run game -- <id>`), puis `config.game` de `package.json`, puis `demo`.

- Origine : vous la posez ; le code la lit.
- Lue par : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`.github/workflows/prove.yml`](../../.github/workflows/prove.yml), [`scripts/e2e-studio.mjs`](../../scripts/e2e-studio.mjs), et 9 de plus.

<a name="game-dir"></a>

### `GAME_DIR`

Le dossier de jeu sur lequel travaillent les outils, n’importe où sur le disque. Posée, c’est toujours le dossier lu, quoi que dise `GAME`, à la place de `games/<GAME>` ou du `game/` d’un projet créé ; sans `GAME`, l’identifiant du jeu est le nom du dossier.

- Origine : vous la posez ; le code la lit.
- Lue par : [`scripts/e2e-worker-container.ts`](../../scripts/e2e-worker-container.ts), [`scripts/ops-qualify/setup.mjs`](../../scripts/ops-qualify/setup.mjs), [`tools/assets.py`](../../tools/assets.py), et 3 de plus.

<a name="proof-cache"></a>

### `PROOF_CACHE`

`0` coupe le cache des résultats du solveur pour une exécution (comme `--no-cache`).

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/proof-cache.ts`](../../tools/proof-cache.ts).

<a name="proof-cache-dir"></a>

### `PROOF_CACHE_DIR`

L’endroit où vit le cache des résultats du solveur ; `.cache/proofs` du projet quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/proof-cache.ts`](../../tools/proof-cache.ts).

<a name="python"></a>

### `PYTHON`

L’interpréteur Python que lance `quest-n-click assets` ; `python3` quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`cli/quest-n-click.mjs`](../../cli/quest-n-click.mjs).

<a name="web-scumm-allow-custom-provider"></a>

### `WEB_SCUMM_ALLOW_CUSTOM_PROVIDER`

`1` permet à l’Assistant du Studio d’appeler une URL de fournisseur que vous saisissez vous-même ; refusé sinon.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/studio/assistant.ts`](../../tools/studio/assistant.ts).

<a name="web-scumm-dev-url"></a>

### `WEB_SCUMM_DEV_URL`

Le serveur de développement qu’ouvre l’outil MCP `screenshot` ; `http://localhost:5173/` quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/mcp/server.ts`](../../tools/mcp/server.ts).

<a name="web-scumm-lan"></a>

### `WEB_SCUMM_LAN`

`1` fait écouter le serveur de développement et le Studio local sur le réseau local, derrière un jeton. `npm run dev:lan` et `studio:lan` la posent.

- Origine : posée par `npm run dev:lan` et `studio:lan`.
- Lue par : [`tools/studio/security.ts`](../../tools/studio/security.ts), [`vite.config.ts`](../../vite.config.ts).

<a name="web-scumm-project"></a>

### `WEB_SCUMM_PROJECT`

Le projet créé sur lequel travaillent les outils du moteur. La commande `quest-n-click` la pose sur le dossier où elle tourne ; vous ne la posez pas vous-même.

- Origine : posée par la commande `quest-n-click`.
- Lue par : [`tools/assets.py`](../../tools/assets.py), [`tools/game.ts`](../../tools/game.ts).

<a name="web-scumm-studio-hosts"></a>

### `WEB_SCUMM_STUDIO_HOSTS`

Les noms d’hôte auxquels répond le Studio local en mode réseau local, séparés par des virgules ; tout autre `Host` est refusé. `studio:lan` la pose d’après les adresses de la machine.

- Origine : posée par `npm run dev:lan` et `studio:lan`.
- Lue par : [`tools/studio/security.ts`](../../tools/studio/security.ts).

<a name="web-scumm-studio-token"></a>

### `WEB_SCUMM_STUDIO_TOKEN`

Le jeton que demande le Studio local en mode réseau local. `studio:lan` en tire un au hasard sauf si vous la posez.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/serve-args.ts`](../../tools/serve-args.ts), [`tools/studio/security.ts`](../../tools/studio/security.ts).

<a name="build"></a>

## Construction des pages

Lues quand Vite construit le jeu, le Studio ou une prévisualisation. Les scripts npm posent la plupart d’entre elles ; `VITE_*`, `BASE_URL` et `DEV` finissent dans la page construite.

<a name="base-path"></a>

### `BASE_PATH`

Le sous-chemin sous lequel le jeu est servi (`/<dépôt>/` sur GitHub Pages) ; `/` quand elle n’est pas posée.

- Origine : lue à la construction de la page ou du paquet.
- Lue par : [`tools/vite/plugins.ts`](../../tools/vite/plugins.ts).

<a name="base-url"></a>

### `BASE_URL`

La base pour laquelle la page a été construite, tirée de `BASE_PATH`.

- Origine : posée par Vite (lue à la construction de la page ou du paquet).
- Lue par : [`src/main.ts`](../../src/main.ts), [`src/studio/api.ts`](../../src/studio/api.ts), [`src/studio/game-origin.ts`](../../src/studio/game-origin.ts).

<a name="dev"></a>

### `DEV`

Vrai sous le serveur de développement (`npm run dev`), faux dans une version construite.

- Origine : posée par Vite (lue à la construction de la page ou du paquet).
- Lue par : [`src/main.ts`](../../src/main.ts).

<a name="studio"></a>

### `STUDIO`

`1` construit ou sert les pages du Studio à côté du jeu (`npm run studio`, le Studio de démonstration).

- Origine : posée par les scripts npm (lue à la construction de la page ou du paquet).
- Lue par : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`tools/vite/plugins.ts`](../../tools/vite/plugins.ts), [`vite.config.ts`](../../vite.config.ts).

<a name="studio-client"></a>

### `STUDIO_CLIENT`

`1` ne construit que la page du Studio hébergé (`npm run studio-client`).

- Origine : posée par `npm run studio-client` (lue à la construction de la page ou du paquet).
- Lue par : [`vite.config.ts`](../../vite.config.ts).

<a name="vite-studio-demo"></a>

### `VITE_STUDIO_DEMO`

`1` construit le Studio de démonstration, qui tourne dans le navigateur sans serveur (`npm run build:studio-demo`).

- Origine : posée par `npm run build:studio-demo` (lue à la construction de la page ou du paquet).
- Lue par : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`src/engine/dev/editor.ts`](../../src/engine/dev/editor.ts), [`src/main.ts`](../../src/main.ts), et 1 de plus.

<a name="vite-studio-hosted"></a>

### `VITE_STUDIO_HOSTED`

`1` construit le Studio pour un Studio Server (`npm run studio-client`).

- Origine : posée par `npm run studio-client` (lue à la construction de la page ou du paquet).
- Lue par : [`src/studio/main.ts`](../../src/studio/main.ts).

<a name="vite-studio-preview"></a>

### `VITE_STUDIO_PREVIEW`

`1` dans la prévisualisation d’une révision, que le worker construit avec les outils d’édition ; `0` dans une version publiée.

- Origine : posée par le worker du Studio (lue à la construction de la page ou du paquet).
- Lue par : [`src/main.ts`](../../src/main.ts), [`studio-server/src/worker/preview-build.ts`](../../studio-server/src/worker/preview-build.ts).

<a name="bridge"></a>

## Reality Bridge

Lues par `quest-n-click-bridge` (ou `npm run bridge` dans le dépôt du moteur).

<a name="bridge-store"></a>

### `BRIDGE_STORE`

Le stockage du Bridge quand aucun `--store=` n’est donné : `jsonl`, `sqlite`, `sqlite:<fichier>` ou une URL `postgres://`. Elle passe avant `store` de `config.json`.

- Origine : vous la posez ; le code la lit.
- Lue par : [`bridge/src/cli-store.ts`](../../bridge/src/cli-store.ts), [`tools/load-report.ts`](../../tools/load-report.ts).

<a name="bridge-store-file"></a>

### `BRIDGE_STORE_FILE`

Un fichier qui contient l’URL du stockage, lu quand `BRIDGE_STORE` est vide, pour qu’un mot de passe de base soit monté en fichier secret et n’apparaisse jamais dans une liste de processus.

- Origine : vous la posez ; le code la lit.
- Lue par : [`bridge/src/cli-store.ts`](../../bridge/src/cli-store.ts).

<a name="otel-exporter-otlp-endpoint"></a>

### `OTEL_EXPORTER_OTLP_ENDPOINT`

L’adresse où le Bridge exporte ses mesures en OTLP, quand `@opentelemetry/sdk-node` est installé à côté ; rien n’est exporté sinon. Le SDK lit lui-même les autres variables `OTEL_*` standard.

- Origine : vous la posez ; le code la lit.
- Lue par : [`bridge/src/telemetry.ts`](../../bridge/src/telemetry.ts).

<a name="contributing"></a>

## Tests, CI et versions du moteur

Lues seulement par les scripts de test, de CI et de publication du dépôt du moteur. Un projet créé n’en a jamais besoin.

<a name="bridge-pg-module"></a>

### `BRIDGE_PG_MODULE`

Le module `pg` qu’importe `tools/backup-memory.ts`, quand ce n’est pas celui du dépôt.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/backup-memory.ts`](../../tools/backup-memory.ts).

<a name="bridge-pg-url"></a>

### `BRIDGE_PG_URL`

Une URL PostgreSQL sur laquelle les tests font tourner le stockage du Bridge et les mutations ; ces tests sont sautés sans elle.

- Origine : vous la posez ; le code la lit.
- Lue par : [`.github/workflows/candidate.yml`](../../.github/workflows/candidate.yml), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`.github/workflows/mutation.yml`](../../.github/workflows/mutation.yml), et 2 de plus.

<a name="consumer-pg-url"></a>

### `CONSUMER_PG_URL`

Une URL PostgreSQL sur laquelle `npm run external-consumer` fait aussi tourner le Bridge installé.

- Origine : vous la posez ; le code la lit.
- Lue par : [`.github/workflows/candidate.yml`](../../.github/workflows/candidate.yml), [`scripts/external-consumer.mjs`](../../scripts/external-consumer.mjs).

<a name="e2e-browser"></a>

### `E2E_BROWSER`

Le navigateur dans lequel tourne un test de bout en bout (`chromium`, `firefox`, `webkit`) ; Chromium quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`scripts/e2e-a11y.mjs`](../../scripts/e2e-a11y.mjs), [`scripts/e2e-pwa.mjs`](../../scripts/e2e-pwa.mjs), et 2 de plus.

<a name="e2e-cpu"></a>

### `E2E_CPU`

Un facteur de ralentissement du processeur pour les tests de bout en bout sous Chromium (`4` tourne quatre fois plus lentement).

- Origine : vous la posez ; le code la lit.
- Lue par : [`scripts/e2e/lib.mjs`](../../scripts/e2e/lib.mjs).

<a name="e2e-debug"></a>

### `E2E_DEBUG`

Toute valeur fait afficher au test de bout en bout du Studio hébergé ce qu’il fait.

- Origine : vous la posez ; le code la lit.
- Lue par : [`scripts/e2e-studio-hosted.ts`](../../scripts/e2e-studio-hosted.ts).

<a name="e2e-input"></a>

### `E2E_INPUT`

`keyboard` joue la soluce de bout en bout au clavier au lieu de touchers.

- Origine : vous la posez ; le code la lit.
- Lue par : [`scripts/e2e/lib.mjs`](../../scripts/e2e/lib.mjs).

<a name="e2e-out"></a>

### `E2E_OUT`

L’endroit où un test de bout en bout écrit ses captures et ses rapports.

- Origine : vous la posez ; le code la lit.
- Lue par : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`scripts/e2e-a11y.mjs`](../../scripts/e2e-a11y.mjs), [`scripts/e2e/lib.mjs`](../../scripts/e2e/lib.mjs).

<a name="e2e-weight-debug"></a>

### `E2E_WEIGHT_DEBUG`

Toute valeur fait afficher à `e2e:weight` les requêtes qu’il a comptées.

- Origine : vous la posez ; le code la lit.
- Lue par : [`scripts/e2e-weight.mjs`](../../scripts/e2e-weight.mjs).

<a name="gh-token"></a>

### `GH_TOKEN`

Le jeton GitHub de la commande `gh`. `tools/release/run-jobs.mjs` la lit avant `GITHUB_TOKEN` ; `npm run wiki -- publish` ne la lit que si `GITHUB_TOKEN` n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`.github/workflows/candidate.yml`](../../.github/workflows/candidate.yml), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml), et 3 de plus.

<a name="github-token"></a>

### `GITHUB_TOKEN`

Un jeton GitHub pour les outils de publication et de documentation. `npm run wiki -- publish` la lit avant `GH_TOKEN` (après la clé de déploiement `WIKI_DEPLOY_KEY`) ; `tools/release/run-jobs.mjs` ne la lit que si `GH_TOKEN` n’est pas posée. Sur un runner, GitHub Actions la donne.

- Origine : vous la posez ; le code la lit.
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml), [`tools/release/run-jobs.mjs`](../../tools/release/run-jobs.mjs), [`tools/wiki.ts`](../../tools/wiki.ts).

<a name="mutation-set"></a>

### `MUTATION_SET`

L’ensemble de tests qui juge un mutant (`core`, `reality`…) ; `core` quand elle n’est pas posée. `npm run test:mutation:*` la pose.

- Origine : vous la posez ; le code la lit.
- Lue par : [`vitest.mutation.config.ts`](../../vitest.mutation.config.ts).

<a name="needs"></a>

### `NEEDS`

Les résultats des jobs d’un workflow, en JSON, que lit le verdict du candidat. Le workflow la pose.

- Origine : vous la posez ; le code la lit.
- Lue par : [`.github/workflows/candidate.yml`](../../.github/workflows/candidate.yml), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`tools/release/candidate.mjs`](../../tools/release/candidate.mjs).

<a name="qualify-app"></a>

### `QUALIFY_APP`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : l’arbre commité que lit le worker des speedruns.

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-build"></a>

### `QUALIFY_BUILD`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : le dossier du contexte de construction de l’image du Bridge.

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-data"></a>

### `QUALIFY_DATA`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : le dossier des données des deux tenants.

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-gid"></a>

### `QUALIFY_GID`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : l’identifiant de groupe des conteneurs (1000 par défaut).

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml), [`scripts/ops-qualify/backup.mjs`](../../scripts/ops-qualify/backup.mjs).

<a name="qualify-modules"></a>

### `QUALIFY_MODULES`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : les modules installés montés à côté.

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-port"></a>

### `QUALIFY_PORT`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : le port local du proxy (8443 par défaut).

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-port-1"></a>

### `QUALIFY_PORT_1`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : le deuxième port local du proxy (8444 par défaut).

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-port-2"></a>

### `QUALIFY_PORT_2`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : le troisième port local du proxy (8445 par défaut).

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-port-3"></a>

### `QUALIFY_PORT_3`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : le quatrième port local du proxy (8446 par défaut).

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-secrets"></a>

### `QUALIFY_SECRETS`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : le dossier du mot de passe de la base et de l’URL du stockage.

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-uid"></a>

### `QUALIFY_UID`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : l’identifiant d’utilisateur des conteneurs (1000 par défaut).

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml), [`scripts/ops-qualify/backup.mjs`](../../scripts/ops-qualify/backup.mjs).

<a name="ship-pids"></a>

### `SHIP_PIDS`

Le dossier où `npm run ship` écrit ses identifiants de processus ; `.cache/pids` quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/release/lib.mjs`](../../tools/release/lib.mjs).

<a name="ship-trailers"></a>

### `SHIP_TRAILERS`

Des lignes de pied supplémentaires que `npm run ship` ajoute à un commit de fusion, après `Agent: Claude`.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/release/ship.mjs`](../../tools/release/ship.mjs).

<a name="studio-test-s3"></a>

### `STUDIO_TEST_S3`

Le point d’accès S3, les identifiants et le bucket du stockage objet de la CI, en une URL, pour les tests du Studio hébergé.

- Origine : vous la posez ; le code la lit.
- Lue par : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`ops/studio/ci/s3-ready.ts`](../../ops/studio/ci/s3-ready.ts).

<a name="web-scumm-repo"></a>

### `WEB_SCUMM_REPO`

Le dépôt GitHub sur lequel travaillent les outils de publication ; `Quest-n-Click/quest-n-click` quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/release/lib.mjs`](../../tools/release/lib.mjs), [`tools/release/provenance.mjs`](../../tools/release/provenance.mjs).

<a name="web-scumm-repo-id"></a>

### `WEB_SCUMM_REPO_ID`

L’id numérique que doit nommer le certificat de chaque attestation ; `1402166796` (ce dépôt, sous chacun de ses noms) quand elle n’est pas posée. Un fork qui ne pose que `WEB_SCUMM_REPO` n’est pas vérifié par id.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/release/provenance.mjs`](../../tools/release/provenance.mjs).

<a name="wiki-deploy-key"></a>

### `WIKI_DEPLOY_KEY`

La clé de déploiement SSH qui pousse la documentation vers le wiki GitHub (`npm run wiki -- publish`) ; `GITHUB_TOKEN` sert sans elle.

- Origine : vous la posez ; le code la lit.
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml), [`tools/wiki.ts`](../../tools/wiki.ts).

<a name="system"></a>

## Posées par le système, npm ou GitHub Actions

Personne ne les pose à la main : le système, npm, Vitest ou un runner GitHub s’en charge. Le code se contente de les lire.

<a name="github-actions"></a>

### `GITHUB_ACTIONS`

`true` sur un runner GitHub : les tests et les cliquets adaptent leur sortie et leurs limites.

- Origine : posée par GitHub Actions.
- Lue par : [`scripts/e2e-pwa.mjs`](../../scripts/e2e-pwa.mjs), [`scripts/e2e.mjs`](../../scripts/e2e.mjs), [`tools/coverage-ratchet.ts`](../../tools/coverage-ratchet.ts), et 1 de plus.

<a name="github-api-url"></a>

### `GITHUB_API_URL`

L’adresse de l’API GitHub sur un runner.

- Origine : posée par GitHub Actions.
- Lue par : [`tools/release/run-jobs.mjs`](../../tools/release/run-jobs.mjs).

<a name="github-env"></a>

### `GITHUB_ENV`

Le fichier auquel une étape ajoute des lignes `NOM=valeur`, pour les étapes suivantes de son job.

- Origine : posée par GitHub Actions.
- Lue par : [`.github/workflows/candidate.yml`](../../.github/workflows/candidate.yml), [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml), [`.github/workflows/release.yml`](../../.github/workflows/release.yml).

<a name="github-output"></a>

### `GITHUB_OUTPUT`

Le fichier où une étape écrit ses sorties.

- Origine : posée par GitHub Actions.
- Lue par : [`.github/workflows/candidate.yml`](../../.github/workflows/candidate.yml), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`.github/workflows/nightly.yml`](../../.github/workflows/nightly.yml), et 1 de plus.

<a name="github-repository"></a>

### `GITHUB_REPOSITORY`

Le dépôt où tourne un workflow (`owner/name`) ; le job `npm-stage` de release.yml y compare le `repository` de chaque paquet, comme le fait la provenance de npm, et `tools/release/main-ci.mjs` y liste les runs `ci` de main (4.5.3).

- Origine : posée par GitHub Actions.
- Lue par : [`.github/workflows/release.yml`](../../.github/workflows/release.yml), [`tools/release/main-ci.mjs`](../../tools/release/main-ci.mjs), [`tools/release/npm-stage.mjs`](../../tools/release/npm-stage.mjs).

<a name="github-sha"></a>

### `GITHUB_SHA`

Le commit d’un lancement ; pour release.yml, lancé par le push du tag depuis la 4.5.3, le commit du tag, que nomme la provenance de npm : `npm-stage` l’écrit dans son résumé et le signale s’il n’est pas celui du tag.

- Origine : posée par GitHub Actions.
- Lue par : [`tools/release/npm-stage.mjs`](../../tools/release/npm-stage.mjs).

<a name="github-step-summary"></a>

### `GITHUB_STEP_SUMMARY`

Le fichier où un job écrit son résumé ; `npm run ci:plan` y écrit le plan.

- Origine : posée par GitHub Actions.
- Lue par : [`.github/workflows/candidate.yml`](../../.github/workflows/candidate.yml), [`.github/workflows/nightly.yml`](../../.github/workflows/nightly.yml), [`tools/ci-plan.ts`](../../tools/ci-plan.ts), et 1 de plus.

<a name="home"></a>

### `HOME`

Le dossier personnel de l’utilisateur. Le script de la chaîne A7 le refuse comme dossier de sortie ; le Studio Server donne à ses propres commandes `git` un `HOME` dans son dossier de travail, jamais le vôtre.

- Origine : posée par le système d’exploitation.
- Lue par : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`docs/dev/acceptance/a7-chain.sh`](../../docs/dev/acceptance/a7-chain.sh).

<a name="imageos"></a>

### `ImageOS`

L’image du runner, notée à côté d’une mesure.

- Origine : posée par GitHub Actions.
- Lue par : [`tools/backup-memory.ts`](../../tools/backup-memory.ts), [`tools/load-median.ts`](../../tools/load-median.ts), [`tools/release/baseline.mjs`](../../tools/release/baseline.mjs).

<a name="npm-config-userconfig"></a>

### `NPM_CONFIG_USERCONFIG`

Le fichier de configuration utilisateur de npm ; `npm-stage` refuse celui qui contient un jeton d’authentification (OIDC seulement).

- Origine : posée par npm, ou qui le lance.
- Lue par : [`tools/release/npm-stage.mjs`](../../tools/release/npm-stage.mjs).

<a name="path"></a>

### `PATH`

Le chemin de recherche du système. Le Studio Server et le worker la passent à leurs processus enfants, et rien d’autre de l’environnement.

- Origine : posée par le système d’exploitation.
- Lue par : [`bridge/src/runs.ts`](../../bridge/src/runs.ts), [`scripts/e2e-worker-container.ts`](../../scripts/e2e-worker-container.ts), [`scripts/studio-install-smoke.mjs`](../../scripts/studio-install-smoke.mjs), et 3 de plus.

<a name="pwd"></a>

### `PWD`

Le dossier courant du shell.

- Origine : posée par le shell.
- Lue par : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

<a name="runner-os"></a>

### `RUNNER_OS`

Le système du runner, noté à côté d’une mesure.

- Origine : posée par GitHub Actions.
- Lue par : [`tools/backup-memory.ts`](../../tools/backup-memory.ts), [`tools/load-median.ts`](../../tools/load-median.ts), [`tools/release/baseline.mjs`](../../tools/release/baseline.mjs).

<a name="runner-temp"></a>

### `RUNNER_TEMP`

Le dossier temporaire du runner : la release y garde la réponse de la revalidation du site web.

- Origine : posée par GitHub Actions.
- Lue par : [`.github/workflows/release.yml`](../../.github/workflows/release.yml).

<a name="systemroot"></a>

### `SystemRoot`

Le dossier de Windows ; les outils y trouvent `tar.exe`.

- Origine : posée par Windows.
- Lue par : [`scripts/lib/archive-harness.mjs`](../../scripts/lib/archive-harness.mjs), [`tools/field/field.ts`](../../tools/field/field.ts).

<a name="vitest"></a>

### `VITEST`

Posée pendant que Vitest tourne : le plugin du Studio local ne lance alors rien.

- Origine : posée par Vitest.
- Lue par : [`tools/studio/plugin.ts`](../../tools/studio/plugin.ts).

<a name="npm-lifecycle-event"></a>

### `npm_lifecycle_event`

Le script npm en cours ; un outil qui écrit le jeu l’enregistre comme auteur du changement.

- Origine : posée par npm.
- Lue par : [`tools/game-write.ts`](../../tools/game-write.ts).

<a name="workflows"></a>

## Dans les workflows de CI

Posées et lues seulement par les workflows de `.github/workflows/` : une entrée passée au shell d’une étape par `env:`, ou une valeur qu’une étape laisse à la suivante dans `$GITHUB_ENV`. Rien à poser à la main.

<a name="all"></a>

### `ALL`

ci : `true` quand tous les contrôles tournent (un push, ou une pull request étiquetée `full-ci`).

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

<a name="archive"></a>

### `ARCHIVE`

docs-publish : le chemin de l’archive à publier.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml).

<a name="archive-sha"></a>

### `ARCHIVE_SHA`

docs-publish : le sha256 de cette archive.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml).

<a name="called"></a>

### `CALLED`

docs-publish : `true` quand release.yml l’appelle, avec une archive vérifiée.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml).

<a name="candidate"></a>

### `CANDIDATE`

docs-publish : le lancement candidat dont le rapport de tests est lu.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml), [`.github/workflows/release.yml`](../../.github/workflows/release.yml).

<a name="dispatched-mode"></a>

### `DISPATCHED_MODE`

docs-publish : le mode choisi à la main (`revision`, `rollback`, `promote`, `preview`).

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml).

<a name="docs-archive"></a>

### `DOCS_ARCHIVE`

release : l’archive de documentation de la version, quand elle en a une.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/release.yml`](../../.github/workflows/release.yml).

<a name="extra-assets"></a>

### `EXTRA_ASSETS`

release : les autres fichiers déposés avec la version.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/release.yml`](../../.github/workflows/release.yml).

<a name="file"></a>

### `FILE`

mutation : un seul fichier à muter, choisi à la main.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/mutation.yml`](../../.github/workflows/mutation.yml).

<a name="in-candidate"></a>

### `IN_CANDIDATE`

docs-publish : le lancement candidat que passe release.yml.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml).

<a name="in-revision"></a>

### `IN_REVISION`

docs-publish : la révision de documentation que passe release.yml (`r1`).

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml).

<a name="in-sha"></a>

### `IN_SHA`

docs-publish : le commit du tag que passe release.yml.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml).

<a name="in-sha256"></a>

### `IN_SHA256`

docs-publish : le sha256 de l’archive vérifiée par `ship verify`.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml).

<a name="in-tag"></a>

### `IN_TAG`

docs-publish : le tag de version que passe release.yml.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml).

<a name="mode"></a>

### `MODE`

docs-publish : le mode décidé pour le lancement, laissé aux étapes suivantes.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml).

<a name="mutation"></a>

### `MUTATION`

ci : `true` quand une pull request étiquetée `full-ci` lance aussi les tests de mutation.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

<a name="npm-publish-node"></a>

### `NPM_PUBLISH_NODE`

release : la version de Node.js sur laquelle tourne la publication npm.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/release.yml`](../../.github/workflows/release.yml).

<a name="npm-publish-npm"></a>

### `NPM_PUBLISH_NPM`

release : la version de npm qui publie.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/release.yml`](../../.github/workflows/release.yml).

<a name="p"></a>

### `P`

release : le préfixe des noms de fichiers de la version (`quest-n-click`).

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/release.yml`](../../.github/workflows/release.yml).

<a name="postgres-db"></a>

### `POSTGRES_DB`

La base du conteneur de service PostgreSQL.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/candidate.yml`](../../.github/workflows/candidate.yml), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`.github/workflows/mutation.yml`](../../.github/workflows/mutation.yml), et 1 de plus.

<a name="postgres-password"></a>

### `POSTGRES_PASSWORD`

Le mot de passe du conteneur de service PostgreSQL, pour la CI seulement.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/candidate.yml`](../../.github/workflows/candidate.yml), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`.github/workflows/mutation.yml`](../../.github/workflows/mutation.yml), et 1 de plus.

<a name="postgres-user"></a>

### `POSTGRES_USER`

L’utilisateur du conteneur de service PostgreSQL, lu par son image.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/candidate.yml`](../../.github/workflows/candidate.yml), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`.github/workflows/mutation.yml`](../../.github/workflows/mutation.yml), et 1 de plus.

<a name="product-tag"></a>

### `PRODUCT_TAG`

docs-publish : le tag du produit que décrit la documentation.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml).

<a name="profile"></a>

### `PROFILE`

candidate : le profil du test de déploiement, `full` lancé à la main, `short` sinon.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/candidate.yml`](../../.github/workflows/candidate.yml).

<a name="release-tag"></a>

### `RELEASE_TAG`

docs-publish : la version GitHub qui porte l’archive (`v<v>` ou `docs-v<v>-r<n>`).

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml).

<a name="repo"></a>

### `REPO`

Le dépôt où tourne le workflow (`propriétaire/nom`), pour ses appels à `gh`.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml).

<a name="reused"></a>

### `REUSED`

docs-publish : `true` quand une version déjà créée par un lancement précédent est réutilisée.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml).

<a name="revision"></a>

### `REVISION`

docs-publish : la révision de documentation publiée (`r1`, `r2`…).

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml).

<a name="run"></a>

### `RUN`

ci : si le plan demande les jobs Reality.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

<a name="run-id"></a>

### `RUN_ID`

docs-publish : l’identifiant de ce lancement, l’identifiant de construction de l’archive.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml).

<a name="run-ref"></a>

### `RUN_REF`

docs-publish : la ref sur laquelle tourne le lancement, vérifiée selon son mode.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml).

<a name="set"></a>

### `SET`

mutation : l’ensemble de mutation choisi à la main.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/mutation.yml`](../../.github/workflows/mutation.yml).

<a name="sha"></a>

### `SHA`

release : le commit qu’a testé le lancement candidat.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/release.yml`](../../.github/workflows/release.yml).

<a name="site-revalidate-secret"></a>

### `SITE_REVALIDATE_SECRET`

release : le secret du dépôt envoyé en `Authorization: Bearer` à `/api/revalidate` du site web ; vide, l'appel est sauté avec un avis.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/release.yml`](../../.github/workflows/release.yml).

<a name="site-url"></a>

### `SITE_URL`

release : le site web du projet que la release fait revalider (`<SITE_URL>/api/revalidate`) ; la variable de dépôt `SITE_URL`, sinon `https://quest-n-click.cleverapps.io`.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/release.yml`](../../.github/workflows/release.yml).

<a name="store"></a>

### `STORE`

candidate : le stockage que mesure `tools/backup-memory.ts`, `sqlite` ou une URL PostgreSQL.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/candidate.yml`](../../.github/workflows/candidate.yml).

<a name="studio-test-captures"></a>

### `STUDIO_TEST_CAPTURES`

ci : `1` garde les captures du test du Studio hébergé.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

<a name="studio-test-keycloak"></a>

### `STUDIO_TEST_KEYCLOAK`

ci : le service Keycloak avec lequel se connecte le test de bout en bout du Studio hébergé.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

<a name="studio-test-keycloak-admin"></a>

### `STUDIO_TEST_KEYCLOAK_ADMIN`

ci : l’administrateur de ce Keycloak, pour la CI seulement.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

<a name="studio-test-pg-url"></a>

### `STUDIO_TEST_PG_URL`

ci : le service PostgreSQL qu’utilisent les tests du Studio hébergé.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

<a name="tag"></a>

### `TAG`

release : le tag publié.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/release.yml`](../../.github/workflows/release.yml).

<a name="target"></a>

### `TARGET`

docs-publish : le `<version>[-r<n>]` que vise un retour arrière ou une promotion.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml).

<a name="version"></a>

### `VERSION`

docs-publish : la version du produit à publier (son entrée `version`).

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/docs-publish.yml`](../../.github/workflows/docs-publish.yml).

<a name="want"></a>

### `WANT`

candidate : le SHA complet qu’un lancement à la main doit tester (son entrée `sha`).

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/candidate.yml`](../../.github/workflows/candidate.yml).

<a name="web"></a>

### `WEB`

release : la démo du site web, `<P>-<tag>-web.tar.gz`, quand le candidat en a fait une (depuis la 4.5.2) ; vide avant.

- Origine : posée par un workflow de `.github/workflows/` (CI et publications).
- Lue par : [`.github/workflows/release.yml`](../../.github/workflows/release.yml).

<!-- env:end -->
