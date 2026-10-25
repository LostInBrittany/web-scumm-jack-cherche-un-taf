# Mutation testing

Lines run by a test are not a proof: mutation testing asks whether the tests tell a right result from a wrong one. This
page says how quest'n'click does it, and what to do when a mutant survives your change.

<a name="what-you-get"></a>

## What you get

A mutation set that passes again after your change: every mutant of its files is killed by a test, or named in
`docs/dev/mutants.json` with a category, a reason, a proof, an owner and a revisit version.

<a name="why"></a>

## Why mutation testing, and why this tool

Each mutant changes one thing in a source file: a comparison or a logical operator swapped (`<` for `<=`, `&&` for
`||`), a negation dropped, a condition forced `true` or `false`, a boolean inverted. The tests that judge that file's set
run against it, and one of them must fail. A mutant that survives is a **missing test**, or an **equivalent mutant**
that no input can tell from the original.

The tool is [`tools/mutate.ts`](../../tools/mutate.ts), written for the project in 4.1.0 "Clarity": Stryker 10 did not
activate its mutants under Vitest here (739 of 749 survived, an emptied block included), so each mutant is run as plain
source. The file is restored after each mutant, and on exit (Ctrl-C included).

**A survivor not named fails the run, whatever the score.** There is no threshold: a set passes when every survivor is
explained, and an explanation is an exemption with terms (below), never "the score is good enough".

<a name="context-and-versions"></a>

## Context and versions

The engine repository. The tool since 4.1.0, the sets and the gate by identity since 4.1.2, sharding and exemption
terms since 4.1.20; thirteen gated sets as of 4.4.0.

| Set | Mutates | Gated since |
|---|---|---|
| `core` | `src/engine/core/{cond,save,session-runtime,migrate}.ts` | 4.1.2 |
| `reality` | the engine's receive, the protocol, the client, the HTTP port; the Bridge, its journal store, lock and policy | 4.1.2 |
| `runs` | the speedrun queue: `bridge/src/{runs,runs-store,runs-limiter}.ts` | 4.1.17 |
| `remix` | a world's seed, compilation, application, categories; the Daily and Mystery tokens | 4.1.17 |
| `speedrun` | a run's envelope, the recorder, the verifier | 4.1.17 |
| `connectors-pure` (`connectors` until 4.2) | the connectors' pure parts: SDK, MIME reader, line editor, virtual disk, badge crypto and fetch | 4.1.18 |
| `reality-store` | the Bridge's stores in memory, SQL and SQLite, migrations, streams, signing (not the Postgres adapter) | 4.1.18 |
| `connectors-edge` | configuration and start, the email connector, badge verification, terminal guard and shell, SSH, Telnet (4 shards) | 4.1.20 |
| `reality-store-postgres` | `bridge/src/store-postgres.ts`, judged on a real Postgres (`BRIDGE_PG_URL`) | 4.1.20 |
| `studio-ops` | the Studio Server's journal, its durable writes and the spans of a game's files | 4.2.1 |
| `studio-auth` | the Studio Server's gate, OpenID provider, auth routes and store, spans' leases, the game's origin | 4.2.1 |
| `studio-workshop` | personal undo, health by revision, previews, builds, prepared assets, backup, journal shipped and collection | 4.2.3 |
| `voices` | voices by value: a line's clip keys, the recording table and its CSV, the validator's check; the solver's sentences | 4.3.1 |

