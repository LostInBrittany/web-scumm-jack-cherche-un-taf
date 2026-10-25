# What quest'n'click is, and its web-scumm history

![The Quest'n'Click logo: a pixel-art editor window with a harbour scene, a dialogue graph and a pointer, among picture cards, a treasure map, an AI panel, a notebook of puzzle diagrams and a coffee mug, under the words Quest'n'Click, Open source point & click engine](../images/start/logo.png)

*The logo: the words "quest'n'click, Open source point & click engine" under a pixel-art editor window.*

**quest'n'click makes a point-and-click adventure for the browser: you write it as data, shape it in a visual Studio,
check that it can be finished, and ship it as a web game that installs on a phone and plays offline.** It is an
engine, its tools, a local Studio, a hosted Studio for a team, and a Reality Bridge, all open source (code under MIT).

<a name="what-you-can-do"></a>

## What you can do with it

| | |
|---|---|
| **Play** | *The Pantry Key*, the sample game, on a phone in landscape or on a desktop: [quest-n-click.cleverapps.io/demo](https://quest-n-click.cleverapps.io/demo/) |
| **Try the Studio** | The Studio in demo mode: edit the sample game, your edits stay in your browser ([Play online and try the demo Studio](start.play-online.md)) |
| **Make your own game** | In its own folder, from a release's archive ([Install from the release archive](install.from-archive.md)), then a first room in fifteen minutes ([Your first game](create.first-game.md)) |

![The Pantry Key: Grandma's living room, with a grandmother and a cat on a rug, the nine verbs on the right (Give, Open, Close, Pick up, Look at, Talk to, Use, Push, Pull), an empty bag below them, and the sentence line "Walk to" under the scene](../images/start/4119-hero.webp)

*The Pantry Key, Grandma's living room: the scene on the left, the nine verbs and the bag on the right, the sentence
line "Walk to" below. Captured at 4.1.19.*

In one sentence per part:

- **The content is data**: rooms, props with states, characters, items, rules, conversations, hints, scripts and
  events are plain TypeScript objects with no code in them, so every tool can read, check and play them
  ([Content principles](create.principles.md)).
- **The Studio is the real engine with an editor on top**: rooms and their placements, the storyboard, every sprite
  sheet and where it is used, the checks after every save ([The local Studio](studio.overview.md)).
- **The solver runs the real engine** to find a winning path, or to prove that every reachable state can still finish
  ([What the solver proves](create.solver-proofs.md)).
- **The game ships as a static site and a PWA** that installs and plays offline
  ([Build and release](create.build-release.md)).

The full list: [Features](start.features.md). What it does not do: [What quest'n'click does not do](index.not-supported.md).

<a name="history"></a>

## Formerly web-scumm

The project was called **WebSCUMM**, then **web-scumm**, in homage to SCUMM, the LucasArts engine whose spirit it
follows. It was renamed **quest'n'click** in 4.2.5 (20 October 2026, decision D47) so its name would spark no needless
debate. What that means today:

- The repository is `Quest-n-Click/quest-n-click` since 4.5.2, in the Quest-n-Click organization; links to the older
  ones (`wanoo/quest-n-click`, `wanoo/web-scumm`) redirect there. The old demo addresses, `wanoo.github.io/web-scumm`
  and `wanoo.github.io/quest-n-click`, were GitHub Pages, abandoned in 4.5.2: the demo is on the project's website,
  [quest-n-click.cleverapps.io/demo](https://quest-n-click.cleverapps.io/demo/).
- From 4.2.5 the packages and commands are named `quest-n-click`. The old `web-scumm` names kept working through 4.2.x
  and are gone in 4.3.0, where `npx quest-n-click migrate` renames a game's imports and commands
  ([Coming from web-scumm](install.from-web-scumm.md)).
- From 4.5.2 the packages are named under the npm organisation's scope: `@quest-n-click/engine`,
  `@quest-n-click/create`, `@quest-n-click/bridge`, `@quest-n-click/connectors`, `@quest-n-click/studio-server`
  ([Package reference](install.package.md)). The commands keep their names (`quest-n-click`, `quest-n-click-bridge`…);
  `npx quest-n-click migrate` moves a game's `quest-n-click/…` imports to `@quest-n-click/engine/…`.
- Saves, runs and sessions keep their formats and load as before: identifiers such as `web-scumm-save` or the
  `web-scumm-saves` database are parts of the formats, not names of the project, and they stay.

The engine grew alongside the maintainer's own private game, which embedded a copy of it and was replayed at each
milestone; that game stays on engine 3.1.0 (D8). The road
from v1.3 to today: [Roadmap](start.roadmap.md).

<a name="how-it-is-made"></a>

## How it is made

The engine repository, top level:

```
src/engine/       core (the DSL, the engine), tools (validate, solve, lint, i18n…), dom (the player), minigames, reality
src/studio/       the Studio's pages
games/demo/       the sample game: rooms, layouts, art, audio, locales, storyboard
games/            also _template (copied for a new game), heroes, reference, signals
tools/            the commands, the Studio's server side, the MCP server, the art and audio pipelines, the Vite plugins
cli/              the quest-n-click and create commands of the package
studio-server/    the hosted team Studio (the package @quest-n-click/studio-server)
bridge/           the Reality Bridge (the package @quest-n-click/bridge)
connectors/       the connectors of the world outside (the package @quest-n-click/connectors)
ops/, clevercloud/ deployment and qualification scripts
scripts/          build, end-to-end, packaging and release scripts
tests/            the unit and property tests
wiki/             this documentation, in English and French
docs/             the documentation before 4.5; docs/dev: the work log, the decisions, the ADRs, each release's passes
```

The engine, the solver and the replay share one code path; [Architecture](contribute.architecture.md) and a half-hour
[code tour](contribute.code-tour.md) explain how it fits together. The layout of a game project and of this
repository, with the scripts each has: [Project layout](create.project-layout.md).

<a name="made-with-ai"></a>

## Made with an AI assistant, reviewed by people

The content is declarative, so an assistant reads and writes it like any other file (`AGENTS.md` holds the rules).
Every operation is a command and an MCP tool, and after each change an assistant can validate, solve, replay and take a
screenshot, so it sees its own mistakes before a person does. Every result stays reviewable, in the Studio and in Git.
See [Working with an AI](create.working-with-ai.md) and, to change the engine,
[Contributing with AI agents](contribute.ai-agents.md).

<a name="why"></a>

## Why it is built this way

One person, with any AI, should be able to make a complete, long game and know it can be finished. That asks for
content a machine can read whole (data, not code), one state a save holds whole, a solver that plays the real engine
rather than a second model of it, and a result that is just a web site. The alternatives set aside, and why, are in
[What quest'n'click does not do](index.not-supported.md#why) and the [Roadmap](start.roadmap.md#out-of-scope).

<a name="affiliation"></a>

## Not affiliated

quest'n'click (formerly web-scumm) is an independent project. "SCUMM-style" names a kind of game; the project is not
affiliated with, endorsed by or derived from LucasArts, Lucasfilm, Disney or the ScummVM project, and ships none of
their code, data or art. Licences: code MIT; the sample game's art, sound effects and theme CC BY 4.0 (attribution
"Wano"); fonts SIL OFL ([Licences and credits](contribute.licences.md)).

<a name="decisions"></a>

## Decisions and ADRs

- D47 (the new name), D8 (the private game frozen on 3.1.0): [`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md).
- [ADR 0002](../../docs/dev/adr/0002-declarative-content.md) (declarative content),
  [ADR 0003](../../docs/dev/adr/0003-solver-runs-the-engine.md) (the solver runs the engine).
