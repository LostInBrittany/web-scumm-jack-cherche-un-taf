# npm packages

The engine ships as five npm packages, packed from the files git tracks by
[`scripts/pack.mjs`](../../scripts/pack.mjs) and attached to every GitHub release. This page says what each package
holds, how the packages are checked, and where publishing them to the npm registry stands. How to install them as a
user is in [Package reference](install.package.md).

<a name="packages"></a>

## The five packages

| Package (archive) | What it holds | Since |
|---|---|---|
| `@quest-n-click/engine` (`quest-n-click-<v>.tgz`) | The engine (`src/`), its pages, its tools, the `quest-n-click` command, the game template (`games/_template/`), and from 4.5.0 its documentation bundle `docs-bundle/`; never a game of this repository, a test, a source doc page or a build | 3.9 |
| `@quest-n-click/create` (`create-quest-n-click-<v>.tgz`) | `npm init @quest-n-click <folder>`, which runs `quest-n-click create` | 3.9 |
| `@quest-n-click/bridge` (`quest-n-click-bridge-<v>.tgz`) | The reference Reality Bridge (one module, its policies): a game that does not run one never installs it | 4.1.1 |
| `@quest-n-click/connectors` (`quest-n-click-connectors-<v>.tgz`) | The connectors of the world outside (one module, its MIME worker): an operator's, never a game's | 4.1.9 |
| `@quest-n-click/studio-server` (`quest-n-click-studio-server-<v>.tgz`) | The Studio online and its worker (two commands, the Studio's page): an operator's, beside the engine | 4.2.1 |

The engine's package takes only tracked paths under its roots (`src/`, `tools/`, `studio-server/`, part of
`bridge/src/`, `cli/`, `games/_template/`, the icons and fonts, `index.html`, `studio.html`, `vite.config.ts`,
`tsconfig.json`, `requirements.txt`, `LICENSE`). An untracked file under one of those roots
stops the pack ("git add or commit them, or add them to .gitignore") rather than being left out silently. The Bridge,
the connectors and the Studio Server carry their versioned lock as `npm-shrinkwrap.json`; a lock that no longer fits
its manifest stops the pack: `npm run locks` makes it again (review the diff, commit it), and `npm run locks -- --check`
says whether each lock still fits without the network.

From 4.2.5 to 4.2.x each package was also packed under its former web-scumm name, an alias with the same files and
version (D47). 4.3.0 packs the new names only; `npx quest-n-click migrate` moves a game off the old ones.

From 4.5.2 the packages are named under the npm organisation's scope (D53): an organisation owns only scoped packages,
so the five names belong to `quest-n-click`, whose owners can each approve a publication.
From 4.2.5 to 4.5.1 they were `quest-n-click`, `create-quest-n-click`, `quest-n-click-bridge`,
`quest-n-click-connectors` and `quest-n-click-studio-server`: those names are kept as deprecated pointers to the scoped
ones. The commands keep their names (`quest-n-click`, `create-quest-n-click`, `quest-n-click-bridge`…), and so do the
archives a release attaches: `scripts/pack.mjs` renames npm's `quest-n-click-engine-<v>.tgz` back to
`quest-n-click-<v>.tgz`, so the release's files, sums and attestations keep their names. Each manifest carries
`publishConfig.access: public`, its `repository` and its `engines`.

```sh
# in the engine repository
npm run pack                                   # the five archives in .cache/pack
node scripts/pack.mjs --out=.cache/pack --publish-dry-run   # and what `npm publish` would send for each
```

<a name="how-it-is-checked"></a>

## How the packages are checked

- **`npm run fresh-install`** (CI job `fresh-install`, when the plan says a package, the template or an authoring path
  changed): packs the engine, creates a game from the packed template in an empty folder outside the repository,
  installs the tarball, runs `assets`, `verify` and `build` (every file of `dist/` accounted for), and plays the game
  to its ending in Chromium. A file of the new project that names the repository fails it.
