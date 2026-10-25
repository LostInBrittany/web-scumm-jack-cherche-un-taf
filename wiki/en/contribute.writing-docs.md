# Writing documentation

How the documentation of quest'n'click is written, checked and published: one source, `wiki/`, in English and
French, from which the GitHub wiki, the versioned Pages site, the bundle in the package and the MCP documentation tools
are all generated. This page is the procedure for writing or changing a page, then the reference of what a page and
the manifest may hold.

<a name="what-you-get"></a>

## What you get

A page, or a change to one, in both languages, that `npm run wiki -- check` accepts, whose facts are tied to the code
it rests on, and that the next release publishes. A page edited in the GitHub wiki itself is not kept: the wiki is
generated, and its next publication overwrites it.

<a name="context-and-versions"></a>

## Context and versions

The engine repository. The wiki's tooling is new in 4.5.0 (ADR 0030, D50, `docs/dev/PLAN-4.5-WIKI.md`). Since the
4.5.0 switch-over `docs/en` and `docs/fr` are transition pages that `npm run wiki -- transition` writes from the
coverage matrix: never edit them, write in `wiki/`. Publication happens only from a release, after `ship verify`, never from
`main` ([Releasing](contribute.releasing.md)).

<a name="prerequisites"></a>

## Prerequisites

- A prepared repository: [Developer setup](contribute.setup.md).
- The facts you write, read in the current code: when the code and an old page disagree, the code wins.

<a name="where-to-run"></a>

## Where to run the commands

In the engine repository, on your machine. Every `npm run wiki -- …` command reads `wiki/` by default (`--wiki=<dir>`
reads another folder, as the tests do).

<a name="steps"></a>

## Steps

<!-- step: find-entry -->
1. **Find the page's entry in `wiki/manifest.json`.** Every page has one, written or not: its `id`, type, audience,
   context, titles, URLs, state. A new page needs its entry first; an entry is never renamed (the id names the file and
   never moves).

<!-- step: copy-template -->
2. **Start from the template of its type**, `wiki/_templates/<type>.en.md` and `<type>.fr.md` (tutorial, howto,
   reference, explanation, troubleshooting), copied to `wiki/en/<id>.md` and `wiki/fr/<id>.md`. Keep the template's
   section ids; delete its comments. The header (type, audience, context, versions, statuses, language switch) and the
   footer are generated: do not write them.

<!-- step: write-natively -->
3. **Write each language natively**, not word for word: short sentences, the same sections and the same facts. Every
   command is preceded by the folder and the context it runs in (the engine repository, a created project, a hosted
   Studio). A figure has a date and a source. A guarantee states its limit and its proof. `docs/dev` is "public
   development documentation", never "internal".

<!-- step: manifest-fields -->
4. **Fill the entry**: `state` (`draft`, then `ready`), `versions.appliesFrom`, precise `sources`, `questions` for a
   how-to or troubleshooting page, `aliases`, `keywords`, `identifiers`, `related`, `prerequisites`, `claims` for each
   `[!GUARANTEE]`, `surfaces` where a contract applies (ids of `docs/dev/contracts.json`). The `replaces` field is
   generated from the coverage matrix: never typed.

<!-- step: check -->
5. **Check.**

   ```sh
   # in the engine repository
   npm run wiki -- check
   ```

   It ends with `✔  wiki (work level): <n> pages consistent, <w> warning(s), <l> link(s) to planned pages`, or lists
   each error (`✖`) with its file and line. Warnings (`⚠`) and what is still to write (`·`) do not fail it.

<!-- step: record-reviews -->
6. **Record who read what** once the two languages were read against each other, and once a claim's test was read
   against the claim:

   ```sh
   # in the engine repository
   npm run wiki -- translations --ack <id>#<section> --by <name> --kind human|ai --relation author|independent
   npm run wiki -- review-claim <claim-id> --by <name> --kind human|ai --relation author|independent
   ```

<!-- step: preview -->
7. **Look at the generated wiki** when the layout matters:

   ```sh
   # in the engine repository
   npm run wiki -- build --target wiki --out .cache/wiki --preview
   ```

   The output folder must be outside the working tree or under `.cache/`; `--preview` includes the `draft` pages.

