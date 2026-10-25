# Telnet connector

The Telnet connector opens a small virtual terminal on a TCP port: a player connects, types the pairing code their
game shows, then the commands the game declares (`lamp on`), and each declared command proposes its signal. Nothing
typed is ever run: there is no shell behind it. It is experimental, like every connector ([Connectors overview](bridge.connectors.md)).

<a name="what-you-get"></a>

## What you get

A `quest-n-click-connector telnet` process listening on a port, printing the game's banner and prompt, answering the
commands of `reality.connectors.telnet`, and proposing their signals for the player who linked the session.

<a name="context-and-versions"></a>

## Context and versions

- A connector beside a running Bridge, from 4.1.9; this page applies from 4.2.5 (the `quest-n-click-connector` name).
- **Verified on:** the steps were run on 23 October 2026 against a local Bridge of the game `signals` (macOS, Node
  22.14, engine 4.4.0, `nc` as the client): the banner, `Linked. Resume word, for 30 minutes: R…`, then `lamp on`
  answered "Click. Somewhere in the garden, a lamp glows." and accepted by the Bridge.

> [!LIMIT id=bridge-telnet-clear-text]
> Telnet is clear text: the pairing code and every line cross the network as typed. Keep it on a local network,
> behind a VPN or TLS (stunnel), or prefer [SSH](bridge.connector-ssh.md).

<a name="prerequisites"></a>

## Prerequisites

