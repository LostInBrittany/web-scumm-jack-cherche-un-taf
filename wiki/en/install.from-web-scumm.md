# Coming from web-scumm

quest'n'click was called **web-scumm** until 4.2.4 (D47). 4.2.5 renamed the packages, the commands and the imports,
and kept the old names as aliases through 4.2.x; **4.3.0 removed the aliases**. A game that still says `web-scumm`
moves with one command, `npx quest-n-click migrate`. Players' saves are not touched: the formats kept their names.

<a name="what-you-get"></a>

## What you get

A game project that depends on `@quest-n-click/engine`, imports `@quest-n-click/engine/…`, calls `quest-n-click` in its scripts, and
builds and plays as before, with its players' saves found where they were.

<a name="context-and-versions"></a>

## Context and versions

- A **created project** made with `create-web-scumm` (or `web-scumm create`), moved to an engine of 4.3.0 or later.
- Up to 4.2.4 every name was `web-scumm…`. From 4.2.5 the new names exist, and each 4.2.x release also shipped the
  archives under the old names, whose commands ran after a one-line notice ("web-scumm is now quest-n-click; the old
  name works until 4.3"). From 4.3.0 there is no `web-scumm` archive, command or import any more.
- The repository is `github.com/Quest-n-Click/quest-n-click`; the old `github.com/wanoo/web-scumm` links redirect, release
  downloads included. The sample game and the Studio's demo are now at `https://quest-n-click.cleverapps.io/demo/`
  (since 4.5.2; the GitHub Pages addresses before are abandoned): update your bookmarks and links.

<a name="names"></a>

## The names, before and after

| Before (up to 4.2.4) | From 4.2.5 |
|---|---|
| package `web-scumm`, command `web-scumm` | `quest-n-click`, command `quest-n-click` |
| imports `web-scumm/content`, `/player`, `/minigames`, `/testing`, `/reality` | `quest-n-click/content`, … |
| `create-web-scumm` | `create-quest-n-click` |
| `web-scumm-bridge` (package and command) | `quest-n-click-bridge` |
| `web-scumm-connectors`, command `web-scumm-connector` | `quest-n-click-connectors`, command `quest-n-click-connector` |
| `web-scumm-studio-server`, `web-scumm-studio-worker` | `quest-n-click-studio-server`, `quest-n-click-studio-worker` |
| release files `web-scumm-<version>.tgz`, `web-scumm-<tag>-…` | `quest-n-click-<version>.tgz`, `quest-n-click-<tag>-…` |

From 4.5.2 the packages carry the npm organisation's scope (D53): `@quest-n-click/engine`, `@quest-n-click/create`,
`@quest-n-click/bridge`, `@quest-n-click/connectors`, `@quest-n-click/studio-server`, and the imports are
`@quest-n-click/engine/content`, …; the commands and the release files keep the names above. On 4.5.2 or later,
`migrate` takes a `web-scumm` project straight to the scoped names.

<a name="kept-names"></a>

## What keeps its name

The formats are identifiers inside files and stores, not the project's name: renaming them would break existing saves,
files and deployments. A save is still a `web-scumm-save` envelope, a session `web-scumm-session`, a run a `.wsrun`
file in the `web-scumm-speedrun` format, a Remix world `web-scumm-remix-1`; a signal is still `web-scumm-world-signal`,
a reality manifest `web-scumm-reality-manifest`. The browser keeps its IndexedDB databases (`web-scumm-saves`,
`web-scumm-runs`) and its `web-scumm.…` storage keys, so a player's saves and runs are found where they were. The
Bridge's `X-Web-Scumm-*` headers, the signatures' contexts, the environment variables `WEB_SCUMM_*` and the Studio
Server's tables are unchanged.

Releases up to v4.2.4 keep their files' names and their attestations, which name the repository `wanoo/web-scumm`; from
v4.2.5 to v4.5.1 they name `wanoo/quest-n-click`, and from v4.5.2, after the move to the Quest-n-Click organization,
`Quest-n-Click/quest-n-click` (`ship verify` asks for the one each release was signed under; the attestations made
before the move are looked up under the user `wanoo`). The
sample game's and the reference chapter's credits say quest'n'click: their presentation fingerprint moved and their
reference run was recorded again. A game's own fingerprint moves only if its own text changes.

<a name="prerequisites"></a>

## Prerequisites

- The project committed: `migrate` rewrites files in place.
- The [Requirements](install.requirements.md) of the target version.

<a name="where-to-run"></a>

## Where to run the commands

In the created project's folder, on your machine.

<a name="steps"></a>

## Steps

<!-- step: uninstall-old -->
1. Remove the old package:

   ```bash
   # in the created project
   npm uninstall web-scumm
   ```

<!-- step: install-new -->
2. Install the engine under its new name, from the release archive:

   ```bash
   # in the created project
   npm install https://github.com/Quest-n-Click/quest-n-click/releases/download/v4.4.0/quest-n-click-4.4.0.tgz
   ```

<!-- step: migrate -->
3. Rename what the project still says, check, and install again:

   ```bash
   # in the created project
   npx quest-n-click migrate
   npx quest-n-click migrate --check
   npm install
   npm run verify
   ```

   `migrate` renames, in every source file of the project (`.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`,
   `.cjs`; `node_modules`, `dist`, `public` and hidden folders left out), the imports `web-scumm/…` to
   `@quest-n-click/engine/…` (`quest-n-click/…` before 4.5.2) in either quote style; in `tsconfig.json`, the path
   `web-scumm/*` and the `node_modules/web-scumm/…` targets; in `package.json`, the scripts' commands (`web-scumm dev` becomes
   `quest-n-click dev`, `web-scumm-bridge serve` becomes `quest-n-click-bridge serve`), and it drops a dependency on a
   former package when its new one is installed. Any string that starts with `web-scumm/` in quotes is renamed, an
   import or not; `web-scumm-save` and the other format names are not. It then runs again in a new process, which
   reads the renamed `tsconfig.json`, for the rest of the migration.

