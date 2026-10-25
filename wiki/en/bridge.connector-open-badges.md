# Open Badges connector

The Open Badges connector serves a small form: a player posts a badge (an Open Badges 2.0 assertion or a 3.0
credential) with the pairing code their game shows, the connector verifies the badge, and the verdict (`valid`,
`invalid`, `expired`, `revoked`, `indeterminate`) proposes the signal the game declares for it. The game never receives
the badge. It is experimental, like every connector ([Connectors overview](bridge.connectors.md)).

<a name="what-you-get"></a>

## What you get

A `quest-n-click-connector open-badge` process answering `POST /v1/badges`, fetching the badge's documents under a
strict network policy, and proposing one signal per badge and verdict.

<a name="context-and-versions"></a>

## Context and versions

- A connector beside a running Bridge, from 4.1.9. This page applies from 4.3.0, when a badge signed with a weak or
  foreign key became `invalid` (an `eddsa-jcs-2022` proof checked with an Ed25519 key only; RS256 needs a modulus of
  at least 2 048 bits, ES256 a P-256 key).
- **Verified on: not replayed for this page.** CI plays it from the release archive (`npm run connector-archive-e2e`)
  and against twelve badge fixtures (`tests/connectors-badges.test.ts`); no person has yet shown it a real badge.

<a name="prerequisites"></a>

## Prerequisites

