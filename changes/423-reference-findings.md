### Fixed

- **The daily backup ran nothing (4.2.3, found by the reference deployment)**: with the configuration in
  `STUDIO_CONFIG_JSON` (no `--config`), the Studio Server's commands dropped their first argument, so `import <dir>`,
  `invite --email …` and the daily `backup --to-bucket` of `ops/studio/backup-cron.sh` failed (`a new file is
  required`). Each now reads its arguments whole.
- **An operation another process confirmed is shipped (4.2.3)**: a game imported by the CLI against the same database
  emitted no event in the running instance, so it reached the bucket only at the next write there or a restart, and
  the RPO grew meanwhile. The import now ships its operation before it ends, and the instance also ships every 30 s.
- **`invite` reads its flags strictly (4.2.3)**: without `--role`, or with a flag where a value belongs, it took the
  first argument instead (`invite owner --email a@b.fr` invited an owner); it now refuses, as its usage says.
