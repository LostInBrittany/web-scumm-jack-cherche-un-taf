# Health and metrics routes

The Studio Server answers three probes, serves Prometheus metrics behind a token of their own, and judges the game's
health at each revision. This page is the reference of those routes, of each metric, and of the log lines that
measure a preview. How to alert on them is [Monitoring](clever.monitoring.md).

<a name="probes"></a>

## The probes: `/livez`, `/startz`, `/readyz`

No session, no data, on the Studio's origin.

| Route | Answers |
|---|---|
| `GET /livez` | always 200 `{"ok": true}` while the process answers |
| `GET /startz` | 200 `{"ok": true}` once the server listens, 503 before (Clever Cloud's `CC_HEALTH_CHECK_PATH`) |
| `GET /readyz` | 200 `{"ok": true, "writes": "served", "rpoMs": n}` when this instance holds the service lease and serves writes; 503 `{"ok": false, "writes": "waiting", …}` otherwise |

`rpoMs` is the age, in milliseconds, of the oldest confirmed operation not shipped to the bucket yet: 0 when everything
is shipped, `null` when it cannot be read. It is measured, never said to be nil when it is not; the target is one
minute (D42). See [RPO and RTO](clever.rpo-rto.md).

During a redeploy the new instance answers `/startz` 200 and `/readyz` 503 until it takes the service lease; see
[Redeploys](clever.redeploys.md).

<a name="worker-probes"></a>

## The worker's probes

`studio-worker` answers `GET /livez` (200) and `GET /readyz`: 200, or 503 with `recycle: true` once a job left a
process behind, which means the instance should be restarted.

<a name="metrics"></a>

## `GET /metrics`

### Form

```sh
# anywhere, with the token the studio app was given
curl -H "Authorization: Bearer $STUDIO_METRICS_TOKEN" https://studio.example.fr/metrics
```

### Values and default

- Only with the secret `STUDIO_METRICS_TOKEN` set (32 characters or more, `openssl rand -base64 32`). Without it there
  is **no route**: 404.
- Prometheus' text format (version 0.0.4), answered to `Authorization: Bearer <token>`, compared in constant time. A
  missing or wrong token: 401 with `WWW-Authenticate: Bearer realm="metrics"`.
- Never behind the session, and never on the game's origin, where any request without the game's session is refused
  before its path is read (401, "open the game from the Studio").

### What it gives

| Metric | What |
|---|---|
| `studio_journal_operation_seconds{outcome}` | the journal's operations, from asked to answered (`confirmed`, `replayed`, `refused`, `failed`) |
| `studio_worker_jobs_in_flight` | the jobs asked of the worker and not answered yet: the queue as the Studio sees it |
| `studio_worker_job_seconds{kind,outcome}` | the worker's jobs by kind (`validate`, `load`, `preview`, `prepare`, `lint`, `solve`, `playtests`) and outcome (`ok`, `failed`, `timeout`, `error`) |
| `studio_lease_conflicts_total` | the 423s answered: someone else's span, or a lease that ended |
| `studio_preview_build_seconds{outcome}` | a revision's preview: the worker's build and the files stored, after the snapshot (`built`, `failed`) |
| `studio_preview_phase_seconds{phase}` | since 4.4.0, a preview by phase: `queued` (from the write to the build's start: the coalescing, a build before it, the retries), `snapshot`, `job` (the worker's job as the Studio waits for it, its queue on the worker included), `store`, and `since_write` (from the write to the preview ready) |
| `studio_worker_job_phase_seconds{kind,phase}` | since 4.4.0, a job by phase as the Studio runs it: `put` (the snapshot staged), `post` (the worker's answer), `get` (the result read), `del` (the staging deleted) |
| `studio_health_judgement_seconds{verdict}` | the health's verdict on a revision |
| `studio_journal_rpo_seconds` | the age of the oldest operation not shipped to the bucket (the `rpoMs` of `/readyz`) |
| `studio_journal_revision`, `studio_service_lease_held` | the head, and whether this instance serves writes (1) or not (0) |
| `studio_http_responses_total{class}` | the answers by status class |
| `studio_log_events_total{event}` | the failures logged: `ship-failed`, `health-failed`, `reconcile-failed`, `prepared-start-failed`, `worker-staging-left`, `error` |

The durations are histograms in seconds, with buckets from 5 ms to 300 s.

### Constraints

They are counts and durations: no path, no name, no author, no content. They live in the instance's memory, so a
restart starts them again from zero (a counter reset, which Prometheus' `rate` reads as such). The worker's own queue
is not measured from the worker: the Studio's side of it is.

> [!GUARANTEE id=metrics-404-without-token]
> Without `STUDIO_METRICS_TOKEN` configured there is no `/metrics` route: it answers 404.

> [!LIMIT id=no-opentelemetry]
> OpenTelemetry is not supported by the Studio Server; it stays an option for later. Clever Cloud's console does not
> read `/metrics`: a scraper you run does (Prometheus with its Alertmanager, or any service that reads the format).

<a name="log-lines"></a>
<!-- applies: 4.4.0.. -->

## The log lines that measure a preview

Since 4.4.0 the logs (one JSON line each) say more:

- `"event":"preview"` carries `queuedMs`, `snapMs`, `jobMs`, `storeMs` and `sinceWriteMs`;
- `"event":"worker-call"` (one per job, the Studio's side) carries `putMs`, `postMs`, `getMs` and `delMs`;
- the worker's own `worker-job` line carries `queueMs` (from its POST received to its run's start), `fetchMs`,
  `unpackMs`, `childMs` and `putMs`.

Other lines an operator reads: `lease-taken` and `lease-lost` (with `instance`), `listening`, `stopping`, `request`
(one per request: method, path, status, ms, client), `reconciled`, `backup`, `restored`.

<a name="game-health"></a>

## The game's health by revision

After each burst of changes the worker judges the head: the validator, then the solver from a new game, 45 s at most.
The verdict is kept with its revision and sent on the live stream (`health` events); the Studio's header shows it.

- **When a revision fails where the last judged one passed**, a bisection over the revisions between them names the
  first that fails, with what its operation did and its files (never who made it), in at most ⌈log₂ n⌉ judgements.
- **A dev can ask for a bisection** between two revisions at or before the head: `POST /api/health/bisect` with
  `{"good": <rev>, "bad": <rev>}`. It answers `{rev, what, paths}`, or a 400 with the reason: `` `good` and `bad` are
  revisions, `good` before `bad` ``, `revision <bad> is past the head (<head>)`, `revision <good> does not pass`,
  `revision <bad> passes`, or `… no revision can be named` when a verdict is unknown.
- **A solver cut short says "unknown"**, never "valid", and stops a bisection. A revision that fails to be judged five
  times says "cannot be judged", with its reason.
- **An older verdict is shown greyed**, never green.
- A Check run holds the instance's reads while the worker runs its diagnostics: a write waits for it.

> [!LIMIT id=health-not-a-proof]
> The health is a quality signal on a bounded run (45 s of solver), not a proof that the game can be finished. See
> [What the solver proves](create.solver-proofs.md).

<a name="related"></a>

## Related identifiers

- `STUDIO_METRICS_TOKEN`: [Environment variables](reference.environment-variables.md#studio-metrics-token).
- [Monitoring](clever.monitoring.md): suggested alerts. [Redeploys](clever.redeploys.md).
- [`studio-server/src/server/metrics.ts`](../../studio-server/src/server/metrics.ts),
  [`studio-server/src/server/health.ts`](../../studio-server/src/server/health.ts).
