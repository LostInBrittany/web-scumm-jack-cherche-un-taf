### Changes

- **The Studio Server's metrics and daily backup (4.2.3, H9)**: with the secret `STUDIO_METRICS_TOKEN`, `GET
  /metrics` answers in Prometheus' text format to that token only (never the session, never the game's origin): the
  journal's operation latency, the worker's jobs in flight and their duration by kind, the lease conflicts (423), the
  previews' build time, the RPO, the revision. `studio-server backup --to-bucket [--keep n]` writes the backup to the
  instance's bucket (`backups/<date>-r<revision>.json`) and keeps the n most recent; `clevercloud/cron.json` runs it
  every day on an app that sets `STUDIO_BACKUP_CRON=1`. STUDIO-SERVER gains its runbook ("Running it: the reference
  deployment": the overlapping redeploy and the engine upgrade, the alerts, the restore drill).
