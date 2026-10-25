# Sauvegardes

Un Studio hébergé protège son jeu deux fois : le journal de chaque modification confirmée est expédié vers le bucket à
mesure qu’il s’écrit, et une sauvegarde quotidienne des tables du projet est écrite dans le même bucket. Cette page met
en place la sauvegarde quotidienne, dit ce qu’une sauvegarde contient et ne contient pas, et combien de temps les
sauvegardes sont gardées.

<a name="what-you-get"></a>

## Ce que vous obtenez

Une sauvegarde `backups/<date>-r<révision>.json` dans le bucket de l’instance chaque jour à 03:17 UTC, les 14 plus
récentes gardées (ou `STUDIO_BACKUP_KEEP`), sa ligne `"event":"backup"` dans les journaux de l’application studio, et
la façon d’en faire une à la main avant une montée de version. Avec le journal expédié depuis, une sauvegarde
restaure le jeu jusqu’à sa dernière révision expédiée ([exercice de restauration](clever.restore-drill.md)).

<a name="context-and-versions"></a>

## Contexte et versions

- Un Studio hébergé sur Clever Cloud. `backup <fichier>` et `restore` existent depuis la 4.2.2 ;
  `backup --to-bucket --keep` et la tâche quotidienne depuis la 4.2.3.
- **Vérifié sur : 19 octobre 2026, par le déploiement de référence** (moteur au commit c66fbf56, package.json 4.2.2
  avant le tag 4.2.3) : la tâche installée sur l’application studio (`crontab -l` la montrait), le script lancé à la
  main sur l’instance 0 sans `--config`, et `--keep` supprimant la plus ancienne. **Non observés** : le passage de
  03:17 UTC lui-même, et qu’une seule sauvegarde soit faite par jour.

<a name="prerequisites"></a>

## Prérequis

- Un Studio déployé ([Premier déploiement](clever.first-deployment.md)) dont la configuration a `blobs.kind: "s3"`.
- Pour une copie hors du bucket : un outil S3 (la console Cellar, `s3cmd`, `aws s3`) et les identifiants Cellar.

<a name="where-to-run"></a>

## Où lancer les commandes

- `clever env set`, `clever ssh`, `clever logs` : sur votre machine, dans le dépôt du moteur où l’application studio
  est liée.
- `npm run studio-server -- backup …` : dans un shell sur l’application studio (`clever ssh --alias my-game-studio`,
  puis `cd "$APP_HOME"`), où la configuration et les identifiants des add-ons sont déjà dans l’environnement.

<a name="steps"></a>

## Étapes

