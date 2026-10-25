# CI explained

What GitHub Actions runs on the engine repository, why a job ran or said "not needed by the plan", and what to do when
one is red. The workflows are in [`.github/workflows/`](../../.github/workflows/ci.yml); the plan that decides what a
pull request runs is [`tools/ci-plan.ts`](../../tools/ci-plan.ts). Which test suite runs in which job is
[Which tests run when](contribute.which-tests.md).

<a name="workflows"></a>

## The workflows

| Workflow | Starts on | Does | Gates |
|---|---|---|---|
| `ci` | a pull request; a push to `main`; a `v*` tag; by hand | the three tiers below | the pull request (`pr-gate`); a release (the tag's run) |
| `candidate` | by hand on `main` for a SHA (`gh workflow run candidate --ref main -f sha=<full sha>`); a pull request labelled `full-ci` (information only) | every heavy family on one exact SHA, then `candidate-gate`, which writes and attests `candidate-manifest.json` | a tag must name one green run of it ([Releasing](contribute.releasing.md)) |
| `release` | the completion of `ci` on a `v*` tag | the mutation sets, `release-check:ci`, the release made from the candidate's files, `ship verify`; then `docs-publish` (4.5.0) | publication |
| `nightly` | every day at 03:17 UTC; by hand | npm names, the heavy suite, the connectors' fuzz (a minute each), the abstraction corpus (500 seeds, four shards), every mutation set from scratch, the Bridge's loads on SQLite and Postgres, the proof matrix, cross-runtime with 500 Remix seeds, the worker in a container | nothing directly; a red night is a bug to fix before the next release |
| `prove` | every Monday at 04:00 UTC; by hand (`game`, `rooms`) | `prove:game`, the committed playtests (`--strict`), and the bench on a 100-room generated game (uploaded as `bench`) | never a gate |
| `mutation` | by hand: `gh workflow run mutation --ref main -f set=<set> -f ref=<branch or SHA> [-f file=<path>]` | one mutation set, measured on a runner, its report kept as an artifact | nothing |
| `qualify` | a pull request or a push to `main` touching `ops/`, `scripts/ops-qualify*`, `scripts/pack.mjs`, `bridge/`, `package.json` or the lockfile; by hand | `npm run ops:qualify`: the Bridge's qualification profile on Docker | the profile does not rot between candidates |
| `docs-publish` | called by `release` after `ship verify`; by hand (`revision`, `rollback`, `promote`, `preview`) | the wiki and the publication record (4.5.0) | publication of the documentation |

<a name="tiers"></a>
<!-- applies: .. since 4.1.9 -->

## The three tiers of `ci`

**The fast tier, on every change.** `plan` reads the diff; `check` and `coverage` run beside it:

- `check`: on a pull request, `changes -- --check` (the fragment, [Conventions](contribute.conventions.md#changes-fragments))
  and `field:carry -- --check-range` (no carried pass changes its trust root); then `quality` (format, lint, knip,
  both TypeScript configurations, content lint), `docs:truth`, ffmpeg, `build:game` (the sample game's gates, the
  bundle, `verify:dist`, the spoiler check, the asset audit), `weight -- --release`, `quality:baseline -- --check
  --dist`, `prove:game`, `audit:deps` when `package.json` or the lockfile moved, then the two-entry build (game and
  Studio demo) that the e2e rows play, kept as the `dist` artifact.
- `coverage`: the unit suite once, under V8 coverage (`test:coverage`), then the coverage ratchet: a warning on a pull
  request, a failure on `main` and on a tag ([The coverage ratchet](contribute.coverage-ratchet.md)).

**The second tier, what the change can break.** Each job needs `plan` (most also `check`) and reads its gate in the
plan: it runs its real work, or one step that says "not needed by the plan" and succeeds.

| Job | Gate | Runs |
|---|---|---|
| `node-24` | `node24` | the unit suite on Node 24 |
| `windows` | `windows` | the doctor, the type checks, the unit suite without the files that assume POSIX, `build:game`, the production server answering |
| `e2e` (six rows) | `e2e` | the production build played by touch: Chromium full, WebKit generic, Chromium and WebKit at the keyboard, Chromium in French, Chromium with the Canvas painter; with weight, music, visual, perf, Studio, accessibility and PWA steps on some rows |
| `pwa-firefox` | `pwaFirefox` | the PWA scenario in Firefox (install, update, interrupted update, reinstall, offline) |
| `reference` (Chromium, WebKit), `reference-fr`, `heroes` | `reference` | the reference chapter built, proved, played at the keyboard, against its visual references, at 30 fps or more with the CPU slowed 4×; `reference-fr` plays it in French and with the generic verbs; `heroes` builds, proves and plays the `heroes` example |
| `second-game` | `secondGame` | a game made by `npm run new-game`, through every gate the sample passes |
| `fresh-install` | `freshInstall` | the engine packed, a game created outside the repository, installed, built and played |
| `external-consumer` (Ubuntu, macOS, Windows) | `freshInstall` | the archives installed outside the repository on three systems |
| `upgrade` | `upgrade` | a game of the previous release moved to this engine, its old save played to the end |
| `reality-xcheck`, `connectors`, `bridge-postgres`, `reality` (Chromium, WebKit) | `reality` | Biscuit's samples in JavaScript and Rust, the connectors against a real Bridge with their fuzz, the Bridge on Postgres 16, the signals game end to end |
| `studio-hosted` | `studioHosted` | the Studio Server on Postgres and S3 (SeaweedFS) with a real Keycloak, then the hosted Studio in Chromium and Firefox |
| `cross-runtime` | none (every change) | the same canonical text, speedrun proofs and Remix worlds in Node, Chromium, WebKit and Firefox |

**The third tier, off the pull request path**: the mutation sets on a pull request labelled `full-ci`, the nightly,
the candidate and the release.

**`pr-gate`** reads every job's result: each must be `success`; the mutation jobs may be `skipped` where they do not
run. It is the one check that sums a pull request up.

No job deploys GitHub Pages any more (4.5.2, see [the site](#pages-only)).

<a name="the-plan"></a>
<!-- applies: .. since 4.1.9 -->

## The plan (`npm run ci:plan`)

```sh
# in the engine repository, on your branch
npm run ci:plan                    # against origin/main
npm run ci:plan -- --base=<ref>
npm run ci:plan -- --files=src/engine/dom/room.ts,games/demo/rooms/garden.ts
```

It prints, on stderr, one line per changed file with the rule that matched and the gates it opened, then the plan;
on stdout, one line of JSON (`{"auditDeps":…,"node24":…,…,"all":…,"docs":…,"docsPages":[…]}`), which
the `plan` job writes to its output. The first rule that matches a path wins, and a change runs the union of what its
files ask:

| A change to | Opens |
|---|---|
| `.github/workflows/ci.yml`, `tools/ci-plan.ts`, `package.json`, the lockfile, a shared configuration (`tsconfig*.json`, `vite.config.ts`, `vitest*.ts`, `biome.json`, `knip.json`, `requirements.txt`, `.nvmrc`, `.gitattributes`), the app shell, `tools/vite/` | everything |
| `docs/`, `changes/`, `wiki/`, any `.md`, `LICENSE*`, `.claude/`, `.cursor/`, `clevercloud/`, another `.github/` file | the fast tier only |
| the Reality runtime | `reality`, `e2e`, `node24`, `windows` |
| the painters, the music director | `e2e`, `reference`, `node24`, `windows` |
| the PWA and the storage (`boot.ts`, `dom/update`, `offline`, `save-store`, `storage`) | `e2e`, `pwaFirefox`, `upgrade`, `node24`, `windows` |
| any other file of `src/engine/` (the core) | everything |
| `src/studio/` | `e2e`, `studioHosted`, `node24`, `windows` |
| `bridge/` | `reality`, `freshInstall`, `node24`, `windows` (and `studioHosted` for its SQL layer) |
| `games/demo/` | `e2e`, `reference`, `node24`, `windows` |
| `games/reference/`, `games/heroes/` | `reference`, `node24` |
| `games/_template/`, `cli/`, `scripts/{pack,fresh-install,external-consumer,new-game}.mjs` | `secondGame`, `freshInstall`, `upgrade`, `node24`, `windows` |
| `studio-server/` | the authoring gates and `studioHosted` |
| other `tools/` and `scripts/` | the authoring gates (`node24`, `windows`, `secondGame`, `freshInstall`, `upgrade`, `reference`) |
| `tests/` | `node24`, `windows` |
| a path no rule knows | everything |

A git error runs everything too: the plan never decides that it does not need to be checked. **`docs`** is true when
the change touches the documentation, its generators, or a file a wiki page rests on (a `sources` glob of
`wiki/manifest.json`); `docsPages` names those pages, to reread. It opens no job: the fast tier runs the doc tests on
every change.

<a name="full-ci"></a>

## Everything on a pull request: the `full-ci` label

On `main`, on a tag and on a pull request labelled **`full-ci`**, the plan is `--all`: every gate opens. The label also
starts the mutation jobs of `ci`. Add the label, then push (it applies to `ci`'s next run). Adding the label also
starts a `candidate` run for information, once, on the pull request's head at that moment; a later push starts none:
remove the label and add it again to run it on the new head.

<a name="pages-only"></a>
<!-- applies: 4.5.2.. since 4.5.2 -->

## The site, outside `ci`

Since 4.5.2 the engine's `ci` deploys no GitHub Pages (D52). The project's website, `https://quest-n-click.cleverapps.io` (the repository
`Quest-n-Click/quest-n-click-site`), serves the demo at `/demo/` from the latest release's
`quest-n-click-v<version>-web.tar.gz` (built by the candidate under `BASE_PATH=/demo/`, summed and attested by the
release) and the latest documentation at `/docs/<page id>` (`/fr/docs/<page id>` in French); there is no versioned documentation online, a
version's documentation is its release's `quest-n-click-docs-<version>.tar.gz`. The website picks a release up by
itself (its `POST /api/revalidate`, hourly otherwise). The `pages` job and the `pages-only` runs that `docs-publish`
started (4.5.0 to 4.5.1) are gone.

> [!LIMIT id=pages-fail-closed]
> `npm run wiki -- pages`, which assembled the versioned `/docs/` for GitHub Pages up to 4.5.1, still takes the
> released archives only and fails when one cannot be downloaded or verified; no site deploys its output since 4.5.2.

<a name="job-failed"></a>

## A job failed on my pull request

<!-- step: read-plan -->
1. **Read the plan's summary** in the `plan` job (or run `npm run ci:plan` locally): it says why each job ran.

<!-- step: reproduce -->
2. **Reproduce locally**, in the engine repository, with the job's own command:

   | Red job | Run locally |
   |---|---|
   | `check` | the failing step: `npm run quality`, `npm run docs:truth`, `npm run build:game`, `npm run quality:baseline -- --check --dist` (after `npm run build:web`), `npm run prove:game`, `npm run changes -- --check` |
   | `coverage` | `npm run test:coverage` (a test, or a floor of `vite.config.ts` not met) |
   | `node-24` | `npm run test:node` under Node 24 |
   | `e2e`, `reference`, `second-game` | `npm run build:game`, `npm run preview -- --port 5173 &`, then the row's `npm run e2e -- http://127.0.0.1:5173/ --game demo --prod …` (`E2E_BROWSER=webkit` for a WebKit row) |
   | `fresh-install`, `external-consumer`, `upgrade` | `npm run fresh-install`, `npm run external-consumer`, `npm run upgrade-check -- --from=previous` |
   | `mutation (<set>)` | `npm run test:mutation:core -- --set=<set>` ([Mutation testing](contribute.mutation-testing.md)) |

   A failed e2e row uploads its screenshots as an artifact: read them first.

<!-- step: check-flake -->
3. **Check the known flakes below** before rerunning. A rerun of a red job that is not a known flake hides a bug.

<!-- step: fix -->
4. **Fix, push, read `pr-gate` again.**

<a name="known-flakes"></a>

## Known flakes and their handling

| Symptom | Where | What is done | Since |
|---|---|---|---|
| WebKit's `Context is stopped` (or `Cache API operation failed: Context is stopped`) after every check passed | `e2e:pwa` and `e2e` on WebKit, during the teardown | Reported as a warning ("reported, not counted"), only on WebKit, only in that exact form and only after every check passed; any other browser error still fails. Seen on #111, #118 (13 Oct 2026) and #139 (18 Oct 2026) | 4.1.20 (`e2e:pwa`), 4.2.1 (`e2e`) |
| The Firefox pass of `e2e:studio-hosted` timed out at step 6d (Prepare assets) | `studio-hosted` | A real bug (a late status poll overwrote the panel), fixed in 4.3.0 (#210). If it comes back, it is a regression, not a flake | fixed in 4.3.0 |
| `apt-get update` hangs for many minutes on the runner's Ubuntu mirror | every job that installs ffmpeg | `scripts/ci-ffmpeg.sh`: apt bounded to four minutes an attempt, then a static ffmpeg from GitHub's CDN (BtbN/FFmpeg-Builds); `release.yml` carries the same logic inline. Install steps have 20 minutes. Seen on 7 Oct 2026 | 4.1.15 |
| `toomanyrequests` pulling an image from Docker Hub | `bridge-postgres`, `mutation`, the nightly and the candidate's services | Images pulled from `mirror.gcr.io` at the same digest. Seen on two jobs on 9 Oct 2026 | 4.1.18 |
| `npm ci` or `pip install` fails on a network error | any job | Every install step is tried three times, 15 s apart | — |
| WebKit cannot navigate offline under Playwright | `e2e:pwa` WebKit, `reality` WebKit | `--allow-skip`: that step reports "skipped", never counted as a proof; a person checks Safari offline before each release ([Field passes](contribute.field-passes.md)) | 3.1.1 |

> [!LIMIT id=windows-not-required]
> The `windows` job runs the unit suite without the files that assume POSIX; it is not a required check of the
> ruleset until the maintainer adds it.

<a name="related"></a>

## Related identifiers

- `npm run ci:plan`, the `full-ci` label, `pr-gate`; the `pages-only` input, gone in 4.5.2.
- [Which tests run when](contribute.which-tests.md), [Before a pull request](contribute.before-a-pr.md),
  [Releasing](contribute.releasing.md), [Mutation testing](contribute.mutation-testing.md).
