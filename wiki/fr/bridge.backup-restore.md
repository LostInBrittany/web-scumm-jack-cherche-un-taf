# Sauvegarde et restauration

Comment sauvegarder le stockage d’un Reality Bridge dans un seul fichier, le restaurer tout ou rien, et remettre un
Bridge en route après la perte d’une instance ou de sa base. Il s’agit de la sauvegarde **du Bridge**
(`npm run bridge -- backup`), pas de celle du Studio hébergé (`studio-server backup`,
[Sauvegardes sur Clever Cloud](clever.backups.md)).

<a name="what-you-get"></a>

## Ce que vous obtenez

Un fichier de sauvegarde du stockage entier, pris en un seul instantané, avec une empreinte qui détecte un fichier
modifié ou tronqué par accident ; et, le jour où il le faut, un stockage restauré depuis ce fichier en une seule
transaction, vérifié avant et après sa validation, dans un mode que vous nommez.

<a name="context-and-versions"></a>

## Contexte et versions

- Un Bridge sur un **stockage SQL** (SQLite ou Postgres). Le journal JSON-lines peut être sauvegardé, mais pas
  restauré : migrez-le d’abord vers SQLite ([Stockages](bridge.install-run.md#stores)).
- À partir de la 4.1.20 : le schéma 4 des sauvegardes (ADR 0023), les deux modes de restauration et les baux de
  maintenance. Le schéma 3 est venu avec la 4.1.19 (ADR 0021). Une restauration lit les schémas 1 à 4. Cette page
  s’applique à partir de la 4.2.5 (les noms `quest-n-click-bridge`).
- **Vérifié sur :** `backup`, `restore --mode=merge` (refusé, puis avec `--force`) et `restore --mode=replace-store`
  ont été lancés le 23 octobre 2026 sur un stockage SQLite du jeu `signals` (un tenant, un signal), macOS, Node 22.14,
  moteur 4.4.0. Un gros stockage ou un stockage Postgres n’ont pas été rejoués pour cette page ; les répétitions en CI
  sont nommées dans les Références.

<a name="prerequisites"></a>

## Prérequis

- Le dossier du Bridge (`--dir`, avec `config.json`) et l’accès à son stockage (le fichier SQLite, ou l’URL Postgres
  dans `BRIDGE_STORE` ou `BRIDGE_STORE_FILE`).
- De la mémoire pour la taille du fichier, environ 10 Mo par Mio sauvegardé et 20 Mo par Mio restauré (la mesure
  plus bas).
- Pour une restauration : toutes les instances du Bridge sur ce stockage **arrêtées**, et toute instance antérieure à
  la 4.1.20 arrêtée avant la première restauration (elles ne prennent pas de bail de maintenance).

<a name="where-to-run"></a>

## Où lancer les commandes

Sur une machine qui atteint le stockage, avec le dossier du Bridge : la machine du Bridge, ou une machine avec plus de
mémoire (une restauration n’a besoin que d’atteindre le stockage). `npm run bridge -- …` dans le dépôt du moteur ;
`npx quest-n-click-bridge …` avec le paquet autonome.

<a name="steps"></a>

## Étapes

<!-- step: backup -->
1. Sauvegardez le stockage :

   ```sh
   # sur la machine du Bridge, dans le dépôt du moteur
   npm run bridge -- backup --out=bridge-2026-10-23.json
   ```

   Elle affiche `✔  1 tenant(s), 1 signal(s), 0 run(s), 0 daily record(s) backed up to …/bridge-2026-10-23.json (schema
   4, one snapshot, sha256 1edef3c0f48b…)`. Le stockage entier est lu dans une seule transaction en lecture seule :
   tenants, runs, enregistrements du jour et quota des speedruns. Le fichier est en mode 600, écrit dans un fichier
   temporaire puis renommé. Il contient les empreintes des capacités, jamais une capacité ni une clé.

   Son enveloppe donne le backend, les versions du Bridge et du schéma SQL, ce qu’elle contient (`completeness` :
   `whole-store` pour un stockage SQL, `tenants-only` pour le journal ou la mémoire), le début et la fin, les comptes
   par famille, et un SHA-256 de l’ensemble (`scope: envelope`).

> [!LIMIT id=bridge-backup-digest-not-signature]
> L’empreinte est un contrôle d’intégrité contre un fichier modifié ou tronqué par accident, pas une signature :
> quiconque peut modifier le fichier peut la recalculer. Gardez les sauvegardes là où vous seul pouvez écrire.

> [!LIMIT id=bridge-backup-bounds]
> Un stockage au-delà de `--max-rows` (2 000 000) ou un fichier au-delà de `--max-bytes` (256 Mio) est refusé et
> aucun fichier n’est écrit. Au-delà de quelques centaines de Mio, utilisez les outils de la base elle-même
> (`pg_dump`, les instantanés du fournisseur, une copie du fichier SQLite Bridge arrêté).

<!-- step: stop -->
2. Pour restaurer, arrêtez d’abord chaque `serve` sur ce stockage. Depuis la 4.1.20, le stockage refuse une
   restauration tant que quelque chose tient un bail vivant, en nommant qui le tient et jusqu’à quand ; une
   restauration ne tourne jamais à côté d’écrivains vivants.

<!-- step: restore-merge -->
3. Restaurez avec `--mode=merge` : dans un stockage vide, ou avec `--force` par-dessus les tenants que contient le
   fichier.

   ```sh
   # sur une machine qui atteint le stockage, dans le dépôt du moteur
   npm run bridge -- restore --from=bridge-2026-10-23.json --mode=merge          # dans un stockage vide, sinon refusé
   npm run bridge -- restore --from=bridge-2026-10-23.json --mode=merge --force  # les tenants du fichier remplacés, les autres gardés
   ```

   Un conflit (un tenant, un run ou un quota de ses tenants, une clé du jour) la refuse sans `--force` : `✖  the store
   already holds tenant(s) default: restore into an empty store, or --force; nothing restored`. Avec `--force`, les
   familles du fichier remplacent ce avec quoi elles entrent en conflit, et **ce dont le fichier ne parle pas reste**
   (un autre tenant, une autre clé du jour). Tout schéma, de 1 à 4.

<!-- step: restore-replace -->
4. Ou restaurez avec `--mode=replace-store` : **le stockage devient le fichier**.

   ```sh
   # sur une machine qui atteint le stockage, dans le dépôt du moteur
   npm run bridge -- restore --from=bridge-2026-10-23.json --mode=replace-store --yes-replace-store --safety-out=before-restore.json
   ```

   Toutes les tables sauf celles de contrôle (`schema_migrations`) sont vidées dans la même transaction, puis le
   fichier est écrit et relu, rien de plus n’est gardé. Ce mode n’accepte qu’une sauvegarde de schéma 4 d’un stockage
   SQL entier, au schéma SQL de ce stockage. D’abord, une sauvegarde du stockage remplacé est écrite dans
   `--safety-out`, un chemin qui ne doit pas exister (pas de lien non plus), relue et vérifiée ; si cela échoue, rien
   n’est supprimé. Son chemin est rappelé dans chaque issue.

> [!LIMIT id=bridge-replace-store-two-transactions]
> La sauvegarde de sécurité et le remplacement sont deux transactions : arrêtez tout écrivain entre les deux (le bail
> de maintenance les refuse à partir de la 4.1.20). Le fichier de sécurité est écrit par un lien physique, qui ne
> remplace jamais un nom : donnez-lui un chemin sur un système de fichiers qui les accepte (ni FAT ni exFAT).

<!-- step: doctor -->
5. Vérifiez le stockage, puis relancez le Bridge :

   ```sh
   # dans le dépôt du moteur
   npm run bridge -- doctor
   ```

> [!GUARANTEE id=bridge-restore-names-its-mode]
> Sans `--mode`, ou avec `--force` seul, `restore` s’arrête avec le code de sortie 2, et l’usage nomme les deux modes.

> [!GUARANTEE id=bridge-restore-refused-while-serving]
> Tant qu’un Bridge sert le stockage, une restauration est refusée et dit que rien n’a été restauré. Une fois le Bridge
> arrêté, elle restaure.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`restore` se termine avec le code 0 et une ligne : `✔  1 tenant(s), 0 run(s), 0 daily record(s), 0 quota row(s)
restored from <date> (schema 4, merge), checked before and after the commit` (avec `replace-store`, suivie de `(the
store before: <fichier de sécurité>)`). Le fichier a été lu de façon bornée et vérifié en entier avant l’ouverture du
stockage (schémas 1 à 4 ; chaque ligne, les doublons, les relations, les comptes et l’empreinte de la charge du schéma
3, l’empreinte de l’enveloppe du schéma 4, les dates, la version et la complétude), écrit dans une transaction, relu
et comparé avant la validation, puis audité après. `doctor` liste ensuite les joueurs et les signaux de chaque tenant,
sans trou.

<a name="common-errors"></a>

## Erreurs fréquentes

| Message ou code de sortie | Cause | Correction |
|---|---|---|
| code 2, `say the mode: --mode=merge … --mode=replace-store …; nothing restored` | Pas de `--mode` | Nommer le mode |
| `the store already holds tenant(s) …: restore into an empty store, or --force; nothing restored` | Un conflit en `merge` | Un nouveau stockage, ou `--force` |
| `replace-store needs a schema 4 backup of a whole SQL store (…)` | Un fichier plus ancien, ou venu du journal (`tenants-only`) | `--mode=merge`, ou une nouvelle sauvegarde |
| `the backup comes from a store at schema N, newer than this one (M): upgrade the Bridge` | Le moteur est plus ancien que la sauvegarde | Mettre le Bridge à jour |
| `the JSON-lines journal cannot be restored all or nothing: migrate it to SQLite first …` | Le stockage est le journal | `migrate --from=jsonl --to=sqlite`, puis restaurer avec `--store=sqlite` |
| `the backup would be N bytes, more than M (--max-bytes=): no file written` | Un stockage trop gros pour un fichier | Les outils de la base elle-même |
| Un refus qui nomme le détenteur du bail, `; nothing restored` | Un Bridge sert encore le stockage | L’arrêter |
| code 3, `P0: the restore committed but …` | Une différence trouvée après la validation | Arrêter toutes les instances, garder ce stockage pour examen ; un écrivain pendant la restauration peut l’expliquer |
| code 3, `the commit's answer was lost …` | La connexion est tombée à la validation | `doctor`, et une sauvegarde, pour voir de quel côté c’est tombé |

<a name="files-changed"></a>

## Fichiers ou données modifiés

- `backup` : le fichier `--out` seulement (mode 600). Elle lit le stockage.
- `restore --mode=merge` : les tenants, runs, enregistrements du jour et quotas que contient le fichier (avec
  `--force`, ceux avec lesquels il entre en conflit sont remplacés). Le reste du stockage reste.
- `restore --mode=replace-store` : toutes les tables sauf `schema_migrations` ; et le fichier `--safety-out`, écrit en
  premier.

<a name="recovery"></a>

## Reprise ou retour en arrière

- Une restauration ratée dit « nothing restored » et laisse le stockage tel qu’il était (une seule transaction).
- Après un `replace-store`, le chemin du retour est son fichier de sécurité : `restore --from=<fichier de sécurité>
  --mode=replace-store …` avec un nouveau `--safety-out`.
- **Une instance tuée ou plantée :** en lancer une autre ; rien n’est perdu (une transaction est validée ou absente ;
  `tests/bridge-fanout.test.ts` en tue une sur trois pendant 1 000 propositions).
- **La base perdue :** restaurer la dernière sauvegarde dans une nouvelle, puis `doctor`. Les connecteurs renvoient ce
  qu’ils ont envoyé depuis (leur `dedupeKey` rend l’envoi idempotent), et les joueurs gardent leurs curseurs.
- **Un journal qui ne démarre pas :** `doctor` nomme la ligne.
- Une clé ou une racine Biscuit compromise, ou l’hôte d’une instance : [Sécurité](bridge.security.md#procedures).

<a name="health"></a>

## Santé et mesures

- `GET /livez` : le processus répond. `GET /readyz` : le stockage répond (503 sinon). `GET /healthz` : les deux, avec
  les tenants, le type de stockage et les flux ouverts. Sans jeton, sans donnée d’un tenant.
- Mesures : acceptations, doublons, refus par code, accusés de réception, nouvelles tentatives du stockage,
  quarantaine, flux refusés, l’arriéré et la latence d’une proposition. Toujours gardées dans le processus ; par l’API
  de métriques d’OpenTelemetry quand `@opentelemetry/api` est installé à côté du Bridge, exportées en OTLP quand
  [`OTEL_EXPORTER_OTLP_ENDPOINT`](reference.environment-variables.md#otel-exporter-otlp-endpoint) est défini et
  `@opentelemetry/sdk-node` installé. Attributs : le tenant et un code, jamais un joueur ni une charge.
- Une ligne gardée qui ne se vérifie plus est mise en quarantaine, jamais livrée, et `doctor` la liste.

<a name="memory"></a>

## Mémoire : dimensionner la machine à la sauvegarde

`backup`, `tenant export` et `restore` tiennent le fichier entier en mémoire, lu et canonique ; une restauration le
tient deux fois (le fichier, puis le stockage relu pour comparer).

> [!MEASURE id=bridge-backup-memory]
> Pic de mémoire (RSS) du Bridge de l’archive, pour environ 72 Mo au repos : une sauvegarde de 64 Mio a pris 0,6 Go à
> l’export, 1,4 Go à la restauration sur SQLite et 1,3 Go sur Postgres ; 128 Mio, 1,1 à 1,3 Go, 2,7 Go et 2,4 Go ;
> 256 Mio, 2,1 à 2,2 Go, 3,1 Go et 3,7 Go. À lire comme environ 10 Mo de mémoire par Mio de fichier pour une
> sauvegarde, 20 Mo pour une restauration : une observation, pas une promesse pour votre machine.
> - date: 2026-10-13
> - version: 4.1.20
> - volume: sauvegardes de 64, 128 et 256 Mio, sur SQLite et sur Postgres
> - conditions: le job `backup-memory` du candidat (`tools/backup-memory.ts`), un runner Linux de GitHub, le Bridge de l’archive du candidat ; une mesure par taille et par stockage
> - source: [REALITY-OPS.md, "Health, measures, backups"](https://github.com/Quest-n-Click/quest-n-click/blob/b55bd9bbf42145d44e1eaa5c1041fff74a2e905e/docs/en/REALITY-OPS.md)

Dans un conteneur de 512 Mio, une restauration tient jusqu’à environ 20 Mio de sauvegarde. Lancez une plus grosse
depuis une machine qui a la mémoire, ou abaissez `--max-bytes` et `--max-rows` à ce que la machine tient, pour qu’un
fichier trop gros soit refusé avant d’être lu.

<a name="leases"></a>

## Les baux de maintenance (4.1.20)

À partir du schéma 5 (migration 0005), chaque écrivain tient un bail dans le stockage lui-même (ADR 0023) :

- `serve` et chaque commande qui écrit (`migrate`, `tenant delete`, `backup` et `tenant export`, qui montent le
  schéma) tiennent un bail `serving`, côte à côte.
- `restore`, et `migrate --schema=N` vers le bas, prennent le bail `exclusive`. Ils sont **refusés**, en nommant qui
  tient le stockage et jusqu’à quand, tant que quoi que ce soit d’autre tient un bail vivant : aussitôt sur SQLite ;
  sur Postgres après le `--lock-timeout` du verrou consultatif au plus (30 s par défaut, jamais attendu plus
  longtemps).
- Un bail expiré (un processus tué) est supprimé, jamais gênant. Toutes les heures sont celles de la base.
- Un `serve` qui perd son bail (non renouvelé, ou la connexion de son verrou tombée) retient ses écritures, qui
  répondent 503, et échoue à `/readyz` jusqu’à ce qu’il reprenne un bail ; de même pour un processus qui se fige au-delà
  des deux tiers de son bail, sur sa propre horloge. Une restauration qui perd son bail avant la validation est
  annulée.

> [!LIMIT id=bridge-leases-older-bridges]
> Un Bridge antérieur à la 4.1.20 ne prend pas de bail : arrêtez toute instance plus ancienne avant la première
> restauration. `migrate --schema=N` en dessous de 5 supprime la table des baux dès sa première étape : arrêtez tout
> écrivain pour cela.

<a name="tenant-export"></a>

## Les lignes d’un seul tenant

`tenant export --tenant=<id> [--out=<fichier>]` écrit les lignes d’un tenant, dans chaque table (sur la sortie
standard sans `--out`) ; `tenant delete --tenant=<id> --yes` les supprime. Sans `--yes`, rien n’est supprimé. La
sauvegarde est logique, portable et bornée ; pour un gros déploiement, `pg_dump` ou les instantanés du fournisseur
restent la sauvegarde de la base elle-même.

<a name="references"></a>

## Références

- Le code : [`bridge/src/backup/`](../../bridge/src/backup/index.ts), [`bridge/src/cli-store.ts`](../../bridge/src/cli-store.ts),
  [`bridge/src/maintenance.ts`](../../bridge/src/maintenance.ts).
- La conception : [ADR 0021](../../docs/dev/adr/0021-backup-snapshot-and-atomic-restore.md) (un instantané, tout ou
  rien), [ADR 0023](../../docs/dev/adr/0023-backup-completeness-and-restore-modes.md) (la complétude, les modes, les
  baux).
- Répété par [`tests/bridge-backup.test.ts`](../../tests/bridge-backup.test.ts),
  [`tests/bridge-backup-v4.test.ts`](../../tests/bridge-backup-v4.test.ts),
  [`tests/bridge-maintenance.test.ts`](../../tests/bridge-maintenance.test.ts) et
  [`tests/bridge-ops.test.ts`](../../tests/bridge-ops.test.ts) ; la topologie entière détruite et restaurée par
  `npm run ops:qualify` ([Le déploiement de référence](bridge.install-run.md#reference-deployment)).
- [La ligne de commande du Bridge](bridge.cli.md#backup) · [Dépannage](bridge.troubleshooting.md).
