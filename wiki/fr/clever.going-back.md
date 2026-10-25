# Limites du retour arrière

Après une mise à jour, revenir à la version précédente du Studio Server, c’est parfois un simple redéploiement, et
parfois une restauration qui perd ce qui a été écrit depuis. Cette page dit lequel, pourquoi, et que faire dans chaque
cas.

<a name="why"></a>

## Pourquoi

Le Studio Server migre sa base **vers le haut** au démarrage, étape par étape (`studio-server/migrations/NNNN.up.sql`,
notées dans `schema_migrations`). L’exécuteur des migrations refuse une base plus récente que toutes les étapes qu’il
connaît : un serveur plus ancien ne peut pas ouvrir une base qu’un plus récent a migrée au-delà de lui. Chaque étape a
aussi un `NNNN.down.sql`, et l’exécuteur partagé sait les appliquer, mais **le Studio Server n’a aucune commande pour
migrer vers le bas** : redescendre le schéma n’est pas une procédure prise en charge.

> [!GUARANTEE id=newer-schema-refused]
> Sur le stockage SQLite du Bridge, migrer une base dont le schéma est plus récent que la dernière migration du Bridge
> est refusé, avec une erreur qui dit que la base est plus récente que ce que ce Bridge connaît.

Le message complet est « the database is at schema N, newer than this Bridge knows (M): upgrade the Bridge ». Le code
le lève avant toute étape, donc rien ne change ; le test ne l’affirme pas. Le Studio Server fait tourner le même
exécuteur (`bridge/src/migrations.ts`), dont le message dit encore « Bridge ».

Il y a donc deux cas.

<a name="cases"></a>

## Les deux cas

| La mise à jour… | Revenir en arrière, c’est… | Ce qui est perdu |
|---|---|---|
| n’a ajouté aucune migration | un redéploiement de la version précédente | rien |
| a ajouté au moins une migration | impossible par redéploiement (l’ancien serveur refuse le schéma plus récent) : une restauration, avec la version précédente, de la sauvegarde faite **avant** la mise à jour, dans un **nouvel** add-on | ce qui a été écrit depuis cette sauvegarde, sauf si le rejeu peut encore l’appliquer |

Le rejeu après une restauration applique le journal expédié depuis la sauvegarde, tant que chaque opération continue
la tête ; il s’arrête à la première qui ne le fait pas (`stopped`). Que les opérations écrites par une version plus
récente se rejouent sur une plus ancienne n’a jamais été mesuré ; la dernière ligne de la restauration dit jusqu’où
elle est allée.

<a name="procedure"></a>

## Revenir en arrière, étape par étape

**Vérifié sur : non vérifié sur une installation réelle.** Aucun retour arrière n’a été exercé par le déploiement de
référence.

<!-- step: try-redeploy -->
1. Si la mise à jour n’a ajouté aucune migration
   (`git diff --name-only <ancien tag> <nouveau tag> -- studio-server/migrations` est vide), redéployez la version précédente, le worker d’abord. `clever deploy` pousse le
   commit de votre copie ; un commit plus ancien n’est pas une avance rapide de ce qui est déployé, d’où `--force` :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   git checkout v4.3.1
   clever deploy --alias my-game-worker --force
   clever deploy --alias my-game-studio --force
   ```

<!-- step: read-refusal -->
2. Si l’ancien studio ne démarre pas et que son journal dit `the database is at schema …, newer than this Bridge
   knows`, le schéma ne peut pas revenir en arrière. Redéployez la nouvelle version pour servir de nouveau, puis
   choisissez : y rester, ou restaurer.

<!-- step: restore-older -->
3. Pour restaurer : suivez l’[exercice de restauration](clever.restore-drill.md) avec la version **précédente**, la
   sauvegarde faite avant la mise à jour, et un **nouvel** add-on PostgreSQL. Liez ensuite cet add-on à l’application
   studio à la place de l’ancien, et déployez la version précédente dessus. Les membres se reconnectent (les sessions
   ne sont pas dans une sauvegarde).

<!-- step: keep-old -->
4. Gardez l’add-on de la base mise à jour tant que vous n’avez pas vérifié le résultat : c’est la seule copie de ce qui
   a été écrit entre la sauvegarde et la bascule, si le rejeu s’est arrêté tôt.

> [!LIMIT id=no-schema-downgrade]
> Il n’existe aucune façon prise en charge de faire redescendre la base du Studio. Les fichiers `NNNN.down.sql` sont
> gardés pour les tests de l’exécuteur ; les lancer à la main sur la production n’est ni documenté, ni essayé sur un
> Studio hébergé, et laisserait une base qu’aucune sauvegarde ne décrit.

<a name="game-content"></a>

## Revenir en arrière sur le contenu du jeu

La mise à jour du moteur du jeu par son owner (schéma d’écriture 2 → 3) est une seule révision : l’Annuler de l’owner
la reprend, en nouvelle révision (409 si quelqu’un a écrit l’un de ses fichiers depuis). Le renommage des anciens
imports `web-scumm/…` (4.3.0) s’écrit sans annulation ; une sauvegarde faite avant est le chemin du retour
([Mettre à jour le moteur d’un jeu hébergé](team.upgrade-engine.md)).

<a name="alternatives"></a>

## Les autres possibilités écartées

- **Une commande `migrate --down`.** Elle laisserait un serveur plus ancien rouvrir la base, mais une étape descendante
  peut supprimer des données que la version plus récente a écrites (une nouvelle table, les commentaires de `0012` par
  exemple), sans le dire. Une restauration dit ce qu’elle a gardé et ce qu’elle a laissé.
- **Ne jamais migrer pendant que l’ancienne instance sert.** Ce serait un arrêt à chaque mise à jour ; le chevauchement
  est gardé, avec `clever stop` d’abord pour le seul cas qui l’exige ([Mettre à jour le serveur](clever.upgrade-server.md)).

<a name="trade-offs"></a>

## Les compromis

Revenir en arrière après une migration coûte une restauration, un nouvel add-on, la déconnexion de tout le monde, et
peut-être les écritures faites depuis la sauvegarde. D’où la sauvegarde de l’étape 2 de la mise à jour, et un exercice
sur la nouvelle version, d’abord.

<a name="decisions"></a>

## Décisions et ADR

- L’exécuteur : [`bridge/src/migrations.ts`](../../bridge/src/migrations.ts) (ADR 0009 pour le schéma du Bridge, repris
  par le Studio Server) ; les migrations : [`studio-server/migrations/`](../../studio-server/migrations/0012.down.sql).
- Le test derrière la garantie : [`tests/bridge-reality-store.test.ts`](../../tests/bridge-reality-store.test.ts).
- [Mettre à jour le serveur](clever.upgrade-server.md), [Exercice de restauration](clever.restore-drill.md).
