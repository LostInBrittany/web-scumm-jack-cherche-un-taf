# First deployment

The first time the team Studio goes live: deploy the worker, then the studio, import the game once, invite the first
owner, and check that the instance serves writes.

<a name="what-you-will-build"></a>

## What you will build

A running hosted Studio at `https://studio.example.fr`: your game imported as revision 1, its files in the bucket, you
logged in as its first owner, and `/readyz` answering 200.

**Verified on: 19 October 2026, by the reference deployment**, from the repository, at engine commit 52e68932
(package.json 4.2.2, the 4.2.3 work before its tag), Clever Cloud test organisation, region `par`, two XS apps,
PostgreSQL DEV, Cellar S, managed Keycloak, on three `*.cleverapps.io` names. Not verified on a live installation:
this page's exact text, a custom domain, and the release-archive variant ([below](#from-release-archives)). Applies
from 4.3.0, the version whose commands carry the `quest-n-click` names used below (the packages are
`@quest-n-click/…` from 4.5.2; the archives keep their names).

<a name="what-you-need"></a>

## What you need

- [Apps and add-ons](clever.apps-addons.md), [Domains and TLS](clever.domains-tls.md), the provider
  ([Keycloak](clever.keycloak.md)) and the [Configuration](clever.configuration.md), all done.
