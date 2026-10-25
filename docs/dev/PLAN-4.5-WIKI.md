# Plan — 4.5 "Wiki": the documentation as a bilingual wiki (FR / EN), generated from `wiki/`

Status: **accepted**. The maintainer approved revision 3 on 23 Oct 2026 and reviewed it again the same day; that
review (revision 3.1) is folded into this text. Decision D50, ADR 0030. The D37 yes for v4.5.0 is given: « tu peux
signer la 4.5 » ("you may sign 4.5"). The French working copy of the plan, with its three revisions, stays outside the
repository; this file is the reference.

## 1. The need

The GitHub wiki of `wanoo/quest-n-click` is enabled and empty. Its git repository, `quest-n-click.wiki.git`, only
exists once a first page is saved through the web interface.

At 4.4.0 "Author's Desk" the project holds an engine, authoring tools, a local Studio, a hosted multi-user Studio,
the Reality Bridge, connectors and a signed release chain. Its documentation is 31 pages in `docs/en` (32 files with the `PRODUCTION.template.md` template), their twins in
`docs/fr`, `docs/dev` in English, and root files in English only. It describes the features. It does not say how to
find the right answer, how to check that it applies to one's situation, or how it is kept true over time.

**The bar**, set by the maintainer: « un humain ou une IA trouve une réponse exacte, applicable à sa version et reliée
à ses sources » (a human or an AI finds an exact answer, applicable to their version and linked to its sources). The
number of pages comes after, and is counted from the manifest.

**Decisions of 23 Oct 2026** (D50):

1. The source lives in the repository, under `wiki/`, reviewed in pull requests and checked by tests. The GitHub wiki
   is a **generated publication**: an edit made in the wiki is not kept.
2. The whole user and contributor documentation moves. `docs/en` and `docs/fr` become transition pages. `docs/dev`
   stays the development documentation: public, in English (D3), written for maintainers.
3. Hosting the team Studio is documented for Clever Cloud only, in detail.

## 2. What 4.4.0 does today, and where it stops

Read in the 4.4.0 code (`c00b44fc`):

| Consumer or fact | Where | Consequence |
|---|---|---|
| MCP `read_doc` takes `{ name: z.enum(DOCS) }`, `DOCS` = `CONTENT_GUIDE`, `ENGINE`, `TOOLS`, `STUDIO`, `WORKFLOW`, `AUDIO`, `UPGRADING`, `CLASSICS` | `tools/studio/tools.ts:75`, `:489` | That exact call must keep working |
| It reads `docs/en/<name>.md` | `tools/studio/backend.ts:55` | Moving the files breaks it |
| It answers with `textResult`, one `content[0].text`; `ToolResult` already accepts `structuredContent` | `tools/studio/tools.ts:70-73` | Provenance can go in `structuredContent` |
| The MCP server tells agents « read_doc CONTENT_GUIDE » | `tools/mcp/tools-server.ts:81` | To update |
| The demo snapshot embeds `CONTENT_GUIDE`, the Assistant reads it | `tools/studio/snapshot.ts:22`, `src/studio/api-browser.ts:112` | A second consumer |
| The packager copies the files `git ls-files --cached` lists, filtered by `SHIP`, into a prepared folder; it also stops on any untracked file under a shipped root | `scripts/pack.mjs:34-97` (untracked check l.68-74) | No doc is packed; `read_doc` in a created project has nothing to read. The bundle is written into the prepared folder, never under a shipped root |
| `dist` is in `.gitignore` | `.gitignore` | A generated `wiki/dist` would never be packed |
| CI's `external-consumer` already installs the archives outside the repository | `scripts/external-consumer.mjs` | The place for the package check |
| The site is built and uploaded in an earlier job (`upload-pages-artifact`), and the `pages` job deploys it whole, from `main` | `.github/workflows/ci.yml:111`, `:1059` | Docs built from `main` would leak unreleased features |
| `release.yml` publishes with `gh release edit --draft=false` under `GITHUB_TOKEN`, then runs `ship verify` | `.github/workflows/release.yml:373` (publish), `:377` (`ship verify`, a step of the same `release` job) | An event made with `GITHUB_TOKEN` starts no other workflow; and "published" comes before "verified" |
| `docs/dev/surfaces.json` names `docs/en/STUDIO-SERVER.md`, `MCP.md`, `CONTENT_GUIDE.md` and `STUDIO.md` in pass surfaces' `config` (ADR 0024) | `docs/dev/surfaces.json:200`, `:260`, `:290`, `:301`, `:302` | Moving them changes those surfaces; C2 updates every one |
| 167 active files and 37 historical files of `docs/dev` cite `docs/(en|fr)/`, some with an anchor (`UPGRADING.md#39-from-425-to-430-hero-choice`) | `git grep` | Links to keep alive |
| "Never delete an asset; rename to `_v1`" | `AGENTS.md:53` | Unused images are archived, not deleted |

The doc checks that exist (`tests/docs-links.test.ts`, `tests/docs-truth.test.ts`, `tools/docs-truth.ts`,
`tests/scripts-documented.test.ts`, `tests/dsl-doc.test.ts`, `tests/api-doc.test.ts`, `tests/classics.test.ts`,
`tests/support-truth.test.ts`, `tests/readme-*.test.ts`) read `docs/`; none reads a wiki.

## 3. Principles

1. **One source, several outputs.** `wiki/` makes the wiki (current version), the Pages site (per version), the bundle
   in the package, the archive attached to the release, and the index MCP and the Assistant read.
2. **A page states what it is for** (tutorial, how-to, reference, explanation, troubleshooting), who it is for, in
   which context, for which versions.
3. **A page stands alone**, even when only a fragment of it is read.
4. **Every kind of claim has its check, and the check's scope is stated** (§4.4). Explanations are reviewed by people.
5. **The move is reversible and measured**: nothing is lost without a written decision; no public link breaks.
6. **Published documentation names exactly one published product.** What is on `main` and not released only shows in
   previews.

## 4. The six deliverables, before anything moves

### 4.1 L1 — The manifest, a map of the documentation

**Sources.** One page is one file `wiki/<lang>/<id>.md`, `id` being the stable identifier (`create.rooms`,
`clever.restore-drill`). The manifest is `wiki/manifest.json`. A section carries an explicit anchor, written in plain
HTML so GitHub's own rendering honours it, the same in both languages:

```markdown
<a name="walkable-zones"></a>

## Zones de marche
```

A link between pages is a relative link to the source file, `create.rooms.md#walkable-zones`: readable and clickable
in the repository; the build rewrites it for each output (§4.5.6).

**Public URLs**, mechanical: `EN-<Domain>-<Topic>` and `FR-<Domaine>-<Sujet>`, ASCII, in the page's language
(`EN-Studio-Conflicts`, `FR-Studio-Conflits`). The domains are fixed: Start/Demarrer, Play/Jouer, Install/Installer,
Create/Creer, Engine/Moteur, Studio/Studio, Team/Equipe, Clever/Clever, Bridge/Bridge, Contribute/Contribuer,
Reference/Reference, Help/Aide, Index/Index. Titles shown stay natural. The language prefix makes collisions
impossible ("Commands" becomes `EN-Create-Game-Commands` and `EN-Reference-NPM-Scripts`). A URL that changes leaves a
generated redirect page behind.

**Metadata.** Required for every page: `id`, `type` (`tutorial`, `howto`, `reference`, `explanation`,
`troubleshooting`, `index`), `audience` (`player`, `author`, `admin`, `contributor`), `context` (`engine-repo`,
`created-project`, `studio-local`, `studio-demo`, `studio-hosted`, `bridge`, `player`), `versions` (§4.4.1),
`title.{en,fr}`, `url.{en,fr}`, `state` (below), `sources` (precise globs of the code, schemas, tests or
qualifications the page rests on; §9), `replaces` (old destinations, from L2).

Also required for a how-to and a troubleshooting page: **at least one natural-language question per language**
(`questions.en[]`, `questions.fr[]`), e.g. "How do I restore the Studio on an empty database?" / « Comment restaurer
le Studio sur une base vide ? ».

Optional: `aliases`, `keywords`, `prerequisites`, `related`, `claims`, `owner`, `reviewed` and its cadence.

*Amendment (A2):* `versions` and a non-empty `sources` are required from `draft` on; a `planned` page may not know
them yet, but any source glob it gives must already match a tracked file. The four indexes are marked
`generated: true`: they have no source file (a file for one is an error) and are built with the first published page,
listing published pages only.

**Generated from the manifest:** `Home`, the two sidebars, the footer, each page's header (type, audience, context,
versions, status, language switch), and four indexes:

| Index | Entry | Source |
|---|---|---|
| By task ("I want to…") | A goal | How-to and tutorial pages, their `questions` and `aliases` |
| By symptom or error | An exact message, a code (`409`, `423`, `503`), an observed behaviour | Troubleshooting pages, and an **error register** taken from the code (HTTP codes of the routes, validator, solver and `doctor` messages; deferred to A5) |
| By identifier | DSL command, field, npm script, CLI subcommand, environment variable, HTTP route, MCP tool | **Generated** from structured sources: `package.json`, the DSL command table, `studio-server/src/ops/routes.ts`, `tools/studio/tools.ts`, the variable register (§4.7.4), the CLIs. A test requires a destination for each identifier (A2 generates the npm scripts and MCP tools and lists the unclaimed ones as gaps; the rest, and the requirement, come in A5) |
| By vocabulary | Common word, project word, old name (`web-scumm`), FR ↔ EN equivalent (verrou / bail / lease) | The bilingual glossary and `aliases` |

Page templates are in Annex B. A screenshot is always doubled by text giving its important labels.

**States and check levels.**

| `state` | Meaning | Published |
|---|---|---|
| `planned` | Destination decided, no file | No: absent from sidebars and public indexes |
| `draft` | File present, checks incomplete | No: in the preview artifact, with a "draft" banner |
| `ready` | Reviewed, checks passed, translation paired | Yes |

