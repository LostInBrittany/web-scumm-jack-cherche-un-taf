# Upgrade notes: 4.4

What 4.4.0 "Author's Desk" changed, kept unchanged. Nothing to change in a game; every addition is optional.

The upgrade itself is [Upgrade](install.upgrade.md). The section number is that of the former `docs/en/UPGRADING.md`
(§41).

<a name="from-4-3-1-to-4-4-0"></a>

## 41. From 4.3.1 to 4.4.0 "Author's Desk"

Nothing to change: a game builds, plays and saves as on 4.3.1 (the same fingerprints, golden saves and reference
runs). The engine installs from `releases/download/v4.4.0/…`. New, all optional:

- **`onTap: 'go'` on a hotspot** (#221): a single tap with no verb picked walks there and acts with its `defaultVerb`,
  as an exit can (CONTENT_GUIDE). Without it a tap only walks, as before.
- **A map place's `portrait` can be a list, and `joins: '<place>'`** (#223) puts a place on another's pin: one pin for
  a city with several places, a face per place (CONTENT_GUIDE, the map).
- **`games/heroes`**: the hero choice in two languages, to copy from. `npm run assets` now ships the clips of
  `audio.voicesByLang` (they were 404s in a translated page): run it again if your game has some.
- **The Studio**: the Voices tab's "Heroes × languages" view; the Check tab's "Capture the rooms (before / after)" on a
  local Studio. A hosted Studio: its worker runs previews in a lane of their own; new log fields and metrics
  (STUDIO-SERVER). The CLI and the MCP need the client scope and the realm role `offline_access` (STUDIO-SERVER).
- The first visit's JavaScript grew by about 1 KB: a game whose `assetBudgets.initialJsKB` sits at its measure may need
  1 KB more.
