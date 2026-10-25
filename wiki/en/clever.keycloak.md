# Keycloak

The Studio Server logs people in through an OpenID Connect provider. This page sets up Clever Cloud's managed
Keycloak for it, from the test realm the repository carries. The provider says who someone is; what they may do is
decided in the Studio.

<a name="what-you-get"></a>

## What you get

A realm `web-scumm` on a managed Keycloak, with the two clients the Studio needs (`studio` for the browser,
`web-scumm-cli` for the CLI and the MCP), an audience mapper, 5-minute access tokens, and your own users with a
verified email. Its issuer, `https://<keycloak host>/realms/web-scumm`, goes in the configuration.

<a name="context-and-versions"></a>

## Context and versions

- A hosted Studio on Clever Cloud, from 4.2.3.
- **Verified on: 19 October 2026, by the reference deployment** (Keycloak managed, plan BASE, Keycloak 26.7.4,
  engine at commit 52e68932, package.json 4.2.2 before the 4.2.3 tag): the realm was created from the edited
  `realm.json` with `POST /admin/realms` (201), and the maintainer's test user logged in as owner. The console path
  (step 4, first way) and this page's exact text are not verified on a live installation.

<a name="prerequisites"></a>

## Prerequisites

- [Domains and TLS](clever.domains-tls.md): you know `publicUrl` (`https://studio.example.fr`).
- `clever-tools` logged in, and `openssl` on your machine.
- The engine repository, for [`ops/studio/keycloak/realm.json`](../../ops/studio/keycloak/realm.json).

<a name="where-to-run"></a>

## Where to run the commands

On your machine: `clever …` in the engine repository; the realm file in a folder kept out of Git
(`~/secrets/my-game/`). The realm itself is made in Keycloak's admin console, in a browser.

<a name="steps"></a>

## Steps

<!-- step: create-keycloak -->
1. Create a managed Keycloak add-on in the same organisation (Clever's console, or `clever addon create` with the
   Keycloak provider; `clever addon providers` gives its name). Then read its admin console's address and first
   credentials:

   ```sh
   # on your machine, in the engine repository
   clever keycloak get <keycloak-addon-id>
   ```