| Level | Command | Requires |
|---|---|---|
| Work in progress (every PR) | `wiki -- check` | Consistency of what exists: schema; `draft` and `ready` files present; links to `planned` pages allowed and listed; parity of `ready` pages; examples and configs present are valid. Prints what is missing |
| Publication | `wiki -- check --publish` | Every published page `ready`; no link to a `planned` or `draft` page; no translation "to review"; claims executed (§4.4.3); source set conforming (§4.5.2) |

**Test** `tests/wiki-manifest.test.ts`: schema, every file in the manifest and back, URLs follow the convention and are
unique, both languages present, `sources` resolve, and the count of pages by domain, type, state and language is
printed: it is the workload estimate (Annex A lists about 140 entries per language, before sub-pages).

*Amendment (A5):* "every published page `ready`" holds by construction (the build and the bundle take `ready` pages
only); `check --publish` lists the drafts it leaves out, refuses a `ready` page linking to a `draft` or `planned` one,
and requires `--product-ref`, with `--doc-ref` (default HEAD) the clean checkout; `--state preview|candidate|published`
(default `published`, which implies `--released`); `--state candidate|published` requires `--candidate <run id>`, the
run the test reports must come from. The source set is judged on `git diff --no-renames --name-status` (both sides of
a rename), `wiki/images/` holding image files only. A page or section whose `appliesUntil` is below the product is
refused unless marked `lifecycle: deprecated|archived` (a section: `archived` or `deprecated` at the end of its marker).
The preview's tag rule fails closed: it reads `git ls-remote --tags origin` and the local tags, and refuses when
neither can be trusted; `docs-publish` (A5b) checks out with `fetch-depth: 0` and fetches the tags.

### 4.2 L2 — The coverage matrix (`wiki/coverage.json`)

**A complete anchor inventory**, made by `wiki -- coverage --init` over the 31 × 2 pages of `docs/`, `CONTRIBUTING`,
`SECURITY`, `CODE_OF_CONDUCT`, `CREDITS` and both READMEs: headings of **every level** (`#` to `######`), **repeated
headings** with the `-1`, `-2` suffix GitHub computes, **explicit anchors** (`<a id>`, `<a name>`), and the incoming
anchored links found in the repository, as a cross-check.

**One row per section:** old section and anchor; destinations `id#section` (**many to many**); `keep`, `rewrite` or
`drop`, with the reason for a `drop`; code blocks kept (hashes); the associated check; and **two separate states**,
`planned` (destination decided) and `migrated` (content present in a `ready` page and reviewed).

**Two counters, always shown together:** "destinations planned: x %" and "content migrated and reviewed: y %". The
switch-over requires y = 100 %.

**Review aids, not proofs:** every old code block is found again or its rewrite declared; sentences that look like a
limit are spotted by markers and turns of phrase (*only*, *not*, *uniquement*, *seulement*, *pas encore*, *local
only*…) and **proposed** to the reviewer, who ticks "limit carried into a `[!LIMIT]`" or "not a limit". A limit with
none of these words ("available on the local Studio") can be missed: the aid helps a review, it does not replace it.

**The legacy order.** `wiki/legacy.json` gives, for each of the 8 old `read_doc` names, the **ordered list** of
`id#section` that rebuilds it (the order of the old sections in L2). A section listed twice is kept at its first
position only. A test checks that every old `##` heading is covered.

**Freeze.** Once the skeleton exists, any change to `docs/en` or `docs/fr` must be carried into `wiki/`; a test reports
the gap.

### 4.3 L3 — The documentation access contract

**4.3.1 Consumers.** A test lists every reader of `docs/` or `wiki/`: the local MCP and the remote MCP
(`tools/studio/http-backend.ts`), the Studio's Assistant (local and demo) and the demo snapshot, the packages and the
created project, messages and comments in the code, `surfaces.json`, the DSL and API generators, the tests.

**4.3.2 `read_doc`: exact compatibility.**

- The schema **keeps `name` with the same `enum` of eight values** and adds optional properties:
  `{ name?: enum(DOCS), id?: string, section?: string, lang?: 'en'|'fr', cursor?: string, maxChars?: number }`,
  under the rule "exactly one of `name` and `id`".
- Both given, or neither: an `isError` result, "give either name (one of the 8 legacy pages) or id, not both". Never a
  silent choice.
- **The legacy call `{name: "CONTENT_GUIDE"}`** answers **one Markdown text block**, as today; English by default, as
  today; **no truncation**, as today. *Amendment (A4 review):* the legacy call carries no `structuredContent`, for
  exact compatibility (a client that prefers structured content would otherwise lose the page); other arguments beside
  `name` are ignored, as 4.4.0's schema stripped them. Provenance is read through `{id}` reads and `list_docs`, whose
  `structuredContent` also holds the full text.
- **The new call `{id, section?}`** reads by section, and is the recommended one. Provenance is both in the text and in
  `structuredContent`. `maxChars` defaults to 20 000 (cap 100 000); past it, a `cursor` for the rest. The tool's
  description points to `search_docs` then reading by section, and says that reading by `name` returns a whole, large
  page.
- **Cursors** are opaque and encode the doc revision, the language, a hash of the query and filters, and the offset. A
  cursor whose revision or filters no longer match is refused with `stale_cursor`: run the request again.

**What is active when (the transition).**

| Period | `read_doc {name}` in the engine repository | `read_doc {name}` in a package | `read_doc {id}`, `search_docs`, `list_docs` |
|---|---|---|---|
| From A4 to C2 | Reads `docs/en/<name>.md`, unchanged | Reads `legacy/<NAME>.md` in the bundle, an **exact copy** of `docs/en/<NAME>.md` (this fixes the created project from 4.5 on) | In the repository: `wiki/` pages in state `draft` and `ready`, a `draft` page saying so in its provenance. In a package: `ready` pages only (the bundle never carries a draft) |
| From C2 on | Reads the generated concatenation (`wiki/legacy.json`) | Same, from the bundle | Unchanged: `draft` in the repository only, `ready` in a package |

The exact copy is removed at C2; the full compatibility tests become required at that moment. The demonstrators (§13)
only use `ready` pages written in A7: they do not wait for phase B.

**Tests.** The eight legacy calls are replayed with their exact 4.4.0 arguments, recorded as fixtures from the 4.4.0
schema: the schema accepts them, `content.length === 1`, its type is `text`, the text holds every old `##` heading (or
its rewrite declared in L2), and its size stays under a bound (≤ 1.5 × the 4.4.0 size, to catch a bloat). Another test
checks that the 4.4.0 JSON Schema of `read_doc` is **included** in the new one (same properties, same `enum`,
`required` not widened). A real stdio client (the MCP SDK `tools/mcp` uses) calls `read_doc({name: "CONTENT_GUIDE"})`
and receives one text block.

The MCP hash and `tests/api-surface.json` change. The change is additive **provided these compatibility tests pass**:
the minor version (4.5.0) depends on it.

**Known limit: the remote MCP.** A hosted Studio's `/mcp` does not offer `read_doc`, `search_docs` nor `list_docs`
(ADR 0029 §4: a tool whose ability a backend lacks is not offered; each remote tool is a request to the Studio's
`/api`, which has no documentation route). An agent working on a hosted Studio reads the documentation through the
local stdio MCP of the same engine version, or later through a `GET /api/docs` route.

**4.3.3 `search_docs` and `list_docs`.**

- Indexed: titles, `questions`, `aliases`, keywords, identifiers, section headings, **and section bodies**. Weights:
  title and question > alias and identifier > section heading > body.
- Input: `{query, lang?, audience?, context?, version?, type?, includeArchived?: false, limit?: 5 (max 20), cursor?}`.
- Each result: `id#section`, title, type, context, versions; `status` `current`, `deprecated` or `archived` (the last
  two only with `includeArchived`); a score; an **excerpt** around the matched terms with the **reason** of the match
  ("title", "question", "body"); a `cursor` for more.
- **An explicit empty result**: under a confidence threshold, `{results: [], note: "no confident match",
  suggestions: [index pages]}`, rather than weak results dressed as relevant.
- With `version`, pages and sections that do not apply to it are left out, or marked `notApplicable` with
  `includeArchived`.
- `list_docs {audience?, context?, type?, lang?, state?}`.

**4.3.4 Shipping the documentation in the package**, without committing generated files.

- `scripts/pack.mjs` runs `wiki -- bundle --out <prepared folder>/quest-n-click/docs-bundle` **after** copying the
  tracked files and **before** `npm pack`. The bundle is copied explicitly, not through `SHIP` nor git.
- The npm package carries `index.json`, `md/<lang>/<id>.md`, `legacy/<NAME>.md`, `assets/` and
  `bundle-manifest.json`. The release archive carries more (§4.5.4).
- **Reproducible:** no timestamp (the commit date is used), stable ordering. The candidate builds the bundle twice and
  compares the bytes.
- **Resolution at run time** (`backend.ts`): `<package root>/docs-bundle` if present; in the engine repository, the
  same loader reads `wiki/` directly and the provenance says "repository preview". The new tools never read
  `docs/en`.
- **Checked on the tarball actually produced:** `tar -tzf` lists `docs-bundle/`, and the sha256 match
  `bundle-manifest.json`. `scripts/external-consumer.mjs` is extended: install the archive in a temporary folder
  **outside the repository**, `create`, then a stdio MCP client calls `list_docs`, `search_docs`, `read_doc {name}` and
  `read_doc {id}`; the provenance must name the archive's version and build.

**4.3.5 Format versions.** `index.json` carries `format: "quest-n-click-docs-index", version: 1`;
`bundle-manifest.json` and `publication.json` carry their own format and version. A reader refuses an unknown major
version with a plain message.

**Optional:** a generated `llms.txt` (pages by audience, with URLs), on Pages and in the package.

### 4.4 L4 — Versions and proofs

**4.4.1 What a version field means.**

- `appliesFrom` and `appliesUntil` (on a page or a section): the product versions for which **what is described is
  true and the procedure works**. The only field used to filter by version.
