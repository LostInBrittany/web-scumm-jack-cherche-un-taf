## 4.2.3 PR 10: the survivors of `studio-workshop` read, the set gated

- 104 survivors measured on run 39192014232 (backup, ship, gc, health, previews, builds, prepared), each killed or
  named.
- `tests/studio-workshop-backup-mutants.test.ts`: the digest's canonical form (keys sorted, arrays kept), what
  `checkBackup` refuses, the blobs each table's rows name (a build's files, never its snapshot), the rows' order, the
  Postgres catalogue queries on a fake (one read-only transaction), one `has` per blob, shipping past 500, the RPO to
  the millisecond, `close` stopping the retry, the replay's stops (unreadable, another line, a revision moved in
  between), the collection's boundaries.
- `tests/studio-workshop-health-mutants.test.ts`: a kept failure without a culprit names none, a run asked for as the
  last one ends is not lost, `close`, failures counted per revision and given up at the fifth, the verdict kept while
  the next revision cannot be judged and dropped in another epoch, each change emitted once, a bisection asked for
  judging nothing twice, from revision 0, under the journal's epoch, throwing what is no unknown verdict.
- `tests/studio-workshop-previews-mutants.test.ts`: `assetDirs`, `findAsset` passing a folder over, each byte range,
  an empty file, a HEAD without body, a path outside the prepared assets, `servedPath`; the previews' rerun, failure
  kept, restart, build time, manifest read once, nothing before the first look; a build's verdict and a build served
  after a restart.
- `tests/studio-workshop-prepared-mutants.test.ts`: the prepared sets' folders at start and between runs.
- 10 named (equivalent, one unreachable): the three `wanted = false` initial values, `close`'s `clearTimeout` guard,
  `schedule` after `close`, `judge`'s past-the-head guard, the rows' `<=`, the range's `start >= size`, `rebuilt`'s
  `'null'`, `builds.handle`'s null path.
- `studio-workshop` moves from `MEASURED` to `GATED`; MUTANTS.md row and table, the workflow's description.
- No source changed; no bug found.

→ next: Claude (4.2.3 PR 11: the gates, `ci/423-gates`)
