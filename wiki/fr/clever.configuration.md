# Configuration

Le Studio Server lit une configuration JSON, qui ne contient aucun secret, et quelques secrets, chacun depuis une
variable ou un fichier. Cette page pose les deux sur les deux applications Clever Cloud, et sert de référence de
`STUDIO_CONFIG_JSON`, champ par champ.

<a name="what-you-get"></a>

## Ce que vous obtenez

L’application studio et l’application worker portent chaque variable dont elles ont besoin pour se construire et
démarrer : les commandes de lancement, les hooks de build, la configuration sur une ligne, et les secrets, posés depuis
des fichiers pour qu’aucune valeur ne soit tapée ni affichée.

<a name="context-and-versions"></a>

## Contexte et versions

- Un Studio hébergé sur Clever Cloud, déployé depuis le dépôt du moteur, à partir de la 4.2.3 (`STUDIO_METRICS_TOKEN`,
  `STUDIO_BACKUP_CRON` et `git` sont arrivés en 4.2.3).
- **Vérifié sur : 19 octobre 2026, par le déploiement de référence** (moteur au commit 52e68932, puis c66fbf56,
  package.json 4.2.2 avant le tag 4.2.3) : ces variables, avec `STUDIO_METRICS_TOKEN` et `STUDIO_BACKUP_CRON=1`
  posés, et trois noms en `*.cleverapps.io`. Les commandes exactes de cette page ne sont pas vérifiées sur une
  installation réelle.

<a name="prerequisites"></a>

## Prérequis

- [Applications et add-ons](clever.apps-addons.md), [Domaines et TLS](clever.domains-tls.md), et le fournisseur :
  [Keycloak](clever.keycloak.md) ou [OIDC générique](clever.generic-oidc.md).
- Sur votre machine : le dépôt du moteur, `npm ci` fait, `openssl`, et un dossier vide tenu hors de Git pour les
  secrets (`~/secrets/my-game/` plus bas).

<a name="where-to-run"></a>

## Où lancer les commandes

Sur votre machine, dans le dépôt du moteur où les deux applications sont liées sous leur alias
([Applications et add-ons](clever.apps-addons.md)).

> [!LIMIT id=clever-env-prints-values]
> `clever env` affiche chaque valeur, y compris celles sur plusieurs lignes (une clé PEM en occupe beaucoup). Ne collez
> jamais sa sortie où que ce soit ; filtrez-la sur les noms :
> `clever env --alias my-game-studio | grep -oE '^[A-Z][A-Z0-9_]*='`.

<a name="steps"></a>

## Étapes

<!-- step: job-keys -->
1. Créez les clés des jobs. Le worker n’exécute que les jobs que le Studio signe de sa clé privée :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   mkdir -p ~/secrets/my-game && npm run studio-server -- worker-keys --out ~/secrets/my-game
   ```

   `studio-worker.key` (0600) est celle du Studio, `studio-worker.pub` celle du worker. La commande refuse de les
   écraser, et ne les affiche jamais.

<!-- step: other-secrets -->
2. Créez la clé de session et, si vous voulez `/metrics`, son jeton :

   ```sh
   # sur votre machine
   openssl rand -base64 48 > ~/secrets/my-game/session-key && chmod 600 ~/secrets/my-game/session-key
   openssl rand -base64 32 > ~/secrets/my-game/metrics-token && chmod 600 ~/secrets/my-game/metrics-token
   ```

<!-- step: studio-vars -->
3. Posez les variables ordinaires de l’application studio :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever env set --alias my-game-studio CC_NODE_DEV_DEPENDENCIES install
   clever env set --alias my-game-studio CC_POST_BUILD_HOOK "npm run studio-client"
   clever env set --alias my-game-studio CC_RUN_COMMAND "npm run studio-server -- serve"
   clever env set --alias my-game-studio CC_HEALTH_CHECK_PATH /startz
   clever env set --alias my-game-studio STUDIO_BACKUP_CRON 1
   ```