- `featureSince` (optional, on a section or an identifier): the version the feature appeared in. Generated from the
  sources when they carry it (version notes of the DSL commands, for instance).
- A page's creation date is not metadata: git has it.
- *Amendment (A5):* a section's own versions are an HTML comment on the line right after its anchor,
  `<!-- applies: <from>..<until> since <v> [deprecated|archived] -->` (each part optional, the range inclusive, inside the page's, the same
  in both languages); `wiki -- build` shows it under the heading, `search_docs` filters sections by it.

**4.4.2 Five separate statuses**, never merged into one "experimental" banner, all generated from the same data for the
Stability, Support matrix and Discover pages and for the page headers:

| Information | Values | Single source |
|---|---|---|
| Contract status | experimental · stable · deprecated | `docs/dev/surfaces.json` extended, or a `docs/dev/contracts.json` derived from SUPPORT |
| Verified environments | browsers, systems, host, with a date | the support matrix, as data |
| Automated checks | test families and CI jobs covering the surface | `surfaces.json`, `ci:plan` |
| Human passes | done (with report), missing (with issue) | `docs/dev/passes/<v>.md` |
| Known limits | a list | the page's "Limits" section |

*Amendment (A5):* the registry is `docs/dev/contracts.json` (contract status quoted from SUPPORT.md and tested against
it, every row of the support matrix mapped to a surface and back, CI environments as of the support matrix's version
and date, gates, jobs and test files, the passes and their issues by version); the passes' states are read from `docs/dev/passes/<v>.md`, the limits are the page's `[!LIMIT]` ids; a page
names its surfaces in the manifest's `surfaces`.

**4.4.3 What each kind of claim is checked by.**

| Claim | Check | Mechanism |
|---|---|---|
| An option, route, field, variable or tool exists | Compared to the structured source | The identifier index (§4.1), `docs:truth` adapted |
| A DSL or JSON example is valid | Compiled and validated | Fenced blocks tagged `room-example` run through the validator, as `tests/classics.test.ts` does |
| A tutorial leads where it says | Run in a temporary project | A script derived from `scripts/fresh-install.mjs`, a CI job `tutorial` |
| A server configuration is accepted | Loaded by the real loader | Blocks tagged `studio-config` run through `studio-server`'s config loader |
| A behaviour is guaranteed | Linked to a named test | `[!GUARANTEE id=…]` with `test: "file › name"`; three states below |
| A performance was observed | Dated measure and its conditions | A `[!MEASURE id=…]` block: date, version, volume, conditions, source **at its SHA** |
| A host procedure works | A recorded exercise | "verified on / version / by"; it expires with the review cadence (§9) |
| An explanation is coherent | Human review | Second-context review, then the maintainer |

A guarantee has three states, shown as they are:

1. **referenced**: the test exists;
2. **executed**: the test **passed on the revision of the documented product**, read from the Vitest JSON report the
   candidate publishes as an artifact (a `json` reporter added to the jobs concerned); `check --publish` requires it;
3. **scope reviewed**: a person confirmed the test covers the claim; the record holds the hash of the claim's text and
   of the test file, and a change to either resets it.

A measure about Clever is always given with its context, for instance "restore observed in 30 to 60 s, 19 Oct 2026,
v4.2.3, 508 journal lines, PostgreSQL plan X, QUALIF-4.2.3 §4": an observation, never a promise.

*Amendment (A5):* a measure writes its context as `- date:`, `- version:`, `- volume:`, `- conditions:`, `- source:`
lines (the keys in English in both languages; date, version and source identical across them). A claim's test name
is its `describe` titles and its own joined with ` › `; claim ids are unique across the manifest. "Executed" is bound
to a commit by a `commit.json` (`{format: "quest-n-click-test-report", version: 1, commit, root, run}`) beside the
Vitest JSON report (its files matched by their exact path under `root`; only `passed` counts): the candidate's
`release-core` writes both to `.cache/test-report/` and uploads them as `candidate-test-report`. The local file
proves nothing about who made it: A5b's workflow downloads `candidate-test-report` from the attested candidate run
`--candidate` names. A test written `.skip`, `.todo`, `.only` or `.fails` (or `.skipIf`, `.runIf`) backs no claim; a
test file `test:coverage` does not run is said plainly. A review's claim hash covers the test name and the block's
text in both languages. A `room-example` is a room's JSON, or `{room, layout, items, characters, verbs, hero}`,
validated in a one-room schema-3 game.

**Links to the code:** `blob/<productCommit>/…` for the sources of the documented release, `blob/<sha of the
measure>/…` for any proof (QUALIF, measures, ADRs cited as proof).

### 4.5 L5 — The publication model and the switch-over

**4.5.1 Identity, promotion, display: three places.**

| Information | Where it lives |
|---|---|
| What the artifact is: `productVersion`, `productCommit`, `docRevision` (the `wiki/` SHA), `docRevisionNumber` (`r1`, `r2`…), `buildId` (the candidate run), format versions | Inside the bundle and the archive, **immutable** |
| That this artifact was promoted to a published release | `publication.json`, an external record deployed with the wiki and with Pages: version → approved doc revision → archive sha256 → date |
| What a reader is shown (`preview`, `candidate`, `published`) | The deployment's metadata (footer, page banner), read from `publication.json` |

The bundle never holds a publication state. Offline, it says "built for 4.5.0, candidate N; promotion is checked at
`<url>/publication.json`"; it does not claim to be published. The archive qualified by the candidate and the archive
published have the same hash; promotion rebuilds nothing.

**4.5.2 Which sources may be published.**

- **A release.** `release.yml` gains a job `docs-publish` that `needs` the release job and runs **only after
  `ship verify` passed**. It calls the reusable workflow `.github/workflows/docs-publish.yml` (`workflow_call`) with
  the tag, the SHA, the candidate run and the sha256 of the verified docs archive. Here `productCommit = docRevision =
  the tag's SHA`, and the generated references (DSL, API, scripts, routes, MCP tools, variables) come **from the code
  at that SHA**: no unreleased API of `main` can appear. The `release: published` event is not used: `release.yml`
  publishes with `GITHUB_TOKEN`, whose events start no workflow, and it runs `ship verify` after publishing.
- **A documentation fix between two releases** goes through a branch `docs/<version>` made from the tag. Its
  `docRevision` descends from the tag, and `git diff --name-only <tag> <docRevision>` must be included in
  `wiki/<lang>/*.md`, `wiki/manifest.json`, `wiki/translations.json`, `wiki/reviews.json` and `wiki/images/**`: no
  code, no generator. It is carried to `main` too (cherry-pick, checked by a simple drift test). It is published by
  `workflow_dispatch` of `docs-publish.yml` (`-f version=<v> -f ref=docs/<v>`), which produces a doc revision `r<n>`
  (§4.5.4).
- **A change on `main` never publishes** the wiki, Pages' `/docs/`, or a bundle.
- **A release candidate** (`*-rc.*`) never publishes the wiki nor `/docs/latest/`; it publishes `/docs/<v-rc>/` only.
- **A fix to an older version** updates `/docs/<older>/` only; it never moves the wiki or `latest` backwards.
- **Coordination.** The wiki and Pages share the concurrency group `docs-publish` (no cancelling) and the record
  `publication.json`. A run refuses to deploy a state older than the one published, comparing SemVer first, then the
  doc revision number, across versions as well as within one. `--rollback-to <tag>` is the explicit way back.
- **Test (A5).** The chain is replayed with the real mechanism: a test tag on a sandbox repository (or `act` if that
  is not possible), checking that `docs-publish` starts after `ship verify`, and only then.

**4.5.3 Bootstrap: one stated exception (D50).** The first documentation describes 4.5.0, which brings the doc tools.
Right after the switch-over pull request (C2) is merged, a `preview` publication is made by `workflow_dispatch` from
that `main` SHA, `productVersion = 4.5.0 (unreleased)`, with a banner on every page: "Preview of the 4.5.0
documentation — latest published release: 4.4.0, its documentation is at `blob/v4.4.0/docs/`". A candidate or an rc
changes nothing in the wiki (§4.5.2: an RC never publishes it); it only publishes `/docs/4.5.0-rc.N/` on Pages. After
`ship verify` of v4.5.0, `docs-publish` records the promotion in `publication.json` and republishes the wiki without
the banner. If the candidate fails, the preview stays as it is. This exception exists once:
`check --publish` refuses `preview` once a release ≥ 4.5.0 exists.

**4.5.4 Versions stay readable, and doc revisions are immutable.**

- Each release ≥ 4.5.0 attaches `quest-n-click-docs-<v>.tar.gz`, revision `r1`. It is in `candidate-manifest.json`,
  the sums, the attestations and `ship verify`: immutable like the rest.
- Each doc fix makes `quest-n-click-docs-<v>-r<n>.tar.gz`, published as an immutable GitHub release tagged
  `docs-v<v>-r<n>`: a pre-release, never "latest", built from `docs/<v>` with the source set of §4.5.2, with its
  sha256 and attestation. (A release is immutable, so a new revision cannot be added to the release it fixes.)
- **The permalink holds the revision:** `/docs/<v>/r<n>/<lang>/<id>.html`. `/docs/<v>/` and `/docs/latest/` are
  **aliases**, presented as such, to the latest approved revision in `publication.json`. A URL is never called
  immutable and updated at the same time.
- The wiki shows the **current version** only, and says so in each footer: "current documentation (4.x.y rN); earlier
  versions: …".
- The transition pages `docs/en/*.md` of a tag ≥ 4.5 point to `/docs/<that tag's version>/` (*amended in A5b:* the
  version's alias, so a later doc revision of that version is followed), never to the current wiki nor to `latest`. The release pull request regenerates them; a test checks their version equals `package.json`'s.
- A local bundle's provenance gives `url.versioned` (Pages, with the revision) and `url.current` (the wiki, labelled
  "current").
- Versions ≤ 4.4.0: `blob/v<v>/docs/en|fr/` stays valid; those tags hold the full files.

