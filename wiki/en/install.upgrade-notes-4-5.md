# Upgrade notes: 4.5

What 4.5.0 "Wiki", 4.5.1, 4.5.2 and 4.5.3 changed. Nothing to change in a game up to 4.5.1 (the documentation moved);
from 4.5.2, `npx quest-n-click migrate` moves its imports to the scoped package names; 4.5.3 changes how a release is
made, not a game.

The upgrade itself is [Upgrade](install.upgrade.md).

<a name="from-4-4-0-to-4-5-0"></a>
<!-- applies: 4.5.0.. -->

## From 4.4.0 to 4.5.0 "Wiki"

Nothing to change: a game builds, plays and saves as on 4.4.0 (the same fingerprints, golden saves and reference
runs). The engine installs from `releases/download/v4.5.0/…`. What is new:

- **The documentation is the wiki.** It lives in the GitHub wiki, in English and in French, and in the documentation
  of each release (`/docs/<version>/` on the project's site). The old pages under `docs/` are now transition pages:
  each old heading stays and links to its new place, so an old link still lands, and the complete 4.4.0 text stays
  readable at the tag `v4.4.0`.
- **`read_doc {name}` still works**: the eight names (`CONTENT_GUIDE`, `ENGINE`, `TOOLS`, `STUDIO`, `WORKFLOW`,
  `AUDIO`, `UPGRADING`, `CLASSICS`) answer one text block, with 4.4.0's arguments; the page is rebuilt from the wiki's
  sections, and a section too long for its bound is shortened to its heading, first paragraph and the
  `read_doc { id, section }` that gives the rest.
- **Two new MCP tools**: `search_docs` (by words or a question, in French or English) and `list_docs`; and
  `read_doc {id, section, lang}` reads one section of a page by its id. An agent searches first, then reads by id.
- **The package carries its documentation**, `docs-bundle/`: `npx quest-n-click mcp` in a created project reads it,
  where 4.4.0 found nothing to read.
- **Fixes**: `npx quest-n-click doctor` runs in a created project (Playwright is optional there); `npm run page:world`
  and `page:puzzles` write a `.html` file by default; a shared Studio accepts a lease on the scenario map's span
  (`groupings`).

<a name="from-4-5-0-to-4-5-1"></a>
<!-- applies: 4.5.1.. -->

## From 4.5.0 to 4.5.1

Nothing to change: a game builds, plays and saves as on 4.5.0 (the same fingerprints, golden saves and reference
runs). The engine installs from `releases/download/v4.5.1/…`. What a game may use, each optional:

- **`games/<id>/spans.json`**: the spans of the game's own files (the modules its `index.ts` imports, its notes, its
  scripts), which a shared Studio refused to write before. The engine's rules come first; a file neither names is
  still refused ([span](team.concepts.md#span)).
- **`games/<id>/audit-allow.json`**: a word the leak audit blocks that is also, by chance, a word of the game (a real
  person's first name), allowed by its SHA-1 prefix and a reason, in the game's folder and its built assets only
  ([audit-allow.json](create.build-release.md#audit-allow)).
- **`url` in `site.json`**: the game's public address. With it, the page's `og:image` is absolute and an `og:url` is
  added, so LinkedIn and Facebook show the share image; without it, the page is as on 4.5.0
  ([site.json](create.project-layout.md#site-json)).
- **The documentation**: the fixes of the maintainer's wiki audit (links whose label is code, the first tutorial,
  saves, the support window, search). A link to a page or a section of 4.5.0 still lands.

<a name="from-4-5-1-to-4-5-2"></a>
<!-- applies: 4.5.2.. -->

## From 4.5.1 to 4.5.2

The engine's packages are named under the npm organisation's scope (D53): `quest-n-click` is `@quest-n-click/engine`,
and `create-quest-n-click`, `quest-n-click-bridge`, `quest-n-click-connectors` and `quest-n-click-studio-server` are
`@quest-n-click/create`, `@quest-n-click/bridge`, `@quest-n-click/connectors` and `@quest-n-click/studio-server`. The
commands keep their names (`quest-n-click dev`, `npx quest-n-click migrate`, `npx quest-n-click-bridge serve`), and so
do the release's files (`quest-n-click-4.5.2.tgz`, …). A game builds, plays and saves as on 4.5.1. What a created
project changes:

1. Install the new engine in place of the old package (the archive's package is now `@quest-n-click/engine`):

   ```bash
   # in the created project
   npm uninstall quest-n-click
   npm install https://github.com/Quest-n-Click/quest-n-click/releases/download/v4.5.2/quest-n-click-4.5.2.tgz
   ```

2. Let `migrate` move the rest, then check:

   ```bash
   # in the created project
   npx quest-n-click migrate
   npx quest-n-click migrate --check
   npm install
   npm run verify
   ```

   `migrate` renames the imports `quest-n-click/content`, `/player`, `/minigames`, `/testing`, `/reality` (and
   `quest-n-click-bridge/cli`) to `@quest-n-click/engine/…` (`@quest-n-click/bridge/cli`) in every source file;
   in `tsconfig.json`, the path `quest-n-click/*` and the `node_modules/quest-n-click/…` targets to
   `@quest-n-click/engine`; in `package.json`, it drops a dependency on an unscoped package once its scoped name is
   installed, and says which ones are left (`package.json depends on quest-n-click-bridge: npm uninstall
   quest-n-click-bridge && npm install @quest-n-click/bridge`). It renames no command: the scripts stay as they are.

- **Not migrated yet?** Through 4.5.x the unscoped imports `quest-n-click/…` still resolve, in a build (Vite) and in
  the engine's own `tsconfig.json`, so a game that has not run `migrate` still builds; its own `tsconfig.json` still
  points into `node_modules/quest-n-click`, which the new install removed, until `migrate` renames it.
- **A hosted Studio** renames a game's unscoped imports itself, at the engine's upgrade, as it did for the
  `web-scumm/…` ones ([Upgrade the hosted engine](team.upgrade-engine.md)).
- **The Bridge, the connectors and the Studio Server** install from their archives as before; in `node_modules`
  they are now under `@quest-n-click/` (`node_modules/@quest-n-click/bridge`, …).
- **A Studio worker's build hook** installs `requirements.txt`, which now carries every hash (D54):
  `python3 -m pip install --target .python --require-hashes --only-binary=:all: -r
  node_modules/@quest-n-click/engine/requirements.txt`. `ops/studio/worker-requirements.lock` is gone: a hook that
  names it fails until it is changed ([First deployment](clever.first-deployment.md)).
- **A new project** is created as before from the archive (`npx --package=<archive URL> quest-n-click create …`).
  Once the packages are on npm, `npm init @quest-n-click my-game` creates it in one command, and
  `npx create-quest-n-click my-game` still works: that unscoped name is a relay to `@quest-n-click/create`.
- **The repository's address** is `github.com/Quest-n-Click/quest-n-click` (D51). The old addresses redirect to it,
  release downloads included, so an archive URL already in a `package.json` still installs; write the new one when you
  next change it. A 4.5.2 file
  verifies with `gh attestation verify <file> -R Quest-n-Click/quest-n-click`; a release made before the move keeps
  its attestations under the user `wanoo` ([Releasing](contribute.releasing.md#expected-result)). The demo and the
  latest documentation are on the project's website, `quest-n-click.cleverapps.io`, not on GitHub Pages
  ([Play online](start.play-online.md)).
- **npm**: 4.5.2 is the first release whose packages release.yml stages on npm; they are published once an owner of
  the organisation approves them with 2FA, not before. Until `npm view @quest-n-click/engine version` answers 4.5.2,
  install from the archive ([Install from npm, once published](install.from-npm.md)). The unscoped names become
  deprecated pointers to the scoped ones.

<a name="from-4-5-2-to-4-5-3"></a>
<!-- applies: 4.5.3.. -->

## From 4.5.2 to 4.5.3 "One pass"

Nothing to change in a game: it builds, plays and saves as on 4.5.2 (no content field, save, schema or game
fingerprint moves). The engine installs from npm, `npm install @quest-n-click/engine@4.5.3` in a created project once
an owner has approved it, or from `releases/download/v4.5.3/…` ([Install from npm](install.from-npm.md)). What changes
is how a release is made, for the maintainers ([Releasing](contribute.releasing.md#the-chain)):

- **The candidate is the release's only test pass** (D55). The order stays: a candidate started by hand on main's
  commit, then a signed tag that names it. The tag's push starts `release.yml`, no longer the tag's own `ci` run (a tag
  runs no `ci` any more). It checks that the tag's commit is on main's first-parent line and that main's `ci` succeeded
  on it, that the previous stable tag is an ancestor and that the candidate is a green run started by hand on main,
  then publishes that candidate's files without testing anything again: minutes, not hours.
- **`ship tag` always waits for main's `ci`**: `--now` is refused, and `ship watch` waits for the release run alone.
- **A candidate made before 4.5.3 cannot be released**: the Remix catalogues' proofs are now made by the candidate (its
  `remix-proof` job) and a candidate without them is refused. Start a new one on the commit to tag.
- **The `docs-publish` environment needs a `v*` tag rule**, once: Settings → Environments → docs-publish → Deployment
  branches and tags, beside `main` and `docs/*`. The documentation job now runs on the tag's ref; without the rule it
  is refused, the release itself being published (`mode=promote` from main recovers the documentation)
  ([Releasing](contribute.releasing.md#maintainer-settings)).
- **npm's provenance names the tag and its commit**, no longer main's head as for 4.5.2.
- **Either co-maintainer signs a tag**: `.github/allowed_signers` names LostInBrittany's key beside wanoo's, and
  `ship preflight-stable` counts a name published by `lostinbrittany` or `wanoo` as the project's.
- **A translation pair checked by its AI author no longer stops a publication** (D56): `npm run wiki -- check
  --publish` lists such pairs among its gaps, a pair "to review" still fails it, and a published claim still needs a
  person's review. A page's header still says who read it ([Writing documentation](contribute.writing-docs.md#reviews)).
- **A pull request's candidate** starts only when the `full-ci` label is added; remove the label and add it again to
  run it once more.
