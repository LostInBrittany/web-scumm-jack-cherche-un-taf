# 0028 · Where a hosted Studio runs the game's code: a worker without secrets (4.2.1)

**Context.** A game is TypeScript: reading it or validating it means running it. Until 4.2.1, the Studio imported the
game in its own process. Hosted, that process holds the database, the session key, the OIDC client secret and the
Cellar keys, and a `dev` could have read all of them. Clever Cloud's native Node.js runtime gives one system user per
application and no container per job (spike S report, `docs/dev/SPIKE-4.2.1-CLEVER.md` §6). Node's permission model limits
accidents; it is not a boundary against hostile code. A child process of the Studio is not one either: it runs as the
same user and can read the parent's `/proc/<pid>/environ`, which still holds the variables removed from
`process.env`. Plan `docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md` §3.8.

**Decision.**

1. **The boundary is a separate application, `studio-worker`, that holds no secret of the platform:**
   - no database URL, no session key, no OIDC secret, no permanent Cellar keys, no signing key;
   - only the Studio's **public** job key and the name of the one Studio instance whose jobs it runs.
2. **With OIDC, every run of the game's code goes to the worker** (`studio-server/src/server/remote-executor.ts`):
   - the guard's validations;
   - the loads of the game module behind the Studio's reads, as data with functions dropped.

   `loadConfig` refuses OIDC without `worker` and S3 blobs. Captures are unavailable on a hosted Studio. Without
   OIDC the server is the local one, on the loopback, and runs the game in its own process as before.
3. **A job** (`studio-server/src/worker/job.ts`) is signed by the Studio with Ed25519. The signature binds:
   - its id, used once;
   - the instance;
   - the epoch and revision;
   - the snapshot's sha256;
   - the kind (`validate` or `load`; `preview` since 4.2.2, a revision's build) and its parameters;
   - its staging prefix `staging/<id>/`;
   - the expiry, 5 min at most (the worker allows 30 s of clock skew, `CLOCK_SKEW_MS`, since 4.2.3);
   - the two presigned URLs: read the snapshot, write the result.
4. **The worker's supervisor** (`studio-server/src/worker/main.ts`):
   - checks the job;
   - fetches the snapshot and checks its hash;
   - writes it to a fresh folder;
   - refuses a job that expired while it waited in the queue;
   - runs `child.ts` in a fresh process with an **emptied environment**, in its own process group, with no pipe a
     grandchild could hold, killed with the group at its deadline (60 s by default, 120 s at most);
   - reads the output from a file once the child has exited (16 MiB at most; the game's own logs never mix with it);
   - PUTs the result itself and removes the folder.

   Since 4.4.0 it runs one job at a time **per lane** (`studio-server/src/worker/lanes.ts`): a preview (or a published
   build) in its own, every other kind in the other, so that a preview never waits behind the health's solver; two
   children at most at once, each with all of the above. Both are the one instance's jobs (one project, one trust
   domain): a job's code was already assumed to see the next jobs' capabilities (residual risks, below); it may now
   see the other lane's while both run, and nothing more.

   A process of the group still alive a second after a job marks the instance to recycle: `/readyz` answers 503, new
   jobs are refused, and the worker exits once idle so that the platform starts a fresh one. **Only the process group
   is watched:** a process that leaves it (`setsid`) is not detected. The answer to that is periodic redeploys of the
   worker (PR 8).
5. **The Studio accepts a result:**
   - it reads it itself, stopping past 32 MiB;
   - it checks that it answers this job (id and kind);
   - it deletes the staging prefix.

   A failure of the game's code (a timeout, a crash, no output) throws, as a local import does: the guard then
   refuses the edit (fail closed). A failure is never cached.

   The worker never names a key the Studio publishes. The snapshot carries the sources and the data (TypeScript,
   JavaScript, JSON, Markdown), never the art, the sound, the private folder, the tests or `node_modules`, and is
   bounded (5,000 files, 32 MiB). **A game that imports files outside its own folder cannot run on a hosted Studio**
   (in this repository, `games/reference`).
6. **The guard stays synchronous and remote.**
   - Measured on the maintainer's Mac (Apple silicon, 18 October 2026), with the template game:
     - the child alone: 237–283 ms (5 runs);
     - the whole round trip to Cellar in Paris over the Internet (snapshot up, job, child, result up and back, staging
       deleted): 760, 875 and 958 ms (3 runs, snapshot 11.6 KB).
   - Spike S measured a Studio → worker round trip inside Clever Cloud at p95 37 ms.
   - An unchanged game is not sent again within a minute: the last answer of each kind is kept by the snapshot's hash
     for 60 s (a redeployed worker is asked again soon), and each reader gets its own copy of a loaded module.
   - The full p95 of an operation on Clever Cloud is measured with the hosted pass, and its threshold written before
     the release (plan §11). If it is too slow, the choice is between batching the pending operations and a local
     guard with its risk declared. A local guard would run the game in the Studio's process.

**What a verdict proves.**
- A result from code the project does not trust **cannot be proved honest** by a schema, a hash or a size.
- Verdicts are **signals of quality in the project's trust domain**, never security decisions. A `dev` who wanted to
  forge one can already write broken content.
- The guard (P3) protects against mistakes, not against a member's malice.

**Residual risks** (also in `docs/dev/threat-models/studio-server.md`).
- **The job's code shares the worker's machine and user.** It is assumed to see:
  - the job's capabilities: the presigned URLs and the job token;
  - by persistence, those of later jobs on the same instance until it is recycled.
- **A stolen capability**, for 5 min at most, gives two things only:
  - reading that job's snapshot, which holds data of the same project;
  - writing that job's result.

  No published object, no other prefix, no other instance.
- **Hostile code may persist** on a worker instance and skew later verdicts and loads of the same project. It gets no
  secret of the platform. It shares the supervisor's user, so it can read the supervisor's environment
  (`/proc/<pid>/environ`): this is harmless only because the worker holds no secret, and it must stay so.
- **Single use is per worker process.** The record of jobs seen lives in memory: a restart forgets it, and a job
  replayed before its expiry reruns the same snapshot into the same result key.
- **What answers:**
  - one worker per Studio instance;
  - recycling on a detected survivor;
  - redeploying the worker (to be scheduled with the hosting guide, PR 8).
- **A preview (4.2.2) is files the game's origin serves**, as the game's own page would: the Studio bounds them
  (2,000 files, plain relative paths), stores them under their hashes, and serves them behind the game session only,
  never on the Studio's origin.
- **A loaded module is data the Studio trusts as much as the game's own files.** A hostile load can show wrong data
  in the editors of the same project, as editing the files could.

**Costs.**
- A second Clever application.
- One Ed25519 key pair: `studio-server worker-keys --out <folder>`.
- About a second of latency per guarded operation from far away, less inside Clever Cloud (to be measured).
- No captures on a hosted Studio in 4.2.1.

**What would change it.**
- A native runtime that separates users or sandboxes processes would let the supervisor and the job be separated
  for real.
- A threshold the remote guard cannot hold (point 6).