<!-- step: studio-secrets -->
4. Posez ses secrets depuis leurs fichiers. Le texte d’une clé commence par `-----BEGIN`, que `clever env set` lit
   comme une option si `--` ne le précède pas :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever env set --alias my-game-studio -- STUDIO_WORKER_KEY "$(cat ~/secrets/my-game/studio-worker.key)"
   clever env set --alias my-game-studio -- STUDIO_SESSION_KEY "$(cat ~/secrets/my-game/session-key)"
   clever env set --alias my-game-studio -- STUDIO_METRICS_TOKEN "$(cat ~/secrets/my-game/metrics-token)"
   ```

   `STUDIO_OIDC_CLIENT_SECRET` a été posé avec le fournisseur ([Keycloak](clever.keycloak.md#steps)). Les identifiants
   de la base et de Cellar viennent des add-ons (`POSTGRESQL_ADDON_URI`, `CELLAR_ADDON_KEY_ID`,
   `CELLAR_ADDON_KEY_SECRET`) : ne posez rien pour eux.

<!-- step: studio-config -->
5. Écrivez la configuration dans un fichier, vérifiez-la, et posez-la sur une ligne dans `STUDIO_CONFIG_JSON` :

   ```studio-config
   {
     "publicUrl": "https://studio.example.fr",
     "playUrl": "https://play.example.fr",
     "game": "my-game",
     "workDir": "/home/bas/work",
     "host": "0.0.0.0",
     "trustProxy": ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
     "store": { "kind": "postgres" },
     "blobs": { "kind": "s3", "host": "cellar-c2.services.clever-cloud.com", "bucket": "my-game-studio" },
     "oidc": { "issuer": "https://keycloak.example.fr/realms/web-scumm", "clientId": "studio", "audience": "studio-api", "cliClientId": "web-scumm-cli" },
     "worker": { "url": "https://worker.example.fr", "instance": "my-game-studio" }
   }
   ```

   ```sh
   # sur votre machine, dans le dépôt du moteur, le fichier ci-dessus enregistré sous ~/secrets/my-game/studio.config.json
   clever env set --alias my-game-studio STUDIO_CONFIG_JSON "$(node -p 'JSON.stringify(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")))' ~/secrets/my-game/studio.config.json)"
   ```

   Le [`ops/studio/studio.config.example.json`](../../ops/studio/studio.config.example.json) du dépôt est le même
   exemple. La configuration ne contient aucun secret.

<!-- step: worker-vars -->
6. Posez les variables de l’application worker. `WORKER_INSTANCE` est le `worker.instance` de la configuration :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever env set --alias my-game-worker CC_NODE_DEV_DEPENDENCIES install
   clever env set --alias my-game-worker CC_RUN_COMMAND "npm run studio-worker"
   clever env set --alias my-game-worker CC_POST_BUILD_HOOK "python3 -m pip install --target .python --require-hashes --only-binary=:all: -r requirements.txt"
   clever env set --alias my-game-worker WORKER_INSTANCE my-game-studio
   clever env set --alias my-game-worker -- WORKER_PUBLIC_KEY "$(cat ~/secrets/my-game/studio-worker.pub)"
   ```

   Le hook installe les paquets Python des outils d’assets (Pillow, NumPy, SciPy) depuis `requirements.txt`, chaque
   hash vérifié, des roues seulement. Avant la 4.5.2, il nommait `ops/studio/worker-requirements.lock`, qui n’existe
   plus : changez le hook.

