# Privacy

What a quest'n'click game, its Reality Bridge and its connectors keep about a player, where, for how long, and how to
delete it. True from 4.1.16 (speedrun runs kept in the Bridge's SQL store); the rest says since when.

<a name="overview"></a>

## Who answers for what

The software keeps little, and this page says exactly what, so that whoever runs a game can tell its players. The
**operator** who runs a Bridge and its connectors is the one who answers for that data to the players. The site that
serves a game (GitHub Pages, Clever Cloud, any host) has its own server logs, which are the host's, not the engine's.

A game **without** Reality (`reality` in its content), Remix daily or mystery worlds, or online leaderboards keeps
nothing beyond the player's own device: the engine has no analytics, no tracking and no account, and it fetches only
its own files from the site that serves it.

<a name="device"></a>

## On the player's device

- **The save and the sessions** live in the browser's storage (IndexedDB `web-scumm-saves`; local storage when
  IndexedDB is unavailable), on the device only.
- **Settings and the chosen language** live in local storage (`<game>.settings`, `<game>.lang`).
- **Speedrun records** live in IndexedDB (`web-scumm-runs`).
- **The game's files** live in the browser's cache, for offline play.
- **With a world link** (a Reality game), the save also holds the pseudonymous `playerId` the Bridge gave (`p-` and
  16 hexadecimal digits, derived from nothing about the person), the delivery cursor and the ids of the signals
  applied: never an email, a token, a message or a badge. The capability that reads the player's signals is kept in
  local storage (`<game>:reality-link`).

**Deleting:** the pause menu's **Unlink this game** (the default label) revokes the link on the Bridge; clearing the site's data in the browser
removes the rest (Restart erases only the autosave, not the slots or the records).

