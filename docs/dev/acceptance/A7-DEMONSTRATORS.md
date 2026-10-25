# A7: the three demonstrators, run through the chain

> **Status**: run locally on 23 October 2026 by claude-a7 (an AI, the pages' author), from the commit
> `35e88c1233c3f2e1dcabeabe87c8da446cdcadc8` of `feature/450-a7-demonstrators`: A5b, A6 and A5a's last commit merged,
> the five pages, and the second-context review's fixes. Nothing was published and no GitHub resource was touched.
> **Plan**: `docs/dev/PLAN-4.5-WIKI.md` §13. Outputs are trimmed; the full logs were in `/tmp/a7chain/`, and the whole
> run is one script, `docs/dev/acceptance/a7-chain.sh` (§8).
>
> **Nothing here was reviewed by a person yet.** The translation pairs and the claim's scope are recorded as
> self-checked by their author (an AI), and `check --publish` refuses them until a person reviews them (§2).

## 1. What was written

| Page | State | FR / EN | What it holds |
|---|---|---|---|
| `clever.restore-drill` (D1) | ready | « Exercice de restauration sur une installation vierge » / "Restore the Studio on a fresh installation" | the ten headings; six step ids, identical in both languages; a `studio-config` block the real `loadConfig` accepts; `[!MEASURE id=restore-time]`; `[!GUARANTEE id=restore-empty-db-only]` and its claim; three `[!LIMIT]`s (`same-engine-version`, `rpo`, `no-going-back-after-migrations`); "not verified on a live installation" said plainly |
| `reference.environment-variables` (D2) | ready | « Variables d'environnement » / "Environment variables" | generated from `wiki/data/env.json` and the code: 142 variables in 9 groups, the two dynamic reads of `takeSecrets` resolved, one section per variable, `identifiers` the 142 names |
| `team.write-refused-423` (D3) | ready | titles naming the hosted Studio (A6's finding) | the causes, read from the code: a lease another member holds (120 s, renewed every 30 s while their Studio stays open); the exclusive lease a job takes (Prepare and the cutting for a dev, an engine upgrade or a Git import for an owner, given back when the job ends); a script's fences (`x-studio-fences`, which the Studio and the MCP never send). Then the diagnosis and four fix steps |
| `team.write-refused-409` (D3's neighbour) | ready | idem | a stale base revision (`x-studio-base`), the dialog's three answers, the Bridge's 409 told apart |
| `bridge.troubleshooting` (D3's counter-example) | ready | « Dépannage du Bridge et des connecteurs » | `conflict-409`, `unavailable-503`, `same-event-twice`, `connector-down`, from the code |

Choices worth a second look:

- **The measure.** QUALIF-4.2.3 §4 holds two samples, and the page gives both, one run each:
  - 28.7 s in phase A: a backup at revision 1, 508 rows, nothing to replay, the engine at `52e68932`;
  - 59.7 s in phase B: a backup at revision 63, 593 rows, 2 operations replayed, the engine at `c66fbf56`.

  The report does not say where the difference comes from, and neither does the page. Its `version` is 4.2.2 (both
  commits were on main before the 4.2.3 tag, and `package.json` said 4.2.2). The source is pinned to
  `edb8d39a03a3ad6ba9aa8f33e1ab5473d3d7a34e`, the commit that wrote phase B's figures.
- **The guarantee says what the test proves.** The test is `tests/studio-backup.test.ts › the Studio Server's backup ›
  refuses a backup altered, a project not empty, a blob missing, another schema`. It refuses a restore into a project
  that holds rows, on SQLite. The plain text after the block cites `backup.ts` for what comes from the code rather than
  the test: the check runs in the restore's transaction, before the first row is written.
- **The restore drill, corrected by the review.**
  - `restore` migrates the target to the engine it runs on before comparing schemas. So the page asks for the backup's
    engine version, and warns that a newer engine leaves the drill database migrated and the restore refused.
  - A failed `restoreInto` writes nothing: it is one transaction, and it leaves an empty, migrated database, where
    `replay` would answer "no restore is under way". Only a failed replay leaves the "restoring" mark.
  - The one JSON line is printed by `npm run -s`.
- **The Bridge's 409.** The code answers 409 for a pairing code confirmed twice, a speedrun run sent twice (refused as
  it would join the queue; the first one is ranked only once found valid), and a moderation of a run that is not valid.
  The page's diagnosis is the Bridge's log lines (`pairing.confirmed`, `run.submitted`, `run.verified`). The Bridge has
  no operator route that reads a pairing, and the page says never to call `GET /v1/pairings/<code>`: it is the
  player's one-time claim, and calling it would hand out and use up the player's capability.
- **Coverage.** No row is marked `migrated`: each of the eight rows these pages take from is split with pages still
  planned. Twelve limit candidates carried into a `[!LIMIT]`, the guarantee or an error table are ticked `reported`.
- **Reviews.** Every record now says who reviewed it (`{name, kind: human|ai, relation: author|independent, date}`).
  The translation pairs and the claim's scope are claude-a7's own checks, recorded as `kind: ai, relation: author`. The
  pages render this as "self-checked by the author (AI), not reviewed" until a person reviews them.
- **`CONTENT_GUIDE`'s alias**, suggested by A6, waits for the page that replaces CONTENT_GUIDE, in phase B.

## 2. D1 and the claim: `check`, then `check --publish`

```text
$ npm run wiki -- check
·  clever.restore-drill: the claim restore-empty-db-only's scope is self-checked by the author (AI), not reviewed: …
·  translations: 183 pair(s) of ready pages are self-checked by the author (AI), not reviewed, not read by a person (…)
·  claim restore-empty-db-only (clever.restore-drill): referenced · scope self-checked by the author (AI), not reviewed
⚠  contribute.writing-docs: the source "tools/wiki/*.ts" covers 26 files (> 25)
✔  wiki (work level): 213 pages consistent, 1 warning(s)                                     (exit 0)

$ npx vitest run tests/studio-backup.test.ts --reporter=default --reporter=json --outputFile.json=…/report/vitest.json
      Tests  10 passed (10)
# beside it, commit.json: {"format":"quest-n-click-test-report","version":1,"commit":"35e88c12…","root":"<the worktree>","run":…}

$ npm run wiki -- check --publish --product-ref HEAD --state candidate --candidate local-a7 --test-report …/vitest.json
✖  --test-report …/commit.json: run: Invalid string: must match pattern /^\d+$/               (a run id is a GitHub run's: digits)

$ … --candidate 0 (commit.json "run":"0")
·  claim restore-empty-db-only (clever.restore-drill): referenced · executed on 35e88c1233c3 · scope self-checked by the author (AI), not reviewed
✖  clever.restore-drill: the claim restore-empty-db-only's scope is self-checked by the author (AI), not reviewed: a person reads it, then npm run wiki -- review-claim restore-empty-db-only --by <name> --kind human --relation independent
✖  translations: 183 pair(s) of ready pages are self-checked by the author (AI), not reviewed, not read by a person (…)
✖  wiki (publication level): 2 error(s)                                                      (exit 1)

$ … without --test-report          → also "the claim restore-empty-db-only is not executed: no test report given"
$ … --state published               → also "reference.environment-variables: applies from 4.5.0, after the released product 4.4.0"
```

The test does pass on this commit, so the claim becomes "executed". The publication is still refused, and that is the
intended outcome: no person has reviewed the pages yet.

**A local report proves nothing about provenance** (§4.4.3). This `vitest.json` and its `commit.json` were written here,
and anyone could write the same two files. "Executed" means only that a report naming this commit says the test passed.
The real binding is made in the candidate and in `docs-publish`, which download `candidate-test-report` from the attested
candidate run.

## 3. D2: the register, the bundle, the package, MCP from a project outside the repository

```text
$ npm run wiki -- env
✔  142 variable(s), 2 dynamic read(s) resolved: en/…, fr/reference.environment-variables.md; manifest identifiers unchanged
$ npm run wiki -- bundle --out …/bundle        (twice, diff -r)
✔  documentation bundle of 4.4.0 (doc revision 35e88c1233c3): 19 file(s), 10 page file(s), 546051 bytes
two bundles: identical bytes
$ node scripts/pack.mjs --out=…/pack --build-id local-a7
packed into …/pack: quest-n-click 4.4.0 (590 files and its docs-bundle/), …                  (exit 0)
$ tar -tzf quest-n-click-4.4.0.tgz | grep docs-bundle   → 20 entries
{"productVersion": "4.4.0", "productCommit": "35e88c12…", "docRevision": "35e88c12…", "buildId": "local-a7", …}
19 files in bundle-manifest.json, sha256 mismatches: []
```

The register's check fails on any of these, each case covered by `tests/wiki-env.test.ts` (16 tests):
- a variable the code reads and the register does not describe;
- a described `code`, `build` or `ci` variable that nothing reads any more;
- a computed read that nobody resolved.

What the scan reads:
- `process.env.X`, `['X']` and destructuring (a rest is a dynamic read);
- `import.meta.env`, and an `env.X` object (never `delete env.X`, never an assignment);
- Python, and the shell of `ops/` and `clevercloud/`;
- the workflows: `env:` keys, `${{ env.X }}`, `$GITHUB_ENV` lines and their shell, all as origin `ci`.

Then, in `…/consumer`, outside the repository: `create.mjs keeper "The Keeper" --engine=file:…/quest-n-click-4.4.0.tgz`,
`npm install` (417 packages), and a stdio client of the MCP SDK against the installed `quest-n-click mcp`:

```text
search_docs {query:"STUDIO_SESSION_KEY"}
  1. reference.environment-variables#studio-session-key  identifier  "`STUDIO_SESSION_KEY` The keys that seal the members' session cookies: one key, or several …"
search_docs {query:"studio_session_key"}   1. reference.environment-variables#studio-session-key  identifier
search_docs {query:"PATH"}                 1. reference.environment-variables#path  identifier  (not #worker-python-path)
search_docs {query:"How do I rotate STUDIO_SESSION_KEY?"}   1. reference.environment-variables#studio-session-key  identifier
search_docs {query:"How do I restore the Studio on an empty database?"}
  1. clever.restore-drill  question   2. reference.environment-variables#studio-database-url  section (its heading, not an identifier)

read_doc {id:"reference.environment-variables", section:"studio-session-key", lang:"fr"}
  > quest'n'click documentation · reference.environment-variables#studio-session-key (fr, ready) · quest'n'click 4.4.0
    (commit 35e88c1233c3, doc revision 35e88c1233c3, build local-a7) · bundle built for …; whether it was promoted …
  ### `STUDIO_SESSION_KEY`
  Les clés qui scellent les cookies de session des membres : …
  structuredContent.provenance: {source: bundle, productVersion: 4.4.0, productCommit: 35e88c12…, docRevision: 35e88c12…, buildId: local-a7}
  structuredContent.url: {versioned: null,
                          versionedNote: "a local build (build id \"local-a7\", not a candidate run): it has no published permalink",
                          current: https://github.com/Quest-n-Click/quest-n-click/wiki/FR-Reference-Variables-D-Environnement#studio-session-key,
                          currentLabel: "current documentation (the latest release), not necessarily this version"}

read_doc {name:"TOOLS"} (the legacy call)
  1 block · text · 59 907 characters · no structuredContent · 8 "##" headings
  sha256 1a33644080f929fc28633fdef09a250e3eee90e967c62facab596e1afec6d117 = sha256 of docs/en/TOOLS.md in the repository
list_docs → 5 pages, all ready
```

`url.versioned` is `null` here because this is a local build. A release build (a candidate's numeric build id, not
dirty) gets the Pages permalink, `…/docs/<version>/r<n>/<lang>/<id>.html#<section>`. That URL is worded as the
permalink the build has once it is the one published, and it points to `publication.json` to check whether it was.
`tests/wiki-access.test.ts` covers the three cases: a release build, a local build, and a dirty build.

The chain found three failures in D2. Each is fixed in this branch, and each has a test that fails without the fix:
- `STUDIO` matched the word "studio" as a whole identifier.
- The provenance had no online URLs.
- The excerpts showed only the identifier, doubled the page's own bold, and could have touched the stars of code.

## 4. D3: the 423, its 409 neighbour, the Bridge's 409, from the same installed package

```text
search_docs "423" en   1. team.write-refused-423  title  "Write refused on the hosted Studio: span locked (**423**)"
search_docs "423" fr   1. team.write-refused-423  title  "Écriture refusée sur le Studio hébergé : pan verrouillé (**423**)"
search_docs "409" {context:"studio-hosted"}   1. team.write-refused-409  title
search_docs "409" (no context)   1. team.write-refused-409  title     "… hosted Studio: stale base revision (**409**)"
                                 2. bridge.troubleshooting#conflict-409  question  "The Bridge answers **409**"
search_docs "conflit de verrou"  1. team.write-refused-423#fix  alias  "**conflit** de **verrou**"
```

Each level 1 item of §13 D3 holds: "423" puts the 423 page first in both languages; "409" with the hosted Studio's
context puts its page first; without a context both services appear, each excerpt naming its own; « conflit de
verrou » finds the 423 page. Level 2 (a fresh agent answering "I get a 423 in the Studio") **was not run**: it belongs
to the AI protocol, on the public preview, in C3.

## 5. The wiki artifact, the archive, the wiki's push, Pages

```text
$ npm run wiki -- build --target wiki --out …/wiki-build   ✔  23 file(s) written
$ npm run wiki -- archive --out …/quest-n-click-docs-4.5.0.tar.gz --product-version 4.5.0 --build-id 0 --candidate 0 --test-report …/vitest.json
✔  quest-n-click-docs-4.5.0.tar.gz: 65 files, 354364 bytes, sha256 181be780… (4.5.0 r1, doc revision 35e88c1233c3)
   also 4.5.0 r2 (17bf5f34…), 4.6.0 r1 (e08dd3d1…), 4.5.0 r3 (8e3c8501…), without a report
4.5.0 r1 archive built twice (with the report): identical bytes
✖  wrong-name.tar.gz: the archive of 4.5.0 r1 is named quest-n-click-docs-4.5.0.tar.gz
```

**The rendered guarantee**, read from the archive extracted outside the repository:

```text
en guarantee: referenced · executed on 35e88c1233c3 · scope self-checked by the author (AI), not reviewed
fr guarantee: référencée · exécutée sur 35e88c1233c3 · portée vérifiée par son auteur (IA), pas relue
```

This used to be the "executed" gap; the review decided to fix it now, and it is fixed:
- `wiki -- archive` takes `--test-report` and `--candidate` and reads them under `check --publish`'s rules. A report of
  another run is refused, and a test that did not pass executes nothing (`tests/wiki-archive.test.ts`).
- `candidate.yml` builds the archive in a new job, `docs-archive`. It runs after `release-core`, downloads
  `candidate-test-report` before archiving, builds twice and compares. The candidate gate waits for it, and
  `tools/release/artifacts.mjs` names the job.
- `docs-publish` gives a doc revision's archive the product's report too.
- `tests/release-docs-publish.test.ts` and `tests/release-artifacts.test.ts` check all of this.
- The report is an input, not a timestamp: the same inputs give the same bytes.

**The archive outside the repository.** It lists 65 files, every sha256 matches, and nothing on disk is unlisted:
- `html/` (24 files)
- `wiki/` (22)
- `md/` (10)
- `legacy/` (8)
- `index.json`

There is no `assets/`, because none of the five pages shows an image, so the archive's image path was not exercised.

**The wiki's push and the promotion, on a local bare repository** seeded with a `Home.md`, with no token and no key in
the environment:

```text
release 4.5.0 r1 --sha256 181be780…        ✔  4.5.0 r1 is the latest: pushed                     (2 commits)
promote 4.5.0 r1 (the same state)          ✔  4.5.0 r1 is already the latest: nothing changed    (2 commits, same HEAD)
                                           publication.json byte-identical after the second decision
revision 4.5.0 r2                          ✔  4.5.0 r2 is the latest: pushed
release 4.6.0 r1                           ✔  4.6.0 r1 is the latest: pushed
revision 4.5.0 r3 (after 4.6.0)            ✔  4.5.0 r3 recorded for /docs/4.5.0/; the wiki and latest stay on 4.6.0 r1
                                           files changed by it: publication.json
r2 with --sha256 0000…                     ✖  sha256 17bf5f34…, not the verified 0000…           (nothing pushed)
4.5.0 r1 again                             ✖  4.5.0 r1 is older than its approved revision r3: refused
4.6.0 from refs/heads/feature/x            ✖  a release publishes from refs/heads/main, not from refs/heads/feature/x
the wiki repository's pages = the 4.6.0 r1 archive's wiki/, byte for byte (publication.json aside)
```

**Pages, from a fixture release set**, with `--skip-attestations`. That flag is **allowed only for this local trial**:
the command prints "never deploy this folder", and without `--repo` or that flag it refuses to run. The fixture set:
- `v4.5.0`, `v4.6.0`: each archive with its SHA256SUMS and its candidate manifest;
- `docs-v4.5.0-r2`, `docs-v4.5.0-r3`: each archive with its SHA256SUMS;
- `publication.json` as the pushes above left it: latest 4.6.0 r1, and 4.5.0 approved at r3.

```text
✔  /docs/: 156 files                         two builds: identical trees
/docs/4.5.0/r2/ = the r2 archive's html/, byte for byte
/docs/4.5.0/r1/ = the r1 archive's html/, byte for byte, after 4.6.0 was published
GET /4.5.0/r2/en/clever.restore-drill.html 200 · /4.5.0/r1/fr/team.write-refused-423.html 200
GET /4.6.0/r1/fr/reference.environment-variables.html 200 · /4.5.0/en/clever.restore-drill.html 200 (alias to r3)
GET /latest/en/team.write-refused-409.html 200 (alias to 4.6.0/r1) · /publication.json 200 · /4.6.0/r1/search-index.json 200
```

## 6. Acceptance (`npm run wiki -- acceptance`)

```text
questions        106 runs: 10 in the top 3, 0 missed, 96 pending · top 3: 100 % of those evaluated
counter-examples 14 runs: 2 with no inapplicable answer first, 0 failed, 12 pending · 100 %
empty results    0 among the runs evaluated, 0 justified · n/a
```

What was evaluated:
- **Hits:** `error-423`, `rotate-session-key`, `restore-empty-db`, `event-twice` and `connector-down`, each in English
  and in French.
- **Passes:** `error-409-shared`, in English and in French.
- **Still pending:** `error-503-shared`, because the Clever pages it expects are not written yet.

For phase B: **69 of the 108 pending runs already return a result** instead of the explicit empty one. Five pages are
enough to pass the confidence threshold on loose words. The empty-result rate will mean something only once the
expected pages exist.

## 7. The stop's list, item by item

| Item (§13) | State |
|---|---|
| D1 through the chain | **done locally; not executed in a candidate**. "Verified on" is not filled: the page says it was not replayed on a live installation. Its claim is "executed" only through the local report (§2) |
| D2 through the chain | done locally (§3), after the fixes above |
| D3 through the chain | done locally at level 1 (§4); level 2 not run |
| The legacy reading works during the migration | done: `read_doc {name:"TOOLS"}` from the package returns one block, the bytes of `docs/en/TOOLS.md`; in the repository, `read_doc {name}` reads `docs/en/<NAME>.md` (`tests/wiki-access.test.ts`) |
| The archive installed outside the repository with its resources | done (§5); no image in these pages |
| The candidate promoted without a changed byte | done locally, on a bare repository (§5) |
| The publication actually started after `ship verify` (sandbox) | **waiting for the maintainer** |
| After a doc revision r2 and a plain Pages redeploy, r2 still online | done locally (§5) |
| An old version still readable after a newer one is published | done locally (§5) |
| A person's review of the pages | **waiting for the maintainer** (§2) |

**Waiting for the maintainer.** Each of these needs GitHub, Clever Cloud or a person; this run touched none of them.

1. **Reviews.** Read the five pages in both languages. Then record a review with `npm run wiki -- translations --ack
   <key> --by <you> --kind human --relation independent` for each pair, and `npm run wiki -- review-claim
   restore-empty-db-only --by <you> --kind human --relation independent`. `check --publish` refuses the pages until
   then.
2. **The real wiki push.** Run `docs-publish` in `preview` mode, or a test page as the A1 spike planned. Check that
   `WIKI_DEPLOY_KEY` (or `GITHUB_TOKEN`) can push to `Quest-n-Click/quest-n-click.wiki.git`, that `en/` and `fr/` and the
   anchors survive, and that the section links click through.
3. **`docs-publish` after `ship verify`, in a sandbox.** Use a test tag, or `act`. Check that the job starts only after
   `ship verify`, downloads `candidate-test-report`, and that the new `docs-archive` job renders "executed on <sha>"
   from the candidate's own report.
4. **The `docs-publish` environment.** Create and protect it, with `WIKI_DEPLOY_KEY`, and add the `docs-v*` tag ruleset.
5. **Pages from real releases.** Run `npm run wiki -- pages --repo Quest-n-Click/quest-n-click` with attestations, once a
   release ≥ 4.5.0 (or a preview) exists.
6. **A live restore drill** on the Clever apps of the 4.2.1 spike, if you agree to one. It is the only way D1 can say
   "verified on".

## 8. Replaying it

```sh
# in the engine repository, on this branch, committed (the publication level reads HEAD)
bash docs/dev/acceptance/a7-chain.sh /tmp/a7chain
```

The script runs with `set -euo pipefail`. It records a failing step's exit code in that step's log and carries on.

It resolves the output folder and refuses it when it is any of these:
- `/` or your home folder;
- the repository or a folder inside it;
- a non-empty folder without the `.a7-chain` marker the script leaves in the folders it makes.

It names the tarball from `package.json`. It writes into the output folder:
- one log per step, `01-check.txt` to `14-acceptance.txt`;
- the bundle and the pack;
- a created project, `consumer/keeper`, with its MCP client;
- the archives, a bare `wikirepo/wiki.git`, the fixture `releases/` and two Pages trees.

It needs no network beyond the created project's `npm install`, and no credential: `GITHUB_TOKEN`, `GH_TOKEN` and
`WIKI_DEPLOY_KEY` are unset for the pushes. Port 8765 must be free. The run above is that script, once.
