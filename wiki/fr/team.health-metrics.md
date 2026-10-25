# Routes de santé et de métriques

Le Studio Server répond à trois sondes, sert des métriques Prometheus derrière un jeton à elles, et juge la santé du
jeu à chaque révision. Cette page est la référence de ces routes, de chaque métrique, et des lignes de journal qui
mesurent un aperçu. Comment alerter dessus : [Supervision](clever.monitoring.md).

<a name="probes"></a>

## Les sondes : `/livez`, `/startz`, `/readyz`

Sans session, sans données, sur l'origine du Studio.

| Route | Répond |
|---|---|
| `GET /livez` | toujours 200 `{"ok": true}` tant que le processus répond |
| `GET /startz` | 200 `{"ok": true}` une fois que le serveur écoute, 503 avant (le `CC_HEALTH_CHECK_PATH` de Clever Cloud) |
| `GET /readyz` | 200 `{"ok": true, "writes": "served", "rpoMs": n}` quand cette instance tient le bail de service et sert les écritures ; 503 `{"ok": false, "writes": "waiting", …}` sinon |

`rpoMs` est l'âge, en millisecondes, de la plus ancienne opération confirmée pas encore expédiée au bucket : 0 quand
tout est expédié, `null` quand il ne peut pas être lu. Il est mesuré, jamais dit nul quand il ne l'est pas ; la cible
est d'une minute (D42). Voir [RPO et RTO](clever.rpo-rto.md).

Pendant un redéploiement, la nouvelle instance répond 200 à `/startz` et 503 à `/readyz` jusqu'à ce qu'elle prenne le
bail de service ; voir [Redéploiements](clever.redeploys.md).

<a name="worker-probes"></a>

## Les sondes du worker

`studio-worker` répond à `GET /livez` (200) et à `GET /readyz` : 200, ou 503 avec `recycle: true` dès qu'un job a
laissé un processus derrière lui, ce qui veut dire que l'instance doit être redémarrée.

<a name="metrics"></a>

## `GET /metrics`

### Forme

```sh
# n'importe où, avec le jeton donné à l'application studio
curl -H "Authorization: Bearer $STUDIO_METRICS_TOKEN" https://studio.example.fr/metrics
```

### Valeurs et défaut

- Seulement avec le secret `STUDIO_METRICS_TOKEN` défini (32 caractères ou plus, `openssl rand -base64 32`). Sans lui,
  la route **n'existe pas** : 404.
- Le format texte de Prometheus (version 0.0.4), en réponse à `Authorization: Bearer <jeton>`, comparé en temps
  constant. Un jeton absent ou faux : 401 avec `WWW-Authenticate: Bearer realm="metrics"`.
- Jamais derrière la session, et jamais sur l'origine du jeu, où toute requête sans la session du jeu est refusée avant
  que son chemin soit lu (401, « open the game from the Studio »).

### Ce qu'elle donne

| Métrique | Contenu |
|---|---|
| `studio_journal_operation_seconds{outcome}` | les opérations du journal, de la demande à la réponse (`confirmed`, `replayed`, `refused`, `failed`) |
| `studio_worker_jobs_in_flight` | les jobs demandés au worker et pas encore répondus : la file vue du Studio |
| `studio_worker_job_seconds{kind,outcome}` | les jobs du worker par sorte (`validate`, `load`, `preview`, `prepare`, `lint`, `solve`, `playtests`) et issue (`ok`, `failed`, `timeout`, `error`) |
| `studio_lease_conflicts_total` | les 423 répondues : le pan de quelqu'un d'autre, ou un bail terminé |
| `studio_preview_build_seconds{outcome}` | l'aperçu d'une révision : la construction sur le worker et les fichiers stockés, après l'instantané (`built`, `failed`) |
| `studio_preview_phase_seconds{phase}` | depuis la 4.4.0, un aperçu par phase : `queued` (de l'écriture au début de la construction : le regroupement, une construction avant elle, les nouvelles tentatives), `snapshot`, `job` (le job du worker tel que le Studio l'attend, sa file sur le worker comprise), `store`, et `since_write` (de l'écriture à l'aperçu prêt) |
| `studio_worker_job_phase_seconds{kind,phase}` | depuis la 4.4.0, un job par phase tel que le Studio le mène : `put` (l'instantané déposé), `post` (la réponse du worker), `get` (le résultat lu), `del` (le dépôt effacé) |
| `studio_health_judgement_seconds{verdict}` | le verdict de santé sur une révision |
| `studio_journal_rpo_seconds` | l'âge de la plus ancienne opération pas encore expédiée au bucket (le `rpoMs` de `/readyz`) |
| `studio_journal_revision`, `studio_service_lease_held` | la tête, et si cette instance sert les écritures (1) ou non (0) |
| `studio_http_responses_total{class}` | les réponses par classe de statut |
| `studio_log_events_total{event}` | les échecs consignés : `ship-failed`, `health-failed`, `reconcile-failed`, `prepared-start-failed`, `worker-staging-left`, `error` |

Les durées sont des histogrammes en secondes, avec des seaux de 5 ms à 300 s.

### Contraintes

Ce sont des comptes et des durées : aucun chemin, aucun nom, aucun auteur, aucun contenu. Elles vivent dans la mémoire
de l'instance : un redémarrage les remet à zéro (une remise à zéro de compteur, que `rate` de Prometheus lit comme
telle). La file propre du worker n'est pas mesurée de son côté : celle du Studio l'est.

