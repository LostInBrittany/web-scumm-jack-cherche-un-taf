# 0027 · The Studio Server's identity: OIDC for who, the Studio for what (4.2.1)

**Context.** The Studio Server is shared online (D39–D41). It needs authentication that a small team can run on Clever
Cloud with Keycloak or any OpenID Connect provider, and rights a project's owner manages (D41-2). The Bridge's Biscuit
tokens authorise connectors, not people. Plan `docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md` §3, read twice by the
maintainer with Codex.

**Decision.**

1. **The server is an OIDC Relying Party** on `openid-client` (certified) and `jose`, both pinned exactly.
   - Login uses Authorization Code + PKCE S256 + state + nonce. The pre-authentication is server-side, used once, and
     lasts 10 min.
   - The identity is `(iss, sub)`, with the email the provider says is verified.
   - The provider holds no right.
2. **The rights live in the Studio.**
   - Roles are owner, dev and reviewer. Membership comes from one-time invitations (7 days, stored hashed), consumed
     only by the verified email they name.
   - Reading needs a reviewer, writing a dev, the members and the audit log an owner.
   - The last owner can be neither demoted nor removed.
3. **Four HTTP policies, chosen by the request** (plan §3.4).
   - **A, cookie:** a mutation needs the exact `Origin`, `X-Studio-Request: 1` and JSON. The cookie is
     `__Host-ws_session`, `Secure`, `HttpOnly`, `SameSite=Lax`, and only the session id's sha256 is stored.
   - **B, Bearer:** an access token for our audience, used when an `Authorization` header is present; cookies are
     ignored.
   - **C:** the callback.
   - **D:** the back-channel logout, form-encoded, checked per the specification, with replays refused by `jti`.
4. **Bounded revocation, R = 15 min.**
   - **Removed or revoked in the Studio:** the user is refused at the next request (`revoked_before`, sessions
     deleted). A removal, a demotion or an ended session is emitted on a revocation bus, which long connections
     listen to (SSE, PR 6).
   - **Back-channel logout:** the sessions it names end at once: with a `sid`, that provider session only; with a
     `sub` alone, every session and token of the user.
   - **Disabled at the provider:** the session is re-checked every 5 min by its refresh token. A definitive refusal
     ends it; an unreachable provider suspends it after R (fail closed). One refresh runs per session at a time and
     always stores the rotated token, even after the request stopped waiting for it: a provider that revokes a used
     refresh token never ends a session by mistake. A refresh token that no longer opens ends the session.
   - **Bearer tokens** must live 5 min or less.
   - **A provider without refresh tokens** gets sessions of R at most.
5. **Secrets.**
   - Read from `<NAME>_FILE` (0600) or, on Clever Cloud, from the environment. This departs from the house rule
     "secrets in files", because Clever injects variables.
   - Removed from `process.env` at start, never logged.
   - Refresh tokens and id_tokens are sealed with AES-256-GCM under a key ring (`STUDIO_SESSION_KEY`,
     comma-separated: the first seals, any opens; each secret 32 characters or more). The key and its id are
     derived apart with HKDF, so a sealed value reveals nothing of the key.
6. **The CLI** logs in with the device flow through a public client the server names (`/auth/cli`). Its tokens are
   stored in a 0600 file, one entry per server, written whole and renamed under a lock, and sent to https servers
   only.

**Costs.**
- Two more dependencies: `openid-client` and `jose`.
- The provider must be configured with:
  - a confidential client with PKCE, back-channel logout and an audience mapper for the API;
  - a public client with the device grant.

  The guide (PR 8) gives the Keycloak realm.
- Rate limits are per instance and in memory.
- A dev runs code on the server until the separate worker (ADR 0028).

**What would change it.**
- A requirement to manage rights in the provider (groups). The maintainer chose the Studio on 17 October 2026.
- A provider that cannot issue short access tokens. Introspection (RFC 7662) is then the documented option.
