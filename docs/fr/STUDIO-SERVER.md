# Studio Server : un jeu, plusieurs personnes, en ligne

Le Studio Server met le Studio d'un jeu en ligne pour une petite équipe. Chacun se connecte par un fournisseur OpenID
Connect (Keycloak ou un autre), travaille sur le même jeu en même temps, et voit chaque changement dès qu'il arrive.
C'est le chantier de la ligne 4.2.x (plan `docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md`). Seul sur sa machine,
`npm run studio` reste tel quel : rien de tout ceci n'est nécessaire.

> **État (4.2.2, expérimental).** Le journal (aucune modification confirmée n'est perdue), les connexions et les rôles,
> l'application de traitement, les pans et les baux, le flux en direct, l'origine propre du jeu avec ses
> prévisualisations (un build par révision), la santé par révision, l'annulation personnelle, les builds publiés, les
> assets préparés sur l'application de traitement, la sauvegarde et la restauration, et les écrans du Studio pour tout
> cela ; depuis 4.2.3, les uploads et la découpe de planches de l'onglet Assets, Prepare et les découpes en jobs qui
> se suivent et s'annulent. Il reste expérimental jusqu'à ce que ses passes humaines (`studio-hosted`, `studio-collab`, `studio-preview`,
> `studio-assets-hosted`) soient faites. Ce guide déploie depuis le dépôt
> ; l'archive `web-scumm-studio-server` est le même serveur (ci-dessous).

## Ce qui tourne où

```text
navigateurs ─HTTPS─▶ studio (app Node, une instance) ──jobs signés──▶ studio-worker (app Node, sans secrets)
CLI, MCP ─Bearer──┘   │  public_url : le Studio et /api          ▲ snapshot et résultat présignés
                      │  play_url :   le jeu (une autre origine)  │
                      ├──▶ PostgreSQL : journal, membres, sessions, baux
                      ├──▶ Cellar (S3) : le contenu des fichiers, les snapshots du worker ─┘
                      └──▶ fournisseur OpenID : qui sont les gens (jamais ce qu'ils peuvent faire)
```

- **Les fichiers du jeu** vivent dans Postgres (quelle version de chaque fichier) et dans Cellar (leur contenu). Le
  disque de l'application n'est qu'un cache : celui de Clever Cloud ne survit pas à un redémarrage, et rien ne se
  perd quand il disparaît.
- **Le code du jeu ne s'exécute jamais dans le Studio** : sa validation et sa lecture passent par `studio-worker`, une
  seconde application qui ne détient ni mot de passe, ni clé, ni accès à la base (ADR 0028).
- **Le jeu se joue sur une autre origine** (`playUrl`) : son code ne peut pas agir avec la session Studio d'un membre.

## Déployer sur Clever Cloud

Il faut : deux applications Node.js, un add-on PostgreSQL, un add-on Cellar avec un bucket, et un fournisseur OpenID
(un add-on Keycloak managé convient). Avec `clever-tools` :

```sh
clever create --type node my-game-studio
clever create --type node my-game-worker
clever addon create postgresql-addon my-game-pg --plan dev      # 5 connexions : juste (le serveur en garde 4) ; plus pour une équipe
clever addon create cellar-addon my-game-cellar
clever service link-addon my-game-pg --app my-game-studio
clever service link-addon my-game-cellar --app my-game-studio
clever scale --min-instances 1 --max-instances 1 --app my-game-studio
```

Créez le bucket dans Cellar (sa console, ou n'importe quel outil S3). Seule l'application studio est liée aux add-ons :
**ne les liez jamais au worker.** Les deux applications se construisent depuis la racine du dépôt : laissez
`APP_FOLDER` vide (une application qui a porté un autre projet peut en avoir un : `clever env rm APP_FOLDER`).

`clever deploy` et `clever ssh` agissent sur une application liée dans le dossier d'où on les lance (clever-tools 4
n'a pas de `--app` pour `deploy`) : liez les deux une fois, sous un alias, et tenez hors de Git le `.clever.json` que
cela écrit :

```sh
clever link <id-app-studio> --alias my-game-studio
clever link <id-app-worker> --alias my-game-worker
```

**Les clés des jobs.** Sur votre machine, dans un dossier vide tenu hors de Git :

```sh
mkdir -p ~/secrets/my-game && npm run studio-server -- worker-keys --out ~/secrets/my-game
```

`studio-worker.key` (0600) est celle du Studio ; `studio-worker.pub` celle du worker.

**Les variables de l'application studio :**

| Variable | Valeur |
|---|---|
| `CC_NODE_DEV_DEPENDENCIES` | `install` (le serveur tourne depuis le dépôt, avec `tsx`) |
| `CC_POST_BUILD_HOOK` | `npm run studio-client` (construit la page du Studio que le serveur sert) |
| `CC_RUN_COMMAND` | `npm run studio-server -- serve` |
| `CC_HEALTH_CHECK_PATH` | `/startz` |
| `STUDIO_CONFIG_JSON` | la configuration ci-dessous, sur une ligne |
| `STUDIO_OIDC_CLIENT_SECRET` | le secret du client `studio` chez le fournisseur |
| `STUDIO_SESSION_KEY` | 32 caractères aléatoires ou plus (`openssl rand -base64 48`) ; plusieurs, séparées par des virgules, pour la rotation |
| `STUDIO_WORKER_KEY` | le contenu de `studio-worker.key` (les retours à la ligne peuvent s'écrire `\n`) |
| `STUDIO_METRICS_TOKEN` | facultatif (4.2.3) : 32 caractères aléatoires ou plus (`openssl rand -base64 32`) ; sans lui, pas de `/metrics` |
| `STUDIO_BACKUP_CRON` | facultatif (4.2.3) : `1` lance la sauvegarde quotidienne dans le bucket (`clevercloud/cron.json`) ; `STUDIO_BACKUP_KEEP` sauvegardes gardées, 14 par défaut |

Les identifiants de la base et de Cellar viennent des add-ons (`POSTGRESQL_ADDON_URI`, `CELLAR_ADDON_KEY_ID`,
`CELLAR_ADDON_KEY_SECRET`). Au démarrage, le serveur lit chaque secret puis le retire de son environnement. Hors de
Clever, chacun peut être un fichier : `STUDIO_SESSION_KEY_FILE`, etc. (mode 0600).

Posez les secrets depuis leurs fichiers, pour qu'aucune valeur ne soit tapée ni affichée. Le texte d'une clé commence
par `-----BEGIN`, que `clever env set` lit comme une option si `--` ne le précède pas :

```sh
clever env set --alias my-game-studio -- STUDIO_WORKER_KEY "$(cat ~/secrets/my-game/studio-worker.key)"
clever env set --alias my-game-worker -- WORKER_PUBLIC_KEY "$(cat ~/secrets/my-game/studio-worker.pub)"
```

**La configuration** (`ops/studio/studio.config.example.json`) :

```json
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

- `publicUrl` et `playUrl` sont deux domaines de l'application studio (`clever domain add`). **Prenez deux
  sous-domaines de votre propre domaine** (`studio.exemple.fr`, `play.exemple.fr`) : un seul site, et le cadre du jeu
  garde son cookie de session dans tous les navigateurs. Deux noms en `*.cleverapps.io` sont deux sites : le cookie du
  jeu ne vit alors dans un cadre d'un autre site que parce qu'il est partitionné (CHIPS). Chromium, Firefox et WebKit
  sous macOS le gardent (l'e2e hébergé). WebKit sous Linux (GNOME Web) n'enregistre aucun cookie posé par un cadre d'un
  autre hôte, même sur un seul site : les cadres du jeu y restent vides. Un vrai Safari, sous macOS et iOS, est la passe
  `studio-hosted`.
- `trustProxy` : les adresses des proxys de Clever, pour distinguer chaque personne (avec OIDC, le serveur refuse de
  démarrer sans). Les plages privées ci-dessus sont une hypothèse, à réduire aux vrais proxys de Clever par la passe
  `studio-hosted` : sinon, une adresse de ces plages pourrait se prétendre n'importe quel `X-Forwarded-For`.
- Pas de `port` : le serveur écoute sur le `PORT` que Clever lui donne (un `port` dans la configuration l'emporterait).
- `worker.instance` : un nom au choix ; le worker n'exécute les jobs d'aucun autre Studio.
- `publicDir` (facultatif) : les images et les sons préparés du jeu, par défaut `public/` du dépôt déployé
  (`npm run assets` les y écrit et ils sont versionnés). Le Studio les montre aux membres et chaque prévisualisation
  les joue ; ils sont en lecture seule sur un Studio hébergé.
- `publicBuilds` (facultatif, `false` par défaut) : les builds publiés (`/play/` sur l'origine du jeu) sont ouverts à
  tous, sans session (D42 : le choix de l'owner, par instance), avec les icônes que leur page nomme. Tout le reste de
  cette origine reste derrière la session.
- `clientDir` (facultatif) : le Studio construit, par défaut `.cache/studio-client` (`npm run studio-client`). Avec
  OIDC, le serveur refuse de démarrer sans lui.

**Les variables de l'application worker :** `CC_NODE_DEV_DEPENDENCIES=install`,
`CC_RUN_COMMAND=npm run studio-worker`, `CC_POST_BUILD_HOOK=python3 -m pip install --target .python --require-hashes
--only-binary=:all: -r ops/studio/worker-requirements.lock` (les paquets Python des outils d'assets, chaque hash
vérifié ; mesuré dans `docs/dev/QUALIF-4.2.2-ASSETS.md`), `WORKER_PUBLIC_KEY` (le contenu de `studio-worker.pub`),
`WORKER_INSTANCE` (le même nom que `worker.instance`). Donnez-lui un domaine (`worker.url`).

**Déployez** les deux, le worker d'abord (`clever deploy --alias my-game-worker`, puis `--alias my-game-studio`),
puis importez le jeu une fois, et invitez le premier owner :

```sh
clever ssh --alias my-game-studio
cd "$APP_HOME"
npm run studio-server -- import games/my-game
npm run studio-server -- invite --email vous@example.fr --role owner
```

Le shell de `clever ssh` a les variables de l'application (`STUDIO_CONFIG_JSON`, celles des add-ons ; mesuré par le
déploiement de référence) : aucune des deux commandes n'a besoin de `--config`. `clever ssh --command '…'` lance une
commande sans session, mais refuse tant qu'une seconde instance est listée (l'ancienne d'un déploiement reste
`STOPPING` environ deux minutes) : attendez qu'elle parte. L'import envoie chaque fichier au bucket (242 s pour le jeu
de démo, 500 fichiers). L'invitation affiche un lien : ouvrez-le et connectez-vous avec cet email vérifié. `/readyz`
répond 200 dès que l'instance sert les écritures.

`clever logs` suit les journaux jusqu'à ce qu'on l'arrête, même avec `--until` : pour en garder une partie, lancez-le
en arrière-plan et arrêtez-le par son numéro de processus une fois ce qu'il faut obtenu.

## Depuis les archives de la release

À partir de 4.2.1, une release porte `web-scumm-studio-server-<version>.tgz` : les deux commandes
`web-scumm-studio-server` et `web-scumm-studio-worker`, la page du Studio déjà construite, et ses propres dépendances
(OpenID Connect, JWT, Postgres). Leurs versions sont verrouillées dans son `npm-shrinkwrap.json` et son SBOM ; npm lit ce
verrou quand il installe depuis le registre, pas depuis un fichier d'archive, où `pg` prend le dernier 8.x que permet sa
plage (`web-scumm-studio-server deps` dit lequel). Il fait tourner le serveur du moteur installé à côté, qui doit être
de la même version :

```sh
npm install web-scumm-<version>.tgz web-scumm-studio-server-<version>.tgz
npx web-scumm-studio-server import ./mon-jeu --config studio.config.json
npx web-scumm-studio-server serve --config studio.config.json
npx web-scumm-studio-worker          # sur la machine du worker, avec WORKER_PUBLIC_KEY et WORKER_INSTANCE
```

Un worker installé depuis les archives prépare aussi les assets (depuis la 4.2.3) : son hook de build installe le
verrou que porte le paquet du moteur, depuis le dossier du worker, où le worker cherche les paquets
(`WORKER_PYTHON_PATH` pour les mettre ailleurs) : `CC_POST_BUILD_HOOK=python3 -m pip install --target .python
--require-hashes --only-binary=:all: -r node_modules/web-scumm/ops/studio/worker-requirements.lock`. Le verrou vaut pour
CPython 3.13 sous Linux x86_64, glibc 2.28 ou plus récente (le runtime natif de Clever Cloud) ; une autre plateforme le refait (son en-tête dit
comment). En 4.2.2, il fallait un worker déployé depuis le dépôt.

L'archive du moteur apporte Vite et tsx, dont l'application de traitement a besoin pour exécuter le code du jeu et
construire ses prévisualisations (le Studio lui-même ne fait plus tourner Vite, depuis 4.2.2). Mettez dans `publicDir` les
assets préparés de votre jeu (`public/` de son dépôt) : celui du moteur ne contient que ses icônes et sa police. Le
candidat de chaque release installe ces deux archives dans un dossier vide et y sert un jeu, ses dépendances trouvées
que npm les remonte ou les imbrique (`scripts/studio-install-smoke.mjs`).

## Le fournisseur OpenID

Le realm de test `ops/studio/keycloak/realm.json` montre chaque réglage. Chez n'importe quel fournisseur :

- **Le client `studio`** : confidentiel, Authorization Code avec PKCE S256, redirect URI `<publicUrl>/auth/callback`,
  redirection après déconnexion `<publicUrl>`, back-channel logout vers `<publicUrl>/auth/backchannel` avec
  l'identifiant de session.
- **Le client `web-scumm-cli`** : public, avec le device authorization grant.
- **Un mapper d'audience** qui ajoute `studio-api` (l'`audience` ci-dessus) aux jetons d'accès de `web-scumm-cli`. Elle
  doit différer de l'identifiant du client `studio` : un id_token n'est jamais accepté comme jeton d'accès.
- **Des jetons d'accès de 5 min.** Jusqu'à 15 si la configuration le dit (`oidc.maxTokenSeconds`, 900 au plus) : un
  jeton plus long est refusé.

Le fournisseur dit qui est quelqu'un. Ce qu'il peut faire se décide dans le Studio.

**`realm.json` sert à un test local.** Avant de le donner à un autre Keycloak, changez :
- `clients[studio].redirectUris` en `["<publicUrl>/auth/callback"]` ;
- `clients[studio].attributes` : `backchannel.logout.url` en `<publicUrl>/auth/backchannel`, et
  `post.logout.redirect.uris` en `<publicUrl>` ;
- `clients[studio].secret` en une nouvelle valeur aléatoire (`openssl rand -base64 32`), celle que vous posez dans
  `STUDIO_OIDC_CLIENT_SECRET` ;
- `users` : les vôtres, ou aucun (la console de Keycloak les ajoute), chacun avec un email vérifié et un mot de passe
  qui n'est pas celui du fichier.

Gardez le fichier, avec son secret et ses mots de passe, hors de Git (mode 0600).

**Le Keycloak managé de Clever Cloud.** `clever keycloak get <id-addon>` donne sa console d'administration et ses
premiers identifiants. Ce mot de passe est temporaire : la première connexion en demande un nouveau, et la console de
Clever comme la variable de l'add-on (`CC_KEYCLOAK_ADMIN_DEFAULT_PASSWORD`) continuent d'afficher l'ancien ensuite ;
gardez le nouveau là où vous gardez les secrets. L'API d'administration ne prend pas ce mot de passe par le client
`admin-cli` du realm master (`401 invalid_client`) : `kcadm.sh` et les scripts bâtis dessus échouent tels quels. Deux
chemins marchent :
- dans la console d'administration (`clever keycloak open webui <id-addon>`), **Create realm** avec le `realm.json`
  modifié ;
- ou, avec un jeton d'administration obtenu par une connexion via le client de la console (`security-admin-console`,
  Authorization Code avec PKCE), `POST /admin/realms` avec le fichier modifié : ce qu'a fait le déploiement de
  référence.

Son émetteur est `https://<son hôte>/realms/web-scumm`. Le Studio lit la découverte de l'émetteur au démarrage : il ne
démarre pas tant que le realm manque.

**Un autre fournisseur** (4.2.3, D44 : GitLab pour la passe `studio-oidc-generic`). Tout fournisseur OpenID Connect
avec découverte sert les connexions du navigateur : donnez-lui le client `studio` comme ci-dessus (une application avec
les scopes `openid profile email`, les mêmes URI de redirection) et son émetteur (`https://gitlab.com` pour GitLab).
Deux parties en demandent plus : le CLI et le MCP prennent les **jetons d'accès du fournisseur en JWT** signés pour
l'audience de ce Studio, ce que ne donne pas un fournisseur aux jetons d'accès opaques (les applications OAuth de
GitLab, au moment où ces lignes sont écrites) : là, le CLI et le MCP distant restent sur un fournisseur qui le fait
(Keycloak, Authentik et d'autres), ou ne sont pas proposés. Sans **déconnexion back-channel**, une session finie chez
le fournisseur finit ici à son prochain rafraîchissement (5 min), et un utilisateur désactivé là-bas dans R = 15 min
(plan §3.6). La passe `studio-oidc-generic` le vérifie sur un vrai GitLab.

## Personnes et rôles

| Rôle | Peut |
|---|---|
| `owner` | tout ce que peut un dev ; les membres, les rôles, les invitations, les sessions, l'audit ; reprendre un pan ; le bail exclusif |
| `dev` | écrire le jeu, pan par pan |
| `reviewer` | lire et jouer |

Personne n'est membre par défaut : une invitation (7 jours, à usage unique, pour un email vérifié) en fait un. Le
dernier owner ne peut être ni retiré ni rétrogradé. Retirer quelqu'un coupe son accès à sa requête suivante ; ses flux
en direct se ferment en 5 s. Quand le fournisseur désactive un compte, ses sessions se terminent en 15 min au plus.

## Publier des builds

Le bouton **Publish this revision** de l'onglet Jouer fait construire par l'application de traitement le jeu du
joueur à partir de la tête (sans les outils d'édition), numéroté : le build `#n` est servi à `/play/<n>/` sur
l'origine du jeu et ne change jamais. `/play/` est toujours le dernier build vert, le plus récent dont la révision a
été jugée valide par la santé (une révision publiée est jugée à la publication). Le manifeste de chaque build
(l'époque et la révision, le hash du snapshot, le moteur, le commit et le lockfile de l'application de traitement, la
version des assets, le verdict de la révision, le hash de chaque fichier) est signé avec la clé de jobs du Studio :
`GET /api/builds/<n>` donne le manifeste, les octets exacts signés (`signed`) et la signature, faite sur
`web-scumm build manifest v1\n` suivi de ces octets, que `studio-worker.pub` vérifie. **Rebuild fresh** (un owner)
reconstruit le même snapshot, avec la même version des assets, et dit si les fichiers sont les mêmes, octet pour
octet : une vérification que le build est reproductible sur l'application de traitement telle qu'elle est, pas que
son contenu est sans danger. Le code d'un build ne change jamais ; ses images et ses sons sont les assets préparés de
l'instance, servis à côté tels qu'ils sont. Un build publié n'a pas de service worker (il ne s'installe pas pour jouer
hors ligne) et ses sauvegardes ne sont pas encore distinguées par build.

## Commentaires (4.2.3)

Dans l'onglet Notes d'un Studio partagé, un membre commente ce que le jeu nomme (une salle, `hall.door`, `item:key`,
l'id d'une règle, une case du storyboard), ou le jeu lui-même. Un commentaire garde la révision où il a été écrit ;
les réponses font un fil, résolu ou rouvert d'un bloc. Les reviewers commentent aussi : les commentaires sont gardés
par le Studio (dans sa base, dans la sauvegarde), jamais dans un fichier du jeu, donc aucun fichier du jeu n'est écrit
pour eux. Un commentaire dont l'ancre n'est plus nommée par le jeu (ses salles, règles, scripts, entités, objectifs et points de
passage, les planches et cases du storyboard) est dit « orphan », jamais rattaché ailleurs ; l'id d'une ligne n'est pas
une ancre. Seul
son auteur change son texte ; un reviewer résout ses propres fils, un dev n'importe lequel. Un owner fait entrer les
notes de `notes.json` (chacune une fois, son `about` pour ancre). Routes : GET/POST `/api/comments`, PUT
`/api/comments/<id>`, POST `/api/comments/import-notes`.

## Le jeu dans Git (4.2.3)

`git` dans la configuration (facultatif) nomme le dépôt du jeu : `{ "remote": "git@github.com:org/game.git",
"branch": "main", "path": "games/mon-jeu", "committer": { "name": "…", "email": "…" } }` (`branch` vaut `main` par
défaut, `path` la racine du dépôt). Sa clé de déploiement (une clé qui peut écrire dans ce seul dépôt, D44) est le
secret `STUDIO_GIT_KEY` (`STUDIO_GIT_KEY_FILE` en local ; une variable sur Clever Cloud). Un dépôt https public ou
local n'en demande pas ; une URL de dépôt ne porte jamais d'identifiants. L'onglet Play montre où va le jeu et la
dernière révision poussée :

- **Pousser** (un owner) : un commit des révisions confirmées depuis le dernier push, les fichiers du jeu à la tête
  dans `path`, chaque auteur de ces révisions en `Co-authored-by` (son email, ou son nom à une adresse qui n'existe
  pas) ; le reste du dépôt reste tel qu'il est. Rien de neuf, rien de poussé.
- **Jamais forcé.** Une branche qui a bougé depuis le dernier push du Studio (quelqu'un y a poussé) est refusée (409),
  et de même une branche qui existe mais que le Studio n'a jamais importée : importez-la d'abord.
- **Importer** (un owner, demandé deux fois) : la branche, une autre branche du dépôt, ou un commit par son hash, tel
  qu'il est dans `path`, écrit en une révision sous le bail exclusif. Il remplace ce que le Studio n'avait pas poussé
  (qui reste dans son historique). La pointe de la branche importée, le push suivant part d'elle ; un autre commit, le
  push suivant va sur la pointe que le Studio connaît. Un lien, un sous-module, ou un fichier que le jeu ne peut pas
  avoir refuse tout l'import.

Le Studio ne fait jamais de checkout : un push construit son commit à partir d'objets, un import lit les objets du
commit ; les liens, les attributs et les règles d'ignore du dépôt ne peuvent donc pas atteindre les fichiers du
serveur. Les fichiers dont un segment du chemin commence par un point (`.github/`, `.gitignore`) sont ceux du dépôt :
gardés par un push, ignorés par un import. Le
`private/` du jeu ne va jamais dans le dépôt, et un import le laisse tel qu'il est. L'email d'un auteur va dans un `Co-authored-by` seulement si le
fournisseur l'a vérifié ; sinon son nom à `users.noreply.<l'hôte du Studio>`. Git tourne avec un environnement à lui,
la clé dans un fichier pour une commande, le clone dans `workDir/git` (refait quand le disque est neuf). Donnez les
clés de l'hôte du dépôt dans `git.knownHosts` (des lignes `known_hosts`) pour les vérifier strictement ; sans elles,
l'hôte est cru à la première connexion, et de nouveau après chaque disque neuf.

## Monter la version du moteur d'un jeu hébergé

Un jeu importé d'un projet 4.1.x qui n'a jamais lancé `web-scumm migrate` est encore au schéma d'écriture 2 (pas de
`schemaVersion: 3`, pas d'ids stables). Sur un Studio hébergé, un owner le monte de version avec
`POST /api/engine/migrate` (4.2.3) :

```bash
curl -X POST -H "Authorization: Bearer $(npx web-scumm-studio-server token --server https://studio.example)" \
  https://studio.example/api/engine/migrate
```

- **Exclusive.** Elle tourne sous le bail exclusif de l'owner (`*`) : personne d'autre n'écrit pendant ce temps (ses
  écritures reçoivent un 423 avec le nom de l'owner, ses brouillons restent chez lui, et il écrit de nouveau une fois
  qu'elle est finie). Une à la fois (429).
- **Sur l'application de traitement.** Elle exécute la même migration que `web-scumm migrate` sur le snapshot de la
  tête : les ids stables écrits dans `rooms/*.ts`, `rules.ts`, `items.ts` et `game.ts`, les clés des tables de
  traduction renommées, `ids.migration.json` et `ids.paths.json`, puis les trois lignes qu'UPGRADING laisse à l'auteur
  dans `game.ts` (`schemaVersion: 3`, `saveVersion` + 1, `migrations: [..., idsMigration]` et son import : les trois
  ou aucune, dites dans `skipped`). `defineGame({...})` doit être dans `game.ts` (un jeu qui le définit ailleurs est
  refusé : migrez-le en local). Rien n'est encore écrit, et rien d'autre que ces fichiers : le Studio refuse une
  réponse qui nomme un autre fichier, ou un fichier que le jeu n'a pas (le code du jeu tourne avant la migration et
  pourrait la façonner).
- **Jugée avant d'être écrite.** Le jeu migré est jugé sur l'application de traitement comme la santé juge une
  révision : le validateur, puis le solveur depuis une nouvelle partie, borné dans le temps. Un jeu que la migration
  casserait (un id que l'outil n'a pas pu écrire, une liste construite par du code, un jeu qu'on ne peut plus finir),
  ou que le solveur ne peut pas juger à temps, est refusé par un 422 (`errors`, `skipped` : ce que l'outil n'a pas pu
  écrire) et la tête reste telle qu'elle était : migrez-le sur un Studio local (`web-scumm migrate`, puis `npm run ids`
  pour voir ce qui reste) et importez-le de nouveau, ou corrigez-le d'abord.
- **Une révision.** Sinon les fichiers modifiés sont écrits en une seule opération (`engine upgrade: authoring schema
  2 → 3`), à travers la garde, et la réponse est `{ revision, changed, paths, schema: { from, to } }` (`paths` : les
  fichiers écrits). Un jeu déjà au schéma
  3 répond `{ changed: 0 }` et rien n'est écrit.
- **Annulable.** L'Undo de l'owner l'annule, par une nouvelle révision (409 si quelqu'un a écrit l'un de ses fichiers
  depuis) ; ou le projet revient à une sauvegarde faite avant (voir plus bas) : faites-en une d'abord.

Dans la ligne 4.2.x le format du contenu est gelé (D40) : c'est pour un jeu fait sur une 4.1.x. Un Studio local n'a
pas de route : lancez `web-scumm migrate` dans le projet. Le `tsconfig.json` du projet (`baseUrl`, que
`web-scumm migrate` corrige aussi) ne fait pas partie d'un jeu hébergé et n'est pas touché. Les playtests
(`playtests/`) ne sont ni migrés ni jugés : rejouez-les après la montée de version (une session enregistrée au schéma 2
peut nommer les anciennes clés positionnelles). Il n'y a pas encore de
bouton : la route est le moyen d'y accéder.

## Sauvegarde et restauration

- **Le journal expédié** : chaque opération confirmée est copiée dans le bucket, dans l'ordre, en segment immuable
  (`journal/<époque>/<ligne>/<rev>.json` ; les contenus sont déjà des blobs ; un échec est retenté sous 30 s).
  `/readyz` donne `rpoMs`, l'âge de la plus ancienne opération pas encore expédiée (0 quand tout l'est) : la cible est
  1 min (D42), mesurée, jamais affirmée. La ligne vaut `0`, puis une nouvelle après chaque restauration : les
  révisions qu'une instance restaurée réécrit n'écrasent jamais les segments de la chronologie qu'elle a quittée.
- **Une sauvegarde** : `npm run studio-server -- backup <fichier> --config <fichier>` écrit les tables du projet en un
  instantané (les membres, le journal, la tête, les prévisualisations, les builds et les ensembles préparés ; ni les
  sessions ni les baux : une restauration déconnecte tout le monde ; seulement les opérations confirmées), avec les
  blobs qu'elles nomment et un condensé. Quotidienne (D42), gardée hors de l'instance. Une sauvegarde est une entrée
  de confiance, comme les identifiants de la base : elle peut ajouter des propriétaires. Son condensé dit qu'elle est
  entière, pas qui l'a faite ; gardez-la là où seuls les opérateurs écrivent.
- **Dans le bucket** (4.2.3) : `npm run studio-server -- backup --to-bucket --keep 14 --config <fichier>` l'écrit dans
  le bucket de l'instance sous `backups/<date>-r<révision>.json` (UTC, `2026-10-19T03-17-00Z`), puis supprime les
  sauvegardes qu'il a écrites au-delà des 14 plus récentes (jamais un autre objet). La tâche planifiée quotidienne le
  lance (« Le faire tourner », plus bas). Elle survit à la base, pas au bucket : une copie ailleurs est à vous.
- **Une restauration** : une instance hébergée seulement, dans une base vide (un nouvel add-on Postgres, le même
  bucket) : `npm run studio-server -- restore <fichier> --replay --config <fichier>` vérifie le condensé, les tables et
  les colonnes, et que chaque blob de la tête et du journal est dans le bucket (une prévisualisation, un build ou un
  ensemble préparé dont les blobs ont été ramassés depuis est laissé de côté, et compté dans `dropped`), écrit les
  lignes, puis rejoue le journal expédié depuis la sauvegarde. Chaque opération rejouée doit continuer la tête (sa
  révision, le contenu précédent de chaque fichier, ses blobs) ; le rejeu s'arrête à la première qui ne le fait pas
  (`stopped` : `gap`, `not-the-head`, `blob-missing`…). S'il échoue en cours de route, le serveur refuse de démarrer
  jusqu'à ce que `npm run studio-server -- replay --config <fichier>` le reprenne. Démarrez le serveur : le dossier est
  refait depuis la tête. Les opérations rejouées ne gardent pas leur réponse : un client qui en retente une reçoit
  `null`. Faites une nouvelle sauvegarde après une restauration : les suivantes rejouent sur la nouvelle ligne.
- **L'exercice** : sur une instance de test, sauvegardez, écrivez deux modifications, attendez `rpoMs` à 0, supprimez
  la base, restaurez avec `--replay`, démarrez, et vérifiez que la tête est la dernière modification.
- **Le ramassage** : `npm run studio-server -- gc --config <fichier>` liste les blobs qu'aucune ligne ne nomme (plus
  vieux d'un jour) et le staging de l'application de traitement de plus d'une heure ; `--delete` les supprime. Un blob
  stocké à nouveau reçoit une nouvelle date : une écriture qui nomme un vieux blob est couverte par le jour de grâce.
  Les blobs de la tête et du journal ne sont jamais ramassés (le journal garde chaque opération) ; une sauvegarde plus
  ancienne restaurée après un ramassage ne perd que les prévisualisations, builds et ensembles préparés ramassés.

## Le faire tourner : le déploiement de référence

4.2.3 exécute ce déploiement sur Clever Cloud (les deux applications, PostgreSQL, Cellar, Keycloak, un domaine) et
écrit ce qu'il a mesuré dans `docs/dev/QUALIF-4.2.3-REFERENCE.md`. Voici le runbook qu'il suit.

**Déployer, et monter de version : un redéploiement à chevauchement.** `clever deploy` (ou un push) démarre la nouvelle
instance pendant que l'ancienne sert encore : mesuré par le spike S (`docs/dev/SPIKE-4.2.1-CLEVER.md` §2), où
l'ancienne instance n'a d'ailleurs jamais consigné son SIGTERM. Rien ne dépend de ce signal : les instances partagent
le **bail de service** dans PostgreSQL (plan maître §4, P8). La nouvelle démarre, répond à `/startz`, et attend :
`/readyz` vaut 503 et ses écritures 503 avec `Retry-After` jusqu'à ce que l'ancienne rende le bail (sur SIGTERM) ou
que le bail expire (30 s, renouvelé toutes les 10 s à l'horloge de la base) ; l'ancienne cesse d'écrire à sa propre
horloge avant. Un client retente une écriture avec le même identifiant d'opération, et elle est appliquée une fois. Le
bail propre du journal, avec sa clôture, empêche toujours deux instances d'écrire sur la même tête.

Ce que le déploiement de référence a mesuré (`docs/dev/QUALIF-4.2.3-REFERENCE.md` §5) : Clever garde l'ancienne
instance `STOPPING` environ deux minutes après que la nouvelle est prête, et elle n'a consigné aucune ligne `stopping` :
elle a continué de renouveler le bail pendant ce temps, et la nouvelle l'a pris environ 30 s après le départ de
l'ancienne. **Les écritures sont refusées (503, `Retry-After: 2`) pendant environ deux minutes et demie par
déploiement**, les lectures continuent ; une écriture retentée avec son identifiant d'opération passe ensuite, une
fois. Pendant que les deux instances démarrent et tournent, elles tiennent deux fois plus de connexions : sur le plan
`dev` (5), une écriture peut échouer sur « too many connections » (un 500) ou attendre la vérification du journal par
l'instance qui démarre (un 409 au bout de 20 s) ; prenez un plan plus grand pour un déploiement dont on se sert.

Monter le moteur de version, c'est ce même redéploiement, d'une nouvelle version :
1. lisez le CHANGELOG de la version et `docs/fr/UPGRADING.md` pour le contenu du jeu. Ses migrations de base tournent au
   démarrage de la nouvelle instance, pendant que l'ancienne peut encore servir : si l'une change ce que l'ancienne
   version lit, arrêtez d'abord l'ancienne (`clever stop`) et acceptez la minute sans Studio ;
2. faites une sauvegarde dans le bucket (plus bas) et notez la révision ;
3. déployez l'application de traitement d'abord, puis le studio, à la même version : tant que les deux ne le sont pas,
   un job peut être refusé, et le Studio refuse alors l'écriture qu'il vérifiait (il échoue fermé) plutôt que de la
   laisser passer ;
4. regardez `/readyz` revenir à 200 sur la nouvelle instance (`instance` dans la ligne `lease-taken`), la révision
   inchangée, et une écriture passer.
Revenir en arrière, c'est le même redéploiement de la version précédente, tant qu'elle lit encore la base que la
nouvelle a migrée ; sinon, c'est la sauvegarde de l'étape 2, restaurée dans un nouvel add-on (l'exercice ci-dessous).

**Les métriques.** Avec `STUDIO_METRICS_TOKEN`, `GET /metrics` sur l'origine du Studio répond au format texte de
Prometheus à `Authorization: Bearer <jeton>` (comparé en temps constant) ; un mauvais jeton est un 401, et sans la
variable la route n'existe pas (404). Elle n'est jamais derrière la session, jamais sur l'origine du jeu, où toute
requête sans la session du jeu est refusée avant que son chemin soit lu (un 401, « open the game from the Studio »).
Ce qu'elle donne :

| Métrique | Quoi |
|---|---|
| `studio_journal_operation_seconds{outcome}` | les opérations du journal, de la demande à la réponse (`confirmed`, `replayed`, `refused`, `failed`) |
| `studio_worker_jobs_in_flight` | les jobs demandés à l'application de traitement et pas encore répondus : la file vue du Studio |
| `studio_worker_job_seconds{kind,outcome}` | ses jobs par sorte (`validate`, `load`, `preview`, `prepare`, `lint`, `solve`, `playtests`) et issue (`ok`, `failed`, `timeout`, `error`) |
| `studio_lease_conflicts_total` | les 423 répondus : le pan de quelqu'un d'autre, ou un bail terminé |
| `studio_preview_build_seconds{outcome}` | la prévisualisation d'une révision, de l'instantané aux fichiers stockés (`built`, `failed`) |
| `studio_health_judgement_seconds{verdict}` | le verdict de santé sur une révision |
| `studio_journal_rpo_seconds` | l'âge de la plus ancienne opération pas encore expédiée au bucket (le `rpoMs` de `/readyz`) |
| `studio_journal_revision`, `studio_service_lease_held` | la tête, et si cette instance sert les écritures (1) |
| `studio_http_responses_total{class}`, `studio_log_events_total{event}` | les réponses par classe de statut ; les échecs consignés (`ship-failed`, `health-failed`, `reconcile-failed`, `error`…) |

Ce sont des comptes et des durées : aucun chemin, aucun nom, aucun auteur, aucun contenu. Elles vivent dans la mémoire
de l'instance : un redémarrage les remet à zéro (une remise à zéro de compteur, que `rate` de Prometheus lit comme
telle). La file propre de l'application de traitement n'est pas mesurée de son côté : celle du Studio l'est.
OpenTelemetry n'est pas pris en charge en 4.2.3 ; il reste une option pour plus tard.

**Les alertes** (vers une personne). Clever Cloud notifie les déploiements (`clever notify-email add --notify <vous>
--event DEPLOYMENT_FAIL studio-deploys` ; aussi `clever webhooks add`), et sa console montre le CPU, la mémoire et les
journaux de chaque application. Elle ne lit pas `/metrics` : un collecteur que vous faites tourner le fait
(Prometheus et son Alertmanager, ou tout service qui lit le format), ou une simple sonde de `/readyz`. Alertez quand :
- `/readyz` n'est pas 200 pendant 5 min (aucune instance ne sert les écritures ; un déploiement tient les écritures à
  l'écart environ 2 min 30, plus haut) ;
- `studio_journal_rpo_seconds` dépasse 60 pendant 5 min (la cible est 1 min, D42), ou `ship-failed` ne cesse de monter ;
- `studio_worker_jobs_in_flight` reste au-dessus de 3 pendant 10 min (l'application de traitement fait un job à la
  fois : le travail s'accumule) ;
- des jobs échouent : `studio_worker_job_seconds_count{outcome!="ok"}` monte, ou `health-failed` ;
- `studio_lease_conflicts_total` fait un bond (des personnes s'attendent sur leurs pans : pas une panne, un signe à
  regarder) ;
- la ligne de la sauvegarde quotidienne (`"event":"backup"`) manque un matin dans les journaux.

**La sauvegarde quotidienne.** Le dépôt porte `clevercloud/cron.json` : chaque jour à 03:17 UTC il lance
`ops/studio/backup-cron.sh`, qui ne fait rien si l'application ne définit pas `STUDIO_BACKUP_CRON=1`, et rien sur une
autre instance que la numéro 0 (Clever lance les tâches d'un dépôt sur chaque application et chaque instance déployée
depuis lui : définissez la variable sur l'application studio seulement, jamais sur celle de traitement). Il lance
`backup --to-bucket --keep ${STUDIO_BACKUP_KEEP:-14}` ; sa ligne va dans les journaux de l'application. Depuis les
archives de la release (qui ne portent pas le script), copiez `ops/studio/backup-cron.sh` dans votre application avec
pour dernière ligne `exec npx web-scumm-studio-server backup --to-bucket --keep "${STUDIO_BACKUP_KEEP:-14}"`, rendez-le
exécutable, et pointez votre `clevercloud/cron.json` dessus : `["17 3 * * * $ROOT/backup-cron.sh"]`. Clever lance une
tâche sans environnement à moins que son script commence par `#!/bin/bash -l`, et avec des chemins absolus seulement
(`$ROOT` est le dossier de l'application). Un redéploiement à chevauchement à cette minute peut faire deux sauvegardes :
sans conséquence.

**L'exercice de restauration**, sur un add-on PostgreSQL neuf, l'instance de production laissée tranquille :
1. Notez la tête (`studio_journal_revision`, ou `GET /api/revision` en membre) et vérifiez que
   `studio_journal_rpo_seconds` vaut 0.
2. Créez un add-on lié à rien : `clever addon create postgresql-addon my-game-pg-drill --plan dev` ; lisez son URI
   avec `clever addon env <id-de-l-add-on>`.
3. Prenez le dernier objet de `backups/` dans le bucket (n'importe quel outil S3, avec les identifiants Cellar), sur
   une machine qui a la configuration de l'application studio (`STUDIO_CONFIG_JSON`, les variables Cellar) et
   `STUDIO_DATABASE_URL` pointé sur l'URI de l'add-on **de l'exercice**. Jamais celui de production : une restauration
   refuse une base qui contient quoi que ce soit, mais vérifiez quand même.
4. Chronométrez : `time npm run studio-server -- restore backups-latest.json --replay`. La ligne qu'elle écrit donne
   les lignes, la révision de la sauvegarde, la révision atteinte, et `stopped` si le rejeu s'est arrêté avant.
5. Vérifiez, en lecture seule, sur les deux bases (`psql <URI>`) : `SELECT value FROM studio_meta WHERE key =
   'revision'` donne la tête notée à l'étape 1 (ou plus loin, si quelqu'un a écrit entre-temps), et `SELECT path, blob
   FROM studio_files ORDER BY path` donne les mêmes lignes à la même révision. Sans accès à la base de production,
   comparez en membre : `GET /api/ops?after=0` (paginé par `next`) donne la révision et l'identifiant de chaque
   opération, à mettre en face de `SELECT rev, op_id FROM studio_ops WHERE state = 'confirmed' ORDER BY rev` sur la
   base de l'exercice, et le contenu d'un fichier lu par l'API en face de son blob dans le bucket.
6. Écrivez le temps, les révisions et toute bizarrerie dans le rapport de qualification, puis supprimez l'add-on
   (`clever addon delete my-game-pg-drill`). Ne lancez jamais `gc --delete` depuis la base de l'exercice : il
   ramasserait des blobs que la production nomme encore.

## Travailler à plusieurs

- **Les pans.** Chaque fichier du jeu appartient à un pan : une salle (son code et son layout), une langue, l'histoire,
  les objets, les personnages, les règles, les voix, les assets, les notes, les regroupements de la carte du scénario,
  le reste (`meta`). Écrire un fichier prend son pan pour 2 min, renouvelées tant que vous êtes actif. Le pan de
  quelqu'un d'autre refuse votre écriture (423, avec son nom) ; votre brouillon reste chez vous.
- **En direct.** Le Studio suit `GET /api/events` : chaque révision, qui tient quoi, qui est là.
- **Ce que vous avez lu** (4.2.3). Une écriture porte la révision que son éditeur a lue (`x-studio-base` ; la réponse
  à une lecture dit sa révision dans `x-studio-revision`). Si quelqu'un d'autre a écrit l'un de ses fichiers depuis,
  l'écriture est refusée (409) avec ce fichier tel que vous l'avez lu et tel qu'il est (les écritures depuis du même onglet, de
  la même session CLI ou MCP ne le refusent jamais ; celles de votre autre onglet, ou d'un agent à vous, si). Le Studio montre ce qui a changé et garde votre brouillon. Pour une modification que le serveur
  fait sur le fichier (un texte, une valeur, une note, une voix), il propose de l'appliquer sur la dernière version ;
  pour un document entier (le layout d'une salle, le storyboard), il propose de remplacer le leur par le vôtre, et le
  dit. Rien n'est renvoyé sans que vous le demandiez. Limites : la vérification se fait par fichier (deux notes
  modifiées en même temps sont un seul fichier) ; le placement de la vue de salle est vérifié par rapport à ce que
  l'onglet Rooms a lu, alors que la vue peut encore montrer une prévisualisation plus ancienne un instant ; un script qui
  n'envoie pas `x-studio-base` n'est pas vérifié ainsi.
- **L'annulation est la vôtre** (4.2.2) : Undo et Redo (et Ctrl/Cmd+Z, Maj pour rétablir) annulent votre propre
  dernière opération, quoi que les autres aient écrit entre-temps, par une nouvelle révision (l'historique n'est
  jamais réécrit). Refusée quand quelqu'un d'autre a écrit l'un de ses fichiers depuis (409), ou tient son pan (423,
  avec son nom). Une nouvelle modification de votre part efface ce que vous pouviez rétablir. Votre pile est gardée
  par le serveur : un autre onglet, un redémarrage, une autre instance voient la même.

## La ligne de commande

```sh
npm run studio-server -- login --server https://studio.example.fr   # device flow : ouvrez le lien, tapez le code
npm run studio-server -- token --server https://studio.example.fr   # un jeton d'accès pour les scripts et le MCP
```

Les jetons sont gardés dans `~/.config/web-scumm/studio-tokens.json` (0600), et envoyés en https seulement. Un agent
IA travaille sur le Studio par son `/mcp` (4.2.3), ou par le serveur MCP local tourné vers lui (`npm run -s mcp --
--server <url>`) : `docs/fr/MCP.md`, « Un Studio hébergé ». Les jetons doivent porter l'`oidc.audience` du Studio.

## Essayer en local

`ops/studio/compose.yml` démarre Postgres, MinIO et Keycloak avec le realm de test et un utilisateur de test
(`lea@example.org`, mot de passe `lea-local-only`, email vérifié). C'est un point de départ, pas une installation clé en
main : avec OIDC, il faut encore une configuration avec `oidc.allowInsecure: true` (un fournisseur en http), un bucket
MinIO, un worker (`npm run studio-worker`) et `trustProxy`. Docker n'est jamais requis. Le serveur tourne aussi sans
OIDC, avec SQLite et un dossier pour les contenus, sur le loopback seulement.

## Limites connues

- Un jeu par instance, une seule instance (le serveur prend un bail ; une seconde attend).
- Le jeu dans le Studio est la prévisualisation d'une révision (4.2.2) : après chaque modification, l'application de
  traitement construit la tête (une rafale de modifications ne construit que sa dernière révision), et la vue de la
  salle la charge une fois prête, sauf si un placement n'est pas enregistré. En attendant, les cadres montrent la
  dernière prévisualisation prête, et l'étiquette sous la vue dit de quelle révision il s'agit, celle en construction,
  et une révision qui ne se construit pas, avec sa raison. Une sauvegarde faite dans un autre contenu demande avant
  d'être reprise : la reprendre ici, recommencer, ou rester dans sa propre révision (ADR 0026). L'onglet Jouer garde la
  prévisualisation qu'il a chargée jusqu'à « Load the latest preview ».
- Une prévisualisation se construit à partir des seuls fichiers texte du jeu (sources, données) : un jeu dont le code
  importe une feuille de style ou une image ne peut pas être prévisualisé.
- Les diagnostics qui exécutent le code du jeu (lint, solveur, playtests) tournent sur l'application de traitement,
  avec les commandes propres du jeu (4.2.2) ; le solveur s'y arrête après 45 s et dit qu'il a été interrompu. Chaque
  lecture dit la révision à laquelle elle a été faite : l'onglet Check l'affiche, et marque ses résultats comme
  périmés dès que la tête a avancé.
- La révision d'une lecture est la tête du journal : une instance qui ne tient pas encore le bail (un déploiement)
  peut répondre depuis un dossier en retard, et une nouvelle histoire (un import, une restauration) n'est pas
  distinguée d'une révision plus ancienne.
- L'en-tête dit la santé du jeu à une révision (4.2.2) : le validateur, puis le solveur depuis une nouvelle partie
  (45 s au plus), sur l'application de traitement, après chaque rafale de modifications. Quand une révision échoue là
  où la dernière jugée passait, une bissection sur les révisions entre les deux nomme la première qui échoue, avec ce
  que son opération a fait et ses fichiers (jamais qui l'a faite), en ⌈log₂ n⌉ jugements au plus ; un dev peut en
  demander une entre deux révisions jusqu'à la tête (`POST /api/health/bisect {good, bad}`). Un solveur interrompu dit
  « inconnu », jamais « valide », et arrête une bissection ; une révision qui n'a pas pu être jugée cinq fois dit « ne
  peut être jugée », avec sa raison. Un verdict plus ancien est affiché en gris, jamais en vert. Une passe de l'onglet Check retient les lectures de l'instance pendant que l'application de traitement
  exécute ses diagnostics : une écriture l'attend.
- L'application de traitement exécute un job à la fois, et chaque révision lui en demande désormais trois : la
  construction d'une prévisualisation, le validateur et une passe du solveur (jusqu'à 45 s) : la validation de la
  modification suivante peut les attendre (pas encore mesuré sur une application Clever, la passe `studio-preview` le
  fait). Une bissection demande jusqu'à deux jobs par révision qu'elle juge.
- La prévisualisation de chaque révision est gardée (environ 1 Mo pour le jeu d'exemple : la base `/preview/<rev>/`
  est écrite dans la page et son code, si bien que peu de fichiers sont partagés d'une révision à l'autre) jusqu'au
  ramassage d'une PR ultérieure de 4.2.2.
- L'onglet Assets est sur un Studio hébergé depuis 4.2.3 : un reviewer lit sa liste, ses prompts et ses fichiers ; un
  dev téléverse et découpe. Un upload (un son, un décor) fait 10 Mio au plus une fois décodé (413 au-delà) et son type
  se lit dans ses octets : une image PNG, JPEG ou WebP (un décor : PNG ou JPEG), un son Ogg, MP3 ou WAV dont
  l'extension dit la même chose (415 sinon ; un Studio local prend aussi M4A, FLAC, AAC, Opus et WebM) ; il est écrit
  en une opération, jamais exécuté. La découpe d'une planche et le détourage d'une cellule tournent sur l'application
  de traitement (jobs `cut`, Python avec les paquets du hook, aucun code du jeu), sous le bail exclusif du projet :
  elle reçoit l'image, les cellules de cette planche et `site.json`, ne rend que des cellules de cette planche, et les
  cellules avec les sauvegardes de celles redécoupées sont écrites en une opération. Un Studio hébergé ne garde pas la
  planche téléversée elle-même (un Studio local la garde sous `private/sheets/`, qu'aucun pan ne nomme).
- Le bouton **Prepare assets** de l'onglet Jouer (et de l'onglet Assets ; un dev, 4.2.2) lance `prepare` sur
  l'application de traitement à partir de l'art et des sons de la tête, sous le bail exclusif du projet (personne
  n'écrit entre-temps ; le pan d'un autre le refuse, avec son nom) : l'ensemble préparé est gardé par le Studio et
  servi avant `publicDir`, et le `assets.gen.json` du jeu est écrit en une opération. Chaque passe prépare tout à
  nouveau, en 2 minutes au plus. Elle est refusée, et le jeu se prépare sur un Studio local, quand : son art et ses
  sons dépassent environ 31 Mio (en base64) ou les fichiers préparés environ 22 Mio ; il nomme ses sources dans
  `sources.json` (elles vivent hors de l'art et des sons que garde un Studio hébergé) ; le nouveau manifeste perdrait
  une image ou un son que le jeu avait. Les builds publiés servent l'ensemble préparé tel qu'il est, pas celui contre
  lequel ils ont été construits. Le code du jeu tourne sur l'application de traitement sous l'utilisateur des outils
  d'assets (ADR 0028 : une machine, un utilisateur).
- Prepare et les découpes sont des **jobs** (4.2.3) : la requête répond 202 avec le job tout de suite ; ses états vont
  au flux en direct (événements `job`, dans l'ordre : `queued`, `running` avec ses étapes `packing`, `on the worker`,
  `writing`, puis `done`, `failed` ou `cancelled`) et `GET /api/jobs/<id>` le relit. Un seul tourne à la fois, quatre
  autres peuvent attendre (429 au-delà). `POST /api/jobs/<id>/cancel` (qui l'a lancé, ou un owner) l'annule : un job
  en attente ne tourne jamais ; un job en cours voit sa requête à l'application de traitement fermée, et celle-ci tue
  son processus enfant avec son groupe ; rien n'est écrit (aucune opération, aucun ensemble préparé gardé) et le bail
  exclusif est rendu. Un job qui écrit ne s'annule plus (409). Un job vit dans la mémoire de l'instance : après un
  redémarrage son état est perdu (son écriture, si elle a eu lieu, est dans le journal).
- Un cadre de jeu resté inactif au-delà de sa session de 15 min ne montre plus rien de neuf : « Reload view » (ou
  l'onglet Jouer) le rouvre.
- Les captures ne sont pas disponibles sur un Studio hébergé.
- L'onglet Jouer montre le jeu avec son panneau DEV ; l'inspecteur d'état, l'explication des règles et les rejeux à
  côté ont besoin du jeu sur l'origine du Studio, donc du Studio local seulement.
- L'Assistant n'est pas encore sur un Studio hébergé.
- Les éditeurs du Studio n'envoient pas encore la révision de ce qu'ils ont lu (le journal la vérifie quand elle est
  envoyée) : dans un pan que vous tenez, votre enregistrement remplace le fichier. Les éditeurs rechargent ce que les
  autres confirment ; cela ne compte que pour une modification commencée juste avant qu'un pan change de main.
- Le bouton Save de l'éditeur de salle ne fait rien sur un Studio hébergé : « Save layout » dans le Studio enregistre
  (la page de l'éditeur est celle du jeu, et seul le membre lance une écriture).
- Un jeu qui importe des fichiers hors de son propre dossier ne peut pas tourner sur le worker.
