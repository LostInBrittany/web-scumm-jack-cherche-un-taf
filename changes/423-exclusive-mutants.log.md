## 4.2.3: the exclusive lease's runner pinned for `studio-auth`

- Measured before the 4.2.3 candidate (run 39311491188), `studio-auth` had 19 unexplained survivors, all in
  `exclusiveRunner` (`studio-server/src/server/leases.ts`, PR 8): its behaviour was tested only through the engine's
  upgrade and prepare, outside the set's tests. `tests/studio-exclusive-mutants.test.ts`, in the set: without a
  claimant; taken and given back, or not when held before (another's `*`, another span of theirs); on a failure; two of
  the member's at once (one look, given back by the last); renewed while it runs, a failed renewal logged.

→ next: the set measured again on the branch, then the release.