**The archive is self-contained:** `index.json`, `md/<lang>/`, `legacy/`, **`html/`** (the final rendered site with
its CSS and search index), **`assets/`** (every image it references), and `bundle-manifest.json` with each file's
sha256. Pages **copies** `html/` and never renders it again, so a change to `tools/wiki.ts` cannot alter an old
version. Test: in a clean environment, without a checkout, rebuild `/docs/` from the downloaded archives alone, and
check images, links and hashes.

**4.5.5 Pages follows the same policy.** The `pages` job keeps deploying the game and the Studio from `main`. **The
`/docs/` folder of its artifact is never built from `main`.** It is assembled from the archives of every release
≥ 4.5.0 and every `docs-v*` release, downloaded with `gh release download`, their sha256 checked against the manifest
of the candidate (or of the doc revision) that made them, their `html/` copied as is; then `/docs/latest/` and
`/docs/<v>/` as aliases from `publication.json`, and `/docs/preview/` during the bootstrap only. A plain redeploy of
Pages therefore keeps every doc revision.

Main destination: the **wiki** for current reading on GitHub (the maintainer's ask, linked from the README); **Pages
`/docs/<v>/r<n>/`** for permalinks, versions and search engines (`sitemap.xml` and `llms.txt` per version). GitHub
only exposes a wiki to outside search engines past 500 stars and with public edits disabled; Pages covers that, with a
client-side search over `index.json` using the same logic as `search_docs`.

**Required test:** CI builds the Pages artifact from a branch where a `wiki/` page is changed and an unreleased feature
added, and checks the `/docs/` tree is **byte-identical** to the one rebuilt from the published archives.

**4.5.6 Links by output** (one resolver, `id#section` → target):

| Output | Between pages | To the code |
|---|---|---|
| Local Markdown (bundle) | `../<lang>/<id>.md#<anchor>` | `blob/<productCommit>/…` |
| Wiki | `EN-…#<anchor>` | `blob/<productCommit>/…` |
| Pages HTML | `/docs/<v>/r<n>/<lang>/<id>.html#<anchor>` | `blob/<productCommit>/…` |
| Proofs (QUALIF, measures, ADRs cited) | — | always `blob/<sha of the measure>/…` |

The `<a name>` anchor is the same id in every output: the A1 spike showed the wiki keeps it (§4.5, the wiki's push). The acceptance clicks a section link for
real in the GitHub file view, in the wiki and in the HTML; a resolution table alone is not enough.

**4.5.7 The switch-over, with no broken link.**

1. Pages are written in `wiki/`; nothing is published publicly. `docs/` stays the consumers' source, frozen by L2.
2. C2, one pull request: repoint the **active** references; turn every `docs/en/X.md` and `docs/fr/X.md` into a
   **transition page** that keeps **all** the old anchors of the L2 inventory (the old headings stay, each linking to
   its destinations) and carries, beside the wiki link, **a fallback link that always works** to
   `blob/v4.4.0/docs/<lang>/<FILE>.md#<anchor>`; move the consumers to the bundle and index; update `surfaces.json`
   (the surface change is recorded; the passes concerned are `not-run` in 4.4.0, to confirm at that moment).
3. The `preview` publication follows the merge at once (§4.5.3). Between the merge and the preview, the wiki links of
   the transition pages lead nowhere for the length of the workflow: accepted and said. If the preview fails, the
   fallback links still reach the 4.4.0 documentation.
4. Transition pages stay until 5.0; a test checks each old anchor of the L2 inventory still exists in its page.

**Active and historical references.** Active, repointed: `src/`, `tools/`, `scripts/`, `cli/`, `studio-server/`,
`bridge/`, `connectors/`, `games/`, `tests/`, `.github/`, `.claude/skills/`, `AGENTS.md`, `CLAUDE.md`, the READMEs,
`CONTRIBUTING`, `docs/dev/surfaces.json`. Historical, preserved as written: `CHANGELOG.md`,
`docs/dev/{LOG,DECISIONS}.md`, `docs/dev/{adr,plans,passes,threat-models,baselines}/`, `PLAN-*`, `QUALIF-*`,
`SPIKE-*`, `GO-NO-GO-*`. Their links land on the transition pages. A versioned exception list, tested.

**Publishing safely.** A `docRevision` that does not descend from the last one published for its version is refused;
the push is atomic, so a failure keeps the last good version, and a rerun is a dispatch; pages missing from the
manifest are removed, except redirects; the GitHub rendering is checked after each publication, not only the Markdown
artifact.

**Images.** `git mv docs/img wiki/images`. Images no page references go to `wiki/images/archive/`, renamed `_v1`
(`AGENTS.md:53`), and are not published.

**Read-only wording.** "Generated from `wiki/`: an edit made here is overwritten at the next publication." The setting
"restrict editing to collaborators" is recommended; it is not a guarantee.

*Amendment (A5b), what was open and is now decided:*

- **The archive also carries `wiki/`**, the GitHub wiki's folder as `wiki -- build` writes it, so a publication pushes
  what the candidate built and a rollback pushes what was published, with no build at promotion. Its
  `bundle-manifest.json` adds `docRevisionNumber` (and `preview: true` for the preview); the loader accepts and skips
  the `html/` and `wiki/` paths. The archive is reproducible bit for bit on a fixed toolchain (`tools/field/tar.ts`,
  time 0, no owner, the gzip system byte fixed); the candidate's `pack` job builds it twice and compares.
- **HTML.** The project has no Markdown library; `tools/wiki/html.ts` renders the subset the pages use and escapes
  every other character, raw HTML included; a link that is not http(s), mailto or relative loses its target. Links
  between pages are relative (`<id>.html#<anchor>`, `../fr/<id>.html`), so once copied under `/docs/<v>/r<n>/` they
  are the permalinks of §4.5.6 and still work from a disk; `canonical`, `sitemap.xml` and `llms.txt` give the absolute
  permalinks. The client search is `search_docs` itself, bundled by esbuild into `html/search.js`, over
  `html/search-index.json`; the same script reads `publication.json` to show the display state (§4.5.1).
- **Names.** The candidate names the archive by `package.json` (`docs/quest-n-click-docs-<v>.tar.gz`), the release by
  its tag (`quest-n-click-docs-<v-rc>.tar.gz` for an rc, whose identity says `<v>`). A doc revision is the release
  `docs-v<v>-r<n>` (r2 on), carrying `quest-n-click-docs-<v>-r<n>.tar.gz` and `quest-n-click-docs-<v>-r<n>-SHA256SUMS`;
  the preview is the release `docs-v<v>-preview-<sha12>`. Both are pre-releases, never latest, made as drafts then
  published.
- **`publication.json` lives at the root of the wiki's repository** (pushed with the pages; Pages copies it to
  `/docs/publication.json`); format `quest-n-click-docs-publication` v1, `{latest, versions: {<v>: {approved,
  revisions: {r<n>: {sha256, tag, date, docRevision, buildId?}}}}, preview?}`. A page of the site matches itself on
  version, revision, doc revision and build (`tools/wiki/display.ts`): an rc's archive says `<v> r1` like the final's,
  and is never shown as the published one unless it is that very build. The ordering rule: SemVer then the revision number, across
  versions too; the same state again commits nothing; an older version's fix records `versions[<v>]` (Pages' alias
  moves) and leaves the wiki pages and `latest`; a revision older than the approved one, or one recorded with other
  bytes, is refused; `--rollback-to <v>[-r<n>]` is the way back. A pre-release is never recorded: its release is the
  record of `/docs/<v-rc>/`, whose alias points to its one revision, r1.
- **Pages authenticates what it serves.** `npm run wiki -- pages` downloads every release ≥ 4.5.0 and `docs-v*`, and
  checks each archive against its release's SHA256SUMS, the candidate manifest the release carries, its own manifest,
  its tag's identity, and its build provenance (`gh attestation verify --signer-workflow`: release.yml for a `v*`
  release; docs-publish.yml with `--source-ref refs/heads/docs/<v>` for a `docs-v*-r<n>`, `refs/heads/main` for the
  preview; docs-publish verifies with the same rule, `wiki -- attest`). A doc revision is served only when
  `publication.json` records it with the same sha256 and the same release tag, the preview only when it is the one
  recorded; an unrecorded or unattested one is refused, the release named. The record's `latest` must be in its
  `versions`. Then `html/` is copied as is; aliases are pages that say they are aliases and go to the target with the
  `#section`. **Recommended to the maintainer:** a tag ruleset on `docs-v*` (creation by the docs-publish workflow's
  token only, no update, no deletion); the attestation check stands either way.
- **Pages in CI.** ci.yml runs `pages` in `check` on main, before the Pages artifact, with the archives kept by
  `actions/cache` keyed on the release list (a cached release is checked like a downloaded one) and every `gh` call
  tried three times. If `/docs/` still cannot be assembled the job fails: Pages is not deployed without it nor with an
  unchecked one (fail closed); a rerun is the recovery. docs-publish ends by `gh workflow run ci.yml --ref main -f
  pages-only=true`: the plan (`tools/ci-plan.ts --pages-only`) opens no gate and `check`, `coverage` and
  `cross-runtime` skip everything but the Pages build, `/docs/` and the upload. A dispatched run cancels no running run
  and waits; but GitHub keeps one pending run per group whatever `cancel-in-progress` says, so a dispatch queued while a
  push's run on main is pending replaces it (that commit is then deployed by the dispatch without its own checks), and
  a later push replaces a pending dispatch.
- **Beside the game.** Pages' `/docs/` is inside the game's service worker scope: its navigation fallback skips
  `/docs/` (`navigateFallbackDenylist`), or a reader who played would get the game instead of a page.
- **Concurrency, truthfully.** `docs-publish` is the group of docs-publish's job (a called workflow honours it there);
  the running publication is never cancelled. GitHub keeps one *pending* run per group, whatever `cancel-in-progress`
  says: a publication queued behind a pending one replaces it, and the replaced one is cancelled. Two recoveries,
  written in the workflow: re-run the cancelled job, or dispatch `mode=promote target=<v>[-r<n>]`. Pages' deployment is
  not in this group (a deployment pending there could replace a publication); ci's own group orders deployments.
