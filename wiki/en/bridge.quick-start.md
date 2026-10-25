# Quick start

In about fifteen minutes, on your own machine, you make the sample game `signals` react to the world outside: first
with the Studio's simulated Bridge, then with a real Bridge on `127.0.0.1`, a signal sent through its demonstration
webhook, and the same signal sent twice. Nothing leaves your machine.

<a name="what-you-will-build"></a>

## What you will build

The sample game `games/signals` opens with a garden, a closed gate and an old radio on a bench. At the end of this
tutorial:

- a local Bridge serves the game on `http://127.0.0.1:8787/`;
- the game, played on `http://127.0.0.1:5173/`, is linked to it (pause menu, **World link**);
- a signal `mail.answer.correct`, sent through the Bridge, opens the gate; sent again, it is answered `duplicate` and
  changes nothing.

<a name="what-you-need"></a>

## What you need

- The engine repository, installed (`npm ci` done): [Install from the repository](install.from-repository.md). Node
  22.12 or newer ([Requirements](install.requirements.md)).
- Two free ports, 8787 (the Bridge) and 5173 (the game), and `curl`.
- Three terminals, all in the engine repository's folder.

<a name="studio"></a>

## Try it in the Studio first

<!-- step: studio -->
1. Start the Studio on the sample game:

   ```sh
   # in the engine repository
   GAME=signals npm run studio
   ```

   The Play tab shows a **Reality** panel, because the game declares `reality`: a button per signal, faults to add (a
   delay, a duplicate, a bad signature, an expiry), the queue reversed, the connection cut and resumed, and what
   happened to each delivery. Press the button of `mail.answer.correct`: the gate opens.

   It is a simulated Bridge with a development key, running in the page: the signal goes through the same
   verification, session, save and deduplication as a real one. Stop the Studio (Ctrl-C) before going on.

<a name="steps"></a>

## Steps with a real Bridge

<!-- step: init -->
1. Create the Bridge's keys and configuration for the game:

   ```sh
   # in the engine repository
   GAME=signals npm run bridge -- init
   ```

   You see `✔  …/.cache/bridge/config.json (keys, webhook secrets and tokens; mode 600), …/root.key (the root key:
   grant only) and …/admin-token`, then the list of demonstration webhooks, one per source of the game's signals:
   `/v1/hooks/badge, /v1/hooks/webhook, /v1/hooks/email, /v1/hooks/mail, /v1/hooks/terminal`. The defaults suit this
   tutorial: the game's origins `http://127.0.0.1:5173` and `http://localhost:5173`, the journal as the store.

<!-- step: serve -->
2. Start it, in a first terminal:

   ```sh
   # in the engine repository, terminal 1
   GAME=signals npm run bridge -- serve
   ```

   It prints one JSON line, `{"event":"bridge.listening","url":"http://127.0.0.1:8787/","game":"signals",…}`, and
   keeps running. Every later event (a pairing, a signal) is one more line here.

<!-- step: play -->
3. Start the game, in a second terminal, and open `http://127.0.0.1:5173/`:

   ```sh
   # in the engine repository, terminal 2
   GAME=signals npm run dev
   ```

   The game's `reality.bridge` is already `http://127.0.0.1:8787/` (`games/signals/game.ts`).

<!-- step: link -->
4. Link the game. Open the pause menu, row **World link**, and choose "Link this game": the game shows an 8-character
   code (letters and digits, without 0, O, 1, I or L). It waits for a connector to confirm it.

<!-- step: confirm -->
5. Confirm the code as a connector would, in a third terminal. The demonstration webhook of the source `mail` has a
   token that may confirm pairings; replace `ABCD2345` with your code:

   ```sh
   # in the engine repository, terminal 3
   TOKEN=$(node -p 'require("./.cache/bridge/config.json").webhooks.mail.token')
   curl -s -X POST http://127.0.0.1:8787/v1/pairings/ABCD2345/confirm -H "Authorization: Bearer $TOKEN"
   ```

   The answer is `{"playerId":"p-…"}`: 16 hexadecimal digits, a pseudonymous id the Bridge made up. Terminal 1 logs
   `"event":"pairing.confirmed"`. The game asks the Bridge every two seconds whether its code was confirmed: it
   collects its link by itself and says it is linked. Note the `playerId` for the next step.

<!-- step: send -->
6. Send the signal through the demonstration webhook. A webhook request is signed with an HMAC-SHA256 of its body
   under the webhook's secret; this one-liner reads the secret from the configuration and signs. Replace the `p-…`:

   ```sh
   # in the engine repository, terminal 3
   node -e '
   const { createHmac } = require("node:crypto");
   const [playerId] = process.argv.slice(1);
   const { secret } = require("./.cache/bridge/config.json").webhooks.mail;
   const body = JSON.stringify({ playerId, event: "answer.correct", id: "try-1" });
   const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
   fetch("http://127.0.0.1:8787/v1/hooks/mail", { method: "POST", body,
     headers: { "Content-Type": "application/json", "X-Web-Scumm-Signature": signature } })
     .then(async (r) => console.log(r.status, await r.text()));
   ' p-0123456789abcdef
   ```

   It prints `202 {"id":"s-…","sequence":1,"duplicate":false}`. In the game, the gate opens. The event `answer.correct`
   of the webhook `mail` is the signal `mail.answer.correct`; `id` names this delivery.

