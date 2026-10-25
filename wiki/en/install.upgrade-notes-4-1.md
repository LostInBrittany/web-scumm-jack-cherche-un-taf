# Upgrade notes: 4.1

What each release of the 4.1 line changed, from 4.0 to 4.1.20, kept unchanged. The 4.1 line could still break, each break with its
migration ([Stability and support](start.stability.md)); strict SemVer starts at 4.2.0. Two breaks matter to a game upgraded across it: the
save envelope v4 (4.1.15, §27; every older save still loads) and the `.wsrun` schema 2 (4.1.16, §28). Others concern
a host that wrote its own `RunStore` (§28, §29) and a Bridge operator (§31, §32).

To upgrade a 4.1.x game today, follow [Upgrade](install.upgrade.md): `quest-n-click migrate` does what these notes ask
of a game's sources (the `tsconfig.json` of 4.1.8, the former name of 4.3.0). Read these notes for what a host, a
Bridge operator or a tool of yours must change. The names `web-scumm…` they use are `quest-n-click…` since 4.2.5
([Coming from web-scumm](install.from-web-scumm.md)). The section numbers are those of the former
`docs/en/UPGRADING.md`, so "§27" still finds its section.

<a name="from-4-0-to-4-1"></a>

## 12. From 4.0 to 4.1 "Clarity"

Nothing to change in a game. The content format, the save envelope, the four public entries and the MCP tools are
those of 4.0.0 (`tests/api-surface.json` is the same); `npm install` of the new package is the whole upgrade, and a
4.0 save loads. In this repository: `npm run lint` is now `npm run lint:content` (the alias stays through 4.x), and
`npm run quality` adds Biome and the stricter TypeScript to what CI checks.

<a name="from-4-1-0-to-4-1-1"></a>
<!-- applies: 4.1.1.. -->

## 13. From 4.1.0 to 4.1.1 "Reality Bridge"

Nothing to change: every addition is optional. A game that wants signals from outside declares `reality`
([The Reality Bridge: what it is](bridge.what-it-is.md)), adds scenarios under `reality/scenarios/`, and runs a Bridge (`web-scumm bridge`, or the
package `web-scumm-bridge`). A 4.1.0 save loads; it gets a `reality` state only when a signal is applied.

<a name="from-4-1-1-to-4-1-2"></a>
<!-- applies: 4.1.2.. -->

## 14. From 4.1.1 to 4.1.2 "Reliable Bridge"

Nothing to change in a game. For a Bridge: a 4.1.1 `config.json` still serves and still grants (`grant` reads the
root key from it until `init` writes a `root.key`); behind a reverse proxy, start `serve --trust-proxy` so the limits
per address see the client's address; `doctor` reads the journal, `compact` shrinks it with the Bridge stopped. The
package `web-scumm-bridge` runs on Node alone now (no `tsx`). A 4.1.1 save loads; it gets its player id on the next
signal.

<a name="from-4-1-2-to-4-1-3"></a>
<!-- applies: 4.1.3.. -->

## 15. From 4.1.2 to 4.1.3 "Honest Gates"

Nothing to change in a game or a Bridge. In this repository: `npm test` no longer runs the CPU-bound solver tests
(`npm run test:heavy` does, nightly); `npm run build:game` builds a game without the unit suite; `release-check` is
longer (coverage, the Rust cross-check, mutation of the core). Contributions to `main` go through a pull request.

<a name="from-4-1-3-to-4-1-4"></a>
<!-- applies: 4.1.4.. -->

## 16. From 4.1.3 to 4.1.4 "Honest Engine"

Nothing to change in a game. A host that embeds the engine or the player gains `destroy()` to end them, `onError` to
hear what fails, and `beforeSave` / `onLoad` where it used to replace `store.save` or `engine.load` (do that no
more: the hooks compose). Fallback, kind and give lines may use `{item}`, `{target}`, `{name}`; `{objet}`,
`{cible}`, `{nom}` still work. A 4.1.3 save loads unchanged.

