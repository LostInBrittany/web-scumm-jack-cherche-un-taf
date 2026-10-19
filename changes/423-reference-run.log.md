## 4.2.3 PR 9b: the reference deployment, run and measured

- `docs/dev/QUALIF-4.2.3-REFERENCE.md` filled in (§1 to §8) from the run on the maintainer's test org (two XS Node
  apps, PostgreSQL DEV, Cellar S, managed Keycloak 26.7.4): phase A at 52e68932, then the upgrade by overlapping
  redeploy to c66fbf56 (main with #180), the cron script run by hand on instance 0 with `--keep`'s second pass, two
  restore drills on fresh add-ons linked to nothing (the second with writes after the backup, replayed to the
  production head), and the previews' times over paced writes. Every number with its command; what was not done says
  why.
- Measured on the redeploy: the old instance `STOPPING` about 2 min, no `stopping` line, the service lease taken 2 min
  56 s after the new instance listened (writes 503 with `Retry-After: 2` for 2 min 25 s, each retried write applied
  once, the revision continuous); during the overlap, one write waited 20 s on the starting instance's reconcile (409)
  then hit PostgreSQL's connection limit on the DEV plan (500 "too many connections"), and was applied once on its
  next try.
- Docs: STUDIO-SERVER (en, fr) for the gaps the run found (managed Keycloak's first login and realm import,
  `realm.json`'s local values, `APP_FOLDER`, `--` before a PEM value, `clever link` then `deploy --alias`, the shell
  of `clever ssh`, `clever logs` bounded by hand, `/metrics` a 401 on the game's origin, the redeploy's cost, the
  `/readyz` alert at 5 min, the drill compared through the API). No code changed.

→ next: the alerts wired to a person and a collector for `/metrics` (§2), and the 03:17 UTC cron line observed on a
following morning.
