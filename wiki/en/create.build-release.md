# Build and release a game

`npm run build` turns a game into a static folder, `dist/`, that any web host can serve: the game, its assets, its
service worker and its licences. A release build adds the gates a game must pass before people play it: provenance
locked, budgets, translations, voices, playtests and the exhaustive proof. This page says what each command checks, in
which folder it runs, and what to look at before you send the link.

<a name="what-you-get"></a>

## What you get

A `dist/` folder, checked file by file, ready to upload: an installable web app (PWA) that plays offline after the
first visit, whose every file is accounted for with its licence under `dist/licenses/`.

<a name="context-and-versions"></a>

## Context and versions

The same game builds in two places, with different commands:

| | Created project (`quest-n-click create`) | Engine repository (`games/<id>/`) |
|---|---|---|
| Everyday build | `npm run build` | `npm run build` |
| Release build | `npm run release` | `npm run verify:release` after `npm run build` |
| Release that may be sold | `npm run release -- --commercial` | `npm run verify:commercial` |
| Exhaustive proof | inside `npm run release` | `npm run prove:game` |
| Sealed ending | not available (`seal` is not a `quest-n-click` command) | `npm run seal`, `npm run check:spoilers` |
| Serve `dist/` | `npm run preview` (local only) | `npm run preview`, or `npm start` (any interface, `$PORT`) |

The page applies from 4.2.5, when the command became `quest-n-click` (before, `web-scumm`). The created project and
its `build` and `release` commands exist since 3.9.0; `npm start` is a Node launcher since 4.1.8.

<a name="prerequisites"></a>

## Prerequisites

- Node 22.12 or later, the project installed (`npm install` in a created project, `npm ci` in the engine repository).
  See [Requirements](install.requirements.md).
- Python 3 with the packages of `requirements.txt` (Pillow first): `npm run assets` turns `art/` and `audio/` into
  `public/assets`, and a created project's `build` runs it every time. In a created project the file is
  `node_modules/@quest-n-click/engine/requirements.txt`.
- ffmpeg when the game has sounds, music or video to encode, and for a release when the game declares music in stems
  (`validate --release` measures them with ffprobe).
- A game that passes its checks: [Checking your game](create.checking.md). Building runs them again and stops on the
  first that fails.

<a name="where-to-run"></a>

## Where to run the commands

- "In the created project": the folder `quest-n-click create` made, the one with `game/` and `package.json`.
- "In the engine repository": the clone of `Quest-n-Click/quest-n-click`. The game built is the one `GAME` names, else the one
  `npm run game` selected, else `package.json` → `config.game`, else `demo`.

<a name="steps"></a>

## Steps

<!-- step: assets -->
1. **Prepare the assets** when images or sounds changed.

   ```sh
   # in the engine repository (public/assets is committed there: commit what this writes)
   npm run assets
   ```

   In a created project, `public/assets` is not committed (its `.gitignore` lists it) and `npm run build` runs
   `assets` itself.

<!-- step: build -->
2. **Build.**

   ```sh
   # in the created project
   npm run build
   ```

   It runs, and stops at the first failure: `assets`; `verify` (validate, solve, translations status, lint,
   playtests); the Vite build into `dist/`; then the check that every file of `dist/` is accounted for.

   ```sh
   # in the engine repository
   npm run build
   ```

   It runs `check` (types, the Node tests) then `build:game`: `verify:game` (validate, solve, solve by chapter,
   variants, translations status, lint, playtests), the Vite build, `verify:dist`, `check:spoilers` and
   `audit:assets`.