<!-- step: admin-password -->
2. Log in to the admin console once. That first password is temporary: Keycloak asks for a new one. Clever's console
   and the add-on's variable `CC_KEYCLOAK_ADMIN_DEFAULT_PASSWORD` keep showing the old one afterwards, so keep the
   new one where you keep secrets: without it you lose the provider's administration
   ([Recovering admin access](clever.admin-recovery.md#keycloak-admin)).

<!-- step: edit-realm -->
3. Copy `ops/studio/keycloak/realm.json` out of the repository and change, in the copy:
   - `clients[studio].redirectUris` to `["<publicUrl>/auth/callback"]`;
   - `clients[studio].attributes`: `backchannel.logout.url` to `<publicUrl>/auth/backchannel`, and
     `post.logout.redirect.uris` to `<publicUrl>`;
   - `clients[studio].secret` to a new random value, the one you will set as `STUDIO_OIDC_CLIENT_SECRET`;
   - `users`: your own, or none (Keycloak's console adds them), each with a verified email and a password that is not
     the file's. The file's `lea@example.org` / `lea-local-only` is for a local test only.

   ```sh
   # on your machine
   mkdir -p ~/secrets/my-game && cp ops/studio/keycloak/realm.json ~/secrets/my-game/realm.json
   chmod 600 ~/secrets/my-game/realm.json
   openssl rand -base64 32 > ~/secrets/my-game/oidc-client-secret && chmod 600 ~/secrets/my-game/oidc-client-secret
   ```

   Keep the edited file, with its secret and passwords, out of Git.

<!-- step: import-realm -->
4. Create the realm from the edited file. The admin API does not take the admin password through the master realm's
   `admin-cli` (`401 invalid_client`), so `kcadm.sh` and scripts built on it fail as they are. Two ways work:
   - in the admin console (`clever keycloak open webui <keycloak-addon-id>`), **Create realm**, and give it the
     edited `realm.json`;
   - or, with an admin token from a login through the console's own client (`security-admin-console`, Authorization
     Code with PKCE), `POST /admin/realms` with the edited file: what the reference deployment did.

<!-- step: cli-offline -->
5. For members who log in from the CLI or the MCP: the `web-scumm-cli` client needs the client scope
   `offline_access` (optional or default), and each such member the realm role `offline_access`. Without them the
   login says `the login was refused: not_allowed (Offline tokens not allowed for the user or client)`.

<!-- step: set-secret -->
6. Give the studio app the client's secret from its file, so the value is never typed or shown:

   ```sh
   # on your machine, in the engine repository
   clever env set --alias my-game-studio -- STUDIO_OIDC_CLIENT_SECRET "$(cat ~/secrets/my-game/oidc-client-secret)"
   ```

<!-- step: oidc-config -->
7. Put the provider in the configuration's `oidc` ([Configuration](clever.configuration.md)):

   ```json
   { "issuer": "https://keycloak.example.fr/realms/web-scumm", "clientId": "studio", "audience": "studio-api", "cliClientId": "web-scumm-cli" }
   ```

<a name="what-the-studio-needs"></a>

### What the Studio needs of any provider

- **The `studio` client**: confidential, Authorization Code with PKCE S256, redirect URI `<publicUrl>/auth/callback`,
  post-logout redirect `<publicUrl>`, back-channel logout to `<publicUrl>/auth/backchannel` with the session id.
- **The `web-scumm-cli` client**: public, the device authorization grant, and the client scope `offline_access`.
- **An audience mapper** adding `studio-api` (the configuration's `oidc.audience`) to the access tokens of
  `web-scumm-cli`. It must differ from the `studio` client's id: an id_token is never accepted as an access token.
- **Access tokens of 5 minutes.** Up to 15 if the configuration says so (`oidc.maxTokenSeconds`, 900 at most): a
  longer token is refused.

The test realm sets all of this (`accessTokenLifespan: 300`, PKCE S256, back-channel logout with the session
required, the `studio-api audience` mapper).

<a name="expected-result"></a>

## Expected result, and how to check it

- `https://<keycloak host>/realms/web-scumm/.well-known/openid-configuration` answers, with
  `backchannel_logout_supported: true` and a `device_authorization_endpoint` (both measured on the managed Keycloak by
  spike S §8).
- Once the Studio is deployed, it starts: it reads the issuer's discovery at start, and does not start while the
  realm is missing. An invited member logs in and `GET /auth/me` gives their role.
- From the CLI, `npm run studio-server -- login --server https://studio.example.fr` ends with `logged in`.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `401 invalid_client` from the admin API | The admin password through `admin-cli` | Create the realm in the console, or with a `security-admin-console` token (step 4) |
| `the login was refused: not_allowed (Offline tokens not allowed for the user or client)` | No `offline_access` scope on `web-scumm-cli`, or no role for the user | Step 5 |
| The Studio does not start, the logs name the issuer | The realm is missing, or `oidc.issuer` is wrong | Create the realm; check the issuer's discovery URL |
| `oidc.audience must differ from oidc.clientId` | The audience set to `studio` | Use `studio-api` |
| A login loops back or the provider refuses the redirect | `redirectUris` still the test realm's `http://localhost:8080/...` | Step 3 |

<a name="files-changed"></a>

## Files or data changed

- The realm in Keycloak (clients, users, roles).
- `~/secrets/my-game/realm.json` and `oidc-client-secret` on your machine (mode 0600, out of Git).
- `STUDIO_OIDC_CLIENT_SECRET` on the studio app.

<a name="recovery"></a>

## Recovery or going back

Delete the realm in the admin console and create it again. Users of the deleted realm get new identities in the new
one (a new `sub`): the Studio sees new users, who need new invitations
([Changing domain or OIDC provider](clever.change-domain.md)).

<a name="references"></a>

## References

- The test realm: [`ops/studio/keycloak/realm.json`](../../ops/studio/keycloak/realm.json); the provider's checks:
  [`studio-server/src/server/auth/oidc.ts`](../../studio-server/src/server/auth/oidc.ts).
- [ADR 0027](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md);
  [`STUDIO_OIDC_CLIENT_SECRET`](reference.environment-variables.md#studio-oidc-client-secret).
- Another provider: [Generic OIDC and GitLab](clever.generic-oidc.md).