- **Modes and refs.** docs-publish writes in five modes, each from one ref, checked in the workflow and again by
  `wiki -- publish --mode --ref`: `release` (called from release.yml, on main), `revision` (from `docs/<v>` only),
  `rollback` and `promote` (from main, `target=<v>[-r<n>]`; promote only forwards or the same state again, rollback
  only backwards), `preview` (from main). A revision whose release went out but whose record did not is completed by
  re-running its job (`wiki -- next-revision` returns that revision; the rebuilt archive must have the released
  sha256, else the run is refused and says to promote it); a preview rerun on the same commit reuses its release the
  same way. Inputs reach the shell through `env` only.
- **Secrets and approval.** The job that writes runs in the environment `docs-publish`; **the maintainer creates and
  protects it** (required reviewers, a branch policy: main and `docs/*`), and may keep `WIKI_DEPLOY_KEY` there.
  release.yml passes `WIKI_DEPLOY_KEY` explicitly, never every secret.
- **The wiki's push** clones `<repo>.wiki.git`, keeps `.git` and any page that starts with the generated redirect
  marker, writes the archive's `wiki/` and the record, and pushes one commit, never forced (a wiki that moved since the
  clone refuses the push: nothing is published, a rerun decides again). Credentials: **the deploy key
  `WIKI_DEPLOY_KEY` over SSH is the expected default** (GitHub's host key pinned), as `GITHUB_TOKEN` is not expected to
  push to a wiki; without it, `GITHUB_TOKEN` as an HTTP header, never in a URL. **The A1 spike (23 Oct 2026, on the real
  wiki, test pages removed afterwards)** settled the wiki's side:
  - A repository deploy key with write access pushes to `<repo>.wiki.git` (the maintainer's test: `PUSH OK`).
    `WIKI_DEPLOY_KEY` is the credential; `GITHUB_TOKEN` was not tried and is not relied on.
  - The `docs-publish` environment exists: the maintainer is its required reviewer, self-review allowed, and its
    deployment branches are `main` and `docs/*`. `WIKI_DEPLOY_KEY` is an environment secret.
  - `en/_Sidebar.md` and `fr/_Sidebar.md` are honoured per folder: an EN page shows the EN sidebar, a FR page the FR
    one. Page URLs stay flat (`/wiki/<page>`), whatever the folder.
  - `<a name="walkable-zones">` renders as `name="user-content-walkable-zones"`, the same id in both languages, and a
    link to `#walkable-zones` scrolls to it (clicked by the maintainer on an EN and a FR page). The fallback to
    GitHub's heading slugs is not needed.
  - Images under `images/` are served from the wiki root (200, `image/png`) for pages in any folder.
  - An accented page name works (`FR-Spike-Été`); the manifest's ASCII URLs stay the rule.
  - The wiki's branch is `master`; the publisher pushes the branch it cloned.

  Still open: whether a tag ruleset lets the workflow create `docs-v*` tags (none exists yet), and the sandbox replay
  of the chain.

### 4.6 L6 — Acceptance by real questions, with counter-examples

`wiki/acceptance/questions.json`: about 60 questions in French and English, each with its expected `id#section` and
the **facts the answer must hold**. The maintainer's eight:

| Question | Expected |
|---|---|
| « Je veux que le garde patrouille. » (I want the guard to patrol.) | The existing mechanic, an example, its limits, how to check it |
| « Quelle différence entre flag et événement ? » (Flag or event?) | An explanation, how to choose, DSL references |
| « J'ai une erreur 423. » (I get a 423.) | Context, cause, diagnosis, recovery |
| « Mon jeu marche en local mais pas sous un sous-chemin. » (Works locally, not under a sub-path.) | Deployment procedure and its diagnosis |
| « Puis-je mettre à jour sans perdre mes sauvegardes ? » (Upgrade without losing saves?) | The guarantees for that version, and the procedure |
| « Cette commande se lance où ? » (Where do I run this command?) | The explicit context and prerequisites |
| « Le solveur trouve une fin : ai-je exclu tous les blocages ? » (The solver finds an ending: no softlocks left?) | The exact scope of the result |
| « J'ai un ancien lien vers CONTENT_GUIDE. » (An old CONTENT_GUIDE link.) | A destination that still works |

By audience: player (install offline on an iPhone, a save that will not load, no sound); author (an object visible but
unreachable, a French voice for one hero only, a missing translation, a custom minigame, a stale asset); admin (503
during a deploy, lost owner access, rotating `STUDIO_SESSION_KEY`, restoring to an empty database, Safari without a
cookie, changing domain); contributor (tests before a PR, a mutation survivor, a red coverage ratchet, a refused
`changes/` fragment); Bridge (an event received twice, a connector down).

**Counter-examples:**

| Counter-example | Required |
|---|---|
| A feature that does not exist ("real-time multiplayer", "Steam export") | The page "What quest'n'click does not do" (explanation, with its aliases), or an explicit empty result. Never a plausible neighbour first |
| Two similar commands in different contexts (`npm run studio` in the repository / in a created project; `backup` of the Bridge / of the Studio Server) | The `context` filter separates them; without it, both appear with their context in the excerpt |
| A procedure valid for an old version only (v2 → v3 ids) | With `version: 4.5.0`: `notApplicable` or `archived`, never `current` |
| An error code shared by several services (`409` hosted Studio and Bridge; `503` Clever redeploy and Bridge) | With a context, the right page first; without, both, each naming its service in the excerpt |

**Measures:** expected page in the **top 3**; **no inapplicable answer in first position** for counter-examples; rate
of justified empty results.

**Three levels:** (1) deterministic, in CI, over `search_docs`; it blocks the switch-over. (2) A fresh AI sub-agent
with only the MCP doc tools or the public URL, graded on the required facts (found, missing, misread). (3) A beginner
reader on 10 questions, opened as a `field-pass` issue. Levels 2 and 3 are reported, not blocking (D12). Results go in
`docs/dev/passes/<version>.md`.

*Amendment (A6):* `questions.json` is format `quest-n-click-docs-acceptance` v1. A destination is a manifest page,
or a page and a section that the written page or the coverage matrix proposes, never a generated index.
- **Matching.** A destination `id#section` is found at that section only; a bare page id at any of its sections. This
  holds everywhere: questions, counter-examples, each context's destinations, and the neighbours. A question counts
  as a hit when an expected destination is in the top 3.
- **Counter-examples.** A counter-example names its row and gives its exact behaviour:
  - `expectEmpty`: the explicit empty result is a right answer;
  - `expectNotFirst`;
  - `expectStatus`: with `includeArchived`, `notApplicable` or `archived`; without it, never shown at all;
  - `withContext`: each context puts its own destination first; a destination listed under two contexts is refused;
  - `withoutContext`: every neighbour appears in the top 5, and `names` gives the words its excerpt must contain.
- **Facts and gaps.** `facts` say what the product does. What the documentation lacks goes in `gaps`, which is not
  graded, and a fact saying "not documented" is refused.
- **Pending.** A question is pending while none of its destinations is written in that language. Once one is written,
  even a secondary one, a run that does not find what it expects is a miss. A counter-example is pending while any
  page it needs is unwritten.
- **Empty results.** A justified empty result is an absent feature's, or an old procedure that the version filter
  leaves out.
- **The command.** `wiki -- acceptance` exits 0 (reported); `--strict` (C1) also fails on pending runs, since every
  page is written by then. `wiki -- check` validates the file.
- **Level 2.** `docs/dev/acceptance/AI-PROTOCOL.md`. `--export-prompts` numbers the questions `q01`… in the order of
  their ids. The answering agent gets `prompts/` only; the grader alone reads the key, `grading/key.json`.
- **Level 3.** The pass `docs-beginner-reader`, asked from 4.5.0 (`docs/dev/acceptance/BEGINNER-READER.md`).
  - It is waited for by a new `documentation` surface in `docs/dev/contracts.json`. That surface has no SUPPORT.md
    quote and no matrix row yet: `support` and `matrixRows` are null, with the reason "SUPPORT.md gains its row at
    C2; docs/ is frozen by the coverage matrix", and the registry accepts null only with a reason.
  - It is bound to the engine package, `wiki/en/**`, `wiki/fr/**`, `wiki/manifest.json`, `wiki/images/**` and the
    protocol. The translation and review records and the questions are left out, so an ack does not void a carried
    pass.
  - Before C2 that binding matches no page or image, so a 4.5.0 candidate's Field Kit waits for C2.
  - C3 opens its issue and adds it to `passIssues`.
  - A Field Kit folder that names no release (no report, no package) is now asked the passes of the checkout's
    package version, not every pass.

### 4.7 Other contracts

**4.7.1 FR / EN parity, by meaning.**

- Links: compare **destination ids** (`id#section`), never URLs.
- Examples: compare their **structure** (keys, ids, command names, non-text values, order of steps). Translatable
  fields (`text`, `say`, `label`, `title`, display `name`, dialogue strings) and **comments** may differ. Shell
  commands must be identical, comments aside.
- Steps: each essential step carries an id (`<!-- step: install-deps -->`); the sets of ids must match.
- `[!LIMIT]`, `[!GUARANTEE]` and `[!MEASURE]` blocks pair by id; a measure's figures must be identical.
- Anchors: compare section ids, the same in both languages.
- **Translation state, with no "source" language:** `wiki/translations.json` records for each pair `id#section`
  `{enHash, frHash, reviewedAt, by}`: which revision of each language was reviewed against which revision of the
  other. If either hash changes, the pair is "to review": a warning on a PR, a block for `check --publish`.
  `wiki -- translations --ack` records the new pair after both sides were read.
  *Amendment (A5):* the text before a page's first section pairs as `<id>#_lead`; pairs are judged on `ready` pages;
  a section's hash covers the bytes of the `wiki/images/` files it shows.
- *Amendment (A7, who reviewed):* a record of `wiki/translations.json` and of `wiki/reviews.json` holds its reviewers,
  each `{name, kind: human|ai, relation: author|independent, date}`; `--ack` and `review-claim` require `--by`,
  `--kind` and `--relation`. The same text read again adds a reviewer, a changed text starts over. `check --publish`
  requires a review by a person (`kind: human`) for every translation pair and every claim's scope of a published
  page; before that the rendered state says "self-checked by the author (AI), not reviewed" (or "checked by an
  independent AI, not reviewed by a person"), never "reviewed". `ready` stays possible without it: it says the work is
  complete, not that it was reviewed. The guarantee's executed state is rendered from the candidate's test report:
  `wiki -- archive --test-report <file> --candidate <run>` reads it under `check --publish`'s rules, and the
  candidate's `docs-archive` job runs after `release-core` with `candidate-test-report`.
- *Amendment (D56, 2026-10-24, translation pairs):* `check --publish` no longer requires a person's review of every
  translation pair: a pair recorded by an AI only is a gap at both levels, its count said, and the page's header keeps
  saying who read it. A pair "to review" still blocks. A claim's scope still needs a person's review (A7 unchanged).
- The word count stays as a mere warning.
- The glossary is bilingual, with synonyms (lease / bail / verrou; span / pan; candidate / candidat…).

**4.7.2 Writing rules.** Each language is written in that language, not translated word for word. Short sentences.
Exact, copyable commands, **always preceded by the folder and the context** they run in (engine repository or created
project). A figure is dated. A guarantee states its limit and its proof. `docs/dev` is presented as "public development
documentation", never as "internal" in the sense of private.

**4.7.3 What does not move.** `docs/dev` stays in the repository, in English (D3); the wiki publishes an index of it
(ADRs with titles, decisions), not a copy. The READMEs stay the showcase (`readme-*` rules unchanged); their doc links
point to the wiki and their images to `wiki/images/readme/`.

**4.7.4 The environment variable register** (`wiki/data/env.json`). Its scope: `process.env.X` and
`process.env['X']`; dynamic reads (`process.env[name]`), flagged for a person to resolve; `import.meta.env.*` (Vite);
the `*_FILE` variants; variables read by shell scripts (`ops/`, `clevercloud/`); variables the platform or an add-on
injects (`POSTGRESQL_ADDON_URI`, `CC_*`, `INSTANCE_NUMBER`). Each entry declares its origin (code, build, platform,
add-on). A test requires every extracted name in the register, and an origin for any entry the code does not read.

## 5. Tooling: `tools/wiki.ts`, `npm run wiki`

| Command | Does |
|---|---|
| `build [--target wiki\|html\|bundle]` | The outputs (§4.5.6) |
| `check` / `check --publish` | The two levels (§4.1) |
| `check --network` | External links, a crawl of the published wiki, expired reviews (nightly) |
| `coverage --init` / `coverage` | The anchor inventory, then the two counters |
| `bundle --out` | The reproducible bundle (§4.3.4) and archive (§4.5.4) |
| `publish --version --ref [--rollback-to]` | Publication (§4.5) |
| `transition` | Versioned transition pages with fallback links |
| `translations --ack <id#section>` | Record that a pair was reviewed (§4.7.1) |
| `ack <id> --reason` | Acknowledge a drift warning without touching the page (§9) |
| `stats` | Counts by state, domain, type and language; translations to review |

Existing tests are **adapted, keeping their guarantees**: `docs-links` (anchors added), `docs-truth` (pairs from the
manifest), `tools/docs-truth.ts`, `scripts-documented`, `dsl-doc` and `api-doc` (the generators write into `wiki/`),
`classics`, `support-truth`, `api-surface` (it checks names are present; kept, and the identifier index added),
`ci-plan`, `changes`, `propagation`, the `bridge-*` tests and fixtures.

**CI filters.** `ci:plan`'s `docs` family runs on `wiki/**`, on the generators (`tools/wiki.ts`, `tools/dsl-doc.ts`,
`tools/api-doc.ts`, `scripts/pack.mjs`), **and on every path a `sources` glob of the manifest covers**, computed, so a
code change checks the pages that rest on it.

## 6. The catalogue (scope frozen)

The full catalogue is Annex A. Every page enters the manifest as `planned` in A2; `wiki -- stats` gives the real
count. No new wave of pages: the reviews asked for contracts, not breadth.

## 7. Corrections found in the inventory

- **To confirm:** `read_doc` in a created project (no doc packed today; fixed by §4.3.4); `npx quest-n-click doctor` in
  a created project (it imports `playwright`, which the package does not depend on); `git` in the Clever image (and
  whether `clever features enable system-git` is needed).
- **Content:** STUDIO-SERVER contradicts itself on `x-studio-base` (EN l.501–508 vs 602, FR l.535 vs 648): the code
  decides. The French Studio API table lacks `GET hero-matrix`. CODE_TOUR's sections run 6, 8, 7.
- **Governance:** the code of conduct sends reports to a `package.json` `author` that does not exist (an address is
  needed from the maintainer); the PR template's "Checked" list misses `knip`, `check`, `test:assets`, `verify:game`;
  `feature.yml` still says "4.1.x frozen scope"; `CHARTER.md`'s wording is dated (reported, not rewritten without the
  maintainer).
- **Created project:** no `dev:lan`, `start` nor Pages workflow; the wiki says how to add them, and a `[feature]` issue
  is opened.
- **Screenshots:** `npm run docs:screenshots` dates from 4.1.19; regenerate, and add hero choice, the heroes ×
  languages matrix, before/after captures, Remix, speedrun, Reality, the hosted Studio, in both languages.

## 8. Discoverability outside GitHub

See §4.5.5: GitHub indexes a wiki for outside search engines only past 500 stars with public edits off; the versioned
Pages site, its `sitemap.xml`, `llms.txt` and client-side search cover it, from the same archives.

## 9. Maintenance

- **Owners:** `owner` per domain in the manifest, and `CODEOWNERS` on paths that match the real layout
  (`wiki/*/clever.*.md`, `wiki/*/team.*.md`…); a test checks each `CODEOWNERS` pattern under `wiki/` matches a file.
  @wanoo by default.
- **"Edit this page"** leads to the real source file. **"Report a mistake"** opens a new issue template
  `docs-error.yml`, prefilled with the page id, version, language and context.
- **Drift warning:** a PR touching a page's `sources` without touching the page gets a notice naming the pages to
  review. `wiki -- ack <id> --reason "reviewed, nothing to change"` writes `wiki/reviews.json` with the hash of the
  sources reviewed, without touching the page. The candidate lists unacknowledged warnings, without blocking.
- **Precise sources:** `wiki -- check` warns when a glob covers more than 25 files, or one source file feeds more than
  10 pages: an ordinary change must not ask to reread dozens of pages.
- **Periodic review:** `reviewed` and a cadence per type (Clever procedures: 6 months; generated references: none). The
  nightly **updates one issue per page** (label `docs-review`, the id in the title), comments only when the state
  changes, and closes it when `reviewed` is renewed. It never opens a new one each night.
- **Obsolete pages:** `deprecated`, a banner, then the Archive section; not removed before the next major version; a
  redirect stays.
- **Local, deterministic checks** (`wiki -- check`) are kept apart from network checks (`--network`, nightly).

## 10. Work, in pull requests (target: 4.5.0)

Each pull request: a fresh worktree `~/Documents/Dev/.quest-n-click-wt/450-*` from `origin/main`; French and English
together; `quality && knip && wiki -- check` chained before `git push -u origin HEAD:<branch>`; `quality:baseline` when
tests are added; a second-context review; a `changes/` fragment.

**Phase A — foundations, nothing moves.**

| PR | Content |
|---|---|
| A1 | This plan, D50 (with the bootstrap exception of §4.5.3 and the D37 yes for v4.5.0), ADR 0030 "Documentation is generated from `wiki/`". **Spike** on the real wiki: the maintainer creates the `Home` page (that creates `.wiki.git`); then check a push with `GITHUB_TOKEN`, per-folder `_Sidebar`, `[[ ]]` and relative links, `<a name>` anchors in the wiki, images, GitHub's wiki search, on 3 test pages removed afterwards |
| A2 | L1: schema, states, `wiki/<lang>/<id>.md`, `<a name>` section anchors, the URL convention, required `questions`, the work check level (`check --publish` moves to A5), the whole catalogue as `planned`, generators (Home, sidebars, footer, headers, four indexes), `tests/wiki-manifest.test.ts`, `wiki -- stats` |
| A3 | L2: the full anchor inventory, the matrix, the two counters, `wiki/legacy.json`, the `docs/` freeze |
| A4 | L3: `read_doc` extended without replacing the active reader (fixtures of the 8 calls of 4.4.0, schema inclusion), `search_docs`, `list_docs`, cursors, the common loader, the reproducible bundle in `pack.mjs` with `legacy/` as an exact copy of `docs/en`, `external-consumer` extended, the demo snapshot, the Assistant; `api-surface`, the MCP hash, the quality baseline |
| A5 | L4 + L5: `appliesFrom` / `featureSince`, the status register, three-state guarantees (JSON reporter in the candidate), structured blocks, identity in the bundle and `publication.json` outside it, `check --publish`, the `docs/<v>` branch and `docs-v<v>-r<n>` releases, the self-contained archive in `candidate.yml`, `release.yml` and `ship verify`, `docs-publish.yml` called after `ship verify` and its sandbox test, Pages' `/docs/` assembled from archives and its byte-identity test, the shared `docs-publish` concurrency |
| A6 | L6: questions and counter-examples, the deterministic test (reported, not yet blocking), the AI and human protocols |
| A7 | **The three demonstrators (§13)**, across the whole chain |
| **Stop** | The maintainer replays the three demonstrators. Phase B starts on their go |

**Phase B — writing in `wiki/`** (`docs/` frozen and still the source; the PRs run in parallel and land through one
integration branch, as they only overlap on the manifest and the matrix): B1 Index, Start, Play, Install; B2 Create
and Publish; B3 Engine and formats; B4 local Studio; B5 Team and Clever (exercises on the Clever apps of the 4.2.1 spike (`docs/dev/SPIKE-4.2.1-CLEVER.md`), **with the
maintainer's agreement**); B6 Bridge and connectors; B7 Contribute and Reference; B8 screenshots and the §7
corrections. Each page goes `planned` → `draft` → `ready`; the "migrated and reviewed" counter climbs.

**Phase C — switch-over.** C1: L6 level 1 green on the artifact, L2 "migrated and reviewed" at 100 %. C2: the
switch-over PR (§4.5.7), at once followed by the `preview` publication (§4.5.3), a walk in Chrome and a crawl. C3: L6
levels 2 and 3 on the public preview.

**Phase D — release 4.5.0.** CHANGELOG, LOG; the candidate (reproducible bundle, docs archive, report of executed
claims); the signed tag (D37 yes given); `ship verify` (docs archive included); then `docs-publish` records the
promotion and publishes the wiki and `/docs/4.5.0/r1/`; then the published outputs are checked.

## 11. Checking end to end

1. **Every PR:** `quality && knip`, `check`, `docs:truth`, `wiki -- check`, then the targeted tests, one suite at a
   time.
2. **MCP compatibility:** the 8 fixtures of 4.4.0 pass; the 4.4.0 schema is included in the new one; a real stdio
   client gets one text block from `read_doc({name: "CONTENT_GUIDE"})`.
3. **Package:** on the tarball actually produced, the bundle is there, its sha256 match, two builds are identical; MCP
   reads from a project installed **outside the repository**.
4. **Versions:** Pages built from a branch with an unreleased change has a `/docs/` identical to the archives;
   `check --publish` refuses a `docRevision` touching code; the transition pages of a tag point to `/docs/<that
   tag>/r1/`; promotion leaves the archive's hash unchanged; an RC does not move `latest`; an older version's fix does not
   move the wiki.
5. **Coverage:** both counters at 100 %; every old anchor of the inventory lands on its transition page.
6. **L6:** top 3, no inapplicable first answer for counter-examples, justified empty results; levels 2 and 3 recorded.
7. **Published rendering:** Home, each domain in both languages, the language switch, sidebars, images; a web edit is
   overwritten; an old anchored link resolves; a section link clicked in each of the three outputs; the footer carries
   the identity and the displayed state.
8. **Clever:** each procedure carries "verified on" or "not verified".

## 12. What the maintainer is needed for

- Create the wiki's `Home` page (A1); "restrict editing to collaborators" is recommended.
- Replay the three demonstrators at the A7 stop.
- Give the address for reports under the code of conduct.
- Agree to checks and exercises on the Clever apps of the 4.2.1 spike (`docs/dev/SPIKE-4.2.1-CLEVER.md`).
- The D37 yes for v4.5.0: **given** on 23 Oct 2026 (« tu peux signer la 4.5 »).

## 13. The three demonstrators (A7)

Each goes through the whole chain: FR/EN source → `check` → `check --publish` → bundle in the tarball → MCP from an
installed project → wiki artifact → trial HTML `/docs/<v>/r<n>/`. Nothing is published publicly yet.

**D1 — A Clever procedure with proof and recovery: `clever.restore-drill`, "Restore the Studio on a fresh
installation".** Procedure template (ten headings), context `studio-hosted` on Clever, `appliesFrom: 4.2.2`.
`[!MEASURE id=restore-time]`: 30 to 60 s, with date, version, volume (508 lines), PostgreSQL plan, and a link to
`QUALIF-4.2.3-REFERENCE.md` at the measure's SHA. `[!GUARANTEE id=restore-empty-db-only]` linked to the
`studio-server` test that refuses a restore into a non-empty database, **executed** (JSON report of a trial candidate)
and its **scope reviewed**. `[!LIMIT]`: no going back after migrations; the RPO defined and tied to the measure. A
`studio-config` block loaded by the real loader. Step ids identical in FR and EN. "Verified on" filled if the
maintainer allows an exercise on the spike; otherwise "not verified", and the demonstrator must show it.

**D2 — A generated reference, packed and read through MCP: `reference.environment-variables`.** Generated from the code
at the product's SHA over the scope of §4.7.4, with a FR/EN description written for each variable; a test fails on a
variable without one. Demonstration: build the archive; install it outside the repository; `search_docs {query:
"STUDIO_SESSION_KEY"}` returns the section, with its excerpt and the reason "identifier"; `read_doc {id:
"reference.environment-variables", section: "studio-session-key", lang: "fr"}` returns the text and its provenance
(`productVersion`, `productCommit`, `docRevision`, `buildId`, `url.versioned`); `read_doc {name: "TOOLS"}` (the legacy
call) still holds the old headings.

**D3 — Troubleshooting found in FR and EN, with a neighbour to tell apart: `team.write-refused-423`, "Write refused:
span locked (423)".** The neighbour is `team.write-refused-409`, "stale base revision (409)"; the counter-example is the
Bridge's `409`. Each page has its FR and EN `questions` (« Pourquoi mon enregistrement est refusé avec 423 ? », "Why is
my save refused with 423?"), symptoms, cause (a lease another member holds, 120 s TTL), diagnosis, recovery (wait, ask,
takeover by an owner, the exclusive lease) and how to check. Acceptance: `search_docs "423"` puts
`team.write-refused-423` first in both languages; `search_docs "409" {context: "studio-hosted"}` puts the Studio's 409
page first; `search_docs "409"` without context shows the Studio's and the Bridge's, each naming its service in the
excerpt; `search_docs "conflit de verrou"` finds the 423 through the glossary (verrou → bail → lease); a fresh sub-agent
answers "I get a 423 in the Studio" with the right recovery, without mixing it up with the 409.

**The stop's acceptance, beyond the three:** the legacy reading works throughout the migration; the archive installed
outside the repository with its resources; the candidate promoted without a changed byte; the publication actually
started after `ship verify` (sandbox); after a doc revision `r2` and a plain Pages redeploy, `r2` is still online; an
old version still readable after a newer one is published.

If a demonstrator fails, the contract (L1 to L6) is fixed before phase B. The scope is not widened.

## 14. The maintainer's answers and reviews (23 Oct)

- Source: « Dossier wiki/ + sync » (the `wiki/` folder, synced): the source in the repository, a generated wiki.
- Role: « Tout dans le wiki » (everything in the wiki): `docs/en|fr` migrate.
- Hosting the team Studio: « Clever Cloud seul, détaillé » (Clever Cloud only, in detail).
- First review: the bar quoted in §1; findability, access for AIs, proof scope, versions, maintenance, acceptance by
  real questions.
- Second review: `read_doc` compatibility, packaging, publication versus release, preparatory checks too strict, Pages,
  semantic parity, search contract, proof states, practical maintenance; three demonstrators before scaling.
- Third review (revision 3.1): « La rev3 est suffisamment aboutie pour commencer les fondations » (rev 3 is mature
  enough to start the foundations); no `release: published` trigger; identity in the bundle, promotion outside it;
  immutable doc revisions; the active reader unchanged until C2; native HTML anchors; a self-contained archive; the
  precisions of §4.2, §4.3.2, §4.3.5, §4.7.4 and §4.5.7.
- « tu peux signer la 4.5 » (you may sign 4.5): the D37 yes for v4.5.0.

## Annex A — The page catalogue

Types: T tutorial, P how-to (procedure), R reference, E explanation, D troubleshooting. The manifest fixes the URLs
(§4.1) and gives the real count. For each important subject, T, P, R and E are present, or their absence is stated.
"(gen.)" marks a generated page.

**Index** — Home (bilingual: entry points, search examples) · Index by task · Index by symptom · Index of identifiers ·
Bilingual glossary (vocabulary and synonyms) · FAQ by audience · **What quest'n'click does not do** (E, with aliases;
required by the counter-examples).

**Start** — What quest'n'click is, with the web-scumm history (E) · Features (R) · Gallery · Play online and the demo
Studio (P) · Stability and support (R, gen., §4.4.2) · Roadmap (E, brought past 4.4).

**Play** — Controls on phone and desktop, verbs, double tap, verb keys (R) · Install as an app: PWA per browser,
offline, Safari limits (P) · Saves: slots, export and import, what is kept (P + E) · Settings · **Accessibility**:
keyboard, focus, screen reader (state of the passes), text, contrast, alternatives to sound and colour (R + E) ·
Languages · Speedrun for players: LiveSplit, OBS (P) · Privacy (R) · Player troubleshooting: no sound, a save that
will not load, offline incomplete, an update not showing (D).

**Install** — Requirements: Node ≥ 22.12, 22.13 for the Bridge on SQLite, Python 3 and `requirements.txt`, ffmpeg
(optional), Playwright Chromium; Windows, macOS, Linux notes (R) · Install from the release archive (P) · Install
from npm, once published (P) · Install from the repository to work on the engine (P) · `doctor` (R + D) · Image
toolchain (P) · Audio toolchain: ffmpeg, fluidsynth, Furnace, `uv` (P) · Upgrade (P) · Upgrade notes: one page per
line 4.4 / 4.3 / 4.2 / 4.1 / v3 / v2→v3, from UPGRADING's 42 sections (R) · From web-scumm (P) · Package reference (R)
· Install troubleshooting, including `doctor` in a created project (D).

**Create a game** (CONTENT_GUIDE split by question, no arbitrary groupings) — Your first game (T) · Layout of a
created project **and** of the engine repository, with the scripts each has (R) · The working loop (P) · Content
principles and the identity contract (E) · Rooms (T + R) · **Geometry**: placement, walk zones, masks, layers, camera
(R + E) · "Something is visible but unreachable" (D) · Reactions (R) · Game commands (R, links to the DSL) ·
Conditions (R) · **Flags, variables and events: which to use** (E) · Custom code (E + P) · Characters (R) · Items and
inventory (R) · World map (R) · Dialogues (T + R) · Scripts and events (R) · Moving characters: patrols, walks (P) ·
Exits (R) · Chapters and objectives (R + E) · **State and saves**: persistent or temporary, renaming an id, migrations,
offline updates (E + P) · Staging: wide rooms, animations (R) · The stage: lights, particles, floors (R) · Skin and
fonts (R) · Title and credits (P) · Heroes: several characters, hero choice (T + R + E) · Built-in minigames (R) · A
custom minigame (P) · Translations (P + R) · Music in stems (P + R) · Sound effects (R) · **Voices**: per language, per
hero, fallback paths, browser autoplay rules, offline (P + R + E) · **Images**: prompts, cutting sheets, transparency,
scale, cache, missing or stale asset (P + R + D) · Asset provenance (P + R) · **The storyboard**: source of truth,
divergence with the Studio and the files (E + P) · Puzzle design (E) · Classic mechanics (R, run by a test) · Review
pages (R) · DSL reference (R, gen.) · Checking your game (P) · **What the solver proves**: a winning path, an
exhaustive proof, a proof with abstractions, what each lets you conclude (E) · Solver options (R) · Playtests (P) ·
Remix (T + R) · Speedrun for authors (P) · The sealed ending (P) · Production template (R) · Example games: `_template`,
`demo`, `heroes`, `reference`, `signals` (R) · Working with an AI: MCP, sub-agents, `search_docs` (P).

**Publish a game** (in Create) — Build and release: `build`, `release [--commercial]`, budgets, provenance (P) · GitHub
Pages, with the workflow YAML for a created project (P) · The static game on Clever Cloud (P) · Other static hosts (P)
· **Sub-path, cache and service worker, an incomplete deploy, going back to an earlier version** (E + D) · Testing on a
phone over the LAN (P).

**Engine** (advanced authors and contributors) — **Execution model**: order in which reactions are evaluated, rule
priority, effects of commands, time, randomness and seed, determinism (E + R) · How the engine works (E, from ENGINE)
· Public API (R, gen.) · **File formats**: save, `.wsrun` session, `storyboard.json`, `groupings.json`, `notes.json`,
build and Reality manifests; for each, schema, minimal example, constraints, compatibility, behaviour on an unknown
field (R).

**Local Studio** — Overview and launch, `studio:lan` (T + P) · Edit a room (P) · Placement and stage (P) · Preview,
apply, undo (E) · Storyboard (P) · Assets and cutting (P) · Check: validator, solver, critical path, heat, health,
coverage (P + R) · Before/after captures, 4.4 (P) · Semantic diff (P) · Play and replay a session (P) · Rule explainer
(R) · Language and objectives (P) · Voices and the heroes × languages matrix (P) · Map (P) · Notes (P) · Remix in the
Studio (P) · Music (P) · The Assistant, bring your own key, per provider (P + R) · Demo mode and `studio-apply` (P) ·
Local and LAN security (E + R) · Studio API (R, gen. from `routes.ts` where possible) · Local MCP, set up per client:
Claude Code, Claude Desktop, Cursor, Codex, Gemini (P) · MCP tools (R, gen. from `tools.ts`) · Studio troubleshooting
(D).

**Team Studio, use** — What runs where (E, a diagram) · **Concepts**: revision, transaction, span, lease, exclusive
lease, preview, build (E) · Starting as an invited dev (T) · Working together day to day (P) · **The full role ×
action matrix**, owner / dev / reviewer, read from `gate.ts` and the routes (R) · Invitations (P) · **Managing
members**: list, demote, remove, the audit log, with the routes read from the code (P + R) · **Recovering after a
conflict (409), a locked span (423), a lost lease, a disconnection, a stale preview** (D) · Comments (P) · Map and
semantic diff (P) · Publishing builds (P) · Remote MCP (P + R) · The game in Git (P + R) · Upgrading the engine of a
hosted game (P) · Hosted assets (P + R) · The server's CLI: every subcommand, `export` included (undocumented
today), options, exit codes, JSON output (R) · Health and metrics routes (R) · Trying it locally: `compose.yml`, the
mode without OIDC (T) · Known limits (R).

