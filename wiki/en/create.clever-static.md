# The static game on Clever Cloud

The game is a static site; on Clever Cloud it runs as a small Node application that builds `dist/` at each deploy and
serves it. This page is for the game alone. Hosting the team Studio is another matter: [Clever Cloud overview](clever.overview.md).

<a name="what-you-get"></a>

## What you get

A Clever Cloud Node application, deployed with `git push` through `clever deploy`, that serves your game at its
domain. Each deploy builds the game again from the pushed commit.

<a name="context-and-versions"></a>

## Context and versions

Two cases, with different set-ups:

- **The engine repository** (a game in `games/<id>/`): `npm start` serves `dist/` with sirv
  ([`scripts/start.mjs`](../../scripts/start.mjs)), on every interface, on `$PORT` (8080 when unset), every file with
  `Cache-Control` `max-age=3600`. The launcher exists since 4.1.8. `public/assets` is committed in this repository, so
  the deploy needs Vite only, not Python.
- **A created project** (`quest-n-click create`): it has no `start` script and no static server (the engine package
  leaves `sirv-cli` out), and `public/assets` is not committed, so the deploy must run the asset step, which needs
  Python and Pillow.

The page applies from 4.2.5. **Verified on: not verified.** The engine repository's settings below are the ones
`docs/en/TOOLS.md` gave through 4.4.0; nobody has replayed this page on a live Clever Cloud application, and the
created-project case has never been deployed there by the project. Read each command before you run it.

<a name="prerequisites"></a>

## Prerequisites

- A Clever Cloud account and `clever-tools`, logged in (`clever login`).
- The game builds on your machine ([Build and release a game](create.build-release.md)): the deploy runs the build
  again, and a failing build leaves the previous version online.
- The project is a Git repository with its work committed: `clever deploy` pushes the current branch's commit.

<a name="where-to-run"></a>

## Where to run the commands

On your machine, in the engine repository or in the created project: `clever …` links that folder to the application
and pushes its Git history. The build itself runs on Clever Cloud.

<a name="steps"></a>

## Steps

<!-- step: create-app -->
1. Create a Node application and link it to the folder:

   ```sh
   # in the engine repository or the created project
   clever create --type node my-game
   ```

<!-- step: configure -->
2. Configure the build.

   **Engine repository**: Vite is a development dependency, the build is `build:web`, and `GAME` names the game
   (else `package.json` → `config.game`, else `demo`):

   ```sh
   # in the engine repository
   clever env set CC_NODE_DEV_DEPENDENCIES install
   clever env set CC_POST_BUILD_HOOK "npm run build:web"
   clever env set GAME my-game
   ```

   **Created project**: give it a server and a start command, then a build hook that installs Pillow next to the
   application and builds:

   ```sh
   # in the created project
   npm install sirv-cli@3
   npm pkg set scripts.start="sirv dist --host 0.0.0.0 --port \$PORT --maxage 3600"
   clever env set CC_POST_BUILD_HOOK "python3 -m pip install --target .python --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt && PYTHONPATH=.python npm run build"
   git add package.json package-lock.json && git commit -m "Serve dist/ on Clever Cloud"
   ```

   The created project's `build` runs `verify` (the solver included) on the server, on every deploy.

<!-- step: base-path -->
3. Leave `BASE_PATH` unset: the application serves the game at the root of its domain. Set it only if a proxy in front
   publishes the game under a sub-path ([Sub-path](create.deploy-issues.md#sub-path)).

<!-- step: deploy -->
4. Deploy, and follow the logs:

   ```sh
   # in the engine repository or the created project
   clever deploy
   clever logs
   ```

<!-- step: domain -->
5. Open it at the domain Clever Cloud gives (`clever open`), or add yours with `clever domain add play.example.org`
   and its DNS record.

> [!LIMIT id=build-web-skips-checks]
> In the engine repository, `build:web` is the Vite build alone: no validation, solver, `verify:dist` nor spoiler
> check. Run `npm run build` (or let CI run it) before you deploy; the deploy does not.

<a name="expected-result"></a>

## Expected result, and how to check it

- `clever logs` shows the hook's build, then sirv listening on port 8080.
- The game opens at the application's domain; the pause menu's "Offline" row (or its translation) ends at "complete"
  (the engine's default text; a game translates it).
- In the engine repository, `node scripts/e2e.mjs https://<your-domain>/` plays it to the end.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `vite: not found` in the build log | Development dependencies not installed (engine repository) | `CC_NODE_DEV_DEPENDENCIES=install` |
| The application never becomes healthy | Nothing listens on `$PORT`, or only on `127.0.0.1` | `npm start` must serve on `0.0.0.0:$PORT` (the launcher and the script above do) |
| `No module named 'PIL'` | The hook did not install Pillow, or `PYTHONPATH` is missing | Keep both parts of the created project's hook |
| The demo game instead of yours | `GAME` unset in the engine repository | `clever env set GAME <id>`, then deploy |
| The previous version still shows | The service worker waits for the player; `index.html` is cached for an hour | [Cache and service worker](create.deploy-issues.md#cache-and-service-worker) |

<a name="files-changed"></a>

## Files or data changed

- The application and its variables on Clever Cloud; a `clever` remote and `.clever.json` in the folder.
- Created project: `package.json` (`start`, the `sirv-cli` dependency) and `package-lock.json`.
- `dist/` and `.python/` on the application's file system, rebuilt at each deploy.

<a name="recovery"></a>

## Recovery or going back

A failed build is not deployed: the running instance keeps serving the previous version. To go back to an earlier
version, revert the commit and `clever deploy` again; players' caches and saves then follow
[Going back](create.deploy-issues.md#going-back). `clever delete` removes the application.

<a name="references"></a>

## References

- [`scripts/start.mjs`](../../scripts/start.mjs) (`npm start`), [`package.json`](../../package.json) (`build:web`).
- [`tools/game.ts`](../../tools/game.ts): how `GAME` chooses the game.
- [`cli/quest-n-click.mjs`](../../cli/quest-n-click.mjs) and [`scripts/pack.mjs`](../../scripts/pack.mjs): a created
  project's commands, and the package without `sirv-cli`.
- The variables: [`CC_POST_BUILD_HOOK`](reference.environment-variables.md#cc-post-build-hook),
  [`CC_NODE_DEV_DEPENDENCIES`](reference.environment-variables.md#cc-node-dev-dependencies),
  [`PORT`](reference.environment-variables.md#port), [`GAME`](reference.environment-variables.md#game).
