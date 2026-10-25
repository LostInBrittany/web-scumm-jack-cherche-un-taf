# Install from npm

**The engine is on npm from 4.5.2** (published on 24 Oct 2026). Its packages are named under the organisation
`quest-n-click` (D53): `@quest-n-click/engine`, `@quest-n-click/create`, `@quest-n-click/bridge`,
`@quest-n-click/connectors` and `@quest-n-click/studio-server`, each published by the release run and approved by an
owner of the organisation. A project is created and upgraded with npm's usual commands, without an archive URL; the
[release archive](install.from-archive.md) still works the same way. The unscoped names of 4.5.1 and before
(`quest-n-click`, `quest-n-click-bridge`, …) are not the engine: the maintainers keep them as deprecated pointers to the
scoped ones, except `create-quest-n-click`, a relay to `@quest-n-click/create`.

<a name="what-you-get"></a>

## What you get

A game project created and upgraded with npm's usual commands, without an archive URL, from packages you can check in
one command are the project's.

<a name="context-and-versions"></a>

## Context and versions

- A **created project**, on your machine.
- No version of the product was published to npm up to and including 4.5.1. 4.2.0 went to GitHub Releases only
  (D38): publishing needs a maintainer's two-factor authentication at each step, and 4.2.0 did not wait for it. The npm
  organisation `quest-n-click` (two owners, so two people can approve) and the scoped names come with 4.5.2 (D53),
  the first release that release.yml staged on npm and the first one published there, on 24 October 2026. Each stable
  release since is staged the same way and is on npm once an owner approves it: `npm view @quest-n-click/engine
  version` says which one is.
- The names are watched: a job of the nightly workflow (`npm-names`, never gating) checks that each scoped name, and
  each former `web-scumm…` one, is free or published by an owner of the organisation, that each unscoped name is an
  owner's deprecated pointer (`create-quest-n-click`: an owner's relay, not deprecated), and warns otherwise.

> [!LIMIT id=npm-owners-only]
> A package under one of these names published by someone other than the organisation's owners is not the project's:
> do not install it. The unscoped names were unpublished on 24 October 2026, to be republished as pointers (and
> `create-quest-n-click` as a relay) by the maintainers: until then, `npx create-quest-n-click` finds nothing, and
> `npm init @quest-n-click` is the command.

<a name="prerequisites"></a>

## Prerequisites

- The [Requirements](install.requirements.md) of any game project: Node.js 22.12 or newer, Python 3 for the art.
- Nothing else: from 4.5.2 the release is on npm.

<a name="where-to-run"></a>

## Where to run the commands

On your machine, from the folder that will contain the project; then inside the created project.

<a name="steps"></a>

## Steps

<!-- step: check-owner -->
1. Check that the package is published and is the project's. Its maintainers must be owners of the organisation
   `quest-n-click` (`lostinbrittany` and `wanoo`), its repository `github.com/Quest-n-Click/quest-n-click`, and its
   `latest` a version of the product:

   ```bash
   # anywhere
   npm view @quest-n-click/engine maintainers repository.url dist-tags
   ```

   It names a version of the product (`latest: '4.5.2'` on 25 October 2026). If it names only `bootstrap`, the
   reservation, or a maintainer who is not an owner, stop here and use the [release archive](install.from-archive.md).

<!-- step: create-from-npm -->
2. Create the project. Either command does the same thing (`@quest-n-click/create` runs `quest-n-click create` from the
   engine it depends on):

   ```bash
   # in the folder that will contain the project
   npm init @quest-n-click my-game "My Game"     # or: npx quest-n-click create my-game "My Game"
   ```

   Once the maintainers republish it, `npx create-quest-n-click my-game "My Game"` works too: the unscoped
   `create-quest-n-click` is a relay that runs `@quest-n-click/create`, the same thing.

   Without `--engine`, `create` writes the dependency `"@quest-n-click/engine": "^<version>"`, which npm resolves from
   the registry.