**Clever Cloud** (each procedure on the ten-heading template, with "verified on / version / conditions"; anything not
verified says so) — Overview: architecture, dated cost estimate, prerequisites (E) · 1 Apps and add-ons, PostgreSQL
sizing during the redeploy overlap (P) · 2 Domains and TLS: two subdomains of one domain, never `*.cleverapps.io` (P,
**to verify**) · 3 Keycloak: realm, clients, `offline_access` (P) · 3 bis Generic OIDC and GitLab, with their limits
(P + R) · 4 Configuration: variables (names only), `STUDIO_CONFIG_JSON` field by field, `*_FILE` variants; warning:
`clever env` prints multi-line values, filter it (P + R) · 5 First deployment: worker then studio, `import`, first
owner, `/readyz` (T) · 6 Backups: what a backup **holds and does not hold**, cron, `--to-bucket --keep`, retention
(P + R) · 7 **RPO and RTO defined**, tied to dated measures (E) · 8 **Restore drill on a fresh installation** (P) · 9
Redeploys: overlapping instances, no SIGTERM, the measured write-refusal window (E + P) · 10 Upgrading the server and
**checking state after a migration** (P) · 11 **Limits of going back**: down migrations, the journal (E + P) · 12
Monitoring: metrics, suggested alerts, logs (P + R) · 13 Security: four HTTP policies, revocation R = 15 min, CHIPS,
the worker without secrets, `trustProxy` (E + R) · 14 **Rotating keys** (`STUDIO_SESSION_KEY`, `STUDIO_WORKER_KEY`, the
OIDC secret, `STUDIO_GIT_KEY`, the metrics token) and the effect on sessions (P) · 15 **Recovering admin access**: the
last owner, the Keycloak admin (P) · 16 **Changing domain or OIDC provider** (P) · 17 **Worker, PostgreSQL or Cellar
down**: symptoms, effect, recovery (D) · 18 **Exporting the game and leaving the installation** (P) · 19 **Retention**:
data, backups, journals, previews (R + P) · 20 Clever troubleshooting: 503, connections exhausted, missing cookie, slow
preview, clock skew, silent cron (D) · 21 Costs and teardown (P).

