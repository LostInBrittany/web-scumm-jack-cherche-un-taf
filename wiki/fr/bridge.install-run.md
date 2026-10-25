# Installer et lancer le Bridge

Cette page vous mène de rien à un Bridge que vos joueurs atteignent en HTTPS, puis décrit les routes du joueur, les
stockages, la conservation, le déploiement de référence et les classements de speedrun qu’il peut aussi servir. Chaque
commande et option : [La ligne de commande du Bridge](bridge.cli.md).

<a name="overview"></a>

## Vue d’ensemble

Le Reality Bridge de référence (`bridge/src/`, le paquet `@quest-n-click/bridge`) sert un jeu. C’est un petit service
Node : appairage, connecteurs sous capacités Biscuit, un webhook de démonstration, des événements signés, des
Server-Sent Events. Depuis la 4.1.10 il garde son état dans un stockage (le journal JSON-lines de la 4.1.9, SQLite ou
Postgres), et un déploiement peut faire tourner plusieurs instances et servir plusieurs tenants. Ce qu’est un Bridge,
pour les auteurs : [Le Reality Bridge : ce que c’est](bridge.what-it-is.md) et
[Signaux et manifeste](bridge.signals-manifest.md). Pourquoi il est construit ainsi :
[`docs/dev/THREAT-MODEL.md`](../../docs/dev/THREAT-MODEL.md) et
[`docs/dev/threat-models/constellation.md`](../../docs/dev/threat-models/constellation.md).

<a name="what-you-get"></a>

## Ce que vous obtenez

Un processus `serve` qui écoute sur `127.0.0.1:8787` derrière votre proxy inverse HTTPS, avec les clés et la
configuration d’un jeu dans un dossier privé, son état dans un stockage (SQLite recommandé), qui répond à `/readyz`,
prêt pour chaque connecteur à qui vous donnez un jeton. Le `reality.bridge` du jeu pointe vers son URL publique.

<a name="context-and-versions"></a>

## Contexte et versions

- Contexte : un Bridge, sur la machine qui le fera tourner. Les commandes sont les mêmes depuis le dépôt du moteur,
  depuis un projet créé ou depuis le paquet autonome ; seul leur nom change (section suivante).
- À partir de la 4.3.0 : les commandes s’appellent `quest-n-click-bridge` (4.2.5 ; les noms `web-scumm` sont partis en
  4.3.0), et le Bridge vérifie ses `limits` avant de démarrer (4.3.0). Le profil `local` (SQLite) est **stable** ; le
  profil `distributed` (Postgres, plusieurs instances) est **expérimental** ([Stabilité et support](start.stability.md)).
- **Vérifié sur :** les commandes des étapes 2, 3 et 6, puis `doctor` et `/healthz`, ont été lancées le 23 octobre
  2026, sur macOS, Node 22.14, moteur 4.4.0, depuis le dépôt du moteur avec le jeu `signals`, sur `127.0.0.1`.
  L’installation depuis l’archive (étape 1) et la partie HTTPS (étape 4) n’ont pas été rejouées pour cette page.

<a name="prerequisites"></a>

## Prérequis

- Node 22.12 ou plus récent ; **22.13 ou plus récent pour SQLite** (`node:sqlite`) ([Prérequis](install.requirements.md)).
- Un jeu qui déclare `reality.signals` ([Signaux et manifeste](bridge.signals-manifest.md)). Une fois construit, son
  manifeste est dans `dist/reality-manifest.json`.
- Pour Internet : un nom de domaine et un proxy inverse qui termine TLS (Caddy, nginx…) et **ne met pas en tampon les
  réponses `text/event-stream`**.
- En option : `pg` pour Postgres, `@opentelemetry/api` (et `@opentelemetry/sdk-node`) pour exporter les mesures.

<a name="where-to-run"></a>

## Où lancer les commandes

Sur la machine qui fait tourner le Bridge, à l’un de ces trois endroits :

