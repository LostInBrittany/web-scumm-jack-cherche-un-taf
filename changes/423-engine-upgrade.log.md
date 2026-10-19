## 4.2.3 PR 8: the engine's upgrade of a hosted game (H6)

- `studio-server/src/worker/migrate.ts`: `migrateIn(dir, game)`, the migration of a snapshot's game as
  `web-scumm migrate` does it (`tools/ids/plan.ts`, the planning of `npm run ids -- --write --map` taken out of
  `tools/ids.ts`, which now prints it), plus the three lines UPGRADING left to the author (`addSchema3ToGameSource` in
  `tools/ids/codemod.ts`); `migratedShape` bounds the answer (1,000 files, 8 MiB, packable plain paths). A worker job
  kind `migrate` (`child.ts`, `job.ts`, `main.ts`), `remoteExecutor.migrate`, `localMigrate`; `overlaySnapshot`.
- `studio-server/src/server/engine-upgrade.ts`: `EngineUpgrade`, under the owner's exclusive lease (`*`, the helper
  `prepare` used, now shared in `main.ts`), one at a time: the head packed, the worker's migration, the migrated
  snapshot judged by the health's `judgeBy` (validator, then solver; `judge` now built once in `main.ts`), a 422 with
  `errors` and `skipped` when it fails or is unknown, else one guarded, undoable `writeFiles` with each file's `from`.
  Route `POST /api/engine/migrate`, owner only, hosted only (404 otherwise). A local Studio has no route: it runs
  `web-scumm migrate`. No button in the Studio's page yet.
- Fixture `tests/fixtures/game-4.1/`: the template at schema 2 (no `schemaVersion`, no ids), its manifest listing the
  starter images so that it validates.
- Tests `tests/studio-engine-upgrade.test.ts` (real worker child): one revision, schema 3 and ids written, health green,
  nothing to do the second time; a game built by code refused, head intact, lease given back; the solver's failure and
  its unknown verdict refused (injected judge), 429 for a second run; taken back by personal undo and by a backup's
  restore to the head and the health of before; the answer's shape; the route (404, 403 for a dev, POST only).
- STUDIO-SERVER (en, fr) "Upgrading the engine of a hosted game"; a threat-model row.

**After the second reading**

- The answer bounded to the migration's files: `migratedShape(v, existing)` accepts only `rooms/*.ts`, `rules.ts`,
  `items.ts`, `game.ts`, `locales/*.json` (each one the snapshot has) and the two id maps; the 200 answer lists the
  `paths` written; a threat-model line (the game's code shapes the answer; the Studio bounds it).
- The exclusive lease renewed every 30 s while the operation runs (`exclusiveRunner` in `leases.ts`, used by prepare
  and the upgrade).
- Two exclusive operations of the same owner: a per-member count, only the last one out releases `*`.
- The revision: `writeFiles` gives the paths it changed, not its revision; the head read after it stays, said to be
  under the exclusive lease.
- `game.ts`'s three lines all or none (a shorthand or a computed `saveVersion` skips the three, said), so a second run
  cannot append `idsMigration` twice; a game whose `defineGame` is not in `game.ts` is refused (documented).
- STUDIO-SERVER (en, fr): the playtests are neither migrated nor judged.
- Coverage: `exclusiveRunner`'s renewal failure (with and without a log) and its count's edges (two runs starting
  together, a take refused), and `remoteExecutor.migrate` against a fake worker (an answer, the game failing, the
  deadline, an answer naming a file the migration never writes or the game does not have, no result, a job refused).

→ next: Claude (4.2.3 PR 9: the reference deployment, H9)
