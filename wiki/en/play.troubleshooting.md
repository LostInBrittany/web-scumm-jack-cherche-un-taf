# Player troubleshooting

Four things players run into with a quest'n'click game in a browser: no sound, a save that will not load, an offline
copy that is incomplete, and an update that does not show. Each section starts from what you see.

<a name="symptom"></a>

## Symptoms

| What you see | Section |
|---|---|
| No music, no sound effects, or no voices | [No sound](#no-sound) |
| "Save failed", "save belongs to game …", "save version … cannot be migrated …", Continue starts a new game | [A save that will not load](#save-will-not-load) |
| The pause menu's Offline row shows ⚠, or a room asks for the network in airplane mode | [Offline incomplete](#offline-incomplete) |
| The game was updated, and you still see the old version | [An update that does not show](#update-not-showing) |

<a name="no-sound"></a>

## No sound

The game stays silent: you hear nothing, no music, no sound effects, no voices.

**Possible causes**, the most frequent first:

1. **The page has not been touched yet.** Browsers let a page play sound only after you interact with it: the game
   unlocks its sound at your first tap, click or key press. Until then the title screen is silent.
2. **Sound is switched off in the game**: the sound button among the tools turns music and effects off together; the
   pause menu has separate **Music** and **Sound** rows; the settings have volumes, and 0 % is silent.
3. **The device is muted**: the volume, or on an iPhone the ring/silent switch, which can silence web pages.
4. **No voice in your language**: in a translated game, a line without a recorded clip in that language plays no voice
   ([Languages](play.languages.md#voices)). Before 4.4.0, a translation's clips were not shipped at all.

<!-- step: fix-sound -->
**Fix.** Tap the scene once. Open the pause menu and check that **Music** and **Sound** say on, then the settings'
volumes. Check the device's volume and silent switch. Reload the page if the sound still does not come.

<a name="save-will-not-load"></a>

## A save that will not load

| Message | Cause | Fix |
|---|---|---|
| "Save failed" (with the browser's reason) | The browser refused to write: storage full, a private window, a blocked site storage | Free some space, leave private browsing, then play on; export a save you care about |
| "save belongs to game "x", not "y"" | You imported another game's file | Import it into the game it came from |
| "save version 5 cannot be migrated to 4" | The save is newer than this copy of the game (made after an update, imported into an older copy) | Update the game ([below](#update-not-showing)), then import again |
| "state.room: unknown current room …", "state.active: unknown active player …", or a format error | The file is damaged, or the game no longer has the room you saved in (or the hero you played): such a save is refused, while a room the author renamed with a migration still loads | Load an earlier slot or an exported file; the game you are playing is not touched; tell the game's author if a new version removed the room |
| "this save was played in another world (seed …)" | A Remix save, made in another world | Let the game open that world, or keep the current one |
| "this save belongs to another link" (a Reality game) | The save was linked to another player on the Bridge: nothing is applied | Pause menu › the link's row › **Use this link with this save**, or keep playing unlinked |
| "Save adjusted for this version: …" | Not an error: a newer version of the game no longer has something the save named (an item, a place, a visited room), not the room you are in; the save loaded without it | Play on |
| Continue starts a new game | The game's author changed the save version without a way to carry old saves over | Ask the game's author; an exported file can wait for a fixed version |

<!-- step: fix-save -->
**Fix.** Read the message, then follow the line above. A refused save never replaces the game you are playing. To keep
a save safe across devices and updates, export it: pause menu › Save › **Export file** ([Saves](play.saves.md)).

<a name="offline-incomplete"></a>

## Offline incomplete

**What the pause menu says.** The **Offline** row counts the files in the cache: "312/400…" while downloading,
"complete" when the whole game is there, "312/400 ⚠" (and the game's retry word) when some are missing. No Offline
row means the game caches only the rooms near you (`offline: 'nearby'`), by its author's choice.

**Causes and fixes:**

<!-- step: fix-offline -->
1. **Save-Data or 2G**: nothing is downloaded while the browser asks to save data or the link is 2G; music and video
   wait for better than 3G. Connect to Wi-Fi, then tap the row.
2. **A file failed** (the network dropped): tap the row; the files already cached are not fetched again.
3. **Less than 64 MB free**: the download does not start. Free some space, then tap the row.
4. **The game's service worker had not taken control** of the page at the first visit: reload the page once online,
   then tap the row.
5. **Safari cleared the site**: in a Safari tab (not a game added to the Home Screen), after seven days of Safari use
   without a visit ([WebKit](https://webkit.org/tracking-prevention/)), or the device ran short of space. Open the game online again and let it download.

See also [Install the game as an app](play.install-app.md#common-errors).

<a name="update-not-showing"></a>

## An update that does not show

**How updates work.** The game keeps its own files cached so it can play offline. When the site has a new version,
the page shows a banner, "A new version is ready." with **Save and update**: the game saves first, checks the save,
and only then switches to the new version. Until you press it, you keep playing the version you have. Changed images
and sounds carry a new address (`?v=<hash>`), so they never come from the old cache once the new version runs.

<!-- step: fix-update -->
**Fix.**

1. Open the game **online** and wait a few seconds on the title screen: the browser checks for a new version when the
   page loads.
2. Press **Save and update** on the banner.
3. If no banner shows: close every tab and window of the game (an installed app counts), then open it again online.
4. If "Save failed" shows when you press it, the update waits: the save could not be verified, so the game does not
   switch versions. Free some storage, then try again.
5. To see which build you run, open the pause menu: the **Build** row shows the game's fingerprint (four short hashes:
   logic, extensions, presentation, engine). Compare it with someone on the current version, or give it in a bug
   report.

<a name="check-fixed"></a>

## How to check it is fixed

- Sound: the title's music, or an effect at the next tap.
- A save: **Load** shows your slot with its room and date, and loading it lands in that room.
- Offline: the **Offline** row says complete; airplane mode still plays every room.
- Update: the banner is gone and the **Build** row shows the new fingerprint.

<a name="neighbours"></a>

## Neighbouring cases

- **The game does not load at all**, or loads without pictures, on a site you publish yourself: that is a deployment
  problem (a sub-path, a cache, a service worker), the author's side: [Sub-path, cache and service worker](create.deploy-issues.md).
- **"Rotate your phone"** in portrait: the game plays in landscape only ([Controls](play.controls.md#layouts)).
- **A speedrun that does not start or export**: [Speedrun for players](play.speedrun.md#common-errors).
- **The Studio**, not the game: [Studio troubleshooting](studio.troubleshooting.md).

<a name="report"></a>

## Reporting a bug

Open an issue on the game's tracker (for the sample game, [the project's](https://github.com/Quest-n-Click/quest-n-click/issues))
with your device, system and browser, what you did, what you saw, the **Build** row of the pause menu, and if you can a
session file: pause menu › Save › **Export session** (it replays exactly what you did, on the author's machine).
