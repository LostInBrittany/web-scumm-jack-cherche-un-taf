# Worker, PostgreSQL ou Cellar en panne

Le Studio dépend de quatre services en plus de lui-même : l’application worker, l’add-on PostgreSQL, le bucket Cellar
et le fournisseur OpenID. Cette page dit, pour chacun, ce que voient les membres quand il est en panne, ce qui est en
jeu, et comment reprendre. Aucune de ces pannes n’a été provoquée sur le déploiement de référence : les effets
ci-dessous sont lus dans le code.

<a name="symptom"></a>

## Symptôme

| Ce que voient les membres | Le plus souvent |
|---|---|
| Enregistrements refusés en 503 « the edit cannot be judged now: … » ; la santé de l’en-tête reste grise ; la vue de la pièce garde une prévisualisation plus ancienne | Le worker |
| Chaque enregistrement refusé en 503 « this instance does not serve writes yet; try again » ; `/readyz` en 503 `"writes":"waiting"` ; des lectures qui échouent aussi | PostgreSQL |
| L’enregistrement de nouvelles images ou de nouveaux sons échoue ; les prévisualisations échouent ; `rpoMs` grandit sur `/readyz` | Cellar |
| Les connexions échouent ; au bout d’un moment, 503 « the identity provider cannot be reached: the session is suspended » | Le fournisseur |

<a name="causes"></a>

## Causes possibles

- **Le worker** : l’application arrêtée, plantée ou en redéploiement ; son `WORKER_PUBLIC_KEY` ou son `WORKER_INSTANCE`
  qui ne correspondent pas à la clé du Studio ou à `worker.instance` (403 « the job is for another instance », ou une
  signature refusée) ; ses files pleines (8 jobs chacune, puis 429) ; les deux applications à des versions différentes
  pendant une mise à jour.
- **PostgreSQL** : l’add-on en panne ou en maintenance ; ses connexions épuisées (« too many connections », le plan DEV
  pendant un redéploiement).
- **Cellar** : le service injoignable, le bucket supprimé, ou ses identifiants changés.
- **Le fournisseur** : l’add-on Keycloak en panne, ou le secret client changé chez le fournisseur sans l’être dans le
  Studio.

<a name="diagnosis"></a>

## Diagnostic

```sh
# sur votre machine
curl -s https://studio.example.fr/readyz
```

`"writes":"waiting"` veut dire que cette instance ne tient pas le bail de service : PostgreSQL d’abord (ou un
redéploiement). Un `rpoMs` qui grandit veut dire que le journal n’atteint pas le bucket : Cellar.

```sh
# sur votre machine, dans le dépôt du moteur ; arrêtez-le par son numéro de processus une fois lu
clever logs --alias my-game-studio > studio.log 2>&1 &
clever logs --alias my-game-worker > worker.log 2>&1 &
```

| Ligne de journal | Désigne |
|---|---|
| `health-failed` ou `preview-failed` avec « the processing worker refused the job (403: …) » | Le worker refuse : lisez la raison (clés, instance, expiration) |
| `worker-job-refused` dans le journal du worker | La même chose, côté worker |
| `leases-read-failed`, `reconcile-failed`, « too many connections » | Les connexions de PostgreSQL |
| `ship-failed` avec un message `S3` | Cellar |
| `lease-lost` sans `lease-taken` ensuite | PostgreSQL : l’instance n’a pas pu renouveler |

La console de Clever Cloud montre l’état de chaque add-on ; `clever status --alias my-game-worker` montre les instances
du worker.

<a name="fix"></a>

## Correction

<!-- step: worker -->
1. **Le worker.** Redémarrez-le (`clever restart --alias my-game-worker`) et vérifiez que sa clé et son nom d’instance
   correspondent à ceux du Studio ([Configuration](clever.configuration.md#steps), étape 6). Pendant ce temps : les
   écritures qui demandent une vérification sont refusées plutôt que laissées passer (le Studio échoue fermé) ; les
   écritures dans `notes.json`, le storyboard, `voices.json`, `playtests/`, `art/`, `audio/` et `private/` ne demandent
   pas de vérification et passent toujours ; prévisualisations, santé, Préparer et découpes attendent. Rien de
   confirmé n’est perdu.

<!-- step: postgres -->
2. **PostgreSQL.** Une instance qui ne peut pas renouveler son bail cesse d’écrire à sa propre horloge sous 30 s ; rien
   n’est écrit à moitié. Quand l’add-on revient, l’instance reprend le bail et les écritures reprennent. Si la base est
   perdue, restaurez la dernière sauvegarde dans un nouvel add-on et rejouez le journal
   ([exercice de restauration](clever.restore-drill.md)) : ce qui est perdu, c’est ce qui n’était pas encore expédié
   ([RPO](clever.rpo-rto.md)).

<!-- step: cellar -->
3. **Cellar.** Les opérations confirmées restent dans PostgreSQL ; leur expédition vers le bucket est retentée toutes
   les 30 s (`ship-failed`), et `rpoMs` grandit pendant ce temps : si la base était perdue maintenant, ces opérations le
   seraient. Quand Cellar revient, le journal rattrape son retard et `rpoMs` revient à 0. La sauvegarde quotidienne
   échoue tant que le bucket est injoignable : faites-en une à la main une fois qu’il est revenu
   ([Sauvegardes](clever.backups.md#steps)). Si le bucket est perdu, seule votre copie faite ailleurs peut restaurer le
   jeu.

<!-- step: provider -->
4. **Le fournisseur.** Les sessions continuent jusqu’à R (15 min) après leur dernière vérification, puis sont
   suspendues (503) jusqu’à ce que le fournisseur réponde ; les nouvelles connexions échouent jusque-là. Faites revenir
   le fournisseur ; si son secret client a changé, posez le même dans le Studio
   ([Renouveler les clés](clever.key-rotation.md#oidc-secret)).

> [!LIMIT id=not-provoked]
> Aucune de ces pannes n’a été provoquée sur une installation réelle : le comportement est lu dans le code (la garde
> qui échoue fermée, le bail, les nouvelles tentatives d’expédition, la suspension des sessions), et les durées sont
> les constantes du code, pas des observations.

<a name="check-fixed"></a>

## Vérifier que c’est corrigé

`/readyz` répond 200 avec `rpoMs` revenu à 0 ; un enregistrement passe à la révision suivante ; la santé de l’en-tête
redevient verte et une prévisualisation se construit ; un membre peut se connecter.

<a name="neighbours"></a>

## Cas voisins

- **Un 503 pendant un déploiement** est la passation du bail, pas une panne : il dure de quelques secondes à environ
  une minute ([Redéploiements](clever.redeploys.md)).
- **Un 423** est un pan tenu par un autre membre, pas un service en panne
  ([Écriture refusée : pan verrouillé](team.write-refused-423.md)).
- **Un 409** est une révision de base dépassée ([Écriture refusée : base dépassée](team.write-refused-409.md)).
- Les autres symptômes sur Clever (un cookie qui manque, une prévisualisation lente, un décalage d’horloge, une tâche
  planifiée muette) : [Dépannage](clever.troubleshooting.md).
