# Stability and support

What quest'n'click promises, surface by surface, how far each promise is proven, how versions change it, and how long a
version is supported. As of 4.4.0 (22 October 2026). The single sources are
[`docs/dev/contracts.json`](../../docs/dev/contracts.json) (the registry of statuses),
this page (the policy: the registry quotes its surface table, and `tests/contracts.test.ts` checks the quotes) and the
release's sheet of people's passes, [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md).

<a name="overview"></a>

## Five statuses, never one banner

A surface (the player, the PWA, the Bridge, the Studio Server…) is never just "experimental" or "stable". Five things
are said about it, separately, and each page of this wiki that rests on a surface shows them in its header:

1. **Contract status**: experimental, stable or deprecated. What the project promises not to break.
2. **Verified environments**: the browsers, systems and hosts that CI runs it on, as of a version and a date.
3. **Automated checks**: the CI and candidate jobs and the test files that cover it.
4. **People's passes**: the checks only a person on a real device can make, with the issue that tracks each, and
   their state for the release (done, failed, not run).
5. **Known limits**: the `[!LIMIT]` blocks of the pages.

A stable contract with its passes not run is what the project's older pages call **limited**: the promise is made,
and a person has not confirmed it on real devices yet.

<a name="what-is-stable"></a>

## What is stable

**The public API** ([Public API](engine.api.md)): the entries `@quest-n-click/engine/content`, `/player`, `/minigames`,
`/testing` and, since 4.1.1, `/reality`; the authoring schema (`schemaVersion: 3`); the save envelope; the Studio and
MCP tools' schemas; and the `quest-n-click` command. Everything else under `src/engine` is internal: it may change in
any release, and a game that reaches it through the `@engine/*` alias takes that risk.

