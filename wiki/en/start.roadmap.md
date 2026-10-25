# Roadmap

Where quest'n'click comes from, what was decided to stay out, what each release left open and where each of those items
stands at 4.4.0, and what comes next. The full release-by-release history is the [changelog](reference.changelog.md)
and the roadmap as it was written, kept at
[`blob/v4.4.0/docs/en/ROADMAP.md`](https://github.com/Quest-n-Click/quest-n-click/blob/v4.4.0/docs/en/ROADMAP.md).

<a name="overview"></a>

## From v1.3 to 4.4, in short

The roadmap started on 3 October 2026 from an external audit of v1.2.1, framed as "from a reactive engine to a world
engine (v1.3 → v2.0)". Every release since added its section: M1 "World" to M5 "Open" (v1.3 to v2.0), v2.1 "Proof" to
v2.5 "Sound", v3 "Trust" to 3.9 "Independence", 4.0 "Stable Platform", the 4.1.x line (4.1.0 "Clarity" to 4.1.20 "Last
Mile", with the 4.1.8 → 4.1.15 programme of D18), 4.2.0 "Stable World" and its 4.2.x steps (the Studio Server), 4.3.0
"Hero Choice", 4.3.1, and 4.4.0 "Author's Desk". The project was named web-scumm until 4.2.5
([What quest'n'click is](start.what-it-is.md#history)).

<a name="context"></a>

## Context: the audit of v1.2.1

The audit concluded that the engine could produce a good short point-and-click, but not comfortably a game of 30 to
100 rooms, because it was purely reactive (tap → rule → commands) with no world simulation. Its 18 claims were checked
against the code: 12 exact, 4 partial, 2 wrong (`give` / `take` / `room` are not commands; the minigames were not in the
core, already a registry a game extends from `games/<id>/index.ts`). The main diagnosis held.

The goal set then, and still the project's: **one person, with any AI, can make a complete (long) game with this
engine**. The work is ordered by what actually blocks a long game, not by fidelity to Day of the Tentacle.

What was true in v1.2.1, and is not any more: one `hero` and one inventory, actors stored per room and never moved by a
command; no autonomous script, no timer, no event (`onEnter` was the only trigger besides a tap); a fixed 640 × 400
scene with no camera, no prop animation, no frame event; talk topics per room, branching through `choice` / `if`;
exits as hotspots with `goto`, no room graph in `validate`; one save, a new version meaning a new game, no migration; a
best-first solver with no notion of goal or invariant; no custom command, no locale, no voice, settings limited to
music and sound.

<a name="audit"></a>

## What was kept of the audit, and what was changed

**Kept**: a scheduler, events and world actors as the first milestone; no rewrite, no Phaser; a chapter solver with
goals and invariants; multi-slot saves with data-only migrations; a "why is this rule unavailable" debugger; animations
with frame events; an escape hatch with effects declared to the solver.

**Changed**:

- *Events and the scheduler are one feature.* An event bus without scripts able to wait (`waitEvent`, `waitUntil`) is
  only a renamed flag; both landed together, in the same serialisable state.
- *Several playable characters was not first*: it came after the camera and the saves, because it changes the shape of
  the state and needed migrations.
- *No separate dialogue graph.* Topics, `choice` and `do` are already a data graph; a second format would duplicate the
  DSL and break the solver, the MCP and the prompts. What was missing was the visualisation in the Studio (a tree
  derived from the topics). Insult sword fighting is an activity (a minigame), not a dialogue primitive.
- *Minigames as plugins*: already the case; only documentation and an example outside the core were missing.
- *Localisation by extraction* (texts identified by their path, `locales/<lang>.json` files that override) rather than
  keys in the content, so the DSL an AI writes stays light.
- *The real risk is not technical*: every new primitive must be understood by `validate`, `solve`, the content guide in
  both languages, the prompts generator, the MCP tools and the Studio, or an AI will not use it, or badly. Every
  milestone includes that propagation, and the sample game uses every primitive at least once.

<a name="principles"></a>

## Design principles, every milestone

1. **Everything stays data**: new commands in the `Cmd` union, new typed fields on `RoomDef` / `GameDef`, never
   functions in the content (except the `custom` registry, which lives in `index.ts` like the minigames).
2. **Everything is in `GameState`**: script positions, world actors, the camera, so a save resumes exactly and the
   solver stays deterministic.
3. **The solver models time as a choice**: "let script X finish its iteration" is a solver action, a wait is zero in
   simulation, and a `custom` command declares its effects.
4. **One milestone, at most one `saveVersion` bump**, with its migration.
5. **The private game follows**: the maintainer's own game embedded a copy of the engine and was replayed at each
   milestone. It stays on 3.1.0 since D8; since 4.0 an independent game outside the repository (The Lighthouse) and the
   bundled games play that role.

<a name="open-items"></a>

## Open items: what each release left, and where it stands

Each release said what it left for later. Checked against the code of 4.4.0 (23 October 2026); "open" means the code
or the release notes show it is still not done, "done" names the release that did it.

**The people's passes.** Every release from 3.4 on reported passes only a person can make (a screen reader, real
phones, Safari offline, testers who do not know the puzzles, recorded voices listened to, real OBS and LiveSplit
sessions, real connectors, a deployed Bridge and Studio Server). **Open**: the 21 passes of the 4.4.0 sheet are all not
run ([Stability and support](start.stability.md#surfaces)). They are what promotes a "limited" surface.

**npm publishing.** Announced for "a 4.2.x after 4.2.0" (D38), repeated at 4.3.0. **Open**: the packages are not on the
npm registry (checked on 23 October 2026); the engine installs from a release's archive. The Lighthouse in a public
repository: open.

**The solver at scale** (v2.4, v3.3, v3.5, v3.6, 4.1.13):

- the open matrix of three characters (20 rooms × 3 characters, stopped at 200 000 then 600 000 states in 3.5 and
  3.6; 8 of the 12 instances of the proof matrix within budget in 4.1.13): **open**; the lever 4.1.13 named, a memo for
  macro moves and hand-overs, is not done;
- dominance in proofs: **open** (witness dominance exists since 3.5 as an option, for witnesses only; in a proof it
  changed a verdict in a test-only mode, so it stays off);
- a symbolic backend (a spike, not tried in 4.1.13): **open**;
- the runner's numbers of `prove:matrix` and the new solver modules in the core mutation set: not re-checked here.

**Sound and voice** (v2.5, v3.4): adaptive music, "not done on purpose" in v2.5, **done** in 3.5 and 3.6 (the music
director: stems that follow the game's state on the next bar, transitions on a beat, a bar, a phrase or a marker).
Lip-sync markers in the voice table: **open**. Furnace is downloaded by `npm run audio -- setup`, never bundled (GPL),
and CI renders no audio (the files are committed): deliberate, not planned.

**The engine's structure** (4.1.5, 4.1.6, 4.1.8):

- `busyCount`, `guideWait` and `skipping` left on the Engine: **done**, they live in the engine's busy state
  (`src/engine/core/busy.ts`);
- the npm scripts consolidated into a dozen verbs: **open** (129 scripts in the engine repository's `package.json`);
- `sirv-cli` where it is: unchanged (still a dependency);
- the Studio's assistant tab (845 lines in 4.1.8): **open** (`src/studio/assistant.ts`, 839 lines);
- the player decomposed, the Canvas painter's draw list built per frame, the Studio's tabs split with a test per tab,
  the Check tab in the solver's language, the release workflow's acceleration: not re-checked here.

**Documentation** (4.1.7): an example per name in the API reference: not re-checked; a checker of external links:
**open**, planned as `wiki -- check --network` in 4.5.

**Connectors** (4.1.9): email replies (none is sent), DKIM and SPF, IMAP STARTTLS and IDLE (the client speaks TLS from
the first byte): **open**; a coverage floor for `connectors/`: **open** (the coverage measure covers `src/`, `bridge/`
and `studio-server/`); a mutation gate for the connectors: **done** (`connectors-pure` in 4.1.18, `connectors-edge` in
4.1.20).

**The Bridge** (4.1.10): retention on a SQL store: **open** (`compact` refuses a SQL store, "no retention yet");
row-level security per tenant in Postgres: **open**; the Postgres load figures and a rate limit per connector shared
between instances: not re-checked here; a real multi-instance deployment behind HTTPS: the pass `bridge-postgres-https`,
open.

**Rendering** (4.1.11): `e2e:perf` on both painters: **done** (CI runs it with `--renderer=canvas` and
`--renderer=dom`); the WebGL spike: **open** (ADR 0012: WebGL only on a measured gain, not measured); a real phone:
the pass `phone-both-renderers`, open.

**The language** (4.1.12): `e2e:canonical` in CI: **done** (since 4.1.16); the Studio's demo mode writing objectives:
**open**.

**Speedrun** (4.1.14 to 4.1.16): a SQL run store and the `/v1/runs` mount, `e2e:speedrun` in CI, the remix and speedrun
mutation sets gated, the player's Mystery flow: **done** (4.1.16 and 4.1.17); the `server-witnessed` level: **open**
(reserved, not implemented); replaying an old run with its own engine version (the pinned-version replay): **open** (the
verifier answers `unsupported-version`); isolating the verification worker at the system level: **open** (its network
refusals are in-process, "not a sandbox").

**Remix** (4.1.15): `e2e:remix` in CI, the daily module mounted on the Bridge's server, the world in the `.wsrun`
envelope, the code wheel's result in the session: **done** (4.1.16); the five human seeds: a people's pass, open;
`e2e:a11y` over the wheel and the wheel's `story` ending: not re-checked here.

**The hosted Studio** (4.2.3's list, carried to 4.3):

- the semantic diff's before/after captures: **done on a local Studio** in 4.4.0; **open** on a hosted Studio, which has
  no browser beside its worker;
- the game's health with the lint and the playtests (they load the worker's single queue): open as of SUPPORT;
- the Assistant on a hosted Studio (a key brought by each user, D41, needs its own threat model): open;
- a signed backup (its digest says it is whole, not who made it; signing needs a key off the instance, decided with the
  key rotation, D37): open;
- `ids --lines` as an exclusive operation: not found done.

**4.0** asked for "a game by someone else": an outside contributor, Horacio (LostInBrittany), made his game "Jack cherche
un taf" with the engine and contributed what it needed (4.2.4, 4.3.0, 4.4.0); 4.1.0's "a review by someone who did not
build the engine" was met by the outside readings of 4.3 (4.3.1, 4.4.0).

<a name="unplanned"></a>

## After 4.0: what is still unplanned

- The people's passes, then what they find (D12); they were made blocking for 4.2.0 (D18), and 4.2.0 shipped before
  them with a reduced stable scope (D38).
- Publishing the packages on npm (D38), and The Lighthouse in a public repository.
- Translations loaded on demand (the second language is about 10 % of the first visit's JavaScript): a change to the
  game module's contract, so a minor with a deprecation, not a patch.
- The open matrix of three characters (above).
- Lip-sync markers in the voice table (left from 3.4).
- Done since this list was written: Vite 8 and TypeScript 7 (declined in 4.0, done in 4.1.8 "Foundation Reset", with the
  project template's `tsconfig.json`).

<a name="out-of-scope"></a>

## Out of scope, by decision

- **No Phaser, no general physics engine** (D10). Canvas 2D is allowed since 3.4 as a second scene painter, the DOM
  staying the reference; WebGL only for an effect Canvas 2D measurably cannot hold.
- **No dialogue format parallel to the DSL.**
- **No npm package before 4.2.0** (D18; before it, no second person had asked for one). Since 4.2.0 publishing is
  allowed and planned, and not done yet.

The full list of what the project does not do, with the reasons: [What quest'n'click does not do](index.not-supported.md).

<a name="ahead"></a>

## What comes after 4.4

- **4.5.0 "Wiki"** (D50, 23 October 2026, ADR 0030): the documentation moves to this bilingual wiki, generated from
  `wiki/` in the repository, read by the MCP's `search_docs`, `list_docs` and `read_doc`, shipped in the package and
  published per version. The plan:
  [`docs/dev/PLAN-4.5-WIKI.md`](../../docs/dev/PLAN-4.5-WIKI.md). It also carries the corrections its inventory found
  (screenshots regenerated, a created project's missing scripts said, an issue for them).
- **Nothing is decided after 4.5**: the decisions record lists no pending question
  ([`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md), "Pending: none"). The open items above, and the people's
  passes first, are the candidates.

<a name="verification"></a>

## Verification at every milestone

What each milestone of the roadmap had to pass:

1. `npm run validate && npm run solve && npm test && npm run build` green, CI green, the asset audit green.
2. The sample game uses every new primitive at least once and the end-to-end run goes through it (captures at 844 × 390).
3. A save made with the previous version of the sample game loads after migration (a unit test on a JSON frozen per
   milestone; since 3.0.0, one golden save per release).
4. The engine copied into the private game: its tests, solver and end-to-end run unchanged (until D8 froze that game on
   3.1.0).
5. The MCP lists the updated tools; a fresh AI session adds a script or an event to the sample game following only the
   content guide.
6. A tagged release with its notes, and the README's releases table updated.

Today's list for a change: [Before a pull request](contribute.before-a-pr.md).

<a name="references"></a>

## References

- [Changelog](reference.changelog.md), [Stability and support](start.stability.md),
  [Decisions and ADRs](contribute.decisions.md).
- The roadmap as written up to 4.4.0:
  [`blob/v4.4.0/docs/en/ROADMAP.md`](https://github.com/Quest-n-Click/quest-n-click/blob/v4.4.0/docs/en/ROADMAP.md).
- [Benchmarks](contribute.benchmarks.md) for the solver's measures,
  [`docs/dev/PROOF-MATRIX.md`](../../docs/dev/PROOF-MATRIX.md) for the matrix of three-character games.
