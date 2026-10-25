# Clever Cloud troubleshooting

The problems a hosted Studio on Clever Cloud has shown, or is built to show: a 503, connections exhausted, a missing
cookie, a slow preview, jobs refused for a clock skew, a daily backup that did not run. Each starts from what you see.

<a name="symptom"></a>

## Symptom

| You see | Section |
|---|---|
| A save refused with 503 and `Retry-After: 2`, "this instance does not serve writes yet; try again", during or right after a deploy | [503 during a deploy](#deploy-503) |
| "too many connections for role …" in the logs, a 500 on a write during a deploy | [Connections exhausted](#connections) |
| The game's frames empty in one browser (Safari, GNOME Web), or 401 "open the game from the Studio" in the frame | [Missing cookie](#missing-cookie) |
| The room view showing an older revision for tens of seconds after a change | [Slow preview](#slow-preview) |
| Health and previews failing now and then; `the processing worker refused the job (403: the job has expired)` | [Clock skew](#clock-skew) |
| No `"event":"backup"` line one morning, no new object under `backups/` | [Silent cron](#silent-cron) |
| 503 "the edit cannot be judged now", or "the session is suspended" | A service down: [Worker, PostgreSQL or Cellar down](clever.dependency-down.md) |

<a name="causes"></a>

## Possible causes

- A redeploy: two instances overlap for minutes and hand the service lease over.
- The PostgreSQL DEV plan (5 connections) with two instances running.
- `publicUrl` and `playUrl` on two sites (`*.cleverapps.io`), or a browser that keeps no cookie in a cross-host frame.
- The preview's build on the worker, one at a time, with each revision's files stored.
- The studio app's clock ahead of the worker's (before 4.2.3's fix, a few milliseconds were enough).
- The cron's conditions: `STUDIO_BACKUP_CRON`, instance number 0, a login shell, absolute paths.

<a name="diagnosis"></a>

## Diagnosis

Keep the logs of both apps while you look (`clever logs` follows until stopped: run it in the background and stop it by
its process id), and read `/readyz`:

```sh
# on your machine, in the engine repository
clever logs --alias my-game-studio > studio.log 2>&1 &
curl -s https://studio.example.fr/readyz
```

Each section below says which line or answer tells its case apart.

<a name="fix"></a>

## Fix

<a name="deploy-503"></a>

### 503 during a deploy

<!-- step: deploy-503 -->
1. A 503 with `Retry-After: 2` while `/readyz` says `"writes":"waiting"` and the logs show a new instance before its
   `lease-taken` line is the redeploy's handoff: it lasts 10 to 16 s after the handoff, about a minute in all, and
   about 2.5 min for the first deploy onto 4.2.3 or later from an older version. The Studio retries the write with the
   same operation id and it is applied once. Nothing to fix; tell members before deploying
   ([Redeploys](clever.redeploys.md)). If it lasts longer than 2.5 min, look at PostgreSQL
   ([Worker, PostgreSQL or Cellar down](clever.dependency-down.md)).

<a name="connections"></a>

### Connections exhausted

<!-- step: connections -->
2. "too many connections" (`leases-read-failed`, `reconcile-failed`, `ship-failed`) during a deploy comes from two
   instances, about 4 connections each, on a plan of 5. Take a PostgreSQL plan with more connections
   ([Apps and add-ons](clever.apps-addons.md#postgresql-sizing)). Outside a deploy, look for connections you opened
   yourself (`psql`) on the same add-on.

<a name="missing-cookie"></a>

### Missing cookie

<!-- step: missing-cookie -->
3. The game's frame needs its own session cookie, on `playUrl`. Check that `publicUrl` and `playUrl` are two
   subdomains of one domain of yours: two `*.cleverapps.io` names are two sites, where only a partitioned cookie
   (CHIPS) survives. WebKit on Linux (GNOME Web) stores no cookie a frame of another host sets, even on one site: there
   the game's frames stay empty whatever you do. A real Safari on macOS and iOS has not been checked yet (the
   `studio-hosted` pass). A game frame left idle past its 15-minute session shows nothing new: "Reload view" opens it
   again ([Domains and TLS](clever.domains-tls.md#why-one-domain)).

<a name="slow-preview"></a>

### Slow preview

<!-- step: slow-preview -->
4. After each change the worker builds the head; a burst of changes builds its last revision only, and the room view
   shows the last ready preview meanwhile, with the revision it is. The `"event":"preview"` log line (since 4.4.0) says
   where the time goes: `queuedMs`, `snapMs`, `jobMs`, `storeMs`, `sinceWriteMs`. Upgrade to 4.4.0 or later if you run
   an older version:

> [!MEASURE id=preview-time]
> From the write to the preview ready (`sinceWriteMs`), ten notes 40 s apart: median 17.8 s and max 26.0 s on the
> instrumented version, median 5.6 s and max 11.7 s on the optimised one (files stored 8 at a time). On 4.2.3 the
> preview took p50 34.1 s, p95 43.8 s by the same method, and skipped revisions past one change every 35 s.
> - date: 2026-10-22
> - version: 4.3.1
> - volume: ten revisions per series (436 to 445, then 446 to 455)
> - conditions: reference deployment, studio and worker XS, region par; engine at commits a3294282 then b9336a4d, the 4.4.0 work before its tag (package.json said 4.3.1); the 4.2.3 figures measured on 2026-10-19 on the same deployment, revisions 66 to 75
> - source: [QUALIF-4.2.3-REFERENCE.md §6 and its 4.4.0 note](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

   The worker's job itself stays the main part: it builds the engine cold at each revision.

<a name="clock-skew"></a>

### Jobs refused for a clock skew

<!-- step: clock-skew -->
5. `the processing worker refused the job (403: the job has expired)` in `health-failed` or `preview-failed` lines,
   for some jobs and not others, came on the reference deployment from the studio app's clock running ahead of the
   worker's: the Studio sets a job's expiry, the worker checked it to the millisecond. Since 4.2.3 (#192) the worker
   allows 30 s of skew (`CLOCK_SKEW_MS`), logs `worker-job-refused` with its reason, and the Studio repeats the reason
   (200 characters at most). If you still see it: check both apps run the same version, and read the worker's
   `worker-job-refused` line; a skew past 30 s is the platform's to fix.

> [!GUARANTEE id=job-clock-skew]
> The worker accepts a job signed by a Studio whose clock runs ahead of its own by up to 30 s.

It still refuses a job that has expired, to the millisecond, or that would live longer than a job plus the skew.

<a name="silent-cron"></a>

### Silent cron

<!-- step: silent-cron -->
6. The daily backup runs at 03:17 UTC from `clevercloud/cron.json`, and its script does nothing, silently, when:
   - the studio app does not set `STUDIO_BACKUP_CRON=1`, or was not redeployed or restarted since it was set;
   - `INSTANCE_NUMBER` is not `0` (another instance, or Clever did not say which one it is);
   - the app was installed from the release archives, which do not carry the script: add your own
     ([Backups](clever.backups.md#from-archives)), starting with `#!/bin/bash -l` (without it, a cron runs with no
     environment) and using absolute paths (`$ROOT`).

   Run it by hand in `clever ssh` (`cd "$APP_HOME" && ops/studio/backup-cron.sh`): it prints its `"event":"backup"`
   line, or the error that stops it.

<a name="check-fixed"></a>

## How to check it is fixed

`/readyz` 200 with `rpoMs` 0; a save goes through; the game shows in the room view and the Play tab; the next
`"event":"preview"` line is short; the worker logs no `worker-job-refused`; the next morning has its `"event":"backup"`
line.

<a name="neighbours"></a>

## Neighbouring cases

- **409** on a save: someone wrote the same file since you read it ([Write refused: stale base](team.write-refused-409.md)).
- **423** on a save: a span another member holds ([Write refused: span locked](team.write-refused-423.md)).
- **503 from the Reality Bridge** is the Bridge's own unavailability, another service: see the Bridge's pages
  ([Bridge troubleshooting](bridge.troubleshooting.md)).
- A worker, database, bucket or provider down: [Worker, PostgreSQL or Cellar down](clever.dependency-down.md).
