# Changelog

## 4.5.3 — 2026-10-25

LOG #300–#309: "One pass", a patch on 4.5.2 that reworks the release chain. The candidate is now a release's only test
pass (D55): the push of a `v*` tag starts `release.yml`, which checks the tag, main's `ci` on its commit and the
candidate it names, then publishes that candidate's files in minutes, testing nothing again; a tag runs no `ci` of its
own, `ship tag` always waits for main's `ci` (`--now` is refused), and the Remix catalogues are proved by the candidate.
`ship tag` tags the organisation's repository whatever its remote is called and refuses a commit without the version's
CHANGELOG section. Either co-maintainer can sign a tag, `wanoo` counts as an owner of the npm names, a wiki claim backed by a `.each` test
counts as run, and a translation pair checked by its AI author no longer stops a documentation publication (D56); the
candidate starts on a pull request only when `full-ci` is added. 4.5.2's packages were published on npm on 24 October
(`@quest-n-click/engine`, `/create`, `/bridge`, `/connectors`, `/studio-server`), and 4.5.3 is staged the same way.
What changes (Upgrade notes: 4.5, from 4.5.2 to 4.5.3) is the maintainers' side: a candidate made before 4.5.3
cannot be released, and the `docs-publish` environment needs a `v*` tag rule. A game builds, plays and saves as on
4.5.2: no content field, save, schema or game fingerprint moves.

### Fixed

- **A claim backed by a `.each` test is executed again** (4.5.3): the wiki's publication check matched a claim's test name literally, so a test whose title is filled in by `describe.each` (`maintenance leases on $name`, run as `… on sqlite`) never counted as run, and 4.5.2's `docs-publish` refused `bridge-restore-refused-while-serving` as "not executed".
- **`ship tag` tags the organisation's repository and checks the CHANGELOG first** (4.5.3): it fetches from and pushes to the git remote whose URL is `Quest-n-Click/quest-n-click` (`upstream` when `origin` is a fork), instead of `origin` always; and it refuses, before creating anything, a commit whose `CHANGELOG.md` has no section of the version, which release.yml needs for the notes (`v4.5.3-rc.1` was spent that way).

### Changes

- **A second tag signer** (4.5.3): `.github/allowed_signers` names LostInBrittany's SSH key next to wanoo's, so either co-maintainer can sign a release tag (`ship tag --sign`).

