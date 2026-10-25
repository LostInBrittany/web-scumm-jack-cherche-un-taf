# Speedrun for authors

A game made with quest'n'click can declare speedrun categories as content. A player starts an attempt from the pause
menu, the engine times it, splits it on what happens in the game (never on pixels), and seals the run into a `.wsrun`
file that anyone can replay and verify. This page is for the author: declaring the categories and splits, checking a
run, and offering leaderboards. The player's side (the timer, LiveSplit, OBS) is in
[Speedrun for players](play.speedrun.md).

<a name="what-you-get"></a>

## What you get

Your game offers one or more speedrun categories (Any%, No Hints, a Remix world…) with automatic splits; a run a player
exports as `.wsrun` is verified on your machine with one command, which gives a verdict, a code and a reason; and,
when you run a Reality Bridge, its leaderboards rank the runs its isolated workers found valid.

<a name="context-and-versions"></a>

## Context and versions

- The engine repository or a created project: categories are content (`GameDef.speedrun`), the verifier exists in
  both.
- Speedrun arrived in 4.1.14 ("Time Attack"). The world policy (`world`) and the `.wsrun` schema 2 are from 4.1.16;
  the code wheel's transcript proof, the Mystery world in the player and the shared queue limits from 4.1.17. This page
  describes 4.1.17 and later.
- Leaderboards and the daily challenge need a Reality Bridge on a SQL store
  ([Install and run the Bridge](bridge.install-run.md)).

<a name="prerequisites"></a>

## Prerequisites

- A game that can be finished: `validate` and `solve` green ([Checking your game](create.checking.md)).
- Objectives or flags to split on ([Chapters and objectives](create.chapters.md)).
- For worlds other than the story: a Remix manifest ([Remix](create.remix.md)).

<a name="where-to-run"></a>

## Where to run the commands

- Editing `game.ts`: in your game's folder (`games/<id>/` in the engine repository, the project root in a created
  project).
- Verifying a run: in the engine repository (`npm run speedrun:verify`, the game chosen by `GAME=<id>` or
  `npm run game`), or in the created project (`npx quest-n-click speedrun verify`).
- Leaderboards: on the machine that runs the Bridge.

<a name="overview"></a>

## How a run is timed and proved