> [!MEASURE id=worker-hook]
> L’installation du worker, lancée à la main sur l’application worker : 7,0 s, 226 Mo installés, aucune compilation.
> Pas mesurée alors pendant un vrai build Clever ; le déploiement de référence a ensuite vu le hook prendre environ
> 7 s dans un déploiement du worker de 36 s.
> - date: 2026-10-19
> - version: 4.2.1
> - volume: Pillow 12.3.0, NumPy 2.4.6, SciPy 1.18.1 (une exécution, cache de pip vide)
> - conditions: application worker du spike S, organisation Clever Cloud de test, région par, taille XS ; installé dans un dossier tmpfs par SSH
> - source: [QUALIF-4.2.2-ASSETS.md §2](https://github.com/Quest-n-Click/quest-n-click/blob/de8d5b897b1d32c6230c64ab8962d5698952c439/docs/dev/QUALIF-4.2.2-ASSETS.md)

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Les noms, jamais les valeurs :

```sh
# sur votre machine, dans le dépôt du moteur
clever env --alias my-game-studio | grep -oE '^[A-Z][A-Z0-9_]*='
clever env --alias my-game-worker | grep -oE '^[A-Z][A-Z0-9_]*='
```

Le studio liste les variables des étapes 3 à 5, `STUDIO_OIDC_CLIENT_SECRET` et celles des add-ons ; le worker liste
celles de l’étape 6 et aucune variable d’add-on. La configuration est vérifiée pour de bon au démarrage du serveur :
une configuration refusée l’arrête avec une ligne qui nomme le champ ([Premier déploiement](clever.first-deployment.md)).

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `clever env set` dit qu’une option est inconnue | Une valeur PEM sans `--` avant le nom | La forme de l’étape 4 |
| `<NAME>: the secret is empty or too short (8 characters at least)` | Un fichier vide, ou un mauvais chemin dans `$(cat …)` | Vérifiez le fichier |
| `a session key is 32 characters or more` | Un `STUDIO_SESSION_KEY` trop court | `openssl rand -base64 48` |
| `STUDIO_METRICS_TOKEN: 32 characters at least (openssl rand -base64 32)` | Un jeton trop court | Étape 2 |
| `STUDIO_CONFIG_JSON: unknown key "…"` | Une coquille, ou un champ d’une version plus récente | La liste des champs plus bas |
| `trustProxy is required when the server is reachable beyond the loopback` | `trustProxy` omis avec OIDC | Gardez-le |
| `<NAME>_FILE (…) is readable by others: chmod 600` | Un fichier de secret aux droits trop larges (hors de Clever) | `chmod 600` |

<a name="files-changed"></a>

## Fichiers ou données modifiés

- `~/secrets/my-game/` : les clés et jetons (0600), le fichier de configuration.
- Les variables des deux applications chez Clever Cloud. Un changement de variable s’applique au déploiement ou au
  redémarrage suivant.

<a name="recovery"></a>

## Reprise ou retour arrière

`clever env rm <NAME> --alias <application>` retire une variable. Changer un secret plus tard, c’est
[Renouveler les clés](clever.key-rotation.md).

<a name="secrets"></a>

## Référence : comment les secrets sont lus

- Les secrets sont `STUDIO_DATABASE_URL`, `STUDIO_S3_KEY_ID`, `STUDIO_S3_KEY_SECRET`, `STUDIO_OIDC_CLIENT_SECRET`,
  `STUDIO_SESSION_KEY`, `STUDIO_WORKER_KEY`, `STUDIO_METRICS_TOKEN` et `STUDIO_GIT_KEY`.
- Chacun vient de `<NAME>_FILE` (un fichier en mode 0600, préféré hors de Clever ; des droits plus larges sont
  refusés), sinon de `<NAME>`, sinon, pour les trois premiers, de la variable de l’add-on (`POSTGRESQL_ADDON_URI`,
  `CELLAR_ADDON_KEY_ID`, `CELLAR_ADDON_KEY_SECRET`).
- Au démarrage, le serveur lit chacun une fois, puis retire de son environnement chaque variable qui le contenait :
  aucun processus enfant n’en hérite, et il n’est jamais consigné. Une valeur de moins de 8 caractères est refusée.
- `STUDIO_WORKER_KEY` peut avoir ses retours à la ligne écrits `\n`. `STUDIO_SESSION_KEY` peut contenir plusieurs
  clés, séparées par des virgules, pour les renouveler ([Renouveler les clés](clever.key-rotation.md)).
- Le worker lit `WORKER_PUBLIC_KEY` (ou `WORKER_PUBLIC_KEY_FILE`), `WORKER_INSTANCE` et `PORT`, et
  `WORKER_PYTHON_PATH` quand les paquets Python ne sont pas dans `.python`.

Chaque variable a son entrée dans [Variables d’environnement](reference.environment-variables.md#studio-server).

<a name="where-the-configuration-comes-from"></a>

## Référence : d’où vient la configuration

Dans l’ordre : `--config <fichier>` sur la ligne de commande ; sinon le fichier que nomme `STUDIO_CONFIG` ; sinon
`STUDIO_CONFIG_JSON`, le JSON lui-même (ce qu’utilise une plateforme sans fichiers comme Clever Cloud). Sans aucun des
trois, une commande dit `usage: studio-server <serve|import <dir>|export <dir>> --config <file> (or
STUDIO_CONFIG_JSON)`. Dans `clever ssh`, le shell a les variables de l’application : aucune commande n’a besoin de
`--config`.

<a name="studio-config-json"></a>

## Référence : `STUDIO_CONFIG_JSON`, champ par champ

Une clé inconnue au premier niveau est refusée au démarrage (`unknown key "…"`). Dans un champ, une sous-clé inconnue
est ignorée.

| Champ | Requis | Valeur | Défaut |
|---|---|---|---|
| `publicUrl` | oui | l’origine du Studio, http(s) ; la seule `Origin` qu’une mutation par cookie peut porter | — |
| `playUrl` | oui | l’origine du jeu, http(s) ; différente de celle de `publicUrl` | — |
| `game` | oui | l’identifiant du jeu (lettres, chiffres, `_`, `-`) ; un jeu par instance | — |
| `workDir` | oui | le dossier de travail de l’instance (le jeu matérialisé, le brouillon), éphémère sur Clever Cloud : `/home/bas/work` | — |
| `port` | non | le port ; **ne le mettez pas sur Clever Cloud**, qui donne `PORT` (un `port` ici l’emporterait) | `PORT`, sinon 8080 |
| `host` | non | l’adresse d’écoute ; sans `oidc`, seule la boucle locale est acceptée | `0.0.0.0` |
| `trustProxy` | avec `oidc` au-delà de la boucle locale | les adresses ou réseaux IPv4 dont on croit `X-Forwarded-For` / `X-Forwarded-Proto` | `[]` |
| `store.kind` | oui | `postgres` (hébergé) ou `sqlite` (local, avec `store.file`) | — |
| `blobs.kind` | oui | `s3` (avec `host`, `bucket`) ou `fs` (avec `dir`) ; `s3` avec un worker | — |
| `oidc` | pour un Studio partagé | le fournisseur ([ses champs](clever.generic-oidc.md#oidc-fields)) ; sans lui, le serveur local sur la boucle locale | aucun |
| `sessions.idleHours`, `sessions.absoluteHours` | non | les durées d’inactivité et absolue d’une session du navigateur | 8 et 24 |
| `worker.url`, `worker.instance` | avec `oidc` | l’URL du worker, et un nom de 3 à 64 lettres, chiffres, `_` ou `-` (le `WORKER_INSTANCE` du worker) | — |
| `clientDir` | non | le Studio construit ; avec `oidc`, le serveur refuse de démarrer sans lui | `.cache/studio-client` |
| `publicDir` | non | les images et sons préparés du jeu (`npm run assets` les écrit, ils sont versionnés) ; le Studio les montre aux membres et chaque prévisualisation les joue ; en lecture seule sur un Studio hébergé | `public/` du dépôt déployé |
| `publicBuilds` | non | `true` : les builds publiés (`/play/` sur l’origine du jeu) sont ouverts à tous sans session, avec les icônes que leur page nomme (D42, le choix de l’owner) | `false` |
| `git` | non | le dépôt Git du jeu : `remote` (sans identifiants ; la clé de déploiement est `STUDIO_GIT_KEY`), `branch` (`main`), `path` (un dossier du dépôt), `committer` `{name, email}`, `knownHosts` (sans lui, confiance au premier usage) | aucun |

<a name="trust-proxy"></a>

### `trustProxy` sur Clever Cloud

Les plages privées de l’exemple (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) sont une hypothèse : les proxys de
Clever s’y trouvent, et chaque personne est ainsi distinguée. Elles sont à réduire aux vrais proxys de Clever par la
passe `studio-hosted`. D’ici là, une adresse de ces plages pourrait se prétendre n’importe quel `X-Forwarded-For`, ce
qui compte pour les limites de débit par adresse.

<a name="references"></a>

## Références

- Le chargeur : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts) ; l’exemple :
  [`ops/studio/studio.config.example.json`](../../ops/studio/studio.config.example.json) ; les commandes :
  [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts).
- [Variables d’environnement](reference.environment-variables.md#studio-config-json) ;
  [ADR 0027](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md) (les secrets en variables sur Clever).
- Ensuite : [Premier déploiement](clever.first-deployment.md).
