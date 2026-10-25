# Upgrade notes: 4.2

What each release of the 4.2 line changed, from 4.1.20 to 4.2.5, kept unchanged. From 4.2.0 the project follows
strict SemVer: a 4.2.x only fixes, a minor only adds. None of these releases asks a game to change: the public API,
the content format and the save envelope are 4.2.0's (D40). Most notes are for the operator of a hosted Studio
(4.2.1 to 4.2.3) and for the rename to quest'n'click (4.2.5, §38).

The upgrade itself is [Upgrade](install.upgrade.md). The section numbers are those of the former
`docs/en/UPGRADING.md`, so "§38" still finds its section. Where a note names `STUDIO-SERVER` or `CONTENT_GUIDE`, the
same content is now in the Team, Clever and Create pages of this wiki.

<a name="from-4-1-20-to-4-2-0"></a>

## 33. From 4.1.20 to 4.2.0 "Stable World"

Nothing to change: 4.2.0 is 4.1.20's code with the version changed and one Field Kit fix. From 4.2.0 on, strict
SemVer: a 4.2.x only fixes, a 4.x minor only adds. The engine still installs from the release's archive
(`releases/download/v4.2.0/…`); npm publishing comes in a later 4.2.x. What 4.2.0 calls stable, limited or
experimental is in [Stability and support](start.stability.md) (D38).

<a name="from-4-2-0-to-4-2-1"></a>
<!-- applies: 4.2.1.. -->

## 34. From 4.2.0 to 4.2.1 "Shared Floor"

Nothing to change in a game: the public API, the content format and the save envelope are 4.2.0's (D40). What an
author may notice:

- **Node 22.13 or newer for the Studio and the tools that write a game** (`ids`, `i18n`, `voices`, `import-layout`,
  `provenance`, the Studio's own edits): their writes now go through the same journal as the hosted Studio's, kept
  locally under `.cache/studio-journal/` in SQLite (`node:sqlite`, Node 22.13+). Playing and building a game still
  run on 22.12.
- **An edit that would add a validation error is refused** (422, with the errors), in the Studio and its tools: the
  game on disk stays valid.
- **The placement editor saves through the Studio's API** (`PUT /__studio/api/room/<id>/layout`); the `/__layout`
  route is gone and `layoutWriter()` (in `tools/vite/plugins.ts`) does nothing any more, kept so a configuration that
  names it still loads.

The engine installs from `releases/download/v4.2.1/…`. To put a Studio online for a team, see
[What runs where](team.what-runs-where.md) (experimental in 4.2.1).

<a name="from-4-2-1-to-4-2-2"></a>
<!-- applies: 4.2.2.. -->

## 35. From 4.2.1 to 4.2.2 "Playable Workshop"

Nothing to change in a game: the public API, the content format and the save envelope are 4.2.0's (D40). The engine
installs from `releases/download/v4.2.2/…`. For a hosted Studio:

- **Vite has left the server**: the game's origin serves the previews the processing worker builds, one per revision.
  The worker needs the engine's Vite to build (its install has it).
- **The database migrates at start** (migrations 0006 to 0010: previews, health, undo, builds, prepared sets).
- **The asset tools on the worker**: set the worker's `CC_POST_BUILD_HOOK` as [What runs where](team.what-runs-where.md) says (their
  Python packages, locked with hashes); without it, "Prepare assets" (the Play tab's
  button) fails and shows the worker's error. Deploy this worker from the repository: installed from the archives, it
  cannot run `prepare` in 4.2.2 (4.2.3 ships the lock).
- **Builds**: `/play/<n>/` needs a session unless `publicBuilds` is set (off by default).
- **Backup**: the journal ships to the bucket by itself; take a daily `studio-server backup` and keep it off the
  instance (STUDIO-SERVER, "Backup and restore").

<a name="from-4-2-2-to-4-2-3"></a>
<!-- applies: 4.2.3.. -->

## 36. From 4.2.2 to 4.2.3 "Coordination"

Nothing to change in a game: the public API, the content format and the save envelope are 4.2.0's (D40). The engine
installs from `releases/download/v4.2.3/…`. For a hosted Studio:

- **The database migrates at start** (migrations 0011 and 0012: the client a write came from, for the revision read;
  the comments, kept by the backup).