<a name="from-4-1-4-to-4-1-5"></a>
<!-- applies: 4.1.5.. -->

## 17. From 4.1.4 to 4.1.5 "Real Core"

Nothing to change in a game, and nothing in a host that uses the public API: `engine.session`, `begin`, `choose`,
`rand`, `destroy`, the hooks are where they were. A host that reached the engine's `@internal` fields `feed`, `open`
or `sessionT0` finds them on `engine.sessions` (`feed`, `open`, `t0`); one that reached the room view's `toScreen`,
`toLogical`, `setCamera`, `followHero`, `onCamera` or `cam` finds them on `view.camera`, and `walkTo`, `motion` and
`clampFloor` (now `clamp`) on `view.walker`. A 4.1.4 save loads unchanged.

<a name="from-4-1-5-to-4-1-6"></a>
<!-- applies: 4.1.6.. -->

## 18. From 4.1.5 to 4.1.6 "Studio Tool"

Nothing to change in a game. In a checkout, tsconfig.json's `@game` paths look through `.cache/game`, the link `npm run
game` makes (`dev`, `check` and `build` make it too), and fall back to `games/demo` when there is none; a
`package.json` whose `config.game` named a game still counts, after the link and `GAME`. `npm run build` no longer runs the pixel tests (`npm test` and CI
do). `npm run doctor` exits 0 when only Python, ffmpeg or WebKit are missing. `requirements.txt` pins its modules:
`pip install -r requirements.txt` again if yours are older. A 4.1.5 save loads unchanged.

<a name="from-4-1-6-to-4-1-7"></a>
<!-- applies: 4.1.7.. -->

## 19. From 4.1.6 to 4.1.7 "Docs for a Studio"

Nothing to change in a game or a host: 4.1.7 changes documentation, tests and the repository's templates, no code a
game runs. A 4.1.6 save loads unchanged. If you keep a fork of `AGENTS.md`, its rule 14 and the "Working in pairs"
section are gone; [Your first game](create.first-game.md) is the page to hand a newcomer.

<a name="from-4-1-7-to-4-1-8"></a>
<!-- applies: 4.1.8.. -->

## 20. From 4.1.7 to 4.1.8 "Foundation Reset"

A 4.1.7 save loads unchanged. A project's `tsconfig.json` written by `create-web-scumm` before 4.1.8 has `baseUrl: "."`
and non-relative `paths`, which TypeScript 7 refuses (TS5102, TS5090): `web-scumm migrate` rewrites it (the same
configuration, said relative to the file; a comment the file had is not kept), `--check` says when it is due. The engine's type checks run on TypeScript 7
(`npm run tsc`); a tool of yours that imports the compiler API (`import ts from 'typescript'`) finds no API in
`typescript@7` and imports `@typescript/typescript6` instead until 7.1 (docs/dev/MIGRATION-4.1.8.md). Vite 8 and
Vitest 5 need Node 22.12 or newer. The service worker claims the page at its first activation (`clientsClaim`), so a
first visit's warm-up fills the caches; an update still waits for the banner, after a durable save. Every name of
`web-scumm/{content,player,minigames,testing,reality}` carries `@public` or `@extension` in [Public API](engine.api.md): what
`src/engine` exports without an entry re-exporting it is internal, and about eighty such exports were un-exported or
removed (none of the five entries changed; `tests/api-surface.json` is identical). `npm run doctor -- --release`
requires Python, its modules and ffmpeg; `npm run quality:baseline` writes the READMEs' three figures with the JSON,
so a new test is followed by that command. A signal delivered and not acknowledged is delivered again from the
durable cursor: a custom transport implementing `WorldSignalPort` keeps the acknowledged sequence, not the received
one ([The Reality Bridge: what it is](bridge.what-it-is.md)).

<a name="from-4-1-8-to-4-1-9"></a>
<!-- applies: 4.1.9.. -->

## 21. From 4.1.8 to 4.1.9 "Gateways"

A 4.1.8 save loads unchanged; no public name of the five entries moved (`tests/api-surface.json` identical). A game
may declare `reality.connectors` (the words its connectors may propose: optional, validated). The connectors are a
fourth package, `web-scumm-connectors`, installed beside the Bridge on a server, never in the player: `npm run build`
now refuses a game's JavaScript that carries server code (`verify:dist`). `ssh2`'s install script attempts a native
build and fails for lack of headers: no `.node` file results, and `--ignore-scripts` is the documented install
([Connectors overview](bridge.connectors.md)). A contributor writes `changes/<slug>.md` instead of editing the CHANGELOG (`changes/README.md`).

<a name="from-4-1-9-to-4-1-10"></a>
<!-- applies: 4.1.10.. -->

## 22. From 4.1.9 to 4.1.10 "Constellation"

A 4.1.9 save, game and Bridge configuration keep working. **The player** accepts `WorldSignalV1` and the new
`WorldSignalV2` (ADR 0010: the signal names its tenant, environment, origin, link and key; `verifySignal` refuses a
V2 signed for another context with `audience-mismatch`, and a `keyId` other than the header's with `key`). A custom
verifier or transport that reads the payload sees `schema: 2` from a multi-tenant Bridge or from the Studio's
simulator, which signs V2 by default (`signalVersion: 1` keeps V1). `verifySignal`'s expectation takes `versions`,
`tenantId`, `environment`, `audience` and `sessionId`; `RealityClient` takes them as `context` and checks the page's
origin by default. **Announced break (4.1.12):** a single-tenant Bridge signs V1 by default during 4.1.10 and
4.1.11 (`init --signal-version=2` opts in); from 4.1.12 every Bridge signs V2 and the player accepts V2 only. A game
on 4.1.10 or later handles both, so upgrade the game before the Bridge.

**The Bridge** reads and writes through `RealityStore` (ADR 0009): code that called `Bridge` methods directly awaits
them now (`startPairing`, `claimPairing`, `revoke`, `forgetPlayer`, `exportPlayer`, `ack`, `unlink`, `subscribe`,
`streamAlive`, `playerOf`); the HTTP routes `/v1/*` are unchanged. `Bridge.start` accepts a 4.1.9 `BridgeStore` (as
the tenant `default`) or a `RealityStore`. The capability is drawn when the player claims its code (the claim also
returns the link's `sessionId`). A 4.1.9 `config.json` serves from its journal as before; `npm run bridge -- migrate
--from=jsonl --to=sqlite` (the Bridge stopped) moves it into SQLite, which needs Node 22.13 (`node:sqlite`).
`--trust-proxy` alone now trusts the loopback only; name other proxies with `--trust-proxy=<addresses or networks>`. **Behind a proxy that is not on the loopback (a PaaS's router, a load balancer on another host), every client now
falls into the proxy's one rate bucket** (60 anonymous requests a minute for everyone) until `--trust-proxy=<its
network>` names it.
Several tenants and several instances: [Install and run the Bridge](bridge.install-run.md).

<a name="from-4-1-10-to-4-1-11"></a>
<!-- applies: 4.1.11.. -->

## 23. From 4.1.10 to 4.1.11 "Viewport"

A 4.1.10 save loads unchanged; the five entries' names are additive (`SceneFrame`, `Renderer`, `Intent` on
`web-scumm/player` as `@extension`; `SemanticEvent`, `SemanticJournal` on `web-scumm/testing`; `Engine.journal`,
`Engine.sessionSeq`). What moved: the page's test hook `window.__game.inventory(…)` is
`window.__game.presenter.inventory(…)` (an e2e script of your own that called it changes one line); a session file now
carries the semantic journal and `npm run replay` exits 1 when the replay's differs (a session longer than 10 000
events is exported with `journalTruncated: true` and no journal); `npm run validate` refuses a layout whose occlusion
mask polygon closes no surface (collinear points, crossing edges) or whose room has a walk zone no link joins, where
4.1.10 accepted it: fix the layout in the Studio's Rooms tab (layers, masks, zones, portals) or by hand. The first
visit's JavaScript is 122 KB gzipped (120 in 4.1.10).

<a name="from-4-1-11-to-4-1-12"></a>
<!-- applies: 4.1.12.. -->

## 24. From 4.1.11 to 4.1.12 "Language"

No authoring format changes: `web-scumm migrate --check` finds the bundled games and the template up to date
(`tests/migrate-official.test.ts`; a 4.1.11 project has nothing to migrate either), and a 4.1.11 save loads unchanged (objectives completed are not part of the save: what holds when it loads
counts as done). What is new is additive. A game may declare `objectives` (ADR 0014, CONTENT_GUIDE "Objectives and
the quest journal"): the pause menu lists them, the semantic journal says `objectiveCompleted`, `npm run solve --
--goal=100%` reaches them, the validator refuses one that can never complete. A host that subscribes to
`Engine.journal` sees that kind for such a game. The pause menu has a fingerprint row in every game (`ui.fingerprint`,
English default "Build"): a game whose release language is not English adds that key, and `ui.objectives` when it
declares objectives, to its `ui` and its tables (`npm run i18n -- status` lists the keys left to the English
defaults). `web-scumm/content` gains `compileIR`, `canonicalJson`, `provenanceOf`, `logicView`, `completionGoal` and
the IR's types; `web-scumm/testing` gains `fingerprint`, `fingerprintGame`, `presentationOf`, `hashSources`,
`sha256Hex`, `shortFingerprint`; MCP gains `get_ir`, and `set_value` writes objectives with `id: "@game"`. A build now
ships `site.json` (the game's own with the trusted extensions' hash and the engine's version), which `npm run
verify:dist` expects. The solver's proof cache is keyed by `canonicalJson`: entries of 4.1.11 are not reused, the next
run fills it again. The DSL is stabilised (D22, `docs/dev/DSL-STABILITY.md`): from here a change to a stable name or
meaning ships with its migration.

<a name="from-4-1-12-to-4-1-13"></a>
<!-- applies: 4.1.13.. -->

## 25. From 4.1.12 to 4.1.13 "Solver Research"

A 4.1.12 save, game and Bridge keep working; no public name moved (`tests/api-surface.json` additive). The solver's
command gains `--checkpoint=<file>`, `--checkpoint-every`, `--resume`, `--mem=<MB>`, `--profile`, `--symmetry`,
`--workers` and `--representation=objects` (the 4.1.8 storage, for a comparison); a search a budget cuts is
`truncated`, never `proved`, before and after a resume. `npm run test:heavy` gained the matrix's checkpoint case and
`npm run prove:matrix` (the nightly's `matrix` job) proves the twelve instances of `docs/dev/PROOF-MATRIX.md`. A
softlock cause in `npm run solve -- --json` now carries its session entries, which `npm run replay` plays.

<a name="from-4-1-13-to-4-1-14"></a>
<!-- applies: 4.1.14.. -->

## 26. From 4.1.13 to 4.1.14 "Time Attack"

No authoring format changes: a 4.1.13 game and its saves load unchanged, and `speedrun` is an optional field
([Speedrun for authors](create.speedrun.md)). What a host or a tool may see differently:

- **`SESSION_MAX` is 500, not 5,000.** The 501st input of a session starts a new session from the current state (kind
  `load`), as the 5,001st did. A host that reads `Engine.session` (or `Engine.sessions`) to export a bug report gets at
  most the last 500 inputs: a long playtest is several session files, and a speedrun keeps its whole history in
  chained chunks of 500 (`web-scumm-runs` in IndexedDB). `replay()` now follows a session across its rollover.
- **`engine.random` is seeded by default.** It draws from the run's `logic` stream (xoshiro128**, `core/prng.ts`), not
  from `Math.random`. A host or a test that wants the old behaviour sets `engine.random = Math.random`; one that wants a
  known sequence sets `engine.sessions.nextSeed = '<seed>'` before `newGame()` or `checkpoint()` (the session then
  writes `Session.seed`). A session nobody seeded is written as before (no `seed`), and the recorded draws (`rnd[]`)
  still replay it.
- **The run clock** (`Engine.runClock`) is new and only observes; `Engine.clock` keeps its meaning.
- **`RealityClientOptions.onSigned(jws, entry)`** is called with each signal's signed JWS before it is applied (the
  speedrun keeps it as the Reality proof); a custom client may ignore it.
- **New interface texts** for a game with `speedrun`: `ui.speedrun`, `ui.exportRun`, `ui.abandonRun` (English
  defaults "Speedrun", "Export run", "Abandon run"); a game in another language adds them.
- **The release carries a ninth asset**, `web-scumm-<tag>-reference-any.wsrun`: a complete Any% run of the reference
  chapter, verified by `npm run speedrun:verify` before it is attached. A tool that counts a release's files counts it.
- **New public names**: `SpeedrunManifest`, `SpeedrunCategory`, `SpeedrunSplit`, `SpeedrunTrigger`, `SemanticTrigger`
  (content), `RunClock`, `verifyRun`, `isRankable`, `VerifyContext`, `SpeedrunVerifyResult`, `SpeedrunVerdict`,
  `SpeedrunEnvelope`, `TrustLevel` (testing); the MCP tool `speedrun_verify`; the CLI's `web-scumm speedrun verify`.

<a name="from-4-1-14-to-4-1-15"></a>
<!-- applies: 4.1.15.. -->

## 27. From 4.1.14 to 4.1.15 "Remix"

**A break of the 4.1 line: the save envelope v4.** A save is now written as `SaveEnvelopeV4` (`schema: 4`): the v3
envelope and the `WorldVariant` the game was played in. `parseSave` reads v3 and v4; a v3 save (every save made before
4.1.15) migrates to the **story** world (`upgradeEnvelope`) and loads as before; the golden saves of 3.0.0 to 4.1.9
load on 4.1.15 (`tests/save-v3.test.ts`). What breaks: code that wrote or read `schema: 3` itself (a host that stores
saves elsewhere, a tool that checks the envelope's schema) now sees `schema: 4` and a `variant` field; a save made in a
Remix world refuses to load into another world (`SaveWorldMismatch`, which names the world to rebuild with
`applyVariant`). A 4.1.15 save does not load on 4.1.14 (its schema is unknown there): downgrades are not supported.

**Everything else is additive.** A game may declare `remix` (a variation manifest) and its rooms `anchors`
([Remix](create.remix.md)); without them nothing changes: one world, the story, the same IR and the same fingerprint. The
reserved flags `remix.*` are written by the engine: a game that already used a flag named `remix.<something>` renames
it (the validator refuses a command that sets one; none in the bundled games). A game with a manifest shows a **Remix** button on its
title screen and a world row in its pause menu: a game whose release language is not English adds the `ui.remix*`
keys (`remix`, `remixTitle`, `remixStory`, `remixRandom`, `remixSeed`, `remixDaily`, `remixPlay`, `remixInvalid`,
`remixWorld`, `remixHidden`, `remixCopied`, `remixNoBridge`) to its `ui` and tables (`npm run i18n -- status` lists
the ones left to English). The built-in minigames gain `code-wheel`, and draw from `MinigameCtx.random` (the run's `minigame:<id>` stream) instead of
`Math.random`: a game's own minigame may do the same (`random(ctx)` falls back to a fixed stream when a host gives none). `Session.variant` and `IrVariantSlot.variant` are
new optional fields; `ir.world.remix` and `ir.rooms[].anchors` appear when a game declares them. New commands:
`npm run remix`, `npm run verify:variants` (part of `verify:game`), `npm run code-wheel`, `npm run e2e:remix`.

**The DSL and the IR are frozen** (D28, `docs/dev/DSL-STABILITY.md`): 4.1.15 is the release candidate of 4.2. From
here a change to a name or a meaning of the DSL or the IR waits for 4.2.0's strict SemVer, with its migration.

<a name="from-4-1-15-to-4-1-16"></a>
<!-- applies: 4.1.16.. -->

## 28. From 4.1.15 to 4.1.16 "Convergence"

**A break of the 4.1 line: the `.wsrun` envelope schema 2.** A run is now written with `schema: 2`: the run's
generator seed is `runSeed` (it was `seed`), the exact world it was played in is `variant`, and a Daily or Mystery run
carries the Bridge's signed tokens in `worldEvidence`; all of it is sealed into `h0`. A schema 1 file (4.1.14, 4.1.15)
is still read and verified, as a Story run; offered to a Remix category it is refused (`legacy-world-missing`). What
breaks: a tool that read `envelope.seed` reads `runSeed` on schema 2; an envelope with a field it does not define is
refused (`envelope-shape`). A recorder resumed from a 4.1.15 checkpoint refuses to go on (its world is not stored):
start the run again.

**A break for hosts that wrote their own `RunStore`** (Bridge library): the store is the durable queue's now
(`create`, `claimNext`, `complete`, `setTrust`, `queued`, `board`, `summary`); `MemoryRunStore` and `SqlRunStore` ship.
`DailyStore` is asynchronous (`get`, `putIfAbsent`); `SqlDailyStore` takes the tenant. A Bridge database migrates to
schema 2 (`runs`, `daily_kv`) on its next start; `bridge migrate --schema=1` goes back.

**Additive.** A speedrun category may name its world (`world: { policy, mode, fixedSeed?, codeWheel? }`, D29); 4.1.15's
`seed: 'daily' | 'mystery'` without `world` is read as that world, with a validator warning. A minigame's result is
recorded (`SessionEntry.mg`) and written in the reserved flag `minigame.<id>` (a command never sets one: the
validator refuses it); in the player every minigame played leaves that flag in the save. A Mystery reveal from the
Bridge carries a signed `token`. `bridge serve` mounts `/v1/runs` and the daily challenge when the configuration has
`runs` and `daily` sections (SQL store). New commands: `npm run e2e:remix-speedrun`, `npm run docs:truth`,
`npm run test:mutation:reality`, `test:mutation:remix`, `test:mutation:speedrun`. The golden save of 4.1.16 joins
`tests/save-v3.test.ts`; every older one still loads.

<a name="from-4-1-16-to-4-1-17"></a>
<!-- applies: 4.1.17.. -->

## 29. From 4.1.16 to 4.1.17 "Stabilization"

**A break for hosts that wrote their own `RunStore`** (Bridge library): `board(tenantId, gameId, categoryId, key,
limit)` is `board(query: LeaderboardQuery)` and returns ranked rows `{ run, rank }` (each pseudonym's best, ties
sharing a rank, then the limit); `admit(run, maxQueued)` (`created | duplicate | full`, one step under the tenant's
lock) is new and is what `RunQueue.submit` calls. `MemoryRunStore` and `SqlRunStore` implement both. A Bridge
database migrates to schema 3 (the ranked times made canonical, an index) and 4 (`run_quota`) on its next start;
`bridge migrate --schema=2` goes back.

**Behaviour.** `GET /v1/runs` answers 100 lines by default, `&limit=` up to 1 000 (it answered up to 10 000 runs
read in submission order, and could miss a faster one). A ranked time is stored canonical (`"00042"` is `"42"`).
`perMinute` holds for every instance of a tenant under `bridge serve` on a SQL store (a library host keeps the
per-instance `MemoryLimiter` unless it passes a `SqlLimiter`); a 429 says `Retry-After`. `runs.adminTokenFile` is
needed for the moderation route, and `serve` refuses a missing, short or world-readable file.

**Additive.** A minigame may return `{ result, transcript }` from `Presenter.minigame`; the code wheel does, and the
session keeps `SessionEntry.mgt` beside `mg` (ADR 0020); a speedrun category may ask `codeWheel.proof: 'transcript'`;
`medium: 'physical'` makes a run that played the wheel `valid-unranked` without a moderator. The Remix menu has a
Mystery entry. New commands: `npm run runs:load`, `npm run e2e:worker-container`, `npm run release-check:local`,
`npm run test:mutation:runs`, `npx tsx tools/oracle-case.ts`, `node tools/speedrun/container.mjs`. For maintainers:
`ship tag` needs `--candidate=<run id>` of a green `candidate` run started on main for that SHA. The golden save of
4.1.17 joins `tests/save-v3.test.ts`; every older one still loads.

<a name="from-4-1-17-to-4-1-18"></a>
<!-- applies: 4.1.18.. -->

## 30. From 4.1.17 to 4.1.18 "Dress Rehearsal"

**Nothing to change in a game.** No public name or format moves; a 4.1.17 save loads and reaches its ending, and a
4.1.17 project upgrades with `migrate` (the candidate does it on three systems).

**For a Bridge operator.** `BRIDGE_STORE_FILE` reads the store's URL from a file (a secret mounted as a file); named
and missing or empty, it stops the Bridge with why; `--store=` and `BRIDGE_STORE` still come first. `backup` writes
schema 2 on a SQL store: the leaderboards (`runs`) and the daily challenge's records too, which a 4.1.17 backup left
out — take a new backup after upgrading; `restore` reads both schemas and refuses existing runs without `--force`. `ops/qualify/` is a reference deployment (HTTPS, three instances,
Postgres) to carry elsewhere; `npm run ops:qualify` rehearses it. The release now also attaches
`web-scumm-connectors-<version>.tgz`.

**For maintainers.** The people's passes are Field Kit reports (`npm run field:init|check|report|bundle`,
[Field passes](contribute.field-passes.md)) and open `field-pass` issues; the release notes count only `passed` as done. Every mutation set is
gated (`connectors` and `reality-store` too); `release.yml` asks the tag's own `GATED`. `npm run external-consumer`
installs the four archives outside the repository. The golden save of 4.1.18 joins `tests/save-v3.test.ts`.

<a name="from-4-1-18-to-4-1-19"></a>
<!-- applies: 4.1.19.. -->

## 31. From 4.1.18 to 4.1.19 "Field Closure"

**Nothing to change in a game.** No authoring name or meaning moves (the DSL window of D33 admitted nothing); a 4.1.18
save loads and reaches its ending, and a 4.1.18 project upgrades with `migrate`. The candidate moves games made on
4.1.17, 4.1.16 and 4.1.18-rc.1 to the new archives, each older engine checked against its release's sums first.

**For a Bridge operator.**

- `backup` writes **schema 3** (ADR 0021): one read-only snapshot of every tenant, run and daily record, with the
  backend, the Bridge and SQL schema versions, the counts and a SHA-256 of the payload, written to a temporary file
  then renamed. `--max-rows` and `--max-bytes` bound it. Take a new backup after upgrading.
- `restore` reads schemas 1, 2 and 3, bounded, checks every row before it opens the store, and writes everything in one
  transaction compared with the file before it commits. A failure leaves the store as it was and says "nothing
  restored"; exit code 3 means the commit's outcome is unknown, or the read-back after it differs (a P0): check the store before
  trying again. A daily record
  already held is now a conflict: refused without `--force`, replaced with it.
- **Breaking:** `restore` into the JSON-lines journal is refused. Migrate the journal first
  (`migrate --from=jsonl --to=sqlite`), then restore.
- The Bridge and connectors archives carry their `npm-shrinkwrap.json`: an install resolves nothing.
- The release attaches the Bridge's qualification image as the candidate built and qualified it:
  `web-scumm-bridge-image-<tag>.tar`, its identities in `web-scumm-bridge-image-<tag>.json` (config digest, OCI
  manifest digest, archive SHA-256) and its SBOM. `ops/qualify/`'s Caddy runs unprivileged and read-only.
- `npm run ops:qualify` now also rehearses Daily and Mystery across instances, a run verified, its duplicate and its
  moderation, an instance killed while its worker verifies, the shared submission quota, 20 000 runs, a restore after
  the topology is destroyed, and a store made by the 4.1.17 Bridge (`--old-bridge=<tgz>` offline). `--short` (the
  candidate's `deployment-smoke`) leaves out the takeover, the quota and the 4.1.17 store, and puts 200 runs on the board.

**SBOMs.** Five CycloneDX files, made by the candidate from what each archive holds: `web-scumm-<tag>-sbom.cdx.json`,
`create-web-scumm-<tag>-sbom.cdx.json`, `web-scumm-bridge-<tag>-sbom.cdx.json`,
`web-scumm-connectors-<tag>-sbom.cdx.json` and `web-scumm-bridge-image-<tag>-sbom.cdx.json`. The first keeps its name
but changes meaning: it describes the **engine package** as a game installs it (Vite and its tools included), no
longer the repository root's runtime dependencies. A tool that read it as the latter reads the root's `package.json`
instead.

**For maintainers.**

- The mutation set `connectors` is renamed `connectors-pure`; the old name is an alias until 4.2 (`--set=connectors`
  still works, and `release.yml` maps an older tag's name). `connectors-edge` and `reality-store-postgres` are
  measured every night and gate nothing yet (`docs/dev/MUTANTS.md`).
- The locks of the Bridge and the connectors live in `scripts/locks/` (`npm run locks`, then commit); a lock that no
  longer fits its `package.json` stops `pack`.
- A Field Kit bundle is schema 2: it carries the candidate's manifest and its attestation, and
  `npm run field:verify-bundle` checks it from the bundle alone (offline against a saved trusted root, or online).
  `ship` and the Field Kit share `tools/release/provenance.mjs`.
- `npm run connector-archive-e2e` plays the four connectors from their archives. The Vite configuration no longer
  loads the Studio; a plugin of yours that imported Studio code from `vite.config.ts` loads it through the dev server.
- The golden save of 4.1.19 joins `tests/save-v3.test.ts`.

<a name="from-4-1-19-to-4-1-20"></a>
<!-- applies: 4.1.20.. -->

## 32. From 4.1.19 to 4.1.20 "Last Mile"

**For operators of a Bridge.**

- **`restore` says its mode.** `restore --from=<file>` without `--mode` is refused (exit code 2) and restores
  nothing. A script of 4.1.19 adds `--mode=merge`: 4.1.19's restore unchanged for a file of schema 1 to 3 (`--force`
  included); a schema 4 file also speaks for its tenants' speedrun quotas, unless it is a journal's (`tenants-only`).
  `--mode=replace-store --yes-replace-store --safety-out=<new file>` is new: it makes the store the backup
  ([Install and run the Bridge](bridge.install-run.md)).
- **A backup is schema 4.** It carries the speedrun quota, says what it holds (`completeness`) and has a digest of the
  whole envelope. Files of schemas 1 to 3 are still read, for `--mode=merge` only: nothing under their digest says that
  they hold every family, so `replace-store` refuses them. Two backups of the same store no longer share a digest,
  since it covers their dates. **A 4.1.19 Bridge cannot read a schema 4 file**: going back to 4.1.19 after a backup
  taken by 4.1.20 needs a backup taken by 4.1.19 (or `pg_dump`).
- **Maintenance leases (schema 5).** The store goes to schema 5 when a 4.1.20 Bridge or command opens it (migration
  0005, the `maintenance` table). From then on `restore` refuses while any instance serves or any command writes.
  **Stop every Bridge older than 4.1.20 before the first restore**: an older Bridge takes no lease and would not be
  seen. `migrate --schema=4` (or lower) undoes 0005 first; stop every writer for it, as before 4.1.20.