<!-- step: enable-cron -->
1. Activez la sauvegarde quotidienne, sur l’application studio seulement, jamais sur le worker :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever env set --alias my-game-studio STUDIO_BACKUP_CRON 1
   clever env set --alias my-game-studio STUDIO_BACKUP_KEEP 14      # facultatif ; 14 en son absence
   ```

   Le [`clevercloud/cron.json`](../../clevercloud/cron.json) du dépôt lance
   [`ops/studio/backup-cron.sh`](../../ops/studio/backup-cron.sh) chaque jour à 03:17 UTC. Clever Cloud installe les
   tâches d’un dépôt sur chaque application et chaque instance déployée depuis lui : le script ne fait donc rien si
   l’application ne définit pas `STUDIO_BACKUP_CRON=1`, et rien sur une autre instance que la numéro 0
   (`INSTANCE_NUMBER`). Il lance alors `npm run -s studio-server -- backup --to-bucket --keep "${STUDIO_BACKUP_KEEP:-14}"`.
   Un changement de variable s’applique au déploiement ou au redémarrage suivant.

<!-- step: check-run -->
2. Le lendemain matin, trouvez la ligne de la sauvegarde dans les journaux (`clever logs --alias my-game-studio
   --since 12h`, arrêté par son numéro de processus : sinon il continue de suivre), ou lancez le script à la main pour
   la voir tout de suite :

   ```sh
   # dans un shell sur l'application studio (clever ssh --alias my-game-studio)
   cd "$APP_HOME" && ops/studio/backup-cron.sh
   ```

   Sa ligne est `{"event":"backup","key":"backups/2026-10-19T19-38-41Z-r63.json","revision":63,"digest":"…","removed":[…]}`.

> [!MEASURE id=backup-time]
> Le script lancé à la main sur l’instance 0 : 1,87 s, démarrage de `tsx` compris, pour une sauvegarde de
> 253 958 octets à la révision 63. Un second passage aussitôt avec `STUDIO_BACKUP_KEEP=3` a supprimé la seule
> sauvegarde au-delà de 3, en 2,07 s.
> - date: 2026-10-19
> - version: 4.2.2
> - volume: le jeu de démo à la révision 63 (500 fichiers) ; des sauvegardes de 170 746 octets (r1) à 253 958 octets (r63)
> - conditions: phase B du déploiement de référence, moteur au commit c66fbf56 avant le tag 4.2.3 (package.json disait 4.2.2) ; application studio XS, PostgreSQL DEV, Cellar S, région par ; un échantillon chacun
> - source: [QUALIF-4.2.3-REFERENCE.md §3](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

<!-- step: by-hand -->
3. Avant une montée de version, ou toute opération risquée, faites-en une à la main et notez sa révision. Sans
   `--keep`, rien n’est supprimé :

   ```sh
   # dans un shell sur l'application studio (clever ssh --alias my-game-studio)
   cd "$APP_HOME" && npm run -s studio-server -- backup --to-bucket
   ```

   `backup <fichier>` écrit la même sauvegarde dans un nouveau fichier (mode 0600 ; un fichier existant est refusé),
   sur le disque de l’instance, qui ne survit pas à un redémarrage : sur Clever Cloud, préférez le bucket.

<!-- step: copy-elsewhere -->
4. Copiez vous-même le bucket hors de Cellar, avec un outil S3, vers un stockage où seuls les opérateurs écrivent :
   `backups/`, mais aussi `sha256/` (le contenu des fichiers) et `journal/` (les opérations expédiées). Une sauvegarde
   nomme ses blobs sans les contenir, et une restauration refuse une sauvegarde dont des blobs manquent : une copie de
   `backups/` seule ne restaure rien. Le bucket contient les trois ensemble : une sauvegarde survit à la perte de la
   base, pas à celle du bucket ou de ses identifiants.

> [!GUARANTEE id=backup-keep-own-only]
> `--keep n` ne supprime que les sauvegardes que cette commande a écrites (les clés `backups/<date>-r<révision>.json`)
> au-delà des n plus récentes, celle qui vient d’être écrite comptant pour l’une d’elles : jamais un autre objet du
> bucket, ni un fichier d’un autre nom sous `backups/`.

<a name="holds"></a>

### Ce qu’une sauvegarde contient, et ce qu’elle ne contient pas

| Contient | Ne contient pas |
|---|---|
| Les tables du projet, lues en un seul instantané en lecture seule : la tête (`studio_files`, `studio_meta`), les opérations confirmées (`studio_ops`), les membres, utilisateurs, invitations, le journal d’audit, l’annulation personnelle, les verdicts de santé, les prévisualisations, les builds publiés, les ensembles préparés, les commentaires | **Le contenu des fichiers** : elle liste les blobs qu’elle nomme, par leur hash ; ils restent dans le bucket |
| Un condensé (sha256 de ses tables), vérifié à la restauration : une sauvegarde altérée ou tronquée est refusée | Les sessions et les connexions en cours : **une restauration déconnecte tout le monde** |
| La version du schéma où elle a été faite : une restauration demande la même | Les baux (celui de l’écrivain, celui du service, ceux des pans) : personne ne tient de pan après une restauration |
| | Les opérations en cours ou abandonnées à l’instantané ; les réponses gardées pour la nouvelle tentative d’un client (7 jours) ; les tickets et sessions de l’origine du jeu |

Une sauvegarde est une entrée de confiance, comme les identifiants de la base : elle peut ajouter des owners. Son
condensé dit qu’elle est entière, pas qui l’a faite : gardez-la là où seuls les opérateurs écrivent.

<a name="journal"></a>

### Le journal expédié vers le bucket

Chaque opération confirmée est copiée dans le bucket, dans l’ordre, en segment immuable
(`journal/<époque>/<ligne>/<rev>.json` ; les contenus sont déjà des blobs). Un échec est consigné `ship-failed` et
retenté sous 30 s. `/readyz` donne `rpoMs`, l’âge de la plus ancienne opération pas encore expédiée (0 quand tout
l’est) : la cible est une minute (D42), surveillée, jamais promise ([RPO et RTO](clever.rpo-rto.md)). La ligne vaut
`0`, puis une nouvelle après chaque restauration : les révisions qu’une instance restaurée réécrit n’écrasent jamais
les segments de la chronologie qu’elle a quittée. Faites une nouvelle sauvegarde après une restauration : les
suivantes rejouent sur la nouvelle ligne.

<a name="restore"></a>

### Ce que fait une restauration

La procédure, c’est l’[exercice de restauration](clever.restore-drill.md) ; voici ce que fait la commande, en bref. Elle
ne restaure qu’une instance hébergée, dans une base vide (un nouvel add-on PostgreSQL, le même bucket) :
`npm run studio-server -- restore <fichier> --replay --config <fichier>` vérifie le condensé, les tables et les
colonnes, et que chaque blob de la tête et du journal est dans le bucket (une prévisualisation, un build ou un ensemble
préparé dont les blobs ont été ramassés depuis est laissé de côté et compté dans `dropped`) ; écrit les lignes ; puis
rejoue le journal expédié depuis la sauvegarde. Chaque opération rejouée doit continuer la tête (sa révision, le contenu
précédent de chaque fichier, ses blobs) ; le rejeu s’arrête à la première qui ne le fait pas (`stopped` : `gap`,
`not-the-head`, `blob-missing`…). S’il échoue en cours de route, le serveur refuse de démarrer jusqu’à ce que
`npm run studio-server -- replay --config <fichier>` le reprenne. Démarrez ensuite le serveur : son dossier est refait
depuis la tête. Les opérations rejouées ne gardent pas leur réponse : un client qui en retente une reçoit `null`.
Faites une nouvelle sauvegarde après une restauration : les suivantes rejouent sur la nouvelle ligne.

<a name="from-archives"></a>

### Depuis les archives de la release

Les archives de la release ne portent pas `ops/studio/backup-cron.sh`. Copiez-le dans le dépôt de votre application
en remplaçant sa dernière ligne par :

```sh
# la dernière ligne de backup-cron.sh, dans le dépôt de votre application (lancée par la tâche de Clever sur l'application studio)
exec npx quest-n-click-studio-server backup --to-bucket --keep "${STUDIO_BACKUP_KEEP:-14}"
```

rendez-le exécutable, et pointez votre propre `clevercloud/cron.json` dessus : `["17 3 * * * $ROOT/backup-cron.sh"]`.
Clever Cloud lance une tâche sans environnement à moins que son script commence par `#!/bin/bash -l` (la première
ligne du script), et avec des chemins absolus seulement (`$ROOT` est le dossier de l’application).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

