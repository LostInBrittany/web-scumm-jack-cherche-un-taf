# Managing members

An owner of a team Studio lists the members, changes a role, removes someone, ends someone's sessions, and reads the
audit log. This page gives each action in the Studio and through the API, the routes as the code has them, and what
cannot be done.

<a name="what-you-get"></a>

## What you get

The team you want, with the rights you want: who is a member, with which role, and a record of who did what.

<a name="context-and-versions"></a>

## Context and versions

A hosted Studio (the Studio Server) with an OpenID Connect provider, from 4.2.1. Every action here is an owner's. The
routes are in [`studio-server/src/server/auth/routes.ts`](../../studio-server/src/server/auth/routes.ts) and
[`auth/store.ts`](../../studio-server/src/server/auth/store.ts); the panel is
[`src/studio/members.ts`](../../src/studio/members.ts).

<a name="prerequisites"></a>

## Prerequisites

- The `owner` role (see [Roles and actions](team.roles.md)).
- For the API: an owner's access token (`npm run studio-server -- token --server <url>`, see
  [The server's command line](team.server-cli.md#token)).

<a name="where-to-run"></a>

## Where to run the commands

- In the Studio: your name in the header, then **Members…**. The panel shows the members (person, role, active
  sessions, whether they are here now), the **Invite** form, the invitations not used yet, and the 30 latest lines of
  the audit log.
- Through the API: from any machine, with an owner's token, against the Studio's public URL.
- There is **no command-line subcommand** for these actions: the server's CLI only has `invite` (see
  [Invitations](team.invitations.md)).

<a name="steps"></a>

## Steps

