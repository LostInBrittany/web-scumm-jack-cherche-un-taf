# Changing domain or OIDC provider

Moving a running Studio to new names, or to another OpenID Connect provider. The game and its history do not move;
what changes is how people reach it and who the Studio thinks they are.

<a name="what-you-get"></a>

## What you get

The Studio served at its new `publicUrl` and `playUrl` (or logging people in through the new provider), every member
back with their role, and the old names or the old provider retired.

<a name="context-and-versions"></a>

## Context and versions

- A hosted Studio on Clever Cloud, from 4.2.3.
- **Verified on: not verified on a live installation.** Neither change was exercised; what follows is read from the
  code and the deployment guide.

<a name="prerequisites"></a>

## Prerequisites

- The new subdomains of your domain ([Domains and TLS](clever.domains-tls.md)), or the new provider set up
  ([Keycloak](clever.keycloak.md), [Generic OIDC](clever.generic-oidc.md)).
- A backup taken just before ([Backups](clever.backups.md#steps), step 3), and the list of members with their roles
  (`GET /api/members` as an owner).

<a name="where-to-run"></a>

## Where to run the commands

`clever …`: on your machine, in the engine repository where the apps are linked. `invite`: in a shell on the studio
app (`clever ssh --alias my-game-studio`). The provider's settings: in its admin console.

<a name="steps"></a>

## Steps

<a name="domain"></a>

### Changing domain

<!-- step: add-new-names -->
1. Add the new names beside the old ones: both `studio.` and `play.` to the studio app, the worker's to the worker
   ([Domains and TLS](clever.domains-tls.md#steps)).

<!-- step: provider-uris -->
2. At the provider, **add** the new URIs to the `studio` client, keeping the old ones for now: the redirect URI
   `<new publicUrl>/auth/callback`, the post-logout redirect `<new publicUrl>`, and set the back-channel logout URL to
   `<new publicUrl>/auth/backchannel`.

<!-- step: config-domain -->
3. Change `publicUrl`, `playUrl` (and `worker.url` if the worker moves) in the configuration, set it, and redeploy the
   studio ([Configuration](clever.configuration.md#steps), step 5). The server accepts mutations only with `Origin`
   equal to the new `publicUrl`: the old name stops working for writes at once.

<!-- step: tell-members -->
4. Tell the members:
   - **Everyone logs in again** on the new name: the session cookie (`__Host-ws_session`) belongs to the host that set
     it, so the old name's cookie is never sent to the new one.
   - The CLI keeps its tokens per server: `npm run studio-server -- login --server https://<new studio name>`; an MCP
     client configured with the old URL is pointed at the new one.
   - An invitation link printed before still works with its host changed to the new name: the token is the same.
   - The published builds' URLs (`/play/<n>/` on the game's origin) change with `playUrl`.

<!-- step: retire-old -->
5. Once everyone is on the new name, remove the old URIs at the provider and the old names from the apps
   (`clever domain rm <old name> --alias my-game-studio`).

<a name="provider"></a>

### Changing OIDC provider

The Studio knows a person by the provider's `(iss, sub)`. A new provider gives everyone a new identity: to the Studio
they are new users, members of nothing. The roles have to be given again, by invitation.

<!-- step: switch-provider -->
6. Set the new provider's client secret and the configuration's `oidc` (`issuer`, `clientId`, `audience`,
   `cliClientId`), and redeploy the studio. It reads the new issuer's discovery at start. Every session ends at its next
   check (the old provider's refresh tokens mean nothing to the new one), and the old provider's Bearer tokens are
   refused.

<!-- step: reinvite -->
7. Re-invite each member, with their role, from the operator's side; each logs in through the new provider with the
   same verified email:

   ```sh
   # in a shell on the studio app (clever ssh --alias my-game-studio)
   cd "$APP_HOME" && npm run studio-server -- invite --email lea@example.fr --role dev
   ```

<!-- step: remove-old-members -->
8. As an owner on the new provider, remove the old identities from the members list: they still appear (and the last
   owner of them cannot be removed until a new owner exists, step 7).

> [!LIMIT id=history-keeps-old-names]
> The game's history, comments and audit log keep the authors as they were written, under the old identities. Nothing
> merges an old identity into a new one.

<a name="expected-result"></a>

## Expected result, and how to check it

- Domain: `https://<new studio name>/readyz` answers 200, a member logs in there and writes, the game shows in the room
  view (the game's frame on the new `playUrl`).
- Provider: `GET /api/members` lists every member with a new identity and their role; `GET /auth/cli` names the new
  issuer.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| The provider refuses the redirect | The new callback URI not added to the `studio` client | Step 2 |
| `forbidden` (403) on every save | A tab still open on the old name | Reload on the new name |
| "not a member of this project" after the provider change | Not re-invited yet | Step 7 |
| The game's frames stay empty | `playUrl` not on the same domain as `publicUrl` | Two subdomains of one domain |

<a name="files-changed"></a>

## Files or data changed

`STUDIO_CONFIG_JSON` (and the client secret for a provider change); the apps' domains; the provider's client; new user
and member rows, invitations and audit entries. The game's files and history do not change.

<a name="recovery"></a>

## Recovery or going back

- Domain: set the old URLs back and redeploy, as long as the old names and URIs were kept (step 5 not done yet).
- Provider: set the old provider back and redeploy; the old identities are still members unless step 8 removed them.

<a name="references"></a>

## References

- [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts) (`publicUrl`, `playUrl`),
  [`studio-server/src/server/auth/store.ts`](../../studio-server/src/server/auth/store.ts) (identities, invitations),
  [`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts) (cookies, callback).
- [Security](clever.security.md), [Recovering admin access](clever.admin-recovery.md).
