# Command-line tools

The six commands quest'n'click installs, with every subcommand, its options and the exit codes the code defines. Each
command says where it runs: a created project's folder, the engine repository, the Bridge's machine or the Studio
Server's. In the engine repository the same tools run as npm scripts ([npm scripts](reference.npm-scripts.md)); the
variables they read are in [Environment variables](reference.environment-variables.md).

<a name="quick-entry"></a>

## Quick entry, by task

- **Start a game project**: [`create-quest-n-click`](#create), or [`quest-n-click create`](#quest-n-click-create)
  from a release archive ([install from the release archive](install.from-archive.md)).
- **Play it, edit it, check it** in a created project: [`dev`](#quest-n-click-dev),
  [`studio`](#quest-n-click-studio), [`verify`](#quest-n-click-verify) (or [`validate`](#quest-n-click-validate) and
  [`solve`](#quest-n-click-solve) one by one).
- **Build and publish it**: [`build`](#quest-n-click-build), [`release`](#quest-n-click-release).
- **Something is wrong with the setup**: [`doctor`](#quest-n-click-doctor).
- **Run a Reality Bridge**: [`quest-n-click-bridge`](#bridge), starting with [`init`](#bridge-init) and
  [`serve`](#bridge-serve).
- **Run a hosted Studio**: [`quest-n-click-studio-server`](#studio-server), and [`invite`](#studio-server-invite) for
  the first owner ([the server's commands](team.server-cli.md)).

<a name="overview"></a>

## The six commands

| Command | Package | What it is |
|---|---|---|
| `quest-n-click` | `quest-n-click` | the engine's tools for a game project: `dev`, `studio`, `verify`, `build`, `release`… |
| `create-quest-n-click` | `create-quest-n-click` | a new game project (`npm init @quest-n-click my-game`) |
| `quest-n-click-bridge` | `quest-n-click-bridge` | the reference Reality Bridge on its own, for a built game |
| `quest-n-click-connector` | `quest-n-click-connectors` | one connector of the world outside (email, Telnet, SSH, Open Badges) |
| `quest-n-click-studio-server` | `quest-n-click-studio-server` | the Studio online for a team, and its operator commands |
| `quest-n-click-studio-worker` | `quest-n-click-studio-server` | the Studio Server's processing worker |

In a created project the usual commands are also its npm scripts (`npm run dev`, `npm run verify`…): see
[the scripts of a created project](reference.npm-scripts.md#project). The package and how it is installed:
[install.package](install.package.md).

<a name="connector-configuration"></a>

## Configuration of a connector

A connector reads one JSON file (`--config`). It names the Bridge and the file of the connector's token (never the
token on the command line), the game, its limits, an optional health port, and a section named after the connector:

```json
{
  "bridge": { "url": "http://127.0.0.1:8787/", "tokenFile": "telnet.token" },
  "gameId": "signals",
  "limits": { "maxBytes": 4096, "maxPerMinute": 60, "timeoutMs": 5000 },
  "health": { "port": 9301 },
  "telnet": { "port": 2323 }
}
```

To run one, first give it a token from the Bridge, then start it:

```sh
# in the engine repository
npm run bridge -- grant --connector=shed-telnet --source=terminal --signals=terminal.lamp --pair > telnet.token
npm run connector -- telnet --config telnet.json
# with the package @quest-n-click/connectors installed
npx quest-n-click-connector telnet --config telnet.json
```

- The game's Reality manifest comes from the Bridge (`GET /v1/manifest`), or from `"manifestFile"` (a path relative to
  the configuration file). A manifest for another `gameId` stops the connector (exit 1).
- A token minted with `--pair` may confirm the pairing codes players give; grant each connector only the signals it
  proposes.
- With `health`, `GET /health` (200 when healthy, 503 otherwise) and `GET /metrics` answer on 127.0.0.1 (another
  address with `health.host`): counts of proposals, duplicates, refusals by code, inputs rejected, retries.
- Secrets come from files (`secretFile`, `passwordFile`, `tokenFile`). An inline `secret`, `password` or `token` is a
  development shortcut and must be a string, or the connector refuses to start.
- SIGTERM or Ctrl-C stops it: no new input, work in flight drained for at most five seconds, exit 0.

Each connector's own section: [bridge.connectors](bridge.connectors.md).

> [!LIMIT id=documented-options]
> The options listed below are the ones each command reads itself. A `quest-n-click` command that runs a tool passes
> its other arguments on to that tool or to Vite: their options are on the tools' pages.

<!-- generated:begin -->

<a name="quest-n-click"></a>

## `quest-n-click`

The engine's tools for a game project that installed the package (3.9; called `web-scumm` before 4.2.5, an alias through 4.2.x, gone in 4.3.0). `npx quest-n-click help` lists the commands. Each command runs a tool of the package (with `tsx` and the project's `tsconfig.json`, else the package's), Vite with the package's `vite.config.ts`, or Python for the assets; its exit code is the tool's, and a chain of steps stops at the first that fails, with that step's code.

- Package: `@quest-n-click/engine`.
- Where: in a created project's folder (`npx quest-n-click <command>`, or through the project's npm scripts). The project is the working folder (`WEB_SCUMM_PROJECT` is set to it for every tool): it holds `game/`, `public/`, `dist/` and `.cache/`; the engine in `node_modules/@quest-n-click/engine` is read, never written.
- Source: [`cli/quest-n-click.mjs`](../../cli/quest-n-click.mjs), [`tools/speedrun/verify.ts`](../../tools/speedrun/verify.ts).

<a name="quest-n-click-help"></a>

### `quest-n-click help`

Prints the engine's version and every command with its one-line description. `--help`, no command at all, and an unknown command print the same list; an unknown command first says `quest-n-click: no command "<name>"`.

Usage: `quest-n-click help`

| Code | Means |
|---|---|
| 0 | `help`, `--help` or no command. |
| 1 | An unknown command. |

<a name="quest-n-click-create"></a>

### `quest-n-click create`

A new game project from the template: runs `cli/create.mjs`, the same as `npm init @quest-n-click` (its section below).

Usage: `quest-n-click create <folder> ["Title"] [--engine=<npm spec>]`

| Option | Means |
|---|---|
| `--engine=<npm spec>` | The engine dependency written into the project's `package.json` (default `^<this engine's version>`). |

<a name="quest-n-click-dev"></a>

### `quest-n-click dev`

The game in the browser, reloading as you edit (Vite's dev server; the arguments go to Vite). `?edit=<room>` opens the placement editor.

Usage: `quest-n-click dev [<Vite options>]`

<a name="quest-n-click-studio"></a>

### `quest-n-click studio`

The Studio: rooms, dialogues, the puzzle graph, the mixer. Vite's dev server with `STUDIO=1`, opened on `/__studio/`.

Usage: `quest-n-click studio [<Vite options>]`

<a name="quest-n-click-assets"></a>

### `quest-n-click assets`

`art/` and `audio/` into `public/assets`: writes the game's references to `.cache/refs.json` (the `refs` tool), then runs `tools/assets.py` with `PYTHON` (default `python3`; Python 3 with Pillow).

Usage: `quest-n-click assets`

<a name="quest-n-click-doctor"></a>

### `quest-n-click doctor`

The prerequisites (4.1.6): Node and Chromium required; Python, ffmpeg and WebKit optional, each said when missing.

Usage: `quest-n-click doctor`

<a name="quest-n-click-mcp"></a>

### `quest-n-click mcp`

The MCP server of this game, on stdio, for an assistant (4.1.6). With `--server`, the tools of a hosted Studio (4.2.3), after `quest-n-click-studio-server login`.

Usage: `quest-n-click mcp [--server <url>]`

<a name="quest-n-click-validate"></a>

### `quest-n-click validate`

The content checked: references, rules, dialogues, budgets.

Usage: `quest-n-click validate [--release] [--commercial] [--report]`

<a name="quest-n-click-solve"></a>

### `quest-n-click solve`

The solver: a way to the end, the softlocks (`--prove`), chapters. Exit 0 solved, 2 truncated, 1 otherwise.

Usage: `quest-n-click solve [--prove] [--from=<checkpoint>] [--chapters] [--json]`

<a name="quest-n-click-bridge"></a>

### `quest-n-click bridge`

A reference Reality Bridge for the game (`tools/bridge.ts`): the same command line as `quest-n-click-bridge` (below), the game's manifest taken from its content. In a project, the Bridge is the separate package `@quest-n-click/bridge`; without it: `the Reality Bridge is a separate package: npm install @quest-n-click/bridge`, exit 1.

Usage: `quest-n-click bridge <init|serve|grant|rotate|revoke|doctor|compact|migrate|tenant|backup|restore> …`

<a name="quest-n-click-solve-reality"></a>

### `quest-n-click solve-reality`

A game with `reality.signals` proved closed, under each scenario and adversarial.

Usage: `quest-n-click solve-reality`

<a name="quest-n-click-lint"></a>

### `quest-n-click lint`

What a player would trip on (the content lint after a solver run).

Usage: `quest-n-click lint [--prove]`

<a name="quest-n-click-i18n"></a>

### `quest-n-click i18n`

Translations: extract, status.

Usage: `quest-n-click i18n <extract|status>`

<a name="quest-n-click-weight"></a>

### `quest-n-click weight`

What a phone downloads and decodes, against the game's `assetBudgets`.

Usage: `quest-n-click weight [--release]`

<a name="quest-n-click-provenance"></a>

### `quest-n-click provenance`

Where every asset comes from; `--lock` after a review (a release refuses the template's placeholder art until each file is replaced and reviewed).

Usage: `quest-n-click provenance [--lock]`

<a name="quest-n-click-playtests"></a>

### `quest-n-click playtests`

The sessions players shared, replayed and summed up.

Usage: `quest-n-click playtests [--strict]`

<a name="quest-n-click-speedrun"></a>

### `quest-n-click speedrun`

`speedrun verify`: a speedrun replayed against the game, its verdict, code and reason (4.1.14). Any other word after `speedrun` prints the usage line.

Usage: `quest-n-click speedrun verify <run.wsrun> [--keys=<file>] [--json]`

| Option | Means |
|---|---|
| `--keys=<file>` | The keys a signed run is checked with. |
| `--json` | The verdict as JSON. |

| Code | Means |
|---|---|
| 0 | `valid` or `valid-unranked`. |
| 1 | Any other verdict, `inconclusive` included. |
| 2 | The usage line: not `speedrun verify`, or no run file. |

<a name="quest-n-click-voices"></a>

### `quest-n-click voices`

Recorded lines: check, apply.

Usage: `quest-n-click voices <check|apply> [--release]`

<a name="quest-n-click-ids"></a>

### `quest-n-click ids`

Stable ids for rules, topics and lines; `--write` writes them into the sources.

Usage: `quest-n-click ids [--write]`

<a name="quest-n-click-prompts"></a>

### `quest-n-click prompts`

Image prompts for the sheets the game names.

Usage: `quest-n-click prompts [--missing]`

<a name="quest-n-click-verify"></a>

### `quest-n-click verify`

In order: `validate`, `solve`, `i18n status`, `lint`, `playtests`; stops at the first that fails.

Usage: `quest-n-click verify`

<a name="quest-n-click-build"></a>

### `quest-n-click build`

In order: `assets`, `verify`, the production build in `dist/` (`vite build`), then the `dist` tool: every file of `dist/` accounted for, licences inside.

Usage: `quest-n-click build [<Vite build options>]`

<a name="quest-n-click-release"></a>

### `quest-n-click release`

`assets`, `verify` and the build, then the release gates: `validate --release` (provenance lock), `weight --release` (budgets), `i18n status` (translations), `voices check --release`, `playtests --strict`, `solve --prove` (the proof), `solve-reality`, then the `dist` tool.

Usage: `quest-n-click release [--commercial]`

| Option | Means |
|---|---|
| `--commercial` | Also `validate --commercial --errors`: no exception, no placeholder. |

<a name="quest-n-click-preview"></a>

### `quest-n-click preview`

Serves `dist/` locally (`vite preview --host 127.0.0.1`).

Usage: `quest-n-click preview [<Vite preview options>]`

<a name="quest-n-click-migrate"></a>

### `quest-n-click migrate`

Brings the game's sources to the installed engine's version (ids, content format); since 4.3.0 it first renames the former name's `web-scumm/…` imports and commands.

Usage: `quest-n-click migrate [--check]`

<a name="create"></a>

## `create-quest-n-click`

The package `@quest-n-click/create` depends on the engine of the same version and runs its `cli/create.mjs`: the same as `quest-n-click create`.

- Package: `@quest-n-click/create`.
- Where: anywhere: the new project's folder is created where you run it (`npm init @quest-n-click my-game`).
- Source: [`cli/create.mjs`](../../cli/create.mjs).

<a name="create-usage"></a>

### `create-quest-n-click`

Writes a game project into `<folder>`: `game/` from the template (one room, a hero, placeholder art drawn from shapes; `__ID__` and `__TITLE__` filled in), `game/provenance.json` (the placeholder art marked as such, CC0, to replace before a release), the engine's `public/` icons, `og.png` and fonts, a `package.json` whose scripts call the engine's command, a `tsconfig.json` whose paths point into the installed package, a `.gitignore` and a `README.md`. The id is the folder's name in lowercase; the title is the remaining words, else the id capitalised. Then: `cd <folder> && npm install && npm run assets && npm run dev`.

Usage: `npx @quest-n-click/create <folder> ["Title"] [--engine=<npm spec>]`

| Option | Means |
|---|---|
| `--engine=<npm spec>` | The engine dependency of the new project (default `^<version>`), e.g. a tarball path. |

| Code | Means |
|---|---|
| 0 | The project is written. |
| 1 | The folder exists and is not empty. |
| 2 | No folder given (the usage line). |

<a name="bridge"></a>

## `quest-n-click-bridge`

The reference Reality Bridge on its own (4.1.1; its store commands 4.1.10), for a game that is already built: `init --manifest=<game>/dist/reality-manifest.json`, then `serve`. A store is named `jsonl` (the journal beside `config.json`), `sqlite:<file>` (relative to the Bridge's directory; `sqlite` alone is `bridge.sqlite`) or `postgres://…`; `--store=`, then `BRIDGE_STORE`, then `BRIDGE_STORE_FILE` (a file holding the URL) override the configuration's. Every secret `init` makes is written under `--dir`, never printed. Options are written `--key=value` (the store commands also take `--key value`). Any other command prints the usage line, exit 2.

- Package: `@quest-n-click/bridge`.
- Where: on the machine that runs the Bridge, in the folder that holds its directory (`--dir`, default `.cache/bridge`). In the engine repository, `npm run bridge -- <command>`; in a project, `npx quest-n-click bridge <command>`, or the standalone package for a built game.
- Source: [`bridge/src/cli.ts`](../../bridge/src/cli.ts), [`bridge/src/cli-store.ts`](../../bridge/src/cli-store.ts).

<a name="bridge-init"></a>

### `quest-n-click-bridge init`

Keys and a configuration: `config.json`, the Biscuit root (`root.key`, read by `grant` only, never by `serve`), the event-signing key, the admin token, and, unless `--no-demo-webhooks`, demonstration webhooks (any player, may pair). On the Internet prefer `--no-demo-webhooks` and one `grant` per connector.

Usage: `quest-n-click-bridge init [--dir=.cache/bridge] [--manifest=dist/reality-manifest.json] [--audience=bridge.local] [--origin=<urls>] [--store=sqlite] [--tenant=<id>] [--environment=prod|staging|dev] [--signal-version=2] [--hosts=<names>] [--no-demo-webhooks] [--demo-days=30] [--force]`

| Option | Means |
|---|---|
| `--dir=<folder>` | The Bridge's directory (default `.cache/bridge`); every command takes it. |
| `--manifest=<file>` | A built game's `reality-manifest.json` (the standalone package); `npm run bridge` takes it from the game. |
| `--audience=<name>` | Who the Bridge is for its connectors' tokens (default `bridge.local`). |
| `--origin=<url,url>` | The players' origins (CORS), default `http://127.0.0.1:5173,http://localhost:5173`. |
| `--store=<store>` | The store (default the JSON-lines journal; `sqlite` is `sqlite:bridge.sqlite`). |
| `--tenant=<id>` | The tenant this configuration is (default `default`). |
| `--environment=prod\|staging\|dev` | Where it runs, named in V2 signals (default `prod`). |
| `--signal-version=2` | Signs V2 signals (default 1 for a single tenant). |
| `--hosts=<name,name>` | The `Host` names that reach this tenant on a multi-tenant server. |
| `--no-demo-webhooks` | No demonstration webhooks. |
| `--demo-days=<n>` | Lifetime of the demonstration webhooks' tokens (default 30). |
| `--force` | Replaces an existing `config.json`, and every key and token with it. |

| Code | Means |
|---|---|
| 0 | Written. |
| 1 | The game declares no `reality.signals`, or `config.json` exists without `--force`. |

<a name="bridge-serve"></a>

### `quest-n-click-bridge serve`

The Bridge over HTTP, one JSON log line per event. It takes a serving lease on the store (refused while a restore or a migration down holds it). SIGTERM or SIGINT closes the streams, the server and the store (five seconds at most), exit 0. Several tenants (`--tenants`) need a SQL store; leaderboards and the daily challenge too.

Usage: `quest-n-click-bridge serve [--dir=<folder>] [--port=8787] [--host=127.0.0.1] [--trust-proxy[=<list>]] [--tenants=<dir>,<dir>] [--tenant-header] [--store=<store>]`

| Option | Means |
|---|---|
| `--port=<n>` | Default 8787. |
| `--host=<address>` | Default `127.0.0.1`. |
| `--trust-proxy[=<list>]` | Alone: trusts the loopback's forwarded address; with a list (`10.0.0.0/8,192.168.1.2`): those proxies. |
| `--tenants=<dir>,<dir>` | Several tenants, a directory each, on one shared SQL store. |
| `--tenant-header` | Routes by a tenant header instead of the `Host`. |
| `--store=<store>` | Overrides the configuration's store. |

| Code | Means |
|---|---|
| 0 | Stopped by SIGTERM or SIGINT. |
| 1 | Not serving: a lease or a lock holds the store, two directories are one tenant, several tenants on the journal, leaderboards without SQL, or a moderation token file that is missing, open to others or shorter than 32 characters. |

<a name="bridge-grant"></a>

### `quest-n-click-bridge grant`

Prints a connector's token (a Biscuit) on stdout: redirect it to a file (`> telnet.token`). Grant each connector only the signals it proposes; `--pair` lets it confirm the pairing codes players give.

Usage: `quest-n-click-bridge grant --connector=<id> --source=<s> --signals=a,b [--players=any|p-…,p-…] [--pair] [--days=30] [--tenant=<id>]`

| Option | Means |
|---|---|
| `--connector=<id>` | The connector's name in the token. |
| `--source=<s>` | The source it proposes for. |
| `--signals=a,b` | The signals it may propose. |
| `--players=any\|p-…,p-…` | Which players (default `any`). |
| `--pair` | May confirm pairing codes. |
| `--days=<n>` | Lifetime (default 30). |

<a name="bridge-rotate"></a>

### `quest-n-click-bridge rotate`

A new event-signing key; the previous one stays listed `--keep-days` days for players that just received a signal. Restart the Bridge to use it.

Usage: `quest-n-click-bridge rotate [--keep-days=30]`

| Option | Means |
|---|---|
| `--keep-days=<n>` | Default 30. |

<a name="bridge-revoke"></a>

### `quest-n-click-bridge revoke`

Asks the running Bridge (`POST v1/admin/revoke` with the admin token of `--dir`) to revoke a player or a token.

Usage: `quest-n-click-bridge revoke --url=<bridge> (--player=<p-…> | --token=<revocation id>)`

| Option | Means |
|---|---|
| `--url=<bridge>` | Default `http://127.0.0.1:8787/`. |
| `--player=<p-…>` | A player. |
| `--token=<id>` | A token's revocation id. |

| Code | Means |
|---|---|
| 0 | Revoked. |
| 1 | The Bridge refused (its status and answer printed). |

<a name="bridge-doctor"></a>

### `quest-n-click-bridge doctor`

Reads the store without changing it: the journal's lines, a last line cut short by a crash, corruption; or a SQL store's schema, each tenant's rows, gaps in a player's sequence, quarantine.

Usage: `quest-n-click-bridge doctor [--dir=<folder>] [--store=<store>]`

| Code | Means |
|---|---|
| 0 | Readable. |
| 1 | A corrupt journal (the Bridge will not start on it), or a gap in a player's sequence. |

<a name="bridge-compact"></a>

### `quest-n-click-bridge compact`

Rewrites the JSON-lines journal without the signals acknowledged and older than the retention. The Bridge must be stopped (the command takes the journal's lock). A SQL store keeps every signal: exit 1.

Usage: `quest-n-click-bridge compact [--dir=<folder>] [--retention-days=90]`

| Option | Means |
|---|---|
| `--retention-days=<n>` | Default 90. |

<a name="bridge-migrate"></a>

### `quest-n-click-bridge migrate`

With `--from`/`--to`: the journal moved into SQLite or Postgres, checked, then the configuration pointed at it (not for a Postgres URL, nor with `--no-config`). Without: the SQL schema up to the latest, or to `--schema=N` (`0` undoes everything; going down takes the store alone).

Usage: `quest-n-click-bridge migrate --from=jsonl --to=sqlite[:file]|postgres://… [--tenant=<id>] [--no-config] · migrate [--schema=N] [--lock-timeout=<ms>]`

| Option | Means |
|---|---|
| `--lock-timeout=<ms>` | How long to wait for the maintenance lease (default 30000). |

| Code | Means |
|---|---|
| 1 | Nothing migrated: the target holds the tenant, a check failed, a lease holds the store. |
| 2 | The usage line, or a bad `--lock-timeout`. |

<a name="bridge-tenant"></a>

### `quest-n-click-bridge tenant`

A tenant's rows exported, or deleted (`--yes` required: every row of the tenant goes).

Usage: `quest-n-click-bridge tenant <export|delete> --tenant=<id> [--out=<file>] [--yes]`

| Code | Means |
|---|---|
| 1 | `delete` without `--yes`. |
| 2 | The usage line. |

<a name="bridge-backup"></a>

### `quest-n-click-bridge backup`

The whole store as one snapshot in a new file (backup schema 4). Over `--max-bytes` (default 256 MiB) no file is written: use `pg_dump` or the provider's snapshots. `--max-rows` defaults to 2,000,000.

Usage: `quest-n-click-bridge backup --out=<file> [--max-bytes=<n>] [--max-rows=<n>]`

| Code | Means |
|---|---|
| 1 | Too large, or the backup failed: no file written. |
| 2 | No `--out`, or a bound that is not a positive integer. |

<a name="bridge-restore"></a>

### `quest-n-click-bridge restore`

A backup into a SQL store, under a maintenance lease (the Bridges stopped for `replace-store`). The mode is always said (4.1.20): `merge` keeps what the file does not speak of and refuses a conflict unless `--force`; `replace-store` makes the store the file, after a safety backup of the store to `--safety-out`. A backup's digest is an integrity check, not a signature.

Usage: `quest-n-click-bridge restore --from=<file> --mode=merge [--force] [--max-bytes=<n>] [--lock-timeout=<ms>] · restore --from=<file> --mode=replace-store --yes-replace-store --safety-out=<new file> [--max-bytes=<n>] [--max-rows=<n>] [--lock-timeout=<ms>]`

| Option | Means |
|---|---|
| `--mode=merge\|replace-store` | Required. |
| `--force` | `merge` only: the tenants, runs and daily keys already held are replaced. |
| `--yes-replace-store` | `replace-store` only, required. |
| `--safety-out=<new file>` | `replace-store` only, required: where the store is backed up first. |

| Code | Means |
|---|---|
| 0 | Restored. |
| 1 | Nothing restored: a lease holds the store, a conflict, a journal store, a bad file. |
| 2 | The usage: no mode, an option of the other mode, a missing confirmation or safety file, a bad bound. |

<a name="connector"></a>

## `quest-n-click-connector`

One connector of the world outside, as its own process (4.1.9, experimental). Install the package without native code: `npm install --omit=optional --ignore-scripts @quest-n-click/connectors`. The options and exit codes below hold for every connector.

- Package: `@quest-n-click/connectors`.
- Where: on a machine beside the Bridge, in the folder of its configuration file (the paths in it are relative to that file). From the engine repository: `npm run connector -- <id> --config <file.json>`.
- Source: [`connectors/src/run.ts`](../../connectors/src/run.ts), [`connectors/src/registry.ts`](../../connectors/src/registry.ts).

| Option | Means |
|---|---|
| `--config <file.json>` | Required: the configuration (see "Configuration of a connector" above). |
| `--help, -h` | Prints the usage, exit 0. |

| Code | Means |
|---|---|
| 0 | Stopped by SIGTERM or SIGINT (Ctrl-C): no new input, work in flight drained for at most five seconds. Also `--help`. |
| 1 | No token, an inline `bridge.token` that is not a string, or a manifest for another game. |
| 2 | No arguments, an unknown connector, or no `--config`. |

<a name="connector-email"></a>

### `quest-n-click-connector email`

Letters, by signed webhook or IMAP.

Usage: `quest-n-click-connector email --config <file.json>`

<a name="connector-telnet"></a>

### `quest-n-click-connector telnet`

A Telnet terminal.

Usage: `quest-n-click-connector telnet --config <file.json>`

<a name="connector-ssh"></a>

### `quest-n-click-connector ssh`

An SSH terminal.

Usage: `quest-n-click-connector ssh --config <file.json>`

<a name="connector-open-badge"></a>

### `quest-n-click-connector open-badge`

Open Badges 2 and 3.

Usage: `quest-n-click-connector open-badge --config <file.json>`

<a name="studio-server"></a>

## `quest-n-click-studio-server`

The Studio Server (4.2.1): one game, several people, online. The command runs the engine's `studio-server/src/server/main.ts` with tsx, refused (exit 2) when the engine is missing or of another version. Every command but `login`, `token`, `deps` and `worker-keys` reads a configuration: `--config <file>`, else `STUDIO_CONFIG`, else `STUDIO_CONFIG_JSON`; its secrets come from `<NAME>_FILE` or the environment and leave it before anything runs. A configuration error prints `configuration: …`, exit 1.

- Package: `@quest-n-click/studio-server`.
- Where: on the Studio Server's machine (a Clever Cloud app, or yours), beside the engine of the same version (`npm install quest-n-click-<v>.tgz quest-n-click-studio-server-<v>.tgz`); in the engine repository, `npm run studio-server -- <command>`. `login` and `token` run on your own machine.
- Source: [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts), [`studio-server/src/ops/backup-bucket.ts`](../../studio-server/src/ops/backup-bucket.ts).

<a name="studio-server-serve"></a>

### `quest-n-click-studio-server serve`

The Studio Server: the API, the probes, the service lease. Without OpenID Connect it serves the loopback only. SIGTERM or SIGINT stops it, exit 0.

Usage: `quest-n-click-studio-server serve --config <file>`

| Option | Means |
|---|---|
| `--config <file>` | The configuration (or `STUDIO_CONFIG`, `STUDIO_CONFIG_JSON`). |

| Code | Means |
|---|---|
| 2 | No command or configuration, an unknown command, or a host other than the loopback without authentication. |

<a name="studio-server-import"></a>

### `quest-n-click-studio-server import`

A game folder (with its `index.ts`) becomes the instance's project: copied beside, renamed in, adopted by the journal (hosted: its files go to the blobs and the journal is shipped to the bucket).

Usage: `quest-n-click-studio-server import <dir> --config <file>`

| Code | Means |
|---|---|
| 1 | The instance already has a project. |
| 2 | No game folder with an `index.ts`. |

<a name="studio-server-export"></a>

### `quest-n-click-studio-server export`

The game at the head, written to an empty or new folder, each file checked against its hash, with `export-manifest.json` (game, epoch, revision, files).

Usage: `quest-n-click-studio-server export <dir> --config <file>`

| Code | Means |
|---|---|
| 2 | No empty or new folder. |

<a name="studio-server-invite"></a>

### `quest-n-click-studio-server invite`

Prints a one-time invitation link (`<publicUrl>/auth/login?invite=…`); the first owner comes this way.

Usage: `quest-n-click-studio-server invite --email <email> --role <owner|dev|reviewer> --config <file>`

| Code | Means |
|---|---|
| 2 | No email, or a role other than owner, dev, reviewer. |

<a name="studio-server-worker-keys"></a>

### `quest-n-click-studio-server worker-keys`

The job keys: `studio-worker.key` (0600, the Studio's secret `STUDIO_WORKER_KEY`) and `studio-worker.pub` (the worker's `WORKER_PUBLIC_KEY`), never printed; an existing file is not replaced.

Usage: `quest-n-click-studio-server worker-keys --out <existing folder>`

| Code | Means |
|---|---|
| 2 | No `--out`, or a folder that does not exist. |

<a name="studio-server-login"></a>

### `quest-n-click-studio-server login`

The CLI's device flow: open the URL printed and enter the code; the token is kept in a file of your configuration folder (0600).

Usage: `quest-n-click-studio-server login --server <https://studio.example>`

| Code | Means |
|---|---|
| 2 | No `--server`. |

<a name="studio-server-token"></a>

### `quest-n-click-studio-server token`

Prints the current access token (refreshed when near its end).

Usage: `quest-n-click-studio-server token --server <https://studio.example>`

| Code | Means |
|---|---|
| 2 | No `--server`. |

<a name="studio-server-deps"></a>

### `quest-n-click-studio-server deps`

Its own dependencies (`openid-client`, `jose`, `pg`): the version and folder each resolves to, as JSON.

Usage: `quest-n-click-studio-server deps`

<a name="studio-server-backup"></a>

### `quest-n-click-studio-server backup`

The project's tables, one snapshot, with the blobs they name (4.2.2), to a new file (0600). `--to-bucket` (4.2.3): to the bucket's `backups/` (blobs on S3 only), the `--keep` most recent kept.

Usage: `quest-n-click-studio-server backup <new file> --config <file> · backup --to-bucket [--keep <n>] --config <file>`

| Option | Means |
|---|---|
| `--to-bucket` | To the instance's bucket. |
| `--keep <n>` | With `--to-bucket`: how many backups to keep (1 or more). |

| Code | Means |
|---|---|
| 2 | No new file, or a bad `--keep`. |

<a name="studio-server-restore"></a>

### `quest-n-click-studio-server restore`

A backup into an empty hosted project (store PostgreSQL), then with `--replay` the journal shipped to the bucket since; the restore is then ended (the server does not serve meanwhile).

Usage: `quest-n-click-studio-server restore <file> [--replay] --config <file>`

| Option | Means |
|---|---|
| `--replay` | Also replays the shipped journal (blobs on S3). |

| Code | Means |
|---|---|
| 2 | No backup file. |

<a name="studio-server-replay"></a>

### `quest-n-click-studio-server replay`

A restore's replay resumed after it stopped, then the restore ended.

Usage: `quest-n-click-studio-server replay --config <file>`

| Code | Means |
|---|---|
| 1 | No restore is under way. |

<a name="studio-server-gc"></a>

### `quest-n-click-studio-server gc`

The blobs no row names (older than a day) and the worker's old staging: listed, or deleted with `--delete`.

Usage: `quest-n-click-studio-server gc [--delete] --config <file>`

| Option | Means |
|---|---|
| `--delete` | Deletes them. |

<a name="studio-worker"></a>

## `quest-n-click-studio-worker`

The Studio Server's processing worker (4.2.1, ADR 0028): it runs the game's code for the Studio, one job at a time per lane, each in a fresh child process and folder. It takes no argument: `WORKER_PUBLIC_KEY` (or `WORKER_PUBLIC_KEY_FILE`), `WORKER_INSTANCE` and `PORT` (default 8080, on 0.0.0.0) configure it.

- Package: `@quest-n-click/studio-server`.
- Where: on its own machine (a separate Clever Cloud app), with no secret of the platform; in the engine repository, `npm run studio-worker`.
- Source: [`studio-server/src/worker/main.ts`](../../studio-server/src/worker/main.ts).

<a name="studio-worker-usage"></a>

### `quest-n-click-studio-worker`

Serves `POST /jobs`, `GET /livez` and `GET /readyz` (503 once a job left a process behind).

Usage: `quest-n-click-studio-worker`

| Code | Means |
|---|---|
| 0 | Stopped by SIGTERM. |
| 2 | `WORKER_PUBLIC_KEY` or `WORKER_INSTANCE` missing. |
| 75 | Recycled: a job left a process behind; the instance exits once idle and the platform starts a fresh one. |

<!-- generated:end -->
