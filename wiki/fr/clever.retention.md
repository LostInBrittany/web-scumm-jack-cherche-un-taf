# Rétention

Ce qu’un Studio hébergé garde, où, et combien de temps, lu dans le code de la version actuelle ; puis ce que vous
pouvez supprimer, et comment. L’essentiel du projet est gardé pour de bon, exprès : le journal est l’histoire du jeu.

**Vérifié sur : non vérifié sur une installation réelle** pour les suppressions ci-dessous (`gc --delete` n’a pas
tourné sur le déploiement de référence) ; `--keep`, si ([Sauvegardes](clever.backups.md)). S’applique à partir de la
4.2.3.

<a name="journal"></a>

## Le journal et les fichiers du jeu

| Quoi | Où | Gardé |
|---|---|---|
| Chaque opération confirmée (qui, quand, quels fichiers, les hash de leurs contenus avant et après) | PostgreSQL, `studio_ops` | **Pour de bon.** Rien ne supprime une opération confirmée : c’est l’histoire que lisent l’annulation, le diff et le rejeu |
| La tête : la version courante de chaque fichier | PostgreSQL, `studio_files` | Tant que le fichier existe |
| Le contenu des fichiers (les blobs, par hash) | Cellar, `sha256/<hash>` | Tant qu’une ligne le nomme (la tête, une opération, une prévisualisation, un build, un ensemble préparé), et au moins un jour ; ensuite, seul `gc --delete` le retire |
| Le journal expédié vers le bucket | Cellar, `journal/<époque>/<ligne>/<rev>.json` | **Pour de bon** : rien ne supprime un segment |

<a name="previews"></a>

## Prévisualisations, builds, assets préparés

| Quoi | Gardé |
|---|---|
| La prévisualisation de chaque révision (ses chemins et hash, ou la raison de son échec) | Pour de bon, avec ses blobs : environ 1 Mo par révision pour le jeu d’exemple, peu de fichiers partagés entre révisions. Aucune commande ne supprime les prévisualisations dans cette version |
| Les builds publiés | Pour de bon |
| Les ensembles d’assets préparés | Les lignes pour de bon ; sur le disque de l’instance, seulement l’ensemble courant (un plus ancien est retiré quand un nouveau est servi) |
| Le dépôt du worker (l’instantané et le résultat d’un job) | `staging/` dans le bucket : supprimé après chaque job ; ce qui reste de plus d’une heure est retiré par `gc --delete` |

<a name="backups"></a>

## Les sauvegardes

La sauvegarde quotidienne garde les `STUDIO_BACKUP_KEEP` plus récentes (14 par défaut) des sauvegardes qu’elle a
écrites ; une sauvegarde faite à la main par `backup --to-bucket` sans `--keep` compte parmi elles au passage quotidien
suivant, car elle a la même forme de nom. Les copies que vous faites ailleurs sont à vous de supprimer
([Sauvegardes](clever.backups.md)).

<a name="people"></a>

## Les personnes et les sessions

| Quoi | Gardé |
|---|---|
| Les utilisateurs (`iss`, `sub` du fournisseur, e-mail, nom), vus à leur première connexion | Pour de bon, même après le retrait d’un membre (e-mail et nom suivent le fournisseur à chaque connexion) |
| Les membres et leurs rôles | Jusqu’au retrait par un owner |
| Les invitations (stockées par leur hash) | Utilisées une fois, valables 7 jours ; les lignes restent |
| Le journal d’audit (connexions, invitations, changements de rôle, retraits, révocations ; l’identifiant de l’auteur) | Pour de bon. `GET /api/audit` montre les 200 plus récentes |
| Les commentaires, avec le nom de leur auteur | Pour de bon : un commentaire se modifie ou se résout, il ne se supprime jamais |
| Les sessions du navigateur | 8 h d’inactivité, 24 h en tout (réglables) ; une ligne de session est supprimée à la déconnexion, au retrait, à la révocation, ou quand elle est présentée après sa fin. Aucun balayage périodique |
| Les connexions en cours | 10 min ; supprimées à la connexion suivante |
| Les tickets et sessions de l’origine du jeu | 60 s et 15 min ; les expirés supprimés à l’usage suivant |
| Les réponses gardées pour la nouvelle tentative d’un client (par identifiant d’opération) | 7 jours |
| Les jetons de déconnexion back-channel vus | Jusqu’à leur propre expiration |

> [!LIMIT id=no-erasure-command]
> Il n’existe aucune commande pour effacer une personne d’un projet : retirer un membre met fin à son accès, mais sa
> ligne d’utilisateur, les entrées d’audit et les opérations qu’il a écrites (dont il est l’auteur dans l’histoire)
> restent, dans la base et dans chaque sauvegarde. Les effacer demanderait de modifier la base à la main, ce que ce
> projet ne documente pas.

<a name="memory-and-logs"></a>

## En mémoire, et les journaux

- Les jobs (Préparer, découpes) sont gardés dans la mémoire de l’instance, les 50 derniers terminés ; un redémarrage
  les oublie.
- Les métriques vivent en mémoire et repartent de zéro.
- Les journaux vont au service de journaux de Clever Cloud ; leur durée de conservation est un réglage de Clever, pas
  de ce projet. Les lignes de requête portent le chemin, le statut et l’adresse du client ; jamais un secret.

<a name="purge"></a>

## Supprimer ce qui peut l’être

<!-- step: list -->
1. Listez ce que le ramassage supprimerait, sans rien supprimer :

   ```sh
   # dans un shell sur l'application studio (clever ssh --alias my-game-studio)
   cd "$APP_HOME" && npm run -s studio-server -- gc
   ```

   Sa ligne, `{"event":"collectable","referenced":…,"unreferenced":…,"removed":0,"staging":…}`, compte les blobs
   qu’aucune ligne ne nomme (plus vieux d’un jour) et les objets de dépôt périmés.

<!-- step: delete -->
2. Faites d’abord une sauvegarde, puis supprimez :

   ```sh
   # dans un shell sur l'application studio (clever ssh --alias my-game-studio)
   cd "$APP_HOME" && npm run -s studio-server -- gc --delete
   ```

   Une sauvegarde plus ancienne restaurée après un ramassage ne perd que les prévisualisations, builds et ensembles
   préparés dont le ramassage a pris les blobs (comptés dans `dropped`). Ne le lancez jamais contre la base d’un
   exercice : il supprimerait des blobs que la production nomme encore.

> [!GUARANTEE id=gc-keeps-referenced]
> Le ramassage garde chaque blob qu’une ligne nomme et chaque blob encore dans son délai de grâce (une écriture peut
> être en train de le stocker), et ne supprime le reste qu’avec `--delete`.

Le délai de grâce est d’un jour par défaut.

<a name="related"></a>

## Identifiants liés

- `npm run studio-server -- gc`, `backup --to-bucket --keep`, [`STUDIO_BACKUP_KEEP`](reference.environment-variables.md#studio-backup-keep).
- Le code : [`studio-server/src/ops/gc.ts`](../../studio-server/src/ops/gc.ts),
  [`studio-server/src/ops/backup.ts`](../../studio-server/src/ops/backup.ts) (ce qu’une sauvegarde garde ou laisse, et
  pourquoi), [`studio-server/src/server/auth/store.ts`](../../studio-server/src/server/auth/store.ts) ; le test :
  [`tests/studio-backup.test.ts`](../../tests/studio-backup.test.ts).
- Partir pour de bon : [Exporter le jeu](clever.export-leave.md), [Coûts et démontage](clever.costs-teardown.md).
