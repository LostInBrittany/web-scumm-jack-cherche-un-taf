# Charter: two assistants, one engine (v3)

web-scumm v3 is co-developed by two AI assistants, Claude and Codex, who review each other's work, and one human, the
maintainer, who arbitrates. This folder is the exchange: `LOG.md` is the conversation, `DECISIONS.md` is what the human
decided. Both assistants read this file and the last entry of `LOG.md` before touching the tree.

**The goal (D4):** a v3 online that is worthy of a semi-professional engine. The bar for every proposal and review: would
a small studio trust it with a long game, offline, on a phone, with saves that survive updates?

1. **Roles.** Two assistants, same checkout, same rules. The human arbitrates: every disagreement ends as a line in
   `DECISIONS.md`. Nothing is merged into `v3` while a blocker is open without that line.
2. **One ball.** The last entry of `LOG.md` ends with `→ next: Claude|Codex|human`. The assistant without the ball does
   not touch the working tree. Before handing over: everything committed on your branch, `git status` clean, and the
   entry names the branch left checked out.
3. **Branches.** `main` is the release branch: since v3.0.0 (D7) each topic branch merges there as it passes its
   gates; `v3` was the integration branch of the v3.0.0 work.
   `v3-<topic>` is one proposal (`v3-saves`, `v3-prove`, `v3-ids`, `v3-studio-security`, `v3-ci`, `v3-offline`,
   `v3-upgrading`…). A topic branch is merged into `v3` by its author, with a merge commit, only after an `approve`
   review by the other assistant and the human's decision on every blocker. Never rebase a branch the other assistant
   has reviewed. CI runs the checks on `main`, `v3` and `v3-*`; only `main` is deployed to Pages.
   Since 3.7.1 a topic branch is named by its kind, not by a version: `feature/<topic>`, `fix/<topic>`, `docs/<topic>`, `test/<topic>`, `refactor/<topic>`,
   `release/<version>`; CI runs on all of them, and a release is published from any SemVer tag `vX.Y.Z` (any major),
   built from the commit CI tested, never over a release that already has files.
4. **A proposal entry** states: the goal, what changed, what it breaks for v2 and the migration path, the measures
   (states, seconds, tests, bundle size), the commands run with their exact output, and what it does *not* do.
5. **A review entry** reproduces before it judges: run the same commands, add the ones the author forgot (`npm run
   build`, the e2e in production mode; until D8 the solver on the private reference game when the engine changed). Say what is
   good first, then the findings ranked `blocker` / `should` / `nit`, each with its evidence. A review without a
   command run is an opinion, and is labelled as such.
6. **Evidence beats opinion.** When the two disagree, the one with a measurement, a failing test or a reproduction wins
   by default; the human can still overrule.
7. **Truth commands** (see `AGENTS.md`): `validate`, `solve`, `solve -- --prove`, `test`, `test:assets`, `build`,
   `audit`, the e2e against a production build, recorded in the entry. (Until D8, 4 Oct 2026, an engine change also
   recorded the private reference game's witness and proof numbers; that game now stays on 3.1.0.)
8. **Identity in git.** Every commit carries a trailer `Agent: Claude` or `Agent: Codex` (Claude also keeps its
   `Co-Authored-By` line). Commit messages say what changed for the player or the author, not for the code.
9. **Public repo.** No private names, no private content. `npm run audit` before every commit; it covers `docs/dev/`.
   The maintainer's own game is called "the private reference game", nothing more.
10. **Scope of v3.** Breaking v2 is accepted (decision D1). Each break ships with its migration: a data migration where
    saves are concerned, `wiki/en/install.upgrade.md` + `wiki/fr/install.upgrade.md`, and the private reference game actually
    migrated on a branch before v3.0.0 is tagged. What is out of scope stays out: no Phaser, no dialogue format beside
    the DSL, no realtime scripting.
11. **Docs are part of the change.** A proposal without `docs/en` + `docs/fr` + `CHANGELOG.md` is not done; the
    reviewer marks it `should`.
12. **Silence rule.** If an assistant cannot run a check (missing browser, no Python, no access to the private game),
    it says so in the entry rather than skipping it silently.

## Entry format (`LOG.md`)

```
## #12 · 2026-10-04 · Claude · review · re #11
Branch: v3-saves · Commit: abc1234
Verdict: changes requested          (proposal | review | answer | decision-request | handoff → verdict free text)

### What is good
### Findings                        (blocker / should / nit, each with the command or measure that proves it)
### Checks run                      (commands and the exact result; numbers in a table)
### Asks                            (numbered; the other side answers by number)

→ next: Codex
```

Entries are numbered, dated, append-only: never edit someone else's entry, nor your own once the ball has moved.
Answer by number (`re #11`, `ask 3`). Keep an entry under a screen when you can; measurements go in tables.
