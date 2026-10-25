# RPO et RTO

Deux chiffres disent ce qu’un Studio hébergé peut perdre et combien de temps il peut rester à l’arrêt : le RPO
(l’objectif de point de reprise, les modifications qu’une reprise peut perdre) et le RTO (l’objectif de temps de
reprise, la durée de la reprise). Cette page définit les deux pour le Studio Server, dit comment chacun se mesure sur
votre installation, et les rattache aux mesures du déploiement de référence. Ce sont des observations, jamais des
promesses.

<a name="why"></a>

## Pourquoi

Une équipe écrit le jeu ensemble, toute la journée. Si la base est perdue, la question n’est pas de savoir si une
sauvegarde existe, mais quelles modifications reviennent, et quand on peut écrire de nouveau. Le Studio Server y répond
par deux mécanismes, chacun lié à un chiffre :

- **Le journal expédié vers le bucket** borne le RPO. Chaque opération confirmée est copiée dans Cellar en segment
  immuable, dans l’ordre, dès qu’elle est écrite (un échec est retenté sous 30 s).
- **La sauvegarde quotidienne plus le rejeu** bornent le RTO. Une restauration écrit la dernière sauvegarde dans une
  nouvelle base, puis rejoue chaque segment expédié depuis ([exercice de restauration](clever.restore-drill.md)).

<a name="rpo"></a>

## Le RPO, défini

**Ce qu’une restauration peut perdre, ce sont les opérations confirmées mais pas encore expédiées vers le bucket au
moment où la base a été perdue.** À tout instant, c’est l’âge de la plus ancienne opération pas encore expédiée :

- `GET /readyz` le donne en `rpoMs` (0 quand tout est expédié) ;
- avec les métriques, `studio_journal_rpo_seconds` dit la même chose ([Supervision](clever.monitoring.md)).

La cible est une minute (D42) : surveillée, avec une alerte au-delà de 60 s pendant 5 min, jamais promise.

> [!MEASURE id=rpo-observed]
> RPO observé : 0. Deux notes écrites après la sauvegarde (révisions 64 et 65) ont toutes deux été rejouées par la
> restauration ; `rpoMs` est revenu à 0 moins de 2 s après chaque écriture.
> - date: 2026-10-19
> - version: 4.2.2
> - volume: une sauvegarde à la révision 63, 2 opérations écrites après elle, tête 65
> - conditions: phase B du déploiement de référence, moteur au commit c66fbf56 avant le tag 4.2.3 (package.json disait 4.2.2) ; un seul membre qui écrit ; organisation Clever Cloud de test, région par ; PostgreSQL DEV, Cellar S
> - source: [QUALIF-4.2.3-REFERENCE.md §3 et §4](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

> [!LIMIT id=bucket-loss]
> Le RPO ci-dessus vaut pour la perte de la base. Si le bucket est perdu aussi, les blobs, le journal et les
> sauvegardes partent avec lui : ce que vous pouvez récupérer, c’est votre dernière copie du bucket faite ailleurs
> ([Sauvegardes](clever.backups.md#steps), étape 4), et le RPO est l’âge de cette copie.

<a name="rto"></a>

## Le RTO, défini

**Le temps qui sépare la décision de restaurer du moment où le Studio sert de nouveau les écritures** (`/readyz` à 200
sur la base restaurée). Il s’additionne :

1. créer un nouvel add-on PostgreSQL (non mesuré) ;
2. télécharger la dernière sauvegarde (non mesuré) ;
3. la restauration avec son rejeu ;
4. faire pointer l’application studio sur le nouvel add-on (`clever service link-addon`, en déliant celui qui est
   perdu) et redéployer (un déploiement du studio a pris de 29 s à 1 min 29 s au déploiement de référence, migrations
   comprises) ;
5. la nouvelle instance qui prend le bail de service.

Seule l’étape 3 est mesurée :

> [!MEASURE id=restore-step]
> L’étape de restauration, depuis la machine du mainteneur : 28,7 s (une sauvegarde à la révision 1, 508 lignes, rien
> à rejouer), puis 59,7 s (une sauvegarde à la révision 63, 593 lignes, 2 opérations rejouées). Le rapport ne dit pas
> d’où vient l’écart.
> - date: 2026-10-19
> - version: 4.2.2
> - volume: 508 lignes ; puis 593 lignes et 2 opérations rejouées
> - conditions: organisation Clever Cloud de test, région par ; PostgreSQL plan DEV, Cellar plan S ; lancée depuis une machine à Paris, démarrage de `tsx` compris ; moteur aux commits 52e68932 puis c66fbf56 avant le tag 4.2.3 (package.json disait 4.2.2) ; un échantillon chacun
> - source: [QUALIF-4.2.3-REFERENCE.md §4](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

> [!LIMIT id=rto-not-measured]
> Aucun RTO complet n’a été mesuré : les exercices ont restauré dans une base à côté, sans jamais y basculer la
> production. Chronométrez votre propre exercice de bout en bout, à la taille de votre jeu, et notez-le dans vos
> relevés : c’est votre RTO, à cette date.

<a name="not-loss"></a>

## Ce qui n’est pas une perte

- **Un redéploiement** refuse les écritures un moment (503 avec `Retry-After`) et n’en perd aucune : une écriture
  retentée avec son identifiant d’opération est appliquée une fois ([Redéploiements](clever.redeploys.md)).
- **Une restauration déconnecte tout le monde** (les sessions ne sont pas dans une sauvegarde), et les brouillons
  encore dans le navigateur d’un membre n’ont jamais été confirmés : ils ne font pas partie du RPO, et le Studio garde
  un brouillon refusé dans l’éditeur.

<a name="alternatives"></a>

## Les autres possibilités écartées

- **Les seules sauvegardes de PostgreSQL.** Elles restaureraient les tables, sans les lier au contenu des fichiers dans
  Cellar au même instant. La sauvegarde du Studio liste les blobs qu’elle nomme et refuse de restaurer quand l’un
  manque.
- **Une réplique continue.** Non proposée : une instance, une base, et le journal expédié vers le bucket à la place.

<a name="trade-offs"></a>

## Les compromis

- Le journal et les sauvegardes partagent le bucket avec les contenus : un seul endroit à perdre. Copiez-le ailleurs.
- Le RPO dépend de Cellar joignable : tant qu’il ne l’est pas, `rpoMs` grandit ([Worker, PostgreSQL ou Cellar en
  panne](clever.dependency-down.md)).
- Les mesures viennent d’un petit jeu et d’un seul membre qui écrit, sur l’organisation de test : pas d’une charge de
  production.

<a name="decisions"></a>

## Décisions et ADR

- D42 (la cible de RPO d’une minute, une sauvegarde complète par jour) : [`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md).
- [ADR 0025, le Studio Server](../../docs/dev/adr/0025-studio-server.md) ; les mesures :
  [`docs/dev/QUALIF-4.2.3-REFERENCE.md`](../../docs/dev/QUALIF-4.2.3-REFERENCE.md).
- Les procédures : [Sauvegardes](clever.backups.md), [Exercice de restauration](clever.restore-drill.md).