- **This one redeploy refuses writes for about 2.5 min**: a 4.2.2 instance keeps the service lease until Clever Cloud
  stops it. From 4.2.3 on, an instance hands the lease over to the new one within about 10 s (STUDIO-SERVER, "Running
  it: the reference deployment"). The Studio's page retries its writes meanwhile; deploy at a quiet time, and expect
  the `/readyz` alert to fire once.
- **Clocks**: the worker now allows 30 s of skew between its clock and the Studio's; past that, a job is refused with
  "lives longer than a job may" (keep both apps' clocks synchronised).
- **A write carries the revision its editor read** (`x-studio-base`): the Studio's page sends it by itself. A script
  that writes may send it to be refused (409) rather than write over a change it never saw; without it, it is not
  checked this way.
- **`POST /api/assets/prepare` answers 202 with a job**, no longer the prepared run: a script polls
  `GET /api/jobs/<id>` until `done`, `failed` or `cancelled`, and reads the run in `result`. Cutting sheets and
  uploads now work on a hosted Studio, under the same exclusive lease.
- **A worker installed from the release archives can prepare assets**: its `CC_POST_BUILD_HOOK` installs
  `node_modules/web-scumm/ops/studio/worker-requirements.lock` into `.python` (STUDIO-SERVER, "From the release
  archives"); `WORKER_PYTHON_PATH` puts the packages elsewhere. A worker deployed from the repository keeps its hook.
- **Git (optional)**: set `git` in the configuration (`remote`, `branch`, `path`, `committer`, and `knownHosts` for a
  strict host check) and the deploy key as the secret `STUDIO_GIT_KEY` (`STUDIO_GIT_KEY_FILE` locally); STUDIO-SERVER,
  "The game in Git". Without `git`, the Play tab has no Git panel.
- **The remote MCP**: with OIDC, the Studio serves `/mcp` and `/.well-known/oauth-protected-resource` by itself. An
  agent's token must be a JWT access token carrying the Studio's `oidc.audience` (MCP, "A hosted Studio");
  `npm run mcp -- --server <url>` uses the CLI's token from `studio-server login`.
- **Metrics (optional)**: set `STUDIO_METRICS_TOKEN` (32 characters or more, or the server refuses to start) for
  `GET /metrics`; without it, `/metrics` is a 404.
- **The daily backup (optional)**: `clevercloud/cron.json` runs `ops/studio/backup-cron.sh` on every app deployed from
  the repository; it backs up only where `STUDIO_BACKUP_CRON=1` is set (the studio app, never the worker), keeping
  `STUDIO_BACKUP_KEEP` backups (14 by default). From the archives, copy the script as STUDIO-SERVER says ("Running it:
  the reference deployment").
- **A game imported from 4.1.x** can be upgraded on the server: `POST /api/engine/migrate`, an owner's (STUDIO-SERVER,
  "Upgrading the engine of a hosted game").
- **If you passed `invite` its role first** (`invite owner --email …`): it is now refused; write `invite --email …
  --role owner`.

<a name="from-4-2-3-to-4-2-4"></a>
<!-- applies: 4.2.4.. -->

## 37. From 4.2.3 to 4.2.4

Nothing to change: a game that uses none of the new fields builds, plays and saves as on 4.2.3 (the same
fingerprints, golden saves and reference runs). The engine installs from `releases/download/v4.2.4/…`. The new fields
are optional and presentation only (D46: no schema, save envelope or IR change):

- **`input: { exitOnTap: true }`** in `game.ts`: a single tap on an exit, with no verb picked, walks there and goes
  through on arrival; an exit's **`onTap: 'go' | 'walk'`** overrides the game's setting either way (CONTENT_GUIDE, "A
  double tap: the verb a player means").
- **`actorGap`** on the game (for example `0.8`): without an `approach` point in the layout, the hero stops at that
  share of the two characters' mean height, times the depth scale, instead of 44 units (CONTENT_GUIDE, the layout).
- **`"sheetBackground"`** in `site.json`: `"transparent"` or a `#RRGGBB` colour for the generated sprite sheets
  (default `#2B2E45`, the same prompts as before); PROMPTS, "Choosing the sheet background".

**A fix to know**: a game that wrote `{ face: 'hero', who: X }` saw X turn right wherever the hero stood; X now turns
toward the hero. If a scene relied on the old facing, write `{ face: 'right', who: X }`.

<a name="from-4-2-4-to-4-2-5"></a>
<!-- applies: 4.2.5.. -->

## 38. From 4.2.4 to 4.2.5

**web-scumm becomes quest'n'click** (D47). Nothing to change: a game made for 4.2.4 installs, builds, plays and saves
as before, under its old names. The engine installs from `releases/download/v4.2.5/…`, where the repository is now
`github.com/Quest-n-Click/quest-n-click` (the old `github.com/wanoo/web-scumm` links redirect, release downloads included).
The sample game and the Studio's demo are now at `https://quest-n-click.cleverapps.io/demo/` (since 4.5.2, D52; the
GitHub Pages addresses they had before are abandoned): update a bookmark or a link to it.

**The new names**, from 4.2.5:

| Before | From 4.2.5 |
|---|---|
| package `web-scumm`, command `web-scumm` | `quest-n-click`, command `quest-n-click` |
| imports `web-scumm/content`, `/player`, `/minigames`, `/testing`, `/reality` | `quest-n-click/content`, … |
| `create-web-scumm` | `create-quest-n-click` |
| `web-scumm-bridge` (package and command) | `quest-n-click-bridge` |
| `web-scumm-connectors`, command `web-scumm-connector` | `quest-n-click-connectors`, command `quest-n-click-connector` |
| `web-scumm-studio-server`, `web-scumm-studio-worker` | `quest-n-click-studio-server`, `quest-n-click-studio-worker` |
| release files `web-scumm-<version>.tgz`, `web-scumm-<tag>-…` | `quest-n-click-<version>.tgz`, `quest-n-click-<tag>-…` |

**The old names keep working through 4.2.x.** Each release of the line also publishes `web-scumm-<version>.tgz`,
`create-web-scumm-<version>.tgz`, `web-scumm-bridge-<version>.tgz`, `web-scumm-connectors-<version>.tgz` and
`web-scumm-studio-server-<version>.tgz`: the same files at the same version, only the package's name is the old one.
The old commands still run, after a one-line notice ("web-scumm is now quest-n-click; the old name works until 4.3"),
and `web-scumm/content` and the other old imports still resolve. The aliases are removed in 4.3.

**Switching, when you like** (one commit, then `npm install`, `npm run verify`):

1. `package.json`: the dependency `"web-scumm": "<spec>"` becomes `"quest-n-click": "<spec>"`, its archive
   `quest-n-click-4.2.5.tgz`; the scripts `web-scumm dev`, `web-scumm build`… become `quest-n-click dev`,
   `quest-n-click build`….
2. `tsconfig.json`: the path `web-scumm/*` becomes `quest-n-click/*`, pointing at
   `./node_modules/quest-n-click/src/engine/api/*`; `@engine/*` points at `./node_modules/quest-n-click/src/engine/*`;
   `include` names `node_modules/quest-n-click/src/env.d.ts`.
3. The game's sources: `from 'web-scumm/content'` becomes `from 'quest-n-click/content'`, and so on, for example
   `grep -rlE "['\"]web-scumm/" game | xargs sed -i.bak -E "s#(['\"])web-scumm/#\\1quest-n-click/#g"`.
4. A host of the Bridge, the connectors or the Studio Server installs the `quest-n-click-…` archives and calls the new
   commands in its unit files and scripts.

**The formats keep their names.** They are identifiers inside files and stores, not the project's name: renaming them
would break existing saves, files and deployments. A save is still a `web-scumm-save` envelope, a session
`web-scumm-session`, a run a `.wsrun` file in the `web-scumm-speedrun` format, a Remix world `web-scumm-remix-1`; a
signal is still `web-scumm-world-signal`, a reality manifest `web-scumm-reality-manifest`; the browser keeps its
IndexedDB databases (`web-scumm-saves`, `web-scumm-runs`) and its `web-scumm.…` storage keys, so a player's saves and
runs are found where they were; the Bridge's `X-Web-Scumm-*` headers, the signatures' contexts, the environment
variables `WEB_SCUMM_*` and the Studio Server's tables are unchanged. Releases up to v4.2.4 keep their files' names and
their attestations, which name the repository `wanoo/web-scumm`; from v4.2.5 to v4.5.1 the attestations name
`wanoo/quest-n-click` (from v4.5.2, `Quest-n-Click/quest-n-click`; `ship verify` asks for the one each release was
signed under). The sample game's and the
reference chapter's credits now say quest'n'click: their presentation fingerprint moved, so their reference run is
recorded again; a game's own fingerprint moves only if its own text changes.
