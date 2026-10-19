# Support and stability

What web-scumm promises from 4.0 on, and how it changes.

## What is stable

The public API (`docs/en/API.md`): the entries `web-scumm/content`, `/player`, `/minigames`, `/testing` and, since
4.1.1, `/reality`, the
authoring schema (`schemaVersion: 3`), the save envelope, the Studio/MCP tools' schemas and the `web-scumm` command.
Everything else under `src/engine` is internal: it may change in any release, and a game that reaches it through the
`@engine/*` alias takes that risk.

## Versions

Semantic versioning on the public API:

- a **patch** (4.0.x) fixes; it never changes a public name or a format;
- a **minor** (4.x) adds; it may deprecate, never remove;
- a **major** (5.0) may remove what a minor deprecated, and says how to move in `docs/en/UPGRADING.md`.

**The 4.1.x line is the exception, said once (D14).** Since 4.1.1 the project stays on 4.1.x until 4.2, the final
version, and a 4.1.x release may *add*: an optional entry, field, route, command, hook or sub-object (4.1.1's
`web-scumm/reality`, 4.1.2's Bridge options, 4.1.4's `destroy` and hooks, 4.1.5's `sessions`, `camera` and `walker`,
4.1.6's two commands). What it may not do is what a patch may not do either: change or remove a public name or a
format. Every addition is optional, nothing of 4.1.0 changes, and a game or a host written against any 4.1.x runs on
every later 4.1.x, **up to 4.1.7**. `docs/en/UPGRADING.md` has one section per release that says what, if anything, a host must know.

**From 4.1.8 the 4.1.x line is an incubation line (D18, 7 October 2026).** No production game depends on the engine
(the maintainer's own game stays on 3.1.0, D8), so a release of the programme `docs/dev/PROGRAM-4.1.md` (4.1.8 to
4.1.15) may break a public name or a format when the programme needs it. Each break is listed under "Breaking" in the
CHANGELOG, ships with a migration of the bundled games and of the saves where they are concerned, and has its section
in `docs/en/UPGRADING.md`; a surface whose human passes are not done is marked experimental here. The DSL's core is
stabilised in 4.1.12 and frozen after 4.1.15. **4.2.0 "Stable World" restores strict SemVer**: from it on, a minor
adds and a major removes, as above. The riskiest versions get a release candidate first (`4.1.8-rc.1`, a GitHub
pre-release with the same files and checks).

Supported: the current major's last minor gets fixes; the previous minor gets security fixes for three months after
the next one. The 3.x line ended with 3.9; its games move to 4.0 with `web-scumm migrate` (nothing to rewrite for a
game already on schema 3).

## Support matrix

What the automated gates run, and what only people check (`docs/en/FIELD.md`). Since 4.1.9 CI runs every row below on
`main` and on every tag; a pull request runs the fast tier (lint, types, the unit suite, the sample game's build and
proof) and only the rows its change can affect, as `tools/ci-plan.ts` classifies the diff: a docs-only pull request
opens no browser, no Windows runner and no Node 24 (`CONTRIBUTING.md`, "What CI runs"):

| | Checked by CI (on `main` and tags; on a pull request when its change can affect it) | Checked by people (not yet done) |
|---|---|---|
| Player, phone | Chromium and WebKit at a phone's size, touch and keyboard, French; the PWA installed, updated after a durable save, reinstalled, in Chromium, WebKit and Firefox; the game opened offline (Chromium, Firefox) | a real Android phone, a real iPhone installed from Safari and updated, Safari offline on the device |
| Player, desktop | Chromium, mouse and keyboard | — |
| Player, screen reader | axe-core on every screen (not a WCAG claim) | a VoiceOver or NVDA pass |
| Firefox | the PWA only: install, update, reinstall, offline (`npm run e2e:pwa`, the `pwa-firefox` job); its worker's occasional refusal of one cached image offline is reported by the job, not counted | Firefox offline on a real machine; nothing else claimed |
| Node | 22.12 or newer: 22 and 24 on Ubuntu; macOS for the maintainer's daily use | — |
| Windows | a `windows-latest` job (4.1.8; on a pull request, when code changed): `doctor`, the type checks, the unit suite but six files that assume POSIX (file modes, `/` in paths; named in `ci.yml`) and, since 4.1.9, the Telnet and SSH tests, and, since 4.2.1, the Studio Server's processing worker and its previews (Linux only), `build`, the production server answering | `npm run dev` and the Studio on Windows; the six test files, ported |
| Python | optional: the art tools and the audio pipeline, Pillow, NumPy, SciPy pinned in `requirements.txt` | — |
| Reality Bridge | Node 22.12+, Chromium and WebKit e2e, a Rust cross-check of the protocol (`SignalV2` included) | a Bridge behind HTTPS with a real connector |
| Bridge, `local` profile (4.1.10) | SQLite through `node:sqlite` (Node 22.13+): the store contract, tenants crossed in property tests, three processes on one file with one killed during 1 000 proposals, backup as one snapshot and restore all or nothing (4.1.19); backup schema 4, whole-store and quota included, and two restore modes, `merge` and `replace-store`, under a maintenance lease (4.1.20); a load run of 50 000 proposals every night | a long-running install on a real machine |
| Bridge, `distributed` profile (4.1.10, `experimental`) | Postgres 16 in CI (`bridge-postgres`): the same contract, tenants and fan-out between instances; the nightly load run; the qualification profile (`ops/qualify/`: HTTPS, three instances, the leaderboard, a worker killed mid-verification, a restore after the topology is destroyed) in the `qualify` workflow; since 4.1.20 the full profile in every candidate a tag may name (both restore modes under the maintenance lease), `--short` in a pull request's | a real deployment: until one, `experimental` |
| Connectors (4.1.9), **experimental** (D19) | email (signed webhook, IMAP), Telnet, SSH, Open Badges 2 and 3: the same contract on all four, abuse and fuzz tests, a run under `--disallow-code-generation-from-strings`, the sample chapter's replays; the four played from their archive in the candidate (4.1.19); Telnet and SSH tests not on Windows yet | a real email provider, a real badge from a real issuer, SSH and Telnet exposed in a controlled environment |

## 4.2.2: the playable workshop

The Studio Server stays **experimental**: 4.2.2 adds two passes to the two of 4.2.1, `studio-preview` (people play
the shared revision, carry a save across revisions, read the health, undo their own work, publish a build) and
`studio-assets-hosted` (`prepare` on the processing worker). Their machine proofs are the unit suites (SQLite) and
the `studio-hosted` job (Postgres and S3: a build, the worker's `prepare`, a backup restored and its journal replayed).
The mutation set `studio-workshop` is measured, not gated, until its survivors are read. Limits said: sprite sheets
and uploads stay on a local Studio (4.2.3); the game's health judges the validator and the solver from a new game,
not the playtests; a backup is trusted input (it can add owners); a restore is for a hosted store only; a worker
installed from the release archives cannot run `prepare` (deploy it from the repository; 4.2.3 ships the lock). Of
4.2.1's limits, the live preview is gone (one build per revision); the Assets tab's sheets and uploads and the
Assistant are still not on a hosted Studio, a refused write still keeps its draft without a diff to merge, and the
editors still do not send the revision they read.

## 4.2.1: the Studio Server, and the 4.2.x exception (D40)

4.2.1 to 4.2.3 may **add** (a tool, a command, a Studio Server route, a package) but never change or remove a public
name or a format: the public API (`src/engine/api`), the content format and the save envelope stay 4.2.0's (D40). The
**Studio Server** (`docs/en/STUDIO-SERVER.md`, the `web-scumm-studio-server` archive) is **experimental**: its machine
proofs are the `studio-hosted` CI job and the candidate's `studio-install-smoke`; it becomes limited, then stable,
with its passes `studio-hosted` (a real Clever Cloud deployment, a real Safari) and `studio-collab` (three people, a
cut, a redeploy). Its browser tests run in Chromium and Firefox in CI (job `studio-hosted`, on main and every tag),
and in WebKit on macOS by hand: no WebKit runs them in CI, and WebKit on Linux cannot run the game in its frame. In
4.2.1 the game in the hosted Studio is a **live preview**, not frozen at a revision (P4 comes in 4.2.2); the Assets tab
and the Assistant are not on it yet; a refused write keeps its draft to copy and try again (no diff to merge), and the
editors do not send the revision they read (P5's base). The Studio and the tools that write a game need Node 22.13+.
The archive's dependencies are locked for an install from the registry; installed from the archive file, npm resolves
them from their ranges (`web-scumm-studio-server deps` says which).

## 4.2.0: what is promised (D38)

4.2.0 ships before the people's passes. Of the surfaces above, it promises as **stable** only those that need no
pass: the content format and its tools, the player on desktop Chromium and its PWA, and the Bridge's `local`
profile on SQLite. **Limited**: the DOM player on phones and screen readers, the Safari PWA, Firefox (the PWA only),
speedrun and Remix, voices and music, the four package archives installed by a person. **Experimental**: the Canvas
painter, the `distributed` profile, the four connectors. **Partial**: the Studio on Windows. Each changes only with
its pass made on a 4.2.x candidate ([GO / NO-GO 4.2](../dev/GO-NO-GO-4.2.md)). The public API's SemVer promise
above is not affected.

## Deprecation

A name or an option to be removed is first **deprecated** in a minor: marked `@deprecated` in its type (editors show
it struck through), listed in `docs/en/API.md` with its replacement, and named in the CHANGELOG's "Deprecated"
section. It keeps working for the rest of that major, and is removed in the next one. Deprecated in 4.0: `RevealDef`
(use `EndingDef`).

## Saves

A save written by any release of the 3.x or 4.x line loads in every later 4.x: the envelope is versioned (schema 4 since
4.1.15, schema 3 still read), the game's own `migrations` carry its ids, and `tests/save-v3.test.ts` loads one frozen save of each release. A save
newer than the game it is loaded into is refused, never half read. A speedrun's `.wsrun` is schema 2 since 4.1.16
(the run's world sealed into its proof); a schema 1 file of 4.1.14 or 4.1.15 is still verified, as a Story run.

## Releases

Each release is built from the commit CI tested, carries its licences inside the archive, attaches an assets manifest,
five CycloneDX SBOMs (the engine, `create-web-scumm`, the Bridge, the connectors and the Bridge's image, 4.1.19),
SHA-256 sums and a provenance attestation, and is never replaced once published (`docs/en/TOOLS.md`). What
only people and real devices can check is reported in its notes (`docs/en/FIELD.md`).