- Your game in the deployed repository, under `games/my-game` (the configuration's `game`), with its prepared assets
  committed in `public/`.
- The verified email you will log in with, known to the provider.

<a name="steps"></a>

## Steps

<!-- step: deploy-worker -->
1. Deploy the worker first, then the studio, from your machine, in the engine repository:

   ```sh
   # on your machine, in the engine repository
   clever deploy --alias my-game-worker
   clever deploy --alias my-game-studio
   ```

   Each deploy pushes the folder's current commit. The worker's build runs its Python hook; the studio's builds the
   Studio's page (`npm run studio-client`). You see each end with "deployed".

> [!MEASURE id=first-deploy-time]
> Worker: "deployed in 0 minutes and 36 seconds" (about 48 s end to end), its pip hook about 7 s. Studio: "0 minutes
> and 29 seconds" (about 43 s end to end).
> - date: 2026-10-19
> - version: 4.2.2
> - volume: one deploy of each app, from the repository
> - conditions: reference deployment phase A, engine at commit 52e68932 before the 4.2.3 tag (package.json said 4.2.2); Clever Cloud test organisation, region par; two XS apps, PostgreSQL DEV, Cellar S; one sample each
> - source: [QUALIF-4.2.3-REFERENCE.md §1](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

<!-- step: watch-start -->
2. Watch the studio start. `clever logs` follows the logs until it is stopped, even with `--until`: run it in the
   background, and stop it by its process id once you have what you need:

   ```sh
   # on your machine, in the engine repository
   clever logs --alias my-game-studio > studio.log 2>&1 &
   echo $!          # the process id, to stop it later with: kill <that id>
   ```

   A refused configuration stops the server with one line naming the field (see
   [Configuration](clever.configuration.md#common-errors)). Once it listens and holds the lease, the log has a
   `{"event":"lease-taken",…}` line.

<!-- step: import -->
3. Import the game once, from a shell on the studio app:

   ```sh
   # on your machine, in the engine repository
   clever ssh --alias my-game-studio
   ```

   ```sh
   # in that shell, on the studio app
   cd "$APP_HOME"
   npm run studio-server -- import games/my-game
   ```

   The shell of `clever ssh` has the app's variables (`STUDIO_CONFIG_JSON`, the add-ons'), so no command needs
   `--config`. The import sends every file to the bucket and prints `{"event":"imported","game":"my-game","revision":1}`.
   It refuses an instance that already has a project ("import: this instance already has a project").

> [!MEASURE id=import-time]
> The demo game's import through `clever ssh`: 242 s, revision 1.
> - date: 2026-10-19
> - version: 4.2.2
> - volume: `games/demo`, 500 files sent to Cellar
> - conditions: reference deployment phase A, engine at commit 52e68932 before the 4.2.3 tag (package.json said 4.2.2); studio app XS, Cellar S, region par; one sample
> - source: [QUALIF-4.2.3-REFERENCE.md §1](https://github.com/Quest-n-Click/quest-n-click/blob/78d77ff617f7db215f0c556a1768a90265e8ad74/docs/dev/QUALIF-4.2.3-REFERENCE.md)

<!-- step: invite-owner -->
4. In the same shell, invite the first owner:

   ```sh
   # in that shell, on the studio app
   npm run studio-server -- invite --email you@example.fr --role owner
   ```

   It prints a one-time link, `https://studio.example.fr/auth/login?invite=…`, valid 7 days. Open it and log in with
   that verified email. The invitation is consumed only by that email, verified by the provider.

   `clever ssh --command '…'` runs one command without an interactive session, but refuses while a second instance is
   listed (the old one of a deploy stays `STOPPING` for about two minutes): wait for it to go.

<!-- step: readyz -->
5. Check the instance serves writes:

   ```sh
   # on your machine
   curl -s https://studio.example.fr/readyz
   ```

   It answers 200 with `{"ok":true,"writes":"served","rpoMs":0}` once the instance holds the service lease, and 503
   with `"writes":"waiting"` before. In the Studio, `GET /auth/me` says `role: owner`; make one change (a note) and see
   it saved.

<!-- step: first-backup -->
6. Take a first backup to the bucket, by the daily backup's own script, and see its line:

   ```sh
   # in a shell on the studio app (clever ssh --alias my-game-studio)
   cd "$APP_HOME" && ops/studio/backup-cron.sh
   ```

   It prints `{"event":"backup","key":"backups/<date>-r1.json",…}` ([Backups](clever.backups.md)).

<a name="from-release-archives"></a>

### From the release archives

From 4.2.1 a release carries `quest-n-click-studio-server-<version>.tgz` (named `web-scumm-studio-server-…` before
4.3.0): the two commands `quest-n-click-studio-server` and `quest-n-click-studio-worker`, the Studio's page already
built, and its own dependencies (OpenID Connect, JWT, Postgres). Their versions are locked in its
`npm-shrinkwrap.json` and its SBOM. npm reads that lock when it installs from the registry, not from an archive file,
where `pg` takes the latest 8.x its range allows (`quest-n-click-studio-server deps` says which). It runs the server of
the engine installed beside it, which must be the same version:

```sh
# in your deployment folder (an app's repository or a server), the two archives of one release beside it
npm install quest-n-click-<version>.tgz quest-n-click-studio-server-<version>.tgz
npx quest-n-click-studio-server import ./my-game --config studio.config.json
npx quest-n-click-studio-server serve --config studio.config.json
npx quest-n-click-studio-worker          # on the worker's machine, with WORKER_PUBLIC_KEY and WORKER_INSTANCE
```

- A worker installed from the archives prepares assets too (since 4.2.3; in 4.2.2 this needed a worker deployed from
  the repository). Its build hook installs the hashed `requirements.txt` the engine's package carries, from the
  worker's folder, where the worker looks for the packages (`WORKER_PYTHON_PATH` to put them elsewhere):
  `CC_POST_BUILD_HOOK=python3 -m pip install --target .python --require-hashes --only-binary=:all: -r node_modules/@quest-n-click/engine/requirements.txt`.
  Its hashes cover the wheels of every platform PyPI publishes, Clever Cloud's native runtime (CPython 3.13, Linux
  x86_64) among them. Before 4.5.2 the hook named `ops/studio/worker-requirements.lock`, which is gone.
- The engine's archive brings Vite and tsx, which the worker needs to run the game's code and build its previews (the
  Studio itself no longer runs Vite, since 4.2.2).
- Set `publicDir` to your game's prepared assets (`public/` of your game's repository): the engine's own `public/`
  holds only its icons and font.
- The archives do not carry the daily backup's script: [Backups](clever.backups.md#from-archives) says how to add it.
- Each release's candidate installs these two archives in an empty folder and serves a game from them, its
  dependencies found whether npm hoists or nests them (`scripts/studio-install-smoke.mjs`). That is a CI check, not a
  Clever Cloud deployment.

The general install from the archives is [Install from the release archive](install.from-archive.md).

<a name="what-you-learned"></a>

## What you learned

- The worker goes first, the studio second; the import and the first invitation run once, on the studio app, through
  `clever ssh`, without `--config`.
- `/readyz` says whether this instance serves writes, and how far the journal's shipping to the bucket is behind
  (`rpoMs`).
- `clever logs` never stops by itself: stop it by its process id.

<a name="next"></a>

## Where to go next

- Invite the team: [Invitations](team.invitations.md).
- Set alerts: [Monitoring](clever.monitoring.md). Schedule a [restore drill](clever.restore-drill.md).
- The next deploy: [Redeploys](clever.redeploys.md).
- The server's commands: [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts); the CLI
  reference: [The server's CLI](team.server-cli.md).
