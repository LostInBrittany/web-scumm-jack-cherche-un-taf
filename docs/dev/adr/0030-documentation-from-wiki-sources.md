# 0030 · The documentation is generated from one source in the repository, and published per release (4.5.0)

**Context.** Up to 4.4.0 the documentation lived in 31 pages of `docs/en/` (plus a production template), each with a twin in `docs/fr/`.
- Tests kept them honest: links, the same sections in both languages, quoted scripts and paths, the release line.
- Several programs read them:
  - the MCP tool `read_doc` reads `docs/en/<name>.md` (`tools/studio/backend.ts`);
  - the demo Studio embeds the content guide (`tools/studio/snapshot.ts`);
  - pass surfaces name four of the pages (`docs/dev/surfaces.json`).
- The engine's package carried none of them: `scripts/pack.mjs` ships the files git tracks under its `SHIP` roots, and `docs/` is not one of them. In a created project, `read_doc` had nothing to read.

The project needed more than reference pages. It needed paths through the documentation (install, a first game, the Studio, a Studio for a team on Clever Cloud, contributing), a guide for players, troubleshooting and an index. All of it in French and in English, which the maintainer wants as a GitHub wiki.

The maintainer's bar (23 October 2026): « un humain ou une IA trouve une réponse exacte, applicable à sa version et
reliée à ses sources ». In English: a person or an AI finds an exact answer, one that applies to their version and is linked to its sources.

**Decision** (D50, plan `docs/dev/PLAN-4.5-WIKI.md`).

1. **One source, in the repository.**
   - Each page is a file under a `wiki/<lang>/` folder, named by a stable id (`wiki/<lang>/<id>.md`).
   - A manifest gives each page its type, audience, context, versions, sources and the old destinations it replaces.
   - Pages are reviewed in pull requests and checked by the tests, as the old docs were.
2. **Generated outputs, never edited by hand.** The source produces:
   - the GitHub wiki, current version only;
   - a site per version on GitHub Pages;
   - a documentation archive attached to each release;
   - a bundle inside the engine's package;
   - the index that MCP and the Studio's Assistant search.

   An edit made in the wiki itself is overwritten by the next publication.
3. **Published documentation names one published product.**
   - Every output carries the product's version and commit and the documentation's revision.
   - The bundle and the archive carry only their identity. Whether a build was promoted to a release is recorded outside them, in a publication record, so promoting a candidate changes no byte.
   - Publication starts from the release workflow, after `ship verify` has read the release back. It does not start from GitHub's `release: published` event: the release is published with `GITHUB_TOKEN`, and events that token makes start no workflow.
   - Nothing on `main` publishes.
   - A correction to a version's documentation is a new, immutable documentation revision (`r2`, `r3`…) of that version. `/docs/<version>/` and `/docs/latest/` are aliases; the permalink names the revision.
4. **Old destinations keep working.**
   - Each `docs/en/` and `docs/fr/` page becomes a transition page. It keeps every old heading and anchor, links each one to its new pages, and also links to the complete page at `v4.4.0`.
   - The MCP call `read_doc({name})` keeps its schema and its single text block. Until the switch, it serves the historical text: in the repository, that is the `docs/en/` page; in the package, an exact copy of it.
5. **A check states what it proves.**
   - A guarantee linked to a test is shown as referenced, executed on the documented revision, or scope reviewed. These are three different claims.
   - Keyword detection of limits is a help to the reviewer, never a proof.
   - Measurements carry their date, version, volume, conditions and the commit of their source.
6. **Bootstrap, once.** The first documentation describes 4.5.0. After the switch merges, and before 4.5.0 ships, it is published as a preview. Each page's banner says so and points to the 4.4.0 documentation. `check --publish` refuses a preview once a release ≥ 4.5.0 exists.

**Consequences.**

- `docs/dev/` stays where it is: the development documentation, public, in English (D3). The wiki indexes it but does not copy it.
- **Cost.** Writing a page now costs its manifest entry (a small required set; questions in both languages for procedures and troubleshooting) and, for a guarantee, a named test. The trade is a documentation that can be searched by task, symptom, identifier and vocabulary, and that says which version it applies to.
- **A new MCP surface.** `search_docs`, `list_docs` and `read_doc` by id, section and language are added beside `read_doc({name})`, which keeps its schema. 4.5.0 is therefore a minor release, provided the compatibility tests of the eight historical calls pass.
- **Wiki limits.** The GitHub wiki shows only the current version, and search engines do not index a wiki under 500 stars. The versioned Pages site carries the permalinks and the indexing.
- **Scaling only after proof.** The work proceeds through three end-to-end demonstrators before the bulk of the pages is written: a Clever Cloud restore drill, a generated reference read through MCP from an installed package, and a troubleshooting page found in both languages.

**What would change it.** GitHub wikis gaining versions or pull-request review would make the Pages mirror and the generated publication worth revisiting. Losing the wiki altogether would leave the Pages site as the only reading surface; the source and its checks would not change.
