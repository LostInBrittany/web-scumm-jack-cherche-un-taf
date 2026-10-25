# Email connector

The email connector turns a letter into a signal: a player answers the game by email, and the words of the answer
propose the signal the game declares for them. It reads messages from a provider's signed webhook or from a mailbox it
polls over IMAP, and sends no reply. It is experimental, like every connector ([Connectors overview](bridge.connectors.md)).

<a name="what-you-get"></a>

## What you get

A `quest-n-click-connector email` process that links a player by a pairing code sent as an email's subject, then
proposes `letter.door` (or whichever signal the game declares) for each message whose words match an answer, once
per message: a message delivered twice is one signal.

<a name="context-and-versions"></a>

## Context and versions

- A connector beside a running Bridge, from 4.1.9; this page applies from 4.2.5 (the `quest-n-click-connector` name).
- **Verified on:** the webhook mode, as in the steps below, was run on 23 October 2026 against a local Bridge of the
  game `signals` (macOS, Node 22.14, engine 4.4.0): a pairing letter `202 {"status":"paired"}`, an answer
  `202 {"status":"accepted"}`, the same answer again `200 {"status":"duplicate"}`. The IMAP mode was not replayed for
  this page; CI plays both modes from the release archive (`npm run connector-archive-e2e`), against a small IMAP
  server of its own, never a real provider.

<a name="prerequisites"></a>

## Prerequisites

