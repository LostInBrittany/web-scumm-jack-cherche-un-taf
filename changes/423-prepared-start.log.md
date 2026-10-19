## 4.2.3: the prepared assets' start no longer races a Prepare

- `studio-server/src/server/prepared.ts` `write()`: after its blobs are read, a set older than the one served (a Prepare
  that ended while the start was writing) is dropped instead of served. Found by the second reading of PR 7, low
  severity (an instance's first minutes, and a Prepare in them). `tests/studio-workshop-prepared-mutants.test.ts`: a
  two-file set whose second read is held while a Prepare ends; it fails without the fix (the old set served, the new
  folder deleted).

→ next: the 4.2.3 release.
