# Redéploiements

Sur Clever Cloud, un déploiement (ou un push, ou `clever restart`) démarre la nouvelle instance pendant que l’ancienne
sert encore. Le Studio Server est fait pour ce chevauchement : aucune écriture n’est perdue, mais les écritures sont
lentes ou refusées pendant environ une minute. Cette page dit pourquoi, ce qui a été mesuré, et comment déployer sans
surprendre les membres.

<a name="why"></a>

## Pourquoi

Le spike S l’a mesuré le 17 octobre 2026 : pendant `clever restart --without-cache`, la nouvelle instance a démarré
alors que l’ancienne répondait encore, et l’ancienne n’a jamais consigné de SIGTERM. Deux instances qui écrivent le
même jeu en même temps corrompraient son histoire, et attendre un signal qui ne vient pas bloquerait la bascule. Donc :

- Les instances partagent un **bail de service** dans PostgreSQL : celle qui le tient sert les écritures. Il dure 30 s
  et se renouvelle toutes les 10 s à l’horloge de la base ; une instance qui ne peut pas le renouveler cesse d’écrire
  à sa propre horloge avant que les 30 s puissent passer.
- La nouvelle instance démarre, répond à `/startz` (la vérification de santé de Clever,
  `CC_HEALTH_CHECK_PATH=/startz`), puis attend : `/readyz` est en 503 (`"writes":"waiting"`) et ses écritures en 503
  avec `Retry-After: 2` (« this instance does not serve writes yet; try again »).
- **La passation (depuis la 4.2.3).** Dès qu’elle écoute, la nouvelle instance demande le bail ; le détenteur le rend à
  son renouvellement suivant (10 s au plus) et consigne `{"event":"lease-lost",…}` ; la nouvelle consigne
  `{"event":"lease-taken",…}`. Une instance plus ancienne ne reprend jamais le bail à une plus récente.
- Un client retente une écriture refusée avec le même identifiant d’opération (`X-Studio-Op`), et elle est appliquée
  une fois. Le bail propre du journal, avec sa clôture, empêche toujours deux instances d’écrire sur la même tête.

<a name="measured"></a>

## Ce qui a été mesuré

Clever Cloud garde l’ancienne instance `STOPPING` environ deux minutes, qui reçoit encore des requêtes jusqu’à la fin
du déploiement, et elle ne consigne aucune ligne `stopping`.