**Reality Bridge and connectors** — What it is, its architecture (E) · Quick start (T) · **Guarantees**: duplicates,
order, replay, unavailability, tenant isolation, effect on the game's progress and proof, read from the current code
(E + R) · Install and run the Bridge (P) · Bridge backup and restore, ADRs 0021 and 0023 (P) · Multi-tenant (P) ·
Signals and the manifest (R) · The Bridge's CLI (R) · Connectors overview (E) · One page per connector: email, Telnet,
SSH, Open Badges (P + R) · The connector SDK (R) · Security: Biscuit, signatures (E) · Bridge and connector
troubleshooting (D).

**Contribute** — Welcome (E) · Developer setup: `git clone`, `nvm use`, `npm ci`, `pip install -r requirements.txt`,
`npx playwright install chromium`, `npm run doctor`, `GAME=` (T) · Dev loop (P) · Before a PR, one unified list (P) ·
Conventions: branches, PR and issue titles, `changes/` fragments, formatting commits and `.git-blame-ignore-revs`,
`games/` never reformatted, docs languages (R) · Writing documentation: manifest, templates, proofs, translation (P +
R) · Architecture (E) · Code tour (T) · Import boundaries (R) · Which tests run when (R) · Mutation testing (P + E) ·
The coverage ratchet (P) · The quality baseline (P) · CI explained, with the known flakes (R + D) · Field passes (P) ·
Benchmarks (R) · Releasing (P) · npm packages (R) · Decisions and ADRs, index with titles (R) · Governance (E) · Bot
PRs (P) · Contributing with AI agents (P) · Security policy, FR and EN (R) · Code of conduct, FR and EN (R) · Licences
and credits (R).