<!-- step: send-again -->
7. Run the same command again. It prints `200 {"id":"s-…","sequence":1,"duplicate":true}`: the same id, the same
   sequence. The Bridge kept the first one; the game changes nothing.

<!-- step: stop -->
8. Stop the Bridge and the game with Ctrl-C in their terminals. The Bridge says `"event":"bridge.stopping"` and exits.

> [!LIMIT id=bridge-quick-start-local]
> This tutorial runs on one machine, over plain HTTP, with demonstration webhooks that may send any signal of their
> source for any player for 30 days. That is for development only: on the Internet the Bridge runs behind HTTPS,
> with `init --no-demo-webhooks` and one narrow `grant` per connector ([Install and run the Bridge](bridge.install-run.md)).

<a name="player"></a>

## In the player's hands

What you just did by hand is what a connector does for a player. On the player's side:

- The pause menu's **World link** row offers "Link this game", which shows the 8-character code the player gives to
  the game's connector: answer the email with it, type it at the terminal's prompt, post it with a badge, enter it in
  a webhook's form. The code waits ten minutes. Once a connector confirms it, the game is linked.
- The link is announced politely, never over a line being said. Signals that arrive while the game is busy (a
  dialogue, a cutscene, a minigame) wait for it. Offline, the game plays on; back online, what arrived meanwhile is
  applied.
- The browser keeps the Bridge's URL, the pseudonymous player id and a capability that can only read and acknowledge
  this game's signals, under `<game>:reality-link` in `localStorage`. They are never written into a save or a session.
  A new game on the same device keeps the link. "Unlink" in the same menu revokes the link on the Bridge, not only on
  the device.
- The interface texts are `realityLink`, `realityStart`, `realityCode`, `realityWaiting`, `realityOpen`,
  `realityOffline`, `realityRevoked`, `realityNone`, `realitySimulated`, `realityUnlink`, `realityMismatch` and
  `realityRelink`, in the game's `ui`; the English defaults are in `src/engine/dom/reality-ui.ts`
  ([Translations](create.translations.md)).
- The player verifies each signal with the Bridge's keys, each within its window, and a signal's expiry, with five
  minutes of tolerance for the device's clock (`CLOCK_SKEW_MS` in `src/engine/reality/protocol.ts`, the same in the
  Rust cross-check). When a signal names a key the keyring does not hold (the Bridge rotated while the link was open),
  the client asks for the keys once before refusing it.
- A `WorldSignalV2` (ADR 0010) names the tenant, the environment, the origin the player paired from, the link and the
  key it was signed for, and the player refuses one signed for another context (`audience-mismatch`), the page's
  origin checked by default. A Bridge serving several tenants signs V2 only; a single-tenant Bridge signs V1 unless
  its configuration says `signalVersion: 2` (`init --signal-version=2`), and the player accepts both
  ([Security](bridge.security.md#signatures)).

What the save keeps, and what happens when a save meets another player's link:
[Guarantees](bridge.guarantees.md#session-and-save).

<a name="sample-chapter"></a>

## Going further: the sample chapter

`games/signals` has a chapter, "the mailbox and the terminal", played with the real connectors. Link the game (pause
menu, World link), then:

- write to the gate with "open the door" in the subject or the text, and the shed's door opens (the email
  connector);
- type `lamp on` at the shed's terminal, over Telnet or SSH, and a lamp glows in the garden;
- show a badge from the garden guild, and a ribbon lands on the bucket (the Open Badges connector).

None of it is needed to finish the game: the radio on the bench still opens the gate. The Telnet terminal is the
quickest to try locally. With the Bridge of step 2 running:

```sh
# in the engine repository, terminal 3
GAME=signals npm run bridge -- grant --connector=shed-telnet --source=terminal --signals=terminal.lamp --pair > .cache/bridge/telnet.token
cat > .cache/bridge/telnet.json <<'EOF'
{
  "bridge": { "url": "http://127.0.0.1:8787/", "tokenFile": "telnet.token" },
  "gameId": "signals",
  "health": { "port": 9301 },
  "telnet": { "port": 2323 }
}
EOF
npm run connector -- telnet --config .cache/bridge/telnet.json
```

Then, from a fourth terminal, `nc 127.0.0.1 2323` (or `telnet 127.0.0.1 2323`): the shed's banner asks for the
pairing code your game shows; type it, then `lamp on`. The terminal answers "Click. Somewhere in the garden, a lamp
glows." Each connector is described on its own page: [Telnet](bridge.connector-telnet.md),
[SSH](bridge.connector-ssh.md), [email](bridge.connector-email.md), [Open Badges](bridge.connector-open-badges.md).

<a name="what-you-learned"></a>

## What you learned

- A signal is a declared identifier, sent by a connector and signed by the Bridge:
  [The Reality Bridge: what it is](bridge.what-it-is.md).
- Pairing links one game on one device to a pseudonymous player; the game keeps a capability that reads its own
  signals only: [Security](bridge.security.md).
- A signal sent twice is accepted once: [Guarantees](bridge.guarantees.md#duplicates).

<a name="next"></a>

## Where to go next

- Declare your own game's signals: [Signals and the manifest](bridge.signals-manifest.md).
- Run a Bridge for real players: [Install and run the Bridge](bridge.install-run.md).
- When something goes wrong: [Bridge and connector troubleshooting](bridge.troubleshooting.md).