> [!GUARANTEE id=former-name-imports]
> `migrate` renames the imports `web-scumm/…` in either quote style, and nothing that only starts like them
> (`web-scumm-save` stays). The test runs the renaming function on sample texts; a whole project's rename is covered
> by the other tests of the same file and by the candidate's `external-consumer`, not by this one.

<!-- step: commands-you-type -->
4. Change the commands you type and your scripts the same way: `npx web-scumm …` becomes `npx quest-n-click …`;
   `npx web-scumm-bridge`, `npx web-scumm-connector`, `npx web-scumm-studio-server`, `npx web-scumm-studio-worker`
   become `npx quest-n-click-bridge`, `npx quest-n-click-connector`, `npx quest-n-click-studio-server`,
   `npx quest-n-click-studio-worker`.

<!-- step: hosts -->
5. A host of the Bridge, the connectors or the Studio Server installs the `quest-n-click-…` archives and calls the new
   commands in its unit files and scripts.

<a name="by-hand"></a>

## By hand, without `migrate`

From the project's folder, the imports in both quote styles, names with spaces included (GNU and BSD `grep` and `sed`
alike), then `tsconfig.json` and `package.json` as below:

```bash
# in the created project
grep -rl --null -E --include='*.ts' --include='*.tsx' --include='*.mts' --include='*.cts' --include='*.js' \
  --include='*.jsx' --include='*.mjs' --include='*.cjs' --exclude-dir=node_modules --exclude-dir=dist \
  --exclude-dir=public --exclude-dir='.*' "['\"]web-scumm/" * \
  | xargs -0 sed -i.bak -e "s#'web-scumm/#'@quest-n-click/engine/#g" -e 's#"web-scumm/#"@quest-n-click/engine/#g'
find . -name '*.bak' -not -path './node_modules/*' -delete
```

- `package.json`: the dependency `"web-scumm": "<spec>"` becomes `"@quest-n-click/engine": "<spec>"`, its archive
  `quest-n-click-<version>.tgz`; the scripts `web-scumm dev`, `web-scumm build`… become `quest-n-click dev`,
  `quest-n-click build`….
- `tsconfig.json`: the path `web-scumm/*` becomes `@quest-n-click/engine/*`, pointing at
  `./node_modules/@quest-n-click/engine/src/engine/api/*`; `@engine/*` points at
  `./node_modules/@quest-n-click/engine/src/engine/*`; `include` names `node_modules/@quest-n-click/engine/src/env.d.ts`.

<a name="expected-result"></a>

## Expected result, and how to check it

`migrate` prints `✔  the former names renamed @quest-n-click/… in <files> (then: npm install)` (on 4.3.0 to 4.5.1,
`✔  the former name web-scumm renamed quest-n-click in <files> (then: npm install)`), then the schema line. `npx quest-n-click migrate --check` exits 0; `grep -rn "web-scumm/" game` finds nothing; `npm run verify`
passes.

<a name="common-errors"></a>

## Common errors

`migrate` says what it leaves to you, each on a `✖` line, and `--check` never calls such a project clean:

| What it says | What to do |
|---|---|
| `package.json depends on web-scumm: npm uninstall web-scumm && npm install @quest-n-click/engine` | Steps 1 and 2: the new package was not installed |
| `package.json has both a web-scumm and a quest-n-click script: the web-scumm one is left as it is` | Remove or rename the `web-scumm` script yourself |
| `<path>: a symbolic link out of the project, not renamed (rename what it leads to by hand)` | Rename the linked files where they live |
| `<path>: a symbolic link that leads nowhere, not renamed` | Remove or fix the link |

<a name="files-changed"></a>

## Files or data changed

The project's source files that held `web-scumm/…`, `tsconfig.json`, `package.json` (its indentation and byte order
mark kept), `package-lock.json` after `npm install`. Nothing in players' browsers.

<a name="recovery"></a>

## Recovery or going back

`git reset --hard` to the commit made before, then `npm install`. A 4.3.0 or later engine never reads the old imports
again, so going back means going back to a 4.2.x engine too.

<a name="hosted-game"></a>

## A game on a hosted Studio

A game on a hosted Studio that still imports `web-scumm/…` no longer loads on 4.3.0 (its health is not green and its
writes are refused) until its owner runs the engine's upgrade (`POST /api/engine/migrate`). The upgrade renames its
imports first, as a revision of its own judged only by whether the game loads (and, if it loaded before, by no new
validator error), never by the solver; then the schema's migration, if one is due, is judged as before and may still
be refused (422, the rename kept). The rename is not undoable: take a backup first to go back.
[Upgrading the engine of a hosted game](team.upgrade-engine.md).

<a name="references"></a>

## References

- [Upgrade](install.upgrade.md), [Upgrade notes: 4.2](install.upgrade-notes-4-2.md) (§38),
  [Upgrade notes: 4.3](install.upgrade-notes-4-3.md) (§39)
- [`tools/migrate-name.ts`](../../tools/migrate-name.ts), [`tools/migrate.ts`](../../tools/migrate.ts),
  [`tests/former-name.test.ts`](../../tests/former-name.test.ts)