- **A release takes minutes after its tag, the candidate being its only test pass** (4.5.3, #291): `release.yml` starts on the push of a `v*` tag, no longer after the tag's own `ci` run, and runs no test again (no `release-check`, no mutation matrix, no python, ffmpeg or browser setup): it checks the tag, that its commit is on main's first-parent line and that main's `ci` succeeded on that very SHA (`tools/release/main-ci.mjs`), the previous stable tag, the candidate the tag names, then publishes the candidate's files. A tag runs no `ci` any more, and no release run is left skipped in the Actions list.
- **The Remix catalogues are proved by the candidate** (4.5.3, #291): a new `remix-proof` job of `candidate.yml` proves both catalogues, its two reports enter the candidate's manifest (`remix/remix-demo.json`, `remix/remix-reference.json`) and the release copies them under the same names as before. A candidate made before this change has none, and the release refuses it: start a new candidate.
- **`ship tag` always waits for main's `ci`** (4.5.3, #291): `--now` is refused, and `ship watch` waits for the release run alone. The documentation's publication runs from the tag's ref (`docs-publish` in release mode wants `refs/tags/v<version>`), and npm's provenance now names the tag and its commit instead of main's head.

- **A translation pair checked by an AI no longer stops a documentation publication** (4.5.3, D56): `npm run wiki -- check --publish` lists the pairs read by their AI author only, not by a person, among its gaps and passes; the page's header still says who read it. A pair "to review" (one side changed since its record) still fails it, and a published claim still needs a person's review of its scope.

- **wanoo is an owner of the npm names** (4.5.3): `ship preflight-stable` and the nightly `npm-names` job count a name published by `wanoo` as the project's, next to `lostinbrittany`, now that Erwan owns the `quest-n-click` npm organisation.

- **No more empty candidate runs on pull requests** (4.5.3): the `candidate` workflow starts on a pull request only when the `full-ci` label is added, on the head at that moment, instead of on every push to every pull request (where all its jobs skipped unless the label was there). Remove and add the label again to rerun it.

## 4.5.2 — 2026-10-24

LOG #295–#299: "Org", a patch on 4.5.1 and the first release staged on npm. The repository moved to the Quest-n-Click
organization (`github.com/Quest-n-Click/quest-n-click`, the old addresses redirect), and the releases made before the
move verify under the identity that signed them; the project's website, `quest-n-click.cleverapps.io`, replaces GitHub
Pages and serves the demo from the release's new `web.tar.gz`. The packages are named under the `@quest-n-click` scope
(`@quest-n-click/engine`, `@quest-n-click/create`, …), and release.yml stages them on npm for an owner of the
organisation to approve with 2FA: they are on npm once approved, not before. `requirements.txt` pins every Python
download by its hash, and the worker's lock is gone. What changes (Upgrade notes: 4.5, from 4.5.1 to 4.5.2): a created
project installs `@quest-n-click/engine` and runs `npx quest-n-click migrate` (the unscoped imports still resolve
through 4.5.x); a Studio worker's build hook names `requirements.txt`. A game builds, plays and saves as on 4.5.1: no
content field, save, schema or game fingerprint moves.

### Breaking

- **The packages are named under the `@quest-n-click` scope** (4.5.2, D53, #283). `quest-n-click` is
  `@quest-n-click/engine`, `create-quest-n-click` is `@quest-n-click/create` (`npm init @quest-n-click my-game` once on
  npm; `npx create-quest-n-click my-game` stays, a relay to it), and the Bridge, the connectors and the Studio Server are `@quest-n-click/bridge`, `@quest-n-click/connectors`
  and `@quest-n-click/studio-server`: the npm organisation `quest-n-click` owns them. A game imports
  `@quest-n-click/engine/content` (`/player`, `/minigames`, `/testing`, `/reality`); `npx quest-n-click migrate` rewrites
  its `quest-n-click/…` imports, its `tsconfig.json` and its dependencies, and through 4.5.x the unscoped imports still
  resolve (Vite, the engine's `tsconfig.json`, a hosted Studio). The commands keep their names (`quest-n-click dev`,
  `npx quest-n-click-bridge serve`), and so do the release's archives (`quest-n-click-4.5.2.tgz`, …). Installed, the
  packages sit under `node_modules/@quest-n-click/`. Nothing is on npm until an owner approves the
  packages 4.5.2 stages (below).

- **The Studio worker installs `requirements.txt`, the lock is gone** (4.5.2, D54, #285). `requirements.txt` now pins
  each Python package with the sha256 of every file PyPI publishes for that version, and
  `ops/studio/worker-requirements.lock` is removed. A worker's build hook that names the lock must name
  `requirements.txt` instead: `python3 -m pip install --target .python --require-hashes --only-binary=:all: -r
  node_modules/@quest-n-click/engine/requirements.txt` (from the archives) or `-r requirements.txt` (from the repository).

### Changes

- **The logo writes Quest'n'Click** (4.5.2): the READMEs and the wiki's first page show the logo with its capital Q
  and C, the project's name as the maintainer writes it.

- **The repository moved to the Quest-n-Click organization** (4.5.2, D51). It is `github.com/Quest-n-Click/quest-n-click`
  now; the links to `github.com/wanoo/quest-n-click` (and to `wanoo/web-scumm`) redirect, release downloads included.
  Every address the repository writes says the new one: the READMEs, the wiki, the issue templates, the packages'
  `repository` field, the created project's README, the tools' `-R` (`node tools/rename-org.mjs`, idempotent; `--check`
  is a test). History keeps the old addresses: the CHANGELOG, the LOG, the decisions, the ADRs, the plans and the pass
  sheets of past releases.
- **Pre-transfer releases verify under owner wanoo** (4.5.2, D51). GitHub keeps the attestations of the releases made
  before the transfer under the user `wanoo`, not under the repository it moved, so `--repo Quest-n-Click/quest-n-click`
  finds none of them. `ship verify`, the Field Kit and `wiki -- pages` now ask each release under the identity that
  signed it: `wanoo/web-scumm` up to 4.2.4, `wanoo/quest-n-click` from 4.2.5 to 4.5.1 (both looked up with `--owner
  wanoo`, the signer pinned by `--signer-workflow` or `--signer-repo`, never the owner alone), the organization's
  repository from 4.5.2. A field bundle of unknown version tries the repository, then the two pre-transfer identities,
  nothing else. Whatever the name, every certificate must name the repository's numeric id, `1402166796`, which the
  three names share and a repository created again under a former name would not (`WEB_SCUMM_REPO_ID` for a fork).
  GitHub's own release attestation of a pre-transfer release cannot be reached by `gh release verify`
  any more: `ship verify` says so and skips it, the files' attestations being verified.
- **The project's website replaces GitHub Pages** (4.5.2, D52). The demo and the Studio's demo are played on
  `https://quest-n-click.cleverapps.io/demo/` (and `/demo/studio.html`), the latest documentation is read at
  `https://quest-n-click.cleverapps.io/docs/<page id>` (`/fr/docs/<page id>` in French). The engine's `ci` deploys no GitHub Pages: the `pages`
  job, the Pages build and the `pages-only` runs are gone, and the release ends by asking the website to take it: a
  last job, after `ship verify` and the documentation's publication, calls its `POST /api/revalidate` with the
  `SITE_REVALIDATE_SECRET` secret (three tries, a warning when it fails, never failing the release; `SITE_URL` for a
  fork). There is no versioned documentation online any more: a version's documentation is
  its release's `quest-n-click-docs-<version>.tar.gz`, and every link to a versioned page now names the same page of
  the latest documentation.
- **`read_doc` names the website, not a versioned page** (4.5.2, D52): on a page read from a bundle, `url.versioned` is
  always `null` and `url.versionedNote` names the release's documentation archive (`quest-n-click-docs-<version>.tar.gz`
  and its release page); `url.current` is the page on the website, `https://quest-n-click.cleverapps.io/docs/<id>` (`/fr/docs/<id>`),
  no longer the GitHub wiki. The documentation surface is experimental since 4.5.0.
- **A new release file, `quest-n-click-v<version>-web.tar.gz`** (4.5.2, D52): the game and the Studio's demo built for
  the base path `/demo/` (its service worker scoped there), built by the candidate beside `dist.tar.gz`, summed,
  attested and published by the release. The website downloads it from the latest release, checks it against the
  release's sums and serves it at `/demo/`. `ship verify` expects it from 4.5.2 only.

- **`quest-n-click create` writes the scoped engine** (4.5.2, D53): the dependency `"@quest-n-click/engine"`, the
  `@engine/*` and `@quest-n-click/engine/*` paths into `node_modules/@quest-n-click/engine`; the template imports
  `@quest-n-click/engine/…`. `@quest-n-click/create` carries `repository` and `engines`, which a provenance publish
  needs, and every manifest `publishConfig.access: public`.
- **The npm names watched as the organisation's** (4.5.2, D53): `ship preflight-stable` and the nightly `npm-names` job
  ask the scoped names, ours when an owner of the organisation publishes them (`OWNERS`, `lostinbrittany` for now: npm
  shows an organisation's members only to its members), and check each unscoped name as a pointer (an owner's,
  deprecated; someone else's blocks the preflight, a free or undeprecated one is a step still to take), except
  `create-quest-n-click`, a relay (an owner's, never deprecated). The trust hints name `@quest-n-click/<name>`.

- **pip checks every Python download against its hash** (4.5.2, D54, #285). `pip install -r requirements.txt` is a
  hash-checked install now, on every platform (the hashes cover the wheels of each); the docs, `doctor` and CI say
  `--require-hashes`. The versions are those of `main` (Pillow 13.0.0, NumPy 2.5.4, SciPy 1.18.1). Dependabot's monthly pip
  bumps rewrite the hashes with the version, so they no longer fail CI.

- **The npm packages are staged by each release, for an owner to approve** (4.5.2, D34, #283). Once a release is
  published and read back, release.yml's new `npm-stage` job takes the five archives the release carries (checked
  against its `SHA256SUMS`) and stages them on npm by trusted publishing: OIDC, no token, a provenance, engine first,
  `latest` for a stable tag. A version already published or already staged is skipped, so the job can be re-run alone;
  a missing trusted publisher fails it with the `npm trust github … --file release.yml --allow-stage-publish` command.
  The run summary lists the ids and the `npm stage approve <id>` an owner of the organisation runs with 2FA, in order.
  Nothing is ever published by CI. A pre-release tag stages nothing (its archives carry the stable version): it
  rehearses the OIDC exchange by a dry run. `docs-publish` does not wait for it.
- **`ship preflight-stable` reads the staging step** (4.5.2, #283): a trusted publisher counts only on `release.yml`,
  its hint says the configuration expires unless it stages within two days, and a new `publish-step` row checks that
  release.yml stages through `tools/release/npm-stage.mjs`, never `npm publish`, never a token.

## 4.5.1 — 2026-10-24

LOG #290–#294: a patch on 4.5.0. The maintainer's audit of the published wiki (24 October, 24 findings) is fixed: every
link whose label is written as code now reaches its target in the wiki, the HTML and the bundle; the first tutorial
starts with a command that works; the saves pages and the support window say one thing; search finds « pas de son »;
a page's header is one short line that says who read it. A game may name the spans of its own files (`spans.json`) and
allow a word of the leak audit (`audit-allow.json`); `site.json`'s `url` gives a deployed game an absolute `og:image`
and an `og:url`. Nothing to change in a game (Upgrade notes: 4.5, from 4.5.0 to 4.5.1): both files and the `url` are
optional, and no content field, save, schema or fingerprint moves.

### Fixed

- **Every link of the published documentation reaches its target** (4.5.1, the maintainer's wiki audit, F01–F03). A link whose label was written as code (`` [`src/x.ts`](../../src/x.ts) ``) was invisible to the scanner that rewrites links for the build and reads them for the check: 2,472 links to the repository stayed relative (a 404 on GitHub) and 84 page links kept their `<id>.md` source name (GitHub sent them to Home). The scanner now reads a line as CommonMark does, code spans inside a link's label included; the wiki, the HTML and the bundle are rebuilt with code links at the product commit and page links at their page and section, and a test reads every output back with an independent reader, the audit's 2,556 cases included.
- **The first tutorial starts with a command that works** (4.5.1, F04, F12–F15). "Your first game" installs from the release archive first (the packages are not on npm yet), asks for Node 22.13 (the Studio it uses needs it), writes the storyboard before the room as the working loop says, gives the lamp two images the template has so switching it on shows, says what the screen shows before and after, and says that `solve` finds a winning path while `solve --prove` looks for dead ends.
- **The saves pages say the same thing when a room disappears** (4.5.1, F05): a save whose current room (or active hero) is gone is refused, anything else gone is dropped with a warning, a room renamed with a migration loads; on Saves, Troubleshooting and State and saves.
- **One support policy** (4.5.1, F06): the security policy, `SECURITY.md` and Stability and support give the same table (4.4 until 23 January 2027, 4.3 until 22 January 2027, 4.2.5 until 21 January 2027 on its branch).
- **No hard-coded "current release" in the FAQ** (4.5.1, F07): it points to the page's footer and the releases page.
- **Home says what the wiki's search box does** (4.5.1, F09, F23): it filters titles only; Home sends error messages and variables to the indexes and the pages' text to GitHub's code search, and Home gets a short bilingual sidebar.
- **Search finds « pas de son »** (4.5.1, F10, F11): « son » is no longer a stop word where it is the noun, a symptom typed as a troubleshooting section names it ranks that section first, and the acceptance reports the top 1 apart from the top 3, with ten questions that must come first.
- **A page's header is one short line** (4.5.1, F17, F18): its twin, its type, "published" with who read it (an AI or a person) and its versions; the audience, the context and the surfaces' statuses follow the page's first paragraph, folded.
- **Smaller corrections** (4.5.1, F16, F19–F22, F24): the gallery names the recent screens it does not show yet; `read_doc {name}` is said to shorten long sections; the code of conduct names one private channel; Safari's seven-day rule is said not to apply to a game added to the Home Screen; Domains and TLS says which browsers were checked; the four big references open with a quick entry by task.
- **The release's dependency audit is clean again** (4.5.1, the candidate). Five advisories published after #275 stopped the candidate's `npm audit --audit-level=high`: `serialize-javascript` 7.1.2 (XSS through `</script` at the end of a serialized function, the PWA build's terser), `happy-dom` 21.0.1 (the test DOM), `body-parser` 2.3.0, `ip-address` 10.7.3 and `fast-uri` 3.1.8 (the MCP server's Express, rate limiter and JSON Schema). Each moves to its patched release within the range already declared (7.1.4, 21.0.4, 2.4.0, 10.7.4, 3.1.9, with `qs` 6.16.1): `npm audit fix`, no direct dependency or override changed, the versioned locks untouched.
- **A game's own spans are pinned at their edges** (4.5.1, the candidate). The mutation set `studio-ops` found eight survivors in `spans.json`'s reader (#270): `tests/studio-spans-mutants.test.ts` now pins a literal key that names its file only, the 256 entries, the 256-character key and the 64 KiB file taken at the limit and refused one past it; four loop bounds and a guard no input can tell apart are explained in `docs/dev/mutants.json`.

### Changes

- **A game names the spans of its own files** (4.5.1, #269). The modules a game's `index.ts` imports (`minigames/`, `commands/`, data shared by rooms), its notes and its scripts belonged to no span: the hosted Studio refused a write to them (422), and `tests/studio-collab.test.ts` failed on any game that had one. `games/<id>/spans.json` now maps a path, a folder or a glob to a span a client may take; the engine's rules come first, a file neither names is still refused, and the hosted Studio reads the file of the game it serves.
- **A game may allow a word of the leak audit** (4.5.1, #269). `audit:assets` blocks the words of the engine's private origin; when one is also, by chance, a word of a game (a real person's first name), `games/<id>/audit-allow.json` allows it by its SHA-1 prefix and a reason, in that game's folder and in `public/assets/` built from it, and nowhere else. A prefix the audit does not block stops the audit.

- **A deployed game's link preview shows its image** (4.5.1, #271). `index.html` wrote the share image as `%BASE%og.png`, a relative URL that LinkedIn's and Facebook's crawlers often ignore. An optional `url` in `games/<id>/site.json`, the game's public address, makes `og:image` absolute (`<url>og.png`) and adds `og:url`; without it, or with an address that is not an absolute `http(s)` URL (or has a query, a fragment or credentials), the page is as before.

## 4.5.0 — 2026-10-23

LOG #268–#289: "Wiki", the documentation moved. `wiki/en` and `wiki/fr` are now the documentation: 210 pages in
English and in French, each paired with its twin section by section, published as the GitHub wiki and as
`/docs/<version>/` on Pages from the release's own documentation archive, never rebuilt from `main`. The old `docs/`
pages are transition pages: every old heading and anchor stays and links to its new place and to the 4.4.0 text. An
assistant finds the pages with two new MCP tools, `search_docs` and `list_docs`, and reads one section with
`read_doc {id, section}`; `read_doc {name}` keeps 4.4.0's eight names and its answer. The engine's package carries its
documentation (`docs-bundle/`), so `read_doc` works in a created project. Every guarantee a page states is tied to a
named test, and the published page says whether that test ran in the candidate. Writing the pages found three bugs,
fixed below (the scenario map's lease, `doctor` in a created project, `page:world`'s file name). The 132 mutation
exemptions due at 4.5.0 read again: five killed by a test. One new people's pass, `docs-beginner-reader`; none of the
twenty-two has passed yet. Nothing to change in a game (Upgrade notes: 4.5). The tag is signed with the maintainer's SSH
key on their yes of 23 October for `v4.5.0` (D37, D50).

### Fixed

- **`search_docs` no longer reads the word "studio" as the variable `STUDIO`** (4.5.0). An identifier written in capitals (an environment variable such as `STUDIO`, `PATH` or `PORT`) now counts only when the query holds it exactly, or is that one identifier in another case (`studio_session_key`); before, any question with the word "studio" ranked the environment variable page high. The section named exactly by the identifier comes first (`PATH` before `WORKER_PYTHON_PATH`), its excerpt shows the description after the name, and an excerpt no longer doubles the page's own bold nor touches the stars of code (`ops/**/*.yml`).
- **`read_doc {id}` from an installed package now says where the page lives online** (4.5.0). Its structured content gives `url.current`, the wiki's page, labelled as the current documentation rather than this version's, and `url.versioned`: for a release build (a candidate's build, not dirty) the Pages permalink that build has once it is the one published (`/docs/<version>/r<n>/<lang>/<id>.html#<section>`, checked at `publication.json`), and for any other build `null` with the reason.
- **A published page's guarantees say whether their test passed in the candidate** (4.5.0). The documentation archive is now built after the candidate's tests, from their report (`npm run wiki -- archive --test-report <file> --candidate <run>`), so a guarantee whose test passed shows "executed on <commit>" on the published page, as `check --publish` already required. Before, the archive was built without the report and every guarantee read "referenced" only.
- **Reviews say who made them** (4.5.0). A translation pair's and a claim's review record whether a person or an AI read it, and whether the reviewer wrote what they read. A page whose pairs or claims were only checked by the AI that wrote them says "self-checked by the author (AI), not reviewed", and `check --publish` wants a person's review before it publishes it. `translations --ack` and `review-claim` now take `--kind human|ai` and `--relation author|independent`.

- **The scenario map's span can be leased on a shared Studio** (4.5.0). `POST /api/leases`, `/api/leases/release` and `/api/leases/takeover` answered 400 for the span `groupings` (`groupings.json`), though the Spans panel lists it. The routes now accept exactly the spans `studio-server/src/ops/spans.ts` gives files (plus `room:<id>` and `lang:<code>`), so the two lists cannot drift apart again.
- **`npx quest-n-click doctor` runs in a created project** (4.5.0). It imported Playwright at the start and stopped with `ERR_MODULE_NOT_FOUND`, since a created project does not install it. Without the package, the doctor now reports Playwright as optional and missing, with the fix: `npm install --save-dev playwright`, then `npx playwright install chromium`.
- **`npm run page:world` and `npm run page:puzzles` write a `.html` file** (4.5.0). By default they wrote `dist-pages/world` and `dist-pages/puzzles`, without an extension; an explicit `--out file.html` is still used as given.

- **A Markdown link whose text wraps onto the next line is seen** (4.5.0). The wiki's link scanner read one line at a time: `[the\npage](x.md)` was neither checked nor rewritten for the published wiki. A link whose text breaks across one line of its paragraph is now read whole, as CommonMark reads it.
- **The hosted Studio's end-to-end run no longer fails at random on "Load the latest preview" (4.5.0, #255)**: the
  script read the last ready preview, then clicked; when a preview finished building in between, the Studio rightly
  loaded the newer one and the check failed (seen on a PR's CI, HTTPS pass). It now waits for the head's preview first.
  Nothing changes in the Studio.

- **An image cached for offline play is served even when the worker's lookup fails (4.5.0, #257)**: Firefox's service
  worker now and then failed a cached image offline ("A ServiceWorker intercepted the request and encountered an
  unexpected error"), a sprite frame then missing. When the image route fails, the worker now looks the image up in
  every cache before giving up, and says why it failed; `npm run e2e:pwa` prints that reason. Nothing to change in a
  game.

- **The browser jobs of CI no longer time out installing Playwright's system packages (4.5.0, #261)**: seven Linux
  jobs (`e2e`, `reality`, `pwa-firefox`, `cross-runtime`, `fresh-install`, `second-game`, `reference`) run in
  Playwright's own image, the lockfile's version pinned by digest, where the browsers and their libraries are already
  installed; `--with-deps` fetched 52 MB from an apt mirror that sometimes served 50 kB/s. A test keeps the image's
  version equal to the lockfile's. ffmpeg likewise comes from a static build on GitHub first, apt only if it fails.

- **The WebKit e2e run no longer fails at random on "Context is stopped" after its save check (4.5.0, #263)**: the
  save round trip reloads the page; when the offline warm-up had a Cache API call in flight, WebKit logged "Cache API
  operation failed: Context is stopped" and the run failed, every check passed (4 times in 5 days on CI). WebKit logs
  it itself, even for a promise the page catches, so the run now tolerates it during that reload as it already did
  during the teardown: reported, not counted, on WebKit only, in that exact form. Nothing changes in the engine.

- **The hosted Studio's end-to-end run no longer waits on a Play frame that never answers after "Load the latest
  preview" (4.5.0, #264)**: on the Firefox pass, the script took the frame as soon as its address showed the expected
  revision and spent 30 s on it, and the second click still expected the revision the first one read. Both clicks now
  go through one helper that reads the latest revision at each click, looks the frame up again at each try with each
  evaluation bounded, and loads the page once more (said in the log) if it stays silent. Nothing changes in the Studio.

### Changes

- **The documentation's map, `wiki/manifest.json`, and `npm run wiki`** (4.5.0). Every page of the coming bilingual wiki has an entry: 213 pages across the domains of the plan's catalogue, all `planned` for now except the four generated indexes. Each entry gives a stable id, a type, an audience, a context, its French and English titles, its public URLs (`EN-Create-Rooms`, `FR-Creer-Salles`), the source files it rests on and the questions a reader would ask. `npm run wiki -- check` keeps the manifest, the pages and their links consistent; it fails on errors only and lists the links to pages not written yet. `stats` counts the pages. `build --target wiki` writes the folder the GitHub wiki will be published from: a bilingual home page, a sidebar per language, a footer, each ready page under its URL, and indexes by task, symptom, identifier and vocabulary. The repository also gains a bilingual glossary (`wiki/data/glossary.json`, with synonyms such as lease, bail and verrou) and page templates (`wiki/_templates/`). `npm run ci:plan` also names the wiki pages whose source files a change touches. Nothing is published yet.

- **The coverage matrix of the documentation's move, `npm run wiki -- coverage`** (4.5.0). Before anything moves to the wiki, every section of the old documentation has a recorded destination. `wiki -- coverage --init` takes the anchor inventory of the 32 pages of `docs/en` and of `docs/fr` and of the root pages (both READMEs, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, CREDITS): every heading with the anchor GitHub gives it, the explicit `<a id>` and `<a name>` anchors, every code block, and the sentences that look like a limit (*only*, *not*, *uniquement*, *pas encore*…), proposed to a reviewer. `wiki/coverage.json` holds one row per section: its destinations in the wiki, keep, rewrite or drop (a drop says why), and two states, planned and migrated. Today all 1,036 sections are planned and none is migrated. Only roadmap milestones that are fully shipped are dropped, each naming its CHANGELOG version or git tag; a milestone that still lists open items moves to the roadmap page. A dropped section counts as reviewed only once each sentence that looks like a limit has been ticked. `wiki -- coverage` merges a new inventory and keeps what a person wrote, following a renamed heading by its text; a changed section must be rechecked and acknowledged (`--ack <key>`); it also writes `wiki/legacy.json`, the order in which the eight pages `read_doc` serves will be rebuilt, and each manifest page's `replaces`. `wiki -- coverage` and `wiki -- stats` print the two counters, "destinations planned" and "migrated and reviewed". `docs/` is now frozen: `wiki -- check` and a test fail when a page changes without the matrix being brought back in step.

- **`read_doc` in a created project now works** (4.5.0). The engine's package carries its documentation, `docs-bundle/`, and `npx quest-n-click mcp` reads it: `read_doc {name: "CONTENT_GUIDE"}` (and the seven other names) answers the same single text block as in the engine's repository, where 4.4.0 found nothing to read. The bundle holds an index, the wiki's published pages (none yet), an exact copy of the eight historical pages and a manifest with the sha256 of every file; it names the version, the commit and the documentation revision it was built from, and nothing about publication. Two packs of one commit give the same bytes.
- **`search_docs` and `list_docs`, two new MCP tools, and `read_doc` by id** (4.5.0). `search_docs` finds the documentation pages by words or a question, in French or English, accents and case aside, following the glossary from one language to the other (« verrou » also finds "lease"); each result gives the page and section, why it matched and an excerpt, and a query with no confident match gets an explicit empty answer. `list_docs` lists the pages by audience, context, type, language or state. `read_doc {id, section, lang}` reads one section, 20 000 characters at a time with a cursor for the rest, with where the text comes from at its top. `read_doc {name}` keeps its schema and its answer: the eight names, one whole page, in English. In the repository the new tools read `wiki/` (draft and ready pages, said to be a preview); in a package, the bundle's ready pages. The local MCP server and the Studio's Assistant (local and demo) offer them. Known limit: the remote MCP of a hosted Studio does not, its tools being requests to an API that has no documentation route; an agent there uses the local MCP of the same engine version.

- **The documentation says for which versions it is true, what backs each claim, and how stable each surface is** (4.5.0). A wiki page already gave the versions it applies to; a section can now narrow them with a comment right after its anchor, `<!-- applies: 4.2.2..4.4.0 since 4.2.0 -->`, shown to the reader under the heading, and `search_docs` with a `version` leaves out a section that does not apply (or marks it `notApplicable` with `includeArchived`). A page that names its surfaces shows, for each, five statuses kept apart instead of one "experimental" banner: the contract (experimental, stable or deprecated, from the new `docs/dev/contracts.json`, whose wording a test checks against the support page), the environments CI verifies and as of when, the automated checks, the people's passes with their state and issue, and the page's known limits. A guarantee (`> [!GUARANTEE id=…]`) is tied to a named test and shows exactly what is known of it: "referenced" when the test exists with that name, "executed on <commit>" when the candidate's test report says it passed on the documented commit, "scope reviewed" when a person recorded that the test covers it (`npm run wiki -- review-claim <id> --by <name>`; a change to the claim or the test resets it). A measure (`> [!MEASURE id=…]`) must give its date, version, volume, conditions and a source pinned to a commit. A `room-example` block in a page goes through the engine's validator and a `studio-config` block through the Studio Server's own configuration loader, so a page cannot show what the product refuses.
- **`npm run wiki -- check --publish`, the publication level** (4.5.0). It requires `--product-ref <tag|sha>` (and, to publish a candidate or a release, `--candidate <run id>`, the run the test reports must come from) and checks: published pages link to published pages only; no translation is "to review" (`wiki/translations.json`, recorded by `npm run wiki -- translations --ack <id#section> --by <name>` once both languages were read; a change on either side makes the pair to review, a warning on a pull request); every guarantee was executed on the product (`--test-report`, a Vitest JSON report with the `commit.json` the candidate writes beside it); the documentation's revision is the clean checkout, descends from the product and changed only `wiki/<lang>/*.md`, the manifest, the translations, the reviews and the images since; `--released` refuses a page or a section that applies only from a later version; `--state preview` is refused once a release 4.5.0 or later is tagged. The candidate now uploads the node suite's JSON report and its commit as the artifact `candidate-test-report`.

- **The documentation is accepted by real questions** (4.5.0). `wiki/acceptance/questions.json` holds 60 questions that a player, an author, a team Studio admin, a contributor or a Bridge operator would type, in English and in French. Each one gives the pages a right answer lands on and the facts it must contain. The file also holds the counter-examples of the plan's table:
  - a feature that does not exist (real-time multiplayer, a Steam export) must lead to "What quest'n'click does not do" or to an explicit empty result;
  - `npm run studio` in the engine repository and in a created project, and the Bridge's backup and the Studio Server's, are told apart by their context;
  - the v2 → v3 id migration is never shown as current for 4.5.0;
  - a 409 or a 503 leads to the hosted Studio's page or the Bridge's depending on the context, and without one shows both, each naming its service.

  `npm run wiki -- acceptance [--lang en|fr] [--json]` runs them through `search_docs` and prints three measures: the expected page in the top 3, no inapplicable answer first for the counter-examples, and the share of empty results that were justified. A question whose pages are not written yet is counted as pending, apart from the misses; today every question is pending. `--strict` fails on a miss, a failed counter-example or a pending question. It is for the switch-over. `npm run wiki -- check` validates the file.
- **Two protocols for the documentation's readers** (4.5.0). `docs/dev/acceptance/AI-PROTOCOL.md` explains how to run a fresh AI agent that has only the documentation tools (or only the public URL) on every question, and how to grade its answer fact by fact: found, missing or misread. `npm run wiki -- acceptance --export-prompts <dir>` writes the prompts, without the answers. A new people's pass, `docs-beginner-reader`, asked from 4.5.0 on: a beginner looks for the answers to ten of the questions in the published documentation (`docs/dev/acceptance/BEGINNER-READER.md`).

- **The documentation of each release is published as an archive, a versioned site and the wiki** (4.5.0). A release from 4.5.0 on attaches `quest-n-click-docs-<version>.tar.gz`: the documentation bundle, the rendered site (one page per page and language, its images, a search that answers as MCP's `search_docs` does, `sitemap.xml`, `llms.txt`) and the GitHub wiki's pages, with the sha256 of every file. The candidate builds it twice and compares the bytes; the release carries the very same file in its sums, attestations and `ship verify`. Once `ship verify` has passed, the new `docs-publish` workflow checks that archive again, runs `npm run wiki -- check --publish` with the candidate's own test report, and publishes: the wiki gets the pages (`npm run wiki -- publish --target wiki`), and `publication.json` records which revision of each version is approved and which is the latest; a release candidate publishes only `/docs/<version>/` on Pages, never the wiki. GitHub Pages serves `/docs/<version>/r<n>/` permalinks, `/docs/<version>/` and `/docs/latest/` aliases, all copied from the released archives and never built from `main` (`npm run wiki -- pages`). A correction between two releases goes through a `docs/<version>` branch and becomes an immutable revision `docs-v<version>-r<n>`; an older version's fix never moves the wiki backwards; a rollback is the deliberate way back and a promotion the way to finish a publication that was cancelled. Pages serves an archive only once its build provenance is verified against the workflow that must have made it, and a doc revision only once the publication record names it. The game's offline worker no longer answers a `/docs/` page with the game. `npm run wiki -- transition` writes the transition pages that will replace `docs/en` and `docs/fr` (at the switch-over), each old heading and anchor kept and linked to its new place and to the 4.4.0 text.

- **The first wiki pages, written in French and in English, and the environment variable reference** (4.5.0). Five pages of `wiki/` are `ready`, each written natively in both languages and found by `search_docs`:
  - "Restore the Studio on a fresh installation" / « Exercice de restauration sur une installation vierge »: the hosted Studio's restore drill, step by step. It gives the restore time measured on the 4.2.3 reference deployment (28.7 s and 59.7 s, two runs on two commits, one sample each), with its date, volume and conditions, the guarantee that a restore into a database already holding a project is refused, and the test that proves it. It also says what a restore can lose (the RPO) and why going back after a migration means restoring an older backup into a new add-on. The page says plainly that it was not replayed on a live installation.
  - "Write refused on the hosted Studio: span locked (423)" and "… stale base revision (409)": the exact message, the causes (a lease another member holds for 120 s, renewed while their Studio stays open; the exclusive lease a job such as Prepare or an engine upgrade takes; a file saved after you read it), how to tell them apart, and what to do (wait, ask, an owner's audited takeover, apply your edit on the latest version).
  - "Bridge and connector troubleshooting": what the Reality Bridge's 409 and 503 mean, a signal sent twice, a connector down. A search for "409" without a context now shows the Studio's page and the Bridge's, each naming its service.
  - "Environment variables": every variable quest-n-click reads (142, from the Studio Server's secrets to the CI workflows' own) and the ones Clever Cloud and its add-ons inject, each with its own section, its origin, whether it is a secret and can come from a `_FILE`, and the files that read it.
- **The environment variable register** (4.5.0). `wiki/data/env.json` describes each variable in French and in English. `npm run wiki -- env` regenerates the reference page and its identifiers from the register and from the code: `process.env` (destructuring included), `import.meta.env`, the Python tools, the shell scripts of `ops/` and `clevercloud/`, and the workflows of `.github/workflows/`. `npm run wiki -- check` fails on a variable the code reads without a description, on a described one the code no longer reads, and on a computed read (`process.env[name]`) nobody resolved.

- **The reference pages that rest on the code are generated from it** (4.5.0, wiki lot B11). `npm run wiki -- generate [<page>…]` writes, in English and in French, the part of eight wiki pages that the code knows: every npm script of the engine repository and of a created project (`reference.npm-scripts`), the six command-line tools with their subcommands, options and exit codes (`reference.cli`), the error register, by HTTP status for the Studio and by status and code for the Reality Bridge, with the solver's statuses and the checking commands' exit codes (`reference.error-codes`), the five statuses of each product surface (`reference.support-matrix`), the DSL (`create.dsl`), the public API's signatures (`engine.api`), every route of `/__studio/api` (`studio.api`) and every MCP tool with its input fields (`studio.mcp-tools`). What a person adds, a description in each language, lives in `wiki/data/` (`npm-scripts.json`, `cli.json`, `errors.json`, `studio-api.json`, `mcp-tools.json`); `npm run wiki -- check` fails when a script, a route, a tool, a subcommand or an error code has no description, when a described one is gone from the code, or when a page's generated part or its manifest identifiers drift. `docs/en|fr/DSL.md` and `API.md` are still generated as before until the switch-over.

- **The 132 mutation exemptions read again (4.5.0)**: each entry of `docs/dev/mutants.json` came due at 4.5.0 and was
  checked against the code. Five were not what they said and are now killed by a test: a speedrun envelope without a
  world proof no longer carries an empty `worldEvidence` key in memory, the Studio journal's lease that ends in the
  very millisecond it is asked for is taken, a durable write handed text is pinned on a short write (a file system that
  writes less than asked), and a bisection called past the head is refused. One reason was wrong in a side claim and is
  corrected; 19 are sharpened. The other 127 are read again at 4.6.0.

- **The documentation is written: 209 wiki pages in English and in French** (4.5.0). Eleven lots wrote every page of the catalogue under `wiki/en` and `wiki/fr` (Index, Start, Play, Install, Create a game, Engine, the local Studio, the team Studio, Clever Cloud, the Reality Bridge, Contribute, Reference), each page `ready`, its twin paired section by section, its guarantees linked to the test that holds them. Four indexes are generated from them. `npm run wiki -- check` passes with no error and no warning (the translations and the guarantees' scopes are checked by the AI that wrote them; a person's review is still due before publication); every question and counter-example of `wiki/acceptance/questions.json` passes in both languages (`npm run wiki -- acceptance --strict`); 1034 of the 1036 old sections are migrated, every limit candidate ticked. Until the switch-over (C2) the published documentation stays `docs/`.
- **The documentation search tells contexts apart** (4.5.0). With a `context`, `search_docs` answers with the section headed by that context ("The engine repository", "A created project") of a page that spans several, and a status code (`409`, `503`) asked within a context leads to that service's troubleshooting page before the error register. An excerpt shows the field that holds the most words found, so it names its service ("Studio backup", not only "Backups"). A search over the whole wiki is about three times faster.

- **The documentation moved to the wiki** (4.5.0). `wiki/en` and `wiki/fr` are now the documentation, published as the GitHub wiki; the README, the package READMEs, the created project's README, the command line's and the tools' messages, the Studio, the skills and the templates point to it. `docs/en/*.md` and `docs/fr/*.md` become transition pages: each old heading and explicit anchor stays, so an old link still lands, and links to its new place in the documentation of its version and to the complete 4.4.0 page (`blob/v4.4.0/docs/…`). `npm run wiki -- check` refuses a transition page edited by hand or one that lost an old anchor; `npx tsx tools/dsl-doc.ts` and `npx tsx tools/api-doc.ts` write the wiki's DSL and API references.
- **`read_doc {name}` reads its page from the wiki** (4.5.0). The eight historical pages (`CONTENT_GUIDE`, `ENGINE`, `TOOLS`, `STUDIO`, `WORKFLOW`, `AUDIO`, `UPGRADING`, `CLASSICS`) are rebuilt from the wiki's sections in the order of the old page, in the repository and in the package alike, still one text block and still accepted with 4.4.0's arguments. Each stays within 1.5 times its 4.4.0 size: where the new sections say more, the longest give their heading, their first paragraph and the `read_doc {id, section}` that returns the rest. The MCP server's instructions now say: `search_docs`, then `read_doc` by id and section.
- **The placement editor turns a character or a prop around (4.5.0, #252)**: the editor's Selection folder
  (`?edit=<room>`, and the Studio's Rooms tab, which embeds it) has a **mirror ↔** checkbox for the selected prop or
  character and a **mirror ↕** one for a prop: the layout's `flip` and `flipV`, which only the phone placement page
  could set. A character whose room sets `facing` keeps it, as before (the room's `facing` wins over the layout's
  `flip`): the panel says so under the checkbox. Nothing to change in a game.

- **The reference chapter's Chromium work runs in three CI jobs side by side (4.5.0, #265)**: `reference (chromium)`
  keeps the build, the proofs, the keyboard run, visual, perf, weight, music and taps; the French and generic runs move
  to `reference-fr`, the hero choice example to `heroes`, both on the `reference` gate. The job that ended every run
  (about 15 min of sequential work) becomes three of 5 to 8 min; each rebuilds its game.

## 4.4.0 — 2026-10-22

LOG #256–#267: "Author's Desk", the release an outside reading of 4.3 asked for: making a whole game simpler to make
and to check. A playable example of choosing the hero in two languages, `games/heroes`, with its browser test (building
it found three bugs, fixed below). The Studio's hero × language matrix (the Voices tab). Before/after captures of the
rooms the semantic diff names (a local Studio). The hosted preview measured phase by phase and made about three times
faster on the reference deployment: from a write to a ready preview, median 17.8 s → 5.6 s, max 26.0 s → 11.7 s over
ten revisions each (QUALIF-4.2.3-REFERENCE §6). From Horacio (LostInBrittany), thank you: a hotspot that acts on a
single tap (#221), one map pin for several places (#223), the phone's column on a short landscape screen (#227). The
137 mutation exemptions due at 4.4.0 read again, then read a second time: four bugs fixed with tests. Two new people's
passes (`heroes-two-languages`, `studio-hero-matrix`); none of the twenty-one has passed yet. Nothing to change in a
game (UPGRADING §41; strict SemVer: the new fields are optional). The tag is signed with the maintainer's SSH key on
their yes of 22 October for `v4.4.0` (D37).

### Fixed

- **The phone layout's column fits a short landscape screen (4.4.0, #227)**: on a phone in landscape under its
  browser's bars (e.g. 844 × 320), the right-hand column was 300 px wide, each bag slot a square 87 px tall, the verbs
  44 to 56 px, and the tools row (map, pause, music) went out at the bottom of the screen; six items or more (the bag's
  page buttons) cut it on a 568 × 320 phone too. The column now fits its height: the slots stop being square first,
  then the verbs come down to 44 px, and only when 44 px no longer fits do verbs and slots share the room; the tools
  row never shrinks, and past a floor the column scrolls instead of cutting. The layout also reads the room inside the
  safe areas (notch, home indicator) instead of the whole screen. Nothing to change in a game.

- **The Studio checks a translation's verb keys too (4.4.0)**: a translation that gives two verbs the same key
  (`fr: verbs.take.key › "F" is already the key of "close"`) was refused by `npm run validate` only; the Studio's
  guard, its processing worker and its in-browser demo said nothing. `validate` now runs that check whenever it is
  given the translations, so every caller says the same.

- **A translation's voice clips ship with the game (4.4.0)**: `npm run assets` encoded only `audio.voices`, so the
  clips of `audio.voicesByLang` (a French recording) never reached `public/assets/audio/voices/` and a French page
  played nothing. They are now prepared like the others (keyed `<lang>:<id>` in `assets.gen.json`).
- **`npm run voices -- check` reads each language's own text (4.4.0)**: 4.3.1 taught `status` that a clip keyed on a
  switch only the translation has (`Reviens sain{form?gull=e|*=} et sau{form?gull=ve|*=f} !`) belongs to that line;
  `check` still read the source text and warned "a clip no line claims".
- **`npm run e2e` in two languages in one run (4.4.0)**: the e2e harness kept the verb labels of the first page it
  read, so a game script that reloaded the page in another language (`?lang=fr`) tapped the English labels. It reads
  them again after each load.

- **A Reality page that polls no longer piles up listeners (4.4.0)**: the HTTP port's wait between two polls (or two
  reconnections of the stream) added an `abort` listener to the port's signal and removed it only on an abort, never
  when the wait ended on time. A page polling once a second held some 86 000 more closures a day, for as long as it
  stayed open. Each wait now removes its listener when it ends, either way.
- **An email's HTML read with a Turkish capital İ hides its scripts and comments again (4.4.0)**: the email
  connector's `htmlToText` looked for tags in the message's lower case at the original's positions, and a character
  whose lower case is longer (İ is two characters in lower case) shifted them: after an İ, a `<script>`'s or a
  comment's content leaked into the text an answer is read from, and visible text after a `<style>` could vanish.
  Tags are now matched in ASCII lower case, as HTML names them, which keeps every position.

- **The Studio's simulated Bridge no longer leaks a listener per wait (4.4.0)**: each wait for a signal left an
  `abort` listener on the connection, as the Reality port's sleep did (fixed in the same release); a long Studio
  session gathered thousands.

- **The CLI's login says why the provider refused it (4.4.0)**: `studio-server login` ended on a bare
  `ResponseBodyError` when the OpenID provider refused the device login; it now names the provider's code and reason,
  e.g. `not_allowed (Offline tokens not allowed for the user or client)`. STUDIO-SERVER says what that one needs: the
  client scope `offline_access` on the CLI client and the realm role `offline_access` for each member.

### Changes

- **A hotspot can act on a single tap, as an exit can (4.4.0, #221)**: a hotspot that says `onTap: 'go'` answers a
  single tap with no verb picked as an exit with `input.exitOnTap` does (#188): the hero walks there and acts on
  arrival with the double tap's verb (`defaultVerb`). E.g. an endless aisle that says why one does not walk down it,
  the LucasArts "Walk to" that gives a comment. Without it a tap on a hotspot only walks there, as before;
  `input.exitOnTap` stays about exits. Input only: rules, solver and saves do not see it. Nothing to change in a game.

- **One map pin for a city with several places (4.4.0, #223)**: a place's `portrait` can be a list, its faces side by
  side on the pin, and a place that says `joins: '<place>'` sits on that place's pin instead of having its own: once
  it is unlocked its face is added there, a tap on a face travels to that face's place, from any of them the pin is
  "here" (only the current face ringed), and moving between two places of one pin draws no journey. E.g. a city whose
  reception and office upstairs are both destinations. A pin with one place renders as before; the validator wants
  the joined place to exist, in the same region, and not to join another itself. Nothing to change in a game.

- **The Studio's hero × language matrix (4.4.0)**: the Voices tab has a second view, "Heroes × languages", read-only
  and in the in-browser demo too. For each line with an id whose text (in any language) has a text switch or
  `{hero}`, a column per hero (each value the switched flags take, headed by the variant's portrait and name) and per
  language; each cell shows the text that hero reads, the clip that plays, and the keyed clip that is missing (the
  plain id named when it plays instead). A row flags an untranslated language, a translation that drops a choice the
  source makes, and a hero's value no switch of the line lists without `*=`; "Lines with a problem" keeps only those.
  The same data as `GET hero-matrix` on the Studio API, and as `heroMatrix(game, locales)` in
  `src/engine/tools/hero-matrix.ts`.

- **The semantic diff draws the rooms it names, before and after (4.4.0)**: in the Check tab, under "Changes between
  revisions", **Capture the rooms (before / after)** shows each room the changes name (its layout, its source, its
  texts in a language; the first room when only shared files changed, such as the cast or `site.json`; six at most)
  at both revisions, side by side, with the rectangle where they differ outlined, or "no visible change". A moved
  prop, a font or a text that overflows is seen at once. Each revision is built as a preview and drawn in headless
  Chromium at a fixed 960 × 600; the PNGs are kept under `.cache/studio/`. New route `GET diff/<from>..<to>/captures`.
  A local Studio only (`npm run studio`, with Playwright): a hosted Studio answers that the captures need one, its
  worker having no browser (docs/en/STUDIO.md "Check" lists the other limits).

- **A hosted preview's time, phase by phase (4.4.0)**: a preview's log line (`"event":"preview"`) now says where its
  time goes: `queuedMs` (from the write to the build's start: the coalescing, a build before it, the retries),
  `snapMs`, `jobMs` (the worker's job as the Studio waits for it, its queue on the worker included), `storeMs` and the
  whole wait, `sinceWriteMs`. Each job the Studio asks of the worker logs a `worker-call` line (`putMs`, `postMs`,
  `getMs`, `delMs`), and the worker's own `worker-job` line says `queueMs`, `fetchMs`, `unpackMs`, `childMs` and
  `putMs`. Two histograms read them, `studio_preview_phase_seconds{phase}` and
  `studio_worker_job_phase_seconds{kind,phase}`; `studio_preview_build_seconds` is said to start after the snapshot,
  as it always did.
- **A faster hosted preview (4.4.0)**: the worker runs one job at a time per lane, a preview's build in a lane of its
  own, so it no longer waits behind the health's validator and solver (up to 45 s) or a load; each lane holds 8 jobs
  at most. The Studio packs one snapshot per revision, shared by the preview, the health, the published builds and the
  engine's upgrade (the lock, the repair and the walk once, not three times); stores a build's files 8 at a time; does
  not write again a blob it stored less than an hour ago; and answers once it has read the worker's result, the
  staging deleted after (a delete that fails is logged, `worker-staging-left`). Nothing changes for a game.

- **A playable example of choosing the hero (4.4.0)**: `games/heroes`, "Who Am I Today?", one garden and one puzzle
  for every 4.3 hero-choice feature at once. Three heroes on portrait cards at New Game (Pixel, Biscuit, Gaby the
  gull), their names in the lines (`{hero}`), Grandma's words switched for each (`{form?…}`), one rule only the gull
  gets, English and French (the French table adds its own agreements: `Prête` for the gull), Grandma's lines voiced
  per hero in both languages (`garden.dust~form=gull` in `audio.voices` and `audio.voicesByLang.fr`), and a save that
  keeps the hero. The sample game's art. `GAME=heroes npm run dev` plays it, `GAME=heroes npm run solve -- --prove`
  proves it for every hero, `npm run e2e -- <url> --game heroes --prod` picks each hero on its card in English and in
  French, saves, reloads, continues and finishes (in CI's `reference` job). CONTENT_GUIDE's hero section points to it.

- **The 137 mutation exemptions read again (4.4.0)**: each entry of `docs/dev/mutants.json` came due at 4.4.0 and was
  checked against the code. Four were not what they said and are now killed by a test (a delivery with an empty
  player id bound the save to it, the Bridge's re-sign cache hits were never counted, a badge fetch's own request
  timeout, a logout token whose `events` is `null`); reading them found the two fixes above. The other 133 keep their
  place, 16 with a reason rewritten, and are read again at 4.5.0.

## 4.3.1 — 2026-10-21

LOG #254–#255: "Voices by Language", a patch on 4.3.0 after an outside reading of it. A translation that agrees a line
its source never agrees (`Ready?`, `Prêt{form?witch=e|knight=|robot=} ?`) now gets its voices by value through the
whole chain: export, import, orphans, the validator's warning (the command line, the Studio's server and its
in-browser demo alike) and playback. `npm run solve` is said to find one winning path, and `--prove` to prove every
state, every hero included, in the guides and in the solver's own sentence. A new mutation set, `voices`, gated from
the start. Nothing to change in a game (UPGRADING §40): no content field, save, schema or fingerprint moves (strict
SemVer, as since 4.2).

### Fixed

- **A translation's own switches get their voices (4.3.1)**: a translation may agree a line the source language never
  agrees, e.g. English `Ready?`, French `Prêt{form?witch=e|knight=|robot=} ?`. `npm run voices -- export --lang fr`
  already listed the three French clips (`ready~form=witch`…), but `import` refused them as unknown lines, `status`
  called their clips orphans, the Studio refused their status, and `npm run validate` said nothing when one was
  missing: those read the switches of the text as written, not as translated. Each language's clips now come from
  its own text everywhere, the command line, the Studio's server (its guard and the processing worker) and its
  in-browser demo alike; a switch a translation drops no longer asks for clips by value in that language either. The
  engine already played the right clip; a test now holds the whole chain. And a line whose switches list only a
  default (`{form?*=there}`) showed its braces in the recording table; it now reads as spoken.
- **`npm run solve` says it found one path, not a proof (4.3.1)**: the hero-choice guide said `npm run solve` "proves
  every hero"; it stops at the first winning path, which one hero may be enough for. A game where only the robot can
  finish printed `solved`; `--prove` reports its softlocks. The guide, CLASSICS, DESIGN and WORKFLOW now name
  `npm run solve -- --prove` for that, and the witness's sentence, shared by the command line, its JSON, the Studio
  and the MCP tool, reads "the ending is reached on one path (…; only --prove checks every state, every answer of a
  choice included)".

## 4.3.0 — 2026-10-21

LOG #246–#253: "Hero Choice". The player chooses the hero at New Game, among any number of heroes a game declares:
portraits in a choice, a name per character variant, and text switches (`{hero}`, `{form?knight=him|witch=her}`) so
the other characters' words follow the hero, in every language; voices follow the same keys (D49, ADR 0022). Most of
this release comes from an outside contributor, Horacio (LostInBrittany), thank you: the hero choice itself (#202),
a key per verb (#205), a proportional pixel font for the interface by default (#206), a job's late
answer that no longer overwrites its result (#211), a naming convention for titles and branches (#208) and a
conversation saved after each topic (#219); each was
reviewed, completed on its branch and merged into main, the 4.3 line (D48). A game that uses none of it keeps its
saves, its logic fingerprint and `schemaVersion` 3; its interface font changes unless it sets its own (UPGRADING §39).
**Breaking**: the former `web-scumm` names, aliases through 4.2.x, are gone (D47). A game that still imports
`web-scumm/…` runs `npx quest-n-click migrate` once, after installing `quest-n-click` (UPGRADING §39); the formats
keep their names. The tag is signed with the maintainer's SSH key on their yes of 21 October, « yes sign v4.3.0 »,
the yes for `v4.3.0` only (D37).

### Breaking

- **The `web-scumm` names are gone (4.3.0, D47)**: the release no longer ships `web-scumm-<version>.tgz`,
  `create-web-scumm`, `web-scumm-bridge`, `web-scumm-connectors` or `web-scumm-studio-server` (nor their SBOMs), the
  packages no longer carry the `web-scumm`, `web-scumm-bridge`, `web-scumm-connector`, `web-scumm-studio-server` and
  `web-scumm-studio-worker` commands, and `web-scumm/content` and the other old imports no longer resolve. A game still
  under the old name runs `npm uninstall web-scumm`, installs `quest-n-click`, then `npx quest-n-click migrate`, which
  now renames its `web-scumm/…` imports, its tsconfig's paths and its scripts' commands (`--check` names what is left;
  UPGRADING §39 also gives the `grep`/`sed` by hand). On a hosted Studio such a game does not load until its owner runs
  the engine's upgrade, which renames its imports first, as a revision of its own judged by loading only (a game that
  cannot be finished yet is never stuck) and not undoable, then migrates its schema as before. Format identifiers (`web-scumm-save`, sessions, `.wsrun`,
  storage keys, headers, `WEB_SCUMM_*`) keep their names, and releases up to 4.2.5 keep their files.

### Fixed

- **A prepared job keeps its result on screen (4.3.0, #210)**: on a hosted Studio, the Assets panel could replace
  "prepared from revision 3: 218 files" with "Preparing the assets: done" a moment after the job ended, when a status
  check sent before the end answered after it. Once a job has ended, the page hears nothing more of it, nor of a Cancel
  sent just before the end and refused after it (the panel used to add "(the job has ended)" to its last word). This
  also made the Firefox pass of `npm run e2e:studio-hosted` fail now and then.
- **A badge signed with a weak or foreign key is refused (4.3.0)**: the badge connector takes the key from the
  issuer's documents, and the algorithm's name said nothing of its strength. An `eddsa-jcs-2022` proof is now checked
  with an Ed25519 key only (an RSA-512 key, whose signature is exactly 64 bytes, made a valid proof); a JWS (an OB3
  JWT, an OB2 signed assertion and its `publicKeyPem`, a status list) signed RS256 needs a modulus of at least 2048
  bits, and ES256 a P-256 key. A 512-bit RSA key can be factored, so a badge it signed could be forged. Such badges
  are now `invalid`.
- **The Bridge checks its limits before it starts (4.3.0)**: each of `config.json`'s `limits` must be an integer, at
  least 1 for `streamPage`, `bodyBytes` and `streamBufferBytes` (`streamPage: 0` made a fetch by cursor loop forever)
  and at least 0 for the others, and a name that is no limit is refused. Before, any value was taken. A Bridge given
  such a value does not start, and says which limit, the least it takes and what it was given; on a shared Bridge
  that stops every tenant (UPGRADING §39 says how to look first).
- **A run whose world cannot be hashed is refused, not a crash (4.3.0)**: a `.wsrun` whose world holds a number JSON
  reads as Infinity (`1e400`), or two keys equal once NFC-composed, is `invalid-replay` / `world-shape`; the verifier
  answered `inconclusive` / `crash`. Loading such a stored world says the same.
- **A conversation saves after each topic (4.3.0, #218)**: a conversation is one action, and the autosave came only
  when it ended, at "Bye". What a topic changed (a flag, an item, a minigame won) was lost if the page died before:
  on a phone, a tab killed in the background or a battery gone flat sent the player back before the topic. The state
  is now saved after each topic's `do`, once the topic is marked as seen, when the conversation is the rest of its
  action (the talk verb, or a `{ talk }` that ends a rule); a talk followed by more commands is still saved at the
  action's end, so a save never holds half a `do`. A loaded save opens no conversation: the player is in the room,
  the topics seen marked. Nothing to change in a game.

### Changes

- **The player chooses the hero at New Game (4.3.0)**: any number of heroes, one character with a variant per hero.
  A game asks in its intro with a `choice` whose options set a flag (`{ set: ['form', 'witch'] }`); the rest follows
  from that flag. Nothing changes for a game that does not use it (no new condition, command or state, saves and
  `schemaVersion` 3 unchanged). CONTENT_GUIDE, "Choosing the hero"; UPGRADING §39.
- **A character variant may carry a `name` (4.3.0)**: while the variant applies, the speech box, the transcript, the
  talk header and `{name}` in a fallback line call the character by it. Translated like any text
  (`char:<id>/variants[<i>].name`).
- **Text switches and `{hero}` (4.3.0)**: `{hero}` is the active hero's name; `{form?knight=him|witch=her|*=it}` is the
  text listed for the flag's current value, `*=` covering the rest. Filled when a text is shown (lines, choices,
  looks, hints, toasts, captions, item and object names, objective titles), after the translation, so each language
  writes its own words inside the braces (`content{form?witch=e|*=}`). The validator reports a malformed switch, a
  flag no command sets, a value listed that nothing writes and a value written that a switch does not cover;
  `npm run i18n -- status` lists the translations that drop a choice their source's switches make. Room, verb,
  character and variant names are shown as written: a switch there is an error. A 4.2 text holding a
  literal `{hero}` or `{word?…=…}` is now filled (UPGRADING §39).
- **Portraits in a choice (4.3.0)**: `img` on a choice option shows it as a card, the image with the option's text as
  its label and its accessible name; the cards wrap and scroll, so a phone fits any number of heroes.
- **Voices for lines with switches (4.3.0)**: a line whose words follow a flag (`{form?m=him|f=her}`) is recorded once
  per value: its clips go in `audio.voices` under `<id>~<flag>=<value>` (`grandma_saw~form=f`); with several flags in
  one line, sorted by name and joined with `~` (`greet~form=f~mood=calm`), values written as text (`true`, `2`). The
  engine plays the clip for the flags as they stand and falls back to the plain id when that clip is missing or a flag
  is not set yet, so a game can ship before every recording exists. `voicesByLang` uses the same keys. `npm run voices`
  (and the Studio's Voices tab) lists one row per value, each with its text, and `npm run validate` warns when a voiced
  line lacks a value's clip. The keys are only map keys: the file names stay the author's (AUDIO.md, "Voices").
- **The Studio previews each hero (4.3.0)**: the Play tab's **Text switches** picker sets the flag a game's switches
  read (and shows `{hero}`'s name), and the Rooms tab shows under a switched text how it reads (local Studio;
  STUDIO.md).
- **`npm run lint` and the chosen hero (4.3.0)**: `hero-looks-default` (info) says when two or more values of the
  hero's flag match no variant, so those heroes would look like the written one; a rule that only sets a flag read by
  a character's variant or a text switch (the intro's choice) is no longer reported as `action-dead`.

- **A key per verb: O for Open, as in the LucasArts games (4.3.0, #203)**: a verb's optional `key`
  (`{ id: 'open', label: 'Open', color: '#8fd3ff', key: 'o' }`) picks it at the keyboard as a tap on its button would,
  in any case and without Ctrl, Alt or Meta, and does nothing while the engine is busy, a line is on screen or
  something covers the scene. The button underlines the letter in its label and announces it (`aria-keyshortcuts`).
  The key is translated with the label (`verb:<id>/key`). `npm run validate` refuses a key that is not one character,
  Space and a key two verbs share, in the game and in each translation. With `settings: true` the player can turn the
  keys off (a "Verb keys" row, `ui.verbKeys`, shown only when a verb has a key: WCAG 2.1.4), and the validator warns
  about keys in a game without a settings menu. Without `key`, nothing changes.

- **A proportional pixel font for the interface (4.3.0, #204).** The default `--font-ui` is now Galmuri11 (OFL 1.1, a
  125 KB Latin subset) instead of DotGothic16, a Japanese face whose fixed-width Latin left gaps around `i` and `l` and
  set the period a pixel above the line. Galmuri11 has a narrow `i`, a wide `m` and a period on the baseline, close to
  the LucasArts dialogue fonts, and a `size-adjust` keeps a game's text at the same size. DotGothic16 now stands behind
  every interface family, so Japanese text and the few symbols Galmuri11 lacks still render. A game that wants the old
  look sets `skin.fonts.ui: 'DotGothic16'`; a game that already sets `skin.fonts.ui` keeps its font, and a character its
  font lacks now falls back to DotGothic16 before `'Courier New'` (UPGRADING §39). `tools/subset-font.py` checks the
  sha256 of the pinned Galmuri release before it cuts the subset.

- **main is the 4.3 line (4.3.0, D48)**: after v4.2.5 the six open pull requests (#202, #205, #206, #208, #211,
  #213) were reviewed, completed on their branches and merged into main, which prepares 4.3.0. The 4.2.x freeze of
  the content format and the public API (D40, eased by D46) no longer binds main; a 4.2.x fix, if one is needed,
  branches from `v4.2.5`.

- **A naming convention for titles and branches (4.3.0, #207)**: CONTRIBUTING.md says how an issue, a pull request
  and a branch are named: an issue starts with its template's prefix (`[bug]`, `[feature]`, `[field]`), a pull request
  reads `<Area>: <what changes> (#issue)` (a release's pass starts with its version), a branch starts with its kind
  (`feature/`, `fix/`, `docs/`…) and the issue's number. The pull request template's pointer to the branch prefixes now
  finds them there.

- **Pillow 13 (4.3.0, #213)**: the asset tools (`npm run assets`, `tools/cut-sheet.py`, `check-alpha.py`, `pick-bg.py`,
  the code wheel's PDF) and a hosted Studio's processing worker use Pillow 13.0.0. Nothing changes for an author: the
  sample game's images come out byte for byte the same, and no tool used an API that Pillow 13 removed or deprecated.
  Run `python3 -m pip install -r requirements.txt` again. The worker's lock (`ops/studio/worker-requirements.lock`)
  carries the new wheel's sha256, checked against PyPI.
- **The 158 mutation exemptions read again (4.3.0)**: each entry of `docs/dev/mutants.json` came due at 4.3.0 and was
  checked against the code. 28 were not what they said and are now killed by a test; two led to the fixes above and
  stay, their reason rewritten. The other 128 keep their place with a reviewed reason, and every entry now names its
  line and is read again at 4.4.0. 130 remain.

## 4.2.5 — 2026-10-20

LOG #244–#245: the project is now called quest'n'click. It was web-scumm, named in homage to SCUMM, the LucasArts
engine whose spirit it follows, and is renamed so its name sparks no needless debate (D47). Nothing changes for a
game: the formats keep their identifiers, so saves, runs and sessions load as before, and a game made for 4.2.4
installs, builds and plays under its old names. The old names (`web-scumm`, `create-web-scumm`, `web-scumm-bridge`,
`web-scumm-connectors`, `web-scumm-studio-server`, the `web-scumm/…` imports) work until 4.3: each 4.2.x release also
ships them as full copies. A release's files are named `quest-n-click-…` from this one, and its attestations name the
repository `wanoo/quest-n-click`. The tag is signed with the maintainer's SSH key on their yes of 20 October,
« Yes, sign v4.2.5 », the yes for `v4.2.5` only (D37).

### Changes

- **web-scumm becomes quest'n'click (4.2.5, D47)**: the project, its repository (`github.com/wanoo/quest-n-click`, the
  old links redirect) and its Pages site (`wanoo.github.io/quest-n-click`; the old address redirects there through
  `wanoo.github.io`) take the name quest'n'click. The packages and commands are now `quest-n-click`, `create-quest-n-click`,
  `quest-n-click-bridge`, `quest-n-click-connectors` (command `quest-n-click-connector`) and
  `quest-n-click-studio-server` (commands `quest-n-click-studio-server`, `quest-n-click-studio-worker`); a game imports
  `quest-n-click/content`, `/player`, `/minigames`, `/testing`, `/reality`; a release's files are named
  `quest-n-click-<version>.tgz` and `quest-n-click-<tag>-…`. Nothing to change in a game: through 4.2.x each release
  also ships `web-scumm-<version>.tgz` and the other old archives (the same files, the old package name), the old
  commands run after a one-line notice, and `web-scumm/content` and the other old imports still resolve; the aliases go
  in 4.3. The formats keep their identifiers (`web-scumm-save`, `web-scumm-session`, `.wsrun`, `web-scumm-remix-1`, the
  IndexedDB and localStorage names, the `X-Web-Scumm-*` headers, `WEB_SCUMM_*`), so saves, runs, sessions and
  deployments load and run as before. Releases up to v4.2.4 keep their files' names and their attestations' repository,
  `wanoo/web-scumm`. The READMEs open on the new logo and a short "Formerly web-scumm" note; UPGRADING §38 says how to
  switch, when you like.

- **The sample games' credits say quest'n'click (4.2.5)**: the Pantry Key's credits ("A quest'n'click sample game",
  "Sound effects: generated by quest'n'click") and the Night Market's credits and title-screen line ("The reference
  chapter of quest'n'click"), in English and French. Their presentation fingerprint moves with them, so the reference
  run is recorded again; their rules, saves and proofs do not change.

## 4.2.4 — 2026-10-20

LOG #241–#243: four pull requests from an outside contributor, Horacio (LostInBrittany), found while making his game
"Jack cherche un taf", each reviewed, completed on its branch and merged: `face: 'hero'` turns a character toward the
hero (#194); the sprite sheets' background, transparent or a chosen colour (#187); an exit gone through on a single
tap (#191); `actorGap`, the hero's distance to a character following their size (#199). A game that uses none of them
plays, saves and proves as on 4.2.3: the same fingerprints, golden saves and reference runs. The content format gains
three optional, presentation-only fields, `input.exitOnTap`, an exit's `onTap` and `actorGap`, under D46 (a 4.2.x may
add such a field when it needs no schema, save envelope or IR change); the public API and the save envelope are
4.2.0's. The tag is signed with the maintainer's SSH key on their yes of 20 October, « Yes, sign v4.2.4 », the yes for
`v4.2.4` only (D37).

### Fixed

- **`face: 'hero'` turns a character toward the hero (4.2.4)**: `{ face: 'hero', who: 'grandma' }` turned grandma to
  the right wherever the hero stood, since the hero is not a hotspot, a prop nor an actor; the `face` command now reads
  the hero's position from the state, as it already did for the hero turning toward someone. Found while making
  "Jack cherche un taf", in an opening cutscene.

### Changes

- **The sprite sheets' background (4.2.4)**: `"sheetBackground"` in `site.json`, next to `artStyle`, is
  `"transparent"` or a `#RRGGBB` colour (default `#2B2E45`, so a game without it gets the same prompts as before).
  `npm run prompts` writes every sheet's background from it; in transparent mode the prompts ask for real alpha, forbid
  a painted checkerboard and keep carved or open shapes (mouths, eyes) opaque. `tools/cut-sheet.py` cuts a sheet on a
  transparent background on its alpha, keying nothing by colour (a flat-background sheet cuts exactly as before). Two
  small scripts help choose: `tools/check-alpha.py` tells real alpha from a painted checkerboard, and
  `tools/pick-bg.py` ranks the flat colours by their distance to a character's drawing (PROMPTS.md, "Choosing the
  sheet background").

- **An exit can be gone through on a single tap (4.2.4, #188)**: `input: { exitOnTap: true }` in `game.ts` makes a
  single tap on an exit with no verb picked walk there and go through on arrival, with the double tap's verb, as in
  the LucasArts classics; a locked exit says its `locked` line. A picked verb still wins, a tap elsewhere during the
  walk still redirects the hero (and nothing is gone through), a double tap is unchanged. An exit's `onTap: 'go' |
  'walk'` overrides the game's setting either way; the Studio offers it on the exit's sheet. Off by default: a game
  without either plays exactly as before. Input only (presentation in the fingerprint): the rules, the solver and
  saves do not see it.

- **`actorGap`: the hero's distance to a character follows their size (4.2.4, #198)**: without an `approach` point in
  the layout, the hero stopped 44 units from any character, so tall characters who gesture as they talk put a hand in
  each other's head. `actorGap` on the game (e.g. `0.8`) sets the distance to that share of the two characters' mean
  height, times the depth scale where the character stands; omitted, nothing changes, and an `approach` point still
  wins. `depthScale` and `scaleAt` move to `core/stage.ts`. Found while making "Jack cherche un taf".

## 4.2.3 — 2026-10-20

"Coordination" (LOG #218–#240): the last of the three 4.2.x steps (D40, D44). A team organises its game in the
hosted Studio: a scenario map of chapters, puzzles and characters built on the game's stable ids, comments anchored
on those ids, and a diff between two revisions that names what changed. A write says the revision its editor read, and
a late one is refused with what changed, never merged on its own. AI agents work on the hosted Studio through its
remote MCP, as their member; an owner pushes the game to a Git repository and imports it back; a game made on 4.1.x is
upgraded on the server. The Assets tab works hosted (uploads, sheets cut on the worker), Prepare and the cuts can be
followed and cancelled, and a worker installed from the release archives prepares assets. An operator gets metrics, a
daily backup to the bucket and a runbook, run on Clever Cloud's test organisation. The Studio Server stays
**experimental** until its people's passes are made (`studio-hosted`, `studio-collab`, `studio-preview`,
`studio-assets-hosted`, and 4.2.3's `studio-mcp-remote` and `studio-oidc-generic`). Nothing a game or a player uses
changed: the public API, the content format and the save envelope are 4.2.0's (D40). The tag is signed with the
maintainer's SSH key on their yes of 19 October, « Yes, sign v4.2.3 » (D37, D44).

### Fixed

- **A Studio Server worker installed from the release archives prepares assets (4.2.3)**: the engine's package carries
  the worker's Python lock (`ops/studio/worker-requirements.lock`), and the worker looks for the packages its build
  hook installed in its own folder (`.python`, or `WORKER_PYTHON_PATH`) rather than beside the engine. STUDIO-SERVER
  gives the hook for a worker from the archives. In 4.2.2 Prepare assets needed a worker deployed from the repository.

- **The daily backup ran nothing (4.2.3, found by the reference deployment)**: with the configuration in
  `STUDIO_CONFIG_JSON` (no `--config`), the Studio Server's commands dropped their first argument, so `import <dir>`,
  `invite --email …` and the daily `backup --to-bucket` of `ops/studio/backup-cron.sh` failed (`a new file is
  required`). Each now reads its arguments whole.
- **An operation another process confirmed is shipped (4.2.3)**: a game imported by the CLI against the same database
  emitted no event in the running instance, so it reached the bucket only at the next write there or a restart, and
  the RPO grew meanwhile. The import now ships its operation before it ends, and the instance also ships every 30 s.
- **`invite` reads its flags strictly (4.2.3)**: without `--role`, or with a flag where a value belongs, it took the
  first argument instead (`invite owner --email a@b.fr` invited an owner); it now refuses, as its usage says.

- **A slow start never serves older prepared assets (4.2.3)**: when an instance started, it wrote the latest prepared
  set again in the background; a Prepare that ended meanwhile could see the start finish after it, serve the older set
  again and delete the newer one's folder. The older set now steps aside.
- **A deploy no longer refuses writes for minutes (4.2.3, found by the reference deployment)**: on Clever Cloud the old
  instance lives on, renewing the service lease, for minutes after the new one is up, and was never seen to get
  SIGTERM, so writes got 503s for about 2.5 min at each deploy. The new instance now asks for the lease and the old one
  gives it back at its next renewal (10 s); an older instance never takes it from a newer one. A write that waited
  for another instance's journal lock is a 503 to retry, no longer a 409 a client could take as a conflict, and only
  the instance serving the writes repairs its folder (at once when it takes the lease, then every 30 s). The first
  deploy of 4.2.3 replaces an instance that does not ask or give back: it still waits as before; the next ones do not.

- **A worker on a machine whose clock is a little behind no longer refuses jobs (4.2.3, found by the reference
  deployment)**: the Studio signs a job to live 5 min to the millisecond, and the worker refused one that lived longer
  by its own clock, so a few milliseconds of skew between the two machines refused about half the jobs (health and
  previews failed with "refused the job (403)"). The worker now allows 30 s of skew, logs why it refuses a job, and the
  Studio says the worker's reason.

### Changes

- **The gated mutation sets read again before 4.2.2's tag (4.2.2)**: a survivor of `mutation (core)` found by the
  4.2.2 candidate (a slot's revision never copied) is killed by a test, and the 16 new survivors of `studio-ops` in the
  journal's reads of a past revision are killed (15) or named (1). No behaviour changed; the tag `v4.2.2` was made on
  this commit, and its note is filed here.

- **A plan for the coordination** (4.2.3): `docs/dev/PLAN-4.2.3-COORDINATION.md` (in French), ten guarantees each with
  its limit and its test (H1–H10), the pull requests in order, the exit criteria, what stays open after 4.2.3, and
  decisions D44 (the name, GitLab as the second OpenID provider, a deploy key, the diff's captures local) and D45 (no
  captures in 4.2.3's diff).

- **A write says what its editor read (4.2.3)**: on a hosted Studio each write carries the revision its editor read
  (`x-studio-base`). When one of its files was written since, it is refused (409) with that file as it was read and as
  it is now (the same tab's own writes since never refuse it): the Studio shows the lines that changed, keeps the
  draft, and offers to apply the edit on the latest version, or for a whole document (a layout, the storyboard) to
  replace the other change, said as such; never on its own.

- **The scenario map (4.2.3)**: a Studio tab, Map, where a team declares its chapters, puzzles and characters, each a
  list of what the game already names (a room, a rule id, an item, a character, an objective, a checkpoint), shown with
  the `file:line` that writes it, or "not declared". Kept in `games/<id>/groupings.json`, a span of its own on a shared
  Studio; a grouping never writes what it names. The map is derived from the game's IR at each read, never stored.
  Routes: GET/PUT `groupings`, GET `map`.

- **The Studio Server's workshop mutation set is gated (4.2.3)**: the 104 survivors of `studio-workshop` (the
  backup, the journal shipped, the collection, the health, the previews, the builds and the prepared assets) are read
  one by one: 94 killed by short tests (`tests/studio-workshop-{backup,health,previews,prepared}-mutants.test.ts`),
  10 named in `docs/dev/mutants.json`. A survivor not named now fails the set's job, as for the other sets.

- **The MCP on a hosted Studio (4.2.3, ADR 0029)**: a Studio Server serves its game's MCP tools at `/mcp` (MCP's
  Streamable HTTP, stateless), for an access token of the Studio's audience, never the session cookie; it says where its
  authorization is (`/.well-known/oauth-protected-resource`, RFC 9728). Each tool is a request to the server's own API
  with the caller's token: an agent writes as its member, with their role, their spans, in the journal.
  `npm run mcp -- --server <url>` points the local MCP server at a hosted Studio the same way (the CLI's token).

- **The game in Git (4.2.3)**: a hosted Studio configured with `git` (a repository, a branch, a folder; its deploy key
  the secret `STUDIO_GIT_KEY`) lets an owner push the revisions since the last push as one commit, each author a
  `Co-authored-by`, never forced (a branch that moved is refused), and import the branch as one revision. The Play tab
  shows where the game goes and the last revision pushed.

- **A hosted game made on 4.1.x is upgraded to this engine's authoring schema from the Studio Server (4.2.3)**: an
  owner's `POST /api/engine/migrate` runs `web-scumm migrate` on the processing worker under their exclusive lease (the
  stable ids, then `schemaVersion: 3`, `saveVersion` + 1 and the ids' migration step in `game.ts`), judges the migrated
  game there (the validator, then the solver), and writes it as one undoable revision; a game it would break, or that
  the solver cannot judge in time, is refused (422) and nothing is written. A game already at schema 3 has nothing to
  do. STUDIO-SERVER (en, fr): "Upgrading the engine of a hosted game".

- **Comments on a shared Studio (4.2.3)**: in the Notes tab, threads anchored on a stable id of the game (or the game)
  and the revision they were written at, open to reviewers (kept by the Studio, never in a game file); an anchor the
  game no longer names is said orphan; an owner brings the notes of `notes.json` in.

- **What changed between two revisions, by name (4.2.3)**: the Check tab's "Changes between revisions" (and GET
  `diff/<from>..<to>`) says, file by file, the ids a source added, removed or changed with the fields that changed,
  the value paths of a JSON file, or "file changed" when nothing more can be said. The sources are read, never run.

- **The gates of 4.2.3**: two human passes asked from 4.2.3 on, `studio-mcp-remote` (an AI agent on a hosted Studio
  through its remote MCP) and `studio-oidc-generic` (the Studio Server behind a second OpenID Connect provider, GitLab).

- **The Assets tab on a hosted Studio (4.2.3)**: a team on the Studio Server now uploads sounds and decors, cuts
  generated sprite sheets and keys single cells from the Assets tab, as on a local Studio. An upload is 10 MiB at most
  (413) and its type is read from its bytes (PNG, JPEG or WebP images; Ogg, MP3 or WAV sounds; 415 otherwise); it is
  written as one revision, never run. The cutting runs on the processing worker under the project's exclusive lease,
  and its cells, with the backups of those recut, are one revision. The uploaded sheet itself is not kept on a hosted
  Studio.
- **For scripts calling the Studio Server (4.2.3)**: `POST /api/assets/prepare` now answers 202 with a job instead of
  the prepared run; poll `GET /api/jobs/<id>` until its `state` is `done` (or `failed`, `cancelled`), and read the run
  in its `result`.
- **Prepare assets and the cuts can be followed and cancelled (4.2.3)**: on a hosted Studio they are jobs; their
  states (waiting, running and its step, done, failed, cancelled) come live, in a small panel with a Cancel button. A
  job cancelled before it writes leaves nothing, and gives the project's exclusive lease back.

- **The Studio Server's metrics and daily backup (4.2.3, H9)**: with the secret `STUDIO_METRICS_TOKEN`, `GET
  /metrics` answers in Prometheus' text format to that token only (never the session, never the game's origin): the
  journal's operation latency, the worker's jobs in flight and their duration by kind, the lease conflicts (423), the
  previews' build time, the RPO, the revision. `studio-server backup --to-bucket [--keep n]` writes the backup to the
  instance's bucket (`backups/<date>-r<revision>.json`) and keeps the n most recent; `clevercloud/cron.json` runs it
  every day on an app that sets `STUDIO_BACKUP_CRON=1`. STUDIO-SERVER gains its runbook ("Running it: the reference
  deployment": the overlapping redeploy and the engine upgrade, the alerts, the restore drill).
- **The Studio Server's runbook, after its reference run on Clever Cloud (4.2.3, H9)**: STUDIO-SERVER (en, fr) now
  says how to create the realm on Clever's managed Keycloak (its first admin password is temporary, `admin-cli` refuses
  it, the console's realm import works), which fields of `ops/studio/keycloak/realm.json` to change for a hosted
  Studio, to leave `APP_FOLDER` unset, to put `--` before a key's value in `clever env set`, to link both apps
  (`clever link --alias`) before `clever deploy --alias`, that the shell of `clever ssh` has the app's variables and
  that `clever ssh --command` waits for the old instance to go, how to keep a part of `clever logs`, that `/metrics` on
  the game's origin is a 401 (its session gate), what an overlapping redeploy costs (measured: writes refused
  10 to 16 s once the lease is handed over, about 2.5 min from a version without the handover; twice the database
  connections), and how to compare a restore drill through the API.

- **The exclusive lease's runner is under mutation testing (4.2.3)**: `studio-auth`'s tests now pin how a member's long
  operation takes the project's lease, gives it back and renews it (19 mutants that survived before are killed).

- **The 4.2.3 fixes are under mutation testing (4.2.3)**: a closed shipper and a start dropping an older prepared set
  are pinned by `studio-workshop`'s tests.

- **The cost of a Studio Server redeploy, measured with the lease handover (4.2.3)**: STUDIO-SERVER (en, fr) now says
  what a redeploy costs on Clever Cloud once both versions hand the service lease over: the lease taken 6 to 10 s after
  the new instance listens, writes refused (503 with `Retry-After`) for 10 to 16 s while Clever still routes to the
  old instance, none lost; and that the first deploy from a version without the handover still refuses writes for
  about two and a half minutes. The `/readyz` alert goes back to 2 min, expected once on that first deploy.

## 4.2.2 — 2026-10-19

"Playable Workshop" (LOG #206–#217): the second of the three 4.2.x steps (D40, D42). On a hosted Studio, everyone
plays the shared revision without a dev server: the processing worker builds a preview of each revision, and a save
carried into another revision asks before it is resumed (ADR 0026). Every diagnostic names its revision; the header
gives the game's health at the head and, when it breaks, the revision that broke it. Undo and redo come back, each
member's own. The team publishes immutable, numbered builds with signed manifests, prepares the game's assets on the
worker (sprite sheets and uploads stay local until 4.2.3), and an operator backs the Studio up, ships its journal to
the bucket (the RPO is in `/readyz`) and restores it. Vite has left the Studio Server. It stays **experimental**
until its people's passes are made (`studio-hosted`, `studio-collab`, and 4.2.2's `studio-preview` and
`studio-assets-hosted`). Nothing a game or a player uses changed: the public API, the content format and the save
envelope are 4.2.0's (D40). The tag is signed with the maintainer's SSH key on their yes of 18 October, « yes sign
4.2.2 » (D37, D42).

### Changes

- **Dependencies (4.2.2)**: zod 4.6.7, Playwright 1.64.1, @axe-core/playwright 4.14, @vitest/coverage-v8 5.0.5; the
  bridge's locks follow zod. Nothing changes for a player, an author or a host.

- **The hosted Studio shows the preview of a revision (4.2.2)**: after each change the processing worker builds the
  game at the head (a new job kind, `preview`; a burst of changes builds its last revision only), the Studio stores its
  files by content and serves them on the game's origin at `/preview/<rev>/`, behind the game session. The room view
  loads a newer preview once it is built, unless a placement is not saved; the label under it names the revision
  shown, the one building, and a revision that does not build, with its reason. The editing tools enter the preview's
  build (`VITE_STUDIO_PREVIEW`); the player's build is unchanged.
- **Vite has left the Studio Server (4.2.2)**: 4.2.1's live preview (Vite in middleware mode on the game's origin) is
  gone, with its allow-list of engine paths; the game's origin serves a revision's built files and the prepared assets
  of the prepared set and `publicDir`, and the published builds. The worker still needs the engine's Vite to build.

- **A save made in another revision asks before it is resumed (4.2.2, ADR 0026)**: in a hosted Studio's preview, a
  save records the revision and the fingerprint of the content it was made in (beside it: the save format does not
  change). Resumed where the content differs, on Continue or from a slot, the game asks: Resume here (it may fail if
  this revision removed what the save refers to), Restart, or Stay in the save's own revision. The same content under
  another revision number asks nothing. Escape cancels the question. The player's builds are unchanged.

- **A plan for the playable workshop** (4.2.2): `docs/dev/PLAN-4.2.2-ATELIER-JOUABLE.md`, eight guarantees each with
  its limit and its test, the pull requests in order, the exit criteria, and decision D42 (the preview's path, the
  fresh rebuild, the RPO target, public builds).

- **Every diagnostic says its revision (4.2.2)**: on a hosted Studio each read answer carries the revision it was made
  at (`x-studio-revision`); the Check tab shows it, and marks its results stale as soon as the head moves on.
- **Lint, the solver and the playtests run on the processing worker (4.2.2)**, with the game's own commands (before,
  a hosted Studio ran them on the data it read back, without them); the solver is bounded to 45 s there.

- **The game's health by revision, and the revision that broke it (4.2.2)**: a hosted Studio's header says the
  verdict at a revision (the validator, then the solver from a new game, on the processing worker, after each burst
  of changes). When a revision fails where the last judged one passed, a bisection names the first failing revision,
  with what its operation did and its files, in ⌈log₂ n⌉ checks; a dev can ask for one (`POST /api/health/bisect`). A
  solver cut short says "unknown", never "valid".

- **Personal undo on a shared Studio (4.2.2)**: Undo and Redo come back on a hosted Studio, each member's own: their
  last operation is undone by a new revision (its files back to their content before), whatever the others wrote
  meanwhile; refused when another wrote one of its files since (409) or holds its span (423). A new edit drops the
  member's redo; the stacks are kept in the database.

- **Published builds (4.2.2)**: a hosted Studio's Play tab publishes the head as an immutable, numbered build of the
  player's game, served at `/play/<n>/` on the game's origin; `/play/` is the last green build (its revision judged
  valid). Each build's manifest (revision, engine, snapshot and file hashes) is signed with the Studio's job key; an
  owner can rebuild one fresh and compare it byte for byte. `publicBuilds` (off by default) opens `/play/` without a
  session.

- **The asset tools on the processing worker, qualified (4.2.2)**: their Python packages are locked with hashes for
  Clever Cloud's native runtime (`ops/studio/worker-requirements.lock`) and installed by the worker's build hook
  (STUDIO-SERVER gives the variable); measured on the spike's worker: 7 s to install, 4 s for a full `prepare` of the
  sample game (`docs/dev/QUALIF-4.2.2-ASSETS.md`).

- **Prepare assets on a hosted Studio (4.2.2)**: the Play tab's "Prepare assets" (a dev) runs `prepare` on the
  processing worker from the head's art and sounds, under the project's exclusive lease; the prepared set is kept by
  the Studio and served before `publicDir`, and the game's `assets.gen.json` is written as one operation. Sprite sheets
  and uploads stay on a local Studio (4.2.3).

- **Backup, restore and the journal shipped (4.2.2)**: a hosted Studio ships each confirmed operation to the bucket
  (`/readyz` gives the RPO); `studio-server backup` writes the project's tables in one snapshot, `restore --replay`
  brings them back into an empty database then replays the journal shipped since, each operation checked against the
  head it continues (`replay` resumes a replay that stopped); `gc` lists (and with `--delete`
  deletes) the blobs no row names and the worker's old staging.

- **The gates of 4.2.2**: two human passes asked from 4.2.2 on, `studio-preview` (people play the shared revision of a
  hosted Studio without a dev server, carry a save across revisions, read the health chip, undo their own work,
  publish a build) and `studio-assets-hosted` (prepare on the worker, its set played); a mutation set
  `studio-workshop` (undo, health, previews, builds, prepared assets, backup, the journal shipped, the collection),
  measured until its survivors are read.

## 4.2.1 — 2026-10-18

"Shared Floor" (LOG #188–#205): the Studio online for a team, the first of three 4.2.x steps (D40). One game per
server, several people at once: they log in through an OpenID Connect provider (Keycloak or another), get a role in
the Studio, and edit the same game live, each change one operation of a durable journal, each part of the game held
by one member at a time. The game's code runs in a separate processing worker that holds no secret, and the game is
played on its own origin, apart from anyone's Studio session. It is deployed as two native Node.js applications on
Clever Cloud with PostgreSQL and Cellar, from the repository or from the new `web-scumm-studio-server` archive. It
is **experimental** until its two people's passes are made (`studio-hosted`, `studio-collab`): the game in the Studio
is a live preview, not frozen at a revision (per-revision previews come in 4.2.2), and a real Safari has not tried
the game's frame yet. Nothing a game or a player uses changed: the public API, the content format and the save
envelope are 4.2.0's (D40). An author may notice that the Studio and the tools that write a game need Node 22.13+
(their writes go through the journal, in SQLite) and refuse an edit that would add a validation error
(UPGRADING §34). The tag is signed with the maintainer's SSH key on their yes of 18 October (D37).

### Fixed

- **The e2e run tolerates WebKit's "Context is stopped"** during its teardown (WebKit stopping its context as the run
  ends, a Cache API call cut short): reported as a warning, as `e2e:pwa` does since 4.1.20, only for an error that
  came after every check passed, on WebKit, in that exact form.

### Changes

- **A plan to put the Studio online for a team** (4.2.1 → 4.2.3): `docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md`, behind
  OpenID Connect on Clever Cloud's native Node.js runtime, with ADR 0025 and decisions D39 to D41.

- **The Studio's operation core moves to `studio-server/src/ops/`** (4.2.1, neutral). `core.ts`, `source.ts`,
  `apply.ts` and `errors.ts` leave `tools/studio/` for the Studio Server's package, where the transactional operations of
  the next pull requests grow. Nothing an author sees changes: the dev server, the MCP server, `npm run studio-apply`
  and the demo Studio run the same code from its new place. The browser Studio now names its API through one constant
  (`src/studio/api-base.ts`) instead of spelling `/__studio/api` in six modules.

- **Every Studio write is one journaled operation** (4.2.1). The files an edit touches are written together or not at
  all, durably, and an edit a crash interrupted is finished when the Studio opens again (`.cache/studio-journal/`).
  A change made outside the Studio (an editor, an agent, git) is recorded before the next edit touches that file;
  a file another process rewrote while an edit was prepared is a 409, never a lost write.
- **One guard for every edit, on the game as it would be** (4.2.1): text edits, layouts, new entities and voices are
  refused (422) when they would add a validation error, like structured values since 3.4. Nothing is written first and
  taken back any more.
- **Adding a prop, hotspot or actor is one step of undo** (4.2.1): the room and its layout come back together.

- **The authoring tools write a game through the Studio's journal** (4.2.1):
  - `npm run ids`, `i18n`, `voices` (import), `import-layout`, `provenance -- --lock`, `page:storyboard -- --md`,
    `prompts` and `remix` write their game files as one operation of the journal;
  - asset uploads (sheets, cells, decors, sounds) too. Backups and the cells a cut produced land together, or none
    of them;
  - a Studio open on the same game sees each operation, and a file it rewrote meanwhile is a 409.
  - The batch tools (`ids`, `i18n`, `provenance`) are journaled, not guarded: they rename paths, which changes the
    text of existing validation errors.
- **The placement editor saves through the Studio's API** (4.2.1): `PUT /__studio/api/room/<id>/layout`, one guarded
  operation. The dev server's `/__layout` route is gone; `layoutWriter()` stays exported as a deprecated plugin that
  does nothing.

- **`studio-server`, the Studio as a server** (4.2.1, first part; authentication comes next and it serves the loopback
  only until then). `studio-server serve --config <file>` serves the Studio's API under `/api/`, with:
  - the journal's cursor (`/api/revision`, `/api/ops?epoch&after`);
  - the probes `/livez`, `/startz` (started) and `/readyz` (serving writes);
  - a service lease so that one instance serves the writes;
  - operation ids from the client (`x-studio-op`): a retry gets the same answer and is applied once.

  Other commands:
  - `studio-server import <dir>` makes a game the instance's project;
  - `studio-server export <dir>` writes the game at its head with a manifest of hashes.

  On Postgres and an S3 store (Cellar), the database and the blobs are the truth and the instance's folder is rebuilt
  at start and checked every 30 s.

- **The Studio Server behind OpenID Connect** (4.2.1).
  - **Login:** with Keycloak or any OIDC provider (Authorization Code + PKCE). The rights live in the Studio: owner,
    dev or reviewer, given by one-time invitations to a verified email (`studio-server invite`, `POST
    /api/invitations`). The owner's routes: members, roles, sessions, audit.
  - **Mutations:** a mutation from the browser needs the exact `Origin` and the `X-Studio-Request` header. The CLI and
    MCP use Bearer access tokens for the Studio's audience, obtained with `studio-server login --server <url>` (device
    flow).
  - **Access ends:**
    - at the next request when a member is removed;
    - at once on the provider's back-channel logout;
    - within 15 min when the provider disables the user, or when it stays unreachable (the session is then
      suspended until it answers).
  - **Without OIDC:** the server stays on the loopback.

- **A hosted Studio never runs the game's code itself** (4.2.1, ADR 0028).
  - **With OIDC**, validation and the loads behind the Studio's reads run in `studio-worker`, a separate application
    with no secret of the platform. Configure `worker: { url, instance }` and the secret `STUDIO_WORKER_KEY`; create
    the keys with `studio-server worker-keys --out <folder>`. The worker needs `WORKER_PUBLIC_KEY` and
    `WORKER_INSTANCE`.
  - **Captures** are unavailable on a hosted Studio for now.
  - **Without OIDC** (the local server, on the loopback), nothing changes.
  - A game that imports files outside its own folder cannot run on a hosted Studio.

- **Working together on a shared Studio** (4.2.1).
  - **Each file has a span:** a room (its code and layout), a language, the story, the items, and so on. A write
    takes the spans it touches. If another member is editing one of them, the write is refused (423) with their
    name, and the client keeps its draft. A lease lasts 2 min and is renewed by the heartbeat
    (`POST /api/presence`). Members can take spans ahead (`POST /api/leases`) and release them.
  - **Owners** can take a span over (audited) and take the whole game for an exclusive change.
  - **`GET /api/events`** streams every revision (with its files and spans), the leases and who is here. A stream
    closes as soon as its member is removed or logged out, or when its token ends.
  - **Undo** is not available on a shared Studio until 4.2.2.

- **The game runs on its own origin** (4.2.1): a hosted Studio serves everything that runs the game on `playUrl`, never
  on the Studio's origin. The Studio opens it with a one-time ticket (`POST /api/play-ticket`). The game's access ends
  at the next request when the member is removed or their Studio session ends.

- **A guide to put a Studio online** (4.2.1): `docs/en/STUDIO-SERVER.md` (French: `docs/fr/STUDIO-SERVER.md`) deploys
  the Studio Server and its worker as two native Node.js applications on Clever Cloud, with PostgreSQL, Cellar and
  Keycloak or another OpenID provider. An example configuration (`ops/studio/studio.config.example.json`), a test
  Keycloak realm (`ops/studio/keycloak/realm.json`) and an optional local stack (`ops/studio/compose.yml`) come with
  it. `npm run studio-server` and `npm run studio-worker` start them; `serve` also takes its configuration from
  `STUDIO_CONFIG_JSON`.

- **The hosted Studio is tested against a real Postgres and S3 in CI** (4.2.1): a `studio-hosted` job runs its hosted
  tests on every change to the Studio Server; its code counts in the coverage, with floors on its trust boundaries.

- **The Studio Server's journal is held by mutation testing** (4.2.1): the set `studio-ops` (the journal, its durable
  writes, the spans) is gated, every surviving mutant killed by a test or named.

- **The Studio Server's trust boundaries are held by mutation testing** (4.2.1): the set `studio-auth` (the gate,
  the OpenID client, the routes and store of authentication, the spans' leases, the game's origin) is gated, every
  surviving mutant killed by a test or named.

- **The Studio Server is tested against a real Keycloak in CI** (4.2.1): a login through Keycloak's own form, the
  identity it gives, a back-channel logout Keycloak sends, and a user an admin disables.

- **The hosted Studio opens in a browser** (4.2.1): the Studio Server serves the Studio's page
  (`npm run studio-client` builds it; `CC_POST_BUILD_HOOK` on Clever Cloud), which talks to `/api` and logs in
  through the provider. The game runs on its own origin as a live preview (Vite behind the game's session, not frozen
  at a revision): the Rooms editor and the Play tab open there with a ticket, and the editor hands its layout to the
  Studio, which writes it as the member. Undo, the Assistant and the Assets tab are not on a hosted Studio yet; the Play tab's
  inspector panels need the local Studio. New optional settings `publicDir` and `clientDir`
  (`docs/en/STUDIO-SERVER.md`).

- **The Studio Server as a release archive** (4.2.1): `web-scumm-studio-server-<version>.tgz` carries the commands
  `web-scumm-studio-server` and `web-scumm-studio-worker`, the Studio's page already built, and its own dependencies
  (their versions locked in its `npm-shrinkwrap.json` and SBOM for an install from the registry; from the archive file
  npm resolves them from their ranges, and `web-scumm-studio-server deps` says what an install resolved). Install it beside the engine of the same version
  (`docs/en/STUDIO-SERVER.md`, "From the release archives"). Two people's passes join the sheet from 4.2.1:
  `studio-hosted` (a real Clever Cloud deployment, a real Safari) and `studio-collab` (three people, a cut, a redeploy).

- **The shared Studio's screens** (4.2.1): on a hosted Studio, a visitor sees a login page and someone who is not a
  member sees "access not granted", with nothing of the game; a session the identity provider has not confirmed for
  15 min shows "identity provider unreachable". In the header: the exact revision the editors and reads are at, who is
  here and where, and your name with the spans, the members (owner) and the logout. A write refused because another
  member holds its span (423) or because its file changed (409) keeps the draft to copy and try again; an owner may
  take a span over. The owner's Members screen changes roles, removes members, ends sessions, makes invitation links
  and shows the audit log. A cut of the connection is shown, and what was committed meanwhile is read back from the
  journal; a write cut off is sent again with the same id and applies once. A note's author is the session's.

## 4.2.0 — 2026-10-16

"Stable World" (LOG #185–#187): 4.1.20's code, the version changed (plan 4.1.20 §12, D34), one Field Kit fix, and
`ship preflight-stable` reading the reduced verdict below. It
restores strict SemVer: from 4.2.0 a minor adds, a major removes. **It ships before the people's passes** (D38, the
maintainer's decision): none of the thirteen (#75–#87) was made, so 4.2.0 promises as stable only what needs none,
the content format and its tools, the desktop Chromium PWA and the Bridge on SQLite, and says every other surface
limited or experimental ([GO / NO-GO 4.2](docs/dev/GO-NO-GO-4.2.md): GO on a reduced scope). The passes are made on
`v4.2.0` itself; promoting a surface in a 4.2.x needs its pass on that 4.2.x (D38). The tag is signed with the maintainer's SSH key
(D37) and the release is immutable. npm publishing moves to a later 4.2.x: it needs the maintainer's 2FA at each
step. `v4.2.0-rc.1` carried the defect below; `v4.2.0-rc.2` was the campaign's candidate, no pass used either.

### Fixed

- **`field:check` and `field:report` work on a folder fresh from `field:init`** (4.2.0): `field:init` writes the
  candidate's surfaces and site files beside the thirteen reports (4.1.20), and the two read them as reports, so the
  first check of every pass failed and `field:report` wrote nothing. Found trying the commands on `v4.2.0-rc.1`'s
  candidate before any pass began; the test folder now holds what `field:init` writes.

### Changes

- **The README installs from 4.2.0's release archive** (4.2.0): `releases/download/v4.2.0/web-scumm-4.2.0.tgz`.
  `docs:truth`, `quality:baseline` and `readme-quickstart` still accept a `v<version>-rc.N` release for this
  version's archive and nothing else, for the next campaign that needs one.
- **`ship preflight-stable` reads "GO for 4.2 on a reduced scope"** (4.2.0, D38): the maintainer's decision to ship
  before the passes is not a GO, so no report contradicts it; a plain GO the reports contradict still blocks, and
  `tests/support-truth.test.ts` accepts the reduced verdict only with D38 written.

## 4.1.20 — 2026-10-15

"Last Mile" (LOG #184): no new mechanic; the last 4.1.x release with code before 4.2. A Bridge backup is schema 4 and
says whether it holds the whole store, the quota included, under a digest of its whole envelope (ADR 0023). A restore
names its mode, `merge` or `replace-store`, and runs only with the store to itself under a maintenance lease
(migration 0005); `replace-store` writes a verified safety backup first. The last two measured mutation sets,
`connectors-edge` and `reality-store-postgres`, gate, in shards from one matrix. Every candidate a tag may name runs
the full qualification profile on its own archives and image, and three loads per store. A people's pass is bound
to the files of its surface and carried to a later candidate only when none changed, the version included (ADR
0024). A release is a draft first, then immutable; 4.2's tag signing, preflight and npm runbook are rehearsed without
publishing. [GO / NO-GO 4.2](docs/dev/GO-NO-GO-4.2.md): NO-GO, the people's passes run on the `4.2.0-rc` candidate.
Dated the day its final candidate froze; the tag's own date is in the release notes.

### Breaking

- **`restore` says its mode** (4.1.20): `bridge restore` without `--mode` restores nothing. `--mode=merge` is 4.1.19's
  restore unchanged. `--mode=replace-store --yes-replace-store --safety-out=<new file>` makes the store the backup,
  after a safety backup of the store, written and checked first (`docs/en/UPGRADING.md` §32).

### Fixed

- **A connector no longer crashes on an unexpected rejection** (4.1.20): the badge and email connectors' bookkeeping
  of requests in flight, the IMAP poll's timer, the SSH password login and the `/health` handler each catch a
  rejection now. A pairing that throws refuses the SSH login, and a `health()` that throws answers 503. None of them can be reached under today's contracts.
- **A secret that is not a string is refused at start** (4.1.20): an inline `secret`, `password` or `bridge.token`
  written as a JSON number or object used to be accepted, and then every request failed with a 500.
- **The IMAP client closes its socket after a greeting that is not OK** (4.1.20): it used to stay open until the
  server hung up.
- **A stopping Telnet connector reads nothing more** (4.1.20): in the second before its sockets are destroyed, bytes a
  client still sends are no longer read, even if the connector starts again. `docs/en/CONNECTORS.md` says that
  `/health` answers 503 when unhealthy and that an inline secret must be a string.

### Changes

- **Dependencies of 11 October** (after 4.1.19): Playwright 1.64, the MCP SDK 1.32.1, knip 6.40, `cross-env` 10 (a
  CLI here; Node 20+, which the project's 22.12 meets); the workflows' actions pinned to `checkout` 7.0.1,
  `setup-node` 7.1.0, `upload-artifact` 7.0.2, `download-artifact` 8.0.2 (a hash mismatch now fails, as the release
  wants) and `attest-build-provenance` 4.2.2 (a wrapper on `actions/attest`), each SHA checked against its tag.
- **`@types/node` stays on the oldest supported Node** (22): Dependabot no longer proposes its majors; Node 26's types
  reject code that is right on 22.

- **4.1.20 "Last Mile" planned** (4.1.20): `docs/dev/PLAN-4.1.20-LAST-MILE.md` (French) and D34–D36 set out the last
  4.1.x release with code. Its PRs plan to make the two measured mutation sets gating, have the candidate qualify the
  exact archives and image it publishes, give a Bridge backup its completeness and restore two explicit modes, carry a
  human pass only across identical artefacts, and rehearse 4.2's signature and npm publication. The field campaign
  moves to the 4.2.0 release candidate.

- **The Bridge's backup code is split by responsibility** (4.1.20): `bridge/src/backup/` holds the file's schema, its
  canonical form, its bounded and atomic files, the snapshot and the restore, with `index.ts` as the public face. No
  behaviour changes: a test pins the messages a refused file gets, the command line's codes and lines and a backup's
  canonical form, and it passes before and after. The layers test now walks the Bridge's sub-folders.

- **The Postgres adapter's mutation set gates, judged on a real Postgres** (4.1.20): `reality-store-postgres` joins the
  gated sets, with 40 of its 41 mutants killed and the last named as equivalent. Its tests each get a database of their
  own and run one file after the other. CI's `bridge-postgres` job runs the set's eight files, not five.
- **Mutation in shards, from one matrix** (4.1.20): a long set runs in shards (`--shard=i/n`), which are then merged
  into the set's report (`--merge`). The merge refuses a shard that is missing, doubled, cancelled or of other inputs.
  ci, the nightly, the candidate and the release run the matrix that `tools/mutation-shards.ts` generates, and no
  workflow writes its own list of sets. `release.yml` refuses a tag whose commit generates none.
- **Every named survivor is an exemption with its terms** (4.1.20): each entry of `docs/dev/mutants.json` says its
  category, why, proof, owner and the version it is read again at. An incomplete entry or a version that has come
  fails the run.
- **A mutation run that cannot start says why** (4.1.20): it names each failed test and its first error.

- **A Bridge backup is schema 4** (4.1.20, ADR 0023): its digest covers the whole envelope, not only its rows. It says
  what it holds (`completeness`), and it carries the speedrun quota, which no backup carried before. Every SQL table is
  classified, so a future table cannot slip out of a "whole store" backup. Files of schemas 1 to 3 are still restored,
  with `--mode=merge`. The digest is an integrity check, not a signature.

- **A restore has the store alone, or nothing** (4.1.20, ADR 0023): from store schema 5 (migration 0005), `serve` and
  every writing command hold a maintenance lease in the store itself. `restore` and a migration down take the store
  alone. They are refused at once, naming who holds it, while anything else serves or writes. Leases run on the
  database's clock, and an expired lease is never in the way. On Postgres an advisory lock rides beside the lease, on a
  connection of its own (`--lock-timeout`). A `serve` that loses its lease holds its writes (503) and fails `/readyz`
  until it takes one again. **Stop every Bridge older than 4.1.20 before the first restore** (`docs/en/UPGRADING.md`
  §32).

- **Every surviving mutant of badge verification read** (4.1.20): the 197 survivors of `connectors-edge` in
  `connectors/src/badges/verify.ts` (168) and `connector.ts` (29) were read one by one. 193 are killed by
  `tests/connectors-badges-edge-mutants.test.ts`, which checks each refusal's exact reason, the exact bounds of dates,
  counts, indexes and the cache, each shape a document may take, and what the badge form answers and rejects. The
  other 4 are named as equivalent in `docs/dev/mutants.json`: two key lookups whose forced branch gives the same null,
  and two fetcher options passed as `undefined`, which the fetcher reads the same as absent.

- **Every surviving mutant of the email connector read** (4.1.20): the 116 survivors of `connectors-edge` in
  `connectors/src/email/connector.ts` (70), `imap.ts` (40) and `parse.ts` (6) were read one by one. 109 are killed by
  `tests/connectors-email-edge-mutants.test.ts`, which checks the configuration, each refusal's exact reason, the sender
  links and their bound of 10,000, the webhook's answers, the IMAP pass (sizes, flags, retention, its timer) and every
  bound of the IMAP client byte for byte, against an in-memory IMAP peer. The other 7 are named in
  `docs/dev/mutants.json`: 4 equivalent and 3 unreachable.

- **Every surviving mutant of the terminal connectors read** (4.1.20): the 113 survivors of `connectors-edge` in
  `connectors/src/ssh/connector.ts` (44), `terminal/shell.ts` (32), `telnet/connector.ts` (25) and `terminal/guard.ts`
  (12) were read one by one. 111 are killed by `tests/connectors-terminal-edge-mutants.test.ts`, which checks the
  address gate and the session guard at each bound, the resume words and their bound of 10,000, every branch of the
  virtual shell, Telnet negotiation byte for byte, and both servers' authentication, sessions, closes and refusals,
  against fake sockets and fake ssh2 connections. The other 2 are named in `docs/dev/mutants.json`: 1 equivalent and 1
  unreachable.

- **Every surviving mutant of what the connectors share read** (4.1.20): the 62 survivors of `connectors-edge` in
  `connectors/src/run.ts` (28), `http.ts` (18), `registry.ts` (12) and `config.ts` (4) were read one by one. 60 are
  killed by `tests/connectors-rest-edge-mutants.test.ts`, which runs `web-scumm-connector` in-process (its arguments,
  `--config=`, the token from a file or inline, the manifest from a file or the Bridge, the tenant and limits, the
  health and metrics port and its 404s and 503), reads a body at its limit, the per-address budget at the minute and
  its sweep above 10,000 addresses, and builds each connector from the registry. The other 2 are named in
  `docs/dev/mutants.json`: 1 equivalent and 1 unreachable.

- **Every mutation set gates** (4.1.20): `connectors-edge` joins the gated sets, in 4 shards, and the measured list is
  empty. Its 488 survivors (12 October) were read family by family: 473 killed by tests, 15 named, each with its
  argument or its test.

- **The candidate qualifies exactly what it publishes** (4.1.20): a candidate started by hand, the only one a tag may
  name, runs the Bridge's full qualification profile on its own four package archives and image, for its own run.
  Its gate refuses anything less: the short profile, another commit or run, a step missing or failed, other archives
  or another image (`tools/release/candidate.mjs qualification`). A pull request's run keeps `--short`.
- **The qualification plays both restore modes under the maintenance lease** (4.1.20): a restore is refused at once
  while the three Bridges serve, then `--mode=replace-store` runs with them stopped, after its safety backup, and every
  player's signals and the board are compared. Its report (`ops-qualify.json`, schema 2) says the profile, the
  commit, the candidate run, the four archives' SHA-256 and the command that reproduces it. Each step has a stable id,
  its duration and its first defect.
- **One manifest of a release's files** (4.1.20, `tools/release/artifacts.mjs`): for each file, the job that makes it,
  its place in the candidate's manifest, its published name and its SBOM. `release.yml` checks its folder against the
  manifest before uploading and makes nothing the candidate made. `ship verify` refuses a release whose files are not
  exactly the manifest's. It gives back the 4.1.19 release file for file.
- **The Bridge image says how it was made** (4.1.20): its identity (schema 2) adds the OS, the architecture, the
  Docker engine and the buildx that built it, the archive's compression and size.
- **Load figures are medians of three** (4.1.20): the candidate loads each store three times. The median of the three
  p95 is compared with a baseline of the same runner and protocol (`docs/dev/baselines/load.json`). It raises an
  alert past 25 %, and fails only past the absolute budget (proposals under 1 s, the leaderboard under 2 s) or when
  all three loads are that much slower.
- **What a large backup costs in memory is measured** (4.1.20, `tools/backup-memory.ts`, the candidate's
  `backup-memory` job): backups of 64, 128 and 256 MiB on SQLite and Postgres, measured against the qualification
  container's 512 MiB. It records the peak memory of the candidate Bridge's export, read and restore, and their
  durations, and checks that one byte and one row above the bounds are refused.
- **A release download that meets a 5xx is tried again** (4.1.20): `external-consumer` and `readme-quickstart`, as
  `ops:qualify` already did. The connectors' end-to-end check draws its SSH host key until ssh2 reads it back.
- The baseline refuses a qualification of another commit (4.1.19's pointed at one of `43dac1b`) and records the
  medians and the memory measures. The README says "the four package archives" and which files the candidate makes
  and which the release makes.

- **A people's pass is bound to its surface** (4.1.20, ADR 0024). `docs/dev/surfaces.json` says what each of the
  thirteen passes reads: the candidate's files (the built site file by file), the checkout's configuration (the
  README's install section, now between generated markers in both languages) and the passes it depends on. Each
  exclusion has its reason and a test. The candidate writes and attests `qualification-surfaces.json`, and a file in
  no surface fails it.
- **The candidate builds the site once, and the release publishes it** (4.1.20): its archive, its assets manifest and
  the SHA-256 of every file it serves (`site-files.json`). `release.yml` publishes them, with the surfaces, and builds
  no site to publish.
- **`npm run field:carry`** (4.1.20) carries a pass to a new candidate when no file of its surface changed, the version
  included. It writes a `pending` CarryAttestation beside the person's report, which is never rewritten. The
  maintainer approves it in a commit signed with their key, judged by `.github/allowed_signers` as the source
  candidate holds it. `field:check` and `field:report` then count it as passed. `ci` refuses a pull request that
  changes the trust root together with an attestation.

- **A release is made as a draft, then published** (4.1.20). release.yml creates it as a draft, uploads every file,
  publishes it and reads it back. A run on a release already published stops and changes nothing, and a draft an
  earlier run left is made again. This is what immutable releases need, which the maintainer turns on from 4.1.20,
  with a ruleset on the release tags.
- **`ship verify` also asks GitHub** (4.1.20): `gh release verify` and `gh release verify-asset` for each file, from
  4.1.20 on, beside its own sums, attestations and list of files.
- **`ship preflight-stable --candidate=<run>`** (4.1.20) says what 4.2 stable still needs, check by check, and signs,
  publishes and changes nothing:
  - the signing key and `allowed_signers`;
  - immutability and the tag ruleset;
  - the candidate's provenance;
  - each npm package: its archive, name, bootstrap, stage-only trusted publisher, OIDC proof and version;
  - the publishing step's exact Node and npm;
  - GO / NO-GO against the reports.
- **4.2's tag signing, rehearsed** (4.1.20): `ship tag --sign` signs a 4.2 tag with an SSH key, and a 4.1.x tag stays
  annotated. Each candidate rehearses it with an ephemeral key: a signed tag never pushed, verified, then the key
  destroyed. The report goes into the manifest and the release.
- **The npm runbook** (`docs/en/RELEASING.md`, French in `docs/fr/`): exact pins (Node 22.23.3, npm 11.21.0), a
  bootstrap by staged publishing of a reservation version, stage-only trusted publishing, the two-day window, the 2FA
  promotion, and the dual-use classification of the connectors (not declared; staged with a 2FA promotion anyway). A
  nightly job that does not gate watches that the four npm names stay free.
- **The candidate's baseline reads every job, and retries** (4.1.20): `tools/release/run-jobs.mjs` reads every page of
  the run's jobs (a candidate runs more than 100), retries a 5xx or a 429, and refuses a listing that does not add up
  to its `total_count`. It replaces the one bare `gh api …/jobs?per_page=100` call.

- **The trust root is the maintainer's software key** (4.1.20, D37): `.github/allowed_signers` names `id_ed25519`,
  not the hardware key the plan named. A signature proves the key was used, not that the maintainer personally
  approved; an approval still needs the maintainer's explicit yes, and Claude never writes one. A rotation is its own
  pull request touching only `allowed_signers`.
- **`load.json` reseeded where the measure holds** (4.1.20): Postgres from the technical candidate's three-load
  medians; SQLite kept at 4.1.19's values, because one code measures 262–481 ms on these runners and the faster
  median would turn the next slow runner into a regression. Every replaced value stays under `previous`.
- **`replace-store`'s refusals all tested** (4.1.20): a `tenants-only` file and a file of an older SQL schema, each
  sealed as a Bridge would, are refused from the command line with the store unchanged, beside the schema 3 case.

## 4.1.19 — 2026-10-11

"Field Closure" (LOG #168): no new mechanic; it closes what 4.1.18's second reading found. A Bridge backup is one
snapshot and a restore all or nothing (schema 3, ADR 0021). The Bridge and the connectors ship with their locks; the
candidate builds the Bridge's image once, with its three identities, and five CycloneDX SBOMs, and the release
publishes them as made, with the baseline the candidate wrote of itself. A Field Kit bundle carries its candidate's
attested manifest and is checked from the bundle alone. Mutation sets are named for what they mutate; the four
connectors are played from their archives; the qualification profile covers the leaderboard. The README is rewritten
around three promises (create as data, the Studio, prove and ship) and its quick start is played from the candidate's
archive. The DSL window (D33) admitted nothing. [GO / NO-GO 4.2](docs/dev/GO-NO-GO-4.2.md): NO-GO, the people's
passes start on this release's candidate. The tag is not signed and nothing is published to npm (D30, D18).

### Breaking

- **`restore` into the JSON-lines journal is refused** (4.1.19): it could not be done all or nothing (`--force` used
  to delete then fail). Migrate the journal to SQLite (`migrate --from=jsonl --to=sqlite`), then restore.

### Fixed

- **The connector SDK no longer calls an answering Bridge unreachable** (4.1.19): a body `null` (or any JSON that is not
  an object) used to throw while it was read, and the proposal was retried then refused `unreachable`. It now reads
  as an empty answer. An acceptance without a valid sequence is sent again with the same key; if the Bridge never
  gives the sequence, the refusal is `bridge`. The log line is `signal.malformed-answer`.
- **The terminal connectors keep UTF-8 whole** (4.1.19): a continuation byte that continues nothing, or a byte that
  never begins a character, is dropped. A backspace after one no longer erased a column of the prompt. A character
  split between two network chunks stays whole.
- **The live RTA after a resume starts at 0 when the run had not started** (4.1.19): it used to count from the resume.
  Whether it had started is read from the replayed tape. Logical times, `.wsrun` and `rulesVersion` are unchanged.

### Changes

- **4.1.19 "Field Closure" planned** (4.1.19): `docs/dev/PLAN-4.1.19-FIELD-CLOSURE.md` (French) and D33. It closes
  what 4.1.18's second reading found: the Bridge's backup and restore, reproducible images and SBOMs, a Field bundle
  that can be checked on its own, mutation sets named for what they cover, and a baseline measured on the tagged SHA.
  The DSL keeps every existing name and meaning; additive elements may enter through a gate before the coverage PR.

- **A Bridge backup is one snapshot; a restore is all or nothing** (4.1.19, ADR 0021). `backup` writes schema 3: every
  tenant, run and daily record read in one read-only transaction, an envelope naming the backend, the Bridge and SQL
  schema versions, the counts and a SHA-256 of the payload, bounded (`--max-rows`, `--max-bytes`) and written to a
  temporary file then renamed. `restore` reads the file bounded, checks every row before opening the store (schemas 1,
  2 and 3), then writes tenants, runs and daily records in one transaction compared with the file before it commits:
  a failed restore leaves the store as it was and says "nothing restored". A daily record already held is now a
  conflict (refused without `--force`, replaced with it) instead of being kept silently.

- **`external-consumer` checks the older engine against its release's sums and a SHA-256 it knows** (4.1.19). The candidate creates a game on
  4.1.17, on 4.1.16, and on the pre-release 4.1.18-rc.1, then moves it to the candidate.

- **The Bridge and the connectors ship with their lock** (4.1.19): `npm-shrinkwrap.json` inside each archive, made
  from locks kept in the repository (`scripts/locks/`, `npm run locks`, every version the root lock's). An install
  of either archive resolves nothing. A lock that no longer fits its manifest stops the pack.
- **The Bridge's qualification image is reproducible and traceable** (4.1.19):
  - `npm ci` from the image's own lock, with `pg` and OpenTelemetry's API at exact versions;
  - built once by the candidate and saved with its config digest, OCI manifest digest and archive SHA-256;
  - loaded and checked by `deployment-smoke` (`ops:qualify --image-from=`), then published by the release as it was
    qualified, with its identities and SBOM.
- **Five CycloneDX SBOMs, made by the candidate** (4.1.19): one each for the engine, `create-web-scumm`, the Bridge,
  the connectors and the image. Each is made from what its archive holds, and the release no longer installs anything
  to make one. `web-scumm-<tag>-sbom.cdx.json` keeps its name but now describes the engine package (its dependencies
  as a game installs them, Vite and its tools included), no longer the repository root's five runtime dependencies. The
  image's SBOM names the Bridge and its base image too.
- **The qualification proxy runs unprivileged** (4.1.19): Caddy runs as the operator's uid, read-only, with bounded
  tmpfs. The worker's image is pulled by its digest.

- **A Field Kit bundle can be checked by someone who holds only the bundle** (4.1.19, schema 2). It now carries the
  candidate's manifest and that manifest's provenance attestation, which the candidate's gate signs from 4.1.19.
  `npm run field:verify-bundle` reads the archive itself under budgets: links, devices, `..` and absolute paths
  refused, at most 16 MiB a file and 64 MiB in all. It checks every file and the report against its candidate, then
  says who made the manifest: offline against a trusted root saved once, or online by the attestation and the run read
  now.
- **Bundled evidence keeps the path its report names** (4.1.19): 4.1.18 wrote `evidence/evidence/…`.
- **Evidence is bounded** (4.1.19): `field:check` says when a file or a report's evidence passes what a bundle may
  carry.
- **FIELD (en/fr) says the leak scan is a hygiene barrier, not a proof** (4.1.19).
- **`ship` and the Field Kit share one provenance contract** (4.1.19, `tools/release/provenance.mjs`): the manifest
  read strictly, digests, attestation (offline or online) and the run.

- **The Bridge's qualification profile covers the leaderboard too** (4.1.19, `npm run ops:qualify`, `ops/qualify/`). It
  now checks, in the HTTPS, three-instance, Postgres topology:
  - Daily and Mystery across instances;
  - a run verified by the speedrun worker, its duplicate refused, and moderation by a token file;
  - an instance killed while its worker verifies, with the run taken by another instance and verified once;
  - one submission quota shared by the three instances;
  - the board after 20 000 runs;
  - a schema 3 backup with runs and daily records, restored after the topology and its database are destroyed;
  - a store made by the published 4.1.17 Bridge, read by this one.

- **Mutation sets named for what they mutate** (4.1.19).
  - `connectors` becomes `connectors-pure`: the SDK, the MIME reader, the line editor, the virtual disk, and the badge
    crypto and fetch. The old name still works until 4.2.
  - Two new sets, measured every night but gating nothing yet: `connectors-edge` (configuration, email, badge
    verification, the terminal's guard and shell, SSH, Telnet) and `reality-store-postgres` (the Postgres adapter).
  - MUTANTS, TOOLS and ROADMAP now say exactly what each set covers.
- **The four connectors are played from their archive** (4.1.19, `npm run connector-archive-e2e`, a candidate job):
  - email by webhook and by IMAP;
  - Telnet, with UTF-8 and an over-long line;
  - SSH, with a backspace, the virtual disk and a wrong password;
  - Open Badge, with a valid `did:key` credential, an invalid one and a private address refused.
- **The Vite configuration no longer loads the Studio** (4.1.19). The dev server loads the Studio itself, and the demo
  snapshot is built in a process of its own.
  - The configuration loads 7 modules besides itself, instead of the whole Studio and engine.
  - Vite's 500 warnings about imports without a file extension are gone.
  - Where Node strips types, the native configuration loader can load it.
  - The player's bundle is the same, byte for byte.
- **Known flakes are now observed, not retried blind** (4.1.19):
  - an SSH test key pair is checked whole, and kept when refused;
  - a browser error now reports its kind, stack, page and arguments;
  - Biscuit's first call is warmed up and each verdict is timed.
- `external-consumer` and the new archive script share `scripts/lib/archive-harness.mjs`. Each step has an id and a
  duration, and a failure names the step and the command that reproduces it.

- **The README rewritten around three promises** (4.1.19): create a game as data, shape it in the Studio, prove and
  ship it. The first screen is the game, the Studio and a quick start; Reality, Remix and speedrun come after.
  - Captures of this release from the real player and Studio (`docs/img/readme/4119-*`, `npm run docs:screenshots`).
  - A maturity table that agrees with SUPPORT and the GO / NO-GO (`tests/readme-truth.test.ts`).
  - The quick start names Python 3 with Pillow, which `npm run assets` needs; `npx web-scumm doctor` replaces an
    `npm run doctor` that a created game does not have.
- **The README's quick start is played from the candidate's archive** (4.1.19, `npm run readme-quickstart`, a
  candidate job): its lines as written, in a folder outside the repository. After the tag, `--published` checks that
  the README's URL answers with the SHA-256 the release lists.
- **The release publishes the baseline its candidate wrote** (4.1.19, `tools/release/baseline.mjs`):
  `web-scumm-<tag>-baseline.json` and `.md`, read from the candidate's own jobs, in its manifest and attested. A
  measure the candidate did not make is written as such.

## 4.1.18 — 2026-10-10

"Dress Rehearsal" (LOG #160): no new mechanic; the rehearsal of 4.2 "Stable World". The people's passes become
reports bound to the candidate they tried (the Field Kit, `npm run field:check` and its siblings), each an open `field-pass` issue the
maintainer closes once made. `connectors` and `reality-store` join the gated mutation sets (322 survivors read; an SSH
backspace bug found). The candidate packs the four archives once, installs them outside the repository on Ubuntu,
macOS and Windows, and the release publishes those very files, the connectors' archive included. The Bridge has a
reproducible qualification profile (`ops/qualify/`) that the candidate kills with proposals in flight, destroys and
restores. [GO / NO-GO 4.2](docs/dev/GO-NO-GO-4.2.md): NO-GO today, every people's pass still to make. The tag is not
signed and nothing is published to npm: both are 4.2's (D30, D18).

### Fixed

- **`web-scumm build` on Windows in a folder named in its 8.3 short form** (4.1.18): a project under
  `C:\Users\RUNNER~1\…` failed (Rolldown refused the page's name, a path between the short and the long form); the
  CLI and the Vite config take real paths. **`scripts/pack.mjs` on Windows**: esbuild by its API, npm through the
  shell. Both found by installing the archives on Windows.
- **A Bridge backup carries the leaderboards and the daily challenge** (4.1.18): `backup` wrote the tenants only, and
  a restore lost every run and every Daily or Mystery token; it is schema 2 now (`runs` and `daily_kv`, on a SQL store),
  schema 1 still restores, and a restore over existing runs needs `--force`.

- **Backspace in an SSH terminal erases a whole character** (4.1.18): on a pty, deleting after a multi-byte UTF-8
  character (`é`) left its lead byte behind (`aé` then backspace gave `a�`): the loop looked at the byte left in the
  buffer, not the one it had just removed. Found by the connectors' mutation reading.

### Changes

- **The Field Kit** (4.1.18, FIELD): a people's pass is a JSON report bound to the candidate run it tried (commit, run,
  the SHA-256 of every file it judged), with four statuses never merged (`not-run`, `blocked`, `failed`, `passed`).
  `npm run field:init` writes the thirteen passes at `not-run`; `field:check` refuses a report of another candidate,
  evidence whose SHA-256 changed, a `passed` without its time, operator, environment, scenario or evidence, two reports
  of one pass, a field the schema does not name, and a key, a token, an address or a bearer; `field:report` generates
  the sheet's people's passes; `field:bundle` packs a report and its listed evidence, logs redacted, refused on a key.
  The release notes count only `passed` as done.

- **The four archives installed as a third party installs them** (4.1.18, plan §7): `npm run external-consumer` reads
  the archives (names, versions, licences, binaries, exports, no `file:` dependency, no checkout path), moves a game
  made on 4.1.17 to them (migrate, verify, build, its 4.1.17 save and a new game played to the end through
  `web-scumm/testing`), runs `create-web-scumm`, serves the Bridge from its archive (SQLite, and Postgres), and plays a
  connector scenario through it (a pairing code from the Bridge, a signed letter accepted, the same one a duplicate, a
  forged signature refused). Portable (Node's own APIs, npm through the shell on Windows); CI runs it on Ubuntu, macOS
  and Windows.
- **The candidate packs the packages once, and the release publishes those** (4.1.18): `candidate.yml` packs the four
  archives, installs them outside the repository on Ubuntu (Node 22 and 24), macOS and Windows, and names each in its
  manifest; `release.yml` publishes the candidate's archives after checking their SHA-256, never packs again, and
  attaches `web-scumm-connectors` too (until now it was packed but not published).

- **`connectors` and `reality-store` are gated mutation sets** (4.1.18, D32): their 322 survivors (204 and 118) read
  one by one, each killed by a short test (`tests/connectors-*-mutants.test.ts`, `tests/reality-store-*-mutants.test.ts`)
  or named in `docs/dev/mutants.json` with its reason. Every set is now a job of its own in ci, the nightly, the
  candidate and the release; `release.yml` asks the tag's own `GATED` which sets it gates.

- **The Bridge's qualification profile** (4.1.18, `ops/qualify/`, REALITY-OPS): an HTTPS proxy (Caddy), three Bridge
  instances built from the `web-scumm-bridge` tarball, one Postgres, two tenants; every image pinned by digest, the
  Bridges read-only and unprivileged with their tenants mounted read-only, the database password and URL as secret
  files, Postgres never published. `npm run ops:qualify` brings it up, kills an instance during proposals, holds a
  stream on another, checks the tenants apart, then backs up, destroys the topology with its database and restores it
  (`ops-qualify.json`). The `distributed` profile stays experimental until the 24–48 h pass behind a real domain.
- **`BRIDGE_STORE_FILE`** (4.1.18): the store's URL read from a file, so a database password is a secret file, never an
  environment value a process listing shows.

## 4.1.17 — 2026-10-09

"Stabilization" (LOG #155): no new mechanic; the release truth green again and every gate it rests on closed. A tag
stands on one candidate run: `candidate.yml`, started by hand on the exact commit, runs its jobs in parallel (the heavy
suite three times from cold, the load on SQLite and on Postgres, the five gated mutation sets, the worker's container)
and its last job judges them all and writes a manifest of its artefacts with their SHA-256; `ship tag --candidate=<run>`
checks it and `release.yml` publishes those artefacts after checking each digest. The leaderboard is ranked by the store
before its limit (each pseudonym's best, canonical times), admission and quota hold for every instance together, a
code wheel's result is computed again from its answers (D31, ADR 0020), `remix`, `speedrun` and `runs` are gated
mutation sets, the player has a Mystery world, a run resumes in every world, the worker runs in a documented container
and `bridge serve` moderates with a token file. The tag is not signed: deferred to 4.2 (D30).

### Fixed

- **The candidate's gate fails when a job it judges failed** (4.1.17): its step piped the verdict into `tee` under
  GitHub's default `bash -e`, without `pipefail`, so `✖ mutation: failure` was printed and the gate passed (candidate
  37998053206; the run itself stayed red, and `ship tag` and `release.yml` require a green run, so no tag could stand on
  it). Every step piped into `tee` runs under `shell: bash` now, and a test refuses one that does not.
- **The test of a worker writing too much asks its reason** (4.1.17): a worker that exits before its SIGKILL lands
  leaves a cut answer, also `crash`, so the mutant that forgot the cause survived on some runs.

- **The nightly's SQLite load measures SQLite** (4.1.17): its row set `BRIDGE_STORE=""` and `bridge:load` kept the
  empty string (`??`), so SQLite was never opened and the missing report failed nothing. Each store is now a job of its
  own with `--store=`; the report names the backend the store object is and the commit, and
  `tools/load-report.ts` fails a report that is missing, incomplete or of another backend.
- **One job per mutation set** (4.1.17): the 4.1.16 nightly ran the gated sets, then `reality-store` in the same job,
  which reached the job's 90 minutes and was killed after `core` and `reality` had passed. The nightly, ci (`full-ci`)
  and the candidate run each gated set in its own job; `reality-store` has its own budget. The mutation reports are
  kept with the run (`.cache/` was left out of every upload until now: hidden files).
- **`upgrade-check --from=v4.1.15`** downloads `v4.1.15` and `web-scumm-4.1.15.tgz`, not `vv4.1.15` and
  `web-scumm-v4.1.15.tgz`; a pre-release takes its tarball's name without the suffix (4.1.17).

- **The no-op memo keys a parked character by its room and bag, not its pixel spot** (4.1.17): `guests()` reads every
  parked player, and `players:<id>` was valued with its position, which the search's own dimensions leave out; the
  memo kept one entry per spot and missed. The demo's proof runs 56 588 engine tries instead of 69 958 (136 176
  without the memo: a gain of 2.41, where 4.1.15's content had brought it to 1.95 and the nightly's `memo` test red).
  Every result is the same; `memoVerify: 1` checks every skip.

- **A leaderboard never loses a faster run** (4.1.17): the store returned the first 10 000 runs by submission and the
  queue ranked those, so a faster run submitted after them was missing (reproduced with 10 001 rows). The store now
  ranks: each pseudonym's best, ordered by time then submission then id, equal times sharing a rank, then the limit
  (100 lines, `&limit=` up to 1 000). The memory store, SQLite and Postgres answer the same.
- **A ranked time is canonical** (4.1.17): `"00042"` and `"42"` were two times; the worker's time is kept as decimal
  digits without leading zeros (at most 30), ordered as a decimal past `Number.MAX_SAFE_INTEGER`.

- **The speedrun queue's room holds for every instance together** (4.1.17): an instance counted the waiting runs,
  then wrote; two instances seeing 99 of 100 both wrote. `RunStore.admit` says `created`, `duplicate` or `full` in
  one step (a transaction under the tenant's lock), and counts runs waiting **or being verified**.
- **The submission quota holds for every instance together** (4.1.17): each process kept its own buckets, so three
  instances gave a client three quotas. `bridge serve` on a SQL store keeps one bucket per client in `run_quota`
  (migration 0004), keyed by an HMAC of the address (never the address), its secret derived from the tenant's event
  key; a refusal says `Retry-After`. A library host keeps the per-instance `MemoryLimiter` unless it passes a
  `SqlLimiter`.

- **A worker that writes too much is said so** (4.1.17): its answer over 1 MB is killed, and the queue read the kill's
  signal as a timeout (`inconclusive`, `timeout`); it is `inconclusive`, `crash`, "the worker wrote too much". Found by
  the mutation run of the new `runs` set.

### Changes

- **A tag stands on a candidate run** (4.1.17, plan §4.2): `gh workflow run candidate --ref main -f sha=<sha>` runs
  release-check, the heavy solver suite three times on new runners, the load on SQLite and on Postgres, the four
  runtimes and each gated mutation set, side by side; `candidate-gate` judges them all (a skipped job is red) and
  writes `candidate-manifest.json` (the SHA, the run, the SHA-256 of each file for the release). `ship tag … 
  --candidate=<run id>` refuses a run that is not a green candidate of that SHA and writes the run into the tag;
  release.yml checks that run's files against their sums and publishes them. `npm run release-check:local` is the part
  a machine can run.
- **The release carries the runs it was tested with** (4.1.17, the 4.1.16 plan's §11.3): Story, Remix Fixed, Remix
  Random, Daily and Mystery `.wsrun` files from `e2e:remix-speedrun --out`, 4.1.15's schema 1 run, their manifest
  (schema, world policy, rules version, test key, commit, the verdict this engine gives), the check's report and the
  candidate's manifest. The Daily and Mystery tokens in them are signed with the published test key: demonstration
  fixtures, not attestations.

- **`npm run test:heavy` runs one file after the other** (4.1.17): the partition test's four workers had to share the
  runner with eight other files, and its one 600 s budget for eight searches ran out. Each game and configuration is
  now a test of its own with its own budget, so an overrun names its configuration.
- **`npx tsx tools/oracle-case.ts --case="<id>" --out=<file>` and `--diff <before> <after>`** (4.1.17): one case of the
  solver's oracle in full, and the difference of two runs by meaning (fields, first session entry, flags added,
  removed or reordered, reachable states, engine, Node and options). The oracle's fixture keeps digests only.

- **Bridge schema 3** (4.1.17, `bridge/migrations/0003`): the ranked times of 4.1.16's rows brought to the canonical
  form, a value that is not a decimal set aside (its time removed, its trust untouched, said in its reason), and the
  index the ranking reads. `bridge migrate --schema=2` undoes the index only. Upgrade every instance of a tenant
  together: a 4.1.16 instance still running beside a migrated store would write times as they came.
- **`npm run runs:load`** (4.1.17): the leaderboard at 100 000 runs on SQLite or Postgres: p50/p95 latency, resident
  memory, the SQL plan; a bound passed fails it. The candidate and the nightly run it on both stores.
- The leaderboard says what it ranks: each **pseudonym**'s best (the Bridge knows no player identity).

- **A minigame's result can be proved** (4.1.17, D31, ADR 0020): the code wheel records its answers (by their place
  in the author's list, so a translation keeps them) and the wheel's hash beside its result (`SessionEntry.mgt`); a
  replay generates the wheel again from the world, judges the answers and stops on another result — the verifier
  says `invalid-replay`, `minigame-transcript`. A speedrun category asks for it with `codeWheel.proof: 'transcript'`
  (`code-wheel-proof`: the word `won` alone is refused). The reference chapter's new category `wheel-proved` wants the
  wheel won and proved; its other categories, and every 4.1.16 run, keep their meaning.
- **A printed wheel is not seen** (4.1.17): a category with `codeWheel.medium: 'physical'` whose run played the wheel
  is `valid-unranked` (`physical-wheel-unwitnessed`) until a moderator ranks it.
- **API** (4.1.17): `CodeWheelTranscript`, `MinigameTranscript`, `MinigameOutcome`; `Presenter.minigame` may resolve
  with `{ result, transcript }` (widened, an implementation returning a result alone is unchanged).
- SPEEDRUN en/fr says what `replay-valid` proves and what it does not (a person, a printed wheel, the RTA).

- **Bridge schema 4** (4.1.17): the table `run_quota`. `runs.perMinute` in a configuration's `runs` section.
- **The mutation set `runs`** (`bridge/src/runs.ts`, `runs-store.ts`, `runs-limiter.ts`) is gated from 4.1.17:
  `npm run test:mutation:runs`, a job of its own in ci (`full-ci`), the nightly, the candidate and the release. Its
  survivors read one by one: tests of the queue, the worker, the routes and the stores (`tests/bridge-runs-*.test.ts`).
- **`gh workflow run mutation -f set=<set> -f ref=<ref>`** (4.1.17): one mutation set measured on a runner, its report
  kept with the run; it gates nothing.

- **The player's Mystery world** (4.1.17): the Remix menu's **Mystery world** entry asks the game's Bridge for a
  commitment and its reveal, verifies both offline with the game's daily key, builds the world and keeps both tokens
  beside it; a speedrun started in it carries them and its start time (`valid-unranked` without a server witness).
- **A run resumed keeps its world and its proof** (4.1.17): `e2e:remix-speedrun` interrupts and resumes a run in each
  world (Story, Remix Fixed, Remix Random, Daily, Mystery): the same head, world, proof, verdict and board; resuming
  in another world or with another proof than the one sealed is refused (`RunStartRefused`).
- **The speedrun worker's container profile is run in CI** (4.1.17): `tools/speedrun/container.mjs` makes its
  `docker run` arguments (no network unless `--allow-network`, read-only, a bounded `/tmp`, no capability, no new
  privilege, an unprivileged user, limits on processes, memory and CPU, the packages read-only, its own `timeout -s
  KILL`); `npm run e2e:worker-container` (CI's `worker-container` job, in the candidate and the nightly) runs the
  reference run inside it, then a hostile script refused the network, the host's files and secrets, and killed.
- **Moderation from `bridge serve`** (4.1.17): `runs.adminTokenFile` (0600, 32 characters at least; `serve` refuses a
  missing, short or world-readable file); the bearer compared as hashes of equal length; every refusal audited, never
  the token; `/healthz` counts moderations accepted and refused.
- **`ship checks` waits for `pr-gate`** (4.1.17): the second tier's jobs appear once `check` is done, so a list where
  every check passed could be partial (8 of 32 on #67).
- The connectors' ssh tests draw their host key through `sshKeyPair()` everywhere (4.1.17): two fixtures still called
  ssh2's generator, which now and then writes a key its own parser refuses (the "Malformed OpenSSH private key" flake).
- `tests/bridge-fanout.test.ts` removes its folder with retries (4.1.17): Windows keeps a killed instance's SQLite file
  busy for a moment (EBUSY in the Windows job).
- The heavy suite's partition budget is 240 s per search: the slowest of the candidate's three cold runs on the runner
  (146 s) and 60 % more.
- A Mystery speedrun starts within the minute of its reveal (4.1.17): after it the page says so instead of recording a
  run the verifier refuses, and a page clock behind the Bridge's never dates the start before the reveal. Resuming a
  Mystery run keeps its sealed proof, whatever its new start time.
- `bridge serve` without `runs.adminTokenFile` has no moderation route (404, nothing counted or audited); the file's
  mode is checked on POSIX systems; the worker container has no swap beyond its memory limit.

- **The Remix and Speedrun mutation sets are gated** (4.1.17, plan §9): their survivors read one by one, by file —
  the seed codes, the manifest's compilation and every one of its problems alone, the application of a world, the
  categories' worlds, the envelope's sealing, the recorder (RTA, pauses, the finish, resume refusals), the
  verifier's guards (each reached by a run recorded dishonestly, not a hand-edited file) — and killed by a test, or
  named equivalent in `docs/dev/mutants.json` with why. `remix` and `speedrun` join `core`, `reality` and `runs` in
  the gate: their own jobs in ci (`full-ci`), the nightly, the candidate and the release.
- The verifier says a stored world's refusal by the code `loadVariant` gives it (the mapping of a code nothing threw
  is gone).

## 4.1.16 — 2026-10-08

"Convergence" (LOG #147): no new mechanic; the capabilities 4.1.14 and 4.1.15 published made to work together, end
to end. A speedrun is bound to the world it was played in: `.wsrun` schema 2 carries the exact world and the Bridge's
signed tokens, sealed into its proof; the verifier makes the world again from its seed, checks it against its
category (`worldVerdict`), replays the run in it and names its leaderboard (`leaderboardKey`); a schema 1 run stays a
Story run (breaking, with its reading rule: D29, ADR 0019). The Bridge's leaderboards and daily challenge are durable
(SQLite, Postgres), shared by instances under leases, and mounted by `bridge serve`; a minigame's result is in the
session, the replay and the story; the code wheel plays by keyboard and gamepad; Remix and Time Attack are checked
together in Node, Chromium, WebKit and Firefox on every pull request (`e2e:remix-speedrun`); `canonicalJson` writes the
same text in Firefox; Pages deploys only behind `pr-gate`; the docs are checked against the code (`docs:truth`).
Measured against 4.1.15 in `docs/dev/baselines/4.1.16.md`; what this release does not do is in the LOG and the passes
sheet (`docs/dev/passes/4.1.16.md`).

### Breaking

- **A `.wsrun` is schema 2** (4.1.16, ADR 0019): it carries the run's generator seed (`runSeed`, was `seed`), the exact
  world it was played in (`variant`) and, for a Daily or Mystery world, the Bridge's signed tokens (`worldEvidence`),
  all sealed into `h0`. A schema 1 file (4.1.14, 4.1.15) is still read and verified, as a Story run; offered to a Remix
  category it is refused (`legacy-world-missing`). A tool that read `envelope.seed` reads `runSeed` on schema 2.

- **`RunStore` is the durable queue's** (4.1.16): `create` (false on a duplicate key), `claimNext` (a lease),
  `complete` (only by the lease's holder), `setTrust`, `queued`; `put` and `byKey` are gone. A host that wrote its own
  store implements these (`MemoryRunStore` and `SqlRunStore` ship).

### Fixed

- **The release line is a line again** (4.1.16): `v4.1.14` was tagged on a side branch whose only extra commit
  lowered the coverage floors for that tag; it is merged into `main` (the stricter floors kept), so `v4.1.14` and
  `v4.1.15` are both ancestors of what comes next. `ship tag` and `release.yml` now refuse a tag whose previous stable
  tag is not its ancestor (`tools/release/ancestry.mjs`).
- **Pages deploys after `pr-gate`**, the terminal gate, instead of four of its jobs: no deployment while Firefox PWA,
  a proof, a mutation set or the reference game is red.

- **A speedrun in a Remix world verifies in that world** (4.1.16): 4.1.15's verifier and the Bridge's worker replayed
  the base game, so a run where the key lay under the oranges could not verify. The verifier now checks the stored
  world against the game (`loadVariant`) and the category (`worldVerdict`), rebuilds it (`applyVariant`), replays the
  run there and names its leaderboard (`world.leaderboardKey`); the same inputs in two worlds are two runs. A world is
  made again from its seed and must be the one stored: a world relabelled with another seed and rehashed is refused
  (`world-forged`), as is an unknown algorithm version (`world-algorithm`). The
  recorder no longer turns a Daily or Mystery category into a random seed, refuses to start a run its category could
  not rank (`RunStartRefused`), and keeps the world, the evidence and the run's seed in its checkpoint (a resume in
  another world is refused).
- **`canonicalJson` writes the same text in Firefox** (4.1.16): Firefox's `normalize('NFC')` turns a lone surrogate
  half into U+FFFD; such a half is now kept and the text around it normalized alone, as Node, Chromium and WebKit do
  (`e2e:canonical`, never run before, failed on it).
- **A Mystery reveal is signed** by the Bridge (its `token`), so the time of the reveal is the Bridge's word.

- **Two tied runs share a rank** on a Bridge leaderboard; the order after the time is the submission, then the id.
- **The daily challenge refuses what is not a day**: `date=`, `1999-99-99`, `2026-02-30` (400), a day older than
  `retentionDays` (410), a game id that is an object's property (`__proto__`, 404); its commit counters forget
  clients whose hour is over.

### Changes

- **A new logo** at the head of both READMEs.

- **`SpeedrunCategory.world`** (D29): `{ policy: 'story' | 'fixed' | 'random' | 'daily' | 'mystery', mode, fixedSeed?,
  codeWheel? }`; the validator refuses what it cannot give a meaning to and warns about 4.1.15's `seed: 'daily' |
  'mystery'` without `world`. API: `SpeedrunWorldPolicy` (content); `categoryWorld`, `runSeedPolicy`,
  `SpeedrunEnvelopeV1`, `SpeedrunEnvelopeV2`, `SpeedrunWorldEvidence` (testing); `SpeedrunVerifyResult.world`.

- **Durable, shared speedrun leaderboards** (4.1.16, plan §8): runs in the Bridge's SQLite or Postgres (migration
  0002), created once per key across instances, claimed by one worker under a lease and claimed again when the worker
  died, kept across restarts; `workers` per instance; a leaderboard per verifier key (`&key=`, a Fixed or Daily
  world's board apart); a Daily run sent after its day is practice; audit lines for submissions, verdicts,
  moderations and deletions.
- **`bridge serve` mounts `/v1/runs` and the daily challenge** from a configuration's `runs` and `daily` sections, on
  the SQL store, behind the same tenant, CORS and rate limits as the other routes; `bridgeServer` takes `runs` and
  `daily`. REALITY-OPS gives the worker's isolation profile (a container without network, read-only, no secret).
- **The player keeps a Daily world's signed token** and a speedrun in that world carries it.

- **A minigame's result counts** (4.1.16, plan §9): a minigame that says how it ended (the code wheel's `mg-record`)
  has its result recorded in the session (`SessionEntry.mg`, fed back on a replay like a choice) and written in the
  reserved flag `minigame.<id>` (`won`, `passed`, `skipped`, `failed`, `disabled`), which the story reads with
  `{ flag, eq }` and the journal reports as `flagChanged`. In the player every minigame reports (skipped, else won);
  the solver and the sessions of 4.1.15 record nothing new and replay as they were. A behaviour change for existing
  games: a save made in the player now carries a `minigame.<id>` flag for each minigame played (the solver does not
  explore branches hung on one). `Presenter.minigame` may resolve
  with the result; a command never sets a `minigame.*` flag (validator).
- **The code wheel, end to end**: a `story` wheel lost after its tries ends `failed` (no longer like a parody); the
  whole wheel by keyboard (Escape skips, a strict wheel starts focused on a turn button) and by gamepad (up and down
  choose an answer, A confirms, B skips); the focus returns to the game when any minigame closes; a speedrun
  category's `world.codeWheel` is enforced by the verifier (`code-wheel-rule`: `skip: false` wants it won,
  `enabled: false` wants it not played). `e2e:a11y` wins the wheel at the keyboard, checks the record, the flag, the
  focus and reduced motion, and runs axe on it.

- **Remix and Time Attack are tested together, end to end, in four runtimes** (4.1.16, plan §10): `npm run
  e2e:remix-speedrun` takes each world policy of the reference (Story, Remix Fixed, Remix Random, Daily, Mystery),
  records the solver's route with the real recorder in Node, Chromium, WebKit and Firefox (the four `.wsrun` the same,
  byte for byte), verifies it in a new process and by a Bridge queue's isolated worker, and checks its verdict, its
  leaderboard key and its trust. A `cross-runtime` CI job runs it with `e2e:canonical`, `e2e:remix` and
  `e2e:speedrun` on every pull request (in `pr-gate`), and the nightly at 500 seeds.
- **The reference chapter races in Remix worlds**: categories Remix Fixed (`WS-0000-02DZ`, its own board), Remix
  Random, Daily and Mystery, beside Any%, No Hints and Real Time.
- **`npm run docs:truth`**: what the documentation states against the code (the save and `.wsrun` schemas, every
  script and tool file it cites, the capabilities it calls mounted, no release link newer than the version), in
  CI's `check` job. ARCHITECTURE and SUPPORT (en, fr) say saves schema 4 and `.wsrun` schema 2.
- **Mutation sets `remix` and `speedrun`** (`npm run test:mutation:remix`, `test:mutation:speedrun`, and
  `test:mutation:reality` named): measured, not gated yet; their first runs left survivors to read before 4.2.

## 4.1.15 — 2026-10-07

"Remix" (LOG #138): the programme's eighth and last release, the fourth with a release candidate, and the release
candidate of 4.2 (D28: the DSL and the IR are frozen). One game, several worlds: a variation manifest and a seed give
an immutable world (items among tagged anchors, actors' starting rooms and rounds, coupled hints and answers, puzzle
order, presentation on its own stream), deterministic (tested in Node; the cross-runtime check is written, not run),
every world of a catalogue proved
(`verify:variants`), `Math.random` banned from the logical path; the save envelope v4 carries the world and a v3 save
gets the story (breaking, with its migration); the title screen's Remix, seed codes with a check symbol, the daily
challenge and Mystery seeds committed by the Bridge and checked offline; the code wheel, a playful reconstruction with
its accessible alternative and its printable version; the Studio's Remix tab; the reference chapter in Story, Remix
and daily. Measured against 4.1.14 in `docs/dev/baselines/4.1.15.md`; what this release does not do is in the LOG and
the passes sheet (`docs/dev/passes/4.1.15.md`).

### Fixed

- **A tag older than 4.1.14 releases again (4.1.15)**: `release.yml` runs from `main` while it checks out the tag's commit,
  and since 4.1.14 it verified and attached a speedrun file the 4.1.10 and 4.1.13 commits do not have: both release jobs
  failed after every check had passed. The speedrun is now verified and attached only when the tag carries it.

- **A Bridge on SQLite no longer exits on "database is locked" when several start at once (4.1.14)**: the opening's
  `PRAGMA journal_mode = WAL` ran outside the store's busy wait, so of several `serve` processes opening one fresh
  file the one that met another's lock exited (1). Every statement now waits (the opening's pragmas, the statements
  inside a transaction, the connection's own `timeout` too), and past its wait answers `StoreBusyError` (a 503), never
  a crash; a poll of the other instances' acceptances that stays busy is logged once (`store.poll.failed`) and tried
  again.

### Breaking

- **The save envelope v4 (4.1.15, ADR 0018).** A save is written as `SaveEnvelopeV4` (`schema: 4`): the v3 envelope
  and the `WorldVariant` the game was played in. `parseSave` reads v3 and v4; a v3 save migrates to the story world
  (`upgradeEnvelope`) and loads as before, and the golden saves of 3.0.0 to 4.1.9 still reach the ending. A save from
  another world is refused with `SaveWorldMismatch`, which names the world to rebuild. A host that wrote or checked
  `schema: 3` itself sees `schema: 4` and a `variant` field (UPGRADING §27); a 4.1.15 save does not load on 4.1.14.

### Changes

- **The release workflow's install steps get 20 minutes instead of 8 (4.1.15)**: the `v4.1.10-rc.1` release job timed
  out on `apt-get install ffmpeg` on 7 October 2026, as CI's jobs had a dozen times that day (ci.yml got the same in 4.1.14).
- **ffmpeg on the runners through `scripts/ci-ffmpeg.sh` (4.1.15)**: apt first, bounded to four minutes an attempt,
  then a static build from GitHub's CDN (BtbN/FFmpeg-Builds) when the apt mirror hangs, as it did for twenty minutes
  without a byte on 7 October 2026. Every ci.yml job that needs ffmpeg uses it; release.yml carries the same logic inline, because it runs from `main`
  while checking out a tag's commit that may predate the script.

- **The first visit's JavaScript goes from 125 to 132 KB gzipped in the sample game (137 in the reference chapter),
  and the reference chapter's witness changes (4.1.15)**: the save envelope carries the story world (a SHA-256 written
  out and the world's schema, `core/remix/story.ts`) and the minigames draw from the run's seed; the world's compiler,
  the Remix menu and the daily challenge's Reality code load only when a game with a manifest boots or a daily link is
  opened (the budget, `initialJsKB` 140, holds; a game without `reality` still never precaches the Reality chunk). The
  reference chapter's content moved (the password and the wheel are optional puzzles, the seller's round varies): the
  baseline moved on purpose, every golden save still loads.
- **The French locales of the two bundled games say « vendeur » where the Remix lines said a word the asset audit
  blocks (4.1.15)**: `npm run audit:assets` is part of `build:game`, and CI refused the build.
- **Remix: several worlds of one game (4.1.15, ADR 0018).** A game may declare a variation manifest (`remix`) and
  tagged anchors in its rooms: an item among anchors, a character's starting room, his round among scripts, a code
  coupled with its hint (`{code:<id>}`, `{hint:<id>}` in every language), an order of puzzle groups, alternative lines,
  images, palettes or minigame parameters. A seed (`WS-XXXX-XXXX`, with a check symbol) makes the same world and the
  same hash (tested in Node; the cross-runtime check `npm run e2e:remix` is written, not yet run); the world is plain data (reserved flags `remix.*` the content reads with `{ flag, eq }`),
  so the engine, the solver and the replay need nothing new. An impossible manifest is a build error; a malformed seed
  an explicit error. The sample game hides the pantry key under the oranges or in the lantern; the reference chapter
  moves the seller and his round, lets Lou hand the board before the lights, and draws a festival password with
  Grandma's riddle, in English and French.
- **Every world proved (4.1.15, D25).** `npm run verify:variants` validates and solves each world of a catalogue mode
  (`--prove`: no softlock), and a generator's published sample, with coverage per dimension and pair, values never
  chosen and dominant ones; it runs in `verify:game`, and a release publishes the bundled games' reports. `npm run
  remix -- --seed|--preview` shows a world. Measured: `demo` 3 worlds, `reference` 24 worlds per mode, all proved.
- **Remix in the player (4.1.15).** The title screen's **Remix** offers the story, a new world, a typed seed or the
  daily challenge; the pause menu shows the world's code to copy, or "hidden until the end" in a masked mode; links
  `?seed=`, `?daily=`, `?world=` name a world. Sessions record their world and a replay rebuilds it; speedrun
  categories Story, Fixed, Random, Mystery and Daily keep their leaderboards apart.
- **The daily challenge and Mystery seeds (4.1.15, D26).** A new Bridge module signs the day's seed and rules and
  commits to a Mystery seed before revealing it; the player verifies both offline with the key the game's manifest
  names. The Bridge never chooses a seed after seeing actions.
- **The code wheel (4.1.15).** "The Extremely Legitimate Pirate Check", a playful reconstruction of 1990s code wheels
  drawn from the game's characters (never DRM): the minigame `code-wheel` (parody by default), seeded by the world,
  accessible by buttons, keys, gamepad and a text list, and `npm run code-wheel` prints it (SVG, PDF with Pillow). The
  reference chapter has one on Lou's map.
- **The Studio's Remix tab (4.1.15).** Preview a seed, lock and reroll, compare, coverage and bias, anchors from the
  scene, play or export a frozen world.
- **The DSL and the IR are frozen (4.1.15, D28).** 4.1.15 is the release candidate of 4.2: `docs/dev/DSL-STABILITY.md`
  lists everything frozen, Remix's additions included. `Math.random` is forbidden in `src/engine/core` and
  `src/engine/minigames` by the linter; the minigames draw from the run's `minigame:<id>` stream (`MinigameCtx.random`).
- **After the second reading (4.1.15).** A link to another world never replaces a saved game silently: the page starts
  in the saved game's world and the title asks before the link's world replaces it; the stores keep a save of another
  world instead of writing over it. A stored or linked world is checked value by value against the game whatever its
  hash says (integrity is not authenticity). A generator backtracks instead of dead-ending; a presentation value cannot
  touch a minigame parameter that decides a win; Mystery commits are limited per client and a Mystery run must start
  within a minute of its reveal; seed codes refuse non-ASCII lookalikes; `newSeed` throws without WebCrypto.

## 4.1.14 — 2026-10-07

"Time Attack" (LOG #136): the programme's seventh release, the third with a release candidate. A speedrun category is
content (`GameDef.speedrun`, validated, no change of the engine); the run clock reads real time, logical steps and
logical time and never writes the state (D24); a seeded generator with streams replaces `Math.random` in the engine
(breaking, with its migration); a run is a chained journal of 500-input chunks that resumes after a crash; a `.wsrun`
chains every input to a final proof that `speedrun:verify` replays with one verdict and a code (thirty alterations
each refused); OBS and LiveSplit are local tools (D23); leaderboards on the Bridge verify in an isolated worker;
integrity is not authenticity, said as such. A complete Any% run of the reference chapter is attached to the release,
verified first. Measured against 4.1.13 in `docs/dev/baselines/4.1.14.md`; what this release does not do is in the
LOG and the passes sheet (`docs/dev/passes/4.1.14.md`).

### Breaking

- **A session holds 500 entries, not 5,000 (4.1.14, ADR 0016).** `SESSION_MAX` (`Engine.SESSION_MAX`) is now the size
  of a run's journal chunk: the 501st input starts a new session from the current state, as the 5,001st did. A long
  session file is several files (or a run's chunks); `replay()` follows a session across its rollover (it reported
  "nothing happened" at the rollover before).
- **`engine.random` draws from the run's seeded stream (4.1.14).** By default the engine no longer calls `Math.random`:
  it draws from the `logic` stream of the run's seed (xoshiro128**, `core/prng.ts`). A host or a test that sets
  `engine.random` is unchanged; a session whose host chose the seed (`Engine.sessions.nextSeed`) writes `Session.seed`.

### Changes

- **CI's install steps get 20 minutes instead of 8 (4.1.14)**: `npm ci`, `apt-get install ffmpeg` and `playwright install` on
  GitHub's runners timed out a dozen times on 7 October 2026 while the downloads were slow; every one passed on a rerun.
  A step limit, not a job limit: a hung install still fails the job within its own `timeout-minutes`.

- **Speedrun categories as content (4.1.14, `docs/en/SPEEDRUN.md`).** `GameDef.speedrun` declares categories (timed on
  RTA, IGT or Active IGT; start and finish on semantic events; saves, pauses, hints, reloads, Reality policy, the
  fingerprint components a run must match, the inputs, a fixed or random seed), splits and the rules' version;
  `npm run validate` checks them. A category needs no change of the engine. The reference chapter declares Any%,
  Any% No Hints and Real Time.
- **The run clock (4.1.14, ADR 0016, D24).** `Engine.runClock` reads RTA (`monotonicNow`, never an authority), logical
  steps (one per input) and logical time (microticks: the declared durations of `core/timing.ts`, `TIMING_VERSION 1`;
  a line costs the same whatever its language or the text speed); Active IGT leaves out the cutscenes. It observes the
  engine and never writes the state; replayed, a session gives the same steps and times (200 generated games).
- **A seeded generator with streams (4.1.14).** `core/prng.ts`: xoshiro128**, `PRNG_VERSION 1`, a stream per purpose
  (`logic`, `cosmetic`, `minigame:<id>`, `copy-protection`), test vectors for every runtime
  (`tests/fixtures/prng-vectors.json`). `rnd[]` stays the trace: a verifier draws again and demands the same numbers.
- **Speedrun mode in the player (4.1.14).** Pause menu › Speedrun › a category: a new game with its seed, a timer,
  automatic splits (a missed split never spoils the attempt), the pause menu and the background recorded as intervals,
  **Export run** (`.wsrun`) at the finish, **Abandon run**; local records offline (personal best, best segments, sum of
  best, attempts, abandons), a ghost of the PB on semantic targets (off the first time a category is played). The run
  is written to IndexedDB (`web-scumm-runs`) in chained chunks of 500 inputs and resumes after a closed tab or a crash
  from its last chunk. New interface texts: `ui.speedrun`, `ui.exportRun`, `ui.abandonRun`.
- **The proof of a run and its verifier (4.1.14, ADR 0016, ADR 0017).** A `.wsrun` (schema 1) chains every input by
  SHA-256 from the category's rules to a final proof, with the final state's hash; `npm run speedrun:verify`, the
  CLI's `web-scumm speedrun verify` and the MCP tool `speedrun_verify` replay it with its seed and give one verdict
  with a code and a reason (`valid`, `valid-unranked`, `invalid-category-rule`, `invalid-replay`, `modified-game`,
  `missing-reality-proof`, `unsupported-version`, `inconclusive`, never valid). Thirty alterations (time, action,
  seed, rules, signal, hash, chunk, shape) are each refused with their code. Reality categories keep each signal's
  signed JWS and check it with the Bridge's keys. A complete Any% run of the reference chapter is attached to the
  release, verified first.
- **Routes, ghosts and the Studio (4.1.14).** `.wsroute` routes (exported, imported, compared); the solver's witness as
  a logical route, never a record. The Studio's Play tab has a speedrun panel: categories and rules, a splits editor
  written back to the game, a preview of the splits on the frame's session, routes, the run's export.
- **OBS and LiveSplit, locally (4.1.14, D23).** `npm run speedrun:overlay` serves an OBS Browser Source (full, compact,
  transparent); `npm run speedrun:livesplit` exports a LiveSplit splits file and drives LiveSplit through its own
  WebSocket server. The game posts its run's events to them with `?speedrunTool=<port>`, nothing else.
- **Leaderboards on the Bridge (4.1.14).** `bridge/src/runs.ts`: `POST /v1/runs`, a queue, an isolated verification
  worker (its own process group, bounded heap and time, no secret, fetch, WebSocket, TCP, UDP and DNS refused in-process
  (not an isolation: the deployment's container is), the package approved by fingerprint, its answer
  signed with a one-time key), leaderboards per category and seed kind (valid runs, pseudonyms, trust levels),
  moderation, deletion on request, 90-day retention purged hourly, a run identified by its inputs (the first submitter
  keeps it), ten submissions a minute per client, the envelope dropped once judged. A module for the Bridge's host to
  mount (`runsRoute`). Pseudonyms are not authenticated.
- **After the second reading (4.1.14).** `reload: 'segment'` is reserved and refused by the validator (it was timed like
  `allowed`); a walk's logical length uses `Math.sqrt`, not `Math.hypot`, exact alike in every engine; an empty chunk
  is refused; the local overlay and autosplitter accept events from the game's origin only (`--origin`); a time is
  ranked only for a `valid` run; SPEEDRUN, ADR 0016 and ADR 0017 say what `replay-valid` admits (tool-assisted runs,
  crash resumes), that a random seed is the client's choice and that pseudonyms are not authenticated;
  `docs/{en,fr}/UPGRADING.md` §26.

- **The Bridge's `reality` mutation set is gated again (4.1.10)**: the 20 survivors the `v4.1.10-rc.1` run left
  unnamed (18 in `bridge.ts`, 2 in `lock.ts`): 19 killed by tests (`tests/bridge-mutants-tenant.test.ts`: the slow
  pass's timer and its `clearInterval`, a pairing's origin and session id, a code confirmed or claimed twice, a claim
  racing a confirmation, the `backlog` and `propose.ms` values recorded, the V1 payload, a row whose sequence is not its
  own, a fetch whose last page is exactly full, an export past 1000 rows, a third section queued on a keyed lock), 1
  named with its reason (`if (this.timer)` forced true: `clearInterval(undefined)` does nothing).

## 4.1.13 — 2026-10-07

"Solver Research" (LOG #133): the programme's sixth release, named by the two thresholds its sheet fixed before any
code was written. The minimum is met: a proof needs nine times less heap over the proof matrix (up to twenty times
less on the open instances), a long proof stops and resumes to the same verdict and witness, the proof profile says
what multiplies the states, workers share what the search has seen, and every verdict is the one 4.1.8 gave, state
for state. The release objective is not met: eight of the twelve matrix instances finish within budget, as with 4.1.8,
and the gap report (`docs/dev/PROOF-MATRIX.md` §8) says why. Measured against 4.1.12 in
`docs/dev/baselines/4.1.13.md`; what this release does not do is in the LOG and the passes sheet
(`docs/dev/passes/4.1.13.md`).

### Changes

- **Three SQLite tests of the Bridge get 30 s on the runner (4.1.13)**: a tenancy property, a restore and a pairing sweep
  took more than vitest's 5 s on the Windows runner three times on 7 October 2026 and passed every time elsewhere.

- **A proof needs nine times less heap over the proof matrix, up to twenty times less on the open instances** (4.1.13,
  ADR 0015). The search stores the states it has seen by index, with exact interned keys, parents and steps in flat
  columns, and keeps a state's engine copy only while it waits to be expanded. Over the twelve instances of the new
  proof matrix the peak heap falls ÷9 (÷4.5 in RSS), and ÷16 to ÷20 on the large open ones o21, o23 and o25 (1.6 KB a
  state instead of 31.6 on o21); the time per state, the engine's runs, does not change. The verdicts, paths, softlocks and reachable sets are those of 4.1.8, state for state, on the sample game,
  the reference game and 200 generated games (`tests/solver-oracle.test.ts`). `--representation=objects` keeps the
  4.1.8 storage.
- **A long proof can be stopped and taken up again** (4.1.13). `npm run solve -- --prove --checkpoint=<file>` writes
  the search down every five minutes (`--checkpoint-every`) and when a budget stops it; `--resume` takes it up to the
  same verdict and the same witness, even after the process was killed or a budget stopped it inside a state's
  expansion. `--mem=<MB>` stops a search as `truncated`
  past a heap size. A budget that cuts a search never gives `proved`.
- **The proof profile says what multiplies the states** (4.1.13). `npm run solve -- --prove --profile` attributes the
  states to positions, inventories, flags, dialogues and scripts (how many would merge without each), counts the
  symmetries folded, the tries that changed nothing and the orders merged, and names every abstraction with what it did
  or why it is off. A softlock cause now carries its session entries: `npm run replay` plays the way into it.
- **The proof matrix** (4.1.13, `docs/dev/PROOF-MATRIX.md`, `npm run prove:matrix`, nightly). Twelve generated games of
  20 to 40 rooms and three playable characters, six constrained and six open, with published budgets and expected
  verdicts. 4.1.13 proves the same eight of twelve as 4.1.8 within ten minutes on the maintainer's Mac; four open ones
  run out of time, and the gap report says why (the engine's runs on tries that change nothing, and who carries which
  key). This release is therefore "Solver Research".
- **Symmetric items, and workers that share what the search has seen** (4.1.13). `--symmetry` folds two items the game
  treats alike (off by default: none in the bundled games). With `--workers`, a worker sends back a state the search
  already stored without its engine copy, and nodes are dealt by room with work stealing; the result stays the same for
  any number of workers.
- **One checkpoint case fewer in the counted declarations (4.1.13)**: the killed-process resume is skipped on Windows
  (the test reads the snapshot while the child renames a new one over it); the baseline's count moves by one on purpose.

- **The coverage floors raised to within three points of what the tests reach (4.1.10)**: lines 66, statements 65,
  functions 61, branches 62 (64 / 63 / 59 / 61 before), `reality/protocol.ts` branches 96. The strict ratchet on the
  `v4.1.10-rc.1` tag refused the five floors Constellation's tests had left behind (measured 67.91 / 67.21 / 63.31 /
  64.09 and 98.75); the pull request had only warned.
- **`e2e:reality` waits two minutes for the ending cutscene after the gate (4.1.10)**, 30 s before: on a runner
  carrying five runs the cutscene outlasted it twice today (Chromium and WebKit) with every other check green.

- **The coverage floors raised again for 4.1.11's tag (4.1.11)**: lines 67, statements 67, functions 63, branches 63;
  `reality/client.ts` branches 90, `bridge/src/server.ts` lines 94 and branches 85, `bridge/src/cli.ts` branches 66.
  Viewport's tests brought the measure to 69.86 / 69.05 / 65.32 / 65.60 (PR #42's coverage job), and the strict
  ratchet of a tag refuses a floor three points or more below it.

- **`e2e:reality` acts on the gate again when the ending does not come (4.1.12)**: an input while the engine is busy is
  dropped, as a player's tap is, and the shed's cutscene could still be running when the harness used the gate; the
  check waited 120 s for an ending that never came (one WebKit run in three on 7 October 2026). Now: wait for the
  engine to be free, act, and act again up to three times, 40 s each.

## 4.1.12 — 2026-10-07

"Language" (LOG #128): the programme's fifth release. The game's logic as plain data (`GameIR`, deterministic, with
the file and line that writes each id), a fingerprint in four SHA-256 (logic, trusted extensions, presentation,
engine) that the pause menu shows and the build seals, one canonical text per value (`canonicalJson`, held to fifty
edge values in Node, a script written to compare them in three browsers, not yet in CI), objectives and the quest journal (the one primitive admitted,
with its ADR; every other candidate refused with its proof), forms generated from the schemas in the Studio, the DSL's
reference generated from them, and the DSL stabilised (D22) until Remix freezes it. Measured against 4.1.11 in
`docs/dev/baselines/4.1.12.md`; what this release does not do is in the LOG and the passes sheet
(`docs/dev/passes/4.1.12.md`).

### Breaking

- **The pause menu's fingerprint row in every game (4.1.12).** A game whose release language is not English shows its
  English default ("Build") until it adds `ui.fingerprint` (and `ui.objectives` when it declares objectives) to its
  `ui` and its translation tables; the release-language e2e (`npm run e2e -- --lang xx`) fails on a visible default.
  The sample game and the reference chapter carry both, in English and French (UPGRADING §24).

### Changes

- **Objectives and the quest journal (4.1.12, ADR 0014).** A game may declare `objectives` (`title`, `done`,
  `optional`, `parent`). The pause menu lists them, each step under its parent, ✓ done or ○ open; the semantic journal
  says `objectiveCompleted` once, right after the event that completes it (even inside a cutscene, before what
  follows, the autosave and an ending), never again in the session, and silently for what already holds when a game
  starts or loads; `npm run solve -- --goal=100%` searches for a state where every objective that is not optional
  holds at once. The validator refuses an objective whose `done` can never hold (naming a custom command without
  declared `effects`), an unknown parent and a cycle of parents, and warns about a `done` the content can take back.
  The flag and item handlers now change the state before they journal it. The sample
  game and the reference chapter declare five each, translated into French. The save format does not change.
- **The game's intermediate representation (4.1.12, ADR 0013).** `compileIR` turns a compiled game into its logic as
  plain data (rooms, entities, rules, scripts, objectives, Reality policies, the world, the trusted extensions by name,
  a variant slot reserved for 4.1.15), deterministic, with the `file:line` that writes each id. `npm run ir -- --game
  <id> [--json]` prints it; the Studio's new **Language** tab shows it with the objectives; MCP's new `get_ir` returns
  it. Every field of a game, a room and an entity is classified logic, presentation, both or tooling in one table the
  compiler checks. The runtime, the solver and the replay keep reading the compiled game.
- **The game's fingerprint (4.1.12, ADR 0013).** Four SHA-256 computed with WebCrypto: `logic` (the IR),
  `trustedExtensions` (the game's code beside its content, hashed by the build), `presentation` (decors, sprites,
  sounds, interface texts and the asset manifest) and `engine` (its version). A rule changed moves `logic` only, a
  decor `presentation` only, a custom command's code `trustedExtensions` only. The pause menu shows the short form
  (`ui.fingerprint`, "Build" by default); a build writes `site.json` with the trusted extensions' hash and the
  engine's version, which `npm run verify:dist` expects.
- **One canonical text per value (4.1.12).** `canonicalJson` (NFC, sorted keys, no `-0`, big integers as decimal
  strings, anything lossy refused) is held to fifty edge values in Node; `npm run e2e:canonical` compares them in
  Chromium, WebKit and Firefox (written in this lot, not yet in CI). The solver's proof cache is keyed by it: the
  entries of earlier versions are not reused.
- **The Studio writes objectives (4.1.12).** Their form is generated from their schema (each field with its
  description); a value is checked before it is sent, and the validator's errors come back named by file, id and
  field; the diff is previewed before the write and Undo takes it back. MCP's `set_value` writes them in the game file
  with `id: "@game"`; `list_rooms` shows them.
- **The DSL's reference is generated (4.1.12, D22).** `docs/en/DSL.md` and `docs/fr/DSL.md` list every condition,
  every command with its shape, the objectives' fields and how each field counts for the IR, from the schemas
  (`npx tsx tools/dsl-doc.ts`, held by a test). The DSL is stabilised: `docs/dev/DSL-STABILITY.md` says what is
  stable, what may still grow until 4.1.15, and the candidate primitives of the programme with the proof that admitted
  or refused each (objectives admitted; no Reality nor stage primitive needed).
- **API (4.1.12), additive.** `web-scumm/content`: `compileIR`, `canonicalJson`, `provenanceOf`, `logicView`,
  `completionGoal`, `ObjectiveDef`, `GameIR` and the IR's types. `web-scumm/testing`: `fingerprint`,
  `fingerprintGame`, `presentationOf`, `hashSources`, `sha256Hex`, `shortFingerprint`, `GameFingerprint`. MCP: `get_ir`.
  `Engine.objectives`, `App.fingerprint()`, `App.objectivesMenu()`, `BootOptions.build` and two `ui` keys
  (`fingerprint`, `objectives`) are new members.
- **The first visit's JavaScript goes from 122 to 124 KB gzipped** (4.1.12): the fingerprint (WebCrypto), the
  objectives and the quest journal are in the player's main chunk; the budget (`initialJsKB` 140) is untouched and the
  baseline moved on purpose.
- **The validator's migration checks moved to `tools/validate/migrations.ts` (4.1.12)**, beside the objectives'
  checks: `validate.ts` goes from 1 140 to 1 113 lines, and its cap with it.
- **`e2e:pwa` on Firefox tolerates one file missing from the cache after a reinstall warm-up it reported complete**
  (4.1.12, CI only; the files are listed), under the same bound as the refused cached files (two): more is a failure.
  Chromium and WebKit stay strict.

- **A tag's release chain in half the time (4.1.10).** `release.yml` runs the two mutation sets as jobs of their own
  (`core`, `reality`, about half an hour each; the final tag after its candidate reuses the candidate's reports through
  the cache) beside
  `release-check:ci` (`release-check` without the mutation step), and the release waits for all three: about 35
  minutes from the tag's green run to the published release instead of 70. `ship tag --now` (and `chain --now`) tags
  as soon as the pull request is merged instead of waiting for main's run of the same commit: the tag's own run, the
  same suite on the same commit, is what the release checks.
- **`ship tag` fetches before reading the commit (4.1.10)**: `chain` tagged nothing twice (4.1.9, 4.1.10) because the
  merge commit it had just made was on origin only ("not a commit here").

## 4.1.11 — 2026-10-07

"Viewport" (LOG #125): the programme's fourth release, the second with a release candidate. The rendering is no
longer a source of state: the room view makes an immutable scene frame with a pure function and paints it, the DOM
and the Canvas painters send the engine nothing but intentions, and the semantic journal of what happened in the
game (rooms, items, flags, endings, loads) belongs to the core, replayed identically by a session. The Studio edits
a room's layers, masks, zones and portals; the validator refuses a degenerate mask. Measured against 4.1.10 in
`docs/dev/baselines/4.1.11.md`; what this release does not do (every browser measure, the WebGL spike) is in the
LOG and the passes sheet (`docs/dev/passes/4.1.11.md`).

### Changes

- **The semantic journal (4.1.11).** `Engine.journal` numbers what happened in the game, in ids: a session started, a
  room entered (and from where), an item acquired or lost (an item handed to another player is both, each with its
  `player`), a flag changed (only when its value changes; `null` when it is removed), the player switching character,
  an ending reached, a load, and the autosave that follows something semantic. The command handlers, a room's entry and the
  engine's lifecycle emit it, nothing in the DOM does, and a kind it does not know is refused. Replaying a session yields
  the same journal (the sample game, the reference chapter, 200 generated games). A session file carries it;
  `npm run replay` prints it and exits 1 when the replay's differs; a session longer than the journal's window
  (10 000 events) is exported with `journalTruncated: true` and no journal, and `npm run replay` then says "no journal
  comparison: the window was exceeded" instead of "matches". The dev panel lists the latest events.
- **The scene frame (4.1.11, ADR 0011).** The room view makes an immutable `SceneFrame` (camera, layers, characters,
  targets with their hit polygons precomputed, effects, a hash) with a pure function, then paints it. Taps are tested
  against the frame and the accessible buttons follow its targets, whatever paints the room. Every room of the sample
  game and of the reference chapter, in three states, paints the same DOM and answers the same taps as before.
- **The player's input is an intention (4.1.11, D21).** `App` composes the engine, a `Presenter` (`dom/presenter.ts`:
  the scene's calls, lines, overlays, minigames, the ending) and the room view's `Renderer`; a verb on a target, a
  walk, a choice, a skip or a screen opened goes through the presenter's `intent()`. The same clicks on the DOM and on
  the Canvas painter record the same session and journal, at device pixel ratios 1, 2 and 3, on a phone and a desktop
  screen, with and without reduced motion. The busy state (runs, the tutorial step, a skip) is `core/busy.ts`; a skip
  left pending no longer outlives a new game or a load. The page's test hook moved with it:
  `window.__game.presenter.inventory(…)` where e2e scripts called `window.__game.inventory(…)`.
- **The Canvas painter survives a lost context (4.1.11).** Nothing is painted while the browser has reclaimed the
  canvas; once restored, the background, the masks and the occluders are rebuilt from their images and the room is
  painted again. A tap or a hover reuses the room's frame until something changes (a version counter), instead of
  building and hashing it again. The route between walk zones is the core's (`core/motion.ts` `zoneRoute`), the walker walks it.
- **The Studio edits a room's layers, masks, zones and portals (4.1.11).** Under the room sheet of the Rooms tab: each
  layer's depth, parallax, opacity and blend; occlusion masks and walk zones drawn as polygons on the backdrop; links
  between zones placed by two clicks; **Save stage** writes the geometry over the room's layout.
- **The validator refuses a mask polygon that closes no surface and, in a room of several walk zones, a zone no link
  joins (4.1.11).** A layout that validated in 4.1.10 with a degenerate mask polygon (collinear points, crossing edges)
  now fails `npm run validate`; the bundled games pass.
- **API (4.1.11), additive.** `web-scumm/player`: `SceneFrame`, `Renderer`, `Intent` (`@extension`).
  `web-scumm/testing`: `SemanticEvent`, `SemanticJournal` (`@public`). `Engine.journal` and `Engine.sessionSeq` are new
  members of `Engine`.
- **The first visit's JavaScript goes from 120 to 122 KB gzipped** (4.1.11): the scene frame, the presenter, the
  intents and the journal are in the player's main chunk; the budget (`initialJsKB` 140) is untouched and the
  baseline moved on purpose.

## 4.1.10 — 2026-10-07

"Constellation" (LOG #123): the programme's third release, the first since 4.1.8 with a release candidate. The Bridge reads and
writes through one store interface (`RealityStore`): SQLite locally, Postgres for several instances, the 4.1.9 journal
still served and migrated; instances without state of their own, sharing one durable journal that wakes the streams;
tenants isolated by key and by row, each with its own quotas, rotation and revocations; a signal that names its
context (`SignalV2`, the threat model's answer, V1 still accepted by the player until 4.1.12); health routes, metrics,
backup and restore, quarantine of rows that no longer verify, a load bench of three instances. Measured against 4.1.9
in `docs/dev/baselines/4.1.10.md`; what this release does not do is in the LOG and the passes sheet
(`docs/dev/passes/4.1.10.md`).

### Breaking

- **`SignalV2`, the signal that names its context** (4.1.10, ADR 0010). `WorldSignalV2` adds `tenantId`,
  `environment`, `audience` (the origin the player paired from), `sessionId` and `keyId` to the signed payload;
  `verifySignal` accepts the versions its expectation allows (both by default), refuses a V2 signed for another
  tenant, environment, origin or link (`audience-mismatch`) and a `keyId` that is not the header's `kid` (`key`). A
  multi-tenant Bridge signs V2 only; a single-tenant Bridge signs V1 by default until 4.1.12, when V2 becomes the only
  version (announced, `docs/en/UPGRADING.md` §22). A key bound to a tenant signs V2 only: a V1 signal under it is
  refused (`schema`); a V1 Bridge's keys bind no tenant. A V2 signal may name the Bridge's own audience when the
  Bridge did not see the player's origin (its keys declare it). The Studio's simulator signs V2 by default;
  `RealityClient` checks the page's origin by default and the shipped player passes the link's `sessionId`. The Rust
  cross-check verifies V2 with the same codes (`bridge/test-vectors/signal-v2/`).
- **The Bridge's methods are asynchronous** (4.1.10, ADR 0009): `startPairing`, `claimPairing`, `revoke`,
  `forgetPlayer`, `exportPlayer`, `ack`, `unlink`, `subscribe`, `streamAlive` and `playerOf` return promises; the
  routes `/v1/*` are unchanged. `--trust-proxy` alone trusts the loopback only (D20); the client is the rightmost
  `X-Forwarded-For` address that is not a listed proxy. Behind a proxy elsewhere than on the loopback (a PaaS's
  router), every client shares one rate bucket until `--trust-proxy=<its network>` names it.

### Changes

- **A durable, replicable, multi-tenant Bridge** (4.1.10 "Constellation", D20, `docs/dev/threat-models/constellation.md`).
  The Bridge reads and writes through `RealityStore`, every method taking the tenant first; `appendSignal` decides the
  deduplication, the sequence (`MAX + 1`), the quotas and the signature in one transaction. Stores: SQLite through
  `node:sqlite` (the `local` profile; Node 22.13+, no native dependency), Postgres through `pg` (the `distributed`
  profile, `experimental` until a real deployment), the 4.1.9 journal (still served; `npm run bridge -- migrate
  --from=jsonl --to=sqlite` moves it). The schema is versioned (`bridge/migrations/`, up and down). One server serves
  several tenants (`serve --tenants=…`, routed by `Host`), each with its own keys, root, quotas, rotation and
  revocations, and connector tokens bound to their tenant; instances are stateless (a stream on one instance receives
  what another accepted, woken by `NOTIFY` or a short poll). New: `/livez`, `/readyz`, `/healthz`; OpenTelemetry
  metrics when `@opentelemetry/api` is installed; `tenant export|delete`, `backup`, `restore`; quarantine of rows that
  no longer verify (or name another player, sequence or tenant than their row), listed by `doctor`;
  `streamsPerInstance`; a store busy beyond 5 s answers 503 with `Retry-After`; the SQLite files are mode 0600.
  Tested: the store contract on memory, SQLite and
  Postgres with fast-check properties (concurrent proposals, two tenants crossed), three processes with one killed
  during 1 000 proposals, backup and restore rehearsed. `npm run bridge:load` measures three instances, 1 000 players
  and 50 000 proposals (`docs/dev/BENCH-BRIDGE.md`; nightly on SQLite and Postgres); CI runs a `bridge-postgres` job.

## 4.1.9 — 2026-10-07

"Gateways" (LOG #121): the programme's second release, the same day as the first. Four connectors of the world
outside (email, Telnet, SSH, Open Badges) on one SDK, in a fourth package outside the player and the DSL, each with its
threat model and its abuse tests, all `experimental` until a real pass; the cadence itself (the CHANGELOG and the LOG
as fragments per branch, the CI in three tiers sized by the change, the mutation job off the pull request path).
Measured against 4.1.8 in `docs/dev/baselines/4.1.9.md`; what this release does not do is in the LOG and the passes
sheet (`docs/dev/passes/4.1.9.md`).

### Fixed

- **`npm run ship -- verify` on a release candidate** (4.1.9). It looked for `web-scumm-4.1.8-rc.1.tgz` where the
  packages carry `package.json`'s version (`web-scumm-4.1.8.tgz`): the rc's sums and eight attestations verified, then
  the command failed on that name, in `release.yml` too. The tarball's name drops the tag's suffix.

### Changes

- **The CHANGELOG and the LOG written as fragments per branch** (4.1.9, lot 0 "cadence"). A branch that changes
  the code writes `changes/<slug>.md` (its bullets under `### Breaking`, `### Fixed` or `### Changes`) and, for a LOG
  entry, `changes/<slug>.log.md`; `npm run changes -- --assemble` folds them into `CHANGELOG.md`'s `Unreleased` and
  numbers the LOG entries in the order the fragments reached `main`; CI's `check` job fails a pull request that
  touches the code without a fragment (`npm run changes -- --check`). During 4.1.8 every merge made the other open
  branches conflict on those two files and re-run their CI: that is over (`changes/README.md`).

- **CI in three tiers, sized by the change** (4.1.9, lot 0). A pull request runs a fast tier on every change (`plan`;
  `check`: formatting, lint, knip, both type checks, the sample game's gates, `build:game` instead of `build`, the
  baseline, the proof; `coverage`: the unit suite once), then only the heavier jobs its diff can affect, as
  `tools/ci-plan.ts` classifies it (`npm run ci:plan`): a docs-only pull request opens no browser, no Windows runner and
  no Node 24; a Bridge change runs Reality, a painter the browser rows and the reference chapter. The browser rows and
  the Firefox PWA job play the `dist/` that `check` built instead of building it seven times; `node-24` runs the suite
  without `quality` again; `audit:deps` runs when the lockfile moved. The seventeen checks the ruleset requires keep
  their names and succeed with "not needed by the plan" when spared. The coverage ratchet warns on a pull request
  (`::warning::`) and stays strict on `main`, tags, the nightly and release-check. On `main`, on a tag and with the
  `full-ci` label, everything runs as before; a new `pr-gate` job sums every result up, the candidate single required
  check (`CONTRIBUTING.md`, "What CI runs"; `docs/en/SUPPORT.md` says what a pull request no longer checks). The `mutation` job no longer runs on a push to `main` either: a main run must stay short, since the release
  chain waits for the run of the exact commit it tags and a later merge cancels one still going; the nightly and
  `release-check` measure the sets, a `full-ci` label on a pull request too. The Firefox PWA job now plays the same build as the Chromium and WebKit PWA rows (the Studio demo included),
  from the shared artefact.

- **Four connectors of the world outside: email, Telnet, SSH and Open Badges** (4.1.9, experimental, D19, ADR 0008).
  Each is a process of its own (`web-scumm-connector <id> --config <file>`, or `npm run connector -- …` in the
  repository), never in the game nor its DSL, with one Biscuit attenuated to its own signals. Email: a provider's
  signed webhook or an IMAP mailbox, the message read in a worker under limits, HTML made inert, attachments refused,
  one signal per `Message-ID`, a message the Bridge could not take left unseen for the next poll, IMAP without TLS
  only to this machine. Telnet and SSH: a virtual terminal (the game's commands, `help`, `exit`) and, for SSH, a
  virtual disk (`ls`, `cd`, `cat`); no host shell, no `exec`, no `sftp`, no forwarding; one shell per SSH
  connection; line, rate and time limits, 20 seconds to pair, three connections per address and wrong codes counted
  per address across reconnections. Open Badges 2.0 (hosted, signed) and 3.0 (VC-JWT, Data Integrity `eddsa-jcs-2022`), issuer,
  recipient, dates and revocation checked, every document fetched under an SSRF-safe network policy; the verdict is
  `valid`, `invalid`, `expired`, `revoked` or `indeterminate`. A player links a connector with the pairing code the
  pause menu shows. Not done: replies to emails, DKIM and SPF, RDF-canonicalised proofs (`indeterminate`), a real
  provider, badge or exposed terminal tried by a person (`docs/en/SUPPORT.md`).
- **A game declares what its connectors may do, as data** (4.1.9): `reality.connectors` holds the words of an email's
  answers, a terminal's commands and replies, an SSH disk's files and the badge issuers a game trusts; `npm run
  validate` checks that every signal named is declared, that commands are plain words and not the terminal's own,
  and that paths stay inside. The Reality manifest carries the block (its hash changes only for a game that declares
  it). A game runs without any connector.
- **The connector SDK** (4.1.9, `connectors/src/sdk.ts`): a connector receives, validates, binds to a player, gives a
  `dedupeKey` (`sha256('<source>:<external id>')`, the Bridge's existing deduplication key) and proposes; delivery is
  at least once and applied once (a proposal whose answer was lost is sent again with the same key, the Bridge answers
  `duplicate`). What a connector saw never leaves it: the Bridge receives the SHA-256 of its payload as
  `evidenceHash`. Limits (size, a local quota, a timeout), metrics and `/health` in JSON, a log that writes
  `[redacted]` for anything that looks like content, SIGTERM drained in at most five seconds.
- **`web-scumm-connectors`, a fourth package** (4.1.9): one bundled module, its MIME worker beside it, `ssh2` (MIT)
  its only dependency, whose optional native parts are refused (`cpu-features` and `nan` map to a refusing stub): in the
  repository `npm ci` still runs ssh2's install script, which attempts a native build and fails without the `nan`
  headers, so no `.node` file results (tested); the package is installed with `--ignore-scripts`. `npm run pack` makes four tarballs; `npm run fresh-install` installs this one without native
  code and runs `web-scumm-connector --help`.
- **A build that carries server code fails** (4.1.9): `verify:dist` (in `npm run build`) refuses a game's JavaScript
  that holds any marker of the connectors or the Bridge (`connectors/`, `ssh2`, `imapflow`, `web-scumm-bridge`…).
- **`npm run solve:reality` proves recorded replays too** (4.1.9): `games/<id>/replays/*.json` (connector inputs and
  the signals they made), proved finishable like the scenarios and replayed through the real connector code by a
  test, with no network. The sample game `games/signals` gains "the mailbox and the terminal": a letter opens the
  shed, a command lights a lamp, a badge puts a ribbon on the bucket, all optional.
- **Tools and CI** (4.1.9): `npm run fuzz:connectors` (seeded mutations of each connector's corpus, crashes and memory
  counted); a `connectors` CI job (the contract on the four connectors against a real Bridge, abuse and replay
  tests, a run under `--disallow-code-generation-from-strings`, half a minute of fuzzing, the tarball installed); a
  nightly fuzz of a minute per connector, not gating yet; a `connectors` mutation set, outside `all`, not gated yet;
  `e2e:reality` sends one key three times from two connectors and proposes the sample chapter's replays. The Windows
  job leaves out the Telnet and SSH tests until they are ported.
- **Documentation** (4.1.9): `docs/en/CONNECTORS.md` and `docs/en/PRIVACY.md` (what is kept, where, how long, how to
  delete), in French too; a threat model per connector (`docs/dev/threat-models/`); ADR 0008; D19.

## 4.1.8 — 2026-10-07

"Foundation Reset" (LOG #117): the first release of the 4.1.8 → 4.1.15 programme (D18), where the 4.1.x line becomes
an incubation line; the toolchain modernised (TypeScript 7, Vite 8, the PWA plugin's 2.0, Node 22.12), the Reality
cursor's P0 fixed with its reproduction, the PWA proven in three browsers, a release check that predicts the release,
the mutation and coverage gates that block, the Studio's biggest files split, every public export with its
stability, the documentation saying one thing. Measured against 4.1.7 in `docs/dev/baselines/4.1.8.md`; what this
release does not do is in the LOG and the passes sheet (`docs/dev/passes/4.1.8.md`).

### Fixed

- **A signal handed over and not acknowledged was lost to its connection** (P0 of 4.1.8, reproduced by the
  maintainer on 4.1.7 in polling). The transport asked the Bridge from the sequence it had *delivered*, so after
  signal 1 was handed to the game the next request said `after=1` whether or not the game had applied and saved
  it; a transient refusal, a save that failed or a crash before the acknowledgement left the signal waiting on the
  Bridge until a full reconnection. The port now keeps three cursors, received, delivered and durable, and every
  poll or reconnection asks from the durable one (the acknowledged sequence): the signal is delivered again, with a
  wait that grows up to a minute while nothing settles; a stream the Bridge keeps open is ended by the player after
  that wait and reopened from the durable cursor (`docs/en/REALITY.md`). The reproduction tests of #22 are the
  fix's tests.

- **The update never activated from the title screen of a game with a save** (4.1.8, found by the new PWA
  scenarios). The banner's "update now" saved before activating, and on the title screen there is no game running:
  `save()` on nothing threw inside `beforeSave`, the failure was reported as a storage error and the old version kept
  running, whatever the player clicked. The banner saves only a game in progress, still waits for any pending write,
  then activates (`tests/dom/update-offer.test.ts`).
- **The offline warm-up could fill nothing** (4.1.8). Its fetches reach the caches through the service worker, and
  on a first visit the worker did not control the page yet (`clientsClaim` was off): Firefox reported 218 files
  "complete" with 111 of them absent from the cache. The worker now claims the page at its first activation (an
  update still waits for the banner); the warm-up waits for that control before it starts (twenty seconds at most,
  then `skipped` with the reason `worker`, and the pause menu's retry asks again), and with a Cache API it trusts the
  cache, not its memory: a file warmed around the title before the worker took control is fetched again through it.

### Changes

- **Every public export says what it is and how stable it is** (4.1.8, programme §4.3). The 119 names the five entries
  of `web-scumm/{content,player,minigames,testing,reality}` re-export carry, on their declaration, a first sentence and
  one of `@public` (a name a game or host calls or reads: 101) or `@extension` (a contract a game or host implements, a
  `Presenter`, a `SaveStore`, a `SceneRenderer` and its specs, a `Minigame`, a `CustomCommand`, a `WorldSignalPort`:
  18; a member added to one is a break too). `tools/api-doc.ts` writes a Stability column into `docs/en/API.md` and
  `docs/fr/API.md`, prints aliases as what they are (`type Id = string`, `type Point = [number, number]`,
  `type Keyring = BridgeKey[]`; a side derived from a schema shows its members), says `deprecated` beside a
  stability, and `tests/api-doc.test.ts` and `npx tsx tools/api-doc.ts --check` fail on an export without
  description or stability, or with both tags. 65 descriptions were written for names that had none. What
  `src/engine` exports without an entry re-exporting it is internal by construction. knip's unused-export rules are
  on: its 71 reports (44 exports, 27 types) are answered, about 80 declarations losing their `export`, 17 names
  leaving re-export lines, three dead symbols deleted; the Bridge's `DEFAULT_LIMITS`, `POLICY` and
  `BridgeEventSchema` are kept as `@public`. `tests/api-surface.json` is unchanged: no public name moved.
- **The documentation says one thing** (4.1.8, programme §4.8). An audit of every page against the code and the
  workflows found and fixed: the READMEs' test count, first-visit weight and the reference game's states now come from
  `tests/quality-baseline.json` (`npm run quality:baseline` writes them between markers and `--check` fails when they
  lag: 788 declarations at the audit and 945 at the tag, 120 KB and 288 states, where the pages said 910, 123 and 578); the nightly corpus is 500 random games of each of three kinds, not
  "1 503"; the sample game has had no non-commercial music since 3.7 (SECURITY.md, TOOLS en/fr and a code comment
  still excepted it); the SemVer promise of the READMEs and CONTRIBUTING is bounded to 4.1.7, with the incubation
  line after it; PACKAGE.md names the third package, `web-scumm-bridge`; CREDITS names zod and the Biscuit test
  vectors' licence; MIGRATION-4.1.8 says Vite 8.3.3. `npm run doctor -- --release` no longer requires Firefox and
  WebKit: `release-check` opens no browser (the e2e run in CI on every change), and `release.yml` installs Chromium
  only. `npm run docs:links` asks every external link of the docs once and prints the statuses by domain, for a
  person before a release; CI never runs it.
- **The Studio's three biggest files split into model, IO and views** (4.1.8, programme §4.7). `src/studio/storyboard.ts`
  (1377 lines), `assets.ts` (1364) and `rooms.ts` (1358) were the three exceptions to the 800-line rule the Studio
  had kept; each is now a tab of 285 to 609 lines over pure modules (`*-model.ts`, `rooms-text.ts`), the IO
  (`assets-io.ts`, the editor iframe's `rooms-bridge.ts`) and views that receive a small host interface
  (`storyboard-view.ts`, `storyboard-preview.ts`, `assets-sheets.ts`, `assets-decors.ts`, `assets-sounds.ts`,
  `assets-view.ts`, `rooms-lines.ts`, `rooms-sheet.ts`), the largest 663 lines. Same DOM, same texts, same API
  calls and message payloads; twelve happy-dom test files (105 tests) now cover what the tabs render and send,
  which nothing tested before. `tests/file-size.test.ts` keeps three exceptions (the validator, the layout editor,
  the Studio assistant), not six.
- **The PWA proven in three browsers, update included** (4.1.8, programme §4.5). `npm run e2e:pwa -- --serve=dist
  --update --interrupted --reinstall` serves the build itself, publishes a second one and checks: the banner after a
  durable save and the new worker in charge with the save kept; an update whose worker fetch fails (no banner, the
  old worker keeps serving, the game runs); a reinstall (worker and caches gone, installed again, the save kept);
  then the whole game opened offline. Chromium and WebKit in the `e2e` job, Firefox in the new `pwa-firefox` job
  (Firefox's only gate; `docs/en/SUPPORT.md`). WebKit still cannot navigate offline under Playwright: that step is
  reported skipped, never counted; installing from Safari on an iPhone and updating there remain a person's check
  before each release (`docs/dev/passes/`). Firefox's worker was seen, on CI only, refusing one cached image offline
  ("intercepted the request and encountered an unexpected error", the file in the cache every time): the job reports
  it as the worker's error and does not count it (two files at most, more is a failure); Firefox offline on a real machine joins the human passes.

- **Windows in CI** (4.1.8). A `windows-latest` job runs the doctor, the type checks and the unit suite (six test
  files that assume POSIX left out, named in the workflow: file modes, `/` in paths), builds the sample game and asks
  the production server for a page; `npm start` is a Node launcher (`scripts/start.mjs`) instead
  of a shell line with a Unix expansion that cmd.exe and PowerShell did not know. The job is reported, not yet among
  the checks the ruleset requires (the maintainer's).
- **A release check that predicts the release** (4.1.8). `npm run doctor -- --release` requires every prerequisite
  `release-check` runs (Python and its modules, ffmpeg, and Chromium as always; the other browsers since the
  docs-truth lot), and `release-check` starts with it. The
  packages are made from tracked files only: an untracked file under a shipped root refuses `npm run pack` rather
  than travel or vanish silently; `--publish-dry-run` shows what `npm publish` would send for each of the three,
  and `release-check` runs it. `fresh-install` installs `create-web-scumm` from its own tarball and runs it, beside
  the engine's and the Bridge's. The coverage ratchet is strict in CI and the release (a floor three points under
  the measure is red), with the floors raised to within three points of what the suite measures on this branch,
  totals and per file (so a pull request that adds tests may have to raise a floor: the ratchet says which). After
  a release is published, `release.yml` downloads it and verifies its sums and every attestation (`ship verify`).
- **The Reality transport and the Bridge, bounded** (4.1.8): the SSE parser accepts lines ending with CRLF or CR,
  removes one space after `data:` as the specification says, and drops a stream whose event is over 64 KiB or that
  holds over 1 MiB without an event's end (the port reopens it from the durable cursor); the Bridge's cache of
  signals signed again after a rotation is an LRU of 10 000 (`limits.resignedCache`); every line of the journal is
  checked whole against the events' schema (a line that is JSON but not an event is corruption); one Bridge per
  journal (`journal.jsonl.lock` with the owner's pid, created atomically; a lock left by a crash is taken over and
  said, a lock that is not a pid is refused; `compact` takes it too; `serve` ends its streams, closes and then
  releases it on SIGINT and SIGTERM).
- **Vite 8 and vite-plugin-pwa 2** (4.1.8). The bundler is Rolldown: the sample game builds in half a second where
  Vite 6 took several, the first visit's JavaScript goes from 123 to 120 KB gzipped (the main chunk 388 kB, 123.6 kB
  gzipped, was 391 / 125.7), the chunks for the tools and for Reality keep their folders (`rolldownOptions`, the
  same functions on `moduleIds`), every file of the build is accounted for and the weight budgets hold. The service
  worker is still Workbox 7 through the plugin's 2.0 (one peer range changed, nothing in the options the game uses).
  Node 22.12 or newer (`engines`, the READMEs, SUPPORT), what Vite 8 and Vitest 5 require. Vite's native
  configuration loader, experimental and planned for a later major, warns about imports without a file extension in
  the configuration's import graph (68 files, since the Studio plugin pulls the engine's tools): said, not silenced,
  to be addressed when that loader becomes the default.

- **TypeScript 7** (4.1.8). The type checks (`npm run check`, `npm run quality`) run on the native compiler, in half a
  second where 5.9 took ten; `npm run tsc` is its command (the `tsc` bin link belongs to the tools' package, below).
  `tsconfig.json` and the project `create-web-scumm` writes have no `baseUrl` and relative `paths`, which 7 requires;
  `web-scumm migrate` rewrites an older project's (`--check` says when). The five tools that use the compiler API
  (`api-doc`, `ids`, `mutate`, the Studio's source reader and core) import `@typescript/typescript6` (6.0.2, the
  last line with the API) until 7.1 ships one (`docs/dev/MIGRATION-4.1.8.md`). `src/engine/dom/walk.ts` imports
  `navmesh`'s named export, not its default: a CommonJS module a bundler following Node's rule hands whole (Vite
  8's blocker, removed ahead of it).

- **The baseline of 4.1.7, before 4.1.8 touches the toolchain.** `docs/dev/baselines/4.1.7.md` freezes what the
  last release measured (tests, coverage, mutation, bundle and weights, proofs, build and release times, file
  sizes), each number with its source. `tests/reality-cursor.test.ts` is the reproduction of the Reality cursor
  defect (the transport asks the Bridge for `after=1` once signal 1 is handed over, acknowledged or not; in polling
  and in SSE), kept red on purpose (`it.fails`) until the fix; `tests/formats.test.ts` and `tests/fixtures/formats/`
  freeze the four formats the engine writes and reads (a session file, a save envelope and a signed world signal
  parsed by their production readers; a solver report by its keys). The baseline's test count ratchets (728 → 945 at the release
  declarations; `it.fails` is not counted). `docs/dev/MIGRATION-4.1.8.md` lists what TypeScript 7, Vite 8 and vite-plugin-pwa 2 change, read
  before any of them is touched.
- **The 4.1.8 → 4.1.15 programme** (D18, 7 October 2026). After 4.1.7 the project does not go to 4.2.0 "Finale": it
  runs eight more releases first (Foundation Reset, Gateways, Constellation, Viewport, Language, Proof at Scale, Time
  Attack, Remix), then 4.2.0 "Stable World" takes what "Finale" planned. `docs/dev/PLAN-4.1.8-4.1.15.md` is the
  programme (French, the source); `docs/dev/PROGRAM-4.1.md` its English page; the ROADMAP and SUPPORT say what it
  changes for a host: from 4.1.8 the 4.1.x line is an incubation line where a release may break a public name or a
  format, documented and with a migration, until 4.2.0 restores strict SemVer.
- **The release chain as commands.** `npm run ship -- <checks|merge|main|tag|watch|verify|chain>`
  (`tools/release/ship.mjs`): what the 4.1.2 → 4.1.7 releases were run with, kept in the repository instead of a
  session's scratchpad; one re-run of a failed job, a tag never moved, the release downloaded and its sums and
  attestations verified. A pre-release tag (`v4.1.8-rc.1`) is published as a GitHub pre-release and its notes say
  which version it candidates for.

- **The mutation gate, honest and cheap to carry** (4.1.8). `tools/mutate.ts` writes a report keyed by the hash of
  its inputs (the set's sources and tests, the two configurations, the tool, the named survivors, the lockfile;
  `--hash` prints it) and reuses a report of the same inputs instead of running again (`--fresh` runs anyway): a
  commit of docs or of a version does not re-run the sets. CI gains a `mutation` job on both sets, cached by that
  hash (on `main` and on a pull request labelled `full-ci`: an ordinary pull request does not wait an hour for it); `release.yml` restores the cache before `release-check`, which runs `--set=all`; the nightly runs both sets
  fresh and gated (no `continue-on-error`). A mutant is judged by the tests of its own set (`all` runs the sets one
  after the other), and a run that exceeds three minutes is killed with its whole process group (vitest's forked
  workers included: the orphans of a killed parent had slowed CI's runner to a 90-minute cancellation). The sets'
  sources and tests live in `tools/mutation-sets.ts`, read by the tool and by `vitest.mutation.config.ts`. A named survivor may name the source line it sits on (`context`), so it
  never covers another mutant of the same file; `--doc` writes the table of named survivors into MUTANTS.md and a
  test keeps the two equal. **The Reality set's unexplained survivors are gone**, and `http-port.ts` (the player's
  transport, rewritten by the P0 fix) joins the set: 121 killed by four new test files (`tests/bridge-mutants.test.ts`,
  `tests/bridge-store.test.ts`, `tests/reality-client.test.ts`, `tests/reality-port.test.ts`: the exact edges of
  expiries, quotas and size limits, revocations landing inside the lock, the journal's retention and rewrite, the
  client's refusals and its stop, the port's backoff, cursors and parser), 16 named as equivalent with their reason
  and the source line they sit on (25 names, one per line); two old equivalents, now killed, left the list. Measured at
  the tag (the lock's races tested on purpose after CI's runner never reached them): 589 of 614 mutants killed,
  every survivor named.

## 4.1.7 — 2026-10-06

"Docs for a Studio" (LOG #103): the plan's sixth release, the last before 4.2; the documentation a studio reads
first, after the code it describes. What this release does not do is in the LOG and the passes sheet.

### Changes

- **Docs for a studio** (4.1.7, the plan's sixth release). The READMEs rewritten in both languages: one pitch,
  three commands, what each role gets, the screenshots taken again from the current build, one table of numbers,
  the current release in one paragraph (the release-by-release stack is the CHANGELOG's), a non-affiliation note
  (also in CREDITS.md). `docs/en/TUTORIAL.md` and its French twin: a first room in fifteen minutes. `API.md` carries
  the public API's signatures, generated from the sources (`tools/api-doc.ts`, held by `tests/api-doc.test.ts`).
  SUPPORT.md says the 4.1.x policy once and has a support matrix (what CI checks, what only people check). STUDIO.md
  in French has the three sections it summarised (Assets, Demo, Assistant); a test keeps every French page within a
  third of its English twin, section by section; another checks every relative link in the docs. AGENTS.md loses
  the rules of the pair work that ended with v3; CLAUDE.md points at the right pages. The release notes drop the
  work log's entry and decision numbers. `CODE_OF_CONDUCT.md`, a pull request template and a feature issue template;
  the wiki is off. Fixed: a warm-up of the assets in progress ended with `App.destroy()` neither its idle waits
  nor its fetches (CI's node-24 saw `window is not defined` from a test's torn-down page); the bank now carries the
  player's abort signal and stops at it. The first visit's JavaScript goes from 122 to 123 KB gzipped for it (the
  baseline moved on purpose; the budget, `initialJsKB` 140, is untouched).

## 4.1.6 — 2026-10-06

"Studio Tool" (LOG #102): the plan's fifth release; what a studio touches every day, made to leave the tree clean,
run without Python and on Windows, and say what is optional. What the plan listed and this release does not do is in
the LOG and the passes sheet.

### Changes

- **The studio's tool** (4.1.6, the plan's fifth release). No tracked file is written by `dev`, `check`, `build` or
  `new-game` any more: the current game is `.cache/game`, a symbolic link `npm run game` points (tsconfig.json's
  `@game` paths look there; 4.1.5 rewrote tsconfig.json). `npm run build` no longer needs Python: the pixel tests
  stay in `npm test` and CI. `npm run doctor` tells required (Node, Chromium) from optional (Python and its modules,
  ffmpeg, WebKit): exit 0 when only optional ones are missing. The MCP server reports the engine's version. The
  verbs are 44 px high at least on a phone; the page may be zoomed (no `maximum-scale`, no `user-scalable=no`).
  `packageManager` and `.nvmrc` pin npm and Node. The scripts that set a variable go through `cross-env` and the one
  that made a directory through Node: they run on Windows. `requirements.txt` pins its three modules. The Vite
  plugins (the layout writer, the Studio's demo snapshot, the sealed build, the assets' version, `site.json`) live
  in `tools/vite/plugins.ts`; `vite.config.ts` is the configuration. `prefers-reduced-motion` stops every animation
  (the call frame's, the map's news, the credits, the rotate hint included); the focused target's label is 12 px.
  `web-scumm doctor` and `web-scumm mcp` join the command line. The Mega Drive pipeline says what to do on Windows
  instead of failing on a missing download. The e2e harness reads the camera through `view.camera` (the 4.1.5 split
  left its visibility test reading a field that was gone, so a wide room's target was tapped at the screen's edge).
- **CI without silly timeouts** (4.1.6, merged before its tag). Every install step of the workflows (Playwright's browsers, pip, apt,
  `npm ci`) is retried three times and held to 8 minutes: a download that hangs no longer keeps a job for its
  45-minute limit (a `playwright install` did, on 6 October, for 45 minutes).

## 4.1.5 — 2026-10-06

"Real Core" (LOG #101): the plan's fourth release; the split that 4.1.0 announced, done behind the baseline, one
branch per step, no change of behaviour. What the plan listed and this release does not do is said in the LOG and
the passes sheet.

### Changes

- **The core's real split** (4.1.5, the plan's fourth release; no change of behaviour: the quality baseline is the
  same before and after each step). `step()` is a table of handlers (`core/command-handlers.ts`, one function per
  command key, type-checked against the union); the script loops have an owner (`core/scheduler.ts`,
  `ScriptScheduler`); the keyboard targets and the inventory slots are diffed, not rebuilt, on a state change (a
  focused target keeps its focus, and a key on it advances the line it caused); `targets()` computes the guests once;
  the room view's camera (`dom/camera.ts`) and walking (`dom/walker.ts`) are owners of their own, the entity type has
  its module, and `dom/room.ts` is under the 800-line limit without an exception (1026 → 744). Hosts that reached
  `view.toScreen`, `view.setCamera`, `view.walkTo`… use `view.camera.*` and `view.walker.*` (the dev overlay, the
  e2e harness and the perf probe do). The session has an owner, `Engine.sessions` (`SessionLog` in
  `core/session-runtime.ts`: the entries, their feed on replay, the clock's origin), where 4.1.0 kept those fields on
  the Engine for functions to mutate; `engine.session`, `begin`, `choose`, `rand`… are unchanged.

## 4.1.4 — 2026-10-06

"Honest Engine" (LOG #100): the plan's third release; nothing in the content or the commands, everything in how the
engine ends, fails and keeps time. The first release merged by pull request under the ruleset of 4.1.3.

### Changes

- **The engine's honesty** (4.1.4, the plan's third release; nothing in the content or the commands). `Engine.destroy()`
  and `App.destroy()`: the script loops stop, whoever waits is released, the listeners the player put on the window
  and the document end with it (`AbortController`), the frame loop and the fps meter stop, the palette cache gives
  its blob URLs back, the audio's document listeners go, the world link stops. `Engine.onError(error, where)`: a
  script that throws is stopped, marked `off` in the save and said (4.1.1 logged it and left the save calling it
  alive), a custom command that changed more than it declared is said there too, an unknown minigame throws (the
  validator refuses it anyway). Time comes from the injected clock alone: `started`, a trace entry, a session's date;
  `saveEnvelope(game, state, now)`. `Engine.beforeSave` and `Engine.onLoad` replace the player's rewriting of
  `store.save` and `engine.load` (the music's phase goes through them); the pause menu undoes what it set up through
  one list of cleanups. `waitUntil` wakes on the state change that satisfies it, a quarter of a second at most
  behind. Dead code: three copies of `EngineOptions`, two duplicated module headers, two copies of `esc` and `sleep`.
  `knip` runs in `npm run quality` for dead files, dependencies and duplicates (`esbuild` listed as the dependency it
  is; the unused-exports rule stays off: 216 exports to judge, a chantier of its own); the Biome configuration
  migrated to its current shape.
- **One place for the state's keys, English placeholders.** `core/keys.ts` builds and reads every key of
  `GameState.seen` (a topic, a listener, a choice, a signal) and the room-scoped keys of `props` and `actors`, where
  ten sites spelled them by hand and parsed them with `indexOf('.')`; nothing in a save changes. The placeholders of
  a fallback, kind or give line are `{item}`, `{target}` and `{name}`; `{objet}`, `{cible}` and `{nom}` stay as their
  4.0 names, so every game keeps working (`docs/en/CONTENT_GUIDE.md`, which also says what the four `once`s are).

## 4.1.3 — 2026-10-06

"Honest Gates" (LOG #99): the plan's second release, nothing in the game, everything in what guards it; the CI made
worthy of trust before the refactorings of 4.1.4 and 4.1.5 lean on it.

### Changes

- **The gates, made trustworthy before the refactorings** (4.1.3, the plan's second release). The workflows read only
  (`permissions: contents: read`; Pages asks for its own), cancel a run a newer push supersedes, stop after a
  deadline (`timeout-minutes` on every job), run on `ubuntu-24.04` by name, and pin every action to a commit. The
  unit suite runs once per push (`check`, and `coverage` under V8) where it ran five times: the second game and
  the reference chapter build with `npm run build:game` (the game's gates and the bundle, no `tsc`, no unit suite),
  which `npm run build` now composes with `check` and `test:assets`. The CPU-bound solver tests (the abstraction
  audits, the canonical owner, the memo and ownership proofs, the reference chapter's proof: 14 tests with
  five-minute ceilings, the push suite's whole instability) leave the push: `npm run test:heavy` runs them every
  night, `npm test` and `test:coverage` exclude them. A `node-24` job runs the quality checks and the unit suite on
  the next Node. `tools/coverage-ratchet.ts` compares the floors with what the tests reach and names a floor at
  least three points behind (the coverage summary is an artifact); the floors of 4.1.2 are raised where it said so.
  `npm run quality:baseline` says what behaviour it moves when it rewrites the baseline, and `--check` names a
  policy measure that got better (a ratchet to make on purpose): a rewrite is no longer silent. `release-check`
  runs what CI runs (`quality`, `test:coverage`, `reality:xcheck`, `test:mutation:core`) before the proofs and the
  audits. `.github/CODEOWNERS`: the frozen behaviour, the public surface, the named mutants, the floors and the
  workflows ask for the maintainer's review. On GitHub: a ruleset on `main` (the gates required, no force push, no
  deletion), merges by pull request, Dependabot alerts and security updates on, merged branches deleted, topics.

## 4.1.2 — 2026-10-06

"Reliable Bridge" (LOG #97–#98): the Reality Bridge of 4.1.1 after an outside review relayed by the maintainer and
checked against the code (three of its four P0s real, the fourth shown not to apply), and the first release of the
plan towards a professional engine for a small studio: nothing added to the content, the commands or the scripts;
what 4.1.1 promised made true under concurrency, across devices, through a rotation and under load, then measured
by mutation. Nothing to change in a game; a 4.1.1 Bridge keeps its `config.json` and its journal.

### Fixes

- **Bridge: one proposal at a time per player.** In 4.1.1 `propose` awaited the Biscuit check and the signature
  between reading a player's last sequence and writing the journal, so concurrent proposals could all take the same
  sequence, and two with one `dedupeKey` were both accepted; the player's client then skipped the others as already
  seen, and a signal was lost. The deduplication, the quotas, the sequence, the signature and the journal line now
  run under a lock per player (`bridge/src/lock.ts`), where the player and the token are checked again: a proposal
  that overlaps a revocation is refused. A pairing code confirmed twice at once is confirmed once (409 for the other).
  Found by an outside review of 4.1.1 (the first of its four P0s), reproduced in `tests/bridge.test.ts`.
- **A save is bound to its player.** In 4.1.1 the client acknowledged a loaded save's cursor with whatever link the
  device held, so a save imported from another device (or saved before an unlink and a new pairing) could
  acknowledge, for the new player, signals that save never applied, or loop on a refused acknowledgement. The first
  signal now writes the Bridge's pseudonymous player id into the save (`GameState.reality.playerId`, the field 4.1.1
  declared and never filled; a session entry carries it too, so a replay is exact); a signal for another player is
  `mismatch`: nothing applied, nothing acknowledged, the link idles with that status and the pause menu offers to
  use this device's link with that save (its link state starts over, cursor 0). The outside review's second P0.
  `docs/en/REALITY.md`, two interface texts (`realityMismatch`, `realityRelink`).
- **A rotation no longer strands a player.** In 4.1.1 the journal kept the signature only, nothing re-signed, and a
  link that was open kept its keyring, so a signal signed by a key past its window was refused for good and the
  cursor stuck (the outside review's fourth P0). The journal now keeps the payload as accepted and the Bridge signs
  what waits again under its current key at delivery (`JournalEntry.payload`, `kid`); a client asks for the keys once
  when a signal names one it does not know (`RealityClientOptions.refreshKeys`, wired in the player). Key windows
  and expiries carry five minutes of clock tolerance (`CLOCK_SKEW_MS`, the same in the Rust cross-check; the
  conformance corpus has a case on each side, 22 → 25). `GET /v1/signals` answers `{ signals, sequences }` and the
  poll transport follows the sequences instead of counting. Event streams: at most 4 per player (429 beyond), closed
  by the Bridge when the link is revoked or expires or when the reader stops reading (64 KB unsent); a signal
  accepted while a stream opens is held and sent after the backlog (the review's third P0 could not happen: the
  backlog and the subscription were one synchronous tick; the stream now registers first, and a test proposes while
  it opens). `docs/en/REALITY-OPS.md` "Keys and rotation" rewritten.
- **The journal survives a crash and is read, never matched.** A last line cut short by a crash (no newline, not
  JSON) stopped the Bridge from starting; it is dropped and said in the log (`journal.repaired`), while any other
  line that does not parse is still refused as corruption, with its number. Forgetting a player rewrote the file
  by matching its id as text, which took another player's line whose `dedupeKey` was that id; each line is now read
  as an event. The rewrite fsyncs the directory after the rename where the system allows. Two commands:
  `web-scumm-bridge doctor` (what the journal holds, torn or corrupt) and `web-scumm-bridge compact
  [--retention-days=90]` (pairings past their time, earlier versions of a player's line and signals acknowledged and
  older than the retention dropped; a player's last signal and everything unacknowledged kept). The review's P1s on
  the store.
- **The Bridge's surface, bounded.** Codes waiting for a confirmation live in memory only (1000 at most, swept),
  where 4.1.1 appended and fsync'd a journal line for every anonymous request. Per address: 60 requests a minute on
  the routes anyone may call, and 60 failed authentications a minute before every request of that address is
  refused for a while (`Retry-After`); `serve --trust-proxy` reads `X-Forwarded-For`. A proposal's token is checked
  before any player is named (a 401 or 403 before any 404; the manifest, public, still answers 422 first). A capability lives 180 days at most from its
  pairing, renewals included. `POST /v1/unlink` (Bearer capability): the pause menu's "Unlink" revokes the link on
  the Bridge, not only on the device, and a reconnection planned before it no longer brings the old link back. The
  operator's token is compared in constant time. `init` writes the Biscuit root's private half to `root.key`, read by
  `grant` only (`serve` never loads it; a 4.1.1 `config.json` still works); the demonstration webhooks' tokens live 30
  days (`--demo-days`), and `init --no-demo-webhooks` leaves them out for a Bridge on the Internet. The review's
  remaining P1s; its key-pinning ask is answered in `docs/dev/THREAT-MODEL.md` instead (the signing key lives on the
  Bridge: a pin would not survive its compromise, and TLS already names the host).
- **A required signal's fallback is proved, not only named.** `validate` checked that a `fallback` matched a rule;
  the content lint now checks that the closed witness plays it, and says `fallback-unplayed` (a warning) when the
  game finishes without the world outside by another route: the declared rule is not the way through, and may be
  dead. The review's P1 on the fallback proof, as a lint rather than a validation error: the closed proof still
  holds, the declaration is what is wrong.
- **What a signal rests on is falsified like what a save rests on.** Mutation testing gains a `reality` set
  (`npm run test:mutation:core -- --set=reality`: the engine's receive, the protocol, the client, the Bridge, its
  store, its lock and its policy, judged by the Reality and Bridge tests) and a gate by identity: every surviving
  mutant is named in `docs/dev/mutants.json` (file, operator, from, to, why), and a survivor not named there fails
  the run in every mode, where 4.1.1 compared a count. Measured on the reality set: 382 of 484 killed, 14
  equivalents named, 88 survivors listed as missing tests in `docs/dev/MUTANTS.md` (the nightly runs the set
  without gating until they are killed or named). The corpus gains seven cases (the exact edges of the clock
  tolerance, a header that is a list or null, a payload that is JSON but not an object), and one found a divergence:
  a list header was `algorithm` in JavaScript and `header` in Rust; it is `header` in both. Coverage includes
  `bridge/src` with floors. Properties at
  random (fast-check) on concurrent proposals: sequences 1..n and one acceptance per `dedupeKey` whatever the
  interleaving; a write that fails (disk full) leaves nothing behind and the next proposal takes the same sequence.
  The package `web-scumm-bridge` is now one JavaScript module (esbuild) plus its Datalog policies: Node 22,
  Biscuit's WebAssembly and zod, no `tsx`, no TypeScript at run time; `fresh-install` installs it from its tarball
  outside the repository, runs `init --no-demo-webhooks` and `doctor`, starts it and reads its keys; the release
  carries the Bridge's own SBOM and attests every file it uploads. The Studio's write routes accept a `Host` that
  names this machine (`localhost`, `127.0.0.1`, `[::1]`, or the LAN address `dev:lan` serves) and nothing else, so a
  page that rebinds a name to the Studio's port finds the door closed. `npm run seal` no longer prints the password.

## 4.1.1 — 2026-10-06

"Reality Bridge" (LOG #96, D14–D17): a game can react to a fact from the world outside (an email answered, a webhook
called) without its content touching the network. A separate Bridge turns the fact into a short signed signal from
a finite alphabet the game declares; the player verifies it, applies it at most once, saves, then acknowledges; a
session replays it offline; the solver proves a game closed, under a scenario and against any order of signals. The
plan is Codex's, `docs/dev/PLAN-4.1-REALITY-BRIDGE.md`, adopted as 4.1.1 on the clarified code. A game without
`reality` pays nothing: no code in its first visit, nothing in its offline cache, no request.

**Versioning**: 4.1.1 adds a public entry (`web-scumm/reality`) and content fields, which semantic versioning calls a
minor. The maintainer chose the number (D14: the project stays on 4.1.x, 4.2 is the final version); it is a one-off
exception recorded in `docs/en/SUPPORT.md`. Every addition is optional: a 4.1.0 game, its saves and its sessions are
unchanged.

### API

- New entry `web-scumm/reality` (23 names, `docs/en/API.md`); `web-scumm/content` adds `RealityDef`, `SignalDef`,
  `RealityState`, `ExternalEntry`; the MCP's `solve` takes an optional `reality`. Nothing removed or changed.

### Changes

- **The release**: a third package, `web-scumm-bridge-<version>.tgz` (the Bridge on its own: `npx web-scumm-bridge init
  --manifest=dist/reality-manifest.json`, then `serve`), attached and attested with the others; a game with `reality`
  ships `reality-manifest.json` in its build (`verify:dist` requires it). The demo's first visit: 120.7 → 121.2 KB, the
  hooks only. Golden saves: `demo-4.1.1.json`, and `signals-4.1.1.json` with a link state. `docs/dev/adr/0007`, the
  code tour's step 8, a section of `ARCHITECTURE.md`.

- **Reality Bridge, the spike** (4.1.1's lot A, `docs/dev/reality-spike.md`): Ed25519 is in WebCrypto in Node,
  Chromium and WebKit; the player's verifier of a compact JWS is 381 bytes gzipped (D15); Biscuit runs on the Bridge
  from its WebAssembly build, loaded without an experimental flag (`bridge/src/biscuit.ts`), 0.24 ms to authorise
  (D16); delivery by Server-Sent Events and a fetch by cursor (D17). `npm run reality:xcheck`: Biscuit's official
  samples (vendored with their licence in `bridge/test-vectors/biscuit`) give the specification's verdict in
  JavaScript and in the Rust crate (`bridge/xcheck`), 49 validations, in a CI job of their own. `npm run
  reality:spike` reproduces the measures. `docs/dev/THREAT-MODEL.md`. The engine never imports the Bridge
  (`tests/boundaries.test.ts`).
- **Reality Bridge, the protocol** (lot B): `src/engine/reality/protocol.ts` checks a signed signal in the order
  size, shape, algorithm and key (with rotation windows), the Ed25519 signature on the transported bytes, then the
  payload (`WorldSignalV1`, a strict schema), the game, the player, the manifest and the expiry; each refusal has a
  code. `src/engine/reality/manifest.ts`: a game's manifest of signals and its hash. Content types `RealityDef`,
  `SignalDef`, `RealityState` (`GameDef.reality`, `GameState.reality`; API). The Bridge's Biscuit policy
  (`bridge/policy/propose.datalog`, `bridge/src/policy.ts`): a connector proposes only the game, sources, signals,
  players and audience its token grants, before its expiry (to the second, strict), unless revoked; attenuation only
  narrows. Conformance: 22 signed cases (`tests/fixtures/reality/conformance.json`, test keys from fixed seeds) and 9
  policy cases, the same verdict in JavaScript and in Rust (`npm run reality:xcheck`).
- **Reality Bridge in the engine** (lot C): `Engine.receive` applies a verified signal at most once
  (`core/reality-runtime.ts`): the save keeps the last sequence without a gap and the ids applied above it
  (`GameState.reality`, validated on load), a delivery seen before is a no-op, out of order waits for the gap, the
  effect is the event of the signal's name, once per game unless `once: false`. A signal is a session entry
  (`ExternalEntry`, API): `replay` applies it offline; no token, payload or address is ever recorded.
  `WorldSignalPort` (`core/ports.ts`) and `RealityClient` (`src/engine/reality/client.ts`): verify, apply, wait for
  the durable save, acknowledge; a refusal is never acknowledged, a signal the Bridge signed that can never apply
  (expired, no longer declared) is recorded as skipped so the cursor moves on, and a loaded game acknowledges what
  it holds first. A crash before applying, after applying, after the save: delivered again, applied once
  (`tests/reality-engine.test.ts`). Biscuit authorises under explicit run limits (200 ms on the Bridge), so a slow
  machine never refuses a valid token as a timeout. `core/movement.ts` keeps `engine.ts` under 800 lines.
- **Reality Bridge in the proof** (lot D): `SolveOptions.reality` is `closed` (the default: the game on its own),
  a scenario (its signals in order, each able to arrive at any point after the previous one) or `adversarial` (any
  declared signal, at any point, again); every result says which world it holds in (`SolveResult.reality`). `npm run
  solve:reality`, in `prove:game` and the packaged `web-scumm release`: closed, each scenario of
  `games/<id>/reality/scenarios/*.json`, and adversarial, all proved without a softlock, never truncated; a required
  signal needs a scenario that sends it. The validator: signal ids, sources, modes, a required signal's `fallback`
  matching a rule, and in a game with `reality` an event listened to that nothing emits nor declares is an error. The
  puzzle graph shows each signal as produced from outside.
- **The reference Reality Bridge** (lot E, `bridge/src/`, `npm run bridge -- init|serve|grant|revoke`, `web-scumm
  bridge`): pseudonymous pairing by an 8-character code a connector confirms; signals proposed under a Biscuit or by
  an HMAC-signed webhook mapped to a finite signal; the manifest checked (and its hash at start), deduplication by
  the connector's key, a sequence per player, Ed25519 signatures with a key id and previous keys for rotation; the
  fetch by cursor and Server-Sent Events (read with fetch, so the capability travels in a header, never a URL); the
  player's capability only reads and acknowledges, and lives 30 days from its last acknowledgement; revocation of a
  player or a token; quotas per connector, a limit of signals waiting per player, a body limit; CORS for the game's
  origins; export and deletion of a player's data (the JSON-lines journal is rewritten without it); a log with no
  secret. `init` writes its keys and tokens with mode 600 under `.cache/bridge/`. The player's transport:
  `src/engine/reality/http-port.ts`. `npm run doctor` checks Ed25519 and Biscuit. The Bridge imports nothing but
  the protocol it shares with the player (`tests/boundaries.test.ts`).
- **Reality Bridge for players, authors and the Studio** (lot F): `GameDef.reality.bridge` names the Bridge; the pause
  menu's "World link" pairs the game with an 8-character code, shows the link's state (announced politely) and
  unlinks; `dom/reality-ui.ts` runs the client, one tab at a time (Web Locks), waits for a game in progress, and starts
  again after a failure. The Studio's Play tab has a Reality panel: a simulated Bridge (`SignalSimulator`) with faults
  (delay, duplicate, bad signature, expiry, order, a cut), through the same verification and save as a real one. The
  MCP's `solve` takes `reality`. A new public entry, `web-scumm/reality` (API). The sample game `games/signals/`:
  proved closed, under two scenarios and adversarial. `npm run e2e:reality` runs the plan's scenario on its production
  build in Chromium and WebKit (pair, the browser closed, the same webhook twice, offline, online, applied once, the
  session replayed with the Bridge stopped; WebKit cannot reopen offline under automation, as in `e2e:pwa`), in CI.
  A game without `reality` pays nothing: the engine's `receive`, the client and the link are a lazy chunk under
  `assets/reality/`, left out of its offline cache. `docs/en/REALITY.md` (authors) and `docs/en/REALITY-OPS.md`
  (operators: init, connectors, keys and `bridge rotate`, revocation, quotas, retention, export and deletion), in
  French too.

## 4.1.0 — 2026-10-06

"Clarity" (LOG #95, D14): a maintenance release focused on making web-scumm easier to read, review and contribute to.
It changes no gameplay or public contract: module boundaries are clearer, large responsibilities are separated, static
checks are stronger, and the architecture and quality evidence are easier to find. The plan is Codex's,
`docs/dev/PLAN-4.1.1-CLARITY.md`, adopted as 4.1.0. Same behaviour as 4.0.0, measured: every witness, proof and golden
save of `tests/quality-baseline.json`, the public surface byte for byte, the first visit 120 KB (122 on 4.0.0). Human
passes: 0 of 7 field passes, 0 of 1 outside review (D12, `docs/dev/passes/4.1.0.md`).

- Codex's plans after 4.0 in `docs/dev/` (D14): "Clarity" ships as 4.1.0, "Reality Bridge" as 4.1.1, 4.2 will be
  the final version. CI runs on `docs/…`, `test/…` and `refactor/…` branches too.
- `npm run quality:baseline -- --check [--dist]` (`tools/quality-baseline.ts`): the behaviour of 4.0.0 frozen in
  `tests/quality-baseline.json` before any refactoring. For the demo, the reference game and 13 solver fixtures: the
  witness (status, length, a hash of the digest after every input) and the proof (status, states, softlocks); the 13
  golden saves played to their end; the hash of the public API and MCP surface; the number of test declarations (may
  only grow); the first visit's JavaScript (may only shrink). Each difference is named. In the CI `check` job.
- **Biome** formats and lints the engine, the tools, the tests and the scripts (`biome.json`; a game's content in
  `games/` is linted, never reformatted, since the Studio writes it). The formatting is one mechanical commit, listed in
  `.git-blame-ignore-revs`. New scripts: `npm run format`, `format:check`, `lint:code`, `lint:content` (the content lint;
  `npm run lint` stays its alias through 4.x) and `quality` (all of them plus both TypeScript configurations), in CI.
- TypeScript: `noUnusedLocals`, `noUnusedParameters` and `noFallthroughCasesInSwitch` hold everywhere;
  `tsconfig.strictest.json` adds `noUncheckedIndexedAccess` on `src/engine` and `src/studio` (tests and `tools/`
  outside it). An index the code knows is there reads through `must()` (`src/engine/core/must.ts`), which throws with
  what was missing instead of carrying `undefined` on.
- The Canvas painter (`dom/render-canvas.ts`) is loaded the first time a room asks for it: a game that paints with
  the DOM no longer downloads it. The demo's first visit: 122 → 120 KB of JavaScript gzipped, the index guards above
  included (+0.5 KB). It stays in the offline precache.
- **The core split by responsibility** (`src/engine/BOUNDARIES.md`, "Inside the core"): `core/engine.ts` (1,667 lines
  once formatted) keeps the `Engine` facade, its state and lifecycle (795 lines); sessions, events, scripts,
  interactions, commands, world queries and players each live in a module of their own, called through a forwarding
  method in the same order of effects. `core/types.ts` re-exports `core/types/{content,game,stage,audio,state,session}.ts`.
  The public surface is unchanged (`tests/api-surface.json`, which now follows nested re-exports), and so is the
  behaviour (`quality:baseline`). `tests/boundaries.test.ts` refuses any cycle of static imports.
- **The player split the same way** (`BOUNDARIES.md`, "Inside the player"): `dom/app.ts` (2,343 lines once
  formatted) keeps `App`, the `Presenter` and the orchestration (780 lines); the shell, input, speech, map, menus,
  settings, offline and update, and the localStorage store each have a module. The production e2e (Chromium and
  WebKit, keyboard, saves, axe, offline, the double tap, the Canvas painter) give the same results.
- **The solver split** (`BOUNDARIES.md`, "Inside the solver"): `tools/solve.ts` (2,333 lines once formatted) is now
  `tools/solve/{search,expansion,abstractions,model,report}.ts` and re-exports what it did. The internal `Node` is
  `SearchNode`, and the search's types document their invariants. Same verdicts on every fixture, the demo's proof,
  its chapters, `--audit-abstractions` and 120 corpus games; the demo's proof with the audit takes 10.6 s against
  10.5 s on 4.0.0 (+1%).
- `tests/file-size.test.ts`: no file of `src/` over 800 lines, but seven listed with their reason (three Studio tabs,
  the validator, the room view, the dev editor, the Studio assistant), each capped at its size.
- **Data from outside starts as `unknown`** (lot F): no explicit `any` left in `src/` or `tools/` (Biome refuses a new
  one; tests may still use it). The storyboard has one normalisation (`sbLines`, `sbTopics`, `sbTalks`, `sbReactions`
  in `tools/pages/storyboard-data.ts`; the Studio keeps the fields it does not know) and one diagnostic,
  `storyboardProblems`: the page generator, the Studio's server, its in-browser demo and the MCP's `set_storyboard`
  refuse an invalid storyboard with the same sentences (`tests/diagnostics-parity.test.ts`). A panel without an id no
  longer becomes `"undefined"` in one reader and `""` in the other.
- **Test strength** (lot G): `npm run test:coverage` (V8) holds the floor measured at 4.1.0 (56% of `src/` in
  Node; the browser-only parts are the e2e's) and every branch of `core/cond.ts`, `diff.ts`, `migrate.ts` and
  `save.ts` (`session-runtime.ts` 93, `tools/replay.ts` 99, `content-ids.ts` 96, each gap explained in
  `vite.config.ts`); seven `tests/critical-*.test.ts` files reach them. `tests/properties.test.ts` (fast-check): on
  games played at random, a save comes back identical through JSON, a session replays to the same state, a migration
  twice is once. `npm run test:mutation:core` (`tools/mutate.ts`): 348 mutants of the critical core, 340 killed, the 8
  others equivalent and explained in `docs/dev/MUTANTS.md`; a new survivor fails it; nightly, with its report.
  Stryker was tried and dropped: under Vitest 5 it never activated its mutants.
- **For a reader new to the code**: `docs/en/ARCHITECTURE.md` (the layers, the life of an action from a tap to the
  autosave and the render, trusted content and untrusted input, storage and replay, the solver on the real engine,
  public and internal), `docs/en/CODE_TOUR.md` (seven steps, half an hour, each with its files and tests), both in
  French too; six ADRs in `docs/dev/adr/` (the DOM renderer, declarative content, the solver on the real engine, the
  session as the unit of reproduction, saves read back, the double tap); `CONTRIBUTING.md` gains how to read the code
  and the checklist for changing a command end to end, with `shake` as the worked example.
  `tests/docs-truth.test.ts` fails when one of these guides names a file that does not exist. The outside review's
  protocol: `docs/dev/passes/clarity-review.md` (D12, reported).

## 4.0.0 — 2026-10-05

"Stable Platform" (LOG #94): fewer new things, more promises. Nothing in the content format or the save format
changes: a 3.x game on schema 3 moves without a rewrite (`docs/en/UPGRADING.md` § 10), and every save of the 3.x line
loads. What changes is what is kept: the public API (`docs/en/API.md`) follows semantic versioning and the
deprecation policy of `docs/en/SUPPORT.md`. Human passes: 0 of 7 (D12, `docs/dev/passes/4.0.0.md`).

### API

- Stable from this release: `web-scumm/content`, `web-scumm/player`, `web-scumm/minigames`, `web-scumm/testing`, the
  authoring schema 3, the save envelope (schema 3), the Studio/MCP tools' arguments and the `web-scumm` command. Any
  other path into `src/engine` is internal.

### Added

- `npm run upgrade-check -- --from=<version | previous>`, a CI job: a game created with the previous release's
  package, a save made by that engine, then this engine installed, `migrate --check`, `verify`, `build`, and the old
  save loaded and played to the end.
- The independent game, "The Lighthouse", moved from 3.9.0 to 4.0.0 by installing the new tarball: nothing to
  migrate, `release --commercial` green, its 3.9.0 save loaded and played to the end (LOG #94).

### Added (asked for 4.0)

- **A double tap acts with the verb a player means** (`core/default-verb.ts`): through an exit, talk to a character,
  look at anything else; a single tap still only walks. A prop, a hotspot, an actor or an exit can name its own with
  `defaultVerb` (a cupboard: `open`). An item picked from the bag without a verb is **given** to a character and
  **used** on anything else, and the sentence line says which before the tap. Checked in Chromium and WebKit
  (`npm run e2e:taps`, in the reference job).

### Dependencies

- The open Dependabot pull requests are settled: taken, earcut 3.2.4 and the GitHub Actions majors (`setup-node` 7,
  `setup-python` 7, `upload-artifact` 7, `upload-pages-artifact` 5, `deploy-pages` 5); not taken, Vite 8 (its new
  bundler breaks a CommonJS default import: the game does not start) and TypeScript 7 (it drops `baseUrl` and
  non-relative `paths`): toolchain migrations for a minor of their own; nor the raised minimums of Pillow, NumPy and
  SciPy (a minimum is what the tools need, not the latest: NumPy 2.5 breaks other packages of a shared Python).

### Migration

- From 3.x: import from the four public entries instead of `@engine/*` (which keeps working, without the promise);
  use `EndingDef` instead of `RevealDef`; `npx web-scumm migrate --check` says whether anything else is due.

## 3.9.0 — 2026-10-05

"Independence" (LOG #93): a game no longer has to live in this repository. The engine is a package, a game made from
its packed template outside the repository is verified, built and played to its end in CI, and an independent game,
"The Lighthouse", passes the commercial release gate on the packed engine.

### Added

- The engine as a package (`docs/en/PACKAGE.md`): `npm run pack` makes `web-scumm` (the engine, its pages, its tools,
  the template, the `web-scumm` command) and `create-web-scumm`. `npx create-web-scumm my-game` makes a project with
  `game/`, `public/`, a `package.json` calling `web-scumm dev|studio|assets|verify|build|release`, and a `tsconfig.json`
  pointing into the package; the tools run on the project (`WEB_SCUMM_PROJECT`) and never write into the package.
  Releases attach both tarballs, attested and summed.
- `npm run fresh-install`, a CI job: packs, creates a game in an empty folder outside the repository, installs the
  tarball, runs `assets`, `verify` and `build`, and plays the game to its end in Chromium. A file of the project that
  names the repository fails it.
- The template has its own placeholder art, drawn from shapes (`tools/placeholder-art.py`): a new game no longer
  borrows the sample game's. `web-scumm migrate [--check]` brings a game to the current authoring schema (3), and
  `web-scumm ids` gives it its stable ids.
- The public API, as a preview of 4.0's contract (`docs/en/API.md`): `web-scumm/content`, `web-scumm/player`,
  `web-scumm/minigames`, `web-scumm/testing` (`src/engine/api/`, the package's `exports`). `tests/api-surface.json`
  holds their names and the Studio/MCP tools' arguments; `tests/api-surface.test.ts` fails on a change `API.md` does
  not document. The template imports from them only. `docs/en/SUPPORT.md` says what 4.0 will promise.

### Fixed

- `verify:commercial` found the files a source names only under `games/`, `tools/`, `src/`, `public/`: a game in its
  own project (`art-src/draw.py`) failed it. Any relative path counts now, resolved in the project; a URL never does.

### Deprecated

- `RevealDef`: use `EndingDef`; removed in 5.0.

## 3.8.0 — 2026-10-05

"Human Proof", the machine part (LOG #92): everything the field passes need is ready, and what a browser can check
is checked in Safari's engine too. The seven passes themselves are people's and devices' (D12, `docs/en/FIELD.md`):
0 of 7 done for this release.

### Added

- The reference chapter's two-score scenario (a plan on the phrase, the bridge, a save restored before the landing, a
  stop while a transition waits, the decoded peak under `transitionPeakMB`) runs in WebKit as well as Chromium, in CI
  (`npm run e2e:music -- --only=reference --browser=webkit`).
- `docs/{en,fr}/FIELD.md`: the seven field passes (screen reader, Safari offline, a real phone, playtesters, recorded
  voices, listening, signed tag), how to make each and what to bring back; the passes template has the listening row.
- Near misses in playtests: a tap on nothing within 24 px of a target counts for that room and target; the shared
  session carries the counts (ids only) and `npm run playtests` lists them.
- `?fps`: a frame counter (now and the lowest second) for the real-phone pass.

## 3.7.1 — 2026-10-05

"Artifact Truth": what is tested, what is declared and what is shipped are the same files (the review of 3.7.0, LOG
#91). `inventory(dist) = code + locked assets + named data + fonts + icons + licences`, checked on every build.

### Fixed

- The archive held what Vite copies from `public/`, shared by the games: the sample game's shipped the reference
  chapter's score and bridges, files its provenance lock never named. Every build now ends with `tools/dist.ts seal`:
  the files that are not the game's are removed and `dist/licenses/` is written (the engine's `LICENSE`,
  `LICENSE-ASSETS`, `CREDITS.md` from the provenance, `THIRD_PARTY_NOTICES.txt` with the licence of every bundled
  package and the fonts' OFL, `assets-manifest.json`). `npm run verify:dist`, a step of `build` and of
  `verify:commercial`, refuses any file of `dist/` that is not code, a locked asset with its reviewed bytes, a data
  file the game names, a font, an icon or a notice.
- A stinger that does not fit in the decoded audio beside the playing score is no longer played over the cap: the
  director lets it go (`stinger()` returns null, `lastStinger.skipped`) and it is streamed instead. The cap holds after
  every operation, which `tests/director.test.ts` now checks after every lifecycle case.
- `playtests --strict` passed with no session at all. It still only refuses a diverged session, and says when it
  checked none; the field quotas are new options (below).
- The release workflow builds the commit CI tested (`workflow_run.head_sha`), checks that the tag still points there,
  takes any SemVer tag (not only `v3.*`), and refuses a release that already has files (no `--clobber`): a published
  release is never replaced. The archive's assets manifest is attached beside it.
- CI runs on `feature/**`, `fix/**` and `release/**` branches, whatever the version (it stopped at `v37-*`).
- The nightly's shards split any total exactly (501 seeds ran 504) and the merge fails on a gap or an overlap
  (`audit:corpus --shard=i/n --total=N`, `--merge … --total=N`). The four-shard nightly ran on `main` (501 seeds of
  each kind: 910 compared, 593 partial, no divergence).
- The README's "Releases" section named v3.5 two releases later; `tests/readme-release.test.ts` now holds it to
  `package.json`'s version. Python bytecode (`__pycache__/`, `*.pyc`) is no longer tracked.

### Added

- Field quotas for playtests: `--require=N`, `--require-completed=N`, `--require-devices=N` (a diverged session counts
  for none), and `npm run verify:field` (`verify:commercial`, then 5 sessions, 3 played to the end, 2 device families;
  not a release gate, D12). A shared session says its device family (`ios`, `android`, `desktop`), nothing finer.

### Changed

- The player's first visit runs 122 KB of gzipped JavaScript (153 before): the save envelope's schemas use
  `zod/mini` (same checks, tree-shaken), and each built-in minigame loads when one starts
  (`src/engine/minigames/meta.ts` keeps what the tools read). New budget `assetBudgets.initialJsKB`, checked on the
  build by `npm run verify:dist`. The engine's layers are written down (`src/engine/BOUNDARIES.md`) and checked by
  `tests/boundaries.test.ts`: the core imports no DOM or tool, the player never the solver, the validator or the Studio.

## 3.7.0 — 2026-10-05

"Field Proof", the machine part (LOG #88–#90): what can be proved without a person. The human passes are still to
do (D12, `docs/dev/passes/3.7.0.md`).

### Changed

- The sample game's theme is written for the project: Tchaikovsky's *Swan Lake* oboe theme (public domain) set down
  note by note with its own harmony, harp, strings and bass (`games/demo/audio/projects/swan-theme/compose.py`),
  rendered by `npm run audio` with the same four stems. It replaces an arrangement of a CC BY-NC transcription: the
  sample game and the reference chapter have no release exception left and pass `npm run verify:commercial`. The
  theme is 54 s (66 s before): 79 MB decoded, 2.5 MB of stems.
- The nightly corpus runs in four shards, one job each, then a job adds them up (`audit:corpus --merge`).

### Added

- The reference chapter's market has a score of its own ("Night Market", D major, 96 BPM, stems melody, chords and
  bass) and two bridges: the theme hands over on its next phrase, the market hands back on its "home" marker.
  `transitionPeakMB` 150 (128 measured).
- `npm run e2e:music -- <url> --only=reference`, in CI on the reference build: the handover through the bridge, a save
  loaded before the way back lands, a stop while a transition waits, the decoded audio under the budget.

## 3.6.1 — 2026-10-05

"Audio truth": the 3.6.0 review's fixes (LOG #86–#87). The music now has three intents, `play`, `restore` and `stop`,
and the director owns everything it schedules.

### Fixed

- Loading a save while its own score played kept the current position: the saved phase was dropped when the track was
  already the current one. Loading is now a restore: the saved track starts at its point, even when it is playing.
- Loading a save with another score went through the story's transition (a marker, a bridge). A restore cuts.
- A stop, a restore or a new request during a scheduled transition left the old score and the bridge playing: the
  director only knew the new score. A transition is now a plan it cancels; the old score is stopped by a timer, not a
  stop scheduled up front.
- A score that fell back to its single mix started it from the top: the phase was cleared before the attempt. It is
  kept until something plays.
- A voice during a transition cancelled the new score's fade-in, and a bridge was not ducked. Voices duck one bus
  under everything the director plays.
- The bridge was not counted against `maxDecodedMB`, and stingers were never evicted. A bridge that does not fit is
  dropped, two scores that do not fit become a cut, stingers evict like scores.

### Added

- `assetBudgets.transitionPeakMB`: the worst transition's two scores and bridge plus the largest stinger decoded,
  bridges and stingers measured with ffprobe; required by a release with transitions.
- `validate` refuses a transition rule an earlier one covers, and a marker from `'*'` that a score it can leave lacks;
  it warns when a transition is over `maxDecodedMB`.
- The nightly corpus writes its counts (tried, compared, partial, diverged) as an artifact and on the run's page.

### Changed

- README: the 3.6 screenshots and numbers; corpus figures read "900 tried, 549 compared".

## 3.6.0 — 2026-10-05

"Production": the rest of the 3.5.0 review (LOG #80–#85). A save now keeps the music's phase (`state.music`, optional:
the 3.5 saves load as they are). The open matrix of 20 rooms × 3 characters stays truncated (600 000 states): the
target is missed again, as allowed (BENCH.md "3.6").

### Fixed

- The solver leaked about 15 MB a search. Each action raced a zero-delay timer that was never cleared, and a search runs
  in microtasks, so the timers waited for the process to go idle. A corpus of audits ran out of memory. Measured after
  60 audits: 918 MB before, 9 MB after.
- The abstraction audit compared reached flags that the search does not track: those that cannot matter to the goal,
  every flag in an unsolvable game. It reported three false divergences on 900 games. It now compares the live flags
  (`SolveResult.liveFlags`).

### Added

- Weight budgets for what the playable ones leave out (3.6): `backgroundScoreKB` (the scores' stems, downloaded where
  the director plays them), `offlineTotalKB` (the full warm-up, app shell included), `decodedAudioMB` (the largest
  score decoded, from `pcmBytes`). A release requires them; the demo and the reference set them (3.0 MB, 7.6 MB, 97 MB
  measured).
- `validate --release` measures each score's stem files with ffprobe (3.6): the same rate, channels and exact number
  of samples, the loop ending inside them, `pcmBytes` within 1% of what they decode to. Hand-made stems that would
  drift apart no longer pass a release (`src/engine/tools/stems.ts`, `tests/stems.test.ts`).
- The music director's decoded audio is capped (3.6): `audio.maxDecodedMB` (default 160), the scores least recently
  played let go first. A score larger than the cap plays as its single mix, alone (the others keep their stems), and
  is not even downloaded when its `pcmBytes` says so. Before, every decoded stem stayed until the game closed.
- Transitions between scores (3.6): `audio.transitions` rules (`from`, `to`, `at`: beat, bar, phrase or a marker of
  the old score, `bridge`, `fadeBeats`), `ScoreDef.markers` and `phraseBars`. The new score starts on the old one's
  grid, after the bridge; `npm run e2e:music` measures both to the sample in Chromium. Without a rule, as in 3.5.
- The canonical owner pools by group (3.6): the characters who can meet, every two of them, share a pool of the free
  items they hold, and the others keep their own. In 3.5 the pool applied only when all of them could meet, which with
  three characters was seldom. Open chain, 3 characters: 8 rooms 29 909 → 12 613 states, 10 rooms 64 957 → 14 528,
  12 and 14 rooms proved (66 189 and 93 480) where 3.5 stopped at 120 000.
- `npm run audit:corpus` and a nightly workflow: the abstractions against the explicit search on 500 random games of
  each kind (plain, free items, three characters). The random game generator makes three characters.
- A save keeps the music's phase (`state.music`: the track and the position in its file, written by the app, ignored
  by the engine and the tools); loading it resumes the music there (the director's `offset`, the mix's `seek`).

## 3.5.1 — 2026-10-05

"Cue": the fixes found by the review of 3.5.0 (LOG #75–#78). No change to the game state: the 3.5.0 saves load as
they are.

### Fixed

- The music director plays only the latest request: a score whose stems finished decoding after another score was
  asked for replaced it, and a stop while a score loaded did not cancel it (found by the review of 3.5.0; a request
  generation, `tests/director.test.ts`).
- The weight test no longer reads the `dist` an earlier build left: it weighs the game's assets with an empty
  `DIST_DIR`, and CI weighs the app shell of a fresh build (`npm run weight -- --release` after `npm run build`).
- A proof worker that stopped mid-search stayed in the pool: `stats()` asked it with no timeout and could wait for
  ever. It now leaves the pool for good, its node going to the others (or to this thread when none is left), and
  `stats()` asks only the live ones, 2 s at most each (tests: one of four stops, then all, by exit or by an error).
- A browser that does not tell its memory (Safari, iOS included) was taken for an 8 GB device and got the stems. It
  now gets them only when the scores' decoded weight is known and at most 128 MB (`ScoreDef.pcmBytes`, written by
  `npm run audio -- stems`; the demo's theme is 101 MB); otherwise the single mix. `validate` warns about a score
  without it.
- `bench --workers-table` reports the peak RSS: 4 workers take 1.2 GB where one search takes 0.5 GB (BENCH.md "3.5.1").

## 3.5.0 — 2026-10-05

"Score": music, workers, inventories (the plan of D11; `docs/en/ROADMAP.md`, `docs/en/BENCH.md` 3.5). The open matrix
of 20 rooms × 3 characters stays truncated: the 3.5 target is missed, as allowed (D11).

### Added

- The canonical owner (3.5, proofs): items no condition reads, in no invariant or goal, lost only by an action on them
  and given by no rule (`poolableItems`) are pooled while the playable characters can meet; the hand-overs that give a
  character the pool are played and checked before its actions are tried (`profile.ownership`, `--ownership=off`).
  The reference chapter: 904 → 288 states; the open chain of 20 rooms × 2 characters, truncated before, proved in
  14 002 states. The 20 × 3 open matrix stays truncated at 200 000 states: the 3.5 target is not met (BENCH.md).
  Audited against the explicit search on 60 random games with free items (`randomGame(seed, { free: true })`).
- Witness dominance (`--dominance`, witnesses only), with a run again without it when nothing is found; it prunes
  nothing on the bundled and stress games (BENCH.md "3.5"), so it stays off.

- Proof workers (3.5, `src/engine/tools/solve-pool.ts`): `npm run solve -- --prove --workers=N|auto [--batch=64]`
  expands the frontier a batch at a time on worker threads and merges in the batch's order: the same result for 1, 2,
  4 or 8 workers (`tests/workers.test.ts`), ×2.54 with 4 on a 40 000-state proof, ×2.01 on the 40-room era reference
  (BENCH.md "3.5", `npm run bench -- --workers-table`). Off unless asked for: without it the search is the one of
  3.4, byte for byte. A worker that cannot start leaves the work to the search's thread (`profile.workers.reason`);
  custom commands reach the workers from the game's module. `--time=<s>` (`timeLimitMs`) stops a search: `truncated`,
  `profile.stoppedBy: 'time'`, and such a result is not cached. The search is now an expansion that reads nothing of
  the search (`makeExpander`) and a merge that does, one code path with or without workers.

- The music director (3.5, `dom/director.ts`, `core/score.ts`): a track of `audio.music` can have a score
  (`audio.scores`: stems, tempo, the mix per game state). Its stems play sample-locked on Web Audio; a change of state
  (a flag, the room, the active character) moves stem gains on the next bar or beat, crossfaded; another room with the
  same track keeps the music going. `{ music: { stinger } }` plays a cue on the next beat. The single mix plays under
  Save-Data, on a low-end device or without Web Audio (`?music=mix|stems` forces one). `npm run audio -- stems` renders
  the stems from the arrangement (one gain for all: their sum is the mix). The sample game's theme in four stems (the
  harp and the bass alone while Biscuit plays, no melody in the garden), the reference chapter's (no melody until the
  lights come back). `npm run e2e:music` (CI): thirty minutes rendered offline with 0 samples of drift, 100 changes of
  mix without a click (a hard switch is caught), real-time jitter 0.02 ms in Chromium and WebKit, the stems in the
  game. The Studio's Music tab plays a score and each state's mix. The asset graph, the offline plan, provenance and
  `npm run weight` count the stems (the budgets count the single mix, the stems on their own line; `--stems`).

## 3.4.0 — 2026-10-05

"Stagecraft": picture, scene and Studio (Codex's 3.4 plan, D10–D13; `docs/en/ROADMAP.md`, `docs/en/BENCH.md` 3.4).

### Added

- The reference chapter (3.4, `games/reference`, "The Night Market", D13): the engine's second real game, built from
  the sample game's art. Two playable characters who need each other, 8 rooms, a staged market (6 layers, parallax, 3
  masks, stairs between two zones), a yard on two planes, an autonomous script, a minigame, a timeline finale, en and
  fr. A CI job builds it, proves it whole and by chapters, plays it to the end at the keyboard in Chromium and WebKit
  and in French, and checks its rooms, its frame rate (CPU ÷4) and its first visit's bytes (`docs/en/BENCH.md` 3.4).

- The Studio's structured editing (3.4): reactions, conditions, commands and a room's stage as forms (from one table
  of every condition and command, checked against the types at compile time), a diff preview, a write as code in the
  file's style validated after it is made (an edit that adds an error is taken back), atomic writes, Undo / Redo over
  the session's writes (refused when the file changed since), the placement editor's walk zones, links, layers,
  occluders, lights and particle areas, editable durations on the timeline, the painter choice and frame rate in Play,
  and a Voices tab. The `set_value` MCP tool gives an AI the same structured write (23 tools). `npm run e2e:studio`
  (a CI gate) creates, previews, applies and undoes a stage in a real browser.

- Voice production (3.4): `npm run voices` (`status`, `export` to CSV or JSON for the actors, `import` their statuses,
  actors and notes into `games/<id>/voices.json`, `check` every clip with ffmpeg: codec, rate, length for its text,
  loudness, peak; in `verify:release`). Clips per language (`audio.voicesByLang`), chosen with the language and
  counted by the offline plan. The music steps back while someone speaks. Captions for the sounds that matter
  (`{ sfx, caption }`, translated, a captions setting on by default, offered only in a game that captions something).

- Stage physics (3.4, `core/motion.ts`): `launch` (a ballistic flight), `spring` (a damped swing), `path` (a smooth
  curve through points), `follow` (an offset from a leader). Closed forms of time, never a simulation; presentation
  only (a character keeps where it lands, like `place`); validated, laid on the timeline, jumped to their end with
  reduced motion. The solver proves a game the same with motions everywhere.

- Walk topology (3.4): several walk zones joined by links (walk, stairs, ladder, jump, teleport, with their duration,
  animation and facing), the fewest links between two points, a depth scale per zone, a camera that zooms per zone
  (1–2) and moves vertically when zoomed. A closed link stops the walk at its foot and says its `locked` line, never
  the action: `npm run lint` warns when a rule behind it does not check the link's condition (`walk-link-gate`). The
  dev overlay and the Studio's spot view draw the zones and links. Old rooms: one zone, the same pictures.

- The stage, painted (3.4): layers at their depth with parallax, blend and opacity; occluders through a polygon (both
  painters), a black-and-white mask, a layer's alpha, feathered or inverted (canvas); radial and ambient lights;
  seeded particles; the room's fade or wipe transition. The model evaluates the stage's conditions and gives the stage
  again when one changes; reduced motion (the setting or `prefers-reduced-motion`) turns off parallax, particles and
  transitions.

- The Canvas 2D painter (`dom/render-canvas.ts`, D10): `renderer: 'canvas'` on a room or the game, `?renderer=` to
  force one. The sample game's rooms within 0.31% of the DOM references, the whole game played by it in CI (a new
  `chromium / canvas` row), and `npm run e2e:perf` (frames per second while the hero walks, CPU slowed 4×: 60 with
  either painter on the sample game).

- The stage schema (3.4): `RoomDef.stage` (layers with roles and conditions, lights, particle emitters, the room's
  transition, the logic of walk links) and its geometry in the layout (`layers`, `occluders`, `walkZones`, `walkLinks`,
  `lights`, `emitters`); `renderer: 'dom' | 'canvas'` on a room or the game. `stageOf` normalizes any room (an old one
  is one backdrop and one zone). `npm run validate` checks ids, images, geometry, zones joined by their links, and what
  only the canvas painter draws; the asset graph counts the stage images; link refusals are translatable. A stage is
  never game state: the sample game with a stage on every room proves state for state the same.

- The renderer contract (D10): `RoomView` is the scene model (positions, poses, depth, walking, fades, the camera, the
  hit test) and hands finished sprites to a painter (`SceneRenderer` / `SpriteSpec`, `dom/renderer.ts`); the DOM
  painter (`dom/render-dom.ts`) is the reference. The rooms render pixel for pixel as before.

- Visual baselines: `RoomView.still()` freezes the scene; `npm run e2e:visual` (a CI gate) compares every room of the
  sample game with `tests/visual/demo/*.png`.

- One asset graph (`src/engine/core/asset-graph.ts`): the title, each room, the map, the game-wide rules and the whole
  game, from the content. The renderer's room preload, the background warm-up, the offline plan, provenance and
  `npm run weight` all read it. It counts what the old budget missed (voice clips, minigame images and sounds, music
  changed by commands, the title video, gained items' icons, phone callers, prop animations) and no longer counts a
  playable character in a room it cannot reach.

- `npm run weight` counts the app shell the service worker precaches (from `dist/sw.js`, compressed, with what a first
  visit downloads twice) in `initial`, and the decoded memory of the images. `npm run e2e:weight` (a CI gate in the
  Chromium row) checks the prediction against a real first visit: on the sample game 2 416 KB transferred for 2 486 KB
  predicted, nothing outside the prediction.

### Changed

- The Canvas painter draws the viewport only, over a background pre-rendered once per room: 59 frames per second in
  the sample game's wide market with the CPU slowed 12× (31.5 on the CI runner at 4× before), its rooms still within
  0.28% of the DOM references.

- A first visit to the sample game drops from 6.6 MB to 2.4 MB: the interface font is a Latin subset (DotGothic16,
  2 MB → 118 KB, `tools/subset-font.py`) with the full font as a `unicode-range` fallback outside the precache, the
  default fonts go through the bundler (the service worker's precache no longer downloads them a second time), and
  VT323, precached but never used, is gone.

### Fixed

- The Canvas painter rebuilt its background and occluders (a blur over the whole room) each time a character's next
  frame finished loading, and copied a whole viewport per occluder each frame: only a backdrop, layer or mask image
  makes the caches stale now, and an occluder keeps only the pixels that hide. The reference market, CPU ÷8: 20 → 47
  frames per second, the same pixels.

- The e2e harness switches characters until the engine has switched (the button ignores a press while a line is on
  screen: at the keyboard's pace, a hand-over's line); `e2e:weight` waits for a Canvas room as for a DOM one;
  `npm run assets` prepares a stage's layer, mask and particle images; `solve`, `replay` and `lint` no longer cut their
  JSON output at 8 KB in a pipe (`tools/flush.ts`).

## 3.3.1 — 2026-10-05

"Truth": what 3.3.0 promised, made exact (Codex's review of 3.3.0, LOG #55).

### Added

- `npm run solve -- --audit-abstractions` (`src/engine/tools/audit.ts`, in `release-check`): the proof with the
  abstractions, every no-op memo hit run anyway, against the explicit search with all of them off; any difference in
  the verdict, invariants, softlocks or what is reached fails (exit 1), an explicit search over budget is `partial`
  (exit 2). `tests/audit.test.ts`: the same audit on 120 seeded random games (`tests/gen/random-game.ts`) and on one
  game per command and per condition (checked against the types at compile time).
- `npm run verify:commercial` (`validate --commercial` after `verify:release`): a release that may be sold. It refuses
  any `releaseExceptions` entry, any placeholder, any non-commercial or no-derivatives licence, and any provenance entry
  without an author or a source that can be checked (a new `url` field, or a repository file named in `source`). The
  sample game fails it on purpose: its music is CC BY-NC 4.0.
- `docs/dev/passes/`: one sheet per release for the checks automation cannot make (screen reader, Safari offline
  with its checklist `docs/dev/SAFARI-OFFLINE.md`, a real phone, playtesters, voices, a signed tag). The release notes
  list them (D12: reported, not blocking).
- The GitHub release carries the built game (`dist.tar.gz`), its SHA-256, an SBOM of the shipped dependencies
  (CycloneDX) and a build provenance attestation (`gh attestation verify <file> -R wanoo/web-scumm`).

### Fixed

- The solver merged states that differ by a flag gating only an earlier rule, though that flag decides whether the
  earlier or a later rule answers the same action (first match wins): every path through the later rule could be lost,
  in every mode. The puzzle graph now links an earlier rule's condition to each later rule it can shadow. Found by the
  random games; the demo and the reference game keep the same state counts.
- With several playable characters, `roomsReached` missed the rooms where only an inactive character stood when the
  canonical character was on (the lint's `room-never-reached` could follow).

### Changed

- CI: the whole game at the keyboard in WebKit and the whole game in French in Chromium are gates (green on every run
  of 3.3 on `main`, D7's rule).
- `verify:release` prints what a `releaseExceptions` entry lets through as named, accepted exceptions, not warnings;
  the sample game's decorative `tea_drunk` flag is kept on purpose with `lint.ignore: ['flag-never-read:tea_drunk']`,
  which `npm run validate` now honours. The sample game's release check has no warning left.
- Truthful wording: the partial-order reduction section of BENCH is marked historical, with a warning never to use it
  to certify the absence of softlocks, and `solve --prove --por=…` says it ignores the flag; the no-op memo is "an
  equivalence checked on the differential corpus", not a proof for every game; the 40-room reference is "structured by
  eras" wherever it is quoted; accessibility is "tested at the keyboard, no serious axe violation", not a WCAG claim.
  The profile's header reads "what each one did, or why it is off".
- The README (en and fr) is a showcase: the promise, the v3.3 measurements with their limits, four player and four
  Studio images, a quick start that begins with `npm run doctor`, then links to the docs. The images come from the
  production bundle and the Studio through `npm run docs:screenshots` (`scripts/docs-screenshots.mjs`).
- Decisions D10–D13: a Canvas 2D renderer allowed beside the DOM one (3.4), the plan 3.3.1 → 3.4 "Stagecraft" → 3.5
  "Score", human gates reported rather than blocking, the 3.4 reference chapter made from the sample game's art.

## 3.3.0 — 2026-10-05

### Added

- A golden save for 3.3.0 (`tests/fixtures/saves/demo-3.3.0.json`): it loads and reaches the ending on this engine.
- `npm run e2e:a11y` (a CI gate in Chromium and WebKit): axe-core on a conversation menu, the map, the save and load
  slots, the overwrite and restart confirmations and every bundled minigame; every bundled minigame won with key
  presses only in a real browser (a win is a minigame that ended without Skip: `App.minigameLog`, fed by a new
  `mg-skip` event); an older save upgraded by the real build (the v2 localStorage autosave and slot moved into
  IndexedDB, a 3.1.0 IndexedDB envelope migrated and resumed, then a manual save round trip). A checklist for the
  manual screen-reader pass before a release: `docs/dev/SCREEN-READER.md`.
- The persistent proof cache (`tools/proof-cache.ts`, `.cache/proofs/`): a solver run keyed by the engine's sources,
  the game's sources and content, and the options (defaults normalised) is given back when none changed, and the
  outputs say so (`cached` in `--json`). `npm run solve` (every mode), `--chapters` and `npm run lint` use it;
  `--no-cache` / `PROOF_CACHE=0` turn it off. Demo: warm proof 0.17 s (cold 2.4 s), chapters 1.1 s (cold 3.4 s).
- Weight budgets (`npm run weight`, `assetBudgets.initialKB / roomKB / chapterKB`): what a phone downloads before the
  first room is playable, per room and per chapter (every room reachable in it, from the proof by chapters), from the
  built files; over a budget fails, and `verify:release` requires the budgets. Demo: 2.0 MB initial, 2.4 MB at most
  per room, 3.7 MB per chapter, budgets 2.5 / 3 / 4.5 MB.
- Provenance tied to the files (`npm run provenance`, `provenance.lock.json`): `--lock` records each shipped file's
  SHA-256 and size with the claims of its entry after a review; `validate --release` fails on a file changed or
  shipped since, a missing file or an entry edited since, and on a licence outside the game's policy
  (`licences: { allow }` in `provenance.json`, required for a release; an asset outside it ships only if a
  `releaseExceptions` entry names it). The demo is locked (214 files, 4.6 MB); `new-game` writes a policy.
- The solver measures itself: `profile.timing` (tries, engine, clone, run, hash, queue, other, classify, in ms) and
  `profile.positions` (distinct character positions among the states); `npm run bench -- --matrix` prints the
  3.3 reference table (20 / 40 rooms × 1 / 2 / 3 characters).
- The no-op memo (`solve` option `memo`, on by default): a try that wrote nothing the solver hashes is not run again
  on a state with the same read values. The engine records what a run writes (`Engine.writes`); one skip in 16 is run
  anyway and compared (`memoVerify`). Demo proof 4.4 s → 2.2 s, proof by chapters 5.7 s → 3.3 s, identical results
  (`tests/memo.test.ts`).
- `npm run solve -- --profile` says what each abstraction did (canonical character, mobility regions, no-op memo) or
  why it is off (`profile.memo`, `abstractionLines`).
- Stable ids on list lines (`ListLine`: `string | { id, text }`): look lists (rooms and items), hint lines (and an
  `id` on a hint), fallback answers, and an `id` on a reaction by kind. Translations are keyed by the id
  (`look.pantry.<id>`, `hints.<id>.lines.<id>`, `rules/fallbacks.look.<id>`, `rules/kinds.<id>.say`), voices too
  (`audio.voices[<id>]`); `npm run ids -- --lines[=all]` writes them into `rooms/*.ts`, `items.ts`, `rules.ts` and
  `game.ts` and renames the locales; `validate --release` requires them in a translated or voiced game. The sample
  game is converted (109 ids, French still 400/400). UPGRADING §10.

### Fixed

- Two engine checks escaped the read trace (the lock on a used item, the hint's `until`): they now go through it.
- A chapter goal that reads the active character (`{ has }`, `{ room }`) could lose boundary states once states that
  differ only by the active character were merged: a canonical state now reaches a goal when any character, seen as
  active, meets it. Found by comparing chapter boundaries with the explicit search run from each start.

### Changed

- One status for every tool (`src/engine/tools/status.ts`): `SolveResult` and `ChaptersProof` carry `status`,
  `exit` and `headline`; `npm run solve` (text and `--json`), the Studio's Check tab and the `solve` MCP tool print
  those. A broken invariant is now the status `broken` (it was `solved` with exit 1), and the Studio no longer says
  "the game can be finished" over a truncated proof or one with softlocks. Witness chapters combine their statuses
  by severity, not by the largest exit code.
- The proof by chapters runs one search per chapter from all its boundary states at once (`start: { states }`),
  sharing its seen states: on the demo 5.7 s instead of 90–147 s, the same boundaries as the explicit search at every
  chapter. Mobility turns itself off, and says why, when no move of the game can be silent.
- Mobility regions (`mobility`, on in proof mode, `src/engine/tools/mobility.ts`): a character's exact room becomes
  the region of rooms it can walk between silently, actions of every room of the region are offered as
  `Go to <room> › action`, every hop is checked when played and a non-silent one restarts with exact rooms; witnesses
  replay. `makeStressGame({ eras: true, softlock? })` and `npm run bench -- --matrix --eras`: the reference game is
  proved at 40 rooms × 3 characters in 578 states and 4.2 s; same verdicts as the explicit search, softlock included
  (`tests/reference-proof.test.ts`, `tests/canonical.test.ts`).
- The canonical character (`canonicalPlayers`, on in proof mode): states that differ only by the active character
  are one, each state offers every character's actions when a switch changes nothing the solver reads; invariants
  are checked from every character's view; off when the goal reads `{ player }`. Same verdicts as the explicit search
  (`tests/canonical.test.ts`), the demo's proof 6 528 → 3 480 states; `profile.canonical` counts folded and explicit
  switches.
- The solver's frontier is a binary heap in the exact order of the sorted list it replaces, and states keep a parent
  pointer instead of a copied path and session: same witnesses, proofs and printed output, 8× faster on the 40-room
  3-character matrix case (the queue took 89% of the time).

## 3.2.2 — 2026-10-04

### Fixed

- `release-check` never ran `validate --release`: the provenance, placeholder and line-id checks of 3.2.1 could be
  skipped by the release workflow. `npm run verify:release` (validate `--release`, `i18n -- status`, strict playtests)
  is now a step of `release-check`, and `tests/release-gate.test.ts` breaks a clean fixture one defect at a time
  (no provenance, an unexcepted placeholder, a translation without line ids) through the CLI.
- A game translated into a single other language (only `fr.json`, no source file) skipped the line-id requirement:
  "translated" now means a locale other than `game.lang` (default `en`).
- Placeholder exceptions are per asset: `releaseExceptions: [{ match, reason }]` replaces the global
  `allowPlaceholders` of 3.2.1 (an old reason never covers a new placeholder); an asset two provenance entries match
  is an error instead of the first entry winning.
- Docs no longer describe a placeholder as a warning, line ids as required only with voices, or the sample game as
  keeping its plain lines.

## 3.2.1 — 2026-10-04

### Fixed

- `npm run solve -- --prove --chapters --json` exited 0 when a checkpoint matched no reachable state (only the text
  output failed): the proof now has one status, `checkpoint_mismatch`, and one exit code (`chaptersExitCode`) for the
  text output and `--json`, tested on a fixture game through the CLI.
- A placeholder asset no longer passes `validate --release` with a warning: it is an error unless `provenance.json`
  says why placeholders may ship (`allowPlaceholders`, set by the sample game for its non-commercial music).
- A translated or voiced release requires a stable id on every line, plain strings included (`validate --release`);
  `npm run ids -- --lines=all` now renames a converted line's translation to its `.say` path; the sample game's 45
  plain lines carry ids, its translations followed them.
- A text identical in two languages is untranslated unless `i18n.same` lists it: `npm run i18n -- status` fails on
  the others (the sample game lists its twelve: names, OK, ▲ ▼).
- CI runs on `v33-*` and `v34-*` branches; a measurement script committed by mistake (`probe40.mts`) is removed; a
  golden save of 3.2.0 joins 3.0.0 and 3.1.0.

## 3.2.0 — 2026-10-04

### Added

- The proof says how a game is lost: `softlockCount` (every reachable softlock state, not 20 samples) and
  `softlockCauses` (grouped by the step that lost the game); a proof from "New game" branches over the intro's
  choices. `npm run solve -- --prove --chapters` proves each chapter from every reachable boundary state of the
  previous one and reports a checkpoint no boundary state matches (with the dimensions that differ); one state budget
  covers the whole proof, past it `truncated`. Checkpoints take `used`, `seen` and `players[].used`. The demo's
  checkpoints were fixed to be reachable states. Measured honestly (BENCH.md): complete for a 40-room single-character
  chain, truncated with two or more playable characters, chapters or not.
- The differential suite (`tests/por.test.ts`) compares the reductions with the plain proof on eight fixtures,
  including a softlock that commutes with everything: stubborn sets agree, sleep sets invent softlocks on three; the
  reductions stay off in proof mode (`unsafeReduction` is for the suite only).
- Accessibility as a gate: the seven bundled minigames play to their end at the keyboard (keys(), operable(),
  arrowFocus() in `minigames/util.ts`; Skip no longer takes the focus a minigame gave one of its controls);
  `npm run e2e -- --axe` (axe-core on the title, a room, the pause menu, the ending) fails on any serious or critical
  violation, and found three fixed here: unnamed empty inventory slots, scene and confetti images without `alt`;
  the Chromium keyboard CI row (keyboard + axe + saves without IndexedDB) gates, a WebKit keyboard row runs.
- Asset provenance: `games/<id>/provenance.json` (source, licence, author, prompt, final or placeholder, by asset key
  with `*`); `npm run validate` checks coverage when the file exists, `--release` requires it and lists placeholders;
  `npm run new-game` records the borrowed sample art as placeholders; the demo's file covers its 194 images, its
  effects and its non-commercial music (the one placeholder).

- Saves say what they did: `clear()` / `clearSlot()` return `false` when the browser refuses (the save stays, the
  failure is reported, `whenIdle()` rejects); "Restart" and a refused file import keep the current game; golden
  saves for 3.0.0 and 3.1.0 load, migrate and reach the ending; refused writes and deletions are tested with a fake
  IndexedDB; `npm run e2e -- --save` proves a manual save survives a reload in a real browser, `--no-indexeddb` the
  localStorage fallback (both in CI).

- Line ids: `say`, `toast` and `guide` carry an optional stable `id`; translation paths follow it
  (`do.<line id>.say` instead of `do[3].say`), `audio.voices[<line id>]` plays without writing `voice` on the line,
  `npm run ids -- --lines` (or `--lines=all` for plain strings too) writes them and renames the locales from their
  current paths, `npm run validate -- --release` reports a line without one, `npm run i18n -- voices` is the voice
  production table. The sample game's 58 object lines carry ids. Duplicate line ids are an error.

- One table of the engine's English interface defaults (`src/engine/dom/ui-defaults.ts`, `App.t()`): the verb bar's
  ARIA label and every menu text come from the game's `ui` or from it; `App.uiFallbacks()` lists the keys a game
  leaves to the defaults, `npm run i18n -- status` prints them, and `npm run e2e -- --lang <xx>` fails when one is
  visible (the release-language check; a `chromium / fr` CI row, experimental first).
- Minigames declare `bindings` (params that name an image or a sound); `validate` checks them (`stroke`, `cables`,
  `scratch`); `scratch`'s `intro` is a translatable text param (its `text` is the sealed ending, given at run time).

### Fixed

- A game made by `npm run new-game` failed `verify:game` and `prove:game`: `solve --chapters` exited 1 when no
  checkpoint declares `goals` (now: nothing to prove by chapter, the global search covers the game), and the build's
  spoiler check crashed on a game without a sealed ending (now: only the private-file check applies). Caught by the
  new `second-game` CI job, which gates Pages: a new game passes check, verify, proof, build and the production e2e
  (axe, saves) with no test written for it.


## 3.1.1 — 2026-10-04

### Changed

- The `release` workflow runs on the `ci` workflow's success for a `v3.*` tag (`workflow_run`), never on the tag push
  alone: a release cannot publish while the check or a browser e2e row is pending or red. `release-check` adds the
  full `npm audit --audit-level=high` and the strict playtests. `ci` also runs on `v32-*` branches.
- A golden save: `tests/fixtures/saves/demo-3.1.0.json` (the demo's save eight inputs into the witness, with the
  remaining inputs) loads on the current engine and reaches the ending (ROADMAP verification 3, now a real test).
- DECISIONS: D5 and D7 are decided, D8 (the private reference game stays on 3.1.0, no longer a gate) and D9 (merge
  on green CI, Codex reviews afterwards) recorded; the charter's truth commands no longer name the private game.
### Added

- The offline warm-up tells the truth: `AssetBank.warm()` returns what it did (a bad HTTP status is a failure, a file
  already in the Cache API counts without a fetch), `App.offlineStatus` / `offlineReady` end `complete` only when every
  file of the plan is cached, else `partial` (reason: network, save-data, slow, quota from `navigator.storage.estimate()`),
  `skipped` or `off`; the pause menu shows it (`ui.offlineStatus`, `offlineComplete`, `offlineRetry`) and a tap retries;
  `npm run e2e:pwa` requires `complete`, checks every file of the plan offline and renders a never-visited room; WebKit's
  impossible offline navigation is "skipped" (exit 3), accepted only by the CI's `--allow-skip`.
### Security

- Studio assistant, custom providers: the private-host check reads `URL.hostname` as a host (IPv6 brackets, IPv4-mapped
  addresses), and refuses `0.0.0.0/8`, `::`, `fc00::/7`, `fe80::/10`, `100.64/10`, `.localhost`, `.internal` as well;
  a provider call never follows a redirect, times out after 60 s and reads at most 8 MB (`providerFetch`, `readCapped`).

### Fixed

- A sealed ending (`ending` / `reveal`) now sets `state.done` like `end` does: the card was shown with the game
  still "not done", which the new e2e check caught. The committed demo playtest's last digest is re-recorded
  accordingly (`done` is part of the state).
- The e2e scripts (generic and the demo's) fail when the solver's run is not `solved` (exit code, status and steps are
  checked) and when the engine does not report the ending (`state.done`); they never replay "the best path anyway".
- Playtests: the analysis started at the `start` entry and dropped the last action (24 entries, 23 played, read
  0..22); `replay()` now returns `first`, the analysis reads `first..first+played-1`, and the table counts inputs
  against the inputs, not the file's entries.
- `npm run lint`: a truncated proof exits 2, says so, and keeps its "never run" / "never reached" findings as
  information (`--json` carries `status` and `truncated`); reachability counts every action the solver attempted
  (`profile.attempted`), not only those that changed the state, so a topic that only talks is no longer "unreachable";
  new `rule-no-effect` info for a live action that ran without changing anything.
- `verify:game` runs the lint; `npm run playtests -- --strict` makes a diverged session an error, used by
  `release-check` and the weekly `prove` workflow.

## 3.1.0 — 2026-10-04

### Added

- CI: the sample game's exhaustive proof on every push, WebKit gating after its three green runs, a keyboard row; a
  weekly `prove` workflow (proof + bench on a 100-room schema-3 game, within a budget); a `release` workflow on
  `v3.*` tags (release checks, then the GitHub release from the changelog); Dependabot. `npm run bench -- --prove
  --v3` with the v3.1 numbers in BENCH.md; the `solve` MCP tool takes `prove`; `doctor` and `serve` are unit-tested.
- Playtests: the pause menu's "Share session" sends a session from a phone (ids only); `npm run playtests` replays the
  files of `games/<id>/playtests/` and sums them up (time per room, stalls, hints, where players stopped, a heat map);
  `verify:game` runs it, the Studio's Check tab shows it and can colour the puzzle graph by the players' sessions,
  the `playtests` MCP tool returns it. Session entries carry a timestamp when the game runs in a page.
- The whole game at the keyboard: verbs, scene targets, inventory, choices, the map, Space to advance a line, Escape
  to close or pause, focus kept inside menus; `npm run e2e -- --generic --keyboard` (`docs/en/ENGINE.md`,
  "Accessibility"); `ui.advance` names the continue marker.
- `npm run lint`, the `lint` MCP tool and a "Content lint" panel in the Studio's Check tab: from the puzzle graph,
  conditions nothing can satisfy, rules another rule hides, red herrings, stuck hints, dead options; after a solver
  run, live actions never run and rooms never reached. `GameDef.lint.ignore` keeps a finding on purpose.
- `bootGame` (`src/engine/boot.ts`): the page's bootstrap is part of the engine; `src/main.ts` only says what is
  specific to its build (`docs/en/UPGRADING.md` §8).
- `npm run ids`: stable ids (schema 3) written into a game's sources, its locale tables renamed to the id-based
  paths, and the `renameSeen` / `renameCounter` migration step generated for its v2 saves (`docs/en/UPGRADING.md` §2).

### Changed

- Manual save slots live in IndexedDB next to the autosave, as envelopes read back after each write; the v2
  localStorage slots are imported once; a file imported from the save menu also fills the first free slot.
- The whole game is cached for offline play after the first visit (`GameDef.offline`, default `full`; `'nearby'`
  keeps the v3.0.0 behaviour), in batches during idle time; `npm run e2e:pwa` opens a room never visited from the
  cache. Decision D5.
- The sample game is schema 3: every rule, topic, listener, choice and block has an id; its v1 saves migrate.
- Translation paths name rules, topics, choices and listeners by id when they have one (`room:house/on.<id>.do[1]`);
  v2 content keeps the positional paths. The puzzle graph, the solver and the Play tab name topics and listeners by
  the same ids as the engine (the solver's heatmap now colours v3 topics).
- The sample game's credits name the Swan Lake arrangement and its CC BY-NC 4.0 licence.

### Fixed

- Docs: the assistant key is in `sessionStorage` (STUDIO fr), a phone needs `dev:lan` (DESIGN), the branch model
  after v3.0.0 (ROADMAP, CHARTER, AGENTS), `page:world`, the README's releases table and repository map, the
  attribution URL in LICENSE-ASSETS, `read_doc` reads UPGRADING and CLASSICS, `docs/fr/MCP.md` is a full translation.
- The two-entry build Pages deploys (game + Studio demo) could not open offline: the chunks of the game's locales,
  its session export and the save envelope's schema went under `assets/tools/`, which the worker does not precache.
  The CI e2e job now builds that shape.
- `npm run e2e:pwa` on WebKit reports that offline navigation cannot be automated instead of failing on the
  resource errors of the aborted navigation.

## 3.0.0 — 2026-10-04

The first v3 release, co-developed by two assistants under `docs/dev/CHARTER.md`; the review trail is `docs/dev/LOG.md`.
v3 breaks v2 on purpose (decision D1): `docs/en/UPGRADING.md` is the list of what to do, and nothing in it is needed
to keep a v2 game running on this engine during the transition.

### Added

- `docs/en/UPGRADING.md` + `docs/fr/UPGRADING.md`, readable through the MCP `read_doc` tool.
- `npm run prove:game`: the exhaustive proof (global and per chapter) as an explicit release gate, run by
  `release-check`, never by `build`.
- `scripts/e2e/lib.mjs`: `E2E_CPU=<rate>` throttles Chromium like a shared runner; the harness prints the engine's
  state when a step fails.

### Changed

- Stable ids are named by one function (`src/engine/core/content-ids.ts`) shared by the engine, the solver and the
  puzzle graph.
- A save that names content that no longer exists is pruned with a visible toast (`ui.saveAdjusted`), not refused;
  only structural corruption, an unknown current room or an unknown active player reject it.
- The accessibility targets are keyboard-only: touch and mouse go through the room's hit-testing, which picks the
  smallest zone under the finger.
- The CI runs the production e2e in Chromium (gate) and WebKit (experimental until three green runs).
- Offline: the room and its neighbours are warmed; the README says what is cached offline. Whether a global preload
  returns is decision D5, pending.

### Fixed

- The map's place list could become untappable when anything refreshed the screen while the map waited (seen on
  every CI run, latent on slow phones).
- The e2e harness no longer waits 30 s for a minigame's Skip button that is fading after a win.

## 3.0.0-beta.1 — 2026-10-04

First public v3 preview. The save envelope and authoring template are v3; existing v2 games remain supported during the beta. This release is not the final v3 compatibility commitment.

### Added

- Exhaustive solver proof mode with softlock classification, explicit assumptions and stable exit codes.
- Schema-v3 compilation boundary and stable persistence IDs.
- Validated v3 save envelopes, verified IndexedDB autosaves and visible storage failures.
- Generic quality commands, production PWA/browser smoke tests and dependency/asset audit separation.
- Complete extraction of verb and built-in minigame text.
- LAN capability-token and same-origin protection for Studio write routes.
- Semantic scene hotspots, live announcements and keyboard focus handling.
- Room-scoped, connection-aware asset warming.

### Changed

- Development servers bind to loopback unless a `:lan` command is used.
- Assistant keys use session storage; custom provider URLs are disabled by default.
- Sample asset licensing now matches the actual generated effects and non-commercial music source.
- Normal builds require a winning witness; exhaustive softlock proof is an explicit `prove:game` release gate, so a
  large game's honest `truncated` proof cannot masquerade as failure to build its playable witness.
- Offline documentation now matches the bounded room-and-neighbor warming policy; unvisited rooms are not promised
  offline and are not downloaded wholesale on constrained devices.

### Fixed

- Truncated and unsuccessful solve runs no longer exit successfully.
- State-changing random branches and all nested dialogue choices are explored without a silent 32-variant cap.
- A multi-player demo branch that could consume another player’s required token.