| Où | La commande | Le manifeste du jeu vient de |
|---|---|---|
| Le dépôt du moteur | `npm run bridge -- <commande>` (avec `GAME=<id>` pour un autre jeu que le jeu courant) | le contenu du jeu |
| Un projet créé | `npx quest-n-click bridge <commande>`, une fois `@quest-n-click/bridge` installé à côté du moteur | le contenu du jeu |
| Le paquet autonome, sur un serveur | `npx quest-n-click-bridge <commande>` | `init --manifest=<jeu>/dist/reality-manifest.json` |

Le paquet `@quest-n-click/bridge` est l’archive `quest-n-click-bridge-<version>.tgz` jointe à une release : un module
JavaScript, ses politiques Datalog et son schéma SQL. Il lui faut le WebAssembly de Biscuit et zod ; `pg` seulement
pour Postgres, `@opentelemetry/api` seulement pour les mesures. Les exemples ci-dessous utilisent la forme du dépôt du
moteur.

<a name="steps"></a>

## Étapes

<!-- step: install -->
1. Sur un serveur, installez le paquet depuis l’archive de la release (dans le dépôt du moteur ou un projet créé,
   sautez cette étape) :

   ```sh
   # sur le serveur, dans le dossier du Bridge (par exemple /srv/bridge)
   npm install ./quest-n-click-bridge-<version>.tgz
   ```

<a name="start"></a>

### En lancer un

<!-- step: init -->
2. Créez les clés et la configuration. Sur Internet, laissez de côté les webhooks de démonstration et gardez l’état
   dans SQLite :

   ```sh
   # dans le dépôt du moteur
   npm run bridge -- init --store=sqlite --no-demo-webhooks --audience=bridge.example.org --origin=https://game.example.org
   ```

   `init` lit le manifeste du jeu et écrit, sous `--dir` (`.cache/bridge` par défaut), en mode 600 :
   - `config.json` : le manifeste et son empreinte, la clé publique de la racine Biscuit, la clé qui signe les
     événements (Ed25519, avec un `kid`), l’empreinte du jeton de l’opérateur, le stockage, et un webhook de
     démonstration par source sauf avec `--no-demo-webhooks` (son secret et son propre jeton de connecteur : tout
     joueur des signaux de cette source, peut confirmer des appairages, pendant 30 jours ou `--demo-days`) ;
   - `root.key` : la moitié privée de la racine Biscuit, lue par `grant` seulement. `serve` ne la charge jamais :
     gardez-la là où le Bridge n’est pas, si vous le pouvez ;
   - `admin-token` : le jeton de l’opérateur, seule copie en clair.

   Rien de secret n’est affiché. `.cache/` est ignoré par git. Sans `--store`, `init` écrit toujours la configuration
   du journal JSON-lines, par compatibilité.

> [!LIMIT id=bridge-init-force]
> `init` refuse d’écraser un `config.json` existant. `--force` le remplace, et chaque clé et chaque jeton avec lui :
> chaque connecteur a besoin d’un nouveau jeton et chaque joueur d’un nouvel appairage.

<!-- step: serve -->
3. Lancez-le sur la boucle locale :

   ```sh
   # dans le dépôt du moteur
   npm run bridge -- serve --port=8787 --host=127.0.0.1 --trust-proxy
   ```

   Il journalise `{"event":"bridge.listening",…,"store":"sqlite","pid":…}` et continue de tourner. SIGTERM ou Ctrl-C
   l’arrête : les flux se terminent, le serveur se ferme, le stockage et ses verrous sont libérés, code de sortie 0.
   Faites-le tourner sous un superviseur (systemd, la politique de redémarrage d’un conteneur).

