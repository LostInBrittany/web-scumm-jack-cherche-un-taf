# Worker, PostgreSQL or Cellar down

The Studio depends on four services besides itself: the worker app, the PostgreSQL add-on, the Cellar bucket and the
OpenID provider. This page tells, for each, what members see when it is down, what is at risk, and how to recover.
None of these outages was provoked on the reference deployment: the effects below are read from the code.

<a name="symptom"></a>

## Symptom

| What members see | Usually |
|---|---|
| Saves refused with 503 "the edit cannot be judged now: …"; the header's health stays grey; the room view keeps an older preview | The worker |
| Every save refused with 503 "this instance does not serve writes yet; try again"; `/readyz` 503 `"writes":"waiting"`; reads failing too | PostgreSQL |
| Saves of new images or sounds failing; previews failing; `rpoMs` growing on `/readyz` | Cellar |
| Logins failing; after a while, 503 "the identity provider cannot be reached: the session is suspended" | The provider |

<a name="causes"></a>

## Possible causes

- **The worker**: the app stopped, crashed or redeploying; its `WORKER_PUBLIC_KEY` or `WORKER_INSTANCE` not matching
  the Studio's key or `worker.instance` (403 "the job is for another instance", or a signature refused); its lanes full
  (8 jobs each, then 429); the two apps at different versions during an upgrade.
- **PostgreSQL**: the add-on down or in maintenance; its connections exhausted ("too many connections", the DEV plan
  during a redeploy).
- **Cellar**: the service unreachable, the bucket deleted, or its credentials changed.
- **The provider**: the Keycloak add-on down, or the provider's client secret changed without the Studio's.

<a name="diagnosis"></a>

## Diagnosis

```sh
# on your machine
curl -s https://studio.example.fr/readyz
```

`"writes":"waiting"` means this instance does not hold the service lease: PostgreSQL first (or a redeploy). A growing
`rpoMs` means the journal cannot reach the bucket: Cellar.

```sh
# on your machine, in the engine repository; stop it by its process id once read
clever logs --alias my-game-studio > studio.log 2>&1 &
clever logs --alias my-game-worker > worker.log 2>&1 &
```

| Log line | Points at |
|---|---|
| `health-failed` or `preview-failed` with "the processing worker refused the job (403: …)" | The worker refuses: read the reason (keys, instance, expiry) |
| `worker-job-refused` in the worker's log | The same, from the worker's side |
| `leases-read-failed`, `reconcile-failed`, "too many connections" | PostgreSQL's connections |
| `ship-failed` with an `S3` message | Cellar |
| `lease-lost` with no `lease-taken` after it | PostgreSQL: the instance could not renew |

Clever Cloud's console shows each add-on's state; `clever status --alias my-game-worker` shows the worker's instances.

<a name="fix"></a>

## Fix

<!-- step: worker -->
1. **The worker.** Restart it (`clever restart --alias my-game-worker`) and check that its key and instance name match
   the Studio's ([Configuration](clever.configuration.md#steps), step 6). Meanwhile: writes that need a check are
   refused rather than let through (the Studio fails closed); writes to `notes.json`, the storyboard, `voices.json`,
   `playtests/`, `art/`, `audio/` and `private/` need no check and still go through; previews, the health, Prepare and
   the cuts wait. Nothing confirmed is lost.

<!-- step: postgres -->
2. **PostgreSQL.** An instance that cannot renew its lease stops writing by its own clock within 30 s; nothing is
   written half. When the add-on comes back, the instance takes the lease again and writes resume. If the database is
   lost, restore the latest backup into a new add-on and replay the journal
   ([restore drill](clever.restore-drill.md)): what is lost is what was not shipped yet ([RPO](clever.rpo-rto.md)).

<!-- step: cellar -->
3. **Cellar.** Confirmed operations stay in PostgreSQL; their shipping to the bucket is retried every 30 s
   (`ship-failed`), and `rpoMs` grows meanwhile: if the database were lost now, those operations would be. When Cellar
   is back, the journal catches up and `rpoMs` returns to 0. The daily backup fails while the bucket is unreachable:
   take one by hand once it is back ([Backups](clever.backups.md#steps)). If the bucket is lost, only your copy made
   elsewhere can restore the game.

<!-- step: provider -->
4. **The provider.** Sessions live on until R (15 min) after their last check, then are suspended (503) until the
   provider answers; new logins fail until then. Bring the provider back; if its client secret changed, set the same
   one in the Studio ([Rotating keys](clever.key-rotation.md#oidc-secret)).

> [!LIMIT id=not-provoked]
> None of these outages was provoked on a live installation: the behaviour is read from the code (the guard that fails
> closed, the lease, the shipping retries, the session suspension), and the times are the code's constants, not
> observations.

<a name="check-fixed"></a>

## How to check it is fixed

`/readyz` is 200 with `rpoMs` back to 0; a save goes through at the next revision; the header's health turns green and
a preview builds; a member can log in.

<a name="neighbours"></a>

## Neighbouring cases

- **A 503 during a deploy** is the lease handing over, not an outage: it lasts seconds to about a minute
  ([Redeploys](clever.redeploys.md)).
- **A 423** is a span held by another member, not a service down ([Write refused: span locked](team.write-refused-423.md)).
- **A 409** is a stale base revision ([Write refused: stale base](team.write-refused-409.md)).
- Other Clever symptoms (a missing cookie, a slow preview, clock skew, a silent cron):
  [Troubleshooting](clever.troubleshooting.md).
