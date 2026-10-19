# 0025 · One shared game, edited live: transactions, one owner per file, revisions (4.2.1)

**Context.** The Studio is a single-user tool served by Vite. At `a0ce19d`, about ten paths write a game's files:
- the core's `serial` queue (`studio-server/src/ops/core.ts`, moved from `tools/studio/` in 4.2.1);
- a second queue in `tools/studio/assets.ts:297`;
- a separate `createStudio` in the MCP process (`tools/mcp/server.ts:18`);
- authoring tools in TypeScript and Python that write directly;
- a Vite route that writes a layout unchecked (`tools/vite/plugins.ts:57`).

Only `setValue` and `setLayout` roll back a write that adds validation errors. `addEntity` writes two files one after
the other. Nothing is fsynced. The change feed says which file changed, not by whom nor at which revision. The game is
imported statically (`src/main.ts:4`). A save carries no content fingerprint, and its envelope is a strict object.
Validation imports the content's TypeScript, so it runs it.

The maintainer wants several developers on one server, at the same time, on one live copy of the game, with explicit
locks and frozen builds (D39), shipped as 4.2.1 "Shared Floor", 4.2.2 and 4.2.3 (D40). The French plan, `docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md`, is the source; the decisions
below follow its P1–P8.

**Decision.**

1. **P1 · The transaction is the unit of change.** Each project has one operation queue. An operation may touch
   several files and is applied in this order:
   1. Its new contents go into a content-addressed blob store; binaries never enter the log.
   2. It is validated on its final state.
   3. Fencing tokens and the revision of each touched file are checked, then the intent (before and after hashes, or
      `absent`) is logged with fsync. This is the linearisation point.
   4. Each file is written as a temporary file, fsynced, renamed, and its directory fsynced.
   5. The operation is confirmed with fsync.

   Recovery always rolls forward, file by file. A file that matches neither hash puts the project in maintenance.
   An in-process failure restores the before blobs.
2. **P2 · Every file has exactly one write owner.** The owner is a room, `game`, `items`, `cast`, `rules`, `story`,
   one language, `voices`, `assets`, `notes`, `meta` or `playtests`. The ownership map is generated and fails on an
   unowned file.
   - Map groupings only reference elements.
   - A multi-owner operation claims all its owners at once, in a fixed order, and is refused (423) without waiting.
   - Whole-game tools (`ids`, migrations, asset preparation) take an exclusive project lease.
   - Leases are taken, renewed and taken over through the queue, on the store's clock, and fenced. A stale holder's
     request is refused even when it is already in flight. An intent that is already logged completes.
3. **P3 · One validation guard for every write, on the final state, out of process.** A transaction that adds errors
   is refused (422).
   - The staged state is a real directory (hard links plus the changed files) that resolves `@engine`.
   - validate runs in a child process with no secrets.
   - One validation per operation.
4. **P4 · The shared preview is explicit work.** Step 1 labels Play with its revision and marks it stale. Step 2 builds
   one immutable preview per revision. An open game is never reloaded silently: the player resumes if compatible,
   restarts, or stays.
   - By default the save envelope is unchanged, with the fingerprint and revision kept beside each slot.
   - "Compatible" means the same logic fingerprint.
   - ADR 0026 (reserved) decides this at step 2.
5. **P5 · Everything carries a revision.**
   - A monotonic revision per project, with a project epoch.
   - A last revision per file, which is the base of a 409.
   - Diagnostics and builds name their revision, and stale results are shown as stale.
   - Snapshots are taken at operation boundaries without blocking the queue.
   - A manifest names the epoch, revision, file hashes, engine, commit, lockfile and diagnostics.
   - A failure is attributed to the revision that introduced it, never to a person.
6. **P6 · Durable, idempotent, single entry from step one.**
   - Operation ids live as long as the log.
   - A client reconnects with its epoch and last revision.
   - Studio, assistant, MCP and every authoring tool go through the API.
   - External changes are detected by hash. Local mode adopts them as an `external` operation; server mode goes into
     maintenance.
   - The Git autosave is new. It is history, not the guarantee, and runs under the queue with its own index.
7. **P7 · SSE plus an HTTP read by cursor.** D17 does not govern the Studio (D23 narrowed it to the Bridge and the PWA),
   but its pattern is reused. No WebSocket unless a measurement asks for one.
8. **P8 · One writing process per project**, held by a fenced service lease. A second instance is refused.

**Amended by revision 4 (D41, 17 October 2026): hosted on Clever Cloud's native Node.js runtime.** Plan §0–§6.
- **Durability in hosted mode.** The truth is in PostgreSQL (operation log, per-file revisions, recorded responses) and
  Cellar (content-addressed blobs). The instance's game tree is a materialised cache. An operation is confirmed by its
  Postgres commit, after its blobs are stored. A retry returns the recorded response. Reads resolve a revision through
  the log and never read the cache. A reconciler repairs the cache without a restart. Local mode keeps P1 as written.
- **Service lease (P8).**
  - Each write transaction checks that the lease is unexpired, on the database's clock, and that its fencing token is
    current.
  - Final transactions are short and do no network I/O.
  - `lock_timeout`, `statement_timeout` and `idle_in_transaction_session_timeout` bound a frozen holder, so takeover
    is bounded (target ≤ 38 s, to be measured) without relying on SIGTERM.
- **Identity.** OIDC (Keycloak or any compliant provider) gives the identity only. Roles and membership live in the
  Studio. CLI and MCP use OIDC access tokens (device flow), not Biscuit. Four explicit HTTP policies replace a single
  rule: cookie, Bearer, OIDC callback and back-channel logout. Revocation is bounded at R = 15 min (ADR 0027,
  reserved).
- **Game code runs on a separate origin.** Preview, Play and builds run on a separate origin with its own session,
  tied to the Studio session. Whether that origin is same-site or cross-site is decided by spike S under Safari's
  default third-party cookie blocking. In 4.2.1 the preview is live and not frozen; P4 ships in 4.2.2.
- **Content execution.** It is moved to a worker application that holds no platform secret, if spike S and ADR 0028
  (reserved) retain it.
  - The worker sees the project's data and the job's temporary capabilities, which are assumed visible to hostile
    code.
  - Verdicts are quality signals, not security decisions.

**Costs.**
- Every existing writer, the Python tools included, moves behind the operation API before anything is shared. The
  first PR is a neutral split.
- Undo becomes personal, and is disabled in server mode until step 2.
- Content is TypeScript that runs when validated or built, as ADR 0002 makes it a convention, not a sandbox. Children
  run without secrets and under another system user, yet a member can still run code on the build machine. Members
  are trusted, and the threat model says so.
- Throughput per operation and the 5-second preview target are measured. Their thresholds are written before each
  step's release, not assumed.

**What would change it.**
- Two people needing to edit the same long dialogue at once: CRDT on that element only.
- A measurement where SSE plus HTTP misses its target.
- A decision to give each person a private workspace. The maintainer rejected that on 17 October 2026.
