# Supervision

Ce qu’il faut surveiller sur un Studio hébergé, et comment : les sondes, les métriques Prometheus derrière un jeton,
les journaux, et les alertes qui doivent atteindre une personne.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un collecteur qui lit `/metrics` avec son jeton, une sonde sur `/readyz`, les notifications de déploiement de Clever
Cloud, et six alertes envoyées à une personne : aucune instance ne sert les écritures, le journal ne s’expédie plus, le
worker s’engorge, des jobs échouent, des membres s’attendent les uns les autres, la sauvegarde quotidienne manque.

<a name="context-and-versions"></a>

## Contexte et versions

- Un Studio hébergé sur Clever Cloud. `/metrics` et `STUDIO_METRICS_TOKEN` existent depuis la 4.2.3 ; les métriques et
  champs de journal par phase de la prévisualisation depuis la 4.4.0.
- **Vérifié sur : 19 octobre 2026, par le déploiement de référence, pour la route seulement** (commit du moteur
  c66fbf56, package.json 4.2.2 avant le tag 4.2.3) : `/metrics` a répondu 401 sans jeton ou avec un mauvais, 200 avec
  lui (`text/plain; version=0.0.4`), et 401 sur l’origine du jeu. **Non vérifié** : aucun collecteur ni aucune alerte
  n’ont été posés sur l’organisation de test, et aucune alerte n’a été déclenchée exprès.

<a name="prerequisites"></a>

## Prérequis

