# Renouveler les clés

Comment remplacer chaque secret d’un Studio hébergé, et ce que chaque changement fait aux personnes connectées : la clé
de session, la clé des jobs du worker, le secret client du fournisseur, la clé de déploiement Git et le jeton des
métriques.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un nouveau secret en place, l’ancien retiré, et personne de déconnecté sauf si vous le choisissez (une clé de session
compromise).

<a name="context-and-versions"></a>

## Contexte et versions

- Un Studio hébergé sur Clever Cloud, à partir de la 4.2.3 (`STUDIO_GIT_KEY` et `STUDIO_METRICS_TOKEN` sont arrivés en
  4.2.3).
- **Vérifié sur : non vérifié sur une installation réelle.** Aucun renouvellement n’a été exercé sur le déploiement de
  référence. Les effets sur les sessions sont lus dans le code ; ceux de la clé de session sont appuyés par le test
  nommé plus bas.

<a name="prerequisites"></a>

## Prérequis

- [Configuration](clever.configuration.md) faite, les secrets actuels dans `~/secrets/my-game/` (0600).
- `openssl`, et le dépôt du moteur, `npm ci` fait.

<a name="where-to-run"></a>

## Où lancer les commandes

Sur votre machine, dans le dépôt du moteur où les deux applications sont liées. Un changement de variable s’applique au
déploiement ou au redémarrage suivant, et un redémarrage, c’est le chevauchement des [Redéploiements](clever.redeploys.md) :
prévoyez sa minute d’écritures lentes. Ne montrez jamais la sortie de `clever env` : elle affiche les valeurs
([Configuration](clever.configuration.md#where-to-run)).

<a name="steps"></a>

## Étapes

<a name="session-key"></a>

### `STUDIO_SESSION_KEY`

Le cookie de session est un jeton aléatoire stocké par son hash : il ne dépend pas de cette clé. La clé scelle le jeton
de rafraîchissement et l’id_token de chaque session (AES-256-GCM). C’est un trousseau, séparé par des virgules : la
**première** clé scelle, **n’importe laquelle** ouvre.

<!-- step: session-prepend -->
1. Créez une nouvelle clé et mettez-la **en premier**, l’ancienne après :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   openssl rand -base64 48 > ~/secrets/my-game/session-key.new && chmod 600 ~/secrets/my-game/session-key.new
   clever env set --alias my-game-studio -- STUDIO_SESSION_KEY "$(cat ~/secrets/my-game/session-key.new),$(cat ~/secrets/my-game/session-key)"
   clever restart --alias my-game-studio
   ```

   Personne n’est déconnecté. Les nouvelles connexions sont scellées avec la nouvelle clé ; les sessions existantes
   s’ouvrent toujours avec l’ancienne.

<!-- step: session-drop-old -->
2. Après la durée absolue des sessions (24 h par défaut, `sessions.absoluteHours`), chaque session scellée avec
   l’ancienne clé a pris fin. Retirez-la du trousseau, et gardez le nouveau fichier comme fichier courant :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   mv ~/secrets/my-game/session-key.new ~/secrets/my-game/session-key
   clever env set --alias my-game-studio -- STUDIO_SESSION_KEY "$(cat ~/secrets/my-game/session-key)"
   clever restart --alias my-game-studio
   ```

**Si la clé a fuité**, sautez le trousseau : posez la nouvelle clé seule et redémarrez. La vérification suivante de
chaque session par le fournisseur (sous 5 min) ne peut plus ouvrir son jeton de rafraîchissement, et la session prend
fin : le membre voit « the session can no longer be checked: log in again » (401) et se reconnecte. Les jetons Bearer
de la CLI et du MCP ne sont pas scellés par cette clé et ne sont pas touchés.

> [!GUARANTEE id=unreadable-session-ends]
> Une session dont le jeton de rafraîchissement scellé ne s’ouvre plus (sa clé a quitté le trousseau) prend fin à sa
> vérification suivante, avec un 401, plutôt que de vivre sans vérification jusqu’à sa durée absolue.

<a name="worker-key"></a>

### `STUDIO_WORKER_KEY` et `WORKER_PUBLIC_KEY`

Le Studio signe chaque job avec la clé privée ; le worker n’accepte que les jobs que sa clé publique vérifie. Le worker
ne tient qu’une clé publique à la fois : il y a donc une fenêtre pendant laquelle les jobs sont refusés.

<!-- step: worker-new-pair -->
3. Créez une nouvelle paire dans un nouveau dossier (la commande refuse d’écraser une clé) :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   mkdir -p ~/secrets/my-game/keys-new && npm run studio-server -- worker-keys --out ~/secrets/my-game/keys-new
   ```

<!-- step: worker-switch -->
4. Posez les deux variables, puis redémarrez le worker et le studio l’un juste après l’autre :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever env set --alias my-game-worker -- WORKER_PUBLIC_KEY "$(cat ~/secrets/my-game/keys-new/studio-worker.pub)"
   clever env set --alias my-game-studio -- STUDIO_WORKER_KEY "$(cat ~/secrets/my-game/keys-new/studio-worker.key)"
   clever restart --alias my-game-worker
   clever restart --alias my-game-studio
   ```

   Entre les deux, le worker refuse les jobs de l’ancien Studio (403) : les écritures qui demandent une vérification
   sont refusées en 503 (« the edit cannot be judged now: … »), les prévisualisations et la santé échouent et sont
   retentées. Les sessions ne sont pas touchées.

> [!LIMIT id=builds-old-key]
> Les builds publiés gardent la signature faite avec l’ancienne clé ; leur manifeste nomme cette clé par son
> identifiant (un hash de la clé publique). Gardez l’ancien `studio-worker.pub` pour vérifier les builds publiés avant
> le renouvellement.

<a name="oidc-secret"></a>

### `STUDIO_OIDC_CLIENT_SECRET`

<!-- step: oidc-regenerate -->
5. Régénérez le secret du client `studio` chez le fournisseur (dans Keycloak : l’onglet Credentials du client),
   enregistrez-le dans le fichier 0600, posez-le, et redémarrez le studio aussitôt :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever env set --alias my-game-studio -- STUDIO_OIDC_CLIENT_SECRET "$(cat ~/secrets/my-game/oidc-client-secret)"
   clever restart --alias my-game-studio
   ```

   Jusqu’au redémarrage, les nouvelles connexions échouent. Le fournisseur répond alors aux vérifications des sessions
   `invalid_client`, que le Studio traite comme sa propre erreur de configuration, pas celle de l’utilisateur : une
   session continue jusqu’à R (15 min) après sa dernière vérification, puis elle est suspendue (503) jusqu’à ce que le
   secret corresponde de nouveau. Personne n’est déconnecté si le redémarrage arrive à temps.

<a name="git-key"></a>

### `STUDIO_GIT_KEY`

<!-- step: git-key -->
6. Ajoutez une nouvelle clé de déploiement au dépôt du jeu chez votre hébergeur Git, posez-la, redémarrez, puis
   retirez l’ancienne clé chez l’hébergeur :

   ```sh
   # sur votre machine, dans le dépôt du moteur (ssh-keygen écrit la paire ; le .pub va chez l'hébergeur Git)
   ssh-keygen -t ed25519 -N '' -C my-game-studio -f ~/secrets/my-game/git-deploy-key-new
   clever env set --alias my-game-studio -- STUDIO_GIT_KEY "$(cat ~/secrets/my-game/git-deploy-key-new)"
   clever restart --alias my-game-studio
   ```

   Aucun effet sur les sessions. Un push ou un import pendant la bascule peut échouer, et se relance.

<a name="metrics-token"></a>

### `STUDIO_METRICS_TOKEN`

<!-- step: metrics-token -->
7. Créez un nouveau jeton (32 caractères ou plus), posez-le, redémarrez, et donnez-le à votre collecteur. Entre le
   redémarrage et la mise à jour du collecteur, `/metrics` répond 401 : attendez-vous à un trou dans les courbes.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- Clé de session : les membres continuent de travailler après l’étape 1 ; après l’étape 2, une session plus ancienne
  que le changement du trousseau aurait de toute façon pris fin.
- Clé du worker : une écriture qui demande une vérification passe de nouveau, et une prévisualisation se construit ;
  le worker ne consigne aucun `worker-job-refused`.
- Secret OIDC : une nouvelle connexion marche ; `/auth/me` répond.
- Clé Git : un push depuis le Studio réussit.
- Jeton des métriques : la cible du collecteur est de nouveau joignable.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `a session key is 32 characters or more` au démarrage | Une clé trop courte dans le trousseau | `openssl rand -base64 48` |
| Tout le monde déconnecté sous 5 min | L’ancienne clé de session retirée d’un coup (sans trousseau) | Attendu pour une clé qui a fuité ; sinon faites d’abord l’étape 1 |
| Écritures en 503 « the edit cannot be judged now: the processing worker refused the job (403…) » | Le worker et le studio ont des clés différentes | Finissez l’étape 4 sur les deux applications |
| 503 « the identity provider cannot be reached: the session is suspended » | Le secret OIDC changé chez le fournisseur, pas encore dans le Studio depuis plus de R | Posez le nouveau secret et redémarrez |
| `clever env set` lit la clé comme une option | Pas de `--` avant le nom | La forme des commandes |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Les variables des applications ; les fichiers de clés dans `~/secrets/my-game/` ; chez le fournisseur et l’hébergeur
Git, le secret du client et les clés de déploiement. Les sessions ne prennent fin que dans le cas d’une clé qui a fuité.

<a name="recovery"></a>

## Reprise ou retour arrière

Chaque étape se défait en reposant la valeur précédente et en redémarrant, tant que vous avez gardé son fichier. Une
clé de session retirée du trousseau ne peut pas être rendue aux sessions qu’elle scellait : elles ont pris fin.

<a name="references"></a>

## Références

- Le trousseau : [`studio-server/src/server/auth/store.ts`](../../studio-server/src/server/auth/store.ts) (`Sealer`) ;
  les vérifications : [`studio-server/src/server/auth/gate.ts`](../../studio-server/src/server/auth/gate.ts) ; les
  erreurs de rafraîchissement : [`studio-server/src/server/auth/oidc.ts`](../../studio-server/src/server/auth/oidc.ts) ;
  les clés des jobs : [`studio-server/src/worker/job.ts`](../../studio-server/src/worker/job.ts) ; la signature des
  builds : [`studio-server/src/server/builds.ts`](../../studio-server/src/server/builds.ts).
- [`STUDIO_SESSION_KEY`](reference.environment-variables.md#studio-session-key),
  [`STUDIO_WORKER_KEY`](reference.environment-variables.md#studio-worker-key),
  [`STUDIO_GIT_KEY`](reference.environment-variables.md#studio-git-key),
  [`STUDIO_METRICS_TOKEN`](reference.environment-variables.md#studio-metrics-token).
- Le test derrière la garantie : [`tests/studio-auth.test.ts`](../../tests/studio-auth.test.ts).