- Un nouvel objet `backups/…json` chaque jour dans le bucket, et sa ligne `"event":"backup"` dans les journaux.
- Pas plus de `STUDIO_BACKUP_KEEP` d’entre eux (les autres objets sous `backups/` sont laissés tranquilles).
- La vraie vérification, c’est une restauration : faites l’[exercice de restauration](clever.restore-drill.md) au
  moins une fois, et après chaque montée de version.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| Pas de ligne `"event":"backup"` un matin | `STUDIO_BACKUP_CRON` n’est pas `1`, pas de redéploiement depuis, ou pas d’`INSTANCE_NUMBER=0` | [Dépannage](clever.troubleshooting.md#silent-cron) |
| `backup --to-bucket writes to the instance's bucket: blobs.kind is s3` | Une configuration locale | Lancez-la sur l’application studio |
| `backup: --keep is the number of backups kept (1 or more)` | `STUDIO_BACKUP_KEEP` vaut `0`, est négatif ou n’est pas un entier | Un entier à partir de 1 |
| `backup: a new file is required (or --to-bucket [--keep n])` | `backup` sans fichier, ou avec un fichier existant | Un nouveau nom de fichier, ou `--to-bucket` |
| Deux sauvegardes à la même minute | Un redéploiement à chevauchement à 03:17 : deux instances numérotées 0 un instant | Sans conséquence |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Des objets sous `backups/` dans le bucket ; avec `--keep`, les plus anciens des siens supprimés. Rien dans la base.

<a name="recovery"></a>

## Reprise ou retour arrière

Une sauvegarde supprimée par `--keep` est perdue, sauf si vous l’avez copiée ailleurs (étape 4). Restaurer une
sauvegarde, c’est l’[exercice de restauration](clever.restore-drill.md), dans une nouvelle base.

<a name="gc"></a>

### Ramasser les blobs inutilisés

`npm run studio-server -- gc` liste les blobs qu’aucune ligne ne nomme (plus vieux d’un jour) et le staging du worker
de plus d’une heure ; `--delete` les supprime. Un blob stocké à nouveau reçoit une nouvelle date : une écriture qui
nomme un vieux blob est couverte par le jour de grâce. Les blobs de la tête et du journal ne sont jamais ramassés (le
journal garde chaque opération) ; une sauvegarde plus ancienne restaurée après un ramassage ne perd que les
prévisualisations, builds et ensembles préparés ramassés (comptés dans `dropped`). Ne lancez jamais `gc --delete`
contre la base d’un exercice : il supprimerait des blobs que la production nomme encore.

<a name="references"></a>

## Références

- [`studio-server/src/ops/backup.ts`](../../studio-server/src/ops/backup.ts) (ce qui est gardé, et pourquoi),
  [`studio-server/src/ops/backup-bucket.ts`](../../studio-server/src/ops/backup-bucket.ts),
  [`studio-server/src/ops/gc.ts`](../../studio-server/src/ops/gc.ts),
  [`ops/studio/backup-cron.sh`](../../ops/studio/backup-cron.sh), [`clevercloud/cron.json`](../../clevercloud/cron.json).
- [`STUDIO_BACKUP_CRON`](reference.environment-variables.md#studio-backup-cron),
  [`STUDIO_BACKUP_KEEP`](reference.environment-variables.md#studio-backup-keep).
- [Rétention](clever.retention.md), [Exercice de restauration](clever.restore-drill.md), [RPO et RTO](clever.rpo-rto.md).
