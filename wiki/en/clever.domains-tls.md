# Domains and TLS

The Studio and its game need two origins, and they must be two subdomains of one domain you own. This page gives
them to the studio app, gives the worker its own name, and says why `*.cleverapps.io` names are not enough.

<a name="what-you-get"></a>

## What you get

Three HTTPS names, all under your domain: `studio.example.fr` (the Studio and its API, `publicUrl`) and
`play.example.fr` (the game, `playUrl`), both served by the studio app, and `worker.example.fr` (`worker.url`) served
by the worker app.

<a name="context-and-versions"></a>

## Context and versions

- A hosted Studio on Clever Cloud, from 4.2.3.
- **Verified on: not verified on a live installation for this page.** Two names on one application, routed by
  `Host`, was confirmed by spike S on 17 October 2026, and the reference deployment of 19 October 2026 ran with
  three `*.cleverapps.io` names. Nobody has yet deployed the Studio on a custom domain and recorded it: the
  `studio-hosted` pass ("a TLS domain") is `not-run` for 4.4.0.

<a name="prerequisites"></a>

## Prerequisites

- The apps of [Apps and add-ons](clever.apps-addons.md).
- A domain of your own, and access to its DNS zone.

<a name="where-to-run"></a>

## Where to run the commands

`clever …`: on your machine, in the engine repository where both apps are linked under their alias. The DNS records:
at your DNS provider.

<a name="steps"></a>

## Steps

<!-- step: add-domains -->
1. Give the studio app both of its names, and the worker its own:

   ```sh
   # on your machine, in the engine repository
   clever domain add studio.example.fr --alias my-game-studio
   clever domain add play.example.fr --alias my-game-studio
   clever domain add worker.example.fr --alias my-game-worker
   ```

<!-- step: dns -->
2. At your DNS provider, point each name at Clever Cloud with the record Clever's console shows on the app's domain
   names page (for a subdomain, a CNAME). Clever Cloud then serves it over HTTPS with a certificate it obtains itself;
   this project has not recorded how long that takes.

<!-- step: config-urls -->
3. Write the same names in the configuration: `publicUrl`, `playUrl` and `worker.url`
   ([Configuration](clever.configuration.md)). The server keeps only their origins, and refuses to start when
   `publicUrl` and `playUrl` are the same origin ("playUrl must be another origin than publicUrl").

<a name="why-one-domain"></a>

### Why two subdomains of one domain

The game runs in a frame of the Studio, on `playUrl`, behind its own session cookie
(`Secure; HttpOnly; SameSite=None; Partitioned`). With two subdomains of your domain, the Studio and the game are one
**site**. Where that was checked, the frame keeps its cookie: the hosted e2e shows it in Chromium, Firefox and WebKit
on macOS. Not everywhere: WebKit on Linux (GNOME Web) keeps no cookie a frame of another host sets, even on one site,
and a real Safari on macOS and iOS has not been checked yet (the `studio-hosted` pass). One domain is the
architecture to choose; it is not a proof on every browser.

`cleverapps.io` is on the Public Suffix List (a private entry, Clever Cloud's): `studio-x.cleverapps.io` and
`play-x.cleverapps.io` are **two sites**. The game's cookie then lives in a frame of another site only because it is
partitioned (CHIPS):

> [!MEASURE id=cross-site-cookie]
> A cross-site game frame on two `cleverapps.io` names: a `SameSite=None` cookie was kept by Chromium and Firefox 157
> and blocked by WebKit (Safari 27.2 engine); a `Partitioned` (CHIPS) cookie was kept by all three.
> - date: 2026-10-17
> - version: 4.2.1
> - volume: one page `/iframe-test`, three authentications per browser
> - conditions: spike S, Clever Cloud test organisation, region par; browsers driven by Playwright; real Safari on macOS and iOS not measured
> - source: [SPIKE-4.2.1-CLEVER.md §7](https://github.com/Quest-n-Click/quest-n-click/blob/e7132fe6cdc4b5c0d9d9b9496aa2fda7965fa405/docs/dev/SPIKE-4.2.1-CLEVER.md)

> [!LIMIT id=never-cleverapps]
> Never use two `*.cleverapps.io` names for `publicUrl` and `playUrl` in a deployment people use. The hosted e2e
> shows Chromium, Firefox and WebKit on macOS keeping the partitioned cookie; WebKit on Linux (GNOME Web) stores no
> cookie a frame of another host sets, even on one site, so the game's frames stay empty there. A real Safari, on
> macOS and iOS, is the `studio-hosted` pass, not done yet.

<a name="expected-result"></a>

## Expected result, and how to check it

- `clever domain --alias my-game-studio` lists both names; `clever domain --alias my-game-worker` lists the worker's.
- Once deployed ([First deployment](clever.first-deployment.md)), `https://studio.example.fr/livez` answers
  `{"ok":true}` with a valid certificate, and `https://play.example.fr/` answers 401 ("open the game from the
  Studio"): the game's origin refuses any request without the game's session.
- In the Studio, the room view and the Play tab show the game.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `playUrl must be another origin than publicUrl (plan §6.1)` at start | The same name in both | Two names, `studio.` and `play.` |
| The game's frames stay empty in one browser | Two sites (`*.cleverapps.io`), or WebKit on Linux | Two subdomains of one domain; see [Troubleshooting](clever.troubleshooting.md#missing-cookie) |
| A certificate error | The DNS record does not point at Clever Cloud yet | Check the record; wait for propagation |

<a name="files-changed"></a>

## Files or data changed

The apps' domain lists in Clever Cloud, your DNS zone, and later the configuration's URLs.

<a name="recovery"></a>

## Recovery or going back

`clever domain rm <name> --alias <app>` removes a name. Changing the names of a running Studio is
[Changing domain or OIDC provider](clever.change-domain.md): the provider's redirect URIs change with them.

<a name="references"></a>

## References

- The game origin's cookie: [`studio-server/src/server/play.ts`](../../studio-server/src/server/play.ts); the origins
  checked: [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).
- Spike S §7 and §9: [`docs/dev/SPIKE-4.2.1-CLEVER.md`](../../docs/dev/SPIKE-4.2.1-CLEVER.md).
- [Security](clever.security.md), for the cookie policies.
