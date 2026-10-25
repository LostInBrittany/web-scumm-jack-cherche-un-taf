# Generic OIDC and GitLab

Any OpenID Connect provider with discovery can log people in to the Studio from a browser. The CLI and the remote MCP
need more of it. This page says what works with another provider than Keycloak, GitLab included, and what does not.

<a name="what-you-get"></a>

## What you get

Browser logins to the Studio through your provider (GitLab, Authentik or another), with the same roles and
invitations as with Keycloak. With a provider that issues JWT access tokens for the Studio's audience, the CLI and
the remote MCP too.

<a name="context-and-versions"></a>

## Context and versions

- A hosted Studio on Clever Cloud, from 4.2.3 (D44: GitLab for the `studio-oidc-generic` pass).
- **Verified on: not verified on a live installation.** The `studio-oidc-generic` pass (login, roles, a revoked
  member refused, on a real GitLab) is `not-run` for 4.4.0. What this page says comes from the code and the guide.

<a name="prerequisites"></a>

## Prerequisites

- [Domains and TLS](clever.domains-tls.md) done: you know `publicUrl`.
- An account on the provider allowed to create an OAuth / OpenID Connect application.

<a name="where-to-run"></a>

## Where to run the commands

The application is created in the provider's console. `clever env set`: on your machine, in the engine repository
where the studio app is linked.

<a name="steps"></a>

## Steps

<!-- step: create-client -->
1. At the provider, create the `studio` application as for Keycloak: a confidential client, the scopes `openid profile
   email`, Authorization Code with PKCE S256, the redirect URI `<publicUrl>/auth/callback`, the post-logout redirect
   `<publicUrl>`, and the back-channel logout to `<publicUrl>/auth/backchannel` if the provider offers it.

<!-- step: secret -->
2. Save its secret in a 0600 file and set it on the studio app:

   ```sh
   # on your machine, in the engine repository
   clever env set --alias my-game-studio -- STUDIO_OIDC_CLIENT_SECRET "$(cat ~/secrets/my-game/oidc-client-secret)"
   ```

<!-- step: config -->
3. Write the provider in the configuration's `oidc`. For GitLab the issuer is `https://gitlab.com`; `clientId` is the
   application's id; `audience` is any name other than `clientId` (the server refuses the same):

   ```json
   { "issuer": "https://gitlab.com", "clientId": "<application id>", "audience": "studio-api" }
   ```

   Leave out `cliClientId` when the provider cannot serve the CLI (below): `GET /auth/cli` then answers
   `client_id: null`.

> [!LIMIT id=cli-needs-jwt]
> The CLI and the remote MCP present the provider's **access tokens as JWTs** signed for this Studio's audience,
> lasting 5 minutes (15 at most). A provider that issues opaque access tokens (GitLab's OAuth applications, at the
> time of writing) does not give them: with it, the CLI and the remote MCP are not offered, or stay on a provider that
> does (Keycloak, Authentik and others).

> [!LIMIT id=no-backchannel]
> Without back-channel logout, a session ended at the provider ends in the Studio at its next check (every 5 min, by
> its refresh token), and a user disabled there within R = 15 min. A provider that gives no refresh token gets
> sessions of 15 min at most.

<a name="expected-result"></a>

## Expected result, and how to check it

The Studio starts (it reads the issuer's discovery at start); an invited member logs in from a browser with the
verified email of the invitation; `GET /auth/me` gives their role. An invitation is consumed only by the verified
email it names: a provider that does not say the email is verified cannot accept invitations.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| The member logs in but is "not a member of this project" | The provider does not report `email_verified`, or another email | Check the email is verified at the provider; invite that email |
| `the access token is not valid` from the CLI | Opaque access tokens, or no audience | Not supported with this provider (limit above) |
| `oidc.maxTokenSeconds is between 30 and 900` | A value out of range | Set 300 to 900, or leave it out (300) |
| `oidc.issuer must be an http(s) URL` | The issuer missing its scheme | The full URL |

<a name="files-changed"></a>

## Files or data changed

The application at the provider; `STUDIO_OIDC_CLIENT_SECRET` and `STUDIO_CONFIG_JSON` on the studio app.

<a name="recovery"></a>

## Recovery or going back

Switching between providers changes everyone's identity: [Changing domain or OIDC provider](clever.change-domain.md).

<a name="oidc-fields"></a>

## Reference: the `oidc` fields

| Field | Required | Value | Default |
|---|---|---|---|
| `issuer` | yes | the provider's issuer, an http(s) URL (its discovery is read at start) | — |
| `clientId` | yes | the browser client (`studio`) | — |
| `audience` | yes | the audience the access tokens must carry; must differ from `clientId` | — |
| `cliClientId` | no | the public client of the device flow, given to the CLI by `GET /auth/cli` | none |
| `scopes` | no | the scopes of a browser login | `openid email profile` |
| `maxTokenSeconds` | no | the longest access token accepted, 30 to 900 | 300 |
| `allowInsecure` | no | a provider over plain http, for a local test only; never in production | false |

With `oidc` set, the server also requires `worker`, `trustProxy` (when it listens beyond the loopback),
`STUDIO_OIDC_CLIENT_SECRET` and `STUDIO_SESSION_KEY` ([Configuration](clever.configuration.md)). An unknown key at
the top of the configuration is refused at start; inside `oidc`, an unknown field is ignored. Since 4.2.1.

<a name="references"></a>

## References

- [`studio-server/src/server/auth/oidc.ts`](../../studio-server/src/server/auth/oidc.ts),
  [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).
- [ADR 0027](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md); the Keycloak setup:
  [Keycloak](clever.keycloak.md); revocation: [Security](clever.security.md#revocation).