> [!GUARANTEE id=metrics-404-without-token]
> Sans `STUDIO_METRICS_TOKEN` configuré, la route `/metrics` n'existe pas : elle répond 404.

> [!LIMIT id=no-opentelemetry]
> OpenTelemetry n'est pas pris en charge par le Studio Server ; il reste une option pour plus tard. La console de
> Clever Cloud ne lit pas `/metrics` : c'est un collecteur que vous faites tourner qui le fait (Prometheus et son
> Alertmanager, ou tout service qui lit le format).

<a name="log-lines"></a>
<!-- applies: 4.4.0.. -->

## Les lignes de journal qui mesurent un aperçu

Depuis la 4.4.0, les journaux (une ligne JSON chacune) en disent plus :

- `"event":"preview"` porte `queuedMs`, `snapMs`, `jobMs`, `storeMs` et `sinceWriteMs` ;
- `"event":"worker-call"` (une par job, côté Studio) porte `putMs`, `postMs`, `getMs` et `delMs` ;
- la ligne `worker-job` du worker lui-même porte `queueMs` (de la réception de son POST au début de son exécution),
  `fetchMs`, `unpackMs`, `childMs` et `putMs`.

D'autres lignes qu'un opérateur lit : `lease-taken` et `lease-lost` (avec `instance`), `listening`, `stopping`,
`request` (une par requête : méthode, chemin, statut, ms, client), `reconciled`, `backup`, `restored`.

<a name="game-health"></a>

## La santé du jeu par révision

Après chaque rafale de modifications, le worker juge la tête : le validateur, puis le solveur depuis une nouvelle
partie, 45 s au plus. Le verdict est gardé avec sa révision et envoyé sur le flux en direct (événements `health`) ;
l'en-tête du Studio l'affiche.

- **Quand une révision échoue là où la dernière jugée passait**, une bissection sur les révisions entre les deux nomme
  la première qui échoue, avec ce que son opération a fait et ses fichiers (jamais qui l'a faite), en ⌈log₂ n⌉
  jugements au plus.
- **Un dev peut demander une bissection** entre deux révisions jusqu'à la tête : `POST /api/health/bisect` avec
  `{"good": <rev>, "bad": <rev>}`. Elle répond `{rev, what, paths}`, ou une 400 avec la raison :
  `` `good` and `bad` are revisions, `good` before `bad` ``, `revision <bad> is past the head (<head>)`,
  `revision <good> does not pass`, `revision <bad> passes`, ou `… no revision can be named` quand un verdict est
  inconnu.
- **Un solveur interrompu dit « inconnu »**, jamais « valide », et arrête une bissection. Une révision qui n'a pas pu
  être jugée cinq fois dit « ne peut être jugée », avec sa raison.
- **Un verdict plus ancien est affiché en gris**, jamais en vert.
- Une passe de l'onglet Check retient les lectures de l'instance pendant que le worker exécute ses diagnostics : une
  écriture l'attend.

> [!LIMIT id=health-not-a-proof]
> La santé est un signal de qualité sur une exécution bornée (45 s de solveur), pas une preuve que le jeu peut être
> fini. Voir [Ce que prouve le solveur](create.solver-proofs.md).

<a name="related"></a>

## Identifiants liés

- `STUDIO_METRICS_TOKEN` : [Variables d'environnement](reference.environment-variables.md#studio-metrics-token).
- [Supervision](clever.monitoring.md) : les alertes conseillées. [Redéploiements](clever.redeploys.md).
- [`studio-server/src/server/metrics.ts`](../../studio-server/src/server/metrics.ts),
  [`studio-server/src/server/health.ts`](../../studio-server/src/server/health.ts).