<!-- step: proxy -->
4. Mettez-le derrière HTTPS. Le proxy inverse termine TLS, transmet à `127.0.0.1:8787` et ne met pas en tampon
   `text/event-stream`. `--trust-proxy` fait voir aux limites par adresse l’adresse du client (`X-Forwarded-For`) :
   - `--trust-proxy` seul ne fait confiance qu’à la boucle locale ;
   - `--trust-proxy=10.0.0.0/8,192.0.2.7` nomme les proxies (adresses ou réseaux IPv4) : l’en-tête n’est lu que
     venant d’eux, et le client est son adresse la plus à droite qui n’en est pas un.

   Un proxy ailleurs que sur la boucle locale (le routeur d’un PaaS) doit être nommé : sinon tous les clients
   partagent l’adresse du proxy et son unique compartiment de limite. `--origin` (à `init`) liste le site du jeu pour
   CORS ; les routes du joueur ne répondent qu’à lui.

<!-- step: game-url -->
5. Mettez l’URL publique du Bridge (`https://bridge.example.org/`) dans le `reality.bridge` du jeu, puis construisez
   et publiez le jeu ([Signaux et manifeste](bridge.signals-manifest.md#reality-bridge)).

<!-- step: grant -->
6. Donnez à chaque connecteur son propre jeton, aussi étroit que sa tâche, et remettez-le sous forme de fichier :

   ```sh
   # dans le dépôt du moteur
   npm run bridge -- grant --connector=mail-1 --source=mail --signals=mail.answer.correct,mail.answer.wrong --pair > mail-1.token
   ```

   Puis lancez le connecteur ([Vue d’ensemble des connecteurs](bridge.connectors.md#run-one)).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- `GET /livez` répond 200 `{"status":"ok"}` ; `GET /readyz` répond 200 quand le stockage répond ; `GET /healthz` donne
  les tenants, le type de stockage et les flux ouverts. Aucune ne demande de jeton, aucune ne montre les données d’un
  tenant.
- `npm run bridge -- doctor` lit le stockage sans le modifier : sur SQLite, la version de son schéma et, par tenant,
  les joueurs, les signaux, tout trou dans la séquence d’un joueur (code de sortie 1) et les lignes en quarantaine.
- Quand un joueur se lie, le journal affiche `"event":"pairing.confirmed"` ; quand un connecteur propose,
  `"event":"signal.accepted"`.
- Sous Node 22, un stockage SQLite fait afficher par Node `ExperimentalWarning: SQLite is an experimental feature…`
  sur la sortie d’erreur : c’est l’avertissement de Node sur `node:sqlite`, pas celui du Bridge.

Pour vérifier un appairage, lisez le journal. N’appelez jamais `GET /v1/pairings/<code>` : c’est la récupération
unique du joueur, et l’appeler remet, et consomme, la capacité du joueur.

<a name="common-errors"></a>

## Erreurs fréquentes

| Message | Cause | Correction |
|---|---|---|
| `✖  the game declares no reality.signals: nothing to bridge` | Le jeu courant n’a pas de `reality`, ou l’`init` autonome n’a pas de `--manifest` | Choisir le jeu (`GAME=<id>`), ou passer `--manifest=<jeu>/dist/reality-manifest.json` |
| `✖  …/config.json exists (--force replaces it, and every key and token with it)` | `init` lancé deux fois | Garder l’existant ; `--force` seulement pour tout recommencer |
| `the game's manifest (…) is not the one configured (…)` au `serve` | Les signaux du jeu ont changé depuis `init` | Un nouvel `init` dans un nouveau dossier pour le nouveau manifeste, puis de nouveaux jetons et appairages |
| `limits.<nom> must be an integer of at least <n>, not <valeur>`, ou `limits.<nom> is no limit of the Bridge (…)` | Une mauvaise valeur dans les `limits` de `config.json` (vérifiées depuis la 4.3.0) | Corriger la valeur, ou la retirer pour garder le défaut ([CLI](bridge.cli.md#limits)) |
| `journal in use by process <pid> (…lock): one Bridge per journal` | Un autre Bridge (ou `compact`) tient le journal | L’arrêter ; si ce numéro de processus appartient désormais à un processus sans rapport après un plantage, regarder, puis supprimer le verrou |
| `✖  … : not serving` | Une restauration ou une migration descendante tient le stockage (un bail de maintenance) | Attendre qu’elle se termine |
| `✖  the leaderboards and the daily challenge keep their records in SQL: …` | Une section `runs` ou `daily` sur le journal | Passer à SQLite ([Stockages](#stores)) |
| `✖  the Reality Bridge is a separate package: npm install @quest-n-click/bridge` | Dans un projet créé, le paquet manque | L’installer à côté du moteur |

<a name="files-changed"></a>

## Fichiers ou données modifiés

- Le dossier du Bridge (`--dir`) : `config.json`, `root.key`, `admin-token` (mode 600) ; le stockage, `bridge.sqlite`
  et ses `-wal` et `-shm` (mode 600), ou `journal.jsonl` et son `journal.jsonl.lock` pendant qu’un Bridge tourne.
- `rotate` et `migrate --from=jsonl` réécrivent `config.json`.

<a name="recovery"></a>

## Reprise ou retour en arrière

- Une instance tuée ou plantée : en lancer une autre ; rien n’est perdu.
- La base perdue : restaurer la dernière sauvegarde dans une nouvelle ([Sauvegarde et restauration](bridge.backup-restore.md)).
- Une clé ou une racine compromise : [Sécurité](bridge.security.md#procedures).
- Arrêter pour de bon : arrêter `serve`, garder le dossier (ses clés signent ce que les joueurs ont déjà) et une
  sauvegarde aussi longtemps que vous devez répondre des données, puis les supprimer.

<a name="players-side"></a>

## Côté joueur

Les routes qu’appelle le jeu (CORS pour les sites de `--origin` seulement) :

- `POST /v1/pairings` `{ gameId }` → `{ code, expiresAt }` (10 minutes) ; `GET /v1/pairings/<code>` → `pending`, puis
  une seule fois `{ playerId, capability }`. Les codes en attente de confirmation sont 1 000 au plus, tous joueurs
  confondus, et balayés une fois expirés. Aucune capacité n’attend nulle part : elle est tirée quand le joueur
  récupère le code, et seule son empreinte est gardée.
- `GET /v1/events?after=<n>` (Server-Sent Events, capacité en Bearer) et `GET /v1/signals?after=<n>` →
  `{ signals, sequences }` : les signaux signés après une séquence, chacun avec sa séquence. `POST /v1/ack { through }` :
  appliqué et sauvegardé jusque-là.
- Un joueur tient au plus 4 flux ouverts. Un flux dont le lecteur a cessé de lire (64 Ko non envoyés) ou dont le lien
  a été révoqué ou a expiré entre-temps est fermé par le Bridge, et le joueur se reconnecte depuis son curseur.
- `GET /v1/keys` : les clés publiques, actuelle et précédentes. `GET /v1/manifest` : le manifeste du jeu et son
  empreinte.
- Une capacité lit et acquitte les signaux d’un joueur, rien d’autre, et vit 30 jours après son dernier accusé de
  réception, 180 jours au plus après son appairage. Dans le navigateur elle reste sensible (tout script de la page peut
  la lire) : une capacité révoquée ou expirée rend le joueur « non lié », et le jeu peut être lié de nouveau.
  « Unlink » dans le menu pause la révoque sur le Bridge (`POST /v1/unlink`, capacité en Bearer), pas seulement sur
  l’appareil.
- Par adresse, les routes ouvertes à tous (un code, son état, les clés, le manifeste) répondent à 60 requêtes par
  minute, et 60 authentifications ratées par minute sur les autres font refuser toutes les requêtes de cette adresse
  pendant un moment (429, `Retry-After: 60`).

Les routes des connecteurs (`POST /v1/signals`, `POST /v1/pairings/<code>/confirm`, `POST /v1/hooks/<source>`) :
[Vue d’ensemble des connecteurs](bridge.connectors.md#run-one).

<a name="stores"></a>

## Stockages et profils

| Profil | Stockage | Pour |
|---|---|---|
| `local` (stable) | SQLite (`node:sqlite`, Node 22.13+, un fichier, WAL) | une machine, un ou quelques processus |
| (4.1.9) | le journal JSON-lines | une configuration écrite avant la 4.1.10, ou `init` sans `--store` ; un processus |
| `distributed` (expérimental) | Postgres (`pg`) | plusieurs instances derrière un répartiteur de charge |

- `init --store=sqlite` écrit `"store": "sqlite:bridge.sqlite"` dans `config.json`. Une URL de base de données n’est
  jamais écrite dans le fichier : `serve --store=postgres://…`, ou la variable
  [`BRIDGE_STORE`](reference.environment-variables.md#bridge-store), ou
  [`BRIDGE_STORE_FILE`](reference.environment-variables.md#bridge-store-file) qui nomme un fichier la contenant (un
  fichier secret, pour que le mot de passe ne soit pas dans un environnement qu’une liste des processus affiche).
  `--store=` l’emporte sur `BRIDGE_STORE`, qui l’emporte sur `BRIDGE_STORE_FILE`, qui l’emporte sur le fichier.
- Le schéma est versionné (`bridge/migrations/`, cinq étapes) : un stockage SQL le monte à l’ouverture ;
  `migrate --schema=N` monte ou descend à la main, et une base plus récente que le Bridge est refusée.
- Le fichier SQLite et ses `-wal` et `-shm` sont en mode 0600. Une écriture qui attend plus de 5 s le verrou d’un
  autre processus reçoit 503 avec `Retry-After: 1` (le connecteur la renvoie).
- Passer d’un journal à SQLite, le Bridge arrêté (le journal est gardé tel quel) :

  ```sh
  # dans le dépôt du moteur, le Bridge arrêté
  npm run bridge -- migrate --from=jsonl --to=sqlite
  ```

  Il lit le journal sous son verrou, écrit chaque joueur, signal, accusé de réception et révocation dans le nouveau
  stockage, les relit, puis nomme le nouveau stockage dans `config.json` (pas pour une URL).

<a name="retention"></a>

## Conservation, export et suppression

- Le journal (`journal.jsonl`) garde chaque signal accepté : son identifiant, sa séquence, la clé du connecteur,
  l’enveloppe signée et, depuis la 4.1.2, la charge telle qu’acceptée (pour la re-signer après une rotation) ; jamais
  un jeton ni un e-mail. Gardez-le tant que des joueurs peuvent être hors ligne avec des signaux à recevoir ; ensuite,
  un joueur s’appaire de nouveau.
- `GET /v1/admin/players/<p-…>` (jeton de l’opérateur en Bearer) : tout ce qui est gardé sur un joueur (son lien sans
  la capacité, ses signaux, son accusé de réception). `DELETE /v1/admin/players/<p-…>` : le supprime ; sur le journal,
  le fichier est réécrit sans aucune ligne sur ce joueur (chaque ligne lue comme un événement, jamais comparée comme
  du texte).

  ```sh
  # sur la machine du Bridge, dans le dépôt du moteur
  curl -s -H "Authorization: Bearer $(cat .cache/bridge/admin-token)" https://bridge.example.org/v1/admin/players/p-0123456789abcdef
  curl -s -X DELETE -H "Authorization: Bearer $(cat .cache/bridge/admin-token)" https://bridge.example.org/v1/admin/players/p-0123456789abcdef
  ```

- `doctor` sur le journal dit ce qu’il contient. Une dernière ligne coupée par un plantage est retirée au démarrage
  suivant, et c’est dit dans le journal d’exécution (`journal.repaired`) ; toute autre ligne qui ne se lit pas, ou se
  lit mais n’est pas un événement de la forme du journal (chaque champ vérifié, 4.1.8), est une corruption, et le
  Bridge refuse de démarrer plutôt que de deviner.
- Un Bridge par journal (4.1.8) : le Bridge en marche tient `journal.jsonl.lock` avec son numéro de processus ; un
  second démarrage sur le même fichier refuse tant que ce processus vit, et reprend un verrou laissé par un plantage
  (dit dans le journal d’exécution). Ctrl-C ou SIGTERM le libère. `compact` prend le verrou aussi, donc refuse tant que
  le Bridge tourne. Un verrou dont le numéro de processus a été repris par un processus sans rapport depuis le plantage
  est refusé comme « en usage » : regardez, puis supprimez-le. Le verrou est un lien physique : le dossier du journal
  doit être sur un système de fichiers qui les accepte (APFS, ext4 et NTFS oui ; FAT et certains montages réseau non).
- `compact [--retention-days=90]`, le Bridge arrêté, réécrit le journal sans les appairages échus, les versions
  antérieures de la ligne d’un joueur, et les signaux acquittés plus vieux que la rétention. Le dernier signal d’un
  joueur reste toujours (sa prochaine séquence se compte à partir de lui), tout comme ce qui n’est pas encore acquitté.

> [!LIMIT id=bridge-sql-no-retention]
> Un stockage SQL garde tous les signaux : `compact` est la commande du journal et refuse un stockage SQL. Supprimer un
> joueur retire ses lignes du stockage, pas des fichiers de sauvegarde déjà écrits : c’est à vous de les faire expirer.

Supprimer les données d’un joueur partout (le Bridge, une boîte mail, une configuration SSH, la mémoire des
connecteurs, l’appareil) : [Vie privée](play.privacy.md#deleting) et
[La ligne de commande du Bridge](bridge.cli.md#deleting-a-player).

<a name="reference-deployment"></a>

## Le déploiement de référence (4.1.18)

`ops/qualify/` est le profil `distributed` sous forme de déploiement reproductible : un proxy HTTPS (Caddy), trois
Bridges construits depuis l’archive `quest-n-click-bridge`, un Postgres, deux tenants, chaque image épinglée par
empreinte, les Bridges en lecture seule et sans privilège, le mot de passe et l’URL de la base en fichiers secrets
(`BRIDGE_STORE_FILE`), Postgres jamais publié. `npm run ops:qualify` (dans le dépôt du moteur, avec Docker) le monte,
tue une instance pendant des propositions, tient un flux sur une autre, vérifie que les tenants restent séparés, puis
sauvegarde, détruit la topologie avec sa base et la restaure ([`ops/qualify/README.md`](../../ops/qualify/README.md)).
Le profil `distributed` reste expérimental tant qu’une passe humaine derrière un vrai domaine (24 à 48 heures) n’a
pas réussi.

<a name="leaderboards"></a>

## Classements et défi du jour (4.1.16)

La section `runs` d’une configuration monte `/v1/runs` ; sa section `daily` monte `/v1/daily`, `/v1/commit` et
`/v1/reveal/<id>`. Les deux gardent leurs enregistrements dans le stockage SQL (`--store=sqlite:<fichier>` ou
`BRIDGE_STORE=postgres://…` ; `serve` les refuse sur le journal), migrations 0002 à 0004. Ce qu’elles font pour les
joueurs et les auteurs (soumettre un run, le classement, la graine du jour, les mondes Mystère) :
[Speedrun pour les auteurs](create.speedrun.md#leaderboards).

```json
"runs": {
  "games": { "reference": { "dir": "/srv/games/reference", "fingerprint": { "logic": "…", "trustedExtensions": "…", "presentation": "…", "engine": "…" } } },
  "worker": ["/usr/bin/node", "/srv/quest-n-click/node_modules/tsx/dist/cli.mjs", "/srv/quest-n-click/tools/speedrun/worker.ts"],
  "workers": 2
},
"daily": { "games": { "reference": { "daily": "daily", "mystery": "mystery" } }, "kid": "daily-2026", "keyFile": "daily.jwk", "secretFile": "daily.secret" }
```

- `runs` prend aussi `timeoutMs`, `maxQueued` (100 par défaut), `retentionDays`, `perMinute` (10 par défaut) et
  `adminTokenFile` ([Modération](#moderation)). `daily` prend aussi `retentionDays` (30 par défaut).
- Les limites de la file valent pour toutes les instances ensemble (4.1.17) : `maxQueued`, les runs en attente ou en
  cours de vérification, est compté et écrit dans une transaction sous le verrou du tenant ; `perMinute` est un
  compartiment par client dans la table `run_quota`. Le client est l’adresse de la socket, ou celle que nomme un proxy
  de confiance (`--trust-proxy`) : seul un HMAC en est gardé, avec un secret que chaque instance du tenant dérive de sa
  clé d’événements. Faire tourner la clé d’événements fait tourner ce secret aussi : chaque client repart sur un
  nouveau compartiment (au plus une minute de quota en plus), et les anciens sont purgés avec les inactifs. Une limite
  globale au proxy reste une bonne idée devant tout cela.
- `keyFile` (le JWK privé Ed25519 dont le manifeste du jeu nomme la moitié publique dans `remix.daily`) et
  `secretFile` (le secret des jours) sont à côté de `config.json`, en mode 0600. Faire tourner la clé du défi du jour,
  c’est publier le jeu avec la nouvelle clé publique : le joueur et le vérificateur n’acceptent que la clé que nomme le
  manifeste, donc un jeton d’un autre `kid` est refusé.
- Les runs et les enregistrements du jour sont écrits dans le même stockage SQL, donc toutes les instances répondent
  pareil ; les vieux runs sont purgés toutes les heures, les enregistrements du jour échus aussi.
- Les routes : `POST /v1/runs` `{ player, envelope }` renvoie l’identifiant du run et un jeton de suppression ;
  `GET /v1/runs?game=&category=[&key=][&limit=]` est un classement (les runs valides seulement ; 100 lignes, `&limit=`
  jusqu’à 1 000) ; `GET /v1/runs/<id>` est un run ; `DELETE /v1/runs/<id>` avec `x-delete-token` le supprime ; `POST
  /v1/runs/<id>/moderate` avec le jeton de modération le fait passer `moderator-verified`.
  `GET /v1/daily?game=[&date=]` signe la graine du jour (un vrai jour UTC, aujourd’hui ou dans `retentionDays`) ;
  `POST /v1/commit` et `GET /v1/reveal/<id>` s’engagent sur une graine Mystère puis la révèlent, les deux signés. Ces
  routes puisent dans le budget par adresse des routes ouvertes à tous.
- Les workers de toutes les instances partagent une file : un run est créé une fois (sa clé est unique, donc deux
  instances qui reçoivent le même run n’en créent qu’un), pris par un seul worker sous un bail, et repris quand son
  worker est mort et que le bail a expiré ; un worker qui a perdu son bail ne peut pas enregistrer de verdict. Le
  processus HTTP ne rejoue jamais. Chaque worker vérifie le paquet du jeu contre son empreinte approuvée et signe sa
  réponse avec une clé à usage unique ; l’enveloppe est abandonnée une fois le verdict enregistré. Soumissions,
  verdicts, modérations et suppressions sont des lignes d’audit dans le journal du Bridge.

<a name="speedrun-worker"></a>

## Le worker des speedruns

Chaque run est vérifié par un processus worker que lance le Bridge (la commande `worker`). Le refus du réseau à
l’intérieur du processus worker est une défense en profondeur, pas un bac à sable : un rejeu exécute le code du jeu,
et un paquet ou un run hostile pourrait encore atteindre le système de fichiers, lancer un processus ou ouvrir une
socket autrement. Faites tourner la commande du worker dans l’isolation du déploiement, par exemple :

```sh
docker run --rm -i --network none --read-only --tmpfs /tmp:rw,size=64m --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 64 --memory 512m --memory-swap 512m --cpus 1 --user 65534:65534 -v /srv/games:/srv/games:ro web-scumm-worker \
  timeout -s KILL 70 node tools/speedrun/worker.ts
```

comme commande `worker` : pas d’espace de noms réseau, une racine en lecture seule, un dossier temporaire borné, aucune
capability, aucun secret du Bridge dans son environnement (le Bridge ne transmet que `PATH`, `GAME_DIR` et
`NODE_OPTIONS`), des limites sur le CPU, la mémoire (pas de swap au-delà), les processus et le temps (le Bridge tue le
groupe de processus à `timeoutMs` + 5 s). Sa sortie standard est plafonnée à 1 Mo et sa sortie d’erreur n’est pas
gardée. Tout dossier monté est lisible à l’intérieur : gardez le dossier du Bridge (`config.json`, ses clés et ses
fichiers de jetons) hors du dossier du moteur monté sur `/app`. Tuer le client `docker` n’arrête pas son conteneur :
c’est `timeout -s KILL` à l’intérieur (un peu au-delà du `timeoutMs` du Bridge) qui termine un rejeu trop long, pour
que les conteneurs dépassés ne s’accumulent jamais.

Depuis la 4.1.17, ce profil est une fonction (`tools/speedrun/container.mjs`, `workerContainerArgs`) :

```sh
# dans le dépôt du moteur
node tools/speedrun/container.mjs --image=<image> --app=<engine folder> [--games=<folder>]
```

affiche la commande `worker`, **sans réseau sauf avec `--allow-network`** (qui le dit sur la sortie d’erreur). Le job
`worker-container` de la CI (`npm run e2e:worker-container`, Linux et Docker) y fait tourner le run de référence, puis
un script hostile : HTTP, DNS et TCP refusés, rien d’écrit hors de `/tmp`, les secrets de l’hôte invisibles, un
processus enfant permis mais sans réseau, le conteneur tué par son propre délai sans rien laisser tourner ; puis un run
de nouveau.

> [!LIMIT id=bridge-worker-not-a-sandbox]
> Le worker refuse fetch, WebSocket, TCP, UDP et DNS dans son propre processus, comme deuxième ligne de défense. Ce
> n’est pas un bac à sable : l’isolation, c’est le conteneur (ou équivalent) dans lequel vous le lancez.

<a name="moderation"></a>

## Modération

`runs.adminTokenFile` nomme le fichier du jeton qui modère les classements d’un tenant (`POST
/v1/runs/<id>/moderate`, `Authorization: Bearer …`) : à côté de `config.json`, en mode 0600, au moins 32 caractères.
`serve` refuse de démarrer quand il manque, est plus court, ou est ouvert aux autres (sur les systèmes POSIX ; sous
Windows, c’est l’ACL du dossier qui décide). Sans lui, pas de route de modération (404, rien de compté). Le jeton est
comparé sous forme d’empreintes de même longueur (sa longueur ne dit rien non plus) ; chaque refus est une ligne
d’audit (`run.moderation-refused`, jamais le porteur), et `/healthz` compte les modérations acceptées et refusées.

<a name="references"></a>

## Références

- Les commandes : [`bridge/src/cli.ts`](../../bridge/src/cli.ts), [`bridge/src/cli-store.ts`](../../bridge/src/cli-store.ts) ;
  les routes : [`bridge/src/server.ts`](../../bridge/src/server.ts) ; les limites :
  [`bridge/src/config.ts`](../../bridge/src/config.ts).
- [La ligne de commande du Bridge](bridge.cli.md) · [Sauvegarde et restauration](bridge.backup-restore.md) ·
  [Plusieurs tenants](bridge.multi-tenant.md) · [Sécurité](bridge.security.md) ·
  [Dépannage](bridge.troubleshooting.md).
- La conception : [ADR 0009](../../docs/dev/adr/0009-reality-store.md) ; le modèle de menace de plusieurs instances :
  [`docs/dev/threat-models/constellation.md`](../../docs/dev/threat-models/constellation.md).