- **`npm run external-consumer`** (CI job `external-consumer`, and in the candidate on Ubuntu, macOS and Windows on the
  candidate's own archives, `--tarballs=`): the archives used the way a third party uses them. It reads each archive
  (name, version, licence, binaries, exports, no `file:` or `link:` dependency, no checkout path; the documentation
  bundle's files against their sha256); creates a game on an older release (`--from`, 4.1.17 by default), moves it to
  the candidate as its author would (uninstall the old package, install `@quest-n-click/engine`, `npx quest-n-click migrate`),
  plays an old save and a new game to the ending; calls `read_doc`, `list_docs` and `search_docs` through a real MCP
  client over stdio; runs `create-quest-n-click` from its archive; installs the Bridge (init, doctor, serve on SQLite, and on
  Postgres when `CONSUMER_PG_URL` is set) and the connectors, then a signed email webhook accepted, the same message a
  duplicate, a bad signature refused.
- **`--publish-dry-run`** in `release-check` and in the candidate's `pack` job: what `npm publish` would send.
- **SBOMs**: the candidate makes one CycloneDX SBOM per archive (`scripts/sbom.mjs`), from what the archive holds.

<a name="npm-publishing"></a>

## Publishing to npm: staged by CI, approved by an owner

Every release attaches the five archives. From 4.5.2, release.yml's `npm-stage` job **stages** them on npm once the
release is published and read back, and an owner of the organisation **approves** each one with 2FA (D34, D53). CI
never publishes and holds no npm token. 4.5.2 was the first release published there, on 24 October 2026 (4.5.1 is the
last release without the step). The `next` channel from `main` follows in a later pull request of #283.

> [!LIMIT id=not-on-npm]
> A release is on npm only once an owner approves what it stages: between its tag and that approval,
> `npm install @quest-n-click/engine` installs the previous one. A pre-release is never on npm; use its `.tgz` files.

<a name="npm-names"></a>

### The names, watched every night

The five scoped names (`@quest-n-click/engine`, `@quest-n-click/create`, `@quest-n-click/bridge`,
`@quest-n-click/connectors`, `@quest-n-click/studio-server`) and the former ones (`web-scumm`, `create-web-scumm`,
`web-scumm-bridge`, `web-scumm-connectors`, `web-scumm-studio-server`) are checked each night by the `npm-names` job of
`.github/workflows/nightly.yml`, which never gates: each is "still free" (a 404), "ours" (published by an owner of the
organisation, exactly), or a warning "taken" in the run summary for the maintainers to act. The owners are a list,
`OWNERS` in `tools/release/preflight.mjs` and its copy in the job: npm shows an organisation's members only to its
members, and CI has no token. It holds the two co-maintainers' npm users,
`lostinbrittany` and `wanoo`. The unscoped names of 4.2.5 to 4.5.1 (`quest-n-click`, `create-quest-n-click`, `quest-n-click-bridge`,
`quest-n-click-connectors`, `quest-n-click-studio-server`) are pointers: the job expects each to be an owner's and
deprecated, warns when one is not deprecated or is someone else's, and notes one still free (to reserve).
`create-quest-n-click` is the exception, a **relay**: published on an owner's account, its command does
`await import('@quest-n-click/create/index.mjs')`, so `npx create-quest-n-click my-game` keeps working and runs the
same thing as `npm init @quest-n-click my-game`. The job expects it to be an owner's and **not** deprecated. It needs
`@quest-n-click/create` to keep `index.mjs` at its root and no `exports` map (`tests/pack-manifests.test.ts`).

<a name="publishing-steps"></a>

### The publishing steps

1. **Versions.** Staged publishing needs npm 11.15.0 and Node 22.14.0 at least ([npm docs][staged]). The `npm-stage`
   job pins **exact** versions in its env, `NPM_PUBLISH_NODE: 22.23.3` and `NPM_PUBLISH_NPM: 11.21.0`: it sets up
   that Node, installs that npm (`npm install -g npm@11.21.0`; Node 22.23.3 ships npm 10.9.9) and checks both before
   anything reaches npm. `tests/release-stable.test.ts` and `ship preflight-stable` refuse a range.
2. **The accounts.** The organisation `quest-n-click` requires 2FA of its members; each owner's account has it on.
3. **Bootstrap, once per package** (done on 24 Oct 2026 for the five scoped names, tag `bootstrap`). A package that does
   not exist gets a **reservation version**, never a product version:

   ```sh
   # in the folder holding the archive, from the maintainer's own session (or with a stage-only token)
   npm stage publish <archive of 0.0.0-bootstrap.0>
   ```

   - Staging a package that does not exist publishes a `0.0.0-stage` placeholder until it is approved
     ([npm docs][staged]); `latest` points to it until the first release is approved.
   - A local publication carries no OIDC provenance. That is why it never carries a version of the product.
4. **Trusted publishing, stage-only, once per package**, just before the first release that uses it:

   ```sh
   # anywhere, signed in to npm as an owner of the organisation (2FA)
   npm trust github @quest-n-click/engine --repo Quest-n-Click/quest-n-click --file release.yml --allow-stage-publish
   npm trust github @quest-n-click/create --repo Quest-n-Click/quest-n-click --file release.yml --allow-stage-publish
   npm trust github @quest-n-click/bridge --repo Quest-n-Click/quest-n-click --file release.yml --allow-stage-publish
   npm trust github @quest-n-click/connectors --repo Quest-n-Click/quest-n-click --file release.yml --allow-stage-publish
   npm trust github @quest-n-click/studio-server --repo Quest-n-Click/quest-n-click --file release.yml --allow-stage-publish
   ```

   - CI may then stage, never publish (no `--allow-publish`).
   - npm checks the workflow's **file name**, `release.yml`, the workflow that runs the `npm-stage` job.
   - A new configuration must make its first staging within **two days**, or it expires: run these just before the tag.
5. **Staging, by each release** ([below](#staging-job)): the `npm-stage` job stages the five archives, engine first,
   and writes in its run summary the ids and the commands to approve them.
6. **Promotion, by an owner.** An owner of the organisation (either of them) approves each staged package with 2FA,
   **engine first** (`@quest-n-click/create` depends on its exact version):

   ```sh
   # anywhere, signed in to npm as an owner (npm 11.15.0 or later); the ids are in the run summary
   npm stage view <id>       # what was staged, before approving
   npm stage approve <id>    # once per package, in the summary's order
   ```

7. **After the first approval**, on npmjs.com, each package → Settings → Publishing access: **Require two-factor
   authentication and disallow tokens**. Trusted publishing keeps working; a token no longer can.
8. **Dual-use classification of `@quest-n-click/connectors`** (decided in 4.1.20, PR 3b):
   - npm's [dual-use policy][dual] covers "security-relevant capabilities that can resemble malicious software":
     penetration-testing tools, security research utilities, code obfuscation.
   - The connectors are servers a game runs (an SSH and a Telnet front for its terminal, an email webhook and IMAP
     reader, an Open Badge verifier). They scan nothing, attack nothing and hide nothing. **They are not declared
     dual-use.**
   - They go through staged publishing and a 2FA promotion anyway, as every package does. That is the publishing method
     the policy asks of dual-use content.
   - If npm's publish-time scan holds or flags the package, add `"contentPolicy": { "class": "dual-use" }` and a
     `DISCLOSURE` file. The declaration then persists across versions.

`npm run ship -- preflight-stable --candidate=<run>` checks, for each package, the archive, the name (ours when an owner
of the organisation publishes it), the bootstrap, the trusted publisher (on `release.yml`, stage-only), an OIDC
publication proven, the version not yet published, and from 4.5.2 its unscoped pointer (an owner's, deprecated); and
that release.yml stages through `npm-stage` and never publishes ([Releasing](contribute.releasing.md#preflight)).

<a name="staging-job"></a>

### The `npm-stage` job

It runs after the `release` job succeeded (`ship verify` its last check), beside `docs-publish`, which does not wait
for it: npm being down or a trusted publisher missing never holds the documentation of a release already published,
and the job can be re-run alone. Its permissions are `contents: read` and `id-token: write`, nothing else.

1. It checks out the tag's commit (a tag before 4.5.2 has no `tools/release/npm-stage.mjs`: a notice, nothing done),
   sets up the pinned Node and npm and checks their versions.
2. It downloads the release's own `.tgz` files and `SHA256SUMS` (`gh release download`) and checks each archive
   against the sums: the bytes staged are the bytes the release carries.
3. `node tools/release/npm-stage.mjs` refuses a token in the environment or an `.npmrc`, reads each archive's manifest
   (its scoped name, the tag's version, `repository` naming this repository, `@quest-n-click/create` on the exact
   engine), then for each package, engine first:
   - `npm view <name>@<version> version`: already published, skipped;
   - `npm stage publish <archive> --provenance --access public --tag latest`: staged, its id kept;
   - npm's `409 Conflict`, the version not published: staged by an earlier run, skipped (a staged version cannot be
     seen without a token: `npm stage list` refuses the short-lived OIDC token, so the conflict is the answer);
   - `ENEEDAUTH` ("requires you to be logged in"): OIDC gave no credential, so no trusted publisher accepts this
     workflow (absent, or expired unused). The job fails with the `npm trust github …` command of that package.
   It stops at the first failure, so `@quest-n-click/create` is never staged without its engine.
4. The run summary lists each package's state and the `npm stage approve <id>` lines, in order.

**A pre-release tag stages nothing.** Its archives carry the stable version (`v4.5.2-rc.1` packs `4.5.2`), which the
stable tag must stage: staging it would take that number for good (a staged version holds it, its dist-tag cannot be
changed). The job **rehearses** instead: `npm stage publish --dry-run` through OIDC, which proves the trusted publisher
answers this workflow, and sends nothing. A dry run without a credential only warns, which the job reads as a failure.
Provenance is not made by a dry run, so it is first seen on the stable tag's staging, before approval.

> [!LIMIT id=npm-provenance-commit]
> npm builds the provenance from the run (`GITHUB_SHA`, `GITHUB_REF`). Since 4.5.3 (#291) release.yml runs on the
> tag's push, so it names `release.yml` at `refs/tags/v<version>` and the tag's commit, and the OIDC token it is signed
> with says the same; up to 4.5.2 it ran on `workflow_run`, from main's copy, and named `refs/heads/main` at main's
> head instead. The summary writes the commit, and says so (do not approve) if it is not the tag's. To check on the
> first staging with `npm stage view <id>` before approving, and once published with
> `npm view @quest-n-click/engine@<v> dist.attestations`. The release's own attestations come from the same run.

<a name="first-release"></a>

### The first release through npm

1. The five trusted publishers (step 4), just before tagging.
2. An `-rc` tag first: its `npm-stage` job rehearses the five; green means OIDC is accepted for each.
3. The stable tag, within the two days: the job stages the five; read the run summary.
4. `npm stage view <id>` for the engine (provenance, contents), then approve the five in the summary's order.
5. `npm view @quest-n-click/engine version` answers the version; `npm install @quest-n-click/engine` in an empty folder.
6. Step 7: require 2FA and disallow tokens on each package. [Install from npm](install.from-npm.md) then drops its
   "not yet published" limit.

[staged]: https://docs.npmjs.com/staged-publishing
[dual]: https://docs.npmjs.com/policies/dual-use/

<a name="related"></a>

## Related

- `npm run pack`, `npm run fresh-install`, `npm run external-consumer`, `npm run locks`, `npm run ship`.
- [Releasing](contribute.releasing.md), [Package reference](install.package.md), [Install from npm](install.from-npm.md).