- `STUDIO_METRICS_TOKEN` posé sur l’application studio, 32 caractères ou plus ([Configuration](clever.configuration.md#steps)).
- Un collecteur que vous faites tourner (Prometheus et son Alertmanager, ou tout service qui lit le format texte de
  Prometheus), ou au moins une sonde HTTP. Clever Cloud ne lit pas `/metrics`.

<a name="where-to-run"></a>

## Où lancer les commandes

`clever notify-email`, `clever logs` : sur votre machine, dans le dépôt du moteur où les applications sont liées. Le
collecteur : sur une machine à vous qui joint `https://studio.exemple.fr`.

<a name="steps"></a>

## Étapes

<!-- step: check-route -->
1. Vérifiez que la route répond avec le jeton, sans l’afficher :

   ```sh
   # sur votre machine, le jeton dans un fichier 0600
   curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $(cat ~/secrets/my-game/metrics-token)" https://studio.example.fr/metrics
   ```

   200 avec le jeton ; 401 sans ou avec un autre (comparé en temps constant) ; 404 quand l’application n’a pas de
   `STUDIO_METRICS_TOKEN` (la route n’existe pas). Elle n’est jamais derrière la session, ni sur l’origine du jeu, où
   toute requête sans la session du jeu est refusée avant que son chemin soit lu (401, « open the game from the
   Studio »).

> [!GUARANTEE id=metrics-token-required]
> `/metrics` ne répond qu’à `Authorization: Bearer <STUDIO_METRICS_TOKEN>` : sans le jeton ou avec un autre, un 401,
> le jeton comparé en temps constant.

<!-- step: scrape -->
2. Pointez votre collecteur dessus, avec le jeton comme identifiant Bearer. Pour Prometheus :

   ```yaml
   # prometheus.yml, sur la machine qui fait tourner Prometheus
   scrape_configs:
     - job_name: my-game-studio
       scheme: https
       metrics_path: /metrics
       authorization:
         type: Bearer
         credentials_file: /etc/prometheus/my-game-metrics-token
       static_configs:
         - targets: ['studio.example.fr']
   ```

<!-- step: notify -->
3. Faites-vous prévenir par Clever Cloud des déploiements en échec (des webhooks aussi : `clever webhooks add`) :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever notify-email add --notify you@example.fr --event DEPLOYMENT_FAIL studio-deploys
   ```

   La console de Clever montre aussi le CPU, la mémoire et les journaux de chaque application.

<!-- step: alerts -->
4. Posez les alertes, vers une personne :
   - `/readyz` n’est pas 200 pendant **2 min** : aucune instance ne sert les écritures. Un redéploiement le tient en 503
     12 à 20 s, le premier déploiement vers la 4.2.3 ou plus environ 2 min 30 : attendez-vous alors à l’alerte
     ([Redéploiements](clever.redeploys.md)).
   - `studio_journal_rpo_seconds` au-dessus de **60 pendant 5 min** (la cible est 1 min, D42), ou `ship-failed` ne
     cesse de monter.
   - `studio_worker_jobs_in_flight` au-dessus de **3 pendant 10 min** : le worker fait un job à la fois par file, deux
     files, donc le travail s’accumule.
   - Des jobs échouent : `studio_worker_job_seconds_count{outcome!="ok"}` monte, ou `health-failed`.
   - `studio_lease_conflicts_total` fait un bond : des personnes s’attendent sur leurs pans. Pas une panne, un signe à
     regarder.
   - La ligne de la sauvegarde quotidienne (`"event":"backup"`) manque un matin dans les journaux.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Le collecteur montre la cible joignable, `studio_service_lease_held` à 1 et `studio_journal_rpo_seconds` à 0 quand
personne n’écrit. Pour éprouver le chemin jusqu’à une personne, déclenchez une alerte exprès (arrêtez l’application
studio quelques minutes en heure creuse, ou baissez un seuil) et chronométrez le temps qu’elle met à vous parvenir :
ce projet ne l’a pas mesuré.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| 404 sur `/metrics` | Pas de `STUDIO_METRICS_TOKEN` sur l’application studio, ou pas de redéploiement depuis | Posez-le, redéployez |
| 401 `the metrics need their token` | Mauvais jeton, ou `play.` au lieu de `studio.` | L’origine du Studio et le bon fichier |
| `STUDIO_METRICS_TOKEN: 32 characters at least` et le serveur ne démarre pas | Un jeton trop court | `openssl rand -base64 32` |
| Les compteurs retombent à zéro | Un redémarrage ou un redéploiement : les métriques vivent dans la mémoire de l’instance | Lisez-les avec `rate()`, qui le traite comme une remise à zéro de compteur |

<a name="files-changed"></a>

## Fichiers ou données modifiés

La configuration de votre collecteur et le fichier du jeton sur sa machine ; les réglages de notification de Clever
Cloud. Rien dans le Studio.

<a name="recovery"></a>

## Reprise ou retour arrière

Retirez le jeton (`clever env rm STUDIO_METRICS_TOKEN --alias my-game-studio`, puis redéployez) : la route disparaît
(404). Le changer, c’est [Renouveler les clés](clever.key-rotation.md#metrics-token).

<a name="metrics"></a>

## Référence : les métriques

Ce sont des comptes et des durées : aucun chemin, aucun nom, aucun auteur, aucun contenu. Elles vivent dans la mémoire
de l’instance : un redémarrage les remet à zéro. La file propre du worker n’est pas mesurée de son côté : celle du
Studio l’est.

| Métrique | Quoi |
|---|---|
| `studio_journal_operation_seconds{outcome}` | les opérations du journal, de la demande à la réponse (`confirmed`, `replayed`, `refused`, `failed`) |
| `studio_worker_jobs_in_flight` | les jobs demandés au worker et pas encore répondus : la file vue du Studio |
| `studio_worker_job_seconds{kind,outcome}` | les jobs du worker par sorte (`validate`, `load`, `preview`, `prepare`, `lint`, `solve`, `playtests`) et issue (`ok`, `failed`, `timeout`, `error`) |
| `studio_lease_conflicts_total` | les 423 répondus : le pan de quelqu’un d’autre, ou un bail terminé |
| `studio_preview_build_seconds{outcome}` | la prévisualisation d’une révision, la construction sur le worker et les fichiers stockés, après l’instantané (`built`, `failed`) |
| `studio_preview_phase_seconds{phase}` | depuis la 4.4.0, une prévisualisation par phase : `queued` (de l’écriture au début de la construction : le regroupement, une construction avant elle, les nouvelles tentatives), `snapshot`, `job` (le job du worker tel que le Studio l’attend, sa file sur le worker comprise), `store`, et `since_write` (de l’écriture à la prévisualisation prête) |
| `studio_worker_job_phase_seconds{kind,phase}` | depuis la 4.4.0, un job par phase tel que le Studio le mène : `put` (l’instantané déposé), `post` (la réponse du worker), `get` (le résultat lu), `del` (le dépôt effacé) |
| `studio_health_judgement_seconds{verdict}` | le verdict de santé sur une révision |
| `studio_journal_rpo_seconds` | l’âge de la plus ancienne opération pas encore expédiée au bucket (le `rpoMs` de `/readyz`) |
| `studio_journal_revision`, `studio_service_lease_held` | la tête, et si cette instance sert les écritures (1) |
| `studio_http_responses_total{class}`, `studio_log_events_total{event}` | les réponses par classe de statut ; les échecs consignés (`ship-failed`, `health-failed`, `reconcile-failed`, `error`…) |

OpenTelemetry n’est pas pris en charge (laissé pour plus tard en 4.2.3, et la 4.4.0 ne l’a pas ajouté).

<a name="probes"></a>

## Référence : les sondes et les journaux

- `GET /livez` : 200 tant que le processus répond. `GET /startz` : 200 une fois le serveur démarré (la vérification
  de santé de Clever). `GET /readyz` : 200 quand cette instance tient le bail de service et sert les écritures, 503
  (`"writes":"waiting"`) sinon, avec `rpoMs`. Aucune ne demande de session ni ne donne de données.
- Les journaux sont une ligne JSON par événement, sur la sortie standard (`clever logs`) : `request` (méthode, chemin,
  statut, ms), `lease-taken`, `lease-lost`, `backup`, `ship-failed`, `health-failed`, `preview-failed`, et depuis la
  4.4.0 une ligne `"event":"preview"` avec `queuedMs`, `snapMs`, `jobMs`, `storeMs` et `sinceWriteMs`, une ligne
  `"event":"worker-call"` par job (côté Studio) avec `putMs`, `postMs`, `getMs` et `delMs`, et la ligne `worker-job` du
  worker lui-même avec `queueMs` (de la réception de son POST au début de son exécution), `fetchMs`, `unpackMs`,
  `childMs` et `putMs`. Le worker consigne un job refusé en `worker-job-refused`, avec sa raison.
- `clever logs` suit jusqu’à ce qu’on l’arrête, même avec `--until` : lancez-le en arrière-plan et arrêtez-le par son
  numéro de processus.

<a name="references"></a>

## Références

- [`studio-server/src/server/metrics.ts`](../../studio-server/src/server/metrics.ts),
  [`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts) ; le test :
  [`tests/studio-metrics.test.ts`](../../tests/studio-metrics.test.ts).
- [`STUDIO_METRICS_TOKEN`](reference.environment-variables.md#studio-metrics-token) ; pour les membres :
  [Routes de santé et de métriques](team.health-metrics.md).
- [`docs/dev/QUALIF-4.2.3-REFERENCE.md`](../../docs/dev/QUALIF-4.2.3-REFERENCE.md) §2.
