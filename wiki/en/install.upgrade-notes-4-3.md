# Upgrade notes: 4.3

What 4.3.0 "Hero Choice" and 4.3.1 changed, kept unchanged. 4.3.0 is the one minor that removed something: the
former names `web-scumm…`, aliases through 4.2.x (D47). A game that still says `web-scumm` runs
`npx quest-n-click migrate` once ([Coming from web-scumm](install.from-web-scumm.md)). The rest is optional for a game,
with three things to check after upgrading to 4.3.0: a literal `{hero}` or switch-shaped brace group in a text, the new
interface font on a phone, and, for a Bridge operator, the `limits` of each `config.json`.

The upgrade itself is [Upgrade](install.upgrade.md). The section numbers are those of the former
`docs/en/UPGRADING.md`, so "§39" still finds its section.

<a name="from-4-2-5-to-4-3-0"></a>

## 39. From 4.2.5 to 4.3.0 "Hero Choice"

Nothing to change in a game's content: the content format only grows (ADR 0022, D49), `schemaVersion` stays 3, saves and the
save envelope are 4.2.0's, the logic fingerprint of a game that uses none of what follows does not move. The engine
installs from `releases/download/v4.3.0/…`. What is new, all optional (CONTENT_GUIDE, "Choosing the hero"):

- **A character variant may carry a `name`**: while it applies, the speech box, the transcript, the talk header and
  `{name}` in a fallback read it. A translation lists it (`char:<id>/variants[<i>].name`).
- **Text switches and `{hero}`**, filled when a text is shown, after the translation: `{hero}` is the active hero's
  name, `{form?knight=him|witch=her|*=it}` the text listed for the flag's current value. In lines, choices, looks,
  hints, toasts, captions, item and object names and objective titles; the validator refuses them in room names,
  verbs, character and variant names, `ui`, the title, the map, the ending and minigame params.
- **`img` on a choice option**: the option is a card, the image with its `text` as the label.
- **Voices by value**: a line with a switch looks up `<id>~<flag>=<value>` before its plain id (AUDIO.md).
- **A key per verb** (#203): `key: 'o'` on a verb picks it at the keyboard, translated like the label; with
  `settings: true` the player can turn the keys off (`ui.verbKeys`, CONTENT_GUIDE, "A key per verb").
- **`npm run lint`** has `hero-looks-default` (info), and no longer calls `action-dead` a rule that only sets a flag a
  character's variant or a text switch reads.

**A Bridge checks the `limits` of its `config.json` at start** (4.3.0): an unknown name, or a value that is not an
integer of at least 0 (at least 1 for `streamPage`, `bodyBytes` and `streamBufferBytes`), stops it with the name
and the value; on a shared Bridge that is every tenant. Before upgrading, list each tenant's limits and compare them
with `DEFAULT_LIMITS`'s names (`bridge/src/config.ts`):
`node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).limits ?? {})' <dir>/config.json`.

**The `web-scumm` names are gone** (D47). Through 4.2.x the engine's former names were aliases; 4.3.0 removes them.
There is no `web-scumm-<version>.tgz`, `create-web-scumm`, `web-scumm-bridge`, `web-scumm-connectors` or
`web-scumm-studio-server` archive any more, no `web-scumm`, `web-scumm-bridge`, `web-scumm-connector`,
`web-scumm-studio-server` or `web-scumm-studio-worker` command, and `web-scumm/content` and the other old imports no
longer resolve. A game that switched to the new names (§38) has nothing to do. A game that still says `web-scumm` moves
like this, then `npm run verify`:

```bash
npm uninstall web-scumm
npm install https://github.com/Quest-n-Click/quest-n-click/releases/download/v4.3.0/quest-n-click-4.3.0.tgz
npx quest-n-click migrate
```

`quest-n-click migrate` renames, in every source of the project (`node_modules`, `dist`, `public` and hidden folders
left out), the imports `web-scumm/…` to `quest-n-click/…`; in `tsconfig.json`, the path `web-scumm/*` and the
`node_modules/web-scumm/…` targets; in `package.json`, the scripts' commands (`web-scumm dev` becomes
`quest-n-click dev`, `web-scumm-bridge serve` becomes `quest-n-click-bridge serve`). Any string that starts with
`web-scumm/` in quotes is renamed, an import or not; `web-scumm-save` and the other format names are not. A
symbolic link out of the project, a `web-scumm` script beside a `quest-n-click` one, or a dependency on an old package
whose new one is not installed is said and left to you. `migrate --check` names what is left. The commands you type
change the same way: `npx web-scumm …` becomes `npx quest-n-click …`, and `npx web-scumm-bridge`,
`npx web-scumm-connector`, `npx web-scumm-studio-server`, `npx web-scumm-studio-worker` become
`npx quest-n-click-bridge`, `npx quest-n-click-connector`, `npx quest-n-click-studio-server`,
`npx quest-n-click-studio-worker`. By hand instead, from the project's folder, the imports in both quote styles in
`.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs` and `.cjs` files, names with spaces included (GNU and BSD `grep`
and `sed` alike), then `tsconfig.json` and `package.json` as §38 says:

