# Changelog

What changed in each release of quest-n-click is in one file, [`CHANGELOG.md`](../../CHANGELOG.md), at the root of
the repository. This page does not copy it: it says where to read it and how to read it.

<a name="where"></a>

## Where to read it

- In the repository: [`CHANGELOG.md`](../../CHANGELOG.md), newest release first, one `## <version> — <date>` section
  per release.
- On GitHub: each release's notes, at <https://github.com/Quest-n-Click/quest-n-click/releases>.
- Not in the npm package: an installed engine (`node_modules/quest-n-click/`) does not carry `CHANGELOG.md`.

<a name="how-to-read"></a>

## How to read a release's section

- The opening paragraph: the release's name and what it is for, and whether a game has anything to change.
- `### Breaking`: what a game, a host or a script must change. Since 4.2.0 a minor version adds and never removes;
  a removal waits for the next major ([start.stability](start.stability.md)).
- `### Fixed`: the bugs fixed, each with the version and, when there is one, its issue number.
- `### Changes`: what was added or changed without breaking.
- How to move a game from one version to the next is not in the changelog: see [install.upgrade](install.upgrade.md)
  and the upgrade notes of each line.

<a name="unreleased"></a>

## What is not released yet

In the engine repository, a branch that changes the code writes its changelog lines as a fragment,
`changes/<slug>.md`; they are gathered under `Unreleased` in `CHANGELOG.md` when the branch reaches `main`
(`npm run changes -- --assemble`, [`tools/changes.ts`](../../tools/changes.ts)). Until a release, what `main` holds
beyond the last version is in `changes/` and that `Unreleased` block. How a release is cut: [contribute.releasing](contribute.releasing.md).
