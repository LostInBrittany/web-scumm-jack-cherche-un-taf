# What quest'n'click does not do

A plain list of what the engine, its tools and its servers do not do, as of 4.4.0, each with its reason and, when there
is one, the nearest thing that exists. If you searched for a feature and landed here, it is not in the product: no
other page will describe it.

<a name="multiplayer"></a>

## Real-time multiplayer

**Not supported.** A game has one player at a time: its state lives in one browser, on one device. "Several playable
characters" means one player switching between characters, not several people. What exists nearby, and is not
multiplayer:

- the **Reality Bridge** delivers signed signals from the world outside (an email answered, a terminal command, a
  badge) to a game; it does not connect players to each other ([The Reality Bridge](bridge.what-it-is.md));
- **speedrun leaderboards** on a Bridge are asynchronous: runs are submitted, verified and ranked after the fact;
- the **hosted team Studio** lets several authors edit one game together; it is an editor, not a game
  ([What runs where](team.what-runs-where.md)).

<a name="export"></a>

## Export to Steam, consoles, app stores or a native app

**Not supported.** `npm run build` writes `dist/`, a static web site any host serves, and the game installs from the
browser as a PWA ([Install the game as an app](play.install-app.md)). There is no packaging for Steam, consoles, the
App Store or Google Play, and no native desktop wrapper. What exists: [Build and release](create.build-release.md),
[GitHub Pages](create.github-pages.md), [Clever Cloud](create.clever-static.md), [other static hosts](create.other-hosts.md).

<a name="3d-physics"></a>

## 3D, Phaser, a physics engine

**Not supported, by decision (D10).** The scene is 2D, drawn by the DOM painter (the reference) or the Canvas 2D painter
(experimental). WebGL would be used only for an effect Canvas 2D measurably cannot hold, and none has been measured
(ADR 0012). The stage's motions (`launch`, `spring`, `path`, `follow`) are presentation only, closed forms of time, not
a physics simulation ([The stage](create.stage.md)).

<a name="real-time"></a>

## A real-time world

**Not supported.** Scripts advance between the player's actions, never during one, a cutscene, a conversation or a
minigame; animations and loops are the real-time layer. Action sequences belong in a minigame
([Built-in minigames](create.minigames.md), [A custom minigame](create.custom-minigame.md)).

<a name="camera"></a>

## A free camera

**Partly.** The camera pans horizontally in a wide room (it follows the hero or moves on a command). Since 3.4 a walk
zone may also zoom in, from 1× to 2×, and the view then follows the hero vertically too. There is no free vertical pan
and no rotation. (The old classics page listed "zoom, a camera that moves on two axes" as out of scope; the zone zoom
has existed since 3.4.) See [Geometry](create.geometry.md).

<a name="dialogue-format"></a>

## A second dialogue format

**Not supported, by decision.** Topics, `choice` and `if` are the dialogue graph; the Studio draws it as a tree. A
parallel format would duplicate the DSL and break the solver, the MCP and the prompts ([Dialogues](create.dialogues.md)).

<a name="input"></a>

## Portrait mode, gamepad, key remapping

- **Portrait on a phone**: not supported; the game plays in landscape and asks to rotate the phone.
- **A gamepad**: it does not play the game; only the Remix code wheel reads one.
- **Remapping keys**: not supported; a game may give its verbs letters, and the player can turn them off.

See [Controls](play.controls.md).

<a name="saves-accounts"></a>

## Accounts, cloud saves, analytics

**Not supported.** There is no player account, no save synchronised between devices, and no analytics or tracking in
the engine: saves stay in the browser, and a save moves as an exported file ([Saves](play.saves.md#export-import),
[Privacy](play.privacy.md#overview)).

<a name="voices-text"></a>

## Speech synthesis, automatic translation, right-to-left text

**Not supported.** A voice exists only where someone recorded it; a translation is written by a person (or an AI) into
the locale files; the engine sets no right-to-left text direction ([Languages](play.languages.md)).

<a name="claims"></a>

## Claims the project does not make

- **WCAG conformance**: the engine is tested at the keyboard with no serious or critical axe violation on the screens
  checked; no person has made a screen-reader pass yet ([Accessibility](play.accessibility.md#checked)).
- **Anti-cheat**: a speedrun's proof shows a run is possible and unaltered, not that its player was honest
  ([Speedrun for players](play.speedrun.md#limits)).
- **"Proved" when a budget was cut**: `npm run verify` finds one winning path; only `solve --prove` explores every
  reachable state, and a truncated search is said ([What the solver proves](create.solver-proofs.md)).

<a name="bridge-limits"></a>

## On the Bridge and the connectors

Not in the Bridge as of 4.4.0: retention on a SQL store (it keeps every signal), row-level security per tenant in
Postgres, a rate limit per connector shared between instances. The connectors have not been tried against a real email
provider, a real badge issuer or a controlled exposure of SSH and Telnet, and the `distributed` profile has no real
deployment: both stay experimental. The connectors send no email reply and do not check DKIM or SPF; the IMAP client
speaks TLS from the first byte (no STARTTLS, no IDLE). The reference Bridge is sized for a game, a developer, an event
or a small studio's games ([Guarantees](bridge.guarantees.md)).

<a name="hosting"></a>

## Hosting the team Studio elsewhere than Clever Cloud

**Not documented.** The hosted Studio is documented for Clever Cloud only, in detail (D50). It is a Node.js server with
PostgreSQL, an S3 bucket and an OpenID Connect provider, and nothing in it is specific to one host, but no other host
has a procedure or a verified deployment ([Clever Cloud overview](clever.overview.md)).

<a name="tooling"></a>

## Audio tooling

Furnace, the tracker that renders the music, is downloaded by `npm run audio -- setup`, never bundled (GPL-2.0); CI
renders no audio (the files are committed). Lip-sync markers in the voice table do not exist.

<a name="not-yet"></a>

## Not yet

- **`npm install @quest-n-click/engine`**: the packages are not on npm; the engine installs from a release's archive
  ([Install from the release archive](install.from-archive.md)).
- The rest of what is planned or left for later: [Roadmap](start.roadmap.md#open-items).

<a name="why"></a>

## Why these limits

The project's goal is that one person, with any AI, makes a complete point-and-click game for the browser and proves
it can be finished. Each limit above keeps that promise checkable: content that stays data, one state a save holds
whole, a solver that runs the real engine, a game that is a static site. A feature that would need a server for every
game, a second model of the content or a real-time loop is left out rather than half supported.

<a name="decisions"></a>

## Decisions and ADRs

- D10 (no Phaser, no general physics engine), D18 (the 4.1.x programme), D38 (what 4.2.0 promises), D50 (Clever Cloud
  only for the hosted Studio's documentation): [`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md).
- [ADR 0012](../../docs/dev/adr/0012-canvas-backend.md): Canvas 2D stays the complete backend.
- [Stability and support](start.stability.md): what is promised, surface by surface.