> [!LIMIT id=device-storage-browser-rules]
> The browser decides how long site data lives: clearing site data, a private window, a device short of space, or,
> in a Safari tab (not a game added to the Home Screen), seven days of Safari use without a visit ([WebKit](https://webkit.org/tracking-prevention/)) erases saves
> and records along with everything else.

<a name="bridge"></a>

## On the Bridge

A Bridge (a game's Reality server) keeps, per player: the `playerId`, the SHA-256 of their capability, its expiry;
per signal: its id, sequence, name, source, the connector's deduplication key (a SHA-256 for the bundled connectors),
the hash of what the connector saw (`evidenceHash`), the signed envelope, the signal's payload as accepted (to sign it
again after a key rotation), and the times. Never a token or an email. A pairing code lives ten minutes by default.
The Bridge's log is JSON lines that name events and pseudonymous ids, with no secret.

Where it is kept depends on the store the operator chose:

| Store | Where | How long |
|---|---|---|
| SQLite (`local` profile, the default of `npm run bridge`) | one file, mode 0600 | Every signal is kept: a SQL store has no retention yet |
| Postgres (`distributed` profile, experimental) | the operator's database | The same: no retention yet |
| The JSON-lines journal (a configuration written before 4.1.10) | `journal.jsonl` beside the Bridge's configuration | Until `compact --retention-days=<N>` (90 by default) drops acknowledged signals older than N days; a player's last signal stays |

A Bridge backup holds the same data as the store it was taken from.

<a name="runs"></a>

## Speedrun leaderboards

A Bridge with leaderboards keeps each submitted run in its SQL store: the game, the category, the run's seed and
inputs, the verdict, and a **pseudonym** (2 to 32 letters, digits, spaces, `_ . -`; an email is refused). Pseudonyms
are not authenticated, and the Bridge knows no identity behind them. The run's envelope is dropped once its verdict is
stored. A leaderboard keeps a run 90 days by default (`retentionDays`), and deletes it on request with the token
given at submission (`DELETE /v1/runs/<id>` with `x-delete-token`). Rate limiting keys a client by an HMAC of its
address, never the address. Daily and mystery world tokens are kept in the same store for `retentionDays` (30 by
default).

<a name="connectors"></a>

## Connectors

What leaves any connector for the Bridge: the signal's name, the player, the source, the deduplication key, the time,
and the SHA-256 of the connector's payload (`evidenceHash`); never the payload, the message, the line or the badge.

- **Email, webhook mode**: the message is read in memory and dropped; nothing is written.
- **Email, IMAP mode**: the message stays in the operator's mailbox, where it arrived. With `keepDays: 0` (the default)
  it is deleted as soon as its signal is accepted (or found already accepted); with `keepDays: N`, after N days. A
  refused message is flagged and kept for the operator, who deletes it. A sender who sent a pairing code is remembered
  as a salted SHA-256 of their address (the salt is random and lives as long as the process) mapped to the
  `playerId`, in memory, for `linkDays` (30 by default); a restart forgets it. The address, the subject and the text
  are never logged and never sent to the Bridge (only a hash of the Message-ID and the answer's number, hashed again
  as `evidenceHash`). No reply is sent.
- **Telnet and SSH**: nothing typed is stored; a line is matched against the game's commands and forgotten, and the
  Bridge receives only the signal's name. A resume word links a later session to the same player for 30 minutes, in
  memory. The public keys an operator declares for players (`ssh.keys`) stay in the connector's configuration until
  the operator removes them. The client's address is used for the connection only; the connector keeps no list of
  them.
- **Open Badges**: the badge and the documents it points to are fetched, checked and dropped; only a verdict leaves
  the connector, with a hash of the badge's id and issuer as `evidenceHash`. The email a player gives to match a hashed
  recipient is hashed with the badge's salt for the comparison, then dropped: never stored, logged or sent.
  Revocation and status lists (an issuer's, not a person's) are cached for at most a day. The addresses that post to
  the form are counted in memory for a minute (the rate limit), then forgotten.

Each connector's own page says how to run it: [Email](bridge.connector-email.md),
[Telnet](bridge.connector-telnet.md), [SSH](bridge.connector-ssh.md),
[Open Badges](bridge.connector-open-badges.md).

<a name="logs"></a>

## Logs and metrics

Every connector logs JSON lines of events, identifiers (`playerId`, signal names, refusal codes) and counts. A string
that looks like content (a space, an `@`, a slash) is written `[redacted]`; the tests check that no fixture's address,
text or secret reaches a log. Metrics (`/metrics`) are counters in memory. How long logs live is the operator's
rotation; they hold no content to delete, and a `playerId` in them is pseudonymous.

<a name="deleting"></a>

## Deleting a player's data, everywhere

1. **On the Bridge**: `GET /v1/admin/players/<id>` (with the operator's token) exports everything held about the
   player; `DELETE /v1/admin/players/<id>` removes it (the link, the signals, the acknowledgements) and ends the
   player's live streams. A whole tenant: `tenant export` and `tenant delete --yes` ([the Bridge's CLI](bridge.cli.md)).
2. **In an IMAP mailbox**: delete the player's flagged messages, if any (accepted ones are already gone with
   `keepDays: 0`).
3. **In the SSH configuration**: remove the player's declared key, if any, and restart the connector.
4. **In memory** (sender links, resume words): restarting the connectors forgets them all.
5. **A leaderboard run**: deleted with its deletion token; otherwise it goes after `retentionDays`.
6. **On the device**: the player erases the save or the site's data.

> [!LIMIT id=backups-keep-deleted]
> Deleting a player removes them from the live store, not from backups taken before: how long backups live is the
> operator's choice.

<a name="references"></a>

## References

- [The Reality Bridge: what it is](bridge.what-it-is.md), [Guarantees](bridge.guarantees.md),
  [Install and run the Bridge](bridge.install-run.md#retention).
- [Saves](play.saves.md), [Speedrun for players](play.speedrun.md).
- The code: [`bridge/src/server.ts`](../../bridge/src/server.ts) (the admin routes),
  [`bridge/src/cli-store.ts`](../../bridge/src/cli-store.ts) (`compact`, `tenant`),
  [`src/engine/dom/reality-ui.ts`](../../src/engine/dom/reality-ui.ts) (the link on the device).
