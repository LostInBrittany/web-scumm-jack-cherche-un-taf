# The game in Git

A team Studio can push the game to a Git repository and import it back. An owner pushes the revisions confirmed since
the last push as one commit, every author credited; an import replaces the game with a branch or a commit. The Studio
never forces a push and never checks a working tree out.

<a name="what-you-get"></a>

## What you get

The game's files in a folder of your repository, one commit per push, each author of those revisions a
`Co-authored-by`; and a way back from Git into the Studio.

<a name="context-and-versions"></a>

## Context and versions

A hosted Studio (the Studio Server), from 4.2.3 (D44: a deploy key, one repository per instance). The code is
[`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts). Pushing and importing are an owner's; the
state is a reviewer's.

<a name="prerequisites"></a>

## Prerequisites

- A repository, and a **deploy key** with write access to that one repository (an SSH private key). A public https
  remote, or a local one, needs none; a remote URL never carries credentials (the configuration refuses
  `https://user@…`).
- `git` on the studio app's machine.
- The `owner` role to push and import.

<a name="where-to-run"></a>

## Where to run the commands

The configuration and the secret are set on the studio app (see [Configuration](clever.configuration.md)). Push and
import are in the Studio, the **Play** tab, panel **Git**, or through the API with an owner's token.

<a name="steps"></a>

## Steps

<!-- step: configure -->
1. **Name the repository** in the configuration (optional key `git`):

   ```json
   { "git": { "remote": "git@github.com:org/game.git", "branch": "main", "path": "games/my-game", "committer": { "name": "…", "email": "…" }, "knownHosts": "github.com ssh-ed25519 AAAA…" } }
   ```

   | Field | Default | What |
   |---|---|---|
   | `remote` | required | the repository: `git@…`, a public `https://…`, or a local path |
   | `branch` | `main` | the branch pushed to and imported from |
   | `path` | the repository's root | the game's folder in the repository |
   | `committer` | none | who commits, `{name, email}`; the authors are `Co-authored-by` |
   | `knownHosts` | none | the remote host's `known_hosts` lines, checked strictly; without them the host is trusted on first use, again after each new disk |

<!-- step: deploy-key -->
2. **Give the deploy key** as the secret `STUDIO_GIT_KEY` (on Clever Cloud a variable; elsewhere
   `STUDIO_GIT_KEY_FILE`, a file of mode 0600). See [Environment variables](reference.environment-variables.md#studio-git-key).

<!-- step: look -->
3. **Look at the state.** The Play tab's **Git** panel shows where the game goes (the remote, without credentials;
   the branch; the folder) and the last revision pushed, with its commit. `GET /api/git` gives
   `{remote, branch, path, pushed, commit}`.

<!-- step: push -->
4. **Push (owner).** Click **Push to Git** (`POST /api/git/push`). One commit holds the revisions confirmed since the
   last push: the game's files at the head, in `path`; each author of those revisions is a `Co-authored-by` (their
   email when the provider verified it, otherwise their name at `users.noreply.<the Studio's host>`). The rest of the
   repository is left as it is. It answers `{pushed, commit, revisions: [from, to]}`. Nothing new pushes nothing
   ("Nothing new to push").

<!-- step: import -->
5. **Import (owner, asked twice).** Click **Import from Git**, then again to confirm ("Replace the game with Git's?
   Click again"); or `POST /api/git/import` with `{}` for the branch, or `{"ref": "<another branch or a commit hash>"}`.
   The game as it is in `path` at that commit is written as one revision, under the exclusive lease (nobody writes
   meanwhile). It replaces what the Studio had not pushed, which stays in the Studio's history. It answers
   `{commit, changed}`.

   - The branch's tip imported: the next push builds on it.
   - Another commit: the head is that commit's game, and the next push goes on the tip the Studio knows.

<a name="rules"></a>

## The rules

- **Never forced.** A branch that moved since the Studio's last push (someone pushed there) is refused with a 409:
  import it first. A branch that exists but the Studio never imported is refused the same way: import it first, or
  push to a new branch.
- **No checkout.** A push builds its commit from objects in an index of its own; an import reads the commit's objects.
  The repository's links, attributes and ignore rules cannot reach the server's files.
- **The repository's own files.** Paths with a segment starting with a dot (`.github/`, `.gitignore`) are the
  repository's: kept by a push, skipped by an import.
- **`private/` never leaves.** The game's `private/` (sealed endings, raw sheets) and `node_modules/` are never
  pushed, and an import leaves `private/` as it is.
- **An import refuses whole**: a link or a submodule (422), a folder `path` that is a file, a link or a submodule
  (422), a commit with no game at `path` (422), more than 5,000 files or 64 MiB (413).
- **Git runs apart**: an environment of its own (no platform secret), the key in a file for one command, the clone in
  `workDir/git`, made again when the disk is new.

> [!GUARANTEE id=git-never-forced]
> A push to a branch that moved since the Studio's last push is refused, and the branch is left as it was.

> [!LIMIT id=git-limits]
> One repository and one branch per instance. Pushes are made by hand (no automatic push after each revision).
> Comments, members and the audit are not in the repository: they live in the Studio's database. A provider-verified
> email is needed for an author's real address in `Co-authored-by`.

<a name="expected-result"></a>

## Expected result, and how to check it

After a push, the branch has one new commit with the game's folder at the head and the authors as co-authors; the Git
panel shows the revision pushed and its commit. After an import, the header shows one new revision
(`import from git <commit>`).

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `<branch> moved since the Studio's last push (… → …): import it first, never forced` (409) | Someone pushed to the branch | Import it, then push |
| `<branch> exists and the Studio never imported it: import it first, or push to a new branch` (409) | The branch existed before the Studio | Import it once |
| `<branch> moved while pushing: import it first, never forced` (409) | A push landed during yours | Import, then push |
| `the push failed: …` (502), `git <command>: …` (502) | The remote refused (key, rights, network) | Read the remote's message; check the deploy key |
| `ref must be a branch of the repository or a commit` (400) | A malformed ref | A branch name or a 7 to 40 hex hash |
| `no commit <ref> in the repository` (404) | Unknown ref | Check the name or hash |
| `this Studio has no Git repository (config git)` (404) | No `git` in the configuration | Add it |
| `git.remote carries no credentials (the deploy key is STUDIO_GIT_KEY)` at start | A token or user in the URL | Use the deploy key |

<a name="files-changed"></a>

## Files or data changed

A push writes a commit to the remote (no game file changes in the Studio). An import writes the game's files as one
operation. The Studio keeps the last commit and revision pushed in its database.

<a name="recovery"></a>

## Recovery or going back

An import is written without an undo: Undo does not take it back. What it replaced stays in the Studio's history; to
go back, import an earlier commit, or restore a backup taken before ([Backups](clever.backups.md)). A push is never
rewritten by the Studio: revert it in Git if needed.

<a name="references"></a>

## References

- [`tests/studio-git.test.ts`](../../tests/studio-git.test.ts).
- [Exporting the game and leaving the installation](clever.export-leave.md).
- [Roles and actions](team.roles.md#matrix-owner).
