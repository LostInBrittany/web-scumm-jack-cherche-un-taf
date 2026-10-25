# Invitations

Nobody is a member of a team Studio by default: an invitation makes one. This page says how an owner invites someone,
how the first owner gets in, and what an invitation can and cannot do.

<a name="what-you-get"></a>

## What you get

A one-time link for one email address and one role. When that person opens it and logs in with that email, verified
by the identity provider, they become a member with that role.

<a name="context-and-versions"></a>

## Context and versions

A hosted Studio (the Studio Server) with an OpenID Connect provider, from 4.2.1. The local Studio has no members and no
invitations.

<a name="prerequisites"></a>

## Prerequisites

- An owner, to invite from the Studio or the API; or a shell on the server's machine, for the first owner.
- The person has an account at the provider, with a **verified** email address: the invitation checks the email the
  provider says is verified, never one typed by hand.

<a name="where-to-run"></a>

## Where to run the commands

- In the Studio: your name in the header, then **Members…** (owners only).
- Through the API: from any machine, with an owner's Bearer token.
- The first owner: on the machine of the `studio` app, where the server's configuration is (on Clever Cloud, in
  `clever ssh`), in the engine repository's folder.

<a name="steps"></a>

## Steps

<!-- step: first-owner -->
1. **The first owner** comes from the command line, since nobody can invite yet:

   ```sh
   # on the studio app's machine, in the engine repository (on Clever Cloud: clever ssh, then cd "$APP_HOME")
   npm run studio-server -- invite --email you@example.fr --role owner
   ```

   It prints the link. The configuration comes from `--config <file>` or from `STUDIO_CONFIG_JSON`, which the shell of
   `clever ssh` already has. From the release archive the command is
   `npx quest-n-click-studio-server invite --email you@example.fr --role owner --config studio.config.json`.

<!-- step: invite-in-studio -->
2. **Any other member**, in the Studio: **Members…**, then the **Invite** form. Type the email (verified at the
   provider), choose the role (`owner`, `dev` or `reviewer`; `dev` is preselected), and click **Create the invitation
   link**. The link appears with a **Copy** button.

   Through the API, as an owner:

   ```sh
   # anywhere, with an owner's token
   curl -X POST -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
     -d '{"email": "lea@example.org", "role": "dev"}' https://studio.example.fr/api/invitations
   ```

   It answers `{"link": "https://studio.example.fr/auth/login?invite=…", "expiresInDays": 7}`.

<!-- step: send-link -->
3. **Send the link yourself** (the Studio sends no email): by chat, by mail. It is shown once; only its hash is stored.

<!-- step: accept -->
4. **The person opens the link** and logs in at the provider with that email. On the way back they are a member with
   the invited role. See [Starting as an invited dev](team.first-day.md).

<a name="expected-result"></a>

## Expected result, and how to check it

- In **Members…**, the person is listed with their role; the invitation leaves "Invitations not used yet".
- The audit log shows `invited` (who invited whom, with which role), then `joined as <role>` (`invitation-accepted`).
- As them, `GET /auth/me` answers their role.

<a name="rules"></a>

## The invitation's rules

- **7 days**, then it no longer works.
- **Used once.** A second use, by anyone, does nothing.
- **For one verified email.** The email the provider gives must be the invited one (compared without case), and the
  provider must say it is verified.
- **It gives the role it names.** Accepting an invitation replaces the role the person had, except that the last owner
  cannot lose the owner role this way.
- A refused invitation does not stop the login: the person is logged in but not a member, and sees the page "Access
  not granted", "Ask an owner of the project for an invitation." The audit log records `invitation-refused` with the
  reason (`the invitation is not valid`, `the invitation is for another verified email`, or
  `the last owner stays an owner`).

> [!GUARANTEE id=invitation-once-verified-email]
> An invitation is used once, and only by a person whose verified email is the one it names.

> [!LIMIT id=invitation-no-revoke]
> A pending invitation cannot be withdrawn: there is no route, in the Studio or the API, to cancel it. It expires after
> 7 days. If a link leaked, wait it out, or remove the person once they joined (see
> [Managing members](team.members.md#remove)). There is no command to list invitations either, other than
> `GET /api/members` (its `invitations`: email, role, expiry) and the Members panel.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| The person logs in and sees "Access not granted" | The invitation expired, was used, or their verified email differs | The audit log says which (`invitation-refused`, reason). Invite again with the email the provider has |
| `` `email` is required `` (400) | The address is empty or malformed | Give a full address |
| `` `role` is owner, dev or reviewer `` (400) | Another role name | Use one of the three |
| `usage: studio-server invite --email <email> --role <owner\|dev\|reviewer> --config <file>` (exit 2) | A flag missing, or a flag where a value belongs | Give both flags with values |
| `this login has expired or was already used: start again` (400) | The login page was left open more than 10 minutes, or reloaded | Open the invitation link again |

<a name="files-changed"></a>

## Files or data changed

A row in the database (`studio_invitations`: the email, the role, the hash of the token, its expiry), then a member
row when it is accepted; two audit lines. No game file.

<a name="recovery"></a>

## Recovery or going back

A wrong role is changed in **Members…** (see [Managing members](team.members.md#change-role)). A person who should
not have joined is removed there.

<a name="references"></a>

## References

- [Roles and actions](team.roles.md), [Managing members](team.members.md).
- [`studio-server/src/server/auth/store.ts`](../../studio-server/src/server/auth/store.ts) (`invite`, `accept`).
- [ADR 0027](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md).
