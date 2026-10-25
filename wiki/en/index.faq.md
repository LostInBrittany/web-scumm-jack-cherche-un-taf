# FAQ by audience

The questions people ask most, by who asks them, each answered in a line or two with the page that says the rest. The
answers hold for the release this documentation belongs to, named at the foot of every page. Can't find yours? Search this wiki, or see [What quest'n'click does not do](index.not-supported.md).

<a name="players"></a>

## Players

- **Where can I play?** The sample game is at [quest-n-click.cleverapps.io/demo](https://quest-n-click.cleverapps.io/demo/),
  on a phone in landscape or a computer ([Play online](start.play-online.md)).
- **How do I play?** Tap a verb, then a thing; a double tap acts without a verb; the whole game plays at the keyboard
  too ([Controls](play.controls.md)).
- **Can I play offline, on an iPhone?** Yes: open it online in Safari, Share › Add to Home Screen, and wait for the
  pause menu to say the whole game is cached. No person has tried this on a real iPhone yet
  ([Install the game as an app](play.install-app.md)).
- **Where are my saves, and can I move them?** In your browser, on that device only. Export a save as a file and
  import it elsewhere ([Saves](play.saves.md)).
- **My save won't load. / There is no sound. / I still see the old version.**
  [Player troubleshooting](play.troubleshooting.md).
- **What does the game keep about me?** Nothing outside your device, unless the game uses a Reality Bridge or online
  leaderboards ([Privacy](play.privacy.md)).
- **Is it accessible?** Tested at the keyboard and with axe-core; not a WCAG claim, and no screen-reader pass by a
  person yet ([Accessibility](play.accessibility.md)).
- **Can I speedrun it, with LiveSplit or OBS?** In a game that declares categories, yes
  ([Speedrun for players](play.speedrun.md)).

<a name="authors"></a>

## Authors

- **How do I start my own game?** Install the engine from a release's archive into its own folder, then follow the
  first-game tutorial ([Install from the release archive](install.from-archive.md), [Your first game](create.first-game.md)).
- **Can I `npm install @quest-n-click/engine`?** Not yet: no release has published the packages on npm; each release attaches
  them as archives ([Stability and support](start.stability.md#releases)).
- **Where do I run this command?** Each command in this wiki says first its folder and context: the engine repository
  or a created project, with different scripts ([Project layout](create.project-layout.md),
  [npm scripts](reference.npm-scripts.md)).
- **I want the guard to patrol.** Scripts and moving characters ([Moving characters](create.moving-characters.md)).
- **Flag or event?** A flag is state that stays; an event fires and is gone
  ([Flags, variables and events](create.flags-variables-events.md)).
- **The solver finds an ending: have I ruled out every softlock?** No: `npm run verify` finds one winning path; only
  `solve --prove` explores every reachable state ([What the solver proves](create.solver-proofs.md)).
- **Can I update the engine without losing my players' saves?** Saves of any 3.x or 4.x release load in every later
  4.x; your own content changes need a migration ([Upgrade](install.upgrade.md),
  [State and saves](create.state-saves.md), [Stability and support](start.stability.md#saves)).
- **My game works locally but not under a sub-path.**
  [Sub-path, cache and service worker](create.deploy-issues.md).
- **Can I export to Steam, or make it multiplayer?** No ([What quest'n'click does not do](index.not-supported.md)).
- **Can I work with an AI?** Yes: every operation is a command and an MCP tool, and this wiki is readable through
  `search_docs` and `read_doc` ([Working with an AI](create.working-with-ai.md)).
- **What is stable?** The content format and its tools, the desktop Chromium PWA, the Bridge on SQLite and the public
  API; the rest is limited or experimental ([Stability and support](start.stability.md)).

<a name="admins"></a>

## Admins of a team Studio

- **Where can I host the team Studio?** It is documented for Clever Cloud only
  ([Clever Cloud overview](clever.overview.md)); it is experimental.
- **I get a 423. / I get a 409.** [Span locked (423)](team.write-refused-423.md),
  [Stale base revision (409)](team.write-refused-409.md).
- **How do I restore the Studio on an empty database?** [Restore drill](clever.restore-drill.md).
- **How do I rotate `STUDIO_SESSION_KEY`?** [Rotating keys](clever.key-rotation.md); every variable:
  [Environment variables](reference.environment-variables.md).
- **I lost owner access.** [Recovering admin access](clever.admin-recovery.md).

<a name="contributors"></a>

## Contributors

- **How do I set up the repository?** [Developer setup](contribute.setup.md).
- **What must pass before a pull request?** [Before a pull request](contribute.before-a-pr.md).
- **A mutation survivor, a red coverage ratchet?** [Mutation testing](contribute.mutation-testing.md),
  [The coverage ratchet](contribute.coverage-ratchet.md).
- **How do I write a page of this wiki?** [Writing documentation](contribute.writing-docs.md).

<a name="old-links"></a>

## Old links and old names

- **I have an old link to `docs/en/CONTENT_GUIDE.md` (or another `docs/` page).** Since the switch-over to this wiki
  (4.5.0), each old page is a transition page that keeps every old anchor and links to its new pages, with a fallback
  to the 4.4.0 text:
  [`blob/v4.4.0/docs/en/CONTENT_GUIDE.md`](https://github.com/Quest-n-Click/quest-n-click/blob/v4.4.0/docs/en/CONTENT_GUIDE.md).
  The MCP call `read_doc {name: "CONTENT_GUIDE"}` keeps working.
- **What was web-scumm?** This project's former name, until 4.2.5 ([What quest'n'click is](start.what-it-is.md#history),
  [Coming from web-scumm](install.from-web-scumm.md)).

<a name="documentation"></a>

## Where the documentation is

This wiki replaces the pages of `docs/en` and `docs/fr`. Every page exists in English and French, and `npm run wiki -- check`
keeps the two in step (the same sections, links, steps and blocks): the first-room tutorial
([Your first game](create.first-game.md)), the working loop from the first idea to the release
([The working loop](create.working-loop.md)), every command ([npm scripts](reference.npm-scripts.md)), moving to a new
version ([Upgrade](install.upgrade.md)), and where the project comes from ([Roadmap](start.roadmap.md)). What changed
in each release is in the [changelog](reference.changelog.md). The development documentation (decisions, ADRs, plans,
each release's passes) stays in [`docs/dev`](../../docs/dev/DECISIONS.md), in English: public, written for maintainers.

<a name="current-release"></a>

## What is in the current release

The current release is the one at the foot of this page, and the newest on
<https://github.com/Quest-n-Click/quest-n-click/releases/latest>; [Stability and support](start.stability.md#releases) lists
the lines and how long each is supported. This answer does not name it, so it does not go stale at the next release.
The recent ones, newest first:

**4.5.0 "Wiki"** (23 October 2026): this documentation, in English and in French, published as the GitHub wiki and on
Pages from the release's own archive; `search_docs`, `list_docs` and `read_doc {id, section}` for an assistant.
**4.4.0 "Author's Desk"** (22 October 2026): a playable example of choosing the hero in two languages
(`games/heroes`), the Studio's hero × language matrix, before/after captures in the semantic diff (on a local Studio),
a faster hosted preview, a hotspot that acts on a single tap and a map pin with several places (from Horacio,
LostInBrittany), the phone's column on a short landscape screen.

Before them: **4.3.1** gave a translation's own text switches their voices through the whole chain, and says
`npm run solve` finds one winning path (`--prove` proves every hero). **4.3.0 "Hero Choice"**: the player chooses the
hero at New Game, a key per verb, a proportional pixel font for the interface, most of it from an outside contributor;
the former `web-scumm` names are gone (`npx quest-n-click migrate`). **4.2.5**: the new name. **4.2.4**: an exit gone
through on a single tap, `actorGap`, the sprite sheets' background, `face: 'hero'` fixed. **4.2.3 "Coordination"**: the
Studio online for a team, experimental: previews per revision, health, personal undo, published builds, backup and
restore, a scenario map, anchored comments, a diff by name, AI agents through a remote MCP, Git push and import, the
hosted Assets tab. **4.2.0 "Stable World"** restored strict SemVer after the 4.1.x line, and shipped before the people's
passes: only its stable surfaces are promised ([Stability and support](start.stability.md#v420)).
