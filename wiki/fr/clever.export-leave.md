# Exporter le jeu et quitter l’installation

Comment tout sortir d’un Studio hébergé sur Clever Cloud : les fichiers du jeu en un dossier qu’un Studio local
ouvre, et le reste du projet (membres, commentaires, histoire) sous une forme que vous gardez. Ensuite, vous pouvez
supprimer l’installation.

<a name="what-you-get"></a>

## Ce que vous obtenez

- Un dossier avec les fichiers du jeu à la révision de tête et un `export-manifest.json` qui nomme le hash de chaque
  fichier et la révision : un jeu que vous faites tourner avec un Studio local, sans serveur.
- La dernière sauvegarde et une copie du bucket (`backups/`, `sha256/`, `journal/`) sur un stockage à vous : tout ce
  qu’une restauration demande, si vous voulez un jour retrouver le projet hébergé.

<a name="context-and-versions"></a>

## Contexte et versions

- Un Studio hébergé sur Clever Cloud, à partir de la 4.2.3. `studio-server export` existe depuis la 4.2.1.
- **Vérifié sur : non vérifié sur une installation réelle.** Aucun export n’a été fait depuis le déploiement de
  référence. L’export lit la base et le bucket comme une restauration ; le lancer sur une copie restaurée (plus bas)
  n’a pas été exercé.

<a name="prerequisites"></a>

## Prérequis

- Le dépôt du moteur sur votre machine à la version de l’application studio, `npm ci` fait.
- Un outil S3 et les identifiants Cellar ; `clever-tools` connecté.
- L’[exercice de restauration](clever.restore-drill.md), lu : l’export tourne sur une copie restaurée, jamais sur la
  production.

<a name="where-to-run"></a>

## Où lancer les commandes

Sur votre machine, dans le dépôt du moteur à la version de l’application studio, avec `STUDIO_DATABASE_URL` pointé sur
un add-on **d’exercice**, jamais sur celui de la production.

<a name="steps"></a>

## Étapes

<!-- step: tell-and-freeze -->
1. Prévenez les membres, et convenez d’une dernière écriture : ce qui est écrit après la sauvegarde de l’étape 2 est
   dans le journal expédié vers le bucket et revient avec le rejeu, mais personne ne devrait continuer à travailler sur
   une installation qu’on quitte.

<!-- step: backup-and-copy -->
2. Faites une sauvegarde dans le bucket (`npm run -s studio-server -- backup --to-bucket` dans `clever ssh`), puis
   copiez tout le bucket vers un stockage à vous avec un outil S3 : `backups/`, `sha256/` (les contenus) et `journal/`.
   Une sauvegarde sans ses blobs ne restaure rien ([Sauvegardes](clever.backups.md#holds)).

<!-- step: restore-copy -->
3. Restaurez cette sauvegarde dans un nouvel add-on PostgreSQL vide, en suivant les étapes 2 à 4 de
   l’[exercice de restauration](clever.restore-drill.md). Vous avez maintenant une copie du projet qui n’est pas la
   production.

<!-- step: export -->
4. Exportez le jeu à sa tête depuis cette copie, dans un nouveau dossier :

   ```sh
   # sur votre machine, dans le dépôt du moteur, STUDIO_DATABASE_URL et les clés Cellar exportées comme dans l'exercice
   npm run -s studio-server -- export ./my-game-export --config drill.config.json
   ```

   Il écrit chaque fichier de la tête, vérifie le hash de chacun contre la tête (un écart l’arrête : « the content does
   not match the head »), et écrit `export-manifest.json` (`game`, `epoch`, `revision`, `files`). Sa dernière ligne est
   `{"event":"exported","revision":…,"files":…}`. Il refuse un dossier qui n’est pas vide.

<!-- step: open-locally -->
5. Ouvrez le jeu exporté dans un Studio local : copiez le dossier en `games/my-game` d’un projet créé (ou du dépôt du
   moteur) et lancez-y son Studio ([Vue d’ensemble et lancement](studio.overview.md)).

<!-- step: git-alternative -->
6. Si le Studio pousse vers un dépôt Git (`git` dans sa configuration), un dernier push depuis le Studio donne les mêmes
   fichiers avec leur histoire en commits ([Le jeu dans Git](team.game-in-git.md)) : gardez aussi ce dépôt.

> [!LIMIT id=export-is-files]
> L’export ne contient que les fichiers du jeu. Membres, invitations, commentaires, journal d’audit, annulation
> personnelle, prévisualisations, builds publiés et assets préparés n’y sont pas ; ils sont dans le JSON de la
> sauvegarde (étape 2), qui les garde lisibles mais que seul un Studio Server de la même version restaure.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

La `revision` d’`export-manifest.json` est la tête que vous avez notée (`GET /api/revision` avant de partir), ses
`files` ont autant d’entrées que le dossier contient de fichiers, et le Studio local ouvre le jeu et le valide.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `export: an empty or new folder is required` | Le dossier existe et contient des fichiers | Un nouveau dossier |
| `STUDIO_DATABASE_URL (or POSTGRESQL_ADDON_URI) is required` | Pas d’URI de base dans le shell | Exportez l’URI de l’add-on d’exercice |
| `<chemin>: the content does not match the head` | Un blob du bucket diffère de ce que nomme la tête | Arrêtez-vous ; vérifiez le bucket et les identifiants Cellar |
| Le Studio local dit que le jeu ne se charge pas | Le jeu importe des fichiers hors de son dossier, ou la version du moteur diffère | Prenez le moteur à la version de l’application studio |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Le dossier d’export et la copie du bucket de votre côté ; un add-on d’exercice chez Clever Cloud (supprimez-le
ensuite). La production n’est que lue, pour la sauvegarde.

<a name="recovery"></a>

## Reprise ou retour arrière

Rien n’est changé en production. Pour revenir plus tard à un Studio hébergé, restaurez la sauvegarde et la copie du
bucket gardées dans une nouvelle installation de la même version ([exercice de restauration](clever.restore-drill.md)),
ou importez le dossier exporté dans une nouvelle (`npm run studio-server -- import`,
[Premier déploiement](clever.first-deployment.md#steps)) : un import commence une nouvelle histoire.

<a name="references"></a>

## Références

- `export`, `import` : [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts) ; la sauvegarde :
  [`studio-server/src/ops/backup.ts`](../../studio-server/src/ops/backup.ts) ; Git :
  [`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts).
- Ensuite, supprimez l’installation : [Coûts et démontage](clever.costs-teardown.md) ; ce qui est gardé et combien de
  temps : [Rétention](clever.retention.md).