**The DSL** ([DSL reference](create.dsl.md#stability)): since 4.1.12 its names and meanings are stable (D22); a change
to one is a break that ships with its migration of the bundled games and the saves. What could still grow until
4.1.15, what is frozen since, and why each proposed primitive was admitted or refused is in
[`docs/dev/DSL-STABILITY.md`](../../docs/dev/DSL-STABILITY.md). A new primitive enters with a short decision record and
reaches the runtime, the validator, the solver, the replay, the Studio, the MCP and the DSL reference
(`tests/propagation.test.ts` checks it).

<a name="surfaces"></a>

## Surface by surface (4.4.0)

Contract status and checks from `docs/dev/contracts.json` (as of 4.4.0, 23 October 2026); passes from
`docs/dev/passes/4.4.0.md`, where **none of the 21 passes has run**.

| Surface | Contract | What SUPPORT promises (D38) | Verified by CI on | Checks (CI jobs) | People's passes (issue), state at 4.4.0 |
|---|---|---|---|---|---|
| The content format and its tools | stable | Stable | Node 22 and 24 on Ubuntu; Windows: the unit suite but six POSIX files | check, coverage, second-game, upgrade | `heroes-two-languages` (#237): not run |
| The public API | stable | Stable, under SemVer | Node 22 and 24 on Ubuntu | check, external-consumer | none |
| The player (DOM painter) | stable | Limited until its passes: phones and screen readers | Chromium on the desktop, mouse and keyboard; Chromium and WebKit at a phone's size, touch and keyboard (emulated); axe-core on every screen (not a WCAG claim) | e2e | `phone-both-renderers` (#83), `code-wheel-human` (#78), `blind-playtesters` (#76): not run |
| The Canvas painter | experimental | Experimental | Chromium, the same game drawn and played | e2e | `phone-both-renderers` (#83): not run |
| The installed game (PWA) and offline play | stable | Stable on desktop Chromium; limited on Safari and Firefox (the PWA only) | Chromium, WebKit and Firefox: installed, updated after a durable save, reinstalled; offline in Chromium and Firefox | e2e, pwa-firefox | `safari-ios-offline-update` (#86), `firefox-real-offline` (#80): not run |
| The Reality Bridge, `local` profile (SQLite) | stable | Stable | Node 22.13+ with `node:sqlite` on Ubuntu; Chromium and WebKit end to end | reality, reality-xcheck | none |
| The Reality Bridge, `distributed` profile (Postgres) | experimental | Experimental | Postgres 16 in CI; the qualification profile (HTTPS, three instances, `ops/qualify/`) | bridge-postgres, deployment-smoke | `bridge-postgres-https` (#77): not run |
| The connectors (email, Telnet, SSH, Open Badges) | experimental | Experimental | Node 22 on Ubuntu (Telnet and SSH not on Windows) | connectors, connector-archive-e2e | `connectors-real-security` (#79): not run |
| Speedrun and Remix | stable | Limited until their passes | Replays in four runtimes (cross-runtime) | cross-runtime, e2e | `runs-real-players` (#85), `run-resume-power-cycle` (#84), `mystery-deployed` (#82), `livesplit-obs` (#81), `code-wheel-human` (#78): not run |
| Voices and music | stable | Limited until their pass | The music director in Chromium and WebKit | e2e | `voices-listening` (#87): not run |
| The package archives and their install | stable | Limited until a person installs them | Installed outside the repository on Ubuntu (Node 22 and 24), macOS and Windows | external-consumer, fresh-install | `archive-human-install` (#75): not run |
| The local Studio | stable | Partial on Windows | Chromium end to end (the Studio's checks); Windows: the unit suite only | e2e, windows | `studio-hero-matrix` (#238): not run |
| The Studio Server (hosted team Studio) | experimental | Experimental as a whole | Postgres, S3 and Keycloak in CI; Chromium and Firefox (job `studio-hosted`); WebKit on macOS, by hand only | studio-hosted, studio-install-smoke | `studio-hosted` (#149), `studio-collab` (#150), `studio-preview` (#166), `studio-assets-hosted` (#167), `studio-mcp-remote` (#196), `studio-oidc-generic` (#197): not run |
| The documentation (this wiki, its bundle, its search) | experimental | Experimental, from 4.5.0 | `npm run wiki -- check` and the acceptance questions; the bundle read through MCP from a project installed outside the repository | check, external-consumer | `docs-beginner-reader`: asked from 4.5.0 |

The rows of the support matrix behind the "Verified by CI" column, with what people check on each:
[Support matrix](reference.support-matrix.md). Each pass is an open issue labelled
[`field-pass`](https://github.com/Quest-n-Click/quest-n-click/issues?q=label%3Afield-pass), closed by the maintainer once
tested; only a pass made on the very candidate a release names qualifies a surface ([Field passes](contribute.field-passes.md)).

> [!LIMIT id=no-pass-run-at-440]
> As of 4.4.0, no people's pass has passed: every "limited" above is a promise machines check and a person has not yet
> confirmed on real devices.

<a name="versions"></a>

## Versions

Semantic versioning on the public API:

- a **patch** (4.4.x) fixes; it never changes a public name or a format;
- a **minor** (4.x) adds; it may deprecate, never remove;
- a **major** (5.0) may remove what a minor deprecated, and says how to move in the upgrade notes
  ([Upgrade](install.upgrade.md)).

**Support window.** The current major's last minor gets every fix; each earlier minor gets security fixes for three
months after the minor that followed it. What that gives at 4.5.0 (23 October 2026), the same table as the
[security policy](contribute.security-policy.md#supported-versions):

| Line | Fixes | Until |
| --- | --- | --- |
| 4.5 | every fix | the next minor, then three months of security fixes |
| 4.4 | security fixes | 23 January 2027 |
| 4.3 | security fixes | 22 January 2027 |
| 4.2.5 | security fixes, on a branch from `v4.2.5` (SUPPORT, written at 4.3.0) | 21 January 2027 |

The 3.x line ended with
3.9; its games move to 4.0 with `quest-n-click migrate` (nothing to rewrite for a game already on schema 3).

**History of the policy.** Each line below said what it changed; the newest first.

<a name="v440"></a>

### 4.4.0 "Author's Desk"

Changes no surface's status (the registry is as of 4.4.0). Adds optional fields only: a hotspot's `onTap: 'go'`, a map
place's list of portraits and `joins`; nothing to change in a game (upgrade notes §41). Two new passes,
`heroes-two-languages` and `studio-hero-matrix`.

<a name="v430"></a>

### 4.3.0 "Hero Choice": the 4.3 line (D48)

Changes no surface's status. Adds to the authoring schema, under strict SemVer: a character variant's `name`, text
switches and `{hero}`, `img` on a choice option, voice clips keyed by a flag's value (the hero choice, ADR 0022, D49)
and a verb's `key` (#203), each optional, presentation only, with no new condition, command or state; `schemaVersion`
stays 3 and the save envelope is 4.2.0's. No people's pass covers them yet. The default interface font is Galmuri11
(#204): a look, not a format. Removes the `web-scumm` aliases, as D47 announced: the one removal in a minor, the
exception the maintainer chose. Main became the 4.3 line (D48).

<a name="v425"></a>

### 4.2.5: the new name (D47)

Renames the project quest'n'click and changes no surface's status. The names `web-scumm` (the package and its command),
`web-scumm/content`, `/player`, `/minigames`, `/testing`, `/reality`, `create-web-scumm`, `web-scumm-bridge`,
`web-scumm-connectors` (command `web-scumm-connector`) and `web-scumm-studio-server` (commands `web-scumm-studio-server`,
`web-scumm-studio-worker`) were **deprecated aliases** of their `quest-n-click` names through 4.2.x, each release of
the line shipping them, and are removed in 4.3.0: `quest-n-click migrate` renames a game's imports, its tsconfig's
paths and its scripts' commands, and the hosted Studio's engine upgrade renames a hosted game's imports
([Coming from web-scumm](install.from-web-scumm.md)). The format identifiers that say web-scumm (`web-scumm-save`,
`web-scumm-session`, `.wsrun`'s `web-scumm-speedrun`, `web-scumm-remix-1`, the stores' and headers' names,
`WEB_SCUMM_*`) are parts of the formats, not names of the project: they stay, and no 4.3 removes them.

<a name="v424"></a>

### 4.2.4: optional presentation fields (D46)

Changes no surface's status. The content format stays 4.2.0's, read with one exception (D46): a 4.2.x may add an
optional content field that is presentation only, needs no schema, save envelope or IR change, and leaves a game
without it identical. 4.2.4 adds three: `input.exitOnTap`, an exit's `onTap` and `actorGap`. `sheetBackground` in
`site.json` is a setting of the art tools, not of the content. Renaming, removing or changing the meaning of a field
still waits for a minor.

<a name="v423"></a>

### 4.2.3: the end of the 4.2.x line

Ends the Studio Server's 4.2.x line (D40, D44). No pass had been made, so no surface was promoted: what 4.2.0 promised
stayed, and what came after is experimental. At the end of 4.2.x:

- **Stable**: the content format and its tools, the player on desktop Chromium and its PWA, the Bridge's `local`
  profile, and the public API under SemVer.
- **Limited, until their passes (#75–#87)**: the DOM player on phones and screen readers, the Safari PWA, Firefox (the
  PWA only), speedrun and Remix, voices and music, the four package archives installed by a person.
- **Experimental**: the Canvas painter, the `distributed` profile, the four connectors; the Studio on Windows stays
  partial.
- **The Studio Server, experimental as a whole**, with six passes: `studio-hosted` (#149) and `studio-collab` (#150)
  for the server itself (the journal, logins and roles, spans and leases, the live stream, the game's origin);
  `studio-preview` (#166) for the previews, saves across revisions, the health, personal undo and the published builds;
  `studio-assets-hosted` (#167) for Prepare on the worker, from the archives since 4.2.3, with the Assets tab's uploads
  and cuts as jobs; `studio-mcp-remote` (an agent through `/mcp`) and `studio-oidc-generic` (a second OpenID provider,
  GitLab: CI runs Keycloak only).
- **4.2.3's other additions**, experimental with the server and proven by the unit suites (SQLite) only: the revision
  read and its 409 (a script or the MCP that sends no `x-studio-base` is not checked this way), the scenario map, the
  comments, the semantic diff, Git (tested on a local bare repository; one repository per instance; LFS and submodules
  not read), the engine upgrade (a route, no button yet). The `studio-hosted` job (Postgres, S3, Keycloak) does not run
  them.
- **Operations**: the metrics, the daily backup to the bucket and the runbook were run once on Clever Cloud's test
  organisation, not under a production load; their figures are in
  [`docs/dev/QUALIF-4.2.3-REFERENCE.md`](../../docs/dev/QUALIF-4.2.3-REFERENCE.md) (on the smallest plans: a restore
  with its replay in about a minute, nothing lost; a preview's p95 of 44 s, not the 5 s aimed at; writes refused 10 to
  16 s at a redeploy, about 2.5 min at the first one onto 4.2.3). The mutation set `studio-workshop` is gated since
  4.2.3.

What stayed open after 4.2.x, and where it stands at 4.4.0: [Roadmap](start.roadmap.md#open-items).

<a name="v422"></a>

### 4.2.2: the playable workshop

The Studio Server stays experimental: 4.2.2 adds the passes `studio-preview` (people play the shared revision, carry a
save across revisions, read the health, undo their own work, publish a build) and `studio-assets-hosted` (`prepare` on
the processing worker). Their machine proofs: the unit suites (SQLite) and the `studio-hosted` job (Postgres and S3: a
build, the worker's `prepare`, a backup restored and its journal replayed). The mutation set `studio-workshop` was
measured, not gated, in 4.2.2. Limits said then: sprite sheets and uploads stay on a local Studio (lifted in 4.2.3); the
game's health judges the validator and the solver from a new game, not the playtests; a backup is trusted input (it
can add owners); a restore is for a hosted store only; a worker installed from the release archives could not run
`prepare` (lifted in 4.2.3). The Assistant is still not on a hosted Studio, and a refused write keeps its draft without
a diff to merge (4.2.3 added the merge offered on a 409).

<a name="v421"></a>

### 4.2.1: the Studio Server, and the 4.2.x exception (D40)

4.2.1 to 4.2.3 may **add** (a tool, a command, a Studio Server route, a package) but never change or remove a public
name or a format: the public API (`src/engine/api`), the content format and the save envelope stay 4.2.0's (D40). The
**Studio Server** (the `quest-n-click-studio-server` archive) is **experimental**: its machine proofs are the
`studio-hosted` CI job and the candidate's `studio-install-smoke`; it becomes limited, then stable, with its passes
`studio-hosted` (a real Clever Cloud deployment, a real Safari) and `studio-collab` (three people, a cut, a redeploy).
Its browser tests run in Chromium and Firefox in CI, and in WebKit on macOS by hand: no WebKit runs them in CI, and
WebKit on Linux cannot run the game in its frame. The Studio and the tools that write a game need Node 22.13+. The
archive's dependencies are locked for an install from the registry; installed from the archive file, npm resolves them
from their ranges (`quest-n-click-studio-server deps` says which). In 4.2.1 the game in the hosted Studio was a live
preview (one build per revision since 4.2.2); the Assets tab and the Assistant were not on it; a refused write kept its
draft to copy and try again, with no diff to merge, and the editors did not send the revision they read (both came in
4.2.3).

<a name="v420"></a>

### 4.2.0 "Stable World": what is promised (D38)

4.2.0 shipped before the people's passes. It promises as **stable** only what needs no pass: the content format and
its tools, the player on desktop Chromium and its PWA, and the Bridge's `local` profile on SQLite. **Limited**: the DOM
player on phones and screen readers, the Safari PWA, Firefox (the PWA only), speedrun and Remix, voices and music, the
four package archives installed by a person. **Experimental**: the Canvas painter, the `distributed` profile, the four
connectors. **Partial**: the Studio on Windows. Each changes only with its pass made on a candidate
([GO / NO-GO 4.2](../../docs/dev/GO-NO-GO-4.2.md)). The public API's SemVer promise is not affected. 4.2.0 restored
**strict SemVer**: from it on, a minor adds and a major removes.

<a name="v41x"></a>

### The 4.1.x line (D14, D18)

From 4.1.1 the project stayed on 4.1.x until 4.2. Through **4.1.7**, a 4.1.x release could *add* an optional entry,
field, route, command, hook or sub-object (4.1.1's `@quest-n-click/engine/reality`, 4.1.2's Bridge options, 4.1.4's `destroy`
and hooks, 4.1.5's `sessions`, `camera` and `walker`, 4.1.6's two commands), never change or remove a public name or a
format: a game written against any of them runs on every later one up to 4.1.7. **From 4.1.8 to 4.1.15 the line was
an incubation line** (D18, 7 October 2026): no production game depended on the engine (the maintainer's own game stays
on 3.1.0, D8), so a release of the programme could break a public name or a format when it needed to. Each break is
listed under "Breaking" in the changelog, shipped with a migration of the bundled games and the saves where concerned,
and has its upgrade notes ([Upgrade notes: 4.1](install.upgrade-notes-4-1.md)). The DSL's core was stabilised in
4.1.12 and frozen after 4.1.15. The riskiest versions got a release candidate first (`4.1.8-rc.1`, a GitHub
pre-release with the same files and checks).

<a name="deprecation"></a>

## Deprecation

A name or an option to be removed is first **deprecated** in a minor: marked `@deprecated` in its type (editors show it
struck through), listed in the [Public API](engine.api.md) with its replacement, and named in the changelog's
"Deprecated" section. It keeps working for the rest of that major, and is removed in the next one. Deprecated in 4.0:
`RevealDef` (use `EndingDef`). The one exception, chosen by the maintainer: the `web-scumm` aliases, deprecated in 4.2.5
and removed in 4.3.0 (D47).

<a name="saves"></a>

## Saves

A save written by any release of the 3.x or 4.x line loads in every later 4.x: the envelope is versioned (schema 4
since 4.1.15, schema 3 still read), the game's own `migrations` carry its ids, and `tests/save-v3.test.ts` loads one
frozen save of each release from 3.0.0 on and plays it to the end. A save newer than the game it is loaded into is
refused, never half read. A speedrun's `.wsrun` is schema 2 since 4.1.16 (the run's world sealed into its proof); a
schema 1 file of 4.1.14 or 4.1.15 is still verified, as a Story run. For a player: [Saves](play.saves.md); for an
author: [State and saves](create.state-saves.md).

<a name="releases"></a>

## Releases

Each release is built from the commit its candidate tested, carries its licences inside the archive, and attaches an
assets manifest, five CycloneDX SBOMs (the engine, `@quest-n-click/create`, the Bridge, the connectors and the Bridge's
image, since 4.1.19), SHA-256 sums and a provenance attestation. Since 4.2.0 tags are signed and releases immutable:
never replaced once published. What only people and real devices can check is reported in its notes. How a release is
made: [Releasing](contribute.releasing.md).

> [!LIMIT id=not-on-npm]
> No release has published the packages on npm so far: the engine installs from a release's archive
> ([Install from the release archive](install.from-archive.md)).

<a name="references"></a>

## References

- [Support matrix](reference.support-matrix.md), [Roadmap](start.roadmap.md), [Field passes](contribute.field-passes.md).
- [`docs/dev/contracts.json`](../../docs/dev/contracts.json), [`docs/dev/surfaces.json`](../../docs/dev/surfaces.json),
  [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md), [`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md)
  (D14, D18, D22, D38, D40, D46, D47, D48).