The sets and the test files that judge each one are in [`tools/mutation-sets.ts`](../../tools/mutation-sets.ts)
(`SETS`, `TESTS`, `GATED`); `MEASURED` (sets that report without gating) is empty since 4.2.1. Where each runs is in
[Which tests run when](contribute.which-tests.md#suites): a pull request labelled `full-ci`, every night (from scratch),
the candidate and the release.

<a name="prerequisites"></a>

## Prerequisites

- A prepared repository ([Developer setup](contribute.setup.md)), and the set's tests green before any mutation: the
  tool refuses to start otherwise (`✖ the tests fail before any mutation: fix them first`).
- For `reality-store-postgres`: a Postgres the tests may use, given as `BRIDGE_PG_URL` (the tool exits 2 without it,
  since every mutant would survive a test that skips its Postgres cases).
- Time: a set takes minutes to hours; `connectors-edge` took 2 h 02 in one job on a runner before it was cut in four
  shards. Prefer `--file` locally, or the `mutation` workflow.

<a name="where-to-run"></a>

## Where to run the commands

In the engine repository, on your machine; or on a runner with the `mutation` workflow, which measures one set on one
ref and keeps the report:

```sh
# from any clone with the GitHub CLI
gh workflow run mutation --ref main -f set=remix -f ref=<branch or SHA> [-f file=<path>]
```

The tool writes the source file it mutates: do not edit it while a run is going.

<a name="steps"></a>

## Steps

<!-- step: run-file -->
1. **Mutate the file you changed**, judged by its set's tests:

   ```sh
   # in the engine repository
   npm run test:mutation:core -- --file=src/engine/core/cond.ts
   ```

   It prints each surviving mutant as `survived <file>:<line> <operator>: <from> → <to>`, then each file's score, then
   `✖ not in docs/dev/mutants.json: …` for every survivor nobody named.

<!-- step: run-set -->
2. **Or run the whole set**, as CI does:

   ```sh
   # in the engine repository
   npm run test:mutation:core -- --set=core          # the default set
   npm run test:mutation:reality                     # the same as --set=reality
   npm run test:mutation:core -- --set=all           # every gated set, one after the other
   ```

   A report whose inputs are unchanged (`inputHash`: the set's sources and tests, everything they import, the two
   configurations, the tool, the named survivors, the lockfile without its version fields) is **reused**: the run says
   so and stops. `--fresh` runs anyway. Reports are written to `.cache/mutation/report-<set>.json`.

<!-- step: kill -->
3. **Kill the survivor with a test**, the usual answer: write the input that tells the mutant from the original, in a
   test file the set's `TESTS` already lists (or add the file there). Run step 1 again: the mutant is killed.

<!-- step: name -->
4. **Or name it**, when no input can tell it apart. Add an entry to `docs/dev/mutants.json`:

   ```json
   {
     "file": "src/engine/core/session-runtime.ts",
     "operator": "condition true",
     "from": "this.open.length",
     "to": "true",
     "context": "return this.open.length ? this.open[this.open.length - 1] : undefined;",
     "why": "`cur`: with no open entry, `this.open[-1]` is undefined, which is what the condition returned",
     "category": "equivalent",
     "proof": "argument",
     "owner": "@wanoo",
     "revisit": "4.6.0"
   }
   ```

   - `category`: `equivalent`, `unreachable`, `instrumentation` or `out-of-contract`.
   - `why`: more than 20 characters that say it.
   - `proof`: `argument` (the why is the proof; an equivalent mutant only), or a test file under `tests/` that exists
     and pins what makes it so.
   - `owner`, and `revisit`: the version from which the entry is refused until it is read again.
   - `context`: the trimmed source line, so the entry names that line's mutant only.

   Then regenerate the table of `docs/dev/MUTANTS.md` and run the set again:

   ```sh
   # in the engine repository
   npm run test:mutation:core -- --doc
   npm run test:mutation:core -- --set=<set> --fresh
   ```

   `docs/dev/mutants.json` is a file the maintainer reviews (`CODEOWNERS`): say in the pull request why each entry is
   equivalent.

> [!LIMIT id=revisit-due]
> An entry whose `revisit` version is reached stops **every** set, whatever its file: "docs/dev/mutants.json: n entries
> do not hold … to be read again at x.y.z". As of 4.4.0 all 132 entries say `revisit: 4.5.0`: once `package.json` says
> 4.5.0 (its pre-releases included), every mutation run refuses until each entry is read again and its `revisit`
> moved.

<a name="expected-result"></a>

## Expected result, and how to check it

`✔ n/m mutants killed, k survivors explained, 0 not; report in .cache/mutation/…`, and exit code 0. In CI, the set's
`mutation (<set>)` jobs and `mutation-merge` are green.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `✖ not in docs/dev/mutants.json: <file>:<line> …` | A survivor nobody named | Kill it with a test (step 3), or name it (step 4) |
| `⚠ named in docs/dev/mutants.json but killed or gone` | An entry whose mutant no longer survives | Remove the entry |
| `✖ docs/dev/mutants.json: n entries do not hold` | An entry without its terms, or past its `revisit` | Complete it, or read it again and move `revisit` |
| `✖ --set=… mutates reality-store-postgres, which needs BRIDGE_PG_URL` | No Postgres given | Set `BRIDGE_PG_URL`, or run another set |
| `ℹ --set=connectors is --set=connectors-pure since 4.1.19` | The old name | Use the new one (the alias works until 4.2) |
| `✖ <set>: … nothing merged, the set is not judged` (CI) | A shard missing, doubled, cancelled or of other inputs | Rerun the set's failed shard jobs, then `mutation-merge` |

<a name="files-changed"></a>

## Files or data changed

The tool rewrites the mutated source file while it runs and restores it after each mutant and on exit; it writes its
reports under `.cache/mutation/`. You change test files, `docs/dev/mutants.json` and, through `--doc`,
`docs/dev/MUTANTS.md`.

<a name="recovery"></a>

## Recovery or going back

If a run was killed without its exit handler (a `kill -9`, a crash), check `git status`: a mutated source file shows as
modified; `git restore <file>` puts it back.

<a name="references"></a>

## References

- [`docs/dev/MUTANTS.md`](../../docs/dev/MUTANTS.md), the named survivors explained;
  [`docs/dev/mutants.json`](../../docs/dev/mutants.json), the list the gate reads.
- [`tools/mutate.ts`](../../tools/mutate.ts), [`tools/mutation-sets.ts`](../../tools/mutation-sets.ts),
  [`tools/mutation-shards.ts`](../../tools/mutation-shards.ts), [`vitest.mutation.config.ts`](../../vitest.mutation.config.ts).
- [The coverage ratchet](contribute.coverage-ratchet.md), [CI explained](contribute.ci.md).
