# Local and LAN security

The local Studio writes files on your machine and can call a model provider with your key. This page says what
protects those routes, on your own machine and on your local network, and where the protection stops.

<a name="why"></a>

## Why

A dev server that writes files is a door into your machine. Three things could knock on it: another machine on the
network, a web page in your browser that tries to reach `localhost` (directly, or by rebinding its own name to your
machine, "DNS rebinding"), and a model provider address that would lead the Studio to a service of your private
network ("SSRF"). The Studio closes each one by default and opens only what you ask for.

<a name="local-and-lan"></a>

## Local and LAN

- **Loopback by default.** `npm run studio` and `npm run dev` listen on `127.0.0.1` (port 5173): another machine cannot
  reach their file-writing routes.
- **Its own names only.** Every Studio, asset, layout and assistant route answers only to the names of this machine
  (`localhost`, `127.0.0.1`, `[::1]`), and in LAN mode to the addresses `studio:lan` serves. A page on another site
  that rebinds its name to your machine sends that name as `Host`: refused (403), even with a matching `Origin`.
- **Same origin.** A request that carries an `Origin` must come from the Studio's own origin (403 otherwise). A write
  (anything but GET, HEAD and OPTIONS) without an `Origin` header is refused (403): a script must send one.
- **LAN mode, behind a token.** To work from a phone, `npm run studio:lan` (or `npm run dev:lan`) listens on the
  network and prints a fresh capability token, drawn at each start (24 random bytes), unless you set
  `WEB_SCUMM_STUDIO_TOKEN` yourself. Every Studio, asset, layout and assistant route then requires that token, as the
  `x-web-scumm-token` header, the `?token=` parameter of the printed URL, or the cookie the URL sets
  (`web_scumm_studio`, `HttpOnly`, `SameSite=Strict`). The host names allowed are the machine's IPv4 network
  addresses (`WEB_SCUMM_STUDIO_HOSTS`, set by the command).
- **Never on the Internet.** Do not expose the development port to the Internet: the token protects a session on your
  network, not a public server. To put a Studio online, use the hosted Studio ([What runs where](team.what-runs-where.md)).

> [!GUARANTEE id=lan-token-same-origin]
> In LAN mode the Studio answers 401 to a request without the session's token, and 403 to a write whose `Origin` is
> another site, even with the token.

> [!GUARANTEE id=own-names-only]
> A `Host` that is not this machine (or an address `studio:lan` serves) is refused, even with a matching `Origin`.

<a name="providers"></a>

## Model providers

- **Keys** stay in the browser tab (sessionStorage) and go with each request; the relay keeps a key in memory for that
  request only, never on disk, never in a log ([The Assistant](studio.assistant.md#key-safety)).
- **Addresses.** Arbitrary provider URLs are disabled unless `WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1`. Even then, private
  and link-local destinations stay blocked, except the explicit local Ollama preset, in both IP families: loopback
  (`127.0.0.0/8`, `[::1]`), unspecified (`0.0.0.0`, `::`), private (`10/8`, `172.16/12`, `192.168/16`, `100.64/10`,
  `fc00::/7`), link-local (`169.254/16`, `fe80::/10`), IPv4-mapped IPv6, and the names `localhost`, `*.localhost`,
  `*.local`, `*.internal`. A custom provider must use HTTPS.
- **Calls.** A provider call never follows a redirect, gives up after 60 s, and reads at most 8 MB of answer.

<a name="trusted-code"></a>

## What is not protected: the game is trusted code

A game's TypeScript and its custom commands are trusted code, not sandboxed data: the Studio, the validator and the
solver run them on your machine. Open only games you trust, as you would any project you `npm install`. See
[`SECURITY.md`](../../SECURITY.md).

> [!LIMIT id=lan-is-not-public]
> The LAN token is a convenience for a phone on your own network: it is shown in the terminal and in the URL, and
> lives as long as the server. It is not an authentication for a public deployment.

<a name="alternatives"></a>

## Alternatives set aside

- **Listening on every interface by default**: convenient for phones, but it would put the file-writing routes on
  every network the laptop joins. LAN mode is an explicit command.
- **A password**: a token drawn per session needs nothing to remember and dies with the server.
- **Allowing any provider URL**: one setting away (`WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1`), but a URL typed in a page
  must never reach your private network.

<a name="trade-offs"></a>

## Trade-offs

- A script that writes through the Studio's API must send an `Origin` header matching the Studio, and in LAN mode the
  token.
- A phone needs the URL with the token once; the cookie keeps it for the session.

<a name="decisions"></a>

## Decisions and ADRs

- Sources: [`tools/studio/security.ts`](../../tools/studio/security.ts), [`tools/serve-args.ts`](../../tools/serve-args.ts),
  [`tools/studio/assistant.ts`](../../tools/studio/assistant.ts), [`vite.config.ts`](../../vite.config.ts).
- The variables: [`WEB_SCUMM_STUDIO_TOKEN`](reference.environment-variables.md#web-scumm-studio-token),
  [`WEB_SCUMM_STUDIO_HOSTS`](reference.environment-variables.md#web-scumm-studio-hosts),
  [`WEB_SCUMM_LAN`](reference.environment-variables.md#web-scumm-lan),
  [`WEB_SCUMM_ALLOW_CUSTOM_PROVIDER`](reference.environment-variables.md#web-scumm-allow-custom-provider).
- When a route refuses: [Studio troubleshooting](studio.troubleshooting.md).
