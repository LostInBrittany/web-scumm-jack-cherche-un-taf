# Conventions

The names, titles and files a contribution to the engine repository follows, so that issues, branches, pull requests
and the CHANGELOG read the same way whoever wrote them. Each section is one convention, with what checks it.

<a name="titles"></a>
<!-- applies: .. since 4.3.0 -->

## Issue and pull request titles

### Form

- **Issue:** the template's prefix, `[bug]` or `[feature]` (`[field]` for a release's field pass), then the problem or
  the need as a sentence. An issue opened from the command line skips the template: type the prefix yourself.
- **Pull request:** `<Area>: <what changes> (#issue)`.
- **A pull request of a release's pass** starts with its version instead: `4.2.3: …`, `4.3 "Name": …`.
- **Body:** every section of the pull request template, "Not done, said as such" included ("Nothing" when nothing is
  left).

### Minimal example

```text
[bug] A save made in the cellar loads in the kitchen
Interface font: a proportional pixel font by default (#204)
```

### Constraints

Nothing checks a title mechanically; the maintainer does. The issue templates are `.github/ISSUE_TEMPLATE/bug-report.yml`
(title `[bug] `) and `feature.yml` (title `[feature] `); a feature request is opened after reading
[Classic mechanics](create.classics.md) and [Game commands](create.commands.md).

### Since

4.3.0.

<a name="branches"></a>

## Branch names

### Form

`<kind>/<issue>-<a-few-words>`. The kind is one of `feature`, `fix`, `docs`, `test`, `refactor`, or `release` with its
version (`release/4.4.0`).

### Minimal example

```text
fix/210-job-late-poll
feature/430-hero-choice
```

### Constraints

The branch without its prefix is the name of its CHANGELOG fragment (`210-job-late-poll`, next section). Nothing else
checks the name.

<a name="changes-fragments"></a>
<!-- applies: .. since 4.1.9 -->

## CHANGELOG and LOG fragments (`changes/`)

### Form

A branch that changes the code does not edit `CHANGELOG.md` nor `docs/dev/LOG.md`. It writes, under `changes/`:

- `changes/<slug>.md`: the CHANGELOG bullets, under `### Breaking`, `### Fixed` or `### Changes` (any of them, in any
  order). Write them as the CHANGELOG does: a bold lead, the version in parentheses, what a player, an author or a host
  sees differently.
- `changes/<slug>.log.md` (optional): the LOG entry. First line `## <title>` (what follows `#n · date · Claude ·
  proposal ·` in the LOG), then the body, its `→ next:` line last. The number and the date are the assembly's.

`<slug>` is the branch without its prefix, for example `419-cadence`.

### Minimal example

`changes/210-job-late-poll.md`:

```markdown
### Fixed

- **A prepared job keeps its result on screen (4.3.0, #210)**: on a hosted Studio, the Assets panel no longer replaces
  "prepared from revision 3" with "Preparing the assets: done" when a late status answer arrives.
```

### Constraints

```sh
# in the engine repository
npm run changes -- --check [--base=origin/main]
```

- It fails a branch that touches `src/`, `bridge/`, `tools/`, `scripts/`, `cli/`, `connectors/` or `games/` without a
  fragment and without a CHANGELOG edit: `✖ this branch changes the code and carries no fragment: write
  changes/<slug>.md (### Fixed | ### Changes | ### Breaking, then the bullets)…`. CI's `check` job runs it on pull
  requests. A change to `docs/`, `wiki/` or `tests/` alone needs no fragment.
- A heading other than the three (`### Added`, for instance) is refused: `a fragment's heading is one of ### Breaking |
  ### Fixed | ### Changes`. Text before the first heading is refused too: `a fragment starts with its heading`.
  Nothing is filed silently.
- A release branch is the exception: it assembles the fragments and edits the CHANGELOG itself.
- `changes/README.md` is not a fragment.

### Assembly

```sh
# in the engine repository, on main, with the full history
npm run changes -- --assemble [--date=YYYY-MM-DD]
```

It folds every fragment into the CHANGELOG's `## Unreleased` (each bullet under its section, Breaking, Fixed, then
Changes) and numbers the LOG entries after the last one, in the order the fragments reached `main` (their first
commit's date: a rebase moves it), then removes them. Only the `Unreleased` block is rewritten. It refuses a shallow
clone (`git fetch --unshallow`), which would date every fragment at its boundary. Two open branches never conflict on
the CHANGELOG, the LOG or their entry numbers.

### Since

4.1.9 (lot 0 "cadence").

<a name="formatting-commits"></a>
<!-- applies: .. since 4.1.0 -->

## Formatting and formatting commits

### Form

Biome formats and lints the code (`biome.json`: two spaces, 120 columns, single quotes, semicolons, trailing commas).
`npm run format` writes the formatting; `npm run format:check` and `npm run lint:code` check it (both inside
`npm run quality`).

### Constraints

- A change that only reformats is its own commit, listed in `.git-blame-ignore-revs`, so `git blame` skips it. Locally:
  `git config blame.ignoreRevsFile .git-blame-ignore-revs` (GitHub reads the file by itself).
- **`games/` is linted, never reformatted**: the formatter excludes `games/**`, because the Studio writes the content.
- `Math.random` is refused in `src/engine/core/` and `src/engine/minigames/` (a lint plugin): randomness goes through
  the seeded generator. In `src/engine/core/remix/`, `Math` itself is refused (ADR 0018).
- `any` is refused outside `tests/` and `scripts/`; floating promises are refused everywhere.

### Since

4.1.0 "Clarity" (the Biome formatting commit is the first line of `.git-blame-ignore-revs`).

<a name="docs-languages"></a>

## Languages of the documentation

### Form

| What | Language |
|---|---|
| Wiki pages (`wiki/en`, `wiki/fr`) | Both, each written natively, the same sections and facts ([Writing documentation](contribute.writing-docs.md)) |
| `docs/dev/` (plans, decisions, ADRs, LOG, passes) | English, public development documentation (D3) |
| `CHANGELOG.md`, code comments, commit messages | English |
| `README.md` / `README.fr.md` | Both |
| `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CREDITS.md` | English in the repository; their French versions are the wiki pages |

### Constraints

A pull request that changes what a user sees updates the pages in both languages (the template's second checkbox).
`docs/en` and `docs/fr` are transition pages since 4.5.0: never edit them, write in `wiki/`.

<a name="review-owners"></a>

## What asks for the maintainer's review

`.github/CODEOWNERS` names the files a pull request cannot change without the maintainer's look: the frozen behaviour
(`tests/quality-baseline.json`), the public surface (`tests/api-surface.json`), the named survivors of mutation
testing (`docs/dev/mutants.json`), the coverage floors (`vite.config.ts`) and the workflows (`.github/`). Everything
else is reviewed by the gates.

<a name="related"></a>

## Related identifiers

- `npm run changes`, `npm run format`, `npm run format:check`, `npm run lint:code`.
- [Before a pull request](contribute.before-a-pr.md), [Governance](contribute.governance.md).
