# Mettre à jour le serveur et vérifier l’état après une migration

Mettre à jour le Studio Server, c’est le même redéploiement à chevauchement que tout autre, d’une nouvelle version :
les migrations de la base tournent au démarrage de la nouvelle instance. Cette page met à jour les deux applications
et vérifie, ensuite, que le jeu est là où il était.

<a name="what-you-get"></a>

## Ce que vous obtenez

Les deux applications à la nouvelle version, la base migrée à son schéma, la révision du jeu inchangée par la mise à
jour, les écritures de nouveau servies, et une sauvegarde faite juste avant, pour revenir en arrière s’il le faut.

<a name="context-and-versions"></a>

## Contexte et versions

- Un Studio hébergé sur Clever Cloud, déployé depuis le dépôt, à partir de la 4.2.3 (la passation du bail).
- Cette page parle du serveur. Le contenu du jeu lui-même (schéma d’écriture 2 → 3, les anciens imports
  `web-scumm/…`) se met à jour dans le Studio par son owner : [Mettre à jour le moteur d’un jeu hébergé](team.upgrade-engine.md).
- **Vérifié sur : 19 octobre 2026, par le déploiement de référence** : une mise à jour du commit 52e68932 vers
  c66fbf56 (tous deux package.json 4.2.2, avant le tag 4.2.3), avec une nouvelle migration (`0012`, la table des
  commentaires), en suivant ces quatre étapes. Le texte exact de cette page n’est pas vérifié sur une installation
  réelle.

<a name="prerequisites"></a>

## Prérequis

- Un Studio en marche avec des sauvegardes ([Sauvegardes](clever.backups.md)).
- Le dépôt du moteur sur votre machine, à la **nouvelle** version, `npm ci` fait.

<a name="where-to-run"></a>

## Où lancer les commandes

`git`, `clever deploy` : sur votre machine, dans le dépôt du moteur. La sauvegarde : dans un shell sur l’application
studio (`clever ssh --alias my-game-studio`).

<a name="steps"></a>

## Étapes

<!-- step: read -->
1. Lisez le CHANGELOG de la version, et les notes de mise à jour pour le contenu du jeu
   ([Mettre à jour](install.upgrade.md)). Listez les nouvelles migrations de la base entre les deux versions :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   git diff --name-only v4.3.1 v4.4.0 -- studio-server/migrations
   ```

   Les migrations tournent au démarrage de la nouvelle instance, pendant que l’ancienne peut encore servir. Si l’une
   change ce que lit l’ancienne version (une colonne qu’elle utilise renommée ou supprimée, pas une nouvelle table),
   arrêtez d’abord l’ancienne, `clever stop --alias my-game-studio`, et acceptez la minute sans Studio.

<!-- step: backup -->
2. Faites une sauvegarde dans le bucket et notez sa révision :

   ```sh
   # dans un shell sur l'application studio (clever ssh --alias my-game-studio)
   cd "$APP_HOME" && npm run -s studio-server -- backup --to-bucket
   ```

<!-- step: deploy -->
3. Déployez le worker d’abord, puis le studio, à la même version :

   ```sh
   # sur votre machine, dans le dépôt du moteur, à la nouvelle version
   clever deploy --alias my-game-worker
   clever deploy --alias my-game-studio
   ```

   Tant que les deux ne sont pas à la nouvelle version, un job peut être refusé ; le Studio refuse alors l’écriture
   qu’il vérifiait (il échoue fermé, un 503) plutôt que de la laisser passer.

<!-- step: check -->
4. Regardez `/readyz` revenir à 200 sur la nouvelle instance (`instance` dans la ligne `lease-taken`), vérifiez que
   la révision n’a pas changé, et faites une écriture.

> [!MEASURE id=upgrade-run]
> Le déploiement du studio avec la migration 0012 : « 1 minute and 29 seconds ». La révision a continué : 52 avant la
> bascule, 53 pour la première écriture après ; les écritures suivantes ont répondu en 164 à 600 ms. Les écritures ont
> été refusées 2 min 23 s (cette version n’avait pas encore la passation du bail ; [Redéploiements](clever.redeploys.md)),
> et une écriture retentée 70 fois avec son identifiant a été appliquée une fois.
> - date: 2026-10-19
> - version: 4.2.2
> - volume: le jeu de démo, révision 52 ; une nouvelle migration
> - conditions: phase B du déploiement de référence, 52e68932 → c66fbf56 sur main avant le tag 4.2.3 (package.json disait 4.2.2) ; worker puis studio, applications XS, PostgreSQL DEV, région par
> - source: [QUALIF-4.2.3-REFERENCE.md §1 et §5](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Vérifiez, dans cet ordre :

- **Il a démarré.** Le journal de la nouvelle instance a `{"event":"lease-taken",…}` ;
  `https://studio.exemple.fr/readyz` répond 200, `"writes":"served"`, `rpoMs` revenu à 0.
- **Le jeu n’a pas bougé.** En membre, `GET /api/revision` donne la même `epoch` et la même `revision` qu’avant le
  déploiement (ou plus loin, si quelqu’un a écrit entre-temps).
- **Il écrit.** Une modification (une note) est enregistrée, à la révision suivante.
- **Le schéma.** Avec `psql` et l’URI de l’add-on (la console de Clever l’affiche ; ne la collez jamais nulle part),
  `SELECT MAX(version) FROM schema_migrations` donne le numéro du fichier le plus récent de `studio-server/migrations/`
  de la nouvelle version.
- **Le worker.** La santé de l’en-tête redevient verte et une prévisualisation se construit (les jobs du worker
  réussissent) ; dans les journaux, aucun `health-failed` ni `preview-failed` après la bascule.
- **Une restauration marche encore.** Faites l’[exercice de restauration](clever.restore-drill.md) avec la nouvelle
  version, sur une sauvegarde faite après la mise à jour.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| Écritures en 503 « the edit cannot be judged now: … » un moment | Le worker encore à l’ancienne version, ou en redéploiement | Attendez les deux déploiements ; déployez le worker d’abord |
| Écritures refusées environ 2 min 30 | Le premier déploiement vers une version qui porte la passation du bail, depuis une qui ne la porte pas | Attendu, une fois ([Redéploiements](clever.redeploys.md)) |
| `too many connections` dans les journaux pendant le déploiement | Plan PostgreSQL DEV | Un plan plus grand |
| L’ancienne instance consigne des erreurs sur une colonne que la migration a changée | Une migration qui change ce que lit l’ancienne version | La prochaine fois, `clever stop` d’abord (étape 1) |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Le schéma de la base (nouvelles migrations appliquées, notées dans `schema_migrations`), une nouvelle sauvegarde sous
`backups/`, le commit déployé des deux applications.

<a name="recovery"></a>

## Reprise ou retour arrière

Redéployer la version précédente ne marche que tant qu’elle lit encore la base migrée ; un serveur plus ancien refuse
une base dont le schéma est plus récent que le sien. Sinon, revenir en arrière, c’est restaurer la sauvegarde de
l’étape 2 dans un nouvel add-on, avec la version précédente : [Limites du retour arrière](clever.going-back.md).

<a name="references"></a>

## Références

- Les migrations : [`studio-server/migrations/`](../../studio-server/migrations/0012.up.sql) (un `NNNN.up.sql` et un
  `NNNN.down.sql` par étape) ; leur exécuteur : [`bridge/src/migrations.ts`](../../bridge/src/migrations.ts).
- [Redéploiements](clever.redeploys.md), [Sauvegardes](clever.backups.md), [`CHANGELOG.md`](../../CHANGELOG.md).