- A running Bridge ([Install and run the Bridge](bridge.install-run.md)), and a game whose `reality.connectors.email`
  declares its answers ([Signals and the manifest](bridge.signals-manifest.md#reality-connectors)):

  ```ts
  connectors: { email: { answers: [{ words: ['open', 'door'], signal: 'letter.door' }], otherwise: 'letter.unclear' } }
  ```

- For the webhook mode: a provider (or a small adapter in front of it) able to post the raw message, signed as below.
  For the IMAP mode: a mailbox reachable over TLS, and its password in a file.

<a name="where-to-run"></a>

## Where to run the commands

`grant` where the Bridge's folder is; the connector on the machine that receives the webhook or reaches the mailbox,
in a folder holding its configuration, token and secret (mode 600). `npm run connector -- email …` in the engine
repository, `npx quest-n-click-connector email …` with the package `quest-n-click-connectors`.

<a name="steps"></a>

## Steps

<!-- step: grant -->
1. Grant the connector its token, for the email signals only, with pairing:

   ```sh
   # in the engine repository (the Bridge's folder is .cache/bridge)
   npm run bridge -- grant --connector=gate-mail --source=email --signals=letter.door,letter.unclear --pair > email.token
   ```

<!-- step: secret -->
2. Write the webhook's shared secret to a file (or, for IMAP, the mailbox's password):

   ```sh
   # in the connector's folder
   node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))' > webhook.secret
   chmod 600 webhook.secret
   ```

<!-- step: config -->
3. Write its configuration, `email.json`. The webhook mode:

   ```json
   {
     "bridge": { "url": "http://127.0.0.1:8787/", "tokenFile": "email.token" },
     "gameId": "signals",
     "health": { "port": 9302 },
     "email": { "mode": "webhook", "domain": "game.example.org", "webhook": { "port": 8789, "secretFile": "webhook.secret" } }
   }
   ```

   Or the IMAP mode:

   ```json
   {
     "bridge": { "url": "http://127.0.0.1:8787/", "tokenFile": "email.token" },
     "gameId": "signals",
     "email": { "mode": "imap", "imap": { "host": "imap.example.org", "user": "gate@example.org", "passwordFile": "imap.password", "pollS": 60 } }
   }
   ```

<!-- step: run -->
4. Start it:

   ```sh
   # in the engine repository
   npm run connector -- email --config email.json
   ```

   It logs `{"event":"email.started","connector":"email","mode":"webhook"}`.

<!-- step: try -->
5. Try the webhook with a signed post. The signature is `sha256=` and the HMAC-SHA256, under the secret, of
   `<timestamp>.<raw message>`; the timestamp is Unix seconds, within five minutes of the connector's clock:

   ```sh
   # in the connector's folder, answer.eml holding a raw message (headers, a blank line, the text)
   node -e '
   const { createHmac } = require("node:crypto");
   const { readFileSync } = require("node:fs");
   const body = readFileSync(process.argv[1]);
   const secret = readFileSync("webhook.secret", "utf8").trim();
   const t = Math.floor(Date.now() / 1000);
   const signature = "sha256=" + createHmac("sha256", secret).update(`${t}.`).update(body).digest("hex");
   fetch("http://127.0.0.1:8789/v1/inbound", { method: "POST", body,
     headers: { "X-Web-Scumm-Timestamp": String(t), "X-Web-Scumm-Signature": signature } })
     .then(async (r) => console.log(r.status, await r.text()));
   ' answer.eml
   ```

   A message whose subject is `PAIR ABCD2345` (the code the game shows) links its sender: `202 {"status":"paired"}`.
   A later message from that sender saying "open the door": `202 {"status":"accepted"}`. The same message again:
   `200 {"status":"duplicate"}`.

<a name="expected-result"></a>

## Expected result, and how to check it

- `GET http://127.0.0.1:9302/health` answers 200 `{"connector":"email","ok":true,"detail":"webhook on port 8789",…}`
  (or `"mailbox polled"`); `GET /metrics` counts proposals, acceptances, duplicates, refusals and rejected inputs.
- The Bridge logs `"event":"pairing.confirmed"`, then `"event":"signal.accepted"` with the signal.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `email: "mode" is "webhook" or "imap"` at start | No mode | Set `email.mode` |
| `email: webhook mode needs "webhook.secretFile"` / `email: imap mode needs "imap.passwordFile"` | The secret is missing | Name its file |
| `email: "imap.tls": false is allowed for a loopback host only (127.0.0.1, ::1, localhost)` | TLS turned off towards a remote server | Keep TLS |
| 401 `{"error":"stale"}` | The timestamp is missing or more than five minutes away | Send Unix seconds; check the clocks |
| 401 `{"error":"signature"}` | Another secret, or the body changed on the way | Sign the exact bytes posted |
| 422 `{"error":"no-player"}` | The sender sent no pairing code, and no recipient tag of `domain` names a player | Pair first, or set `domain` |
| 422 `{"error":"attachment"}` / `"too-large"` / `"unreadable"` | A message with an attachment, over 256 KB, or one the reader refused | Plain text, no attachment |
| 422 `{"error":"pairing-pairing"}` | The pairing code is unknown, expired, or confirmed already | A new code from the game |
| 429 `{"error":"rate"}` | Over 120 posts a minute from one address | Slow down |

<a name="files-changed"></a>

## Files or data changed

- Webhook mode: nothing written; the message is read in memory and dropped.
- IMAP mode: flags in the mailbox. With `keepDays: 0` (the default) a message is deleted as soon as its signal is
  accepted (or found accepted already); with `keepDays: N`, after N days. A message refused for good is flagged
  (`\Flagged`) and kept for the operator. A message refused for a reason that may pass (the Bridge away or busy, a
  quota) stays unseen and is read again at the next poll.

> [!GUARANTEE id=bridge-email-unseen-when-away]
> A message whose signal could not reach the Bridge (the Bridge away) stays unseen and is read again by a later poll;
> one refused for good is flagged.

<a name="recovery"></a>

## Recovery or going back

Stop the process (SIGTERM). Revoke its token on the Bridge (`revoke --token=<revocation id>`) if it leaked, and grant
a new one. Nothing in the game depends on the connector: a game with `letter.door` optional plays on without it.

<a name="configuration"></a>

## Configuration reference

The `email` section:

| Field | Default | Meaning |
|---|---|---|
| `mode` | (required) | `webhook` or `imap` |
| `domain` | none | The domain of per-player addresses `<box>+p-<16 hex>@<domain>`; without it, tags are not read |
| `maxBytes` | 262 144 (256 KB) | The largest raw message read; never more than 4 MB whatever it says |
| `linkDays` | 30 | How long a sender who sent a pairing code stays linked to its player, in memory |
| `webhook.port`, `webhook.host` | —, `127.0.0.1` | Where `POST /v1/inbound` listens |
| `webhook.secretFile` | (required) | The HMAC secret's file |
| `webhook.toleranceS` | 300 | How far the timestamp may be from now, in seconds |
| `webhook.perMinutePerIp` | 120 | Posts a minute per address |
| `imap.host`, `imap.port` | —, 993 | The mailbox's server, over TLS |
| `imap.user`, `imap.passwordFile` | (required) | Its login |
| `imap.mailbox` | `INBOX` | The folder polled |
| `imap.tls` | `true` | `false` only towards this machine |
| `imap.pollS` | 60 | Seconds between two polls (at most 50 unseen messages each) |
| `imap.keepDays` | 0 | 0: delete once accepted; N: keep N days |

<a name="reading"></a>

## How a message is read

- In a worker thread with a 64 MB heap and 2 seconds; at most 256 KB, 3 levels of multipart, 64 parts, 200 headers;
  HTML becomes inert text; a message with an attachment is refused; a message without a `Message-ID` is refused.
- The player is the recipient's tag (`gate+p-…@<domain>`, with `domain` set) or the sender who sent a pairing code
  (subject `PAIR ABCD2345`, `LINK …`, `CODE …` or the code alone).
- The first answer whose words all appear in the subject or the text (whole words, any case) proposes its signal,
  else `otherwise`.
- The key is `sha256('email:' + Message-ID)`: a message delivered twice is one signal. The payload is a hash of the
  `Message-ID` and the answer's number, hashed again as `evidenceHash`.
- No reply is sent.

<a name="privacy"></a>

## What it keeps

- **Webhook mode:** nothing; the message is read in memory and dropped.
- **IMAP mode:** the message stays in the operator's mailbox, where it arrived, until `keepDays` deletes it; a refused
  one stays flagged until the operator deletes it.
- A sender who sent a pairing code is remembered as a salted SHA-256 of their address (the salt is random and lives
  as long as the process) mapped to the `playerId`, in memory, for `linkDays`; a restart forgets it.
- The address, the subject and the text are never logged and never sent to the Bridge.

<a name="references"></a>

## References

- The code: [`connectors/src/email/connector.ts`](../../connectors/src/email/connector.ts),
  [`imap.ts`](../../connectors/src/email/imap.ts), [`mime.ts`](../../connectors/src/email/mime.ts).
- The threat model: [`docs/dev/threat-models/email.md`](../../docs/dev/threat-models/email.md).
- Tested by [`tests/connectors-email.test.ts`](../../tests/connectors-email.test.ts).
