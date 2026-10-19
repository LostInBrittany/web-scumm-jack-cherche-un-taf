## 4.2.3 PR 9a: the reference deployment's code (H9: metrics, backups to the bucket, runbook)

- `studio-server/src/server/metrics.ts`: `GET /metrics` (Prometheus text 0.0.4) behind `STUDIO_METRICS_TOKEN` (added to
  `SECRET_NAMES`; 32 characters at least, refused at start otherwise): 404 without it, 401 with a missing or wrong
  Bearer (`WWW-Authenticate: Bearer`), compared in constant time (sha256 of both, `timingSafeEqual`); routed after the
  game's origin, before the Studio's page and `/api`. Measured without changing behaviour: the journal's `apply`
  wrapped on the instance (the same promise returned; `journal.ts`, a mutation set, untouched), by outcome
  (`confirmed`, `replayed`, `refused`, `failed`); the remote executor's jobs (an optional `metrics` observer: in flight,
  then duration by kind and outcome; a cached answer is no job); the 423s and answers by status class from the
  request's `finish`; the previews' and the health's durations and the logged failures read from the log lines the
  server already writes; at each scrape the revision, the RPO (the shipper's `rpoMs`) and the service lease. A gauge
  whose read fails is left out of that scrape, never a false 0. OpenTelemetry: not in 4.2.3.
- `studio-server/src/ops/backup-bucket.ts` (a new file, so `backup.ts` and its mutation set stay as PR 10 reads them):
  `backup --to-bucket [--keep n]` writes `backups/<UTC date, - for :>-r<revision>.json` through the S3 client, then
  deletes the older backups it wrote past the n most recent (never another key, never the one just written). `backup
  <file>` refuses a flag as its file.
- `clevercloud/cron.json` (03:17 UTC daily) and `ops/studio/backup-cron.sh` (`#!/bin/bash -l`; nothing unless
  `STUDIO_BACKUP_CRON=1`, nothing off instance 0, `STUDIO_BACKUP_KEEP` default 14): Clever runs a repository's crons
  on every app deployed from it, the worker included, hence the opt-in.
- Docs: STUDIO-SERVER (en, fr) "Running it: the reference deployment": the overlapping redeploy and the engine upgrade
  (service lease, worker first, rollback), the metrics and what to alert on, the daily backup, the restore drill onto a
  fresh add-on; the two variables; `docs/dev/QUALIF-4.2.3-REFERENCE.md`, the report's template (every value "à
  mesurer"); the threat model's row (metrics behind a secret, what they reveal).
- Tests: `tests/studio-metrics.test.ts` (401 without or with a wrong token, the comparison through `timingSafeEqual`,
  404 without a token configured, 404 on the game's origin; values after an operation, a refused one, a 423, a preview,
  a logged failure; nothing of the project in the text; a job in flight, then its duration by outcome, a cached answer
  not counted; the backup's key, `--keep` deleting only its own older backups).
- Left for the run (Claude with the maintainer): the deployment itself, the alerts wired to a person, the real drill and
  the numbers of the report.

- **After the second reading**: a 300 s bucket (the longest wait for the worker); a wait given up on its deadline counted
  as a timeout; the backup cron runs only where Clever says it is instance 0; the threat model says the token's entropy
  protects it, not the throttle; STUDIO-SERVER (en, fr) says what another OpenID provider (GitLab) serves and does not
  (the CLI and the MCP need JWT access tokens; no back-channel logout: a session ends at its next refresh).

→ next: Claude (the reference deployment run, the release)
