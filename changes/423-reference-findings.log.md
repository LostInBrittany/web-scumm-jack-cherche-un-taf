## 4.2.3: the reference deployment's two server findings fixed

- The reference deployment on Clever Cloud (PR 9, phase A) found two bugs, both on main:
  - `studio-server/src/server/main.ts`: `rest.filter((_, i) => i !== at && i !== at + 1)` with `at = -1` (no
    `--config`) dropped argument 0. Now `withoutConfig(rest)` (config.ts), tested with and without the flag. It broke
    the daily backup's cron as shipped (reproduced on the instance).
  - `ops/ship.ts` `Shipper`: shipped at start and on the instance's own `confirmed` events only; a CLI import against
    the same database stayed unshipped (RPO 190 s, until a restart). `Shipper.watch(ms)` ships every 30 s too, cleared
    by `close()`; tested with writes the shipper is never told about.

→ next: the reference deployment's phase B (the restore drill with writes after the backup, the overlapping redeploy)
on the release's main.