The engine's run clock observes the game and never writes its state; the run's random draws come from a seeded
generator; the inputs are recorded in chunks chained by SHA-256 and sealed into the `.wsrun`. A verifier replays them
on the real game and recomputes everything. The design is in
[ADR 0016](../../docs/dev/adr/0016-run-clock-and-envelope.md) (the clock, the seeded generator, the chained proof) and
[ADR 0017](../../docs/dev/adr/0017-speedrun-verdicts-and-trust.md) (verdicts and trust); the clock and the generator
are explained in [Execution model](engine.execution-model.md#time-and-randomness).

> [!LIMIT id=not-anti-cheat]
> Nothing here promises to detect every cheat. A replay proves a run is possible and its in-game time exact; only a
> server's or a human's observation raises the trust further ([Trust levels](#trust)).

<a name="steps"></a>

## Steps

<!-- step: categories -->
1. **Declare the categories and splits** in `game.ts` (content only: a new category needs no change in the engine):

   ```ts
   // games/<id>/game.ts (engine repository) or game.ts (created project)
   speedrun: {
     rulesVersion: 1,
     categories: [
       { id: 'any%', name: 'Any%', timing: 'igt',
         start: { event: 'sessionStarted', session: 'new' }, finish: { event: 'endingReached' },
         allowSaves: true, allowPauses: true, allowHints: true, reload: 'allowed', realityPolicy: 'forbidden',
         fingerprint: ['logic', 'trustedExtensions'],
         inputs: { mouse: true, touch: true, keyboard: true, gamepad: true, macros: 'forbidden' } },
     ],
     splits: [
       { id: 'ladder', name: 'Ladder', at: { event: 'objectiveCompleted', objective: 'ladder' } },
       { id: 'end', name: 'Festival', at: { event: 'endingReached' } },
     ],
   },
   ```

   Every field is described in [Defining categories](#categories).

<!-- step: validate -->
2. **Validate.** The validator checks the manifest:

   ```sh
   # in the engine repository
   npm run validate
   # or in the created project
   npx quest-n-click validate
   ```

<!-- step: record -->
3. **Record a run.** Play the game (`npm run dev`), open the pause menu, start an attempt in a category, play to the
   finish, then "Export run" in the pause menu: the browser downloads `<game>-<category>.wsrun`. The Studio's Play tab
   exports one too.

<!-- step: verify -->
4. **Verify it.**

   ```sh
   # in the engine repository, the game selected
   npm run speedrun:verify -- run.wsrun [--keys=bridge-keys.json] [--json] [--timeout=<ms>]
   # or in the created project
   npx quest-n-click speedrun verify run.wsrun [--keys=<file>] [--json]
   ```

   The MCP tool `speedrun_verify` does the same for an assistant. Exit 0 for `valid` and `valid-unranked`, 1 for every
   other verdict, `inconclusive` included; 2 without a file.

<!-- step: leaderboard -->
5. **Offer leaderboards (optional).** Add a `runs` section (and a `daily` section for Daily and Mystery worlds) to the
   Bridge's configuration, on a SQL store: see [Leaderboards on the Bridge](#leaderboards).

<a name="expected-result"></a>

## Expected result, and how to check it

`speedrun:verify` prints `✔  <verdict> (<code>): <reason>`, then the trust, the game and the engine, the world and its
leaderboard key, and the recomputed IGT, active IGT and steps; with `--json`, the whole result as canonical JSON. A run of your own, played honestly to the finish, gives `valid` (`ok`) for an IGT category and
`valid-unranked` (`rta-unverifiable`) for an RTA one. The repository's own example is
[`tests/fixtures/speedrun/reference-any.wsrun`](../../tests/fixtures/speedrun/reference-any.wsrun): a complete Any% run
of the reference chapter (schema 2, made by [`tools/speedrun/reference-run.ts`](../../tools/speedrun/reference-run.ts)),
verified by a test and by the release workflow, which attaches it to every release. 4.1.15's schema 1 file is kept as a
golden fixture (`reference-any.v1.wsrun`).

> [!GUARANTEE id=altered-run-refused]
> A copy of the reference run altered after it was sealed is refused, with its reason, and `speedrun:verify` exits 1.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `validate` refuses the manifest | an unknown event, an id that names nothing, a start equal to the finish, a category without an input, a Reality policy without `reality`, a split that is its own ancestor, `reload: 'segment'` | fix the field the message names |
| `validate` warns | a flag never set; a category that does not require `logic` | add the missing rule, or `logic` to `fingerprint` |
| `modified-game` (`fingerprint`) | the game changed since the run was recorded, in a component the category requires | verify against the game the run was played on |
| `unsupported-version` (`engine-version`) | the run was recorded on another engine version | verify with that version's archive |
| `unsupported-version` (`rules-version`) | you changed `rulesVersion` | expected: an old run is never requalified |
| `invalid-category-rule` (`legacy-world-missing`) | a schema 1 file (4.1.14, 4.1.15) offered to a Remix category | it can only be read as a Story run |
| `inconclusive` (`no-keyring`) | a `recorded` or `live` category, verified without the Bridge's keys | pass `--keys=` (from `GET /v1/keys`) |

The full list of verdicts and codes is in [Verifying a run](#verify).

<a name="files-changed"></a>

## Files or data changed

`game.ts` (the `speedrun` section). The player keeps runs and records in the browser's IndexedDB. A Bridge with a `runs`
section writes the runs and their verdicts in its SQL store.

<a name="recovery"></a>

## Recovery or going back

Removing a category or changing its rules does not touch the runs already exported; raise `rulesVersion` when the rules
change, so an old run is never ranked under new rules. A run deleted from a leaderboard is gone: `DELETE` is not
reversible.

<a name="categories"></a>

## Defining categories

`GameDef.speedrun` (types in [Public API](engine.api.md), checked by `npm run validate`) holds `rulesVersion`,
`categories` and `splits`. A category (`SpeedrunCategory`):

| Field | Values |
|---|---|
| `id`, `name` | the id and what players read (the leaderboard, the overlay) |
| `timing` | `rta`, `igt` or `active-igt` ([Timing](#timing)) |
| `start`, `finish` | a semantic trigger |
| `allowSaves`, `allowPauses`, `allowHints` | booleans (the autosave always runs; a hint is recorded by the session) |
| `reload` | `invalidates` (a load disqualifies) or `allowed` (a state the run itself reached); `segment` is reserved, refused by the validator |
| `realityPolicy` | `forbidden`, `recorded` or `live` ([Reality policies](#reality-policies)) |
| `fingerprint` | the components a run must match: `logic`, `trustedExtensions`, `presentation`, `engine` ([Policies](#policies)) |
| `inputs` | `{ mouse, touch, keyboard, gamepad, macros: 'forbidden' \| 'allowed' }` |
| `seed` | the run's generator: `fixed` (every run draws from `fixed:<id>`) or `random` (default, a fresh seed per run) |
| `world` | the world the run is played in (4.1.16, [below](#worlds)) |

A trigger names a semantic event (`roomEntered`, `itemAcquired`, `itemLost`, `flagChanged`, `objectiveCompleted`,
`endingReached`, `sessionStarted`, `playerSwitched`…) and the fields it must match (`room`, `item`, `flag` with
`value`, `objective`, `ending`, `player`, `session`). No pixel is ever read.

The rules carry their version: a change never requalifies an old run (`rulesVersion` differs:
`unsupported-version`). The validator refuses unknown events, ids that name nothing, a start equal to the finish, a
category without an input, a Reality policy without `reality`, a split that is its own ancestor; it warns about a flag
never set and a category that does not require `logic`. A category defined in content only touches no engine code:
[`tests/speedrun-manifest.test.ts`](../../tests/speedrun-manifest.test.ts) proves it with a fixture game.

The reference chapter ([`games/reference/game.ts`](../../games/reference/game.ts)) declares Any%, Any% No Hints, Real
Time, Remix Fixed (`WS-0000-02DZ`), Remix Random, Daily, Mystery and Any% (wheel proved).

<a name="worlds"></a>

## Worlds: Story, Fixed, Random, Daily, Mystery

Since 4.1.16 (D29, [ADR 0019](../../docs/dev/adr/0019-run-world-binding.md)) the world a run is played in is `world`:

- `{ policy: 'story' }` (the default when `world` is absent);
- `'fixed'` with its published `fixedSeed`;
- `'random'`: any world of `mode`, ranked together; the seed is drawn at the start and shown;
- `'daily'`: the Bridge's signed seed of the day;
- `'mystery'`: a seed the Bridge commits to before the start.

Each names the Remix `mode` its worlds come from, and may say what it allows of the code wheel in `codeWheel`
([Trust levels](#trust)). Fixed and Daily rank each seed apart (`leaderboardKey`), and `worldVerdict` checks a run's
world against what its category allows. 4.1.15's `seed: 'daily' | 'mystery'` without `world` is read as that world (a
random run in it), with a deprecation warning from the validator.

<a name="timing"></a>

## Timing: RTA, IGT, Active IGT

- **RTA**: the page's monotonic clock from the start trigger to the finish. Never reproducible, never an authority: a
  run timed on `rta` replays as valid but stays unranked without a witness.
- **IGT** (`logicalTime`): the sum of the declared durations of what the engine ran
  ([`src/engine/core/timing.ts`](../../src/engine/core/timing.ts), `TIMING_VERSION = 1`): a line 2.2 s whatever its
  text or language, a walk its distance over the walk speed between logical anchors, a `wait`, an animation, a camera
  pan, a motion their milliseconds; a skipped cutscene costs nothing. Think time is not in it. In microticks (1 ms =
  1,000), a `bigint` written as a decimal string.
- **Active IGT**: IGT minus what ran inside a cutscene.
- **Logical steps**: one per input of the session.

The run clock (`Engine.runClock`) observes the engine and never writes the state (D24).

<a name="splits-routes"></a>

## Splits, routes, records and the ghost

Splits are automatic: each fires once, the first time its trigger matches after the start; a split that never fires is
marked missed and the run goes on. A `parent` makes a sub-split. Records compare a run to the personal best (ahead or
behind at each split), keep the best segment of each split and their sum.

A **route** is a `.wsroute` file (canonical JSON): the inputs of a run, optionally its splits. The Studio's Play tab
exports the session in its frame as a route, imports one, and compares two (first different input, splits' deltas).
The solver's witness becomes a **logical route** (`kind: 'logical'`): a reference for routing, never a record.

<a name="proof"></a>

## The proof: `.wsrun`

Schema 2 since 4.1.16 (`SpeedrunEnvelopeV2`, ADR 0019). It holds the game, its fingerprint (the game as written,
before any world), the engine's, generator's and durations' versions, the category and its rules' version, the run's
generator seed (`runSeed`), the exact world played (`variant`, assignments included, never regenerated from a seed)
and, for a Daily or Mystery world, the Bridge's signed tokens (`worldEvidence`); the timing (RTA, steps, IGT, active
IGT, the declared pauses, menus, background and loads), the splits, the entries in chunks of 500 chained by SHA-256
from `H0` (the rules) to `Hn`, the loads, the inputs used, the Reality signals, the final state's hash and the final
proof.

`H0` seals the world too (its hash, the category's world policy, the evidence's hash, the Remix algorithm's version):
the same inputs in two worlds are two runs. Every hash is over `canonicalJson`. The exported trust is always `local`.
A schema 1 file (4.1.14, 4.1.15) is still read, as a Story run.

> [!GUARANTEE id=schema1-not-requalified]
> A schema 1 run offered to a Remix category is refused (`legacy-world-missing`), never requalified from its seed.

The format, field by field, is in [File formats](engine.file-formats.md).

<a name="verify"></a>

## Verifying a run

The verifier reloads the category from the game, checks the run's world against the game (`loadVariant`) and its
category (`worldVerdict`, the day's token or the Mystery commitment and reveal checked with the key `remix.daily`
names), rebuilds that world, replays the entries with the run's seed (the random draws are drawn again, never taken
from the file), recomputes the clock, the splits, the final state and the chain, then checks the rules, and names the
leaderboard the run goes to (`world.leaderboardKey`: the category, and for Fixed and Daily the seed).

| Verdict | Codes |
|---|---|
| `valid` | `ok` |
| `valid-unranked` | `rta-unverifiable`, `mystery-unwitnessed` (a Mystery run: when it started is the client's word), `physical-wheel-unwitnessed` |
| `invalid-category-rule` | `unknown-category`, `hints-forbidden`, `saves-forbidden`, `pauses-forbidden`, `reload-forbidden`, `foreign-load`, `input-forbidden`, `reality-forbidden`, `seed-policy`, `start-trigger`, `world-policy`, `legacy-world-missing`, `daily-proof-missing`, `daily-proof-invalid`, `mystery-commitment`, `mystery-reveal`, `mystery-start-window`, `code-wheel-rule`, `code-wheel-proof` |
| `invalid-replay` | `envelope-shape`, `chunk-order`, `chunk-hash`, `chain`, `replay-diverged`, `rnd-mismatch`, `time-mismatch`, `splits-mismatch`, `final-state`, `not-finished`, `world-missing`, `world-shape`, `world-hash`, `world-value`, `world-constraint`, `world-stale`, `world-forged`, `world-algorithm`, `minigame-transcript` |
| `modified-game` | `fingerprint` |
| `missing-reality-proof` | `signal-missing`, `signal-signature`, `signal-mismatch` |
| `unsupported-version` | `schema`, `engine-version`, `prng-version`, `timing-version`, `rules-version` |
| `inconclusive` | `timeout`, `crash`, `no-keyring`, `package-not-approved` (the Bridge's worker) |

`inconclusive` is never valid.

<a name="trust"></a>

## Trust levels

`local` (timed by the player's machine) → `replay-valid` (a verifier other than the client replayed it) →
`server-witnessed` (the server dated the run's chunks as they were played: reserved, no code sets it yet) →
`moderator-verified` (a human with the leaderboard's admin token looked at it). Only someone other than the client
raises a level; an envelope that claims more is read as `local`. The level shows in the records, the Studio and the
leaderboard.

What `replay-valid` proves (4.1.17): the run replays on the game, category and world it names; its chain, draws, final
state and logical time agree; each minigame result that came with a **transcript** is the result its answers give (the
code wheel's answers, by their place in the author's list, judged again on the wheel the world makes;
[ADR 0020](../../docs/dev/adr/0020-minigame-transcripts.md)). It does not prove that a person produced those answers, that `inputsUsed`, the pauses
or the RTA are complete, that a printed wheel was used, or that the envelope was not made outside the player: that is
`server-witnessed` or `moderator-verified`, never "anti-cheat".

The code wheel in a category's `world.codeWheel` (`{ enabled, skip, medium, proof? }`):

- `enabled: false` wants it not played (skipped or disabled); played anyway: `code-wheel-rule`.
- `skip: false` wants it won.
- `proof: 'transcript'` refuses a wheel result without its answers (`code-wheel-proof`); a forged transcript is
  `invalid-replay` (`minigame-transcript`).
- `medium: 'physical'`: a run that played the wheel is `valid-unranked` (`physical-wheel-unwitnessed`) until a
  moderator ranks it. `digital` and `either` are the player's word, not checked.

The reference chapter's `wheel-proved` category wants the wheel won and proved whenever it is played (the wheel stays
optional: a route that never opens the map does not play it); its other categories keep 4.1.16's rule.

<a name="reality-policies"></a>

## Reality policies

- `forbidden`: no signal from outside; a signal in the run is `reality-forbidden`.
- `recorded`: every signal applied is kept with its signed JWS, its key id and its hash; the verifier checks the
  signature with the Bridge's public keys (`--keys`, `GET /v1/keys`). No proof: `missing-reality-proof`.
- `live`: the same proof, in a category of its own (the latency and the availability of a live signal are not
  reproducible). Without the keys the verifier cannot conclude (`no-keyring`).

What the Bridge guarantees about signals is in [Bridge guarantees](bridge.guarantees.md).

<a name="leaderboards"></a>

## Leaderboards on the Bridge

[`bridge/src/runs.ts`](../../bridge/src/runs.ts) is mounted by `npm run bridge -- serve` when the configuration has a
`runs` section (4.1.16; `bridgeServer`'s `runs` option for a host of your own); [`bridge/src/daily.ts`](../../bridge/src/daily.ts)
by a `daily` section. Both keep their records in the SQL store (`--store=sqlite:<file>` for one machine, or
`BRIDGE_STORE=postgres://…` for several instances; `serve` refuses them on the JSON-lines journal), migrations 0002 to
0004. They survive a restart.

```json
"runs": {
  "games": { "reference": { "dir": "/srv/games/reference", "fingerprint": { "logic": "…", "trustedExtensions": "…", "presentation": "…", "engine": "…" } } },
  "worker": ["/usr/bin/node", "/srv/quest-n-click/node_modules/tsx/dist/cli.mjs", "/srv/quest-n-click/tools/speedrun/worker.ts"],
  "workers": 2
},
"daily": { "games": { "reference": { "daily": "daily", "mystery": "mystery" } }, "kid": "daily-2026", "keyFile": "daily.jwk", "secretFile": "daily.secret" }
```

`keyFile` (the Ed25519 private JWK whose public half the game's manifest names in `remix.daily`) and `secretFile` (the
days' secret) sit beside `config.json`, mode 0600. Rotating the daily key is a release of the game with the new public
key: the player and the verifier accept only the key the manifest names, so a token of another `kid` is refused.

**Submitting.** `POST /v1/runs` with `{ player, envelope }` returns the run's id and a deletion token. Every instance's
workers share one queue: a run is **created once** (its key is unique: two instances receiving the same run create
one), **claimed by one worker** under a lease, and **claimed again** when its worker died and the lease expired; a
worker that lost its lease cannot store a verdict. The HTTP process never replays.

**The worker.** Each worker is an isolated process ([`tools/speedrun/worker.ts`](../../tools/speedrun/worker.ts)): a
bounded heap, killed with its process group at its time budget, an environment holding only `PATH`, the game package's
folder and the heap size (no secret of the Bridge), fetch, WebSocket, TCP, UDP and DNS refused in-process, the package
checked against its approved fingerprint, its answer signed with a one-time key.

> [!LIMIT id=worker-not-sandbox]
> The worker's network refusals are defence in depth, not a sandbox: see the speedrun worker in
> [Bridge security](bridge.security.md).

**Identity of a run.** A run is identified by its game, category, run seed and inputs (their RTA stamps aside), never
by its world: the first submitter keeps it; a copy re-stamped or re-sealed in another world is refused.

**Limits.** A client may submit `perMinute` runs a minute (default 10); a duplicate or an invalid run costs a token, a
refusal says `Retry-After`. The queue holds at most `maxQueued` runs waiting or being verified (default 100). Under
`bridge serve` on a SQL store both hold for every instance together (4.1.17): `maxQueued` is counted and written in one
transaction under the tenant's lock, and `perMinute` is a bucket per client in the table `run_quota`. The client is the
socket's address, or the one a trusted proxy names (`--trust-proxy`); only an HMAC of it is stored, with a secret every
instance of the tenant derives from its event key. Rotating the event key (`kid`) rotates that secret too: every client
starts a new bucket (at most one more minute's quota), and the old buckets are purged with the idle ones. A library host
without a SQL limiter counts per instance. A global rate limit at the proxy stays a good idea in front of it all. The
envelope is dropped once the verdict is stored; old runs are purged hourly.

**Reading a leaderboard.** `GET /v1/runs?game=&category=[&key=][&limit=]`: valid runs only, each **pseudonym's** best
(the Bridge knows no player identity: two people who choose the same pseudonym are one line), on the **verifier's key**
(`world.leaderboardKey`: the category, and for a Fixed or Daily world `<category>:<seed>`). Equal times share a rank,
then the earlier submission comes first. The store ranks every run before the answer is cut (4.1.17: until then a
faster run submitted after the first 10 000 was missing); the answer has 100 lines, `&limit=` up to 1 000. A time is
kept canonical (decimal, no leading zero, at most 30 digits) and ordered as a decimal, past `Number.MAX_SAFE_INTEGER`
too. A Daily run sent after its day is practice (valid, not ranked); a Mystery run is `valid-unranked` without a server
witness. `&seed=fixed|random` still filters 4.1.14's runs.

**One run.** `GET /v1/runs/<id>` reads it, `DELETE /v1/runs/<id>` with `x-delete-token` deletes it,
`POST /v1/runs/<id>/moderate` with the admin token raises a valid run to `moderator-verified`. Submissions, verdicts,
moderations and deletions are audit lines on the Bridge's log.

**The daily challenge.** `GET /v1/daily?game=[&date=]` signs the day's seed (a real UTC day, today or within
`retentionDays`, 30 by default); `POST /v1/commit` and `GET /v1/reveal/<id>` commit to a Mystery seed and reveal it,
both signed. Tokens and commitments are written once in the same SQL store, so every instance answers the same. The
player keeps a Daily world's token beside the world, and a speedrun in it carries the token. Since 4.1.17 the Remix
menu has a **Mystery world** entry: it asks the game's Bridge for a commitment, then its reveal, verifies both offline
with the game's daily key, builds the world and keeps both tokens beside it. A speedrun started in it (within the minute
the reveal allows: after it the page says so and does not start the run) carries them and its start time. Without a
server witness such a run is `valid-unranked` (`mystery-unwitnessed`).

A run interrupted and resumed keeps its world and its proof: resuming it in another world, or with another proof, is
refused (`npm run e2e:remix-speedrun` does it in each world). Running the Bridge itself is in
[Install and run the Bridge](bridge.install-run.md#leaderboards).

<a name="policies"></a>

## Policies

- **Mods and extensions**: a category names the fingerprint components a run must match. `logic` alone admits a mod
  that changes the art or the music; `trustedExtensions` refuses one that changes the game's code; `presentation`
  refuses any change of art. A run whose components differ is `modified-game`.
- **Old engine versions**: a run is replayed by the engine it was recorded on. The verifier replays its own version
  only and says `unsupported-version` (`engine-version`) for another one: replay it with that version's archive.
- **Retention**: a leaderboard keeps a run 90 days by default (`retentionDays`), and deletes it on request with the
  token given at submission.
- **Anonymity**: a leaderboard shows a pseudonym (2 to 32 letters, digits, spaces, `_ . -`; an email is refused) and
  never anything else about the player. Pseudonyms are **not authenticated**: anyone may submit under any name, and
  anyone may submit a published run first under theirs.
- **Ghosts on semantic targets**: a ghost shows rooms, actions on ids and the inventory, never a pixel trail; it is off
  the first time a category is played.

<a name="fairness"></a>

## Accessibility and fairness

A category declares its inputs (mouse, touch, keyboard, gamepad, macros). An accessibility option is **never an
implicit cheat**: the text speed, the text size, reduced motion and the readable font change nothing in the in-game
time (a line costs the same logical time at every speed), and the keyboard's and the screen reader's targets are the
same actions. A category that forbids an input says so; the inputs a run used are declared by the client (the client's
word, like RTA). The player's accessibility options are in [Accessibility](play.accessibility.md).

<a name="limits"></a>

## Limits

> [!LIMIT id=integrity-not-authenticity]
> Integrity is not authenticity: the chain proves a file was not altered after it was sealed, not that the client was
> honest; a client can recompute it. Pauses, menus, saves, RTA and the inputs used are the client's word.

- **`replay-valid` admits tool-assisted runs**: a run whose inputs a script or the solver chose replays valid (the
  committed reference run is the solver's route), and so does a run resumed after a crash (the inputs lost after its
  last chunk are not in its time). Only a witness or a moderator rules them out.
- **The seed of a random-seed category is the client's choice**: a player can search seeds offline for an easy one.
  Mystery and Daily seeds, given by a server, are the answer (since 4.1.15).
- **Not done yet**: the live witness (`server-witnessed`), the pinned-version replay in the worker, real OBS and
  LiveSplit sessions and field tests by speedrunners (human passes). What 4.1.14 listed here and was done since: a SQL
  store for the runs and the `/v1/runs` mount in `bridge/src/server.ts` (4.1.16), the cross-browser e2e
  (`npm run e2e:speedrun`) in CI.

<a name="references"></a>

## References

- [ADR 0016](../../docs/dev/adr/0016-run-clock-and-envelope.md), [ADR 0017](../../docs/dev/adr/0017-speedrun-verdicts-and-trust.md),
  [ADR 0019](../../docs/dev/adr/0019-run-world-binding.md), [ADR 0020](../../docs/dev/adr/0020-minigame-transcripts.md).
- The types: [`src/engine/core/types/speedrun.ts`](../../src/engine/core/types/speedrun.ts); the verifier:
  [`src/engine/tools/speedrun/verify.ts`](../../src/engine/tools/speedrun/verify.ts) and
  [`tools/speedrun/verify.ts`](../../tools/speedrun/verify.ts).
- [Remix](create.remix.md), [File formats](engine.file-formats.md), [Speedrun for players](play.speedrun.md),
  [Install and run the Bridge](bridge.install-run.md).
