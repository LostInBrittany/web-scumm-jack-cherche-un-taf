## 4.2.2: the gated mutation sets read again before the tag

- The 4.2.2 candidate's `mutation (core)` found one survivor not named: `src/engine/core/save.ts:315`, the slot's
  revision (ADR 0026, PR 2b) never copied. Pull requests do not run the gated sets, so it waited for the candidate.
  Killed by `tests/critical-save.test.ts` ("keeps the revision a slot was made in").
- `studio-ops` and `studio-auth`, whose files 4.2.2 changed too (`journal.ts`, `play.ts`), measured on main before the
  next candidate: `studio-auth` clean (566 of 579 killed, 13 named as before); `studio-ops` had 16 survivors not named,
  all in `Journal.filesAt`, `effectsAt` and `opAt` (4.2.2 PR 3b). 15 killed by `tests/studio-journal-mutants.test.ts`
  ("a past revision read back": the order by path, the default `keep`, a file made later absent, the cache read and
  filled, an unknown revision); one named equivalent (the sort's `<` as `<=`: a Map's keys are never equal).

→ next: Claude (a new candidate, then `v4.2.2`)
