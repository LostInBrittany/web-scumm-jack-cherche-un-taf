# Security: Biscuit and signatures

How the Reality Bridge decides who may propose a signal, how a player knows the Bridge accepted it, which secrets
exist and where they live, how keys rotate and tokens are revoked, and what to do when one leaks. Two mechanisms, each
for one question: **Biscuit** says who may propose what, on the Bridge only; an **Ed25519 signature** says what the
Bridge accepted, verified by the player.

<a name="secrets"></a>

## The secrets and where they live

| Secret | Where | Who reads it | If it leaks |
|---|---|---|---|
| The Biscuit root's private half | `root.key` (mode 600) | `grant` only; `serve` never loads it | Anyone can mint connector tokens: [a new root](#procedures) |
| The event-signing key (Ed25519) | `config.json` (`eventKey`, mode 600) | `serve` | Anyone can sign signals players accept: [rotate](#procedures) |
| The operator's token | `admin-token` (the only copy in clear); its SHA-256 in `config.json` | `revoke`, the `/v1/admin/*` routes | Anyone can export, delete and revoke. No command replaces it alone: make one with `init` in a scratch folder, copy its `adminTokenHash` into `config.json` and its `admin-token` beside it, restart |
| A connector's Biscuit | the connector's `tokenFile` | that connector | Revoke it by id, grant a new one |
| A demonstration webhook's secret and token | `config.json` (`webhooks`) | `serve` | Re-`init`, or never enable them on the Internet (`--no-demo-webhooks`) |
| A player's capability | the player's browser (`localStorage`); its SHA-256 on the Bridge | the player's page | Revoke the player's link |
| The database URL and password | `BRIDGE_STORE` or `BRIDGE_STORE_FILE`, never the file | `serve` and the commands | Change the password |

Keep `root.key` where the Bridge is not, if you can: a Bridge that only serves does not need it.

<a name="biscuit"></a>

## Biscuit: who may propose what

A connector's token is minted by `grant` from the root key. Its authority block names the game, the sources, the
signals, the players (or any player of the game), the Bridge's audience, the tenant (from 4.1.10), whether it may
confirm pairing codes (`--pair`), and an expiry to the second (refused from that second on). The Bridge checks each
proposal against [`bridge/policy/propose.datalog`](../../bridge/policy/propose.datalog), and each pairing confirmation
against [`pair.datalog`](../../bridge/policy/pair.datalog), within 200 ms of Biscuit's run time.

- A connector can attenuate its own token (fewer players, an earlier expiry) before handing it on; it can never widen
  it.
- Every token has revocation ids; revoking any of them refuses the token.
- The order of checks gives nothing away: the manifest answers first (it is public), then the token, before any player
  is named, so a caller without a valid token learns nothing of which players exist (a 401 or 403 before any 404).
- An address that fails 60 authentications in a minute has every request refused for a while (429).
- Biscuit only says who may propose. A connector checks what it claims itself: a badge's proof, an email's sender.

> [!GUARANTEE id=bridge-bad-token-before-player]
> A bad token is refused before an unknown player is named, and an address out of failed authentications waits.

<a name="signatures"></a>

## Signatures: what the Bridge accepted

The Bridge signs every accepted signal as a compact JWS (`alg: EdDSA`, a `kid` naming the key). The player verifies
the signature on the exact bytes it received before it parses them, then the size, the key's window, the game, the
player, the manifest and the expiry, with five minutes of tolerance for the device's clock. The player holds neither a
Biscuit nor a key: only a capability that reads and acknowledges its own signals.

A `WorldSignalV2` also names its tenant, environment, the origin the player paired from, the link and the key, so a
signal signed for one context is refused in another (`audience-mismatch`), even when two tenants were (wrongly) given
one key. A Bridge serving several tenants signs V2 only, and lists its keys with their tenant; a single-tenant Bridge
signs V1 unless its configuration says `signalVersion: 2` (`init --signal-version=2`). The player accepts both by
default. Every field: [Signals and the manifest](bridge.signals-manifest.md#world-signal).

The demonstration webhook (`POST /v1/hooks/<source>`) is authenticated otherwise: an HMAC-SHA256 of the raw body
under the webhook's secret, in `X-Web-Scumm-Signature: sha256=<hex>`, compared in constant time.

<a name="keys"></a>

## Keys and rotation

The event key signs every signal with its `kid`; the player trusts the keys `GET /v1/keys` lists, each within its
window.

```sh
# in the engine repository (the Bridge's folder)
npm run bridge -- rotate --keep-days=30
```

`rotate` makes a new key and keeps the current one in `previousKeys` for `--keep-days` days; then restart the
Bridge. From then on the Bridge delivers every signal under its current key: what was waiting for a player is signed
again at delivery (the store keeps the payload as accepted), and a player whose link was open asks for the keys once
when a signal names one it does not know. `--keep-days` only has to cover a player that received a signal just before
the rotation and verifies it after.

> [!LIMIT id=bridge-rotation-resets-run-quota]
> The speedrun leaderboards' rate buckets are keyed by an HMAC derived from the event key: rotating it starts every
> client on a new bucket (at most one more minute's quota).

The Biscuit root key mints connector tokens: rotating it means granting every connector a new token.

<a name="revocation"></a>

## Revocation

```sh
# in the engine repository, the Bridge running
npm run bridge -- revoke --url=<bridge> --player=<p-…>           # a player's link
npm run bridge -- revoke --url=<bridge> --token=<revocation id>  # a connector's token (any of its revocation ids)
```

A revoked player's streams end at once, and its proposals are refused, including one that overlaps the revocation
(the player and the token are checked again inside the per-player step). A player can revoke its own link: the pause
menu's "Unlink" (`POST /v1/unlink`). A capability also ends on its own: 30 days after its last acknowledgement, 180
days after its pairing at most.

<a name="procedures"></a>

## Procedures

**An event key compromised (one tenant).** `rotate --dir=<tenant>`, then remove the compromised key from
`previousKeys` in that tenant's `config.json`, and restart its instances. Players refuse what it signed from then on;
what waits for them is signed again under the new key at delivery. The other tenants are untouched.

**A Biscuit root compromised.** `init --force` is too much. Make a new root (`init` in a scratch folder, copy its
`biscuitRoot` into `config.json` and its `root.key`), grant every connector of the tenant a new token, restart, then
revoke the old tokens' ids (`revoke --token=`) for the window before the restart.

**An instance or its host compromised.** It held every private key of the tenants it served: rotate each tenant's
event key, make each tenant a new root, change the database password and the operator tokens, and read the store's
quarantine (`doctor`) and the logs since the compromise.

**Rotation, routinely.** Per tenant, at its own pace: `rotate --dir=<tenant> --keep-days=30`, then restart its
instances one by one (the others keep serving; the store is the same).

<a name="why"></a>

## Why

A signal crosses three hands: a connector, the Bridge, the player's browser. Each must be able to check the one
before, and a token stolen at one step must not open the others. A connector's Biscuit opens nothing on the player's
side; a player's capability proposes nothing; the event key signs but authorises no connector.

<a name="alternatives"></a>

## Alternatives set aside

- **COSE** for the signed signal: a CBOR decoder in the player for nothing a JWS lacks here; the fallback if a
  supported browser drops Ed25519 (D15).
- **Biscuit in the player**: the player holds a narrow capability instead (D16).
- **Per-tenant keys derived by construction**: the player cannot check a derivation whose root it does not hold; a
  signal names its context instead (ADR 0010).

<a name="trade-offs"></a>

## Trade-offs

Two formats to keep, keys to rotate, and a Rust cross-check of Biscuit in CI (`npm run reality:xcheck`: the
WebAssembly build used in production and the Rust crate must agree on Biscuit's official samples). A capability in a
browser is readable by any script of the page: it is narrow (read and acknowledge one player's signals) and ends on
its own, but it is not a secret the page can keep from itself.

<a name="decisions"></a>

## Decisions and ADRs

- [ADR 0007](../../docs/dev/adr/0007-biscuit-and-signed-events.md): Biscuit authorises a connector; a signature attests
  an event (D15, D16; the measures in [`docs/dev/reality-spike.md`](../../docs/dev/reality-spike.md)).
- [ADR 0010](../../docs/dev/adr/0010-signal-v2.md): a signed signal names the context it was signed for.
- The threat models: [`docs/dev/THREAT-MODEL.md`](../../docs/dev/THREAT-MODEL.md),
  [`docs/dev/threat-models/constellation.md`](../../docs/dev/threat-models/constellation.md).
- The code: [`bridge/src/biscuit.ts`](../../bridge/src/biscuit.ts), [`bridge/src/policy.ts`](../../bridge/src/policy.ts),
  [`bridge/src/sign.ts`](../../bridge/src/sign.ts), [`src/engine/reality/protocol.ts`](../../src/engine/reality/protocol.ts).
