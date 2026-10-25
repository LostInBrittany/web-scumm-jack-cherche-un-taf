# Monitoring

What to watch on a hosted Studio, and how: the probes, the Prometheus metrics behind a token, the logs, and the alerts
that should reach a person.

<a name="what-you-get"></a>

## What you get

A scraper reading `/metrics` with its token, a prober on `/readyz`, Clever Cloud's deployment notifications, and six
alerts sent to a person: no instance serving writes, the journal not shipping, the worker piling up, jobs failing,
members waiting on each other, the daily backup missing.

<a name="context-and-versions"></a>

## Context and versions

- A hosted Studio on Clever Cloud. `/metrics` and `STUDIO_METRICS_TOKEN` exist from 4.2.3; the per-phase preview
  metrics and log fields from 4.4.0.
- **Verified on: 19 October 2026, by the reference deployment, for the route only** (engine commit c66fbf56,
  package.json 4.2.2 before the 4.2.3 tag): `/metrics` answered 401 without a token or with a wrong one, 200 with it
  (`text/plain; version=0.0.4`), and 401 on the game's origin. **Not verified**: no collector and no alert were set on
  the test organisation, and no alert was triggered on purpose.

<a name="prerequisites"></a>

## Prerequisites

- `STUDIO_METRICS_TOKEN` set on the studio app, 32 characters or more ([Configuration](clever.configuration.md#steps)).
- A scraper you run (Prometheus with its Alertmanager, or any service that reads the Prometheus text format), or at
  least an HTTP prober. Clever Cloud does not read `/metrics`.

<a name="where-to-run"></a>

## Where to run the commands

`clever notify-email`, `clever logs`: on your machine, in the engine repository where the apps are linked. The
scraper: on a machine of yours that reaches `https://studio.example.fr`.

<a name="steps"></a>

## Steps

<!-- step: check-route -->
1. Check the route answers with the token, without printing it:

   ```sh
   # on your machine, the token in a 0600 file
   curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $(cat ~/secrets/my-game/metrics-token)" https://studio.example.fr/metrics
   ```

   200 with the token; 401 with none or another (compared in constant time); 404 when the app has no
   `STUDIO_METRICS_TOKEN` (the route does not exist). It is never behind the session, and never on the game's origin,
   where any request without the game's session is refused before its path is read (401, "open the game from the
   Studio").

> [!GUARANTEE id=metrics-token-required]
> `/metrics` answers only to `Authorization: Bearer <STUDIO_METRICS_TOKEN>`: without the token or with another, a
> 401, the token compared in constant time.

<!-- step: scrape -->
2. Point your scraper at it, with the token as a bearer credential. For Prometheus:

   ```yaml
   # prometheus.yml, on the machine that runs Prometheus
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
3. Have Clever Cloud tell you about failed deployments (webhooks too: `clever webhooks add`):

   ```sh
   # on your machine, in the engine repository
   clever notify-email add --notify you@example.fr --event DEPLOYMENT_FAIL studio-deploys
   ```

   Clever's console also shows each app's CPU, memory and logs.

<!-- step: alerts -->
4. Set the alerts, to a person:
   - `/readyz` is not 200 for **2 min**: no instance serves writes. A redeploy keeps it at 503 for 12 to 20 s, the
     first deploy onto 4.2.3 or later for about 2.5 min: expect the alert then ([Redeploys](clever.redeploys.md)).
   - `studio_journal_rpo_seconds` above **60 for 5 min** (the target is 1 min, D42), or `ship-failed` keeps rising.
   - `studio_worker_jobs_in_flight` above **3 for 10 min**: the worker runs one job at a time per lane, two lanes, so
     work is piling up.
   - Jobs fail: `studio_worker_job_seconds_count{outcome!="ok"}` rises, or `health-failed` does.
   - `studio_lease_conflicts_total` jumps: people waiting on each other's spans. Not a fault, a sign to look at.
   - The daily backup's line (`"event":"backup"`) is missing from the logs one morning.

<a name="expected-result"></a>

## Expected result, and how to check it

The scraper shows the target up, `studio_service_lease_held` at 1 and `studio_journal_rpo_seconds` at 0 when nobody
writes. To test the path to a person, trigger one alert on purpose (stop the studio app a few minutes off hours, or
lower a threshold) and time how long it takes to reach you: that has not been measured by this project.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| 404 on `/metrics` | No `STUDIO_METRICS_TOKEN` on the studio app, or not redeployed since | Set it, redeploy |
| 401 `the metrics need their token` | Wrong token, or `play.` instead of `studio.` | Use the Studio's origin and the right file |
| `STUDIO_METRICS_TOKEN: 32 characters at least` and the server does not start | A short token | `openssl rand -base64 32` |
| Counters fall to zero | A restart or a redeploy: the metrics live in the instance's memory | Read them with `rate()`, which treats it as a counter reset |

<a name="files-changed"></a>

## Files or data changed

Your scraper's configuration and the token's file on its machine; Clever Cloud's notification settings. Nothing in the
Studio.

<a name="recovery"></a>

## Recovery or going back

Remove the token (`clever env rm STUDIO_METRICS_TOKEN --alias my-game-studio`, then redeploy): the route is gone (404).
Changing it is [Rotating keys](clever.key-rotation.md#metrics-token).

<a name="metrics"></a>

## Reference: the metrics

They are counts and durations: no path, no name, no author, no content. They live in the instance's memory, so a
restart starts them again from zero. The worker's own queue is not measured from the worker: the Studio's side of it
is.

| Metric | What |
|---|---|
| `studio_journal_operation_seconds{outcome}` | the journal's operations, from asked to answered (`confirmed`, `replayed`, `refused`, `failed`) |
| `studio_worker_jobs_in_flight` | the jobs asked of the worker and not answered yet: the queue as the Studio sees it |
| `studio_worker_job_seconds{kind,outcome}` | the worker's jobs by kind (`validate`, `load`, `preview`, `prepare`, `lint`, `solve`, `playtests`) and outcome (`ok`, `failed`, `timeout`, `error`) |
| `studio_lease_conflicts_total` | the 423s answered: someone else's span, or a lease that ended |
| `studio_preview_build_seconds{outcome}` | a revision's preview, the worker's build and the files stored, after the snapshot (`built`, `failed`) |
| `studio_preview_phase_seconds{phase}` | since 4.4.0, a preview by phase: `queued` (from the write to the build's start: the coalescing, a build before it, the retries), `snapshot`, `job` (the worker's job as the Studio waits for it, its queue on the worker included), `store`, and `since_write` (from the write to the preview ready) |
| `studio_worker_job_phase_seconds{kind,phase}` | since 4.4.0, a job by phase as the Studio runs it: `put` (the snapshot staged), `post` (the worker's answer), `get` (the result read), `del` (the staging deleted) |
| `studio_health_judgement_seconds{verdict}` | the health's verdict on a revision |
| `studio_journal_rpo_seconds` | the age of the oldest operation not shipped to the bucket (the `rpoMs` of `/readyz`) |
| `studio_journal_revision`, `studio_service_lease_held` | the head, and whether this instance serves writes (1) |
| `studio_http_responses_total{class}`, `studio_log_events_total{event}` | answers by status class; the failures logged (`ship-failed`, `health-failed`, `reconcile-failed`, `error`…) |

OpenTelemetry is not supported (it was left for later in 4.2.3, and 4.4.0 did not add it).

<a name="probes"></a>

## Reference: the probes and the logs

- `GET /livez`: 200 while the process answers. `GET /startz`: 200 once the server has started (Clever's health check).
  `GET /readyz`: 200 when this instance holds the service lease and serves writes, 503 (`"writes":"waiting"`)
  otherwise, with `rpoMs`. None needs a session or gives data.
- The logs are one JSON line per event, on standard output (`clever logs`): `request` (method, path, status, ms),
  `lease-taken`, `lease-lost`, `backup`, `ship-failed`, `health-failed`, `preview-failed`, and since 4.4.0 a
  `"event":"preview"` line with `queuedMs`, `snapMs`, `jobMs`, `storeMs` and `sinceWriteMs`, a `"event":"worker-call"`
  line per job (the Studio's side) with `putMs`, `postMs`, `getMs` and `delMs`, and the worker's own `worker-job` line
  with `queueMs` (from its POST received to its run's start), `fetchMs`, `unpackMs`, `childMs` and `putMs`. The worker
  logs a refused job as `worker-job-refused` with its reason.
- `clever logs` follows until it is stopped, even with `--until`: run it in the background and stop it by its process
  id.

<a name="references"></a>

## References

- [`studio-server/src/server/metrics.ts`](../../studio-server/src/server/metrics.ts),
  [`studio-server/src/server/http.ts`](../../studio-server/src/server/http.ts); the test:
  [`tests/studio-metrics.test.ts`](../../tests/studio-metrics.test.ts).
- [`STUDIO_METRICS_TOKEN`](reference.environment-variables.md#studio-metrics-token); for members:
  [Health and metrics routes](team.health-metrics.md).
- [`docs/dev/QUALIF-4.2.3-REFERENCE.md`](../../docs/dev/QUALIF-4.2.3-REFERENCE.md) §2.
