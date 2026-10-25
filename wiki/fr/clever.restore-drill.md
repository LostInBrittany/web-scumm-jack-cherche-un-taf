# Exercice de restauration sur une installation vierge

Cet exercice restaure la dernière sauvegarde d’un Studio hébergé dans une base PostgreSQL neuve et vide, rejoue ce qui
a été écrit depuis, puis compare le résultat à la production. La production n’est jamais touchée. Faites-le avant d’en
avoir besoin : le jour où la base est vraiment perdue, vous connaîtrez déjà les commandes et leur durée.

<a name="what-you-get"></a>

## Ce que vous obtenez

Une seconde base, créée pour l’exercice, qui contient le jeu à la même révision que la production : les lignes de la
sauvegarde, puis chaque opération écrite après elle, relue dans le journal que le serveur expédie vers le bucket. Vous
obtenez aussi une durée, à noter dans vos propres relevés, et la preuve que vos sauvegardes se restaurent.

<a name="context-and-versions"></a>

## Contexte et versions

- Un Studio hébergé (le Studio Server) sur Clever Cloud : une application `studio`, son add-on PostgreSQL, son bucket
  Cellar.
- À partir de la 4.2.2, version qui apporte `restore --replay`. La sauvegarde quotidienne vers le bucket
  (`backup --to-bucket`) existe depuis la 4.2.3 ; avant, prenez la sauvegarde à la main.
- **Vérifié sur : non vérifié sur une installation réelle pour cette page.** La procédure est celle que le déploiement
  de référence de la 4.2.3 a suivie le 19 octobre 2026 (la mesure plus bas), mais personne n’a encore rejoué le texte
  de cette page sur une installation Clever Cloud réelle. Lisez chaque commande avant de la lancer.

<a name="prerequisites"></a>

## Prérequis

