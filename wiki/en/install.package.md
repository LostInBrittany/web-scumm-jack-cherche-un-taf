# Package reference

What the engine's npm packages hold, the commands the `@quest-n-click/engine` package gives a game project, and how each
release checks them. `scripts/pack.mjs` makes them from the files git tracks; installing them is on
[Install from the release archive](install.from-archive.md).

<a name="overview"></a>

## The engine as a package

Since 3.9 a game does not have to live in the engine repository. The engine is packed as `@quest-n-click/engine` (the
engine, its pages, its tools and the `quest-n-click` command, the game template), `@quest-n-click/create`
(`npm init @quest-n-click`) and, since 4.1.1, `@quest-n-click/bridge` (the reference Reality Bridge). Since 4.1.9 the
connectors are a fourth package, `@quest-n-click/connectors`, and since 4.2.1 the hosted Studio is a fifth,
`@quest-n-click/studio-server`.

From 4.5.2 the packages are named under the npm organisation's scope, `@quest-n-click/…`, so the organisation owns
them (D53). From 4.2.5 to 4.5.1 they were `quest-n-click`, `create-quest-n-click`, `quest-n-click-bridge`,
`quest-n-click-connectors` and `quest-n-click-studio-server`. The commands keep those names (`quest-n-click dev`,
`npx quest-n-click-bridge serve`), and so do the archives a release attaches (`quest-n-click-<version>.tgz`,
`create-quest-n-click-<version>.tgz`, …). `npx quest-n-click migrate` moves a game's imports
(`quest-n-click/content` becomes `@quest-n-click/engine/content`), its `tsconfig.json` and its dependencies
([Upgrade notes: 4.5](install.upgrade-notes-4-5.md#from-4-5-1-to-4-5-2)).

Until 4.2.4 these were `web-scumm`, `create-web-scumm`, `web-scumm-bridge`, `web-scumm-connectors` and
`web-scumm-studio-server` (the project was called web-scumm, D47). Through 4.2.x each release also shipped them under
their old names, and the old commands and imports (`web-scumm dev`, `web-scumm/content`) still worked, after a one-line
notice. 4.3.0 removes them: `npx quest-n-click migrate` renames what a game still says
([Coming from web-scumm](install.from-web-scumm.md)).

All five are on npm from 4.5.2, and each release also attaches them as archives ([Install from npm](install.from-npm.md)).

<a name="quest-n-click"></a>

## `@quest-n-click/engine`

The archive `quest-n-click-<version>.tgz`.

### Contents

The tracked files under `src/`, `tools/`, `studio-server/`, `cli/`, `games/_template/`, `public/icons/`,
`public/fonts/`, `public/og.png`, the store and migration files the Studio's journal shares with the Bridge
(`bridge/src/store*.ts`, `migrations.ts`, `allowlist.ts`), `index.html`, `studio.html`, `vite.config.ts`,
`tsconfig.json`, `requirements.txt` and `LICENSE`. Never a game of the
repository, a test, a source documentation page or a build. Left out of `tools/` as well: the asset audit, the Bridge's
cross-check and fixtures, the connectors' fuzz harness.

### Entry points

The command `quest-n-click` (`cli/quest-n-click.mjs`), and five public entries: `@quest-n-click/engine/content`, `/player`,
`/minigames`, `/testing`, `/reality` ([Public API](engine.api.md)), plus `@quest-n-click/engine/cli/*`. Anything else is
internal.

### Dependencies

The engine's runtime dependencies (`earcut`, `howler`, `navmesh`, `zod`) and what the tools need in a game project:
Vite and `vite-plugin-pwa`, `tsx`, `@typescript/typescript6` (the compiler API the tools use), `@types/node`,
`@types/howler`, Tweakpane, the MCP SDK. Tests and Playwright stay out, which is why `quest-n-click doctor` needs a
workaround in a created project ([doctor](install.doctor.md#in-created-project)). The package carries no lock: npm
resolves these ranges at install.

<a name="docs-bundle"></a>
<!-- applies: .. since 4.5.0 -->

### Its documentation, `docs-bundle/`

From 4.5.0 the package carries the documentation of its version, written by `npm run wiki -- bundle` into the prepared
folder before `npm pack` (never committed): `index.json`, `md/<lang>/<id>.md`, `legacy/<NAME>.md`, `assets/` and
`bundle-manifest.json` with each file's sha256. Two packs of one commit give the same bytes. The MCP server of a
created project reads it (`read_doc`, `search_docs`, `list_docs`).

<a name="create-quest-n-click"></a>

## `@quest-n-click/create`

The archive `create-quest-n-click-<version>.tgz`. One file, `index.mjs`, the command `create-quest-n-click`, which runs
`quest-n-click create` from the engine it depends on (`@quest-n-click/engine` at the same version):
`npm init @quest-n-click my-game "My Game"` once on npm (or `npx @quest-n-click/create my-game "My Game"`).
`npx create-quest-n-click my-game` still works and runs the same thing: the unscoped `create-quest-n-click` is a relay,
published on a maintainer's account, whose command imports `@quest-n-click/create/index.mjs`. So this package keeps
`index.mjs` at its root and no `exports` map.

<a name="quest-n-click-bridge"></a>

## `@quest-n-click/bridge`

The archive `quest-n-click-bridge-<version>.tgz`. The reference Reality Bridge on its own: `bridge/src` bundled by esbuild into one module (`src/cli.mjs`, compiled since
4.1.2, so it runs on Node alone), its Datalog policies and its SQL migrations, the command `quest-n-click-bridge`
(`init`, `serve`, `grant`, `rotate`, `revoke`, `doctor`, `compact`, `migrate`, `tenant`, `backup`, `restore`). Biscuit's
WebAssembly and zod are dependencies; `pg` and OpenTelemetry are loaded by name only when used. It carries its
`npm-shrinkwrap.json` (since 4.1.19): an install resolves nothing. [The Bridge's CLI](bridge.cli.md).

<a name="quest-n-click-connectors"></a>

## `@quest-n-click/connectors`

The archive `quest-n-click-connectors-<version>.tgz`. The connector SDK, the command `quest-n-click-connector <email|telnet|ssh|open-badge> --config <file.json>` and the four
connectors bundled into one module, with the MIME reader's worker beside it; `ssh2` is a dependency. An operator's
package, run beside a Bridge, never a game's. Install it without native code:
`npm install --omit=optional --ignore-scripts quest-n-click-connectors-<version>.tgz`. It carries its
`npm-shrinkwrap.json`. Experimental (4.1.9). [Connectors](bridge.connectors.md).

<a name="quest-n-click-studio-server"></a>

## `@quest-n-click/studio-server`

The archive `quest-n-click-studio-server-<version>.tgz`. The commands `quest-n-click-studio-server` and
`quest-n-click-studio-worker`, which run the server and the processing worker of the engine installed beside it
(`@quest-n-click/engine`, an optional peer: the same version, or they stop with
`… runs with @quest-n-click/engine <v>, not <w>`),
and the Studio's page built once. Its own dependencies are locked in its `npm-shrinkwrap.json`; installed from the
archive file rather than the registry, npm resolves them from their ranges (`quest-n-click-studio-server deps` says
which). [Install from the release archive](install.from-archive.md#other-archives).

<a name="commands"></a>

## Commands of a created project

`npx quest-n-click help` lists them. The project's `package.json` names the usual ones as npm scripts (`dev`,
`studio`, `assets`, `verify`, `build`, `release`, `preview`):

| Command | What |
|---|---|
| `quest-n-click dev` / `studio` | the game, the Studio |
| `quest-n-click assets` | art and audio into `public/assets` |
| `quest-n-click verify` | validate, solve, translations, lint, playtests |
| `quest-n-click doctor` | the prerequisites: Node and Chromium required; Python, ffmpeg and WebKit optional, said when missing (4.1.6); needs a workaround in a created project ([doctor](install.doctor.md#in-created-project)) |
| `quest-n-click mcp` | the MCP server of this game, on stdio, for an assistant (4.1.6) |
| `quest-n-click build` | assets, verify, the build, every file of `dist/` accounted for |
| `quest-n-click release [--commercial]` | build, then the release gates: provenance lock, budgets, translations, voices, strict playtests, the proof |
| `quest-n-click validate`, `solve`, `lint`, `i18n`, `weight`, `provenance`, `playtests`, `voices`, `prompts`, `ids` | each tool, with its options |
| `quest-n-click speedrun verify <run.wsrun>` | a speedrun replayed against the game: its verdict, code and reason |
| `quest-n-click bridge`, `solve-reality` | a reference Bridge for the game; a game with `reality.signals` proved closed |
| `quest-n-click preview` | serve `dist/` locally |
| `quest-n-click create <folder> ["Title"] [--engine=<spec>]` | a new game project from the template |
| `quest-n-click migrate` | bring the game's sources to the installed engine's format ([Upgrade](install.upgrade.md)) |

They run with the project as their working folder
([`WEB_SCUMM_PROJECT`](reference.environment-variables.md#web-scumm-project)): the engine in
`node_modules/@quest-n-click/engine` is read, never written. Every option is on [Command line](reference.cli.md).

<a name="how-it-is-checked"></a>

## How it is checked

- `npm run fresh-install` (a CI job, when a package, template or authoring path changed): packs the engine
  (`npm run pack`), creates a game from the packed template in an empty folder outside the repository, installs the
  tarball, runs `assets`, `verify` and `build`, and plays the game to its ending in Chromium. A file of the new project
  that names the repository fails it.
- `npm run external-consumer` (each release candidate, on Ubuntu, macOS and Windows): the candidate's own archives,
  never packed again, installed outside the repository: a game created on an older release and moved to them, an old
  save played to the ending, the documentation bundle checked against its manifest and read through a real MCP client,
  `@quest-n-click/create`, the Bridge and the connectors from their archives.
- `npm run readme-quickstart`: the README's quick start, run as a reader copies it.
- `npm run upgrade-check -- --from=<version>`: a game moved from an older release to this one.
- `scripts/studio-install-smoke.mjs`: the engine and Studio Server archives installed together, a game served.

Each release attaches the five archives with their SBOMs and sums. Publishing them to npm is the maintainers' (the
organisation `quest-n-click` owns the five scoped names; from 4.5.2 CI stages them, an owner approves with 2FA, and
4.5.2 was the first published):
[npm packages](contribute.npm-packages.md).

<a name="related"></a>

## Related identifiers

- `npm run pack` (`node scripts/pack.mjs [--out=<dir>] [--publish-dry-run] [--build-id <id>] [--allow-dirty]`), writing
  into `.cache/pack` by default
- `npm run locks` (the Bridge's and connectors' locks, `scripts/locks/`; a lock that no longer fits stops `pack`)
- [Install from the release archive](install.from-archive.md), [Command line](reference.cli.md),
  [npm packages](contribute.npm-packages.md)
- [`scripts/pack.mjs`](../../scripts/pack.mjs), [`scripts/fresh-install.mjs`](../../scripts/fresh-install.mjs),
  [`scripts/external-consumer.mjs`](../../scripts/external-consumer.mjs)
