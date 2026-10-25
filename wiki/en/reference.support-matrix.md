# Support matrix

What the automated gates run, and what only people check. The first table is the support matrix as the project keeps
it by hand; the sections after it are generated from the status registry,
[`docs/dev/contracts.json`](../../docs/dev/contracts.json) (`npm run wiki -- generate reference.support-matrix`): for
each product surface, five statuses kept apart. What "stable" and "experimental" promise is explained in
[start.stability](start.stability.md); how a person's pass is run, in [contribute.field-passes](contribute.field-passes.md).

<a name="matrix"></a>

## The matrix

Since 4.1.9 CI runs every row below on `main` and on every tag. A pull request runs the fast tier (lint, types, the
unit suite, the sample game's build and proof) and only the rows its change can affect, as
[`tools/ci-plan.ts`](../../tools/ci-plan.ts) classifies the diff: a docs-only pull request opens no browser, no Windows
runner and no Node 24 ([contribute.ci](contribute.ci.md)).

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
| Documentation (4.5.0), **experimental** | `npm run wiki -- check` on every change (links and anchors, both languages alike, the generated references against the code, the transition pages of `docs/`); the acceptance questions (`wiki -- acceptance --strict`); the bundle in the package, read through MCP from a project installed outside the repository (`external-consumer`) | a beginner reading it to make a first game (`docs-beginner-reader`) |

> [!LIMIT id=matrix-scope]
> A row says what is checked, not more: a browser, a platform or a deployment the matrix does not name is not
> checked by CI, and a "checked by people" cell stays open until its pass is done for the version you run.

<a name="surfaces"></a>

## Surfaces and their five statuses

Each surface below gives, apart: its **contract** (experimental, stable or deprecated), the **environments** CI
verifies for it (as of the support matrix the registry quotes), the **automated checks** that cover it (ci:plan's
gates, CI and candidate jobs, test files), the **checks by people** it waits for (their state in that version's pass
sheet, and the issue that tracks each), and where its **known limits** are. A page of this wiki that documents a
surface shows the same five statuses in its header.

<!-- generated:begin -->

<a name="content-format"></a>

### The content format and its tools

- Contract: **stable** (`content-format`).
- Environments CI verifies (support matrix of 4.4.0, 2026-10-23): Node 22 and 24 on Ubuntu; Windows (windows-latest): the unit suite but six POSIX files.
- Automated checks: ci:plan gates `node24`, `windows`, `secondGame`, `freshInstall`, `upgrade`, `reference`; CI and candidate jobs `check`, `coverage`, `second-game`, `upgrade`; test files [`tests/validate-stage.test.ts`](../../tests/validate-stage.test.ts), [`tests/solver-contract.test.ts`](../../tests/solver-contract.test.ts), [`tests/save-v3.test.ts`](../../tests/save-v3.test.ts), [`tests/hero-choice.test.ts`](../../tests/hero-choice.test.ts).
- Checks by people (states from [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)):
  - `heroes-two-languages`: not run yet, [#237](https://github.com/Quest-n-Click/quest-n-click/issues/237).
- Known limits: the `[!LIMIT]` blocks of the pages that name this surface in the manifest (`surfaces`).

<a name="public-api"></a>

### The public API

- Contract: **stable** (`public-api`).
- Environments CI verifies (support matrix of 4.4.0, 2026-10-23): Node 22 and 24 on Ubuntu.
- Automated checks: ci:plan gates `node24`, `freshInstall`; CI and candidate jobs `check`, `external-consumer`; test files [`tests/api-surface.test.ts`](../../tests/api-surface.test.ts), [`tests/api-doc.test.ts`](../../tests/api-doc.test.ts).
- Checks by people: none asked.
- Known limits: the `[!LIMIT]` blocks of the pages that name this surface in the manifest (`surfaces`).

<a name="player-dom"></a>

### The player (DOM painter)

- Contract: **stable** (`player-dom`).
- Environments CI verifies (support matrix of 4.4.0, 2026-10-23): Chromium on the desktop, mouse and keyboard; Chromium and WebKit at a phone's size, touch and keyboard (emulated); axe-core on every screen (not a WCAG claim).
- Automated checks: ci:plan gates `e2e`; CI and candidate jobs `e2e`; test files [`tests/dom/a11y.test.ts`](../../tests/dom/a11y.test.ts), [`tests/dom/presenter.test.ts`](../../tests/dom/presenter.test.ts).
- Checks by people (states from [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)):
  - `phone-both-renderers`: not run yet, [#83](https://github.com/Quest-n-Click/quest-n-click/issues/83).
  - `code-wheel-human`: not run yet, [#78](https://github.com/Quest-n-Click/quest-n-click/issues/78).
  - `blind-playtesters`: not run yet, [#76](https://github.com/Quest-n-Click/quest-n-click/issues/76).
- Known limits: the `[!LIMIT]` blocks of the pages that name this surface in the manifest (`surfaces`).

<a name="player-canvas"></a>

### The Canvas painter

- Contract: **experimental** (`player-canvas`).
- Environments CI verifies (support matrix of 4.4.0, 2026-10-23): Chromium in CI, the same game drawn and played.
- Automated checks: ci:plan gates `e2e`; CI and candidate jobs `e2e`; test files [`tests/dom/render-canvas.test.ts`](../../tests/dom/render-canvas.test.ts), [`tests/dom/renderer-contract.test.ts`](../../tests/dom/renderer-contract.test.ts).
- Checks by people (states from [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)):
  - `phone-both-renderers`: not run yet, [#83](https://github.com/Quest-n-Click/quest-n-click/issues/83).
- Known limits: the `[!LIMIT]` blocks of the pages that name this surface in the manifest (`surfaces`).

<a name="pwa"></a>

### The installed game (PWA) and offline play

- Contract: **stable** (`pwa`).
- Environments CI verifies (support matrix of 4.4.0, 2026-10-23): Chromium, WebKit and Firefox: installed, updated after a durable save, reinstalled; Offline in Chromium and Firefox.
- Automated checks: ci:plan gates `e2e`, `pwaFirefox`; CI and candidate jobs `e2e`, `pwa-firefox`; test files [`tests/offline.test.ts`](../../tests/offline.test.ts).
- Checks by people (states from [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)):
  - `safari-ios-offline-update`: not run yet, [#86](https://github.com/Quest-n-Click/quest-n-click/issues/86).
  - `firefox-real-offline`: not run yet, [#80](https://github.com/Quest-n-Click/quest-n-click/issues/80).
- Known limits: the `[!LIMIT]` blocks of the pages that name this surface in the manifest (`surfaces`).

<a name="bridge-local"></a>

### The Reality Bridge, `local` profile (SQLite)

- Contract: **stable** (`bridge-local`).
- Environments CI verifies (support matrix of 4.4.0, 2026-10-23): Node 22.13+ with node:sqlite, on Ubuntu; Chromium and WebKit end to end.
- Automated checks: ci:plan gates `reality`; CI and candidate jobs `reality`, `reality-xcheck`; test files [`tests/bridge-store.test.ts`](../../tests/bridge-store.test.ts), [`tests/bridge-backup.test.ts`](../../tests/bridge-backup.test.ts).
- Checks by people: none asked.
- Known limits: the `[!LIMIT]` blocks of the pages that name this surface in the manifest (`surfaces`).

<a name="bridge-distributed"></a>

### The Reality Bridge, `distributed` profile (Postgres)

- Contract: **experimental** (`bridge-distributed`).
- Environments CI verifies (support matrix of 4.4.0, 2026-10-23): Postgres 16 in CI; The qualification profile: HTTPS, three instances (ops/qualify/).
- Automated checks: ci:plan gates `reality`; CI and candidate jobs `bridge-postgres`, `deployment-smoke`; test files [`tests/bridge-postgres-isolation.test.ts`](../../tests/bridge-postgres-isolation.test.ts).
- Checks by people (states from [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)):
  - `bridge-postgres-https`: not run yet, [#77](https://github.com/Quest-n-Click/quest-n-click/issues/77).
- Known limits: the `[!LIMIT]` blocks of the pages that name this surface in the manifest (`surfaces`).

<a name="connectors"></a>

### The connectors (email, Telnet, SSH, Open Badges)

- Contract: **experimental** (`connectors`).
- Environments CI verifies (support matrix of 4.4.0, 2026-10-23): Node 22 on Ubuntu (Telnet and SSH not on Windows).
- Automated checks: ci:plan gates `reality`; CI and candidate jobs `connectors`, `connector-archive-e2e`; test files [`tests/connectors-sdk.test.ts`](../../tests/connectors-sdk.test.ts), [`tests/connectors-email.test.ts`](../../tests/connectors-email.test.ts), [`tests/connectors-ssh.test.ts`](../../tests/connectors-ssh.test.ts).
- Checks by people (states from [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)):
  - `connectors-real-security`: not run yet, [#79](https://github.com/Quest-n-Click/quest-n-click/issues/79).
- Known limits: the `[!LIMIT]` blocks of the pages that name this surface in the manifest (`surfaces`).

<a name="speedrun-remix"></a>

### Speedrun and Remix

- Contract: **stable** (`speedrun-remix`).
- Environments CI verifies (support matrix of 4.4.0, 2026-10-23): Replays in four runtimes (cross-runtime).
- Automated checks: ci:plan gates `e2e`; CI and candidate jobs `cross-runtime`, `e2e`; test files [`tests/speedrun-verify.test.ts`](../../tests/speedrun-verify.test.ts), [`tests/remix-worlds.test.ts`](../../tests/remix-worlds.test.ts).
- Checks by people (states from [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)):
  - `runs-real-players`: not run yet, [#85](https://github.com/Quest-n-Click/quest-n-click/issues/85).
  - `run-resume-power-cycle`: not run yet, [#84](https://github.com/Quest-n-Click/quest-n-click/issues/84).
  - `mystery-deployed`: not run yet, [#82](https://github.com/Quest-n-Click/quest-n-click/issues/82).
  - `livesplit-obs`: not run yet, [#81](https://github.com/Quest-n-Click/quest-n-click/issues/81).
  - `code-wheel-human`: not run yet, [#78](https://github.com/Quest-n-Click/quest-n-click/issues/78).
- Known limits: the `[!LIMIT]` blocks of the pages that name this surface in the manifest (`surfaces`).

<a name="voices-music"></a>

### Voices and music

- Contract: **stable** (`voices-music`).
- Environments CI verifies (support matrix of 4.4.0, 2026-10-23): The music director in Chromium and WebKit.
- Automated checks: ci:plan gates `e2e`; CI and candidate jobs `e2e`; test files [`tests/voices.test.ts`](../../tests/voices.test.ts), [`tests/voice-locale.test.ts`](../../tests/voice-locale.test.ts).
- Checks by people (states from [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)):
  - `voices-listening`: not run yet, [#87](https://github.com/Quest-n-Click/quest-n-click/issues/87).
- Known limits: the `[!LIMIT]` blocks of the pages that name this surface in the manifest (`surfaces`).

<a name="archives-install"></a>

### The package archives and their install

- Contract: **stable** (`archives-install`).
- Environments CI verifies (support matrix of 4.4.0, 2026-10-23): Installed outside the repository on Ubuntu (Node 22 and 24), macOS and Windows.
- Automated checks: ci:plan gates `freshInstall`; CI and candidate jobs `external-consumer`, `fresh-install`; test files [`tests/pack-locks.test.ts`](../../tests/pack-locks.test.ts).
- Checks by people (states from [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)):
  - `archive-human-install`: not run yet, [#75](https://github.com/Quest-n-Click/quest-n-click/issues/75).
- Known limits: the `[!LIMIT]` blocks of the pages that name this surface in the manifest (`surfaces`).

<a name="studio-local"></a>

### The local Studio

- Contract: **stable** (`studio-local`).
- Environments CI verifies (support matrix of 4.4.0, 2026-10-23): Chromium end to end (the Studio's checks); Windows: the unit suite only.
- Automated checks: ci:plan gates `e2e`, `windows`; CI and candidate jobs `e2e`, `windows`; test files [`tests/hero-matrix.test.ts`](../../tests/hero-matrix.test.ts), [`tests/studio-assistant.test.ts`](../../tests/studio-assistant.test.ts).
- Checks by people (states from [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)):
  - `studio-hero-matrix`: not run yet, [#238](https://github.com/Quest-n-Click/quest-n-click/issues/238).
- Known limits: the `[!LIMIT]` blocks of the pages that name this surface in the manifest (`surfaces`).

<a name="studio-server"></a>

### The Studio Server (hosted team Studio)

- Contract: **experimental** (`studio-server`).
- Environments CI verifies (support matrix of 4.4.0, 2026-10-23): Postgres, S3 and Keycloak in CI; Chromium and Firefox (job studio-hosted); WebKit on macOS, by hand only.
- Automated checks: ci:plan gates `studioHosted`; CI and candidate jobs `studio-hosted`, `studio-install-smoke`; test files [`tests/studio-server.test.ts`](../../tests/studio-server.test.ts), [`tests/studio-backup.test.ts`](../../tests/studio-backup.test.ts), [`tests/studio-collab.test.ts`](../../tests/studio-collab.test.ts).
- Checks by people (states from [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)):
  - `studio-hosted`: not run yet, [#149](https://github.com/Quest-n-Click/quest-n-click/issues/149).
  - `studio-collab`: not run yet, [#150](https://github.com/Quest-n-Click/quest-n-click/issues/150).
  - `studio-preview`: not run yet, [#166](https://github.com/Quest-n-Click/quest-n-click/issues/166).
  - `studio-assets-hosted`: not run yet, [#167](https://github.com/Quest-n-Click/quest-n-click/issues/167).
  - `studio-mcp-remote`: not run yet, [#196](https://github.com/Quest-n-Click/quest-n-click/issues/196).
  - `studio-oidc-generic`: not run yet, [#197](https://github.com/Quest-n-Click/quest-n-click/issues/197).
- Known limits: the `[!LIMIT]` blocks of the pages that name this surface in the manifest (`surfaces`).

<a name="documentation"></a>

### The documentation: the wiki, its bundle in the package and its search

- Contract: **experimental** (`documentation`).
- Environments CI verifies (support matrix of 4.4.0, 2026-10-23): none named.
- Automated checks: CI and candidate jobs `check`, `external-consumer`; test files [`tests/wiki-manifest.test.ts`](../../tests/wiki-manifest.test.ts), [`tests/wiki-check.test.ts`](../../tests/wiki-check.test.ts), [`tests/wiki-access.test.ts`](../../tests/wiki-access.test.ts), [`tests/wiki-proofs.test.ts`](../../tests/wiki-proofs.test.ts), [`tests/wiki-acceptance.test.ts`](../../tests/wiki-acceptance.test.ts), [`tests/mcp-docs.test.ts`](../../tests/mcp-docs.test.ts).
- Checks by people (states from [`docs/dev/passes/4.4.0.md`](../../docs/dev/passes/4.4.0.md)):
  - `docs-beginner-reader`: not asked of this version.
- Known limits: the `[!LIMIT]` blocks of the pages that name this surface in the manifest (`surfaces`).

<!-- generated:end -->
