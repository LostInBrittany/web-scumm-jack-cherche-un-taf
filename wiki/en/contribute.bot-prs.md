# Bot pull requests

How the maintainer, or an assistant working for them, handles the pull requests Dependabot opens: when, how to judge
each one, and what to do with a red one.

<a name="what-you-get"></a>

## What you get

No bot pull request left open without a reason: each one merged on green, fixed and taken, or closed with its reason
written, and the dependency it moves checked across the places that copy it (package locks, action pins).

<a name="context-and-versions"></a>

## Context and versions

The engine repository on GitHub, `Quest-n-Click/quest-n-click`. `.github/dependabot.yml` as of 4.4.0: npm every week (minor
and patch updates grouped as `minor-and-patch`), GitHub Actions every week, pip (`requirements.txt`) every month.
`@types/node` majors are ignored: the types follow the oldest Node the project supports (22.12, `engines`), and Node
26's types reject code that is right on 22 (#101, 4.1.19); they are raised by hand when `engines` moves.

<a name="prerequisites"></a>

## Prerequisites

- Write access to the repository and the GitHub CLI (`gh`), logged in.
- A prepared clone: [Developer setup](contribute.setup.md).
- No release in progress (next step).

<a name="where-to-run"></a>

## Where to run the commands

`gh` commands anywhere; checks in the engine repository, on a branch made for the bot updates.

<a name="steps"></a>

## Steps

<!-- step: after-release -->
1. **Wait for the release to be out.** Bot pull requests are handled after each release, never in the middle of one.
   `release.yml` runs `main`'s copy of its workflow while it releases a tag, and a bot update of an action it uses
   would change the release run under way; the 4.1.19 release waited this way for #95–#102 (LOG #169).

<!-- step: list -->
2. **List them**, with their checks.

   ```sh
   # anywhere, with gh logged in
   gh pr list -R Quest-n-Click/quest-n-click --author app/dependabot
   gh pr checks <number> -R Quest-n-Click/quest-n-click
   ```

<!-- step: merge-green -->
3. **Merge a green one** whose change you have read (the release notes of the dependency, the lockfile diff). Several
   at once may go through one branch instead of one CI cycle each: merge their commits into it, run CI once, then
   close each bot pull request with a pointer to the branch (LOG #169 did seven this way).

<!-- step: fix-red -->
4. **A red one is fixed or closed, never left.** Reproduce the failure locally first. When the update is right and a
   test or our code must follow, fix it on the branch (Playwright 1.64 made WebKit print a test's deliberate 500, and
   the PWA test learned to excuse exactly that response). When the update is wrong for the project, close it with the
   reason written on the pull request: Vite 8 (its bundler broke a CommonJS default import, the game did not start),
   TypeScript 7 (no `baseUrl`, no non-relative `paths`), raised pip minimums that broke a shared Python (NumPy 2.5),
   `@types/node` 26.

<!-- step: follow-copies -->
5. **Follow the copies of the version.** Some dependencies are pinned elsewhere too:
   - the packages' own locks under `scripts/locks/` (the Bridge, the connectors, the Studio Server, the Bridge image):
     run `npm run locks` when a dependency of those packages changes, review the diff, commit it;
     `npm run locks -- --check` says whether each lock still fits;
   - nothing for Python: `requirements.txt` carries the sha256 of every file of each version and Dependabot rewrites
     them with the version (D54, #285); `tests/python-requirements.test.ts` checks each line pins `==` with a hash;
   - an action's pin: check the new SHA against the official tag (`gh api repos/<owner>/<action>/git/ref/tags/<tag>`).

<!-- step: release-path -->
6. **An update of an action used by `release.yml` or `candidate.yml`** is only proved by the next candidate and
   release run: label the branch `full-ci` (it also runs the candidate workflow, as information) and say in the pull
   request what remains to be seen.

> [!LIMIT id=no-auto-merge]
> Nothing merges a bot pull request by itself: no auto-merge is configured. A pull request that waits is a decision
> not taken, not a decision.

<a name="expected-result"></a>

## Expected result, and how to check it

`gh pr list -R Quest-n-Click/quest-n-click --author app/dependabot` lists nothing, or only pull requests opened since the last
release. `main` is green after the merges.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| A bot PR red only on `pwa-firefox` or a WebKit row | A known flake ([CI explained](contribute.ci.md)) | Re-run the job; reproduce before blaming the update |
| `tests/pack-locks.test.ts` fails after a merge | A package's lock under `scripts/locks/` no longer fits | `npm run locks`, review, commit |
| Type errors after a `@types/node` major | Types newer than the supported Node | Close it; `dependabot.yml` already ignores those majors |

<a name="files-changed"></a>

## Files or data changed

`package.json`, `package-lock.json`, `requirements.txt`, `.github/workflows/*.yml` (action pins),
`scripts/locks/*.json`. A code change that follows an update carries its `changes/` fragment
([Conventions](contribute.conventions.md#changes-fragments)).

<a name="recovery"></a>

## Recovery or going back

A merged update is reverted by a pull request that reverts its commit (`git revert`), with the reason; Dependabot then
proposes it again unless it is ignored in `.github/dependabot.yml`.

<a name="references"></a>

## References

- [`.github/dependabot.yml`](../../.github/dependabot.yml), [`docs/dev/LOG.md`](../../docs/dev/LOG.md) (#169, the
  pull requests of 11 October 2026).
- [CI explained](contribute.ci.md), [Releasing](contribute.releasing.md), [npm packages](contribute.npm-packages.md).