- A running Bridge ([Install and run the Bridge](bridge.install-run.md)) and a game that declares the issuers it
  trusts and the signal of each verdict ([Signals and the manifest](bridge.signals-manifest.md#reality-connectors)):

  ```ts
  'open-badge': { issuers: ['https://badges.example.org/issuer'], valid: 'badge.valid', revoked: 'badge.refused' }
  ```

- A page of yours that posts the form to the connector (the connector serves the route, not a page).

<a name="where-to-run"></a>

## Where to run the commands

`grant` where the Bridge's folder is; the connector behind your HTTPS proxy, in a folder holding its configuration and
token. `npm run connector -- open-badge …` in the engine repository, `npx quest-n-click-connector open-badge …` with
the package.

<a name="steps"></a>

## Steps

<!-- step: grant -->
1. Grant the connector its token, for the badge signals only, with pairing:

   ```sh
   # in the engine repository (the Bridge's folder is .cache/bridge)
   npm run bridge -- grant --connector=garden-badges --source=badge --signals=badge.valid,badge.refused --pair > badge.token
   ```

<!-- step: config -->
2. Write its configuration, `badge.json`; `hosts` defaults to the hosts of the game's `https:` issuers:

   ```json
   {
     "bridge": { "url": "http://127.0.0.1:8787/", "tokenFile": "badge.token" },
     "gameId": "signals",
     "health": { "port": 9304 },
     "open-badge": { "port": 8790, "hosts": ["badges.example.org"] }
   }
   ```

<!-- step: run -->
3. Start it:

   ```sh
   # in the engine repository
   npm run connector -- open-badge --config badge.json
   ```

   It refuses to start when the game declares no `reality.connectors['open-badge']`.

<!-- step: post -->
4. A player posts, with a code the game has just shown:

   ```sh
   # from the player's side (your form does this)
   curl -s -X POST http://127.0.0.1:8790/v1/badges -H 'Content-Type: application/json' \
     -d '{"code":"ABCD2345","badge":"https://badges.example.org/assertions/42","email":"player@example.org"}'
   ```

   `badge` is a URL, a compact JWS, or the credential itself; `email` (or `recipient`) is what a hashed recipient is
   checked against. The answer is `202 {"status":"valid","signal":"accepted"}`, or `200 {"status":"…","signal":"none"}`
   when the game declares no signal for that verdict.

<a name="expected-result"></a>

## Expected result, and how to check it

- `GET http://127.0.0.1:9304/health` answers 200 `{"connector":"open-badge","ok":true,"detail":"form on port 8790",…}`.
- The connector logs `"event":"open-badge.verdict"` with the status and the format; the Bridge logs
  `"event":"pairing.confirmed"`, then `"event":"signal.accepted"`.

<a name="common-errors"></a>

## Common errors

| Answer | Cause | Fix |
|---|---|---|
| 422 `{"error":"pairing-pairing"}` | The code is unknown, expired or used already: a code serves once | A new code from the game |
| 400 `{"error":"shape"}` | Not JSON, or no `code` | Post `{ code, badge, email? }` |
| 202 with `"status":"indeterminate"` | A proof suite it cannot check (`eddsa-rdfc-2022`…), or a document it could not fetch under its policy | Ask the issuer for a supported format; check `hosts` |
| 202 with `"status":"invalid"` | Another issuer than the game's, a recipient that does not match, a bad or weak signature | — |
| 413, or 429 `{"error":"rate"}` | A body over 64 KB; over 30 posts a minute from one address | — |

<a name="files-changed"></a>

## Files or data changed

None on disk. Revocation and status lists are cached in memory for at most a day.

<a name="recovery"></a>

## Recovery or going back

Stop the process (SIGTERM). Revoke its token on the Bridge if it leaked, and grant a new one.

> [!LIMIT id=bridge-badge-code-once]
> A pairing code serves once. Each post needs a code the game has just shown, and confirming it links the game to a
> new pseudonymous player, as any pairing does.

<a name="verification"></a>

## Reference: what is verified

- **Open Badges 2.0**: hosted (the assertion fetched again from its own id) or signed (a JWS whose key the issuer
  owns). **3.0**: a VC-JWT, or a Data Integrity proof `eddsa-jcs-2022`; other suites, such as `eddsa-rdfc-2022`, are
  `indeterminate`, never `valid`.
- The issuer among the game's `issuers`; the recipient against the email (hashed with the badge's salt, then
  dropped); the dates; the revocation (OB2 revocation lists, OB3 `1EdTechRevocationList` and Bitstring status lists,
  cached at most a day).
- From 4.3.0, a key too weak for its algorithm makes the badge `invalid` (an RSA key under 2 048 bits, a curve other
  than P-256 for ES256, anything but Ed25519 for `eddsa-jcs-2022`).
- The key is `sha256('open-badge:' + player + ':' + badge id + ':' + verdict)`: the same badge with the same verdict
  for the same player is one signal.

<a name="network-policy"></a>

## Reference: the network policy

Every document is fetched under one policy: `https:` only; hosts from `hosts` (by default the hosts of the issuers);
the name resolved once, and no private, loopback, link-local, multicast or unspecified address (IPv4, IPv6 and
IPv4-mapped IPv6); two redirects at most, each checked again; 64 KB; 10 seconds; JSON nested at most 8 deep;
`@context` never fetched.

> [!GUARANTEE id=bridge-badge-network-policy]
> A fetch without `https:`, to a host off the list, with credentials in its URL, or whose name resolves to a private
> address is refused, and a name is resolved once (no rebinding).

The `open-badge` section:

| Field | Default | Meaning |
|---|---|---|
| `port`, `host` | —, `127.0.0.1` | Where `POST /v1/badges` listens |
| `hosts` | the hosts of the game's `https:` issuers | Where documents may be fetched from |
| `perMinutePerIp` | 30 | Posts a minute per address |
| `maxBytes` | 65 536 | A post's body |

<a name="privacy"></a>

## What it keeps

The badge and the documents it points to are fetched, checked and dropped; only a verdict leaves the connector, as a
signal, with a hash of the badge's id and issuer as `evidenceHash`. The email a player gives to match a hashed
recipient is hashed with the badge's salt for the comparison, then dropped: never stored, logged or sent. Revocation
and status lists (an issuer's, not a person's) are cached for at most a day. The addresses that post to the form are
counted in memory for a minute (the rate limit), then forgotten.

<a name="references"></a>

## References

- The code: [`connectors/src/badges/connector.ts`](../../connectors/src/badges/connector.ts),
  [`verify.ts`](../../connectors/src/badges/verify.ts), [`fetch.ts`](../../connectors/src/badges/fetch.ts).
- The threat model: [`docs/dev/threat-models/open-badge.md`](../../docs/dev/threat-models/open-badge.md).
- Tested by [`tests/connectors-badges.test.ts`](../../tests/connectors-badges.test.ts).
