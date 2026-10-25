# Install the game as an app

A quest'n'click game is a web page that can be installed like an app (a PWA, a progressive web app) and then played
without a network. This page is for players: phones and computers, browser by browser.

<a name="what-you-get"></a>

## What you get

An icon on your home screen or in your applications that opens the game full screen, in landscape, and a copy of the
**whole game** in your browser's cache, so it plays offline after the first visit. Your saves stay on the device.

<a name="context-and-versions"></a>

## Context and versions

Any game built with quest'n'click and served over HTTPS (the sample game is at
[quest-n-click.cleverapps.io/demo](https://quest-n-click.cleverapps.io/demo/)). What this page says holds from 4.1.8, when
install, update and reinstall were proven in Chromium, WebKit and Firefox in CI; the offline copy of the whole game
exists since 3.1. A game's author can choose to cache only the rooms near you (`offline: 'nearby'`): the pause menu
then shows no offline row, and a room never visited may need the network.

<a name="prerequisites"></a>

## Prerequisites

- A recent browser: Chrome, Edge or another Chromium browser, Safari, or Firefox.
- A network connection for the first visit, long enough for the whole game to download (the pause menu shows it).
- Some free storage: below 64 MB free, the game does not start the download and says so.

<a name="where-to-run"></a>

## Where to do it

On the device you will play on, in its browser. Nothing to type in a terminal.

<a name="steps"></a>

## Steps

<!-- step: open-online -->
1. **Open the game's address online** and start or continue a game. From the title screen and after each room, the
   game fetches the current room and its neighbours first; then, during idle time, the rest of the game, batch by
   batch.

<!-- step: install -->
2. **Install it** from your browser:
   - **iPhone and iPad (Safari)**: the Share button, then **Add to Home Screen**. Open the game from that icon once,
     online.
   - **Android (Chrome)**: the menu (⋮), then **Install app** or **Add to Home screen**.
   - **Computer (Chrome, Edge)**: the install icon in the address bar, or the menu, then **Install**.
   - **Firefox**: Firefox keeps the offline copy in the browser as the others do; whether it offers to install the
     page as an app depends on your Firefox version and system. The offline play works either way.

<!-- step: wait-complete -->
3. **Wait for the offline copy.** Open the pause menu: the **Offline** row counts the files ("312/400…") and says
   **complete** ("jeu entier en cache" in French in the sample game) when every file of the game is in the cache. A
   warning sign ("312/400 ⚠") means some files are missing; tap the row to retry. Files already cached are never
   fetched twice, so the download resumes where it stopped, even after a reload.

<!-- step: check-offline -->
4. **Check it**: turn on airplane mode, close the game completely, open it again. The title loads, **Continue**
   resumes your save, and a room you never visited shows its pictures and sounds.

> [!GUARANTEE id=offline-complete-means-cached]
> When every file of the game's offline plan is in the cache, the offline status is complete, and the pause menu's line
> says so.

A failed file, a skipped batch or a lack of space leaves it partial, with the reason.

> [!LIMIT id=safari-not-tried-on-device]
> Nobody has yet installed a game from Safari on a real iPhone, played it offline and updated it: the pass
> `safari-ios-offline-update` is open ([#86](https://github.com/Quest-n-Click/quest-n-click/issues/86)) as of 4.4.0. CI cannot
> navigate WebKit offline, so on Safari the offline game is only checked in its installed and updated parts. Safari's
> rule that erases a site's storage after seven days of use without a visit applies to a Safari tab, not to a game
> added to the Home Screen ([WebKit](https://webkit.org/tracking-prevention/)); an iPhone short of space may still evict it. Export the saves you care about.

<a name="expected-result"></a>

## Expected result, and how to check it

- The game opens from its icon, full screen, in landscape.
- The pause menu's **Offline** row says **complete**.
- In airplane mode the title, your save and every room are there.

<a name="common-errors"></a>

## Common errors

| What you see | Why | What to do |
|---|---|---|
| The Offline row stays at "0/400" or shows ⚠ at once | The browser asked to save data (Data Saver, Save-Data), or the link is 2G: nothing is downloaded. On a link slower than 3G, music and video wait | Connect to Wi-Fi, then tap the row to retry |
| ⚠ with fewer files than the total | A file failed to download | Tap the row to retry; files already cached stay |
| ⚠ and nothing downloads, even on Wi-Fi | Less than 64 MB free on the device | Free some space, then retry |
| ⚠ just after the first install | The game's service worker did not take control of the page in time | Reload the page, then retry from the pause menu |
| No Offline row in the pause menu | The game caches only the rooms near you (`offline: 'nearby'`) | Play online; a room you have visited stays in the cache |

More in [Player troubleshooting](play.troubleshooting.md#offline-incomplete).

<a name="files-changed"></a>

## Files or data changed

In your browser, for the game's site only: the app shell and the game's files in the cache (Cache Storage), your
saves in IndexedDB, your settings in local storage. See [Privacy](play.privacy.md#device).

<a name="recovery"></a>

## Recovery or going back

To remove the app: delete its icon (long press on a phone; uninstall from the browser on a computer). Removing the
icon may leave the site's data; to erase it (and your saves), clear the site's data in the browser's settings. Export
a save first if you want to keep it ([Saves](play.saves.md#export-import)).

<a name="references"></a>

## References

- [Player troubleshooting](play.troubleshooting.md), [Saves](play.saves.md), [Stability and support](start.stability.md).
- For authors: [Sub-path, cache and service worker](create.deploy-issues.md).
- The code: [`src/engine/dom/offline.ts`](../../src/engine/dom/offline.ts) (the plan and its status),
  [`src/engine/dom/update.ts`](../../src/engine/dom/update.ts) (the warm-up and the update).
- The Safari checklist people follow: [`docs/dev/SAFARI-OFFLINE.md`](../../docs/dev/SAFARI-OFFLINE.md).