<!-- step: release -->
3. **Run the release gates** before a public release.

   ```sh
   # in the created project
   npm run release                 # or: npm run release -- --commercial
   ```

   `release` runs `assets`, `verify` and the build, then: `validate --release` (the provenance lock, placeholders, ids),
   `weight --release` (what a phone downloads, against the game's `assetBudgets`), `i18n status`,
   `voices check --release`, `playtests --strict`, `solve --prove` (every reachable state), `solve-reality`, and with
   `--commercial` `validate --commercial --errors` (no exception, no placeholder, no non-commercial licence); last,
   the check of `dist/`.

   ```sh
   # in the engine repository
   npm run verify:release          # or: npm run verify:commercial
   npm run prove:game
   ```

   The template's art is a placeholder: a release refuses it until each file is replaced, reviewed and locked
   (`npx quest-n-click provenance --lock` in a created project, `npm run provenance -- --lock` in the engine
   repository). See [Asset provenance](create.asset-provenance.md).

<!-- step: seal -->
4. **Seal the ending**, only for a game with a sealed ending, in the engine repository: seal the real outcome, build,
   commit, then deploy. The whole procedure is in [The sealed ending](create.sealed-ending.md).

   ```sh
   # in the engine repository, with games/<id>/private/ending.config.ts filled in
   npm run seal -- --outcome=<key>
   npm run build
   ```

<!-- step: deploy -->
5. **Upload `dist/`** to a static host (next section), then **play the live version**.

   ```sh
   # in the engine repository: plays the deployed game to its ending, in a phone-sized browser
   node scripts/e2e.mjs https://<your-site>/
   ```

   `scripts/e2e.mjs` is in the engine repository only; in a created project, play the live site by hand to the end.

<a name="ship"></a>

### What the build ships

`npm run build` type-checks (in the engine repository), tests, bundles and audits the output. The result is a PWA:

- the service worker caches the app shell (code, styles, the page, fonts used by the page, the icons) at install;
- images and sounds are cached on first use, and the engine warms in the background the current room, the rooms one
  exit away and their audio;
- by default (`GameDef.offline: 'full'`) it then fetches the rest of the game during idle time, so the whole game
  plays offline after the first visit; with `offline: 'nearby'`, rooms never visited nor warmed may still need the
  network. Rooms are never all downloaded up front before the game starts: that keeps the first visit light.

The pause menu tells the player whether the whole game is cached. The details are in
[Sub-path, cache and service worker](create.deploy-issues.md#cache-and-service-worker).

Every build ends by removing from `dist/assets` the files that are not this game's and writing `dist/licenses/`:
the engine's `LICENSE`, `LICENSE-ASSETS`, `CREDITS.md` from the game's provenance, `THIRD_PARTY_NOTICES.txt` and
`assets-manifest.json` (each file's path, author, source, licence, SHA-256 and status). The check that follows
refuses any other file in `dist/`, and a locked file or a notice that is missing.

<a name="deploying"></a>

### Deploying

`dist/` is static: any static host serves it.

- **GitHub Pages**: a workflow builds with `BASE_PATH=/<repo>/` and deploys `dist/`. For a created project, which has
  no workflow, copy the one in [Publish on GitHub Pages](create.github-pages.md).
- **Clever Cloud**: a Node application that builds on deploy and serves `dist/`; see
  [The static game on Clever Cloud](create.clever-static.md).
- **Netlify, Cloudflare Pages, nginx, a bucket…**: [Other static hosts](create.other-hosts.md).

Under a sub-path (`https://<user>.github.io/<repo>/`), build with `BASE_PATH=/<repo>/`; at the root of a domain, no
`BASE_PATH`. Every path (scripts, styles, manifest, icons, service worker, the sealed ending's file) follows it:

```sh
# in the created project or the engine repository: the same build as Pages, locally
BASE_PATH=/my-repo/ npm run build
```

What goes wrong under a sub-path, with the cache or with a half-uploaded site:
[Sub-path, cache and service worker, incomplete deploys, going back](create.deploy-issues.md).

In the engine repository, `games/<id>/private/` (photos, raw sheets, the sealed ending's configuration) is never
sent: `.gitignore` excludes it, and nothing in it is copied into `dist/`. A created project's `.gitignore` lists only
`node_modules`, `dist`, `.cache` and `public/assets`: keep private files outside `game/`, or add them to it.

> [!LIMIT id=release-proof-not-witness]
> `npm run build` and `npm run verify` ask the solver for a witness: one way to an ending. Only the release
> (`npm run release` in a created project, `npm run prove:game` in the engine repository) asks for the exhaustive
> proof, which fails on a softlock or a truncated search. [What the solver proves](create.solver-proofs.md) says what
> each lets you conclude.

> [!LIMIT id=accessibility-machine-only]
> The CI checks accessibility as far as a machine can (axe-core on every screen, play by keyboard and by touch). That
> is not a WCAG conformance claim: a screen reader and real devices are passes a person makes.

<a name="expected-result"></a>

## Expected result, and how to check it

- The command ends without error and `dist/` holds `index.html`, `sw.js`, `manifest.webmanifest`, `assets/`,
  `icons/`, `fonts/` and `licenses/`.
- `npm run preview` serves it on `http://127.0.0.1:4173/`: play it there before uploading.
- After the upload, play the live site to the end on a real phone, in landscape; open the pause menu and wait for
  "complete" on its "Offline" row before you test offline.
- The last checks before you share the link (a real phone, someone else playing without help, the sealed ending) are
  in [Checking your game](create.checking.md#before-you-share).

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `python3` not found, or `No module named 'PIL'` | The asset step needs Python 3 and Pillow | `pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt` (created project) or `pip install --require-hashes -r requirements.txt` (engine repository) |
| `provenance.lock.json › missing: a release ships the files that were reviewed` | No lock yet | Review the assets, then lock them (step 3) |
| A placeholder refused by `validate --release` | The template's art is still there | Replace it, or name it in `releaseExceptions` with a reason (refused by `--commercial`) |
| `audio.scores › ffprobe not found` | A release measures the stems | Install ffmpeg, then `npx quest-n-click doctor` |
| A file of `dist/` not accounted for | A stray file in `public/`, or an asset not this game's | Remove it, or declare it (a data file the game names) |
| A blank page once online, under `/<repo>/` | Built without `BASE_PATH` | [Sub-path](create.deploy-issues.md#sub-path) |
| `audit: <n> leak(s) found` on a word of your own game | A word of the engine's private origin is also, by chance, a word of your game (a real person's first name) | [Allow it for your game](#audit-allow) |

<a name="audit-allow"></a>

### A word of your game blocked by the leak audit

`audit:assets` (run by `build:game`) blocks the words of the engine's private origin project, stored as SHA-1 prefixes.
When one of them is also a word your game needs, allow it for your game only, in `games/<id>/audit-allow.json`, by the
prefix the audit already holds and a reason that does not spell the word:

```json
{ "allow": [{ "sha1": "<the first 12 hex digits of the word's SHA-1>", "why": "a colleague in the game" }] }
```

The prefix of a word: `node -e "console.log(require('crypto').createHash('sha1').update('<word>').digest('hex').slice(0, 12))"`,
in lowercase. The word is then allowed in `games/<id>/` (except in `audit-allow.json` itself) and, when `<id>` is
the game being built, in `public/assets/`; everywhere else it is still a leak. A prefix the audit does not block stops
the audit, so the file cannot outlive the word it excuses.

<a name="files-changed"></a>

## Files or data changed

- `dist/`: emptied and rewritten by each build (not committed).
- `public/assets/` and `.cache/refs.json`: written by `assets` (committed in the engine repository, not in a created
  project).
- `games/<id>/data/` (engine repository): the sealed ending's file, written by `seal`.
- Nothing in `node_modules/@quest-n-click/engine`: the engine is read, never written.

<a name="recovery"></a>

## Recovery or going back

A build changes nothing you cannot rebuild: delete `dist/` and run it again. To put an earlier version back online,
deploy the build of an earlier commit; what players' caches and saves do then is in
[Going back](create.deploy-issues.md#going-back).

<a name="references"></a>

## References

- [`cli/quest-n-click.mjs`](../../cli/quest-n-click.mjs): what `build` and `release` run in a created project.
- [`package.json`](../../package.json): `build`, `build:game`, `verify:release`, `verify:commercial`, `prove:game`,
  `start` in the engine repository; [`scripts/start.mjs`](../../scripts/start.mjs).
- [`tools/dist.ts`](../../tools/dist.ts): what `dist/` may hold; [`tools/validate.ts`](../../tools/validate.ts): the
  release and commercial gates.
- [`vite.config.ts`](../../vite.config.ts): the build and the service worker.
- [npm scripts](reference.npm-scripts.md), [The package](install.package.md).
