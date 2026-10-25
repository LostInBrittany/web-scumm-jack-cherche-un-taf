# Upgrade notes: v3

The notes of the 3.x line, kept unchanged: a game that embeds the engine (3.1), line ids (3.2), list lines (3.3), the
stage (3.4), then the step from 3.x to 4.0. The section numbers are those of the former `docs/en/UPGRADING.md`, so a
reference such as "§38" still finds its section (the 4.x notes are on [4.1](install.upgrade-notes-4-1.md),
[4.2](install.upgrade-notes-4-2.md), [4.3](install.upgrade-notes-4-3.md) and [4.4](install.upgrade-notes-4-4.md)).

Read them with today's names: `web-scumm/content`, `npx web-scumm …` and `create-web-scumm` are
`quest-n-click/content`, `npx quest-n-click …` and `create-quest-n-click` since 4.2.5, and the old names no longer
work since 4.3.0 ([Coming from web-scumm](install.from-web-scumm.md)). The whole upgrade procedure is
[Upgrade](install.upgrade.md).

<a name="embedded-engine"></a>

## 8. A game that embeds the engine (a copy of `src/engine`)

Your `src/main.ts` no longer copies the bootstrap: it calls `bootGame` (`src/engine/boot.ts`) and says only what is
specific to your build:

```ts
import { bootGame } from '@engine/boot';
import { game, layouts, manifest, minigames, commands, locales } from '@game';

void bootGame({
  game, layouts, manifest, minigames, commands, locales, version: __ASSETS_VERSION__,
  dev: { enabled: (q) => import.meta.env.DEV && (q.has('dev') || q.has('edit')) },
  sw: { register: () => import('virtual:pwa-register') },   // or `sw: false` without vite-plugin-pwa
});
```

`bootGame` picks the language (`?lang=`, the player's saved choice, the browser), waits for the fonts, opens the
verified IndexedDB store (its early errors reach the App once it exists; without IndexedDB the verified
`localStorage` adapter takes over), builds the `App`, exposes `window.__game` for the e2e drivers, starts the dev
tools when `dev.enabled` says so (`dev.patch` can replace the game, the layouts and the store first, as the Studio
demo does), shows the title, and registers the service worker through the module you inject, with the update offered
only after a verified save. The pieces are exported on their own (`pickLanguage`, `waitFonts`, `openStore`) when a
game needs a different order.

What else your build keeps: `vite.config.ts` with `server.host` on `127.0.0.1` unless `WEB_SCUMM_LAN=1`, the layout
writer and every `/__studio` route behind `authorizeStudioRequest` (`tools/studio/security.ts`), and VitePWA with
`registerType: 'prompt'`, `injectRegister: false`, `skipWaiting: false` (mandatory with the update prompt);
`package.json` with the scripts of section 7 (`tools/doctor.ts`, `tools/serve.ts`, `scripts/e2e-pwa.mjs`);
`scripts/e2e/lib.mjs` (`E2E_BROWSER`, `--prod`; a script that reads the human output of `npm run solve` keeps working);
`env.d.ts` with `/// <reference types="vite-plugin-pwa/client" />`. The engine's `game` is a compiled clone
(`compileGame`), frozen when `schemaVersion` is 3: a tool that mutated the object it passed to `Engine` must go
through the engine's API.

<a name="line-ids"></a>
<!-- applies: 3.2.0.. -->

## 9. Line ids (3.2): translations and voices that survive an insertion

Every `say`, `toast` and `guide` can carry a stable `id` (`house.open-door.l-just-a-door`: its owner, then the
start of its text). A translation table and a voice clip are then keyed by it: inserting, moving or deleting a line
never shifts the others. `npm run ids -- --lines --write --map` gives the ids to the objects that lack them and renames
the keys of `locales/*.json` (a second pass renames from the current paths, nothing already recorded in
`ids.migration.json` / `ids.paths.json` is lost); `--lines=all` first turns every plain string line into
`{ say: ['hero', text], id }`: required for a game that ships a language other than its own (`game.lang`, default
`en`) or has voices; the sample game did it in 3.2.1. `audio.voices[<line id>]` plays without writing `voice` on the
line. `npm run validate -- --release` reports a line without an id (an error, plain strings included, in a translated
or voiced game: run `--lines=all` once; a warning otherwise);
`npm run i18n -- voices` lists the lines with an id and no clip, and the clips no line claims.

<a name="list-lines"></a>
<!-- applies: 3.3.0.. -->

## 10. List lines (3.3): looks, hints, fallback answers and reactions by kind

The lines the engine draws from a list (a look list, a hint's lines, `rules.fallbacks.<verb>`) can be `{ id, text }`
instead of a plain string, a hint can carry an `id`, and so can a reaction by kind (`rules.kinds[i]`). Their
translations are then keyed by the id (`room:house/look.pantry.<id>`, `room:house/hints.<hint id>.lines.<id>`,
`item:key/look.<id>`, `rules/fallbacks.look.<id>`, `rules/kinds.<id>.say`), and `audio.voices[<id>]` voices them.
`npm run ids -- --lines=all --write --map` converts the plain strings of lists in `rooms/*.ts`, `items.ts`,
`rules.ts` and `game.ts`, names hints and kinds, and renames the keys of `locales/*.json` (`--lines` alone only adds
ids to the objects that have none). A single look line (`look: { door: '…' }`) is keyed by its owner already and
stays a string. A translated or voiced release requires them, like `say` lines (`validate -- --release`). The Studio
edits a `{ id, text }` line at the same path as a plain one (`look.pantry[1]`). The sample game: 109 ids, 91
translation keys renamed per language, French still 400/400.

<a name="stage"></a>
<!-- applies: 3.4.0.. -->

## 11. The stage (3.4): nothing to rewrite

A room's `decor` is its backdrop layer and its layout's `walk` is the walk zone `main` (`stageOf`, src/engine/core/
stage.ts): an old room keeps its picture (`npm run e2e:visual`) and its saves (a stage adds nothing to the state).
Layers, occluders, lights, particles, several walk zones and their links are added when a room needs them (CONTENT_GUIDE
"The stage"). A layout with both `walk` and `walkZones` keeps the zones (`validate` warns).

<a name="from-3-x-to-4-0"></a>
<!-- applies: 4.0.0.. -->

## 10. From 3.x to 4.0

4.0 changes no format: the authoring schema stays 3, the save envelope stays schema 3, and every 3.x save loads.
What changes is what is promised ([Stability and support](start.stability.md)):

1. **Import from the public API.** `web-scumm/content` (`defineGame`, `defineRoom`, every content type),
   `web-scumm/player` (`bootGame`, `AssetManifest`), `web-scumm/minigames` (`Minigame`), `web-scumm/testing` (`Engine`,
   `solve`, `parseSave`…). The `@engine/*` paths keep working but are internal. In a game of this repository:
   `sed -i.bak -E "s#'@engine/core/(types|define|custom)'#'web-scumm/content'#" games/<id>/*.ts games/<id>/rooms/*.ts`, then the others by
   hand ([Public API](engine.api.md) says which name is in which entry).
2. **A game in its own project** ([Package reference](install.package.md)): `npx create-web-scumm`, move `games/<id>/*` into `game/`,
   `npm install`, `npx web-scumm verify`.
3. **`RevealDef`** is deprecated: use `EndingDef` (removed in 5.0).
4. `npx web-scumm migrate --check` (or `npm run migrate -- --check` here) says whether anything is due.