<!-- step: install-and-play -->
3. Install, prepare the art and play, as from the archive:

   ```bash
   # from the folder that contains the project, then inside it
   cd my-game
   npm install
   python3 -m pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt
   npm run assets && npm run dev
   ```

<a name="expected-result"></a>

## Expected result, and how to check it

Step 1 prints the maintainers and the repository; step 2 ends with
`my-game: "My Game" created (@quest-n-click/engine ^<version>).` A project made from an archive moves to the registry with
`npm install @quest-n-click/engine@<version>`, which replaces the archive's URL in its `package.json` by a version range.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `npm view @quest-n-click/engine dist-tags` names only `bootstrap` (and npm's `0.0.0-stage` placeholder) | Not the registry you expect, or a mirror behind it | Check `npm config get registry`, or [install from the release archive](install.from-archive.md) |
| `npx create-quest-n-click` answers 404 | The relay is not republished yet | `npm init @quest-n-click my-game` |
| `npm view` shows a maintainer who is not an owner of the organisation | A name taken by someone else | Do not install it; report it on the project's issues |
| `npm warn deprecated quest-n-click@0.0.1: …` | An unscoped name of 4.5.1 and before, now a pointer | Install `@quest-n-click/engine` instead |

<a name="files-changed"></a>

## Files or data changed

Step 1 changes nothing. Steps 2 and 3 write the same project as [from the archive](install.from-archive.md#files-changed);
only the dependency in `package.json` differs (a range instead of a URL).

<a name="recovery"></a>

## Recovery or going back

A project created from npm goes back to an archive with `npm install <archive URL>`, as
[Upgrade](install.upgrade.md) describes.

<a name="how-it-will-be-published"></a>

## How the packages are published

The procedure was written in 4.1.20; from 4.5.2 release.yml stages the packages and an owner approves them, and 4.5.2
was the first release on npm. The details are on [npm packages](contribute.npm-packages.md). What a user can rely on:

- **Staged publishing with a person's approval.** The release run stages each package through GitHub's OIDC (trusted
  publishing, configured stage-only: CI may stage, never publish), and the maintainer promotes each one with
  two-factor authentication (`npm stage approve <id>`, or on npmjs.com); either owner of the organisation can approve.
  A version of the product never comes from a
  local publication, which would carry no OIDC provenance; only a reservation version `0.0.0-bootstrap.0` may, once per
  package, to create it.
- **Exact tools.** Staged publishing needs npm 11.15.0 and Node 22.14.0 at least. release.yml's `npm-stage` job pins
  them exactly, `NPM_PUBLISH_NODE: 22.23.3` and `NPM_PUBLISH_NPM: 11.21.0`, installs npm 11.21.0 itself (Node 22.23.3
  ships npm 10.9.9) and checks both; a test refuses a range.
- **The connectors are not declared dual-use.** npm's dual-use policy covers tools that can resemble malicious
  software (penetration testing, security research, obfuscation); the connectors are servers a game runs (an SSH and a
  Telnet front, an email webhook and IMAP reader, an Open Badge verifier), scanning, attacking and hiding nothing.
  They go through the same staged publishing and two-factor promotion as the other packages. If npm's scan holds or
  flags the package, it gets `"contentPolicy": { "class": "dual-use" }` and a `DISCLOSURE` file.

<a name="references"></a>

## References

- [Install from the release archive](install.from-archive.md), [Package reference](install.package.md)
- [npm packages](contribute.npm-packages.md) (the maintainer's procedure), [Releasing](contribute.releasing.md)
- npm's documentation: [staged publishing](https://docs.npmjs.com/staged-publishing),
  [dual-use policy](https://docs.npmjs.com/policies/dual-use/)
- [`.github/workflows/nightly.yml`](../../.github/workflows/nightly.yml) (the `npm-names` job),
  [`.github/workflows/release.yml`](../../.github/workflows/release.yml) (the `npm-stage` job)
