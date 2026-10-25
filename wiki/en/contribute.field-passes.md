# Field passes: what only people and real devices can check

<a name="overview"></a>

## Overview

The machine checks a release on every push: the solver, the browsers in CI, the archive, the budgets. Some checks
need a person or a real device: a screen reader, Safari offline on an iPhone, playtesters who do not know the puzzles,
a deployed Studio. These are the **field passes**. They are reported in each release's notes, not blocking (D12): a
release says how many were done. This page says how to make a pass, what to bring back, and how a pass is checked and
carried to a new candidate.

<a name="what-you-get"></a>

## What you get

One JSON report per pass, bound to the candidate run you tried, checked by `field:check`, and the release's sheet
`docs/dev/passes/<version>.md` generated from those reports by `field:report`. Each pass is also an open GitHub issue
labelled `field-pass`, which the maintainer closes once the test is made and its report checks.

<a name="context-and-versions"></a>

## Context and versions

In the engine repository, for the maintainer and the people who test a release. The Field Kit (reports as JSON) exists
since 4.1.18, signed bundles since 4.1.19, carrying a pass since 4.1.20; the list of passes grows with the releases
(below). What this page says holds from 4.1.20.

<a name="prerequisites"></a>

## Prerequisites

- The engine repository set up ([Developer setup](contribute.setup.md)).
- The GitHub CLI `gh`, signed in: `field:init` downloads the candidate's manifest from the run.
- A green **candidate run** of the release ([Releasing](contribute.releasing.md#the-chain)): a pass is always made on
  one candidate.
- For a person's pass: the device or the deployment the pass names.

<a name="where-to-run"></a>

## Where to run the commands

In the engine repository, on your machine. The reports are written under `.cache/field/<version>/` (not committed);
the sheet goes to `docs/dev/passes/<version>.md` (committed).

<a name="steps"></a>

## Steps

<!-- step: init -->
1. **Write the reports at `not-run`**, bound to the candidate the tag will name:

   ```sh
   # in the engine repository
   npm run field:init -- --release=4.4.0 --candidate=<run id>
   ```

   It writes one report per pass asked of that release, in `.cache/field/4.4.0`, bound to the candidate's commit, its
   run id and the SHA-256 of every file it judged, and downloads the run's `candidate-manifest.json` (and its
   attestation) beside them with `gh run download`. It also keeps the candidate's surfaces and site files there. An
   existing report is kept unless `--force`; `--manifest=<file>` gives the manifest instead of downloading it,
   `--dir=<folder>` another folder.

<!-- step: try-pass -->
2. **Make the pass** as its issue says (what to try, what it needs, the evidence expected), then fill its report:
   the operator, when it started and finished, on what, the scenario, the status, and the evidence files under
   `evidence/`.

<!-- step: check -->
3. **Check the folder**:

   ```sh
   # in the engine repository
   npm run field:check -- --dir=.cache/field/4.4.0
   ```

   Schema, candidate, the SHA-256 of each piece of evidence, and the leak scan. `--require=<passId,…>` names passes
   that must be `passed` (a gate; no human pass blocks a tag, D12).

<!-- step: report -->
4. **Write the sheet**:

   ```sh
   # in the engine repository
   npm run field:report -- --dir=.cache/field/4.4.0 --out=docs/dev/passes/4.4.0.md
   ```

   The table goes between `<!-- field:begin -->` and `<!-- field:end -->` (or in place of the sheet's
   "## People's passes" section, or as a new sheet). Commit the sheet. The sheet is generated from the reports, never
   edited by hand into a success.

<!-- step: close-issue -->
5. **Close the issue.** The maintainer closes the pass's `field-pass` issue once the test is made and its report
   checks. An open issue is a pass not made.

<a name="the-passes"></a>

### The passes, by id

A pass has a stable id (`tools/field/schema.ts`). A pass added later is not asked of an older release
(`passesFor`): 13 for 4.1.18 to 4.2.0, 21 for 4.4.0, 22 from 4.5.0.

| Id | What it is | Asked from |
|---|---|---|
| `bridge-postgres-https` | A multi-instance Bridge behind HTTPS on Postgres, a worker killed mid-verification | 4.1.18 |
| `runs-real-players` | Story, Remix and Daily runs submitted by real people | 4.1.18 |
| `run-resume-power-cycle` | A run resumed after the machine was stopped and started again | 4.1.18 |
| `code-wheel-human` | The code wheel printed and used at the table; the text alternative by a screen-reader user | 4.1.18 |
| `mystery-deployed` | A Mystery world played from the Remix menu against a deployed Bridge | 4.1.18 |
| `safari-ios-offline-update` | Safari offline on an iPhone, and its update | 4.1.18 |
| `firefox-real-offline` | Firefox offline on a real machine | 4.1.18 |
| `phone-both-renderers` | A real phone on both painters | 4.1.18 |
| `livesplit-obs` | A real LiveSplit and OBS session | 4.1.18 |
| `connectors-real-security` | Real connectors and a person's security pass | 4.1.18 |
| `blind-playtesters` | Playtesters who do not know the puzzles | 4.1.18 |
| `voices-listening` | The voices listened to | 4.1.18 |
| `archive-human-install` | The published archive installed by a person | 4.1.18 |
| `studio-hosted` | The Studio Server deployed on Clever Cloud (Node, PostgreSQL, Cellar, Keycloak, a TLS domain), from its archive, by its guide; a real Safari on macOS and iOS | 4.2.1 |
| `studio-collab` | Three people on one hosted Studio, a network cut and a redeploy while they edit | 4.2.1 |
| `studio-preview` | On a hosted Studio, people play the shared revision without a dev server, a save carried across revisions, the health chip, their own undo, a published build | 4.2.2 |
| `studio-assets-hosted` | A hosted Studio's prepare on the worker (Python, ffmpeg), its prepared set played in the Play tab | 4.2.2 |
| `studio-mcp-remote` | An AI agent on a hosted Studio through its remote MCP (`/mcp`): a real MCP client, a member's token, a write in the journal as the member, a span another holds refused | 4.2.3 |
| `studio-oidc-generic` | The Studio Server behind a second OpenID Connect provider (GitLab, D44): login, roles, a revoked member refused, verified by a person | 4.2.3 |
| `heroes-two-languages` | The heroes example (`games/heroes`) on a real phone, in English and French: each hero's card, name, lines and voice, a save resumed | 4.4.0 |
| `studio-hero-matrix` | The Studio's hero × language matrix read by an author on their own game: what it shows, what is missing, what it should say | 4.4.0 |
| `docs-beginner-reader` | A beginner reads the published documentation for answers to ten real questions ([BEGINNER-READER.md](../../docs/dev/acceptance/BEGINNER-READER.md)): found, missing or misread, in their language | 4.5.0 |

<a name="playtesters"></a>

### Playtesters (`blind-playtesters`)

1. Send the game's URL. Say only: "play as you like; when you stop, finished or not, open the pause menu and tap
   *Share session*". Do not explain a puzzle, even when asked: write down the question.
2. *Share session* makes a file with the inputs since the game started (ids and indices only, no journal text, no
   name), the device family (`ios`, `android` or `desktop`, nothing finer), and the near misses (a tap on nothing next
   to a target, by room and target). The tester sends it the way they like.
3. Drop the files into `games/<id>/playtests/` (committed; `npm run audit` covers it), then, in the engine repository:
   - `npm run playtests -- --out=.cache/playtests`: play time per room, where players stall, hints shown, where they
     stopped, near misses, a heat map on the puzzle graph;
   - `npm run verify:field`: `verify:commercial`, then five sessions that still replay, three played to the end, two
     device families. These numbers are the quotas of a release tested by players; a game can ask more with
     `npm run playtests -- --strict --require=N --require-completed=N --require-devices=N`.
4. What the report shows becomes work: a stall is a puzzle to clue better, a near miss a hotspot to widen, an abandon a
   place to look at. The sessions stay: once the content changes they may no longer replay, and `--strict` says which
   (re-record or delete them).

More on playtests for authors: [Playtests](create.playtests.md).

<a name="sheet"></a>

### The hand-written sheet (before 4.1.18)

Before the Field Kit, a release's sheet was a copy of [`docs/dev/passes/TEMPLATE.md`](../../docs/dev/passes/TEMPLATE.md)
filled by hand before tagging, "not done" left where nothing was done, and `scripts/release-notes.mjs` put the table in
the release notes with "n of 7 done". The template still holds those seven checks, and the release notes still name
them when a release has no sheet at all:

| # | Pass | How | Bring back |
|---|---|---|---|
| 1 | Screen reader | [SCREEN-READER.md](../../docs/dev/SCREEN-READER.md): VoiceOver on iOS or TalkBack on Android, a game from the title to the first puzzle solved | the sheet's row: device, OS, what could not be reached or was not read |
| 2 | Safari offline | [SAFARI-OFFLINE.md](../../docs/dev/SAFARI-OFFLINE.md): first visit online, airplane mode, a room never visited, a reload | the row: iOS and Safari versions, the step that failed |
| 3 | A real phone | the heaviest scene (the reference market, the demo's garden) on a mid-range phone, the frame rate overlay (`?fps`) | the lowest FPS seen (≥ 30 wanted), the phone |
| 4 | Playtesters | five people who do not know the puzzles, each on their own phone, no help given | their session files (above), then `npm run verify:field` |
| 5 | Recorded voices | `npm run voices -- check --release` after recording: lines approved out of lines with an id | the count, the lines left |
| 6 | Listening | each score on a phone speaker and on headphones: stems following the game, each bridge once, nothing cut short, nothing left playing after a save is loaded, a voice during a bridge | the row, and each fault with its room and what was heard |
| 7 | Signed tag | `git tag -s vX.Y.Z` with the maintainer's key, `git tag -v` shows it | the row |

Since 4.1.18 the sheet's "People's passes" table is written by `field:report`; the release notes count only `passed`
as done ("n of N done"), and `not-run`, `blocked`, `failed` (or the old "not done") as not done.

<a name="field-kit"></a>

### The Field Kit: what a report says, and what is refused

Since 4.1.18 a pass is a JSON report, not a hand-edited row: one file per pass, bound to the **candidate run** it
tried (its commit, its run id and the SHA-256 of every file it judged), in a folder that also holds that run's
`candidate-manifest.json`.


- **Four words, never merged**: `not-run`, `blocked`, `failed`, `passed`. Only `passed` is done in the release notes,
  and only `passed` may lift a surface's `experimental` (D18). A pass is reported, not blocking (D12);
  `field:check --require=<id,…>` is there for a gate that asks for one.
- **What a pass tried says**: an operator (a pseudonym or a role, never an identity), when it started and finished, on
  what (OS, browser, device or versions) and the scenario. `passed` lists its evidence (each file's SHA-256 is checked)
  and no failure; `failed` says what failed; `blocked` says why in `notes`.
- **Evidence is a file under `evidence/`** (at most 16 MiB, 64 MiB for one report; `field:check` says so before a bundle
  is tried), read where it is: not a link, not outside the folder once resolved, not an archive (what is inside cannot
  be read for a leak), never a report or the manifest.
- **Another commit, another pass**: a report of another candidate run, or whose file digests are not the candidate's,
  does not check. A fix that changes the package makes the reports it touches void until they are made again.

> [!LIMIT id=leak-scan-patterns]
> The leak scan is a hygiene barrier made of patterns, not a proof. The schema refuses a field it does not name, and a
> report holding a key, a token, an email address or a bearer is refused; but the scan cannot see a secret it has no
> pattern for, and in an image or a binary it looks for keys and tokens only. Read what you attach.

> [!LIMIT id=integrity-not-authenticity]
> `field:check` checks integrity, not authenticity: a report is checked against the `candidate-manifest.json` beside
> it, as given. `field:init` downloads it from the run itself, but a folder whose manifest was edited checks against
> that edit. The release's own gate reads the run's manifest, never the folder's.

<a name="bundles"></a>

### Bundles: what a reproduction ticket carries

```sh
# in the engine repository
npm run field:bundle -- --report=<report.json> --out=<bundle.tar.gz>
npm run field:verify-bundle -- <bundle.tar.gz>          # integrity, then authenticity on GitHub
gh attestation trusted-root > trusted-root.jsonl        # once, while online
npm run field:verify-bundle -- <bundle.tar.gz> --offline --trusted-root=trusted-root.jsonl
```

- A bundle carries only the evidence its report lists: logs are redacted (addresses, bearers, password values, IPs),
  a key or a token refuses the bundle, and its `bundle-manifest.json` gives every file's SHA-256. Reports and small
  redacted evidence may be committed under `docs/dev/field/<version>/` (`npm run audit` reads them); bundles stay run
  artefacts.
- **A bundle stands on its own** (4.1.19, schema 2): it carries the report, its evidence, the candidate's manifest and
  the manifest's provenance attestation, which the candidate's gate signs after every job succeeded (`field:init`
  downloads it beside the manifest).
- `field:verify-bundle` reads the archive itself under budgets: 16 MiB a file, 64 MiB in all, 256 files, 64 MiB
  compressed, one minute (the calls to GitHub included). A link, a device, an absolute path, a `..` or a name twice
  refuses it. It then checks every file against the bundle's manifest and the report against its candidate
  (integrity), and says who made the manifest (authenticity): offline, the attestation against a trusted root saved
  once, which proves a `candidate.yml` run on main signed it and names the run; online, the same attestation verified
  against the public trusted root, and the run read now (a candidate, green, started by hand on main). A bundle of an
  older candidate (no attestation) is checked online against the manifest the run keeps; offline it is said
  unverified.

<a name="carrying-a-pass"></a>

### Carrying a pass to a new candidate

A pass is bound to its **surface**: the files of the candidate it reads (`docs/dev/surfaces.json`, the attested
`qualification-surfaces.json`; the built site counts file by file), the configuration it reads in the checkout, and the
passes it depends on (ADR 0024). When none of them changed between the candidate the person tried and a new one, the
version included, the pass may stand for the new candidate too:

```sh
# in the engine repository
npm run field:init -- --release=4.1.21 --candidate=<new run>   # keeps the new candidate's surfaces and site files too
npm run field:carry -- --from=.cache/field/4.1.20 --to=.cache/field/4.1.21 --pass=safari-ios-offline-update
```

- `field:carry` refuses any relevant difference and says which file. There is no force: run the pass again.
- Otherwise it writes a `pending` attestation and the source report's exact copy under
  `docs/dev/passes/carry/<target release>/` (`--out=<folder>` for another).
- The maintainer commits it and approves it (`decision`, `approvedBy`), each commit signed with their key: one unsigned
  commit on that path leaves the carry refused for good. The trust root is `.github/allowed_signers` as the **source**
  candidate's commit (on main's first-parent line) holds it. `field:carry --check-range=<a..b>` refuses a range that
  changes both the trust root and an attestation.
- A carry fills only a pass not tried on the new candidate: a failure made there is never covered.
- `field:check` and `field:report` then count the pass as `passed` for the new candidate. The person's report is never
  rewritten: its four statuses stay four.
- A README-only change carries the PWA pass. A change to the service worker, the Bridge's archive or the mixing refuses
  the pass that reads it, and so does the version alone for the PWA, Mystery, resumed-run, speedrun and archive passes.

<a name="expected-result"></a>

## Expected result, and how to check it

`field:check` ends without an error for the folder; `docs/dev/passes/<version>.md` shows the table with
"x passed, y failed, z blocked, n not run, of N"; the release notes of that version say "n of N done". On GitHub, the
open `field-pass` issues are the passes still to make:
<https://github.com/Quest-n-Click/quest-n-click/issues?q=label%3Afield-pass>.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| A report of the previous candidate does not check | Another commit, another pass: its digests are not the new candidate's | Make the pass again, or carry it (above) when its surface did not change |
| `field:check` refuses a report holding an email address or a token | The leak scan | Remove it from the report and its evidence |
| Evidence refused | A link, a file outside the folder, an archive, or over 16 MiB | Put the file itself under `evidence/`, unpacked |
| `field:carry` refuses and names a file | A file of the pass's surface changed | Run the pass on the new candidate |
| `npm run verify:field` fails on the quotas | Fewer than five sessions that replay, three finished, two device families | More playtesters, or re-record the sessions the content change broke |

<a name="files-changed"></a>

## Files or data changed

- `.cache/field/<version>/`: the reports, the candidate's manifest, attestation, surfaces and site files (not committed).
- `docs/dev/passes/<version>.md`: the sheet (committed).
- `docs/dev/passes/carry/<version>/`: carried passes' attestations (committed, signed commits).
- `games/<id>/playtests/`: the playtesters' session files (committed).
- `docs/dev/field/<version>/`: optional reports and small redacted evidence.

<a name="recovery"></a>

## Recovery or going back

A report is a file: edit it again and run `field:check`. `field:init --force` writes the reports at `not-run` again
(it overwrites what you filled). A carry already approved in a signed commit is undone by a new commit that removes
it; a carry with one unsigned commit on its path stays refused.

<a name="references"></a>

## References

- [`tools/field/field.ts`](../../tools/field/field.ts) (the commands), [`tools/field/schema.ts`](../../tools/field/schema.ts)
  (pass ids, statuses, labels), [`tools/field/bundle.ts`](../../tools/field/bundle.ts),
  [`tools/field/carry.ts`](../../tools/field/carry.ts), [`tools/field/tar.ts`](../../tools/field/tar.ts) (budgets).
- [`scripts/release-notes.mjs`](../../scripts/release-notes.mjs) (the count in the notes),
  [`docs/dev/passes/`](../../docs/dev/passes/TEMPLATE.md), ADR 0024 (carried passes), D12, D18.
- [Releasing](contribute.releasing.md), [Playtests](create.playtests.md).
