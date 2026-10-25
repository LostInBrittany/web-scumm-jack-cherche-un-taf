# RPO and RTO

Two numbers say what a hosted Studio can lose and how long it can be down: the RPO (recovery point objective, the
changes a recovery may lose) and the RTO (recovery time objective, how long the recovery takes). This page defines both
for the Studio Server, says how each is measured on your installation, and ties them to the measures of the reference
deployment. They are observations, never promises.

<a name="why"></a>

## Why

A team writes the game together, all day. If the database is lost, the question is not whether a backup exists but
which changes come back, and when people can write again. The Studio Server answers with two mechanisms, each tied to
one number:

- **The journal shipped to the bucket** bounds the RPO. Each confirmed operation is copied to Cellar as an immutable
  segment, in order, as soon as it is written (a failure is retried within 30 s).
- **The daily backup plus the replay** bounds the RTO. A restore writes the latest backup into a new database, then
  replays every segment shipped since ([restore drill](clever.restore-drill.md)).

<a name="rpo"></a>

## The RPO, defined

**What a restore can lose is the operations confirmed but not yet shipped to the bucket when the database was lost.**
At any moment that is the age of the oldest operation not shipped yet:

- `GET /readyz` gives it as `rpoMs` (0 when everything is shipped);
- with metrics on, `studio_journal_rpo_seconds` says the same ([Monitoring](clever.monitoring.md)).

The target is one minute (D42): watched, with an alert past 60 s for 5 min, never promised.

> [!MEASURE id=rpo-observed]
> RPO observed: 0. Two notes written after the backup (revisions 64 and 65) were both replayed by the restore;
> `rpoMs` went back to 0 within 2 s of each write.
> - date: 2026-10-19
> - version: 4.2.2
> - volume: a backup at revision 63, 2 operations written after it, head 65
> - conditions: reference deployment phase B, engine at commit c66fbf56 before the 4.2.3 tag (package.json said 4.2.2); one member writing; Clever Cloud test organisation, region par; PostgreSQL DEV, Cellar S
> - source: [QUALIF-4.2.3-REFERENCE.md §3 and §4](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

> [!LIMIT id=bucket-loss]
> The RPO above holds for the loss of the database. If the bucket is lost too, the blobs, the journal and the backups
> go with it: what you can recover is your last copy of the bucket made elsewhere
> ([Backups](clever.backups.md#steps), step 4), and the RPO is the age of that copy.

<a name="rto"></a>

## The RTO, defined

**The time from the decision to restore to the moment the Studio serves writes again** (`/readyz` 200 on the
restored database). It adds up:

1. creating a new PostgreSQL add-on (not measured);
2. downloading the latest backup (not measured);
3. the restore with its replay;
4. pointing the studio app at the new add-on (`clever service link-addon`, unlinking the lost one) and redeploying
   (a studio deploy took 29 s to 1 min 29 s in the reference deployment, migrations included);
5. the new instance taking the service lease.

Only step 3 is measured:

> [!MEASURE id=restore-step]
> The restore step, from the maintainer's machine: 28.7 s (a backup at revision 1, 508 rows, nothing to replay), then
> 59.7 s (a backup at revision 63, 593 rows, 2 operations replayed). The report does not say what the difference
> comes from.
> - date: 2026-10-19
> - version: 4.2.2
> - volume: 508 rows; then 593 rows and 2 operations replayed
> - conditions: Clever Cloud test organisation, region par; PostgreSQL plan DEV, Cellar plan S; run from a machine in Paris, `tsx` start-up included; engine at commits 52e68932 then c66fbf56 before the 4.2.3 tag (package.json said 4.2.2); one sample each
> - source: [QUALIF-4.2.3-REFERENCE.md §4](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

> [!LIMIT id=rto-not-measured]
> No full RTO was measured: the drills restored into a side database and never switched production over to it. Time
> your own drill end to end, with your game's size, and write it in your records: that is your RTO, as of that day.

<a name="not-loss"></a>

## What is not a loss

- **A redeploy** refuses writes for a while (503 with `Retry-After`) and loses none: a write retried with its
  operation id is applied once ([Redeploys](clever.redeploys.md)).
- **A restore logs everyone out** (sessions are not in a backup), and drafts still in a member's browser were never
  confirmed: they are not part of the RPO, and the Studio keeps a refused draft in the editor.

<a name="alternatives"></a>

## Alternatives set aside

- **PostgreSQL's own backups only.** They would restore the tables, not tie them to the file contents in Cellar at
  the same instant. The Studio's backup lists the blobs it names and refuses to restore when one is missing.
- **A continuous replica.** Not offered: one instance, one database, and the journal shipped to the bucket instead.

<a name="trade-offs"></a>

## Trade-offs

- The journal and the backups share the bucket with the contents: one place to lose. Copy it elsewhere.
- The RPO depends on Cellar being reachable: while it is not, `rpoMs` grows ([Worker, PostgreSQL or Cellar
  down](clever.dependency-down.md)).
- Measures come from one small game and one member writing, on the test organisation: not a production load.

<a name="decisions"></a>

## Decisions and ADRs

- D42 (the one-minute RPO target, a full backup daily): [`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md).
- [ADR 0025, the Studio Server](../../docs/dev/adr/0025-studio-server.md); the measures:
  [`docs/dev/QUALIF-4.2.3-REFERENCE.md`](../../docs/dev/QUALIF-4.2.3-REFERENCE.md).
- The procedures: [Backups](clever.backups.md), [Restore drill](clever.restore-drill.md).
