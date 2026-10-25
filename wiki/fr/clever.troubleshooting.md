# Dépannage sur Clever Cloud

Les problèmes qu’un Studio hébergé sur Clever Cloud a montrés, ou qu’il est fait pour montrer : une 503, des connexions
épuisées, un cookie qui manque, une prévisualisation lente, des jobs refusés pour un décalage d’horloge, une sauvegarde
quotidienne qui n’a pas tourné. Chacun part de ce que vous voyez.

<a name="symptom"></a>

## Symptôme

| Vous voyez | Section |
|---|---|
| Un enregistrement refusé en 503 avec `Retry-After: 2`, « this instance does not serve writes yet; try again », pendant ou juste après un déploiement | [503 pendant un déploiement](#deploy-503) |
| « too many connections for role … » dans les journaux, un 500 sur une écriture pendant un déploiement | [Connexions épuisées](#connections) |
| Les cadres du jeu vides dans un navigateur (Safari, GNOME Web), ou 401 « open the game from the Studio » dans le cadre | [Cookie manquant](#missing-cookie) |
| La vue de la pièce qui montre une révision plus ancienne pendant des dizaines de secondes après une modification | [Prévisualisation lente](#slow-preview) |
| Santé et prévisualisations qui échouent par moments ; `the processing worker refused the job (403: the job has expired)` | [Décalage d’horloge](#clock-skew) |
| Pas de ligne `"event":"backup"` un matin, pas de nouvel objet sous `backups/` | [Tâche planifiée muette](#silent-cron) |
| 503 « the edit cannot be judged now », ou « the session is suspended » | Un service en panne : [Worker, PostgreSQL ou Cellar en panne](clever.dependency-down.md) |

<a name="causes"></a>

## Causes possibles

- Un redéploiement : deux instances se chevauchent plusieurs minutes et se passent le bail de service.
- Le plan PostgreSQL DEV (5 connexions) avec deux instances qui tournent.
- `publicUrl` et `playUrl` sur deux sites (`*.cleverapps.io`), ou un navigateur qui ne garde aucun cookie dans un cadre
  d’un autre hôte.
- La construction de la prévisualisation sur le worker, une à la fois, avec les fichiers de chaque révision stockés.
- L’horloge de l’application studio en avance sur celle du worker (avant le correctif de la 4.2.3, quelques
  millisecondes suffisaient).
- Les conditions de la tâche planifiée : `STUDIO_BACKUP_CRON`, l’instance numéro 0, un shell de connexion, des chemins
  absolus.

<a name="diagnosis"></a>

## Diagnostic

Gardez les journaux des deux applications pendant que vous cherchez (`clever logs` suit jusqu’à ce qu’on l’arrête :
lancez-le en arrière-plan et arrêtez-le par son numéro de processus), et lisez `/readyz` :

```sh
# sur votre machine, dans le dépôt du moteur
clever logs --alias my-game-studio > studio.log 2>&1 &
curl -s https://studio.example.fr/readyz
```

Chaque section ci-dessous dit quelle ligne ou quelle réponse distingue son cas.

<a name="fix"></a>

## Correction

<a name="deploy-503"></a>

### 503 pendant un déploiement

<!-- step: deploy-503 -->
1. Une 503 avec `Retry-After: 2` pendant que `/readyz` dit `"writes":"waiting"` et que les journaux montrent une
   nouvelle instance avant sa ligne `lease-taken`, c’est la passation du redéploiement : 10 à 16 s après la passation,
   environ une minute en tout, et environ 2 min 30 pour le premier déploiement vers la 4.2.3 ou plus depuis une version
   plus ancienne. Le Studio retente l’écriture avec le même identifiant d’opération et elle est appliquée une fois.
   Rien à corriger ; prévenez les membres avant de déployer ([Redéploiements](clever.redeploys.md)). Si cela dure plus
   de 2 min 30, regardez PostgreSQL ([Worker, PostgreSQL ou Cellar en panne](clever.dependency-down.md)).

<a name="connections"></a>

### Connexions épuisées

<!-- step: connections -->
2. « too many connections » (`leases-read-failed`, `reconcile-failed`, `ship-failed`) pendant un déploiement vient de
   deux instances, environ 4 connexions chacune, sur un plan de 5. Prenez un plan PostgreSQL avec plus de connexions
   ([Applications et add-ons](clever.apps-addons.md#postgresql-sizing)). Hors déploiement, cherchez des connexions que
   vous avez ouvertes vous-même (`psql`) sur le même add-on.

<a name="missing-cookie"></a>

### Cookie manquant

<!-- step: missing-cookie -->
3. Le cadre du jeu a besoin de son propre cookie de session, sur `playUrl`. Vérifiez que `publicUrl` et `playUrl` sont
   deux sous-domaines d’un même domaine à vous : deux noms en `*.cleverapps.io` sont deux sites, où seul un cookie
   partitionné (CHIPS) survit. WebKit sous Linux (GNOME Web) n’enregistre aucun cookie posé par un cadre d’un autre
   hôte, même sur un seul site : les cadres du jeu y restent vides quoi que vous fassiez. Un vrai Safari sous macOS et
   iOS n’a pas encore été essayé (la passe `studio-hosted`). Un cadre de jeu laissé inactif au-delà de sa session de
   15 minutes ne montre plus rien de nouveau : « Reload view » le rouvre
   ([Domaines et TLS](clever.domains-tls.md#why-one-domain)).

<a name="slow-preview"></a>

### Prévisualisation lente

<!-- step: slow-preview -->
4. Après chaque modification, le worker construit la tête ; une rafale de modifications ne construit que sa dernière
   révision, et la vue de la pièce montre pendant ce temps la dernière prévisualisation prête, avec sa révision. La
   ligne de journal `"event":"preview"` (depuis la 4.4.0) dit où passe le temps : `queuedMs`, `snapMs`, `jobMs`,
   `storeMs`, `sinceWriteMs`. Passez à la 4.4.0 ou plus si vous faites tourner une version plus ancienne :

> [!MEASURE id=preview-time]
> De l’écriture à la prévisualisation prête (`sinceWriteMs`), dix notes à 40 s d’intervalle : médiane 17,8 s et max
> 26,0 s sur la version instrumentée, médiane 5,6 s et max 11,7 s sur la version optimisée (fichiers stockés 8 à la
> fois). En 4.2.3, la prévisualisation prenait p50 34,1 s, p95 43,8 s par la même méthode, et sautait des révisions
> au-delà d’une modification toutes les 35 s.
> - date: 2026-10-22
> - version: 4.3.1
> - volume: dix révisions par série (436 à 445, puis 446 à 455)
> - conditions: déploiement de référence, studio et worker XS, région par ; moteur aux commits a3294282 puis b9336a4d, le travail de la 4.4.0 avant son tag (package.json disait 4.3.1) ; les chiffres de la 4.2.3 mesurés le 2026-10-19 sur le même déploiement, révisions 66 à 75
> - source: [QUALIF-4.2.3-REFERENCE.md §6 et sa note 4.4.0](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

   Le job du worker reste la part principale : il reconstruit le moteur à froid à chaque révision.

<a name="clock-skew"></a>

### Jobs refusés pour un décalage d’horloge

<!-- step: clock-skew -->
5. `the processing worker refused the job (403: the job has expired)` dans des lignes `health-failed` ou
   `preview-failed`, pour certains jobs et pas d’autres, venait sur le déploiement de référence de l’horloge de
   l’application studio en avance sur celle du worker : le Studio fixe l’expiration d’un job, le worker la vérifiait à
   la milliseconde. Depuis la 4.2.3 (#192), le worker tolère 30 s de décalage (`CLOCK_SKEW_MS`), consigne
   `worker-job-refused` avec sa raison, et le Studio reprend la raison (200 caractères au plus). Si vous le voyez
   encore : vérifiez que les deux applications sont à la même version, et lisez la ligne `worker-job-refused` du
   worker ; un décalage de plus de 30 s est à corriger côté plateforme.

> [!GUARANTEE id=job-clock-skew]
> Le worker accepte un job signé par un Studio dont l’horloge avance sur la sienne jusqu’à 30 s.

Il refuse toujours un job expiré, à la milliseconde, ou qui vivrait plus longtemps qu’un job plus le décalage.

<a name="silent-cron"></a>

### Tâche planifiée muette

<!-- step: silent-cron -->
6. La sauvegarde quotidienne tourne à 03:17 UTC depuis `clevercloud/cron.json`, et son script ne fait rien, sans rien
   dire, quand :
   - l’application studio ne définit pas `STUDIO_BACKUP_CRON=1`, ou n’a pas été redéployée ni redémarrée depuis ;
   - `INSTANCE_NUMBER` ne vaut pas `0` (une autre instance, ou Clever n’a pas dit laquelle c’est) ;
   - l’application a été installée depuis les archives de la release, qui ne portent pas le script : ajoutez le vôtre
     ([Sauvegardes](clever.backups.md#from-archives)), qui commence par `#!/bin/bash -l` (sans lui, une tâche tourne
     sans environnement) et utilise des chemins absolus (`$ROOT`).

   Lancez-le à la main dans `clever ssh` (`cd "$APP_HOME" && ops/studio/backup-cron.sh`) : il affiche sa ligne
   `"event":"backup"`, ou l’erreur qui l’arrête.

<a name="check-fixed"></a>

## Vérifier que c’est corrigé

`/readyz` à 200 avec `rpoMs` à 0 ; un enregistrement passe ; le jeu s’affiche dans la vue de la pièce et l’onglet
Jouer ; la ligne `"event":"preview"` suivante est courte ; le worker ne consigne aucun `worker-job-refused` ; le
lendemain matin a sa ligne `"event":"backup"`.

<a name="neighbours"></a>

## Cas voisins

- **409** sur un enregistrement : quelqu’un a écrit le même fichier depuis votre lecture
  ([Écriture refusée : base dépassée](team.write-refused-409.md)).
- **423** sur un enregistrement : un pan tenu par un autre membre ([Écriture refusée : pan verrouillé](team.write-refused-423.md)).
- **Une 503 du Reality Bridge** est l’indisponibilité du Bridge lui-même, un autre service : voir les pages du Bridge
  ([Dépannage du Bridge](bridge.troubleshooting.md)).
- Un worker, une base, un bucket ou un fournisseur en panne : [Worker, PostgreSQL ou Cellar en panne](clever.dependency-down.md).