**Reference** — npm scripts, of the repository **and** of a created project (R, gen.) · CLIs: `quest-n-click`,
`create`, `-bridge`, `-connector`, `-studio-server`, `-studio-worker`, with options, exit codes, JSON output (R) · **The
environment variable register** (R, gen. + test, §4.7.4) · Dev URL parameters (R) · Error codes and messages (R, gen.)
· Support matrix (R, gen.) · Changelog (a link to `CHANGELOG.md`, no copy).

## Annex B — Page templates (`wiki/_templates/`)

Every page opens with the generated header (type, audience, context, `appliesFrom`, statuses of §4.4.2, the language
switch) and closes with "Edit this page" and "Report a mistake".

**How-to (procedure), ten headings:**

1. What you get
2. Context and versions (engine repository, created project, local or hosted Studio…; `appliesFrom`)
3. Prerequisites
4. Where to run the commands (the folder, the machine)
5. Steps (each essential step with `<!-- step: <id> -->`)
6. Expected result, and how to check it
7. Common errors
8. Files or data changed
9. Recovery or going back, when it applies
10. References

**Reference:** name; form; values; default; constraints; minimal example; behaviour on an unknown field; since which
version (`featureSince`); related identifiers.

**Troubleshooting:** symptom (the exact message or code, the observed behaviour); possible causes; diagnosis; fix;
how to check it is fixed; neighbouring cases and how to tell them apart.

**Explanation:** the why; the alternatives set aside; the trade-offs; links to the ADRs and decisions.

**Tutorial:** what you will build; what you need; steps with a visible result at each; what you learned; where to go
next.

**Structured blocks**, paired by id between the languages:

```markdown
> [!LIMIT id=local-only]
> Available on the local Studio only, not on a hosted Studio.

> [!GUARANTEE id=restore-empty-db-only]
> A restore goes into an empty database only; any other is refused.
> (manifest: test "studio-server/…test.ts › refuses a non-empty database"; states: referenced / executed / scope reviewed)

> [!MEASURE id=restore-time]
> 30 to 60 s — 2026-10-19, v4.2.3, 508 journal lines, PostgreSQL plan X —
> source: QUALIF-4.2.3-REFERENCE.md §4 at <sha>.
```

The build renders these blocks for each output; their state (for a guarantee) comes from the manifest and the
candidate's reports, never from the page text.
