# Security policy

How to report a vulnerability in quest'n'click, which versions get a fix, and what the development tools trust and do
not trust. The repository's [`SECURITY.md`](../../SECURITY.md) says the same in English; this page is its reference,
in both languages. The security of a hosted Studio is its own page ([Clever Cloud security](clever.security.md)), and
the Reality Bridge's too ([Bridge security](bridge.security.md)).

<a name="reporting"></a>

## Reporting a vulnerability

### Form

Report it privately through GitHub's **Security Advisory** feature of `Quest-n-Click/quest-n-click` (the repository's
Security tab, "Report a vulnerability"), never in a public issue.

### What to include

- the affected commit (or release);
- the steps to reproduce;
- the impact.

Do not include provider keys or private game assets.

<a name="supported-versions"></a>

## Supported versions

The current major's last minor gets every fix, security fixes included. Each earlier minor gets security fixes for
three months after the minor that followed it; after that, upgrade ([Upgrade](install.upgrade.md)). At 4.5.0
(23 October 2026), the same table as [Stability and support](start.stability.md#versions):

| Line | Security fixes until |
| --- | --- |
| 4.5 | the next minor, then three more months |
| 4.4 | 23 January 2027 |
| 4.3 | 22 January 2027 |
| 4.2.5 | 21 January 2027, on a branch from `v4.2.5` |

A fix for an older line is made on a branch from its last tag and released as a patch of that line.

<a name="dev-studio"></a>

## The development Studio and dev server

### Values and default

- The local Studio (`npm run studio`) listens on **loopback** by default.
- `npm run studio:lan` and `npm run dev:lan` are explicit LAN modes: they generate a **one-session capability token**,
  require **same-origin writes** and print the authorised URL.

> [!GUARANTEE id=lan-token-required]
> On the LAN, the Studio refuses a request without the session's token, and a write from another origin. The test covers
> the Studio's request check; it does not cover what a browser on the same network can read.

### Constraints

Do not forward these development ports to the Internet. A Studio that a team shares online is the Studio Server, with
its own login ([What runs where](team.what-runs-where.md)).

<a name="trusted-code"></a>

## Trusted code

A game's TypeScript modules and its custom commands are **trusted code**: they run with the engine's rights.
quest'n'click does not sandbox an untrusted `games/<id>/` directory. Open a game from someone you do not trust as you
would run their program.

> [!LIMIT id=no-game-sandbox]
> There is no sandbox for a game's code, in the player, the tools or the local Studio.

<a name="assistant-providers"></a>

## The Studio Assistant's providers

### Values and default

- The provider key is kept in the browser tab's **session storage** and sent with each request; the Studio never
  writes it to disk.
- The preset providers (OpenAI, Anthropic) and a local Ollama on this machine are accepted as they are. Any other
  address (a custom relay) requires the explicit opt-in `WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1` in the Studio's
  environment.
- Even then, the address must be **public HTTPS**: loopback, unspecified, private, link-local and local-name hosts are
  refused, in both IP families, including bracketed and IPv4-mapped IPv6 forms. A URL holding credentials is refused.
- A provider call **never follows a redirect**, **times out after 60 s** and reads **at most 8 MB** of answer.

> [!GUARANTEE id=policy-provider-no-redirect]
> A provider that answers with a redirect is refused with an error.

### Constraints

```sh
# in the engine repository, for one Studio session
WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1 npm run studio
```

> [!LIMIT id=dns-rebinding]
> The host check is static: a public name that resolves to a private address (DNS rebinding) is not detected. Run the
> Studio on a trusted machine.

<a name="licensing"></a>

## Licensing questions

Every asset of the sample game is CC BY 4.0 since 3.7; `npm run verify:commercial` checks it. Licensing questions are
answered in [Licences and credits](contribute.licences.md) (`CREDITS.md`, `LICENSE-ASSETS`).

<a name="related"></a>

## Related identifiers

- `WEB_SCUMM_ALLOW_CUSTOM_PROVIDER` ([Environment variables](reference.environment-variables.md)).
- `npm run studio:lan`, `npm run dev:lan`, `npm run verify:commercial`.
- [Local and LAN security](studio.security.md), [The Assistant](studio.assistant.md),
  [Code of conduct](contribute.code-of-conduct.md).
