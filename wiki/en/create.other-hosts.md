# Other static hosts

`dist/` is a static folder: Netlify, Cloudflare Pages, an nginx or Apache server, an object storage bucket with a web
front, any host that serves files can serve the game. This page says what such a host needs, whether it builds the game
itself or you upload a `dist/` built elsewhere.

<a name="what-you-get"></a>

## What you get

The game served by the host of your choice, with its service worker updating cleanly and its offline cache working.

<a name="context-and-versions"></a>

## Context and versions

- A created project or the engine repository; the build is the same ([Build and release a game](create.build-release.md)).
- From 4.2.5.
- **Verified on: not verified.** The project builds and checks `dist/` on every push, and deploys it to GitHub Pages
  only; no other host is tested by the project. The settings below follow from what the build produces
  ([`vite.config.ts`](../../vite.config.ts)), not from a run on each host.

<a name="prerequisites"></a>

## Prerequisites

- The game builds on your machine.
- The host's address: at the root of a domain, or under a sub-path (which sets `BASE_PATH`).

<a name="where-to-run"></a>

## Where to run the commands

The build runs in the created project or the engine repository: on your machine, in your CI, or in the host's build
step. The upload (or the host's settings) is the host's own tool.

<a name="steps"></a>

## Steps

<!-- step: choose-build -->
1. **Choose where the build runs.**

   - On your machine or in your CI, then upload `dist/`: the host needs nothing but files. The simplest, and the only
     way when the host has no Python.
   - In the host's build step: give it the same settings as any CI.

   | Setting | Value |
   |---|---|
   | Build command (created project) | `pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt && npm run build` |
   | Build command (engine repository, `public/assets` committed) | `npm run build:web` after the checks, or `npm run build` |
   | Output folder | `dist` |
   | Node | 22.12 or later |
   | Python | 3, with pip (created project) |
   | ffmpeg | when the game has audio or video to encode |
   | `GAME` | the game's id (engine repository) |

<!-- step: base-path -->
2. **Set `BASE_PATH`** when the site is not at the root of its domain: `BASE_PATH=/games/my-game/` for
   `https://example.org/games/my-game/`, with a slash at both ends. At a domain's root, leave it unset. See
   [Sub-path](create.deploy-issues.md#sub-path).

<!-- step: headers -->
3. **Set the cache headers**, where the host lets you:

   | Path | Header | Why |
   |---|---|---|
   | `index.html`, `sw.js`, `manifest.webmanifest` | `Cache-Control: no-cache` | The page and the worker must be checked at each visit for an update to be seen |
   | `assets/*.js`, `assets/*.css`, `workbox-*.js` | long, e.g. `max-age=31536000, immutable` | Their names carry a hash: a new build gives new names |
   | `assets/img/`, `assets/audio/`, `assets/video/` | long is safe | Their addresses carry `?v=<hash>`, which changes when any asset changes |
   | `data/` (the sealed ending's file) | `no-cache` | The game asks the network first for it |

   Serve `.webmanifest` as `application/manifest+json`, `.webp` as `image/webp` and `.ogg` as `audio/ogg`.

<!-- step: upload -->
4. **Upload all of `dist/` at once**, or in this order: everything but `index.html` and `sw.js` first, then those two.
   A page that names files not yet uploaded is a blank page for a new visitor
   ([Incomplete deploy](create.deploy-issues.md#incomplete-deploy)).

An nginx server, as an example (not tested by the project):

```nginx
# the game at the root of play.example.org, dist/ copied to /srv/my-game
server {
  server_name play.example.org;
  root /srv/my-game;
  location = /index.html { add_header Cache-Control "no-cache"; }
  location = /sw.js { add_header Cache-Control "no-cache"; }
  location = /manifest.webmanifest { add_header Cache-Control "no-cache"; }
  location /data/ { add_header Cache-Control "no-cache"; }
  location /assets/ { add_header Cache-Control "public, max-age=31536000"; }
}
```

> [!LIMIT id=https-required]
> A service worker only registers on HTTPS (or `localhost`). On plain HTTP the game plays online but neither installs
> nor plays offline.

<a name="expected-result"></a>

## Expected result, and how to check it

- The game opens at its address; the browser's developer tools show `sw.js` active, under the address's path.
- The pause menu's "Offline" row ends at "complete" (the engine's default text; a game may change it).
- After a new deploy, the "A new version is ready." banner (in the game's own words when it is translated) appears on
  the next visit; "Save and update" (translated the same way) loads it.
- In the engine repository: `node scripts/e2e.mjs https://<your-site>/` plays the deployed game to its ending.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| A blank page, 404 on `/assets/index-….js` | Under a sub-path, built without `BASE_PATH` | Step 2 |
| Players never get the new version | `sw.js` or `index.html` cached long by the host or a CDN | Step 3 |
| The game neither installs nor plays offline | Served over plain HTTP: the browser gives no service worker | Serve on HTTPS |
| Music cuts or does not play | The host refuses the file, or serves a wrong type | Serve `.ogg` as `audio/ogg` |

<a name="files-changed"></a>

## Files or data changed

Only on the host: the files of `dist/` and its settings. Nothing in the project.

<a name="recovery"></a>

## Recovery or going back

Upload the `dist/` of an earlier build (keep the builds you shipped, or rebuild the commit). Players move to it through
the update banner; see [Going back](create.deploy-issues.md#going-back).

<a name="references"></a>

## References

- [`vite.config.ts`](../../vite.config.ts): the service worker, its precache and its runtime caches.
- [`src/engine/dom/assets.ts`](../../src/engine/dom/assets.ts): the assets' addresses and their `?v=`.
- [Publish on GitHub Pages](create.github-pages.md), [The static game on Clever Cloud](create.clever-static.md).
