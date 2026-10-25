# Testing on a phone over the LAN

A game is made for a phone held in landscape. This page starts the development server so that a phone on the same
Wi-Fi opens the game you are writing, with the reloads as you edit, and says what stays protected while it does.

<a name="what-you-get"></a>

## What you get

The game you are editing, open on your phone at `http://<your machine's address>:5173/`, reloading each time you save
a file. The Studio and the placement editor stay reachable from the phone too, but only with a one-session token the
command prints.

<a name="context-and-versions"></a>

## Context and versions

- **Engine repository**: `npm run dev:lan` (and `npm run studio:lan` for the Studio). It exists since 3.0.0; since
  4.1.2 the Studio's write routes also check the `Host` the browser sends (below).
- **Created project** (made by `npx @quest-n-click/create <folder>` or `quest-n-click create <folder>`): there is no `dev:lan` script. Its `dev`
  passes extra options to Vite, so `npm run dev -- --host` serves the game on the network. That mode gives no token:
  the phone plays, but the Studio and the placement editor refuse every write that does not come from this machine
  (see [Limits](#limits)).

<a name="prerequisites"></a>

## Prerequisites

- The game runs on your machine: `npm run dev` opens it at `http://localhost:5173/`
  ([The working loop](create.working-loop.md)).
- The phone and the machine are on the same network, and the network lets two devices talk to each other (a guest
  Wi-Fi or a public hotspot often does not).
- Your machine's firewall lets incoming connections reach Node on port 5173.

<a name="where-to-run"></a>

## Where to run the commands

On your machine, in a terminal open in the engine repository (or in the created project, for its own command).
Nothing runs on the phone: it only opens a URL.

<a name="steps"></a>

## Steps

<!-- step: start-lan -->
1. Start the development server on the network.

   ```sh
   # in the engine repository, on your machine
   npm run dev:lan
   ```

   ```sh
   # in a created project, on your machine
   npm run dev -- --host
   ```

   `dev:lan` first points `@game` at the current game (`GAME=<id>`, else the game last selected, else
   `package.json` → `config.game`), then starts Vite listening on every interface (`--host 0.0.0.0`). Before Vite's
   own lines it prints a banner:

   ```text
   LAN write access is protected by this one-session token:
     <token>
   Studio: http://192.168.1.20:5173/__studio/?token=<token>
   Layout editor: http://192.168.1.20:5173/?edit=<room>&token=<token>
   ```

   The address is your machine's first IPv4 address on the network. Vite then lists its own `Network:` URLs.

<!-- step: open-on-phone -->
2. On the phone, open `http://<that address>:5173/` and turn the phone to landscape.

<!-- step: play-a-rule -->
3. Play what you just wrote. In the lamp of [Your first game](create.first-game.md), tap the lamp with **Use**: the
   line shows, the prop changes, and the save remembers it when you reload. That is the loop: write a rule, place it,
   check, play.

<!-- step: studio-on-lan -->
4. Optional: to edit from another device, open the **Studio** or **Layout editor** URL of the banner, with its
   `?token=`. The first request with the token sets an `HttpOnly`, `SameSite=Strict` cookie, so the next pages need
   no token in the URL. To start the Studio itself on the network, run `npm run studio:lan` instead of step 1 (engine
   repository): it opens the Studio's URL with the token.

> [!LIMIT id=dev-server-no-offline]
> The development server is not the built game: the phone tests the rules, the placement, the text and the touch, not
> the installation as an app, the offline mode or the cache. Test those on a build served over HTTPS
> ([Build and release a game](create.build-release.md), [Sub-path, cache and service worker](create.deploy-issues.md)).

<a name="limits"></a>

### What stays protected

- Without `dev:lan`/`studio:lan`, Vite listens on `127.0.0.1` only (`vite.config.ts`): no other device reaches it.
- In LAN mode, every file-writing route of the Studio (the Studio's API, the placement editor's save) asks for the
  token: in the `x-web-scumm-token` header, in `?token=`, or in the cookie. Without it: `401 Studio token required`.
  The token is new at each start, unless `WEB_SCUMM_STUDIO_TOKEN` is set
  ([environment variables](reference.environment-variables.md#web-scumm-studio-token)).
- In every mode, those routes answer only to this machine's names (`localhost`, `127.0.0.1`, `[::1]`) and, in LAN
  mode, to the addresses `dev:lan` printed. Any other `Host` gets `403 the Studio answers its own names only`, so a
  page that rebinds a name to your port cannot write. A write whose `Origin` is another site gets
  `403 cross-origin Studio request refused`.
- In a created project with `npm run dev -- --host`, no LAN address is on that list and no token exists: the phone
  plays the game, and any write through the Studio or the placement editor from the phone is refused with a 403.
  Edit on the machine itself.

> [!GUARANTEE id=lan-writes-need-token]
> In LAN mode, the Studio answers 401 to a request without the token, and 403 to a write whose `Origin` is another
> site even with the token. The test runs the guard on a local HTTP server; it does not start Vite.

> [!LIMIT id=lan-trusted-network]
> The token protects writes, not reading: anyone on the same network can open and play the game while the server
> runs. Use it on a network you trust, and stop the server (`Ctrl+C`) when you are done.

<a name="expected-result"></a>

## Expected result, and how to check it

The phone shows the title screen, then the game in landscape. Save a room file on the machine: the phone reloads
with the change. In the Studio opened from the banner's URL, a save goes through (no 401).

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| The phone's browser waits, then says the site cannot be reached | The phone is on another network, the Wi-Fi isolates its clients, or the firewall blocks port 5173 | Put both on the same Wi-Fi, allow Node through the firewall (macOS asks at the first start), or try another network |
| It works on the machine (`localhost`) but not on the phone | `npm run dev` was started, not `npm run dev:lan`: Vite listens on `127.0.0.1` only | Stop it and start `npm run dev:lan` (created project: `npm run dev -- --host`) |
| `401 Studio token required` when saving from the phone | The Studio or editor page was opened without the banner's `?token=` | Open the banner's URL; the token changes at each start of the server |
| `403 the Studio answers its own names only …` | The page was opened under a name that is not this machine's or the printed address (a `.local` name, another interface's address), or in a created project with `--host` | Open the exact address of the banner; in a created project, edit on the machine |
| `✖  games/<id>/index.ts not found (GAME=<id>)` | `GAME` names a game that does not exist | Check `ls games`, or unset `GAME` |
| Port 5173 in use, Vite picks another port | Another dev server runs | Stop it, or open the port Vite prints; the banner's URLs say 5173 whatever Vite chose |

<a name="files-changed"></a>

## Files or data changed

`dev:lan` itself writes nothing but the `.cache/game` link to the current game. What the phone saves (the game's
progress) stays in the phone's browser storage. A write made through the Studio or the editor changes the game's files
on the machine, as on `localhost`.

<a name="recovery"></a>

## Recovery or going back

Stop the server with `Ctrl+C`: the token dies with it, and `npm run dev` goes back to listening on `127.0.0.1` only.

<a name="references"></a>

## References

- [`tools/serve.ts`](../../tools/serve.ts) and [`tools/serve-args.ts`](../../tools/serve-args.ts): what `dev:lan`
  and `studio:lan` start, the token and the banner.
- [`tools/studio/security.ts`](../../tools/studio/security.ts): the token, the names and the origin checked on each
  write.
- [`vite.config.ts`](../../vite.config.ts): `server.host`, `127.0.0.1` unless `WEB_SCUMM_LAN=1`.
- [Your first game](create.first-game.md), [The working loop](create.working-loop.md),
  [Local and LAN security](studio.security.md).
- Next: [DSL reference](create.dsl.md) for every field, [Classic mechanics](create.classics.md) for famous mechanics
  written with them, [The local Studio](studio.overview.md) for the tool, [Working with an AI](create.working-with-ai.md)
  for a whole game from the first idea to the release.