- A running Bridge ([Install and run the Bridge](bridge.install-run.md)) and a game whose `reality.connectors.telnet`
  declares its commands ([Signals and the manifest](bridge.signals-manifest.md#reality-connectors)):

  ```ts
  telnet: { banner: 'GARDEN SHED TERMINAL.', prompt: 'shed> ', commands: [{ says: 'lamp on', reply: 'Click.', signal: 'terminal.lamp' }] }
  ```

<a name="where-to-run"></a>

## Where to run the commands

`grant` where the Bridge's folder is; the connector on the machine players connect to, in a folder holding its
configuration and token. `npm run connector -- telnet …` in the engine repository, `npx quest-n-click-connector
telnet …` with the package.

<a name="steps"></a>

## Steps

<!-- step: grant -->
1. Grant the connector its token, for the terminal's signals only, with pairing:

   ```sh
   # in the engine repository (the Bridge's folder is .cache/bridge)
   npm run bridge -- grant --connector=shed-telnet --source=terminal --signals=terminal.lamp --pair > telnet.token
   ```

<!-- step: config -->
2. Write its configuration, `telnet.json`:

   ```json
   {
     "bridge": { "url": "http://127.0.0.1:8787/", "tokenFile": "telnet.token" },
     "gameId": "signals",
     "limits": { "maxBytes": 4096, "maxPerMinute": 60, "timeoutMs": 5000 },
     "health": { "port": 9301 },
     "telnet": { "port": 2323 }
   }
   ```

<!-- step: run -->
3. Start it:

   ```sh
   # in the engine repository
   npm run connector -- telnet --config telnet.json
   ```

   It logs `{"event":"telnet.started","connector":"telnet","port":2323}`.

<!-- step: connect -->
4. Connect as a player would, type the code the game shows, then a declared command:

   ```sh
   # on a machine that reaches the port
   nc 127.0.0.1 2323
   ```

   The terminal prints the banner, asks for the pairing code, answers `Linked. Resume word, for 30 minutes:
   RABCD-EFGH`, then `Type help to see what this terminal knows.` and the prompt. `lamp on` prints the command's reply
   and proposes `terminal.lamp`.

<a name="expected-result"></a>

## Expected result, and how to check it

- `GET http://127.0.0.1:9301/health` answers 200 `{"connector":"telnet","ok":true,"detail":"<n> session(s) on port
  2323",…}`; `GET /metrics` gives `proposed`, `accepted`, `duplicates`, `refused`, `rejectedInputs`, `retries`.
- The Bridge logs `"event":"pairing.confirmed"`, then `"event":"signal.accepted"` with `terminal.lamp`.

<a name="common-errors"></a>

## Common errors

| What the terminal says | Cause | Fix |
|---|---|---|
| `That code does not work. Try again.`, then `Too many wrong codes. Goodbye.` | A wrong or expired code, three times on one connection | A new code from the game's World link |
| The connection is refused at once | Six wrong codes from that address in ten minutes, across reconnections; or 3 connections already open from it, or 20 in all | Wait; close idle sessions |
| `Unknown command. Type help.` | Not a declared command (matched whole, lower case) | `help` lists them |
| `(the world did not answer: <code>)` | The Bridge refused the proposal (`denied`, `player`, `bridge-quota`, `unreachable`…) | Read the connector's and the Bridge's logs |
| The connection closes after a minute | No complete line for a minute, or not linked within 20 seconds | Type the code at once |
| `Slow down.` / `Line too long (512 bytes at most).` | Over 100 lines a minute / a line over 512 bytes | Type less, shorter |

<a name="files-changed"></a>

## Files or data changed

None on disk. Resume words live in memory for 30 minutes; nothing typed is stored.

<a name="recovery"></a>

## Recovery or going back

Stop the process (SIGTERM: it reads nothing more, drains, exits 0). If its token leaked, revoke it on the Bridge
(`revoke --token=<revocation id>`) and grant a new one.

<a name="behaviour"></a>

## Reference: what the terminal does

- `telnet: { "port": 2323, "host": "127.0.0.1", "limits": { … } }`: `host` defaults to `127.0.0.1`; `limits` overrides
  the terminal's limits below, by name.
- A TCP server that refuses every Telnet option and filters the protocol's bytes.
- The player types the pairing code (or the resume word printed at a previous pairing), then the commands the game
  declares. `help`, `clear` and `exit` (or `quit`) are the terminal's own.
- Each line typed is a new fact: its key is `sha256('telnet:' + session + ':' + line number)`. A command typed twice
  proposes its signal twice; the game's `once` decides whether it acts twice.

| Limit (`limits` name) | Default |
|---|---|
| A line (`maxLine`) | 512 bytes; a longer one is refused whole, `Line too long (512 bytes at most).` |
| Lines (`linesPerMinute`) | 100 a minute; beyond, `Slow down.` and the line is dropped |
| Input (`bytesPerSecond`) | 64 KB a second received; beyond, the connection is closed |
| Time to link (`pairMs`) | 20 seconds |
| Time between lines (`idleMs`) | 1 minute |
| A session (`sessionMs`) | 30 minutes |
| Connections per address (`perAddress`) / in all (`maxConnections`) | 3 / 20 |
| Wrong codes per address (`triesPerAddress` in `triesWindowMs`) | 6 in 10 minutes, across reconnections |

> [!GUARANTEE id=bridge-telnet-address-limits]
> One address holds three connections at most, and its wrong codes are counted across reconnections; an unlinked
> connection is closed.

<a name="privacy"></a>

## What it keeps

Nothing typed is stored: a line is matched against the game's commands and forgotten; the Bridge receives only the
signal's name. A resume word links a later session to the same player for 30 minutes, in memory. The client's address
is used by the operating system for the connection, and counted in memory for the limits; the connector keeps no list
of them.

<a name="references"></a>

## References

- The code: [`connectors/src/telnet/connector.ts`](../../connectors/src/telnet/connector.ts),
  [`connectors/src/terminal/`](../../connectors/src/terminal/guard.ts) (limits, lines, the virtual shell).
- The threat model: [`docs/dev/threat-models/telnet.md`](../../docs/dev/threat-models/telnet.md).
- Tested by [`tests/connectors-terminal.test.ts`](../../tests/connectors-terminal.test.ts): floods, slow clients, a
  thousand connections.

