# Features

What quest'n'click does, as of 4.4.0, grouped by what you want to do, each with the page that says more. What each
feature promises, and how far it is proven: [Stability and support](start.stability.md#surfaces). What it does not do:
[What quest'n'click does not do](index.not-supported.md).

<a name="playing"></a>

## For players

- **A classic point-and-click interface**: verbs, a bag, a sentence line; a double tap acts with the verb you mean; a
  key per verb when the game gives one ([Controls](play.controls.md)).
- **Phone and desktop**: landscape on a phone, the classic layout with a mouse; the whole game at the keyboard
  ([Accessibility](play.accessibility.md)).
- **Installs and plays offline**: a PWA that caches the whole game after the first visit and says when it is complete
  ([Install the game as an app](play.install-app.md)).
- **Autosave and save slots**, with export and import as a file ([Saves](play.saves.md)).
- **Settings**: text speed and size, reduced motion, a readable font, sound captions, volumes, the language
  ([Settings](play.settings.md), [Languages](play.languages.md)).
- **Speedruns**: categories, an in-game clock, splits, a ghost, a sealed proof, OBS and LiveSplit
  ([Speedrun for players](play.speedrun.md)).

<a name="further"></a>

## In a game

- **Several playable characters**, and since 4.3.0 the hero chosen at New Game among any number, with portraits, a
  name per hero and lines that follow the hero ([Heroes](create.heroes.md)).
- **A world map**, its places unlocked by the story; since 4.4.0 one pin can hold several places
  ([World map](create.world-map.md)).
- **Minigames** playable by touch or keyboard (pick, hide, pipes, runner, stroke, scratch, cables, the code wheel), and
  your own ([Built-in minigames](create.minigames.md)).
- **Cutscenes and phone calls**, scripts and events that make the world act without a tap, characters that walk and
  patrol ([Scripts and events](create.scripts-events.md), [Moving characters](create.moving-characters.md)).
- **Staging**: wide rooms and a camera, animations with frame events, layers, masks, lights, particles, walk zones and
  links ([Staging](create.staging.md), [The stage](create.stage.md)).
- **Music in stems** that follows the game's state, sound effects from one palette, recorded voices per language and
  per hero ([Music in stems](create.music.md), [Voices](create.voices.md)).
- **Remix**: worlds generated from a seed, each one validated and solved before it ships; a daily challenge and mystery
  worlds with a Bridge ([Remix](create.remix.md)).
- **Speedrun**: runs recorded, sealed and verified by a replay; leaderboards on the Bridge
  ([Speedrun for authors](create.speedrun.md)).
- **Reality**: a game reacts to a fact from the world (an email answered, a terminal command, a badge) through a signed
  signal from a Bridge, without its content touching the network ([The Reality Bridge](bridge.what-it-is.md)).

<a name="making"></a>

## For authors

- **Content as data**, in TypeScript objects with no code; custom commands as trusted code named in the game
  ([Content principles](create.principles.md), [Custom code](create.custom-code.md)).
- **Checked before anyone plays**: the validator finds broken references, unreachable rooms and untranslated lines; the
  solver runs the real engine to find a winning path (`npm run verify`) or to prove every reachable state can finish
  (`solve --prove`) ([Checking your game](create.checking.md), [What the solver proves](create.solver-proofs.md)).
- **Replayed**: a session reproduces a tester's game exactly ([Playtests](create.playtests.md)).
- **Art, sound and languages**: a prompt for every sprite sheet, sheets cut into sprites, chip-tune music arranged from a
  MIDI, every line translatable ([Images](create.images.md), [Translations](create.translations.md)).
- **Shipped**: a static site with a download budget and every file accounted for with its licence
  ([Build and release](create.build-release.md), [Asset provenance](create.asset-provenance.md)).
- **The local Studio**: the real engine with an editor on top, the storyboard, the assets, the checks after every save,
  a play tab that explains a rule and replays a session, the hero × language matrix, an assistant with your own key
  ([The local Studio](studio.overview.md)).
- **Working with an AI**: every operation is a command and an MCP tool ([Working with an AI](create.working-with-ai.md)).

<a name="teams"></a>

## For teams and operators

- **The hosted team Studio** (experimental): one game, several people behind OpenID Connect, spans and leases,
  previews per revision, comments, a semantic diff, Git, a remote MCP for agents, backups and restores; documented for
  Clever Cloud ([What runs where](team.what-runs-where.md), [Clever Cloud overview](clever.overview.md)).
- **The Reality Bridge**: on SQLite (stable) or Postgres (experimental), several tenants, backups, leaderboards; four
  connectors (experimental) ([Install and run the Bridge](bridge.install-run.md)).

<a name="in-numbers"></a>

## In numbers

Measured on the release commit by the automated gates (`npm run quality:baseline` writes them into the READMEs):

> [!MEASURE id=in-numbers]
> 2945 unit test declarations, run on Node 22 and 24, with coverage floors and gated mutation testing; the reference
> game proved in 288 states; the player's first visit at 136 KB of JavaScript, gzipped.
> - date: 2026-10-22
> - version: 4.4.0
> - volume: the engine repository's unit suite; the reference game (`games/reference`); the sample game's built first visit
> - conditions: `npm run quality:baseline` on the release commit, figures written into the README
> - source: [README.md, "In numbers"](https://github.com/Quest-n-Click/quest-n-click/blob/c00b44fcffe56ffa99f9d2228297414ebe3145ac/README.md)

> [!MEASURE id=hosted-preview-time]
> On the hosted Studio, from a write to a ready preview: median 17.8 s before 4.4.0's changes, 5.6 s after; maximum
> 26.0 s, then 11.7 s. Ten revisions per series: an order of magnitude, not a distribution.
> - date: 2026-10-22
> - version: 4.4.0
> - volume: ten revisions per series (revisions 436 to 445, then 446 to 455), one note every 40 s
> - conditions: the reference deployment on Clever Cloud's test organisation, the smallest plans
> - source: [QUALIF-4.2.3-REFERENCE.md §6](https://github.com/Quest-n-Click/quest-n-click/blob/c00b44fcffe56ffa99f9d2228297414ebe3145ac/docs/dev/QUALIF-4.2.3-REFERENCE.md)

Each release is built from the commit its candidate tested. The candidate makes the four package archives, the Bridge's
image, the SBOMs, the runs and the baseline, and the release publishes those very files; the release itself makes only
the built game, its assets manifest, the proved Remix catalogues, the reference speedrun and the sums, from the same
commit. Every file is published with its SHA-256 sum and a provenance attestation
([the list](../../tools/release/artifacts.mjs), [Releasing](contribute.releasing.md)).

<a name="references"></a>

## References

- [Gallery](start.gallery.md): screenshots of the game and the Studio.
- [What quest'n'click is](start.what-it-is.md), [Roadmap](start.roadmap.md).