<!-- step: list -->
1. **List the members.** Open **Members…**, or call `GET /api/members` (see [below](#list)).

<!-- step: change-role -->
2. **Change a role.** In the member's row, choose the new role in the list and confirm ("Make Léa reviewer?"). Or
   `PUT /api/members/<id>` with `{"role": "reviewer"}` (see [below](#change-role)).

<!-- step: end-sessions -->
3. **Log someone out everywhere.** Click **End sessions** and confirm. They stay a member and can log in again. Or
   `DELETE /api/members/<id>/sessions` (see [below](#end-sessions)).

<!-- step: remove -->
4. **Remove a member.** Click **Remove** and confirm ("Their access ends at their next request."). Or
   `DELETE /api/members/<id>` (see [below](#remove)). To come back they need a new invitation.

<!-- step: read-audit -->
5. **Read the audit log**, at the bottom of the panel, or `GET /api/audit` (see [below](#audit-log)).

<a name="list"></a>

## `GET /api/members`

### Form

```sh
# anywhere, with an owner's token
curl -H "Authorization: Bearer $TOKEN" https://studio.example.fr/api/members
```

### Values

```json
{
  "members": [{ "id": "…", "email": "lea@example.org", "name": "Léa", "role": "dev", "sessions": 1 }],
  "invitations": [{ "email": "sam@example.org", "role": "reviewer", "expiresAt": 1761300000000 }]
}
```

- `members`: every member, sorted by email; `id` is the Studio's user id (the one the other routes take); `sessions`
  counts the browser sessions not yet expired (a Bearer token is not a session).
- `invitations`: those not used and not expired; `expiresAt` in milliseconds since 1970.

<a name="change-role"></a>

## `PUT /api/members/<id>`

### Form

`PUT /api/members/<id>` with the JSON body `{"role": "owner" | "dev" | "reviewer"}`. Answers `{"ok": true}`.

### Effects

- The new role applies at the person's next request.
- It counts as a revocation: their live streams close (within 5 s) and reopen with the new role, their page starts
  again, and **every lease they held is released at once**.
- The audit log records `member-role` with the target and the new role.

### Constraints

- **The last owner stays an owner**: demoting the only owner is refused with **409** `the last owner stays an owner`.
  To hand the project over, make the other person an owner first, then demote yourself.
- An owner may demote themselves when another owner remains (the Studio asks "This is you.").
- Another role name: **400** `` `role` is owner, dev or reviewer ``. An unknown id: **404** `no such member`.

<a name="end-sessions"></a>

## `DELETE /api/members/<id>/sessions`

Ends every browser session of the member and refuses every access token issued before now. Their live streams close
within 5 s and their leases are released. They stay a member: they can log in again at once, and the CLI can get a new
token from its refresh token. Use it after a lost laptop, together with a password change at the provider. The audit
log records `sessions-revoked`.

<a name="remove"></a>

## `DELETE /api/members/<id>`

### Effects

- The membership is deleted, every session of the person ends, and every access token issued before now is refused.
- Their access ends at their **next request**, through the browser, the CLI or the MCP; their live streams close
  within 5 s; their leases and their presence go at once, so nobody waits on a span they can no longer release.
- Their past operations stay in the journal under their name, and their comments stay.
- The audit log records `member-removed`.

### Constraints

- **The last owner cannot be removed** (409 `the last owner stays an owner`).
- To come back, the person needs a new invitation.

> [!GUARANTEE id=owner-last-owner-and-removal]
> The last owner cannot be demoted (409), and a member removed loses access at their next request, session and earlier
> access tokens alike.

The last owner cannot be removed either: the same check answers 409.

<a name="provider-side"></a>

## Accounts disabled at the provider

The Studio checks each browser session with the provider every 5 minutes. When the provider disables an account, its
sessions end at the next check, within 15 minutes (R). A back-channel logout from the provider ends the named sessions
at once. While the provider cannot be reached for more than 15 minutes, sessions are suspended (503) until it answers
again. Removing someone in the Studio is immediate; disabling them at the provider is the way to stop them on every
service at once. See [ADR 0027](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md).

<a name="audit-log"></a>

## `GET /api/audit`

### Form

```sh
# anywhere, with an owner's token
curl -H "Authorization: Bearer $TOKEN" https://studio.example.fr/api/audit
```

### Values

`{"entries": [{"at", "actor", "event", "detail"}]}`, the **200 most recent** entries, newest first. `at` is in
milliseconds since 1970; `actor` is the Studio's user id of who acted, `null` when nobody did (the provider, a refused
callback), or `studio-server invite` for an invitation made from the command line.

| `event` | When | `detail` |
|---|---|---|
| `login` | someone logged in through the browser, member or not | `{}` |
| `logout` | someone logged out | `{}` |
| `login-failed` | the provider's answer was refused at the callback | `{reason}` |
| `backchannel-logout` | the provider ended sessions | `{sid, sub, users}` |
| `invited` | an invitation was made | `{email, role}` |
| `invitation-accepted` | someone joined | `{role}` |
| `invitation-refused` | an invitation could not be used | `{reason}` |
| `member-role` | a role changed | `{userId, role}` |
| `member-removed` | a member was removed | `{userId, role: null}` |
| `sessions-revoked` | an owner ended someone's sessions | `{userId}` |
| `lease-takeover` | an owner took a span over | `{span, previous}` |

The Members panel shows the 30 latest, in words ("Léa removed Tom").

> [!LIMIT id=audit-no-paging]
> The API gives the 200 latest entries only, with no filter, no paging and no export. The server never deletes audit
> lines: they stay in the `studio_audit` table and in every backup. To read more, query the database read-only, for
> instance `SELECT at, actor, event, detail FROM studio_audit ORDER BY at DESC` with `psql` on the database's URI.
> Writes to the game are not in the audit: they are in the journal, by author (`GET /api/ops`).

<a name="not-possible"></a>

## What cannot be done

- **No command-line subcommand** lists, demotes or removes members, or reads the audit: the API or the Studio only.
- **No pending invitation can be withdrawn** ([Invitations](team.invitations.md#rules)).
- **No transfer in one step**: promote, then demote.
- **No member can be added without them logging in**: membership always comes from an invitation accepted with a
  verified email.
- **No suspension that keeps the membership**: "End sessions" logs out, but the person can log in again; to stop them,
  remove them, or disable them at the provider.

<a name="expected-result"></a>

## Expected result, and how to check it

The Members panel shows the change, and its line appears in the audit log. A removed person who tries again gets 401
(their session is gone), then "Access not granted" after logging in.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| 409 `the last owner stays an owner` | You demote or remove the only owner | Make someone else owner first |
| 404 `no such member` | The id is not a member (already removed?) | `GET /api/members` for the ids |
| 403 `this needs the role owner` | Your role is not owner | Ask an owner |
| 401 on `/api/members` with a token | The token is expired or was revoked | Get a new one: `npm run studio-server -- token --server <url>` |

<a name="files-changed"></a>

## Files or data changed

Rows of `studio_members`, `studio_sessions` and `studio_users` (`revoked_before`) in the database, and one audit line
per action. No game file.

<a name="recovery"></a>

## Recovery or going back

A role changed by mistake is changed back. A removal cannot be undone: invite the person again. Losing every owner is
not possible through these routes; if the owner's account is lost at the provider, see
[Recovering admin access](clever.admin-recovery.md).

<a name="references"></a>

## References

- [Roles and actions](team.roles.md), [Invitations](team.invitations.md).
- [ADR 0027](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md): identity, revocation within R = 15 min.
