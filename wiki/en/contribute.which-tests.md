# Which tests run when

Every test suite of the engine repository, the command that runs it, and when CI runs it: on a pull request, on
`main`, in a candidate, in the release, every night or every week. Read with [CI explained](contribute.ci.md), which
says what each workflow and job is.

<a name="suites"></a>

## The suites

"PR" is an ordinary pull request; "gate" means the job runs only when the plan opens that gate
([CI explained](contribute.ci.md#the-plan)), and always on `main`, on a tag and on a pull request labelled `full-ci`.
"Release" is the `release` workflow on a `v*` tag. Every command runs in the engine repository.

| Suite | Command | What it runs | PR | `main` | Candidate | Release | Nightly | Weekly |
|---|---|---|---|---|---|---|---|---|
| Unit (Node) | `npm test` (`test:node`) | every `tests/**/*.test.ts` and the game's `games/<GAME>/tests/`, but the 9 heavy files and the 2 asset files | as coverage; on Node 24 (gate `node24`); on Windows without the POSIX files (gate `windows`) | yes | yes (`release-check:ci`) | yes (`release-check:ci`) | — | — |
| Coverage | `npm run test:coverage` | the unit suite and the asset tests under V8 coverage, then the floors of `vite.config.ts` and the ratchet | yes (`coverage` job; ratchet warns) | yes (ratchet strict) | yes | yes | — | — |
| Assets | `npm run test:assets` | `tests/pixel.test.ts`, `tests/studio-assets.test.ts` (Python needed) | inside coverage | inside coverage | inside coverage | inside coverage | — | — |
| Heavy solver | `npm run test:heavy` | 9 files one after the other: `ownership`, `audit`, `canonical`, `memo`, `reference-proof`, `solver-oracle`, `dominance`, `partition`, `checkpoint-matrix` | — | — | three times, each on a new runner (`heavy` ×3) | — | yes (`heavy`) | — |
| Quality | `npm run quality` | format, code lint, knip, both TypeScript configurations, content lint | yes (`check`) | yes | yes | yes | — | — |
| Docs truth | `npm run docs:truth` | what the docs claim against the code | yes (`check`) | yes | — | — | — | — |
| Wiki | `npm run wiki -- check` | the manifest, pages, links, parity, examples; inside the unit suite as `tests/wiki-*.test.ts` | yes | yes | yes (unit suite) | `check --publish` (`docs-publish`) | — | — |
| Game gates | `npm run build:game` (`verify:game`, the bundle, `verify:dist`, spoilers, asset audit) | the sample game | yes (`check`); the reference chapter and `heroes` (gate `reference`); a new game (gate `secondGame`) | yes | yes | yes | — | — |
| Baseline | `npm run quality:baseline -- --check --dist` | witnesses, proofs, golden saves, public surface, test count, first visit | yes (`check`) | yes | — | — | — | — |
| Proof | `npm run prove:game` | the exhaustive proof, global and by chapter, and `solve:reality` | yes (`check`; `reference`, `second-game` by gate) | yes | yes | yes | — | yes (`prove`) |
| Abstraction audit | `npm run solve -- --audit-abstractions` | the sample proved with and without the abstractions | — | — | yes (`release-check:ci`) | yes | — | — |
| Corpus | `npm run audit:corpus` | the abstractions against the explicit search on random games | — | — | — | — | yes (500 seeds of each kind, four shards) | — |
| Proof matrix | `npm run prove:matrix` | the twelve instances of `docs/dev/PROOF-MATRIX.md` | — | — | — | — | yes (`matrix`) | — |
| Bench | `npm run bench` | a generated 100-room game, timed and proved within a budget | — | — | — | — | — | yes (`prove`, uploaded) |
| Playtests | `npm run playtests` | committed sessions replayed and summed up | inside `verify:game` | yes | `--strict` in `verify:release` | `--strict` in `verify:release` | — | `--strict` (`prove`) |
| e2e, Chromium | `npm run e2e`, `e2e:weight`, `e2e:music`, `e2e:visual`, `e2e:perf`, `e2e:studio`, `e2e:a11y`, `e2e:pwa`, `e2e:taps` | the production build played by touch, at the keyboard, in French, with Canvas | gate `e2e`, `reference`, `secondGame` | yes | — | — | — | — |
| e2e, WebKit | the same scripts with `E2E_BROWSER=webkit` | generic and keyboard rows, the reference chapter, `e2e:pwa` (offline skipped) | gate `e2e`, `reference` | yes | — | — | — | — |
| e2e, Firefox | `npm run e2e:pwa`, `e2e:studio-hosted -- --browser=firefox` | the PWA scenario; the hosted Studio | gate `pwaFirefox`, `studioHosted` | yes | — | — | — | — |
| Cross-runtime | `npm run e2e:canonical`, `e2e:remix`, `e2e:speedrun`, `e2e:remix-speedrun` | the same results in Node, Chromium, WebKit and Firefox | yes (every change) | yes | yes (500 Remix seeds) | — | yes (500 Remix seeds) | — |
| Reality | `npm run e2e:reality`, `npm run reality:xcheck -- --require-rust`, the connectors' tests and fuzz, the Bridge on Postgres | signals end to end; Biscuit in JS and Rust; connectors | gate `reality` | yes | `reality:xcheck` in `release-check:ci` | yes | fuzz, a minute per connector | — |
| Hosted Studio | `npx vitest run tests/studio-server.test.ts …`, `npm run e2e:studio-hosted`, `e2e:studio-collab` | Postgres, S3, Keycloak; Chromium and Firefox | gate `studioHosted` | yes | `studio-install-smoke` | — | — | — |
| Packages | `npm run fresh-install`, `npm run external-consumer`, `npm run upgrade-check -- --from=previous` | packed, installed outside the repository, upgraded | gate `freshInstall`, `upgrade` | yes | yes, on the candidate's own archives | — | — | — |
| Mutation | `npm run test:mutation:core -- --set=<set>` | every gated set ([Mutation testing](contribute.mutation-testing.md)) | only with `full-ci` | — | yes | yes | yes (`--fresh`) | — |
| Bridge loads | `npm run bridge:load`, `npm run runs:load` | SQLite and Postgres | — | — | yes (medians) | — | yes | — |
| Qualification | `npm run ops:qualify` | the Bridge's deployment profile on Docker | when `ops/`, `bridge/`, `scripts/pack.mjs` or the dependencies change (`qualify`) | same paths | yes (`deployment-smoke`) | — | — | — |
| Field passes | `npm run field:*` | what only people and real devices can check | — | — | the reports committed for the version are checked | reported in the notes | — | — |

The `release` workflow does not rebuild what the candidate made: its tests are `release-check:ci` and the mutation
sets, on the tag's commit ([Releasing](contribute.releasing.md)).

> [!LIMIT id=heavy-not-on-pr]
> The heavy solver tests do not run on an ordinary pull request. The `full-ci` label starts a candidate run, which
> runs them three times; otherwise a change to the solver that breaks them is seen by the next nightly. Run
> `npm run test:heavy` locally (about 13 minutes on a laptop, one file after the other) before asking for a review of
> such a change.

<a name="locally"></a>

## Locally, before a pull request

[Before a pull request](contribute.before-a-pr.md) gives the order. In short: `npm run quality`, `npm run check`,
`npm run test:assets`, `npm run verify:game`, `npm run quality:baseline -- --check`; `npm run release-check:local`
chains most of it. Run one suite at a time.

<a name="find-the-test-of-a-thing"></a>

## Find the test of a thing

- **A command**: grep its key in `tests/cmds.test.ts` (every key has an example there) and `tests/core.test.ts`.
- **A layer rule**: `tests/boundaries.test.ts` ([Import boundaries](contribute.boundaries.md)).
- **The public names**: `tests/api-surface.json`.
- **A browser behaviour**: the scripts `scripts/e2e*.mjs` and `scripts/e2e-*.ts` (`npm run e2e`, `e2e:taps`,
  `e2e:pwa`, `e2e:a11y`…), run by CI in Chromium and WebKit (and Firefox for the PWA and the hosted Studio).
- **What a stop of the code walks**: each stop of the [Code tour](contribute.code-tour.md) names its test.
- **What a mutant judges**: `TESTS` in `tools/mutation-sets.ts` lists, for each set, the test files that judge it
  (`npx tsx tools/mutation-sets.ts --tests=<set>`).

To change a command end to end, follow [The dev loop](contribute.dev-loop.md#changing-a-command).

<a name="related"></a>

## Related identifiers

- `npm test`, `npm run test:node`, `npm run test:coverage`, `npm run test:assets`, `npm run test:heavy`,
  `npm run verify:game`, `npm run prove:game`, `npm run prove:matrix`, `npm run audit:corpus`, `npm run e2e`.
- [CI explained](contribute.ci.md), [The coverage ratchet](contribute.coverage-ratchet.md),
  [The quality baseline](contribute.quality-baseline.md), [Mutation testing](contribute.mutation-testing.md).