> [!MEASURE id=handoff-window]
> Entre deux versions qui rendent toutes deux le bail (deux `clever restart` du même commit) : `lease-taken` 6,0 s et
> 10,1 s après que la nouvelle instance écoute ; ensuite les écritures ont été en 503 (`Retry-After: 2`) pendant 16 s
> et 10 s, parce que Clever envoyait encore les requêtes à l’ancienne instance, qui n’avait plus le bail, jusqu’à la
> fin du déploiement. Avant cela, pendant le démarrage de la nouvelle, une écriture a attendu 10,2 s et 19,4 s sa
> vérification du journal et reçu un 503 elle aussi, puis est passée au réessai. Aucun 409, aucun 500, aucune écriture
> appliquée deux fois.
> - date: 2026-10-19
> - version: 4.2.2
> - volume: deux redéploiements, une sonde qui lit `/readyz` chaque seconde et écrit une note toutes les 3 s
> - conditions: déploiement de référence, application studio XS, une instance, PostgreSQL DEV, région par ; moteur au commit dd66b38d sur main avant le tag 4.2.3 (package.json disait 4.2.2) ; un échantillon par déploiement
> - source: [QUALIF-4.2.3-REFERENCE.md §5 bis](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

En tout, environ une minute d’écritures lentes ou refusées par déploiement, aucune perdue.

> [!MEASURE id=first-deploy-onto-handoff]
> Le premier déploiement vers une version qui porte la passation, depuis une version qui ne la porte pas (4.2.2, ou un
> commit de 4.2.3 avant #183) : l’ancienne version a gardé le bail jusqu’à ce que Clever l’arrête, et les écritures
> ont été refusées pendant 2 min 23 s et 2 min 27 s, les lectures continuant.
> - date: 2026-10-19
> - version: 4.2.2
> - volume: deux déploiements (52e68932 → c66fbf56, puis c66fbf56 → dd66b38d), la même sonde
> - conditions: déploiement de référence, application studio XS, PostgreSQL DEV, région par ; commits du moteur sur main avant le tag 4.2.3 (package.json disait 4.2.2)
> - source: [QUALIF-4.2.3-REFERENCE.md §5 et §5 bis](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

Pendant que les deux instances tournent, elles tiennent deux fois plus de connexions : sur le plan PostgreSQL DEV (5),
le travail de fond échoue sur « too many connections » à chaque déploiement, et une écriture d’une version plus
ancienne pouvait en échouer (un 500). Prenez un plan plus grand pour un déploiement dont on se sert
([Applications et add-ons](clever.apps-addons.md#postgresql-sizing)).

<a name="procedure"></a>

## Déployer sans surprendre l’équipe

**Vérifié sur : 19 octobre 2026** (les mesures ci-dessus ; commits du moteur avant le tag 4.2.3, package.json 4.2.2).
Le texte de cette page lui-même n’est pas vérifié sur une installation réelle.

<!-- step: warn -->
1. Prévenez les membres, ou choisissez un moment calme : environ une minute d’écritures lentes ; environ deux minutes
   et demie d’écritures refusées pour le premier déploiement vers la 4.2.3 ou plus depuis une version plus ancienne.

<!-- step: deploy -->
2. Déployez depuis votre machine, dans le dépôt du moteur, le worker d’abord quand les deux changent :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever deploy --alias my-game-worker
   clever deploy --alias my-game-studio
   ```

<!-- step: watch -->
3. Regardez `/readyz` revenir à 200 et la ligne `lease-taken` (son `instance` est la nouvelle) :

   ```sh
   # sur votre machine
   until curl -sf https://studio.example.fr/readyz; do sleep 2; done
   ```

<!-- step: one-write -->
4. Faites une écriture (une note) et voyez-la enregistrée, à la révision suivante.

> [!LIMIT id=client-retry]
> « Aucune perdue » vaut pour un client qui retente un 503 avec le même identifiant d’opération. Le Studio dans le
> navigateur le fait, jusqu’à 8 essais avec des attentes qui montent à 8 s (environ 40 s en tout) : une fenêtre plus
> longue (le premier déploiement vers la passation) finit donc par un refus qu’il affiche. Les outils du MCP local
> pointés sur un Studio hébergé envoient un identifiant d’opération mais ne retentent pas : ils rapportent le 503, et
> l’on relance l’outil. Un script à vous qui ne retente pas perd l’écriture envoyée pendant la fenêtre.

<a name="alternatives"></a>

## Les autres possibilités écartées

- **Compter sur SIGTERM** pour passer le bail : Clever ne l’a jamais délivré de façon observable (spike S, déploiement
  de référence).
- **Arrêter l’ancienne instance d’abord** (`clever stop`, puis déployer) : une minute ou plus sans Studio du tout.
  Gardé pour un seul cas, une migration qui change ce que lit l’ancienne version
  ([Mettre à jour le serveur](clever.upgrade-server.md)).
- **Plusieurs instances qui servent à la fois** : le journal demande un seul écrivain par jeu.

<a name="trade-offs"></a>

## Les compromis

La passation réduit la fenêtre de refus de plusieurs minutes à quelques secondes, mais le routage de Clever vers
l’ancienne instance jusqu’à la fin du déploiement garde 10 à 16 s de 503. Une alerte sur `/readyz` doit le tolérer
([Supervision](clever.monitoring.md)).

<a name="decisions"></a>

## Décisions et ADR

- Le bail : [`studio-server/src/server/service-lease.ts`](../../studio-server/src/server/service-lease.ts) (plan
  maître §4, P8) ; [ADR 0025](../../docs/dev/adr/0025-studio-server.md).
- Les mesures : [`docs/dev/SPIKE-4.2.1-CLEVER.md`](../../docs/dev/SPIKE-4.2.1-CLEVER.md) §2,
  [`docs/dev/QUALIF-4.2.3-REFERENCE.md`](../../docs/dev/QUALIF-4.2.3-REFERENCE.md) §5 et §5 bis.
- Un 503 vu par un membre : [Dépannage](clever.troubleshooting.md#deploy-503).
