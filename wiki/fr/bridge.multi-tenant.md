# Plusieurs tenants

Comment servir plusieurs jeux, ou un même jeu dans plusieurs environnements, depuis un seul déploiement du Bridge, et
comment faire tourner plusieurs instances sur un même stockage. Un **tenant** est le jeu d’un opérateur dans un
environnement : son propre dossier, sa propre racine Biscuit, sa clé d’événements, son jeton d’opérateur, ses quotas,
sa rotation et ses révocations. Ce qui les isole, et où cela s’arrête : [Garanties](bridge.guarantees.md#tenant-isolation).

<a name="what-you-get"></a>

## Ce que vous obtenez

Un `serve` (ou plusieurs identiques) qui tient plusieurs tenants sur un stockage SQL, chacun atteint par son propre
nom d’hôte, chacun signant des signaux `WorldSignalV2` qui nomment leur tenant, avec des jetons de connecteur liés à
leur tenant.

<a name="context-and-versions"></a>

## Contexte et versions

- Un Bridge, depuis la 4.1.10 (« Constellation », ADR 0009, ADR 0010) ; cette page s’applique à partir de la 4.2.5
  (les noms `quest-n-click-bridge`).
- Plusieurs tenants demandent un stockage SQL : SQLite pour une machine, Postgres pour plusieurs instances (le profil
  `distributed`, **expérimental**).
- **Vérifié sur : non rejoué pour cette page.** La même disposition (deux tenants, trois instances, un Postgres) est
  celle que `npm run ops:qualify` monte et vérifie ([Le déploiement de référence](bridge.install-run.md#reference-deployment)).

<a name="prerequisites"></a>

## Prérequis

- Comprendre d’abord un Bridge seul en marche : [Installer et lancer le Bridge](bridge.install-run.md).
- Un nom d’hôte par tenant (`bridge.a.example`, `bridge.b.example`) qui pointe vers le déploiement, ou un proxy qui
  pose `X-Web-Scumm-Tenant`.
- Pour plusieurs instances : Postgres, et `pg` installé à côté du Bridge.

<a name="where-to-run"></a>

## Où lancer les commandes

Sur la machine du déploiement (ou celle de chaque instance), avec un dossier par tenant, par exemple `/srv/bridge/a`
et `/srv/bridge/b`. `npm run bridge -- …` dans le dépôt du moteur, `npx quest-n-click-bridge …` avec le paquet
(passez alors `--manifest=` à `init`).

<a name="steps"></a>

## Étapes

<!-- step: init-tenants -->
1. Créez le dossier de chaque tenant, avec son identifiant, son environnement et ses noms d’hôte :

   ```sh
   # sur la machine du déploiement, dans le dépôt du moteur
   npm run bridge -- init --dir=/srv/bridge/a --tenant=a --environment=prod --hosts=bridge.a.example --no-demo-webhooks --origin=https://game-a.example
   npm run bridge -- init --dir=/srv/bridge/b --tenant=b --environment=staging --hosts=bridge.b.example --no-demo-webhooks --origin=https://game-b.example
   ```

   `--environment` vaut `prod`, `staging` ou `dev` (`prod` par défaut) ; il est nommé dans chaque signal et dans les
   clés que liste le tenant.

<!-- step: serve-tenants -->
2. Servez-les ensemble sur un stockage SQL :

   ```sh
   # sur la machine du déploiement, dans le dépôt du moteur
   BRIDGE_STORE=postgres://… npm run bridge -- serve --tenants=/srv/bridge/a,/srv/bridge/b [--tenant-header]
   ```

   Une requête est routée par son `Host` (les `hosts` de chaque tenant), ou par `X-Web-Scumm-Tenant` avec
   `--tenant-header`, avant toute lecture ; aucun tenant : une 404. Deux dossiers qui configurent le même tenant sont
   refusés au démarrage, tout comme un journal (plusieurs tenants partagent un stockage SQL : `--store=sqlite:<fichier>`,
   `BRIDGE_STORE=postgres://…` ou `BRIDGE_STORE_FILE`).

<!-- step: grant-tenants -->
3. Donnez leurs jetons aux connecteurs de chaque tenant depuis le dossier de ce tenant : `grant` ajoute le tenant au
   jeton, si bien qu’aucun autre tenant ne l’accepte.

   ```sh
   # sur la machine du déploiement, dans le dépôt du moteur
   npm run bridge -- grant --dir=/srv/bridge/a --connector=mail-a --source=mail --signals=mail.answer.correct --pair > mail-a.token
   ```

<!-- step: instances -->
4. Pour plus de capacité, lancez autant de `serve` identiques qu’il faut sur le même stockage, sans affinité de
   session, derrière un répartiteur de charge. Les instances sont sans état.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- `GET /healthz` sur n’importe quelle instance dit `"tenants": 2` et le type de stockage.
- `npm run bridge -- doctor --dir=/srv/bridge/a` (avec le même `BRIDGE_STORE`) liste chaque tenant du stockage, avec
  ses joueurs, ses signaux, ses trous et ses lignes en quarantaine.
- Une requête avec un `Host` inconnu reçoit 404 `{"error": "tenant"}`.

<a name="how-instances-share"></a>

## Comment les instances partagent un stockage

- Les séquences, la déduplication et les accusés de réception se décident dans une seule transaction de la base ; la
  livraison est au moins une fois et appliquée une fois (D20).
- Un signal accepté par une instance atteint un flux tenu par une autre, qui lit le stockage quand on la réveille :
  `NOTIFY` de Postgres, une lecture toutes les 250 ms sur SQLite, et un passage toutes les 5 s au cas où un réveil se
  perdrait.
- Chaque ligne du stockage porte son tenant et chaque requête SQL filtre dessus. Un tenant d’un déploiement partagé
  signe des `WorldSignalV2` (le signal nomme son tenant, son environnement, son origine, son lien et sa clé), si bien
  que ni un jeton ni un signal d’un tenant n’est accepté par un autre, même quand deux d’entre eux ont reçu (à tort)
  la même clé.
- Chaque instance borne ses flux ouverts (`streamsPerInstance`, 10 000 ; au-delà, 429) et sa minute par connecteur :
  avec N instances, un connecteur peut proposer N fois son quota.
- Une ligne gardée qui ne se vérifie plus est mise en quarantaine, jamais livrée, et `doctor` la liste.

> [!LIMIT id=bridge-tenants-demo-webhooks]
> Un serveur garde une seule table des webhooks de démonstration, par source, pour tous ses tenants : deux tenants
> avec un webhook de la même source entrent en collision. Donnez aux tenants d’un serveur partagé
> `--no-demo-webhooks` et un `grant` par connecteur.

> [!LIMIT id=bridge-tenants-shared-process]
> Les tenants d’un serveur partagent son processus, sa liste CORS (les `--origin` de tous les tenants ensemble) et sa
> base. L’isolation est le code du Bridge ; il n’y a pas de sécurité par ligne et par tenant dans Postgres, et une
> instance compromise détient les clés de tous les tenants.

<a name="common-errors"></a>

## Erreurs fréquentes

| Message | Cause | Correction |
|---|---|---|
| `✖  two directories configure the same tenant (a, a)` | Deux dossiers avec le même `--tenant` | Un dossier par tenant |
| `✖  several tenants share a SQL store: --store=sqlite:<file>, BRIDGE_STORE=postgres://… or BRIDGE_STORE_FILE` | La configuration du premier tenant nomme le journal | Nommer un stockage SQL |
| 404 `{"error":"tenant","message":"no tenant here"}` | Le `Host` n’est dans les `hosts` d’aucun tenant, et pas d’en-tête autorisé | Ajouter l’hôte aux `hosts` du tenant dans `config.json`, ou `--tenant-header` derrière un proxy qui le pose |
| 403 sur `POST /v1/signals` | Le jeton du connecteur appartient à un autre tenant | `grant` depuis le dossier du bon tenant |
| `BRIDGE_STORE_FILE: … does not exist` / `… is empty` | Le fichier secret manque ou est vide | Le monter ; un fichier vide est refusé plutôt que de retomber sur un journal |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Un dossier par tenant (`config.json`, `root.key`, `admin-token`) ; le stockage partagé, où chaque ligne porte son
tenant.

<a name="recovery"></a>

## Reprise ou retour en arrière

- Sortir les lignes d’un tenant d’un stockage partagé : `tenant export --tenant=<id> --out=<fichier>` ; les supprimer :
  `tenant delete --tenant=<id> --yes` ([Sauvegarde et restauration](bridge.backup-restore.md#tenant-export)).
- La clé ou la racine d’un tenant compromise, ou une instance : [Sécurité](bridge.security.md#procedures). La rotation
  d’un tenant ne touche pas les autres.

<a name="references"></a>

## Références

- Le routage : [`bridge/src/server.ts`](../../bridge/src/server.ts) ; la configuration d’un tenant :
  [`bridge/src/config.ts`](../../bridge/src/config.ts) ; les stockages :
  [`bridge/src/store-async.ts`](../../bridge/src/store-async.ts).
- [ADR 0009](../../docs/dev/adr/0009-reality-store.md), [ADR 0010](../../docs/dev/adr/0010-signal-v2.md), le modèle de
  menace [`docs/dev/threat-models/constellation.md`](../../docs/dev/threat-models/constellation.md).
- Testé par [`tests/bridge-tenancy.test.ts`](../../tests/bridge-tenancy.test.ts) et
  [`tests/bridge-fanout.test.ts`](../../tests/bridge-fanout.test.ts).
