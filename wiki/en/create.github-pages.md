# Publish on GitHub Pages

A created project has no CI workflow. This page gives one: on every push to `main`, GitHub builds the game with the
repository's base path and publishes `dist/` on GitHub Pages, at `https://<user>.github.io/<repo>/`.

<a name="what-you-get"></a>

## What you get

A workflow file, `.github/workflows/pages.yml`, in your game's repository. Each push to `main` runs the game's checks
and build, and deploys the result to Pages only when they pass.

<a name="context-and-versions"></a>

## Context and versions

- A created project (`quest-n-click create`), pushed to a GitHub repository. The engine repository had its own Pages
  job in `.github/workflows/ci.yml` up to 4.5.1; this workflow is its game part, without what the engine added there
  (the Studio demo and the documentation under `/docs/`). Since 4.5.2 the engine deploys no Pages: its demo is on the
  project's website, `https://quest-n-click.cleverapps.io/demo/`, served from each release's `quest-n-click-v<version>-web.tar.gz` (the same build
  under `BASE_PATH=/demo/`).
- From 4.2.5 (the `quest-n-click` command). `BASE_PATH` is read by the engine's Vite configuration
  ([`tools/vite/plugins.ts`](../../tools/vite/plugins.ts)).
- **Verified on: not run as written on a created project.** The steps are the engine repository's Pages job of 4.5.1
  (run on every push to `main`) with the created project's commands in place of the repository's. Check the first run's log.

<a name="prerequisites"></a>

## Prerequisites

- The project builds on your machine: `npm run build` passes ([Build and release a game](create.build-release.md)).
- `package-lock.json` committed (it is written by `npm install`): the workflow installs with `npm ci`.
- Pages enabled once for the repository: **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.

<a name="where-to-run"></a>

## Where to run the commands

The file goes in the created project, committed and pushed to `main`; GitHub runs it. The local check of the same build
runs in the created project, on your machine.

<a name="steps"></a>

## Steps

<!-- step: enable-pages -->
1. In the repository's settings, set Pages' source to **GitHub Actions**.

<!-- step: add-workflow -->
2. Create `.github/workflows/pages.yml` in the created project:

   ```yaml
   name: pages
   on:
     push:
       branches: [main]
     workflow_dispatch:
   # The token reads; only the deploy job asks for more.
   permissions:
     contents: read
   # One deployment at a time; a newer push waits rather than cancelling one in flight.
   concurrency:
     group: pages
     cancel-in-progress: false
   jobs:
     build:
       runs-on: ubuntu-24.04
       timeout-minutes: 30
       steps:
         - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
         - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
           with:
             node-version: 22
             cache: npm
         - uses: actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97 # v7
           with:
             python-version: '3.12'
         - run: npm ci
         # The asset step (npm run assets, inside build) needs Pillow; the list ships with the engine.
         - run: pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt
         # Only when game/audio or a video holds files to encode: the runner has no ffmpeg.
         - run: command -v ffmpeg || (sudo apt-get update && sudo apt-get install -y ffmpeg)
         # Assets, verify (validate, solve, translations, lint, playtests), the build, dist/ accounted for.
         - run: npm run build
           env:
             # https://<user>.github.io/<repo>/: every path of the build under /<repo>/.
             BASE_PATH: /${{ github.event.repository.name }}/
         - uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5
           with:
             path: dist
     deploy:
       needs: build
       runs-on: ubuntu-24.04
       timeout-minutes: 15
       permissions:
         pages: write
         id-token: write
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       steps:
         - id: deployment
           uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5
   ```

   The actions are pinned to the commits the engine repository uses. To release with the gates
   ([`npm run release`](create.build-release.md#steps)), put `npm run release` in place of `npm run build`.

<!-- step: base-path -->
3. Choose `BASE_PATH` for your address:

   | Address | `BASE_PATH` |
   |---|---|
   | `https://<user>.github.io/<repo>/` (a project site) | `/<repo>/`, as in the workflow |
   | `https://<user>.github.io/` (a repository named `<user>.github.io`) | remove the `env` block: `/` |
   | A custom domain at its root | remove the `env` block: `/` |

   Write it with a slash at both ends. The page's manifest and icons are written as `<BASE_PATH>icons/…`: without the
   trailing slash they point to `/<repo>icons/…`.

<!-- step: check-locally -->
4. Build the same thing on your machine, and play it:

   ```sh
   # in the created project
   BASE_PATH=/my-repo/ npm run build
   BASE_PATH=/my-repo/ npm run preview
   ```

   Then open `http://127.0.0.1:4173/my-repo/`.

<!-- step: push -->
5. Commit and push to `main`. The run appears under **Actions**; the deploy job's summary gives the site's address.

> [!LIMIT id=no-studio-no-docs]
> This workflow publishes the game only. The project's own site also builds the Studio demo (`STUDIO=1`,
> `VITE_STUDIO_DEMO=1`) and assembles `/docs/`; neither is part of a created project's site.

<a name="expected-result"></a>

## Expected result, and how to check it

- The run is green and the `deploy` job links `https://<user>.github.io/<repo>/`.
- The game opens there, the browser's address bar keeps `/<repo>/`, and the pause menu's "Offline" row ends at "complete"
  (the warm-up of [the offline cache](create.deploy-issues.md#cache-and-service-worker)).
- The browser's developer tools show `https://<user>.github.io/<repo>/sw.js` as the active service worker.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| The deploy job fails with a message about the environment or Pages not being enabled | Pages' source is not "GitHub Actions" | Step 1 |
| `npm ci` refuses: no `package-lock.json` | The lockfile was not committed | `npm install` in the created project, commit `package-lock.json` |
| `No module named 'PIL'` | The pip step is missing or failed | Keep the `pip install` step before `npm run build` |
| `ffmpeg` not found while encoding audio | The runner has none | Keep the ffmpeg step |
| A blank page, 404s on `/assets/index-….js` | Built without `BASE_PATH`, served under `/<repo>/` | Keep the `env` block; see [Sub-path](create.deploy-issues.md#sub-path) |
| The old version keeps showing after a deploy | The service worker waits for the player | [Cache and service worker](create.deploy-issues.md#cache-and-service-worker) |

<a name="files-changed"></a>

## Files or data changed

- `.github/workflows/pages.yml` in your repository.
- The repository's `github-pages` environment, which GitHub creates on the first deployment.
- Nothing in `dist/` is committed: the workflow builds it each time.

<a name="recovery"></a>

## Recovery or going back

To put an earlier version back, revert the commit on `main` (`git revert`) and push, or re-run the workflow run of an earlier commit
(**Actions → that run → Re-run all jobs**): it builds that commit and deploys it. Players already on the newer version
get the older one through the update banner, and saves follow the rules in
[Going back](create.deploy-issues.md#going-back). Turning Pages off (Settings → Pages) unpublishes the site.

<a name="references"></a>

## References

- The engine repository's Pages job, up to 4.5.1: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), which has
  none since 4.5.2; [its version of 4.5.1](https://github.com/Quest-n-Click/quest-n-click/blob/v4.5.1/.github/workflows/ci.yml) (`check`, the build with `BASE_PATH`, and `pages`).
- `BASE_PATH` and the manifest: [`tools/vite/plugins.ts`](../../tools/vite/plugins.ts);
  [`BASE_PATH`](reference.environment-variables.md#base-path).
- What `npm run build` and `release` run in a created project: [`cli/quest-n-click.mjs`](../../cli/quest-n-click.mjs);
  the project's files: [`cli/create.mjs`](../../cli/create.mjs).
