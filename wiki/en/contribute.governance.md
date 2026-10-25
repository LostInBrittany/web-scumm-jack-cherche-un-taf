# Governance

Who decides in quest'n'click, how a decision is recorded, and what a person must do that no assistant or test can do
for them. The project has one maintainer, @wanoo; most of its code is written by AI assistants and reviewed by
gates, by a second reading and by that maintainer.

<a name="why"></a>

## Why it works this way

**One person decides, in writing.** The maintainer arbitrates every disagreement (D3). A decision is a dated line in
[`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md), written by the assistant who received it and never without a
human decision, with the maintainer's own words quoted, often in French with the English beside them. The exchange that
leads to it lives in `docs/dev/LOG.md`, committed, in English (D3). A decision that would look surprising without its
context also gets an architecture decision record in `docs/dev/adr/` ([Decisions and ADRs](contribute.decisions.md)).
Everything in `docs/dev/` is public development documentation: nothing private is written there.

**Evidence beats opinion.** When two readings disagree, the one with a measurement, a failing test or a reproduction
wins by default; the maintainer can still overrule. A review that ran no command is an opinion and says so. An
assistant that could not run a check (no browser, no Python) says so rather than skipping it silently.

**A second context reads before merging.** A change of any weight is read again by a second, independent context (in
practice another AI session or sub-agent that did not write it), which reproduces before it judges, then by the
maintainer. The LOG records each "second reading" and what it found.

**People check what machines cannot, and say it.** Seven, then more, checks need a person or a real device: a screen
reader, Safari offline, a real phone, playtesters, recorded voices, listening, a signed tag. They are **reported, not
blocking** (D12): a release ships on its automated gates and its notes list each pass not done. Each pass a person
makes is an open GitHub issue labelled `field-pass`; the maintainer closes it once the test is made and its report
checks ([Field passes](contribute.field-passes.md)). A surface is called stable only with its machine proof and its
pass `passed` (D18, applied by D38 to 4.2.0's reduced stable scope).

**A signature needs a yes each time.** Release tags are signed with the maintainer's SSH key since 4.2 (D30 put it off
until then). The trust root, `.github/allowed_signers`, names the maintainer's software key `id_ed25519`, which lives on
the machine the assistant works on: a signature proves the key was used, **not that the maintainer approved** (D37).
So approval is procedural: each signed tag needs the maintainer's own explicit yes, recorded where it was given, and an
assistant never writes an approved carry attestation on its own. « tu peux signer la 4.5 » ("you may sign 4.5") is the yes for v4.5.0 only
(D50). See [Releasing](contribute.releasing.md).

<a name="who-reviews-what"></a>

## Who reviews what

| What | Reviewed by |
|---|---|
| Every pull request | The CI gates (`pr-gate`), see [CI explained](contribute.ci.md) |
| `tests/quality-baseline.json`, `tests/api-surface.json`, `docs/dev/mutants.json`, `vite.config.ts`, `.github/` | The maintainer, through `.github/CODEOWNERS` (the frozen behaviour, the public surface, the named mutation survivors, the coverage floors, the workflows) |
| A plan, a release, a non-trivial branch | A second context, then the maintainer |
| A field pass | The person who made it, then the maintainer, who closes its issue |
| A translation pair or a claim's scope in the wiki | Recorded in `wiki/translations.json` / `wiki/reviews.json` with who read it, a person or an AI ([Writing documentation](contribute.writing-docs.md#reviews)) |

<a name="charter"></a>

## The charter of v3

[`docs/dev/CHARTER.md`](../../docs/dev/CHARTER.md) set the rules when v3 was co-developed by two AI assistants, Claude
and Codex, with the maintainer arbitrating. Its rules, in short:

1. **Roles**: two assistants, same rules; the human arbitrates, every disagreement ends as a line in `DECISIONS.md`.
2. **One ball**: the last LOG entry ends with `→ next: Claude|Codex|human`; the side without the ball does not touch
   the tree.
3. **Branches**: `main` is the release branch since v3.0.0 (D7); since 3.7.1 a branch is named by its kind
   (`feature/`, `fix/`, `docs/`, `test/`, `refactor/`, `release/`).
4. **A proposal** states its goal, what changed, what it breaks and the migration, its measures, the commands run with
   their output, and what it does not do.
5. **A review** reproduces before it judges, then ranks its findings `blocker` / `should` / `nit`, each with evidence.
6. **Evidence beats opinion.**
7. **Truth commands** (`validate`, `solve`, `test`, `build`, the e2e on a production build…) are recorded in the entry.
8. **Identity in git**: a trailer naming the agent; commit messages say what changed for the player or the author.
9. **Public repository**: no private names, no private content; `npm run audit` before every commit.
10. **Scope of v3**: a break ships with its migration; no Phaser, no second dialogue format, no real-time scripting.
11. **Docs are part of the change.**
12. **Silence rule**: a check that could not be run is said.

> [!LIMIT id=charter-dated]
> The charter's wording is dated: it describes the v3 period with two assistants and a "one ball" exchange. Since D9
> (4 October 2026) one assistant implements one branch at a time and merges it on green CI, and recent commits carry a
> `Co-Authored-By` line rather than the charter's `Agent:` trailer. Its principles (D3, evidence, the silence rule,
> public content) still hold; the maintainer has not rewritten it.

<a name="alternatives"></a>

## Alternatives set aside

- **Blocking human gates.** Rejected by D12: a release would wait on a tester's calendar. Instead every pass not done
  is said in the release notes, and an open `field-pass` issue is a pass not made.
- **A hardware key as trust root.** Preferred, but not at hand when 4.1.20 shipped; the software key was accepted with
  its limit said (D37). A rotation to `id_ed25519_sk` is its own pull request touching only `allowed_signers`.

<a name="decisions"></a>

## Decisions and ADRs

- D3 (arbitration, the exchange in English), D9 (cadence), D12 (passes reported), D18 and D38 (what "stable" needs),
  D30 and D37 (signatures), D50 (the documentation): [`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md).
- [ADR 0024](../../docs/dev/adr/0024-pass-surfaces-and-carry-attestations.md): a pass is bound to its surface, and
  carried only by a signed attestation.
