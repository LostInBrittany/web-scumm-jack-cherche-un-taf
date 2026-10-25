# Security

How a hosted Studio on Clever Cloud decides who a request is, what it may do, how fast a removed member loses access,
and why the game's code never touches a secret. Each rule here is read from the current code; its limits are said.

<a name="why"></a>

## Why

A shared Studio holds a team's work and runs code a member wrote. Three dangers shape it: a page of another site
acting with a member's session (CSRF), a member who should no longer get in, and the game's own code reaching the
Studio's secrets. The provider says who someone is; the Studio decides what they may do (ADR 0027).

<a name="policies"></a>

## The HTTP policies

Each request gets exactly one policy, chosen by the request alone; never two identities on one request.

| Policy | When | Rules |
|---|---|---|
| **A, cookie** | an API request with no `Authorization` header | The cookie `__Host-ws_session` (`Secure`, `HttpOnly`, `SameSite=Lax`); only its sha256 is stored. A mutation (POST, PUT, PATCH, DELETE) needs `Origin` equal to `publicUrl`, `X-Studio-Request: 1` and a JSON body; a refusal says only `forbidden` (403) |
| **B, Bearer** | an `Authorization` header | An access token (a JWT) for the configuration's `audience`, 5 min by default (15 at most); cookies ignored. An id_token, another audience, a longer token, a non-member, a foreign `Origin`: refused |
| **C, callback** | `GET /auth/callback` | The provider's answer to a login begun server-side (Authorization Code, PKCE S256, state, nonce; the pre-authentication used once, 10 min) |
| **D, back-channel logout** | `POST /auth/backchannel` | A form-encoded `logout_token`, checked per the specification; a replay refused by its `jti` |
| E, login and logout | `GET /auth/login`, `POST /auth/logout` | The login's return path is relative only, never another site |
| F, the game's origin | any request on `playUrl` | A ticket from a member's browser session opens a game session (cookie `Secure; HttpOnly; SameSite=None; Partitioned`); without it, 401 "open the game from the Studio", before the path is read. No API, no `/auth`, no `/metrics` there |

Roles live in the Studio: reading needs a reviewer, writing a dev, the members and the audit log an owner. The last
owner can be neither demoted nor removed.

<a name="revocation"></a>

## Revocation, R = 15 minutes

| Event | When access ends |
|---|---|
| A member removed or revoked in the Studio | At their next request: sessions deleted, every token issued before refused (`revoked_before`); their long connections (live stream, MCP) close within 5 s, their leases are released |
| A back-channel logout from the provider | At once: with a `sid`, that provider session only; with a `sub` alone, every session and token of the user |
| Disabled at the provider, no back-channel | At the session's next check: every 5 min, by its refresh token; a definitive refusal ends it |
| The provider unreachable | The session lives until R (15 min) after its last confirmation, then is **suspended** (503, fail closed) until a check succeeds |
| A provider that gives no refresh token | Sessions of R at most |
| A refresh token that no longer opens (its key left the ring) | The session ends: log in again ([Rotating keys](clever.key-rotation.md)) |

Browser sessions also end after 8 h idle or 24 h in all (`sessions.idleHours`, `sessions.absoluteHours`).

> [!GUARANTEE id=provider-unreachable-suspends]
> When the provider cannot be reached for longer than R, a session is suspended: the Studio answers 503 rather than
> serving it unchecked, and the session comes back once the provider answers a check. The test runs on a simulated
> clock, against a test provider.

<a name="worker"></a>

## The worker without secrets

The game's code (its validator, solver, previews, migration, asset tools) runs only on `studio-worker`, a second app
(ADR 0028). On Clever Cloud's Node.js runtime there is one system user, and a child process can read its parent's
environment through `/proc` (spike S §1): so the worker holds **nothing** worth stealing.

- It has no database or Cellar credentials (never link the add-ons to it) and no private key: only
  `WORKER_PUBLIC_KEY`, to check that a job was signed by the Studio (Ed25519), for its `WORKER_INSTANCE`, and not
  expired (a job lives at most its limit plus 30 s of clock skew).
- A job reads its snapshot and writes its result through presigned S3 URLs, one key and one duration each, in a
  staging prefix of its own.
- Its child starts with an empty environment (measured: 0 variables, spike S §6). For the engine upgrade and the
  sheets' cutting, the Studio refuses a result that names a file it did not ask for.

> [!LIMIT id=worker-network]
> The worker's outbound network is not restricted: the game's code running there could reach the Internet. Running
> the worker without outbound network was not tried (QUALIF-4.2.3 §7).

<a name="proxy"></a>

## Behind Clever's proxies: `trustProxy`

The server believes `X-Forwarded-For` and `X-Forwarded-Proto` only from the addresses in `trustProxy`; with OIDC and
listening beyond the loopback it refuses to start without them. That is how two members behind Clever's proxies are
told apart for the rate limits (the `/auth/` routes: 30 requests a minute per address, per instance, in memory; then
429). The private ranges of the example are an assumption to narrow ([Configuration](clever.configuration.md#trust-proxy)).

<a name="secrets"></a>

## Secrets

Read once from `<NAME>_FILE` (0600) or the environment, then removed from the process's environment; never logged.
Refresh tokens and id_tokens are sealed with AES-256-GCM under the `STUDIO_SESSION_KEY` ring. A backup is trusted
input (it can add owners). The full list: [Configuration](clever.configuration.md#secrets).

<a name="cookies"></a>

## The game's cookie and the domains

With `publicUrl` and `playUrl` on two subdomains of one domain, the Studio and the game are one site and the game's
frame keeps its cookie in Chromium, Firefox and WebKit on macOS, where the hosted e2e checks it (not WebKit on Linux;
a real Safari is not checked yet). Two `*.cleverapps.io` names are two sites, where the cookie survives only as a
partitioned one (CHIPS), which WebKit on Linux does not keep: [Domains and TLS](clever.domains-tls.md#why-one-domain).

<a name="alternatives"></a>

## Alternatives set aside

- **Rights in the provider (groups).** The maintainer chose the Studio on 17 October 2026: the provider holds no right.
- **Token introspection** (RFC 7662) instead of short JWT access tokens: the documented option if a provider cannot
  issue short tokens.
- **Running the game's code in the Studio's process**: it would see the Studio's secrets.

<a name="trade-offs"></a>

## Trade-offs

- Rate limits are per instance and in memory: a restart resets them.
- A disabled user keeps access up to 5 min without back-channel logout, up to R when the provider is down.
- The `studio-hosted` pass (a real Safari, Clever's actual proxy ranges) has not been made for 4.4.0.

<a name="decisions"></a>

## Decisions and ADRs

- [ADR 0027, identity, sessions, tokens](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md);
  [ADR 0028, where the game's code runs](../../docs/dev/adr/0028-studio-content-execution.md);
  [the threat model](../../docs/dev/threat-models/studio-server.md).
- The code: [`studio-server/src/server/auth/gate.ts`](../../studio-server/src/server/auth/gate.ts),
  [`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts),
  [`studio-server/src/server/play.ts`](../../studio-server/src/server/play.ts),
  [`studio-server/src/worker/job.ts`](../../studio-server/src/worker/job.ts).
- The test behind the guarantee: [`tests/studio-auth.test.ts`](../../tests/studio-auth.test.ts).