- Un Studio hébergé en marche, avec au moins une sauvegarde dans son bucket (`backups/<date>-r<révision>.json`). La
  sauvegarde quotidienne en écrit une quand l’application studio a `STUDIO_BACKUP_CRON=1`
  ([`STUDIO_BACKUP_CRON`](reference.environment-variables.md#studio-backup-cron)).
- `clever-tools`, connecté à l’organisation qui porte les applications.
- Sur votre machine : le moteur dans la **même version** que l’application studio, `npm ci` fait. Une sauvegarde ne se
  restaure que dans le schéma de base de la version qui l’a faite.
- Un outil S3 (la console Cellar, `s3cmd`, `aws s3`) et les identifiants Cellar du bucket, pour télécharger la
  sauvegarde.
- `psql`, pour comparer les deux bases. Sans accès à la base de production, un compte de membre du Studio suffit
  (l’étape 5 dit comment).

<a name="where-to-run"></a>

## Où lancer les commandes

- `clever …` : sur votre machine, dans le dossier où l’application studio est liée (`clever link`).
- `npm run studio-server -- …` : sur votre machine, dans le dépôt du moteur, à la version de l’application studio.
- Jamais sur l’instance de production, et jamais avec l’URI de la base de production dans votre shell.

<a name="steps"></a>

## Étapes

<!-- step: note-head -->
1. Notez la tête de la production et vérifiez que rien n’attend d’être expédié. En membre, `GET /api/revision` donne
   la révision ; `GET /readyz` donne `rpoMs`, qui doit valoir `0`. Avec les métriques, `studio_journal_revision` et
   `studio_journal_rpo_seconds` disent la même chose.

<!-- step: create-addon -->
2. Créez un add-on PostgreSQL vide pour l’exercice, lié à aucune application, et lisez son URI :

   ```sh
   # sur votre machine, là où l'application studio est liée
   clever addon create postgresql-addon my-game-pg-drill --plan dev
   clever addon env <drill-addon-id>
   ```

<!-- step: fetch-backup -->
3. Téléchargez sur votre machine le dernier objet `backups/` du bucket (n’importe quel outil S3, avec les identifiants
   Cellar), par exemple sous le nom `backups-latest.json`. Écrivez la configuration de l’application studio (son
   `STUDIO_CONFIG_JSON`) dans un fichier, en changeant `workDir` pour un dossier de votre machine. Le chargeur la
   vérifie comme le ferait le serveur :

   ```studio-config
   {
     "publicUrl": "https://studio.example.fr",
     "playUrl": "https://play.example.fr",
     "game": "my-game",
     "workDir": "/tmp/my-game-drill",
     "host": "0.0.0.0",
     "trustProxy": ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
     "store": { "kind": "postgres" },
     "blobs": { "kind": "s3", "host": "cellar-c2.services.clever-cloud.com", "bucket": "my-game-studio" },
     "oidc": { "issuer": "https://keycloak.example.fr/realms/web-scumm", "clientId": "studio", "audience": "studio-api", "cliClientId": "web-scumm-cli" },
     "worker": { "url": "https://worker.example.fr", "instance": "my-game-studio" }
   }
   ```

<!-- step: restore -->
4. Faites pointer le serveur vers la base **de l’exercice** et vers le bucket, puis restaurez en chronométrant :

   ```sh
   # sur votre machine, dans le dépôt du moteur, même version que l'application studio
   export STUDIO_DATABASE_URL='<the drill add-on URI from step 2>'
   export STUDIO_S3_KEY_ID='<Cellar key id>' STUDIO_S3_KEY_SECRET='<Cellar secret>'
   time npm run -s studio-server -- restore backups-latest.json --replay --config drill.config.json
   ```

   La commande vérifie l’empreinte de la sauvegarde, ses tables et ses colonnes, et la présence dans le bucket de
   chaque blob que nomment la sauvegarde et le journal ; elle écrit les lignes, puis rejoue les opérations expédiées
   depuis la sauvegarde. Sa dernière ligne donne les lignes écrites, les lignes `dropped`, la révision de la
   sauvegarde, la révision atteinte, et `stopped` si le rejeu s’est arrêté avant la fin.

> [!GUARANTEE id=restore-empty-db-only]
> Une restauration dans une base qui contient déjà un projet est refusée avec « the project is not empty ». Le test le
> prouve sur SQLite ; le serveur exécute le même code sur PostgreSQL.

La vérification a lieu dans la transaction de la restauration, avant l’écriture de la première ligne
([`studio-server/src/ops/backup.ts`](../../studio-server/src/ops/backup.ts)) : viser la production par erreur à
l’étape 4 est refusé, et la laisse telle qu’elle était. N’ayez quand même jamais l’URI de la production dans ce shell.

> [!LIMIT id=same-engine-version]
> Lancez la restauration avec la même version du moteur que la sauvegarde, celle de la production quand la sauvegarde
> est récente. `restore` migre d’abord la base cible vers le moteur qui tourne, puis compare le schéma de la sauvegarde
> au sien. Avec un moteur plus récent que la production, la base de l’exercice est migrée au-delà de la sauvegarde et la
> restauration est refusée (« the backup is of schema … ») : supprimez cet add-on et recommencez avec la bonne version.

<!-- step: compare -->
5. Comparez, en lecture seule, sur les deux bases (`psql <URI>`) : `SELECT value FROM studio_meta WHERE key =
   'revision'` donne la tête notée à l’étape 1 (ou une plus récente si des membres ont écrit entre-temps), et `SELECT
   path, blob FROM studio_files ORDER BY path` donne les mêmes lignes. Sans accès à la base de production, comparez en
   membre : `GET /api/ops?after=0` (page par page, avec `next`) face au `SELECT rev, op_id FROM studio_ops WHERE state
   = 'confirmed' ORDER BY rev` de l’exercice.

<!-- step: clean-up -->
6. Notez la durée et les révisions dans vos relevés, puis supprimez l’add-on de l’exercice :

   ```sh
   # sur votre machine, là où l'application studio est liée
   clever addon delete my-game-pg-drill
   ```

> [!MEASURE id=restore-time]
> Mesuré deux fois sur le déploiement de référence, un échantillon chacun : 28,7 s dans sa phase A (une sauvegarde à
> la révision 1, 508 lignes, rien à rejouer, moteur au commit 52e68932) et 59,7 s dans sa phase B (une sauvegarde à la
> révision 63, 593 lignes, 2 opérations rejouées, moteur au commit c66fbf56). Le rapport ne dit pas d’où vient l’écart.
> Retenez entre une demi-minute et une minute sur un petit jeu : une observation, pas une promesse pour le vôtre.
> - date: 2026-10-19
> - version: 4.2.2
> - volume: 508 lignes (sauvegarde à la révision 1) ; puis 593 lignes et 2 opérations rejouées (sauvegarde à la révision 63, tête à 65)
> - conditions: organisation Clever Cloud de test, région par ; add-on PostgreSQL plan DEV, Cellar plan S ; restauration lancée depuis une machine à Paris, démarrage de `tsx` compris ; moteur au commit 52e68932, puis c66fbf56 sur main avant le tag 4.2.3 (package.json indiquait 4.2.2) ; un seul échantillon chacun
> - source: [QUALIF-4.2.3-REFERENCE.md §4](https://github.com/Quest-n-Click/quest-n-click/blob/edb8d39a03a3ad6ba9aa8f33e1ab5473d3d7a34e/docs/dev/QUALIF-4.2.3-REFERENCE.md)

> [!LIMIT id=rpo]
> Ce qu’une restauration peut perdre, ce sont les opérations confirmées mais pas encore expédiées vers le bucket au
> moment où la base a été perdue : c’est le RPO. `/readyz` en donne la valeur courante, `rpoMs` ; l’objectif est d’une
> minute, surveillé, jamais promis. Dans la mesure ci-dessus il valait 0 : les deux écritures faites après la
> sauvegarde ont été rejouées, et `rpoMs` est revenu à 0 moins de 2 s après chacune. Si le bucket est perdu aussi, les
> sauvegardes et le journal partent avec lui. Une copie ailleurs doit contenir ensemble les `backups/`, `sha256/` et
> `journal/` du bucket : une sauvegarde nomme ses blobs par leur empreinte sans les contenir, donc `backups/` seul ne
> restaure rien ([Sauvegardes](clever.backups.md#steps)).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`npm run -s studio-server -- restore …` sort avec le code 0 et affiche une ligne JSON (`-s` écarte les lignes de npm),
par exemple
`{"event":"restored","rows":593,"dropped":0,"backup":63,"revision":65}`, sans `stopped`. La révision atteinte est la
tête notée à l’étape 1, ou une plus récente. L’étape 5 montre les mêmes fichiers à la même révision dans les deux bases.

<a name="common-errors"></a>

## Erreurs courantes

| Symptôme | Cause | Correction |
|---|---|---|
| `restore: the project is not empty (<table> holds rows): restore into a new one` | `STUDIO_DATABASE_URL` vise une base qui contient déjà un projet (la production, ou un exercice déjà fait) | La faire pointer vers un add-on neuf et vide |
| `restore: the backup is of schema 12, this server's is 13` | Le moteur de votre machine n’est pas la version qui a fait la sauvegarde | Passer à la version de l’application studio, `npm ci`, relancer |
| `restore: 3 blob(s) the backup names are missing (first: …)` | Un autre bucket, ou une collecte les a supprimés | Vérifier `blobs.bucket` et les identifiants Cellar |
| `restore restores a hosted project: store.kind is postgres` | La configuration est une configuration locale | Prendre celle de l’application studio (étape 3) |
| `"stopped":"gap"` (ou `not-the-head`, `blob-missing`) dans la dernière ligne | Le journal du bucket a un trou après la sauvegarde | La base contient la sauvegarde et ce qui a été rejoué ; notez-le, et tenez-en compte pour la sauvegarde suivante |
| `STUDIO_DATABASE_URL (or POSTGRESQL_ADDON_URI) is required` | Aucune URI de base dans le shell | Exporter l’URI de l’add-on de l’exercice (étape 4) |

<a name="files-changed"></a>

## Fichiers ou données modifiés

- L’add-on PostgreSQL de l’exercice : toutes ses tables, écrites par la restauration.
- Le dossier `workDir` de votre configuration, sur votre machine.
- Rien en production : ni sa base, ni son bucket (une restauration lit le bucket, elle n’y écrit jamais). Une nouvelle
  instance démarrée sur la base restaurée expédierait ses opérations suivantes sur une nouvelle ligne de journal,
  jamais par-dessus l’ancienne.

<a name="recovery"></a>

## Reprise ou retour arrière

- Les lignes sont écrites en une seule transaction. Si la restauration échoue à ce moment (une connexion perdue, un blob
  manquant, un autre schéma), rien de la sauvegarde n’est écrit : la base de l’exercice reste vide mais migrée, puisque
  `restore` la migre d’abord. Relancez `restore` dessus ; `replay` répondrait seulement « no restore is under way ».
- Si le rejeu échoue après l’écriture des lignes, la base est marquée « restauration en cours » et le serveur refuse
  d’y démarrer. Reprenez avec `npm run -s studio-server -- replay --config drill.config.json`, ou supprimez l’add-on et
  recommencez.
- Ne lancez jamais `gc --delete` sur la base de l’exercice : elle supprimerait des blobs que la production nomme encore.
- Une restauration déconnecte tout le monde : les sessions et les baux ne sont pas dans une sauvegarde. Cela compte
  pour une vraie restauration, pas pour un exercice.

> [!LIMIT id=no-going-back-after-migrations]
> Une sauvegarde ne se restaure que dans le schéma de base de la version qui l’a faite ; un autre schéma est refusé. Le
> Studio Server fait monter sa base de version au démarrage et n’a aucune commande pour la faire redescendre. Une fois
> qu’une mise à jour a migré la production, une version plus ancienne ne peut plus ouvrir cette base : revenir en
> arrière, c’est restaurer une sauvegarde prise avant la mise à jour, avec l’ancienne version, dans un add-on neuf. Ce
> qui a été écrit depuis cette sauvegarde est perdu, sauf si le rejeu peut encore l’appliquer.

<a name="references"></a>

## Références

- [`STUDIO_DATABASE_URL`](reference.environment-variables.md#studio-database-url),
  [`STUDIO_S3_KEY_ID`](reference.environment-variables.md#studio-s3-key-id) et les autres variables du Studio Server :
  [Variables d’environnement](reference.environment-variables.md#studio-server).
- La sauvegarde et la restauration : [`studio-server/src/ops/backup.ts`](../../studio-server/src/ops/backup.ts) ; le
  rejeu : [`studio-server/src/ops/ship.ts`](../../studio-server/src/ops/ship.ts) ; les commandes :
  [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts).
- Le test derrière la garantie : [`tests/studio-backup.test.ts`](../../tests/studio-backup.test.ts).
- La conception : [ADR 0025](../../docs/dev/adr/0025-studio-server.md).