<!-- step: pull-request -->
8. **Open the pull request** with both languages together. A branch that touches only `wiki/` needs no `changes/`
   fragment ([Conventions](contribute.conventions.md#changes-fragments)); CI's fast tier runs the documentation's
   checks on every change.

<a name="expected-result"></a>

## Expected result, and how to check it

`npm run wiki -- check` ends with `✔` and 0 error. `npm run wiki -- stats` shows the page in its state. When the page
answers a real question, `npm run wiki -- acceptance` finds it in the top three for that question, and first for a
question marked `top1` (a clear symptom such as "no sound", a message typed whole); the report gives the top 3 and
the top 1 apart ([the commands](#commands)). Neither says a reader understands the answer or can follow it: that is the
AI reader's test and the people's passes. Add a new wording to `questions.json` rather than to the page's aliases, so
the test keeps measuring wordings the page was not written for.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `<id> (draft): fr/<id>.md is missing (both languages)` | Only one language written | Write both; a written page always has both files |
| `<id> (planned): planned, yet en/<id>.md exists` | A file for a page still `planned` | Set its `state` to `draft` (with `versions` and `sources`) |
| `the source "<glob>" matches no tracked file` | A glob with a typo, or a file not committed yet | Fix the glob; `git add` the file |
| `line <n>: links to <path>, which git does not track` | A repository link that does not resolve | Links to files are `../../path/in/repo`, from `wiki/<lang>/` |
| `<id>.md#<anchor> is not a section of <lang>/<id>.md` | A link to a section id that does not exist | Use the target page's section id, the same in both languages |
| `the section ids differ between en and fr` | A `ready` page whose twins do not have the same sections | Same `<a name>` ids in both |
| `a howto page asks at least one question in en and fr` | `questions` empty | Add at least one natural question per language |
| `coverage.json …: <id>#<section> is not a section of <id>` | The coverage matrix sends an old section to a section id the page lacks | Give the page that section id |
| `⚠ the source "<glob>" covers <n> files (> 25)` | A glob too wide | Narrow it: an ordinary change must not ask to reread dozens of pages |

<a name="files-changed"></a>

## Files or data changed

`wiki/en/<id>.md`, `wiki/fr/<id>.md`, the page's entry in `wiki/manifest.json`; `wiki/translations.json` and
`wiki/reviews.json` through their commands; images under `wiki/images/` only.

<a name="recovery"></a>

## Recovery or going back

Everything is in Git. A published documentation revision is immutable: a correction to a released version's
documentation is a new revision `r<n>` made from a branch `docs/<version>` and published by the `docs-publish`
workflow, never an edit of what was published.

<a name="layout"></a>

## Reference: the `wiki/` folder

| Path | What it holds |
|---|---|
| `wiki/manifest.json` | The map of the documentation: one entry per page, written or not |
| `wiki/en/<id>.md`, `wiki/fr/<id>.md` | The pages, one file per language |
| `wiki/_templates/*.{en,fr}.md` | The five page templates |
| `wiki/images/` | The only images a page may show (`../images/<file>` from a page) |
| `wiki/coverage.json` | The coverage matrix: every section of the old documentation and its destinations |
| `wiki/legacy.json` | For each of the eight `read_doc { name }` pages, the ordered sections that rebuild it |
| `wiki/translations.json` | Which revision of each language was read against the other, and by whom |
| `wiki/reviews.json` | Which claims' scope was read against their test, and by whom |
| `wiki/data/env.json`, `wiki/data/glossary.json` | The environment variable register and the bilingual glossary |
| `wiki/acceptance/questions.json` | The real questions the documentation must answer, with counter-examples |

<a name="manifest"></a>

## Reference: the manifest

### Form

`{ "format": "quest-n-click-docs-manifest", "version": 1, "pages": [...] }`. The schema is strict: a field it does not
name is refused, so a misspelt key is an error.

### Values

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | `<domain>.<slug>` in lowercase kebab case; names the file, never moves |
| `domain` | yes | `index`, `start`, `play`, `install`, `create`, `engine`, `studio`, `team`, `clever`, `bridge`, `contribute`, `reference`, `help` |
| `type`, `alsoTypes` | `type` | `tutorial`, `howto`, `reference`, `explanation`, `troubleshooting`, `index` |
| `audience` | yes | `player`, `author`, `admin`, `contributor` |
| `context` | yes | `engine-repo`, `created-project`, `studio-local`, `studio-demo`, `studio-hosted`, `bridge`, `player` |
| `title.{en,fr}`, `url.{en,fr}` | yes | The natural titles; the public URLs (below) |
| `state` | yes | `planned`, `draft`, `ready` (below) |
| `versions` | from `draft` | `appliesFrom` (the first version for which what the page says is true and works), `appliesUntil`, `featureSince` |
| `sources` | non-empty from `draft` | Globs of the tracked files the page rests on: its drift sources |
| `replaces` | generated | The old sections the page takes over, from the coverage matrix |
| `questions.{en,fr}` | how-to and troubleshooting: at least one each | Natural questions a reader asks |
| `aliases`, `keywords` | optional | Other names (an old name, a synonym), other search words |
| `identifiers` | yes (may be empty) | Exact identifiers the page documents: a command, an npm script, a variable, a route, a code |
| `related`, `prerequisites` | yes (may be empty) | Other page ids |
| `claims` | with each `[!GUARANTEE]` | `{ id, test: "file.test.ts › describe › it" }` |
| `surfaces` | optional | Ids of `docs/dev/contracts.json`; the header shows their statuses |
| `lifecycle` | optional | `deprecated` or `archived`, a page kept for older versions |
| `owner`, `reviewed` | optional | `@wanoo` by default; the day of the last review |

**URLs** are mechanical: `EN-<Domain>-<Topic>` and `FR-<Domaine>-<Sujet>`, ASCII words each capitalised, joined by
hyphens, the domain's fixed word (`Start`/`Demarrer`, `Create`/`Creer`, `Engine`/`Moteur`, `Team`/`Equipe`,
`Contribute`/`Contribuer`, `Help`/`Aide`; the others the same in both), acronyms in capitals (`EN-Reference-NPM-Scripts`,
never `Npm`). URLs are unique without case.

### Constraints

| `state` | Meaning | Published |
|---|---|---|
| `planned` | Destination decided, no file (a file is an error) | No |
| `draft` | Files in both languages, checks incomplete | No: previews only, with a "draft" banner |
| `ready` | Complete, checks passed, translation paired | Yes |

`ready` says the work is complete, not that a person reviewed it: that is recorded apart ([Reviews](#reviews)). The
four indexes (`index.by-task`, `index.by-symptom`, `index.identifiers`, `index.glossary`) are `generated: true`, have
no file, and are built from the data. `wiki -- check` warns when a glob covers more than 25 files, or when one source
file feeds more than 10 pages.

<a name="page-anatomy"></a>

## Reference: a page

**Section ids.** A plain HTML anchor on its own line before each `##` or `###` heading, lowercase kebab case, the same
id in both languages; a link to a section survives a translated heading:

```markdown
<a name="walkable-zones"></a>

## Walk zones
```

**Links.** Another page: `create.rooms.md#walkable-zones` (relative, same language folder). A repository file:
`../../src/engine/core/save.ts`, from `wiki/<lang>/`; a bare `src/x.ts` is refused. An image: `../images/<file>`. The
build rewrites each link for each output (wiki, Pages, the bundle). A link to a `planned` page is listed, not an error,
at the work level; a published page may only link to `ready` pages.

**Steps.** Each essential step of a procedure carries `<!-- step: <id> -->` on the line before it; the set of step ids
is the same in both languages.

**Section versions.** A section true for fewer versions than its page says so on the line right after its anchor,
inside the page's range and the same in both languages: `<!-- applies: 4.2.2.. -->` (from), `<!-- applies:
4.2.2..4.4.0 -->` (both inclusive), `<!-- applies: ..4.4.0 -->` (until), with `since <v>` for the version the feature
appeared in and a last `deprecated` or `archived` for a section kept for older versions. A malformed marker is an
error, never ignored.

<a name="structured-blocks"></a>

## Reference: structured blocks

Blockquotes with an id, paired by id between the languages, and rendered by the build:

```markdown
> [!LIMIT id=local-only]
> Available on the local Studio only, not on a hosted Studio.

> [!GUARANTEE id=restore-empty-db-only]
> A restore goes into an empty database only; any other is refused.

> [!MEASURE id=restore-time]
> 30 to 60 s, observed: an observation, never a promise.
> - date: 2026-10-19
> - version: 4.2.3
> - volume: 508 journal lines
> - conditions: the smallest plans
> - source: https://github.com/Quest-n-Click/quest-n-click/blob/<40-hex sha>/docs/dev/QUALIF-4.2.3-REFERENCE.md
```

- **`[!LIMIT]`**: what the page does not cover, or where a feature stops, said plainly.
- **`[!GUARANTEE]`**: a behaviour the product guarantees, with its manifest claim `{ id, test }` naming a real test as
  its `describe` titles and its own joined by ` › `. A test written `.skip`, `.todo`, `.only`, `.fails`, `.skipIf` or
  `.runIf` backs no claim. A claim has three states, shown as they are: **referenced** (the test exists), **executed**
  (it passed on the documented commit, read from the candidate's Vitest JSON report; `check --publish` requires it),
  **scope reviewed** (someone read that the test covers the claim; a change to the claim's text or the test file
  resets it). Claim ids are unique across the manifest.
- **`[!MEASURE]`**: five `- key: value` lines with the keys in English in both languages; date, version and source
  identical in both; the source is a GitHub link at a full 40-character commit (`blob/<sha>/…`).

<a name="examples"></a>

## Reference: checked examples

A fenced block tagged `room-example` holds JSON: a room as `defineRoom` takes it, or `{ "room", "layout", "items",
"characters", "verbs", "hero" }` when it needs its geometry, items, actors, the game's own verbs or another hero. It
is put into a one-room game (schema 3) and run through the engine's validator: any error fails `wiki -- check`. A block
tagged `studio-config` holds a Studio Server configuration, loaded by the server's own loader (`loadConfig`): what it
refuses, the check refuses. Use plain `json` or `ts` blocks for anything that must not be validated. The parser never
reads inside a fenced block, so syntax shown in a fence (like the examples on this page) is not taken for a real anchor
or block.

<a name="parity"></a>

## Reference: French and English parity

There is no source language. For a `ready` page, `wiki -- check` compares the two languages by meaning, not by words:
the same section ids, the same link destinations (`id#section`, never URLs), the same structured blocks by kind and id,
the same step ids, the same section versions, and a measure's same date, version and source. Translatable text
(lines, labels, comments in code blocks) may differ; shell commands stay identical, comments aside.

<a name="reviews"></a>

## Reference: translations and reviews

`wiki/translations.json` records, for each section `<id>#<section>` of a `ready` page (`<id>#_lead` for the text before
the first section), the hash of each language that was read against the other and its reviewers. When either text, or
an image the section shows, changes, the pair is "to review": a warning at the work level, an error for
`check --publish`. `wiki/reviews.json` records the same for a claim's scope (the hashes of the claim's text and of its
test file).

Each reviewer is `{ name, kind: human|ai, relation: author|independent, date }`, and both commands require `--by`,
`--kind` and `--relation`. The same text read again adds a reviewer; a changed text starts over. A published claim
needs a review by a person (`kind: human`); until then it says "self-checked by the author (AI), not reviewed" (or
"checked by an independent AI, not reviewed by a person"), never "reviewed". A published translation pair needs a
record, an AI's included: a pair checked by an AI only does not stop `check --publish`, which lists how many there are
among its gaps, and the page's header says who read it ("written and self-checked by an AI, not reviewed by a person",
"partly reviewed by a person"…). Only a pair "to review" stops it.

> [!LIMIT id=ai-review-is-not-review]
> An AI's check of what it wrote is recorded as `--kind ai --relation author` and is never shown as a review. Only a
> record with `--kind human` makes a pair or a claim "reviewed".

<a name="commands"></a>

## Reference: the commands

All run in the engine repository as `npm run wiki -- <command>`.

| Command | Does |
|---|---|
| `check` | The work level of every pull request: schema, files present for `draft` and `ready` pages, links, parity of `ready` pages, structured blocks, examples, claims referenced, the coverage matrix against `docs/`, the real questions' file. Fails on errors only |
| `check --publish --product-ref <tag\|sha> [--doc-ref <sha>] [--released] [--state preview\|candidate\|published] [--test-report <file>]… [--candidate <run id>]` | The publication level: published pages link to `ready` pages only, no translation to review, every claim executed on the product, the source set the product's plus documentation only; `--state candidate\|published` needs `--candidate` |
| `stats [--json]` | Pages by state, domain, type and language, and the coverage counters |
| `build --target wiki --out <dir> [--preview]` | The folder a publication pushes to the GitHub wiki; `ready` pages only, drafts too with `--preview`; refuses a folder inside the working tree other than `.cache/` |
| `bundle --out <dir> [--build-id <id>] [--allow-dirty]` | The documentation an installed engine carries (`scripts/pack.mjs` runs it); refuses sources that differ from `HEAD` unless `--allow-dirty`, which marks it `-dirty` |
| `translations --ack <id#section> --by <name> --kind human\|ai --relation author\|independent` | Records that a pair was read |
| `review-claim <id> --by … --kind … --relation …` | Records that a claim's scope was read |
| `coverage [--ack <key>]`, `coverage --init [--force]` | Merges a new inventory of the old docs into the matrix, regenerates `legacy.json` and the manifest's `replaces`; `--init` takes the first inventory (`--force` replaces an existing matrix, losing every decision) |
| `acceptance [--lang en\|fr] [--json] [--strict]` | Runs the real questions through `search_docs`; exits 0 (reported) unless `--strict`; `--export-prompts <dir>` writes the prompts of an AI reader's test instead |
| `env` | Regenerates the environment variable reference from `wiki/data/env.json` and the code |
| `archive`, `publish`, `pages`, `transition`, `next-revision`, `attest` | The publication chain, run by the release and `docs-publish` workflows |

`npm run docs:truth` checks what the old documentation states against the code (schemas, `npm run` scripts, files,
the current release in the READMEs); `npm run docs:links` asks every external link once, by hand before a release,
never in CI.

<a name="coverage-freeze"></a>

## Reference: the coverage matrix and the freeze

`wiki/coverage.json` lists every section of the old documentation (`docs/en`, `docs/fr`, `CONTRIBUTING`, `SECURITY`,
`CODE_OF_CONDUCT`, `CREDITS`, both READMEs) with its destinations `id#section` and two counters, "destinations
planned" and "content migrated and reviewed". No content may be lost: every fact, command, example, limit and warning
of a replaced section lands in one of its destination pages. Until the switch-over, `wiki -- check` refused a matrix out
of step with `docs/` (the freeze). Since it (4.5.0) the matrix is final: the old pages are the transition pages it makes
(`npm run wiki -- transition`), and `wiki -- check` refuses one edited by hand or one that lost an old anchor.

<a name="drift"></a>

## Reference: when the code moves under a page

`npm run ci:plan` reads a branch's diff and names the wiki pages whose `sources` it touched ("wiki pages to reread"),
and CI's `docs` family runs on them. A page's `sources` are therefore its precise drift sources: keep them narrow.

> [!LIMIT id=no-drift-ack-yet]
> The plan's `wiki -- ack <id> --reason` command, which would record "reviewed, nothing to change" for a drift notice,
> is not implemented in 4.5.0: `ci:plan` names the pages, and the reader decides.

<a name="decisions"></a>

## Decisions and ADRs

- [ADR 0030](../../docs/dev/adr/0030-documentation-from-wiki-sources.md): the documentation is generated from one
  source in the repository, and published per release; D50 in [`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md).
- The plan: [`docs/dev/PLAN-4.5-WIKI.md`](../../docs/dev/PLAN-4.5-WIKI.md).
