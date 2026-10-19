## 4.2.3: the service lease handed over at a deploy

- The reference deployment's §5 (PR 9b): the new instance listening at 19:34:52, `lease-taken` at 19:37:49, writes 503
  for 2 min 23 s; the old instance `STOPPING` for 3.5 min, renewing, no `stopping` line. And a write on the old one
  waited 20 s for the journal's lease (the new instance's 30 s repair held it), then got a 409 without Retry-After.
- `service-lease.ts`: a waiting instance writes an ask (row 2: instance, the database's clock at its first try, until);
  the holder, when the ask is live and newer than itself, expires its row (the fence still grows) and stops writing; the
  asker takes it at its next try (2 s). An older ask is ignored; an expired one too. Residual: an asker that dies
  before taking makes the holder give the lease back again until its ask expires (30 s).
- `journal.ts`: the per-operation lease's wait gives up as 503 (Retry-After 2 at the HTTP layer; the Studio retries
  with the same operation id). `main.ts`: the repair only on the instance holding the service lease, at once when it takes it, then every 30 s.
  Residual: the instance that gave the lease up is no longer repaired; a read still reaching it may show a folder
  behind the head (Clever sends it no new requests once it is `STOPPING`).
- Second reading: the old test expecting 409 updated; the instance that gave the lease back taking it again first
  (found, fixed, tested); the asker's death bound; the lost answer; the cancelled deploy's ask.
- Tests: `tests/studio-server.test.ts` (the handoff, the fence growing, an older instance never taking it back, an
  expired ask), `tests/studio-journal-mutants.test.ts` (the 503).

→ next: redeploy on the reference deployment to measure the handoff; then the release.
