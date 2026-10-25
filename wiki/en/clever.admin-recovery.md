# Recovering admin access

What to do when nobody can act as owner of the Studio any more, or when the provider's own administration is lost.
The Studio never leaves a project without an owner by itself; losing access comes from outside it (an account lost at
the provider, a person gone).

<a name="what-you-get"></a>

## What you get

An owner who can log in again, made from the operator's side through `clever ssh`, and the old owner demoted or removed
if needed; or, for Keycloak, its administration back.

<a name="context-and-versions"></a>

## Context and versions

- A hosted Studio on Clever Cloud, from 4.2.3. You have access to the Clever Cloud organisation (that is the operator's
  recovery path: whoever can `clever ssh` into the studio app can make an owner).
- **Verified on: not verified on a live installation.** The invitation command itself ran on the reference deployment
  (19 October 2026) to make the first owner; this recovery was not exercised.

> [!GUARANTEE id=last-owner-stays]
> The last owner cannot be demoted (409), not even by accepting an invitation of a lower role for their own email.

Removing the last owner goes through the same check in the code (409 "the last owner stays an owner"), so a project
keeps an owner on the Studio's side.

<a name="prerequisites"></a>

## Prerequisites

- `clever-tools` logged in to the organisation that holds the apps.
- An email address that the provider says is **verified**, for the person who will become owner, and an account at the
  provider with it.

<a name="where-to-run"></a>

## Where to run the commands

In a shell on the studio app: `clever ssh --alias my-game-studio`, from your machine, in the engine repository where
the app is linked. That shell has the configuration and the database's credentials, so the command needs no
`--config`.

<a name="steps"></a>

## Steps

<!-- step: ask-owner -->
1. If another owner can still log in, ask them: they change roles in the Studio's members screen
   ([Managing members](team.members.md)). Stop here.

<!-- step: provider-account -->
2. If the owner's account at the provider is the problem (password lost, account disabled), fix it there first: in
   Keycloak's admin console, reset the user's password or enable them. Their identity in the Studio is the provider's
   `(iss, sub)`, so the same account gets the same role back. Stop here if that works.

<!-- step: invite-owner -->
3. Otherwise, make a new owner from the operator's side:

   ```sh
   # in a shell on the studio app (clever ssh --alias my-game-studio)
   cd "$APP_HOME" && npm run studio-server -- invite --email new-owner@example.fr --role owner
   ```

   It prints a one-time link, valid 7 days, and records `invited` in the audit log with `studio-server invite` as its
   actor. The person opens it and logs in with that verified email: they become owner (an existing member's role is
   replaced).

<!-- step: tidy -->
4. Logged in as the new owner, demote or remove the lost account in the members screen, now that it is no longer the
   last owner. A removal ends its sessions and refuses its tokens at the next request.

<a name="keycloak-admin"></a>

### The Keycloak admin is lost

The managed Keycloak's first admin password is temporary; once changed, Clever's console and
`CC_KEYCLOAK_ADMIN_DEFAULT_PASSWORD` keep showing the old one ([Keycloak](clever.keycloak.md#steps), step 2). If the
new one is lost:

- this project documents no way to reset it, and has not tried one; ask Clever Cloud's support first;
- the fallback is a new Keycloak add-on with the realm created again: every member gets a new identity there (a new
  `sub`) and must be invited again. That is [Changing domain or OIDC provider](clever.change-domain.md).

> [!LIMIT id=operator-is-root]
> Whoever can `clever ssh` into the studio app, or holds a backup, can make an owner. Restrict the Clever Cloud
> organisation's members accordingly: the Studio's roles do not protect against the platform's operators.

<a name="expected-result"></a>

## Expected result, and how to check it

The new owner's `GET /auth/me` says `role: owner`; `GET /api/members` lists them as owner; `GET /api/audit` shows
`invited` then `invitation-accepted`.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| Logged in, but "not a member of this project" | The email is not verified at the provider, or another one was invited | Verify the email at the provider; invite that exact email |
| "this login has expired or was already used: start again" | The login page was left more than 10 min, or reloaded | Open the invitation link again |
| The invitation link does nothing after 7 days | It expired | Run step 3 again |
| `usage: studio-server invite --email <email> --role …` | A flag missing or misspelt, or a role other than owner, dev or reviewer | Both `--email` and `--role` |

<a name="files-changed"></a>

## Files or data changed

An invitation row (stored by its hash), then a member row; audit entries. Nothing else.

<a name="recovery"></a>

## Recovery or going back

An unused invitation expires in 7 days. A wrong owner is demoted or removed by another owner.

<a name="references"></a>

## References

- [`studio-server/src/server/auth/store.ts`](../../studio-server/src/server/auth/store.ts) (invitations, the last
  owner), [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts) (`invite`).
- The test behind the guarantee: [`tests/studio-auth.test.ts`](../../tests/studio-auth.test.ts).
- [Invitations](team.invitations.md), [Managing members](team.members.md), [Roles](team.roles.md).