```bash
grep -rl --null -E --include='*.ts' --include='*.tsx' --include='*.mts' --include='*.cts' --include='*.js' \
  --include='*.jsx' --include='*.mjs' --include='*.cjs' --exclude-dir=node_modules --exclude-dir=dist \
  --exclude-dir=public --exclude-dir='.*' "['\"]web-scumm/" * \
  | xargs -0 sed -i.bak -e "s#'web-scumm/#'quest-n-click/#g" -e 's#"web-scumm/#"quest-n-click/#g'
find . -name '*.bak' -not -path './node_modules/*' -delete
```

A host of the Bridge, the connectors or the Studio Server installs the `quest-n-click-…` archives and calls the new
commands in its unit files and scripts. A game on a hosted Studio that still imports `web-scumm/…` no longer loads
(its health is not green and its writes are refused) until its owner runs the engine's upgrade
(`POST /api/engine/migrate`, STUDIO-SERVER). The upgrade renames its imports first, as a revision of its own judged
only by whether the game loads (and, if it loaded before, by no new validator error), never by the solver: a game that
cannot be finished yet gets its imports renamed and loads again; then the schema's migration, if one is due, is judged
as before and may still be refused (422, the rename kept). The rename is not undoable (its undo would bring back
imports that no longer resolve): take a backup first to go back. The formats keep their names:
saves, sessions, runs, the stores, the headers and `WEB_SCUMM_*` are unchanged (§38).

**Check one thing**: a 4.2 text that holds, literally, `{hero}` or a brace group shaped like a switch
(`{word?…=…}`) is now filled when shown. `npm run validate` reports a switch-shaped group (a flag no command sets,
a malformed switch, or one in a text shown as written); a `{hero}` in a line is valid, so search for it
(`grep -rn '{hero}' games/<id>`). To keep the braces on screen, write them otherwise (`[hero]`, or `{word ? …}` with a
space before the `?`). A text with no such group shows exactly as before.

**The interface font** (#204). A game that sets no `skin.fonts.ui` now shows its dialogue, verbs and menus in
Galmuri11, a proportional pixel font, instead of DotGothic16; its `size-adjust` keeps the text at the same height, and
lines come out slightly narrower. Saves, sessions and runs are unchanged: the font is presentation, outside the
fingerprints. To keep the old look, set `skin: { fonts: { ui: 'DotGothic16' } }` in `game.ts` (a skin change: the
game's presentation fingerprint moves, so record its reference run again, if it keeps one). A game that already sets
`skin.fonts.ui` keeps its font; a character that font lacks now falls back to DotGothic16 (the Latin subset, then the
full font for Japanese) before `'Courier New'`. Look at a room with dialogue and a choice after upgrading, on a phone:
a line that just fitted may wrap differently.

**The Python tools** (#213): the asset tools and a hosted Studio's processing worker use Pillow 13.0.0; run
`python3 -m pip install -r requirements.txt` again. Their output does not change (the sample game's images come out
byte for byte the same); a host that installs the worker from `ops/studio/worker-requirements.lock` gets the new wheel
by its sha256.

<a name="from-4-3-0-to-4-3-1"></a>
<!-- applies: 4.3.1.. -->

## 40. From 4.3.0 to 4.3.1

Nothing to change: a game builds, plays and saves as on 4.3.0 (the same fingerprints, golden saves and reference
runs). The engine installs from `releases/download/v4.3.1/…`. What a game may notice:

- **Voices of a translation**: when a translation adds a text switch its source line has not (`Prêt{form?witch=e|*=} ?`
  for `Ready?`), `npm run voices -- import` now takes that language's clips by value, `status` no longer calls them
  orphans, and `npm run validate` warns when one is missing. A game that worked around the refusal by filing those
  clips under the plain id can file them by value now.
- **`npm run solve`** finds one winning path; `npm run solve -- --prove` checks every reachable state, every answer of
  an intro's choice included. A game whose heroes or paths must all reach the ending runs `--prove`. The witness's
  sentence now says "on one path"; a script that matched its old wording reads `status` from `--json` instead.
